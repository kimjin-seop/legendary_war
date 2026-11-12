<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use App\Support\Period;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 퀘스트(메인+일일+주간). 정의는 config game.quests.defs(코드 값), 진행도는 user_quests (user, quest, period_key).
 * 진행도 증가는 record()가 이벤트 훅으로 호출: (user,event,ref) 로그(quest_event_log)로 멱등, 실패해도 호출자 흐름을 깨지 않는다(try/catch + savepoint).
 * 수령(claim)은 수령 버튼 방식: claimed_at 원자 선점 + wallet 멱등키(quest_reward, user_quest 행 id)로 중복 수령 불가.
 * 테이블이 없으면 조회는 빈 진행도(available=false), 수령은 503.
 */
class QuestService
{
    public const REASON = 'quest_reward';

    public function __construct(private readonly ProgressionService $progress)
    {
    }

    public function available(): bool
    {
        return Schema::hasTable('user_quests') && Schema::hasTable('quest_event_log');
    }

    /** @return array<int,array> 정의 목록(config) */
    private function defs(): array
    {
        return array_values((array) config('game.quests.defs'));
    }

    private function periodKey(string $kind): string
    {
        return match ($kind) {
            'daily' => Period::dailyKey(),
            'weekly' => Period::weeklyKey(),
            default => 'main',
        };
    }

    /**
     * 이벤트 훅. $ref는 이벤트 원천 식별자(battle:ID, gacha:ID 등)로 멱등 키. 어떤 예외도 밖으로 던지지 않는다.
     *
     * @param  string|null  $subject stage_clear의 스테이지 code
     */
    public function record(int $userId, string $event, string $ref, int $amount = 1, ?string $subject = null): void
    {
        try {
            if ($amount <= 0 || ! $this->available()) {
                return;
            }
            DB::transaction(function () use ($userId, $event, $ref, $amount, $subject) {   // 중첩 시 savepoint: 실패해도 바깥 트랜잭션은 유지
                $log = DB::table('quest_event_log')->insertOrIgnore(['user_id' => $userId, 'event' => $event, 'ref' => $ref, 'created_at' => now()]);
                if ($log === 0) {
                    return;   // 이미 반영된 이벤트
                }
                foreach ($this->defs() as $d) {
                    if ($d['event'] !== $event || (isset($d['subject']) && $d['subject'] !== $subject)) {
                        continue;
                    }
                    $key = ['user_id' => $userId, 'quest_code' => $d['code'], 'period_key' => $this->periodKey($d['kind'])];
                    DB::table('user_quests')->insertOrIgnore($key + ['progress' => 0, 'created_at' => now(), 'updated_at' => now()]);
                    DB::table('user_quests')->where($key)->whereNull('claimed_at')
                        ->update(['progress' => DB::raw('MIN('.(int) $d['target'].', progress + '.$amount.')'), 'updated_at' => now()]);
                }
            });
        } catch (\Throwable $e) {
            report($e);
        }
    }

    private function guestAllowed(User $user, string $kind): bool
    {
        return ! $user->is_guest || in_array($kind, (array) config('game.quests.guest_claim'), true);
    }

