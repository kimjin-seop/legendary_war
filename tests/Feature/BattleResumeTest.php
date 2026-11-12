<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 중간 저장(이어하기): 행동 후 이탈 -> /battles/active 조회 -> GET /battles/{id} 가 같은 상태 복원. 포기하면 목록에서 사라진다. */
class BattleResumeTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\PlacesForcedHeroes;
    use \Tests\Concerns\StripsDeploySlots;

    public function test_진행_전투가_active에_나오고_재조회_상태가_동일하다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        $r = $this->postJson('/api/guests', ['nickname' => 'resume'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $stage = DB::table('stages')->orderBy('sort_order')->value('id');
        $d = $this->withHeaders($h)->postJson("/api/stages/{$stage}/challenge")->assertCreated()->json('deployment');
        $id = $d['battle_id'];

        $this->withHeaders($h)->getJson('/api/battles/active')->assertOk()->assertJsonPath('battles.0.battle_id', $id)->assertJsonPath('battles.0.status', 'deployment');

        $zone = array_values($d['deploy_zone']);
        $mine = DB::table('user_heroes')->where('user_id', $r->json('user.id'))->orderBy('id')->pluck('id')->map(fn ($v) => (int) $v)->all();
        $pl = [];
        foreach (array_reverse($mine) as $i => $uh) {
            $pl[] = ['user_hero_id' => $uh, 'x' => $zone[$i][0], 'y' => $zone[$i][1]];
        }
        $this->putDeployment($h, $id, $pl)->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/{$id}/confirm")->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/{$id}/actions", ['type' => 'end_turn'])->assertOk();

        $this->withHeaders($h)->getJson('/api/battles/active')->assertOk()->assertJsonPath('battles.0.status', 'in_progress');
        $a = $this->withHeaders($h)->getJson("/api/battles/{$id}")->assertOk()->json('battle');
        $b = $this->withHeaders($h)->getJson("/api/battles/{$id}")->assertOk()->json('battle');
        unset($a['server_time'], $b['server_time']);
        $this->assertSame($a, $b);
        $this->assertSame('in_progress', $a['status']);

        $this->withHeaders($h)->postJson("/api/battles/{$id}/abandon")->assertOk();
        $this->assertSame([], $this->withHeaders($h)->getJson('/api/battles/active')->json('battles'));
    }
}
