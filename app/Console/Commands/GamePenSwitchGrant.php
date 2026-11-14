<?php

namespace App\Console\Commands;

use App\Services\ProgressionService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 소환 통화 골드->펜 전환 시 기존 계정 보정 지급. 기본 dry-run(쓰기 없음), --apply 로 지급(개발 DB 전용, 운영 환경 차단).
 * 멱등: reason 'gacha_switch_grant', ref=user id (이미 지급받은 계정은 건너뜀). 일일 상한 밖.
 */
class GamePenSwitchGrant extends Command
{
    protected $signature = 'game:grant-pen-switch {--amount=10 : 계정당 지급 펜} {--apply : 실제 지급(기본 dry-run)}';

    protected $description = '기존 계정에 소환 전환 보정 펜 일괄 지급(dry-run 기본, 운영 실행 차단)';

    public function handle(ProgressionService $progress): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행하지 않습니다(개발 DB 전용).');

            return self::FAILURE;
        }
        $amount = (int) $this->option('amount');
        if ($amount < 1) {
            $this->error('--amount 는 1 이상이어야 합니다.');

            return self::FAILURE;
        }
        $apply = (bool) $this->option('apply');
        $targets = $skipped = 0;
        DB::table('users')->orderBy('id')->select('id')->chunkById(200, function ($users) use ($progress, $amount, $apply, &$targets, &$skipped) {
            foreach ($users as $u) {
                $done = DB::table('wallet_transactions as t')->join('wallets as w', 'w.id', '=', 't.wallet_id')
                    ->where(['w.user_id' => $u->id, 'w.currency_code' => 'pen', 't.reason_code' => 'gacha_switch_grant', 't.ref_type' => 'user', 't.ref_id' => $u->id])->exists();
                if ($done) {
                    $skipped++;

                    continue;
                }
                $targets++;
                $apply && $progress->credit((int) $u->id, 'pen', $amount, 'gacha_switch_grant', 'user', (int) $u->id);
            }
        });
        $this->info(($apply ? '[적용] ' : '[dry-run] ')."대상 {$targets}명(이미 지급 {$skipped}명 제외), 계정당 펜 {$amount}");

        return self::SUCCESS;
    }
}
