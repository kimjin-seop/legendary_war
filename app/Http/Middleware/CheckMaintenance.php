<?php

namespace App\Http\Middleware;

use App\Services\MaintenanceService;
use Closure;
use Illuminate\Http\Request;

/**
 * 점검 모드: 활성이면 /api/* 를 503 {error:{code:maintenance,message,ends_at}} 로 막는다.
 * 허용: 로그인/로그아웃/me, /api/rules, /api/announcements, /api/maintenance, 그리고 관리자(role=admin, Sanctum 인증) 전체.
 */
class CheckMaintenance
{
    private const ALLOW = ['api/auth/login', 'api/auth/logout', 'api/auth/me', 'api/rules', 'api/announcements', 'api/maintenance', 'api/client-errors'];

    public function __construct(private readonly MaintenanceService $maintenance)
    {
    }

    public function handle(Request $request, Closure $next)
    {
        $s = $this->maintenance->get();
        if (! $this->maintenance->active($s) || $request->is(...self::ALLOW)) {
            return $next($request);
        }
        $u = $request->user('sanctum');
        if ($u && $u->role === 'admin') {
            return $next($request);
        }

        return response()->json(['error' => ['code' => 'maintenance', 'message' => $s['message'] ?: '서버 점검 중입니다.', 'ends_at' => $s['ends_at']]], 503, ['Retry-After' => '60']);
    }
}
