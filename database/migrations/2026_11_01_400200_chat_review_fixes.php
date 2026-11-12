<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 채팅 리뷰 수정.
 * - room_messages.body_raw: true=body가 정규화된 원문(응답 시 이스케이프), false=기존 행처럼 이미 HTML 이스케이프된 값(기본값 false라
 *   기존 행은 그대로 두고 이중 이스케이프를 피한다). 신규 행은 항상 true.
 * - chat_reports: body 스냅샷(원문), counts(제재 카운트 대상 여부: 게스트 신고자·quick 메시지는 false), message_id nullable + nullOnDelete.
 * - users.chat_sanctioned_at: 마지막 자동 제재 시각(이후 신고만 다음 제재에 카운트).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('room_messages', function (Blueprint $table) {
            $table->boolean('body_raw')->default(false);
        });
        Schema::table('chat_reports', function (Blueprint $table) {
            $table->dropForeign(['message_id']);
        });
        Schema::table('chat_reports', function (Blueprint $table) {
            $table->unsignedBigInteger('message_id')->nullable()->change();
            $table->text('body')->nullable();
            $table->boolean('counts')->default(true);
            $table->foreign('message_id')->references('id')->on('room_messages')->nullOnDelete();
        });
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('chat_sanctioned_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('users', fn (Blueprint $t) => $t->dropColumn('chat_sanctioned_at'));
        Schema::table('chat_reports', function (Blueprint $table) {
            $table->dropForeign(['message_id']);
            $table->dropColumn(['body', 'counts']);
        });
        Schema::table('chat_reports', function (Blueprint $table) {
            $table->foreign('message_id')->references('id')->on('room_messages')->cascadeOnDelete();
        });
        Schema::table('room_messages', fn (Blueprint $t) => $t->dropColumn('body_raw'));
    }
};
