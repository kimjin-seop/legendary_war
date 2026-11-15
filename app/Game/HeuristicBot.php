<?php

namespace App\Game;

/**
 * 휴리스틱 봇: 처치/상성 우선 공격, 없으면 가까운 적을 향해 이동.
 * 옵션: commander_mode = guard(지휘관 제자리 공격만) | engage(일반 유닛처럼 교전/접근),
 *       path_approach = 접근 시 맨해튼 대신 경로(이동 비용·점유·이동 불가 지형 반영) 거리 사용,
 *       formation_lead = n>0이면 접근 이동 시 아군 전열(커맨더 제외 아군 중앙값)보다 n칸 넘게 앞서지 않음(0=off),
 *       squad_leash = n>0이면(squad on) 일반 병종(부대 병사)은 소속 영웅 기준 n칸 안 칸만 이동 후보로 하고, 영웅이 먼저 행동한 뒤 병사가 계획한다(0=off).
 *       healer_ai = 치유사 전용 AI(부상 아군 인접 위치 우선, 평시 지휘관 근처 후열 대기, 처치 가능할 때만 공격).
 * 상태에서만 결정하며(rng는 동점 보정) 시드가 같으면 같은 행동을 낸다.
 */
final class HeuristicBot
{
    private readonly array $opts;

    public function __construct(private readonly Engine $engine, array $options = [])
    {
        $this->opts = array_merge(['commander_mode' => 'guard', 'healer_ai' => true, 'path_approach' => false, 'formation_lead' => 0, 'engage_when_no_combat' => false, 'engage_late_turns' => 0, 'avoid_threat' => 0, 'terrain_bonus' => 0, 'follow_front' => false, 'squad_leash' => 0, 'commander_guard' => true, 'commander_guard_risk' => 0.8, 'cg_low_risk' => 0.3, 'cg_escort_n' => 2, 'cg_escort_hp' => 0.7, 'cg_pct' => 12, 'cg_retreat' => true, 'cg_escort' => true, 'cg_bonus' => true, 'enemy_aggr' => false, 'enemy_aggr_hp' => 0.4, 'cg_focus_r' => 0, 'cg_focus_bonus' => 60], $options);
    }

    private function isHealer(array $u): bool
    {
        return $this->opts['healer_ai'] && $this->engine->rules()->unitType($u['type'])['heal'] > 0;
    }

    /** plan() 시작 시 계산: 지휘관 guard를 풀고 교전해야 하는가(engage_when_no_combat) */
    private bool $forceEngage = false;

    private function guards(array $u): bool
    {
        return $u['kind'] === 'commander' && $this->opts['commander_mode'] === 'guard' && ! $this->forceEngage;
    }

    /**
     * 지휘관 교전 전환 판정. engage_when_no_combat 모드: own=아군 전투 부대 없음, foe=적 전투 부대 없음, true=어느 한쪽,
     * lead/trail=어느 한쪽 없음 + 턴 상한 판정(생존 수 -> HP 비율)에서 앞섬/뒤짐(동률 포함)인 쪽만.
     * engage_late_turns=n>0이면 마지막 n턴(turn > max_turns-n)에도 교전 전환(lead/trail 모드면 같은 우열 필터 적용).
     * 전투 부대 = 지휘관·치유사 제외.
     */
    private function noCombatTroops(array $state, string $side): bool
    {
        $mode = $this->opts['engage_when_no_combat'];
        $late = (int) $this->opts['engage_late_turns'] > 0 && ($state['turn'] ?? 1) > ($state['max_turns'] ?? 0) - (int) $this->opts['engage_late_turns'];
        if (! $mode && ! $late) {
            return false;
        }
        $has = ['a' => false, 'b' => false];
        foreach ($state['units'] as $o) {
            if ($o['kind'] !== 'commander' && $this->engine->rules()->unitType($o['type'])['heal'] <= 0) {
                $has[$o['side']] = true;
            }
        }
        $other = $side === 'a' ? 'b' : 'a';
        $any = $mode && match ($mode) {
            'own' => ! $has[$side],
            'foe' => ! $has[$other],
            default => ! $has[$side] || ! $has[$other],
        };
        if (! in_array($mode, ['lead', 'trail'], true)) {
            return $any || $late;
        }
        if (! $any && ! $late) {
            return false;
        }
        $alive = ['a' => 0, 'b' => 0];
        $hp = ['a' => 0, 'b' => 0];
        $init = ['a' => 0, 'b' => 0];
        foreach ($state['units'] as $o) {
            $alive[$o['side']]++;
            $hp[$o['side']] += $o['hp'];
            $init[$o['side']] += $o['max_hp'];
        }
        foreach (['a', 'b'] as $s) {
            $init[$s] = $state['init_hp'][$s] ?? $init[$s];
        }
        $r = fn ($s) => $hp[$s] / max(1, $init[$s]);
        $c = $alive[$side] <=> $alive[$other];
        if ($c === 0) {
            $c = abs($r($side) - $r($other)) < 1e-9 ? 0 : ($r($side) <=> $r($other));
        }

        return $mode === 'lead' ? $c >= 0 : $c <= 0;
    }

    /** @return array{actions:array<int,array>,rng:int} */
    public function plan(array $state, string $side): array
    {
        $actions = [];
        $work = $state;
        $this->forceEngage = $this->noCombatTroops($state, $side);
        $ids = array_keys(array_filter($work['units'], fn ($u) => $u['side'] === $side));
        $this->runUnits($work, $side, $ids, $actions);
        if ($work['status'] === 'active') {
            $actions[] = ['type' => 'end_turn'];
        }

        return ['actions' => $actions, 'rng' => $work['rng']];
    }

    /**
     * 지정 유닛만 행동 계획(end_turn 없음): 스테이지 아군 NPC(npc_ally) 자동 행동용. 항상 교전 모드(지휘관 guard 무시).
     *
     * @param  string[]  $ids
     * @return array{actions:array<int,array>,rng:int}
     */
    public function planUnits(array $state, string $side, array $ids, bool $engage = true): array
    {
        $actions = [];
        $work = $state;
        $this->forceEngage = $engage ? true : $this->noCombatTroops($state, $side);   // $engage=false: plan() 과 같은 지휘관 모드(guard 등) 적용(시뮬 realistic 플레이어 구동용)
        $this->runUnits($work, $side, $ids, $actions);

        return ['actions' => $actions, 'rng' => $work['rng']];
    }

    /** 교대 행동에서 활성 부대가 아직 $key인가(활성화 종료/붕괴/차례 교체 시 false) */
    private function stillActive(array $work, string $key): bool
    {
        return $work['status'] === 'active' && ($work['alt']['active'] ?? null) === $key;
    }

    /**
     * 교대 행동 봇: 한 번에 1부대만 계획한다. 활성 부대가 없으면 부대를 골라 activate, 소속 유닛을 행동시킨 뒤 end_activation.
     * 부대 선택 = 공격 가능한 유닛의 최고 점수 우선, 없으면 적과 가장 가까운 부대 우선. ready 부대가 없으면 actions=[].
     *
     * @return array{actions:array<int,array>,rng:int}
     */
    public function planActivation(array $state, string $side): array
    {
        $e = $this->engine;
        $actions = [];
        $work = $state;
        $this->forceEngage = $this->noCombatTroops($state, $side);
        $key = $work['alt']['active'] ?? null;
        if ($key === null) {
            $key = $this->pickSquad($work, $side);
            if ($key === null) {
                return ['actions' => [], 'rng' => $work['rng']];
            }
            $act = ['type' => 'activate', 'squad_id' => $key];
            [$work] = $e->apply($work, $side, $act);
            $actions[] = $act;
        }
        $this->runUnits($work, $side, $e->altMembers($work, $key), $actions, $key);
        if ($this->stillActive($work, $key)) {
            $actions[] = ['type' => 'end_activation'];
        }

        return ['actions' => $actions, 'rng' => $work['rng']];
    }

