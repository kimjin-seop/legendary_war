<?php

namespace App\Game;

/**
 * 영웅 레벨 마일스톤(레벨업 보상) 표. 원본 config('game.level_rewards.milestones'), 컨테이너 없는 단위 테스트에서는 DEFAULT.
 * 이미 동작하는 보상만 표기: 부대 수(config game.troop_slots_by_rarity 와 동일하게 유지), MP 계단 보너스(mp_bonus, MpRules::maxMp가 가산).
 * 스킬 슬롯 해금·사거리/이동 +1·돌파는 이번 범위 밖.
 */
final class LevelRewards
{
    public const DEFAULT = [
        ['level' => 10, 'label' => '부대 3개 편성 · 최대 MP +10', 'mp_bonus' => 10],
        ['level' => 20, 'by_rarity' => ['S' => 22, 'A' => 18, 'B' => 16, 'C' => 14], 'label' => '부대 4개 편성', 'mp_bonus' => 0],
        ['level' => 'max', 'label' => '만렙 · 최대 MP +10', 'mp_bonus' => 10],
    ];

    /** 영웅 등급별 만렙(config game.hero_max_level_by_grade, 없으면 game.max_level, 컨테이너 없으면 24) */
    public static function maxLevel(?string $rarity = null): int
    {
        $all = 24;
        $by = [];
        try {
            if (function_exists('app') && app()->bound('config')) {
                $all = (int) config('game.max_level', 24);
                $by = (array) config('game.hero_max_level_by_grade', []);
            }
        } catch (\Throwable) {
        }

        return isset($by[strtoupper((string) $rarity)]) ? min($all, (int) $by[strtoupper((string) $rarity)]) : $all;
    }

    /**
     * 등급별 해석된 마일스톤. level 은 정수(절대) | 'max'(그 등급 만렙), by_rarity[등급] 이 있으면 그 값이 우선(부대 4번째 해금 등 등급 상대 해금).
     * $rarity 가 null/미상이면 by_rarity 는 무시하고 level(절대, 'max'는 전체 만렙)을 쓴다.
     *
     * @return list<array{level:int,label:string,mp_bonus:int}> 레벨 오름차순
     */
    public static function milestones(?string $rarity = null): array
    {
        $rows = self::DEFAULT;
        try {
            if (function_exists('app') && app()->bound('config')) {
                $rows = (array) config('game.level_rewards.milestones', self::DEFAULT);
            }
        } catch (\Throwable) {
        }
        $rk = strtoupper((string) $rarity);
        $rows = array_map(function ($r) use ($rarity, $rk) {
            $lv = $r['by_rarity'][$rk] ?? $r['level'];

            return ['level' => $lv === 'max' ? self::maxLevel($rarity) : (int) $lv, 'label' => (string) $r['label'], 'mp_bonus' => (int) ($r['mp_bonus'] ?? 0)];
        }, $rows);
        usort($rows, fn ($a, $b) => $a['level'] <=> $b['level']);

        return $rows;
    }

    /** 레벨까지 도달한 마일스톤들의 MP 계단 보너스 합 */
    public static function mpBonus(int $level, ?string $rarity = null): int
    {
        $sum = 0;
        foreach (self::milestones($rarity) as $m) {
            if ($level >= $m['level']) {
                $sum += $m['mp_bonus'];
            }
        }

        return $sum;
    }

    /** 현재 레벨 기준 다음 마일스톤 {level,label} 또는 null */
    public static function next(int $level, ?string $rarity = null): ?array
    {
        foreach (self::milestones($rarity) as $m) {
            if ($m['level'] > $level) {
                return ['level' => $m['level'], 'label' => $m['label']];
            }
        }

        return null;
    }

    /** @return list<array{level:int,label:string,reached:bool}> */
    public static function view(int $level, ?string $rarity = null): array
    {
        return array_map(fn ($m) => ['level' => $m['level'], 'label' => $m['label'], 'reached' => $level >= $m['level']], self::milestones($rarity));
    }

    /** 이번 레벨업($from -> $to)으로 새로 넘은 마일스톤 [{level,label}] */
    public static function unlocked(int $from, int $to, ?string $rarity = null): array
    {
        $out = [];
        foreach (self::milestones($rarity) as $m) {
            if ($m['level'] > $from && $m['level'] <= $to) {
                $out[] = ['level' => $m['level'], 'label' => $m['label']];
            }
        }

        return $out;
    }
}
