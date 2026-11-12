<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 같은 인물 NPC 지원 중복 방지(npc_X <-> X) + 수레·배 오브젝트 NPC 의 non_hero 표시. */
class NpcDuplicateAndCartTest extends TestCase
{
    private function hero(string $code): array
    {
        return ['code' => $code, 'name_ko' => $code, 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0, 'growth_atk_pct' => 0, 'growth_def_pct' => 0];
    }

    public function test_실제_영웅이_출전하면_같은_인물_NPC는_중복으로_판정하고_수레는_non_hero(): void
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $s = ArmyBuilder::initialState($r, ['width' => 4, 'height' => 1, 'tiles' => ['pppp']], 1, 30);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'commander', 'sword', $this->hero('joan_of_arc'), 1, 0, 0, 3.0);
        $this->assertSame('a1', ArmyBuilder::samePersonOnSide($s, 'a', 'npc_joan_of_arc'));
        $this->assertNull(ArmyBuilder::samePersonOnSide($s, 'b', 'npc_joan_of_arc'));   // 다른 진영은 중복 아님
        $this->assertNull(ArmyBuilder::samePersonOnSide($s, 'a', 'npc_kim_yusin'));      // 다른 인물
        $cart = ArmyBuilder::makeUnit($r, 'n0', 'a', 'hero', 'sword', $this->hero('npc_cart_1'), 1, 1, 0, 3.0);
        $this->assertTrue($cart['non_hero']);
        $this->assertArrayNotHasKey('non_hero', $s['units']['a1']);
    }

    public function test_hero_npc_참조는_같은_인물_실제_영웅과_격파_기록에도_매칭된다(): void
    {
        $state = ['units' => [
            'a1' => ['side' => 'a', 'kind' => 'commander', 'hero' => 'joan_of_arc', 'hp' => 50],
            'b1' => ['side' => 'b', 'kind' => 'commander', 'hero' => 'kim_yusin', 'hp' => 50],   // 적 진영의 같은 인물은 매칭하지 않음
        ]];
        $this->assertSame(['a1'], \App\Game\EventConditions::units($state, 'hero:npc_joan_of_arc'));
        $this->assertSame([], \App\Game\EventConditions::units($state, 'hero:npc_kim_yusin'));
        // 격파 기록({side,kind,hero})도 별칭으로 매칭: unit_survive 실패 / defeated 조건이 실제 영웅 사망에 반응
        $this->assertTrue(\App\Game\EventConditions::matchesRef('a1', ['side' => 'a', 'kind' => 'commander', 'hero' => 'joan_of_arc'], 'hero:npc_joan_of_arc'));
        $this->assertFalse(\App\Game\EventConditions::matchesRef('b1', ['side' => 'b', 'kind' => 'commander', 'hero' => 'joan_of_arc'], 'hero:npc_joan_of_arc'));
    }

    public function test_패배_조건_defeated_hero_npc_X_는_실제_영웅_X_의_사망에_반응한다(): void
    {
        $cond = \App\Game\EventConditions::normalize(['type' => 'defeated', 'unit' => 'hero:npc_joan_of_arc']);
        $alive = ['units' => ['a1' => ['side' => 'a', 'kind' => 'commander', 'hero' => 'joan_of_arc', 'hp' => 40]], 'defeated' => []];
        $this->assertFalse(\App\Game\EventConditions::evaluate($cond, $alive));
        $dead = ['units' => [], 'defeated' => ['a1' => ['side' => 'a', 'kind' => 'commander', 'hero' => 'joan_of_arc']]];
        $this->assertTrue(\App\Game\EventConditions::evaluate($cond, $dead));   // 별칭 정규화 전에는 영원히 false(패배 조건 무시)였던 경로
    }
}
