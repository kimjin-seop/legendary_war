import Phaser from 'phaser';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { Button } from './Button.js';
import { AffinityBadge } from './AffinityBadge.js';
import { makeText, stack, fitText, keepW } from './common.js';
import { slice } from './skin.js';
import { tween } from './motion.js';
import { FLANK_PCT, FLANK_LABEL } from '../systems/facing.js';
import { soldierCount, troopLabel } from '../systems/soldiers.js';
import { skillIconImage } from './SkillIcon.js';
import { actionIcon } from './GameIcons.js';
import { matchupPairLine } from '../systems/names.js';

// 유닛 옆 컨텍스트 UI: 행동 메뉴 / 전투 예측 말풍선 / 유닛 간단 툴팁.
// 좌표는 모두 '화면(설계 단위) 좌표' 기준이라 맵 줌·팬·정수 배율과 무관하다. 호출 측이 타일의 화면 사각형(anchor)과 허용 영역(bounds)을 넘긴다.
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// anchor 옆에 w x h 상자를 놓는다.
// 1) order 순서로 '클램프 없이' 영역 안에 들어가는 첫 후보(= 가장자리에서는 반대편으로 반전)
// 2) 모두 넘치면 넘침이 가장 적은 후보를 골라 영역 안으로 클램프(앵커와 겹치지 않는 쪽 우선)
// avoid: 가리면 안 되는 화면 사각형 목록(예: 공격 대상 적 칸). 겹치지 않는 후보 우선, 다 겹치면 겹치는 개수가 적은 쪽(결과 .hit = 겹친 수)
export function placeNear(anchor, w, h, bounds, order = ['right', 'left', 'top', 'bottom'], gap = 10, avoid = []) {
    const cand = {
        right: { x: anchor.x + anchor.w + gap, y: anchor.y + anchor.h / 2 - h / 2 },
        left: { x: anchor.x - w - gap, y: anchor.y + anchor.h / 2 - h / 2 },
        top: { x: anchor.x + anchor.w / 2 - w / 2, y: anchor.y - h - gap },
        bottom: { x: anchor.x + anchor.w / 2 - w / 2, y: anchor.y + anchor.h + gap },
    };
    const maxX = Math.max(bounds.x, bounds.x + bounds.w - w);
    const maxY = Math.max(bounds.y, bounds.y + bounds.h - h);
    const overlaps = (x, y) => x < anchor.x + anchor.w && x + w > anchor.x && y < anchor.y + anchor.h && y + h > anchor.y;
    const hits = (x, y) => avoid.reduce((n, r) => n + (x < r.x + r.w && x + w > r.x && y < r.y + r.h && y + h > r.y ? 1 : 0), 0);
    let best = null;
    for (const side of order) {
        const c = cand[side];
        const x = clamp(c.x, bounds.x, maxX);
        const y = clamp(c.y, bounds.y, maxY);
        const over = Math.abs(x - c.x) + Math.abs(y - c.y);
        const ov = overlaps(x, y); const hit = hits(x, y);
        if (over === 0 && !ov && !hit) return { x, y, side, hit: 0 };
        const score = over + (ov ? 10000 : 0) + hit * 3000;
        if (!best || score < best.score) best = { x, y, side, score, hit };
    }
    return best;
}

// 말풍선 꼬리(유닛 방향 삼각형). SkillMenu 도 사용
export function tail(scene, pos, w, h, anchor) {
    const g = scene.add.graphics();
    const cx = anchor.x + anchor.w / 2 - pos.x;
    const cy = anchor.y + anchor.h / 2 - pos.y;
    g.fillStyle(COLOR.accent, 1);
    if (pos.side === 'right') { const y = clamp(cy, 16, h - 16); g.fillTriangle(0, y - 9, 0, y + 9, -10, y); }
    else if (pos.side === 'left') { const y = clamp(cy, 16, h - 16); g.fillTriangle(w, y - 9, w, y + 9, w + 10, y); }
    else if (pos.side === 'top') { const x = clamp(cx, 16, w - 16); g.fillTriangle(x - 9, h, x + 9, h, x, h + 10); }
    else { const x = clamp(cx, 16, w - 16); g.fillTriangle(x - 9, 0, x + 9, 0, x, -10); }
    return g;
}

const itemH = () => Math.max(48, Math.ceil(MIN_TOUCH / view.scale));

function popIn(scene, obj) {
    obj.setAlpha(0);
    tween(scene, { targets: obj, to: { alpha: 1 }, duration: 100 }); // 연출 끄기에서는 즉시 표시
}

