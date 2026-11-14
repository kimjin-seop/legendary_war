<?php

namespace Tests\Feature;

use App\Services\GachaService;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 필수 영웅 소프트 천장 + 시나리오 배너(docs/GACHA_REQUIRED_PITY_20261108.md). 핵심 동작만. */
class GachaRequiredPityTest extends TestCase
{
    use RefreshDatabase;

    private string $target;

    /** @return array{0:int,1:array} [uid, headers] */
    private function setUpActor(int $gold = 20000, bool $library = true, int $k = 3, int $boost = 1): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'rp'])->assertCreated();
        $uid = (int) $r->json('user.id');
        config(['game.gacha.currency' => 'gold']);   // 천장 로직 검증은 골드 롤백 경로로(결제 통화 무관)
        app(ProgressionService::class)->credit($uid, 'gold', $gold, 'test_grant', 'test', 1);
        $pool = app(GachaService::class)->pool();
        $owned = DB::table('user_heroes')->where('user_id', $uid)->pluck('hero_id')->flip();
        $heroes = app(\App\Services\GameData::class)->heroes();
        $this->target = collect($pool['by_rarity']['B'])->first(fn ($c) => ! isset($owned[$heroes[$c]['id']]));
        $f = tempnam(sys_get_temp_dir(), 'req');
        file_put_contents($f, json_encode(['stage_01' => [$this->target]]));
        config(['game.gacha.enabled' => true, 'game.gacha.required_path' => $f, 'game.gacha.required_library' => $library, 'game.gacha.required_pity' => $k, 'game.gacha.required_boost' => $boost]);

        return [$uid, ['X-Guest-Token' => $r->json('guest_token')]];
    }

    private function pull(array $h, string $id, int $count = 1, ?string $banner = null)
    {
        return $this->withHeaders($h)->postJson('/api/gacha/pull', ['count' => $count, 'request_id' => $id] + ($banner ? ['banner' => $banner] : []));
    }

    private function owns(int $uid, string $code): bool
    {
        return DB::table('user_heroes')->where('user_id', $uid)->where('hero_id', app(\App\Services\GameData::class)->heroes()[$code]['id'])->exists();
    }

    public function test_부스트가_같은_등급_안에서_필수_영웅을_크게_올린다(): void
    {
        [$uid, $h] = $this->setUpActor(k: 1000, boost: 1000000);
        $info = $this->withHeaders($h)->getJson('/api/gacha')->assertOk();
        $this->assertSame($this->target, $info->json('required_pity.targets.0.hero'));
        $this->assertGreaterThan(90, $info->json('required_pity.targets.0.effective_rate_pct') / ($info->json('rates.2.rate_pct') / 100));   // B 등급 안에서 거의 독점
        for ($i = 0; $i < 40 && ! $this->owns($uid, $this->target); $i++) {
            $this->pull($h, 'boost-req-'.$i)->assertOk();
        }
        $this->assertTrue($this->owns($uid, $this->target));
    }

    public function test_미획득_K회_뒤_다음_뽑기에서_확정되고_카운터가_리셋된다(): void
    {
        [$uid, $h] = $this->setUpActor(k: 3, boost: 1);
        $via = [];
        for ($i = 0; $i < 4; $i++) {
            $via[] = $this->pull($h, 'pity-req-'.$i)->assertOk()->json('results.0.required_via');
            if ($this->owns($uid, $this->target)) {
                break;
            }
        }
        $this->assertTrue($this->owns($uid, $this->target));   // 자연 획득이 아니면 4번째에서 천장 확정
        if (count($via) === 4 && $via[3] !== 'boost') {
            $this->assertSame('pity', $via[3]);
        }
        $this->assertArrayNotHasKey($this->target, json_decode((string) DB::table('gacha_user_states')->where('user_id', $uid)->value('required_pity_counters'), true) ?: []);
    }

    public function test_같은_request_id_재전송은_같은_결과이고_카운터와_골드가_다시_바뀌지_않는다(): void
    {
        [$uid, $h] = $this->setUpActor(k: 50, boost: 1);
        $a = $this->pull($h, 'idem-req-1', 10)->assertOk();
        $counters = DB::table('gacha_user_states')->where('user_id', $uid)->value('required_pity_counters');
        $b = $this->pull($h, 'idem-req-1', 10)->assertOk();
        $this->assertTrue($b->json('replay'));
        $this->assertSame($a->json('results'), $b->json('results'));
        $this->assertSame($a->json('gold'), $b->json('gold'));
        $this->assertSame($counters, DB::table('gacha_user_states')->where('user_id', $uid)->value('required_pity_counters'));
        $this->assertSame(1, DB::table('gacha_pulls')->where('user_id', $uid)->count());
        $this->pull($h, 'idem-req-1', 10, 'nope')->assertStatus(422);   // 알 수 없는 배너 (차감·로그 없음)
        $this->assertSame(1, DB::table('gacha_pulls')->where('user_id', $uid)->count());
    }

    public function test_필수_영웅이_없으면_기존_확률과_같고_기능_표지가_없다(): void
    {
        [$uid, $h] = $this->setUpActor(k: 1, boost: 1000000);
        file_put_contents(config('game.gacha.required_path'), json_encode(['stage_01' => []]));
        $this->assertSame([], $this->withHeaders($h)->getJson('/api/gacha')->json('required_pity.targets'));
        $r = $this->pull($h, 'none-req-1', 10)->assertOk();
        foreach ($r->json('results') as $x) {
            $this->assertArrayNotHasKey('required_via', $x);
        }
        $this->assertSame([], json_decode((string) DB::table('gacha_user_states')->where('user_id', $uid)->value('required_pity_counters'), true) ?: []);
    }

    public function test_시나리오_배너는_그_풀에서만_뽑고_서고는_기본으로_천장이_꺼져_있다(): void
    {
        [$uid, $h] = $this->setUpActor(library: false, k: 2, boost: 1);
        $pool = app(GachaService::class)->pool();
        $codes = [$this->target];
        foreach (['S', 'A', 'B', 'C'] as $r) {
            $codes = array_merge($codes, array_slice(array_values(array_diff($pool['by_rarity'][$r], $codes)), 0, 2));
        }
        $bf = tempnam(sys_get_temp_dir(), 'bn');
        file_put_contents($bf, json_encode(['version' => 2, 'banners' => [
            ['key' => 'sc_test', 'title' => 't', 'sub' => 's', 'art_key' => 'europe', 'required_heroes' => [$this->target], 'pool_codes' => $codes],
            ['key' => 'sc_bad', 'title' => 'bad', 'pool_codes' => ['no_such_hero']],
        ], 'normal' => ['key' => 'normal', 'title' => '서고']]));
        config(['game.gacha.banners_path' => $bf]);

        $info = $this->withHeaders($h)->getJson('/api/gacha')->assertOk();
        $keys = array_column($info->json('banners'), 'key');
        $this->assertContains('sc_test', $keys);
        $this->assertNotContains('sc_bad', $keys);   // 검증 위반 배너는 비활성
        $b = collect($info->json('banners'))->firstWhere('key', 'sc_test');
        $this->assertTrue($b['recommended']);
        $this->assertSame('europe', $b['art_key']);
        $this->assertSame(1, $b['required_total']);
        $this->assertSame([], $info->json('required_pity.targets'));   // 서고 OFF
        $this->assertSame(count($codes) , array_sum($b['pool_summary']));

        $this->pull($h, 'lib-req-001', 10)->assertOk();   // 서고: 카운터 변화 없음
        $this->assertSame([], json_decode((string) DB::table('gacha_user_states')->where('user_id', $uid)->value('required_pity_counters'), true) ?: []);

        $this->pull($h, 'bn-req-0001', 1, 'sc_bad')->assertStatus(422);
        $seen = [];
        for ($i = 0; $i < 4; $i++) {
            $r = $this->pull($h, 'bn-req-1'.$i, 1, 'sc_test')->assertOk();
            $this->assertSame('sc_test', $r->json('banner'));
            $seen[] = $r->json('results.0.hero');
        }
        $this->assertEmpty(array_diff($seen, $codes));   // 배너 풀 밖 영웅 없음
        $this->assertTrue($this->owns($uid, $this->target));   // K=2 천장(배너 안에서 카운트) 로 늦어도 3번째
        $this->pull($h, 'bn-req-10', 1)->assertStatus(409);   // 같은 request_id, banner 다름
    }

    public function test_적군은_풀에_포함되지만_쇼케이스는_아군만이고_막힌_스테이지_배너가_안내된다(): void
    {
        [, $h] = $this->setUpActor(library: false, k: 2, boost: 1);
        $pool = app(GachaService::class)->pool();
        $codes = [$this->target];
        foreach (['S', 'A', 'B', 'C'] as $r) {
            $codes = array_merge($codes, array_slice(array_values(array_diff($pool['by_rarity'][$r], $codes)), 0, 2));
        }
        $enemy = $pool['by_rarity']['S'][0];
        $ally = $pool['by_rarity']['S'][1];
        $bf = tempnam(sys_get_temp_dir(), 'bn');
        file_put_contents($bf, json_encode(['version' => 2, 'banners' => [
            ['key' => 'sc_side', 'title' => 't', 'required_heroes' => [$this->target], 'pool_codes' => array_values(array_unique(array_merge([$enemy, $ally], $codes))), 'pool_sides' => [$enemy => 'enemy'], 'hero_codes' => [$enemy, $ally]],
            ['key' => 'sc_other', 'title' => 'o', 'pool_codes' => array_values(array_diff($codes, [$this->target]))],
        ], 'normal' => ['key' => 'normal', 'title' => '서고']]));
        config(['game.gacha.banners_path' => $bf]);

        $info = $this->withHeaders($h)->getJson('/api/gacha')->assertOk();
        $b = collect($info->json('banners'))->firstWhere('key', 'sc_side');
        $this->assertSame([$ally], $b['hero_codes']);   // 쇼케이스 = 아군만
        $row = collect($b['pool_heroes'])->keyBy('hero');
        $this->assertSame(['enemy', false], [$row[$enemy]['side'], $row[$enemy]['default_visible']]);
        $this->assertSame('ally', $row[$ally]['side']);
        $this->assertSame(count($b['pool_heroes']), array_sum($b['pool_summary']));   // 적군도 확률 계산(등급 인원)에 포함
        $this->assertSame(['sc_side'], $info->json('blocking_banners'));   // 필수 영웅(target)이 속한 배너만
    }

    public function test_required_pity_0_배너_뽑기가_다른_배너의_카운터를_지우지_않는다(): void
    {
        [$uid, $h] = $this->setUpActor(library: false, k: 5, boost: 1);
        $pool = app(GachaService::class)->pool();
        $codes = [];
        foreach (['S', 'A', 'B', 'C'] as $r) {
            $codes = array_merge($codes, array_slice($pool['by_rarity'][$r], 0, 2));
        }
        $bf = tempnam(sys_get_temp_dir(), 'bn');
        file_put_contents($bf, json_encode(['version' => 2, 'banners' => [['key' => 'sc_off', 'title' => 't', 'pool_codes' => $codes]], 'normal' => ['key' => 'normal', 'title' => '서고']]));
        config(['game.gacha.banners_path' => $bf, 'game.gacha.banner_overrides' => ['sc_off' => ['required_pity' => 0]]]);
        $this->pull($h, 'off-req-001', 1)->assertOk();   // 상태 행 생성
        DB::table('gacha_user_states')->where('user_id', $uid)->update(['required_pity_counters' => json_encode(['other_hero' => 4])]);
        $this->pull($h, 'off-req-002', 1, 'sc_off')->assertOk();
        $this->assertSame(['other_hero' => 4], json_decode((string) DB::table('gacha_user_states')->where('user_id', $uid)->value('required_pity_counters'), true));
    }
}
