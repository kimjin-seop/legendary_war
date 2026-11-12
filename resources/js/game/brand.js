import { L } from './layout.js';
import { makeText } from './ui/common.js';
import { CSS } from './theme.js';
import { settings } from './settings.js';
import { withVer } from './assetVersion.js';
import { loaded } from './assets.js';

// 「레전드리 워」 브랜드 로고(안아트 public/assets/brand/, 사양 brand_spec.json · 경로 manifest_fragment.json → manifest.json brand.* 병합).
// manifest 일반 로더(assets.js)는 brand.* 를 건너뛴다(파비콘·앱 아이콘·og 이미지까지 일괄 로드 방지). 필요한 변형만 여기서 지연 로드.
// Boot(로딩 화면 로고)는 manifest 를 받기 전이라 경로를 상수로 둔다(manifest_fragment.json 의 path 와 동일하게 유지).
// 텍스처 키: brand_<이름>[_15|_3] (사양 권장 접두). 로딩 실패 시 사용처는 텍스트 폴백('레전드리 워').
export const BRAND_TITLE = '레전드리 워';
export const BRAND_SUB = 'LEGENDARY WAR';
const DIR = '/assets/brand/';
// [파일 기본 이름, @3x 원본 크기(px)] — 비율 유지(늘리기·누르기 금지)에만 쓴다
const SCALED = { logo_h: [1848, 477], logo_stack: [1291, 1108], logo_wordmark: [1291, 415], logo_wordmark_title: [1348, 385] };
const SMALL = { 32: [190, 35], 64: [382, 70], 96: [575, 105] };
// 새 로고 2종(사용자 2026-11-04, 안아트 투명 WebP): main = 세로형 1086x1448(사자 깃발+검+현판, 타이틀·로그인·로딩) / header = 가로 현판 2000x667(로비 상단 좌측).
//  출처 = 아래 경로 상수(Boot 는 manifest 전이라 필요) > manifest ui.logo.main / ui.logo.header. 둘 다 없으면 기존 brand 세트 그대로(교체 전 동작 동일)
// 안아트 2026-11-04 확정(manifest_fragment_logo.json): main 768x1024(원본 1086x1448 축소, 타이틀·로그인·로딩이 같은 파일 1장 공유 = 중복 로드 없음),
//  header 600x200 + @2x 1000x333(표시 높이 x 백킹 배율이 200px 를 넘으면 @2x)
export const LOGO_FILES = {
    main: { path: '/assets/ui/logo_main.webp', size: [768, 1024] },
    // 상단 바 로고(안아트 2026-11-04 퀘스트 시안 세트: ui.logo.topbar = 글자 일체형 현판 216x72 + @2x 432x144). 이전 header 600x200 은 교체
    header: { path: '/assets/ui/logo_topbar.webp', size: [216, 72], x2: { path: '/assets/ui/logo_topbar@2x.webp', h: 144 } },
    // 좁은 화면용 문장(ui.logo.emblem 67x72 + @2x 134x144)
    emblem: { path: '/assets/ui/logo_emblem.webp', size: [67, 72], x2: { path: '/assets/ui/logo_emblem@2x.webp', h: 144 } },
};
const LOGO_SIZE = { main: [768, 1024], header: [216, 72], emblem: [67, 72] };
function logoSrc(kind, dispH = 0) {
    const c = LOGO_FILES[kind];
    const e = c?.path ? c : loaded.manifest?.[`ui.logo.${kind}`];
    if (!e?.path) return null;
    const size = Array.isArray(e.size) && e.size.length === 2 ? e.size : LOGO_SIZE[kind];
    const hi = !!c?.x2?.path && dispH * L.u > size[1]; // 표시 높이 x 백킹 배율이 1x 높이를 넘으면 @2x(header·emblem)
    const p = String(hi ? c.x2.path : e.path);
    return { key: `brand_logo_${kind}_new${hi ? '_2x' : ''}`, url: withVer(p.startsWith('/') ? p : `/${p}`), ratio: size[1] / size[0] };
}
export const mainLogoOn = () => !!logoSrc('main');
// 헤더(가로 현판) 로고 변형(dispH = 표시 높이, 해상도 선택용): 없으면 null(호출 측 = 기존 소형 로고)
export const brandHeader = (dispH = 0) => logoSrc('header', dispH);
// 좁은 화면 문장 로고(dispH = 표시 높이): 없으면 null(호출 측 = 기존 소형 로고)
export const brandEmblem = (dispH = 0) => logoSrc('emblem', dispH);

