<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 서가 시드(ch21·ch22): dry-run 무변경, ch21·ch22 16행·NPC 31행(ch21_22 21 + ch23_24 10) 적재, 멱등(재실행 무변경), 기존 행 불변. */
class SeedShelfTest extends TestCase
{
    use RefreshDatabase;

    private const CODES = ['ch21_s1', 'ch21_s2', 'ch21_s3', 'ch21_s4', 'ch21_s5', 'ch21_s6', 'ch21_s7', 'ch21_s8', 'ch22_s1', 'ch22_s2', 'ch22_s3', 'ch22_s4', 'ch22_s5', 'ch22_s6', 'ch22_s7', 'ch22_s8'];

    private const NPCS = ['npc_baidar', 'npc_kadan', 'npc_batu', 'npc_henry_ii_pious', 'npc_babur', 'npc_ustad_ali_quli', 'npc_humayun', 'npc_ibrahim_lodi', 'npc_mongol_vanguard', 'npc_mieszko_ii_opole', 'npc_wlodzimierz_krakow', 'npc_pakoslaw_sandomierz', 'npc_wenceslas_i_bohemia', 'npc_ugrin_csak', 'npc_dawlat_khan_lodi', 'npc_bihar_khan_lodi', 'npc_hamid_khan', 'npc_hasan_khan_mewati', 'npc_rana_sanga', 'npc_mahmud_lodi', 'npc_mustafa_rumi'];

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        foreach (['npc_cart_1', 'npc_cart_2'] as $cart) {   // ch21_s8 이 참조하는 수레 NPC 는 game:seed-main --act=3 --with-npc 가 만든다(여기서는 기존 NPC 행을 복제한 자리표시)
            $row = (array) DB::table('heroes')->where('code', 'npc_manabe_samanojo')->first();
            unset($row['id']);
            DB::table('heroes')->insert(['code' => $cart, 'name_en' => $cart] + $row);
        }
        $this->artisan('game:seed-maps-pack')->assertSuccessful();
        $this->artisan('game:seed-maps-pack', ['--path' => 'maps_pack20_v2.json'])->assertSuccessful();
    }

    /** stages_ch21_*.json / stages_ch22_*.json 의 서로 다른 ch21·ch22 스테이지 코드 수 */
    private function expectedStageCount(): int
    {
        $codes = [];
        foreach (array_merge(glob(database_path('data/stages_ch21_*.json')) ?: [], glob(database_path('data/stages_ch22_*.json')) ?: []) as $f) {
            if (str_contains(basename($f), '_ext')) {
                continue;   // 확장 파일은 --with-ext 일 때만 시드된다
            }
            foreach ((json_decode((string) file_get_contents($f), true)['items'] ?? []) as $it) {
                preg_match('/^ch2[12]_s\d+$/', (string) ($it['code'] ?? '')) && $codes[$it['code']] = true;
            }
        }

        return count($codes);
    }

    /** 서가 로스터 파일(npc_roster_shelf_ch*.json, *_stats/_additions 제외)의 코드 중 시드 전 heroes 에 없던 것의 수 */
    private function expectedNewNpcCount(array $heroCodesBefore): int
    {
        $new = [];
        foreach (glob(database_path('data/npc_roster_shelf_*.json')) ?: [] as $f) {
            if (str_ends_with($f, '_stats.json') || str_ends_with($f, '_additions.json') || str_contains(basename($f), '_ext')) {
                continue;
            }
            foreach ((json_decode((string) file_get_contents($f), true)['items'] ?? []) as $n) {
                isset($n['code']) && ! in_array($n['code'], $heroCodesBefore, true) && $new[$n['code']] = true;
            }
        }

        return count($new);
    }

    private function snap(): array
    {
        $strip = fn ($rows) => $rows->map(fn ($r) => array_diff_key((array) $r, ['updated_at' => 1]))->toJson();   // updated_at 은 실행 시각이라 제외

        return [$strip(DB::table('stages')->whereIn('code', self::CODES)->orderBy('code')->get()),
            DB::table('maps')->orderBy('code')->pluck('meta', 'code')->toJson(), $strip(DB::table('heroes')->whereIn('code', self::NPCS)->orderBy('code')->get())];
    }

    public function test_dry_run은_변경_없고_실행은_데이터_파일의_스테이지와_NPC를_적재(): void
    {
        $stagesBefore = DB::table('stages')->count();
        $heroesBefore = DB::table('heroes')->count();
        $heroCodesBefore = DB::table('heroes')->pluck('code')->all();
        $before = $this->snap();
        $this->artisan('game:seed-shelf', ['--dry-run' => true, '--with-npc' => true])->assertSuccessful();
        $this->assertSame($before, $this->snap());

        $this->artisan('game:seed-shelf', ['--with-npc' => true])->assertSuccessful();
        $this->assertSame($stagesBefore + $this->expectedStageCount(), DB::table('stages')->count());   // 데이터 기반: stages_ch21_*/ch22_*.json 의 서로 다른 스테이지 수(확장해도 고정 수치 갱신 불필요)
        $this->assertSame($heroesBefore + $this->expectedNewNpcCount($heroCodesBefore), DB::table('heroes')->count());
        $id = DB::table('stages')->pluck('id', 'code');
        $this->assertSame((int) $id['ch21_s4'], (int) DB::table('stages')->where('code', 'ch21_s5')->value('prerequisite_stage_id'));
        $this->assertSame((int) $id['ch21_s2'], (int) DB::table('stages')->where('code', 'ch21_s4')->value('prerequisite_stage_id'));   // 파일 병합 + 시간순 선행 체인
        $this->assertNull(DB::table('stages')->where('code', 'ch21_s1')->value('prerequisite_stage_id'));
        $this->assertSame((int) $id['ch21_s7'], (int) DB::table('stages')->where('code', 'ch21_s8')->value('prerequisite_stage_id'));
        $this->assertSame((int) $id['ch22_s3'], (int) DB::table('stages')->where('code', 'ch22_s5')->value('prerequisite_stage_id'));   // 선택 스테이지(s2·s4)를 건너뛴 체인
        $this->assertSame(22, (int) DB::table('stages')->where('code', 'ch22_s5')->value('chapter'));
        $this->assertNotEmpty(json_decode(DB::table('stages')->where('code', 'ch22_s5')->value('rules'), true)['cues']);
    }

    public function test_멱등이고_기존_행은_불변(): void
    {
        $others = fn () => DB::table('stages')->whereNotIn('code', self::CODES)->orderBy('code')->get()->toJson();
        $before = $others();
        $this->artisan('game:seed-shelf', ['--with-npc' => true])->assertSuccessful();
        $first = $this->snap();
        $this->artisan('game:seed-shelf', ['--with-npc' => true])->assertSuccessful();
        $this->assertSame($first, $this->snap());
        $this->artisan('game:seed-shelf', ['--with-npc' => true, '--update' => true])->assertSuccessful();
        $this->assertSame($first, $this->snap());
        $this->assertSame($before, $others());
    }
}
