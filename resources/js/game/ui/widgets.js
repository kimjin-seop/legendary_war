import Phaser from 'phaser';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { L } from '../layout.js';
import { makeText } from './common.js';
import { slice, skinOn } from './skin.js';
import { sfx } from '../audio.js';
import { Modal } from './Modal.js';
import { Button as EmptyCta } from './Button.js';

// 로비/인증 화면 공용 소형 위젯: 체크박스, 스크롤 목록, 안내 라벨(아이콘+문구), 오류 모달, 클릭 가능한 행.

// 체크박스(토글 스킨 재사용). onChange(bool)
export class Checkbox extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, label, checked = false, onChange, size = 16, wrap = 400, modal = false }) {
        super(scene, x, y);
        this.checked = checked;
        this.onChange = onChange;
        this.box = slice(scene, checked ? 'toggle_on' : 'toggle_off', 52, 28, 'toggle');
        this.knob = scene.add.image(checked ? 38 : 14, 14, 'knob').setDisplaySize(22, 22);
        this.text = makeText(scene, 62, 14, label, { size, origin: [0, 0.5], wrap });
        const h = Math.max(28, this.text.height, Math.ceil(MIN_TOUCH / (view.scale || 1)));
        const hit = scene.add.rectangle(0, 14 - h / 2, 62 + this.text.width, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => { if (!modal && scene.modalCount > 0) return; sfx('sfx_ui_tap'); this.set(!this.checked); this.onChange?.(this.checked); });
        this.add([this.box, this.knob, this.text, hit]);
        scene.add.existing(this);
    }

    set(b) { this.checked = b; this.box.setTexture(b ? 'toggle_on' : 'toggle_off'); this.knob.x = b ? 38 : 14; }
}

// 안내/오류 라벨: 색뿐 아니라 아이콘 문자(!, ✓, i)를 병행. kind: error|ok|info|muted
export function noteText(scene, x, y, msg, { kind = 'info', size = 14, wrap, origin = [0, 0] } = {}) {
    const icon = { error: '! ', ok: '✓ ', info: 'ⓘ ', muted: '' }[kind];
    const color = { error: CSS.dangerText, ok: CSS.allyText, info: CSS.muted, muted: CSS.muted }[kind];
    return makeText(scene, x, y, msg ? icon + msg : '', { size, color, wrap, origin });
}

// 간단한 오류/안내 모달
export function alertModal(scene, title, body, onClose) {
    return new Modal(scene, { title, body, w: 480, h: 260, buttons: [{ label: '확인' }], onClose });
}
export function confirmModal(scene, title, body, onOk, { okLabel = '확인', danger = false } = {}) {
    return new Modal(scene, { title, body, w: 480, h: 260, buttons: [{ label: '취소' }, { label: okLabel, variant: danger ? 'danger' : 'primary', onClick: onOk }] });
}

// 세로 스크롤 목록: 마스크 + 휠/드래그. add(child) 로 항목을 넣고 setContentHeight(h) 로 범위를 알려준다.
export class ScrollList extends Phaser.GameObjects.Container {
    // bar: 스크롤 단서(우측 스크롤바 + 아래에 더 있을 때 하단 페이드). 내용이 영역보다 길 때만 보인다
    constructor(scene, { x = 0, y = 0, w, h, clip = false, bar = false, fadeColor = COLOR.navyDeep }) {
        super(scene, x, y);
        this.w = w; this.h = h;
        this.content = scene.add.container(0, 0);
        this.contentH = 0;
        this.add(this.content);
        scene.add.existing(this);
        if (clip) this.enableClip();
        if (bar) {
            // 하단 페이드(4px 띠 6장, 아래로 갈수록 진하게) + 스크롤바(트랙 4px, 썸 최소 24px). 입력은 받지 않는다(아래 목록 탭 통과)
            this.fade = scene.add.container(0, h - 24);
            for (let i = 0; i < 6; i += 1) this.fade.add(scene.add.rectangle(0, i * 4, w, 4, fadeColor, 0.12 + i * 0.13).setOrigin(0));
            this.track = scene.add.rectangle(w - 4, 0, 4, h, 0xffffff, 0.12).setOrigin(0);
            this.thumb = scene.add.rectangle(w - 4, 0, 4, 24, COLOR.accent, 0.9).setOrigin(0);
            this.add([this.fade, this.track, this.thumb]);
        }
        const g = scene.add.graphics().setVisible(false);
        this.maskG = g;
        this.refreshMask();
        const hit = scene.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setInteractive();
        this.addAt(hit, 0);
        let dragY = null; let startScroll = 0;
        hit.on('pointerdown', (p) => { dragY = p.worldY; startScroll = this.content.y; });
        hit.on('pointermove', (p) => { if (dragY !== null && p.isDown) this.scrollTo(startScroll + (p.worldY - dragY)); });
        hit.on('pointerup', () => { dragY = null; });
        hit.on('pointerout', () => { dragY = null; });
        this.onWheel = (p, go, dx, dy) => { if (this.owns(p, go)) this.scrollTo(this.content.y - dy * 0.6); };
        scene.input.on('wheel', this.onWheel);
        this.once('destroy', () => { scene.input.off('wheel', this.onWheel); g.destroy(); });
    }

