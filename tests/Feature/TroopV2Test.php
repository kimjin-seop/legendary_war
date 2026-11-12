<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** 병종 v2 1단계: heavy 폐지(보병 이관 + 별칭), 9x9 상성, 수병 지형 보정, 이관 명령. */
class TroopV2Test extends TestCase
{
    use RefreshDatabase;

    public function test_상성표_9x9와_수병_지형_보정이_시드된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = app(GameData::class)->rules();
        $this->assertSame(1.25, $r->multiplier('spear', 'cavalry'));
        $this->assertSame(1.15, $r->multiplier('assassin', 'mage'));
        $this->assertSame(0.87, $r->multiplier('mage', 'assassin'));
        $this->assertSame(1.25, $r->multiplier('mage', 'monster'));
        $this->assertSame('보병', $r->unitType('sword')['name']);
        $this->assertSame(1, $r->terrainMod('plain', 'naval')['cost']);
        $this->assertSame(-10, $r->terrainMod('plain', 'naval')['def_pct']);
        $this->assertSame(20, $r->terrainMod('water', 'naval')['def_pct']);
        $this->assertNull($r->terrainMod('mountain', 'naval')['cost']);
    }

    public function test_영웅_class_heavy_11명은_sword로_이관되고_Lv1_능력치가_보존된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $h = DB::table('heroes')->join('unit_types', 'unit_types.id', '=', 'heroes.unit_type_id')->where('heroes.code', 'leonidas')->first(['unit_types.code as t', 'heroes.hp_bonus', 'heroes.atk_bonus', 'heroes.def_bonus']);
        $this->assertSame('sword', $h->t);
        // 이관 전: heavy(95/22/15) + 보너스 12/2/2 = 107/24/17 (이후 레오니다스 능력치 재배분 v5·v6·체력 10 고정으로 94/30/15) -> sword(84/28/10) + 26/-3/8
        $this->assertSame([94, 30, 15], [84 + $h->hp_bonus, 28 + $h->atk_bonus, 10 + $h->def_bonus]);
        $this->assertSame(0, DB::table('heroes')->join('unit_types', 'unit_types.id', '=', 'heroes.unit_type_id')->where('unit_types.code', 'heavy')->where('heroes.code', 'not like', 'protagonist%')->count());
        $this->assertSame(0, DB::table('heroes')->where('troop_type', 'heavy')->count());
    }

    public function test_heavy는_별칭으로_보병과_같게_동작한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $r = app(GameData::class)->rules();
        $this->assertSame('foot', $r->unitType('heavy')['move_type']);
        $this->assertSame($r->unitType('sword')['hp'], $r->unitType('heavy')['hp']);
        $this->assertSame($r->multiplier('cavalry', 'sword'), $r->multiplier('cavalry', 'heavy'));
        $this->assertSame($r->multiplier('sword', 'spear'), $r->multiplier('heavy', 'spear'));   // 공격측 별칭
    }

    public function test_이관_명령은_옛_DB의_heavy를_정리하고_멱등이다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        // 옛 DB 재현: 새 시드에는 heavy 행이 없지만 기존 DB에는 남아 있다(삭제 금지, 별칭 처리)
        $heavy = DB::table('unit_types')->insertGetId(['code' => 'heavy', 'name' => '중장갑', 'move' => 4, 'range_min' => 1, 'range_max' => 1, 'hp' => 95, 'atk' => 22, 'def' => 15, 'move_type' => 'heavy', 'heal' => 0, 'cost' => 2, 'created_at' => now(), 'updated_at' => now()]);
        // 옛 상태 재현: 영웅 1명 heavy class, 프리셋에 heavy
        DB::table('heroes')->where('code', 'leonidas')->update(['unit_type_id' => $heavy, 'hp_bonus' => 12, 'atk_bonus' => 2, 'def_bonus' => 2, 'troop_type' => 'heavy']);
        $pid = DB::table('presets')->value('id');
        DB::table('presets')->where('id', $pid)->update(['units' => json_encode(['heavy', 'archer'])]);
        $this->artisan('game:troop-v2-apply', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame($heavy, (int) DB::table('heroes')->where('code', 'leonidas')->value('unit_type_id'));   // dry-run은 롤백
        $this->artisan('game:troop-v2-apply')->assertSuccessful();
        $this->artisan('game:troop-v2-apply')->assertSuccessful();   // 두 번째 실행은 보정 중복 없음
        $h = DB::table('heroes')->where('code', 'leonidas')->first();
        $this->assertSame('sword', DB::table('unit_types')->where('id', $h->unit_type_id)->value('code'));
        $this->assertNotNull(DB::table('unit_types')->where('code', 'heavy')->value('id'));   // 행은 삭제하지 않는다
        $this->assertSame('foot', app(GameData::class)->rules()->unitType('heavy')['move_type']);   // 행이 있어도 별칭(보병)으로 해석
        $this->assertSame([23, -4, 7], [(int) $h->hp_bonus, (int) $h->atk_bonus, (int) $h->def_bonus]);
        $this->assertSame('sword', $h->troop_type);
        $this->assertSame(['sword', 'archer'], json_decode((string) DB::table('presets')->where('id', $pid)->value('units'), true));
    }
}
