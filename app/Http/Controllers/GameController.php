<?php

namespace App\Http\Controllers;

use App\Game\Engine;
use App\Game\IllegalAction;
use App\Services\BattleService;
use App\Services\GameData;
use App\Services\ProgressionService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** 플레이어 API (회원/게스트 공통). 소유자 검증은 BattleService::findOwned 에서 수행. */
class GameController extends Controller
{
    public function __construct(
        private readonly ProgressionService $progress,
        private readonly BattleService $battles,
        private readonly GameData $data,
    ) {
    }

    public function profile(Request $request): JsonResponse
    {
        $profile = $this->progress->profile($request->user());
        $profile['tutorial'] = app(\App\Services\TutorialService::class)->state($request->user());   // 튜토리얼 진행(서버 저장)

        $profile['protagonist_needed'] = app(\App\Services\ProtagonistService::class)->needed($request->user());   // true면 FE가 주인공 생성 화면으로 유도(정식 계정만)

        return response()->json(['profile' => $profile, 'rules' => $this->publicRules()]);
    }

    public function heroes(Request $request): JsonResponse
    {
        $out = [];
        $owned = DB::table('user_heroes')->where('user_id', $request->user()->id)->get();
        $eqSvc = app(\App\Services\EquipmentService::class);
        $equipped = $eqSvc->equippedBy($owned->pluck('id')->map(fn ($v) => (int) $v)->all());   // 테이블 없으면 [] (폴백)
        $proto = app(\App\Services\ProtagonistService::class);
        $expNeed = DB::table('hero_levels')->pluck('exp_to_next', 'level')->all();   // 레벨별 필요 경험치(루프 밖 1회 조회)
        foreach ($owned as $uh) {
            $h = $this->data->heroById((int) $uh->hero_id);
            $isP = \App\Services\ProtagonistService::isProtagonistCode($h['code']);
            // 주인공: display_name=계정 사용자명, portrait=protagonist_{face}(face 변경 즉시 반영)
            $pv = $isP ? ['protagonist' => true, 'campaign_only' => true, 'portrait' => $proto->portraitFor((int) $request->user()->id), 'name' => $proto->displayName($request->user()), 'display_name' => $proto->displayName($request->user())] : [];
            $out[] = $pv + ['user_hero_id' => (int) $uh->id, 'hero' => $h['code'], 'name' => $h['name_ko'], 'title' => $h['title'], 'short_name' => $h['short_name'], 'display_name' => $h['display_name'], 'rarity' => $h['rarity'], 'cost' => $h['cost'], 'troop_type' => $h['troop_type'], 'troop_label' => $this->data->troopLabel($h['troop_type']),
                'level' => (int) $uh->level, 'exp' => (int) $uh->exp, 'star' => (int) $uh->star, 'shards' => (int) $uh->shards,
                'detail' => $this->data->heroDetail($h), 'level_info' => $this->levelInfo($h, (int) $uh->level, $expNeed)] + $eqSvc->heroView($h, $equipped[(int) $uh->id] ?? []);   // equipment{slot:{id,code,name,rarity}}, equip_total(클램프 후 적용값), equip_raw
        }

        return response()->json(['heroes' => $out]);
    }

    /** 영웅 레벨 진행 정보: 다음 레벨까지 필요 경험치, 다음 보상, 마일스톤 목록, 현재 레벨 능력치(장비 제외) */
    private function levelInfo(array $h, int $level, array $expNeed): array
    {
        $t = $this->data->rules()->unitType($h['unit_type']);
        $max = (int) config('game.max_level');
        $scale = fn (int $base, $bonus, $growth) => \App\Game\ArmyBuilder::scale($base + $bonus, (float) $growth, $level);

        return [
            'exp_to_next' => $level < $max ? (int) ($expNeed[$level] ?? 0) : 0,
            'next_reward' => \App\Game\LevelRewards::next($level),
            'milestones' => \App\Game\LevelRewards::view($level),
            'stats_now' => [
                'hp' => $scale($t['hp'], $h['hp_bonus'], $h['growth_hp_pct']), 'atk' => $scale($t['atk'], $h['atk_bonus'], $h['growth_atk_pct']), 'def' => $scale($t['def'], $h['def_bonus'], $h['growth_def_pct']),
                'mp_max' => \App\Game\MpRules::maxMp($h['rarity'] ?? null, $level, (string) $h['unit_type']),
            ],
        ];
    }

