<?php

namespace App\Services;

use App\Support\DailyCounter;
use App\Support\Period;
use Illuminate\Support\Facades\DB;

/**
 * 펜(영구 재화, wallets.currency_code='pen') 지급. 원천별 수량·일일 상한은 config game.pen.
 * 멱등: ProgressionService::credit 의 (reason, ref) 유니크. 같은 원천을 다시 정산해도 이중 지급되지 않는다(이때 일일 상한도 소모하지 않음).
 * 일일 상한(KST 05:00 기준, 유저별): 남은 한도만큼만 지급(부분 지급 허용), 0 이면 지급 없음.
 */
class PenService
{
    public const CURRENCY = 'pen';

    public function __construct(private readonly ProgressionService $progress)
    {
    }

    /** 원천 키(war_attack_win|war_capture|rank_win|daily_quest)에 대응하는 config 수량으로 지급. 실제 지급량 반환(0=미지급) */
    public function grantFor(int $userId, string $source, string $reason, string $refType, int $refId): int
    {
        // 정산·수령 트랜잭션 안에서 호출되는 부가 보상이므로 앱 예외(IllegalAction: pen_cap_conflict 등)만 격리하고 로그를 남긴다(grant 는 savepoint 라 실패분만 롤백).
        // DB 예외(QueryException 등)는 삼키지 않고 재던져 정산이 실패하게 한다.
        try {
            return $this->grant($userId, (int) config("game.pen.{$source}", 0), $reason, $refType, $refId);
        } catch (\App\Game\IllegalAction $e) {
            \Illuminate\Support\Facades\Log::error('pen grant 실패(정산은 계속)', ['user' => $userId, 'source' => $source, 'ref' => "$refType:$refId", 'code' => $e->getMessage()]);

            return 0;
        }
    }

    public function grant(int $userId, int $amount, string $reason, string $refType, int $refId, bool $ignoreCap = false): int
    {
        if (! config('game.pen.enabled') || $amount <= 0 || $refId <= 0) {
            return 0;
        }

        return (int) DB::transaction(function () use ($userId, $amount, $reason, $refType, $refId, $ignoreCap) {
            $cap = $ignoreCap ? 0 : (int) config('game.pen.daily_cap', 0);
            $scope = 'pen_earn:user:'.$userId;
            if ($cap > 0) {
                $left = $cap - DailyCounter::valueLocked($scope, Period::dailyKey());   // 같은 트랜잭션 안 잠금 읽기 후 지급·증가
                if ($left <= 0) {
                    return 0;
                }
                $amount = min($amount, $left);
            }
            if (! $this->progress->credit($userId, self::CURRENCY, $amount, $reason, $refType, $refId)) {
                return 0;   // 이미 지급된 원천(멱등)
            }
            if ($cap > 0 && ! DailyCounter::tryIncrement($scope, $cap, $amount, Period::dailyKey())) {
                throw new \App\Game\IllegalAction('pen_cap_conflict', '펜 지급이 동시에 처리되었습니다. 다시 시도하세요.', 409);   // 롤백(지급 취소)
            }

            return $amount;
        });
    }

    /**
     * 시즌 종료 보상(WarTickService::endSeason 트랜잭션 안에서 호출). 개인 기여 순위(기여 desc, 가입 시각, id)로 구간 지급 + 우승 국가 소속 보너스.
     * 멱등: reason=war_pen_season, ref=(season_member, member id). 일일 상한 대상 아님. 앱 예외(IllegalAction)는 멤버별로 격리해 한 명의 실패가 나머지를 막지 않고(DB 예외는 재던짐), 실패한 멤버 수를 반환한다(0=전원 성공; 재실행하면 누락분만 지급).
     */
    public function grantSeasonRewards(int $seasonId, ?int $winnerSeasonCountryId): int   // 실패 멤버 수
    {
        $cfg = (array) config('game.pen.season', []);
        $members = DB::table('season_members')->where('season_id', $seasonId)->where('contribution', '>', 0)
            ->orderByDesc('contribution')->orderBy('joined_at')->orderBy('id')->get(['id', 'user_id', 'season_country_id']);
        $failed = 0;
        foreach ($members as $i => $m) {
            $amt = (int) ($cfg['participate'] ?? 0);
            foreach ((array) ($cfg['rank_table'] ?? []) as [$maxRank, $v]) {
                if ($i + 1 <= (int) $maxRank) {
                    $amt = (int) $v;
                    break;
                }
            }
            $winnerSeasonCountryId !== null && (int) $m->season_country_id === $winnerSeasonCountryId && $amt += (int) ($cfg['winner_bonus'] ?? 0);
            try {
                $this->grant((int) $m->user_id, $amt, 'war_pen_season', 'season_member', (int) $m->id, true);
            } catch (\App\Game\IllegalAction $e) {   // 앱 예외만 멤버별로 격리한다. DB 예외(교착·락 타임아웃 등)는 재던져 시즌 종료 트랜잭션 전체가 롤백·재시도되게 한다
                $failed++;
                \Illuminate\Support\Facades\Log::error('pen 시즌 보상 실패', ['season' => $seasonId, 'member' => (int) $m->id, 'user' => (int) $m->user_id, 'error' => $e->getMessage()]);
            }
        }

        return $failed;
    }

    public function balance(int $userId): int
    {
        return (int) (DB::table('wallets')->where(['user_id' => $userId, 'currency_code' => self::CURRENCY])->value('balance') ?? 0);
    }

    /** GET /api/pen */
    public function summary(int $userId): array
    {
        $cap = (int) config('game.pen.daily_cap', 0);
        $earned = DailyCounter::value('pen_earn:user:'.$userId, Period::dailyKey());
        $wid = DB::table('wallets')->where(['user_id' => $userId, 'currency_code' => self::CURRENCY])->value('id');
        $recent = $wid ? DB::table('wallet_transactions')->where('wallet_id', $wid)->orderByDesc('id')->limit(20)->get(['reason_code as reason', 'delta', 'balance_after', 'created_at']) : [];

        return ['enabled' => (bool) config('game.pen.enabled'), 'balance' => $this->balance($userId), 'earned_today' => $earned, 'daily_cap' => $cap,
            'remaining_today' => $cap > 0 ? max(0, $cap - $earned) : null, 'recent' => $recent];
    }
}
