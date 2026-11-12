import { TERRAINS, terrainMod, unitType } from '../data/rules.js';

// 순수 그리드 모듈(서버 Engine::reachable 과 같은 규칙): 지형 비용은 병종 이동 타입별, 모든 유닛(아군 포함) 점유 타일은 통과 불가.
// 표시용이며 서버 GET /battles/{id}/units/{unit}/moves 결과가 있으면 그쪽을 우선한다.
const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const keyOf = (x, y) => `${x},${y}`;
export const dist = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
export const inBounds = (map, x, y) => x >= 0 && y >= 0 && x < map.w && y < map.h;
export const terrainCode = (map, x, y) => map.tiles[y]?.[x] ?? 'plain';
export const terrainAt = (map, x, y) => ({ key: terrainCode(map, x, y), ...(TERRAINS[terrainCode(map, x, y)] ?? TERRAINS.plain) });
export const moveTypeOf = (u) => unitType(u.type).move_type;
export const rangeOf = (u) => { const t = unitType(u.type); return { rmin: t.range_min, rmax: t.range_max }; };
export const unitAt = (units, x, y) => units.find((u) => u.hp > 0 && u.x === x && u.y === y);

// 아군 통과(서버 Engine opts ally_passthrough_cost, 기본 2): 아군 유닛 칸은 진입 비용 +N 으로 지나갈 수 있고 그 칸에 멈추지는 못한다. 적 칸은 통과 불가. 0 = 모든 유닛 칸 통과 불가(이전 규칙)
let ALLY_PASS_COST = 2;
export function setAllyPassCost(n) { const v = Number(n); if (Number.isFinite(v) && v >= 0) ALLY_PASS_COST = Math.floor(v); }
export const allyPassCost = () => ALLY_PASS_COST; // 연출 보행(fx/CueActors)의 같은 편 통과 판정(전투 규칙과 동일)
// 이동 가능 타일: Map "x,y" -> {x,y,cost,prev,pass?}. 현재 위치(비용 0) 포함. pass=true = 아군이 있어 지나가기만 하는 칸(경로 복원용으로 남김, 정지 후보는 호출 측이 점유 칸을 거른다)
export function reachable(map, units, unit, maxMove = unit.move) {
    const mt = moveTypeOf(unit);
    const res = new Map();
    const start = { x: unit.x, y: unit.y, cost: 0, prev: null };
    res.set(keyOf(unit.x, unit.y), start);
    const open = [start];
    while (open.length) {
        open.sort((a, b) => a.cost - b.cost);
        const cur = open.shift();
        if (cur.cost > (res.get(keyOf(cur.x, cur.y))?.cost ?? Infinity)) continue;
        for (const [dx, dy] of DIRS) {
            const nx = cur.x + dx;
            const ny = cur.y + dy;
            if (!inBounds(map, nx, ny)) continue;
            const { cost } = terrainMod(terrainCode(map, nx, ny), mt);
            if (cost === null) continue;
            const occ = unitAt(units, nx, ny);
            const ally = occ && occ.id !== unit.id && occ.side != null && occ.side === unit.side;
            if (occ && occ.id !== unit.id && (!ally || ALLY_PASS_COST <= 0)) continue; // 적 칸(또는 통과 규칙 off)은 막힘
            const nc = cur.cost + cost + (ally ? ALLY_PASS_COST : 0);
            if (nc > maxMove || nc >= (res.get(keyOf(nx, ny))?.cost ?? Infinity)) continue;
            const node = { x: nx, y: ny, cost: nc, prev: cur, pass: !!ally };
            res.set(keyOf(nx, ny), node);
            open.push(node);
        }
    }
    return res;
}

