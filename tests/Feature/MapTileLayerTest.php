<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 맵 v2 tile_layer: --path 시드(dry-run/적용), preview에만 노출(목록 제외, 없는 맵은 키 생략), 크기 불일치 시 생략. */
class MapTileLayerTest extends TestCase
{
    use RefreshDatabase;

    public function test_v2_dry_run_통과와_허용_외_경로_거부(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $before = DB::table('maps')->where('code', 'pk_06_fortress_siege')->value('width');
        $this->artisan('game:seed-maps-pack', ['--path' => 'maps_pack20_v2.json', '--dry-run' => true])->assertSuccessful();
        $this->assertSame($before, DB::table('maps')->where('code', 'pk_06_fortress_siege')->value('width'));   // dry-run은 쓰지 않음
        $this->artisan('game:seed-maps-pack', ['--path' => '../../.env', '--dry-run' => true])->assertFailed();
    }

    public function test_tile_layer가_preview에만_노출되고_없는_맵은_키_생략(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $h = ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => 'tl'])->assertCreated()->json('guest_token')];
        $this->artisan('game:seed-maps-pack', ['--path' => 'maps_pack20_v2.json'])->assertSuccessful();

        $p = $this->withHeaders($h)->getJson('/api/maps/pk_06_fortress_siege/preview')->assertOk();
        $p->assertJsonPath('width', 28)->assertJsonPath('tile_layer.format', 'names-v1');
        $this->assertCount(20, $p->json('tile_layer.rows'));
        $this->assertNotEmpty($p->json('tile_layer.names'));

        $list = $this->withHeaders($h)->getJson('/api/maps')->assertOk()->json('maps');
        foreach ($list as $m) {
            $this->assertArrayNotHasKey('tile_layer', $m);
        }
        $legacy = DB::table('maps')->whereNotLike('code', 'pk_%')->orderBy('id')->first();
        $id = (int) $legacy->id;
        $this->assertArrayHasKey('tile_layer', (new GameData)->mapExtras($id));   // 레거시 맵도 임밸런 tile_layer 반영(game:seed 보충)
        // 크기가 다른 state(맵 갱신 전 진행 중 전투)에는 tile_layer 생략, 같으면 포함
        $pk = (int) DB::table('maps')->where('code', 'pk_06_fortress_siege')->value('id');
        $this->assertArrayNotHasKey('tile_layer', (new GameData)->mapExtras($pk, [24, 16]));
        $this->assertArrayHasKey('tile_layer', (new GameData)->mapExtras($pk, [28, 20]));
    }
}
