<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Support\DailyCounter;
use App\Support\Period;
use Carbon\CarbonImmutable;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;

/**
 * 일일 교환소(골드로 상품 구매). 가격·한도는 DB 값만 신뢰, 한도는 KST 05:00 기준 일일 카운터,
 * request_id 로 멱등(같은 요청 재전송 = replay, 이중 차감·한도 소모 없음). 단순 구매이며 자동 전투/소탕과 무관.
 */
class ExchangeService
{
    public const KINDS = ['equipment', 'currency'];

    public function __construct(private readonly ProgressionService $progress)
    {
    }

    private function scope(int $userId, int $productId): string
    {
        return "exchange:{$userId}:{$productId}";
    }

    private function bal(int $userId, string $currency): int
    {
        return (int) (DB::table('wallets')->where('user_id', $userId)->where('currency_code', $currency)->value('balance') ?? 0);
    }

    /** 다음 초기화 시각(KST 05:00) ISO8601 */
    public function resetAt(): string
    {
        return CarbonImmutable::parse(Period::dailyKey(), Period::TZ)->addDay()->setTime(Period::RESET_HOUR, 0)->toIso8601String();
    }

    /** GET /api/exchange */
    public function list(int $userId): array
    {
        $period = Period::dailyKey();
        $items = DB::table('exchange_products')->where('enabled', 1)->orderBy('sort_order')->orderBy('id')->get()->map(function ($p) use ($userId, $period) {
            $bought = DailyCounter::value($this->scope($userId, (int) $p->id), $period);
            $limit = (int) $p->daily_limit;

            return ['code' => $p->code, 'name' => $p->name_ko, 'description' => $p->description, 'kind' => $p->kind, 'payload' => json_decode((string) $p->payload, true),
                'price_gold' => (int) $p->price_gold, 'price' => (int) $p->price_gold, 'price_currency' => $p->price_currency ?? 'gold', 'daily_limit' => $limit, 'bought_today' => $bought, 'remaining' => $limit > 0 ? max(0, $limit - $bought) : null];
        })->all();

        return ['products' => $items, 'gold' => $this->bal($userId, 'gold'), 'pen' => $this->bal($userId, 'pen'), 'period_key' => $period, 'reset_at' => $this->resetAt()];
    }

