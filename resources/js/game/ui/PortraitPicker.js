import Phaser from 'phaser';
import { ensurePortraitTex, manifestHas } from '../assets.js';
import { protagonistPortraitLogical, PROTAGONIST_EXPRS, drawSilhouette } from '../dialogue/portraitStage.js';
import { makeText } from './common.js';
import { Button } from './Button.js';
import { COLOR, CSS } from '../theme.js';
import { faceLabel } from '../campaign/protagonistQuiz.js';

// 주인공 초상화 선택(재사용: 캐릭터 생성 · 주인공 정보 '초상화 변경').
// new PortraitPicker(scene, { x, y, w, h, faces:['male_a','male_b','male_c'], gender:'m'|'f', value?, name?, confirmLabel?, onChange(face), onConfirm(face) })
// - 카드 3장 가로 배치(좁으면 축소), 선택 = 금색 굵은 테두리 + '✓ 선택' 글자(색만으로 구분하지 않음) + 확대
// - 넓은 화면(w >= 720): 왼쪽 큰 미리보기. 표정 칩(평상/미소/진지/놀람)으로 미리보기 표정 전환
// - 키보드: ←/→ 선택 이동, 1~3 바로 선택, E 표정 전환, Enter 확정. 터치/클릭: 카드 탭 = 선택
// - 키 규약 portrait.protagonist_{face}.<expr> (manifest 에 없거나 로드 실패면 실루엣 + 이름)
const EXPR_LABEL = { neutral: '평상', smile: '미소', determined: '결의', hurt: '부상' };

// 주인공 초상화 1장 그리기(slot = {art:Container(바닥 중앙 원점), w, h}). 로드 중·실패 = 실루엣(이름). 늦게 도착한 로드는 같은 face/expr 일 때만 반영
// full=true(선택 카드): 전신 일러스트 illust.protagonist_<face>.fullbody(안아트, manifest 에 있을 때) 우선, 없으면 표정 초상화
export function renderProtagonistArt(scene, slot, { face, gender = null, name = '', full = false } = {}, expr = 'neutral') {
    const token = [face, gender, expr, full].join('|');
    slot.token = token;
    const fb = full && face ? `illust.protagonist_${face}.fullbody` : null;
    const logical = fb && manifestHas(fb) ? fb : protagonistPortraitLogical({ face, gender }, expr);
    const key = logical ? ensurePortraitTex(scene, logical, (k) => { if (k && slot.art?.scene && slot.token === token) renderProtagonistArt(scene, slot, { face, gender, name, full }, expr); }) : null;
    if (!slot.art?.scene) return;
    slot.art.removeAll(true);
    if (key && scene.textures.exists(key)) {
        const img = scene.add.image(0, 0, key).setOrigin(0.5, 1);
        img.setScale(Math.min(slot.w / img.width, slot.h / img.height));
        slot.art.add(img);
    } else {
        const [sil, nm] = drawSilhouette(scene, Math.round(slot.h * 0.92), name, 14);
        sil.setScale(Math.min(1, slot.w / (slot.h * 0.6)), 1);
        slot.art.add([sil, nm]);
    }
}

