<?php

namespace App\Console\Commands;

use App\Support\HeroTitles;
use Illuminate\Console\Command;

/** heroes.title/short_name만 갱신하는 전용 경로(전체 game:seed --force 없이 개발 DB에 칭호 반영). */
class GameSeedTitles extends Command
{
    protected $signature = 'game:seed-titles {--dry-run : 변경 대상만 출력하고 DB는 쓰지 않음}';

    protected $description = '영웅 칭호(title·short_name)만 hero_titles(.json + v2 proposal)로 갱신';

    public function handle(): int
    {
        $r = HeroTitles::apply((bool) $this->option('dry-run'));
        $this->info(sprintf('%s: 대상 %d행 / 변경 %d행', $this->option('dry-run') ? 'dry-run' : '갱신 완료', $r['rows'], $r['changed']));

        return self::SUCCESS;
    }
}