    private function pickSquad(array $work, string $side): ?string
    {
        $e = $this->engine;
        $best = null;
        foreach ($e->altReadySquads($work, $side) as $key) {
            $hasAtk = 0;
            $maxScore = -1.0e9;
            $near = 99;
            $tmp = $work;   // combatSteps가 rng를 소비하므로 평가는 사본으로
            foreach ($e->altMembers($work, $key) as $id) {
                $u = $work['units'][$id];
                $near = min($near, $this->nearestEnemy($work, $u));
                if ($this->isHealer($u)) {
                    continue;
                }
                $tiles = $this->guards($u) ? ["{$u['x']},{$u['y']}" => 0] : $e->reachable($work, $id);
                $b = $this->bestAttack($tmp, $u, $tiles);
                if ($b !== null) {
                    $hasAtk = 1;
                    $maxScore = max($maxScore, $b[0]);
                }
            }
            $val = [$hasAtk, $maxScore, -$near];
            if ($best === null || $val > $best[0]) {
                $best = [$val, $key];
            }
        }

        return $best[1] ?? null;
    }

    /**
     * 유닛 목록을 순서(치유사 -> 지휘관 마지막, 가까운 적 순)대로 행동시켜 actions에 쌓는다. plan()/planActivation() 공용.
     * $lockKey가 있으면 교대 행동: 활성 부대가 바뀌면(자동 종료/붕괴) 즉시 중단.
     */
    private function runUnits(array &$work, string $side, array $ids, array &$actions, ?string $lockKey = null): void
    {
        $e = $this->engine;
        // 치유사는 아군 이동 후, 지휘관은 마지막에 행동
        $leashOn = $this->leashOn($work);
        // squad_leash on: 영웅(지휘관 포함)이 먼저 행동해 병사가 갱신된 영웅 위치 기준으로 계획한다
        $rank = fn ($u) => $leashOn && $u['kind'] !== 'troop' && ! $this->isHealer($u) ? -1 : ($u['kind'] === 'commander' ? 2 : ($this->isHealer($u) ? 1 : 0));
        $snap = $work;
        usort($ids, function ($a, $b) use ($snap, $rank) {
            return [$rank($snap['units'][$a]), $this->nearestEnemy($snap, $snap['units'][$a])]
                <=> [$rank($snap['units'][$b]), $this->nearestEnemy($snap, $snap['units'][$b])];
        });
        foreach ($ids as $id) {
            if (! isset($work['units'][$id]) || $work['status'] !== 'active') {
                continue;
            }
            if ($lockKey !== null && ! $this->stillActive($work, $lockKey)) {
                break;
            }
            if ($e->firstMoveSlots($work, $side) === 0) {
                break;   // first_move_limit: 선공 1턴 행동 유닛 수 소진
            }
            $u = $work['units'][$id];
            if (isset($u['hold_until_turn']) && (int) $work['turn'] < (int) $u['hold_until_turn']) {
                continue;   // 스테이지 enemy_squad.squads[].hold_until_turn: 해당 라운드 전까지 제자리 대기(공격·이동 모두 안 함, 해제 조건 없음)
            }
            if (! empty($u['route'])) {   // 경로 부대(stage enemy_squad route): 공격·대기 없이 RouteAi 로만 이동(from_turn 전·도착 후엔 제자리). route 없는 유닛은 아래 현행 로직
                if (($ra = RouteAi::step($e, $work, $id)) !== null) {
                    [$work] = $e->apply($work, $side, $ra);
                    $actions[] = $ra;
                }

                continue;
            }
            // 지원형 액티브(buff/heal)·surge는 spec의 단순 규칙으로 판단(조건 불충족이면 아무것도 하지 않아 기존 행동열/rng 소비와 동일)
            $pre = empty($u['actives']) ? null : ($e->supportActive($work, $u) ?? ($this->guards($u) ? null : $e->surgeAction($work, $u)));
            if ($pre !== null) {
                [$work] = $e->apply($work, $side, $pre);
                $actions[] = $pre;
                if ($lockKey !== null && ! $this->stillActive($work, $lockKey)) {
                    break;
                }
                $u = $work['units'][$id];
            }
            // 치유사 지휘관은 leash 병사를 이끌어야 하므로 guard라도 이동 후보를 연다(healerSteps가 전열 병사와 나란히 전진)
            $stay = $this->guards($u) && ! ($leashOn && $this->opts['follow_front'] && $this->isHealer($u));
            $tiles = $stay ? ["{$u['x']},{$u['y']}" => 0] : $e->reachable($work, $id);
            if ($u['acted']) {
                $steps = [];   // 액티브로 영웅 행동을 이미 소모
            } elseif ($this->isHealer($u)) {
                $steps = $this->healerSteps($work, $u, $tiles);
            } elseif (($this->opts['follow_front'] || $this->cgOn($work, $u['side'])) && $this->guards($u)) {
                $steps = $this->commanderSteps($work, $u, $tiles);   // guard 지휘관: 제자리 공격 + 평시 전열 후방 추종
            } elseif ($leashOn && ($leader = $this->leashLeader($work, $u)) !== null) {
                $steps = $this->leashedSteps($work, $u, $tiles, $leader);
            } else {
                $steps = $this->combatSteps($work, $u, $tiles);
            }
            foreach ($steps as $a) {
                [$work] = $e->apply($work, $side, $a);
                $actions[] = $a;
                if ($work['status'] !== 'active' || ($lockKey !== null && ! $this->stillActive($work, $lockKey))) {
                    break 2;   // 한 동작으로 전투가 끝났으면(점령/격파 등) 남은 동작은 battle_finished 예외이므로 중단
                }
            }
            // 방향 시스템 on: 공격하지 않은(행동 미종료) 유닛은 가장 가까운 적 쪽을 바라보고 대기(off면 기존 행동열과 동일)
            if (Engine::facingOn($work) && $work['status'] === 'active' && isset($work['units'][$id]) && ! $work['units'][$id]['acted']) {
                $fu = $work['units'][$id];
                $best = null;
                foreach ($work['units'] as $o) {
                    if ($o['side'] !== $side) {
                        $d = Engine::dist($fu['x'], $fu['y'], $o['x'], $o['y']);
                        if ($best === null || $d < $best[0]) {
                            $best = [$d, Engine::axisDir($o['x'] - $fu['x'], $o['y'] - $fu['y'])];
                        }
                    }
                }
                if ($best !== null && $best[1] !== null) {
                    $w = ['type' => 'wait', 'unit_id' => $id, 'facing' => $best[1]];
                    [$work] = $e->apply($work, $side, $w);
                    $actions[] = $w;
                    if ($lockKey !== null && ! $this->stillActive($work, $lockKey)) {
                        break;
                    }
                }
            }
        }
    }

    private function leashOn(array $state): bool
    {
        return (int) $this->opts['squad_leash'] > 0 && Engine::squadOn($state);
    }

