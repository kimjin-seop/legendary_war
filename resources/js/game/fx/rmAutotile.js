// RM MV 형식 오토타일 합성기(순수 함수, Phaser/DOM 의존 없음 -> node 로 단위 검증 가능).
// 표준 기법: 타일 1칸을 24px 쿼터 4조각으로 나누고, 각 조각을 그 모서리 방향의 가로·세로·대각 이웃이 같은 지형인지에 따라
// 블록 안 다른 위치에서 가져온다. floor 형(2x3 타일 블록) = 47가지 모양, wall 형(2x2 타일 블록, 대각 무시) = 16가지.
// 출력: 그리기 명령 목록(ops). 실행은 fx/RmGround.js(브라우저 캔버스) 또는 검증 스크립트(node)가 한다.
// 맵 영역만 합성한다(맵 밖 연장 칸 없음). 맵 밖 이웃은 가장 가까운 가장자리 칸과 같다고 본다.
// 군집 판정(2026-11 사용자 지적 "여러 칸짜리 타일을 한 칸만 넣으니 조잡"): 숲·산·성·마을은 같은 지형 4방향 연결 컴포넌트 크기가
// CLUSTER_MIN 이상일 때만 오토타일 군집으로 그리고, 작은 군집(1~3칸)은 칸 안에 완성된 오브젝트 스프라이트(나무 무리·언덕/바위·소형 성채·가옥)로 그린다.
import { RM_AUTO, RM_PX, RM_SPRITE, RM_TILES, rmBiome, rmRecipe, rmWaterAuto } from '../data/rmTileset.js';
import { BIOME_SUB, PREFAB_ORDER, RM_PREFABS } from '../data/rmPrefabs.js';

const Q = RM_PX / 2;
export const CLUSTER_MIN = 4;
export const FOREST_MODE = 'trees';
const CLUSTERED = new Set(['forest', 'mountain', 'castle', 'village']); // 성벽·절벽은 선/면 지형이라 항상 오토타일

// floor 형 쿼터 위치(블록 원점 기준, 쿼터 단위). cx/cy: 0=왼/위 1=오른/아래. h: 가로 이웃 같음, v: 세로 이웃 같음, d: 대각 이웃 같음
// 블록 구성: 위 왼쪽 타일 = 대표(미리보기), 위 오른쪽 타일 = 안쪽 모서리 4조각, 아래 2x2 타일 = 바깥 테두리+내부(4x4 쿼터)
export function floorQuarter(cx, cy, h, v, d) {
    if (h && v) return d ? [2 - cx, 4 - cy] : [2 + cx, cy]; // 내부 / 안쪽 모서리
    if (h) return [2 - cx, cy ? 5 : 2]; // 위·아래 가장자리
    if (v) return [cx ? 3 : 0, 4 - cy]; // 좌·우 가장자리
    return [cx ? 3 : 0, cy ? 5 : 2]; // 바깥 모서리
}
// wall 형(지붕·벽·옆면) 쿼터 위치: 4x4 쿼터 블록, 대각 무시
export function wallQuarter(cx, cy, h, v) {
    return [h ? 2 - cx : (cx ? 3 : 0), v ? 2 - cy : (cy ? 3 : 0)];
}
// 이웃 비트(N=1, NE=2, E=4, SE=8, S=16, SW=32, W=64, NW=128)
const bitsOf = (mask, cx, cy) => ({ h: (mask & (cx ? 4 : 64)) !== 0, v: (mask & (cy ? 16 : 1)) !== 0, d: (mask & (cx ? (cy ? 8 : 2) : (cy ? 32 : 128))) !== 0 });
export function floorShape(mask) {
    const out = [];
    for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) { const { h, v, d } = bitsOf(mask, cx, cy); out.push(floorQuarter(cx, cy, h, v, d)); }
    return out;
}
export function wallShape(mask) {
    const out = [];
    for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) { const { h, v } = bitsOf(mask, cx, cy); out.push(wallQuarter(cx, cy, h, v)); }
    return out;
}

const DIRS = [[0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128]];
const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
export const hashCell = (x, y, salt = 0) => { let h = (x * 374761393 + y * 668265263 + salt * 1442695041) | 0; h = (h ^ (h >>> 13)) * 1274126177; return (h ^ (h >>> 16)) >>> 0; };

// 같은 코드 4방향 연결 컴포넌트 크기(칸별)
export function componentSizes(map) {
    const W = map.w; const H = map.h;
    const size = new Int32Array(W * H);
    size.root = new Int32Array(W * H); // 컴포넌트 대표 칸(첫 칸 인덱스)
    const seen = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (seen[y * W + x]) continue;
        const c = map.tiles[y][x]; const st = [[x, y]]; const cells = [];
        seen[y * W + x] = 1;
        while (st.length) {
            const [px, py] = st.pop(); cells.push(py * W + px);
            N4.forEach(([dx, dy]) => { const nx = px + dx; const ny = py + dy; if (nx < 0 || ny < 0 || nx >= W || ny >= H || seen[ny * W + nx] || map.tiles[ny][nx] !== c) return; seen[ny * W + nx] = 1; st.push([nx, ny]); });
        }
        cells.forEach((i) => { size[i] = cells.length; size.root[i] = cells[0]; });
    }
    return size;
}

