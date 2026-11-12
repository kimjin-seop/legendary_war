<?php

namespace App\Game;

/**
 * 아군 NPC 경로 이동 AI (stages.rules.ally_npcs[].route, docs/CUTSCENE_SPEC.md 11절).
 *  route = {"waypoints":[[x,y]..1~8], "from_turn"?:1~99(기본 1), "move_cap"?:1~12(턴당 이동 비용 상한, 기본 = 유닛 이동력)}
 * route 가 있는 NPC 는 휴리스틱 봇 대신 이 AI 로만 움직인다(공격·대기 없음): 아군 턴 시작(allyPhase)마다 다음 웨이포인트까지의 최단 비용(costToReach)이 가장 작아지는
 * 도달 가능 칸으로 1회 이동하고, 웨이포인트에 서면 다음 웨이포인트로 넘어간다. 마지막 웨이포인트에 닿으면 그 자리에 머문다.
 * 다른 유닛에 막혀 우회 경로가 없으면 유닛을 무시한 거리 기준으로 가장 가까워지는 도달 가능 칸까지 접근하고, 그래도 가까워질 수 없으면 제자리. 연출 move cue 로 옮겨진 턴(moved=true)은 건너뛴다. route 가 없는 NPC·적은 영향 없음.
 */
final class RouteAi
{
    /** @return array{waypoints:array<int,array{0:int,1:int}>,from_turn:int,move_cap:?int}|null */
    public static function normalize(mixed $r): ?array
    {
        if (! is_array($r) || ! is_array($r['waypoints'] ?? null)) {
            return null;
        }
        $wps = [];
        foreach (array_slice(array_values($r['waypoints']), 0, 8) as $p) {
            if (is_array($p) && count($p) === 2 && is_int($p[0] ?? null) && is_int($p[1] ?? null) && $p[0] >= 0 && $p[1] >= 0) {
                $wps[] = [$p[0], $p[1]];
            }
        }
        $ft = $r['from_turn'] ?? 1;
        $mc = $r['move_cap'] ?? null;
        if ($wps === [] || ! is_int($ft) || $ft < 1 || $ft > 99 || ($mc !== null && ! (is_int($mc) && $mc >= 1 && $mc <= 12))) {
            return null;
        }

        return ['waypoints' => $wps, 'from_turn' => $ft, 'move_cap' => $mc];
    }

