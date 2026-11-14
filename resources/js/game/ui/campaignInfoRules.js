// 캠페인 정보 UI(챕터 상세 정보 줄·목록 카드) 판정 규칙. 순수 함수(Phaser 의존 없음, node 로 확인 가능)

// 난이도 단계(서버 difficulty 1~6): 1~2 쉬움(녹) / 3 보통(청) / 4~5 어려움(주황) / 6 이상 극악(적)
export function diffTier(d) {
    const n = Number(d) || 0;
    if (n <= 2) return { key: 'easy', label: '쉬움', color: 0x5cc46a, css: '#8ee39a' };
    if (n <= 3) return { key: 'normal', label: '보통', color: 0x4a9ae0, css: '#94c8ff' };
    if (n <= 5) return { key: 'hard', label: '어려움', color: 0xe8963a, css: '#ffbe7a' };
    return { key: 'hell', label: '극악', color: 0xe0483a, css: '#ff8f80' };
}

// 내 영웅 기준 레벨 = 레벨 높은 순 상위 n명 평균(반올림). 보유 영웅이 없거나 레벨 정보가 없으면 null.
//  n = 3: 권장 레벨 측정(game:simulate)의 파티 상한 3명과 맞춤(2026-11-14, 이전 5). 계정 레벨이 아니라 영웅 레벨 기준
export function myHeroLevel(heroes, n = 3) {
    const lv = (Array.isArray(heroes) ? heroes : []).map((h) => Number(h?.level)).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => b - a).slice(0, n);
    return lv.length ? Math.round(lv.reduce((s, x) => s + x, 0) / lv.length) : null;
}

// 편성(라인업) 기준 비교(2026-11-14): 편성 영웅 레벨 상위 party 명의 합·평균. 편성이 없으면 null(호출 측 = myHeroLevel 폴백)
export function lineupLevel(lineup, party = 3) {
    const lv = (Array.isArray(lineup) ? lineup : []).map((h) => Number(h?.level)).filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => b - a);
    if (!lv.length) return null;
    const n = Math.max(1, Number(party) || 3); const top = lv.slice(0, n);
    const total = top.reduce((s, x) => s + x, 0);
    return { avg: Math.round(total / top.length), total, count: top.length, party: n };
}

// 권장 레벨 대비 상태: ok(충분, 녹) / near(2 이하 부족, 주황) / low(부족, 적) / unknown(비교 불가, 금색)
export function levelState(rec, my) {
    const r = Number(rec);
    if (!Number.isFinite(r) || r <= 0 || my == null || !Number.isFinite(Number(my))) return { key: 'unknown', color: 0xc9a24b, css: '#f0d58c', hint: '' };
    const m = Number(my);
    if (m >= r) return { key: 'ok', color: 0x5cc46a, css: '#8ee39a', hint: `영웅 Lv.${m}` };
    if (m >= r - 2) return { key: 'near', color: 0xe8963a, css: '#ffbe7a', hint: `영웅 Lv.${m}` };
    return { key: 'low', color: 0xe0483a, css: '#ff8f80', hint: `영웅 Lv.${m}` };
}

// 캠페인 카드 상태: hidden(숨은 종장 잠김) / preview(준비 중) / locked / done(전 스테이지 클리어) / progress(일부 클리어) / new(미시작)
export function campaignState(c) {
    if (!c) return 'locked';
    if (c.hiddenLocked) return 'hidden';
    if (c.preview) return 'preview';
    if (!c.unlocked) return 'locked';
    if (c.total > 0 && c.cleared >= c.total) return 'done';
    if (c.cleared > 0) return 'progress';
    return 'new';
}
