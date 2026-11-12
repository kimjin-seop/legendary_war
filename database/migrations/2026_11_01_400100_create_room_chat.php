<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 방 채팅(pvp 상대 채팅). 폴링 방식.
 * - room_messages.user_id는 내부용(응답에 노출하지 않음). hidden_from_side = 상대가 뮤트 중이라 노출하지 않을 쪽, deleted_at = 소프트 삭제.
 * - room_players.chat_muted / chat_last_seen_id, users.chat_restricted_until(신고 누적 시 자동 제한 만료 시각).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('room_messages', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('side', 1);                              // a|b
            $table->string('kind', 8);                            // text | quick
            $table->string('quick_id', 24)->nullable();
            $table->string('body', 400);                          // 정규화 + HTML 이스케이프 후 저장
            $table->char('hidden_from_side', 1)->nullable();      // 수신자가 뮤트라 숨길 쪽
            $table->timestamp('created_at')->useCurrent();
            $table->timestamp('deleted_at')->nullable();
            $table->index(['room_id', 'id']);
            $table->index(['user_id', 'created_at']);
        });

        Schema::create('chat_reports', function (Blueprint $table) {
            $table->id();
            $table->foreignId('reporter_user_id')->constrained('users')->cascadeOnDelete();
            $table->foreignId('message_id')->constrained('room_messages')->cascadeOnDelete();
            $table->foreignId('target_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('reason', 16);
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['reporter_user_id', 'message_id']);
            $table->index(['target_user_id', 'created_at']);
        });

        Schema::table('room_players', function (Blueprint $table) {
            $table->boolean('chat_muted')->default(false);
            $table->unsignedBigInteger('chat_last_seen_id')->default(0);
        });
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('chat_restricted_until')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('chat_restricted_until'));
        Schema::table('room_players', fn (Blueprint $t) => $t->dropColumn(['chat_muted', 'chat_last_seen_id']));
        Schema::dropIfExists('chat_reports');
        Schema::dropIfExists('room_messages');
    }
};
