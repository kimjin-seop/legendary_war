<?php

namespace App\Game;

/**
 * passive 스킬 params -> 효과 객체 배열 정규화/합산/조건 평가 (순수 함수, DB 미사용).
 * params 형식 2가지: 구 형식 {atk_pct:8} (효과 1개) / 신 형식 {effects:[{atk_pct:8, when:{...}}, ...]}.
 * 엔진이 해석하는 효과 키는 atk_pct/def_pct/heal 이다.
 *  - `when` 없는 효과: 키별 합산(유닛 `passive`, 항상 적용).
 *  - `when` 있고 모든 키가 WHEN_KEYS(지원 조건)인 효과: 유닛 `skills`(조건부 목록)로 분리, Engine::damageInfo가 문맥으로 평가.
 *  - `when`에 미지원 키가 하나라도 있으면 효과 전체를 무시(ignored, fail-closed). 조건이 무시되어 항상 적용되는 일은 없다.
 *
 * when 키 의미(효과 소유 유닛 기준. 공격 효과는 소유자가 공격자일 때, 방어 효과는 소유자가 피격자일 때만 읽힌다):
 *  terrain: string[]            소유자가 서 있는 타일의 지형 code가 포함될 때 (T_TERRAIN_ATK/DEF)
 *  vs: string[]                 상대 유닛 병종이 포함될 때 (T_VS_TYPE_ATK)
 *  hp_below_pct: int            소유자 hp/max_hp*100 <= N (T_LAST_STAND)
 *  counter: true                이번 교환이 반격일 때 (T_COUNTER_ATK)
 *  target_full_hp: true         상대 hp == max_hp (T_FIRST_STRIKE)
 *  moved: true                  소유자가 이번 턴 실제로 다른 타일로 이동한 뒤 공격(반격 제외, 공격 효과만) (T_CHARGE)
 *  adjacent_allies: int(1~3)    인접(거리1) 아군 수(상한 N)만큼 효과 값을 배수로 곱함, 0명이면 불발 (T_FORMATION)
 *  target_hp_below_pct: int     상대 hp/max_hp*100 <= N (T_PURSUIT, 공격 효과만)
 *  target_terrain: string[]     상대가 서 있는 타일의 지형 code가 포함될 때 (T_SIEGE_ATK, 공격 효과만)
 *
 * 무조건형 비전투 효과 키(`when` 없이 합산되어 유닛 `passive`에 들어감): move(이동력 가산, T_MOVE_UP), regen_hp(자기 진영 턴 종료 시 최대 HP의 N% 회복, T_REGEN).
 * params 최상위 특수 키(fold의 `special`로 모여 유닛 `special`로 전달): matchup_negate=병종 code[](해당 병종 상대 상성 불리 배율을 1.0으로, T_MATCHUP_NEGATE),
 *  move_discount={terrain:string[],amount:int}(해당 지형 진입 이동비용 -amount, 최소 1, T_TERRAIN_MASTER).
 */
final class PassiveEffects
{
    public const KEYS = ['atk_pct', 'def_pct', 'heal', 'move', 'regen_hp'];

    public const WHEN_KEYS = ['terrain', 'vs', 'hp_below_pct', 'counter', 'target_full_hp', 'moved', 'adjacent_allies', 'target_hp_below_pct', 'target_terrain'];

    /**
     * 엔진 지원 템플릿(= skills.enabled=1로 적재 가능한 템플릿). 그 외(needs_engine_*, 템플릿 미정의, 액티브)는 enabled=0 적재.
     * 새 템플릿을 지원하려면 WHEN_KEYS 해석(Engine::skillContext)을 구현한 뒤 여기에 추가한다.
     */
    public const SUPPORTED_TEMPLATES = [
        'T_ATK_UP', 'T_DEF_UP', 'T_ATKDEF_HYBRID', 'T_HEAL_UP',
        'T_TERRAIN_ATK', 'T_TERRAIN_DEF', 'T_VS_TYPE_ATK', 'T_LAST_STAND', 'T_COUNTER_ATK', 'T_FIRST_STRIKE', 'T_CHARGE', 'T_FORMATION',
        'T_PURSUIT', 'T_SIEGE_ATK', 'T_MOVE_UP', 'T_REGEN', 'T_TERRAIN_MASTER', 'T_MATCHUP_NEGATE',
    ];

    /**
     * @return array<int,array<string,mixed>> 정규화된 효과 목록(when 보존)
     */
    public static function normalize(array $params): array
    {
        $list = isset($params['effects']) && is_array($params['effects']) ? array_values($params['effects']) : [$params];
        $out = [];
        foreach ($list as $e) {
            if (! is_array($e)) {
                continue;
            }
            $eff = array_intersect_key($e, array_flip(self::KEYS));
            if (isset($e['when']) && $e['when'] !== [] && $e['when'] !== null) {
                $eff['when'] = $e['when'];
            }
            if ($eff !== [] && array_diff_key($eff, ['when' => 1]) !== []) {
                $out[] = $eff;
            }
        }

        return $out;
    }

