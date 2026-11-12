<?php

namespace App\Game;

/**
 * 맵 검증기(순수 PHP, DB 미사용). 맵 배열: [code, width, height, tiles(행 문자열[]), spawns{a,b}, deploy_zones{a,b}].
 * 이동 가능성은 병종(move_type)별 '진입 비용 <= 해당 move_type 최소 이동력'인 타일만 통행으로 본다(비용이 이동력보다 큰 지형은 영구 진입 불가).
 * 결과 행: [check, level(OK|WARN|ERROR), detail].
 */
final class MapChecker
{
    public const MOVE_TYPES = ['foot', 'mounted'];   // 병종 v2: heavy 폐지. naval은 4b)에서 수상 칸이 있는 맵에 한해 별도 검사

    public function __construct(
        private readonly RuleSet $rules,
        private readonly float $tolerance = 0.25,       // 진영 간 접근 비용 비대칭 허용 비율
        private readonly float $maxBlockedRatio = 0.35, // 보병 통행 불가 타일 비율 상한
        private readonly float $maxSingleRatio = 0.5,   // 단일 지형 비율 상한
    ) {
    }

    /** @return array<int,array{0:string,1:string,2:string}> */
    public function check(array $map): array
    {
        $rows = [];
        $w = (int) $map['width'];
        $h = (int) $map['height'];
        $tiles = $map['tiles'];
        $syms = $this->rules->symbols;

        // 1) 정의되지 않은 지형 문자 / 크기 정합
        $undefined = [];
        $grid = [];
        if (count($tiles) !== $h) {
            $rows[] = ['크기', 'ERROR', 'tiles 행 수 '.count($tiles)." != height $h"];
        }
        foreach ($tiles as $y => $row) {
            if (mb_strlen($row) !== $w) {
                $rows[] = ['크기', 'ERROR', "행 $y 길이 ".mb_strlen($row)." != width $w"];
            }
            foreach (str_split($row) as $x => $ch) {
                if (! isset($syms[$ch])) {
                    $undefined[$ch][] = "$x,$y";
                    $grid[$y][$x] = null;
                } else {
                    $grid[$y][$x] = $syms[$ch];
                }
            }
        }
        foreach ($undefined as $ch => $at) {
            $rows[] = ['지형 문자', 'ERROR', "정의 안 된 문자 '$ch' ".count($at).'칸 (예: '.implode(' ', array_slice($at, 0, 3)).')'];
        }
        if (! $undefined) {
            $rows[] = ['지형 문자', 'OK', '모든 문자 정의됨'];
        }
        if ($undefined) {
            return $rows;   // 이후 검사는 지형을 알아야 하므로 중단
        }

        $enter = fn (int $x, int $y, string $mt) => $this->rules->terrainMod($grid[$y][$x], $mt)['cost'];
        $minMove = [];
        foreach ($this->rules->unitTypes as $t) {
            $minMove[$t['move_type']] = min($minMove[$t['move_type']] ?? 99, $t['move']);
        }
        $passable = fn (int $x, int $y, string $mt) => $x >= 0 && $y >= 0 && $x < $w && $y < $h
            && ($c = $enter($x, $y, $mt)) !== null && $c <= ($minMove[$mt] ?? 99);

        // 2) deploy_zones: 범위/통행/겹침, spawns: 범위/통행/중복
        $zone = $map['deploy_zones'] ?? [];
        $bad = [];
        foreach (['a', 'b'] as $s) {
            foreach ($zone[$s] ?? [] as [$x, $y]) {
                if (! $passable($x, $y, 'foot')) {
                    $bad[] = "$s($x,$y)";
                }
            }
        }
        $rows[] = ['배치 영역 통행', $bad ? 'ERROR' : 'OK', $bad ? '보병 통행 불가 칸: '.implode(' ', array_slice($bad, 0, 5)) : 'a/b 모든 칸 통행 가능'];
        $setA = array_map(fn ($c) => "$c[0],$c[1]", $zone['a'] ?? []);
        $overlap = array_intersect($setA, array_map(fn ($c) => "$c[0],$c[1]", $zone['b'] ?? []));
        $rows[] = ['배치 영역 겹침', $overlap ? 'ERROR' : 'OK', $overlap ? '겹침: '.implode(' ', array_slice($overlap, 0, 5)) : '겹침 없음'];
        $spBad = [];
        $spVoid = [];
        $seen = [];
        $deployKeys = array_flip(array_map(fn ($c) => "$c[0],$c[1]", array_merge($zone['a'] ?? [], $zone['b'] ?? [])));
        foreach (['a', 'b'] as $s) {
            foreach ($map['spawns'][$s] ?? [] as [$x, $y]) {
                if (! $passable($x, $y, 'foot') || isset($seen["$x,$y"])) {
                    // 허공(전 병종 불가) 위 스폰이 배치 영역에서 제외돼 있으면 원본 보존용 -> WARN, 그 외는 ERROR
                    if (! isset($seen["$x,$y"]) && $this->isVoid($grid[$y][$x] ?? '') && ! isset($deployKeys["$x,$y"])) {
                        $spVoid[] = "$s($x,$y)";
                    } else {
                        $spBad[] = "$s($x,$y)";
                    }
                }
                $seen["$x,$y"] = true;
            }
        }
        $rows[] = ['스폰', $spBad ? 'ERROR' : ($spVoid ? 'WARN' : 'OK'), $spBad ? '통행 불가/중복: '.implode(' ', $spBad) : ($spVoid ? '허공 위 스폰(원본 보존, 배치 영역 제외): '.implode(' ', $spVoid) : '통행 가능, 중복 없음')];

        // 3) 지휘관 스폰 간 도달 가능성 + 접근 비용 대칭
        $a = $map['spawns']['a'][0] ?? null;
        $b = $map['spawns']['b'][0] ?? null;
        if ($a && $b) {
            foreach (self::MOVE_TYPES as $mt) {
                if (! isset($minMove[$mt])) {
                    continue;
                }
                $ab = $this->dijkstra($w, $h, $a, $b, $mt, $passable, $enter);
                $ba = $this->dijkstra($w, $h, $b, $a, $mt, $passable, $enter);
                if ($ab === null || $ba === null) {
                    $rows[] = ["도달 $mt", 'ERROR', '지휘관 스폰 간 경로 없음 (a->b '.($ab ?? '불가').', b->a '.($ba ?? '불가').", 최소 이동력 {$minMove[$mt]})"];

                    continue;
                }
                $diff = abs($ab - $ba) / max(1, max($ab, $ba));
                $rows[] = ["도달 $mt", $diff > $this->tolerance ? 'WARN' : 'OK', sprintf('a->b %d, b->a %d (비대칭 %.0f%%, 허용 %.0f%%)', $ab, $ba, 100 * $diff, 100 * $this->tolerance)];
            }
        }

        // 4) 지형 비율
        $count = [];
        $blocked = 0;
        $water = 0;
        $voidN = 0;
        foreach ($grid as $y => $line) {
            foreach ($line as $x => $terr) {
                $count[$terr] = ($count[$terr] ?? 0) + 1;
                if ($this->isVoid($terr)) {
                    $voidN++;   // 허공은 의도된 장식(영구 통행 불가): 통행불가 비율에서 제외
                } else {
                    $blocked += $enter($x, $y, 'foot') === null ? 1 : 0;
                }
                $this->rules->isWater($terr) && $water++;
            }
        }
        $total = max(1, $w * $h);
        arsort($count);
        $other = $count;
        unset($other['plain']);   // 평지는 별도 범위(30~85%), 그 외 단일 지형은 maxSingleRatio 이하
        foreach (array_keys($other) as $k) {   // 수상 지형(바다 등)과 허공은 해전·서가 맵의 의도된 주 지형이라 단일 지형 비율 검사에서 제외
            ($this->rules->isWater($k) || $this->isVoid($k)) && $water + $voidN > 0 && ($other[$k] = 0);
        }
        $plainRatio = ($count['plain'] ?? 0) / max(1, $w * $h);
        $waterMap = $water / $total >= 0.3;   // 해전 맵: 평지 비율 하한 검사 생략
        $topOther = $other ? max($other) / max(1, $w * $h) : 0;
        $ratioMsg = implode(', ', array_map(fn ($k, $v) => sprintf('%s %.0f%%', $k, 100 * $v / $total), array_keys($count), $count));
        $bl = $blocked / $total;
        $rows[] = ['지형 비율', ($bl > $this->maxBlockedRatio || $topOther > $this->maxSingleRatio || (! $waterMap && ($plainRatio < 0.3 || $plainRatio > 0.85))) ? 'WARN' : 'OK',
            sprintf('보병 통행불가 %.0f%% (상한 %.0f%%) | %s', 100 * $bl, 100 * $this->maxBlockedRatio, $ratioMsg)];

        // 4b) 수병(naval) 도달성: 수상 칸이 있는 맵은 수병도 양 지휘관 스폰 사이를 오갈 수 있어야 한다(해전 맵 필수)
        if ($a && $b && $water > 0 && isset($minMove['naval'])) {
            $nab = $this->dijkstra($w, $h, $a, $b, 'naval', $passable, $enter);
            $rows[] = ['도달 naval', $nab === null ? 'ERROR' : 'OK', $nab === null ? '수병이 지휘관 스폰 간 이동 불가' : "a->b $nab"];
        }

        // 5) 고립 영역: 보병 통행 가능 타일 중 a 지휘관 스폰에서 닿지 못하는 타일
        if ($a) {
            $reach = $this->flood($w, $h, $a, 'foot', $passable, $enter);
            $iso = [];
            for ($y = 0; $y < $h; $y++) {
                for ($x = 0; $x < $w; $x++) {
                    if ($passable($x, $y, 'foot') && ! isset($reach["$x,$y"])) {
                        $iso[] = "$x,$y";
                    }
                }
            }
            // 의도된 닫힌 성·책: map['known_isolated'] = [[x,y],...] (maps.meta.known_isolated 형식). 해당 칸은 WARN 대신 INFO
            $known = [];
            foreach ((array) ($map['known_isolated'] ?? []) as $c) {
                is_array($c) && count($c) >= 2 && $known[((int) $c[0]).','.((int) $c[1])] = true;
            }
            $okIso = array_values(array_filter($iso, fn ($k) => isset($known[$k])));
            $iso = array_values(array_filter($iso, fn ($k) => ! isset($known[$k])));
            if ($iso) {
                $rows[] = ['고립 영역', 'WARN', count($iso).'칸 고립 (예: '.implode(' ', array_slice($iso, 0, 4)).')'.($okIso ? ", 의도된 고립 ".count($okIso).'칸 제외' : '')];
            } elseif ($okIso) {
                $rows[] = ['고립 영역', 'INFO', count($okIso).'칸 고립 = meta.known_isolated 로 기록된 의도된 닫힌 영역 (예: '.implode(' ', array_slice($okIso, 0, 4)).')'];
            } else {
                $rows[] = ['고립 영역', 'OK', '고립 없음'];
            }
        }

        return $rows;
    }

