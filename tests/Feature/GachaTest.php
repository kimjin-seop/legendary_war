<?php

namespace Tests\Feature;

use App\Services\GachaService;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GachaTest extends TestCase
{
    use RefreshDatabase;

    private function actor(int $gold = 2000): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'gacha'])->assertCreated();
        $uid = (int) $r->json('user.id');
        $gold > (int) config('game.starter_gold') && app(ProgressionService::class)->credit($uid, 'gold', $gold - (int) config('game.starter_gold'), 'test_grant', 'test', 1);

        return [$uid, ['X-Guest-Token' => $r->json('guest_token')]];
    }

    public function test_플래그_off면_404이고_rules에_노출된다(): void
    {
        config(['game.gacha.enabled' => false]);
        [, $h] = $this->actor();
        $this->withHeaders($h)->getJson('/api/gacha')->assertNotFound()->assertJsonPath('error.code', 'gacha_disabled');
        $this->getJson('/api/rules')->assertJsonPath('rules.gacha', false);
        config(['game.gacha.enabled' => true]);
        $this->getJson('/api/rules')->assertJsonPath('rules.gacha', true);
    }

    public function test_확률_합_100과_1회_뽑기_차감_로그_멱등_잔액부족(): void
    {
        config(['game.gacha.enabled' => true]);
        [$uid, $h] = $this->actor(500);
        $info = $this->withHeaders($h)->getJson('/api/gacha')->assertOk();
        $this->assertEqualsWithDelta(100.0, array_sum(array_column($info->json('rates'), 'rate_pct')), 1e-9);
        $this->assertSame(500, $info->json('gold'));

        $a = $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 1, 'request_id' => 'req-0000001'])->assertOk();
        $this->assertFalse($a->json('replay'));
        $this->assertSame(400, $a->json('gold'));
        $res = $a->json('results.0');
        $this->assertTrue($res['is_new'] || $res['shards_gained'] > 0);
        $this->assertNotEmpty($res['display_name']);
        $this->assertSame(1, DB::table('gacha_pulls')->count());
        $this->assertSame(1, DB::table('wallet_transactions')->where('reason_code', 'gacha_pull')->count());

        $b = $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 1, 'request_id' => 'req-0000001'])->assertOk();
        $this->assertTrue($b->json('replay'));
        $this->assertSame($a->json('results'), $b->json('results'));
        $this->assertSame(1, DB::table('gacha_pulls')->count());
        $this->assertSame(400, $b->json('gold'));
        $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 10, 'request_id' => 'req-0000001'])->assertStatus(409);

        foreach ([2, 3, 4, 5] as $i) {
            $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 1, 'request_id' => 'req-000000'.$i])->assertOk();
        }
        $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 1, 'request_id' => 'req-0000009'])->assertStatus(422)->assertJsonPath('error.code', 'insufficient_gold');
        $this->assertSame(0, (int) DB::table('wallets')->where('user_id', $uid)->value('balance'));
        $this->assertSame(5, DB::table('gacha_pulls')->count());
    }

    public function test_10연은_A이상_1회_보장되고_중복은_조각이_된다(): void
    {
        config(['game.gacha.enabled' => true]);
        [$uid, $h] = $this->actor(9000);
        // A를 극히 낮게(0.01%) 둔 풀 -> 거의 항상 보장 로직으로만 A가 나온다
        $pool = json_decode(file_get_contents(database_path('data/gacha_pool.json')), true);
        $pool['rates_pct'] = ['S' => 0, 'A' => 0.01, 'B' => 0, 'C' => 99.99];
        $path = tempnam(sys_get_temp_dir(), 'gp');
        file_put_contents($path, json_encode($pool));
        config(['game.gacha.pool_path' => $path]);
        $r = $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 10, 'request_id' => 'req-ten-0001'])->assertOk();
        @unlink($path);
        $this->assertSame(900, $r->json('gold_spent'));
        $this->assertCount(10, $r->json('results'));
        $this->assertContains('A', array_column($r->json('results'), 'rarity'));
        $this->assertSame(900, (int) DB::table('gacha_pulls')->where('user_id', $uid)->value('gold_spent'));
        // C 영웅 중복(40명 풀에서 10회)이 나오면 조각이 DB에 반영돼 있어야 한다(결과 shards_total <= DB 최종값)
        foreach ($r->json('results') as $x) {
            $this->assertLessThanOrEqual((int) DB::table('user_heroes')->where('id', $x['user_hero_id'])->value('shards'), $x['shards_total']);
        }
    }

    public function test_배너는_풀_안의_코드만_담고_일반_소환은_날짜_기준_SA_5명이다(): void
    {
        config(['game.gacha.enabled' => true]);
        [, $h] = $this->actor();
        $info = $this->withHeaders($h)->getJson('/api/gacha')->assertOk();
        $banners = collect($info->json('banners'))->keyBy('key');
        $this->assertTrue($banners->has('normal'));   // 서고 + 생성된 시나리오 배너(sc_chN, 풀 검증 통과분). v1 표시 전용(three_kingdoms/europe/sengoku/imjin)은 시나리오 배너로 승계돼 없다
        $this->assertSame([], array_values(array_intersect(['imjin', 'three_kingdoms', 'europe', 'sengoku', 'conquest'], $banners->keys()->all())));
        $pool = collect($info->json('heroes'))->keyBy('hero');
        foreach ($banners as $b) {
            foreach ($b['hero_codes'] as $c) {
                $this->assertTrue($pool->has($c), $b['key'].':'.$c);   // 풀 밖 코드는 제외
            }
        }
        $normal = $banners['normal']['hero_codes'];
        $this->assertCount(5, $normal);
        foreach ($normal as $c) {
            $this->assertContains($pool[$c]['rarity'], ['S', 'A']);
        }
        $row = $pool['yi_sun_sin'];   // 도감용 필드
        $this->assertArrayHasKey('culture', $row);
        $this->assertNotEmpty($row['profile']['one_line']);
        $this->assertStringEndsNotWith('…', $row['profile']['summary']);   // 요약 전문(생략 없음)
        $this->assertSame((string) app(\App\Services\GameData::class)->heroProfile('yi_sun_sin')['summary'], $row['profile']['summary']);
        $again = $this->withHeaders($h)->getJson('/api/gacha')->json('banners');
        $this->assertSame($normal, collect($again)->firstWhere('key', 'normal')['hero_codes']);   // 같은 날 같은 결과
    }

    public function test_영웅_상세_stats에_이동_사거리가_병종_규칙값으로_실린다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $hero = app(\App\Services\GameData::class)->heroes()['yi_sun_sin'];
        $st = app(\App\Services\GameData::class)->heroDetail($hero)['stats'];
        $t = app(\App\Services\GameData::class)->rules()->unitTypes[$hero['troop_type'] ?? $hero['unit_type']];
        $this->assertSame([(int) $t['move'], (int) $t['range_min'], (int) $t['range_max']], [$st['move'], $st['range_min'], $st['range_max']]);
        $this->assertArrayHasKey('hp', $st);   // 기존 필드 유지
    }

    public function test_캠페인_전용_NPC와_주인공은_제외되고_승격_NPC만_풀에_포함된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $base = (array) DB::table('heroes')->where('rarity', 'C')->where('campaign_only', false)->first();
        unset($base['id']);
        DB::table('heroes')->insert(['code' => 'npc_test_gacha', 'campaign_only' => true, 'is_protagonist' => false] + $base);   // 돌 아주머니 같은 캠페인 전용 NPC
        DB::table('heroes')->insert(['code' => 'npc_test_promoted', 'campaign_only' => false, 'is_protagonist' => false] + $base);   // 승격(플레이 가능) NPC
        DB::table('heroes')->insert(['code' => 'npc_cart_zz', 'campaign_only' => false, 'is_protagonist' => false] + $base);   // 승격돼도 호송 NPC 패턴(npc_cart*)은 제외
        DB::table('heroes')->insert(['code' => 'baha_ad_din', 'campaign_only' => true, 'is_protagonist' => false] + $base);   // 종장 보상 영웅(npc_ 접두 아님, campaign_only): 풀 불변
        DB::table('heroes')->insert(['code' => 'protagonist_test_gacha', 'campaign_only' => true, 'is_protagonist' => true] + $base);
        app()->forgetInstance(\App\Services\GameData::class);
        app()->forgetInstance(\App\Services\GachaService::class);
        $pool = app(\App\Services\GachaService::class)->pool();
        $this->assertNotContains('npc_test_gacha', $pool['by_rarity']['C']);
        $this->assertContains('npc_test_promoted', $pool['by_rarity']['C']);
        $this->assertNotContains('protagonist_test_gacha', $pool['by_rarity']['C']);
        $this->assertNotContains('npc_cart_zz', $pool['by_rarity']['C']);
        $this->assertNotContains('baha_ad_din', array_merge(...array_values($pool['by_rarity'])));
        $this->assertEqualsWithDelta(100.0, array_sum($pool['rates']), 1e-9);
    }

    private function insertNpc(string $code, bool $campaignOnly = true, ?array $over = null): void
    {
        $base = (array) DB::table('heroes')->where('rarity', 'C')->where('campaign_only', false)->first();
        unset($base['id']);
        DB::table('heroes')->insert(['code' => $code, 'campaign_only' => $campaignOnly, 'is_protagonist' => false, 'skill_id' => null] + ($over ?? []) + $base);
    }

    public function test_v7_네임드_NPC는_ready_codes만_풀에_들어가고_무명_호송_동명판본은_빠진다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        foreach (['npc_todo_takatora', 'npc_shadow_ink', 'npc_cart_1', 'npc_goguryeo_scout_captain', 'npc_joan_of_arc'] as $c) {
            $this->insertNpc($c);   // 모두 campaign_only=1, 스킬 없음
        }
        $this->insertNpc('protagonist_zz', true, ['is_protagonist' => true]);
        app()->forgetInstance(\App\Services\GameData::class);
        $pool = app(GachaService::class)->pool();
        $all = array_merge(...array_values($pool['by_rarity']));
        $this->assertSame(7, $pool['version']);
        $this->assertContains('npc_todo_takatora', $all);
        foreach (['npc_shadow_ink', 'npc_cart_1', 'npc_goguryeo_scout_captain', 'npc_joan_of_arc', 'protagonist_zz', 'mansa_musa'] as $c) {
            $this->assertNotContains($c, $all);
        }
        $this->assertSame(count($all), count(array_unique($all)));
    }

    public function test_스킬_초상_없는_NPC_영웅을_뽑아도_예외가_없고_보유_후_편성된다(): void
    {
        [$uid, $h] = $this->actor(500);
        $this->insertNpc('npc_todo_takatora');
        $raw = json_decode(file_get_contents(database_path('data/gacha_pool.json')), true);
        $raw['hero_codes'] = [];
        $raw['include_campaign_npc'] = $raw['include_hero_expansion'] = $raw['include_hero_wave3'] = false;
        $raw['named_npc']['ready_codes'] = ['npc_todo_takatora'];
        $raw['rates_pct'] = ['S' => 0, 'A' => 0, 'B' => 0, 'C' => 100];
        $tmp = tempnam(sys_get_temp_dir(), 'gp');
        file_put_contents($tmp, json_encode($raw));
        config(['game.gacha.enabled' => true, 'game.gacha.pool_path' => $tmp]);
        app()->forgetInstance(\App\Services\GameData::class);
        app()->forgetInstance(\App\Services\GachaService::class);
        $r = $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => 1, 'request_id' => 'req-npc-0001'])->assertOk();
        $this->assertSame('npc_todo_takatora', $r->json('results.0.hero'));
        $this->assertTrue($r->json('results.0.is_new'));
        $user = \App\Models\User::find($uid);
        $prog = app(ProgressionService::class);
        $party = $prog->validateParty($user, [(int) $r->json('results.0.user_hero_id')]);
        $this->assertFalse($party[(int) $r->json('results.0.user_hero_id')]['hero']['campaign_only']);
        unlink($tmp);
    }
}
