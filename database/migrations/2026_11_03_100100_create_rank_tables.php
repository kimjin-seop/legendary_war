<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 멀티 랭크/대기열(P5): 가산 테이블 4개만 추가한다(기존 테이블 변경 없음).
 * rank_seasons(시즌), rank_ratings(시즌별 유저 레이팅), rank_queue(대기열), rank_matches(매치 기록·레이팅 변동).
 * 롤백 = 4개 테이블 drop(기존 rooms/battles 데이터는 그대로).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('rank_seasons', function (Blueprint $t) {
            $t->id();
            $t->string('name', 40);
            $t->timestamp('starts_at');
            $t->timestamp('ends_at');
            $t->string('status', 8)->default('active');   // active | ended
            $t->timestamps();
            $t->index(['status', 'ends_at']);
        });

        Schema::create('rank_ratings', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained('rank_seasons')->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->integer('rating');
            $t->integer('peak_rating');
            $t->unsignedInteger('wins')->default(0);
            $t->unsignedInteger('losses')->default(0);
            $t->unsignedInteger('draws')->default(0);
            $t->timestamp('last_match_at')->nullable();
            $t->timestamps();
            $t->unique(['season_id', 'user_id']);
            $t->index(['season_id', 'rating']);
        });

        Schema::create('rank_queue', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();   // 1인 1대기
            $t->integer('rating');                                                  // 등록 시점 레이팅 스냅샷
            $t->timestamp('queued_at');
            $t->timestamp('last_polled_at');                                        // 유령 대기 판별
            $t->timestamps();
            $t->index('queued_at');
        });

        Schema::create('rank_matches', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained('rank_seasons')->cascadeOnDelete();
            $t->foreignId('room_id')->nullable()->constrained('rooms')->nullOnDelete();
            $t->unsignedBigInteger('battle_id')->nullable()->index();
            $t->foreignId('user_a_id')->constrained('users')->cascadeOnDelete();   // side a(방장, 선공)
            $t->foreignId('user_b_id')->constrained('users')->cascadeOnDelete();
            $t->integer('rating_a_before');
            $t->integer('rating_b_before');
            $t->integer('rating_a_after')->nullable();
            $t->integer('rating_b_after')->nullable();
            $t->string('status', 8)->default('active');   // active | settled | void
            $t->string('result', 8)->nullable();          // a | b | draw (settled만)
            $t->string('reason', 24)->nullable();         // normal | forfeit_* | void 사유
            $t->timestamp('settled_at')->nullable();
            $t->timestamps();
            $t->index(['status', 'created_at']);
            $t->index('user_a_id');
            $t->index('user_b_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('rank_matches');
        Schema::dropIfExists('rank_queue');
        Schema::dropIfExists('rank_ratings');
        Schema::dropIfExists('rank_seasons');
    }
};
