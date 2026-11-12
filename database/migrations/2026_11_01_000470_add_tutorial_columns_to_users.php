<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 튜토리얼 진행 저장(가산 컬럼 3개). 기존 행은 step=0/done 없음/skipped=false. 롤백 = 3개 컬럼 drop. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            if (! Schema::hasColumn('users', 'tutorial_step')) {
                $table->unsignedSmallInteger('tutorial_step')->default(0);
            }
            if (! Schema::hasColumn('users', 'tutorial_done_at')) {
                $table->timestamp('tutorial_done_at')->nullable();
            }
            if (! Schema::hasColumn('users', 'tutorial_skipped')) {
                $table->boolean('tutorial_skipped')->default(false);
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn(['tutorial_step', 'tutorial_done_at', 'tutorial_skipped']);
        });
    }
};
