<?php

namespace Tests\Feature;

use App\Game\Cues;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 서가 ch12·ch13·ch16 스테이지 시드 후 각 전투가 오류 없이 시작되고 stages cue 가 맵·유닛과 일치하는지(init 스모크). */
class ShelfSmokeTest extends TestCase
{
    use RefreshDatabase;

    /** 시드 대상 서가(스테이지 데이터가 준비된 것만 추가) */
    private const CHAPTERS = [11, 12, 13, 14, 15, 16, 17, 19, 20, 999];

    private function seedAll(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        foreach (['npc_cart_1', 'npc_cart_2', 'npc_gan_ning', 'npc_cao_ren', 'npc_jieum', 'npc_jjogi', 'npc_cart_front'] as $npc) {   // 실제는 game:seed-main --with-npc / 서가 로스터가 생성: 기존 NPC 행 복제 자리표시
            if (! DB::table('heroes')->where('code', $npc)->exists()) {
                $row = (array) DB::table('heroes')->where('code', 'npc_manabe_samanojo')->first();
                unset($row['id']);
                DB::table('heroes')->insert(['code' => $npc, 'name_en' => $npc] + $row);
            }
        }
        $this->artisan('game:seed-maps-pack')->assertSuccessful();
        $this->artisan('game:seed-maps-pack', ['--path' => 'maps_pack20_v2.json'])->assertSuccessful();
        foreach (['maps_scaleup_ch1.json', 'maps_scaleup_swap.json', 'maps_scaleup_late.json', 'maps_scaleup_batch2.json', 'maps_ch23_ch24.json', 'maps_ch12_redcliff.json', 'maps_ch13_hwangsanbeol.json', 'maps_ch16_orleans.json', 'maps_ch20_nagashino.json', 'maps_ch15_mediterranean.json', 'maps_ch19_holy_land.json', 'maps_ch14_salsu.json', 'maps_ch17_gaugamela.json', 'maps_ch11_goryeo_khitan.json', 'maps_ch999_finale.json', 'maps_scaleup_batch3.json', 'maps_culture_copies.json', ...(env('SHELF_SMOKE_EXT') ? ['maps_ch13_ext.json', 'maps_ch20_ext.json', 'maps_ch21_ext.json', 'maps_ch22_ext.json', 'maps_ext2_new.json'] : [])] as $f) {
            $this->artisan('game:seed-maps-pack', ['--path' => $f])->assertSuccessful();
        }
        // 기본은 확장(*_ext*.json) 제외. SHELF_SMOKE_EXT=1 이면 확장 스테이지·로스터도 시드해 같은 스모크를 돌린다(맵 미등록 확장 스테이지는 시드가 경고 후 건너뜀)
        $code = \Illuminate\Support\Facades\Artisan::call('game:seed-shelf', ['--chapters' => implode(',', self::CHAPTERS), '--with-npc' => true] + (env('SHELF_SMOKE_EXT') ? ['--with-ext' => true] : []));
        $this->assertSame(0, $code, \Illuminate\Support\Facades\Artisan::output());   // 실패 시 시드 오류 메시지를 보여준다
    }

