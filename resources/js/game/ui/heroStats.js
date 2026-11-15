// 영웅 카드용 공격·방어 한 줄(편성 탭 카드, 2026-11-15). 체력은 전원 고정 10(hp_bonus)이라 표시하지 않는다(사용자 결정 2026-11-04).
// 값 출처 = 영웅 상세 '능력치'(ui/HeroDetailView)와 같음:
//   기본 = /api/heroes level_info.stats_now.atk|def (서버 ArmyBuilder::scale(병종 기본 + 영웅 보너스, 성장%, 현재 레벨), 장비 제외)
//   서버 값이 없으면 detail.stats(Lv.1 값 = 병종 기본 + 영웅 보너스)에 같은 식 round(base x (1 + 성장% / 100 x (Lv - 1)))
//   장비 = equip_total.atk|def(서버 클램프 후 적용값, 고정 가산). 카드 숫자 = 기본 + 장비, 장비가 있으면 숫자를 금색으로(상세의 '(+N) 금색 = 장비'와 같은 뜻)
import { makeText } from './common.js';
import { statIcon } from './GameIcons.js';
import { CSS } from '../theme.js';

export function heroStatsNow(h) {
    const sn = h?.level_info?.stats_now; const st = h?.detail?.stats; const eq = h?.equip_total;
    const lv = Math.max(1, Number(h?.level) || 1);
    const pick = (k, gk) => {
        const now = Number(sn?.[k]);
        if (sn?.[k] != null && Number.isFinite(now)) return now;
        const b = Number(st?.[k]);
        if (st?.[k] == null || !Number.isFinite(b)) return null;
        const g = Number(st?.[gk]);
        return st?.[gk] != null && Number.isFinite(g) ? Math.round(b * (1 + (g / 100) * (lv - 1))) : b;
    };
    const atk = pick('atk', 'growth_atk_pct'); const def = pick('def', 'growth_def_pct');
    if (atk == null || def == null) return null;
    return { atk, def, eqAtk: Math.max(0, Number(eq?.atk) || 0), eqDef: Math.max(0, Number(eq?.def) || 0) };
}

// 공·방 한 줄: [공격 아이콘] 공 N  [방어 아이콘] 방 N. (x, y) = 기준점(align 'center' 가운데 / 'left' 왼쪽 끝 / 'right' 오른쪽 끝, 세로 가운데).
// 글자 라벨('공'/'방')은 maxW 안에 들어갈 때만(좁은 카드는 아이콘 + 숫자), 그래도 넘치면 축소. 값이 없으면 null. 반환 컨테이너 .w = 실제 표시 폭
export function heroStatLine(scene, stats, x, y, maxW, { size = 12, align = 'center' } = {}) {
    if (!stats) return null;
    const ic = size + 2; const pad = 3; const gap = Math.max(6, Math.round(size * 0.6));
    const parts = [['atk', '공', stats.atk + stats.eqAtk, stats.eqAtk > 0], ['def', '방', stats.def + stats.eqDef, stats.eqDef > 0]];
    const build = (labels) => {
        const c = scene.add.container(x, y);
        let cx = 0;
        parts.forEach(([k, lb, v, eqOn], i) => {
            if (i) cx += gap;
            c.add(statIcon(scene, k, cx + ic / 2, 0, ic));
            cx += ic + pad;
            if (labels) { const l = makeText(scene, cx, 0, lb, { size: size - 1, color: CSS.muted, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }); c.add(l); cx += l.width + 2; }
            const t = makeText(scene, cx, 0, String(v), { size, bold: true, color: eqOn ? '#f0d58c' : CSS.text, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } });
            c.add(t);
            cx += t.width;
        });
        c.cx = cx;
        return c;
    };
    let c = build(true);
    if (maxW > 0 && c.cx > maxW) { c.destroy(); c = build(false); }
    const cx = c.cx;
    const s = maxW > 0 && cx > maxW ? maxW / cx : 1;
    c.list.forEach((o) => { o.x -= align === 'center' ? cx / 2 : align === 'right' ? cx : 0; });
    if (s < 1) c.setScale(s);
    c.w = cx * s;
    return c;
}
