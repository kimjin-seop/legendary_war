<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use App\Support\DailyCounter;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * 소탕: 직접 3성 클리어한 스테이지의 보상만 재수령(전투 없음, 자동 전투가 아님).
 * - 조건: user_stage_progress.best_stars = 3 (수동 전투 정산으로만 올라간다). 아니면 422 sweep_not_available.
 * - 보상: 스테이지 보상 x 별점3 배율 x 재도전 배율(reward_scale). 영웅 exp 는 현재 파티 영웅에게 균등(레벨 격차 규칙 동일).
 * - 유저 일일 총량: game.sweep.daily_total(기본 10, 0=무제한, 모든 스테이지 합산, 스코프 'stage_sweep_total:user:U'). 소진 시 422 sweep_daily_total, 일부만 남으면 잔여만큼만 실행(reward_blocked=sweep_daily_total).
 * - 일일 한도: (1) 전투 보상과 같은 카운터('stage_reward:user:U:stage:S', reward_scale.stage_daily_cap, 0=무제한)를 횟수만큼 소모, (2) 소탕 자체 상한('stage_sweep:user:U:stage:S', game.sweep.daily_cap, 기본 20)은 항상 적용.
 *   둘 중 작은 잔여만큼만 실행하고 초과분은 실행되지 않는다(0회면 422 stage_daily_cap).
 * - 영웅 exp: 전투와 달리 현재 파티 영웅 전원이 동일하게 받는다(전투의 벤치 bench_exp_pct 구분 없음).
 * - 멱등: (user, request_id). 같은 요청 재전송은 저장된 결과를 replay=true 로 반환(이중 지급·한도 소모 없음).
 */
class SweepService
{
    public function __construct(private readonly ProgressionService $progress, private readonly BattleService $battles)
    {
    }

