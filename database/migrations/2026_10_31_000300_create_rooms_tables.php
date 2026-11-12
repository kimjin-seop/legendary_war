<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 방(룸): solo(컴퓨터 자유 대전) / pvp(2인). 전투(battles)는 room_id로 연결되며 방 전용 API로만 조작한다.
 * rooms.battle_id는 순환 FK를 피하려고 FK 없이 인덱스만 둔다(battles.room_id가 FK).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rooms', function (Blueprint $table) {
            $table->id();
            $table->string('code', 12)->unique();                 // 추측 어려운 난수 코드(32자 알파벳 8자리)
            $table->foreignId('host_user_id')->constrained('users')->cascadeOnDelete();
            $table->string('mode', 8);                            // solo | pvp
            $table->string('visibility', 8)->default('private');  // public | private
            $table->string('status', 16)->default('waiting');     // waiting|deployment|in_progress|finished|closed
            $table->foreignId('map_id')->constrained()->restrictOnDelete();
            $table->unsignedBigInteger('battle_id')->nullable()->index();
            $table->unsignedSmallInteger('turn_limit_seconds')->default(60);   // 시작값
            $table->unsignedSmallInteger('disconnect_seconds')->default(90);   // 시작값
            $table->timestamps();
            $table->index(['status', 'visibility', 'mode']);
        });

        Schema::create('room_players', function (Blueprint $table) {
            $table->id();
            $table->foreignId('room_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->char('side', 1);                              // a=방장, b=참가자
            $table->boolean('ready')->default(false);
            $table->boolean('confirmed')->default(false);         // 배치 확정
            $table->json('deployment')->nullable();
            $table->timestamp('last_seen_at')->nullable();        // 폴링/행동 시각(접속 판단)
            $table->unsignedTinyInteger('missed_turns')->default(0);   // 연속 미응답 턴 수
            $table->timestamps();
            $table->unique(['room_id', 'user_id']);
            $table->unique(['room_id', 'side']);
            $table->index('user_id');
        });

        Schema::table('battles', function (Blueprint $table) {
            $table->unsignedBigInteger('stage_id')->nullable()->change();   // 자유/PvP 전투는 스테이지 없음
        });
        Schema::table('battles', function (Blueprint $table) {
            $table->string('mode', 8)->default('stage')->after('user_id');  // stage | free | pvp
            $table->foreignId('opponent_user_id')->nullable()->after('user_id')->constrained('users')->nullOnDelete();
            $table->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
            $table->timestamp('turn_deadline_at')->nullable();
            $table->index('room_id');
        });
    }

    public function down(): void
    {
        Schema::table('battles', function (Blueprint $table) {
            $table->dropConstrainedForeignId('room_id');
            $table->dropConstrainedForeignId('opponent_user_id');
            $table->dropColumn(['mode', 'turn_deadline_at']);
        });
        Schema::dropIfExists('room_players');
        Schema::dropIfExists('rooms');
    }
};
