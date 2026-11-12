<?php

namespace Tests\Feature;

use App\Game\Duel;
use App\Services\GameData;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class SimulatorFixedTroopsTest extends TestCase
{
    use RefreshDatabase;

    public function test_Duel_fixedTroops는_고정_병종x슬롯수이고_시뮬레이터_두_모드가_오류없이_돈다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $h = app(GameData::class)->heroes()['han_xin'];   // 고정 병종 cavalry
        $cfg = app(ProgressionService::class)->squadCfg();
        $this->assertSame(['cavalry', 'cavalry'], Duel::fixedTroops($h, 1, $cfg));
        $this->assertSame(['cavalry', 'cavalry', 'cavalry'], Duel::fixedTroops($h, 10, $cfg));
        $this->assertNull(Duel::fixedTroops(['troop_type' => null], 1, $cfg));
        foreach (['fixed', 'preset'] as $mode) {   // 기본=fixed, preset=구 방식
            $this->artisan('game:simulate', ['--sections' => 'mirror', '--mirror' => 2, '--troops-mode' => $mode])->assertSuccessful();
        }
    }
}
