<?php

namespace App\Game;

/**
 * 액티브 스킬 params 스키마(원본: database/data/active_skill_templates_proposal.json param_schema).
 * 적재(GameData::heroActives)는 normalize()로 범위를 clamp하고, 시드 커맨드는 violations()로 범위 밖 값을 거부한다.
 * 모든 수치는 가정 시작값(미측정).
 */
final class ActiveParams
{
    /** 템플릿별 [키 => [type, min, max, default]]. enum/bool/int. int의 default=null이면 호출자가 별도 처리(uses 등) */
    private const SCHEMA = [
        'T_ACTIVE_STRIKE' => ['power_pct' => ['int', 100, 150, 100], 'cooldown' => ['int', 0, 9, 3], 'uses' => ['int', 1, 9, null], 'element' => ['element']],
        'T_ACTIVE_AOE' => ['power_pct' => ['int', 80, 120, 100], 'radius' => ['int', 1, 1, 1], 'splash_pct' => ['int', 40, 70, 60], 'friendly_fire' => ['bool', null, null, false],
            'cooldown' => ['int', 3, 6, 4], 'uses' => ['int', 1, 2, 1], 'element' => ['element']],
        'T_ACTIVE_BUFF' => ['stat' => ['enum', ['atk', 'def', 'move'], null, null], 'amount' => ['int', 1, 30, null], 'duration' => ['int', 1, 2, 1],
            'target_mode' => ['enum', ['self_area', 'ally'], null, 'self_area'], 'radius' => ['int', 0, 2, 2], 'cast_range' => ['int', 1, 3, 2],
            'cooldown' => ['int', 3, 6, 4], 'uses' => ['int', 1, 2, 2]],
        'T_ACTIVE_HEAL' => ['heal_flat' => ['int', 10, 30, 14], 'heal_pct' => ['int', 15, 30, 20], 'radius' => ['int', 0, 1, 0], 'area_pct' => ['int', 40, 70, 50],
            'cast_range' => ['int', 1, 3, 2], 'cooldown' => ['int', 3, 6, 4], 'uses' => ['int', 1, 3, 2]],
        'T_ACTIVE_SURGE' => ['move_bonus' => ['int', 1, 3, 2], 'attack_pct' => ['int', 100, 115, 100], 'min_turn' => ['int', 1, 5, 2], 'leap' => ['bool', null, null, false],
            'cooldown' => ['int', 3, 6, 4], 'uses' => ['int', 1, 3, 2]],
        // S급 전용(2단계). PIERCE = 대상 기본 방어 def_ignore_pct% 무시 강타, STANCE = 반경 내 아군 반격 피해 +counter_pct% 및 반격 상성 불리 1.0 취급
        'T_ACTIVE_PIERCE' => ['power_pct' => ['int', 100, 150, 120], 'def_ignore_pct' => ['int', 20, 40, 30], 'cooldown' => ['int', 3, 6, 4], 'uses' => ['int', 1, 2, 1], 'element' => ['element']],
        'T_ACTIVE_STANCE' => ['counter_pct' => ['int', 30, 60, 50], 'radius' => ['int', 1, 2, 2], 'duration' => ['int', 1, 2, 1], 'cooldown' => ['int', 3, 6, 4], 'uses' => ['int', 1, 2, 1]],
    ];

    /** BUFF amount의 stat별 허용 범위 */
    private const BUFF_AMOUNT = ['atk' => [8, 15, 10], 'def' => [15, 30, 20], 'move' => [1, 2, 1]];

    public const MP_COST_MIN = 5;

    public const MP_COST_MAX = 100;

    public static function has(string $template): bool
    {
        return isset(self::SCHEMA[$template]);
    }

