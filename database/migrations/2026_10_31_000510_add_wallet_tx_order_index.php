<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** 재화 이력 조회 정렬용 (wallet_id, id). users(name)은 name_normalized 유니크 인덱스로 대체되어 별도 인덱스를 두지 않는다. */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->index(['wallet_id', 'id'], 'wallet_tx_wallet_id_id');
        });
    }

    public function down(): void
    {
        Schema::table('wallet_transactions', function (Blueprint $table) {
            $table->dropIndex('wallet_tx_wallet_id_id');
        });
    }
};
