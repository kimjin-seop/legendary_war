<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 아군 유닛 칸은 통과 가능(진입 비용 +ally_passthrough_cost, 멈추기 불가), 적 유닛 칸은 통과 불가. 0이면 기존 동작. */
class AllyPassthroughTest extends TestCase
{
    /** 1행 맵 6칸: 이동 대상 a1(0,0), 가운데 칸 (1,0)에 $midSide 진영 유닛 */
    private function place(string $midSide, array $opts = []): array
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $s = ArmyBuilder::initialState($r, ['width' => 6, 'height' => 1, 'tiles' => ['pppppp']], 1, 30);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
        $s['units']['m1'] = ArmyBuilder::makeUnit($r, 'm1', $midSide, 'troop', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['b9'] = ArmyBuilder::makeUnit($r, 'b9', 'b', 'commander', 'sword', null, 1, 5, 0, 3.0);

        return [new Engine($r, $opts), $s];
    }

    public function test_아군_칸은_통과하며_비용이_2_늘고_멈출_수는_없다(): void
    {
        [$e, $s] = $this->place('a');
        $reach = $e->reachable($s, 'a1');
        $this->assertArrayNotHasKey('1,0', $reach);    // 아군 칸에는 멈출 수 없음
        $this->assertSame(1 + 2 + 1, $reach['2,0']);   // 아군 칸 진입 1+2, 다음 칸 1 = 4 (이동력 4)
        $this->assertArrayNotHasKey('3,0', $reach);    // 예산 초과
        $this->expectException(IllegalAction::class);
        $e->apply($s, 'a', ['type' => 'move', 'unit_id' => 'a1', 'x' => 1, 'y' => 0]);
    }

    public function test_적_유닛_칸은_통과할_수_없고_옵션_0은_기존_동작(): void
    {
        [$e, $s] = $this->place('b');
        $this->assertSame(['0,0' => 0], $e->reachable($s, 'a1'));
        [$e, $s] = $this->place('a', ['ally_passthrough_cost' => 0]);
        $this->assertSame(['0,0' => 0], $e->reachable($s, 'a1'));
    }

    public function test_state_frozen_값이_현재_설정보다_우선하고_없으면_설정을_따른다(): void
    {
        [$e, $s] = $this->place('a', ['ally_passthrough_cost' => 0]);   // 현재 설정은 끔
        $this->assertSame(['0,0' => 0], $e->reachable($s, 'a1'));
        $s['frozen'] = ['ally_passthrough_cost' => 2, 'gunner_rules' => true];   // 전투 생성 시 고정된 값(켬)이 우선
        $this->assertSame(4, $e->reachable($s, 'a1')['2,0']);
        [$e2, $s2] = $this->place('a', ['ally_passthrough_cost' => 2]);
        $s2['frozen'] = ['ally_passthrough_cost' => 0, 'gunner_rules' => true];   // 설정이 켜져 있어도 고정값 0 이면 통과 불가
        $this->assertSame(['0,0' => 0], $e2->reachable($s2, 'a1'));
    }
}
