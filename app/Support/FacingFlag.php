<?php

namespace App\Support;

use Illuminate\Support\Facades\Cache;

/**
 * 전투 생성 시 방향(facing) 시스템 on/off 결정(서버 권위). 기본은 config('game.rules.facing')(항상 on 고정, env 없음).
 * 개발 QA 한정: local/testing 환경에서만 `game:qa-account --facing`로 표시한 사용자의 새 전투를 facing on으로 만든다(캐시 플래그).
 * 요청 헤더/쿼리로는 켤 수 없고, production에서는 플래그를 읽지 않는다.
 */
final class FacingFlag
{
    public static function key(int $userId): string
    {
        return 'qa_facing:'.$userId;
    }

    public static function forUser(?int $userId): bool
    {
        if ((bool) config('game.rules.facing', false)) {
            return true;
        }

        return $userId !== null && app()->environment(['local', 'testing']) && Cache::has(self::key($userId));
    }
}
