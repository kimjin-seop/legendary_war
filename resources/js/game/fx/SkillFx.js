import { tween, wait, isInstant, fxScale } from '../ui/motion.js';
import { textStyle } from '../theme.js';
import { TILE } from '../UnitView.js';

// 스킬 임팩트 연출(코드 드로잉, 이미지 에셋 없음). 판정은 바꾸지 않는다(서버 이벤트 skill_use 뒤 attack/counter/kill 을 그대로 재생).
// - 월드(컷신 끄기·축약): 시전 모으기 링 -> 기존 병종 공격 모션 -> 타격 순간 대형 충격 링·방사 스파크 + 추가 히트스톱·흔들림 + 짧은 슬로모션
// - 컷신(BattleCutscene, 연출 '풀' + 컷신 켜짐): 상단 스킬 이름 배너 + 시전자 오라 -> 충돌 순간 대형 충격 링·방사선 + 추가 흔들림·히트스톱
// - 패시브 발동: 유닛 위 작은 마름모 아이콘 + 이름 0.6초(이름을 아는 코드만)
// 시간은 모두 motion.tween/wait 를 거쳐 배속·연출 끄기·스킵을 따른다(끄기/스킵이면 아무것도 만들지 않음).
// 데미지 숫자·병력 감소는 기존 충돌 시점(FxManager.hit / 컷신 clash)에서 한 번만 표시한다(여기서는 그리지 않음).

// 조정 상수 — 스킬 연출은 여기 한 곳에서
export const SKILL_FX = {
    // 위력 강도 k = clamp((power_pct - powerRef) / powerSpan, 0, powerMaxK). 100% = 0, 150% = 0.5, 200% = 1.0
    powerRef: 100, powerSpan: 100, powerMaxK: 1.5,
    templates: { T_ACTIVE_STRIKE: 'strike', T_ACTIVE_PIERCE: 'pierce', T_ACTIVE_STANCE: 'stance' }, // 서버 템플릿 -> 연출 종류(모르는 템플릿은 strike 로). pierce = 강타 변형(청백 관통), stance = 자기 중심 방벽(교전 없음)
    shortMul: 0.6, // 축약(fxLevel 1) 시 길이·크기 배율
    world: {
        chargeMs: 280, chargeR: 46, chargeRays: 8, chargeColor: 0xffd76a, // 시전 모으기: 시전자 쪽으로 수렴하는 링(ms, 시작 반경 px)
        ringMs: 340, ringR: 52, ringPerK: 22, ringWidth: 6, ringColor: 0xfff1c9, // 타격 충격 링(반경 = ringR + ringPerK x k)
        burstRays: 10, burstRaysPerK: 6, burstLen: 30, burstPerK: 16, burstColor: 0xffc94a, // 방사 스파크(개수·길이 = 기본 + k 비례)
        hitStopFrames: 5, hitStopPerK: 4, // 추가 히트스톱 프레임(기존 hitStop 에 더함)
        shakePx: 4, shakePerK: 4, // 추가 흔들림 px(기존 shake 에 더함, FX.shake.max 상한 적용)
        slowScale: 0.35, slowMs: 160, slowPerK: 120, // 타격 직후 슬로모션(트윈 시간 배율 / 실제 지속 ms)
    },
    cut: {
        bannerY: 0.13, bannerSize: 40, subSize: 18, bannerColor: '#FFE08A', bannerEdge: 0xc9a24b, bannerHold: 950, // 스킬 이름 배너(무대 높이 비율 위치)
        auraColor: 0xffd76a, auraExtraMs: 220, // 시전자 오라(돌진 구간 + 여유)
        ringMs: 380, ringR: 90, ringPerK: 36, ringWidth: 8, rays: 14, raysPerK: 6, rayLen: 60, rayPerK: 30, // 충돌 충격 링·방사선
        shakeAmp: 6, shakePerK: 4, shakeMs: 360, // 추가 흔들림(무대만)
        hitstopMs: 110, hitstopPerK: 90, // 추가 히트스톱(기존 CUT_T.hitstop 에 더함)
    },
    passive: { ms: 600, size: 15, color: '#9FE3FF', icon: 0x7fd3ff, rise: 18, maxNames: 2 }, // 패시브 발동 팝업
};

