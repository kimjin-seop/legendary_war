<?php

namespace App\Services;

use App\Game\ArmyBuilder;
use App\Game\IllegalAction;
use App\Models\Battle;
use App\Models\User;
use App\Support\DailyCounter;
use App\Support\FacingFlag;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\DB;

/**
 * 시즌 전쟁(수직 슬라이스): 국가 선택, 시즌 지도, 영토 공격 시작, 전투 종료 정산(점령도·소유권 이전).
 * 시나리오/영토 정의는 database/data/war/{code}.json, 규칙 수치는 config/war.php.
 * 모든 판정은 서버: 클라이언트는 어느 영토를 공격할지만 보내고 승패는 기존 엔진이 확정한다.
 * 기존 free/stage/pvp 정산과 분리된 핸들러(BattleService::settle 최상단 훅이 위임).
 */
class WarService
{
    public function __construct(
        private readonly GameData $data,
        private readonly ProgressionService $progress,
        private readonly BattleService $battles,
    ) {
    }

    // ---------------------------------------------------------------- 데이터/시드

    /** @return array{scenario:array,countries:array,territories:array,links:array} */
    public function scenario(string $code = 'imjin'): array
    {
        $path = database_path('data/war/'.preg_replace('/[^a-z0-9_]/', '', $code).'.json');
        if (! is_file($path)) {
            throw new IllegalAction('scenario_not_found', '시나리오를 찾을 수 없습니다.', 404);
        }

        return json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
    }

