<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class BotCaptureFinishTest extends TestCase
{
    public function test_점령_목표로_한_동작에_전투가_끝나면_봇_계획이_예외_없이_중단된다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 8, 'height' => 1, 'tiles' => ['pppppppp']], 1, 30);
        foreach ([['a0', 'a', 'commander', 0], ['a1', 'a', 'troop', 1], ['b0', 'b', 'commander', 4]] as [$id, $side, $kind, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, 0, 3.0);
        }
        $s['objective'] = ['type' => 'capture', 'points' => [[3, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit'];
        $e = new Engine($r);
        $plan = (new HeuristicBot($e))->plan($s, 'a');   // 회귀: 점령 이동으로 전투 종료 후 다음 동작이 battle_finished 예외
        $this->assertNotContains('end_turn', array_column($plan['actions'], 'type'));   // 전투 종료 후엔 end_turn/추가 동작 없음
        foreach ($plan['actions'] as $a) {
            [$s] = $e->apply($s, 'a', $a);   // 계획된 동작을 그대로 재생해도 예외 없이 점령 승리로 끝난다
        }
        $this->assertSame('finished', $s['status']);
    }

    public function test_cue_move로_아군이_도달형_목표_칸에_서면_즉시_승리하고_남은_cue는_발동하지_않는다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 8, 'height' => 1, 'tiles' => ['pppppppp']], 1, 30);
        foreach ([['a0', 'a', 'commander', 0], ['a1', 'a', 'troop', 1], ['b0', 'b', 'commander', 7]] as [$id, $side, $kind, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, 0, 3.0);
        }
        $s['objective'] = ['type' => 'capture', 'points' => [[5, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit'];
        Cues::initialize($s, [
            ['on' => ['battle_start' => true], 'do' => 'move', 'unit' => 'a1', 'to' => [5, 0]],   // 이동 거리 4 > move 3 이지만 스크립트 이동은 무시
            ['on' => ['battle_start' => true], 'do' => 'sfx', 'key' => 'after'],
        ]);
        $ev = [];
        Cues::collect(new Engine($r), $s, $ev, true);
        $this->assertSame('finished', $s['status']);
        $this->assertSame('a', $s['winner']);
        $this->assertNotContains('sfx', array_column(array_filter($ev, fn ($e) => $e['type'] === 'cue'), 'do'));
    }
}