const lerp = (base, per, k) => base + per * k;
export const powerK = (pct) => Math.max(0, Math.min(SKILL_FX.powerMaxK, ((Number(pct) || SKILL_FX.powerRef) - SKILL_FX.powerRef) / SKILL_FX.powerSpan));
export const skillKind = (template) => SKILL_FX.templates[template] ?? 'strike';
const shortMul = () => (fxScale() < 1 ? SKILL_FX.shortMul : 1);

// 충격 링 2겹 + 방사선 + 중심 섬광을 Graphics 1개에 그린다(t: 0~1)
function drawBurst(g, x, y, t, R, len, angs, cfg) {
    g.clear();
    const e = 1 - (1 - t) * (1 - t);
    g.lineStyle(cfg.width * (1 - t) + 1, cfg.ring, 1 - t).strokeCircle(x, y, R * e);
    if (t > 0.15) {
        const t2 = (t - 0.15) / 0.85;
        g.lineStyle(cfg.width * 0.5 * (1 - t2) + 1, cfg.burst, 0.85 * (1 - t2)).strokeCircle(x, y, R * 0.62 * (1 - (1 - t2) * (1 - t2)));
    }
    angs.forEach((a) => {
        const r0 = R * 0.2 + len * e * 0.5;
        const r1 = r0 + len * (1 - t * 0.6);
        g.lineStyle(Math.max(1, cfg.width * 0.5 * (1 - t) + 1), cfg.burst, 1 - t).lineBetween(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1);
    });
    if (t < 0.3) g.fillStyle(0xffffff, 0.75 * (1 - t / 0.3)).fillCircle(x, y, R * 0.32);
}
const rayAngles = (n) => Array.from({ length: n }, (_, i) => (i / n) * Math.PI * 2 + Math.random() * 0.25);

// ---- 월드 ----
// 시전 모으기(공격 모션 전). onDone 은 반드시 1번 호출(끄기/스킵 포함)
export function worldCharge(fxm, view, onDone) {
    const W = SKILL_FX.world;
    if (!view || isInstant()) { onDone(); return; }
    const sc = fxm.scene;
    const g = sc.add.graphics();
    fxm.d.worldFx.add(g);
    const x = view.c.x; const y = view.c.y;
    const p = { t: 0 };
    const draw = () => {
        if (!g.scene) return;
        const t = p.t;
        const r = W.chargeR * (1 - t) + 8;
        g.clear();
        g.fillStyle(W.chargeColor, 0.28 * t).fillCircle(x, y, TILE * 0.45);
        g.lineStyle(3, W.chargeColor, 0.35 + 0.6 * t).strokeCircle(x, y, r);
        for (let i = 0; i < W.chargeRays; i++) {
            const a = (i / W.chargeRays) * Math.PI * 2 + t * 1.5;
            const r0 = r + 6; const r1 = r0 + 6 + 10 * (1 - t);
            g.lineStyle(2, W.chargeColor, 0.85 * t).lineBetween(x + Math.cos(a) * r0, y + Math.sin(a) * r0, x + Math.cos(a) * r1, y + Math.sin(a) * r1);
        }
    };
    draw();
    tween(sc, { targets: p, to: { t: 1 }, duration: W.chargeMs * shortMul(), ease: 'Quad.easeIn', onUpdate: draw, onComplete: () => { if (g.scene) g.destroy(); onDone(); } });
}

// 타격 순간 임팩트(대상 위). 반환: { hitStopFrames, shakePx } 추가분(호출부가 기존 값에 더함)
// opts.burst=false: 스킬 이펙트 시트(SkillFxSheet)가 재생 중이면 링·스파크 드로잉만 생략(히트스톱·흔들림·슬로모션은 유지)
export function worldImpact(fxm, view, pct, { burst = true } = {}) {
    const W = SKILL_FX.world;
    const k = powerK(pct);
    const extra = { hitStopFrames: Math.round(lerp(W.hitStopFrames, W.hitStopPerK, k)), shakePx: lerp(W.shakePx, W.shakePerK, k) };
    if (!view || isInstant()) return extra;
    const sc = fxm.scene;
    const m = shortMul();
    const R = lerp(W.ringR, W.ringPerK, k) * m;
    const len = lerp(W.burstLen, W.burstPerK, k) * m;
    const angs = rayAngles(Math.round(lerp(W.burstRays, W.burstRaysPerK, k)));
    const x = view.c.x; const y = view.c.y;
    if (burst) fxm.useEffect((free) => {
        const g = sc.add.graphics().setBlendMode(1);
        fxm.d.worldFx.add(g);
        const p = { t: 0 };
        const cfg = { width: W.ringWidth, ring: W.ringColor, burst: W.burstColor };
        const draw = () => { if (g.scene) drawBurst(g, x, y, p.t, R, len, angs, cfg); };
        draw();
        tween(sc, { targets: p, to: { t: 1 }, duration: W.ringMs, ease: 'Linear', onUpdate: draw, onComplete: () => { if (g.scene) g.destroy(); free(); } });
    });
    slowMo(fxm, k);
    return extra;
}

