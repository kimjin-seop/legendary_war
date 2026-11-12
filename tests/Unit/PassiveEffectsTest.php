<?php

namespace Tests\Unit;

use App\Game\PassiveEffects;
use PHPUnit\Framework\TestCase;

class PassiveEffectsTest extends TestCase
{
    public function test_구형식_단일_params는_이전과_같은_결과(): void
    {
        $r = PassiveEffects::fold(['a' => ['def_pct' => 10, 'power_pct' => 120]]);   // 엔진 미해석 키는 버림
        $this->assertSame(['def_pct' => 10], $r['passive']);
        $this->assertSame([], $r['ignored']);
        $this->assertNull(PassiveEffects::fold(['x' => ['power_pct' => 130, 'cooldown' => 3]])['passive']);   // 액티브성 params -> null
        $this->assertNull(PassiveEffects::fold([])['passive']);
    }

    public function test_복수_스킬_키별_합산과_when_조건은_보존만_하고_무시한다(): void
    {
        $r = PassiveEffects::fold([
            'a' => ['atk_pct' => 8],
            'b' => ['effects' => [['atk_pct' => 3, 'def_pct' => 5], ['atk_pct' => 9, 'when' => ['weather' => 'rain']]]],
        ]);
        $this->assertSame(['atk_pct' => 11, 'def_pct' => 5], $r['passive']);   // 조건부 +9는 합산 제외
        $this->assertCount(3, $r['effects']);                                   // 조건 효과도 보존
        $this->assertSame([['skill' => 'b', 'when' => ['weather' => 'rain']]], $r['ignored']);
    }
}
