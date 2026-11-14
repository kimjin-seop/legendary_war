<?php

namespace App\Services;

use App\Support\FacingFlag;

use App\Game\ArmyBuilder;
use App\Game\BattleStory;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\IllegalAction;
use App\Models\Battle;
use App\Models\User;
use App\Support\DailyCounter;
use Illuminate\Support\Facades\DB;

/**
 * 전투 생명주기: deployment -> in_progress -> finished.
 * 서버가 턴 소유와 모든 행동을 검증하고, 행동 처리는 DB 트랜잭션 + battles.version 낙관적 락으로 직렬화한다.
 */
class BattleService
{
    public function __construct(private readonly GameData $data, private readonly ProgressionService $progress)
    {
    }

    private ?array $presetCache = null;

    /** cue spawn 의 영웅 행 조회기를 등록(요청당 1회). 영웅 코드 -> heroById 행 */
    private function registerCueHeroResolver(): void
    {
        \App\Game\Cues::setHeroResolver(function (string $code) {
            $hid = $this->data->heroes()[$code]['id'] ?? null;

            return $hid !== null ? $this->data->heroById((int) $hid) : null;
        });
    }

    private function engine(): Engine
    {
        $this->registerCueHeroResolver();

        return $this->data->engine();
    }

    /** 소유자 검증 포함 조회 (타인 전투는 404로 존재 은닉: IDOR 방지) */
    public function findOwned(User $user, int $id): Battle
    {
        $b = Battle::where('id', $id)->where('user_id', $user->id)->whereNull('room_id')->first();
        if (! $b) {
            throw new IllegalAction('battle_not_found', '전투를 찾을 수 없습니다.', 404);
        }

        return $b;
    }

    /** @param \Illuminate\Support\Collection|null $progress user_stage_progress를 stage_id로 keyBy한 컬렉션(목록 조회 시 N+1 방지) */
    public function stageUnlocked(User $user, object $stage, ?\Illuminate\Support\Collection $progress = null): bool
    {
        if ((int) ($stage->chapter ?? 0) === HiddenChapterService::chapter() && ! app(HiddenChapterService::class)->unlocked($user)) {
            return false;   // 숨은 종장: 지정 집합 전부 클리어 전에는 선행 스테이지 유무와 무관하게 잠김
        }
        if ($stage->prerequisite_stage_id === null) {
            return true;
        }
        if ($progress !== null) {
            return (int) ($progress[$stage->prerequisite_stage_id]->clear_count ?? 0) > 0;
        }

        return DB::table('user_stage_progress')->where(['user_id' => $user->id, 'stage_id' => $stage->prerequisite_stage_id])->where('clear_count', '>', 0)->exists();
    }

    /** 스테이지 도전: deployment 상태 전투 생성, 적 배치는 서버가 확정(공개 정보) */
    public function startStage(User $user, int $stageId): Battle
    {
        $stage = DB::table('stages')->where('id', $stageId)->first();
        if (! $stage) {
            throw new IllegalAction('stage_not_found', '스테이지를 찾을 수 없습니다.', 404);
        }
        if (! $this->stageUnlocked($user, $stage)) {
            throw new IllegalAction('stage_locked', '선행 스테이지를 먼저 클리어해야 합니다.', 403);
        }
        if ($this->wantsProtagonist($stage) && $this->protagonistOf($user) === null) {
            app(ProtagonistService::class)->ensureDefault($user);   // 첫 캠페인 진입 소급: 주인공 미생성 계정에 기본 원형 자동 지급(이후 재검사로 변경 가능)
        }
        $this->assertStageHeroes($user, $stage);

        return DB::transaction(function () use ($user, $stageId, $stage) {
            $this->limitOpenStageBattles($user);

            return $this->createStageBattle($user, $stageId, $stage);
        });
    }

    /** 진행 중(deployment/in_progress) 스테이지 전투 상한: 초과분은 가장 오래된 것부터 abandoned(보상 없음) 처리 */
    private function limitOpenStageBattles(User $user): void
    {
        $max = max(1, (int) config('game.max_open_stage_battles'));
        $ids = DB::table('battles')->where(['user_id' => $user->id, 'mode' => 'stage'])->whereNull('room_id')
            ->whereIn('status', ['deployment', 'in_progress'])->orderBy('id')->pluck('id')->all();
        // 새 전투 1건이 추가되므로 (상한-1)건만 남긴다.
        foreach (array_slice($ids, 0, max(0, count($ids) - ($max - 1))) as $id) {
            $this->abandon($user, (int) $id);
        }
    }

