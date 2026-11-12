<?php

namespace App\Game;

/**
 * 전투 이벤트 조건 평가기(순수 함수, 상태 불변). Cues(on.when)와 BattleStory(trigger.type=cond)가 공용으로 쓴다. 스펙: docs/CUTSCENE_SPEC.md 6절.
 *
 * 노드 = {all:[node...]} | {any:[node...]} | {not:node} | leaf. leaf = {type, ...}:
 *  turn_gte{value} | hp_pct_lte{unit,pct} | defeated{unit} | alive_count{side,op?,value,kind?} | in_zone{unit|side,tiles|rect} | adjacent{a,b} | flag{key,value?}
 * unit 참조: 유닛 id("b5","n0") | "hero:<code>" | "ally_npc:<code>"(아군 NPC 만, 정확 일치 우선·npc_X<->X 별칭) | "enemy_commander"(b 지휘관) | "ally_commander"(a 지휘관) | "@protagonist"(a측 영웅 코드가 protagonist_ 로 시작). adjacent.b / in_zone.side 는 "side:a|b" 도 허용.
 * 알 수 없는 type·형식 오류는 normalize 에서 null(저작 오류 -> 호출부가 항목을 버림). 평가 중 값 누락은 false.
 */
final class EventConditions
{
    private const MAX_DEPTH = 4;

    /** 검증·정규화. 유효하지 않으면 null. */
    public static function normalize(mixed $n, int $depth = 0): ?array
    {
        if (! is_array($n) || $depth > self::MAX_DEPTH) {
            return null;
        }
        foreach (['all', 'any'] as $k) {
            if (array_key_exists($k, $n)) {
                if (! is_array($n[$k]) || $n[$k] === [] || count($n[$k]) > 10) {
                    return null;
                }
                $c = [];
                foreach (array_values($n[$k]) as $x) {
                    if (($y = self::normalize($x, $depth + 1)) === null) {
                        return null;
                    }
                    $c[] = $y;
                }

                return [$k => $c];
            }
        }
        if (array_key_exists('not', $n)) {
            $y = self::normalize($n['not'], $depth + 1);

            return $y === null ? null : ['not' => $y];
        }
        $ref = fn ($v) => is_string($v) && $v !== '' && strlen($v) <= 40;
        $int = fn ($v, $lo, $hi) => is_int($v) && $v >= $lo && $v <= $hi;
        $side = fn ($v) => in_array($v, ['a', 'b'], true);

        return match ($n['type'] ?? null) {
            'turn_gte' => $int($n['value'] ?? null, 1, 99) ? ['type' => 'turn_gte', 'value' => $n['value']] : null,
            'hp_pct_lte' => $ref($n['unit'] ?? null) && $int($n['pct'] ?? null, 0, 100) ? ['type' => 'hp_pct_lte', 'unit' => $n['unit'], 'pct' => $n['pct']] : null,
            'defeated' => $ref($n['unit'] ?? null) ? ['type' => 'defeated', 'unit' => $n['unit']] : null,
            'retreated' => $ref($n['unit'] ?? null) ? ['type' => 'retreated', 'unit' => $n['unit']] : null,
            'alive_count' => $side($n['side'] ?? null) && $int($n['value'] ?? null, 0, 99) && in_array($n['op'] ?? 'lte', ['lte', 'gte', 'eq'], true) && in_array($n['kind'] ?? 'any', ['any', 'hero', 'troop'], true)
                ? ['type' => 'alive_count', 'side' => $n['side'], 'op' => $n['op'] ?? 'lte', 'value' => $n['value'], 'kind' => $n['kind'] ?? 'any'] : null,
            'in_zone' => self::zone($n, $ref),
            'adjacent' => $ref($n['a'] ?? null) && $ref($n['b'] ?? null) ? ['type' => 'adjacent', 'a' => $n['a'], 'b' => $n['b']] : null,
            'unit_distance_lte' => $ref($n['a'] ?? null) && $ref($n['b'] ?? null) && $int($n['distance'] ?? null, 0, 40) ? ['type' => 'unit_distance_lte', 'a' => $n['a'], 'b' => $n['b'], 'distance' => $n['distance']] : null,
            'unit_enter_tile' => $side($n['side'] ?? null) && is_string($n['tile_tag'] ?? null) && preg_match('/^[a-z0-9_]{1,32}$/', $n['tile_tag']) ? ['type' => 'unit_enter_tile', 'side' => $n['side'], 'tile_tag' => $n['tile_tag']] : null,
            'flag' => is_string($n['key'] ?? null) && preg_match('/^[a-z0-9_]{1,32}$/', $n['key']) ? ['type' => 'flag', 'key' => $n['key'], 'value' => $n['value'] ?? true] : null,
            default => null,
        };
    }

