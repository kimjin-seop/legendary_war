<?php

namespace App\Console\Commands;

use App\Support\ContentDump;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 개발 DB 의 콘텐츠 테이블(화이트리스트: App\Support\ContentDump::TABLES)만 database/data/content_dump/ 로 덤프한다.
 * - DB 는 읽기 전용으로만 사용(PRAGMA query_only=ON, SELECT 만). 사용자·지갑·세션 등 비화이트리스트 테이블은 접근하지 않는다.
 * - 테이블별 NDJSON(한 행 한 줄, PK 정렬, 컬럼은 스키마 순서) → 재실행 시 변경분만 diff 로 남는다. --gzip 이면 .ndjson.gz.
 * - manifest.json: 테이블별 파일·행 수·컬럼 목록·sha256 + 생성 시각 + 마이그레이션 최신 항목.
 */
class GameContentExport extends Command
{
    protected $signature = 'game:content-export {--gzip : 테이블 파일을 .ndjson.gz 로 압축}';

    protected $description = '개발 DB 콘텐츠 테이블을 database/data/content_dump/ 로 덤프(읽기 전용)';

    public function handle(): int
    {
        $conn = DB::connection();
        if ($conn->getDriverName() !== 'sqlite') {
            $this->error('sqlite 연결에서만 지원합니다.');

            return self::FAILURE;
        }
        $conn->statement('PRAGMA query_only = ON'); // 이 연결은 이후 쓰기 불가
        $gzip = (bool) $this->option('gzip');
        $dir = ContentDump::dir();
        is_dir($dir) || mkdir($dir, 0775, true);

        $tables = [];
        $total = 0;
        foreach (ContentDump::TABLES as $table => $orderCol) {
            if (! Schema::hasTable($table)) {
                $this->error("테이블 없음: {$table} (먼저 migrate)");

                return self::FAILURE;
            }
            $columns = Schema::getColumnListing($table);
            $file = $table.'.ndjson'.($gzip ? '.gz' : '');
            foreach (glob($dir.'/'.$table.'.ndjson*') ?: [] as $old) {
                unlink($old); // 압축 옵션을 바꿔도 이전 파일이 남지 않게
            }
            $h = $gzip ? gzopen($dir.'/'.$file, 'wb9') : fopen($dir.'/'.$file, 'wb');
            $n = 0;
            foreach ($conn->table($table)->orderBy($orderCol)->cursor() as $row) {
                $ordered = [];
                foreach ($columns as $c) {
                    $ordered[$c] = $row->$c;
                }
                $json = json_encode($ordered, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRESERVE_ZERO_FRACTION | JSON_THROW_ON_ERROR)."\n";
                $gzip ? gzwrite($h, $json) : fwrite($h, $json);
                $n++;
            }
            $gzip ? gzclose($h) : fclose($h);
            $size = filesize($dir.'/'.$file);
            $tables[$table] = ['file' => $file, 'rows' => $n, 'columns' => $columns, 'sha256' => hash_file('sha256', $dir.'/'.$file)];
            $total += $size;
            $this->line(sprintf('  %-20s %6d행  %s B', $table, $n, number_format($size)));
        }

        $last = $conn->table('migrations')->orderByDesc('id')->first(['migration', 'batch']);
        $manifest = [
            'generated_at' => now()->toIso8601String(),
            'latest_migration' => $last->migration ?? null,
            'latest_batch' => $last->batch ?? null,
            'tables' => $tables,
        ];
        file_put_contents($dir.'/manifest.json', json_encode($manifest, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n");
        $this->info(sprintf('완료: %d개 테이블, 합계 %.2f MB%s', count($tables), $total / 1048576, $total > 20 * 1048576 ? ' (20MB 초과: --gzip 권장)' : ''));

        return self::SUCCESS;
    }
}
