<?php

namespace Tests;

use Illuminate\Foundation\Testing\TestCase as BaseTestCase;

abstract class TestCase extends BaseTestCase
{
    /** 시작 영웅이 C급 무작위로 바뀌었으므로(2026-11-14), 역사 시나리오(ch1) 필수 영웅 이순신·곽재우가 필요한 테스트용: 해당 유저의 보유/편성을 이순신(1)·곽재우(2)로 교체 */
    protected function givePartyHeroes(int $uid, array $codes = ['yi_sun_sin', 'gwak_jae_u']): void
    {
        \Illuminate\Support\Facades\DB::table('parties')->where('user_id', $uid)->delete();
        \Illuminate\Support\Facades\DB::table('user_heroes')->where('user_id', $uid)->delete();
        foreach ($codes as $i => $code) {
            $uh = \Illuminate\Support\Facades\DB::table('user_heroes')->insertGetId(['user_id' => $uid, 'hero_id' => \Illuminate\Support\Facades\DB::table('heroes')->where('code', $code)->value('id'), 'level' => 1, 'exp' => 0, 'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
            \Illuminate\Support\Facades\DB::table('parties')->insert(['user_id' => $uid, 'slot' => $i + 1, 'user_hero_id' => $uh, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

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
