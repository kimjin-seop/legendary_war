<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class FacingTest extends TestCase
{
    private function setup5(bool $facing): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 200, 'atk' => 40, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t, 'spear' => $t], ['sword' => ['spear' => 1.25]], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 5, 'height' => 5, 'tiles' => array_fill(0, 5, 'ppppp')], 1, 30, 'a', $facing);
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 3, 2, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'spear', null, 1, 2, 2, 3.0);
        $s['units']['b0']['facing'] = 'right';   // 공격자(a0) 쪽(오른쪽)을 바라봄

        return [new Engine($r), $s];
    }

    public function test_정면_측면_후면_피해_순서와_상성_유리_상태의_방향_보너스(): void
    {
        [$e, $s] = $this->setup5(true);
        $a = $s['units']['a0'];
        $b = $s['units']['b0'];
        $front = $e->damage($s, $a, 3, 2, $b);   // 오른쪽에서 공격 = b0 시선과 같은 방향
        $side = $e->damage($s, $a, 2, 1, $b);    // 위쪽에서 = 직각
        $diag = $e->damage($s, $a, 3, 3, $b);    // 대각선 = 측면
        $back = $e->damage($s, $a, 1, 2, $b);    // 왼쪽(등 뒤)
        $this->assertSame('none', $e->flank($s, 3, 2, $b));
        $this->assertSame('back', $e->flank($s, 1, 2, $b));
        $this->assertLessThan($side, $front);    // 상성 유리(1.25)에서도 방향 배율이 곱해진다: 정면 < 측면 < 후면
        $this->assertLessThan($back, $side);
        $this->assertSame($side, $diag);
        $this->assertSame($front, $e->damage($s, $a, 1, 2, $b, true));   // 반격은 정면 취급
        // facing_cap이 clamp 이후 총배율보다 낮아도 방향 보너스는 배율을 낮추지 않는다(back 경로가 front보다 작아지지 않음)
        $low = new Engine($e->rules(), ['facing_cap' => 1.0]);
        $this->assertSame($front, $low->damage($s, $a, 1, 2, $b));
        // off(state.facing=false)면 방향 무관 동일 피해
        [$e2, $s2] = $this->setup5(false);
        $this->assertSame($front, $e2->damage($s2, $s2['units']['a0'], 1, 2, $s2['units']['b0']));
    }

    public function test_자동_회전_wait_facing_검증_이벤트(): void
    {
        [$e, $s] = $this->setup5(true);
        [$s, $ev] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);
        $this->assertSame('left', $s['units']['a0']['facing']);   // 공격자는 대상(왼쪽)을 바라봄
        $this->assertSame('right', $s['units']['b0']['facing']);  // 피격 유닛은 공격자 쪽
        $this->assertSame('none', $ev[0]['flank']);
        // wait: 잘못된 facing 거부, 올바른 값은 반영 + wait 이벤트
        [$e3, $s3] = $this->setup5(true);
        try {
            $e3->apply($s3, 'a', ['type' => 'wait', 'unit_id' => 'a0', 'facing' => 'north']);
            $this->fail('invalid facing');
        } catch (IllegalAction $x) {
            $this->assertSame('invalid_action', $x->reason);
        }
        [$s3, $ev3] = $e3->apply($s3, 'a', ['type' => 'wait', 'unit_id' => 'a0', 'facing' => 'up']);
        $this->assertSame('up', $s3['units']['a0']['facing']);
        $this->assertSame('wait', $ev3[0]['type']);
        // off: wait 이벤트 없음(기존 동작)
        [$e4, $s4] = $this->setup5(false);
        $this->assertSame([], $e4->apply($s4, 'a', ['type' => 'wait', 'unit_id' => 'a0'])[1]);
    }
}
