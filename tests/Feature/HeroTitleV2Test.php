<?php

namespace Tests\Feature;

use App\Services\GameData;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class HeroTitleV2Test extends TestCase
{
    use RefreshDatabase;

    public function test_v2_칭호_136명_길이_중복_표시명과_전용_갱신_명령(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $rows = DB::table('heroes')->get(['code', 'name_ko', 'title', 'short_name']);
        $this->assertCount(136, $rows);
        $display = [];
        foreach ($rows as $r) {
            $this->assertNotEmpty($r->title, $r->code);
            $this->assertGreaterThanOrEqual(3, mb_strlen($r->title), $r->code);   // 4~14자 제안, 예외 1건: taizong_tang '천가한'(3자)
            $this->assertLessThanOrEqual(14, mb_strlen($r->title), $r->code);
            $this->assertLessThanOrEqual(32, mb_strlen((string) $r->short_name), $r->code);
            $display[] = GameData::displayName($r->title, $r->short_name, $r->name_ko);
        }
        $this->assertSame(count($display), count(array_unique($display)));   // 표시명 중복 없음
        $this->assertSame('삼도수군통제사 이순신', GameData::displayName(...array_values((array) DB::table('heroes')->where('code', 'yi_sun_sin')->first(['title', 'short_name', 'name_ko']))) );
        $this->assertSame('선덕', DB::table('heroes')->where('code', 'seondeok')->value('short_name'));
        // 전용 경로: 칭호만 되돌려도 game:seed-titles가 복구(dry-run은 쓰지 않음)
        DB::table('heroes')->where('code', 'yi_sun_sin')->update(['title' => '임시']);
        $this->artisan('game:seed-titles', ['--dry-run' => true])->assertSuccessful();
        $this->assertSame('임시', DB::table('heroes')->where('code', 'yi_sun_sin')->value('title'));
        $this->artisan('game:seed-titles')->assertSuccessful();
        $this->assertSame('삼도수군통제사', DB::table('heroes')->where('code', 'yi_sun_sin')->value('title'));
    }
}
