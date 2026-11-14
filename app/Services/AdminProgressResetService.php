<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 어드민 '유저 진행도 초기화': 계정(users 행·인증·채팅·신고·감사 로그·재화 원장·전투 기록)은 유지하고 게임 진행도만 신규 가입 상태로 되돌린다.
 * 단일 트랜잭션(실패 시 전부 롤백), 대상 users 행 잠금으로 동시 실행 직렬화, 시작 상태는 ProgressionService::grantStarter 재사용.
 * 재화 원장(wallet_transactions)은 삭제하지 않는다: 잔액은 'admin_reset' 상쇄 행으로 0 처리, 시작 지급 행은 reason 만 개명해 grantStarter 가 다시 지급되게 한다.
 */
class AdminProgressResetService
{
    /** 삭제 대상(자식 -> 부모 순). 키 = 응답 counts 이름 */
    public const RESET_TABLES = [
        'user_lineups', 'parties', 'hero_equipment', 'user_equipment', 'equipment_purchases', 'user_heroes', 'hero_star_ups',
        'user_stage_progress', 'stage_sweeps', 'user_quests', 'quest_event_log', 'user_items', 'item_purchases', 'exchange_purchases',
        'gacha_pulls', 'gacha_user_states', 'user_protagonists', 'season_members', 'territory_contributions', 'rank_ratings', 'rank_queue', 'daily_counters',
    ];

    /** 유지(보고용) */
    public const KEPT = ['users(계정 행·이름·이메일·권한)', 'personal_access_tokens/sessions', 'guests', 'room_messages', 'chat_reports', 'audit_logs', 'wallets(행)', 'wallet_transactions(원장 전체)', 'battles/battle_actions(종료 전투 기록)', 'rooms/room_players', 'rank_matches', 'season_results'];

    public function __construct(private readonly ProgressionService $progress)
    {
    }

