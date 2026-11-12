<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 전투 소모품: 사용자별 보유 수량 + 구매 로그(멱등 request_id, 지갑 원장 ref). docs/BATTLE_ITEMS_SPEC.md */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('user_items', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('item_code', 40);
            $t->unsignedInteger('qty')->default(0);
            $t->timestamps();
            $t->unique(['user_id', 'item_code']);
        });
        Schema::create('item_purchases', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained()->cascadeOnDelete();
            $t->string('request_id', 64);
            $t->string('item_code', 40);
            $t->unsignedInteger('qty');
            $t->unsignedInteger('price_gold');
            $t->timestamp('created_at')->nullable();
            $t->unique(['user_id', 'request_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('item_purchases');
        Schema::dropIfExists('user_items');
    }
};
