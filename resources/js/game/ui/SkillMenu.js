import Phaser from 'phaser';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { L } from '../layout.js';
import { makeText, fitText, keepW } from './common.js';
import { slice } from './skin.js';
import { tween } from './motion.js';
import { sfx } from '../audio.js';
import { showToast } from './Toast.js';
import { placeNear, tail } from './ContextMenu.js';
import { skillIconImage } from './SkillIcon.js';
import { statIcon } from './GameIcons.js';

// 전투 액티브 스킬 선택 패널(2026-11-06 사용자 '스킬 아이콘이 작고 UI가 구림' + '설명은 눌렀을 때'). 표시 전용 — 사용 요청·마력 검증은 호출 측(Battle -> store.pickSkill / skillBlockReason) 그대로.
// 구성: 머리줄('스킬' + 닫기 X) / 스킬 카드 목록(큰 아이콘 + 이름 + 마력 칩, 사용 불가면 어둡게 + 사유 한 줄) / 상세 칸(마우스 hover·키보드 포커스한 스킬의 효과·수치 강조·대상·범위).
// 흐름(2026-11-07 사용자 '[사용] 단계 없애기'): 사용 가능 카드 탭 = 바로 onClick(pickSkill -> 패널 닫힘 + 맵 범위 표시 + 대상 선택). 사용 불가 카드 탭 = 상세 표시 + 사유 토스트(아무것도 소모 안 함).
// 키보드: move(±1) = 포커스 이동(상세 표시), activate() = 포커스 없으면 첫 카드 포커스, 있으면 그 카드 사용. ContextMenu 와 같은 인터페이스(contains·move·activate)
// items: [{ name, cost(마력, MP 방식만), power, meta(['대상 적', '사거리 1', ...]), desc, why(사용 불가 사유|''), iconFrame, dotColor, mpShort(bool), onClick }]
const ROUND = 6;

// 도트 아이콘 선명 배율: 원본 격자 48px(아틀라스 @1x 칸) 의 정수배 백킹 px 로 맞춘다(L.u = unit -> 백킹 px)
function crispIcon(scene, frame, x, y, target) {
    const im = skillIconImage(scene, frame, x, y, target);
    if (!im) return null;
    const u = Number(L.u) || 1; const fw = im.frame.realWidth || 96;
    const n = Math.max(1, Math.round((target * u) / 48));
    im.setScale((n * 48) / u / fw);
    return im;
}

// 효과 문구를 단어 단위로 배치하며 수치(+8%, 50%, 2칸, 1턴 등)만 강조색. 반환 = { objs, h }
const NUM_RE = /([+\-−]?\d+(?:\.\d+)?\s?(?:%|칸|턴|배|회)?)/g;
function richText(scene, str, maxW, { size = 13, color = '#d8d1bd', hi = '#ffe08a', lineH = 19 } = {}) {
    const objs = []; let x = 0; let y = 0;
    const segs = String(str ?? '').split(NUM_RE); // 캡처 그룹 = 홀수 인덱스(수치)
    const put = (s, num) => {
        const t = makeText(scene, x, y, s, { size, bold: num, color: num ? hi : color });
        if (x > 0 && x + t.width > maxW) { x = 0; y += lineH; t.setPosition(0, y); if (/^\s+$/.test(s)) { t.destroy(); return; } }
        objs.push(t); x += t.width;
    };
    segs.forEach((s, i) => {
        if (!s) return;
        if (i % 2 === 1) { put(s, true); return; }
        s.split(/(\s+)/).filter(Boolean).forEach((wd) => {
            const probe = makeText(scene, 0, 0, wd, { size }); const tooWide = probe.width > maxW; probe.destroy();
            if (!tooWide) { put(wd, false); return; }
            let buf = ''; [...wd].forEach((ch) => { const p = makeText(scene, 0, 0, buf + ch, { size }); const over = x + p.width > maxW; p.destroy(); if (over && buf) { put(buf, false); buf = ''; if (x > 0) { x = 0; y += lineH; } } buf += ch; }); if (buf) put(buf, false);
        });
    });
    return { objs, h: objs.length ? y + lineH : 0 };
}

