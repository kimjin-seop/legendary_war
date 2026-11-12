<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 연출 액터/보행 cue(docs/CUTSCENE_ACTOR_WALK_20261108.md): 정규화·판정 불변·적 칸 통과 경로 거부. 핵심만. */
class CueActorWalkTest extends TestCase
{
    private function cues(): array
    {
        $on = ['battle_start' => true];

        return [
            ['on' => $on, 'do' => 'spawn_actor', 'actor' => 'r1', 'tile' => [1, 0], 'side' => 'b', 'sprite' => ['unit_type' => 'sword'], 'fx' => 'ship'],
            ['on' => $on, 'do' => 'parallel', 'cues' => [
                ['do' => 'walk', 'actor' => 'r1', 'path' => [[2, 0], [3, 0]], 'speed' => 3, 'id' => 'w1'],
                ['do' => 'say', 'actor' => 'r1', 'during' => 'w1', 'speaker' => 'actor:r1', 'text' => '가자'],
            ]],
            ['on' => $on, 'do' => 'despawn_actor', 'actor' => 'r1', 'fx' => 'ship'],
            ['on' => $on, 'do' => 'walk', 'actor' => 'r1', 'path' => [[1, 1]]],   // 대각 아님이지만 despawn 후 사용 -> 런타임 무시
            ['on' => $on, 'do' => 'walk', 'actor' => 'r1', 'path' => [[2, 0], [9, 9]], 'speed' => 99],   // speed 범위 밖 -> 버려짐
        ];
    }

    public function test_유효한_액터_cue는_정규화를_통과하고_판정_상태_units를_바꾸지_않는다(): void
    {
        $this->assertSame(1, Cues::dropped($this->cues()));
        $norm = Cues::normalize($this->cues());
        $this->assertSame(['spawn_actor', 'parallel', 'despawn_actor', 'walk'], array_column($norm, 'do'));
        $this->assertSame([], array_filter(Cues::validateActors(array_slice($norm, 0, 3))));
        $this->assertNotSame([], Cues::validateActors($norm));   // despawn 후 walk 경고

        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 100, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $b], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $s = ArmyBuilder::initialState($r, ['width' => 8, 'height' => 2, 'tiles' => ['pppppppp', 'pppppppp']], 1, 30);
        $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
        $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 7, 0, 3.0);
        $s['cues'] = $norm;
        $s['cue_done'] = [];
        $s['cue_start'] = [];
        $s['cue_fires'] = [];
        $s['turn'] = 1;
        $unitsBefore = $s['units'];
        $ev = [];
        Cues::collect(new Engine($r), $s, $ev, true);
        $this->assertSame($unitsBefore, $s['units']);
        $this->assertSame('active', $s['status'] ?? 'active');
        $cue = array_values(array_filter($ev, fn ($e) => $e['type'] === 'cue'));
        $this->assertSame(['spawn_actor', 'walk', 'say', 'despawn_actor'], array_column($cue, 'do'));
        $this->assertSame($cue[1]['group'], $cue[2]['group']);
        $this->assertSame([], $s['actors']);   // despawn 으로 정리됨
    }

    public function test_적_시작_칸을_지나는_경로는_거부하고_우회_경로는_통과한다(): void
    {
        $norm = Cues::normalize([
            ['on' => ['battle_start' => true], 'do' => 'spawn_actor', 'actor' => 'r1', 'tile' => [0, 1], 'side' => 'a', 'sprite' => ['unit_type' => 'sword']],
            ['on' => ['battle_start' => true], 'do' => 'walk', 'actor' => 'r1', 'path' => [[1, 1], [2, 1], [3, 1]]],
            ['on' => ['battle_start' => true], 'do' => 'despawn_actor', 'actor' => 'r1'],
        ]);
        $ctx = fn (array $enemy) => ['width' => 6, 'height' => 3, 'terrain' => fn ($x, $y) => 'plain', 'cost' => fn ($t, $m) => 1, 'isWater' => fn ($t) => false,
            'moveTypeOf' => fn ($k, $v) => 'foot', 'starts' => ['a' => [], 'b' => $enemy], 'passCost' => 2];
        $bad = Cues::validateWalk($norm, $ctx([[2, 1]]));
        $this->assertCount(1, $bad);
        $this->assertStringContainsString('적대 진영 시작 배치', $bad[0]);
        $this->assertSame([], Cues::validateWalk($norm, $ctx([[2, 2]])));
    }
}
