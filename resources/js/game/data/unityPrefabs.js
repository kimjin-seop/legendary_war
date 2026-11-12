// unity32 건물 프리팹: 새 타일셋(TileMap.png 0~29) 타일만 조합한 '칸 좌표 -> 타일 인덱스' 배치 레시피(순수 데이터·함수, node 검증 가능).
// 가이드(타일 하나씩 직배치) 준수 방식: 레시피의 각 칸을 맵 칸에 타일 1개씩 그대로 놓는다. 보간·합성·이웃 비트마스크 없음.
// - 회전: 건물은 레이아웃을 회전하지 않는다(정면 = 남쪽, 출입구 9·계단 20 이 아래를 향하는 정면도 관례). 세로형은 별도 레시피로 정의.
//   타일 이미지 90도 회전은 다리 판자(5)만(data/unityTileset.js). decor 의 flip 은 칸 배치만 좌우로 뒤집는다(타일 이미지는 뒤집지 않음).
// - 시각-판정 정합(서버 지형 판정은 바꾸지 않는다). 타일 '모양 분류'와 놓을 수 있는 지형:
//     FLOOR(바닥처럼 보임: 모래·풀·판자·판석·받침판·계단·격자 바닥) -> 통행 가능 지형에만
//     DOOR(출입구 9) -> village·castle(들어가는 칸) + wall(통행 불가 건물 정면의 문 장식)
//     HOUSE(붉은 벽돌 지붕 25) -> village(SRPG '방문 가능한 집' 관례: 유닛이 건물 칸에 올라섬, 방어 보정) + wall(통행 불가 큰 건물 지붕)
//     FACADE(건물 정면 석조 벽체 13) -> village(방문 가능한 집의 정면) + wall(큰 건물 정면)
//     BLOCK(막힌 덩어리: 석벽 10·11·12·14·기둥·바위) -> 지상 통행 불가 지형(wall·cliff·water)과 mountain 에만
// 큰 건물(지붕 2~3줄 + 석조 벽체 1~2줄, 유닛이 돌아서 지나가는 건물)은 서버 지형 wall(W, 전부 불가)의 직사각형 군집(3x3 이상)에 자동 배치하거나 decor 로 지정한다.
import { U32, U32_OVERLAY, U32_TV2, u32Compose, u32Hash, u32ValidIndex } from './unityTileset.js';
import { TV2_CHIP_INDEX, TV2_INDEX_MAP, TV2_INDEX_MAP_REGROUNDED, TV2_RG_MISMATCH } from './tv2Map.js';
import { lsPaint } from './landPaint.js';

const { SAND, GRASS, PLANK, DUNGEON_DOOR: DOOR, STONE_A, STONE_B, STONE_C, STONE_D, SLAB, PLATE, STAIRS, PILLAR_A, PILLAR_B, PILLAR_C, PILLAR_D, BRICK, FLOOR_GRID } = U32;

export const U32_LOOK = {};
[SAND, GRASS, U32.GRASS_DARK, PLANK, SLAB, PLATE, STAIRS, FLOOR_GRID].forEach((i) => { U32_LOOK[i] = 'FLOOR'; });
U32_LOOK[DOOR] = 'DOOR';
[BRICK].forEach((i) => { U32_LOOK[i] = 'HOUSE'; });
U32_LOOK[STONE_D] = 'FACADE';
[STONE_A, STONE_B, STONE_C, U32.STONE_E, PILLAR_A, PILLAR_B, PILLAR_C, PILLAR_D, U32.PEAK].forEach((i) => { U32_LOOK[i] = 'BLOCK'; });

// 지형 코드 -> 허용 모양 분류
const IMPASSABLE = new Set(['wall', 'cliff', 'water']);
export function u32Allows(code, look) {
    if (look === 'BLOCK') return IMPASSABLE.has(code) || code === 'mountain';
    if (look === 'HOUSE' || look === 'FACADE') return code === 'village' || code === 'wall';
    if (look === 'DOOR') return code === 'village' || code === 'castle' || code === 'wall';
    if (look === 'FLOOR') return !IMPASSABLE.has(code) && code !== 'mountain';
    return false;
}

