<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use App\Services\WarService;
use App\Services\WarTickService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

/**
 * 시즌 전쟁 관리자 API(admin 미들웨어). 모든 변경은 audit_logs 에 남기고, war:tick 과 같은 Cache::lock('war:tick')으로 직렬화한다
 * (락을 못 잡으면 409 war_tick_busy: 틱 실행 중이므로 잠시 후 재시도). 종료된 시즌은 수정 불가(409 season_ended).
 * 파괴적 동작(시즌 생성/강제 종료)은 `confirm` 필드에 정해진 확인 문자열을 요구한다. 명세 docs/ADMIN_API_SPEC.md
 */
class AdminWarController extends Controller
{
    public function __construct(private readonly WarService $war, private readonly WarTickService $tick)
    {
    }

    /** GET /war/scenarios: 사용 가능한 시즌 시나리오(database/data/war/*.json)의 code·name·shelf_code·season_days·활성 시즌 id */
    public function scenarios(): JsonResponse
    {
        $out = [];
        foreach (glob(database_path('data/war/*.json')) ?: [] as $f) {
            $sc = (json_decode((string) file_get_contents($f), true)['scenario'] ?? null);
            if (is_array($sc) && isset($sc['code'])) {
                $out[] = ['code' => $sc['code'], 'name' => $sc['name'] ?? $sc['code'], 'shelf_code' => $sc['shelf_code'] ?? null, 'season_days' => (int) ($sc['season_days'] ?? 28),
                    'active_season_id' => DB::table('seasons')->where('scenario_code', $sc['code'])->where('status', 'active')->value('id')];
            }
        }
        usort($out, fn ($a, $b) => strcmp($a['code'], $b['code']));

        return response()->json(['scenarios' => $out]);
    }

    /** GET ?season_id= (생략 시 활성 시즌, 없으면 가장 최근 시즌) */
    public function season(Request $request): JsonResponse
    {
        $d = $request->validate(['season_id' => ['sometimes', 'integer', 'min:1'], 'scenario_code' => ['sometimes', 'string', 'regex:/^[a-z0-9_]{1,32}$/']]);
        $q = DB::table('seasons');
        isset($d['scenario_code']) && $q->where('scenario_code', $d['scenario_code']);   // 시나리오별 시즌 조회
        $season = isset($d['season_id']) ? $q->where('id', $d['season_id'])->first()
            : ((clone $q)->where('status', 'active')->orderByDesc('id')->first() ?? $q->orderByDesc('id')->first());
        if (! $season) {
            throw new IllegalAction('season_not_found', '시즌이 없습니다.', 404);
        }
        $countries = DB::table('season_countries')->where('season_id', $season->id)->orderBy('id')->get();
        $code = $countries->pluck('country_code', 'id');
        $terrs = DB::table('season_territories')->where('season_id', $season->id)->orderBy('id')->get();
        $owned = $terrs->groupBy('owner_season_country_id')->map->count();

        return response()->json([
            'season' => ['id' => (int) $season->id, 'scenario_code' => $season->scenario_code, 'name' => $season->name, 'status' => $season->status, 'start_at' => $season->start_at, 'end_at' => $season->end_at],
            'countries' => $countries->map(fn ($c) => ['id' => (int) $c->id, 'code' => $c->country_code, 'score' => (int) $c->score, 'member_count' => (int) $c->member_count, 'territories' => (int) ($owned[$c->id] ?? 0)])->all(),
            'territories' => $terrs->map(fn ($t) => [
                'id' => (int) $t->id, 'code' => $t->territory_code, 'owner' => $code[$t->owner_season_country_id] ?? null, 'state' => $t->state,
                'siege_country' => $t->siege_season_country_id ? ($code[$t->siege_season_country_id] ?? null) : null, 'occupation' => (int) $t->occupation,
                'last_battle_at' => $t->last_battle_at, 'version' => (int) $t->version,
            ])->all(),
            'recent_events' => DB::table('war_events')->where('season_id', $season->id)->orderByDesc('id')->limit(30)->get()
                ->map(fn ($e) => ['id' => (int) $e->id, 'type' => $e->type, 'country' => $code[$e->season_country_id] ?? null, 'territory_id' => $e->season_territory_id, 'payload' => json_decode((string) $e->payload, true), 'created_at' => $e->created_at])->all(),
        ]);
    }

    /** POST {scenario_code?, confirm:"CREATE_SEASON"}: 해당 시나리오의 활성 시즌이 없을 때만 새 시즌 생성 */
    public function create(Request $request): JsonResponse
    {
        $d = $request->validate(['scenario_code' => ['sometimes', 'string', 'regex:/^[a-z0-9_]{1,32}$/'], 'confirm' => ['required', 'string']]);
        $this->confirm($d['confirm'], 'CREATE_SEASON');
        $scenario = $d['scenario_code'] ?? 'imjin';

        return $this->locked(function () use ($request, $scenario) {
            if (DB::table('seasons')->where('scenario_code', $scenario)->where('status', 'active')->exists()) {
                throw new IllegalAction('season_exists', '이미 활성 시즌이 있습니다. 먼저 종료하세요.', 409);
            }
            $id = $this->war->ensureSeason($scenario);
            $this->audit($request, 'war_season_create', 'seasons', $id, null, ['scenario_code' => $scenario]);

            return response()->json(['ok' => true, 'season_id' => $id], 201);
        });
    }