// 칸 단위 0/1 격자 -> SUB 배 해상도 + 상자 블러 2회(모서리가 둥근 부드러운 마스크)
const SUB = 8; // 칸당 표본 8 (6px): 여울·늪 경계가 흐린 얼룩이 아니라 둥근 군집 모양이 되게
function blurMask(src, cols, rows, r = 2) {
    const w = cols * SUB; const h = rows * SUB;
    let a = new Float32Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) a[y * w + x] = src[Math.floor(y / SUB) * cols + Math.floor(x / SUB)];
    for (let pass = 0; pass < 2; pass++) {
        const b = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; let n = 0; for (let k = -r; k <= r; k++) { const xx = Math.max(0, Math.min(w - 1, x + k)); s += a[y * w + xx]; n += 1; } b[y * w + x] = s / n; }
        const c = new Float32Array(w * h);
        for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; let n = 0; for (let k = -r; k <= r; k++) { const yy = Math.max(0, Math.min(h - 1, y + k)); s += b[yy * w + x]; n += 1; } c[y * w + x] = s / n; }
        a = c;
    }
    return a;
}

// 반환 { cols, rows, px, ops, biome, sprites }. 좌표 = 합성 캔버스 픽셀(칸 (x,y) = (x*48, y*48)).
// ops: {t:'img', s, sx, sy, sw, sh, dx, dy, dw, dh, anim?, flip?}  anim(타일 간격)이 있으면 수면 애니메이션 대상
//      {t:'soft', grid:Float32Array(gw*gh), gw, gh, color:[r,g,b], alpha}  격자(칸당 SUB 표본)를 쌍선형 확대해 덧칠
export function composeRm(map) {
    const W = map.w; const H = map.h;
    const biome = rmBiome(map);
    const cols = W; const rows = H;
    const cx0 = (x) => Math.max(0, Math.min(W - 1, x)); const cy0 = (y) => Math.max(0, Math.min(H - 1, y));
    const code = (x, y) => map.tiles[cy0(y)]?.[cx0(x)] ?? 'plain';
    const key = (x, y) => `${cx0(x)},${cy0(y)}`;
    const comp = componentSizes(map);
    // 숲 군집 표현: 'canopy' = A4 수풀 윗면+줄기 옆면 오토타일, 'trees' = 칸마다 나무 무리 스프라이트(군집 가장자리가 직선으로 끊기지 않음)
    const forestMode = map.forestMode ?? FOREST_MODE;
    // 오브젝트(프리팹·단일 완성형) 경로: 숲(trees 모드)·성·마을은 군집 크기와 무관하게 항상, 산은 4칸 미만 군집만(큰 산은 절벽 고원 오토타일 + 봉우리)
    // 산: 큰 군집도 고원 오토타일 대신 산괴 프리팹(빈 상자처럼 보이던 문제). 숲(trees)·성·마을도 항상 오브젝트 경로
    const small = (x, y) => { const c = code(x, y); if (!CLUSTERED.has(c)) return false; if (c === 'village' || c === 'castle' || c === 'mountain' || (c === 'forest' && forestMode === 'trees')) return true; return comp[cy0(y) * W + cx0(x)] < CLUSTER_MIN; };
    // 프리팹 배치(군집 모양에 맞는 여러 칸 구조물, 큰 것부터 탐욕 배치, 변형은 좌표 해시). 남는 칸은 단일 칸 스프라이트로 폴백
    const claim = new Int32Array(W * H).fill(-1);
    const placed = [];
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = map.tiles[y][x];
        const order = PREFAB_ORDER[c];
        if (!order || claim[y * W + x] >= 0 || !small(x, y)) continue;
        for (const group0 of order) {
            // 마을 양식: map.villageStyle 이 있으면 그것, 없으면 군집(컴포넌트)마다 해시로 1/3 군영·2/3 마을(같은 군집 안에서는 통일)
            const root = comp.root[y * W + x];
            const style = map.villageStyle ?? (c === 'village' ? (hashCell(root % W, Math.floor(root / W), 41) % 3 === 0 ? 'camp' : 'town') : null);
            const group = group0.filter((n) => { const p = RM_PREFABS[n]; return (!p.biome || p.biome === biome) && (!style || !p.style || p.style === style); });
            if (!group.length) continue;
            const name = group[hashCell(x, y, 31) % group.length];
            const pf = RM_PREFABS[name];
            let ok = x + pf.w <= W && y + pf.h <= H;
            for (let yy = y; ok && yy < y + pf.h; yy++) for (let xx = x; ok && xx < x + pf.w; xx++) ok = map.tiles[yy][xx] === c && claim[yy * W + xx] < 0 && small(xx, yy);
            if (!ok) continue;
            for (let yy = y; yy < y + pf.h; yy++) for (let xx = x; xx < x + pf.w; xx++) claim[yy * W + xx] = placed.length;
            placed.push({ name, x, y });
            break;
        }
    }
    const WET = new Set(['water', 'shallows', 'swamp']);
    const wetBridge = new Set();
    for (let pass = 0; pass < 3; pass++) {
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
            if (code(x, y) !== 'bridge') continue;
            if (N4.some(([dx, dy]) => WET.has(code(x + dx, y + dy)) || wetBridge.has(key(x + dx, y + dy)))) wetBridge.add(key(x, y));
        }
    }
    const isWet = (x, y) => { const c = code(x, y); return WET.has(c) || (c === 'bridge' && wetBridge.has(key(x, y))); };
    // 작은 군집 칸: 오토타일 대신 스프라이트(바닥은 주변 이어받기)
    const recipe = (x, y) => (small(x, y) ? { sprite: code(x, y) } : rmRecipe(code(x, y), biome));
    const baseGround = (x, y) => { const r = recipe(x, y); return isWet(x, y) || r.elev || r.house || r.tiles || r.sprite ? null : (r.ground ?? 'grass'); };
    const gCache = new Map();
    const groundOf = (x, y) => {
        if (isWet(x, y)) return '~wet';
        const k = key(x, y);
        if (gCache.has(k)) return gCache.get(k);
        let g = baseGround(x, y);
        if (!g) {
            const cnt = {};
            N4.forEach(([dx, dy]) => { const n = baseGround(x + dx, y + dy); if (n) cnt[n] = (cnt[n] ?? 0) + 1; });
            g = Object.entries(cnt).sort((a, b) => b[1] - a[1] || (a[0] === 'grass' ? 1 : -1))[0]?.[0] ?? 'grass';
            if (g === 'cobbleOnGrass') g = 'grass';
        }
        gCache.set(k, g);
        return g;
    };
    const elevOf = (x, y) => recipe(x, y).elev ?? 0;
    const topOf = (x, y) => recipe(x, y).top ?? null;

    const ops = [];
    const objs = []; // 오브젝트 스프라이트(바닥 y 순 정렬 후 마지막에 그림)
    const px = (v) => v * RM_PX;
    const mask = (x, y, same) => DIRS.reduce((m, [dx, dy, bit]) => (same(x + dx, y + dy) ? m | bit : m), 0);
    const quad = (auto, qx, qy, dx, dy, dw, dh, list = ops) => {
        const a = RM_AUTO[auto];
        list.push({ t: 'img', s: a.sheet, sx: a.bx * RM_PX + qx * Q, sy: a.by * RM_PX + qy * Q, sw: Q, sh: Q, dx, dy, dw, dh, anim: a.anim });
    };
    // floor 오토타일 한 칸. corner: 바깥 모서리 조각만 다른 블록에서(숲: 둥근 잎 모서리), rowsY: 쿼터 행별 [y 오프셋, 높이]
    const floorCell = (auto, m, x, y, { corner = null, rowsY = [[0, Q], [Q, Q]] } = {}) => {
        for (let cy = 0; cy < 2; cy++) for (let cx = 0; cx < 2; cx++) {
            const { h, v, d } = bitsOf(m, cx, cy);
            const [oy, hh] = rowsY[cy];
            const [qx, qy] = floorQuarter(cx, cy, h, v, d);
            quad(corner && !h && !v ? corner : auto, qx, qy, px(x) + cx * Q, px(y) + oy, Q, hh);
        }
    };
    const waterAuto = rmWaterAuto(biome);

    // 1) 바탕 풀 + 지면 오토타일 + 수면
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        floorCell('grass', 255, x, y);
        if (isWet(x, y)) { floorCell(waterAuto, mask(x, y, isWet), x, y); continue; }
        const r = recipe(x, y);
        if (r.tiles) { const [s, tx, ty] = r.tiles[hashCell(x, y) % r.tiles.length]; ops.push({ t: 'img', s, sx: tx * RM_PX, sy: ty * RM_PX, sw: RM_PX, sh: RM_PX, dx: px(x), dy: px(y), dw: RM_PX, dh: RM_PX }); continue; }
        const g = groundOf(x, y);
        if (g !== 'grass') floorCell(g, mask(x, y, (nx, ny) => groundOf(nx, ny) === g), x, y);
        if (r.sprite === 'forest' && g === 'grass') floorCell('darkGrass', mask(x, y, (nx, ny) => code(nx, ny) === 'forest'), x, y); // 숲 바닥(둥근 전이)
    }
    // 2) 여울(밝은 모래빛)·늪(탁한 녹갈색): 칸 격자를 4배 해상도로 블러(둥근 군집 전이) x 수면 내부 계수(물가 풀 테두리 위엔 덧칠 안 함)
    const wetG = new Float32Array(cols * rows); const shG = new Float32Array(cols * rows); const swG = new Float32Array(cols * rows);
    let nSh = 0; let nSw = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = y * cols + x; const w = recipe(x, y).wet;
        if (isWet(x, y)) wetG[i] = 1;
        if (w === 'shallow') { shG[i] = 1; nSh += 1; }
        if (w === 'swamp') { swG[i] = 1; nSw += 1; }
    }
    if (nSh || nSw) {
        const wetB = blurMask(wetG, cols, rows, 3);
        const inner = wetB.map((v) => Math.max(0, Math.min(1, (v - 0.55) * 3)));
        const gw = cols * SUB; const gh = rows * SUB;
        if (nSw) { const b = blurMask(swG, cols, rows); ops.push({ t: 'soft', grid: b.map((v, i) => v * inner[i]), gw, gh, color: [74, 82, 40], alpha: 0.55 }); }
        if (nSh) {
            // 여울: 블러로 모서리만 둥글린 뒤 0.5 에서 날카롭게 자른 마스크(그라데이션 띠 금지) + 경계 밝은 물결선
            const b = blurMask(shG, cols, rows, 2);
            const cut = (v) => Math.max(0, Math.min(1, (v - 0.5) * 7 + 0.5));
            ops.push({ t: 'soft', grid: b.map((v, i) => cut(v) * Math.min(1, inner[i] * 2)), gw, gh, color: [214, 206, 150], alpha: 0.5 });
            ops.push({ t: 'soft', grid: b.map((v, i) => Math.max(0, 1 - Math.abs(v - 0.5) * 9) * Math.min(1, inner[i] * 2)), gw, gh, color: [240, 250, 255], alpha: 0.75 });
        }
    }
    // 3) 다리: 방향(가로/세로 중 긴 연속 구간), 양 끝 난간 타일. 폭 2칸 이상은 하나의 넓은 다리(바깥 가장자리만 테두리, 안쪽은 판자 가운데 띠 반복)
    const isBr = (x, y) => x >= 0 && y >= 0 && x < W && y < H && code(x, y) === 'bridge';
    const run = (x, y, dx, dy) => { let k = 1; while (isBr(x + dx * k, y + dy * k) && k < 64) k += 1; return k - 1; };
    const horizOf = (x, y) => run(x, y, -1, 0) + run(x, y, 1, 0) >= run(x, y, 0, -1) + run(x, y, 0, 1);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (!isBr(x, y)) continue;
        const horiz = horizOf(x, y);
        const a0 = horiz ? run(x, y, -1, 0) : run(x, y, 0, -1); const a1 = horiz ? run(x, y, 1, 0) : run(x, y, 0, 1);
        const pos = a0 === 0 && a1 > 0 ? 0 : a1 === 0 && a0 > 0 ? 2 : 1;
        const [s, tx, ty] = (horiz ? RM_TILES.bridgeH : RM_TILES.bridgeV)[pos];
        // 폭 방향 이웃(같은 방향 다리)이면 그쪽 가장자리 대신 판자 가운데 띠
        const sideA = horiz ? isBr(x, y - 1) && horizOf(x, y - 1) : isBr(x - 1, y) && !horizOf(x - 1, y);
        const sideB = horiz ? isBr(x, y + 1) && horizOf(x, y + 1) : isBr(x + 1, y) && !horizOf(x + 1, y);
        const SX = tx * RM_PX; const SY = ty * RM_PX;
        if (horiz) {
            ops.push({ t: 'img', s, sx: SX, sy: sideA ? SY + 12 : SY, sw: RM_PX, sh: Q, dx: px(x), dy: px(y), dw: RM_PX, dh: Q });
            ops.push({ t: 'img', s, sx: SX, sy: sideB ? SY + 12 : SY + Q, sw: RM_PX, sh: Q, dx: px(x), dy: px(y) + Q, dw: RM_PX, dh: Q });
        } else {
            ops.push({ t: 'img', s, sx: sideA ? SX + 12 : SX, sy: SY, sw: Q, sh: RM_PX, dx: px(x), dy: px(y), dw: Q, dh: RM_PX });
            ops.push({ t: 'img', s, sx: sideB ? SX + 12 : SX + Q, sy: SY, sw: Q, sh: RM_PX, dx: px(x) + Q, dy: px(y), dw: Q, dh: RM_PX });
        }
    }
    // 4) 높은 지형 군집(숲·산·절벽·성벽): 윗면 floor 오토타일, 남쪽이 더 낮으면 위 절반에 윗면·아래 절반에 옆면(아래쪽 옆면만 칸 높이 사용)
    const hasFace = (x, y) => elevOf(x, y) > 0 && y + 1 < H && elevOf(x, y + 1) < elevOf(x, y);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const r = recipe(x, y);
        if (!r.elev) continue;
        const sameTop = (nx, ny) => topOf(nx, ny) === r.top;
        const m = mask(x, y, sameTop);
        if (!hasFace(x, y)) { floorCell(r.top, m, x, y, { corner: r.corner }); continue; }
        floorCell(r.top, m, x, y, { corner: r.corner, rowsY: [[0, Q / 2], [Q / 2, Q / 2]] });
        const sameFace = (nx, ny) => sameTop(nx, ny) && (nx < 0 || nx >= W || hasFace(nx, ny));
        wallShape(mask(x, y, sameFace) & ~(1 | 16)).slice(2).forEach(([qx, qy], i) => quad(r.face, qx, qy, px(x) + i * Q, px(y) + Q, Q, Q));
    }
    // 5) 마을 군집(4칸 이상): 지붕+벽 wall 오토타일 연립 가옥(좌우 연결)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const r = recipe(x, y);
        if (!r.house) continue;
        const [roof, wall] = r.house;
        const same = (nx, ny) => ny === y && nx >= 0 && nx < W && !!recipe(nx, ny).house;
        const shape = wallShape(mask(x, y, same) & ~(1 | 16));
        const insL = same(x - 1, y) ? 0 : 3; const insR = same(x + 1, y) ? 0 : 3;
        const x0 = px(x) + insL; const w = RM_PX - insL - insR;
        shape.forEach(([qx, qy], i) => quad(roof, qx, qy, x0 + ((i % 2) * w) / 2, px(y) + (i >> 1) * 13, w / 2, 13, objs));
        shape.forEach(([qx, qy], i) => quad(wall, qx, qy, x0 + ((i % 2) * w) / 2, px(y) + 26 + (i >> 1) * 11, w / 2, 11, objs));
        objs[objs.length - 1].bottom = px(y) + RM_PX;
    }
    // 6) 작은 군집 스프라이트(칸 안에 완성된 오브젝트, 변형 3종 이상 좌표 해시 순환, 위로 약간 넘침 허용)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const r = recipe(x, y);
        if (!r.sprite || claim[y * W + x] >= 0) continue;
        spriteFor(r.sprite, x, y, biome, comp[y * W + x] >= CLUSTER_MIN).forEach((o) => objs.push(o));
    }
    placed.forEach((p) => prefabOps(objs, p, biome));
    // 장식 레이어(맵 데이터 decor, 선택): 판정 불변·시각 전용. 알 수 없는 프리팹·범위 밖은 건너뜀(검사는 rmPrefabs.validateDecor)
    (Array.isArray(map.decor) ? map.decor : []).forEach((d) => {
        const pf = RM_PREFABS[d?.prefab];
        if (pf && d.x >= 0 && d.y >= 0 && d.x + pf.w <= W && d.y + pf.h <= H) prefabOps(objs, { name: d.prefab, x: d.x, y: d.y, flip: !!d.flip }, biome);
    });
    // 7) 산·절벽 군집 위 봉우리 바위(칸 위로 넘치는 높이 + 그림자): 고원이 받침/광장처럼 보이지 않게
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = code(x, y); const r = recipe(x, y);
        if (!r.elev || (c !== 'mountain' && c !== 'cliff')) continue;
        const hh = hashCell(x, y, 11);
        if (c === 'mountain' ? hh % 5 < 3 : hh % 2) continue; // 산 약 40%, 절벽 약 50% 칸(빽빽한 바위밭 방지)
        const rock = biome === 'snow' ? 'rockSnow' : biome === 'desert' ? 'rockSand' : 'rockGrey';
        const big = c === 'cliff' ? 52 + (hh >>> 4) % 8 : 40 + (hh >>> 4) % 10;
        const jx = ((hh >>> 8) % 13) - 6; const base = hasFace(x, y) ? 26 : 40 + ((hh >>> 12) % 5);
        objs.push({ t: 'shadow', cx: px(x) + 24 + jx, cy: px(y) + base - 2, rx: big * 0.42, ry: big * 0.13, a: 0.35 });
        piece(objs, spr(rock), x, y, 24 + jx - big / 2, base, big, big, (hh & 1) === 1);
        objs[objs.length - 1].bottom = px(y) + base;
        if ((hh >>> 5) % 4 === 0) { piece(objs, spr('rubble'), x, y, (hh >>> 7) % 2 ? 2 : 26, base + 8, 20, 20); objs[objs.length - 1].bottom = px(y) + base + 8; }
    }
    // 8) 여울: 수면 안(4방향 모두 수면)인 여울 칸에는 징검돌 2개(건널 수 있음 표시), 둑에 닿은 여울 칸은 갈대(각진 모서리 완화)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        if (recipe(x, y).wet !== 'shallow') continue;
        const hh = hashCell(x, y, 23);
        const inner = N4.every(([dx, dy]) => isWet(x + dx, y + dy));
        if (inner) {
            piece(objs, spr('stones'), x, y, 2 + (hh >>> 4) % 6, 26, 24, 20, (hh & 1) === 1); objs[objs.length - 1].bottom = px(y) + 6;
            piece(objs, spr('stones'), x, y, 22 + (hh >>> 8) % 6, 44, 24, 20, (hh & 2) === 2); objs[objs.length - 1].bottom = px(y) + 24;
        } else if (hh % 2) {
            piece(objs, spr('reed'), x, y, (hh >>> 4) % 2 ? 2 : 26, 46, 22, 22, (hh & 1) === 1); objs[objs.length - 1].bottom = px(y) + 46;
        }
    }
    // 9) 숲·산·절벽 칸 바닥에 약한 어두운 색조(이동 비용 칸 경계를 오브젝트 없이도 읽히게)
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const c = code(x, y);
        if (c === 'forest' || c === 'mountain' || c === 'cliff') ops.push({ t: 'rect', color: c === 'forest' ? 'rgba(14,40,12,0.20)' : 'rgba(40,28,14,0.20)', dx: px(x), dy: px(y), dw: RM_PX, dh: RM_PX });
    }
    // 바닥 y(같으면 x) 순으로 그리기(겹침 시 아래쪽이 앞)
    let group = 0;
    const tagged = [];
    let cur = [];
    objs.forEach((o) => { cur.push(o); if (o.bottom != null || o.last) { tagged.push({ ops: cur, bottom: o.bottom, x: o.dx, g: group++ }); cur = []; } });
    if (cur.length) tagged.push({ ops: cur, bottom: 0, x: 0, g: group++ });
    // 소품 금지 칸(점유 마스크): 오브젝트가 시각적으로 덮는 칸 + 여울 칸 — PropLayer 가 여기엔 소품을 두지 않는다(지붕 위 덤불·둑 밖 연잎 방지)
    const occupied = new Set();
    objs.forEach((o) => {
        if (o.t !== 'img') return;
        for (let yy = Math.max(0, Math.floor(o.dy / RM_PX)); yy <= Math.min(H - 1, Math.floor((o.dy + o.dh - 1) / RM_PX)); yy++) {
            for (let xx = Math.max(0, Math.floor(o.dx / RM_PX)); xx <= Math.min(W - 1, Math.floor((o.dx + o.dw - 1) / RM_PX)); xx++) occupied.add(`${xx},${yy}`);
        }
    });
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (recipe(x, y).wet === 'shallow' || CLUSTERED.has(code(x, y))) occupied.add(`${x},${y}`);
    tagged.sort((a, b) => a.bottom - b.bottom || a.x - b.x || a.g - b.g).forEach((t) => t.ops.forEach((o) => { delete o.bottom; delete o.last; ops.push(o); }));
    // 9) 색 보정 + 맵 가장자리 안쪽 비네팅(강도는 실행 측 설정 terrainGrade). grade 는 여기까지 그린 것 전체에 1회
    ops.push({ t: 'grade' });
    ops.push({ t: 'edge', width: RM_PX * 1.6, color: [20, 29, 51] });
    return { cols, rows, px: RM_PX, ops, biome, occupied };
}

