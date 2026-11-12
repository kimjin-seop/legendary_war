<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 스테이지 전용 적 편성: enemy_extra_troops(프리셋 외 추가 부대 병종 코드 JSON 배열), enemy_level_offset(적 레벨 가산).
 * backfill 값은 database/data/stages.json과 동일. 스테이지 전투(PvE)에만 적용되고 PvP/방 대전은 사용하지 않는다.
 */
return new class extends Migration
{
    private const BACKFILL = [
        'stage_02' => [['spear', 'archer'], 0],
        'stage_03' => [['spear', 'archer'], 2],
        'stage_04' => [['heavy', 'cavalry'], 2],
        'stage_05' => [['cavalry', 'archer'], 2],
        'stage_06' => [['spear', 'cavalry'], 1],
    ];

    public function up(): void
    {
        Schema::table('stages', function (Blueprint $table) {
            if (! Schema::hasColumn('stages', 'enemy_extra_troops')) {
                $table->json('enemy_extra_troops')->default('[]');
            }
            if (! Schema::hasColumn('stages', 'enemy_level_offset')) {
                $table->integer('enemy_level_offset')->default(0);
            }
        });
        foreach (self::BACKFILL as $code => [$troops, $offset]) {
            DB::table('stages')->where('code', $code)->update(['enemy_extra_troops' => json_encode($troops), 'enemy_level_offset' => $offset]);
        }
    }

    public function down(): void
    {
        Schema::table('stages', function (Blueprint $table) {
            foreach (['enemy_extra_troops', 'enemy_level_offset'] as $c) {
                if (Schema::hasColumn('stages', $c)) {
                    $table->dropColumn($c);
                }
            }
        });
    }
};
