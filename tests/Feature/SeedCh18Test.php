<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** ch18 시드: 8행 생성·선행 체인·점령 목표, 멱등, 기존 ch1/stage 시드 회귀 없음. */
class SeedCh18Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
    }

    private function snap(): array
    {
        return [DB::table('stages')->where('code', 'like', 'ch18_%')->orderBy('code')->get(['code', 'map_id', 'objective', 'triggers', 'enemy_squad', 'prerequisite_stage_id', 'enemy_level_offset'])->toJson(),
            DB::table('maps')->orderBy('code')->pluck('meta', 'code')->toJson()];
    }

    public function test_스테이지_생성과_선행_체인과_점령_목표(): void
    {
        $this->artisan('game:seed-ch18', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame(0, DB::table('stages')->where('code', 'like', 'ch18_%')->count());
        $this->artisan('game:seed-ch18')->assertSuccessful();
        $id = DB::table('stages')->where('code', 'like', 'ch18_%')->pluck('id', 'code');
        $this->assertCount(count(json_decode((string) file_get_contents(database_path('data/stages_ch18_mongol.json')), true)['items']), $id);   // 데이터 기반(8~12스테이지)
        $pre = DB::table('stages')->where('code', 'like', 'ch18_%')->pluck('prerequisite_stage_id', 'code');
        $this->assertNull($pre['ch18_s1']);
        $this->assertSame($id['ch18_s2'], (int) $pre['ch18_s4']);
        $this->assertSame($id['ch18_s5'], (int) $pre['ch18_s7']);
        $obj = json_decode(DB::table('stages')->where('code', 'ch18_s5')->value('objective'), true);
        $this->assertSame('capture', $obj['type']);
        $src = collect(json_decode((string) file_get_contents(database_path('data/stages_ch18_mongol.json')), true)['items'])->firstWhere('code', 'ch18_s5');
        $this->assertSame($src['objective']['points'], $obj['points']);   // 데이터 기반(맵 확장 오프셋으로 좌표가 바뀌어도 고정 수치 갱신 불필요)
        $this->assertSame(18, (int) DB::table('stages')->where('code', 'ch18_s8')->value('chapter'));
        $this->assertNotEmpty(json_decode(DB::table('stages')->where('code', 'ch18_s7')->value('triggers'), true));
    }

    public function test_멱등이고_기존_스테이지는_불변(): void
    {
        $before = DB::table('stages')->where('code', 'not like', 'ch18_%')->orderBy('code')->get()->toJson();
        $this->artisan('game:seed-ch18')->assertSuccessful();
        $first = $this->snap();
        $this->artisan('game:seed-ch18')->assertSuccessful();
        $this->artisan('game:seed-ch18', ['--force' => true])->assertSuccessful();
        $this->assertSame($first, $this->snap());
        $this->assertSame($before, DB::table('stages')->where('code', 'not like', 'ch18_%')->orderBy('code')->get()->toJson());
    }
}
