<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 신규 가입 시 한국 서사 시작 영웅(이순신·곽재우) 지급·편성과 Lv1 코스트 상한 내 편성 가능 여부. */
class StarterHeroesTest extends TestCase
{
    use RefreshDatabase;

    public function test_신규_가입은_이순신_곽재우를_지급_편성하고_Lv1_상한_안에_들어간다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $uid = (int) $this->postJson('/api/guests', ['nickname' => 'starter'])->assertCreated()->json('user.id');

        $codes = DB::table('parties')->where('parties.user_id', $uid)->orderBy('slot')
            ->join('user_heroes', 'user_heroes.id', '=', 'parties.user_hero_id')
            ->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->pluck('heroes.code')->all();
        $this->assertSame(['yi_sun_sin', 'gwak_jae_u'], $codes);
        $this->assertSame(2, DB::table('user_heroes')->where('user_id', $uid)->count());

        $svc = app(ProgressionService::class);
        $user = User::find($uid);
        $cost = $svc->savedPartyCost($user);
        $this->assertLessThanOrEqual($cost['max'], $cost['total']);
        $this->assertCount(2, $svc->validateParty($user, $svc->party($user)));   // 슬롯 2 + 코스트 상한 검증 통과
        $svc->grantStarter($user);   // 멱등: 재호출해도 영웅 수 불변
        $this->assertSame(2, DB::table('user_heroes')->where('user_id', $uid)->count());
    }
}
