<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class MapRulesOverrideTest extends TestCase
{
    public function test_맵_rules는_전역값을_덮어쓰고_없으면_기존_동작과_같으며_허용_키만_받는다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 200, 'atk' => 40, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, ['second_atk_pct' => 0]);
        $mk = function (?array $rules) use ($r) {
            $map = ['width' => 3, 'height' => 1, 'tiles' => ['ppp']] + ($rules === null ? [] : ['rules' => $rules]);
            $s = ArmyBuilder::initialState($r, $map, 1, 30);
            $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
            $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 1, 0, 3.0);

            return $s;
        };
        $plain = $mk(null);
        $this->assertArrayNotHasKey('rules', $plain);                 // 필드 없으면 state 불변(기존 동작)
        $base = $e->damage($plain, $plain['units']['b0'], 1, 0, $plain['units']['a0']);   // 후공(b) 공격
        $over = $mk(['second_atk_pct' => 20]);
        $this->assertSame(['second_atk_pct' => 20], $over['rules']);
        $this->assertGreaterThan($base, $e->damage($over, $over['units']['b0'], 1, 0, $over['units']['a0']));   // 맵 규칙이 전역 0을 덮어씀
        $this->assertSame($base, $e->damage($over, $over['units']['a0'], 0, 0, $over['units']['b0']));        // 선공은 영향 없음
        // 화이트리스트: 봇 옵션/잘못된 값 거부
        foreach ([['avoid_threat' => 1], ['second_atk_pct' => 'x'], ['facing_mult' => ['front' => 2]], ['first_turn_move_cap' => 99]] as $bad) {
            try {
                Engine::sanitizeMapRules($bad);
                $this->fail('rejected: '.json_encode($bad));
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }
}
