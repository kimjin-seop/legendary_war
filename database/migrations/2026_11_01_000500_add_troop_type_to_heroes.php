<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * heroes.troop_type: 영웅이 인솔하는 고정 일반 병종(sword|spear|cavalry|archer|heavy), nullable(null=미지정 -> 기존 폴백).
 * 값 원본은 database/data/hero_troop_types.json(game:seed가 null인 영웅만 채움). down: 컬럼 삭제(다른 데이터 무영향).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('heroes', 'troop_type')) {
            Schema::table('heroes', function (Blueprint $table) {
                $table->string('troop_type', 16)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('heroes', 'troop_type')) {
            Schema::table('heroes', function (Blueprint $table) {
                $table->dropColumn('troop_type');
            });
        }
    }
};
