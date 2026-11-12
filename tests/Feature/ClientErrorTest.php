<?php

namespace Tests\Feature;

use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 클라이언트 에러 리포트 핵심: 수집·마스킹·중복 누적·크기 제한, 어드민 조회, 정리. */
class ClientErrorTest extends TestCase
{
    use RefreshDatabase;

    public function test_수집은_개인정보를_마스킹하고_같은_오류는_누적하며_큰_본문은_거부한다(): void
    {
        $body = ['message' => 'TypeError at user a@b.com token '.str_repeat('a', 45), 'stack' => "at f (https://x.test/app.js?token=abc:1:2)\nat g", 'scene' => 'Battle', 'url' => 'https://x.test/play?email=a@b.com#x', 'app_version' => '1.0.0'];
        $this->postJson('/api/client-errors', $body)->assertStatus(202)->assertJsonPath('ok', true);
        $this->postJson('/api/client-errors', $body)->assertStatus(202);
        $row = DB::table('client_errors')->first();
        $this->assertSame(1, DB::table('client_errors')->count());
        $this->assertSame(2, (int) $row->count);
        $this->assertStringNotContainsString('a@b.com', $row->message.$row->stack.$row->path);
        $this->assertStringNotContainsString('token=abc', (string) $row->stack);
        $this->assertSame('/play', $row->path);
        $this->postJson('/api/client-errors', ['message' => str_repeat('x', 9000)])->assertStatus(413);
        $this->postJson('/api/client-errors', [])->assertStatus(422);

        $admin = User::findOrFail(DB::table('users')->insertGetId(['name' => 'adm', 'email' => 'adm@x.test', 'password' => 'x', 'is_guest' => false, 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()]));
        $this->app['auth']->forgetGuards();
        $this->getJson('/api/admin/client-errors')->assertUnauthorized();
        $this->actingAs($admin, 'sanctum')->getJson('/api/admin/client-errors?q=TypeError')->assertOk()->assertJsonPath('total', 1)->assertJsonPath('data.0.count', 2);
    }

    public function test_인코딩_이메일_JWT_비밀값_해시를_모든_저장_필드에서_마스킹한다(): void
    {
        $jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.c2ln';
        $this->postJson('/api/client-errors', ['message' => "fail a%40b.com $jwt token=abc123 password=hunter2", 'stack' => 'at x (http://h/p#frag)', 'scene' => 'War',
            'url' => 'http://h/war#access_token=zzz', 'app_version' => 'v1 key=SECRET', 'platform' => 'x%40y.org'])->assertStatus(202);
        $row = DB::table('client_errors')->first();
        $all = json_encode((array) $row, JSON_UNESCAPED_UNICODE);
        foreach (['a%40b.com', 'eyJhbG', 'abc123', 'hunter2', 'frag', 'zzz', 'SECRET', 'x%40y.org'] as $leak) {
            $this->assertStringNotContainsString($leak, $all);
        }
    }

    public function test_정리는_보관기간과_용량_상한을_적용한다(): void
    {
        $mk = fn (int $i, string $seen) => DB::table('client_errors')->insert(['period_key' => '2026-01-01', 'fingerprint' => 'f'.$i, 'level' => 'error', 'message' => 'm'.$i, 'count' => 1, 'first_seen_at' => $seen, 'last_seen_at' => $seen]);
        $mk(1, now()->subDays(30)->toDateTimeString());
        for ($i = 2; $i <= 6; $i++) {
            $mk($i, now()->subMinutes(10 - $i)->toDateTimeString());
        }
        config(['game.client_errors.retention_days' => 14, 'game.client_errors.max_rows' => 100]);
        $this->artisan('client-errors:prune', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame(6, DB::table('client_errors')->count());
        $this->artisan('client-errors:prune')->assertSuccessful();
        $this->assertSame(5, DB::table('client_errors')->count());   // 오래된 1건 삭제
    }
}
