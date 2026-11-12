// 맵 개편(하이브리드) P1 엔진 기반: 자유 배치 소품·통그림 배경·마을 집 배치 규칙. 순수 함수(Phaser/DOM 의존 없음).
// 기능 플래그 settings.mapArt(기본 false = 기존 화면 그대로). 켜기: localStorage 'srpg.settings.v3' 에 mapArt:true 저장 후 새로고침(docs/HANDOFF.md).
// - 에셋: public/assets/tiles/terrain_buildings/tb_manifest.json(키 -> 파일·anchor·layer). 텍스처 키 = 'tb_' + 키. 키가 없으면 그 소품만 건너뜀(로그 1회).
// - 맵 데이터(선택 필드, 통행 판정과 무관 = 시각 전용):
//   props: [{ key, x, y, anchor?, variant?, culture?, scale?, layer? }] 또는 { format, items: [...] }.
//          x, y = 칸 실수 좌표(맵 왼쪽 위 0,0, 1 = 한 칸). 이 점에 스프라이트 기준점(anchor)이 놓인다. kind 는 key 의 별칭(maps_pack20_v3_redesign 선례).
//   painted_bg: { src, tile_px, ox?, oy?, filter? } = 타일 지면 대신 그릴 통그림(칸 1개 = tile_px 원본 px, ox/oy = 원본에서 맵 (0,0) 칸의 왼쪽 위 px).
import { tv3Hash } from './terrainV3.js';

export const TB_DIR = '/assets/tiles/terrain_buildings/';
export const TB_MANIFEST_KEY = 'tb_manifest';
export const TB_MANIFEST_PATH = `${TB_DIR}tb_manifest.json`;
export const TB_PX = 32; // 소품 원본 기준 칸 px(명세 tile_px)
export const tbTexKey = (k) => `tb_${k}`;

const DEFAULTS = { props: true, painted: true, village: true, villageRule: 'v2', walls: true, grid: true, forestEdge: true, unitRing: true, fade: 0.45 };
// 맵 데이터에 개편 시각 필드가 있는지(props·painted_bg·gates·castle_render·ground_tone 중 하나)
export function mapHasArt(map) {
    if (!map) return false;
    const props = Array.isArray(map.props) ? map.props : map.props?.items;
    return !!((Array.isArray(props) && props.length) || map.paintedBg || map.gates || map.castleRender || map.groundTone);
}
// settings 값(st.mapArt: false | true | {부분 덮어쓰기} | 없음) + 맵 -> 옵션 객체 또는 null(꺼짐)
// - false(사용자가 끔) = 항상 꺼짐. true/객체 = 모든 맵에서 켬. 없음(기본) = 개편 필드가 있는 맵만 자동으로 켬(auto:true), 나머지 맵은 기존 그대로
export function mapArtOpts(st, map = null) {
    const v = st?.mapArt;
    if (v === false) return null;
    if (v) return v === true ? { ...DEFAULTS } : { ...DEFAULTS, ...v };
    return mapHasArt(map) ? { ...DEFAULTS, auto: true } : null;
}

// 맵 데이터 props 정규화 -> [{key, x, y, anchor, variant, culture, scale, layer}] (좌표가 숫자가 아니거나 키가 없으면 제외)
export function normalizeProps(raw) {
    const list = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
    return list.map((p) => ({ ...p, key: p?.key ?? p?.kind ?? null, x: Number(p?.x), y: Number(p?.y) }))
        .filter((p) => p.key && Number.isFinite(p.x) && Number.isFinite(p.y));
}

// 통그림 정보 정규화(없거나 src 없으면 null). src 는 같은 출처 '/assets/' 경로만 허용(외부 URL·프로토콜 상대·상위 경로 거부)
export function normalizePainted(raw) {
    if (!raw || typeof raw !== 'object' || !raw.src) return null;
    const src = String(raw.src);
    if (!/^\/assets\/[\w\-./]+$/.test(src) || src.includes('..')) { console.warn('[mapArt] painted_bg.src 는 /assets/ 경로만 허용 -> 무시', src); return null; }
    const tp = Number(raw.tile_px ?? raw.tilePx);
    return { src: String(raw.src), tilePx: Number.isFinite(tp) && tp > 0 ? tp : 64, ox: Number(raw.ox) || 0, oy: Number(raw.oy) || 0, filter: raw.filter === 'nearest' ? 'nearest' : 'linear' };
}

