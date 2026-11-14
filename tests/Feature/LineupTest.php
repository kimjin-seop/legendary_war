<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 편성 라인업: 저장·검증, 출정 시 not_in_lineup / 필수 영웅 면제 / lineup_insufficient. 핵심 동작만. */
class LineupTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();
    }

    private function guest(): array
    {
        $r = $this->postJson('/api/guests', ['nickname' => 'lineup'])->assertCreated();

        return [['X-Guest-Token' => $r->json('guest_token')], (int) $r->json('user.id')];
    }

    private function addHero(int $uid, int $level): int
    {
        $owned = DB::table('user_heroes')->where('user_id', $uid)->pluck('hero_id')->all();
        $hid = DB::table('heroes')->where('campaign_only', 0)->whereNotIn('id', $owned)->orderBy('cost')->value('id');

        return (int) DB::table('user_heroes')->insertGetId(['user_id' => $uid, 'hero_id' => $hid, 'level' => $level, 'exp' => 0, 'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now()]);
    }

    public function test_라인업_자동채움_저장_검증(): void
    {
        [$h, $uid] = $this->guest();
        $mine = DB::table('user_heroes')->where('user_id', $uid)->pluck('id')->map(fn ($v) => (int) $v)->all();
        $extra = array_map(fn ($lv) => $this->addHero($uid, $lv), [5, 3, 1, 1]);   // 총 6명

        $g = $this->withHeaders($h)->getJson('/api/lineup')->assertOk()->assertJsonPath('max', 5)->assertJsonPath('count', 5);
        $this->assertSame(5, $g->json('lineup.0.level'));   // 레벨 상위 우선 자동 채움
        $all = [...$mine, ...$extra];
        $put = fn ($ids) => $this->withHeaders($h)->putJson('/api/lineup', ['hero_ids' => $ids]);
        $put($all)->assertStatus(422)->assertJsonPath('error.code', 'lineup_too_many');
        $put([$mine[0], $mine[0]])->assertStatus(422)->assertJsonPath('error.code', 'duplicate_hero');
        $put([$mine[0], 999999])->assertStatus(422)->assertJsonPath('error.code', 'hero_not_owned');
        $r = $put([$extra[0], $mine[0]])->assertOk()->assertJsonPath('count', 2)->assertJsonPath('lineup.0.user_hero_id', $extra[0]);
        $this->assertEqualsWithDelta((5 + 1) / 2, $r->json('avg_level'), 0.01);
        $this->assertSame(2, DB::table('user_lineups')->where('user_id', $uid)->count());
    }

    public function test_출정_not_in_lineup_필수영웅_면제_lineup_insufficient(): void
    {
        [$h, $uid] = $this->guest();
        $stage = DB::table('stages')->where('code', 'stage_01')->first();   // 슬롯: 고정 주인공 1 + 선택 2
        $out = $this->addHero($uid, 1);   // 라인업 밖(자동 채움 이후 직접 추가)
        $this->withHeaders($h)->getJson('/api/lineup')->assertOk();   // 자동 채움(starter 2명, out 은 5명 미만이라 포함될 수 있어 직접 지정)
        $this->withHeaders($h)->putJson('/api/lineup', ['hero_ids' => DB::table('user_heroes')->where('user_id', $uid)->where('id', '!=', $out)->orderBy('id')->limit(1)->pluck('id')->all()])->assertOk();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$stage->id.'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $d = $b->json('deployment');
        $this->assertTrue($d['lineup_enforced']);
        $this->assertTrue($d['lineup_ready']);
        $this->assertSame([3, 3 * (int) $stage->recommended_level], [$d['recommended_party'], $d['recommended_total']]);   // 슬롯 모드: 고정 1 + 선택 2
        $this->assertFalse(collect($d['candidates'])->firstWhere('user_hero_id', $out)['in_lineup']);
        $slots = collect($d['slots']);
        $fx = $slots->firstWhere('kind', 'fixed');
        $fr = $slots->where('kind', 'free')->values();
        $pro = $fx['user_hero_id'];
        $at = fn ($uh, $s) => ['user_hero_id' => $uh, 'x' => $s['x'], 'y' => $s['y']];
        $put = fn ($pl) => $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $pl]);
        $put([$at($pro, $fx), $at($out, $fr[0])])->assertStatus(422)->assertJsonPath('error.code', 'not_in_lineup')->assertJsonPath('error.user_hero_ids.0', $out);
        $put([$at($pro, $fx)])->assertOk();   // 주인공(고정/필수)은 라인업 밖이어도 면제

        // 풀이 min_party 미달: 보유 영웅이 하나도 없고(주인공 제외 불가 상황 모사) 필수 2명 요구 -> lineup_insufficient 판정
        $user = \App\Models\User::find($uid);
        $lc = app(\App\Services\BattleService::class)->lineupCheck($user, null, ['a' => [], 'b' => []], [], DB::table('user_heroes')->where('id', $out)->get());
        $this->assertFalse($lc['ready']);
        $this->assertSame([2, 0, 'below_min_party'], [$lc['required'], $lc['current'], $lc['reason']]);

        // HTTP 경로: 라인업 영웅이 모두 아군 NPC/없음 -> 풀 비면 lineup_insufficient
        DB::table('stages')->where('id', $stage->id)->update(['forced_heroes' => null, 'rules' => json_encode(['deploy_slots' => null] + (json_decode($stage->rules, true) ?: []), JSON_UNESCAPED_UNICODE)]);
        $r2 = $this->withHeaders($h)->postJson('/api/guests', ['nickname' => 'none'])->assertCreated();
        $h2 = ['X-Guest-Token' => $r2->json('guest_token')];
        DB::table('user_heroes')->where('user_id', $r2->json('user.id'))->delete();
        $b2 = $this->withHeaders($h2)->postJson('/api/stages/'.$stage->id.'/challenge');
        $b2->assertCreated();
        {
            $this->withHeaders($h2)->putJson('/api/battles/'.$b2->json('battle.battle_id').'/deployment', ['placements' => [['user_hero_id' => 1, 'x' => 0, 'y' => 0]]])
                ->assertStatus(422)->assertJsonPath('error.code', 'lineup_insufficient')->assertJsonPath('error.reason', 'lineup_empty');
        }
    }

    public function test_stages_응답에_라인업_사전판정_필드가_포함된다(): void
    {
        [$h] = $this->guest();
        $r = $this->withHeaders($h)->getJson('/api/stages')->assertOk();
        $this->assertSame(5, $r->json('lineup.max'));
        $rows = collect($r->json('stages'));
        $s1 = $rows->firstWhere('code', 'stage_01');   // 슬롯 모드: 고정 1 + 선택 2
        $this->assertSame([true, null, 1, 3, 3 * $s1['recommended_level']], [$s1['lineup_ready'], $s1['lineup_reason'], $s1['min_party'], $s1['recommended_party'], $s1['recommended_total']]);
        foreach ($rows as $s) {   // 모든 스테이지: 필드 존재, total = 권장 레벨 x 권장 인원, 슬롯 없는 스테이지는 캠페인 곡선(2~6)
            $this->assertGreaterThanOrEqual(1, $s['min_party']);
            $this->assertSame($s['recommended_level'] * $s['recommended_party'], $s['recommended_total']);
            $this->assertIsBool($s['lineup_ready']);
            $s['deploy_slot_counts'] === null && $this->assertTrue($s['recommended_party'] >= 2 && $s['recommended_party'] <= 6);
        }
    }
}
