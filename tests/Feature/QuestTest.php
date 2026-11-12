<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\QuestService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Tests\TestCase;

class QuestTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'quest'])->assertCreated();

        return [['X-Guest-Token' => $r->json('guest_token')], User::find($r->json('user.id'))];
    }

    private function find(array $list, string $code): array
    {
        return collect($list['main'])->merge($list['daily']['quests'])->merge($list['weekly']['quests'])->firstWhere('code', $code);
    }

    public function test_진행도는_멱등이고_수령은_한_번만_보상한다_게스트는_main만(): void
    {
        [$h, $u] = $this->guest();
        $svc = app(QuestService::class);
        $svc->record($u->id, 'stage_clear', 'battle:1', 1, 'stage_01');
        $svc->record($u->id, 'stage_clear', 'battle:1', 1, 'stage_01');   // 같은 ref 재호출: 증가 없음
        $svc->record($u->id, 'stage_win', 'battle:1');
        $svc->record($u->id, 'stage_win', 'battle:2');
        $list = $this->withHeaders($h)->getJson('/api/quests')->assertOk()->json();
        $this->assertSame(1, $this->find($list, 'main_stage_01')['progress']);
        $this->assertSame(2, $this->find($list, 'daily_stage_win')['progress']);
        $this->assertSame(1, $list['claimable_count']);   // 게스트: 일일 완료분은 수령 불가라 main만 집계
        $this->assertSame('guest_not_allowed', $this->find($list, 'daily_stage_win')['claim_blocked']);

        $gold = fn () => (int) DB::table('wallets')->where(['user_id' => $u->id, 'currency_code' => 'gold'])->value('balance');
        $before = $gold();
        $this->withHeaders($h)->postJson('/api/quests/main_stage_01/claim')->assertOk()->assertJsonPath('claimed', true);
        $this->assertSame($before + 100, $gold());
        $this->withHeaders($h)->postJson('/api/quests/main_stage_01/claim')->assertStatus(409)->assertJsonPath('error.code', 'quest_already_claimed');
        $this->assertSame($before + 100, $gold());   // 중복 수령 없음
        $this->withHeaders($h)->postJson('/api/quests/daily_stage_win/claim')->assertStatus(403)->assertJsonPath('error.code', 'quest_guest_claim');
        $this->withHeaders($h)->postJson('/api/quests/main_stage_02/claim')->assertStatus(422)->assertJsonPath('error.code', 'quest_not_completed');
        $this->withHeaders($h)->postJson('/api/quests/nope/claim')->assertStatus(404);
    }

    public function test_일일은_05시_KST에_리셋되고_테이블이_없어도_500이_아니다(): void
    {
        [$h, $u] = $this->guest();
        $this->travelTo(\Carbon\Carbon::parse('2026-11-02 19:30:00', 'UTC'));   // KST 11-03 04:30 -> 일일 키 11-02
        app(QuestService::class)->record($u->id, 'gacha_pull', 'gacha:9');
        $this->assertSame(1, $this->find($this->withHeaders($h)->getJson('/api/quests')->json(), 'daily_gacha')['progress']);
        $this->travelTo(\Carbon\Carbon::parse('2026-11-02 20:30:00', 'UTC'));   // KST 05:30 -> 새 일일
        $this->assertSame(0, $this->find($this->withHeaders($h)->getJson('/api/quests')->json(), 'daily_gacha')['progress']);
        $this->travelBack();

        Schema::drop('quest_event_log');
        Schema::drop('user_quests');
        app(QuestService::class)->record($u->id, 'stage_win', 'battle:3');   // 예외 없이 무시
        $this->withHeaders($h)->getJson('/api/quests')->assertOk()->assertJsonPath('available', false);
        $this->withHeaders($h)->postJson('/api/quests/main_stage_01/claim')->assertStatus(503);
    }
}
