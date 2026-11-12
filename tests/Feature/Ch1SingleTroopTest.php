<?php

namespace Tests\Feature;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class Ch1SingleTroopTest extends TestCase
{
    use RefreshDatabase;

    public function test_ch1_v2_정규화_허용외_병종_거부_시드_멱등(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();   // 기본 입력 = v2
        $this->artisan('game:seed-ch1', ['--force' => true])->assertSuccessful();
        $this->assertSame(7, DB::table('stages')->where('code', 'like', 'ch1_%')->count());
        foreach (DB::table('stages')->where('code', 'like', 'ch1_%')->pluck('enemy_squad') as $json) {
            $sq = json_decode($json, true);
            $this->assertSame([$sq['commander']['troop_type']], array_values(array_unique(array_merge([$sq['commander']['unit_type']], $sq['units']))));   // 지휘관 단위 단일 병종
        }
        // 엔진 정규화: 혼합 입력도 지휘관 troop_type 1종으로(길이 유지), 지휘관 병종도 동일
        $data = app(\App\Services\GameData::class);
        $map = $data->map($data->defaultMapId());
        $s = ArmyBuilder::initialState($data->rules(), $map, 1, 30, 'a', false, true);
        ArmyBuilder::addGenericSide($data->engine(), $s, 'b', ['commander' => ['unit_type' => 'sword', 'troop_type' => 'spear', 'hp_mult' => 2.0], 'units' => ['sword', 'archer', 'heavy']], 1, $map['spawns']['b'], $map['deploy_zones']['b'], 3.0);
        $b = array_filter($s['units'], fn ($u) => $u['side'] === 'b');
        $this->assertCount(4, $b);
        $this->assertSame(['spear'], array_values(array_unique(array_column($b, 'type'))));
        // 허용 외 병종(heavy)이 든 v2 입력은 시드 실패
        $doc = json_decode(file_get_contents(database_path('data/stages_ch1_proposal_v2.json')), true);
        $doc['enemy_presets'][0]['units'][0] = 'heavy';
        $tmp = tempnam(sys_get_temp_dir(), 'ch1');
        file_put_contents($tmp, json_encode($doc));
        $this->artisan('game:seed-ch1', ['--path' => $tmp, '--force' => true])->assertFailed();
        @unlink($tmp);
    }
}
