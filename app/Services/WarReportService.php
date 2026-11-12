<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/** 시즌 전쟁 읽기 전용 보고: 순위, 전황 피드, 지난 시즌 기록. */
class WarReportService
{
    public function __construct(private readonly WarService $war)
    {
    }

    /** 시나리오 지정 > 유저 가입 시즌 > 최신 활성 시즌(WarService::resolveSeason) */
    private function season(?User $user = null, ?string $scenario = null): object
    {
        return $this->war->resolveSeason($user, $scenario);
    }

    /** 국가 점수 순위 + 개인 기여도 순위 + 내 국가 구성원 활약 */
    public function ranking(User $user, ?string $scenario = null): array
    {
        $season = $this->season($user, $scenario);
        $scn = $this->war->scenario($season->scenario_code);
        $meta = collect(array_merge($scn['retired_countries'] ?? [], $scn['countries']))->keyBy('code');   // 개편 전 시즌 기록의 철수 국가(명)도 이름·색 표기
        $owned = DB::table('season_territories')->where('season_id', $season->id)->selectRaw('owner_season_country_id as cid, count(*) as n')->groupBy('owner_season_country_id')->pluck('n', 'cid');
        $countries = DB::table('season_countries')->where('season_id', $season->id)->get()
            ->sort(fn ($a, $b) => [$b->score, $owned[$b->id] ?? 0, $a->id] <=> [$a->score, $owned[$a->id] ?? 0, $b->id])->values();
        $limit = (int) config('war.list_limit');
        $players = DB::table('season_members')->join('users', 'users.id', '=', 'season_members.user_id')->join('season_countries', 'season_countries.id', '=', 'season_members.season_country_id')
            ->where('season_members.season_id', $season->id)->orderByDesc('season_members.contribution')->orderBy('season_members.id')->limit($limit)
            ->get(['users.id as user_id', 'users.name', 'season_countries.country_code as country', 'season_members.contribution'])
            ->values()->map(fn ($m, $i) => ['rank' => $i + 1, 'name' => $m->name, 'country' => $m->country, 'contribution' => (int) $m->contribution, 'me' => (int) $m->user_id === (int) $user->id])->all();
        $me = DB::table('season_members')->where(['season_id' => $season->id, 'user_id' => $user->id])->first();
        $roster = [];
        if ($me) {
            $wins = DB::table('territory_contributions')->where('season_id', $season->id)->where('season_country_id', $me->season_country_id)->where('kind', 'attack_win')->selectRaw('user_id, count(*) as n')->groupBy('user_id')->pluck('n', 'user_id');
            $caps = DB::table('territory_contributions')->where('season_id', $season->id)->where('season_country_id', $me->season_country_id)->where('kind', 'capture_bonus')->selectRaw('user_id, count(*) as n')->groupBy('user_id')->pluck('n', 'user_id');
            $roster = DB::table('season_members')->join('users', 'users.id', '=', 'season_members.user_id')
                ->where('season_members.season_id', $season->id)->where('season_members.season_country_id', $me->season_country_id)
                ->orderByDesc('season_members.contribution')->orderBy('season_members.id')->limit($limit)->get(['users.id as user_id', 'users.name', 'season_members.contribution'])
                ->map(fn ($m) => ['name' => $m->name, 'contribution' => (int) $m->contribution, 'attack_wins' => (int) ($wins[$m->user_id] ?? 0), 'captures' => (int) ($caps[$m->user_id] ?? 0), 'me' => (int) $m->user_id === (int) $user->id])->all();
        }

        return [
            'season_id' => (int) $season->id,
            'countries' => $countries->map(fn ($c, $i) => ['rank' => $i + 1, 'code' => $c->country_code, 'name' => $meta[$c->country_code]['name'] ?? $c->country_code, 'color' => $meta[$c->country_code]['color'] ?? null,
                'ai_only' => ! empty($meta[$c->country_code]['ai_only']), 'score' => (int) $c->score, 'territories' => (int) ($owned[$c->id] ?? 0), 'member_count' => (int) $c->member_count])->all(),
            'players' => $players,
            'my_country_members' => $roster,
            'me' => $me ? ['contribution' => (int) $me->contribution, 'rank' => 1 + DB::table('season_members')->where('season_id', $season->id)->where('contribution', '>', $me->contribution)->count()] : null,
        ];
    }

