import { COLOR, CSS } from '../theme.js';
import { makeText, fitText, shrinkToFit } from './common.js';
import { sfx } from '../audio.js';
import { diffTier, levelState } from './campaignInfoRules.js';
import { ensurePortrait } from './PortraitCard.js';

// 캠페인 정보 공통 UI(2026-11-14 사용자 지적 "텍스트로만 되어 있고 가독성이 떨어짐"): 챕터 상세 정보 줄(infoStrip)과 목록 카드(campaignCard)가
//  같은 색·아이콘·배지·진행 바를 쓴다. 이미지 생성 없이 코드로 그린 도형만 사용. 모든 컨테이너 원점 = 좌상단
const GOLD = COLOR.accent; const GOLD_L = COLOR.accentLight;
const TRACK = 0x0a0f1e;
const MUTED = '#A9B1C0';

// ---- 도형 ----
function starPts(x, y, ro, ri) {
    const pts = [];
    for (let i = 0; i < 10; i += 1) { const a = -Math.PI / 2 + (i * Math.PI) / 5; const r = i % 2 ? ri : ro; pts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r }); }
    return pts;
}
export function drawStar(g, x, y, r, color, filled = true) {
    const pts = starPts(x, y, r, r * 0.45);
    if (filled) g.fillStyle(color, 1).fillPoints(pts, true);
    g.lineStyle(1, filled ? 0x2a1c04 : color, filled ? 0.7 : 0.8).strokePoints(pts, true);
}
// 불꽃(난이도 단위): 아래 원 + 위 뾰족. 빈 칸은 어두운 바탕 + 외곽선
function drawFlame(g, x, y, s, color, filled) {
    const r = s * 0.34; const cy = y + s * 0.14;
    const tri = [{ x: x - r * 0.98, y: cy - r * 0.2 }, { x: x + r * 0.98, y: cy - r * 0.2 }, { x: x + r * 0.15, y: y - s * 0.5 }];
    if (filled) {
        g.fillStyle(color, 1).fillCircle(x, cy, r).fillTriangle(tri[0].x, tri[0].y, tri[1].x, tri[1].y, tri[2].x, tri[2].y);
        g.fillStyle(0xfff2c0, 0.75).fillCircle(x, cy + r * 0.2, r * 0.42); // 안쪽 밝은 심지
    } else {
        g.fillStyle(0x0b1020, 0.9).fillCircle(x, cy, r).fillTriangle(tri[0].x, tri[0].y, tri[1].x, tri[1].y, tri[2].x, tri[2].y);
        g.lineStyle(1, color, 0.45).strokeCircle(x, cy, r);
    }
}
// 방패(권장 레벨)
function drawShield(g, x, y, s, color) {
    const w = s * 0.82; const h = s;
    const pts = [{ x: x - w / 2, y: y - h / 2 }, { x: x + w / 2, y: y - h / 2 }, { x: x + w / 2, y: y + h * 0.05 }, { x, y: y + h / 2 }, { x: x - w / 2, y: y + h * 0.05 }];
    g.fillStyle(color, 1).fillPoints(pts, true).lineStyle(1, 0x0b1020, 0.8).strokePoints(pts, true);
    g.lineStyle(1.5, 0x0b1020, 0.7).lineBetween(x, y - h * 0.32, x, y + h * 0.3).lineBetween(x - w * 0.26, y - h * 0.05, x + w * 0.26, y - h * 0.05); // 검 십자
}
function drawCheck(g, x, y, s, color) { g.lineStyle(Math.max(2, s * 0.16), color, 1).beginPath().moveTo(x - s * 0.32, y).lineTo(x - s * 0.08, y + s * 0.26).lineTo(x + s * 0.34, y - s * 0.26).strokePath(); }
function drawLock(g, x, y, s, color) {
    g.lineStyle(Math.max(1.5, s * 0.12), color, 1).beginPath().arc(x, y - s * 0.08, s * 0.22, Math.PI, 0, false).strokePath();
    g.fillStyle(color, 1).fillRoundedRect(x - s * 0.32, y - s * 0.08, s * 0.64, s * 0.46, 2);
    g.fillStyle(0x0b1020, 1).fillRect(x - 1, y + s * 0.05, 2, s * 0.16);
}
function drawHourglass(g, x, y, s, color) {
    const a = s * 0.3; const b = s * 0.42;
    g.fillStyle(color, 1).fillTriangle(x - a, y - b, x + a, y - b, x, y).fillTriangle(x - a, y + b, x + a, y + b, x, y);
}

