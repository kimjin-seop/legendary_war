import { COLOR, CSS } from '../theme.js';
import { makeText, fitText } from './common.js';
import { Button } from './Button.js';
import { slice, icon, skinHas, skinImage } from './skin.js';
import { manifestHas } from '../assets.js';
import { withUiImage } from './uiImage.js';
import { fixJosa } from '../systems/josa.js';
import { isInstant } from './motion.js';

// 퀘스트 카드(사용자 2026-11-04 시안, 안아트 스펙 public/assets/ui/quest/quest_ui_spec.json):
//  카드 프레임 ui.quest.card.normal / .claimable / .done (9-slice @2x, 인셋 30px · claimable 38px, claimable 은 바깥 글로우 4px@1x 라 카드보다 사방 4px 크게)
//  썸네일 ui.quest.thumb.*(320x192@2x, 표시 160x96, 매핑 quest_thumb_map.json: quests[code] -> fallback), 수령 완료 = 밝기 75%
//  상태 버튼: 수령 완료(체크, 어두움) / 진행 중 ›(어두움) / 수령(상자 result.ico.chest.sm + btn.glow 맥동). XP 아이콘 result.ico.exp.sm, 골드 ico.gold
//  키가 아직 없거나 로드 전이면 기존 스킨(panel_sub)·코드 도형으로 그린다(텍스트는 모두 FE 렌더)
const SPEC = { title: '#F4E6C0', desc: '#B8B2A2', gold: '#F0C65A', xp: '#9FD3FF', doneLabel: '#BDB6A2', thumb: [160, 96] };

