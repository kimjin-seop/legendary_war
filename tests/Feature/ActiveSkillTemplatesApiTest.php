<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** use_skill 신규 템플릿(aoe|buff|heal|surge)을 HTTP 레벨로 각 1건 + view active_skills 확장 필드 + 시드 커맨드. */
class ActiveSkillTemplatesApiTest extends TestCase
{
    use RefreshDatabase;

    private array $h;

    private int $bid;

    private function battle(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        config(['game.rules.alternate_activation' => false, 'game.rules.mp_skills' => false]);
        $r = $this->postJson('/api/guests', ['nickname' => 'tplapi'])->assertCreated();
        $this->h = ['X-Guest-Token' => $r->json('guest_token')];
        $ch = $this->withHeaders($this->h)->postJson('/api/stages/1/challenge')->assertCreated();
        $this->bid = $ch->json('battle.battle_id');
        $placements = [];
        foreach ((array) $ch->json('deployment.default_positions') as $uh => $p) {
            $placements[] = ['user_hero_id' => (int) $uh, 'x' => $p['x'], 'y' => $p['y']];
        }
        $this->withHeaders($this->h)->putJson("/api/battles/{$this->bid}/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($this->h)->postJson("/api/battles/{$this->bid}/confirm")->assertOk();
    }

    /** DB 상태를 직접 손봐(테스트 전용) a0에게 4개 액티브를 주고 적 b0를 인접 칸에 둔다. a0 체력은 부상 상태로 둔다. */
    private function arm(): void
    {
        $s = json_decode(DB::table('battles')->where('id', $this->bid)->value('state'), true);
        $d = fn (string $code, string $tpl, array $params) => ['code' => $code, 'name' => $code, 'template' => $tpl, 'power_pct' => (int) ($params['power_pct'] ?? 0), 'cooldown' => 4, 'uses' => 2, 'params' => $params + ['cooldown' => 4, 'uses' => 2]];
        $s['units']['a0']['actives'] = [
            $d('t_aoe', 'T_ACTIVE_AOE', ['power_pct' => 100, 'radius' => 1, 'splash_pct' => 60, 'friendly_fire' => false]),
            $d('t_buff', 'T_ACTIVE_BUFF', ['stat' => 'atk', 'amount' => 10, 'duration' => 1, 'target_mode' => 'self_area', 'radius' => 2, 'cast_range' => 2]),
            $d('t_heal', 'T_ACTIVE_HEAL', ['heal_flat' => 14, 'heal_pct' => 20, 'radius' => 0, 'cast_range' => 2]),
            $d('t_surge', 'T_ACTIVE_SURGE', ['move_bonus' => 2, 'attack_pct' => 100, 'min_turn' => 2, 'leap' => false]),
        ];
        $s['units']['a0']['skill_state'] = array_fill_keys(['t_aoe', 't_buff', 't_heal', 't_surge'], ['cd' => 0, 'uses_left' => 2]);
        $tx = $s['units']['a0']['x'] + max(1, (int) app(\App\Services\GameData::class)->rules()->unitType($s['units']['a0']['type'])['range_min']);
        foreach ($s['units'] as $id => $u) {
            if ($id !== 'b0' && $u['x'] === $tx && $u['y'] === $s['units']['a0']['y']) {
                unset($s['units'][$id]);
            }
        }
        $s['units']['b0']['x'] = $tx;
        $s['units']['b0']['y'] = $s['units']['a0']['y'];
        $s['units']['b0']['hp'] = $s['units']['b0']['max_hp'] = 999;
        $s['units']['a0']['hp'] = max(1, $s['units']['a0']['max_hp'] - 30);
        $s['side'] = 'a';
        DB::table('battles')->where('id', $this->bid)->update(['state' => json_encode($s)]);
    }

    /** 행동 소모 초기화 + 턴 설정(한 전투에서 템플릿별 호출을 이어가기 위함, 테스트 전용) */
    private function reset(int $turn = 2): void
    {
        $s = json_decode(DB::table('battles')->where('id', $this->bid)->value('state'), true);
        $s['units']['a0']['acted'] = $s['units']['a0']['moved'] = false;
        $s['turn'] = $turn;
        DB::table('battles')->where('id', $this->bid)->update(['state' => json_encode($s), 'turn' => $turn]);
    }

    private function act(array $a)
    {
        return $this->withHeaders($this->h)->postJson("/api/battles/{$this->bid}/actions", ['type' => 'use_skill', 'unit_id' => 'a0'] + $a);
    }

    public function test_신규_템플릿_use_skill_API와_view_확장_필드(): void
    {
        $this->battle();
        $this->arm();
        $view = collect($this->withHeaders($this->h)->getJson("/api/battles/{$this->bid}")->json('battle.units'))->firstWhere('id', 'a0')['active_skills'];
        $by = collect($view)->keyBy('code');
        $this->assertSame(['aoe', 'buff', 'heal', 'surge'], [$by['t_aoe']['kind'], $by['t_buff']['kind'], $by['t_heal']['kind'], $by['t_surge']['kind']]);
        $this->assertSame(['enemy', 'self', 'ally', 'none'], [$by['t_aoe']['target_kind'], $by['t_buff']['target_kind'], $by['t_heal']['target_kind'], $by['t_surge']['target_kind']]);
        $this->assertSame(10, $by['t_buff']['params']['amount']);
        $this->assertContains('a0', $by['t_heal']['targets']);                 // 부상 시전자 본인 포함(아군 대상)

        $this->act(['skill' => 't_aoe', 'target_id' => 'b0'])->assertOk()->assertJsonPath('events.0.kind', 'aoe');
        $this->reset();
        $this->act(['skill' => 't_buff'])->assertOk()->assertJsonPath('events.0.kind', 'buff')->assertJsonPath('events.1.type', 'buff_apply');
        $this->reset();
        $this->act(['skill' => 't_heal', 'target_id' => 'b0'])->assertStatus(422)->assertJsonPath('error.code', 'invalid_target');   // 적 대상 거부
        $this->act(['skill' => 't_heal', 'target_id' => 'a0'])->assertOk()->assertJsonPath('events.0.kind', 'heal');
        $this->reset();
        $this->act(['skill' => 't_surge'])->assertOk()->assertJsonPath('events.0.kind', 'surge');
        $this->reset();
        $this->act(['skill' => 't_surge'])->assertStatus(409)->assertJsonPath('error.code', 'skill_cooldown');   // 방금 사용 -> 쿨다운(상태 불변)
    }

    public function test_시드_커맨드는_dry_run으로_변경_없이_검증하고_멱등으로_적재한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $before = [DB::table('skills')->count(), DB::table('hero_skills')->count()];
        $this->artisan('game:seed-active-skills', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame($before, [DB::table('skills')->count(), DB::table('hero_skills')->count()]);
        $this->artisan('game:seed-active-skills')->assertSuccessful();
        $this->assertSame([$before[0] + 25, $before[1] + 25], [DB::table('skills')->count(), DB::table('hero_skills')->count()]);
        DB::table('skills')->where('code', 'zy_fire_aoe')->update(['enabled' => 1, 'review_status' => 'approved']);   // 어드민 수정 시뮬레이션
        $this->artisan('game:seed-active-skills')->expectsOutputToContain('skills 신규 0·갱신 0 / hero_skills 신규 연결 0')->assertSuccessful();   // 재실행: 신규 0, 갱신 0
        $this->assertSame([$before[0] + 25, $before[1] + 25], [DB::table('skills')->count(), DB::table('hero_skills')->count()]);
        $this->assertSame([1, 'approved'], [(int) DB::table('skills')->where('code', 'zy_fire_aoe')->value('enabled'), DB::table('skills')->where('code', 'zy_fire_aoe')->value('review_status')]);   // 어드민 수정 보존
        $this->artisan('game:seed-active-skills', ['--dry-run' => true, '--overwrite' => true])->expectsOutputToContain('갱신 25')->assertSuccessful();
        $this->assertSame(1, (int) DB::table('skills')->where('code', 'zy_fire_aoe')->value('enabled'));   // dry-run은 미변경
        $this->artisan('game:seed-active-skills', ['--overwrite' => true])->expectsOutputToContain('신규 0·갱신 25')->assertSuccessful();
        $this->assertSame([$before[0] + 25, $before[1] + 25], [DB::table('skills')->count(), DB::table('hero_skills')->count()]);
        $this->assertSame(5, DB::table('skills')->whereIn('code', ['zy_fire_aoe', 'ja_morale_atk', 'jr_clinic_heal', 'my_raid_surge', 'sy_breakthrough_strike'])->where('enabled', 1)->where('needs_verify', 0)->count());   // 송서사 검수(2026-11-04)로 켜짐·flavor 공개
        $h = app(\App\Services\GameData::class)->heroes();
        $this->assertSame('T_ACTIVE_AOE', $h['napoleon']['actives'][0]['template']);
        $this->assertSame(1, $h['napoleon']['actives'][0]['uses']);                // AOE 기본 uses 1
        $this->assertSame(['zy_fire_aoe'], array_column($h['zhou_yu']['actives'], 'code'));   // 검수 완료 -> 활성
        $this->assertSame('cannae_encirclement', $h['hannibal']['actives'][0]['code']);   // 기존 4종 불변
        $this->assertNotEmpty($h['napoleon']['passive_effects']);                  // 기존 패시브 유지
        // 신규 4종을 든 영웅끼리 봇 전투가 교대 행동 on/off 모두 오류 없이 끝나고 템플릿별 사용이 집계된다
        $used = [];
        foreach ([false, true] as $alt) {
            $duel = new \App\Game\Duel(app(\App\Services\GameData::class)->engine(['alternate_activation' => $alt, 'squad' => true, 'active_skills' => true]), app(\App\Services\GameData::class)->map(app(\App\Services\GameData::class)->defaultMapId()), 3.0, 30, config('game.bot'));
            $spec = fn ($hero) => ['hero' => $hero, 'level' => 5, 'troops' => ['sword', 'spear']];
            foreach ([['napoleon', 'kim_yusin'], ['khalid_ibn_walid', 'heo_jun'], ['hildegard', 'vauban']] as $i => [$x, $y]) {
                $r = $duel->run(20 + $i, $spec($h[$x]), $spec($h[$y]));
                $this->assertGreaterThanOrEqual(1, $r['rounds']);
                foreach ($r['skill_uses_by_template'] ?? [] as $t => $n) {
                    $used[$t] = ($used[$t] ?? 0) + $n;
                }
            }
        }
        $this->assertGreaterThan(0, array_sum($used));
        fwrite(STDERR, PHP_EOL.'[bot skill uses] '.json_encode($used).PHP_EOL);
        $this->artisan('game:seed')->assertSuccessful();   // 전체 시드 재실행 후에도 액티브 연결 보존
        $this->assertSame($before[1] + 25, DB::table('hero_skills')->count());
    }
}
