<?php

namespace Tests\Unit;

use App\Game\EnemyV3Adapter;
use PHPUnit\Framework\TestCase;

/** main 부대 apply_main_hold 옵트인 전달(DB 미사용). */
class EnemyV3AdapterMainHoldTest extends TestCase
{
    private function item(array $mainExtra): array
    {
        return ['code' => 't1', 'enemy_squads' => [[
            'id' => 'A', 'role' => 'main', 'leader' => ['troop_type' => 'spear', 'display_name_ko' => '테스트'],
            'soldier_type' => 'spear', 'soldiers' => 1, 'cells' => [[1, 1], [2, 1]],
        ] + $mainExtra]];
    }

    public function test_apply_main_hold_가_있을_때만_최상위로_전달된다(): void
    {
        $on = EnemyV3Adapter::convert($this->item(['apply_main_hold' => true, 'hold_until_turn' => 5]))['enemy_squad'];
        $this->assertTrue($on['apply_main_hold']);
        $this->assertSame(5, $on['hold_until_turn']);

        $off = EnemyV3Adapter::convert($this->item(['hold_until_turn' => 5]))['enemy_squad'];
        $this->assertArrayNotHasKey('apply_main_hold', $off);
        $this->assertArrayNotHasKey('hold_until_turn', $off);
        $this->assertSame($off, EnemyV3Adapter::convert($this->item([]))['enemy_squad']);
    }
}
