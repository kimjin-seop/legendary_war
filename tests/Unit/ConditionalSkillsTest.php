<?php

namespace Tests\Unit;

use App\Game\Engine;
use App\Game\PassiveEffects;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class ConditionalSkillsTest extends TestCase
{
    private function engine(array $opts = []): Engine
    {
        $types = [
            'sword' => ['move' => 4, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0, 'name' => '검병', 'cost' => 1],
            'cavalry' => ['move' => 6, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0, 'name' => '기병', 'cost' => 1],
        ];
        $terr = ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]], 'forest' => ['foot' => ['cost' => 2, 'def_pct' => 0]]];
        $attrs = ['plain' => ['elevation' => 0, 'cover' => 0, 'heals' => 0], 'forest' => ['elevation' => 0, 'cover' => 0, 'heals' => 0]];
        $rules = new RuleSet($types, [], $terr, ['.' => 'plain', 'f' => 'forest'], $attrs);

        return new Engine($rules, $opts + ['passive_skills' => true, 'clamp' => [0.6, 1.5], 'min_damage_pct' => 0.15]);
    }

    private function unit(string $id, string $side, string $type, int $x, int $y, array $extra = []): array
    {
        return $extra + ['id' => $id, 'side' => $side, 'kind' => 'commander', 'type' => $type, 'x' => $x, 'y' => $y, 'hp' => 100, 'max_hp' => 100, 'atk' => 30, 'def' => 10, 'moved' => false, 'acted' => false, 'aura' => null, 'passive' => null];
    }

    private function state(array $units, string $tile = 'plain'): array
    {
        $byId = [];
        foreach ($units as $u) {
            $byId[$u['id']] = $u;
        }

        return ['width' => 5, 'height' => 5, 'tiles' => array_fill(0, 5, array_fill(0, 5, $tile)), 'turn' => 1, 'units' => $byId, 'facing' => false, 'squad' => false];
    }

    private function dmg(Engine $e, array $att, array $def, bool $counter = false, ?array $st = null): array
    {
        $st ??= $this->state([$att, $def]);

        return $e->damageInfo($st, $att, $att['x'], $att['y'], $def, $counter);
    }

    private function fx(array $effect): array
    {
        return [['code' => 'sk'] + $effect];
    }

    public function test_조건_충족시에만_피해에_반영된다(): void
    {
        $e = $this->engine();
        $def = $this->unit('d', 'b', 'cavalry', 1, 0);
        $plain = $this->unit('a', 'a', 'sword', 0, 0);
        $base = $this->dmg($e, $plain, $def)['dmg'];
        $this->assertSame(20, $base);

        // vs
        $r = $this->dmg($e, $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 20, 'when' => ['vs' => ['cavalry']]])]), $def);
        $this->assertSame(26, $r['dmg']);
        $this->assertSame(['sk'], $r['skills_applied']);
        $miss = $this->dmg($e, $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 20, 'when' => ['vs' => ['archer']]])]), $def);
        $this->assertSame($base, $miss['dmg']);
        $this->assertSame([], $miss['skills_applied']);

        // hp_below_pct(배수진)
        $low = $this->unit('a', 'a', 'sword', 0, 0, ['hp' => 40, 'skills' => $this->fx(['atk_pct' => 20, 'when' => ['hp_below_pct' => 50]])]);
        $this->assertSame(26, $this->dmg($e, $low, $def)['dmg']);
        $this->assertSame($base, $this->dmg($e, ['hp' => 80] + $low, $def)['dmg']);
        // target_full_hp(선제 타격)
        $fs = $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 20, 'when' => ['target_full_hp' => true]])]);
        $this->assertSame(26, $this->dmg($e, $fs, $def)['dmg']);
        $this->assertSame($base, $this->dmg($e, $fs, ['hp' => 90] + $def)['dmg']);
        // counter(반격 강화)
        $ca = $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 20, 'when' => ['counter' => true]])]);
        $this->assertSame($base, $this->dmg($e, $ca, $def)['dmg']);
        $this->assertSame(26, $this->dmg($e, $ca, $def, true)['dmg']);
        // moved(돌격): 실제 이동했을 때만, 반격 제외
        $ch = $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 20, 'when' => ['moved' => true]])]);
        $this->assertSame($base, $this->dmg($e, $ch, $def)['dmg']);
        $this->assertSame($base, $this->dmg($e, ['moved' => true, 'move_from' => [0, 0]] + $ch, $def)['dmg']);   // 제자리 이동은 돌격 아님
        $this->assertSame(26, $this->dmg($e, ['moved' => true, 'move_from' => [0, 1]] + $ch, $def)['dmg']);
        $this->assertSame($base, $this->dmg($e, ['moved' => true, 'move_from' => [0, 1]] + $ch, $def, true)['dmg']);
        // terrain(공격, 공격자 타일 기준)
        $ta = $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 20, 'when' => ['terrain' => ['forest']]])]);
        $this->assertSame($base, $this->dmg($e, $ta, $def)['dmg']);
        $this->assertSame(26, $this->dmg($e, $ta, $def, false, $this->state([$ta, $def], 'forest'))['dmg']);
    }

    public function test_지형_방어와_진형은_해당_조건에서만(): void
    {
        $e = $this->engine();
        $att = $this->unit('a', 'a', 'sword', 0, 0);
        $d = $this->unit('d', 'b', 'sword', 1, 0, ['skills' => $this->fx(['def_pct' => 50, 'when' => ['terrain' => ['forest']]])]);
        $this->assertSame(20, $this->dmg($e, $att, $d)['dmg']);
        $r = $this->dmg($e, $att, $d, false, $this->state([$att, $d], 'forest'));
        $this->assertSame(15, $r['dmg']);
        $this->assertSame(['sk'], $r['skills_applied']);

        $form = $this->unit('d', 'b', 'sword', 1, 0, ['skills' => $this->fx(['def_pct' => 10, 'when' => ['adjacent_allies' => 2]])]);
        $x1 = $this->unit('x1', 'b', 'sword', 2, 0);
        $x2 = $this->unit('x2', 'b', 'sword', 1, 1);
        $x3 = $this->unit('x3', 'b', 'sword', 1, 2);   // 비인접
        $this->assertSame(20, $this->dmg($e, $att, $form)['dmg']);
        $this->assertSame(19, $this->dmg($e, $att, $form, false, $this->state([$att, $form, $x1]))['dmg']);
        $this->assertSame(18, $this->dmg($e, $att, $form, false, $this->state([$att, $form, $x1, $x2, $x3]))['dmg']);   // 상한 2명
    }

    public function test_스킬은_clamp와_def_total_cap을_우회하지_못한다(): void
    {
        $e = $this->engine(['def_total_cap' => 40]);
        $def = $this->unit('d', 'b', 'sword', 1, 0);
        $big = $this->unit('a', 'a', 'sword', 0, 0, ['skills' => $this->fx(['atk_pct' => 500, 'when' => ['target_full_hp' => true]])]);
        $this->assertSame(35, $this->dmg($e, $big, $def)['dmg']);   // 총배율 clamp 1.5 -> 45-10
        $tank = $this->unit('d', 'b', 'sword', 1, 0, ['skills' => $this->fx(['def_pct' => 500, 'when' => ['hp_below_pct' => 100]])]);
        $r = $this->dmg($e, $this->unit('a', 'a', 'sword', 0, 0), $tank);
        $this->assertTrue($r['def_capped']);
        $this->assertSame(16, $r['dmg']);                           // def 10 x 1.4 -> 30-14
    }

    public function test_조건_없는_피해는_불변이고_미충족_스킬은_영향이_없다(): void
    {
        $e = $this->engine();
        $d = $this->unit('d', 'b', 'sword', 1, 0);
        $a = $this->unit('a', 'a', 'sword', 0, 0, ['passive' => ['atk_pct' => 10]]);
        $this->assertSame(23, $this->dmg($e, $a, $d)['dmg']);      // 30x1.1-10
        $withIdle = $a + ['skills' => $this->fx(['atk_pct' => 15, 'when' => ['vs' => ['archer']]])];
        $this->assertSame(23, $this->dmg($e, $withIdle, $d)['dmg']);
        $this->assertArrayNotHasKey('skills', $a);
    }

    public function test_fold는_지원_조건만_conditional로_미지원은_ignored로(): void
    {
        $f = PassiveEffects::fold([
            'a' => ['effects' => [['atk_pct' => 5]]],
            'b' => ['effects' => [['atk_pct' => 9, 'when' => ['vs' => ['cavalry']]]]],
            'c' => ['effects' => [['atk_pct' => 9, 'when' => ['weather' => 'rain']]]],   // 미지원 조건(T_PURSUIT target_hp_below_pct 는 이제 지원)
        ]);
        $this->assertSame(['atk_pct' => 5], $f['passive']);
        $this->assertCount(1, $f['conditional']);
        $this->assertSame('b', $f['conditional'][0]['code']);
        $this->assertSame('c', $f['ignored'][0]['skill']);
    }
}
