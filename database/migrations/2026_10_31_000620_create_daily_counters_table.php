<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 일일 상한 카운터(자유 대전 보상, IP당 게스트 생성). period_key = KST 05:00 기준 일자(App\Support\Period). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('daily_counters', function (Blueprint $table) {
            $table->id();
            $table->string('scope', 96);
            $table->string('period_key', 10);
            $table->unsignedInteger('value')->default(0);
            $table->timestamps();
            $table->unique(['scope', 'period_key']);
            $table->index('period_key');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('daily_counters');
    }
};
