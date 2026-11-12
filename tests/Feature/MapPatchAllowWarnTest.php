<?php

namespace Tests\Feature;

use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** game:apply-map-patch --allow-existing-warn: 시각 전용 패치는 기존 WARN 맵도 통과, 플래그 없으면 거부, 지형 변경은 거부. */
class MapPatchAllowWarnTest extends TestCase
{
    use RefreshDatabase;

    private string $file = 'zz_patch_allowwarn_test.json';

    protected function tearDown(): void
    {
        is_file(database_path('data/'.$this->file)) && unlink(database_path('data/'.$this->file));
        parent::tearDown();
    }

    public function test_기존_WARN_맵은_플래그가_있고_시각_전용일_때만_통과(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $checker = new MapChecker((new GameData)->rules());
        $m = null;
        foreach (DB::table('maps')->orderBy('id')->get() as $row) {
            $r = $checker->check(['code' => $row->code, 'width' => $row->width, 'height' => $row->height, 'tiles' => json_decode($row->tiles, true),
                'spawns' => json_decode($row->spawns, true), 'deploy_zones' => json_decode($row->deploy_zones, true), 'known_isolated' => (json_decode((string) $row->meta, true) ?: [])['known_isolated'] ?? []]);
            $levels = array_column($r, 1);
            if (in_array('WARN', $levels, true) && ! in_array('ERROR', $levels, true)) {
                $m = $row;
                break;
            }
        }
        $m ?: $this->markTestSkipped('WARN 만 있는 시드 맵 없음');
        $tiles = json_decode($m->tiles, true);
        $write = fn (array $it) => file_put_contents(database_path('data/'.$this->file), json_encode(['items' => [$it]]));
        $visual = ['code' => $m->code, 'culture' => 'eu', 'meta' => ['redesign' => 'x']];

        $write($visual);
        $this->artisan('game:apply-map-patch', ['--path' => $this->file])->assertFailed();   // 플래그 없음: 현행 거부
        $this->artisan('game:apply-map-patch', ['--path' => $this->file, '--allow-existing-warn' => true])->assertSuccessful();

        $tiles[0] = strrev($tiles[0]) === $tiles[0] ? $tiles[0].'' : strrev($tiles[0]);   // 지형 변경
        $write($visual + ['tiles' => $tiles]);
        $tiles === json_decode($m->tiles, true) || $this->artisan('game:apply-map-patch', ['--path' => $this->file, '--allow-existing-warn' => true])->assertFailed();
        $write(['code' => $m->code, 'rules' => ['x' => 1]]);
        $this->artisan('game:apply-map-patch', ['--path' => $this->file, '--allow-existing-warn' => true])->assertFailed();   // 게임플레이 키
    }
}
