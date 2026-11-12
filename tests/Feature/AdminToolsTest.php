<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 관리자 도구 핵심: 시즌 전쟁(요약·점령도 보정·생성/종료 안전장치·틱 락) + 채팅(신고 처리·수동 제재) */
class AdminToolsTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'user'): User
    {
        $id = DB::table('users')->insertGetId(['name' => $name, 'email' => "$name@x.test", 'password' => 'x', 'is_guest' => false, 'role' => $role, 'created_at' => now(), 'updated_at' => now()]);

        return User::findOrFail($id);
    }

    public function test_시즌전쟁_관리자_API는_사유_확인문자열_종료시즌_틱락을_지킨다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('war:seed')->assertSuccessful();
        $admin = $this->user('관리', 'admin');
        $a = fn () => $this->actingAs($admin, 'sanctum');
        $this->actingAs($this->user('일반'), 'sanctum')->getJson('/api/admin/war/season')->assertForbidden();

        $sum = $a()->getJson('/api/admin/war/season')->assertOk()->assertJsonPath('season.status', 'active');
        $sid = $sum->json('season.id');
        $t = DB::table('season_territories')->where('season_id', $sid)->first();
        $other = DB::table('season_countries')->where('season_id', $sid)->where('id', '!=', $t->owner_season_country_id)->value('id');
        DB::table('season_territories')->where('id', $t->id)->update(['state' => 'siege', 'siege_season_country_id' => $other, 'occupation' => 40]);

        $a()->patchJson("/api/admin/war/territories/{$t->id}/occupation", ['occupation' => 10])->assertStatus(422);   // 사유 필수
        $a()->patchJson("/api/admin/war/territories/{$t->id}/occupation", ['occupation' => 100, 'reason' => '소유권 이전 시도'])->assertStatus(422);
        $a()->patchJson("/api/admin/war/territories/{$t->id}/occupation", ['occupation' => 10, 'reason' => '운영 오류 보정'])->assertOk()->assertJsonPath('occupation', 10);
        $this->assertSame(10, (int) DB::table('season_territories')->where('id', $t->id)->value('occupation'));
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'war_occupation_adjust')->count());
        $this->assertSame(1, DB::table('territory_occupation_logs')->where('kind', 'admin')->count());

        $lock = Cache::lock('war:tick', 60);
        $this->assertTrue($lock->get());   // 틱 실행 중 시뮬레이션
        $a()->patchJson("/api/admin/war/territories/{$t->id}/occupation", ['occupation' => 5, 'reason' => '락 충돌 확인'])->assertStatus(409)->assertJsonPath('error.code', 'war_tick_busy');
        $lock->release();

        $a()->postJson('/api/admin/war/seasons', ['confirm' => 'CREATE_SEASON'])->assertStatus(409)->assertJsonPath('error.code', 'season_exists');
        $a()->postJson("/api/admin/war/seasons/$sid/end", ['confirm' => 'yes', 'reason' => '확인 문자열 오류'])->assertStatus(422)->assertJsonPath('error.code', 'confirm_required');
        $a()->postJson("/api/admin/war/seasons/$sid/end", ['confirm' => "END_SEASON_$sid", 'reason' => '테스트 강제 종료'])->assertOk()->assertJsonPath('ended', true);
        $a()->postJson("/api/admin/war/seasons/$sid/end", ['confirm' => "END_SEASON_$sid", 'reason' => '재종료 시도'])->assertStatus(409)->assertJsonPath('error.code', 'season_ended');
        $a()->patchJson("/api/admin/war/territories/{$t->id}/occupation", ['occupation' => 1, 'reason' => '종료 시즌 수정'])->assertStatus(409)->assertJsonPath('error.code', 'season_ended');
        $a()->postJson('/api/admin/war/seasons', ['confirm' => 'CREATE_SEASON'])->assertStatus(201);   // 종료 후에는 새 시즌 생성 가능
    }

    public function test_채팅_신고_처리_완료와_수동_제재_부여_해제(): void
    {
        $admin = $this->user('관리', 'admin');
        $rep = $this->user('신고자');
        $target = $this->user('대상');
        $rid = DB::table('chat_reports')->insertGetId(['reporter_user_id' => $rep->id, 'message_id' => null, 'target_user_id' => $target->id, 'reason' => 'abuse', 'body' => '문제 발언', 'created_at' => now()]);
        $a = fn () => $this->actingAs($admin, 'sanctum');

        $a()->getJson('/api/admin/chat/reports')->assertOk()->assertJsonCount(1, 'data');
        $a()->postJson("/api/admin/chat/reports/$rid/handle", ['action' => 'dismissed', 'note' => '문제 없음'])->assertOk()->assertJsonPath('already_handled', false);
        $a()->postJson("/api/admin/chat/reports/$rid/handle", ['action' => 'resolved'])->assertOk()->assertJsonPath('already_handled', true)->assertJsonPath('handled_action', 'dismissed');
        $a()->getJson('/api/admin/chat/reports')->assertOk()->assertJsonCount(0, 'data');

        $a()->postJson("/api/admin/chat/users/{$target->id}/restrict", ['minutes' => 30])->assertStatus(422);   // 사유 필수
        $a()->postJson("/api/admin/chat/users/{$admin->id}/restrict", ['minutes' => 30, 'reason' => '관리자 대상 시도'])->assertStatus(422)->assertJsonPath('error.code', 'cannot_restrict_admin');
        $r = $a()->postJson("/api/admin/chat/users/{$target->id}/restrict", ['minutes' => 30, 'reason' => '반복 욕설'])->assertOk();
        $this->assertTrue(now()->addMinutes(29)->lt(\Illuminate\Support\Carbon::parse($r->json('restricted_until'))));
        $this->assertNotNull(DB::table('users')->where('id', $target->id)->value('chat_restricted_until'));
        $a()->postJson("/api/admin/chat/users/{$target->id}/unrestrict", ['reason' => '오해 해소'])->assertOk()->assertJsonPath('restricted_until', null);
        $this->assertNull(DB::table('users')->where('id', $target->id)->value('chat_restricted_until'));
        $this->assertSame(['chat_report_dismissed', 'chat_restrict', 'chat_unrestrict'], DB::table('audit_logs')->orderBy('id')->pluck('action')->all());
    }
}
