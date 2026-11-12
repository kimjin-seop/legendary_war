<?php

namespace App\Game;

/**
 * 영웅 레벨 마일스톤(레벨업 보상) 표. 원본 config('game.level_rewards.milestones'), 컨테이너 없는 단위 테스트에서는 DEFAULT.
 * 이미 동작하는 보상만 표기: 부대 수(config game.troop_slots 와 동일하게 유지), MP 계단 보너스(mp_bonus, MpRules::maxMp가 가산).
 * 스킬 슬롯 해금·사거리/이동 +1·돌파는 이번 범위 밖.
 */
final class LevelRewards
{
    public const DEFAULT = [
        ['level' => 10, 'label' => '부대 3개 편성 · 최대 MP +10', 'mp_bonus' => 10],
        ['level' => 20, 'label' => '부대 4개 편성', 'mp_bonus' => 0],
        ['level' => 30, 'label' => '최대 MP +10', 'mp_bonus' => 10],
    ];

    /** @return list<array{level:int,label:string,mp_bonus:int}> 레벨 오름차순 */
    public static function milestones(): array
    {
        $rows = self::DEFAULT;
        try {
            if (function_exists('app') && app()->bound('config')) {
                $rows = (array) config('game.level_rewards.milestones', self::DEFAULT);
            }
        } catch (\Throwable) {
        }
        $rows = array_map(fn ($r) => ['level' => (int) $r['level'], 'label' => (string) $r['label'], 'mp_bonus' => (int) ($r['mp_bonus'] ?? 0)], $rows);
        usort($rows, fn ($a, $b) => $a['level'] <=> $b['level']);

        return $rows;
    }

    /** 레벨까지 도달한 마일스톤들의 MP 계단 보너스 합 */
    public static function mpBonus(int $level): int
    {
        $sum = 0;
        foreach (self::milestones() as $m) {
            if ($level >= $m['level']) {
                $sum += $m['mp_bonus'];
            }
        }

        return $sum;
    }

    /** 현재 레벨 기준 다음 마일스톤 {level,label} 또는 null */
    public static function next(int $level): ?array
    {
        foreach (self::milestones() as $m) {
            if ($m['level'] > $level) {
                return ['level' => $m['level'], 'label' => $m['label']];
            }
        }

        return null;
    }

    /** @return list<array{level:int,label:string,reached:bool}> */
    public static function view(int $level): array
    {
        return array_map(fn ($m) => ['level' => $m['level'], 'label' => $m['label'], 'reached' => $level >= $m['level']], self::milestones());
    }

    /** 이번 레벨업($from -> $to)으로 새로 넘은 마일스톤 [{level,label}] */
    public static function unlocked(int $from, int $to): array
    {
        $out = [];
        foreach (self::milestones() as $m) {
            if ($m['level'] > $from && $m['level'] <= $to) {
                $out[] = ['level' => $m['level'], 'label' => $m['label']];
            }
        }

        return $out;
    }
}
