<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 시즌 전쟁 UI 개편용 추가 필드(기존 필드 유지): scenario_code, countries[].plaque/territory_faction_id, territories[].start_country/is_capital/defense */
class SeasonWarUiFieldsTest extends TestCase
{
    use RefreshDatabase;

    public function test_state와_map이_UI_추가_필드를_내려준다(): void
    {
        config(['war.allow_guests' => true]);
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('war:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'warui'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $st = $this->withHeaders($h)->getJson('/api/war/state')->assertOk()->assertJsonPath('scenario_code', 'imjin');
        $c = $st->json('countries.0');
        $this->assertArrayHasKey('plaque', $c);
        $this->assertArrayHasKey('territory_faction_id', $c);
        $this->assertArrayHasKey('member_count', $c);   // 기존 필드 유지
        $map = $this->withHeaders($h)->getJson('/api/war/map')->assertOk()->assertJsonPath('scenario_code', 'imjin');
        $t = collect($map->json('territories'))->firstWhere('code', 'hanyang');
        $this->assertSame(['joseon', true], [$t['start_country'], $t['is_capital']]);
        $this->assertSame(3 * (int) config('war.defender.level_per_defense'), $t['defense']['level']);
        $this->assertGreaterThanOrEqual(1, $t['defense']['max_heroes']);
        $this->assertArrayHasKey('attackable', $t);     // 기존 필드 유지
        // FE 후속: active / countries[].allies / me.rank
        $this->withHeaders($h)->getJson('/api/war/active')->assertOk()->assertJsonPath('active', true)->assertJsonPath('joined', false);
        $this->assertSame([['code' => 'ming', 'name' => '명', 'label' => '원군']], collect($st->json('countries'))->firstWhere('code', 'joseon')['allies']);
        $this->assertNull($st->json('me.rank'));
        $this->assertSame('원군', collect($map->json('countries'))->firstWhere('code', 'joseon')['allies'][0]['label']);
    }

    public function test_preview는_시즌_없이_시나리오_지도를_내려주고_없는_시나리오는_404(): void
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'warprev'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $this->withHeaders($h)->getJson('/api/war/active')->assertOk()->assertJsonPath('active', false);   // 활성 시즌 없음
        $p = $this->withHeaders($h)->getJson('/api/war/preview?scenario=imjin')->assertOk()->assertJsonPath('preview', true);
        $t = collect($p->json('territories'))->firstWhere('code', 'hanyang');
        $this->assertSame(['joseon', 'preview', true], [$t['owner']['code'], $t['attack_blocked_reason'], isset($t['lon'], $t['lat'])]);
        $this->assertCount(10, $p->json('territories'));
        $this->withHeaders($h)->getJson('/api/war/preview?scenario=nope')->assertNotFound();
    }
}
