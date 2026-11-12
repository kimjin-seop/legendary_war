<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 영웅별 고정 부대 병종: 사용자 troops 입력은 무시, 서버가 heroes.troop_type으로 구성. */
class PartyTroopsTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'troops'])->assertCreated();

        return [['X-Guest-Token' => $r->json('guest_token')], DB::table('user_heroes')->where('user_id', $r->json('user.id'))->pluck('id')->all()];
    }

    public function test_troops_입력은_오류없이_무시되고_저장되지_않는다(): void
    {
        [$h, $uh] = $this->guest();
        $put = fn (array $body) => $this->withHeaders($h)->putJson('/api/party', $body);
        // 예전에는 422였던 입력(알 수 없는 병종·슬롯 초과)도 200, 저장 없음
        $put(['user_hero_ids' => [$uh[0], $uh[1]], 'troops' => [['mage', 'mage', 'mage'], ['dragon']]])->assertOk();
        $r = $put(['user_hero_ids' => [$uh[0]], 'troops' => 'garbage'])->assertOk();
        $this->assertSame([$uh[0]], $r->json('party'));
        $this->assertSame(0, count((array) $r->json('troops')));
        $this->assertSame(0, DB::table('parties')->whereNotNull('troops')->count());
    }

    public function test_고정_병종이_후보_영웅_응답과_formation에_노출된다(): void
    {
        [$h, $uh] = $this->guest();
        $heroes = $this->withHeaders($h)->getJson('/api/heroes')->assertOk()->json('heroes');
        foreach ($heroes as $row) {
            $this->assertContains($row['troop_type'], ['sword', 'spear', 'cavalry', 'archer']);
            $this->assertNotEmpty($row['troop_label']);
            $this->assertSame($row['troop_type'], $row['detail']['troop_type']);
        }
        $stage = DB::table('stages')->orderBy('sort_order')->value('id');
        $f = $this->withHeaders($h)->postJson("/api/stages/{$stage}/challenge")->assertCreated()->json('deployment');
        foreach ($f['formation'] as $id => $fm) {
            $this->assertFalse($fm['user_selected']);
            $this->assertCount(1, array_unique(array_column($fm['troops'], 'class')));   // 1종 고정
            $this->assertSame($fm['troop_type'], $fm['troops'][0]['class']);
        }
    }

    public function test_코스트_합산과_rules_노출(): void
    {
        [$h, $uh] = $this->guest();
        $put = fn (array $body) => $this->withHeaders($h)->putJson('/api/party', $body);
        $put(['user_hero_ids' => $uh])->assertOk();                                                          // 시작 파티는 상한(16) 이내라 통과
        config(['game.rules.troop_cost' => true]);
        DB::table('user_level_costs')->where('level', 1)->update(['max_cost' => 7]);   // 영웅 코스트 합(8)보다 낮춰 초과 상황을 만든다
        $put(['user_hero_ids' => $uh])->assertStatus(422);
        $rules = $this->getJson('/api/rules')->assertOk();
        $this->assertTrue($rules->json('rules.troop_cost'));
        $this->assertSame([['min_level' => 1, 'troops' => 2], ['min_level' => 10, 'troops' => 3], ['min_level' => 20, 'troops' => 4]], $rules->json('rules.troop_slots'));
        $this->assertSame(12, $rules->json('rules.max_units_per_side'));
        $this->assertSame(2, collect($rules->json('unit_types'))->firstWhere('code', 'mage')['cost']);
    }

    public function test_시더는_멱등이고_null인_영웅만_채우며_허용밖_값은_실패(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->assertSame(0, DB::table('heroes')->whereNull('troop_type')->count());
        $this->assertSame('cavalry', DB::table('heroes')->where('code', 'han_xin')->value('troop_type'));   // 송서사 대안 채택
        $this->assertSame('archer', DB::table('heroes')->where('code', 'ashoka')->value('troop_type'));
        // 수동 수정값 보존(비-force) + null은 채움
        DB::table('heroes')->where('code', 'han_xin')->update(['troop_type' => 'spear']);
        DB::table('heroes')->where('code', 'ashoka')->update(['troop_type' => null]);
        $this->artisan('game:seed')->assertSuccessful();
        $this->assertSame('spear', DB::table('heroes')->where('code', 'han_xin')->value('troop_type'));
        $this->assertSame('archer', DB::table('heroes')->where('code', 'ashoka')->value('troop_type'));
        // 허용 밖 값(mage)이 든 파일은 시드 실패
        $bad = tempnam(sys_get_temp_dir(), 'tt');
        file_put_contents($bad, json_encode(['heroes' => ['han_xin' => ['troop_type' => 'mage']]]));
        config(['game.hero_troop_types.path' => $bad]);
        try {
            $this->artisan('game:seed');
            $this->fail('허용 밖 병종이 통과함');
        } catch (\RuntimeException $e) {
            $this->assertStringContainsString('허용 밖', $e->getMessage());
        } finally {
            @unlink($bad);
        }
    }

    public function test_troop_type이_null이어도_폴백으로_부대가_구성된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        DB::table('heroes')->update(['troop_type' => null]);
        $svc = app(\App\Services\ProgressionService::class);
        $hero = app(GameData::class)->heroes();
        $row = reset($hero);
        $this->assertNull($row['troop_type']);
        $plan = $svc->squadTroops([['row' => $row, 'level' => 1, 'key' => 0]], null);
        $this->assertCount(2, $plan[0]);
    }
}
