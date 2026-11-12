<?php

namespace App\Services;

use App\Game\BattleItems;
use App\Game\IllegalAction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/** 전투 소모품 상점(골드). 가격은 서버 정의만 신뢰, 구매는 한 트랜잭션(request_id 멱등). docs/BATTLE_ITEMS_SPEC.md */
class ItemShopService
{
    public function __construct(private readonly ProgressionService $progress)
    {
    }

    private function assertAvailable(): void
    {
        BattleItems::enabled() || throw new IllegalAction('items_disabled', '소모품을 사용할 수 없습니다.', 404);
    }

    private function gold(int $userId): int
    {
        return (int) (DB::table('wallets')->where('user_id', $userId)->where('currency_code', 'gold')->value('balance') ?? 0);
    }

    /** GET /api/shop/items */
    public function list(int $userId): array
    {
        $this->assertAvailable();
        $own = DB::table('user_items')->where('user_id', $userId)->pluck('qty', 'item_code');
        $items = [];
        foreach (BattleItems::all() as $code => $d) {
            $items[] = ['code' => $code, 'name' => $d['name_ko'], 'kind' => $d['kind'], 'price' => (int) $d['price_gold'], 'owned' => (int) ($own[$code] ?? 0)]
                + ['per_battle_uses' => (int) ($d['per_battle_uses'] ?? 0), 'stack_limit' => (int) ($d['stack_limit'] ?? BattleItems::maxStack())]
                + ($d['kind'] === 'heal' ? array_filter(['heal_flat' => $d['heal_flat'] ?? null, 'heal_pct' => $d['heal_pct'] ?? null], fn ($v) => $v !== null) : ['stat' => $d['stat'], 'amount' => (int) $d['amount'], 'duration' => (int) $d['duration']]);
        }

        return ['items' => $items, 'gold' => $this->gold($userId), 'max_per_battle' => BattleItems::maxPerBattle(), 'max_stack' => BattleItems::maxStack()];
    }

    /** GET /api/items (보유 수량만) */
    public function owned(int $userId): array
    {
        $this->assertAvailable();

        return ['items' => DB::table('user_items')->where('user_id', $userId)->where('qty', '>', 0)->orderBy('item_code')->get(['item_code', 'qty'])
            ->map(fn ($r) => ['code' => $r->item_code, 'qty' => (int) $r->qty])->all()];
    }

    /** POST /api/shop/items/buy {code, qty, request_id} */
    public function buy(int $userId, string $code, int $qty, string $requestId): array
    {
        $this->assertAvailable();
        try {
            return DB::transaction(fn () => $this->buyTx($userId, $code, $qty, $requestId));
        } catch (UniqueConstraintViolationException) {
            return DB::transaction(fn () => $this->replay($userId, $code, $qty, $requestId) ?? throw new IllegalAction('shop_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409));
        }
    }

    private function replay(int $userId, string $code, int $qty, string $requestId): ?array
    {
        $log = DB::table('item_purchases')->where(['user_id' => $userId, 'request_id' => $requestId])->first();
        if (! $log) {
            return null;
        }
        if ($log->item_code !== $code || (int) $log->qty !== $qty) {
            throw new IllegalAction('request_id_reused', '같은 request_id로 다른 요청을 보낼 수 없습니다.', 409);
        }

        return $this->response($userId, $code, (int) $log->qty, (int) $log->price_gold, true);
    }

    private function response(int $userId, string $code, int $qty, int $spent, bool $replay): array
    {
        return ['replay' => $replay, 'code' => $code, 'qty' => $qty, 'gold_spent' => $spent, 'gold' => $this->gold($userId),
            'owned' => (int) (DB::table('user_items')->where(['user_id' => $userId, 'item_code' => $code])->value('qty') ?? 0)];
    }

    private function buyTx(int $userId, string $code, int $qty, string $requestId): array
    {
        if ($r = $this->replay($userId, $code, $qty, $requestId)) {
            return $r;
        }
        $d = BattleItems::get($code) ?? throw new IllegalAction('item_not_found', '존재하지 않는 상품입니다.', 404);
        ($qty >= 1 && $qty <= BattleItems::maxBuyQty()) || throw new IllegalAction('invalid_qty', '구매 수량이 올바르지 않습니다.', 422);
        $limit = (int) ($d['stack_limit'] ?? BattleItems::maxStack());
        $price = (int) $d['price_gold'] * $qty;
        $now = now();
        DB::table('user_items')->insertOrIgnore(['user_id' => $userId, 'item_code' => $code, 'qty' => 0, 'created_at' => $now, 'updated_at' => $now]);
        // 보유 한도: 잠금 없는 SELECT 대신 조건부 UPDATE 한 번으로 검사+가산(동시 요청 시 DB가 직렬화). 영향 행 0이면 한도 초과 -> 트랜잭션 롤백
        $n = DB::table('user_items')->where(['user_id' => $userId, 'item_code' => $code])->whereRaw('qty + ? <= ?', [$qty, $limit])->update(['qty' => DB::raw('qty + '.(int) $qty), 'updated_at' => $now]);
        $n === 1 || throw new IllegalAction('stack_full', '보유 한도를 초과합니다.', 422);
        $this->gold($userId) >= $price || throw new IllegalAction('insufficient_gold', '골드가 부족합니다.', 422);
        $pid = DB::table('item_purchases')->insertGetId(['user_id' => $userId, 'request_id' => $requestId, 'item_code' => $code, 'qty' => $qty, 'price_gold' => $price, 'created_at' => $now]);
        if ($price > 0) {
            $this->progress->credit($userId, 'gold', -$price, 'shop_item', 'item_purchase', $pid);   // 잔액 부족 시 IllegalAction -> 전체 롤백
        }

        return $this->response($userId, $code, $qty, $price, false);
    }

    /** 전투 중 사용 전 확인: 보유 1개 이상 */
    public function assertOwned(int $userId, string $code): void
    {
        (int) (DB::table('user_items')->where(['user_id' => $userId, 'item_code' => $code])->value('qty') ?? 0) >= 1
            || throw new IllegalAction('item_not_owned', '보유하지 않은 소모품입니다.', 422);
    }

    /** 사용 확정 차감(전투 트랜잭션 안). 환불 없음 */
    public function consume(int $userId, string $code): void
    {
        $n = DB::table('user_items')->where(['user_id' => $userId, 'item_code' => $code])->where('qty', '>=', 1)->update(['qty' => DB::raw('qty - 1'), 'updated_at' => now()]);
        $n === 1 || throw new IllegalAction('item_not_owned', '보유하지 않은 소모품입니다.', 422);
    }
}
