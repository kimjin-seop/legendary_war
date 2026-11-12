<?php

namespace Tests\Feature;

use App\Models\Battle;
use App\Models\User;
use App\Services\BattleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RewardScaleTest extends TestCase
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

    /** 종료된 스테이지 1 승리 전투(지휘관 풀 HP, 10턴 = 별 3개)를 만들어 정산하고 결과를 돌려준다. */
    private function winStage(string $token, int $uid): array
    {
        $h = ['X-Guest-Token' => $token];
        $id = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $this->putDeployment($h, $id, [['user_hero_id' => $party[0], 'x' => 2, 'y' => 3]])->assertOk();
        $state = ['units' => ['a0' => ['hp' => 10, 'max_hp' => 10]]];   // 지휘관 풀 HP
        DB::table('battles')->where('id', $id)->update(['status' => 'finished', 'winner' => 'a', 'turn' => 10, 'state' => json_encode($state)]);
        app(BattleService::class)->settle(Battle::find($id), User::find($uid));

        return Battle::find($id)->result;
    }

    public function test_기본값은_현행과_동일하고_켜면_재도전_별점_벤치_배율이_적용된다(): void
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'scale'])->assertCreated();
        [$token, $uid] = [$r->json('guest_token'), $r->json('user.id')];

        $base = $this->winStage($token, $uid);   // 기본값: 배율 1.0, 최초 클리어
        $this->assertSame(1.0, (float) $base['reward_mult']);
        $this->assertTrue($base['first_clear']);
        $this->assertArrayHasKey('exp_to_next', $base['heroes'][0]);
        $gold0 = $base['gold'];
        $this->assertGreaterThan(0, $gold0);

        config(['game.reward_scale.retry_mult' => 0.5, 'game.reward_scale.star_mult' => [1 => 1.0, 2 => 1.1, 3 => 1.2], 'game.reward_scale.bench_exp_pct' => 30]);
        $retry = $this->winStage($token, $uid);   // 재도전 0.5 x 별3 1.2 = 0.6
        $this->assertFalse($retry['first_clear']);
        $this->assertSame(0.6, (float) $retry['reward_mult']);
        $this->assertSame((int) floor($gold0 * 0.6), $retry['gold']);
        $this->assertCount(3, $retry['heroes']);   // 필수 주인공 + 시작 파티 2명 중 1명 출전 + 벤치 1명
        $this->assertTrue($retry['heroes'][2]['bench']);

        config(['game.reward_scale.stage_daily_cap' => 2]);   // 위 두 번 이미 소진 안 됨(cap=0일 땐 미집계) -> 3번째는 1번째 집계
        $this->winStage($token, $uid);
        $this->winStage($token, $uid);
        $this->assertSame('stage_daily_cap', $this->winStage($token, $uid)['reward_blocked']);
    }
}
