<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class RuleOptionsTest extends TestCase
{
    private function rules(): RuleSet
    {
        $t = fn ($min, $max, $hp, $atk, $def, $heal = 0) => ['move' => 3, 'range_min' => $min, 'range_max' => $max, 'hp' => $hp, 'atk' => $atk, 'def' => $def, 'move_type' => 'foot', 'heal' => $heal];

        return new RuleSet(
            ['sword' => $t(1, 1, 100, 28, 10), 'archer' => $t(2, 2, 100, 28, 10), 'healer' => $t(1, 1, 100, 10, 5, 12), 'tank' => $t(1, 1, 100, 28, 100)],
            ['sword' => ['sword' => 1.25]],
            ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]],
        );
    }

    private function state(RuleSet $r, array $units): array
    {
        $s = ArmyBuilder::initialState($r, ['width' => 6, 'height' => 1, 'tiles' => ['pppppp']], 1, 30);
        foreach ($units as [$id, $side, $type, $x, $extra]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, 'troop', $type, null, 1, $x, 0, 3.0) + [];
            $s['units'][$id] = array_merge($s['units'][$id], $extra);
        }

        return $s;
    }

    public function test_패시브_클램프_최소피해(): void
    {
        $r = $this->rules();
        $s = $this->state($r, [
            ['a0', 'a', 'sword', 0, ['passive' => ['atk_pct' => 50]]], ['b0', 'b', 'sword', 1, ['passive' => ['def_pct' => 10]]],
            ['b1', 'b', 'tank', 2, []],
        ]);
        $legacy = new Engine($r);
        $new = new Engine($r, ['passive_skills' => true, 'clamp' => [0.6, 1.5], 'min_damage_pct' => 0.15]);

        // 레거시: 상성 1.25 x (오라 0, 패시브 무시) = 28*1.25-10 = 25
        $this->assertSame(25, $legacy->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));
        // 패시브 공격+50%: 총배율 1.25*1.5=1.875 -> 클램프 1.5, 방어 10+패시브10% = 11 -> 28*1.5-11 = 31
        $this->assertSame(31, $new->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));
        // 클램프 없이 패시브만: 28*1.875-11 = 41.5 -> 42
        $this->assertSame(42, (new Engine($r, ['passive_skills' => true]))->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));
        // 최소 피해: 방어 100이면 레거시 1, 신규 = round(28*0.15)=4
        $this->assertSame(1, $legacy->damage($s, $s['units']['a0'], 0, 0, $s['units']['b1']));
        $this->assertSame(4, $new->damage($s, $s['units']['a0'], 0, 0, $s['units']['b1']));
    }

    public function test_치유_퍼센트_상한_패시브와_원거리_반격(): void
    {
        $r = $this->rules();
        $s = $this->state($r, [
            ['a0', 'a', 'sword', 1, ['hp' => 40]], ['a1', 'a', 'healer', 0, ['passive' => ['heal' => 8]]], ['a2', 'a', 'healer', 2, []],
            ['b0', 'b', 'archer', 5, []],
        ]);
        $heals = function (array $opts) use ($r, $s) {
            [, $ev] = (new Engine($r, $opts))->apply($s, 'a', ['type' => 'end_turn']);

            return array_map(fn ($e) => $e['hp_after'] - $e['hp_before'], array_values(array_filter($ev, fn ($e) => $e['type'] === 'heal')));
        };
        $this->assertSame([12, 12], $heals([]));                                          // 레거시: 고정 12 + 12
        $this->assertSame([20, 15], $heals(['passive_skills' => true, 'heal_percent' => 0.15]));   // max(12+8, 15), max(12, 15)
        $this->assertSame([20, 10], $heals(['passive_skills' => true, 'heal_percent' => 0.15, 'heal_cap' => 30]));   // 총 30 상한

        // 원거리 간 반격: 거리 2의 궁수끼리
        $s2 = $this->state($r, [['a0', 'a', 'archer', 0, []], ['b0', 'b', 'archer', 2, []]]);
        $count = fn (array $o) => count(array_filter((new Engine($r, $o))->apply($s2, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0'])[1], fn ($e) => $e['type'] === 'counter'));
        $this->assertSame(0, $count([]));
        $this->assertSame(1, $count(['ranged_counter' => true]));
    }
}
