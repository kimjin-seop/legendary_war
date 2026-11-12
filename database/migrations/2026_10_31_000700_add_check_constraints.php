<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 도메인 불변식 CHECK 제약. SQLite는 ADD CONSTRAINT CHECK가 없어 대상 테이블만 재생성한다(복사 -> DROP -> RENAME -> 인덱스 재생성).
 * 주의: foreign_keys=ON 상태에서 DROP TABLE users를 하면 ON DELETE CASCADE로 자식 데이터가 삭제되므로,
 * 트랜잭션 밖에서 PRAGMA foreign_keys=OFF 후 수행하고(트랜잭션 안에서는 무시됨) 끝에 foreign_key_check/integrity_check로 검증한다.
 * 실행 전 DB 파일 백업 필수. 위반 데이터가 있으면 아무것도 바꾸지 않고 중단한다.
 */
return new class extends Migration
{
    public $withinTransaction = false;

    private function checks(): array
    {
        return [
            'users' => ['users_level_min' => 'level >= 1', 'users_exp_min' => 'exp >= 0'],
            'battles' => [
                'battles_version_min' => 'version >= 0',
                'battles_status_enum' => "status in ('deployment','in_progress','finished','abandoned')",
                'battles_mode_enum' => "mode in ('stage','free','pvp')",
            ],
            'rooms' => [
                'rooms_status_enum' => "status in ('waiting','deployment','in_progress','finished','closed')",
                'rooms_mode_enum' => "mode in ('solo','pvp')",
                'rooms_visibility_enum' => "visibility in ('public','private')",
            ],
            'room_players' => ['room_players_side_enum' => "side in ('a','b')"],
            'wallet_transactions' => ['wallet_tx_delta_nonzero' => 'delta <> 0', 'wallet_tx_balance_min' => 'balance_after >= 0'],
        ];
    }

    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }
        $checks = $this->checks();
        // 1) 사전 점검: 위반 행이 있으면 중단(데이터 변경 없음)
        foreach ($checks as $table => $cs) {
            foreach ($cs as $name => $expr) {
                $bad = (int) DB::scalar("select count(*) from \"$table\" where not ($expr)");
                if ($bad > 0) {
                    throw new RuntimeException("CHECK 사전 점검 실패: $table.$name 위반 $bad 행. 데이터를 정리한 뒤 다시 실행하세요.");
                }
            }
        }
        $this->rebuild(fn (string $sql, string $table) => $this->withChecks($sql, $checks[$table]), array_keys($checks));
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }
        $this->rebuild(fn (string $sql) => preg_replace('/, constraint "[a-z_]+" check \([^)]*(?:\([^)]*\)[^)]*)*\)/', '', $sql), array_keys($this->checks()));
    }

    private function withChecks(string $sql, array $cs): string
    {
        $add = '';
        foreach ($cs as $name => $expr) {
            if (! str_contains($sql, "constraint \"$name\"")) {
                $add .= ", constraint \"$name\" check ($expr)";
            }
        }

        return substr(rtrim($sql), 0, -1).$add.')';
    }

    private function rebuild(callable $transform, array $tables): void
    {
        $pdo = DB::connection()->getPdo();
        $pdo->exec('PRAGMA foreign_keys=OFF');
        try {
            $pdo->exec('BEGIN IMMEDIATE');
            foreach ($tables as $t) {
                $sql = DB::scalar("select sql from sqlite_master where type='table' and name=?", [$t]);
                $indexes = array_column(DB::select("select sql from sqlite_master where type='index' and tbl_name=? and sql is not null", [$t]), 'sql');
                $new = $transform($sql, $t);
                if ($new === $sql) {
                    continue;
                }
                $new = preg_replace('/^CREATE TABLE "'.$t.'"/', 'CREATE TABLE "__new_'.$t.'"', $new, 1);
                $pdo->exec($new);
                $pdo->exec("insert into \"__new_$t\" select * from \"$t\"");
                $pdo->exec("drop table \"$t\"");
                $pdo->exec("alter table \"__new_$t\" rename to \"$t\"");
                foreach ($indexes as $i) {
                    $pdo->exec($i);
                }
            }
            if (DB::select('PRAGMA foreign_key_check')) {
                throw new RuntimeException('foreign_key_check 실패: 롤백합니다.');
            }
            $pdo->exec('COMMIT');
        } catch (Throwable $e) {
            if ($pdo->inTransaction()) {
                $pdo->exec('ROLLBACK');
            }
            $pdo->exec('PRAGMA foreign_keys=ON');
            throw $e;
        }
        $pdo->exec('PRAGMA foreign_keys=ON');
        $ic = DB::scalar('PRAGMA integrity_check');
        if ($ic !== 'ok') {
            throw new RuntimeException("integrity_check 실패: $ic");
        }
    }
};
