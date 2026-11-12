<?php

namespace App\Http\Controllers;

use App\Game\Engine;
use App\Game\IllegalAction;
use App\Support\Rarity;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Validator;

/**
 * 어드민 API. 설정 원칙: DB가 런타임 기준, database/data/*.json 은 초기 시드(game:seed --force 로만 덮어쓰기).
 * 삭제 API는 제공하지 않는다(제한 정책). 모든 수정은 audit_logs에 누가/언제/무엇을 기록한다.
 */
class AdminController extends Controller
{
    /** entity => [table, pk, rules(수정 가능 컬럼 화이트리스트)] */
    private function entities(): array
    {
        $int = fn (int $min, int $max) => ['integer', "min:$min", "max:$max"];

        return [
            'heroes' => ['heroes', 'id', [
                'name_ko' => ['string', 'max:64'], 'rarity' => ['in:'.implode(',', Rarity::ORDER)], 'cost' => $int(1, 30),
                'hp_bonus' => $int(10, 10),   // 체력 보너스 10 고정(사용자 결정)
                'atk_bonus' => $int(-100, 200), 'def_bonus' => $int(-100, 200),
                'growth_hp_pct' => ['numeric', 'min:3', 'max:3'], 'growth_atk_pct' => ['numeric', 'min:0', 'max:30'], 'growth_def_pct' => ['numeric', 'min:0', 'max:30'],
                'verify' => ['boolean'], 'note' => ['nullable', 'string', 'max:255'],
            ]],
            'unit-types' => ['unit_types', 'id', [
                'name' => ['string', 'max:64'], 'move' => $int(1, 12), 'range_min' => $int(1, 8), 'range_max' => $int(1, 8),
                'hp' => $int(1, 2000), 'atk' => $int(0, 500), 'def' => $int(0, 500), 'heal' => $int(0, 500),
            ]],
            'matchups' => ['matchup_rules', 'id', ['multiplier' => ['numeric', 'min:0.1', 'max:5']]],
            'terrain-modifiers' => ['terrain_modifiers', 'id', ['move_cost' => ['nullable', 'integer', 'min:1', 'max:20'], 'def_pct' => $int(-100, 300)]],
            'skills' => ['skills', 'id', ['name' => ['string', 'max:64'], 'description' => ['nullable', 'string', 'max:255'], 'params' => ['array', 'max:8']]],
            'maps' => ['maps', 'id', ['rules' => ['nullable', 'array']]],   // 맵별 규칙 오버라이드(화이트리스트 키만)
            'presets' => ['presets', 'id', ['name' => ['string', 'max:64'], 'units' => ['array', 'min:1', 'max:5'], 'units.*' => ['string', 'exists:unit_types,code', 'not_in:'.implode(',', array_keys((array) config('game.retired_unit_types')))]]],
            'stages' => ['stages', 'id', [
                'name' => ['string', 'max:64'], 'recommended_level' => $int(1, 100), 'enemy_level' => $int(1, 100), 'reward_exp' => $int(0, 100000),
                'reward_user_exp' => $int(0, 100000), 'reward_gold' => $int(0, 1000000), 'difficulty' => $int(1, 10),
                'enemy_extra_troops' => ['array', 'max:4'], 'enemy_extra_troops.*' => ['string', 'exists:unit_types,code', 'not_in:'.implode(',', array_keys((array) config('game.retired_unit_types')))], 'enemy_level_offset' => $int(-10, 10),
            ]],
            'user-level-costs' => ['user_level_costs', 'level', ['exp_to_next' => $int(0, 10000000), 'max_cost' => $int(1, 500), 'party_slots' => $int(1, 6)]],
            'hero-levels' => ['hero_levels', 'level', ['exp_to_next' => $int(1, 10000000)]],
        ];
    }

    private function entity(string $name): array
    {
        return $this->entities()[$name] ?? throw new IllegalAction('unknown_entity', '알 수 없는 설정 항목입니다.', 404);
    }

