<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 영웅-부대 편성 기반(묶음 A, 모두 기본 동작 불변):
 *  - parties.troops: 영웅 슬롯별 사용자 선택 부대 병종 JSON 배열(null/빈 배열=프리셋 폴백)
 *  - heroes.troop_bonus: 영웅별 부대 수 보너스(기본 0, 상한은 config game.troop_cap)
 *  - unit_types.cost: 부대 병종 코스트(시작값, 합산 검증은 rules.troop_cost가 켜질 때만 사용)
 * down: 세 컬럼 삭제(값만 손실).
 */
return new class extends Migration
{
    private const COST = ['sword' => 1, 'spear' => 1, 'archer' => 1, 'healer' => 1, 'mage' => 2, 'heavy' => 2, 'cavalry' => 2, 'flyer' => 2];

    public function up(): void
    {
        if (! Schema::hasColumn('parties', 'troops')) {
            Schema::table('parties', fn (Blueprint $t) => $t->json('troops')->nullable());
        }
        if (! Schema::hasColumn('heroes', 'troop_bonus')) {
            Schema::table('heroes', fn (Blueprint $t) => $t->unsignedTinyInteger('troop_bonus')->default(0));
        }
        if (! Schema::hasColumn('unit_types', 'cost')) {
            Schema::table('unit_types', fn (Blueprint $t) => $t->unsignedTinyInteger('cost')->default(1));
            foreach (self::COST as $code => $cost) {
                DB::table('unit_types')->where('code', $code)->update(['cost' => $cost]);
            }
        }
    }

    public function down(): void
    {
        foreach ([['parties', 'troops'], ['heroes', 'troop_bonus'], ['unit_types', 'cost']] as [$table, $col]) {
            if (Schema::hasColumn($table, $col)) {
                Schema::table($table, fn (Blueprint $t) => $t->dropColumn($col));
            }
        }
    }
};
