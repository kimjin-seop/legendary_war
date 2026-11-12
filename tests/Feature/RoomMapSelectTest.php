<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoomMapSelectTest extends TestCase
{
    use RefreshDatabase;

    private function token(string $nick): array
    {
        $this->artisan('game:seed')->assertSuccessful();

        return ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated()->json('guest_token')];
    }

    public function test_방_생성_시_맵_선택_검증과_맵_정보_노출(): void
    {
        $h = $this->token('mapsel');
        $default = DB::table('maps')->orderBy('id')->first();
        $r = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public', 'map_code' => 'castle_01'])->assertCreated();
        $r->assertJsonPath('room.map_code', 'castle_01');
        $this->assertGreaterThanOrEqual(16, $r->json('room.map_width'));
        $code = $r->json('room.code');
        $list = $this->withHeaders($h)->getJson('/api/rooms')->assertOk()->json();
        $row = collect($list['rooms'] ?? $list)->firstWhere('code', $code);
        $this->assertSame('castle_01', $row['map_code']);                                        // 공개 방 목록에 map_code/크기
        $this->withHeaders($h)->postJson("/api/rooms/$code/leave")->assertOk();
        $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'nope'])->assertStatus(422)->assertJsonPath('error.code', 'invalid_map');
        $p = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'pvp', 'map_code' => 'random'])->assertCreated();   // PvP random = pvp_fair 후보 중 서버 추첨
        $this->assertStringStartsWith('pk_', $p->json('room.map_code'));
        $this->withHeaders($h)->postJson('/api/rooms/'.$p->json('room.code').'/leave')->assertOk();
        $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'river_01_small'])->assertStatus(422);        // 허용 목록 밖
        $s = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'random'])->assertCreated();
        $this->assertNotEmpty($s->json('room.map_code'));   // 레거시 8종 + 프리셋 중 서버 추첨
        $this->withHeaders($h)->postJson('/api/rooms/'.$s->json('room.code').'/leave')->assertOk();
        $d = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated();
        $this->assertSame($default->code, $d->json('room.map_code'));                            // 생략 시 기본 맵
        // 맵별 rules는 GameData::map 경유(방 전투 initialState 입력)로 전달된다
        DB::table('maps')->where('code', 'castle_01')->update(['rules' => json_encode(['second_atk_pct' => 0])]);
        $this->assertSame(['second_atk_pct' => 0], (new GameData)->map((int) DB::table('maps')->where('code', 'castle_01')->value('id'))['rules']);
    }
}
