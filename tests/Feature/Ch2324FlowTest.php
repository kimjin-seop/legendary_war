<?php

namespace Tests\Feature;

use App\Game\Engine;
use App\Game\HeuristicBot;
use App\Game\StageRules;
use App\Game\SubObjectives;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** ch23/ch24 승패·서브목표 흐름을 엔진 레벨(헤드리스, 봇 이동 강제)로 확인. 전투 생성은 실제 시드·API 경로. */
class Ch2324FlowTest extends TestCase
{
    use RefreshDatabase;

    private array $h = [];

    private int $uid = 0;

    private function seedAll(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        foreach (['npc_cart_1', 'npc_cart_2'] as $cart) {
            $row = (array) DB::table('heroes')->where('code', 'npc_manabe_samanojo')->first();
            unset($row['id']);
            DB::table('heroes')->insert(['code' => $cart, 'name_en' => $cart] + $row);
        }
        $this->artisan('game:seed-maps-pack')->assertSuccessful();
        $this->artisan('game:seed-maps-pack', ['--path' => 'maps_pack20_v2.json'])->assertSuccessful();
        foreach (['maps_scaleup_ch1.json', 'maps_scaleup_swap.json', 'maps_scaleup_late.json', 'maps_scaleup_batch2.json', 'maps_ch23_ch24.json'] as $f) {
            $this->artisan('game:seed-maps-pack', ['--path' => $f])->assertSuccessful();
        }
        $this->artisan('game:seed-shelf', ['--chapters' => '23,24', '--with-npc' => true])->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'flow'])->assertCreated();
        $this->h = ['X-Guest-Token' => $r->json('guest_token')];
        $this->uid = (int) $r->json('user.id');
        foreach (DB::table('stages')->where('chapter', '>=', 23)->get() as $s) {
            DB::table('user_stage_progress')->insert(['user_id' => $this->uid, 'stage_id' => $s->id, 'clear_count' => 1, 'best_stars' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /** 전투를 만들고 배치 확정까지 진행한 state 를 돌려준다 */
    private function start(string $code): array
    {
        $sid = DB::table('stages')->where('code', $code)->value('id');
        $b = $this->withHeaders($this->h)->postJson("/api/stages/$sid/challenge")->assertCreated();
        $id = $b->json('battle.battle_id');
        $pos = $b->json('deployment.default_positions');
        $this->withHeaders($this->h)->putJson("/api/battles/$id/deployment", ['placements' => array_map(fn ($k) => ['user_hero_id' => (int) $k, 'x' => $pos[$k]['x'], 'y' => $pos[$k]['y']], array_slice(array_keys($pos), 0, 2))])->assertOk();
        $this->withHeaders($this->h)->postJson("/api/battles/$id/confirm")->assertOk();

        return json_decode(DB::table('battles')->where('id', $id)->value('state'), true);
    }

    private function unitOf(array $st, string $ref): string
    {
        foreach ($st['units'] as $id => $u) {
            if (($u['npc_ref'] ?? $u['hero'] ?? null) === $ref && $u['side'] === 'a') {
                return (string) $id;
            }
        }
        $this->fail("유닛 없음: $ref");
    }

    public function test_ch23_s3_윌리엄_구역_도달_승리와_윌리엄_사망_패배(): void
    {
        $this->seedAll();
        $e = new Engine(app(GameData::class)->rules());
        $st = $this->start('ch23_s3');
        $w = $this->unitOf($st, 'william_i');
        // 승리: 윌리엄이 hill_near 구역에 서도 기본 목표(점령 유지) 전에는 승리가 아니고, 기본 목표 달성 시점에 승리가 확정된다
        $win = $st;
        [$win['units'][$w]['x'], $win['units'][$w]['y']] = [12, 8];
        $ev = [];
        StageRules::check($e, $win, $ev);
        $this->assertSame('active', $win['status']);
        $this->assertTrue(StageRules::gate($win));
        // 패배: 윌리엄 사망 즉시 패배
        $lose = $st;
        $lose['defeated'][$w] = ['side' => 'a', 'kind' => 'hero', 'hero' => 'william_i'];
        unset($lose['units'][$w]);
        $ev = [];
        StageRules::check($e, $lose, $ev);
        $this->assertSame(['finished', 'b'], [$lose['status'], $lose['winner']]);
    }

    public function test_ch24_s2_정찰대가_route로_신호_지점에_닿으면_패배한다(): void
    {
        $this->seedAll();
        $e = new Engine(app(GameData::class)->rules());
        $bot = new HeuristicBot($e);
        $st = $this->start('ch24_s2');
        $this->assertNotEmpty(array_filter($st['units'], fn ($u) => ! empty($u['route']) && $u['side'] === 'b'), '적 route 유닛');
        $st['side'] = 'b';
        $st['turn'] = 6;   // route from_turn
        for ($i = 0; $i < 8 && $st['status'] === 'active'; $i++) {
            foreach ($bot->plan($st, 'b')['actions'] as $a) {
                if ($a['type'] === 'end_turn') {
                    continue;
                }
                [$st] = $e->apply($st, 'b', $a);
                if ($st['status'] !== 'active') {
                    break;
                }
            }
            foreach ($st['units'] as $k => $u) {
                $st['units'][$k]['moved'] = false;
                $st['units'][$k]['acted'] = false;
            }
            $ev = [];
            StageRules::check($e, $st, $ev);
            $st['turn']++;
        }
        $this->assertSame(['finished', 'b'], [$st['status'], $st['winner']]);
    }

    public function test_ch24_s4_언덕_침범은_실패_카를_사망은_패배(): void
    {
        $this->seedAll();
        $e = new Engine(app(GameData::class)->rules());
        $st = $this->start('ch24_s4');
        $this->assertSame('pending', $st['sub_objectives']['hill_breach']['status']);
        $enemy = array_key_first(array_filter($st['units'], fn ($u) => $u['side'] === 'b'));
        $breach = $st;
        [$breach['units'][$enemy]['x'], $breach['units'][$enemy]['y']] = $st['sub_objectives']['hill_breach']['tiles'][0];
        SubObjectives::tick($breach);
        $this->assertSame('failed', $breach['sub_objectives']['hill_breach']['status']);
        $c = $this->unitOf($st, 'charles_martel');
        $lose = $st;
        $lose['defeated'][$c] = ['side' => 'a', 'kind' => 'hero', 'hero' => 'charles_martel'];
        unset($lose['units'][$c]);
        SubObjectives::tick($lose);
        $ev = [];
        StageRules::check($e, $lose, $ev);
        $this->assertSame('failed', $lose['sub_objectives']['charles']['status']);
        $this->assertSame(['finished', 'b'], [$lose['status'], $lose['winner']]);
    }

    /** 양측 end_turn 만으로 라운드를 진행시킨다(봇 행동 없음). 종료되면 즉시 멈춘다 */
    private function runRounds(Engine $e, array $st, int $rounds): array
    {
        for ($i = 0; $i < $rounds * 2 && $st['status'] === 'active'; $i++) {
            [$st] = $e->apply($st, $st['side'], ['type' => 'end_turn']);
        }

        return $st;
    }

    public function test_ch23_s3_점령을_유지하면_윌리엄이_구역에_있을_때만_승리한다(): void
    {
        $this->seedAll();
        $e = new Engine(app(GameData::class)->rules());
        $base = $this->start('ch23_s3');
        $w = $this->unitOf($base, 'william_i');
        $occupied = array_map(fn ($u) => [$u['x'], $u['y']], $base['units']);
        $point = collect($base['objective']['points'])->first(fn ($p) => ! in_array($p, $occupied, true));   // 적이 서 있지 않은 점령 칸
        $mover = array_key_first(array_filter($base['units'], fn ($u) => $u['side'] === 'a' && empty($u['npc_ally']) && $u['kind'] !== 'troop'));
        // 점령 유지 + 윌리엄 구역 안: 승리
        $win = $base;
        [$win['units'][$mover]['x'], $win['units'][$mover]['y']] = $point;
        [$win['units'][$w]['x'], $win['units'][$w]['y']] = [12, 8];
        $win = $this->runRounds($e, $win, 5);
        $this->assertSame(['finished', 'a'], [$win['status'], $win['winner']]);
        // 점령은 했지만 윌리엄이 구역 밖: 승리하지 않는다
        $no = $base;
        [$no['units'][$mover]['x'], $no['units'][$mover]['y']] = $point;
        [$no['units'][$w]['x'], $no['units'][$w]['y']] = [30, 20];
        $no = $this->runRounds($e, $no, 5);
        $this->assertNotSame('a', $no['winner'] ?? null);
    }

    public function test_ch24_s4_격파형은_지휘관을_처치하면_즉시_승리하고_미처치면_승리하지_않는다(): void
    {
        $this->seedAll();
        $e = new Engine(app(GameData::class)->rules());
        $base = $this->start('ch24_s4');
        $this->assertArrayNotHasKey('objective', $base);   // defeat_commander 는 objective 를 기록하지 않는다
        $cmd = array_key_first(array_filter($base['units'], fn ($u) => $u['side'] === 'b' && $u['kind'] === 'commander'));
        // 지휘관 미처치: 턴을 보내도 승리하지 않는다
        $no = $this->runRounds($e, $base, 2);
        $this->assertNotSame('a', $no['winner'] ?? null);
        // 지휘관 처치(실제 공격): 생존 턴을 기다리지 않고 승리
        $ok = $base;
        $att = array_key_first(array_filter($ok['units'], fn ($u) => $u['side'] === 'a' && empty($u['npc_ally']) && $u['kind'] !== 'troop'));
        [$cx, $cy] = [$ok['units'][$cmd]['x'], $ok['units'][$cmd]['y']];
        foreach ($ok['units'] as $k => $u) {
            if ($k !== $att && $k !== $cmd && $u['x'] === $cx + 1 && $u['y'] === $cy) {
                unset($ok['units'][$k]);
            }
        }
        [$ok['units'][$att]['x'], $ok['units'][$att]['y']] = [$cx + 1, $cy];
        $ok['units'][$att]['atk'] = 9999;
        $ok['units'][$cmd]['hp'] = 1;
        [$ok] = $e->apply($ok, 'a', ['type' => 'attack', 'unit_id' => $att, 'target_id' => $cmd]);
        $this->assertSame(['finished', 'a'], [$ok['status'], $ok['winner']]);
    }
}