    /** leash 대상 병사(치유사 제외 troop)의 소속 영웅. 대상이 아니거나 영웅이 없으면 null */
    private function leashLeader(array $state, array $u): ?array
    {
        $l = $u['leader_id'] ?? null;

        if ($u['kind'] !== 'troop' || $this->isHealer($u) || $l === null || ! isset($state['units'][$l])) {
            return null;
        }
        $leader = $state['units'][$l];

        // 영웅이 HP 40% 미만으로 후퇴 중이면 병사는 leash를 풀고 싸워 엄호한다(후퇴하는 영웅을 끌고 다니는 추격전 방지)
        return $leader['hp'] < 0.4 * $leader['max_hp'] ? null : $leader;
    }

    /**
     * squad_leash: 소속 영웅 leash 칸 안의 칸만 후보로 기존 공격/접근 로직 적용(사거리 내 적 공격 우선).
     * 갈 수 있는 leash 안 칸이 없으면(영웅이 멀어짐) 영웅에 가장 가까운 칸으로 복귀.
     */
    private function leashedSteps(array &$work, array $u, array $tiles, array $leader): array
    {
        $leash = (int) $this->opts['squad_leash'];
        $in = array_filter($tiles, function ($_, $key) use ($leader, $leash) {
            [$x, $y] = array_map('intval', explode(',', $key));

            return Engine::dist($x, $y, $leader['x'], $leader['y']) <= $leash;
        }, ARRAY_FILTER_USE_BOTH);
        if ($in !== []) {
            $steps = $this->combatSteps($work, $u, $in);
            if ($steps === [] || ! in_array($steps[array_key_last($steps)]['type'], ['attack', 'use_skill'], true)) {
                // 교착 해소: 영웅이 소속 병사에 둘러싸여 전진할 칸이 없으면(공격도 못 하는 대치) 이번 턴 병사는 leash를 풀고 앞서 나가 길을 연다
                if ($this->leaderBoxedIn($work, $leader)) {
                    return $this->combatSteps($work, $u, $tiles);
                }
                // 대치 완화: 영웅이 이번 턴 이동·공격을 하지 않았으면(전열 상한/위협으로 정지) 병사만 leash+2칸까지 나가 교전 거리를 만든다
                if (empty($leader['moved']) && empty($leader['acted'])) {
                    $wide = array_filter($tiles, fn ($_, $key) => Engine::dist(...array_map('intval', explode(',', $key)), ...[$leader['x'], $leader['y']]) <= $leash + 2, ARRAY_FILTER_USE_BOTH);
                    $wideSteps = $this->combatSteps($work, $u, $wide);
                    if ($wideSteps !== [] || Engine::dist($u['x'], $u['y'], $leader['x'], $leader['y']) <= $leash + 2) {
                        return $wideSteps;   // 이미 leash+2 안이면 제자리 유지(들락날락 방지)
                    }
                }
            }

            return $steps;
        }
        $best = null;
        foreach ($tiles as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            $k = [Engine::dist($x, $y, $leader['x'], $leader['y']), $this->nearestEnemyFrom($work, $u, $x, $y), $x, $y];
            if ($best === null || $k < $best[0]) {
                $best = [$k, $key];
            }
        }

        return $best === null ? [] : $this->combatSteps($work, $u, [$best[1] => 0]);
    }

    /** 영웅이 지금보다 적에게 가까워지는 이동 칸이 하나도 없는가(자기 병사들에 막힌 경우 포함) */
    private function leaderBoxedIn(array $state, array $leader): bool
    {
        $cur = $this->nearestEnemyFrom($state, $leader, $leader['x'], $leader['y']);
        foreach ($this->engine->reachable($state, $leader['id']) as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            if ($this->nearestEnemyFrom($state, $leader, $x, $y) < $cur) {
                return false;
            }
        }

        return true;
    }

    /** 이동 가능 타일들에서 공격 가능한 최고 점수 [score,x,y,targetId]. 없으면 null (rng 소비 순서는 기존 combatSteps와 동일) */
    private function bestAttack(array &$work, array $u, array $tiles): ?array
    {
        $e = $this->engine;
        $best = null;
        $ctx = $this->threatContext($work, $u);
        foreach ($tiles as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            // aggressive(적 b 비지휘관·비치유·HP 충분)는 approach 와 같은 기준으로 위협 회피를 면제한다(공격만 버리고 같은 칸으로 걸어 들어가 이동만 하던 문제 방지)
            $unsafe = ! $this->aggressive($work, $u) && $ctx !== null && $this->threatAhead($ctx, $u, $x, $y) && $ctx['risk']($x, $y) >= $ctx['limit'];
            foreach ($e->targetsFrom($work, $u, $x, $y) as $tid) {
                if ($unsafe && $e->damage($work, $u, $x, $y, $work['units'][$tid]) < $work['units'][$tid]['hp']) {
                    continue;   // avoid_threat: 전열 밖 위험 칸에서의 비처치 공격은 하지 않음
                }
                $score = $this->score($work, $u, $x, $y, $work['units'][$tid]) + Rng::int($work, 3) * 0.1;
                if ($best === null || $score > $best[0]) {
                    $best = [$score, $x, $y, $tid];
                }
            }
        }

        return $best;
    }

    /**
     * capture 목표(진영 a 전용) 점령 담당 배정: 지휘관·치유사·guard 유닛을 제외한 아군 중 미점령 목표 칸에 가까운 순서대로 1명씩(mode=all이면 미점령 칸 수만큼).
     * 이미 점유 중인 유닛이 가장 가까우므로(거리 0) 점유형에서는 자리를 지킨다. 담당이 아니거나 목표가 없으면 null(기존 행동).
     *
     * @return array{0:int,1:int}|null 담당 유닛이 향할 목표 칸
     */
    private function captureGoal(array $state, array $u): ?array
    {
        $o = Engine::captureObjective($state);
        if ($o === null || $u['side'] !== 'a' || $u['kind'] === 'commander' || $this->isHealer($u) || $this->guards($u)) {
            return null;
        }
        $pts = $o['points'];
        $heldBy = fn ($x, $y) => array_values(array_filter($state['units'], fn ($v) => $v['x'] === $x && $v['y'] === $y && $v['side'] === 'a'));
        $unheld = array_values(array_filter($pts, fn ($p) => ! $heldBy($p[0], $p[1])));
        $held = array_values(array_filter($pts, fn ($p) => $heldBy($p[0], $p[1])));
        // 점유 중인 유닛은 자리 유지(점유형), 미점령 칸은 가까운 유닛 순으로 배정
        foreach ($held as $p) {
            $h = $heldBy($p[0], $p[1])[0];
            if ($h['id'] === $u['id'] && $o['hold_turns'] > 0) {
                return $p;
            }
        }
        if (! $unheld) {
            return null;
        }
        $cands = array_values(array_filter($state['units'], fn ($v) => $v['side'] === 'a' && $v['kind'] !== 'commander' && ! $this->isHealer($v) && ! $this->guards($v)));
        $assign = [];
        foreach ($unheld as $p) {
            usort($cands, fn ($a, $b) => [Engine::dist($a['x'], $a['y'], $p[0], $p[1]), $a['id']] <=> [Engine::dist($b['x'], $b['y'], $p[0], $p[1]), $b['id']]);
            foreach ($cands as $c) {
                if (! isset($assign[$c['id']])) {
                    $assign[$c['id']] = $p;
                    break;
                }
            }
            if ($o['mode'] === 'any') {
                break;   // any: 가장 가까운 한 곳만
            }
        }

        return $assign[$u['id']] ?? null;
    }

