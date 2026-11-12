<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 전장 프리셋 20종: 시더 멱등, GET /api/maps, 방 생성 맵 규칙(PvP 비공정 422, random). */
class MapPackTest extends TestCase
{
    use RefreshDatabase;

    private function h(): array
    {
        $this->artisan('game:seed')->assertSuccessful();

        return ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => 'mappack'])->assertCreated()->json('guest_token')];
    }

    public function test_시더_멱등과_기존_맵_불변(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $legacy = DB::table('maps')->whereNotLike('code', 'pk_%')->orderBy('id')->pluck('id', 'code')->all();
        $this->assertCount(12, $legacy);   // 기본 9 + 튜토리얼 개편 3맵(su_tut_*)
        $this->assertSame(20, DB::table('maps')->where('code', 'like', 'pk_%')->count());
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed', ['--force' => true])->assertSuccessful();
        $this->assertSame(32, DB::table('maps')->count());
        $this->assertSame($legacy, DB::table('maps')->whereNotLike('code', 'pk_%')->orderBy('id')->pluck('id', 'code')->all());
        $this->assertNotNull(DB::table('maps')->where('code', 'pk_01_plain_clash')->value('meta'));
    }

    public function test_맵_목록과_필터(): void
    {
        $h = $this->h();
        $solo = $this->withHeaders($h)->getJson('/api/maps?mode=solo')->assertOk();
        $codes = collect($solo->json('maps'))->pluck('code');
        $this->assertTrue($codes->contains('pk_06_fortress_siege'));          // 비대칭은 solo 노출
        $this->assertFalse($codes->contains('pk_08_snow_ridge'));              // 보류
        $this->assertTrue($codes->contains('river_01'));                       // 레거시 호환
        $this->assertNotNull($solo->json('default_code'));
        $this->assertArrayNotHasKey('tiles', $solo->json('maps.0'));
        $pvp = collect($this->withHeaders($h)->getJson('/api/maps?mode=pvp')->json('maps'))->pluck('code');
        $this->assertFalse($pvp->contains('pk_06_fortress_siege'));
        $this->assertFalse($pvp->contains('pk_18_wall_breach'));
        $s = $this->withHeaders($h)->getJson('/api/maps?mode=pvp&size_class=S&include_tiles=1')->assertOk()->json('maps');
        $this->assertCount(3, collect($s)->filter(fn ($m) => str_starts_with($m['code'], 'pk_'))->all());   // 소형 3종
        $this->assertSame(12, count($s[0]['tiles']));
        $this->assertNotEmpty($this->withHeaders($h)->getJson('/api/maps?per_side=6')->json('maps'));
        $this->withHeaders($h)->getJson('/api/maps/pk_01_plain_clash/preview')->assertOk()->assertJsonPath('width', 16);
        $this->withHeaders($h)->getJson('/api/maps/pk_08_snow_ridge/preview')->assertNotFound();
        $this->withHeaders(['X-Guest-Token' => ''])->getJson('/api/maps')->assertUnauthorized();   // withHeaders는 누적되므로 토큰을 비운다
    }

    public function test_decor_village_style이_배치_전투_방_응답에_노출되고_없으면_생략된다(): void
    {
        $h = $this->h();
        $this->withoutMiddleware(\Illuminate\Routing\Middleware\ThrottleRequests::class);
        $meta = json_decode(DB::table('maps')->where('code', 'pk_01_plain_clash')->value('meta'), true);
        $decor = [['prefab' => 'tree_a', 'x' => 1, 'y' => 2, 'flip' => true]];
        DB::table('maps')->where('code', 'pk_01_plain_clash')->update(['meta' => json_encode(array_merge($meta, ['decor' => $decor, 'village_style' => 'camp']))]);
        $room = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'pk_01_plain_clash'])->assertCreated();
        $room->assertJsonPath('room.decor.0.prefab', 'tree_a')->assertJsonPath('room.village_style', 'camp');
        $code = $room->json('room.code');
        $this->withHeaders($h)->postJson("/api/rooms/$code/start")->assertOk();
        $this->withHeaders($h)->getJson("/api/rooms/$code/deployment")->assertOk()->assertJsonPath('decor.0.prefab', 'tree_a')->assertJsonPath('village_style', 'camp');
        $dep = $this->withHeaders($h)->getJson("/api/rooms/$code/deployment")->json('deploy_zone');
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $need = max(1, min(\App\Services\MapCatalog::partySizeFor((int) DB::table('maps')->where('code', 'pk_01_plain_clash')->value('id'))['party_size'], count($party)));   // 방 대전: 맵 크기별 고정 출전수
        $placements = [];
        for ($i = 0; $i < $need; $i++) {
            $placements[] = ['user_hero_id' => $party[$i], 'x' => $dep[$i][0], 'y' => $dep[$i][1]];
        }
        $this->withHeaders($h)->putJson("/api/rooms/$code/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($h)->postJson("/api/rooms/$code/confirm")->assertOk();
        $this->withHeaders($h)->getJson("/api/rooms/$code")->assertJsonPath('battle.decor.0.prefab', 'tree_a')->assertJsonPath('battle.village_style', 'camp');
        $this->withHeaders($h)->getJson('/api/maps?include_tiles=1')->assertJsonPath('maps.'.collect($this->withHeaders($h)->getJson('/api/maps')->json('maps'))->search(fn ($m) => $m['code'] === 'pk_01_plain_clash').'.village_style', 'camp');
        $this->withHeaders($h)->getJson("/api/rooms/$code")->assertOk();
        $this->withHeaders($h)->postJson("/api/rooms/$code/leave")->assertOk();
        $r2 = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'river_01'])->assertCreated()->json('room');   // 기존 맵: 키 없음
        $this->assertArrayNotHasKey('decor', $r2);
        $this->assertArrayNotHasKey('village_style', $r2);
    }

    public function test_방_생성_맵_규칙(): void
    {
        $h = $this->h();
        $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'pvp', 'map_code' => 'pk_06_fortress_siege'])->assertStatus(422)->assertJsonPath('error.code', 'map_not_allowed');
        $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'pvp', 'map_code' => 'pk_08_snow_ridge'])->assertStatus(422)->assertJsonPath('error.code', 'map_not_allowed');
        $r = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'pk_06_fortress_siege'])->assertCreated();
        $r->assertJsonPath('room.map_code', 'pk_06_fortress_siege');
        $this->withHeaders($h)->postJson('/api/rooms/'.$r->json('room.code').'/leave')->assertOk();
        for ($i = 0; $i < 5; $i++) {   // PvP random은 항상 공정 프리셋
            $p = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'pvp', 'map_code' => 'random'])->assertCreated();
            $this->assertNotContains($p->json('room.map_code'), ['pk_06_fortress_siege', 'pk_18_wall_breach', 'pk_08_snow_ridge']);
            $this->withHeaders($h)->postJson('/api/rooms/'.$p->json('room.code').'/leave')->assertOk();
        }
    }
}
