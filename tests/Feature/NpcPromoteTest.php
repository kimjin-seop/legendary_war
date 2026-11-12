<?php

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/** NPC 승격(방식 B): 로스터 playable:true -> campaign_only 해제, 재시드에 안 되돌아가고 --revert로 복귀. */
class NpcPromoteTest extends TestCase
{
    use RefreshDatabase;

    public function test_승격은_campaign_only를_해제하고_재시드에도_유지되며_revert로_복귀한다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $this->artisan('game:seed-ch1')->assertSuccessful();
        $this->artisan('game:seed-imjin10', ['--with-npc' => true])->assertSuccessful();
        $co = fn (string $c) => (bool) DB::table('heroes')->where('code', $c)->value('campaign_only');
        $this->assertFalse($co('npc_jebe'));   // 로스터 playable:true 는 시드 시 처음부터 해제로 들어간다. 아래에서 옛 DB(campaign_only=1) 상태를 재현
        DB::table('heroes')->whereIn('code', ['npc_jebe', 'npc_boorchu'])->update(['campaign_only' => true, 'culture' => 'mongol']);
        $this->artisan('game:npc-promote', ['--dry-run' => true])->assertSuccessful();
        $this->assertTrue($co('npc_jebe'));   // dry-run 롤백
        $this->artisan('game:npc-promote')->assertSuccessful();
        $this->assertFalse($co('npc_jebe'));
        $this->assertSame('steppe', DB::table('heroes')->where('code', 'npc_jebe')->value('culture'));   // mongol -> steppe 정규화
        $this->assertTrue($co('npc_cart_front') || ! DB::table('heroes')->where('code', 'npc_cart_front')->exists());   // 비승격 NPC는 그대로
        $this->artisan('game:seed-imjin10', ['--with-npc' => true, '--force' => true])->assertSuccessful();
        $this->assertFalse($co('npc_jebe'));   // 재시드가 플래그를 되돌리지 않음
        $this->artisan('game:npc-promote', ['--revert' => true])->assertSuccessful();
        $this->assertTrue($co('npc_jebe'));
    }
}
