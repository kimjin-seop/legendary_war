import Phaser from 'phaser';
import { textStyle } from '../theme.js';
import { tween, wait } from '../ui/motion.js';
import { settings } from '../settings.js';
import { troopIcon } from '../ui/GameIcons.js';
import { unitPortraitLogical, ensurePortraitTex, texKey, manifestHas } from '../assets.js';
import { CUTIN, cutinLayout, cutinTimeline, fitScale } from './skillCutinLayout.js';

// 스킬 컷인(사용자 2026-11-10 '스킬 쓸 때 영웅 초상화 + 디자인된 임팩트 UI'). 새 이미지 에셋 없이 기존 초상(portrait.*) + 코드 드로잉만.
// 레이어(아래 -> 위): 입력 차단막(탭 스킵) -> 비네트 -> 뒤 띠(사선) -> 선버스트·글로우 -> 스피드 라인 -> 잔상 -> 초상 -> 앞 띠(초상 바닥 가림) -> 섬광 사선 -> 스킬 이름(글자별) -> 영웅 이름
// 시간은 motion.tween/wait 를 거쳐 배속·탭 스킵(snapAll)을 따른다. done 은 반드시 1회.
// 초상 없음(NPC·적 일반 지휘관 등): 병종 아이콘 엠블럼(GameIcons.troopIcon: 도트 병종 그림 -> 안아트 아이콘 -> 병종 글자). 재생 중 초상이 도착하면 교체

// 병종 색(글로우·스피드 라인·그림자). 모르는 병종 = 금색
const CLASS_COLOR = {
    sword: 0xffc94a, spear: 0x6fc0ff, cavalry: 0xff8a3c, archer: 0x8fe36a, mage: 0xb98bff, healer: 0x7ff0c8,
    heavy: 0xc0c8d8, flyer: 0x9fe8ff, flying: 0x9fe8ff, naval: 0x4fb0ff, sailor: 0x4fb0ff, gunner: 0xff6a3c, assassin: 0xa070ff, monster: 0xff4f6a,
};
const TEAM = {
    ally: { band: 0x0e2a36, stripe: 0x2a8f88, edge: 0xf0d58c, text: '#BFF3EC' },
    enemy: { band: 0x2e0d12, stripe: 0xb03a2c, edge: 0xffb08a, text: '#FFC9BC' },
};
const hexCss = (n) => `#${n.toString(16).padStart(6, '0')}`;

// 초상 후보(원본 -> 썸네일). 병사 초상(portrait.troop.*)은 영웅 컷인에 쓰지 않는다(엠블럼 폴백)
export function cutinPortraitKeys(owner) {
    if (!owner) return [];
    return [unitPortraitLogical(owner, null, { thumb: false }), unitPortraitLogical(owner, null, { thumb: true })]
        .filter((k, i, a) => typeof k === 'string' && a.indexOf(k) === i && !/^portrait\.troop\./.test(k) && (manifestHas(k) || /^portrait\.[a-z0-9_]+$/i.test(k)));
}

// 미리 받기(skillUse 수신 시점, 재생 전)
export function prefetchCutinPortrait(scene, owner) {
    cutinPortraitKeys(owner).forEach((k) => ensurePortraitTex(scene, k, () => {}));
}

