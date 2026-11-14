import { settings } from './settings.js';

// 반응형 레이아웃 시스템.
// - 설계 단위(unit): 기준 해상도 1920x1080 에서 1 unit = 1.5px (= 기존 720 기준 좌표계). 모든 UI/월드 좌표는 unit 이다.
// - 카메라 zoom = L.u (unit -> 백킹 픽셀). 백킹 캔버스는 (CSS 크기 x R). R 은 DPR/그래픽 품질로 결정하며
//   하한 CSS 1px = 백킹 1px(dpr<1 이면 dpr), 상한 4K(3840). CSS 크기는 뷰포트에 맞춘다(Scale NONE + zoom 1/R 로 레터박스 없음).
export const BASE = { w: 1920, h: 1080 };
export const UNIT = 1.5;
export const QUALITY = [
    { label: '높음', q: 1 },
    { label: '보통', q: 0.75 },
    { label: '낮음', q: 0.5 },
];

export const L = {
    cssW: 1280, cssH: 720, R: 1, bw: 1920, bh: 1080, u: 1.5, ui: 1,
    lw: 1280, lh: 720, portrait: false, cls: 'desktop', dense: false, short: false,
    safe: { t: 0, r: 0, b: 0, l: 0 },
};
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function readSafe(cssPerUnit) {
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;top:0;left:0;visibility:hidden;pointer-events:none;'
        + 'padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const px = (v) => (parseFloat(v) || 0) / cssPerUnit;
    const safe = { t: px(cs.paddingTop), r: px(cs.paddingRight), b: px(cs.paddingBottom), l: px(cs.paddingLeft) };
    probe.remove();
    return safe;
}

export function computeLayout(cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const long = Math.max(cssW, cssH);
    const short = Math.min(cssW, cssH);
    const q = QUALITY[settings.get().quality].q;
    // R(백킹 px / CSS px) = DPR x 품질. (2026-11 도트 선명도) 예전 하한 '최소 1920x1080급'(BASE.w*q/long)은 1280x720 등에서 R=1.5 비정수로
    // 백킹을 CSS 축소(bilinear)시켜 32px 도트가 뭉개졌다 -> 하한을 min(1, dpr)(= CSS 1px 당 백킹 1px 이상)로 바꿔 품질 '높음'이면 백킹 = 디바이스 px(무리샘플).
    // 상한 4K(3840) 유지(초대형 화면만 비정수가 됨 -> applyCanvasRendering 이 auto 보간으로 둔다).
    const R = clamp(dpr * q, Math.min(1, dpr), 3840 / long);
    const ui = clamp(short / BASE.h, 0.6, 2);
    const cssPerUnit = ui * UNIT;
    const u = cssPerUnit * R;
    const bw = Math.round(cssW * R);
    const bh = Math.round(cssH * R);
    Object.assign(L, {
        cssW, cssH, R, bw, bh, u, ui,
        lw: bw / u, lh: bh / u,
        portrait: cssH > cssW,
        cls: short < 600 ? 'phone' : short < 1100 ? 'tablet' : 'desktop',
        dense: bh / u < 600,
        // 짧은 높이 모드(가로 폰·낮은 창, 2026-11-04 docs/PLAN_LANDSCAPE_PHONE.md): 가로이면서 논리 높이 < 560. 1280x720(720)·세로 폰(portrait)은 false = 기존 배치 그대로
        short: cssW >= cssH && bh / u < 560,
        safe: readSafe(cssPerUnit),
    });
    return L;
}

// 호스트 요소 크기로 레이아웃 적용. 크기/품질이 바뀐 경우에만 'layout' 이벤트를 발행한다.
export function applyLayout(game, el) {
    const prev = `${L.bw}x${L.bh}@${L.R.toFixed(3)}`;
    computeLayout(el.clientWidth || window.innerWidth, el.clientHeight || window.innerHeight);
    if (`${L.bw}x${L.bh}@${L.R.toFixed(3)}` === prev) return false;
    game.scale.setZoom(1 / L.R);
    game.scale.resize(L.bw, L.bh);
    // Phaser 4.2.1 ScaleManager(NONE): resize() 는 zoom !== 1 일 때만 canvas style 크기를 갱신하고, setZoom() 은 resize 전(옛 크기)으로 style 을 쓴다.
    // -> R=1(dpr1·품질 높음)에서 창 크기를 바꾸면 백킹은 새 크기인데 CSS 크기는 옛 값으로 남아 잘렸다(2026-11-02 강화면 b9). CSS 크기를 직접 맞춘다.
    const cv = game.canvas;
    if (cv) { cv.style.width = `${L.bw / L.R}px`; cv.style.height = `${L.bh / L.R}px`; }
    syncInputScale(game);
    applyCanvasRendering(game);
    game.events.emit('layout', L);
    return true;
}

