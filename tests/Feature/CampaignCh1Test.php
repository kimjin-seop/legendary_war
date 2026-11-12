<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 캠페인 1장(ch1) 핵심: 시드 멱등·기존 불변, 해금 체인/API, 일반 지휘관 적, survive_turns 승리·별·합류 영웅, 퀘스트 정의 */
class CampaignCh1Test extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
    }

    private function legacySnapshot(): array
    {
        return [json_encode(DB::table('stages')->where('code', 'like', 'stage_0%')->orderBy('id')->get()), DB::table('maps')->count(), DB::table('presets')->count()];
    }

    public function test_시드는_멱등이고_기존_스테이지_맵을_바꾸지_않는다(): void
    {
        $before = $this->legacySnapshot();
        $this->artisan('game:seed-ch1', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame(0, DB::table('stages')->where('code', 'like', 'ch1_%')->count());   // dry-run은 쓰기 없음
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $first = DB::table('stages')->where('code', 'like', 'ch1_%')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-ch1', ['--force' => true])->assertSuccessful();
        $second = DB::table('stages')->where('code', 'like', 'ch1_%')->orderBy('id')->get()->map(fn ($r) => (array) $r)->all();
        $this->assertCount(7, $first);
        foreach ($first as $i => $row) {   // updated_at 외 동일
            unset($row['updated_at'], $second[$i]['updated_at']);
            $this->assertSame($row, $second[$i]);
        }
        $this->assertSame($before, $this->legacySnapshot());
        $ids = DB::table('stages')->pluck('id', 'code');
        $this->assertNull(DB::table('stages')->where('code', 'ch1_s1')->value('prerequisite_stage_id'));
        foreach (range(2, 7) as $n) {
            $this->assertSame($ids['ch1_s'.($n - 1)], DB::table('stages')->where('code', 'ch1_s'.$n)->value('prerequisite_stage_id'));
        }
        $this->assertSame([101, 102, 103, 104, 105, 106, 107], DB::table('stages')->where('code', 'like', 'ch1_%')->orderBy('sort_order')->pluck('sort_order')->map(fn ($v) => (int) $v)->all());
    }

    public function test_맵이_없으면_시드가_실패한다(): void
    {
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $doc = json_decode(file_get_contents(database_path('data/stages_ch1_proposal.json')), true);
        $doc['items'][0]['map'] = 'pk_nope';
        $tmp = sys_get_temp_dir().'/ch1_bad_'.uniqid().'.json';
        file_put_contents($tmp, json_encode($doc));
        $this->artisan('game:seed-ch1', ['--path' => $tmp, '--force' => true])->assertFailed();
        unlink($tmp);
    }

    public function test_목록_API와_해금_체인_일반_지휘관_적_survive_전투(): void
    {
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'ch1'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $uid = $r->json('user.id');
        $list = collect($this->withHeaders($h)->getJson('/api/stages')->assertOk()->json('stages'))->keyBy('code');
        $this->assertSame(0, $list['stage_01']['chapter']);
        $this->assertSame(['type' => 'defeat_commander'], $list['stage_01']['objective']);
        $this->assertNull($list['stage_01']['star_conditions']);
        $this->assertSame(1, $list['ch1_s1']['chapter']);
        $this->assertTrue($list['ch1_s1']['unlocked']);
        $this->assertFalse($list['ch1_s2']['unlocked']);
        $this->assertSame('ch1_s1', $list['ch1_s2']['locked_by']['code']);
        $this->assertSame(['type' => 'survive_turns', 'turns' => 8], $list['ch1_s4']['objective']);
        $this->withHeaders($h)->postJson('/api/stages/'.$list['ch1_s2']['id'].'/challenge')->assertStatus(403);

        foreach (['ch1_s1', 'ch1_s2', 'ch1_s3'] as $c) {   // 해금 우회(s4가 첫 클리어가 되도록 s4 이후는 미기록)
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $list[$c]['id'], 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        // s4 survive: view에 objective/남은 턴, state 고정, 배치 확정 후 8라운드 종료 시 승리 + 별 조건 + 합류 영웅
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$list['ch1_s4']['id'].'/challenge')->assertCreated();
        $id = $b->json('battle.battle_id');
        $b->assertJsonPath('battle.objective', ['type' => 'survive_turns', 'turns' => 8])->assertJsonPath('battle.survive_remaining', 8)->assertJsonPath('deployment.objective.turns', 8);
        $pos = $b->json('deployment.default_positions');
        $party = $this->withHeaders($h)->getJson('/api/party')->json('party');
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => [
            ['user_hero_id' => $party[0], 'x' => $pos[$party[0]]['x'], 'y' => $pos[$party[0]]['y']], ['user_hero_id' => $party[1], 'x' => $pos[$party[1]]['x'], 'y' => $pos[$party[1]]['y']],
        ]])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.status', 'in_progress');
        $st = json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
        $this->assertSame(['type' => 'survive_turns', 'turns' => 8], $st['objective']);
        $this->assertGreaterThanOrEqual(13, $st['max_turns']);
        // 라운드 8 시작으로 건너뛰기(적은 초기 위치라 1턴에 지휘관 사망 불가) 후 턴 종료 -> 적 턴 종료 시 승리
        $st['turn'] = 8;
        DB::table('battles')->where('id', $id)->update(['state' => json_encode($st), 'turn' => 8]);
        $res = $this->withHeaders($h)->postJson("/api/battles/$id/actions", ['type' => 'end_turn'])->assertOk();
        $res->assertJsonPath('battle.status', 'finished')->assertJsonPath('battle.winner', 'a')->assertJsonPath('battle.survive_remaining', 0);
        $result = $this->withHeaders($h)->getJson("/api/battles/$id/result")->assertOk()->json('result');
        $this->assertTrue($result['win']);
        $this->assertGreaterThanOrEqual(2, $result['stars']);   // clear + all_alive + commander_hp_pct_min(50) 중 충족 수
        $this->assertSame('clear', $result['star_detail'][0]['type']);
        $this->assertSame([], $result['joined_heroes'] ?? []);   // join_hero 비활성(영웅은 뽑기로만 획득, 2026-11-08)

        // s7: 일반 지휘관 + 부대 8 = 9유닛, 지휘관 hp_mult 1.3 반영, 칸 중복 없음
        $this->withHeaders($h)->postJson('/api/stages/'.$list['ch1_s7']['id'].'/challenge')->assertStatus(403);   // 선행 미클리어
        foreach (['ch1_s5', 'ch1_s6'] as $c) {   // s4는 위 전투 승리로 클리어됨
            DB::table('user_stage_progress')->insert(['user_id' => $uid, 'stage_id' => $list[$c]['id'], 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
        $b7 = $this->withHeaders($h)->postJson('/api/stages/'.$list['ch1_s7']['id'].'/challenge')->assertCreated();
        $enemies = array_values(array_filter($b7->json('battle.units'), fn ($u) => $u['side'] === 'b'));
        $this->assertCount(9, $enemies);
        $this->assertCount(9, array_unique(array_map(fn ($u) => $u['x'].','.$u['y'], $enemies)));
        $cmd = collect($enemies)->firstWhere('kind', 'commander');
        $this->assertSame('시마즈 요시히로', $cmd['name']);
        $this->assertNull($cmd['hero']);
        $b7->assertJsonPath('battle.objective.type', 'defeat_commander')->assertJsonPath('battle.survive_remaining', null);

    }


    public function test_survive_turns_엔진_승패(): void
    {
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $svc = app(\App\Services\GameData::class);
        $engine = $svc->engine();
        $rules = $svc->rules();
        $mk = function (int $turn, ?int $survive, int $hpA = 100) use ($rules) {
            $s = \App\Game\ArmyBuilder::initialState($rules, ['width' => 6, 'height' => 1, 'tiles' => ['pppppp']], 1, 30);
            $s['units']['a0'] = \App\Game\ArmyBuilder::makeUnit($rules, 'a0', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
            $s['units']['b0'] = \App\Game\ArmyBuilder::makeUnit($rules, 'b0', 'b', 'commander', 'sword', null, 1, 5, 0, 3.0);
            $s['units']['a0']['hp'] = $hpA;
            $s['turn'] = $turn;
            $s['side'] = 'b';
            $survive && $s['objective'] = ['type' => 'survive_turns', 'turns' => $survive];

            return $s;
        };
        // N-1 라운드 종료: 계속 / N 라운드 종료: a 승리(turn_limit 아님)
        $this->assertSame('active', $engine->apply($mk(2, 3), 'b', ['type' => 'end_turn'])[0]['status']);
        [$s, $ev] = $engine->apply($mk(3, 3), 'b', ['type' => 'end_turn']);
        $this->assertSame(['finished', 'a'], [$s['status'], $s['winner']]);
        $this->assertSame('survive_turns', end($ev)['reason']);
        // 목표 없는 전투는 기존 동작(같은 턴에서 계속)
        $this->assertSame('active', $engine->apply($mk(3, null), 'b', ['type' => 'end_turn'])[0]['status']);
        // 지휘관 사망 시 즉시 패배(survive보다 우선)
        $s = $mk(1, 3, 1);
        $s['units']['b0']['x'] = 1;
        [$s] = $engine->apply($s, 'b', ['type' => 'attack', 'unit_id' => 'b0', 'target_id' => 'a0']);
        $this->assertSame(['finished', 'b'], [$s['status'], $s['winner']]);
    }

    public function test_퀘스트_정의에_ch1_메인_퀘스트가_있고_기존_정의는_유지된다(): void
    {
        $defs = collect(config('game.quests.defs'))->keyBy('code');
        foreach (range(1, 7) as $n) {
            $this->assertSame(['main', 'stage_clear', 'ch1_s'.$n], [$defs['main_ch1_s'.$n]['kind'], $defs['main_ch1_s'.$n]['event'], $defs['main_ch1_s'.$n]['subject']]);
        }
        foreach (range(1, 6) as $n) {
            $this->assertSame('stage_0'.$n, $defs['main_stage_0'.$n]['subject']);
        }
    }
}
