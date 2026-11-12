<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StageEnemyExtraTest extends TestCase
{
    use RefreshDatabase;

    public function test_스테이지_적은_추가_부대와_레벨_가산을_반영한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'extra'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $uid = $r->json('user.id');
        $ids = DB::table('stages')->pluck('id', 'code');
        foreach ($ids as $code => $id) {   // 해금 우회(선행 클리어 기록)
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $id, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        $units = function (string $code) use ($h, $ids) {
            $bid = $this->withHeaders($h)->postJson('/api/stages/'.$ids[$code].'/challenge')->assertCreated()->json('battle.battle_id');
            $b = DB::table('battles')->where('id', $bid)->first();

            return array_values(array_filter(json_decode($b->state, true)['units'], fn ($u) => $u['side'] === 'b'));
        };

        // 기대값은 시드 JSON에서 계산: 지휘관 1 + 프리셋 부대 + extra 부대, 레벨 = enemy_level + offset
        $stageRows = collect(json_decode(file_get_contents(database_path('data/stages.json')), true)['items'])->keyBy('code');
        $presets = collect(json_decode(file_get_contents(database_path('data/presets.json')), true)['items'])->keyBy('code');
        $expect = fn (string $c) => 1 + count($presets[$stageRows[$c]['enemy_preset']]['units']) + count($stageRows[$c]['enemy_extra_troops'] ?? []);
        $n3 = $expect('stage_03');
        $s1 = $units('stage_01');
        $this->assertCount($expect('stage_01'), $s1);
        $s3 = $units('stage_03');
        $this->assertCount($n3, $s3);                                 // extra 부대 반영
        $bid = DB::table("battles")->where("stage_id", $ids["stage_03"])->orderByDesc("id")->value("id");
        $this->assertSame((int) array_sum(array_column($s3, "max_hp")), (int) json_decode(DB::table("battles")->where("id", $bid)->value("state"), true)["init_hp"]["b"]);   // init_hp에 추가 부대 포함
        $this->assertSame((int) ($stageRows['stage_03']['enemy_level'] + ($stageRows['stage_03']['enemy_level_offset'] ?? 0)), $s3[0]['level']);
        $this->assertCount($n3, array_unique(array_map(fn ($u) => $u['x'].','.$u['y'], $s3)));   // 칸 중복 없음
    }

    public function test_스테이지_적_병사는_영웅_고정_병종_1종이고_병사_수는_유지된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'fixedenemy'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $uid = $r->json('user.id');
        $ids = DB::table('stages')->pluck('id', 'code');
        foreach ($ids as $id) {
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $id, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        foreach (['stage_01', 'stage_02', 'stage_03', 'stage_04'] as $code) {   // stage_01/02: 병종 v2 이관(heavy -> sword) 후 포함, 03: 혼합 프리셋(궁/창/검), 04: 혼합 + extra 기병
            $bid = $this->withHeaders($h)->postJson('/api/stages/'.$ids[$code].'/challenge')->assertCreated()->json('battle.battle_id');
            $units = json_decode(DB::table('battles')->where('id', $bid)->value('state'), true)['units'];
            $enemy = array_values(array_filter($units, fn ($u) => $u['side'] === 'b'));
            $stage = DB::table('stages')->where('id', $ids[$code])->first();
            $preset = DB::table('presets')->where('id', $stage->enemy_preset_id)->first();
            $fixed = DB::table('heroes')->where('id', $preset->hero_id)->value('troop_type');
            $this->assertNotEmpty($fixed);
            $troops = array_values(array_filter($enemy, fn ($u) => $u['kind'] === 'troop'));
            $this->assertCount(count(json_decode($preset->units, true)) + count(json_decode($stage->enemy_extra_troops, true)), $troops);
            $this->assertSame([$fixed], array_values(array_unique(array_column($troops, 'type'))));
        }
    }
}
