<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 어드민 FE 지원 API: 권한(비관리자 403), 대시보드·시나리오 목록·필터/페이지네이션, 시즌 시나리오별 생성, admin:grant/revoke. */
class AdminOpsApiTest extends TestCase
{
    use RefreshDatabase;

    private function user(string $name, string $role = 'user'): User
    {
        $id = DB::table('users')->insertGetId(['name' => $name, 'email' => "$name@x.test", 'password' => 'x', 'is_guest' => false, 'role' => $role, 'created_at' => now(), 'updated_at' => now()]);

        return User::findOrFail($id);
    }

    public function test_비관리자는_403이고_관리자는_대시보드_시나리오_필터_페이지네이션을_쓴다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $admin = $this->user('admin1', 'admin');
        $normal = $this->user('normal1');
        foreach (['/api/admin/dashboard', '/api/admin/war/scenarios', '/api/admin/users', '/api/admin/audit-logs'] as $url) {
            $this->actingAs($normal, 'sanctum')->getJson($url)->assertForbidden();
        }
        $a = fn () => $this->actingAs($admin, 'sanctum');

        $a()->getJson('/api/admin/dashboard')->assertOk()->assertJsonStructure(['active_seasons', 'open_chat_reports', 'users' => ['total', 'today', 'banned'], 'battles' => ['today', 'in_progress']]);
        $codes = array_column($a()->getJson('/api/admin/war/scenarios')->assertOk()->json('scenarios'), 'code');
        $this->assertEqualsCanonicalizing(array_map(fn ($f) => basename($f, '.json'), glob(database_path('data/war/*.json'))), $codes);   // 시나리오 파일 목록과 일치

        // 시나리오별 시즌 생성: confirm 필요, france 생성 후 imjin 과 공존
        $a()->postJson('/api/admin/war/seasons', ['scenario_code' => 'france', 'confirm' => 'wrong'])->assertStatus(422)->assertJsonPath('error.code', 'confirm_required');
        $a()->postJson('/api/admin/war/seasons', ['scenario_code' => 'france', 'confirm' => 'CREATE_SEASON'])->assertSuccessful();
        $a()->postJson('/api/admin/war/seasons', ['scenario_code' => 'france', 'confirm' => 'CREATE_SEASON'])->assertStatus(409);   // 같은 시나리오 중복
        $this->assertSame(1, DB::table('seasons')->where('scenario_code', 'france')->where('status', 'active')->count());

        // 사용자 검색/페이지네이션, 감사 로그 필터
        $this->assertSame(1, $a()->getJson('/api/admin/users?q=normal&per_page=5')->assertOk()->json('total'));
        $this->assertGreaterThanOrEqual(1, $a()->getJson('/api/admin/audit-logs?action=war_season_create&actor='.$admin->id)->assertOk()->json('total'));
        $a()->getJson('/api/admin/config/unit-types?q=sword&per_page=10')->assertOk()->assertJsonStructure(['data', 'total']);
    }

    public function test_admin_grant_revoke는_audit를_남기고_마지막_관리자와_게스트를_보호한다(): void
    {
        $u = $this->user('target1');
        $this->artisan('admin:revoke', ['email' => $u->email])->assertSuccessful();   // 이미 user: 변경 없음
        $this->artisan('admin:grant', ['email' => $u->email])->assertSuccessful();
        $this->assertSame('admin', DB::table('users')->where('id', $u->id)->value('role'));
        $this->assertSame(1, DB::table('audit_logs')->where('action', 'admin_grant')->count());
        $this->artisan('admin:revoke', ['email' => $u->email])->assertFailed();   // 마지막 관리자
        $other = $this->user('target2', 'admin');
        $this->artisan('admin:revoke', ['email' => $u->email])->assertSuccessful();
        $this->assertSame('user', DB::table('users')->where('id', $u->id)->value('role'));
        $this->artisan('admin:grant', ['email' => 'nobody@x.test'])->assertFailed();
        $this->assertNotNull($other);
    }

    public function test_config_상세_조회와_변경_사유_정지_사유가_audit에_저장된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $admin = $this->user('admin2', 'admin');
        $a = fn () => $this->actingAs($admin, 'sanctum');
        $mapId = DB::table('maps')->orderBy('id')->value('id');
        $a()->getJson('/api/admin/config/maps/'.$mapId)->assertOk()->assertJsonPath('item.id', $mapId);   // 수정 전: 미정의 변수 사용
        $uid = DB::table('unit_types')->where('code', 'sword')->value('id');
        $a()->patchJson('/api/admin/config/unit-types/'.$uid, ['hp' => 85, 'reason' => '밸런스 테스트'])->assertOk()->assertJsonPath('after.hp', 85)->assertJsonPath('before.hp', 84);
        $this->assertSame('밸런스 테스트', json_decode((string) DB::table('audit_logs')->where('action', 'update')->latest('id')->value('after'), true)['_reason']);
        $t = $this->user('t1');
        $a()->postJson('/api/admin/users/'.$t->id.'/ban', ['reason' => '도배'])->assertOk();
        $this->assertSame('도배', json_decode((string) DB::table('audit_logs')->where('action', 'ban')->latest('id')->value('after'), true)['reason']);
    }
}
