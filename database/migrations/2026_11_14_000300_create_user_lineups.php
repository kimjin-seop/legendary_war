<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 영웅 '편성 라인업'(최대 5명): 캠페인 출정 시 부대 지정 후보 풀. parties(마지막 출격 구성)와 별개.
 * 영웅 삭제 시 user_hero_id FK cascade 로 정리, 유저 삭제 시 함께 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('user_lineups')) {
            return;
        }
        Schema::create('user_lineups', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->unsignedTinyInteger('slot');
            $table->foreignId('user_hero_id')->constrained('user_heroes')->cascadeOnDelete();
            $table->timestamps();
            $table->unique(['user_id', 'slot']);
            $table->unique(['user_id', 'user_hero_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('user_lineups');
    }
};
