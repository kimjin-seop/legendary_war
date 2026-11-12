import Phaser from 'phaser';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { makeText, fitText } from './common.js';
import { slice, skinIcon } from './skin.js';
import { sfx } from '../audio.js';
import { withUiImage } from './uiImage.js';
import { texKey } from '../assets.js';

// 라벨 맞춤(공용): 폭 maxW 를 넘으면 글자 크기를 minSize/size 비율까지 축소(setScale), 그래도 넘치면 말줄임
export function fitLabel(t, maxW, size, minSize = 11) {
    if (!maxW || t.width <= maxW) return t;
    const k = Math.max(minSize / size, maxW / t.width);
    t.setScale(k);
    return fitText(t, maxW / k);
}

// 스킨 탭(가로 탭 바·설정 선택지 공용). items: [{key,label}]. modal: 모달 안에서 쓰는 탭만 true.
export class Tabs extends Phaser.GameObjects.Container {
    // stacked: 아이콘 위·라벨 아래 세로 배치(true/false, 생략 시 칸이 좁으면 자동). minSize: 라벨이 칸을 넘으면 이 크기(기본 11)까지 축소 후 말줄임
    // vertical: 세로 아이콘 내비(로비 우측, 사용자 시안 2026-11-04) — 칸마다 원형 아이콘(선택 = 금테 + 은은한 빛) + 아래 라벨. h = 전체 높이, 칸 높이 = min(h/n, 80)
    constructor(scene, { x = 0, y = 0, w, h = MIN_TOUCH, items, active, onChange, size = 18, modal = false, stacked, minSize = 11, vertical = false }) {
        super(scene, x, y);
        this.onChange = onChange;
        this.cells = [];
        if (vertical) { this.buildVertical(scene, { w, h, items, active, size, modal }); return; }
        const cw = w / items.length;
        const ch = Math.max(h, MIN_TOUCH);
        const ok = () => modal || !(scene.modalCount > 0);
        const vert = stacked ?? (items.some((it) => it.icon || it.iconFn) && cw < 110 && ch >= 56);
        items.forEach((it, i) => {
            const bg = slice(scene, 'tab_off', cw - 4, ch, 'tab').setPosition(i * cw + 2, 0);
            const isz = vert ? Math.min(26, ch * 0.4) : Math.min(28, ch * 0.5);
            const ic = it.iconFn ? it.iconFn(scene, Math.round(Math.min(22, isz))) : it.icon ? skinIcon(scene, it.icon, isz) : null; // iconFn(scene, size) = 가운데 원점 아이콘 객체(ui/GameIcons 등, 아틀라스 밖 텍스처)
            const ly = vert && ic ? ch * 0.72 : ch / 2 - 1;
            const ls = vert && ic ? Math.min(size, 14) : size;
            const label = makeText(scene, i * cw + cw / 2, ly, it.label, { size: ls, bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
            // 선택 아이콘(it.icon = 아틀라스 ico.<name>, 없으면 글자만): 가로 = 라벨 왼쪽, 세로 = 라벨 위
            const iw = ic && !vert ? ic.displayWidth + 6 : 0;
            // 세로 배치(좁은 칸, 8탭 390px 등)는 좌우 여백 5씩(Low-1: 3씩이면 '스테이지'가 칸 폭을 꽉 채움) + 최소 크기 9까지 축소 허용(말줄임 방지)
            fitLabel(label, cw - 10 - iw, ls, vert ? Math.min(minSize, 9) : minSize);
            if (ic && vert) ic.setPosition(i * cw + cw / 2, ch * 0.34);
            else if (ic) { ic.setPosition(i * cw + cw / 2 - (label.displayWidth + iw) / 2 + ic.displayWidth / 2, ch / 2 - 1); label.x += iw / 2; }
            // 터치 영역: 칸이 낮아도(가로 폰 34~36) 실제 화면 최소 터치 크기(MIN_TOUCH CSS px)만큼 위아래로 넓힌다(보이는 크기는 그대로, Button 과 같은 규칙)
            const needH = Math.ceil(MIN_TOUCH / (view.scale || 1)); const hh = Math.max(ch, needH);
            const hit = scene.add.rectangle(i * cw, -(hh - ch) / 2, cw, hh, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', () => {
                if (!ok() || this.active === it.key) return;
                sfx('sfx_ui_tap');
                this.setActive(it.key);
                this.onChange?.(it.key);
            });
            hit.on('pointerover', () => { if (ok() && this.active !== it.key) sfx('sfx_ui_hover'); });
            this.add(ic ? [bg, ic, label, hit] : [bg, label, hit]);
            this.cells.push({ key: it.key, bg, label, ic });
        });
        this.setActive(active ?? items[0].key);
        scene.add.existing(this);
    }

    buildVertical(scene, { w, h, items, active, size, modal }) {
        const ok = () => modal || !(scene.modalCount > 0);
        const chV = Math.max(MIN_TOUCH, Math.min(80, Math.floor(h / Math.max(1, items.length))));
        const r = Math.round(Math.min(w * 0.36, chV * 0.32));
        const ls = Math.min(size, chV < 60 ? 11 : 13);
        items.forEach((it, i) => {
            const y0 = i * chV; const cx = w / 2; const cy = y0 + Math.round(chV * 0.4);
            const bg = scene.add.graphics(); bg.vr = { cx, cy, r };
            const ic = it.icon ? skinIcon(scene, it.icon, Math.round(r * 1.2)) : null;
            ic?.setPosition(cx, cy);
            const label = makeText(scene, cx, Math.min(y0 + chV - ls * 0.6 - 2, cy + r + ls * 0.75), it.label, { size: ls, bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
            fitLabel(label, w - 6, ls, 9);
            const hit = scene.add.rectangle(0, y0, w, chV, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', () => { if (!ok() || this.active === it.key) return; sfx('sfx_ui_tap'); this.setActive(it.key); this.onChange?.(it.key); });
            hit.on('pointerover', () => { if (ok() && this.active !== it.key) sfx('sfx_ui_hover'); });
            this.add(ic ? [bg, ic, label, hit] : [bg, label, hit]);
            const cell = { key: it.key, bg, label, ic, vert: true, glyph: ic ? null : it.label.slice(0, 1), fs: Math.round(Math.min(w * 0.9, chV * 0.72)) };
            this.cells.push(cell);
            // 안아트 내비 스킨(ui.nav.<이름> 아이콘 + ui.nav.frame / frame_selected 원형 프레임): 도착하면 코드 원·아틀라스 아이콘 대신. 아이콘 = 프레임 지름 60% 가운데
            if (it.navIcon) {
                const re = () => { if (this.scene) this.setActive(this.active); };
                withUiImage(scene, 'ui.nav.frame', re); withUiImage(scene, 'ui.nav.frame_selected', re);
                withUiImage(scene, it.navIcon, (k) => {
                    if (!this.scene || !label.scene) return;
                    cell.navIc?.destroy();
                    cell.navIc = scene.add.image(cx, cy, k).setDisplaySize(cell.fs * 0.6, cell.fs * 0.6);
                    this.addAt(cell.navIc, this.getIndex(label));
                    ic?.setVisible(false);
                    re();
                });
            }
        });
        this.cellH = chV;
        this.setActive(active ?? items[0].key);
        scene.add.existing(this);
    }

    // 알림 점(빨간 점) 기준 위치(컨테이너 좌표): 아이콘(없으면 라벨) 우상단 모서리 = 모든 탭·가로/세로 배치에서 같은 규칙. 점(반지름 8)이 칸 위로 잘리지 않게 y 하한
    badgePos(key) {
        const c = this.cells.find((v) => v.key === key);
        if (!c) return null;
        if (c.vert) { const { cx, cy, r } = c.bg.vr; return { x: Math.round(cx + r * 0.75), y: Math.round(cy - r * 0.75) }; } // 세로 내비: 원 우상단
        const ref = c.ic ?? c.label;
        return { x: Math.round(ref.x + ref.displayWidth / 2), y: Math.max(9, Math.round(ref.y - ref.displayHeight / 2 + 2)) };
    }

    setActive(key) {
        this.active = key;
        this.cells.forEach((c) => {
            const on = c.key === key;
            if (c.vert) { // 세로 내비: 원형 바탕 + 테(선택 = 밝은 금테 2.5 + 바깥 빛)
                const { cx, cy, r } = c.bg.vr;
                c.bg.clear();
                const fk = texKey(on ? 'ui.nav.frame_selected' : 'ui.nav.frame');
                if (c.navIc && this.scene.textures.exists(fk)) { // 이미지 스킨: 프레임 이미지(선택/기본) + 내비 아이콘
                    if (!c.navFr?.scene) { c.navFr = this.scene.add.image(cx, cy, fk); this.addAt(c.navFr, this.getIndex(c.navIc)); }
                    c.navFr.setTexture(fk).setDisplaySize(c.fs, c.fs);
                    c.navIc.setAlpha(on ? 1 : 0.82);
                    c.label.setColor(on ? '#F6D98C' : CSS.text);
                    return;
                }
                if (on) c.bg.fillStyle(COLOR.accentLight, 0.18).fillCircle(cx, cy, r + 6);
                c.bg.fillStyle(0x0c1428, 0.92).fillCircle(cx, cy, r);
                c.bg.lineStyle(on ? 2.5 : 1.5, on ? COLOR.accentLight : COLOR.accent, on ? 1 : 0.6).strokeCircle(cx, cy, r);
                c.label.setColor(on ? '#F6D98C' : CSS.text);
                if (c.ic) { if (on) c.ic.clearTint().setAlpha(1); else c.ic.setTint(0xb8bfd0).setAlpha(0.85); }
                return;
            }
            c.bg.setTexture(on ? 'tab_on' : 'tab_off');
            // I-3: 선택 탭(tab.on 은 파란 바탕)은 밝은 글자 + 어두운 외곽선(대비 확보), 비선택은 보조색
            c.label.setColor(on ? '#FFF6DA' : CSS.text);
            c.label.setStroke('#0B1020', on ? 4 : 3);
            if (c.ic) { if (on) c.ic.clearTint().setAlpha(1); else c.ic.setTint(0x9aa3b8).setAlpha(0.8); } // 선택 안 된 탭 아이콘은 흐리게(안아트 규칙)
        });
    }
}
