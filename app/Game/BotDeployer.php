<?php

namespace App\Game;

/** 봇 배치 휴리스틱: 근접은 전열, 지휘관은 중열, 원거리/마법/치유는 후열(배치 영역 내). */
final class BotDeployer
{
    /**
     * @param array $items [['key'=>mixed,'type'=>string,'commander'=>bool], ...]
     * @return array<mixed,array{0:int,1:int}> key => [x,y]
     */
    public static function place(Engine $engine, array &$state, string $side, array $zone, array $items): array
    {
        $xs = array_column($zone, 0);
        $frontX = $side === 'a' ? max($xs) : min($xs);
        $taken = [];
        foreach ($state['units'] as $u) {
            $taken["{$u['x']},{$u['y']}"] = true;
        }
        $rank = fn ($it) => $it['commander'] ? 1 : (self::isRanged($engine, $it['type']) ? 2 : 0);
        usort($items, fn ($a, $b) => $rank($a) <=> $rank($b));
        $out = [];
        foreach ($items as $it) {
            $want = $rank($it);
            $moveType = $engine->rules()->unitType($it['type'])['move_type'];
            $best = null;
            $bestScore = null;
            foreach ($zone as [$x, $y]) {
                if (isset($taken["$x,$y"]) || ! $engine->passable($state, $moveType, $x, $y)) {
                    continue;
                }
                // 시드별 배치 다양성: 중앙 행 선호에 0~2의 난수 가산(같은 시드면 같은 배치)
                $score = [abs(abs($x - $frontX) - $want), abs($y - ($state['height'] - 1) / 2) + Rng::int($state, 3), $y, $x];
                if ($bestScore === null || $score < $bestScore) {
                    $bestScore = $score;
                    $best = [$x, $y];
                }
            }
            if ($best === null) {
                throw new IllegalAction('no_space_for_deploy', '배치할 빈 타일이 부족합니다.');
            }
            $taken["{$best[0]},{$best[1]}"] = true;
            $out[$it['key']] = $best;
        }

        return $out;
    }

    private static function isRanged(Engine $engine, string $type): bool
    {
        $t = $engine->rules()->unitType($type);

        return $t['range_max'] > 1 || $t['heal'] > 0;
    }
}
