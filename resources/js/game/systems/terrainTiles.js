import { loaded, texKey } from '../assets.js';

// 지형 타일 선택(안아트 manifest.terrainMap 기준): 지형 코드 -> 후보 키, 변형은 좌표 해시로 고정 선택.
// - 변형은 기준 변형(첫 키)과 색 톤이 맞는 것만 섞는다(allowedKeys, 실측 색 비교). 톤이 맞는 변형 에셋이 오면 자동으로 다시 섞인다.
// - 조각형: 다리(h/v: 위아래가 물이면 가로, 좌우가 물이면 세로), 도로(이웃 도로·다리 연결로 직선/모서리/교차),
//   성벽·절벽(가로 조각만 제작됨, 세로 조각은 미제작 -> 같은 가로 조각 사용), 마을(변형 해시).
// - 설원·사막(snow_desert): a=설원, c·d=사막(b 얼음 호수는 QA 보완 필요라 제외). 맵 바이옴(map.biome==='desert')이 오면 사막, 아니면 설원.
// - 키 텍스처가 없으면 manifest 항목의 fallback 키, 그래도 없으면 null(호출 측이 기존 tileTexKey 폴백).
const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177; return ((h ^ (h >>> 16)) >>> 0); };
const WATERY = new Set(['water', 'shallows', 'swamp']);
const ROADISH = new Set(['road', 'bridge']);

function byCode() {
    const tm = loaded.terrainMap;
    if (!tm) return null;
    if (!loaded.terrainByCode) loaded.terrainByCode = Object.fromEntries(Object.values(tm).filter((e) => e?.code).map((e) => [e.code, e]));
    return loaded.terrainByCode;
}

// 실제 텍스처 키(없으면 fallback 사슬)
function resolve(scene, logical, depth = 0) {
    if (!logical || depth > 3) return null;
    const k = texKey(logical);
    if (scene.textures.exists(k)) return k;
    return resolve(scene, loaded.manifest?.[logical]?.fallback, depth + 1);
}

// 타일 색 측정(텍스처 키별 1회 캐시): 전체 평균색 + 가장자리 3텍셀 평균색. 측정 실패 시 null.
const colorCache = new Map();
export function tileColors(scene, key) {
    if (!key) return null;
    if (colorCache.has(key)) return colorCache.get(key);
    let res = null;
    try {
        const src = scene.textures.get(key).getSourceImage();
        const w = src.width; const h = src.height;
        const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(src, 0, 0);
        const d = ctx.getImageData(0, 0, w, h).data;
        const avg = [0, 0, 0]; const edge = [0, 0, 0]; let n = 0; let ne = 0;
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
                const i = (y * w + x) * 4;
                for (let c = 0; c < 3; c++) avg[c] += d[i + c];
                n += 1;
                if (x < 3 || y < 3 || x >= w - 3 || y >= h - 3) { for (let c = 0; c < 3; c++) edge[c] += d[i + c]; ne += 1; }
            }
        }
        res = { avg: avg.map((v) => v / n), edge: edge.map((v) => v / ne) };
    } catch { res = null; }
    colorCache.set(key, res);
    return res;
}
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
// 변형 허용 기준: 기준 변형(첫 키)과 평균색·가장자리색이 모두 이 거리 이내일 때만 섞는다(톤이 다른 변형을 섞으면 칸마다 명암 체크무늬가 됨).
// 2026-11 측정: plain a/b/c 평균 거리 약 30·25, water a/b 약 40, forest a/c 약 33 -> 제외. village a/b·wall a/b 는 5 이내 -> 허용.
const VARIANT_TOL = 12;
const allowedCache = new Map();
function allowedKeys(scene, code, keys) {
    const ck = `${code}|${keys.join(',')}`;
    if (allowedCache.has(ck)) return allowedCache.get(ck);
    const base = tileColors(scene, resolve(scene, keys[0]));
    const out = [keys[0]];
    keys.slice(1).forEach((k) => {
        const c = tileColors(scene, resolve(scene, k));
        if (base && c && dist(base.avg, c.avg) <= VARIANT_TOL && dist(base.edge, c.edge) <= VARIANT_TOL) out.push(k);
    });
    if (out.length < keys.length && typeof console !== 'undefined') console.info(`[terrain] ${code}: 톤이 다른 변형 ${keys.length - out.length}개 제외(체크무늬 방지)`);
    allowedCache.set(ck, out);
    return out;
}

function roadKey(keys, n) {
    const has = (s) => keys.find((k) => k.endsWith(`.${s}`));
    const cnt = [n.N, n.E, n.S, n.W].filter(Boolean).length;
    if (cnt >= 3) return has('cross');
    if (n.N && n.S) return has('v');
    if (n.E && n.W) return has('h');
    if (n.S && n.E) return has('corner'); // 아래 -> 오른쪽
    if (n.S && n.W) return has('corner_90');
    if (n.W && n.N) return has('corner_180');
    if (n.N && n.E) return has('corner_270');
    return n.N || n.S ? has('v') : has('h');
}

