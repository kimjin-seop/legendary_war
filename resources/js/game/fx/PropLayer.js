import Phaser from 'phaser';
import { L } from '../layout.js';
import { TILE } from '../UnitView.js';
import { settings } from '../settings.js';
import { U32_KEY } from '../data/unityTileset.js';
import { RM_PROPS, RM_PX, rmBiome, rmPropsFor, rmTexKey } from '../data/rmTileset.js';
import { rmSheetsReady } from './RmGround.js';

// 필드 지형지물(소품) 레이어: 게임플레이와 무관한 시각 요소(입력 없음). 지형 코드별 자동 배치(시드 고정 난수).
// - 텍스처: 소품 에셋(deco.<kind>.<n>.64)이 아직 없어 코드로 그린 도트 소품을 캔버스 아틀라스 1장('props_gen', 타일 64 텍셀 기준)으로 만든다.
//   안아트 에셋이 오면 같은 프레임 이름(DECO_KEYS)의 키가 있을 때 그 이미지를 우선 사용한다.
// - 렌더: 16x16 타일 청크마다 Blitter 1개(배치 렌더) + 화면 밖 청크 숨김(cull). 소품은 타일 위·유닛 아래, 청크 안에서 y 순서.
// - 개수: 연출 축약/품질 보통 0.7배, 연출 끄기/품질 낮음 0.4배(빌드 시점 설정 기준).
const SRC = 64; // 타일 1칸 = 64 텍셀
const CHUNK = 16;

// 프레임 정의: [이름, w, h, draw(ctx)]. 좌표는 프레임 로컬 텍셀(정수). 바닥 중앙이 기준점.
const C = {
    leafD: '#2b5530', leafM: '#3f7a3f', leafL: '#6aa84f', trunk: '#5a3b22', rockD: '#5b5d63', rockM: '#7d7f86', rockL: '#a3a5ab',
    snow: '#eef3f8', roof: '#a0442f', roofD: '#7a3222', wall: '#d8c49a', wallD: '#b39f74', stone: '#8a8f99', stoneD: '#686d77',
    red: '#c8503c', blue: '#3f6fb5', reed: '#7a9a3f', reedD: '#55702a', spark: '#dff6ff', cactus: '#4f8a3c', cactusD: '#386a2b',
    sand: '#d9c48a', grass: '#5f9a45', grassD: '#467a33', flowR: '#e0565a', flowY: '#f0d25a', shadow: 'rgba(0,0,0,0.28)', fog: 'rgba(235,240,245,0.35)',
};
const px = (ctx, x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); };
const disc = (ctx, cx, cy, r, c) => { ctx.fillStyle = c; for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + r * 0.6) ctx.fillRect(cx + x, cy + y, 1, 1); };
const oval = (ctx, cx, cy, rx, ry, c) => { ctx.fillStyle = c; for (let y = -ry; y <= ry; y++) for (let x = -rx; x <= rx; x++) if ((x * x) / (rx * rx) + (y * y) / (ry * ry) <= 1) ctx.fillRect(cx + x, cy + y, 1, 1); };
const tri = (ctx, cx, top, h, hw, c) => { ctx.fillStyle = c; for (let r = 0; r < h; r++) { const w = Math.round((hw * (r + 1)) / h); ctx.fillRect(cx - w, top + r, w * 2 + 1, 1); } };

