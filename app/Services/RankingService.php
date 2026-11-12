<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use App\Support\Period;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 랭킹 보드(읽기 전용 집계). 보드: level(레벨→exp→id 오름차순) | weekly_pvp(주간 PvP 완주 승수→레벨→exp→마지막 승리 시각 빠른 순→id).
 * 서버 정산 데이터만 사용: users.level/exp, battles.winner_user_id(settle 시 기록). 게스트·정지 계정 제외(게스트는 config로만 포함 가능).
 * 응답에는 user_id/이메일/실명을 절대 넣지 않는다(화이트리스트: rank, name, level, exp, wins, is_me).
 */
class RankingService
{
    public const BOARDS = ['level', 'weekly_pvp'];

    public function enabled(): bool
    {
        return (bool) config('game.ranking.public');
    }

    private function weeklyAvailable(): bool
    {
        return Schema::hasColumn('battles', 'winner_user_id') && Schema::hasColumn('battles', 'win_by_forfeit');
    }

    private function eligibleUsers(Builder $q, string $col = 'users'): Builder
    {
        $q->whereNull("$col.banned_at");
        config('game.ranking.include_guests') || $q->where("$col.is_guest", false);

        return $q;
    }

    /** 주간 승수 집계 서브쿼리(그룹 행: uid, wins, last_at, level, exp, name) */
    private function weeklyBase(): Builder
    {
        [$from, $to] = Period::weeklyRangeUtc();
        $q = DB::table('battles')->join('users', 'users.id', '=', 'battles.winner_user_id')
            ->where('battles.mode', 'pvp')->where('battles.status', 'finished')->whereNotNull('battles.winner_user_id')
            ->where('battles.settled_at', '>=', $from->format('Y-m-d H:i:s'))->where('battles.settled_at', '<', $to->format('Y-m-d H:i:s'));
        config('game.ranking.count_forfeit_wins') || $q->where('battles.win_by_forfeit', false);
        Schema::hasColumn('battles', 'pvp_recognized') && $q->where('battles.pvp_recognized', true);   // 퀘스트와 같은 인정 기준(settle 시 계산값)
        $this->eligibleUsers($q);

        return $q->groupBy('battles.winner_user_id', 'users.level', 'users.exp', 'users.name')
            ->selectRaw('battles.winner_user_id as uid, count(*) as wins, max(battles.settled_at) as last_at, users.level as level, users.exp as exp, users.name as name');
    }

    /** 상위 N(내부용: uid 포함, 캐시 대상) */
    private function top(string $board): array
    {
        $n = (int) config('game.ranking.top');
        $out = [];
        if ($board === 'level') {
            $rows = $this->eligibleUsers(DB::table('users'))->orderByDesc('level')->orderByDesc('exp')->orderBy('id')->limit($n)->get(['id', 'name', 'level', 'exp']);
            foreach ($rows as $i => $r) {
                $out[] = ['uid' => (int) $r->id, 'rank' => $i + 1, 'name' => (string) $r->name, 'level' => (int) $r->level, 'exp' => (int) $r->exp];
            }

            return $out;
        }
        if (! $this->weeklyAvailable()) {
            return [];
        }
        $rows = DB::query()->fromSub($this->weeklyBase(), 't')->orderByDesc('wins')->orderByDesc('level')->orderByDesc('exp')->orderBy('last_at')->orderBy('uid')->limit($n)->get();
        foreach ($rows as $i => $r) {
            $out[] = ['uid' => (int) $r->uid, 'rank' => $i + 1, 'name' => (string) $r->name, 'level' => (int) $r->level, 'exp' => (int) $r->exp, 'wins' => (int) $r->wins];
        }

        return $out;
    }

