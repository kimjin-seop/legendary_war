<?php

namespace App\Console\Commands;

use App\Game\Engine;
use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 맵 프리셋 JSON(기본 maps_pack20.json, --path로 maps_pack20_v2.json)의 pk_·su_ 접두 맵 행만 갱신(upsert, code 기준):
 * tiles/배치 영역/스폰/biome/meta(decor·village_style·tile_layer 포함).
 * 기존 맵(pk_ 아님)·stages·heroes 등 다른 테이블은 건드리지 않는다. MapChecker ERROR가 있으면 아무것도 쓰지 않고 실패.
 */
class GameSeedMapPack extends Command
{
    /** --path 허용 파일명(basename, database/data 하위). 임의 경로 읽기 방지 */
    private const ALLOWED = ['maps_pack20.json', 'maps_pack20_v2.json', 'maps_scaleup_pilot.json', 'maps_scaleup_ch1.json', 'maps_scaleup_swap.json', 'maps_scaleup_late.json', 'maps_scaleup_batch2.json', 'maps_scaleup_batch3.json', 'maps_ch23_ch24.json', 'maps_ch12_redcliff.json', 'maps_ch13_hwangsanbeol.json', 'maps_ch16_orleans.json', 'maps_ch20_nagashino.json', 'maps_ch14_salsu.json', 'maps_ch11_goryeo_khitan.json', 'maps_ch17_gaugamela.json', 'maps_ch19_holy_land.json', 'maps_ch15_mediterranean.json', 'maps_ch999_finale.json', 'maps_culture_copies.json', 'maps_ch13_ext.json', 'maps_ch20_ext.json', 'maps_ch21_ext.json', 'maps_ch22_ext.json', 'maps_ext2_new.json', 'maps_ch25_bachdang.json', 'maps_ch26_caesar.json', 'maps_tutorial_v2.json', 'maps_overhaul_copies_shared.json'];

    protected $signature = 'game:seed-maps-pack {--dry-run : 검증만 하고 쓰지 않음} {--path=maps_pack20.json : database/data 하위 파일명(maps_pack20.json|maps_pack20_v2.json|maps_scaleup_{pilot,ch1,swap,late}.json)}';

    protected $description = '전장 프리셋(pk_*) 맵 행만 maps_pack20(.json|_v2.json) 값으로 갱신(다른 데이터 불변)';

    public function handle(): int
    {
        if (! Schema::hasColumn('maps', 'meta')) {
            $this->error('maps.meta 컬럼이 없습니다. 마이그레이션(2026_11_01_000600)을 먼저 적용하세요.');

            return self::FAILURE;
        }
        $file = (string) $this->option('path');
        if ($file !== basename($file) || ! in_array($file, self::ALLOWED, true)) {
            $this->error('허용되지 않는 --path: '.implode(' | ', self::ALLOWED).' 중 하나(파일명만)를 지정하세요.');

            return self::FAILURE;
        }
        $full = database_path('data/'.$file);
        if (! is_file($full)) {
            $this->error("파일이 없습니다: data/{$file}");

            return self::FAILURE;
        }
        $items = json_decode(file_get_contents($full), true, 512, JSON_THROW_ON_ERROR)['items'];
        $checker = new MapChecker((new GameData)->rules());
        $err = 0;
        $rows = [];
        $now = now();
        foreach ($items as $m) {
            // maps_culture_copies.json 은 기본 맵 복제(castle_01_eu 등 전쟁 지도용)도 담으므로 이 파일만 접두사 제한을 풀고 코드 형식(소문자·숫자·밑줄)만 검사한다
            $okCode = str_starts_with($m['code'], 'pk_') || str_starts_with($m['code'], 'su_') || ($file === 'maps_culture_copies.json' && preg_match('/^[a-z0-9_]{3,48}$/', $m['code']));
            if (! $okCode) {   // pk_=전장 프리셋, su_=확장 맵(maps_scaleup_*)
                $this->error("pk_/su_ 코드가 아닌 항목: {$m['code']}");

                return self::FAILURE;
            }
            $w = strlen($m['tiles'][0]);
            $h = count($m['tiles']);
            foreach ($checker->check(['code' => $m['code'], 'width' => $w, 'height' => $h, 'tiles' => $m['tiles'], 'spawns' => $m['spawns'], 'deploy_zones' => $m['deploy_zones']]) as $r) {
                $r[1] === 'ERROR' && ++$err && $this->error("[{$m['code']}] {$r[0]}: {$r[2]}");
            }
            $meta = $m['meta'] ?? null;
            foreach (['decor', 'village_style', 'tile_layer', 'props', 'painted_bg', 'culture'] as $k) {
                ! empty($m[$k]) && ($meta = ($meta ?? []) + [$k => $m[$k]]);
            }
            // tile_layer 크기가 tiles와 다르면 FE가 잘못 그리므로 ERROR(서버 판정은 tiles 기준)
            if (! empty($m['tile_layer']) && ! GameData::tileLayerFits($m['tile_layer'], [$w, $h])) {
                ++$err;
                $this->error("[{$m['code']}] tile_layer: rows 크기가 tiles({$w}x{$h})와 다름");
            }
            $metaJson = $meta === null ? null : json_encode($meta, JSON_UNESCAPED_UNICODE);
            $this->line(sprintf('  %-24s %2dx%-2d meta %6d bytes%s', $m['code'], $w, $h, strlen((string) $metaJson), empty($m['tile_layer']) ? '' : ' (tile_layer)'));
            $rows[] = ['code' => $m['code'], 'name' => $m['name'], 'width' => $w, 'height' => $h, 'tiles' => json_encode($m['tiles']),
                'spawns' => json_encode($m['spawns']), 'deploy_zones' => json_encode($m['deploy_zones']), 'biome' => $m['biome'] ?? null,
                'meta' => $metaJson, 'created_at' => $now, 'updated_at' => $now] + (isset($m['rules']) && is_array($m['rules']) ? ['rules' => json_encode(Engine::sanitizeMapRules($m['rules']) ?: null)] : []);
        }
        if (array_filter($rows, fn ($r) => array_key_exists('rules', $r)) !== []) {   // upsert 는 모든 행의 컬럼이 같아야 한다
            $rows = array_map(fn ($r) => $r + ['rules' => null], $rows);
        }
        $this->info(sprintf('[%s] 프리셋 %d종 검증: ERROR %d', $file, count($rows), $err));
        if ($err > 0) {
            return self::FAILURE;
        }
        if (! $this->option('dry-run')) {
            $kept = \App\Support\MapRedesignGuard::upsert($rows, array_merge(['name', 'width', 'height', 'tiles', 'spawns', 'deploy_zones', 'biome', 'meta', 'updated_at'], array_key_exists('rules', $rows[0] ?? []) ? ['rules'] : []));
            foreach ($kept as $c) {
                $this->warn("  {$c}: meta.redesign 개편 맵 -> 덮어쓰기 건너뜀(보호)");
            }
            $this->info('pk_/su_ '.(count($rows) - count($kept)).'행 갱신 완료'.($kept ? ' / 개편 보호 '.count($kept).'행' : ''));
        }

        return self::SUCCESS;
    }
}