// 짧은 슬로모션: 씬 트윈 시간 배율을 잠깐 낮춘다(실제 시간 기준 복구). 씬 종료·스킵에서도 반드시 복구
function slowMo(fxm, k) {
    const W = SKILL_FX.world;
    const sc = fxm.scene;
    const tw = sc.tweens;
    if (!tw || fxm.slowActive || isInstant()) return;
    fxm.slowActive = true;
    const prev = tw.timeScale ?? 1;
    const restore = () => {
        if (!fxm.slowActive) return;
        fxm.slowActive = false;
        tw.timeScale = prev;
        sc.events.off('shutdown', restore);
    };
    sc.events.once('shutdown', restore);
    tw.timeScale = W.slowScale;
    wait(sc, lerp(W.slowMs, W.slowPerK, k) * shortMul(), restore); // wait 는 스킵(snapAll) 시 즉시 호출된다
}

// ---- 컷신(BattleCutscene 인스턴스 cs: scene, root, stage, sides, W, SH, k, skill{name, powerPct}) ----
// 진입 직후: 상단 스킬 이름 배너 + 시전자(왼쪽 선두) 오라. chargeMs = 돌진/발사 구간 길이
export function cutIntro(cs, chargeMs) {
    const sk = cs.skill;
    if (!sk || isInstant() || cs.destroyed) return;
    const C = SKILL_FX.cut;
    const sc = cs.scene;
    const k = cs.k;
    // 배너: 남색 띠 + 금색 테두리 + 이름(확대 -> 1.0) + 위력
    const c = sc.add.container(cs.W / 2, cs.SH * C.bannerY);
    const name = sc.add.text(0, 0, sk.name ?? '스킬', textStyle(C.bannerSize, C.bannerColor, { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 8 })).setOrigin(0.5);
    const sub = sc.add.text(0, name.height / 2 + 12, `위력 ${sk.powerPct ?? 100}%${sk.defIgnorePct ? ` · 방어 무시 ${sk.defIgnorePct}%` : ''}`, textStyle(C.subSize, '#FFFFFF', { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 4 })).setOrigin(0.5);
    const bw = Math.min(cs.W, Math.max(name.width, sub.width) + 160);
    const top = -name.height / 2 - 10;
    const bh = name.height + sub.height + 26;
    const g = sc.add.graphics();
    g.fillStyle(0x0b1020, 0.8).fillRect(-bw / 2, top, bw, bh);
    g.fillStyle(C.bannerEdge, 1).fillRect(-bw / 2, top, bw, 3).fillRect(-bw / 2, top + bh - 3, bw, 3);
    c.add([g, name, sub]);
    cs.root.add(c);
    cs.skillBanner = c; // 충돌 순간 측면/배후 배너가 같은 자리(무대 13~14%)에 뜨면 dismissSkillBanner 로 먼저 걷는다
    c.setAlpha(0);
    name.setScale(1.8);
    tween(sc, { targets: c, to: { alpha: 1 }, duration: 120 });
    tween(sc, { targets: name, to: { scale: 1 }, duration: 240 * k, ease: 'Back.easeOut' });
    wait(sc, C.bannerHold * k, () => { if (c.scene) tween(sc, { targets: c, to: { alpha: 0 }, duration: 200 * k, onComplete: () => c.destroy() }); });
    // 시전자 오라(선두 영웅/병사를 따라감)
    const hero = cs.sides?.[0]?.members?.[0]?.o;
    if (!hero) return;
    const a = sc.add.graphics().setBlendMode(1);
    cs.stage.add(a);
    const p = { t: 0 };
    const draw = () => {
        if (!a.scene || !hero.scene) return;
        const pulse = 0.5 + 0.5 * Math.sin(p.t * Math.PI * 6);
        const r = (hero.displayHeight || 60) * 0.55 * (1 + 0.15 * pulse);
        const cx = hero.x; const cy = hero.y - (hero.displayHeight || 60) * 0.5;
        a.clear();
        a.fillStyle(C.auraColor, 0.14 + 0.12 * pulse).fillCircle(cx, cy, r);
        a.lineStyle(3, C.auraColor, 0.75).strokeCircle(cx, cy, r * 1.05);
    };
    draw();
    tween(sc, { targets: p, to: { t: 1 }, duration: chargeMs + C.auraExtraMs * k, ease: 'Linear', onUpdate: draw, onComplete: () => { if (a.scene) a.destroy(); } });
}

