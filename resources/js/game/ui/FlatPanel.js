import Phaser from 'phaser';
import { COLOR } from '../theme.js';
import { keepW } from './common.js';
import { slice, setSliceSize, skinOn } from './skin.js';

// 전투 HUD 전용 플랫 패널: 반투명 단색(0.72) + 1px 얇은 선, 그림자 없음. Panel 과 같은 API(w, h, body, bodyY, clearBody).
// 배경 사각형이 입력을 소비하므로 패널 위 클릭/드래그는 필드(맵)로 전달되지 않는다. setShown(false) 면 입력도 함께 꺼진다.
// (로비·모달은 기존 스킨 Panel 유지)
export class FlatPanel extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w, h, alpha = 0.72 }) {
        super(scene, x, y);
        this.w = w;
        this.h = h;
        // 이미지 스킨 panel.hud(9) 있으면 사용(알파 유지), 없으면 반투명 단색 + 1px 선
        const sk = skinOn(scene) ? slice(scene, 'panel_hud', w, h, 'panel') : null;
        this.bg = sk?.skinAtlas ? sk.setAlpha(Math.min(1, alpha + 0.2)).setInteractive() : (sk?.destroy(), scene.add.rectangle(0, 0, w, h, COLOR.navyDeep, alpha).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.75).setInteractive());
        this.bodyY = 0;
        this.body = scene.add.container(0, 0);
        this.add([this.bg, this.body]);
        this.shown = true;
        scene.add.existing(this);
    }

    clearBody() { this.body.removeAll(true); }

    // 내용에 맞춰 크기 변경(배경·입력 영역 함께)
    resize(w, h) {
        this.w = w;
        this.h = h;
        if (this.bg.skinAtlas) { setSliceSize(this.bg, w, h); this.bg.input?.hitArea?.setTo(0, 0, this.bg.width, this.bg.height); } else { this.bg.setSize(w, h); this.bg.input?.hitArea?.setTo(0, 0, w, h); }
    }

    setShown(v) {
        if (v === this.shown) return;
        this.shown = v;
        this.setVisible(v);
        if (v) this.bg.setInteractive(); else this.bg.disableInteractive();
    }

    // 화면 좌표가 보이는 패널 위인지
    contains(px, py) { return this.shown && px >= this.x && px <= this.x + this.w && py >= this.y && py <= this.y + this.h; }
}
keepW(FlatPanel); // setPosition 후 this.w 보존(Phaser 4)
