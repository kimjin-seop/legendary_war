<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 공지 노출 기간 + 점검 모드(일반 503, 로그인·rules·공지·관리자 허용, confirm 필요). */
class MaintenanceAnnouncementTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $id = DB::table('users')->insertGetId(['name' => 'adm', 'email' => 'adm@x.test', 'password' => 'x', 'is_guest' => false, 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()]);

        return User::findOrFail($id);
    }

    public function test_공지는_기간과_활성_기준으로_노출되고_어드민이_관리한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $a = $this->admin();
        $mk = fn (array $o) => $this->actingAs($a, 'sanctum')->postJson('/api/admin/announcements', $o + ['title' => 't', 'body' => 'b', 'reason' => '테스트'])->assertCreated()->json('item.id');
        $mk(['title' => '현재', 'pinned' => true]);
        $mk(['title' => '미래', 'starts_at' => now()->addDay()->toDateTimeString()]);
        $mk(['title' => '만료', 'starts_at' => now()->subDays(2)->toDateTimeString(), 'ends_at' => now()->subDay()->toDateTimeString()]);
        $off = $mk(['title' => '끔']);
        $this->actingAs($a, 'sanctum')->patchJson("/api/admin/announcements/{$off}", ['enabled' => false, 'reason' => '내림'])->assertOk();
        $titles = array_column($this->getJson('/api/announcements')->assertOk()->json('announcements'), 'title');
        $this->assertSame(['현재'], $titles);
        // KST 오프셋 입력도 UTC 로 정규화 저장: 10분 뒤 시작(KST 표기)은 아직 미노출, 10분 전 시작은 노출
        $kst = fn (int $min) => now()->addMinutes($min)->setTimezone('Asia/Seoul')->format('Y-m-d\TH:i:sP');
        $f = $mk(['title' => 'KST미래', 'starts_at' => $kst(10)]);
        $p = $mk(['title' => 'KST과거', 'starts_at' => $kst(-10)]);
        $this->assertSame(now()->addMinutes(10)->format('Y-m-d H:i'), substr((string) DB::table('announcements')->where('id', $f)->value('starts_at'), 0, 16));
        $titles = array_column($this->getJson('/api/announcements')->json('announcements'), 'title');
        $this->assertContains('KST과거', $titles);
        $this->assertNotContains('KST미래', $titles);
        $this->actingAs($a, 'sanctum')->postJson('/api/admin/announcements', ['title' => 't', 'body' => 'b'])->assertStatus(422);   // 사유 필수
        $this->assertSame(7, DB::table('audit_logs')->whereIn('action', ['announcement_create', 'announcement_update'])->count());
    }

    public function test_점검_모드는_일반_요청을_503으로_막고_로그인_rules_공지_관리자는_허용한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $guest = $this->postJson('/api/guests', ['nickname' => 'mt'])->assertCreated();
        $h = ['X-Guest-Token' => $guest->json('guest_token')];
        $a = $this->admin();

        $this->actingAs($a, 'sanctum')->putJson('/api/admin/maintenance', ['enabled' => true, 'message' => '점검', 'reason' => 'r'])->assertStatus(422)->assertJsonPath('error.code', 'confirm_required');
        $this->actingAs($a, 'sanctum')->putJson('/api/admin/maintenance', ['enabled' => true, 'message' => '점검 중', 'ends_at' => now()->addHour()->toDateTimeString(), 'confirm' => 'MAINTENANCE', 'reason' => 'r'])->assertOk()->assertJsonPath('active', true);

        $this->app['auth']->forgetGuards();   // actingAs(관리자) 상태 해제
        $this->withHeaders($h)->getJson('/api/profile')->assertStatus(503)->assertJsonPath('error.code', 'maintenance')->assertJsonPath('error.message', '점검 중');
        $this->getJson('/api/rules')->assertOk();
        $this->getJson('/api/announcements')->assertOk();
        $this->getJson('/api/maintenance')->assertOk()->assertJsonPath('active', true);
        $this->assertNotSame(503, $this->postJson('/api/auth/login', ['email' => 'no@x.test', 'password' => 'bad'])->status());   // 점검이 아니라 인증 실패(503 아님)
        $this->actingAs($a, 'sanctum')->getJson('/api/admin/dashboard')->assertOk();   // 관리자 우회
        $this->actingAs($a, 'sanctum')->getJson('/api/profile')->assertOk();

        $this->actingAs($a, 'sanctum')->putJson('/api/admin/maintenance', ['enabled' => false, 'reason' => 'r'])->assertOk()->assertJsonPath('active', false);
        // 시작 전·종료 후 구간은 enabled 여도 비활성
        $svc = app(\App\Services\MaintenanceService::class);
        $this->assertFalse($svc->active(['enabled' => true, 'starts_at' => now()->addMinute()->format('Y-m-d H:i:s'), 'ends_at' => null]));
        $this->assertFalse($svc->active(['enabled' => true, 'starts_at' => null, 'ends_at' => now()->subSecond()->format('Y-m-d H:i:s')]));
        $this->assertTrue($svc->active(['enabled' => true, 'starts_at' => now()->subMinute()->format('Y-m-d H:i:s'), 'ends_at' => now()->addMinute()->format('Y-m-d H:i:s')]));
        $this->app['auth']->forgetGuards();
        $this->withHeaders($h)->getJson('/api/profile')->assertOk();
    }
}
