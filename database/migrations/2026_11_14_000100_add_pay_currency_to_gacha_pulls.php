<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 뽑기 펜 결제 지원: gacha_pulls 에 결제 통화(pay_currency, 기본 gold)·펜 사용량(pen_spent) 추가. 가산 전용·멱등.
 * 기존 행은 gold 결제로 간주(기본값). 컬럼이 없으면 GachaService 는 펜 결제를 503 gacha_pen_unavailable 로 거부하고 골드 결제만 동작한다.
 * 개발/운영 DB 적용은 팀장 지시·사용자 승인 후.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::hasColumn('gacha_pulls', 'pay_currency') || Schema::table('gacha_pulls', fn (Blueprint $t) => $t->string('pay_currency', 8)->default('gold'));
        Schema::hasColumn('gacha_pulls', 'pen_spent') || Schema::table('gacha_pulls', fn (Blueprint $t) => $t->unsignedInteger('pen_spent')->default(0));
    }

    public function down(): void
    {
        foreach (['pay_currency', 'pen_spent'] as $c) {
            Schema::hasColumn('gacha_pulls', $c) && Schema::table('gacha_pulls', fn (Blueprint $t) => $t->dropColumn($c));
        }
    }
};
