import Phaser from 'phaser';
import { COLOR, CSS, fs } from '../theme.js';
import { makeText, keepW } from './common.js';
import { tween } from './motion.js';
import { slice, setSliceSize } from './skin.js';

// 스킨 게이지(유리 광택+눈금). skin: green|red|blue|gold (미지정 시 color로 추정). 수치 텍스트 병기(색에만 의존하지 않음).
// valueW>0: 수치 텍스트를 바 밖 오른쪽(폭 valueW 예약)에 '값/최대'로 둔다(채움 경계와 글자가 겹치지 않게). 트랙 폭 = w - valueW - 8
export class StatBar extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w = 200, h = 20, max, value, color = COLOR.ally, label = 'HP', skin, valueW = 0 }) {
        super(scene, x, y);
        this.w = w;
        this.max = max;
        this.value = value;
        this.labelText = label;
        this.outside = valueW > 0;
        this.trackW = this.outside ? Math.max(40, w - valueW - 8) : w;
        this.barH = Math.max(h, fs(18));
        const kind = skin ?? (color === COLOR.danger ? 'red' : color === COLOR.exp ? 'blue' : color === COLOR.accent ? 'gold' : 'green');
        this.bg = slice(scene, 'gauge_bg', this.trackW, this.barH, 'gauge');
        // 이미지 스킨(bar.track + bar.fill.*): 채움은 트랙 높이의 10/14, 상하 가운데. 없으면 코드 스킨(2px 안쪽)
        this.fillH = this.bg.skinAtlas ? Math.round(this.barH * 10 / 14) : this.barH - 4;
        this.fillX = this.bg.skinAtlas ? Math.round(this.barH * 0.25) : 2;
        this.fill = slice(scene, `gauge_${kind}`, this.trackW - this.fillX * 2, this.fillH, 'gauge').setPosition(this.fillX, (this.barH - this.fillH) / 2);
        this.txt = this.outside
            ? makeText(scene, w, this.barH / 2, '', { size: 13, bold: true, color: CSS.muted, origin: [1, 0.5] })
            : makeText(scene, w / 2, this.barH / 2, '', { size: 14, bold: true, origin: [0.5, 0.5], stroke: { color: CSS.bg, width: 3 } });
        this.add([this.bg, this.fill, this.txt]);
        this.render(value);
        scene.add.existing(this);
    }

    get displayHeight() { return this.barH; }
    set displayHeight(v) { /* 고정 */ }

    render(v) {
        const fw = Math.max(0, (this.trackW - this.fillX * 2) * (v / this.max));
        this.fill.setVisible(fw >= 4);
        if (fw >= 4) setSliceSize(this.fill, fw, this.fillH);
        this.txt.setText(this.outside ? `${Math.round(v)}/${this.max}` : `${this.labelText} ${Math.round(v)}/${this.max}`);
    }

    setValue(v, animate = true) {
        const from = this.value;
        this.value = v;
        if (!animate) { this.render(v); return; }
        const proxy = { v: from };
        tween(this.scene, { targets: proxy, to: { v }, duration: 300, onUpdate: () => this.render(proxy.v), onComplete: () => this.render(v) });
    }
}
keepW(StatBar); // setPosition 후 this.w 보존(Phaser 4)
