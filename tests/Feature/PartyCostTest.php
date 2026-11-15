<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PartyCostTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'cost'])->assertCreated();
        $this->givePartyHeroes((int) $r->json('user.id'));

        return [['X-Guest-Token' => $r->json('guest_token')], (int) $r->json('user.id'), DB::table('user_heroes')->where('user_id', $r->json('user.id'))->pluck('id')->map(fn ($v) => (int) $v)->all()];
    }

    public function test_출전분이_상한_이하면_벤치_영웅이_있어도_통과하고_경계값은_통과(): void
    {
        [$h, $uid, $uh] = $this->guest();
        $svc = app(ProgressionService::class);
        $user = User::find($uid);
        $hero = ['uh' => DB::table('user_heroes')->find($uh[0]), 'hero' => app(\App\Services\GameData::class)->heroById((int) DB::table('user_heroes')->find($uh[0])->hero_id)];
        $c = $svc->costBreakdown($user, [$uh[0] => $hero]);
        $this->assertSame((int) $hero['hero']['cost'], $c['total']);   // 2026-11-15: 출전 코스트 = 영웅 코스트 합(부대 미합산, 코스트 바 기준)
        $this->assertSame(0, $c['troop']);
        // 상한을 출전 1명의 합계와 정확히 같게(경계) 설정: 파티에 벤치 영웅(2번째)이 있어도 출전 1명은 통과해야 한다
        DB::table('user_level_costs')->where('level', 1)->update(['max_cost' => $c['total']]);
        $this->assertCount(1, $svc->validateParty($user, [$uh[0]]));
        // 상한 +0 초과(1 부족)이면 거부
        DB::table('user_level_costs')->where('level', 1)->update(['max_cost' => $c['total'] - 1]);
        $this->expectException(\App\Game\IllegalAction::class);
        $svc->validateParty($user, [$uh[0]]);
    }

    public function test_상한_초과는_422와_used_max_수치를_포함(): void
    {
        [$h, , $uh] = $this->guest();
        DB::table('user_level_costs')->where('level', 1)->update(['max_cost' => 10]);   // 시작 파티가 통과하는 곡선이라 초과 상황을 만들기 위해 상한을 낮춘다
        $res = $this->withHeaders($h)->putJson('/api/party', ['user_hero_ids' => $uh])->assertStatus(422);
        $res->assertJsonPath('error.code', 'cost_exceeded')->assertJsonPath('error.max', 10)->assertJsonPath('error.hero_cost', 11);   // 이순신 S8 + 곽재우 B3(등급 격차 v1)
        $this->assertGreaterThan(10, $res->json('error.used'));
        $this->assertSame($res->json('error.hero_cost') + $res->json('error.troop_cost'), $res->json('error.used'));
        $this->assertSame(2, DB::table('parties')->where('user_id', DB::table('user_heroes')->find($uh[0])->user_id)->count());   // 거부 시 기존 파티 불변
    }
}
