<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use Tests\TestCase;

class CultureTest extends TestCase
{
    public function test_부대는_지휘관_culture를_따르고_미지정은_null(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $engine = new Engine($r);
        $hero = fn (?string $c) => ['code' => 'h', 'name_ko' => 'H', 'unit_type' => 'sword', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => null, 'passive' => null, 'culture' => $c];
        $zone = [[0, 0], [1, 0], [2, 0], [0, 1], [1, 1]];
        foreach (['korea' => 'korea', 'none' => null] as $label => $c) {
            $s = ArmyBuilder::initialState($r, ['width' => 5, 'height' => 3, 'tiles' => array_fill(0, 3, 'ppppp')], 1, 30);
            ArmyBuilder::addSide($engine, $s, 'a', [['row' => $hero($c), 'level' => 1, 'key' => 0]], ['sword', 'sword'], $zone, [0 => [0, 0]], 3.0);
            $this->assertCount(3, $s['units']);
            foreach ($s['units'] as $u) {
                $this->assertSame($c, $u['culture'], $label.' '.$u['kind']);
            }
        }
    }
}
