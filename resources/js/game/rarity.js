// 영웅 등급 단일 출처: S > A > B > C. 서버 rarity 는 S/A/B/C 이며, 구 값(SSR/SR/R/N)은 정규화한다(SSR->S, SR->A, R->B, N->C).
// 색만으로 구분하지 않도록 사용처는 글자(S/A/B/C)와 별 병기를 함께 쓴다.
export const RARITIES = ['S', 'A', 'B', 'C'];
export const RARITY_LEGACY = { SSR: 'S', SR: 'A', R: 'B', N: 'C' };
export const RARITY_COLOR = { C: 0x8b97a8, B: 0x2fb5a6, A: 0xb06ad8, S: 0xf0b23c }; // C 회청, B 청록, A 보라, S 금색
export const RARITY_ORDER = { S: 0, A: 1, B: 2, C: 3 }; // 작을수록 우선(정렬)
export const RARITY_STARS = { S: 4, A: 3, B: 2, C: 1 };

export const normRarity = (r) => {
    const k = String(r ?? '').toUpperCase();
    return RARITIES.includes(k) ? k : (RARITY_LEGACY[k] ?? 'C');
};
export const rarityLabel = (r) => `${normRarity(r)}등급`;
export const rarityColor = (r) => RARITY_COLOR[normRarity(r)];
export const rarityCss = (r) => '#' + rarityColor(r).toString(16).padStart(6, '0');
export const raritySlotKey = (r) => `slot_${normRarity(r)}`;
export const rarityBadge = (r) => `${normRarity(r)} ${'★'.repeat(RARITY_STARS[normRarity(r)])}`; // 글자 + 별 병기
export const compareRarity = (a, b) => RARITY_ORDER[normRarity(a)] - RARITY_ORDER[normRarity(b)];
