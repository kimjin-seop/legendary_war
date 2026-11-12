<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** GET /api/me/record 와 채팅 운영(제재 until 노출, 관리자 신고 큐·삭제) 핵심 동작 */
class PvpRecordAdminChatTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, bool $guest = false, string $role = 'user'): User
    {
        $id = DB::table('users')->insertGetId(['name' => $name, 'email' => "$name@x.test", 'password' => 'x', 'is_guest' => $guest, 'role' => $role, 'created_at' => now(), 'updated_at' => now()]);

        return User::findOrFail($id);
    }

    private function battle(int $a, int $b, ?string $winner, ?string $endReason): int
    {
        return DB::table('battles')->insertGetId([
            'user_id' => $a, 'opponent_user_id' => $b, 'mode' => 'pvp', 'stage_id' => null, 'map_id' => DB::table('maps')->value('id'), 'status' => 'finished', 'seed' => 1, 'turn' => 5,
            'winner' => $winner, 'state' => json_encode(['end_reason' => $endReason]), 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_내_PvP_전적은_승패무_요약과_종료사유를_표시명만으로_반환한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $me = $this->user('나#1');
        $foe = $this->user('상대#2');
        $this->battle($me->id, $foe->id, 'a', null);                 // 승(방장)
        $this->battle($foe->id, $me->id, 'a', 'forfeit_timeout');    // 패(참가자, 내가 타임아웃)
        $this->battle($me->id, $foe->id, null, null);                // 무
        $res = $this->actingAs($me, 'sanctum')->getJson('/api/me/record?per_page=2')->assertOk();
        $res->assertJsonPath('summary.wins', 1)->assertJsonPath('summary.losses', 1)->assertJsonPath('summary.draws', 1)->assertJsonPath('summary.total', 3)
            ->assertJsonPath('page.last_page', 2)->assertJsonCount(2, 'records')
            ->assertJsonPath('records.0.result', 'draw')->assertJsonPath('records.1.reason', 'forfeit_timeout')->assertJsonPath('records.1.forfeit_by_me', true)
            ->assertJsonPath('records.1.result', 'loss')->assertJsonPath('records.1.opponent_name', '상대');
        $this->assertStringNotContainsString('x.test', $res->getContent());   // 이메일/식별자 비노출
        // 게스트는 빈 목록
        $g = $this->user('손님', true);
        $this->battle($g->id, $foe->id, 'a', null);
        $this->actingAs($g, 'sanctum')->getJson('/api/me/record')->assertOk()->assertJsonPath('guest', true)->assertJsonCount(0, 'records');
    }

    public function test_제재_until이_응답에_나오고_관리자만_신고큐_조회와_메시지_삭제를_한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $tok = fn ($n) => $this->postJson('/api/guests', ['nickname' => $n])->assertCreated()->json('guest_token');
        [$h, $g] = [$tok('host'), $tok('guest')];
        $as = fn ($t) => $this->withHeaders(['X-Guest-Token' => $t]);
        $code = $as($h)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $as($g)->postJson('/api/rooms/join', ['code' => $code])->assertOk();
        $mid = $as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'gl'])->assertCreated()->json('message.id');
        $as($g)->postJson("/api/rooms/$code/messages/$mid/report", ['reason' => 'abuse'])->assertOk();

        $hostId = DB::table('room_players')->where('side', 'a')->value('user_id');
        $as($h)->getJson("/api/rooms/$code/messages")->assertOk()->assertJsonPath('restricted_until', null);
        DB::table('users')->where('id', $hostId)->update(['chat_restricted_until' => now()->addMinutes(30)]);
        $as($h)->getJson("/api/rooms/$code/messages")->assertOk()->assertJsonPath('cannot_send_reason', 'chat_restricted')->assertJsonStructure(['restricted_until']);
        $as($h)->getJson("/api/rooms/$code/chat-settings")->assertOk()->assertJsonStructure(['restricted_until']);

        $admin = $this->user('관리', false, 'admin');
        $this->actingAs($this->user('일반'), 'sanctum')->getJson('/api/admin/chat/reports')->assertForbidden();
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/chat/reports')->assertOk()->assertJsonPath('data.0.message_id', $mid)->assertJsonPath('data.0.room_code', $code);
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/admin/chat/messages/$mid")->assertOk()->assertJsonPath('already_deleted', false);
        $this->actingAs($admin, 'sanctum')->deleteJson("/api/admin/chat/messages/$mid")->assertOk()->assertJsonPath('already_deleted', true);
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'chat_delete')->count());
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/chat/reports')->assertOk()->assertJsonCount(0, 'data');   // open 큐에서 빠짐
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/chat/reports?status=all')->assertOk()->assertJsonCount(1, 'data');
    }
}
