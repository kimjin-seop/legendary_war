<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** use_skill을 HTTP 레벨(컨트롤러 검증 -> 서비스 -> 엔진)로 검증: 스테이지 전투와 솔로 방. */
class ActiveSkillApiTest extends TestCase
{
    use RefreshDatabase;

    private function guest(): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        config(['game.rules.alternate_activation' => false, 'game.rules.mp_skills' => false]);   // 턴제 흐름(교대 행동 경로는 엔진 단위 테스트가 커버)
        $r = $this->postJson('/api/guests', ['nickname' => 'skillapi'])->assertCreated();

        return ['X-Guest-Token' => $r->json('guest_token')];
    }

    /** 전투 state를 직접 손봐 a0에게 액티브를 주고 적 지휘관 b0를 인접 칸에 둔다(DB 직접, 테스트 전용). */
    private function arm(int $battleId): void
    {
        $b = DB::table('battles')->where('id', $battleId)->first();
        $s = json_decode($b->state, true);
        $s['units']['a0']['actives'] = [['code' => 'test_strike', 'name' => '테스트 강타', 'template' => 'T_ACTIVE_STRIKE', 'power_pct' => 150, 'cooldown' => 2, 'uses' => 2]];
        $s['units']['a0']['skill_state'] = ['test_strike' => ['cd' => 0, 'uses_left' => 2]];
        $tx = $s['units']['a0']['x'] + max(1, (int) app(\App\Services\GameData::class)->rules()->unitType($s['units']['a0']['type'])['range_min']);   // 시작 영웅 병종(궁병 등)의 최소 사거리 반영
        $ty = $s['units']['a0']['y'];
        foreach ($s['units'] as $id => $u) {
            if ($id !== 'b0' && $u['x'] === $tx && $u['y'] === $ty) {
                unset($s['units'][$id]);
            }
        }
        $s['units']['b0']['x'] = $tx;
        $s['units']['b0']['y'] = $ty;
        $s['units']['b0']['hp'] = $s['units']['b0']['max_hp'] = 999;
        $s['side'] = 'a';
        DB::table('battles')->where('id', $battleId)->update(['state' => json_encode($s)]);
    }

    private function assertSkillFlow(array $events, array $act, callable $post, callable $unitView): void
    {
        $post(['type' => 'use_skill', 'unit_id' => 'a0', 'target_id' => 'b0'])->assertStatus(422);   // skill 누락(검증)
        $post($act + ['skill' => 'nope'])->assertStatus(404)->assertJsonPath('error.code', 'skill_not_found');
        $res = $post($act + ['skill' => 'test_strike'])->assertOk();
        $this->assertContains('skill_use', array_column($res->json('events'), 'type'));
        $this->assertContains('attack', array_column($res->json('events'), 'type'));
        $v = $unitView();
        $this->assertSame(2, $v['cooldown_left']);   // 쿨다운 차감
        $this->assertSame(1, $v['uses_left']);       // 횟수 차감
    }

    public function test_스테이지_전투_use_skill_API(): void
    {
        $h = $this->guest();
        $ch = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated();
        $id = $ch->json('battle.battle_id');
        $pos = (array) $ch->json('deployment.default_positions');
        $placements = [];
        foreach ($pos as $uh => $p) {
            $placements[] = ['user_hero_id' => (int) $uh, 'x' => $p['x'], 'y' => $p['y']];
        }
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
        $this->arm($id);
        $this->assertSkillFlow([], ['type' => 'use_skill', 'unit_id' => 'a0', 'target_id' => 'b0'],
            fn (array $a) => $this->withHeaders($h)->postJson("/api/battles/$id/actions", $a),
            fn () => collect($this->withHeaders($h)->getJson("/api/battles/$id")->json('battle.units'))->firstWhere('id', 'a0')['active_skills'][0]);
    }

    public function test_솔로_방_use_skill_API(): void
    {
        $h = $this->guest();
        $code = $this->withHeaders($h)->postJson('/api/rooms', ['mode' => 'solo'])->assertCreated()->json('room.code');
        $this->withHeaders($h)->postJson("/api/rooms/$code/start")->assertOk();
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $placements = [];
        foreach ($this->zoneCoords('a') as $i => [$x, $y]) {
            $placements[] = ['user_hero_id' => $party[$i], 'x' => $x, 'y' => $y];
        }
        $this->withHeaders($h)->putJson("/api/rooms/$code/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($h)->postJson("/api/rooms/$code/confirm")->assertOk();
        $bid = (int) DB::table('battles')->where('room_id', DB::table('rooms')->where('code', $code)->value('id'))->value('id');
        $this->arm($bid);
        $this->assertSkillFlow([], ['type' => 'use_skill', 'unit_id' => 'a0', 'target_id' => 'b0'],
            fn (array $a) => $this->withHeaders($h)->postJson("/api/rooms/$code/actions", $a),
            function () use ($bid) {
                $st = json_decode(DB::table('battles')->where('id', $bid)->value('state'), true)['units']['a0']['skill_state']['test_strike'];

                return ['cooldown_left' => $st['cd'], 'uses_left' => $st['uses_left']];
            });
    }

    public function test_액티브가_없는_영웅도_병종_기본_액티브를_받고_use_skill이_된다(): void
    {
        $h = $this->guest();
        $ch = $this->withHeaders($h)->postJson('/api/stages/1/challenge')->assertCreated();
        $id = $ch->json('battle.battle_id');
        $placements = [];
        foreach ((array) $ch->json('deployment.default_positions') as $uh => $p) {
            $placements[] = ['user_hero_id' => (int) $uh, 'x' => $p['x'], 'y' => $p['y']];
        }
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => $placements])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk();
        // 시작 영웅 전원이 액티브를 가진다(고유 액티브 없으면 default_<병종>)
        $mine = collect($this->withHeaders($h)->getJson("/api/battles/$id")->json('battle.units'))->where('side', 'a')->whereNotNull('hero');
        $this->assertNotEmpty($mine);
        foreach ($mine as $u) {
            $this->assertNotEmpty($u['active_skills'] ?? [], $u['hero'].' 액티브 없음');
        }
        // 기본 액티브를 강제로 단일 영웅 행으로 주입해(고유 스킬 제거) 실제 사용까지 확인
        $row = (new \ReflectionClass(\App\Game\ArmyBuilder::class))->getMethod('withDefaultActives')->invoke(null, ['code' => 'x', 'actives' => []], 'sword', 'a');
        $this->assertSame('default_sword', $row['actives'][0]['code']);
        $this->assertSame([], \App\Game\ArmyBuilder::withDefaultActives(['actives' => []], 'sword', 'b')['actives']);   // 적측은 플래그 off 면 미부여
        $b = DB::table('battles')->where('id', $id)->first();
        $st = json_decode($b->state, true);
        $st['units']['a0']['actives'] = $row['actives'];
        $st['units']['a0']['skill_state'] = ['default_sword' => ['cd' => 0, 'uses_left' => $row['actives'][0]['uses']]];
        $st['units']['a0']['type'] = 'sword';
        $tx = $st['units']['a0']['x'] + 1;
        foreach ($st['units'] as $uid => $u) {
            if ($uid !== 'b0' && $u['x'] === $tx && $u['y'] === $st['units']['a0']['y']) {
                unset($st['units'][$uid]);
            }
        }
        $st['units']['b0']['x'] = $tx;
        $st['units']['b0']['y'] = $st['units']['a0']['y'];
        $st['units']['b0']['hp'] = $st['units']['b0']['max_hp'] = 999;
        $st['side'] = 'a';
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($st)]);
        $res = $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'use_skill', 'unit_id' => 'a0', 'skill' => 'default_sword', 'target_id' => 'b0'])->assertOk();
        $this->assertContains('skill_use', array_column($res->json('events'), 'type'));
    }
}
