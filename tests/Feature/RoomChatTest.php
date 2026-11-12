<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoomChatTest extends TestCase
{
    use RefreshDatabase;

    private function guest(string $nick): string
    {
        return $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated()->json('guest_token');
    }

    private function as(string $t): static
    {
        return $this->withHeaders(['X-Guest-Token' => $t]);
    }

    /** @return array{0:string,1:string,2:string,3:string} [host, guest, outsider, code] */
    private function setUpRoom(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        [$h, $g, $o] = [$this->guest('host'), $this->guest('guest'), $this->guest('out')];
        $code = $this->as($h)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $this->as($g)->postJson('/api/rooms/join', ['code' => $code])->assertOk();

        return [$h, $g, $o, $code];
    }

    public function test_빠른채팅_since_id_권한_게스트제한_쓰로틀_뮤트(): void
    {
        [$h, $g, $o, $code] = $this->setUpRoom();
        $this->as($o)->getJson("/api/rooms/$code/messages")->assertStatus(403);
        $this->as($o)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'gl'])->assertStatus(403);

        // 게스트: 자유 텍스트 불가, 빠른 채팅 가능. 응답에 user_id/email 없음
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '안녕'])->assertStatus(403)->assertJsonPath('error.code', 'guest_text_forbidden');
        $r = $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'gl'])->assertCreated()->assertJsonPath('message.side', 'a');
        $this->assertArrayNotHasKey('user_id', $r->json('message'));
        $id1 = $r->json('message.id');
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'thx'])->assertStatus(429)->assertJsonPath('error.code', 'chat_throttled');
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'nope'])->assertStatus(422);

        // 상대 조회: since_id, 안 읽음, read=1
        $p = $this->as($g)->getJson("/api/rooms/$code/messages")->assertOk();
        $this->assertSame(1, $p->json('unread'));
        $this->assertCount(1, $p->json('messages'));
        $this->as($g)->getJson("/api/rooms/$code/messages?since_id=$id1&read=1")->assertJsonCount(0, 'messages');
        $this->assertSame(0, $this->as($g)->getJson("/api/rooms/$code/messages")->json('unread'));

        // 뮤트: 수신자(guest)가 뮤트하면 host는 정상 응답, guest에게는 미노출
        $this->as($g)->putJson("/api/rooms/$code/chat-settings", ['muted' => true])->assertOk()->assertJsonPath('muted', true);
        Carbon::setTestNow(now()->addSeconds(4));
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'quick', 'quick_id' => 'wait'])->assertCreated();
        $this->as($g)->putJson("/api/rooms/$code/chat-settings", ['muted' => false])->assertOk();
        $this->assertSame(1, count($this->as($g)->getJson("/api/rooms/$code/messages")->json('messages')));
        $this->assertCount(2, $this->as($h)->getJson("/api/rooms/$code/messages")->json('messages'));
        Carbon::setTestNow();
    }

    public function test_회원_자유텍스트_정규화_금칙어_중복_신고제한(): void
    {
        [$h, $g, , $code] = $this->setUpRoom();
        config(['chat.guest_free_text' => true]);   // 회원 계정 가입 흐름 없이 자유 텍스트 경로 검증
        $uid = DB::table('room_players')->where('side', 'a')->value('user_id');
        DB::table('users')->where('id', DB::table('room_players')->where('side', 'b')->value('user_id'))->update(['is_guest' => false]);   // 게스트 신고는 제재 카운트 제외라 회원으로 전환

        $r = $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => "  <b>안녕</b>\x07   하세요  "])->assertCreated();
        $this->assertSame('&lt;b&gt;안녕&lt;/b&gt; 하세요', $r->json('message.body'));
        Carbon::setTestNow(now()->addSeconds(4));
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '안녕 시.발'])->assertStatus(422)->assertJsonPath('error.code', 'banned_word');
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => str_repeat('가', 101)])->assertStatus(422)->assertJsonPath('error.code', 'message_too_long');
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '<b>안녕</b> 하세요'])->assertStatus(422)->assertJsonPath('error.code', 'chat_duplicate');

        // 신고: 상대 메시지만, 멱등, 서로 다른 신고자 3명 누적 시 제한
        $mid = $r->json('message.id');
        $this->as($h)->postJson("/api/rooms/$code/messages/$mid/report", ['reason' => 'abuse'])->assertStatus(422);
        $this->as($g)->postJson("/api/rooms/$code/messages/$mid/report", ['reason' => 'abuse'])->assertOk()->assertJsonPath('already_reported', false);
        $this->as($g)->postJson("/api/rooms/$code/messages/$mid/report", ['reason' => 'abuse'])->assertOk()->assertJsonPath('already_reported', true);
        foreach (['x1', 'x2'] as $n) {
            $rep = DB::table('users')->insertGetId(['name' => $n, 'email' => "$n@x.test", 'password' => 'x', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('chat_reports')->insert(['reporter_user_id' => $rep, 'message_id' => $mid, 'target_user_id' => $uid, 'reason' => 'spam', 'created_at' => now()]);
        }
        $m2 = $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '두번째'])->assertCreated()->json('message.id');
        $this->as($g)->postJson("/api/rooms/$code/messages/$m2/report", ['reason' => 'abuse'])->assertOk();
        Carbon::setTestNow(now()->addSeconds(4));
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '세번째'])->assertStatus(403)->assertJsonPath('error.code', 'chat_restricted');
        Carbon::setTestNow();
    }

    public function test_특수문자_100자_우회문자_금칙어_제재후_재제재_없음_타방_신고404(): void
    {
        [$h, $g, , $code] = $this->setUpRoom();
        config(['chat.guest_free_text' => true]);
        $gid = DB::table('room_players')->where('side', 'b')->value('user_id');
        $hid = DB::table('room_players')->where('side', 'a')->value('user_id');
        DB::table('users')->where('id', $gid)->update(['is_guest' => false]);

        // 이스케이프 시 400자를 넘는 특수문자 100자도 전송 성공(저장은 원문, 응답만 이스케이프)
        $r = $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => str_repeat('<', 100)])->assertCreated();
        $this->assertSame(str_repeat('&lt;', 100), $r->json('message.body'));
        $this->assertSame(str_repeat('<', 100), DB::table('room_messages')->where('id', $r->json('message.id'))->value('body'));

        // 금칙어: 제로폭/전각 우회 차단, 단어 경계 오탐("다시 발견")은 허용
        Carbon::setTestNow(now()->addSeconds(4));
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => "시\u{200B}발"])->assertStatus(422)->assertJsonPath('error.code', 'banned_word');
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => 'ＦＵＣＫ'])->assertStatus(422)->assertJsonPath('error.code', 'banned_word');
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '다시 발견'])->assertCreated();

        // 제재 만료 후 신고 1건으로는 재제재되지 않음
        $mid = $r->json('message.id');
        foreach (['x1', 'x2'] as $n) {
            $rep = DB::table('users')->insertGetId(['name' => $n, 'email' => "$n@x.test", 'password' => 'x', 'created_at' => now(), 'updated_at' => now()]);
            DB::table('chat_reports')->insert(['reporter_user_id' => $rep, 'message_id' => $mid, 'target_user_id' => $hid, 'reason' => 'spam', 'created_at' => now()]);
        }
        $this->as($g)->postJson("/api/rooms/$code/messages/$mid/report", ['reason' => 'abuse'])->assertOk();
        $this->assertNotNull(DB::table('users')->where('id', $hid)->value('chat_restricted_until'));
        Carbon::setTestNow(now()->addMinutes(61));
        $m3 = $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '다시 왔어요'])->assertCreated()->json('message.id');
        $this->as($g)->postJson("/api/rooms/$code/messages/$m3/report", ['reason' => 'abuse'])->assertOk();
        $this->assertTrue(Carbon::parse(DB::table('users')->where('id', $hid)->value('chat_restricted_until'))->isPast());
        Carbon::setTestNow(now()->addSeconds(4));
        $this->as($h)->postJson("/api/rooms/$code/messages", ['kind' => 'text', 'text' => '또 보내요'])->assertCreated();

        // 다른 방의 메시지 신고는 404
        $g2 = $this->guest('g2');
        $h2 = $this->guest('h2');
        $code2 = $this->as($h2)->postJson('/api/rooms', ['mode' => 'pvp', 'visibility' => 'public'])->assertCreated()->json('room.code');
        $this->as($g2)->postJson('/api/rooms/join', ['code' => $code2])->assertOk();
        $this->as($g2)->postJson("/api/rooms/$code2/messages/$mid/report", ['reason' => 'abuse'])->assertStatus(404);
        Carbon::setTestNow();
    }
}