// 프리팹: code = 자동 배치 대상 지형(null 이면 decor 전용), style = village_style(town|camp, 없으면 공용), cells = 행 배열(위 -> 아래)
export const U32_PREFABS = {
    // ---- 마을(village, 전 칸 통행 가능 + 방어 보정): 붉은 벽돌 지붕 + 출입구, 정면 아래 ----
    // 지붕줄(25) + 정면 벽체줄(13) + 출입구(9). 단독 1칸은 프리팹 없이 기본 매핑(모래/벽돌 혼합)
    cottage2x2: { code: 'village', style: 'town', cells: [[BRICK, BRICK], [STONE_D, DOOR]] }, //    작은 집
    rowhouse4x2: { code: 'village', style: 'town', cells: [[BRICK, BRICK, BRICK, BRICK], [DOOR, STONE_D, STONE_D, DOOR]] }, // 연립 가옥(마을 건물군)
    manor3x3: { code: 'village', style: 'town', cells: [[BRICK, BRICK, BRICK], [STONE_D, DOOR, STONE_D], [SAND, STAIRS, SAND]] }, // 저택(앞마당 계단)
    houses2x4: { code: 'village', style: 'town', cells: [[BRICK, BRICK], [STONE_D, DOOR], [BRICK, BRICK], [DOOR, STONE_D]] }, // 세로 가옥 2채
    // 천막 마을(village_style camp): 천막 타일이 없어 목재 데크 + 모래 마당으로 대체
    deck1x1: { code: 'village', style: 'camp', cells: [[PLANK]] },
    camp2x2: { code: 'village', style: 'camp', cells: [[PLANK, PLANK], [SAND, PLANK]] },
    // ---- 성(castle, 전 칸 통행 가능 + 방어 보정): 바닥류만 ----
    throne4x4: { code: 'castle', cells: [[SLAB, STAIRS, STAIRS, SLAB], [SLAB, PLATE, PLATE, SLAB], [SLAB, PLATE, PLATE, SLAB], [FLOOR_GRID, FLOOR_GRID, FLOOR_GRID, FLOOR_GRID]] }, // 기둥 홀 내부(옥좌 계단)
    keep2x2: { code: 'castle', cells: [[PLATE, PLATE], [SLAB, SLAB]] }, //                      소형 성채 바닥
    gate2x1: { code: 'castle', cells: [[DOOR, DOOR]] }, //                                      성문(가로 성벽 사이)
    gate1x2: { code: 'castle', cells: [[DOOR], [DOOR]] }, //                                    성문(세로 성벽 사이)
    yard1x1: { code: 'castle', cells: [[SLAB]] },
    // ---- 큰 건물(wall 직사각형 군집 3x3 이상 자동 배치, 통행 불가): 지붕줄(25) + 석조 벽체줄(10·13) + 출입구(9) ----
    house3x3: { code: 'wall', kind: 'building', cells: [[BRICK, BRICK, BRICK], [BRICK, BRICK, BRICK], [STONE_D, DOOR, STONE_D]] },
    house4x3: { code: 'wall', kind: 'building', cells: [[BRICK, BRICK, BRICK, BRICK], [BRICK, BRICK, BRICK, BRICK], [STONE_A, DOOR, STONE_D, STONE_A]] },
    hall4x4: { code: 'wall', kind: 'building', cells: [[BRICK, BRICK, BRICK, BRICK], [BRICK, BRICK, BRICK, BRICK], [STONE_A, STONE_D, STONE_D, STONE_A], [STONE_D, DOOR, DOOR, STONE_D]] },
    manor6x4: { code: 'wall', kind: 'building', cells: [[BRICK, BRICK, BRICK, BRICK, BRICK, BRICK], [BRICK, BRICK, BRICK, BRICK, BRICK, BRICK], [STONE_A, STONE_D, STONE_A, STONE_A, STONE_D, STONE_A], [STONE_D, DOOR, STONE_A, STONE_A, DOOR, STONE_D]] },
    // ---- decor 전용(맵 데이터 decor 필드 {prefab,x,y,flip?}). 칸마다 지형 정합 검사, 하나라도 어긋나면 그 decor 전체를 건너뜀 ----
    gatehouse4x3: { code: null, cells: [[PILLAR_A, BRICK, BRICK, PILLAR_B], [PILLAR_C, BRICK, BRICK, PILLAR_D], [STONE_B, DOOR, DOOR, STONE_B]] }, // 성문 건물: 문 2칸 = castle(통행), 나머지 = wall
    watchtower2x3: { code: null, cells: [[PILLAR_A, PILLAR_B], [STONE_B, STONE_C], [PILLAR_C, PILLAR_D]] }, // 망루(성벽 W 위)
    shrine3x2: { code: null, cells: [[PILLAR_A, PLATE, PILLAR_B], [PILLAR_C, STAIRS, PILLAR_D]] }, // 신전(기둥 칸은 W, 가운데 2칸은 통행 가능 지형)
    stairs1x1: { code: null, cells: [[STAIRS]] },
    dais2x1: { code: null, cells: [[PLATE, PLATE]] }, //                                       제단(바닥)
    wallRun3x1: { code: null, cells: [[STONE_A, STONE_C, STONE_A]] },
};
// 기존 RM decor 이름 -> unity32 프리팹(없으면 건너뜀: 기둥열·석상·깃발 등은 통행 가능 칸에 놓인 시각 전용이라 BLOCK 타일로 그리면 판정과 어긋남)
export const U32_DECOR_ALIAS = { altar2x1: 'dais2x1' };

