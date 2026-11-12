<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * 전장 프리셋 20종 스모크: 방 생성 -> 배치 -> 확정(전투 생성) -> 봇/교대 행동 몇 턴이 에러 없이 도는지만 확인(밸런스 아님).
 * solo는 pk_* 20종 전부(교대 행동 on/off 각 1판), PvP는 공정 맵에서 두 사람이 end_turn 교대.
 */
class MapPackSmokeTest extends TestCase
{
    use RefreshDatabase;

    private function guest(string $n): array
    {
        return ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => $n])->assertCreated()->json('guest_token')];
    }

    private function deployAndConfirm(array $h, string $room): void
    {
        $dep = $this->withHeaders($h)->getJson("/api/rooms/$room/deployment")->assertOk();
        $zone = $dep->json('deploy_zone');
        $party = $dep->json('default_party');
        $placements = [];
        foreach ($party as $i => $uh) {
            $placements[] = ['user_hero_id' => $uh, 'x' => $zone[$i * 3][0], 'y' => $zone[$i * 3][1]];   // 3칸 간격으로 분산(부대 자동 배치 여지)
        }
        $this->withHeaders($h)->putJson("/api/rooms/$room/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($h)->postJson("/api/rooms/$room/confirm")->assertOk();
    }

    public function test_맵_20종_solo_교대행동_off_on_스모크(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);   // 20종 반복 생성이 rate limit에 걸리지 않게
        $m8 = json_decode(DB::table('maps')->where('code', 'pk_08_snow_ridge')->value('meta'), true);   // 보류 맵도 엔진 스모크 대상: 테스트 DB에서만 해제
        DB::table('maps')->where('code', 'pk_08_snow_ridge')->update(['meta' => json_encode(['pvp_listing' => 'default'] + $m8)]);
        $maps = DB::table('maps')->where('code', 'like', 'pk_%')->orderBy('id')->pluck('code')->all();
        $this->assertCount(20, $maps);
        foreach ([false, true] as $alt) {
            config(['game.rules.alternate_activation' => $alt]);
            $h = $this->guest('smoke'.(int) $alt);
            foreach ($maps as $code) {
                $room = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => $code])->assertCreated()->json('room.code');
                $this->withHeaders($h)->postJson("/api/rooms/$room/start")->assertOk();
                $this->deployAndConfirm($h, $room);
                $st = $this->withHeaders($h)->getJson("/api/rooms/$room")->assertOk();
                $this->assertSame('in_progress', $st->json('room.status'), $code);
                if (! $alt) {
                    for ($i = 0; $i < 3; $i++) {   // 플레이어 턴 종료 -> 봇 턴(이동·공격 포함)
                        $this->withHeaders($h)->postJson("/api/rooms/$room/actions", ['type' => 'end_turn'])->assertOk();
                    }
                } else {
                    for ($i = 0; $i < 2; $i++) {
                        $this->withHeaders($h)->postJson("/api/rooms/$room/actions", ['type' => 'activate', 'squad_id' => 'a'.$i])->assertOk();
                        $this->withHeaders($h)->postJson("/api/rooms/$room/actions", ['type' => 'end_activation'])->assertOk();
                    }
                }
                $this->withHeaders($h)->postJson("/api/rooms/$room/leave")->assertOk();
            }
        }
    }

    public function test_공정_맵_pvp_배치_전투_교대_스모크(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        config(['game.rules.alternate_activation' => false]);
        $host = $this->guest('pvph');
        $guest = $this->guest('pvpg');
        $maps = DB::table('maps')->where('code', 'like', 'pk_%')->orderBy('id')->pluck('code')->all();
        $n = 0;
        foreach ($maps as $code) {
            $ok = $this->withHeaders($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'private', 'map_code' => $code]);
            if ($ok->status() === 422) {
                continue;   // 비공정/보류 맵(pk_06·pk_08·pk_18)
            }
            $ok->assertCreated();
            $room = $ok->json('room.code');
            $this->withHeaders($guest)->postJson('/api/rooms/join', ['code' => $room])->assertOk();
            $this->withHeaders($guest)->postJson("/api/rooms/$room/ready", ['ready' => true])->assertOk();
            $this->withHeaders($host)->postJson("/api/rooms/$room/start")->assertOk();
            $this->deployAndConfirm($host, $room);
            $this->deployAndConfirm($guest, $room);
            $this->withHeaders($host)->getJson("/api/rooms/$room")->assertJsonPath('room.status', 'in_progress');
            $this->withHeaders($host)->postJson("/api/rooms/$room/actions", ['type' => 'end_turn'])->assertOk();
            $this->withHeaders($guest)->postJson("/api/rooms/$room/actions", ['type' => 'end_turn'])->assertOk();
            $this->withHeaders($host)->postJson("/api/rooms/$room/leave")->assertOk();
            $n++;
        }
        $this->assertSame(17, $n);
    }
}
