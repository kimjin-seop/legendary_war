<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    //
    /** 기본(첫) 맵에서 해당 진영 배치 영역의 평지('p') 칸 2개(맵 데이터가 바뀌어도 테스트가 따라가도록) @return array<int,array{0:int,1:int}> */
    protected function zoneCoords(string $side): array
    {
        $m = \Illuminate\Support\Facades\DB::table('maps')->orderBy('id')->first();
        $tiles = json_decode($m->tiles, true);
        $out = [];
        foreach (json_decode($m->deploy_zones, true)[$side] as [$x, $y]) {
            if (($tiles[$y][$x] ?? '') === 'p' && count($out) < 2) {
                $out[] = [$x, $y];
            }
        }

        return $out;
    }
}