    /** when의 모든 키가 지원 조건이면 true(비어 있거나 배열이 아니면 false) */
    public static function whenSupported(mixed $when): bool
    {
        return is_array($when) && $when !== [] && array_diff(array_keys($when), self::WHEN_KEYS) === [];
    }

    /**
     * 여러 스킬의 params를 키별로 합산. 반환 passive는 합이 없으면 null(기존 호환).
     * conditional = 지원 조건(when) 효과의 압축 목록 [{code,atk_pct?,def_pct?,when}] (영웅 유닛 `skills`로 전달).
     *
     * @param  array<int|string,array>  $paramsList  skill code(or index) => params
     * special = params 최상위 특수 키(matchup_negate/move_discount) 모음(없으면 빈 배열).
     *
     * @return array{passive:?array<string,int>,effects:array<int,array>,ignored:array<int,array{skill:int|string,when:mixed}>,conditional:array<int,array>,special:array<string,mixed>}
     */
    public static function fold(array $paramsList): array
    {
        $special = [];
        $sum = [];
        $effects = [];
        $ignored = [];
        $conditional = [];
        foreach ($paramsList as $skill => $params) {
            if (is_array($params['matchup_negate'] ?? null)) {
                $special['matchup_negate'] = array_values(array_unique(array_merge($special['matchup_negate'] ?? [], array_filter($params['matchup_negate'], 'is_string'))));
            }
            $md = $params['move_discount'] ?? null;
            if (is_array($md) && is_array($md['terrain'] ?? null) && (int) ($md['amount'] ?? 0) > 0) {
                $special['move_discount'][] = ['terrain' => array_values(array_filter($md['terrain'], 'is_string')), 'amount' => min(3, (int) $md['amount'])];
            }
            foreach (self::normalize($params) as $eff) {
                $effects[] = $eff;
                if (isset($eff['when'])) {
                    if (self::whenSupported($eff['when'])) {
                        $c = ['code' => (string) $skill] + array_intersect_key($eff, ['atk_pct' => 1, 'def_pct' => 1]) + ['when' => $eff['when']];
                        if (isset($c['atk_pct']) || isset($c['def_pct'])) {   // heal 조건부는 미지원(치유는 무조건형만)
                            $conditional[] = $c;
                            continue;
                        }
                    }
                    $ignored[] = ['skill' => $skill, 'when' => $eff['when']];   // 미지원 조건: 무시(보존만)
                    continue;
                }
                foreach (self::KEYS as $k) {
                    if (isset($eff[$k])) {
                        $sum[$k] = ($sum[$k] ?? 0) + (int) $eff[$k];
                    }
                }
            }
        }

        return ['passive' => $sum ?: null, 'effects' => $effects, 'ignored' => $ignored, 'conditional' => $conditional, 'special' => $special];
    }

    /**
     * 조건부 효과 목록을 문맥으로 평가해 발동한 효과의 (값, 코드)를 모은다.
     * $role: 'atk'(소유자=공격자, atk_pct만 읽음) | 'def'(소유자=피격자, def_pct만 읽음).
     * $ctx: terrain(소유자 타일 지형 code), vs(상대 병종), hp_pct(소유자 hp 비율 0~100), counter(bool), target_full_hp(bool), moved(bool), adjacent(int),
     *       target_hp_pct(상대 hp 비율 0~100), target_terrain(상대 타일 지형 code)
     *
     * @param  array<int,array>  $skills
     * @return array{pct:float,codes:array<int,string>}
     */
    public static function evaluate(array $skills, string $role, array $ctx): array
    {
        $key = $role === 'atk' ? 'atk_pct' : 'def_pct';
        $pct = 0.0;
        $codes = [];
        foreach ($skills as $s) {
            $v = $s[$key] ?? 0;
            if ($v <= 0 || ! self::whenSupported($s['when'] ?? null)) {
                continue;
            }
            $mul = 1;
            foreach ($s['when'] as $k => $w) {
                $ok = match ($k) {
                    'terrain' => is_array($w) && in_array($ctx['terrain'] ?? null, $w, true),
                    'vs' => is_array($w) && in_array($ctx['vs'] ?? null, $w, true),
                    'hp_below_pct' => is_numeric($w) && ($ctx['hp_pct'] ?? 100) <= $w,
                    'counter' => $w === true && ! empty($ctx['counter']),
                    'target_full_hp' => $w === true && ! empty($ctx['target_full_hp']),
                    'moved' => $w === true && $role === 'atk' && ! empty($ctx['moved']),
                    'adjacent_allies' => is_numeric($w) && $w >= 1 && ($ctx['adjacent'] ?? 0) >= 1,
                    'target_hp_below_pct' => $role === 'atk' && is_numeric($w) && ($ctx['target_hp_pct'] ?? 100) <= $w,
                    'target_terrain' => $role === 'atk' && is_array($w) && in_array($ctx['target_terrain'] ?? null, $w, true),
                    default => false,
                };
                if (! $ok) {
                    continue 2;
                }
                if ($k === 'adjacent_allies') {
                    $mul = min((int) $w, (int) ($ctx['adjacent'] ?? 0));
                }
            }
            $pct += $v * $mul;
            $codes[] = $s['code'];
        }

        return ['pct' => $pct, 'codes' => $codes];
    }
}
