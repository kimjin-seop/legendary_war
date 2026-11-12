<?php

namespace Tests\Feature;

use Tests\TestCase;

class HeroGenerateAuditTest extends TestCase
{
    public function test_생성은_결정론이고_덮어쓰기_heroes_json_pending_review를_막는다(): void
    {
        $dir = sys_get_temp_dir().'/herogen_'.bin2hex(random_bytes(4));
        $a = "$dir/a.json";
        $b = "$dir/b.json";
        $this->artisan('game:hero-generate', ['--only' => 'yi_sun_sin,hannibal', '--out' => $a])->assertSuccessful();
        $this->artisan('game:hero-generate', ['--only' => 'yi_sun_sin,hannibal', '--out' => $b])->assertSuccessful();
        $this->assertSame(file_get_contents($a), file_get_contents($b));                         // 같은 입력 = 같은 출력
        $items = json_decode(file_get_contents($a), true)['items'];
        $this->assertSame(['yi_sun_sin', 'hannibal'], array_column($items, 'code'));
        $this->assertSame(6, $items[0]['cost']);                                                  // S 등급
        $this->artisan('game:hero-generate', ['--only' => 'yi_sun_sin', '--out' => $a])->assertFailed();   // 기존 파일 덮어쓰기 금지
        $this->artisan('game:hero-generate', ['--out' => database_path('data/heroes.json')])->assertFailed();   // heroes.json 하드 차단
        // rarity가 없거나 pending_review인 풀 항목(데이터에 따라 달라짐)은 건너뜀
        $pool = json_decode(file_get_contents(database_path('data/hero_pool100.json')), true)['pool'];
        $skip = array_keys(array_filter($pool, fn ($h) => ! in_array($h['rarity'] ?? null, ['S', 'A', 'B', 'C'], true) || ($h['status'] ?? '') === 'pending_review'));
        if ($skip) {
            $this->artisan('game:hero-generate', ['--only' => implode(',', array_slice($skip, 0, 3)), '--out' => "$dir/c.json"])->assertSuccessful();
            $this->assertSame([], json_decode(file_get_contents("$dir/c.json"), true)['items']);
        }
        array_map('unlink', glob("$dir/*.json"));
        rmdir($dir);
    }

    public function test_감사는_정상_후보는_통과하고_틀을_크게_벗어난_후보는_FAIL로_종료한다(): void
    {
        $dir = sys_get_temp_dir().'/heroaudit_'.bin2hex(random_bytes(4));
        mkdir($dir);
        $this->artisan('game:hero-generate', ['--only' => 'yi_sun_sin,hannibal,alexander', '--out' => "$dir/ok.json"])->assertSuccessful();
        $this->artisan('game:hero-audit', ['--file' => "$dir/ok.json"])->assertSuccessful();   // WARN은 있어도 FAIL 없음
        $j = json_decode(file_get_contents("$dir/ok.json"), true);
        $j['items'][0]['atk_bonus'] = 40;                // 틀 대비 과대 보너스
        $j['items'][0]['growth_atk_pct'] = 9.0;          // 등급 범위 밖
        file_put_contents("$dir/bad.json", json_encode($j));
        $this->artisan('game:hero-audit', ['--file' => "$dir/bad.json"])->assertFailed();
        $this->artisan('game:hero-audit', ['--file' => "$dir/bad.json", '--report' => "$dir/r.json"])->assertFailed();
        $this->assertFileExists("$dir/r.json");
        array_map('unlink', glob("$dir/*.json"));
        rmdir($dir);
    }
}