    private function combatSteps(array &$work, array $u, array $tiles): array
    {
        if (($goal = $this->captureGoal($work, $u)) !== null) {
            $e = $this->engine;
            $type = $e->rules()->unitType($u['type']);
            $cost = $e->costToReach($work, $type['move_type'], [$goal], []);
            $bestTile = null;
            foreach ($tiles as $key => $_) {
                if (isset($cost[$key])) {
                    [$tx, $ty] = array_map('intval', explode(',', $key));
                    $sc = [$cost[$key], $tx, $ty];
                    if ($bestTile === null || $sc < $bestTile) {
                        $bestTile = $sc;
                    }
                }
            }
            $steps = [];
            $cx = $u['x'];
            $cy = $u['y'];
            if ($bestTile !== null && ($bestTile[1] !== $u['x'] || $bestTile[2] !== $u['y'])) {
                $steps[] = ['type' => 'move', 'unit_id' => $u['id'], 'x' => $bestTile[1], 'y' => $bestTile[2]];
                $cx = $bestTile[1];
                $cy = $bestTile[2];
            }
            if (($tg = $e->targetsFrom($work, $u, $cx, $cy)) !== []) {   // 이동한 칸에서 사거리 안의 적이 있으면 공격(가장 낮은 HP)
                usort($tg, fn ($a, $b) => [$work['units'][$a]['hp'], $a] <=> [$work['units'][$b]['hp'], $b]);
                $steps[] = ['type' => 'attack', 'unit_id' => $u['id'], 'target_id' => $tg[0]];
            }

            return $steps;
        }
        $best = $this->bestAttack($work, $u, $tiles);
        if ($best === null) {
            return $this->approach($work, $u, $tiles);
        }
        $steps = [];
        if ($best[1] !== $u['x'] || $best[2] !== $u['y']) {
            $steps[] = ['type' => 'move', 'unit_id' => $u['id'], 'x' => $best[1], 'y' => $best[2]];
        }
        // 단순 규칙: 사용 가능한 액티브(레거시=쿨다운 0·잔여 횟수>0, MP 방식=MP 충분·이번 턴 미사용; 부족하면 usableActive가 null -> 일반 공격)가 있으면 일반 공격 대신 사용(영웅 행동 소모 동일, 같은 공격 대상). strike는 항상, aoe는 대상 주변에 인접 적이 더 있을 때만(usableActive가 판단)
        $skill = $this->engine->usableActive($work, $u, $best[3]);
        $steps[] = $skill !== null
            ? ['type' => 'use_skill', 'unit_id' => $u['id'], 'skill' => $skill['code'], 'target_id' => $best[3]]
            : ['type' => 'attack', 'unit_id' => $u['id'], 'target_id' => $best[3]];

        return $steps;
    }

    /** 가장 앞선 아군 부대 유닛(지휘관·치유사·자기 제외, 가장 가까운 적과의 거리 최소, 동률 id순). 없으면 null */
    private function frontAnchor(array $state, array $u): ?array
    {
        $best = null;
        foreach ($state['units'] as $o) {
            if ($o['side'] !== $u['side'] || $o['id'] === $u['id'] || $o['kind'] === 'commander' || $this->engine->rules()->unitType($o['type'])['heal'] > 0) {
                continue;
            }
            $k = [$this->nearestEnemyFrom($state, $o, $o['x'], $o['y']), $o['id']];
            if ($best === null || $k < $best[0]) {
                $best = [$k, $o];
            }
        }

        return $best[1] ?? null;
    }

    /** (x,y)에 섰을 때 다음 적 턴에 이동+사거리로 닿는 적 유닛 수(위협 사거리 안 진입 판정, 0이면 안전) */
    private function threatCount(array $state, array $u, int $x, int $y): int
    {
        $n = 0;
        foreach ($state['units'] as $o) {
            if ($o['side'] === $u['side']) {
                continue;
            }
            $t = $this->engine->rules()->unitType($o['type']);
            if (Engine::dist($x, $y, $o['x'], $o['y']) <= $t['range_max'] + $o['move']) {
                $n++;
            }
        }

        return $n;
    }

    /**
     * 지휘관(guard 모드 + follow_front): 사거리 안 적이 있으면 제자리 공격(기존 guard), 아니면 이동.
     * 이동 = 가장 앞선 아군 부대 후방 2~3칸 유지(적 위협 밖 칸 우선), HP 40% 미만이거나 현재 칸이 위협 사거리 안이면 위협 최소 칸으로 후퇴/대기.
     * 앞선 아군이 없으면 제자리.
     */
    private function commanderSteps(array &$work, array $u, array $stay): array
    {
        $atk = $this->combatSteps($work, $u, $stay);   // guard: 제자리 공격만(없으면 approach가 [] 반환)
        // 지휘관 보호: 위험(예상 피해 >= 허용치)할 때만, 그중 cg_pct% 확률(시드 고정 rng)로 보호 행동. 그 외에는 기존 행동 그대로(교착·클리어 불가 방지의 완화 장치)
        $guardNow = false;
        $allowed = 0.0;
        $riskHere = 0;
        if ($this->cgOn($work, $u['side']) && ! empty($this->opts['cg_retreat'])) {
            $allowed = $this->cgAllowed($u);
            $riskHere = $this->commanderRisk($work, $u, $u['x'], $u['y']);
            $guardNow = $riskHere > $allowed && Rng::int($work, 100) < (int) $this->opts['cg_pct'];
        }
        if ($guardNow) {
            if ($atk !== [] && ($last = end($atk)) && in_array($last['type'], ['attack', 'use_skill'], true) && isset($work['units'][$last['target_id']])
                && $this->engine->damage($work, $u, $u['x'], $u['y'], $work['units'][$last['target_id']]) >= $work['units'][$last['target_id']]['hp']) {
                return $atk;   // 단독 공격 금지의 예외: 확정 처치
            }
            $ret = $this->cgRetreat($work, $u, $allowed, $riskHere);   // 엄호 있는 더 안전한 칸으로 후퇴(후퇴 후 안전하면 사거리 내 공격)
            if ($ret !== []) {
                return $ret;
            }
        }
        if ($atk !== []) {
            return $atk;   // 더 안전한 엄호 칸이 없거나 보호 행동을 하지 않으면 그 자리에서 기존대로 교전(구석 도주 금지)
        }
        if (! $this->opts['follow_front'] && $this->cgOn($work, $u['side'])) {
            return [];   // follow_front off: 위협이 없으면 기존처럼 제자리(보호 AI는 후퇴만 추가)
        }
        $anchor = $this->frontAnchor($work, $u);
        if ($anchor === null) {
            return [];
        }
        $low = $u['hp'] < 0.4 * $u['max_hp'];
        $leash = $this->leashOn($work);
        $anchorFoe = $this->nearestEnemyFrom($work, $anchor, $anchor['x'], $anchor['y']);
        $best = null;
        foreach ($this->engine->reachable($work, $u['id']) as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            if ($guardNow && ($x !== $u['x'] || $y !== $u['y']) && $this->commanderRisk($work, $u, $x, $y) > $allowed) {
                continue;   // 지휘관 보호: 허용 위협을 넘는 칸으로는 전진하지 않는다(단독 돌출 금지)
            }
            $th = $this->threatCount($work, $u, $x, $y);
            $da = Engine::dist($x, $y, $anchor['x'], $anchor['y']);
            $foe = $this->nearestEnemyFrom($work, $u, $x, $y);
            if ($leash && ! $low) {
                // 부대와 함께 천천히 전진: 최전선 병사보다 1칸 넘게 앞서지 않는(단독 돌출 금지) 칸 중 적에 가장 가까운 칸(전열 뒤라 위협 칸 허용)
                $score = [-max(0, $anchorFoe - 1 - $foe), -$foe, -$x, -$y];
            } else {
                $score = $low ? [-$th, $foe, -$x, -$y] : [-$th, -max(0, 2 - $da, $da - 3), $foe, -$x, -$y];
            }
            if ($best === null || $score > $best[0]) {
                $best = [$score, $x, $y];
            }
        }
        if ($best === null || ($best[1] === $u['x'] && $best[2] === $u['y'])) {
            return [];
        }

        return [['type' => 'move', 'unit_id' => $u['id'], 'x' => $best[1], 'y' => $best[2]]];
    }