    /** 활성 시즌이 없으면 시나리오로 1개 생성(멱등). @return int season id */
    public function ensureSeason(string $code = 'imjin'): int
    {
        $existing = DB::table('seasons')->where('scenario_code', $code)->where('status', 'active')->value('id');
        $sc = $this->scenario($code);
        if ($existing) {
            $this->syncSeason((int) $existing, $sc);   // 시나리오 JSON이 늘었으면 빠진 국가·영토만 추가(소유권·점령도·점수 등 진행 상태는 보존)

            return (int) $existing;
        }

        return DB::transaction(function () use ($sc, $code) {
            $start = now();
            $sid = DB::table('seasons')->insertGetId([
                'scenario_code' => $code, 'name' => $sc['scenario']['name'], 'status' => 'active',
                'start_at' => $start, 'end_at' => $start->copy()->addDays((int) ($sc['scenario']['season_days'] ?? 28)),
                'created_at' => now(), 'updated_at' => now(),
            ]);
            $scIds = [];
            foreach ($sc['countries'] as $c) {
                $scIds[$c['code']] = DB::table('season_countries')->insertGetId(['season_id' => $sid, 'country_code' => $c['code'], 'created_at' => now(), 'updated_at' => now()]);
            }
            foreach ($sc['territories'] as $t) {
                DB::table('season_territories')->insert([
                    'season_id' => $sid, 'territory_code' => $t['code'], 'owner_season_country_id' => $scIds[$t['start_country']],
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }

            return $sid;
        });
    }

    /** 기존 시즌에 시나리오의 신규 국가/영토를 추가한다(기존 행은 수정하지 않음). */
    private function syncSeason(int $sid, array $sc): void
    {
        DB::transaction(function () use ($sid, $sc) {
            $scIds = DB::table('season_countries')->where('season_id', $sid)->pluck('id', 'country_code')->all();
            foreach ($sc['countries'] as $c) {
                $scIds[$c['code']] ??= DB::table('season_countries')->insertGetId(['season_id' => $sid, 'country_code' => $c['code'], 'created_at' => now(), 'updated_at' => now()]);
            }
            $this->pruneRetired($sid, $sc, $scIds);
            $have = DB::table('season_territories')->where('season_id', $sid)->pluck('territory_code')->all();
            foreach ($sc['territories'] as $t) {
                in_array($t['code'], $have, true) || DB::table('season_territories')->insert([
                    'season_id' => $sid, 'territory_code' => $t['code'], 'owner_season_country_id' => $scIds[$t['start_country']],
                    'created_at' => now(), 'updated_at' => now(),
                ]);
            }
        });
    }

    /**
     * 시나리오에서 빠진 국가·영토를 활성 시즌에서 정리(주 대립 2세력 개편). 빠진 영토는 전투/로그/기여/이벤트 행과 함께 삭제하고,
     * 빠진 국가의 가입자는 시나리오의 첫 사람 국가로 옮긴다(회원·가입 유지). 시나리오에 남은 영토가 빠진 국가 소유면 시작 국가로 돌려준다.
     */
    private function pruneRetired(int $sid, array $sc, array $scIds): void
    {
        $keepCountries = array_column($sc['countries'], 'code');
        $keepTerrs = array_column($sc['territories'], 'code');
        $fallback = collect($sc['countries'])->first(fn ($c) => empty($c['ai_only']))['code'] ?? null;
        $goneIds = DB::table('season_countries')->where('season_id', $sid)->whereNotIn('country_code', $keepCountries)->pluck('id')->all();
        $goneTerrIds = DB::table('season_territories')->where('season_id', $sid)->whereNotIn('territory_code', $keepTerrs)->pluck('id')->all();
        if (! $goneIds && ! $goneTerrIds) {
            return;
        }
        if ($goneTerrIds) {
            $battleIds = DB::table('territory_battles')->whereIn('season_territory_id', $goneTerrIds)->pluck('id')->all();
            foreach (array_chunk($battleIds, 400) as $ids) {
                DB::table('territory_contributions')->whereIn('territory_battle_id', $ids)->delete();
                DB::table('season_country_scores')->whereIn('territory_battle_id', $ids)->delete();
            }
            DB::table('territory_battles')->whereIn('season_territory_id', $goneTerrIds)->delete();   // battles.battle_id FK 는 nullOnDelete 방향이라 battles 행은 유지
            DB::table('territory_occupation_logs')->whereIn('season_territory_id', $goneTerrIds)->delete();
            DB::table('war_events')->whereIn('season_territory_id', $goneTerrIds)->delete();
            DB::table('season_territories')->whereIn('id', $goneTerrIds)->delete();
        }
        if ($goneIds) {
            $target = $fallback ? ($scIds[$fallback] ?? null) : null;
            if ($target) {
                $moved = (int) DB::table('season_members')->where('season_id', $sid)->whereIn('season_country_id', $goneIds)->count();
                DB::table('season_members')->where('season_id', $sid)->whereIn('season_country_id', $goneIds)->update(['season_country_id' => $target, 'updated_at' => now()]);
                $moved && DB::table('season_countries')->where('id', $target)->update(['member_count' => DB::raw('member_count + '.$moved), 'updated_at' => now()]);
            }
            foreach (DB::table('season_territories')->where('season_id', $sid)->whereIn('owner_season_country_id', $goneIds)->get() as $t) {
                $start = collect($sc['territories'])->firstWhere('code', $t->territory_code)['start_country'] ?? null;
                DB::table('season_territories')->where('id', $t->id)->update(['owner_season_country_id' => $scIds[$start] ?? $target, 'state' => 'peace', 'siege_season_country_id' => null, 'occupation' => 0, 'updated_at' => now()]);
            }
            DB::table('season_territories')->where('season_id', $sid)->whereIn('siege_season_country_id', $goneIds)->update(['state' => 'peace', 'siege_season_country_id' => null, 'occupation' => 0, 'updated_at' => now()]);
            DB::table('war_events')->where('season_id', $sid)->whereIn('season_country_id', $goneIds)->update(['season_country_id' => null]);
            DB::table('season_country_scores')->whereIn('season_country_id', $goneIds)->delete();
            DB::table('season_countries')->whereIn('id', $goneIds)->delete();
        }
    }

    /**
     * 활성 시즌 해석(시나리오별 시즌 동시 운영): 1) $scenario 지정 시 그 시나리오의 최신 활성 시즌 2) 없으면 유저가 가입한 활성 시즌(최신) 3) 그 외 최신 활성 시즌.
     * 시나리오를 지정했는데 활성 시즌이 없으면 season_not_found(404). $open true 면 종료 시각이 지난 시즌을 season_ended(409)로 거부(join/attack).
     */
    public function resolveSeason(?User $user = null, ?string $scenario = null, bool $open = false): object
    {
        $q = DB::table('seasons')->where('seasons.status', 'active');
        $s = null;
        if ($scenario !== null && $scenario !== '') {
            $s = (clone $q)->where('seasons.scenario_code', $scenario)->orderByDesc('seasons.id')->first(['seasons.*']);
            if (! $s) {
                throw new IllegalAction('season_not_found', '해당 시나리오의 진행 중인 시즌이 없습니다.', 404);
            }
        } elseif ($user !== null) {
            $s = (clone $q)->join('season_members', 'season_members.season_id', '=', 'seasons.id')->where('season_members.user_id', $user->id)->orderByDesc('seasons.id')->first(['seasons.*']);
        }
        $s ??= (clone $q)->orderByDesc('seasons.id')->first(['seasons.*']);
        if (! $s) {
            throw new IllegalAction('season_not_found', '진행 중인 시즌이 없습니다.', 404);
        }
        if ($open && $s->end_at && CarbonImmutable::parse($s->end_at, 'UTC')->isPast()) {
            throw new IllegalAction('season_ended', '시즌이 종료되었습니다.', 409);
        }

        return $s;
    }

    private function activeSeason(bool $open = false, ?User $user = null, ?string $scenario = null): object
    {
        return $this->resolveSeason($user, $scenario, $open);
    }

    /** 진행 중인 시즌 목록(시나리오 선택 UI용): [{season_id, scenario_code, name, end_at, joined, country}] */
    public function activeSeasons(User $user): array
    {
        $rows = DB::table('seasons')->where('status', 'active')->orderBy('id')->get(['id', 'scenario_code', 'name', 'end_at']);
        $mine = DB::table('season_members')->join('season_countries', 'season_countries.id', '=', 'season_members.season_country_id')
            ->where('season_members.user_id', $user->id)->whereIn('season_members.season_id', $rows->pluck('id'))->pluck('season_countries.country_code', 'season_members.season_id');

        return $rows->filter(fn ($r) => ! ($r->end_at && CarbonImmutable::parse($r->end_at, 'UTC')->isPast()))->map(fn ($r) => [
            'season_id' => (int) $r->id, 'scenario_code' => $r->scenario_code, 'name' => $r->name, 'end_at' => $r->end_at,
            'joined' => isset($mine[$r->id]), 'country' => $mine[$r->id] ?? null,
        ])->values()->all();
    }

    private function member(object $season, User $user): ?object
    {
        return DB::table('season_members')->where(['season_id' => $season->id, 'user_id' => $user->id])->first();
    }

    // ---------------------------------------------------------------- 조회

    /** 가벼운 활성 시즌 확인(FE 진입 분기용): 시즌 없음/종료 시각 경과여도 404 대신 active=false */
    public function active(User $user, ?string $scenario = null): array
    {
        try {
            $s = $this->resolveSeason($user, $scenario);
        } catch (IllegalAction) {
            return ['active' => false, 'season_id' => null, 'joined' => false, 'scenario_code' => null, 'seasons' => $this->activeSeasons($user)];
        }
        if ($s->end_at && CarbonImmutable::parse($s->end_at, 'UTC')->isPast()) {
            return ['active' => false, 'season_id' => null, 'joined' => false, 'scenario_code' => null, 'seasons' => $this->activeSeasons($user)];
        }

        return ['active' => true, 'season_id' => (int) $s->id, 'scenario_code' => $s->scenario_code, 'joined' => DB::table('season_members')->where(['season_id' => $s->id, 'user_id' => $user->id])->exists(), 'seasons' => $this->activeSeasons($user)];
    }

    public function state(User $user, ?string $scenario = null): array
    {
        $season = $this->activeSeason(false, $user, $scenario);
        $sc = $this->scenario($season->scenario_code);
        $meta = collect($sc['countries'])->keyBy('code');
        $rows = DB::table('season_countries')->where('season_id', $season->id)->orderBy('id')->get();
        $human = $rows->filter(fn ($r) => empty($meta[$r->country_code]['ai_only']));   // AI 전용 국가(명)는 정원·추천 계산에서 제외
        $recommended = $human->firstWhere('member_count', $human->min('member_count'))?->country_code;
        $me = $this->member($season, $user);
        $meCountry = $me ? $rows->firstWhere('id', $me->season_country_id) : null;
        $used = DailyCounter::value($this->attackKey($user));
        $limit = (int) config('war.daily_attack_limit');

        return [
            'scenario_code' => $season->scenario_code,
            'season' => ['id' => (int) $season->id, 'name' => $season->name, 'status' => $season->status, 'ended' => $season->end_at && CarbonImmutable::parse($season->end_at, 'UTC')->isPast(), 'start_at' => $season->start_at, 'end_at' => $season->end_at],
            'countries' => $rows->map(fn ($r) => [
                'code' => $r->country_code, 'name' => $meta[$r->country_code]['name'], 'color' => $meta[$r->country_code]['color'],
                'member_count' => (int) $r->member_count, 'score' => (int) $r->score, 'is_ai' => (int) $r->member_count === 0 || ! empty($meta[$r->country_code]['ai_only']),
                'recommended' => $r->country_code === $recommended,
                // UI 개편용 추가 필드(없으면 null): 국호 현지 표기 {native,native_script,native_lang} / 영토 진영 id(시나리오 countries[].plaque, territory_faction_id)
                'plaque' => $meta[$r->country_code]['plaque'] ?? null, 'territory_faction_id' => $meta[$r->country_code]['territory_faction_id'] ?? null,
                'allies' => $this->alliesView($sc, $r->country_code),   // 영토 없는 지원 세력 [{code,name,label}](시나리오 countries[].supporters, 없으면 [])
            ])->all(),
            'me' => ['joined' => $me !== null, 'country' => $meCountry?->country_code, 'contribution' => (int) ($me->contribution ?? 0),
                'rank' => $me ? 1 + DB::table('season_members')->where('season_id', $season->id)->where('contribution', '>', $me->contribution)->count() : null],   // 개인 기여도 순위(ranking.me.rank 와 같은 식), 미가입 null
            'attacks' => ['limit' => $limit, 'used' => $used, 'left' => max(0, $limit - $used)],
            'open_battle' => $this->openBattle($user, $sc),   // 진행 중인 내 시즌 전투(없으면 null)
            'party_check' => $this->partyCheck($user),
            'rules' => [
                'occupation_gain' => (int) config('war.occupation_gain'), 'occupation_required' => (int) config('war.occupation_required'),
                'cooldown_minutes' => (int) config('war.cooldown_minutes'),
            ],
        ];
    }

    /** 시즌 지도: 영토별 소유색·점령도·인접·공격 가능 여부(+불가 사유) */
    public function map(User $user, ?string $scenario = null): array
    {
        $season = $this->activeSeason(false, $user, $scenario);
        $sc = $this->scenario($season->scenario_code);
        $countries = DB::table('season_countries')->where('season_id', $season->id)->get()->keyBy('id');
        $cMeta = collect($sc['countries'])->keyBy('code');
        $terrs = DB::table('season_territories')->where('season_id', $season->id)->get()->keyBy('territory_code');
        $me = $this->member($season, $user);
        $out = [];
        $lastAtk = DB::table('territory_battles')->where('attacker_user_id', $user->id)->whereIn('season_territory_id', $terrs->pluck('id'))
            ->groupBy('season_territory_id')->selectRaw('season_territory_id, max(created_at) as last_at')->pluck('last_at', 'season_territory_id')->all();   // 쿨다운 판정·표시 공용(영토별 쿼리 N+1 제거)
        foreach ($sc['territories'] as $def) {
            $t = $terrs[$def['code']];
            $owner = $countries[$t->owner_season_country_id];
            $reason = $me ? $this->attackBlockReason($season, $sc, $me, $t, $terrs, $user, $lastAtk) : 'not_joined';
            $out[] = [
                'code' => $def['code'], 'name' => $def['name'], 'kind' => $def['kind'], 'lon' => $def['lon'], 'lat' => $def['lat'],
                'defense_level' => $def['defense_level'],
                // UI 개편용 추가 필드: 시나리오상 시작 국가(영토 기준 원 소유국, 현재 owner 와 다를 수 있음) / 그 국가의 수도 여부 / 방어 요약
                'start_country' => $def['start_country'] ?? null, 'is_capital' => ($def['kind'] ?? 'normal') === 'capital',
                'defense' => $this->defenseSummary($def),
                'owner' => ['code' => $owner->country_code, 'name' => $cMeta[$owner->country_code]['name'], 'color' => $cMeta[$owner->country_code]['color']],
                'state' => $t->state, 'siege_country' => $t->siege_season_country_id ? $countries[$t->siege_season_country_id]->country_code : null,
                'occupation' => (int) $t->occupation, 'occupation_required' => (int) config('war.occupation_required'),
                'neighbors' => $this->neighbors($sc, $def['code']),
                'attackable' => $reason === null, 'attack_blocked_reason' => $reason,
                'cooldown_until' => $reason === 'cooldown' ? $this->cooldownUntil($lastAtk[(int) $t->id] ?? null) : null,
            ];
        }

        return ['season_id' => (int) $season->id, 'scenario_code' => $season->scenario_code, 'view' => $sc['scenario']['map_view'] ?? null,
            'countries' => $countries->map(fn ($c) => ['code' => $c->country_code, 'name' => $cMeta[$c->country_code]['name'] ?? $c->country_code, 'color' => $cMeta[$c->country_code]['color'] ?? null, 'allies' => $this->alliesView($sc, $c->country_code)])->values()->all(),
            'territories' => $out, 'party_check' => $this->partyCheck($user)];
    }

    /** 진행 중인 내 시즌 전투 {battle_id, territory_id, territory_name, turn, status} 또는 null */
    private function openBattle(User $user, array $sc): ?array
    {
        $r = DB::table('territory_battles')->join('battles', 'battles.id', '=', 'territory_battles.battle_id')
            ->join('season_territories', 'season_territories.id', '=', 'territory_battles.season_territory_id')
            ->where('territory_battles.attacker_user_id', $user->id)->where('battles.status', 'in_progress')
            ->orderByDesc('territory_battles.id')->first(['battles.id as battle_id', 'battles.turn', 'battles.status', 'season_territories.territory_code']);
        if (! $r) {
            return null;
        }
        $name = collect($sc['territories'])->firstWhere('code', $r->territory_code)['name'] ?? $r->territory_code;

        return ['battle_id' => (int) $r->battle_id, 'territory_id' => $r->territory_code, 'territory_name' => $name, 'turn' => (int) $r->turn, 'status' => $r->status];
    }

    /** 시즌전쟁 기준 편성 사전검사(createBattle 과 같은 규칙). code=null 이면 출격 가능 */
    public function partyCheck(User $user): array
    {
        $max = $this->progress->maxSlots($this->progress->level($user));
        $ids = $this->warPartyIds($user);
        try {
            $this->progress->validateParty($user, $ids);
            $code = null;
        } catch (IllegalAction $e) {
            $code = $e->reason;
        } catch (\Throwable $e) {   // 예기치 못한 오류도 응답 500 대신 코드로 안전 처리
            report($e);
            $code = 'party_invalid';
        }

        return ['code' => $code, 'used' => count($ids), 'max' => $max];
    }

    /** 시즌전쟁 출격 영웅 id: 현재 편성에서 캠페인 전용(주인공 등) 제외, maxSlots 로 자름 */
    private function warPartyIds(User $user): array
    {
        $level = $this->progress->level($user);
        $ids = [];
        foreach (array_slice($this->progress->party($user), 0, $this->progress->maxSlots($level) + 4) as $id) {
            $uh = DB::table('user_heroes')->where(['id' => $id, 'user_id' => $user->id])->first();
            if ($uh && empty($this->data->heroById((int) $uh->hero_id)['campaign_only'])) {
                $ids[] = (int) $id;   // 캠페인 전용(주인공 등)은 방 대전과 같이 제외
            }
        }

        return array_slice($ids, 0, $this->progress->maxSlots($level));
    }

    /**
     * 시나리오 미리보기 지도(시즌·가입 없이): map() 과 같은 territories 형식, owner=start_country, 모두 평화·점령도 0·공격 불가(attack_blocked_reason='preview').
     * 활성 시즌이 없을 때 UI 가 시나리오 지도를 보여주기 위한 읽기 전용 응답. DB 를 읽지 않는다. 시나리오 없음 404 scenario_not_found.
     */
    public function preview(string $code = 'imjin'): array
    {
        $sc = $this->scenario($code);
        $cMeta = collect($sc['countries'])->keyBy('code');
        $out = [];
        foreach ($sc['territories'] as $def) {
            $own = $def['start_country'] ?? null;
            $out[] = [
                'code' => $def['code'], 'name' => $def['name'], 'kind' => $def['kind'], 'lon' => $def['lon'], 'lat' => $def['lat'],
                'defense_level' => $def['defense_level'], 'start_country' => $own, 'is_capital' => ($def['kind'] ?? 'normal') === 'capital',
                'defense' => $this->defenseSummary($def),
                'owner' => ['code' => $own, 'name' => $cMeta[$own]['name'] ?? $own, 'color' => $cMeta[$own]['color'] ?? null],
                'state' => 'peace', 'siege_country' => null, 'occupation' => 0, 'occupation_required' => (int) config('war.occupation_required'),
                'neighbors' => $this->neighbors($sc, $def['code']),
                'attackable' => false, 'attack_blocked_reason' => 'preview', 'cooldown_until' => null,
            ];
        }

        return ['season_id' => null, 'scenario_code' => $sc['scenario']['code'] ?? $code, 'preview' => true, 'view' => $sc['scenario']['map_view'] ?? null,
            'countries' => $cMeta->map(fn ($c) => ['code' => $c['code'], 'name' => $c['name'], 'color' => $c['color'] ?? null, 'allies' => $this->alliesView($sc, $c['code'])])->values()->all(),
            'territories' => $out];
    }

    /**
     * 방어 요약(표시용): 예상 방어 레벨(defense_level x war.defender.level_per_defense, 전투 생성 시 AI 방어 부대 레벨과 같은 식)과 그 레벨의 출전 영웅 슬롯·코스트 상한.
     * 방어 부대는 전투 생성 시 랜덤 편성이라 수비 병력 수·지휘관 이름은 확정 값이 없어 commander=null, max_heroes 는 상한이다.
     */
    private function defenseSummary(array $def): array
    {
        $lv = $this->defenderLevel($def);

        return ['level' => $lv, 'level_per_defense' => (int) config('war.defender.level_per_defense'), 'max_heroes' => $this->progress->maxSlots($lv), 'max_cost' => $this->progress->maxCost($lv), 'commander' => null];
    }

    private function neighbors(array $sc, string $code): array
    {
        $n = [];
        foreach ($sc['links'] as [$a, $b]) {
            $a === $code && $n[] = $b;
            $b === $code && $n[] = $a;
        }

        return $n;
    }

    // ---------------------------------------------------------------- 국가 선택

    /** 시즌 전쟁 쓰기 경로 차단(game.season_war_enabled=false 기본) */
    private function assertEnabled(): void
    {
        config('game.season_war_enabled') || throw new IllegalAction('season_war_disabled', '시즌 전쟁은 오픈 예정입니다.', 403);
    }

    public function join(User $user, string $countryCode, ?string $scenario = null): array
    {
        $this->assertEnabled();
        if ($user->is_guest && ! config('war.allow_guests')) {
            throw new IllegalAction('guest_not_allowed', '시즌 전쟁은 정식 계정만 참가할 수 있습니다.', 403);
        }
        try {
            $this->joinTx($user, $countryCode, $scenario);
        } catch (\Illuminate\Database\UniqueConstraintViolationException) {   // 동시 가입: (season_id, user_id) 유니크 위반 = 이미 가입
            throw new IllegalAction('already_joined', '이미 국가를 선택했습니다. 시즌 중에는 변경할 수 없습니다.', 409);
        }

        return $this->state($user, $scenario);
    }

    private function joinTx(User $user, string $countryCode, ?string $scenario = null): void
    {
        DB::transaction(function () use ($user, $countryCode, $scenario) {
            $season = $this->activeSeason(true, $user, $scenario);
            if ($this->member($season, $user)) {
                throw new IllegalAction('already_joined', '이미 국가를 선택했습니다. 시즌 중에는 변경할 수 없습니다.', 409);
            }
            $rows = DB::table('season_countries')->where('season_id', $season->id)->get();
            $target = $rows->firstWhere('country_code', $countryCode);
            if (! $target) {
                throw new IllegalAction('invalid_country', '선택할 수 없는 국가입니다.', 422);
            }
            $cMeta = collect($this->scenario($season->scenario_code)['countries'])->keyBy('code');
            if (! empty($cMeta[$countryCode]['ai_only'])) {
                throw new IllegalAction('country_ai_only', 'AI가 운영하는 국가는 선택할 수 없습니다.', 422);
            }
            $humanRows = $rows->filter(fn ($r) => empty($cMeta[$r->country_code]['ai_only']));
            if ((int) $target->member_count - (int) $humanRows->min('member_count') >= (int) config('war.max_member_gap')) {
                throw new IllegalAction('country_full', '해당 국가의 인원이 많아 지금은 가입할 수 없습니다. 인원이 적은 국가를 선택하세요.', 409);
            }
            DB::table('season_members')->insert([
                'season_id' => $season->id, 'user_id' => $user->id, 'season_country_id' => $target->id,
                'joined_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('season_countries')->where('id', $target->id)->update(['member_count' => DB::raw('member_count + 1'), 'updated_at' => now()]);
        });
    }

    // ---------------------------------------------------------------- 공격 시작

    private function attackKey(User $user): string
    {
        return 'war_attack:user:'.$user->id;
    }

    /**
     * 공격 불가 사유 코드(가능하면 null). 지도 표시와 공격 API가 같은 규칙을 쓴다.
     * 일일 횟수·진행 중 전투는 별도(attack)에서 검사.
     */
    private function attackBlockReason(object $season, array $sc, object $me, object $terr, $terrs, User $user, ?array $lastAtk = null): ?string
    {
        if ((int) $terr->owner_season_country_id === (int) $me->season_country_id) {
            return 'own_territory';
        }
        $codes = $this->countryCodes((int) $season->id);
        $allies = collect($sc['countries'])->firstWhere('code', $codes[(int) $me->season_country_id] ?? '')['allies'] ?? [];
        $startCountry = collect($sc['territories'])->firstWhere('code', $terr->territory_code)['start_country'] ?? '';
        if ($this->isAlliedHold($allies, $codes[(int) $terr->owner_season_country_id] ?? '', $startCountry)) {
            return 'allied';
        }
        $adjacent = false;
        foreach ($this->neighbors($sc, $terr->territory_code) as $nb) {
            if ((int) ($terrs[$nb]->owner_season_country_id ?? 0) === (int) $me->season_country_id) {
                $adjacent = true;
                break;
            }
        }
        if (! $adjacent) {
            return 'not_adjacent';
        }
        if ($terr->state === 'siege' && (int) $terr->siege_season_country_id !== (int) $me->season_country_id && ! $this->siegeStale($terr)) {
            return 'siege_by_other';
        }
        $last = $lastAtk !== null ? ($lastAtk[(int) $terr->id] ?? null)
            : DB::table('territory_battles')->where(['attacker_user_id' => $user->id, 'season_territory_id' => $terr->id])->max('created_at');
        if ($last && CarbonImmutable::parse($last, 'UTC')->addMinutes((int) config('war.cooldown_minutes'))->isFuture()) {
            return 'cooldown';
        }

        return null;
    }

    /** 쿨다운 만료 시각(ISO8601 UTC). 쿨다운 중이 아니면 null */
    private function cooldownUntil(?string $last): ?string
    {
        if (! $last) {
            return null;
        }
        $until = CarbonImmutable::parse($last, 'UTC')->addMinutes((int) config('war.cooldown_minutes'));

        return $until->isFuture() ? $until->utc()->format('Y-m-d\TH:i:s\Z') : null;
    }

    /** 지원 세력(원군) 표기 메타 [{code,name,label}]: 영토·점수·거점 없이 주 세력 소속으로만 표시(시나리오 countries[].supporters) */
    public function alliesView(array $sc, string $countryCode): array
    {
        $c = collect($sc['countries'])->firstWhere('code', $countryCode) ?? [];

        return array_values(array_map(fn ($a) => ['code' => (string) $a['code'], 'name' => (string) ($a['name'] ?? $a['code']), 'label' => (string) ($a['label'] ?? '원군')], $c['supporters'] ?? []));
    }

    /** 동맹 제한: 시작 소유국이 동맹이고 지금도 동맹국이 가진 영토만 공격 불가(동맹국이 점령한 우리 영토·적이 점령한 동맹 영토는 공격 가능) */
    public function isAlliedHold(array $allies, string $ownerCode, string $startCountry): bool
    {
        return in_array($ownerCode, $allies, true) && in_array($startCountry, $allies, true);
    }

    /** @return array<int,string> season_country id => country_code */
    public function countryCodes(int $seasonId): array
    {
        return $this->codeCache[$seasonId] ??= DB::table('season_countries')->where('season_id', $seasonId)->pluck('country_code', 'id')->all();
    }

    private array $codeCache = [];

    /** 마지막 전투 후 siege_stale_hours 경과한 공성은 만료(타국 공격 허용). 점령도 감소는 후속 배치에서 처리 */
    private function siegeStale(object $terr): bool
    {
        return $terr->state === 'siege' && $terr->last_battle_at
            && CarbonImmutable::parse($terr->last_battle_at, 'UTC')->addHours((int) config('war.siege_stale_hours', 48))->isPast();
    }

    private const REASON_TEXT = [
        'not_joined' => [403, '먼저 국가를 선택해야 합니다.'],
        'allied' => [422, '동맹국 영토는 공격할 수 없습니다.'],
        'own_territory' => [422, '자국 영토는 공격할 수 없습니다.'],
        'not_adjacent' => [422, '아군 영토와 인접한 적 영토만 공격할 수 있습니다.'],
        'siege_by_other' => [409, '다른 국가가 공성 중인 영토입니다.'],
        'cooldown' => [429, '같은 영토는 쿨다운 이후 다시 공격할 수 있습니다.'],
    ];

    /** 공격 시작: 검증 -> 방어 AI 부대 구성 -> 기존 solo 전투 경로(battles mode=free, 방 없음)로 전투 생성 + territory_battles 연결 */
    public function attack(User $user, string $territoryCode, ?string $scenario = null): array
    {
        $this->assertEnabled();

        return DB::transaction(function () use ($user, $territoryCode, $scenario) {
            $season = $this->activeSeason(true, $user, $scenario);
            $sc = $this->scenario($season->scenario_code);
            $def = collect($sc['territories'])->firstWhere('code', $territoryCode);
            // 유저 단위 직렬화: 멤버 행을 잠가 같은 유저의 동시 공격(쿨다운·진행 중 전투·일일 횟수 검사)이 겹치지 않게 한다
            $me = DB::table('season_members')->where(['season_id' => $season->id, 'user_id' => $user->id])->lockForUpdate()->first();
            $terrs = DB::table('season_territories')->where('season_id', $season->id)->get()->keyBy('territory_code');
            if (! $def || ! isset($terrs[$territoryCode])) {
                throw new IllegalAction('territory_not_found', '영토를 찾을 수 없습니다.', 404);
            }
            $reason = $me ? $this->attackBlockReason($season, $sc, $me, $terrs[$territoryCode], $terrs, $user) : 'not_joined';
            if ($reason !== null) {
                throw new IllegalAction($reason, self::REASON_TEXT[$reason][1], self::REASON_TEXT[$reason][0]);
            }
            $open = DB::table('territory_battles')->join('battles', 'battles.id', '=', 'territory_battles.battle_id')
                ->where('territory_battles.attacker_user_id', $user->id)->where('battles.status', 'in_progress')->exists();
            if ($open) {
                throw new IllegalAction('war_battle_open', '진행 중인 시즌 전투가 있습니다. 먼저 끝내거나 포기하세요.', 409);
            }
            if (! DailyCounter::tryIncrement($this->attackKey($user), (int) config('war.daily_attack_limit'))) {
                throw new IllegalAction('daily_limit', '오늘 공격 가능 횟수를 모두 사용했습니다.', 429);
            }
            $terr = $terrs[$territoryCode];
            $b = $this->createBattle($user, $def);
            $tbId = DB::table('territory_battles')->insertGetId([
                'season_id' => $season->id, 'season_territory_id' => $terr->id, 'battle_id' => $b->id, 'source' => 'player', 'seed' => $b->seed,
                'attacker_sc_id' => $me->season_country_id, 'defender_sc_id' => $terr->owner_season_country_id,
                'attacker_user_id' => $user->id, 'defender_user_id' => null, 'defender_kind' => 'garrison',
                'created_at' => now(), 'updated_at' => now(),
            ]);

            return ['battle_id' => (int) $b->id, 'territory_battle_id' => $tbId, 'territory' => $territoryCode, 'battle' => $this->battles->view($b->refresh())];
        });
    }

    /** 공격자 현재 편성 + 방어 AI 부대(영토 방어 난이도 고정)로 in_progress 전투 생성(자동 배치: 설계서 Q6 MVP) */
    private function createBattle(User $user, array $def): Battle
    {
        $level = $this->progress->level($user);
        $ids = $this->warPartyIds($user);
        $party = $this->progress->validateParty($user, $ids);   // 비면 party_empty, 코스트 초과 시 cost_exceeded

        $mapId = DB::table('maps')->where('code', $def['battle_map_code'])->value('id') ?? (new MapCatalog)->pick('solo', null);
        $map = $this->data->map((int) $mapId);
        $engine = $this->data->engine();
        $seed = random_int(1, 2147483647);
        $state = ArmyBuilder::initialState($this->data->rules(), $map, $seed, (int) config('war.max_turns'), config('game.first_side'), FacingFlag::forUser($user->id), \App\Support\SquadFlag::forUser($user->id), \App\Support\AlternateFlag::forUser($user->id), $engine->options()['snowball'], $engine->mpKnobs(), $engine->microModeFor('other'));
        $growth = (float) config('game.troop_growth_pct');

        // 공격자(side a): 기본 배치
        $zone = $map['deploy_zones']['a'];
        $pos = $this->battles->defaultPositions($user, $state, $zone, $ids);
        $placements = [];
        $entries = [];
        $positions = [];
        foreach ($ids as $id) {
            $placements[] = ['user_hero_id' => $id, 'x' => $pos[$id]['x'], 'y' => $pos[$id]['y']];
            $entries[] = ['row' => $party[$id]['hero'], 'level' => (int) $party[$id]['uh']->level, 'key' => $id];
            $positions[$id] = [$pos[$id]['x'], $pos[$id]['y']];
        }
        $entries = app(HeroStarService::class)->attach($entries, true);   // 별(★) 보너스: apply_pvp=false(기본)면 불변
        $entries = app(EquipmentService::class)->attach($entries, true);   // 시즌 전투는 PvP와 같은 equipment.pvp_scale 적용(결정 3)
        ArmyBuilder::addSide($engine, $state, 'a', $entries, $this->data->presetUnits((int) $entries[0]['row']['id'], $entries[0]['row']['unit_type']), $zone, $positions, $growth, $this->battles->squadPlanWithPositions($user, $state, $entries, $placements));

        // 방어 AI(side b): 영토 방어 난이도로 레벨 고정, 코스트·슬롯 한도도 그 레벨 기준
        $this->addAiSide($state, 'b', $map, $this->defenderLevel($def));
        $state['side'] = config('game.first_side');

        $b = Battle::create([
            'user_id' => $user->id, 'opponent_user_id' => null, 'mode' => 'free', 'stage_id' => null, 'map_id' => $map['id'], 'room_id' => null,
            'status' => 'in_progress', 'seed' => $seed, 'turn' => 1, 'current_side' => $state['side'], 'version' => 0,
            'state' => $state, 'deployment' => $placements,
        ]);
        if ($state['side'] === 'b') {
            $this->battles->botTurn($b);
        }

        return $b;
    }

    public function defenderLevel(array $def): int
    {
        return max(1, (int) $def['defense_level'] * (int) config('war.defender.level_per_defense'));
    }

    /** AI 부대 한 진영을 레벨 고정으로 구성(코스트·슬롯 상한도 그 레벨 기준). 방어 garrison과 AI 시뮬 공격자가 공유한다. */
    public function addAiSide(array &$state, string $side, array $map, int $level): void
    {
        $party = ArmyBuilder::randomParty($this->data->heroes(), $this->progress->maxCost($level), $this->progress->maxSlots($level), $state);
        $entries = [];
        foreach ($party as $i => $h) {
            $entries[] = ['row' => $h, 'level' => $level, 'key' => $i];
        }
        ArmyBuilder::addSide($this->data->engine(), $state, $side, $entries, ArmyBuilder::fixedTypesFor($party[0], $this->data->presetUnits((int) $party[0]['id'], $party[0]['unit_type'])), $map['deploy_zones'][$side], null, (float) config('game.troop_growth_pct'), \App\Game\Engine::squadOn($state) ? $this->progress->squadTroops($entries, null) : null);
    }

    /**
     * AI 대 AI 자동 전투(DB 미사용, Simulator::run 재사용). 미종료/무승부는 draw, 턴 상한은 방어 승.
     *
     * @return array{result:string,seed:int}
     */
    public function simulateAiBattle(array $def, int $attackerLevel): array
    {
        $mapId = DB::table('maps')->where('code', $def['battle_map_code'])->value('id') ?? (new MapCatalog)->pick('solo', null);
        $map = $this->data->map((int) $mapId);
        $engine = $this->data->engine();
        $seed = random_int(1, 2147483647);
        $state = ArmyBuilder::initialState($this->data->rules(), $map, $seed, (int) config('war.max_turns'), config('game.first_side'), false, false, false, $engine->options()['snowball'], $engine->mpKnobs(), $engine->microModeFor('other'));
        $this->addAiSide($state, 'a', $map, $attackerLevel);
        $this->addAiSide($state, 'b', $map, $this->defenderLevel($def));
        $r = (new \App\Game\Simulator($engine, config('game.bot')))->runWithStats($state);
        $end = $r['state'];
        if (($end['status'] ?? 'active') !== 'finished') {
            return ['result' => 'draw', 'seed' => $seed];
        }
        $w = $end['winner'] ?? null;

        return ['result' => $w === 'a' && ! $r['stats']['turn_limit'] ? 'att_win' : ($w === null ? 'draw' : 'def_win'), 'seed' => $seed];
    }

    // ---------------------------------------------------------------- 정산

    /** BattleService::settle 훅 대상 판별(시즌 영토 전투인가). 방 없는 free 전투만 조회한다. */
    public function handles(Battle $b): bool
    {
        return $b->mode === 'free' && $b->room_id === null && DB::table('territory_battles')->where('battle_id', $b->id)->exists();
    }


    /**
     * 시즌 전투 종료 정산(1회만). 공격 승리 +occupation_gain, 그 외(방어 승·턴 상한·무승부) 0.
     * 점령도 반영·이력·소유권 이전·점수/기여도를 한 트랜잭션에서 처리한다(실패 시 전부 롤백).
     */
    public function settleBattle(Battle $b, User $user): void
    {
        $run = function () use ($b, $user) {
            $tb = DB::table('territory_battles')->where('battle_id', $b->id)->first();
            if (! $tb || $b->status !== 'finished') {
                return;
            }
            // 중복 정산 방지: 두 곳 모두 조건부 UPDATE로 1회만 통과
            if (DB::table('territory_battles')->where('id', $tb->id)->whereNull('settled_at')->update(['settled_at' => now()]) === 0) {
                return;
            }
            DB::table('battles')->where('id', $b->id)->whereNull('settled_at')->update(['settled_at' => now()]);

            $turnLimit = DB::table('battle_actions')->where('battle_id', $b->id)->where('events', 'like', '%"reason":"turn_limit"%')->exists();
            $result = $b->winner === 'a' && ! $turnLimit ? 'att_win' : ($b->winner === 'b' || $turnLimit ? 'def_win' : 'draw');

            $rankBefore = $this->rankSnapshot($tb);
            $s = $this->applyResult($tb, $result);
            $rankAfter = $this->rankSnapshot($tb);
            $gain = (int) DB::table('territory_contributions')->where('territory_battle_id', $tb->id)->where('kind', 'attack_win')->sum('points');
            $res = ['win' => $result === 'att_win', 'winner' => $b->winner, 'war' => true, 'territory_battle_id' => (int) $tb->id, 'result' => $result,
                'occupation_before' => $s['before'], 'occupation_after' => $s['captured'] ? 0 : $s['after'], 'occupation_delta' => $s['delta'], 'captured' => $s['captured'],
                'my_contribution_gain' => $gain,   // attack_win 가산분(점령 보너스는 capture_bonus_gain 별도)
                'capture_bonus_gain' => (int) DB::table('territory_contributions')->where('territory_battle_id', $tb->id)->where('kind', 'capture_bonus')->sum('points'),
                'rank_before' => $rankBefore, 'rank_after' => $rankAfter,   // {personal, country}: 개인 기여도 순위 / 내 국가 점수 순위
                'gold' => 0, 'heroes' => [], 'user' => null];   // 골드는 0 유지. 영웅 경험치만 reward 로 지급
            $res['reward'] = $this->grantBattleReward($b, $user, $result, $s['captured']);
            $res['heroes'] = $res['reward']['heroes'];
            DB::table('battles')->where('id', $b->id)->update(['result' => json_encode($res)]);
            $b->result = $res;
        };
        config('war.transfer_transaction') ? DB::transaction($run) : $run();
    }

    /**
     * 시즌 전투 포기 정산: 패배(def_win)로 기록(점령도 변화 0·기여도/보상 없음·공격 횟수 환불 없음). territory_battles.settled_at 조건부 UPDATE로 멱등.
     * BattleService::abandon 트랜잭션 안에서 호출된다(battles 행은 호출자가 abandoned 로 갱신 완료).
     */
    public function settleAbandoned(Battle $b): void
    {
        $tb = DB::table('territory_battles')->where('battle_id', $b->id)->first();
        if (! $tb || DB::table('territory_battles')->where('id', $tb->id)->whereNull('settled_at')->update(['settled_at' => now()]) === 0) {
            return;
        }
        $rankNow = $this->rankSnapshot($tb);
        $s = $this->applyResult($tb, 'def_win');
        DB::table('battles')->where('id', $b->id)->update(['result' => json_encode([
            'win' => false, 'winner' => 'b', 'abandoned' => true, 'war' => true, 'territory_battle_id' => (int) $tb->id, 'result' => 'def_win',
            'occupation_before' => $s['before'], 'occupation_after' => $s['after'], 'occupation_delta' => 0, 'captured' => false,
            'my_contribution_gain' => 0, 'capture_bonus_gain' => 0, 'rank_before' => $rankNow, 'rank_after' => $rankNow,
            'reward' => ['exp' => 0, 'heroes' => [], 'blocked' => null], 'stars' => 0, 'gold' => 0, 'heroes' => [], 'user' => null,
        ])]);
    }

    /**
     * 시즌 전투 영웅 경험치 보상(settled_at 멱등 경로 안에서만 호출 = 전투당 1회). 승: win_exp, 패/무: lose_exp, 점령 성공: +capture_bonus_exp.
     * 일일 상한(daily_cap, KST 05:00 기준, 0=무제한) 초과 시 exp 0 + blocked='daily_cap'. 포기 전투는 finished 가 아니므로 settleBattle 에서 이미 제외된다.
     *
     * @return array{exp:int,heroes:array,blocked:?string}
     */
    private function grantBattleReward(Battle $b, User $user, string $result, bool $captured): array
    {
        $cfg = (array) config('game.war');
        $exp = $result === 'att_win' ? (int) ($cfg['reward_win_exp'] ?? 0) + ($captured ? (int) ($cfg['reward_capture_bonus_exp'] ?? 0) : 0) : (int) ($cfg['reward_lose_exp'] ?? 0);
        if ($exp <= 0) {
            return ['exp' => 0, 'heroes' => [], 'blocked' => null];
        }
        $cap = (int) ($cfg['reward_daily_cap'] ?? 3);
        if ($cap > 0 && ! DailyCounter::tryIncrement('war_reward:user:'.$user->id, $cap)) {
            return ['exp' => 0, 'heroes' => [], 'blocked' => 'daily_cap'];
        }
        $progress = app(ProgressionService::class);
        $heroes = [];
        foreach ((array) $b->deployment as $p) {
            $heroes[] = $progress->addHeroExp((int) $p['user_hero_id'], $exp);
        }

        return ['exp' => $exp, 'heroes' => $heroes, 'blocked' => null];
    }

    /** 정산 전/후 순위 스냅샷: 개인 기여도 순위(state.me.rank 와 같은 식), 국가 점수 순위(ranking.countries 와 같은 정렬) */
    private function rankSnapshot(object $tb): array
    {
        $uid = $tb->attacker_user_id;
        $me = $uid ? DB::table('season_members')->where(['season_id' => $tb->season_id, 'user_id' => $uid])->first(['contribution']) : null;
        $owned = DB::table('season_territories')->where('season_id', $tb->season_id)->selectRaw('owner_season_country_id as cid, count(*) as n')->groupBy('owner_season_country_id')->pluck('n', 'cid');
        $order = DB::table('season_countries')->where('season_id', $tb->season_id)->get()
            ->sort(fn ($a, $b) => [$b->score, $owned[$b->id] ?? 0, $a->id] <=> [$a->score, $owned[$a->id] ?? 0, $b->id])->pluck('id')->values()->all();
        $pos = array_search((int) $tb->attacker_sc_id, array_map('intval', $order), true);

        return [
            'personal' => $me ? 1 + DB::table('season_members')->where('season_id', $tb->season_id)->where('contribution', '>', $me->contribution)->count() : null,
            'country' => $pos === false ? null : $pos + 1,
        ];
    }

    /**
     * 전투 결과(att_win|def_win|draw)를 영토에 반영한다. 플레이어 전투(settleBattle)와 AI 시뮬 전투(WarTickService)가 같은 코드 경로를 쓴다.
     * 호출자가 트랜잭션과 중복 방지(territory_battles.settled_at)를 책임진다.
     *
     * @return array{before:int,after:int,delta:int,captured:bool}
     */
    public function applyResult(object $tb, string $result): array
    {
        $ai = $tb->source === 'ai_sim';
        $season = DB::table('seasons')->where('id', $tb->season_id)->first(['status', 'end_at']);
        // 종료된 시즌(status=ended) 또는 end_at이 지난 시즌(war:tick 종료 처리 전 공백 포함)의 진행 중 전투는 기록만 남기고 영토·점수에 반영하지 않는다
        if ($season->status !== 'active' || ($season->end_at && CarbonImmutable::parse($season->end_at, 'UTC')->isPast())) {
            DB::table('territory_battles')->where('id', $tb->id)->update(['result' => 'draw', 'occ_delta' => 0, 'updated_at' => now()]);

            return ['before' => 0, 'after' => 0, 'delta' => 0, 'captured' => false];
        }
        $terr = DB::table('season_territories')->where('id', $tb->season_territory_id)->lockForUpdate()->first();
        $def = $this->defOf((int) $tb->season_id, $terr->territory_code);
        $required = (int) config('war.occupation_required');
        $before = (int) $terr->occupation;
        $after = $before;
        $captured = false;
        $attackerSc = (int) $tb->attacker_sc_id;
        $takeover = $terr->state === 'siege' && (int) $terr->siege_season_country_id !== $attackerSc;   // 타국 공성
        $valid = $result === 'att_win'
            && (int) $terr->owner_season_country_id !== $attackerSc
            && ! ($takeover && ! $this->siegeStale($terr));   // 정산 시점에 상황이 바뀌었으면 반영 안 함(만료된 공성은 인수 가능)
        $base = $takeover ? 0 : $before;   // 만료 공성 인수는 0에서 시작
        if ($valid) {
            $after = min($required, $base + (int) config('war.occupation_gain'));
            $captured = $after >= $required;
        }

        $upd = ['version' => DB::raw('version + 1'), 'updated_at' => now()];
        // 정체 타이머: 공성이 새로 시작·인수될 때는 항상 설정. 이미 공성 중인 영토는 사람 전투가 리셋하고 AI 전투는 리셋하지 않음(단 AI끼리만 싸우는 영토=방어국도 AI면 리셋). 평시(peace) 방어 승은 설정하지 않음
        $newSiege = $valid && ($terr->state !== 'siege' || $takeover);
        if ($newSiege || ($terr->state === 'siege' && (! $ai || $this->isAiCountry((int) $tb->defender_sc_id)))) {
            $upd['last_battle_at'] = now();
        }
        if ($valid) {
            $upd += ['occupation' => $after, 'state' => 'siege', 'siege_season_country_id' => $attackerSc];
            if ($terr->state !== 'siege' || $takeover) {
                $this->event((int) $tb->season_id, 'siege_start', $attackerSc, (int) $terr->id, $tb->attacker_user_id ? (int) $tb->attacker_user_id : null, ['territory' => $terr->territory_code, 'defender' => $this->countryCodes((int) $tb->season_id)[(int) $tb->defender_sc_id] ?? null]);
                ($def['kind'] ?? 'normal') === 'capital' && $this->event((int) $tb->season_id, 'capital_siege', $attackerSc, (int) $terr->id, null, ['territory' => $terr->territory_code]);
            }
        }
        if ($captured) {   // 소유권 이전: 소유 변경 + 점령도 초기화 + 공성 종료
            $upd = ['owner_season_country_id' => $attackerSc, 'occupation' => 0, 'state' => 'peace', 'siege_season_country_id' => null] + $upd;
        }
        DB::table('season_territories')->where('id', $terr->id)->update($upd);

        DB::table('territory_occupation_logs')->insert([
            'season_id' => $tb->season_id, 'season_territory_id' => $terr->id, 'kind' => 'battle', 'occ_before' => $before, 'occ_after' => $after,
            'owner_before_sc_id' => $terr->owner_season_country_id, 'owner_after_sc_id' => $terr->owner_season_country_id,
            'ref_territory_battle_id' => $tb->id, 'created_at' => now(),
        ]);
        if ($captured) {
            DB::table('territory_occupation_logs')->insert([
                'season_id' => $tb->season_id, 'season_territory_id' => $terr->id, 'kind' => 'capture', 'occ_before' => $after, 'occ_after' => 0,
                'owner_before_sc_id' => $terr->owner_season_country_id, 'owner_after_sc_id' => $attackerSc,
                'ref_territory_battle_id' => $tb->id, 'created_at' => now(),
            ]);
            $this->awardCapture($tb, $terr, $def, $ai);
            $this->event((int) $tb->season_id, 'capture', $attackerSc, (int) $terr->id, $tb->attacker_user_id ? (int) $tb->attacker_user_id : null, ['territory' => $terr->territory_code, 'from' => $this->countryCodes((int) $tb->season_id)[(int) $terr->owner_season_country_id] ?? null, 'ai' => $ai]);
            ($def['kind'] ?? 'normal') === 'capital' && $this->event((int) $tb->season_id, 'capital_fall', $attackerSc, (int) $terr->id, null, ['territory' => $terr->territory_code, 'from' => $this->countryCodes((int) $tb->season_id)[(int) $terr->owner_season_country_id] ?? null]);
        }
        if ($valid && $tb->attacker_user_id && ! $ai) {   // 개인 기여도에 AI 행동은 미포함
            $this->addContribution($tb, (int) $tb->attacker_user_id, 'attack_win', (int) config('war.points.attack_win'));
        }

        DB::table('territory_battles')->where('id', $tb->id)->update([
            'result' => $result, 'occ_before' => $before, 'occ_after' => $captured ? 0 : $after, 'occ_delta' => $after - $base, 'captured' => $captured, 'updated_at' => now(),
        ]);

        return ['before' => $before, 'after' => $after, 'delta' => $after - $base, 'captured' => $captured];
    }

    /** 사람 구성원이 없는 국가 = AI 국가 */
    public function isAiCountry(int $seasonCountryId): bool
    {
        return (int) DB::table('season_countries')->where('id', $seasonCountryId)->value('member_count') === 0;
    }

    public function defOf(int $seasonId, string $territoryCode): array
    {
        $code = (string) DB::table('seasons')->where('id', $seasonId)->value('scenario_code');

        return collect($this->scenario($code)['territories'])->firstWhere('code', $territoryCode) ?? [];
    }

    /** 전황 피드/알림(앱 내 폴링 조회) */
    public function event(int $seasonId, string $type, ?int $seasonCountryId, ?int $seasonTerritoryId, ?int $userId, array $payload = []): void
    {
        DB::table('war_events')->insert([
            'season_id' => $seasonId, 'type' => $type, 'season_country_id' => $seasonCountryId, 'season_territory_id' => $seasonTerritoryId,
            'user_id' => $userId, 'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE), 'created_at' => now(),
        ]);
        \App\Support\RoomRealtime::war($seasonId);   // 웹소켓 ping(커밋 후, 3초 합치기): 가입자 클라이언트가 안 읽음 수·전황을 재조회
    }

    private function addContribution(object $tb, int $userId, string $kind, int $points): void
    {
        $ins = DB::table('territory_contributions')->insertOrIgnore([
            'season_id' => $tb->season_id, 'user_id' => $userId, 'season_country_id' => $tb->attacker_sc_id, 'season_territory_id' => $tb->season_territory_id,
            'territory_battle_id' => $tb->id, 'kind' => $kind, 'points' => $points, 'created_at' => now(),
        ]);
        if ($ins > 0) {   // 펜(영구 재화): 기여 기록이 새로 생길 때만(멱등), 일일 상한은 PenService
            app(PenService::class)->grantFor($userId, $kind === 'capture_bonus' ? 'war_capture' : 'war_attack_win', 'war_pen_'.$kind, 'territory_battle', (int) $tb->id);
        }
        if ($ins > 0 && $points > 0) {
            DB::table('season_members')->where(['season_id' => $tb->season_id, 'user_id' => $userId])->update(['contribution' => DB::raw('contribution + '.$points), 'updated_at' => now()]);
        }
    }

    private function awardCapture(object $tb, object $terr, array $def, bool $ai): void
    {
        $p = config('war.points');
        $pct = $ai ? (int) config('war.ai.score_pct', 50) : 100;   // AI 점령 점수는 사람의 50%
        $scores = [['capture', intdiv((int) $p['capture_score'] * $pct, 100)]];
        ($def['kind'] ?? 'normal') === 'capital' && $scores[] = ['bonus', intdiv((int) $p['capital_bonus_score'] * $pct, 100)];
        foreach ($scores as [$kind, $pts]) {
            DB::table('season_country_scores')->insert([
                'season_id' => $tb->season_id, 'season_country_id' => $tb->attacker_sc_id, 'kind' => $kind, 'points' => $pts,
                'season_territory_id' => $terr->id, 'territory_battle_id' => $tb->id, 'created_at' => now(),
            ]);
            DB::table('season_countries')->where('id', $tb->attacker_sc_id)->update(['score' => DB::raw('score + '.$pts), 'updated_at' => now()]);
        }
        if ($tb->attacker_user_id && ! $ai) {
            $this->addContribution($tb, (int) $tb->attacker_user_id, 'capture_bonus', (int) $p['capture_bonus']);
        }
    }
}
