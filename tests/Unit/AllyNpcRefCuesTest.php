<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\Engine;
use App\Game\EventConditions;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** ally_npc:<code> 참조(아군 NPC 한정)와 set_hp cue. 핵심 동작만. */
class AllyNpcRefCuesTest extends TestCase
{
    private function setup_(array $cues): array
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $s = ArmyBuilder::initialState($r, ['width' => 8, 'height' => 1, 'tiles' => ['pppppppp']], 1, 30);
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'hero', 'sword', ['code' => 'zhang_fei', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 3.0, 'growth_atk_pct' => 3.0, 'growth_def_pct' => 3.0], 1, 1, 0, 3.0);   // 플레이어 소유 동일 코드
        $s['units']['n0'] = ArmyBuilder::makeUnit($r, 'n0', 'a', 'hero', 'sword', ['code' => 'zhang_fei', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 3.0, 'growth_atk_pct' => 3.0, 'growth_def_pct' => 3.0], 1, 2, 0, 3.0);
        $s['units']['n0']['npc_ally'] = true;
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 7, 0, 3.0);
        $s['cues'] = Cues::normalize($cues);
        $s['cue_done'] = [];
        $s['cue_start'] = [];
        $s['cue_fires'] = [];
        $s['turn'] = 1;

        return [new Engine($r), $s];
    }

    public function test_ally_npc_참조는_플레이어_동일_코드_영웅을_건드리지_않고_퇴각과_사망을_구분한다(): void
    {
        foreach (['retreat' => 'retreated', 'death' => 'defeated'] as $reason => $key) {
            [$e, $s] = $this->setup_([['on' => ['battle_start' => true], 'do' => 'retreat', 'reason' => $reason, 'unit' => 'ally_npc:npc_zhang_fei']]);   // 별칭: n0 의 hero=zhang_fei
            $ev = [];
            Cues::collect($e, $s, $ev, true);
            $this->assertArrayNotHasKey('n0', $s['units']);
            $this->assertArrayHasKey('a1', $s['units']);   // 플레이어 영웅 유지
            $this->assertTrue(EventConditions::evaluate(EventConditions::normalize(['type' => $key, 'unit' => 'ally_npc:zhang_fei']), $s));
            $this->assertFalse(EventConditions::evaluate(EventConditions::normalize(['type' => $key === 'defeated' ? 'retreated' : 'defeated', 'unit' => 'ally_npc:zhang_fei']), $s));
        }
        // 플레이어 영웅만 있고 NPC 가 없으면(소환 생략) 대상 없음 -> 무동작
        [$e, $s] = $this->setup_([['on' => ['battle_start' => true], 'do' => 'retreat', 'unit' => 'ally_npc:zhang_fei']]);
        unset($s['units']['n0']);
        $ev = [];
        Cues::collect($e, $s, $ev, true);
        $this->assertArrayHasKey('a1', $s['units']);
        $this->assertFalse(EventConditions::evaluate(EventConditions::normalize(['type' => 'retreated', 'unit' => 'ally_npc:zhang_fei']), $s));
    }

    public function test_set_hp는_최소_1을_유지하고_낮추기만_한다(): void
    {
        [$e, $s] = $this->setup_([
            ['on' => ['battle_start' => true], 'do' => 'set_hp', 'unit' => 'ally_npc:zhang_fei', 'pct' => 1],
            ['on' => ['battle_start' => true], 'do' => 'set_hp', 'unit' => 'a1', 'pct' => 100],
        ]);
        $max = $s['units']['n0']['max_hp'];
        $ev = [];
        Cues::collect($e, $s, $ev, true);
        $this->assertGreaterThanOrEqual(1, $s['units']['n0']['hp']);
        $this->assertLessThan($max, $s['units']['n0']['hp']);
        $this->assertSame($s['units']['a1']['max_hp'], $s['units']['a1']['hp']);   // 100% 는 변화 없음
        $this->assertSame([], Cues::normalize([['on' => ['turn' => 1], 'do' => 'set_hp', 'unit' => 'n0', 'pct' => 0]]));
    }
}
