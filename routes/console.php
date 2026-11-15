<?php

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

// 시즌 전쟁 시간당 배치(개발 compose의 scheduler 서비스(profile scheduler, schedule:work)가 구동. 기동: docker compose up -d scheduler, 상세는 docs/SEASON_WAR_OPS.md)
Illuminate\Support\Facades\Schedule::command('war:tick')->hourly()->withoutOverlapping();

// 클라이언트 에러 리포트 정리(보관기간·용량 상한: config game.client_errors). 개발 compose scheduler 서비스가 구동
Illuminate\Support\Facades\Schedule::command('client-errors:prune')->dailyAt('04:10')->withoutOverlapping();

// 랭크 대기열 정리(sweep): game.rank.enabled=false 면 no-op. 개발 compose scheduler 서비스(schedule:work)가 매분 호출
Illuminate\Support\Facades\Schedule::call(function () {
    $rank = app(\App\Services\RankService::class);
    if ($rank->enabled()) {
        app(\App\Services\RoomService::class)->expireStale();
        $rank->sweep();
    }
})->name('rank:sweep')->everyMinute()->withoutOverlapping();

// 방 전투 서버 tick(5초): PvP 턴 마감 자동 종료·시간 초과·90초 끊김 기권을 폴링과 무관하게 처리(웹소켓 연결 시 클라이언트 폴링이 느려져도 판정 지연 없음).
// 개발 compose scheduler 서비스(schedule:work)가 구동. 폴링 쪽 지연 tick 은 그대로 유지(이중 안전망).
Illuminate\Support\Facades\Schedule::call(fn () => app(\App\Services\RoomService::class)->tickAll())
    ->name('room:tick')->everyFiveSeconds()->withoutOverlapping();