// 스킬 이름 배너를 빠르게 걷는다(위로 살짝 + 페이드 0.1초). 측면/배후 배너와 겹침 방지(하플레이 2026-11-10 '먼 곳의 일제 사격' + '측면 공격!' 같은 위치)
export function dismissSkillBanner(cs) {
    const c = cs.skillBanner;
    cs.skillBanner = null;
    if (!c?.scene || c.alpha <= 0.01) return false;
    tween(cs.scene, { targets: c, to: { alpha: 0, y: c.y - 14 }, duration: 100, onComplete: () => { if (c.scene) c.destroy(); } });
    return true;
}

// 충돌 순간: 대형 충격 링·방사선 + 추가 흔들림. 반환 = 추가 히트스톱(ms, 호출부가 기존 히트스톱에 더함)
export function cutImpact(cs, cx, cy) {
    const sk = cs.skill;
    if (!sk || isInstant() || cs.destroyed) return 0;
    const C = SKILL_FX.cut;
    const k = powerK(sk.powerPct);
    const sc = cs.scene;
    const R = lerp(C.ringR, C.ringPerK, k);
    const len = lerp(C.rayLen, C.rayPerK, k);
    const angs = rayAngles(Math.round(lerp(C.rays, C.raysPerK, k)));
    const g = sc.add.graphics().setBlendMode(1);
    cs.stage.add(g);
    const p = { t: 0 };
    const pierce = skillKind(sk.template) === 'pierce'; // 관통 강타: 청백 링·더 긴 방사선(방어 무시 느낌)
    const cfg = pierce ? { width: C.ringWidth + 2, ring: 0xe6f6ff, burst: 0x8fd0ff } : { width: C.ringWidth, ring: 0xfff1c9, burst: 0xffc94a };
    const draw = () => { if (g.scene) drawBurst(g, cx, cy, p.t, R, pierce ? len * 1.35 : len, angs, cfg); };
    draw();
    tween(sc, { targets: p, to: { t: 1 }, duration: C.ringMs, ease: 'Linear', onUpdate: draw, onComplete: () => { if (g.scene) g.destroy(); } });
    cs.shake(lerp(C.shakeAmp, C.shakePerK, k), C.shakeMs);
    return Math.round(lerp(C.hitstopMs, C.hitstopPerK, k));
}

// ---- 패시브 발동 팝업: 유닛 위 마름모 아이콘 + 이름(최대 2개) 0.6초 ----
export function passivePop(fxm, view, names) {
    const P = SKILL_FX.passive;
    if (!view || !names?.length || isInstant()) return;
    const sc = fxm.scene;
    const c = sc.add.container(view.c.x, view.c.y - TILE * 0.8);
    const t = sc.add.text(10, 0, names.slice(0, P.maxNames).join(' · '), textStyle(P.size, P.color, { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 4 })).setOrigin(0, 0.5);
    const g = sc.add.graphics();
    const s = 6;
    g.fillStyle(P.icon, 1).fillTriangle(0, -s, s, 0, 0, s).fillTriangle(0, -s, -s, 0, 0, s);
    g.lineStyle(1, 0x0b1020, 1).strokeTriangle(0, -s, s, 0, 0, s).strokeTriangle(0, -s, -s, 0, 0, s);
    c.add([g, t]);
    c.x -= (t.width + 10) / 2;
    fxm.d.worldFx.add(c);
    const y0 = c.y;
    const p = { t: 0 };
    tween(sc, {
        targets: p, to: { t: 1 }, duration: P.ms, ease: 'Linear',
        onUpdate: () => { if (!c.scene) return; c.y = y0 - P.rise * (1 - (1 - p.t) * (1 - p.t)); c.alpha = p.t < 0.6 ? 1 : 1 - (p.t - 0.6) / 0.4; },
        onComplete: () => c.destroy(),
    });
}
