<?php

namespace Tests\Feature;

use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 임진왜란 10맵 시드: 멱등, 신규 지형 5종 move_type 전부 명시(void·wall 전부 불가), MapChecker ERROR 0, 해전 스테이지 수군 대여(forced) 흐름. */
class Imjin10SeedTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-protagonist')->assertSuccessful();   // ch1_s1은 주인공 필수(@protagonist)
    }

    public function test_시드는_멱등이고_지형_보정이_5종_move_type을_모두_가진다(): void
    {
        $this->artisan('game:seed-imjin10', ['--dry-run' => true, '--with-npc' => true])->assertSuccessful();
        $this->assertSame(0, DB::table('maps')->where('code', 'like', 'im_%')->count());   // dry-run은 쓰기 없음
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        $snap = fn () => [DB::table('maps')->where('code', 'like', 'im_%')->orderBy('code')->get(['code', 'tiles', 'spawns', 'deploy_zones', 'meta'])->toJson(),
            DB::table('stages')->where('code', 'like', 'ch1_%')->orderBy('code')->get(['code', 'map_id', 'objective', 'forced_heroes', 'triggers', 'enemy_squad'])->toJson(), DB::table('terrain_modifiers')->count()];
        $first = $snap();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--force' => true, '--with-npc' => true])->assertSuccessful();
        $this->assertSame($first, $snap());
        $this->assertSame(10, DB::table('maps')->where('code', 'like', 'im_%')->count());
        $this->assertSame(10, DB::table('stages')->where('code', 'like', 'ch1_%')->count());
        $rules = app(GameData::class)->rules();
        foreach (['sea', 'reef', 'harbor', 'sand', 'hill', 'void', 'rift_plank', 'plain', 'wall', 'castle'] as $t) {   // 누락 move_type = cost1 폴백(통행 가능) 방지
            foreach (['foot', 'mounted', 'flying', 'naval'] as $mt) {
                $this->assertArrayHasKey($mt, $rules->terrains[$t], "$t.$mt");
            }
        }
        foreach (['void', 'wall'] as $t) {
            foreach (['foot', 'mounted', 'flying', 'naval'] as $mt) {
                $this->assertNull($rules->terrainMod($t, $mt)['cost'], "$t.$mt");
            }
        }
        $this->assertTrue($rules->isBoardingTerrain('sea') && $rules->isWater('harbor') && ! $rules->isBoardingTerrain('harbor'));
    }

    public function test_meta_redesign이_있는_맵_행은_재시드해도_tiles_meta가_보존된다(): void
    {
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        $row = DB::table('maps')->where('code', 'im_06_haengju')->first();
        $meta = json_decode($row->meta, true);
        $meta['redesign'] = ['v' => 2];
        $meta['props'] = [['kind' => 'test']];
        DB::table('maps')->where('code', 'im_06_haengju')->update(['meta' => json_encode($meta), 'tiles' => json_encode(array_map(fn ($r) => $r, json_decode($row->tiles, true)))]);
        $before = DB::table('maps')->where('code', 'im_06_haengju')->first(['tiles', 'meta', 'spawns', 'deploy_zones']);
        DB::table('maps')->where('code', 'im_04_jinju')->update(['meta' => json_encode(['x' => 1])]);   // 비개편 행은 여전히 덮어써진다
        $this->artisan('game:seed-imjin10', ['--force' => true, '--with-npc' => true])->assertSuccessful();
        $this->assertEquals($before, DB::table('maps')->where('code', 'im_06_haengju')->first(['tiles', 'meta', 'spawns', 'deploy_zones']));
        $this->assertArrayNotHasKey('x', json_decode((string) DB::table('maps')->where('code', 'im_04_jinju')->value('meta'), true));
    }

    public function test_10맵_맵체커_ERROR_0과_08번_고립_스폰은_WARN(): void
    {
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();   // 시드 자체가 ERROR가 있으면 실패
        $checker = new MapChecker(app(GameData::class)->rules());
        $m = DB::table('maps')->where('code', 'im_08_seoga_collapse')->first();
        $rows = $checker->check(['code' => $m->code, 'width' => $m->width, 'height' => $m->height, 'tiles' => json_decode($m->tiles, true), 'spawns' => json_decode($m->spawns, true), 'deploy_zones' => json_decode($m->deploy_zones, true)]);
        $this->assertSame([], array_filter($rows, fn ($r) => $r[1] === 'ERROR'));
        $this->assertContains('WARN', array_column(array_filter($rows, fn ($r) => $r[0] === '스폰'), 1));
        $z = json_decode($m->deploy_zones, true);
        $this->assertNotContains([20, 17], $z['b']);   // 고립 스폰은 배치 영역 제외, spawns.b에는 보존
        $this->assertContains([20, 17], json_decode($m->spawns, true)['b']);
    }

    public function test_해전_스테이지는_이순신_수군_대여로_출전하고_수병_부대로_구성된다(): void
    {
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        $r = $this->postJson('/api/guests', ['nickname' => 'naval'])->assertCreated();
        $h = ['X-Guest-Token' => $r->json('guest_token')];
        $s1 = DB::table('stages')->where('code', 'ch1_s1')->first();
        $b = $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();
        $b->assertJsonPath('deployment.forced.1.hero', 'yi_sun_sin')->assertJsonPath('deployment.forced.1.troop_type', 'naval')->assertJsonPath('deployment.map_code', 'su_ch1_s1_okpo');
        $enemies = array_filter($b->json('battle.units'), fn ($u) => $u['side'] === 'b');
        $this->assertGreaterThanOrEqual(8, count($enemies));   // 4부대(지휘관 4 + 병사)
        $this->assertSame([true], array_values(array_unique(array_map(fn ($u) => $u['naval'], $enemies))));
        $id = $b->json('battle.battle_id');
        $pos = $b->json('deployment.default_positions');
        $first = $b->json('deployment.default_party.0');
        $this->assertSame($b->json('deployment.forced.0.user_hero_id'), $first);   // 강제 영웅(주인공)이 지휘관(첫 편성)
        $yi = $b->json('deployment.forced.1.user_hero_id');
        $this->withHeaders($h)->putJson("/api/battles/$id/deployment", ['placements' => array_map(fn ($u) => ['user_hero_id' => $u, 'x' => $pos[$u]['x'], 'y' => $pos[$u]['y']], [$first, $yi])])->assertOk();
        $this->withHeaders($h)->postJson("/api/battles/$id/confirm")->assertOk()->assertJsonPath('battle.status', 'in_progress');
        $mine = array_values(array_filter($this->withHeaders($h)->getJson("/api/battles/$id")->json('battle.units'), fn ($u) => $u['side'] === 'a'));
        $nav = array_values(array_filter($mine, fn ($u) => ($u['hero'] ?? null) === 'yi_sun_sin'))[0];
        $this->assertSame('naval', $nav['type']);          // 대여: 영웅 유닛 병종이 수병
        $this->assertTrue($nav['on_water']);
        $this->assertSame(['naval'], array_values(array_unique(array_map(fn ($u) => $u['type'], array_filter($mine, fn ($u) => $u['kind'] === 'troop' && ($u['leader_id'] ?? null) === $nav['id'])))));
        // 강제 영웅 없이 다른 영웅만 보내면 거부
        $b2 = $this->withHeaders($h)->postJson('/api/stages/'.$s1->id.'/challenge')->assertCreated();
        $other = DB::table('user_heroes')->where('user_id', $r->json('user.id'))->where('id', '!=', $first)->value('id');
        $p2 = $b2->json('deployment.default_positions');
        $zone = $b2->json('deployment.deploy_zone');
        $this->withHeaders($h)->putJson('/api/battles/'.$b2->json('battle.battle_id').'/deployment', ['placements' => [['user_hero_id' => (int) $other, 'x' => $zone[0][0], 'y' => $zone[0][1]]]])->assertStatus(422);
    }
}
