<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class EventContractTest extends TestCase
{
    public function test_이벤트_계약_필드가_있고_hp_전후가_정합한다(): void
    {
        $sword = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 80, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $rules = new RuleSet(['sword' => $sword, 'spear' => $sword], ['sword' => ['spear' => 1.25]], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $engine = new Engine($rules);
        $state = ArmyBuilder::initialState($rules, ['width' => 3, 'height' => 1, 'tiles' => ['ppp']], 1, 30);
        $state['units']['a0'] = ArmyBuilder::makeUnit($rules, 'a0', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
        $state['units']['b0'] = ArmyBuilder::makeUnit($rules, 'b0', 'b', 'commander', 'spear', null, 1, 1, 0, 3.0);

        [$state, $events] = $engine->apply($state, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);

        $keys = ['seq', 'type', 'actor_unit_id', 'target_unit_id', 'from', 'to', 'dmg', 'crit', 'affinity', 'multiplier', 'terrain', 'terrain_def_pct', 'hp_before', 'hp_after', 'kill'];
        $this->assertSame(['attack', 'counter'], array_column($events, 'type'));
        foreach ($events as $i => $e) {
            $this->assertSame([], array_diff($keys, array_keys($e)));
            $this->assertSame($i + 1, $e['seq']);
            $this->assertFalse($e['crit']);
            $this->assertSame($e['hp_before'] - $e['dmg'], $e['hp_after']);
        }
        $this->assertSame('adv', $events[0]['affinity']);
        $this->assertSame(1.25, $events[0]['multiplier']);
        $this->assertSame($state['units']['b0']['hp'], $events[0]['hp_after']);
    }
}
