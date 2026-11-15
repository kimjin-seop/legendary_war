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

    private function attacks(string $side, bool $commander = false): bool
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 60, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 16, 'height' => 3, 'tiles' => array_fill(0, 3, str_repeat('p', 16))], 1, 30, $side, false, false);
        $o = $side === 'b' ? 'a' : 'b';
        $mk = fn (string $id, string $sd, string $k, int $x, int $y) => ArmyBuilder::makeUnit($r, $id, $sd, $k, 'sword', null, 1, $x, $y, 3.0);
        foreach ([$mk('m0', $side, 'commander', 0, 1), $mk('m2', $side, 'troop', 1, 1), $mk('m1', $side, $commander ? 'commander' : 'troop', 3, 1), $mk('e0', $o, 'commander', 15, 1), $mk('e1', $o, 'troop', 7, 0), $mk('e2', $o, 'troop', 7, 1), $mk('e3', $o, 'troop', 7, 2)] as $u) {
            $s['units'][$u['id']] = $u;
        }
        $bot = new HeuristicBot(new Engine($r), ['commander_mode' => $commander ? 'engage' : 'guard', 'avoid_threat' => 0.2, 'enemy_aggr' => true]);
        foreach ($bot->plan($s, $side)['actions'] as $a) {
            if ($a['type'] === 'attack' && $a['unit_id'] === 'm1') {
                return true;
            }
        }

        return false;
    }

    public function test_b측은_위협_칸이어도_공격_가능하면_이동만_하지_않고_공격(): void
    {
        $this->assertTrue($this->attacks('b'));
    }

    public function test_b측_지휘관은_위험_칸에서_비처치_공격을_하지_않는다(): void
    {
        $this->assertFalse($this->attacks('b', true));
    }

    public function test_b측_궁병은_위협_칸이어도_사거리_2에_닿으면_이동_후_공격(): void
    {
        $sw = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 60, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $ar = ['move' => 3, 'range_min' => 2, 'range_max' => 2, 'hp' => 60, 'atk' => 26, 'def' => 5, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $sw, 'archer' => $ar], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 16, 'height' => 3, 'tiles' => array_fill(0, 3, str_repeat('p', 16))], 1, 30, 'b', false, false);
        $mk = fn (string $id, string $sd, string $k, string $t, int $x, int $y) => ArmyBuilder::makeUnit($r, $id, $sd, $k, $t, null, 1, $x, $y, 3.0);
        foreach ([$mk('m0', 'b', 'commander', 'sword', 0, 1), $mk('m2', 'b', 'troop', 'sword', 1, 1), $mk('ar', 'b', 'troop', 'archer', 3, 1), $mk('e0', 'a', 'commander', 'sword', 15, 1), $mk('e1', 'a', 'troop', 'sword', 7, 0), $mk('e2', 'a', 'troop', 'sword', 7, 1), $mk('e3', 'a', 'troop', 'sword', 7, 2)] as $u) {
            $s['units'][$u['id']] = $u;
        }
        $bot = new HeuristicBot(new Engine($r), ['commander_mode' => 'guard', 'avoid_threat' => 0.2, 'enemy_aggr' => true]);
        $attacked = false;
        foreach ($bot->plan($s, 'b')['actions'] as $a) {
            $attacked = $attacked || ($a['type'] === 'attack' && $a['unit_id'] === 'ar');
        }
        $this->assertTrue($attacked);
    }

    public function test_b측은_enemy_aggr로_전진하고_a측은_영향_없음(): void
    {
        $this->assertGreaterThanOrEqual($this->moveX('b', false), $this->moveX('b', true));
        $this->assertSame($this->moveX('a', false), $this->moveX('a', true));
    }
}
