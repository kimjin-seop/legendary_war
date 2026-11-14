<?php

namespace Tests\Feature;

use App\Support\ContentDump;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class ContentSeedAllTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        ContentDump::$dirOverride = null;
        parent::tearDown();
    }

    public function test_빈_DB에_적재되고_두번째는_비어있지_않아_중단한다(): void
    {
        $this->artisan('game:seed-all')->assertSuccessful();
        $m = json_decode(file_get_contents(ContentDump::dir().'/manifest.json'), true);
        foreach ($m['tables'] as $t => $info) {
            $this->assertSame($info['rows'], DB::table($t)->count(), $t);
        }
        $heroes = DB::table('heroes')->count();
        $this->artisan('game:seed-all')->assertFailed();
        $this->assertSame($heroes, DB::table('heroes')->count());
    }

    public function test_manifest_컬럼이_스키마와_다르면_중단하고_DB는_비어있다(): void
    {
        $tmp = sys_get_temp_dir().'/cd_'.uniqid();
        mkdir($tmp);
        foreach (glob(ContentDump::dir().'/*') as $f) {
            copy($f, $tmp.'/'.basename($f));
        }
        $m = json_decode(file_get_contents($tmp.'/manifest.json'), true);
        $m['tables']['heroes']['columns'][] = 'ghost_column';
        file_put_contents($tmp.'/manifest.json', json_encode($m));
        ContentDump::$dirOverride = $tmp;

        $this->artisan('game:seed-all')->assertFailed();
        $this->assertSame(0, DB::table('heroes')->count());

        array_map('unlink', glob($tmp.'/*'));
        rmdir($tmp);
    }
}
