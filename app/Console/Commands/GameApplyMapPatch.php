<?php

namespace App\Console\Commands;

use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 기존 maps 행(code 유지)에 맵 패치 JSON을 갱신 적용한다. 기본은 dry-run, --apply 명시 시에만 쓴다.
 * 패치 형식: {"items":[{"code","tiles","spawns"?,"deploy_zones"?,"name"?,"biome"?,"meta"?:{...},
 *   "tile_layer"?,"props"?,"painted_bg"?,"culture"?,"decor"?,"village_style"?}]}  (생략한 spawns/deploy_zones/meta 키는 기존 값 유지, meta는 키 단위 병합)
 * 맵별 반영 조건: 존재하는 code, MapChecker ERROR·WARN 없음(strict), tile_layer 크기 일치, painted_bg 경로 검증,
 * 이 맵을 참조하는 스테이지(objective·triggers 등)와 meta(objective_points·enemy_zones 등)의 좌표가 새 크기 안.
 * 탈락한 맵은 건너뛰고 종료 코드 1. 적용 전 대상 행을 storage/app/map_patch_backup/ 에 JSON 백업.
 */
class GameApplyMapPatch extends Command
{
    protected $signature = 'game:apply-map-patch {--path= : database/data 하위 패치 파일명(.json, basename만)} {--apply : 실제로 쓴다(없으면 dry-run)} {--allow-existing-warn : 시각 키만 바꾸고 map core 불변이면 기존 WARN 허용(새 WARN/ERROR 는 거부)}';

    protected $description = '맵 패치 JSON을 기존 code의 maps 행에 갱신(기본 dry-run, --apply 시 백업 후 쓰기)';

    /** 좌표 쌍([x,y])으로 해석하는 키 */
    private const PAIR_KEYS = ['cell', 'cells', 'at', 'pos', 'position', 'tile', 'tiles', 'point', 'points', 'zone', 'zones', 'path', 'target', 'from', 'to', 'center', 'gates'];

    public const STAGE_COLS = ['objective', 'triggers', 'enemy_squad', 'star_conditions', 'enemy_extra_troops', 'rules', 'forced_heroes'];