export const prefabSize = (p) => ({ w: p.cells[0].length, h: p.cells.length });

// 성벽(wall) 군집 레시피: 군집 경계 상자의 모서리 칸·1칸 폭 직선의 양 끝 = 망루 기둥(21), 나머지 = 석벽(10/13 좌표 해시)
// (이웃 비트마스크가 아니라 군집 단위 형태로 정하는 배치표)
export function wallRecipe(comp, hash) {
    const xs = comp.map((c) => c[0]); const ys = comp.map((c) => c[1]);
    const x0 = Math.min(...xs); const x1 = Math.max(...xs); const y0 = Math.min(...ys); const y1 = Math.max(...ys);
    return comp.map(([x, y]) => {
        const corner = (x === x0 || x === x1) && (y === y0 || y === y1);
        return { x, y, idx: corner ? PILLAR_A : hash(x, y) < 0.5 ? STONE_A : STONE_C, prefab: corner ? 'wallTower' : 'wallRun' };
    });
}

// 4방향 연결 군집
export function components(at, cols, rows, codes) {
    const seen = new Set(); const out = [];
    for (let y = 0; y < rows; y++) {
        for (let x = 0; x < cols; x++) {
            const c = at(x, y);
            if (!codes.has(c) || seen.has(y * cols + x)) continue;
            const q = [[x, y]]; const cells = []; seen.add(y * cols + x);
            while (q.length) {
                const [a, b] = q.pop(); cells.push([a, b]);
                [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => {
                    const nx = a + dx; const ny = b + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows || seen.has(ny * cols + nx) || at(nx, ny) !== c) return;
                    seen.add(ny * cols + nx); q.push([nx, ny]);
                });
            }
            out.push({ code: c, cells });
        }
    }
    return out;
}

