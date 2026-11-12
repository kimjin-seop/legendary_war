<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 일일 교환소: 상품(어드민 관리) + 구매 로그(request_id 멱등, 가격 스냅샷). 한도는 daily_counters(KST 05:00). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('exchange_products', function (Blueprint $table) {
            $table->id();
            $table->string('code', 40)->unique();
            $table->string('name_ko', 64);
            $table->string('description', 255)->nullable();
            $table->string('kind', 16);                       // equipment(payload.equipment_code) | currency(payload.currency, payload.amount)
            $table->json('payload');
            $table->unsignedInteger('price_gold');            // 가격은 서버(이 테이블)만 신뢰
            $table->unsignedInteger('daily_limit')->default(0);   // 유저당 일일(KST 05:00) 구매 횟수, 0=무제한
            $table->boolean('enabled')->default(true);
            $table->unsignedInteger('sort_order')->default(0);
            $table->timestamps();
        });
        Schema::create('exchange_purchases', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('request_id', 64);
            $table->foreignId('product_id')->constrained('exchange_products');
            $table->unsignedInteger('price_gold');
            $table->string('period_key', 10);
            $table->json('granted')->nullable();
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['user_id', 'request_id'], 'exchange_purchase_idem');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('exchange_purchases');
        Schema::dropIfExists('exchange_products');
    }
};