    private static function zone(array $n, \Closure $ref): ?array
    {
        $who = isset($n['unit']) && $ref($n['unit']) ? ['unit' => $n['unit']] : (in_array($n['side'] ?? null, ['a', 'b'], true) ? ['side' => $n['side']] : null);
        if ($who === null) {
            return null;
        }
        $cell = fn ($c) => is_array($c) && count($c) === 2 && is_int($c[0] ?? null) && is_int($c[1] ?? null) && $c[0] >= 0 && $c[1] >= 0;
        if (isset($n['rect'])) {
            $r = $n['rect'];
            if (! is_array($r) || count($r) !== 4 || count(array_filter($r, fn ($v) => is_int($v) && $v >= 0)) !== 4 || $r[0] > $r[2] || $r[1] > $r[3]) {
                return null;
            }

            return ['type' => 'in_zone', 'rect' => array_values($r)] + $who;
        }
        $t = is_array($n['tiles'] ?? null) ? array_slice($n['tiles'], 0, 60) : [];
        $t = array_values(array_filter($t, $cell));

        return $t === [] ? null : ['type' => 'in_zone', 'tiles' => $t] + $who;
    }

    /** 평가. $cond 는 normalize 를 통과한 값이어야 한다. */
    public static function evaluate(array $cond, array $state): bool
    {
        if (isset($cond['all'])) {
            foreach ($cond['all'] as $c) {
                if (! self::evaluate($c, $state)) {
                    return false;
                }
            }

            return true;
        }
        if (isset($cond['any'])) {
            foreach ($cond['any'] as $c) {
                if (self::evaluate($c, $state)) {
                    return true;
                }
            }

            return false;
        }
        if (isset($cond['not'])) {
            return ! self::evaluate($cond['not'], $state);
        }

        return match ($cond['type'] ?? null) {
            'turn_gte' => (int) ($state['turn'] ?? 0) >= $cond['value'],
            'hp_pct_lte' => self::anyUnit($state, $cond['unit'], fn ($u) => $u['max_hp'] > 0 && $u['hp'] * 100 <= $u['max_hp'] * $cond['pct']),
            'defeated' => self::defeated($state, $cond['unit']),
            'retreated' => self::defeated(['defeated' => $state['retreated'] ?? []], $cond['unit']),   // state.retreated 도 같은 모양({side,kind,hero})
            'alive_count' => self::aliveCount($state, $cond),
            'in_zone' => self::inZone($state, $cond),
            'adjacent' => self::adjacent($state, $cond['a'], $cond['b']),
            'unit_distance_lte' => self::distanceLte($state, $cond['a'], $cond['b'], $cond['distance']),
            // 타일 태그: state.tile_tags[tag] = [[x,y]..] 를 제공하는 전투에서만 평가(현재 제공 맵 없음 -> false). 최초 진입 1회는 호출부(BattleStory fired)가 보장
            'unit_enter_tile' => ($tiles = $state['tile_tags'][$cond['tile_tag']] ?? null) !== null && is_array($tiles) && $tiles !== []
                && self::inZone($state, ['side' => $cond['side'], 'tiles' => array_values(array_filter($tiles, fn ($t) => is_array($t) && count($t) === 2))]),
            'flag' => ($state['flags'][$cond['key']] ?? false) === $cond['value'],
            default => false,
        };
    }

    /** 참조에 맞는 살아있는 유닛 id 목록 */
    public static function units(array $state, string $ref): array
    {
        $out = [];
        foreach ($state['units'] ?? [] as $id => $u) {
            if (($u['hp'] ?? 0) > 0 && self::matches((string) $id, $u, $ref)) {
                $out[] = (string) $id;
            }
        }

        return $out;
    }

    /** 유닛 참조 일치(격파 기록 등 {side,kind,hero} 형태에도 사용) */
    public static function matchesRef(string $id, array $u, string $ref): bool
    {
        return self::matches($id, $u, $ref);
    }

    private static function matches(string $id, array $u, string $ref): bool
    {
        return match (true) {
            str_starts_with($ref, 'hero:') => ($u['hero'] ?? null) === substr($ref, 5) || ($u['npc_ref'] ?? null) === substr($ref, 5)
                || (str_starts_with($ref, 'hero:npc_') && $u['side'] === 'a' && ($u['hero'] ?? null) === substr($ref, 9)),   // 같은 인물 별칭: 플레이어가 실제 영웅 X 를 출전시켜 npc_X 지원이 빠졌으면 hero:npc_X 는 아군(a) 영웅 X 를 가리킨다(ArmyBuilder::samePersonOnSide)
            str_starts_with($ref, 'ally_npc:') => self::allyNpcRank($u, substr($ref, 9)) > 0,   // 아군 NPC 한정(플레이어 소유 동일 코드 영웅 제외)
            str_starts_with($ref, 'side:') => $u['side'] === substr($ref, 5),
            $ref === 'player_hero_any' => $u['side'] === 'a' && $u['kind'] !== 'troop' && empty($u['npc_ally']),   // 플레이어 편성 영웅(아군 NPC·병사 제외)
            $ref === '@protagonist' => $u['side'] === 'a' && (str_starts_with((string) ($u['hero'] ?? ''), 'protagonist_') || ! empty($u['sim_protagonist'])),   // 주인공(영웅 코드 protagonist_*)
            $ref === 'enemy_commander' => $u['side'] === 'b' && $u['kind'] === 'commander',
            $ref === 'ally_commander' => $u['side'] === 'a' && $u['kind'] === 'commander',
            default => $id === $ref,
        };
    }

