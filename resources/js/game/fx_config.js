// 연출 튜닝 단일 설정. 모든 수치는 시작값이며 여기만 고치면 된다.
// 연출은 판정을 바꾸지 않는다(이벤트 큐로 순차 재생, 탭으로 스킵 시 최종 상태로 스냅).
export const FX = {
    scaleLevels: [1.0, 0.5, 0], // fxLevel 0 풀 / 1 축약 / 2 끄기
    levelLabels: ['풀', '축약', '끄기'],
    speeds: [1, 2, 4],
    repeatDecay: [1, 0.7, 0.7, 0.5], // 같은 연출 키 1회차 / 2~3회차 / 4회차~ (턴 시작 시 리셋)
    limits: { particles: 150, effects: 6 },

    popup: {
        sameTileGapMs: 100,
        stackPx: 24, // 같은 타일 팝업 수직 최소 간격
        rise: 40,
        ms: 600,
        normal: { size: 24, color: '#FFFFFF', prefix: '' },
        adv: { size: 32, color: '#FF9A3C', prefix: '▲', scale: [0.6, 1.3, 1] },
        dis: { size: 20, color: '#9FB0C4', prefix: '▼' },
        crit: { size: 40, color: '#FFE14A', prefix: '', strokeColor: '#5A3A00', strokeWidth: 6, shakeX: 12 },
        heal: { size: 24, color: '#6BD67A', prefix: '+' },
        miss: { size: 22, color: '#A9B1C0', prefix: '' },
        // 방향(facing) 피격: 색 + 라벨 병행(접근성). 후면=빨강 크게, 측면=주황. 라벨은 숫자 위에 쌓인다
        back: { size: 36, color: '#FF5A5A', prefix: '', scale: [0.6, 1.3, 1], shakeX: 8 },
        side: { size: 28, color: '#FFB347', prefix: '' },
        flankLabel: { size: 18, color: '#FFFFFF', prefix: '', strokeColor: '#7A1F1F', strokeWidth: 4 },
    },
    hitStop: { normal: 3, crit: 5, kill: 8, frameMs: 16.7 }, // 공격자·피격자만(전체 큐 대기)
    shake: { normal: 2, adv: 3, crit: 5, kill: 7, max: 12, msMin: 120, msMax: 250 }, // 월드만, UI 제외
    lunge: { windupPx: 3, windupMs: 80, chargeTile: 0.45, chargeMs: 100, returnMs: 150 }, // 예비동작 2~3px 0.08s / 돌진 타일 40~50% 0.10s / 복귀 0.15s
    move: { msPerTile: 90, squash: 0.12 },
    // 이동 병렬 재생(2026-11-03): 큐에 연달아 들어온 '서로 다른 유닛' 이동(턴 종료 자동 추종·NPC·적 이동만 이어질 때)을 최대 max 기 동시 재생.
    // 도착 칸이 겹치거나 같은 유닛이 다시 나오거나 공격 등 다른 연출이 끼면 그 앞에서 끊는다(순서 유지). batchMs = 한 묶음 상한, runMs = 연달은 묶음 합계 상한(1배속 기준 ms, 배속으로 나뉨).
    // 끄기: 콘솔 settings.set({ parallelMoves: false }) -> 기존 순차 재생
    parallel: { max: 6, batchMs: 1200, runMs: 2000, minBatchMs: 300, gapResetMs: 400 },
    banner: { ms: 700, msLater: 450, endMs: 450, h: 110, ribbonH: 150 }, // 턴 배너: 'TURN n' 큰 리본 + PLAYER/ENEMY PHASE
    // (구) 필살기 컷인 값. 2026-11-10 부터 스킬 컷인 길이·배치는 fx/skillCutinLayout.js CUTIN 이 담당(여기 값은 참조되지 않음)
    cutin: { ms: 1100, msRepeat: 600, lines: 14, portraitH: 420, nameSize: 56 },
    // 정산: 경험치 바 채우기 시간, 레벨업 칩 팝, 코스트 상승 칩
    result: { expMs: 900, chipMs: 220, rowGapMs: 150 },
    heal: { ms: 500 },
    kill: { whiteMs: 16, dissolveMs: 350, shards: 12, shardSize: 6, shardSpread: 46 },
    // 전체 화면 플래시는 사용하지 않는다. 필요 시 알파 0.4 이하·100ms 이하·초당 3회 미만·순백 금지.
    flash: { maxAlpha: 0.4, maxMs: 100 },
};

// 이펙트 텍스처 규격: 키 -> 생성 함수(textures.js) 또는 후속 PNG(경로 public/fx/<key>.png)로 교체
export const FX_TEXTURES = { shard: 'fx_shard' };