// 행동 메뉴: 세로 1열(공간/폭이 좁으면 2x2). items: [{label,onClick,variant,disabled,reason}]
// touch: 손가락에 가리지 않도록 유닛 위/옆 우선(top,right,left) + 간격 확대
// width: 1열 항목 폭(기본 168, 스킬 목록처럼 긴 라벨용), oneCol: 좁아도 1열 유지. 라벨이 폭을 넘으면 말줄임
// 항목 iconFrame(스킬 아이콘 프레임, ui/SkillIcon.js): 하나라도 있으면 1열에서 버튼 왼쪽에 48 칸(아이콘 없는 항목은 칸만 비움, 빈 사각 없음). 버튼 크기·터치 영역은 그대로
const ICON = 48;
export class ContextMenu extends Phaser.GameObjects.Container {
    constructor(scene, { anchor, bounds, items, narrow = false, touch = false, width = 168, oneCol = false, size = 18, avoid = [] }) {
        super(scene, 0, 0);
        const bh = itemH();
        const pad = 12;
        const gap = 6;
        const oneColH = pad * 2 + items.length * bh + (items.length - 1) * gap;
        const two = !oneCol && (narrow || oneColH > bounds.h);
        const cols = two ? 2 : 1;
        const ig = !two && items.some((it) => it.iconFrame) ? ICON + gap : 0; // 아이콘 칸 폭
        const anyIco = items.some((it) => it.icon); // 버튼 안 라벨 앞 아이콘(it.icon = GameIcons.actionIcon 종류). 2열은 아이콘만큼 칸을 넓힌다(108 -> 최대 124, 영역이 허락하는 만큼)
        const cw = two ? (anyIco ? Math.max(108, Math.min(124, Math.floor((bounds.w - pad * 2 - gap) / 2))) : 108) : Math.min(width, Math.max(108, bounds.w - pad * 2 - ig));
        const icoS = two ? 18 : 22;
        const rows = Math.ceil(items.length / cols);
        const w = pad * 2 + ig + cols * cw + (cols - 1) * gap;
        // 항목 설명 줄(it.desc, 1열만: MP 방식 스킬 효과 등) + 경고(it.descWarn, 붉은 글자 앞줄). 들어갈 높이에 따라 2줄 -> 1줄 -> 생략
        const anyDesc = !two && items.some((it) => it.desc || it.descWarn);
        const descH0 = (lines) => (anyDesc ? lines * 15 + 2 : 0);
        const hOf = (dh) => pad * 2 + rows * bh + (rows - 1) * gap + items.filter((it) => it.desc || it.descWarn).length * dh;
        const dLines = anyDesc ? ([2, 1].find((n) => hOf(descH0(n)) <= bounds.h) ?? 0) : 0;
        const descH = descH0(dLines) * (dLines ? 1 : 0);
        const h = hOf(descH);
        const pos = placeNear(anchor, w, h, bounds, touch ? ['top', 'right', 'left', 'bottom'] : undefined, touch ? Math.max(14, anchor.h * 0.3) : 10, avoid);
        this.setPosition(pos.x, pos.y);
        this.w = w;
        this.h = h;
        const bgp = slice(scene, 'panel', w, h, 'panel');
        if (pos.hit) bgp.setAlpha(0.72); // 대상 적을 피할 자리가 없으면 바탕을 반투명으로(아래 적이 비쳐 보이게, 하플레이 2026-11-04)
        this.add(bgp);
        this.add(tail(scene, pos, w, h, anchor));
        this.items = items;
        let yAcc = pad;
        this.btns = items.map((it, i) => {
            const by = cols === 1 ? yAcc : pad + Math.floor(i / cols) * (bh + gap);
            const dh = descH && (it.desc || it.descWarn) ? descH : 0;
            if (cols === 1) yAcc += bh + dh + gap;
            const b = new Button(scene, {
                x: pad + ig + (i % cols) * (cw + gap), y: by, w: cw, h: bh,
                label: it.label, variant: it.variant, disabled: it.disabled, reason: it.reason, onClick: it.onClick, size,
                onHover: () => this.select(i), iconFn: it.icon ? (sc) => actionIcon(sc, it.icon, icoS) : undefined,
            });
            if (!b.icon && b.label?.width > cw - 14) fitText(b.label, cw - 14); // 아이콘 버튼은 Button.layoutContent 가 아이콘 폭을 빼고 축소·말줄임
            if (it.disabled) b.setAlpha(0.55); // 비활성 확실히 표시(secondary 비활성 텍스처가 일반과 거의 같아 활성처럼 보이던 문제, 강화면 2026-11-06)
            const ic = ig ? skillIconImage(scene, it.iconFrame, pad + ICON / 2, by + bh / 2, ICON) : null;
            if (ic) { if (it.disabled) ic.setAlpha(0.45); this.add(ic); }
            this.add(b);
            if (it.dotColor != null) { const dx = pad + ig + 9; const dy = by + 9; const d = scene.add.circle(dx, dy, 5, it.dotColor, it.disabled ? 0.5 : 1).setStrokeStyle(1.5, 0x0b1020, 0.9); this.add(d); } // 속성 색 점(버튼 왼쪽 위)
            if (dh) { // 설명: 경고(붉은) 다음 효과(회색), 버튼 바로 아래 dLines 줄까지
                const txt = [it.descWarn, it.desc].filter(Boolean).join(' · ');
                const dt = makeText(scene, pad + ig, by + bh + 2, txt, { size: 12, color: it.descWarn ? '#ff9a8a' : '#c9c2ae', wrap: cw, lineSpacing: 0 });
                if (dt.height > dLines * 15 + 1) fitText(dt, cw, { maxLines: dLines });
                if (it.disabled) dt.setAlpha(0.85);
                this.add(dt);
            }
            return b;
        });
        this.cols = cols;
        this.sel = -1;
        this.select(this.items.findIndex((it) => !it.disabled));
        scene.add.existing(this);
        popIn(scene, this);
    }

