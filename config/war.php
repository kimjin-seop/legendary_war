<?php

// 시즌 전쟁 설정값(수직 슬라이스). 수치는 가정 시작값이며 임밸런 시뮬 검토 후 조정한다.
return [
    'occupation_gain' => 20,            // 공격 승리 시 점령도 증가
    'occupation_required' => 100,       // 소유권 이전에 필요한 점령도
    'daily_attack_limit' => 3,          // 플레이어당 하루 공격 횟수(KST 05:00 경계, Support\Period)
    'cooldown_minutes' => 30,           // 같은 영토 재공격 쿨다운(플레이어 단위)
    'max_member_gap' => 3,              // 국가 간 정원 차 한도: 가입 전 (대상국 - 최소국) 인원이 이 값 이상이면 대상국 가입 거부
    'allow_guests' => false,            // 게스트 시즌 참가 허용(설계서 Q16 권장: 회원만)
    'transfer_transaction' => true,     // 점령도 반영·소유권 이전을 하나의 DB 트랜잭션으로 처리(실패 시 전체 롤백)
    'siege_stale_hours' => 48,          // 마지막 전투 후 이 시간이 지난 공성은 타국도 공격 가능(점령도 감소 배치 전 임시 잠금 해제)
    'max_turns' => 30,                  // 시즌 전투 턴 상한(턴 상한 도달 = 방어 승, 점령도 변화 0)
    'defender' => [
        'level_per_defense' => 3,       // 방어 AI 영웅 레벨 = defense_level x 이 값(영토 방어 난이도 고정)
    ],
    'points' => [
        'attack_win' => 10,             // 공격 승리 개인 기여도
        'capture_bonus' => 30,          // 점령 완료 개인 기여도 보너스
        'capture_score' => 50,          // 점령 국가 점수
        'capital_bonus_score' => 100,   // 수도 점령 추가 국가 점수
    ],
    'stagnation' => [                   // war:tick 정체 처리(점령도 감소는 사람 전투가 없을 때만)
        'hours' => 48,                  // 마지막 전투 후 이 시간이 지나면 감소 시작
        'daily_decay' => 10,            // 이후 24시간마다 점령도 감소량(0이 되면 공성 종료)
        'daily_decrease_cap' => 20,     // 영토당 하루 점령도 감소 상한(오프라인 방어 상한)
        'auto_defense_daily' => 3,      // 영토당 하루 자동 방어(정체 감소) 처리 횟수 상한
    ],
    'ai' => [                           // war:tick AI 국가 행동(사람 기여 보호 규칙은 DECISIONS 개정 참고)
        'max_battles_per_tick' => 3,    // 1회 실행당 AI 전투 상한(Simulator::run 비용 제한)
        'human_ratio_pct' => 50,        // 사람 구성원이 있는 국가: 하루 AI 공격 <= 그 국가 사람 공격 수의 50%
        'no_human_daily_cap' => 3,      // 사람 없는 국가: 하루 최대 AI 공격
        'territory_daily_cap' => 1,     // 영토당 하루 AI 공격 상한
        'human_guard_hours' => 12,      // 최근 이 시간 내 같은 편 사람이 공격한 영토에는 AI 공격 금지
        'last_win_guard_occupation' => 80, // 점령도가 이 값 이상이면 사람 있는 국가의 AI는 마지막 승(점령 완료) 불가
        'grace_hours' => 24,            // 시즌(새 시즌) 시작 후 이 시간 동안 AI 공격 유예(사람 가입자가 1명 이상이면 즉시 해제)
        'score_pct' => 50,              // AI 점령 국가 점수 비율(개인 기여도는 미포함)
        'attacker_level' => 6,          // AI 공격 부대 영웅 레벨(고정)
    ],
    'season' => [
        'auto_next' => true,            // 시즌 종료 시 새 시즌 자동 생성(소유권·점령도는 새 시즌에서 초기 상태로 시작)
    ],
    'list_limit' => 30,                 // 피드/순위 목록 기본 개수
];
