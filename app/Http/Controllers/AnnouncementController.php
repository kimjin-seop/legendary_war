<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use App\Services\MaintenanceService;
use Carbon\CarbonImmutable;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** 공지·점검: 공개(GET /announcements, GET /maintenance) + 어드민(공지 CRUD 일부, 점검 설정). 변경은 audit_logs 기록. */
class AnnouncementController extends Controller
{
    private const RULES = [
        'kind' => ['in:notice,event,maintenance'], 'title' => ['string', 'max:100'], 'body' => ['string', 'max:4000'], 'pinned' => ['boolean'], 'enabled' => ['boolean'],
        'starts_at' => ['nullable', 'date'], 'ends_at' => ['nullable', 'date'],
    ];
    private const REASON = ['required', 'string', 'max:200'];   // 변경 사유(감사 로그 필수)

    /** 입력 시각(타임존 포함 가능, 없으면 앱 타임존=UTC)을 UTC 'Y-m-d H:i:s' 로 정규화(조회 비교 형식과 동일) */
    private function utc(?string $v): ?string
    {
        return $v === null || $v === '' ? null : CarbonImmutable::parse($v)->utc()->format('Y-m-d H:i:s');
    }

    public function __construct(private readonly MaintenanceService $maintenance)
    {
    }

    /** GET /api/announcements: 현재 노출 중(enabled, 기간 내) 공지, 고정 우선 최신순 최대 50 */
    public function index(): JsonResponse
    {
        $now = now();
        $rows = DB::table('announcements')->where('enabled', 1)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', $now))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>', $now))
            ->orderByDesc('pinned')->orderByDesc('id')->limit(50)->get(['id', 'kind', 'title', 'body', 'pinned', 'starts_at', 'ends_at', 'created_at']);

        return response()->json(['announcements' => $rows]);
    }

    /** GET /api/maintenance */
    public function status(): JsonResponse
    {
        return response()->json($this->maintenance->status());
    }

    // ---- 어드민 ----

    public function adminIndex(Request $request): JsonResponse
    {
        $per = (int) ($request->validate(['per_page' => ['sometimes', 'integer', 'min:1', 'max:200']])['per_page'] ?? 50);

        return response()->json(DB::table('announcements')->orderByDesc('id')->paginate($per ?: 50));
    }

    public function store(Request $request): JsonResponse
    {
        $rules = ['title' => ['required'] + self::RULES['title'], 'body' => ['required'] + self::RULES['body']] + array_map(fn ($r) => array_merge(['sometimes'], $r), array_diff_key(self::RULES, ['title' => 1, 'body' => 1]));
        $v = $request->validate($rules + ['reason' => self::REASON]);
        $v['starts_at'] = $this->utc($v['starts_at'] ?? null);
        $v['ends_at'] = $this->utc($v['ends_at'] ?? null);
        $this->checkRange($v['starts_at'], $v['ends_at']);
        $row = ['kind' => $v['kind'] ?? 'notice', 'title' => $v['title'], 'body' => $v['body'], 'pinned' => (int) ($v['pinned'] ?? false), 'enabled' => (int) ($v['enabled'] ?? true),
            'starts_at' => $v['starts_at'] ?? null, 'ends_at' => $v['ends_at'] ?? null, 'created_by' => $request->user()->id, 'created_at' => now(), 'updated_at' => now()];
        $id = DB::transaction(function () use ($row, $request, $v) {
            $id = DB::table('announcements')->insertGetId($row);
            $this->audit($request, 'announcement_create', (string) $id, null, $row + ['_reason' => $v['reason']]);

            return $id;
        });

        return response()->json(['item' => DB::table('announcements')->find($id)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = DB::table('announcements')->find($id) ?? throw new IllegalAction('not_found', '공지가 없습니다.', 404);
        $some = array_map(fn ($r) => array_merge(['sometimes'], $r), self::RULES);
        $reason = $request->validate(['reason' => self::REASON])['reason'];
        $data = \Illuminate\Support\Facades\Validator::make($request->only(array_keys($some)), $some)->validate();
        $data === [] && throw new IllegalAction('nothing_to_update', '수정할 값이 없습니다.');
        array_key_exists('starts_at', $data) && $data['starts_at'] = $this->utc($data['starts_at']);
        array_key_exists('ends_at', $data) && $data['ends_at'] = $this->utc($data['ends_at']);
        $this->checkRange($data['starts_at'] ?? $row->starts_at, $data['ends_at'] ?? $row->ends_at);
        foreach (['pinned', 'enabled'] as $b) {
            isset($data[$b]) && $data[$b] = (int) $data[$b];
        }
        $before = array_intersect_key((array) $row, $data);
        DB::transaction(function () use ($id, $data, $request, $before, $reason) {
            DB::table('announcements')->where('id', $id)->update($data + ['updated_at' => now()]);
            $this->audit($request, 'announcement_update', (string) $id, $before, $data + ['_reason' => $reason]);
        });

        return response()->json(['item' => DB::table('announcements')->find($id), 'before' => $before, 'after' => $data]);
    }

    /** GET /api/admin/maintenance */
    public function adminMaintenance(): JsonResponse
    {
        return response()->json($this->maintenance->status());
    }

    /** PUT /api/admin/maintenance {enabled, message?, starts_at?, ends_at?, confirm:"MAINTENANCE"(enabled=true 일 때)} */
    public function setMaintenance(Request $request): JsonResponse
    {
        $v = $request->validate(['enabled' => ['required', 'boolean'], 'message' => ['nullable', 'string', 'max:200'], 'starts_at' => ['nullable', 'date'], 'ends_at' => ['nullable', 'date'], 'confirm' => ['sometimes', 'string'], 'reason' => self::REASON]);
        if ($v['enabled'] && ($v['confirm'] ?? null) !== 'MAINTENANCE') {
            throw new IllegalAction('confirm_required', '점검 모드를 켜려면 confirm="MAINTENANCE" 가 필요합니다.', 422);
        }
        $v['starts_at'] = $this->utc($v['starts_at'] ?? null);
        $v['ends_at'] = $this->utc($v['ends_at'] ?? null);
        $this->checkRange($v['starts_at'], $v['ends_at']);
        $before = $this->maintenance->get();
        $new = ['enabled' => (bool) $v['enabled'], 'message' => $v['message'] ?? null, 'starts_at' => $v['starts_at'], 'ends_at' => $v['ends_at']];
        DB::transaction(function () use ($new, $before, $request, $v) {
            $this->maintenance->put($new);
            $this->audit($request, 'maintenance_set', 'maintenance', $before, $new + ['_reason' => $v['reason']]);
        });

        return response()->json($this->maintenance->status());
    }

    private function checkRange(?string $from, ?string $to): void
    {
        if ($from && $to && strtotime($to) <= strtotime($from)) {
            throw new IllegalAction('invalid_range', 'ends_at 은 starts_at 이후여야 합니다.', 422);
        }
    }

    private function audit(Request $r, string $action, string $key, ?array $before, ?array $after): void
    {
        DB::table('audit_logs')->insert(['user_id' => $r->user()->id, 'action' => $action, 'entity' => str_starts_with($action, 'maintenance') ? 'maintenance' : 'announcements', 'entity_key' => $key,
            'before' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE), 'after' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
    }
}
