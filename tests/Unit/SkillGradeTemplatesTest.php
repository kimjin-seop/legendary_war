<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\PassiveEffects;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 스킬 등급 재분배 2단계 템플릿(PURSUIT/SIEGE/MOVE_UP/REGEN, S급 TERRAIN_MASTER/MATCHUP_NEGATE/PIERCE/STANCE) 핵심 동작. */
class SkillGradeTemplatesTest extends TestCase
{
    private function setup_(array $opts = [], array $matchups = []): array
    {
        $foot = fn (int $atk = 30, int $def = 10) => ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => $atk, 'def' => $def, 'move_type' => 'foot', 'heal' => 0];
        $terr = ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]], 'water' => ['foot' => ['cost' => 3, 'def_pct' => 0]], 'castle' => ['foot' => ['cost' => 1, 'def_pct' => 0]]];
        $r = new RuleSet(['sword' => $foot(), 'spear' => $foot()], $matchups, $terr, ['p' => 'plain', 'w' => 'water', 'c' => 'castle']);
        $e = new Engine($r, ['active_skills' => true, 'passive_skills' => true, 'clamp' => [0.6, 1.5], 'min_damage_pct' => 0.15] + $opts);
        $s = ArmyBuilder::initialState($r, ['width' => 6, 'height' => 1, 'tiles' => ['ppwppp']], 1, 30, 'a', false, false);

        return [$e, $r, $s];
    }

    private function hero(array $extra = []): array
    {
        return $extra + ['code' => 'h', 'name_ko' => 'H', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => null, 'passive' => null];
    }

    public function test_추격과_공성_조건과_이동력_재생은_지원_템플릿으로_동작한다(): void
    {
        foreach (['T_PURSUIT', 'T_SIEGE_ATK', 'T_MOVE_UP', 'T_REGEN', 'T_TERRAIN_MASTER', 'T_MATCHUP_NEGATE'] as $t) {
            $this->assertContains($t, PassiveEffects::SUPPORTED_TEMPLATES);
        }
        $f = PassiveEffects::fold(['p' => ['effects' => [['atk_pct' => 20, 'when' => ['target_hp_below_pct' => 50]]]], 'm' => ['effects' => [['move' => 1], ['regen_hp' => 5]]]]);
        $this->assertCount(1, $f['conditional']);                       // 조건부는 conditional, 무조건 move/regen_hp 는 passive 합
        $this->assertSame(['move' => 1, 'regen_hp' => 5], $f['passive']);

        [$e, $r, $s] = $this->setup_();
        $att = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $this->hero(['skills' => [['code' => 'pur', 'atk_pct' => 20, 'when' => ['target_hp_below_pct' => 50]], ['code' => 'sg', 'atk_pct' => 10, 'when' => ['target_terrain' => ['castle']]]]]), 1, 0, 0, 3.0);
        $def = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 1, 0, 3.0);
        $base = $e->damageInfo($s, $att, 0, 0, $def);
        $this->assertSame([], $base['skills_applied']);
        $hurt = $e->damageInfo($s, $att, 0, 0, ['hp' => 40] + $def);   // 상대 HP 50% 이하 -> 추격
        $this->assertSame(['pur'], $hurt['skills_applied']);
        $this->assertGreaterThan($base['dmg'], $hurt['dmg']);
        $s['tiles'][0][1] = 'castle';                                    // 상대가 성 타일 -> 공성
        $this->assertSame(['sg'], $e->damageInfo($s, $att, 0, 0, $def)['skills_applied']);

        // 이동력 +1 (passive.move) 과 턴 종료 재생 (passive.regen_hp = 최대 HP의 N%)
        [$e, $r, $s] = $this->setup_();
        $u = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $this->hero(['passive' => ['move' => 1, 'regen_hp' => 10]]), 1, 0, 0, 3.0);
        $this->assertSame($u['move'] + 1, $e->moveBudget($s, $u));
        $s['units']['a0'] = ['hp' => 50] + $u;
        [$s2] = $e->apply($s, 'a', ['type' => 'end_turn']);
        $this->assertSame(50 + (int) ceil($u['max_hp'] * 0.10), $s2['units']['a0']['hp']);
    }

    public function test_지형_숙련_이동비용_감소와_상성_무효(): void
    {
        [$e, $r, $s] = $this->setup_(matchups: ['sword' => ['spear' => 0.8]]);
        $plain = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 1, 0, 3.0);
        $master = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $this->hero(['passive' => null]), 1, 1, 0, 3.0);
        $master['special'] = ['move_discount' => [['terrain' => ['water'], 'amount' => 1]], 'matchup_negate' => ['spear']];
        $cost = function (array $u) use ($e, $s) {
            $s['units'] = ['a0' => $u];

            return $e->reachable($s, 'a0')['2,0'] ?? null;
        };
        $s['units'] = ['a0' => $plain];
        $this->assertSame(3, $cost($plain));       // 물 타일 비용 3
        $this->assertSame(2, $cost($master));      // 숙련 -1
        $spear = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'spear', null, 1, 4, 0, 3.0);
        $this->assertSame(0.8, $e->damageInfo($s, $plain, 1, 0, $spear)['multiplier']);
        $this->assertSame(1.0, $e->damageInfo($s, $master, 1, 0, $spear)['multiplier']);     // 상성 불리 무효
    }

    public function test_관통과_반격태세는_액티브로_사용된다(): void
    {
        [$e, $r, $s] = $this->setup_();
        $acts = [
            ['code' => 'pierce1', 'name' => '관통', 'template' => 'T_ACTIVE_PIERCE', 'power_pct' => 100, 'cooldown' => 4, 'uses' => 1, 'params' => ['power_pct' => 100, 'def_ignore_pct' => 40, 'cooldown' => 4, 'uses' => 1]],
            ['code' => 'stance1', 'name' => '태세', 'template' => 'T_ACTIVE_STANCE', 'power_pct' => 0, 'cooldown' => 4, 'uses' => 1, 'params' => ['counter_pct' => 50, 'radius' => 2, 'duration' => 1, 'cooldown' => 4, 'uses' => 1]],
        ];
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', $this->hero(['actives' => $acts]), 1, 1, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 2, 0, 3.0);
        $normal = $e->damage($s, $s['units']['a0'], 1, 0, $s['units']['b0']);
        [$s1, $ev] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'pierce1', 'target_id' => 'b0']);
        $this->assertGreaterThan($normal, collect($ev)->firstWhere('type', 'attack')['dmg']);   // 방어 40% 무시 -> 일반 공격보다 큼
        $this->assertTrue($s1['units']['a0']['acted']);

        [$s2, $ev2] = $e->apply($s, 'a', ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'stance1']);
        $this->assertSame('stance', $ev2[0]['kind']);
        $this->assertSame('counter', $s2['units']['a0']['buffs'][0]['stat']);
        $this->assertSame(50, $s2['units']['a0']['buffs'][0]['amount']);
        $this->assertGreaterThan($e->damageInfo($s, $s['units']['a0'], 1, 0, $s['units']['b0'], true)['dmg'], $e->damageInfo($s2, $s2['units']['a0'], 1, 0, $s2['units']['b0'], true)['dmg']);   // 반격 피해 증가
    }
}
