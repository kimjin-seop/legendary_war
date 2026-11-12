<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class AutoFollowTroopsTest extends TestCase
{
    private function setup_(): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 12, 'height' => 1, 'tiles' => ['pppppppppppp']], 1, 30);
        foreach ([['a0', 0], ['a1', 8], ['a2', 9], ['b0', 11]] as $i => [$id, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $id[0], 'troop', 'sword', null, 1, $x, 0, 3.0);
        }
        $s['units']['a0']['kind'] = 'commander';
        $s['units']['a0']['aura'] = ['radius' => 2, 'atk_pct' => 10, 'def_pct' => 10];
        $s['units']['a1']['leader_id'] = 'a0';
        $s['units']['a2']['leader_id'] = 'a0';

        return [$r, $s];
    }

    public function test_follow_on_오라_밖_병사_이동_수동행동_병사_제외(): void
    {
        [$r, $s] = $this->setup_();
        $e = new Engine($r);
        $s['units']['a2']['moved'] = true;   // 수동 행동한 병사
        [$n, $ev] = $e->apply($s, 'a', ['type' => 'end_turn', 'follow' => true]);
        $moves = array_values(array_filter($ev, fn ($x) => $x['type'] === 'move'));
        $this->assertCount(1, $moves);
        $this->assertSame('a1', $moves[0]['actor_unit_id']);
        $this->assertSame([5, 0], $moves[0]['to']);   // 8 -> 5 (이동력 3), 영웅(0) 쪽으로
        $this->assertSame(9, $n['units']['a2']['x']);
        $this->assertArrayNotHasKey('move_from', $n['units']['a1']);
    }

    public function test_follow_off_기존과_동일(): void
    {
        [$r, $s] = $this->setup_();
        $e = new Engine($r);
        foreach ([['type' => 'end_turn'], ['type' => 'end_turn', 'follow' => false]] as $act) {
            [$n, $ev] = $e->apply($s, 'a', $act);
            $this->assertSame([], array_filter($ev, fn ($x) => $x['type'] === 'move'));
            $this->assertSame(8, $n['units']['a1']['x']);
        }
    }
}
