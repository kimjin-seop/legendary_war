<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class TerrainRulesTest extends TestCase
{
    private function rules(): RuleSet
    {
        $base = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 200, 'atk' => 40, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $mod = fn (int $def) => ['foot' => ['cost' => 1, 'def_pct' => $def]];

        return new RuleSet(
            ['sword' => $base, 'archer' => ['range_min' => 2, 'range_max' => 2] + $base],
            [],
            ['plain' => $mod(0), 'mountain' => $mod(30), 'forest' => $mod(20), 'village' => $mod(10)],
            ['p' => 'plain', 'm' => 'mountain', 'f' => 'forest', 'v' => 'village'],
            ['mountain' => ['elevation' => 1], 'forest' => ['cover' => 1], 'village' => ['heals' => 1]],
        );
    }

    /** @return array{0:Engine,1:array} */
    private function state(array $opts, string $row, array $units): array
    {
        $r = $this->rules();
        $s = ArmyBuilder::initialState($r, ['width' => strlen($row), 'height' => 1, 'tiles' => [$row]], 1, 30);
        foreach ($units as $id => [$side, $type, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, 'troop', $type, null, 1, $x, 0, 3.0);
        }

        return [new Engine($r, $opts), $s];
    }

    public function test_고지_엄폐_방어상한_마을회복은_옵션이_켜질_때만_동작한다(): void
    {
        // 고지: 산(x=0) 위 검병이 평지(x=1) 대상을 공격
        $units = ['a0' => ['a', 'sword', 0], 'b0' => ['b', 'sword', 1]];
        [$off, $s] = $this->state([], 'mpppp', $units);
        [$on] = $this->state(['highground_mult' => 1.10], 'mpppp', $units);
        $this->assertGreaterThan($off->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']), $on->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));
        $this->assertSame(1.1, $on->damageInfo($s, $s['units']['a0'], 0, 0, $s['units']['b0'])['elevation_mult']);
        $this->assertSame(1.0, $on->damageInfo($s, $s['units']['b0'], 1, 0, $s['units']['a0'])['elevation_mult']);   // 저지->고지는 보너스 없음
        // 숲 엄폐: 원거리(궁병) 공격이 숲 위 대상에게 x0.85, 근접은 제외, 원거리 대상 제외 옵션
        $u2 = ['a0' => ['a', 'archer', 0], 'b0' => ['b', 'sword', 2], 'a1' => ['a', 'sword', 3]];
        [$cv, $s2] = $this->state(['forest_cover_mult' => 0.85], 'pppfp', ['a0' => ['a', 'archer', 1], 'b0' => ['b', 'sword', 3], 'a1' => ['a', 'sword', 2]]);
        [$no] = $this->state([], 'pppfp', []);
        $this->assertLessThan($no->damage($s2, $s2['units']['a0'], 1, 0, $s2['units']['b0']), $cv->damage($s2, $s2['units']['a0'], 1, 0, $s2['units']['b0']));
        $this->assertSame($no->damage($s2, $s2['units']['a1'], 2, 0, $s2['units']['b0']), $cv->damage($s2, $s2['units']['a1'], 2, 0, $s2['units']['b0']));   // 근접은 엄폐 무관
        $s2['units']['b0']['type'] = 'archer';   // 대상이 원거리일 때
        [$ex] = $this->state(['forest_cover_mult' => 0.85, 'forest_cover_exclude_ranged_target' => true], 'pppfp', []);
        $this->assertSame($no->damage($s2, $s2['units']['a0'], 1, 0, $s2['units']['b0']), $ex->damage($s2, $s2['units']['a0'], 1, 0, $s2['units']['b0']));
        // 방어 보정 합 상한: 산(def 30%) 위 대상 + 오라 형태의 def 40% 합 70 -> 상한 60
        [$cap, $s3] = $this->state(['def_total_cap' => 60], 'mpppp', ['a0' => ['a', 'sword', 1], 'b0' => ['b', 'sword', 0]]);
        $s3['units']['b0']['passive'] = ['def_pct' => 40];
        [$nocap] = $this->state(['passive_skills' => true], 'mpppp', []);
        [$cap] = $this->state(['passive_skills' => true, 'def_total_cap' => 50], 'mpppp', []);
        $this->assertTrue($cap->damageInfo($s3, $s3['units']['a0'], 1, 0, $s3['units']['b0'])['def_capped']);
        $this->assertGreaterThan($nocap->damage($s3, $s3['units']['a0'], 1, 0, $s3['units']['b0']), $cap->damage($s3, $s3['units']['a0'], 1, 0, $s3['units']['b0']));
        // 마을 회복: 턴 종료 시 최대 HP 10%(heal_cap 공유), off면 회복 없음
        [$v, $s4] = $this->state(['village_heal_pct' => 0.10], 'pvppp', ['a0' => ['a', 'sword', 1], 'b0' => ['b', 'sword', 4]]);
        $s4['units']['a0']['hp'] = 100;
        [$s4b, $ev] = $v->apply($s4, 'a', ['type' => 'end_turn']);
        $this->assertSame(120, $s4b['units']['a0']['hp']);                       // 최대 200의 10%
        $this->assertSame('heal', $ev[0]['type']);
        $this->assertNull($ev[0]['actor_unit_id']);
        [$off4, $s5] = $this->state([], 'pvppp', ['a0' => ['a', 'sword', 1], 'b0' => ['b', 'sword', 4]]);
        $s5['units']['a0']['hp'] = 100;
        $this->assertSame(100, $off4->apply($s5, 'a', ['type' => 'end_turn'])[0]['units']['a0']['hp']);
    }
}
