<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 영웅 동반 일반병(적 영웅·아군 NPC 영웅당 3기): 핵심 동작만. */
class HeroCompanionsTest extends TestCase
{
    use RefreshDatabase;

    public function test_적_영웅_동반병은_부족분만_채우고_이미_충족이면_무변경이며_예외_스테이지는_제외된다(): void
    {
        $sq = ['commander' => ['unit_type' => 'sword'], 'units' => ['sword'], 'squads' => [
            ['commander' => ['unit_type' => 'archer'], 'units' => ['archer', 'archer', 'archer']],
            ['commander' => ['unit_type' => 'cavalry', 'troop_type' => 'cavalry'], 'units' => []],
        ]];
        [$out, $rep] = ArmyBuilder::withEnemyCompanions($sq, ArmyBuilder::companionSettings('ch22_s1'));
        $this->assertSame([3, 3, 3], [count($out['units']), count($out['squads'][0]['units']), count($out['squads'][1]['units'])]);
        $this->assertSame(['sword', 'sword', 'sword'], $out['units']);
        $this->assertSame(5, $rep['added']);
        [$same] = ArmyBuilder::withEnemyCompanions($out, ArmyBuilder::companionSettings('ch22_s1'));
        $this->assertSame($out, $same);   // 멱등
        [$ex] = ArmyBuilder::withEnemyCompanions($sq, ArmyBuilder::companionSettings('ch1_s1'));   // 튜토리얼 예외
        $this->assertSame($sq, $ex);
    }

    public function test_스테이지_전투에서_아군_NPC_영웅도_일반병을_거느린다_예외_스테이지는_불변(): void
    {
        foreach (['game:seed', 'game:seed-ch1', 'game:seed-protagonist'] as $c) {
            $this->artisan($c)->assertSuccessful();
        }
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'comp'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        DB::table('stages')->update(['prerequisite_stage_id' => null]);   // 선행 잠금 해제
        $run = function (string $code) use ($h) {
            $s = DB::table('stages')->where('code', $code)->first();
            $b = $this->withHeaders($h)->postJson('/api/stages/'.$s->id.'/challenge')->assertCreated();
            $id = $b->json('battle.battle_id');
            $pos = $b->json('deployment.default_positions');
            $ids = array_column($b->json('deployment.forced'), 'user_hero_id');
            $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => array_map(fn ($i) => ['user_hero_id' => $i, 'x' => $pos[$i]['x'], 'y' => $pos[$i]['y']], $ids)])->assertOk();

            return collect($this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->json('battle.units'));
        };
        $u5 = $run('ch1_s5');
        $npcTroops = $u5->filter(fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && $u['kind'] === 'troop');
        $this->assertGreaterThanOrEqual(1, $npcTroops->count());
        $this->assertLessThanOrEqual(12, $npcTroops->count());   // NPC 4명 x 3
        $this->assertTrue($u5->where('side', 'b')->count() >= 8);   // ch1_s5 는 임밸런 명시 편성(8기, 보강 예외)
        $u1 = $run('ch1_s1');   // ch1_s1: 적 보강 예외(enemy 0), 아군 NPC 동반병은 곽재우 2 + 정운 2 + 원균 기본 3 = 7
        $this->assertSame(7, $u1->filter(fn ($u) => $u['side'] === 'a' && ! empty($u['npc_ally']) && $u['kind'] === 'troop')->count());
        config(['game.companions.enabled' => false]);
        $this->assertSame($run('ch1_s1')->where('side', 'b')->count(), $u1->where('side', 'b')->count());
    }
}
