<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** MP 방식: 스테이지 전투 뷰(본인 영웅 MP 수치, 적 영웅은 mp_pct만) + 켜지 않으면 레거시. */
class MpSkillApiTest extends TestCase
{
    use RefreshDatabase;

    private function challenge(bool $mp): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        config(['game.rules.alternate_activation' => false, 'game.rules.mp_skills' => $mp]);
        $r = $this->postJson('/api/guests', ['nickname' => 'mpapi'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $res = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated();

        $id = (int) $res->json('battle.battle_id');
        $placements = [];
        foreach ((array) $res->json('deployment.default_positions') as $uh => $p) {
            $placements[] = ['user_hero_id' => (int) $uh, 'x' => $p['x'], 'y' => $p['y']];
        }
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();

        return [$h, $id, $res];
    }

    public function test_MP_방식_전투는_본인_영웅만_MP_수치를_보고_적은_mp_pct만_본다(): void
    {
        [$h, $id, $res] = $this->challenge(true);
        $this->assertTrue($res->json('battle.mp_mode'));
        $units = collect($this->withHeaders($h)->getJson("/api/battles/$id")->json('battle.units'));
        $withMp = $units->filter(fn ($u) => isset($u['mp_pct']));
        $this->assertNotEmpty($withMp);
        foreach ($withMp as $u) {
            if ($u['side'] === 'b') {
                $this->assertArrayNotHasKey('mp', $u);
                $this->assertArrayNotHasKey('mp_max', $u);
                $this->assertSame(50, $u['mp_pct']);
            }
        }
        $this->assertSame('a', $withMp->first()['side']);
        $this->assertArrayHasKey('mp', $withMp->first());   // 본인(a) 영웅은 수치 공개
    }

    public function test_mp_skills_off면_레거시_전투로_생성된다(): void
    {
        [$h, $id, $res] = $this->challenge(false);
        $this->assertFalse($res->json('battle.mp_mode'));
        foreach ($this->withHeaders($h)->getJson("/api/battles/$id")->json('battle.units') as $u) {
            $this->assertArrayNotHasKey('mp_pct', $u);
        }
    }
}
