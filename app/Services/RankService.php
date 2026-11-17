<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\Battle;
use App\Models\User;
use App\Support\RoomRealtime;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * 멀티 랭크(P5): Elo 레이팅·4주 시즌·랭킹·매치 대기열. config game.rank.enabled=false(기본)면 컨트롤러가 404로 막는다.
 * 매칭 성사 시 새 전투 엔진을 만들지 않고 기존 방(RoomService)·배치·전투 경로를 그대로 쓴다: private pvp 방 + 두 참가자 ready 후 start().
 * 레이팅 반영은 BattleService::settle 의 pvp 분기 훅(onBattleSettled)에서 멱등으로 처리한다(rank_matches.status active -> settled 선점).
 */
class RankService
{
    public function __construct(private readonly RoomService $rooms)
    {
    }

    public function enabled(): bool
    {
        return (bool) config('game.rank.enabled');
    }

    private function cfg(string $k): int
    {
        return (int) config("game.rank.$k");
    }

    // ---------- Elo ----------

    public static function expected(int $ra, int $rb): float
    {
        return 1.0 / (1.0 + 10 ** (($rb - $ra) / 400));
    }

    /** @return array{0:int,1:int} [A 변동, B 변동]. 합 0(제로섬). score: A 기준 1=승, 0.5=무, 0=패 */
    public static function deltas(int $ra, int $rb, float $scoreA, int $k): array
    {
        $d = (int) round($k * ($scoreA - self::expected($ra, $rb)));

        return [$d, -$d];
    }

    // ---------- 시즌 ----------

    /** 현재 시즌(없으면 생성, 만료 시즌은 ended 처리 후 직전 종료 시각부터 이어서 다음 시즌 생성) */
    public function currentSeason(?Carbon $at = null): object
    {
        $at ??= now();
        $cur = DB::table('rank_seasons')->where('status', 'active')->where('starts_at', '<=', $at)->where('ends_at', '>', $at)->orderByDesc('id')->first();
        if ($cur) {
            return $cur;
        }

        return DB::transaction(function () use ($at) {
            DB::table('rank_seasons')->where('status', 'active')->where('ends_at', '<=', $at)->update(['status' => 'ended', 'updated_at' => now()]);
            $last = DB::table('rank_seasons')->orderByDesc('ends_at')->first();
            $days = $this->cfg('season_days');
            $start = $last ? Carbon::parse($last->ends_at, 'UTC') : \App\Support\Period::weeklyRangeUtc($at)[0];
            while ($start->copy()->addDays($days)->lte($at)) {   // 오래 비어 있었으면 현재를 덮는 구간까지 건너뜀(빈 시즌 행은 만들지 않음)
                $start = $start->copy()->addDays($days);
            }
            $n = DB::table('rank_seasons')->count() + 1;
            $id = DB::table('rank_seasons')->insertGetId([
                'name' => '랭크 시즌 '.$n, 'starts_at' => $start->format('Y-m-d H:i:s'), 'ends_at' => $start->copy()->addDays($days)->format('Y-m-d H:i:s'),
                'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
            ]);

            return DB::table('rank_seasons')->where('id', $id)->first();
        });
    }

    private function seasonView(object $s): array
    {
        $tz = \App\Support\Period::TZ;

        return ['id' => (int) $s->id, 'name' => $s->name,
            'starts_at' => Carbon::parse($s->starts_at, 'UTC')->setTimezone($tz)->toIso8601String(),
            'ends_at' => Carbon::parse($s->ends_at, 'UTC')->setTimezone($tz)->toIso8601String()];
    }

    // ---------- 레이팅 ----------

