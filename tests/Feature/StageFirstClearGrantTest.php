<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\StageGrantService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 튜토1(stage_01) 첫 클리어 지급: 장비 2종 1회, 아군 Lv2·주인공 Lv3 보장, 재호출 멱등. */
class StageFirstClearGrantTest extends TestCase
{
    use RefreshDatabase;

    public function test_첫_클리어_지급은_장비와_레벨_보장을_주고_재호출해도_중복되지_않는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'grantee'])->assertCreated();
        $user = User::findOrFail($r->json('user.id'));
        $svc = app(StageGrantService::class);

        $first = $svc->grantFirstClear($user, 'stage_01');
        $this->assertSame(['gloves_tut', 'armor_tut'], $first['equipment']);
        $this->assertSame(2, DB::table('user_equipment')->where(['user_id' => $user->id, 'source' => 'stage_grant:stage_01'])->count());
        $lv = DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_heroes.user_id', $user->id)->get(['user_heroes.level', 'heroes.is_protagonist']);
        $this->assertTrue($lv->every(fn ($h) => $h->level >= ($h->is_protagonist ? 3 : 2)));

        $again = $svc->grantFirstClear($user, 'stage_01');
        $this->assertSame([[], []], [$again['equipment'], $again['levels']]);
        $this->assertSame(2, DB::table('user_equipment')->where('user_id', $user->id)->count());
        $this->assertSame(['equipment' => [], 'levels' => []], $svc->grantFirstClear($user, 'stage_99'));
    }

    public function test_지급_중간_실패는_부분_지급을_남기지_않는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'grantfail'])->assertCreated();
        $user = User::findOrFail($r->json('user.id'));
        DB::unprepared("CREATE TRIGGER trg_fail_level BEFORE UPDATE OF level ON user_heroes BEGIN SELECT RAISE(ABORT, 'forced'); END");   // 장비 지급 후 레벨 보정에서 실패 유도

        DB::beginTransaction();   // 실제 정산처럼 바깥 트랜잭션 안에서 호출
        try {
            app(StageGrantService::class)->grantFirstClear($user, 'stage_01');
            $this->fail('예외가 나야 합니다');
        } catch (\Throwable $e) {
            $this->assertStringContainsString('forced', $e->getMessage());
        }
        DB::commit();
        $this->assertSame(0, DB::table('user_equipment')->where('user_id', $user->id)->count());
    }
}