// 유리 질감 판: 반투명 남색 + 윗면 하이라이트 + 금 외곽선
export function glassPanel(scene, w, h, { r = 8, border = GOLD, alpha = 0.55 } = {}) {
    const g = scene.add.graphics();
    g.fillStyle(0x0c1630, 0.82).fillRoundedRect(0, 0, w, h, r);
    g.fillStyle(0xffffff, 0.06).fillRoundedRect(2, 2, w - 4, Math.round(h * 0.45), { tl: r - 1, tr: r - 1, bl: 2, br: 2 });
    g.lineStyle(1, border, alpha).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, r);
    return g;
}

// 진행 바(트랙 + 채움 + 윗면 광택). 반환 graphics
export function progressBar(scene, x, y, w, h, value, max, color = GOLD) {
    const g = scene.add.graphics();
    const r = h / 2; const k = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    g.fillStyle(TRACK, 0.95).fillRoundedRect(x, y, w, h, r).lineStyle(1, GOLD, 0.45).strokeRoundedRect(x, y, w, h, r);
    if (k > 0) {
        const fw = Math.max(h, Math.round(w * k));
        g.fillStyle(color, 1).fillRoundedRect(x, y, fw, h, r);
        g.fillStyle(0xffffff, 0.28).fillRoundedRect(x + 1, y + 1, fw - 2, Math.max(1, h * 0.38), { tl: r - 1, tr: r - 1, bl: 0, br: 0 });
    }
    return g;
}

// 별 칩: [★ n/m] 둥근 알약. 반환 container(.w)
// fixedText: 폭 기준 견본 문자열(예: '00/00') -> 값과 무관하게 같은 폭(목록 카드 열 정렬)
export function starChip(scene, n, max, h = 18, fixedText = null) {
    const c = scene.add.container(0, 0);
    const size = h >= 20 ? 12 : 11;
    const t = makeText(scene, 0, h / 2, `${n}/${max}`, { size, bold: true, color: '#FFE08A', origin: [0, 0.5] });
    let tw = t.width;
    if (fixedText) { const m = makeText(scene, 0, 0, fixedText, { size, bold: true }); tw = Math.max(tw, m.width); m.destroy(); }
    const sr = h * 0.32; const w = Math.round(6 + sr * 2 + 4 + tw + 8);
    const g = scene.add.graphics();
    g.fillStyle(0x221a08, 0.92).fillRoundedRect(0, 0, w, h, h / 2).lineStyle(1, GOLD, 0.7).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, h / 2);
    drawStar(g, 6 + sr, h / 2, sr, n > 0 ? 0xf0c85a : 0x8a7a52, n > 0);
    t.setX(6 + sr * 2 + 4);
    c.add([g, t]); c.w = w; c.h = h;
    return c;
}

// 모서리 리본 태그(추천 등): 오른쪽 끝을 카드 오른쪽 모서리에 붙이는 리본. 원점 = 오른쪽 위(음수 x 로 그림)
export function ribbonTag(scene, text, { color = GOLD, ink = '#1A1406', h = 18 } = {}) {
    const c = scene.add.container(0, 0);
    const t = makeText(scene, 0, h / 2, text, { size: 11, bold: true, color: ink, origin: [1, 0.5] });
    const w = Math.round(t.width + 18); const n = 6;
    const g = scene.add.graphics();
    const pts = [{ x: -w, y: 0 }, { x: 0, y: 0 }, { x: 0, y: h }, { x: -w, y: h }, { x: -w + n, y: h / 2 }];
    g.fillStyle(color, 1).fillPoints(pts, true).fillStyle(0xffffff, 0.22).fillRect(-w + n, 1, w - n - 1, Math.round(h * 0.38));
    g.lineStyle(1, 0x0b1020, 0.6).strokePoints(pts, true);
    t.setX(-6);
    c.add([g, t]); c.w = w; c.h = h;
    return c;
}

