<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use App\Game\SkillFx;
use PHPUnit\Framework\TestCase;

class SkillFxTest extends TestCase
{
    public function test_skill_use_이벤트에_fx_family_슬롯이_들어가고_피해는_그대로다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, ['active_skills' => true]);
        $s = ArmyBuilder::initialState($r, ['width' => 5, 'height' => 1, 'tiles' => ['ppppp']], 1, 30, 'a', false, false);
        $hero = ['code' => 'h', 'name_ko' => 'H', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => null, 'passive' => null,
            'actives' => [['code' => 'st', 'name' => '강타', 'template' => 'T_ACTIVE_STRIKE', 'power_pct' => 150, 'cooldown' => 2, 'uses' => 2]]];
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $hero, 1, 1, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 2, 0, 3.0);
        [, $ev] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'st', 'target_id' => 'b0']);
        $use = collect($ev)->firstWhere('type', 'skill_use');
        $this->assertSame('strike', $use['fx_family']);
        $this->assertNull($use['fx_variant']);
        $this->assertSame('fire', SkillFx::fields('aoe', 'fire')['fx_variant']);
        $this->assertNull(SkillFx::fields('unknown')['fx_family']);
    }
}
