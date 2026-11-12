<?php

namespace App\Console\Commands;

use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 공용 맵을 문화권별로 복제하고 지정 스테이지의 maps 참조(stages.map_id)만 새 맵으로 바꾼다.
 * 기본 dry-run, --apply 시 storage/app/map_patch_backup/ 에 (원본 맵 행 + 대상 스테이지의 기존 map_id) JSON 백업 후 트랜잭션으로 반영.
 * 거부: 원본 없음 / 새 code 중복·형식 불량 / 스테이지 없음 / 스테이지가 원본 맵을 쓰지 않음 / 대상 스테이지에 진행 중 전투(deployment·in_progress) /
 *       MapChecker ERROR·WARN(strict) / 스테이지 좌표가 맵 밖.
 * 복제 후 내용 변경은 game:apply-map-patch(새 code 대상)로 한다. 롤백: 백업의 stage map_id 로 되돌리고 새 맵 행 삭제.
 */
class GameCloneMap extends Command
{
    protected $signature = 'game:clone-map {--from= : 원본 맵 code} {--to= : 새 맵 code} {--stages= : map_id 를 새 맵으로 바꿀 스테이지 code(쉼표 구분)} {--name= : 새 맵 이름(생략 시 원본 이름)} {--apply : 실제로 쓴다(없으면 dry-run)}';

    protected $description = '맵 복제 + 지정 스테이지 map_id 교체(기본 dry-run, --apply 시 백업 후 쓰기)';

    public function handle(): int
    {
        $from = (string) $this->option('from');
        $to = (string) $this->option('to');
        $codes = array_values(array_unique(array_filter(array_map('trim', explode(',', (string) $this->option('stages'))))));
        $apply = (bool) $this->option('apply');
        $errs = [];

        if ($from === '' || $to === '' || $codes === []) {
            $this->error('--from, --to, --stages 는 모두 필요합니다.');

            return self::FAILURE;
        }
        ! preg_match('/^[a-z0-9_]{1,48}$/', $to) && $errs[] = '--to 는 소문자·숫자·_ 1~48자여야 합니다.';
        $from === $to && $errs[] = '--from 과 --to 가 같습니다.';
        $src = DB::table('maps')->where('code', $from)->first();
        $src || $errs[] = "원본 맵 없음: {$from}";
        DB::table('maps')->where('code', $to)->exists() && $errs[] = "새 맵 code 중복: {$to}";

        $stages = DB::table('stages')->whereIn('code', $codes)->get()->keyBy('code');
        foreach ($codes as $c) {
            if (! isset($stages[$c])) {
                $errs[] = "스테이지 없음: {$c}";
            } elseif ($src && (int) $stages[$c]->map_id !== (int) $src->id) {
                $errs[] = "스테이지 {$c} 는 맵 {$from} 을 쓰지 않음";
            }
        }
        if ($src && $stages->isNotEmpty()) {
            $n = DB::table('battles')->whereIn('stage_id', $stages->pluck('id'))->whereIn('status', ['deployment', 'in_progress'])->count();
            $n > 0 && $errs[] = "대상 스테이지에 진행 중 전투 {$n}건(deployment/in_progress): 종료 후 재시도";
        }

        if ($src && ! $errs) {
            $tiles = json_decode((string) $src->tiles, true);
            $w = mb_strlen((string) ($tiles[0] ?? ''));
            $h = is_array($tiles) ? count($tiles) : 0;
            $checker = new MapChecker((new GameData)->rules());
            foreach ($checker->check(['code' => $to, 'width' => $w, 'height' => $h, 'tiles' => $tiles, 'spawns' => json_decode((string) $src->spawns, true), 'deploy_zones' => json_decode((string) $src->deploy_zones, true)]) as $r) {
                ! in_array($r[1], ['OK', 'INFO'], true) &&$errs[] = "MapChecker {$r[1]} {$r[0]}: {$r[2]}";
            }
            $meta = json_decode((string) $src->meta, true) ?: [];
            $refs = [];
            foreach (['objective_points', 'enemy_zones', 'enemy_extra_zones', 'tile_tags', 'gates'] as $k) {
                isset($meta[$k]) && $refs["meta.{$k}"] = [$k => $meta[$k]];
            }
            foreach ($stages as $s) {
                foreach (GameApplyMapPatch::STAGE_COLS as $col) {
                    if (isset($s->$col) && ($d = json_decode((string) $s->$col, true))) {
                        $refs["stage {$s->code}.{$col}"] = $d;
                    }
                }
            }
            foreach ($refs as $label => $d) {
                foreach (GameApplyMapPatch::points($d) as [$x, $y]) {
                    ($x < 0 || $y < 0 || $x >= $w || $y >= $h) && $errs[] = "{$label}: 좌표 ({$x},{$y}) 가 {$w}x{$h} 밖";
                }
            }
        }

        if ($errs) {
            foreach (array_slice($errs, 0, 30) as $e) {
                $this->error($e);
            }

            return self::FAILURE;
        }

        $this->line(sprintf('  OK 복제 %s -> %s (%dx%d), 스테이지 %d개 map_id 교체: %s', $from, $to, $src->width, $src->height, count($codes), implode(',', $codes)));
        if (! $apply) {
            $this->info('dry-run: 쓰지 않음, --apply 로 반영');

            return self::SUCCESS;
        }

        $dir = storage_path('app/map_patch_backup');
        is_dir($dir) || mkdir($dir, 0775, true);
        $bak = $dir.'/clone_'.now()->format('Ymd_His').'_'.$to.'.json';
        file_put_contents($bak, json_encode([
            'from' => (array) $src, 'to' => $to,
            'stages_prev_map_id' => $stages->map(fn ($s) => ['id' => $s->id, 'map_id' => $s->map_id])->all(),
        ], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        $this->info('백업: '.$bak);

        DB::transaction(function () use ($src, $to, $stages) {
            $row = (array) $src;
            unset($row['id']);
            $row['code'] = $to;
            ($n = (string) $this->option('name')) !== '' && $row['name'] = $n;
            $row['created_at'] = $row['updated_at'] = now();
            $id = DB::table('maps')->insertGetId($row);
            DB::table('stages')->whereIn('id', $stages->pluck('id'))->update(['map_id' => $id, 'updated_at' => now()]);
        });
        $this->info("복제 완료: {$to}, 스테이지 ".count($codes).'개 교체');

        return self::SUCCESS;
    }
}
