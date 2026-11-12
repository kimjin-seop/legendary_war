<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 랭킹 보드용 가산 변경: battles.winner_user_id(PvP 승자, nullable)·win_by_forfeit(기권/타임아웃/퇴장 승리 표시)
 * + 인덱스 users(level, exp), battles(winner_user_id, settled_at).
 * 백필(1회, 읽기 파생·안전): 완료된 pvp 전투의 winner('a'=방장 user_id, 'b'=opponent_user_id). 기권 승리는 battle_actions.type='forfeit' 로그로 표시.
 * 롤백 = 인덱스 2개·컬럼 2개 drop(데이터 손실은 파생값뿐, 원본 winner/user_id는 그대로).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('battles', function (Blueprint $table) {
            if (! Schema::hasColumn('battles', 'winner_user_id')) {
                $table->unsignedBigInteger('winner_user_id')->nullable();
            }
            if (! Schema::hasColumn('battles', 'win_by_forfeit')) {
                $table->boolean('win_by_forfeit')->default(false);
            }
        });
        if (! Schema::hasIndex('battles', 'battles_winner_settled_idx')) {
            Schema::table('battles', fn (Blueprint $table) => $table->index(['winner_user_id', 'settled_at'], 'battles_winner_settled_idx'));
        }
        if (! Schema::hasIndex('users', 'users_level_exp_idx')) {
            Schema::table('users', fn (Blueprint $table) => $table->index(['level', 'exp'], 'users_level_exp_idx'));
        }

        DB::statement("UPDATE battles SET winner_user_id = CASE winner WHEN 'a' THEN user_id WHEN 'b' THEN opponent_user_id END
            WHERE mode = 'pvp' AND status = 'finished' AND winner IN ('a','b') AND winner_user_id IS NULL");
        DB::statement("UPDATE battles SET win_by_forfeit = 1
            WHERE mode = 'pvp' AND winner_user_id IS NOT NULL AND id IN (SELECT battle_id FROM battle_actions WHERE type = 'forfeit')");
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex('users_level_exp_idx');
        });
        Schema::table('battles', function (Blueprint $table) {
            $table->dropIndex('battles_winner_settled_idx');
            $table->dropColumn(['winner_user_id', 'win_by_forfeit']);
        });
    }
};