// 키 해석: variant 가 있으면 '<key>_<variant>' 우선 -> '<key>' (없으면 null)
export function resolveKey(p, has) {
    if (p.variant != null && has(`${p.key}_${p.variant}`)) return `${p.key}_${p.variant}`;
    return has(p.key) ? p.key : null;
}

export const mapSeed = (map) => (map?.code ? [...String(map.code)].reduce((s, ch) => (s * 31 + ch.charCodeAt(0)) | 0, 7) : 7); // UnityGround v3 와 같은 시드

// compose.py place_village(rule 'v1') / place_village_v2(rule 'v2', 기본) 이식(같은 해시·확률·오프셋). 반환 = props 형식(칸 실수 좌표, 기준점 = manifest anchor 또는 아래 가운데)
// v2 = v1 결과 그대로 + 군락 보강: 1칸 집 뒤 작은 집(50%, 0.75배)·앞 모서리 소품(45%), 2칸 집 옆 소품(50%), 마을에 4방 인접한 평지 칸 바닥 데칼(35%)·건초(15%)
// tiles: 지형 코드 2차원 배열, items: tb_manifest.items. 데칼은 layer 'decal'(왼쪽 위 기준)
export function placeVillage(tiles, items, { seed = 7, culture = 'kr', rule = 'v2' } = {}) {
    const v2 = rule !== 'v1';
    const H = tiles.length; const W = tiles[0]?.length ?? 0;
    const h3 = tv3Hash;
    const cd = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y][x] : null);
    const pool = (fp) => Object.keys(items).filter((k) => items[k].group === 'house' && items[k].culture === culture && items[k].footprint?.[0] === fp[0] && items[k].footprint?.[1] === fp[1]).sort();
    const out = [];
    const obj = (key, cx, by, scale) => out.push({ key, x: cx / TB_PX, y: by / TB_PX, src: 'village', ...(scale ? { scale } : {}) }); // 아래 가운데 = (cx, by)
    const small = culture === 'kr' ? 'jars' : 'woodpile';
    const decal = (key, px, py) => out.push({ key, x: px / TB_PX, y: py / TB_PX, layer: 'decal', src: 'village' });
    const used = new Set();
    const id = (x, y) => `${x},${y}`;
    let wellDone = false;
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (cd(x, y) !== 'village' || used.has(id(x, y))) continue;
            const r = h3(x, y, seed + 5);
            const blk = [[x, y], [x + 1, y], [x, y + 1], [x + 1, y + 1]];
            if (r < 0.35 && blk.every(([a, b]) => cd(a, b) === 'village' && !used.has(id(a, b)))) {
                const p = pool([2, 2]);
                if (p.length) {
                    blk.forEach(([a, b]) => used.add(id(a, b)));
                    obj(p[Math.floor(h3(x, y, 9) * p.length)], (x + 1) * 32 + Math.floor(h3(x, y, 3) * 7) - 3, (y + 2) * 32 - 1);
                    decal('decal_path_a', x * 32 + 8, y * 32 + 40);
                    continue;
                }
            }
            if (cd(x + 1, y) === 'village' && !used.has(id(x + 1, y)) && r < 0.55) {
                const p = pool([2, 1]);
                if (p.length) {
                    used.add(id(x, y)); used.add(id(x + 1, y));
                    const cx = (x + 1) * 32 + Math.floor(h3(x, y, 3) * 7) - 3;
                    obj(p[Math.floor(h3(x, y, 11) * p.length)], cx, (y + 1) * 32 - 2 - Math.floor(h3(x, y, 4) * 4));
                    if (v2 && h3(x, y, 56) < 0.5) obj(h3(x, y, 57) < 0.5 ? small : 'haystack', cx + (h3(x, y, 58) < 0.5 ? -26 : 26), (y + 1) * 32 - 1);
                    continue;
                }
            }
            used.add(id(x, y));
            const jx = Math.floor(h3(x, y, 21) * 11) - 5; const jy = Math.floor(h3(x, y, 22) * 7) - 4;
            if (h3(x, y, 23) < 0.68) {
                const p = pool([1, 1]);
                if (!p.length) continue;
                if (h3(x, y, 24) < 0.35) decal('decal_path_a', x * 32 + jx + (jx < 0 ? 6 : -6), y * 32 + 12 + jy);
                const cx = x * 32 + 16 + jx; const by = (y + 1) * 32 + jy - 2;
                if (v2 && h3(x, y, 51) < 0.5) { const side = h3(x, y, 53) < 0.5 ? -1 : 1; obj(p[Math.floor(h3(x, y, 52) * p.length)], cx + side * 9, by - 9, 0.75); } // 뒤 작은 집(먼저 그려짐)
                obj(p[Math.floor(h3(x, y, 13) * p.length)], cx, by);
                if (v2 && h3(x, y, 54) < 0.45) { const side = h3(x, y, 53) < 0.5 ? -1 : 1; obj([small, 'haystack', culture === 'kr' ? 'stonewall_h' : 'fence_h'][Math.floor(h3(x, y, 55) * 3)], x * 32 + 16 - side * 11, (y + 1) * 32 - 1, 0.7); }
            } else if (!wellDone) {
                wellDone = true;
                obj(['kr', 'jp', 'cn'].includes(culture) ? 'well_kr' : 'well_eu', x * 32 + 16, (y + 1) * 32 - 6);
                decal('decal_yard_a', x * 32, y * 32 + 6);
            } else {
                const pick = Math.floor(h3(x, y, 31) * 4);
                if (pick === 0) {
                    decal('decal_field_a', x * 32, y * 32);
                    obj(culture === 'kr' ? 'stonewall_h' : 'fence_h', x * 32 + 16, (y + 1) * 32 - 1);
                } else if (pick === 1) {
                    obj(culture === 'kr' ? 'jars' : 'woodpile', x * 32 + 12, (y + 1) * 32 - 8);
                    obj('haystack', x * 32 + 24, (y + 1) * 32 - 2);
                } else if (pick === 2 && culture !== 'me') obj('barn', x * 32 + 16, (y + 1) * 32 - 2);
                else if (pick === 2) obj('jars', x * 32 + 16, (y + 1) * 32 - 8);
                else obj('tree_broad_2b', x * 32 + 16, (y + 1) * 32 - 4);
            }
        }
    }
    if (v2) { // 마을 바깥 1칸(4방 인접 평지): 밭·길·꽃 데칼, 가끔 건초 -> 군락 가장자리
        const vill = (x, y) => cd(x, y) === 'village';
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                if (cd(x, y) !== 'plain' || !(vill(x - 1, y) || vill(x + 1, y) || vill(x, y - 1) || vill(x, y + 1))) continue;
                if (h3(x, y, 61) < 0.35) decal(['decal_field_a', 'decal_path_b', 'decal_flowers_a'][Math.floor(h3(x, y, 62) * 3)], x * 32, y * 32);
                if (h3(x, y, 63) < 0.15) obj('haystack', x * 32 + 16, (y + 1) * 32 - 3);
            }
        }
    }
    return out;
}