    /** @deprecated 별도 편성 메뉴 제거: 영웅 선택은 출격(배치) 화면에서만. parties는 마지막 출격 구성(배치 확정 시 자동 저장). 호환용 유지 */
    public function party(Request $request): JsonResponse
    {
        return response()->json(['party' => $this->progress->party($request->user()), 'troops' => (object) $this->progress->partyTroops($request->user()), 'profile' => $this->progress->profile($request->user()), 'cost' => $this->progress->savedPartyCost($request->user())]);
    }

    public function saveParty(Request $request): JsonResponse
    {
        $data = $request->validate([
            'user_hero_ids' => ['required', 'array', 'max:10'], 'user_hero_ids.*' => ['integer'],
        ]);
        // 영웅별 고정 부대 병종: 요청의 troops 키는 검증·저장 없이 무시(하위 호환)
        $this->progress->saveParty($request->user(), array_values($data['user_hero_ids']));

        return $this->party($request);
    }

    /** 숨은 종장 진행도: 해금 전에도 호출 가능. 잠김이면 chapter=null(이름·위치·스테이지 비노출), 해금 후 ch999 스테이지 요약 */
    public function hiddenChapter(Request $request): JsonResponse
    {
        $svc = app(\App\Services\HiddenChapterService::class);
        $pr = $svc->progress($request->user());
        $chapter = null;
        if ($pr['unlocked']) {
            $ch = \App\Services\HiddenChapterService::chapter();
            $prog = DB::table('user_stage_progress')->where('user_id', $request->user()->id)->get()->keyBy('stage_id');
            $chapter = ['chapter' => $ch, 'stages' => DB::table('stages')->where('chapter', $ch)->orderBy('sort_order')->get(['id', 'code', 'name'])
                ->map(fn ($s) => ['id' => (int) $s->id, 'code' => $s->code, 'name' => $s->name, 'clear_count' => (int) ($prog[$s->id]->clear_count ?? 0)])->all()];
        }

        return response()->json(['unlocked' => $pr['unlocked'], 'progress' => ['cleared' => $pr['cleared'], 'total' => $pr['total']], 'chapter' => $chapter]);
    }