    // Phaser 4 setPosition 이 this.w 를 0 으로 덮어쓰므로 목록 폭 보존(inside 판정)
    setPosition(x, y, z, w) {
        const lw = this.w;
        super.setPosition(x, y, z, w);
        if (lw !== undefined) this.w = lw;
        return this;
    }

    inside(p) {
        const m = this.getWorldTransformMatrix();
        const wx = p.worldX - m.tx; const wy = p.worldY - m.ty;
        return wx >= 0 && wx <= this.w && wy >= 0 && wy <= this.h;
    }

    // 공통 입력 가드(스크롤 전파 차단): 휠은 씬 전역 이벤트라 영역 판정(inside)만으로는 모달/위 패널 아래의 목록까지 같이 스크롤됐다.
    // objs = Phaser 'wheel' 이벤트의 currentlyOver(topOnly 기본값이라 최상단 입력 객체 1개).
    // 최상단 객체에서 부모 컨테이너를 거슬러 올라가 '가장 가까운 ScrollList'가 자기 자신일 때만 스크롤한다.
    // -> 모달 차단막·다른 패널이 위에 있으면 무시, 중첩 목록은 안쪽만 스크롤(안쪽이 끝에 닿아도 바깥으로 전파 안 함).
    owns(p, objs) {
        if (!this.inside(p)) return false;
        if (!Array.isArray(objs)) return true; // 호출 측이 objs 를 주지 않으면 기존 동작(영역 판정)
        let o = objs[0];
        while (o && !(o instanceof ScrollList)) o = o.parentContainer;
        return o === this;
    }

    // Phaser 4: GameObject.setMask(GeometryMask) 는 WebGL 미지원(경고만 나고 클리핑 안 됨) -> 가시성 클리핑으로 대체.
    // 항목(content 의 직계 자식)이 목록 영역 [0,h] 와 겹치지 않으면 숨긴다. 경계에 걸친 항목은 일부가 보일 수 있다(Low).
    // 픽셀 클리핑(옵트인 clip: true): Phaser 4 Mask 필터(external, 화면 좌표)로 목록 영역 [0,w]x[0,h] 밖을 잘라낸다.
    // 마스크 사각형은 표시 목록에 넣지 않고(new Rectangle) 매 프레임(prerender) 목록의 월드 위치로 맞춘다.
    // WebGL 이 아니면(캔버스) 아무것도 하지 않고 기존 가시성 클리핑만 동작한다.
    enableClip() {
        const scene = this.scene;
        if (!scene.renderer?.gl || typeof this.enableFilters !== 'function' || this.clipRect) return;
        const r = new Phaser.GameObjects.Rectangle(scene, 0, 0, this.w, this.h, 0xffffff, 1).setOrigin(0);
        this.clipRect = r;
        this.enableFilters();
        this.filters.external.addMask(r, false, scene.cameras.main, 'world');
        const tm = new Phaser.GameObjects.Components.TransformMatrix();
        const sync = () => {
            if (!this.scene) return;
            const m = this.getWorldTransformMatrix(tm);
            r.setPosition(m.tx, m.ty);
            const cw = this.w * m.scaleX; const ch = this.h * m.scaleY;
            if (r.width !== cw || r.height !== ch) r.setSize(cw, ch);
        };
        sync();
        scene.events.on('prerender', sync);
        this.once('destroy', () => { scene.events.off('prerender', sync); r.destroy(); });
    }

    refreshMask() {
        this.maskG?.setVisible(false);
        this.clipChildren();
    }

