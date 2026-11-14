import Phaser from 'phaser';
import { CSS, MIN_TOUCH, view } from '../theme.js';
import { makeText, fitText } from './common.js';
import { loop, tween } from './motion.js';
import { slice, setSliceSize, skinIcon } from './skin.js';
import { sfx } from '../audio.js';
import { showToast } from './Toast.js';
import { showReasonTip, hideReasonTip } from './ReasonTip.js';

// 스킨 버튼(9-슬라이스 5상태 x 3변형). API: {x,y,w,h,label,onClick,variant,size,disabled,modal,reason}
// - 실제 화면(CSS) 44px 이상 히트 영역 보장(보이는 크기와 별개로 확장)
// - 호버: 밝기 + 1.03 확대 + 금색 글로우 + 커서 화살표 / 눌림: 1unit 하강 + 어두움 / 비활성: 채도 감소 + 사유(reason) 토스트
// - 연출 끄기/축약에서는 트윈 없이 즉시 상태만 바뀐다(motion.tween).
// variant: primary(금색) | default·secondary(네이비) | danger(적색). modal:true 버튼만 모달 열림 중에도 반응.
export class Button extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w = 160, h = MIN_TOUCH, label, onClick, variant = 'default', size = 18, disabled = false, modal = false, reason = '', onHover, icon, iconFn }) {
        super(scene, x, y);
        h = Math.max(h, MIN_TOUCH);
        this.w = w;
        this.h = h;
        this.onClick = onClick;
        this.modal = modal;
        this.reason = reason;
        this.onHover = onHover;
        this.skin = variant === 'default' ? 'secondary' : variant;
        this.state = 'normal';
        this.face = scene.add.container(w / 2, h / 2);
        this.glow = slice(scene, 'btn_glow', w + 14, h + 14, 'btn').setPosition(-w / 2 - 7, -h / 2 - 7).setVisible(false);
        this.ns = slice(scene, `btn_${this.skin}_normal`, w, h, 'btn').setPosition(-w / 2, -h / 2);
        const color = this.skin === 'primary' ? '#1A1406' : CSS.text; // 가이드: 금색 primary 위 라벨 #1A1406(대비 약 10:1)
        this.label = makeText(scene, 0, -1, label, { size, bold: true, color, origin: [0.5, 0.5], stroke: this.skin === 'primary' ? { color: '#f3dc9a', width: 1 } : { color: '#0B1020', width: 3 } });
        this.arrow = scene.add.triangle(-w / 2 + 16, 0, 0, -8, 0, 8, 12, 0, this.skin === 'primary' ? 0x1b2230 : 0xc9a24b).setVisible(false);
        // 선택 아이콘(icon = 아틀라스 ico.<name>, iconFn(scene, size) = 가운데 원점 아이콘 객체·displayWidth 필요): 라벨 왼쪽. 없으면 글자만
        const ic = iconFn ? iconFn(scene, Math.min(24, h * 0.5)) : icon ? skinIcon(scene, icon, Math.min(24, h * 0.5)) : null;
        this.face.add(ic ? [this.glow, this.ns, ic, this.label, this.arrow] : [this.glow, this.ns, this.label, this.arrow]);
        this.icon = ic;
        this.layoutContent();
        const needPx = Math.ceil(MIN_TOUCH / (view.scale || 1));
        const hitW = Math.max(w, needPx);
        const hitH = Math.max(h, needPx);
        this.hit = scene.add.rectangle(-(hitW - w) / 2, -(hitH - h) / 2, hitW, hitH, 0xffffff, 0).setOrigin(0);
        this.add([this.face, this.hit]);
        this.hit.setInteractive({ useHandCursor: true });
        // tipHost(ContextMenu 등 버튼 묶음 컨테이너)가 있으면 비활성 사유 = 호버·탭 시 패널 옆 말풍선(ui/ReasonTip), 없으면 기존 탭 토스트
        this.hit.on('pointerover', () => { this.hover(true); if (this.disabled && this.reason && this.tipHost && this.usableScene()) showReasonTip(this.tipHost, this, this.reason, this.tipHost.tipOpts); });
        this.hit.on('pointerout', () => { this.pressed = false; this.hover(false); if (this.tipHost) hideReasonTip(this.tipHost, this); });
        this.hit.on('pointerdown', () => { this.pressed = true; this.setState('pressed'); });
        this.hit.on('pointerup', () => {
            if (!this.pressed) return;
            this.pressed = false;
            this.setState(this.disabled ? 'disabled' : this.hovered ? 'hover' : this.selected ? 'selected' : 'normal');
            if (this.disabled) { if (this.reason && this.usableScene()) { if (this.tipHost) showReasonTip(this.tipHost, this, this.reason, this.tipHost.tipOpts); else showToast(this.scene, this.reason); } return; }
            if (!this.usable()) return;
            sfx(this.skin === 'danger' ? 'sfx_ui_cancel' : this.skin === 'primary' ? 'sfx_ui_confirm' : 'sfx_ui_tap');
            this.onClick?.();
        });
        this.onModalOpen = () => { if (!this.modal) this.hover(false); };
        scene.events.on('modal-open', this.onModalOpen);
        this.setDisabled(disabled);
        scene.add.existing(this);
    }

    // Phaser 4 Transform.setPosition(x, y, z, w) 는 4번째 성분 this.w 를 0 으로 덮어쓴다 -> 버튼 폭(this.w) 보존
    setPosition(x, y, z, w) {
        const bw = this.w;
        super.setPosition(x, y, z, w);
        if (bw !== undefined) this.w = bw;
        return this;
    }

    usableScene() { return !!this.scene && (this.modal || !(this.scene.modalCount > 0)); } // 파괴 후(씬 종료 중 늦은 포인터 이벤트) scene 이 없으면 사용 불가
    usable() { return !this.disabled && this.usableScene(); }

    // 데모/외부용: 상태 강제 표시
    setState(state) {
        if (!this.scene) return this; // 파괴된 버튼(재배치·씬 종료 뒤 남은 참조): 텍스처 교체가 this.scene.sys 를 읽어 오류(gacha111 pageerror)
        this.state = state;
        this.ns.setTexture(`btn_${this.skin}_${state}`);
        this.face.y = this.h / 2 + (state === 'pressed' ? 1 : 0);
        this.label.setAlpha(state === 'disabled' ? 0.6 : 1);
    }

    hover(on) {
        if (!this.scene) return; // 파괴된 버튼(씬 종료·모달 닫힘 직후의 pointerout/modal-open)
        if (on && !this.usable()) on = false;
        this.hovered = on;
        if (this.disabled) return;
        this.setState(on ? 'hover' : this.selected ? 'selected' : 'normal');
        if (on) this.onHover?.();
        this.glow.setVisible(on);
        this.arrow.setVisible(on);
        this.arrowTween?.remove();
        this.arrowTween = null;
        tween(this.scene, { targets: this.face, to: { scale: on ? 1.03 : 1 }, duration: 90 });
        if (on) {
            sfx('sfx_ui_hover');
            this.arrow.x = -this.w / 2 + 16;
            this.arrowTween = loop(this.scene, { targets: this.arrow, x: -this.w / 2 + 22, duration: 260 });
        }
    }

    setDisabled(b) {
        if (!this.scene) { this.disabled = !!b; return this; }
        this.disabled = b;
        if (b) { this.hovered = false; this.glow.setVisible(false); this.arrow.setVisible(false); this.face.setScale(1); }
        this.setState(b ? 'disabled' : this.selected ? 'selected' : 'normal');
    }

    setSelected(b) {
        if (!this.scene) { this.selected = !!b; return this; }
        this.selected = b;
        this.setState(this.disabled ? 'disabled' : this.hovered ? 'hover' : b ? 'selected' : 'normal');
    }

    setLabel(str) { if (!this.scene || !this.label?.scene) return this; this.label.setText(str); this.layoutContent(); return this; }

    // 아이콘+라벨 묶음을 가운데 정렬하고, 버튼 안쪽 폭(좌우 여백 8)을 넘으면 라벨을 최대 75%까지 축소 -> 그래도 넘치면 말줄임.
    // 라벨 변경(setLabel) 때마다 다시 계산해 아이콘이 글자를 덮지 않게 한다(I-6).
    layoutContent() {
        const ic = this.icon; const t = this.label;
        const gap = ic ? ic.displayWidth + 5 : 0;
        const avail = Math.max(16, this.w - 16 - gap);
        t.setScale(1);
        if (t.width > avail) t.setScale(Math.max(0.75, avail / t.width));
        if (t.displayWidth > avail) fitText(t, avail / t.scaleX);
        const total = gap + t.displayWidth;
        t.x = -total / 2 + gap + t.displayWidth / 2;
        if (ic) ic.setPosition(-total / 2 + ic.displayWidth / 2, -1);
    }

    setSize2(w, h) { setSliceSize(this.ns, w, h); }

    destroy(fromScene) {
        this.arrowTween?.remove();
        this.scene?.events.off('modal-open', this.onModalOpen);
        super.destroy(fromScene);
    }
}
