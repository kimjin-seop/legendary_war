<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 편성 메뉴 제거: parties = 마지막 출격 구성(배치 확정 시 자동 저장·복원). 캠페인 전용 슬롯 곡선(PvP 불변). */
class LastPartyAndCampaignSlotsTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;
    use \Tests\Concerns\PlacesForcedHeroes;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        $r = $this->postJson('/api/guests', ['nickname' => 'lastparty'])->assertCreated();

        return [(int) $r->json('user.id'), ['X-Guest-Token' => $r->json('guest_token')]];
    }

    public function test_배치_확정이_마지막_구성을_저장하고_다음_진입에서_복원한다(): void
    {
        [$uid, $h] = $this->guest();
        $mine = DB::table('user_heroes')->where('user_id', $uid)->orderBy('id')->pluck('id')->map(fn ($v) => (int) $v)->all();
        $stage = DB::table('stages')->orderBy('sort_order')->value('id');
        $d = $this->withHeaders($h)->postJson("/api/stages/{$stage}/challenge")->assertCreated()->json('deployment');
        $order = array_reverse($mine);   // 기본과 다른 순서로 직접 배치
        $zone = array_values($d['deploy_zone']);
        $placements = [];
        foreach ($order as $i => $id) {
            $placements[] = ['user_hero_id' => $id, 'x' => $zone[$i][0], 'y' => $zone[$i][1]];
        }
        $this->putDeployment($h, $d['battle_id'], $placements)->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/{$d['battle_id']}/confirm")->assertOk();
        $this->assertSame($order, DB::table('parties')->where('user_id', $uid)->orderBy('slot')->pluck('user_hero_id')->map(fn ($v) => (int) $v)->all());

        $this->withHeaders($h)->postJson("/api/battles/{$d['battle_id']}/abandon");
        $d2 = $this->withHeaders($h)->postJson("/api/stages/{$stage}/challenge")->assertCreated()->json('deployment');
        $forcedIds = array_column($d2['forced'], 'user_hero_id');   // 필수(주인공) 영웅은 기본 파티 맨 앞 고정, 마지막 구성은 그 뒤에서 복원
        $this->assertSame($order, array_slice(array_values(array_diff($d2['default_party'], $forcedIds)), 0, count($order)));
    }

    public function test_캠페인_슬롯_곡선은_캠페인에만_적용되고_PvP는_불변(): void
    {
        [$uid, $h] = $this->guest();
        $expect = [1 => 2, 2 => 2, 3 => 3, 4 => 3, 5 => 4, 6 => 4, 7 => 5, 8 => 5, 9 => 6, 12 => 6];
        foreach ($expect as $lv => $slots) {
            $this->assertSame($slots, app(\App\Services\ProgressionService::class)->maxSlots($lv, true), "lv{$lv}");
        }
        DB::table('users')->where('id', $uid)->update(['level' => 9]);
        $p = $this->withHeaders($h)->getJson('/api/profile')->assertOk()->json('profile');
        $this->assertSame(2, $p['max_party_slots']);            // PvP/방: user_level_costs 그대로
        $this->assertSame(6, $p['campaign_max_party_slots']);
        $this->assertSame(48, $p['campaign_max_cost']);
        config(['game.campaign_slots.enabled' => false]);
        $this->assertSame(2, app(\App\Services\ProgressionService::class)->maxSlots(9, true));   // 플래그 off = 현행
    }
}
