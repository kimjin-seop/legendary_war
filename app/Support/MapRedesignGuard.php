<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * 맵 개편(2차 지형 재설계 등, game:apply-map-patch 로 적용) 보호.
 * DB maps.meta 에 `redesign` 키가 있는 행은 시드 JSON(maps_*.json 등)이 tiles·meta·spawns·deploy_zones 를 되돌리지 못하게 한다.
 * 맵 행을 upsert/update 하는 모든 시드(game:seed --force, seed-imjin10, seed-map-pack, seed-main --update)가 이 헬퍼를 거친다.
 * 개편 맵을 의도적으로 되돌리려면 meta.redesign 을 먼저 제거(어드민/패치)해야 한다.
 */
class MapRedesignGuard
{
    /** @return array<int,string> 주어진 code 중 DB 에 개편 표식(meta.redesign)이 있는 것 */
    public static function protectedCodes(array $codes): array
    {
        if ($codes === []) {
            return [];
        }
        $out = [];
        foreach (DB::table('maps')->whereIn('code', $codes)->pluck('meta', 'code') as $code => $meta) {
            if (self::isRedesigned($meta)) {
                $out[] = (string) $code;
            }
        }

        return $out;
    }

    public static function isRedesigned(mixed $meta): bool
    {
        $m = is_array($meta) ? $meta : (json_decode((string) $meta, true) ?: []);

        return ! empty($m['redesign']);
    }

    /**
     * maps upsert(키 code). 개편된 행은 건너뛰고 그 code 목록을 반환한다.
     *
     * @param  array<int,array<string,mixed>>  $rows
     * @param  array<int,string>  $updateCols
     * @return array<int,string> 보호되어 건너뛴 code
     */
    public static function upsert(array $rows, array $updateCols): array
    {
        $skip = self::protectedCodes(array_column($rows, 'code'));
        $rows = array_values(array_filter($rows, fn ($r) => ! in_array($r['code'], $skip, true)));
        $rows !== [] && DB::table('maps')->upsert($rows, ['code'], $updateCols);

        return $skip;
    }
}