    /** 치유사: 치유 위치 > (처치 가능한 공격) > 후열 대기 */    private function healerSteps(array &$work, array $u, array $tiles): array
    {
        $e = $this->engine;
        $heal = $e->rules()->unitType($u['type'])['heal'] + ($e->options()['passive_skills'] ? ($u['passive']['heal'] ?? 0) : 0);
        $allies = array_filter($work['units'], fn ($o) => $o['side'] === $u['side'] && $o['id'] !== $u['id']);
        $enemies = array_filter($work['units'], fn ($o) => $o['side'] !== $u['side']);
        $cmd = null;
        foreach ($allies as $o) {
            if ($o['kind'] === 'commander') {
                $cmd = $o;
            }
        }
        $anchor = $this->opts['follow_front'] ? $this->frontAnchor($work, $u) : null;
        $anchorFoe = $anchor !== null && $u['kind'] !== 'troop' && $this->leashOn($work) ? $this->nearestEnemyFrom($work, $anchor, $anchor['x'], $anchor['y']) : null;
        $bestHeal = null;
        $bestWait = null;
        foreach ($tiles as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            $gain = 0;
            foreach ($allies as $o) {
                if (Engine::dist($x, $y, $o['x'], $o['y']) === 1 && $o['hp'] < $o['max_hp']) {
                    $gain += min($heal, $o['max_hp'] - $o['hp']) * ($o['kind'] === 'commander' ? 1.5 : 1.0);
                }
            }
            $nearestFoe = 99;
            $threat = 0;
            foreach ($enemies as $o) {
                $d = Engine::dist($x, $y, $o['x'], $o['y']);
                $nearestFoe = min($nearestFoe, $d);
                if ($d <= 2) {
                    $threat++;
                }
            }
            if ($gain > 0) {
                $score = [$gain - 3 * $threat, -$x, -$y];
                if ($bestHeal === null || $score > $bestHeal[0]) {
                    $bestHeal = [$score, $x, $y];
                }
            }
            // 평시: follow_front면 가장 앞선 아군 부대의 후방 1~2칸(적 위협 밖), 아니면 지휘관 인접(거리 1~2) 중 적에게서 먼 후열
            if ($anchor !== null && $anchorFoe !== null) {
                // squad_leash: 치유사가 지휘관/영웅이면 병사가 leash에 묶이므로 최전선 병사와 나란히(앞서지 않게) 함께 전진
                $wscore = [-max(0, $anchorFoe - $nearestFoe), -$nearestFoe, -$x, -$y];
            } elseif ($anchor !== null) {
                $da = Engine::dist($x, $y, $anchor['x'], $anchor['y']);
                $wscore = [-$this->threatCount($work, $u, $x, $y), -max(0, 1 - $da, $da - 2), $nearestFoe, -$x, -$y];
            } else {
                $dc = $cmd ? Engine::dist($x, $y, $cmd['x'], $cmd['y']) : 0;
                $wscore = [-abs($dc - 1), $nearestFoe, -$x, -$y];
            }
            if ($bestWait === null || $wscore > $bestWait[0]) {
                $bestWait = [$wscore, $x, $y];
            }
        }
        $target = $bestHeal ?? $bestWait;
        $steps = [];
        if ($target && ($target[1] !== $u['x'] || $target[2] !== $u['y'])) {
            $steps[] = ['type' => 'move', 'unit_id' => $u['id'], 'x' => $target[1], 'y' => $target[2]];
        }
        // 치유가 우선: 치유 위치가 있으면 공격하지 않음. 없을 때만 '처치 가능' 공격
        if ($bestHeal === null) {
            $tx = $target[1] ?? $u['x'];
            $ty = $target[2] ?? $u['y'];
            foreach ($e->targetsFrom($work, $u, $tx, $ty) as $tid) {
                if ($e->damage($work, $u, $tx, $ty, $work['units'][$tid]) >= $work['units'][$tid]['hp']) {
                    $steps[] = ['type' => 'attack', 'unit_id' => $u['id'], 'target_id' => $tid];
                    break;
                }
            }
        }

        return $steps;
    }

    private function nearestEnemy(array $state, array $u): int
    {
        $m = 99;
        foreach ($state['units'] as $o) {
            if ($o['side'] !== $u['side']) {
                $m = min($m, Engine::dist($u['x'], $u['y'], $o['x'], $o['y']));
            }
        }

        return $m;
    }

    private function score(array $state, array $att, int $x, int $y, array $def): float
    {
        $e = $this->engine;
        $dmg = $e->damage($state, $att, $x, $y, $def);
        $score = min($dmg, $def['hp']) + $e->rules()->multiplier($att['type'], $def['type']) * 10;
        if (($cap = Engine::captureObjective($state)) !== null && $att['side'] === 'b') {   // 적 봇: 목표 칸을 점유한 아군을 우선 공격
            foreach ($cap['points'] as [$px, $py]) {
                if ($def['x'] === $px && $def['y'] === $py) {
                    $score += 40;
                }
            }
        }
        if ($this->cgOn($state, $att['side']) && ! empty($this->opts['cg_bonus'])) {
            $score += $this->cgThreatBonus($state, $att, $def) + $this->cgFocusBonus($state, $att, $def);   // 호위: 우리 지휘관에게 닿는 적을 우선 공격
        }
        if ($dmg >= $def['hp']) {
            $score += 1000;
            if ($def['kind'] === 'commander') {
                $score += 5000;
            }
        } elseif ($def['kind'] === 'commander') {
            $score += 30;
        }
        $at = $e->rules()->unitType($att['type']);
        $dt = $e->rules()->unitType($def['type']);
        if ($at['range_max'] === 1 && $dt['range_max'] === 1) {
            $moved = $att;
            $moved['x'] = $x;
            $moved['y'] = $y;
            $score -= 0.5 * $e->damage($state, $def, $def['x'], $def['y'], $moved, true);   // 반격은 정면 취급
        }
        $mt = $at['move_type'];
        $score += 0.2 * $e->rules()->terrainMod($e->terrainAt($state, $x, $y), $mt)['def_pct'];
        if ($this->opts['terrain_bonus'] > 0) {   // 옵션: 고지 점령/마을 후퇴 가산(소폭, 기본 off)
            $tr = $e->terrainAt($state, $x, $y);
            $score += $this->opts['terrain_bonus'] * (3 * $e->rules()->terrainAttr($tr, 'elevation') + ($e->rules()->terrainAttr($tr, 'heals') && $att['hp'] < $att['max_hp'] ? 5 : 0));
        }

        return $score;
    }

