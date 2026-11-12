<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 클라이언트 에러 리포트(개인정보 미수집: 사용자 id·IP·쿼리스트링 저장 안 함). 같은 fingerprint 는 하루 1행에 count 누적. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('client_errors', function (Blueprint $table) {
            $table->id();
            $table->string('period_key', 10);                 // KST 05:00 기준 일자
            $table->string('fingerprint', 40);                // sha1(level|message|stack 첫 줄|scene)
            $table->string('level', 8)->default('error');     // error | warn
            $table->string('message', 300);
            $table->text('stack')->nullable();                // 최대 2000자
            $table->string('scene', 64)->nullable();
            $table->string('path', 120)->nullable();          // URL 경로만(쿼리·해시 제거)
            $table->string('app_version', 32)->nullable();
            $table->string('platform', 64)->nullable();       // 클라이언트가 보낸 간단 표기(예: 'ios-safari')
            $table->unsignedInteger('count')->default(1);
            $table->timestamp('first_seen_at')->useCurrent();
            $table->timestamp('last_seen_at')->useCurrent();
            $table->unique(['period_key', 'fingerprint']);
            $table->index('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('client_errors');
    }
};
