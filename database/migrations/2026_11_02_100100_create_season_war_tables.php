<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 시즌 전쟁 수직 슬라이스. 시나리오/영토 정의는 database/data/war/*.json(DB 테이블 없음), 여기엔 시즌 인스턴스만 둔다.
 * 이식성: CHECK·부분 인덱스·JSON 쿼리 사용 안 함(상태 문자열은 앱 레벨 검증).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('seasons', function (Blueprint $t) {
            $t->id();
            $t->string('scenario_code', 32);
            $t->string('name', 80);
            $t->string('status', 16)->default('active');   // scheduled|active|ended
            $t->timestamp('start_at')->nullable();
            $t->timestamp('end_at')->nullable();
            $t->json('settings')->nullable();
            $t->timestamps();
            $t->index('status');
        });
        Schema::create('season_countries', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->string('country_code', 32);
            $t->unsignedInteger('score')->default(0);
            $t->unsignedInteger('member_count')->default(0);
            $t->timestamps();
            $t->unique(['season_id', 'country_code']);
        });
        Schema::create('season_members', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->foreignId('season_country_id')->constrained('season_countries')->cascadeOnDelete();
            $t->unsignedInteger('contribution')->default(0);
            $t->timestamp('joined_at')->nullable();
            $t->timestamps();
            $t->unique(['season_id', 'user_id']);
        });
        Schema::create('season_territories', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->string('territory_code', 48);
            $t->foreignId('owner_season_country_id')->constrained('season_countries');
            $t->string('state', 16)->default('peace');   // peace|siege
            $t->unsignedBigInteger('siege_season_country_id')->nullable();
            $t->unsignedSmallInteger('occupation')->default(0);
            $t->timestamp('last_battle_at')->nullable();
            $t->unsignedInteger('version')->default(0);
            $t->timestamps();
            $t->unique(['season_id', 'territory_code']);
            $t->index(['season_id', 'owner_season_country_id']);
        });
        Schema::create('territory_battles', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->foreignId('season_territory_id')->constrained('season_territories')->cascadeOnDelete();
            $t->foreignId('battle_id')->nullable()->unique()->constrained('battles')->nullOnDelete();   // nullable unique: 시즌 전투 식별 + 1전투 1행
            $t->string('source', 12)->default('player');
            $t->unsignedBigInteger('seed')->nullable();
            $t->unsignedBigInteger('attacker_sc_id');
            $t->unsignedBigInteger('defender_sc_id');
            $t->unsignedBigInteger('attacker_user_id')->nullable();
            $t->unsignedBigInteger('defender_user_id')->nullable();
            $t->string('defender_kind', 12)->default('garrison');   // ghost|garrison
            $t->string('result', 12)->nullable();                   // att_win|def_win|draw
            $t->smallInteger('occ_before')->nullable();
            $t->smallInteger('occ_after')->nullable();
            $t->smallInteger('occ_delta')->nullable();
            $t->boolean('captured')->default(false);
            $t->timestamp('settled_at')->nullable();
            $t->timestamps();
            $t->index(['season_id', 'created_at']);
            $t->index(['attacker_user_id', 'created_at']);
        });
        Schema::create('territory_occupation_logs', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->foreignId('season_territory_id')->constrained('season_territories')->cascadeOnDelete();
            $t->string('kind', 16);   // battle|capture|stagnation|admin|reset
            $t->smallInteger('occ_before');
            $t->smallInteger('occ_after');
            $t->unsignedBigInteger('owner_before_sc_id')->nullable();
            $t->unsignedBigInteger('owner_after_sc_id')->nullable();
            $t->unsignedBigInteger('ref_territory_battle_id')->nullable();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['season_territory_id', 'id']);
        });
        Schema::create('territory_contributions', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->unsignedBigInteger('season_country_id');
            $t->unsignedBigInteger('season_territory_id');
            $t->foreignId('territory_battle_id')->nullable()->constrained('territory_battles')->cascadeOnDelete();
            $t->string('kind', 16);   // attack_win|capture_bonus
            $t->integer('points');
            $t->timestamp('created_at')->useCurrent();
            $t->unique(['territory_battle_id', 'user_id', 'kind']);   // 중복 지급 방지
        });
        Schema::create('season_country_scores', function (Blueprint $t) {
            $t->id();
            $t->foreignId('season_id')->constrained()->cascadeOnDelete();
            $t->foreignId('season_country_id')->constrained('season_countries')->cascadeOnDelete();
            $t->string('kind', 16);   // capture|bonus|adjust
            $t->integer('points');
            $t->unsignedBigInteger('season_territory_id')->nullable();
            $t->foreignId('territory_battle_id')->nullable()->constrained('territory_battles')->cascadeOnDelete();
            $t->timestamp('created_at')->useCurrent();
            $t->index(['season_id', 'season_country_id']);
        });
    }

    public function down(): void
    {
        foreach (['season_country_scores', 'territory_contributions', 'territory_occupation_logs', 'territory_battles', 'season_territories', 'season_members', 'season_countries', 'seasons'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