// 표시 크기(설계 단위)로 필요한 해상도 변형 결정: 백킹 픽셀 폭이 @1.5x 파일 폭 이하면 @1.5x, 아니면 @3x
// maxH 를 주면 비율로 줄어든 실제 표시 폭 기준
// logo_stack 은 세로 화면에서 로딩 화면·타이틀이 같은 파일을 쓰도록 두 상자 중 큰 표시 폭으로 한 번에 판정한다(@1.5x/@3x 중복 로드 방지)
export function brandVariant(name, maxW, maxH = Infinity) {
    if (name === 'logo_h' || name === 'logo_stack') { const mv = logoSrc('main'); if (mv) return mv; } // 세로형 메인 로고 한 장(해상도 변형 없음)
    const [w3, h3] = SCALED[name];
    let dispW = Math.min(maxW, maxH * (w3 / h3));
    if (name === 'logo_stack' && L.portrait) { const t = titleDims(); dispW = Math.max(dispW, Math.min(t.maxW, t.maxH * (w3 / h3))); }
    const hi = dispW * L.u > w3 / 2;
    return { key: `brand_${name}_${hi ? '3' : '15'}`, url: withVer(`${DIR}${name}@${hi ? '3x' : '1.5x'}.png`), ratio: h3 / w3 };
}

// 로딩 화면(Preload) 세로형 로고 상자: Boot 에서 미리 받고 Preload 에서 같은 상자로 그린다. 사양 최소 높이 120 CSS px
export function loadingLogoBox() {
    const minH = 120 / (L.ui * 1.5); // CSS px -> 단위
    const maxH = Math.max(minH, Math.min(L.lh * 0.3, 240));
    const maxW = Math.min(L.lw - 48, 320);
    return { maxW, maxH, v: brandVariant('logo_stack', maxW, maxH) };
}

// 타이틀 메인 로고: 가로 화면 logo_h(폭 min(화면폭 x 0.62, 1100 CSS px)), 세로 화면 logo_stack.
// 영역: 위 안전 여백 ~ 화면 40%(세로)/42%(가로). 낮은 화면(가로 폰)은 메뉴 버튼 4개(68단위씩)+안내 줄 자리를 먼저 확보하고 남는 높이만 쓴다.
// 반환 { maxW, maxH, cy(로고 중심 y), v }
function titleDims() {
    const cssToUnit = 1 / (L.ui * 1.5);
    const top = L.safe.t + 24;
    const area = L.lh * (L.portrait ? 0.4 : 0.42) - top;
    const room = L.lh - L.safe.b - 16 - (4 * 68 + 60) - top - 10;
    const minH = (L.portrait ? 120 : 48) * cssToUnit; // 사양 최소 높이(stack 120 / h 48 CSS px)
    const maxH = Math.max(minH, Math.min(area, room));
    const maxW = L.portrait ? Math.min(L.lw * 0.7, 420) : Math.min(L.lw * 0.62, 1100 * cssToUnit);
    return { top, area, room, maxH, maxW };
}
export function titleLogoBox() {
    const name = L.portrait ? 'logo_stack' : 'logo_h';
    // 세로형 메인 로고 + 가로 화면에서 위쪽 영역이 낮으면(가로 폰 등: 메뉴 자리를 뺀 높이 < 200) 왼쪽에 화면 높이 기준으로 세우고 메뉴는 오른쪽(side, menuX = 메뉴 중심 x)
    if (mainLogoOn() && !L.portrait) {
        const d = titleDims();
        if (Math.min(d.area, d.room) < 200) {
            const maxH = L.lh - L.safe.t - L.safe.b - 24; const maxW = L.lw * 0.42 - 16;
            const v = brandVariant(name, maxW, maxH);
            return { maxW, maxH, cy: L.safe.t + 12 + maxH / 2, cx: L.safe.l + 8 + L.lw * 0.21, side: true, menuX: L.lw * 0.71, v };
        }
    }
    const { top, area, room, maxH, maxW } = titleDims();
    const v = brandVariant(name, maxW, maxH);
    const h = Math.min(maxH, maxW * v.ratio);
    return { maxW, maxH, cy: top + (room >= area ? Math.max(h, area) / 2 : h / 2), v };
}
// 소형 로고: 표시 높이(단위) x 백킹 배율로 가장 가까운 상위 파일(h32/h64/h96)
export function brandSmall(dispH) {
    const need = dispH * L.u;
    const h = need <= 35 ? 32 : need <= 70 ? 64 : 96;
    return { key: `brand_logo_small_h${h}`, url: withVer(`${DIR}logo_small_h${h}.png`), ratio: SMALL[h][1] / SMALL[h][0] };
}