    /**
     * 총병(gunner) 카이팅: 이동 후 사격 불가라 이번 턴 이동 = 다음 턴 사격 위치 잡기. 사거리 밖이면 접근하되 적과 정확히 사거리(3)에 사선이 열린 칸을 선호하고,
     * 적이 1~2칸에 붙는 칸은 감점(근접일수록 크게), 사거리 3 + 사선 확보 칸은 가산. 동점은 현재 칸 유지 > 좌표순.
     */
    private function gunnerSteps(array $state, array $u, array $tiles): array
    {
        $e = $this->engine;
        $t = $e->rules()->unitType($u['type']);
        $foes = array_values(array_filter($state['units'], fn ($o) => $o['side'] !== $u['side']));
        if ($foes === []) {
            return [];
        }
        $best = null;
        foreach ($tiles as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            $nearest = 99;
            $shot = false;
            foreach ($foes as $o) {
                $d = Engine::dist($x, $y, $o['x'], $o['y']);
                $nearest = min($nearest, $d);
                if ($d >= $t['range_min'] && $d <= $t['range_max'] && $e->lineOfFire($state, $x, $y, $o['x'], $o['y'])) {
                    $shot = true;
                }
            }
            $score = $shot ? 10.0 : 0.0;
            if ($nearest < $t['range_min']) {
                $score -= ($t['range_min'] - $nearest) * 6;   // 1칸 -12, 2칸 -6
            } elseif ($nearest > $t['range_max']) {
                $score -= ($nearest - $t['range_max']) * 1.0;  // 멀수록 약한 접근 압력
            }
            $k = [$score, ($x === $u['x'] && $y === $u['y']) ? 1 : 0, -$x, -$y];
            if ($best === null || $k > $best[0]) {
                $best = [$k, $x, $y];
            }
        }
        if ($best === null || ($best[1] === $u['x'] && $best[2] === $u['y'])) {
            return [];
        }

        return [['type' => 'move', 'unit_id' => $u['id'], 'x' => $best[1], 'y' => $best[2]]];
    }

    private function approach(array $state, array $u, array $tiles): array
    {
        $e = $this->engine;
        if ($this->guards($u)) {
            return [];
        }
        if (($esc = $this->escortStep($state, $u, $tiles)) !== null) {
            return $esc;   // 지휘관 접근로 차단(commander_guard)
        }
        $tiles = $this->formationFilter($state, $u, $tiles);
        if (! $this->aggressive($state, $u)) {
            $tiles = $this->threatFilter($state, $u, $tiles);
        }
        if ($u['type'] === 'gunner' && ! empty($e->options()['gunner_rules'])) {
            return $this->gunnerSteps($state, $u, $tiles);
        }
        if ($this->opts['path_approach'] && ($pt = $this->pathTarget($state, $u, $tiles)) !== null) {
            return $pt[0] === $u['x'] && $pt[1] === $u['y'] ? [] : [['type' => 'move', 'unit_id' => $u['id'], 'x' => $pt[0], 'y' => $pt[1]]];
        }
        $goal = null;
        if ($e->rules()->unitType($u['type'])['heal'] > 0) {
            foreach ($state['units'] as $o) {
                if ($o['side'] === $u['side'] && $o['kind'] === 'commander') {
                    $goal = [$o['x'], $o['y']];
                }
            }
        }
        if ($goal === null) {
            $bd = 99;
            foreach ($state['units'] as $o) {
                if ($o['side'] !== $u['side']) {
                    $d = Engine::dist($u['x'], $u['y'], $o['x'], $o['y']);
                    if ($d < $bd) {
                        $bd = $d;
                        $goal = [$o['x'], $o['y']];
                    }
                }
            }
        }
        if ($goal === null) {
            return [];
        }
        $best = null;
        foreach ($tiles as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            $score = [Engine::dist($x, $y, $goal[0], $goal[1]), $x, $y];
            if ($best === null || $score < $best[0]) {
                $best = [$score, $x, $y];
            }
        }
        if ($best === null || ($best[1] === $u['x'] && $best[2] === $u['y'])) {
            return [];
        }

        return [['type' => 'move', 'unit_id' => $u['id'], 'x' => $best[1], 'y' => $best[2]]];
    }

    /**
     * 경로 거리 기반 접근 목표 타일. 목표 = 가장 가까운 적을 사거리 안에 두는 타일(치유사는 지휘관 인접).
     * 1차: 모든 유닛 점유를 장애물로, 도달 불가면 2차: 적 유닛만 장애물(아군은 통과 가능). 둘 다 불가면 null(맨해튼 폴백).
     *
     * @return array{0:int,1:int}|null
     */
    private function pathTarget(array $state, array $u, array $tiles): ?array
    {
        $e = $this->engine;
        $type = $e->rules()->unitType($u['type']);
        $targets = [];
        if ($type['heal'] > 0) {
            foreach ($state['units'] as $o) {
                if ($o['side'] === $u['side'] && $o['kind'] === 'commander') {
                    $targets[] = [$o, 1, 1];
                }
            }
        }
        if (! $targets) {
            foreach ($state['units'] as $o) {
                if ($o['side'] !== $u['side']) {
                    $targets[] = [$o, $type['range_min'], $type['range_max']];
                }
            }
        }
        $sources = [];
        $seen = [];
        foreach ($targets as [$o, $rmin, $rmax]) {
            for ($dx = -$rmax; $dx <= $rmax; $dx++) {
                for ($dy = -$rmax; $dy <= $rmax; $dy++) {
                    $d = abs($dx) + abs($dy);
                    $x = $o['x'] + $dx;
                    $y = $o['y'] + $dy;
                    if ($d < $rmin || $d > $rmax || isset($seen["$x,$y"]) || ! $e->passable($state, $type['move_type'], $x, $y)) {
                        continue;
                    }
                    $occ = $e->unitAt($state, $x, $y);
                    if ($occ !== null && $occ['id'] !== $u['id']) {
                        continue;
                    }
                    $seen["$x,$y"] = true;
                    $sources[] = [$x, $y];
                }
            }
        }
        if (! $sources) {
            return null;
        }
        foreach ([true, false] as $blockAllies) {
            $blocked = [];
            foreach ($state['units'] as $o) {
                if ($o['id'] !== $u['id'] && ($blockAllies || $o['side'] !== $u['side'])) {
                    $blocked["{$o['x']},{$o['y']}"] = true;
                }
            }
            $cost = $e->costToReach($state, $type['move_type'], $sources, $blocked);
            $best = null;
            foreach ($tiles as $key => $_) {
                if (! isset($cost[$key])) {
                    continue;
                }
                [$x, $y] = array_map('intval', explode(',', $key));
                $score = [$cost[$key], $this->nearestEnemyFrom($state, $u, $x, $y), $x, $y];
                if ($best === null || $score < $best[0]) {
                    $best = [$score, $x, $y];
                }
            }
            if ($best !== null) {
                return [$best[1], $best[2]];
            }
        }

        return null;
    }

    private function nearestEnemyFrom(array $state, array $u, int $x, int $y): int
    {
        $m = 99;
        foreach ($state['units'] as $o) {
            if ($o['side'] !== $u['side']) {
                $m = min($m, Engine::dist($x, $y, $o['x'], $o['y']));
            }
        }

        return $m;
    }

