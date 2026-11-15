import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { makeText, fitText, shrinkToFit } from './common.js';
import { isInstant } from './motion.js';
import { settings } from '../settings.js';
import { audio } from '../audio.js';

// ===== 게임형 토스트(2026-11-14 개편) =====
// - showToast(scene, message, { ms, kind }) : 기존 시그니처 호환. kind 생략 시 문구로 자동 분류(inferToastKind).
//   kind: 'success'(금빛 테두리·반짝임) | 'reward'(별 배지) | 'warn' | 'error'(짧은 흔들림) | 'info'
// - showRewardToast(scene, { title, name, qty, icon, amount, amountFmt, fallback, ms }) : 획득/구매 연출(아이콘 팝 + 반짝임, 금액은 최종값). 같은 제목·이름이 떠 있으면 수량·금액 누적.
//   icon(scene, size) 가 (0,0) 중심 GameObject 를 돌려주지 못하면 fallback 문구로 showToast(success) 폴백.
// - 하단 중앙 스택(최신이 아래, 최대 3개, 넘치면 가장 오래된 것을 바로 걷어냄). 같은 문구·종류 연속은 병합(x2).
// - 입력 비차단(인터랙티브 객체 없음), depth 최상위, 폭 = min(460, 화면 폭 - 24).
// - 연출 설정: 끄기/스킵 = 즉시 표시·즉시 제거, 축약 = 슬라이드·페이드만(반짝임·흔들림 생략). 표시 유지 시간은 설정과 무관.
// - 효과음: 오류는 기존 sfx_ui_cancel(등록돼 있으면), 그 외·미등록은 WebAudio 짧은 합성음. 음소거(muted/sfxMuted)·sfxVolume 준수,
//   사운드 잠금(자동재생 정책) 중이거나 컨텍스트가 running 이 아니면 재생하지 않는다(resume 호출 안 함).

const DEPTH = 9500;
const MAX_SHOWN = 3;
const GAP = 6;
const KIND = {
    success: { border: 0xe8c25a, fill: 0x1a1608, text: '#FFF4D2', badge: 0xd9a93a },
    reward: { border: 0xf0d58c, fill: 0x1a1608, text: '#FFF4D2', badge: 0xe8b84a },
    warn: { border: 0xe8963a, fill: 0x1c1208, text: '#FFE6C8', badge: 0xe8963a },
    error: { border: COLOR.danger, fill: 0x1c0b0b, text: '#FFD9D2', badge: COLOR.danger },
    info: { border: COLOR.accent, fill: COLOR.ink, text: CSS.text, badge: 0x4a78c8 },
};

// 문구 기반 자동 분류(호출부 무변경용). 앞 규칙이 우선
export function inferToastKind(msg) {
    const s = String(msg ?? '');
    if (/실패|오류|에러|받지 못했|연결할 수 없|만료/.test(s)) return 'error';
    if (/부족|할 수 없|수 없|없습니다|불가|먼저|최대|이미|해금되지|한도|가득|필요|초과|입니다\.?$/.test(s) && !/완료|했습니다/.test(s)) return 'warn';
    if (/포기|중입니다|잠시/.test(s)) return 'info';
    if (/보상|수령|획득/.test(s)) return 'reward';
    if (/완료|했습니다|복사했|참가했|저장했/.test(s)) return 'success';
    return 'info';
}

// ---- 상태(씬별) ----
const stacks = new WeakMap(); // scene -> { shown: [] }
function stackOf(scene) {
    let st = stacks.get(scene);
    if (!st) {
        st = { shown: [] };
        stacks.set(scene, st);
        scene.events?.once?.('shutdown', () => stacks.delete(scene));
    }
    return st;
}
const fxLevel = () => settings.get().fxLevel ?? 0;
const rich = () => !isInstant() && fxLevel() === 0; // 풀 연출(반짝임·흔들림·팝)
// 연출 트윈: 끄기·스킵이면 즉시 최종값
function anim(scene, cfg, fin) {
    if (isInstant()) { [].concat(cfg.targets).forEach((t) => t?.scene && Object.assign(t, fin ?? {})); cfg.onComplete?.(); return null; }
    return scene.tweens.add(cfg);
}

