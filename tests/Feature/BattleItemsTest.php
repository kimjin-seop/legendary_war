<?php

namespace Tests\Feature;

use App\Models\Battle;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class BattleItemsTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;
    use \Tests\Concerns\PlacesForcedHeroes;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
    }

    private function h(string $token): array
    {
        return ['X-Guest-Token' => $token];
    }

    public function test_보유_한도를_넘는_구매는_stack_full로_거부된다(): void
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'stacktester'])->assertCreated();
        $token = $r->json('guest_token');
        DB::table('wallets')->where('user_id', $r->json('user.id'))->where('currency_code', 'gold')->update(['balance' => 10000]);
        foreach (['req-stack-0001', 'req-stack-0002'] as $rid) {   // potion_m 한도 20 = 10 + 10
            $this->withHeaders($this->h($token))->postJson('/api/shop/items/buy', ['code' => 'potion_m', 'qty' => 10, 'request_id' => $rid])->assertOk();
        }
        $this->withHeaders($this->h($token))->postJson('/api/shop/items/buy', ['code' => 'potion_m', 'qty' => 1, 'request_id' => 'req-stack-0003'])->assertStatus(422)->assertJsonPath('error.code', 'stack_full');
        $this->assertSame(20, (int) DB::table('user_items')->where('item_code', 'potion_m')->value('qty'));
    }

    public function test_상점_구매는_골드를_차감하고_멱등이며_전투_중_회복약은_행동을_소모하고_횟수를_차감한다(): void
    {
        config(['game.rules.alternate_activation' => false]);
        $r = $this->postJson('/api/guests', ['nickname' => 'itemtester'])->assertCreated();
        $token = $r->json('guest_token');
        $uid = $r->json('user.id');
        DB::table('wallets')->where('user_id', $uid)->where('currency_code', 'gold')->update(['balance' => 100]);

        // 구매: 중 2개 = 80골드, 같은 request_id 재호출은 replay
        $buy = $this->withHeaders($this->h($token))->postJson('/api/shop/items/buy', ['code' => 'potion_m', 'qty' => 2, 'request_id' => 'req-item-0001'])->assertOk();
        $this->assertSame([80, 20, 2], [$buy->json('gold_spent'), $buy->json('gold'), $buy->json('owned')]);
        $this->withHeaders($this->h($token))->postJson('/api/shop/items/buy', ['code' => 'potion_m', 'qty' => 2, 'request_id' => 'req-item-0001'])->assertOk()->assertJsonPath('replay', true)->assertJsonPath('owned', 2);
        $this->withHeaders($this->h($token))->postJson('/api/shop/items/buy', ['code' => 'potion_l', 'qty' => 1, 'request_id' => 'req-item-0002'])->assertStatus(422)->assertJsonPath('error.code', 'insufficient_gold');

        // 전투: 지휘관 HP를 깎은 뒤 사용
        $id = $this->withHeaders($this->h($token))->postJson('/api/stages/1/challenge')->assertCreated()->json('battle.battle_id');
        $heroes = $this->withHeaders($this->h($token))->getJson('/api/party')->json('party');
        $this->putDeployment($this->h($token), $id, [['user_hero_id' => $heroes[0], 'x' => 2, 'y' => 3], ['user_hero_id' => $heroes[1], 'x' => 1, 'y' => 3]])->assertOk();
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/confirm")->assertOk();
        $b = Battle::find($id);
        $st = $b->state;
        $this->assertSame(3, $st['items']['left']);
        $this->withHeaders($this->h($token))->getJson("/api/battles/$id")->assertJsonPath('battle.items.left', 3);   // 뷰 노출
        $st['units']['a0']['hp'] = 10;
        $b->state = $st;
        $b->save();

        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'use_item', 'unit_id' => 'a0', 'item' => 'potion_s'])->assertStatus(422)->assertJsonPath('error.code', 'item_not_owned');
        $res = $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'use_item', 'unit_id' => 'a0', 'item' => 'potion_m'])->assertOk();
        $types = array_column($res->json('events'), 'type');
        $this->assertContains('item_use', $types);
        $this->assertContains('heal', $types);
        $this->assertGreaterThan(10, Battle::find($id)->state['units']['a0']['hp']);
        $this->assertSame(1, (int) DB::table('user_items')->where(['user_id' => $uid, 'item_code' => 'potion_m'])->value('qty'));
        $this->assertSame(2, Battle::find($id)->state['items']['left']);
        // 행동을 이미 소모했으므로 같은 유닛은 다시 사용할 수 없다
        $this->withHeaders($this->h($token))->postJson("/api/battles/$id/actions", ['type' => 'use_item', 'unit_id' => 'a0', 'item' => 'potion_m'])->assertStatus(422)->assertJsonPath('error.code', 'already_acted');
        $this->assertSame(1, (int) DB::table('user_items')->where(['user_id' => $uid, 'item_code' => 'potion_m'])->value('qty'));   // 거부된 사용은 차감하지 않는다
    }
}
