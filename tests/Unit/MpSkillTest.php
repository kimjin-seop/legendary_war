<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\IllegalAction;
use App\Game\MpRules;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 액티브 스킬 MP 방식 핵심 동작(A1~A9, A14) + 레거시 회귀. 수치는 가정 시작값 기준. */
class MpSkillTest extends TestCase
{
    private function world(bool $mp = true, array $actives = [], string $rarity = 'B', int $level = 1): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, ['active_skills' => true, 'mp_skills' => $mp]);
        $knobs = $e->mpKnobs();
        $s = ArmyBuilder::initialState($r, ['width' => 7, 'height' => 1, 'tiles' => ['ppppppp']], 1, 30, 'a', false, false, false, null, $knobs);
        $actives = $actives ?: [['code' => 'strike1', 'name' => '강타', 'template' => 'T_ACTIVE_STRIKE', 'power_pct' => 100, 'cooldown' => 2, 'uses' => 2, 'params' => ['power_pct' => 100]]];
        $hero = ['code' => 'h', 'name_ko' => 'H', 'rarity' => $rarity, 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0,
            'aura' => null, 'passive' => null, 'actives' => $actives];
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $hero, $level, 1, 0, 3.0, null, $knobs);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'sword', null, $level, 0, 0, 3.0, null, $knobs);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 2, 0, 3.0);

        return [$e, $s];
    }

    private function strike(Engine $e, array $s): array
    {
        return $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'strike1', 'target_id' => 'b0']);
    }

    public function test_A1_시작MP는_50퍼센트이고_병사에는_MP_키가_없다(): void
    {
        [, $s] = $this->world();                                   // rarity B, Lv1 -> mp_max 60, 시작 30
        $this->assertTrue($s['mp_mode']);
        $this->assertSame(60, $s['units']['a0']['mp_max']);
        $this->assertSame(30, $s['units']['a0']['mp']);
        $this->assertArrayNotHasKey('mp', $s['units']['a1']);
        $this->assertArrayNotHasKey('mp_max', $s['units']['b0']);
        $this->assertSame(160, MpRules::maxMp('S', 40, 'sword'));      // 상한 160
        $this->assertSame(80 + 20, MpRules::maxMp('A', 1, 'mage'));    // caster +20
        $this->assertSame(40, MpRules::maxMp(null, 1, 'sword'));       // rarity 미상은 C
    }

    public function test_A2_MP_부족이면_insufficient_mp_409로_거부된다(): void
    {
        [$e, $s] = $this->world();
        $s['units']['a0']['mp'] = 10;                              // strike(power100) 비용 20
        try {
            $this->strike($e, $s);
            $this->fail('거부되어야 함');
        } catch (IllegalAction $ex) {
            $this->assertSame('insufficient_mp', $ex->reason);
            $this->assertSame(409, $ex->status);
        }
        $this->assertSame(10, $s['units']['a0']['mp']);
        $this->assertFalse($s['units']['a0']['acted']);
    }

    public function test_A3_사용하면_MP가_차감되고_mp_change_skill_use_이벤트가_나온다(): void
    {
        [$e, $s] = $this->world();
        [$s2, $ev] = $this->strike($e, $s);
        $this->assertSame(10, $s2['units']['a0']['mp']);            // 30 - 20
        $mc = collect($ev)->firstWhere('type', 'mp_change');
        $this->assertSame(['a0', -20, 10, 60, 'skill'], [$mc['unit_id'], $mc['delta'], $mc['mp'], $mc['mp_max'], $mc['reason']]);
        $su = collect($ev)->firstWhere('type', 'skill_use');
        $this->assertSame([20, 10, null, 0], [$su['mp_cost'], $su['mp_left'], $su['uses_left'], $su['cooldown_left']]);
        $v = $e->activeSkillView($s2, $s2['units']['a0'])[0];
        $this->assertSame([20, 10, 0, null], [$v['mp_cost'], $v['mp_left'], $v['cooldown'], $v['uses']]);
        $this->assertTrue($s2['units']['a0']['acted']);
    }

    public function test_A4_턴_시작에_회복하고_상한_초과분은_버려져_overflow로_기록된다(): void
    {
        [$e, $s] = $this->world();
        [$s, ] = $e->apply($s, 'a', ['type' => 'end_turn']);
        [$s, $ev] = $e->apply($s, 'b', ['type' => 'end_turn']);    // a 진영 턴 시작: max(5, round(60x15%)=9) 회복
        $mc = collect($ev)->firstWhere('type', 'mp_change');
        $this->assertSame([9, 39, 'turn_start', 0], [$mc['delta'], $mc['mp'], $mc['reason'], $mc['overflow']]);
        $s['units']['a0']['mp'] = 55;
        [$s, ] = $e->apply($s, 'a', ['type' => 'end_turn']);
        [$s, $ev] = $e->apply($s, 'b', ['type' => 'end_turn']);
        $mc = collect($ev)->firstWhere('type', 'mp_change');
        $this->assertSame([60, 5, 4], [$s['units']['a0']['mp'], $mc['delta'], $mc['overflow']]);   // 55+9=64 -> 60, 4 버림
        $this->assertSame(4, $s['mp_overflow']);                   // 계측은 state 누적 카운터
        [$s, ] = $e->apply($s, 'a', ['type' => 'end_turn']);
        [$s, $ev] = $e->apply($s, 'b', ['type' => 'end_turn']);    // 만땅 상태 회복: delta=0 -> 이벤트 없이 계측만
        $this->assertSame([], array_values(array_filter($ev, fn ($x) => $x['type'] === 'mp_change')));
        $this->assertSame(13, $s['mp_overflow']);
    }

    public function test_A5_영웅은_1턴에_스킬_1회만_쓸_수_있고_surge_move버프도_연쇄_차단된다(): void
    {
        $surge = ['code' => 'sg', 'name' => '돌진', 'template' => 'T_ACTIVE_SURGE', 'power_pct' => 0, 'cooldown' => 4, 'uses' => 2, 'params' => ['move_bonus' => 2, 'attack_pct' => 100, 'min_turn' => 1]];
        $buff = ['code' => 'bf', 'name' => '질주', 'template' => 'T_ACTIVE_BUFF', 'power_pct' => 0, 'cooldown' => 4, 'uses' => 2, 'params' => ['stat' => 'move', 'amount' => 1, 'duration' => 1, 'target_mode' => 'self_area', 'radius' => 2]];
        [$e, $s] = $this->world(true, [$surge, $buff]);
        $s['units']['a0']['mp'] = 50;
        [$s2, ] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'sg']);
        $this->assertFalse($s2['units']['a0']['acted']);           // surge는 행동 미소모인데도
        try {
            $e->apply($s2, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'bf']);
            $this->fail('거부되어야 함');
        } catch (IllegalAction $ex) {
            $this->assertSame(['skill_turn_locked', 409], [$ex->reason, $ex->status]);
        }
        $this->assertFalse($e->activeSkillView($s2, $s2['units']['a0'])[1]['usable']);
        [$s3, ] = $e->apply($s2, 'a', ['type' => 'end_turn']);
        [$s3, ] = $e->apply($s3, 'b', ['type' => 'end_turn']);
        $this->assertArrayNotHasKey('turn_skill_used', $s3['units']['a0']);   // 다음 턴 해제
    }

    public function test_A6_A7_mp_mode_없는_전투와_mp_skills_false는_레거시_쿨다운_횟수로_동작한다(): void
    {
        [$e, $s] = $this->world(false);
        $this->assertNull($e->mpKnobs());
        $this->assertArrayNotHasKey('mp_mode', $s);
        $this->assertArrayNotHasKey('mp', $s['units']['a0']);
        [$s2, $ev] = $this->strike($e, $s);
        $this->assertSame(['cd' => 2, 'uses_left' => 1], $s2['units']['a0']['skill_state']['strike1']);
        $this->assertSame([], array_values(array_filter($ev, fn ($x) => $x['type'] === 'mp_change')));
        [$s3, ] = $e->apply($s2, 'a', ['type' => 'end_turn']);
        [$s3, ] = $e->apply($s3, 'b', ['type' => 'end_turn']);
        $this->assertSame(1, $s3['units']['a0']['skill_state']['strike1']['cd']);   // 쿨다운 -1
        // mp_skills=true 엔진이라도 mp_mode 키 없는 전투(진행 중 구 전투)는 레거시 유지
        [$eOn, ] = $this->world(true);
        [$s4, ] = $eOn->apply($s3, 'a', ['type' => 'end_turn']);
        $this->assertArrayNotHasKey('mp', $s4['units']['a0']);
        $this->assertNotNull($eOn->mpKnobs());
    }

    public function test_A8_봇은_MP가_부족하면_일반_공격을_충분하면_스킬을_쓴다(): void
    {
        [$e, $s] = $this->world();
        $bot = new HeuristicBot($e);
        $kinds = fn (array $st) => array_column(array_filter($bot->plan($st, 'a')['actions'], fn ($a) => ($a['unit_id'] ?? null) === 'a0'), 'type');
        $this->assertContains('use_skill', $kinds($s));            // MP 30 >= 20
        $s['units']['a0']['mp'] = 5;
        $this->assertNotContains('use_skill', $kinds($s));
        $this->assertContains('attack', $kinds($s));
    }

    public function test_A9_상대_뷰와_이벤트는_mp_pct만_공개하고_본인_진영만_수치를_본다(): void
    {
        [, $s] = $this->world();
        $s['units']['b0']['mp'] = 20;
        $s['units']['b0']['mp_max'] = 40;
        $mine = Engine::redactUnitMp($s['units']['a0'], 'a');
        $foe = Engine::redactUnitMp($s['units']['b0'], 'a');
        $this->assertSame([30, 60], [$mine['mp'], $mine['mp_max']]);
        $this->assertArrayNotHasKey('mp', $foe);
        $this->assertArrayNotHasKey('mp_max', $foe);
        $this->assertSame(50, $foe['mp_pct']);
        $ev = Engine::redactEvents([['type' => 'mp_change', 'side' => 'b', 'unit_id' => 'b0', 'delta' => -20, 'mp' => 5, 'mp_max' => 40, 'mp_pct' => 13, 'reason' => 'skill', 'overflow' => 0]], 'a');
        $this->assertSame(['type' => 'mp_change', 'side' => 'b', 'unit_id' => 'b0', 'mp_pct' => 15, 'reason' => 'skill'], $ev[0]);   // 13 -> 5% 단위 15
        $su = Engine::redactEvents([['type' => 'skill_use', 'side' => 'b', 'mp_cost' => 20, 'mp_left' => 5, 'mp_pct' => 12, 'skill' => 's']], 'a')[0];
        $this->assertSame(['type' => 'skill_use', 'side' => 'b', 'mp_cost' => 20, 'mp_pct' => 10, 'skill' => 's'], $su);   // mp_left만 제거(mp_cost 정적 공개), 12 -> 10
        $this->assertSame(55, Engine::redactUnitMp(['side' => 'b', 'mp' => 27, 'mp_max' => 50] + $s['units']['b0'], 'a')['mp_pct']);   // 54 -> 55
        $ownEv = Engine::redactEvents([['type' => 'mp_change', 'side' => 'a', 'mp' => 5]], 'a');
        $this->assertSame(5, $ownEv[0]['mp']);
    }

    public function test_M2_진영_턴_모드는_후공의_첫_틱_회복을_1회_건너뛰어_선후공_모두_시작MP로_첫_행동한다(): void
    {
        [$e, $s] = $this->world();
        $s['units']['b0']['mp'] = 23;
        $s['units']['b0']['mp_max'] = 45;
        [$s1, ] = $e->apply($s, 'a', ['type' => 'end_turn']);      // b 진영 1턴 시작
        $this->assertSame([23, true], [$s1['units']['b0']['mp'], $s1['mp_first_tick_skipped']]);
        [$s2, ] = $e->apply($s1, 'b', ['type' => 'end_turn']);
        [$s3, ] = $e->apply($s2, 'a', ['type' => 'end_turn']);     // 이후 틱은 정상 회복
        $this->assertSame(30, $s3['units']['b0']['mp']);
        $s['mp_knobs']['mp_skip_first_regen'] = 0;                  // 노브 off = 기존 동작(후공 이점)
        [$s4, ] = $e->apply($s, 'a', ['type' => 'end_turn']);
        $this->assertSame(30, $s4['units']['b0']['mp']);
    }

    public function test_교대_행동_라운드_시작에_양측_회복하고_turn_skill_used가_해제된다(): void
    {
        [$e, $s] = $this->world();
        $s['alternate'] = true;
        $s['alt'] = (new \ReflectionMethod($e, 'altInit'))->invoke($e, $s);
        $s['units']['a0']['turn_skill_used'] = true;
        $ev = [];
        (new \ReflectionMethod($e, 'endRound'))->invokeArgs($e, [&$s, &$ev, 'exhausted']);
        $this->assertSame([39, 2], [$s['units']['a0']['mp'], $s['turn']]);   // 30 + 9, 첫 틱 건너뜀은 교대 행동에 적용되지 않음
        $this->assertArrayNotHasKey('turn_skill_used', $s['units']['a0']);
        $this->assertArrayNotHasKey('mp_first_tick_skipped', $s);
    }

    public function test_시뮬레이터는_MP_지표를_집계하고_오류없이_끝난다(): void
    {
        [$e, $s] = $this->world();
        $st = (new \App\Game\Simulator($e))->runWithStats($s)['stats'];
        $this->assertGreaterThan(0, $st['skill_uses']);
        $this->assertSame($st['skill_uses'] * 20, $st['mp_spent']);
        $this->assertSame(1, $st['skill_first_use_turn']['a']);
        $this->assertArrayHasKey('mp_overflow', $st);
        $this->assertArrayHasKey('skill_blocked_by_mp', $st);
    }

    public function test_A14_MP_비용_기본_공식과_params_mp_cost_우선(): void
    {
        $this->assertSame(45, MpRules::cost('T_ACTIVE_STRIKE', ['power_pct' => 150]));
        $this->assertSame(35, MpRules::cost('T_ACTIVE_AOE', ['power_pct' => 100, 'splash_pct' => 60]));
        $this->assertSame(30, MpRules::cost('T_ACTIVE_BUFF', ['stat' => 'atk', 'amount' => 10]));
        $this->assertSame(25, MpRules::cost('T_ACTIVE_BUFF', ['stat' => 'def', 'amount' => 20]));
        $this->assertSame(20, MpRules::cost('T_ACTIVE_BUFF', ['stat' => 'move', 'amount' => 1]));
        $this->assertSame([30, 34], [MpRules::cost('T_ACTIVE_HEAL', ['radius' => 0]), MpRules::cost('T_ACTIVE_HEAL', ['radius' => 1])]);
        $this->assertSame([20, 23], [MpRules::cost('T_ACTIVE_SURGE', ['attack_pct' => 100]), MpRules::cost('T_ACTIVE_SURGE', ['attack_pct' => 110])]);
        $this->assertSame(33, MpRules::cost('T_ACTIVE_STRIKE', ['power_pct' => 100, 'mp_cost' => 33]));
        $this->assertSame(['mp_cost' => 100], array_intersect_key(\App\Game\ActiveParams::normalize('T_ACTIVE_HEAL', ['mp_cost' => 999], 2), ['mp_cost' => 1]));   // 범위 5~100 보정
    }
}
