<?php

namespace Tests\Unit;

use App\Game\UnitVariants;
use Tests\TestCase;

class UnitVariantsTest extends TestCase
{
    private function def(array $mods, string $min = 'A'): array
    {
        return ['code' => 'v1', 'base_type' => 'gunner', 'scope' => 'hero_unique', 'min_rarity' => $min, 'cultures' => [], 'name_ko' => '시험', 'enabled' => true, 'mods' => $mods];
    }

    public function test_변형_스탯_계산과_검증_규칙(): void
    {
        $d = $this->def(['hp_pct' => -10, 'atk_pct' => 10, 'def_pct' => 0, 'move_delta' => 0]);
        $this->assertSame([], UnitVariants::validateDefs([$d]));
        $this->assertSame(['hp' => 54, 'atk' => 29, 'def' => 5, 'move' => 5], UnitVariants::apply(['hp' => 60, 'atk' => 26, 'def' => 5, 'move' => 5], $d));
        $this->assertNotSame([], UnitVariants::validateDefs([$this->def(['hp_pct' => 10, 'atk_pct' => 0, 'def_pct' => 0, 'move_delta' => 0])]));   // 장점만 금지
        $this->assertNotSame([], UnitVariants::validateDefs([$this->def(['hp_pct' => -20, 'atk_pct' => 10, 'def_pct' => 0, 'move_delta' => 0])]));   // ±15 초과
    }

    public function test_등급_미달과_병종_불일치는_거절된다(): void
    {
        $d = $this->def(['hp_pct' => -5, 'atk_pct' => 8, 'def_pct' => 0, 'move_delta' => 0]);
        $defs = ['v1' => $d];
        $ok = ['code' => 'h', 'rarity' => 'A', 'unit_type' => 'gunner'];
        $this->assertSame([], UnitVariants::validateAssignment($defs, $ok, 'v1'));
        $this->assertNotSame([], UnitVariants::validateAssignment($defs, ['rarity' => 'B'] + $ok, 'v1'));
        $this->assertNotSame([], UnitVariants::validateAssignment($defs, ['unit_type' => 'archer'] + $ok, 'v1'));
        $this->assertNotSame([], UnitVariants::validateAssignment(['v1' => $this->def($d['mods'], 'S')], $ok, 'v1'));   // S 전용
    }

    public function test_makeUnit은_변형_보정만_하고_타입은_유지하며_미지정이면_동일하다(): void
    {
        $b = ['range_min' => 3, 'range_max' => 3, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 60, 'atk' => 26, 'def' => 5, 'move' => 5, 'move_type' => 'foot'];
        $r = new \App\Game\RuleSet(['gunner' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        UnitVariants::useDefs([$this->def(['hp_pct' => -10, 'atk_pct' => 10, 'def_pct' => 0, 'move_delta' => 0])]);
        try {
            $plain = \App\Game\ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'gunner', null, 1, 0, 0, 0.0);
            $var = \App\Game\ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'gunner', null, 1, 0, 0, 0.0, null, null, 'v1');
            $this->assertArrayNotHasKey('variant', $plain);
            $this->assertSame([60, 26], [$plain['hp'], $plain['atk']]);
            $this->assertSame(['gunner', 54, 29, 'v1', '시험'], [$var['type'], $var['hp'], $var['atk'], $var['variant'], $var['variant_name']]);
            $wrong = \App\Game\ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'sword' === 'x' ? 'x' : 'gunner', null, 1, 0, 0, 0.0, null, null, 'nope');
            $this->assertArrayNotHasKey('variant', $wrong);
        } finally {
            UnitVariants::useDefs(null);
        }
    }

    public function test_스테이지_명시_변형은_존재_활성_병종을_검증하고_전투_경로는_정의_오류에도_예외가_없다(): void
    {
        UnitVariants::useDefs([$this->def(['hp_pct' => -5, 'atk_pct' => 5, 'def_pct' => 0, 'move_delta' => 0])]);
        try {
            $ok = ['stages' => [['enemy_squad' => ['commander' => ['unit_type' => 'gunner', 'variant' => 'v1']]]]];
            $this->assertSame([], UnitVariants::validateStageDoc($ok, 'x'));
            $bad = ['stages' => [['enemy_squad' => ['commander' => ['unit_type' => 'gunner', 'variant' => 'typo'], 'squads' => [['commander' => ['unit_type' => 'sword'], 'variant' => 'v1']]]]]];
            $this->assertCount(2, UnitVariants::validateStageDoc($bad, 'x'));   // 정의 없음 + 병종 불일치
            // 정의가 깨져 있어도 전투 경로(get)는 예외 없이 null
            UnitVariants::useDefs([['code' => 'broken', 'base_type' => 'nope', 'scope' => 'x', 'name_ko' => '', 'mods' => ['hp_pct' => 99]]]);
            $this->assertNotSame([], UnitVariants::validateDefs([['code' => 'broken', 'base_type' => 'nope', 'mods' => ['hp_pct' => 99]]]));
            $this->assertNull(UnitVariants::get('broken'));
        } finally {
            UnitVariants::useDefs(null);
        }
    }
}
