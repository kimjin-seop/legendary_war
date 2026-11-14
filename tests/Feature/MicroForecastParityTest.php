<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use Tests\TestCase;

/**
 * Engine::previewAttack(공격 예측) == 실제 apply 결과. 미시 off/on, 여러 D(atk)·HP, 임시 이동 칸 포함. DB 미사용(순수 계산).
 * 운영 노브(config game.rules.micro)로 미시 on 의 병사 단위 계단형 결과를 그대로 검증한다.
 */
class MicroForecastParityTest extends TestCase
{
    private function setup1v1(string $mode, int $atk, int $attHp, int $defHp, int $gap): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => $atk, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $e = new Engine($r, ['micro_mode' => $mode, 'micro' => (array) config('game.rules.micro')]);
        $s = ArmyBuilder::initialState($r, ['width' => 6, 'height' => 1, 'tiles' => ['pppppp']], 1, 30, 'a', false, false, false, null, null, $mode);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['a9'] = ArmyBuilder::makeUnit($r, 'a9', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
        $s['units']['b1'] = ArmyBuilder::makeUnit($r, 'b1', 'b', 'troop', 'sword', null, 1, 1 + $gap, 0, 3.0);
        $s['units']['b9'] = ArmyBuilder::makeUnit($r, 'b9', 'b', 'commander', 'sword', null, 1, 5, 0, 3.0);
        $s['units']['a1']['hp'] = $attHp;
        $s['units']['b1']['hp'] = $defHp;

        return [$e, $s];
    }

    public function test_previewAttack_결과는_실제_attack_결과와_같고_원본_state는_불변이다(): void
    {
        $checked = 0;
        foreach (['off', 'on'] as $mode) {
            foreach ([20, 28, 45, 70] as $atk) {
                foreach ([[100, 100], [60, 100], [100, 40]] as [$ah, $dh]) {
                    [$e, $s] = $this->setup1v1($mode, $atk, $ah, $dh, 1);
                    $orig = $s;
                    $p = $e->previewAttack($s, 'a', 'a1', 'b1');
                    $this->assertSame($orig, $s, 'previewAttack 이 원본 state 를 바꿨다');
                    [$after] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a1', 'target_id' => 'b1']);
                    $this->assertSame($after['units']['b1']['hp'] ?? 0, $p['target_hp_after'], "$mode atk=$atk hp=$ah/$dh target");
                    $this->assertSame($after['units']['a1']['hp'] ?? 0, $p['attacker_hp_after'], "$mode atk=$atk hp=$ah/$dh attacker");
                    $this->assertSame($p['micro'], $mode === 'on');
                    $checked++;
                }
            }
        }
        $this->assertSame(24, $checked);
    }

    public function test_임시_이동_칸을_주면_move_후_attack_결과와_같다(): void
    {
        foreach (['off', 'on'] as $mode) {
            [$e, $s] = $this->setup1v1($mode, 40, 100, 100, 3);   // a1(1,0) b1(4,0): 사거리 밖 -> (3,0) 으로 이동 후 공격
            $p = $e->previewAttack($s, 'a', 'a1', 'b1', 3, 0);
            [$m] = $e->apply($s, 'a', ['type' => 'move', 'unit_id' => 'a1', 'x' => 3, 'y' => 0]);
            [$after] = $e->apply($m, 'a', ['type' => 'attack', 'unit_id' => 'a1', 'target_id' => 'b1']);
            $this->assertSame($after['units']['b1']['hp'] ?? 0, $p['target_hp_after']);
            $this->assertSame($after['units']['a1']['hp'] ?? 0, $p['attacker_hp_after']);
            $this->assertSame(1, $s['units']['a1']['x']);   // 원본 위치 불변
        }
    }
}
