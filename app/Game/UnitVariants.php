<?php

namespace App\Game;

/**
 * 특수유닛(variant) 1차: 기본 병종(type)은 그대로 두고 hp/atk/def/move 만 보정한다(상성·지형·사거리 불변).
 * 정의 = database/data/unit_variants.json, 영웅 지정 = database/data/hero_variants.json({heroes:{code:{self_variant,troop_variant}}}).
 * 검증은 순수 함수(validateDefs/validateAssignment)로 두고 game:seed 가 파일 전체를 검증한다(위반 시 시드 실패). 런타임 조회(get/forHero)는 enabled=true 만 돌려준다.
 */
final class UnitVariants
{
    /** 변형 불가 병종(수군 제외, 마물 제외) */
    public const EXCLUDED_BASE = ['naval', 'monster'];

    /** 등급별 한도: 장점 최대 %, 순증 절대값 한도 % */
    public const RARITY_LIMITS = ['S' => ['adv' => 15, 'net' => 10], 'A' => ['adv' => 10, 'net' => 7]];

    private static ?array $cache = null;

    private static function readJson(string $f): array
    {
        $p = database_path('data/'.$f);

        return is_file($p) ? (json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR) ?: []) : [];
    }

    /** @return list<string> 기본 병종으로 허용되는 코드(unit_types.json 중 수군·마물 제외) */
    public static function baseTypes(): array
    {
        $codes = array_column(self::readJson('unit_types.json')['items'] ?? [], 'code');

        return array_values(array_diff($codes, self::EXCLUDED_BASE));
    }

    /** 순증 = (hp+atk+def)/3 + 5*move_delta (이동력 +1 은 장점 5% 로 환산 -- 문기획 확인 필요 가정) */
    public static function net(array $mods): float
    {
        return (((int) ($mods['hp_pct'] ?? 0)) + ((int) ($mods['atk_pct'] ?? 0)) + ((int) ($mods['def_pct'] ?? 0))) / 3 + 5 * (int) ($mods['move_delta'] ?? 0);
    }

    /** 장점 최대치(%): 양수 스탯 증가분의 최댓값, 이동 +1 은 5 */
    public static function maxAdvantage(array $mods): float
    {
        $v = [(int) ($mods['hp_pct'] ?? 0), (int) ($mods['atk_pct'] ?? 0), (int) ($mods['def_pct'] ?? 0), 5 * (int) ($mods['move_delta'] ?? 0)];

        return (float) max(0, ...$v);
    }

    /**
     * 정의 목록 검증.
     *
     * @param  array<int,array>  $items
     * @return list<string> 오류
     */
    public static function validateDefs(array $items): array
    {
        $err = [];
        $base = self::baseTypes();
        $seen = [];
        foreach ($items as $i => $it) {
            $c = (string) ($it['code'] ?? "#$i");
            isset($seen[$c]) && $err[] = "{$c}: code 중복";
            $seen[$c] = true;
            preg_match('/^[a-z][a-z0-9_]*$/', $c) || $err[] = "{$c}: code 형식 오류";
            in_array($it['base_type'] ?? null, $base, true) || $err[] = "{$c}: base_type '".($it['base_type'] ?? '')."' 이 기존 병종이 아니거나 수군·마물입니다";
            in_array($it['scope'] ?? null, ['hero_unique', 'culture_common'], true) || $err[] = "{$c}: scope 는 hero_unique|culture_common";
            in_array($it['min_rarity'] ?? null, ['S', 'A', null], true) || $err[] = "{$c}: min_rarity 는 S|A|null";
            (($it['scope'] ?? null) === 'culture_common' && empty($it['cultures'])) && $err[] = "{$c}: culture_common 은 cultures 필요";
            trim((string) ($it['name_ko'] ?? '')) !== '' || $err[] = "{$c}: name_ko 필요";
            $m = (array) ($it['mods'] ?? []);
            foreach (['hp_pct', 'atk_pct', 'def_pct'] as $k) {
                (isset($m[$k]) && ! is_int($m[$k])) && $err[] = "{$c}: mods.{$k} 정수 아님";
                abs((int) ($m[$k] ?? 0)) > 15 && $err[] = "{$c}: mods.{$k} ±15% 초과";
            }
            (isset($m['move_delta']) && ! is_int($m['move_delta'])) && $err[] = "{$c}: mods.move_delta 정수 아님";
            (isset($it['cultures']) && ! is_array($it['cultures'])) && $err[] = "{$c}: cultures 는 배열";
            abs((int) ($m['move_delta'] ?? 0)) > 1 && $err[] = "{$c}: mods.move_delta ±1 초과";
            $hasAdv = self::maxAdvantage($m) > 0;
            $hasDis = min((int) ($m['hp_pct'] ?? 0), (int) ($m['atk_pct'] ?? 0), (int) ($m['def_pct'] ?? 0), (int) ($m['move_delta'] ?? 0)) < 0;
            ($hasAdv && ! $hasDis) && $err[] = "{$c}: 장점만 있는 변형 금지(단점 쌍 필요)";
            abs(self::net($m)) > 10 && $err[] = "{$c}: 합산 순증 ±10% 초과(".round(self::net($m), 1).')';
        }

        return $err;
    }

    /**
     * 영웅에 변형을 지정할 수 있는지. $hero = [code, rarity, unit_type, culture?]
     *
     * @return list<string>
     */
    public static function validateAssignment(array $defs, array $hero, string $variant): array
    {
        $code = (string) ($hero['code'] ?? '?');
        $rar = (string) ($hero['rarity'] ?? '');
        $d = $defs[$variant] ?? null;
        if ($d === null) {
            return ["{$code}: 변형 '{$variant}' 정의 없음"];
        }
        $err = [];
        $lim = self::RARITY_LIMITS[$rar] ?? null;
        $lim === null && $err[] = "{$code}(등급 {$rar}): S/A 등급만 변형 지정 가능";
        (($d['min_rarity'] ?? null) === 'S' && $rar !== 'S') && $err[] = "{$code}(등급 {$rar}): 변형 '{$variant}' 은 S 전용";
        (($d['base_type'] ?? null) !== ($hero['unit_type'] ?? null)) && $err[] = "{$code}: 변형 base_type {$d['base_type']} 와 영웅 병종 ".($hero['unit_type'] ?? '?').' 불일치';
        if ($lim !== null) {
            self::maxAdvantage($d['mods'] ?? []) > $lim['adv'] && $err[] = "{$code}(등급 {$rar}): 장점 +{$lim['adv']}% 초과";
            abs(self::net($d['mods'] ?? [])) > $lim['net'] && $err[] = "{$code}(등급 {$rar}): 합산 ±{$lim['net']}% 초과";
        }
        (($d['scope'] ?? null) === 'culture_common' && isset($hero['culture']) && ! in_array($hero['culture'], (array) ($d['cultures'] ?? []), true)) && $err[] = "{$code}: 문화권 {$hero['culture']} 이 변형 cultures 에 없음";

        return $err;
    }

    /** @return array<string,array> code => 정의(전체, enabled 무관). 정의 오류면 RuntimeException */
    public static function defs(): array
    {
        if (self::$cache === null) {
            $items = self::readJson('unit_variants.json')['items'] ?? [];
            $err = self::validateDefs($items);
            $err === [] || throw new \RuntimeException('unit_variants.json: '.implode(' / ', $err));
            self::$cache = array_column($items, null, 'code');
        }

        return self::$cache;
    }

    /** 테스트용: 정의를 직접 주입(null=파일에서 다시 읽음) */
    public static function useDefs(?array $defs): void
    {
        self::$cache = $defs === null ? null : array_column($defs, null, 'code');
    }

    /** 전투 경로용: 정의 파일/검증 오류가 있어도 예외 없이 빈 배열(+로그). 검증 실패는 game:seed 에서만 처리한다 */
    private static function runtimeDefs(): array
    {
        try {
            return self::defs();
        } catch (\Throwable $e) {
            self::$cache = [];   // 이후 호출은 빈 정의로(로그 반복 방지)
            try {
                \Illuminate\Support\Facades\Log::error('unit_variants 로드 실패: 변형 없이 진행', ['error' => $e->getMessage()]);
            } catch (\Throwable) {
            }

            return [];
        }
    }

    /** 사용 가능한(enabled) 변형 정의 또는 null */
    public static function get(?string $code): ?array
    {
        if ($code === null || $code === '') {
            return null;
        }
        $d = self::runtimeDefs()[$code] ?? null;

        return $d !== null && ! empty($d['enabled']) ? $d : null;
    }

    /** 영웅 지정 변형 코드(kind = self|troop). 없거나 비활성이면 null */
    public static function forHero(?string $heroCode, string $kind): ?string
    {
        static $map = null;
        if ($map === null) {
            try {
                $map = self::readJson('hero_variants.json')['heroes'] ?? [];
            } catch (\Throwable $e) {   // 손상 파일: 전투를 막지 않고 변형 없이 진행
                $map = [];
                try {
                    \Illuminate\Support\Facades\Log::error('hero_variants 로드 실패: 변형 없이 진행', ['error' => $e->getMessage()]);
                } catch (\Throwable) {
                }
            }
        }
        $c = $heroCode === null ? null : ($map[$heroCode][$kind.'_variant'] ?? null);

        return is_string($c) && self::get($c) !== null ? $c : null;
    }

    /**
     * hero_variants.json 전체 검증(game:seed 에서 호출).
     *
     * @param  array<string,array>  $heroes  code => [code, rarity, unit_type, culture?]
     * @return list<string>
     */
    public static function validateHeroFile(array $heroes): array
    {
        $defs = self::defs();
        $err = [];
        foreach ((self::readJson('hero_variants.json')['heroes'] ?? []) as $code => $a) {
            if (! isset($heroes[$code])) {
                $err[] = "{$code}: 영웅 없음";

                continue;
            }
            foreach (['self_variant', 'troop_variant'] as $k) {
                ($a[$k] ?? null) !== null && $err = array_merge($err, self::validateAssignment($defs, $heroes[$code], (string) $a[$k]));
            }
        }

        return $err;
    }

    /**
     * 스테이지 JSON 의 enemy_squad 변형 지정 검증(존재·enabled·기본 병종 일치). 스테이지 명시 지정은 등급·장점 한도를 적용하지 않는다(의도: 서가 NPC 등 연출용).
     *
     * @return list<string>
     */
    public static function validateStageDoc(array $doc, string $label): array
    {
        $defs = self::defs();
        $err = [];
        $check = function (?string $v, ?string $type, string $where) use ($defs, $label, &$err): void {
            if ($v === null) {
                return;
            }
            $d = $defs[$v] ?? null;
            if ($d === null) {
                $err[] = "{$label} {$where}: 변형 '{$v}' 정의 없음";
            } elseif (empty($d['enabled'])) {
                $err[] = "{$label} {$where}: 변형 '{$v}' 가 enabled=false (무시됨)";
            } elseif ($type !== null && $d['base_type'] !== $type) {
                $err[] = "{$label} {$where}: 변형 '{$v}' base_type {$d['base_type']} != 병종 {$type}";
            }
        };
        $walk = function (mixed $node) use (&$walk, $check): void {
            if (! is_array($node)) {
                return;
            }
            foreach ($node as $k => $v) {
                if ($k === 'enemy_squad' && is_array($v)) {
                    $cmd = (array) ($v['commander'] ?? []);
                    $ctype = (string) ($cmd['troop_type'] ?? $cmd['unit_type'] ?? '');
                    $check($cmd['variant'] ?? null, $ctype ?: null, 'commander');
                    $check($v['variant'] ?? null, $ctype ?: null, 'squad');
                    foreach (array_values((array) ($v['squads'] ?? [])) as $i => $sq) {
                        $sc = (array) ($sq['commander'] ?? []);
                        $st = (string) ($sc['troop_type'] ?? $sc['unit_type'] ?? '');
                        $check($sc['variant'] ?? null, $st ?: null, "squads[$i].commander");
                        $check($sq['variant'] ?? null, $st ?: null, "squads[$i]");
                    }
                }
                $walk($v);
            }
        };
        $walk($doc);

        return $err;
    }

    /**
     * 기본 스탯에 보정 적용.
     *
     * @param  array{hp:int,atk:int,def:int,move:int}  $s
     */
    public static function apply(array $s, array $def): array
    {
        $m = $def['mods'] ?? [];
        $pct = fn (int $v, string $k, int $min) => max($min, (int) round($v * (1 + (int) ($m[$k] ?? 0) / 100)));

        return ['hp' => $pct($s['hp'], 'hp_pct', 1), 'atk' => $pct($s['atk'], 'atk_pct', 1), 'def' => $pct($s['def'], 'def_pct', 0), 'move' => max(1, $s['move'] + (int) ($m['move_delta'] ?? 0))];
    }
}