export class PortraitPicker extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w, h, faces, gender = null, value = null, name = '', confirmLabel = '이 모습으로', onChange = null, onConfirm = null }) {
        super(scene, x, y);
        this.w = w; this.h = h;
        this.faces = (faces ?? []).slice(0, 3);
        this.gender = gender;
        this.name = name;
        this.onChange = onChange; this.onConfirm = onConfirm;
        this.sel = Math.max(0, this.faces.indexOf(value));
        this.expr = 'neutral';
        this.cards = [];
        this.build(confirmLabel);
        scene.add.existing(this);
        this.bindKeys();
        this.once('destroy', () => this.unbindKeys());
    }

    get value() { return this.faces[this.sel] ?? null; }

    build(confirmLabel) {
        const s = this.scene;
        const wide = this.w >= 720;
        const btnH = 48;
        const chipH = 40;
        const bottomH = chipH + 12 + btnH;
        const areaH = this.h - bottomH - 12;
        let cx0 = 0; let cw = this.w;
        if (wide) { // 왼쪽 확대 미리보기
            const pw = Math.min(Math.round(this.w * 0.34), Math.round(areaH * 0.8));
            this.preview = { x: 0, y: 0, w: pw, h: areaH, c: s.add.container(0, 0) };
            this.add(s.add.rectangle(0, 0, pw, areaH, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(2, COLOR.accent, 0.9));
            this.add(this.preview.c);
            cx0 = pw + 16; cw = this.w - cx0;
        }
        const gap = Math.max(8, Math.round(cw * 0.03));
        const cardW = Math.floor((cw - gap * 2) / 3);
        const cardH = Math.min(areaH - 30, Math.round(cardW * 1.35));
        const top = Math.max(0, Math.round((areaH - 30 - cardH) / 2));
        this.faces.forEach((face, i) => {
            const c = s.add.container(cx0 + i * (cardW + gap) + cardW / 2, top + cardH / 2);
            const bg = s.add.rectangle(0, 0, cardW, cardH, COLOR.navyDeep, 0.9).setStrokeStyle(1, COLOR.accent, 0.4);
            const art = s.add.container(0, cardH / 2 - 4);
            const label = makeText(s, 0, cardH / 2 + 14, `${i + 1}. ${faceLabel(face)}`, { size: 14, bold: true, origin: [0.5, 0.5] });
            const mark = makeText(s, 0, -cardH / 2 + 14, '✓ 선택', { size: 13, bold: true, color: '#1A1406', origin: [0.5, 0.5] });
            const markBg = s.add.rectangle(0, -cardH / 2 + 14, 64, 22, COLOR.accent, 1);
            c.add([bg, art, label, markBg, mark]);
            c.setSize(cardW, cardH);
            bg.setInteractive({ useHandCursor: true });
            bg.on('pointerup', () => this.select(i));
            // 카드 아래 라벨 줄도 선택 영역(그림 영역만 반응하던 문제)
            const lhit = s.add.rectangle(0, cardH / 2 + 14, cardW, 28, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
            lhit.on('pointerup', () => this.select(i));
            c.add(lhit);
            this.add(c);
            this.cards.push({ c, bg, art, label, mark, markBg, face, w: cardW, h: cardH - 8 });
            this.renderArt(this.cards[i], face, 'neutral', true); // 카드 = 전신 일러스트
        });
        // 표정 칩 + 확정
        const by = areaH + 12;
        this.exprBtns = PROTAGONIST_EXPRS.map((e, k) => {
            const bw = Math.min(96, Math.floor((this.w - 8 * 3) / 4));
            const b = new Button(s, { x: k * (bw + 8), y: by, w: bw, h: chipH, label: EXPR_LABEL[e] ?? e, size: 14, onClick: () => this.setExpr(e) });
            this.add(b);
            return { e, b };
        });
        const cbw = Math.min(260, this.w);
        this.confirmBtn = new Button(s, { x: this.w - cbw, y: by + chipH + 12, w: cbw, h: btnH, label: confirmLabel, variant: 'primary', onClick: () => this.confirm() });
        this.add(this.confirmBtn);
        this.refresh();
    }

    renderArt(slot, face, expr, full = false) { renderProtagonistArt(this.scene, slot, { face, gender: this.gender, name: this.name, full }, expr); }

    renderPreview() {
        const p = this.preview;
        if (!p) return;
        if (!p.slot) { const art = this.scene.add.container(p.w / 2, p.h - 8); p.c.add(art); p.slot = { art, w: p.w - 16, h: p.h - 16 }; }
        this.renderArt(p.slot, this.value, this.expr);
    }

    refresh() {
        this.cards.forEach((cd, i) => {
            const on = i === this.sel;
            cd.bg.setStrokeStyle(on ? 4 : 1, on ? COLOR.accent : COLOR.accent, on ? 1 : 0.4);
            cd.mark.setVisible(on); cd.markBg.setVisible(on);
            cd.label.setColor(on ? '#f0d58c' : CSS.text);
            cd.c.setScale(on && !this.preview ? 1.06 : 1); // 미리보기 패널이 없는 좁은 화면: 선택 카드 확대
            this.renderArt(cd, cd.face, on ? this.expr : 'neutral', !this.preview || !on || this.expr === 'neutral'); // 전신 카드. 미리보기 패널 없는 좁은 화면에서 표정을 고르면 선택 카드만 표정 초상화
        });
        this.exprBtns?.forEach(({ e, b }) => b.setAlpha(e === this.expr ? 1 : 0.65));
        this.renderPreview();
        this.confirmBtn?.setDisabled?.(!this.value);
    }

    select(i) {
        if (i < 0 || i >= this.faces.length) return;
        this.sel = i;
        this.refresh();
        this.onChange?.(this.value);
    }

    setExpr(e) { this.expr = e; this.refresh(); }

    confirm() { if (this.value) this.onConfirm?.(this.value); }

    bindKeys() {
        const kb = this.scene.input.keyboard;
        if (!kb) return;
        this.keyFn = (ev) => {
            if (!this.visible || this.scene.modalCount) return;
            if (ev.key === 'ArrowLeft') this.select((this.sel + this.faces.length - 1) % this.faces.length);
            else if (ev.key === 'ArrowRight') this.select((this.sel + 1) % this.faces.length);
            else if (/^[1-3]$/.test(ev.key)) this.select(Number(ev.key) - 1);
            else if (ev.key === 'e' || ev.key === 'E') this.setExpr(PROTAGONIST_EXPRS[(PROTAGONIST_EXPRS.indexOf(this.expr) + 1) % PROTAGONIST_EXPRS.length]);
            else if (ev.key === 'Enter' && !ev.repeat) this.confirm();
        };
        kb.on('keydown', this.keyFn);
    }

    unbindKeys() { this.scene?.input?.keyboard?.off('keydown', this.keyFn); }
}
