<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 시즌 전쟁 2단계: 전황 이벤트, 시즌 결과 스냅샷, 정체 감소 기준 시각, 시즌 종료 정보. 기존 마이그레이션은 수정하지 않는다. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('war_events', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->string('type', 24);   // siege_start|capital_siege|capture|capital_fall|siege_end|ai_attack|season_end
            $t->unsignedBigInteger('season_country_id')->nullable();
            $t->unsignedBigInteger('season_territory_id')->nullable();
            $t->unsignedBigInteger('user_id')->nullable();
            $t->json('payload')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['season_id', 'id']);
        });
        Schema::create('season_results', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->unique()->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('winner_season_country_id')->nullable();
            $t->json('payload');   // 최종 순위·MVP·상위 기여자 요약 스냅샷(시즌 종료 시 1회)
            $t->timestamp('created_at')->useCurrent();
        });
        Schema::table('season_territories', function (Blueprint $t) {
            $t->timestamp('last_decay_at')->nullable();
        });
        Schema::table('seasons', function (Blueprint $t) {
            $t->unsignedBigInteger('winner_season_country_id')->nullable();
            $t->timestamp('ended_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('seasons', function (Blueprint $t) {
            $t->dropColumn(['winner_season_country_id', 'ended_at']);
        });
        Schema::table('season_territories', function (Blueprint $t) {
            $t->dropColumn('last_decay_at');
        });
        Schema::dropIfExists('season_results');
        Schema::dropIfExists('war_events');
    }
};