    /**
     * 검증된 params(스키마 키만, 범위 clamp, 기본값 채움). $defaultUses = 스키마에 uses 기본이 없는 템플릿(STRIKE)의 기본 횟수.
     * 필수 값(BUFF stat)이 없거나 enum 밖이면 null(정의 무효). $warn에 clamp/무효 사유를 모은다.
     *
     * @return array<string,mixed>|null
     */
    public static function normalize(string $template, array $raw, int $defaultUses, array &$warn = []): ?array
    {
        $out = [];
        foreach (self::SCHEMA[$template] as $key => $spec) {
            if ($spec[0] === 'element') {   // 선택 키: 허용 속성 코드일 때만 포함(없거나 알 수 없으면 생략 + 경고)
                $el = Elements::valid($raw[$key] ?? null);
                if ($el !== null) {
                    $out[$key] = $el;
                } elseif (isset($raw[$key])) {
                    $warn[] = 'element='.(is_scalar($raw[$key]) ? $raw[$key] : 'invalid').': 알 수 없는 속성(무시)';
                }

                continue;
            }
            [$type, $a, $b, $def] = $spec;
            $v = $raw[$key] ?? null;
            if ($type === 'enum') {
                if ($v === null) {
                    $v = $def;
                }
                if (! in_array($v, $a, true)) {
                    $warn[] = "{$key}={$v}: 허용값 밖";

                    return null;
                }
                $out[$key] = $v;

                continue;
            }
            if ($type === 'bool') {
                $out[$key] = $key === 'leap' ? false : (bool) ($v ?? $def);   // leap(유닛 통과 도약)은 v1 비허용
                if ($key === 'leap' && $v) {
                    $warn[] = 'leap=true는 v1 비허용(false로 고정)';
                }

                continue;
            }
            [$min, $max] = [$a, $b];
            if ($template === 'T_ACTIVE_BUFF' && $key === 'amount') {
                [$min, $max, $def] = self::BUFF_AMOUNT[$out['stat']];
            }
            $def ??= $key === 'uses' ? $defaultUses : $min;
            $n = is_numeric($v) ? (int) $v : $def;
            $c = max($min, min($max, $n));
            if ($v !== null && $c !== $n || ($v !== null && ! is_numeric($v))) {
                $warn[] = "{$key}={$n}: 범위 {$min}~{$max}로 보정";
            }
            $out[$key] = $c;
        }
        // MP 방식 비용 재정의(선택 키, 스키마 공통): 있을 때만 포함. 범위 5~100. cooldown/uses는 MP 모드에서 무시되며 레거시 전투용으로만 유지
        if (isset($raw['mp_cost'])) {
            $n = is_numeric($raw['mp_cost']) ? (int) $raw['mp_cost'] : MpRules::cost($template, $out);
            $c = max(self::MP_COST_MIN, min(self::MP_COST_MAX, $n));
            if ($c !== $n || ! is_numeric($raw['mp_cost'])) {
                $warn[] = "mp_cost={$n}: 범위 ".self::MP_COST_MIN.'~'.self::MP_COST_MAX.'로 보정';
            }
            $out['mp_cost'] = $c;
        }

        return $out;
    }

    /**
     * 시드용 엄격 검증: 스키마 밖 키, 범위 밖/타입 불일치 값을 사유 목록으로 반환(비어 있으면 통과).
     *
     * @return string[]
     */
    public static function violations(string $template, array $raw): array
    {
        if (! self::has($template)) {
            return ["미지원 템플릿 {$template}"];
        }
        $bad = [];
        foreach (array_diff(array_keys($raw), array_keys(self::SCHEMA[$template]), ['mp_cost']) as $k) {
            $bad[] = "알 수 없는 키 {$k}";
        }
        if (isset($raw['element']) && Elements::valid($raw['element']) === null) {
            $bad[] = 'element='.(is_scalar($raw['element']) ? $raw['element'] : 'invalid').': 알 수 없는 속성';
        }
        $warn = [];
        $norm = self::normalize($template, $raw, 2, $warn);
        if ($norm === null) {
            return array_merge($bad, $warn);
        }
        foreach ($raw as $k => $v) {
            if (isset($norm[$k]) && $norm[$k] !== $v && ! (is_bool($norm[$k]) && (bool) $v === $norm[$k])) {
                $fmt = fn ($x) => is_scalar($x) || $x === null ? (string) $x : json_encode($x, JSON_UNESCAPED_UNICODE);   // 배열 값 보간 경고 방지
                $bad[] = "{$k}=".$fmt($v).'는 허용 범위 밖(보정값 '.$fmt($norm[$k]).')';
            }
        }
        if ($template === 'T_ACTIVE_BUFF' && ! array_key_exists('stat', $raw)) {
            $bad[] = 'stat 필수';
        }

        return $bad;
    }
}
