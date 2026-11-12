<?php

namespace App\Support;

use Carbon\CarbonInterface;
use Carbon\CarbonImmutable;

/** 일일 집계 기준(period_key): KST 05:00 경계. 앱 타임존(UTC)은 바꾸지 않고 여기서만 변환한다. */
class Period
{
    public const TZ = 'Asia/Seoul';
    public const RESET_HOUR = 5;

    /** 'YYYY-MM-DD' (KST 05:00 이전은 전날로 계산) */
    public static function dailyKey(?CarbonInterface $at = null): string
    {
        $t = CarbonImmutable::instance($at ?? now())->setTimezone(self::TZ);

        return $t->subHours(self::RESET_HOUR)->format('Y-m-d');
    }

    /** 주간 키 'YYYY-MM-DD' = 일일 키가 속한 주의 월요일(KST 05:00 경계: 월요일 04:59는 이전 주) */
    public static function weeklyKey(?CarbonInterface $at = null): string
    {
        return CarbonImmutable::parse(self::dailyKey($at), self::TZ)->startOfWeek(CarbonImmutable::MONDAY)->format('Y-m-d');
    }

    /** 주간 구간 [시작, 끝) 을 UTC로 반환(DB 저장 시각 비교용): 월요일 05:00 KST ~ 다음 월요일 05:00 KST */
    public static function weeklyRangeUtc(?CarbonInterface $at = null): array
    {
        $start = CarbonImmutable::parse(self::weeklyKey($at), self::TZ)->setTime(self::RESET_HOUR, 0);

        return [$start->utc(), $start->addWeek()->utc()];
    }
}
