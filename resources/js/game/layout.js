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

// R 결정(2026-11-14 성능 1단계: DPR 1 화면에서도 품질 조절이 실제로 R 을 낮추게).
//  예전: clamp(dpr x q, min(1, dpr), 4K) -> DPR 1 모니터는 하한 1 때문에 보통·낮음이 모두 R=1(품질 설정·자동 하향이 무효).
//  지금:
//   높음(q 1)  : 예전과 같음(백킹 = 디바이스 px, 상한 4K)
//   보통(q .75): 예전 값(하한 min(1,dpr) 유지 -> 1080p DPR1 은 그대로 R=1·도트 선명) + 백킹 px 상한 MED_BACKING_PX(2560x1440).
//               1440p 초과 DPR1 대형 모니터·초광폭에서만 R<1(이 경우 비정수 배율이라 applyCanvasRendering 이 auto 보간)
//   낮음(q .5) : dpr x 0.5(하한 없음) -> 디바이스 대비 정확히 2배 = 정수 배율이라 crisp(pixelated) 규칙 그대로 유지
//  롤백: 콘솔 settings.set({ rLegacy: true }) (즉시 레이아웃 재계산)
const MED_BACKING_PX = 2560 * 1440;
function resolveR(dpr, q, cssW, cssH, long) {
    const hi = 3840 / long;
    if (settings.get().rLegacy === true || q >= 1) return clamp(dpr * q, Math.min(1, dpr), hi);
    if (q <= 0.5) return clamp(dpr * q, 0.25, hi);
    let R = clamp(dpr * q, Math.min(1, dpr), hi);
    const cap = Math.sqrt(MED_BACKING_PX / Math.max(1, cssW * cssH));
    if (R > cap) R = Math.max(cap, dpr * 0.5);
    return R;
}

