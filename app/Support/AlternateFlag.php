<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * 전투 생성 시 교대 행동(alternate activation) 규칙 on/off 결정(서버 권위). 기본은 config('game.rules.alternate_activation')(코드 값, env 없음; 현재 false 고정).
 * 개발 QA 한정: local/testing에서 `game:qa-account --alternate`로 표시한 사용자의 새 전투만 on(캐시 플래그). production에서는 플래그를 읽지 않는다.
 */
final class AlternateFlag
{
    public static function key(int $userId): string
    {
        return 'qa_alternate:'.$userId;
    }

    public static function forUser(?int $userId): bool
    {
        if ((bool) config('game.rules.alternate_activation', false)) {
            return true;
        }

        return $userId !== null && app()->environment(['local', 'testing']) && Cache::has(self::key($userId));
    }
}
