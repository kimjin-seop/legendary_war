<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use App\Game\Duel;
use App\Game\HeuristicBot;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class StageEnemySkillTest extends TestCase
{
    use RefreshDatabase;

    private function build(array $cmd, ?array $squadExtra = null): array
    {
        $data = app(GameData::class);
        $eng = $data->engine(['active_skills' => true, 'squad' => true]);
        $map = $data->map($data->defaultMapId());
        $s = ArmyBuilder::initialState($data->rules(), $map, 1, 30, 'a', false, true, false, null, $eng->mpKnobs());
        $sq = ['commander' => $cmd + ['unit_type' => 'sword', 'troop_type' => 'sword'], 'units' => ['sword']];
        ArmyBuilder::addGenericSide($eng, $s, 'b', $sq, 5, $map['spawns']['b'], $map['deploy_zones']['b'], 3.0, [], fn ($c) => $data->heroes()[$c] ?? null);

        return [$eng, $s, $data];
    }

    public function test_적_지휘관이_영웅_스킬_또는_병종_기본_액티브를_가진다_스탯은_불변(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        [, $s, $data] = $this->build(['npc_ref' => 'hannibal']);
        $this->assertSame('cannae_encirclement', $s['units']['b0']['actives'][0]['code']);
        $this->assertNull($s['units']['b0']['hero']);
        $this->assertSame($s['units']['b1']['atk'], $s['units']['b0']['atk']);   // 병사와 동일 스탯(영웅 보너스 미적용)
        $this->assertArrayHasKey('mp', $s['units']['b0']);

        [, $g] = $this->build(['display_name_ko' => '무명 장수']);
        $this->assertSame('default_sword', $g['units']['b0']['actives'][0]['code']);
        $this->assertArrayNotHasKey('actives', $g['units']['b1']);   // 병사는 스킬 없음

        config(['game.stage_enemy_skills' => false]);
        [, $off] = $this->build(['display_name_ko' => '무명 장수']);
        $this->assertArrayNotHasKey('actives', $off['units']['b0']);
    }

    public function test_봇은_MP가_있으면_스킬을_쓰고_부족하면_일반_공격(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        [$eng, $s] = $this->build(['display_name_ko' => '무명 장수']);
        $b0 = $s['units']['b0'];
        $s['units']['a0'] = ['id' => 'a0', 'side' => 'a', 'kind' => 'commander', 'type' => 'sword', 'hero' => null, 'name' => 'x', 'level' => 5, 'x' => $b0['x'] - 1, 'y' => $b0['y'], 'hp' => 200, 'max_hp' => 200, 'atk' => 20, 'def' => 5, 'move' => 3, 'moved' => false, 'acted' => false, 'aura' => null, 'passive' => null, 'facing' => null, 'culture' => null];
        $s['units'] = array_diff_key($s['units'], ['b1' => 1]);
        $s['side'] = 'b';
        $s['units']['b0']['mp'] = $s['units']['b0']['mp_max'];
        $types = fn (array $st) => array_column(array_filter((new HeuristicBot($eng, config('game.bot')))->plan($st, 'b')['actions'], fn ($a) => ($a['unit_id'] ?? null) === 'b0'), 'type');
        $this->assertContains('use_skill', $types($s));
        $s['units']['b0']['mp'] = 0;
        $t = $types($s);
        $this->assertNotContains('use_skill', $t);
        $this->assertContains('attack', $t);
    }

    public function test_스테이지식_전투_시뮬이_오류없이_끝나고_스킬_이벤트에_fx가_실린다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $data = app(GameData::class);
        $h = $data->heroes();
        $ev = [];
        $duel = new Duel($data->engine(['active_skills' => true, 'squad' => true]), $data->map($data->defaultMapId()), 3.0, 30, config('game.bot'), function (array $e) use (&$ev) {
            foreach ($e as $x) {
                ($x['type'] ?? '') === 'skill_use' && $ev[] = $x;
            }
        });
        $r = $duel->run(7, ['hero' => $h['alexander'], 'level' => 5, 'troops' => ['sword', 'spear']], ['generic' => ['commander' => ['unit_type' => 'sword', 'troop_type' => 'sword', 'npc_ref' => 'hannibal'], 'units' => ['sword', 'sword']], 'level' => 5], null, null, 'b', [], fn ($c) => $h[$c] ?? null);
        $this->assertGreaterThanOrEqual(1, $r['turn']);
        $bs = array_values(array_filter($ev, fn ($e) => ($e['side'] ?? null) === 'b' || str_starts_with((string) ($e['actor_unit_id'] ?? ''), 'b')));
        $this->assertNotEmpty($bs);
        $this->assertArrayHasKey('fx_family', $bs[0]);
    }
}