    /** GET /api/quests */
    public function list(User $user): array
    {
        $rows = [];
        if ($this->available()) {
            foreach (DB::table('user_quests')->where('user_id', $user->id)->get() as $r) {
                $rows[$r->quest_code.'|'.$r->period_key] = $r;
            }
        }
        $out = ['main' => [], 'daily' => [], 'weekly' => []];
        $badge = 0;
        foreach ($this->defs() as $d) {
            $r = $rows[$d['code'].'|'.$this->periodKey($d['kind'])] ?? null;
            $progress = min((int) $d['target'], (int) ($r->progress ?? 0));
            $claimed = $r && $r->claimed_at !== null;
            $done = $progress >= (int) $d['target'];
            $allowed = $this->guestAllowed($user, $d['kind']);
            $can = $done && ! $claimed && $allowed;
            $badge += $can ? 1 : 0;
            $out[$d['kind']][] = [
                'code' => $d['code'], 'title' => $d['title'], 'desc' => $d['desc'], 'target' => (int) $d['target'], 'progress' => $progress,
                'completed' => $done, 'claimed' => $claimed, 'claimable' => $can,
                'claim_blocked' => $done && ! $claimed && ! $allowed ? 'guest_not_allowed' : null,
                'reward' => ['gold' => (int) $d['gold'], 'user_exp' => (int) $d['user_exp']],
            ];
        }
        $dailyEnd = CarbonImmutable::parse(Period::dailyKey(), Period::TZ)->addDay()->setTime(Period::RESET_HOUR, 0);
        $weeklyEnd = CarbonImmutable::parse(Period::weeklyKey(), Period::TZ)->addWeek()->setTime(Period::RESET_HOUR, 0);

        return [
            'available' => $this->available(), 'server_time' => now()->toIso8601String(), 'is_guest' => (bool) $user->is_guest,
            'daily' => ['reset_at' => $dailyEnd->utc()->toIso8601String(), 'quests' => $out['daily']],
            'weekly' => ['reset_at' => $weeklyEnd->utc()->toIso8601String(), 'quests' => $out['weekly']],
            'main' => $out['main'],
            'claimable_count' => $badge,   // 빨간 점용(게스트가 수령할 수 없는 항목 제외)
        ];
    }

    /** POST /api/quests/{code}/claim */
    public function claim(User $user, string $code): array
    {
        if (! $this->available()) {
            throw new IllegalAction('quest_unavailable', '퀘스트를 사용할 수 없습니다.', 503);
        }
        $d = collect($this->defs())->firstWhere('code', $code);
        if (! $d) {
            throw new IllegalAction('quest_not_found', '존재하지 않는 퀘스트입니다.', 404);
        }
        if (! $this->guestAllowed($user, $d['kind'])) {
            throw new IllegalAction('quest_guest_claim', '게스트는 이 보상을 받을 수 없습니다. 정식 계정으로 전환하세요.', 403);
        }
        DB::transaction(function () use ($user, $d) {
            $key = ['user_id' => $user->id, 'quest_code' => $d['code'], 'period_key' => $this->periodKey($d['kind'])];
            $r = DB::table('user_quests')->where($key)->first();
            if (! $r || (int) $r->progress < (int) $d['target']) {
                throw new IllegalAction('quest_not_completed', '아직 완료하지 않은 퀘스트입니다.', 422);
            }
            // 원자 선점: 동시 요청 중 하나만 성공
            if (DB::table('user_quests')->where('id', $r->id)->whereNull('claimed_at')->update(['claimed_at' => now(), 'updated_at' => now()]) === 0) {
                throw new IllegalAction('quest_already_claimed', '이미 수령한 보상입니다.', 409);
            }
            if ((int) $d['gold'] > 0) {
                $this->progress->credit($user->id, 'gold', (int) $d['gold'], self::REASON, 'user_quest', (int) $r->id);   // (reason, ref=행 id) 멱등
            }
            if ((int) $d['user_exp'] > 0) {
                $this->progress->addUserExp($user, (int) $d['user_exp']);
            }
            $d['kind'] === 'daily' && app(PenService::class)->grantFor($user->id, 'daily_quest', 'quest_pen', 'user_quest', (int) $r->id);   // 펜: 일일 퀘스트 수령
        });
        $all = $this->list($user);
        $list = $d['kind'] === 'main' ? $all['main'] : $all[$d['kind']]['quests'];

        return ['claimed' => true, 'reward' => ['gold' => (int) $d['gold'], 'user_exp' => (int) $d['user_exp']], 'quest' => collect($list)->firstWhere('code', $d['code']), 'claimable_count' => $all['claimable_count']];
    }
}
