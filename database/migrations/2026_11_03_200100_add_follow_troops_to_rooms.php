<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 방 옵션: 병사 자동 따라가기(end_turn follow) 허용 여부. 방 생성자가 정하며 양측 동일 적용. 기존 방은 false. 롤백 = 컬럼 drop. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->boolean('follow_troops')->default(false);
        });
    }

    public function down(): void
    {
        Schema::table('rooms', function (Blueprint $table) {
            $table->dropColumn('follow_troops');
        });
    }
};