// 작은 정보 칩(둥근 사각 + 글자, 선택 아이콘)
function chip(scene, x, y, text, { fill = 0x16223b, edge = COLOR.accent, color = '#e8dcb8', icon = null, h = 20 } = {}) {
    const c = scene.add.container(x, y);
    const t = makeText(scene, 0, h / 2, text, { size: 12, bold: true, color, origin: [0, 0.5] });
    const ic = icon ? statIcon(scene, icon, 0, h / 2, 16) : null;
    const padX = 7; const iw = ic ? 18 : 0; const w = Math.ceil(padX * 2 + iw + t.width);
    const g = scene.add.graphics();
    g.fillStyle(fill, 0.95).fillRoundedRect(0, 0, w, h, h / 2).lineStyle(1, edge, 0.75).strokeRoundedRect(0, 0, w, h, h / 2);
    c.add(g);
    if (ic) { ic.setPosition(padX + 8, h / 2); c.add(ic); }
    t.setX(padX + iw); c.add(t);
    c.cw = w; c.ch = h;
    return c;
}

export class SkillMenu extends Phaser.GameObjects.Container {
    constructor(scene, { anchor, bounds, items, touch = false, avoid = [], onClose, selected = -1, onSelect }) { // selected·onSelect: 재생성(팬·줌) 때 선택 유지용
        super(scene, 0, 0);
        this.items = items; this.onClose = onClose; this.onSelect = onSelect; this.sel = selected >= 0 && selected < items.length ? selected : -1;
        const bh = Math.max(44, Math.ceil(MIN_TOUCH / (view.scale || 1)));
        const pad = 12; const gap = 8;
        const w = Math.round(Math.min(380, bounds.w));
        const cw = w - pad * 2;
        const headH = 30;
        // 높이 맞춤: 큰 카드(아이콘 64) -> 낮은 카드(아이콘 48)
        const build = (compact) => {
            const icT = compact ? 44 : 64;
            const cardH = Math.max(bh, icT + 14);
            const dW = cw - 24;
            const details = items.map((it) => this.measureDetail(it, dW));
            const hintH = 40;
            const detailH = Math.max(hintH, ...details) + 20;
            const h = pad + headH + gap + items.length * (cardH + gap) + detailH + pad;
            return { compact, icT, cardH, detailH, h };
        };
        let m = build(false);
        if (m.h > bounds.h) m = build(true);
        const h = m.h;
        const pos = placeNear(anchor, w, h, bounds, touch ? ['top', 'right', 'left', 'bottom'] : undefined, touch ? Math.max(14, anchor.h * 0.3) : 10, avoid);
        this.setPosition(pos.x, pos.y);
        this.w = w; this.h = h;
        const bgp = slice(scene, 'panel', w, h, 'panel');
        if (pos.hit) bgp.setAlpha(0.8);
        this.add(bgp);
        this.add(tail(scene, pos, w, h, anchor));
        // 머리줄: 제목 + 닫기(X, 터치 최소 크기)
        this.add(makeText(scene, pad + 2, pad + headH / 2, '스킬', { size: 16, bold: true, color: CSS.accent, origin: [0, 0.5] }));
        const xs = 28; const xc = { x: w - pad - xs / 2, y: pad + headH / 2 };
        const xg = scene.add.graphics();
        const drawX = (hov) => { xg.clear(); xg.fillStyle(hov ? 0x2a3a5e : 0x16223b, 1).fillCircle(xc.x, xc.y, xs / 2).lineStyle(1, COLOR.accent, hov ? 1 : 0.7).strokeCircle(xc.x, xc.y, xs / 2); xg.lineStyle(2, 0xe8dcb8, 1).lineBetween(xc.x - 5, xc.y - 5, xc.x + 5, xc.y + 5).lineBetween(xc.x + 5, xc.y - 5, xc.x - 5, xc.y + 5); };
        drawX(false); this.add(xg);
        const hitS = Math.max(xs, Math.ceil(MIN_TOUCH / (view.scale || 1)));
        const xh = scene.add.rectangle(xc.x - hitS / 2, xc.y - hitS / 2, hitS, hitS, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        xh.on('pointerover', () => drawX(true)); xh.on('pointerout', () => drawX(false));
        xh.on('pointerup', () => { if (!this.usableScene()) return; sfx('sfx_ui_cancel'); this.sel = -1; this.onClose?.(); });
        this.add(xh);
        const line = scene.add.graphics(); line.lineStyle(1, COLOR.accent, 0.35).lineBetween(pad, pad + headH + 2, w - pad, pad + headH + 2); this.add(line);
        // 카드 목록
        let y = pad + headH + gap;
        this.cards = items.map((it, i) => { const c = this.makeCard(it, i, pad, y, cw, m); y += m.cardH + gap; return c; });
        // 상세 칸
        this.detailRect = { x: pad, y, w: cw, h: m.detailH };
        const dg = scene.add.graphics();
        dg.fillStyle(0x0a1120, 0.92).fillRoundedRect(pad, y, cw, m.detailH, ROUND).lineStyle(1, COLOR.accent, 0.3).strokeRoundedRect(pad, y, cw, m.detailH, ROUND);
        this.add(dg);
        this.detail = scene.add.container(pad + 12, y + 10); this.add(this.detail);
        this.renderDetail();
        scene.add.existing(this);
        this.setAlpha(0); tween(scene, { targets: this, to: { alpha: 1 }, duration: 100 });
    }

    usableScene() { return !!this.scene && !(this.scene.modalCount > 0); }

    // 상세 칸 내용 높이(배치 전 측정)
    measureDetail(it, dW) {
        const sc = this.scene;
        const r = richText(sc, it.desc || '효과 설명이 없습니다.', dW); r.objs.forEach((o) => o.destroy());
        return 22 + 6 + r.h + (it.why ? 20 : 0);
    }

    makeCard(it, i, x, y, cw, m) {
        const sc = this.scene; const dis = !!it.why;
        const c = sc.add.container(x, y); this.add(c);
        const g = sc.add.graphics(); c.add(g);
        const content = sc.add.container(0, 0); c.add(content);
        const box = m.icT + 6; const bx = 8; const by = (m.cardH - box) / 2;
        const ic = it.iconFrame ? crispIcon(sc, it.iconFrame, bx + box / 2, m.cardH / 2, m.icT) : null;
        if (ic) content.add(ic);
        else { const fb = sc.add.graphics(); fb.fillStyle(0x0b1020, 1).fillRoundedRect(bx, by, box, box, 6).lineStyle(1, COLOR.accent, 0.6).strokeRoundedRect(bx, by, box, box, 6); content.add(fb); content.add(makeText(sc, bx + box / 2, m.cardH / 2, (it.name ?? '?').slice(0, 1), { size: Math.round(m.icT * 0.42), bold: true, color: '#f0d58c', origin: [0.5, 0.5] })); }
        if (it.dotColor != null) content.add(sc.add.circle(bx + 4, by + 4, 5, it.dotColor, 1).setStrokeStyle(1.5, 0x0b1020, 0.9)); // 속성 색 점
        const tx = bx + box + 12; const right = cw - 10;
        // 오른쪽 위 칩: MP 방식 = 마력 비용(부족하면 붉은), 레거시 = 위력%
        const ch = it.cost != null
            ? chip(sc, 0, 0, `${it.cost}`, it.mpShort ? { fill: 0x3a1418, edge: 0xff6a5a, color: '#ff9a8a', icon: 'mp' } : { fill: 0x0e2a48, edge: 0x6cb8ff, color: '#cfe8ff', icon: 'mp' })
            : (it.power != null ? chip(sc, 0, 0, `위력 ${it.power}%`) : null);
        const twoLine = !!(it.why || it.sub);
        const nameY = twoLine ? m.cardH / 2 - 10 : m.cardH / 2;
        if (ch) { ch.setPosition(right - ch.cw, nameY - ch.ch / 2); content.add(ch); }
        const nm = makeText(sc, tx, nameY, it.name ?? '', { size: m.compact ? 15 : 16, bold: true, color: '#f3e7c4', origin: [0, 0.5] });
        fitText(nm, Math.max(40, right - (ch ? ch.cw + 8 : 0) - tx)); content.add(nm);
        let why = null;
        if (it.why) { why = makeText(sc, tx, m.cardH / 2 + 11, it.why, { size: 12, bold: true, color: '#ff9a8a', origin: [0, 0.5] }); fitText(why, right - tx); c.add(why); }
        else if (it.sub) { const st = makeText(sc, tx, m.cardH / 2 + 11, it.sub, { size: 12, color: CSS.muted, origin: [0, 0.5] }); fitText(st, right - tx); content.add(st); }
        if (dis) content.setAlpha(0.5);
        const card = { c, g, content, it, i, w: cw, h: m.cardH, hov: false, down: false };
        this.drawCard(card);
        const hit = sc.add.rectangle(0, 0, cw, m.cardH, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', (p) => { if (!this.usableScene()) return; card.hov = true; this.drawCard(card); if (!p?.wasTouch && this.sel !== i) this.select(i); }); // 마우스 hover = 상세 미리보기(터치는 탭 = 바로 사용이라 hover 없음)
        hit.on('pointerout', () => { card.hov = false; card.down = false; content.y = 0; this.drawCard(card); });
        hit.on('pointerdown', () => { if (!this.usableScene()) return; card.down = true; content.y = 1; this.drawCard(card); });
        hit.on('pointerup', () => { if (!card.down) return; card.down = false; content.y = 0; if (!this.usableScene()) return; this.use(i); });
        c.add(hit);
        return card;
    }

    // 카드 바탕: 약한 세로 그라데이션 + 얇은 금 테두리. 선택 = 밝은 바탕 + 2px 금 테두리 + 왼쪽 금 띠, 눌림 = 어둡게, 사용 불가 = 어두운 바탕
    drawCard(card) {
        const { g, w, h, it } = card; const on = this.sel === card.i; const dis = !!it.why;
        g.clear();
        const top = dis ? 0x141a28 : on ? 0x2c3d66 : card.hov ? 0x24345a : 0x1c2a4a;
        const bot = dis ? 0x0c111c : on ? 0x18244a : card.down ? 0x0c1428 : 0x111a32;
        g.fillGradientStyle(top, top, bot, bot, 1).fillRect(0, 0, w, h);
        g.lineStyle(on ? 2 : 1, on ? 0xf0d58c : COLOR.accent, on ? 1 : card.hov ? 0.85 : 0.45).strokeRect(0, 0, w, h);
        if (on) g.fillStyle(0xf0d58c, 1).fillRect(0, 2, 3, h - 4);
    }

    renderDetail() {
        const sc = this.scene; const D = this.detail; D.removeAll(true);
        const it = this.items[this.sel]; const dW = this.detailRect.w - 24;
        if (!it) {
            D.add(makeText(sc, dW / 2, (this.detailRect.h - 20) / 2, '스킬을 누르면 맵에 범위가 표시됩니다', { size: 13, color: CSS.muted, origin: [0.5, 0.5] }));
            return;
        }
        // 칩 줄: 마력·위력·대상·범위·재사용·횟수(있는 것만, 넘치면 뒤에서 생략)
        let x = 0; let full = false;
        const chips = [...(it.cost != null ? [[`마력 ${it.cost}`, { fill: it.mpShort ? 0x3a1418 : 0x0e2a48, edge: it.mpShort ? 0xff6a5a : 0x6cb8ff, color: it.mpShort ? '#ff9a8a' : '#cfe8ff', icon: 'mp' }]] : []), ...(it.meta ?? []).filter(Boolean).map((s) => [s, {}])];
        chips.forEach(([s, o]) => {
            if (full) return;
            const c = chip(sc, x, 0, s, o);
            if (x + c.cw > dW) { c.destroy(); full = true; return; }
            D.add(c); x += c.cw + 6;
        });
        const r = richText(sc, it.desc || '효과 설명이 없습니다.', dW);
        r.objs.forEach((o) => { o.y += 28; D.add(o); });
        if (it.why) { const t = makeText(sc, 0, 28 + r.h + 2, `사용 불가 · ${it.why}`, { size: 12, bold: true, color: '#ff9a8a' }); fitText(t, dW); D.add(t); }
    }

    contains(px, py) { return px >= this.x - 8 && px <= this.x + this.w + 8 && py >= this.y - 8 && py <= this.y + this.h + 8; }

    select(i) {
        if (i < 0 || i >= this.items.length) return;
        const prev = this.sel; this.sel = i;
        [prev, i].forEach((k) => { if (this.cards[k]) this.drawCard(this.cards[k]); });
        this.renderDetail();
        this.onSelect?.(i);
    }

    move(d) { const n = this.items.length; if (!n) return; this.select(this.sel < 0 ? (d > 0 ? 0 : n - 1) : (this.sel + d + n) % n); }

    // 카드 사용: 사용 불가면 상세 표시 + 사유 토스트만, 가능하면 onClick(호출 측이 대상 선택 모드로 전환 -> 패널 재생성으로 닫힘)
    use(i) {
        const it = this.items[i]; if (!it) return;
        if (it.why) { sfx('sfx_ui_tap'); this.select(i); if (this.usableScene()) showToast(this.scene, it.why); return; }
        sfx('sfx_ui_confirm'); it.onClick?.();
    }

    activate() {
        if (this.sel < 0) { this.select(0); return; }
        this.use(this.sel);
    }
}
keepW(SkillMenu); // setPosition 후 this.w 보존(Phaser 4)
