<?php

namespace Tests\Concerns;

/**
 * 규칙 A(출전 시 주인공 필수, 스테이지 forced_heroes): 테스트가 지정한 배치에 스테이지 필수 영웅(주인공 포함)을 맨 앞에 덧붙여 제출한다.
 * 필수 영웅 칸은 배치 구역에서 테스트 지정 칸과 겹치지 않는 첫 빈 칸을 쓴다. 필수 영웅이 이미 placements 에 있으면 그대로 둔다.
 */
trait PlacesForcedHeroes
{
    protected function forcedPlacementsFor(array $headers, int $battleId, array $placements): array
    {
        $dep = $this->withHeaders($headers)->getJson("/api/battles/$battleId/deployment")->assertOk()->json();
        $have = array_column($placements, 'user_hero_id');
        $used = array_map(fn ($p) => ($p['x'] ?? null).','.($p['y'] ?? null), $placements);
        $forced = [];
        foreach ($dep['forced'] ?? [] as $f) {
            if ($f['user_hero_id'] === null || in_array($f['user_hero_id'], $have, true)) {
                continue;
            }
            foreach ($dep['deploy_zone'] as [$x, $y]) {
                if (! in_array("$x,$y", $used, true)) {
                    $used[] = "$x,$y";
                    $forced[] = ['user_hero_id' => (int) $f['user_hero_id'], 'x' => $x, 'y' => $y];
                    break;
                }
            }
        }

        return array_merge($forced, $placements);
    }

    /** 필수 영웅을 덧붙여 PUT /deployment. TestResponse 를 반환하므로 기존 assert 체인을 그대로 이어 쓴다. */
    protected function putDeployment(array $headers, int $battleId, array $placements)
    {
        return $this->withHeaders($headers)->putJson("/api/battles/$battleId/deployment", ['placements' => $this->forcedPlacementsFor($headers, $battleId, $placements)]);
    }
}