// 썸네일 매핑(지연 1회 로드). 실패하면 null(빈 판)
let mapP = null; let mapFailAt = 0;
// 실패(null)는 영구 캐시하지 않고 30초 뒤 재시도(정검수)
const thumbMap = () => { if (mapP && mapFailAt && Date.now() - mapFailAt > 30000) { mapP = null; mapFailAt = 0; } return (mapP ??= fetch('/assets/ui/quest/quest_thumb_map.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).catch(() => null).then((m) => { if (!m) mapFailAt = Date.now(); return m; })); };
export async function questThumbKey(code) {
    const m = await thumbMap();
    const k = m?.quests?.[code] ?? m?.fallback ?? null;
    return k && manifestHas(k) ? k : (m?.fallback && manifestHas(m.fallback) ? m.fallback : null);
}

// @2x 9-slice(인셋 = @2x 픽셀): 표시 w x h(설계 단위)
const nine2x = (scene, k, w, h, ins) => scene.add.nineslice(0, 0, k, undefined, w * 2, h * 2, ins, ins, ins, ins).setOrigin(0).setScale(0.5);

function codeIcon(scene, kind, x, y) { // 키 없을 때 폴백: 체크 / 꺾쇠 / 상자
    const g = scene.add.graphics({ x, y });
    if (kind === 'done') g.lineStyle(3, 0xbdb6a2, 1).lineBetween(-7, 0, -2, 5).lineBetween(-2, 5, 8, -6);
    else if (kind === 'go') g.lineStyle(2.5, 0xe6d8b0, 1).lineBetween(-3, -6, 3, 0).lineBetween(3, 0, -3, 6);
    else { g.fillStyle(0x8a4a1c, 1).fillRoundedRect(-11, -6, 22, 14, 2).fillStyle(0xb86a2c, 1).fillRoundedRect(-11, -11, 22, 7, { tl: 4, tr: 4, bl: 0, br: 0 }); g.lineStyle(1.5, 0xf0d58c, 1).strokeRoundedRect(-11, -11, 22, 19, 3).lineBetween(-11, -4, 11, -4); g.fillStyle(0xf0d58c, 1).fillRect(-2, -6, 4, 5); }
    return g;
}
const fmt = (n) => Number(n ?? 0).toLocaleString('ko-KR');

// q: {code,title,desc,target,progress,completed,claimed,claimable,claim_blocked,reward{gold,user_exp}}
export function questCard(scene, q, w, h, { onClaim, onSignup } = {}) {
    const c = scene.add.container(0, 0); c.clipH = h;
    const state = q.claimed ? 'done' : q.claimable ? 'claimable' : 'normal';
    // 프레임: 키(9-slice) 도착 전에는 스킨 panel_sub, 도착하면 교체
    const frameBox = scene.add.container(0, 0); c.add(frameBox);
    frameBox.add(scene.add.rectangle(0, 0, w, h, state === 'claimable' ? 0x2a2214 : 0x141a28, 0.94).setOrigin(0));
    const tmp = slice(scene, 'panel_sub', w, h, 'panel'); frameBox.add(tmp);
    withUiImage(scene, `ui.quest.card.${state}`, (k) => {
        if (!frameBox.scene) return;
        const g = state === 'claimable' ? 4 : 0; const ins = state === 'claimable' ? 38 : 30;
        const fr = nine2x(scene, k, w + g * 2, h + g * 2, ins).setPosition(-g, -g);
        tmp.setVisible(false); frameBox.add(fr);
    });
    // 썸네일(왼쪽, 16:9 표시 160x96 기준, 카드 높이에 맞춤)
    // 좁은 카드(390 등, 폭 < 520): 썸네일 = 카드 폭 22% 이하(제목·설명 자리 확보, gacha111: 제목 잘림·설명 3줄)
    const narrow0 = w < 520;
    let tH = Math.min(SPEC.thumb[1], h - 16); let tW = Math.round(tH * (SPEC.thumb[0] / SPEC.thumb[1]));
    if (narrow0 && tW > w * 0.22) { tW = Math.round(w * 0.22); tH = Math.round(tW * (SPEC.thumb[1] / SPEC.thumb[0])); }
    const tx0 = 8; const ty0 = narrow0 ? 10 : (h - tH) / 2;
    const holder = scene.add.container(tx0, ty0); c.add(holder);
    // 자리 판 없음: 둥근 모서리 썸네일(알파) 뒤에 직각 판이 비치지 않게
    questThumbKey(q.code).then((lg) => {
        if (!lg || !holder.scene) return;
        withUiImage(scene, lg, (k) => { if (!holder.scene) return; const im = scene.add.image(0, 0, k).setOrigin(0).setDisplaySize(tW, tH); if (state === 'done') im.setTint(0xbfbfbf); holder.add(im); }); // 썸네일 재처리(안아트 2026-11-04: 밝게·둥근 모서리 알파) -> FE 밝기 보정 제거, 수령 완료 75% 유지
    });
    // 상태 버튼(오른쪽, 영역 150)
    const narrow = w < 520;
    const bw = narrow ? 108 : 150; const bh = state === 'claimable' && !narrow ? 52 : 44; const bx = w - bw - 12; const by = (h - bh) / 2;
    const blocked = q.claim_blocked === 'guest_not_allowed' && q.completed && !q.claimed;
    const kind = q.claimed ? 'done' : q.claimable ? 'claim' : blocked ? 'signup' : 'go';
    const label = { done: '수령 완료', claim: '수령', signup: '가입 후 수령', go: q.completed ? '완료' : '진행 중' }[kind];
    if (kind === 'claim' && skinHas(scene, 'btn.glow')) { // 수령 버튼 뒤 금빛 글로우 맥동(1.2초, 알파 0.5 <-> 1)
        const gl = skinImage(scene, 'btn.glow'); gl.setPosition(bx + bw / 2, by + bh / 2).setDisplaySize(bw + 24, bh + 20); c.add(gl);
        if (!isInstant()) { const tw = scene.tweens.add({ targets: gl, alpha: { from: 0.5, to: 1 }, duration: 1200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); gl.once('destroy', () => tw.remove()); } // 카드 파괴 시 무한 트윈 정리(정검수)
    }
    const btn = new Button(scene, { x: bx, y: by, w: bw, h: bh, label, size: narrow ? 13 : 16, variant: kind === 'claim' ? 'primary' : 'default', disabled: kind === 'done' || kind === 'go', onClick: () => (kind === 'claim' ? onClaim?.(q) : kind === 'signup' ? onSignup?.() : null) });
    if (kind === 'done' && btn.label) btn.label.setColor?.(SPEC.doneLabel);
    if (kind === 'go' && btn.label) { btn.label.setColor?.('#E6D8B0'); btn.label.setAlpha?.(1); } // 진행 중: 비활성 회색 대신 스펙 색(시안처럼 또렷하게, 누를 수는 없음)
    if (kind === 'go') withUiImage(scene, 'ui.quest.btn.progress', (k) => { if (!btn.scene) return; const fh = scene.textures.getFrame(k)?.realHeight || 88; const sc = bh / fh; const ns = scene.add.nineslice(0, 0, k, undefined, bw / sc, fh, 26, 26, 0, 0).setOrigin(0.5).setScale(sc); btn.face.addAt(ns, 0); btn.ns?.setVisible(false); }); // '진행 중' 전용 3-slice(진한 남색 + 얇은 금테, @2x 인셋 26)
    c.add(btn);
    // 버튼 아이콘 + 라벨 가운데 묶음: 수령 = 상자(왼쪽), 수령 완료 = 체크(왼쪽), 진행 중 = ›(오른쪽)
    if (kind !== 'signup' && btn.label) {
        const lw = btn.label.displayWidth; const iw = kind === 'claim' ? 26 : 16; const gap = 6; const tot = lw + iw + gap;
        const left = kind !== 'go'; const cx = bx + bw / 2; const cy = by + bh / 2;
        const ix = left ? cx - tot / 2 + iw / 2 : cx + tot / 2 - iw / 2;
        btn.label.setX(left ? -tot / 2 + iw + gap + lw / 2 : -tot / 2 + lw / 2);
        const fb = codeIcon(scene, kind, ix, cy); c.add(fb);
        if (kind === 'claim') withUiImage(scene, 'result.ico.chest.sm', (k) => { if (!fb.scene) return; fb.setVisible(false); c.add(scene.add.image(ix, cy, k).setDisplaySize(26, 26)); });
        else if (kind === 'done' && skinHas(scene, 'ico.check')) { fb.setVisible(false); const ck = skinImage(scene, 'ico.check'); ck.setPosition(ix, cy).setDisplaySize(18, 18).setTint(0xb0aa98); c.add(ck); } // 채도 0·밝기 80%(스펙)
    }
    // 본문
    const x0 = tx0 + tW + 14; const tw = Math.max(80, bx - x0 - 12);
    c.add(fitText(makeText(scene, x0, narrow ? 18 : 22, fixJosa(q.title ?? q.code), { size: narrow ? 16 : 20, bold: true, color: SPEC.title, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }), tw));
    const dt = fitText(makeText(scene, x0, narrow ? 30 : 38, fixJosa(q.desc ?? ''), { size: narrow ? 12 : 15, color: SPEC.desc, wrap: tw }), tw, { maxLines: narrow ? 2 : 1 }); // 넓은 카드 = 1줄(보상 줄 자리) if (narrow && dt.height > 32) fitText(dt, tw, { maxLines: 2 }); // 좁은 카드도 설명 최대 2줄
    c.add(dt);
    const barY = h - (narrow ? 24 : 28); const tgt = Math.max(1, Number(q.target) || 1); const prog = Math.min(Number(q.progress) || 0, tgt);
    // 보상은 넓은·좁은 카드 모두 바 위 줄(gacha112: 넓은 카드도 진행 바를 본문 폭 전체로)
    // 진행 바(시안): 본문 폭 전체 금색 막대 + 가운데 '진행 n/m'. 스킨 gauge_bg/gauge_gold(bar.track / bar.fill.gold), 채움 0 이면 채움 생략
    const barW = Math.max(80, bx - x0 - 10); const barH = narrow ? 16 : 18; // 본문 폭 전체(상태 버튼 앞까지)
    c.add(slice(scene, 'gauge_bg', barW, barH, 'gauge').setPosition(x0, barY));
    const fw = Math.round(barW * (prog / tgt)); if (fw >= 12) c.add(slice(scene, 'gauge_gold', fw, barH, 'gauge').setPosition(x0, barY));
    c.add(makeText(scene, x0 + barW / 2, barY + barH / 2, `진행 ${prog}/${tgt}`, { size: narrow ? 11 : 13, bold: true, color: '#ffffff', origin: [0.5, 0.5], stroke: { color: '#2A1A06', width: 3 } }));
    const rw = scene.add.container(x0, barY - (narrow ? 12 : 13)); c.add(rw);
    let rx = 0;
    if (q.reward?.gold) { rw.add(icon(scene, 'gold', 18).setPosition(rx + 9, 0)); const t = makeText(scene, rx + 22, 0, `골드 ${fmt(q.reward.gold)}`, { size: narrow ? 13 : 15, color: SPEC.gold, origin: [0, 0.5] }); rw.add(t); rx += 22 + t.width + 14; }
    if (q.reward?.user_exp) {
        const fx = rx; const fb = scene.add.container(0, 0); fb.add(scene.add.rectangle(fx, -7, 14, 14, 0x2a4a6a, 1).setOrigin(0).setStrokeStyle(1, 0x9fd3ff, 1)); rw.add(fb);
        withUiImage(scene, 'result.ico.exp.sm', (k) => { if (!rw.scene) return; fb.setVisible(false); rw.add(scene.add.image(fx + 9, 0, k).setDisplaySize(18, 18)); });
        rw.add(makeText(scene, rx + 22, 0, `XP ${fmt(q.reward.user_exp)}`, { size: narrow ? 13 : 15, bold: true, color: SPEC.xp, origin: [0, 0.5] }));
    }
    return c;
}