const failed = new Set();
// 로더에 미리 넣기(preload 단계). 이미 있거나 실패한 키는 건너뜀
export function queueBrand(scene, v) {
    if (!v || failed.has(v.key) || scene.textures.exists(v.key)) return;
    const onErr = (file) => { if (file?.key === v.key) { failed.add(v.key); console.warn(`[brand] 로고 로드 실패(텍스트 폴백): ${v.url}`); } };
    scene.load.on('loaderror', onErr);
    scene.load.once('complete', () => scene.load.off('loaderror', onErr));
    scene.load.image(v.key, v.url);
}

// 로고 배치: 텍스처가 있으면 이미지, 없으면 텍스트 폴백을 먼저 그리고 지연 로드 후 교체(실패하면 텍스트 유지).
// lazy=false: 지연 로드하지 않고 폴백만(로더가 이미 도는 preload 단계용).
// box: 표시 폭/높이 상한(단위). 비율은 파일 비율 고정. 반환 { obj, w, h } (obj 는 교체될 수 있음 → onReady 로 받음)
export function addBrandLogo(scene, v, x, y, { maxW, maxH, origin = [0.5, 0.5], fallbackSize = 48, fallbackSub = false, intro = false, lazy = true, onReady } = {}) {
    let w = maxW;
    let h = w * v.ratio;
    if (maxH && h > maxH) { h = maxH; w = h / v.ratio; }
    const place = (obj) => { obj.setOrigin(origin[0], origin[1]); onReady?.(obj); if (intro) introTween(scene, obj); return obj; };
    const image = () => place(scene.add.image(x, y, v.key).setDisplaySize(w, h));
    if (scene.textures.exists(v.key)) return { obj: image(), w, h };
    const size = Math.max(14, Math.min(fallbackSize, h * 0.5));
    const fb = scene.add.container(x, y);
    const t1 = makeText(scene, 0, fallbackSub ? -size * 0.35 : 0, BRAND_TITLE, { size, heading: true, color: CSS.text, origin: [0.5, 0.5] });
    fb.add(t1);
    if (fallbackSub) fb.add(makeText(scene, 0, size * 0.55, BRAND_SUB, { size: Math.max(12, size * 0.32), heading: true, color: CSS.accent, origin: [0.5, 0.5] }));
    // 컨테이너 origin 은 없으므로 상하/좌우 정렬을 위치로 보정
    fb.setPosition(x + (0.5 - origin[0]) * w, y + (0.5 - origin[1]) * h);
    onReady?.(fb);
    if (!lazy || failed.has(v.key)) return { obj: fb, w, h };
    const onDone = (key) => {
        if (key !== v.key || !fb.scene) return;
        cleanup();
        fb.destroy();
        image();
    };
    const onErr = (file) => { if (file?.key !== v.key) return; failed.add(v.key); cleanup(); console.warn(`[brand] 로고 로드 실패(텍스트 폴백): ${v.url}`); };
    const cleanup = () => { scene.load.off('filecomplete', onDone); scene.load.off('loaderror', onErr); };
    scene.load.on('filecomplete', onDone);
    scene.load.on('loaderror', onErr);
    scene.events.once('shutdown', cleanup);
    scene.load.image(v.key, v.url);
    if (!scene.load.isLoading()) scene.load.start();
    return { obj: fb, w, h };
}

// 은은한 등장: 세션 첫 표시만(레이아웃 재시작마다 반복하지 않음), 효과 '끄기'면 생략
let introDone = false;
function introTween(scene, obj) {
    if (introDone || settings.get().fxLevel === 2) return;
    introDone = true;
    const y = obj.y;
    obj.setAlpha(0).setY(y + 10);
    scene.tweens.add({ targets: obj, alpha: 1, y, duration: settings.get().fxLevel === 1 ? 300 : 900, ease: 'Cubic.easeOut' });
}
