<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ProfileRulesAndQaTest extends TestCase
{
    use RefreshDatabase;

    public function test_프로필_응답에_규칙_안내값이_config_기준으로_포함된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        config(['game.rules.second_atk_pct' => 3, 'game.rules.facing' => true]);
        $r = $this->postJson('/api/guests', ['nickname' => 'rules'])->assertCreated();
        $res = $this->withHeaders(['X-Guest-Token' => $r->json('guest_token')])->getJson('/api/profile')->assertOk();
        $res->assertJsonPath('rules.second_atk_pct', 3)->assertJsonPath('rules.facing', true)->assertJsonPath('rules.facing_cap', 1.8);
        $this->assertEquals(1.15, $res->json('rules.facing_mult.side'));
    }

    public function test_qa_계정_명령은_production에서_거부된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $before = DB::table('users')->count();
        $this->app['env'] = 'production';
        $this->artisan('game:qa-account')->assertFailed();
        $this->assertSame($before, DB::table('users')->count());
    }
}
