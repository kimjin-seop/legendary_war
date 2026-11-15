import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { makeText } from './common.js';

// 코스트/행동 게이지: 금색 마름모 pip + 숫자. inline: 한 줄 배치(툴 바용)
export class CostMeter extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, max, value, label = '', pip = 14, inline = false }) {
        super(scene, x, y);
        this.max = max;
        this.label = makeText(scene, 0, 0, label, { size: 14, color: CSS.muted });
        this.count = makeText(scene, 0, inline ? 0 : this.label.height + 2, '', { size: 20, heading: true, color: CSS.accent });
        this.pips = [];
        const px0 = inline ? this.label.width + 70 : 0;
        const py = inline ? this.count.height / 2 : this.label.height + this.count.height + 8 + pip / 2;
        if (inline) this.count.x = this.label.width + 8;
        for (let i = 0; i < max; i++) {
            this.pips.push(scene.add.rectangle(px0 + i * (pip + 6) + pip / 2, py, pip, pip, COLOR.accent).setAngle(45).setStrokeStyle(2, COLOR.accent));
        }
        this.add([this.label, this.count, ...this.pips]);
        this.meterW = px0 + max * (pip + 6);
        this.setValue(value);
        scene.add.existing(this);
    }

    setValue(v) {
        this.count.setText(`${v}/${this.max}`).setColor(v > this.max ? CSS.dangerText : CSS.accent); // 상한 초과 = 실제 값 + 위험색(다이아는 i < v 라 max 개에서 멈춤)
        this.pips.forEach((p, i) => p.setFillStyle(COLOR.accent, i < v ? 1 : 0));
    }
}
