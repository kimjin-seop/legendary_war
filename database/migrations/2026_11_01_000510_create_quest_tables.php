<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 퀘스트(메인+일일+주간) 진행도. user_quests: (user, quest_code, period_key) 1행(메인 period_key='main', 일일 KST05:00 일자, 주간 월요일 일자).
 * quest_event_log: 이벤트 훅 멱등(같은 (user,event,ref)는 1회만 반영). down: 두 테이블 삭제(진행도 손실, 다른 데이터 무영향).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('user_quests')) {
            Schema::create('user_quests', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('quest_code', 48);
                $table->string('period_key', 16);
                $table->unsignedInteger('progress')->default(0);
                $table->timestamp('claimed_at')->nullable();
                $table->timestamps();
                $table->unique(['user_id', 'quest_code', 'period_key']);
            });
        }
        if (! Schema::hasTable('quest_event_log')) {
            Schema::create('quest_event_log', function (Blueprint $table) {
                $table->id();
                $table->foreignId('user_id')->constrained()->cascadeOnDelete();
                $table->string('event', 32);
                $table->string('ref', 64);
                $table->timestamp('created_at')->nullable();
                $table->unique(['user_id', 'event', 'ref']);
            });
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('quest_event_log');
        Schema::dropIfExists('user_quests');
    }
};
