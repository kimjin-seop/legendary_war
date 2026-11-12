<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 스킬 등급 재분배 시드(game:seed-skill-grades): dry-run 무변경, 적용 후 감사 통과(S5/A4/B3/C2), 멱등, game:seed 재실행이 되돌리지 않음. */
class SkillGradeSeedTest extends TestCase
{
    use RefreshDatabase;

    private function codes(string $hero, string $type): array
    {
        return DB::table('hero_skills')->join('skills', 'skills.id', '=', 'hero_skills.skill_id')->join('heroes', 'heroes.id', '=', 'hero_skills.hero_id')
            ->where('heroes.code', $hero)->where('skills.type', $type)->orderBy('hero_skills.sort_order')->pluck('skills.code')->all();
    }

    public function test_적용_감사_멱등_재시드_보존(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();   // P1 스킬 조각에 주인공 10행 포함 -> heroes 선행 필요
        $this->artisan('game:seed-active-skills')->assertSuccessful();
        $before = [DB::table('skills')->count(), DB::table('hero_skills')->count()];
        $this->artisan('game:seed-skill-grades', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame($before, [DB::table('skills')->count(), DB::table('hero_skills')->count()]);   // dry-run 은 쓰지 않는다

        $this->artisan('game:seed-skill-grades')->assertSuccessful();
        $this->artisan('game:audit-skills')->assertSuccessful();                                    // 등급별 개수 위반 0건
        $this->assertSame(['ys_form_strong', 'ys_last_strong', 'rd_yi_sun_sin_p1'], $this->codes('yi_sun_sin', 'passive'));   // S급 3명: 2단계 S 패시브/액티브로 교체
        $this->assertSame(['rd_yi_sun_sin_a1', 'rd_yi_sun_sin_a3'], $this->codes('yi_sun_sin', 'active'));
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'rd_yi_sun_sin_a3')->value('enabled'));
        $this->assertNotNull(DB::table('skills')->where('code', 'rd_hannibal_p2')->value('flavor'));   // 송서사 이름·flavor 병합

        $data = new \App\Services\GameData;
        $yi = collect($data->heroSkillList((int) $data->heroes()['yi_sun_sin']['id']))->keyBy('code');
        $this->assertStringContainsString('해당 지형 이동 비용 -1(최소 1)', $yi['rd_yi_sun_sin_p1']['effect']);   // 영웅 상세 API: 지형 숙련 이동비용 문구
        $this->assertSame('학익의 반격태세', $yi['rd_yi_sun_sin_a3']['name']);
        $this->assertSame('불길이 번져 주변까지 흔든다.', DB::table('skills')->where('code', 'zy_fire_aoe')->value('flavor'));   // 송서사 검수 flavor 공개
        $this->assertSame(0, (int) DB::table('skills')->where('code', 'gb_last_mid')->value('needs_verify'));

        $links = DB::table('hero_skills')->count();
        $this->artisan('game:seed-skill-grades')->assertSuccessful();
        $this->assertSame($links, DB::table('hero_skills')->count());                               // 멱등
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();   // 재시드가 옛 배정안으로 되돌리지 않는다(주인공 10행은 P1 조각 포함 -> heroes 선행 필요)
        $this->assertSame($links, DB::table('hero_skills')->count());
        $this->assertSame(['rd_yi_sun_sin_a1', 'rd_yi_sun_sin_a3'], $this->codes('yi_sun_sin', 'active'));
    }

    public function test_액티브_시드는_운영_거부와_재분배_영웅_연결_보존(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();   // P1 스킬 조각에 주인공 10행 포함 -> heroes 선행 필요
        $this->artisan('game:seed-active-skills')->assertSuccessful();
        $this->artisan('game:seed-skill-grades')->assertSuccessful();
        $links = DB::table('hero_skills')->count();
        $this->artisan('game:seed-active-skills')->assertSuccessful();                   // 재분배 영웅은 1영웅 1액티브 검증·재삽입 대상 아님
        $this->artisan('game:seed-active-skills', ['--overwrite' => true])->assertSuccessful();
        $this->assertSame($links, DB::table('hero_skills')->count());
        $this->assertSame(['rd_yi_sun_sin_a1', 'rd_yi_sun_sin_a3'], $this->codes('yi_sun_sin', 'active'));

        $this->app['env'] = 'production';
        try {
            $this->artisan('game:seed-active-skills')->assertFailed();                   // 운영 환경 거부
        } finally {
            $this->app['env'] = 'testing';
        }
    }
}
