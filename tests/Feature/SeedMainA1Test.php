<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** game:seed-main: --dry-run 은 오류 없이 끝나고 DB 를 바꾸지 않는다(맵 파일 유무와 무관). 맵 파일이 없으면 실제 실행은 중단. */
class SeedMainA1Test extends TestCase
{
    use RefreshDatabase;

    public function test_dry_run_무변경_그리고_맵_파일_없으면_실실행_중단(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $before = DB::table('stages')->count();
        $this->artisan('game:seed-main', ['--dry-run' => true, '--with-npc' => true])->assertSuccessful();
        $this->assertSame($before, DB::table('stages')->count());
        $this->assertSame(0, DB::table('heroes')->where('code', 'npc_red_pen')->count());
        if (! is_file(database_path('data/maps_main_a1.json'))) {
            $this->artisan('game:seed-main')->assertFailed();
            $this->assertSame($before, DB::table('stages')->count());
        }
    }

    public function test_act2_적재는_ch101_s5를_선행으로_ch102_5행과_NPC_허준_합류를_만든다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-main', ['--with-npc' => true])->assertSuccessful();
        $before = DB::table('stages')->count();
        $this->artisan('game:seed-main', ['--act' => 2, '--with-npc' => true, '--dry-run' => true])->assertSuccessful();
        $this->assertSame($before, DB::table('stages')->count());
        $this->artisan('game:seed-main', ['--act' => 2, '--with-npc' => true])->assertSuccessful();
        $rows = DB::table('stages')->where('code', 'like', 'ch102_%')->orderBy('code')->get();
        $this->assertCount(5, $rows);
        $this->assertSame((int) DB::table('stages')->where('code', 'ch101_s5')->value('id'), (int) $rows[0]->prerequisite_stage_id);
        $this->assertSame(102, (int) $rows[4]->chapter);
        $this->assertSame([], json_decode($rows[4]->join_hero, true));   // 영웅은 뽑기로만 획득: join_hero 비활성(2026-11-08)
        $this->assertSame(4, DB::table('heroes')->whereIn('code', ['npc_bonggun', 'npc_sagong', 'npc_jimkkun', 'npc_dol_ajumeoni'])->count());
    }

    public function test_act3_적재는_ch102_s5를_선행으로_ch103_5행과_NPC_잔다르크_합류를_만든다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-main', ['--with-npc' => true])->assertSuccessful();
        $this->artisan('game:seed-main', ['--act' => 2, '--with-npc' => true])->assertSuccessful();
        $this->artisan('game:seed-main', ['--act' => 3, '--with-npc' => true])->assertSuccessful();
        $rows = DB::table('stages')->where('code', 'like', 'ch103_%')->orderBy('code')->get();
        $this->assertCount(5, $rows);
        $this->assertSame((int) DB::table('stages')->where('code', 'ch102_s5')->value('id'), (int) $rows[0]->prerequisite_stage_id);
        $this->assertSame([], json_decode($rows[4]->join_hero, true));   // 영웅은 뽑기로만 획득: join_hero 비활성(2026-11-08)
        $this->assertSame(5, DB::table('heroes')->whereIn('code', ['npc_mabu', 'npc_bobyeong', 'npc_baetsagong', 'npc_jjogi', 'npc_ilkkun'])->count());
    }

    public function test_act4_적재는_ch103_s5를_선행으로_ch104_5행과_살라딘_합류를_만든다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        foreach ([1, 2, 3, 4] as $act) {
            $this->artisan('game:seed-main', ['--act' => $act, '--with-npc' => true])->assertSuccessful();
        }
        $rows = DB::table('stages')->where('code', 'like', 'ch104_%')->orderBy('code')->get();
        $this->assertCount(5, $rows);
        $this->assertSame((int) DB::table('stages')->where('code', 'ch103_s5')->value('id'), (int) $rows[0]->prerequisite_stage_id);
        $this->assertSame([], json_decode($rows[1]->join_hero, true));   // 영웅은 뽑기로만 획득: join_hero 비활성(2026-11-08)
        $this->assertSame(1, DB::table('heroes')->where('code', 'npc_gilzabi')->count());
    }
}