// ---- 효과음 ----
let lastSfx = { kind: '', t: 0 };
function sfxGain(scene) {
    const st = settings.get();
    if (st.muted || st.sfxMuted) return 0;
    const sm = scene?.sound;
    if (!sm || sm.locked || !sm.context || sm.context.state !== 'running') return 0;
    return Math.max(0, Math.min(1, st.sfxVolume ?? 1));
}
function tone(ctx, out, { f, f2, t0, dur, type = 'sine', vol = 0.2 }) {
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g); g.connect(out); o.start(t0); o.stop(t0 + dur + 0.02);
}
const SYNTH = {
    reward: (c, o, t) => { tone(c, o, { f: 988, t0: t, dur: 0.09, type: 'square', vol: 0.09 }); tone(c, o, { f: 1319, t0: t + 0.07, dur: 0.32, type: 'square', vol: 0.08 }); tone(c, o, { f: 2637, t0: t + 0.07, dur: 0.25, vol: 0.05 }); }, // 코인
    success: (c, o, t) => { tone(c, o, { f: 1319, t0: t, dur: 0.12, type: 'triangle', vol: 0.18 }); tone(c, o, { f: 1976, t0: t + 0.08, dur: 0.22, type: 'triangle', vol: 0.15 }); },
    warn: (c, o, t) => { tone(c, o, { f: 523, t0: t, dur: 0.08, type: 'triangle', vol: 0.16 }); tone(c, o, { f: 440, t0: t + 0.1, dur: 0.12, type: 'triangle', vol: 0.16 }); },
    error: (c, o, t) => { tone(c, o, { f: 190, f2: 110, t0: t, dur: 0.18, type: 'sawtooth', vol: 0.1 }); },
    info: (c, o, t) => { tone(c, o, { f: 880, f2: 1175, t0: t, dur: 0.07, vol: 0.1 }); },
};
export function playToastSfx(scene, kind) {
    try {
        const now = performance.now();
        if (lastSfx.kind === kind && now - lastSfx.t < 90) return; // 연타 중복 방지
        lastSfx = { kind, t: now };
        if (kind === 'error' && audio.has('sfx_ui_cancel')) { audio.play('sfx_ui_cancel'); return; } // 기존 슬롯 재사용(볼륨·음소거는 assets.js 핸들러가 반영)
        const gain = sfxGain(scene);
        if (!gain) return;
        const ctx = scene.sound.context;
        const out = ctx.createGain(); out.gain.value = gain;
        out.connect(scene.sound.destination ?? ctx.destination); // Phaser 마스터(전체 음소거 반영) 우선
        (SYNTH[kind] ?? SYNTH.info)(ctx, out, ctx.currentTime + 0.005);
        setTimeout(() => { try { out.disconnect(); } catch { /* 무시 */ } }, 900);
    } catch { /* 효과음 오류가 게임을 멈추지 않는다 */ }
}

