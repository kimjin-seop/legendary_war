// 기능 켜기/끄기 단일 출처(2026-11-14 사용자 지시 "시즌전쟁이랑 랭크전은 일단 비활성화 처리하고 기대감을 모을 내용으로 보여주자").
//  false = 로비 진입점은 보이되 '오픈 예정' 배지 + 티저 화면(scenes/lobbyComingSoon.js)만 연다. 기존 코드(War 씬·lobbyRank·API)는 그대로 둔다.
//  다시 열 때는 여기 값만 true 로 바꾼다.
//   seasonWar    = 멀티 > 시즌 전쟁(War 씬 오버레이, 멀티 진입 시 진행 중 시즌 우선 분기, 전황 읽지 않음 뱃지 폴링)
//   rankedBattle = 멀티 > 랭크전(scenes/lobbyRank.js, 매칭 큐). '랭킹'(레벨·주간 PvP 순위) 탭은 해당 없음
export const FEATURES = {
    seasonWar: false,
    rankedBattle: false,
};

// 로비 탭 키 -> 잠긴 기능이면 티저 종류('war' | 'rank'), 열린 기능이면 null
export function comingSoonOf(tabKey) {
    if (tabKey === 'war' && !FEATURES.seasonWar) return 'war';
    if (tabKey === 'rank' && !FEATURES.rankedBattle) return 'rank';
    return null;
}
