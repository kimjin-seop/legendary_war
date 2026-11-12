<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 공지(announcements) + 점검 모드 등 단순 키-값 설정(app_settings). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('announcements', function (Blueprint $table) {
            $table->id();
            $table->string('kind', 16)->default('notice');   // notice | event | maintenance
            $table->string('title', 100);
            $table->text('body');
            $table->boolean('pinned')->default(false);
            $table->boolean('enabled')->default(true);
            $table->timestamp('starts_at')->nullable();     // null = 즉시
            $table->timestamp('ends_at')->nullable();       // null = 무기한
            $table->foreignId('created_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
            $table->index(['enabled', 'starts_at', 'ends_at']);
        });
        Schema::create('app_settings', function (Blueprint $table) {
            $table->string('key', 64)->primary();
            $table->json('value');
            $table->timestamp('updated_at')->nullable();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('app_settings');
        Schema::dropIfExists('announcements');
    }
};