// ---- 도형(코드로 그림) ----
function kindBadge(scene, kind, r = 13) {
    const g = scene.add.graphics();
    const k = KIND[kind] ?? KIND.info;
    const w = Math.max(2, r * 0.22);
    if (kind === 'warn') {
        g.fillStyle(k.badge, 1).fillTriangle(0, -r, r * 1.05, r * 0.85, -r * 1.05, r * 0.85);
        g.lineStyle(1.5, 0xffffff, 0.6).strokeTriangle(0, -r, r * 1.05, r * 0.85, -r * 1.05, r * 0.85);
        g.fillStyle(0x1c1208, 1).fillRect(-w / 2, -r * 0.45, w, r * 0.7).fillCircle(0, r * 0.5, w * 0.6);
        return g;
    }
    if (kind === 'reward') { star(g, 0, 0, r * 1.1, r * 0.5, k.badge, 1); g.lineStyle(1.5, 0xffffff, 0.7).strokeCircle(0, 0, r * 0.25); return g; }
    g.fillStyle(k.badge, 1).fillCircle(0, 0, r);
    g.lineStyle(1.5, 0xffffff, 0.55).strokeCircle(0, 0, r);
    g.lineStyle(w, 0xffffff, 1);
    if (kind === 'success') g.beginPath().moveTo(-r * 0.45, 0).lineTo(-r * 0.1, r * 0.38).lineTo(r * 0.5, -r * 0.35).strokePath();
    else if (kind === 'error') g.lineBetween(-r * 0.38, -r * 0.38, r * 0.38, r * 0.38).lineBetween(r * 0.38, -r * 0.38, -r * 0.38, r * 0.38);
    else { g.lineBetween(0, -r * 0.05, 0, r * 0.5); g.fillStyle(0xffffff, 1).fillCircle(0, -r * 0.4, w * 0.6); }
    return g;
}
function star(g, x, y, ro, ri, color, alpha = 1) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? ri : ro; pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }); }
    g.fillStyle(color, alpha).fillPoints(pts, true);
}
// 반짝이(4각 별) 하나: (x,y)에서 나타나 커졌다 사라짐
function twinkle(scene, parent, x, y, size, delay, color = 0xfff4c8) {
    const g = scene.add.graphics({ x, y });
    g.fillStyle(color, 1).fillPoints([{ x: 0, y: -size }, { x: size * 0.25, y: 0 }, { x: 0, y: size }, { x: -size * 0.25, y: 0 }], true)
        .fillPoints([{ x: -size, y: 0 }, { x: 0, y: size * 0.25 }, { x: size, y: 0 }, { x: 0, y: -size * 0.25 }], true);
    g.setScale(0).setAlpha(1);
    parent.add(g);
    scene.tweens.add({ targets: g, scale: 1, angle: 90, duration: 260, delay, ease: 'Back.easeOut', yoyo: true, hold: 80, onComplete: () => g.destroy() });
}
// 아이콘 주위로 튀어나가는 반짝 파티클
function burst(scene, parent, n, radius, color) {
    for (let i = 0; i < n; i += 1) {
        const a = (i / n) * Math.PI * 2 + Math.random() * 0.4;
        const p = scene.add.graphics();
        star(p, 0, 0, 4 + Math.random() * 2, 1.8, color, 1);
        parent.add(p);
        const d = radius * (0.8 + Math.random() * 0.5);
        scene.tweens.add({ targets: p, x: Math.cos(a) * d, y: Math.sin(a) * d, alpha: 0, scale: 0.4, angle: 180, duration: 520 + Math.random() * 200, ease: 'Cubic.easeOut', onComplete: () => p.destroy() });
    }
}

// ---- 수량 배지(병합 x2·구매 수량 누적) ----
function countChip(scene) {
    const c = scene.add.container(0, 0);
    c.chipG = scene.add.graphics();
    c.chipT = makeText(scene, 0, 0, '', { size: 13, bold: true, color: '#1A1406', origin: [0.5, 0.5] });
    c.add([c.chipG, c.chipT]);
    return c;
}
function setCountChip(c, str) {
    c.chipT.setText(str);
    const w = Math.max(24, c.chipT.width + 12); const h = 20;
    c.chipG.clear().fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, h / 2)
        .fillStyle(0xf0c85a, 1).fillRoundedRect(-w / 2, -h / 2, w, h, h / 2)
        .lineStyle(1.5, 0x0b1020, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    c.setVisible(true);
    return c;
}
function popCount(scene, c) {
    if (isInstant() || !c?.scene) return;
    scene.tweens.killTweensOf(c); c.setScale(1.6);
    scene.tweens.add({ targets: c, scale: 1, duration: 220, ease: 'Back.easeOut' });
}

