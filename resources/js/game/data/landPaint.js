// 육상 이웃 규칙 배치(안아트 docker/gemini/land_paint_proposed.py 이식, 순수 함수 -> node 검증 가능).
// tile_layer(index_map) 가 없는 맵에서만 u32ComposeWithBuildings 가 호출한다(tile_layer 가 있으면 그 값 우선). 서버 지형 판정은 바꾸지 않는다.
// 규칙: plain = grass a55/b25/c10/d10 해시 / forest = blob47(8방 내부 255 면 forest_a~c, 0 이면 forest_sparse_a/b) / mountain = mount47(0 이면 mountain_a~d·눈 바이옴 snow, 255 면 mount_full)
//       cliff = rock47(mountain 과 이어짐) / road = 1칸폭 road16(길·다리 연결), 2x2 이상 dirt47 / castle = pave(slab/slab_b/brick), 성벽 줄 사이 castle = gate
//       wall = 위아래+좌우 꺾임 tower_a, 위아래만 wall_top_v, 그 외 wall_face_a/b / village = 직사각 군집(2x2 이상) 지붕·벽·문 조립, 그 외 house_giwa/thatch
//       물·여울·다리·sand·hill(water_set 레시피)·늪 등 그 외 지형은 기존 레시피 그대로
import { U32_EXT3, U32_SYMBOL } from './unityTileset.js';
import { LS_FRAMES } from './landSetNames.js';

const BITS = { N: 1, NE: 2, E: 4, SE: 8, S: 16, SW: 32, W: 64, NW: 128 };
const D8 = { N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1] };
const red = (m0) => { let m = m0; [['NE', 'N', 'E'], ['SE', 'S', 'E'], ['SW', 'S', 'W'], ['NW', 'N', 'W']].forEach(([d, a, b]) => { if (!((m & BITS[a]) && (m & BITS[b]))) m &= ~BITS[d]; }); return m; };
// 안아트 미리보기와 같은 해시(파이썬 정수 연산의 하위 32비트와 동일)
export function lsHash(x, y, s = 0) {
    let v = ((x * 73856093) ^ (y * 19349663) ^ (s * 83492791)) >>> 0;
    v = Math.imul(v, 2654435761 | 0) >>> 0;
    return (v >>> 8) / 16777216;
}
export const lsIndex = (name) => (LS_FRAMES[name] != null ? U32_EXT3.start + LS_FRAMES[name] : null);
const SYM = Object.fromEntries(Object.entries(U32_SYMBOL).map(([k, v]) => [v, k])); // 코드 -> 기호
const symOf = (c) => (c == null ? null : typeof c === 'string' && c.length === 1 ? c : SYM[c] ?? c);