// 서버 moves 응답 [{x,y,cost}] 을 reachable 과 같은 Map 으로(경로 복원을 위해 인접 역추적)
// local(선택): 같은 규칙의 로컬 reachable 결과. 서버 tiles 는 아군 통과 칸(정지 불가)을 빼고 주므로, 인접한 서버 칸으로 경로가 이어지지 않으면 로컬 경로로 잇는다
export function fromServerTiles(tiles, unit, local = null) {
    const res = new Map();
    tiles.forEach((t) => res.set(keyOf(t.x, t.y), { x: t.x, y: t.y, cost: t.cost, prev: null }));
    const start = res.get(keyOf(unit.x, unit.y)) ?? { x: unit.x, y: unit.y, cost: 0, prev: null };
    res.set(keyOf(unit.x, unit.y), start);
    [...res.values()].sort((a, b) => a.cost - b.cost).forEach((n) => {
        if (n === start) return;
        let best = null;
        for (const [dx, dy] of DIRS) {
            const p = res.get(keyOf(n.x + dx, n.y + dy));
            if (p && p.cost < n.cost && (!best || p.cost < best.cost)) best = p;
        }
        if (!best && local?.get(keyOf(n.x, n.y))?.prev) { n.prev = local.get(keyOf(n.x, n.y)).prev; return; } // 아군 칸을 지나는 경로(서버 목록에 없는 중간 칸)
        n.prev = best ?? start;
    });
    return res;
}

// 시작 칸 제외 경로
export function pathTo(reach, x, y) {
    const out = [];
    let n = reach.get(keyOf(x, y));
    while (n && n.prev) { out.unshift({ x: n.x, y: n.y }); n = n.prev; }
    return out;
}

// 서버 move 이벤트(from/to만 있음)의 연출 경로: 이동 한도 없이 탐색해 복원, 실패 시 직선 1단계
export function pathBetween(map, units, unit, from, to) {
    const reach = reachable(map, units.filter((u) => u.id !== unit.id), { ...unit, x: from[0], y: from[1] }, 99);
    const p = pathTo(reach, to[0], to[1]);
    return p.length ? p : [{ x: to[0], y: to[1] }];
}

// 거리 기반 공격 범위(맨해튼 거리 min~max)
// 총병 사선(LOS): 두 칸 중심을 잇는 선분이 지나는 중간 칸(양 끝 제외) 중 지형 blocks_line_of_fire 칸이 있으면 false. 선분이 칸 경계·꼭짓점을 정확히 지나면
// 맞닿은 칸 하나라도 막으면 막힘. 유닛은 막지 않는다. 서버 Engine::lineOfFire 사본(칸 중심=(2x+1,2y+1), 칸=[2x,2x+2] 정수 연산)
export function lineOfFire(map, x0, y0, x1, y1, blocks) {
    const px = 2 * x0 + 1; const py = 2 * y0 + 1; const dx = 2 * (x1 - x0); const dy = 2 * (y1 - y0);
    for (let cy = Math.min(y0, y1); cy <= Math.max(y0, y1); cy++) {
        for (let cx = Math.min(x0, x1); cx <= Math.max(x0, x1); cx++) {
            if ((cx === x0 && cy === y0) || (cx === x1 && cy === y1)) continue;
            let pos = 0; let neg = 0;
            [[2 * cx, 2 * cy], [2 * cx + 2, 2 * cy], [2 * cx, 2 * cy + 2], [2 * cx + 2, 2 * cy + 2]].forEach(([qx, qy]) => { const cr = dx * (qy - py) - dy * (qx - px); if (cr > 0) pos++; if (cr < 0) neg++; });
            if (pos < 4 && neg < 4 && blocks(map.tiles?.[cy]?.[cx])) return false;
        }
    }
    return true;
}

export function attackTiles(map, x, y, rmin, rmax) {
    const out = [];
    for (let ty = 0; ty < map.h; ty++) {
        for (let tx = 0; tx < map.w; tx++) {
            const d = Math.abs(tx - x) + Math.abs(ty - y);
            if (d >= rmin && d <= rmax) out.push({ x: tx, y: ty });
        }
    }
    return out;
}