    // 화면 좌표가 메뉴 위인지(호버 커서 갱신 억제용)
    contains(px, py) { return px >= this.x - 8 && px <= this.x + this.w + 8 && py >= this.y - 8 && py <= this.y + this.h + 8; }

    // 키보드/호버 선택: 선택 항목 하이라이트 + 커서 화살표
    select(i) {
        if (i < 0 || i === this.sel) return;
        this.sel = i;
        this.btns.forEach((b, j) => { if (j !== i && b.hovered) b.hover(false); });
        if (!this.btns[i].hovered) this.btns[i].hover(true);
    }

    move(d) {
        const n = this.btns.length;
        for (let k = 1; k <= n; k++) {
            const j = (this.sel + d * k + n * 4) % n;
            if (!this.items[j].disabled) { this.select(j); return; }
        }
    }

    activate() {
        const b = this.btns[this.sel];
        if (b && !b.disabled) b.onClick?.();
    }
}

// 전투 예측 말풍선(대상 옆): 상성 / 예상 피해 / 반격 / 확정·취소. 예측은 참고용(판정은 서버), hit 가 null 이면 명중 표기 생략
export class ForecastBubble extends Phaser.GameObjects.Container {
    constructor(scene, { anchor, bounds, fc, onConfirm, onCancel, narrow = false, touch = false }) {
        super(scene, 0, 0);
        const bh = itemH();
        const pad = 12;
        const w = narrow ? 190 : 236;
        // 병력 = 체력 표기: 예상 피해는 병력 단계 감소(-N), 남은 병력 N/10. HP 수치는 화면에 쓰지 않는다(fc.troop: systems/combat.forecast)
        const tr = fc.troop;
        const num = makeText(scene, 0, 0, tr ? `-${tr.loss}` : '?', { size: 38, heading: true });
        const items = [new AffinityBadge(scene, { x: 0, aff: fc.aff, pair: matchupPairLine(fc.attType, fc.defType, fc.multiplier, fc.aff), wrap: w - pad * 2 }), num]; // 병종 쌍 둘째 줄(대등 포함, names.matchupPairLine)
        // 액티브 스킬 예측(위력 반영). fc.skill.iconFrame 이 있으면 줄 왼쪽 24 아이콘(글자는 그만큼 오른쪽)
        const skIco = fc.skill?.iconFrame ? skillIconImage(scene, fc.skill.iconFrame, 0, 0, 24) : null;
        const skT = fc.skill ? makeText(scene, skIco ? 28 : 0, 0, `스킬 「${fc.skill.name}」 위력 ${fc.skill.powerPct}%`, { size: 15, bold: true, color: '#FFE08A', wrap: w - pad * 2 - (skIco ? 28 : 0) }) : null;
        if (skT) items.unshift(skT);
        const ct = fc.counter?.troop;
        const counterTxt = fc.counter ? `반격 병력 -${ct?.loss ?? '?'}${ct ? ` (내 병력 ${ct.after}/10)` : ''}${fc.counter.hit != null ? ` (명중 ${fc.counter.hit}%)` : ''}` : (fc.remaining === 0 ? '격파 예상 · 반격 없음' : '반격 없음');
        items.push(makeText(scene, 0, 0, counterTxt, { size: 15, color: fc.counter ? CSS.dangerText : CSS.muted, wrap: w - pad * 2 }));
        // 방향 on 이고 후면/측면 타격이면 보너스 줄(색 + 글자 병행). 값은 서버 config 노출 전까지 시작값 상수(systems/facing.js TODO)
        if (fc.auraAtk || fc.auraDef) items.push(makeText(scene, 0, 0, `오라 공+${fc.auraAtk ?? 0}% · 적 방+${fc.auraDef ?? 0}%`, { size: 14, bold: true, color: '#f0d58c', wrap: w - pad * 2 }));
        if (fc.flank === 'back' || fc.flank === 'side') items.push(makeText(scene, 0, 0, `${FLANK_LABEL[fc.flank]} +${FLANK_PCT[fc.flank]}%`, { size: 15, bold: true, color: fc.flank === 'back' ? CSS.dangerText : CSS.accent, wrap: w - pad * 2 }));
        const inner = scene.add.container(pad, pad);
        inner.add(items);
        const endY = stack(items, 0, 4);
        if (skIco && skT) { skIco.setPosition(12, skT.y + Math.min(12, skT.height / 2)); inner.add(skIco); }
        inner.add([
            makeText(scene, num.width + 8, num.y + 4, '예상 병력 피해', { size: 13, color: CSS.muted }),
            makeText(scene, num.width + 8, num.y + 4 + num.height * 0.45, fc.hit != null ? `명중 ${fc.hit}%` : (tr ? `남은 병력 ${tr.after}/10` : ''), { size: 16, heading: true, color: CSS.accent }),
        ]);
        const h = pad * 2 + endY + 4 + bh;
        const pos = placeNear(anchor, w, h, bounds, touch ? ['top', 'right', 'left', 'bottom'] : undefined, touch ? Math.max(14, anchor.h * 0.3) : 10);
        this.setPosition(pos.x, pos.y);
        this.w = w;
        this.h = h;
        this.add(slice(scene, 'panel', w, h, 'panel'));
        this.add(tail(scene, pos, w, h, anchor));
        this.add(inner);
        const cw = (w - pad * 2 - 8) / 2;
        const y = pad + endY + 4;
        this.confirmBtn = new Button(scene, { x: pad, y, w: cw, h: bh, label: '확정', variant: 'primary', onClick: onConfirm, size: 18 });
        this.cancelBtn = new Button(scene, { x: pad + cw + 8, y, w: cw, h: bh, label: '취소', onClick: onCancel, size: 18 });
        this.add([this.confirmBtn, this.cancelBtn]);
        scene.add.existing(this);
        popIn(scene, this);
    }

