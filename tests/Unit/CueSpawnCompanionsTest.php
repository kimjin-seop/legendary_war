<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 큐로 소환된 영웅의 동반 일반병: 진영별 목표(a=ally, b=enemy, 제외 영웅 0, 설정 없으면 무동작), 영웅 인접 배치, leader_id 연결. */
class CueSpawnCompanionsTest extends TestCase
{
    private function run_(string $side, ?array $companions, string $heroCode = 'npc_x'): array
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $e = new Engine($r);
        $s = ArmyBuilder::initialState($r, ['width' => 9, 'height' => 5, 'tiles' => array_fill(0, 5, 'ppppppppp')], 1, 30);
        $s['squad'] = true;
        $s['companions'] = $companions;
        $hero = ['code' => $heroCode, 'name_ko' => $heroCode, 'unit_type' => 'sword', 'troop_type' => 'sword', 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => 0, 'growth_atk_pct' => 0, 'growth_def_pct' => 0];
        $s['units']['x1'] = ArmyBuilder::makeUnit($r, 'x1', $side, 'hero', 'sword', $hero, 1, 4, 2, 3.0);
        $ev = [];
        $m = new \ReflectionMethod(Cues::class, 'spawnCompanions');
        $m->invokeArgs(null, [$e, &$s, &$ev, 'x1', $hero, ['ready' => true, 'id' => 'c1']]);

        return $s['units'];
    }

    public function test_큐_영웅은_진영별_목표_수만큼_인접_칸에_동반병을_거느린다(): void
    {
        $cs = ['max' => 4, 'enemy' => 2, 'ally' => 3, 'ally_by_hero' => ['npc_x' => 1], 'ally_exclude' => ['npc_cart_1']];
        $u = $this->run_('b', $cs);
        $troops = array_filter($u, fn ($x) => $x['kind'] === 'troop');
        $this->assertCount(2, $troops);   // 적: enemy 목표 2
        foreach ($troops as $t) {
            $this->assertSame('b', $t['side']);
            $this->assertSame('x1', $t['leader_id']);
            $this->assertSame(1, Engine::dist($t['x'], $t['y'], 4, 2));   // 영웅 인접 칸 우선
        }
        $this->assertCount(1, array_filter($this->run_('a', $cs), fn ($x) => $x['kind'] === 'troop'));   // 아군: ally_by_hero 가 ally 보다 우선
        $this->assertCount(0, array_filter($this->run_('a', $cs, 'npc_cart_1'), fn ($x) => $x['kind'] === 'troop'));   // 비전투원 제외
        $this->assertCount(0, array_filter($this->run_('b', null), fn ($x) => $x['kind'] === 'troop'));   // 설정 없음(시뮬레이터 등) = 무동작
    }
}