    public function ratingRow(int $seasonId, int $userId): object
    {
        $row = DB::table('rank_ratings')->where(['season_id' => $seasonId, 'user_id' => $userId])->first();
        if ($row) {
            return $row;
        }
        $start = $this->cfg('start_rating');
        $prev = DB::table('rank_ratings')->where('user_id', $userId)->where('season_id', '<', $seasonId)->orderByDesc('season_id')->value('rating');   // 시즌 소프트 리셋: 이전 시즌 레이팅을 start 쪽으로 carry_pct 만큼만 유지
        $prev !== null && $start = (int) round($start + ((int) $prev - $start) * $this->cfg('season_carry_pct') / 100);
        DB::table('rank_ratings')->insertOrIgnore(['season_id' => $seasonId, 'user_id' => $userId, 'rating' => $start, 'peak_rating' => $start, 'created_at' => now(), 'updated_at' => now()]);

        return DB::table('rank_ratings')->where(['season_id' => $seasonId, 'user_id' => $userId])->first();
    }

    private function eligible(User $user): void
    {
        if ($user->banned_at) {
            throw new IllegalAction('banned', '정지된 계정입니다.', 403);
        }
        if ($user->is_guest && ! config('game.rank.allow_guests')) {
            throw new IllegalAction('guest_not_allowed', '랭크 대전은 정식 계정만 참여할 수 있습니다.', 403);
        }
    }

    /** 내 레이팅 + 시즌 + 순위 */
    public function me(User $user): array
    {
        $s = $this->currentSeason();
        $r = $this->ratingRow($s->id, $user->id);

        return ['season' => $this->seasonView($s), 'me' => $this->entry($s, $r, $user->name, true)];
    }

    private function entry(object $season, object $r, string $name, bool $isMe): array
    {
        $games = $r->wins + $r->losses + $r->draws;

        return ['rank' => $games > 0 ? $this->rankOf($season->id, $r) : null, 'name' => $name, 'rating' => (int) $r->rating, 'peak_rating' => (int) $r->peak_rating,
            'wins' => (int) $r->wins, 'losses' => (int) $r->losses, 'draws' => (int) $r->draws, 'games' => $games, 'is_me' => $isMe,
            'tier' => ['code' => ($t = $this->tierOf((int) $r->rating))['code'], 'name' => $t['name']]];
    }

    /** 레이팅 -> 티어(config game.rank.season_rewards.tiers, min_rating 이 큰 것부터 매칭) */
    public function tierOf(int $rating): array
    {
        $tiers = (array) config('game.rank.season_rewards.tiers');
        usort($tiers, fn ($a, $b) => $b['min_rating'] <=> $a['min_rating']);
        foreach ($tiers as $t) {
            if ($rating >= (int) $t['min_rating']) {
                return $t;
            }
        }

        return $tiers[count($tiers) - 1] ?? ['code' => 'none', 'name' => '', 'min_rating' => 0, 'gold' => 0, 'title' => null];
    }

    private function ranked(int $seasonId)
    {
        $q = DB::table('rank_ratings')->join('users', 'users.id', '=', 'rank_ratings.user_id')
            ->where('rank_ratings.season_id', $seasonId)->whereRaw('(rank_ratings.wins + rank_ratings.losses + rank_ratings.draws) > 0')
            ->whereNull('users.banned_at');
        config('game.rank.allow_guests') || $q->where('users.is_guest', false);

        return $q;
    }

    /** 순위: 레이팅 내림차순 -> 먼저 달성(updated_at 빠른 순) -> user_id */
    private function rankOf(int $seasonId, object $r): int
    {
        return 1 + $this->ranked($seasonId)->where(function ($q) use ($r) {
            $q->where('rank_ratings.rating', '>', $r->rating)
                ->orWhere(fn ($q) => $q->where('rank_ratings.rating', $r->rating)->where('rank_ratings.updated_at', '<', $r->updated_at))
                ->orWhere(fn ($q) => $q->where('rank_ratings.rating', $r->rating)->where('rank_ratings.updated_at', $r->updated_at)->where('rank_ratings.user_id', '<', $r->user_id));
        })->count();
    }