export function computeLayout(cssW, cssH) {
    const dpr = window.devicePixelRatio || 1;
    const long = Math.max(cssW, cssH);
    const short = Math.min(cssW, cssH);
    const q = QUALITY[settings.get().quality].q;
    // R(백킹 px / CSS px) = DPR x 품질. (2026-11 도트 선명도) 예전 하한 '최소 1920x1080급'(BASE.w*q/long)은 1280x720 등에서 R=1.5 비정수로
    // 백킹을 CSS 축소(bilinear)시켜 32px 도트가 뭉개졌다 -> 하한을 min(1, dpr)(= CSS 1px 당 백킹 1px 이상)로 바꿔 품질 '높음'이면 백킹 = 디바이스 px(무리샘플).
    // 상한 4K(3840) 유지(초대형 화면만 비정수가 됨 -> applyCanvasRendering 이 auto 보간으로 둔다).
    const R = resolveR(dpr, q, cssW, cssH, long);
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

// 텍스처 해상도 선택 기준(2026-11-14 성능 1단계): 1 설계 단위(u)가 차지하는 '백킹(디바이스) px'.
//  L.u = ui x 1.5 x R 이고 R 에 이미 DPR(x 품질)이 들어 있다. 예전 선택식(L.u x devicePixelRatio)은 DPR 을 두 번 곱해
//  DPR 2~3 기기가 거의 항상 @3x·4000px 에셋을 받았다(실제 백킹 해상도보다 2배 이상 큰 텍스처 -> 다운로드·VRAM 낭비).
//  롤백: 콘솔 settings.set({ texDprLegacy: true }) 후 새로고침(예전 L.u x dpr 식 + 예전 임계값으로 선택).
export const texDprLegacy = () => settings.get().texDprLegacy === true;
export function texPxPerUnit() {
    const u = Number(L.u) || 1;
    return texDprLegacy() ? u * (globalThis.devicePixelRatio ?? 1) : u;
}
// @3x(1u=3px) / @1.5x(1u=1.5px) 계열 아틀라스 선택 임계값: 1u 가 1.7 백킹 px 이상이면 @3x.
//  @1.5x 를 확대해 쓰는 비율이 최대 1.13배(1.7/1.5)로 제한돼 번짐이 눈에 띄지 않고, 그 이상은 @3x 를 축소(선명)해 쓴다. 예전 식은 2(dpr 곱 포함)
export const HI_TEX_PX = 1.7; // 안드로이드 DPR 2.625 보통(u 1.77)은 @3x 유지
export const texHi = () => texPxPerUnit() >= (texDprLegacy() ? 2 : HI_TEX_PX);
// 화면 전체 폭(백킹 px). 예전 식은 L.lw x L.u x dpr(= 백킹 x dpr)
export const texScreenW = () => (L.lw || 1280) * texPxPerUnit();

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
// ---- 프레임 상한(2026-11-14 성능 1단계) ----
// Phaser fps.limit(TimeStep.stepLimitFPS)은 '누적 delta >= 1000/limit' 비교라 60Hz 화면에 limit 60 을 걸면 rAF 지터(16.5ms 등)로 프레임을 건너뛴다.
// 그래서 Phaser limit 을 쓰지 않고 '단계 비교' 방식: rAF 간격 중앙값(최근 60프레임)으로 주사율을 재고, 상한 간격의 정수 배(every)마다 1번만 게임 step 을 돌린다.
//  60Hz + 상한 60 -> every 1(건너뜀 없음) / 120Hz -> 2(60fps) / 144Hz -> 2(72fps) / 165Hz -> 3(55fps) / 60Hz + 상한 30 -> 2.
//  건너뛴 프레임의 delta 는 누적해 다음 step 에 넘긴다(게임 시간 손실 없음). 창 포커스를 잃으면(blur) 상한 30.
// 설정: settings.fpsCap(0 무제한 / 30 / 60). 상태는 FRAME_CAP(perfGuard·perfOverlay 가 읽음)
export const FRAME_CAP = { cap: 0, every: 1, rawMs: 16.7, blurred: false };
export function installFrameCap(game) {
    const loop = game.loop;
    const raws = new Float32Array(60); let rI = 0; let rN = 0;
    let acc = 0; let n = 0;
    let wrapped = null; let orig = null;
    const median = () => { const a = Array.from(raws.subarray(0, rN)).sort((x, y) => x - y); return a.length ? a[a.length >> 1] : 16.7; };
    const recompute = () => {
        const user = Number(settings.get().fpsCap ?? 60) || 0;
        const cap = FRAME_CAP.blurred ? (user > 0 ? Math.min(user, 30) : 30) : user;
        FRAME_CAP.cap = cap;
        FRAME_CAP.rawMs = rN >= 20 ? median() : 16.7;
        // 주사율이 상한보다 충분히 높을 때만 건너뜀(상한 간격 / rAF 간격 반올림). 60Hz 에서 상한 60 이면 1 = 상한 없음과 같다
        FRAME_CAP.every = cap > 0 ? Math.max(1, Math.round((1000 / cap) / Math.max(1, FRAME_CAP.rawMs))) : 1;
    };
    const wrap = () => {
        if (typeof loop.callback !== 'function' || loop.callback === wrapped) return;
        orig = loop.callback;
        wrapped = (time, delta) => {
            const r = loop.rawDelta;
            if (r > 0 && r < 250) { raws[rI] = r; rI = (rI + 1) % raws.length; if (rN < raws.length) rN += 1; }
            acc += delta; n += 1;
            if (n < FRAME_CAP.every) return;
            n = 0; const d = acc; acc = 0;
            orig(time, d);
        };
        loop.callback = wrapped;
    };
    // loop.start 는 READY 이후에 callback 을 설정한다 -> 첫 step 에서 감싼다. 이후에도 콜백이 교체되면 주기 점검에서 다시 감싼다
    game.events.once('step', wrap);
    const id = setInterval(() => { wrap(); recompute(); }, 1000);
    const onBlur = () => { FRAME_CAP.blurred = true; recompute(); };
    const onFocus = () => { FRAME_CAP.blurred = false; acc = 0; n = 0; recompute(); };
    window.addEventListener('blur', onBlur);
    window.addEventListener('focus', onFocus);
    const off = settings.subscribe(recompute);
    recompute();
    return () => {
        clearInterval(id); off();
        window.removeEventListener('blur', onBlur);
        window.removeEventListener('focus', onFocus);
        if (wrapped && loop.callback === wrapped && orig) loop.callback = orig;
    };
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
    // 2026-11-14: 판정 기준을 loop.actualFps(rAF 횟수 — 프레임 상한으로 건너뛴 프레임도 셈) 대신 '실제 게임 step 간격'으로.
    //  기준값도 상한 반영: 목표 fps(상한, 무제한이면 60)의 75% 미만을 저하로, 90% 이상을 회복으로 본다(각각 최대 45/54. 상한 30 이면 22.5/27)
    //  (측정한 rAF 간격을 기준으로 삼지 않는다: 기기가 실제로 느리면 rAF 간격 자체가 늘어 저하를 놓친다)
    let lastStepAt = 0; let steps = 0; let windowStart = performance.now();
    const onStep = () => {
        const now = performance.now();
        const d = lastStepAt ? now - lastStepAt : 0;
        lastStepAt = now; steps += 1;
        if (d > 0 && d < 1000) { dts[dtI] = d; dtI = (dtI + 1) % CAP_N; if (dtN < CAP_N) dtN += 1; }
    };
    game.events.on('step', onStep);
    const id = setInterval(() => {
        const now = performance.now();
        const span = now - windowStart; const nSteps = steps;
        windowStart = now; steps = 0;
        if (document.hidden || FRAME_CAP.blurred) { low = 0; high = 0; dtN = 0; dtI = 0; lastStepAt = 0; return; }
        const fps = span > 0 ? (nSteps * 1000) / span : 0;
        const target = FRAME_CAP.cap > 0 ? Math.min(60, FRAME_CAP.cap) : 60;
        const lowAt = Math.min(45, target * 0.75); const highAt = Math.min(54, target * 0.9);
        FRAME_CAP.stepFps = fps;
        low = fps > 1 && fps < lowAt && !capped30(dts, dtN) ? low + 1 : 0;
        const q = settings.get().quality;
        const userQ = settings.userQuality();
        high = q > userQ && fps >= highAt ? high + 1 : 0;
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
