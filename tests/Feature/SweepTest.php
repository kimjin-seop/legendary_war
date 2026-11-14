<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 소탕 핵심: 3성 미달 거부, 보상 지급·멱등, 일일 한도 공유(초과분 미실행). */
class SweepTest extends TestCase
{
    use RefreshDatabase;

    public function test_수동_3성_스테이지만_소탕되고_멱등이며_일일_한도를_공유한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'sw'])->assertCreated();
        $uid = (int) $r->json('user.id');
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $stage = DB::table('stages')->where('reward_gold', '>', 0)->orderBy('id')->first();
        $gold0 = (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance');
        $sweep = fn (string $rid, int $n) => $this->withHeaders($h)->postJson("/api/stages/{$stage->id}/sweep", ['count' => $n, 'request_id' => $rid]);

        $sweep('req-0000001', 1)->assertStatus(422)->assertJsonPath('error.code', 'sweep_not_available');   // 미클리어
        DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $stage->id, 'best_stars' => 2, 'clear_count' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $sweep('req-0000001', 1)->assertStatus(422)->assertJsonPath('error.code', 'sweep_not_available');   // 2성
        DB::table('user_stage_progress')->where('user_id', $uid)->update(['best_stars' => 3]);

        config(['game.reward_scale.stage_daily_cap' => 2]);
        $perRun = (int) floor((int) $stage->reward_gold * (float) config('game.reward_scale.star_mult.3') * (float) config('game.reward_scale.retry_mult'));   // 소탕 1회 골드 = 보상 x 3성 배율 x 재도전 배율(레벨 곡선 v2: 0.5)
        $a = $sweep('req-0000002', 3)->assertOk()->assertJsonPath('executed', 2)->assertJsonPath('reward_blocked', 'stage_daily_cap')->assertJsonPath('replay', false);
        $this->assertSame($perRun * 2, $a->json('gold'));
        $sweep('req-0000002', 3)->assertOk()->assertJsonPath('replay', true)->assertJsonPath('executed', 2);   // 멱등
        $this->assertSame($gold0 + $perRun * 2, (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance'));
        $sweep('req-0000003', 1)->assertStatus(422)->assertJsonPath('error.code', 'stage_daily_cap');   // 한도 소진
        $this->assertSame(1, DB::table('stage_sweeps')->where('user_id', $uid)->count());
        $this->getJson('/api/rules')->assertOk()->assertJsonPath('sweep.max_count', (int) config('game.sweep.max_count'))->assertJsonPath('sweep.enabled', true);
        $this->assertGreaterThan(0, $a->json('profile.gold'));   // 갱신된 프로필 포함

        // 공유 한도가 무제한(0)이어도 소탕 자체 상한(game.sweep.daily_cap)은 항상 적용, count 경계
        config(['game.reward_scale.stage_daily_cap' => 0, 'game.sweep.daily_cap' => 5, 'game.sweep.max_count' => 5]);
        $sweep('req-0000004', 6)->assertStatus(422);   // max_count 초과
        $sweep('req-0000005', 0)->assertStatus(422);
        $sweep('req-0000006', 5)->assertOk()->assertJsonPath('executed', 3)->assertJsonPath('reward_blocked', 'stage_daily_cap');   // 이미 소진된 공유 카운터와 무관하게 소탕 상한 5-2(이미 실행 2)
        $sweep('req-0000007', 1)->assertStatus(422)->assertJsonPath('error.code', 'stage_daily_cap');
    }
    public function test_유저_일일_소탕_총량은_모든_스테이지_합산으로_제한된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'swt'])->assertCreated();
        $uid = (int) $r->json('user.id');
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $stages = DB::table('stages')->orderBy('id')->limit(2)->get();
        foreach ($stages as $st) {
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $st->id, 'best_stars' => 3, 'clear_count' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        config(['game.sweep.daily_total' => 4, 'game.sweep.daily_cap' => 0, 'game.reward_scale.stage_daily_cap' => 0]);
        $sweep = fn (int $sid, string $rid, int $n) => $this->withHeaders($h)->postJson("/api/stages/{$sid}/sweep", ['count' => $n, 'request_id' => $rid]);

        $sweep($stages[0]->id, 'req-tot-0001', 3)->assertOk()->assertJsonPath('executed', 3);
        $sweep($stages[1]->id, 'req-tot-0002', 3)->assertOk()->assertJsonPath('executed', 1)->assertJsonPath('reward_blocked', 'sweep_daily_total');   // 다른 스테이지여도 잔여 1
        $sweep($stages[0]->id, 'req-tot-0003', 1)->assertStatus(422)->assertJsonPath('error.code', 'sweep_daily_total');
    }
}
