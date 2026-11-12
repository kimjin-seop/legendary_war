<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * maps.biome: 맵 환경(desert|snow|temperate ... FE 연출용, 값은 maps.json의 biome 키, 없으면 null).
 * down: 컬럼 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('maps', 'biome')) {
            Schema::table('maps', fn (Blueprint $t) => $t->string('biome', 16)->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('maps', 'biome')) {
            Schema::table('maps', fn (Blueprint $t) => $t->dropColumn('biome'));
        }
    }
};