// 스프라이트 조각: [sheet, sx, sy, sw, sh](픽셀) -> 목적지(칸 기준 상대 dx, dy(바닥 기준 위로 음수), 폭, 높이)
function piece(list, src, cellX, cellY, dx, bottomY0, dw, dh, flip = false) {
    const [s, sx, sy, sw, sh] = src;
    const bottomY = Math.min(bottomY0, footBottom ?? RM_PX); // 밑동(바닥)은 칸(프리팹은 발자국) 안에 고정 — 위로 넘침만 허용
    list.push({ t: 'img', s, sx, sy, sw, sh, dx: cellX * RM_PX + dx, dy: cellY * RM_PX + bottomY - dh, dw, dh, flip: flip || undefined });
}
const spr = (name) => { const [s, tx, ty, tw, th, ox = 0, oy = 0, w, h] = RM_SPRITE[name]; return [s, tx * RM_PX + ox, ty * RM_PX + oy, w ?? tw * RM_PX, h ?? th * RM_PX]; };
const autoTile = (auto, qs) => qs.map(([qx, qy]) => { const a = RM_AUTO[auto]; return [a.sheet, a.bx * RM_PX + qx * Q, a.by * RM_PX + qy * Q, Q, Q]; });

// 프리팹 1개 -> 그리기 명령(그림자 먼저, 조각은 정의 순서), 그룹 정렬 기준 = 발자국 아래 y
let footBottom = null; // prefabOps 실행 중 발자국 아래 y(px, 발자국 기준) — piece 의 밑동 고정 기준
export function prefabOps(list, { name, x, y, flip: mirror = false }, biome) {
    const pf = RM_PREFABS[name];
    footBottom = pf.h * RM_PX;
    try { prefabParts(list, pf, x, y, mirror, biome); } finally { footBottom = null; }
}
function prefabParts(list, pf, x, y, mirror, biome) {
    const sub = BIOME_SUB[biome] ?? {};
    const start = list.length;
    const FW = pf.w * RM_PX;
    (pf.shadows ?? []).forEach(([cx, cy, rx]) => list.push({ t: 'shadow', cx: x * RM_PX + (mirror ? FW - cx : cx), cy: y * RM_PX + cy, rx, ry: rx * 0.28, a: 0.32 }));
    pf.parts.forEach(([raw, px1, bottom, dw, dh, flip0]) => {
        const p = sub[raw] ?? raw;
        const px0 = mirror ? FW - px1 - dw : px1; // 좌우 반전: 위치 거울 + 조각 반전 토글(오토타일 조각은 대칭이라 위치만)
        const flip = mirror ? !flip0 : flip0;
        if (p.startsWith('floor:')) {
            const f = RM_TILES.castleFloor[hashCell(x + px0, y + bottom) % RM_TILES.castleFloor.length];
            piece(list, [f[0], f[1] * RM_PX, f[2] * RM_PX, RM_PX, RM_PX], x, y, px0, bottom, dw, dh);
        } else if (p.startsWith('auto:')) {
            const [, auto, shape] = p.split(':');
            const iso = RM_AUTO[auto].type === 'floor' ? floorShape(0) : wallShape(0); // 고립 모양(floor 형은 2x3 블록 아래쪽 바깥 모서리)
            const qs = shape === 'face' ? iso.slice(2) : iso;
            const rowsN = shape === 'face' ? 1 : 2;
            qs.forEach((q, i) => piece(list, autoTile(auto, [q])[0], x, y, px0 + (i % 2) * (dw / 2), bottom - dh + ((i >> 1) + 1) * (dh / rowsN), dw / 2, dh / rowsN));
        } else piece(list, spr(p), x, y, px0, bottom, dw, dh, !!flip);
    });
    if (list.length > start) list[list.length - 1].bottom = (y + pf.h) * RM_PX;
}

