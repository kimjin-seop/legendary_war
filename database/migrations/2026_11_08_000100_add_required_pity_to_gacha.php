<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 필수 영웅 소프트 천장(docs/GACHA_REQUIRED_PITY_20261108.md). 가산 전용: 컬럼 3개 추가(JSON, 기본 NULL, 기존 행·코드 영향 없음).
 * 롤백 = down() (컬럼 drop). GachaService 는 컬럼이 없으면 이 기능을 끄고 기존 동작을 유지한다.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('gacha_user_states', 'required_pity_counters')) {
            Schema::table('gacha_user_states', fn (Blueprint $t) => $t->json('required_pity_counters')->nullable());   // {hero_code: 그 영웅이 나올 수 있는 풀에서 미획득으로 쌓인 뽑기 수} (유저x영웅)
        }
        Schema::table('gacha_pulls', function (Blueprint $t) {
            Schema::hasColumn('gacha_pulls', 'required_pity_before') || $t->json('required_pity_before')->nullable();
            Schema::hasColumn('gacha_pulls', 'required_pity_after') || $t->json('required_pity_after')->nullable();
        });
    }

    public function down(): void
    {
        Schema::hasColumn('gacha_user_states', 'required_pity_counters') && Schema::table('gacha_user_states', fn (Blueprint $t) => $t->dropColumn('required_pity_counters'));
        Schema::table('gacha_pulls', function (Blueprint $t) {
            Schema::hasColumn('gacha_pulls', 'required_pity_before') && $t->dropColumn('required_pity_before');
            Schema::hasColumn('gacha_pulls', 'required_pity_after') && $t->dropColumn('required_pity_after');
        });
    }
};