    contains(px, py) { return px >= this.x - 8 && px <= this.x + this.w + 8 && py >= this.y - 8 && py <= this.y + this.h + 8; }
}

// 유닛 선택 시 이름·HP 간단 툴팁(유닛 위)
export class UnitTip extends Phaser.GameObjects.Container {
    constructor(scene, { anchor, bounds, unit, name: dname, extra = [] }) {
        super(scene, 0, 0);
        const name = makeText(scene, 0, 0, dname ?? unit.name, { size: 16, heading: true });
        const hp = makeText(scene, 0, 0, troopLabel(soldierCount(unit)), { size: 14, bold: true, color: CSS.allyText });
        // 추가 줄(오라 받는 효과 등): {text, color}
        const ex = extra.map((l) => makeText(scene, 0, 0, l.text, { size: 12, bold: true, color: l.color ?? CSS.muted, wrap: 260 }));
        const w = Math.max(96, name.width, hp.width, ...ex.map((t) => t.width)) + 28;
        const h = name.height + hp.height + 22 + ex.reduce((p, t) => p + t.height + 2, 0);
        name.setPosition(w / 2 - name.width / 2, 9);
        hp.setPosition(w / 2 - hp.width / 2, 11 + name.height);
        let ey = 13 + name.height + hp.height;
        ex.forEach((t) => { t.setPosition(14, ey); ey += t.height + 2; });
        const pos = placeNear(anchor, w, h, bounds, ['top', 'bottom', 'right', 'left'], 6);
        this.setPosition(pos.x, pos.y);
        this.tw = w; this.th = h; // 커서 툴팁 배치용(Battle.updateHoverTip)
        this.add([slice(scene, 'panel', w, h, 'panel'), name, hp, ...ex]); // 입력 없음(클릭은 아래 맵으로 그대로 전달)
        scene.add.existing(this);
        popIn(scene, this);
    }

    contains() { return false; }
}
keepW(ContextMenu); // setPosition 후 this.w 보존(Phaser 4)
keepW(ForecastBubble); // setPosition 후 this.w 보존(Phaser 4)
keepW(UnitTip); // setPosition 후 this.w 보존(Phaser 4)