// village/castle 군집 채우기: 행 우선으로 빈 칸을 만나면 그 칸을 왼쪽 위로 하는, 군집 안에 완전히 들어가는 가장 넓은 프리팹을 놓는다
export function fillCluster(comp, style) {
    const own = new Set(comp.cells.map(([x, y]) => `${x},${y}`));
    const used = new Set();
    const cand = Object.entries(U32_PREFABS)
        .filter(([, p]) => p.code === comp.code && (!p.style || p.style === style) && (comp.code !== 'wall' || p.kind === 'building'))
        .map(([name, p]) => ({ name, p, ...prefabSize(p) }))
        .sort((a, b) => b.w * b.h - a.w * a.h || b.w - a.w);
    const placed = [];
    const sorted = [...comp.cells].sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    for (const [x, y] of sorted) {
        if (used.has(`${x},${y}`)) continue;
        const fit = cand.find(({ w, h }) => {
            for (let dy = 0; dy < h; dy++) for (let dx = 0; dx < w; dx++) { const k = `${x + dx},${y + dy}`; if (!own.has(k) || used.has(k)) return false; }
            return true;
        });
        if (!fit) continue; // 1x1 프리팹이 없으면 기본 매핑 그대로
        for (let dy = 0; dy < fit.h; dy++) for (let dx = 0; dx < fit.w; dx++) used.add(`${x + dx},${y + dy}`);
        placed.push({ name: fit.name, x, y });
    }
    return placed;
}

// 프리팹 칸 목록(flip = 칸 배치 좌우 반전)
export function prefabCells(name, x, y, flip = false) {
    const p = U32_PREFABS[name];
    if (!p) return null;
    const { w } = prefabSize(p);
    const out = [];
    p.cells.forEach((row, dy) => row.forEach((idx, dx) => out.push({ x: x + (flip ? w - 1 - dx : dx), y: y + dy, idx })));
    return out;
}

// 지형 직배치(u32Compose) 위에 건물 레시피를 칸 단위로 덮어쓴다. 반환은 u32Compose 와 같은 형식 + placed(배치된 프리팹 목록)·warnings
// 순서: village/castle 군집 채우기 -> wall 군집(직사각형 3x3 이상 = 큰 건물, 그 외 = 성벽 구간) -> decor(맵 데이터 지정, 칸별 정합 검사)
export function u32ComposeWithBuildings(map) {
    const layer = u32TileLayer(map);
    if (layer) return layer;
    const comp = u32Compose(map);
    const { cols, rows } = comp;
    const cell = (x, y) => comp.cells[y * cols + x];
    const at = (x, y) => cell(x, y)?.code;
    const seed = (map.code ? [...String(map.code)].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 11) : 11);
    const hash = (x, y) => u32Hash(x, y, seed);
    const style = map.village_style ?? map.villageStyle ?? 'town';
    const placed = []; const warnings = [];
    // 육상 세트(land_set) 이웃 규칙: tile_layer 가 없는 맵만(여기까지 왔으면 없음). 적용되면 마을·성·성벽 군집 프리팹(구 30칸 시트 조립)은 건너뛴다(decor 는 유지)
    const landN = lsPaint(map, comp);
    const put = (x, y, idx, prefab) => { const c = cell(x, y); if (!c) return; c.idx = idx; c.rot = 0; c.tint = null; c.wash = null; c.prefab = prefab; };
    if (!landN) components(at, cols, rows, new Set(['village', 'castle', 'wall'])).forEach((cl) => {
        if (cl.code === 'wall') {
            const xs = cl.cells.map((c) => c[0]); const ys = cl.cells.map((c) => c[1]);
            const w = Math.max(...xs) - Math.min(...xs) + 1; const h = Math.max(...ys) - Math.min(...ys) + 1;
            if (w >= 3 && h >= 3 && cl.cells.length === w * h) {
                const fit = fillCluster(cl, style);
                const done = new Set();
                fit.forEach((p) => { placed.push(p); prefabCells(p.name, p.x, p.y).forEach((c) => { put(c.x, c.y, c.idx, p.name); done.add(`${c.x},${c.y}`); }); });
                const rest = cl.cells.filter(([x, y]) => !done.has(`${x},${y}`));
                if (rest.length) wallRecipe(rest, hash).forEach((c) => put(c.x, c.y, c.idx, c.prefab));
                return;
            }
            wallRecipe(cl.cells, hash).forEach((c) => put(c.x, c.y, c.idx, c.prefab));
            return;
        }
        fillCluster(cl, style).forEach((p) => { placed.push(p); prefabCells(p.name, p.x, p.y).forEach((c) => put(c.x, c.y, c.idx, p.name)); });
    });
    (Array.isArray(map.decor) ? map.decor : []).forEach((d) => {
        const name = U32_PREFABS[d?.prefab] ? d.prefab : U32_DECOR_ALIAS[d?.prefab];
        if (!name) { warnings.push(`decor ${d?.prefab}: unity32 프리팹 없음(건너뜀)`); return; }
        const list = prefabCells(name, d.x | 0, d.y | 0, !!d.flip);
        const bad = list.find((c) => !cell(c.x, c.y) || !u32Allows(at(c.x, c.y), U32_LOOK[c.idx]));
        if (bad) { warnings.push(`decor ${d.prefab}@${d.x},${d.y}: (${bad.x},${bad.y}) ${at(bad.x, bad.y) ?? '맵 밖'} 칸에 ${U32_LOOK[bad.idx]} 타일 불가(건너뜀)`); return; }
        list.forEach((c) => put(c.x, c.y, c.idx, name));
        placed.push({ name, x: d.x | 0, y: d.y | 0, decor: true });
    });
    return { ...comp, placed, warnings, land: landN };
}

