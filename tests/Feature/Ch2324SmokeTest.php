<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** ch23·ch24 스테이지 시드 후 각 전투가 오류 없이 생성·배치 확정되는지(init 스모크). */
class Ch2324SmokeTest extends TestCase
{
    use RefreshDatabase;

    public function test_ch23_ch24_스테이지_전투가_오류없이_시작된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        foreach (['npc_cart_1', 'npc_cart_2'] as $cart) {   // ch23_s1 수레 NPC(실제는 game:seed-main --act=3 --with-npc 가 생성): 기존 NPC 행 복제 자리표시
            $row = (array) DB::table('heroes')->where('code', 'npc_manabe_samanojo')->first();
            unset($row['id']);
            DB::table('heroes')->insert(['code' => $cart, 'name_en' => $cart] + $row);
        }
        $this->artisan('game:seed-maps-pack')->assertSuccessful();
        $this->artisan('game:seed-maps-pack', ['--path' => 'maps_pack20_v2.json'])->assertSuccessful();
        foreach (['maps_scaleup_ch1.json', 'maps_scaleup_swap.json', 'maps_scaleup_late.json', 'maps_scaleup_batch2.json', 'maps_ch23_ch24.json'] as $f) {
            $this->artisan('game:seed-maps-pack', ['--path' => $f])->assertSuccessful();
        }
        $this->artisan('game:seed-shelf', ['--chapters' => '23,24', '--with-npc' => true])->assertSuccessful();

        $r = $this->postJson('/api/guests', ['nickname' => 'smoke'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $uid = $r->json('user.id');
        $stages = DB::table('stages')->whereIn('code', ['ch23_s1', 'ch23_s2', 'ch23_s3', 'ch23_s4', 'ch23_s5', 'ch24_s1', 'ch24_s2', 'ch24_s3', 'ch24_s4'])->orderBy('sort_order')->get();
        $this->assertCount(9, $stages);
        foreach ($stages as $s) {
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $s->id, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        foreach ($stages as $s) {
            $b = $this->withHeaders($h)->postJson('/api/stages/'.$s->id.'/challenge');
            $this->assertSame(201, $b->status(), $s->code.': '.$b->getContent());
            $id = $b->json('battle.battle_id');
            $pos = $b->json('deployment.default_positions');
            $party = array_keys($pos ?? []);
            $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => array_map(fn ($k) => ['user_hero_id' => (int) $k, 'x' => $pos[$k]['x'], 'y' => $pos[$k]['y']], array_slice($party, 0, 2))])->assertOk();
            $c = $this->withHeaders($h)->postJson("/api/battles/$id/confirm");
            $this->assertSame(200, $c->status(), $s->code.': '.$c->getContent());
            $c->assertJsonPath('battle.status', 'in_progress');
            $st = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
            $core = ['ch23_s2' => 'william_i', 'ch23_s3' => 'william_i', 'ch23_s4' => 'william_i', 'ch23_s5' => 'william_i', 'ch24_s2' => 'charles_martel', 'ch24_s3' => 'charles_martel', 'ch24_s4' => 'charles_martel'][$s->code] ?? null;
            if ($core !== null) {   // 핵심 인물은 아군 NPC로 존재하고 hero:<코드> 참조 조건이 그 유닛을 가리킨다
                $this->assertNotEmpty(array_filter($st['units'], fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && ($u['npc_ref'] ?? $u['hero'] ?? null) === $core), $s->code.': '.$core);
                $this->assertTrue(\App\Game\EventConditions::evaluate(\App\Game\EventConditions::normalize(['type' => 'in_zone', 'unit' => 'hero:'.$core, 'rect' => [0, 0, $st['width'] - 1, $st['height'] - 1]]), $st), $s->code.' hero 참조 평가');
            }
            $s->code === 'ch23_s3' && $this->assertNotEmpty($st['win_rule']['conds'] ?? null);
        }
    }
}
