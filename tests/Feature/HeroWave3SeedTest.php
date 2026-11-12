<?php

namespace Tests\Feature;

use App\Services\GachaService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 3차 영웅 확장 적재: dry-run 은 무변경, apply 는 승격(campaign_only 해제)+신규 생성+가챠 풀 편입, 신규 중복은 거부. */
class HeroWave3SeedTest extends TestCase
{
    use RefreshDatabase;

    private function fixtures(): void
    {
        $dir = sys_get_temp_dir().'/wave3_'.uniqid();
        mkdir($dir);
        file_put_contents("$dir/c.json", json_encode(['candidates' => [
            ['code' => 'npc_jebe', 'name_ko' => '제베', 'source' => 'promote', 'tier' => 'core', 'culture' => 'steppe', 'has_history' => true],
            ['code' => 'w3_test_hero', 'name_ko' => '시험 영웅', 'name_en' => 'W3 Test', 'source' => 'new', 'tier' => 'core', 'culture' => 'europe', 'has_history' => false],
        ]], JSON_UNESCAPED_UNICODE));
        file_put_contents("$dir/n.json", json_encode(['skills' => ['w3_test_skill' => ['name_ko' => '시험 방어', 'flavor' => '성벽 뒤에서 버텼다.', 'desc_ko' => '참고용 수치 설명']]], JSON_UNESCAPED_UNICODE));
        file_put_contents("$dir/s.json", json_encode(['new_skills' => [
            ['code' => 'w3_test_skill', 'type' => 'passive', 'template' => 'T_TERRAIN_DEF', 'params' => ['tier' => 'weak', 'effects' => [['def_pct' => 25, 'when' => ['terrain' => ['castle']]]]], 'rarity_min' => 'C'],
        ], 'items' => [
            ['code' => 'npc_jebe'],   // stats 가 있으면 항목이 있는 후보만 대상
            ['code' => 'w3_test_hero', 'unit_type' => 'sword', 'rarity' => 'C', 'cost' => 2, 'hp_bonus' => 10, 'atk_bonus' => 2, 'def_bonus' => 2,
                'growth_hp_pct' => 3, 'growth_atk_pct' => 3, 'growth_def_pct' => 3, 'skills' => ['w3_test_skill']],
        ]]));
        config(['game.hero_wave3' => ['candidates' => "$dir/c.json", 'stats' => "$dir/s.json", 'gap_fill' => "$dir/none.json", 'skill_names' => "$dir/n.json"]]);
    }

    public function test_dry_run은_무변경이고_apply는_승격과_신규를_풀에_편입한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        DB::table('heroes')->where('code', 'npc_jebe')->update(['campaign_only' => true]);
        $this->fixtures();

        $this->artisan('game:seed-hero-wave3')->assertSuccessful();   // dry-run
        $this->assertTrue((bool) DB::table('heroes')->where('code', 'npc_jebe')->value('campaign_only'));
        $this->assertFalse(DB::table('heroes')->where('code', 'w3_test_hero')->exists());

        $this->artisan('game:seed-hero-wave3', ['--apply' => true])->assertSuccessful();
        $this->assertFalse((bool) DB::table('heroes')->where('code', 'npc_jebe')->value('campaign_only'));
        $new = DB::table('heroes')->where('code', 'w3_test_hero')->first();
        $this->assertSame(10, (int) $new->hp_bonus);
        $this->assertSame('europe', $new->culture);
        $this->assertSame(1, DB::table('hero_skills')->where('hero_id', $new->id)->count());
        $sk = DB::table('skills')->where('code', 'w3_test_skill')->first();   // 송서사 flavor 저장, desc_ko 는 description(참고용)
        $this->assertSame('성벽 뒤에서 버텼다.', $sk->flavor);
        $this->assertSame('시험 방어', $sk->name);
        $this->assertSame(0, (int) $sk->needs_verify);
        $all = collect(app(GachaService::class)->pool()['by_rarity'])->flatten()->all();
        $this->assertContains('npc_jebe', $all);
        $this->assertContains('w3_test_hero', $all);

        $this->artisan('game:seed-hero-wave3', ['--apply' => true])->assertSuccessful();   // 멱등 재실행
        $this->assertSame(1, DB::table('heroes')->where('code', 'w3_test_hero')->count());

        DB::table('heroes')->where('code', 'w3_test_hero')->update(['note' => null]);   // 외부에서 만든 동일 코드 = 중복 -> 거부
        $this->artisan('game:seed-hero-wave3', ['--apply' => true])->assertFailed();
    }
}
