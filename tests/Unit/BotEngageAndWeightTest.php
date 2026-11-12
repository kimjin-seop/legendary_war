<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class BotEngageAndWeightTest extends TestCase
{
    private function rules(): RuleSet
    {
        $sword = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $healer = ['heal' => 10, 'atk' => 5] + $sword;

        return new RuleSet(['sword' => $sword, 'healer' => $healer], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
    }

    private function state(RuleSet $r, array $units): array
    {
        $s = ArmyBuilder::initialState($r, ['width' => 12, 'height' => 1, 'tiles' => ['pppppppppppp']], 1, 30);
        foreach ($units as $id => [$kind, $type, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $id[0], $kind, $type, null, 1, 0, 0, 3.0);
            $s['units'][$id]['x'] = $x;
            $s['units'][$id]['y'] = 0;
        }
        $s['init_hp'] = ['a' => 100, 'b' => 100];

        return $s;
    }

    public function test_전투_부대가_없으면_지휘관이_guard를_풀고_교전한다(): void
    {
        $r = $this->rules();
        $s = $this->state($r, ['ac' => ['commander', 'sword', 4], 'ah' => ['troop', 'healer', 3], 'bc' => ['commander', 'sword', 9]]);
        $moves = fn (array $opts) => array_filter(
            (new HeuristicBot(new Engine($r), $opts))->plan($s, 'a')['actions'],
            fn ($a) => $a['type'] === 'move' && $a['unit_id'] === 'ac',
        );
        $this->assertCount(0, $moves(['commander_mode' => 'guard']));                                       // 기본: 제자리
        $this->assertCount(1, $moves(['commander_mode' => 'guard', 'engage_when_no_combat' => true]));      // 전투 부대 없음 -> 전진
        // 아군에 전투 부대가 있으면(어느 쪽도 비어 있지 않음) 그대로 guard
        $s2 = $this->state($r, ['ac' => ['commander', 'sword', 4], 'at' => ['troop', 'sword', 3], 'bc' => ['commander', 'sword', 9], 'bt' => ['troop', 'sword', 8]]);
        $m2 = array_filter((new HeuristicBot(new Engine($r), ['engage_when_no_combat' => true]))->plan($s2, 'a')['actions'], fn ($a) => $a['type'] === 'move' && $a['unit_id'] === 'ac');
        $this->assertCount(0, $m2);
    }

    public function test_비전투_유닛_가중치가_턴_상한_판정에_반영된다(): void
    {
        $r = $this->rules();
        // a: 지휘관 + 치유사(생존 2), b: 지휘관만(생존 1). b의 HP 비율이 더 높다.
        $s = $this->state($r, ['ac' => ['commander', 'sword', 0], 'ah' => ['troop', 'healer', 1], 'bc' => ['commander', 'sword', 9]]);
        $s['units']['ac']['hp'] = 60;
        $s['side'] = 'b';
        $s['turn'] = 30;
        $s['init_hp'] = ['a' => 200, 'b' => 100];
        $win = fn (float $w) => (new Engine($r, ['turn_limit_rule' => 'alive_then_ratio', 'turn_limit_noncombatant_weight' => $w]))->apply($s, 'b', ['type' => 'end_turn'])[0]['winner'];
        $this->assertSame('a', $win(1.0));   // 치유사 포함 생존 수 2 > 1
        $this->assertSame('b', $win(0.0));   // 치유사 무시: 1 = 1 -> HP 비율(b 1.0 > a 0.8)
    }
}
