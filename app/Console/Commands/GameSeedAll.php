<?php

namespace App\Console\Commands;

use App\Support\ContentDump;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 콘텐츠 덤프(database/data/content_dump/, game:content-export 산출물)를 '빈' DB 에 한 번에 적재한다.
 * - 대상 테이블 중 하나라도 비어 있지 않으면 중단(덮어쓰기·--force 없음).
 * - manifest 의 테이블 컬럼 == 현재 마이그레이션 스키마 컬럼이 아니면 중단.
 * - 한 트랜잭션, FK 순서, chunk insert. 이후 행 수 대조 + foreign_key_check. 실패 시 전체 롤백.
 * - 개발 전용 시드 커맨드(seed-active-skills, seed-imjin10 등)는 호출하지 않는다.
 */
class GameSeedAll extends Command
{
    protected $signature = 'game:seed-all {--dry-run : 계획·사전검사만(DB 변경 없음)} {--yes : 운영 환경 확인 프롬프트 생략}';

    protected $description = '콘텐츠 덤프를 빈 DB 에 적재(영웅·스킬·스테이지·맵 등)';

    public function handle(): int
    {
        $dir = ContentDump::dir();
        $mf = $dir.'/manifest.json';
        if (! is_file($mf)) {
            $this->error('manifest.json 없음: '.$mf.' (git pull 확인 / 개발 환경에서 game:content-export 실행 후 커밋)');

            return self::FAILURE;
        }
        $manifest = json_decode((string) file_get_contents($mf), true);
        if (! is_array($manifest) || ! isset($manifest['tables'])) {
            $this->error('manifest.json 형식 오류');

            return self::FAILURE;
        }
        $order = array_keys(ContentDump::TABLES);
        $conn = DB::connection();

        // 1) 사전 검사: manifest 테이블 집합·파일·스키마 컬럼·마이그레이션
        $errors = [];
        if (array_diff($order, array_keys($manifest['tables'])) || array_diff(array_keys($manifest['tables']), $order)) {
            $errors[] = 'manifest 테이블 목록이 코드의 화이트리스트와 다릅니다.';
        }
        foreach ($order as $t) {
            $m = $manifest['tables'][$t] ?? null;
            if (! $m) {
                continue;
            }
            $path = $dir.'/'.$m['file'];
            if (! is_file($path)) {
                $errors[] = "{$t}: 파일 없음 {$m['file']}";
            } elseif (isset($m['sha256']) && hash_file('sha256', $path) !== $m['sha256']) {
                $errors[] = "{$t}: 파일 해시 불일치(손상 또는 줄바꿈 변환 의심)";
            }
            if (! Schema::hasTable($t)) {
                $errors[] = "{$t}: 테이블 없음 — php artisan migrate 먼저 실행";

                continue;
            }
            $cur = Schema::getColumnListing($t);
            if (array_diff($m['columns'], $cur) || array_diff($cur, $m['columns'])) {
                $errors[] = "{$t}: 컬럼 불일치. 덤프에만 있음=[".implode(',', array_diff($m['columns'], $cur)).'] 현재 DB에만 있음=['.implode(',', array_diff($cur, $m['columns'])).'] — 코드/덤프 버전을 맞추세요';
            }
        }
        if (! $errors && ! empty($manifest['latest_migration']) && Schema::hasTable('migrations')
            && ! $conn->table('migrations')->where('migration', $manifest['latest_migration'])->exists()) {
            $errors[] = "덤프 기준 마이그레이션 {$manifest['latest_migration']} 이 이 DB 에 적용되지 않았습니다 — php artisan migrate 실행";
        }
        if ($errors) {
            $this->error('사전 검사 실패(DB 변경 없음):');
            foreach ($errors as $e) {
                $this->line('  - '.$e);
            }

            return self::FAILURE;
        }

        // 2) 빈 DB 검사
        $nonEmpty = [];
        foreach ($order as $t) {
            $c = $conn->table($t)->count();
            if ($c > 0) {
                $nonEmpty[$t] = $c;
            }
        }
        if ($nonEmpty) {
            $this->error('대상 테이블이 비어 있지 않아 중단합니다(기존 데이터 덮어쓰기 금지). 이 커맨드는 빈 DB 전용입니다.');
            foreach ($nonEmpty as $t => $c) {
                $this->line("  - {$t}: {$c}행");
            }

            return self::FAILURE;
        }

        // 3) 계획 출력
        $this->info('적재 계획 (덤프 생성: '.($manifest['generated_at'] ?? '?').', 기준 마이그레이션: '.($manifest['latest_migration'] ?? '?').')');
        foreach ($order as $t) {
            $this->line(sprintf('  %-20s %6d행', $t, $manifest['tables'][$t]['rows']));
        }
        if ($this->option('dry-run')) {
            $this->info('dry-run: 사전 검사 통과, DB 변경 없음.');

            return self::SUCCESS;
        }

        // 4) 운영 환경 확인
        if (app()->environment('production')) {
            $db = config('database.connections.'.$conn->getName().'.database');
            $this->warn('APP_ENV=production 입니다. 대상 DB: '.$db);
            $this->warn('실행 전 DB 스냅샷 백업을 권장합니다(sqlite3 <db> ".backup <dest>" 또는 docs/BACKUP_PROCEDURE.md).');
            if (! $this->option('yes') && ! $this->confirm('위 DB 에 콘텐츠를 적재합니다. 계속할까요?', false)) {
                $this->line('취소됨.');

                return self::FAILURE;
            }
        }

        // 5) 적재(단일 트랜잭션)
        try {
            $conn->beginTransaction();
            $conn->statement('PRAGMA defer_foreign_keys = ON'); // stages.prerequisite_stage_id 자기참조 등
            foreach ($order as $t) {
                $this->insertTable($t, $manifest['tables'][$t], $dir);
            }
            $bad = [];
            foreach ($order as $t) {
                $n = $conn->table($t)->count();
                if ($n !== (int) $manifest['tables'][$t]['rows']) {
                    $bad[] = "{$t}: 기대 {$manifest['tables'][$t]['rows']} / 실제 {$n}";
                }
            }
            $fk = $conn->select('PRAGMA foreign_key_check');
            if ($bad || $fk) {
                throw new \RuntimeException('검증 실패: '.implode('; ', $bad).($fk ? ' / foreign_key_check 위반 '.count($fk).'건(예: '.json_encode($fk[0]).')' : ''));
            }
            $conn->commit();
        } catch (\Throwable $e) {
            if ($conn->transactionLevel() > 0) {
                $conn->rollBack();
            }
            $this->error('중단(전체 롤백): '.$e->getMessage());

            return self::FAILURE;
        }
        $this->info('적재 완료: 행 수 대조 OK, foreign_key_check 위반 0건.');

        return self::SUCCESS;
    }

    private function insertTable(string $table, array $m, string $dir): void
    {
        $gz = str_ends_with($m['file'], '.gz');
        $h = $gz ? gzopen($dir.'/'.$m['file'], 'rb') : fopen($dir.'/'.$m['file'], 'rb');
        $buf = [];
        $per = min(100, max(1, intdiv(900, max(1, count($m['columns']))))); // SQLite 변수 한도 여유
        while (($l = $gz ? gzgets($h) : fgets($h)) !== false) {
            $l = trim($l);
            if ($l === '') {
                continue;
            }
            $buf[] = json_decode($l, true, 512, JSON_THROW_ON_ERROR);
            if (count($buf) >= $per) {
                DB::table($table)->insert($buf);
                $buf = [];
            }
        }
        $buf && DB::table($table)->insert($buf);
        $gz ? gzclose($h) : fclose($h);
    }
}
