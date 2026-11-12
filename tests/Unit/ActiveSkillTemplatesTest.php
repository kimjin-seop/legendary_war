<?php

namespace Tests\Unit;

use App\Game\ActiveParams;
use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 액티브 2단계 템플릿(aoe|buff|heal|surge) 핵심 동작 + 실패 시 상태 불변. */
class ActiveSkillTemplatesTest extends TestCase
{
    private function world(array $active, array $opts = [], int $width = 9): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, ['active_skills' => true] + $opts);
        $s = ArmyBuilder::initialState($r, ['width' => $width, 'height' => 1, 'tiles' => [str_repeat('p', $width)]], 1, 30, 'a', false, false);
        $hero = ['code' => 'h', 'name_ko' => 'H', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => null, 'passive' => null,
            'actives' => [$active + ['code' => 'sk', 'name' => '스킬', 'power_pct' => 100, 'cooldown' => 4, 'uses' => 2]]];
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $hero, 1, 2, 0, 3.0);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 3, 0, 3.0);
        $s['units']['b1'] = ArmyBuilder::makeUnit($r, 'b1', 'b', 'troop', 'sword', null, 1, 4, 0, 3.0);

        return [$e, $s];
    }

    private function use(Engine $e, array $s, array $a): array
    {
        return $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'sk'] + $a);
    }

    public function test_AOE_주대상은_반격받고_인접_적은_감쇠_피해와_반격_없음(): void
    {
        [$e, $s] = $this->world(['template' => 'T_ACTIVE_AOE', 'params' => ['radius' => 1, 'splash_pct' => 60]]);
        $normal = $e->damage($s, $s['units']['a0'], 2, 0, $s['units']['b0']);
        $splashExpected = max(1, (int) round($e->damageInfo($s, $s['units']['a0'], 2, 0, $s['units']['b1'], true)['dmg'] * 0.6));
        [$s2, $ev] = $this->use($e, $s, ['target_id' => 'b0']);
        $this->assertSame('aoe', $ev[0]['kind']);
        $this->assertSame(['b0', 'b1'], $ev[0]['targets']);
        $hits = array_values(array_filter($ev, fn ($x) => $x['type'] === 'attack'));
        $this->assertSame($normal, $hits[0]['dmg']);
        $this->assertArrayNotHasKey('splash', $hits[0]);
        $this->assertTrue($hits[1]['splash']);
        $this->assertSame('b1', $hits[1]['target_unit_id']);
        $this->assertSame($splashExpected, $hits[1]['dmg']);
        $counters = array_filter($ev, fn ($x) => $x['type'] === 'counter');
        $this->assertCount(1, $counters);                                   // 주 대상만 반격, splash 대상은 반격 없음
        $this->assertSame('b0', array_values($counters)[0]['actor_unit_id']);
        $this->assertTrue($s2['units']['a0']['acted']);
        $this->assertSame(['cd' => 4, 'uses_left' => 1], $s2['units']['a0']['skill_state']['sk']);
    }

    public function test_BUFF는_피해에_가산되고_시전_진영_다음_턴_시작에_만료된다(): void
    {
        [$e, $s] = $this->world(['template' => 'T_ACTIVE_BUFF', 'params' => ['stat' => 'atk', 'amount' => 10, 'duration' => 1, 'target_mode' => 'self_area', 'radius' => 2]]);
        $before = $e->damage($s, $s['units']['a1'], 1, 0, $s['units']['b0']);
        [$s, $ev] = $this->use($e, $s, []);
        $this->assertSame(['a0', 'a1'], array_column(array_filter($ev, fn ($x) => $x['type'] === 'buff_apply'), 'target_unit_id'));
        $this->assertTrue($s['units']['a0']['acted']);                      // atk 버프는 영웅 행동 소모
        $this->assertGreaterThan($before, $e->damage($s, $s['units']['a1'], 1, 0, $s['units']['b0']));
        [$s, ] = $e->apply($s, 'a', ['type' => 'end_turn']);                // b 턴 시작: a 버프 유지
        $this->assertArrayHasKey('buffs', $s['units']['a1']);
        [$s, ] = $e->apply($s, 'b', ['type' => 'end_turn']);                // a 다음 턴 시작: 만료
        $this->assertArrayNotHasKey('buffs', $s['units']['a1']);
        $this->assertSame($before, $e->damage($s, $s['units']['a1'], 1, 0, $s['units']['b0']));
        $this->assertSame(3, $s['units']['a0']['skill_state']['sk']['cd']);   // 쿨다운 4 -> a 턴 시작 1회 감소
    }

    public function test_BUFF_move는_행동_미소모이고_이동력_가산은_first_turn_move_cap을_넘지_못한다(): void
    {
        $d = ['template' => 'T_ACTIVE_BUFF', 'params' => ['stat' => 'move', 'amount' => 1, 'duration' => 1, 'target_mode' => 'self_area', 'radius' => 2]];
        [$e, $s] = $this->world($d);
        [$s, ] = $this->use($e, $s, []);
        $this->assertFalse($s['units']['a0']['acted']);
        $this->assertSame(4, $e->moveBudget($s, $s['units']['a1']));
        [$e, $s] = $this->world($d, ['first_turn_move_cap' => 3]);
        [$s, ] = $this->use($e, $s, []);
        $this->assertSame(3, $e->moveBudget($s, $s['units']['a1']));         // 1턴 선공 cap 초과 불가
    }

    public function test_HEAL은_치유량_공식을_쓰고_heal_cap과_분리되며_만피_대상은_거부한다(): void
    {
        [$e, $s] = $this->world(['template' => 'T_ACTIVE_HEAL', 'params' => ['heal_flat' => 14, 'heal_pct' => 20, 'radius' => 0, 'cast_range' => 2]], ['heal_cap' => 5]);
        try {
            $this->use($e, $s, ['target_id' => 'a1']);
            $this->fail('만피 대상은 거부되어야 함');
        } catch (IllegalAction $ex) {
            $this->assertSame('skill_no_effect', $ex->reason);
            $this->assertSame(422, $ex->status);
        }
        $this->assertSame(['cd' => 0, 'uses_left' => 2], $s['units']['a0']['skill_state']['sk']);   // 실패 시 쿨다운·횟수 불변
        $s['units']['a1']['hp'] = 50;
        [$s, $ev] = $this->use($e, $s, ['target_id' => 'a1']);
        $heal = collect($ev)->firstWhere('type', 'heal');
        $this->assertSame(70, $s['units']['a1']['hp']);                      // max(14, ceil(100*20%)) = 20, heal_cap 5 무관
        $this->assertSame('sk', $heal['via_skill']);
        $this->assertTrue($s['units']['a0']['acted']);
        $this->expectException(IllegalAction::class);                        // 적 대상은 거부
        $this->use($e, $s, ['target_id' => 'b0']);
    }

    public function test_SURGE는_이동_범위를_넓히고_행동을_소모하지_않으며_턴_종료에_리셋된다(): void
    {
        [$e, $s] = $this->world(['template' => 'T_ACTIVE_SURGE', 'params' => ['move_bonus' => 2, 'attack_pct' => 110, 'min_turn' => 2]], [], 12);
        $s['units']['b0']['x'] = 8;
        $s['units']['b1']['x'] = 9;
        try {
            $this->use($e, $s, []);
            $this->fail('min_turn 이전 사용은 거부되어야 함');
        } catch (IllegalAction $ex) {
            $this->assertSame('skill_turn_locked', $ex->reason);
            $this->assertSame(409, $ex->status);
        }
        $s['turn'] = 2;
        $this->assertArrayNotHasKey('7,0', $e->reachable($s, 'a0'));          // 기본 이동 3: x=5까지 -> 적(8) 인접 7칸 불가
        [$s, $ev] = $this->use($e, $s, []);
        $this->assertSame('surge', $ev[0]['kind']);
        $this->assertFalse($s['units']['a0']['acted']);
        $this->assertArrayHasKey('7,0', $e->reachable($s, 'a0'));             // 이동 3+2 = 5 -> x=7
        [$s, ] = $e->apply($s, 'a', ['type' => 'move', 'unit_id' => 'a0', 'x' => 7, 'y' => 0]);
        [$s2, $ev2] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);
        $plain = $e->damage($s, $s['units']['a0'], 7, 0, $s['units']['b0']);
        $this->assertSame(max(1, (int) round($plain * 1.10)), collect($ev2)->firstWhere('type', 'attack')['dmg']);   // 돌진 배율 110%
        $this->assertArrayNotHasKey('skill_attack_pct', $s2['units']['a0']);   // 첫 일반 공격에서 소비
        [$s3, ] = $e->apply($s, 'a', ['type' => 'end_turn']);
        $this->assertArrayNotHasKey('skill_move_bonus', $s3['units']['a0']);   // 턴 종료 리셋
    }

    public function test_ActiveParams는_범위를_보정하고_시드_검증은_범위_밖을_거부한다(): void
    {
        $w = [];
        $n = ActiveParams::normalize('T_ACTIVE_AOE', ['power_pct' => 300, 'splash_pct' => 5], 2, $w);
        $this->assertSame([120, 40, 1], [$n['power_pct'], $n['splash_pct'], $n['uses']]);   // clamp + AOE 기본 uses 1
        $this->assertNull(ActiveParams::normalize('T_ACTIVE_BUFF', ['amount' => 10], 2));    // stat 없음 = 무효
        $this->assertSame([], ActiveParams::violations('T_ACTIVE_SURGE', ['move_bonus' => 2, 'attack_pct' => 105, 'min_turn' => 2, 'leap' => false, 'cooldown' => 4, 'uses' => 2]));
        $this->assertNotSame([], ActiveParams::violations('T_ACTIVE_SURGE', ['move_bonus' => 9]));
    }
}
