import Phaser from 'phaser';
import { COLOR, SPACING, MIN_TOUCH } from '../theme.js';
import { L } from '../layout.js';
import { Panel } from './Panel.js';
import { Button } from './Button.js';
import { makeText } from './common.js';
import { tween } from './motion.js';
import { slice } from './skin.js';
import { ScrollList } from './widgets.js'; // 순환 import(widgets -> Modal)지만 둘 다 생성자 안에서만 쓰므로 안전

// 열려 있는 모달 스택: Esc는 최상단 모달만 닫는다.
const stack = [];

// 모달: 전체 화면 차단막 + 패널 + 하단 버튼. Esc로 닫힘(확인 모달은 Esc=취소).
// 모달이 열린 동안 뒤쪽 버튼은 scene.modalCount로 입력/호버가 차단된다.
// buttons: [{label, onClick, variant, keepOpen}]
export class Modal extends Phaser.GameObjects.Container {
    constructor(scene, { title, body = '', w: w0 = 520, h: h0 = 320, buttons = [{ label: '닫기' }], onClose, footer = false, escClose = true }) { // escClose=false: Esc 로 닫지 않음(전투 결과창 등 버튼으로만)
        const w = Math.min(w0, L.lw - 24);
        const h = Math.min(h0, L.lh - (L.short ? 12 : 24)); // 가로 폰: 위아래 여백 12 -> 6
        super(scene, 0, 0);
        this.onClose = onClose;
        scene.modalCount = (scene.modalCount ?? 0) + 1;
        (scene.__modals ??= new Set()).add(this); // 열린 모달 등록부: 입력 잠금 감시(index.js inputWatchdog)가 modalCount 와 실제 열린 모달 수를 비교
        this.once('destroy', () => { scene.__modals?.delete(this); if (!this.closed && scene.sys?.isActive?.()) { this.closed = true; this.cleanup(); scene.modalCount = Math.max(0, (scene.modalCount ?? 1) - 1); } }); // close() 없이 파괴된 모달도 잠금 해제
        this.setDepth(1000);
        scene.children?.bringToTop?.(this); // v19: 늦게 생성된(비동기) 뒤쪽 버튼보다 항상 위(같은 depth 그룹 안 순서 보장)
        const block = scene.add.rectangle(0, 0, L.lw, L.lh, COLOR.ink, 0.7).setOrigin(0).setInteractive();
        this.panel = new Panel(scene, { x: (L.lw - w) / 2, y: (L.lh - h) / 2, w, h, title });
        this.inner = this.panel.body;
        this.inner.setPosition(0, this.panel.bodyY + 12);
        const btnY = h - Math.max(48, MIN_TOUCH) - 24;
        // 본문: 버튼 줄 위 남은 높이를 넘으면 본문만 스크롤(가로 폰 등 낮은 화면에서 긴 본문이 버튼 뒤로 들어가던 문제, docs/PLAN_LANDSCAPE_PHONE.md ④). 들어가면 기존과 같음
        if (body) {
            const bt = makeText(scene, 24, 8, body, { size: L.short ? 16 : 18, wrap: w - 48 });
            const avail = btnY - (this.panel.bodyY + 12) - 10;
            if (bt.y + bt.height > avail && avail >= 48) {
                const sl = new ScrollList(scene, { x: 0, y: 0, w: w - 10, h: avail, clip: true, bar: true });
                sl.content.add(bt);
                sl.setContentHeight(bt.y + bt.height + 8);
                sl.refreshMask?.();
                this.inner.add(sl);
                this.bodyScroll = sl;
            } else this.inner.add(bt);
        }
        // footer: 하단 고정 버튼 바(불투명 바 + 패널 프레임). 스크롤 목록의 경계 걸친 항목(가시성 클리핑)이 버튼 아래로 비치지 않게 덮는다.
        // 호출 측은 this.footerY(패널 좌표) 위로만 내용을 배치한다.
        this.footerY = h;
        if (footer && buttons.length) {
            const fh = h - btnY + 16;
            this.footerY = h - fh;
            this.panel.add(scene.add.rectangle(4, this.footerY, w - 8, fh - 4, COLOR.navyDeep, 1).setOrigin(0).setInteractive());
            this.panel.add(slice(scene, 'panel_sub', w, fh, 'panel').setPosition(0, this.footerY));
            // 상단도 동일: 제목 리본 영역을 불투명 판으로 덮고 리본·제목을 다시 최상위로(스크롤 시 위쪽으로 넘친 항목 가림)
            const hh = this.panel.bodyY + 10;
            this.panel.add(scene.add.rectangle(4, 4, w - 8, hh - 4, COLOR.navyDeep, 1).setOrigin(0));
            this.panel.add(slice(scene, 'panel_sub', w, hh, 'panel'));
            if (this.panel.ribbon) this.panel.bringToTop(this.panel.ribbon);
            if (this.panel.titleT) this.panel.bringToTop(this.panel.titleT);
        }
        const bw = Math.min(180, (w - 48 - SPACING.md * (buttons.length - 1)) / buttons.length);
        const total = (bw + SPACING.md) * buttons.length - SPACING.md;
        buttons.forEach((b, i) => {
            this.panel.add(new Button(scene, {
                x: w / 2 - total / 2 + i * (bw + SPACING.md),
                y: btnY, // 하단 프레임 장식(약 24px) 안쪽(I-8)
                w: bw,
                label: b.label,
                variant: b.variant,
                modal: true,
                onClick: () => { b.onClick?.(); if (!b.keepOpen) this.close(); },
            }));
        });
        this.add([block, this.panel]);
        scene.add.existing(this);
        this.setAlpha(0);
        tween(scene, { targets: this, to: { alpha: 1 }, duration: 140 });
        scene.events.emit('modal-open');
        stack.push(this);
        // 네이티브 keydown 사용(Phaser 키 큐와 독립). 자기 씬 종료 시 정리.
        this.escFn = (e) => {
            if (e.key !== 'Escape' || stack[stack.length - 1] !== this) return;
            if (!escClose) { e.preventDefault(); return; } // Esc 무시(다른 Esc 처리도 막음)
            e.preventDefault();
            scene.lastModalEsc = performance.now(); // 같은 키 입력을 다른 핸들러(전투 취소)가 중복 처리하지 않도록 표식
            this.close();
        };
        window.addEventListener('keydown', this.escFn);
        // 씬 종료(재시작 포함) 시: 리스너 정리 + 닫힘 표시. 종료로 파괴된 모달을 씬 필드 참조로 나중에 close() 해도 무시(this.scene 이 undefined -> modalCount 읽기 오류 방지)
        this.onShutdown = () => { this.cleanup(); this.closed = true; };
        scene.events.once('shutdown', this.onShutdown);
    }

    cleanup() {
        window.removeEventListener('keydown', this.escFn);
        if (this.onShutdown && this.scene?.events) this.scene.events.off('shutdown', this.onShutdown); // 닫힐 때 shutdown 리스너 해제(정검수)
        const i = stack.indexOf(this);
        if (i >= 0) stack.splice(i, 1);
    }

    close() {
        if (this.closed) return;
        this.closed = true;
        this.cleanup();
        const sc = this.scene; // 버튼 onClick 안에서 씬 전환이 먼저 처리돼 이미 파괴됐으면 undefined
        if (sc) sc.modalCount = Math.max(0, (sc.modalCount ?? 1) - 1);
        sc?.__modals?.delete(this);
        const cb = this.onClose;
        if (sc) this.destroy();
        cb?.();
    }
}