    public function handle(): int
    {
        if (! Schema::hasColumn('maps', 'meta')) {
            $this->error('maps.meta 컬럼이 없습니다.');

            return self::FAILURE;
        }
        $file = (string) $this->option('path');
        if ($file === '' || $file !== basename($file) || ! str_ends_with($file, '.json')) {
            $this->error('--path 는 database/data 하위 .json 파일명(basename)이어야 합니다.');

            return self::FAILURE;
        }
        $full = database_path('data/'.$file);
        if (! is_file($full)) {
            $this->error("파일이 없습니다: data/{$file}");

            return self::FAILURE;
        }
        $items = json_decode(file_get_contents($full), true, 512, JSON_THROW_ON_ERROR)['items'] ?? [];
        $apply = (bool) $this->option('apply');
        $topBase = json_decode(file_get_contents($full), true)['_base_tiles_md5'] ?? null;   // 항목이 1개일 때 파일 최상위 값도 인정
        $checker = new MapChecker((new GameData)->rules());
        $good = [];
        $skipped = 0;
        foreach ($items as $p) {
            $code = (string) ($p['code'] ?? '');
            $errs = [];
            $old = DB::table('maps')->where('code', $code)->first();
            if (! $old) {
                $this->error("[{$code}] 기존 맵 없음(신규 삽입은 이 명령 대상 아님)");
                ++$skipped;

                continue;
            }
            // 적용 전 tiles 가 패치 작성 시점과 같은지(md5 = tiles 행 문자열 이어붙임) 확인. 키가 없으면 검사하지 않는다.
            $baseMd5 = $p['_base_tiles_md5'] ?? (count($items) === 1 ? $topBase : null);
            if ($baseMd5 !== null) {
                $curMd5 = md5(implode('', (array) json_decode((string) $old->tiles, true)));
                $curMd5 !== $baseMd5 && $errs[] = "_base_tiles_md5 불일치: 패치 기준 {$baseMd5} / 현재 DB {$curMd5} (패치 작성 후 맵이 바뀜)";
            }
            $tiles = $p['tiles'] ?? json_decode($old->tiles, true);
            $spawns = $p['spawns'] ?? json_decode($old->spawns, true);
            $zones = $p['deploy_zones'] ?? json_decode($old->deploy_zones, true);
            $meta = json_decode((string) $old->meta, true) ?: [];
            foreach (['decor', 'village_style', 'tile_layer', 'props', 'painted_bg', 'culture', 'gates', 'castle_render', 'ground_tone', 'wall_style', 'pier_style'] as $k) {
                isset($p[$k]) && $meta[$k] = $p[$k];
            }
            foreach ((array) ($p['meta'] ?? []) as $k => $v) {
                $meta[$k] = $v;   // known_isolated(의도된 닫힌 성·책 칸 [[x,y],..]) 도 여기서 병합되어 MapChecker 예외로 쓰인다
            }
            if ($errs) {
                // md5 불일치: 아래 검증은 생략하고 탈락 처리
            } elseif (! is_array($tiles) || $tiles === [] || ! is_string($tiles[0] ?? null)) {
                $errs[] = 'tiles 형식 오류';
            } else {
                $w = mb_strlen($tiles[0]);
                $h = count($tiles);
                // --allow-existing-warn: 시각 키만 바꾸고 map core 불변일 때, 기존에 있던 WARN 은 허용(새 WARN/ERROR 는 거부)
                $oldWarns = null;
                if ($this->option('allow-existing-warn')) {
                    $why = self::visualOnlyViolations($p, $old, $tiles, $spawns, $zones);
                    foreach ($why as $m) {
                        $errs[] = "--allow-existing-warn 조건 위반: {$m}";
                    }
                    if (! $why) {
                        $oldMeta = json_decode((string) $old->meta, true) ?: [];
                        $oldWarns = [];
                        foreach ($checker->check(['code' => $code, 'width' => (int) $old->width, 'height' => (int) $old->height, 'tiles' => json_decode($old->tiles, true), 'spawns' => json_decode($old->spawns, true), 'deploy_zones' => json_decode($old->deploy_zones, true), 'known_isolated' => $oldMeta['known_isolated'] ?? []]) as $r) {
                            $r[1] === 'WARN' && $oldWarns["{$r[0]}: {$r[2]}"] = true;
                        }
                    }
                }
                foreach ($checker->check(['code' => $code, 'width' => $w, 'height' => $h, 'tiles' => $tiles, 'spawns' => $spawns, 'deploy_zones' => $zones, 'known_isolated' => $meta['known_isolated'] ?? []]) as $r) {
                    if (in_array($r[1], ['OK', 'INFO'], true)) {
                        continue;
                    }
                    if ($r[1] === 'WARN' && $oldWarns !== null && isset($oldWarns["{$r[0]}: {$r[2]}"])) {
                        continue;   // 기존 WARN 허용
                    }
                    $errs[] = "MapChecker {$r[1]} {$r[0]}: {$r[2]}".($oldWarns !== null ? ' (기존에 없던 항목)' : '');
                }
            }
            if (! $errs) {
                if (! empty($meta['tile_layer']) && ! GameData::tileLayerFits($meta['tile_layer'], [$w, $h])) {
                    $errs[] = "tile_layer rows 크기가 tiles({$w}x{$h})와 다름";
                }
                // 시각 필드는 서버 노출 검증(GameData::artExtras)을 통과해야 한다(통과 못 하면 응답에서 조용히 사라지므로 패치 단계에서 거부)
                $exposed = GameData::artExtras($meta);
                foreach (['props', 'painted_bg', 'culture', 'gates', 'castle_render', 'ground_tone', 'wall_style', 'pier_style'] as $k) {
                    ! empty($meta[$k]) && ! array_key_exists($k, $exposed) && $errs[] = "meta.{$k} 검증 실패(서버 노출 규칙 위반)";
                }
                // 좌표 참조 검증: meta 와 이 맵을 쓰는 스테이지
                $refs = [];
                foreach (['objective_points', 'enemy_zones', 'enemy_extra_zones', 'tile_tags', 'gates'] as $k) {
                    isset($meta[$k]) && $refs["meta.{$k}"] = [$k => $meta[$k]];   // 키 이름 아래에서 [x,y] 쌍으로 해석되도록 감쌈
                }
                foreach (DB::table('stages')->where('map_id', $old->id)->get() as $s) {
                    foreach (self::STAGE_COLS as $c) {
                        if (isset($s->$c) && ($d = json_decode((string) $s->$c, true))) {
                            $refs["stage {$s->code}.{$c}"] = $d;
                        }
                    }
                }
                foreach ($refs as $label => $d) {
                    foreach (self::points($d) as [$x, $y]) {
                        if ($x < 0 || $y < 0 || $x >= $w || $y >= $h) {
                            $errs[] = "{$label}: 좌표 ({$x},{$y}) 가 {$w}x{$h} 밖";
                        }
                    }
                }
            }
            if ($errs) {
                ++$skipped;
                foreach (array_slice($errs, 0, 20) as $e) {
                    $this->error("[{$code}] {$e}");
                }

                continue;
            }
            $metaJson = json_encode($meta, JSON_UNESCAPED_UNICODE);
            $this->line(sprintf('  OK %-28s %2dx%-2d (기존 %dx%d) meta %d bytes', $code, $w, $h, $old->width, $old->height, strlen($metaJson)));
            $good[$code] = ['old' => $old, 'row' => [
                'name' => $p['name'] ?? $old->name, 'width' => $w, 'height' => $h, 'tiles' => json_encode($tiles),
                'spawns' => json_encode($spawns), 'deploy_zones' => json_encode($zones), 'biome' => $p['biome'] ?? $old->biome,
                'meta' => $metaJson, 'updated_at' => now(),
            ]];
        }
        $this->info(sprintf('[%s] 통과 %d / 탈락 %d%s', $file, count($good), $skipped, $apply ? '' : ' (dry-run: 쓰지 않음, --apply 로 반영)'));
        if ($apply && $good) {
            $dir = storage_path('app/map_patch_backup');
            is_dir($dir) || mkdir($dir, 0775, true);
            $bak = $dir.'/maps_'.now()->format('Ymd_His').'_'.pathinfo($file, PATHINFO_FILENAME).'.json';
            file_put_contents($bak, json_encode(array_map(fn ($g) => (array) $g['old'], array_values($good)), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            $this->info('백업: '.$bak);
            DB::transaction(function () use ($good) {
                foreach ($good as $code => $g) {
                    DB::table('maps')->where('code', $code)->update($g['row']);
                    Cache::forget('map_preview:'.$code);
                }
            });
            $this->info(count($good).'행 갱신 완료');
        }

        return $skipped > 0 ? self::FAILURE : self::SUCCESS;
    }

    /** --allow-existing-warn 에서 패치에 허용되는 시각 키(최상위·meta 공통) */
    public const VISUAL_KEYS = ['decor', 'village_style', 'tile_layer', 'props', 'painted_bg', 'culture', 'gates', 'castle_render', 'ground_tone', 'wall_style', 'pier_style', 'redesign', 'kit'];

    /**
     * 패치가 게임플레이 키를 건드리는지 검사한다. tiles·spawns·deploy_zones 는 기존 값과 동일하면 통과.
     *
     * @return array<int,string> 위반 사유(비면 시각 전용 패치)
     */
    public static function visualOnlyViolations(array $p, object $old, mixed $tiles, mixed $spawns, mixed $zones): array
    {
        $out = [];
        $topOk = array_merge(self::VISUAL_KEYS, ['code', 'meta', 'tiles', 'spawns', 'deploy_zones', 'name', 'biome', '_base_tiles_md5', '_note']);
        foreach (array_keys($p) as $k) {
            in_array($k, $topOk, true) || $out[] = "허용되지 않은 패치 키 '{$k}'";
        }
        foreach ((array) ($p['meta'] ?? []) as $k => $v) {
            in_array($k, self::VISUAL_KEYS, true) || $out[] = "허용되지 않은 meta 키 '{$k}'";
        }
        isset($p['name']) && $p['name'] !== $old->name && $out[] = 'name 변경';
        isset($p['biome']) && $p['biome'] !== $old->biome && $out[] = 'biome 변경';
        md5(json_encode($tiles)) !== md5(json_encode(json_decode($old->tiles, true))) && $out[] = 'tiles(map core) 변경';
        $spawns != json_decode($old->spawns, true) && $out[] = 'spawns 변경';
        $zones != json_decode($old->deploy_zones, true) && $out[] = 'deploy_zones 변경';

        return $out;
    }

    /** @return array<int,array{0:int,1:int}> 구조 안의 좌표들: {x,y} 연관 배열, 또는 PAIR_KEYS 아래 [x,y](들) */
    public static function points(mixed $d, bool $pairCtx = false): array
    {
        if (! is_array($d)) {
            return [];
        }
        $out = [];
        if (isset($d['x'], $d['y']) && is_numeric($d['x']) && is_numeric($d['y'])) {
            $out[] = [(int) $d['x'], (int) $d['y']];
        } elseif ($pairCtx && count($d) === 2 && array_is_list($d) && is_int($d[0]) && is_int($d[1])) {
            return [[$d[0], $d[1]]];
        }
        foreach ($d as $k => $v) {
            array_push($out, ...self::points($v, $pairCtx || (is_string($k) && in_array($k, self::PAIR_KEYS, true))));
        }

        return $out;
    }
}