    /** 전황 피드(앱 내 폴링). after_id 이후 이벤트를 최신순으로 */
    public function events(int $afterId, int $limit, ?string $scenario = null, ?User $user = null): array
    {
        $season = $this->season($user, $scenario);
        $sc = $this->war->scenario($season->scenario_code);
        $names = collect($sc['territories'])->pluck('name', 'code');
        $cNames = collect(array_merge($sc['retired_countries'] ?? [], $sc['countries']))->pluck('name', 'code');
        $codes = $this->war->countryCodes((int) $season->id);
        $rows = DB::table('war_events')->leftJoin('season_territories', 'season_territories.id', '=', 'war_events.season_territory_id')->leftJoin('users', 'users.id', '=', 'war_events.user_id')
            ->where('war_events.season_id', $season->id)->where('war_events.id', '>', $afterId)->orderBy('war_events.id', $afterId > 0 ? 'asc' : 'desc')->limit(max(1, min(100, $limit)))
            ->get(['war_events.*', 'season_territories.territory_code', 'users.name as user_name']);

        return [
            'season_id' => (int) $season->id,
            'events' => $rows->map(fn ($e) => [
                'id' => (int) $e->id, 'type' => $e->type, 'country' => $codes[$e->season_country_id] ?? null, 'country_name' => $cNames[$codes[$e->season_country_id] ?? ''] ?? null,
                'territory' => $e->territory_code, 'territory_name' => $names[$e->territory_code] ?? null, 'user' => $e->user_name,
                'payload' => json_decode((string) $e->payload, true) ?: (object) [], 'created_at' => $e->created_at,
            ])->all(),
            'order' => $afterId > 0 ? 'asc' : 'desc',   // after_id 지정 = 오래된 것부터 limit(놓친 이벤트 없이 이어받기), 미지정 = 최신 limit개 최신순
            'last_id' => (int) ($rows->max('id') ?? $afterId),   // 실제 반환한 마지막(최대) id: 다음 폴링의 after_id
        ];
    }

    /**
     * 로비 알림용 안 읽은 이벤트 수. 내 국가 관련 = FE isMyCountryAlert 와 같은 정의:
     * type in (capture, capital_fall, capital_siege) 이며 (이벤트 country == 내 국가 | payload.from == 내 국가 | capital_siege 이고 영토 현재 소유국 == 내 국가).
     * 시즌 없음·미가입·게스트는 {count:0,last_id:0,my_country:null}. 타 유저 정보 미노출(집계만).
     *
     * @return array{count:int,last_id:int,my_country:?string}
     */
    public function unread(User $user, int $afterId, ?string $scenario = null): array
    {
        $none = ['count' => 0, 'last_id' => 0, 'my_country' => null, 'season_id' => null];
        try {
            $season = $this->war->resolveSeason($user, $scenario);
        } catch (IllegalAction) {
            $season = null;
        }
        if (! $season || $user->is_guest) {
            return $none;
        }
        $none['season_id'] = (int) $season->id;
        $me = DB::table('season_members')->join('season_countries', 'season_countries.id', '=', 'season_members.season_country_id')
            ->where(['season_members.season_id' => $season->id, 'season_members.user_id' => $user->id])->first(['season_countries.id as sc_id', 'season_countries.country_code']);
        if (! $me) {
            return $none;
        }
        $code = $me->country_code;
        $rows = DB::table('war_events')->leftJoin('season_territories', 'season_territories.id', '=', 'war_events.season_territory_id')
            ->where('war_events.season_id', $season->id)->where('war_events.id', '>', $afterId)
            ->whereIn('war_events.type', ['capture', 'capital_fall', 'capital_siege'])
            ->orderBy('war_events.id')->limit(200)   // (season_id,id) 인덱스 범위 스캔, 상한 200
            ->get(['war_events.id', 'war_events.type', 'war_events.season_country_id', 'war_events.payload', 'season_territories.owner_season_country_id as owner_sc_id']);
        $count = 0;
        foreach ($rows as $e) {
            $from = (json_decode((string) $e->payload, true) ?: [])['from'] ?? null;
            if ((int) $e->season_country_id === (int) $me->sc_id || $from === $code || ($e->type === 'capital_siege' && (int) $e->owner_sc_id === (int) $me->sc_id)) {
                $count++;
            }
        }

        return ['count' => $count, 'last_id' => (int) DB::table('war_events')->where('season_id', $season->id)->max('id'), 'my_country' => $code, 'season_id' => (int) $season->id];
    }

