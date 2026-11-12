import Phaser from 'phaser';
import { CSS, COLOR } from '../theme.js';
import { makeText } from './common.js';

// 상성: 화살표 아이콘 + 텍스트(색 + 형태 + 문구 3중 표기). aff: 1 유리 / -1 불리 / 0 대등
// pair(선택): 둘째 줄 공격 -> 방어 병종·배율(names.matchupPair, 서버 matchups 9종 반영). 없으면 한 줄(기존과 동일)
export class AffinityBadge extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, aff, pair = null, wrap = 0 }) {
        super(scene, x, y);
        const g = scene.add.graphics();
        const label = aff > 0 ? '유리' : aff < 0 ? '불리' : '대등';
        const color = aff > 0 ? COLOR.ally : aff < 0 ? COLOR.danger : COLOR.muted;
        g.fillStyle(color, 1);
        if (aff > 0) g.fillPoints([{ x: 10, y: 0 }, { x: 20, y: 12 }, { x: 14, y: 12 }, { x: 14, y: 22 }, { x: 6, y: 22 }, { x: 6, y: 12 }, { x: 0, y: 12 }], true);
        else if (aff < 0) g.fillPoints([{ x: 10, y: 22 }, { x: 20, y: 10 }, { x: 14, y: 10 }, { x: 14, y: 0 }, { x: 6, y: 0 }, { x: 6, y: 10 }, { x: 0, y: 10 }], true);
        else g.fillRect(0, 8, 20, 6);
        const t = makeText(scene, 28, 11, `상성 ${label}`, {
            size: 18, bold: true, origin: [0, 0.5],
            color: aff > 0 ? CSS.allyText : aff < 0 ? CSS.dangerText : CSS.muted,
        });
        this.add([g, t]);
        this.badgeH = 24;
        if (pair) { const p = makeText(scene, 28, 26, pair, { size: 13, color: CSS.muted, ...(wrap ? { wrap: Math.max(80, wrap - 28) } : {}) }); this.add(p); this.badgeH = 26 + p.height; }
        scene.add.existing(this);
    }

    get displayHeight() { return this.badgeH; }
    set displayHeight(v) { /* 고정 */ }
}