const FRAMES = [
    ['tree0', 28, 38, (g) => { oval(g, 14, 35, 10, 2, C.shadow); px(g, 12, 25, 4, 11, C.trunk); disc(g, 14, 15, 12, C.leafD); disc(g, 13, 14, 10, C.leafM); disc(g, 10, 10, 4, C.leafL); px(g, 15, 8, 2, 2, C.leafL); }],
    ['tree1', 22, 30, (g) => { oval(g, 11, 27, 8, 2, C.shadow); px(g, 10, 19, 3, 9, C.trunk); disc(g, 11, 11, 9, C.leafD); disc(g, 10, 10, 7, C.leafM); disc(g, 8, 7, 3, C.leafL); }],
    ['pine', 22, 38, (g) => { oval(g, 11, 35, 8, 2, C.shadow); px(g, 10, 29, 3, 7, C.trunk); tri(g, 11, 15, 15, 10, C.leafD); tri(g, 11, 8, 13, 8, C.leafM); tri(g, 11, 2, 10, 5, C.leafM); px(g, 9, 6, 1, 6, C.leafL); }],
    ['rock0', 16, 11, (g) => { oval(g, 8, 9, 7, 1, C.shadow); oval(g, 8, 6, 7, 4, C.rockD); oval(g, 7, 5, 6, 3, C.rockM); px(g, 4, 3, 3, 1, C.rockL); }],
    ['rock1', 11, 8, (g) => { oval(g, 5, 6, 5, 1, C.shadow); oval(g, 5, 4, 5, 3, C.rockD); oval(g, 4, 4, 3, 2, C.rockM); px(g, 3, 2, 2, 1, C.rockL); }],
    ['peak', 34, 28, (g) => { oval(g, 17, 26, 15, 2, C.shadow); tri(g, 17, 2, 25, 16, C.rockD); tri(g, 15, 3, 23, 13, C.rockM); tri(g, 17, 2, 8, 5, C.snow); px(g, 12, 12, 2, 6, C.rockL); }],
    ['house0', 26, 26, (g) => { oval(g, 13, 24, 11, 2, C.shadow); px(g, 4, 12, 18, 12, C.wallD); px(g, 5, 12, 16, 11, C.wall); tri(g, 13, 2, 11, 12, C.roofD); tri(g, 13, 3, 9, 10, C.roof); px(g, 11, 17, 4, 6, C.trunk); px(g, 6, 15, 3, 3, '#3a3020'); }],
    ['house1', 22, 22, (g) => { oval(g, 11, 20, 9, 2, C.shadow); px(g, 3, 10, 16, 10, C.wallD); px(g, 4, 10, 14, 9, C.wall); tri(g, 11, 2, 9, 10, '#6b5a3a'); px(g, 9, 14, 4, 5, C.trunk); }],
    ['tower', 18, 34, (g) => { oval(g, 9, 32, 8, 2, C.shadow); px(g, 3, 8, 12, 24, C.stoneD); px(g, 4, 8, 10, 23, C.stone); for (let i = 0; i < 3; i++) px(g, 3 + i * 5, 4, 3, 4, C.stone); px(g, 8, 14, 2, 5, '#2a2d33'); px(g, 4, 20, 10, 1, C.stoneD); }],
    ['banner', 12, 24, (g) => { px(g, 2, 2, 1, 21, C.trunk); px(g, 3, 3, 8, 6, C.red); px(g, 3, 9, 6, 1, C.red); px(g, 4, 4, 2, 2, '#f0d58c'); }],
    ['reed', 11, 13, (g) => { px(g, 2, 4, 1, 9, C.reedD); px(g, 5, 1, 1, 12, C.reed); px(g, 8, 3, 1, 10, C.reedD); px(g, 5, 0, 1, 3, '#8a6a3a'); px(g, 2, 3, 1, 2, '#8a6a3a'); }],
    ['spark', 7, 7, (g) => { px(g, 3, 0, 1, 7, C.spark); px(g, 0, 3, 7, 1, C.spark); px(g, 3, 3, 1, 1, '#ffffff'); }],
    ['fog', 34, 10, (g) => { oval(g, 17, 5, 16, 4, C.fog); }],
    ['cactus', 12, 18, (g) => { oval(g, 6, 16, 5, 1, C.shadow); px(g, 5, 2, 3, 14, C.cactusD); px(g, 5, 2, 2, 13, C.cactus); px(g, 1, 7, 2, 5, C.cactus); px(g, 1, 11, 4, 2, C.cactus); px(g, 9, 5, 2, 5, C.cactus); px(g, 8, 9, 3, 2, C.cactus); }],
    ['snowpile', 18, 8, (g) => { oval(g, 9, 5, 8, 3, '#cfd8e2'); oval(g, 8, 4, 6, 2, C.snow); }],
    ['grass', 9, 7, (g) => { px(g, 1, 3, 1, 4, C.grassD); px(g, 3, 1, 1, 6, C.grass); px(g, 5, 2, 1, 5, C.grassD); px(g, 7, 3, 1, 4, C.grass); }],
    ['flowerR', 7, 7, (g) => { px(g, 3, 4, 1, 3, C.grassD); px(g, 2, 1, 3, 3, C.flowR); px(g, 3, 2, 1, 1, C.flowY); }],
    ['flowerY', 7, 7, (g) => { px(g, 3, 4, 1, 3, C.grassD); px(g, 2, 1, 3, 3, C.flowY); px(g, 3, 2, 1, 1, '#ffffff'); }],
    ['pebble', 7, 4, (g) => { oval(g, 3, 2, 3, 1, C.rockM); px(g, 2, 1, 1, 1, C.rockL); }],
];
// 안아트 에셋 키(있으면 우선): deco.<kind>.<n>.64 -> 텍스처 키 deco_<kind>_<n>_64
export const DECO_KEYS = { tree0: 'deco_tree_0_64', tree1: 'deco_tree_1_64', pine: 'deco_tree_2_64', rock0: 'deco_rock_0_64', rock1: 'deco_rock_1_64', house0: 'deco_house_0_64', house1: 'deco_house_1_64', banner: 'deco_banner_0_64', tower: 'deco_tower_0_64' };

