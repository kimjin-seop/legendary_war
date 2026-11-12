<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 영웅 상세 스킬 표: 모든 액티브 템플릿에 효과 요약·쿨다운·횟수가 채워진다(본진 돌파 '-' 회귀). */
class ActiveSkillDisplayTest extends TestCase
{
    use RefreshDatabase;

    public function test_연결된_모든_액티브_스킬은_효과_요약과_쿨다운_횟수가_채워진다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-active-skills')->assertSuccessful();
        $g = app(GameData::class);
        $n = 0;
        foreach (DB::table('hero_skills')->join('heroes', 'heroes.id', '=', 'hero_skills.hero_id')->distinct()->pluck('heroes.id') as $hid) {
            foreach ($g->heroSkillList((int) $hid) as $s) {
                if ($s['type'] !== 'active') {
                    continue;
                }
                $n++;
                $this->assertNotSame('', $s['effect'], "{$s['code']} 효과 요약 비어 있음");
                $this->assertNotNull($s['cooldown'], "{$s['code']} cooldown");
                $this->assertNotNull($s['uses'], "{$s['code']} uses");
            }
        }
        $this->assertGreaterThan(0, $n);
        $this->assertSame('대상 1명을 공격력 125% 위력으로 강타', $g->displayEffect('active', 'T_ACTIVE_STRIKE', ['power_pct' => 125, 'cooldown' => 3, 'uses' => 2]));
    }
}
