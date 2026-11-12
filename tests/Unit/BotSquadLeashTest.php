<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class BotSquadLeashTest extends TestCase
{
    private function setup_(): array
    {
        $t = ['move' => 4, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 20, 'height' => 3, 'tiles' => array_fill(0, 3, str_repeat('p', 20))], 1, 30, 'a', false, true);
        $mk = fn (string $id, string $side, string $kind, int $x, ?string $leader, int $y = 1) => ['leader_id' => $leader] + ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, $y, 3.0);
        foreach ([$mk('a0', 'a', 'commander', 2, null), $mk('a1', 'a', 'troop', 3, 'a0'), $mk('b0', 'b', 'commander', 19, null)] as $u) {
            $s['units'][$u['id']] = $u;
        }

        return [new Engine($r, ['squad' => true]), $s];
    }

    /** 계획을 적용한 뒤 [병사 x, 영웅 x] */
    private function after(Engine $e, array $s, int $leash): array
    {
        $bot = new HeuristicBot($e, ['commander_mode' => 'guard', 'follow_front' => true, 'squad_leash' => $leash]);
        foreach ($bot->plan($s, 'a')['actions'] as $a) {
            [$s] = $e->apply($s, 'a', $a);
        }

        return [$s['units']['a1']['x'], $s['units']['a0']['x']];
    }

    public function test_병사는_이동한_영웅_기준_leash_안에_머물고_leash_0이면_기존대로_돌격(): void
    {
        [$e, $s] = $this->setup_();
        [$tx, $hx] = $this->after($e, $s, 2);
        $this->assertLessThanOrEqual(2, abs($tx - $hx));
        $this->assertGreaterThan(2, $hx);                      // 영웅도 함께 전진
        [$tx0] = $this->after($e, $s, 0);
        $this->assertSame(7, $tx0);                            // off: 이동력 4만큼 돌격
    }
}
