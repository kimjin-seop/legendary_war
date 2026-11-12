<?php

namespace Tests\Feature;

use App\Services\GachaService;
use App\Services\ScenarioBannerBuilder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/** 시나리오 레지스트리 -> 배너 생성기 / 감사 명령(docs/GACHA_REQUIRED_PITY_20261108.md). 핵심 동작만. */
class ScenarioBannerTest extends TestCase
{
    use RefreshDatabase;

    public function test_생성기는_레지스트리의_active_17개를_만들고_건너뛴_항목이_없다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $b = app(ScenarioBannerBuilder::class);
        $out = $b->build($b->registry(), app(GachaService::class)->pool());
        $this->assertCount(17, $out['banners']);
        $this->assertSame([], $out['skipped']);
        $sc1 = collect($out['banners'])->firstWhere('key', 'sc_ch1');
        $this->assertSame('imjin', $sc1['art_key']);
        $this->assertContains('yi_sun_sin', $sc1['required_heroes']);
        $this->assertSame($out['banners'], $b->build($b->registry(), app(GachaService::class)->pool())['banners']);   // 결정적(재실행 같은 출력)
        $this->artisan('game:gen-scenario-banners', ['--banners' => sys_get_temp_dir().'/never_written.json'])->assertSuccessful();   // dry-run 은 파일을 쓰지 않는다
        $this->assertFileDoesNotExist(sys_get_temp_dir().'/never_written.json');
    }

    public function test_감사는_배너_없는_시나리오와_필수_영웅_누락을_실패로_잡는다(): void
    {
        $this->artisan('game:seed')->assertSuccessful();
        $f = tempnam(sys_get_temp_dir(), 'ban');
        file_put_contents($f, json_encode(['version' => 2, 'banners' => [
            ['key' => 'sc_ch1', 'title' => 't', 'art_key' => 'no_such_art', 'pool_codes' => ['heo_jun']],   // 필수 영웅(이순신 등) 누락 + 하한 미달 + art_key 없음
        ]]));
        config(['game.gacha.banners_path' => $f]);
        $this->artisan('game:audit-scenario-banners')
            ->expectsOutputToContain('필수 영웅 누락')
            ->expectsOutputToContain('배너 없음')   // sc_ch11 ... 배너 미생성
            ->expectsOutputToContain("art_key 'no_such_art'")
            ->assertFailed();
    }
}