// 성벽 W 칸 자동 배치(compose.py place_walls 이식): 오토타일 조각(시트 wall_<style>, 칸 32x44, 위로 12px 걸침) + 굽은/끝/교차 칸 망루(덩어리는 간격 규칙) + 성문 + 성 c 2x2 덩어리 본관.
// 입력: tiles(지형 코드), gates = [[x,y]|{x,y}](meta.gates, compose 의 G/g 기호 대신), castleRender = meta.castle_render
//   ('none' = 본관 생략, [{key,x,y,...}] 또는 {key,x,y} = 본관 대신 그 소품들, 없으면 compose 규칙의 keep_<style>).
// style: 'east'(kr·jp·cn) | 'west'(eu·me). 반환 = props 형식(오토타일 조각은 sheet/frame 필드)
export const WALL_SHEET = { w: 32, h: 44, cols: 8 };
// meta.wall_style -> 키트 오토타일 시트 이름(manifest sheets, 안아트 hybrid_walls_spec: wall_w_tuffeau 등) 또는 null.
// 'w_tuffeau' | 'wall_w_tuffeau' | 'at47_wall_w_tuffeau' 모두 같은 시트. 'east'/'west'(기존 패치 기본값)·없는 이름 = null -> 문화권 기본(wall_east/west) 그대로
// r6(2026-11-06) 추가 시트도 같은 규칙: m_mudbrick·m_limestone(32x56), m_mudbrick_low(32x44), i_redstone(32x56), i_redstone_low(32x44). 칸 높이는 manifest cell 그대로.
// 부두 시트(kind 'pier', pier_stone·pier_wood)는 성벽으로 쓰지 않는다(meta.pier_style 로 선택, pierSheetName)
export function wallSheetName(wallStyle, sheets) {
    if (typeof wallStyle !== 'string' || !sheets) return null;
    const s = wallStyle.replace(/^at47_/, '');
    const n = [s, `wall_${s}`].find((k) => k !== 'wall_east' && k !== 'wall_west' && !k.startsWith('pier_') && sheets[k]?.kind !== 'pier' && sheets[k]?.file && Array.isArray(sheets[k].cell));
    return n ?? null;
}
// meta.pier_style -> 부두(harbor h 칸) 오토타일 시트 이름(manifest sheets, kind 'pier') 또는 null(= 기본 나무 부두 TV3_PIER).
// 'stone' | 'pier_stone' | 'at47_pier_stone' 모두 pier_stone. 'wood'·없는 이름 = null
export function pierSheetName(pierStyle, sheets) {
    if (typeof pierStyle !== 'string' || !sheets) return null;
    const s = pierStyle.replace(/^at47_/, '').replace(/^pier_/, '');
    if (s === 'wood') return null;
    const k = `pier_${s}`;
    return sheets[k]?.file && Array.isArray(sheets[k].cell) ? k : null;
}
// 키트 성벽 시트(manifest sheets[*].kit)별 같은 색조 망루·성문 스프라이트(2026-11-07 강화면 k134: i_redstone 붉은 벽 위에 회색 tower_west·gate_west 가 얹혀 색이 어긋남).
//  tower = 망루 대신(towerScale 배율, 낱칸 기준) / gate = 가로 성문 2칸(gates 가로 연속 2칸당 1개, 낱칸은 gateScale1) / block = 외딴 2x2 W 덩어리를 성벽 조각 대신 이 스프라이트 1개로
//  tint = 전용 스프라이트가 없는 부분(세로 성문 등)의 기본 회색 스프라이트 곱 틴트. 키는 호출 측(MapArtLayer)이 텍스처 로드 여부로 거른다
//  towers:false = 망루를 아예 놓지 않음(실내 서고 L: 책장 벽 위 회색 망루 금지, 2026-11-08) / gateScale = 2칸 성문 배율(기본 1)
export const KIT_WALL_ART = {
    I: { tower: 'i_redstone_bastion', towerScale: 0.75, gate: 'i_redstone_gate', gateScale1: 0.75, block: 'i_redstone_bastion', tint: 0xffb8a4 },
    L: { towers: false, gate: 'l_door_arch', gateScale: 2 / 3, gateScale1: 0.5 }, // l_door_arch 96px -> 2칸 64px / 낱칸 48px. 세로 성문은 회색 기본(서고 맵은 가로 문 권장)
};
export const kitWallArtKeys = (kit) => { const a = KIT_WALL_ART[kit]; return a ? [...new Set([a.tower, a.gate, a.block].filter(Boolean))] : []; };
// sheet = { name, h, hasB } (키트 시트 지정 시. 없으면 문화권 기본 wall_<style>, 칸 높이 WALL_SHEET.h). hasB = 변형 시트 '<name>_b' 를 칸 해시로 ~50% 섞음
// towerGap = 덩어리·낱칸 망루 최소 간격(칸, 기본 3). 가는 벽의 모서리·교차·끝점·성문 옆 망루는 간격과 무관하게 유지
// kitArt = KIT_WALL_ART 항목(쓸 수 있는 키만 남긴 것) 또는 null(= 기존 회색 망루·성문)
export function placeWalls(tiles, { culture = 'kr', gates = null, castleRender = null, sheet = null, towerGap = 3, kitArt = null } = {}) {
    const H = tiles.length; const W = tiles[0]?.length ?? 0;
    const st = ['eu', 'me'].includes(culture) ? 'west' : 'east';
    const shName = sheet?.name ?? `wall_${st}`; const shH = Number(sheet?.h) > 0 ? Number(sheet.h) : WALL_SHEET.h;
    const cd = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? tiles[y][x] : null);
    const gset = new Set((Array.isArray(gates) ? gates : []).map((g) => (Array.isArray(g) ? `${g[0]},${g[1]}` : `${g?.x},${g?.y}`)));
    const isW = (x, y) => { const c = cd(x, y); return c == null || c === 'wall' || gset.has(`${x},${y}`); }; // 맵 밖 = 같은 무리, meta.gates 칸(c 등)도 성벽으로 연결
    // castle_render 에 이미 성문(gate_*) 항목이 있으면 그 문이 덮는 gates 칸은 엔진 성문을 건너뛴다(중복 방지).
    // 문 항목 기준점 = 아래 가운데(칸 단위): 가로 2칸 문(x=경계) / 세로 2칸 문(y=아래 칸 밑변)까지 덮는 것으로 본다
    const crGates = (castleRender && typeof castleRender === 'object' ? (Array.isArray(castleRender) ? castleRender : [castleRender]) : [])
        .filter((p) => typeof p?.key === 'string' && p.key.startsWith('gate_') && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y)));
    const crGateAt = (x, y) => crGates.some((p) => { const dx = Math.abs(Number(p.x) - (x + 0.5)); const dy = Number(p.y) - (y + 1); return dx <= 0.6 && dy >= -0.1 && dy <= 1.1; });
    const out = [];
    const D8 = [[0, -1, 1], [1, -1, 2], [1, 0, 4], [1, 1, 8], [0, 1, 16], [-1, 1, 32], [-1, 0, 64], [-1, -1, 128]];
    const norm = (m0) => { let m = m0; if (!((m & 1) && (m & 4))) m &= ~2; if (!((m & 16) && (m & 4))) m &= ~8; if (!((m & 16) && (m & 64))) m &= ~32; if (!((m & 1) && (m & 64))) m &= ~128; return m; };
    const MASKS = [...new Set(Array.from({ length: 256 }, (_, i) => norm(i)))].sort((a, b) => a - b);
    const maskAt = (x, y) => norm(D8.reduce((mm, [dx, dy, b]) => (isW(x + dx, y + dy) ? mm | b : mm), 0));
    const isStraight = (m) => { const o = [1, 4, 16, 64].map((b) => (m & b) > 0); return (o[0] && !o[1] && o[2] && !o[3]) || (!o[0] && o[1] && !o[2] && o[3]); };
    // 망루 배치(미리보기 paint_lib '탑 간격 3칸' 이식, 2026-11-06): 곧지 않은 W 칸 중
    //  - 필수 = 가는 벽(2x2 W 덩어리에 속하지 않는 칸)의 모서리·T/십자 교차·끝점, 그리고 성문에 4방 인접한 칸 -> 항상 망루(기존 그대로)
    //  - 간격 = 덩어리(2x2 이상, 맵 밖 = W) 칸·외딴 낱칸 -> 이미 놓인 망루와 체비셰프 거리 towerGap(기본 3) 이상일 때만(필수 먼저, 나머지는 행 순서)
    const gap = Number(towerGap) > 0 ? Number(towerGap) : 3;
    const thick = (x, y) => [[-1, -1], [0, -1], [-1, 0], [0, 0]].some(([ox, oy]) => [[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => isW(x + ox + a, y + oy + b)));
    // 키트 block: 맵 안에 외딴(둘레 12칸이 모두 맵 안·비성벽·비성문) 정확히 2x2 인 W 덩어리 -> 조각·망루 없이 block 스프라이트 1개(아래 가운데 = 덩어리 아래 변 가운데)
    const blocks = []; const blockSet = new Set();
    if (kitArt?.block) {
        const plainAt = (x, y) => { const c = cd(x, y); return c != null && c !== 'wall' && !gset.has(`${x},${y}`); };
        const isWall = (x, y) => cd(x, y) === 'wall' && !gset.has(`${x},${y}`);
        for (let y = 0; y + 1 < H; y++) {
            for (let x = 0; x + 1 < W; x++) {
                if (![[0, 0], [1, 0], [0, 1], [1, 1]].every(([a, b]) => isWall(x + a, y + b))) continue;
                let ok = true;
                for (let yy = y - 1; yy <= y + 2 && ok; yy++) for (let xx = x - 1; xx <= x + 2 && ok; xx++) { if (xx >= x && xx <= x + 1 && yy >= y && yy <= y + 1) continue; if (!plainAt(xx, yy)) ok = false; }
                if (!ok) continue;
                blocks.push([x, y]);
                [[0, 0], [1, 0], [0, 1], [1, 1]].forEach(([a, b]) => blockSet.add(`${x + a},${y + b}`));
            }
        }
    }
    const towers = []; const spaced = [];
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (cd(x, y) !== 'wall' || gset.has(`${x},${y}`) || blockSet.has(`${x},${y}`)) continue;
            const m = maskAt(x, y);
            if (isStraight(m)) continue;
            const n = [1, 4, 16, 64].filter((b) => m & b).length;
            const byGate = [[0, -1], [1, 0], [0, 1], [-1, 0]].some(([dx, dy]) => gset.has(`${x + dx},${y + dy}`));
            if (byGate || (n >= 1 && !thick(x, y))) towers.push([x, y]); else spaced.push([x, y]);
        }
    }
    spaced.forEach(([x, y]) => { if (towers.every(([tx, ty]) => Math.max(Math.abs(x - tx), Math.abs(y - ty)) >= gap)) towers.push([x, y]); });
    const towerSet = kitArt?.towers === false ? new Set() : new Set(towers.map(([x, y]) => `${x},${y}`)); // 키트가 망루 없음(서고 L)
    const tintOf = (o) => (kitArt?.tint != null ? { ...o, tint: kitArt.tint } : o);
    const late = []; // 키트 가로 성문: 옆 칸 성벽 조각보다 뒤에 그리도록(같은 정렬 키에서 삽입 순서) 맨 끝에 넣는다
    const gateUsed = new Set();
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            const isWallCell = cd(x, y) === 'wall'; const isGate = gset.has(`${x},${y}`);
            if (!isWallCell && !isGate) continue;
            if (blockSet.has(`${x},${y}`)) continue; // 키트 block 덩어리(아래에서 스프라이트 1개)
            const m = maskAt(x, y);
            const i = MASKS.indexOf(m);
            if (isWallCell) out.push({ sheet: sheet?.hasB && tv3Hash(x, y, 71) < 0.5 ? `${shName}_b` : shName, frame: i, x: (x * 32 + 16) / TB_PX, y: ((y + 1) * 32) / TB_PX, anchor: [16, shH], src: 'wall' }); // gates 의 c 칸 = 성벽 조각 없이 성문만
            const orth = [1, 4, 16, 64].map((b) => (m & b) > 0);
            if (isGate) {
                if (crGateAt(x, y) || gateUsed.has(`${x},${y}`)) continue;
                const hz = orth[1] && orth[3]; // 가로 성벽(동서 연결) = h
                if (kitArt?.gate && hz) {
                    // 오른쪽 칸도 가로 성문이면 2칸에 1개(가운데 = 두 칸 경계), 아니면 낱칸 배율
                    const pair = gset.has(`${x + 1},${y}`) && !crGateAt(x + 1, y) && cd(x + 1, y) != null;
                    if (pair) gateUsed.add(`${x + 1},${y}`);
                    late.push({ key: kitArt.gate, x: pair ? x + 1 : x + 0.5, y: y + 1, ...(pair ? (Number(kitArt.gateScale) > 0 ? { scale: Number(kitArt.gateScale) } : {}) : { scale: kitArt.gateScale1 ?? 0.75 }), src: 'wall' });
                } else out.push(tintOf({ key: `gate_${st}_${hz ? 'h' : 'v'}`, x: (x * 32 + 16) / TB_PX, y: ((y + 1) * 32 + 0.5) / TB_PX, src: 'wall' }));
            } else if (towerSet.has(`${x},${y}`)) out.push(kitArt?.tower ? { key: kitArt.tower, x: (x * 32 + 16) / TB_PX, y: (y + 1) + 0.4 / TB_PX, scale: kitArt.towerScale ?? 0.75, src: 'wall' } : tintOf({ key: `tower_${st}`, x: (x * 32 + 16) / TB_PX, y: ((y + 1) * 32 + 0.4) / TB_PX, src: 'wall' }));
        }
    }
    blocks.forEach(([x, y]) => out.push({ key: kitArt.block, x: x + 1, y: y + 2, src: 'wall' }));
    out.push(...late);
    if (castleRender === 'none') return out;
    if (castleRender && typeof castleRender === 'object') { (Array.isArray(castleRender) ? castleRender : [castleRender]).forEach((p) => { if (p?.key && Number.isFinite(Number(p.x)) && Number.isFinite(Number(p.y))) out.push({ ...p, x: Number(p.x), y: Number(p.y), src: 'castle' }); }); return out; }
    for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
            if (cd(x, y) === 'castle' && cd(x + 1, y) === 'castle' && cd(x, y + 1) === 'castle' && cd(x - 1, y) !== 'castle' && cd(x, y - 1) !== 'castle') out.push({ key: `keep_${st}`, x: ((x + 1) * 32) / TB_PX, y: ((y + 2) * 32) / TB_PX, src: 'castle' });
        }
    }
    return out;
}