    private function createStageBattle(User $user, int $stageId, object $stage): Battle
    {
        $map = $this->data->map((int) $stage->map_id);
        $preset = $this->data->preset((int) $stage->enemy_preset_id);
        $seed = random_int(1, 2147483647);
        // 목표: survive_turns면 max_turns = max(기본, N+5)(판정은 survive 우선이라 상한은 안전망). 목표는 state에 고정 -> 진행 중 전투는 스테이지 데이터 변경에 불변. defeat_commander/컬럼 없음은 기록하지 않음(기존 동작)
        $objective = Engine::resolveObjective(json_decode((string) ($stage->objective ?? ''), true), $map['meta'] ?? []);   // capture.points 'map' -> 맵 meta.objective_points
        $maxTurns = max((int) config('game.max_turns'), ($objective['type'] ?? null) === 'survive_turns' ? $objective['turns'] + 5 : 0);
        // 스테이지 단위 규칙 오버라이드(stages.rules, 없으면 기존 동작): 맵 rules 위에 덮고(해당 스테이지 전투 state에만 기록 -> 맵 공유/PvP 불변), max_turns는 스테이지별 상한
        $stageRules = Engine::sanitizeStageRules(json_decode((string) ($stage->rules ?? ''), true) ?: null);
        $stageRules['max_turns'] !== null && $maxTurns = max($stageRules['max_turns'], ($objective['type'] ?? null) === 'survive_turns' ? $objective['turns'] + 5 : 0);
        $state = ArmyBuilder::initialState($this->data->rules(), $map, $seed, $maxTurns, config('game.first_side'), FacingFlag::forUser($user->id), \App\Support\SquadFlag::forUser($user->id), \App\Support\AlternateFlag::forUser($user->id), $this->engine()->options()['snowball'], $this->engine()->mpKnobs(), $this->engine()->microModeFor('stage', [$stage->code ?? null, $stageId]));
        $state['frozen'] = $this->engine()->frozenOpts();   // 아군 통과/총병 규칙은 생성 시 고정(진행 중 전투는 config 변경 영향 없음)
        \App\Game\BattleItems::enabled() && $state['items'] = ['left' => \App\Game\BattleItems::maxPerBattle()];   // 스테이지 전투만 소모품 사용 가능(방·랭크·전쟁 전투는 키 없음 = 거부)
        $objective && $state['objective'] = $objective;
        ($tt = \App\Game\EventConditions::normalizeTileTags($map['meta']['tile_tags'] ?? null, (int) $state['width'], (int) $state['height'])) !== [] && $state['tile_tags'] = $tt;   // 맵 meta.tile_tags(태그->칸 목록): unit_enter_tile 트리거용(없으면 state 불변)
        $stageRules['rules'] !== [] && $state['rules'] = $stageRules['rules'] + ($state['rules'] ?? []);
        \App\Game\Cues::initialize($state, (json_decode((string) ($stage->rules ?? ''), true) ?: [])['cues'] ?? null);   // 연출 cue(없으면 state 불변)
        \App\Game\SubObjectives::initialize($state, (json_decode((string) ($stage->rules ?? ''), true) ?: [])['sub_objectives'] ?? null);   // 서브 목표(없으면 state 불변)
        \App\Game\StageRules::initialize($state, json_decode((string) ($stage->rules ?? ''), true) ?: []);   // 승패 규칙 win_mode/win_conditions/lose_conditions(없으면 state 불변)
        if (! empty($state['cues'])) {   // cue spawn 용: 병사 성장률 고정 + 영웅 행 조회기(Game 계층은 DB 미사용)
            $state['troop_growth'] = (float) config('game.troop_growth_pct');
        }
        if (($ds = $this->liveSlots($stage)) !== null) {   // 배치 슬롯(stages.rules.deploy_slots): 전투 생성 시 state 에 고정 -> 진행 중 전투는 이후 스테이지 데이터 변경에 불변(없으면 레거시 검증)
            $zoneKeys = array_map(fn ($c) => "{$c[0]},{$c[1]}", $map['deploy_zones']['a']);
            $bad = array_filter(array_merge($ds['fixed'], $ds['free']), fn ($sl) => ! in_array("{$sl['x']},{$sl['y']}", $zoneKeys, true));
            if ($bad === []) {
                $state['deploy_slots'] = $ds;
            } else {
                \Illuminate\Support\Facades\Log::warning('deploy_slots: 배치 영역 밖 슬롯 -> 슬롯 모드 비활성(현행 편성)', ['stage' => $stage->code ?? null, 'slots' => array_column($bad, 'id')]);
            }
        }
        $state['campaign'] = true;   // 스테이지(캠페인) 전투 표식: 아군 편성 상한이 game.max_units_per_side_stage(PvP 12와 분리). 표식 없는 구 전투/방 전투는 12
        [$lvl, $growth] = $this->populateStageEnemy($state, $stage, $map, $preset);   // 적 지휘관/부대/추가 부대 생성(미리보기·감사와 공용)
        $rules = $this->data->rules();
        if (\App\Game\Engine::squadOn($state)) {   // squad on: 스테이지 적 부대는 적 지휘관(b0) 소속
            foreach ($state['units'] as $uid => $u) {
                if ($u['side'] === 'b' && ! array_key_exists('leader_id', $u)) {   // addGenericSide가 이미 부대별 leader_id를 지정한 경우 유지
                    $state['units'][$uid]['leader_id'] = $u['kind'] === 'troop' ? 'b0' : null;
                }
            }
        }
        // 스테이지 적은 addSide()를 거치지 않으므로 방향 시스템 on일 때 초기 facing도 여기서 지정한다.
        if (($f = ArmyBuilder::initialFacing($state, $map['deploy_zones']['b'])) !== null) {
            foreach ($state['units'] as $uid => $u) {
                if ($u['side'] === 'b') {
                    $state['units'][$uid]['facing'] = $f;
                }
            }
        }
        // 스테이지 적은 addSide()를 거치지 않으므로 초기 HP 합(턴 상한 비율 판정용)을 여기서 기록한다(추가 부대 포함).
        $state['init_hp']['b'] = array_sum(array_column(array_filter($state['units'], fn ($u) => $u['side'] === 'b'), 'max_hp'));
        \App\Game\Cues::bindUnitPlaceholders($state);   // cue move/retreat 의 'UNIT@x,y' 자리표시 -> 그 칸에서 시작한 적 유닛 id (cues 없으면 무동작)
        // 증원 트리거(stage.triggers, turn spawn): 전투 생성 시 state에 고정 -> 진행 중 전투는 이후 스테이지/맵 데이터 변경에 불변
        $trig = Engine::normalizeTriggers(json_decode((string) ($stage->triggers ?? ''), true) ?: [], $map['meta']['enemy_extra_zones'] ?? [], $lvl, $growth, array_keys($rules->unitTypes));
        if ($trig !== []) {
            $state['triggers'] = $trig;
            $state['spawn_seq'] = ['b' => max(array_map(fn ($id) => (int) substr((string) $id, 1), array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'b')))), 'a' => 0];
        }

        return Battle::create([
            'user_id' => $user->id, 'mode' => 'stage', 'stage_id' => $stageId, 'map_id' => $map['id'], 'status' => 'deployment',
            'seed' => $seed, 'turn' => 1, 'current_side' => config('game.first_side'), 'version' => 0, 'state' => $state,
        ]);
    }

    /**
     * 스테이지 적 초기 편성 생성(createStageBattle 과 game:audit-stages 미리보기 공용). enemy_squad(동반병 보강 포함) 또는 프리셋+enemy_extra_troops 경로를 그대로 따른다.
     *
     * @return array{0:int,1:float} [적 레벨, 병사 성장률]
     */
    private function populateStageEnemy(array &$state, object $stage, array $map, array $preset): array
    {
        $rules = $this->data->rules();
        // 스테이지 전용 적 편성: enemy_level_offset(레벨 가산), enemy_extra_troops(프리셋 외 추가 부대 병종 코드). PvP/방 대전에는 적용하지 않는다.
        $lvl = max(1, (int) $stage->enemy_level + (int) ($stage->enemy_level_offset ?? 0));
        $growth = (float) config('game.troop_growth_pct');
        $sp = $map['spawns']['b'];
        $squad = json_decode((string) ($stage->enemy_squad ?? ''), true);
        if (is_array($squad) && isset($squad['commander']['unit_type'])) {
            // 영웅 없는 일반 지휘관 + 가변 부대(최대 총 16기). 영웅 프리셋/enemy_extra_troops는 사용하지 않는다.
            [$squad, $cRep] = ArmyBuilder::withEnemyCompanions($squad, ArmyBuilder::companionSettings((string) $stage->code));   // 적 영웅별 동반 일반병 3기 보강(이미 충족/제외 스테이지는 무변경)
            $gRep = ArmyBuilder::addGenericSide($this->engine(), $state, 'b', $squad, $lvl, $sp, $map['deploy_zones']['b'], $growth, $map['meta']['enemy_zones'] ?? [], fn (string $code) => $this->data->heroes()[$code] ?? null);
            ($cRep['added'] > 0 && ($gRep['skipped'] > 0 || $cRep['budget_short'] > 0)) && \Illuminate\Support\Facades\Log::info('companions(enemy): 일부 동반병 생략', ['stage' => $stage->code] + $cRep + ['place_skipped' => $gRep['skipped']]);
            $extra = [];
        } else {
            $state['units']['b0'] = ArmyBuilder::makeUnit($rules, 'b0', 'b', 'commander', $preset['hero']['unit_type'], $preset['hero'], $lvl, $sp[0][0], $sp[0][1], $growth, null, $state['mp_knobs'] ?? null);
            // 봇/적도 영웅 고정 병종 1종(프리셋 병종 지정보다 우선, 병사 수는 프리셋 수 유지)
            $preset['units'] = ArmyBuilder::fixedTypesFor($preset['hero'], $preset['units']);
            foreach ($preset['units'] as $i => $type) {
                $id = 'b'.($i + 1);
                $state['units'][$id] = ArmyBuilder::makeUnit($rules, $id, 'b', 'troop', $type, null, $lvl, $sp[$i + 1][0], $sp[$i + 1][1], $growth, $preset['hero']['culture'] ?? null);
            }
            $extra = ArmyBuilder::fixedTypesFor($preset['hero'], json_decode((string) ($stage->enemy_extra_troops ?? '[]'), true) ?: []);   // 적 영웅은 1명 -> 추가 병사도 그 영웅 소속(고정 병종)
        }
        if ($extra !== []) {
            // 추가 부대 칸: spawns.b 순서대로 빈 칸, 모자라면 deploy_zones.b 순서(결정적)
            $cells = array_merge($sp, $map['deploy_zones']['b']);
            $taken = [];
            foreach ($state['units'] as $u) {
                $taken["{$u['x']},{$u['y']}"] = true;
            }
            $n = count($preset['units']) + 1;
            foreach (array_values($extra) as $type) {
                $type = (string) $type;
                $moveType = $rules->unitType($type)['move_type'];
                foreach ($cells as [$cx, $cy]) {
                    if (! isset($taken["$cx,$cy"]) && $this->engine()->passable($state, $moveType, $cx, $cy)) {
                        $taken["$cx,$cy"] = true;
                        $state['units']['b'.$n] = ArmyBuilder::makeUnit($rules, 'b'.$n, 'b', 'troop', $type, null, $lvl, $cx, $cy, $growth, $preset['hero']['culture'] ?? null);
                        $n++;
                        break;
                    }
                }
            }
        }

        return [$lvl, $growth];
    }

    /** 감사용: 스테이지 적 초기 유닛 수(전투 생성과 같은 코드 경로, DB·전투 행 쓰기 없음). 증원은 트리거 spawn 합계를 따로 반환. @return array{initial:int,reinforce:int} */
    public function previewEnemyCounts(object $stage): array
    {
        $map = $this->data->map((int) $stage->map_id);
        $state = ArmyBuilder::initialState($this->data->rules(), $map, 1, (int) config('game.max_turns'), config('game.first_side'), false, false, false, $this->engine()->options()['snowball'], $this->engine()->mpKnobs(), 'off');
        $state['frozen'] = $this->engine()->frozenOpts();
        $stageRules = Engine::sanitizeStageRules(json_decode((string) ($stage->rules ?? ''), true) ?: null);
        $stageRules['rules'] !== [] && $state['rules'] = $stageRules['rules'] + ($state['rules'] ?? []);
        $state['campaign'] = true;
        $preset = $this->data->preset((int) $stage->enemy_preset_id);
        [$lvl, $growth] = $this->populateStageEnemy($state, $stage, $map, $preset);
        $initial = count(array_filter($state['units'], fn ($u) => $u['side'] === 'b'));
        $trig = Engine::normalizeTriggers(json_decode((string) ($stage->triggers ?? ''), true) ?: [], $map['meta']['enemy_extra_zones'] ?? [], $lvl, $growth, array_keys($this->data->rules()->unitTypes));
        $reinforce = array_sum(array_map(fn ($t) => $t['side'] === 'b' ? count($t['units']) : 0, $trig));

        return ['initial' => $initial, 'reinforce' => $reinforce];
    }

    /**
     * 감사용(읽기 전용): rules.deploy_slots 의 형식·좌표·영웅 일치 문제 목록. 슬롯 미정의면 [].
     * 좌표는 맵 deploy_zones.a 안이고 통행 가능해야 하며, 고정 슬롯 영웅은 존재해야 하고 주인공 고정 슬롯은 첫 항목(지휘관)이어야 한다.
     *
     * @return string[]
     */
    public function slotCellIssues(object $stage): array
    {
        $raw = (json_decode((string) ($stage->rules ?? ''), true) ?: [])['deploy_slots'] ?? null;
        if ($raw === null) {
            return [];
        }
        $ds = Engine::normalizeDeploySlots($raw);
        if ($ds === null) {
            return ['deploy_slots 형식 오류(유효 슬롯 0개)'];
        }
        $out = [];
        $rawN = count((array) ($raw['fixed_slots'] ?? [])) + count((array) ($raw['free_slots'] ?? []));
        $okN = count($ds['fixed']) + count($ds['free']);
        $rawN !== $okN && $out[] = ($rawN - $okN).'개 슬롯이 형식 오류·id/좌표 중복으로 무시됨';
        $map = $this->data->map((int) $stage->map_id);
        $zone = array_map(fn ($c) => "{$c[0]},{$c[1]}", $map['deploy_zones']['a']);
        $rules = $this->data->rules();
        $state = ArmyBuilder::initialState($rules, $map, 1, (int) config('game.max_turns'), config('game.first_side'), false, false, false, $this->engine()->options()['snowball'], $this->engine()->mpKnobs(), 'off');
        $state['frozen'] = $this->engine()->frozenOpts();
        $heroes = $this->data->heroes();
        $npc = $this->allyNpcCodes($stage);
        $canWalk = function (array $types, int $x, int $y) use ($rules, $state): bool {
            foreach ($types as $t) {
                isset($rules->unitTypes[$t]) && $this->engine()->passable($state, $rules->unitType($t)['move_type'], $x, $y) && $ok = true;
            }

            return ! empty($ok);
        };
        foreach (array_merge($ds['fixed'], $ds['free']) as $sl) {
            $tag = "슬롯 {$sl['id']}({$sl['x']},{$sl['y']})";
            ! in_array("{$sl['x']},{$sl['y']}", $zone, true) && $out[] = "{$tag}: 아군 배치 영역(deploy_zones.a) 밖";
            if (isset($sl['hero'])) {
                $types = [];
                if ($sl['hero'] === '@protagonist') {
                    $types = isset($sl['unit_type']) ? [$sl['unit_type']] : array_keys($rules->unitTypes);
                } elseif (isset($heroes[$sl['hero']])) {
                    $types = [$sl['unit_type'] ?? $heroes[$sl['hero']]['unit_type']];
                    in_array($sl['hero'], $npc, true) && $out[] = "{$tag}: 고정 영웅 {$sl['hero']} 가 ally_npcs 와 겹침";
                } else {
                    $out[] = "{$tag}: 고정 영웅 {$sl['hero']} 가 heroes 에 없음";
                    $types = array_keys($rules->unitTypes);
                }
                isset($sl['unit_type']) && ! isset($rules->unitTypes[$sl['unit_type']]) && $out[] = "{$tag}: 알 수 없는 unit_type {$sl['unit_type']}";
            } else {
                $types = $sl['unit_types'] ?? array_keys($rules->unitTypes);
                foreach ($sl['unit_types'] ?? [] as $t) {
                    ! isset($rules->unitTypes[$t]) && $out[] = "{$tag}: 알 수 없는 unit_types 항목 {$t}";
                }
            }
            ! $canWalk($types, $sl['x'], $sl['y']) && $out[] = "{$tag}: 통행 불가 지형(해당 병종 이동 불가)";
        }
        $pi = array_search('@protagonist', array_column($ds['fixed'], 'hero'), true);
        $pi !== false && $pi !== 0 && $out[] = '주인공 고정 슬롯은 fixed_slots 의 첫 항목(지휘관)이어야 함';

        return $out;
    }

    /**
     * 시범용(읽기 전용): 스테이지의 기존 아군 배치 영역에서 ArmyBuilder::spreadHeroPositions 로 슬롯 후보를 만든다(고정 = forced_heroes 순서, 나머지 = 선택 슬롯). DB·JSON 쓰기 없음.
     *
     * @return array{fixed_slots:array<int,array>,free_slots:array<int,array>}
     */
    public function suggestDeploySlots(object $stage, int $free): array
    {
        $map = $this->data->map((int) $stage->map_id);
        $rules = $this->data->rules();
        $state = ArmyBuilder::initialState($rules, $map, 1, (int) config('game.max_turns'), config('game.first_side'), false, false, false, $this->engine()->options()['snowball'], $this->engine()->mpKnobs(), 'off');
        $state['frozen'] = $this->engine()->frozenOpts();
        $heroes = $this->data->heroes();
        $fixed = [];
        foreach (json_decode((string) ($stage->forced_heroes ?? ''), true) ?: [] as $f) {
            $code = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
            $code !== '' && ($code[0] === '@' || isset($heroes[$code])) && $fixed[] = ['hero' => $code] + (is_array($f) ? array_intersect_key($f, array_flip(['unit_type', 'troop_type'])) : []);
        }
        $default = array_key_first($rules->unitTypes);
        $moveTypes = [];
        foreach ($fixed as $f) {
            $t = $f['unit_type'] ?? ($heroes[$f['hero']]['unit_type'] ?? $default);
            $moveTypes[] = $rules->unitType($t)['move_type'];
        }
        for ($i = 0; $i < $free; $i++) {
            $moveTypes[] = $rules->unitType($default)['move_type'];
        }
        $pos = ArmyBuilder::spreadHeroPositions($this->engine(), $state, $map['deploy_zones']['a'], $moveTypes);
        $out = ['fixed_slots' => [], 'free_slots' => []];
        foreach ($fixed as $i => $f) {
            isset($pos[$i]) && $out['fixed_slots'][] = ['id' => 'f'.($i + 1), 'x' => $pos[$i][0], 'y' => $pos[$i][1]] + $f;
        }
        for ($i = 0; $i < $free; $i++) {
            $k = count($fixed) + $i;
            isset($pos[$k]) && $out['free_slots'][] = ['id' => 's'.($i + 1), 'x' => $pos[$k][0], 'y' => $pos[$k][1]];
        }

        return $out;
    }

    /** 배치 화면용 적 병력 미리보기 {initial, reinforce}. 스테이지가 없거나(방·자유전) 계산 실패면 null */
    private function safeEnemyPreview(?object $stage): ?array
    {
        if ($stage === null) {
            return null;
        }
        try {
            return $this->previewEnemyCounts($stage);
        } catch (\Throwable $e) {
            return null;
        }
    }

    /**
     * 편성 라인업 판정(캠페인 출정 전용). 풀 = 라인업 영웅 + 필수/고정/대여 영웅 + 주인공(campaign_only) - 이 스테이지 아군 NPC.
     * required(min_party) = max(1, 필수·고정·대여 영웅 수; 슬롯 모드 고정 슬롯 포함). 선택 슬롯 수는 요구하지 않는다(기존: 선택 슬롯은 비워도 확정 가능).
     * reason: null | lineup_empty(필수 영웅 없는데 라인업 영웅도 없음) | below_min_party(풀 < required)
     *
     * @param  int[]  $lineupIds
     * @param  iterable  $rows user_heroes 행(해당 유저)
     * @return array{ready:bool,required:int,current:int,reason:?string,pool:int[],lineup_count:int}
     */
    public function lineupCheck(User $user, ?object $stage, array $forced, array $lineupIds, iterable $rows): array
    {
        $npc = $this->allyNpcCodes($stage);
        $pool = [];
        $free = 0;
        foreach ($rows as $uh) {
            $h = $this->data->heroById((int) $uh->hero_id);
            if (! $h || in_array($h['code'], $npc, true)) {
                continue;
            }
            $exempt = isset($forced[$h['code']]) || ! empty($h['campaign_only']);
            $in = in_array((int) $uh->id, $lineupIds, true);
            if ($exempt || $in) {
                $pool[] = (int) $uh->id;
            }
            $in && ! $exempt && $free++;
        }
        $required = max(1, count($forced));
        $reason = count($pool) >= $required ? null : (($free === 0 && $forced === []) ? 'lineup_empty' : 'below_min_party');

        return ['ready' => $reason === null, 'required' => $required, 'current' => count($pool), 'reason' => $reason, 'pool' => $pool, 'lineup_count' => count($lineupIds)];
    }

    /**
     * 총합 권장 레벨용 권장 편성 인원 N_stage: 슬롯 모드 = 고정+선택 슬롯 수, 그 외 = 캠페인 슬롯 곡선에 recommended_level 을 레벨로 대입한 슬롯 수(필수 영웅 슬롯 면제분 제외).
     * recommended_level 자체는 불변. @return array{recommended_party:int,recommended_total:int}
     */
    public function recommendedParty(?object $stage, ?array $slots = null): array
    {
        $lv = (int) ($stage->recommended_level ?? 1);
        $slots ??= $stage ? $this->liveSlots($stage) : null;
        $n = $slots ? count($slots['fixed']) + count($slots['free']) : $this->progress->maxSlots(max(1, $lv), true);

        return ['recommended_party' => $n, 'recommended_total' => $lv * $n];
    }

    /** 라인업 적용 범위: 캠페인 스테이지 출정만(방 대전·랭크·시즌 전쟁·자유전은 현행) */
    private function lineupEnforced(?object $stage, array $state): bool
    {
        return $stage !== null && ! empty($state['campaign']) && LineupService::available();
    }

    public function deploymentInfo(User $user, Battle $b): array
    {
        $map = $this->data->map((int) $b->map_id);
        $rows = DB::table('user_heroes')->where('user_id', $user->id)->get();
        $stageRow = DB::table('stages')->where('id', $b->stage_id)->first();
        $slots = $b->state['deploy_slots'] ?? null;   // 슬롯 모드(생성 시 고정 스냅샷), 없으면 현행
        $forced = $this->forcedOf($stageRow, $user, $slots);   // 출전 강제/대여/고정 슬롯: hero code => {unit_type?, troop_type?}
        $npcCodes = $this->allyNpcCodes($stageRow);   // 이 스테이지에서 아군 NPC로 등장하는 영웅은 플레이어 출전 후보에서 제외
        $enforce = $this->lineupEnforced($stageRow, $b->state);   // 캠페인 스테이지 출정만 라인업 적용
        $lineupSvc = app(LineupService::class);
        $lineupIds = $enforce ? $lineupSvc->ids($user) : [];
        $lc = $enforce ? $this->lineupCheck($user, $stageRow, $forced, $lineupIds, $rows) : null;
        $poolSet = $lc ? array_flip($lc['pool']) : null;   // null = 제한 없음
        $candidates = [];
        foreach ($rows as $uh) {
            $h = $this->applyForced($this->data->heroById((int) $uh->hero_id), $forced);
            if (in_array($h['code'], $npcCodes, true)) {
                continue;
            }
            $li = array_search((int) $uh->id, $lineupIds, true);
            $candidates[] = ['in_lineup' => $li !== false, 'lineup_slot' => $li !== false ? $li + 1 : null, 'in_pool' => $poolSet === null || isset($poolSet[(int) $uh->id]), 'user_hero_id' => (int) $uh->id, 'hero' => $h['code'], 'name' => $h['name_ko'], 'title' => $h['title'], 'short_name' => $h['short_name'], 'display_name' => $h['display_name'], 'rarity' => $h['rarity'], 'cost' => $h['cost'], 'level' => (int) $uh->level, 'unit_type' => $h['unit_type'], 'troop_type' => $h['troop_type'], 'troop_label' => $this->data->troopLabel($h['troop_type']), 'forced' => isset($forced[$h['code']])];
        }
        foreach ($candidates as $ci => $c) {   // 영웅 상세(오라/문화권/능력치)
            $candidates[$ci]['portrait'] = $this->portraitFor($c['hero'], (int) $user->id);
            $candidates[$ci]['detail'] = $this->data->heroDetail($this->applyForced($this->data->heroes()[$c['hero']], $forced));
        }
        $forcedIds = [];   // 강제 영웅의 user_hero id: 기본 파티 맨 앞(지휘관). forced_heroes 선언 순서(주인공이 맨 앞이면 지휘관)를 따른다
        foreach (array_keys($forced) as $fcode) {
            foreach ($rows as $uh) {
                $this->data->heroById((int) $uh->hero_id)['code'] === $fcode && $forcedIds[] = (int) $uh->id;
            }
        }
        $keep = array_flip(array_column(array_filter($candidates, fn ($c) => $c['in_pool']), 'user_hero_id'));   // 기본 파티·복원은 라인업 풀 안으로 필터
        $defaultParty = array_values(array_filter(array_unique(array_merge($forcedIds, $this->progress->party($user))), fn ($id) => isset($keep[$id])));
        $slotPlan = $slots ? $this->defaultSlotPlan($user, $slots, $forced, array_values(array_filter($candidates, fn ($c) => $c['in_pool']))) : null;
        $slots && $defaultParty = array_values(array_filter($slotPlan['party'], fn ($id) => isset($keep[$id])));
        $partyCap = $slots ? count($slots['free']) + count($forced) : $this->progress->maxSlots($this->progress->level($user), true) + count($forced);
        $forcedHeroes = [];
        foreach ($forcedIds as $fid) {
            $fuh = $rows->firstWhere('id', $fid);
            $fuh && $forcedHeroes[$fid] = ['uh' => $fuh, 'hero' => $this->applyForced($this->data->heroById((int) $fuh->hero_id), $forced)];
        }
        $defCost = [];   // 기본 편성(강제·고정 영웅 + 선택 영웅) 코스트: 서버 판정(validateParty)과 같은 합산
        foreach (array_slice($defaultParty, 0, $partyCap) as $did) {
            $duh = $rows->firstWhere('id', $did);
            $duh && $defCost[$did] = ['uh' => $duh, 'hero' => $this->applyForced($this->data->heroById((int) $duh->hero_id), $forced)];
        }
        $maxCost = $slots['cost_cap'] ?? $this->progress->campaignCostCap($this->progress->level($user), $slots ? count($slots['free']) : $this->progress->maxSlots($this->progress->level($user), true), count($forced), true);
        // 등급 격차 v1로 영웅 코스트가 오른 기존 유저: 저장 파티(parties)는 그대로 두고 기본 편성에서만 상한 초과분을 뒤쪽 영웅부터 해제하고 안내한다(강제·고정 영웅은 유지).
        $trim = $this->progress->trimPartyToCost($user, $defCost, $forcedIds, $maxCost, true);
        $trimmed = [];
        if ($trim['dropped'] !== []) {
            foreach ($trim['dropped'] as $did) {
                $trimmed[] = ['user_hero_id' => $did, 'hero' => $defCost[$did]['hero']['code'], 'name' => $defCost[$did]['hero']['name_ko'], 'cost' => (int) $defCost[$did]['hero']['cost']];
            }
            $defCost = $trim['kept'];
            $defaultParty = array_values(array_filter($defaultParty, fn ($id) => ! in_array($id, $trim['dropped'], true)));
        }
        $stage = DB::table('stages')->where('id', $b->stage_id)->first(['name', 'recommended_level']);
        $enemy = array_map(fn ($u) => Engine::redactUnitMp($u, 'a'), $this->data->withTitles(array_values(array_filter($b->state['units'], fn ($u) => $u['side'] === 'b'))));   // 적 영웅 MP는 비율만

        return [
            'battle_id' => $b->id, 'status' => $b->status, 'map_code' => $this->data->mapMeta((int) $b->map_id)['code'], 'biome' => $this->data->mapMeta((int) $b->map_id)['biome'],
            'objective' => Engine::objectiveView($b->state), 'objective_points' => $this->objectivePoints($b->state), 'triggers' => Engine::triggersView($b->state),
            'forced' => $this->forcedView($user, $forced),
            'lineup_enforced' => $enforce, 'lineup' => $enforce ? $lineupSvc->view($user)['lineup'] : [], 'lineup_avg_level' => $enforce ? $lineupSvc->view($user)['avg_level'] : null, 'lineup_max' => LineupService::MAX,
            'recommended_party' => $this->recommendedParty($stageRow, $slots)['recommended_party'], 'recommended_total' => $this->recommendedParty($stageRow, $slots)['recommended_total'],   // 권장 총합 레벨 = recommended_level x 권장 인원
            'min_party' => $lc['required'] ?? 1, 'pool_size' => $lc ? $lc['current'] : count($candidates), 'lineup_ready' => $lc['ready'] ?? true, 'lineup_reason' => $lc['reason'] ?? null,   // 서버 단일 권위: 풀(라인업+필수/고정/대여+주인공) < min_party 면 PUT deployment 가 lineup_insufficient
            'slot_mode' => $slots !== null, 'slots' => $slots ? $this->slotsView($slots, $forced, $candidates) : [],   // 배치 슬롯(슬롯 스테이지만): kind fixed=잠김(영웅 고정)/free=유저 선택. 슬롯 외 타일 배치는 not_a_slot
            'slot_counts' => $slots ? ['fixed' => count($slots['fixed']), 'free' => count($slots['free']), 'total' => count($slots['fixed']) + count($slots['free'])] : null,
            'forced_cost' => $this->progress->costBreakdown($user, $forcedHeroes, null, true),   // 강제/고정 영웅 코스트(영웅+부대): 코스트 상한 합산에 포함된다
            'cost_cap_source' => ($slots['cost_cap'] ?? null) !== null ? 'stage' : 'level',
            'stage_name' => $stage->name ?? null, 'recommended_level' => isset($stage->recommended_level) ? (int) $stage->recommended_level : null,
            'max_cost' => $maxCost, 'max_party_slots' => $slots ? count($slots['free']) : $this->progress->maxSlots($this->progress->level($user), true),   // 캠페인 곡선(슬롯 스테이지: 선택 슬롯 수 = 고정 영웅 제외 출전 가능 수, 코스트 상한은 rules.deploy_slots.cost_cap 우선)
            'default_party' => $defaultParty, 'default_positions' => (object) $this->defaultPositions($user, $b->state, $map['deploy_zones']['a'], array_slice($defaultParty, 0, $partyCap), $forced, $slotPlan['pos'] ?? null), 'default_party_cost' => $this->progress->costBreakdown($user, $defCost, null, true) + ['max' => $maxCost], 'candidates' => $candidates,
            'default_party_trimmed' => $trimmed, 'default_party_notice' => $trimmed ? '코스트 상한('.$maxCost.')을 넘어 기본 편성에서 '.count($trimmed).'명을 제외했습니다: '.implode(', ', array_column($trimmed, 'name')).'. 저장된 편성은 그대로이며 직접 조정할 수 있습니다.' : null,
            'deploy_zone' => $map['deploy_zones']['a'], 'enemy_units' => $enemy, 'enemy_preview' => $this->safeEnemyPreview($stageRow),
            'width' => $map['width'], 'height' => $map['height'], 'tiles' => $b->state['tiles'],
            'submitted' => $b->deployment,
        ] + $this->data->mapExtras((int) $b->map_id, [(int) $b->state['width'], (int) $b->state['height']]) + $this->formationInfo($user, $b->state, $forced) + ['default_troop_positions' => (object) $this->defaultTroopPositions($user, $b->state, $map['deploy_zones']['a'], array_slice($defaultParty, 0, $partyCap), $forced, $slotPlan['pos'] ?? null)];
    }

    /**
     * 배치 화면용 편성 정보(squad on일 때 의미): 영웅별 부대 슬롯 수/병종/코스트(상한 적용 전 기본 계획), 배치 반경, 진영 유닛 상한.
     * formation[user_hero_id] = {slots, user_selected, troops:[{class,cost}]}
     */
    /**
     * 기본 배치 추천 위치(FE가 default_party 자동 배치에 사용): 영웅을 배치 영역 앞열의 서로 다른 레인으로 분산(모서리 군집 금지).
     *
     * @param  int[]  $userHeroIds 파티 순서(첫째=지휘관)
     * @return array<int,array{x:int,y:int}> user_hero_id => 위치
     */
    public function defaultPositions(User $user, array $state, array $zone, array $userHeroIds, array $forced = [], ?array $slotPos = null): array
    {
        $rules = $this->data->rules();
        $owned = DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', $userHeroIds)->get()->keyBy('id');
        $ids = [];
        $moveTypes = [];
        foreach ($userHeroIds as $id) {
            if (isset($owned[$id]) && ($h = $this->data->heroById((int) $owned[$id]->hero_id))) {
                $h = $this->applyForced($h, $forced);
                $ids[] = $id;
                $moveTypes[] = $rules->unitType($h['unit_type'])['move_type'];
            }
        }
        $out = [];
        if ($slotPos !== null) {   // 슬롯 모드: 영웅 위치는 슬롯 타일(spreadHeroPositions 미사용)
            foreach ($ids as $id) {
                isset($slotPos[$id]) && $out[$id] = ['x' => $slotPos[$id][0], 'y' => $slotPos[$id][1]];
            }

            return $out;
        }
        foreach (ArmyBuilder::spreadHeroPositions($this->engine(), $state, $zone, $moveTypes) as $i => [$x, $y]) {
            $out[$ids[$i]] = ['x' => $x, 'y' => $y];
        }

        return $out;
    }

    /**
     * 병사 기본(자동 배치) 예상 위치 — 읽기 전용: 기본 파티+기본 영웅 위치로 state 사본에 ArmyBuilder::addSide를 시뮬레이션해
     * 영웅별 부대(leader_id)의 좌표를 수집한다. DB·state 불변. squad off거나 실패 시 [].
     *
     * @param  int[]  $userHeroIds 파티 순서(첫째=지휘관)
     * @return array<int,array<int,array{x:int,y:int}>> user_hero_id => [{x,y}...] (부대 병종 순서 = formation[id].troops 순서)
     */
    public function defaultTroopPositions(User $user, array $state, array $zone, array $userHeroIds, array $forced = [], ?array $slotPos = null): array
    {
        if (! \App\Game\Engine::squadOn($state)) {
            return [];
        }
        try {
            $pos = $this->defaultPositions($user, $state, $zone, $userHeroIds, $forced, $slotPos);
            $entries = [];
            $positions = [];
            $uhs = DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', array_keys($pos))->get()->keyBy('id');
            foreach ($userHeroIds as $id) {
                if (isset($pos[$id], $uhs[$id]) && ($h = $this->data->heroById((int) $uhs[$id]->hero_id))) {
                    $h = $this->applyForced($h, $forced);
                    $entries[] = ['row' => $h, 'level' => (int) $uhs[$id]->level, 'key' => (int) $id];
                    $positions[(int) $id] = [$pos[$id]['x'], $pos[$id]['y']];
                }
            }
            if (! $entries) {
                return [];
            }
            $plan = $this->squadPlanWithPositions($user, $state, $entries, []);
            ArmyBuilder::addSide($this->engine(), $state, 'a', $entries, [], $zone, $positions, (float) config('game.troop_growth_pct'), $plan);
            $out = [];
            foreach ($state['units'] as $u) {
                if ($u['side'] === 'a' && $u['kind'] === 'troop' && isset($u['leader_id']) && preg_match('/^a(\d+)$/', $u['leader_id'], $mm) && isset($entries[(int) $mm[1]])) {
                    $out[$entries[(int) $mm[1]]['key']][] = ['x' => $u['x'], 'y' => $u['y']];
                }
            }

            return $out;
        } catch (\Throwable) {
            return [];   // 선택 필드: 계산 실패는 응답을 막지 않는다(FE는 자체 추정/표시 생략)
        }
    }

    public function formationInfo(User $user, array $state, array $forced = []): array
    {
        $cfg = $this->progress->squadCfg(! empty($state['campaign']));
        $costOf = fn (string $t) => (int) ($this->data->rules()->unitType($t)['cost'] ?? 1);
        $formation = [];
        foreach (DB::table('user_heroes')->where('user_id', $user->id)->get() as $uh) {
            $h = $this->applyForced($this->data->heroById((int) $uh->hero_id), $forced);
            $entry = ['row' => $h, 'level' => (int) $uh->level, 'key' => (int) $uh->id];
            $list = $this->progress->squadTroops([$entry], $user->id, ! empty($state['campaign']))[0];
            $formation[(int) $uh->id] = [
                'slots' => \App\Game\SquadPlanner::count((int) $uh->level, (int) $h['troop_bonus'], $cfg, $h['rarity'] ?? null), 'user_selected' => false, 'troop_type' => $h['troop_type'], 'troop_label' => $this->data->troopLabel($h['troop_type']),   // 고정 병종: 사용자 선택 없음
                'troops' => array_map(fn ($t) => ['class' => $t, 'cost' => $costOf($t)], $list),
            ];
        }

        return ['squad' => \App\Game\Engine::squadOn($state), 'troop_place_radius' => (int) config('game.troop_place_radius'), 'max_units_per_side' => $cfg['max_units'], 'formation' => (object) $formation];
    }

    /** squad on: 영웅별 부대 계획에 사용자가 지정한 부대 위치(placements[].troops)를 합쳐 addSide 입력으로 만든다. off면 null. */
    public function squadPlanWithPositions(User $user, array $state, array $entries, array $placements): ?array
    {
        if (! \App\Game\Engine::squadOn($state)) {
            return null;
        }
        $plan = $this->progress->squadTroops($entries, $user->id, ! empty($state['campaign']));
        foreach (array_values($placements) as $i => $p) {
            if (! empty($p['troops']) && isset($plan[$i])) {
                $plan[$i] = \App\Game\SquadPlanner::mergePositions($plan[$i], $p['troops']);
            }
        }

        return $plan;
    }

    /**
     * 배치 제출 검증 후 저장(확정 전 재제출 가능).
     *
     * @param array<int,array{user_hero_id:mixed,x:mixed,y:mixed}> $placements 첫 번째 = 지휘관
     */
    public function submitDeployment(User $user, Battle $b, array $placements): Battle
    {
        $this->validatePlacements($user, $b, $placements);

        return DB::transaction(function () use ($user, $b, $placements) {
            $cur = $this->findOwned($user, $b->id);
            if ($cur->status !== 'deployment') {
                throw new IllegalAction('deployment_closed', '이미 확정된 전투입니다.', 409);
            }
            $n = DB::table('battles')->where('id', $cur->id)->where('version', $cur->version)->update([
                'deployment' => json_encode(array_values($placements)), 'version' => $cur->version + 1, 'updated_at' => now(),
            ]);
            if ($n === 0) {
                throw new IllegalAction('version_conflict', '동시에 변경되었습니다. 다시 시도하세요.', 409);
            }

            return $cur->refresh();
        });
    }

    private function validatePlacements(User $user, Battle $b, array $placements): array
    {
        if ($b->status !== 'deployment') {
            throw new IllegalAction('deployment_closed', '이미 확정된 전투입니다.', 409);
        }

        return $this->validatePlacementList($user, $b->state, (int) $b->map_id, 'a', $placements, DB::table('stages')->where('id', $b->stage_id)->first() ?: null);
    }

    /**
     * 스테이지 출전 강제/대여 영웅: stages.forced_heroes JSON. 항목은 영웅 코드 문자열 또는 {hero, unit_type?, troop_type?}(예: 해전 4종 이순신 수군 대여 = unit_type/troop_type naval).
     * '@protagonist'(주인공 토큰)는 아직 미지원이라 무시한다. @return array<string,array{unit_type?:string,troop_type?:string}> hero code => 덮어쓰기
     */
    public function forcedOf(?object $stage, ?User $user = null, ?array $slots = null): array
    {
        $out = [];
        $types = array_keys($this->data->rules()->unitTypes);
        $entries = json_decode((string) ($stage->forced_heroes ?? ''), true) ?: [];
        foreach ($slots['fixed'] ?? [] as $fs) {   // 배치 슬롯 고정(locked) 영웅: forced_heroes 와 같은 경로(교체·제외 불가, 슬롯 면제, 주인공 지휘관/사망=패배). 슬롯의 unit_type/troop_type 이 덮어쓴다
            $entries[] = array_intersect_key($fs, array_flip(['unit_type', 'troop_type'])) + ['hero' => $fs['hero']];
        }
        foreach ($entries as $f) {
            $code = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
            $o = [];
            if ($code === '@protagonist') {   // 주인공 토큰: 해당 유저의 주인공 영웅으로 해석(없으면 항목 없음 -> assertStageHeroes가 protagonist_required)
                $p = $user ? $this->protagonistOf($user) : null;
                $pt = (json_decode((string) ($stage->rules ?? ''), true) ?: [])['protagonist_troop'] ?? null;   // 스테이지 rules.protagonist_troop: 주인공 병종 덮어쓰기(해전 등, 예: naval). 대여 영웅과 같은 unit_type/troop_type 경로
                if (! $p) {
                    continue;
                }
                $code = $p['code'];
                $o = ['protagonist' => true] + (is_string($pt) && in_array($pt, $types, true) ? ['unit_type' => $pt, 'troop_type' => $pt] : []);
            } elseif ($code === '' || $code[0] === '@') {
                continue;
            }
            foreach (['unit_type', 'troop_type'] as $k) {
                if (is_array($f) && isset($f[$k]) && in_array($f[$k], $types, true)) {
                    $o[$k] = $f[$k];
                }
            }
            $out[$code] = array_merge($out[$code] ?? [], $o);
        }

        return $out;
    }

    /** stages.rules.deploy_slots(정규화, 라이브 스테이지 값). 없으면 null = 슬롯 미정의(현행). 진행 중 전투는 이 값이 아니라 state.deploy_slots 스냅샷을 쓴다. */
    public function liveSlots(?object $stage): ?array
    {
        return Engine::normalizeDeploySlots((json_decode((string) ($stage->rules ?? ''), true) ?: [])['deploy_slots'] ?? null);
    }

    /** 주인공이 필수 출전인 스테이지인가(forced_heroes 또는 고정 슬롯에 @protagonist) */
    private function wantsProtagonist(?object $stage): bool
    {
        return in_array('@protagonist', json_decode((string) ($stage->forced_heroes ?? ''), true) ?: [], true)
            || in_array('@protagonist', array_column($this->liveSlots($stage)['fixed'] ?? [], 'hero'), true);
    }

    /** 슬롯 hero 토큰 -> 영웅 코드('@protagonist' 는 forced 중 protagonist 표식 항목). */
    private function slotHeroCode(string $hero, array $forced): ?string
    {
        if ($hero !== '@protagonist') {
            return $hero;
        }
        foreach ($forced as $code => $o) {
            if (! empty($o['protagonist'])) {
                return (string) $code;
            }
        }

        return null;
    }

    /** FE용 슬롯 목록: fixed 는 hero/user_hero_id(보유 시)/locked=true, free 는 unit_types(null=제한 없음). */
    private function slotsView(array $slots, array $forced, array $candidates): array
    {
        $byCode = [];
        foreach ($candidates as $c) {
            $byCode[$c['hero']] = $c['user_hero_id'];
        }
        $out = [];
        foreach ($slots['fixed'] as $sl) {
            $code = $this->slotHeroCode($sl['hero'], $forced);
            $out[] = ['id' => $sl['id'], 'kind' => 'fixed', 'locked' => true, 'x' => $sl['x'], 'y' => $sl['y'], 'hero' => $code, 'user_hero_id' => $code !== null ? ($byCode[$code] ?? null) : null, 'unit_type' => $sl['unit_type'] ?? null, 'troop_type' => $sl['troop_type'] ?? null];
        }
        foreach ($slots['free'] as $sl) {
            $out[] = ['id' => $sl['id'], 'kind' => 'free', 'locked' => false, 'x' => $sl['x'], 'y' => $sl['y'], 'unit_types' => $sl['unit_types'] ?? null];
        }

        return $out;
    }

    /**
     * 슬롯 모드 기본 배치: 고정 영웅은 자기 슬롯 타일, 마지막 출격 구성(저장 파티)의 영웅은 순서대로 조건(unit_types)에 맞는 첫 빈 선택 슬롯.
     *
     * @return array{party:int[],pos:array<int,array{0:int,1:int}>}
     */
    private function defaultSlotPlan(User $user, array $slots, array $forced, array $candidates): array
    {
        $byCode = [];
        $info = [];
        foreach ($candidates as $c) {
            $byCode[$c['hero']] = $c['user_hero_id'];
            $info[$c['user_hero_id']] = $c;
        }
        $party = [];
        $pos = [];
        foreach ($slots['fixed'] as $sl) {
            $id = ($code = $this->slotHeroCode($sl['hero'], $forced)) !== null ? ($byCode[$code] ?? null) : null;
            if ($id !== null && ! isset($pos[$id])) {
                $party[] = $id;
                $pos[$id] = [$sl['x'], $sl['y']];
            }
        }
        $saved = array_values(array_filter($this->progress->party($user), fn ($i) => isset($info[$i]) && ! isset($pos[$i])));
        foreach ($slots['free'] as $sl) {
            foreach ($saved as $k => $i) {
                if (empty($sl['unit_types']) || in_array($info[$i]['unit_type'], $sl['unit_types'], true)) {
                    $party[] = $i;
                    $pos[$i] = [$sl['x'], $sl['y']];
                    unset($saved[$k]);
                    break;
                }
            }
        }

        return ['party' => $party, 'pos' => $pos];
    }

    /**
     * 주인공 해석 훅(주인공 영웅 행/생성/API는 별도 작업): 유저의 주인공 영웅(heroes.campaign_only=1 보유)을 [user_hero_id, code]로 반환. 컬럼/행이 없으면 null.
     *
     * @return array{user_hero_id:int,code:string}|null
     */
    public function protagonistOf(User $user): ?array
    {
        $col = \Illuminate\Support\Facades\Schema::hasColumn('heroes', 'is_protagonist') ? 'is_protagonist' : 'campaign_only';   // campaign_only는 NPC에도 쓰이므로 주인공 표식 우선
        if (! \Illuminate\Support\Facades\Schema::hasColumn('heroes', $col)) {
            return null;
        }
        $r = DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_heroes.user_id', $user->id)->where('heroes.'.$col, 1)
            ->orderBy('user_heroes.id')->first(['user_heroes.id as uhid', 'heroes.code']);

        return $r ? ['user_hero_id' => (int) $r->uhid, 'code' => $r->code] : null;
    }

    /** 초상화 코드: 주인공 원형이면 'protagonist_<face>'(해당 유저의 face, 없으면 null), 일반 영웅은 영웅 code */
    public function portraitFor(string $heroCode, int $userId): ?string
    {
        return ProtagonistService::isProtagonistCode($heroCode) ? app(ProtagonistService::class)->portraitFor($userId) : $heroCode;
    }

    /**
     * 전투 유닛 뷰에 portrait 추가: 영웅 유닛(hero 코드 있음)만 값, 일반 지휘관/병사는 null. 주인공 유닛은 그 진영 소유자(스테이지=전투 소유자, 방=room_players.side)의 face -> protagonist_<face>.
     *
     * @param  array<int,array>  $units
     * @return array<int,array>
     */
    private function withPortraits(Battle $b, array $units): array
    {
        $owners = $b->room_id ? DB::table('room_players')->where('room_id', $b->room_id)->pluck('user_id', 'side')->all() : ['a' => $b->user_id];
        $faces = ($owners && \Illuminate\Support\Facades\Schema::hasTable('user_protagonists')) ? DB::table('user_protagonists')->whereIn('user_id', array_values($owners))->pluck('face', 'user_id')->all() : [];
        $names = [];
        foreach ($owners as $side => $uid) {   // 주인공 유닛 표시명 = 소유자 기준(방 대전에서 상대 주인공은 상대 이름)
            $names[$side] = ($owner = \App\Models\User::find($uid)) ? app(ProtagonistService::class)->displayName($owner) : null;
        }
        foreach ($units as $i => $u) {
            $code = $u['hero'] ?? null;
            if ($code === null) {
                $units[$i]['portrait'] = null;
            } elseif (ProtagonistService::isProtagonistCode($code)) {
                if (($nm = $names[$u['side']] ?? null) !== null && $nm !== '') {
                    $units[$i]['name'] = $nm;
                    $units[$i]['display_name'] = $nm;
                }
                $face = $faces[$owners[$u['side']] ?? 0] ?? null;
                $units[$i]['portrait'] = $face ? ProtagonistService::CODE_PREFIX.$face : null;
            } else {
                $units[$i]['portrait'] = $code;
            }
        }

        return $units;
    }

    /** 영웅 행에 대여 덮어쓰기(병종/부대 병종)를 적용한 사본(원본 불변). */
    public function applyForced(array $hero, array $forced): array
    {
        return isset($forced[$hero['code'] ?? '']) ? array_merge($hero, $forced[$hero['code']]) : $hero;
    }

    /**
     * 필수 영웅(forced_heroes + required_hero) 중 유저가 보유하지 않은 영웅. 주인공(@protagonist/주인공 원형)은 항상 보유로 간주한다(입장 시 자동 지급).
     * 대여(guest) 지급은 하지 않는다: 미보유면 그 스테이지는 플레이 불가.
     *
     * @param  string[]|null  $ownedCodes 보유 영웅 코드(목록 조회 시 N+1 방지용으로 미리 계산해 전달)
     * @return array<int,array{code:string,name:string}>
     */
    public function missingStageHeroes(User $user, object $stage, ?array $ownedCodes = null): array
    {
        return array_values(array_map(fn ($r) => ['code' => $r['code'], 'name' => $r['name']], array_filter($this->requiredStageHeroes($user, $stage, $ownedCodes), fn ($r) => ! $r['owned'])));
    }

    /**
     * 필수 영웅 전체 목록 [{code,name,owned}](주인공 제외). FE가 forced_heroes 규칙을 흉내 내지 않도록 서버가 계산한다.
     *
     * @param  string[]|null  $ownedCodes
     * @return array<int,array{code:string,name:string,owned:bool}>
     */
    public function requiredStageHeroes(User $user, object $stage, ?array $ownedCodes = null): array
    {
        $need = [];
        foreach (json_decode((string) ($stage->forced_heroes ?? ''), true) ?: [] as $f) {
            $code = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
            $code !== '' && $code[0] !== '@' && $need[] = $code;
        }
        foreach ($this->liveSlots($stage)['fixed'] ?? [] as $fs) {   // 고정 슬롯 영웅은 대여가 아니라 보유 필수(주인공 토큰 제외)
            $fs['hero'] !== '' && $fs['hero'][0] !== '@' && $need[] = $fs['hero'];
        }
        foreach ((json_decode((string) ($stage->rules ?? ''), true) ?: [])['required_heroes'] ?? [] as $rc) {   // 스테이지별 보유 필수 영웅(rules.required_heroes, 슬롯과 무관하게 입장 게이트)
            is_string($rc) && $rc !== '' && $rc[0] !== '@' && $need[] = $rc;
        }
        ! empty($stage->required_hero) && $need[] = (string) $stage->required_hero;
        $need = array_values(array_unique($need));
        $need = array_values(array_filter($need, fn ($c) => ! ProtagonistService::isProtagonistCode($c)));
        if ($need === []) {
            return [];
        }
        $ownedCodes ??= DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_heroes.user_id', $user->id)->pluck('heroes.code')->all();
        $out = [];
        foreach ($need as $code) {
            $out[] = ['code' => $code, 'name' => $this->data->heroes()[$code]['name_ko'] ?? $code, 'owned' => in_array($code, $ownedCodes, true)];
        }

        return $out;
    }

    /** 입장 검증: forced_heroes/required_hero 영웅 미보유면 422 required_hero_missing(영웅 이름 목록 포함, 대여 없음). */
    private function assertStageHeroes(User $user, object $stage): void
    {
        if ($this->wantsProtagonist($stage) && $this->protagonistOf($user) === null) {
            throw new IllegalAction('protagonist_required', '주인공을 먼저 생성해야 이 스테이지에 입장할 수 있습니다.', 409);
        }
        if ($missing = $this->missingStageHeroes($user, $stage)) {
            throw new IllegalAction('required_hero_missing', '필수 영웅을 보유하지 않아 이 시나리오를 플레이할 수 없습니다: '.implode(', ', array_column($missing, 'name')), 422, ['missing_heroes' => $missing]);
        }
    }

    /** FE용 강제 출전 목록: [{hero, user_hero_id, unit_type, troop_type, troop_label, free_slot, free_cost}] */
    private function forcedView(User $user, array $forced): array
    {
        $out = [];
        foreach ($forced as $code => $o) {
            $h = $this->data->heroes()[$code] ?? null;
            $uh = $h ? DB::table('user_heroes')->where(['user_id' => $user->id, 'hero_id' => $h['id']])->first() : null;
            $h = $h ? $this->applyForced($h, $forced) : null;
            $h && $out[] = ['hero' => $code, 'user_hero_id' => $uh ? (int) $uh->id : null, 'unit_type' => $h['unit_type'], 'troop_type' => $h['troop_type'], 'troop_label' => $this->data->troopLabel($h['troop_type']), 'free_slot' => true, 'free_cost' => false];   // 슬롯 수만 면제, 코스트는 합산에 포함(2026-11-08)
        }

        return $out;
    }

    /** 목표 칸 좌표 목록(capture면 points, 그 외 빈 배열) -- FE 깃발 표시용 */
    private function objectivePoints(array $state): array
    {
        $o = Engine::captureObjective($state);

        return $o ? $o['points'] : [];
    }

    /** 편성(코스트/보유/중복) + 좌표(영역/지형/점유) 검증. 방(룸) 배치에서도 재사용. @return array user_hero id => ['uh','hero'] */
    public function validatePlacementList(User $user, array $state, int $mapId, string $side, array $placements, ?object $stage = null, bool $roomFixed = false): array
    {
        $slots = ($stage && ! $roomFixed) ? ($state['deploy_slots'] ?? null) : null;   // 슬롯 모드는 전투 생성 시 고정된 스냅샷만(없으면 레거시 검증)
        $forced = $stage ? $this->forcedOf($stage, $user, $slots) : [];
        $ids = [];
        foreach ($placements as $p) {
            if (! is_array($p) || ! isset($p['user_hero_id']) || ! is_int($p['user_hero_id'])) {
                throw new IllegalAction('invalid_placement', '배치 형식이 올바르지 않습니다.');
            }
            $ids[] = $p['user_hero_id'];
        }
        $enforce = ! $roomFixed && $this->lineupEnforced($stage, $state);
        $lineupIds = [];
        if ($enforce) {   // 편성 라인업: 풀(라인업+필수/고정/대여+주인공)이 최소 인원 미달이면 편성 화면으로 유도
            $lineupIds = app(LineupService::class)->ids($user);
            $lc = $this->lineupCheck($user, $stage, $forced, $lineupIds, DB::table('user_heroes')->where('user_id', $user->id)->get());
            if (! $lc['ready']) {
                throw new IllegalAction('lineup_insufficient', "편성 라인업이 부족합니다(필요 {$lc['required']}명, 현재 {$lc['current']}명). 편성 화면에서 영웅을 편성하세요.", 422, ['required' => $lc['required'], 'current' => $lc['current'], 'reason' => $lc['reason'], 'lineup_count' => $lc['lineup_count'], 'max' => LineupService::MAX]);
            }
        }
        $rule = $roomFixed ? $this->progress->roomPartyRule($user, $mapId) : null;   // 방 대전: 맵 크기별 고정 출전수
        $party =$this->progress->validateParty($user, $ids, null, $forced, ! empty($state['campaign']), $rule['party_size'] ?? ($slots ? count($slots['free']) : null), $rule['cost_cap'] ?? ($slots['cost_cap'] ?? null));   // 슬롯 모드: 슬롯 수 = 선택 슬롯 수(고정 영웅은 슬롯 면제·코스트 포함), 코스트 상한은 cost_cap 우선
        if ($npcCodes = $this->allyNpcCodes($stage)) {   // 아군 NPC로 등장하는 영웅은 직접 출전 불가
            foreach ($party as $pp) {
                if (in_array($pp['hero']['code'] ?? null, $npcCodes, true)) {
                    throw new IllegalAction('hero_is_ally_npc', '이 스테이지에서는 아군 NPC로 등장하는 영웅이라 출전시킬 수 없습니다: '.($pp['hero']['name_ko'] ?? $pp['hero']['code']), 422);
                }
            }
        }
        if ($enforce) {   // 라인업 밖 영웅 거부(필수·고정·대여 영웅과 주인공(campaign_only)은 면제)
            $out = [];
            foreach ($party as $uhid => $pp) {
                if (! isset($forced[$pp['hero']['code'] ?? '']) && empty($pp['hero']['campaign_only']) && ! in_array((int) $uhid, $lineupIds, true)) {
                    $out[] = ['user_hero_id' => (int) $uhid, 'hero' => $pp['hero']['code'], 'name' => $pp['hero']['name_ko']];
                }
            }
            if ($out) {
                throw new IllegalAction('not_in_lineup', '편성 라인업에 없는 영웅은 출정할 수 없습니다: '.implode(', ', array_column($out, 'name')).'. 편성 화면에서 라인업을 수정하세요.', 422, ['heroes' => $out, 'user_hero_ids' => array_column($out, 'user_hero_id')]);
            }
        }
        if ($stage === null && empty($state['campaign'])) {   // 방(멀티/자유 대전) 경로: 캠페인 전용 영웅(주인공 등) 출전 금지
            foreach ($party as $pp) {
                if (! empty($pp['hero']['campaign_only'])) {
                    throw new IllegalAction('campaign_only_hero', '캠페인 전용 영웅은 방 대전에 출전할 수 없습니다.', 422);
                }
            }
        }
        if ($rule && count($ids) !== $rule['required']) {   // 방 대전: 맵 크기별 출전수 정확히 일치(보유 영웅이 적으면 보유 수)
            throw new IllegalAction('party_size_mismatch', "이 맵은 영웅 {$rule['required']}명을 출전시켜야 합니다.", 422, ['required' => $rule['required'], 'party_size' => $rule['party_size'], 'size_class' => $rule['size_class']]);
        }
        foreach (array_keys($forced) as $code) {   // 강제 출전 영웅은 반드시 포함
            if (! array_filter($party, fn ($p) => ($p['hero']['code'] ?? null) === $code)) {
                throw new IllegalAction('forced_hero_required', '이 스테이지는 필수 출전 영웅이 있습니다(해제 불가): '.($this->data->heroes()[$code]['name_ko'] ?? $code), 422, ['required_hero' => $code]);
            }
        }
        foreach ($forced as $code => $o) {   // 주인공은 지휘관(첫 배치)이어야 한다 -> 기존 지휘관 사망 패배 로직에 통합
            if (! empty($o['protagonist']) && ($party[$ids[0]]['hero']['code'] ?? null) !== $code) {
                throw new IllegalAction('protagonist_must_lead', '주인공을 지휘관(첫 번째 배치)으로 편성해야 합니다.', 422);
            }
        }
        $map = $this->data->map($mapId);
        $zone = array_map(fn ($c) => "{$c[0]},{$c[1]}", $map['deploy_zones'][$side]);
        $engine = $this->engine();
        $used = [];
        $slotAt = [];
        foreach ($slots['fixed'] ?? [] as $sl) {
            $slotAt["{$sl['x']},{$sl['y']}"] = $sl + ['kind' => 'fixed', 'code' => $this->slotHeroCode($sl['hero'], $forced)];
        }
        foreach ($slots['free'] ?? [] as $sl) {
            $slotAt["{$sl['x']},{$sl['y']}"] = $sl + ['kind' => 'free'];
        }
        foreach ($placements as $p) {
            if (! isset($p['x'], $p['y']) || ! is_int($p['x']) || ! is_int($p['y'])) {
                throw new IllegalAction('invalid_placement', '좌표가 올바르지 않습니다.');
            }
            $key = "{$p['x']},{$p['y']}";
            if ($slots !== null) {   // 슬롯 스테이지: 영웅은 지정된 슬롯 타일에만. 고정 슬롯=그 영웅만, 선택 슬롯=(unit_types 있으면) 병종 일치
                $sl = $slotAt[$key] ?? throw new IllegalAction('not_a_slot', '지정된 배치 슬롯 위치가 아닙니다.', 422, ['x' => $p['x'], 'y' => $p['y']]);
                $ph = $party[$p['user_hero_id']]['hero'];
                if ($sl['kind'] === 'fixed' ? ($ph['code'] ?? null) !== $sl['code'] : isset($forced[$ph['code'] ?? ''])) {
                    throw new IllegalAction('slot_hero_mismatch', '고정 슬롯 영웅은 지정된 슬롯에서 옮길 수 없고, 선택 슬롯에는 둘 수 없습니다.', 422, ['slot' => $sl['id']]);
                }
                if ($sl['kind'] === 'free' && ! empty($sl['unit_types']) && ! in_array($ph['unit_type'] ?? null, $sl['unit_types'], true)) {
                    throw new IllegalAction('slot_unit_type_mismatch', '이 슬롯에는 지정된 병종의 영웅만 둘 수 있습니다.', 422, ['slot' => $sl['id'], 'unit_types' => $sl['unit_types']]);
                }
            }
            if (! in_array($key, $zone, true)) {
                throw new IllegalAction('outside_deploy_zone', '배치 가능 영역 밖입니다.');
            }
            $moveType = $this->data->rules()->unitType($party[$p['user_hero_id']]['hero']['unit_type'])['move_type'];
            if (! $engine->passable($state, $moveType, $p['x'], $p['y'])) {
                throw new IllegalAction('impassable_tile', '배치할 수 없는 지형입니다.');
            }
            if (isset($used[$key]) || $engine->unitAt($state, $p['x'], $p['y']) !== null) {
                throw new IllegalAction('tile_occupied', '이미 점유된 타일입니다.');
            }
            $used[$key] = true;
        }
        if (\App\Game\Engine::squadOn($state)) {
            $this->validateTroopPlacements($user, $state, $map, $side, $placements, $party, $used);
        }

        return $party;
    }

    /**
     * squad on: 부대 위치 검증. 영역/통행/중복은 영웅과 동일, 소속 영웅 주변 troop_place_radius칸 이내, 병종은 파티 편성(계획)의 부분집합.
     * 영역 용량 부족은 deploy_capacity_exceeded(422). 위치를 보내지 않은 부대는 자동 배치.
     */
    private function validateTroopPlacements(User $user, array $state, array $map, string $side, array $placements, array $party, array $used): void
    {
        $entries = [];
        foreach ($placements as $p) {
            $entries[] = ['row' => $party[$p['user_hero_id']]['hero'], 'level' => (int) $party[$p['user_hero_id']]['uh']->level, 'key' => $p['user_hero_id']];
        }
        $plan = $this->progress->squadTroops($entries, $user->id, ! empty($state['campaign']));
        $zone = $map['deploy_zones'][$side];
        $total = count($entries) + array_sum(array_map('count', $plan));
        if ($total > count($zone)) {
            throw new IllegalAction('deploy_capacity_exceeded', "배치 영역({$total}기 필요, ".count($zone).'칸)이 부족합니다. 편성(부대 수)을 줄이거나 다른 영웅 구성을 선택하세요.', 422);
        }
        $zoneKeys = array_map(fn ($c) => "{$c[0]},{$c[1]}", $zone);
        $radius = (int) config('game.troop_place_radius');
        $engine = $this->engine();
        foreach (array_values($placements) as $i => $p) {
            $troops = $p['troops'] ?? [];
            if (! is_array($troops)) {
                throw new IllegalAction('invalid_placement', 'troops 형식이 올바르지 않습니다.');
            }
            foreach ($troops as $t) {
                if (! is_array($t) || ! isset($t['class'], $t['x'], $t['y']) || ! is_string($t['class']) || ! is_int($t['x']) || ! is_int($t['y'])) {
                    throw new IllegalAction('invalid_placement', '부대 배치 형식이 올바르지 않습니다.');
                }
                try {
                    $serverType = \App\Game\SquadPlanner::mergePositions($plan[$i], [$t])[0]['type'];   // 고정 병종: 클라이언트 class가 달라도 서버 값 사용(오류 없음)
                } catch (\InvalidArgumentException) {
                    throw new IllegalAction('troop_class_mismatch', "편성된 부대 수를 초과해 위치를 지정했습니다: {$t['class']}", 422);
                }
                $key = "{$t['x']},{$t['y']}";
                if (! in_array($key, $zoneKeys, true)) {
                    throw new IllegalAction('outside_deploy_zone', '부대 배치 가능 영역 밖입니다.', 422);
                }
                $moveType = $this->data->rules()->unitType($serverType)['move_type'];
                if (! $engine->passable($state, $moveType, $t['x'], $t['y'])) {
                    throw new IllegalAction('impassable_tile', '부대를 배치할 수 없는 지형입니다.', 422);
                }
                if (isset($used[$key]) || $engine->unitAt($state, $t['x'], $t['y']) !== null) {
                    throw new IllegalAction('tile_occupied', '이미 점유된 타일입니다.', 422);
                }
                if (abs($t['x'] - $p['x']) + abs($t['y'] - $p['y']) > $radius) {
                    throw new IllegalAction('troop_too_far', "부대는 소속 영웅 주변 {$radius}칸 안에만 배치할 수 있습니다.", 422);
                }
                $used[$key] = true;
                $plan[$i] = \App\Game\SquadPlanner::mergePositions($plan[$i], [$t]);   // 같은 병종을 여러 기 지정할 때 다중집합 소진 검사
                $plan[$i] = array_values(array_filter($plan[$i], fn ($x) => ! is_array($x))) ?: [];
            }
        }
    }

    /** 배치 확정: 지휘관 주변 부대 자동 배치 후 in_progress 전환(선공은 설정값) */
    public function confirmDeployment(User $user, int $battleId): Battle
    {
        return DB::transaction(function () use ($user, $battleId) {
            $b = $this->findOwned($user, $battleId);
            if ($b->status !== 'deployment') {
                throw new IllegalAction('deployment_closed', '이미 확정된 전투입니다.', 409);
            }
            if (empty($b->deployment)) {
                throw new IllegalAction('deployment_missing', '배치를 먼저 제출하세요.');
            }
            $party = $this->validatePlacements($user, $b, $b->deployment);
            $map = $this->data->map((int) $b->map_id);
            $stage = DB::table('stages')->where('id', $b->stage_id)->first();
            $forcedNow = $this->forcedOf($stage, $user, $b->state['deploy_slots'] ?? null);   // 마지막 출격 구성 자동 저장(강제 영웅 제외, 배치 순서 유지)
            $this->progress->rememberLastParty($user, array_values(array_filter(array_column($b->deployment, 'user_hero_id'), fn ($id) => ! isset($forcedNow[$party[$id]['hero']['code']]))));
            $entries = [];
            $positions = [];
            foreach ($b->deployment as $p) {
                $uh = $party[$p['user_hero_id']];
                $entries[] = ['row' => $uh['hero'], 'level' => (int) $uh['uh']->level, 'key' => $p['user_hero_id']];
                $positions[$p['user_hero_id']] = [$p['x'], $p['y']];
            }
            $state = $b->state;
            $presetUnits = $this->data->presetUnits((int) $entries[0]['row']['id'], $entries[0]['row']['unit_type']);   // 프리셋 없으면 병종 기본 편성
            $entries = app(HeroStarService::class)->attach($entries);   // 별(★) 보너스(스테이지 PvE 만 적용)
            $entries = app(EquipmentService::class)->attach($entries);   // 장비 합계(서버가 장착 현황에서 계산, 영웅 유닛만, 스테이지 적 NPC는 해당 없음)
            $squadPlan = $this->squadPlanWithPositions($user, $state, $entries, $b->deployment);   // squad on: 영웅별 부대(+지정 위치)
            ArmyBuilder::addSide($this->engine(), $state, 'a', $entries, $presetUnits, $map['deploy_zones']['a'], $positions, (float) config('game.troop_growth_pct'), $squadPlan);
            foreach ($this->forcedOf($stage, $user, $b->state['deploy_slots'] ?? null) as $fcode => $fo) {   // 캠페인 주인공 사망 = 패배(Engine::resolveDeath의 protagonist 플래그)
                if (! empty($fo['protagonist'])) {
                    foreach ($state['units'] as $uid => $su) {
                        if ($su['side'] === 'a' && ($su['hero'] ?? null) === $fcode) {
                            $state['units'][$uid]['protagonist'] = true;
                        }
                    }
                }
            }
            $state['init_count'] = ['a' => count(array_filter($state['units'], fn ($u) => $u['side'] === 'a'))];   // 별 조건 all_alive 판정용(전투 시작 시 아군 유닛 수)
            $this->spawnAllyNpcs($state, $stage, $map);   // 아군 NPC(stages.rules.ally_npcs): init_count 이후에 추가 -> all_alive 별 조건에서 제외
            $state['side'] = config('game.first_side');
            if (BattleStory::supports((string) $stage->code)) {
                $repeat = DB::table('user_stage_progress')->where(['user_id' => $user->id, 'stage_id' => $b->stage_id])->where('clear_count', '>', 0)->exists();
                BattleStory::initialize($state, $stage->code, $repeat);
                $storyEvents = [];
                BattleStory::collect($state, $storyEvents, true);
                if ($storyEvents !== []) {
                    $this->log($b, 'system', $state['side'], ['type' => 'story_start'], $storyEvents, $state['turn']);
                }
            }
            $cueEvents = [];
            \App\Game\Cues::collect($this->engine(), $state, $cueEvents, true);
            $cueEvents !== [] && $this->log($b, 'system', $state['side'], ['type' => 'cue_start'], $cueEvents, $state['turn']);
            $this->allyPhase($b, $state);   // 선공이 아군이면 NPC가 먼저 자동 행동(없으면 무동작)
            $b->state = $state;
            $b->status = 'in_progress';
            $b->current_side = $state['side'];
            $this->applyStatus($b, $state);   // 아군 NPC 행동/연출로 전투가 이미 끝났으면 종료 상태를 존중(in_progress 로 덮어쓰지 않음)
            $this->persist($b, $b->version);
            if ($b->status === 'in_progress' && $state['side'] === 'b') {
                $this->botTurn($b);
            }
            if ($b->status === 'finished') {
                $this->settle($b, $user);
            }
            $b->refresh();
            $this->syncStageDeadline($b, true);

            return $b;
        });
    }

    /** 플레이어 행동 제출 (서버 검증) */
    public function submitAction(User $user, int $battleId, array $action): array
    {
        // 턴 입력 제한시간: 마감+유예가 지났으면 먼저 별도 트랜잭션으로 자동 종료(커밋)한 뒤, move/attack은 409 turn_timeout, wait/end_turn 등은 오류 없이 적용 생략
        $timeoutEvents = $this->expireTurnIfNeeded($user, $battleId);
        if ($timeoutEvents !== null) {
            if (in_array($action['type'] ?? null, ['move', 'attack', 'use_skill', 'use_item'], true)) {
                throw new IllegalAction('turn_timeout', '턴 입력 시간이 지나 턴이 자동 종료되었습니다.', 409);
            }

            return [$this->findOwned($user, $battleId), $timeoutEvents, true];
        }

        return DB::transaction(function () use ($user, $battleId, $action) {
            $b = $this->findOwned($user, $battleId);
            $this->assertInProgress($b);
            $engine = $this->engine();
            $beforeTurn = $b->turn;
            $npcTarget = $action['unit_id'] ?? ($action['squad_id'] ?? null);   // 교대 행동 activate는 squad_id(영웅 id)로 지정
            if (is_string($npcTarget) && ! empty($b->state['units'][$npcTarget]['npc_ally'])) {   // 아군 NPC는 AI 조종: 플레이어 행동 거부
                throw new IllegalAction('npc_ally_uncontrollable', '아군 NPC는 직접 조종할 수 없습니다.', 403);
            }
            ($action['type'] ?? null) === 'use_item' && is_string($action['item'] ?? null) && app(ItemShopService::class)->assertOwned($user->id, $action['item']);   // 보유 확인(엔진 검증 전)
            [$state, $events] = $engine->apply($b->state, 'a', $action);
            foreach ($events as $ev) {   // 사용 확정 차감(같은 트랜잭션: 이후 예외 시 함께 롤백)
                $ev['type'] === 'item_use' && app(ItemShopService::class)->consume($user->id, (string) $ev['item']);
            }
            BattleStory::collect($state, $events);
            \App\Game\Cues::collect($engine, $state, $events);
            $version = $b->version;
            $this->log($b, 'player', 'a', $action, $events);
            $b->state = $state;
            $this->applyStatus($b, $state);
            $this->persist($b, $version);
            $all = $events;
            if ($b->status === 'in_progress' && $state['side'] === 'b') {
                $all = array_merge($all, $this->botTurn($b));
            }
            if ($b->status === 'finished') {
                $this->settle($b, $user);
            }
            $b->refresh();
            $this->syncStageDeadline($b, $b->turn !== $beforeTurn);

            return [$b, $all, false];
        });
    }

    /** 봇 턴 재시도용(봇 차례인데 중단된 경우) */
    public function runBotTurnIfNeeded(User $user, int $battleId): array
    {
        return DB::transaction(function () use ($user, $battleId) {
            $b = $this->findOwned($user, $battleId);
            $this->assertInProgress($b);
            $events = [];
            if ($b->state['side'] === 'b') {
                $events = $this->botTurn($b);
                if ($b->status === 'finished') {
                    $this->settle($b, $user);
                }
                $b->refresh();
                $this->syncStageDeadline($b, true);
            }

            return [$b->refresh(), $events];
        });
    }

    /**
     * 전투 포기: 소유자만, 배치/진행 중만. 패배 처리(보상 없음, 시작값)하고 settled_at을 채워 이후 정산을 막는다.
     * 이미 포기된 전투에 다시 호출하면 같은 결과를 반환(멱등).
     *
     * @return array{0:Battle,1:array}
     */
    public function abandon(User $user, int $battleId): array
    {
        return DB::transaction(function () use ($user, $battleId) {
            $b = $this->findOwned($user, $battleId);
            if ($b->status === 'abandoned') {
                return [$b, []];
            }
            if (! in_array($b->status, ['deployment', 'in_progress'], true)) {
                throw new IllegalAction('battle_finished', '이미 종료된 전투입니다.', 409);
            }
            $state = $b->state;
            $events = [];
            $state['status'] = 'finished';
            $state['winner'] = 'b';
            Engine::emit($state, $events, 'battle_end', ['winner' => 'b', 'reason' => 'abandoned']);
            $version = $b->version;
            $this->log($b, 'player', 'a', ['type' => 'abandon'], $events);
            $b->state = $state;
            $b->status = 'abandoned';
            $b->winner = 'b';
            $this->persist($b, $version);
            DB::table('battles')->where('id', $b->id)->update([
                'settled_at' => now(),
                'result' => json_encode(['win' => false, 'abandoned' => true, 'stars' => 0, 'gold' => 0, 'heroes' => [], 'user' => null]),
            ]);
            $war = app(WarService::class);
            if ($war->handles($b)) {   // 시즌 영토 전투 포기 = 패배(def_win) 정산, 보상·기여도 없음
                $war->settleAbandoned($b);
            }

            return [$b->refresh(), $events];
        });
    }

    private function assertInProgress(Battle $b): void
    {
        if ($b->status === 'deployment') {
            throw new IllegalAction('deployment_phase', '배치 단계에서는 행동할 수 없습니다.', 409);
        }
        if ($b->status !== 'in_progress') {
            throw new IllegalAction('battle_finished', '이미 종료된 전투입니다.', 409);
        }
    }

    /** @return array 봇 이벤트 */
    public function botTurn(Battle $b): array
    {
        $engine = $this->engine();
        $bot = new HeuristicBot($engine, config('game.bot'));
        $state = $b->state;
        $all = [];
        if (Engine::altOn($state)) {
            // 교대 행동: 봇 차례인 동안 한 번에 1부대씩 활성화·처리(상대가 소진되면 연속 상한까지 이어서 진행). 안전 상한 40회
            for ($i = 0; $i < 40 && $state['status'] === 'active' && $state['side'] === 'b'; $i++) {
                $plan = $bot->planActivation($state, 'b');
                $state['rng'] = $plan['rng'];
                if (! $plan['actions']) {
                    break;
                }
                foreach ($plan['actions'] as $a) {
                    [$state, $events] = $engine->apply($state, 'b', $a);
                    BattleStory::collect($state, $events);
                    \App\Game\Cues::collect($engine, $state, $events);
                    $this->log($b, 'bot', 'b', $a, $events, $state['turn']);
                    $all = array_merge($all, $events);
                    if ($state['status'] !== 'active') {
                        break;
                    }
                }
            }
        } else {
            $plan = $bot->plan($state, 'b');
            $state['rng'] = $plan['rng'];
            foreach ($plan['actions'] as $a) {
                [$state, $events] = $engine->apply($state, 'b', $a);
                BattleStory::collect($state, $events);
                \App\Game\Cues::collect($engine, $state, $events);
                $this->log($b, 'bot', 'b', $a, $events, $state['turn']);
                $all = array_merge($all, $events);
                if ($state['status'] !== 'active') {
                    break;
                }
            }
        }
        $all = array_merge($all, $this->allyPhase($b, $state));   // 플레이어 턴이 시작되면 아군 NPC가 먼저 자동 행동
        $version = $b->version;
        $b->state = $state;
        $this->applyStatus($b, $state);
        $this->persist($b, $version);

        return $all;
    }

    /** 목록 API용 아군 NPC [{code,name}] */
    public function allyNpcView(?object $stage): array
    {
        return array_map(fn ($c) => ['code' => $c, 'name' => $this->data->heroes()[$c]['name_ko'] ?? $c]
            + (ArmyBuilder::isNonHeroObject($c) ? ['non_hero' => true] : [])   // 수레·배 오브젝트 NPC: 장수 목록 제외 표시(전투 유닛 non_hero 와 동일)
            + (str_starts_with($c, 'npc_') ? ['person' => substr($c, 4)] : []), $this->allyNpcCodes($stage));   // person: 같은 인물 실제 영웅 코드(npc_X -> X). 플레이어가 X 를 출전시키면 이 NPC 지원은 배치에서 빠진다
    }

    /** 목록 API용 적 대표(보스) {name,hero_code,npc_ref,unit_type,generic}: rules.enemy_commander 오버라이드 > enemy_squad.commander > 프리셋 영웅. 없으면 null.
     *  generic=true: 고유 인물이 아닌 일반 직함 지휘관(enemy_squad.commander.kind==='generic'이고 hero_code 가 없음). 오버라이드는 이름·hero 만 바꾸므로 hero 가 null 이면 squad 지휘관 kind 를 따른다. */
    public function enemyCommanderView(object $stage): ?array
    {
        $o = (json_decode((string) ($stage->rules ?? ''), true) ?: [])['enemy_commander'] ?? null;
        $sq = json_decode((string) ($stage->enemy_squad ?? ''), true);
        $sqCmd = is_array($sq) && isset($sq['commander']) && is_array($sq['commander']) ? $sq['commander'] : null;
        if (is_array($o) && is_string($o['name'] ?? null) && $o['name'] !== '') {
            $hero = is_string($o['hero'] ?? null) ? $o['hero'] : null;

            return ['name' => $o['name'], 'hero_code' => $hero, 'npc_ref' => null, 'unit_type' => null, 'generic' => $hero === null && ($sqCmd['kind'] ?? null) === 'generic'];
        }
        if ($sqCmd !== null) {
            $c = $sqCmd;

            return ['name' => $c['display_name_ko'] ?? $c['name_ko'] ?? $c['name'] ?? null, 'hero_code' => null, 'npc_ref' => $c['npc_ref'] ?? null, 'unit_type' => $c['unit_type'] ?? null, 'generic' => ($c['kind'] ?? null) === 'generic'];
        }
        $this->presetCache ??= $this->data->presets();   // 목록 API에서 스테이지마다 조회하지 않도록 요청당 1회(heroById는 GameData 캐시)
        $pid = $this->presetCache[(int) $stage->enemy_preset_id]['hero_id'] ?? null;
        $h = $pid !== null ? $this->data->heroById((int) $pid) : null;

        return $h ? ['name' => $h['name_ko'] ?? null, 'hero_code' => $h['code'] ?? null, 'npc_ref' => null, 'unit_type' => $h['unit_type'] ?? null, 'generic' => false] : null;
    }

    /** 목록 API용 진영 국호 {ally,enemy}(stages.rules.factions, 문자열 각 1~12자). 없으면 null */
    public function factionsView(?object $stage): ?array
    {
        $f = (json_decode((string) ($stage->rules ?? ''), true) ?: [])['factions'] ?? null;
        $ok = fn ($v) => is_string($v) && mb_strlen($v) >= 1 && mb_strlen($v) <= 12;
        if (! is_array($f) || ! $ok($f['ally'] ?? null) || ! $ok($f['enemy'] ?? null)) {
            return null;
        }

        return ['ally' => $f['ally'], 'enemy' => $f['enemy']];
    }

    /** 스테이지 아군 NPC 영웅 코드 목록(stages.rules.ally_npcs). 없으면 []. */
    public function allyNpcCodes(?object $stage): array
    {
        return array_column(Engine::normalizeAllyNpcs((json_decode((string) ($stage->rules ?? ''), true) ?: [])['ally_npcs'] ?? null), 'hero');
    }

    /**
     * 스테이지 아군 NPC 생성(stages.rules.ally_npcs, 없으면 무동작): side a 영웅 유닛(kind hero, npc_ally=true, id n0..). 지정 칸이 막혔으면 가까운 빈 통행 칸.
     * 동반 일반병은 game.companions·stage_companions.json 규칙으로 붙는다(id n<i>t<k>). 사망은 기본적으로 패배 조건 아님(must_survive=true면 사망 즉시 패배).
     */
    private function spawnAllyNpcs(array &$state, ?object $stage, array $map): void
    {
        $list = Engine::normalizeAllyNpcs((json_decode((string) ($stage->rules ?? ''), true) ?: [])['ally_npcs'] ?? null);
        $set = ArmyBuilder::companionSettings((string) ($stage->code ?? ''));
        $state['companions'] = ! empty($set['enabled']) ? array_intersect_key($set, array_flip(['max', 'enemy', 'ally', 'ally_by_hero', 'ally_exclude'])) : null;   // 큐로 소환되는 영웅(진영 a/b)의 동반 일반병 설정을 전투에 고정(Cues::spawnCompanions)
        if ($list === []) {
            return;
        }
        $comp = ! empty($set['enabled']) ? function (string $code) use ($set): int {   // 아군 NPC 영웅당 동반 일반병 수(제외 영웅=0, 영웅별 override > 스테이지 기본)
            return in_array($code, $set['ally_exclude'], true) ? 0 : min((int) $set['max'], max(0, (int) ($set['ally_by_hero'][$code] ?? $set['ally'])));
        } : null;
        $rep = ArmyBuilder::addAllyNpcs($this->engine(), $state, $list, 'a', function (string $code) {
            $hid = $this->data->heroes()[$code]['id'] ?? null;

            return $hid !== null ? $this->data->heroById((int) $hid) : null;
        }, max(1, (int) ($stage->recommended_level ?? 1)), (float) config('game.troop_growth_pct'), $map['deploy_zones']['a'], $comp);
        $rep['skipped'] > 0 && \Illuminate\Support\Facades\Log::info('companions(ally): 일부 동반병 생략(빈 칸/상한)', ['stage' => $stage->code ?? null] + $rep);
    }

    /** 아군 NPC 자동 행동: side a 차례일 때 npc_ally 유닛만 휴리스틱 봇이 행동(end_turn 없음). 교대 행동(alt) 모드에서는 NPC가 부대 순서에서 제외되어 행동하지 않는다(라운드 진행을 막지 않음). @return array 이벤트 */
    private function allyPhase(Battle $b, array &$state): array
    {
        $ids = array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && empty($u['moved'])));
        if ($ids === [] || Engine::altOn($state) || ($state['status'] ?? 'active') !== 'active' || $state['side'] !== 'a') {
            return [];
        }
        $engine = $this->engine();
        $all = [];
        foreach ($ids as $k => $rid) {   // route 가 있는 NPC(ally_npcs[].route)는 봇 대신 경로 이동 AI(RouteAi)로만 움직인다
            if (! isset($state['units'][$rid])) {   // 앞선 동작의 cue(이탈·퇴각 등)로 제거된 유닛
                unset($ids[$k]);

                continue;
            }
            if (empty($state['units'][$rid]['route'])) {
                continue;
            }
            unset($ids[$k]);
            if (($a = \App\Game\RouteAi::step($engine, $state, (string) $rid)) === null) {
                continue;
            }
            [$state, $events] = $engine->apply($state, 'a', $a);
            BattleStory::collect($state, $events);
            \App\Game\Cues::collect($engine, $state, $events);
            $this->log($b, 'bot', 'a', $a + ['npc_ally' => true], $events, $state['turn']);
            $all = array_merge($all, $events);
            if ($state['status'] !== 'active') {
                return $all;
            }
        }
        foreach ($ids as $k => $fid) {   // route 영웅의 동반 병사는 봇 대신 영웅을 따라간다(영웅 곁 2칸 이내 유지, RouteAi::followStep)
            if (! isset($state['units'][$fid])) {   // 앞선 동작의 cue 로 제거된 유닛
                unset($ids[$k]);

                continue;
            }
            if (! \App\Game\RouteAi::followsRouteLeader($state, $state['units'][$fid])) {
                continue;
            }
            unset($ids[$k]);
            if (($a = \App\Game\RouteAi::followStep($engine, $state, (string) $fid)) === null) {
                continue;
            }
            [$state, $events] = $engine->apply($state, 'a', $a);
            BattleStory::collect($state, $events);
            \App\Game\Cues::collect($engine, $state, $events);
            $this->log($b, 'bot', 'a', $a + ['npc_ally' => true], $events, $state['turn']);
            $all = array_merge($all, $events);
            if ($state['status'] !== 'active') {
                return $all;
            }
        }
        $ids = array_values(array_filter($ids, fn ($id) => isset($state['units'][$id])));   // cue 로 제거된 유닛 제외
        if ($ids === []) {
            return $all;
        }
        $plan = (new HeuristicBot($engine, config('game.bot')))->planUnits($state, 'a', $ids);
        $state['rng'] = $plan['rng'];
        foreach ($plan['actions'] as $a) {
            [$state, $events] = $engine->apply($state, 'a', $a);
            BattleStory::collect($state, $events);
            \App\Game\Cues::collect($engine, $state, $events);
            $this->log($b, 'bot', 'a', $a + ['npc_ally' => true], $events, $state['turn']);
            $all = array_merge($all, $events);
            if ($state['status'] !== 'active') {
                break;
            }
        }

        return $all;
    }

    public function applyStatus(Battle $b, array $state): void
    {
        $b->turn = $state['turn'];
        $b->current_side = $state['side'];
        if ($state['status'] === 'finished') {
            $b->status = 'finished';
            $b->winner = $state['winner'];
        }
    }

    /** 낙관적 락: version이 읽은 값과 같을 때만 갱신 */
    public function persist(Battle $b, int $readVersion): void
    {
        $n = DB::table('battles')->where('id', $b->id)->where('version', $readVersion)->update([
            'state' => json_encode($b->state), 'status' => $b->status, 'turn' => $b->turn, 'current_side' => $b->current_side,
            'winner' => $b->winner, 'version' => $readVersion + 1, 'last_event_seq' => (int) ($b->state['event_seq'] ?? 0), 'updated_at' => now(),
        ]);
        if ($n === 0) {
            throw new IllegalAction('version_conflict', '동시에 변경되었습니다. 다시 시도하세요.', 409);
        }
        $b->version = $readVersion + 1;
    }

    public function log(Battle $b, string $actor, string $side, array $action, array $events, ?int $turn = null): void
    {
        $seq = (int) DB::table('battle_actions')->where('battle_id', $b->id)->max('seq') + 1;
        $seqs = array_column($events, 'seq');   // 폴링 증분 조회용 이벤트 seq 범위
        DB::table('battle_actions')->insert([
            'first_event_seq' => $seqs ? min($seqs) : null, 'last_event_seq' => $seqs ? max($seqs) : null,
            'battle_id' => $b->id, 'seq' => $seq, 'turn' => $turn ?? $b->state['turn'], 'side' => $side, 'actor' => $actor,
            'type' => $action['type'], 'payload' => json_encode($action), 'events' => json_encode($events), 'created_at' => now(),
        ]);
    }

    /**
     * PvP 인정 판정(settle 1회만 호출: 일일 쌍 카운터를 소모하므로 부작용 있음).
     * ①turn >= quests.pvp_min_rounds ②양측 모두 move/attack 1회 이상 ③동일 상대쌍(정렬된 user id) 일일 인정 상한 ④기권 종료도 ①~③ 충족 시에만(승자만 인정하는 처리는 호출부)
     */
    private function pvpRecognized(Battle $b, bool $forfeit): bool
    {
        if (! $b->user_id || ! $b->opponent_user_id || (int) $b->turn < (int) config('game.quests.pvp_min_rounds', 3)) {
            return false;
        }
        $sides = DB::table('battle_actions')->where('battle_id', $b->id)->where('actor', 'player')->whereIn('type', ['move', 'attack'])->distinct()->pluck('side')->all();
        if (! in_array('a', $sides, true) || ! in_array('b', $sides, true)) {
            return false;
        }
        $ids = [(int) $b->user_id, (int) $b->opponent_user_id];
        sort($ids);

        return DailyCounter::tryIncrement('pvp_pair:'.$ids[0].':'.$ids[1], (int) config('game.quests.pvp_pair_daily_cap', 3));
    }

    /** 정산: battle당 1회(settled_at 조건부 갱신으로 멱등), 정상 종료(finished)일 때만 */
    public function settle(Battle $b, User $user): void
    {
        if ($b->status !== 'finished' || $b->user_id !== $user->id) {
            return;
        }
        $war = app(WarService::class);   // 시즌 영토 전투면 별도 핸들러로 위임(보상·퀘스트 등 free/stage/pvp 정산과 분리). 아니면 아래 기존 경로 그대로
        if ($war->handles($b)) {
            $war->settleBattle($b, $user);

            return;
        }
        $claimed = DB::table('battles')->where('id', $b->id)->whereNull('settled_at')->update(['settled_at' => now()]);
        if ($claimed === 0) {
            return;
        }
        if ($b->mode === 'pvp') {   // PvP는 보상 없음(시작값): 협력 파밍 방지
            $res = ['win' => $b->winner === 'a', 'winner' => $b->winner, 'pvp' => true, 'gold' => 0, 'heroes' => [], 'user' => null];
            $upd = ['result' => json_encode($res)];
            $forfeit = str_starts_with((string) ($b->state['end_reason'] ?? ''), 'forfeit_');
            $recognized = $this->pvpRecognized($b, $forfeit);   // 퀘스트·주간 랭킹 공통 인정 기준(최소 라운드·양측 행동·동일 상대쌍 일일 상한)
            if (\Illuminate\Support\Facades\Schema::hasColumn('battles', 'pvp_recognized')) {
                $upd['pvp_recognized'] = $recognized;
            }
            // 랭킹 집계용 승자 user_id 기록(컬럼이 없는 환경은 건너뜀). 무승부(winner a/b 아님)는 null
            if (\Illuminate\Support\Facades\Schema::hasColumn('battles', 'winner_user_id')) {
                $upd['winner_user_id'] = $b->winner === 'a' ? $b->user_id : ($b->winner === 'b' ? $b->opponent_user_id : null);
                $upd['win_by_forfeit'] = str_starts_with((string) ($b->state['end_reason'] ?? ''), 'forfeit_');
            }
            DB::table('battles')->where('id', $b->id)->update($upd);
            $b->result = $res;
            if (config('game.rank.enabled')) {   // 랭크 매치면 Elo 반영(플래그 off 면 실행 안 함). 실패해도 기존 정산은 영향 없음
                try {
                    app(RankService::class)->onBattleSettled($b);
                } catch (\Throwable $e) {
                    report($e);
                }
            }
            // 퀘스트 훅(멱등, 실패 무시): 인정 판만. 정상 종료는 양측 pvp_play, 기권 종료는 승자만(패자 기권자는 pvp_play 비인정). 승자만 pvp_win
            if ($recognized) {
                $qs = app(QuestService::class);
                $wid = $b->winner === 'a' ? $b->user_id : ($b->winner === 'b' ? $b->opponent_user_id : null);
                foreach (array_filter([$b->user_id, $b->opponent_user_id]) as $uid) {
                    if ($forfeit && (int) $uid !== (int) $wid) {
                        continue;
                    }
                    $qs->record((int) $uid, 'pvp_play', 'battle:'.$b->id);
                }
                $wid && $qs->record((int) $wid, 'pvp_win', 'battle:'.$b->id);
            }

            return;
        }
        $stage = $b->stage_id ? DB::table('stages')->where('id', $b->stage_id)->first() : null;
        $fr = config('game.free_reward');   // 자유 대전(스테이지 없음) 보상: 축소 고정값(시작값)
        $stage ??= (object) ['reward_exp' => $fr['exp'], 'reward_user_exp' => $fr['user_exp'], 'reward_gold' => $fr['gold'], 'id' => null];
        $win = $b->winner === 'a';
        $expRatio = $win ? 1.0 : (float) config('game.exp_lose_ratio');
        $goldRatio = $win ? 1.0 : (float) config('game.gold_lose_ratio');
        $heroGain = (int) floor($stage->reward_exp * $expRatio);
        $userGain = (int) floor($stage->reward_user_exp * $expRatio);
        $gold = (int) floor($stage->reward_gold * $goldRatio);

        // 자유 대전 어뷰징 방지: 최소 진행 턴 미달 / 유저별 일일 보상 상한(KST 05:00 기준) 초과 시 전투 결과는 유지하되 보상 0 + 사유 코드
        $rewardBlocked = null;
        if ($stage->id === null) {
            $lim = config('game.free_limits');
            $total = $heroGain + $userGain + $gold;
            if ($b->turn < (int) $lim['min_turns']) {
                $rewardBlocked = 'too_short';
            } elseif ($total > 0 && ! DailyCounter::tryIncrement('free_reward:user:'.$user->id, (int) $lim['daily_reward_cap'], $total)) {
                $rewardBlocked = 'daily_cap';
            }
            if ($rewardBlocked !== null) {
                $heroGain = $userGain = $gold = 0;
            }
        }

        // 별점(승리+스테이지)은 보상 배율에 쓰이므로 정산 전에 계산. 재도전 판정은 이번 클리어 반영 전 clear_count 기준
        $stars = 0;
        $prevClears = 0;
        $starDetail = null;
        if ($win && $stage->id !== null) {
            $conds = json_decode((string) ($stage->star_conditions ?? ''), true);
            if (is_array($conds) && $conds !== []) {   // 스테이지별 별 조건(캠페인). null이면 아래 기존 하드코딩 계산 유지
                [$stars, $starDetail] = $this->starsFromConditions($b, $conds);
            } else {
                $cmd = $b->state['units']['a0'] ?? null;
                $stars = 1 + (($cmd && $cmd['hp'] >= $cmd['max_hp'] * 0.5) ? 1 : 0) + ($b->turn <= 15 ? 1 : 0);
            }
        }
        if ($stage->id !== null) {   // 재도전 판정(승·패 공통): 이번 클리어 반영 전 clear_count 기준
            $prevClears = (int) DB::table('user_stage_progress')->where(['user_id' => $user->id, 'stage_id' => $stage->id])->value('clear_count');
        }
        $rs = config('game.reward_scale');
        $mult = 1.0;
        if ($stage->id !== null && $rewardBlocked === null) {
            // 승: 별점 x 재도전 배율 / 패: 재도전 배율만(별점 없음). 일일 상한은 승·패 공유 카운터(패배는 지급할 보상이 있을 때만 소모)
            $mult = ($win ? (float) ($rs['star_mult'][$stars] ?? 1.0) : 1.0) * ($prevClears > 0 ? (float) $rs['retry_mult'] : 1.0);
            $cap = (int) $rs['stage_daily_cap'];
            if ($cap > 0 && ($win || $heroGain + $userGain + $gold > 0) && ! DailyCounter::tryIncrement('stage_reward:user:'.$user->id.':stage:'.$stage->id, $cap)) {
                $rewardBlocked = 'stage_daily_cap';
                $heroGain = $userGain = $gold = 0;
            }
        }
        if ($mult !== 1.0 && $rewardBlocked === null) {
            $heroGain = (int) floor($heroGain * $mult);
            $userGain = (int) floor($userGain * $mult);
            $gold = (int) floor($gold * $mult);
        }

        $heroResults = [];
        $deployed = [];
        foreach ($b->deployment as $p) {
            $deployed[] = (int) $p['user_hero_id'];
            $heroResults[] = $this->progress->addHeroExp($p['user_hero_id'], $this->levelGapExp($heroGain, $p['user_hero_id'], $stage, $rs));
        }
        $benchPct = (int) $rs['bench_exp_pct'];
        if ($benchPct > 0 && $heroGain > 0) {   // 파티에 있으나 미참전인 영웅(벤치) 경험치
            $benchIds = DB::table('parties')->where('user_id', $user->id)->whereNotIn('user_hero_id', $deployed)->pluck('user_hero_id');
            foreach ($benchIds as $uhId) {
                $heroResults[] = $this->progress->addHeroExp((int) $uhId, $this->levelGapExp((int) floor($heroGain * $benchPct / 100), (int) $uhId, $stage, $rs)) + ['bench' => true];
            }
        }
        $userResult = $this->progress->addUserExp($user, $userGain);
        if ($gold > 0) {
            $this->progress->credit($user->id, 'gold', $gold, 'stage_reward', 'battle', $b->id);
        }
        if ($win && $stage->id !== null) {
            DB::table('user_stage_progress')->insertOrIgnore(['user_id' => $user->id, 'stage_id' => $stage->id, 'created_at' => now(), 'updated_at' => now()]);
            DB::table('user_stage_progress')->where(['user_id' => $user->id, 'stage_id' => $stage->id])->update([
                'clear_count' => DB::raw('clear_count + 1'), 'best_stars' => DB::raw('MAX(best_stars, '.(int) $stars.')'),
                'cleared_at' => now(), 'updated_at' => now(),
            ]);
        }
        $penFirst = ($win && $stage->id !== null && $prevClears === 0) ? app(PenService::class)->grantStageFirstClear((int) $user->id, (int) $stage->id) : 0;   // 스테이지 첫 클리어 펜(game.pen.pve_first_clear, 기본 OFF=0)
        $joined = ($win && $stage->id !== null && $prevClears === 0) ? $this->grantJoinHeroes($user, $stage) : [];   // 첫 클리어 합류 영웅(stages.join_hero)
        $firstGrant = [];
        if ($win && $stage->id !== null && $prevClears === 0) {   // 첫 클리어 1회 지급(장비·레벨 보장, stage_first_clear_grants.json): 실패해도 승리 정산은 계속(QuestService 훅과 동일하게 로그만)
            try {
                $firstGrant = app(StageGrantService::class)->grantFirstClear($user, (string) ($stage->code ?? ''));
            } catch (\Throwable $e) {
                \Illuminate\Support\Facades\Log::warning('first_clear_grant_failed', ['user_id' => $user->id, 'stage' => $stage->code ?? null, 'error' => $e->getMessage()]);
            }
        }
        if ($stage->id !== null) {   // 퀘스트 훅(멱등, 실패 무시): 스테이지 전투만(자유 대전 제외)
            $qs = app(QuestService::class);
            $qs->record($user->id, 'stage_play', 'battle:'.$b->id);
            if ($win) {
                $qs->record($user->id, 'stage_win', 'battle:'.$b->id);
                $qs->record($user->id, 'stage_clear', 'battle:'.$b->id, 1, (string) ($stage->code ?? ''));
            }
        }
        $result = [
            'win' => $win, 'winner' => $b->winner, 'stars' => $stars, 'gold' => $gold,
            'heroes' => $heroResults, 'user' => $userResult, 'reward_blocked' => $rewardBlocked,
            'reward_mult' => round($mult, 4), 'first_clear' => $win && $stage->id !== null ? $prevClears === 0 : null,
            'affinity_kills' => $this->affinityKills($b),
        ] + ($starDetail !== null ? ['star_detail' => $starDetail] : []) + ($joined !== [] ? ['joined_heroes' => $joined] : []) + ($penFirst > 0 ? ['pen_first_clear' => $penFirst] : []) + (($firstGrant['equipment'] ?? []) !== [] || ($firstGrant['levels'] ?? []) !== [] ? ['first_clear_grant' => $firstGrant] : []);
        DB::table('battles')->where('id', $b->id)->update(['result' => json_encode($result)]);
        $b->result = $result;
    }

    /** 상성 유리(affinity=adv) 공격으로 아군(a측 유닛)이 적을 처치한 횟수. 이벤트 type=attack만 집계(counter=반격 처치 제외). battle_actions.events 기준 */
    private function affinityKills(Battle $b): int
    {
        $units = $b->state['units'] ?? [];
        $n = 0;
        foreach (DB::table('battle_actions')->where('battle_id', $b->id)->pluck('events') as $json) {
            foreach ((array) json_decode((string) $json, true) as $e) {
                if (($e['type'] ?? '') === 'attack' && ! empty($e['kill']) && ($e['affinity'] ?? '') === 'adv'
                    && (($units[$e['actor_unit_id'] ?? '']['side'] ?? null) === 'a')) {
                    $n++;
                }
            }
        }

        return $n;
    }

    /**
     * 별 조건 평가(승리 시): clear=승리, all_alive=시작 때 아군 유닛이 모두 생존, turn_within=종료 턴 <= value, commander_hp_pct_min=지휘관(a0) HP% >= value.
     * 별 수 = 충족 조건 수(1~3, 승리면 최소 1). 알 수 없는 type은 미충족.
     *
     * @return array{0:int,1:array<int,array{type:string,value:?int,met:bool}>}
     */
    private function starsFromConditions(Battle $b, array $conds): array
    {
        $st = $b->state;
        $alive = count(array_filter($st['units'], fn ($u) => $u['side'] === 'a' && empty($u['npc_ally'])));   // 아군 NPC는 all_alive에서 제외
        $cmd = $st['units']['a0'] ?? null;
        $detail = [];
        foreach ($conds as $c) {
            $type = (string) ($c['type'] ?? '');
            $v = isset($c['value']) ? (int) $c['value'] : null;
            $met = match ($type) {
                'clear' => true,
                'all_alive' => isset($st['init_count']['a']) && $alive >= (int) $st['init_count']['a'],
                'turn_within' => $v !== null && (int) $b->turn <= $v,
                'sub_objective' => is_string($c['id'] ?? null) && \App\Game\SubObjectives::met($st, $c['id']),
                'commander_hp_pct_min' => $v !== null && $cmd !== null && $cmd['hp'] * 100 >= $cmd['max_hp'] * $v,
                default => false,
            };
            $detail[] = ['type' => $type, 'value' => $v, 'met' => $met] + ($type === 'sub_objective' ? ['id' => $c['id'] ?? null] : []);
        }
        $n = count(array_filter($detail, fn ($d) => $d['met']));

        return [max(1, min(3, $n)), $detail];
    }

    /** stages.join_hero(condition=first_clear) 영웅 지급: 미보유면 Lv1로 추가, 이미 보유면 변화 없음(멱등). @return array<int,array{hero:string,is_new:bool}> */
    private function grantJoinHeroes(User $user, object $stage): array
    {
        $list = json_decode((string) ($stage->join_hero ?? ''), true);
        if (! is_array($list)) {
            return [];
        }
        $heroes = $this->data->heroes();
        $out = [];
        foreach ($list as $j) {
            $code = (string) ($j['hero_code'] ?? '');
            if (($j['condition'] ?? 'first_clear') !== 'first_clear' || ! isset($heroes[$code])) {
                continue;
            }
            $n = DB::table('user_heroes')->insertOrIgnore([
                'user_id' => $user->id, 'hero_id' => $heroes[$code]['id'], 'level' => 1, 'exp' => 0,
                'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            if ($n > 0) {
                app(LineupService::class)->autoAdd((int) $user->id, (int) DB::table('user_heroes')->where(['user_id' => $user->id, 'hero_id' => $heroes[$code]['id']])->value('id'));
            }
            $out[] = ['hero' => $code, 'is_new' => $n > 0];
        }

        return $out;
    }

    /** 레벨차 감소: 스테이지 enemy_level이 영웅 레벨보다 low_level_gap 이상 낮으면 exp x low_level_mult(스테이지 없는 자유 대전은 제외) */
    public function levelGapExp(int $exp, int $userHeroId, object $stage, array $rs): int
    {
        if ($exp <= 0 || $stage->id === null || (float) $rs['low_level_mult'] === 1.0) {
            return $exp;
        }
        $lv = (int) DB::table('user_heroes')->where('id', $userHeroId)->value('level');

        return $lv - (int) $stage->enemy_level >= (int) $rs['low_level_gap'] ? (int) floor($exp * (float) $rs['low_level_mult']) : $exp;
    }

    /** 턴 입력 제한시간(초). 0이면 해제(PvP 방 전투가 아니면 항상 0, config 0 또는 state.no_turn_timer=true: 튜토리얼 전투용 여지, 교대 행동 on 전투 제외) */
    public function turnInputSeconds(Battle $b): int
    {
        if ($b->mode !== 'pvp') {   // 제한시간은 PvP 방 대전에만 적용: 스테이지(캠페인·튜토리얼)·solo 방(봇 상대)은 없음
            return 0;
        }
        if (($b->state['no_turn_timer'] ?? false) || Engine::altOn($b->state)) {
            return 0;
        }

        return max(0, (int) config('game.turn_input_seconds', 60));
    }

    private function nowMs(): int
    {
        return (int) now()->getPreciseTimestamp(3);
    }

    private function graceSeconds(): int
    {
        return max(0, (int) config('game.turn_input_grace_seconds', 2));
    }

    /**
     * 스테이지 전투(room_id null)의 내 턴 마감(battles.turn_deadline_at) 동기화. 방 전투는 RoomService가 같은 컬럼을 관리한다.
     * $reset=true(턴 시작)이거나 마감이 비어 있으면 now+제한시간으로 설정, 봇 차례·종료·제한 해제면 null.
     */
    public function syncStageDeadline(Battle $b, bool $reset): void
    {
        if ($b->room_id !== null) {
            return;
        }
        $secs = $this->turnInputSeconds($b);
        if ($b->status !== 'in_progress' || $b->state['side'] !== 'a' || $secs <= 0) {
            if (! $b->turn_deadline_at) {
                return;
            }
            $new = null;
        } elseif ($reset || ! $b->turn_deadline_at) {
            $new = now()->addSeconds($secs);
        } else {
            return;
        }
        DB::table('battles')->where('id', $b->id)->update(['turn_deadline_at' => $new]);
        $b->turn_deadline_at = $new;
    }

    /**
     * 지연 평가: 내 턴 마감+유예가 지났으면 미행동 유닛을 대기 처리하고(end_turn) 봇 턴까지 진행. 별도 트랜잭션으로 커밋된다.
     *
     * @return array|null 타임아웃이 발생했으면 그 이벤트(빈 배열 가능), 아니면 null
     */
    public function expireTurnIfNeeded(User $user, int $battleId): ?array
    {
        try {
            return $this->expireTurnInTx($user, $battleId);
        } catch (IllegalAction $e) {
            if ($e->reason === 'version_conflict') {   // R3: 동시 요청이 먼저 상태를 바꿨음 -> 롤백된 지연 평가는 버리고 호출부가 최신 상태를 재조회하게 함
                return null;
            }
            throw $e;
        }
    }

    private function expireTurnInTx(User $user, int $battleId): ?array
    {
        return DB::transaction(function () use ($user, $battleId) {
            $b = $this->findOwned($user, $battleId);
            if ($b->status !== 'in_progress' || $b->state['side'] !== 'a' || $this->turnInputSeconds($b) <= 0) {
                return null;
            }
            if (! $b->turn_deadline_at) {   // 구 전투(마감 미기록): 지금부터 시작
                $this->syncStageDeadline($b, false);

                return null;
            }
            if (now()->lte(\Illuminate\Support\Carbon::parse($b->turn_deadline_at)->addSeconds($this->graceSeconds()))) {
                return null;
            }
            $action = ['type' => 'end_turn'];
            [$state, $events] = $this->engine()->apply($b->state, 'a', $action);
            $version = $b->version;
            $this->log($b, 'system', 'a', $action + ['auto' => true, 'reason' => 'turn_timeout'], $events);
            $b->state = $state;
            $this->applyStatus($b, $state);
            $this->persist($b, $version);
            $all = $events;
            if ($b->status === 'in_progress' && $state['side'] === 'b') {
                $all = array_merge($all, $this->botTurn($b));
            }
            if ($b->status === 'finished') {
                $this->settle($b, $user);
            }
            $b->refresh();
            $this->syncStageDeadline($b, true);

            return $all;
        });
    }

    /** @return array{turn_input_seconds:int, turn_deadline:?int} turn_deadline=현재 턴 입력 마감(epoch ms, 진행 중이 아니거나 봇 차례/해제면 null) */
    public function turnView(Battle $b): array
    {
        $secs = $this->turnInputSeconds($b);
        if ($secs === 0 && $b->room_id !== null && $b->mode === 'pvp' && Engine::altOn($b->state) && ! ($b->state['no_turn_timer'] ?? false)) {
            // R8: 방 전투는 교대 행동이어도 서버(RoomService::tick)가 활성화당 마감(timeoutActivation)을 강제하므로 방 제한시간·마감을 그대로 노출
            $secs = max(0, (int) DB::table('rooms')->where('id', $b->room_id)->value('turn_limit_seconds'));
        }
        $d = $b->status === 'in_progress' && $secs > 0 && $b->turn_deadline_at ? (int) \Illuminate\Support\Carbon::parse($b->turn_deadline_at)->getPreciseTimestamp(3) : null;

        return ['turn_input_seconds' => $secs, 'turn_deadline' => $d, 'server_time' => $this->nowMs()];   // server_time: 시계 차이 보정용(epoch ms)
    }

    /** 일반 공격 예측(조회 전용: state 저장·턴 만료 처리·이벤트 기록 없음). 소유자 전투만(타인 404), 진행 중만, 아군 NPC 거부 */
    public function forecastAttack(User $user, int $battleId, array $a): array
    {
        $b = $this->findOwned($user, $battleId);
        $this->assertInProgress($b);
        $unit = (string) $a['unit_id'];
        if (! empty($b->state['units'][$unit]['npc_ally'])) {
            throw new IllegalAction('npc_ally_uncontrollable', '아군 NPC는 직접 조종할 수 없습니다.', 403);
        }

        return $this->engine()->previewAttack($b->state, 'a', $unit, (string) $a['target_id'], $a['x'] ?? null, $a['y'] ?? null);
    }

    /** 유닛 이동 가능 타일·공격 대상 조회(조회 전용) + 턴 마감 정보. $side=조회자 진영 */
    public function unitMoves(Battle $b, string $unit, string $side): array
    {
        $engine = $this->engine();
        $u = $b->state['units'][$unit];
        $tiles = [];
        $locked = Engine::altOn($b->state) && ($b->state['alt']['active'] ?? null) !== $engine->squadKey($b->state, $u) && ! $engine->altImplicitOk($b->state, $u);   // 교대 행동: 활성 부대 유닛만 조회 가능(없으면 빈 결과)
        if ($locked) {
            // 활성화 전 미리보기(읽기 전용, 상태 변경 없음): 활성화 없이 계산한 이동 가능 칸. tiles는 계속 빈 배열(FE 호환), no_moves=이동·공격 가능한 행동이 없음(대기만 가능)
            $preview = [];
            if (! $u['moved'] && ! $u['acted']) {
                foreach ($engine->reachable($b->state, $unit) as $k => $cost) {
                    [$x, $y] = array_map('intval', explode(',', $k));
                    $preview[] = ['x' => $x, 'y' => $y, 'cost' => $cost];
                }
            }
            $previewTargets = $u['acted'] ? [] : $engine->targetsFrom($b->state, $u, $u['x'], $u['y']);

            return ['unit_id' => $unit, 'tiles' => [], 'targets' => [], 'locked' => true, 'reason' => 'squad_locked', 'active_squad' => $b->state['alt']['active'] ?? null,
                'preview_tiles' => $preview, 'preview_targets' => $previewTargets,
                'no_moves' => count($preview) <= 1 && $previewTargets === []];   // preview에는 현재 위치(cost 0) 포함 -> 1칸 이하면 이동 불가
        }
        if (! $u['moved'] && ! $u['acted']) {
            foreach ($engine->reachable($b->state, $unit) as $k => $cost) {
                [$x, $y] = array_map('intval', explode(',', $k));
                $tiles[] = ['x' => $x, 'y' => $y, 'cost' => $cost];
            }
        }

        return ['unit_id' => $unit, 'tiles' => $tiles, 'targets' => $u['acted'] ? [] : $engine->targetsFrom($b->state, $u, $u['x'], $u['y'])] + $this->turnView($b);
    }

    /** 클라이언트용 상태 뷰 */
    /** 유닛 뷰에 active_skills[](액티브 보유 영웅만, 없으면 키 생략=하위 호환) 덧붙임. actives/skill_state 원본은 그대로 유지 */
    private function withActiveView(array $state, array $u, ?string $viewerSide = 'a'): array
    {
        if (($res = \App\Game\Elements::unitResists($u)) !== []) {
            $u['resists'] = $res;   // 속성 내성(%, 양수=내성/음수=약점, 병종+영웅 기준. 지형 보정은 전투 중 타일별). 없으면 키 생략
        }
        if (! empty($u['actives'])) {
            $u['active_skills'] = array_map(fn ($s) => $s + ['effect' => $this->data->displayEffect('active', (string) ($s['template'] ?? ''), (array) ($s['params'] ?? []))], $this->engine()->activeSkillView($state, $u));   // effect: 스킬 효과 설명 텍스트(스킬 메뉴 표시용)
            if ($u['side'] !== $viewerSide) {   // MP 방식: 상대 영웅은 비율(mp_pct)만 공개
                $mpOn = Engine::mpOn($state);
                $u['active_skills'] = array_map(function ($s) use ($mpOn) {
                    unset($s['mp_left']);
                    if ($mpOn) {   // MP 방식: mp_cost는 정적 카탈로그라 공개. usable(1비트)·targets(usable 누설)는 비공개
                        unset($s['usable']);
                        $s['targets'] = [];
                    }

                    return $s;
                }, $u['active_skills']);
            }
        }

        return Engine::redactUnitMp($u, $viewerSide);
    }

    /** 수상 파생 상태(저장 안 함 -> 진행 중 전투 호환): boarded=배 탑승(sea·reef 위 foot·mounted·heavy), naval=수병(항상 자기 배), on_water=수상 칸 */
    private function waterView(array $state, array $u): array
    {
        $rules = $this->data->rules();
        $terr = $state['tiles'][$u['y']][$u['x']] ?? 'plain';

        return ['boarded' => $rules->isBoarded($u['type'], $terr), 'naval' => ($rules->unitTypes[$u['type']]['move_type'] ?? null) === 'naval', 'on_water' => $rules->isWater($terr)];
    }

    /** $viewerSide = 보는 사람의 진영(스테이지·솔로는 항상 a, 방은 내 진영, 관전 등 미상이면 null=전원 가림) */
    public function view(Battle $b, ?string $viewerSide = 'a'): array
    {
        return $this->turnView($b) + [
            'battle_id' => $b->id, 'status' => $b->status, 'version' => $b->version, 'turn' => $b->turn,
            'current_side' => $b->current_side, 'winner' => $b->winner, 'stage_id' => $b->stage_id,
            'story_events' => $b->state['story_events'] ?? [], 'cues' => \App\Game\Cues::view($b->state), 'sub_objectives' => \App\Game\SubObjectives::view($b->state),
            'map_code' => $this->data->mapMeta((int) $b->map_id)['code'], 'biome' => $this->data->mapMeta((int) $b->map_id)['biome'],
            'width' => $b->state['width'], 'height' => $b->state['height'], 'tiles' => $b->state['tiles'],
            'units' => array_map(fn ($u) => $this->withActiveView($b->state, $u, $viewerSide) + $this->waterView($b->state, $u), $this->withPortraits($b, $this->data->withTitles(array_values($b->state['units'])))),
            // 교대 행동(off면 alternate=false, alt=null): round, active_squad, consecutive{side,count,cap}, squads[{id,side,status,unit_ids}]
            'objective' => Engine::objectiveView($b->state), 'objective_points' => $this->objectivePoints($b->state), 'triggers' => Engine::triggersView($b->state),   // capture: points/mode/hold_turns/held/progress. triggers: 증원 예고 [{turn,side,count,zone,cells}]
            // survive_turns: 승리까지 남은 라운드 수(현재 라운드 포함: turns - turn + 1, 종료 후 0). 그 외 목표는 null
            'survive_remaining' => ($sv = Engine::surviveTurns($b->state)) !== null ? ($b->status === 'in_progress' || $b->status === 'deployment' ? max(0, $sv - (int) $b->turn + 1) : 0) : null,
            'alternate' => Engine::altOn($b->state), 'round' => $b->turn, 'mp_mode' => Engine::mpOn($b->state), 'micro_mode' => $b->state['micro_mode'] ?? 'off',   // 미시 교전 모드(off|shadow|on): FE 공격 예측 문구 분기용(첫 공격 전에도 알 수 있게)
            'alt' => Engine::altOn($b->state) ? $this->engine()->altView($b->state) : null,
            'items' => $b->state['items'] ?? null,   // 전투 소모품 {left, used{code:n}}: 스테이지 전투만, 방·랭크·전쟁은 null(사용 불가)
        ] + (($re = $this->engine()->rulesEffective($b->state)) !== [] ? ['rules_effective' => $re] : []) + \App\Game\StageRules::view($b->state) + $this->data->mapExtras((int) $b->map_id, [(int) $b->state['width'], (int) $b->state['height']]);   // stage_rules(승패 규칙 있을 때만). decor·village_style·tile_layer(있고 state 크기와 같을 때만)
    }
}
