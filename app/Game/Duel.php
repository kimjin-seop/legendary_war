<?php

namespace App\Game;

/**
 * 1:1 대전 실행기(밸런스 측정용). 진영 스펙: ['hero'=>heroRow,'level'=>int,'troops'=>string[]] (지휘관 1 + 부대).
 * 동수 비교를 위해 항상 지휘관 1명 + 부대 N으로 구성한다.
 */
final class Duel
{
    public function __construct(
        private readonly Engine $engine,
        private readonly array $map,
        private readonly float $troopGrowth,
        private readonly int $maxTurns,
        private readonly array $botOptions = [],
        private readonly ?\Closure $eventSink = null,   // 측정용: 봇이 적용한 액션의 이벤트 목록을 받는 훅(기본 null)
    ) {
    }

    public function terrainRulesOn(): bool
    {
        $o = $this->engine->options();

        return $o['highground_mult'] > 1.0 || $o['forest_cover_mult'] < 1.0 || $o['village_heal_pct'] > 0 || $o['def_total_cap'] > 0;
    }

    public function squadOn(): bool
    {
        return (bool) $this->engine->options()['squad'];
    }

    public function alternateOn(): bool
    {
        return (bool) $this->engine->options()['alternate_activation'];
    }

    public function facingOn(): bool
    {
        return (bool) $this->engine->options()['facing'];
    }

    /** @return array{winner:?string,turn:int,heals:int,kills:int,first_turn_kill:bool,turn_limit:bool} */
    /**
     * 영웅 고정 병종(heroes.troop_type) 규칙의 기본 부대 목록: 슬롯 수(레벨 슬롯 + troop_bonus, cap)만큼 같은 병종. troop_type이 없으면 null(호출자가 프리셋 폴백).
     * 명시 troops를 넘기면 이 값 대신 override로 동작한다(시뮬레이터 실험용).
     *
     * @param  array  $cfg SquadPlanner 설정(slots/cap/...) = ProgressionService::squadCfg()
     * @return string[]|null
     */
    public static function fixedTroops(array $hero, int $level, array $cfg): ?array
    {
        $t = $hero['troop_type'] ?? null;

        return is_string($t) && $t !== '' ? array_fill(0, SquadPlanner::count($level, (int) ($hero['troop_bonus'] ?? 0), $cfg, $hero['rarity'] ?? null), $t) : null;
    }

