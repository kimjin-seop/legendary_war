<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class BotFollowFrontTest extends TestCase
{
    private function state(): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t, 'healer' => ['heal' => 10] + $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 16, 'height' => 1, 'tiles' => [str_repeat('p', 16)]], 1, 30, 'a', false, false);
        $mk = fn (string $id, string $side, string $kind, string $type, int $x) => ArmyBuilder::makeUnit($r, $id, $side, $kind, $type, null, 1, $x, 0, 3.0);
        foreach ([$mk('a0', 'a', 'commander', 'sword', 0), $mk('a1', 'a', 'troop', 'sword', 5), $mk('a2', 'a', 'troop', 'healer', 0), $mk('b0', 'b', 'commander', 'sword', 15)] as $u) {
            $s['units'][$u['id']] = $u;
        }
        $s['units']['a2']['x'] = 1;

        return [new Engine($r), $s];
    }

    private function moves(Engine $e, array $s, bool $follow): array
    {
        $bot = new HeuristicBot($e, ['commander_mode' => 'guard', 'healer_ai' => true, 'follow_front' => $follow]);
        $out = [];
        foreach ($bot->plan($s, 'a')['actions'] as $a) {
            if ($a['type'] === 'move') {
                $out[$a['unit_id']] = $a['x'];
            }
        }

        return $out;
    }

    public function test_follow_front_on이면_지휘관과_치유사가_전열_후방을_따라_전진하고_off면_지휘관은_정지(): void
    {
        [$e, $s] = $this->state();
        $off = $this->moves($e, $s, false);
        $this->assertArrayNotHasKey('a0', $off);                        // guard: 이동 없음(기존 동작)
        $on = $this->moves($e, $s, true);
        $this->assertGreaterThan(0, $on['a0'] ?? 0);                    // 지휘관 전진
        $this->assertLessThan($on['a1'] ?? 5, $on['a0']);               // 최전선(a1)을 앞지르지 않음
        $this->assertGreaterThan(1, $on['a2'] ?? 1);                    // 치유사도 전진
        $this->assertLessThan($on['a1'] ?? 5, $on['a2']);
    }
}
