<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** game:apply-map-patch: dry-run 기본, --apply 시 백업 후 갱신, 잘못된 painted_bg 맵은 건너뜀. */
class MapPatchCommandTest extends TestCase
{
    use RefreshDatabase;

    private string $file;

    protected function tearDown(): void
    {
        is_file(database_path('data/'.$this->file)) && unlink(database_path('data/'.$this->file));
        foreach (glob(storage_path('app/map_patch_backup/maps_*_zz_patch_test.json')) ?: [] as $f) {
            unlink($f);
        }
        parent::tearDown();
    }

    public function test_dry_run은_쓰지_않고_apply는_백업_후_갱신_불량은_건너뜀(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->file = 'zz_patch_test.json';
        $m = DB::table('maps')->orderBy('id')->first();
        $tiles = json_decode($m->tiles, true);
        $write = fn (array $it) => file_put_contents(database_path('data/'.$this->file), json_encode(['items' => [$it]]));

        $write(['code' => $m->code, 'tiles' => $tiles, 'culture' => 'eu', 'props' => [['key' => 'k', 'x' => 1, 'y' => 1]],
            'painted_bg' => ['src' => 'assets/maps/x.png', 'tile_px' => 64]]);
        $this->artisan('game:apply-map-patch', ['--path' => $this->file])->assertSuccessful();
        $this->assertSame($m->meta, DB::table('maps')->where('id', $m->id)->value('meta'));   // dry-run 불변

        $this->artisan('game:apply-map-patch', ['--path' => $this->file, '--apply' => true])->assertSuccessful();
        $meta = json_decode(DB::table('maps')->where('id', $m->id)->value('meta'), true);
        $this->assertSame('eu', $meta['culture']);
        $this->assertCount(1, glob(storage_path('app/map_patch_backup/maps_*_zz_patch_test.json')));

        $write(['code' => $m->code, 'tiles' => $tiles, 'painted_bg' => ['src' => 'http://evil/x.png', 'tile_px' => 64]]);
        $this->artisan('game:apply-map-patch', ['--path' => $this->file, '--apply' => true])->assertFailed();
        $this->assertSame('eu', json_decode(DB::table('maps')->where('id', $m->id)->value('meta'), true)['culture']);
        $this->assertSame('assets/maps/x.png', json_decode(DB::table('maps')->where('id', $m->id)->value('meta'), true)['painted_bg']['src']);   // 불량 패치 미반영

        // _base_tiles_md5: 현재 tiles 와 같으면 통과, 다르면 탈락
        $write(['code' => $m->code, 'tiles' => $tiles, '_base_tiles_md5' => md5(implode('', $tiles))]);
        $this->artisan('game:apply-map-patch', ['--path' => $this->file])->assertSuccessful();
        $write(['code' => $m->code, 'tiles' => $tiles, '_base_tiles_md5' => str_repeat('0', 32)]);
        $this->artisan('game:apply-map-patch', ['--path' => $this->file])->assertFailed();
    }
}
