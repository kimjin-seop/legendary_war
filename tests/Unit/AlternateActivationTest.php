<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class AlternateActivationTest extends TestCase
{
    private function rules(): RuleSet
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];

        return new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
    }

    /** @param array<string,array{0:int,1:?string}> $units id => [x, leader_id] (kind: 첫 a/b 유닛=commander, leader null=hero, 그 외 troop) */
    private function state(RuleSet $r, array $units, bool $alt = true): array
    {
        $s = ArmyBuilder::initialState($r, ['width' => 20, 'height' => 1, 'tiles' => [str_repeat('p', 20)]], 1, 30, 'a', false, true, $alt);
        $seen = [];
        foreach ($units as $id => [$x, $leader]) {
            $side = $id[0];
            $kind = $leader !== null ? 'troop' : (isset($seen[$side]) ? 'hero' : 'commander');
            $seen[$side] = true;
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, 0, 3.0);
            $s['units'][$id]['leader_id'] = $leader;
        }
        $s['init_hp'] = ['a' => 100, 'b' => 100];

        return $s;
    }

    private function code(Engine $e, array $s, string $side, array $a): string
    {
        try {
            $e->apply($s, $side, $a);
        } catch (IllegalAction $x) {
            return $x->reason;
        }

        return 'ok';
    }

    public function test_교대_활성화_흐름과_조작_거부(): void
    {
        $r = $this->rules();
        $e = new Engine($r);
        $s = $this->state($r, ['a0' => [0, null], 'a1' => [1, 'a0'], 'a2' => [5, null], 'b0' => [19, null], 'b1' => [18, 'b0'], 'b2' => [17, null]]);

        $this->assertSame('squad_locked', $this->code($e, $s, 'a', ['type' => 'move', 'unit_id' => 'a0', 'x' => 0, 'y' => 0]));   // 활성화 전 조작 거부
        $this->assertSame('invalid_action', $this->code($e, $s, 'a', ['type' => 'end_turn']));
        [$s] = $e->apply($s, 'a', ['type' => 'activate', 'squad_id' => 'a0']);
        $this->assertSame('squad_locked', $this->code($e, $s, 'a', ['type' => 'wait', 'unit_id' => 'a2']));   // 활성 부대 외 유닛
        $this->assertSame('squad_locked', $this->code($e, $s, 'a', ['type' => 'activate', 'squad_id' => 'a2']));
        [$s] = $e->apply($s, 'a', ['type' => 'move', 'unit_id' => 'a1', 'x' => 3, 'y' => 0]);   // 이동만 하고
        [$s] = $e->apply($s, 'a', ['type' => 'wait', 'unit_id' => 'a0']);
        $this->assertSame('a', $s['side']);                                                      // a1 미행동: 아직 활성
        [$s] = $e->apply($s, 'a', ['type' => 'end_activation']);                                  // 이동만 하고 종료
        $this->assertSame('b', $s['side']);
        $this->assertSame('not_your_turn', $this->code($e, $s, 'a', ['type' => 'activate', 'squad_id' => 'a2']));

        [$s] = $e->apply($s, 'b', ['type' => 'activate', 'squad_id' => 'b0']);
        [$s] = $e->apply($s, 'b', ['type' => 'end_activation']);
        $this->assertSame('a', $s['side']);
        $this->assertSame('squad_already_activated', $this->code($e, $s, 'a', ['type' => 'activate', 'squad_id' => 'a0']));
        [$s] = $e->apply($s, 'a', ['type' => 'activate', 'squad_id' => 'a2']);
        [$s] = $e->apply($s, 'a', ['type' => 'wait', 'unit_id' => 'a2']);   // 단독 부대: 전원 행동 -> 자동 완료
        $this->assertSame('b', $s['side']);
        [$s] = $e->apply($s, 'b', ['type' => 'activate', 'squad_id' => 'b2']);
        [$s, $ev] = $e->apply($s, 'b', ['type' => 'end_activation']);   // 양쪽 소진 -> 라운드 종료
        $this->assertSame(2, $s['turn']);
        $this->assertSame('a', $s['side']);
        $this->assertSame('ready', $e->altView($s)['squads'][0]['status']);
        $this->assertContains('round_end', array_column($ev, 'type'));
        $this->assertFalse($s['units']['a0']['acted']);
    }

    public function test_연속_행동_상한_2회_초과시_라운드_종료(): void
    {
        $r = $this->rules();
        $e = new Engine($r, ['alt_consecutive_cap' => 2]);
        $s = $this->state($r, ['a0' => [0, null], 'a1' => [1, null], 'a2' => [2, null], 'a3' => [3, null], 'b0' => [19, null]]);
        $seq = [['a', 'a0'], ['b', 'b0'], ['a', 'a1'], ['a', 'a2']];   // A, B, A, (B 소진) A -> A 연속 2회(a1 이후 a2)
        foreach ($seq as [$side, $sq]) {
            [$s] = $e->apply($s, $side, ['type' => 'activate', 'squad_id' => $sq]);
            [$s, $ev] = $e->apply($s, $side, ['type' => 'end_activation']);
        }
        $this->assertSame(2, $s['turn']);                                  // a3 미행동 -> 행동권 소멸, 라운드 종료
        $this->assertSame('cap', array_values(array_filter($ev, fn ($x) => $x['type'] === 'round_end'))[0]['reason']);
        $this->assertSame('ready', collect($e->altView($s)['squads'])->firstWhere('id', 'a3')['status']);   // 새 라운드는 다시 ready
        $this->assertSame(0, $s['alt']['streak']['count']);
    }

    public function test_off_전투는_교대_액션_거부_end_turn_정상(): void
    {
        $r = $this->rules();
        $e = new Engine($r);
        $s = $this->state($r, ['a0' => [0, null], 'b0' => [19, null]], false);
        $this->assertSame('invalid_action', $this->code($e, $s, 'a', ['type' => 'activate', 'squad_id' => 'a0']));
        [$s] = $e->apply($s, 'a', ['type' => 'end_turn']);
        $this->assertSame('b', $s['side']);
        $this->assertNull($e->altView($s));
    }
}
