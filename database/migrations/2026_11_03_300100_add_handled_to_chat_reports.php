<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 채팅 신고 처리 상태(관리자 검토 큐). 기존 행은 모두 미처리(null). 롤백 = 컬럼 drop. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('chat_reports', function (Blueprint $table) {
            $table->timestamp('handled_at')->nullable()->index();
            $table->unsignedBigInteger('handled_by_user_id')->nullable();
            $table->string('handled_action', 16)->nullable();   // deleted|dismissed|sanctioned|resolved
        });
    }

    public function down(): void
    {
        Schema::table('chat_reports', function (Blueprint $table) {
            $table->dropIndex(['handled_at']);
            $table->dropColumn(['handled_at', 'handled_by_user_id', 'handled_action']);
        });
    }
};
