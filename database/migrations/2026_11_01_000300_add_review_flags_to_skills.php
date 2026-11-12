<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 스킬 검수 표식(가산 컬럼만, 기존 컬럼 불변).
 * needs_verify: 역사 사건 암시로 사람 확인이 필요한 스킬(hv). 효과는 켜되 API 응답에서 flavor를 숨긴다.
 * review_status: null=일반, pending_review=근거 보류(enabled=0 보존, API 목록 제외).
 * down: 두 컬럼 삭제(표식 소실, 스킬/연결 데이터는 유지).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('skills', function (Blueprint $table) {
            if (! Schema::hasColumn('skills', 'needs_verify')) {
                $table->boolean('needs_verify')->default(false);
            }
            if (! Schema::hasColumn('skills', 'review_status')) {
                $table->string('review_status', 16)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('skills', function (Blueprint $table) {
            $cols = array_values(array_filter(['needs_verify', 'review_status'], fn ($c) => Schema::hasColumn('skills', $c)));
            $cols && $table->dropColumn($cols);
        });
    }
};
