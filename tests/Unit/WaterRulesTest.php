<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 수상(해전) 규칙 핵심: 수상 이동 비용·탑승 파생·수병 보너스·capture 목표·증원 트리거·주인공 사망 패배. */
class WaterRulesTest extends TestCase
{
    private function rules(): RuleSet
    {
        $base = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 300, 'atk' => 28, 'def' => 10];
        $types = [
            'sword' => ['move' => 4, 'move_type' => 'foot'] + $base,
            'flyer' => ['move' => 6, 'move_type' => 'flying'] + $base,
            'naval' => ['move' => 5, 'move_type' => 'naval', 'atk' => 27, 'def' => 9] + $base,
        ];
        $terr = [
            'plain' => ['foot' => ['cost' => 1, 'def_pct' => 0], 'flying' => ['cost' => 1, 'def_pct' => 0], 'naval' => ['cost' => 2, 'def_pct' => -20]],
            'sea' => ['foot' => ['cost' => 2, 'def_pct' => -10], 'flying' => ['cost' => 1, 'def_pct' => 0], 'naval' => ['cost' => 1, 'def_pct' => 25]],
            'void' => ['foot' => ['cost' => null, 'def_pct' => 0], 'flying' => ['cost' => null, 'def_pct' => 0], 'naval' => ['cost' => null, 'def_pct' => 0]],
        ];