    /**
     * @param  array|null  $objective 스테이지 목표(survive_turns면 state에 고정, 플레이어=a 진영 전제). null=defeat_commander
     * 진영 스펙에 'generic' => {commander{..},units[]}가 있으면 영웅 없는 일반 지휘관 진영(스테이지 적)으로 생성한다(레벨은 'level').
     */
    public function run(int $seed, array $a, array $b, ?array $objective = null, ?array $triggers = null, string $enemySide = 'b', array $allyNpcs = [], ?\Closure $heroRow = null, int $allyLevel = 1, ?\Closure $allyCompanions = null, ?array $stage = null): array
    {
        $rules = $this->engine->rules();
        $objective = Engine::resolveObjective($objective, $this->map['meta'] ?? []);   // capture.points 'map' -> 맵 meta.objective_points
        $surviveExtra = ($objective['type'] ?? null) === 'survive_turns' ? $objective['turns'] + 5 : 0;
        $maxTurns = max($this->maxTurns, $surviveExtra);
        // $stage(['rules'=>array, 'first_side'=>string]): 실제 스테이지 규칙 반영(BattleService::createStageBattle 와 같은 순서). 플레이어=a, 적=b 전제. null 이면 기존 동작
        $stageRules = $stage !== null ? Engine::sanitizeStageRules($stage['rules'] ?: null) : null;
        $stageRules !== null && $stageRules['max_turns'] !== null && $maxTurns = max($stageRules['max_turns'], $surviveExtra);
        $state = ArmyBuilder::initialState($rules, $this->map, $seed, $maxTurns, $stage['first_side'] ?? 'a', (bool) $this->engine->options()['facing'], (bool) $this->engine->options()['squad'], (bool) $this->engine->options()['alternate_activation'], $this->engine->options()['snowball'], $this->engine->mpKnobs(), (string) $this->engine->options()['micro_mode']);
        $objective && $state['objective'] = $objective;
        if ($stage !== null) {
            $state['frozen'] = $this->engine->frozenOpts();
            ($tt = EventConditions::normalizeTileTags($this->map['meta']['tile_tags'] ?? null, (int) $state['width'], (int) $state['height'])) !== [] && $state['tile_tags'] = $tt;
            $stageRules['rules'] !== [] && $state['rules'] = $stageRules['rules'] + ($state['rules'] ?? []);
            Cues::initialize($state, $stage['rules']['cues'] ?? null);
            SubObjectives::initialize($state, $stage['rules']['sub_objectives'] ?? null);
            StageRules::initialize($state, $stage['rules']);
            ! empty($state['cues']) && $state['troop_growth'] = $this->troopGrowth;
            $state['campaign'] = true;
        }
        foreach (['a' => $a, 'b' => $b] as $side => $spec) {
            if (isset($spec['generic'])) {
                ArmyBuilder::addGenericSide($this->engine, $state, $side, $spec['generic'], (int) $spec['level'], $this->map['spawns'][$side], $this->map['deploy_zones'][$side], $this->troopGrowth, $this->map['meta']['enemy_zones'] ?? [], $heroRow);

                continue;
            }
            if (isset($spec['party'])) {
                // 사용자 편성 형태 입력: party = [['hero'=>row,'level'=>int,'troops'=>string[]], ...] (첫 항목=지휘관). squad on이면 영웅별 부대, off면 지휘관 부대만(단일 목록)
                $entries = [];
                foreach (array_values($spec['party']) as $i => $p) {
                    $entries[] = ['row' => $p['hero'], 'level' => $p['level'], 'key' => $i];
                }
                $byEntry = Engine::squadOn($state) ? array_map(fn ($p) => $p['troops'], array_values($spec['party'])) : null;
                ArmyBuilder::addSide($this->engine, $state, $side, $entries, $spec['party'][0]['troops'], $this->map['deploy_zones'][$side], $spec['positions'] ?? null, $this->troopGrowth, $byEntry);

                continue;
            }
            ArmyBuilder::addSide(
                $this->engine, $state, $side, [['row' => $spec['hero'], 'level' => $spec['level'], 'key' => 0]],
                $spec['troops'], $this->map['deploy_zones'][$side], null, $this->troopGrowth,
            );
        }
        if ($allyNpcs && $heroRow) {   // 스테이지 아군 NPC(rules.ally_npcs): 플레이어 진영(적의 반대)에 영웅 단독으로 추가
            $ps = $enemySide === 'a' ? 'b' : 'a';
            ArmyBuilder::addAllyNpcs($this->engine, $state, $allyNpcs, $ps, $heroRow, $allyLevel, $this->troopGrowth, $this->map['deploy_zones'][$ps], $allyCompanions);   // allyCompanions: 영웅당 동반 일반병 수 fn(code,npc):int (null=영웅 단독 = 기존 동작)
        }
        if ($triggers) {   // 증원 트리거(스테이지 triggers): 적 진영(enemySide)에 생성, 레벨은 적 generic 스펙 레벨
            $es = $enemySide === 'a' ? $a : $b;
            $trig = Engine::normalizeTriggers($triggers, $this->map['meta']['enemy_extra_zones'] ?? [], (int) ($es['level'] ?? 1), $this->troopGrowth, array_keys($rules->unitTypes));
            foreach ($trig as $i => $t) {
                $trig[$i]['side'] = $enemySide;
            }
            if ($trig) {
                $state['triggers'] = $trig;
                $state['spawn_seq'] = [$enemySide => max(array_map(fn ($id) => (int) substr((string) $id, 1), array_keys(array_filter($state['units'], fn ($u) => $u['side'] === $enemySide))))];
            }
        }
        $ps0 = $enemySide === 'a' ? 'b' : 'a';
        $allyInit = [];   // 시뮬 지표용: 시작 시점 아군(플레이어 진영, 아군 NPC 포함) 유닛 id -> max_hp (손실률 계산)
        foreach ($state['units'] as $uid => $u) {
            if ($u['side'] === $ps0) {
                $allyInit[$uid] = (int) $u['max_hp'];
            }
        }
        if ($stage !== null) {
            Cues::bindUnitPlaceholders($state);   // cue 'UNIT@x,y' 자리표시 -> 적 유닛 id
            if (! isset($state['init_hp'][$enemySide])) {
                $state['init_hp'][$enemySide] = array_sum(array_column(array_filter($state['units'], fn ($u) => $u['side'] === $enemySide), 'max_hp'));
            }
            $r = StageSim::run($this->engine, $this->botOptions, $state, $this->eventSink);

            return ['winner' => $r['state']['winner'] ?? null, 'turn' => $r['state']['turn']] + $this->allyLoss($r['state'], $allyInit) + $r['stats'];
        }
        $r = (new Simulator($this->engine, $this->botOptions, $this->eventSink))->runWithStats($state);

        return ['winner' => $r['state']['winner'], 'turn' => $r['state']['turn']] + $this->allyLoss($r['state'], $allyInit) + $r['stats'];
    }

    /** 시뮬 지표: 시작 시점 아군 유닛 기준 손실률(체력 합 감소 비율, 0~1)과 전멸 유닛 수. 증원 유닛은 제외 */
    private function allyLoss(array $state, array $init): array
    {
        $max = array_sum($init);
        $left = 0;
        $dead = 0;
        foreach ($init as $uid => $mh) {
            $hp = (int) ($state['units'][$uid]['hp'] ?? 0);
            $left += min($hp, $mh);
            $dead += $hp <= 0 ? 1 : 0;
        }

        return ['ally_loss' => $max > 0 ? 1 - $left / $max : 0.0, 'ally_dead' => $dead, 'ally_n' => count($init)];
    }
}
