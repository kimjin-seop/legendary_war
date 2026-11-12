<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** game:clone-map: dry-run 불변, --apply 시 복제+스테이지 map_id 교체, 거부 조건, 복제 맵에 apply-map-patch 가능. */
class MapCloneCommandTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        foreach (glob(storage_path('app/map_patch_backup/clone_*_zz_clone_test.json')) ?: [] as $f) {
            unlink($f);
        }
        is_file(database_path('data/zz_clone_patch_test.json')) && unlink(database_path('data/zz_clone_patch_test.json'));
        foreach (glob(storage_path('app/map_patch_backup/maps_*_zz_clone_patch_test.json')) ?: [] as $f) {
            unlink($f);
        }
        parent::tearDown();
    }

    public function test_복제_적용_거부_후속_패치(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $st = DB::table('stages')->orderBy('id')->first();
        $other = DB::table('stages')->where('map_id', '!=', $st->map_id)->first();
        $from = DB::table('maps')->where('id', $st->map_id)->first();
        $args = ['--from' => $from->code, '--to' => 'zz_clone_test', '--stages' => $st->code];

        $this->artisan('game:clone-map', $args)->assertSuccessful();   // dry-run
        $this->assertFalse(DB::table('maps')->where('code', 'zz_clone_test')->exists());

        $this->artisan('game:clone-map', $args + ['--apply' => true])->assertSuccessful();
        $new = DB::table('maps')->where('code', 'zz_clone_test')->first();
        $this->assertSame($from->tiles, $new->tiles);
        $this->assertSame($from->meta, $new->meta);
        $this->assertSame((int) $new->id, (int) DB::table('stages')->where('id', $st->id)->value('map_id'));
        $this->assertCount(1, glob(storage_path('app/map_patch_backup/clone_*_zz_clone_test.json')));

        // 거부: code 중복 / 스테이지가 원본 맵을 쓰지 않음(이미 교체됨, 다른 맵 스테이지)
        $this->artisan('game:clone-map', $args + ['--apply' => true])->assertFailed();
        $this->artisan('game:clone-map', ['--from' => $from->code, '--to' => 'zz_clone_test2', '--stages' => $other->code])->assertFailed();
        $this->assertFalse(DB::table('maps')->where('code', 'zz_clone_test2')->exists());

        // 복제 맵에 apply-map-patch
        file_put_contents(database_path('data/zz_clone_patch_test.json'), json_encode(['items' => [['code' => 'zz_clone_test', 'tiles' => json_decode($new->tiles, true), 'culture' => 'eu']]]));
        $this->artisan('game:apply-map-patch', ['--path' => 'zz_clone_patch_test.json', '--apply' => true])->assertSuccessful();
        $this->assertSame('eu', json_decode(DB::table('maps')->where('code', 'zz_clone_test')->value('meta'), true)['culture']);
        $this->assertSame($from->meta, DB::table('maps')->where('id', $from->id)->value('meta'));   // 원본 불변
    }
}