    private function audit(Request $r, string $action, string $entity, string|int|null $key, ?array $before, ?array $after): void
    {
        DB::table('audit_logs')->insert([
            'user_id' => $r->user()->id, 'action' => $action, 'entity' => $entity, 'entity_key' => $key === null ? null : (string) $key,
            'before' => $before === null ? null : json_encode($before), 'after' => $after === null ? null : json_encode($after), 'created_at' => now(),
        ]);
    }

    /** GET /config/{entity}[?q=&page=&per_page=]: q/page/per_page 가 없으면 기존 응답({items}, 최대 500), 있으면 검색(name·code·name_ko 부분일치)+페이지네이션 */
    public function index(Request $request, string $entity): JsonResponse
    {
        [$table, $pk] = $this->entity($entity);
        if (! $request->hasAny(['q', 'page', 'per_page'])) {
            return response()->json(['items' => DB::table($table)->orderBy($pk)->limit(500)->get()]);
        }
        $v = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:64'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:200']]);
        $q = DB::table($table)->orderBy($pk);
        if (($v['q'] ?? '') !== '') {
            $like = '%'.addcslashes($v['q'], '%_\\').'%';
            $cols = array_values(array_filter(['name', 'code', 'name_ko'], fn ($c) => \Illuminate\Support\Facades\Schema::hasColumn($table, $c)));
            $cols !== [] && $q->where(function ($w) use ($cols, $like) {
                foreach ($cols as $c) {
                    $w->orWhereRaw("{$c} like ? escape '\\'", [$like]);
                }
            });
        }

        return response()->json($q->paginate((int) ($v['per_page'] ?? 50)));
    }

    public function show(string $entity, int $id): JsonResponse
    {
        [$table, $pk] = $this->entity($entity);
        $row = DB::table($table)->where($pk, $id)->first() ?? throw new IllegalAction('not_found', '항목이 없습니다.', 404);

        return response()->json(['item' => $row]);
    }

    public function update(Request $request, string $entity, int $id): JsonResponse
    {
        [$table, $pk, $rules] = $this->entity($entity);
        $sometimes = [];
        foreach ($rules as $k => $r) {
            $sometimes[$k] = array_merge(['sometimes'], $r);
        }
        $reason = $request->validate(['reason' => ['sometimes', 'nullable', 'string', 'max:200']])['reason'] ?? null;   // 변경 사유(선택): audit_logs.after._reason 에 저장
        $data = Validator::make($request->only(array_keys($rules)), $sometimes)->validate();
        if ($data === []) {
            throw new IllegalAction('nothing_to_update', '수정할 값이 없습니다.');
        }
        if ($table === 'skills' && isset($data['params'])) {
            // params 구조: 엔진이 읽는 키만 허용, 값은 범위 내 정수
            $limits = ['power_pct' => 1000, 'cooldown' => 20, 'def_pct' => 1000, 'atk_pct' => 1000, 'heal' => 1000, 'duration' => 20];
            foreach ($data['params'] as $k => $v) {
                if (! is_string($k) || ! isset($limits[$k]) || ! is_int($v) || $v < 0 || $v > $limits[$k]) {
                    throw new IllegalAction('invalid_params', "skills.params 항목이 올바르지 않습니다: {$k}", 422);
                }
            }
        }
        if ($table === 'maps' && array_key_exists('rules', $data)) {
            try {
                $data['rules'] = Engine::sanitizeMapRules($data['rules']) ?: null;
            } catch (\InvalidArgumentException $e) {
                throw new IllegalAction('invalid_params', $e->getMessage(), 422);
            }
        }
        $row = DB::table($table)->where($pk, $id)->first() ?? throw new IllegalAction('not_found', '항목이 없습니다.', 404);
        // 교차 검증: 사거리 min <= max
        if ($table === 'unit_types') {
            $min = $data['range_min'] ?? $row->range_min;
            $max = $data['range_max'] ?? $row->range_max;
            if ($min > $max) {
                throw new IllegalAction('invalid_range', 'range_min은 range_max 이하여야 합니다.');
            }
        }
        $update = array_map(fn ($v) => is_array($v) ? json_encode($v) : $v, $data);
        $before = array_intersect_key((array) $row, $update);
        DB::transaction(function () use ($table, $pk, $id, $update, $request, $entity, $before, $reason) {
            DB::table($table)->where($pk, $id)->update($update + (in_array($table, ['hero_levels', 'user_level_costs'], true) ? [] : ['updated_at' => now()]));
            $this->audit($request, 'update', $entity, $id, $before, $update + ($reason !== null && $reason !== '' ? ['_reason' => $reason] : []));
        });

        return response()->json(['item' => DB::table($table)->where($pk, $id)->first(), 'before' => $before, 'after' => $update]);   // before/after: 변경된 필드의 전후 값(audit 기록과 동일)
    }

    /** GET /users[?q=이름·이메일 부분일치&role=&is_guest=&banned=&per_page=] 페이지네이션 */
    public function users(Request $request): JsonResponse
    {
        $v = $request->validate(['q' => ['sometimes', 'nullable', 'string', 'max:64'], 'role' => ['sometimes', 'nullable', 'string', 'max:16'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:200']]);
        $q = DB::table('users')->select('id', 'name', 'email', 'role', 'is_guest', 'level', 'exp', 'banned_at', 'created_at')->orderByDesc('id');
        if ($request->filled('banned')) {
            $request->boolean('banned') ? $q->whereNotNull('banned_at') : $q->whereNull('banned_at');
        }
        if ($request->filled('is_guest')) {
            $q->where('is_guest', $request->boolean('is_guest'));
        }
        if (($v['role'] ?? '') !== '') {
            $q->where('role', $v['role']);
        }
        if (($v['q'] ?? '') !== '') {
            $like = '%'.addcslashes($v['q'], '%_\\').'%';
            $q->where(fn ($w) => $w->whereRaw("name like ? escape '\\'", [$like])->orWhereRaw("email like ? escape '\\'", [$like]));
        }

        return response()->json($q->paginate((int) ($v['per_page'] ?? 50)));
    }

    public function ban(Request $request, int $id): JsonResponse
    {
        return $this->setBan($request, $id, true);
    }

    public function unban(Request $request, int $id): JsonResponse
    {
        return $this->setBan($request, $id, false);
    }

    private function setBan(Request $request, int $id, bool $ban): JsonResponse
    {
        $u = DB::table('users')->where('id', $id)->first() ?? throw new IllegalAction('not_found', '유저가 없습니다.', 404);
        if ($u->role === 'admin') {
            throw new IllegalAction('cannot_ban_admin', '관리자 계정은 정지할 수 없습니다.', 422);
        }
        $reason = $request->validate(['reason' => ['sometimes', 'nullable', 'string', 'max:200']])['reason'] ?? null;   // 정지/해제 사유(선택): audit_logs.after.reason
        DB::transaction(function () use ($request, $id, $u, $ban, $reason) {
            DB::table('users')->where('id', $id)->update(['banned_at' => $ban ? now() : null]);
            if ($ban) {
                DB::table('sessions')->where('user_id', $id)->delete();   // 활성 세션 즉시 무효화
            }
            $this->audit($request, $ban ? 'ban' : 'unban', 'users', $id, ['banned_at' => $u->banned_at], ['banned' => $ban] + ($reason !== null && $reason !== '' ? ['reason' => $reason] : []));
        });

        return response()->json(['ok' => true, 'banned' => $ban]);
    }

    /** GET /battles[?status=&user_id=&stage_id=&from=&to=&per_page=] 페이지네이션 */
    public function battles(Request $request): JsonResponse
    {
        $v = $request->validate(['status' => ['sometimes', 'nullable', 'string', 'max:16'], 'user_id' => ['sometimes', 'nullable', 'integer', 'min:1'], 'stage_id' => ['sometimes', 'nullable', 'integer', 'min:1'],
            'from' => ['sometimes', 'nullable', 'date'], 'to' => ['sometimes', 'nullable', 'date'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:200']]);
        $q = DB::table('battles')->select('id', 'user_id', 'stage_id', 'status', 'turn', 'winner', 'version', 'settled_at', 'created_at')->orderByDesc('id');
        foreach (['status', 'user_id', 'stage_id'] as $f) {
            if (isset($v[$f]) && $v[$f] !== '') {
                $q->where($f, $v[$f]);
            }
        }
        ! empty($v['from']) && $q->where('created_at', '>=', $v['from']);
        ! empty($v['to']) && $q->where('created_at', '<=', $v['to']);

        return response()->json($q->paginate((int) ($v['per_page'] ?? 50)));
    }

    public function battleActions(int $id): JsonResponse
    {
        DB::table('battles')->where('id', $id)->exists() || throw new IllegalAction('not_found', '전투가 없습니다.', 404);

        return response()->json(['actions' => DB::table('battle_actions')->where('battle_id', $id)->orderBy('seq')->get()]);
    }

    /** GET /audit-logs[?actor=user_id&action=&entity=&from=&to=&per_page=] 페이지네이션 */
    public function auditLogs(Request $request): JsonResponse
    {
        $v = $request->validate(['actor' => ['sometimes', 'nullable', 'integer', 'min:1'], 'action' => ['sometimes', 'nullable', 'string', 'max:64'], 'entity' => ['sometimes', 'nullable', 'string', 'max:64'],
            'from' => ['sometimes', 'nullable', 'date'], 'to' => ['sometimes', 'nullable', 'date'], 'per_page' => ['sometimes', 'integer', 'min:1', 'max:200']]);
        $q = DB::table('audit_logs')->orderByDesc('id');
        ! empty($v['actor']) && $q->where('user_id', $v['actor']);
        ! empty($v['action']) && $q->where('action', $v['action']);
        ! empty($v['entity']) && $q->where('entity', $v['entity']);
        ! empty($v['from']) && $q->where('created_at', '>=', $v['from']);
        ! empty($v['to']) && $q->where('created_at', '<=', $v['to']);

        return response()->json($q->paginate((int) ($v['per_page'] ?? 50)));
    }

    /** GET /dashboard: 활성 시즌 요약(시나리오별)·최근 이벤트·미처리 채팅 신고 수·오늘 가입/전투 수 등 간단 집계 */
    public function dashboard(): JsonResponse
    {
        $today = now()->startOfDay();
        $seasons = DB::table('seasons')->where('status', 'active')->orderBy('id')->get(['id', 'scenario_code', 'name', 'end_at'])->map(fn ($s) => [
            'id' => (int) $s->id, 'scenario_code' => $s->scenario_code, 'name' => $s->name, 'end_at' => $s->end_at,
            'members' => (int) DB::table('season_members')->where('season_id', $s->id)->count(),
            'recent_events' => DB::table('war_events')->where('season_id', $s->id)->orderByDesc('id')->limit(5)->get(['id', 'type', 'created_at']),
        ])->all();

        return response()->json([
            'active_seasons' => $seasons,
            'open_chat_reports' => (int) DB::table('chat_reports')->whereNull('handled_at')->count(),
            'users' => ['total' => (int) DB::table('users')->count(), 'today' => (int) DB::table('users')->where('created_at', '>=', $today)->count(), 'banned' => (int) DB::table('users')->whereNotNull('banned_at')->count()],
            'battles' => ['today' => (int) DB::table('battles')->where('created_at', '>=', $today)->count(), 'in_progress' => (int) DB::table('battles')->where('status', 'in_progress')->count()],
            'audit_logs_today' => (int) DB::table('audit_logs')->where('created_at', '>=', $today)->count(),
        ]);
    }
}