    /** 이번 턴 이 NPC 의 이동 행동(없으면 null). 웨이포인트 진행 인덱스(route.i)는 state 에 기록한다 */
    public static function step(Engine $engine, array &$state, string $id): ?array
    {
        $u = $state['units'][$id] ?? null;
        if ($u === null || $u['hp'] <= 0 || empty($u['route']) || (int) $state['turn'] < $u['route']['from_turn']) {
            return null;
        }
        $wps = $u['route']['waypoints'];
        $i = (int) ($u['route']['i'] ?? 0);
        while ($i < count($wps) && $wps[$i] === [$u['x'], $u['y']]) {
            $i++;
        }
        $state['units'][$id]['route']['i'] = $i;
        if ($i >= count($wps)) {
            return null;
        }
        $moveType = $engine->rules()->unitType($u['type'])['move_type'];
        $blocked = [];
        foreach ($state['units'] as $o) {
            $o['id'] !== $id && ($o['x'] !== $wps[$i][0] || $o['y'] !== $wps[$i][1]) && $blocked["{$o['x']},{$o['y']}"] = true;
        }
        $cap = $u['route']['move_cap'] ?? null;
        $reach = $engine->reachable($state, $id);
        ksort($reach);
        $here = "{$u['x']},{$u['y']}";
        // 1차: 다른 유닛을 장애물로 본 최단 경로. 우회 불가(협로 점유 등)로 막히면 2차: 유닛을 무시한 거리장으로 가장 가까운 도달 가능 칸까지만 접근(제자리 영구 정지 방지)
        $free = $engine->costToReach($state, $moveType, [$wps[$i]], []);   // 유닛을 무시한 거리장: 어느 단계에서도 이 기준으로 멀어지거나 제자리 높이인 칸으로는 가지 않는다(혼잡 시 왕복 방지)
        // move_cap 은 평소 속도 조절용. 상한 안에서 전진할 칸이 없으면(아군 NPC·플레이어 유닛 통과 비용 때문에 한 칸 너머로 못 나가는 협로 등) 상한을 풀고 실제 이동력까지 재시도해 영구 정지를 막는다
        foreach ($cap !== null ? [$cap, null] : [null] as $limit) {
            foreach ([$blocked, []] as $block) {
                $field = $block === [] ? $free : $engine->costToReach($state, $moveType, [$wps[$i]], $block);
                $cur = $field[$here] ?? null;
                if ($cur === null) {
                    continue;
                }
                $best = null;
                $bestCost = $cur;
                foreach ($reach as $key => $spent) {
                    if (($limit !== null && $spent > $limit) || ! isset($field[$key]) || $key === $here || ! isset($free[$key], $free[$here]) || $free[$key] >= $free[$here]) {
                        continue;
                    }
                    if ($field[$key] < $bestCost || ($field[$key] === $bestCost && $best !== null && $spent < $reach[$best])) {
                        $best = $key;
                        $bestCost = $field[$key];
                    }
                }
                if ($best !== null) {
                    break 2;
                }
            }
        }
        if (! isset($best)) {
            return null;
        }
        [$x, $y] = array_map('intval', explode(',', $best));

        return ['type' => 'move', 'unit_id' => $id, 'x' => $x, 'y' => $y];
    }

    /** route 영웅의 동반 병사(leader_id=route 영웅, 병사 자신은 route 없음)인가 */
    public static function followsRouteLeader(array $state, array $u): bool
    {
        $l = $state['units'][$u['leader_id'] ?? ''] ?? null;

        return $l !== null && ($u['kind'] ?? null) === 'troop' && empty($u['route']) && ! empty($l['route']) && $l['hp'] > 0;
    }

    /**
     * route 영웅의 동반 병사 이동: 영웅과 맨해튼 거리가 2 이내면 제자리(전열로 나가 흩어지지 않음), 벗어나면 영웅에 가장 가까운 도달 가능 칸(거리 1 우선, 동률은 이동 비용 적은 칸)으로 1회 이동.
     * 영웅이 멈춰 있으면(from_turn 전·도착 후) 병사도 영웅 곁에 머문다. 이동할 필요가 없으면 null.
     */
    public static function followStep(Engine $engine, array $state, string $id): ?array
    {
        $u = $state['units'][$id] ?? null;
        $l = $u !== null ? ($state['units'][$u['leader_id'] ?? ''] ?? null) : null;
        if ($u === null || $l === null || $u['hp'] <= 0 || Engine::dist($u['x'], $u['y'], $l['x'], $l['y']) <= 2) {
            return null;
        }
        $best = null;
        foreach ($engine->reachable($state, $id) as $key => $cost) {
            [$x, $y] = array_map('intval', explode(',', $key));
            $d = Engine::dist($x, $y, $l['x'], $l['y']);
            if ($d < 1 || ($x === $u['x'] && $y === $u['y'])) {
                continue;
            }
            $k = [$d, $cost, $x, $y];   // 영웅에 가장 가까운 칸(거리 1 우선), 동률이면 이동 비용이 적은 칸
            if ($best === null || $k < $best[0]) {
                $best = [$k, $x, $y];
            }
        }
        if ($best === null || Engine::dist($best[1], $best[2], $l['x'], $l['y']) >= Engine::dist($u['x'], $u['y'], $l['x'], $l['y'])) {
            return null;
        }

        return ['type' => 'move', 'unit_id' => $id, 'x' => $best[1], 'y' => $best[2]];
    }
}
