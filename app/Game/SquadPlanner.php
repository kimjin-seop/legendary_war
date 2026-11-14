<?php

namespace App\Game;

/**
 * squad on일 때 영웅별 부대 구성 계획(순수 PHP). 영웅 레벨 연동 부대 수(+troop_bonus, 상한), 병종 우선순위
 * (사용자 선택 > 영웅 프리셋 > 병종 기본 편성), 진영 유닛 총 상한(균등 감축).
 *
 * entry: ['row' => heroRow(unit_type, troop_bonus?), 'level' => int, 'troops' => ?string[] (사용자 선택), 'preset' => ?string[]]
 * cfg:   ['slots' => [[min_level, n], ...], 'slots_by_rarity' => [등급 => [[min_level, n], ...]](선택), 'cap' => 4, 'max_units' => 12, 'default_by_type' => [type => string[]]]
 *        slots_by_rarity 에 영웅 등급(row.rarity / count 의 $rarity)이 있으면 그 표를, 없으면 slots 를 쓴다.
 */
final class SquadPlanner
{
    /**
     * 계획 목록(string[])에 사용자가 지정한 위치([{class,x,y}])를 합친다: 위치 지정 유닛은 ['type','x','y'] 항목으로 앞에, 나머지는 문자열(자동 배치).
     * class가 계획과 다르면(고정 병종 규칙: 서버 결정 우선) 오류 없이 남은 계획 항목의 서버 병종을 쓴다.
     * 위치 지정 수가 남은 계획 수를 넘으면 \InvalidArgumentException.
     *
     * @param  string[]  $list
     * @param  array<int,array{class:string,x:int,y:int}>  $positioned
     * @return array<int,string|array{type:string,x:int,y:int}>
     */
    public static function mergePositions(array $list, array $positioned): array
    {
        $rest = array_values($list);
        $fixed = [];
        foreach ($positioned as $t) {
            $k = array_search($t['class'], $rest, true);
            if ($k === false) {
                $k = array_key_first($rest);   // 클라이언트 병종이 서버 결정과 다름 -> 서버 값 사용
                if ($k === null) {
                    throw new \InvalidArgumentException($t['class']);
                }
            }
            $type = $rest[$k];
            unset($rest[$k]);
            $fixed[] = ['type' => $type, 'x' => $t['x'], 'y' => $t['y']];
        }

        return array_merge($fixed, array_values($rest));
    }

    /** 레벨 -> 기본 부대 수(slots 표에서 min_level 이하 중 최대 행) */
    public static function slots(int $level, array $slots): int
    {
        $n = 0;
        foreach ($slots as [$min, $count]) {
            if ($level >= $min) {
                $n = $count;
            }
        }

        return $n;
    }

    /** 영웅의 부대 슬롯 수 = min(cap, 레벨 슬롯(등급별 표 우선) + troop_bonus) */
    public static function count(int $level, int $bonus, array $cfg, ?string $rarity = null): int
    {
        $table = $cfg['slots_by_rarity'][strtoupper((string) $rarity)] ?? $cfg['slots'];

        return max(0, min((int) $cfg['cap'], self::slots($level, $table) + $bonus));
    }

    /**
     * @param  array<int,array>  $entries
     * @return array<int,string[]> entry 인덱스별 부대 병종 목록
     */
    public static function plan(array $entries, array $cfg): array
    {
        $out = [];
        foreach ($entries as $i => $e) {
            $n = self::count((int) $e['level'], (int) ($e['row']['troop_bonus'] ?? 0), $cfg, $e['row']['rarity'] ?? null);
            $fixed = $e['row']['troop_type'] ?? null;
            if (is_string($fixed) && $fixed !== '') {
                // 영웅별 고정 병종: 슬롯 수만큼 그 병종 1종으로만 구성(사용자 troops·프리셋·default_by_type 무시)
                $list = array_fill(0, $n, $fixed);
            } elseif (! empty($e['troops'])) {
                $list = array_slice(array_values($e['troops']), 0, $n);   // 사용자 선택은 그대로 사용(슬롯보다 적으면 적게)
            } else {
                $src = ! empty($e['preset']) ? array_values($e['preset']) : ($cfg['default_by_type'][$e['row']['unit_type']] ?? ['sword', 'spear', 'archer']);
                $list = [];
                for ($k = 0; $k < $n; $k++) {
                    $list[] = $src[$k % count($src)];
                }
            }
            $out[$i] = $list;
        }
        // 진영 유닛 상한: 영웅 수 + 부대 수 합이 max_units를 넘으면 가장 부대가 많은 영웅(동률이면 뒤 슬롯)부터 1기씩 감축 = 균등 배분
        $total = count($entries) + array_sum(array_map('count', $out));
        while ($total > (int) $cfg['max_units']) {
            $pick = null;
            foreach ($out as $i => $list) {
                if ($list && ($pick === null || count($list) >= count($out[$pick]))) {
                    $pick = $i;
                }
            }
            if ($pick === null) {
                break;
            }
            array_pop($out[$pick]);
            $total--;
        }

        return $out;
    }
}
