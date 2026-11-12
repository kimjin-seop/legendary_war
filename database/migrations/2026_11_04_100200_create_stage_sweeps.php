<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 소탕 로그: request_id 멱등 + 결과 스냅샷. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stage_sweeps', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('request_id', 64);
            $table->foreignId('stage_id')->constrained('stages');
            $table->unsignedSmallInteger('requested');
            $table->unsignedSmallInteger('executed');
            $table->json('result');
            $table->timestamp('created_at')->useCurrent();
            $table->unique(['user_id', 'request_id'], 'stage_sweep_idem');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stage_sweeps');
    }
};
