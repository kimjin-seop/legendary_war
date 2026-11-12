<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\RuleSet;
use App\Game\StageRules;
use PHPUnit\Framework\TestCase;

/** 봇 지휘관 보호(commander_guard): 위협 범위 안이면 후퇴, 끄면(옵션/스테이지 rules) 기존 동작, 호위는 접근로를 막음. */
class BotCommanderGuardTest extends TestCase
{
    private function state(): array
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 60, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]]);
        $s = ArmyBuilder::initialState($r, ['width' => 16, 'height' => 3, 'tiles' => array_fill(0, 3, str_repeat('p', 16))], 1, 30, 'b', false, false);
        $mk = fn (string $id, string $side, string $kind, int $x) => ArmyBuilder::makeUnit($r, $id, $side, $kind, 'sword', null, 1, $x, 1, 3.0);
        // b(봇): 지휘관 b0 x=8, 병사 b1 x=7. a(상대): a1 x=12 가 이동3+사거리1=4 로 b0 에 닿는다
        foreach ([$mk('b0', 'b', 'commander', 8), $mk('b1', 'b', 'troop', 7), $mk('a0', 'a', 'commander', 15), $mk('a1', 'a', 'troop', 12)] as $u) {
            $s['units'][$u['id']] = $u;
        }

        return [new Engine($r), $s];
    }

    private function cmdX(Engine $e, array $s, array $opts): int
    {
        $bot = new HeuristicBot($e, ['commander_mode' => 'guard', 'follow_front' => true] + $opts);
        $x = $s['units']['b0']['x'];
        foreach ($bot->plan($s, 'b')['actions'] as $a) {
            if ($a['type'] === 'move' && $a['unit_id'] === 'b0') {
                $x = $a['x'];
            }
        }

        return $x;
    }

    public function test_위협_범위_안_지휘관은_후퇴하고_옵션이나_스테이지_rules로_끄면_기존_동작(): void
    {
        [$e, $s] = $this->state();
        $this->assertLessThan(8, $this->cmdX($e, $s, ['commander_guard' => true, 'cg_pct' => 100, 'commander_guard_risk' => 0.35]));   // 적 쪽(x 증가)이 아니라 후방으로
        $off = $this->cmdX($e, $s, ["commander_guard" => false]);   // 끈 상태(기존 AI) 기준값
        $s2 = $s;
        StageRules::initialize($s2, ['commander_guard' => false]);
        $this->assertTrue($s2['commander_guard_off']);
        $this->assertSame($off, $this->cmdX($e, $s2, ['commander_guard' => true, 'cg_pct' => 100, 'commander_guard_risk' => 0.35]));    // 스테이지 rules 로 끔
        $s3 = $s;
        StageRules::initialize($s3, []);
        $this->assertArrayNotHasKey('commander_guard_off', $s3);
    }

    public function test_호위_병사는_지휘관과_접근하는_적_사이로_이동(): void
    {
        [$e, $s] = $this->state();
        $s['units']['b1']['x'] = 4;
        $s['units']['b0']['hp'] = 50;   // 호위는 지휘관이 다친(HP 70% 미만) 뒤에만   // 지휘관 뒤쪽에서 출발
        $bot = new HeuristicBot($e, ['commander_mode' => 'guard', 'commander_guard' => true]);
        $mx = null;
        foreach ($bot->plan($s, 'b')['actions'] as $a) {
            if ($a['type'] === 'move' && $a['unit_id'] === 'b1') {
                $mx = $a['x'];
            }
        }
        $this->assertNotNull($mx);
        $this->assertGreaterThan(4, $mx);   // 적 쪽(지휘관 앞 2칸 지점=x 10)으로 접근로 차단 이동
    }
}
