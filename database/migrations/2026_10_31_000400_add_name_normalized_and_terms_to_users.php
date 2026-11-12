<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** 캐릭터명 유니크(대소문자 무시)용 name_normalized + 약관 동의 시각. 게스트는 NULL(유니크 제외). */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('name_normalized', 64)->nullable()->unique()->after('name');
            $table->timestamp('terms_accepted_at')->nullable()->after('is_guest');
        });
        // 기존 회원 backfill (중복이 있으면 유니크 위반으로 마이그레이션이 실패하므로 사전 확인 필요)
        foreach (DB::table('users')->where('is_guest', false)->get(['id', 'name']) as $u) {
            DB::table('users')->where('id', $u->id)->update(['name_normalized' => mb_strtolower(trim($u->name))]);
        }
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropUnique(['name_normalized']);
            $table->dropColumn(['name_normalized', 'terms_accepted_at']);
        });
    }
};
