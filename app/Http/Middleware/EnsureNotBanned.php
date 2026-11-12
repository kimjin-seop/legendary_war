<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/** auth:sanctum 뒤에서 정지 계정 차단(세션 저장소와 무관하게 요청마다 users.banned_at 확인). */
class EnsureNotBanned
{
    public function handle(Request $request, Closure $next): Response
    {
        if ($request->user()?->banned_at) {
            return response()->json(['error' => ['code' => 'account_banned', 'message' => '정지된 계정입니다.']], 403);
        }

        return $next($request);
    }
}