    /**
     * avoid_threat 컨텍스트: 아군 전열(커맨더 제외 다른 아군 진행도 중앙값)과 위험도 계산기.
     * risk(x,y) = 적이 다음 턴 이동+사거리로 닿아 줄 예상 피해 합(상성·오라 반영, guard 지휘관은 이동 없음).
     *
     * @return array{front:?int,dir:int,limit:float,risk:\Closure}|null
     */
    private function threatContext(array $state, array $u): ?array
    {
        $f = (float) $this->opts['avoid_threat'];
        if ($f <= 0) {
            return null;
        }
        $e = $this->engine;
        $enemyX = [];
        $ownX = [];
        $frontX = [];
        foreach ($state['units'] as $o) {
            if ($o['side'] !== $u['side']) {
                $enemyX[] = $o['x'];

                continue;
            }
            $ownX[] = $o['x'];
            if ($o['id'] !== $u['id'] && $o['kind'] !== 'commander') {
                $frontX[] = $o['x'];
            }
        }
        if (! $enemyX) {
            return null;
        }
        $dir = (array_sum($enemyX) / count($enemyX)) <=> (array_sum($ownX) / count($ownX));
        $front = null;
        if ($frontX && $dir !== 0) {
            $prog = array_map(fn ($x) => $dir * $x, $frontX);
            sort($prog);
            $front = $prog[intdiv(count($prog), 2)];
        }
        if ($dir !== 0 && $this->leashOn($state) && ($ld = $this->leashLeader($state, $u)) !== null) {
            $front = max($front ?? PHP_INT_MIN, $dir * $ld['x']);   // squad_leash: 영웅이 이미 선 전열선까지는 병사도 전열로 본다(영웅 뒤에서 교착 방지)
        }
        $foes = array_filter($state['units'], fn ($o) => $o['side'] !== $u['side']);
        $risk = function (int $x, int $y) use ($state, $u, $foes, $e) {
            $moved = $u;
            $moved['x'] = $x;
            $moved['y'] = $y;
            $sum = 0;
            foreach ($foes as $o) {
                $t = $e->rules()->unitType($o['type']);
                $still = $o['kind'] === 'commander' && $this->opts['commander_mode'] === 'guard' && ! $this->forceEngage && ! $this->opts['follow_front'];
                $reach = $t['range_max'] + ($still ? 0 : $o['move']);
                if (Engine::dist($x, $y, $o['x'], $o['y']) <= $reach) {
                    $sum += $e->damage($state, $o, $o['x'], $o['y'], $moved);
                }
            }

            return $sum;
        };

        return ['front' => $front, 'dir' => $dir, 'limit' => $f * $u['hp'], 'risk' => $risk];
    }

    /** 칸이 전열보다 앞서 위험 평가 대상인가(현재 위치는 항상 대상 아님) */
    private function threatAhead(array $ctx, array $u, int $x, int $y): bool
    {
        return $ctx['front'] !== null && ! ($x === $u['x'] && $y === $u['y']) && $ctx['dir'] * $x > $ctx['front'];
    }

    /** 접근 이동 후보에서 위험한 전열 초과 칸 제외(현재 위치는 항상 허용) */
    private function threatFilter(array $state, array $u, array $tiles): array
    {
        if (count($tiles) <= 1 || ($ctx = $this->threatContext($state, $u)) === null) {
            return $tiles;
        }
        $kept = [];
        foreach ($tiles as $key => $v) {
            [$x, $y] = array_map('intval', explode(',', $key));
            if (! $this->threatAhead($ctx, $u, $x, $y) || $ctx['risk']($x, $y) < $ctx['limit']) {
                $kept[$key] = $v;
            }
        }

        return $kept ?: $tiles;
    }

    /** 대열 유지: 접근 이동은 아군 전열(커맨더 제외 다른 아군 진행도 중앙값)보다 formation_lead 칸 넘게 앞서지 않는다(현재 위치는 항상 허용). */
    private function formationFilter(array $state, array $u, array $tiles): array
    {
        $n = (int) $this->opts['formation_lead'];
        if ($n <= 0) {
            return $tiles;
        }
        $enemyX = [];
        $ownX = [];
        $frontX = [];
        foreach ($state['units'] as $o) {
            if ($o['side'] !== $u['side']) {
                $enemyX[] = $o['x'];

                continue;
            }
            $ownX[] = $o['x'];
            if ($o['id'] !== $u['id'] && $o['kind'] !== 'commander') {
                $frontX[] = $o['x'];
            }
        }
        if (! $enemyX || ! $frontX) {
            return $tiles;
        }
        $dir = (array_sum($enemyX) / count($enemyX)) <=> (array_sum($ownX) / count($ownX));
        if ($dir === 0) {
            return $tiles;
        }
        $prog = array_map(fn ($x) => $dir * $x, $frontX);
        sort($prog);
        $cap = max($prog[intdiv(count($prog), 2)] + $n, $dir * $u['x']);

        return array_filter($tiles, fn ($_, $key) => $dir * (int) explode(',', $key)[0] <= $cap, ARRAY_FILTER_USE_BOTH);
    }

    // ---- commander_guard: 지휘관 보호 AI (opts.commander_guard, state.commander_guard_off 로 스테이지 단위 해제) ----

    /** 보호 AI 적용 진영: 컴퓨터 적(b)만. 플레이어 측(a: 아군 NPC 봇·시뮬레이션의 플레이어 대역)의 행동은 바꾸지 않는다 */
    private function cgOn(array $state, string $side = 'b'): bool
    {
        return $side === 'b' && ! empty($this->opts['commander_guard']) && empty($state['commander_guard_off']);
    }

    /** 허용 위협(예상 피해 합): 평시 commander_guard_risk(기본 0.8) x 현재 HP = 사실상 치명적일 때만 회피, HP 40% 미만이면 cg_low_risk(기본 0.3) x HP */
    private function cgAllowed(array $u): float
    {
        return ($u['hp'] < 0.4 * $u['max_hp'] ? (float) $this->opts['cg_low_risk'] : (float) $this->opts['commander_guard_risk']) * $u['hp'];
    }

    /** (x,y)에 섰을 때 다음 적 턴에 이동+사거리로 닿는 상대 진영 유닛들의 예상 피해 합(지형 차단은 무시한 보수적 추정) */
    private function commanderRisk(array $state, array $u, int $x, int $y): int
    {
        $moved = $u;
        $moved['x'] = $x;
        $moved['y'] = $y;
        $sum = 0;
        foreach ($state['units'] as $o) {
            if ($o['side'] === $u['side'] || $o['hp'] <= 0) {
                continue;
            }
            $t = $this->engine->rules()->unitType($o['type']);
            if (Engine::dist($x, $y, $o['x'], $o['y']) <= $t['range_max'] + $o['move']) {
                $sum += $this->engine->damage($state, $o, $o['x'], $o['y'], $moved);
            }
        }

        return $sum;
    }

    /** (x,y) 주변 2칸 안 아군 비지휘관 유닛 수(엄호 정도) */
    private function cgScreen(array $state, array $u, int $x, int $y): int
    {
        $n = 0;
        foreach ($state['units'] as $o) {
            if ($o['side'] === $u['side'] && $o['id'] !== $u['id'] && $o['kind'] !== 'commander' && Engine::dist($x, $y, $o['x'], $o['y']) <= 2) {
                $n++;
            }
        }

        return $n;
    }

