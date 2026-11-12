<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class NpcRefViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_npc_ref는_npc_지휘관_유닛에만_보존된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $data = app(\App\Services\GameData::class);
        $map = $data->map($data->defaultMapId());
        $s = ArmyBuilder::initialState($data->rules(), $map, 1, 30, 'a', false, true);
        $sq = ['commander' => ['unit_type' => 'sword', 'troop_type' => 'sword', 'npc_ref' => 'npc_shadow_ink'], 'units' => ['sword'],
            'squads' => [['commander' => ['unit_type' => 'sword', 'troop_type' => 'sword', 'npc_ref' => 'npc_todo_takatora'], 'units' => ['sword']]]];
        ArmyBuilder::addGenericSide($data->engine(), $s, 'b', $sq, 1, $map['spawns']['b'], $map['deploy_zones']['b'], 3.0);
        $by = array_column(array_values($s['units']), null, 'id');
        $this->assertSame('npc_shadow_ink', $by['b0']['npc_ref']);
        $subs = array_values(array_filter($s['units'], fn ($u) => ($u['npc_ref'] ?? null) === 'npc_todo_takatora' && $u['kind'] === 'hero'));
        $this->assertCount(1, $subs);
        $this->assertCount(2, array_filter($s['units'], fn ($u) => isset($u['npc_ref'])));   // 병사에는 없음
    }

    public function test_병사에는_분대_soldier_look_또는_npc_erased_line_지휘관이면_troop_look이_붙는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $data = app(\App\Services\GameData::class);
        $map = $data->map($data->defaultMapId());
        $s = ArmyBuilder::initialState($data->rules(), $map, 1, 30, 'a', false, true);
        $sq = ['commander' => ['unit_type' => 'sword', 'troop_type' => 'sword', 'npc_ref' => 'npc_erased_line'], 'units' => ['sword'],
            'squads' => [['commander' => ['unit_type' => 'sword', 'troop_type' => 'sword', 'npc_ref' => 'npc_todo_takatora'], 'units' => ['sword'], 'soldier_look' => 'npc_custom_look'],
                ['commander' => ['unit_type' => 'sword', 'troop_type' => 'sword'], 'units' => ['sword'], 'soldier_look' => 'Bad Look!']]];
        ArmyBuilder::addGenericSide($data->engine(), $s, 'b', $sq, 1, $map['spawns']['b'], $map['deploy_zones']['b'], 3.0);
        $troops = array_values(array_filter($s['units'], fn ($u) => $u['kind'] === 'troop' && $u['side'] === 'b'));
        $looks = array_map(fn ($u) => $u['troop_look'] ?? null, $troops);
        sort($looks);
        $this->assertSame([null, 'npc_custom_look', 'npc_erased_line'], $looks);   // 형식 불량 값은 생략
    }
}
