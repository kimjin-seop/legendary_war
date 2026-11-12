<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BanTest extends TestCase
{
    use RefreshDatabase;

    public function test_정지된_게스트와_회원은_403이다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'Banned'])->assertCreated();
        $token = $r->json('guest_token');
        $this->withHeaders(['X-Guest-Token' => $token])->getJson('/api/profile')->assertOk();
        DB::table('users')->where('id', $r->json('user.id'))->update(['banned_at' => now()]);
        $this->withHeaders(['X-Guest-Token' => $token])->getJson('/api/profile')->assertStatus(403)->assertJsonPath('error.code', 'account_banned');

        $member = User::factory()->create(['banned_at' => now()]);
        $this->actingAs($member, 'sanctum')->getJson('/api/profile')->assertStatus(403)->assertJsonPath('error.code', 'account_banned');
        $this->actingAs($member, 'sanctum')->getJson('/api/auth/me')->assertStatus(403)->assertJsonPath('error.code', 'account_banned');   // auth:sanctum만 쓰는 경로(file 세션이라 세션 삭제에 의존 불가)
        $this->actingAs($member, 'sanctum')->postJson('/api/auth/logout')->assertOk();   // 로그아웃은 허용
    }

    public function test_어드민_정지는_세션을_삭제하고_정지_계정의_어드민_API는_차단된다(): void
    {
        $admin = User::factory()->create();
        $admin->forceFill(['role' => 'admin'])->save();
        $target = User::factory()->create();
        DB::table('sessions')->insert(['id' => 'sess-test', 'user_id' => $target->id, 'payload' => '', 'last_activity' => time()]);

        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$target->id}/ban")->assertOk()->assertJsonPath('banned', true);
        $this->assertSame(0, DB::table('sessions')->where('user_id', $target->id)->count());
        $this->assertNotNull(DB::table('users')->where('id', $target->id)->value('banned_at'));

        $admin->forceFill(['banned_at' => now()])->save();   // 정지된 어드민 계정
        $this->actingAs($admin->fresh(), 'sanctum')->getJson('/api/admin/users')->assertStatus(403)->assertJsonPath('error.code', 'account_banned');
    }
}