// ---- 판(배경) ----
function plate(scene, w, h, kind) {
    const k = KIND[kind] ?? KIND.info;
    const g = scene.add.graphics();
    const r = Math.min(14, h / 2);
    g.fillStyle(0x000000, 0.35).fillRoundedRect(-w / 2 + 2, -h / 2 + 4, w, h, r); // 그림자
    g.fillStyle(k.fill, 0.94).fillRoundedRect(-w / 2, -h / 2, w, h, r);
    g.fillStyle(0xffffff, 0.06).fillRoundedRect(-w / 2 + 3, -h / 2 + 3, w - 6, h * 0.42, { tl: r - 2, tr: r - 2, bl: 4, br: 4 }); // 윗면 하이라이트
    g.lineStyle(kind === 'success' || kind === 'reward' ? 2.5 : 2, k.border, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, r);
    if (kind === 'success' || kind === 'reward') g.lineStyle(1, 0xfff4c8, 0.35).strokeRoundedRect(-w / 2 + 4, -h / 2 + 4, w - 8, h - 8, Math.max(2, r - 4));
    return g;
}

// ---- 스택 배치 ----
// 하단 기준선: 기본 = 화면 아래 38 + 안전 여백. 로비 하단 탭 바(세로 폰)가 떠 있으면 탭 바 높이(안전 여백 포함, Lobby.tabH) + 10 위로
//  (a27b QA Medium: 390x844 에서 두 줄 토스트가 탭 아이콘·보상 배지를 덮음). 오버레이 씬(뽑기·시즌 전쟁)도 로비 탭 바를 기준으로 한다
function bottomInset(scene) {
    let inset = 0;
    try {
        if (Number.isFinite(scene?.toastInset)) inset = scene.toastInset;
        else {
            const lobby = scene?.scene?.isActive?.('Lobby') ? scene.scene.get('Lobby') : null;
            if (lobby && !lobby.railW && Number.isFinite(lobby.tabH)) inset = lobby.tabH; // 레일(가로) 레이아웃은 하단 탭이 없다
        }
    } catch { inset = 0; }
    return Math.max(38 + (L.safe?.b ?? 0), inset + 10);
}
const anchorBottom = (scene) => L.lh - bottomInset(scene);
function layout(scene, st, instant = false) {
    let bottom = anchorBottom(scene);
    for (let i = st.shown.length - 1; i >= 0; i -= 1) {
        const c = st.shown[i];
        if (!c.scene) continue;
        const ty = bottom - c.toastH / 2;
        bottom -= c.toastH + GAP;
        if (c.toastTargetY === ty) continue;
        const first = c.toastTargetY == null;
        c.toastTargetY = ty;
        if (first) continue; // 신규는 진입 연출이 위치를 잡는다
        if (instant || isInstant()) c.y = ty; else scene.tweens.add({ targets: c, y: ty, duration: 180, ease: 'Sine.easeOut' });
    }
}
function dismiss(scene, st, c, fast = false) {
    if (c.toastLeaving) return;
    c.toastLeaving = true;
    c.toastTimer?.remove(false);
    st.shown = st.shown.filter((x) => x !== c);
    layout(scene, st);
    if (!c.scene) return;
    anim(scene, { targets: c, alpha: 0, y: c.y + (fast ? 0 : 10), scale: fast ? 0.96 : 1, duration: fast ? 120 : 260, ease: 'Sine.easeIn', onComplete: () => c.destroy() }, { alpha: 0 });
}
function arm(scene, st, c, ms) {
    c.toastTimer?.remove(false);
    c.toastTimer = scene.time.delayedCall(ms, () => dismiss(scene, st, c)); // 유지 시간은 연출 설정과 무관
}
// 공통 진입: 위에서 떨어지며 살짝 바운스 + 페이드
function enter(scene, st, c, ms) {
    const sc = stackOf(scene);
    while (sc.shown.length >= MAX_SHOWN) dismiss(scene, sc, sc.shown[0], true);
    sc.shown.push(c);
    layout(scene, sc);
    const ty = c.toastTargetY;
    c.y = ty - 34; c.alpha = 0; c.setScale(0.92);
    anim(scene, { targets: c, y: ty, alpha: 1, scale: 1, duration: fxLevel() > 0 ? 160 : 380, ease: fxLevel() > 0 ? 'Sine.easeOut' : 'Back.easeOut' }, { y: ty, alpha: 1, scale: 1 });
    arm(scene, sc, c, ms + (isInstant() ? 0 : 300));
}
const sceneOk = (scene) => !!(scene?.sys && scene.add && scene.time && scene.tweens);

