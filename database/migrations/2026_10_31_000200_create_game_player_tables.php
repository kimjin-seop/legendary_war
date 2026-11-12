<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 유저/전투 데이터.
 * PvP 확장: 이후 rooms, room_players 테이블 추가 + battles.room_id(nullable FK) 추가로 확장(이번 단계 미구현).
 */
return new class extends Migration
{
    public function up(): void
    {
        // 게스트: 별도 users 행(is_guest=true)을 소유자로 사용한다. 토큰은 해시만 저장.
        Schema::create('guests', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->unique()->constrained()->cascadeOnDelete();
            $table->string('nickname', 32);
            $table->string('token_hash', 64)->unique();
            $table->timestamp('last_seen_at')->nullable();
            $table->timestamps();
        });

        // 유저 보유 영웅. 유저당 영웅 1행(unique) + 중복 획득 시 shards 증가(조각 전환).
        Schema::create('user_heroes', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('hero_id')->constrained()->restrictOnDelete();
            $table->unsignedInteger('level')->default(1);
            $table->unsignedBigInteger('exp')->default(0);
            $table->unsignedTinyInteger('star')->default(0);     // 돌파(미구현, 확장용)
            $table->unsignedInteger('shards')->default(0);       // 중복 획득 조각
            $table->timestamp('obtained_at')->useCurrent();
            $table->timestamps();
            $table->unique(['user_id', 'hero_id']);
        });

        // 재화: 잔액은 음수 불가(CHECK). 모든 변경은 반드시 DB 트랜잭션 + wallet_transactions 기록과 함께 수행할 것.
        DB::statement('CREATE TABLE wallets (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            currency_code VARCHAR(16) NOT NULL,
            balance INTEGER NOT NULL DEFAULT 0 CHECK (balance >= 0),
            created_at DATETIME NULL,
            updated_at DATETIME NULL,
            UNIQUE (user_id, currency_code)
        )');

        Schema::create('wallet_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('wallet_id')->constrained()->cascadeOnDelete();
            $table->string('reason_code', 32);                   // starter_grant, stage_reward ...
            $table->integer('delta');
            $table->unsignedInteger('balance_after');
            $table->string('ref_type', 32)->nullable();
            $table->unsignedBigInteger('ref_id')->nullable();
            $table->timestamp('created_at')->useCurrent();
            // 같은 사유·참조로 이중 지급 방지(정산 멱등 보조 장치)
            $table->unique(['wallet_id', 'reason_code', 'ref_type', 'ref_id'], 'wallet_tx_idem');
            $table->index(['wallet_id', 'created_at']);
        });

        // 편성(기본 출격 후보). 슬롯 순서 1번 = 지휘관.
        Schema::create('parties', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('slot');
            $table->foreignId('user_hero_id')->constrained('user_heroes')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'slot']);
            $table->unique(['user_id', 'user_hero_id']);
        });

        Schema::create('user_stage_progress', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stage_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('best_stars')->default(0);
            $table->unsignedInteger('clear_count')->default(0);
            $table->timestamp('cleared_at')->nullable();
            $table->timestamps();
            $table->unique(['user_id', 'stage_id']);
        });

        // status: deployment -> in_progress -> finished | abandoned
        Schema::create('battles', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('stage_id')->constrained()->restrictOnDelete();
            $table->foreignId('map_id')->constrained()->restrictOnDelete();
            $table->string('status', 16)->default('deployment');
            $table->unsignedBigInteger('seed');
            $table->unsignedInteger('turn')->default(1);
            $table->char('current_side', 1)->default('a');
            $table->unsignedInteger('version')->default(0);       // 낙관적 락
            $table->char('winner', 1)->nullable();
            $table->json('state');
            $table->json('deployment')->nullable();               // 배치 제출 내용(확정 전)
            $table->json('result')->nullable();                   // 정산 결과
            $table->timestamp('settled_at')->nullable();          // 정산 1회 보장
            $table->timestamps();
            $table->index(['user_id', 'status']);
            $table->index('status');
        });

        // 이벤트 소싱 행동 로그 (seq는 전투 내 단조 증가)
        Schema::create('battle_actions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('battle_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('seq');
            $table->unsignedInteger('turn');
            $table->char('side', 1);
            $table->string('actor', 8);                           // player|bot
            $table->string('type', 16);
            $table->json('payload');
            $table->json('events')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['battle_id', 'seq']);
        });

        Schema::create('audit_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->nullable()->constrained()->nullOnDelete();
            $table->string('action', 32);
            $table->string('entity', 48);
            $table->string('entity_key', 64)->nullable();
            $table->json('before')->nullable();
            $table->json('after')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->index(['entity', 'entity_key']);
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        foreach (['audit_logs', 'battle_actions', 'battles', 'user_stage_progress', 'parties', 'wallet_transactions', 'wallets', 'user_heroes', 'guests'] as $t) {
            Schema::dropIfExists($t);
        }
    }
};
