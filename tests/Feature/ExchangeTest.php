<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 일일 교환소 핵심: 서버 가격, 일일 한도, request_id 멱등, 어드민 상품 관리. */
class ExchangeTest extends TestCase
{
    use RefreshDatabase;

    private function actor(int $gold = 1000): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'ex'])->assertCreated();
        $uid = (int) $r->json('user.id');
        $gold > (int) config('game.starter_gold') && app(ProgressionService::class)->credit($uid, 'gold', $gold - (int) config('game.starter_gold'), 'test_grant', 'test', 1);

        return [$uid, ['X-Guest-Token' => $r->json('guest_token')]];
    }

    private function product(string $code, array $o = []): int
    {
        return DB::table('exchange_products')->insertGetId($o + ['code' => $code, 'name_ko' => $code, 'kind' => 'currency', 'payload' => json_encode(['currency' => 'ticket', 'amount' => 2]),
            'price_gold' => 100, 'daily_limit' => 2, 'enabled' => 1, 'sort_order' => 0, 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_구매는_서버_가격으로_차감되고_한도를_넘으면_거부되며_같은_request_id는_재생된다(): void
    {
        [$uid, $h] = $this->actor();
        $this->product('p1');
        $gold0 = (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance');
        $buy = fn (string $rid) => $this->withHeaders($h)->postJson('/api/exchange/buy', ['code' => 'p1', 'request_id' => $rid, 'price_gold' => 1]);   // 클라이언트 가격은 무시

        $buy('req-0000001')->assertOk()->assertJsonPath('gold_spent', 100)->assertJsonPath('granted.amount', 2)->assertJsonPath('replay', false);
        $buy('req-0000001')->assertOk()->assertJsonPath('replay', true);   // 멱등: 재차감·한도 소모 없음
        $this->assertSame($gold0 - 100, (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance'));
        $this->assertSame(2, (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'ticket'])->value('balance'));
        $buy('req-0000002')->assertOk();
        $buy('req-0000003')->assertStatus(422)->assertJsonPath('error.code', 'daily_limit_reached');
        $this->withHeaders($h)->getJson('/api/exchange')->assertOk()->assertJsonPath('products.0.remaining', 0)->assertJsonPath('products.0.bought_today', 2);
        $this->assertSame(200, DB::table('exchange_purchases')->where('user_id', $uid)->sum('price_gold'));
    }

    public function test_골드_부족은_한도를_소모하지_않고_어드민이_상품을_만들고_수정한다(): void
    {
        [$uid, $h] = $this->actor();
        $this->product('rich', ['price_gold' => 999999]);
        $this->withHeaders($h)->postJson('/api/exchange/buy', ['code' => 'rich', 'request_id' => 'req-9999999'])->assertStatus(422)->assertJsonPath('error.code', 'insufficient_gold');
        $this->assertSame(0, DB::table('daily_counters')->where('scope', 'like', 'exchange:%')->count() ? DB::table('daily_counters')->where('scope', 'like', 'exchange:%')->sum('value') : 0);

        $aid = DB::table('users')->insertGetId(['name' => 'adm', 'email' => 'adm@x.test', 'password' => 'x', 'is_guest' => false, 'role' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        $admin = User::findOrFail($aid);
        $this->actingAs(User::findOrFail($uid), 'sanctum')->getJson('/api/admin/exchange/products')->assertForbidden();
        $r = $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exchange/products', ['code' => 'new_one', 'name_ko' => '신상', 'kind' => 'currency',
            'payload' => ['currency' => 'ticket', 'amount' => 3], 'price_gold' => 50, 'daily_limit' => 1, 'reason' => '테스트'])->assertCreated();
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exchange/products', ['code' => 'bad', 'name_ko' => 'x', 'kind' => 'currency',
            'payload' => ['currency' => 'gold', 'amount' => 3], 'price_gold' => 50, 'daily_limit' => 1, 'reason' => 'r'])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exchange/products', ['code' => 'free_inf', 'name_ko' => 'x', 'kind' => 'currency',
            'payload' => ['currency' => 'ticket', 'amount' => 3], 'price_gold' => 0, 'daily_limit' => 0, 'reason' => 'r'])->assertStatus(422)->assertJsonPath('error.code', 'invalid_free_unlimited');
        $this->actingAs($admin, 'sanctum')->postJson('/api/admin/exchange/products', ['code' => 'noreason', 'name_ko' => 'x', 'kind' => 'currency',
            'payload' => ['currency' => 'ticket', 'amount' => 3], 'price_gold' => 5, 'daily_limit' => 1])->assertStatus(422);   // 사유 필수
        $this->actingAs($admin, 'sanctum')->patchJson('/api/admin/exchange/products/'.$r->json('item.id'), ['price_gold' => 70, 'enabled' => false, 'reason' => '가격 조정'])->assertOk()->assertJsonPath('before.price_gold', 50);
        $this->assertSame(2, DB::table('audit_logs')->where('entity', 'exchange-products')->count());
        $this->withHeaders($h)->postJson('/api/exchange/buy', ['code' => 'new_one', 'request_id' => 'req-1111111'])->assertStatus(404);   // 비활성
    }

    public function test_지갑_차감은_원자적이라_잔액_이상을_두번_쓸_수_없고_펜_지급_상품과_force_시드_enabled_보존(): void
    {
        [$uid] = $this->actor(100);
        $p = app(ProgressionService::class);
        $gold = fn () => (int) DB::table('wallets')->where(['user_id' => $uid, 'currency_code' => 'gold'])->value('balance');
        $b0 = $gold();
        $p->credit($uid, 'gold', -($b0 - 10), 'test_spend', 'test', 11);   // 잔액을 10 으로
        try {
            $p->credit($uid, 'gold', -60, 'test_spend', 'test', 12);   // 같은 잔액에서 이중 사용 시도
            $this->fail('잔액 부족이어야 함');
        } catch (\App\Game\IllegalAction $e) {
            $this->assertSame('insufficient_balance', $e->reason);
        }
        $this->assertSame(10, $gold());
        $this->assertFalse($p->credit($uid, 'gold', -($b0 - 10), 'test_spend', 'test', 11));   // 같은 ref 재호출 = 멱등(잔액 불변)
        $this->assertSame(10, $gold());

        // 교환소로 펜 지급 상품은 만들 수 없다(획득 상한 우회 방지)
        $this->expectException(\App\Game\IllegalAction::class);
        \App\Services\ExchangeService::validatePayload('currency', ['currency' => 'pen', 'amount' => 5]);
    }

    public function test_force_시드는_어드민이_끈_상품의_enabled_를_되살리지_않는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        DB::table('exchange_products')->where('code', 'px_helm_a')->update(['enabled' => 0, 'price_gold' => 999]);
        $this->artisan('game:seed', ['--force' => true])->assertSuccessful();
        $row = DB::table('exchange_products')->where('code', 'px_helm_a')->first();
        $this->assertSame(0, (int) $row->enabled);
        $file = collect(json_decode(file_get_contents(database_path('data/exchange_products.json')), true)['items'] ?? [])->firstWhere('code', 'px_helm_a');
        $this->assertSame((int) $file['price_gold'], (int) $row->price_gold);   // 가격 등 다른 필드는 파일 값으로 갱신(고정 숫자 대신 파일 값 비교)
    }
}
