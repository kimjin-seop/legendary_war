<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 맵 meta.tile_tags -> 스테이지 전투 state.tile_tags (없으면 키 자체가 없음) */
class TileTagsStateTest extends TestCase
{
    use RefreshDatabase;

    public function test_맵_meta_tile_tags가_전투_state로_들어간다(): void
    {
        foreach (['game:seed', 'game:seed-ch1', 'game:seed-protagonist'] as $c) {
            $this->artisan($c)->assertSuccessful();
        }
        $r = $this->postJson('/api/guests', ['nickname' => 'tt'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $st = DB::table('stages')->where('code', 'ch1_s1')->first();
        $id1 = $this->withHeaders($h)->postJson('/api/stages/'.$st->id.'/challenge')->assertCreated()->json('battle.battle_id');
        $this->assertArrayNotHasKey('tile_tags', json_decode(DB::table('battles')->where('id', $id1)->value('state'), true));
        $this->withHeaders($h)->postJson("/api/battles/$id1/abandon")->assertOk();

        $meta = json_decode((string) DB::table('maps')->where('id', $st->map_id)->value('meta'), true) ?: [];
        $meta['tile_tags'] = ['sandbar' => [[3, 3], [4, 3]]];
        DB::table('maps')->where('id', $st->map_id)->update(['meta' => json_encode($meta)]);
        $id2 = $this->withHeaders($h)->postJson('/api/stages/'.$st->id.'/challenge')->assertCreated()->json('battle.battle_id');
        $this->assertSame(['sandbar' => [[3, 3], [4, 3]]], json_decode(DB::table('battles')->where('id', $id2)->value('state'), true)['tile_tags']);
    }
}