function ensureAtlas(scene) {
    const key = 'props_gen';
    if (scene.textures.exists(key)) return key;
    const pad = 2;
    const W = FRAMES.reduce((s, f) => s + f[1] + pad, pad);
    const H = Math.max(...FRAMES.map((f) => f[2])) + pad * 2;
    const tex = scene.textures.createCanvas(key, W, H);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    let x = pad;
    FRAMES.forEach(([name, w, h, draw]) => {
        ctx.save();
        ctx.translate(x, pad);
        draw(ctx);
        ctx.restore();
        tex.add(name, 0, x, pad, w, h);
        x += w + pad;
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return key;
}

// RM 소품 전용 아틀라스: 시트 프레임을 그대로 쓰면 선형 필터가 이웃 그림을 끌어와 위쪽에 1px 선이 생겨(강화면 관찰),
// 프레임마다 2px 여백 + 가장자리 1px 복제(extrude)한 캔버스에 옮겨 담는다(1회). 필터는 지면 청크와 같은 LINEAR
function ensureRmAtlas(scene) {
    const key = 'rm_props_atlas';
    if (scene.textures.exists(key)) return key;
    const P = 2;
    const items = Object.entries(RM_PROPS).map(([name, [sheet, tx, ty, tw, th]]) => ({ name, img: scene.textures.get(rmTexKey(sheet)).getSourceImage(), sx: tx * RM_PX, sy: ty * RM_PX, w: tw * RM_PX, h: th * RM_PX }));
    const W = items.reduce((s, it) => s + it.w + P * 2, 0);
    const H = Math.max(...items.map((it) => it.h)) + P * 2;
    const tex = scene.textures.createCanvas(key, W, H);
    const ctx = tex.getContext();
    ctx.imageSmoothingEnabled = false;
    let x = 0;
    items.forEach((it) => {
        const ox = x + P; const oy = P;
        ctx.drawImage(it.img, it.sx, it.sy, it.w, it.h, ox, oy, it.w, it.h);
        ctx.drawImage(it.img, it.sx, it.sy, it.w, 1, ox, oy - P, it.w, P); // 위
        ctx.drawImage(it.img, it.sx, it.sy + it.h - 1, it.w, 1, ox, oy + it.h, it.w, P); // 아래
        ctx.drawImage(it.img, it.sx, it.sy, 1, it.h, ox - P, oy, P, it.h); // 왼
        ctx.drawImage(it.img, it.sx + it.w - 1, it.sy, 1, it.h, ox + it.w, oy, P, it.h); // 오른
        tex.add(`rmp_${it.name}`, 0, ox, oy, it.w, it.h);
        x += it.w + P * 2;
    });
    tex.refresh();
    tex.setFilter(Phaser.Textures.FilterMode.LINEAR);
    return key;
}

// 시드 고정 난수(타일 좌표 + 맵 해시)
function rngFor(x, y, seed) {
    let a = (x * 73856093) ^ (y * 19349663) ^ seed;
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// 지형 코드 -> 이 타일의 소품 목록 [{f, x, y(바닥 기준점, 텍셀), flip}]
function propsFor(code, r, dens, biome) {
    const out = [];
    const add = (f, x, y) => out.push({ f, x: Math.round(x), y: Math.round(y), flip: r() < 0.5 });
    const chance = (p) => r() < p * dens;
    switch (code) {
    case 'forest': if (chance(0.25)) add(r() < 0.5 ? 'grass' : 'flowerY', 8 + r() * 48, 54 + r() * 8); break; // 숲 타일 그림에 나무가 있어 중복 금지(발치 풀만)
    case 'mountain': if (chance(0.3)) add('rock1', 8 + r() * 48, 56 + r() * 6); break; // 산 타일 그림에 봉우리가 있어 바위만 가끔
    // 신규 64px 지형 타일(성벽·절벽·마을·여울·늪·설원사막·다리)은 타일 그림에 이미 요소가 있어 소품은 가장자리 보조만(겹침 방지)
    case 'cliff': if (chance(0.25)) add('rock1', 8 + r() * 48, 58 + r() * 4); break;
    case 'castle': if (chance(0.3)) add('banner', 10 + r() * 44, 44 + r() * 14); break;
    case 'wall': break; // 성벽 조각 타일 자체로 충분
    case 'village': if (chance(0.2)) add('flowerY', 6 + r() * 52, 56 + r() * 6); break; // 집은 타일에 그려짐
    case 'water': if (chance(0.4)) add('spark', 8 + r() * 48, 12 + r() * 44); break;
    case 'shallows': if (chance(0.3)) add('reed', r() < 0.5 ? 6 + r() * 8 : 50 + r() * 8, 30 + r() * 30); break;
    case 'swamp': if (chance(0.4)) add('reed', 6 + r() * 52, 30 + r() * 30); if (chance(0.35)) add('fog', 20 + r() * 24, 30 + r() * 26); break;
    case 'snow_desert': { const v = r(); if (biome === 'desert') { if (v < 0.25 * dens) add('cactus', 12 + r() * 40, 46 + r() * 14); else if (v < 0.4 * dens) add('rock1', 12 + r() * 40, 50 + r() * 12); } else if (v < 0.25 * dens) add('snowpile', 12 + r() * 40, 50 + r() * 12); else if (v < 0.35 * dens) add('rock1', 12 + r() * 40, 50 + r() * 12); break; }
    case 'road': if (chance(0.25)) add('pebble', r() < 0.5 ? 4 + r() * 6 : 54 + r() * 6, 10 + r() * 50); break;
    case 'bridge': break; // 다리 조각 타일에 난간이 있음
    case 'plain': if (chance(0.38)) add(['grass', 'grass', 'flowerR', 'flowerY', 'pebble'][Math.floor(r() * 5)], 8 + r() * 48, 14 + r() * 46); break;
    default: break;
    }
    return out;
}

export class PropLayer {
    constructor(scene, parent, map) {
        this.scene = scene;
        this.parent = parent;
        this.chunks = [];
        this.count = 0;
        this.outside = 0;
        const st = settings.get();
        // 사용자 피드백(지저분함): 기본 밀도 0.3 배(70% 감축), 축약/보통 0.2 배, 끄기/낮음은 생략
        const dens = st.fxLevel >= 2 || st.quality >= 2 ? 0 : st.fxLevel === 1 || st.quality === 1 ? 0.2 : 0.3;
        const occ = new Set((map.units ?? []).flatMap((u) => [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => `${u.x + dx},${u.y + dy}`))); // 유닛 칸 + 주변 1칸 비움
        const atlas = ensureAtlas(scene);
        let seed = map.w * 7919 + map.h * 104729;
        map.tiles.forEach((row) => row.forEach((c) => { seed = (seed * 31 + (c?.charCodeAt?.(0) ?? 0)) | 0; }));
        const deco = Object.fromEntries(Object.entries(DECO_KEYS).filter(([, k]) => scene.textures.exists(k)));
        // unity32: 가이드(타일 1칸 = 타일 1개 직배치)에 없는 소품 덧그리기를 하지 않는다(RM·legacy 소품 모두 비활성)
        if ((st.terrainStyle === 'unity32' || st.terrainStyle === 'v3') && scene.textures.exists(U32_KEY)) return; // v3 는 오브젝트를 UnityGround 가 직접 그림
        if (rmSheetsReady(scene)) { this.buildRm(scene, parent, map, dens, occ, seed); return; } // RM 타일셋 모드: B/C 시트 소품(48px 원본)
        for (let cy = 0; cy < map.h; cy += CHUNK) {
            for (let cx = 0; cx < map.w; cx += CHUNK) {
                const list = [];
                for (let y = cy; y < Math.min(map.h, cy + CHUNK); y++) {
                    for (let x = cx; x < Math.min(map.w, cx + CHUNK); x++) {
                        if (!dens || occ.has(`${x},${y}`)) continue;
                        propsFor(map.tiles[y][x], rngFor(x, y, seed), dens, map.biome).forEach((p) => list.push({ ...p, gx: x * SRC + p.x, gy: y * SRC + p.y }));
                    }
                }
                if (!list.length) continue;
                list.sort((a, b) => a.gy - b.gy); // y 정렬(아래가 앞)
                // Phaser 4 에서 컨테이너 안 Blitter 의 setScale 이 적용되지 않아(강화면 관찰: 약 1.2배로 펼쳐져 맵 밖까지 그려짐)
                // 청크 컨테이너 + 개별 이미지로 바꿨다. 이미지 배율 TILE/SRC 는 컨테이너 변환과 함께 확실히 적용된다.
                const bl = scene.add.container(0, 0);
                const extra = [];
                const sc = TILE / SRC;
                list.forEach((p) => {
                    if (p.gx < 0 || p.gy < 0 || p.gx > map.w * SRC || p.gy > map.h * SRC) { this.outside += 1; return; } // 맵 밖 금지
                    const key = deco[p.f] ?? atlas;
                    const img = deco[p.f] ? scene.add.image(0, 0, key) : scene.add.image(0, 0, atlas, p.f);
                    img.setOrigin(0.5, 1).setScale(sc).setFlipX(p.flip).setPosition(p.gx * sc, p.gy * sc);
                    bl.add(img);
                    this.count += 1;
                });
                parent.add(bl);
                this.chunks.push({ bl, extra, x0: cx * TILE, y0: cy * TILE, x1: Math.min(map.w, cx + CHUNK) * TILE, y1: Math.min(map.h, cy + CHUNK) * TILE + TILE });
            }
        }
    }

    // RM 모드: 같은 청크·컬링 구조, 프레임은 RM 시트에서 잘라 쓴 이름 프레임(rmp_<이름>), 배율 TILE/48. 밀도는 기본(0.3) 기준 상대값
    buildRm(scene, parent, map, dens, occ, seed) {
        if (!dens) return;
        const biome = rmBiome(map);
        const atlas = ensureRmAtlas(scene);
        const k = dens / 0.3;
        const sc = TILE / RM_PX;
        const busy = map.rmOccupied instanceof Set ? map.rmOccupied : new Set(); // RmGround 오브젝트가 덮는 칸·여울 칸
        // 값 노이즈(4칸 격자, 결정론): 꽃·풀이 군집으로 모이게 칸별 확률에 곱한다(0.15~1.85)
        const lat = (ix, iy) => (rngFor(ix, iy, seed ^ 0x5bd1e995)() );
        const noise = (x, y) => { const gx = x / 4; const gy = y / 4; const ix = Math.floor(gx); const iy = Math.floor(gy); const fx = gx - ix; const fy = gy - iy; const sx = fx * fx * (3 - 2 * fx); const sy = fy * fy * (3 - 2 * fy); const a = lat(ix, iy) + (lat(ix + 1, iy) - lat(ix, iy)) * sx; const b = lat(ix, iy + 1) + (lat(ix + 1, iy + 1) - lat(ix, iy + 1)) * sx; return a + (b - a) * sy; };
        for (let cy = 0; cy < map.h; cy += CHUNK) {
            for (let cx = 0; cx < map.w; cx += CHUNK) {
                const list = [];
                for (let y = cy; y < Math.min(map.h, cy + CHUNK); y++) {
                    for (let x = cx; x < Math.min(map.w, cx + CHUNK); x++) {
                        if (occ.has(`${x},${y}`) || busy.has(`${x},${y}`)) continue;
                        const code = map.tiles[y][x];
                        const kk = code === 'plain' ? k * (0.15 + noise(x, y) * 1.7) : k;
                        rmPropsFor(code, rngFor(x, y, seed), kk, biome).forEach((p) => list.push({ ...p, gx: x * RM_PX + p.x, gy: y * RM_PX + p.y }));
                    }
                }
                if (!list.length) continue;
                list.sort((a, b) => a.gy - b.gy);
                const bl = scene.add.container(0, 0);
                list.forEach((p) => {
                    bl.add(scene.add.image(p.gx * sc, p.gy * sc, atlas, `rmp_${p.f}`).setOrigin(0.5, 1).setScale(sc * (p.s ?? 1)).setFlipX(p.flip));
                    this.count += 1;
                });
                parent.add(bl);
                this.chunks.push({ bl, extra: [], x0: cx * TILE, y0: cy * TILE, x1: Math.min(map.w, cx + CHUNK) * TILE, y1: Math.min(map.h, cy + CHUNK) * TILE + TILE });
            }
        }
    }

    // 화면 밖 청크 숨김(월드 좌표 -> 화면 좌표)
    cull(world) {
        const s = world.scaleX;
        this.chunks.forEach((c) => {
            const vis = world.x + c.x1 * s >= 0 && world.x + c.x0 * s <= L.lw && world.y + c.y1 * s >= 0 && world.y + (c.y0 - TILE) * s <= L.lh;
            if (c.bl.visible !== vis) c.bl.setVisible(vis);
        });
    }

    destroy() { this.chunks.forEach((c) => c.bl.destroy(true)); this.chunks = []; }
}
