<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class MatchupTest extends TestCase
{
    public function test_상성_배율이_피해량에_반영된다(): void
    {
        $types = [
            'sword' => ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 80, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0],
            'spear' => ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 80, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0],
        ];
        $rules = new RuleSet($types, ['sword' => ['spear' => 1.25]], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $engine = new Engine($rules);
        $state = ArmyBuilder::initialState($rules, ['width' => 3, 'height' => 1, 'tiles' => ['ppp']], 1, 30);
        $sword = ArmyBuilder::makeUnit($rules, 'a0', 'a', 'troop', 'sword', null, 1, 0, 0, 3.0);
        $spear = ArmyBuilder::makeUnit($rules, 'b0', 'b', 'troop', 'spear', null, 1, 1, 0, 3.0);
        $sword2 = ArmyBuilder::makeUnit($rules, 'b1', 'b', 'troop', 'sword', null, 1, 2, 0, 3.0);

        $vsSpear = $engine->damage($state, $sword, 0, 0, $spear);   // 28*1.25 - 10 = 25
        $vsSword = $engine->damage($state, $sword, 0, 0, $sword2);  // 28 - 10 = 18
        $this->assertSame(25, $vsSpear);
        $this->assertSame(18, $vsSword);
    }
}