// 상태 원형 아이콘(카드 왼쪽): done 체크 / locked·hidden 자물쇠 / preview 모래시계 / progress·new 장 번호
function stateIcon(scene, state, label, r) {
    const c = scene.add.container(0, 0);
    const g = scene.add.graphics();
    const P = { done: [0x1f4a2a, 0x8ee39a], locked: [0x1b2130, 0x7d8698], hidden: [0x1b2130, 0x7d8698], preview: [0x2a2414, 0xc9b27a], progress: [0x2a2008, GOLD_L], new: [0x162238, GOLD] }[state] ?? [0x162238, GOLD];
    g.fillStyle(P[0], 1).fillCircle(0, 0, r).lineStyle(1.5, P[1], 0.95).strokeCircle(0, 0, r);
    c.add(g);
    if (state === 'done') drawCheck(g, 0, 0, r * 1.3, P[1]);
    else if (state === 'locked' || state === 'hidden') drawLock(g, 0, 0, r * 1.3, P[1]);
    else if (state === 'preview') drawHourglass(g, 0, 0, r * 1.2, P[1]);
    else c.add(makeText(scene, 0, 0, label, { size: Math.round(r * 0.95), bold: true, color: state === 'progress' ? '#F6D98C' : CSS.accent, origin: [0.5, 0.5] }));
    return c;
}

