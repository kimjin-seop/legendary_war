<?php

namespace App\Game;

/** 시드 고정 재현용 xorshift32. 상태는 정수 하나(state['rng'])로 직렬화된다. */
final class Rng
{
    public static function next(array &$state): int
    {
        $x = $state['rng'] & 0xFFFFFFFF;
        if ($x === 0) {
            $x = 0x9E3779B9;
        }
        $x ^= ($x << 13) & 0xFFFFFFFF;
        $x ^= $x >> 17;
        $x ^= ($x << 5) & 0xFFFFFFFF;
        $state['rng'] = $x;

        return $x;
    }

    /** 0 <= r < $n */
    public static function int(array &$state, int $n): int
    {
        return $n <= 1 ? 0 : self::next($state) % $n;
    }

    public static function seedToState(int $seed): int
    {
        $s = ($seed * 2654435761) & 0xFFFFFFFF;

        return $s === 0 ? 1 : $s;
    }
}
