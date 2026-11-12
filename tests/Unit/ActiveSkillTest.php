<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class ActiveSkillTest extends TestCase
{
    private function setup_(array $opts = []): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, ['active_skills' => true] + $opts);
        $s = ArmyBuilder::initialState($r, ['width' => 5, 'height' => 1, 'tiles' => ['ppppp']], 1, 30, 'a', false, false);
        $hero = ['code' => 'h', 'name_ko' => 'H', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => null, 'passive' => null,
            'actives' => [['code' => 'strike1', 'name' => '강타', 'template' => 'T_ACTIVE_STRIKE', 'power_pct' => 200, 'cooldown' => 2, 'uses' => 2]]];
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $hero, 1, 1, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 2, 0, 3.0);

        return [$e, $s];
    }

    public function test_액티브는_배율_피해_쿨다운_횟수_행동소모를_적용한다(): void
    {
        [$e, $s] = $this->setup_();
        $normal = $e->damage($s, $s['units']['a0'], 1, 0, $s['units']['b0']);
        $this->assertSame(['strike1'], array_column($e->activeSkillView($s, $s['units']['a0']), 'code'));
        [$s, $ev] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'strike1', 'target_id' => 'b0']);
        $types = array_column($ev, 'type');
        $this->assertSame('skill_use', $types[0]);
        $atk = collect($ev)->firstWhere('type', 'attack');
        $this->assertSame(max(1, (int) round($normal * 2.0)), $atk['dmg']);                 // 200%
        $this->assertTrue($s['units']['a0']['acted']);                                       // 영웅 행동 소모
        $this->assertSame(['cd' => 2, 'uses_left' => 1], $s['units']['a0']['skill_state']['strike1']);
        $v = $e->activeSkillView($s, $s['units']['a0'])[0];
        $this->assertFalse($v['usable']);
        $this->assertSame(2, $v['cooldown_left']);
    }

    public function test_first_move_limit_슬롯이_0이면_소모형_use_skill도_거부되고_규칙_off면_회귀없다(): void
    {
        [$e, $s] = $this->setup_(['first_move_limit' => 1]);
        $s['units']['a1'] = ['id' => 'a1', 'moved' => true] + $s['units']['a0'];   // 슬롯 1칸을 이미 사용
        $this->assertSame(0, $e->firstMoveSlots($s, 'a'));
        try {
            $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'strike1', 'target_id' => 'b0']);
            $this->fail('거부되어야 함');
        } catch (IllegalAction $ex) {
            $this->assertSame('first_move_limit', $ex->reason);
        }
        [$e2, $s2] = $this->setup_();   // 규칙 off
        $s2['units']['a1'] = ['id' => 'a1', 'moved' => true] + $s2['units']['a0'];
        [$s2, ] = $e2->apply($s2, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'strike1', 'target_id' => 'b0']);
        $this->assertTrue($s2['units']['a0']['acted']);
    }

    public function test_쿨다운_잘못된_대상_미보유_스킬은_거부되고_상태가_변하지_않는다(): void
    {
        [$e, $s] = $this->setup_();
        $bad = fn (array $a) => fn () => $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0'] + $a);
        foreach ([[['skill' => 'nope', 'target_id' => 'b0'], 'skill_not_found'], [['skill' => 'strike1', 'target_id' => 'a0'], 'invalid_target'], [['skill' => 'strike1', 'target_id' => 'zzz'], 'invalid_target']] as [$a, $code]) {
            try {
                $bad($a)();
                $this->fail('거부되어야 함');
            } catch (IllegalAction $ex) {
                $this->assertSame($code, $ex->reason);
            }
        }
        $this->assertSame(['cd' => 0, 'uses_left' => 2], $s['units']['a0']['skill_state']['strike1']);   // 실패 시 쿨다운·횟수 불변
        // 사용 후 같은 턴 재사용 불가(이미 행동), 쿨다운 중 재사용은 skill_cooldown
        [$s, ] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'strike1', 'target_id' => 'b0']);
        $s['units']['a0']['acted'] = false;
        $this->expectException(IllegalAction::class);
        $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'strike1', 'target_id' => 'b0']);
    }
}
