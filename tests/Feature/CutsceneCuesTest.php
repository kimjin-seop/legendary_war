<?php

namespace Tests\Feature;

use App\Game\Cues;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 연출 cue(docs/CUTSCENE_SPEC.md): 이벤트 발생·scripted move·불 소멸, cues 없는 스테이지는 불변 */
class CutsceneCuesTest extends TestCase
{
    use RefreshDatabase;

    private function start(?array $cues, array $extraRules = []): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        config(['game.first_side' => 'a', 'game.rules.alternate_activation' => false]);
        ($cues !== null || $extraRules !== []) && DB::table('stages')->where('code', 'ch1_s1')->update(['rules' => json_encode(($cues !== null ? ['cues' => $cues] : []) + $extraRules)]);
        $guest = $this->postJson('/api/guests', ['nickname' => 'cuetest'])->assertCreated();
        $headers = ['X-Guest-Token' => $guest->json('guest_token')];
        $stage = DB::table('stages')->where('code', 'ch1_s1')->value('id');
        $challenge = $this->withHeaders($headers)->postJson("/api/stages/$stage/challenge")->assertCreated();
        $id = $challenge->json('battle.battle_id');
        $placements = [];
        foreach ($challenge->json('deployment.default_positions') as $hero => $p) {
            $placements[] = ['user_hero_id' => (int) $hero, 'x' => $p['x'], 'y' => $p['y']];
        }
        $this->withHeaders($headers)->putJson("/api/battles/$id/deployment", ['placements' => $placements])->assertOk();
        $confirm = $this->withHeaders($headers)->postJson("/api/battles/$id/confirm")->assertOk();