        return new RuleSet($types, [], $terr, ['p' => 'plain', 'o' => 'sea', 'V' => 'void'], ['sea' => ['water' => 1, 'boarding' => 1]]);
    }

    /** @return array{0:Engine,1:array} */
    private function state(string $row, array $units, array $opts = [], ?array $objective = null): array
    {
        $r = $this->rules();
        $s = ArmyBuilder::initialState($r, ['width' => strlen($row), 'height' => 1, 'tiles' => [$row]], 1, 30);
        foreach ($units as $id => [$side, $type, $x, $kind]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, $kind, $type, null, 1, $x, 0, 3.0);
        }
        $objective && $s['objective'] = $objective;

        return [new Engine($r, $opts), $s];
    }

    public function test_수상_이동_비용과_허공은_비행도_통과_불가(): void
    {
        [$e, $s] = $this->state('ooooooo', ['a0' => ['a', 'sword', 0, 'commander']]);
        $r = $e->reachable($s, 'a0');
        $this->assertArrayHasKey('2,0', $r);      // 보병 이동 4 / 바다 비용 2 = 2칸
        $this->assertArrayNotHasKey('3,0', $r);
        [$e, $s] = $this->state('ooooooo', ['a0' => ['a', 'naval', 0, 'commander']]);
        $r = $e->reachable($s, 'a0');
        $this->assertArrayHasKey('5,0', $r);      // 수병 이동 5 = 바다 5칸
        $this->assertArrayNotHasKey('6,0', $r);
        [$e, $s] = $this->state('pVp', ['a0' => ['a', 'flyer', 0, 'commander']]);
        $this->assertArrayNotHasKey('2,0', $e->reachable($s, 'a0'));   // 허공은 비행도 벽
        $this->assertTrue($this->rules()->isBoarded('sword', 'sea'));
        $this->assertFalse($this->rules()->isBoarded('flyer', 'sea'));
        $this->assertFalse($this->rules()->isBoarded('naval', 'sea'));
    }

    public function test_수병_수상_보너스와_탑승_페널티가_스펙_산술을_재현(): void
    {
        $opts = ['dmg_mult' => 1.0, 'clamp' => [0.6, 1.5], 'naval_water_atk_mult' => 1.35, 'boarded_atk_mult' => 0.90, 'naval_land_atk_mult' => 0.80];
        $units = ['a0' => ['a', 'naval', 0, 'commander'], 'b0' => ['b', 'sword', 1, 'commander']];
        [$e, $s] = $this->state('oo', $units, $opts);
        $this->assertSame(27, $e->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));   // 수병->보병(바다): 27x1.35 - 10x0.90 = 27.45 (스펙 3.3절 27)
        $this->assertSame(14, $e->damage($s, $s['units']['b0'], 1, 0, $s['units']['a0']));   // 탑승 보병->수병: 28x0.9 - 9x1.25 = 13.95 (스펙 14)
        [$e, $s] = $this->state('pp', $units, $opts);
        $this->assertSame(12, $e->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));   // 수병 육상: 27x0.8 - 10 = 11.6 (스펙 12)
        [$e, $s] = $this->state('oo', $units, ['dmg_mult' => 1.0]);                           // 옵션 기본(1.0=OFF): 배율 없음 = 27 - 10x0.90
        $this->assertSame(18, $e->damage($s, $s['units']['a0'], 0, 0, $s['units']['b0']));
    }

    public function test_capture_도달형과_점유형_판정(): void
    {
        $units = ['a0' => ['a', 'sword', 0, 'commander'], 'b0' => ['b', 'sword', 4, 'commander']];
        $obj = ['type' => 'capture', 'points' => [[2, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit'];
        [$e, $s] = $this->state('ppppp', $units, [], $obj);
        [$s] = $e->apply($s, 'a', ['type' => 'move', 'unit_id' => 'a0', 'x' => 2, 'y' => 0]);
        $this->assertSame('finished', $s['status']);
        $this->assertSame('a', $s['winner']);
        [$e, $s] = $this->state('ppppp', $units, [], ['hold_turns' => 2] + $obj);   // 점유형: 2라운드 연속 점유
        [$s] = $e->apply($s, 'a', ['type' => 'move', 'unit_id' => 'a0', 'x' => 2, 'y' => 0]);
        $this->assertSame('active', $s['status']);
        foreach ([1, 2] as $round) {
            [$s] = $e->apply($s, 'a', ['type' => 'end_turn']);
            [$s] = $e->apply($s, 'b', ['type' => 'end_turn']);
            $this->assertSame($round === 1 ? 'active' : 'finished', $s['status']);
        }
        $this->assertSame('a', $s['winner']);
        $this->assertSame('defeat_commander', Engine::objectiveView([])['type']);   // 목표 미지정 = 기존 동작
    }

    public function test_증원_트리거는_지정_턴에_생성되고_로그를_남긴다(): void
    {
        [$e, $s] = $this->state('pppppp', ['a0' => ['a', 'sword', 0, 'commander'], 'b0' => ['b', 'sword', 5, 'commander']]);
        $s['triggers'] = Engine::normalizeTriggers([['on' => ['turn' => 2], 'action' => 'spawn', 'side' => 'b', 'zone' => 'z', 'units' => ['sword', 'sword']]], ['z' => [[4, 0]]], 1, 3.0, ['sword']);
        [$s] = $e->apply($s, 'a', ['type' => 'end_turn']);
        $this->assertCount(1, array_filter($s['units'], fn ($u) => $u['side'] === 'b'));
        [$s, $ev] = $e->apply($s, 'b', ['type' => 'end_turn']);   // 라운드 종료 -> 2라운드 시작 증원
        $this->assertCount(3, array_filter($s['units'], fn ($u) => $u['side'] === 'b'));
        $this->assertContains('reinforce', array_column($ev, 'type'));
        $this->assertSame([], Engine::triggersView($s));
    }

    public function test_주인공_사망은_목표와_무관하게_패배(): void
    {
        $obj = ['type' => 'capture', 'points' => [[2, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit'];
        [$e, $s] = $this->state('ppp', ['a0' => ['a', 'sword', 0, 'hero'], 'b0' => ['b', 'sword', 1, 'commander'], 'a1' => ['a', 'sword', 2, 'commander']], [], $obj);
        $s['units']['a0']['protagonist'] = true;
        $s['units']['a0']['hp'] = 1;
        [$s] = $e->apply($s, 'a', ['type' => 'end_turn']);
        [$s] = $e->apply($s, 'b', ['type' => 'attack', 'unit_id' => 'b0', 'target_id' => 'a0']);
        $this->assertSame('finished', $s['status']);
        $this->assertSame('b', $s['winner']);
    }
}
