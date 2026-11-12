<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * maps.rules: 맵별 규칙 오버라이드(선택 JSON, null=전역 config). 허용 키는 Engine::MAP_RULE_KEYS.
 * down: 컬럼 삭제(오버라이드 값만 손실).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('maps', 'rules')) {
            Schema::table('maps', function (Blueprint $table) {
                $table->json('rules')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('maps', 'rules')) {
            Schema::table('maps', function (Blueprint $table) {
                $table->dropColumn('rules');
            });
        }
    }
};
