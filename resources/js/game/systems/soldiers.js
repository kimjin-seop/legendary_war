// 병사 수 / 영웅 HP 10단계 계산 단일 지점. 정보 바·초상화 카드·컷신 숫자와 군집·맵 배지가 모두 이 값을 쓴다.
// 규칙(서버 soldiers 필드 도입 전 FE 규칙): ceil(hp / max_hp x 10), hp > 0 이면 최소 1, 최대 10. 예) 71/100 -> 8명, 80/100 -> 8명, 1/100 -> 1명.
// 서버가 유닛에 soldiers 를 주면(현재 hp 기준일 때) 그 값을 우선한다.
export const MAX_SOLDIERS = 10;

export function stepsOf(hp, max) {
    if (!max) return MAX_SOLDIERS;
    if (hp <= 0) return 0;
    return Math.min(MAX_SOLDIERS, Math.max(1, Math.ceil((hp / max) * MAX_SOLDIERS - 1e-9)));
}

export function soldierCount(u, hp = u?.hp) {
    if (!u) return 0;
    if (u.soldiers != null && hp === u.hp) return Math.max(0, Math.min(MAX_SOLDIERS, u.soldiers));
    return stepsOf(hp, u.max_hp ?? u.maxHp ?? 0);
}

// ---- 병력 = 체력 표시 통합(표시만, 엔진 HP 체계는 그대로) ----
// 화면의 '체력' 표기는 모두 병력 N/10 으로 통일한다(HP 수치는 서버 응답에만 남고 화면에 쓰지 않음). 영웅·부대 공통 규칙(stepsOf).
export const TROOP_DANGER = 3; // 이하(1~3)면 위험 경고(색 + 경고 삼각형)
export const troopLabel = (n) => `병력 ${n}/${MAX_SOLDIERS}`;
// HP 변화 -> 병력 단계 변화(after - before). 피해면 음수, 회복이면 양수. 서버 hp 값을 그대로 넣는다(서버 결과 우선)
export function troopDelta(u, hpBefore, hpAfter) {
    const max = u?.max_hp ?? u?.maxHp ?? 0;
    return stepsOf(hpAfter, max) - stepsOf(hpBefore, max);
}
