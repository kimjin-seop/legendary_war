<?php

namespace Tests\Unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;

/** 시즌 전쟁 시나리오 데이터(database/data/war/*.json) 형식·정합성: 국가 2·영토 코드·시작 국가·수도·방어 레벨·좌표·링크(대칭 없는 무방향 간선)·연결성·지도 범위. */
class WarScenarioDataTest extends TestCase
{
    public static function scenarios(): array
    {
        return array_map(fn ($f) => [basename($f, '.json')], glob(dirname(__DIR__, 2).'/database/data/war/*.json') ?: []);   // 시나리오 파일이 추가되면 자동으로 검증 대상
    }

    #[DataProvider('scenarios')]
    public function test_시나리오_데이터가_형식과_정합성을_만족한다(string $code): void
    {
        $d = json_decode((string) file_get_contents(dirname(__DIR__, 2).'/database/data/war/'.$code.'.json'), true, 512, JSON_THROW_ON_ERROR);
        $sc = $d['scenario'];
        $this->assertSame($code, $sc['code']);
        $this->assertNotEmpty($sc['name']);
        $this->assertGreaterThan(0, (int) $sc['season_days']);
        $v = $sc['map_view'];
        $this->assertLessThan($v['lon_max'], $v['lon_min']);
        $this->assertLessThan($v['lat_max'], $v['lat_min']);

        $countries = array_column($d['countries'], 'code');
        $this->assertCount(2, $countries, '주 대립 2세력');
        $this->assertSame($countries, array_values(array_unique($countries)));
        foreach ($d['countries'] as $c) {
            $this->assertMatchesRegularExpression('/^#[0-9A-Fa-f]{6}$/', $c['color']);
            $this->assertNotEmpty($c['name']);
        }

        $terrs = array_column($d['territories'], null, 'code');
        $this->assertCount(count($d['territories']), $terrs, '영토 코드 중복');
        $capitals = [];
        foreach ($d['territories'] as $t) {
            $this->assertMatchesRegularExpression('/^[a-z0-9_]{1,48}$/', $t['code']);
            $this->assertContains($t['start_country'], $countries, $t['code'].' 시작 국가');
            $this->assertGreaterThanOrEqual(1, $t['defense_level'], $t['code']);
            $this->assertLessThanOrEqual(10, $t['defense_level'], $t['code']);
            $this->assertNotEmpty($t['battle_map_code'], $t['code'].' 방어 전투 맵');
            $this->assertTrue($t['lon'] >= $v['lon_min'] && $t['lon'] <= $v['lon_max'] && $t['lat'] >= $v['lat_min'] && $t['lat'] <= $v['lat_max'], $t['code'].' 좌표가 map_view 밖');
            ($t['kind'] ?? null) === 'capital' && $capitals[$t['start_country']][] = $t['code'];
        }
        foreach ($countries as $c) {
            $this->assertCount(1, $capitals[$c] ?? [], $c.' 수도 정확히 1개');
        }

        $adj = [];
        foreach ($d['links'] as [$a, $b]) {
            $this->assertArrayHasKey($a, $terrs, "링크 영토 {$a}");
            $this->assertArrayHasKey($b, $terrs, "링크 영토 {$b}");
            $this->assertNotSame($a, $b);
            $adj[$a][] = $b;
            $adj[$b][] = $a;
        }
        $seen = [array_key_first($terrs) => true];
        $queue = [array_key_first($terrs)];
        while ($queue) {
            foreach ($adj[array_shift($queue)] ?? [] as $n) {
                isset($seen[$n]) || ($seen[$n] = true) && $queue[] = $n;
            }
        }
        $this->assertCount(count($terrs), $seen, '모든 영토가 인접 링크로 연결되어야 한다: 고립 '.implode(',', array_diff(array_keys($terrs), array_keys($seen))));
    }
}
