<?php

namespace App\Console\Commands;

use App\Services\GachaService;
use App\Services\ScenarioBannerBuilder;
use App\Support\Rarity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 읽기 전용 점검: 시나리오(stages.chapter) <-> 레지스트리 <-> 시나리오 배너(gacha_banners.json) 대응.
 * FAIL(종료코드 1): 배너 없는 시나리오, pending 인데 스테이지가 이미 있음, active 인데 스테이지 없음, 필수 영웅(풀 안) 누락, 등급 하한 미달(S1/A3/B8/C8),
 *   풀 상한(전체 풀 50% 미만 + banner_max_pool), art_key 에셋(gachaKeys.js THEME) 없음, 풀 코드가 현재 풀에 없음, GachaService 검증으로 비활성된 배너.
 * WARN: 생성본과 다름(레지스트리 재생성 필요), 레지스트리에 없는 배너, 풀 밖이라 대기 중인 필수 영웅, 보충 비율 과다.
 * status=pending 항목(스테이지 미등록)은 막지 않는다.
 */
class GameAuditScenarioBanners extends Command
{
    protected $signature = 'game:audit-scenario-banners {--registry= : 레지스트리 경로} {--banners= : gacha_banners.json 경로} {--keys-file= : art_key 정의 파일(기본 resources/js/game/ui/gachaKeys.js)}';

    protected $description = '시나리오-배너 대응·필수 영웅·등급 하한·풀 상한·art_key 점검(읽기 전용)';

    public function handle(GachaService $gacha, ScenarioBannerBuilder $b): int
    {
        $reg = $b->registry($this->option('registry') ?: null);
        $banPath = $this->option('banners') ?: (config('game.gacha.banners_path') ?: database_path('data/gacha_banners.json'));
        $doc = is_file($banPath) ? (array) json_decode((string) file_get_contents($banPath), true) : [];
        $banners = [];
        foreach ((array) ($doc['banners'] ?? []) as $x) {
            if (is_array($x) && ! empty($x['key']) && array_key_exists('pool_codes', $x)) {
                $banners[(string) $x['key']] = $x;
            }
        }
        $pool = $gacha->pool();
        $inPool = $b->poolMap($pool);
        $total = count($inPool);
        $artKeys = $this->artKeys();
        $problems = $gacha->scenarioBannerProblems($pool);
        $fail = [];
        $warn = [];
        $exempt = array_map('strval', array_keys((array) ($reg['exempt_chapters'] ?? [])));
        $byChapter = [];
        foreach ((array) ($reg['scenarios'] ?? []) as $e) {
            $byChapter[(int) $e['chapter']][] = $e;
        }
        foreach (DB::table('stages')->whereNotNull('chapter')->distinct()->pluck('chapter') as $ch) {
            if (! in_array((string) $ch, $exempt, true) && empty($byChapter[(int) $ch])) {
                $fail[] = "챕터 {$ch}: 레지스트리에 시나리오 없음(스테이지는 있음)";
            }
        }
        $n = 0;
        foreach ((array) ($reg['scenarios'] ?? []) as $e) {
            $key = (string) $e['key'];
            $ch = (int) $e['chapter'];
            $hasStages = DB::table('stages')->where('chapter', $ch)->exists();
            if (! $b->isActive($e)) {
                $hasStages && $fail[] = "{$key}: status=".($e['status'] ?? '').' 인데 챕터 '.$ch.' 스테이지가 이미 있음(active 로 바꾸고 배너 생성)';
                $this->line("건너뜀(status=".($e['status'] ?? '')."): {$key}");

                continue;
            }
            $n++;
            ($hasStages || ! DB::table('stages')->exists()) || $fail[] = "{$key}: active 인데 챕터 {$ch} 스테이지 없음";
            $bn = $banners[$key] ?? null;
            if ($bn === null) {
                $fail[] = "{$key}: 챕터 {$ch} 배너 없음(gacha_banners.json)";

                continue;
            }
            isset($problems[$key]) && $fail[] = "{$key}: 서비스 검증으로 비활성 - ".$problems[$key];
            $codes = array_map('strval', (array) $bn['pool_codes']);
            $miss = array_values(array_filter($codes, fn ($c) => ! isset($inPool[$c])));
            $miss && $fail[] = "{$key}: 현재 풀에 없는 풀 코드 ".implode(',', array_slice($miss, 0, 5));
            $d = $b->derive($e, $pool, false);
            $needReq = array_values(array_diff($d['required'], $codes));
            $needReq && $fail[] = "{$key}: 필수 영웅 누락 ".implode(',', $needReq);
            $d['pending_required'] && $warn[] = "{$key}: 풀 밖이라 대기 중인 필수 영웅 ".implode(',', $d['pending_required']);
            $min = ScenarioBannerBuilder::minCounts($e, (array) ($reg['defaults']['min_counts'] ?? []));
            $cnt = array_count_values(array_map(fn ($c) => $inPool[$c] ?? '?', $codes));
            foreach (Rarity::ORDER as $r) {
                ($cnt[$r] ?? 0) < (int) ($min[$r] ?? 0) && $fail[] = "{$key}: 등급 {$r} ".($cnt[$r] ?? 0).'명 < 하한 '.$min[$r];
            }
            $ratio = (float) ($reg['defaults']['max_pool_ratio'] ?? 0.5);
            (count($codes) >= $total * $ratio || count($codes) > (int) config('game.gacha.banner_max_pool', 150)) && $fail[] = "{$key}: 풀 ".count($codes).'명이 상한(전체 '.$total.'명의 '.($ratio * 100).'% 미만, 최대 '.config('game.gacha.banner_max_pool', 150).') 이상';
            $art = $bn['art_key'] ?? null;
            $art !== null && ! in_array($art, $artKeys, true) && $fail[] = "{$key}: art_key '{$art}' 에셋 정의 없음(gachaKeys.js)";
            ($bn['art_key'] ?? null) !== ($e['art_key'] ?? null) && $warn[] = "{$key}: 레지스트리 art_key 와 배너 art_key 가 다름";
            $d2 = $b->derive($e, $pool);
            $d2['codes'] === $codes || $warn[] = "{$key}: 생성본과 풀이 다름(game:gen-scenario-banners --write 로 재생성)";
            count($d2['topup']) * 2 > count($d2['codes']) && $warn[] = "{$key}: 등급 하한 보충분이 풀의 50% 초과(".count($d2['topup']).'/'.count($d2['codes']).')';
        }
        $regKeys = array_flip(array_map(fn ($e) => (string) $e['key'], (array) ($reg['scenarios'] ?? [])));
        foreach (array_keys($banners) as $k) {
            isset($regKeys[$k]) || $warn[] = "{$k}: 레지스트리에 없는 배너";
        }
        foreach ($warn as $w) {
            $this->warn("WARN {$w}");
        }
        foreach ($fail as $f) {
            $this->error("FAIL {$f}");
        }
        $this->info(sprintf('시나리오 active %d / 배너 %d / FAIL %d / WARN %d', $n, count($banners), count($fail), count($warn)));

        return $fail ? self::FAILURE : self::SUCCESS;
    }

    /** gachaKeys.js 의 BANNER_THEMES `{ key: '<이름>'` 목록(art_key 허용 값) */
    private function artKeys(): array
    {
        $f = $this->option('keys-file') ?: base_path('resources/js/game/ui/gachaKeys.js');
        if (! is_file($f)) {
            return [];
        }
        preg_match_all("~\\{\\s*key:\\s*'([a-z0-9_]+)'~", (string) file_get_contents($f), $m);

        return array_values(array_unique($m[1]));
    }
}