    clipChildren() {
        const top = this.content.y;
        // 원인: Container 는 크기가 0 이라 displayHeight=0 -> y=0 첫 행이 (y+0>0) 거짓으로 숨겨졌다.
        // 항목이 영역에 다 들어가면 클리핑 끔. 높이는 clipH > displayHeight > getBounds 순으로 구하고, 0 이면 1px 로 간주.
        const all = this.contentH <= this.h;
        this.content.list.forEach((ch) => {
            let h = ch.clipH ?? ch.displayHeight ?? ch.height ?? 0;
            if (!h && ch.getBounds) { try { h = ch.getBounds().height || 0; } catch (e) { h = 0; } }
            const y = top + ch.y;
            const vis = all || (y + Math.max(h, 1) > 0 && y < this.h);
            if (ch.visible !== vis) ch.setVisible(vis);
        });
    }

    setContentHeight(h) { this.contentH = h; this.scrollTo(this.content.y); }
    scrollTo(y) { const min = Math.min(0, this.h - this.contentH); this.content.y = Math.max(min, Math.min(0, y)); this.clipChildren(); this.updateBar(); }

    updateBar() {
        if (!this.thumb) return;
        const over = this.contentH > this.h + 1;
        [this.track, this.thumb].forEach((o) => o.setVisible(over));
        this.fade.setVisible(over && this.content.y > this.h - this.contentH + 2); // 아래에 더 있음
        if (!over) return;
        const th = Math.max(24, Math.round(this.h * (this.h / this.contentH)));
        const range = this.contentH - this.h;
        this.thumb.setSize(4, th).setY(Math.round((this.h - th) * (-this.content.y / range)));
    }
}

// 클릭 가능한 행(목록 항목): 배경 + 호버 강조. body(container) 에 내용을 넣는다.
export function listRow(scene, { x = 0, y = 0, w, h, onClick, selected = false, disabled = false }) {
    const c = scene.add.container(x, y);
    // 이미지 스킨(row.list.<normal|hover|selected|disabled>, 3h)이 있으면 사용, 없으면 기존 사각형
    const rest = disabled ? 'row_disabled' : selected ? 'row_selected' : 'row_normal';
    const sk = skinOn(scene) ? slice(scene, rest, w, h, 'btn') : null;
    const img = sk?.skinAtlas ? sk : (sk?.destroy(), null);
    const bg = img ?? scene.add.rectangle(0, 0, w, h, selected ? COLOR.panelLight : COLOR.navyDeep, disabled ? 0.5 : 0.85).setOrigin(0).setStrokeStyle(2, selected ? COLOR.accentLight : COLOR.accent, selected ? 1 : 0.5);
    c.add(bg);
    c.bg = bg;
    c.clipH = h;
    if (onClick) {
        bg.setInteractive({ useHandCursor: !disabled });
        bg.on('pointerover', () => { if (!disabled && !(scene.modalCount > 0)) { if (img) img.setTexture('row_hover'); else bg.setFillStyle(COLOR.panelLight, 1); } });
        bg.on('pointerout', () => { if (img) img.setTexture(rest); else bg.setFillStyle(selected ? COLOR.panelLight : COLOR.navyDeep, disabled ? 0.5 : 0.85); });
        bg.on('pointerup', (p) => { if (scene.modalCount > 0) return; if (p.getDistance() > 12) return; sfx('sfx_ui_tap'); onClick(); });
    }
    return c;
}

// 빈 상태 공통(U33): 가운데 정렬 문구(+보조 문구) + 선택 CTA 버튼. 컨테이너 원점 = 영역 좌상단(x, y), 폭 w. 반환 .h = 전체 높이
export function emptyState(scene, { x = 0, y = 0, w, msg, sub, cta, onCta }) {
    const c = scene.add.container(x, y);
    const t = makeText(scene, w / 2, 16, msg, { size: 16, color: CSS.text, origin: [0.5, 0], wrap: w - 32, align: 'center', stroke: { color: '#0B1020', width: 3 } });
    c.add(t);
    let yy = 16 + t.height + 8;
    if (sub) { const s = makeText(scene, w / 2, yy, sub, { size: 13, color: CSS.muted, origin: [0.5, 0], wrap: w - 32, align: 'center' }); c.add(s); yy += s.height + 8; }
    if (cta && onCta) {
        const bw = Math.min(200, w - 32);
        c.add(new EmptyCta(scene, { x: (w - bw) / 2, y: yy + 4, w: bw, h: 48, label: cta, variant: 'primary', size: 16, onClick: onCta }));
        yy += 4 + 48 + 8;
    }
    c.h = yy; c.clipH = yy;
    return c;
}
