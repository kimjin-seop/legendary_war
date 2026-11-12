<?php

namespace Tests\Feature;

use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class TerrainAndMapCheckTest extends TestCase
{
    use RefreshDatabase;

    public function test_확장_지형이_시드되고_기본_맵_검증이_통과한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $syms = DB::table('terrains')->pluck('symbol', 'code')->all();
        foreach (['shallows' => 's', 'bridge' => 'b', 'road' => 'r', 'swamp' => 'x', 'snow_desert' => 'n', 'cliff' => 'k', 'wall' => 'W', 'village' => 'v'] as $code => $sym) {
            $this->assertSame($sym, $syms[$code] ?? null);
        }
        $mod = fn (string $t, string $mt) => DB::table('terrain_modifiers')->join('terrains', 'terrains.id', '=', 'terrain_modifiers.terrain_id')->where(['terrains.code' => $t, 'move_type' => $mt])->first(['move_cost', 'def_pct']);
        $this->assertNull($mod('swamp', 'mounted')->move_cost);       // 늪: 기병 불가
        $this->assertSame(1, (int) $mod('cliff', 'flying')->move_cost); // 절벽: 비행만
        $this->assertNull($mod('wall', 'flying')->move_cost);         // 성벽: 전부 불가
        $this->artisan('game:map-check', ['--map' => 'river_01', '--strict' => true])->assertSuccessful();
    }

    public function test_맵_검증기는_새_지형_샘플은_통과시키고_결함_맵은_ERROR로_잡는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $checker = new MapChecker((new GameData)->rules());
        $map = json_decode(file_get_contents(base_path('tests/fixtures/maps/sample_terrain.json')), true);
        $levels = fn (array $m) => array_count_values(array_column($checker->check($m), 1));
        $this->assertArrayNotHasKey('ERROR', $levels($map));
        // 정의 안 된 지형 문자
        $bad = $map;
        $bad['tiles'][0] = 'pprpppZv';
        $this->assertSame(1, $levels($bad)['ERROR']);
        // 성벽으로 진영을 완전히 차단 -> 도달 불가(foot/mounted)
        $wall = $map;
        $wall['tiles'] = array_map(fn ($row) => substr($row, 0, 3).'W'.substr($row, 4), $map['tiles']);
        $this->assertGreaterThanOrEqual(2, $levels($wall)['ERROR']);
        // 배치 영역 겹침
        $ov = $map;
        $ov['deploy_zones']['b'][] = [0, 0];
        $this->assertContains('ERROR', array_column(array_filter($checker->check($ov), fn ($r) => $r[0] === '배치 영역 겹침'), 1));
    }

    public function test_known_isolated_로_기록된_고립_칸은_WARN_대신_INFO로_인정된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $checker = new MapChecker((new GameData)->rules());
        $map = json_decode(file_get_contents(base_path('tests/fixtures/maps/sample_terrain.json')), true);
        // 성벽 W 로 (0,y) 한 칸을 둘러싸 닫힌 칸을 만든다
        $iso = fn (array $m) => array_values(array_filter($checker->check($m), fn ($r) => $r[0] === '고립 영역'))[0][1];
        $y = count($map['tiles']) - 1;
        $map['tiles'][$y] = 'p'.'W'.substr($map['tiles'][$y], 2);
        $map['tiles'][$y - 1] = 'W'.substr($map['tiles'][$y - 1], 1);
        $this->assertSame('WARN', $iso($map));
        $map['known_isolated'] = [[0, $y], [3, 2]];   // (3,2) 는 픽스처 자체의 닫힌 늪 칸
        $this->assertSame('INFO', $iso($map));
    }
}
