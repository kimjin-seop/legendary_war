<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/** 점검 모드(app_settings.maintenance = {enabled,message,starts_at,ends_at}). 활성 = enabled 이고 시작 이전이 아니며 종료 이후가 아님. */
class MaintenanceService
{
    public const KEY = 'maintenance';
    private const CACHE_KEY = 'app_settings:maintenance';
    private const CACHE_TTL = 8;   // 초: 요청마다 DB 조회를 피한다. put() 이 즉시 무효화

    public function get(): array
    {
        $def = ['enabled' => false, 'message' => null, 'starts_at' => null, 'ends_at' => null];
        try {
            $stored = Cache::remember(self::CACHE_KEY, self::CACHE_TTL, function () {
                $raw = DB::table('app_settings')->where('key', self::KEY)->value('value');

                return is_string($raw) ? (json_decode($raw, true) ?: []) : [];
            });
        } catch (\Throwable) {
            return $def;   // 테이블 없음·DB 이상 시 점검으로 막지 않는다
        }

        return $stored + $def;
    }

    /** 현재 점검 중인가 */
    public function active(?array $s = null): bool
    {
        $s ??= $this->get();
        if (empty($s['enabled'])) {
            return false;
        }
        $now = now()->getTimestamp();
        if (! empty($s['starts_at']) && strtotime((string) $s['starts_at']) > $now) {
            return false;
        }
        if (! empty($s['ends_at']) && strtotime((string) $s['ends_at']) <= $now) {
            return false;
        }

        return true;
    }

    /** 공개 상태 응답 */
    public function status(): array
    {
        $s = $this->get();

        return ['active' => $this->active($s), 'enabled' => (bool) $s['enabled'], 'message' => $s['message'], 'starts_at' => $s['starts_at'], 'ends_at' => $s['ends_at']];
    }

    public function put(array $s): void
    {
        DB::table('app_settings')->upsert([['key' => self::KEY, 'value' => json_encode($s, JSON_UNESCAPED_UNICODE), 'updated_at' => now()]], ['key'], ['value', 'updated_at']);
        Cache::forget(self::CACHE_KEY);
    }
}
