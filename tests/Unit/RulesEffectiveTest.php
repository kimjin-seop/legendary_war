<?php

namespace Tests\Unit;

use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class RulesEffectiveTest extends TestCase
{
    public function test_오버라이드가_없으면_빈_배열_있으면_실효값과_first_side(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $e = new Engine(new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]));
        $this->assertSame([], $e->rulesEffective(['rules' => []]));
        $r = $e->rulesEffective(['rules' => ['second_atk_pct' => 7, 'forest_cover_exclude_ranged_target' => false], 'first_side' => 'b']);
        $this->assertSame(7, $r['second_atk_pct']);
        $this->assertFalse($r['forest_cover_exclude_ranged_target']);
        $this->assertSame('b', $r['first_side']);
        $this->assertArrayNotHasKey('dmg_mult', $r);
    }
}
