<?php

namespace App\Console\Commands;

use App\Services\ProtagonistService;
use Illuminate\Console\Command;

/** 주인공 원형 영웅 10행 멱등 삽입(마이그레이션 시점에 unit_types/skills가 비어 있던 DB용). */
class GameSeedProtagonist extends Command
{
    protected $signature = 'game:seed-protagonist';

    protected $description = '주인공 원형 영웅(protagonist_*) 멱등 시드';

    public function handle(ProtagonistService $svc): int
    {
        $this->info('inserted: '.$svc->seedArchetypes());

        return self::SUCCESS;
    }
}
