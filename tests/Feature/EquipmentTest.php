<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use App\Services\GameData;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 장비·상점 핵심 동작(클램프, 병사 제외, 구매 멱등, 거부 규칙, 전투 반영·불변). */
class EquipmentTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;
    use \Tests\Concerns\PlacesForcedHeroes;

    private function actor(string $nick, int $gold = 3000): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        $r = $this->postJson('/api/guests', ['nickname' => $nick])->assertCreated();
        $uid = (int) $r->json('user.id');
        $gold > (int) config('game.starter_gold') && app(ProgressionService::class)->credit($uid, 'gold', $gold - (int) config('game.starter_gold'), 'test_grant', 'test', 1);

        return [$uid, ['X-Guest-Token' => $r->json('guest_token')]];
    }

    private function buy(array $h, string $code, string $rid)
    {
        return $this->withHeaders($h)->postJson('/api/shop/buy', ['code' => $code, 'request_id' => $rid]);
    }

    public function test_시더가_25개를_적재하고_합계_클램프와_병사_제외가_동작한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        $this->assertSame(25, DB::table('equipment_items')->count());

        $rules = app(GameData::class)->rules();
        $hero = app(GameData::class)->heroes()['joan_of_arc'];
        $base = ArmyBuilder::makeUnit($rules, 'a0', 'a', 'commander', $hero['unit_type'], $hero, 5, 0, 0, 3.0);
        $big = ArmyBuilder::makeUnit($rules, 'a0', 'a', 'commander', $hero['unit_type'], ['equip' => ['hp' => 999, 'atk' => 999, 'def' => 999]] + $hero, 5, 0, 0, 3.0);
        $cap = ArmyBuilder::clampEquip($rules->unitType($hero['unit_type']), $hero, ['hp' => 999, 'atk' => 999, 'def' => 999]);
        $this->assertLessThanOrEqual(16, $cap['hp']);
        $this->assertLessThanOrEqual(3, $cap['atk']);
        $this->assertLessThanOrEqual(2, $cap['def']);
        $this->assertSame($base['hp'] + $cap['hp'], $big['hp']);
        $this->assertSame($base['atk'] + $cap['atk'], $big['atk']);
        $this->assertSame($base['def'] + $cap['def'], $big['def']);
        $this->assertSame($cap, $big['equip_total']);

        // 병사(hero=null)는 영향 없음
        $t1 = ArmyBuilder::makeUnit($rules, 'a1', 'a', 'troop', 'sword', null, 5, 0, 0, 3.0);
        $this->assertArrayNotHasKey('equip_total', $t1);
    }

    public function test_구매는_request_id로_멱등이다(): void
    {
        [$uid, $h] = $this->actor('buyer', 1000);
        $a = $this->buy($h, 'helm_c', 'req-buy-0001')->assertOk();
        $b = $this->buy($h, 'helm_c', 'req-buy-0001')->assertOk();
        $this->assertFalse($a->json('replay'));
        $this->assertTrue($b->json('replay'));
        $this->assertSame($a->json('user_equipment_id'), $b->json('user_equipment_id'));
        $price = (int) DB::table('equipment_items')->where('code', 'helm_c')->value('price_gold');
        $this->assertSame(1000 - $price, $b->json('gold'));
        $this->assertSame(1, DB::table('user_equipment')->where('user_id', $uid)->count());
        $this->assertSame(1, DB::table('wallet_transactions')->where('reason_code', 'shop_equip')->count());
        $this->assertSame(1, DB::table('equipment_purchases')->count());
        $this->buy($h, 'armor_c', 'req-buy-0001')->assertStatus(409)->assertJsonPath('error.code', 'request_id_reused');
        $this->buy($h, 'no_such', 'req-buy-0002')->assertStatus(404)->assertJsonPath('error.code', 'item_not_found');
    }

    public function test_인벤토리_가득_잔액_부족_타_유저_개체_장착은_거부된다(): void
    {
        [, $h] = $this->actor('rej', 500);
        $exp = DB::table('equipment_items')->orderByDesc('price_gold')->first();
        $this->buy($h, $exp->code, 'req-rej-0001')->assertStatus(422)->assertJsonPath('error.code', 'insufficient_gold');
        $this->assertSame(0, DB::table('equipment_purchases')->count());

        config(['game.equipment.inventory_cap' => 1]);
        $this->buy($h, 'helm_c', 'req-rej-0002')->assertOk();
        $this->buy($h, 'helm_c', 'req-rej-0003')->assertStatus(422)->assertJsonPath('error.code', 'inventory_full');

        // 타 유저 개체 장착: 존재 은닉(404), 내 개체라도 레벨 부족/슬롯 불일치 거부
        [, $h2] = $this->actor('other', 500);
        $uh2 = $this->withHeaders($h2)->getJson('/api/heroes')->json('heroes.0.user_hero_id');
        $mine = $this->withHeaders($h)->getJson('/api/inventory')->json('items.0.id');
        $this->withHeaders($h2)->putJson("/api/heroes/$uh2/equipment", ['equipment' => ['helm' => $mine]])->assertStatus(404)->assertJsonPath('error.code', 'equipment_not_found');
        $uh1 = $this->withHeaders($h)->getJson('/api/heroes')->json('heroes.0.user_hero_id');
        $this->withHeaders($h)->putJson("/api/heroes/$uh1/equipment", ['equipment' => ['armor' => $mine]])->assertStatus(422)->assertJsonPath('error.code', 'slot_mismatch');
    }

    public function test_장착은_전투_생성_시_영웅_유닛에_반영되고_진행_중_전투는_불변이다(): void
    {
        [, $h] = $this->actor('fight', 3000);
        $uhs = $this->withHeaders($h)->getJson('/api/heroes')->json('heroes');
        $uh = $uhs[0]['user_hero_id'];
        $this->buy($h, 'helm_c', 'req-fight-001')->assertOk();
        $this->buy($h, 'helm_c', 'req-fight-002')->assertOk();
        $items = $this->withHeaders($h)->getJson('/api/inventory')->json('items');
        $put = $this->withHeaders($h)->putJson("/api/heroes/$uh/equipment", ['equipment' => ['helm' => $items[0]['id']]])->assertOk();
        $this->assertGreaterThan(0, $put->json('equip_total.hp'));
        // 다른 개체를 다른 영웅이 장착 중이면 거부
        $uh2 = $uhs[1]['user_hero_id'];
        $this->withHeaders($h)->putJson("/api/heroes/$uh2/equipment", ['equipment' => ['helm' => $items[0]['id']]])->assertStatus(409)->assertJsonPath('error.code', 'equipped_elsewhere');

        $id = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $this->putDeployment($h, $id, [['user_hero_id' => $uh, 'x' => 2, 'y' => 3], ['user_hero_id' => $uh2, 'x' => 1, 'y' => 3]])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
        $units = fn () => collect($this->withHeaders($h)->getJson("/api/battles/$id")->json('battle.units'))->keyBy('id');
        $before = $units();
        $eq = $before->firstWhere('hero', $uhs[0]['hero'])['id'];   // 장착 영웅 유닛(a0 은 필수 출전 주인공이라 id 로 고정하지 않는다)
        $noEq = $before->firstWhere('hero', $uhs[1]['hero'])['id'];
        $a0 = $before[$eq];
        $this->assertSame($put->json('equip_total.hp'), $a0['equip_total']['hp']);
        $this->assertArrayNotHasKey('equip_total', $before[$noEq]);   // 장비 없는 영웅
        $state = DB::table('battles')->where('id', $id)->value('state');
        $this->assertArrayHasKey($eq, json_decode($state, true)['equip_applied']);

        // 진행 중 장착 변경(해제)은 영향 없음
        $this->withHeaders($h)->putJson("/api/heroes/$uh/equipment", ['equipment' => ['helm' => null]])->assertOk()->assertJsonPath('equip_total.hp', 0);
        $this->assertSame($a0['max_hp'], $units()[$eq]['max_hp']);
        $this->assertSame($a0['equip_total'], $units()[$eq]['equip_total']);
    }
}
