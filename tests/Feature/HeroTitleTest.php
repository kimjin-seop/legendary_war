<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HeroTitleTest extends TestCase
{
    use RefreshDatabase;

    public function test_칭호_적재는_멱등이고_표시명이_응답에_포함된다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $snap = fn () => DB::table('heroes')->orderBy('code')->get(['code', 'title', 'short_name'])->toJson();
        $first = $snap();
        $this->artisan('game:seed')->assertSuccessful();
        $this->assertSame($first, $snap());
        $this->assertSame(136, DB::table('heroes')->whereNotNull('title')->count());

        $this->assertSame('카르타고의 한니발', GameData::displayName('카르타고의', '한니발', '한니발 바르카'));
        $this->assertSame('불멸의 이순신', GameData::displayName('불멸의', null, '이순신'));
        $this->assertSame('이순신', GameData::displayName(null, null, '이순신'));

        $r = $this->postJson('/api/guests', ['nickname' => 'titles'])->assertCreated();
        $heroes = $this->withHeaders(['X-Guest-Token' => $r->json('guest_token')])->getJson('/api/heroes')->assertOk()->json('heroes');
        $this->assertNotEmpty($heroes);
        foreach ($heroes as $h) {
            $this->assertNotEmpty($h['display_name']);
            $this->assertArrayHasKey('title', $h);
            $this->assertArrayHasKey('short_name', $h);
            $this->assertArrayHasKey('name', $h);   // 하위 호환
        }
    }
}
