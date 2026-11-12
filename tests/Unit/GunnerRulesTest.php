<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 총병(gunner): 사거리 3 고정 + 사선(중간 칸 blocks_line_of_fire) + 이동 후 사격 불가. 옵션 off/타 병종은 무영향. */
class GunnerRulesTest extends TestCase
{
    private function rules(): RuleSet
    {
        $b = ['range_min' => 1, 'range_max' => 1, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 300, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $mod = ['foot' => ['cost' => 1, 'def_pct' => 0]];

        return new RuleSet(
            ['sword' => $b, 'archer' => ['range_min' => 2, 'range_max' => 3] + $b, 'gunner' => ['range_min' => 3, 'range_max' => 3] + $b],
            [],
            ['plain' => $mod, 'forest' => $mod],
            ['p' => 'plain', 'f' => 'forest'],
            ['forest' => ['blocks_line_of_fire' => 1]],
        );
    }

    /** $tiles 한 줄 이상의 맵에 총병 a1(0,0)과 적 b1(bx,by) 배치 */
    private function place(array $tiles, int $bx, int $by, string $type = 'gunner', array $opts = []): array
    {
        $r = $this->rules();
        $s = ArmyBuilder::initialState($r, ['width' => strlen($tiles[0]), 'height' => count($tiles), 'tiles' => $tiles], 1, 30);
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'commander', $type, null, 1, 0, 0, 3.0);
        $s['units']['b1'] = ArmyBuilder::makeUnit($r, 'b1', 'b', 'commander', 'sword', null, 1, $bx, $by, 3.0);

        return [new Engine($r, $opts), $s];
    }

    public function test_사거리는_3만_가능하고_숲_중간_칸이_사선을_막는다(): void
    {
        foreach ([1, 2, 3] as $d) {
            [$e, $s] = $this->place(['pppp'], $d, 0);
            $this->assertSame($d === 3 ? ['b1'] : [], $e->targetsFrom($s, $s['units']['a1'], 0, 0), "거리 {$d}");
        }
        [$e, $s] = $this->place(['pfpp'], 3, 0);   // 직선 중간 칸(1,0)=숲
        $this->assertSame([], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
        [$e, $s] = $this->place(['pppp', 'pfpp'], 2, 1);   // 대각 (2,1): 선분이 (1,0)·(1,1) 통과, (1,1)=숲
        $this->assertSame([], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
        [$e, $s] = $this->place(['pppp', 'fpfp'], 2, 1);   // 숲이 선분 밖((0,1)·(2,1)=대상 칸)이면 사격 가능, 대상 칸 숲도 무관
        $this->assertSame(['b1'], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
        [$e, $s] = $this->place(['pfpp'], 3, 0, 'archer');   // 궁병(타 병종)은 사선 무관
        $this->assertSame(['b1'], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
        [$e, $s] = $this->place(['pfpp'], 3, 0, 'gunner', ['gunner_rules' => false]);   // 옵션 off
        $this->assertSame(['b1'], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
    }

    public function test_이동한_턴과_다른_칸에서는_사격할_수_없다(): void
    {
        [$e, $s] = $this->place(['ppppp'], 3, 0);
        $this->assertSame(['b1'], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
        $this->assertSame([], $e->targetsFrom($s, $s['units']['a1'], 1, 0));   // 가정 위치(이동 후 사격) 없음
        $s['units']['a1']['moved'] = true;
        $this->assertSame([], $e->targetsFrom($s, $s['units']['a1'], 0, 0));
        $this->expectException(\App\Game\IllegalAction::class);
        $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a1', 'target_id' => 'b1']);
    }

    public function test_봇_총병은_붙은_적에게서_사거리_3으로_물러난다(): void
    {
        [$e, $s] = $this->place(['pppppp'], 1, 0);
        $s['units']['a1']['x'] = 2;
        $s['units']['b1']['x'] = 3;   // 인접
        $s['units']['a1']['kind'] = 'troop';
        $acts = (new HeuristicBot($e))->plan($s, 'a');
        $mv = array_values(array_filter($acts['actions'], fn ($a) => $a['type'] === 'move' && $a['unit_id'] === 'a1'));
        $this->assertNotEmpty($mv, json_encode($acts));
        $this->assertSame(0, $mv[0]['x']);   // 거리 3 칸으로 후퇴
    }
}
