<?php

namespace App\Game;

/**
 * 서브 목표(stages.rules.sub_objectives, docs/CUTSCENE_SPEC.md 9절). 승패와 무관한 보너스 판정(별점 star_conditions {type:"sub_objective", id} 와 연동).
 *  - unit_survive {unit: 참조(EventConditions 유닛 참조)}: 대상이 격파되면 즉시 실패, 전투 종료 시 격파되지 않았으면 달성(퇴각은 생존으로 본다)
 *  - hold_zone {tiles:[[x,y]..<=20], turns:1..30}: 라운드가 바뀔 때마다 아군(side a, NPC 포함) 유닛이 tiles 중 한 칸에 서 있으면 연속 보유 카운트 +1(비면 0), turns 도달 시 달성(확정)
 *  - protect_tiles {tiles:[[x,y]..<=20], max_breach:0..20(기본 0), turns?:1..30}: 적(side b) 유닛이 tiles 중 한 칸에 서면 그 칸을 "침범"으로 1회 기록(칸당 1회), 침범 칸 수가 max_breach 를 넘으면 즉시 실패. turns 가 있으면 라운드 turns 도달 시 달성 확정, 없으면 전투 종료 시 실패하지 않았으면 달성
 * 공통: id [a-z0-9_]{1,32}(유일), label(표시용, 40자 이하), 최대 6개. 잘못된 항목은 조용히 버린다(Cues 와 동일).
 * state.sub_objectives[id] = {type,...,status:pending|met|failed,progress,last_turn}. 설정이 없으면 전투 state 불변.
 */
final class SubObjectives
{
    public static function initialize(array &$state, mixed $raw): void
    {
        $out = [];
        foreach (is_array($raw) ? array_slice(array_values($raw), 0, 6) : [] as $s) {
            if (! is_array($s) || ! is_string($s['id'] ?? null) || ! preg_match('/^[a-z0-9_]{1,32}$/', $s['id']) || isset($out[$s['id']])) {
                continue;
            }
            $e = ['type' => $s['type'] ?? null, 'label' => is_string($s['label'] ?? null) ? mb_substr($s['label'], 0, 40) : null, 'status' => 'pending', 'progress' => 0, 'last_turn' => 0];
            if ($e['type'] === 'unit_survive' && is_string($s['unit'] ?? null) && $s['unit'] !== '' && strlen($s['unit']) <= 40) {
                $e['unit'] = $s['unit'];
            } elseif ($e['type'] === 'hold_zone' && is_int($s['turns'] ?? null) && $s['turns'] >= 1 && $s['turns'] <= 30) {
                $tiles = [];
                foreach (is_array($s['tiles'] ?? null) ? array_slice($s['tiles'], 0, 20) : [] as $t) {
                    is_array($t) && count($t) === 2 && is_int($t[0] ?? null) && is_int($t[1] ?? null) && $tiles[] = [$t[0], $t[1]];
                }
                if ($tiles === []) {
                    continue;
                }
                $e += ['tiles' => $tiles, 'turns' => $s['turns']];
            } elseif ($e['type'] === 'protect_tiles') {
                $tiles = [];
                foreach (is_array($s['tiles'] ?? null) ? array_slice($s['tiles'], 0, 20) : [] as $t) {
                    is_array($t) && count($t) === 2 && is_int($t[0] ?? null) && is_int($t[1] ?? null) && $tiles[] = [$t[0], $t[1]];
                }
                $mb = $s['max_breach'] ?? 0;
                $tn = $s['turns'] ?? null;
                if ($tiles === [] || ! is_int($mb) || $mb < 0 || $mb > 20 || ($tn !== null && (! is_int($tn) || $tn < 1 || $tn > 30))) {
                    continue;
                }
                $e += ['tiles' => $tiles, 'max_breach' => $mb, 'breached' => []] + ($tn !== null ? ['turns' => $tn] : []);
            } else {
                continue;
            }
            $out[$s['id']] = $e;
        }
        $out !== [] && $state['sub_objectives'] = $out;
    }

    /** 행동 후 갱신(라운드가 바뀐 첫 시점에 hold_zone 카운트, 대상 격파 시 unit_survive 실패). sub_objectives 가 없으면 무동작 */
    public static function tick(array &$state): void
    {
        if (empty($state['sub_objectives']) || ($state['status'] ?? 'active') !== 'active') {
            return;
        }
        $turn = (int) $state['turn'];
        foreach ($state['sub_objectives'] as &$s) {
            if ($s['status'] !== 'pending') {
                continue;
            }
            if ($s['type'] === 'protect_tiles') {
                foreach ($state['units'] as $u) {
                    if ($u['side'] === 'b' && $u['hp'] > 0 && in_array([$u['x'], $u['y']], $s['tiles'], true) && ! in_array([$u['x'], $u['y']], $s['breached'], true)) {
                        $s['breached'][] = [$u['x'], $u['y']];
                    }
                }
                $s['progress'] = count($s['breached']);
                if ($s['progress'] > $s['max_breach']) {
                    $s['status'] = 'failed';
                } elseif (isset($s['turns']) && $turn >= $s['turns']) {
                    $s['status'] = 'met';
                }
            } elseif ($s['type'] === 'unit_survive' && self::gone($state, $s['unit'])) {
                $s['status'] = 'failed';
            } elseif ($s['type'] === 'hold_zone' && $turn > $s['last_turn']) {
                $s['last_turn'] = $turn;
                $on = false;
                foreach ($state['units'] as $u) {
                    if ($u['side'] === 'a' && $u['hp'] > 0 && in_array([$u['x'], $u['y']], $s['tiles'], true)) {
                        $on = true;
                        break;
                    }
                }
                $s['progress'] = $on ? $s['progress'] + 1 : 0;
                $s['progress'] >= $s['turns'] && $s['status'] = 'met';
            }
        }
        unset($s);
    }

    /** 별점 등 판정용: unit_survive 는 pending 이어도 격파되지 않았으면 달성으로 본다(전투 종료 후 호출 전제) */
    public static function met(array $state, string $id): bool
    {
        $s = $state['sub_objectives'][$id] ?? null;
        if ($s === null || $s['status'] === 'failed') {
            return false;
        }

        return $s['status'] === 'met' || ($s['type'] === 'unit_survive' && ! self::gone($state, $s['unit'])) || $s['type'] === 'protect_tiles';
    }

    /** 뷰: [{id,label,type,status,progress,target}] (없으면 []). 진행 중에는 pending/met/failed 그대로, 종료 후에는 최종 판정 */
    public static function view(array $state): array
    {
        $out = [];
        $done = ($state['status'] ?? 'active') === 'finished';
        foreach ($state['sub_objectives'] ?? [] as $id => $s) {
            $out[] = ['id' => $id, 'label' => $s['label'], 'type' => $s['type'], 'status' => $done ? (($state['winner'] ?? null) === 'a' ? (self::met($state, $id) ? 'met' : 'failed') : ($s['status'] === 'met' ? 'met' : 'failed')) : $s['status'], 'progress' => $s['progress'], 'target' => $s['turns'] ?? null];
        }

        return $out;
    }

    private static function gone(array $state, string $ref): bool
    {
        foreach ($state['defeated'] ?? [] as $id => $d) {   // Engine::resolveDeath 가 sub_objectives 가 있는 전투에서 기록
            if (EventConditions::matchesRef((string) $id, $d, $ref)) {
                return true;
            }
        }

        return false;
    }
}
