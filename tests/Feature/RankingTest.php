<?php

namespace Tests\Feature;

use App\Models\Battle;
use App\Models\User;
use App\Services\BattleService;
use App\Support\Period;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Laravel\Sanctum\Sanctum;
use Tests\TestCase;

class RankingTest extends TestCase
{
    use RefreshDatabase;

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function member(string $name, int $level, int $exp = 0): User
    {
        $u = new User;
        $u->forceFill(['name' => $name, 'email' => strtolower($name).'@example.com', 'password' => 'x', 'is_guest' => false, 'role' => 'user', 'level' => $level, 'exp' => $exp])->save();

        return $u;
    }

    private function pvpWin(User $winner, User $loser, string $settledAt, bool $forfeit = false, bool $recognized = true): void
    {
        DB::table('battles')->insert([
            'user_id' => $winner->id, 'opponent_user_id' => $loser->id, 'mode' => 'pvp', 'map_id' => DB::table('maps')->value('id'), 'status' => 'finished', 'seed' => 1,
            'winner' => 'a', 'state' => '{}', 'settled_at' => $settledAt, 'winner_user_id' => $winner->id, 'win_by_forfeit' => $forfeit, 'pvp_recognized' => $recognized, 'created_at' => $settledAt, 'updated_at' => $settledAt,
        ]);
    }

    public function test_주간_키_경계_월요일_0500_KST(): void
    {
        $this->assertSame('2026-10-26', Period::weeklyKey(Carbon::parse('2026-11-01 19:59:59', 'UTC')));   // 월 04:59:59 KST = 이전 주
        $this->assertSame('2026-11-02', Period::weeklyKey(Carbon::parse('2026-11-01 20:00:00', 'UTC')));   // 월 05:00:00 KST = 새 주
        $this->assertSame('2026-11-02', Period::weeklyKey(Carbon::parse('2026-11-08 19:59:59', 'UTC')));   // 다음 월 04:59:59 KST
        $this->assertSame('2026-11-09', Period::weeklyKey(Carbon::parse('2026-11-08 20:00:00', 'UTC')));
        [$from, $to] = Period::weeklyRangeUtc(Carbon::parse('2026-11-04 12:00:00', 'UTC'));
        $this->assertSame('2026-11-01 20:00:00', $from->format('Y-m-d H:i:s'));
        $this->assertSame('2026-11-08 20:00:00', $to->format('Y-m-d H:i:s'));
    }

    public function test_레벨_보드_화이트리스트_게스트_정지_제외_내순위_동점규칙(): void
    {
        $a = $this->member('Alpha', 5, 10);
        $b = $this->member('Bravo', 5, 10);   // 동점: id 빠른 Alpha 우선
        $c = $this->member('Charlie', 9, 0);
        $banned = $this->member('Banned', 30);
        DB::table('users')->where('id', $banned->id)->update(['banned_at' => now()]);
        $g = new User;
        $g->forceFill(['name' => 'Guest#0001', 'email' => 'g@guest.invalid', 'password' => 'x', 'is_guest' => true, 'role' => 'user', 'level' => 40])->save();

        Sanctum::actingAs($b, [], 'sanctum');
        $r = $this->getJson('/api/ranking?board=level')->assertOk();
        $this->assertSame(['Charlie', 'Alpha', 'Bravo'], array_column($r->json('entries'), 'name'));
        foreach ($r->json('entries') as $e) {
            $this->assertSame(['rank', 'name', 'level', 'exp', 'is_me'], array_keys($e));   // user_id·email 없음
        }
        $this->assertStringNotContainsString('example.com', $r->getContent());
        $this->assertStringNotContainsString('user_id', $r->getContent());
        $r->assertJsonPath('me.rank', 3)->assertJsonPath('me.name', 'Bravo')->assertJsonPath('entries.2.is_me', true);

        Sanctum::actingAs($g, [], 'sanctum');
        $this->getJson('/api/ranking?board=level')->assertOk()->assertJsonPath('me', null)->assertJsonPath('me_status', 'excluded_guest');
        $this->getJson('/api/ranking?board=nope')->assertStatus(422)->assertJsonPath('error.code', 'invalid_board');
    }

