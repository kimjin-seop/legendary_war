<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use App\Game\StageSim;
use PHPUnit\Framework\TestCase;

/** StageSim 옵트인 플래그(sim_push_commander / sim_death_log)의 핵심 동작. 플래그가 없으면 기존 동작(stats 키 추가 없음). */
class StageSimOptInFlagsTest extends TestCase
{
    private function world(int $aCmdHp = 100): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $e = new Engine($r, []);
        $s = ArmyBuilder::initialState($r, ['width' => 12, 'height' => 1, 'tiles' => [str_repeat('p', 12)]], 1, 30, 'a', false, false, false, null, $e->mpKnobs());
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 11, 0, 3.0);
        $s['units']['a0']['x'] = 0;
        $s['units']['a1']['x'] = 1;
        $s['units']['b0']['x'] = 11;
        $s['units']['a0']['hp'] = $aCmdHp;

        return [$e, $s];
    }

    public function test_push_commander_사거리_밖_전열이_적_지휘관_쪽으로_진격한다(): void
    {
        [$e, $s] = $this->world();
        $r = StageSim::run($e, ['sim_push_commander' => true], $s, null, 1);   // 안전 스텝 1 = 플레이어 1턴만
        $this->assertGreaterThan(1, $r['state']['units']['a1']['x']);
        $this->assertGreaterThan(0, $r['stats']['goal_moves']);
    }

    public function test_must_survive_NPC_사망_패배는_플래그가_있을_때만_사유가_구분_표기된다(): void
    {
        [$e, $s] = $this->world();
        $r = ArmyBuilder::makeUnit($e->rules(), 'a2', 'a', 'troop', 'sword', null, 1, 10, 0, 3.0);
        $s['units']['a2'] = ['x' => 10, 'hp' => 1, 'npc_ally' => true, 'must_survive' => true] + $r;
        $on = StageSim::run($e, ['sim_must_survive' => true], $s, null, 8);
        $this->assertSame('finished', $on['state']['status']);
        $this->assertSame('b', $on['state']['winner']);   // 판정은 엔진(Engine::resolveDeath)이 하므로 플래그 유무와 무관
        $this->assertStringStartsWith('must_survive:', (string) $on['stats']['rule']);
        $this->assertArrayNotHasKey('_ms', $on['stats']);
        $off = StageSim::run($e, [], $s, null, 8);
        $this->assertSame('b', $off['state']['winner']);
        $this->assertNull($off['stats']['rule']);
    }

    public function test_objective_only_호위_대상_곁에_머물고_플래그가_없으면_기존_동작(): void
    {
        [$e, $s] = $this->world();
        $r = ArmyBuilder::makeUnit($e->rules(), 'a2', 'a', 'troop', 'sword', null, 1, 2, 0, 3.0);
        $s['units']['a2'] = ['x' => 2, 'npc_ally' => true, 'must_survive' => true] + $r;
        $on = StageSim::run($e, ['sim_objective_only' => true, 'sim_push_commander' => true], $s, null, 1);
        $this->assertLessThanOrEqual(3, abs($on['state']['units']['a1']['x'] - $on['state']['units']['a2']['x']));
        $this->assertNull(StageSim::run($e, [], $s, null, 1)['stats']['rule']);   // 플래그 없이도 정상 진행(키·동작 불변)
    }

    public function test_death_log_플레이어_지휘관_사망시_가해자와_직전_이벤트가_기록되고_플래그가_없으면_키가_없다(): void
    {
        [$e, $s] = $this->world(1);
        $s['units']['a0']['x'] = 10;   // 적 지휘관 바로 옆, hp 1
        $s['units']['a1']['x'] = 9;
        $on = StageSim::run($e, ['sim_death_log' => true], $s, null, 6);
        $this->assertArrayHasKey('cmd_death', $on['stats']);
        $this->assertStringStartsWith('b0', $on['stats']['cmd_death']['killer']);
        $this->assertNotEmpty($on['stats']['cmd_death']['events']);
        $this->assertArrayNotHasKey('_ring', $on['stats']);
        $off = StageSim::run($e, [], $s, null, 6);
        $this->assertArrayNotHasKey('cmd_death', $off['stats']);
    }

    public function test_death_log_npc_옵트인이면_must_survive_NPC_사망도_추적한다(): void
    {
        [$e, $s] = $this->world();
        $s['units']['a2'] = ['npc_ally' => true, 'must_survive' => true, 'hp' => 1] + ArmyBuilder::makeUnit($e->rules(), 'a2', 'a', 'troop', 'sword', null, 1, 10, 0, 3.0);
        $s['units']['a2']['hp'] = 1;
        $s['units']['b0']['x'] = 11;
        $off = StageSim::run($e, ['sim_death_log' => true], $s, null, 3);
        $on = StageSim::run($e, ['sim_death_log' => true, 'sim_death_log_npc' => true], $s, null, 3);
        $this->assertArrayNotHasKey('cmd_death', $off['stats']);   // 기본은 NPC 미추적
        $this->assertArrayHasKey('cmd_death', $on['stats']);
        $this->assertStringStartsWith('b0', $on['stats']['cmd_death']['killer']);
    }
}
