<?php

namespace App\Console\Commands;

use App\Services\RankService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 랭크 시즌 보상 지급. final 시즌만, rank.enabled && rank.season_rewards.enabled 일 때만 지급(아니면 무동작).
 * 중복 지급은 RankService::payRewards 가 quest_event_log 로 막는다(재실행 안전). 스케줄러 등록은 하지 않았다(제안: 매일 sweep 이후 --all).
 */
class RankPayRewards extends Command
{
    protected $signature = 'rank:pay-rewards {season? : 시즌 id(생략 시 아직 지급 안 한 final 시즌 전부)} {--dry-run : 지급 없이 대상 표만 출력}';

    protected $description = '랭크 시즌 종료 보상 지급(final 시즌, 멱등, rank.enabled=false 면 무동작)';

    public function handle(RankService $rank): int
    {
        if (! $rank->enabled() || ! config('game.rank.season_rewards.enabled')) {
            $this->info('랭크 또는 시즌 보상이 비활성이라 아무것도 하지 않습니다.');

            return self::SUCCESS;
        }
        $q = DB::table('rank_seasons')->where('status', 'final');
        $this->argument('season') !== null && $q->where('id', (int) $this->argument('season'));
        $ids = $q->orderBy('id')->pluck('id')->all();
        if ($ids === []) {
            $this->info('대상 final 시즌이 없습니다.');

            return self::SUCCESS;
        }
        foreach ($ids as $sid) {
            if ($this->option('dry-run')) {
                $plan = $rank->rewardPlan((int) $sid);
                $done = DB::table('quest_event_log')->where('event', 'rank_season_reward')->where('ref', 's'.$sid)->pluck('user_id')->flip();
                $todo = array_values(array_filter($plan, fn ($p) => ! isset($done[$p['user_id']])));
                $this->line("season {$sid}: 지급 대상 ".count($todo).'명 (이미 지급 '.(count($plan) - count($todo)).'명)');
                $this->table(['user_id', 'rating', 'tier', 'gold', 'title'], array_map(fn ($p) => [$p['user_id'], $p['rating'], $p['tier'], $p['gold'], $p['title'] ?? '-'], $todo));

                continue;
            }
            $paid = $rank->payRewards((int) $sid);
            $this->line("season {$sid}: ".count($paid).'명 지급');
        }

        return self::SUCCESS;
    }
}
