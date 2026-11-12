<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/** 클라이언트 에러 정리: 보관기간(game.client_errors.retention_days) 초과 삭제 + 행 수 상한(max_rows) 초과분은 오래된 것부터 삭제. */
class ClientErrorsPrune extends Command
{
    protected $signature = 'client-errors:prune {--dry-run : 삭제하지 않고 대상 수만 출력}';

    protected $description = '클라이언트 에러 리포트 보관기간·용량 상한 정리';

    public function handle(): int
    {
        $days = max(1, (int) config('game.client_errors.retention_days', 14));
        $max = max(100, (int) config('game.client_errors.max_rows', 5000));
        $old = DB::table('client_errors')->where('last_seen_at', '<', now()->subDays($days));
        $nOld = (clone $old)->count();
        $total = DB::table('client_errors')->count();
        $over = max(0, $total - $nOld - $max);
        $this->info("보관기간 초과 {$nOld}건, 용량 초과 {$over}건(전체 {$total})");
        if ($this->option('dry-run')) {
            return self::SUCCESS;
        }
        $old->delete();
        if ($over > 0) {
            $ids = DB::table('client_errors')->orderBy('last_seen_at')->orderBy('id')->limit($over)->pluck('id');
            DB::table('client_errors')->whereIn('id', $ids)->delete();
        }

        return self::SUCCESS;
    }
}
