<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GuestUpgradeTest extends TestCase
{
    use RefreshDatabase;

    public function test_게스트_승격은_데이터를_유지하고_기존_토큰을_무효화한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'Upgrader'])->assertCreated();
        $token = $r->json('guest_token');
        $id = $r->json('user.id');
        $heroes = DB::table('user_heroes')->where('user_id', $id)->count();
        $gold = (int) DB::table('wallets')->where('user_id', $id)->where('currency_code', 'gold')->value('balance');
        $this->assertGreaterThan(0, $heroes);

        $payload = ['name' => 'Upgraded', 'email' => 'up@example.com', 'password' => 'abcd1234xyz', 'password_confirmation' => 'abcd1234xyz', 'terms_accepted' => true];
        $this->withHeaders(['X-Guest-Token' => $token])->postJson('/api/auth/register', $payload)
            ->assertCreated()->assertJsonPath('user.id', $id)->assertJsonPath('user.is_guest', false);

        $this->assertSame($heroes, DB::table('user_heroes')->where('user_id', $id)->count());
        $this->assertSame($gold, (int) DB::table('wallets')->where('user_id', $id)->where('currency_code', 'gold')->value('balance'));
        $this->assertSame(1, DB::table('users')->count());
        $this->withHeaders(['X-Guest-Token' => $token])->getJson('/api/profile')->assertStatus(401);   // 기존 게스트 토큰 무효

        // 같은 이메일 중복 가입: 422 email_taken(일반 메시지)
        $this->postJson('/api/auth/register', ['name' => 'Another'] + $payload)->assertStatus(422)->assertJsonPath('error.code', 'email_taken');
    }
}