    /** 내 순위/값(캐시하지 않음: 개인별 최신). rank=null이면 순위권 밖(주간 0승) */
    private function mine(string $board, User $user): array
    {
        $u = DB::table('users')->where('id', $user->id)->first(['id', 'name', 'level', 'exp', 'is_guest', 'banned_at']);
        if (($u->is_guest && ! config('game.ranking.include_guests')) || $u->banned_at) {
            return [null, $u->is_guest ? 'excluded_guest' : 'excluded_banned'];
        }
        $base = ['name' => (string) $u->name, 'level' => (int) $u->level, 'exp' => (int) $u->exp, 'is_me' => true];
        if ($board === 'level') {
            $ahead = $this->eligibleUsers(DB::table('users'))->where(function ($q) use ($u) {
                $q->where('level', '>', $u->level)->orWhere(fn ($q) => $q->where('level', $u->level)->where('exp', '>', $u->exp))
                    ->orWhere(fn ($q) => $q->where('level', $u->level)->where('exp', $u->exp)->where('id', '<', $u->id));
            })->count();

            return [['rank' => $ahead + 1] + $base, 'ok'];
        }
        $row = $this->weeklyAvailable() ? DB::query()->fromSub($this->weeklyBase(), 't')->where('uid', $u->id)->first() : null;
        if (! $row) {
            return [['rank' => null, 'wins' => 0] + $base, 'unranked'];
        }
        $ahead = DB::query()->fromSub($this->weeklyBase(), 't')->where(function ($q) use ($row) {
            $q->where('wins', '>', $row->wins)
                ->orWhere(fn ($q) => $q->where('wins', $row->wins)->where('level', '>', $row->level))
                ->orWhere(fn ($q) => $q->where('wins', $row->wins)->where('level', $row->level)->where('exp', '>', $row->exp))
                ->orWhere(fn ($q) => $q->where('wins', $row->wins)->where('level', $row->level)->where('exp', $row->exp)->where('last_at', '<', $row->last_at))
                ->orWhere(fn ($q) => $q->where('wins', $row->wins)->where('level', $row->level)->where('exp', $row->exp)->where('last_at', $row->last_at)->where('uid', '<', $row->uid));
        })->count();

        return [['rank' => $ahead + 1, 'wins' => (int) $row->wins] + $base, 'ok'];
    }

    public function board(string $board, User $user): array
    {
        if (! in_array($board, self::BOARDS, true)) {
            throw new IllegalAction('invalid_board', 'board는 level 또는 weekly_pvp 여야 합니다.');
        }
        $weekKey = $board === 'weekly_pvp' ? Period::weeklyKey() : null;
        $top = Cache::remember('ranking:v1:'.$board.':'.($weekKey ?? '-'), max(1, (int) config('game.ranking.cache_seconds')), fn () => $this->top($board));
        $entries = [];
        foreach ($top as $t) {   // 화이트리스트 변환: uid는 내부 전용이라 응답에서 제외
            $e = ['rank' => $t['rank'], 'name' => $t['name'], 'level' => $t['level'], 'exp' => $t['exp']];
            isset($t['wins']) && $e['wins'] = $t['wins'];
            $e['is_me'] = $t['uid'] === (int) $user->id;
            $entries[] = $e;
        }
        // 내 순위: 유저별 15초 캐시(코드 상수). 인덱스 제안: battles(mode, status, settled_at, winner_user_id) 복합(DB 이전 시 검토)
        [$me, $status] = Cache::remember('ranking:mine:v1:'.$board.':'.($weekKey ?? '-').':'.(int) $user->id, 15, fn () => $this->mine($board, $user));
        $week = null;
        if ($weekKey) {
            [$from, $to] = Period::weeklyRangeUtc();
            $week = ['key' => $weekKey, 'starts_at' => $from->setTimezone(Period::TZ)->toIso8601String(), 'resets_at' => $to->setTimezone(Period::TZ)->toIso8601String()];
        }

        return ['board' => $board, 'week' => $week, 'entries' => $entries, 'me' => $me, 'me_status' => $status];
    }
}
