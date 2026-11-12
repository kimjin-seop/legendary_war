import Phaser from 'phaser';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { makeText, fitText } from './common.js';
import { sfx } from '../audio.js';

// 작은 칩 세그먼트(필터·옵션 선택용, 장식 테두리 없는 둥근 칩). Tabs 와 같은 인터페이스(items [{key,label}]·active·onChange·setActive).
// - fill=false(기본): 칩 폭 = 글자 폭 + 좌우 여백(최소 minW). w 를 넘으면 균등 폭으로 줄여 맞춘다
// - fill=true: w 를 칩 수로 균등 분할
// - 보이는 높이는 h(기본 30) 그대로, 터치 영역은 실제 화면 최소 터치 크기(MIN_TOUCH CSS px)만큼 위아래로 넓힌다(Tabs·Button 과 같은 규칙)
// - this.width = 실제로 그린 전체 폭(옆에 다른 그룹을 이어 붙일 때 사용)
export class Chips extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w = 0, h = 30, items, active, onChange, size = 12, modal = false, gap = 4, fill = false, minW = 44, pad = 12 }) {
        super(scene, x, y);
        this.onChange = onChange;
        this.cells = [];
        this.h = h;
        const ok = () => modal || !(scene.modalCount > 0);
        const labels = items.map((it) => makeText(scene, 0, h / 2, it.label, { size, bold: true, origin: [0.5, 0.5] }));
        let widths = labels.map((t) => Math.max(minW, Math.ceil(t.width) + pad * 2));
        const total = (ws) => ws.reduce((a, b) => a + b, 0) + gap * (ws.length - 1);
        if (fill || (w > 0 && total(widths) > w)) { const cw = Math.floor((w - gap * (items.length - 1)) / items.length); widths = widths.map(() => cw); }
        const needH = Math.ceil(MIN_TOUCH / (view.scale || 1)); const hh = Math.max(h, needH);
        let cx = 0;
        items.forEach((it, i) => {
            const cw = widths[i];
            const bg = scene.add.graphics();
            const label = labels[i].setX(cx + cw / 2);
            fitText(label, cw - 8);
            const hit = scene.add.rectangle(cx, -(hh - h) / 2, cw, hh, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', () => {
                if (!ok() || this.active === it.key) return;
                sfx('sfx_ui_tap');
                this.setActive(it.key);
                this.onChange?.(it.key);
            });
            hit.on('pointerover', () => { if (ok() && this.active !== it.key) sfx('sfx_ui_hover'); });
            this.add([bg, label, hit]);
            this.cells.push({ key: it.key, bg, label, x: cx, w: cw });
            cx += cw + gap;
        });
        this.width = Math.max(0, cx - gap);
        this.setActive(active ?? items[0].key);
        scene.add.existing(this);
    }

    setActive(key) {
        this.active = key;
        const h = this.h; const r = Math.min(8, h / 2);
        this.cells.forEach((c) => {
            const on = c.key === key;
            c.bg.clear();
            c.bg.fillStyle(on ? COLOR.panelLight : COLOR.navyDeep, on ? 1 : 0.85).fillRoundedRect(c.x, 0, c.w, h, r);
            c.bg.lineStyle(on ? 1.5 : 1, on ? COLOR.accentLight : COLOR.accent, on ? 1 : 0.35).strokeRoundedRect(c.x, 0, c.w, h, r);
            c.label.setColor(on ? '#F6D98C' : CSS.muted);
        });
    }
}
