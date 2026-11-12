<?php

// 캐릭터명 금칙어 목록(확장 가능). 비교는 NFC 정규화 + 소문자 기준.
// 길이 3 이상 단어는 '포함' 여부, 2 이하 단어는 '완전 일치'로 검사한다.
return [
    'min_length' => 2,
    'max_length' => 12,
    // 운영/사칭 예약어
    'reserved' => ['admin', 'administrator', 'gm', 'operator', 'system', 'staff', 'moderator', 'support', '운영자', '관리자', '시스템', '지엠', '운영진', '공식', '고객센터'],
    // 기본 욕설(최소 목록, 운영 중 확장)
    'profanity' => ['fuck', 'shit', 'bitch', 'asshole', '시발', '씨발', '병신', '개새끼', '좆', '지랄'],
];