    public function stages(Request $request): JsonResponse
    {
        $user = $request->user();
        $prog = DB::table('user_stage_progress')->where('user_id', $user->id)->get()->keyBy('stage_id');
        $out = [];
        $chapters = [];
        $rows = DB::table('stages')->orderBy('sort_order')->get();
        $byId = $rows->keyBy('id');
        $ownedCodes = DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_heroes.user_id', $user->id)->pluck('heroes.code')->all();   // 필수 영웅 보유 판정(주인공은 항상 보유로 간주)
        $metas = DB::table('maps')->whereIn('id', $rows->pluck('map_id')->unique()->all())->pluck('meta', 'id');   // capture.points 'map' 해석용(meta.objective_points)
        $hidden = app(\App\Services\HiddenChapterService::class);
        $hiddenOpen = $hidden->unlocked($user);
        foreach ($rows as $s) {
            if ((int) ($s->chapter ?? 0) === $hidden::chapter() && ! $hiddenOpen) {
                continue;   // 숨은 종장: 해금 전에는 목록에서 감춤(존재 자체를 노출하지 않음)
            }
            $p = $prog[$s->id] ?? null;
            $unlocked = $this->battles->stageUnlocked($user, $s, $prog);
            $reqHeroes = $this->battles->requiredStageHeroes($user, $s, $ownedCodes);
            $missing = array_values(array_map(fn ($r) => ['code' => $r['code'], 'name' => $r['name']], array_filter($reqHeroes, fn ($r) => ! $r['owned'])));
            $chap = (int) ($s->chapter ?? 0);
            foreach ($reqHeroes as $r) {   // 챕터(서가)별 필수 영웅 집계(영웅 단위 중복 제거)
                $chapters[$chap]['heroes'][$r['code']] = $r;
            }
            $pre = $s->prerequisite_stage_id !== null ? ($byId[$s->prerequisite_stage_id] ?? null) : null;
            $obj = \App\Game\Engine::resolveObjective(json_decode((string) ($s->objective ?? ''), true), json_decode((string) ($metas[$s->map_id] ?? ''), true) ?: []);
            $out[] = [
                'id' => (int) $s->id, 'code' => $s->code, 'name' => $s->name, 'difficulty' => (int) $s->difficulty,
                'recommended_level' => (int) $s->recommended_level, 'unlocked' => $unlocked,
                // 필수 영웅 미보유 잠금(대여 없음): hero_locked=true면 플레이 불가, missing_heroes=[{code,name}] 사유 표시용. playable = 선행 해금 && 영웅 충족
                'required_heroes' => $reqHeroes,   // [{code,name,owned}] 이 스테이지 필수 영웅(주인공 제외)
                'ally_npcs' => $this->battles->allyNpcView($s),   // [{code,name}] 조종 불가 AI 아군(출전 후보에서 제외됨)
                'enemy_commander' => $this->battles->enemyCommanderView($s),   // {name,hero_code,npc_ref,unit_type}|null 적 대표(보스)
                'factions' => $this->battles->factionsView($s),   // {ally,enemy}|null 진영 국호(예: 조선군/일본군)
                'deploy_slot_counts' => ($ds = $this->battles->liveSlots($s)) ? ['fixed' => count($ds['fixed']), 'free' => count($ds['free']), 'cost_cap' => $ds['cost_cap']] : null,   // 배치 슬롯 스테이지 요약(없으면 null = 현행 편성)
                'hero_locked' => $missing !== [], 'missing_heroes' => $missing, 'playable' => $unlocked && $missing === [],
                'rewards' => ['exp' => (int) $s->reward_exp, 'user_exp' => (int) $s->reward_user_exp, 'gold' => (int) $s->reward_gold],
                'best_stars' => (int) ($p->best_stars ?? 0), 'clear_count' => (int) ($p->clear_count ?? 0),
                // 캠페인 확장(추가 키): chapter 0=기존 모험 스테이지, 1=캠페인 1장 / objective / star_conditions(null=기존 기본 별 규칙) / locked_by(잠겼을 때 선행 스테이지) / join_hero(첫 클리어 합류 영웅 코드)
                'chapter' => (int) ($s->chapter ?? 0),
                'objective' => $obj ?? ['type' => 'defeat_commander'],
                'forced_heroes' => json_decode((string) ($s->forced_heroes ?? ''), true) ?: [], 'required_hero' => $s->required_hero ?? null,   // 출전 강제/대여(해전 이순신 수군 대여 등), 입장 게이트 영웅
                'star_conditions' => json_decode((string) ($s->star_conditions ?? ''), true) ?: null,
                'sub_objectives' => array_values(array_map(fn ($o) => ['id' => $o['id'], 'label' => $o['label'] ?? null, 'type' => $o['type'] ?? null], array_filter((json_decode((string) ($s->rules ?? ''), true) ?: [])['sub_objectives'] ?? [], fn ($o) => is_array($o) && is_string($o['id'] ?? null)))),   // 추가 키: 서브 목표 표시용 [{id,label,type}] (star_conditions 의 sub_objective id 와 매칭)
                'stage_rules' => \App\Game\StageRules::lobbyView(json_decode((string) ($s->rules ?? ''), true)),   // {mode,conditions:[{label}],lose:[label]}|null (전투 화면 view 와 같은 형태, met 제외)
                'locked_by' => ! $unlocked && $pre ? ['id' => (int) $pre->id, 'code' => $pre->code, 'name' => $pre->name] : null,
                'join_hero' => array_values(array_filter(array_map(fn ($j) => ($j['condition'] ?? 'first_clear') === 'first_clear' ? ($j['hero_code'] ?? null) : null, json_decode((string) ($s->join_hero ?? ''), true) ?: []))),
            ];
        }

        $chapterOut = [];
        foreach ($chapters as $c => $v) {   // chapters[chapter] = {need:[{code,name,owned}], need_count, owned_count}
            $list = array_values($v['heroes'] ?? []);
            $chapterOut[(string) $c] = ['need' => $list, 'need_count' => count($list), 'owned_count' => count(array_filter($list, fn ($r) => $r['owned']))];
        }

        return response()->json(['stages' => $out, 'chapters' => (object) $chapterOut]);
    }

    public function challenge(Request $request, int $stage): JsonResponse
    {
        $b = $this->battles->startStage($request->user(), $stage);

        return response()->json(['battle' => $this->battles->view($b), 'deployment' => $this->battles->deploymentInfo($request->user(), $b)], 201);
    }

