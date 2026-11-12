<?php

namespace App\Game;

/**
 * 스테이지 규칙 반영 시뮬레이터(밸런스 측정용, `game:simulate --realistic`). DB 미사용, 플레이어=a 진영 고정(실전과 같음).
 *
 * 실전 BattleService 와 같은 순서로 진행한다: 전투 시작 Cues::collect -> (a 턴 시작) 아군 NPC 단계(route=RouteAi, 동반병=followStep, 나머지=봇) -> 플레이어 봇 -> end_turn
 * -> (b 턴) 적 봇. 모든 행동 직후 Cues::collect(서브 목표·StageRules win/lose·cue)를 호출하므로 win_conditions/lose_conditions/cues/max_turns 가 그대로 판정된다.
 *
 * 일반 휴리스틱 봇은 목표(in_zone/capture)를 추구하지 않으므로, 아군 쪽에 한해 다음을 덧붙인다:
 *  - 미충족 win_conditions 의 in_zone 조건(유닛 참조 또는 side:a)과 capture 목표 점마다 가장 가까운 후보 유닛을 "목표 추구자"로 정해 구역으로 이동시킨 뒤(이동 후 사거리 안에 적이 있으면 공격/스킬) 턴을 마친다.
 *  - 조건이 가리키는 유닛이 route 를 가진 아군 NPC(호위 대상)면, 그 NPC 에서 3칸 넘게 떨어진 플레이어 유닛은 NPC 쪽으로 붙는다(동행). 나머지는 기존 봇 그대로.
 * 시뮬 전용 옵트인 플래그(기본 꺼짐 = 기존 동작 불변, botOptions): sim_cue_goals(미발동 cue.when 의 in_zone 도 목표로 추구: @protagonist 신호 타일 등) /
 *  sim_push_commander(defeat_commander 목표에서 사거리 안에 적이 없는 비-지휘관·비-치유 유닛이 적 지휘관 쪽으로 진격) / sim_death_log(플레이어 지휘관 사망 직전 이벤트를 stats.cmd_death 에 기록).
 * 추가 옵트인(기본 꺼짐): sim_must_survive(must_survive/lose_conditions 패배 판정 자체는 실전과 같은 엔진 경로(Engine::resolveDeath·StageRules::check)가 이미 처리하므로 판정은 바꾸지 않고,
 *  must_survive 아군 유닛 사망으로 끝난 판의 종료 사유 rule 을 'must_survive' 로 표기 + route 없는 must_survive 아군 NPC 도 동행 대상에 포함) /
 *  sim_objective_only(전진 금지: 목표 추구자 외 플레이어 유닛은 호위 대상(없으면 목표 추구자, 없으면 must_survive NPC) 2칸 안에 머물며 사거리 안 적만 공격. push_commander 무시).
 * 한계: BattleStory(스토리 연출 플래그), 플레이어 수동 판단(회피·집중), lose_conditions 방어(적이 구역에 못 들어가게 막기), 교대 행동(alternate_activation) 모드의 목표 추구는 반영하지 않는다.
 */