    public function sweep(User $user, int $stageId, int $count, string $requestId): array
    {
        config('game.sweep.enabled') || throw new IllegalAction('sweep_disabled', '소탕 기능을 사용할 수 없습니다.', 404);
        try {
            $r = DB::transaction(fn () => $this->tx($user, $stageId, $count, $requestId));
        } catch (UniqueConstraintViolationException) {
            $r = DB::transaction(fn () => $this->replay($user->id, $stageId, $requestId) ?? throw new IllegalAction('sweep_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409));
        }

        return $r + ['profile' => $this->progress->profile($user)];   // 현재 프로필(레벨·exp·gold 등, replay 도 최신값)
    }

    private function replay(int $userId, int $stageId, string $requestId): ?array
    {
        $log = DB::table('stage_sweeps')->where(['user_id' => $userId, 'request_id' => $requestId])->first();
        if (! $log) {
            return null;
        }
        if ((int) $log->stage_id !== $stageId) {
            throw new IllegalAction('request_id_reused', '같은 request_id로 다른 요청을 보낼 수 없습니다.', 409);
        }

        return ['replay' => true, 'sweep_id' => (int) $log->id] + json_decode((string) $log->result, true);
    }

    private function tx(User $user, int $stageId, int $count, string $requestId): array
    {
        if ($r = $this->replay($user->id, $stageId, $requestId)) {
            return $r;
        }
        $max = max(1, (int) config('game.sweep.max_count', 10));
        ($count >= 1 && $count <= $max) || throw new IllegalAction('invalid_count', "소탕 횟수는 1~{$max} 입니다.", 422);
        $stage = DB::table('stages')->where('id', $stageId)->first() ?? throw new IllegalAction('stage_not_found', '스테이지가 없습니다.', 404);
        $prog = DB::table('user_stage_progress')->where(['user_id' => $user->id, 'stage_id' => $stageId])->first();
        if (! $prog || (int) $prog->best_stars < 3) {
            throw new IllegalAction('sweep_not_available', '직접 3성으로 클리어한 스테이지만 소탕할 수 있습니다.', 422);
        }
        $rs = config('game.reward_scale');
        $cap = (int) $rs['stage_daily_cap'];
        // 실행 가능 횟수 = min(요청, 전투 보상 공유 한도 잔여, 소탕 자체 일일 상한 잔여). 소탕 상한은 stage_daily_cap=0(무제한)이어도 항상 적용
        $shareScope = 'stage_reward:user:'.$user->id.':stage:'.$stageId;
        $sweepScope = 'stage_sweep:user:'.$user->id.':stage:'.$stageId;
        $sweepCap = (int) config('game.sweep.daily_cap', 20);
        $totalScope = 'stage_sweep_total:user:'.$user->id;   // 유저 하루 소탕 총량(모든 스테이지 합산)
        $totalCap = (int) config('game.sweep.daily_total', 0);
        $totalLeft = $totalCap > 0 ? max(0, $totalCap - DailyCounter::valueLocked($totalScope)) : PHP_INT_MAX;
        $totalCap > 0 && $totalLeft === 0 && throw new IllegalAction('sweep_daily_total', "오늘 소탕 총 {$totalCap}회를 모두 사용했습니다.", 422);
        $executed = min($count, $totalLeft);
        $cap > 0 && $executed = min($executed, max(0, $cap - DailyCounter::valueLocked($shareScope)));   // 트랜잭션 안 잠금 읽기
        $sweepCap > 0 && $executed = min($executed, max(0, $sweepCap - DailyCounter::valueLocked($sweepScope)));
        if ($executed === 0) {
            throw new IllegalAction('stage_daily_cap', '오늘 이 스테이지의 소탕·보상 횟수를 모두 사용했습니다.', 422);
        }
        // 증가가 거부되면(동시 요청이 먼저 소모) 예외로 전체 롤백: 보상 없이 카운터만 남는 일이 없다
        ($cap > 0 && ! DailyCounter::tryIncrement($shareScope, $cap, $executed)) && throw new IllegalAction('stage_daily_cap', '오늘 이 스테이지의 소탕·보상 횟수를 모두 사용했습니다.', 422);
        ($sweepCap > 0 && ! DailyCounter::tryIncrement($sweepScope, $sweepCap, $executed)) && throw new IllegalAction('stage_daily_cap', '오늘 이 스테이지의 소탕·보상 횟수를 모두 사용했습니다.', 422);
        ($totalCap > 0 && ! DailyCounter::tryIncrement($totalScope, $totalCap, $executed)) && throw new IllegalAction('sweep_daily_total', "오늘 소탕 총 {$totalCap}회를 모두 사용했습니다.", 422);
        $mult = (float) ($rs['star_mult'][3] ?? 1.0) * (float) $rs['retry_mult'];
        $heroGain = (int) floor((int) $stage->reward_exp * $mult) * $executed;
        $userGain = (int) floor((int) $stage->reward_user_exp * $mult) * $executed;
        $gold = (int) floor((int) $stage->reward_gold * $mult) * $executed;

        $heroResults = [];
        foreach (DB::table('parties')->where('user_id', $user->id)->pluck('user_hero_id') as $uhId) {
            $heroResults[] = $this->progress->addHeroExp((int) $uhId, $this->battles->levelGapExp($heroGain, (int) $uhId, $stage, $rs));
        }
        $userResult = $this->progress->addUserExp($user, $userGain);
        $result = ['stage_id' => $stageId, 'requested' => $count, 'executed' => $executed, 'reward_blocked' => $executed < $count ? ($executed === $totalLeft ? 'sweep_daily_total' : 'stage_daily_cap') : null, 'daily_total_remaining' => $totalCap > 0 ? max(0, $totalLeft - $executed) : null,
            'gold' => $gold, 'hero_exp_total' => $heroGain, 'user_exp' => $userGain, 'heroes' => $heroResults, 'user' => $userResult];
        $sid = DB::table('stage_sweeps')->insertGetId(['user_id' => $user->id, 'request_id' => $requestId, 'stage_id' => $stageId, 'requested' => $count, 'executed' => $executed,
            'result' => json_encode($result, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
        $gold > 0 && $this->progress->credit($user->id, 'gold', $gold, 'stage_sweep', 'stage_sweep', $sid);
        $qs = app(QuestService::class);
        for ($i = 1; $i <= $executed; $i++) {   // 퀘스트 훅(멱등 키: 소탕 id+순번)
            $qs->record($user->id, 'stage_win', "sweep:{$sid}:{$i}");
            $qs->record($user->id, 'stage_clear', "sweep:{$sid}:{$i}", 1, (string) ($stage->code ?? ''));
        }

        return ['replay' => false, 'sweep_id' => $sid] + $result;
    }
}
