<?php

namespace Tests\Unit;

use App\Game\LevelRewards;
use App\Game\MpRules;
use PHPUnit\Framework\TestCase;

/** 레벨 마일스톤: 넘은 구간만 rewards_unlocked, MP 계단 보너스는 레벨당 +2에 가산. */
class LevelRewardsTest extends TestCase
{
    public function test_마일스톤을_넘은_구간만_해금되고_다음_보상이_계산된다(): void
    {
        $this->assertSame([10, 20], array_column(LevelRewards::unlocked(9, 20), 'level'));
        $this->assertSame([], LevelRewards::unlocked(10, 19));
        $this->assertSame(20, LevelRewards::next(10)['level']);
        $this->assertNull(LevelRewards::next(30));
        $this->assertSame([true, false, false], array_column(LevelRewards::view(15), 'reached'));
    }

    public function test_MP_계단_보너스가_최대_MP에_가산된다(): void
    {
        $this->assertSame(60 + 2 * 8, MpRules::maxMp('B', 9, 'sword'));                  // Lv10 미만은 기존과 동일
        $this->assertSame(60 + 2 * 9 + 10, MpRules::maxMp('B', 10, 'sword'));            // Lv10 +10
        $this->assertSame(60 + 2 * 29 + 20, MpRules::maxMp('B', 30, 'sword'));           // Lv30 누적 +20
    }

    public function test_마일스톤_부대_라벨이_troop_slots_설정과_일치한다(): void
    {
        $cfg = require dirname(__DIR__, 2).'/config/game.php';
        $labels = array_column($cfg['level_rewards']['milestones'], 'label', 'level');
        foreach ($cfg['troop_slots'] as [$lv, $n]) {
            if ($lv > 1) {
                $this->assertStringContainsString("부대 {$n}개", $labels[$lv] ?? '', "Lv{$lv} 라벨");
            }
        }
    }
}
