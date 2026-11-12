import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { makeText, fitText, keepW } from './common.js';

// 공용 표(헤더 행 + 데이터 행). 좌상단 기준, this.h = 전체 높이.
// cols: [{ label, width?(고정 폭) | ratio?(남은 폭 비율, 기본 1), align?('left'|'center'|'right'), wrap?(true면 줄바꿈해 행 높이 증가), color?, size? }]
// rows: [{ cells: [값...], muted?(회색 행, 예: 준비 중), color? }] — 값: 문자열 | { text, chip?(칩 배경색 숫자), color?, bold? }
// 옵션: header(기본 true), rowH(최소 행 높이, 기본 34), size(본문 14), zebra(교차 배경), lines(행 구분선)
export class TableView extends Phaser.GameObjects.Container {
    constructor(scene, { x = 0, y = 0, w, cols, rows, header = true, rowH = 34, size = 14, zebra = true, lines = true, valign = 'middle' }) {
        super(scene, x, y);
        const fixed = cols.reduce((s, c) => s + (c.width ?? 0), 0);
        const ratioSum = cols.reduce((s, c) => s + (c.width ? 0 : (c.ratio ?? 1)), 0) || 1;
        const free = Math.max(0, w - fixed);
        let cx = 0;
        const cw = cols.map((c) => { const v = c.width ?? Math.floor(free * (c.ratio ?? 1) / ratioSum); const o = { x: cx, w: v }; cx += v; return o; });
        const pad = 8;
        let yy = 0;
        const cellText = (val, c, i, rowColor, muted, hy) => {
            const v = val && typeof val === 'object' ? val : { text: val ?? '' };
            const a = c.align ?? 'left';
            const tx = a === 'center' ? cw[i].x + cw[i].w / 2 : a === 'right' ? cw[i].x + cw[i].w - pad : cw[i].x + pad;
            const t = makeText(scene, tx, hy, String(v.text ?? ''), { size: v.size ?? c.size ?? size, bold: !!v.bold, color: muted ? CSS.muted : (v.color ?? c.color ?? rowColor ?? CSS.text), origin: [a === 'center' ? 0.5 : a === 'right' ? 1 : 0, 0], ...(c.wrap ? { wrap: cw[i].w - pad * 2 } : {}) });
            if (!c.wrap) fitText(t, cw[i].w - pad * 2 - (v.chip != null ? 8 : 0));
            return { t, chip: v.chip };
        };
        if (header) {
            const hh = Math.max(28, rowH - 4);
            this.add(scene.add.rectangle(0, 0, w, hh, COLOR.ink, 0.75).setOrigin(0));
            cols.forEach((c, i) => {
                const { t } = cellText({ text: c.label, bold: true, color: '#f0d58c', size: Math.max(12, size - 1) }, { ...c, wrap: false }, i);
                t.setY((hh - t.height) / 2); this.add(t);
            });
            this.add(scene.add.rectangle(0, hh - 1, w, 1, COLOR.accent, 0.7).setOrigin(0));
            yy = hh;
        }
        this.colBoxes = cw; // 열 {x, w}·행 {y, h}(표 좌표): 셀 위에 이미지(스킬 아이콘 등)를 나중에 얹을 때
        this.rowBoxes = [];
        rows.forEach((r, ri) => {
            const cells = cols.map((c, i) => cellText(r.cells[i], c, i, r.color, r.muted, 0));
            const rh = Math.max(rowH, ...cells.map(({ t }) => t.height + 12));
            this.rowBoxes.push({ y: yy, h: rh });
            const bg = r.muted ? 0x2a2f3a : (zebra && ri % 2 ? COLOR.panelLight : COLOR.navyDeep);
            this.add(scene.add.rectangle(0, yy, w, rh, bg, r.muted ? 0.55 : (zebra && ri % 2 ? 0.55 : 0.4)).setOrigin(0));
            cells.forEach(({ t, chip }, i) => {
                t.setY(yy + (cols[i].wrap || valign === 'top' ? 6 : (rh - t.height) / 2)); // valign top: 여러 줄 값 행에서 라벨도 첫 줄에 맞춤
                if (chip != null) {
                    const ox = t.originX; const cwid = t.width + 12;
                    this.add(scene.add.rectangle(t.x - ox * t.width - 6, t.y - 2, cwid, t.height + 4, r.muted ? 0x555a66 : chip, 0.85).setOrigin(0).setStrokeStyle(1, COLOR.text, 0.25));
                }
                this.add(t);
            });
            if (lines) this.add(scene.add.rectangle(0, yy + rh - 1, w, 1, COLOR.accent, 0.22).setOrigin(0));
            yy += rh;
        });
        this.w = w; this.h = yy;
        this.clipH = yy;
        scene.add.existing(this);
    }
}

// 라벨-값 2열 표(라벨 열 고정 폭). pairs: [[라벨, 값(문자열|{text,color,...})], ...]
export function kvTable(scene, { x = 0, y = 0, w, pairs, labelW = 96, size = 14, rowH = 30 }) {
    return new TableView(scene, { x, y, w, header: false, rowH, size, valign: 'top', cols: [{ label: '', width: labelW, color: CSS.muted }, { label: '', ratio: 1, wrap: true }], rows: pairs.filter(Boolean).map(([k, v]) => ({ cells: [k, v] })) });
}
keepW(TableView); // setPosition 후 this.w 보존(Phaser 4)
