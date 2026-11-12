<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 유저(진영) 단위 턴 페이즈 + 턴 입력 제한시간(60초): 핵심 동작만 */
class TurnTimerTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\PlacesForcedHeroes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
    }

    private function startBattle(): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'timer'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $id = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $this->putDeployment($h, $id, [
            ['user_hero_id' => $party[0], 'x' => 2, 'y' => 3], ['user_hero_id' => $party[1], 'x' => 1, 'y' => 3],
        ])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.status', 'in_progress');

        return [$h, $id];
    }

    public function test_스테이지_전투는_제한시간이_없다(): void
    {
        $this->assertFalse((bool) config('game.rules.alternate_activation'));
        [$h, $id] = $this->startBattle();
        $b = $this->withHeaders($h)->getJson("/api/battles/$id")->assertOk()->assertJsonPath('battle.alternate', false)->assertJsonPath('battle.turn_input_seconds', 0)->json('battle');
        $this->assertNull($b['turn_deadline']);
        $this->assertNull(DB::table('battles')->where('id', $id)->value('turn_deadline_at'));

        $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'wait', 'unit_id' => 'a0'])->assertOk()->assertJsonPath('turn_timed_out', false);
        $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk()->assertJsonPath('battle.turn', 2)->assertJsonPath('battle.current_side', 'a');
        $this->withHeaders($h)->getJson("/api/battles/$id/units/a0/moves")->assertOk()->assertJsonPath('turn_input_seconds', 0)->assertJsonPath('turn_deadline', null);
    }

    public function test_스테이지_전투는_남은_마감이_경과해도_자동_종료되지_않는다(): void
    {
        [$h, $id] = $this->startBattle();
        DB::table('battles')->where('id', $id)->update(['turn_deadline_at' => now()->subSeconds(30)]);   // 구 전투(마감 잔존) 호환

        $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'move', 'unit_id' => 'a1', 'x' => 2, 'y' => 4])->assertOk()->assertJsonPath('turn_timed_out', false);   // a0=필수 주인공, a1=첫 배치 파티 영웅(2,3)
        $b = $this->withHeaders($h)->getJson("/api/battles/$id")->assertOk()->json('battle');
        $this->assertSame(1, $b['turn']);   // 자동 end_turn 없음
        $this->assertNull($b['turn_deadline']);
    }
}