final class StageSim
{
    /**
     * @return array{state:array,stats:array}
     */
    public static function run(Engine $engine, array $botOptions, array $state, ?\Closure $eventSink = null, int $safetySteps = 3000): array
    {
        if (Engine::altOn($state)) {   // 교대 행동은 목표 추구 없이 기존 시뮬레이터로(한계)
            $r = (new Simulator($engine, $botOptions, $eventSink))->runWithStats($state);
            $r['stats']['end_reason'] = ($r['state']['status'] ?? '') === 'finished' ? ($r['stats']['turn_limit'] ? 'turn_limit' : 'normal') : 'unfinished';

            return $r;
        }
        $bot = new HeuristicBot($engine, $botOptions);
        ! empty($botOptions['sim_defensive']) && $state['sim_defensive'] = true;   // 시뮬 전용(--defensive)
        ! empty($botOptions['sim_cue_goals']) && $state['sim_cue_goals'] = true;   // 시뮬 전용(--cue-goals)
        ! empty($botOptions['sim_push_commander']) && $state['sim_push_commander'] = true;   // 시뮬 전용(--push-commander)
        ! empty($botOptions['sim_objective_only']) && $state['sim_objective_only'] = true;   // 시뮬 전용(--objective-only)
        ! empty($botOptions['sim_must_survive']) && $state['sim_must_survive'] = true;   // 시뮬 전용(--must-survive)
        foreach ($state['units'] as $uid => $uu) {   // 시뮬 전용: 실제 주인공(protagonist_*)이 없는 파티의 플레이어 지휘관을 @protagonist 로 간주(도달형 목표 추구용). 실전 엔진·BattleService 는 이 플래그를 세우지 않는다
            if ($uu['side'] === 'a' && $uu['kind'] === 'commander' && empty($uu['npc_ally']) && ! str_starts_with((string) ($uu['hero'] ?? ''), 'protagonist_')) {
                $state['units'][$uid]['sim_protagonist'] = true;
                break;
            }
        }
        $stats = ['heals' => 0, 'kills' => 0, 'first_turn_kill' => false, 'turn_limit' => false, 'skill_uses' => 0, 'end_reason' => null, 'rule' => null, 'goal_moves' => 0];
        if (! empty($botOptions['sim_death_log'])) {
            $stats['_ring_n'] = is_int($botOptions['sim_death_log']) && $botOptions['sim_death_log'] > 1 ? min(200, $botOptions['sim_death_log']) : 8;   // --bot=sim_death_log=N 으로 링 크기 조절   // 시뮬 전용(--death-log): 플레이어 지휘관 id 추적 + 최근 이벤트 링 버퍼
            $stats['_cmd_ids'] = array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && $u['kind'] === 'commander' && empty($u['npc_ally'])));
            if (! empty($botOptions['sim_death_log_npc'])) {   // 옵트인(--bot=sim_death_log_npc=1): must_survive NPC 사망도 cmd_death 로 추적
                $stats['_cmd_ids'] = array_merge($stats['_cmd_ids'], array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && ! empty($u['must_survive']))));
            }
            $stats['_ring'] = [];
        }
        ! empty($state['sim_must_survive']) && $stats['_ms'] = [];   // 시뮬 전용(--must-survive): 생존 의무 유닛 id 추적(tally 가 갱신)
        $ev = [];
        Cues::collect($engine, $state, $ev, true);
        self::tally($stats, $ev, $state, $eventSink);
        $allyTurn = 0;
        for ($i = 0; $i < $safetySteps && $state['status'] === 'active'; $i++) {
            if ($state['side'] === 'b') {
                $plan = $bot->plan($state, 'b');
                $state['rng'] = $plan['rng'];
                foreach ($plan['actions'] as $a) {
                    if (! self::apply($engine, $state, 'b', $a, $stats, $eventSink) || $state['status'] !== 'active') {
                        break;
                    }
                }
                if ($state['status'] === 'active' && $state['side'] === 'b') {   // 계획이 cue 로 어긋나 end_turn 에 못 닿았으면 강제 종료(무한 루프 방지)
                    self::apply($engine, $state, 'b', ['type' => 'end_turn'], $stats, $eventSink);
                }

                continue;
            }
            if ($allyTurn !== (int) $state['turn']) {
                $allyTurn = (int) $state['turn'];
                self::allyPhase($engine, $botOptions, $state, $stats, $eventSink);
                if ($state['status'] !== 'active') {
                    break;
                }
            }
            self::playerPhase($engine, $bot, $state, $stats, $eventSink);
            if ($state['status'] === 'active' && $state['side'] === 'a') {
                self::apply($engine, $state, 'a', ['type' => 'end_turn'], $stats, $eventSink);
            }
        }
        $stats['rounds'] = (int) $state['turn'];
        if (isset($stats['_ms_dead']) && $stats['end_reason'] === 'commander_defeated' && $stats['rule'] === null) {   // 지휘관이 아니라 생존 의무 유닛 사망으로 진 판을 구분
            $stats['rule'] = 'must_survive:'.$stats['_ms_dead'];
        }
        unset($stats['_cmd_ids'], $stats['_ring'], $stats['_ring_n'], $stats['_ms'], $stats['_ms_dead']);

        return ['state' => $state, 'stats' => $stats];
    }

    /** 행동 1건 적용 + Cues::collect. 불법 행동(cue 로 상태가 바뀐 뒤의 낡은 계획 등)이면 false */
    private static function apply(Engine $e, array &$state, string $side, array $a, array &$stats, ?\Closure $sink): bool
    {
        try {
            [$state, $ev] = $e->apply($state, $side, $a);
        } catch (IllegalAction) {
            return false;
        }
        Cues::collect($e, $state, $ev);
        self::tally($stats, $ev, $state, $sink);

        return true;
    }

    private static function tally(array &$stats, array $events, array $state, ?\Closure $sink): void
    {
        $sink && $events !== [] && $sink($events);
        if (isset($stats['_ms'])) {   // --must-survive: 현재 살아 있는 생존 의무 유닛 기록(증원 포함). 사망 후엔 state 에서 사라지므로 미리 저장
            foreach ($state['units'] as $mid => $mu) {
                ! empty($mu['must_survive']) && $stats['_ms'][$mid] = (string) ($mu['hero'] ?? $mid);
            }
        }
        foreach ($events as $ev) {
            $t = $ev['type'] ?? null;
            if ($t === 'kill' && isset($stats['_ms'][$ev['target_unit_id'] ?? '']) && ($state['status'] ?? 'active') !== 'active' && ! isset($stats['_ms_dead'])) {
                $stats['_ms_dead'] = $stats['_ms'][$ev['target_unit_id']];
            }
            if (isset($stats['_ring']) && in_array($t, ['attack', 'kill', 'skill_use', 'counter', 'heal'], true)) {
                self::ring($stats, $ev, $state);
            }
            if ($t === 'kill') {
                $stats['kills']++;
                (int) ($state['turn'] ?? 0) === 1 && $stats['first_turn_kill'] = true;
            } elseif ($t === 'heal') {
                $stats['heals']++;
            } elseif ($t === 'skill_use') {
                $stats['skill_uses']++;
            } elseif ($t === 'battle_end') {
                $stats['end_reason'] = (string) ($ev['reason'] ?? '');
                $stats['rule'] = $ev['rule'] ?? null;
                $stats['turn_limit'] = $stats['end_reason'] === 'turn_limit';
            }
        }
    }

    /** --death-log: 이벤트 1건을 사람이 읽는 한 줄로 링 버퍼(기본 최근 8건)에 넣고, 플레이어 지휘관 kill 이면 stats.cmd_death 에 스냅샷을 남긴다(첫 사망만) */
    private static function ring(array &$stats, array $ev, array $state): void
    {
        $who = function ($id) use ($state): string {
            $u = $state['units'][$id] ?? null;

            return $u === null ? (string) $id : sprintf('%s[%s %s/%s hp%d]', $id, $u['side'], $u['hero'] ?? $u['kind'], $u['type'], $u['hp']);
        };
        $line = sprintf('T%d %s %s -> %s', $state['turn'] ?? 0, $ev['type'], $who($ev['actor_unit_id'] ?? '?'), $who($ev['target_unit_id'] ?? '?'));
        isset($ev['dmg']) && $line .= " dmg{$ev['dmg']}";
        isset($ev['hp_before']) && $line .= " hp{$ev['hp_before']}->{$ev['hp_after']}";
        foreach (['terrain', 'flank', 'affinity', 'multiplier'] as $k) {
            isset($ev[$k]) && ! in_array($ev[$k], ['none', 1, 1.0, null], true) && $line .= " {$k}={$ev[$k]}";
        }
        ! empty($ev['skills_applied']) && $line .= ' skills='.implode('+', $ev['skills_applied']);
        $stats['_ring'][] = $line;
        $stats['_ring'] = array_slice($stats['_ring'], -($stats['_ring_n'] ?? 8));
        if (($ev['type'] ?? null) === 'kill' && ! isset($stats['cmd_death']) && in_array($ev['target_unit_id'] ?? null, $stats['_cmd_ids'] ?? [], true)) {
            $stats['cmd_death'] = ['turn' => (int) ($state['turn'] ?? 0), 'killer' => $who($ev['actor_unit_id'] ?? '?'), 'events' => $stats['_ring']];
        }
    }

    /** 아군 NPC 단계(BattleService::allyPhase 와 같은 규칙) + 구역 추구 NPC */
    private static function allyPhase(Engine $e, array $botOptions, array &$state, array &$stats, ?\Closure $sink): void
    {
        $ids = array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && empty($u['moved'])));
        if ($ids === []) {
            return;
        }
        $goals = self::assignGoals($e, $state);
        foreach ($ids as $k => $id) {
            if (! isset($state['units'][$id])) {
                unset($ids[$k]);

                continue;
            }
            if (! empty($state['units'][$id]['route'])) {
                unset($ids[$k]);
                if (($a = RouteAi::step($e, $state, (string) $id)) !== null) {
                    self::apply($e, $state, 'a', $a, $stats, $sink);
                    if ($state['status'] !== 'active') {
                        return;
                    }
                }
            }
        }
        foreach ($ids as $k => $id) {
            if (! isset($state['units'][$id])) {
                unset($ids[$k]);

                continue;
            }
            if (RouteAi::followsRouteLeader($state, $state['units'][$id])) {
                unset($ids[$k]);
                if (($a = RouteAi::followStep($e, $state, (string) $id)) !== null) {
                    self::apply($e, $state, 'a', $a, $stats, $sink);
                    if ($state['status'] !== 'active') {
                        return;
                    }
                }
            }
        }
        foreach ($ids as $k => $id) {   // route 없는 NPC 가 구역 추구자로 지정됐으면 직접 이동
            if (isset($goals[$id]) && isset($state['units'][$id])) {
                unset($ids[$k]);
                self::goalAct($e, $state, (string) $id, $goals[$id], $stats, $sink);
                if ($state['status'] !== 'active') {
                    return;
                }
            }
        }
        $ids = array_values(array_filter($ids, fn ($id) => isset($state['units'][$id])));
        if ($ids === []) {
            return;
        }
        $plan = (new HeuristicBot($e, $botOptions))->planUnits($state, 'a', $ids);
        $state['rng'] = $plan['rng'];
        foreach ($plan['actions'] as $a) {
            if (! self::apply($e, $state, 'a', $a, $stats, $sink) || $state['status'] !== 'active') {
                break;
            }
        }
    }

    private static function playerPhase(Engine $e, HeuristicBot $bot, array &$state, array &$stats, ?\Closure $sink): void
    {
        $goals = self::assignGoals($e, $state);
        $escort = self::escortTargets($state);
        $rest = [];
        foreach ($state['units'] as $id => $u) {
            if ($u['side'] !== 'a' || ! empty($u['npc_ally'])) {
                continue;
            }
            if (isset($goals[$id])) {
                self::goalAct($e, $state, (string) $id, $goals[$id], $stats, $sink);
                if ($state['status'] !== 'active') {
                    return;
                }

                continue;
            }
            $rest[] = (string) $id;
        }
        $objOnly = ! empty($state['sim_objective_only']);   // 시뮬 전용(--objective-only): 단독 전진 금지, 호위 대상/목표 추구자 곁에 머문다
        $ms = ! empty($state['sim_must_survive']);
        if ($objOnly || $ms) {   // 동행 대상 확장(옵트인): route 없는 must_survive 아군 NPC 도 호위 대상, objective-only 면 호위 대상이 없을 때 목표 추구자를 따른다
            $mustIds = array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && ! empty($u['must_survive'])));
            $escort = array_values(array_unique(array_merge($escort, $mustIds)));
            if ($objOnly && $escort === []) {
                $escort = array_values(array_filter(array_keys($goals), fn ($g) => isset($state['units'][$g])));
            }
        }
        $followDist = $objOnly ? 2 : 3;
        foreach ($rest as $k => $id) {   // 호위 대상 NPC 에서 멀어진 유닛은 NPC 쪽으로 붙는다
            if ($escort === [] || ! isset($state['units'][$id])) {
                break;
            }
            $u = $state['units'][$id];
            $near = null;
            foreach ($escort as $n) {
                if (! isset($state['units'][$n])) {
                    continue;
                }
                $d = Engine::dist($u['x'], $u['y'], $state['units'][$n]['x'], $state['units'][$n]['y']);
                if ($near === null || $d < $near[0]) {
                    $near = [$d, $n];
                }
            }
            if ($near !== null && $near[0] > $followDist) {
                unset($rest[$k]);
                $t = $state['units'][$near[1]];
                self::goalAct($e, $state, $id, [[$t['x'], $t['y']]], $stats, $sink);
                if ($state['status'] !== 'active') {
                    return;
                }
            }
        }
        if (! $objOnly && ! empty($state['sim_push_commander']) && Engine::normalizeObjective($state['objective'] ?? null) === null) {   // 시뮬 전용(--push-commander): 사거리 안에 적이 없는 전열은 적 지휘관 쪽으로 진격
            $foe = [];
            foreach ($state['units'] as $fu) {
                $fu['side'] === 'b' && $fu['kind'] === 'commander' && $foe[] = [$fu['x'], $fu['y']];
            }
            foreach ($rest as $k => $id) {
                $u = $state['units'][$id] ?? null;
                if ($foe === [] || $u === null || ! empty($u['moved']) || $u['kind'] === 'commander' || $e->rules()->unitType($u['type'])['heal'] > 0 || $e->targetsFrom($state, $u, $u['x'], $u['y']) !== []) {
                    continue;
                }
                unset($rest[$k]);
                self::goalAct($e, $state, (string) $id, $foe, $stats, $sink);
                if ($state['status'] !== 'active') {
                    return;
                }
            }
        }
        $rest = array_values(array_filter($rest, fn ($id) => isset($state['units'][$id]) && ! $state['units'][$id]['moved']));
        if ($rest === []) {
            return;
        }
        $plan = $bot->planUnits($state, 'a', $rest, false);   // 기존 모드의 a 진영 봇과 같은 지휘관 모드(guard 등)
        $state['rng'] = $plan['rng'];
        $hold = ! empty($state['sim_defensive']) ? self::holdAnchor($state) : null;   // 시뮬 전용 --defensive: 방어 구역에서 멀리 전진하는 이동만 버린다
        if ($objOnly && ($pos = array_values(array_map(fn ($n) => [$state['units'][$n]['x'], $state['units'][$n]['y']], array_filter($escort, fn ($n) => isset($state['units'][$n]))))) !== []) {
            $hold = $pos;   // 시뮬 전용 --objective-only: 호위 대상/목표 추구자 2칸 밖으로 나가는 봇 이동은 버린다(사거리 안 공격은 그대로)
        }
        foreach ($plan['actions'] as $a) {
            if ($hold !== null && ($a['type'] ?? '') === 'move' && min(array_map(fn ($t) => Engine::dist((int) $a['x'], (int) $a['y'], $t[0], $t[1]), $hold)) > 2) {
                continue;
            }
            if (! self::apply($e, $state, 'a', $a, $stats, $sink)) {
                if ($hold === null) {
                    break;
                }

                continue;
            }
            if ($state['status'] !== 'active') {
                break;
            }
        }
    }

    /** 시뮬 전용 방어 기준 칸: hold_zone sub_objective 타일 합집합(없으면 null = 제한 없음) */
    private static function holdAnchor(array $state): ?array
    {
        $t = [];
        foreach ((array) ($state['sub_objectives'] ?? []) as $s) {
            if (($s['type'] ?? null) === 'hold_zone') {
                foreach ((array) ($s['tiles'] ?? []) as $c) {
                    $t[] = [(int) $c[0], (int) $c[1]];
                }
            }
        }

        return $t === [] ? null : $t;
    }

    /** 구역 추구자 한 명을 목표 칸으로 이동시키고(필요 시) 사거리 안 적을 공격/스킬한다 */
    private static function goalAct(Engine $e, array &$state, string $id, array $tiles, array &$stats, ?\Closure $sink): void
    {
        if (($a = self::goalStep($e, $state, $id, $tiles)) !== null && self::apply($e, $state, 'a', $a, $stats, $sink)) {
            $stats['goal_moves']++;
        }
        $u = $state['units'][$id] ?? null;
        if ($u === null || $state['status'] !== 'active' || ! empty($u['acted'])) {
            return;
        }
        $targets = $e->targetsFrom($state, $u, $u['x'], $u['y']);
        if ($targets === []) {
            return;
        }
        usort($targets, fn ($x, $y) => [$state['units'][$x]['hp'], $x] <=> [$state['units'][$y]['hp'], $y]);
        $skill = ! empty($u['actives']) ? $e->usableActive($state, $u, $targets[0]) : null;
        self::apply($e, $state, 'a', $skill !== null
            ? ['type' => 'use_skill', 'unit_id' => $id, 'skill' => $skill['code'], 'target_id' => $targets[0]]
            : ['type' => 'attack', 'unit_id' => $id, 'target_id' => $targets[0]], $stats, $sink);
    }

    /** 목표 칸 집합으로 가장 가까워지는 도달 가능 칸으로의 이동(이미 구역 안이거나 더 가까워질 수 없으면 null) */
    private static function goalStep(Engine $e, array $state, string $id, array $tiles): ?array
    {
        $u = $state['units'][$id];
        if (! empty($u['moved'])) {
            return null;
        }
        $here = "{$u['x']},{$u['y']}";
        $field = $e->costToReach($state, $e->rules()->unitType($u['type'])['move_type'], $tiles, []);
        if (! isset($field[$here]) || $field[$here] === 0) {
            return null;
        }
        $best = null;
        foreach ($e->reachable($state, $id) as $key => $spent) {
            if ($key === $here || ! isset($field[$key]) || $field[$key] >= $field[$here]) {
                continue;
            }
            $k = [$field[$key], $spent, $key];
            if ($best === null || $k < $best) {
                $best = $k;
            }
        }
        if ($best === null) {
            return null;
        }
        [$x, $y] = array_map('intval', explode(',', $best[2]));

        return ['type' => 'move', 'unit_id' => $id, 'x' => $x, 'y' => $y];
    }

    /** route 를 가진 아군 NPC 가 가리켜진 미충족 in_zone 조건의 NPC id 목록(호위 대상) */
    private static function escortTargets(array $state): array
    {
        $out = [];
        foreach (self::zoneConds($state) as $c) {
            foreach (isset($c['unit']) ? EventConditions::units($state, $c['unit']) : [] as $id) {
                $u = $state['units'][$id];
                $u['side'] === 'a' && ! empty($u['npc_ally']) && ! empty($u['route']) && $out[$id] = $id;
            }
        }

        return array_values($out);
    }

    /**
     * 구역 추구자 지정: unitId => 목표 칸 목록. 조건마다 후보(참조에 맞는 a 진영 유닛, side:a 면 비-NPC 영웅)중 목표에 가장 가까운 유닛 하나.
     * route 를 가진 NPC 는 후보에서 제외(RouteAi 가 이동). capture 목표는 점마다 가장 가까운 서로 다른 비-NPC 유닛.
     *
     * @return array<string,array<int,array{0:int,1:int}>>
     */
    private static function assignGoals(Engine $e, array $state): array
    {
        $out = [];
        $near = function (array $cands, array $tiles) use ($e, $state): ?string {
            $best = null;
            foreach ($cands as $id) {
                $u = $state['units'][$id];
                $field = $e->costToReach($state, $e->rules()->unitType($u['type'])['move_type'], $tiles, []);
                $c = $field["{$u['x']},{$u['y']}"] ?? null;
                if ($c !== null && ($best === null || [$c, $id] < $best)) {
                    $best = [$c, $id];
                }
            }

            return $best[1] ?? null;
        };
        foreach (self::zoneConds($state) as $c) {
            $tiles = self::zoneTiles($state, $c);
            if ($tiles === []) {
                continue;
            }
            if (isset($c['unit'])) {
                $cands = array_filter(EventConditions::units($state, $c['unit']), fn ($id) => $state['units'][$id]['side'] === 'a' && empty($state['units'][$id]['route']));
            } elseif (($c['side'] ?? null) === 'a') {
                $cands = array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && empty($u['npc_ally']) && $u['kind'] !== 'troop' && $e->rules()->unitType($u['type'])['heal'] <= 0));
            } else {
                continue;
            }
            if (($id = $near(array_values($cands), $tiles)) !== null) {
                $out[$id] ??= $tiles;
            }
        }
        if (($cap = Engine::captureObjective($state)) !== null) {
            $pool = array_keys(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && empty($u['npc_ally']) && ($cap['by'] !== 'commander' || $u['kind'] === 'commander') && $e->rules()->unitType($u['type'])['heal'] <= 0));
            $points = $cap['mode'] === 'any' ? [] : $cap['points'];
            if ($cap['mode'] === 'any') {   // 하나만 잡으면 되므로 가장 가까운 (유닛, 점) 쌍
                $bestPair = null;
                foreach ($cap['points'] as $p) {
                    if (($id = $near($pool, [$p])) !== null) {
                        $u = $state['units'][$id];
                        $d = Engine::dist($u['x'], $u['y'], $p[0], $p[1]);
                        ($bestPair === null || $d < $bestPair[0]) && $bestPair = [$d, $id, $p];
                    }
                }
                $bestPair !== null && $out[$bestPair[1]] ??= [$bestPair[2]];
            }
            foreach ($points as $p) {
                $pool = array_values(array_filter($pool, fn ($id) => ! isset($out[$id])));
                if (($id = $near($pool, [$p])) !== null) {
                    $out[$id] = [$p];
                }
            }
        }

        return $out;
    }

    /** 미충족(비-latched, 현재 거짓) win_conditions 트리의 in_zone 잎. not 아래는 제외 */
    private static function zoneConds(array $state): array
    {
        $out = [];
        $walk = function (array $n) use (&$walk, &$out, $state) {
            foreach (['all', 'any'] as $k) {
                if (isset($n[$k])) {
                    array_map($walk, $n[$k]);

                    return;
                }
            }
            if (isset($n['not'])) {
                return;
            }
            if (($n['type'] ?? null) === 'in_zone' && ! EventConditions::evaluate($n, $state)) {
                $out[] = $n;
            }
        };
        foreach ($state['win_rule']['conds'] ?? [] as $i => $c) {
            empty($state['win_rule']['latched'][$i]) && $walk($c['when']);
        }
        if (! empty($state['sim_cue_goals'])) {   // 시뮬 전용(--cue-goals): 아직 발동하지 않은 cue.when 의 in_zone(예: @protagonist 신호 타일)도 목표로 삼는다(win 조건 뒤 순서 = 낮은 우선순위)
            foreach ($state['cues'] ?? [] as $cue) {
                isset($cue['when']) && ! in_array($cue['id'], $state['cue_done'] ?? [], true) && $walk($cue['when']);
            }
        }

        return $out;
    }

    /** @return array<int,array{0:int,1:int}> */
    private static function zoneTiles(array $state, array $c): array
    {
        if (isset($c['rect'])) {
            $t = [];
            for ($x = $c['rect'][0]; $x <= min($c['rect'][2], (int) $state['width'] - 1); $x++) {
                for ($y = $c['rect'][1]; $y <= min($c['rect'][3], (int) $state['height'] - 1); $y++) {
                    $t[] = [$x, $y];
                }
            }

            return $t;
        }

        return $c['tiles'] ?? [];
    }
}
