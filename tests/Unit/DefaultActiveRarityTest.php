<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use Tests\TestCase;

class DefaultActiveRarityTest extends TestCase
{
    public function test_기병_기본_액티브는_등급별_돌진_수치를_따르고_미지정은_기존과_같다(): void
    {
        $c = ArmyBuilder::defaultActives('cavalry', 'C')[0];
        $this->assertSame([1, 100], [$c['params']['move_bonus'], $c['params']['attack_pct']]);
        $none = ArmyBuilder::defaultActives('cavalry')[0];
        $this->assertSame(2, $none['params']['move_bonus']);   // 등급 미지정 = 기존(A 수준)
        $this->assertSame(ArmyBuilder::defaultActives('sword', 'C'), ArmyBuilder::defaultActives('sword'));   // 표에 없는 병종은 불변
    }
}
