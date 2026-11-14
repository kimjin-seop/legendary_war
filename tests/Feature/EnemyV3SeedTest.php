<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use App\Game\EnemyV3Adapter;
use App\Services\GachaService;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 임밸런 적 편성 v3 어댑터 + 스테이지 전용 한도 + NPC 시드 + 주인공 연동(핵심 동작만). */
class EnemyV3SeedTest extends TestCase
{
    use RefreshDatabase;

    private const ENEMY = 'stages_ch1_enemy_v3.json,stages_legacy6_enemy_v3.json';

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();
    }

    private function seedV3(): void
    {
        $this->artisan('game:seed-imjin10', ['--enemy' => self::ENEMY, '--with-npc' => true, '--with-protagonist' => true])->assertSuccessful();
    }

    public function test_어댑터_변환은_부대수_유닛수_증원구역을_보존한다(): void
    {
        $doc = json_decode(file_get_contents(database_path('data/stages_ch1_enemy_v3.json')), true);
        $s4 = collect($doc['items'])->firstWhere('code', 'ch1_s4');
        $c = EnemyV3Adapter::convert($s4);
        $this->assertSame((int) $s4['enemy_units_initial'], $c['units_initial']);   // 임밸런 데이터 기준(현재 초기 10)
        $this->assertGreaterThan($c['units_initial'], $c['units_peak']);   // 증원 포함 최대치(데이터 요약 필드 enemy_units_peak 는 증원 미반영이라 사용하지 않음)
        $this->assertSame((int) $s4['enemy_squads_count'], 1 + count($c['enemy_squad']['squads']));
        $this->assertCount(2, $c['triggers']);   // 임밸런 맵 확장 편성: 3턴 R2 + 5턴 R1 증원
        $this->assertSame([[21, 21]], $c['zones']['v3_R2']);
        $this->assertSame([[11, 20]], $c['zones']['v3_R1']);   // 확장 맵 좌표
        $s10 = EnemyV3Adapter::convert(collect($doc['items'])->firstWhere('code', 'ch1_s10'));
        $this->assertSame([], $s10['triggers']);         // boss_hp_pct_lte 는 엔진 미지원 -> 보존만
        $this->assertCount(2, $s10['deferred']);
        $this->assertSame(17, $s10['units_initial']);
    }

    public function test_v3_시드는_cells_좌표로_적을_배치하고_멱등이며_진주성_아군구역은_24칸이다(): void
    {
        $this->seedV3();
        $snap = fn () => DB::table('stages')->orderBy('code')->get(['code', 'enemy_squad', 'triggers', 'forced_heroes'])->toJson().DB::table('maps')->where('code', 'like', 'im_%')->orderBy('code')->get(['code', 'deploy_zones', 'meta'])->toJson().DB::table('heroes')->count();
        $first = $snap();
        $this->seedV3();
        $this->assertSame($first, $snap());

        config(['game.companions.enabled' => false]);   // 시드 좌표 검증은 동반 일반병 보강(런타임) 제외 원본 편성 기준
        $r = $this->postJson('/api/guests', ['nickname' => 'v3'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        DB::table('stages')->update(['prerequisite_stage_id' => null]);   // 선행 잠금 해제(좌표 검증이 목적)
        $s4 = DB::table('stages')->where('code', 'ch1_s4')->first();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$s4->id.'/challenge')->assertCreated();
        $enemies = array_values(array_filter($b->json('battle.units'), fn ($u) => $u['side'] === 'b'));
        $s4doc = collect(json_decode(file_get_contents(database_path('data/stages_ch1_enemy_v3.json')), true)['items'])->firstWhere('code', 'ch1_s4');
        $this->assertCount((int) $s4doc['enemy_units_initial'], $enemies);   // 임밸런 데이터 기준 초기 유닛 수
        $cells = array_map(fn ($u) => $u['cell'], $s4doc['units_flat_initial']);   // stages_ch1_enemy_v3.json ch1_s4 cells(확장 맵 좌표)
        $got = array_map(fn ($u) => [$u['x'], $u['y']], $enemies);
        sort($cells);
        sort($got);
        $this->assertSame($cells, $got);                   // v3 cells 그대로
        $this->assertSame('su_ch1_s4_jinju', $b->json('deployment.map_code'));
        $this->assertCount(count(json_decode(DB::table('maps')->where('code', 'su_ch1_s4_jinju')->value('deploy_zones'), true)['a']), $b->json('deployment.deploy_zone'));   // 확장 맵 자체 배치 구역(ally_zone_override 는 im_04 전용이었음)
        $this->assertSame(24, $b->json('deployment.max_units_per_side'));   // 스테이지 전투 한도
        $this->assertSame(2, count(json_decode($s4->triggers, true)));
    }

    public function test_스테이지_한도_24는_캠페인_전투에만_적용되고_PvP는_12를_유지한다(): void
    {
        $p = app(ProgressionService::class);
        $this->assertSame(12, $p->squadCfg()['max_units']);
        $this->assertSame(24, $p->squadCfg(true)['max_units']);
        $this->assertSame(32, ArmyBuilder::unitHardCap());
        $this->postJson('/api/guests', ['nickname' => 'rules'])->assertCreated();
        $rules = $this->getJson('/api/rules')->assertOk();
        $this->assertSame(12, $rules->json('rules.max_units_per_side'));
        $this->assertSame(24, $rules->json('rules.max_units_per_side_stage'));
    }

    public function test_NPC_47행이_campaign_only로_시드되고_가챠_무작위편성_소유에서_제외되며_화자_별칭은_중복행을_만들지_않는다(): void
    {
        $this->seedV3();
        $npc = DB::table('heroes')->where('campaign_only', true)->where('is_protagonist', false);
        $nonPlayable = fn ($f) => count(array_filter(json_decode(file_get_contents($f), true)['items'], fn ($i) => empty($i['playable'])));   // playable:true 행은 승격 대상(campaign_only=0)이라 제외 (GameSeedImjin10: campaign_only = empty(playable))
        $expect = $nonPlayable(database_path('data/npc_roster_v3.json'));
        foreach (glob(database_path('data/npc_roster_v3_additions*.json')) as $f) {   // additions(shelf 포함) 병합분, code 충돌 시 기존 우선
            $expect += $nonPlayable($f);
        }
        $seeded = $npc->count();
        $this->assertSame($expect, (clone $npc)->where('code', 'not like', 'npc_jp_%')->count());   // 화자 전용 신규 행(npc_jp_*)은 제외
        $this->assertSame(1, DB::table('heroes')->where('code', 'like', 'npc_jp_%')->count());   // 화자 11개 중 신규 행은 okpo_lieutenant뿐
        $this->assertSame(0, DB::table('heroes')->whereIn('code', ['npc_jp_todo_takatora', 'npc_ink_shadow_s8', 'npc_ink_shadow_final'])->count());
        $this->assertSame('naval', DB::table('heroes')->where('code', 'npc_shimazu_yoshihiro')->value('troop_type'));
        $this->assertNotNull(DB::table('heroes')->where('code', 'npc_todo_takatora')->value('note'));
        $this->assertStringContainsString('npc_', json_encode(app(GachaService::class)->pool()['by_rarity']));   // 2026-11-03: NPC·스토리 영웅도 가챠 풀 포함(사용자 지시, gacha_pool include_campaign_npc)
        $heroes = app(\App\Services\GameData::class)->heroes();
        $state = ['rng' => 1];
        $this->assertSame([], array_filter(ArmyBuilder::randomParty($heroes, 999, 99, $state), fn ($x) => ! empty($x['campaign_only'])));
        $r = $this->postJson('/api/guests', ['nickname' => 'npc'])->assertCreated();
        $owned = collect($this->withHeaders(['X-Guest-Token' => $r->json('guest_token')])->getJson('/api/heroes')->json('heroes'))->pluck('hero')->all();
        $this->assertSame([], array_filter($owned, fn ($c) => str_starts_with($c, 'npc_')));
        $this->seedV3();
        $this->assertSame($seeded, DB::table('heroes')->where('campaign_only', true)->where('is_protagonist', false)->count());   // 멱등(재시드 후 개수 불변)
    }

    public function test_주인공은_이순신_수군_대여와_공존하며_지휘관이어야_하고_미생성_계정은_소급_지급된다(): void
    {
        $this->seedV3();
        $r = $this->postJson('/api/guests', ['nickname' => 'lead'])->assertCreated();
        $this->givePartyHeroes((int) $r->json('user.id'));
        $uid = (int) $r->json('user.id');
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $this->assertSame(0, DB::table('user_protagonists')->where('user_id', $uid)->count());
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $this->assertSame('@protagonist', json_decode($s1->forced_heroes, true)[0]);
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();   // 첫 캠페인 진입 -> ensureDefault
        $this->assertSame(1, DB::table('user_protagonists')->where('user_id', $uid)->count());
        $this->assertSame(['protagonist_male_sword', 'yi_sun_sin'], array_column($b->json('deployment.forced'), 'hero'));
        $this->assertSame('naval', $b->json('deployment.forced.1.troop_type'));
        $party = $b->json('deployment.default_party');
        $this->assertSame($b->json('deployment.forced.0.user_hero_id'), $party[0]);   // 주인공이 기본 편성 지휘관(첫 번째)
        $pos = $b->json('deployment.default_positions');
        $id = $b->json('battle.battle_id');
        $place = fn (array $ids) => array_map(fn ($u) => ['user_hero_id' => $u, 'x' => $pos[$u]['x'], 'y' => $pos[$u]['y']], $ids);
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $place(array_reverse(array_slice($party, 0, 2)))])->assertStatus(422)->assertJsonPath('error.code', 'protagonist_must_lead');
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $place(array_slice($party, 0, 2))])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.status', 'in_progress');
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $lead = array_values(array_filter($state['units'], fn ($u) => $u['side'] === 'a' && ! empty($u['protagonist'])));
        $this->assertCount(1, $lead);
        $this->assertSame('a0', $lead[0]['id']);         // 주인공 = 아군 지휘관(사망 시 패배 로직에 통합)
        $this->assertSame('commander', $lead[0]['kind']);
        // 전투 view: unit.portrait(주인공 = protagonist_<face>, 영웅 = 영웅 code, 적 일반 유닛 = null) + 맵 tile_layer
        $view = $this->withHeaders($h)->getJson("/api/battles/$id")->assertOk();
        $by = collect($view->json('battle.units'));
        $this->assertSame('protagonist_male_a', $by->firstWhere('id', 'a0')['portrait']);
        $this->assertSame('yi_sun_sin', $by->firstWhere('hero', 'yi_sun_sin')['portrait']);
        $this->assertNull($by->firstWhere('side', 'b')['portrait']);
        $this->assertSame('protagonist_male_a', collect($b->json('deployment.candidates'))->firstWhere('hero', 'protagonist_male_sword')['portrait']);
        $this->assertSame('names-v1', $view->json('battle.tile_layer.format'));
    }
}
