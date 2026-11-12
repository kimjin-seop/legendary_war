<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * 영웅 등급 체계 변경: SSR->S, SR->A, R->B (신규 C는 데이터 없음). 데이터 마이그레이션만 수행.
 * 컬럼은 string(4) 유지. DB CHECK는 추가하지 않음(앱 레벨 검증 + SQLite 테이블 재생성 리스크 회피).
 * 순서 주의: 단일 UPDATE CASE로 처리해 R->B 와 SR->A 연쇄 충돌을 방지한다. 신 등급 값은 건드리지 않음(멱등).
 */
return new class extends Migration
{
    public function up(): void
    {
        DB::table('heroes')->whereIn('rarity', ['SSR', 'SR', 'R'])->update([
            'rarity' => DB::raw("CASE rarity WHEN 'SSR' THEN 'S' WHEN 'SR' THEN 'A' WHEN 'R' THEN 'B' ELSE rarity END"),
        ]);
    }

    public function down(): void
    {
        // C 등급은 구 체계에 대응이 없어 B(R)로 낮춰 되돌린다.
        DB::table('heroes')->whereIn('rarity', ['S', 'A', 'B', 'C'])->update([
            'rarity' => DB::raw("CASE rarity WHEN 'S' THEN 'SSR' WHEN 'A' THEN 'SR' ELSE 'R' END"),
        ]);
    }
};