    /** @return array{counts:array<string,int>,granted:array<string,mixed>,audit_id:int} */
    public function reset(int $adminId, int $targetId, string $confirm, string $reason): array
    {
        return DB::transaction(function () use ($adminId, $targetId, $confirm, $reason) {
            $u = User::query()->where('id', $targetId)->lockForUpdate()->first() ?? throw new IllegalAction('not_found', '유저가 없습니다.', 404);
            if ($u->id === $adminId) {
                throw new IllegalAction('cannot_reset_self', '본인 계정은 초기화할 수 없습니다.', 422);
            }
            if ($u->isAdmin()) {
                throw new IllegalAction('cannot_reset_admin', '관리자 계정은 초기화할 수 없습니다.', 422);
            }
            if (! hash_equals((string) $u->name, $confirm)) {
                throw new IllegalAction('confirm_mismatch', '확인용 이름이 대상 유저 이름과 일치하지 않습니다.', 422);
            }
            if (DB::table('room_players')->join('rooms', 'rooms.id', '=', 'room_players.room_id')->where('room_players.user_id', $u->id)
                ->whereIn('rooms.status', ['waiting', 'deployment', 'in_progress'])->exists()) {
                throw new IllegalAction('user_in_active_room', '대상 유저가 진행 중인 방에 있습니다. 방이 끝난 뒤 다시 시도하세요.', 409);
            }

            $before = ['level' => (int) $u->level, 'exp' => (int) $u->exp,
                'gold' => (int) DB::table('wallets')->where(['user_id' => $u->id, 'currency_code' => 'gold'])->value('balance'),
                'pen' => (int) DB::table('wallets')->where(['user_id' => $u->id, 'currency_code' => 'pen'])->value('balance')];
            $auditId = (int) DB::table('audit_logs')->insertGetId([
                'user_id' => $adminId, 'action' => 'reset_progress', 'entity' => 'users', 'entity_key' => (string) $u->id,
                'before' => json_encode($before), 'after' => null, 'created_at' => now(),
            ]);

            $counts = [];
            // 진행 중 전투는 포기 처리(기록은 유지)
            $counts['battles_abandoned'] = DB::table('battles')->where('user_id', $u->id)->whereIn('status', ['deployment', 'in_progress'])
                ->update(['status' => 'abandoned', 'settled_at' => now(), 'updated_at' => now()]);

            $heroIds = DB::table('user_heroes')->where('user_id', $u->id)->pluck('id')->all();
            $equipIds = DB::table('user_equipment')->where('user_id', $u->id)->pluck('id')->all();
            foreach (self::RESET_TABLES as $t) {
                $q = DB::table($t);
                $counts[$t] = match ($t) {
                    'hero_equipment' => ($heroIds === [] && $equipIds === []) ? 0 : $q->where(fn ($w) => $w->whereIn('user_hero_id', $heroIds)->orWhereIn('user_equipment_id', $equipIds))->delete(),
                    'season_members' => $this->deleteSeasonMembers($u->id),
                    'daily_counters' => $q->where(function ($w) use ($u) {
                        $id = (int) $u->id;
                        $w->where('scope', 'like', "%:user:{$id}")->orWhere('scope', 'like', "%:user:{$id}:%")->orWhere('scope', 'like', "exchange:{$id}:%");
                    })->delete(),
                    default => $q->where('user_id', $u->id)->delete(),
                };
            }

            // 재화: 원장 보존. 시작 지급 행 개명(재지급 허용) -> 잔액 0 상쇄 행
            $wallets = DB::table('wallets')->where('user_id', $u->id)->get();
            foreach ($wallets as $w) {
                // DB 드라이버 무관(SQLite `||` / MySQL CONCAT 차이 회피): PHP 에서 새 값을 만들어 행별 update
                foreach (DB::table('wallet_transactions')->where('wallet_id', $w->id)->whereIn('reason_code', ['starter_grant', 'starter_pen'])->get(['id', 'reason_code']) as $tx) {
                    DB::table('wallet_transactions')->where('id', $tx->id)->update(['reason_code' => $tx->reason_code.'_r'.$auditId]);
                }
                if ($w->balance > 0) {
                    $this->progress->credit($u->id, $w->currency_code, -(int) $w->balance, 'admin_reset', 'audit_log', $auditId);
                }
            }
            $counts['wallet_balance_zeroed'] = $wallets->where('balance', '>', 0)->count();

            $upd = ['level' => 1, 'exp' => 0, 'updated_at' => now()];
            if (Schema::hasColumn('users', 'tutorial_step')) {
                $upd += ['tutorial_step' => 0, 'tutorial_done_at' => null, 'tutorial_skipped' => false];
            }
            DB::table('users')->where('id', $u->id)->update($upd);

            $this->progress->grantStarter($u->refresh());

            $granted = [
                'gold' => (int) DB::table('wallets')->where(['user_id' => $u->id, 'currency_code' => 'gold'])->value('balance'),
                'pen' => (int) DB::table('wallets')->where(['user_id' => $u->id, 'currency_code' => 'pen'])->value('balance'),
                'level' => 1,
                'heroes' => DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_heroes.user_id', $u->id)
                    ->orderBy('user_heroes.id')->get(['heroes.id as hero_id', 'heroes.name_ko', 'heroes.rarity'])->map(fn ($h) => (array) $h)->all(),
            ];
            DB::table('audit_logs')->where('id', $auditId)->update(['after' => json_encode(['reason' => $reason, 'counts' => $counts, 'granted' => $granted], JSON_UNESCAPED_UNICODE)]);

            return ['counts' => $counts, 'granted' => $granted, 'audit_id' => $auditId];
        });
    }

    private function deleteSeasonMembers(int $userId): int
    {
        foreach (DB::table('season_members')->where('user_id', $userId)->pluck('season_country_id') as $cid) {
            DB::table('season_countries')->where('id', $cid)->where('member_count', '>', 0)->decrement('member_count');
        }

        return DB::table('season_members')->where('user_id', $userId)->delete();
    }
}
