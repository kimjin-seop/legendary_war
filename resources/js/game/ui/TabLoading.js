import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { settings } from '../settings.js';
import { makeText } from './common.js';
import { slice, skinOn } from './skin.js';
import { brandEmblem } from '../brand.js';

// 로비 탭 본문 로딩 표현(2026-11-14 재디자인, 사용자 '디자인이 안되어있음'):
//  - createTabSkeleton: 실제 화면 모양(영웅·도감 등 = 카드 격자, 그 외 = 목록 행)에 가까운 자리표시자. 둥근 모서리 + 금 헤어라인 + 완만한 대각선 shimmer
//  - createTabLoadingBadge: 탭 본문 중앙의 작은 패널(panel.sub) 안에 금빛 회전 고리 + 문장(있으면, 없으면 금 마름모) + '불러오는 중…'
// 연출: 효과 '풀'(fxLevel 0)이고 prefers-reduced-motion 이 아닐 때만 움직인다(그 외 정지 화면).
// 정리: 두 객체 모두 Container. destroy 시 자기 트윈을 정리한다. 배지는 Lobby.done() 이 숨기기만 하므로(파괴 X) stopAnim() 으로 회전을 멈춘다.

export function motionOn() {
    if (settings.get().fxLevel !== 0) return false;
    try { return !(typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return true; }
}

const killOnDestroy = (scene, c, targets) => c.once('destroy', () => { if (targets.length) scene.tweens?.killTweensOf(targets); });

// area = {x, y, w, h}(패널 좌표). kind 'card' = cols x 비율 ratio(높이/폭) 카드, 'row' = 전폭 행
export function createTabSkeleton(scene, area, { kind = 'row', cols = 1, ratio = 1.4, gap = 12 } = {}) {
    const c = scene.add.container(area.x, area.y);
    const shims = [];
    const anim = motionOn();
    const usable = Math.max(40, area.w - 8); // 실제 목록과 같은 스크롤바 여유
    const items = [];
    if (kind === 'card') {
        const n = Math.max(1, cols);
        const cw = Math.floor((usable - gap * (n - 1)) / n);
        let ch = Math.round(cw * ratio);
        if (ch > area.h - 4) ch = Math.max(40, area.h - 4); // 한 줄도 다 안 들어가는 낮은 화면: 본문 높이에 맞춤
        const rows = Math.max(1, Math.min(3, Math.floor((area.h + gap) / (ch + gap))));
        const ox = Math.floor((usable - (cw * n + gap * (n - 1))) / 2);
        for (let r = 0; r < rows; r++) for (let i = 0; i < n; i++) items.push({ x: ox + i * (cw + gap), y: r * (ch + gap), w: cw, h: ch, wave: i + r, card: true });
    } else {
        const g = 10;
        let rh = L.short ? 46 : 58;
        if (rh > area.h - 4) rh = Math.max(28, area.h - 4);
        const n = Math.max(1, Math.min(6, Math.floor((area.h + g) / (rh + g))));
        for (let r = 0; r < n; r++) items.push({ x: 0, y: r * (rh + g), w: usable, h: rh, wave: r, card: false });
    }
    items.forEach((it) => {
        const rad = Math.max(4, Math.min(10, Math.min(it.w, it.h) * 0.06));
        const g = scene.add.graphics({ x: it.x, y: it.y });
        g.fillStyle(COLOR.navyDeep, 0.78).fillRoundedRect(0, 0, it.w, it.h, rad);
        g.fillStyle(COLOR.panelLight, 0.5);
        if (it.card) {
            const pd = Math.max(5, Math.round(it.w * 0.05));
            const bh = Math.max(12, Math.round(it.h * 0.64));
            g.fillRoundedRect(pd, pd, it.w - pd * 2, bh, Math.max(3, rad - 3)); // 초상화 자리
            const left = it.h - pd - bh - pd;
            if (left >= 18) {
                const lh = Math.max(6, Math.min(12, Math.round(left * 0.22)));
                const y1 = pd + bh + Math.round(left * 0.28);
                g.fillRoundedRect((it.w - it.w * 0.62) / 2, y1, it.w * 0.62, lh, lh / 2); // 이름 줄
                if (y1 + lh * 2 + 4 <= it.h - pd) g.fillRoundedRect((it.w - it.w * 0.4) / 2, y1 + lh + 6, it.w * 0.4, lh * 0.8, lh * 0.4); // 보조 줄
            }
        } else {
            const th = Math.max(16, it.h - 16);
            g.fillRoundedRect(8, (it.h - th) / 2, th, th, 5); // 썸네일 자리
            const tx = 8 + th + 12;
            const room = Math.max(40, it.w - tx - 100);
            g.fillRoundedRect(tx, it.h * 0.3, Math.min(280, room * 0.55), 10, 5);
            g.fillRoundedRect(tx, it.h * 0.3 + 18, Math.min(180, room * 0.35), 8, 4);
            if (it.w > 260) g.fillRoundedRect(it.w - 84, (it.h - Math.max(14, it.h - 26)) / 2, 72, Math.max(14, it.h - 26), 6); // 버튼 자리
        }
        g.lineStyle(1, COLOR.accent, 0.42).strokeRoundedRect(0.5, 0.5, it.w - 1, it.h - 1, rad); // 금 헤어라인
        c.add(g);
        // shimmer: 밝은 금빛 막을 아주 옅게 올렸다 내림. 열+행 지연으로 왼쪽 위에서 오른쪽 아래로 흐르는 물결
        if (anim) {
            const s = scene.add.graphics({ x: it.x, y: it.y });
            s.fillStyle(COLOR.accentLight, 1).fillRoundedRect(0, 0, it.w, it.h, rad);
            s.setAlpha(0);
            c.add(s);
            shims.push(s);
            scene.tweens.add({ targets: s, alpha: 0.07, duration: 1000, delay: it.wave * 140, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
        }
    });
    killOnDestroy(scene, c, shims);
    return c;
}

// 중앙 로딩 배지. (cx, cy) = 패널 좌표 중심. 반환 Container + setText(무시, Lobby.done 호환) + stopAnim()
export function createTabLoadingBadge(scene, cx, cy, { text = '불러오는 중…', fadeIn = true } = {}) {
    const compact = L.short; // 가로 폰: 가로 배치(낮은 높이)
    const W = compact ? 196 : 176;
    const H = compact ? 50 : 116;
    const c = scene.add.container(cx, cy);
    const tweens = [];
    // 받침: 스킨 panel.sub(금테 남색), 없으면 남색 둥근 판 + 금선
    const sk = skinOn(scene) ? slice(scene, 'panel_sub', W, H, 'panel', { corner: 0.6 }) : null;
    if (sk?.skinAtlas) c.add(sk.setPosition(-W / 2, -H / 2).setAlpha(0.94));
    else {
        sk?.destroy();
        const g = scene.add.graphics();
        g.fillStyle(COLOR.navyDeep, 0.92).fillRoundedRect(-W / 2, -H / 2, W, H, 10);
        g.lineStyle(1, COLOR.accent, 0.6).strokeRoundedRect(-W / 2 + 0.5, -H / 2 + 0.5, W - 1, H - 1, 10);
        c.add(g);
    }
    const R = compact ? 14 : 22;
    const rx = compact ? -W / 2 + 14 + R : 0;
    const ry = compact ? 0 : -16;
    // 고리: 옅은 금 트랙 + 밝은 금 호(회전)
    const track = scene.add.graphics({ x: rx, y: ry });
    track.lineStyle(compact ? 2 : 3, COLOR.accent, 0.28).strokeCircle(0, 0, R);
    const arc = scene.add.graphics({ x: rx, y: ry });
    arc.lineStyle(compact ? 2 : 3, COLOR.accentLight, 1);
    arc.beginPath(); arc.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + Math.PI * 0.55, false); arc.strokePath();
    arc.fillStyle(COLOR.accentLight, 1).fillCircle(R * Math.cos(Math.PI * 0.05), R * Math.sin(Math.PI * 0.05), compact ? 2 : 2.5); // 호 끝 금빛 점
    c.add([track, arc]);
    // 가운데 문양: 이미 받은 문장 로고(ui.logo.emblem)가 있으면 재사용(새 로드 안 함), 없으면 금 마름모
    const ek = [brandEmblem(0), brandEmblem(999)].map((v) => v?.key).find((k) => k && scene.textures.exists(k));
    if (ek) {
        const eh = R * 1.15;
        const fr = scene.textures.getFrame(ek);
        const ew = fr?.realHeight ? eh * (fr.realWidth / fr.realHeight) : eh;
        c.add(scene.add.image(rx, ry, ek).setDisplaySize(ew, eh));
    } else {
        const d = scene.add.graphics({ x: rx, y: ry });
        const s = R * 0.42;
        d.fillStyle(COLOR.accent, 0.95).fillPoints([{ x: 0, y: -s }, { x: s, y: 0 }, { x: 0, y: s }, { x: -s, y: 0 }], true);
        d.fillStyle(COLOR.ink, 1).fillPoints([{ x: 0, y: -s * 0.45 }, { x: s * 0.45, y: 0 }, { x: 0, y: s * 0.45 }, { x: -s * 0.45, y: 0 }], true);
        c.add(d);
    }
    const label = compact
        ? makeText(scene, rx + R + 12, 0, text, { size: 15, bold: true, color: CSS.text, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } })
        : makeText(scene, 0, ry + R + 22, text, { size: 15, bold: true, color: CSS.text, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
    label.setAlpha(0.9);
    c.add(label);
    if (motionOn()) {
        tweens.push(scene.tweens.add({ targets: arc, angle: 360, duration: 1400, repeat: -1, ease: 'Linear' }));
        if (fadeIn) { c.setAlpha(0); tweens.push(scene.tweens.add({ targets: c, alpha: 1, duration: 220, delay: 120, ease: 'Sine.easeOut' })); }
    }
    c.setText = () => c; // Lobby.done() 의 loading.setText('') 호환(문구 객체였던 시절)
    c.stopAnim = () => { tweens.forEach((t) => t?.remove?.()); tweens.length = 0; scene.tweens?.killTweensOf([arc, c]); };
    c.once('destroy', () => c.stopAnim());
    return c;
}
