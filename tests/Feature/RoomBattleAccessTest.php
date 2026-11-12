<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoomBattleAccessTest extends TestCase
{
    use RefreshDatabase;

    private function as(string $token): static
    {
        return $this->withHeaders(['X-Guest-Token' => $token]);
    }

    private function deploy(string $token, string $code, array $coords): void
    {
        $party = $this->as($token)->getJson('/api/party')->json('party');
        $placements = [];
        foreach ($coords as $i => [$x, $y]) {
            $placements[] = ['user_hero_id' => $party[$i], 'x' => $x, 'y' => $y];
        }
        $this->as($token)->putJson("/api/rooms/$code/deployment", ['placements' => $placements])->assertOk();
        $this->as($token)->postJson("/api/rooms/$code/confirm")->assertOk();
    }

    public function test_방_전투는_battles_API로_접근할_수_없고_비턴_행동은_상태를_바꾸지_않는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $host = $this->postJson('/api/guests', ['nickname' => 'host'])->json('guest_token');
        $guest = $this->postJson('/api/guests', ['nickname' => 'guest'])->json('guest_token');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->json('room.code');
        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        $this->deploy($host, $code, $this->zoneCoords('a'));
        $this->deploy($guest, $code, $this->zoneCoords('b'));
        $battleId = DB::table('rooms')->where('code', $code)->value('battle_id');

        $snapshot = fn () => [json_encode(DB::table('battles')->where('id', $battleId)->first()), DB::table('battle_actions')->where('battle_id', $battleId)->count()];
        $before = $snapshot();

        foreach ([$host, $guest] as $t) {   // 방 전투는 단일 플레이 전투 경로로 조회/행동 불가
            $this->as($t)->getJson("/api/battles/$battleId")->assertNotFound();
            $this->as($t)->postJson("/api/battles/$battleId/actions", ['type' => 'end_turn'])->assertNotFound();
        }
        // pvp 비턴 플레이어(guest, side b)의 행동 거부
        $this->as($guest)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertStatus(409)->assertJsonPath('error.code', 'not_your_turn');

        $this->assertSame($before, $snapshot());
    }
}
