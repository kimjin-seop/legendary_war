<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class AlternateActivationFlowTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;
    use \Tests\Concerns\PlacesForcedHeroes;

    public function test_교대_행동_스테이지_전투_봇이_1부대씩_처리하고_라운드가_진행된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        config(['game.rules.alternate_activation' => true, 'game.rules.squad' => true, 'game.rules.alt_implicit_activate' => false]);   // 엄격 모드(activate 필수) 검증
        $r = $this->postJson('/api/guests', ['nickname' => 'alt'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $id = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $heroes = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $this->putDeployment($h, $id, [
            ['user_hero_id' => $heroes[0], 'x' => 2, 'y' => 3], ['user_hero_id' => $heroes[1], 'x' => 1, 'y' => 3],
        ])->assertOk();
        $v = $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.alternate', true)->json('battle');
        $this->assertSame('a', $v['alt']['side']);
        $this->assertNull($v['alt']['active_squad']);

        $post = fn (array $a) => $this->withHeaders($h)->postJson("/api/battles/$id/actions", $a);
        $post(['type' => 'end_turn'])->assertStatus(422);   // 교대 on에서는 end_turn 불가(invalid_action)
        $post(['type' => 'move', 'unit_id' => 'a0', 'x' => 2, 'y' => 3])->assertStatus(409)->assertJsonPath('error.code', 'squad_locked');
        $post(['type' => 'activate', 'squad_id' => 'a0'])->assertOk()->assertJsonPath('battle.alt.active_squad', 'a0');
        $res = $post(['type' => 'end_activation'])->assertOk();   // 플레이어 종료 -> 봇 1부대 처리 -> 다시 플레이어
        $this->assertContains('activation_start', array_column(array_filter($res->json('events'), fn ($e) => ($e['side'] ?? null) === 'b'), 'type'));
        $this->assertSame('a', $res->json('battle.alt.side'));

        // 라운드가 넘어가거나 전투가 끝날 때까지 매번 첫 ready 부대를 활성화 후 종료(에러 없이 진행되어야 함)
        for ($i = 0; $i < 40 && $res->json('battle.status') === 'in_progress' && $res->json('battle.round') < 2; $i++) {
            $ready = collect($res->json('battle.alt.squads'))->first(fn ($s) => $s['side'] === 'a' && $s['status'] === 'ready');
            $this->assertNotNull($ready);
            $post(['type' => 'activate', 'squad_id' => $ready['id']])->assertOk();
            $res = $post(['type' => 'end_activation'])->assertOk();
        }
        $this->assertTrue($res->json('battle.status') !== 'in_progress' || $res->json('battle.round') === 2);
    }

    public function test_시뮬레이터가_교대_행동_전투를_끝까지_돌리고_지표를_채운다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        $data = app(\App\Services\GameData::class);
        $heroes = array_values($data->heroes());
        $presets = [];
        foreach ($data->presets() as $p) {
            $presets[$p['hero_id']] = $p['units'];
        }
        $spec = fn ($h) => ['hero' => $h, 'level' => 5, 'troops' => $presets[$h['id']] ?? ['sword', 'spear', 'archer']];
        foreach ([false, true] as $squad) {
            $duel = new \App\Game\Duel($data->engine(['alternate_activation' => true, 'squad' => $squad]), $data->map($data->defaultMapId()), 3.0, 30, config('game.bot'));
            $r = $duel->run(7, $spec($heroes[0]), $spec($heroes[1]));
            $this->assertGreaterThan(0, $r['activations']);
            $this->assertGreaterThanOrEqual(1, $r['rounds']);
            $this->assertSame('a', $r['first_side']);
        }
    }
}
