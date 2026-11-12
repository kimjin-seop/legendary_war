// 자체 제작 지형 타일 v3 시범(settings.terrainStyle === 'v3'). 안아트 terrain_pilot 산출물(public/assets/tiles/terrain_v3/, 명세 terrain_pilot_spec.json).
// 순수 함수(Phaser/DOM 의존 없음). 렌더는 fx/UnityGround.js 가 unity32 합성 위에서 지원 칸만 v3 로 바꿔 그린다(미지원 칸·바이옴 = unity32 폴백).
// - 땅 질감 7종 x 변형 3(시트 textures/terrain_base_sheet.png: 행 = BASE_ORDER, 열 = v0..v2, 가중 50/25/25)
// - 경계: 47블롭 오토타일 9세트(autotile/at47_<set>.png 8열x6행, 슬롯 i = MASKS[i]). 비트 N1 NE2 E4 SE8 S16 SW32 W64 NW128, 대각은 양옆 직교가 모두 켜질 때만.
//   마스크 비트 = 이웃이 같은 무리(맵 밖은 같은 무리). 255(사방 같음)면 질감 변형, 아니면 경계 타일.
// - 오브젝트(스프라이트 키, 타일 번호 아님): 숲 칸 작은 소나무 5그루, 산 칸 봉우리 1개. 기준점 = 아래 가운데. 좌우 반전 금지(빛 왼쪽 위).
// 이동·충돌·서버 지형 판정과 무관(시각 표현만). 롤백: 콘솔 settings.set({terrainStyle:'unity32'}) 후 새로고침.
export const TV3_DIR = '/assets/tiles/terrain_v3/';
export const TV3_PX = 32;
export const TV3_BASE_KEY = 'tv3_base';
export const TV3_BASE_PATH = `${TV3_DIR}textures/terrain_base_sheet.png`;
export const TV3_BASE_ORDER = ['grass', 'forest', 'water', 'shallow', 'sand', 'dirt', 'rock'];
export const TV3_SETS = ['grass_water', 'sand_water', 'shallow_deep', 'grass_shallow', 'grass_sand', 'grass_dirt', 'grass_forest', 'grass_rock']; // cliff_grass 는 의미 차이(절벽 k = 통행 불가 벽)로 미사용
export const tv3SetKey = (s) => `tv3_at_${s}`;
export const tv3SetPath = (s) => `${TV3_DIR}autotile/at47_${s}.png`;
export const TV3_OBJECTS = ['pine_a_s', 'pine_b_s', 'pine_c_s', 'peak_a', 'peak_a_l', 'rock_a', 'bush_a']; // rock_a·bush_a: 암초 q·언덕 i(2026-11-06)
export const tv3ObjKey = (o) => `tv3_obj_${o}`;
export const tv3ObjPath = (o) => `${TV3_DIR}objects/${o}.png`;
export const TV3_TEXTURE_KEYS = [TV3_BASE_KEY, ...TV3_SETS.map(tv3SetKey), ...TV3_OBJECTS.map(tv3ObjKey)];
// 선택 시트(없어도 v3 는 동작, 해당 칸만 unity32 폴백): 부두 h 오토타일(안아트 terrain_buildings harbor/at47_pier_wood.png, 칸 32x37, 위로 5px 걸침)
export const TV3_PIER_KEY = 'tv3_pier';
export const TV3_PIER_PATH = '/assets/tiles/terrain_buildings/harbor/at47_pier_wood.png';
export const TV3_PIER = { w: 32, h: 37, over: 5 };
// 지면 톤(맵 meta.ground_tone, mapArt): v3 땅 칸(물 제외)에 곱하기 색을 알파만큼 섞는다. 객체 = {color:'#rrggbb', alpha}
export const TV3_TONES = { arid: { color: '#e0b878', alpha: 0.55 }, dry: { color: '#d8c890', alpha: 0.4 }, autumn: { color: '#e0a060', alpha: 0.35 }, cold: { color: '#b8c8e0', alpha: 0.35 } };
export function tv3Tone(t) {
    if (!t) return null;
    const o = typeof t === 'string' ? TV3_TONES[t] : t;
    return o && /^#[0-9a-f]{6}$/i.test(String(o.color)) && Number(o.alpha) > 0 ? { color: String(o.color), alpha: Math.min(1, Number(o.alpha)) } : null;
}
// v3 를 적용하는 바이옴(풀밭 기반 질감). 사막·설원·실내 서고 등은 맵 전체 unity32 폴백
// 'library'(서고 L 키트, 2026-11-08)는 의도적으로 제외: 넣으면 바닥이 풀밭 질감이 된다. 서고 바닥 = unity32 libraryRecipe(+ meta.ground_tone, UnityGround) 또는 painted_bg 통그림
export const TV3_BIOMES = new Set([null, undefined, '', 'temperate', 'mountain', 'swamp', 'plain', 'grassland', 'coast', 'sea', 'sea_night', 'strait', 'hill', 'forest_river', 'castle']); // 2026-11-06 해안·바다·해협·언덕·숲강·성 추가(풀밭/물 기반). sea_night(노량) = sea 와 같은 물 기반(누락 시 맵 전체 unity32 폴백, gacha124)
// 지원 지형 코드 -> 무리. 나머지(cliff·swamp·snow_desert·village·castle·bridge·wall·void·rift_plank)는 칸 단위 폴백
// sea·reef = 물(암초는 바위 오브젝트), hill = 풀(덤불·바위 오브젝트), harbor = 물 + 부두 오토타일(opts.pier 일 때만)
const KIND = { plain: 'grass', forest: 'forest', mountain: 'rock', water: 'water', shallows: 'shallow', road: 'dirt', sand: 'sand', sea: 'water', reef: 'water', hill: 'grass' };
// 마스크에서 '같은 무리'로 보는 이웃 코드(맵 밖 = 같음)
const SAME = {
    forest: new Set(['forest']),
    rock: new Set(['mountain']),
    dirt: new Set(['road', 'bridge']),
    sand: new Set(['sand', 'water', 'sea', 'reef', 'harbor']),
    shallow: new Set(['shallows', 'water', 'bridge', 'sea']),
    water: new Set(['water', 'bridge', 'sea', 'reef', 'harbor']),
};
const EDGE = { forest: 'grass_forest', rock: 'grass_rock', dirt: 'grass_dirt', sand: 'grass_sand', shallow: 'grass_shallow' };
const D8 = [[0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128]];
const N = 1; const NE = 2; const E = 4; const SE = 8; const S = 16; const SW = 32; const W = 64; const NW = 128;
export function tv3Norm(m0) {
    let m = m0;
    if (!((m & N) && (m & E))) m &= ~NE;
    if (!((m & S) && (m & E))) m &= ~SE;
    if (!((m & S) && (m & W))) m &= ~SW;
    if (!((m & N) && (m & W))) m &= ~NW;
    return m;
}
export const TV3_MASKS = [...new Set(Array.from({ length: 256 }, (_, i) => tv3Norm(i)))].sort((a, b) => a - b); // 47개, at47_spec.json masks_order 와 같은 순서
const SLOT = new Map(TV3_MASKS.map((m, i) => [m, i]));
const COLS = 8;

