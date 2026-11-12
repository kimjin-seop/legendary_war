<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * PvP 인정 여부(settle 시 계산해 저장: 최소 라운드·양측 행동·상대쌍 일일 상한 통과). 주간 랭킹 집계가 이 값을 조회한다.
 * 가산 컬럼, 기존 행은 default true(이전 집계 결과 유지). 롤백 = 컬럼 drop.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('battles', 'pvp_recognized')) {
            Schema::table('battles', fn (Blueprint $t) => $t->boolean('pvp_recognized')->default(true));
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('battles', 'pvp_recognized')) {
            Schema::table('battles', fn (Blueprint $t) => $t->dropColumn('pvp_recognized'));
        }
    }
};
