<?php

namespace Tests\Feature;

use App\Services\RankService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 랭크 큐별 정규화·어뷰징 방지·시즌 종료/소프트 리셋·보상 골격(지급 비활성). */
class RankRulesTest extends TestCase
{
    use RefreshDatabase;

    private function guest(string $nick): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated();

        return [$r->json('guest_token'), (int) DB::table('users')->where('name', 'like', $nick.'%')->value('id')];
    }

    private function as(string $t): static
    {
        return $this->withHeaders(['X-Guest-Token' => $t]);
    }

    private function rankOn(): void
    {
        config(['game.rank.enabled' => true, 'game.rank.allow_guests' => true]);
        $this->artisan('game:seed')->assertSuccessful();
    }

    /** 방의 두 참가자가 기본 편성으로 배치 확정 -> 전투 시작. 시작된 전투 state 반환 */
    private function confirmBoth(string $code, array $tokens, int $battleId): array
    {
        foreach ($tokens as $t) {
            $d = $this->as($t)->getJson("/api/rooms/$code/deployment")->assertOk();
            $pos = (array) $d->json('default_positions');
            $ids = array_keys($pos);   // 방 대전은 맵 크기별 고정 출전수(보유 영웅 수 이내)를 모두 출전
            $this->as($t)->putJson("/api/rooms/$code/deployment", ['placements' => array_map(fn ($k) => ['user_hero_id' => (int) $k, 'x' => $pos[$k]['x'], 'y' => $pos[$k]['y']], $ids)])->assertOk();
            $this->as($t)->postJson("/api/rooms/$code/confirm")->assertOk();
        }

        return json_decode(DB::table('battles')->where('id', $battleId)->value('state'), true);
    }

    private function maxLevel(array $st): int
    {
        return max(array_map(fn ($u) => (int) ($u['level'] ?? 1), $st['units']));
    }

    public function test_랭크_방은_레벨_상한이_적용되고_일반_PvP_방은_적용되지_않는다(): void
    {
        $this->rankOn();
        [$ta, $ua] = $this->guest('nza');
        [$tb, $ub] = $this->guest('nzb');
        DB::table('user_heroes')->whereIn('user_id', [$ua, $ub])->update(['level' => 30]);
        $this->as($ta)->postJson('/api/rank/queue')->assertOk();
        $code = $this->as($tb)->postJson('/api/rank/queue')->assertOk()->json('room_code');
        $battleId = (int) DB::table('rank_matches')->value('battle_id');
        $this->assertLessThanOrEqual(15, $this->maxLevel($this->confirmBoth($code, [$ta, $tb], $battleId)));

        // 일반 PvP 방(랭크 매치 아님): 같은 영웅 레벨 30 그대로
        [$tc, $uc] = $this->guest('nzc');
        [$td, $ud] = $this->guest('nzd');
        DB::table('user_heroes')->whereIn('user_id', [$uc, $ud])->update(['level' => 30]);
        $room = $this->as($tc)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'private'])->assertCreated()->json('room.code');
        $this->as($td)->postJson('/api/rooms/join', ['code' => $room])->assertOk();
        $this->as($td)->postJson("/api/rooms/$room/ready", ['ready' => true])->assertOk();
        $this->as($tc)->postJson("/api/rooms/$room/ready", ['ready' => true])->assertOk();
        $this->as($tc)->postJson("/api/rooms/$room/start")->assertOk();
        $bid = (int) DB::table('rooms')->where('code', $room)->value('battle_id');
        $this->assertSame(30, $this->maxLevel($this->confirmBoth($room, [$tc, $td], $bid)));
    }

    public function test_같은_상대_반복은_변동이_감쇠하고_짧은_정상_종료는_축소된다(): void
    {
        $this->rankOn();
        [, $ua] = $this->guest('abx');
        [, $ub] = $this->guest('aby');
        $s = app(RankService::class)->currentSeason();
        $svc = app(RankService::class);
        $make = fn (string $reason, int $turn, int $prior) => (function () use ($s, $ua, $ub, $reason, $turn, $prior) {
            DB::table('rank_matches')->delete();
            for ($i = 0; $i < $prior; $i++) {
                DB::table('rank_matches')->insert(['season_id' => $s->id, 'user_a_id' => $ua, 'user_b_id' => $ub, 'rating_a_before' => 1000, 'rating_b_before' => 1000, 'status' => 'settled', 'result' => 'a', 'reason' => 'normal', 'settled_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            }
            $id = DB::table('rank_matches')->insertGetId(['season_id' => $s->id, 'user_a_id' => $ua, 'user_b_id' => $ub, 'rating_a_before' => 1000, 'rating_b_before' => 1000, 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);

            return [DB::table('rank_matches')->find($id), $reason, $turn];
        })();
        $f = new \ReflectionMethod($svc, 'deltaFactor');
        $f->setAccessible(true);
        [$m, $r, $t] = $make('normal', 9, 0);
        $this->assertSame(1.0, $f->invoke($svc, $m, $r, $t));
        [$m, $r, $t] = $make('normal', 9, 3);   // 4번째
        $this->assertSame(0.5, $f->invoke($svc, $m, $r, $t));
        [$m, $r, $t] = $make('normal', 9, 6);   // 7번째
        $this->assertSame(0.0, $f->invoke($svc, $m, $r, $t));
        [$m, $r, $t] = $make('normal', 1, 0);   // 짧은 정상 종료
        $this->assertSame(0.25, $f->invoke($svc, $m, $r, $t));
        [$m, $r, $t] = $make('forfeit_leave', 1, 0);   // 기권패는 축소 없음
        $this->assertSame(1.0, $f->invoke($svc, $m, $r, $t));
    }

    public function test_기권패_다발은_큐_쿨다운에_걸린다(): void
    {
        $this->rankOn();
        [$ta, $ua] = $this->guest('fca');
        [, $ub] = $this->guest('fcb');
        $s = app(RankService::class)->currentSeason();
        for ($i = 0; $i < 3; $i++) {
            DB::table('rank_matches')->insert(['season_id' => $s->id, 'user_a_id' => $ua, 'user_b_id' => $ub, 'rating_a_before' => 1000, 'rating_b_before' => 1000, 'status' => 'settled', 'result' => 'b', 'reason' => 'forfeit_leave', 'settled_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        }
        $this->as($ta)->postJson('/api/rank/queue')->assertStatus(429)->assertJsonPath('error.code', 'queue_cooldown');
        DB::table('rank_matches')->update(['settled_at' => now()->subMinutes(30)]);   // 쿨다운(10분) 지남
        $this->as($ta)->postJson('/api/rank/queue')->assertOk();
    }

    public function test_직전_상대는_대기_초기에는_매칭에서_제외된다(): void
    {
        $this->rankOn();
        [$ta, $ua] = $this->guest('lsa');
        [$tb, $ub] = $this->guest('lsb');
        $s = app(RankService::class)->currentSeason();
        DB::table('rank_matches')->insert(['season_id' => $s->id, 'user_a_id' => $ua, 'user_b_id' => $ub, 'rating_a_before' => 1000, 'rating_b_before' => 1000, 'status' => 'settled', 'result' => 'a', 'reason' => 'normal', 'settled_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->as($ta)->postJson('/api/rank/queue')->assertJsonPath('state', 'queued');
        $this->as($tb)->postJson('/api/rank/queue')->assertJsonPath('state', 'queued');   // 직전 상대: 즉시 매칭 안 됨
        DB::table('rank_queue')->update(['queued_at' => now()->subSeconds(90)]);
        $this->as($tb)->getJson('/api/rank/queue')->assertJsonPath('state', 'matched');   // 60초 넘게 기다리면 허용
    }

    public function test_시즌_종료는_final로_확정되고_새_시즌_첫_레이팅은_소프트_리셋된다(): void
    {
        $this->rankOn();
        [, $ua] = $this->guest('ssa');
        $svc = app(RankService::class);
        $s1 = $svc->currentSeason();
        $svc->ratingRow($s1->id, $ua);
        DB::table('rank_ratings')->where(['season_id' => $s1->id, 'user_id' => $ua])->update(['rating' => 1400, 'wins' => 6]);
        DB::table('rank_seasons')->where('id', $s1->id)->update(['ends_at' => now()->subMinute(), 'starts_at' => now()->subDays(28)]);
        $active = DB::table('rank_matches')->insertGetId(['season_id' => $s1->id, 'user_a_id' => $ua, 'user_b_id' => $ua, 'rating_a_before' => 1400, 'rating_b_before' => 1400, 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $svc->closeSeasons();
        $this->assertSame('ended', DB::table('rank_seasons')->where('id', $s1->id)->value('status'));   // 진행 중 매치가 있으면 아직 확정 안 함
        DB::table('rank_matches')->where('id', $active)->update(['status' => 'settled']);
        $svc->closeSeasons();
        $this->assertSame('final', DB::table('rank_seasons')->where('id', $s1->id)->value('status'));
        $plan = $svc->rewardPlan($s1->id);
        $this->assertSame([['user_id' => $ua, 'rating' => 1400, 'tier' => 'platinum', 'gold' => 0, 'title' => null]], $plan);   // 지급 없이 계산만
        $s2 = $svc->currentSeason();
        $this->assertNotSame($s1->id, $s2->id);
        $this->assertSame(1200, (int) $svc->ratingRow($s2->id, $ua)->rating);   // 1000 + (1400-1000) x 50%
    }
    public function test_랭크_장비_정규화는_장비_합계에_0_5배를_곱해_내린다(): void
    {
        $this->rankOn();
        [$tok, $uid] = $this->guest('eqs');
        $h = ['X-Guest-Token' => $tok];
        $uh = $this->withHeaders($h)->getJson('/api/heroes')->json('heroes.0.user_hero_id');
        $this->withHeaders($h)->postJson('/api/shop/buy', ['code' => 'helm_c', 'request_id' => 'req-rank-eq-01'])->assertOk();
        $item = $this->withHeaders($h)->getJson('/api/inventory')->json('items.0.id');
        $this->withHeaders($h)->putJson("/api/heroes/$uh/equipment", ['equipment' => ['helm' => $item]])->assertOk();
        $eq = app(\App\Services\EquipmentService::class);
        $full = $eq->attach([['key' => $uh, 'row' => []]], false, 1.0)[0]['row']['equip'];
        $half = $eq->attach([['key' => $uh, 'row' => []]], false, (float) config('game.rank.normalize.equip_scale'))[0]['row']['equip'];
        $this->assertGreaterThan(0, $full['hp']);
        foreach (['hp', 'atk', 'def'] as $k) {
            $this->assertSame((int) floor($full[$k] * 0.5), $half[$k]);
        }
    }

    public function test_시즌_보상_지급은_final_시즌에서만_하고_중복_지급되지_않는다(): void
    {
        $this->rankOn();
        [, $ua] = $this->guest('rwa');
        $svc = app(RankService::class);
        $s = $svc->currentSeason();
        $svc->ratingRow($s->id, $ua);
        DB::table('rank_ratings')->where(['season_id' => $s->id, 'user_id' => $ua])->update(['rating' => 1260, 'wins' => 6]);
        config(['game.rank.season_rewards.enabled' => true, 'game.rank.season_rewards.tiers' => [['code' => 'gold', 'name' => '금', 'min_rating' => 0, 'gold' => 500, 'title' => null]]]);
        $this->assertSame([], $svc->payRewards($s->id));   // active 시즌은 지급 안 함
        DB::table('rank_seasons')->where('id', $s->id)->update(['status' => 'final']);
        $before = (int) DB::table('wallets')->where(['user_id' => $ua, 'currency_code' => 'gold'])->value('balance');
        $this->assertCount(1, $svc->payRewards($s->id));
        $this->assertSame([], $svc->payRewards($s->id));   // 재호출 멱등
        $this->assertSame($before + 500, (int) DB::table('wallets')->where(['user_id' => $ua, 'currency_code' => 'gold'])->value('balance'));
        config(['game.rank.enabled' => false]);
        $this->assertSame([], $svc->payRewards($s->id));   // rank.enabled=false 면 호출돼도 무동작
    }

    public function test_이월값은_이전_시즌이_final일_때_아직_안_치른_새_시즌_행에_재계산된다(): void
    {
        $this->rankOn();
        [, $ua] = $this->guest('cra');
        $svc = app(RankService::class);
        $s1 = $svc->currentSeason();
        $svc->ratingRow($s1->id, $ua);
        DB::table('rank_ratings')->where(['season_id' => $s1->id, 'user_id' => $ua])->update(['rating' => 1400]);
        DB::table('rank_seasons')->where('id', $s1->id)->update(['ends_at' => now()->subMinute(), 'starts_at' => now()->subDays(28)]);
        $m = DB::table('rank_matches')->insertGetId(['season_id' => $s1->id, 'user_a_id' => $ua, 'user_b_id' => $ua, 'rating_a_before' => 1400, 'rating_b_before' => 1400, 'status' => 'active', 'created_at' => now(), 'updated_at' => now()]);
        $s2 = $svc->currentSeason();
        $this->assertSame(1200, (int) $svc->ratingRow($s2->id, $ua)->rating);   // 진행 중 매치가 있는 동안 만든 행(낡을 수 있음)
        DB::table('rank_ratings')->where(['season_id' => $s1->id, 'user_id' => $ua])->update(['rating' => 1600]);   // 매치 정산으로 이전 시즌 최종 레이팅 변동
        DB::table('rank_matches')->where('id', $m)->update(['status' => 'settled']);
        $svc->closeSeasons();
        $this->assertSame(1300, (int) DB::table('rank_ratings')->where(['season_id' => $s2->id, 'user_id' => $ua])->value('rating'));   // 1000 + 600 x 50%
    }

    public function test_rank_pay_rewards_커맨드는_비활성이면_무동작이고_활성이면_final_시즌을_멱등_지급한다(): void
    {
        $this->rankOn();
        config(['game.rank.enabled' => false]);
        $this->artisan('rank:pay-rewards')->expectsOutputToContain('비활성')->assertSuccessful();
        config(['game.rank.enabled' => true, 'game.rank.season_rewards.enabled' => true, 'game.rank.season_rewards.tiers' => [['code' => 'gold', 'name' => '금', 'min_rating' => 0, 'gold' => 300, 'title' => null]]]);
        [, $ua] = $this->guest('prc');
        $svc = app(RankService::class);
        $s = $svc->currentSeason();
        $svc->ratingRow($s->id, $ua);
        DB::table('rank_ratings')->where(['season_id' => $s->id, 'user_id' => $ua])->update(['wins' => 6]);
        DB::table('rank_seasons')->where('id', $s->id)->update(['status' => 'final']);
        $before = (int) DB::table('wallets')->where(['user_id' => $ua, 'currency_code' => 'gold'])->value('balance');
        $this->artisan('rank:pay-rewards', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame($before, (int) DB::table('wallets')->where(['user_id' => $ua, 'currency_code' => 'gold'])->value('balance'));   // dry-run 은 지급 없음
        $this->artisan('rank:pay-rewards')->assertSuccessful();
        $this->artisan('rank:pay-rewards', ['season' => $s->id])->assertSuccessful();
        $this->assertSame($before + 300, (int) DB::table('wallets')->where(['user_id' => $ua, 'currency_code' => 'gold'])->value('balance'));
    }
}
