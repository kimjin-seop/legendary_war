import { makeText, shrinkToFit } from './common.js';
import { COLOR, CSS, syncView } from '../theme.js';
import { L, setupCamera } from '../layout.js';
import { addBrandLogo, loadingLogoBox } from '../brand.js';
import { settings } from '../settings.js';

// 로딩 화면(2026-11-14 재디자인): 세로형 메인 로고(Boot 에서 미리 받은 logo_main.webp) 가운데 + 은은한 금빛 글로우 + 얇은 진행 바(진행률 %) + 짧은 문구.
// 이전 회색 스켈레톤 상자(320x16, 깜빡임)는 쓰지 않는다. 레이아웃('layout' 이벤트)이 바뀌면 같은 진행률로 다시 그린다(로딩 중 회전·주소창 변화 대응).
// 반환 { set(p, detail), destroy() }. 씬 shutdown 시 자동 정리.
const TAGLINES = ['전장을 펼치는 중…', '서고의 기록을 펼치는 중…', '깃발을 올리는 중…', '옛 지도를 펴는 중…'];
const GLOW = 'loading_glow';

function ensureGlow(scene) {
    if (scene.textures.exists(GLOW)) return true;
    try {
        const S = 256;
        const ct = scene.textures.createCanvas(GLOW, S, S);
        const ctx = ct.getContext();
        const g = ctx.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
        g.addColorStop(0, 'rgba(240,213,140,0.40)'); // COLOR.accentLight
        g.addColorStop(0.45, 'rgba(201,162,75,0.14)'); // COLOR.accent
        g.addColorStop(1, 'rgba(201,162,75,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, S, S);
        ct.refresh();
        return true;
    } catch (e) {
        console.warn('[loading] 글로우 텍스처 실패(생략)', e);
        return false;
    }
}

// 옵션(2026-11-14 로딩 화면 통일: 편성·전투·대사 진입의 '…불러오는 중' 글자 대신 같은 화면):
//  overlay     = 이미 그려진 씬 위에 덮는다(카메라 재설정 안 함, 화면 전체 배경색 판 + 입력 차단, depth 지정)
//  indeterminate = 진행률을 모르는 대기(서버 응답 등): % 숨김, 바 위를 짧은 금빛 구간이 왕복
//  delay(ms)   = 이 시간 안에 끝나면 아무것도 그리지 않는다(빠른 응답 깜빡임 방지)
//  depth       = overlay 객체 depth(기본 900: 전투 HUD 100·컷신 500 위, 모달 1000·토스트 2000 아래)
export function createLoadingView(scene, { tagline, overlay = false, indeterminate = false, delay = 0, depth = 900 } = {}) {
    const line = tagline || TAGLINES[Math.floor(Math.random() * TAGLINES.length)];
    let objs = [];
    let ui = null;
    let p = 0;
    let detail = '';
    let first = !overlay; // 덮개(대기) 화면은 등장 연출 없이 즉시(직전 에셋 로딩 화면과 이어 보이게)
    let alive = true;
    let pending = null;

    const apply = () => {
        if (!ui || indeterminate) { if (ui?.detail.scene) ui.detail.setText(detail); return; }
        ui.fill.setScale(Math.max(0.001, p), 1);
        ui.head?.setX(ui.x0 + ui.barW * p).setVisible(p > 0.005);
        if (ui.pct.scene) ui.pct.setText(`${Math.round(p * 100)}%`);
        if (ui.detail.scene) ui.detail.setText(detail);
    };

    const build = () => {
        if (!alive) return; // (preload 단계는 isActive() = false 라 상태 검사는 하지 않는다)
        if (objs.length) scene.tweens.killTweensOf(objs);
        objs.forEach((o) => o?.destroy?.());
        objs = [];
        syncView();
        if (!overlay) setupCamera(scene, CSS.bg);
        else {
            // 아래 씬(HUD·편성 화면)을 가리고 입력을 막는 배경 판(로딩 화면과 같은 배경색)
            const cover = scene.add.rectangle(0, 0, L.lw, L.lh, COLOR.bg, 1).setOrigin(0).setInteractive();
            objs.push(cover);
        }
        const fxLevel = settings.get().fxLevel;
        const anim = first && fxLevel !== 2;
        const cx = L.lw / 2;
        // 로고 표시 크기(brand.addBrandLogo 와 같은 계산): 비율 고정, 상자 안
        const lb = loadingLogoBox();
        let lgW = lb.maxW;
        let lgH = lgW * lb.v.ratio;
        if (lgH > lb.maxH) { lgH = lb.maxH; lgW = lgH / lb.v.ratio; }
        const barW = Math.round(Math.min(L.lw * 0.6, 300));
        const GAP = 28; // 로고 아래 ~ 문구 줄
        const ROW = 22; // 문구·% 줄 높이
        const block = lgH + GAP + ROW + 10 + 3 + 12 + 16; // 로고 + 문구 줄 + 바 + 상세 줄
        const top = Math.max(L.safe.t + 12, (L.lh - block) / 2 - 8);
        const logoCy = top + lgH / 2;

        // 은은한 글로우(로고 뒤). 효과 끄기면 정지
        if (ensureGlow(scene)) {
            const gs = Math.max(lgW, lgH) * 1.7;
            const glow = scene.add.image(cx, logoCy, GLOW).setDisplaySize(gs, gs).setAlpha(anim ? 0 : 0.85);
            objs.push(glow);
            if (fxLevel !== 2) {
                if (anim) scene.tweens.add({ targets: glow, alpha: 0.85, duration: fxLevel === 1 ? 300 : 900, ease: 'Sine.easeOut' });
                scene.tweens.add({ targets: glow, scale: glow.scale * 1.06, alpha: { from: 0.85, to: 0.55 }, duration: 1800, delay: anim ? 900 : 0, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            }
        }
        // 로고(텍스처 없으면 '레전드리 워' 글자 폴백). 첫 표시만 부드러운 페이드 업
        const logo = addBrandLogo(scene, lb.v, cx, logoCy, { maxW: lb.maxW, maxH: lb.maxH, origin: [0.5, 0.5], fallbackSize: 40, fallbackSub: true, lazy: false }).obj;
        objs.push(logo);
        if (anim) {
            const y = logo.y;
            logo.setAlpha(0).setY(y + 10);
            scene.tweens.add({ targets: logo, alpha: 1, y, duration: fxLevel === 1 ? 300 : 800, ease: 'Cubic.easeOut' });
        }

        // 문구(왼쪽) + 진행률(오른쪽) 한 줄, 그 아래 얇은 진행 바, 그 아래 용량(있을 때)
        const x0 = cx - barW / 2;
        const rowY = top + lgH + GAP + ROW / 2;
        const pct = makeText(scene, x0 + barW, rowY, indeterminate ? '' : '0%', { size: 15, bold: true, color: CSS.accent, origin: [1, 0.5] });
        // 대기(indeterminate) 문구는 % 자리가 없으니 바 폭 전체를 쓰고 가운데 정렬
        const tag = indeterminate
            ? makeText(scene, cx, rowY, line, { size: 15, color: CSS.text, origin: [0.5, 0.5] }).setAlpha(0.88)
            : makeText(scene, x0, rowY, line, { size: 15, color: CSS.text, origin: [0, 0.5] }).setAlpha(0.88);
        shrinkToFit(tag, indeterminate ? barW : barW - 56, 11);
        const barY = rowY + ROW / 2 + 10;
        const track = scene.add.rectangle(x0, barY, barW, 3, COLOR.panelLight, 0.7).setOrigin(0);
        const segW = Math.round(barW * 0.28);
        const fill = indeterminate
            ? scene.add.rectangle(x0, barY, segW, 3, COLOR.accent, 1).setOrigin(0)
            : scene.add.rectangle(x0, barY, barW, 3, COLOR.accent, 1).setOrigin(0);
        const head = scene.textures.exists(GLOW) ? scene.add.image(x0, barY + 1.5, GLOW).setDisplaySize(22, 22) : null;
        const det = makeText(scene, cx, barY + 12, '', { size: 12, color: CSS.muted, origin: [0.5, 0] }).setAlpha(0.75);
        objs.push(pct, tag, track, fill, det);
        if (head) objs.push(head);
        if (indeterminate) {
            // 금빛 구간 왕복(효과 끄기 = 가운데 고정)
            if (head) head.setX(x0 + segW).setVisible(true);
            if (fxLevel === 2) { fill.setX(cx - segW / 2); head?.setX(cx + segW / 2); }
            else {
                scene.tweens.add({ targets: fill, x: x0 + barW - segW, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
                if (head) scene.tweens.add({ targets: head, x: x0 + barW, duration: 1100, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
            }
        }
        if (anim) [pct, tag, track, fill, det, head].filter(Boolean).forEach((o) => { const a = o.alpha; o.setAlpha(0); scene.tweens.add({ targets: o, alpha: a, duration: fxLevel === 1 ? 200 : 500, delay: fxLevel === 1 ? 0 : 250, ease: 'Sine.easeOut' }); });
        if (overlay) objs.forEach((o) => o?.setDepth?.(depth));
        ui = { fill, head, pct, detail: det, x0, barW };
        first = false;
        apply();
    };

    const onLayout = () => { if (alive && !pending) build(); };
    const destroy = () => {
        if (!alive) return;
        alive = false;
        pending?.remove(false);
        pending = null;
        scene.game?.events.off('layout', onLayout);
        if (objs.length) scene.tweens?.killTweensOf(objs);
        objs.forEach((o) => o?.destroy?.());
        objs = [];
        ui = null;
    };
    if (delay > 0 && scene.time) pending = scene.time.delayedCall(delay, () => { pending = null; build(); });
    else build();
    scene.game.events.on('layout', onLayout);
    scene.events.once('shutdown', destroy);
    return {
        set(v, d = '') { p = Math.max(0, Math.min(1, Number(v) || 0)); detail = d; apply(); },
        destroy,
        // 기존 '불러오는 중' 글자 객체 자리에 그대로 쓰기 위한 호환(살아 있으면 scene, 정리됐으면 null)
        get scene() { return alive ? scene : null; },
    };
}
