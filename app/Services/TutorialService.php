<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 튜토리얼 진행 저장(users.tutorial_step/tutorial_done_at/tutorial_skipped). 게스트 승격은 같은 users 행이라 상태가 유지된다.
 * step = 도달한 대사 단계 수(0=미시작, 최대 = tutorial_dialogue.json steps 개수). 서버는 단조 증가만 허용(낮은 값은 무시=멱등).
 * done_at = 종료(완료 또는 건너뛰기). 보상은 '완료'에만 1회(wallet_transactions reason=tutorial_reward, ref user:id).
 * 컬럼이 없는 환경(마이그레이션 전)에서는 기본값을 반환하고 PUT은 503 tutorial_unavailable.
 */
class TutorialService
{
    public const REASON = 'tutorial_reward';

    public function __construct(private readonly ProgressionService $progress)
    {
    }

    public function available(): bool
    {
        return Schema::hasColumn('users', 'tutorial_step') && Schema::hasColumn('users', 'tutorial_done_at') && Schema::hasColumn('users', 'tutorial_skipped');
    }

    /** 대사 단계 수(steps 길이). 파일을 못 읽으면 0 */
    public function maxStep(): int
    {
        $path = config('game.tutorial.dialogue_path') ?: database_path('data/tutorial_dialogue.json');
        $j = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;

        return is_array($j['steps'] ?? null) ? count($j['steps']) : 0;
    }

    public function state(User $user): array
    {
        $max = $this->maxStep();
        $reward = ['gold' => (int) config('game.tutorial.reward.gold'), 'user_exp' => (int) config('game.tutorial.reward.user_exp')];
        if (! $this->available()) {
            return ['step' => 0, 'done' => false, 'skipped' => false, 'reward_claimed' => false, 'auto_start' => false, 'max_step' => $max, 'reward' => $reward];
        }
        $r = DB::table('users')->where('id', $user->id)->first(['tutorial_step', 'tutorial_done_at', 'tutorial_skipped', 'created_at']);
        $step = (int) $r->tutorial_step;
        $done = $r->tutorial_done_at !== null;
        $cut = config('game.tutorial.auto_start_after');
        $newUser = ! $cut || ($r->created_at && Carbon::parse($r->created_at, 'UTC')->gte(Carbon::parse($cut, 'UTC')));

        return [
            'step' => $step, 'done' => $done, 'skipped' => (bool) $r->tutorial_skipped, 'reward_claimed' => $this->claimed($user->id),
            // 첫 로비 자동 시작: 미시작·미종료이고 컷오프 이후 가입한 유저만(기존 유저는 false, 진행 중(step>0)은 이어하기이므로 FE가 step으로 판단)
            'auto_start' => ! $done && $step === 0 && $newUser,
            'max_step' => $max, 'reward' => $reward,
        ];
    }

    private function claimed(int $userId): bool
    {
        return DB::table('wallet_transactions')->join('wallets', 'wallets.id', '=', 'wallet_transactions.wallet_id')
            ->where(['wallets.user_id' => $userId, 'wallet_transactions.reason_code' => self::REASON, 'wallet_transactions.ref_type' => 'user', 'wallet_transactions.ref_id' => $userId])->exists();
    }

    /** @return array{state:array,granted:?array} */
    public function update(User $user, int $step, bool $skipped, bool $done): array
    {
        if (! $this->available()) {
            throw new IllegalAction('tutorial_unavailable', '튜토리얼 저장을 사용할 수 없습니다.', 503);
        }
        $max = $this->maxStep();
        if ($step < 0 || $step > $max) {
            throw new IllegalAction('tutorial_step_invalid', "step은 0~{$max} 범위여야 합니다.");
        }
        if ($skipped && $done) {
            throw new IllegalAction('tutorial_invalid_flags', 'skipped와 done은 동시에 보낼 수 없습니다.');
        }
        $granted = null;
        DB::transaction(function () use ($user, $step, $skipped, $done, $max, &$granted) {
            $r = DB::table('users')->where('id', $user->id)->lockForUpdate()->first(['tutorial_step', 'tutorial_done_at', 'tutorial_skipped']);
            $cur = (int) $r->tutorial_step;
            $new = max($cur, $step);   // 단조 증가
            $upd = [];
            $claim = false;
            if ($skipped) {
                if ($r->tutorial_done_at === null) {
                    $upd = ['tutorial_skipped' => true, 'tutorial_done_at' => now()];
                    $claim = (bool) config('game.tutorial.reward_on_skip');
                }
            } elseif ($done) {
                if ($new < $max || $max === 0) {
                    throw new IllegalAction('tutorial_incomplete', '마지막 단계까지 진행해야 완료할 수 있습니다.');
                }
                if ($r->tutorial_done_at === null) {
                    $upd = ['tutorial_done_at' => now()];
                    $claim = true;
                } elseif ($r->tutorial_skipped) {   // 건너뛴 뒤 재열람으로 끝까지 완료: 실제 완료로 전환(보상은 1회 멱등)
                    $upd = ['tutorial_skipped' => false];
                    $claim = true;
                }
            }
            if ($new !== $cur) {
                $upd['tutorial_step'] = $new;
            }
            if ($upd) {
                DB::table('users')->where('id', $user->id)->update($upd);
            }
            if ($claim) {
                $granted = $this->grant($user);
            }
        });

        return ['state' => $this->state($user), 'granted' => $granted];
    }

    /** 보상 1회(멱등 키 tutorial_reward). 이미 지급됐으면 null */
    private function grant(User $user): ?array
    {
        $gold = (int) config('game.tutorial.reward.gold');
        $exp = (int) config('game.tutorial.reward.user_exp');
        if (! $this->progress->credit($user->id, 'gold', $gold, self::REASON, 'user', $user->id)) {
            return null;
        }
        $pen = (int) config('game.pen.tutorial_reward', 0);
        $pen > 0 && $this->progress->credit($user->id, 'pen', $pen, self::REASON.'_pen', 'user', $user->id);   // 소환용 펜(상한 밖)
        $exp > 0 && $this->progress->addUserExp($user, $exp);

        return ['gold' => $gold, 'user_exp' => $exp, 'pen' => $pen];
    }
}
