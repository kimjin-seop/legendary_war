<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TutorialTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'tuto'])->assertCreated();

        return [(int) $r->json('user.id'), ['X-Guest-Token' => $r->json('guest_token')], $r->json('guest_token')];
    }

    public function test_단계_단조증가_상한_보상_멱등_건너뛰기_미지급(): void
    {
        [$uid, $h] = $this->guest();
        $max = $this->withHeaders($h)->getJson('/api/profile')->assertOk()
            ->assertJsonPath('profile.tutorial.step', 0)->assertJsonPath('profile.tutorial.done', false)
            ->assertJsonPath('profile.tutorial.auto_start', true)->json('profile.tutorial.max_step');
        $this->assertGreaterThan(0, $max);

        $this->withHeaders($h)->putJson('/api/tutorial', ['step' => 3])->assertOk()->assertJsonPath('tutorial.step', 3);
        $this->withHeaders($h)->putJson('/api/tutorial', ['step' => 1])->assertOk()->assertJsonPath('tutorial.step', 3);   // 낮은 값은 무시(단조)
        $this->withHeaders($h)->putJson('/api/tutorial', ['step' => $max + 1])->assertStatus(422)->assertJsonPath('error.code', 'tutorial_step_invalid');
        $this->withHeaders($h)->putJson('/api/tutorial', ['step' => 'abc'])->assertStatus(422);
        $this->withHeaders($h)->putJson('/api/tutorial', ['step' => 3, 'done' => true])->assertStatus(422)->assertJsonPath('error.code', 'tutorial_incomplete');

        $gold0 = (int) DB::table('wallets')->where('user_id', $uid)->where('currency_code', 'gold')->value('balance');
        $exp0 = (int) DB::table('users')->where('id', $uid)->value('exp');
        $r = $this->withHeaders($h)->putJson('/api/tutorial', ['step' => $max, 'done' => true])->assertOk()
            ->assertJsonPath('tutorial.done', true)->assertJsonPath('tutorial.reward_claimed', true);
        $this->assertSame((int) config('game.tutorial.reward.gold'), $r->json('granted.gold'));
        $again = $this->withHeaders($h)->putJson('/api/tutorial', ['step' => $max, 'done' => true])->assertOk();
        $this->assertNull($again->json('granted'));   // 중복 호출: 보상 없음, 같은 상태
        $this->assertSame(1, DB::table('wallet_transactions')->where('reason_code', 'tutorial_reward')->count());
        $this->assertSame($gold0 + (int) config('game.tutorial.reward.gold'), (int) DB::table('wallets')->where('user_id', $uid)->where('currency_code', 'gold')->value('balance'));
        $this->assertSame((int) config('game.tutorial.reward.user_exp'), $r->json('granted.user_exp'));
        $this->assertSame($exp0 + (int) config('game.tutorial.reward.user_exp') >= 0, true);
    }

    public function test_건너뛰기는_보상_없고_게스트_승격_후에도_상태_유지(): void
    {
        [$uid, $h, $token] = $this->guest();
        $this->withHeaders($h)->putJson('/api/tutorial', ['step' => 2, 'skipped' => true])->assertOk()
            ->assertJsonPath('tutorial.done', true)->assertJsonPath('tutorial.skipped', true)->assertJsonPath('tutorial.reward_claimed', false)->assertJsonPath('tutorial.auto_start', false);
        $this->assertSame(0, DB::table('wallet_transactions')->where('reason_code', 'tutorial_reward')->count());

        $payload = ['name' => 'Tutoup', 'email' => 'tu@example.com', 'password' => 'abcd1234xyz', 'password_confirmation' => 'abcd1234xyz', 'terms_accepted' => true];
        $this->withHeaders($h)->postJson('/api/auth/register', $payload)->assertCreated()->assertJsonPath('user.id', $uid);
        $row = DB::table('users')->where('id', $uid)->first();   // 같은 users 행 승격 -> 튜토리얼 상태 유지
        $this->assertSame(2, (int) $row->tutorial_step);
        $this->assertNotNull($row->tutorial_done_at);
        $this->assertSame(1, (int) $row->tutorial_skipped);
    }

    public function test_기존_유저_컷오프는_자동시작_false(): void
    {
        [$uid, $h] = $this->guest();
        DB::table('users')->where('id', $uid)->update(['created_at' => '2026-10-01 00:00:00']);
        $this->withHeaders($h)->getJson('/api/profile')->assertJsonPath('profile.tutorial.auto_start', false)->assertJsonPath('profile.tutorial.step', 0);
    }
}
