<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\Engine;
use App\Game\RouteAi;
use App\Game\RuleSet;
use App\Game\StageRules;
use PHPUnit\Framework\TestCase;

/** 승패 규칙(StageRules: win_mode all/only, lose_conditions)과 경로 이동 AI(RouteAi). docs/CUTSCENE_SPEC.md 10~11절 */
class StageRulesTest extends TestCase
{
    private function world(array $units, ?array $objective = null): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 10, 'height' => 1, 'tiles' => ['pppppppppp']], 1, 30);
        foreach ($units as [$id, $side, $kind, $x]) {
            $s['units'][$id] = ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, 0, 3.0);
        }
        $objective && $s['objective'] = $objective;

        return [new Engine($r), $s];
    }

    public function test_win_mode_all은_도달과_처치를_모두_채워야_승리한다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['a1', 'a', 'troop', 3], ['b0', 'b', 'commander', 6]], ['type' => 'capture', 'points' => [[5, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit']);
        StageRules::initialize($s, ['win_mode' => 'all', 'win_conditions' => [['label' => '처치', 'when' => ['type' => 'defeated', 'unit' => 'enemy_commander']]]]);
        $s['units']['b0']['hp'] = 1;
        $ev = [];
        $this->assertTrue($e->scriptMove($s, $ev, 'a1', 5, 0));   // 도달만으로는 승리하지 않는다
        $this->assertSame('active', $s['status']);
        [$s] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a1', 'target_id' => 'b0']);   // 처치까지 채우면 승리
        $this->assertSame(['finished', 'a'], [$s['status'], $s['winner']]);
        // 기존 스테이지(규칙 없음)는 도달만으로 승리
        [$e2, $s2] = $this->world([['a0', 'a', 'commander', 0], ['a1', 'a', 'troop', 3], ['b0', 'b', 'commander', 6]], ['type' => 'capture', 'points' => [[5, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit']);
        $e2->scriptMove($s2, $ev, 'a1', 5, 0);
        $this->assertSame('finished', $s2['status']);
    }

    public function test_lose_conditions_defeated_hero는_고정_슬롯_영웅_must_survive_대체로_사망_즉시_패배시킨다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['a1', 'a', 'hero', 3], ['b0', 'b', 'commander', 9], ['b1', 'b', 'troop', 4]]);
        $s['units']['a1']['hero'] = 'liu_bei';
        StageRules::initialize($s, ['lose_conditions' => [['id' => 'liu_bei_dead', 'when' => ['type' => 'defeated', 'unit' => 'hero:liu_bei']]]]);
        $ev = [];
        StageRules::check($e, $s, $ev);
        $this->assertSame('active', $s['status']);
        $s['units']['a1']['hp'] = 1;
        $s['side'] = 'b';
        [$s, $ev] = $e->apply($s, 'b', ['type' => 'attack', 'unit_id' => 'b1', 'target_id' => 'a1']);
        StageRules::check($e, $s, $ev);
        $this->assertSame(['finished', 'b'], [$s['status'], $s['winner']]);
    }

    public function test_survive_turns_기본목표와_latch_처치_조합은_순서와_무관하게_둘_다_채워야_승리한다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['b0', 'b', 'commander', 9], ['b1', 'b', 'troop', 8]], ['type' => 'survive_turns', 'turns' => 3]);
        StageRules::initialize($s, ['win_mode' => 'all', 'win_conditions' => [['label' => '처치', 'latch' => true, 'when' => ['type' => 'defeated', 'unit' => 'b1']]]]);
        $ev = [];
        unset($s['units']['b1']);
        $s['defeated']['b1'] = ['side' => 'b', 'kind' => 'troop', 'hero' => null];   // 먼저 처치(latch)
        StageRules::check($e, $s, $ev);
        $this->assertSame('active', $s['status']);   // 기본 목표(3턴 생존) 전에는 승리 아님
        $s['turn'] = 3;
        $this->assertTrue(StageRules::gate($s));   // 생존 달성 시점에 조건이 이미 참이면 승리
    }

    public function test_win_mode_only는_기본_목표를_무시하고_lose_conditions는_즉시_패배시킨다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['a1', 'a', 'troop', 3], ['n0', 'a', 'troop', 1], ['b0', 'b', 'commander', 9]], ['type' => 'capture', 'points' => [[5, 0]], 'mode' => 'any', 'hold_turns' => 0, 'by' => 'any_unit']);
        StageRules::initialize($s, [
            'win_mode' => 'only', 'win_conditions' => [['when' => ['type' => 'in_zone', 'unit' => 'n0', 'tiles' => [[7, 0]]]]],
            'lose_conditions' => [['id' => 'door', 'when' => ['type' => 'in_zone', 'side' => 'b', 'tiles' => [[8, 0]]]]],
        ]);
        $ev = [];
        $e->scriptMove($s, $ev, 'a1', 5, 0);   // 기본 목표(주인공측 도달)는 승리가 아님
        StageRules::check($e, $s, $ev);
        $this->assertSame('active', $s['status']);
        $e->scriptMove($s, $ev, 'n0', 7, 0);
        StageRules::check($e, $s, $ev);
        $this->assertSame(['finished', 'a'], [$s['status'], $s['winner']]);

        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['b0', 'b', 'commander', 9]]);
        StageRules::initialize($s, ['lose_conditions' => [['id' => 'door', 'when' => ['type' => 'in_zone', 'side' => 'b', 'tiles' => [[8, 0]]]]]]);
        $e->scriptMove($s, $ev, 'b0', 8, 0);
        StageRules::check($e, $s, $ev);
        $this->assertSame(['finished', 'b'], [$s['status'], $s['winner']]);
        $this->assertSame('door', end($ev)['rule']);
    }

    public function test_RouteAi는_이동_상한_안에서_웨이포인트로_한_칸씩_다가가고_도착하면_머문다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['n0', 'a', 'troop', 2], ['b0', 'b', 'commander', 9]]);
        $s['units']['n0']['route'] = RouteAi::normalize(['waypoints' => [[5, 0]], 'move_cap' => 2]) + ['i' => 0];
        $a = RouteAi::step($e, $s, 'n0');
        $this->assertSame(['move', 4, 0], [$a['type'], $a['x'], $a['y']]);   // 이동력 3이어도 move_cap 2
        $s['units']['n0']['x'] = 5;
        $this->assertNull(RouteAi::step($e, $s, 'n0'));
        $this->assertNull(RouteAi::normalize(['waypoints' => []]));
    }

    public function test_적_부대_route는_HeuristicBot이_RouteAi로만_이동시키고_route_없는_유닛은_현행이다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['b0', 'b', 'commander', 9], ['b1', 'b', 'troop', 8]]);
        $s['units']['b0']['route'] = RouteAi::normalize(['waypoints' => [[9, 0]], 'from_turn' => 1]) + ['i' => 0];   // 이미 도착 지점: 제자리
        $s['units']['b1']['route'] = RouteAi::normalize(['waypoints' => [[5, 0]], 'move_cap' => 2]) + ['i' => 0];
        $s['side'] = 'b';
        $actions = (new \App\Game\HeuristicBot($e))->plan($s, 'b')['actions'];
        $moves = array_values(array_filter($actions, fn ($a) => ($a['unit_id'] ?? '') === 'b1'));
        $this->assertCount(1, $moves);
        $this->assertSame(['move', 6, 0], [$moves[0]['type'], $moves[0]['x'], $moves[0]['y']]);   // move_cap 2: 8 -> 6
        $this->assertSame([], array_values(array_filter($actions, fn ($a) => ($a['unit_id'] ?? '') === 'b0')));
    }

    public function test_adapter는_부대_route를_통과시키고_무효면_중단한다(): void
    {
        $item = ['code' => 'x', 'enemy_squads' => [['id' => 'm', 'role' => 'main', 'leader' => ['troop_type' => 'sword'], 'soldiers' => 0, 'cells' => [], 'route' => ['waypoints' => [[3, 4]], 'from_turn' => 2]]]];
        $this->assertSame([[3, 4]], \App\Game\EnemyV3Adapter::convert($item)['enemy_squad']['route']['waypoints']);
        $item['enemy_squads'][0]['route'] = ['waypoints' => []];
        $this->expectException(\InvalidArgumentException::class);
        \App\Game\EnemyV3Adapter::convert($item);
    }

    public function test_terrain_change의_water_rise_fx는_이벤트에_실리고_판정은_지형만_바꾼다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 30, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]], 'shallows' => ['foot' => ['cost' => 2, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 4, 'height' => 1, 'tiles' => ['pppp']], 1, 30);
        Cues::initialize($s, [['on' => ['battle_start' => true], 'do' => 'terrain_change', 'tiles' => [[1, 0], [2, 0]], 'to' => 'shallows', 'fx' => 'water_rise', 'ms' => 99999, 'dir' => 'up']]);
        $ev = [];
        Cues::collect(new Engine($r), $s, $ev, true);
        $c = $ev[0];
        $this->assertSame(['water_rise', 3000, 'up', 'shallows'], [$c['fx'], $c['ms'], $c['dir'], $s['tiles'][0][1]]);
    }

    public function test_win_mode가_있는데_유효한_win_conditions가_없으면_시드_검증이_오류로_센다(): void
    {
        $this->assertSame(1, StageRules::dropped(['win_mode' => 'only', 'win_conditions' => []]));
        $this->assertSame(0, StageRules::dropped(['win_mode' => 'only', 'win_conditions' => [['when' => ['type' => 'flag', 'key' => 'x']]]]));
        $this->assertSame(['hero:a'], StageRules::references(['win_conditions' => [['when' => ['type' => 'in_zone', 'unit' => 'hero:a', 'tiles' => [[1, 1]]]]]])['units']);
    }

    public function test_null_키는_삭제로_보고_무효_항목으로_세지_않는다(): void
    {
        $this->assertSame(0, StageRules::dropped(['win_mode' => null, 'win_conditions' => null, 'lose_conditions' => null]));
        $this->assertSame(1, StageRules::dropped(['win_mode' => null, 'lose_conditions' => [['when' => ['type' => 'bogus']]]]));
    }

    public function test_view는_패배_조건만_있어도_stage_rules를_내고_규칙이_없으면_내지_않는다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['b0', 'b', 'commander', 9]]);
        $this->assertSame([], StageRules::view($s));
        StageRules::initialize($s, ['lose_conditions' => [['label' => '문', 'when' => ['type' => 'flag', 'key' => 'x']]]]);
        $this->assertSame(['default', ['문']], [StageRules::view($s)['stage_rules']['mode'], StageRules::view($s)['stage_rules']['lose']]);
    }

    public function test_RouteAi는_협로가_막혀_우회_불가여도_가까운_칸까지_접근한다(): void
    {
        [$e, $s] = $this->world([['a0', 'a', 'commander', 0], ['n0', 'a', 'troop', 1], ['b0', 'b', 'commander', 4]]);
        $s['units']['n0']['route'] = RouteAi::normalize(['waypoints' => [[7, 0]]]) + ['i' => 0];
        $a = RouteAi::step($e, $s, 'n0');
        $this->assertSame([3, 0], [$a['x'], $a['y']]);   // 4번 칸을 적이 점유 -> 막기 직전 칸까지
    }
}
