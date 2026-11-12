<?php

namespace Tests\Feature;

use App\Support\FacingFlag;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Tests\TestCase;

class RulesApiAndFacingFlagTest extends TestCase
{
    use RefreshDatabase;

    public function test_rules_api는_로그인_없이_규칙표를_짧은_캐시로_제공한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $res = $this->getJson('/api/rules')->assertOk();
        $this->assertStringContainsString('max-age=60', $res->headers->get('Cache-Control'));
        $forest = collect($res->json('terrains'))->firstWhere('code', 'forest');
        $this->assertSame('f', $forest['symbol']);
        $this->assertArrayHasKey('naval', $forest['modifiers']);
        $this->assertArrayNotHasKey('heavy', $forest['modifiers']);   // 병종 v2: heavy 이동 보정 폐지
        $this->assertNull(collect($res->json('terrains'))->firstWhere('code', 'wall')['modifiers']['flying']['cost']);
        $sword = collect($res->json('unit_types'))->firstWhere('code', 'sword');
        $this->assertEqualsCanonicalizing(['code', 'name', 'move', 'range_min', 'range_max', 'hp', 'atk', 'def', 'move_type', 'heal', 'cost', 'hero_troop'], array_keys($sword));
        $this->assertSame('보병', $sword['name']);
        $types = collect($res->json('unit_types'))->keyBy('code');
        $this->assertSame('sword', $types['heavy']['alias_of']);   // 퇴역 병종 별칭(진행 중 전투 유닛 표시 호환)
        $this->assertFalse($types['monster']['hero_troop']);
        $this->assertSame(1.25, (float) $res->json('matchups.cavalry.archer'));   // 9x9 상성표
        $this->assertArrayNotHasKey('heavy', $res->json('matchups'));
        $this->assertArrayHasKey('second_atk_pct', $res->json('rules'));
        $this->assertSame(30.0, (float) $res->json('rules.mage_def_ignore_pct'));   // 병종 v2 E1/E2 값 노출(FE 예측 일치용)
        $this->assertSame(1.5, (float) $res->json('rules.assassin_facing_mult.back'));
    }

    public function test_qa_facing_플래그는_local_testing_한정이며_production에서는_무시된다(): void
    {
        config(['game.rules.facing' => false]);
        $this->assertFalse(FacingFlag::forUser(7));
        Cache::forever(FacingFlag::key(7), 1);
        $this->assertTrue(FacingFlag::forUser(7));      // testing 환경
        $this->assertFalse(FacingFlag::forUser(8));     // 다른 사용자는 영향 없음
        $this->app['env'] = 'production';
        $this->assertFalse(FacingFlag::forUser(7));     // production은 플래그를 읽지 않음
        $this->artisan('game:qa-account', ['--facing' => true])->assertFailed();
    }
}
