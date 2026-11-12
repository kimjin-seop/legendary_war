<?php

namespace App\Game;

/**
 * 액티브 스킬 MP 방식 공식(한 곳). 모든 수치는 가정 시작값(미측정, 밸런스 대상).
 * mp_max(마력) = clamp(rarity 기본 + 2 x (level-1) + caster 보정, 30, 160), 회복 = max(min, round(mp_max x regen_pct/100)).
 * mp_cost = skills.params.mp_cost 우선, 없으면 템플릿별 기본 공식(반올림 정수, 최소 1).
 */
final class MpRules
{
    /** 영웅 마력 기본안(사용자 확정 2026-11-04, 임밸런 재측정 전 시작값): C40/B60/A80/S100 */
    public const RARITY_BASE = ['C' => 40, 'B' => 60, 'A' => 80, 'S' => 100];

    public const CASTER_TYPES = ['mage', 'healer'];

    public const DEFAULTS = ['mp_start_pct' => 50, 'mp_regen_pct' => 15, 'mp_regen_min' => 5, 'mp_skip_first_regen' => 1, 'mp_wait_pct' => 0];

    /** 노브 조회(엔진 옵션 배열 또는 null=기본값) */
    public static function knob(?array $opts, string $key): int
    {
        return (int) ($opts[$key] ?? self::DEFAULTS[$key]);
    }

    /** 최대 MP. $rarity 미상(null/알 수 없음)이면 C 기준 */
    public static function maxMp(?string $rarity, int $level, ?string $unitType): int
    {
        $base = self::RARITY_BASE[strtoupper((string) $rarity)] ?? self::RARITY_BASE['C'];
        $caster = in_array($unitType, self::CASTER_TYPES, true) ? 20 : 0;   // 마법사·치유사 +20

        return max(30, min(160, $base + 2 * (max(1, $level) - 1) + $caster + LevelRewards::mpBonus($level)));   // 레벨 마일스톤 계단 보너스(config game.level_rewards)
    }

    public static function startMp(int $mpMax, ?array $opts = null): int
    {
        return (int) round($mpMax * max(0, min(100, self::knob($opts, 'mp_start_pct'))) / 100);
    }

    /** 진영 턴/라운드 시작 회복량 */
    public static function regen(int $mpMax, ?array $opts = null): int
    {
        return max(self::knob($opts, 'mp_regen_min'), (int) round($mpMax * self::knob($opts, 'mp_regen_pct') / 100));
    }

    /** wait 추가 회복량(노브 0이면 0) */
    public static function waitRegen(int $mpMax, ?array $opts = null): int
    {
        $p = self::knob($opts, 'mp_wait_pct');

        return $p > 0 ? max(1, (int) round($mpMax * $p / 100)) : 0;
    }

    /** 스킬 MP 비용. $params = 검증된 params(mp_cost 있으면 우선) */
    public static function cost(string $template, array $params): int
    {
        if (isset($params['mp_cost']) && is_numeric($params['mp_cost'])) {
            return max(1, (int) $params['mp_cost']);
        }
        $p = fn (string $k, int $d) => (int) ($params[$k] ?? $d);
        $v = match ($template) {
            'T_ACTIVE_STRIKE' => 20 + ($p('power_pct', 100) - 100) * 0.5,
            'T_ACTIVE_AOE' => 35 + ($p('power_pct', 100) - 100) * 0.5 + ($p('splash_pct', 60) - 60) * 0.5,
            'T_ACTIVE_BUFF' => match ($params['stat'] ?? 'atk') {
                'def' => 10 + $p('amount', 20) * 0.75,
                'move' => 20,
                default => 22 + $p('amount', 10) * 0.8,
            },
            'T_ACTIVE_HEAL' => 30 + ($p('radius', 0) >= 1 ? 4 : 0),
            'T_ACTIVE_SURGE' => 20 + ($p('attack_pct', 100) >= 110 ? 3 : 0),
            'T_ACTIVE_PIERCE' => 28 + ($p('power_pct', 120) - 100) * 0.5 + ($p('def_ignore_pct', 30) - 30) * 0.3,
            'T_ACTIVE_STANCE' => 24,
            default => 30,
        };

        return max(1, (int) round($v));
    }
}
