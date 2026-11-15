<?php

// 게임 설정 기본값. 모든 수치는 '시작값'이며 밸런싱 대상이다.
return [
    'max_turns' => 30,
    'first_side' => 'a',                 // 선공(a = 유저)
    'max_party_slots' => 3,              // 출격 영웅 상한
    'max_level' => 24,                   // 영웅 레벨 전체 상한(= 등급별 cap 중 최댓값). 실제 cap 은 hero_max_level_by_grade (레벨 곡선 v2, 2026-11-14). 유저 만렙 50 은 user_level_costs 행 수로 결정(재시드 시 반영)
    'hero_max_level_by_grade' => ['S' => 24, 'A' => 20, 'B' => 18, 'C' => 16],   // 영웅 등급별 만렙(LevelRewards::maxLevel). 알 수 없는 등급=max_level. hero_levels 는 Lv1~23 행(exp_to_next)이면 충분
    'troop_growth_pct' => 3.0,           // 부대 유닛 레벨당 상승률(%)
    'exp_lose_ratio' => 0.3,             // 패배 시 exp 지급 비율
    'gold_lose_ratio' => 0.0,            // 패배 시 gold 지급 비율
    'starter_hero_rarity' => 'C',   // 신규 계정 시작 영웅 등급(2026-11-14: 고정 이순신·곽재우 -> C급 무작위). 기존 계정은 건드리지 않는다
    'starter_hero_count' => 1,      // C급 무작위 지급 수. 추가로 캠페인 키 영웅(S급) 1명(2026-11-14 지시: 이순신 고정 + C 1)
    'starter_gold' => 500,
    // 성장 보상 배율(묶음 C). 기본값은 현행과 동일(1.0·상한 없음). 켜기 전 임밸런 측정 필수. 권장 시작값: star_mult 1.0/1.1/1.2, retry_mult 0.5, low_level_mult 0.2, bench_exp_pct 30
    // star_mult: 승리 별점(1~3)별 보상(영웅 exp·유저 exp·gold) 배율 / retry_mult: 이미 클리어한 스테이지 재도전 승리 배율
    // stage_daily_cap: 유저·스테이지별 일일 승리 보상 횟수 상한(0=무제한, KST 05:00 기준), 초과 시 보상 0 + reward_blocked=stage_daily_cap
    // low_level_gap/low_level_mult: 스테이지 enemy_level이 영웅 레벨보다 gap 이상 낮으면 해당 영웅 exp 배율(승리·패배 공통)
    // bench_exp_pct: 파티에 있으나 미참전인 영웅이 받는 exp 비율(%, 0=현행: 지급 없음)
    'reward_scale' => [
        // 레벨 곡선 v2 적용값(2026-11-14): retry 0.5, 스테이지별 일일 5회, 저레벨 gap5 x0.2, 벤치 30%
        'star_mult' => [1 => 1.0, 2 => 1.0, 3 => 1.0], 'retry_mult' => 0.5, 'stage_daily_cap' => 5,
        'low_level_gap' => 5, 'low_level_mult' => 0.2, 'bench_exp_pct' => 30,
    ],
    // 자유 대전(방 solo) 승리 보상: 스테이지보다 축소(스테이지 파밍 대체 방지). 패배 비율은 exp_lose_ratio 공유
    'free_reward' => ['exp' => 20, 'user_exp' => 10, 'gold' => 20],
    // 자유 대전 어뷰징 방지(시작값): 일일 보상 상한(gold+hero exp+user exp 합산, KST 05:00 기준), 최소 진행 턴, IP당 일일 게스트 생성 수
    'free_limits' => ['daily_reward_cap' => 300, 'min_turns' => 5, 'guest_per_ip_daily' => 20],
    // 시즌 전쟁 전투 보상(영웅 경험치만, 골드 0). 출전 영웅 각자에게 지급. 시작값(캠페인 초반 승리 exp 60~130의 약 30~40% / 패배 약 10%) -> 임밸런 조정
    // reward_win_exp: 승리 / reward_lose_exp: 패배·무승부 / reward_capture_bonus_exp: 점령 성공 시 승리 exp에 가산 / reward_daily_cap: 유저당 하루 보상 지급 횟수(KST 05:00 기준, 0=무제한)
    'war' => ['reward_win_exp' => 30, 'reward_lose_exp' => 6, 'reward_capture_bonus_exp' => 20, 'reward_daily_cap' => 3],
    // 유저당 진행 중(deployment/in_progress) 스테이지 전투 상한: 초과 시 가장 오래된 전투를 abandoned 처리
    'max_open_stage_battles' => 1,
    // 제한시간은 PvP 방 대전(battles.mode=pvp)에만 적용. 스테이지(캠페인·튜토리얼)와 solo 방(봇 상대)은 무제한.
    // 내 턴 전체 입력 제한시간(초, 코드 값): 턴 시작부터 이 시간 안에 모든 유닛 행동을 입력해야 함. 0=해제. 방(room.turn_limit_seconds)도 같은 값을 쓴다.
    // 마감 + turn_input_grace_seconds(네트워크 지연 유예) 후 서버가 지연 평가로 남은 유닛을 대기 처리하고 턴을 자동 종료(봇 턴 포함 진행). 그 뒤 도착한 move/attack은 409 turn_timeout, wait/end_turn은 오류 없이 무시.
    // 봇 턴 미적용. battle state의 no_turn_timer=true면 해당 전투 해제(튜토리얼용 여지)
    'turn_input_seconds' => 60,
    'turn_input_grace_seconds' => 2,
    // 방(룸) 시작값
    // turn_limit_seconds = turn_input_seconds와 같은 값(방 생성 시 rooms.turn_limit_seconds에 복사)
    // party_size: 방 대전(solo/pvp) 출전 영웅 수 = 맵 크기(S/M/L)별 고정. 근거: 맵 meta recommended_per_side S[3,4] M[4,6] L[5,6]의 하한. 유저 레벨 슬롯(2/3/4)은 방에서 쓰지 않음
    'room' => ['party_size' => ['S' => 3, 'M' => 4, 'L' => 5], 'cost_cap' => ['S' => 24, 'M' => 32, 'L' => 40], 'turn_limit_seconds' => 60, 'disconnect_seconds' => 90, 'presence_seconds' => 30, 'max_missed_turns' => 2],
    // 규칙 엔진 옵션 (시작값). 각 항목은 밸런스 측정(game:simulate --rule=key=value)으로 전후 비교한다.
    'rules' => [
        'ally_passthrough_cost' => (int) env('GAME_ALLY_PASSTHROUGH_COST', 2),   // 아군 칸 통과 비용 가산(0=끔). 새 전투 생성 시 state.frozen 에 고정
        'gunner_rules' => (bool) env('GAME_GUNNER_RULES', true),   // 총병 사선/이동 후 사격 불가(false=끔). 새 전투 생성 시 고정
        'active_skills' => true,         // 액티브 스킬(use_skill): 영웅 유닛 행동 소모, 쿨다운+전투당 횟수(game.active_skill_uses). 롤백=false
        // 액티브 스킬 MP 방식(active_skills와 별개 키). false=레거시 쿨다운/횟수(기본, FE·시뮬 검증 후 켠다). true면 새 전투부터 state.mp_mode/mp_knobs로 고정(진행 중 전투는 레거시 유지)
        // mp_max = clamp(희귀도 C40/B45/A50/S55 + 2x(level-1) + mage·healer +10, 30, 100). 영웅 1턴 스킬 1회. 비용 공식=app/Game/MpRules.php(skills.params.mp_cost 우선). 모두 가정 시작값(미측정)
        'mp_skills' => (bool) env('GAME_MP_SKILLS', true),   // 사용자 결정(2026-11-04): 모든 새 전투는 MP 방식(스테이지·랭크·방·전쟁). 진행 중 전투는 state.mp_mode 키가 없어 레거시 유지. 롤백=GAME_MP_SKILLS=false
        'mp_start_pct' => 50,            // 시작 MP = mp_max x 50%
        'mp_skip_first_regen' => true,   // 진영 단위 턴 모드: 후공 진영 1턴 시작 회복 1회 생략(선·후공 모두 시작 MP로 첫 행동). false=기존
        'mp_regen_pct' => 15,            // 진영 턴(교대 행동은 라운드) 시작 회복 = max(mp_regen_min, round(mp_max x 15%)), 상한 초과분은 버림(mp_overflow 계측)
        'mp_regen_min' => 5,
        'mp_wait_pct' => 0,              // wait 추가 회복(mp_max x %, 0=없음)
        'passive_skills' => true,        // passive 스킬: conquest_spear 공격+8%, divine_banner 방어+10%, healing_herbs 회복+8
        'heal_percent' => 0.15,          // 치유량 = max(고정 heal, 대상 max_hp x 15%)
        'heal_cap' => 30,                // 진영 턴 종료 시 총 회복 상한
        'clamp' => [0.6, 1.5],           // 공격측 총배율 = 상성 x (1 + 오라/패시브 합산) 클램프
        'min_damage_pct' => 0.15,        // 최소 피해 = max(1, 공격력 x 15%)
        'ranged_counter' => false,       // 원거리 간 반격(거리 2 대 2): 기본 off, 사용자 플레이 후 채택 결정
        'turn_limit_rule' => 'alive_then_ratio',   // 턴 상한 판정(채택): hp_sum(HP 절대 합, 구 규칙) / hp_ratio(남은HP/초기HP 비율) / alive_then_ratio(생존 수 우선, 동수면 비율). 동점=무승부
        'turn_limit_noncombatant_weight' => 1.0, // alive_then_ratio 생존 수에서 치유사(지휘관 제외) 가중치. 1.0=동일(기본), 0=무시
        'troop_cost' => false,  // 편성 코스트에 부대 병종 코스트 합산(2026-11-15 off: 출전 코스트 = 영웅 코스트 합 대 상한만. 켜면 구 규칙 복귀)
        // [규칙 전부 on 전환] 아래 5개 지형 2단계 옵션 롤백값: highground 1.0 / forest_cover 1.0 / village_heal 0.0 / def_total_cap 0
        'highground_mult' => 1.15,       // 고지 공격 배율(1.0=off). 맵 rules로 맵 단위 on/off 가능. 반격에도 적용됨
        'forest_cover_mult' => 0.9,      // 숲 원거리 엄폐 배율(1.0=off)
        'forest_cover_exclude_ranged_target' => false,
        'village_heal_pct' => 0.10,      // 마을 턴 종료 회복 비율(0=off)
        'def_total_cap' => 60,           // 방어 보정 합 상한(0=off)
        'squad' => true,   // 영웅-부대 소속/붕괴/오라 재정의(항상 on, 개발용). 전투 생성 시 state에 고정(구 전투는 off 취급)
        'squad_aura_self' => true,       // squad on: 오라원 본인도 오라 수혜(false면 소속 부대만)
        'facing' => true,               // 방향(facing) 시스템(항상 on, 개발용). 전투 생성 시 state에 기록 -> 진행 중 전투는 영향 없음
        'facing_mult' => ['side' => 1.15, 'back' => 1.30],   // 방향 배율(정면 1.0), clamp 이후 곱
        'facing_cap' => 1.8,             // 방향 배율 적용 후 총배율 상한
        'first_turn_move_cap' => 0,      // 1턴 선공 진영 유닛 이동력 상한(0=제한 없음). 선공 편향 보정 후보
        'second_atk_pct' => 0,           // 후공 진영 공격 +% (임밸런 추천: 0, 이전 2). 맵 rules(maps.rules.second_atk_pct)가 있으면 그 맵은 맵 값이 우선
        'dmg_mult' => 1.2,               // 피해 배율(임밸런 추천 x1.2, 엔진 기본 1.0, 범위 0.5~2.0). dmg = max(최소피해, round((공격-방어) x dmg_mult)), 공격·반격 공통. 맵 rules로 오버라이드 가능
        // 병력 우위 스노볼(기본 off=null). 켤 때 시작값: ['basis'=>'hp','dead'=>0.15,'slope'=>0.5,'cap'=>0.10,'hero_factor'=>1.0]. basis=units는 후공 편향이 커 비추천. 켜기 전 재측정 필수, 전투 생성 시 state에 고정
        // [on 전환] 롤백=null
        'snowball' => ['basis' => 'hp', 'dead' => 0.15, 'slope' => 0.5, 'cap' => 0.10, 'hero_factor' => 1.0],
        // 병사 미시 교전(docs/MICRO_COMBAT_SPEC.md). micro_mode: off(기본, 기존 공식)/shadow(기존 공식 확정 + 미시 결과를 attack 이벤트 micro 필드에 병행 기록)/on(미시 결과로 확정, 사용자 승인 전 금지). 전투 생성 시 state에 고정, 키 없음=off
        'micro_mode' => in_array($mm = (string) env('GAME_MICRO_MODE', 'off'), ['off', 'shadow', 'on'], true) ? $mm : 'off',   // 환경변수 GAME_MICRO_MODE=off|shadow|on (잘못된 값=off). 새 전투 생성 시에만 반영
        // 화이트리스트(쉼표 구분): GAME_MICRO_STAGES=스테이지 code 또는 id, GAME_MICRO_ROOMS=방 code. 둘 중 하나라도 있으면 목록의 스테이지·방만 micro_mode 적용(나머지 off), 둘 다 비면 전체 적용
        'micro_stages' => array_values(array_filter(array_map('trim', explode(',', (string) env('GAME_MICRO_STAGES', ''))), 'strlen')),
        'micro_rooms' => array_values(array_filter(array_map('trim', explode(',', (string) env('GAME_MICRO_ROOMS', ''))), 'strlen')),
        'micro' => [
            // 임밸런 2026-11-06 shadow 튜닝(백업: scratchpad/game.php.bak_before_micro_tuning). 시작값/재측정 대상. 롤백=3개 키 삭제(DEFAULTS 복귀: dmg_pct 60, attack_period 60, hero_hp_mult 0.9)
            // 이 값 + legacy_counter=true(사용자 결정 대기 옵션)면 승자 일치 93.9% / 방어측 편향 +3.2 (legacy_counter=false 단독은 78.1% / +4.1). 요청서 참조
            'dmg_pct' => 100,
            'attack_period' => 40,
            'hero_hp_mult' => 1.2,
            // 2026-11-06 컷신에서 병사가 접촉 못 한다는 지적: 이동 속도 상향(기본 foot 10/mounted 15/flying 12/naval 10 -> 26/39/31/26). 병사 절반이 첫 타격하는 tick 이 전체 109의 약 1/3 안. 롤백=이 키 삭제
            'speed' => ['foot' => 26, 'mounted' => 39, 'flying' => 31, 'naval' => 26],
            'cavalry_charge' => true,   // 사용자 요구: 기병 교전당 1회 직선 돌격 관통 후 복귀(재돌격 없음). 롤백=false
            'charge_hit_cap' => 3,
            'hit_and_return' => true,   // 연출 전용 복귀 데이터(rt) 출력. 결과(HP)에 영향 없음. 롤백=false
            'survivor_reset' => true,   // 2026-11-07 사용자 요구: 싸우고 살아남은 병사 개체 HP 는 교전 후 풀 HP 로 초기화(영웅 개체 제외, 쓰러진 병사만 손실). 롤백=false
            'formations_enabled' => false,   // 2026-11-07 사용자 결정: 진형 시스템 비활성(복구=true). false 면 진형 속도·cap·ranged_cap·상성·formation 이벤트 필드 전부 비적용
            'ranged_min_range' => 100,   // 2026-11-07 사용자 요구: 궁병은 근접 접촉한 적에게 반격·사격 불가(접촉 전 접근 중인 적에게만). 롤백=0
            'ranged_vs_ranged_counter' => true,   // 2026-11-07 사용자 규칙: 궁병끼리는 상호 사격(legacy_counter 는 유지: 근접↔원거리 비대칭 무반격). 롤백=false
            'ranged_hold' => true,   // 2026-11-06 사용자 요구: 원거리(궁·총)는 전개 후 제자리 사격(ranged_hold_ticks 60). 롤백=false
            'legacy_counter' => true,   // 2026-11-06 팀장 결정: 기존 승패 구조 유지(원거리 반격 규칙 현행). 승자 일치 78%→94% (임밸런 측정). 상호 반격으로 바꾸려면 false
            // 진형 3군 순환 H1(임밸런 2026-11-06, 임시값): 돌파 어린>확장 횡대>방어 방진·원진>돌파, 학익 포위. 수치 가산 없이 속도·접촉 상한·타깃만. 롤백=이 배열을 [] 로
            // 2026-11-06 원거리·기병 보정(신규 노브, 값 조정은 임밸런): ranged_cap = 진형 개체 1기에 동시 사격 가능한 원거리 적 수(null=무제한),
            // speed_pct_by_move.mounted = 기병 돌격 속도. 롤백=ranged_cap·speed_pct_by_move 키 삭제
            'formation_rules' => [
                'crane' => ['speed_pct' => 60, 'cap' => 2, 'target' => 'spread', 'ranged_cap' => 6, 'speed_pct_by_move' => ['mounted' => 90]],
                'fish' => ['speed_pct' => 60, 'cap' => 3, 'target' => 'nearest', 'ranged_cap' => 5, 'speed_pct_by_move' => ['mounted' => 100]],
                'phalanx' => ['speed_pct' => 60, 'cap' => 2, 'target' => 'nearest', 'ranged_cap' => 3, 'speed_pct_by_move' => ['mounted' => 80]],
                'line' => ['speed_pct' => 125, 'cap' => 2, 'target' => 'nearest', 'ranged_cap' => null, 'speed_pct_by_move' => ['mounted' => 125]],
                'circle' => ['speed_pct' => 70, 'cap' => 4, 'target' => 'nearest', 'ranged_cap' => 4, 'speed_pct_by_move' => ['mounted' => 90]],
            ],
        ],   // MicroCombat::DEFAULTS 덮어쓰기(tick_ms·ticks·attack_period·dmg_pct·attacker_cap·speed·hero_hp_mult·hero_dmg_mult·hero_attacker_cap·hero_incoming_pct 등, 전부 임시값)
        'micro_no_snowball' => true,   // 미시 모드에서만 교전 타격 산출의 스노볼 가산 제외(이중 가산 방지)
        // 수상(해전) 규칙(코드 값, env 없음, 임밸런 시작값 -> game:simulate 재측정 대상). 롤백=각 1.0. 맵 rules(maps.rules)로 맵 단위 오버라이드 가능
        // naval_water_atk_mult: 수병이 수상 칸(sea·reef·shallows·harbor·water)에서 공격할 때 x / boarded_atk_mult: 배 탑승(sea·reef 위 비수병 foot·mounted) 공격자 x(반격 포함) / naval_land_atk_mult: 수병이 육상에서 공격할 때 x
        'naval_water_atk_mult' => 1.35,
        'boarded_atk_mult' => 0.90,
        'naval_land_atk_mult' => 0.80,
        // 병종 v2 2단계(시작값, 재측정 대상, 롤백=mage 0 / assassin null). E1: 마법사 공격 시 대상 기본 방어 N% 무시(지형·오라 보정 유지) / E2: 암살자 측·후방 배율(일반 facing_mult 대체, facing_cap 공유)
        'mage_def_ignore_pct' => 30,
        'assassin_facing_mult' => ['side' => 1.25, 'back' => 1.5],
        'first_move_limit' => 0,         // 1턴 선공 진영 행동 유닛 수 상한(0=제한 없음). 선공 편향 보정 후보
        // 교대 행동(부대 단위 번갈아 활성화): 전투 생성 시 state.alternate에 고정. on이면 위 선공 보정 3종(first_turn_move_cap/first_move_limit/second_atk_pct)은 무시
        'alternate_activation' => false,  // [유저(진영) 단위 턴 페이즈로 원복, 코드 값 고정(env 없음)] 교대 행동 코드는 보존(재도입=true). 전투 생성 시 state.alternate에 고정(구 전투는 영향 없음)
        'alt_consecutive_cap' => 2,      // 한쪽 연속 활성화 상한(상대 부대 소진 시), 도달하면 라운드 종료·미행동 부대 행동권 소멸
        'alt_implicit_activate' => false, // FE가 명시 activate를 쓰므로 false(롤백=true: 활성 부대가 없으면 move/attack/wait가 해당 부대를 암묵 활성화)
        'alt_first_rotate' => false,     // true면 짝수 라운드는 선공/후공 교대(기본: first_side 고정)
    ],
    // 서버 봇 옵션 (commander_mode: guard=지휘관 제자리 / engage=교전, healer_ai: 치유사 전용 AI)
    // path_approach: 접근을 경로(BFS) 거리로(채택, 기본 on. off=구 맨해튼), formation_lead: n>0이면 아군 전열보다 n칸 넘게 앞서지 않음(0=off)
    'bot' => ['commander_mode' => 'guard', 'healer_ai' => true, 'path_approach' => true, 'formation_lead' => 0, 'engage_when_no_combat' => 'lead', 'engage_late_turns' => 0, 'avoid_threat' => 1.0, 'terrain_bonus' => 0, 'follow_front' => true, 'squad_leash' => 2, 'commander_guard' => true, 'commander_guard_risk' => 0.8, 'cg_low_risk' => 0.3, 'cg_escort_n' => 2, 'cg_escort_hp' => 0.7, 'cg_pct' => 12, 'enemy_aggr' => true, 'enemy_aggr_hp' => 0.4, 'cg_focus_r' => 4, 'cg_focus_bonus' => 60],
    // enemy_aggr: 적(b) 비지휘관·비치유가 HP>=enemy_aggr_hp 비율이면 위협 회피 없이 전진(맴돌기 방지, 지휘관은 신중 유지, 아군 봇 불변). cg_focus_r: 지휘관 반경 N칸 안 대상에 +cg_focus_bonus 집중 공격(0=off)
    // commander_guard: 봇 지휘관 보호(true=켜짐). 위협(다음 적 턴 예상 피해 합 >= risk x 현재 HP, HP 40% 미만이면 0 초과)이면 안전·엄호 칸으로 후퇴, 위험 칸 단독 공격 금지(처치 확정 시 예외), 호위 유닛은 지휘관 접근로를 막고 지휘관을 노리는 적을 우선 공격. 스테이지 단위 끄기: stages.rules.commander_guard=false
    // avoid_threat: f>0이면 접근 이동 시 아군 전열(중앙값)보다 앞서는 칸 중 '다음 적 턴 예상 피해 합 >= f x 현재 HP'인 칸을 피함(비행 단독 돌입 방지, 0=off)
    // engage_late_turns: 마지막 n턴 지휘관 교전(0=off)
    // engage_when_no_combat: 전투 부대(지휘관·치유사 제외)가 한쪽이라도 없으면 지휘관이 guard를 풀고 교전(true=어느 한쪽, 'own'=아군만) -- 승인 기본값 'lead'(이전 false): 어느 한쪽 전투 부대 없음 + 턴 상한 판정 앞섬/동률인 쪽만. avoid_threat 승인 1.0(이전 0)
    // 영웅-부대 편성(squad on일 때만 사용): 영웅 레벨별 부대 수 [min_level, n], 영웅당 상한, 진영 총 유닛 상한(12 시작값, 16까지 확장 가능)
    'troop_slots' => [[1, 2], [10, 3], [20, 4]],   // 등급 미상 폴백 + /api/rules troop_slots(FE 호환 유지)
    // 등급별 상대 해금(등급 격차 v1 권고 (a), 2026-11-14): 4번째 부대 해금 레벨 = 영웅 만렙 - 2 (S24->22, A20->18, B18->16, C16->14). 3번째는 전 등급 Lv10. 키 없는 등급은 위 troop_slots.
    'troop_slots_by_rarity' => ['S' => [[1, 2], [10, 3], [22, 4]], 'A' => [[1, 2], [10, 3], [18, 4]], 'B' => [[1, 2], [10, 3], [16, 4]], 'C' => [[1, 2], [10, 3], [14, 4]]],
    'troop_cap' => 4,
    // 영웅 레벨 마일스톤(레벨업 보상 표시·MP 계단 보너스). 부대 수 라벨은 위 troop_slots와 맞춰 유지. mp_bonus는 MpRules::maxMp에 가산(기존 레벨당 +2 유지)
    // level: 정수 = 절대 레벨, 'max' = 그 영웅의 등급별 만렙(LevelRewards::maxLevel). by_rarity = 등급별 레벨 재정의(부대 4번째 해금 = troop_slots_by_rarity 와 같은 값). rarity 미상이면 level 값(절대)을 쓴다.
    'level_rewards' => ['milestones' => [
        ['level' => 10, 'label' => '부대 3개 편성 · 최대 MP +10', 'mp_bonus' => 10],
        ['level' => 20, 'by_rarity' => ['S' => 22, 'A' => 18, 'B' => 16, 'C' => 14], 'label' => '부대 4개 편성', 'mp_bonus' => 0],
        ['level' => 'max', 'label' => '만렙 · 최대 MP +10', 'mp_bonus' => 10],
    ]],
    // 등급별 영웅 코스트(등급 격차 v1, 2026-11-14): heroes.json/hero_expansion_stats.json 과 동일 값. 주인공 원형(B)·wave3 C 보강 시더가 참조한다.
    'hero_cost_by_grade' => ['C' => 2, 'B' => 3, 'A' => 5, 'S' => 8],
    // 병종 기본 액티브(database/data/default_active_skills.json): 영웅에 enabled 액티브가 없으면 전투 생성 시 병종별 1개 주입. a측(플레이어·아군 NPC) 기본 on, b측(방 상대·시즌 방어 AI)은 enemy_default_skills(기본 false, 밸런스 보호). 롤백=false
    'default_active_skills' => (bool) env('GAME_DEFAULT_ACTIVE_SKILLS', true),
    'enemy_default_skills' => (bool) env('GAME_ENEMY_DEFAULT_SKILLS', false),
    // 스테이지 적 지휘관(enemy_squad.commander / squads[].commander) 스킬: stage_enemy_skills=false면 기존(스킬 없음). 영웅 코드(hero 또는 npc_ref)가 heroes에 있으면 그 패시브·액티브를 적용(스탯은 일반 지휘관 그대로),
    // 액티브가 없으면 stage_enemy_default_active=true일 때 병종 기본 액티브 주입, stage_enemy_passives=false면 패시브 제외. 롤백: GAME_STAGE_ENEMY_SKILLS=false
    'stage_enemy_skills' => (bool) env('GAME_STAGE_ENEMY_SKILLS', true),
    'stage_enemy_default_active' => (bool) env('GAME_STAGE_ENEMY_DEFAULT_ACTIVE', true),
    'stage_enemy_passives' => (bool) env('GAME_STAGE_ENEMY_PASSIVES', true),
    // 봇 스킬 적극성(모든 봇 공통): aoe_min_extra=0(구 1) 주변 추가 명중 최소 수, buff_min_allies=2(구 3) 광역 버프 아군 최소 수, heal_ratio=0.5(구 0.7) 결손/예상치유 비율
    'bot_skill' => ['aoe_min_extra' => 0, 'buff_min_allies' => 2, 'heal_ratio' => 0.5],
    'active_skill_uses' => 2,   // 액티브 스킬 전투당 사용 횟수 기본값(skills.params.uses로 스킬별 지정 가능, 가정값)
    // 영웅별 고정 부대 병종(heroes.troop_type): 허용 5종, 시드 원본 경로 오버라이드(null=database/data/hero_troop_types.json, 테스트용)
    // 병종 v2: heavy 폐지(허용 목록에서 제거). 허용 = 편성 가능(playable) 병종만(마물 제외)
    'hero_troop_types' => ['allowed' => ['sword', 'spear', 'cavalry', 'archer', 'naval', 'gunner'], 'path' => null],
    // 퇴역 병종 별칭(병종 v2): 코드 => 대체 병종. DB unit_types 행은 삭제하지 않고(upsert 전용 시드/진행 중 전투 state 호환) 런타임에서 대체 병종 규칙·상성으로 해석한다. 새 데이터에는 쓰지 않는다.
    'retired_unit_types' => ['heavy' => 'sword'],
    // 방 생성 시 선택 가능한 맵 code(maps 테이블에 있는 것만, 서버 검증). 생략=기본(첫) 맵, solo는 'random' 가능
    'room_map_codes' => ['river_01', 'river_02', 'plain_01', 'forest_01', 'mountain_01', 'desert_01', 'swamp_01', 'castle_01'],
    'troop_place_radius' => 3,   // 배치 화면: 부대 유닛은 소속 영웅 주변 N칸(맨해튼) 안에만 배치(오라 반경 2보다 약간 넓게)
    'max_units_per_side' => 12,   // PvP 방/자유전 편성 기본 -- 바꾸면 PvP 규칙이 달라진다(임밸런 v3도 12 유지)
    // 스테이지(캠페인) 전투 전용 한도(임밸런 v3 1단계 시작값). state.campaign=true인 스테이지 전투에만 적용, PvP 방은 위 12 유지.
    // max_units_per_side_stage: 아군 배치 유닛 상한 / max_units_enemy_stage: 적 초기 편성 상한(아군과 분리) / max_alive_per_side_stage: 증원 포함 생존 상한(시드 검증용)
    'max_units_per_side_stage' => 24,
    // 캠페인(stage) 전투 전용 출격 슬롯 곡선(임밸런 제안). PvP/랭크/방/자유전은 user_level_costs 그대로. enabled=false면 현행(끄기 쉬움).
    // levels: [유저 Lv 하한, 슬롯]. 코스트 상한 = max(user_level_costs.max_cost, 슬롯 x cost_per_slot). 24유닛 한도는 SquadPlanner가 부대 수를 줄여 지킨다.
    // cost_cap_by_level(등급 격차 v1, 2026-11-14): [유저 Lv 하한, 캠페인 코스트 상한(영웅+부대)] 표 -- 있으면 위 'slots x cost_per_slot' 계산을 대체한다(표가 있어도 max(user_level_costs) 아래로는 내리지 않음).
    // 표를 비우거나 키를 지우면 기존 폴백(슬롯 x cost_per_slot). cost_per_slot 은 폴백 + 강제·고정 영웅 1명당 코스트 면세 몫(8=S 등급 코스트)으로 계속 쓴다.
    'campaign_slots' => ['enabled' => true, 'levels' => [[1, 2], [3, 3], [5, 4], [7, 5], [9, 6]], 'cost_per_slot' => 8,
        'cost_cap_by_level' => [[1, 16], [3, 24], [5, 32], [7, 39], [9, 48], [13, 49], [14, 50], [15, 51], [17, 52], [32, 53], [35, 54], [39, 55], [42, 56], [46, 57]]],
    'max_units_enemy_stage' => 28,
    'max_alive_per_side_stage' => 32,
    // 영웅 동반 일반병(스테이지 전투 생성 시 런타임 보강, DB/시드 불변): 적 영웅(지휘관+부대장)과 아군 NPC 영웅이 각자 일반병 target기를 거느리게 한다.
    // 이미 target 이상이면 추가하지 않음, 영웅당 max 상한, 진영 총 유닛은 enemyStageCap/unitHardCap 이내(모자라면 건너뜀+로그). 스테이지별 예외/목표는 database/data/stage_companions.json.
    // enabled=false 면 기존 동작 100% 복원(PvP/방/시즌전쟁은 원래 적용 안 함)
    'companions' => ['enabled' => (bool) env('GAME_COMPANIONS', true), 'enemy_target' => 3, 'ally_target' => 3, 'max' => 4, 'simulate' => (bool) env('GAME_COMPANIONS_SIM', false)],   // simulate: game:simulate [3] 가 동반병을 쓸지 기본값(옵션 --companions 로도 켬; 기본 끔 = 기존 재측정과 동일)
    // 진영 유닛 하드 상한(코드 클램프): 위 모든 한도의 천장. 기본 32(임밸런 v3 1단계, 이전 24). 상향 시 봇/시뮬 연산량 증가
    'max_units_hard_cap' => 32,
    // 임진왜란 10맵 시드(game:seed-imjin10)가 deploy_zones를 이 칸 수까지 BFS로 확장(원본 스폰 유지, 상대 스폰·암초·벽·허공 제외). v3 1단계 측당 30칸
    'deploy_zone_size' => 30,
    // 기본(자동) 배치 분산: 병사 자동 배치 시 영웅·병사마다 이동 가능한 인접 빈 칸을 최소 N칸(자기 이동 가능 인접 칸 수 이내) 남긴다. 0=끔
    'deploy_min_free_adjacent' => 2,
    // 부대 병종 코스트 시작값(unit_types.cost 시드 기본) / 프리셋이 없는 영웅의 병종별 기본 부대 편성
    'troop_unit_cost' => ['naval' => 1, 'sword' => 1, 'spear' => 1, 'archer' => 1, 'gunner' => 1, 'healer' => 1, 'mage' => 2, 'assassin' => 2, 'monster' => 3, 'cavalry' => 2, 'flyer' => 2],
    'troop_default_by_type' => [
        'sword' => ['sword', 'spear', 'archer', 'sword'], 'spear' => ['spear', 'sword', 'archer', 'spear'], 'archer' => ['archer', 'sword', 'spear', 'archer'],
        'cavalry' => ['cavalry', 'archer', 'spear', 'cavalry'], 'mage' => ['mage', 'spear', 'sword', 'archer'], 'healer' => ['healer', 'sword', 'spear', 'archer'],
        'flyer' => ['flyer', 'spear', 'archer', 'sword'], 'gunner' => ['gunner', 'sword', 'spear', 'gunner'],   // gunner: 총병(수치 임시, 사선·이동 후 사격 불가는 Engine gunner_rules)
    ],
    // gacha.currency: 뽑기 결제 통화 pen(기본, 2026-11-14 전환)|gold. 골드 롤백=환경변수 GAME_GACHA_CURRENCY=gold. pen_price = 펜 결제 가격(1회 1/10연 9, 임밸런 후속 검증 임시값). 펜 결제는 gacha_pulls.pay_currency/pen_spent 마이그레이션(2026_11_14_000100) 적용 후에만 동작(미적용 시 503 gacha_pen_unavailable)
    // 가챠(항상 on, 개발용). 풀·확률·가격은 database/data/gacha_pool.json(가정 시작값, 임밸런 조정 대상). pool_path는 테스트용 오버라이드
    // required_pity/required_boost: 필수 영웅 소프트 천장(docs/GACHA_REQUIRED_PITY_20261108.md). required_pity=0 이면 기능 끔, required_boost=같은 등급 안 가중치 배수. required_library: 서고(전체 풀)에서도 필수 영웅 부스트·천장을 적용할지(기본 false), banner_min_per_rarity/banner_max_pool: 시나리오 배너 풀 검증. required_path: 테스트용 stage_required_heroes.json 오버라이드
    // banner_overrides: 배너별 필수 천장 차등 훅(기본 없음). 예 ['sc_ch1' => ['required_boost' => 3, 'required_pity' => 40]]. 키 없으면 전역 required_boost/required_pity. 시나리오 배너 생성/감사: docs/GACHA_REQUIRED_PITY_20261108.md 3~4장
    'gacha' => ['enabled' => true, 'currency' => in_array($gc = (string) env('GAME_GACHA_CURRENCY', 'pen'), ['gold', 'pen'], true) ? $gc : 'gold', 'pen_price' => ['single' => 1, 'ten' => 9], 'pool_path' => null, 'banners_path' => null, 'required_pity' => (int) env('GAME_GACHA_REQUIRED_PITY', 30), 'required_boost' => (int) env('GAME_GACHA_REQUIRED_BOOST', 5), 'required_path' => null, 'required_library' => (bool) env('GAME_GACHA_REQUIRED_LIBRARY', false), 'banner_min_per_rarity' => 1, 'banner_max_pool' => 150, 'banner_overrides' => ['sc_ch1' => ['required_pity' => 8, 'required_boost' => 5]], 'registry_path' => null],
    // 3차 영웅 확장 입력 경로 오버라이드(null=database/data/proposals/ 기본 파일, 테스트용)
    'hero_wave3' => ['candidates' => null, 'stats' => null, 'gap_fill' => null, 'skill_names' => null],
    // 튜토리얼(코드 값, env 없음). reward: 완료 1회 지급(gold·유저 exp, 가정 시작값 -> 최종 밸런스 단계에서 조정), reward_on_skip: 건너뛰기 완료에도 지급할지(기본 false),
    // auto_start_after: 이 시각(UTC) 이후 가입한 유저만 첫 로비 자동 시작(기존 유저는 false, null=전원), dialogue_path: 대사 단계 수 원본(테스트용 오버라이드)
    'tutorial' => ['reward' => ['gold' => 100, 'user_exp' => 30], 'reward_on_skip' => false, 'auto_start_after' => '2026-11-01 00:00:00', 'dialogue_path' => null],
    // 퀘스트(항상 on, 코드 값. 보상·목표는 가정 시작값 -> 최종 밸런스 단계 조정, 문구는 송서사 교체 대상). 보상은 gold+user_exp 고정(아이템·확률 없음).
    // kind: main(1회성, period 'main') | daily(KST 05:00) | weekly(월요일 05:00 KST). event: stage_clear(subject=스테이지 code)|stage_win|stage_play|pvp_play|pvp_win|gacha_pull(뽑은 횟수)|equip_buy
    // guest_claim: 게스트가 보상을 수령할 수 있는 kind(진행도는 게스트도 누적, 정식 계정 전환 시 그대로 유지). 다계정 골드 파밍 방지로 일일·주간은 정식 계정만
    'quests' => [
        'guest_claim' => ['main'],
        // PvP 인정 기준(퀘스트 pvp_play/pvp_win·주간 랭킹 공통, settle 시 판정): 최소 진행 라운드(battles.turn 기준), 동일 상대쌍 일일 인정 상한(KST 05:00 기준)
        'pvp_min_rounds' => 3,
        'pvp_pair_daily_cap' => 3,
        'defs' => [
            ['code' => 'main_stage_01', 'kind' => 'main', 'title' => '첫 전초전 돌파', 'desc' => '스테이지 1을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'stage_01', 'target' => 1, 'gold' => 100, 'user_exp' => 30],
            ['code' => 'main_stage_02', 'kind' => 'main', 'title' => '동방의 창 돌파', 'desc' => '스테이지 2를 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'stage_02', 'target' => 1, 'gold' => 120, 'user_exp' => 40],
            ['code' => 'main_stage_03', 'kind' => 'main', 'title' => '책사의 계략 돌파', 'desc' => '스테이지 3을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'stage_03', 'target' => 1, 'gold' => 150, 'user_exp' => 50],
            ['code' => 'main_stage_04', 'kind' => 'main', 'title' => '코끼리 군단 돌파', 'desc' => '스테이지 4를 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'stage_04', 'target' => 1, 'gold' => 180, 'user_exp' => 60],
            ['code' => 'main_stage_05', 'kind' => 'main', 'title' => '초원의 폭풍 돌파', 'desc' => '스테이지 5를 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'stage_05', 'target' => 1, 'gold' => 220, 'user_exp' => 80],
            ['code' => 'main_stage_06', 'kind' => 'main', 'title' => '대왕의 원정 돌파', 'desc' => '스테이지 6을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'stage_06', 'target' => 1, 'gold' => 300, 'user_exp' => 100],
        // 캠페인 1장 메인 퀘스트(가정값: 보상 = 해당 스테이지 보상 gold/user_exp와 동일, 문구는 송서사 교체 대상). 기존 main_stage_01~06과 별개
            ['code' => 'main_ch1_s1', 'kind' => 'main', 'title' => '옥포의 첫 승전 돌파', 'desc' => '1장 1스테이지 「옥포의 첫 승전」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s1', 'target' => 1, 'gold' => 90, 'user_exp' => 25],
            ['code' => 'main_ch1_s2', 'kind' => 'main', 'title' => '정암진 나루 돌파', 'desc' => '1장 2스테이지 「정암진 나루」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s2', 'target' => 1, 'gold' => 120, 'user_exp' => 35],
            ['code' => 'main_ch1_s3', 'kind' => 'main', 'title' => '한산도, 학의 날개 돌파', 'desc' => '1장 3스테이지 「한산도, 학의 날개」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s3', 'target' => 1, 'gold' => 190, 'user_exp' => 55],
            ['code' => 'main_ch1_s4', 'kind' => 'main', 'title' => '진주성의 엿새 돌파', 'desc' => '1장 4스테이지 「진주성의 엿새」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s4', 'target' => 1, 'gold' => 280, 'user_exp' => 80],
            ['code' => 'main_ch1_s5', 'kind' => 'main', 'title' => '평양성 탈환 돌파', 'desc' => '1장 5스테이지 「평양성 탈환」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s5', 'target' => 1, 'gold' => 390, 'user_exp' => 110],
            ['code' => 'main_ch1_s6', 'kind' => 'main', 'title' => '행주산성 돌파', 'desc' => '1장 6스테이지 「행주산성」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s6', 'target' => 1, 'gold' => 350, 'user_exp' => 100],
            ['code' => 'main_ch1_s7', 'kind' => 'main', 'title' => '노량, 마지막 바다 돌파', 'desc' => '1장 7스테이지 「노량, 마지막 바다」을 클리어하세요.', 'event' => 'stage_clear', 'subject' => 'ch1_s7', 'target' => 1, 'gold' => 560, 'user_exp' => 160],
            ['code' => 'daily_stage_play', 'kind' => 'daily', 'title' => '오늘의 출정', 'desc' => '스테이지 전투를 1회 마치세요.', 'event' => 'stage_play', 'target' => 1, 'gold' => 30, 'pen' => 2, 'user_exp' => 10],
            ['code' => 'daily_stage_win', 'kind' => 'daily', 'title' => '오늘의 승전', 'desc' => '스테이지에서 2회 승리하세요.', 'event' => 'stage_win', 'target' => 2, 'gold' => 50, 'pen' => 2, 'user_exp' => 15],
            ['code' => 'daily_gacha', 'kind' => 'daily', 'title' => '오늘의 소집', 'desc' => '영웅 소환을 1회 하세요.', 'event' => 'gacha_pull', 'target' => 1, 'gold' => 0, 'pen' => 3, 'user_exp' => 10],
            ['code' => 'daily_pvp', 'kind' => 'daily', 'title' => '오늘의 대결', 'desc' => '대인 대전을 1회 마치세요.', 'event' => 'pvp_play', 'target' => 1, 'gold' => 40, 'pen' => 3, 'user_exp' => 15],
            ['code' => 'weekly_stage_win', 'kind' => 'weekly', 'title' => '주간 연승 행군', 'desc' => '이번 주 스테이지에서 10회 승리하세요.', 'event' => 'stage_win', 'target' => 10, 'gold' => 250, 'user_exp' => 80],
            ['code' => 'weekly_pvp_win', 'kind' => 'weekly', 'title' => '주간 무패의 기세', 'desc' => '이번 주 대인 대전에서 3회 승리하세요.', 'event' => 'pvp_win', 'target' => 3, 'gold' => 250, 'user_exp' => 80],
            ['code' => 'weekly_gacha', 'kind' => 'weekly', 'title' => '주간 대규모 소집', 'desc' => '이번 주 영웅 소집을 10회 하세요.', 'event' => 'gacha_pull', 'target' => 10, 'gold' => 200, 'user_exp' => 60],
            ['code' => 'weekly_equip_buy', 'kind' => 'weekly', 'title' => '주간 무기고 정비', 'desc' => '이번 주 장비를 2개 구매하세요.', 'event' => 'equip_buy', 'target' => 2, 'gold' => 150, 'user_exp' => 50],
        ],
    ],
    // 랭킹 보드: public=순위 공개(법무 확인 전 코드 고정 true), top=상위 노출 수, cache_seconds=응답 캐시, count_forfeit_wins=기권·타임아웃·퇴장 승리를 주간 PvP 승수에 포함할지, include_guests=게스트 포함(기본 제외)
    'ranking' => ['public' => true, 'top' => 50, 'cache_seconds' => 60, 'count_forfeit_wins' => true, 'include_guests' => false],
    // 멀티 랭크/대기열(P5). enabled=false(기본): /api/rank/* 가 404 rank_disabled 이고 정산 훅도 동작하지 않는다(기존 PvP/방 동작 불변). 열기 전 병종 v2·밸런스 확인.
    // elo_k/start_rating: Elo K=32·시작 1000 / season_days: 랭크 시즌 길이(4주=28일)
    // 매칭 허용 레이팅 차 = min(max_range, base_range + floor(대기초/10) x expand_per_10s), 두 사람 중 큰 쪽 허용치 이내면 성사
    // queue_timeout_seconds: 대기 초과 시 자동 취소 / queue_stale_seconds: 이 시간 동안 status 폴링이 없으면 유령 대기로 보고 제외
    // deploy_timeout_seconds: 매칭 후 배치 확정 제한(미확정자 기권패, 둘 다 미확정이면 무효) / allow_guests: 게스트 참가 허용(기본 불가)
    // 숨은 종장 해금(서버 계산, DDL 없음): 대상 = shelf_map_meta 의 status=active 서가 + main_chapters 의 필수(rules.optional 아님) 스테이지가 모두 clear_count>0.
    // 최초 해금 시 quest_event_log(event=chapter_unlock, ref=ch999)에 기록해 이후 서가가 늘어도 유지.
    // 도감 '조우 장수'(서가 NPC) 열람 전용 목록. false 면 GET /api/dex/encounter 404
    'encounter_dex' => ['enabled' => (bool) env('GAME_ENCOUNTER_DEX', true)],

    'hidden_chapter' => [
        'chapter' => 999,
        'main_chapters' => [101, 102, 103, 104],
        'exclude_shelves' => [],   // 집합에서 뺄 서가 chapter 번호
    ],

    // 시즌 전쟁 쓰기 경로(join/attack) 스위치. false(기본)면 403 season_war_disabled. 읽기·진행 중 데이터·war:tick 정산은 영향 없음.
    'season_war_enabled' => (bool) env('GAME_SEASON_WAR_ENABLED', false),

    'rank' => [
        'enabled' => false, 'elo_k' => 32, 'start_rating' => 1000, 'season_days' => 28,
        'base_range' => 100, 'expand_per_10s' => 50, 'max_range' => 600,
        'queue_timeout_seconds' => 120, 'queue_stale_seconds' => 20, 'deploy_timeout_seconds' => 180,
        'top' => 50, 'allow_guests' => false,
        // 큐별 정규화(RANK_QUEUE_SPEC): 랭크 매치 방에서만 영웅 레벨 상한·장비 합계 배율을 적용(일반 PvP/방/캠페인 불변). breakthrough=false: 별(star)·조각 돌파는 전투 입력에 반영하지 않음(현재 어떤 전투에도 미반영, 명시용)
        'normalize' => ['level_cap' => 15, 'equip_scale' => 0.5],
        // 어뷰징 방지 1차(보수적 기본값). repeat_*: 같은 두 사람이 window 시간 안에 N번째로 치르는 매치의 레이팅 변동 배율(1~free번째 100%, free+1~zero_after번째 decay_pct%, 그 이후 0)
        // avoid_last_opponent: 직전 상대와는 어느 한쪽이 avoid_last_wait_seconds 이상 기다리기 전까지 매칭 제외 / forfeit_*: window 분 안에 기권패 limit회 이상이면 마지막 기권 후 cooldown 분간 큐 등록 불가(429 queue_cooldown)
        // short_game_*: 정상 종료인데 턴이 min_turn 미만이면 변동에 scale_pct% 배율(기권패는 축소 없음)
        'abuse' => [
            'repeat_window_hours' => 24, 'repeat_free' => 3, 'repeat_decay_pct' => 50, 'repeat_zero_after' => 6,
            'avoid_last_opponent' => true, 'avoid_last_wait_seconds' => 60,
            'forfeit_window_minutes' => 60, 'forfeit_limit' => 3, 'forfeit_cooldown_minutes' => 10,
            'short_game_min_turn' => 3, 'short_game_scale_pct' => 25,
        ],
        // 시즌 간 소프트 리셋: 새 시즌 첫 레이팅 = start + (이전 시즌 최종 - start) x carry_pct/100 (50 = 1000쪽으로 절반 수렴)
        'season_carry_pct' => 50,
        // 시즌 종료 보상 골격(지급 비활성): enabled=false 면 보상표 계산(rewardPlan)만 가능하고 지급하지 않는다. 티어는 레이팅 하한 기준(큰 min_rating 부터 매칭)
        'season_rewards' => [
            'enabled' => false, 'min_games' => 5,
            'tiers' => [
                ['code' => 'bronze', 'name' => '청동', 'min_rating' => 0, 'gold' => 0, 'title' => null],
                ['code' => 'silver', 'name' => '은', 'min_rating' => 1100, 'gold' => 0, 'title' => null],
                ['code' => 'gold', 'name' => '금', 'min_rating' => 1250, 'gold' => 0, 'title' => null],
                ['code' => 'platinum', 'name' => '백금', 'min_rating' => 1400, 'gold' => 0, 'title' => null],
                ['code' => 'diamond', 'name' => '다이아', 'min_rating' => 1600, 'gold' => 0, 'title' => null],
            ],
        ],
    ],
    // 장비·상점(항상 on, 개발용 코드 값). 수치·가격은 database/data/equipment_proposal.json(임밸런 초안, 최종 밸런스 단계에서 일괄 조정)
    // cap: 영웅 유닛 장비 합계 클램프 = 스탯별 min(합계, floor(Lv1 능력치 x cap_pct/100), cap_flat). Lv1 = 병종 기본 + 영웅 보너스
    // inventory_cap: 유저당 보유 개체 상한 / pvp_scale: 방 PvP 시작 시 장비 합계에 곱해 내림(1.0=그대로, 안전장치)
    // 펜(pen): 시즌 전쟁·랭크전·일일 퀘스트로 얻는 영구 재화(wallets currency_code='pen', 시즌 이월·소멸 없음). 수량은 모두 임시값(밸런스 확정 전).
    // daily_cap = 유저당 하루(KST 05:00) 획득 상한 합계(초과분은 지급하지 않음, 0=무제한). enabled=false 면 지급 중단(보유분·사용은 유지).
    'pen' => [
        'enabled' => (bool) env('GAME_PEN_ENABLED', true),
        'daily_cap' => (int) env('GAME_PEN_DAILY_CAP', 15),   // 클리어·전쟁·랭크 전용 일일 상한 15(일일 퀘스트·시작·튜토리얼·시즌 종료 보상은 상한 밖). 조정은 환경변수 GAME_PEN_DAILY_CAP
        'starter' => 10,             // 신규 계정 시작 펜(일일 상한 밖, reason starter_pen)
        'tutorial_reward' => 5,      // 튜토리얼 완료 펜(일일 상한 밖, reason tutorial_reward_pen)
        'war_attack_win' => 5,       // 시즌 전쟁 영토 공격 승리 1회
        'war_capture' => 15,         // 시즌 전쟁 영토 점령 성공 보너스 1회
        'rank_win' => 8,             // 랭크전 정상 종료 승리 1회(기권·접속끊김 승리는 제외)
        'daily_quest' => (int) env('GAME_PEN_DAILY_QUEST', 0),   // 일일 퀘스트 공통 수령 펜(0: 퀘스트 정의별 pen 사용, 합 10/일, 일일 상한 제외)
        // 스테이지 첫 클리어 펜(스테이지당 1회, ref=user_stage_progress id 멱등, 일일 상한 공유, 소탕·재클리어는 0). 기본 ON(2026-11-14), 끄기: GAME_PEN_PVE_FIRST_CLEAR=false
        'pve_first_clear' => ['enabled' => (bool) env('GAME_PEN_PVE_FIRST_CLEAR', true), 'amount' => (int) env('GAME_PEN_PVE_FIRST_CLEAR_AMOUNT', 1)],
        // 시즌 종료 보상(일일 상한과 무관, season_members.contribution>0 인 참가자만): 개인 기여 순위 구간별 지급(rank<=max_rank 첫 구간) + 우승 국가 소속 보너스
        'season' => ['rank_table' => [[1, 200], [2, 120], [3, 80], [10, 40]], 'participate' => 15, 'winner_bonus' => 50],
    ],
    // 클라이언트 에러 리포트(POST /api/client-errors) 보관: retention_days 초과 삭제 + max_rows 초과분 오래된 것부터 삭제(client-errors:prune, 매일 04:10)
    'client_errors' => ['retention_days' => 14, 'max_rows' => 5000],
    // 소탕(수동 3성 클리어한 스테이지만, 자동 전투 아님): enabled=false 면 404 sweep_disabled. max_count=1회 요청 최대 횟수. 일일 한도는 reward_scale.stage_daily_cap 카운터를 전투 보상과 공유
    'sweep' => ['enabled' => (bool) env('GAME_SWEEP_ENABLED', true), 'max_count' => 10, 'daily_cap' => 5, 'daily_total' => 10],   // daily_cap: 유저·스테이지별 일일 소탕 횟수 상한(KST 05:00). stage_daily_cap 과 별개로 항상 적용(0=무제한은 권장하지 않음) / daily_total: 유저당 하루 소탕 총횟수(모든 스테이지 합산, 0=무제한)
    'equipment' => [
        'enabled' => true,
        'cap_flat' => ['hp' => 16, 'atk' => 3, 'def' => 2],
        'cap_pct' => ['hp' => 20, 'atk' => 10, 'def' => 40],
        'inventory_cap' => 100,
        'pvp_scale' => 1.0,
    ],
    // 영웅 강화(별 ★1~★5, user_heroes.star). 같은 영웅 중복 조각(shards)+골드. 전부 임시값(임밸런 확정 전).
    // 비용(★n 으로 올리는 단계 = 배열 n-1번째): 조각 = shard_pieces[단계] x shard_unit[등급], 골드 = gold[단계] x gold_mult[등급]. 확정 성공(실패 없음), 최고 단계 거부.
    // bonus_pct = 해당 별 단계에서의 누적 보너스(Lv1 스탯 대비 %, 공격·방어만, 체력 제외; ★5 최대 +8%). apply_pvp=false: 랭크·자유대전·시즌전쟁에는 미적용(스테이지 PvE만)
    'star' => [
        'enabled' => (bool) env('GAME_STAR_ENABLED', true),
        'apply_pvp' => (bool) env('GAME_STAR_APPLY_PVP', false),
        'max' => 5,
        'shard_pieces' => [1, 1, 2, 2, 3],
        'shard_unit' => ['S' => 50, 'A' => 30, 'B' => 20, 'C' => 10],
        'gold' => [500, 1000, 2000, 3500, 5500],
        'gold_mult' => ['C' => 0.6, 'B' => 1.0, 'A' => 1.5, 'S' => 2.0],
        'bonus_pct' => [2, 3, 5, 6.5, 8],
    ],
    'guest_email_domain' => 'guest.invalid',
    'protagonist_for_guests' => true,   // 게스트에게도 첫 로그인 캐릭터 생성(protagonist_needed) 노출. false면 정식 계정만(구 동작)
];