// 가로 기준: 씬이 toastX(중심 x)·toastMaxW(최대 폭)를 정하면 그 영역 안(예: 배치 화면 = 맵 영역 가로 중앙), 없으면 화면 가운데
const centerX = (scene) => (Number.isFinite(scene?.toastX) ? scene.toastX : L.lw / 2);
const widthCap = (scene) => Math.min(460, L.lw - 24, Number.isFinite(scene?.toastMaxW) ? Math.max(160, scene.toastMaxW) : Infinity);

// 스크린리더용 숨김 상태 영역(role=status, aria-live=polite): 캔버스 토스트 문구를 함께 읽힌다. DOM 이 없거나 실패해도 무시
let liveEl = null;
function announce(text) {
    try {
        if (typeof document === 'undefined' || !document.body) return;
        if (!liveEl || !liveEl.isConnected) {
            liveEl = document.createElement('div');
            liveEl.setAttribute('role', 'status');
            liveEl.setAttribute('aria-live', 'polite');
            liveEl.style.cssText = 'position:fixed;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;pointer-events:none;left:-9999px;top:0';
            document.body.appendChild(liveEl);
        }
        liveEl.textContent = '';
        liveEl.textContent = text;
    } catch { /* 접근성 보조 실패가 게임을 멈추지 않는다 */ }
}

// 키 토스트 닫기: 조건이 해소된 경고(opts.key 로 띄운 것)를 바로 걷어낸다
export function dismissToast(scene, key) {
    if (!key || !scene) return;
    const st = stacks.get(scene);
    st?.shown.filter((c) => c.toastKey === key && !c.toastLeaving).forEach((c) => dismiss(scene, st, c));
}

// ---- 공개 API ----
// 하단 중앙 토스트(기존 시그니처 호환). opts.kind 생략 시 자동 분류
// opts.key: 같은 키 토스트는 하나만 유지(같은 문구 = 유지 시간만 갱신·무음, 다른 문구 = 교체). dismissToast(scene, key) 로 닫기
// opts.maxLines: 최대 줄 수(기본 2)
export function showToast(scene, message, { ms = 1300, kind, key, maxLines = 2 } = {}) {
    if (!sceneOk(scene)) return null;
    const k = KIND[kind] ? kind : inferToastKind(message);
    const st = stackOf(scene);
    const text = String(message ?? '');
    let quiet = false;
    if (key) {
        const same = st.shown.filter((c) => c.scene && !c.toastLeaving && c.toastKey === key);
        const hit = same.find((c) => c.toastMsg === text && c.toastKind === k);
        if (hit) { arm(scene, st, hit, ms); return hit; }
        quiet = same.length > 0; // 문구만 바뀐 교체는 효과음·흔들림 생략(편성 중 탭마다 울리지 않게)
        same.forEach((c) => dismiss(scene, st, c, true));
    }
    // 같은 문구·종류가 떠 있으면 병합(x2, x3…)
    const dup = key ? null : st.shown.find((c) => c.scene && !c.toastLeaving && c.toastMsg === text && c.toastKind === k && !c.toastReward && !c.toastKey);
    if (dup) {
        dup.toastCount += 1;
        setCountChip(dup.toastCountText, `x${dup.toastCount}`);
        popCount(scene, dup.toastCountText);
        if (k === 'error' && rich()) shake(scene, dup);
        arm(scene, st, dup, ms);
        playToastSfx(scene, k);
        return dup;
    }
    const maxW = widthCap(scene);
    const narrow = maxW < 456; // 세로 폰·좁은 영역: 글자 16 + 최대 2줄(넘치면 글자 크기 최소 13 까지 줄인 뒤 말줄임)
    const badgeR = 13; const padL = 14 + badgeR * 2 + 10; const padR = narrow ? 16 : 26;
    const t = makeText(scene, 0, 0, text, { size: narrow ? 16 : 17, color: (KIND[k]).text, origin: [0, 0.5], wrap: maxW - padL - padR, bold: k !== 'info' });
    shrinkToFit(t, maxW - padL - padR, 13, { maxLines });
    fitText(t, maxW - padL - padR, { maxLines });
    const w = Math.max(160, Math.min(maxW, t.width + padL + padR));
    const h = Math.max(46, t.height + 20);
    const c = scene.add.container(centerX(scene), anchorBottom(scene) - h / 2).setDepth(DEPTH);
    c.toastH = h; c.toastMsg = text; c.toastKind = k; c.toastCount = 1; c.toastKey = key ?? null;
    const badge = kindBadge(scene, k, badgeR).setPosition(-w / 2 + 14 + badgeR, 0);
    t.setPosition(-w / 2 + padL, 0);
    // 병합 수(x2…) = 판 오른쪽 위 모서리에 걸친 배지(a27b QA: 문구 끝 괄호에 붙어 'x2' 가 문장처럼 읽힘)
    const cnt = countChip(scene).setPosition(w / 2 - 6, -h / 2 + 2).setVisible(false);
    c.toastCountText = cnt;
    c.add([plate(scene, w, h, k), badge, t, cnt]);
    enter(scene, st, c, ms);
    if (rich()) {
        badge.setScale(0); scene.tweens.add({ targets: badge, scale: 1, duration: 320, delay: 120, ease: 'Back.easeOut' });
        if (k === 'success' || k === 'reward') { twinkle(scene, c, -w / 2 + 6, -h / 2 + 4, 7, 260); twinkle(scene, c, w / 2 - 8, h / 2 - 5, 6, 380); }
        if (k === 'error' && !quiet) scene.time.delayedCall(200, () => { if (c.scene && !c.toastLeaving) shake(scene, c); });
    }
    if (!quiet) playToastSfx(scene, k);
    announce(text);
    return c;
}
function shake(scene, c) {
    if (c.toastShaking) return; // 진입 트윈(y·alpha·scale)은 건드리지 않도록 x 전용 트윈만, 중복 실행 방지
    const x0 = c.x; // 토스트 중심(씬 toastX 기준일 수 있음)
    c.toastShaking = true;
    c.x = x0;
    scene.tweens.add({ targets: c, x: x0 + 7, duration: 45, yoyo: true, repeat: 3, ease: 'Sine.easeInOut', onComplete: () => { c.toastShaking = false; if (c.scene) c.x = x0; } });
}

