<?php

namespace Tests\Feature;

use App\Game\Engine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class StageRulesOverrideTest extends TestCase
{
    use RefreshDatabase;

    public function test_스테이지_rules는_해당_스테이지_전투_state에만_적용되고_없으면_기존_동작(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'srules'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $ids = DB::table('stages')->pluck('id', 'code');
        foreach ($ids as $id) {
            DB::table('user_stage_progress')->insert(['user_id' => $r->json('user.id'), 'stage_id' => $id, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        $mapRulesBefore = DB::table('maps')->pluck('rules', 'code')->all();
        DB::table('stages')->where('code', 'stage_06')->update(['rules' => json_encode(['dmg_mult' => 1.8, 'max_turns' => 20])]);
        $state = fn (string $c) => json_decode(DB::table('battles')->where('id', $this->withHeaders($h)->postJson('/api/stages/'.$ids[$c].'/challenge')->assertCreated()->json('battle.battle_id'))->value('state'), true);

        $s6 = $state('stage_06');
        $this->assertSame(1.8, (float) $s6['rules']['dmg_mult']);
        $this->assertSame(20, $s6['max_turns']);
        $s5 = $state('stage_05');
        $this->assertSame(30, $s5['max_turns']);
        $this->assertArrayNotHasKey('dmg_mult', $s5['rules'] ?? []);                 // 다른 스테이지(맵 공유 포함) 불변
        $this->assertSame($mapRulesBefore, DB::table('maps')->pluck('rules', 'code')->all());   // 맵 행 불변

        foreach ([['dmg_mult' => 3], ['max_turns' => 1], ['avoid_threat' => 1]] as $bad) {
            try {
                Engine::sanitizeStageRules($bad);
                $this->fail('rejected: '.json_encode($bad));
            } catch (\InvalidArgumentException) {
                $this->addToAssertionCount(1);
            }
        }
    }

    public function test_스테이지_목록에_stage_rules가_내려가고_조건_없으면_null(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $h = ['X-Guest-Token' => $this->postJson('/api/guests', ['nickname' => 'lobbyrules'])->assertCreated()->json('guest_token')];
        $rules = ['win_mode' => 'all', 'win_conditions' => [['label' => '보급 확보', 'when' => ['type' => 'turn_gte', 'value' => 3]]], 'lose_conditions' => [['label' => '수레 파괴', 'when' => ['type' => 'turn_gte', 'value' => 9]]]];
        DB::table('stages')->where('code', 'stage_06')->update(['rules' => json_encode($rules)]);
        $list = collect($this->withHeaders($h)->getJson('/api/stages')->assertOk()->json('stages'));
        $this->assertNull($list->firstWhere('code', 'stage_05')['stage_rules']);
        $sr = $list->firstWhere('code', 'stage_06')['stage_rules'];
        $this->assertSame(['mode' => 'all', 'conditions' => [['label' => '보급 확보']], 'lose' => ['수레 파괴']], $sr);
    }
}
