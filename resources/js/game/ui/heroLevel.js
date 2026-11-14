// 영웅 레벨 표시 공용(레벨 곡선 v2·등급 격차 v1, 2026-11-14): 등급별 만렙(서버 /api/heroes level_info.max_level: S24/A20/B18/C16),
// 만렙 도달 시 exp_to_next=0, 4번째 부대 해금 레벨(/api/rules·/api/profile rules.troop_slots_by_rarity: S22/A18/B16/C14).
// 수치는 전부 서버 값만 쓴다(하드코딩 없음). 서버 값이 없으면 null -> 호출부는 이전 표기('Lv.N')로 폴백.
import { session } from '../api/client.js';
import { publicRules } from '../api/gameApi.js';
import { normRarity } from '../rarity.js';

// 등급별 만렙: 영웅 자신의 level_info -> 같은 user_hero_id 의 영웅 목록(세션 캐시) 순
export function heroMaxLevel(h) {
    const own = Number(h?.level_info?.max_level ?? h?.max_level);
    if (Number.isFinite(own) && own > 0) return own;
    const id = h?.user_hero_id ?? h?.id;
    const hit = id != null && Array.isArray(session.heroes) ? session.heroes.find((x) => (x.user_hero_id ?? x.id) === id) : null;
    const v = Number(hit?.level_info?.max_level);
    return Number.isFinite(v) && v > 0 ? v : null;
}

export const isMaxLevel = (h) => { const m = heroMaxLevel(h); return m != null && Number(h?.level) >= m; };

// 레벨 문구. long: 'Lv.N / 만렙 M' (만렙이면 'Lv.M (만렙)'), short(카드·칩): 'Lv.N/M' (만렙이면 'Lv.M 만렙')
export function heroLevelText(h, { short = false } = {}) {
    const lv = h?.level ?? '-';
    const m = heroMaxLevel(h);
    if (m == null) return `Lv.${lv}`;
    if (Number(lv) >= m) return short ? `Lv.${lv} 만렙` : `Lv.${lv} (만렙)`;
    return short ? `Lv.${lv}/${m}` : `Lv.${lv} / 만렙 ${m}`;
}

// 다음 레벨까지 필요 총량(만렙이면 0). 서버 level_info.exp_to_next 우선
export function heroExpToNext(h) {
    if (isMaxLevel(h)) return 0;
    const n = Number(h?.level_info?.exp_to_next ?? h?.exp_to_next);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

// 등급별 부대 해금표 [{min_level, troops}] 오름차순(서버 rules.troop_slots_by_rarity[등급], 없으면 rules.troop_slots)
export function troopSlotsFor(rarity) {
    const r = publicRules();
    const rows = r?.troop_slots_by_rarity?.[normRarity(rarity)] ?? r?.troop_slots;
    return Array.isArray(rows) ? [...rows].filter((s) => Number.isFinite(Number(s?.min_level))).sort((a, b) => a.min_level - b.min_level) : null;
}

// 현재 레벨의 부대 수 + 다음 해금 {troops, next:{level, troops}|null}. 규칙표가 없으면 null
export function troopSlotInfo(h) {
    const rows = troopSlotsFor(h?.rarity);
    if (!rows?.length) return null;
    const lv = Number(h?.level) || 1;
    let cur = rows[0]; let next = null;
    rows.forEach((s) => { if (lv >= s.min_level) cur = s; else if (!next) next = s; });
    return { troops: Number(cur.troops) || 0, next: next ? { level: Number(next.min_level), troops: Number(next.troops) } : null, max: Math.max(...rows.map((s) => Number(s.troops) || 0)) };
}

// 만렙 능력치 예측(서버 미제공 -> 서버 ArmyBuilder::scale 과 같은 식): round((기본+보너스) x (1 + 성장% / 100 x (만렙 - 1))). 장비 제외.
// st = detail.stats(atk/def = 병종 기본 + 영웅 보너스 = Lv.1 값, growth_*_pct). 값이 모자라면 null
export function heroMaxStats(h) {
    const st = h?.detail?.stats; const m = heroMaxLevel(h);
    if (!st || m == null) return null;
    const f = (base, g) => (Number.isFinite(Number(base)) && Number.isFinite(Number(g)) ? Math.round(Number(base) * (1 + (Number(g) / 100) * Math.max(0, m - 1))) : null);
    const atk = f(st.atk, st.growth_atk_pct); const def = f(st.def, st.growth_def_pct);
    return atk == null || def == null ? null : { atk, def, level: m };
}
