<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 적 AI 공격성(enemy_aggr): b측 비지휘관은 위협 회피로 맴돌지 않고 전진, a측 봇은 불변. */
class BotEnemyAggrTest extends TestCase
{
    private function moveX(string $side, bool $aggr): int
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 60, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 16, 'height' => 3, 'tiles' => array_fill(0, 3, str_repeat('p', 16))], 1, 30, $side, false, false);
        $o = $side === 'b' ? 'a' : 'b';
        $mk = fn (string $id, string $sd, string $k, int $x, int $y) => ArmyBuilder::makeUnit($r, $id, $sd, $k, 'sword', null, 1, $x, $y, 3.0);
        foreach ([$mk('m0', $side, 'commander', 0, 1), $mk('m1', $side, 'troop', 3, 1), $mk('e0', $o, 'commander', 15, 1), $mk('e1', $o, 'troop', 9, 0), $mk('e2', $o, 'troop', 9, 1), $mk('e3', $o, 'troop', 9, 2)] as $u) {
            $s['units'][$u['id']] = $u;
        }
        $bot = new HeuristicBot(new Engine($r), ['commander_mode' => 'guard', 'avoid_threat' => 0.2, 'enemy_aggr' => $aggr]);
        $x = 3;
        foreach ($bot->plan($s, $side)['actions'] as $a) {
            if ($a['type'] === 'move' && $a['unit_id'] === 'm1') {
                $x = $a['x'];
            }
        }

        return $x;
    }

    public function test_b측은_enemy_aggr로_전진하고_a측은_영향_없음(): void
    {
        $this->assertGreaterThanOrEqual($this->moveX('b', false), $this->moveX('b', true));
        $this->assertSame($this->moveX('a', false), $this->moveX('a', true));
    }
}
