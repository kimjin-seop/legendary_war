<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

/** 병종 v2 2단계: E1 마법사 방어 일부 무시, E2 암살자 측·후방 배율. 옵션 off면 기존 산식과 동일. */
class TroopV2EngineRulesTest extends TestCase
{
    private function dmg(string $attType, array $opts, string $facing = 'left'): int
    {
        $base = ['range_min' => 1, 'range_max' => 3, 'heal' => 0, 'cost' => 1, 'name' => 'x', 'hp' => 300, 'atk' => 28, 'def' => 10, 'move' => 4, 'move_type' => 'foot'];
        $r = new RuleSet(['sword' => $base, 'mage' => $base, 'assassin' => $base], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $s = ArmyBuilder::initialState($r, ['width' => 3, 'height' => 1, 'tiles' => ['ppp']], 1, 30);
        $s['facing'] = true;
        $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'commander', $attType, null, 1, 0, 0, 3.0);
        $s['units']['b1'] = ArmyBuilder::makeUnit($r, 'b1', 'b', 'commander', 'sword', null, 1, 1, 0, 3.0);
        $s['units']['b1']['facing'] = $facing;

        return (new Engine($r, $opts))->damageInfo($s, $s['units']['a1'], 0, 0, $s['units']['b1'])['dmg'];
    }

    public function test_마법사는_옵션_on일_때만_기본_방어_30퍼센트를_무시한다(): void
    {
        $this->assertSame(18, $this->dmg('mage', []));                                      // off: 28 - 10
        $this->assertSame(21, $this->dmg('mage', ['mage_def_ignore_pct' => 30]));           // 28 - 10 x 0.7
        $this->assertSame(18, $this->dmg('sword', ['mage_def_ignore_pct' => 30]));          // 다른 병종은 무영향
    }

    public function test_암살자는_측후방_배율이_전용값이고_정면은_그대로(): void
    {
        $o = ['assassin_facing_mult' => ['side' => 1.25, 'back' => 1.5]];
        $this->assertSame(26, $this->dmg('sword', $o + ['facing_mult' => ['side' => 1.15, 'back' => 1.3]], 'right'));   // 후방 x1.3: 28 x 1.3 - 10 = 26
        $this->assertSame(32, $this->dmg('assassin', $o, 'right'));                                  // 후방 x1.5: 28 x 1.5 - 10 = 32
        $this->assertSame(18, $this->dmg('assassin', $o));                          // 정면(대상이 공격자를 봄)은 변화 없음
    }
}
