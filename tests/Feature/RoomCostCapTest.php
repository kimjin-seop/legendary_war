<?php

namespace Tests\Feature;

use App\Game\IllegalAction;
use App\Models\User;
use App\Services\GameData;
use App\Services\ProgressionService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class RoomCostCapTest extends TestCase
{
    use RefreshDatabase;

    /** 지정 병종·코스트 4 영웅 5명을 Lv1 유저에게 지급하고 편성 검증. */
    private function validate(?string $unitType): array
    {
        $this->artisan('game:seed')->assertSuccessful();
        $token = $this->postJson('/api/guests', ['nickname' => 'cap'])->assertCreated()->json('guest_token');
        $user = User::query()->latest('id')->first();
        $this->assertSame(1, (int) $user->level);
        $heroes = array_values(array_filter(app(GameData::class)->heroes(), fn ($h) => (int) $h['cost'] === 4 && empty($h['campaign_only']) && ($unitType === null || ($h['unit_type'] ?? null) === $unitType)));
        $this->assertGreaterThanOrEqual(5, count($heroes));
        $ids = [];
        foreach (array_slice($heroes, 0, 5) as $h) {
            $row = DB::table('user_heroes')->where('user_id', $user->id)->where('hero_id', $h['id'])->first();
            $ids[] = $row ? (int) $row->id : DB::table('user_heroes')->insertGetId(['user_id' => $user->id, 'hero_id' => $h['id'], 'level' => 1, 'created_at' => now(), 'updated_at' => now()]);
        }

        return [$user, $ids];
    }

    public function test_Lv1_계정도_L방에서_4코스트_영웅_5명_편성이_통과한다(): void
    {
        [$user, $ids] = $this->validate(null);
        $cap = (int) config('game.room.cost_cap')['L'];
        $out = app(ProgressionService::class)->validateParty($user, $ids, null, [], false, 5, $cap);
        $this->assertCount(5, $out);
    }

    public function test_4코스트_기병_5명은_L방_상한_30을_넘어_cost_exceeded다(): void
    {
        [$user, $ids] = $this->validate('cavalry');
        try {
            app(ProgressionService::class)->validateParty($user, $ids, null, [], false, 5, (int) config('game.room.cost_cap')['L']);
            $this->fail('cost_exceeded 기대');
        } catch (IllegalAction $e) {
            $this->assertSame('cost_exceeded', $e->reason);
            $this->assertSame(30, $e->extra['max'] ?? null);
        }
    }
}