// 획득/구매 연출 토스트. o: { title='구매 완료', name, qty=1, icon(scene,size)->GameObject(0,0 중심), amount(숫자, 카운트업), amountFmt(n)->문자열, fallback(폴백 문구), ms }
export function showRewardToast(scene, o = {}) {
    if (!sceneOk(scene)) return null;
    const fallback = () => showToast(scene, o.fallback ?? `${o.name ?? ''} ${o.title ?? '구매 완료'}`.trim(), { ms: o.ms ?? 1300, kind: 'success' });
    if (typeof o.icon !== 'function') return fallback();
    const st = stackOf(scene);
    const fmtAmt = typeof o.amountFmt === 'function' ? o.amountFmt : (n) => String(n);
    const amtTarget = Number(o.amount);
    // 같은 제목·이름 카드가 떠 있으면 한 카드에 수량·금액 누적(x2, x3 + 수량 팝) + 유지 시간 갱신(a27b QA: 연속 구매 카드가 따로 쌓임)
    const mkey = `${o.title ?? '구매 완료'}|${o.name ?? ''}`;
    const same = st.shown.find((x) => x.scene && !x.toastLeaving && x.toastReward && x.toastRewardKey === mkey);
    if (same) {
        same.toastQty += Number(o.qty ?? 1) || 1;
        same.toastQtyText.setText(`x${same.toastQty}`);
        popCount(scene, same.toastQtyText); // 진입 슬라이드 트윈이 끊겨도 최종 위치·불투명으로
        same.toastQtyText.setPosition(same.toastQtyX, same.toastQtyText.y).setAlpha(1);
        if (Number.isFinite(amtTarget) && Number.isFinite(same.toastAmt)) { same.toastAmt += amtTarget; same.toastAmtText.setText(same.toastAmtFmt(same.toastAmt)); }
        arm(scene, st, same, o.ms ?? 1900);
        playToastSfx(scene, 'reward');
        return same;
    }
    let ic = null;
    try { ic = o.icon(scene, 56); } catch { ic = null; }
    if (!ic) return fallback();
    const w = Math.min(360, L.lw - 24); const h = 112;
    const c = scene.add.container(L.lw / 2, anchorBottom(scene) - h / 2).setDepth(DEPTH);
    c.toastH = h; c.toastReward = true; c.toastKind = 'reward'; c.toastRewardKey = mkey;
    const title = makeText(scene, 0, -h / 2 + 20, o.title ?? '구매 완료', { size: 19, heading: true, color: '#FFE08A', origin: [0.5, 0.5] });
    const tb = kindBadge(scene, 'reward', 10).setPosition(-title.width / 2 - 16, title.y);
    const ix = -w / 2 + 52; const iy = 16;
    const glow = scene.add.graphics({ x: ix, y: iy });
    [[38, 0.10], [30, 0.16], [22, 0.22]].forEach(([r, a]) => glow.fillStyle(0xffd86a, a).fillCircle(0, 0, r));
    const rays = scene.add.graphics({ x: ix, y: iy });
    for (let i = 0; i < 8; i += 1) { const a = (i / 8) * Math.PI * 2; rays.fillStyle(0xfff0b0, 0.22).fillTriangle(0, 0, Math.cos(a - 0.12) * 44, Math.sin(a - 0.12) * 44, Math.cos(a + 0.12) * 44, Math.sin(a + 0.12) * 44); }
    const iconBox = scene.add.container(ix, iy, [ic]);
    const fx = scene.add.container(ix, iy);
    const tx = ix + 44; const tw = w / 2 - 12 - tx;
    const nm = fitText(makeText(scene, tx, iy - 12, o.name ?? '', { size: 16, bold: true, color: '#FFFFFF', origin: [0, 0.5] }), tw - 44);
    const qty = makeText(scene, Math.min(tx + nm.width + 8, w / 2 - 12), iy - 12, `x${o.qty ?? 1}`, { size: 16, bold: true, color: '#FFE08A', origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } });
    // 금액은 최종값만 표시(카운트업 중간값 '-49 G' 같은 표기 제거, a27b QA)
    const amt = makeText(scene, tx, iy + 14, Number.isFinite(amtTarget) ? fmtAmt(amtTarget) : (o.sub ?? ''), { size: 14, color: '#E8D9B0', origin: [0, 0.5] });
    c.toastQty = Number(o.qty ?? 1) || 1; c.toastQtyText = qty; c.toastQtyX = qty.x; c.toastAmt = Number.isFinite(amtTarget) ? amtTarget : NaN; c.toastAmtText = amt; c.toastAmtFmt = fmtAmt;
    c.add([plate(scene, w, h, 'reward'), glow, rays, tb, title, iconBox, fx, nm, qty, amt]);
    enter(scene, st, c, o.ms ?? 1900);
    const full = rich();
    if (!isInstant()) {
        // 아이콘 팝(스케일 오버슈트) + 이름·수량 슬라이드인
        iconBox.setScale(0); glow.setScale(0.3).setAlpha(0);
        scene.tweens.add({ targets: iconBox, scale: 1, duration: 420, delay: 180, ease: 'Back.easeOut', easeParams: [3] });
        scene.tweens.add({ targets: glow, scale: 1, alpha: 1, duration: 360, delay: 180, ease: 'Sine.easeOut' });
        [nm, qty, amt].forEach((g, i) => { const x1 = g.x; g.x = x1 + 16; g.alpha = 0; scene.tweens.add({ targets: g, x: x1, alpha: 1, duration: 240, delay: 300 + i * 60, ease: 'Sine.easeOut' }); });
        if (full) {
            rays.setAlpha(0); scene.tweens.add({ targets: rays, alpha: 1, duration: 300, delay: 200 }); scene.tweens.add({ targets: rays, angle: 90, duration: 2400, delay: 200 });
            scene.time.delayedCall(360, () => { if (fx.scene) burst(scene, fx, 9, 44, 0xffe08a); });
            twinkle(scene, c, w / 2 - 14, -h / 2 + 12, 7, 420); twinkle(scene, c, -w / 2 + 12, h / 2 - 12, 6, 560); twinkle(scene, fx, 24, -22, 6, 640);
        } else rays.setVisible(false);
    } else rays.setVisible(false);
    playToastSfx(scene, 'reward');
    return c;
}

