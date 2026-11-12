<?php

namespace Tests\Feature;

use App\Models\Battle;
use App\Models\User;
use App\Services\BattleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class GameFlowTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;
    use \Tests\Concerns\PlacesForcedHeroes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
    }

    /** @return array{0:string,1:int} [token, user_id] */
    private function guest(string $nick = 'tester'): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated();

        return [$r->json('guest_token'), $r->json('user.id')];
    }

    private function h(string $token): array
    {
        return ['X-Guest-Token' => $token];
    }

    /** 스테이지1 도전 -> 시작 영웅 2명 배치 -> 확정. @return int battle id */
    private function startBattle(string $token): int
    {
        $id = $this->withHeaders($this->h($token))->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $heroes = $this->withHeaders($this->h($token))->getJson('/api/party')->json('party');
        $this->putDeployment($this->h($token), $id, [
            ['user_hero_id' => $heroes[0], 'x' => 2, 'y' => 3], ['user_hero_id' => $heroes[1], 'x' => 1, 'y' => 3],
        ])->assertOk();
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.status', 'in_progress');

        return $id;
    }

    public function test_불법_행동은_거부되고_상태는_변하지_않는다(): void
    {
        config(['game.rules.alternate_activation' => false]);   // 사거리·소유권 검증 의도 유지: 교대 on에서는 활성 부대 없음(409)이 먼저 걸림
        [$token] = $this->guest();
        $id = $this->startBattle($token);
        $before = $this->withHeaders($this->h($token))->getJson("/api/battles/$id")->json('battle');

        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0'])
            ->assertStatus(422)->assertJsonPath('error.code', 'out_of_range');
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'attack', 'unit_id' => 'b0', 'target_id' => 'a0'])
            ->assertStatus(403)->assertJsonPath('error.code', 'unit_not_owned');

        $after = $this->withHeaders($this->h($token))->getJson("/api/battles/$id")->json('battle');
        unset($before['server_time'], $after['server_time']);   // 호출 시각마다 달라지는 보정용 필드
        $this->assertSame($before, $after);
    }

    public function test_배치_영역밖_코스트초과는_거부되고_정상_배치후_전투가_시작된다(): void
    {
        [$token, $uid] = $this->guest();
        $id = $this->withHeaders($this->h($token))->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $party = $this->withHeaders($this->h($token))->getJson('/api/party')->json('party');

        // 배치 영역 밖(x=5)
        $this->putDeployment($this->h($token), $id, [['user_hero_id' => $party[0], 'x' => 5, 'y' => 3]])
            ->assertStatus(422)->assertJsonPath('error.code', 'outside_deploy_zone');
        // 배치 단계에서는 행동 불가
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])
            ->assertStatus(409)->assertJsonPath('error.code', 'deployment_phase');
        // 슬롯 초과: 시작 영웅 2명 + S등급 알렉산드로스 = 3명 > Lv1 슬롯 2
        $heroId = DB::table('heroes')->where('code', 'alexander')->value('id');
        $third = DB::table('user_heroes')->insertGetId(['user_id' => $uid, 'hero_id' => $heroId, 'level' => 1, 'exp' => 0, 'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->putDeployment($this->h($token), $id, [
            ['user_hero_id' => $party[0], 'x' => 2, 'y' => 3], ['user_hero_id' => $party[1], 'x' => 1, 'y' => 3], ['user_hero_id' => $third, 'x' => 1, 'y' => 2],
        ])->assertStatus(422)->assertJsonPath('error.code', 'too_many_slots');
        // 편성 저장도 동일 검증 -> 유저 레벨 상승 후 허용
        $ids = [$party[0], $party[1], $third];
        $this->withHeaders($this->h($token))->putJson('/api/party', ['user_hero_ids' => $ids])->assertStatus(422)->assertJsonPath('error.code', 'too_many_slots');
        DB::table('users')->where('id', $uid)->update(['level' => 10]);   // 슬롯 3, max_cost 26
        $this->withHeaders($this->h($token))->putJson('/api/party', ['user_hero_ids' => $ids])->assertOk();

        $this->putDeployment($this->h($token), $id, [
            ['user_hero_id' => $party[0], 'x' => 2, 'y' => 3], ['user_hero_id' => $party[1], 'x' => 1, 'y' => 3], ['user_hero_id' => $third, 'x' => 1, 'y' => 2],
        ])->assertOk();
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.status', 'in_progress');
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/confirm")->assertStatus(409)->assertJsonPath('error.code', 'deployment_closed');
    }

    public function test_정산은_1회만_지급되고_레벨업이_반영된다(): void
    {
        [$token, $uid] = $this->guest();
        $id = $this->startBattle($token);
        DB::table('battles')->where('id', $id)->update(['status' => 'finished', 'winner' => 'a', 'turn' => 5]);
        $svc = app(BattleService::class);
        $user = User::find($uid);

        $svc->settle(Battle::find($id), $user);
        $svc->settle(Battle::find($id), $user);   // 중복 정산 시도

        $gold = DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance');
        $this->assertSame(600, (int) $gold);   // 시작 500 + 스테이지1 보상 100 (1회)
        $this->assertSame(1, DB::table('wallet_transactions')->where('reason_code', 'stage_reward')->count());
        $levels = DB::table('user_heroes')->where('user_id', $uid)->pluck('level')->all();
        $this->assertSame([2, 2, 3], array_map('intval', $levels));   // exp 60 >= 50 -> Lv2, 주인공은 튜토1 첫 클리어 지급으로 Lv3 (시작 영웅 2명 + 필수 출전 주인공)
        $res = $this->withHeaders($this->h($token))->getJson("/api/battles/$id/result")->assertOk();
        $res->assertJsonPath('result.win', true)->assertJsonPath('result.user.max_cost', 16);
    }

    public function test_포기는_멱등이며_보상이_없고_이후_행동은_거부된다(): void
    {
        [$token, $uid] = $this->guest();
        $id = $this->startBattle($token);

        $r = $this->withHeaders($this->h($token))->postJson("/api/battles/$id/abandon")->assertOk()->assertJsonPath('battle.status', 'abandoned');
        $this->assertSame('battle_end', $r->json('events.0.type'));
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/abandon")->assertOk()->assertJsonPath('battle.status', 'abandoned');
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertStatus(409)->assertJsonPath('error.code', 'battle_finished');
        $this->assertSame(500, (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance'));
        $this->withHeaders($this->h($token))->getJson("/api/battles/$id/result")->assertOk()->assertJsonPath('result.abandoned', true);
    }

    public function test_남의_전투는_접근할_수_없다(): void
    {
        [$t1] = $this->guest('one');
        [$t2] = $this->guest('two');
        $id = $this->withHeaders($this->h($t1))->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');

        $this->withHeaders($this->h($t2))->getJson("/api/battles/$id")->assertStatus(404);
        $this->withHeaders($this->h($t2))->postJson("/api/battles/$id/confirm")->assertStatus(404);
    }

    public function test_시뮬레이션이_완주한다(): void
    {
        $this->artisan('game:simulate', ['--per-hero' => 14, '--mirror' => 2, '--levels' => 2])->assertSuccessful();
    }
}
