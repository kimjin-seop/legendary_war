<?php

namespace Tests\Feature;

use App\Services\RankService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RankQueueTest extends TestCase
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

    public function test_elo_계산_제로섬과_K32(): void
    {
        $this->assertSame([16, -16], RankService::deltas(1000, 1000, 1.0, 32));
        $this->assertSame([-16, 16], RankService::deltas(1000, 1000, 0.0, 32));
        $this->assertSame([0, 0], RankService::deltas(1000, 1000, 0.5, 32));
        [$d] = RankService::deltas(1400, 1000, 1.0, 32);   // 강자가 이기면 적게 얻음
        $this->assertSame(3, $d);
    }

    public function test_매치_결과_조회는_참가자만_가능하다(): void
    {
        config(['game.rank.enabled' => true]);
        $this->artisan('game:seed')->assertSuccessful();
        [$ta, $a] = $this->guest('mra');
        [$tb, $b] = $this->guest('mrb');
        [$tc] = $this->guest('mrc');
        $s = app(RankService::class)->currentSeason();
        $id = DB::table('rank_matches')->insertGetId(['season_id' => $s->id, 'user_a_id' => $a, 'user_b_id' => $b, 'rating_a_before' => 1000, 'rating_b_before' => 1000,
            'rating_a_after' => 1016, 'rating_b_after' => 984, 'status' => 'settled', 'result' => 'a', 'reason' => 'normal', 'created_at' => now(), 'updated_at' => now()]);
        $this->as($ta)->getJson("/api/rank/matches/$id")->assertOk()->assertJsonPath('result', 'win')->assertJsonPath('delta', 16);
        $this->as($tb)->getJson("/api/rank/matches/$id")->assertOk()->assertJsonPath('result', 'loss')->assertJsonPath('delta', -16);
        $this->as($tc)->getJson("/api/rank/matches/$id")->assertStatus(404);
    }

    public function test_플래그_off면_404(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        [$t] = $this->guest('off1');
        $this->as($t)->postJson('/api/rank/queue')->assertStatus(404)->assertJsonPath('error.code', 'rank_disabled');
        $this->as($t)->getJson('/api/rank/ranking')->assertStatus(404);
    }

    public function test_큐_매칭_후_포기는_패배_레이팅_반영(): void
    {
        config(['game.rank.enabled' => true, 'game.rank.allow_guests' => true]);
        $this->artisan('game:seed')->assertSuccessful();
        [$ta, $ua] = $this->guest('rka');
        [$tb, $ub] = $this->guest('rkb');
        $this->as($ta)->postJson('/api/rank/queue')->assertOk()->assertJsonPath('state', 'queued');
        $this->as($ta)->postJson('/api/rank/queue')->assertOk()->assertJsonPath('state', 'queued');   // 멱등
        $r = $this->as($tb)->postJson('/api/rank/queue')->assertOk()->assertJsonPath('state', 'matched');
        $code = $r->json('room_code');
        $this->as($ta)->getJson('/api/rank/queue')->assertJsonPath('state', 'matched')->assertJsonPath('room_code', $code);
        $this->assertSame('deployment', DB::table('rooms')->where('code', $code)->value('status'));

        $this->as($tb)->postJson("/api/rooms/$code/leave")->assertOk();   // 배치 중 이탈 = 기권패
        $m = DB::table('rank_matches')->first();
        $this->assertSame('settled', $m->status);
        $ratings = DB::table('rank_ratings')->pluck('rating', 'user_id');
        $this->assertSame(1016, $ratings[$ua]);
        $this->assertSame(984, $ratings[$ub]);
        $this->assertSame(1, (int) DB::table('rank_ratings')->where('user_id', $ub)->value('losses'));
        $this->as($ta)->getJson('/api/rank/ranking')->assertOk()->assertJsonPath('entries.0.rating', 1016)->assertJsonPath('entries.0.is_me', true);
        $this->as($ta)->getJson('/api/rank/queue')->assertJsonPath('state', 'idle');
    }

    public function test_레이팅_차가_크면_대기시간이_지나야_매칭(): void
    {
        config(['game.rank.enabled' => true, 'game.rank.allow_guests' => true]);
        $this->artisan('game:seed')->assertSuccessful();
        [$ta, $ua] = $this->guest('rkc');
        [$tb, $ub] = $this->guest('rkd');
        $s = app(RankService::class)->currentSeason();
        DB::table('rank_ratings')->insert(['season_id' => $s->id, 'user_id' => $ub, 'rating' => 1300, 'peak_rating' => 1300, 'created_at' => now(), 'updated_at' => now()]);
        $this->as($ta)->postJson('/api/rank/queue')->assertJsonPath('state', 'queued');
        $this->as($tb)->postJson('/api/rank/queue')->assertJsonPath('state', 'queued');   // 차 300 > 허용 100
        DB::table('rank_queue')->update(['queued_at' => now()->subSeconds(60)]);          // 60초 -> 100+300 = 400 허용
        $this->as($tb)->getJson('/api/rank/queue')->assertJsonPath('state', 'matched');
    }
}
