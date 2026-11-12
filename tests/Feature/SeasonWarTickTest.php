<?php

namespace Tests\Feature;

use App\Models\Battle;
use App\Models\User;
use App\Services\BattleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 시즌 전쟁 2단계: war:tick(정체 감소·오프라인 방어 상한·AI 행동·시즌 종료), 순위/피드/기록 API */
class SeasonWarTickTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['war.allow_guests' => true, 'war.ai.grace_hours' => 0]);   // 유예는 전용 테스트에서만 켠다
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('war:seed')->assertSuccessful();
    }

    /** @return array{0:string,1:User} */
    private function player(string $nick): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated();

        return [$r->json('guest_token'), User::findOrFail($r->json('user.id'))];
    }

    private function as(string $t): static
    {
        return $this->withHeaders(['X-Guest-Token' => $t]);
    }

    private function terr(string $code): object
    {
        return DB::table('season_territories')->where('territory_code', $code)->first();
    }

    private function sc(string $code): int
    {
        return (int) DB::table('season_countries')->where('country_code', $code)->value('id');
    }

    private function siege(string $territory, string $by, int $occ, $lastBattleAt): void
    {
        DB::table('season_territories')->where('territory_code', $territory)->update(['state' => 'siege', 'siege_season_country_id' => $this->sc($by), 'occupation' => $occ, 'last_battle_at' => $lastBattleAt, 'last_decay_at' => null]);
    }

    public function test_정체_48시간_후_점령도_10_감소하고_0이면_공성_종료(): void
    {
        config(['war.ai.max_battles_per_tick' => 0]);
        $this->siege('jinju', 'japan', 50, now()->subHours(47));
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(50, (int) $this->terr('jinju')->occupation);   // 48h 전에는 변화 없음

        DB::table('season_territories')->where('territory_code', 'jinju')->update(['last_battle_at' => now()->subHours(49)]);
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(40, (int) $this->terr('jinju')->occupation);
        $this->artisan('war:tick')->assertSuccessful();   // 같은 날 재실행은 멱등(24h 간격)
        $this->assertSame(40, (int) $this->terr('jinju')->occupation);

        DB::table('season_territories')->where('territory_code', 'jinju')->update(['occupation' => 5, 'last_decay_at' => now()->subHours(25)]);
        DB::table('territory_occupation_logs')->delete();
        $this->artisan('war:tick')->assertSuccessful();
        $t = $this->terr('jinju');
        $this->assertSame(0, (int) $t->occupation);
        $this->assertSame('peace', $t->state);
        $this->assertNull($t->siege_season_country_id);
        $this->assertSame(1, DB::table('war_events')->where('type', 'siege_end')->count());
    }

    public function test_오프라인_방어_상한_영토당_하루_감소_20_초과_안함(): void
    {
        config(['war.ai.max_battles_per_tick' => 0]);
        $this->siege('jinju', 'japan', 60, now()->subDays(5));
        $id = (int) $this->terr('jinju')->id;
        foreach ([10, 10] as $i => $_) {   // 오늘 이미 20 감소
            DB::table('territory_occupation_logs')->insert(['season_id' => 1, 'season_territory_id' => $id, 'kind' => 'stagnation', 'occ_before' => 80 - $i * 10, 'occ_after' => 70 - $i * 10, 'created_at' => now()]);
        }
        DB::table('season_territories')->where('id', $id)->update(['last_decay_at' => now()->subHours(30)]);
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(60, (int) $this->terr('jinju')->occupation);   // 상한 도달 -> 추가 감소 없음
    }

    public function test_AI_행동은_실행당_상한과_사람_기여_보호_규칙을_지킨다(): void
    {
        // 사람 없는 국가: 실행당 상한(2) 만큼만 자동 전투, 영토당 하루 1회, 개인 기여도 미포함
        config(['war.ai.max_battles_per_tick' => 2]);
        $this->artisan('war:tick')->assertSuccessful();
        $ai = DB::table('territory_battles')->where('source', 'ai_sim')->get();
        $this->assertSame(2, $ai->count());
        $this->assertSame($ai->count(), $ai->pluck('season_territory_id')->unique()->count());
        $this->assertNull($ai->first()->battle_id);
        $this->assertSame(0, DB::table('territory_contributions')->count());
        $this->assertSame($ai->count(), DB::table('war_events')->where('type', 'ai_attack')->count());

        // 사람 있는 국가(일본, 사람 1명): 사람 공격 1회 -> AI 상한 floor(1*50%)=0, 사람 공격 2회 -> 1회이며 사람이 공격한 영토(②)는 제외
        DB::table('territory_battles')->delete();
        DB::table('war_events')->delete();
        [$t2, $u] = $this->player('ai2');
        $this->as($t2)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $japan = $this->sc('japan');
        $row = fn (string $terr) => ['season_id' => 1, 'season_territory_id' => $this->terr($terr)->id, 'battle_id' => null, 'source' => 'player', 'attacker_sc_id' => $japan, 'defender_sc_id' => $this->sc('joseon'), 'attacker_user_id' => $u->id, 'created_at' => now(), 'updated_at' => now()];
        DB::table('territory_battles')->insert($row('jinju'));
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(0, DB::table('territory_battles')->where('source', 'ai_sim')->where('attacker_sc_id', $japan)->count());
        DB::table('territory_battles')->insert($row('jinju'));
        $this->artisan('war:tick')->assertSuccessful();
        $jp = DB::table('territory_battles')->where('source', 'ai_sim')->where('attacker_sc_id', $japan)->get();
        $this->assertLessThanOrEqual(1, $jp->count());
        $jp->each(fn ($b) => $this->assertNotSame((int) $this->terr('jinju')->id, (int) $b->season_territory_id));
    }

    public function test_순위_피드_API(): void
    {
        [$t, $u] = $this->player('rank1');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $id = $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertCreated()->json('battle_id');
        $state = Battle::findOrFail($id)->state;
        $state['status'] = 'finished';
        $state['winner'] = 'a';
        DB::table('battles')->where('id', $id)->update(['status' => 'finished', 'winner' => 'a', 'state' => json_encode($state)]);
        app(BattleService::class)->settle(Battle::findOrFail($id), $u);

        $r = $this->as($t)->getJson('/api/war/ranking')->assertOk();
        $this->assertSame(10, $r->json('players.0.contribution'));
        $this->assertSame(2, count($r->json("countries")));
        $this->assertTrue($r->json('my_country_members.0.me'));
        $this->assertArrayNotHasKey('user_id', $r->json('players.0'));
        $this->assertSame(1, $r->json('my_country_members.0.attack_wins'));
        $this->assertSame(1, $r->json('me.rank'));
        $e = $this->as($t)->getJson('/api/war/events')->assertOk();
        $this->assertSame('siege_start', $e->json('events.0.type'));
        $this->assertSame('진주', $e->json('events.0.territory_name'));
        $this->as($t)->getJson('/api/war/events?after_id='.$e->json('last_id'))->assertOk()->assertJsonPath('events', []);
    }

    public function test_시즌_종료는_결과를_저장하고_이전_기록을_보존하며_새_시즌을_만든다(): void
    {
        config(['war.ai.max_battles_per_tick' => 0]);
        [$t, $u] = $this->player('end1');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        DB::table('season_members')->update(['contribution' => 40]);
        DB::table('season_countries')->where('id', $this->sc('japan'))->update(['score' => 100]);
        DB::table('seasons')->update(['end_at' => now()->subMinute()]);

        $this->artisan('war:tick')->assertSuccessful();
        $this->artisan('war:tick')->assertSuccessful();   // 재실행 멱등
        $this->assertSame('ended', DB::table('seasons')->where('id', 1)->value('status'));
        $this->assertSame(1, DB::table('season_results')->count());
        $this->assertSame(2, DB::table('seasons')->count());
        $this->assertSame('active', DB::table('seasons')->where('id', 2)->value('status'));
        $this->assertSame(10, DB::table('season_territories')->where('season_id', 1)->count());   // 이전 시즌 영토 기록 보존
        $this->assertSame(0, DB::table('season_members')->where('season_id', 2)->count());       // 새 시즌은 국가 재선택
        $h = $this->as($t)->getJson('/api/war/history')->assertOk();
        $this->assertSame('japan', $h->json('seasons.0.winner.code'));
        $this->assertSame('japan', $h->json('seasons.0.ranking.0.code'));
        $this->assertSame($this->sc('japan'), (int) DB::table('seasons')->where('id', 1)->value('winner_season_country_id'));
        $this->assertTrue($h->json('seasons.0.mvp.me'));
        $this->assertArrayNotHasKey('user_id', $h->json('seasons.0.mvp'));
        $this->as($t)->getJson('/api/war/state')->assertOk()->assertJsonPath('season.id', 2)->assertJsonPath('me.joined', false);
    }

    public function test_명은_국가가_아니라_조선_소속_원군_메타이며_가입_선택지에_없다(): void
    {
        [$t] = $this->player('ally1');
        $this->as($t)->postJson('/api/war/join', ['country' => 'ming'])->assertStatus(422)->assertJsonPath('error.code', 'invalid_country');
        $st = $this->as($t)->getJson('/api/war/state')->assertOk();
        $this->assertSame(['joseon', 'japan'], array_column($st->json('countries'), 'code'));
        $this->assertSame([['code' => 'ming', 'name' => '명', 'label' => '원군']], collect($st->json('countries'))->firstWhere('code', 'joseon')['allies']);
        $codes = array_column($this->as($t)->getJson('/api/war/map')->json('territories'), 'code');
        $this->assertNotContains('liaodong', $codes);
        $this->assertNotContains('beijing', $codes);
    }

    public function test_기존_3국_시즌은_war_seed_동기화로_명을_정리하고_가입자는_조선으로_옮긴다(): void
    {
        [$t, $u] = $this->player('mig1');
        $ming = DB::table('season_countries')->insertGetId(['season_id' => 1, 'country_code' => 'ming', 'member_count' => 1, 'created_at' => now(), 'updated_at' => now()]);
        foreach (['liaodong', 'beijing'] as $c) {
            DB::table('season_territories')->insert(['season_id' => 1, 'territory_code' => $c, 'owner_season_country_id' => $ming, 'created_at' => now(), 'updated_at' => now()]);
        }
        DB::table('season_members')->insert(['season_id' => 1, 'user_id' => $u->id, 'season_country_id' => $ming, 'joined_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $this->artisan('war:seed')->assertSuccessful();
        $this->assertSame(0, DB::table('season_countries')->where('country_code', 'ming')->count());
        $this->assertSame(0, DB::table('season_territories')->whereIn('territory_code', ['liaodong', 'beijing'])->count());
        $this->assertSame($this->sc('joseon'), (int) DB::table('season_members')->where('user_id', $u->id)->value('season_country_id'));
        $this->assertSame(1, (int) DB::table('season_countries')->where('id', $this->sc('joseon'))->value('member_count'));
    }

    public function test_war_tick은_락이_잡혀_있으면_실행하지_않는다(): void
    {
        $this->siege('jinju', 'japan', 50, now()->subDays(5));
        config(['war.ai.max_battles_per_tick' => 0]);
        $lock = \Illuminate\Support\Facades\Cache::lock('war:tick', 60);
        $this->assertTrue($lock->get());
        $this->artisan('war:tick')->expectsOutputToContain('이미 실행 중')->assertSuccessful();
        $this->assertSame(50, (int) $this->terr('jinju')->occupation);
        $lock->release();
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(40, (int) $this->terr('jinju')->occupation);
    }

    public function test_평시_방어_승은_정체_타이머를_설정하지_않고_새_공성은_설정한다(): void
    {
        [$t, $u] = $this->player('m3');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $finish = function (string $winner) use ($t, $u) {
            $id = $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertCreated()->json('battle_id');
            $state = Battle::findOrFail($id)->state;
            $state['status'] = 'finished';
            $state['winner'] = $winner;
            DB::table('battles')->where('id', $id)->update(['status' => 'finished', 'winner' => $winner, 'state' => json_encode($state)]);
            app(BattleService::class)->settle(Battle::findOrFail($id), $u);
        };
        $finish('b');   // 방어 승
        $this->assertNull($this->terr('jinju')->last_battle_at);
        DB::table('territory_battles')->update(['created_at' => now()->subHours(2)]);   // 쿨다운 경과
        $finish('a');   // 새 공성 시작
        $this->assertNotNull($this->terr('jinju')->last_battle_at);
    }

    public function test_시즌_시작_유예_중에는_AI가_공격하지_않고_가입자가_생기면_해제된다(): void
    {
        config(['war.ai.grace_hours' => 24, 'war.ai.max_battles_per_tick' => 1]);
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(0, DB::table('territory_battles')->where('source', 'ai_sim')->count());
        [$t] = $this->player('grace1');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $this->artisan('war:tick')->assertSuccessful();
        $this->assertSame(1, DB::table('territory_battles')->where('source', 'ai_sim')->count());
    }

    public function test_events는_after_id_지정시_오름차순으로_이어받고_내부_id를_노출하지_않는다(): void
    {
        [$t] = $this->player('ev1');
        for ($i = 1; $i <= 5; $i++) {
            DB::table('war_events')->insert(['season_id' => 1, 'type' => 'capture', 'season_country_id' => $this->sc('japan'), 'payload' => json_encode(['n' => $i, 'from' => 'joseon']), 'created_at' => now()]);
        }
        $a = $this->as($t)->getJson('/api/war/events?limit=2')->assertOk();
        $this->assertSame([5, 4], array_column($a->json('events'), 'id'));
        $this->assertSame(5, $a->json('last_id'));
        $b = $this->as($t)->getJson('/api/war/events?after_id=1&limit=2')->assertOk();
        $this->assertSame([2, 3], array_column($b->json('events'), 'id'));
        $this->assertSame(3, $b->json('last_id'));
        $this->assertSame('japan', $b->json('events.0.country'));
        $this->assertStringNotContainsString('_sc', json_encode($b->json()));
    }
}
