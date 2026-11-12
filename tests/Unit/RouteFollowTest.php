<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RouteAi;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** route 영웅(아군 NPC)의 동반 병사는 영웅 곁(2칸 이내)에 머물고, 떨어지면 영웅 쪽으로 따라간다. */
class RouteFollowTest extends TestCase
{
    public function test_병사는_route_영웅을_2칸_이내로_따라간다(): void
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $e = new Engine($r);
        $s = ArmyBuilder::initialState($r, ['width' => 12, 'height' => 1, 'tiles' => ['pppppppppppp']], 1, 30);
        $s['units']['n0'] = ArmyBuilder::makeUnit($r, 'n0', 'a', 'hero', 'sword', null, 1, 8, 0, 3.0);
        $s['units']['n0']['route'] = ['waypoints' => [[10, 0]], 'from_turn' => 1, 'move_cap' => null, 'i' => 0];
        $s['units']['n0t1'] = ArmyBuilder::makeUnit($r, 'n0t1', 'a', 'troop', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['n0t1']['leader_id'] = 'n0';
        $this->assertTrue(RouteAi::followsRouteLeader($s, $s['units']['n0t1']));
        $a = RouteAi::followStep($e, $s, 'n0t1');
        $this->assertSame('move', $a['type']);
        $this->assertSame(5, $a['x']);   // 이동력 4: 1 -> 5 (영웅(8)과 거리 3 -> 가까워짐)
        $s['units']['n0t1']['x'] = 6;    // 영웅과 거리 2: 제자리
        $this->assertNull(RouteAi::followStep($e, $s, 'n0t1'));
    }

    public function test_제거된_영웅이나_병사는_followStep이_null을_반환한다(): void
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $e = new Engine($r);
        $s = ArmyBuilder::initialState($r, ['width' => 12, 'height' => 1, 'tiles' => ['pppppppppppp']], 1, 30);
        $s['units']['n0t1'] = ArmyBuilder::makeUnit($r, 'n0t1', 'a', 'troop', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['n0t1']['leader_id'] = 'n0';   // 영웅이 cue 로 이미 제거된 상태
        $this->assertNull(RouteAi::followStep($e, $s, 'n0t1'));
        $this->assertNull(RouteAi::followStep($e, $s, 'gone'));   // 병사 자신이 제거된 경우
    }

    public function test_move_cap_안에서_막힌_협로는_상한을_풀어_통과해_멈추지_않는다(): void
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 6, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $e = new Engine($r);
        $s = ArmyBuilder::initialState($r, ['width' => 12, 'height' => 1, 'tiles' => ['pppppppppppp']], 1, 30);
        $s['units']['n0'] = ArmyBuilder::makeUnit($r, 'n0', 'a', 'hero', 'sword', null, 1, 0, 0, 3.0);
        $s['units']['n0']['route'] = ['waypoints' => [[9, 0]], 'from_turn' => 1, 'move_cap' => 3, 'i' => 0];
        $s['units']['n1'] = ArmyBuilder::makeUnit($r, 'n1', 'a', 'hero', 'sword', null, 1, 1, 0, 3.0);   // 1칸 폭 협로의 아군(통과 비용 +2: 상한 3 안에서는 한 칸 너머로 못 나감)
        $s['frozen'] = ['ally_passthrough_cost' => 2, 'gunner_rules' => false];
        $a = RouteAi::step($e, $s, 'n0');
        $this->assertSame('move', $a['type']);
        $this->assertGreaterThan(1, $a['x']);   // 아군 뒤로 넘어가 전진(이전에는 null = 영구 정지)
    }
}
