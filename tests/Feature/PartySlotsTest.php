<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PartySlotsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
    }

    public function test_레벨에_따라_슬롯_상한이_적용된다(): void
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'slotter'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $uid = $r->json('user.id');
        $this->withHeaders($h)->getJson('/api/profile')->assertJsonPath('profile.max_party_slots', 2)->assertJsonPath('profile.max_cost', 16);

        $mine = DB::table('user_heroes')->where('user_id', $uid)->pluck('id')->all();
        $third = DB::table('user_heroes')->insertGetId([
            'user_id' => $uid, 'hero_id' => DB::table('heroes')->orderBy('cost')->value('id'), 'level' => 1, 'exp' => 0,
            'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now(),
        ]);
        $ids = [...$mine, $third];

        // Lv1: 시작 영웅 2명(영웅 코스트 합 10 + 부대, 상한 16)은 허용, 3명은 슬롯 초과
        $this->withHeaders($h)->putJson('/api/party', ['user_hero_ids' => $mine])->assertOk();
        $this->withHeaders($h)->putJson('/api/party', ['user_hero_ids' => $ids])->assertStatus(422)->assertJsonPath('error.code', 'too_many_slots');

        // Lv10: 슬롯 3 (코스트 상한도 함께 올라 3명 허용)
        DB::table('users')->where('id', $uid)->update(['level' => 10]);
        $this->withHeaders($h)->getJson('/api/profile')->assertJsonPath('profile.max_party_slots', 3);
        $this->withHeaders($h)->putJson('/api/party', ['user_hero_ids' => $ids])->assertOk();
    }
}
