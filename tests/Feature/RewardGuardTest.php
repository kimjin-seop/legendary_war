<?php

namespace Tests\Feature;

use App\Models\Battle;
use App\Models\User;
use App\Services\BattleService;
use App\Services\ProgressionService;
use App\Support\Period;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RewardGuardTest extends TestCase
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

    private function guest(): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'tester'])->assertCreated();

        return [$r->json('guest_token'), $r->json('user.id')];
    }

    /** 종료된 자유 대전 전투를 만든다(스테이지 전투 1건을 변환). */
    private function freeBattle(string $token, int $turn): int
    {
        $h = ['X-Guest-Token' => $token];
        $id = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $this->putDeployment($h, $id, [['user_hero_id' => $party[0], 'x' => 2, 'y' => 3]])->assertOk();
        DB::table('battles')->where('id', $id)->update(['mode' => 'free', 'stage_id' => null, 'status' => 'finished', 'winner' => 'a', 'turn' => $turn]);

        return $id;
    }

    public function test_같은_유저의_stale_인스턴스로_연속_정산해도_경험치가_모두_반영된다(): void
    {
        [, $uid] = $this->guest();
        $a = User::find($uid);
        $b = User::find($uid);   // 같은 시점에 읽은 stale 인스턴스
        $svc = app(ProgressionService::class);
        $svc->addUserExp($a, 30);
        $svc->addUserExp($b, 40);   // 합계 70, Lv1->2 필요 60 -> Lv2, exp 10

        $row = DB::table('users')->where('id', $uid)->first();
        $this->assertSame([2, 10], [(int) $row->level, (int) $row->exp]);
    }

    public function test_credit은_ref가_비면_예외(): void
    {
        [, $uid] = $this->guest();
        $this->expectException(\InvalidArgumentException::class);
        app(ProgressionService::class)->credit($uid, 'gold', 10, 'x', '', 0);
    }

    public function test_자유대전_최소턴_미달과_일일상한은_보상0과_사유코드(): void
    {
        [$token, $uid] = $this->guest();
        $svc = app(BattleService::class);
        $user = User::find($uid);

        $short = $this->freeBattle($token, 2);
        $svc->settle(Battle::find($short), $user);
        $this->assertSame('too_short', Battle::find($short)->result['reward_blocked']);
        $this->assertSame(0, Battle::find($short)->result['gold']);

        config(['game.free_limits.daily_reward_cap' => 50]);   // 1승 = 50 -> 두 번째부터 상한
        $ok = $this->freeBattle($token, 6);
        $svc->settle(Battle::find($ok), $user);
        $this->assertNull(Battle::find($ok)->result['reward_blocked']);
        $this->assertSame(20, Battle::find($ok)->result['gold']);
        $capped = $this->freeBattle($token, 6);
        $svc->settle(Battle::find($capped), $user);
        $this->assertSame('daily_cap', Battle::find($capped)->result['reward_blocked']);
    }

    public function test_정산_결과의_affinity_kills는_아군_상성유리_처치만_센다(): void
    {
        [$token, $uid] = $this->guest();
        $id = $this->freeBattle($token, 6);
        $a = 'a0';
        $st = Battle::find($id)->state;
        $st['units'] = ['a0' => ['id' => 'a0', 'side' => 'a'], 'b0' => ['id' => 'b0', 'side' => 'b']];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($st)]);
        $e = fn (string $t, string $actor, string $aff, bool $kill) => ['type' => $t, 'actor_unit_id' => $actor, 'affinity' => $aff, 'kill' => $kill];
        $events = [
            $e('attack', $a, 'adv', true),    // 집계
            $e('attack', $a, 'adv', false),   // 처치 아님
            $e('attack', $a, 'none', true),   // 상성 아님
            $e('counter', $a, 'adv', true),   // 반격 처치 제외
            $e('attack', 'b0', 'adv', true),  // 적측 공격 제외
        ];
        DB::table('battle_actions')->insert(['battle_id' => $id, 'seq' => 1, 'turn' => 1, 'side' => 'a', 'actor' => 'player', 'type' => 'attack',
            'payload' => '{}', 'events' => json_encode($events), 'created_at' => now()]);

        app(BattleService::class)->settle(Battle::find($id), User::find($uid));
        $this->assertSame(1, Battle::find($id)->result['affinity_kills']);
    }

    public function test_period_key는_KST_05시_경계(): void
    {
        $this->assertSame('2026-10-30', Period::dailyKey(Carbon::parse('2026-10-30 19:59:00', 'UTC')));   // KST 10-31 04:59
        $this->assertSame('2026-10-31', Period::dailyKey(Carbon::parse('2026-10-30 20:00:00', 'UTC')));   // KST 10-31 05:00
    }

    public function test_스테이지_도전은_진행중_전투_상한을_넘으면_가장_오래된_것을_포기처리(): void
    {
        [$token, $uid] = $this->guest();
        $ids = [];
        for ($i = 0; $i < 4; $i++) {
            $ids[] = $this->withHeaders(['X-Guest-Token' => $token])->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        }
        $this->assertSame('abandoned', DB::table('battles')->where('id', $ids[0])->value('status'));
        $this->assertSame(3, DB::table('battles')->where('user_id', $uid)->where('status', 'deployment')->count());
    }
}
