<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 영웅 별 강화 감사·멱등 로그. unique(user_id, request_id)로 재전송 replay. 가산 전용(신규 테이블).
 * 테이블이 없으면 HeroStarService 는 404 star_disabled 로 거부한다. 개발/운영 DB 적용은 팀장 지시·사용자 승인 후.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::hasTable('hero_star_ups') || Schema::create('hero_star_ups', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('user_hero_id');
            $t->unsignedBigInteger('hero_id');
            $t->string('request_id', 64);
            $t->unsignedTinyInteger('star_before');
            $t->unsignedTinyInteger('star_after');
            $t->unsignedInteger('shards_spent');
            $t->unsignedInteger('gold_spent');
            $t->unsignedInteger('shards_after');
            $t->timestamp('created_at')->useCurrent();
            $t->unique(['user_id', 'request_id'], 'hero_star_up_idem');
            $t->index(['user_hero_id', 'id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('hero_star_ups');
    }
};