// 입력 좌표 배율 동기화: Phaser updateBounds() 는 canvasBounds 만 갱신하고 displayScale(CSS px -> 게임 px)은 refresh() 안에서만 다시 계산한다.
// 위에서 CSS 크기를 refresh 이후에 직접 바꾸므로 displayScale 이 직전 크기 기준으로 남아 클릭이 한 단계 늦게 어긋났다(2026-11-02 강화면 4차 High).
// 같은 프레임에서 새 CSS 크기 기준으로 다시 계산한다(RESIZE 이벤트 재발행 없이).
export function syncInputScale(game) {
    const sm = game?.scale;
    if (!sm) return;
    sm.updateBounds();
    const b = sm.canvasBounds;
    if (b.width > 0 && b.height > 0) sm.displayScale.set(sm.baseSize.width / b.width, sm.baseSize.height / b.height);
}

// 캔버스 CSS 보간(2026-11 도트 선명도): 백킹 -> 디바이스 배율(dpr / R)이 정수(1x·2x)면 image-rendering: pixelated.
//  - 1x(품질 높음): 백킹 = 디바이스 px 라 사실상 리샘플이 없고, CSS 크기 반올림 오차로 생기는 0.x% 배율에서도 bilinear 번짐이 없다(텍스트·초상화 영향 없음).
//  - 2x(품질 낮음 등): 도트가 균일 2배로 커진다(텍스트도 2배 블록 — 저품질 모드 한정 감수).
//  - 비정수(품질 보통 1.33x, 4K 상한 초과 화면): pixelated 면 픽셀 폭이 들쭉날쭉하고 텍스트가 깨지므로 auto(보간) 유지.
// Phaser pixelArt 는 쓰지 않는다(전체 텍스처 NEAREST 가 돼 축소 표시되는 초상화·일러스트에 모아레). 도트 텍스처는 각자 NEAREST(UnityGround 등).
export function applyCanvasRendering(game) {
    const cv = game?.canvas;
    if (!cv) return;
    const dpr = window.devicePixelRatio || 1;
    const ratio = dpr / (L.R || 1);
    const crisp = ratio >= 0.999 && Math.abs(ratio - Math.round(ratio)) < 0.01;
    cv.style.imageRendering = crisp ? 'pixelated' : 'auto';
    L.crisp = crisp;
}

// resize/회전 감시(디바운스 150ms). 해제 함수 반환.
export function watchLayout(game, el) {
    let timer = 0;
    const run = () => { clearTimeout(timer); timer = setTimeout(() => applyLayout(game, el), 150); };
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(run) : null;
    ro?.observe(el);
    window.addEventListener('resize', run);
    window.addEventListener('orientationchange', run);
    const offSettings = settings.subscribe(run); // 그래픽 품질 변경 반영
    return () => {
        clearTimeout(timer);
        ro?.disconnect();
        window.removeEventListener('resize', run);
        window.removeEventListener('orientationchange', run);
        offSettings();
    };
}

// 씬 공통: 레이아웃 변경 시 씬 재시작(상태는 store 등 씬 밖에 있으므로 보존됨)
export function relayoutOnChange(scene, getData = () => undefined) {
    let waiting = false;
    const run = () => {
        // 손가락/마우스가 눌린 상태에서는 재시작하지 않는다(탭 누락 방지): 떼어진 뒤에 적용
        const down = scene.input.manager.pointers.some((p) => p.isDown);
        if (down) {
            if (!waiting) { waiting = true; scene.input.once('pointerup', () => { waiting = false; setTimeout(run, 60); }); }
            return;
        }
        scene.scene.restart(getData());
    };
    scene.game.events.on('layout', run);
    scene.events.once('shutdown', () => scene.game.events.off('layout', run));
}

