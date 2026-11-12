<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** 어드민 전용(role=admin, 정지 아님). auth:sanctum 뒤에서 사용. */
class EnsureAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user();
        if ($user && $user->banned_at) {
            return response()->json(['error' => ['code' => 'account_banned', 'message' => '정지된 계정입니다.']], 403);
        }
        if (! $user || ! $user->isAdmin()) {
            return response()->json(['error' => ['code' => 'forbidden', 'message' => '관리자 권한이 필요합니다.']], 403);
        }

        return $next($request);
    }
}
