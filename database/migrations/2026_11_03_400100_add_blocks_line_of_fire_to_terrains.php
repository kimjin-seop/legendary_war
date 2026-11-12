<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 총병(gunner) 사선(LOS) 규칙용 지형 속성: terrains.blocks_line_of_fire (1=사격자-대상 사이 중간 칸일 때 총병 사격을 막음).
 * backfill: forest·mountain·wall·cliff·castle (terrains.json과 동일). 기본 0이라 기존 행·전투 불변. down: 컬럼 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('terrains', 'blocks_line_of_fire')) {
            Schema::table('terrains', function (Blueprint $t) {
                $t->unsignedTinyInteger('blocks_line_of_fire')->default(0);
            });
            DB::table('terrains')->whereIn('code', ['forest', 'mountain', 'wall', 'cliff', 'castle'])->update(['blocks_line_of_fire' => 1]);
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('terrains', 'blocks_line_of_fire')) {
            Schema::table('terrains', function (Blueprint $t) {
                $t->dropColumn('blocks_line_of_fire');
            });
        }
    }
};
