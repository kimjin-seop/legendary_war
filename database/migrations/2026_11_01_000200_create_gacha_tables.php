<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 가챠 신규 테이블(가산 전용, 기존 테이블 변경 없음). 롤백 = 두 테이블 drop. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('gacha_pulls')) Schema::create('gacha_pulls', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('request_id', 64);                       // 클라이언트 생성 멱등키
            $table->unsignedInteger('pool_version');
            $table->json('rates_snapshot');                         // 당시 등급 확률(%)
            $table->unsignedTinyInteger('pull_count');              // 1 | 10
            $table->json('results');                                // 지급 결과 목록
            $table->unsignedInteger('gold_spent');
            $table->unsignedInteger('pity_before');
            $table->unsignedInteger('pity_after');
            $table->boolean('pity_applied')->default(false);        // 10연 보장 슬롯 재추첨 여부
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['user_id', 'request_id'], 'gacha_pull_idem');
            $table->index(['user_id', 'id']);
        });

        if (! Schema::hasTable('gacha_user_states')) Schema::create('gacha_user_states', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->unsignedInteger('pity_counter')->default(0);    // A 이상 연속 미출현 횟수(표시용)
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('gacha_user_states');
        Schema::dropIfExists('gacha_pulls');
    }
};