    /** 내 공격 이력(활성 시즌, 최신순, 최근 N건). 진행 중 전투는 result=null, status=in_progress */
    public function myBattles(User $user, int $limit = 10, ?string $scenario = null): array
    {
        $season = $this->season($user, $scenario);
        $names = collect($this->war->scenario($season->scenario_code)['territories'])->pluck('name', 'code');
        $rows = DB::table('territory_battles')->join('season_territories', 'season_territories.id', '=', 'territory_battles.season_territory_id')
            ->join('battles', 'battles.id', '=', 'territory_battles.battle_id')
            ->where('territory_battles.season_id', $season->id)->where('territory_battles.attacker_user_id', $user->id)
            ->orderByDesc('territory_battles.id')->limit(max(1, min(50, $limit)))
            ->get(['territory_battles.*', 'season_territories.territory_code', 'battles.status as battle_status']);

        return ['season_id' => (int) $season->id, 'battles' => $rows->map(fn ($r) => [
            'battle_id' => (int) $r->battle_id, 'territory' => $r->territory_code, 'territory_name' => $names[$r->territory_code] ?? $r->territory_code,
            'status' => $r->battle_status, 'result' => $r->result, 'win' => $r->result === null ? null : $r->result === 'att_win',
            'occ_before' => $r->occ_before === null ? null : (int) $r->occ_before, 'occ_after' => $r->occ_after === null ? null : (int) $r->occ_after,
            'occ_delta' => $r->occ_delta === null ? null : (int) $r->occ_delta, 'captured' => (bool) $r->captured,
            'created_at' => $r->created_at, 'settled_at' => $r->settled_at,
        ])->all()];
    }

    /** 종료된 시즌 기록(최신순) */
    public function history(User $user): array
    {
        $rows = DB::table('season_results')->join('seasons', 'seasons.id', '=', 'season_results.season_id')->orderByDesc('seasons.id')->limit(20)
            ->get(['seasons.id', 'seasons.name', 'seasons.start_at', 'seasons.ended_at', 'season_results.payload']);

        // 내부 user_id는 노출하지 않고 내 기록 표시용 me 플래그로 대체(닉네임 공개 범위는 기존 정책 유지)
        $strip = function (?array $m) use ($user) {
            if (! $m) {
                return null;
            }
            $me = (int) ($m['user_id'] ?? 0) === (int) $user->id;
            unset($m['user_id']);

            return $m + ['me' => $me];
        };

        return ['seasons' => $rows->map(function ($r) use ($strip) {
            $p = json_decode($r->payload, true) ?: [];
            $p['mvp'] = $strip($p['mvp'] ?? null);
            $p['top_contributors'] = array_map($strip, $p['top_contributors'] ?? []);

            return ['season_id' => (int) $r->id, 'name' => $r->name, 'start_at' => $r->start_at, 'ended_at' => $r->ended_at] + $p;
        })->all()];
    }
}
