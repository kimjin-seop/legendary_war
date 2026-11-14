<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AuthAdminTest extends TestCase
{
    use RefreshDatabase;

    private const ORIGIN = 'http://localhost:8000';

    protected function setUp(): void
    {
        parent::setUp();
        // CSRF 보호를 실제와 동일하게 검증: PreventRequestForgery는 env=testing이면 검사를 건너뛰므로 local로 둔다.
        $this->app['env'] = 'local';
    }

    /** SPA 흐름 그대로: GET /sanctum/csrf-cookie -> XSRF-TOKEN 쿠키/세션 쿠키 수집 */
    private function spaSession(): array
    {
        $r = $this->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/'])->get(self::ORIGIN.'/sanctum/csrf-cookie');
        $r->assertNoContent();
        $xsrf = $r->getCookie('XSRF-TOKEN', false)->getValue();
        $session = $r->getCookie(config('session.cookie'), false)->getValue();

        return [$xsrf, $session];
    }

    private function spa(array $s): static
    {
        return $this->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/', 'X-XSRF-TOKEN' => urldecode($s[0])])
            ->withUnencryptedCookies(['XSRF-TOKEN' => $s[0], config('session.cookie') => $s[1]]);
    }

    public function test_가입_후_로그인에_성공한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();   // 캠페인 키 영웅(S) 후보는 챕터 스테이지 필수 영웅에서 도출
        $payload = ['name' => 'Tester', 'email' => 'tester@example.com', 'password' => 'abcd1234xyz', 'password_confirmation' => 'abcd1234xyz', 'terms_accepted' => true];

        // 토큰 없이는 CSRF로 거부된다 (보호가 실제 동작함을 확인)
        $this->withHeaders(['Origin' => self::ORIGIN, 'Referer' => self::ORIGIN.'/'])->postJson(self::ORIGIN.'/api/auth/register', $payload)->assertStatus(419);

        $s = $this->spaSession();
        $this->spa($s)->postJson(self::ORIGIN.'/api/auth/register', $payload)->assertCreated()->assertJsonMissingPath('user.password');
        $this->spa($s)->postJson(self::ORIGIN.'/api/auth/login', ['email' => 'tester@example.com', 'password' => 'wrong-pass-1'])->assertStatus(422);
        $this->spa($s)->postJson(self::ORIGIN.'/api/auth/login', ['email' => 'tester@example.com', 'password' => 'abcd1234xyz'])
            ->assertOk()->assertJsonPath('user.email', 'tester@example.com');
        $this->assertSame(2, DB::table('user_heroes')->count());   // 시작 영웅 지급
    }

    public function test_일반유저는_어드민에_접근할_수_없고_관리자는_가능하다(): void
    {
        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum')->getJson('/api/admin/users')->assertStatus(403);

        // 관리자 생성은 커맨드로만(비밀번호는 숨김 프롬프트)
        $this->artisan('game:make-admin', ['email' => 'admin@example.com'])
            ->expectsQuestion('비밀번호 (8자 이상, 영문+숫자)', 'adminpass123')
            ->expectsQuestion('비밀번호 확인', 'adminpass123')
            ->assertSuccessful();
        $admin = User::where('email', 'admin@example.com')->first();
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/users')->assertOk();
    }
}