// ---- 챕터 상세 정보 줄: [난이도 불꽃 게이지 · 단계] | [방패 권장 Lv · 내 Lv] | [진행 바 n/m · ★칩] ----
// o: { d(난이도), dMax=6, rec(권장 레벨), my(내 기준 레벨|null), cleared, total, stars, maxStars }. compact = 라벨 줄 없는 한 줄(h<40)
export function infoStrip(scene, w, h, o) {
    const c = scene.add.container(0, 0);
    c.add(glassPanel(scene, w, h));
    const compact = h < 40;
    const showProg = o.total > 0;
    const cells = [o.d != null ? 'diff' : null, o.rec ? 'lv' : null, showProg ? 'prog' : null].filter(Boolean);
    if (!cells.length) return c;
    const share = { diff: 0.36, lv: 0.26, prog: 0.38 };
    const tot = cells.reduce((s, k) => s + share[k], 0);
    const pad = 8; let x = pad;
    const inner = w - pad * 2;
    const g = scene.add.graphics(); c.add(g);
    const labY = compact ? 0 : 11; const valY = compact ? h / 2 : h - 14;
    const lab = (cx, str, color = MUTED) => { if (compact) return null; const t = makeText(scene, cx, labY, str, { size: 10, bold: true, color, origin: [0, 0.5] }); c.add(t); return t; };
    cells.forEach((k, i) => {
        const cw = Math.floor(inner * (share[k] / tot)); const cx = x + (i ? 8 : 2); const avail = cw - (i ? 10 : 4);
        if (i) g.lineStyle(1, GOLD, 0.3).lineBetween(x, 6, x, h - 6); // 구분선
        if (k === 'diff') {
            const tier = diffTier(o.d); const max = o.dMax ?? 6; const n = Math.max(0, Math.min(max, Number(o.d) || 0));
            const tl = lab(cx, '난이도');
            if (tl) c.add(makeText(scene, cx + tl.width + 6, labY, tier.label, { size: 10, bold: true, color: tier.css, origin: [0, 0.5] }));
            const s = Math.max(8, Math.min(compact ? 11 : 13, Math.floor((avail - (compact ? 4 : 0)) / max) - 2));
            for (let j = 0; j < max; j += 1) drawFlame(g, cx + s / 2 + j * (s + 2), valY, s, tier.color, j < n);
            if (compact && cx + max * (s + 2) + 30 < x + cw) c.add(makeText(scene, cx + max * (s + 2) + 2, valY, tier.label, { size: 10, bold: true, color: tier.css, origin: [0, 0.5] }));
        } else if (k === 'lv') {
            // 권장 레벨 = 출전 영웅 레벨 기준(서버 시뮬레이션 game:simulate 가 파티 영웅을 recommended_level 로 맞춰 측정). 계정(지휘관) 레벨 아님.
            //  비교값 = 보유 영웅 레벨 상위 3명 평균(campaignInfoRules.myHeroLevel). 라벨에 '영웅'을 명시하고 탭/호버 말풍선으로 기준 설명(2026-11-14 사용자 혼란: 상단 Lv.8 vs 내 Lv.7)
            const st = levelState(o.rec, o.my);
            const lt = lab(cx, '권장 레벨');
            const ss = compact ? 13 : 15;
            drawShield(g, cx + ss / 2, valY, ss, st.color);
            const vt = makeText(scene, cx + ss + 4, valY, `Lv.${o.rec}`, { size: compact ? 12 : 14, bold: true, color: st.css, origin: [0, 0.5] });
            c.add(vt);
            if (st.hint) {
                if (!compact) { // 라벨 줄 오른쪽: '내 영웅 Lv.N'(좁으면 '영웅 Lv.N')
                    const hx = cx + (lt ? lt.width + 6 : 0); const room = x + cw - hx - 4;
                    const ht = makeText(scene, hx, labY, `내 ${st.hint}`, { size: 10, color: st.css, origin: [0, 0.5] });
                    if (ht.width > room) ht.setText(st.hint);
                    c.add(fitText(ht, Math.max(20, room)));
                } else { // 한 줄 모드(390 등): 수치가 항상 보이게 '영웅 Lv.N' -> 'Lv.N' -> '(N)' 순으로 축약(말줄임 안 함, 강화면 a27g Low)
                    const hx = vt.x + vt.width + 5; const room = x + cw - hx - 2;
                    const ht = makeText(scene, hx, valY + 1, st.hint, { size: 10, color: st.css, origin: [0, 0.5] });
                    for (const cand of [st.hint, `Lv.${o.my}`, `(${o.my})`]) { ht.setText(cand); if (ht.width <= room) break; }
                    if (ht.width <= room) c.add(ht); else ht.destroy();
                }
            }
            // 기준 설명 말풍선(호버·탭, 3초 뒤 자동 닫힘). 정보 줄 위쪽에 표시
            const tipHit = scene.add.rectangle(x, 0, cw, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            // 편성(라인업)이 있으면: 권장 총합(recommended_total = 권장 Lv x 권장 인원, 서버 계산) vs 편성 상위 N명 레벨 합 + 편성 영웅 초상·이름·레벨 목록(2026-11-14)
            const lu = Array.isArray(o.lineup) ? o.lineup : [];
            const tipText = lu.length
                ? `권장 레벨은 출전 영웅 레벨 기준입니다.${o.recTotal ? `\n권장 총합 ${o.recTotal} (Lv.${o.rec} x ${o.party}명) / 내 편성 상위 ${o.party}명 합 ${o.myTotal ?? '-'}` : ''}`
                : st.hint ? `권장 레벨은 출전 영웅의 레벨 기준입니다. 표시된 ${st.hint} = 보유 영웅 중 레벨 상위 3명의 평균(계정 레벨과 다를 수 있음).` : '권장 레벨은 출전 영웅의 레벨 기준입니다(계정 레벨 아님).';
            let tip = null; let tmr = null; let openedAt = 0;
            const hideTip = () => { tmr?.remove(false); tmr = null; tip?.destroy(); tip = null; };
            const showTip = () => {
                if (tip?.scene) return;
                const tw2 = Math.min(Math.max(180, w - 16), 320);
                const tt = makeText(scene, 10, 6, tipText, { size: 11, color: '#FFE9C8', wrap: tw2 - 20 });
                // 편성 영웅 줄: 원형 초상(24, 지연 로드) + 이름 + Lv. 최대 5명, 2열
                const rows = []; const rh = 28; const colW = (tw2 - 20) / 2;
                lu.slice(0, 5).forEach((hh, i) => {
                    const rx = 10 + (i % 2) * colW; const ry = tt.height + 12 + Math.floor(i / 2) * rh;
                    const rg = scene.add.graphics().fillStyle(0x0b1020, 1).fillCircle(rx + 12, ry + 12, 12).lineStyle(1, GOLD, 0.8).strokeCircle(rx + 12, ry + 12, 12);
                    const holder = scene.add.container(rx + 12, ry + 12);
                    const put = (k) => { if (!k || !holder.scene || !scene.textures.exists(k)) return; holder.removeAll(true); const im = scene.add.image(0, 0, k); const fw = im.frame.realWidth; const fh = im.frame.realHeight; const sd = Math.min(fw, fh); im.setCrop((fw - sd) / 2, 0, sd, sd).setDisplaySize(22 * fw / sd, 22 * fh / sd).setOrigin(0.5, (sd / 2) / fh); holder.add(im); };
                    put(ensurePortrait(scene, hh.portrait ?? hh.hero, put, { thumb: true }));
                    const nt = fitText(makeText(scene, rx + 28, ry + 12, `${hh.display_name ?? hh.name ?? ''} Lv.${hh.level ?? '-'}`, { size: 11, color: '#FFF4D2', origin: [0, 0.5] }), colW - 32);
                    rows.push(rg, holder, nt);
                });
                const bh = tt.height + 12 + (lu.length ? Math.ceil(Math.min(5, lu.length) / 2) * rh + 4 : 0); const bx = Math.max(0, Math.min(w - tw2, x + cw / 2 - tw2 / 2));
                tip = scene.add.container(bx, -bh - 6);
                tip.add([scene.add.graphics().fillStyle(0x1c1208, 0.96).fillRoundedRect(0, 0, tw2, bh, 6).lineStyle(1, GOLD, 0.8).strokeRoundedRect(0.5, 0.5, tw2 - 1, bh - 1, 6), tt, ...rows]);
                c.add(tip); openedAt = scene.time.now;
                tmr = scene.time.delayedCall(3000, hideTip);
            };
            // 호버 = 열기(마우스만), 탭 = 토글. 터치는 pointerover 직후 pointerup 이 와서 바로 닫히던 문제(강화면 a27g Med) -> 연 지 450ms 안의 pointerup 은 닫지 않음
            tipHit.on('pointerover', (p) => { if (!p?.wasTouch) showTip(); });
            tipHit.on('pointerout', (p) => { if (!p?.wasTouch) hideTip(); });
            tipHit.on('pointerup', () => { if (tip?.scene) { if (scene.time.now - openedAt > 450) hideTip(); } else showTip(); });
            c.add(tipHit);
            c.once('destroy', () => tmr?.remove(false));
        } else {
            const tl = lab(cx, '진행');
            if (tl) c.add(makeText(scene, cx + tl.width + 6, labY, `${o.cleared}/${o.total}`, { size: 10, bold: true, color: '#F6D98C', origin: [0, 0.5] }));
            const chip = starChip(scene, o.stars ?? 0, o.maxStars ?? 0, compact ? 16 : 18);
            chip.setPosition(x + cw - chip.w - 2, valY - chip.h / 2);
            const numT = compact ? makeText(scene, 0, valY, `${o.cleared}/${o.total}`, { size: 11, bold: true, color: '#F6D98C', origin: [1, 0.5] }) : null;
            const barR = chip.x - 6 - (numT ? numT.width + 4 : 0);
            const bw = barR - cx; // 공간이 16 미만이면 바 생략(최소 폭 강제로 'n/m' 글자를 덮던 문제, 강화면 a27g Low)
            if (bw >= 16) c.add(progressBar(scene, cx, valY - 3, bw, 6, o.cleared, o.total, o.cleared >= o.total ? 0x5cc46a : GOLD));
            if (numT) { numT.setX(chip.x - 6); c.add(numT); }
            c.add(chip);
        }
        x += cw;
    });
    return c;
}

// 연대 축약(목록 칩 전용, 일관 규칙): '기원전 ' -> 'BC', 끝의 '년' 생략. 예) '기원전 58~44년' -> 'BC58~44', '1206~1227년' -> '1206~1227'
export const compactEra = (s) => String(s ?? '').replace(/기원전\s*/g, 'BC').replace(/년$/, '').trim();

// ---- 캠페인 목록 카드 ----
// o: { w, h, selected, state(campaignState), title, era, note(잠김 사유 등 대체 줄), cleared, total, stars, maxStars, rec(추천), ready('출전 가능' 배지), no(장 번호 표시), onClick }
// 얇은 금테 + 모서리 포인트, 선택 = 금 테두리 글로우 + 오른쪽 화살표, 왼쪽 상태 아이콘, 제목(크게) / [연대 칩][진행 바 n/m][★칩]
export function campaignCard(scene, x, y, o) {
    const { w, h } = o;
    const c = scene.add.container(x, y);
    const sel = !!o.selected; const dim = o.state === 'locked' || o.state === 'hidden';
    const g = scene.add.graphics();
    if (sel) g.fillStyle(GOLD_L, 0.14).fillRoundedRect(-3, -3, w + 6, h + 6, 10); // 바깥 글로우
    g.fillStyle(sel ? 0x1e2a48 : 0x121a30, dim ? 0.7 : 0.9).fillRoundedRect(0, 0, w, h, 7);
    g.fillStyle(0xffffff, sel ? 0.07 : 0.04).fillRoundedRect(2, 2, w - 4, Math.round(h * 0.42), { tl: 6, tr: 6, bl: 2, br: 2 });
    g.lineStyle(sel ? 2 : 1, sel ? GOLD_L : GOLD, sel ? 1 : dim ? 0.3 : 0.55).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 7);
    // 모서리 포인트(작은 L 자 금선 4개)
    const k = 7; const a = sel ? 1 : dim ? 0.35 : 0.8;
    g.lineStyle(1.5, GOLD_L, a);
    [[3, 3, 1, 1], [w - 3, 3, -1, 1], [3, h - 3, 1, -1], [w - 3, h - 3, -1, -1]].forEach(([px, py, sx, sy]) => { g.lineBetween(px, py, px + k * sx, py); g.lineBetween(px, py, px, py + k * sy); });
    const hover = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0);
    c.add([g, hover]);
    const r = Math.min(14, Math.round(h * 0.27));
    const ix = 10 + r;
    const ic = stateIcon(scene, o.state, o.no != null ? String(o.no) : '•', r).setPosition(ix, h / 2);
    c.add(ic);
    const lx = ix + r + 10;
    const arrowW = sel ? 18 : 0;
    const tag = o.rec ? ribbonTag(scene, '추천', { h: 18 }) : null;
    const twoLine = h >= 44;
    const ty = twoLine ? Math.round(h * 0.34) : h / 2;
    // '출전 가능'(필수 영웅 전원 보유 + 출정 가능) 작은 금색 알약 배지: 추천 리본 왼쪽(없으면 오른쪽 끝, 선택 화살표 자리 제외). 별 칩과 같은 금테·어두운 바탕
    let readyW = 0;
    if (o.ready) {
        const rt = makeText(scene, 0, 0, '출전 가능', { size: 10, bold: true, color: '#FFE08A', origin: [0.5, 0.5] });
        const pw = Math.round(rt.width + 12); const ph = 16;
        const pr = w - 8 - arrowW - (tag ? tag.w + 4 : 0);
        const px = pr - pw; const py = Math.round(ty - ph / 2);
        const pg = scene.add.graphics().fillStyle(0x221a08, 0.92).fillRoundedRect(px, py, pw, ph, ph / 2).lineStyle(1, GOLD_L, 0.9).strokeRoundedRect(px + 0.5, py + 0.5, pw - 1, ph - 1, ph / 2);
        rt.setPosition(px + pw / 2, py + ph / 2);
        c.add([pg, rt]);
        readyW = pw + 6;
    }
    const titleRight = w - 8 - arrowW - (tag ? tag.w + 4 : 0) - readyW;
    // 제목 위계: 16 heading(굵게 + 외곽선 + 약한 그림자), 밝은 색. 아래 줄은 10~11 흐린 색
    const tt = fitText(makeText(scene, lx, ty, o.title ?? '', { size: twoLine ? 16 : 14, heading: true, color: sel ? '#FFE08A' : dim ? '#A9B1C0' : '#FFF6E0', origin: [0, 0.5] }), titleRight - lx);
    c.add(tt);
    if (tag) { tag.setPosition(w - 1, 5); c.add(tag); }
    if (sel) { // 오른쪽 화살표(선택 표시)
        const ag = scene.add.graphics(); const axx = w - 12; const ay = h / 2;
        ag.fillStyle(GOLD_L, 1).fillTriangle(axx - 6, ay - 7, axx - 6, ay + 7, axx + 2, ay);
        c.add(ag);
    }
    if (twoLine) {
        // 아래 줄 = 고정 열(2026-11-14 사용자 '게이지 길이 들쑥날쑥'): [연대 칩 고정 폭][진행 바 고정 시작·고정 끝][n/m 고정 폭][★칩 고정 폭].
        //  열 폭은 카드 폭에서만 계산하므로 모든 카드에서 같다. 연대 글자가 길면 칩 안에서만 축소. 해금 조건 문구도 진행 바와 같은 열에서 시작.
        //  아래 줄은 제목보다 작고 흐리게(제목 위계, 2026-11-14 '타이틀이 눈에 잘 안 들어옴')
        // 열 기준 오른쪽 끝 = 선택 화살표 자리를 모든 카드에서 미리 비운 값(선택·추천 카드만 열이 달라지던 문제, 강화면 a27g Med)
        const ly = Math.round(h * 0.74); const right = w - 10 - 18;
        const ew = Math.round(Math.max(64, Math.min(104, (right - lx) * 0.36)));
        const col = lx + ew + 8; // 진행 바·문구 시작 열
        if (o.era) { // 연대 칩(잠김 카드도 같은 칩, 흐리게)
            const et = makeText(scene, 0, ly, o.era, { size: 10, bold: true, color: dim ? '#8A8F99' : '#D8CCA8', origin: [0.5, 0.5] });
            shrinkToFit(et, ew - 8, 9);
            if (et.width > ew - 8) { et.setFontSize('10px').setText(compactEra(o.era)); shrinkToFit(et, ew - 8, 9); } // 최소 9px: 넘치면 축약형('기원전 ' -> 'BC', 끝 '년' 생략)
            fitText(et, ew - 8);
            const eg = scene.add.graphics().fillStyle(0x2a2414, dim ? 0.6 : 0.85).fillRoundedRect(lx, ly - 7, ew, 14, 7).lineStyle(1, GOLD, dim ? 0.25 : 0.4).strokeRoundedRect(lx + 0.5, ly - 6.5, ew - 1, 13, 7);
            et.setX(lx + ew / 2);
            c.add([eg, et]);
        }
        if (o.note || !(o.total > 0)) {
            if (o.note) c.add(fitText(makeText(scene, col, ly, o.note, { size: 10, color: dim ? CSS.dangerText : '#B8B2A2', origin: [0, 0.5] }), Math.max(20, right - col)));
        } else {
            const chip = starChip(scene, o.stars ?? 0, o.maxStars ?? 0, 15, '00/00');
            chip.setPosition(right - chip.w, ly - chip.h / 2).setAlpha(0.9);
            const numW = (() => { const m = makeText(scene, 0, 0, '00/00', { size: 10, bold: true }); const v = m.width; m.destroy(); return v; })();
            const nt = makeText(scene, chip.x - 5, ly, `${o.cleared}/${o.total}`, { size: 10, bold: true, color: o.cleared >= o.total ? '#8ee39a' : '#E8D28C', origin: [1, 0.5] });
            const bw = chip.x - 5 - numW - 6 - col;
            if (bw >= 20) c.add(progressBar(scene, col, ly - 2.5, bw, 5, o.cleared, o.total, o.cleared >= o.total ? 0x5cc46a : GOLD).setAlpha(0.9));
            c.add([nt, chip]);
        }
    }
    c.clipH = h;
    if (o.onClick) {
        hover.setInteractive({ useHandCursor: true });
        hover.on('pointerover', () => { if (!(scene.modalCount > 0)) hover.setFillStyle(0xffffff, 0.05); });
        hover.on('pointerout', () => hover.setFillStyle(0xffffff, 0));
        hover.on('pointerup', (p) => { if (scene.modalCount > 0) return; if (p.getDistance() > 12) return; sfx('sfx_ui_tap'); o.onClick(); });
    }
    return c;
}