    /** 랭킹: 상위 N + 내 순위. user_id/이메일은 응답에 넣지 않는다. */
    public function ranking(User $user): array
    {
        $s = $this->currentSeason();
        $rows = $this->ranked($s->id)->orderByDesc('rank_ratings.rating')->orderBy('rank_ratings.updated_at')->orderBy('rank_ratings.user_id')
            ->limit($this->cfg('top'))->get(['rank_ratings.*', 'users.name']);
        $entries = [];
        foreach ($rows as $i => $r) {
            $games = $r->wins + $r->losses + $r->draws;
            $entries[] = ['rank' => $i + 1, 'name' => (string) $r->name, 'rating' => (int) $r->rating, 'wins' => (int) $r->wins, 'losses' => (int) $r->losses, 'draws' => (int) $r->draws, 'games' => $games, 'is_me' => (int) $r->user_id === (int) $user->id];
        }
        $mine = $this->ratingRow($s->id, $user->id);

        return ['season' => $this->seasonView($s), 'entries' => $entries, 'me' => $this->entry($s, $mine, $user->name, true)];
    }

    // ---------- 대기열 ----------

    private function allowedRange(int $waitSeconds): int
    {
        return min($this->cfg('max_range'), $this->cfg('base_range') + intdiv(max(0, $waitSeconds), 10) * $this->cfg('expand_per_10s'));
    }

    private function inRoom(int $userId): bool
    {
        return DB::table('rooms')->join('room_players', 'room_players.room_id', '=', 'rooms.id')
            ->where('room_players.user_id', $userId)->whereIn('rooms.status', ['waiting', 'deployment', 'in_progress'])->exists();
    }

    private function activeMatchOf(int $userId): ?object
    {
        return DB::table('rank_matches')->where('status', 'active')->where(fn ($q) => $q->where('user_a_id', $userId)->orWhere('user_b_id', $userId))->orderByDesc('id')->first();
    }