// 지형별 단일/작은 군집 스프라이트. 각 오브젝트 묶음의 마지막 조각에 bottom(정렬 기준)을 붙인다
function spriteFor(kind, x, y, biome, dense = false) {
    const out = [];
    const h = hashCell(x, y, 7);
    const v = h % 3; // 변형 3종
    const j = ((h >>> 3) % 13) - 6; // 지터 -6..6px(대칭 배치가 바둑판 아이콘처럼 보이지 않게)
    const flip = ((h >>> 6) & 1) === 1;
    const end = (bottom) => { out[out.length - 1].bottom = y * RM_PX + bottom; };
    if (kind === 'forest') {
        const tall = biome === 'snow' ? 'snowPine' : biome === 'desert' ? 'palm' : 'treeRound';
        if (dense) { // 숲 군집 칸: 뒷줄 2그루 + 앞줄 1~2그루(이웃 칸과 겹쳐 하나의 숲으로 보이게, 크기·위치 결정론 지터)
            const sz = (k) => 0.9 + (((h >>> (8 + k * 3)) % 5) * 0.05);
            const big = v === 0 && biome !== 'snow' && biome !== 'desert';
            piece(out, spr(tall), x, y, -4 + j, 26, 30 * sz(0), 56 * sz(0), flip); end(26);
            piece(out, spr(tall), x, y, 22 - j, 28, 30 * sz(1), 56 * sz(1), !flip); end(28);
            if (big) { piece(out, spr('treeBig'), x, y, 2 + j, 50, 46, 50, flip); end(50); } else {
                piece(out, spr(tall), x, y, 8 + j, 48, 30 * sz(2), 58 * sz(2), !flip); end(48);
                if (v === 2) { piece(out, spr('bush'), x, y, 26, 50, 22, 20, flip); end(50); }
            }
            return out;
        }
        if (v === 0) { // 큰 활엽수 1그루(2x2 원본 축소)
            piece(out, spr(biome === 'snow' ? 'snowPine' : 'treeBig'), x, y, 0 + j, 47, 50, 58, flip); end(47);
        } else if (v === 1) { // 두 그루
            piece(out, spr(tall), x, y, -2 + j, 40, 30, 58, flip); end(40);
            piece(out, spr(tall), x, y, 20 + j, 48, 30, 58, !flip); end(48);
        } else { // 나무 + 덤불 + 작은 나무
            piece(out, spr(tall), x, y, 12 + j, 38, 28, 54, flip); end(38);
            piece(out, spr('bush'), x, y, 0, 48, 24, 22); end(48);
            piece(out, spr(tall), x, y, 26 + j, 48, 22, 42, !flip); end(48.5);
        }
        return out;
    }
    if (kind === 'mountain') {
        const top = biome === 'snow' ? 'cliffSnowTop' : biome === 'desert' ? 'cliffSandTop' : 'cliffDirtTop';
        const face = biome === 'snow' ? 'cliffSnowFace' : biome === 'desert' ? 'cliffSandFace' : 'cliffDirtFace';
        const rock = biome === 'snow' ? 'rockSnow' : biome === 'desert' ? 'rockSand' : 'rockGrey';
        void top; void face; // 절벽 오토타일을 1칸에 압축한 '언덕'은 받침처럼 보여(안아트 검토) 봉우리 바위 무리로 대체
        const shadow = (cx, cy, rx) => out.push({ t: 'shadow', cx: x * RM_PX + cx, cy: y * RM_PX + cy, rx, ry: rx * 0.3, a: 0.35 });
        if (v === 0) { // 큰 봉우리 1 + 작은 바위
            shadow(24 + j, 44, 26); piece(out, spr(rock), x, y, -6 + j, 46, 60, 60, flip); end(46);
            piece(out, spr(rock), x, y, 28, 50, 20, 20, !flip); end(50);
        } else if (v === 1) { // 봉우리 2
            shadow(16 + j, 36, 18); piece(out, spr(rock), x, y, -6 + j, 38, 44, 44, flip); end(38);
            shadow(32, 46, 18); piece(out, spr(rock), x, y, 12 - j / 2, 49, 42, 42, !flip); end(49);
        } else { // 봉우리 + 잡석
            shadow(22 + j, 42, 22); piece(out, spr(rock), x, y, -2 + j, 44, 50, 50, flip); end(44);
            piece(out, spr('rubble'), x, y, 24, 50, 26, 26, !flip); end(50);
        }
        return out;
    }
    if (kind === 'castle') { // 소형 성채: 석재 바닥 + 낮은 성벽 + 탑 + 깃발
        const floor = RM_TILES.castleFloor[h % RM_TILES.castleFloor.length];
        piece(out, [floor[0], floor[1] * RM_PX, floor[2] * RM_PX, RM_PX, RM_PX], x, y, 0, 48, 48, 48); end(1);
        // 탑(약 1.5칸 높이, 위 칸으로 넘침) + 낮은 성벽 + 깃발. 변형 3종: 탑 왼쪽/오른쪽/가운데
        const tx = (v === 0 ? 0 : v === 1 ? 20 : 10) + Math.round(j / 2);
        out.push({ t: 'shadow', cx: x * RM_PX + tx + 14, cy: y * RM_PX + 38, rx: 16, ry: 5, a: 0.35 });
        piece(out, spr('tower'), x, y, tx, 40, 28, 70); end(40);
        wallShape(0).slice(2).forEach(([qx, qy], i) => piece(out, autoTile('stoneWallFace', [[qx, qy]])[0], x, y, 1 + i * 23, 48, 23, 18));
        end(48);
        piece(out, spr('banner'), x, y, v === 1 ? 4 : 32, 46, 14, 30, flip); end(48.5);
        return out;
    }
    if (kind === 'village') { // 소형 가옥: 칸 폭 약 90%, 지붕 3색 순환 + 벽 + 문 + 창 (+ 통)
        const roofs = biome === 'snow' ? ['roofSnow', 'roofSnow', 'roofWood'] : biome === 'desert' ? ['roofYellow', 'roofOrange', 'roofWood'] : ['roofOrange', 'roofWood', 'roofNavy'];
        const walls = biome === 'desert' ? ['wallSandstone'] : ['wallPlaster', 'wallWood', 'wallPlaster'];
        const roof = roofs[v]; const wall = walls[(h >>> 4) % walls.length];
        // 칸 폭 약 96%, 높이 약 1.3칸(지붕이 위 칸으로 넘침)
        const x0 = 1 + Math.round(j / 3); const w = 46; const roofH = 36; const wallH = 26; const base = 47; const top = base - wallH - roofH;
        out.push({ t: 'shadow', cx: x * RM_PX + x0 + w / 2, cy: y * RM_PX + base, rx: w * 0.5, ry: 4, a: 0.3 });
        autoTile(wall, wallShape(0)).forEach((q, i) => piece(out, q, x, y, x0 + 2 + (i % 2) * ((w - 4) / 2), base - wallH + ((i >> 1) + 1) * (wallH / 2), (w - 4) / 2, wallH / 2));
        autoTile(roof, wallShape(0)).forEach((q, i) => piece(out, q, x, y, x0 + (i % 2) * (w / 2), top + ((i >> 1) + 1) * (roofH / 2), w / 2, roofH / 2));
        const doorX = x0 + (v === 2 ? 28 : 7);
        piece(out, spr('door'), x, y, doorX, base, 14, 19);
        piece(out, spr('window'), x, y, v === 2 ? x0 + 8 : x0 + 28, base - 9, 12, 12);
        end(base);
        if ((h >>> 9) % 2) { piece(out, spr('barrel'), x, y, v === 2 ? -1 : 37, 49, 12, 13); end(49); }
        return out;
    }
    return out;
}
