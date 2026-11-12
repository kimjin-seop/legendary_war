<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class GuestCsrfTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    public function test_stateful_오리진에서도_게스트_흐름은_CSRF_없이_동작하고_쿠키_인증은_419이다(): void
    {
        $this->app['env'] = 'local';   // PreventRequestForgery는 env=testing이면 검사를 건너뛴다
        $this->artisan('game:seed')->assertSuccessful();
        $h = ['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/'];

        // 쿠키 인증 경로(로그인/가입)는 여전히 CSRF 필수 (withHeaders는 이후 요청에도 유지되므로 먼저 검사)
        $this->withHeaders($h)->postJson(self::ORIGIN.'/api/auth/login', ['email' => 'a@b.co', 'password' => 'x'])->assertStatus(419);
        $token = $this->postJson(self::ORIGIN.'/api/guests', ['nickname' => 'Csrf'])->assertCreated()->json('guest_token');
        $this->withHeaders(['X-Guest-Token' => $token])->postJson(self::ORIGIN.'/api/stages/1/challenge')->assertSuccessful();
    }
}