// 상단 중앙 알림(전투용): 작은 반투명 한 줄 칩. 동시에 최대 2개, 넘치면 큐에서 대기. 입력을 소비하지 않는다.
// o.y: 첫 칩 상단 y(설계 단위) 또는 그 값을 돌려주는 함수, o.tone: 'info' | 'warn' | 'good', o.maxW: 최대 폭
const NOTICE_MAX = 2;
const NOTICE_MS = 2200;
const queues = new WeakMap(); // scene -> { shown: [], wait: [] }

export function showNotice(scene, message, o = {}) {
    if (!scene?.sys?.isActive?.()) return;
    let q = queues.get(scene);
    if (!q) {
        q = { shown: [], wait: [] };
        queues.set(scene, q);
        scene.events.once('shutdown', () => queues.delete(scene));
    }
    if (q.wait.length >= 6) q.wait.shift(); // 몰리면 오래된 대기분 버림(정보는 전체 로그에 남아 있음)
    q.wait.push({ message, o });
    pumpNotice(scene, q);
}

function pumpNotice(scene, q) {
    while (q.shown.length < NOTICE_MAX && q.wait.length) {
        const { message, o } = q.wait.shift();
        const maxW = Math.min(o.maxW ?? 520, L.lw - 24);
        const border = o.tone === 'warn' ? COLOR.danger : o.tone === 'good' ? COLOR.ally : COLOR.accent;
        const bk = o.tone === 'warn' ? 'warn' : o.tone === 'good' ? 'success' : 'info'; // 칩 왼쪽 종류 배지(코드 도형)
        const t = makeText(scene, 0, 0, message, { size: 14, color: CSS.text, origin: [0.5, 0.5], wrap: maxW - 24 - 22 });
        const w = Math.min(maxW, t.width + 24 + 22);
        const h = t.height + 10;
        const c = scene.add.container(L.lw / 2, 0).setDepth(2000);
        t.setX(11);
        c.add([scene.add.rectangle(0, 0, w, h, COLOR.ink, 0.72).setStrokeStyle(1, border, 0.85), kindBadge(scene, bk, 7).setPosition(-w / 2 + 14, 0), t]);
        c.noticeH = h;
        if (scene.cutsceneOn) c.setVisible(false); // 교전 컷신 재생 중이면 숨겼다가 끝나면 다시 표시(setNoticesVisible)
        q.shown.push(c);
        layoutNotices(q, o);
        if (!isInstant()) { const y1 = c.y; c.y = y1 - 12; c.alpha = 0; scene.tweens.add({ targets: c, y: y1, alpha: 1, duration: 200, ease: 'Back.easeOut' }); } // 위에서 살짝 내려오며 등장
        // 연출 스킵(snapAll)·연출 끄기와 무관하게 읽을 시간을 보장하려고 motion.wait 대신 씬 타이머·트윈을 직접 쓴다
        const end = () => { if (c.scene) c.destroy(); q.shown = q.shown.filter((x) => x !== c); layoutNotices(q, o); pumpNotice(scene, q); };
        scene.time.delayedCall(o.ms ?? NOTICE_MS, () => {
            if (!c.scene) { end(); return; }
            scene.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: end });
        });
    }
}

// 상단 알림 칩 일괄 표시/숨김(교전 컷신 재생 중 숨김: 컷신 상성 리본을 덮던 문제, 강화면 gacha65)
export function setNoticesVisible(scene, on) {
    const q = queues.get(scene);
    q?.shown.forEach((c) => { if (c.scene) c.setVisible(!!on); });
}

function layoutNotices(q, o) {
    let y = typeof o.y === 'function' ? o.y() : (o.y ?? 64);
    q.shown.forEach((c) => { if (!c.scene) return; c.y = y + c.noticeH / 2; y += c.noticeH + 4; });
}
