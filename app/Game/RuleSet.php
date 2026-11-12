<?php

namespace App\Game;

/** 병종/상성/지형 규칙 조회용 읽기 전용 값 객체. */
final class RuleSet
{
    /**
     * @param array<string,array> $unitTypes code => [move,range_min,range_max,hp,atk,def,move_type,heal]
     * @param array<string,array<string,float>> $matchups attacker => defender => multiplier
     * @param array<string,array<string,array{cost:?int,def_pct:int}>> $terrains terrain => move_type => mod
     * @param array<string,string> $symbols 맵 문자 => terrain code
     */
    public function __construct(
        public readonly array $unitTypes,
        public readonly array $matchups,
        public readonly array $terrains,
        public readonly array $symbols = ['p' => 'plain', 'f' => 'forest', 'm' => 'mountain', 'w' => 'water', 'c' => 'castle'],
        public readonly array $terrainAttrs = [],   // terrain => [elevation, cover, heals] (지형 규칙 2단계)
    ) {
    }

    public function unitType(string $code): array
    {
        return $this->unitTypes[$code] ?? throw new \InvalidArgumentException("unknown unit type $code");
    }

    public function multiplier(string $attackerType, string $defenderType): float
    {
        return (float) ($this->matchups[$attackerType][$defenderType] ?? 1.0);
    }

    public function terrainAttr(string $terrain, string $key): int
    {
        return (int) ($this->terrainAttrs[$terrain][$key] ?? 0);
    }

    /** 수상 칸(sea·reef·harbor·shallows 등, terrains.water=1): 수병 수상 보너스 판정 */
    public function isWater(string $terrain): bool
    {
        return $this->terrainAttr($terrain, 'water') > 0;
    }

    /** 배 탑승 칸(sea·reef, terrains.boarding=1): 비수병이 서면 '탑승(boarded)' 파생 상태. 비행(flying)은 탑승하지 않는다. */
    public function isBoardingTerrain(string $terrain): bool
    {
        return $this->terrainAttr($terrain, 'boarding') > 0;
    }

    /** 유닛 병종이 해당 칸에서 배에 탑승한 상태인가(foot·mounted 계열만. naval은 항상 자기 배, flying은 탑승 없음) */
    public function isBoarded(string $unitType, string $terrain): bool
    {
        return $this->isBoardingTerrain($terrain) && in_array($this->unitType($unitType)['move_type'], ['foot', 'mounted'], true);
    }

    /** @return array{cost:?int,def_pct:int} */
    public function terrainMod(string $terrain, string $moveType): array
    {
        return $this->terrains[$terrain][$moveType] ?? ['cost' => 1, 'def_pct' => 0];
    }
}
