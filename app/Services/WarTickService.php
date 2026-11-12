<?php

namespace App\Services;

use App\Support\Period;
use Carbon\CarbonImmutable;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * war:tick(시간당 1회 배치): 시즌 종료 처리, 정체 점령도 감소(오프라인 방어 상한), AI 국가 행동.
 * 신규 인프라 없이 schedule:run 으로 호출한다. 멱등: 상태(last_battle_at/last_decay_at/일일 카운트)로 "지금 할 일"만 재계산한다.
 */
class WarTickService
{
    public function __construct(private readonly WarService $war)
    {
    }

    /**
     * 전체 배치를 Cache::lock 으로 직렬화한다(스케줄러·수동 실행 공통). 락을 못 잡으면 아무것도 하지 않고 locked=true.
     *
     * @return array{ended:int[],decayed:int,ai_battles:int,locked:bool}
     */
    public function run(): array
    {
        $lock = Cache::lock('war:tick', 900);
        if (! $lock->get()) {
            return ['ended' => [], 'decayed' => 0, 'ai_battles' => 0, 'locked' => true];
        }
        try {
            return $this->runLocked() + ['locked' => false];
        } finally {
            $lock->release();
        }
    }

    private function runLocked(): array
    {
        $out = ['ended' => [], 'decayed' => 0, 'ai_battles' => 0];
        $budget = (int) config('war.ai.max_battles_per_tick');
        $endedScenarios = [];
        foreach (DB::table('seasons')->where('status', 'active')->orderBy('id')->get() as $season) {
            if ($season->end_at && CarbonImmutable::parse($season->end_at, 'UTC')->isPast()) {
                if ($this->endSeason($season)) {
                    $out['ended'][] = (int) $season->id;
                    $endedScenarios[$season->scenario_code] = true;
                }

                continue;
            }
            $out['decayed'] += $this->decay($season);
            $n = $this->aiActions($season, $budget);
            $out['ai_battles'] += $n;
            $budget -= $n;
        }
        if (config('war.season.auto_next')) {   // 종료된 시나리오마다 활성 시즌이 없으면 같은 시나리오로 새 시즌 생성(시나리오별 동시 운영)
            foreach (array_keys($endedScenarios) as $code) {
                DB::table('seasons')->where('scenario_code', $code)->where('status', 'active')->exists() || $this->war->ensureSeason((string) $code);
            }
        }
        if (config('war.season.auto_next') && ! DB::table('seasons')->where('status', 'active')->exists()) {   // 활성 시즌이 없으면 항상 재생성(종료 직후 생성 실패 시 다음 실행이 복구)
            $this->war->ensureSeason();   // 새 시즌은 시나리오 초기 상태(소유권·점령도·점수 0)로 시작, 이전 시즌 행은 그대로 보존
        }

        return $out;
    }

    // ------------------------------------------------------------ 시즌 종료