        return [$headers, $id, $confirm];
    }

    public function test_cues_emit_events_scripted_move_and_fire_expiry_without_touching_other_state(): void
    {
        [$headers, $id, $confirm] = $this->start([
            ['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작'],
            ['on' => ['turn' => 3], 'do' => 'camera', 'tile' => [3, 3], 'ms' => 300],
            ['on' => ['turn' => 3], 'do' => 'fire', 'tiles' => [[3, 3], [99, 99]], 'turns' => 1],
        ]);
        $confirm->assertJsonPath('battle.cues.start.0.do', 'say');
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        // move cue: 적 b1 을 같은 지형의 빈 칸으로(테스트에서 state 에 직접 주입)
        $b1 = $state['units']['b1'];
        $terr = $state['tiles'][$b1['y']][$b1['x']];
        $free = null;
        foreach ($state['tiles'] as $y => $row) {
            foreach ($row as $x => $t) {
                if ($free === null && $t === $terr && ! array_filter($state['units'], fn ($u) => $u['x'] === $x && $u['y'] === $y)) {
                    $free = [$x, $y];
                }
            }
        }
        $this->assertNotNull($free);
        $state['cues'][] = ['id' => 'c9', 'turn' => 3, 'do' => 'move', 'unit' => 'b1', 'to' => $free];
        $state['turn'] = 2;
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state), 'turn' => 2]);

        $res = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $cueEvents = array_values(array_filter($res->json('events'), fn ($e) => $e['type'] === 'cue'));
        $this->assertSame(['camera', 'fire'], array_column($cueEvents, 'do'));
        $this->assertSame([[3, 3]], $cueEvents[1]['tiles']);   // 맵 밖 칸 제거
        $move = array_values(array_filter($res->json('events'), fn ($e) => $e['type'] === 'move' && ($e['scripted'] ?? false)));
        $this->assertCount(1, $move);
        $this->assertSame($free, $move[0]['to']);
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame($free, [$after['units']['b1']['x'], $after['units']['b1']['y']]);
        $this->assertFalse($after['units']['b1']['moved'] ?? false);   // 이동 후처리/moved 미발동

        // 불은 until_turn(4)까지 유지
        $this->assertSame(4, Cues::view($after)['fires'][0]['until_turn']);
        $this->assertCount(1, Cues::view($after)['fires']);
    }

    public function test_stage_without_cues_is_unchanged(): void
    {
        [$headers, $id, $confirm] = $this->start(null);
        $confirm->assertJsonPath('battle.cues', ['start' => [], 'fires' => []]);
        $res = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $this->assertSame([], array_values(array_filter($res->json('events'), fn ($e) => $e['type'] === 'cue')));
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertArrayNotHasKey('cues', $state);
    }

    public function test_spawn_cue는_battle_start에_아군_NPC_영웅을_ready_false로_난입시키고_다음_턴에_AI가_움직인다(): void
    {
        [$headers, $id, $confirm] = $this->start([
            ['on' => ['battle_start' => true], 'do' => 'spawn', 'side' => 'a', 'hero' => 'gwak_jae_u', 'tile' => [3, 3], 'tag' => 'guest', 'ready' => false],
        ]);
        $ev = collect($confirm->json('battle.cues.start'))->firstWhere('type', 'reinforce');
        $this->assertSame(['gwak_jae_u', 'guest', false], [$ev['hero'], $ev['tag'], $ev['ready']]);
        $u = collect($confirm->json('battle.units'))->firstWhere('id', 'n0');
        $this->assertSame(['a', true, true, 'guest'], [$u['side'], $u['npc_ally'], $u['acted'], $u['tag']]);   // 생성 턴에는 행동 불가
        $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'wait', 'unit_id' => 'n0'])->assertStatus(403);   // 조종 불가
        $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $this->assertTrue(DB::table('battle_actions')->where('battle_id', $id)->where('side', 'a')->where('actor', 'bot')->exists());   // 다음 아군 턴 시작에 AI 행동
    }

    public function test_move_cue로_옮긴_아군_NPC는_같은_턴_AI가_되돌리지_않고_그_칸에_머문다(): void
    {
        [$headers, $id] = $this->start([
            ['on' => ['battle_start' => true], 'do' => 'spawn', 'side' => 'a', 'hero' => 'gwak_jae_u', 'tile' => [3, 3], 'ready' => true],
        ]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $n = $state['units']['n0'];
        $to = null;
        foreach ($state['tiles'] as $y => $row) {
            foreach ($row as $x => $t) {
                if ($to === null && $t === $state['tiles'][$n['y']][$n['x']] && abs($x - $n['x']) + abs($y - $n['y']) >= 2 && ! array_filter($state['units'], fn ($u) => $u['x'] === $x && $u['y'] === $y)) {
                    $to = [$x, $y];
                }
            }
        }
        $this->assertNotNull($to);
        $state['cues'][] = ['id' => 'cm', 'turn' => 2, 'do' => 'move', 'unit' => 'n0', 'to' => $to];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame($to, [$after['units']['n0']['x'], $after['units']['n0']['y']]);
    }

    public function test_terrain_change_cue는_빈_칸만_바꾸고_점유_칸은_건너뛰며_tile_patch에_누적한다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $b1 = $state['units']['a0'];   // 플레이어 유닛은 턴 사이에 움직이지 않음
        $free = null;
        foreach ($state['tiles'] as $y => $row) {
            foreach ($row as $x => $t) {
                if ($free === null && $t !== 'plain' && ! array_filter($state['units'], fn ($u) => $u['x'] === $x && $u['y'] === $y)) {
                    $free = [$x, $y];
                }
            }
        }
        $this->assertNotNull($free);
        $state['cues'][] = ['id' => 'ct', 'turn' => 2, 'do' => 'terrain_change', 'tiles' => [$free, [$b1['x'], $b1['y']]], 'to' => 'plain'];
        $bad = ['id' => 'cb', 'turn' => 2, 'do' => 'terrain_change', 'tiles' => [$free], 'to' => 'no_such_terrain'];
        $state['cues'][] = $bad;
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $ev = collect($r->json('events'))->firstWhere('cue_id', 'ct');
        $this->assertSame([$free[0], $free[1], 'plain'], [$ev['changed'][0]['x'], $ev['changed'][0]['y'], $ev['changed'][0]['to']]);
        $this->assertSame([[$b1['x'], $b1['y']]], $ev['skipped']);   // 점유 칸은 건너뜀
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame('plain', $after['tiles'][$free[1]][$free[0]]);
        $this->assertSame($state['tiles'][$b1['y']][$b1['x']], $after['tiles'][$b1['y']][$b1['x']]);
        $this->assertCount(1, $after['tile_patch']);   // 미정의 지형 cue 는 변경 없음
        $this->assertSame($after['tile_patch'], $r->json('battle.cues.tile_patch'));
    }

    public function test_retreat_cue는_유닛을_사망_없이_제거하고_retreated에_기록하며_지휘관은_퇴각하지_않는다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['cues'][] = ['id' => 'cr1', 'turn' => 2, 'do' => 'retreat', 'unit' => 'b1'];
        $state['cues'][] = ['id' => 'cr2', 'turn' => 2, 'do' => 'retreat', 'unit' => 'b0'];   // 지휘관: 건너뜀
        $state['cues'][] = ['id' => 'cr3', 'turn' => 2, 'when' => ['type' => 'retreated', 'unit' => 'b1'], 'do' => 'set_flag', 'key' => 'b1_left', 'value' => true];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $ev = collect($r->json('events'))->where('type', 'unit_removed');
        $this->assertCount(1, $ev);
        $this->assertSame(['retreat', 'b1'], [$ev->first()['reason'], $ev->first()['actor_unit_id']]);
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertArrayNotHasKey('b1', $after['units']);
        $this->assertArrayHasKey('b0', $after['units']);
        $this->assertSame('b', $after['retreated']['b1']['side']);
        $this->assertArrayNotHasKey('b1', $after['defeated'] ?? []);   // 격파 기록 없음
        $this->assertTrue($after['flags']['b1_left']);                  // retreated 조건 동작
        $this->assertSame('in_progress', DB::table('battles')->where('id', $id)->value('status'));
    }

    public function test_sub_objectives는_보유_턴과_호위_생존을_판정하고_별점_조건으로_연동된다(): void
    {
        [$headers, $id, $confirm] = $this->start(null, ['sub_objectives' => [
            ['id' => 'hold', 'type' => 'hold_zone', 'tiles' => [[0, 0]], 'turns' => 2, 'label' => '거점 보유'],
            ['id' => 'guard', 'type' => 'unit_survive', 'unit' => 'a1', 'label' => '호위'],
            ['id' => 'bad', 'type' => 'unknown'],
        ]]);
        $confirm->assertJsonCount(2, 'battle.sub_objectives');   // 잘못된 항목은 버림
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $svc = app(\App\Services\BattleService::class);
        // hold: 아군 a0 를 (0,0) 으로 옮겨 2라운드 연속 보유를 만든다
        $state['units']['a0']['x'] = 0;
        $state['units']['a0']['y'] = 0;
        $state['turn'] = 2;
        \App\Game\SubObjectives::tick($state);
        $state['turn'] = 3;
        \App\Game\SubObjectives::tick($state);
        $this->assertSame(['met', 2], [$state['sub_objectives']['hold']['status'], $state['sub_objectives']['hold']['progress']]);
        $this->assertTrue(\App\Game\SubObjectives::met($state, 'guard'));    // 생존 중
        $state['defeated']['a1'] = ['side' => 'a', 'kind' => 'hero', 'hero' => null];   // 호위 대상 격파
        \App\Game\SubObjectives::tick($state);
        $this->assertSame('failed', $state['sub_objectives']['guard']['status']);
        $battle = \App\Models\Battle::findOrFail($id);
        $battle->state = $state;
        $r = new \ReflectionMethod($svc, 'starsFromConditions');
        $r->setAccessible(true);
        [, $detail] = $r->invoke($svc, $battle, [['type' => 'sub_objective', 'id' => 'hold'], ['type' => 'sub_objective', 'id' => 'guard']]);
        $this->assertSame([true, false], [$detail[0]['met'], $detail[1]['met']]);
    }

    public function test_격파_퇴각한_영웅_화자의_say는_건너뛰고_전장에_없던_화자는_말한다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'sfx', 'key' => 'x']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['defeated']['n7'] = ['side' => 'a', 'kind' => 'hero', 'hero' => 'zz_dead'];
        $state['retreated']['n8'] = ['side' => 'a', 'kind' => 'hero', 'hero' => 'zz_left', 'turn' => 1];
        foreach (['hero:zz_dead', 'hero:zz_left', 'hero:zz_never'] as $i => $sp) {
            $state['cues'][] = ['id' => 'cs'.$i, 'turn' => 2, 'do' => 'say', 'speaker' => $sp, 'expr' => null, 'text' => '대사'];
        }
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $said = collect($r->json('events'))->where('type', 'cue')->where('do', 'say')->pluck('speaker')->values()->all();
        $this->assertSame(['hero:zz_never'], $said);
    }

    public function test_spawn_cue는_조건이_맞는_첫_시점에_적_증원을_만들고_칸이_없으면_조용히_건너뛴다(): void
    {
        [$headers, $id] = $this->start([
            ['on' => ['turn' => 2, 'when' => ['type' => 'alive_count', 'side' => 'b', 'op' => 'gte', 'value' => 1]], 'do' => 'spawn', 'side' => 'b', 'unit_type' => 'ARCHER_PLACEHOLDER', 'tile' => [10, 3], 'tag' => 'ambush', 'ready' => true],
            ['on' => ['battle_start' => true], 'do' => 'spawn', 'side' => 'b', 'unit_type' => 'no_such_type', 'tile' => [10, 3]],
        ]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $type = $state['units']['b1']['type'];
        $state['cues'][0]['unit_type'] = $type;
        $state['turn'] = 1;
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $before = count($state['units']);
        $res = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame($before + 1, count($after['units']));   // 알 수 없는 병종은 건너뜀, 조건 충족 cue 는 1기 생성
        $new = collect($after['units'])->firstWhere('tag', 'ambush');
        $this->assertSame(['b', $type], [$new['side'], $new['type']]);
        $this->assertNotEmpty(array_filter($res->json('events'), fn ($e) => $e['type'] === 'reinforce' && ($e['tag'] ?? null) === 'ambush'));
    }

    public function test_defect_cue는_적_유닛을_아군_NPC로_전환하고_death_퇴장은_defeated에_기록한다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['cues'][] = ['id' => 'cd1', 'turn' => 2, 'do' => 'defect', 'unit' => 'b1', 'to' => 'a'];
        $state['cues'][] = ['id' => 'cd2', 'turn' => 2, 'do' => 'defect', 'unit' => 'b0', 'to' => 'a'];   // 지휘관: 건너뜀
        $state['cues'][] = ['id' => 'cd3', 'turn' => 2, 'do' => 'retreat', 'reason' => 'death', 'unit' => 'b2'];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame(['a', true], [$after['units']['b1']['side'], $after['units']['b1']['npc_ally']]);
        $this->assertSame('b', $after['units']['b0']['side']);
        $this->assertArrayNotHasKey('b2', $after['units']);
        $this->assertArrayHasKey('b2', $after['defeated']);   // 연출용 사망은 격파 조건에 잡힌다
        $this->assertNotEmpty(array_filter($r->json('events'), fn ($e) => $e['type'] === 'unit_defected' && $e['actor_unit_id'] === 'b1' && $e['to'] === 'a'));
        $this->assertNotEmpty(array_filter($r->json('events'), fn ($e) => $e['type'] === 'unit_removed' && ($e['reason'] ?? null) === 'death'));
    }

    public function test_must_survive_유닛은_death_퇴장이면_패배하고_defect_대상에서_제외된다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $aid = collect($state['units'])->filter(fn ($u, $k) => $u['side'] === 'a' && $u['kind'] !== 'commander' && empty($u['protagonist']))->keys()->first();
        $state['units'][$aid]['must_survive'] = true;
        $state['units']['b1']['must_survive'] = true;
        $state['cues'][] = ['id' => 'cm1', 'turn' => 1, 'do' => 'defect', 'unit' => 'b1', 'to' => 'a'];   // must_survive: 전환 불가
        $state['cues'][] = ['id' => 'cm2', 'turn' => 1, 'do' => 'retreat', 'reason' => 'death', 'unit' => $aid];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $after = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame('b', $after['units']['b1']['side']);
        $this->assertSame('b', $after['winner'] ?? DB::table('battles')->where('id', $id)->value('winner'));
    }

    public function test_신호_타일에_아군이_도달하면_증원이_난입한다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $a = $state['units']['a0'];
        $type = $state['units']['b1']['type'];
        $free = null;
        foreach ($state['tiles'] as $y => $row) {
            foreach ($row as $x => $t) {
                if ($free === null && ! collect($state['units'])->contains(fn ($u) => $u['x'] === $x && $u['y'] === $y) && $t === $state['tiles'][$state['units']['b1']['y']][$state['units']['b1']['x']]) {
                    $free = [$x, $y];
                }
            }
        }
        $when = ['type' => 'in_zone', 'side' => 'a', 'rect' => [$a['x'], $a['y'], $a['x'], $a['y']]];   // 신호 타일 = 아군 지휘관이 서 있는 칸
        $state['cues'][] = ['id' => 'cs1', 'turn' => 1, 'when' => $when, 'do' => 'spawn', 'side' => 'a', 'hero' => null, 'unit_type' => $type, 'cells' => [$free], 'level' => null, 'ready' => true, 'tag' => 'signal_aid', 'npc_ally' => true, 'must_survive' => false];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $this->assertNotEmpty(array_filter($r->json('events'), fn ($e) => $e['type'] === 'reinforce' && ($e['tag'] ?? null) === 'signal_aid'));
    }

    public function test_set_flag_뒤에_정의된_flag_조건_spawn은_같은_패스에서_count만큼_생성된다(): void
    {
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $type = $state['units']['b1']['type'];
        $free = [];
        foreach ($state['tiles'] as $y => $row) {
            foreach ($row as $x => $t) {
                count($free) < 6 && ! collect($state['units'])->contains(fn ($u) => $u['x'] === $x && $u['y'] === $y) && $t === $state['tiles'][$state['units']['b1']['y']][$state['units']['b1']['x']] && $free[] = [$x, $y];
            }
        }
        $cues = \App\Game\Cues::normalize([
            ['on' => ['turn' => 1], 'do' => 'set_flag', 'key' => 'gate_open'],
            ['on' => ['turn' => 1, 'when' => ['type' => 'flag', 'key' => 'gate_open']], 'do' => 'spawn', 'side' => 'a', 'unit_type' => $type, 'tiles' => $free, 'count' => 2, 'ready' => true, 'tag' => 'cnt_aid'],
            ['on' => ['turn' => 1], 'do' => 'spawn', 'side' => 'a', 'hero' => 'guan_yu', 'tile' => $free[0], 'count' => 2],   // 영웅은 count>1 이면 무효
        ]);
        $this->assertCount(2, $cues);
        $state['cues'] = $cues;
        $state['cue_done'] = [];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $ids = collect($r->json('events'))->where('type', 'reinforce')->where('tag', 'cnt_aid')->pluck('unit_ids')->flatten();
        $this->assertCount(2, $ids);
    }

    public function test_terrain_change_tile_필드는_형식이_맞을_때만_changed와_tile_patch에_실린다(): void
    {
        $ok = \App\Game\Cues::normalize([['on' => ['turn' => 2], 'do' => 'terrain_change', 'tiles' => [[1, 1]], 'to' => 'wall', 'tile' => 1700]]);
        $name = \App\Game\Cues::normalize([['on' => ['turn' => 2], 'do' => 'terrain_change', 'tiles' => [[1, 1]], 'to' => 'wall', 'tile' => 'bookshelf_a']]);
        $bad = \App\Game\Cues::normalize([['on' => ['turn' => 2], 'do' => 'terrain_change', 'tiles' => [[1, 1]], 'to' => 'wall', 'tile' => 'Bad Name!']]);
        $upper = \App\Game\Cues::normalize([['on' => ['turn' => 2], 'do' => 'terrain_change', 'tiles' => [[1, 1]], 'to' => 'wall', 'tile' => 'int_wallface_bot_C2']]);
        $this->assertSame('int_wallface_bot_C2', $upper[0]['tile']);   // 대문자 tv2 이름 통과
        $this->assertSame([1700, 'bookshelf_a'], [$ok[0]['tile'], $name[0]['tile']]);
        $this->assertArrayNotHasKey('tile', $bad[0]);   // 불량 값은 무시(cue 는 유지)
        [$headers, $id] = $this->start([['on' => ['battle_start' => true], 'do' => 'say', 'text' => '시작']]);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $free = null;
        foreach ($state['tiles'] as $y => $row) {
            foreach ($row as $x => $t) {
                if ($free === null && ! array_filter($state['units'], fn ($u) => $u['x'] === $x && $u['y'] === $y)) {
                    $free = [$x, $y];
                }
            }
        }
        $state['cues'][] = ['id' => 'ct', 'turn' => 2, 'do' => 'terrain_change', 'tiles' => [$free], 'to' => 'plain', 'tile' => 1700];
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($state)]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $ev = collect($r->json('events'))->firstWhere('cue_id', 'ct');
        $this->assertSame(1700, $ev['changed'][0]['tile']);
        $this->assertSame(1700, $r->json('battle.cues.tile_patch')[0]['tile']);
    }

    public function test_squads_hold_until_turn은_해당_라운드_전까지_적_부대를_제자리_대기시킨다(): void
    {
        [, $id] = $this->start(null);
        $data = app(\App\Services\GameData::class);
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['units'] = array_filter($state['units'], fn ($u) => $u['side'] === 'a');
        $zone = [[14, 3], [15, 3], [14, 4], [15, 4], [16, 3], [16, 4]];
        $squad = ['commander' => ['unit_type' => 'sword', 'display_name_ko' => '지휘'], 'units' => [], 'squads' => [
            ['commander' => ['unit_type' => 'sword', 'display_name_ko' => '감실'], 'units' => ['sword'], 'hold_until_turn' => 5],
        ]];
        \App\Game\ArmyBuilder::addGenericSide($data->engine(), $state, 'b', $squad, 1, [[14, 3]], $zone, 3.0);
        $held = array_keys(array_filter($state['units'], fn ($u) => ($u['hold_until_turn'] ?? null) === 5));
        $this->assertCount(2, $held);   // 부대 지휘관 + 소속 병사
        $this->assertArrayNotHasKey('hold_until_turn', $state['units']['b0']);
        $bot = new \App\Game\HeuristicBot($data->engine());
        $state['side'] = 'b';
        $state['turn'] = 2;
        $acts = fn ($st) => array_filter($bot->plan($st, 'b')['actions'], fn ($a) => isset($a['unit_id']) && in_array($a['unit_id'], $held, true));
        $this->assertSame([], $acts($state));   // 대기 중 해당 부대 행동 0
        $state['turn'] = 5;
        $this->assertNotEmpty($acts($state));   // 라운드 도달 후 행동
    }

    public function test_fe40_stages_sub_objectives_노출과_병사_표시명과_패배시_pending_미확정과_주인공_이름(): void
    {
        [$headers, $id, $confirm] = $this->start(null, ['sub_objectives' => [['id' => 'desk', 'type' => 'protect_tiles', 'tiles' => [[0, 0]], 'max_breach' => 0, 'label' => '책상 보호']]]);
        // ① /api/stages 에 sub_objectives [{id,label,type}] 추가(기존 키 불변)
        $s = collect($this->withHeaders($headers)->getJson('/api/stages')->assertOk()->json('stages'))->firstWhere('code', 'ch1_s1');
        $this->assertSame([['id' => 'desk', 'label' => '책상 보호', 'type' => 'protect_tiles']], $s['sub_objectives']);
        // ③ 주인공 유닛 표시명 = 소유자 이름('cuetest')
        $svc = app(\App\Services\BattleService::class);
        $rp = new \ReflectionMethod($svc, 'withPortraits');
        $rp->setAccessible(true);
        $pu = $rp->invoke($svc, \App\Models\Battle::findOrFail($id), [['hero' => 'protagonist_a', 'side' => 'a', 'name' => '원형']])[0];
        $this->assertSame(['cuetest', 'cuetest'], [$pu['name'], $pu['display_name']]);
        // ④ 패배로 끝난 전투에서 pending 서브 목표는 met 이 아니다
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['status'] = 'finished';
        $state['winner'] = 'b';
        $this->assertSame('failed', \App\Game\SubObjectives::view($state)[0]['status']);
        $state['winner'] = 'a';
        $this->assertSame('met', \App\Game\SubObjectives::view($state)[0]['status']);
        // ② 병사 표시명
        $st = ['units' => [], 'width' => 20, 'height' => 14, 'tiles' => array_fill(0, 14, str_repeat('p', 20))] + $state;
        $st['units'] = array_filter($state['units'], fn ($u) => $u['side'] === 'a');
        \App\Game\ArmyBuilder::addGenericSide(app(\App\Services\GameData::class)->engine(), $st, 'b', ['commander' => ['unit_type' => 'sword', 'display_name_ko' => '지휘'], 'units' => ['sword'], 'soldier_display_name_ko' => '공백병'], 1, [[14, 3]], [[14, 4], [15, 4]], 3.0);
        $this->assertSame('공백병', $st['units']['b1']['name']);
    }

    public function test_camera_cue는_unit만으로도_통과하고_발동시_unit_id와_follow를_싣는다(): void
    {
        $n = \App\Game\Cues::normalize([
            ['on' => ['turn' => 2], 'do' => 'camera', 'mode' => 'focus', 'unit' => 'hero:npc_sagong', 'follow' => true],
            ['on' => ['turn' => 2], 'do' => 'camera', 'mode' => 'focus'],   // tile 도 unit 도 없으면 무효
        ]);
        $this->assertCount(1, $n);
        $this->assertSame(['hero:npc_sagong', true], [$n[0]['unit'], $n[0]['follow']]);
        [$headers, $id] = $this->start([['on' => ['turn' => 2], 'do' => 'camera', 'mode' => 'focus', 'unit' => 'b0', 'follow' => true, 'tile' => [1, 1]]]);
        $r = $this->withHeaders($headers)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $ev = collect($r->json('events'))->where('type', 'cue')->where('do', 'camera')->first();
        $this->assertSame(['b0', true], [$ev['unit_id'] ?? null, $ev['follow'] ?? null]);
    }

    public function test_rules_protagonist_troop은_주인공_출전_병종을_덮어쓴다(): void
    {
        $this->start(null, ['protagonist_troop' => 'naval']);   // sanitizeStageRules 가 알 수 없는 키로 막지 않는다(challenge 성공)
        $user = \App\Models\User::where('name', 'like', 'cuetest%')->firstOrFail();
        app(\App\Services\ProtagonistService::class)->ensureDefault($user);
        DB::table('stages')->where('code', 'ch1_s1')->update(['forced_heroes' => json_encode(['@protagonist'])]);
        $stage = DB::table('stages')->where('code', 'ch1_s1')->first();
        $forced = app(\App\Services\BattleService::class)->forcedOf($stage, $user);
        $o = array_values($forced)[0];
        $this->assertSame(['naval', 'naval', true], [$o['unit_type'], $o['troop_type'], $o['protagonist']]);
        $hero = app(\App\Services\BattleService::class)->applyForced(['code' => array_key_first($forced), 'unit_type' => 'sword', 'troop_type' => 'sword'], $forced);
        $this->assertSame('naval', $hero['unit_type']);
    }

    public function test_UNIT_자리표시는_그_칸에서_시작한_적_유닛_id로_치환된다(): void
    {
        $state = ['units' => [
            'a0' => ['side' => 'a', 'x' => 5, 'y' => 2], 'b0' => ['side' => 'b', 'x' => 12, 'y' => 2],
            'b1' => ['side' => 'b', 'x' => 5, 'y' => 2], 'b2' => ['side' => 'b', 'x' => 6, 'y' => 3],
        ], 'cues' => [
            ['id' => 'c0', 'turn' => 3, 'do' => 'move', 'unit' => 'UNIT@5,2', 'to' => [8, 3]],
            ['id' => 'c1', 'turn' => 5, 'do' => 'move', 'unit' => 'UNIT@5,3', 'to' => [4, 4]],   // 정확히 일치하는 유닛이 없으면 가장 가까운 미사용 적(b2)
            ['id' => 'c2', 'turn' => 5, 'do' => 'retreat', 'unit' => 'b0'],
        ]];
        \App\Game\Cues::bindUnitPlaceholders($state);
        $this->assertSame(['b1', 'b2', 'b0'], array_column($state['cues'], 'unit'));
    }

    public function test_UNIT_자리표시_폴백은_지휘관을_고르지_않는다(): void
    {
        $state = ['units' => [
            'b0' => ['side' => 'b', 'kind' => 'commander', 'x' => 5, 'y' => 3], 'b1' => ['side' => 'b', 'kind' => 'troop', 'x' => 9, 'y' => 9],
        ], 'cues' => [['id' => 'c0', 'turn' => 3, 'do' => 'move', 'unit' => 'UNIT@5,2', 'to' => [8, 3]]]];   // (5,2) 정확 일치 없음, 지휘관이 더 가까움
        \App\Game\Cues::bindUnitPlaceholders($state);
        $this->assertSame('b1', $state['cues'][0]['unit']);
    }

    public function test_protect_tiles는_적이_칸에_서면_침범을_세고_한도를_넘으면_실패한다(): void
    {
        [, $id, $confirm] = $this->start(null, ['sub_objectives' => [
            ['id' => 'desk', 'type' => 'protect_tiles', 'tiles' => [[0, 0], [1, 0]], 'max_breach' => 1, 'label' => '책상 보호'],
        ]]);
        $confirm->assertJsonCount(1, 'battle.sub_objectives');
        $state = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $state['units']['b0']['x'] = 0;
        $state['units']['b0']['y'] = 0;
        \App\Game\SubObjectives::tick($state);
        $this->assertSame(['pending', 1], [$state['sub_objectives']['desk']['status'], $state['sub_objectives']['desk']['progress']]);
        \App\Game\SubObjectives::tick($state);   // 같은 칸 체류는 다시 세지 않는다
        $this->assertSame(1, $state['sub_objectives']['desk']['progress']);
        $state['units']['b0']['x'] = 1;
        \App\Game\SubObjectives::tick($state);
        $this->assertSame('failed', $state['sub_objectives']['desk']['status']);
        $this->assertFalse(\App\Game\SubObjectives::met($state, 'desk'));
    }
}