// 맵 데이터 타일 인덱스 레이어(tile_layer, 임밸런 생성기가 오프라인으로 칠함 — spec database/data/MAPS_PACK20_V2_SPEC.md 5b):
//   { format: 'names-v1', names: [논리명], rows: ['i i i ...'(칸당 names 인덱스)], index_map: {논리명: 전역 타일 인덱스}, unmapped?: [논리명],
//     rotations?: {논리명: 0~3}(이름별 회전, 실데이터 형식 예 plank_h: 1) | rot?/rotations 행 배열(칸별), overlay?: [{x, y, name}](깃발 103 등 덧그림) }
// index_map 이 있으면 칸마다 그 인덱스를 그대로 놓는다(명시된 rot 만 적용). 이웃 판정·자동 프리팹·다리 자동 회전·decor 는 쓰지 않는다.
// index_map 이 없으면 null(호출 측이 기존 방식). 이름이 unmapped 에 있거나 매핑이 없거나 인덱스가 범위 밖인 칸은 지형 코드 단일 타일 폴백.
const splitRow = (r) => (Array.isArray(r) ? r : String(r ?? '').trim().split(/\s+/)).map(Number);
export function u32TileLayer(map) {
    const tl = map.tileLayer ?? map.tile_layer;
    if (!tl || tl.format !== 'names-v1' || !tl.index_map || typeof tl.index_map !== 'object' || !Array.isArray(tl.names) || !Array.isArray(tl.rows)) return null;
    const base = u32Compose(map, { noAutoRotate: true });
    const unmapped = new Set(Array.isArray(tl.unmapped) ? tl.unmapped : []);
    const rows = tl.rows.map(splitRow); const rots = Array.isArray(tl.rot) ? tl.rot.map(splitRow) : null;
    const rotByName = tl.rotations && typeof tl.rotations === 'object' && !Array.isArray(tl.rotations) ? tl.rotations : {}; // 실데이터 형식(이름별)
    const rots2 = Array.isArray(tl.rotations) ? tl.rotations.map(splitRow) : null; // rotations 가 칸별 행 배열로 올 때도 허용
    let fallback = 0;
    // 타일셋 v2 교체(U32_TV2.enabled): 이름 조회 순서 tv2 표 -> (regrounded) 재바탕 표 -> 맵 index_map. 표에 없는 이름(한옥·성문 등)은 기존 인덱스. rotations·overlay 는 맵 값 그대로
    const tv2On = U32_TV2.enabled;
    const rgOn = tv2On && U32_TV2.regrounded && !TV2_RG_MISMATCH.includes(map.code);
    const tv2Of = (name) => {
        if (!tv2On || name == null) return undefined;
        const a = TV2_INDEX_MAP[name]; if (u32ValidIndex(a)) return a;
        const b = rgOn ? TV2_INDEX_MAP_REGROUNDED[name] : undefined; return u32ValidIndex(b) ? b : undefined;
    };
    let tv2 = 0;
    base.cells.forEach((c) => {
        const ni = rows[c.y]?.[c.x];
        const name = tl.names[ni];
        const t2 = tv2Of(name); if (t2 != null) tv2 += 1;
        const idx = t2 ?? (name != null && !unmapped.has(name) ? tl.index_map[name] : undefined);
        if (!u32ValidIndex(idx)) { fallback += 1; return; } // 0~29 / 30~103(확장) / 110~163(확장2)만 유효. 104~109·미로드 시트 구간은 폴백
        if (U32_OVERLAY.has(idx)) { c.over = idx; c.layer = name; return; } // 투명 오버레이(깃발): 아래는 지형 코드 기본 타일 + 덧그림
        const r = rots?.[c.y]?.[c.x] ?? rots2?.[c.y]?.[c.x] ?? rotByName[name] ?? 0; // 칸별 rot 행 우선, 없으면 이름별 rotations(예 plank_h: 1)
        c.idx = idx; c.rot = [0, 1, 2, 3].includes(r) ? r : 0; c.tint = null; c.wash = null; c.layer = name;
    });
    // overlay: [{x, y, name}] -> 그 칸 위에 index_map[name] 을 덧그림(깃발 103 등 투명 타일). 아래 칸은 위에서 정한 바닥 그대로
    let overlayBad = 0;
    (Array.isArray(tl.overlay) ? tl.overlay : []).forEach((o) => {
        const c = base.cells[(o?.y | 0) * base.cols + (o?.x | 0)];
        const idx = tl.index_map[o?.name];
        if (!c || o.x < 0 || o.x >= base.cols || !u32ValidIndex(idx) || unmapped.has(o.name)) { overlayBad += 1; return; }
        c.over = idx;
    });
    // tile_layer.v2(format layers-v1, 맵디자이너 tmv2.py): ground 는 위 names-v1 평탄화 그대로, building·object -> c.mid(바닥 위·유닛 아래), foreground -> c.fg(유닛 위).
    // 칸 값 = v2.names 인덱스(-1 빈 칸). 이름 cs:<시트>:<id> 는 TV2_CHIP_INDEX, 그 외는 v2.index_map. tv2 끔(terrainTv2:false)이면 1619~ 가 무효라 전부 건너뜀
    const v2 = tl.v2;
    let v2Cells = 0; let v2Bad = 0; let fgCells = 0;
    if (tv2On && v2 && v2.format === 'layers-v1' && v2.layers && Array.isArray(v2.names)) {
        const v2Idx = (name) => {
            if (typeof name !== 'string') return undefined;
            const a = name.startsWith('cs:') ? TV2_CHIP_INDEX[name.slice(3)] : undefined;
            return a ?? v2.index_map?.[name] ?? undefined;
        };
        ['building', 'object', 'foreground'].forEach((k) => {
            const lr = Array.isArray(v2.layers[k]) ? v2.layers[k].map(splitRow) : null;
            if (!lr) return;
            lr.forEach((row, y) => row.forEach((ni, x) => {
                if (!(ni >= 0) || x >= base.cols || y >= base.rows) return;
                const idx = v2Idx(v2.names[ni]);
                if (!u32ValidIndex(idx)) { v2Bad += 1; return; }
                const c = base.cells[y * base.cols + x];
                if (k === 'foreground') { c.fg = idx; fgCells += 1; } else (c.mid ??= []).push(idx);
                v2Cells += 1;
            }));
        });
    }
    const warnings = [];
    if (fallback) warnings.push(`tile_layer 미매핑 ${fallback}칸 -> 지형 코드 폴백`);
    if (overlayBad) warnings.push(`tile_layer overlay ${overlayBad}건 건너뜀`);
    if (v2Bad) warnings.push(`tile_layer.v2 레이어 ${v2Bad}칸 인덱스 미해소 -> 건너뜀`);
    return { ...base, placed: [], warnings, layer: true, fallback, overlayBad, tv2, v2Cells, fgCells };
}
