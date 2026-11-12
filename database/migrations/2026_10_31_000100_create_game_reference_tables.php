<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 게임 설정(참조) 테이블. 런타임 기준은 DB이고 database/data/*.json 은 초기 시드 원본이다.
 * 모든 수치는 '시작값'이며 어드민 API로 수정 가능(audit_logs 기록).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('role', 16)->default('user')->after('password');          // user | admin
            $table->timestamp('banned_at')->nullable()->after('role');                // 정지 시각
            $table->boolean('is_guest')->default(false)->after('banned_at');          // 게스트 계정(placeholder 이메일)
            $table->unsignedInteger('level')->default(1)->after('is_guest');          // 유저 레벨
            $table->unsignedBigInteger('exp')->default(0)->after('level');
            $table->index('role');
        });

        Schema::create('unit_types', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name', 64);
            $table->unsignedTinyInteger('move');
            $table->unsignedTinyInteger('range_min');
            $table->unsignedTinyInteger('range_max');
            $table->unsignedInteger('hp');
            $table->unsignedInteger('atk');
            $table->unsignedInteger('def');
            $table->string('move_type', 16);                 // foot|mounted|heavy|flying
            $table->unsignedInteger('heal')->default(0);
            $table->timestamps();
        });

        Schema::create('matchup_rules', function (Blueprint $table) {
            $table->id();
            $table->foreignId('attacker_unit_type_id')->constrained('unit_types')->restrictOnDelete();
            $table->foreignId('defender_unit_type_id')->constrained('unit_types')->restrictOnDelete();
            $table->decimal('multiplier', 4, 2);
            $table->timestamps();
            $table->unique(['attacker_unit_type_id', 'defender_unit_type_id'], 'matchup_unique');
        });

        Schema::create('terrains', function (Blueprint $table) {
            $table->id();
            $table->string('code', 32)->unique();
            $table->string('name', 64);
            $table->char('symbol', 1)->unique();
            $table->timestamps();
        });

        Schema::create('terrain_modifiers', function (Blueprint $table) {
            $table->id();
            $table->foreignId('terrain_id')->constrained()->cascadeOnDelete();
            $table->string('move_type', 16);
            $table->unsignedTinyInteger('move_cost')->nullable();   // null = 통행 불가
            $table->integer('def_pct')->default(0);
            $table->timestamps();
            $table->unique(['terrain_id', 'move_type']);
        });

        Schema::create('skills', function (Blueprint $table) {
            $table->id();
            $table->string('code', 48)->unique();
            $table->string('name', 64);
            $table->string('type', 16);                      // active|passive
            $table->json('params');
            $table->string('description')->nullable();
            $table->timestamps();
        });

        Schema::create('auras', function (Blueprint $table) {
            $table->id();
            $table->string('code', 48)->unique();
            $table->string('name', 64);
            $table->unsignedTinyInteger('radius');
            $table->integer('atk_pct')->default(0);
            $table->integer('def_pct')->default(0);
            $table->timestamps();
        });

        Schema::create('heroes', function (Blueprint $table) {
            $table->id();
            $table->string('code', 48)->unique();
            $table->string('name_ko', 64);
            $table->string('name_en', 96);
            $table->integer('born')->nullable();             // 음수 = 기원전
            $table->integer('died')->nullable();
            $table->string('era', 32)->nullable();
            $table->string('region', 16)->nullable();
            $table->foreignId('unit_type_id')->constrained('unit_types')->restrictOnDelete();
            $table->string('rarity', 4)->default('R');       // 생성 시점 값(R/SR/SSR). 이후 2026_10_31_001000 에서 S/A/B/C로 변환
            $table->unsignedTinyInteger('cost')->default(3); // 출전 코스트(시작값)
            $table->integer('hp_bonus')->default(0);
            $table->integer('atk_bonus')->default(0);
            $table->integer('def_bonus')->default(0);
            $table->decimal('growth_hp_pct', 5, 2)->default(3);   // 레벨당 상승률(%)
            $table->decimal('growth_atk_pct', 5, 2)->default(3);
            $table->decimal('growth_def_pct', 5, 2)->default(3);
            $table->foreignId('skill_id')->nullable()->constrained('skills')->nullOnDelete();
            $table->foreignId('aura_id')->nullable()->constrained('auras')->nullOnDelete();
            $table->boolean('verify')->default(false);       // 사실 재확인 필요 플래그
            $table->string('note')->nullable();
            $table->timestamps();
            $table->index('rarity');
        });

        Schema::create('maps', function (Blueprint $table) {
            $table->id();
            $table->string('code', 48)->unique();
            $table->string('name', 64);
            $table->unsignedTinyInteger('width');
            $table->unsignedTinyInteger('height');
            $table->json('tiles');                           // 행 문자열 배열 (terrains.symbol)
            $table->json('spawns');                          // 진영별 기본 배치(적 초기 배치)
            $table->json('deploy_zones');                    // 진영별 배치 가능 좌표
            $table->timestamps();
        });

        Schema::create('presets', function (Blueprint $table) {
            $table->id();
            $table->string('code', 48)->unique();
            $table->string('name', 64);
            $table->foreignId('hero_id')->constrained()->restrictOnDelete();
            $table->json('units');                           // 부대 병종 코드 목록
            $table->timestamps();
        });

        Schema::create('hero_levels', function (Blueprint $table) {
            $table->unsignedInteger('level')->primary();
            $table->unsignedInteger('exp_to_next');
        });

        // 유저 레벨 곡선 + 편성 코스트 상한 (어드민 수정 가능)
        Schema::create('user_level_costs', function (Blueprint $table) {
            $table->unsignedInteger('level')->primary();
            $table->unsignedInteger('exp_to_next');
            $table->unsignedInteger('max_cost');
        });

        Schema::create('stages', function (Blueprint $table) {
            $table->id();
            $table->string('code', 48)->unique();
            $table->string('name', 64);
            $table->foreignId('map_id')->constrained()->restrictOnDelete();
            $table->foreignId('enemy_preset_id')->constrained('presets')->restrictOnDelete();
            $table->unsignedInteger('recommended_level');
            $table->unsignedInteger('enemy_level');
            $table->unsignedInteger('reward_exp');
            $table->unsignedInteger('reward_user_exp')->default(0);
            $table->unsignedInteger('reward_gold');
            $table->foreignId('prerequisite_stage_id')->nullable()->constrained('stages')->nullOnDelete();
            $table->unsignedTinyInteger('difficulty')->default(1);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index('sort_order');
        });
    }

    public function down(): void
    {
        foreach (['stages', 'user_level_costs', 'hero_levels', 'presets', 'maps', 'heroes', 'auras', 'skills', 'terrain_modifiers', 'terrains', 'matchup_rules', 'unit_types'] as $t) {
            Schema::dropIfExists($t);
        }
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['role']);
            $table->dropColumn(['role', 'banned_at', 'is_guest', 'level', 'exp']);
        });
    }
};
