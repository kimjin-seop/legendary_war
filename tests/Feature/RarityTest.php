<?php

namespace Tests\Feature;

use App\Models\User;
use App\Support\Rarity;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RarityTest extends TestCase
{
    use RefreshDatabase;

    public function test_구_등급은_신_등급으로_정규화되고_시드는_신_등급만_저장한다(): void
    {
        $this->assertSame(['S', 'A', 'B', 'C'], [Rarity::normalize('SSR'), Rarity::normalize('SR'), Rarity::normalize('R'), Rarity::normalize('C')]);
        $this->artisan('game:seed')->assertSuccessful();
        $this->assertSame(0, DB::table('heroes')->whereNotIn('rarity', Rarity::ORDER)->count());
    }

    public function test_어드민_영웅_등급_검증은_신_등급만_허용한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $admin = User::factory()->create();
        $admin->forceFill(['role' => 'admin'])->save();
        $id = DB::table('heroes')->value('id');

        $this->actingAs($admin, 'sanctum')->patchJson("/api/admin/config/heroes/$id", ['rarity' => 'SSR'])->assertStatus(422);
        $this->actingAs($admin, 'sanctum')->patchJson("/api/admin/config/heroes/$id", ['rarity' => 'C'])->assertOk()->assertJsonPath('item.rarity', 'C');
    }
}
