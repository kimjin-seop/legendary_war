<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** 유저 레벨별 편성 슬롯 수. backfill: Lv1~9=2, 10~19=3, 20~=4 (database/data/user_level_costs.json과 동일). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('user_level_costs', 'party_slots')) {
            Schema::table('user_level_costs', function (Blueprint $table) {
                $table->unsignedTinyInteger('party_slots')->default(2);
            });
        }
        DB::table('user_level_costs')->where('level', '>=', 10)->where('level', '<', 20)->update(['party_slots' => 3]);
        DB::table('user_level_costs')->where('level', '>=', 20)->update(['party_slots' => 4]);
    }

    public function down(): void
    {
        if (Schema::hasColumn('user_level_costs', 'party_slots')) {
            Schema::table('user_level_costs', function (Blueprint $table) {
                $table->dropColumn('party_slots');
            });
        }
    }
};
