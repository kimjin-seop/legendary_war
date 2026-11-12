<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 시나리오 배너 뽑기 로그(docs/GACHA_REQUIRED_PITY_20261108.md 배너 편). gacha_pulls.banner_key 1개 추가(NULL = 서고/전체 풀). 가산 전용.
 * 운영 DB 적용은 사용자 승인 필요(개발 DB 에만 적용됨). 컬럼이 없으면 GachaService 는 시나리오 배너를 전부 비활성으로 취급한다.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::hasColumn('gacha_pulls', 'banner_key') || Schema::table('gacha_pulls', fn (Blueprint $t) => $t->string('banner_key', 64)->nullable());
    }

    public function down(): void
    {
        Schema::hasColumn('gacha_pulls', 'banner_key') && Schema::table('gacha_pulls', fn (Blueprint $t) => $t->dropColumn('banner_key'));
    }
};