    public function showBattle(Request $request, int $id): JsonResponse
    {
        $timeoutEvents = $this->battles->expireTurnIfNeeded($request->user(), $id);   // 턴 마감 경과 시 지연 평가(남은 유닛 대기 + 턴 종료)
        $b = $this->battles->findOwned($request->user(), $id);

        return response()->json(['battle' => $this->battles->view($b), 'turn_timed_out' => $timeoutEvents !== null] + ($timeoutEvents !== null ? ['events' => \App\Game\Engine::redactEvents($timeoutEvents, 'a')] : []));
    }

    /** 이어하기용: 내 진행 중(deployment/in_progress) 스테이지 전투 목록(최근 갱신 순). 전투 상태는 행동마다 서버에 저장되므로 별도 저장 없이 항상 최신. 방/시즌전쟁 전투 제외 */
    public function activeBattles(Request $request): JsonResponse
    {
        $rows = DB::table('battles')->join('stages', 'stages.id', '=', 'battles.stage_id')
            ->where(['battles.user_id' => $request->user()->id, 'battles.mode' => 'stage'])->whereNull('battles.room_id')
            ->whereIn('battles.status', ['deployment', 'in_progress'])->orderByDesc('battles.updated_at')->orderByDesc('battles.id')
            ->get(['battles.id', 'battles.stage_id', 'stages.code as stage_code', 'stages.name as stage_name', 'battles.status', 'battles.turn', 'battles.current_side', 'battles.updated_at']);

        return response()->json(['battles' => $rows->map(fn ($r) => [
            'battle_id' => (int) $r->id, 'stage_id' => (int) $r->stage_id, 'stage_code' => $r->stage_code, 'stage_name' => $r->stage_name,
            'status' => $r->status, 'turn' => (int) $r->turn, 'current_side' => $r->current_side,
            'updated_at' => \Illuminate\Support\Carbon::parse($r->updated_at)->toIso8601String(),
        ])->all(), 'max_open' => max(1, (int) config('game.max_open_stage_battles'))]);
    }

    public function deployment(Request $request, int $id): JsonResponse
    {
        $b = $this->battles->findOwned($request->user(), $id);

        return response()->json($this->battles->deploymentInfo($request->user(), $b));
    }

