<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** POST /api/battles/{id}/forecast: 타인 전투 거부(404 battle_not_found), 본인 전투는 조회 전용(state 불변) */
class BattleForecastRouteTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\PlacesForcedHeroes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
    }

    private function guest(string $name): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => $name])->assertCreated();

        return ['X-Guest-Token' => $r->json('guest_token')];
    }

    public function test_타인_전투는_거부되고_본인_전투는_state를_바꾸지_않는다(): void
    {
        $h = $this->guest('fc1');
        $id = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $pro = $this->withHeaders($h)->getJson("/api/battles/$id/deployment")->json('forced.0.user_hero_id');
        $this->putDeployment($h, $id, [['user_hero_id' => $pro, 'x' => 2, 'y' => 7], ['user_hero_id' => $party[0], 'x' => 2, 'y' => 2], ['user_hero_id' => $party[1], 'x' => 2, 'y' => 11]])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
        $body = ['unit_id' => 'a1', 'target_id' => 'b1'];

        $other = $this->guest('fc2');
        $this->withHeaders($other)->postJson("/api/battles/$id/forecast", $body)->assertStatus(404)->assertJsonPath('error.code', 'battle_not_found');

        $before = DB::table('battles')->where('id', $id)->value('state');
        $res = $this->withHeaders($h)->postJson("/api/battles/$id/forecast", $body);
        $this->assertNotSame('battle_not_found', $res->json('error.code'));   // 본인 전투는 조회 단계 통과(사거리 밖 등 엔진 오류는 허용)
        $this->assertSame($before, DB::table('battles')->where('id', $id)->value('state'));
    }
}