    /**
     * `ally_npc:<code>` 일치 등급: 2=정확(hero/npc_ref == code), 1=별칭(npc_X <-> X), 0=불일치. npc_ally 유닛(및 그 격파·퇴각 기록의 npc_ally 플래그)만 대상.
     */
    public static function allyNpcRank(array $u, string $code): int
    {
        if (empty($u['npc_ally']) || $code === '') {
            return 0;
        }
        if (($u['hero'] ?? null) === $code || ($u['npc_ref'] ?? null) === $code) {
            return 2;
        }
        $alias = str_starts_with($code, 'npc_') ? substr($code, 4) : 'npc_'.$code;

        return ($u['hero'] ?? null) === $alias || ($u['npc_ref'] ?? null) === $alias ? 1 : 0;
    }

    private static function anyUnit(array $state, string $ref, \Closure $pred): bool
    {
        foreach (self::units($state, $ref) as $id) {
            if ($pred($state['units'][$id])) {
                return true;
            }
        }

        return false;
    }

    /** 격파 기록(state.defeated, Engine::resolveDeath 가 cues/story 가 있는 전투에서만 기록)에서 참조와 일치하는 유닛이 있는가 */
    private static function defeated(array $state, string $ref): bool
    {
        foreach ($state['defeated'] ?? [] as $id => $d) {
            if (self::matches((string) $id, $d, $ref)) {
                return true;
            }
        }

        return false;
    }

    private static function aliveCount(array $state, array $c): bool
    {
        $n = count(array_filter($state['units'] ?? [], fn ($u) => $u['side'] === $c['side'] && ($u['hp'] ?? 0) > 0
            && ($c['kind'] === 'any' || ($c['kind'] === 'troop') === ($u['kind'] === 'troop'))));

        return match ($c['op']) {
            'gte' => $n >= $c['value'],
            'eq' => $n === $c['value'],
            default => $n <= $c['value'],
        };
    }

    private static function inZone(array $state, array $c): bool
    {
        $in = function (array $u) use ($c): bool {
            if (isset($c['rect'])) {
                return $u['x'] >= $c['rect'][0] && $u['y'] >= $c['rect'][1] && $u['x'] <= $c['rect'][2] && $u['y'] <= $c['rect'][3];
            }
            foreach ($c['tiles'] as $t) {
                if ($t[0] === $u['x'] && $t[1] === $u['y']) {
                    return true;
                }
            }

            return false;
        };

        return self::anyUnit($state, $c['unit'] ?? 'side:'.$c['side'], $in);
    }

    /** 맵 meta.tile_tags 정규화: {태그(소문자·숫자·밑줄 1~32자): [[x,y]..]} 맵 안 정수 칸만(태그당 200칸, 최대 16태그). 형식이 틀리면 [] */
    public static function normalizeTileTags(mixed $raw, int $w, int $h): array
    {
        $out = [];
        foreach (is_array($raw) ? array_slice($raw, 0, 16, true) : [] as $tag => $cells) {
            if (! is_string($tag) || ! preg_match('/^[a-z0-9_]{1,32}$/', $tag) || ! is_array($cells)) {
                continue;
            }
            $ok = [];
            foreach (array_slice($cells, 0, 200) as $c) {
                if (is_array($c) && count($c) === 2 && is_int($c[0] ?? null) && is_int($c[1] ?? null) && $c[0] >= 0 && $c[1] >= 0 && $c[0] < $w && $c[1] < $h) {
                    $ok[] = [$c[0], $c[1]];
                }
            }
            $ok !== [] && $out[$tag] = $ok;
        }

        return $out;
    }

    private static function distanceLte(array $state, string $a, string $b, int $n): bool
    {
        $bs = self::units($state, $b);
        foreach (self::units($state, $a) as $ia) {
            foreach ($bs as $ib) {
                if ($ia !== $ib && Engine::dist($state['units'][$ia]['x'], $state['units'][$ia]['y'], $state['units'][$ib]['x'], $state['units'][$ib]['y']) <= $n) {
                    return true;
                }
            }
        }

        return false;
    }

    private static function adjacent(array $state, string $a, string $b): bool
    {
        $bs = self::units($state, $b);
        foreach (self::units($state, $a) as $ia) {
            foreach ($bs as $ib) {
                if ($ia !== $ib && Engine::dist($state['units'][$ia]['x'], $state['units'][$ia]['y'], $state['units'][$ib]['x'], $state['units'][$ib]['y']) <= 1) {
                    return true;
                }
            }
        }

        return false;
    }
}