    public function enqueue(User $user): array
    {
        $this->eligible($user);
        $this->assertNoForfeitCooldown($user->id);
        $this->rooms->expireStale();
        $this->sweep();
        $s = $this->currentSeason();
        DB::transaction(function () use ($user, $s) {
            if ($this->activeMatchOf($user->id)) {
                throw new IllegalAction('already_in_match', '진행 중인 랭크 매치가 있습니다.', 409);
            }
            if (DB::table('rank_queue')->where('user_id', $user->id)->exists()) {
                return;   // 멱등
            }
            if ($this->inRoom($user->id)) {
                throw new IllegalAction('already_in_room', '이미 참여 중인 방이 있습니다.', 409);
            }
            $r = $this->ratingRow($s->id, $user->id);
            DB::table('rank_queue')->insert(['user_id' => $user->id, 'rating' => $r->rating, 'queued_at' => now(), 'last_polled_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        });
        $this->tryMatch($user->id);

        return $this->status($user, false);
    }

    public function cancel(User $user): array
    {
        $deleted = DB::table('rank_queue')->where('user_id', $user->id)->delete();
        $m = $this->activeMatchOf($user->id);
        if ($deleted === 0 && $m) {
            throw new IllegalAction('already_matched', '이미 매칭되었습니다. 방에서 나가면 기권패 처리됩니다.', 409, ['room_code' => $this->roomCode($m)]);
        }

        return ['state' => 'idle', 'cancelled' => $deleted > 0];
    }

    /** 상태 폴링(대기 중 last_polled_at 갱신 + 매칭 시도 + 타임아웃). state: idle|queued|matched */
    public function status(User $user, bool $poll = true): array
    {
        $this->eligible($user);
        if ($poll) {
            $this->rooms->expireStale();
            $this->sweep();
        }
        $q = DB::table('rank_queue')->where('user_id', $user->id)->first();
        if ($q && $poll) {
            if (Carbon::parse($q->queued_at)->addSeconds($this->cfg('queue_timeout_seconds'))->lte(now())) {
                DB::table('rank_queue')->where('user_id', $user->id)->delete();

                return ['state' => 'idle', 'timeout' => true];
            }
            DB::table('rank_queue')->where('user_id', $user->id)->update(['last_polled_at' => now()]);
            $this->tryMatch($user->id);
            $q = DB::table('rank_queue')->where('user_id', $user->id)->first();
        }
        if ($q) {
            $wait = (int) Carbon::parse($q->queued_at)->diffInSeconds(now(), true);

            return ['state' => 'queued', 'waited_seconds' => $wait, 'rating' => (int) $q->rating, 'range' => $this->allowedRange($wait),
                'timeout_in' => max(0, $this->cfg('queue_timeout_seconds') - $wait)];
        }
        $m = $this->activeMatchOf($user->id);
        if ($m) {
            $mine = (int) $m->user_a_id === (int) $user->id;
            $opp = DB::table('users')->where('id', $mine ? $m->user_b_id : $m->user_a_id)->value('name');

            return ['state' => 'matched', 'match_id' => (int) $m->id, 'room_code' => $this->roomCode($m), 'side' => $mine ? 'a' : 'b',
                'opponent' => ['name' => (string) $opp, 'rating' => (int) ($mine ? $m->rating_b_before : $m->rating_a_before)],
                'deploy_deadline_seconds' => $this->cfg('deploy_timeout_seconds')];
        }

        return ['state' => 'idle'];
    }

    /** 내 매치의 레이팅 변동 조회(참가자만, 그 외 404 match_not_found). 미정산(active)은 after/delta null */
    public function matchResult(User $user, int $id): array
    {
        $m = DB::table('rank_matches')->where('id', $id)->where(fn ($q) => $q->where('user_a_id', $user->id)->orWhere('user_b_id', $user->id))->first();
        if (! $m) {
            throw new \App\Game\IllegalAction('match_not_found', '매치를 찾을 수 없습니다.', 404);
        }
        $mine = (int) $m->user_a_id === (int) $user->id;
        $before = (int) ($mine ? $m->rating_a_before : $m->rating_b_before);
        $afterRaw = $mine ? $m->rating_a_after : $m->rating_b_after;
        $after = $afterRaw === null ? null : (int) $afterRaw;
        $result = $m->result === null ? null : ($m->result === 'draw' ? 'draw' : (($m->result === 'a') === $mine ? 'win' : 'loss'));
        $opp = DB::table('users')->where('id', $mine ? $m->user_b_id : $m->user_a_id)->value('name');

        return ['match_id' => (int) $m->id, 'status' => $m->status, 'result' => $result, 'reason' => $m->reason, 'side' => $mine ? 'a' : 'b',
            'rating_before' => $before, 'rating_after' => $after, 'delta' => $after === null ? null : $after - $before,
            'opponent' => ['name' => (string) $opp, 'rating' => (int) ($mine ? $m->rating_b_before : $m->rating_a_before)], 'settled_at' => $m->settled_at];
    }

    private function roomCode(object $m): ?string
    {
        return $m->room_id ? DB::table('rooms')->where('id', $m->room_id)->value('code') : null;
    }

    /** 나와 가장 가까운(레이팅 차 -> 오래 기다린 순) 상대를 찾아 매치 생성. 쓰기 경합은 큐 행 delete 선점으로 직렬화 */
    private function tryMatch(int $userId): void
    {
        $me = DB::table('rank_queue')->where('user_id', $userId)->first();
        if (! $me) {
            return;
        }
        $fresh = now()->subSeconds($this->cfg('queue_stale_seconds'));
        DB::table('rank_queue')->where('last_polled_at', '<', $fresh)->where('user_id', '!=', $userId)->delete();   // 유령 대기 정리
        $myWait = (int) Carbon::parse($me->queued_at)->diffInSeconds(now(), true);
        $lastOpp = config('game.rank.abuse.avoid_last_opponent') ? $this->lastOpponentOf($userId) : null;
        $best = null;
        $bestKey = null;
        foreach (DB::table('rank_queue')->where('user_id', '!=', $userId)->get() as $o) {
            $diff = abs($o->rating - $me->rating);
            $oWait = (int) Carbon::parse($o->queued_at)->diffInSeconds(now(), true);
            if ($lastOpp !== null && (int) $o->user_id === $lastOpp && max($myWait, $oWait) < (int) config('game.rank.abuse.avoid_last_wait_seconds')) {
                continue;   // 직전 상대 제외(인구가 적으면 오래 기다린 뒤에는 허용)
            }
            if ($diff > max($this->allowedRange($myWait), $this->allowedRange($oWait))) {
                continue;
            }
            $key = [$diff, -$oWait, $o->id];
            if ($bestKey === null || $key < $bestKey) {
                $best = $o;
                $bestKey = $key;
            }
        }
        if (! $best) {
            return;
        }
        DB::transaction(function () use ($me, $best) {
            // 두 행을 모두 선점해야 성사(동시 호출 중복 매칭 방지)
            if (DB::table('rank_queue')->where('id', $me->id)->delete() !== 1) {
                return;
            }
            if (DB::table('rank_queue')->where('id', $best->id)->delete() !== 1) {
                DB::table('rank_queue')->insert((array) $me);   // 상대가 먼저 채감 -> 내 대기 복구

                return;
            }
            $this->createMatch((int) $me->user_id, (int) $me->rating, (int) $best->user_id, (int) $best->rating);
        });
    }

    /** 기존 방 경로 재사용: private pvp 방(랜덤 공정 맵) + 둘 다 ready -> RoomService::start(배치 단계). 선공(side a)은 무작위 */
    private function createMatch(int $u1, int $r1, int $u2, int $r2): void
    {
        if (random_int(0, 1) === 1) {
            [$u1, $r1, $u2, $r2] = [$u2, $r2, $u1, $r1];
        }
        $s = $this->currentSeason();
        $host = User::findOrFail($u1);
        $room = $this->rooms->create($host, 'pvp', 'private', 'random');   // already_in_room 이면 예외 -> 트랜잭션 롤백(큐 행 복구됨)
        DB::table('room_players')->insert(['room_id' => $room->id, 'user_id' => $u2, 'side' => 'b', 'ready' => true, 'last_seen_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
        $started = $this->rooms->start($host, $room->code);
        DB::table('rank_matches')->insert([
            'season_id' => $s->id, 'room_id' => $room->id, 'battle_id' => $started->battle_id, 'user_a_id' => $u1, 'user_b_id' => $u2,
            'rating_a_before' => $r1, 'rating_b_before' => $r2, 'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);
        $matchId = (int) DB::table('rank_matches')->where('room_id', $room->id)->value('id');
        RoomRealtime::rankMatched($u1, $matchId);   // 웹소켓 ping(커밋 후): 두 유저가 GET /rank/queue 를 즉시 재조회
        RoomRealtime::rankMatched($u2, $matchId);
    }

    /** 스케줄러(5초) 매칭: 폴링 없이도(웹소켓 연결로 클라이언트 폴링이 느려져도) 대기열을 맞춘다. 유령 대기 정리는 tryMatch 가 수행 */
    public function matchQueued(): int
    {
        if (! $this->enabled()) {
            return 0;
        }
        $before = DB::table('rank_queue')->count();
        foreach (DB::table('rank_queue')->orderBy('id')->pluck('user_id') as $uid) {
            $this->tryMatch((int) $uid);
        }

        return $before - DB::table('rank_queue')->count();
    }

    // ---------- 정산/이탈 ----------

    /** BattleService::settle(pvp) 훅. 랭크 매치가 아니면 아무것도 하지 않는다. 멱등 */
    public function onBattleSettled(Battle $b): void
    {
        $m = DB::table('rank_matches')->where('battle_id', $b->id)->where('status', 'active')->first();
        if (! $m) {
            return;
        }
        $winner = $b->winner;
        $score = $winner === 'a' ? 1.0 : ($winner === 'b' ? 0.0 : 0.5);   // 포기/타임아웃/접속끊김은 엔진이 상대 승리(winner)로 기록 -> 포기=패
        $reason = str_starts_with((string) ($b->state['end_reason'] ?? ''), 'forfeit_') ? (string) $b->state['end_reason'] : 'normal';
        $turn = (int) ($b->state['turn'] ?? $b->turn ?? 99);
        DB::transaction(function () use ($m, $score, $reason, $turn) {
            if (DB::table('rank_matches')->where('id', $m->id)->where('status', 'active')->update(['status' => 'settled']) !== 1) {
                return;
            }
            $ra = $this->ratingRow($m->season_id, $m->user_a_id);
            $rb = $this->ratingRow($m->season_id, $m->user_b_id);
            [$da, $db] = self::deltas((int) $ra->rating, (int) $rb->rating, $score, $this->cfg('elo_k'));
            $f = $this->deltaFactor($m, $reason, $turn);
            if ($f !== 1.0) {
                $da = (int) round($da * $f);
                $db = -$da;   // 제로섬 유지
            }
            foreach ([[$ra, $da, $score], [$rb, $db, 1.0 - $score]] as [$r, $d, $sc]) {
                $new = (int) $r->rating + $d;
                DB::table('rank_ratings')->where('id', $r->id)->update([
                    'rating' => $new, 'peak_rating' => max((int) $r->peak_rating, $new),
                    'wins' => $r->wins + ($sc === 1.0 ? 1 : 0), 'losses' => $r->losses + ($sc === 0.0 ? 1 : 0), 'draws' => $r->draws + ($sc === 0.5 ? 1 : 0),
                    'last_match_at' => now(), 'updated_at' => now(),
                ]);
            }
            if ($score !== 0.5 && $reason === 'normal') {   // 펜: 정상 종료 승리자에게만(기권·접속끊김 승리는 제외), 멱등 ref=매치
                app(PenService::class)->grantFor((int) ($score === 1.0 ? $m->user_a_id : $m->user_b_id), 'rank_win', 'rank_pen_win', 'rank_match', (int) $m->id);
            }
            DB::table('rank_matches')->where('id', $m->id)->update([
                'result' => $score === 1.0 ? 'a' : ($score === 0.0 ? 'b' : 'draw'), 'reason' => $reason,
                'rating_a_after' => (int) $ra->rating + $da, 'rating_b_after' => (int) $rb->rating + $db, 'settled_at' => now(), 'updated_at' => now(),
            ]);
        });
    }

    /**
     * 지연 정리(스케줄러 없음, 큐 API 호출 시):
     * - 방이 닫혔거나 전투가 abandoned 인 active 매치(TTL 만료 등) -> void(레이팅 변동 없음)
     * - 배치 단계가 deploy_timeout_seconds 를 넘김: 한쪽만 미확정 -> 그쪽 기권패(RoomService::leave -> settle 훅), 둘 다 미확정 -> void
     */
    public function sweep(): void
    {
        $this->closeSeasons();
        $matches = DB::table('rank_matches')->where('status', 'active')->get();
        foreach ($matches as $m) {
            $room = $m->room_id ? DB::table('rooms')->where('id', $m->room_id)->first() : null;
            $battle = $m->battle_id ? DB::table('battles')->where('id', $m->battle_id)->first() : null;
            if (! $room || $room->status === 'closed' || ($battle && $battle->status === 'abandoned')) {
                $this->voidMatch($m, 'abandoned');
                continue;
            }
            if ($room->status === 'finished' && $battle && $battle->status === 'finished' && $battle->settled_at) {
                $this->onBattleSettled(Battle::find($battle->id));   // 훅 누락 보정
                continue;
            }
            if ($room->status === 'deployment' && Carbon::parse($m->created_at)->addSeconds($this->cfg('deploy_timeout_seconds'))->lte(now())) {
                $unconf = DB::table('room_players')->where('room_id', $room->id)->where('confirmed', false)->pluck('user_id');
                if ($unconf->count() === 1) {
                    $this->rooms->leave(User::findOrFail($unconf->first()), $room->code);
                } elseif ($unconf->count() >= 2) {
                    DB::table('rooms')->where('id', $room->id)->update(['status' => 'closed', 'updated_at' => now()]);
                    DB::table('battles')->where('id', $m->battle_id)->whereIn('status', ['deployment', 'in_progress'])->update(['status' => 'abandoned', 'settled_at' => now(), 'turn_deadline_at' => null, 'updated_at' => now()]);
                    $this->voidMatch($m, 'deploy_timeout');
                }
            }
        }
    }

    /** 어뷰징 방지 배율: 같은 상대 반복 감쇠 x 짧은 정상 종료 축소 */
    private function deltaFactor(object $m, string $reason, int $turn): float
    {
        $c = (array) config('game.rank.abuse');
        $n = 1 + DB::table('rank_matches')->where('status', 'settled')->where('id', '!=', $m->id)
            ->where('settled_at', '>=', now()->subHours((int) $c['repeat_window_hours']))
            ->where(fn ($q) => $q->where(fn ($q) => $q->where('user_a_id', $m->user_a_id)->where('user_b_id', $m->user_b_id))
                ->orWhere(fn ($q) => $q->where('user_a_id', $m->user_b_id)->where('user_b_id', $m->user_a_id)))->count();
        $f = $n <= (int) $c['repeat_free'] ? 1.0 : ($n <= (int) $c['repeat_zero_after'] ? (int) $c['repeat_decay_pct'] / 100 : 0.0);
        if ($reason === 'normal' && $turn < (int) $c['short_game_min_turn']) {
            $f *= (int) $c['short_game_scale_pct'] / 100;
        }

        return $f;
    }

    private function lastOpponentOf(int $userId): ?int
    {
        $m = DB::table('rank_matches')->where(fn ($q) => $q->where('user_a_id', $userId)->orWhere('user_b_id', $userId))->orderByDesc('id')->first();

        return $m ? (int) ((int) $m->user_a_id === $userId ? $m->user_b_id : $m->user_a_id) : null;
    }

    /** 기권패 다발 쿨다운: window 분 안 기권패가 limit 회 이상이면 마지막 기권 후 cooldown 분간 큐 등록 불가 */
    private function assertNoForfeitCooldown(int $userId): void
    {
        $c = (array) config('game.rank.abuse');
        $rows = DB::table('rank_matches')->where('status', 'settled')->where('reason', 'like', 'forfeit%')
            ->where('settled_at', '>=', now()->subMinutes((int) $c['forfeit_window_minutes']))
            ->where(fn ($q) => $q->where(fn ($q) => $q->where('user_a_id', $userId)->where('result', 'b'))->orWhere(fn ($q) => $q->where('user_b_id', $userId)->where('result', 'a')))
            ->orderByDesc('settled_at')->pluck('settled_at');
        if ($rows->count() >= (int) $c['forfeit_limit']) {
            $until = Carbon::parse($rows->first())->addMinutes((int) $c['forfeit_cooldown_minutes']);
            if ($until->gt(now())) {
                throw new IllegalAction('queue_cooldown', '기권이 잦아 잠시 랭크 대기열에 들어갈 수 없습니다.', 429, ['retry_after' => (int) now()->diffInSeconds($until, true)]);
            }
        }
    }

    // ---------- 시즌 종료/보상 골격 ----------

    /** 시즌 보상표(계산만, 지급 없음): 시즌의 레이팅 행 중 min_games 이상을 티어로 분류 */
    public function rewardPlan(int $seasonId): array
    {
        $min = (int) config('game.rank.season_rewards.min_games');
        $out = [];
        foreach (DB::table('rank_ratings')->where('season_id', $seasonId)->whereRaw('(wins + losses + draws) >= ?', [$min])->orderByDesc('rating')->get() as $r) {
            $t = $this->tierOf((int) $r->rating);
            $out[] = ['user_id' => (int) $r->user_id, 'rating' => (int) $r->rating, 'tier' => $t['code'], 'gold' => (int) ($t['gold'] ?? 0), 'title' => $t['title'] ?? null];
        }

        return $out;
    }

    /**
     * 시즌 보상 지급(멱등). final 시즌만, rank.enabled 와 season_rewards.enabled 가 모두 true 일 때만 지급한다(아니면 0건).
     * 중복 방지: quest_event_log(user, event=rank_season_reward, ref=s{seasonId}) 선삽입 성공 건만 지급. gold<=0 이면 지급 없이 기록만(금액 빈 값 허용).
     * 칭호(title)는 유저 칭호 시스템이 없어 지급하지 않고 결과에만 싣는다.
     *
     * @return array<int,array{user_id:int,tier:string,gold:int,title:?string}> 이번 호출에서 새로 처리한 대상
     */
    public function payRewards(int $seasonId): array
    {
        if (! $this->enabled() || ! config('game.rank.season_rewards.enabled')) {
            return [];
        }
        if (DB::table('rank_seasons')->where('id', $seasonId)->value('status') !== 'final') {
            return [];
        }
        $paid = [];
        foreach ($this->rewardPlan($seasonId) as $p) {
            DB::transaction(function () use ($p, $seasonId, &$paid) {
                $new = DB::table('quest_event_log')->insertOrIgnore(['user_id' => $p['user_id'], 'event' => 'rank_season_reward', 'ref' => 's'.$seasonId, 'created_at' => now()]);
                if (! $new) {
                    return;
                }
                $p['gold'] > 0 && app(ProgressionService::class)->credit($p['user_id'], 'gold', $p['gold'], 'rank_season_reward', 'rank_season', $seasonId);
                $paid[] = ['user_id' => $p['user_id'], 'tier' => $p['tier'], 'gold' => $p['gold'], 'title' => $p['title']];
            });
        }

        return $paid;
    }

    /**
     * 시즌 종료 처리(sweep 에서 호출, 멱등): 기간이 끝난 active 시즌을 ended 로 바꾸고, 진행 중(active) 매치가 남지 않은 ended 시즌을 final 로 확정한다.
     * 진행 중이던 매치는 끝날 때까지 생성 시점 시즌(old)에 반영된다. 새 시즌은 currentSeason() 이 지연 생성하고 첫 레이팅은 소프트 리셋(season_carry_pct)으로 시작한다.
     * 보상 지급은 payRewards() 가 담당하며 자동 호출하지 않는다(rank.enabled && season_rewards.enabled 일 때 운영 스케줄러/어드민이 호출).
     */
    public function closeSeasons(): void
    {
        DB::table('rank_seasons')->where('status', 'active')->where('ends_at', '<=', now())->update(['status' => 'ended', 'updated_at' => now()]);
        foreach (DB::table('rank_seasons')->where('status', 'ended')->get() as $s) {
            if (! DB::table('rank_matches')->where('season_id', $s->id)->where('status', 'active')->exists()) {
                if (DB::table('rank_seasons')->where('id', $s->id)->where('status', 'ended')->update(['status' => 'final', 'updated_at' => now()])) {
                    $this->refreshCarry($s->id);
                }
            }
        }
    }

    /**
     * 소프트 리셋 이월값 보정: 이월은 새 시즌 행을 처음 만들 때 계산되는데, 그 시점에 이전 시즌이 아직 진행 중 매치를 갖고 있었다면 최종 레이팅과 어긋난다.
     * 이전 시즌이 final 로 확정되면, 다음 시즌 중 아직 한 판도 치르지 않은 행(wins+losses+draws=0)만 최종 레이팅 기준으로 다시 계산한다(치른 행은 건드리지 않음).
     */
    private function refreshCarry(int $finalSeasonId): void
    {
        $next = DB::table('rank_seasons')->where('id', '>', $finalSeasonId)->orderBy('id')->first();
        if (! $next) {
            return;
        }
        $start = $this->cfg('start_rating');
        $pct = $this->cfg('season_carry_pct');
        foreach (DB::table('rank_ratings')->where('season_id', $finalSeasonId)->get() as $r) {
            DB::table('rank_ratings')->where(['season_id' => $next->id, 'user_id' => $r->user_id])->whereRaw('(wins + losses + draws) = 0')
                ->update(['rating' => $v = (int) round($start + ((int) $r->rating - $start) * $pct / 100), 'peak_rating' => $v, 'updated_at' => now()]);
        }
    }

    private function voidMatch(object $m, string $reason): void
    {
        DB::table('rank_matches')->where('id', $m->id)->where('status', 'active')->update(['status' => 'void', 'reason' => $reason, 'settled_at' => now(), 'updated_at' => now()]);
    }
}
