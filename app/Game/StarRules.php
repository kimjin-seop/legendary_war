<?php

namespace App\Game;

use App\Support\Rarity;

/** 영웅 별(★) 강화 규칙(비용·보너스). 수치는 전부 config game.star(임시값). 순수 계산, DB 접근 없음. */
final class StarRules
{
    public static function max(): int
    {
        return max(0, (int) config('game.star.max', 5));
    }

    /** 해당 별 단계의 누적 보너스 %(공·방, 0=없음) */
    public static function bonusPct(int $star): float
    {
        return $star <= 0 ? 0.0 : (float) (config('game.star.bonus_pct', [])[min($star, self::max()) - 1] ?? 0);
    }

    /** 영웅 유닛에 가산할 별 보너스(Lv1 스탯 = 병종 기본 + 영웅 보너스 기준, 체력 제외) @return array{atk:int,def:int} */
    public static function bonus(array $unitType, array $hero, int $star): array
    {
        $pct = self::bonusPct($star);

        return $pct <= 0 ? ['atk' => 0, 'def' => 0] : [
            'atk' => (int) round(((int) $unitType['atk'] + (int) $hero['atk_bonus']) * $pct / 100),
            'def' => (int) round(((int) $unitType['def'] + (int) $hero['def_bonus']) * $pct / 100),
        ];
    }

    /** 현재 $star 에서 다음 별로 올리는 비용. 최고 단계면 null @return array{gold:int,shards_need:int}|null */
    public static function cost(string $rarity, int $star): ?array
    {
        if ($star < 0 || $star >= self::max()) {
            return null;
        }
        $r = Rarity::normalize($rarity);
        $cfg = (array) config('game.star');

        return [
            'gold' => (int) round((float) ($cfg['gold'][$star] ?? 0) * (float) ($cfg['gold_mult'][$r] ?? 1.0)),
            'shards_need' => (int) ($cfg['shard_pieces'][$star] ?? 0) * (int) ($cfg['shard_unit'][$r] ?? 0),
        ];
    }

    /** GET /api/heroes 항목용: star_next{gold,shards_need,bonus_pct}|null */
    public static function next(string $rarity, int $star): ?array
    {
        $c = self::cost($rarity, $star);

        return $c === null ? null : $c + ['bonus_pct' => self::bonusPct($star + 1)];
    }
}
