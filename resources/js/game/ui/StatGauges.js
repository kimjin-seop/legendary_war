import { COLOR, CSS } from '../theme.js';
import { makeText } from './common.js';
import { STAT_CAP, SEG_CAP } from './PortraitCard.js';
import { statIcon } from './GameIcons.js';

// 능력치 '라벨 + 게이지 + 숫자' 행 묶음(영웅 상세 등). 이미지 없이 Graphics 로만 그린다.
// rows: [{ key?, label, base, bonus?, cap?, color? }] — 게이지 = (base + bonus) / cap (넘치면 가득), 기본분 = 항목 색, 장비 보너스분 = 금색으로 이어 그림.
// 숫자 = 'base' (+bonus 가 있으면 ' (+bonus)' 금색, 기존 '괄호 = 장비 적용값' 표기 유지). 반환 컨테이너: 좌상단 원점, .h = 전체 높이
//
// 게이지 상한(표시용 기준값, 같은 항목은 화면 간 같은 기준):
//   공격 atk  92 — STAT_CAP.at(2026-11-14 재산정: S 만렙 최대 공격 83 + 장비), 전투 카드·컷신과 같음
//   방어 def  54 — STAT_CAP.df(S 만렙 최대 방어 38 + 장비 40%)
//   이동 move  8 — SEG_CAP.move(기병·비행 기본 8)
//   사거리 range 3 — SEG_CAP.range
//   마력 mp   160 — 기본안(MP 방식 2026-11-04, 영웅 상세 stats.mp_max Lv1 기준). 임밸런 수치 확정 시 교체
export const STAT_GAUGE_CAP = { mp: 160, atk: STAT_CAP.at, def: STAT_CAP.df, move: SEG_CAP.move, range: SEG_CAP.range };
export const STAT_GAUGE_COLOR = { mp: 0x4a9be8, atk: 0xe0663c, def: 0x4a9be8, move: 0x9a7be0, range: 0x48b8c8 };
const BONUS_COLOR = 0xf0d58c; // 장비 보너스분(금색)
const fmt = (n) => Number(n ?? 0).toLocaleString('ko-KR');

export function statGauges(scene, { w, rows, size = 14, rowH = 30, barH = 10, icons = true }) { // icons: 라벨 앞 능력치 아이콘(ico.stat.<key>, 없으면 색 원)
    const c = scene.add.container(0, 0);
    const list = (rows ?? []).filter(Boolean);
    // 라벨·숫자 열 폭: 실제 글자 폭(가장 긴 것) 기준. 좁은 칸이면 게이지 최소 48 을 남기고 숫자 쪽을 우선
    const labels = list.map((r) => makeText(scene, 0, 0, r.label, { size, color: CSS.muted, origin: [0, 0.5] }));
    const nums = list.map((r) => {
        const b = Number(r.bonus) || 0;
        const t = makeText(scene, 0, 0, r.text ?? fmt(r.base), { size, bold: true, origin: [1, 0.5] });
        const bt = b ? makeText(scene, 0, 0, `(${b > 0 ? '+' : ''}${fmt(b)})`, { size: size - 1, bold: true, color: '#f0d58c', origin: [1, 0.5] }) : null;
        return { t, bt, w: t.width + (bt ? bt.width + 4 : 0) };
    });
    const icS = icons ? 16 : 0; const icW = icons ? icS + 6 : 0; // 도트 아이콘 16 = 32 원본의 1/2(정수 비율)
    const labelW = icW + Math.ceil(Math.max(28, ...labels.map((t) => t.width))) + 10;
    const numW = Math.ceil(Math.max(30, ...nums.map((n) => n.w))) + 8;
    const barW = Math.max(48, w - labelW - numW);
    const g = scene.add.graphics();
    c.add(g);
    list.forEach((r, i) => {
        const cy = i * rowH + rowH / 2;
        if (icons && r.key) c.add(statIcon(scene, r.key, icS / 2, cy, icS));
        labels[i].setPosition(icW, cy); c.add(labels[i]);
        const cap = Number(r.cap ?? STAT_GAUGE_CAP[r.key]) || 1;
        const base = Math.max(0, Number(r.base) || 0); const bonus = Math.max(0, Number(r.bonus) || 0);
        const x0 = labelW; const y0 = Math.round(cy - barH / 2);
        const bw = Math.round(barW * Math.min(1, base / cap));
        const xw = Math.round(barW * Math.min(1, (base + bonus) / cap)) - bw; // 보너스분(상한 넘치면 남은 칸만)
        g.fillStyle(0x07101f, 1).fillRoundedRect(x0, y0, barW, barH, 3); // 트랙
        if (bw > 0) g.fillStyle(r.color ?? STAT_GAUGE_COLOR[r.key] ?? COLOR.accent, 1).fillRect(x0 + 1, y0 + 1, Math.max(0, bw - 1), barH - 2);
        if (xw > 0) g.fillStyle(BONUS_COLOR, 1).fillRect(x0 + bw, y0 + 1, Math.max(0, Math.min(xw, barW - bw - 1)), barH - 2);
        g.lineStyle(1, COLOR.accent, 0.45).strokeRoundedRect(x0, y0, barW, barH, 3);
        const nx = labelW + barW + numW; const n = nums[i];
        if (n.bt) { n.bt.setPosition(nx, cy); n.t.setPosition(nx - n.bt.width - 4, cy); c.add([n.t, n.bt]); } else { n.t.setPosition(nx, cy); c.add(n.t); }
    });
    c.h = list.length * rowH; c.w = w;
    return c;
}
