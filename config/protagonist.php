<?php

// 오리지널 주인공(캐릭터 생성) 설정. 코드 값(.env 옵션 없음).
return [
    'genders' => ['male', 'female'],
    'faces' => ['male' => ['male_a', 'male_b', 'male_c'], 'female' => ['female_a', 'female_b', 'female_c']],
    // 클래스 = 영웅 클래스(heroes.unit_type) = 병사 병종(heroes.troop_type) 단일 고정. 동점 시 이 순서가 우선.
    'classes' => ['sword', 'spear', 'archer', 'cavalry', 'heavy'],
    'default_class' => 'sword',        // 건너뛰기/자동 지급 기본 원형
    'default_gender' => 'male',
    'default_face' => ['male' => 'male_a', 'female' => 'female_a'],
    'retest_daily_limit' => 5,         // 재검사(POST 재호출) 일일 상한. 0 = 제한 없음. 최초 생성은 집계 제외
    'allow_gender_change_on_retest' => true,   // false면 성별은 최초 생성 후 고정(face는 같은 성별 안에서 PUT /api/protagonist/face로 언제든 변경)
    'name_max_length' => 12,
    'quiz_path' => null,               // null = database/data/protagonist_quiz.json
];
