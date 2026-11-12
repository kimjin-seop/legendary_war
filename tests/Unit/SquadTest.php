<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class SquadTest extends TestCase
{
    private function build(bool $squad): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 200, 'atk' => 40, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 10, 'height' => 1, 'tiles' => ['pppppppppp']], 1, 30, 'a', false, $squad);
        $mk = function (string $id, string $side, string $kind, int $x, ?string $leader, ?array $aura = null) use ($r, &$s) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, 0, 3.0);
            $s['units'][$id]['leader_id'] = $leader;
            $aura && $s['units'][$id]['aura'] = $aura;
        };
        $mk('b0', 'b', 'commander', 6, null, ['radius' => 3, 'atk_pct' => 0, 'def_pct' => 10]);   // 지휘관
        $mk('b1', 'b', 'hero', 8, null, ['radius' => 3, 'atk_pct' => 10, 'def_pct' => 0]);        // 비지휘 영웅(오라 데이터 보유)
        $mk('b2', 'b', 'troop', 7, 'b0');                                                          // 지휘관 부대 (b1 오라 반경 안)
        $mk('b3', 'b', 'troop', 9, 'b1');                                                          // 영웅 b1 부대
        $mk('a0', 'a', 'commander', 5, null);

        return [new Engine($r), $s];
    }

    public function test_오라는_소속_부대와_본인만_받고_다른_영웅_부대는_받지_않는다(): void
    {
        [$e, $s] = $this->build(true);
        $u = $s['units'];
        $this->assertSame([0, 10], $e->auraBonus($s, $u['b2'], 7, 0));    // 지휘관 부대: 지휘관 오라만(b1 오라 atk는 비수혜)
        $this->assertSame([10, 0], $e->auraBonus($s, $u['b3'], 9, 0));    // 영웅 b1 부대: b1 오라만
        $this->assertSame([0, 10], $e->auraBonus($s, $u['b0'], 6, 0));    // 본인 포함
        $this->assertSame([0, 0], (new Engine($e->rules(), ['squad_aura_self' => false]))->auraBonus($s, $u['b0'], 6, 0));   // 옵션: 본인 제외
        // off: 기존 규칙(commander 오라가 반경 내 같은 진영 모두에게)
        [$e2, $s2] = $this->build(false);
        $this->assertSame([0, 10], $e2->auraBonus($s2, $s2['units']['b3'], 9, 0));   // 반경 3 안(6~9), 기존 방식은 소속 무관
    }

    public function test_영웅_사망시_소속_부대가_즉시_붕괴하고_collapse_이벤트가_kill_뒤_battle_end_앞에_온다(): void
    {
        [$e, $s] = $this->build(true);
        $s['units']['a0']['x'] = 7;   // b1(x=8) 인접? b1 x=8, a0 x=7 인접
        $s['units']['b2']['x'] = 4;   // 길 비움
        $s['units']['b1']['hp'] = 1;
        [$s, $ev] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b1']);
        $types = array_column($ev, 'type');
        $this->assertSame(['attack', 'kill', 'collapse'], $types);
        $this->assertSame(['b3'], $ev[2]['unit_ids']);
        $this->assertSame('b1', $ev[2]['target_unit_id']);
        $this->assertArrayNotHasKey('b3', $s['units']);
        $this->assertArrayHasKey('b2', $s['units']);          // 다른 영웅(지휘관) 부대는 유지
        $this->assertSame('active', $s['status']);
        // 지휘관 사망: collapse 후 battle_end(commander_defeated)
        [$e, $s] = $this->build(true);
        $s['units']['a0']['x'] = 5;
        $s['units']['b0']['hp'] = 1;
        [$s, $ev] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);
        $this->assertSame(['attack', 'kill', 'collapse', 'battle_end'], array_column($ev, 'type'));
        $this->assertSame(['b2'], $ev[2]['unit_ids']);
        // off: collapse 없음(기존 동작)
        [$e, $s] = $this->build(false);
        $s['units']['b0']['hp'] = 1;
        [, $ev] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);
        $this->assertNotContains('collapse', array_column($ev, 'type'));
    }

    public function test_구_state_leader_id_누락과_반격_사망_경계에서도_오류없이_붕괴한다(): void
    {
        [$e, $s] = $this->build(true);
        foreach ($s['units'] as $id => $u) {
            unset($s['units'][$id]['leader_id']);          // 구 state: leader_id 키 없음(squad on)
        }
        $this->assertSame([0, 0], $e->auraBonus($s, $s['units']['b2'], 7, 0));   // 키가 없어도 오류 없이 비수혜
        $s['units']['a0']['kind'] = 'hero';
        $s['units']['a0']['hp'] = 1;                       // 반격에 죽는 영웅
        $s['units']['a1'] = $s['units']['b2'];
        $s['units']['a1'] = ['id' => 'a1', 'side' => 'a', 'x' => 4, 'leader_id' => 'a0'] + $s['units']['a1'];
        $s['units']['b0']['hp'] = 500;                     // 비치명 공격
        [$s, $ev] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);
        $this->assertSame(['attack', 'counter', 'kill', 'collapse'], array_column($ev, 'type'));
        $this->assertSame(['a1'], $ev[3]['unit_ids']);
        $this->assertArrayNotHasKey('a1', $s['units']);
        $this->assertSame('active', $s['status']);
    }
}