// comp = u32Compose 결과({cols, rows, cells}). 규칙이 있는 칸의 idx 를 land_set 인덱스로 덮어쓴다(rot/tint/wash 초기화). 반환: 덮어쓴 칸 수
export function lsPaint(map, comp) {
    if (!U32_EXT3.enabled) return 0;
    const { cols: W, rows: H } = comp;
    const at = (x, y) => (x >= 0 && x < W && y >= 0 && y < H ? symOf(comp.cells[y * W + x].code) : null);
    const N = (n) => lsIndex(n);
    let n = 0;
    const put = (x, y, idx) => { if (idx == null) return; const c = comp.cells[y * W + x]; c.idx = idx; c.rot = 0; c.tint = null; c.wash = null; c.land = true; n += 1; };
    const maskOf = (x, y, pred) => red(Object.entries(BITS).reduce((s, [d, b]) => s + (pred(at(x + D8[d][0], y + D8[d][1])) ? b : 0), 0));
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const c = at(x, y);
            const h = (s) => lsHash(x, y, s);
            if (c === 'p') { const r = h(1); put(x, y, N(r < 0.55 ? 'grass_a' : r < 0.8 ? 'grass_b' : r < 0.9 ? 'grass_c' : 'grass_d')); }
            else if (c === 'f') { const mk = maskOf(x, y, (t) => t === 'f' || t === null); put(x, y, N(mk === 255 ? `forest_${'abc'[Math.floor(h(2) * 3)]}` : mk === 0 ? `forest_sparse_${'ab'[Math.floor(h(3) * 2)]}` : `forest47_${mk}`)); }
            else if (c === 'm') { const mk = maskOf(x, y, (t) => t === 'm' || t === null); put(x, y, N(map.biome === 'snow' && mk === 0 ? 'mountain_snow' : mk === 0 ? `mountain_${'abcd'[Math.floor(h(4) * 4)]}` : mk === 255 ? `mount_full_${'abcd'[Math.floor(h(4) * 4)]}` : `mount47_${mk}`)); }
            else if (c === 'k') { const mk = maskOf(x, y, (t) => t === 'k' || t === 'm' || t === null); put(x, y, N(mk === 255 ? `rock_${'ab'[Math.floor(h(5) * 2)]}` : `rock47_${mk}`)); }
            else if (c === 'r') {
                const rd = (t) => t === 'r' || t === 'b';
                const wide = [-1, 1].some((dx) => [-1, 1].some((dy) => rd(at(x + dx, y)) && rd(at(x, y + dy)) && rd(at(x + dx, y + dy))));
                if (wide) put(x, y, N(`dirt47_${maskOf(x, y, rd)}`));
                else put(x, y, N(`road16_${[[0, -1, 1], [1, 0, 2], [0, 1, 4], [-1, 0, 8]].reduce((s, [dx, dy, b]) => s + (rd(at(x + dx, y + dy)) ? b : 0), 0)}`));
            } else if (c === 'c') {
                let inrow = 0; for (let xx = 0; xx < W; xx++) if (at(xx, y) === 'W') inrow += 1;
                const side = (t) => t === 'W' || t === 'c';
                put(x, y, N(inrow >= 3 && side(at(x - 1, y)) && side(at(x + 1, y)) ? 'gate' : `pave_${['slab', 'slab_b', 'brick'][Math.floor(h(7) * 3)]}`));
            } else if (c === 'W') {
                const s = (t) => t === 'W' || t === 'c';
                const ns = s(at(x, y - 1)) || s(at(x, y + 1)); const we = s(at(x - 1, y)) || s(at(x + 1, y));
                put(x, y, N(ns && we ? 'tower_a' : ns ? 'wall_top_v' : `wall_face_${'ab'[Math.floor(h(8) * 2)]}`));
            }
        }
    }
    // 마을 군집
    const seen = new Set();
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (at(x, y) !== 'v' || seen.has(y * W + x)) continue;
            const comp2 = [[x, y]]; seen.add(y * W + x); const q = [[x, y]];
            while (q.length) {
                const [a, b] = q.pop();
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const nx = a + dx; const ny = b + dy; if (at(nx, ny) === 'v' && !seen.has(ny * W + nx)) { seen.add(ny * W + nx); comp2.push([nx, ny]); q.push([nx, ny]); } });
            }
            const xs = comp2.map((p) => p[0]); const ys = comp2.map((p) => p[1]);
            const x0 = Math.min(...xs); const y0 = Math.min(...ys); const w = Math.max(...xs) - x0 + 1; const hh = Math.max(...ys) - y0 + 1;
            if (w * hh === comp2.length && w >= 2 && hh >= 2) {
                comp2.forEach(([px, py]) => {
                    const col = px === x0 ? 'L' : px === x0 + w - 1 ? 'R' : 'C';
                    const ry = py - y0;
                    const nm = ry === hh - 1 ? (px === x0 + Math.floor(w / 2) ? 'door_house' : col !== 'C' ? `hanok_wall_${col}` : 'hanok_wall_window')
                        : hh === 2 ? `roof_full_${col}` : ry === 0 ? `roof_top_${col}` : ry === hh - 2 ? `roof_bot_${col}` : `roof_mid_${col}`;
                    put(px, py, N(nm));
                });
            } else comp2.forEach(([px, py]) => put(px, py, N(lsHash(px, py, 9) < 0.65 ? 'house_giwa' : 'house_thatch')));
        }
    }
    return n;
}