const hash = (x, y, s) => {
    let h = (Math.imul(x | 0, 73856093) ^ Math.imul(y | 0, 19349663) ^ Math.imul(s | 0, 83492791)) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
export const tv3Hash = hash; // compose.py tb_lib.h3 와 같은 값(data/mapArt.js 마을 배치 규칙 이식용)
const baseSrc = (kind, r) => {
    const v = r < 0.5 ? 0 : r < 0.75 ? 1 : 2;
    return { key: TV3_BASE_KEY, sx: v * TV3_PX, sy: TV3_BASE_ORDER.indexOf(kind) * TV3_PX };
};
const setSrc = (set, m) => { const i = SLOT.get(m) ?? 0; return { key: tv3SetKey(set), sx: (i % COLS) * TV3_PX, sy: Math.floor(i / COLS) * TV3_PX }; };

// comp: u32Compose/u32ComposeWithBuildings 결과({cols, rows, cells[{x,y,code}]}). 반환: { applied, cells: Map(index -> {key,sx,sy}), objects: [{key, cx, by, cell}], fallback: {code: 칸 수} }
// cx, by = 기준점(아래 가운데) 캔버스 px(맵 좌상단 0,0). objects 는 by 오름차순(y 정렬).
// opts: pier = 부두 시트 있음(harbor 칸 지원), extra = {village:'grass', wall:'grass', castle:'dirt'} 처럼 추가 지원 코드(mapArt 가 집·성벽·본관을 따로 그릴 때)
// 반환에 piers: [{cell, sx, sy}](TV3_PIER 시트 슬롯, 그릴 때 칸 위로 over px 걸침)
export function tv3Compose(comp, { biome = null, seed = 7, pier = false, extra = null, pierCell = TV3_PIER } = {}) { // pierCell = 부두 시트 칸 {w,h}(meta.pier_style 시트, 기본 나무 32x37)
    const out = { applied: false, cells: new Map(), objects: [], piers: [], fallback: {}, reason: null };
    const kinds = { ...KIND, ...(pier ? { harbor: 'water' } : {}), ...(extra ?? {}) };
    const same = extra?.castle === 'dirt' ? { ...SAME, dirt: new Set([...SAME.dirt, 'castle']) } : SAME;
    if (!TV3_BIOMES.has(biome)) { out.reason = `biome ${biome} 미지원(맵 전체 폴백)`; return out; }
    const { cols, rows, cells } = comp;
    const code = (x, y) => (x < 0 || y < 0 || x >= cols || y >= rows ? null : cells[y * cols + x]?.code);
    const maskOf = (x, y, same) => tv3Norm(D8.reduce((m, [dx, dy, b]) => { const c = code(x + dx, y + dy); return c == null || same.has(c) ? m | b : m; }, 0));
    cells.forEach((c, i) => {
        const kind = kinds[c.code];
        if (!kind) { out.fallback[c.code] = (out.fallback[c.code] ?? 0) + 1; return; }
        const r = hash(c.x, c.y, seed);
        let src;
        if (kind === 'grass') src = baseSrc('grass', r);
        else if (kind === 'water') {
            const m = maskOf(c.x, c.y, SAME.water);
            if (m === 255) src = baseSrc('water', r);
            else {
                let sh = 0; let sd = 0; let gr = 0;
                D8.forEach(([dx, dy]) => { const n = code(c.x + dx, c.y + dy); if (n == null || SAME.water.has(n)) return; if (n === 'shallows') sh += 1; else if (n === 'sand') sd += 1; else gr += 1; });
                const set = sh > sd && sh > gr ? 'shallow_deep' : sd > 0 && sd >= gr ? 'sand_water' : 'grass_water';
                src = setSrc(set, m);
            }
        } else {
            const m = maskOf(c.x, c.y, same[kind]);
            src = m === 255 ? baseSrc(kind, r) : setSrc(EDGE[kind], m);
        }
        out.cells.set(i, src);
        // 오브젝트(안아트 명세 forest_rule / mountain_rule)
        const X = c.x * TV3_PX; const Y = c.y * TV3_PX;
        const rnd = (k) => hash(c.x * 7 + k, c.y * 13 + k * 3, seed + 101);
        if (kind === 'forest') {
            [[6, 12], [20, 10], [13, 22], [27, 24], [3, 30]].forEach(([fx, fy], k) => {
                const key = ['pine_a_s', 'pine_b_s', 'pine_c_s', 'pine_a_s'][Math.floor(rnd(k) * 4)];
                out.objects.push({ key: tv3ObjKey(key), cx: X + fx + Math.floor(rnd(k + 10) * 5) - 2, by: Y + fy + Math.floor(rnd(k + 20) * 3) - 1, cell: i });
            });
        } else if (kind === 'rock') {
            const key = rnd(0) < 0.45 ? 'peak_a_l' : 'peak_a';
            out.objects.push({ key: tv3ObjKey(key), cx: X + 16 + Math.floor(rnd(1) * 13) - 6, by: Y + 30 + Math.floor(rnd(2) * 6) - 3, cell: i });
        } else if (c.code === 'reef') { // 암초: 물 위 바위 2개
            [[10, 20], [22, 28]].forEach(([fx, fy], k) => out.objects.push({ key: tv3ObjKey('rock_a'), cx: X + fx + Math.floor(rnd(k) * 5) - 2, by: Y + fy + Math.floor(rnd(k + 5) * 3) - 1, cell: i }));
        } else if (c.code === 'hill') { // 언덕: 덤불 2 + 바위 1
            [[8, 14, 'bush_a'], [23, 20, 'bush_a'], [14, 29, 'rock_a']].forEach(([fx, fy, o], k) => out.objects.push({ key: tv3ObjKey(o), cx: X + fx + Math.floor(rnd(k) * 5) - 2, by: Y + fy, cell: i }));
        } else if (c.code === 'harbor') { // 부두: 부두 칸 + 뭍(물 무리 아님) 이웃을 같은 무리로(안아트 harbor group_rule)
            const pm = tv3Norm(D8.reduce((mm, [dx, dy, b]) => { const n = code(c.x + dx, c.y + dy); return n == null || n === 'harbor' || !SAME.water.has(n) ? mm | b : mm; }, 0));
            const si = SLOT.get(pm) ?? 0;
            out.piers.push({ cell: i, sx: (si % COLS) * pierCell.w, sy: Math.floor(si / COLS) * pierCell.h });
        }
    });
    out.objects.sort((a, b) => a.by - b.by || a.cx - b.cx);
    out.applied = out.cells.size > 0;
    return out;
}
