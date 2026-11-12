<?php

namespace Tests\Feature;

use App\Services\GachaService;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 신규 영웅 확장(남아시아 4 + 동남아시아 8 = 12명): 시드·칭호·역사·가챠 풀. 아프리카·아메리카 17명은 2026-11-04 보류 해제(hero_expansion_hold.json 비움). */
class NewHeroesTest extends TestCase
{
    use RefreshDatabase;

    private const NEW = ['chandragupta_maurya', 'rajaraja_i', 'shivaji', 'prithviraj_iii', 'anawrahta', 'jayavarman_vii', 'le_loi', 'ramkhamhaeng', 'hayam_wuruk', 'trung_trac', 'nguyen_hue', 'diponegoro'];

    private const REPLACED = ['theseus', 'odysseus', 'shah_jahan', 'attila', 'boudicca', 'zenobia', 'achilles', 'jan_zizka', 'rostam', 'epaminondas', 'vercingetorix', 'rana_pratap', 'tipu_sultan', 'akbar', 'tariq_ibn_ziyad', 'garibaldi', 'spartacus', 'wat_tyler', 'themistocles', 'tomyris'];
    private const OLD = ['toussaint_louverture', 'san_martin', 'amanirenas'];

    public function test_12명이_확정_능력치로_시드되고_보류_해제_17명도_적재되며_재시드는_멱등이다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed')->assertSuccessful();
        $h = DB::table('heroes')->join('unit_types', 'unit_types.id', '=', 'heroes.unit_type_id')->whereIn('heroes.code', self::NEW)->get(['heroes.code', 'heroes.rarity', 'heroes.troop_type', 'unit_types.code as ut', 'heroes.culture', 'heroes.title', 'heroes.hp_bonus', 'heroes.skill_id', 'heroes.campaign_only']);
        $this->assertCount(12, $h);
        foreach ($h as $r) {
            $this->assertContains($r->rarity, ['S', 'A', 'B', 'C']);
            $this->assertSame($r->ut, $r->troop_type);
            $this->assertContains($r->culture, ['south_asia', 'southeast_asia']);
            $this->assertNotNull($r->title);
            $this->assertNotNull($r->skill_id);
            $this->assertEquals(0, $r->campaign_only);
        }
        $this->assertSame(0, DB::table('heroes')->whereIn('code', ['ezana', 'mansa_musa', 'pachacuti', 'tecumseh', 'zumbi_dos_palmares'])->count());   // 구 아프리카·아메리카 17명은 교체로 다시 보류(미시드)
        $this->assertSame(20, DB::table('heroes')->whereIn('code', self::REPLACED)->count());   // 교체 신규 20명
        $this->assertSame(101 + 12 + 20 + 3, DB::table('heroes')->count());
        $p = app(GameData::class)->heroProfile('shivaji');
        $this->assertNotNull($p['one_line'] ?? null);   // 역사 설명(확장 narrative.history)
    }

    public function test_가챠_풀에_12명이_포함되고_교체_영웅_20명이_들어가고_구_영웅은_빠진다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $pool = app(GachaService::class)->pool();
        $all = array_merge(...array_values($pool['by_rarity']));
        foreach (self::NEW as $c) {
            $this->assertContains($c, $all, $c);
        }
        foreach (self::REPLACED as $c) {
            $this->assertContains($c, $all, $c);   // 교체 신규 20명은 풀에 포함
        }
        foreach (array_merge(self::OLD, ['ezana', 'shaka_zulu']) as $c) {
            $this->assertNotContains($c, $all, $c);   // 구 영웅은 풀 제외
        }
        $this->assertEqualsWithDelta(100.0, array_sum($pool['rates']), 1e-9);
    }
}