export function terrainTileKey(scene, map, x, y) {
    const table = byCode();
    const code = map.tiles[y]?.[x];
    const e = table?.[code];
    if (!e?.keys?.length) return null;
    const at = (dx, dy) => map.tiles[y + dy]?.[x + dx];
    let pick;
    if (code === 'road') {
        const R = (dx, dy) => ROADISH.has(at(dx, dy));
        const n = { N: R(0, -1), E: R(1, 0), S: R(0, 1), W: R(-1, 0) };
        // 폭 2칸 이상 도로: 대각선까지 도로면 내부/가장자리 -> 더 긴 방향의 직선(십자 격자 방지)
        const run = (dx, dy) => { let k = 1; while (R(dx * k, dy * k) && k < 32) k += 1; return k - 1; };
        const thickH = (R(1, -1) || R(1, 1) || R(-1, -1) || R(-1, 1));
        if ((n.N && n.S && n.E && n.W && R(1, 1) && R(-1, -1)) || ([n.N, n.E, n.S, n.W].filter(Boolean).length === 3 && thickH)) {
            const hLen = run(1, 0) + run(-1, 0);
            const vLen = run(0, 1) + run(0, -1);
            pick = e.keys.find((k) => k.endsWith(hLen >= vLen ? '.h' : '.v'));
        } else pick = roadKey(e.keys, n);
    } else if (code === 'bridge') {
        const vertical = WATERY.has(at(-1, 0)) || WATERY.has(at(1, 0)) || (ROADISH.has(at(0, -1)) && ROADISH.has(at(0, 1)));
        const horizontal = WATERY.has(at(0, -1)) || WATERY.has(at(0, 1));
        const isV = vertical && !horizontal;
        const pool = e.keys.filter((k) => (isV ? /\.v_/ : /\.h_/).test(k));
        // 같은 다리(연속 구간)는 한 가지 변형으로 통일: 구간 시작 칸 기준 해시(칸마다 h_a/h_b 가 섞이던 문제)
        let sx = x; let sy = y;
        if (isV) { while (at(0, sy - y - 1) === 'bridge' && y - sy < 32) sy -= 1; } else { while (at(sx - x - 1, 0) === 'bridge' && x - sx < 32) sx -= 1; }
        const p = pool.length ? pool : e.keys;
        pick = p[hash(sx, sy) % p.length];
    } else if (code === 'snow_desert') {
        const desert = map.biome === 'desert';
        const pool0 = e.keys.filter((k) => (desert ? /\.(c|d)$/ : /\.a$/).test(k));
        const pool = allowedKeys(scene, `${code}.${desert ? 'desert' : 'snow'}`, pool0.length ? pool0 : e.keys);
        pick = pool[map.smooth !== false ? (hash(Math.floor(x / 3), Math.floor(y / 3)) % 4 ? 0 : hash(x, y) % pool.length) : hash(x, y) % pool.length];
    } else {
        // 톤이 맞는 변형만 사용(allowedKeys). 매끄럽게(기본): 기준 변형 위주 + 3x3 블록 단위로 드물게(약 1/4) 다른 변형 -> 칸 단위 체크무늬 없음.
        // 격자 모드: 허용 변형을 칸별 해시로.
        const pool = allowedKeys(scene, code, e.keys);
        if (pool.length === 1) pick = pool[0];
        else if (map.smooth !== false) {
            const hb = hash(Math.floor(x / 3), Math.floor(y / 3));
            pick = hb % 4 ? pool[0] : pool[1 + (hb >>> 2) % (pool.length - 1)];
        } else pick = pool[hash(x, y) % pool.length];
    }
    return resolve(scene, pick) ?? resolve(scene, e.keys[0]);
}

// 미리보기 칸 크기 정수 배율(unity32 전용): fit(폭 맞춤 칸 크기, 월드 단위)을 백킹 px 가 32*n 이 되도록 내림한다(tw = 32n/u).
// 폭 맞춤 우선: n<1 이거나 내림 결과가 fit 의 minRatio 미만이면(지나치게 작아짐) fit 그대로(축소 LINEAR 경로). 반환 {tw, snapped}
export function u32SnapTile(fit, u, unity32, minRatio = 0.8) {
    if (!unity32 || !(u > 0) || !(fit > 0)) return { tw: fit, snapped: false };
    const n = Math.floor((fit * u) / 32);
    const tw = (32 * n) / u;
    if (n < 1 || tw < fit * minRatio) return { tw: fit, snapped: false };
    return { tw, snapped: true };
}
