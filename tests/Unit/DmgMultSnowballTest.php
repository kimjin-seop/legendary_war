<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class DmgMultSnowballTest extends TestCase
{
    private function rules(): RuleSet
    {
        $t = fn ($hp, $atk, $def) => ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => $hp, 'atk' => $atk, 'def' => $def, 'move_type' => 'foot', 'heal' => 0];

        return new RuleSet(['sword' => $t(100, 28, 10), 'tank' => $t(100, 28, 100)], ['sword' => ['sword' => 1.25]], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
    }

    /** @param list<array{string,string,string,int}> $units */
    private function state(RuleSet $r, array $units, ?array $snowball = null): array
    {
        $s = ArmyBuilder::initialState($r, ['width' => 8, 'height' => 1, 'tiles' => ['pppppppp']], 1, 30, 'a', false, false, false, $snowball);
        foreach ($units as [$id, $side, $type, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, 'troop', $type, null, 1, $x, 0, 3.0);
        }

        return $s;
    }

    public function test_dmg_mult는_최소피해_clamp_이전에_곱하고_범위_clamp된다(): void
    {
        $r = $this->rules();
        $s = $this->state($r, [['a0', 'a', 'sword', 0], ['b0', 'b', 'sword', 1], ['b1', 'b', 'tank', 2]]);
        $dmg = fn (array $o, string $t) => (new Engine($r, $o))->damage($s, $s['units']['a0'], 0, 0, $s['units'][$t]);

        $this->assertSame(25, $dmg([], 'b0'));                       // 기본 1.0 = 기존 (35-10)
        $this->assertSame(30, $dmg(['dmg_mult' => 1.2], 'b0'));      // (35-10) x 1.2
        $this->assertSame(50, $dmg(['dmg_mult' => 9], 'b0'));        // 생성자 clamp 2.0
        $this->assertSame(13, $dmg(['dmg_mult' => 0], 'b0'));        // 생성자 clamp 0.5: round(12.5)
        // 방어가 압도적(음수 피해)이면 배율이 최소 피해를 끌어올리지 못함: 배율 곱 -> 이후 최소 피해 clamp
        $o = ['min_damage_pct' => 0.15, 'dmg_mult' => 1.2];
        $this->assertSame(4, $dmg($o, 'b1'));                        // max(round(28 x 0.15)=4, (35-100) x 1.2)
        $this->assertSame(1, $dmg(['dmg_mult' => 1.2], 'b1'));
        // 맵 rules 오버라이드 범위 검증
        $this->assertSame(['dmg_mult' => 1.5], Engine::sanitizeMapRules(['dmg_mult' => 1.5]));
        $this->expectException(\InvalidArgumentException::class);
        Engine::sanitizeMapRules(['dmg_mult' => 3]);
    }

    public function test_snowball_보너스_상한과_off_회귀(): void
    {
        $r = $this->rules();
        $units = [['a0', 'a', 'sword', 0], ['a1', 'a', 'sword', 1], ['a2', 'a', 'sword', 2], ['b0', 'b', 'sword', 3]];
        $sb = fn (array $x) => $x + ['basis' => 'hp', 'dead' => 0.15, 'slope' => 0.5, 'cap' => 0.10, 'hero_factor' => 1.0];
        $e = new Engine($r);
        $dmg = function (array $s) use ($e) { return $e->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']); };

        $this->assertSame(25, $dmg($this->state($r, $units)));                                   // off(null): 기존과 동일
        $this->assertArrayNotHasKey('snowball', $this->state($r, $units));                       // off면 state에 기록 안 함
        // r=3: bonus=min(cap 0.2, (3-1-0.15) x 1) = 0.2 -> 총배율 1.25 x 1.2 = 1.5 -> 42-10
        $this->assertSame(32, $dmg($this->state($r, $units, $sb(['cap' => 0.2, 'slope' => 1.0]))));
        // 상한: slope를 4배로 올려도 cap(0.10)에서 막힘
        $this->assertSame(
            $dmg($this->state($r, $units, $sb(['slope' => 0.5]))),
            $dmg($this->state($r, $units, $sb(['slope' => 2.0]))),
        );
        // 열세 쪽(b0)은 보너스 없음 / 동수는 dead 구간 -> 0
        $s = $this->state($r, $units, $sb([]));
        $this->assertSame(25, $e->damage($s, $s['units']['b0'], 3, 0, $s['units']['a0']));
        $eq = $this->state($r, [['a0', 'a', 'sword', 0], ['b0', 'b', 'sword', 1]], $sb([]));
        $this->assertSame(25, $e->damage($eq, $eq['units']['a0'], 0, 0, $eq['units']['b0']));
    }
}