    /** POST /api/exchange/buy {code, request_id} */
    public function buy(int $userId, string $code, string $requestId): array
    {
        try {
            return DB::transaction(fn () => $this->buyTx($userId, $code, $requestId));
        } catch (UniqueConstraintViolationException) {
            return DB::transaction(fn () => $this->replay($userId, $code, $requestId) ?? throw new IllegalAction('exchange_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409));
        }
    }

    private function response(int $userId, object $log, string $code, bool $replay): array
    {
        return ['replay' => $replay, 'purchase_id' => (int) $log->id, 'code' => $code, 'price' => (int) $log->price_gold, 'price_currency' => $log->price_currency ?? 'gold', 'gold_spent' => ($log->price_currency ?? 'gold') === 'gold' ? (int) $log->price_gold : 0,
            'granted' => json_decode((string) $log->granted, true), 'gold' => $this->bal($userId, 'gold'), 'pen' => $this->bal($userId, 'pen'), 'reset_at' => $this->resetAt()];
    }

    private function replay(int $userId, string $code, string $requestId): ?array
    {
        $log = DB::table('exchange_purchases as x')->join('exchange_products as p', 'p.id', '=', 'x.product_id')
            ->where(['x.user_id' => $userId, 'x.request_id' => $requestId])->first(['x.*', 'p.code']);
        if (! $log) {
            return null;
        }
        if ($log->code !== $code) {
            throw new IllegalAction('request_id_reused', '같은 request_id로 다른 요청을 보낼 수 없습니다.', 409);
        }

        return $this->response($userId, $log, $code, true);
    }

    private function buyTx(int $userId, string $code, string $requestId): array
    {
        if ($r = $this->replay($userId, $code, $requestId)) {
            return $r;
        }
        $p = DB::table('exchange_products')->where('code', $code)->where('enabled', 1)->first() ?? throw new IllegalAction('product_not_found', '존재하지 않는 상품입니다.', 404);
        $price = (int) $p->price_gold;
        $pc = (string) ($p->price_currency ?? 'gold');
        if ($this->bal($userId, $pc) < $price) {   // 쓰기 전에 거부
            throw new IllegalAction("insufficient_{$pc}", ($pc === 'gold' ? '골드' : ($pc === 'pen' ? '펜' : '재화')).'가 부족합니다.', 422);
        }
        $period = Period::dailyKey();
        $limit = (int) $p->daily_limit;
        if ($limit > 0 && ! DailyCounter::tryIncrement($this->scope($userId, (int) $p->id), $limit, 1, $period)) {   // 같은 트랜잭션: 이후 실패 시 카운트도 롤백
            throw new IllegalAction('daily_limit_reached', '오늘 구매 한도를 모두 사용했습니다.', 422);
        }
        $granted = $this->grant($userId, $p, json_decode((string) $p->payload, true) ?: []);
        $pid = DB::table('exchange_purchases')->insertGetId(['user_id' => $userId, 'request_id' => $requestId, 'product_id' => $p->id, 'price_gold' => $price, 'price_currency' => $pc,
            'period_key' => $period, 'granted' => json_encode($granted, JSON_UNESCAPED_UNICODE), 'created_at' => now()]);
        $price > 0 && $this->progress->credit($userId, $pc, -$price, $pc === 'gold' ? 'exchange_buy' : 'exchange_buy_'.$pc, 'exchange_purchase', $pid);
        if ($granted['kind'] === 'currency') {
            $this->progress->credit($userId, (string) $granted['currency'], (int) $granted['amount'], 'exchange_grant', 'exchange_purchase', $pid);
        }

        return $this->response($userId, DB::table('exchange_purchases')->where('id', $pid)->first(), $code, false);
    }

    /** 지급 내용 결정(equipment 는 즉시 개체 생성, currency 는 호출부가 credit) */
    private function grant(int $userId, object $p, array $payload): array
    {
        if ($p->kind === 'equipment') {
            $item = DB::table('equipment_items')->where('code', (string) ($payload['equipment_code'] ?? ''))->where('enabled', 1)->first() ?? throw new IllegalAction('product_unavailable', '상품 구성이 올바르지 않습니다.', 422);
            if (DB::table('user_equipment')->where('user_id', $userId)->count() >= (int) config('game.equipment.inventory_cap', 100)) {
                throw new IllegalAction('inventory_full', '인벤토리가 가득 찼습니다.', 422);
            }
            $id = DB::table('user_equipment')->insertGetId(['user_id' => $userId, 'equipment_item_id' => $item->id, 'acquired_at' => now(), 'source' => 'exchange', 'created_at' => now(), 'updated_at' => now()]);

            return ['kind' => 'equipment', 'equipment_code' => $item->code, 'user_equipment_id' => $id];
        }
        $cur = (string) ($payload['currency'] ?? '');
        $amt = (int) ($payload['amount'] ?? 0);
        if ($p->kind !== 'currency' || ! preg_match('/^[a-z0-9_]{1,24}$/', $cur) || in_array($cur, ['gold', 'pen'], true) || $amt < 1) {   // 펜은 획득 경로(상한 있음)로만 얻는다: 교환소 지급 금지
            throw new IllegalAction('product_unavailable', '상품 구성이 올바르지 않습니다.', 422);
        }

        return ['kind' => 'currency', 'currency' => $cur, 'amount' => $amt];
    }

    /** 어드민 상품 kind/payload 검증(생성·수정 공용) */
    public static function validatePayload(string $kind, array $payload): void
    {
        if ($kind === 'equipment') {
            (is_string($payload['equipment_code'] ?? null) && DB::table('equipment_items')->where('code', $payload['equipment_code'])->exists()) || throw new IllegalAction('invalid_payload', 'payload.equipment_code 가 올바르지 않습니다.', 422);

            return;
        }
        ($kind === 'currency' && is_string($payload['currency'] ?? null) && preg_match('/^[a-z0-9_]{1,24}$/', $payload['currency']) && ! in_array($payload['currency'], ['gold', 'pen'], true)
            && is_int($payload['amount'] ?? null) && $payload['amount'] >= 1 && $payload['amount'] <= 1000000) || throw new IllegalAction('invalid_payload', 'payload 가 올바르지 않습니다(currency 는 gold·pen 제외, amount 1~1000000).', 422);
    }
}
