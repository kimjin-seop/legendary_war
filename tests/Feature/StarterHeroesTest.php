<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 신규 가입 시 시작 영웅 2명(이순신 고정 + C급 무작위 1명) 지급·편성, 멱등, Lv1 코스트 상한 내 편성 가능 여부. */
class StarterHeroesTest extends TestCase
{
    use RefreshDatabase;

    public function test_신규_가입은_C급_영웅_2명을_지급_편성하고_재호출해도_재추첨하지_않는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $uid = (int) $this->postJson('/api/guests', ['nickname' => 'starter'])->assertCreated()->json('user.id');

        $rows = DB::table('parties')->where('parties.user_id', $uid)->orderBy('slot')
            ->join('user_heroes', 'user_heroes.id', '=', 'parties.user_hero_id')
            ->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->get(['heroes.code', 'heroes.rarity']);
        $this->assertCount(2, $rows);
        $this->assertSame('yi_sun_sin', $rows[0]->code);   // 슬롯 1 = 이순신 고정, 슬롯 2 = C급 무작위
        $this->assertSame('C', $rows[1]->rarity);
        $this->assertCount(2, $rows->pluck('code')->unique());

        $svc = app(ProgressionService::class);
        $user = User::find($uid);
        $cost = $svc->savedPartyCost($user);
        $this->assertLessThanOrEqual($cost['max'], $cost['total']);
        $this->assertCount(2, $svc->validateParty($user, $svc->party($user)));

        $before = DB::table('user_heroes')->where('user_id', $uid)->pluck('hero_id')->sort()->values()->all();
        $svc->grantStarter($user);   // 멱등: 재호출해도 영웅 불변(재추첨 없음)
        $this->assertSame($before, DB::table('user_heroes')->where('user_id', $uid)->pluck('hero_id')->sort()->values()->all());
    }
}
