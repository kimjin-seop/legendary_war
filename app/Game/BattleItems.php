<?php

namespace App\Game;

/** 전투 소모품 정의 로더(database/data/battle_items.json). 파일이 없거나 깨져도 빈 정의(소모품 비활성)로 폴백한다. */
final class BattleItems
{
    private static ?array $doc = null;

    private static function doc(): array
    {
        if (self::$doc === null) {
            $p = database_path('data/battle_items.json');
            $d = is_file($p) ? json_decode((string) file_get_contents($p), true) : null;
            self::$doc = is_array($d) ? $d : ['enabled' => false, 'items' => []];
        }

        return self::$doc;
    }

    public static function enabled(): bool
    {
        return (bool) (self::doc()['enabled'] ?? false);
    }

    public static function maxPerBattle(): int
    {
        return max(0, (int) (self::doc()['max_per_battle'] ?? 3));
    }

    public static function maxStack(): int
    {
        return max(1, (int) (self::doc()['max_stack'] ?? 99));
    }

    public static function maxBuyQty(): int
    {
        return max(1, (int) (self::doc()['max_buy_qty'] ?? 10));
    }

    /** @return array<string,array> code => 정의(enabled 만) */
    public static function all(): array
    {
        $out = [];
        foreach ((array) (self::doc()['items'] ?? []) as $it) {
            if (! empty($it['enabled']) && isset($it['code'])) {
                $out[(string) $it['code']] = $it;
            }
        }

        return $out;
    }

    public static function get(?string $code): ?array
    {
        return $code === null ? null : (self::all()[$code] ?? null);
    }
}