    public function test_서가_스테이지_전투가_오류없이_시작되고_cue_조건이_스테이지와_일치한다(): void
    {
        $this->seedAll();
        $r = $this->postJson('/api/guests', ['nickname' => 'shsmoke'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $uid = $r->json('user.id');
        $stages = DB::table('stages')->whereIn('chapter', self::CHAPTERS)->orderBy('sort_order')->get();
        $this->assertNotEmpty($stages);
        foreach (app(\App\Services\HiddenChapterService::class)->requiredStageIds() as $rid) {   // 숨은 종장(ch999) 게이트 통과: 해금 집합의 필수 스테이지 전부 클리어 처리
            DB::table('user_stage_progress')->insertOrIgnore(['user_id' => $uid, 'stage_id' => $rid, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        foreach ($stages as $s) {
            DB::table('user_stage_progress')->insertOrIgnore(['user_id' => $uid, 'stage_id' => $s->id, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
            // 필수 영웅(forced/required)을 보유로 만들어 입장 가능하게 한다
            foreach (json_decode((string) $s->forced_heroes, true) ?: [] as $f) {
                $code = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
                $hid = $code !== '' && $code[0] !== '@' ? DB::table('heroes')->where('code', $code)->value('id') : null;
                $hid && DB::table('user_heroes')->insertOrIgnore(['user_id' => $uid, 'hero_id' => $hid, 'level' => 5, 'exp' => 0, 'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            }
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

            // cue 일치: DB 규칙의 모든 cue 가 엔진 정규화를 통과(무효로 버려진 cue 0), when 의 flag 는 set_flag 가 있고, hero:/unit 참조·타일은 맵 안
            $raw = json_decode((string) $s->rules, true)['cues'] ?? [];
            $this->assertSame(0, Cues::dropped($raw), $s->code.': 무효 cue');
            $dlg = json_decode((string) file_get_contents(base_path('database/data/'.collect(glob(base_path('database/data/ch'.$s->chapter.'_*.json')))->map(fn ($p) => basename($p))->reject(fn ($n) => str_contains($n, 'roster_proposal') || str_contains($n, '.bak'))->first())), true);
            $bc = $dlg['battle_cues'][$s->code] ?? [];
            $this->assertNotEmpty($bc, $s->code.': 대사 JSON battle_cues 없음');
            $this->assertGreaterThanOrEqual(collect($bc)->where('do', 'say')->count(), collect($raw)->where('do', 'say')->count(), $s->code.': battle_cues say 가 rules.cues 에 병합되지 않음');   // 병합된 say cue 존재
            $this->assertEmpty(array_filter(json_encode($raw) ? $raw : [], fn ($c) => isset($c['on']['when']['zone_ref'])), $s->code.': zone_ref 미치환');
            $flagSet = collect($raw)->where('do', 'set_flag')->pluck('key')->all();
            $spawnHeroes = collect($raw)->where('do', 'spawn')->pluck('hero')->filter()->all();
            $onField = collect($st['units'])->map(fn ($u) => [$u['hero'] ?? null, $u['npc_ref'] ?? null])->flatten()->filter()->all();
            foreach ($raw as $cue) {
                $this->assertWhenRefs($cue['on']['when'] ?? null, $flagSet, array_merge($onField, $spawnHeroes), $st, $s->code);
                foreach ($cue['tiles'] ?? [] as [$x, $y]) {
                    $this->assertTrue($x >= 0 && $y >= 0 && $x < $st['width'] && $y < $st['height'], $s->code.': cue 타일 범위 밖');
                }
            }
        }
    }

    private function assertWhenRefs(?array $w, array $flags, array $heroes, array $st, string $code): void
    {
        if ($w === null) {
            return;
        }
        foreach (['all', 'any'] as $k) {
            foreach ($w[$k] ?? [] as $sub) {
                $this->assertWhenRefs($sub, $flags, $heroes, $st, $code);
            }
        }
        isset($w['not']) && $this->assertWhenRefs($w['not'], $flags, $heroes, $st, $code);
        if (($w['type'] ?? null) === 'flag') {
            $this->assertContains($w['key'], $flags, $code.': flag '.$w['key'].' 를 설정하는 set_flag 없음');
        }
        foreach (['unit', 'a', 'b'] as $f) {
            if (isset($w[$f]) && str_starts_with((string) $w[$f], 'hero:')) {
                $this->assertContains(substr($w[$f], 5), $heroes, $code.': '.$w[$f].' 가 전장/spawn 에 없음');
            }
        }
        foreach ($w['tiles'] ?? [] as [$x, $y]) {
            $this->assertTrue($x < $st['width'] && $y < $st['height'], $code.': in_zone 타일 범위 밖');
        }
    }
}
