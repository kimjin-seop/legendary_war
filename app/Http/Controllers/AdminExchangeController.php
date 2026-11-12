<?php

namespace App\Http\Controllers;

use App\Game\IllegalAction;
use App\Services\ExchangeService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/** 어드민 교환소 상품 관리(목록/생성/수정, 삭제 없음 = enabled=false 로 내림). 모든 변경은 audit_logs 기록. */
class AdminExchangeController extends Controller
{
    private const RULES = [
        'name_ko' => ['string', 'max:64'], 'description' => ['nullable', 'string', 'max:255'], 'kind' => ['in:equipment,currency'], 'payload' => ['array'],
        'price_gold' => ['integer', 'min:0', 'max:100000000'], 'price_currency' => ['in:gold,pen'], 'daily_limit' => ['integer', 'min:0', 'max:1000'], 'enabled' => ['boolean'], 'sort_order' => ['integer', 'min:0', 'max:100000'],
    ];
    private const REASON = ['required', 'string', 'max:200'];   // 변경 사유(감사 로그 필수)

    public function index(): JsonResponse
    {
        $rows = DB::table('exchange_products')->orderBy('sort_order')->orderBy('id')->get()->map(fn ($p) => (array) $p + ['payload_decoded' => json_decode((string) $p->payload, true)]);

        return response()->json(['products' => $rows]);
    }

    public function store(Request $request): JsonResponse
    {
        $rules = array_map(fn ($r) => array_merge(['required'], $r), array_diff_key(self::RULES, ['description' => 1, 'enabled' => 1, 'sort_order' => 1, 'price_currency' => 1])) + ['price_currency' => ['sometimes', 'in:gold,pen']];
        $v = $request->validate(['code' => ['required', 'regex:/^[a-z0-9_]{2,40}$/', 'unique:exchange_products,code'], 'reason' => self::REASON]
            + $rules + ['description' => self::RULES['description'], 'enabled' => ['sometimes', 'boolean'], 'sort_order' => ['sometimes', 'integer', 'min:0', 'max:100000']]);
        ExchangeService::validatePayload($v['kind'], $v['payload']);
        $this->assertNotFree((int) $v['price_gold'], (int) $v['daily_limit']);
        $row = ['code' => $v['code'], 'name_ko' => $v['name_ko'], 'description' => $v['description'] ?? null, 'kind' => $v['kind'], 'payload' => json_encode($v['payload']),
            'price_gold' => $v['price_gold'], 'price_currency' => $v['price_currency'] ?? 'gold', 'daily_limit' => $v['daily_limit'], 'enabled' => (int) ($v['enabled'] ?? true), 'sort_order' => $v['sort_order'] ?? 0, 'created_at' => now(), 'updated_at' => now()];
        $id = DB::transaction(function () use ($row, $request, $v) {
            $id = DB::table('exchange_products')->insertGetId($row);
            $this->audit($request, 'create', $id, null, $row + ['_reason' => $v['reason']]);

            return $id;
        });

        return response()->json(['item' => DB::table('exchange_products')->find($id)], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $row = DB::table('exchange_products')->find($id) ?? throw new IllegalAction('not_found', '상품이 없습니다.', 404);
        $some = [];
        foreach (self::RULES as $k => $r) {
            $some[$k] = array_merge(['sometimes'], $r);
        }
        $reason = $request->validate(['reason' => self::REASON])['reason'];
        $data = \Illuminate\Support\Facades\Validator::make($request->only(array_keys(self::RULES)), $some)->validate();
        if ($data === []) {
            throw new IllegalAction('nothing_to_update', '수정할 값이 없습니다.');
        }
        ExchangeService::validatePayload($data['kind'] ?? $row->kind, $data['payload'] ?? json_decode((string) $row->payload, true));
        $this->assertNotFree((int) ($data['price_gold'] ?? $row->price_gold), (int) ($data['daily_limit'] ?? $row->daily_limit));
        $upd = array_map(fn ($v) => is_array($v) ? json_encode($v) : $v, $data);
        isset($upd['enabled']) && $upd['enabled'] = (int) $upd['enabled'];
        $before = array_intersect_key((array) $row, $upd);
        DB::transaction(function () use ($id, $upd, $request, $before, $reason) {
            DB::table('exchange_products')->where('id', $id)->update($upd + ['updated_at' => now()]);
            $this->audit($request, 'update', $id, $before, $upd + ['_reason' => $reason]);
        });

        return response()->json(['item' => DB::table('exchange_products')->find($id), 'before' => $before, 'after' => $upd]);
    }

    /** 무료 + 무제한 조합은 무한 지급 경로가 되므로 거부 */
    private function assertNotFree(int $price, int $dailyLimit): void
    {
        $price === 0 && $dailyLimit === 0 && throw new IllegalAction('invalid_free_unlimited', '가격 0 이면 daily_limit 은 1 이상이어야 합니다.', 422);
    }

    private function audit(Request $r, string $action, int $id, ?array $before, ?array $after): void
    {
        DB::table('audit_logs')->insert(['user_id' => $r->user()->id, 'action' => $action, 'entity' => 'exchange-products', 'entity_key' => (string) $id,
            'before' => $before === null ? null : json_encode($before, JSON_UNESCAPED_UNICODE), 'after' => $after === null ? null : json_encode($after, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
    }
}
