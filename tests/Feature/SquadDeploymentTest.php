<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class SquadDeploymentTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;

    public function test_배치_화면에서_부대_위치를_지정하고_검증하며_확정하면_영웅별_leader_id가_부여된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        config(['game.rules.squad' => true]);
        $r = $this->postJson('/api/guests', ['nickname' => 'deploy'])->assertCreated();
        $this->givePartyHeroes((int) $r->json('user.id'));   // 오라가 있는 영웅 기준 검증(C급 시작 영웅은 오라가 없을 수 있음)
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $sid = DB::table('stages')->orderBy('sort_order')->value('id');
        $ch = $this->withHeaders($h)->postJson("/api/stages/$sid/challenge")->assertCreated();
        $bid = $ch->json('battle.battle_id');
        $info = $ch->json('deployment');
        $this->assertTrue($info['squad']);
        $this->assertSame(3, $info['troop_place_radius']);
        $this->assertNotNull($info['map_code']);
        $this->assertArrayHasKey('biome', $info);
        $this->assertNotEmpty($info['stage_name']);
        $this->assertGreaterThan(0, $info['recommended_level']);
        $this->assertNotEmpty($info['candidates'][0]['detail']['aura']['name']);
        $this->assertArrayHasKey('hp', $info['candidates'][0]['detail']['stats']);
        $uh = $info['default_party'][0];
        $f = $info['formation'][$uh];
        $this->assertSame(2, $f['slots']);                                   // Lv1 슬롯 2기
        $this->assertCount(2, $f['troops']);
        $class = $f['troops'][0]['class'];
        $put = fn (array $troops) => $this->withHeaders($h)->putJson("/api/battles/$bid/deployment", ['placements' => [['user_hero_id' => $uh, 'x' => 1, 'y' => 3, 'troops' => $troops]]]);
        $put([['class' => $class, 'x' => 0, 'y' => 7]])->assertStatus(422)->assertJsonPath('error.code', 'troop_too_far');
        $put([['class' => 'dragon', 'x' => 1, 'y' => 4]])->assertOk();                                                          // 고정 병종 규칙: 클라이언트 class는 무시, 서버 병종 사용(오류 없음)
        $put([['class' => $class, 'x' => 1, 'y' => 4], ['class' => $class, 'x' => 2, 'y' => 4], ['class' => $class, 'x' => 2, 'y' => 5]])->assertStatus(422)->assertJsonPath('error.code', 'troop_class_mismatch');   // 슬롯(2기) 초과 위치 지정
        $put([['class' => $class, 'x' => 5, 'y' => 3]])->assertStatus(422)->assertJsonPath('error.code', 'outside_deploy_zone');
        $put([['class' => $class, 'x' => 1, 'y' => 3]])->assertStatus(422)->assertJsonPath('error.code', 'tile_occupied');   // 영웅 자리
        $put([['class' => $class, 'x' => 1, 'y' => 4]])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$bid/confirm")->assertOk();
        $units = DB::table('battles')->where('id', $bid)->first()->state;
        $units = json_decode($units, true)['units'];
        $at = collect($units)->first(fn ($u) => $u['side'] === 'a' && $u['x'] === 1 && $u['y'] === 4);
        $this->assertSame('troop', $at['kind']);
        $this->assertSame($class, $at['type']);
        $this->assertSame('a0', $at['leader_id']);                           // 지정 위치 부대는 영웅 소속
        $this->assertSame(2, collect($units)->where('side', 'a')->where('kind', 'troop')->count());   // 나머지 1기는 자동 배치
    }

    public function test_배치_응답의_submitted_복원과_default_troop_positions가_실제_자동_배치와_일치한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        config(['game.rules.squad' => true]);
        $h = ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => 'dtp'])->assertCreated()->json('guest_token')];
        $sid = DB::table('stages')->orderBy('sort_order')->value('id');
        $info = $this->withHeaders($h)->postJson("/api/stages/$sid/challenge")->assertCreated()->json('deployment');
        $bid = DB::table('battles')->orderByDesc('id')->value('id');
        $uh = $info['default_party'][0];
        $pred = $info['default_troop_positions'][$uh];
        $this->assertCount(2, $pred);
        $this->assertNull($info['submitted']);
        $hero = $info['default_positions'][$uh];
        $placements = [['user_hero_id' => $uh, 'x' => $hero['x'], 'y' => $hero['y']]];
        $this->withHeaders($h)->putJson("/api/battles/$bid/deployment", ['placements' => $placements])->assertOk();
        $this->assertSame($placements, $this->withHeaders($h)->getJson("/api/battles/$bid/deployment")->json('submitted'));
        $this->withHeaders($h)->postJson("/api/battles/$bid/confirm")->assertOk();
        $units = json_decode(DB::table('battles')->where('id', $bid)->first()->state, true)['units'];
        $actual = collect($units)->where('side', 'a')->where('kind', 'troop')->map(fn ($u) => ['x' => $u['x'], 'y' => $u['y']])->values()->all();
        $this->assertEqualsCanonicalizing($pred, $actual);
    }
}
