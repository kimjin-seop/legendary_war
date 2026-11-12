<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoomTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['game.rules.alternate_activation' => false]);   // end_turn 기반 흐름 검증: 교대 행동은 AlternateActivation*Test에서 별도 검증
        $this->artisan('game:seed')->assertSuccessful();
    }

    private function guest(string $nick): string
    {
        return $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated()->json('guest_token');
    }

    private function as(string $token): static
    {
        return $this->withHeaders(['X-Guest-Token' => $token]);
    }

    private function deploy(string $token, string $code, array $coords): void
    {
        $party = $this->as($token)->getJson('/api/party')->json('party');
        $placements = [];
        foreach ($coords as $i => [$x, $y]) {
            $placements[] = ['user_hero_id' => $party[$i], 'x' => $x, 'y' => $y];
        }
        $this->as($token)->putJson("/api/rooms/$code/deployment", ['placements' => $placements])->assertOk();
        $this->as($token)->postJson("/api/rooms/$code/confirm")->assertOk();
    }

    public function test_방_생성_참가_시작_행동교대_시간초과_기권(): void
    {
        $host = $this->guest('host');
        $guest = $this->guest('guest');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $this->assertSame(8, strlen($code));
        $this->assertSame($code, $this->as($guest)->getJson('/api/rooms')->json('rooms.0.code'));

        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertStatus(409)->assertJsonPath('error.code', 'not_all_ready');
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk()->assertJsonPath('room.status', 'deployment');

        $this->deploy($host, $code, $this->zoneCoords('a'));
        $this->as($host)->getJson("/api/rooms/$code")->assertJsonPath('room.status', 'deployment');
        $this->deploy($guest, $code, $this->zoneCoords('b'));

        $p = $this->as($host)->getJson("/api/rooms/$code")->assertJsonPath('room.status', 'in_progress');
        $p->assertJsonPath('turn.is_my_turn', true)->assertJsonPath('turn.side', 'a');
        $this->assertGreaterThan(0, $p->json('turn.remaining_seconds'));

        // 행동 교대: 상대 턴에는 거부(상태 불변), 내 턴에는 성공
        $this->as($guest)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertStatus(409)->assertJsonPath('error.code', 'not_your_turn');
        $this->as($host)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertOk()->assertJsonPath('turn.side', 'b');
        $inc = $this->as($guest)->getJson("/api/rooms/$code?after_seq=0")->assertJsonPath('turn.is_my_turn', true);
        $this->assertContains('turn_start', array_column($inc->json('events'), 'type'));
        $last = $inc->json('last_seq');
        $this->assertSame([], $this->as($guest)->getJson("/api/rooms/$code?after_seq=$last")->json('events'));   // 증분 조회
        $this->as($guest)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertOk();

        // 시간 초과: 방장 미응답 -> 자동 턴 종료, 상대도 미응답, 방장 연속 2회 미응답 -> 기권
        $battleId = DB::table('rooms')->where('code', $code)->value('battle_id');
        $expire = fn () => DB::table('battles')->where('id', $battleId)->update(['turn_deadline_at' => now()->subSeconds(10)]);   // 마감+유예(2초) 경과
        $expire();
        $this->as($host)->getJson("/api/rooms/$code")->assertJsonPath('turn.side', 'b')->assertJsonPath('players.0.missed_turns', 1);
        $expire();
        $this->as($host)->getJson("/api/rooms/$code")->assertJsonPath('turn.side', 'a');
        $expire();
        $end = $this->as($guest)->getJson("/api/rooms/$code")->assertJsonPath('battle_status', 'finished')->assertJsonPath('winner', 'b');
        $reasons = array_column(array_filter($end->json('events'), fn ($e) => $e['type'] === 'battle_end'), 'reason');
        $this->assertSame(['forfeit_timeout'], array_values($reasons));
        $this->as($host)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertStatus(409)->assertJsonPath('error.code', 'battle_finished');
    }

    public function test_MP_방식_방에서_상대_진영_MP는_5퍼센트_비율만_공개된다(): void
    {
        config(['game.rules.mp_skills' => true]);
        $host = $this->guest('host');
        $guest = $this->guest('guest');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        $this->deploy($host, $code, $this->zoneCoords('a'));
        $this->deploy($guest, $code, $this->zoneCoords('b'));

        $battleId = DB::table('rooms')->where('code', $code)->value('battle_id');
        $st = json_decode(DB::table('battles')->where('id', $battleId)->value('state'), true);
        $this->assertTrue($st['mp_mode']);
        $bid = collect($st['units'])->first(fn ($u) => $u['side'] === 'b' && $u['kind'] !== 'troop')['id'];
        $st['units'][$bid]['mp'] = 22;      // 22/45 = 49% -> 50 공개 기대(시드 영웅 MP 보유 여부와 무관하게 주입)
        $st['units'][$bid]['mp_max'] = 45;
        DB::table('battles')->where('id', $battleId)->update(['state' => json_encode($st)]);

        foreach (['host', 'guest', 'host'] as $who) {   // 세 번째 end_turn에서 b 진영 두 번째 틱(첫 틱은 건너뜀) -> 상대 mp_change 발생
            $this->as($who === 'host' ? $host : $guest)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertOk();
        }
        $p = $this->as($host)->getJson("/api/rooms/$code?after_seq=0")->assertOk();
        $foe = collect($p->json('events'))->filter(fn ($e) => ($e['side'] ?? null) === 'b' && in_array($e['type'], ['mp_change', 'skill_use'], true));
        $this->assertNotEmpty($foe);
        foreach ($foe as $e) {
            foreach (['mp', 'mp_max', 'mp_left', 'delta', 'overflow'] as $k) {
                $this->assertArrayNotHasKey($k, $e);
            }
            $this->assertSame(0, $e['mp_pct'] % 5);
        }
        $u = collect($p->json('battle.units'))->firstWhere('id', $bid);
        $this->assertArrayNotHasKey('mp', $u);
        $this->assertArrayNotHasKey('mp_max', $u);
        $this->assertSame(0, $u['mp_pct'] % 5);
        foreach ($u['active_skills'] ?? [] as $s) {   // 상대 영웅 스킬: usable/mp_left 없음, targets 빈 배열, mp_cost(정적)는 공개
            $this->assertArrayNotHasKey('usable', $s);
            $this->assertArrayNotHasKey('mp_left', $s);
            $this->assertSame([], $s['targets']);
            $this->assertArrayHasKey('mp_cost', $s);
        }
    }

    public function test_M1_상대_마감_초과로_tick이_만든_기권은_내_행동_호출에서도_커밋된다(): void
    {
        $host = $this->guest('host');
        $guest = $this->guest('guest');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        $this->deploy($host, $code, $this->zoneCoords('a'));
        $this->deploy($guest, $code, $this->zoneCoords('b'));

        // 방장 차례에서 방장이 마감+유예를 넘기고 누적 미응답이 한도 직전 -> 게스트가 행동 호출
        $battleId = DB::table('rooms')->where('code', $code)->value('battle_id');
        DB::table('room_players')->where('room_id', DB::table('rooms')->where('code', $code)->value('id'))->where('side', 'a')->update(['missed_turns' => (int) config('game.room.max_missed_turns') - 1]);
        DB::table('battles')->where('id', $battleId)->update(['turn_deadline_at' => now()->subSeconds(10)]);
        $this->as($guest)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertStatus(409)->assertJsonPath('error.code', 'battle_finished');

        $row = DB::table('battles')->find($battleId);   // 예외로 롤백되지 않고 커밋됐는지
        $this->assertSame('finished', $row->status);
        $this->assertSame('b', $row->winner);
        $this->assertNotNull($row->settled_at);
        $this->assertSame(1, DB::table('battle_actions')->where('battle_id', $battleId)->where('type', 'forfeit')->count());
    }

    public function test_follow_troops_옵션은_방_상태에_노출되고_기본_false다(): void
    {
        $h = $this->guest('fh');
        $on = $this->as($h)->postJson('/api/rooms', ['mode' => 'solo', 'follow_troops' => true])->assertCreated()->assertJsonPath('room.follow_troops', true)->json('room.code');
        $this->as($h)->getJson("/api/rooms/$on")->assertOk()->assertJsonPath('room.follow_troops', true);
        $this->as($h)->postJson("/api/rooms/$on/leave")->assertOk();
        $this->as($h)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated()->assertJsonPath('room.follow_troops', false);
    }

    public function test_solo_진행_중_나가기는_보상_없는_패배다(): void
    {
        $t = $this->guest('solo');
        $code = $this->as($t)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated()->json('room.code');
        $this->as($t)->postJson("/api/rooms/$code/start")->assertOk();
        $this->deploy($t, $code, $this->zoneCoords('a'));
        $this->as($t)->postJson("/api/rooms/$code/leave")->assertOk();

        $p = $this->as($t)->getJson("/api/rooms/$code")->assertJsonPath('room.status', 'finished')->assertJsonPath('winner', 'b');
        $this->assertTrue($p->json('result.abandoned'));
        $this->assertSame(500, (int) DB::table('wallets')->where('currency_code', 'gold')->value('balance'));   // 시작 골드 그대로
        $this->assertSame(0, (int) DB::table('user_heroes')->sum('exp'));
    }

    public function test_캠페인_전용_주인공은_방_편성에서_거부된다(): void
    {
        $this->artisan('game:seed-protagonist')->assertSuccessful();
        $host = $this->guest('host');
        $guest = $this->guest('guest');
        $this->as($host)->postJson('/api/protagonist', ['mode' => 'skip'])->assertOk();
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        $uhId = (int) DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('is_protagonist', true)->value('user_heroes.id');
        $this->assertGreaterThan(0, $uhId);
        [$c] = $this->zoneCoords('a');
        $this->as($host)->putJson("/api/rooms/$code/deployment", ['placements' => [['user_hero_id' => $uhId, 'x' => $c[0], 'y' => $c[1]]]])->assertStatus(422)->assertJsonPath('error.code', 'campaign_only_hero');
    }

    public function test_출전_영웅_수는_맵_크기로_고정되고_서버가_강제한다(): void
    {
        $host = $this->guest('host');
        $r = $this->as($host)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated();   // 기본 맵 16x12 = 소형
        $r->assertJsonPath('room.party_size', 3)->assertJsonPath('room.size_class', 'S');
        $code = $r->json('room.code');
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        $this->as($host)->getJson("/api/rooms/$code/deployment")->assertOk()->assertJsonPath('party_size', 3)->assertJsonPath('required_party', 2);   // 신규 유저 보유 영웅 2 -> 필수 2
        [$c] = $this->zoneCoords('a');
        $party = $this->as($host)->getJson('/api/party')->json('party');
        $this->as($host)->putJson("/api/rooms/$code/deployment", ['placements' => [['user_hero_id' => $party[0], 'x' => $c[0], 'y' => $c[1]]]])
            ->assertStatus(422)->assertJsonPath('error.code', 'party_size_mismatch');
        $this->as($host)->postJson("/api/rooms/$code/leave")->assertOk();
        $this->as($host)->postJson('/api/rooms', ['mode' => 'solo', 'map_code' => 'castle_01'])->assertCreated()->assertJsonPath('room.party_size', 4)->assertJsonPath('room.size_class', 'M');
    }

    public function test_solo_방은_제한시간이_없다(): void
    {
        $t = $this->guest('solo');
        $code = $this->as($t)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated()->json('room.code');
        $this->as($t)->postJson("/api/rooms/$code/start")->assertOk();
        $this->deploy($t, $code, $this->zoneCoords('a'));
        $battleId = DB::table('rooms')->where('code', $code)->value('battle_id');
        $this->assertNull(DB::table('battles')->where('id', $battleId)->value('turn_deadline_at'));

        DB::table('battles')->where('id', $battleId)->update(['turn_deadline_at' => now()->subSeconds(10)]);   // 마감 잔존해도 무시
        $p = $this->as($t)->getJson("/api/rooms/$code")->assertJsonPath('turn.side', 'a')->assertJsonPath('players.0.missed_turns', 0);
        $this->assertNull($p->json('turn.remaining_seconds'));
        $this->assertSame(0, $p->json('battle.turn_input_seconds'));
    }

    public function test_제3자는_방에_접근할_수_없다(): void
    {
        $host = $this->guest('host');
        $other = $this->guest('other');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated()->json('room.code');

        $this->as($other)->getJson("/api/rooms/$code")->assertStatus(404);
        $this->as($other)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertStatus(404);
        $this->as($other)->postJson("/api/rooms/$code/start")->assertStatus(404);
        $this->as($other)->postJson('/api/rooms/join', ['code' => $code])->assertStatus(404);   // solo 방은 참가 불가
        $this->assertSame([], $this->as($other)->getJson('/api/rooms')->json('rooms'));   // private/solo는 목록 비노출
    }
}
