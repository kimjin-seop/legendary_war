<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 도감 조우 장수(서가 NPC) 열람 전용 목록: 인증, 서가 클리어 전 마스킹, 클리어 후 공개, 무명 지휘관 제외, 플래그. */
class EncounterDexTest extends TestCase
{
    use RefreshDatabase;

    private function hero(string $code, string $name): void
    {
        $base = (array) DB::table('heroes')->first();
        unset($base['id']);
        DB::table('heroes')->insert(['code' => $code, 'name_ko' => $name, 'name_en' => $code, 'campaign_only' => 1, 'is_protagonist' => 0] + $base);
    }

    public function test_인증_마스킹_공개_무명_제외_플래그(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->getJson('/api/dex/encounter')->assertUnauthorized();
        $this->hero('npc_so_baeap', '소배압');                      // ch11 서가 이름 있는 적장
        $this->hero('npc_goguryeo_cavalry_captain', '고구려 기병 장수');   // 무명 지휘관(코드·이름이 직무 칭호형)
        $r = $this->postJson('/api/guests', ['nickname' => 'dx'])->assertCreated();
        $uid = (int) $r->json('user.id');
        $h = ['X-Guest-Token' => $r->json('guest_token')];

        $list = collect($this->withHeaders($h)->getJson('/api/dex/encounter')->assertOk()->json('heroes'))->keyBy('code');
        $this->assertArrayHasKey('npc_so_baeap', $list->all());
        $this->assertArrayNotHasKey('npc_goguryeo_cavalry_captain', $list->all());
        $m = $list['npc_so_baeap'];
        $this->assertFalse($m['revealed']);
        $this->assertTrue($m['silhouette']);
        $this->assertNull($m['name_ko']);
        $this->assertNull($m['one_line']);
        $this->assertSame('ch11', $m['shelf_code']);
        $this->assertArrayNotHasKey('evidence_level', $m);

        $sid = DB::table('stages')->where('code', 'ch1_s1')->value('id');
        DB::table('stages')->where('id', $sid)->update(['chapter' => 11]);   // ch11 서가 스테이지를 클리어한 상태로 만든다
        DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $sid, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        $m = collect($this->withHeaders($h)->getJson('/api/dex/encounter')->json('heroes'))->keyBy('code')['npc_so_baeap'];
        $this->assertTrue($m['revealed']);
        $this->assertSame('소배압', $m['name_ko']);

        config(['game.encounter_dex.enabled' => false]);
        $this->withHeaders($h)->getJson('/api/dex/encounter')->assertNotFound()->assertJsonPath('error.code', 'encounter_dex_disabled');
    }

    public function test_신규_게스트는_전원_미공개_전체_클리어_계정은_공개(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->hero('npc_so_baeap', '소배압');
        $r = $this->postJson('/api/guests', ['nickname' => 'dx2'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $fresh = $this->withHeaders($h)->getJson('/api/dex/encounter')->assertOk()->json('heroes');
        $this->assertNotEmpty($fresh);
        $this->assertSame([], array_values(array_filter($fresh, fn ($x) => $x['revealed'] || ! $x['silhouette'])));
        // QA 계정처럼 모든 스테이지를 클리어한 계정은 전원 공개(실화면에서 전원 공개로 보이는 경우는 이쪽)
        $uid = (int) $r->json('user.id');
        foreach (DB::table('stages')->pluck('id') as $sid) {
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $sid, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        DB::table('stages')->update(['chapter' => 11]);
        $all = $this->withHeaders($h)->getJson('/api/dex/encounter')->json('heroes');
        $this->assertTrue(collect($all)->firstWhere('code', 'npc_so_baeap')['revealed']);
    }
}
