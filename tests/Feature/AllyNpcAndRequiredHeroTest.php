<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 필수 영웅(주인공 포함) 배치 강제 + 미보유 시 플레이 불가(대여 없음) + 스테이지 아군 NPC(AI 조종). 핵심 동작만. */
class AllyNpcAndRequiredHeroTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
    }

    private function guest(): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'ally'])->assertCreated();
        $this->givePartyHeroes((int) $r->json('user.id'));

        return [['X-Guest-Token' => $r->json('guest_token')], (int) $r->json('user.id')];
    }

    public function test_필수_영웅이_빠지면_422이고_아군_NPC는_AI가_움직이며_플레이어는_조종할_수_없다(): void
    {
        [$h] = $this->guest();
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $party = $b->json('deployment.default_party');
        $pos = $b->json('deployment.default_positions');
        $place = fn ($ids) => ['placements' => array_map(fn ($i) => ['user_hero_id' => $i, 'x' => $pos[$i]['x'], 'y' => $pos[$i]['y']], $ids)];
        $this->assertNotContains('gwak_jae_u', array_column($b->json('deployment.candidates'), 'hero'));   // NPC로 나오는 영웅은 출전 후보 제외
        $forcedIds = array_column($b->json('deployment.forced'), 'user_hero_id');
        $this->assertCount(2, $forcedIds);   // 주인공 + 이순신
        // 주인공 누락 -> 422(다른 영웅이 있어도)
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", $place([$forcedIds[1]]))->assertStatus(422)->assertJsonPath('error.code', 'forced_hero_required');
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", $place($forcedIds))->assertOk();
        $c = $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
        $units = collect($c->json('battle.units'));
        $npc = $units->firstWhere('id', 'n0');
        $this->assertSame(['a', 'gwak_jae_u', true], [$npc['side'], $npc['hero'], $npc['npc_ally']]);
        // 플레이어가 NPC를 조종하려 하면 403
        $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'wait', 'unit_id' => 'n0'])->assertStatus(403)->assertJsonPath('error.code', 'npc_ally_uncontrollable');
        // 턴 종료 -> 적 턴 -> 다음 플레이어 턴 시작 시 NPC가 자동 행동(오류 없음)
        $e = $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $this->assertSame('a', $e->json('battle.current_side'));
        $this->assertTrue(DB::table('battle_actions')->where('battle_id', $id)->where('side', 'a')->where('actor', 'bot')->exists());
    }

    public function test_필수_영웅_미보유면_목록에_잠김_사유가_내려가고_입장은_422이다(): void
    {
        [$h, $uid] = $this->guest();
        $yi = DB::table('heroes')->where('code', 'yi_sun_sin')->value('id');
        DB::table('user_heroes')->where('user_id', $uid)->where('hero_id', $yi)->delete();
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $row = collect($this->withHeaders($h)->getJson('/api/stages')->assertOk()->json('stages'))->firstWhere('code', 'ch1_s1');
        $this->assertTrue($row['hero_locked']);
        $this->assertFalse($row['playable']);
        $this->assertSame('yi_sun_sin', $row['missing_heroes'][0]['code']);   // 주인공은 보유로 간주 -> 목록에 없음
        $this->assertCount(1, $row['missing_heroes']);
        $this->assertSame(['code' => 'gwak_jae_u', 'name' => '곽재우'], $row['ally_npcs'][0]);   // 시드 데이터(임밸런 편집)가 NPC를 더 넣을 수 있어 첫 항목만 고정
        $jeong = collect($row['ally_npcs'])->firstWhere('code', 'npc_jeong_un');
        $this->assertSame('jeong_un', $jeong['person'] ?? null);   // npc_X -> person X, 일반 NPC 는 non_hero 없음
        $this->assertArrayNotHasKey('non_hero', $jeong);
        $this->assertSame(['ally', 'enemy'], array_keys($row['factions']));
        $this->assertNotSame('', (string) $row['factions']['ally']);
        $this->assertNotEmpty($row['enemy_commander']['name']);
        $this->assertSame(['yi_sun_sin', false], [$row['required_heroes'][0]['code'], $row['required_heroes'][0]['owned']]);
        $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertStatus(422)->assertJsonPath('error.code', 'required_hero_missing')->assertJsonPath('error.missing_heroes.0.name', '이순신');
    }

    public function test_NPC_사망은_패배가_아니고_must_survive면_패배이며_all_alive에서_제외된다(): void
    {
        [$h] = $this->guest();
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $pos = $b->json('deployment.default_positions');
        $ids = array_column($b->json('deployment.forced'), 'user_hero_id');
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => array_map(fn ($i) => ['user_hero_id' => $i, 'x' => $pos[$i]['x'], 'y' => $pos[$i]['y']], $ids)])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
        $svc = app(\App\Services\BattleService::class);
        $battle = \App\Models\Battle::findOrFail($id);
        $kill = function (array $state, bool $must) use ($svc) {
            $state['units']['n0']['hp'] = 0;
            $must && $state['units']['n0']['must_survive'] = true;
            $m = new \ReflectionMethod(\App\Game\Engine::class, 'resolveDeath');
            $m->setAccessible(true);
            $ev = [];
            $eng = (new \ReflectionMethod($svc, 'engine'));
            $eng->setAccessible(true);
            $m->invokeArgs($eng->invoke($svc), [&$state, 'n0', 'b0', &$ev]);

            return $state;
        };
        $this->assertSame('active', $kill($battle->state, false)['status']);                       // 기본: 사망해도 패배 아님
        $dead = $kill($battle->state, true);
        $this->assertSame(['finished', 'b'], [$dead['status'], $dead['winner']]);                  // must_survive: 사망 즉시 패배
        $battle->state = $kill($battle->state, false);                                             // NPC 사망 후에도 all_alive 충족(NPC 제외)
        $r = new \ReflectionMethod($svc, 'starsFromConditions');
        $r->setAccessible(true);
        $this->assertTrue($r->invoke($svc, $battle, [['type' => 'all_alive']])[1][0]['met']);
    }

    public function test_교대_행동_모드에서_NPC는_부대_순서에서_제외되어_진행을_막지_않고_activate는_403이다(): void
    {
        config(['game.rules.alternate_activation' => true, 'game.rules.squad' => true, 'game.rules.alt_implicit_activate' => false]);
        [$h] = $this->guest();
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $pos = $b->json('deployment.default_positions');
        $ids = array_column($b->json('deployment.forced'), 'user_hero_id');
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => array_map(fn ($i) => ['user_hero_id' => $i, 'x' => $pos[$i]['x'], 'y' => $pos[$i]['y']], $ids)])->assertOk();
        $v = $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.alternate', true)->json('battle');
        $this->assertNotContains('n0', array_column($v['alt']['squads'], 'id'));   // NPC 부대는 교대 순서에 없다
        $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'activate', 'squad_id' => 'n0'])->assertStatus(403)->assertJsonPath('error.code', 'npc_ally_uncontrollable');
        // 플레이어 부대만 소진하면 라운드가 넘어간다(NPC가 막지 않음)
        $res = null;
        for ($i = 0; $i < 40; $i++) {
            $cur = $res ? $res->json('battle') : $v;
            if ($cur['status'] !== 'in_progress' || $cur['round'] >= 2) {
                break;
            }
            $ready = collect($cur['alt']['squads'])->first(fn ($s) => $s['side'] === 'a' && $s['status'] === 'ready');
            $this->assertNotNull($ready);
            $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'activate', 'squad_id' => $ready['id']])->assertOk();
            $res = $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'end_activation'])->assertOk();
        }
        $this->assertNotNull($res);
        $this->assertTrue($res->json('battle.status') !== 'in_progress' || $res->json('battle.round') >= 2);
    }

    public function test_가입시_이순신과_C급1명이_지급되고_ch1_s1에_입장할_수_있다(): void
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'keyhero'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $codes = DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_id', $r->json('user.id'))->orderBy('user_heroes.id')->get(['heroes.code', 'heroes.rarity']);
        $this->assertSame(['yi_sun_sin', 'C'], [$codes[0]->code, $codes[1]->rarity]);
        $this->assertCount(2, $codes);
        $stages = $this->withHeaders($h)->getJson('/api/stages')->assertOk()->json('stages');
        $this->assertTrue($stages[0]['hero_ready']);   // 충족 시나리오(서가) 상단
        $this->assertArrayHasKey('sort_order', $stages[0]);
        $ch = array_values(array_filter($stages, fn ($x) => $x['chapter'] === $stages[0]['chapter']));
        $so = array_column($ch, 'sort_order');
        $sorted = $so;
        sort($sorted);
        $this->assertSame($sorted, $so);   // 서가 안 순서는 sort_order 유지
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();
    }
}
