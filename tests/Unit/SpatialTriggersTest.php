<?php

namespace Tests\Unit;

use App\Game\BattleStory;
use App\Game\EventConditions;
use PHPUnit\Framework\TestCase;

class SpatialTriggersTest extends TestCase
{
    private function state(): array
    {
        $u = fn ($id, $side, $kind, $x, $y, $hero = null) => ['id' => $id, 'side' => $side, 'kind' => $kind, 'x' => $x, 'y' => $y, 'hp' => 10, 'hero' => $hero];

        return ['units' => ['a0' => $u('a0', 'a', 'hero', 2, 2, 'yi_sun_sin'), 'a1' => $u('a1', 'a', 'hero', 3, 2, 'gwak_jae_u'), 'b0' => $u('b0', 'b', 'commander', 5, 2)], 'tile_tags' => ['sandbar' => [[5, 2]]]];
    }

    private function trig(array $t): bool
    {
        $m = new \ReflectionMethod(BattleStory::class, 'spatial');
        $m->setAccessible(true);

        return $m->invoke(null, $t, $this->state());
    }

    public function test_세_트리거가_위치로_평가된다(): void
    {
        $this->assertTrue($this->trig(['type' => 'units_adjacent', 'a' => 'hero:142', 'b' => 'hero:144']));
        $this->assertTrue($this->trig(['type' => 'unit_distance_lte', 'a' => 'player_hero_any', 'b' => 'enemy_commander', 'distance' => 2]));
        $this->assertFalse($this->trig(['type' => 'unit_distance_lte', 'a' => 'hero:142', 'b' => 'enemy_commander', 'distance' => 2]));
        $this->assertTrue($this->trig(['type' => 'unit_enter_tile', 'side' => 'enemy', 'tile_tag' => 'sandbar']));
        $this->assertFalse($this->trig(['type' => 'unit_enter_tile', 'side' => 'enemy', 'tile_tag' => 'unknown_tag']));   // 태그 미제공 맵 = 발화 안 함
        $this->assertNull(EventConditions::normalize(['type' => 'unit_distance_lte', 'a' => 'x', 'b' => 'y', 'distance' => -1]));
    }

    public function test_맵_tile_tags_정규화는_맵_안_정수_칸과_유효_태그만_남긴다(): void
    {
        $this->assertSame(['sandbar' => [[1, 1], [2, 1]]], EventConditions::normalizeTileTags(['sandbar' => [[1, 1], [2, 1], [9, 9], [-1, 0], 'x'], 'Bad Tag' => [[0, 0]], 'empty' => []], 5, 5));
        $this->assertSame([], EventConditions::normalizeTileTags(null, 5, 5));
    }
}
