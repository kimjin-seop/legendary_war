<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 신규 가입 시 C급 시작 영웅 2명(서로 다른 영웅·병종) 무작위 지급·편성, 멱등, Lv1 코스트 상한 내 편성 가능 여부. */
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
        $gd = app(\App\Services\GameData::class)->heroes();
        $this->assertCount(2, $rows);
        $this->assertSame(['C', 'C'], $rows->pluck('rarity')->all());
        $this->assertCount(2, $rows->pluck('code')->unique());
        $this->assertCount(2, $rows->map(fn ($r) => $gd[$r->code]['unit_type'])->unique());   // 병종 종류가 충분하므로 겹치지 않는다

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
