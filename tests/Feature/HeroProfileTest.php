<?php

namespace Tests\Feature;

use App\Services\GameData;
use Tests\TestCase;

class HeroProfileTest extends TestCase
{
    public function test_profile_returned_with_mapped_fields(): void
    {
        $p = app(GameData::class)->heroProfile('yi_sun_sin');
        $this->assertNotNull($p);
        $this->assertContains($p['evidence_level'], ['accepted', 'verify']);
        $this->assertNotEmpty($p['summary']);
        $this->assertNotEmpty($p['era']);
        foreach ($p['relations'] as $r) {
            $this->assertNotEmpty($r['name_ko']);
        }
        $v = app(GameData::class)->heroProfile('gyebaek');
        $this->assertSame('verify', $v['evidence_level']);
        $this->assertNull($v['anecdote']);
    }

    public function test_npc_보조_part_파일의_code_항목도_profile을_받는다(): void
    {
        foreach (['npc_jebe', 'npc_subutai', 'npc_babur', 'npc_rana_sanga', 'npc_harold_godwinson'] as $code) {
            $p = app(GameData::class)->heroProfile($code);
            $this->assertNotNull($p, $code);
            $this->assertNotEmpty($p['one_line']);
            $this->assertNotEmpty($p['summary']);
        }
    }

    public function test_unknown_code_falls_back_to_null(): void
    {
        $this->assertNull(app(GameData::class)->heroProfile('no_such_hero'));
        $this->assertNull(app(GameData::class)->heroProfile(''));
    }
}