    public function test_주간_pvp_승수_기권_제외_주_경계_내순위(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        Carbon::setTestNow(Carbon::parse('2026-11-04 12:00:00', 'UTC'));
        Cache::flush();
        $a = $this->member('Alpha', 3);
        $b = $this->member('Bravo', 3);
        $c = $this->member('Charlie', 3);
        $this->pvpWin($a, $b, '2026-11-03 01:00:00');
        $this->pvpWin($a, $b, '2026-11-03 02:00:00');
        $this->pvpWin($b, $a, '2026-11-03 03:00:00');
        $this->pvpWin($b, $a, '2026-11-03 04:00:00', true);          // 기권 승리(인정 조건 충족분): 포함(count_forfeit_wins=true)
        $this->pvpWin($c, $a, '2026-11-03 05:00:00', false, false);  // 미인정(최소 라운드·상대쌍 상한 등): 제외
        $this->pvpWin($c, $a, '2026-11-01 19:59:59');                // 지난 주(월 04:59 KST): 제외
        $this->pvpWin($c, $a, '2026-11-01 20:00:00');                // 이번 주 시작 경계: 포함

        Sanctum::actingAs($c, [], 'sanctum');
        $r = $this->getJson('/api/ranking?board=weekly_pvp')->assertOk();
        $this->assertSame([['Alpha', 2], ['Bravo', 2], ['Charlie', 1]], array_map(fn ($e) => [$e['name'], $e['wins']], $r->json('entries')));
        $r->assertJsonPath('week.key', '2026-11-02')->assertJsonPath('me.rank', 3)->assertJsonPath('me.wins', 1);   // 동승: 먼저 달성한 Alpha가 Bravo보다 앞
    }

    public function test_PvP_인정_기준_최소라운드_양측행동_쌍상한_기권승자만(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $a = $this->member('Alpha', 1);
        $b = $this->member('Bravo', 1);
        $mk = function (int $turn, array $sides, string $reason = '', string $winner = 'a') use ($a, $b): Battle {
            $id = DB::table('battles')->insertGetId([
                'user_id' => $a->id, 'opponent_user_id' => $b->id, 'mode' => 'pvp', 'map_id' => DB::table('maps')->value('id'), 'status' => 'finished', 'seed' => 1, 'turn' => $turn,
                'winner' => $winner, 'state' => json_encode(['end_reason' => $reason]), 'created_at' => now(), 'updated_at' => now(),
            ]);
            foreach ($sides as $i => $s) {
                DB::table('battle_actions')->insert(['battle_id' => $id, 'seq' => $i + 1, 'turn' => 1, 'side' => $s, 'actor' => 'player', 'type' => 'move', 'payload' => '{}', 'events' => '[]', 'created_at' => now()]);
            }

            return Battle::find($id);
        };
        $svc = app(BattleService::class);
        $rec = fn (Battle $x) => (int) DB::table('battles')->where('id', $x->id)->value('pvp_recognized');

        $short = $mk(2, ['a', 'b']);
        $svc->settle($short, $a);
        $this->assertSame(0, $rec($short));                       // 최소 라운드 미달
        $oneSide = $mk(5, ['a']);
        $svc->settle($oneSide, $a);
        $this->assertSame(0, $rec($oneSide));                     // 한쪽만 행동
        $forfeit = $mk(5, ['a', 'b'], 'forfeit_left', 'a');
        $svc->settle($forfeit, $a);
        $this->assertSame(1, $rec($forfeit));                     // 기권 종료도 조건 충족 시 인정(승자만 퀘스트 기록)
        $this->assertSame(0, DB::table('quest_event_log')->where('user_id', $b->id)->count());   // 패자 기권자는 pvp_play 비인정
        $this->assertGreaterThan(0, DB::table('quest_event_log')->where('user_id', $a->id)->count());
        foreach ([1, 2] as $_) {   // 같은 쌍 상한 3: 위 기권 판 1회 + 2회 더 인정, 4번째부터 미인정
            $x = $mk(5, ['a', 'b']);
            $svc->settle($x, $a);
            $this->assertSame(1, $rec($x));
        }
        $over = $mk(5, ['a', 'b']);
        $svc->settle($over, $a);
        $this->assertSame(0, $rec($over));
    }

    public function test_settle이_PvP_승자_user_id를_기록한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $a = $this->member('Alpha', 1);
        $b = $this->member('Bravo', 1);
        $id = DB::table('battles')->insertGetId([
            'user_id' => $a->id, 'opponent_user_id' => $b->id, 'mode' => 'pvp', 'map_id' => DB::table('maps')->value('id'), 'status' => 'finished', 'seed' => 1,
            'winner' => 'b', 'state' => json_encode(['end_reason' => 'forfeit_timeout']), 'created_at' => now(), 'updated_at' => now(),
        ]);
        app(BattleService::class)->settle(Battle::find($id), $a);
        $row = DB::table('battles')->find($id);
        $this->assertSame((int) $b->id, (int) $row->winner_user_id);
        $this->assertSame(1, (int) $row->win_by_forfeit);
    }
}
