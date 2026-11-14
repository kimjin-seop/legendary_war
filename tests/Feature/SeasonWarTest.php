<?php

namespace Tests\Feature;

use App\Models\Battle;
use App\Models\User;
use App\Services\BattleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 시즌 전쟁 수직 슬라이스 핵심 동작(국가 선택·공격 검증·점령도·소유권 이전·중복 정산·기존 free 회귀) */
class SeasonWarTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['war.allow_guests' => true]);   // 테스트는 게스트 계정 사용
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

    /** 공격 시작 후 엔진이 공격자 승리로 끝난 상태를 만들어 실제 settle()을 호출한다. */
    private function attackAndWin(string $token, User $u, string $code): int
    {
        $id = $this->as($token)->postJson("/api/war/territories/$code/attack")->assertCreated()->json('battle_id');
        $b = Battle::findOrFail($id);
        $state = $b->state;
        $state['status'] = 'finished';
        $state['winner'] = 'a';
        DB::table('battles')->where('id', $id)->update(['status' => 'finished', 'winner' => 'a', 'state' => json_encode($state)]);
        app(BattleService::class)->settle(Battle::findOrFail($id), $u);

        return $id;
    }

    public function test_국가_선택_후_재선택_거부(): void
    {
        [$t] = $this->player('war1');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk()->assertJsonPath('me.country', 'japan');
        $this->as($t)->postJson('/api/war/join', ['country' => 'joseon'])->assertStatus(409)->assertJsonPath('error.code', 'already_joined');
        $this->assertSame(1, DB::table('season_members')->count());
    }

    public function test_시즌전쟁_비활성이면_가입과_공격_거부(): void
    {
        config(['game.season_war_enabled' => false]);
        [$t] = $this->player('waroff');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertStatus(403)->assertJsonPath('error.code', 'season_war_disabled');
        $this->as($t)->postJson('/api/war/territories/busan/attack')->assertStatus(403)->assertJsonPath('error.code', 'season_war_disabled');
        $this->assertSame(0, DB::table('season_members')->count());
    }

    public function test_비인접_영토와_자국_영토_공격_거부(): void
    {
        [$t] = $this->player('war2');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $this->as($t)->postJson('/api/war/territories/hanyang/attack')->assertStatus(422)->assertJsonPath('error.code', 'not_adjacent');
        $this->as($t)->postJson('/api/war/territories/busan/attack')->assertStatus(422)->assertJsonPath('error.code', 'own_territory');
        $map = $this->as($t)->getJson('/api/war/map')->assertOk()->json('territories');
        $by = collect($map)->keyBy('code');
        $this->assertTrue($by['jinju']['attackable']);
        $this->assertFalse($by['hanyang']['attackable']);
        $this->assertSame(0, DB::table('territory_battles')->count());
    }

    public function test_승리하면_점령도_20_증가하고_중복_정산은_1회만(): void
    {
        [$t, $u] = $this->player('war3');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $id = $this->attackAndWin($t, $u, 'jinju');
        $this->assertSame(20, (int) $this->terr('jinju')->occupation);
        $this->assertSame('siege', $this->terr('jinju')->state);
        $this->assertSame(1, DB::table('territory_occupation_logs')->count());
        $this->assertSame(10, (int) DB::table('season_members')->value('contribution'));

        app(BattleService::class)->settle(Battle::findOrFail($id), $u);   // 같은 결과 재제출
        $this->assertSame(20, (int) $this->terr('jinju')->occupation);
        $this->assertSame(1, DB::table('territory_occupation_logs')->count());
        $this->assertSame(10, (int) DB::table('season_members')->value('contribution'));
        $this->as($t)->getJson("/api/battles/$id/result")->assertOk();
    }

    public function test_open_battle_my_battles_정산_추가필드(): void
    {
        [$t, $u] = $this->player('war5');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $this->as($t)->getJson('/api/war/state')->assertOk()->assertJsonPath('open_battle', null)->assertJsonStructure(['party_check' => ['code', 'used', 'max']]);
        $id = $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertCreated()->json('battle_id');
        $this->as($t)->getJson('/api/war/state')->assertOk()->assertJsonPath('open_battle.battle_id', $id)->assertJsonPath('open_battle.territory_id', 'jinju');
        $this->as($t)->getJson('/api/war/my-battles')->assertOk()->assertJsonPath('battles.0.result', null)->assertJsonPath('battles.0.status', 'in_progress');

        $b = Battle::findOrFail($id);
        $state = $b->state;
        $state['status'] = 'finished';
        $state['winner'] = 'a';
        DB::table('battles')->where('id', $id)->update(['status' => 'finished', 'winner' => 'a', 'state' => json_encode($state)]);
        app(BattleService::class)->settle(Battle::findOrFail($id), $u);
        app(BattleService::class)->settle(Battle::findOrFail($id), $u);   // 중복 정산 회귀
        $w = json_decode(DB::table('battles')->where('id', $id)->value('result'), true);
        $this->assertSame([0, 20, 10], [$w['occupation_before'], $w['occupation_after'], $w['my_contribution_gain']]);
        $this->assertArrayHasKey('personal', $w['rank_after']);
        $this->assertSame(10, (int) DB::table('season_members')->value('contribution'));
        $this->as($t)->getJson('/api/war/state')->assertJsonPath('open_battle', null);
        $this->as($t)->getJson('/api/war/my-battles?limit=5')->assertOk()->assertJsonPath('battles.0.win', true)->assertJsonPath('battles.0.occ_delta', 20)->assertJsonCount(1, 'battles');
    }

    public function test_시즌_전투_보상은_1회만_지급되고_일일_상한을_넘으면_0(): void
    {
        [$t, $u] = $this->player('war7');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $uhId = (int) DB::table('parties')->where('user_id', $u->id)->value('user_hero_id');
        $id = $this->attackAndWin($t, $u, 'jinju');
        app(BattleService::class)->settle(Battle::findOrFail($id), $u);   // 중복 정산
        $r = json_decode(DB::table('battles')->where('id', $id)->value('result'), true);
        $this->assertSame(30, $r['reward']['exp']);
        $this->assertSame(0, $r['gold']);
        $this->assertSame(1, \App\Support\DailyCounter::value('war_reward:user:'.$u->id));
        $this->assertNotEmpty($r['reward']['heroes']);
        $this->assertSame($uhId, (int) $r['reward']['heroes'][0]['user_hero_id']);

        \App\Support\DailyCounter::tryIncrement('war_reward:user:'.$u->id, 3, 3);   // 상한 도달
        DB::table('territory_battles')->update(['created_at' => now()->subHour()]);
        $id2 = $this->attackAndWin($t, $u, 'jinju');
        $r2 = json_decode(DB::table('battles')->where('id', $id2)->value('result'), true);
        $this->assertSame([0, 'daily_cap'], [$r2['reward']['exp'], $r2['reward']['blocked']]);
    }

    public function test_포기한_시즌_전투는_보상이_없다(): void
    {
        [$t, $u] = $this->player('war8');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $id = $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertCreated()->json('battle_id');
        $this->as($t)->postJson("/api/battles/$id/abandon")->assertOk();
        $this->assertSame(0, \App\Support\DailyCounter::value('war_reward:user:'.$u->id));
        $r = json_decode(DB::table('battles')->where('id', $id)->value('result'), true);
        $this->assertSame([0, 'def_win'], [$r['reward']['exp'], $r['result']]);
        $tb = DB::table('territory_battles')->where('battle_id', $id)->first();
        $this->assertNotNull($tb->settled_at);
        $this->assertSame('def_win', $tb->result);
        $this->assertSame(0, (int) DB::table('season_members')->value('contribution'));
        $this->as($t)->postJson("/api/battles/$id/abandon")->assertOk();   // 재호출 멱등
        $this->assertSame($tb->settled_at, DB::table('territory_battles')->where('battle_id', $id)->value('settled_at'));
        $this->as($t)->getJson('/api/war/my-battles')->assertOk()->assertJsonPath('battles.0.result', 'def_win')->assertJsonPath('battles.0.win', false);
        $this->as($t)->getJson('/api/war/state')->assertJsonPath('open_battle', null);
    }

    public function test_unread_내_국가_이벤트만_집계하고_미가입_게스트는_빈_값(): void
    {
        [$t, $u] = $this->player('war9');
        $this->as($t)->getJson('/api/war/unread')->assertOk()->assertExactJson(['count' => 0, 'last_id' => 0, 'my_country' => null, 'season_id' => null]);   // 시즌 아직 없음   // 게스트(미가입 포함)
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $this->as($t)->getJson('/api/war/unread')->assertOk()->assertJsonPath('my_country', null);   // 게스트는 가입했어도 빈 값
        DB::table('users')->where('id', $u->id)->update(['is_guest' => false]);   // 이후는 회원으로 검증
        $sid = (int) DB::table('seasons')->value('id');
        $jp = (int) DB::table('season_countries')->where('country_code', 'japan')->value('id');
        $jo = (int) DB::table('season_countries')->where('country_code', 'joseon')->value('id');
        $ev = fn ($type, $sc, $payload = null) => DB::table('war_events')->insertGetId(['season_id' => $sid, 'type' => $type, 'season_country_id' => $sc, 'payload' => $payload]);
        $ev('capture', $jp);                                // 내가 점령
        $ev('capture', $jo, json_encode(['from' => 'japan']));   // 내가 잃음
        $last = $ev('capture', $jo, json_encode(['from' => 'ming']));   // 무관
        $ev('siege_start', $jp);                            // 대상 타입 아님
        $r = $this->as($t)->getJson('/api/war/unread?after_id=0')->assertOk()->json();
        $this->assertSame([2, 'japan'], [$r['count'], $r['my_country']]);
        $this->assertSame($last + 1, $r['last_id']);
        $this->assertSame($sid, $r['season_id']);
        $this->as($t)->getJson('/api/war/unread?after_id='.($last + 1))->assertOk()->assertJsonPath('count', 0);
    }

    public function test_점령도_100_도달시_소유권_이전(): void
    {
        [$t, $u] = $this->player('war4');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $japan = DB::table('season_countries')->where('country_code', 'japan')->value('id');
        DB::table('season_territories')->where('territory_code', 'jinju')->update(['occupation' => 80, 'state' => 'siege', 'siege_season_country_id' => $japan]);
        $this->attackAndWin($t, $u, 'jinju');
        $c = $this->terr('jinju');
        $this->assertSame((int) $japan, (int) $c->owner_season_country_id);
        $this->assertSame(0, (int) $c->occupation);
        $this->assertSame('peace', $c->state);
        $this->assertNull($c->siege_season_country_id);
        $this->assertSame(50, (int) DB::table('season_countries')->where('id', $japan)->value('score'));
        $this->assertSame(40, (int) DB::table('season_members')->value('contribution'));   // 승리 10 + 점령 30
        $this->assertTrue((bool) DB::table('territory_battles')->value('captured'));
        // 이제 전주가 일본 영토와 인접 -> 공격 가능
        $this->assertTrue(collect($this->as($t)->getJson('/api/war/map')->json('territories'))->keyBy('code')['jeonju']['attackable']);
    }

    public function test_쿨다운과_일일_한도_공격_거부(): void
    {
        [$t, $u] = $this->player('war6');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertCreated();
        $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertStatus(429)->assertJsonPath('error.code', 'cooldown');
        $this->assertSame(1, DB::table('territory_battles')->count());
        // 쿨다운 경과 + 진행 중 전투 종료 후에도 일일 한도를 다 쓰면 거부
        DB::table('territory_battles')->update(['created_at' => now()->subHour()]);
        DB::table('battles')->update(['status' => 'abandoned']);
        \App\Support\DailyCounter::tryIncrement('war_attack:user:'.$u->id, 100, 2);   // 이미 1회 사용 + 2 = 3회
        $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertStatus(429)->assertJsonPath('error.code', 'daily_limit');
    }

    public function test_지도_cooldown_until은_쿨다운_중에만_미래_시각(): void
    {
        [$t] = $this->player('war7');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        $by = fn () => collect($this->as($t)->getJson('/api/war/map')->assertOk()->json('territories'))->keyBy('code');
        $this->assertNull($by()['jinju']['cooldown_until']);
        $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertCreated();
        $g = $by()['jinju'];
        $this->assertSame('cooldown', $g['attack_blocked_reason']);
        $this->assertTrue(\Carbon\CarbonImmutable::parse($g['cooldown_until'])->isFuture());
        $this->assertNull($by()['hanyang']['cooldown_until']);
    }

    public function test_종료된_시즌은_가입과_공격_거부(): void
    {
        [$t] = $this->player('war7');
        $this->as($t)->postJson('/api/war/join', ['country' => 'japan'])->assertOk();
        DB::table('seasons')->update(['end_at' => now()->subMinute()]);
        $this->as($t)->postJson('/api/war/territories/jinju/attack')->assertStatus(409)->assertJsonPath('error.code', 'season_ended');
        [$t2] = $this->player('war8');
        $this->as($t2)->postJson('/api/war/join', ['country' => 'joseon'])->assertStatus(409)->assertJsonPath('error.code', 'season_ended');
        $this->as($t)->getJson('/api/war/state')->assertOk()->assertJsonPath('season.ended', true);
    }

    public function test_기존_free_전투_정산은_시즌_훅의_영향을_받지_않는다(): void
    {
        [, $u] = $this->player('war5');
        $mapId = DB::table('maps')->value('id');
        $b = Battle::create(['user_id' => $u->id, 'mode' => 'free', 'stage_id' => null, 'map_id' => $mapId, 'status' => 'finished', 'seed' => 1, 'turn' => 2, 'current_side' => 'a', 'version' => 0, 'winner' => 'a', 'state' => ['status' => 'finished', 'winner' => 'a'], 'deployment' => []]);
        app(BattleService::class)->settle($b, $u);
        $res = Battle::findOrFail($b->id)->result;
        $this->assertArrayNotHasKey('war', $res);
        $this->assertSame('too_short', $res['reward_blocked']);   // 기존 free 경로(최소 턴 미달 → 보상 0)
        $this->assertSame(0, DB::table('territory_battles')->count());
    }
}
