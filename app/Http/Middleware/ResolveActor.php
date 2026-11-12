<?php

namespace App\Http\Middleware;

use App\Models\User;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Symfony\Component\HttpFoundation\Response;

/**
 * 게임 API 행위자 식별: Sanctum SPA 쿠키 세션(회원) 또는 X-Guest-Token 헤더(게스트).
 * 정지 유저는 차단. 게스트 토큰은 해시(sha256)로만 조회한다.
 */
class ResolveActor
{
    public function handle(Request $request, Closure $next): Response
    {
        $user = $request->user('sanctum');
        if (! $user && is_string($token = $request->header('X-Guest-Token')) && $token !== '') {
            $g = DB::table('guests')->where('token_hash', hash('sha256', $token))->first();
            if ($g) {
                $user = User::find($g->user_id);
                // 요청마다 쓰기 금지: 30초 이내면 갱신 생략(SQLite 쓰기 경합 완화)
                if (! $g->last_seen_at || \Illuminate\Support\Carbon::parse($g->last_seen_at)->lt(now()->subSeconds(30))) {
                    DB::table('guests')->where('id', $g->id)->update(['last_seen_at' => now()]);
                }
            }
        }
        if (! $user) {
            return response()->json(['error' => ['code' => 'unauthenticated', 'message' => '로그인 또는 게스트 토큰이 필요합니다.']], 401);
        }
        if ($user->banned_at) {
            return response()->json(['error' => ['code' => 'account_banned', 'message' => '정지된 계정입니다.']], 403);
        }
        $request->setUserResolver(fn () => $user);

        return $next($request);
    }
}
