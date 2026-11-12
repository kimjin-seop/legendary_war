<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 영웅 호칭(칭호)·짧은 이름. 가산적 변경(nullable)만. 값은 game:seed가 hero_titles.json에서 채운다. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('heroes', function (Blueprint $table) {
            if (! Schema::hasColumn('heroes', 'title')) {
                $table->string('title', 32)->nullable();
            }
            if (! Schema::hasColumn('heroes', 'short_name')) {
                $table->string('short_name', 32)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('heroes', function (Blueprint $table) {
            $table->dropColumn(['title', 'short_name']);
        });
    }
};
