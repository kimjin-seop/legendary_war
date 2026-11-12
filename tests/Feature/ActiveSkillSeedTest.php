<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ActiveSkillSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_시드된_액티브가_영웅에_연결되고_봇_전투가_오류없이_끝난다_교대_on_off(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $data = app(GameData::class);
        $h = $data->heroes();
        $this->assertSame('cannae_encirclement', $h['hannibal']['actives'][0]['code']);
        $this->assertSame(120, $h['hannibal']['actives'][0]['power_pct']);
        $this->assertSame([], $h['zhuge_liang']['actives']);   // 공성계(DECOY)는 비활성(미구현·근거 미확인)
        $used = 0;
        foreach ([false, true] as $alt) {
            $duel = new \App\Game\Duel($data->engine(['alternate_activation' => $alt, 'squad' => true, 'active_skills' => true]), $data->map($data->defaultMapId()), 3.0, 30, config('game.bot'));
            $spec = fn ($hero) => ['hero' => $hero, 'level' => 5, 'troops' => ['sword', 'spear']];
            $r = $duel->run(11, $spec($h['hannibal']), $spec($h['alexander']));
            $this->assertGreaterThanOrEqual(1, $r["rounds"]);
            $used += $r["skill_uses"] ?? 0;
        }
        $this->assertGreaterThan(0, $used);   // 봇이 액티브를 실제로 사용
    }
}