// 카메라 zoom 으로 설계 단위 좌표계를 만든다(원점 좌상단).
export function setupCamera(scene, bg) {
    const cam = scene.cameras.main;
    // 원점(0.5) 기준 줌 + 스크롤 보정: 설계 단위 (0,0)이 화면 좌상단, worldView(컬링 영역)도 [0, lw] 로 일치한다.
    cam.setSize(L.bw, L.bh);
    cam.setOrigin(0.5, 0.5).setZoom(L.u).setScroll((L.lw - L.bw) / 2, (L.lh - L.bh) / 2);
    cam.roundPixels = true;
    if (bg) cam.setBackgroundColor(bg);
    return cam;
}

// 성능 보호: 평균 45fps 미만이 2초 지속되면 그래픽 품질을 한 단계 낮춘다(최소 낮음, 15초 쿨다운).
// 하향은 세션 한정(settings.setAutoQuality: 저장 안 함 — 새로고침하면 사용자 선택값으로 돌아간다).
// 복귀: 하향 상태에서 55fps 이상이 10초 지속되면 한 단계씩 사용자 선택값 쪽으로 올린다.
//  올린 뒤 다시 하향되는 진동을 막기 위해 복귀는 세션당 RECOVER_MAX 회까지만(이후는 하향 유지).
const RECOVER_MAX = 2;
// 프레임 상한 판정(iOS 저전력 모드 30fps 등): 최근 프레임 간격(rawDelta) 평균이 30Hz(33.3ms) 근처이고 분산이 작으면
//  '기기가 30fps 로 묶인 안정 상태'로 보고 저하로 치지 않는다(품질을 낮춰도 30fps 상한은 그대로라 품질만 손해).
const CAP_N = 60;
function capped30(buf, n) {
    if (n < 30) return false;
    let sum = 0; for (let i = 0; i < n; i++) sum += buf[i];
    const mean = sum / n;
    if (mean < 30 || mean > 37) return false;
    let v = 0; let spikes = 0;
    for (let i = 0; i < n; i++) { const d = buf[i] - mean; v += d * d; if (buf[i] > 45) spikes += 1; }
    return Math.sqrt(v / n) < 4 && spikes <= n * 0.05; // 표준편차 4ms 미만 + 긴 프레임(45ms 초과) 5% 이하
}
export function startPerfGuard(game) {
    let low = 0;
    let high = 0;
    let recovered = 0;
    let cooldownUntil = 0;
    let lastInput = performance.now();
    const touch = () => { lastInput = performance.now(); };
    ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'wheel'].forEach((e) => window.addEventListener(e, touch, { passive: true }));
    const dts = new Float32Array(CAP_N); let dtI = 0; let dtN = 0;
    const onStep = () => { const d = game.loop.rawDelta; if (d > 0 && d < 1000) { dts[dtI] = d; dtI = (dtI + 1) % CAP_N; if (dtN < CAP_N) dtN += 1; } };
    game.events.on('step', onStep);
    const id = setInterval(() => {
        if (document.hidden) { low = 0; high = 0; dtN = 0; dtI = 0; return; }
        const fps = game.loop.actualFps;
        low = fps > 1 && fps < 45 && !capped30(dts, dtN) ? low + 1 : 0;
        const q = settings.get().quality;
        const userQ = settings.userQuality();
        high = q > userQ && fps >= 55 ? high + 1 : 0;
        // 하향/복귀는 레이아웃 재구성을 동반하므로 입력이 2초 이상 없을 때만 적용한다(입력 중 탭 누락 방지)
        const idle = performance.now() - lastInput > 2000 && !game.input.activePointer.isDown;
        if (!idle || performance.now() <= cooldownUntil) return;
        if (low >= 4) {
            if (q < QUALITY.length - 1) {
                settings.setAutoQuality(q + 1);
                console.warn('[perf] 프레임 저하로 그래픽 품질 하향(이번 세션만):', QUALITY[q + 1].label);
            }
            cooldownUntil = performance.now() + 15000;
            low = 0; high = 0;
        } else if (high >= 20 && recovered < RECOVER_MAX) {
            recovered += 1;
            settings.setAutoQuality(q - 1);
            console.warn('[perf] 프레임 회복으로 그래픽 품질 복귀:', QUALITY[q - 1].label);
            cooldownUntil = performance.now() + 15000;
            low = 0; high = 0;
        }
    }, 500);
    return () => {
        clearInterval(id);
        game.events.off('step', onStep);
        ['pointerdown', 'pointermove', 'pointerup', 'keydown', 'wheel'].forEach((e) => window.removeEventListener(e, touch));
    };
}
