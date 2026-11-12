import Phaser from 'phaser';
import { Button } from '../ui/Button.js';
import { Panel } from '../ui/Panel.js';
import { Tabs } from '../ui/Tabs.js';
import { StatBar } from '../ui/StatBar.js';
import { CostMeter } from '../ui/CostMeter.js';
import { makeText, addBackdrop } from '../ui/common.js';
import { slice, icon, VARIANTS, STATES } from '../ui/skin.js';
import { COLOR, CSS, GRADE, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';

const VNAME = { primary: '주요', secondary: '보조', danger: '위험' };

// 개발용 스킨 데모(/battle?ui=1 또는 로비 스테이지 탭): 버튼 3변형 x 5상태, 패널·리본·탭·슬롯·게이지·토글·슬라이더·아이콘.
export class UiDemoScene extends Phaser.Scene {
    constructor() { super('UiDemo'); }

    create() {
        this.modalCount = 0;
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this);
        addBackdrop(this, L.lw, L.lh);
        const m = 16;
        const root = this.add.container(0, 0);
        let y = L.safe.t + m;
        root.add(makeText(this, m, y, 'UI 스킨 데모 (버튼 3변형 x 5상태: 기본/호버/눌림/비활성/선택)', { size: 20, heading: true, color: CSS.accent, wrap: L.lw - m * 2 }));
        y += 40;
        const bw = Math.min(150, (L.lw - m * 2 - 4 * 10) / 5);
        VARIANTS.forEach((v) => {
            STATES.forEach((s, i) => {
                const b = new Button(this, { x: m + i * (bw + 10), y, w: bw, h: 48, label: `${VNAME[v]}·${s}`, variant: v, size: 14 });
                b.setState(s);
                root.add(b);
            });
            y += 58;
        });
        const w2 = Math.min(380, L.lw - m * 2);
        const panel = new Panel(this, { x: m, y: y + 4, w: w2, h: 210, title: '패널·리본' });
        root.add(panel);
        panel.body.add([
            new StatBar(this, { x: 20, y: 6, w: w2 - 40, max: 100, value: 72, color: COLOR.ally, label: 'HP' }),
            new StatBar(this, { x: 20, y: 38, w: w2 - 40, max: 100, value: 35, color: COLOR.danger, label: 'HP' }),
            new StatBar(this, { x: 20, y: 70, w: w2 - 40, max: 100, value: 55, skin: 'blue', label: 'EXP' }),
            new CostMeter(this, { x: 20, y: 104, max: 6, value: 4, label: '코스트', inline: true }),
        ]);
        let x2 = m + w2 + 16;
        let y2 = y + 4;
        if (x2 + 300 > L.lw) { x2 = m; y2 = y + 230; }
        root.add(new Tabs(this, { x: x2, y: y2, w: Math.min(300, L.lw - x2 - m), items: [{ key: 'a', label: '탭 A' }, { key: 'b', label: '탭 B' }, { key: 'c', label: '탭 C' }] }));
        let sx = x2;
        const sy = y2 + 56;
        Object.keys(GRADE).forEach((k) => {
            root.add([slice(this, `slot_${k}`, 64, 64, 'slot').setPosition(sx, sy), makeText(this, sx + 32, sy + 32, k, { size: 20, heading: true, origin: [0.5, 0.5] })]);
            sx += 72;
        });
        const ty = sy + 76;
        root.add([
            slice(this, 'toggle_off', 52, 28, 'toggle').setPosition(x2, ty),
            slice(this, 'toggle_on', 52, 28, 'toggle').setPosition(x2 + 64, ty),
            slice(this, 'slider_track', 140, 10, 'track').setPosition(x2 + 130, ty + 9),
            this.add.image(x2 + 200, ty + 14, 'knob').setDisplaySize(24, 24),
        ]);
        ['sword', 'axe', 'lance', 'bow', 'adv', 'dis', 'plain', 'forest', 'mountain', 'water', 'gold', 'menu', 'star'].forEach((k, i) => {
            root.add(icon(this, k, 28).setPosition(x2 + 14 + i * 34, ty + 56));
        });
        root.add(new Button(this, { x: L.lw - L.safe.r - m - 140, y: L.lh - L.safe.b - m - 48, w: 140, label: '로비로', onClick: () => this.scene.start('Lobby', { tab: 'stage' }) }));
    }
}
