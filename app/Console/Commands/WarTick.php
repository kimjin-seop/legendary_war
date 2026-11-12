<?php

namespace App\Console\Commands;

use App\Services\WarTickService;
use Illuminate\Console\Command;

class WarTick extends Command
{
    protected $signature = 'war:tick';

    protected $description = '시즌 전쟁 시간당 배치: 시즌 종료, 정체 점령도 감소, AI 국가 행동(멱등)';

    public function handle(WarTickService $tick): int
    {
        $r = $tick->run();
        if ($r['locked']) {
            $this->warn('war:tick 이 이미 실행 중입니다(락). 건너뜀.');

            return self::SUCCESS;
        }
        $this->info(sprintf('ended=%s decayed=%d ai_battles=%d', implode(',', $r['ended']) ?: '-', $r['decayed'], $r['ai_battles']));

        return self::SUCCESS;
    }
}
