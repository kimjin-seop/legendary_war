<?php

namespace App\Database;

/**
 * PHP 8.3용 SQLite PDO: 트랜잭션을 항상 BEGIN IMMEDIATE로 시작한다.
 * Laravel의 transaction_mode 설정은 PHP 8.4 이상에서만 적용되어, 8.3에서는 DEFERRED 트랜잭션이
 * 읽기 후 쓰기로 승격될 때 busy_timeout이 무시되고 즉시 'database is locked'가 발생한다.
 * (PHP 8.4로 올리면 이 클래스는 필요 없고 config/database.php의 transaction_mode가 적용된다.)
 */
class ImmediatePdo extends \PDO
{
    private bool $inTxn = false;

    public function beginTransaction(): bool
    {
        $this->exec('BEGIN IMMEDIATE TRANSACTION');

        return $this->inTxn = true;
    }

    public function commit(): bool
    {
        $this->exec('COMMIT');
        $this->inTxn = false;

        return true;
    }

    public function rollBack(): bool
    {
        try {
            $this->exec('ROLLBACK');
        } catch (\PDOException) {
            // SQLite가 오류로 이미 롤백한 경우
        }
        $this->inTxn = false;

        return true;
    }

    public function inTransaction(): bool
    {
        return $this->inTxn;
    }
}
