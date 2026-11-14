<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use App\Game\SquadPlanner;
use Tests\TestCase;

class SquadPlannerTest extends TestCase
{
    private function cfg(int $max = 12): array
    {
        return ['slots' => [[1, 2], [10, 3], [20, 4]], 'cap' => 4, 'max_units' => $max,
            'default_by_type' => ['sword' => ['sword', 'spear', 'archer', 'sword'], 'archer' => ['archer', 'sword']]];
    }

    public function test_레벨별_부대수_우선순위_진영_상한_균등감축(): void
    {
        $c = $this->cfg();
        $this->assertSame([2, 2, 3, 3, 4, 4], array_map(fn ($l) => SquadPlanner::slots($l, $c['slots']), [1, 9, 10, 19, 20, 30]));
        $e = fn (string $t, int $lv, ?array $troops = null, ?array $preset = null, int $bonus = 0) => ['row' => ['unit_type' => $t, 'troop_bonus' => $bonus], 'level' => $lv, 'troops' => $troops, 'preset' => $preset];
        $p = SquadPlanner::plan([$e('sword', 10, null, ['archer', 'mage']), $e('archer', 1), $e('sword', 1, ['mage'])], $c);
        $this->assertSame(['archer', 'mage', 'archer'], $p[0]);     // 프리셋을 3기로 순환
        $this->assertSame(['archer', 'sword'], $p[1]);              // 프리셋 없음 -> 병종 기본 편성
        $this->assertSame(['mage'], $p[2]);                         // 사용자 선택 그대로(슬롯보다 적어도 허용)
        // 등급별 상대 해금: slots_by_rarity 가 있으면 영웅 등급 표를 쓰고, 없는 등급은 slots 폴백
        $r = $c + ['slots_by_rarity' => ['C' => [[1, 2], [10, 3], [14, 4]]]];
        $this->assertSame([3, 4, 3], [SquadPlanner::count(13, 0, $r, 'C') , SquadPlanner::count(14, 0, $r, 'C'), SquadPlanner::count(13, 0, $r, 'S')]);
        // troop_bonus는 상한 4까지만
        $this->assertCount(4, SquadPlanner::plan([$e('sword', 20, null, null, 3)], $c)[0]);
        // 3영웅 x (1+4)=15 > 12 -> 가장 많은 영웅부터 균등 감축: 합 12
        $q = SquadPlanner::plan([$e('sword', 20), $e('sword', 20), $e('sword', 20)], $c);
        $this->assertSame(12, 3 + array_sum(array_map('count', $q)));
        $this->assertLessThanOrEqual(1, max(array_map('count', $q)) - min(array_map('count', $q)));
    }

    public function test_고정_병종은_사용자_입력_프리셋을_무시하고_클라이언트_class는_서버값으로_대체(): void
    {
        $c = $this->cfg();
        $e = fn (?string $fixed, int $lv, ?array $troops = null, ?array $preset = null) => ['row' => ['unit_type' => 'sword', 'troop_bonus' => 0, 'troop_type' => $fixed], 'level' => $lv, 'troops' => $troops, 'preset' => $preset];
        $p = SquadPlanner::plan([$e('cavalry', 10, ['mage', 'healer'], ['archer']), $e(null, 1, ['mage'])], $c);
        $this->assertSame(['cavalry', 'cavalry', 'cavalry'], $p[0]);   // 슬롯 3기 모두 고정 병종
        $this->assertSame(['mage'], $p[1]);                            // troop_type null -> 기존 폴백(사용자 선택)
        $m = SquadPlanner::mergePositions(['cavalry', 'cavalry'], [['class' => 'mage', 'x' => 1, 'y' => 2]]);
        $this->assertSame(['type' => 'cavalry', 'x' => 1, 'y' => 2], $m[0]);   // 오류 없이 서버 병종
        $this->assertSame('cavalry', $m[1]);
    }

    public function test_addSide는_영웅별_부대와_leader_id를_부여하고_자리가_없어도_예외가_없다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t, 'archer' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $engine = new Engine($r);
        $hero = fn () => ['code' => 'h', 'name_ko' => 'H', 'unit_type' => 'sword', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0.0, 'growth_atk_pct' => 0.0, 'growth_def_pct' => 0.0, 'aura' => ['radius' => 2, 'atk_pct' => 5, 'def_pct' => 5], 'passive' => null];
        $zone = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]];   // 5칸뿐
        $s = ArmyBuilder::initialState($r, ['width' => 6, 'height' => 1, 'tiles' => ['pppppp']], 1, 30, 'a', false, true);
        $entries = [['row' => $hero(), 'level' => 1, 'key' => 0], ['row' => $hero(), 'level' => 1, 'key' => 1]];
        ArmyBuilder::addSide($engine, $s, 'a', $entries, [], $zone, [0 => [0, 0], 1 => [4, 0]], 3.0, [['sword', 'archer', 'sword'], ['archer', 'archer', 'archer']]);
        $units = $s['units'];
        $this->assertCount(5, $units);                                        // 영웅 2 + 자리 3(나머지 부대는 생략, 예외 없음)
        $this->assertSame('commander', $units['a0']['kind']);
        $this->assertSame('hero', $units['a1']['kind']);
        $this->assertNotNull($units['a1']['aura'] ?? null);                   // 부대가 있는 비지휘 영웅만 오라 보유
        $leaders = array_values(array_unique(array_filter(array_column($units, "leader_id"))));
        $this->assertEqualsCanonicalizing(['a0', 'a1'], $leaders);            // 영웅별 leader_id
        foreach ($units as $u) {
            $this->assertContains($u['kind'], ['commander', 'hero', 'troop']);
        }
    }
}
