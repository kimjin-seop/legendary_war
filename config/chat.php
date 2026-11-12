<?php

// 방 채팅 설정. 전부 코드 값(.env 옵션 없음).
return [
    'max_length' => 100,                 // 자유 텍스트 최대 글자 수(정규화 후)
    'send_interval_seconds' => 3,        // 유저당 전송 간격(초). 위반 시 429 chat_throttled
    'duplicate_window_seconds' => 30,    // 같은 유저의 직전 메시지와 동일 내용이면 이 시간 안에는 422 chat_duplicate
    'guest_free_text' => false,          // true면 게스트도 자유 텍스트 허용(기본 불가: 빠른 채팅만)
    'page_size' => 50,                   // GET messages 1회 최대 개수
    'read_grace_minutes' => 30,          // 방 종료(finished/closed) 후 읽기 허용 시간. 쓰기는 즉시 불가
    'retention_days' => 7,               // 메시지 보관 기간(전송 시 해당 방의 오래된 메시지 정리)
    'max_per_room' => 200,               // 방당 최대 보관 개수(초과분 오래된 것부터 삭제)
    // 신고 자동 제재(최소): 최근 report_window_days일 동안, 마지막 제재 이후의 서로 다른 회원 신고자 N명 이상이면 restrict_minutes 동안 채팅 제한.
    // 게스트 신고자·quick 메시지 신고는 기록만 하고 카운트 제외.
    'report_threshold' => 3,
    'report_window_days' => 7,
    'restrict_minutes' => 60,
    'report_reasons' => ['abuse', 'spam', 'sexual', 'other'],
    // 금칙어: NFKC·결합문자/채움문자 제거·소문자 후 (1) 공백/기호로 나눈 단어 안에 포함 (2) 한 글자 토큰 연속 구간('시 발','시.발')을 이어 붙여 포함이면 422 banned_word.
    // '다시 발견' 같은 단어 경계 걸친 오탐은 없지만, 긴 단어와 한 글자 조각을 섞은 우회('시.발놈')는 미탐일 수 있음(감수). 목록은 여기서만 관리한다.
    'banned_words' => ['시발', '씨발', '병신', '개새끼', '지랄', '좆', '느금마', '니미', 'fuck', 'shit', 'bitch'],
    // 빠른 채팅 프리셋(id => 표시 문구). 게스트·회원 모두 사용 가능.
    'quick_presets' => [
        'gl' => '잘 부탁드립니다',
        'gg' => '좋은 승부였습니다',
        'wait' => '잠시만요',
        'thx' => '감사합니다',
        'sad' => '아쉽네요',
        'nice' => '멋진 수였습니다',
        'again' => '한 판 더 할까요?',
        'hurry' => '조금만 서둘러 주세요',
    ],
];
