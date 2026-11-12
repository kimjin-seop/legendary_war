<?php

namespace App\Http\Middleware;

use Closure;
use Illuminate\Foundation\Http\Middleware\PreventRequestForgery;

/**
 * Sanctum stateful 오리진(Origin/Referer 일치)에서 온 요청은 쿠키 세션 + CSRF 검증 대상이 된다.
 * 게스트 흐름은 쿠키가 아니라 X-Guest-Token 헤더로 인증하므로(커스텀 헤더는 교차 출처 폼/이미지로 위조 불가,
 * CORS 미허용) CSRF 위험이 없다. 그래서 다음 요청만 검증을 건너뛴다.
 *  - POST /api/guests (게스트 생성: 인증 없음, 쿠키로 얻는 권한 없음)
 *  - X-Guest-Token 헤더가 있는 요청 (게스트 행동, 게스트 승격 register)
 * 쿠키 인증(회원 로그인/가입/로그아웃/어드민)은 그대로 CSRF 필수(419).
 * config/sanctum.php middleware.validate_csrf_token 에서 사용.
 */
class ValidateCsrfExceptGuest extends PreventRequestForgery
{
    public function handle($request, Closure $next)
    {
        $guestHeader = is_string($request->header('X-Guest-Token')) && $request->header('X-Guest-Token') !== '';
        if ($guestHeader || ($request->isMethod('POST') && $request->is('api/guests'))) {
            return $next($request);
        }

        return parent::handle($request, $next);
    }
}
