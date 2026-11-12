<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * 일일 상한 카운터(daily_counters). (scope, period_key) 단위 원자 증가: 상한 미만일 때만 증가시켜 동시 요청에도 초과하지 않는다.
 * scope 예: "free_reward:user:12", "guest_ip:<sha256(ip)>" (원본 IP는 저장하지 않는다).
 */
class DailyCounter
{
    /** 현재 값 */
    public static function value(string $scope, ?string $period = null): int
    {
        return (int) DB::table('daily_counters')->where(['scope' => $scope, 'period_key' => $period ?? Period::dailyKey()])->value('value');
    }

    /** 행을 보장(insertOrIgnore)한 뒤 잠금(lockForUpdate, SQLite 는 쓰기 직렬화) 읽기. 반드시 트랜잭션 안에서 호출해 '읽기-판단-증가'를 한 단위로 묶는다. */
    public static function valueLocked(string $scope, ?string $period = null): int
    {
        $period ??= Period::dailyKey();
        DB::table('daily_counters')->insertOrIgnore(['scope' => $scope, 'period_key' => $period, 'value' => 0, 'created_at' => now(), 'updated_at' => now()]);

        return (int) DB::table('daily_counters')->where(['scope' => $scope, 'period_key' => $period])->lockForUpdate()->value('value');
    }

    /**
     * 증가 시도: 증가 전 값이 $limit 미만이면 $by만큼 증가하고 true, 이미 상한 이상이면 false.
     * (마지막 증가가 상한을 약간 넘을 수 있음: 상한은 '진입 허용' 기준)
     */
    public static function tryIncrement(string $scope, int $limit, int $by = 1, ?string $period = null): bool
    {
        $period ??= Period::dailyKey();
        DB::table('daily_counters')->insertOrIgnore(['scope' => $scope, 'period_key' => $period, 'value' => 0, 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('daily_counters')->where(['scope' => $scope, 'period_key' => $period])->where('value', '<', $limit)
            ->update(['value' => DB::raw('value + '.(int) $by), 'updated_at' => now()]) > 0;
    }
}