    /** 허공(void): 비행 포함 전 병종 영구 불가인 장식 지형. 성벽(wall)은 방어 구조물이라 포함하지 않는다 */
    private function isVoid(string $terrain): bool
    {
        return $terrain === 'void';
    }

    /** a에서 b까지 최소 이동 비용(진입 비용 합). 경로 없으면 null */
    private function dijkstra(int $w, int $h, array $from, array $to, string $mt, \Closure $passable, \Closure $enter): ?int
    {
        $best = ["{$from[0]},{$from[1]}" => 0];
        $q = new \SplPriorityQueue;
        $q->insert($from, 0);
        while (! $q->isEmpty()) {
            [$x, $y] = $q->extract();
            $c = $best["$x,$y"];
            if ($x === $to[0] && $y === $to[1]) {
                return $c;
            }
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if (! $passable($nx, $ny, $mt)) {
                    continue;
                }
                $nc = $c + $enter($nx, $ny, $mt);
                if ($nc < ($best["$nx,$ny"] ?? PHP_INT_MAX)) {
                    $best["$nx,$ny"] = $nc;
                    $q->insert([$nx, $ny], -$nc);
                }
            }
        }

        return null;
    }

    /** @return array<string,true> */
    private function flood(int $w, int $h, array $from, string $mt, \Closure $passable, \Closure $enter): array
    {
        $seen = ["{$from[0]},{$from[1]}" => true];
        $stack = [$from];
        while ($stack) {
            [$x, $y] = array_pop($stack);
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if ($passable($nx, $ny, $mt) && ! isset($seen["$nx,$ny"])) {
                    $seen["$nx,$ny"] = true;
                    $stack[] = [$nx, $ny];
                }
            }
        }

        return $seen;
    }
}
