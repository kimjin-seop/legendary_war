<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * maps.meta: 맵 프리셋 메타(JSON, nullable). theme/size_class/pvp_fair/pvp_listing/recommended_per_side/tags/decor 등.
 * 가산 변경(기존 행은 null 유지 = 레거시 맵). down: 컬럼 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('maps', 'meta')) {
            Schema::table('maps', fn (Blueprint $t) => $t->json('meta')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('maps', 'meta')) {
            Schema::table('maps', fn (Blueprint $t) => $t->dropColumn('meta'));
        }
    }
};
