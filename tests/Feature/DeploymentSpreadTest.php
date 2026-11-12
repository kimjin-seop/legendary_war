<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 기본 배치 분산(모서리 군집 방지)과 교대 행동 활성화 전 이동 미리보기(preview_tiles). */
class DeploymentSpreadTest extends TestCase
{
    use RefreshDatabase;
    use \Tests\Concerns\StripsDeploySlots;

    private function start(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->stripDeploySlots();
        config(['game.rules.alternate_activation' => true, 'game.rules.squad' => true, 'game.rules.alt_implicit_activate' => false]);
        $r = $this->postJson('/api/guests', ['nickname' => 'spread'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $ch = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated();

        return [$h, $ch->json('battle.battle_id'), $ch->json('deployment')];
    }

    public function test_default_positions는_영웅을_서로_다른_칸에_분산하고_모서리_군집을_피한다(): void
    {
        [, , $dep] = $this->start();
        $pos = (array) $dep['default_positions'];
        $this->assertCount(count($dep['default_party']), $pos);
        $zone = array_map(fn ($c) => "{$c[0]},{$c[1]}", $dep['deploy_zone']);
        $cells = [];
        foreach ($pos as $id => $p) {
            $this->assertContains("{$p['x']},{$p['y']}", $zone);
            $cells["{$p['x']},{$p['y']}"] = true;
        }
        $this->assertCount(count($pos), $cells);                       // 중복 없음
        $ys = array_unique(array_column($pos, 'y'));
        $this->assertGreaterThan(1, count($ys));                       // 한 줄에 몰리지 않음
    }

    public function test_모서리에_몰아_제출해도_모든_아군이_이동_가능한_칸을_가지고_locked_moves가_미리보기를_준다(): void
    {
        [$h, $id, $dep] = $this->start();
        $party = $dep['default_party'];
        // 구 FE 방식: 영역 앞쪽 모서리에 영웅을 붙여서 제출
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => [
            ['user_hero_id' => $party[0], 'x' => 0, 'y' => 0], ['user_hero_id' => $party[1], 'x' => 1, 'y' => 0],
        ]])->assertOk();
        $v = $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->json('battle');
        $mine = array_values(array_filter($v['units'], fn ($u) => $u['side'] === 'a' && $u['hp'] > 0));
        $this->assertGreaterThanOrEqual(4, count($mine));
        foreach ($mine as $u) {
            $m = $this->withHeaders($h)->getJson("/api/battles/$id/units/{$u['id']}/moves")->assertOk();
            if ($m->json('locked')) {
                $this->assertSame([], $m->json('tiles'));                          // 기존 계약 유지
                $this->assertGreaterThan(1, count($m->json('preview_tiles')), "{$u['id']} 이동 가능 칸 없음");   // 현재 위치(cost 0) 외 1칸 이상
                $this->assertFalse($m->json('no_moves'));
            }
        }
        // 미리보기는 상태를 바꾸지 않는다
        $after = $this->withHeaders($h)->getJson("/api/battles/$id")->assertOk()->json();
        $this->assertNull($after['alt']['active_squad'] ?? null);
    }
}
