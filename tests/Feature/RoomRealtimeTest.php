<?php

namespace Tests\Feature;

use App\Events\RealtimePing;
use App\Events\RoomChanged;
use App\Support\RoomRealtime;
use App\Events\RoomChatPosted;
use App\Services\RoomService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Event;
use Tests\TestCase;

/** 웹소켓(Reverb) 1단계: 방/채팅 ping 발행, 채널 인증(게스트 포함), 서버 tick(폴링 없이 기권 처리) */
class RoomRealtimeTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        config(['game.rules.alternate_activation' => false]);
        $this->artisan('game:seed')->assertSuccessful();
    }

    private function useReverb(): void
    {
        config(['broadcasting.default' => 'reverb', 'broadcasting.connections.reverb.key' => 'k', 'broadcasting.connections.reverb.secret' => 's', 'broadcasting.connections.reverb.app_id' => '1']);
    }

    private function guest(string $nick): string
    {
        return $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated()->json('guest_token');
    }

    private function as(string $t): static
    {
        return $this->withHeaders(['X-Guest-Token' => $t]);
    }

    /** @return array{0:string,1:string,2:string} [host, guest, code] 대기 중 pvp 방 */
    private function waitingRoom(): array
    {
        $host = $this->guest('hosty');
        $guest = $this->guest('guesty');
        $code = $this->as($host)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->json('room.code');
        $this->as($guest)->postJson('/api/rooms/join', ['code' => $code])->assertOk();

        return [$host, $guest, $code];
    }

    public function test_방_변경과_채팅은_reverb일_때만_ping을_발행한다(): void
    {
        Event::fake([RoomChanged::class, RoomChatPosted::class]);
        [$host, $guest, $code] = $this->waitingRoom();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        Event::assertNotDispatched(RoomChanged::class);   // log/null 드라이버: 기존 동작과 동일(무발행)

        $this->useReverb();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => false])->assertOk();
        Event::assertDispatched(RoomChanged::class, fn ($e) => $e->code === $code && $e->broadcastOn()[0]->name === "private-room.$code" && $e->broadcastWith() === ['seq' => 0]);
        $r = $this->as($host)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'gl'])->assertCreated();
        Event::assertDispatched(RoomChatPosted::class, fn ($e) => $e->id === $r->json('message.id') && $e->broadcastOn()[0]->name === "private-room.$code.chat");
    }

    public function test_채널_인증은_방_참가자만_통과하고_게스트_토큰을_지원한다(): void
    {
        Event::fake([RoomChanged::class, RoomChatPosted::class]);   // 실제 Reverb 서버로 전송하지 않음
        $this->useReverb();
        [$host, , $code] = $this->waitingRoom();
        $outsider = $this->guest('outsider');
        $body = ['socket_id' => '123.456', 'channel_name' => "private-room.$code"];

        $this->flushHeaders();   // as() 의 X-Guest-Token 이 남아 있지 않게
        $this->postJson('/api/broadcasting/auth', $body)->assertStatus(401);
        $this->as($outsider)->postJson('/api/broadcasting/auth', $body)->assertStatus(403);
        $this->as($host)->postJson('/api/broadcasting/auth', $body)->assertOk()->assertJsonStructure(['auth']);
        $this->as($host)->postJson('/api/broadcasting/auth', ['socket_id' => '123.456', 'channel_name' => "private-room.$code.chat"])->assertOk();
    }

    public function test_2단계_채널은_본인_시즌가입자_로비만_통과하고_ping은_합쳐진다(): void
    {
        Event::fake([RoomChanged::class, RoomChatPosted::class, RealtimePing::class]);
        $this->useReverb();
        $a = $this->guest('alpha');
        $b = $this->guest('bravo');
        [$idA, $idB] = DB::table('users')->orderByDesc('id')->limit(2)->pluck('id')->reverse()->values()->all();   // 방금 만든 게스트 2명(a, b 순)
        $auth = fn (string $t, string $ch) => $this->as($t)->postJson('/api/broadcasting/auth', ['socket_id' => '123.456', 'channel_name' => "private-$ch"]);

        $auth($a, "user.$idA")->assertOk()->assertJsonStructure(['auth']);
        $auth($a, "user.$idB")->assertStatus(403);   // 남의 user 채널(rank.matched) 구독 불가
        $auth($a, 'war.1')->assertStatus(403);       // 시즌 비가입자
        $auth($a, 'lobby')->assertOk();

        // 공개 방 생성 -> lobby.changed 1회, war ping 은 3초 합치기
        $this->as($b)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated();
        Event::assertDispatched(RealtimePing::class, fn ($e) => $e->channel === 'lobby' && $e->name === 'lobby.changed');
        RoomRealtime::war(7, 1);
        RoomRealtime::war(7, 2);
        Event::assertDispatchedTimes(RealtimePing::class, 2);   // lobby 1 + war 1(두 번째는 합쳐짐)
    }

    public function test_서버_tick은_폴링_없이_끊긴_참가자를_기권_처리한다(): void
    {
        [$host, $guest, $code] = $this->waitingRoom();
        $this->as($guest)->postJson("/api/rooms/$code/ready", ['ready' => true])->assertOk();
        $this->as($host)->postJson("/api/rooms/$code/start")->assertOk();
        foreach ([[$host, 'a'], [$guest, 'b']] as [$t, $side]) {
            $party = $this->as($t)->getJson('/api/party')->json('party');
            $pl = [];
            foreach ($this->zoneCoords($side) as $i => [$x, $y]) {
                $pl[] = ['user_hero_id' => $party[$i], 'x' => $x, 'y' => $y];
            }
            $this->as($t)->putJson("/api/rooms/$code/deployment", ['placements' => $pl])->assertOk();
            $this->as($t)->postJson("/api/rooms/$code/confirm")->assertOk();
        }
        $roomId = DB::table('rooms')->where('code', $code)->value('id');
        $this->assertSame('in_progress', DB::table('rooms')->where('id', $roomId)->value('status'));

        $this->assertSame(0, app(RoomService::class)->tickAll());   // 모두 접속 중이면 아무 것도 안 함
        DB::table('room_players')->where(['room_id' => $roomId, 'side' => 'b'])->update(['last_seen_at' => now()->subSeconds(100)]);
        $this->assertSame(1, app(RoomService::class)->tickAll());
        $this->assertSame('finished', DB::table('rooms')->where('id', $roomId)->value('status'));
        $this->assertSame('a', DB::table('battles')->where('room_id', $roomId)->value('winner'));
    }
}
