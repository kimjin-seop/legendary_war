<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 배치 슬롯(stages.rules.deploy_slots): 슬롯 검증, 고정 영웅 코스트 포함, 슬롯 미정의/진행 중 전투 폴백, 스테이지 단위 필수 영웅. 핵심 동작만. */
class DeploySlotsTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();
    }

    private function guest(): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'slot'])->assertCreated();

        return [['X-Guest-Token' => $r->json('guest_token')], (int) $r->json('user.id')];
    }

    private function stage(): object
    {
        return DB::table('stages')->where('code', 'stage_01')->first();   // 시드 JSON 의 시범 슬롯(고정: 주인공 1 + 선택 2)
    }

    private function setRules(callable $f): void
    {
        $s = $this->stage();
        $r = json_decode($s->rules, true);
        $f($r);
        DB::table('stages')->where('id', $s->id)->update(['rules' => json_encode($r)]);
    }

    public function test_슬롯_검증_슬롯_외_타일_고정_영웅_이동_병종_불일치는_거부되고_선택_슬롯은_비워도_확정된다(): void
    {
        [$h] = $this->guest();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $d = $b->json('deployment');
        $this->assertTrue($d['slot_mode']);
        $this->assertSame(['fixed' => 1, 'free' => 2, 'total' => 3], $d['slot_counts']);
        $this->assertSame(2, $d['max_party_slots']);   // 선택 슬롯 수
        $slots = collect($d['slots']);
        $fx = $slots->firstWhere('kind', 'fixed');
        $fr = $slots->where('kind', 'free')->values();
        $pro = $fx['user_hero_id'];
        $yi = collect($d['candidates'])->firstWhere('hero', 'yi_sun_sin')['user_hero_id'];
        $put = fn ($pl) => $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $pl]);
        $at = fn ($uh, $s) => ['user_hero_id' => $uh, 'x' => $s['x'], 'y' => $s['y']];
        $put([$at($pro, $fx), ['user_hero_id' => $yi, 'x' => 0, 'y' => 0]])->assertStatus(422)->assertJsonPath('error.code', 'not_a_slot');
        $put([$at($pro, $fr[0]), $at($yi, $fx)])->assertStatus(422)->assertJsonPath('error.code', 'slot_hero_mismatch');   // 고정 영웅 이동 / 선택 슬롯 아님
        $put([$at($yi, $fx)])->assertStatus(422);   // 고정 영웅 교체(주인공 누락)
        $put([$at($pro, $fx), $at($yi, $fr[0]), $at($yi, $fr[1])])->assertStatus(422);   // 한 영웅 두 슬롯
        $put([$at($pro, $fx), $at($yi, $fr[0]), $at(999999, $fr[1])])->assertStatus(422)->assertJsonPath('error.code', 'hero_not_owned');
        $ut = collect($d['candidates'])->firstWhere('hero', 'yi_sun_sin')['unit_type'];
        $this->setRules(function (&$r) use ($ut) {
            $r['deploy_slots']['free_slots'][0]['unit_types'] = [$ut === 'archer' ? 'cavalry' : 'archer'];
        });
        $b2 = $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertCreated();   // 새 전투에는 변경된 슬롯이 스냅샷된다
        $d2 = $b2->json('deployment');
        $id2 = $b2->json('battle.battle_id');
        $f2 = collect($d2['slots'])->where('kind', 'free')->values();
        $this->withHeaders($h)->putJson("/api/battles/$id2/deployment", ['placements' => [$at($pro, collect($d2['slots'])->firstWhere('kind', 'fixed')), $at($yi, $f2[0])]])->assertStatus(422)->assertJsonPath('error.code', 'slot_unit_type_mismatch');
        // 선택 슬롯을 비운 채(고정 영웅만) 제출·확정
        $put([$at($pro, $fx)])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
    }

    public function test_고정_영웅_코스트도_상한에_포함된다(): void
    {
        [$h] = $this->guest();
        $this->setRules(function (&$r) {
            $r['deploy_slots']['cost_cap'] = 1;
        });
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertCreated();
        $d = $b->json('deployment');
        $this->assertSame(1, $d['max_cost']);
        $this->assertSame('stage', $d['cost_cap_source']);
        $this->assertGreaterThan(1, $d['forced_cost']['total']);
        $fx = collect($d['slots'])->firstWhere('kind', 'fixed');
        $this->withHeaders($h)->putJson('/api/battles/'.$b->json('battle.battle_id').'/deployment', ['placements' => [['user_hero_id' => $fx['user_hero_id'], 'x' => $fx['x'], 'y' => $fx['y']]]])
            ->assertStatus(422)->assertJsonPath('error.code', 'cost_exceeded');
    }

    public function test_슬롯_미정의_스테이지와_진행_중_전투는_현행_검증으로_동작한다(): void
    {
        [$h] = $this->guest();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $pro = collect($b->json('deployment.slots'))->firstWhere('kind', 'fixed')['user_hero_id'];
        $zone = $b->json('deployment.deploy_zone');
        // 진행 중(구) 전투 재현: 스냅샷 키가 없으면 슬롯 외 타일도 허용(레거시)
        $row = DB::table('battles')->where('id', $id)->first();
        $st = json_decode($row->state, true);
        unset($st['deploy_slots']);
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($st)]);
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => [['user_hero_id' => $pro, 'x' => $zone[0][0], 'y' => $zone[0][1]]]])->assertOk();
        // 슬롯 미정의 스테이지: 응답은 슬롯 모드 아님, 곡선 슬롯/코스트 그대로
        $this->setRules(function (&$r) {
            unset($r['deploy_slots']);
        });
        $d = $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertCreated()->json('deployment');
        $this->assertFalse($d['slot_mode']);
        $this->assertSame([], $d['slots']);
        $this->assertNull($d['slot_counts']);
        $this->assertSame(2, $d['max_party_slots']);   // Lv1 캠페인 곡선
        $this->assertSame('level', $d['cost_cap_source']);
        $this->assertGreaterThan(0, $d['forced_cost']['total']);
        $this->assertLessThanOrEqual($d['max_cost'], $d['forced_cost']['total']);   // 신규 유저가 주인공 코스트로 막히지 않는다
    }

    public function test_스테이지별_필수_영웅_미보유면_입장_거부_목록은_잠김이다(): void
    {
        [$h, $uid] = $this->guest();
        $this->setRules(function (&$r) {
            $r['required_heroes'] = ['yi_sun_sin'];
        });
        DB::table('user_heroes')->where('user_id', $uid)->where('hero_id', DB::table('heroes')->where('code', 'yi_sun_sin')->value('id'))->delete();
        $row = collect($this->withHeaders($h)->getJson('/api/stages')->assertOk()->json('stages'))->firstWhere('code', 'stage_01');
        $this->assertFalse($row['playable']);
        $this->assertSame('yi_sun_sin', $row['missing_heroes'][0]['code']);
        $this->assertSame(['fixed' => 1, 'free' => 2, 'cost_cap' => null], $row['deploy_slot_counts']);
        $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertStatus(422)->assertJsonPath('error.code', 'required_hero_missing');
    }

    public function test_새_게스트_기본_편성은_stage_01_03_모두_코스트_상한을_넘지_않고_확정된다_슬롯_모드와_미정의_모두(): void
    {
        foreach ([true, false] as $withSlots) {
            if (! $withSlots) {   // 슬롯 미정의(개발 DB 현재 상태) 폴백: 강제 영웅 코스트 포함 + 곡선 상한
                foreach (['stage_01', 'stage_02', 'stage_03'] as $c) {
                    $row = DB::table('stages')->where('code', $c)->first();
                    $r = json_decode($row->rules, true);
                    unset($r['deploy_slots']);
                    DB::table('stages')->where('id', $row->id)->update(['rules' => json_encode($r)]);
                }
            }
            [$h, $uid] = $this->guest();
            foreach (['stage_01', 'stage_02', 'stage_03'] as $i => $code) {
                $st = DB::table('stages')->where('code', $code)->first();
                $i > 0 && DB::table('user_stage_progress')->updateOrInsert(['user_id' => $uid, 'stage_id' => DB::table('stages')->where('code', 'stage_0'.$i)->value('id')], ['clear_count' => 1, 'best_stars' => 1]);
                $d = $this->withHeaders($h)->postJson('/api/stages/'.$st->id.'/challenge')->assertCreated();
                $id = $d->json('battle.battle_id');
                $dep = $d->json('deployment');
                $this->assertSame($withSlots, $dep['slot_mode'], $code);
                $pl = array_map(fn ($uh) => ['user_hero_id' => $uh, 'x' => $dep['default_positions'][$uh]['x'], 'y' => $dep['default_positions'][$uh]['y']], $dep['default_party']);
                $this->assertGreaterThanOrEqual(2, count($pl), $code);   // 주인공 + 시작 영웅
                $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $pl])->assertOk();   // cost_exceeded 없이 통과
                $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
            }
        }
    }

    public function test_감사_명령이_슬롯_고정_코스트_오류를_표시한다(): void
    {
        $this->setRules(function (&$r) {
            $r['deploy_slots']['cost_cap'] = 1;
        });
        \Illuminate\Support\Facades\Artisan::call('game:audit-stages');
        $this->assertStringContainsString('ERROR forced_cost_over', \Illuminate\Support\Facades\Artisan::output());
    }

    public function test_배치_응답의_기본_편성_코스트는_고정_영웅을_포함하고_적_병력_미리보기가_있다(): void
    {
        [$h] = $this->guest();
        $d = $this->withHeaders($h)->postJson('/api/stages/'.$this->stage()->id.'/challenge')->assertCreated()->json('deployment');
        $cost = collect($d['candidates'])->keyBy('user_hero_id');
        $heroSum = array_sum(array_map(fn ($id) => $cost[$id]['cost'], $d['default_party']));
        $this->assertSame($heroSum, $d['default_party_cost']['hero']);
        $this->assertGreaterThanOrEqual($d['forced_cost']['total'], $d['default_party_cost']['total']);
        $this->assertSame($d['max_cost'], $d['default_party_cost']['max']);
        $this->assertGreaterThan(0, $d['enemy_preview']['initial']);
        $this->assertArrayHasKey('reinforce', $d['enemy_preview']);
    }
}
