<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 지형 속성(묶음 B, 모두 규칙 플래그가 켜질 때만 사용): elevation(고지 1/0), cover(원거리 엄폐 1/0), heals(턴 종료 회복 1/0).
 * backfill: mountain·wall elevation=1, forest cover=1, village heals=1(terrains.json과 동일). down: 컬럼 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('terrains', 'elevation')) {
            Schema::table('terrains', function (Blueprint $t) {
                $t->unsignedTinyInteger('elevation')->default(0);
                $t->unsignedTinyInteger('cover')->default(0);
                $t->unsignedTinyInteger('heals')->default(0);
            });
            DB::table('terrains')->whereIn('code', ['mountain', 'wall'])->update(['elevation' => 1]);
            DB::table('terrains')->where('code', 'forest')->update(['cover' => 1]);
            DB::table('terrains')->where('code', 'village')->update(['heals' => 1]);
        }
    }

    public function down(): void
    {
        Schema::table('terrains', function (Blueprint $t) {
            foreach (['elevation', 'cover', 'heals'] as $c) {
                if (Schema::hasColumn('terrains', $c)) {
                    $t->dropColumn($c);
                }
            }
        });
    }
};