    /** POST {confirm:"END_SEASON_<id>", reason}: 활성 시즌 강제 종료(순위·MVP 기록은 정상 종료와 동일). 새 시즌은 다음 war:tick 이 만든다 */
    public function end(Request $request, int $id): JsonResponse
    {
        $d = $request->validate(['confirm' => ['required', 'string'], 'reason' => ['required', 'string', 'min:5', 'max:200']]);
        $this->confirm($d['confirm'], 'END_SEASON_'.$id);

        return $this->locked(function () use ($request, $id, $d) {
            $season = $this->activeSeason($id);
            $ok = $this->tick->endSeason($season);
            $ok && $this->audit($request, 'war_season_end', 'seasons', $id, ['status' => 'active'], ['status' => 'ended', 'reason' => $d['reason']]);

            return response()->json(['ok' => true, 'ended' => $ok]);
        });
    }

    /** PATCH {occupation:0..99, reason}: 공성 중(siege) 영토의 점령도 보정. 0이면 공성 종료. 소유권 이전(100)은 허용하지 않는다 */
    public function occupation(Request $request, int $id): JsonResponse
    {
        $max = (int) config('war.occupation_required', 100) - 1;
        $d = $request->validate(['occupation' => ['required', 'integer', 'min:0', "max:$max"], 'reason' => ['required', 'string', 'min:5', 'max:200']]);

        return $this->locked(function () use ($request, $id, $d) {
            return DB::transaction(function () use ($request, $id, $d) {
                $t = DB::table('season_territories')->where('id', $id)->lockForUpdate()->first() ?? throw new IllegalAction('territory_not_found', '영토가 없습니다.', 404);
                $this->activeSeason((int) $t->season_id);
                if ($t->state !== 'siege') {
                    throw new IllegalAction('not_in_siege', '공성 중인 영토만 보정할 수 있습니다.', 422);
                }
                $new = (int) $d['occupation'];
                $upd = ['occupation' => $new, 'version' => DB::raw('version + 1'), 'updated_at' => now()];
                $new === 0 && $upd += ['state' => 'peace', 'siege_season_country_id' => null];
                $hit = DB::table('season_territories')->where('id', $t->id)->where('version', $t->version)->update($upd);
                if ($hit === 0) {
                    throw new IllegalAction('version_conflict', '다른 처리와 충돌했습니다. 다시 시도하세요.', 409);
                }
                DB::table('territory_occupation_logs')->insert([
                    'season_id' => $t->season_id, 'season_territory_id' => $t->id, 'kind' => 'admin', 'occ_before' => $t->occupation, 'occ_after' => $new,
                    'owner_before_sc_id' => $t->owner_season_country_id, 'owner_after_sc_id' => $t->owner_season_country_id, 'created_at' => now(),
                ]);
                $this->war->event((int) $t->season_id, $new === 0 ? 'siege_end' : 'admin_adjust', (int) $t->owner_season_country_id, (int) $t->id, null, ['territory' => $t->territory_code, 'reason' => 'admin', 'from' => (int) $t->occupation, 'to' => $new]);
                $this->audit($request, 'war_occupation_adjust', 'season_territories', $t->id, ['occupation' => (int) $t->occupation, 'state' => $t->state], ['occupation' => $new, 'reason' => $d['reason']]);

                return response()->json(['ok' => true, 'territory_id' => (int) $t->id, 'occupation' => $new, 'state' => $new === 0 ? 'peace' : 'siege']);
            });
        });
    }

    private function confirm(string $given, string $expected): void
    {
        if (! hash_equals($expected, $given)) {
            throw new IllegalAction('confirm_required', "확인 문자열이 필요합니다: confirm=\"$expected\"", 422);
        }
    }

    private function activeSeason(int $id): object
    {
        $s = DB::table('seasons')->where('id', $id)->first() ?? throw new IllegalAction('season_not_found', '시즌이 없습니다.', 404);
        if ($s->status !== 'active') {
            throw new IllegalAction('season_ended', '활성 시즌만 수정할 수 있습니다.', 409);
        }

        return $s;
    }

    /** war:tick 과 같은 락을 잡고 실행(틱과 동시 실행 방지) */
    private function locked(\Closure $fn): JsonResponse
    {
        $lock = Cache::lock('war:tick', 900);
        if (! $lock->get()) {
            throw new IllegalAction('war_tick_busy', 'war:tick 이 실행 중입니다. 잠시 후 다시 시도하세요.', 409);
        }
        try {
            return $fn();
        } finally {
            $lock->release();
        }
    }

    private function audit(Request $r, string $action, string $entity, string|int|null $key, ?array $before, ?array $after): void
    {
        DB::table('audit_logs')->insert([
            'user_id' => $r->user()->id, 'action' => $action, 'entity' => $entity, 'entity_key' => $key === null ? null : (string) $key,
            'before' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE), 'after' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE), 'created_at' => now(),
        ]);
    }
}
