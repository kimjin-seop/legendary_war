<?php

namespace Tests\Feature;

use App\Game\EnemyV3Adapter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 이름 있는 NPC 보강(additions) 병합 + 5개 스테이지 치환 시 유닛 총수 불변(핵심 동작만). */
class NamedCharactersSeedTest extends TestCase
{
    use RefreshDatabase;

    private const ENEMY = 'stages_ch1_enemy_v3.json,stages_legacy6_enemy_v3.json';

    private function units(string $code): int
    {
        return EnemyV3Adapter::countUnits(json_decode(DB::table('stages')->where('code', $code)->value('enemy_squad'), true));
    }

    public function test_로스터_병합과_치환_스테이지_유닛총수_불변(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--enemy' => self::ENEMY, '--with-npc' => true])->assertSuccessful();
        $codes = ['stage_02', 'stage_03', 'stage_04', 'ch1_s8', 'ch1_s10'];
        $before = array_map(fn ($c) => $this->units($c), $codes);
        $noReplace = DB::table('stages')->where('code', 'ch1_s3')->value('enemy_squad');

        $this->artisan('game:seed-imjin10', ['--enemy' => self::ENEMY, '--with-npc' => true, '--named' => true])->assertSuccessful();

        $this->assertSame($before, array_map(fn ($c) => $this->units($c), $codes));
        $this->assertStringContainsString('npc_yeom_mo', DB::table('stages')->where('code', 'stage_02')->value('enemy_squad'));
        $this->assertSame($noReplace, DB::table('stages')->where('code', 'ch1_s3')->value('enemy_squad'));   // 치환 금지 스테이지 불변
        $this->assertTrue(DB::table('heroes')->where('code', 'npc_dunois')->where('campaign_only', true)->exists());   // additions 로스터 행
    }
}
