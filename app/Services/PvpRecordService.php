<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * 내 PvP 전적(읽기 전용). battles(mode=pvp, status=finished)에서 계산하며 스키마 변경 없음.
 * - 나 = user_id(방장, side a) 또는 opponent_user_id(참가자, side b). winner가 a/b가 아니면 무승부.
 * - 종료 사유 = state.end_reason(forfeit_left|forfeit_disconnect|forfeit_timeout), 없으면 normal.
 * - 상대는 표시명만 노출(user id/이메일 없음). 상대 계정이 삭제됐으면 빈 문자열.
 * - 게스트는 전적 대상이 아니다(계정당 집계): guest=true + 빈 목록/0 요약.
 */
class PvpRecordService
{
    public function __construct(private readonly ProtagonistService $protagonist)
    {
    }

    public function show(User $user, int $page, int $perPage): array
    {
        $perPage = max(1, min(50, $perPage));
        $page = max(1, $page);
        if ($user->is_guest) {
            return $this->empty(true, $page, $perPage);
        }
        $uid = (int) $user->id;
        $base = fn () => DB::table('battles')->where('battles.mode', 'pvp')->where('battles.status', 'finished')
            ->where(fn ($w) => $w->where('battles.user_id', $uid)->orWhere('battles.opponent_user_id', $uid));
        $total = $base()->count();
        if ($total === 0) {
            return $this->empty(false, $page, $perPage);
        }
        $result = function ($b) use ($uid): string {
            if (! in_array($b->winner, ['a', 'b'], true)) {
                return 'draw';
            }
            $mySide = (int) $b->user_id === $uid ? 'a' : 'b';

            return $b->winner === $mySide ? 'win' : 'loss';
        };
        $sum = ['wins' => 0, 'losses' => 0, 'draws' => 0];
        foreach ($base()->get(['battles.user_id', 'battles.opponent_user_id', 'battles.winner']) as $b) {
            $sum[['win' => 'wins', 'loss' => 'losses', 'draw' => 'draws'][$result($b)]]++;
        }
        $rows = $base()->leftJoin('maps', 'maps.id', '=', 'battles.map_id')->orderByDesc('battles.id')
            ->forPage($page, $perPage)
            ->get(['battles.id', 'battles.user_id', 'battles.opponent_user_id', 'battles.winner', 'battles.turn', 'battles.updated_at', 'maps.name as map_name', 'battles.state->end_reason as end_reason']);
        $recent = $base()->orderByDesc('battles.id')->limit(10)->get(['battles.user_id', 'battles.opponent_user_id', 'battles.winner']);
        $names = [];
        $nameOf = function (?int $id) use (&$names): string {
            if ($id === null) {
                return '';
            }

            return $names[$id] ??= ($u = User::find($id)) ? $this->protagonist->displayName($u) : '';
        };
        $records = $rows->map(function ($b) use ($uid, $result, $nameOf) {
            $mine = (int) $b->user_id === $uid;
            $res = $result($b);
            $reason = trim((string) $b->end_reason, '"') ?: 'normal';
            $opp = $mine ? $b->opponent_user_id : $b->user_id;

            return [
                'battle_id' => (int) $b->id, 'result' => $res, 'reason' => $reason,
                'forfeit_by_me' => str_starts_with($reason, 'forfeit_') && $res === 'loss',   // 포기/타임아웃/이탈을 한 쪽이 나인지
                'opponent_name' => $nameOf($opp === null ? null : (int) $opp), 'map_name' => $b->map_name, 'my_side' => $mine ? 'a' : 'b',
                'rounds' => (int) $b->turn, 'ended_at' => Carbon::parse($b->updated_at)->toIso8601String(),
            ];
        })->all();
        $decided = $sum['wins'] + $sum['losses'];

        return [
            'guest' => false,
            'summary' => $sum + ['total' => $total, 'win_rate' => round($sum['wins'] / $total, 4), 'win_rate_decided' => $decided > 0 ? round($sum['wins'] / $decided, 4) : null,
                'recent10' => $recent->map($result)->values()->all()],
            'records' => $records,
            'page' => ['page' => $page, 'per_page' => $perPage, 'total' => $total, 'last_page' => (int) max(1, ceil($total / $perPage))],
        ];
    }

    private function empty(bool $guest, int $page, int $perPage): array
    {
        return [
            'guest' => $guest,
            'summary' => ['wins' => 0, 'losses' => 0, 'draws' => 0, 'total' => 0, 'win_rate' => null, 'win_rate_decided' => null, 'recent10' => []],
            'records' => [], 'page' => ['page' => $page, 'per_page' => $perPage, 'total' => 0, 'last_page' => 1],
        ];
    }
}