// 마을 규칙이 쓰는 고정 소품·데칼 키(placeVillage v1/v2)
export const VILLAGE_FIXED_KEYS = ['well_kr', 'well_eu', 'decal_path_a', 'decal_path_b', 'decal_yard_a', 'decal_field_a', 'decal_flowers_a', 'stonewall_h', 'fence_h', 'jars', 'woodpile', 'haystack', 'barn', 'tree_broad_2b'];
export const villageKeys = (items, culture) => [...VILLAGE_FIXED_KEYS, ...Object.keys(items).filter((k) => items[k].group === 'house' && items[k].culture === culture)];
export const wallKeys = (items) => Object.keys(items).filter((k) => items[k].group === 'castle');
export const artCulture = (map, opts) => map?.culture ?? (Array.isArray(map?.props) ? null : map?.props?.culture) ?? opts?.culture ?? 'kr';
// 이 맵에 필요한 manifest 키(로드 범위). sheets = 필요한 오토타일 시트 이름
export function artNeeded(items, map, opts, sheetsDef = null) {
    const keys = new Set();
    if (opts?.props) normalizeProps(map?.props).forEach((p) => { if (p.variant != null && items[`${p.key}_${p.variant}`]) keys.add(`${p.key}_${p.variant}`); if (items[p.key]) keys.add(p.key); });
    const cr = map?.castleRender;
    if (cr && typeof cr === 'object') (Array.isArray(cr) ? cr : [cr]).forEach((p) => { if (items[p?.key]) keys.add(p.key); });
    const tiles = map?.tiles ?? [];
    const has = (code) => tiles.some((r) => (Array.isArray(r) ? r : []).includes(code));
    if (opts?.village && has('village')) villageKeys(items, artCulture(map, opts)).forEach((k) => { if (items[k]) keys.add(k); });
    const sheets = [];
    if (opts?.walls !== false && (has('wall') || has('castle'))) {
        wallKeys(items).forEach((k) => keys.add(k)); sheets.push('wall_east', 'wall_west');
        const ws = wallSheetName(map?.wallStyle, sheetsDef); if (ws) sheets.push(ws); // meta.wall_style 키트 시트(변형 file_b 는 로더가 '<이름>_b' 로 함께 받음)
        if (ws) kitWallArtKeys(sheetsDef[ws]?.kit).forEach((k) => { if (items[k]) keys.add(k); }); // 키트 같은 색조 망루·성문(KIT_WALL_ART)
    }
    const ps = has('harbor') ? pierSheetName(map?.pierStyle, sheetsDef) : null; if (ps) sheets.push(ps); // meta.pier_style 부두 시트(UnityGround 가 그림, 없으면 나무 부두)
    return { keys: [...keys], sheets };
}
