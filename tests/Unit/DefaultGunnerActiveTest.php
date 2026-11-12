<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use Tests\TestCase;

/** 총병(gunner) 병종 기본 액티브(철포 일제 사격)가 정규화되어 액티브가 없는 영웅 행에 주입된다. */
class DefaultGunnerActiveTest extends TestCase
{
    public function test_총병_기본_액티브가_주입된다(): void
    {
        $a = ArmyBuilder::defaultActives('gunner')[0] ?? null;
        $this->assertSame('default_gunner', $a['code']);
        $this->assertSame('T_ACTIVE_STRIKE', $a['template']);
        $this->assertSame([120, 3, 2], [$a['power_pct'], $a['cooldown'], $a['uses']]);
        $this->assertSame('default_gunner', ArmyBuilder::withDefaultActives(['code' => 'h'], 'gunner', 'a')['actives'][0]['code']);
    }
}
