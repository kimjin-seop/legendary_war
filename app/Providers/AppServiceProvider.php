<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        // PHP 8.3에서는 transaction_mode(IMMEDIATE)가 적용되지 않으므로 SQLite 커넥터를 교체한다.
        if (version_compare(PHP_VERSION, '8.4.0', '<')) {
            $this->app->bind('db.connector.sqlite', \App\Database\ImmediateSqliteConnector::class);
        }
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // 이름 없는 throttle:N,M은 라우트 간 같은 IP 카운터를 공유하므로, 인증 관련 라우트는 이름 있는 리미터로 분리한다.
        RateLimiter::for('guest-create', fn (Request $r) => Limit::perMinute(10)->by($r->ip()));
        RateLimiter::for('register', fn (Request $r) => Limit::perMinute(6)->by($r->ip()));
        RateLimiter::for('login', fn (Request $r) => Limit::perMinute(5)->by($r->ip()));
        RateLimiter::for('client-errors', fn (Request $r) => Limit::perMinute(20)->by($r->ip()));
        RateLimiter::for('check-name', fn (Request $r) => Limit::perMinute(30)->by($r->ip()));
        RateLimiter::for('room-create', fn (Request $r) => Limit::perMinute(20)->by($r->user()?->id ?: $r->ip()));
        // 방 채팅: 읽기(폴링 1.5s=40/분 여유 포함) 120, 쓰기 30(서비스 규칙 3초/건이 본 제한), 신고 10
        RateLimiter::for('chat-read', fn (Request $r) => Limit::perMinute(120)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('chat-send', fn (Request $r) => Limit::perMinute(30)->by($r->user()?->id ?: $r->ip()));
        RateLimiter::for('chat-report', fn (Request $r) => Limit::perMinute(10)->by($r->user()?->id ?: $r->ip()));
        // 게임 API: 유저별 분당 300회(시작값)
        RateLimiter::for('game', fn (Request $r) => Limit::perMinute(300)->by($r->user()?->id ?: $r->ip()));
        //
    }
}
