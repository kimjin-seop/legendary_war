<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Elements;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 속성 스킬: 약점 +30%/내성 -30% 배율과 이벤트 필드, element 없는 스킬은 기존과 동일. */
class ElementsTest extends TestCase
{
    protected function tearDown(): void
    {
        Elements::useData(null);
    }

    private function strike(?string $element, string $defType): array
    {
        Elements::useData(['resist_clamp' => 50, 'elements' => [['code' => 'fire', 'name_ko' => '불']], 'terrain_resist' => [],
            'unit_type_resist' => ['cavalry' => ['fire' => -30], 'monster' => ['fire' => 30]], 'hero_resist' => []]);
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 40, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t, 'cavalry' => $t, 'monster' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, ['active_skills' => true]);
        $s = ArmyBuilder::initialState($r, ['width' => 5, 'height' => 1, 'tiles' => ['ppppp']], 1, 30, 'a', false, false);
        $act = ['code' => 'fire1', 'name' => '화공', 'template' => 'T_ACTIVE_STRIKE', 'power_pct' => 100, 'cooldown' => 2, 'uses' => 2] + ($element !== null ? ['params' => ['element' => $element]] : []);
        $hero = ['code' => 'h', 'name_ko' => 'H', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => null, 'passive' => null, 'actives' => [$act]];
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $hero, 1, 1, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', $defType, null, 1, 2, 0, 3.0);
        [, $ev] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'fire1', 'target_id' => 'b0']);

        return ['atk' => collect($ev)->firstWhere('type', 'attack'), 'use' => collect($ev)->firstWhere('type', 'skill_use')];
    }

    public function test_약점은_증가_내성은_감소하고_이벤트에_element_pct가_실린다(): void
    {
        $base = $this->strike(null, 'sword')['atk'];
        $weak = $this->strike('fire', 'cavalry');
        $res = $this->strike('fire', 'monster')['atk'];
        $this->assertSame('fire', $weak['atk']['element']);
        $this->assertSame(30, $weak['atk']['element_pct']);
        $this->assertSame(-30, $res['element_pct']);
        $this->assertSame('fire', $weak['use']['element']);
        $this->assertEqualsWithDelta($base['dmg'] * 1.3, $weak['atk']['dmg'], 1.0);
        $this->assertGreaterThan($base['dmg'], $weak['atk']['dmg']);
        $this->assertLessThan($base['dmg'], $res['dmg']);
    }

    public function test_element_없는_스킬은_기존과_동일하고_이벤트_키도_없다(): void
    {
        $a = $this->strike(null, 'cavalry')['atk'];
        $b = $this->strike(null, 'sword')['atk'];
        $this->assertSame($b['dmg'], $a['dmg']);
        $this->assertArrayNotHasKey('element', $a);
        $this->assertArrayNotHasKey('element_pct', $a);
    }
}
