<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 시나리오별 시즌 동시 운영: imjin·france 활성 시즌이 공존하고, ?scenario= 와 가입 시즌으로 해석된다. */
class SeasonWarMultiScenarioTest extends TestCase
{
    use RefreshDatabase;

    public function test_시나리오별_시즌이_공존하고_scenario_파라미터와_가입_시즌으로_해석된다(): void
    {
        config(['war.allow_guests' => true]);
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('war:seed')->assertSuccessful();
        $this->artisan('war:seed', ['scenario' => 'france'])->assertSuccessful();
        $this->assertSame(2, DB::table('seasons')->where('status', 'active')->count());

        $r = $this->postJson('/api/guests', ['nickname' => 'multi'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $imjinCountry = collect(json_decode((string) file_get_contents(database_path('data/war/imjin.json')), true)['countries'])->first()['code'];
        $fr = collect(json_decode((string) file_get_contents(database_path('data/war/france.json')), true)['countries'])->first()['code'];

        $list = $this->withHeaders($h)->getJson('/api/war/seasons')->assertOk()->json('seasons');
        $this->assertEqualsCanonicalizing(['imjin', 'france'], array_column($list, 'scenario_code'));
        $this->withHeaders($h)->getJson('/api/war/state?scenario=france')->assertOk()->assertJsonPath('scenario_code', 'france');
        $this->withHeaders($h)->getJson('/api/war/state?scenario=rome')->assertStatus(404);   // 활성 시즌 없는 시나리오

        // 시나리오를 지정해 가입하면 그 시즌에 가입되고, 이후 지정 없이도 가입한 시즌을 따른다(가장 최근 활성 시즌인 france 가 아니어도)
        $this->withHeaders($h)->postJson('/api/war/join', ['country' => $imjinCountry, 'scenario' => 'imjin'])->assertOk()->assertJsonPath('scenario_code', 'imjin');
        $this->withHeaders($h)->getJson('/api/war/state')->assertOk()->assertJsonPath('scenario_code', 'imjin')->assertJsonPath('me.joined', true);
        $this->withHeaders($h)->getJson('/api/war/state?scenario=france')->assertOk()->assertJsonPath('me.joined', false);
        $this->assertNotEmpty($fr);

        // map·state 일관성: 임진 가입자가 ?scenario=france 로 지도를 요청하면 프랑스 지도(읽기 전용, 가입 정보는 해당 시즌 기준)가 온다
        $frTerr = array_column(json_decode((string) file_get_contents(database_path('data/war/france.json')), true)['territories'], 'code');
        $m = $this->withHeaders($h)->getJson('/api/war/map?scenario=france')->assertOk()->assertJsonPath('scenario_code', 'france');
        $this->assertEqualsCanonicalizing($frTerr, array_column($m->json('territories'), 'code'));
        $this->withHeaders($h)->getJson('/api/war/map')->assertOk()->assertJsonPath('scenario_code', 'imjin');   // 미지정은 가입 시즌
    }

    public function test_레그니차_시나리오가_시즌으로_개설되고_지도가_시나리오_영토를_돌려준다(): void
    {
        config(['war.allow_guests' => true]);
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('war:seed', ['scenario' => 'legnica'])->assertSuccessful();
        $h = ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => 'lg'])->json('guest_token')];
        $codes = array_column(json_decode((string) file_get_contents(database_path('data/war/legnica.json')), true)['territories'], 'code');
        $m = $this->withHeaders($h)->getJson('/api/war/map?scenario=legnica')->assertOk()->assertJsonPath('scenario_code', 'legnica');
        $this->assertEqualsCanonicalizing($codes, array_column($m->json('territories'), 'code'));
    }
}
