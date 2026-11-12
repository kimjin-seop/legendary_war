<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class TurnLimitAndFirstMoveTest extends TestCase
{
    private function rules(): RuleSet
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];

        return new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]], 'wall' => ['foot' => ['cost' => null, 'def_pct' => 0]]]);
    }

    private function state(RuleSet $r, array $hp): array
    {
        $s = ArmyBuilder::initialState($r, ['width' => 6, 'height' => 1, 'tiles' => ['pppppp']], 1, 30);
        foreach ($hp as $id => $h) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $id[0], 'troop', 'sword', null, 1, count($s['units']), 0, 3.0);
            $s['units'][$id]['hp'] = $h;
        }
        $s['init_hp'] = ['a' => 100, 'b' => 200];

        return $s;
    }

    public function test_턴_상한_판정_규칙(): void
    {
        $r = $this->rules();
        // a: 1기 100/100(합 100, 비율 1.0), b: 2기 70+70 (합 140, 비율 0.7)
        $s = $this->state($r, ['a0' => 100, 'b0' => 70, 'b1' => 70]);
        $s['side'] = 'b';
        $s['turn'] = 30;
        $win = fn (string $rule) => (new Engine($r, ['turn_limit_rule' => $rule]))->apply($s, 'b', ['type' => 'end_turn'])[0]['winner'];
        $this->assertSame('b', $win('hp_sum'));
        $this->assertSame('a', $win('hp_ratio'));
        $this->assertSame('b', $win('alive_then_ratio'));
        // 동점이면 무승부
        $s['units']['b1']['hp'] = 30;
        $s['units']['b0']['hp'] = 100;
        $s['init_hp']['b'] = 130;
        $this->assertNull((new Engine($r, ['turn_limit_rule' => 'hp_ratio']))->apply($s, 'b', ['type' => 'end_turn'])[0]['winner']);
    }

    public function test_첫_이동_제한과_경로_비용(): void
    {
        $r = $this->rules();
        $s = $this->state($r, ['a0' => 100, 'a1' => 100, 'b0' => 100]);
        $e = new Engine($r, ['first_move_limit' => 1]);
        [$s] = $e->apply($s, 'a', ['type' => 'wait', 'unit_id' => 'a0']);
        $this->assertSame(0, $e->firstMoveSlots($s, 'a'));
        $this->expectException(IllegalAction::class);
        $e->apply($s, 'a', ['type' => 'wait', 'unit_id' => 'a1']);
    }
}