    public function submitDeployment(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'placements' => ['required', 'array', 'min:1', 'max:10'],
            'placements.*.user_hero_id' => ['required', 'integer'],
            'placements.*.x' => ['required', 'integer'],
            'placements.*.y' => ['required', 'integer'],
            'placements.*.troops' => ['sometimes', 'array', 'max:4'], 'placements.*.troops.*.class' => ['required', 'string', 'max:16'],
            'placements.*.troops.*.x' => ['required', 'integer'], 'placements.*.troops.*.y' => ['required', 'integer'],   // 부대 위치(squad on, 선택)
        ]);
        $b = $this->battles->findOwned($request->user(), $id);
        $b = $this->battles->submitDeployment($request->user(), $b, array_values($data['placements']));

        return response()->json($this->battles->deploymentInfo($request->user(), $b));
    }

    public function confirmDeployment(Request $request, int $id): JsonResponse
    {
        $b = $this->battles->confirmDeployment($request->user(), $id);

        return response()->json(['battle' => $this->battles->view($b)]);
    }

    /** 공개 읽기 전용 규칙표(FE 하드코딩 제거용): 지형 modifiers, 병종 능력치, 상성, 규칙 안내값. 민감 값 없음, 짧은 캐시 */
    public function rules(): JsonResponse
    {
        $rules = $this->data->rules();
        $terrains = [];
        foreach (DB::table('terrains')->orderBy('id')->get() as $t) {
            $terrains[] = ['code' => $t->code, 'name' => $t->name, 'symbol' => $t->symbol, 'modifiers' => $rules->terrains[$t->code] ?? [],
                'elevation' => $rules->terrainAttr($t->code, 'elevation'), 'cover' => $rules->terrainAttr($t->code, 'cover'), 'heals' => $rules->terrainAttr($t->code, 'heals'),
                'water' => $rules->terrainAttr($t->code, 'water'), 'boarding' => $rules->terrainAttr($t->code, 'boarding'), 'blocks_line_of_fire' => $rules->terrainAttr($t->code, 'blocks_line_of_fire')];   // water=수상 칸, boarding=비수병 배 탑승 칸(sea·reef)
        }
        $types = [];
        foreach ($rules->unitTypes as $code => $u) {
            $types[] = ['code' => $code] + array_intersect_key($u, array_flip(['name', 'move', 'range_min', 'range_max', 'hp', 'atk', 'def', 'move_type', 'heal', 'cost', 'alias_of'])) + ['hero_troop' => in_array($code, (array) config('game.hero_troop_types.allowed'), true)];   // alias_of: 퇴역 병종(heavy -> sword) 호환 표기(진행 중 전투 유닛 표시용) / hero_troop: 영웅 고정 부대 병종으로 편성 가능한가(config hero_troop_types.allowed. false=monster·assassin·healer·mage·flyer 등 적·이벤트·일반병 전용)
        }

        $retired = array_keys((array) config('game.retired_unit_types', []));
        $matchups = array_diff_key($rules->matchups, array_flip($retired));   // 별칭 행/열은 응답에서 제외(FE는 alias_of로 대체 병종 상성 사용)
        foreach ($matchups as $a => $row) {
            $matchups[$a] = array_diff_key($row, array_flip($retired));
        }

        return response()->json(['terrains' => $terrains, 'unit_types' => $types, 'auras' => $this->data->auras(), 'matchups' => $matchups, 'rules' => $this->publicRules(),
            'sweep' => ['enabled' => (bool) config('game.sweep.enabled'), 'max_count' => (int) config('game.sweep.max_count'), 'daily_cap' => (int) config('game.sweep.daily_cap')]])   // 소탕 규칙표(FE 는 sweep.max_count 우선 사용)
            ->header('Cache-Control', 'public, max-age=60');
    }

    /** 클라이언트 규칙 안내용 읽기 전용 값(config 기준, 하드코딩 금지, 민감 값 없음) */
    private function publicRules(): array
    {
        $r = config('game.rules');

        return [
            'second_atk_pct' => (int) $r['second_atk_pct'],
            'dmg_mult' => (float) ($r['dmg_mult'] ?? 1.0), 'snowball' => \App\Game\Engine::normalizeSnowball($r['snowball'] ?? null),   // snowball: null=off
            'facing' => (bool) $r['facing'], 'facing_mult' => $r['facing_mult'], 'facing_cap' => (float) $r['facing_cap'],
            'highground_mult' => (float) $r['highground_mult'], 'forest_cover_mult' => (float) $r['forest_cover_mult'],
            'forest_cover_exclude_ranged_target' => (bool) $r['forest_cover_exclude_ranged_target'], 'village_heal_pct' => (float) $r['village_heal_pct'], 'def_total_cap' => (int) $r['def_total_cap'],
            'alternate_activation' => (bool) $r['alternate_activation'], 'alt_consecutive_cap' => (int) $r['alt_consecutive_cap'], 'alt_first_rotate' => (bool) $r['alt_first_rotate'],
            'mp_skills' => (bool) ($r['mp_skills'] ?? false),   // 액티브 스킬 MP 방식 on/off(새 전투 기준. 전투별 여부는 battle.mp_mode)
            'gacha' => (bool) config('game.gacha.enabled'),   // FE 가챠 탭 표시 여부
            'squad' => (bool) $r['squad'], 'squad_aura_self' => (bool) $r['squad_aura_self'], 'troop_cost' => (bool) $r['troop_cost'],
            // 영웅-부대 편성표(FE 편성 UI용): 레벨별 부대 수, 영웅당 상한, 진영 유닛 상한(병종 코스트는 unit_types[].cost)
            'troop_slots' => array_map(fn ($s) => ['min_level' => $s[0], 'troops' => $s[1]], config('game.troop_slots')),
            'troop_cap' => (int) config('game.troop_cap'), 'max_units_per_side' => max(1, min(\App\Game\ArmyBuilder::unitHardCap(), (int) config('game.max_units_per_side'))),
            'max_units_per_side_stage' => \App\Game\ArmyBuilder::allyStageCap(), 'max_units_enemy_stage' => \App\Game\ArmyBuilder::enemyStageCap(), 'max_alive_per_side_stage' => (int) config('game.max_alive_per_side_stage'),   // 스테이지(캠페인) 전투 전용 한도(PvP는 위 max_units_per_side)
            // 수상(해전) 규칙 안내(FE 툴팁): 수병 수상 공격 배율 / 배 탑승 비수병 공격 배율 / 수병 육상 공격 배율
            'naval_water_atk_mult' => (float) ($r['naval_water_atk_mult'] ?? 1.0), 'boarded_atk_mult' => (float) ($r['boarded_atk_mult'] ?? 1.0), 'naval_land_atk_mult' => (float) ($r['naval_land_atk_mult'] ?? 1.0),
            // 병종 v2 E1/E2(FE 예측 일치용): mage_def_ignore_pct = 마법사 공격 시 대상 기본 방어 무시 %(피해 = atk x 배율 - def x (1 - N/100) x (1 + 방어보정%)) / assassin_facing_mult = 암살자 측·후방 배율(null=일반 facing_mult)
            'mage_def_ignore_pct' => (float) ($r['mage_def_ignore_pct'] ?? 0), 'assassin_facing_mult' => is_array($r['assassin_facing_mult'] ?? null) ? array_map('floatval', $r['assassin_facing_mult']) : null,
        ];
    }

    /** 행동 제출: body {type: move|attack|wait|end_turn|activate|end_activation|use_skill, skill(use_skill 전용: 액티브 code, target_id는 템플릿별 필요 시), squad_id(activate 전용), unit_id, x, y, target_id, facing?(wait 전용 up|down|left|right)} (클라이언트는 행동만 전송) */
    public function action(Request $request, int $id): JsonResponse
    {
        $data = $request->validate([
            'type' => ['required', 'string', 'in:move,attack,wait,end_turn,activate,end_activation,use_skill,use_item'],
            'skill' => ['required_if:type,use_skill', 'string', 'max:48'], 'item' => ['required_if:type,use_item', 'string', 'max:40'], 'unit_id' => ['sometimes', 'string', 'max:16'], 'target_id' => ['sometimes', 'string', 'max:16'], 'squad_id' => ['sometimes', 'string', 'max:16'],
            'facing' => ['sometimes', 'string', 'in:up,down,left,right'],
            'follow' => ['sometimes', 'boolean'],   // end_turn 전용: true면 미행동 소속 병사 자동 영웅 추종(기본 false)
            'x' => ['sometimes', 'integer'], 'y' => ['sometimes', 'integer'],
        ]);
        if (array_key_exists('follow', $data)) {
            $data['follow'] = (bool) $data['follow'];
        }
        [$b, $events, $timedOut] = $this->battles->submitAction($request->user(), $id, $data);

        return response()->json(['battle' => $this->battles->view($b), 'events' => \App\Game\Engine::redactEvents($events, 'a'), 'result' => $b->result, 'turn_timed_out' => $timedOut]);
    }

    /** 조회 전용: 선택 유닛의 이동 가능 타일과 현재 위치에서의 공격 대상 */
    public function moves(Request $request, int $id, string $unit): JsonResponse
    {
        $timedOut = $this->battles->expireTurnIfNeeded($request->user(), $id) !== null;
        $b = $this->battles->findOwned($request->user(), $id);
        if ($b->status !== 'in_progress' || ! isset($b->state['units'][$unit]) || $b->state['units'][$unit]['side'] !== 'a') {
            throw new IllegalAction('unit_not_found', '조회할 수 없는 유닛입니다.', 404);
        }

        return response()->json($this->battles->unitMoves($b, $unit, 'a') + ['turn_timed_out' => $timedOut]);
    }

    public function botTurn(Request $request, int $id): JsonResponse
    {
        [$b, $events] = $this->battles->runBotTurnIfNeeded($request->user(), $id);

        return response()->json(['battle' => $this->battles->view($b), 'events' => \App\Game\Engine::redactEvents($events, 'a'), 'result' => $b->result]);
    }

    public function abandon(Request $request, int $id): JsonResponse
    {
        [$b, $events] = $this->battles->abandon($request->user(), $id);

        return response()->json(['battle' => $this->battles->view($b), 'events' => \App\Game\Engine::redactEvents($events, 'a'), 'result' => $b->result]);
    }

    public function result(Request $request, int $id): JsonResponse
    {
        $b = $this->battles->findOwned($request->user(), $id);
        if (! in_array($b->status, ['finished', 'abandoned'], true)) {
            throw new IllegalAction('battle_not_finished', '아직 종료되지 않은 전투입니다.', 409);
        }

        return response()->json(['battle_id' => $b->id, 'winner' => $b->winner, 'result' => $b->result]);
    }
}
