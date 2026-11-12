<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 장비·상점 신규 테이블 4개(가산 전용, 기존 테이블 변경 없음). 롤백 = 4개 테이블 drop(migrate:rollback --path). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('equipment_items')) Schema::create('equipment_items', function (Blueprint $table) {   // 장비 정의(database/data/equipment_*.json -> game:seed)
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('slot', 16);                       // helm|armor|gloves|boots|accessory
            $table->string('rarity', 2);                      // C|B|A|S
            $table->smallInteger('hp')->default(0);
            $table->smallInteger('atk')->default(0);
            $table->smallInteger('def')->default(0);
            $table->unsignedSmallInteger('req_level')->default(1);
            $table->unsignedInteger('price_gold')->default(0);
            $table->string('name_ko', 60);
            $table->text('description')->nullable();
            $table->string('culture', 20)->nullable();
            $table->string('evidence_level', 20)->nullable();
            $table->boolean('enabled')->default(true);
            $table->unsignedSmallInteger('sort_order')->default(0);
            $table->timestamps();
            $table->index(['slot', 'rarity']);
        });

        if (! Schema::hasTable('user_equipment')) Schema::create('user_equipment', function (Blueprint $table) {   // 보유 개체(같은 code 여러 행)
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('equipment_item_id')->constrained('equipment_items');
            $table->timestamp('acquired_at')->useCurrent();
            $table->string('source', 24)->default('shop');
            $table->timestamps();
            $table->index(['user_id', 'equipment_item_id']);
        });

        if (! Schema::hasTable('hero_equipment')) Schema::create('hero_equipment', function (Blueprint $table) {   // 영웅별 장착(슬롯당 1, 개체는 1영웅에만)
            $table->id();
            $table->foreignId('user_hero_id')->constrained('user_heroes')->cascadeOnDelete();
            $table->string('slot', 16);
            $table->foreignId('user_equipment_id')->unique()->constrained('user_equipment')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_hero_id', 'slot']);
        });

        if (! Schema::hasTable('equipment_purchases')) Schema::create('equipment_purchases', function (Blueprint $table) {   // 구매 로그(멱등 + 가격 스냅샷)
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('request_id', 64);
            $table->foreignId('equipment_item_id')->constrained('equipment_items');
            $table->unsignedBigInteger('user_equipment_id');
            $table->unsignedInteger('price_gold');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['user_id', 'request_id'], 'equip_purchase_idem');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_purchases');
        Schema::dropIfExists('hero_equipment');
        Schema::dropIfExists('user_equipment');
        Schema::dropIfExists('equipment_items');
    }
};
