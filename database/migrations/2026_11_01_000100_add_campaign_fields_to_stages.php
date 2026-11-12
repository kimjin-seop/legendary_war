<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * 캠페인(ch1) 스테이지 확장 컬럼. 모두 nullable이며 null이면 기존 동작(기존 stage_01~06은 값 없음).
 *  - chapter: 장 번호(null=기존 모험 스테이지, 1=캠페인 1장). FE 그룹 표시용
 *  - objective: {type:'defeat_commander'} | {type:'survive_turns',turns:N}. null=defeat_commander
 *  - star_conditions: [{type:clear|all_alive|turn_within|commander_hp_pct_min, value?}]. null=기존 하드코딩 별 계산
 *  - enemy_squad: 영웅 없는 일반 지휘관 적 편성 {commander{...},units[]}. null=enemy_preset_id(영웅 프리셋)+enemy_extra_troops
 *  - join_hero: 첫 클리어 합류 영웅 [{hero_code,condition:'first_clear'}]. null/빈=없음
 * 롤백: php artisan migrate:rollback --step=1 (컬럼 삭제, 다른 데이터 영향 없음)
 */
return new class extends Migration
{
    private const COLUMNS = ['chapter', 'objective', 'star_conditions', 'enemy_squad', 'join_hero'];

    public function up(): void
    {
        Schema::table('stages', function (Blueprint $table) {
            if (! Schema::hasColumn('stages', 'chapter')) {
                $table->unsignedTinyInteger('chapter')->nullable();
            }
            foreach (['objective', 'star_conditions', 'enemy_squad', 'join_hero'] as $c) {
                if (! Schema::hasColumn('stages', $c)) {
                    $table->json($c)->nullable();
                }
            }
        });
    }

    public function down(): void
    {
        Schema::table('stages', function (Blueprint $table) {
            foreach (self::COLUMNS as $c) {
                if (Schema::hasColumn('stages', $c)) {
                    $table->dropColumn($c);
                }
            }
        });
    }
};
