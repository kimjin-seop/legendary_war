<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class AdminResetProgressTest extends TestCase
{
    use RefreshDatabase;

    private function prepare(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $g = $this->postJson('/api/guests', ['nickname' => 'Resetee'])->assertCreated();
        $uid = (int) $g->json('user.id');
        $admin = User::factory()->create();
        $admin->forceFill(['role' => 'admin'])->save();

        return [$uid, $admin, DB::table('users')->where('id', $uid)->value('name')];
    }

    public function test_초기화는_진행도만_되돌리고_계정과_원장은_유지한다(): void
    {
        [$uid, $admin, $name] = $this->prepare();
        app(\App\Services\ProgressionService::class)->credit($uid, 'gold', 777, 'test_grant', 'test', 1);
        DB::table('users')->where('id', $uid)->update(['level' => 9, 'exp' => 500]);
        DB::table('user_heroes')->insert(['user_id' => $uid, 'hero_id' => DB::table('heroes')->whereNotIn('id', DB::table('user_heroes')->where('user_id', $uid)->pluck('hero_id'))->value('id'), 'level' => 5, 'exp' => 0, 'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $heroesBefore = DB::table('user_heroes')->where('user_id', $uid)->count();
        $this->assertGreaterThan(1, $heroesBefore);
        $startGold = (int) config('game.starter_gold');
        $ledger = fn () => DB::table('wallet_transactions')->join('wallets', 'wallets.id', '=', 'wallet_id')->where('user_id', $uid)->count();
        $ledgerBefore = $ledger();

        $r = $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$uid}/reset-progress", ['confirm' => $name, 'reason' => 'QA 재시작'])->assertOk();
        $r->assertJsonPath('ok', true)->assertJsonPath('counts.user_heroes', $heroesBefore)->assertJsonPath('granted.gold', $startGold)->assertJsonPath('granted.level', 1);

        $u = DB::table('users')->where('id', $uid)->first();
        $this->assertSame($name, $u->name);   // 계정 유지
        $this->assertSame(1, (int) $u->level);
        $this->assertSame(0, (int) $u->exp);
        $this->assertSame($startGold, (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance'));
        $this->assertGreaterThanOrEqual(1, DB::table('user_heroes')->where('user_id', $uid)->count());
        $this->assertSame(DB::table('user_heroes')->where('user_id', $uid)->count(), DB::table('parties')->where('user_id', $uid)->count());
        $this->assertGreaterThan($ledgerBefore, $ledger());   // 원장 보존 + 추가
        $this->assertSame(1, DB::table('audit_logs')->where(['action' => 'reset_progress', 'entity_key' => (string) $uid, 'user_id' => $admin->id])->count());

        // 재실행도 같은 시작 상태(이중 지급 없음)
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$uid}/reset-progress", ['confirm' => $name, 'reason' => 'QA 재시작2'])->assertOk()->assertJsonPath('granted.gold', $startGold);
    }

    public function test_확인_이름_불일치_422_일반유저_403_관리자_대상_거부(): void
    {
        [$uid, $admin, $name] = $this->prepare();
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$uid}/reset-progress", ['confirm' => $name.'x', 'reason' => '사유 있음'])->assertStatus(422)->assertJsonPath('error.code', 'confirm_mismatch');
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$uid}/reset-progress", ['confirm' => $name])->assertStatus(422);   // reason 누락

        $user = User::factory()->create();
        $this->actingAs($user, 'sanctum')->postJson("/api/admin/users/{$uid}/reset-progress", ['confirm' => $name, 'reason' => '권한 없음'])->assertForbidden();

        $other = User::factory()->create();
        $other->forceFill(['role' => 'admin'])->save();
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$other->id}/reset-progress", ['confirm' => $other->name, 'reason' => '관리자 대상'])->assertStatus(422)->assertJsonPath('error.code', 'cannot_reset_admin');
        $this->actingAs($admin, 'sanctum')->postJson("/api/admin/users/{$admin->id}/reset-progress", ['confirm' => $admin->name, 'reason' => '본인 대상'])->assertStatus(422)->assertJsonPath('error.code', 'cannot_reset_self');
    }
}
