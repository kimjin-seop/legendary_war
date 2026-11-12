<?php

namespace App\Support;

use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * 확장 맵(su_*, database/data/maps_scaleup_{ch1,swap,late,batch2}.json) 보장: 스테이지 시드가 su_ 맵 코드를 참조하면
 * 먼저 game:seed-maps-pack 으로 맵 행을 upsert 한다(멱등, 호출한 시드의 트랜잭션 안에서 실행 -> dry-run 은 함께 롤백).
 */
final class ScaleUpMaps
{
    public const FILES = ['maps_scaleup_ch1.json', 'maps_scaleup_swap.json', 'maps_scaleup_late.json', 'maps_scaleup_batch2.json', 'maps_scaleup_batch3.json', 'maps_ch23_ch24.json', 'maps_ch12_redcliff.json', 'maps_ch13_hwangsanbeol.json', 'maps_ch16_orleans.json', 'maps_ch20_nagashino.json', 'maps_ch14_salsu.json', 'maps_ch11_goryeo_khitan.json', 'maps_ch17_gaugamela.json', 'maps_ch19_holy_land.json', 'maps_ch15_mediterranean.json', 'maps_ch999_finale.json', 'maps_culture_copies.json', 'maps_ch13_ext.json', 'maps_ch20_ext.json', 'maps_ch21_ext.json', 'maps_ch22_ext.json', 'maps_ext2_new.json', 'maps_ch25_bachdang.json', 'maps_ch26_caesar.json', 'maps_overhaul_copies_shared.json'];

    /**
     * @param  array<int,mixed>  $mapCodes  스테이지 항목의 map 코드들. su_ 코드가 DB maps 에 모두 있으면 아무것도 하지 않는다
     *                                      (재upsert 는 스테이지 시드가 병합해 둔 meta(enemy_extra_zones 등)를 덮어쓰기 때문)
     */
    public static function ensureFor(array $mapCodes): void
    {
        $su = array_values(array_unique(array_filter($mapCodes, fn ($c) => is_string($c) && str_starts_with($c, 'su_'))));
        if ($su === [] || DB::table('maps')->whereIn('code', $su)->count() === count($su)) {
            return;
        }
        foreach (self::FILES as $f) {
            if (! is_file(database_path('data/'.$f))) {   // 아직 산출되지 않은 맵 파일(maps_ch23_ch24.json)은 건너뜀
                continue;
            }
            Artisan::call('game:seed-maps-pack', ['--path' => $f]) === 0 || throw new \RuntimeException("확장 맵 시드 실패: {$f} (".trim(Artisan::output()).')');
        }
    }
}
