<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 스테이지 단위 규칙 오버라이드(stages.rules, JSON nullable): 맵 rules 허용 키 + max_turns. null이면 기존 동작.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::hasColumn('stages', 'rules') || Schema::table('stages', fn (Blueprint $t) => $t->json('rules')->nullable());
    }

    public function down(): void
    {
        Schema::hasColumn('stages', 'rules') && Schema::table('stages', fn (Blueprint $t) => $t->dropColumn('rules'));
    }
};
