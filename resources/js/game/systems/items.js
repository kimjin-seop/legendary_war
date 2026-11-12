// 전투 소모품(docs/BATTLE_ITEMS_SPEC.md 7절, database/data/battle_items.json) 표시 공용: 효과 문구. 수치는 서버(GET /api/shop/items) 값만 쓴다
// 상점 목록과 전투 행동 메뉴(소모품 목록)가 같은 함수를 쓴다.
// 지원 형식: heal = heal_flat(고정 병력) | heal_pct(최대 병력 %) / buff = stat+amount(%)+duration(턴) 또는 atk_pct·def_pct·move(+turns) / cleanse = 상태이상 해제.
// 알 수 없는 필드·종류는 수치 없이 종류 이름만(예 '회복', '강화'), 그것도 없으면 빈 문자열
const STAT_KO = { atk: '공격', def: '방어', move: '이동', counter: '반격' };
const num = (v) => (v != null && v !== '' && Number.isFinite(Number(v)) ? Number(v) : null);
const turnsOf = (it) => num(it.duration) ?? num(it.turns);
export function itemEffectText(it) {
    if (!it) return '';
    const parts = [];
    const flat = num(it.heal_flat); const pct = num(it.heal_pct);
    if (flat != null) parts.push(`병력 +${flat} 회복`);
    if (pct != null) parts.push(`병력 ${pct}% 회복`);
    const t = turnsOf(it); const tt = t ? ` ${t}턴` : '';
    const amt = num(it.amount);
    if (it.stat && amt != null) parts.push(`${STAT_KO[it.stat] ?? '능력'} +${amt}%${tt}`);
    [['atk_pct', 'atk'], ['def_pct', 'def']].forEach(([k, st]) => { const v = num(it[k]); if (v != null) parts.push(`${STAT_KO[st]} +${v}%${tt}`); });
    { const v = num(it.move ?? it.move_bonus); if (v != null && it.kind === 'buff') parts.push(`이동 +${v}${tt}`); }
    if (parts.length) return parts.join(' · ');
    return { heal: '병력 회복', buff: '능력 강화', cleanse: '상태이상 해제' }[it.kind] ?? '';
}
// 아이콘 키 슬롯(안아트 교체 예정): atlas 프레임 ico.item.<code>(예 ico.item.potion_s). 없으면 ui/ItemIcon.js 코드 폴백
export const itemIconFrame = (code) => `ico.item.${code}`;
