<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/** 폴링 증분 조회용: 행동 로그의 이벤트 seq 범위와 전투의 마지막 이벤트 seq. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('battle_actions', function (Blueprint $table) {
            $table->unsignedBigInteger('first_event_seq')->nullable()->after('type');
            $table->unsignedBigInteger('last_event_seq')->nullable()->after('first_event_seq');
            $table->index(['battle_id', 'last_event_seq']);
        });
        Schema::table('battles', function (Blueprint $table) {
            $table->unsignedBigInteger('last_event_seq')->default(0)->after('version');
        });
        // backfill (기존 행이 있을 때만 의미)
        foreach (DB::table('battle_actions')->whereNotNull('events')->get(['id', 'events']) as $row) {
            $seqs = array_column(json_decode($row->events, true) ?: [], 'seq');
            if ($seqs) {
                DB::table('battle_actions')->where('id', $row->id)->update(['first_event_seq' => min($seqs), 'last_event_seq' => max($seqs)]);
            }
        }
        foreach (DB::table('battles')->get(['id', 'state']) as $b) {
            DB::table('battles')->where('id', $b->id)->update(['last_event_seq' => (int) (json_decode($b->state, true)['event_seq'] ?? 0)]);
        }
    }

    public function down(): void
    {
        Schema::table('battles', function (Blueprint $table) {
            $table->dropColumn('last_event_seq');
        });
        Schema::table('battle_actions', function (Blueprint $table) {
            $table->dropIndex(['battle_id', 'last_event_seq']);
            $table->dropColumn(['first_event_seq', 'last_event_seq']);
        });
    }
};