    /** 위협 범위 안 지휘관의 후퇴: 위협 최소 > 엄호 많음 > 적에게서 멂 순. 이동 후 안전하면(허용 위협 이하) 또는 처치 가능하면 사거리 내 적 공격 */
    private function cgRetreat(array &$work, array $u, float $allowed, int $riskHere): array
    {
        $best = null;
        foreach ($this->engine->reachable($work, $u['id']) as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            if ($x === $u['x'] && $y === $u['y']) {
                continue;
            }
            $risk = $this->commanderRisk($work, $u, $x, $y);
            if ($risk >= $riskHere || $this->cgScreen($work, $u, $x, $y) < 1) {
                continue;   // 지금보다 위협이 줄고 주변 2칸에 아군이 있는 칸으로만 물러난다(홀로 구석으로 도주 금지)
            }
            $k = [-$risk, min(3, $this->cgScreen($work, $u, $x, $y)), $this->nearestEnemyFrom($work, $u, $x, $y), -$x, -$y];
            if ($best === null || $k > $best[0]) {
                $best = [$k, $x, $y, $risk];
            }
        }
        if ($best === null) {
            return [];
        }
        [, $bx, $by, $brisk] = $best;
        $steps = [['type' => 'move', 'unit_id' => $u['id'], 'x' => $bx, 'y' => $by]];
        $tg = $this->engine->targetsFrom($work, $u, $bx, $by);
        if ($tg !== []) {
            $kill = fn ($t) => $this->engine->damage($work, $u, $bx, $by, $work['units'][$t]) >= $work['units'][$t]['hp'];
            usort($tg, fn ($a, $b) => [(int) $kill($b), $work['units'][$a]['hp'], $a] <=> [(int) $kill($a), $work['units'][$b]['hp'], $b]);
            if ($brisk <= $allowed || $kill($tg[0])) {
                $steps[] = ['type' => 'attack', 'unit_id' => $u['id'], 'target_id' => $tg[0]];
            }
        }

        return $steps;
    }

    /** 적(b) 비지휘관·비치유 유닛이 HP 충분하면 위협 회피(맴돌기) 없이 전진. 지휘관·아군(a) 봇은 영향 없음(opts.enemy_aggr) */
    private function aggressive(array $state, array $u): bool
    {
        return ! empty($this->opts['enemy_aggr']) && $u['side'] === 'b' && $u['kind'] !== 'commander' && ! $this->isHealer($u)
            && $u['hp'] >= (float) $this->opts['enemy_aggr_hp'] * $u['max_hp'];
    }

    /** 공격자 쪽 지휘관 반경 cg_focus_r 안에 들어온 대상 추가 가산(지휘관 위협 집중 공격, 0=off) */
    private function cgFocusBonus(array $state, array $att, array $def): float
    {
        $r = (int) $this->opts['cg_focus_r'];
        if ($r <= 0 || $att['kind'] === 'commander') {
            return 0.0;
        }
        foreach ($state['units'] as $c) {
            if ($c['side'] === $att['side'] && $c['kind'] === 'commander' && $c['hp'] > 0) {
                return Engine::dist($c['x'], $c['y'], $def['x'], $def['y']) <= $r ? (float) $this->opts['cg_focus_bonus'] : 0.0;
            }
        }

        return 0.0;
    }

    /** 공격자 쪽 지휘관에게 닿을 수 있는 대상이면 점수 가산(호위 유닛이 위협 제거 우선) */
    private function cgThreatBonus(array $state, array $att, array $def): float
    {
        if ($att['kind'] === 'commander') {
            return 0.0;
        }
        foreach ($state['units'] as $c) {
            if ($c['side'] === $att['side'] && $c['kind'] === 'commander' && $c['hp'] > 0) {
                $t = $this->engine->rules()->unitType($def['type']);

                return Engine::dist($c['x'], $c['y'], $def['x'], $def['y']) <= $t['range_max'] + $def['move'] ? 40.0 : 0.0;
            }
        }

        return 0.0;
    }

    /**
     * 호위: 지휘관에게 닿을 수 있는 적이 접근 중(적의 이동+사거리+2 안)이고 이 유닛이 지휘관 6칸 안이면, 공격할 대상이 없을 때
     * 지휘관에서 가장 가까운 적 쪽 2칸 지점으로 이동해 접근로를 막는다. 해당 없으면 null(기존 접근).
     */
    private function escortStep(array $state, array $u, array $tiles): ?array
    {
        if (! $this->cgOn($state, $u['side']) || empty($this->opts['cg_escort']) || $u['kind'] === 'commander' || $this->isHealer($u)) {
            return null;
        }
        $c = null;
        foreach ($state['units'] as $o) {
            if ($o['side'] === $u['side'] && $o['kind'] === 'commander' && $o['hp'] > 0) {
                $c = $o;
            }
        }
        if ($c === null || Engine::dist($u['x'], $u['y'], $c['x'], $c['y']) > 6) {
            return null;
        }
        $near = [];
        foreach ($state['units'] as $o) {
            if ($o['side'] === $u['side'] && $o['kind'] !== 'commander' && $o['hp'] > 0 && ! $this->isHealer($o)) {
                $near[] = [Engine::dist($o['x'], $o['y'], $c['x'], $c['y']), $o['id']];
            }
        }
        sort($near);
        if (! in_array($u['id'], array_column(array_slice($near, 0, (int) $this->opts['cg_escort_n']), 1), true)) {
            return null;   // 호위는 지휘관에 가장 가까운 cg_escort_n(기본 2)기만(나머지는 기존 교전)
        }
        $foe = null;
        foreach ($state['units'] as $o) {
            if ($o['side'] === $u['side'] || $o['hp'] <= 0) {
                continue;
            }
            $d = Engine::dist($c['x'], $c['y'], $o['x'], $o['y']);
            $t = $this->engine->rules()->unitType($o['type']);
            if ($d <= $t['range_max'] + $o['move'] + 2 && ($foe === null || [$d, $o['id']] < $foe[0])) {
                $foe = [[$d, $o['id']], $o];
            }
        }
        if ($foe === null) {
            return null;
        }
        if ($c['hp'] >= (float) $this->opts['cg_escort_hp'] * $c['max_hp']) {
            return null;   // 지휘관이 다친(HP cg_escort_hp 비율 미만) 뒤에만 호위(초반 지휘관 차단으로 교착·클리어 불가가 되는 것을 방지)
        }
        if (Engine::dist($u['x'], $u['y'], $foe[1]['x'], $foe[1]['y']) <= Engine::dist($c['x'], $c['y'], $foe[1]['x'], $foe[1]['y'])) {
            return null;   // 이미 지휘관보다 적에 가까운(앞선) 유닛은 기존 교전 유지 -> 호위는 지휘관 뒤쪽 유닛만 앞으로 끌어올린다
        }
        $dx = $foe[1]['x'] - $c['x'];
        $dy = $foe[1]['y'] - $c['y'];
        $mx = min(2, abs($dx));
        $my = min(2 - $mx, abs($dy));
        $p = [$c['x'] + ($dx <=> 0) * $mx, $c['y'] + ($dy <=> 0) * $my];
        $cur = Engine::dist($u['x'], $u['y'], $p[0], $p[1]);
        $best = null;
        foreach ($tiles as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            $k = [Engine::dist($x, $y, $p[0], $p[1]), $x, $y];
            if ($best === null || $k < $best[0]) {
                $best = [$k, $x, $y];
            }
        }
        if ($best === null || $best[0][0] >= $cur) {
            return null;   // 더 가까워지지 못하면 기존 접근 로직
        }

        return [['type' => 'move', 'unit_id' => $u['id'], 'x' => $best[1], 'y' => $best[2]]];
    }
}