// opts: { parent, W, H, ally, type(병종), name(스킬), who(표시 이름), owner(초상 주인 유닛), ms, lite, raw, onTap }
//  raw: 연출 '끄기'용 비차단 간소 표시. motion 레지스트리를 거치지 않는 씬 트윈으로 재생(끄기에서는 motion.tween 이 즉시 스냅하므로), 입력 차단막 없음. 반환 = 컨테이너
export function playSkillCutin(scene, opts, done) {
    const { parent, W, H, ally, type, ms } = opts;
    const raw = !!opts.raw;
    const lite = raw || !!opts.lite;
    const lay = cutinLayout(W, H, ally);
    const team = ally ? TEAM.ally : TEAM.enemy;
    const col = CLASS_COLOR[type] ?? 0xffd76a;
    const dir = lay.dir;
    const c = scene.add.container(0, 0);
    parent.add(c);
    let ended = false;
    const finish = () => { if (ended) return; ended = true; if (c.scene) c.destroy(); done?.(); };
    // 배속: motion.tween 은 duration 만 배속으로 나누므로 delay 도 여기서 나눈다
    const sp = settings.get().speed || 1;
    const tw = (cfg) => {
        const d = cfg.delay ? cfg.delay / sp : 0;
        if (!raw) return tween(scene, { ...cfg, delay: d });
        const { targets, to, duration = 200, ease = 'Sine.easeOut', onComplete, onUpdate } = cfg;
        return scene.tweens.add({ targets, ...to, duration: duration / sp, delay: d, ease, onUpdate, onComplete: () => { if (c.scene || targets === c) onComplete?.(); } });
    };
    const wt = (t, fn) => (raw ? scene.time.delayedCall(t / sp, fn) : wait(scene, t, fn));
    // 탭 스킵(HUD 위 차단막). 컷인 동안 HUD·필드 입력은 받지 않는다(raw 는 비차단이라 없음)
    if (!raw) {
        const blocker = scene.add.rectangle(0, 0, W, H, 0x000000, 0.001).setOrigin(0).setInteractive();
        blocker.on('pointerdown', () => opts.onTap?.());
        c.add(blocker);
    }
    const T = cutinTimeline(ms, Math.max(1, [...String(opts.name ?? '')].length));
    const yAt = (x) => lay.cy + lay.k * (x - W / 2);
    const P = lay.portrait;

    // ---- 비네트: 전체 어둡게 + 가장자리 진하게 + 안쪽 가는 진영색 테 ----
    const vg = scene.add.graphics();
    vg.fillStyle(0x000000, lite ? 0.35 : 0.28).fillRect(0, 0, W, H);
    if (!lite) {
        const e = Math.min(W, H) * 0.16; const n = 7;
        for (let i = 0; i < n; i++) {
            const t = e * (1 - i / n); const a = 0.09;
            vg.fillStyle(0x000000, a).fillRect(0, 0, W, t).fillRect(0, H - t, W, t).fillRect(0, 0, t, H).fillRect(W - t, 0, t, H);
        }
        vg.lineStyle(2, col, 0.55).strokeRect(6, 6, W - 12, H - 12);
        vg.lineStyle(1, team.edge, 0.35).strokeRect(12, 12, W - 24, H - 24);
    }
    vg.setAlpha(0);
    c.add(vg);
    tw({ targets: vg, to: { alpha: 1 }, duration: T.vignette.dur });

    // 사선 띠(중심선 기준 위/아래 오프셋 사이를 화면 밖까지 채운 사각형)
    const slab = (g, top, bot, color, alpha) => {
        const x0 = -40; const x1 = W + 40;
        g.fillStyle(color, alpha).fillPoints([{ x: x0, y: yAt(x0) + top }, { x: x1, y: yAt(x1) + top }, { x: x1, y: yAt(x1) + bot }, { x: x0, y: yAt(x0) + bot }], true);
    };
    const edgeLine = (g, off, w, color, alpha) => { g.lineStyle(w, color, alpha).lineBetween(-40, yAt(-40) + off, W + 40, yAt(W + 40) + off); };
    const hb = lay.bandH / 2;

    // ---- 뒤 띠(남색/적갈 + 병종색 결 + 금 테) ----
    const band = scene.add.container(-dir * W, 0);
    const bg = scene.add.graphics();
    slab(bg, -hb, hb, team.band, 0.92);
    if (!lite) {
        slab(bg, -hb * 0.62, -hb * 0.5, col, 0.22);
        slab(bg, hb * 0.08, hb * 0.14, col, 0.14);
        edgeLine(bg, -hb, 3, team.edge, 0.9);
        edgeLine(bg, -hb - 7, 1, col, 0.6);
        edgeLine(bg, hb + 6, 1, col, 0.5);
    }
    band.add(bg);
    c.add(band);
    tw({ targets: band, to: { x: 0 }, duration: T.band.dur, ease: 'Cubic.easeOut' });

    // ---- 선버스트 + 글로우(초상 가슴 높이, 가산 혼합) ----
    let burst = null; let glow = null;
    if (!lite) {
        burst = scene.add.graphics({ x: P.x, y: P.glowY }).setBlendMode(1);
        const R = Math.max(W, H) * 0.7; const rays = 16;
        for (let i = 0; i < rays; i++) {
            const a0 = (i / rays) * Math.PI * 2; const a1 = a0 + (Math.PI * 2) / rays * 0.45;
            burst.fillStyle(i % 2 ? col : 0xffffff, i % 2 ? 0.1 : 0.05).fillTriangle(0, 0, Math.cos(a0) * R, Math.sin(a0) * R, Math.cos(a1) * R, Math.sin(a1) * R);
        }
        burst.setAlpha(0).setScale(0.6);
        glow = scene.add.graphics({ x: P.x, y: P.glowY }).setBlendMode(1);
        for (let i = 6; i >= 1; i--) glow.fillStyle(col, 0.07).fillCircle(0, 0, P.w * 0.18 * i);
        glow.setAlpha(0).setScale(0.5);
        c.add([burst, glow]);
        tw({ targets: burst, to: { alpha: 1, scale: 1 }, duration: T.portrait.dur, delay: T.portrait.at, ease: 'Cubic.easeOut' });
        tw({ targets: burst, to: { angle: dir * 10 }, duration: ms, ease: 'Linear' });
        tw({ targets: glow, to: { alpha: 1, scale: 1 }, duration: T.portrait.dur, delay: T.portrait.at, ease: 'Back.easeOut' });
    }

    // ---- 스피드 라인(띠 기울기 방향, 초상 쪽으로 흐름) ----
    if (!lite) {
        const sl = scene.add.graphics().setBlendMode(1);
        c.add(sl);
        const n = W < H ? 12 : 20;
        const lines = Array.from({ length: n }, () => ({ off: (Math.random() * 2 - 1) * hb * 1.25, len: W * (0.12 + Math.random() * 0.3), ph: Math.random(), th: 1.5 + Math.random() * 3, white: Math.random() < 0.4 }));
        const p = { t: 0 };
        const draw = () => {
            if (!sl.scene) return;
            sl.clear();
            const fade = p.t < 0.1 ? p.t / 0.1 : p.t > 0.8 ? (1 - p.t) / 0.2 : 1;
            lines.forEach((l) => {
                const u = (l.ph + p.t * 2.2) % 1; // 이름 쪽 -> 초상 쪽
                const head = dir > 0 ? W * (1.1 - u * 1.4) : W * (-0.1 + u * 1.4);
                const tail = head + dir * l.len;
                const y0 = yAt(head) + l.off; const y1 = yAt(tail) + l.off;
                sl.fillStyle(l.white ? 0xffffff : col, 0.55 * fade).fillTriangle(head, y0, tail, y1 - l.th / 2, tail, y1 + l.th / 2);
            });
        };
        draw();
        tw({ targets: p, to: { t: 1 }, duration: ms, ease: 'Linear', onUpdate: draw });
    }

    // ---- 초상(대각선 슬라이드 + 스케일 인) / 엠블럼 폴백 ----
    const pLayer = scene.add.container(0, 0);
    c.add(pLayer);
    let portrait = null; let emblem = null;
    const keys = cutinPortraitKeys(opts.owner);
    const putPortrait = (key, late) => {
        if (ended || !pLayer.scene || portrait || !scene.textures.exists(key)) return;
        const img = scene.add.image(P.x, P.bottom, key).setOrigin(0.5, 1).setFlipX(!ally);
        img.setScale(Math.min(P.w / Math.max(1, img.frame.realWidth), P.h / Math.max(1, img.frame.realHeight)));
        const s1 = img.scale;
        portrait = img;
        if (!lite && !late) { // 잔상 2장(병종색 채움), 본체보다 늦게 따라와 사라짐
            [0.5, 0.28].forEach((a, i) => {
                const ghost = scene.add.image(P.fromX, P.fromY, key).setOrigin(0.5, 1).setFlipX(!ally).setScale(s1 * 1.2).setAlpha(0);
                if (ghost.setTintMode) ghost.setTint(col).setTintMode(Phaser.TintModes?.FILL ?? 1); else ghost.setTint?.(col);
                pLayer.add(ghost);
                tw({ targets: ghost, to: { x: P.x - dir * (18 + i * 16), y: P.bottom, alpha: a, scale: s1 }, duration: T.portrait.dur, delay: T.portrait.at + 30 * (i + 1), ease: 'Cubic.easeOut',
                    onComplete: () => tw({ targets: ghost, to: { alpha: 0 }, duration: 180 }) });
            });
        }
        pLayer.add(img);
        if (emblem) tw({ targets: emblem, to: { alpha: 0 }, duration: 120 });
        if (lite || late) { img.setAlpha(0); tw({ targets: img, to: { alpha: 1 }, duration: lite ? 160 : 140 }); return; }
        img.setPosition(P.fromX, P.fromY).setScale(s1 * 1.18).setAlpha(0);
        tw({ targets: img, to: { x: P.x, y: P.bottom, scale: s1, alpha: 1 }, duration: T.portrait.dur, delay: T.portrait.at, ease: 'Expo.easeOut' });
        tw({ targets: img, to: { x: P.x + dir * 14 }, duration: Math.max(1, T.out.at - T.portrait.at - T.portrait.dur), delay: T.portrait.at + T.portrait.dur, ease: 'Linear' }); // 정지 구간 미세 전진
    };
    const tex = keys.map(texKey).find((k) => scene.textures.exists(k));
    if (tex) putPortrait(tex, false);
    else {
        // 엠블럼: 진영색 원판 + 병종색 고리 + 병종 아이콘
        const ex = P.x; const ey = P.glowY; const r = Math.min(P.w * 0.42, lay.bandH * 0.9);
        emblem = scene.add.container(ex, ey);
        const eg = scene.add.graphics();
        eg.fillStyle(team.band, 0.95).fillCircle(0, 0, r).lineStyle(5, col, 1).strokeCircle(0, 0, r).lineStyle(2, team.edge, 0.9).strokeCircle(0, 0, r * 0.82);
        emblem.add(eg);
        const ic = troopIcon(scene, type, 0, 0, Math.round(r * 1.1), { max: r * 1.3, glyphSize: Math.round(r * 0.9) });
        if (ic) emblem.add(ic);
        emblem.setScale(0.4).setAlpha(0);
        pLayer.add(emblem);
        tw({ targets: emblem, to: { scale: 1, alpha: 1 }, duration: T.portrait.dur, delay: T.portrait.at, ease: 'Back.easeOut' });
        keys.forEach((k) => ensurePortraitTex(scene, k, (key) => { if (key) putPortrait(key, true); }));
    }

    // ---- 앞 띠(초상 바닥을 가리는 진영색 띠, 반대 방향에서 진입) ----
    const front = scene.add.container(dir * W, 0);
    const fg = scene.add.graphics();
    slab(fg, lay.stripe.top, lay.stripe.bottom, team.stripe, lite ? 0.85 : 0.96);
    slab(fg, lay.stripe.bottom - 4, lay.stripe.bottom + 2, 0x000000, 0.4);
    edgeLine(fg, lay.stripe.top, 3, team.edge, 1);
    if (!lite) slab(fg, lay.stripe.top + 4, lay.stripe.top + 10, 0xffffff, 0.16); // 광택
    front.add(fg);
    c.add(front);
    tw({ targets: front, to: { x: 0 }, duration: T.stripe.dur, delay: T.stripe.at, ease: 'Cubic.easeOut' });

    // ---- 섬광 사선(띠를 가로지르는 흰 빛, 가산) ----
    if (!lite) {
        const fl = scene.add.graphics().setBlendMode(1);
        c.add(fl);
        const q = { t: 0 };
        const draw = () => {
            if (!fl.scene) return;
            fl.clear();
            const x = dir > 0 ? -W * 0.2 + q.t * W * 1.4 : W * 1.2 - q.t * W * 1.4; const w = W * 0.05;
            fl.fillStyle(0xffffff, 0.45 * (1 - q.t)).fillPoints([{ x: x - w, y: yAt(x) - hb }, { x: x + w * 0.4, y: yAt(x) - hb }, { x: x + w, y: yAt(x) + hb }, { x: x - w * 0.4, y: yAt(x) + hb }], true);
        };
        tw({ targets: q, to: { t: 1 }, duration: T.slash.dur, delay: T.slash.at, ease: 'Quad.easeOut', onUpdate: draw, onComplete: () => fl.clear?.() });
    }

    // ---- 스킬 이름(글자별 스태거: 확대 -> 1, 외곽선 + 병종색 그림자) ----
    const nameBox = scene.add.container(lay.name.x, lay.name.y);
    c.add(nameBox);
    const size = lay.tall ? CUTIN.nameSize.tall : CUTIN.nameSize.wide;
    const st = textStyle(size, '#FFF4D6', { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: Math.max(6, Math.round(size * 0.14)) });
    const chars = lite ? [String(opts.name ?? '스킬')] : [...String(opts.name ?? '스킬')];
    const ts = chars.map((ch) => {
        const t = scene.add.text(0, 0, ch, st).setOrigin(0.5);
        if (!lite) t.setShadow(4, 5, hexCss(col), 0, true, true);
        return t;
    });
    const gap = Math.round(size * 0.02);
    const total = ts.reduce((s, t) => s + t.width, 0) + gap * Math.max(0, ts.length - 1);
    let x = -total / 2;
    ts.forEach((t) => { t.x = x + t.width / 2; x += t.width + gap; });
    nameBox.add(ts);
    nameBox.setScale(fitScale(total, lay.name.maxW));
    ts.forEach((t, i) => {
        if (lite) { t.setAlpha(0); tw({ targets: t, to: { alpha: 1 }, duration: 160, delay: 80 }); return; }
        const fy = t.y; t.setAlpha(0).setScale(2.2).setY(fy - size * 0.35).setAngle(-dir * 12);
        tw({ targets: t, to: { alpha: 1, scale: 1, y: fy, angle: 0 }, duration: T.name.dur, delay: T.name.at + T.name.stagger * i, ease: 'Back.easeOut' });
    });

    // ---- 영웅 이름(작은 글씨 + 양옆 마름모) ----
    if (opts.who) {
        const sub = scene.add.text(lay.sub.x, lay.sub.y, `◆  ${opts.who}  ◆`, textStyle(lay.tall ? CUTIN.subSize.tall : CUTIN.subSize.wide, team.text, { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: 4 })).setOrigin(0.5).setAlpha(0);
        if (sub.width > lay.name.maxW) sub.setScale(lay.name.maxW / sub.width);
        c.add(sub);
        tw({ targets: sub, to: { alpha: 1 }, duration: T.sub.dur, delay: lite ? 100 : T.sub.at });
    }

    // ---- 퇴장: 띠는 진행 방향으로 빠지고 전체 페이드 ----
    wt(T.out.at, () => {
        if (ended || !c.scene) { finish(); return; } // 외부 파괴(다음 간소 컷인이 교체·씬 종료)여도 done 1회 보장
        tw({ targets: band, to: { x: dir * W * 0.6 }, duration: T.out.dur, ease: 'Cubic.easeIn' });
        tw({ targets: front, to: { x: -dir * W * 0.6 }, duration: T.out.dur, ease: 'Cubic.easeIn' });
        tw({ targets: c, to: { alpha: 0 }, duration: T.out.dur, ease: 'Quad.easeIn', onComplete: finish });
    });
    return c;
}
