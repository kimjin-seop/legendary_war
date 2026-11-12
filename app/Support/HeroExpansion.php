<?php

namespace App\Support;

/**
 * 신규 영웅 확장 데이터 로더(heroes.json 수정 없이 병합). 입력:
 *  - database/data/hero_expansion_stats.json     : 병종·등급·cost·bonus·growth·aura·passive_skill (code 기준, 확정 시작값)
 *  - database/data/hero_expansion_narrative.json : name/born/died/era/region/culture/title/history(relations 포함)
 * 두 파일의 code 집합이 다르면 RuntimeException. 초상(portrait.<code>)이 아직 없어도 시드·가챠 풀에 포함한다(FE가 실루엣/공용 초상으로 폴백).
 * 파일이 없으면 빈 배열(기존 동작).
 */
final class HeroExpansion
{
    private static ?array $cache = null;

    private static function read(string $f): ?array
    {
        $p = database_path('data/'.$f);

        return is_file($p) ? json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR) : null;
    }

    /** @return array<string,array{stats:array,narrative:array}> code => 원본 */
    public static function raw(): array
    {
        if (self::$cache !== null) {
            return self::$cache;
        }
        $s = self::read('hero_expansion_stats.json');
        $n = self::read('hero_expansion_narrative.json');
        if ($s === null || $n === null) {
            return self::$cache = [];
        }
        $st = array_column($s['items'] ?? [], null, 'code');
        $na = array_column($n['items'] ?? [], null, 'code');
        $diff = array_merge(array_diff(array_keys($st), array_keys($na)), array_diff(array_keys($na), array_keys($st)));
        $diff === [] || throw new \RuntimeException('hero_expansion: stats/narrative code 불일치: '.implode(',', $diff));
        count($st) === count($s['items']) || throw new \RuntimeException('hero_expansion: stats code 중복');
        $hold = array_flip((self::read('hero_expansion_hold.json')['hold'] ?? []));   // 보류 코드(데이터는 보존, 적재에서만 제외)
        $out = [];
        foreach ($st as $code => $row) {
            if (isset($hold[$code])) {
                continue;
            }
            $out[$code] = ['stats' => $row, 'narrative' => $na[$code]];
        }

        return self::$cache = $out;
    }

    /** @return list<array<string,mixed>> heroes.json 호환 행(verify=true: 시작값·사람 확인 필요) */
    public static function heroRows(): array
    {
        $rows = [];
        foreach (self::raw() as $code => ['stats' => $s, 'narrative' => $n]) {
            foreach (['unit_type', 'rarity', 'cost', 'hp_bonus', 'atk_bonus', 'def_bonus', 'growth_hp_pct', 'growth_atk_pct', 'growth_def_pct'] as $k) {
                (array_key_exists($k, $s) && $s[$k] !== null) || throw new \RuntimeException("hero_expansion: {$code}.{$k} 없음");
            }
            $rows[] = [
                'code' => $code, 'name_ko' => $n['name_ko'], 'name_en' => $n['name_en'] ?? $code, 'born' => $n['born'] ?? null, 'died' => $n['died'] ?? null,
                'era' => $n['era'] ?? null, 'region' => $n['region'] ?? 'east', 'culture' => $n['culture'] ?? null,
                'unit_type' => $s['unit_type'], 'rarity' => $s['rarity'], 'cost' => (int) $s['cost'],
                'hp_bonus' => (int) $s['hp_bonus'], 'atk_bonus' => (int) $s['atk_bonus'], 'def_bonus' => (int) $s['def_bonus'],
                'growth_hp_pct' => $s['growth_hp_pct'], 'growth_atk_pct' => $s['growth_atk_pct'], 'growth_def_pct' => $s['growth_def_pct'],
                'skill' => $s['skill'] ?? $s['passive_skill'] ?? null, 'aura' => $s['aura'] ?? null, 'verify' => true,
                'note' => '신규 영웅(확장 29명) 시작값, 사람 검토 필요',
            ];
        }

        return $rows;
    }

    /** @return array<string,string> code => 부대 병종(영웅 병종과 동일) */
    public static function troopTypes(): array
    {
        return array_map(fn ($r) => $r['stats']['unit_type'], self::raw());
    }

    /** @return array<string,array> code => hero_history item 형식 */
    public static function history(): array
    {
        $out = [];
        foreach (self::raw() as $code => ['narrative' => $n]) {
            if (is_array($n['history'] ?? null)) {
                $out[$code] = ['code' => $code, 'name_ko' => $n['name_ko']] + $n['history'];
            }
        }

        return $out;
    }

    /** @return array<string,array{title:?string,short_name:?string}> */
    public static function titles(): array
    {
        $out = [];
        foreach (self::raw() as $code => ['narrative' => $n]) {
            $t = $n['title'] ?? null;
            if (is_array($t)) {
                $out[$code] = ['title' => ($t['title'] ?? '') !== '' ? (string) $t['title'] : null, 'short_name' => ($t['short_name'] ?? '') !== '' ? (string) $t['short_name'] : null];
            }
        }

        return $out;
    }
}
