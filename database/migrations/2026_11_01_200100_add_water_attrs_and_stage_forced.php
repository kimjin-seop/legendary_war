<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 수상(해전) 규칙 컬럼.
 * terrains.water(수상 칸: 수병 수상 보너스 판정), terrains.boarding(비수병 배 탑승 칸 = sea·reef, 파생 상태라 전투 state 불변).
 * stages.forced_heroes(JSON, 출전 강제/대여 편성), stages.required_hero(입장 게이트 영웅 코드), stages.triggers(JSON, 증원 등 턴 트리거).
 * 모두 nullable/기본 0이라 기존 행·진행 중 전투 불변. down: 컬럼 삭제.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('terrains', 'water')) {
            Schema::table('terrains', function (Blueprint $t) {
                $t->unsignedTinyInteger('water')->default(0);
                $t->unsignedTinyInteger('boarding')->default(0);
            });
            DB::table('terrains')->whereIn('code', ['sea', 'reef', 'harbor', 'shallows', 'water'])->update(['water' => 1]);
            DB::table('terrains')->whereIn('code', ['sea', 'reef'])->update(['boarding' => 1]);
        }
        Schema::table('stages', function (Blueprint $t) {
            foreach (['forced_heroes', 'triggers'] as $c) {
                Schema::hasColumn('stages', $c) || $t->json($c)->nullable();
            }
            Schema::hasColumn('stages', 'required_hero') || $t->string('required_hero', 64)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('terrains', function (Blueprint $t) {
            foreach (['water', 'boarding'] as $c) {
                Schema::hasColumn('terrains', $c) && $t->dropColumn($c);
            }
        });
        Schema::table('stages', function (Blueprint $t) {
            foreach (['forced_heroes', 'triggers', 'required_hero'] as $c) {
                Schema::hasColumn('stages', $c) && $t->dropColumn($c);
            }
        });
    }
};
