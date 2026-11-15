<?php

use App\Game\IllegalAction;
use App\Http\Middleware\EnsureAdmin;
use App\Http\Middleware\ResolveActor;
use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        web: __DIR__.'/../routes/web.php',
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    // 웹소켓 채널 인증: POST /api/broadcasting/auth. game.actor = 회원(세션 쿠키)·게스트(X-Guest-Token) 공통 행위자 식별
    ->withBroadcasting(__DIR__.'/../routes/channels.php', ['prefix' => 'api', 'middleware' => ['api', 'game.actor']])
    ->withMiddleware(function (Middleware $middleware): void {
        $middleware->statefulApi();   // Sanctum SPA 쿠키 인증 (같은 도메인)
        // 프록시 신뢰: 기본은 신뢰 안 함(X-Forwarded-* 무시 -> 리미터 IP 위조 방지). 배포 토폴로지 확정 후
        // TRUSTED_PROXIES="10.0.0.1,10.0.0.2"(CIDR 가능) 또는 "*"(앞단이 LB뿐일 때만)로 지정. 실제 환경변수로 주입 권장(config:cache 시 .env 미로딩).
        if (($proxies = trim((string) env('TRUSTED_PROXIES', ''))) !== '') {
            $middleware->trustProxies(at: $proxies === '*' ? '*' : array_map('trim', explode(',', $proxies)));
        }
        $middleware->api(append: [\App\Http\Middleware\CheckMaintenance::class]);   // 점검 모드(app_settings.maintenance 활성 시 /api/* 503, 로그인·rules·공지·관리자 허용)
        $middleware->alias([
            'game.actor' => ResolveActor::class,
            'admin' => EnsureAdmin::class,
            'not.banned' => \App\Http\Middleware\EnsureNotBanned::class,
        ]);
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api/*') || $request->expectsJson(),
        );
        $exceptions->dontReport(IllegalAction::class);
        // SQLite 쓰기 경합(database is locked)은 500이 아니라 재시도 가능한 503 + Retry-After
        $exceptions->render(function (\Illuminate\Database\QueryException $e, Request $request) {
            if ($request->is('api/*') && str_contains(strtolower($e->getMessage()), 'database is locked')) {
                return response()->json(['error' => ['code' => 'db_busy', 'message' => '서버가 잠시 바쁩니다. 잠시 후 다시 시도하세요.']], 503, ['Retry-After' => '1']);
            }

            return null;
        });   // 예상된 4xx 규칙 위반은 로그 오류로 남기지 않음
        // 규칙/검증 위반: 4xx + 사유 코드 (트랜잭션은 롤백되어 상태 불변)
        $exceptions->render(fn (IllegalAction $e) => response()->json(
            ['error' => ['code' => $e->reason, 'message' => $e->getMessage()] + $e->extra],   // extra: cost_exceeded의 used/max 등 부가 수치
            $e->status,
        ));
    })->create();