    /** 국가 점수 순위 확정 + season_results 스냅샷 + MVP. 조건부 UPDATE로 1회만. 영토/점령도 행은 삭제하지 않는다(기록 보존). */
    public function endSeason(object $season): bool
    {
        return DB::transaction(function () use ($season) {
            $claimed = DB::table('seasons')->where('id', $season->id)->where('status', 'active')->update(['status' => 'ended', 'ended_at' => now(), 'updated_at' => now()]);
            if ($claimed === 0) {
                return false;
            }
            $sc = $this->war->scenario($season->scenario_code);
            $meta = collect($sc['countries'])->keyBy('code');
            $owned = DB::table('season_territories')->where('season_id', $season->id)->selectRaw('owner_season_country_id as cid, count(*) as n')->groupBy('owner_season_country_id')->pluck('n', 'cid');
            $rows = DB::table('season_countries')->where('season_id', $season->id)->get()
                ->sort(fn ($a, $b) => [$b->score, $owned[$b->id] ?? 0, $a->id] <=> [$a->score, $owned[$a->id] ?? 0, $b->id])->values();
            $ranking = [];
            foreach ($rows as $i => $r) {
                $ranking[] = ['rank' => $i + 1, 'code' => $r->country_code, 'name' => $meta[$r->country_code]['name'] ?? $r->country_code, 'ai_only' => ! empty($meta[$r->country_code]['ai_only']), 'score' => (int) $r->score,
                    'territories' => (int) ($owned[$r->id] ?? 0), 'member_count' => (int) $r->member_count];
            }
            $top = DB::table('season_members')->join('users', 'users.id', '=', 'season_members.user_id')->join('season_countries', 'season_countries.id', '=', 'season_members.season_country_id')
                ->where('season_members.season_id', $season->id)->where('season_members.contribution', '>', 0)
                ->orderByDesc('season_members.contribution')->orderBy('season_members.joined_at')->orderBy('season_members.id')->limit(5)
                ->get(['users.id as user_id', 'users.name', 'season_countries.country_code as country', 'season_members.contribution'])
                ->map(fn ($m) => ['user_id' => (int) $m->user_id, 'name' => $m->name, 'country' => $m->country, 'contribution' => (int) $m->contribution])->all();
            $winnerRow = $rows->first(fn ($r) => empty($meta[$r->country_code]['ai_only']));   // AI 전용 국가(명)는 순위표에는 표시하되 우승 산정에서 제외
            $winnerId = $winnerRow->id ?? null;
            $winner = $winnerRow ? collect($ranking)->firstWhere('code', $winnerRow->country_code) : null;
            $payload = [
                'season' => ['id' => (int) $season->id, 'name' => $season->name, 'start_at' => $season->start_at, 'end_at' => $season->end_at],
                'winner' => $winner, 'ranking' => $ranking, 'mvp' => $top[0] ?? null, 'top_contributors' => $top,
                'battles' => DB::table('territory_battles')->where('season_id', $season->id)->count(),
            ];
            DB::table('season_results')->insert(['season_id' => $season->id, 'winner_season_country_id' => $winnerId, 'payload' => json_encode($payload, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
            DB::table('seasons')->where('id', $season->id)->update(['winner_season_country_id' => $winnerId]);
            // 펜 시즌 종료 보상(config game.pen.season). DB 예외는 그대로 전파해 시즌 종료 전체가 롤백·틱 재시도되고, 앱 예외로 실패한 멤버 수만 로그한다
            $penFailed = app(PenService::class)->grantSeasonRewards((int) $season->id, $winnerId !== null ? (int) $winnerId : null);
            $penFailed > 0 && \Illuminate\Support\Facades\Log::error('pen 시즌 보상 일부 실패', ['season' => $season->id, 'failed_members' => $penFailed]);
            $this->war->event((int) $season->id, 'season_end', $winnerId ? (int) $winnerId : null, null, null, ['winner' => $winner['code'] ?? null]);

            return true;
        });
    }

    // ------------------------------------------------------------ 정체 점령도 감소

    private function dayStartUtc(): CarbonImmutable
    {
        return CarbonImmutable::parse(Period::dailyKey(), Period::TZ)->setTime(Period::RESET_HOUR, 0)->utc();
    }

    /** 공성 중 영토가 마지막 전투 후 48h 지나면 24h마다 -10. 영토당 하루 감소 상한/처리 횟수 상한 적용, 0이면 공성 종료. */
    private function decay(object $season): int
    {
        $cfg = config('war.stagnation');
        $day = $this->dayStartUtc();
        $n = 0;
        foreach (DB::table('season_territories')->where('season_id', $season->id)->where('state', 'siege')->orderBy('id')->get() as $t) {
            // 영토별 트랜잭션: 잠금 재조회 후 siege·due·상한을 다시 검증하고 조건부 UPDATE(그 사이 사람 전투/점령이 있었으면 건너뜀)
            $n += DB::transaction(function () use ($t, $season, $cfg, $day) {
                $t = DB::table('season_territories')->where('id', $t->id)->lockForUpdate()->first();
                if (! $t || $t->state !== 'siege') {
                    return 0;
                }
                $lastBattle = CarbonImmutable::parse($t->last_battle_at ?? $t->updated_at, 'UTC');
                $lastDecay = $t->last_decay_at ? CarbonImmutable::parse($t->last_decay_at, 'UTC') : null;
                $due = $lastDecay && $lastDecay->gt($lastBattle) ? $lastDecay->addDay() : $lastBattle->addHours((int) $cfg['hours']);
                if ($due->isFuture()) {
                    return 0;
                }
                $today = DB::table('territory_occupation_logs')->where('season_territory_id', $t->id)->where('kind', 'stagnation')->where('created_at', '>=', $day);
                $used = (int) (clone $today)->selectRaw('coalesce(sum(occ_before - occ_after), 0) as s')->value('s');
                if ((clone $today)->count() >= (int) $cfg['auto_defense_daily'] || $used >= (int) $cfg['daily_decrease_cap']) {
                    return 0;
                }
                $amount = min((int) $cfg['daily_decay'], (int) $cfg['daily_decrease_cap'] - $used, (int) $t->occupation);
                $new = (int) $t->occupation - $amount;
                $upd = ['occupation' => $new, 'last_decay_at' => now(), 'version' => DB::raw('version + 1'), 'updated_at' => now()];
                $ended = $new <= 0;
                $ended && $upd += ['state' => 'peace', 'siege_season_country_id' => null];
                $hit = DB::table('season_territories')->where('id', $t->id)->where('state', 'siege')->where('version', $t->version)->update($upd);   // 조건부 UPDATE
                if ($hit === 0) {
                    return 0;
                }
                DB::table('territory_occupation_logs')->insert([
                    'season_id' => $season->id, 'season_territory_id' => $t->id, 'kind' => 'stagnation', 'occ_before' => $t->occupation, 'occ_after' => max(0, $new),
                    'owner_before_sc_id' => $t->owner_season_country_id, 'owner_after_sc_id' => $t->owner_season_country_id, 'created_at' => now(),
                ]);
                $ended && $this->war->event((int) $season->id, 'siege_end', (int) $t->owner_season_country_id, (int) $t->id, null, ['territory' => $t->territory_code, 'reason' => 'stagnation']);

                return 1;
            });
        }

        return $n;
    }

    // ------------------------------------------------------------ AI 국가 행동

    /** @return int 실행한 AI 전투 수 */
    private function aiActions(object $season, int $budget): int
    {
        if ($budget <= 0) {
            return 0;
        }
        $cfg = config('war.ai');
        // 시즌 시작 직후 유예: 사람이 아직 한 명도 가입하지 않았으면 grace_hours 동안 AI 공격 없음(가입자가 생기면 즉시 해제)
        if (CarbonImmutable::parse($season->start_at, 'UTC')->addHours((int) $cfg['grace_hours'])->isFuture()
            && ! DB::table('season_members')->where('season_id', $season->id)->exists()) {
            return 0;
        }
        $sc = $this->war->scenario($season->scenario_code);
        $meta = collect($sc['countries'])->keyBy('code');
        $day = $this->dayStartUtc();
        $done = 0;
        foreach (DB::table('season_countries')->where('season_id', $season->id)->orderBy('id')->get() as $country) {
            if ($done >= $budget) {
                break;
            }
            $cm = $meta[$country->country_code] ?? [];
            $style = $cm['ai_profile']['style'] ?? 'aggressive';
            $humans = (int) $country->member_count > 0;
            $terrs = DB::table('season_territories')->where('season_id', $season->id)->get()->keyBy('territory_code');
            $codes = DB::table('season_countries')->where('season_id', $season->id)->pluck('country_code', 'id')->all();

            // reactive(명): 동맹국이 시작 영토를 N개 이상 잃었을 때만 참전
            if ($style === 'reactive') {
                $allies = $cm['allies'] ?? [];
                $lost = collect($sc['territories'])->filter(fn ($d) => in_array($d['start_country'], $allies, true) && ($codes[$terrs[$d['code']]->owner_season_country_id] ?? null) !== $d['start_country'])->count();
                if ($lost < (int) ($cm['ai_profile']['activate_when_ally_lost'] ?? 1)) {
                    continue;
                }
            }
            // ① 일일 AI 공격 상한: 사람 있는 국가=사람 공격 수의 50%, 없는 국가=최대 3
            $aiToday = DB::table('territory_battles')->where('season_id', $season->id)->where('attacker_sc_id', $country->id)->where('source', 'ai_sim')->where('created_at', '>=', $day)->count();
            if ($humans) {
                $humanToday = DB::table('territory_battles')->where('season_id', $season->id)->where('attacker_sc_id', $country->id)->where('source', 'player')->where('created_at', '>=', $day)->count();
                $quota = intdiv($humanToday * (int) $cfg['human_ratio_pct'], 100);
            } else {
                $quota = (int) $cfg['no_human_daily_cap'];
            }
            $allowed = min($quota - $aiToday, $budget - $done);
            for ($i = 0; $i < $allowed; $i++) {
                $target = $this->pickTarget($season, $sc, $country, $style, $humans, $terrs, $codes, $day);
                if (! $target) {
                    break;
                }
                $this->fight($season, $country, $target, $terrs);
                $done++;
                $terrs = DB::table('season_territories')->where('season_id', $season->id)->get()->keyBy('territory_code');
            }
        }

        return $done;
    }

    private function pickTarget(object $season, array $sc, object $country, string $style, bool $humans, $terrs, array $codes, CarbonImmutable $day): ?array
    {
        $cfg = config('war.ai');
        $allies = collect($sc['countries'])->firstWhere('code', $country->country_code)['allies'] ?? [];
        $myCapitals = collect($sc['territories'])->filter(fn ($d) => $d['kind'] === 'capital' && (int) $terrs[$d['code']]->owner_season_country_id === (int) $country->id)->pluck('code')->all();
        $best = null;
        foreach ($sc['territories'] as $d) {
            $t = $terrs[$d['code']];
            if ((int) $t->owner_season_country_id === (int) $country->id || $this->war->isAlliedHold($allies, $codes[$t->owner_season_country_id] ?? '', $d['start_country'])) {
                continue;
            }
            $nbs = $this->neighborsOf($sc, $d['code']);
            if (! collect($nbs)->contains(fn ($c) => (int) $terrs[$c]->owner_season_country_id === (int) $country->id)) {
                continue;   // 인접 규칙은 사람과 동일
            }
            if ($t->state === 'siege' && (int) $t->siege_season_country_id !== (int) $country->id && ! $this->staleSiege($t)) {
                continue;
            }
            // ② 최근 12시간 내 같은 편 사람이 공격한 영토는 AI 금지
            if (DB::table('territory_battles')->where('season_territory_id', $t->id)->where('attacker_sc_id', $country->id)->where('source', 'player')
                ->where('created_at', '>=', now()->subHours((int) $cfg['human_guard_hours']))->exists()) {
                continue;
            }
            // 영토당 하루 AI 공격 상한
            if (DB::table('territory_battles')->where('season_territory_id', $t->id)->where('source', 'ai_sim')->where('created_at', '>=', $day)->count() >= (int) $cfg['territory_daily_cap']) {
                continue;
            }
            // ③ 사람 있는 국가의 AI는 점령도 80 이상에서 마지막 승 불가(사람 없는 국가는 마무리 허용)
            $mine = $t->state === 'siege' && (int) $t->siege_season_country_id === (int) $country->id;
            if ($humans && $mine && (int) $t->occupation >= (int) $cfg['last_win_guard_occupation']) {
                continue;
            }
            $score = ($d['kind'] === 'capital' ? 30 : 10) - 2 * (int) $d['defense_level'] + ($mine ? intdiv((int) $t->occupation, 5) : 0);
            if ($style === 'defensive' && collect($nbs)->contains(fn ($c) => in_array($c, $myCapitals, true))) {
                $score += 15;   // 수도 인접 영토 수복 우선
            }
            if ($best === null || $score > $best['score']) {
                $best = ['score' => $score, 'def' => $d, 'terr' => $t];
            }
        }

        return $best;
    }

    private function fight(object $season, object $country, array $target, $terrs): void
    {
        $t = $target['terr'];
        $sim = $this->war->simulateAiBattle($target['def'], (int) config('war.ai.attacker_level'));   // 트랜잭션 밖에서 계산, 확정만 트랜잭션
        DB::transaction(function () use ($season, $country, $t, $sim) {
            $tbId = DB::table('territory_battles')->insertGetId([
                'season_id' => $season->id, 'season_territory_id' => $t->id, 'battle_id' => null, 'source' => 'ai_sim', 'seed' => $sim['seed'],
                'attacker_sc_id' => $country->id, 'defender_sc_id' => $t->owner_season_country_id, 'attacker_user_id' => null, 'defender_user_id' => null,
                'defender_kind' => 'garrison', 'settled_at' => now(), 'created_at' => now(), 'updated_at' => now(),
            ]);
            $tb = DB::table('territory_battles')->where('id', $tbId)->first();
            $s = $this->war->applyResult($tb, $sim['result']);
            $this->war->event((int) $season->id, 'ai_attack', (int) $country->id, (int) $t->id, null, ['territory' => $t->territory_code, 'result' => $sim['result'], 'captured' => $s['captured']]);
        });
    }

    private function neighborsOf(array $sc, string $code): array
    {
        $n = [];
        foreach ($sc['links'] as [$a, $b]) {
            $a === $code && $n[] = $b;
            $b === $code && $n[] = $a;
        }

        return $n;
    }

    private function staleSiege(object $t): bool
    {
        return $t->last_battle_at && CarbonImmutable::parse($t->last_battle_at, 'UTC')->addHours((int) config('war.siege_stale_hours', 48))->isPast();
    }
}
