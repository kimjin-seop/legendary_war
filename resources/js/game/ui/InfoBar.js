import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { makeText } from './common.js';
import { statIcon } from './GameIcons.js';

// 한 줄 정보 바(전투 HUD): hover/탭한 칸의 유닛 또는 지형 정보를 줄바꿈 없이 한 줄로.
// segs: [{text, color?, pri}] — pri 가 작을수록 중요. 폭을 넘으면 pri 가 큰 것부터 숨기고, 그래도 넘치면 마지막 조각을 말줄임.
// 입력을 소비하지 않는다(필드 클릭과 충돌 없음).
export class InfoBar extends Phaser.GameObjects.Container {
    constructor(scene) {
        super(scene, 0, 0);
        this.bg = scene.add.rectangle(0, 0, 10, 30, COLOR.navyDeep, 0.95).setOrigin(0) /* U18: 맵 비침 방지 */.setStrokeStyle(1, COLOR.accent, 0.75);
        this.add(this.bg);
        this.texts = [];
        this.key = '';
        this.setVisible(false);
        scene.add.existing(this);
    }

    // rect: {x, y, w, h}, center: true 면 내용 폭에 맞춰 rect 안에서 가운데 정렬
    show(segs, rect, align = 'left', { fill = false } = {}) { // align: left | center | right, fill: 바탕 = rect 전폭(내용은 align 대로 그 안에)
        const key = JSON.stringify(segs) + JSON.stringify(rect) + align + fill;
        if (key === this.key && this.visible) return;
        this.key = key;
        this.texts.forEach((t) => { t.ico?.destroy(); t.destroy(); });
        this.texts = [];
        const pad = 10; const gap = 10;
        const maxW = rect.w - pad * 2;
        let list = segs.slice();
        // seg.ico = 능력치 아이콘 키(atk|def|hp|move|range, ui/GameIcons.statIcon) -> 글자 앞 16px 아이콘(폭 +18)
        const mk = (s) => { const t = makeText(this.scene, 0, rect.h / 2, s.text, { size: 15, bold: !!s.bold, color: s.color ?? CSS.text, origin: [0, 0.5] }); if (s.ico) { t.ico = statIcon(this.scene, s.ico, 0, rect.h / 2, 16); t.icoW = 18; } return t; };
        let objs = list.map(mk);
        const total = () => objs.reduce((p, o) => p + o.width + (o.icoW ?? 0), 0) + gap * Math.max(0, objs.length - 1);
        while (total() > maxW && list.length > 1) { // 우선순위 낮은 것부터 숨김
            let worst = 0;
            list.forEach((s, i) => { if ((s.pri ?? 9) >= (list[worst].pri ?? 9)) worst = i; });
            objs[worst].ico?.destroy(); objs[worst].destroy();
            objs.splice(worst, 1);
            list.splice(worst, 1);
        }
        if (total() > maxW && objs.length) { // 마지막 수단: 말줄임
            const o = objs[objs.length - 1];
            let s = o.text;
            while (s.length > 1 && total() > maxW) { s = s.slice(0, -1); o.setText(`${s}…`); }
        }
        const cw = Math.min(rect.w, total() + pad * 2); // 내용 폭
        const w = fill ? rect.w : cw;
        const x0 = fill ? rect.x : align === 'center' ? rect.x + (rect.w - w) / 2 : align === 'right' ? rect.x + rect.w - w : rect.x;
        this.setPosition(Math.round(x0), Math.round(rect.y));
        this.bg.setSize(w, rect.h);
        this.bg.width = w; this.bg.height = rect.h;
        let x = fill ? (align === 'center' ? (w - cw) / 2 : align === 'right' ? w - cw : 0) + pad : pad;
        objs.forEach((o) => { if (o.ico) { o.ico.setX(x + 8); this.add(o.ico); x += o.icoW; } o.setX(x); x += o.width + gap; this.add(o); });
        this.texts = objs;
        this.setVisible(true);
    }

    hide() { this.setVisible(false); this.key = ''; }
}
