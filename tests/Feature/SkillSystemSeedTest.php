<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SkillSystemSeedTest extends TestCase
{
    use RefreshDatabase;

    public function test_시드는_멱등이며_영웅_복수_스킬이_합산된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $count = fn () => [DB::table('skills')->count(), DB::table('hero_skills')->count()];
        $first = $count();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed', ['--force' => true])->assertSuccessful();
        $this->assertSame($first, $count());                                    // 재실행해도 행 수 불변
        // 잔 다르크: divine_banner(신의 깃발)는 송서사 확정안 ja_hyb_mid(사기의 상징, T_ATKDEF_HYBRID mid)로 교체됨
        $this->assertSame('T_ATKDEF_HYBRID', DB::table('skills')->where('code', 'ja_hyb_mid')->value('template'));
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'ja_hyb_mid')->value('enabled'));
        $this->assertSame(0, DB::table('skills')->where('code', 'divine_banner')->count());
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'naval_barrage')->value('enabled'));   // 스킬 2단계: 액티브 강타 4종 활성(액티브 엔진 지원)
        $this->assertSame(0, (int) DB::table('skills')->where('code', 'empty_fort')->value('enabled'));   // 공성계(DECOY)는 미구현·근거 미확인으로 비활성

        $data = new GameData;
        $joan = $data->heroes()['joan_of_arc'];
        $this->assertSame(['atk_pct' => 4, 'def_pct' => 8], $joan['passive']);   // 무조건 합: ja_hyb_mid만. ja_last_mid(배수진)·ja_pur_weak(T_PURSUIT, 대상 HP 조건)는 조건부
        $this->assertSame(['ja_last_mid', 'ja_pur_weak'], array_column($joan['skills'], 'code'));

        // 같은 영웅에 스킬 추가(키별 합산) + 미지원 when 조건 효과(무시·보존) + 비활성 스킬(제외)
        $hid = DB::table('heroes')->where('code', 'joan_of_arc')->value('id');
        $mk = fn (string $code, array $params, int $enabled) => DB::table('skills')->insertGetId([
            'code' => $code, 'name' => $code, 'type' => 'passive', 'params' => json_encode($params), 'enabled' => $enabled, 'created_at' => now(), 'updated_at' => now(),
        ]);
        foreach ([[$mk('t_atk', ['atk_pct' => 3], 1), 10], [$mk('t_cond', ['effects' => [['atk_pct' => 9, 'when' => ['weather' => 'rain']], ['heal' => 4]]], 1), 11], [$mk('t_off', ['atk_pct' => 50], 0), 12]] as [$sid, $o]) {
            DB::table('hero_skills')->insert(['hero_id' => $hid, 'skill_id' => $sid, 'sort_order' => $o, 'created_at' => now(), 'updated_at' => now()]);
        }
        $joan = (new GameData)->heroes()['joan_of_arc'];
        $this->assertSame(['atk_pct' => 7, 'def_pct' => 8, 'heal' => 4], $joan['passive']);
        $this->assertSame('t_cond', $joan['passive_ignored'][0]['skill']);
    }

    public function test_force_시드는_JSON에_없는_스킬_연결을_삭제해_합산이_중복되지_않는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $hid = DB::table('heroes')->where('code', 'joan_of_arc')->value('id');
        // 대표 스킬이 바뀌기 전의 옛 연결이 남은 상황을 재현
        DB::table('hero_skills')->insert(['hero_id' => $hid, 'skill_id' => DB::table('skills')->where('code', 'conquest_spear')->value('id'), 'sort_order' => 9, 'created_at' => now(), 'updated_at' => now()]);
        $this->artisan('game:seed')->assertSuccessful();   // 배정안 영웅은 비-force에서도 배정안 기준으로 동기화(옛 연결 제거 -> 합산 중복 방지)
        $this->assertSame(['atk_pct' => 4, 'def_pct' => 8], (new GameData)->heroes()['joan_of_arc']['passive']);
        $this->artisan('game:seed', ['--force' => true])->assertSuccessful();   // force: JSON과 동기화
        $this->assertSame(['atk_pct' => 4, 'def_pct' => 8], (new GameData)->heroes()['joan_of_arc']['passive']);
        $this->assertSame(3, DB::table('hero_skills')->where('hero_id', $hid)->count());   // ja_hyb_mid, ja_last_mid, ja_pur_weak
    }

    public function test_배정안_적재_enabled_정책과_hv_flavor_숨김(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->assertSame(130, DB::table('hero_skills')->distinct()->count('hero_id'));
        // 비지원 템플릿은 enabled=0이라 passive 합에 들어가지 않는다(조건 무시 합산 회귀 방지). PURSUIT/SIEGE/MOVE/REGEN 은 엔진 구현 후 지원 템플릿이라 켜진다
        $this->assertSame(0, DB::table('skills')->where('type', 'passive')->whereNotIn('template', \App\Game\PassiveEffects::SUPPORTED_TEMPLATES)->where('enabled', 1)->count());
        $this->assertGreaterThan(0, DB::table('skills')->whereIn('template', ['T_PURSUIT', 'T_SIEGE_ATK', 'T_MOVE_UP', 'T_REGEN'])->where('enabled', 1)->count());
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'ys_last_strong')->value('enabled'));
        // 계백 gb_last_mid: 송서사 검수(2026-11-04)로 pending_review 해제 -> 켜지고 API 목록에 포함, flavor 공개
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'gb_last_mid')->value('enabled'));
        $this->assertNull(DB::table('skills')->where('code', 'gb_last_mid')->value('review_status'));
        $data = new GameData;
        $this->assertContains('gb_last_mid', array_column($data->heroSkillList((int) $data->heroes()['gyebaek']['id']), 'code'));
        // hv=true: 효과는 켜지고 flavor는 DB에 보존되지만 API 목록에서는 숨긴다
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'al_atk_mid')->value('enabled'));
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'al_atk_mid')->value('needs_verify'));
        $this->assertNotNull(DB::table('skills')->where('code', 'al_atk_mid')->value('flavor'));
        $list = array_column($data->heroSkillList((int) $data->heroes()['alexander']['id']), null, 'code');
        $this->assertNull($list['al_atk_mid']['flavor']);
        $this->assertNotSame('', $list['al_atk_mid']['effect']);
        $this->assertNotNull($list['al_fs_mid']['flavor']);                       // hv 아님: flavor 노출
        $this->assertTrue($list['al_charge_strong']['enabled']);
        $this->assertSame('이동 후 공격할 때', $list['al_charge_strong']['condition']);
    }
}
