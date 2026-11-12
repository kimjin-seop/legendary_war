import Phaser from 'phaser';
import { CSS } from '../theme.js';
import { makeText, keepW } from './common.js';
import { slice } from './skin.js';

// 스킨 패널(9-슬라이스: 이중 금테두리 + 코너 장식 + 은은한 그라데이션/노이즈) + 선택적 리본 제목. 좌상단 기준.
export class Panel extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w, h, title = '' }) {
        super(scene, x, y);
        this.w = w;
        this.h = h;
        this.add(slice(scene, 'panel', w, h, 'panel'));
        this.bodyY = 0;
        if (title) {
            const rh = 40;
            const ribbon = slice(scene, 'ribbon', w - 24, rh, 'ribbon').setPosition(12, 10);
            const t = makeText(scene, w / 2, 10 + rh / 2 - 2, title, { size: 20, heading: true, color: '#f0d58c', origin: [0.5, 0.5] });
            this.add([ribbon, t]);
            this.ribbon = ribbon; this.titleT = t; // Modal footer 모드가 상단 덮개 위로 다시 올린다
            this.bodyY = rh + 22;
        }
        this.body = scene.add.container(0, this.bodyY);
        this.add(this.body);
        scene.add.existing(this);
    }

    clearBody() {
        this.body.removeAll(true);
    }
}
export { CSS };
keepW(Panel); // setPosition 후 this.w 보존(Phaser 4)
