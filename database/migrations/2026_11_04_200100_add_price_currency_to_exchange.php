<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 교환소 결제 재화(add-only): price_currency = gold(기본) | pen. 가격 수치 컬럼은 기존 price_gold 를 '가격 수량'으로 계속 사용한다. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('exchange_products', function (Blueprint $t) {
            $t->string('price_currency', 24)->default('gold');
        });
        Schema::table('exchange_purchases', function (Blueprint $t) {
            $t->string('price_currency', 24)->default('gold');
        });
    }

    public function down(): void
    {
        Schema::table('exchange_purchases', fn (Blueprint $t) => $t->dropColumn('price_currency'));
        Schema::table('exchange_products', fn (Blueprint $t) => $t->dropColumn('price_currency'));
    }
};
