<?php

namespace Tests\Feature;

use Illuminate\Database\QueryException;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Route;
use Tests\TestCase;

class RoomPollingTest extends TestCase
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

    private function as(string $t): static
    {
        return $this->withHeaders(['X-Guest-Token' => $t]);
    }

    private function deploy(string $t, string $code, array $coords): void
    {
        $party = $this->as($t)->getJson('/api/party')->json('party');
        $pl = [];
        foreach ($coords as $i => [$x, $y]) {
            $pl[] = ['user_hero_id' => $party[$i], 'x' => $x, 'y' => $y];
        }
        $this->as($t)->putJson("/api/rooms/$code/deployment", ['placements' => $pl])->assertOk();
        $this->as($t)->postJson("/api/rooms/$code/confirm")->assertOk();
    }

    /** @return array{0:string,1:string,2:string} [host, guest, code] pvp 전투 진행 중 */
    private function startedPvp(): array
    {
        $host = $this->guest('hosty');
        $guest = $this->guest('guesty');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->json('room.code');
        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        $this->deploy($host, $code, $this->zoneCoords('a'));
        $this->deploy($guest, $code, $this->zoneCoords('b'));

        return [$host, $guest, $code];
    }

    public function test_오래_쉰_행동자는_tick_전에_접속_갱신되어_기권되지_않는다(): void
    {
        [$host, , $code] = $this->startedPvp();
        $roomId = DB::table('rooms')->where('code', $code)->value('id');
        DB::table('room_players')->where(['room_id' => $roomId, 'side' => 'a'])->update(['last_seen_at' => now()->subSeconds(100)]);

        $this->as($host)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertOk()->assertJsonPath('battle_status', 'in_progress');
        $this->assertSame('in_progress', DB::table('battles')->where('room_id', $roomId)->value('status'));
    }

    public function test_이벤트_seq_컬럼과_증분_폴링(): void
    {
        [$host, $guest, $code] = $this->startedPvp();
        $this->as($host)->postJson("/api/rooms/$code/actions", ['type' => 'end_turn'])->assertOk();

        $b = DB::table('battles')->where('room_id', DB::table('rooms')->where('code', $code)->value('id'))->first();
        $row = DB::table('battle_actions')->where('battle_id', $b->id)->first();
        $this->assertNotNull($row->first_event_seq);
        $this->assertSame((int) $b->last_event_seq, (int) DB::table('battle_actions')->where('battle_id', $b->id)->max('last_event_seq'));

        $p = $this->as($guest)->getJson("/api/rooms/$code?after_seq=0")->assertOk();
        $this->assertSame((int) $b->last_event_seq, $p->json('last_seq'));
        $this->assertNotEmpty($p->json('events'));
        $this->assertSame([], $this->as($guest)->getJson("/api/rooms/$code?after_seq=".$p->json('last_seq'))->json('events'));
    }

    public function test_무활동_대기방은_만료되어_목록과_활성방_잠김에서_제외된다(): void
    {
        $host = $this->guest('ghost');
        $viewer = $this->guest('viewer');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->json('room.code');
        $this->assertCount(1, $this->as($viewer)->getJson('/api/rooms')->json('rooms'));

        DB::table('room_players')->update(['last_seen_at' => now()->subMinutes(31)]);
        $this->assertSame([], $this->as($viewer)->getJson('/api/rooms')->json('rooms'));
        $this->assertSame('closed', DB::table('rooms')->where('code', $code)->value('status'));
        $this->as($host)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated();   // already_in_room 잠김 없음
    }

    public function test_database_is_locked는_503_retry_after로_매핑된다(): void
    {
        Route::get('/api/_locked_probe', fn () => throw new QueryException('sqlite', 'select 1', [], new \PDOException('database is locked')));

        $this->getJson('/api/_locked_probe')->assertStatus(503)->assertHeader('Retry-After', '1')->assertJsonPath('error.code', 'db_busy');
    }
}
