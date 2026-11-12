<?php

namespace Tests\Feature;

use App\Services\BattleService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 적 대표 뷰의 generic 필드: 일반 직함 지휘관(enemy_squad.commander.kind=generic)만 true. */
class EnemyCommanderViewTest extends TestCase
{
    use RefreshDatabase;

    public function test_generic_필드는_일반_직함_지휘관만_true(): void
    {
        $b = app(BattleService::class);
        $sq = fn (string $kind) => json_encode(['commander' => ['display_name_ko' => '적 선봉장', 'kind' => $kind, 'npc_ref' => null, 'unit_type' => 'spear']]);
        $this->assertTrue($b->enemyCommanderView((object) ['rules' => null, 'enemy_squad' => $sq('generic'), 'enemy_preset_id' => 0])['generic']);
        $this->assertFalse($b->enemyCommanderView((object) ['rules' => null, 'enemy_squad' => $sq('named'), 'enemy_preset_id' => 0])['generic']);
        $ov = json_encode(['enemy_commander' => ['name' => '선봉장', 'hero' => null]]);
        $this->assertTrue($b->enemyCommanderView((object) ['rules' => $ov, 'enemy_squad' => $sq('generic'), 'enemy_preset_id' => 0])['generic']);   // 오버라이드 hero null -> squad kind 따름
        $ovHero = json_encode(['enemy_commander' => ['name' => '곽재우', 'hero' => 'gwak_jae_u']]);
        $this->assertFalse($b->enemyCommanderView((object) ['rules' => $ovHero, 'enemy_squad' => $sq('generic'), 'enemy_preset_id' => 0])['generic']);
    }
}
