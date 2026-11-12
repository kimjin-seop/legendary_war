<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * heroes.culture: 문화권 세트 id(korea|japan|china|middle_east|europe ... 값 목록은 database/data/hero_cultures.json sets).
 * nullable(미지정=null). 시드는 heroes.json의 culture 필드를 사용한다. down: 컬럼 삭제(값 손실, 다른 데이터 무영향).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('heroes', 'culture')) {
            Schema::table('heroes', function (Blueprint $table) {
                $table->string('culture', 24)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('heroes', 'culture')) {
            Schema::table('heroes', function (Blueprint $table) {
                $table->dropColumn('culture');
            });
        }
    }
};
