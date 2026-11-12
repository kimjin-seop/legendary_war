<?php

namespace App\Console\Commands;

use App\Services\WarService;
use Illuminate\Console\Command;

class WarSeed extends Command
{
    protected $signature = 'war:seed {scenario=imjin}';

    protected $description = '시즌 전쟁: 시나리오 JSON(database/data/war)으로 활성 시즌 1개를 생성한다(이미 있으면 유지, 멱등)';

    public function handle(WarService $war): int
    {
        $id = $war->ensureSeason((string) $this->argument('scenario'));
        $this->info("활성 시즌 id=$id");

        return self::SUCCESS;
    }
}
