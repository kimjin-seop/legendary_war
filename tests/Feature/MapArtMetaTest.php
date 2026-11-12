<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 맵 개편 meta(props·painted_bg·culture) 노출과 painted_bg.src 경로 검증. */
class MapArtMetaTest extends TestCase
{
    use RefreshDatabase;

    public function test_art_필드_노출과_painted_bg_경로_검증(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $m = DB::table('maps')->orderBy('id')->first();
        $meta = json_decode((string) $m->meta, true) ?: [];
        $set = fn (array $x) => DB::table('maps')->where('id', $m->id)->update(['meta' => json_encode($meta + $x)]);

        $set(['props' => [['key' => 'kr_giwa_k_white_m', 'x' => 5.5, 'y' => 6]], 'culture' => 'jp',
            'painted_bg' => ['src' => 'assets/maps/a/bg_1.png', 'tile_px' => 64, 'filter' => 'nearest', 'evil' => 1]]);
        $e = (new GameData)->mapExtras((int) $m->id);
        $this->assertSame('jp', $e['culture']);
        $this->assertSame('kr_giwa_k_white_m', $e['props'][0]['key']);
        $this->assertSame(['src' => '/assets/maps/a/bg_1.png', 'tile_px' => 64, 'filter' => 'nearest'], $e['painted_bg']);

        foreach (['http://x.com/a.png', '//x.com/a.png', '/assets/maps/../../.env.png', '/assets/other/a.png', 'assets/maps/a.svg'] as $bad) {
            $set(['painted_bg' => ['src' => $bad, 'tile_px' => 64]]);
            $this->assertArrayNotHasKey('painted_bg', (new GameData)->mapExtras((int) $m->id), $bad);
        }

        // 확장 키: 정상은 통과, 불량은 해당 키만 생략
        $set(['gates' => [[9, 9], ['x' => 6, 'y' => 13, 'dir' => 'n']], 'castle_render' => 'kr_giwa_k_xl', 'ground_tone' => ['color' => '#aa8844', 'alpha' => 0.3], 'wall_style' => 'east']);
        $e = (new GameData)->mapExtras((int) $m->id);
        $this->assertSame([[9, 9], ['x' => 6, 'y' => 13, 'dir' => 'n']], $e['gates']);
        $this->assertSame(['kr_giwa_k_xl', 'east'], [$e['castle_render'], $e['wall_style']]);
        $this->assertSame(0.3, $e['ground_tone']['alpha']);
        $set(['gates' => [[9, 'a']], 'castle_render' => '../x', 'ground_tone' => 'purple', 'wall_style' => str_repeat('a', 40)]);
        $e = (new GameData)->mapExtras((int) $m->id);
        foreach (['gates', 'castle_render', 'ground_tone', 'wall_style'] as $k) {
            $this->assertArrayNotHasKey($k, $e, $k);
        }

        // 옥포 변환 패치의 meta 가 서버 노출 검증을 모두 통과하는지(파일이 있을 때)
        $f = database_path('data/map_patch_ch1_okpo_v1.json');
        if (is_file($f)) {
            $pm = json_decode(file_get_contents($f), true)['items'][0]['meta'];
            $ex = GameData::artExtras($pm);
            foreach (['props', 'painted_bg', 'culture', 'gates', 'castle_render', 'ground_tone', 'wall_style'] as $k) {
                empty($pm[$k]) || $this->assertArrayHasKey($k, $ex, "okpo meta.{$k}");
            }
        }

        // pier_style: 정상 값 노출, 불량(길이 초과·경로 문자·비문자열)은 생략
        $set(['pier_style' => 'at47_pier_stone']);
        $this->assertSame('at47_pier_stone', (new GameData)->mapExtras((int) $m->id)['pier_style']);
        foreach ([str_repeat('a', 40), '../x', ['stone']] as $bad) {
            $set(['pier_style' => $bad]);
            $this->assertArrayNotHasKey('pier_style', (new GameData)->mapExtras((int) $m->id));
        }

        $set([]);   // 키 없으면 응답 불변
        $e = (new GameData)->mapExtras((int) $m->id);
        $this->assertArrayNotHasKey('props', $e);
        $this->assertArrayNotHasKey('culture', $e);
    }
}
