<?php

namespace App\Game;

/**
 * 전투 연출(cue): stages.rules.cues 에서 읽어 전투 생성 시 state['cues']에 고정. 판정에 영향 없음(move 는 위치만 바꾸는 스크립트 이동).
 * 스키마·이벤트 형식은 docs/CUTSCENE_SPEC.md. cues 가 없는 전투(방 모드 PvP·solo 포함)는 모든 메서드가 즉시 반환한다.
 */
final class Cues
{
    private const DO = ['say', 'camera', 'sfx', 'shake', 'move', 'fire', 'set_flag', 'spawn', 'terrain_change', 'retreat', 'defect', 'set_hp',
        'spawn_actor', 'walk', 'despawn_actor', 'face', 'wait', 'parallel'];   // 뒤 6개: 연출용 액터/보행(docs/CUTSCENE_ACTOR_WALK_20261108.md), 판정 제외

    private const ACTOR_RE = '/^[a-z0-9_]{1,24}$/';

    private const DIRS = ['up', 'down', 'left', 'right'];

    public const ACTOR_MAX = 12;   // 전투당 동시 액터 상한

    private const PARALLEL_DO = ['walk', 'say', 'face', 'wait', 'spawn_actor', 'despawn_actor'];

    /** 입력 검증/정규화. 잘못된 항목은 건너뛴다(예외 없음). */
    public static function normalize(mixed $raw): array
    {
        $out = [];
        foreach (is_array($raw) ? array_values($raw) : [] as $i => $c) {
            if (! is_array($c) || ! in_array($c['do'] ?? null, self::DO, true) || ! is_array($c['on'] ?? null)) {
                continue;
            }
            $on = $c['on'];
            $when = null;
            if (array_key_exists('when', $on)) {   // 조건 기반 발동: 라운드 >= on.turn(기본 1) 이후 조건(EventConditions)이 참이 되는 첫 시점 1회
                if (($when = EventConditions::normalize($on['when'])) === null || (isset($on['turn']) && ! (is_int($on['turn']) && $on['turn'] >= 1 && $on['turn'] <= 99))) {
                    continue;
                }
                $turn = $on['turn'] ?? 1;
            } elseif (! empty($on['battle_start'])) {
                $turn = 0;
            } elseif (isset($on['turn']) && is_int($on['turn']) && $on['turn'] >= 1 && $on['turn'] <= 99) {
                $turn = $on['turn'];
            } else {
                continue;
            }
            $e = ['id' => 'c'.$i, 'turn' => $turn, 'do' => $c['do']] + ($when !== null ? ['when' => $when] : []);
            $ok = match ($c['do']) {
                'say' => self::sayBody($c, $e),
                'camera' => self::camera($c, $e),
                'spawn_actor', 'walk', 'despawn_actor', 'face', 'wait', 'parallel' => self::actorDo($c['do'], $c, $e),
                'sfx' => is_string($c['key'] ?? null) && $c['key'] !== '' && ($e += ['key' => $c['key']]),
                'shake' => ($e += ['power' => min(10, max(1, (int) ($c['power'] ?? 3))), 'ms' => min(2000, max(100, (int) ($c['ms'] ?? 400)))]) !== [],
                'move' => is_string($c['unit'] ?? null) && self::cell($c['to'] ?? null) !== null && ($e += ['unit' => $c['unit'], 'to' => self::cell($c['to'])]),
                'fire' => self::fire($c, $e),
                'spawn' => self::spawn($c, $e),
                'terrain_change' => self::terrainChange($c, $e),
                'retreat' => is_string($c['unit'] ?? null) && $c['unit'] !== '' && ($e += ['unit' => $c['unit'], 'reason' => ($c['reason'] ?? 'retreat') === 'death' ? 'death' : 'retreat']),   // reason:"death" = 연출용 사망(defeated 기록도 남김)
                'defect' => is_string($c['unit'] ?? null) && $c['unit'] !== '' && in_array($c['to'] ?? 'a', ['a', 'b'], true) && ($e += ['unit' => $c['unit'], 'to' => $c['to'] ?? 'a']),   // 이탈·배신: 소속 진영 전환
                'set_hp' => is_string($c['unit'] ?? null) && $c['unit'] !== '' && is_int($c['pct'] ?? null) && $c['pct'] >= 1 && $c['pct'] <= 100 && ($e += ['unit' => $c['unit'], 'pct' => $c['pct']]),   // 병력을 max_hp 의 pct% 이하로(낮추기만, 최소 1): 중상 생존 연출
                'set_flag' => is_string($c['key'] ?? null) && preg_match('/^[a-z0-9_]{1,32}$/', $c['key']) && (is_bool($v = $c['value'] ?? true) || is_int($v)) && ($e += ['key' => $c['key'], 'value' => $v]),
            };
            $ok && $out[] = $e;
        }

        return $out;
    }

    /** normalize 에서 조용히 버려지는 항목 수(시드·저작 검증용 경고 근거). raw 가 비어 있으면 0 */
    public static function dropped(mixed $raw): int
    {
        return is_array($raw) ? count($raw) - count(self::normalize($raw)) : 0;
    }

    /** 전투 생성 시 state 고정(cues 없으면 아무것도 기록하지 않음 = 기존 동작). */
    public static function initialize(array &$state, mixed $raw): void
    {
        $cues = self::normalize($raw);
        if (($n = self::dropped($raw)) > 0) {
            \Illuminate\Support\Facades\Log::warning("cues: 잘못된 항목 {$n}건이 무시됨(저작 오류 확인, docs/CUTSCENE_SPEC.md)");
        }
        if ($cues !== []) {
            $state['cues'] = $cues;
            $state['cue_done'] = [];
            $state['cue_start'] = [];
            $state['cue_fires'] = [];
        }
    }

    /**
     * 적 배치가 끝난 직후 호출: cue 의 unit 값 'UNIT@x,y' 를 그 칸에서 시작한 적(side b) 유닛 id 로 치환한다(저작 시점에는 id 를 모르기 때문).
     * 그 칸에 정확히 있는 유닛이 없으면 맨해튼 거리가 가장 가까운 적 유닛(동률은 id 순, 다른 자리표시에 쓴 유닛 제외). 적이 없으면 자리표시를 그대로 둔다(resolveUnit 이 null -> 건너뜀). cues 없으면 무동작.
     */
    public static function bindUnitPlaceholders(array &$state): void
    {
        if (empty($state['cues'])) {
            return;
        }
        $used = [];   // 자리표시 문자열 => 유닛 id (같은 자리표시는 같은 유닛)
        foreach ($state['cues'] as $i => $c) {
            if (! is_string($c['unit'] ?? null) || ! preg_match('/^UNIT@(\d+),(\d+)$/', $c['unit'], $m)) {
                continue;
            }
            $key = $c['unit'];
            if (! isset($used[$key])) {
                $best = null;
                $bd = PHP_INT_MAX;
                $ids = array_map('strval', array_keys($state['units']));
                sort($ids, SORT_NATURAL);
                foreach ($ids as $id) {
                    $u = $state['units'][$id];
                    $d = abs($u['x'] - (int) $m[1]) + abs($u['y'] - (int) $m[2]);
                    if ($u['side'] === 'b' && ! in_array($id, $used, true) && $d < $bd && ($d === 0 || ($u['kind'] ?? null) !== 'commander')) {   // 정확 일치가 아닌 폴백에서는 지휘관 제외
                        $best = $id;
                        $bd = $d;
                    }
                }
                $best !== null && $used[$key] = $best;
            }
            isset($used[$key]) && $state['cues'][$i]['unit'] = $used[$key];
        }
    }

    /** 각 엔진 행동 직후(봇 포함)와 배치 확정 직후(battleStart=true)에 호출. 조건 turn: 현재 라운드 >= N 이고 아직 안 한 cue 를 정의 순서대로 발동. */
    public static function collect(Engine $engine, array &$state, array &$events, bool $battleStart = false): void
    {
        SubObjectives::tick($state);   // 서브 목표 갱신(없으면 무동작; cues 유무와 무관)
        StageRules::check($engine, $state, $events);   // 승패 규칙(win_mode/lose_conditions, 없으면 무동작): 행동 직후
        self::runCues($engine, $state, $events, $battleStart);
        StageRules::check($engine, $state, $events);   // cue(move/spawn/terrain_change)가 바꾼 상태도 즉시 반영
    }

    private static function runCues(Engine $engine, array &$state, array &$events, bool $battleStart): void
    {
        if (empty($state['cues']) || ($state['status'] ?? 'active') !== 'active') {
            return;
        }
        $turn = (int) $state['turn'];
        foreach ($state['cue_fires'] as $k => $f) {   // 지속 라운드가 끝난 불 소멸
            if ($turn >= $f['until_turn']) {
                Engine::emit($state, $events, 'cue', ['do' => 'fire_end', 'cue_id' => $f['cue_id']]);
                unset($state['cue_fires'][$k]);
            }
        }
        $state['cue_fires'] = array_values($state['cue_fires']);
        foreach ($state['cues'] as $c) {
            if (($state['status'] ?? 'active') !== 'active') {
                break;   // cue move 로 도달형 목표가 달성돼 전투가 끝났으면 남은 cue 는 발동하지 않는다
            }
            if (in_array($c['id'], $state['cue_done'], true) || ($c['turn'] === 0 ? ! $battleStart : $turn < $c['turn'])) {
                continue;
            }
            if (isset($c['when']) && ! EventConditions::evaluate($c['when'], $state)) {
                continue;   // 조건 미충족: 아직 안 한 것으로 두고 다음 행동 후 재평가
            }
            $state['cue_done'][] = $c['id'];
            $before = count($events);
            $payload = ['do' => $c['do'], 'cue_id' => $c['id']];
            switch ($c['do']) {
                case 'say':
                    if (self::speakerGone($state, $c['speaker'])) {   // 전장에서 격파·퇴각한 영웅(hero:<code> 화자)의 대사는 건너뜀(죽은 유닛이 말하지 않도록)
                        $payload = null;
                        break;
                    }
                    $payload += ['speaker' => $c['speaker'], 'expr' => $c['expr'], 'text' => $c['text']] + BattleStory::lineFx($c) + array_intersect_key($c, ['actor' => 1, 'during' => 1, 'focus' => 1]);
                    break;
                case 'spawn_actor': case 'walk': case 'despawn_actor': case 'face': case 'wait':
                    $payload = self::actorEvent($engine, $state, $events, $c, $payload);   // 연출 전용(state.actors). 실제 유닛 walk 는 move 이벤트를 직접 emit
                    break;
                case 'parallel':
                    $group = $state['cue_group'] = ((int) ($state['cue_group'] ?? 0)) + 1;
                    foreach ($c['cues'] as $ch) {
                        $cp = ['do' => $ch['do'], 'cue_id' => $c['id']];
                        if ($ch['do'] === 'say') {
                            $cp = self::speakerGone($state, $ch['speaker']) ? null : $cp + ['speaker' => $ch['speaker'], 'expr' => $ch['expr'], 'text' => $ch['text']] + BattleStory::lineFx($ch) + array_intersect_key($ch, ['actor' => 1, 'during' => 1, 'focus' => 1]);
                        } else {
                            $cp = self::actorEvent($engine, $state, $events, $ch + ['id' => $c['id']], $cp, ['group' => $group]);
                        }
                        $cp !== null && Engine::emit($state, $events, 'cue', $cp + ['group' => $group]);
                    }
                    $payload = null;
                    break;
                case 'camera': $payload += array_diff_key($c, ['id' => 1, 'turn' => 1, 'do' => 1]);
                    isset($c['unit']) && ($camUid = self::resolveUnit($state, $c['unit'])) !== null && $payload['unit_id'] = $camUid;   // 발동 시점에 해석한 유닛 id(없으면 FE 가 unit/tile 로 폴백)
                    break;
                case 'sfx': $payload += ['key' => $c['key']];
                    break;
                case 'shake': $payload += ['power' => $c['power'], 'ms' => $c['ms']];
                    break;
                case 'move':
                    $uid = self::resolveUnit($state, $c['unit'], true);
                    if ($uid !== null && $engine->scriptMove($state, $events, $uid, $c['to'][0], $c['to'][1], ['cue_id' => $c['id'], 'scripted' => true]) && ! empty($state['units'][$uid]['npc_ally'])) {   // 막히면 조용히 건너뜀
                        $state['units'][$uid]['moved'] = true;   // 아군 NPC: 연출 이동 칸에 그 턴 동안 머문다(BattleService::allyPhase 는 moved 유닛을 건너뜀 -> 같은 턴 AI 가 되돌리지 않음)
                    }
                    $payload = null;
                    break;
                case 'spawn':
                    $leader = $state['units'][$c['side'].'0'] ?? null;
                    $hero = $c['hero'] !== null ? (self::$heroResolver ? (self::$heroResolver)($c['hero']) : null) : null;
                    if ($c['hero'] !== null && ! $hero) {
                        $payload = null;   // 영웅 행을 못 찾으면(시뮬레이터 등 resolver 없음) 조용히 건너뜀
                        break;
                    }
                    if ($c['hero'] !== null && $c['side'] === 'a' && ($dupId = ArmyBuilder::samePersonOnSide($state, 'a', $c['hero'])) !== null) {
                        $c['must_survive'] && $state['units'][$dupId]['must_survive'] = true;
                        $payload = null;   // 플레이어가 같은 인물의 실제 영웅을 출전시킴: NPC 지원 소환 생략
                        break;
                    }
                    $type = $hero['unit_type'] ?? $c['unit_type'];
                    if ($type === null || ! isset($engine->rules()->unitTypes[$type])) {
                        $payload = null;
                        break;
                    }
                    for ($k = 0, $cnt = (int) ($c['count'] ?? 1); $k < $cnt; $k++) {   // count 기본 1: 각 유닛은 cells 중 가장 가까운 빈 칸에 차례로 생성(칸 없으면 skipped reinforce)
                        $newId = $engine->spawnUnit($state, $events, ['side' => $c['side'], 'cells' => $c['cells'], 'level' => $c['level'] ?? ($leader['level'] ?? 1), 'type' => $type, 'hero' => $hero, 'ready' => $c['ready'], 'tag' => $c['tag'],
                        'npc_ally' => $c['npc_ally'], 'must_survive' => $c['must_survive'], 'growth' => (float) ($state['troop_growth'] ?? 3.0), 'cue_id' => $c['id']]);   // 칸 없음은 skipped reinforce 이벤트
                        $hero !== null && $newId !== null && self::spawnCompanions($engine, $state, $events, $newId, $hero, $c);   // 영웅 동반 일반병(state.companions 설정이 있을 때만)
                    }
                    $payload = null;
                    break;
                case 'set_flag':
                    $state['flags'][$c['key']] = $c['value'];   // 상태만 바꾸는 무음 cue(이벤트 없음): when.flag 조건과 짝
                    $payload = null;
                    break;
                case 'retreat':   // 퇴각: 지휘관·주인공은 불가(조용히 건너뜀). 이벤트는 Engine::retreatUnit 이 unit_removed 로 발행
                    $uid = self::resolveUnit($state, $c['unit'], true);
                    $uid !== null && $engine->retreatUnit($state, $events, $uid, $c['id'], ($c['reason'] ?? 'retreat') === 'death');
                    $payload = null;
                    break;
                case 'defect':   // 이탈·배신: 유닛(과 소속 병사)의 진영을 전환. 지휘관·주인공은 불가(조용히 건너뜀). 이벤트는 Engine::defectUnit 이 unit_defected 로 발행
                    $uid = self::resolveUnit($state, $c['unit'], true);
                    $uid !== null && $engine->defectUnit($state, $events, $uid, $c['to'], $c['id']);
                    $payload = null;
                    break;
                case 'set_hp':   // 연출용 HP 조정: 현재 hp 를 ceil(max_hp*pct/100) 이하로만 낮춘다(최소 1 -> 사망·지휘관 패배·must_survive 판정 없음)
                    $uid = self::resolveUnit($state, $c['unit'], true);
                    if ($uid !== null) {
                        $u = $state['units'][$uid];
                        $to = max(1, min((int) $u['hp'], (int) ceil($u['max_hp'] * $c['pct'] / 100)));
                        if ($to < $u['hp']) {
                            $state['units'][$uid]['hp'] = $to;
                            $payload += ['unit_id' => $uid, 'hp_before' => (int) $u['hp'], 'hp_after' => $to, 'max_hp' => (int) $u['max_hp']];
                            break;
                        }
                    }
                    $payload = null;
                    break;
                case 'terrain_change':   // 지형 변경: 점유 칸·범위 밖·미정의 지형은 건너뜀. state.tiles 를 직접 바꿔 이동/방어 판정이 즉시 갱신되고 tile_patch 에 누적(FE 셀 갱신용)
                    $to = $c['to'];
                    $changed = [];
                    $skipped = [];
                    foreach ($c['tiles'] as [$x, $y]) {
                        if (! isset($engine->rules()->terrains[$to]) || ! $engine->inBounds($state, $x, $y) || $engine->unitAt($state, $x, $y) !== null) {
                            $skipped[] = [$x, $y];

                            continue;
                        }
                        $from = $state['tiles'][$y][$x];
                        $state['tiles'][$y][$x] = $to;
                        $tileExtra = isset($c['tile']) ? ['tile' => $c['tile']] : [];   // 선택 tile 지정(없으면 기존 형태 그대로)
                        $state['tile_patch'][] = ['x' => $x, 'y' => $y, 'to' => $to] + $tileExtra;
                        $changed[] = ['x' => $x, 'y' => $y, 'from' => $from, 'to' => $to] + $tileExtra;
                    }
                    $payload += ['to' => $to, 'changed' => $changed, 'skipped' => $skipped] + (isset($c['fx']) ? array_intersect_key($c, ['fx' => 1, 'ms' => 1, 'dir' => 1]) : []);
                    break;
                case 'fire':
                    $tiles = array_values(array_filter($c['tiles'], fn ($t) => $engine->inBounds($state, $t[0], $t[1])));
                    if ($tiles === []) {
                        $payload = null;
                        break;
                    }
                    $until = $turn + $c['turns'];
                    $state['cue_fires'][] = ['cue_id' => $c['id'], 'tiles' => $tiles, 'until_turn' => $until];
                    $payload += ['tiles' => $tiles, 'turns' => $c['turns'], 'until_turn' => $until];
                    break;
            }
            $payload !== null && Engine::emit($state, $events, 'cue', $payload);
            if ($battleStart) {
                $state['cue_start'] = array_merge($state['cue_start'], array_slice($events, $before));
            }
        }
    }

    /** 뷰: 배치 확정 시 발동한 cue 이벤트(재접속 복원용)와 현재 타오르는 불 */
    public static function view(array $state): array
    {
        return empty($state['cues']) ? ['start' => [], 'fires' => []] : ['start' => $state['cue_start'] ?? [], 'fires' => $state['cue_fires'] ?? [], 'tile_patch' => $state['tile_patch'] ?? []]
            + (! empty($state['actors']) ? ['actors' => array_values($state['actors'])] : []);   // 연출 액터(판정 제외): 존재할 때만 노출
    }

    /** 정규화 cue 를 정의 순서로 평탄화(parallel 하위는 group 번호 부여) */
    private static function flatten(array $norm): array
    {
        $out = [];
        foreach ($norm as $c) {
            if ($c['do'] === 'parallel') {
                foreach ($c['cues'] as $ch) {
                    $out[] = $ch + ['id' => $c['id'], 'group' => $c['id']];
                }
            } else {
                $out[] = $c;
            }
        }

        return $out;
    }

    /**
     * 액터 참조 정적 검증(정규화된 cue 배열 기준, 정의 순서): 중복 spawn, spawn 전 참조, despawn 후 사용, 동시 액터 상한 초과, 미정의 during(walk id) 참조.
     *
     * @return list<string> 경고 문구(없으면 [])
     */
    public static function validateActors(array $norm): array
    {
        $msg = [];
        $used = [];
        $alive = [];
        $walkIds = [];
        foreach (self::flatten($norm) as $c) {
            isset($c['walk_id']) && $walkIds[$c['walk_id']] = true;
        }
        $ref = function (string $id, array $c) use (&$used, &$alive, &$msg) {
            if (! isset($used[$id])) {
                $msg[] = "{$c['id']} {$c['do']}: 액터 {$id} 가 spawn_actor 이전에 참조됨";
            } elseif (! isset($alive[$id])) {
                $msg[] = "{$c['id']} {$c['do']}: 액터 {$id} 는 이미 despawn 됨";
            }
        };
        foreach (self::flatten($norm) as $c) {
            switch ($c['do']) {
                case 'spawn_actor':
                    if (isset($used[$c['actor']])) {
                        $msg[] = "{$c['id']} spawn_actor: 액터 {$c['actor']} 중복 spawn";
                        break;
                    }
                    $used[$c['actor']] = true;
                    $alive[$c['actor']] = true;
                    count($alive) > self::ACTOR_MAX && $msg[] = "{$c['id']} spawn_actor: 동시 액터 ".count($alive).' > 상한 '.self::ACTOR_MAX.' (런타임에 무시됨)';
                    break;
                case 'despawn_actor':
                    $ref($c['actor'], $c);
                    unset($alive[$c['actor']]);
                    break;
                case 'walk': case 'face':
                    isset($c['actor']) && $ref($c['actor'], $c);
                    break;
                case 'say':
                    isset($c['actor']) && $ref($c['actor'], $c);
                    if (is_string($c['speaker'] ?? null) && str_starts_with($c['speaker'], 'actor:')) {
                        $ref(substr($c['speaker'], 6), $c);
                    }
                    isset($c['during']) && ! isset($walkIds[$c['during']]) && $msg[] = "{$c['id']} say: during {$c['during']} 에 해당하는 walk id 없음";
                    break;
            }
        }

        return $msg;
    }

    /**
     * 연출 액터 보행 정적 검증(docs/CUTSCENE_ACTOR_WALK_20261108.md 2.3). 실제 유닛(unit) walk 는 검증하지 않는다(마지막 칸만 런타임 scriptMove 규칙).
     * 규칙: 4방향 인접·맵 경계·병종 통행 지형(ship 액터는 수상 칸 허용)·적대 시작 배치 칸 통과 금지(같은 편은 passCost>0 이면 경고, 0 이면 오류. Engine::reachable 과 동일)·
     * to 만 있으면 Dijkstra 로 경로 존재·정지 중인 다른 액터 칸 진입 금지·parallel 동시 진입 충돌·최종 위치가 시작 배치와 겹치면 오류(despawn 되는 액터 면제).
     *
     * @param array{width:int,height:int,terrain:callable,cost:callable,isWater:callable,moveTypeOf:callable,starts:array{a:array,b:array},passCost:int} $ctx terrain(x,y):string, cost(terrain,moveType):?int, isWater(terrain):bool, moveTypeOf(kind,value):?string
     * @return list<string> 'ERROR ...' / 'WARN ...'
     */
    public static function validateWalk(array $norm, array $ctx): array
    {
        $msg = [];
        $W = $ctx['width'];
        $H = $ctx['height'];
        $pass = max(0, (int) $ctx['passCost']);
        $startSet = ['a' => [], 'b' => []];
        foreach (['a', 'b'] as $s) {
            foreach ($ctx['starts'][$s] ?? [] as [$x, $y]) {
                $startSet[$s]["$x,$y"] = true;
            }
        }
        $actors = [];
        $open = function (array $a, int $x, int $y) use ($ctx, $W, $H): bool {   // 지형 통행(ship 액터는 수상 칸 허용)
            if ($x < 0 || $y < 0 || $x >= $W || $y >= $H) {
                return false;
            }
            $t = ($ctx['terrain'])($x, $y);

            return ($ctx['cost'])($t, $a['mt']) !== null || (! empty($a['ship']) && ($ctx['isWater'])($t));
        };
        // 시작 배치 칸 판정: 반환 'hostile' | 'same' | null
        $startKind = function (array $a, int $x, int $y) use ($startSet): ?string {
            $k = "$x,$y";
            if ($a['side'] === 'n') {
                return isset($startSet['a'][$k]) || isset($startSet['b'][$k]) ? 'hostile' : null;
            }
            $other = $a['side'] === 'a' ? 'b' : 'a';

            return isset($startSet[$other][$k]) ? 'hostile' : (isset($startSet[$a['side']][$k]) ? 'same' : null);
        };
        $resolve = function (array $c, array $a) use ($open, $startKind, $pass, $W, $H, &$msg): ?array {   // 걸을 칸 목록(path 그대로 / to 는 Dijkstra)
            if (isset($c['path'])) {
                return $c['path'];
            }
            $blocked = fn (int $x, int $y) => ($k = $startKind($a, $x, $y)) === 'hostile' || ($k === 'same' && $pass <= 0);
            [$tx, $ty] = $c['to'];
            if (! $open($a, $tx, $ty) || $blocked($tx, $ty)) {
                $msg[] = "ERROR {$c['id']} walk {$c['actor']}: 목적지 ({$tx},{$ty}) 에 설 수 없음(통행 불가 지형 또는 시작 배치 칸)";

                return null;
            }
            $best = ["{$a['x']},{$a['y']}" => 0];
            $prev = [];
            $q = [[0, $a['x'], $a['y']]];
            while ($q) {
                usort($q, fn ($p, $r) => $p[0] <=> $r[0]);
                [$cst, $x, $y] = array_shift($q);
                if ($x === $tx && $y === $ty) {
                    break;
                }
                if ($cst > ($best["$x,$y"] ?? PHP_INT_MAX)) {
                    continue;
                }
                foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                    $nx = $x + $dx;
                    $ny = $y + $dy;
                    if (! $open($a, $nx, $ny) || $blocked($nx, $ny)) {
                        continue;
                    }
                    $nc = $cst + 1;
                    if ($nc < ($best["$nx,$ny"] ?? PHP_INT_MAX)) {
                        $best["$nx,$ny"] = $nc;
                        $prev["$nx,$ny"] = [$x, $y];
                        $q[] = [$nc, $nx, $ny];
                    }
                }
            }
            if (! isset($prev["$tx,$ty"]) && ! ($tx === $a['x'] && $ty === $a['y'])) {
                $msg[] = "ERROR {$c['id']} walk {$c['actor']}: ({$a['x']},{$a['y']}) -> ({$tx},{$ty}) 경로 없음(길이 막힘)";

                return null;
            }
            $cells = [];
            for ($cur = [$tx, $ty]; isset($prev["{$cur[0]},{$cur[1]}"]); $cur = $prev["{$cur[0]},{$cur[1]}"]) {
                array_unshift($cells, $cur);
            }

            return $cells;
        };
        $check = function (array $c, array $a, array $cells, array $others) use ($open, $startKind, $pass, &$msg): void {   // 칸별 규칙 검사
            [$px, $py] = [$a['x'], $a['y']];
            foreach ($cells as $i => [$x, $y]) {
                $n = $i + 1;
                abs($x - $px) + abs($y - $py) !== 1 && $msg[] = "ERROR {$c['id']} walk {$c['actor']}: {$n}번째 칸 ({$x},{$y}) 가 직전 칸 ({$px},{$py}) 과 4방향 인접이 아님";
                if ($x < 0 || $y < 0 || ! $open($a, $x, $y)) {
                    $msg[] = "ERROR {$c['id']} walk {$c['actor']}: {$n}번째 칸 ({$x},{$y}) 가 맵 밖이거나 통행 불가 지형";
                }
                $k = $startKind($a, $x, $y);
                $k === 'hostile' && $msg[] = "ERROR {$c['id']} walk {$c['actor']}: {$n}번째 칸 ({$x},{$y}) 가 적대 진영 시작 배치 칸(통과 금지)";
                $k === 'same' && $msg[] = ($pass <= 0 ? 'ERROR' : 'WARN')." {$c['id']} walk {$c['actor']}: {$n}번째 칸 ({$x},{$y}) 가 같은 편 시작 배치 칸".($pass <= 0 ? '(ally_passthrough_cost=0 이라 통과 불가)' : '(통과 가능하나 확인 필요)');
                foreach ($others as $oid => $o) {
                    $o['x'] === $x && $o['y'] === $y && $msg[] = "ERROR {$c['id']} walk {$c['actor']}: {$n}번째 칸 ({$x},{$y}) 에 정지한 액터 {$oid} 가 있음";
                }
                [$px, $py] = [$x, $y];
            }
        };
        $items = [];   // 실행 단위: ['one', cue] | ['group', [cue...]]
        foreach ($norm as $c) {
            $items[] = $c['do'] === 'parallel' ? ['group', array_map(fn ($ch) => $ch + ['id' => $c['id']], $c['cues'])] : ['one', $c];
        }
        $despawned = [];
        foreach ($items as [$kind, $cs]) {
            $cs = $kind === 'one' ? [$cs] : $cs;
            foreach ($cs as $c) {   // spawn 먼저
                if ($c['do'] === 'spawn_actor' && ! isset($actors[$c['actor']])) {
                    $mt = ($ctx['moveTypeOf'])(array_key_first($c['sprite']), reset($c['sprite'])) ?? 'foot';
                    $actors[$c['actor']] = ['x' => $c['tile'][0], 'y' => $c['tile'][1], 'side' => $c['side'], 'mt' => $mt, 'ship' => $c['fx'] === 'ship'];
                }
            }
            $walkers = [];
            foreach ($cs as $c) {
                if ($c['do'] !== 'walk' || ! isset($c['actor']) || ! isset($actors[$c['actor']])) {
                    continue;
                }
                $a = $actors[$c['actor']];
                $cells = $resolve($c, $a);
                if ($cells === null) {
                    continue;
                }
                $others = array_filter($actors, fn ($o, $id) => $id !== $c['actor'] && ! in_array($id, array_map(fn ($w) => $w['actor'], array_filter($cs, fn ($z) => $z['do'] === 'walk' && isset($z['actor']))), true), ARRAY_FILTER_USE_BOTH);
                $check($c, $a, $cells, $others);
                $walkers[$c['actor']] = ['c' => $c, 'cells' => $cells, 'from' => [$a['x'], $a['y']]];
            }
            if (count($walkers) > 1) {   // parallel 동시 진입 충돌: 같은 걸음 번호에 같은 칸
                $maxLen = max(array_map(fn ($w) => count($w['cells']), $walkers));
                for ($t = 0; $t < $maxLen; $t++) {
                    $at = [];
                    foreach ($walkers as $id => $w) {
                        $p = $w['cells'][min($t, count($w['cells']) - 1)];
                        $at["{$p[0]},{$p[1]}"][] = $id;
                    }
                    foreach ($at as $cell => $ids) {
                        count($ids) > 1 && $msg[] = "ERROR {$walkers[$ids[0]]['c']['id']} parallel: ".implode(',', $ids)." 가 {$cell} 에 동시 진입/정지(걸음 ".($t + 1).')';
                    }
                }
            }
            foreach ($walkers as $id => $w) {
                $last = $w['cells'][count($w['cells']) - 1] ?? null;
                $last !== null && [$actors[$id]['x'], $actors[$id]['y']] = $last;
            }
            foreach ($cs as $c) {   // despawn 마지막
                if ($c['do'] === 'despawn_actor') {
                    unset($actors[$c['actor']]);
                    $despawned[$c['actor']] = true;
                }
            }
        }
        foreach ($actors as $id => $a) {   // 6. 남는 액터의 최종 위치가 시작 배치와 겹치면 오류
            (isset($startSet['a']["{$a['x']},{$a['y']}"]) || isset($startSet['b']["{$a['x']},{$a['y']}"])) && $msg[] = "ERROR 액터 {$id} 최종 위치 ({$a['x']},{$a['y']}) 가 전투 시작 배치 칸과 겹침(despawn 필요)";
        }

        return $msg;
    }

    private static function actorId(mixed $v): ?string
    {
        return is_string($v) && preg_match(self::ACTOR_RE, $v) ? $v : null;
    }

    /** say 정규화(최상위·parallel 하위 공용). 확장 필드 actor/during/focus 는 형식이 틀리면 그 필드만 무시 */
    private static function sayBody(array $c, array &$e): bool
    {
        if (! is_string($c['text'] ?? null) || $c['text'] === '') {
            return false;
        }
        $x = [];
        ($a = self::actorId($c['actor'] ?? null)) !== null && $x['actor'] = $a;
        ($d = self::actorId($c['during'] ?? null)) !== null && $x['during'] = $d;
        is_bool($c['focus'] ?? null) && $x['focus'] = $c['focus'];   // 생략 시 FE 기본 true
        $e += ['text' => mb_substr($c['text'], 0, 200), 'speaker' => is_string($c['speaker'] ?? null) ? $c['speaker'] : null, 'expr' => is_string($c['expr'] ?? null) ? $c['expr'] : null] + BattleStory::lineFx($c) + $x;   // 줄 효과 필드(sfx/shake/bg/fade/blackout)는 BattleStory::lineFx 검증 통과분만

        return true;
    }

    /** 액터/보행 do 정규화. 하나라도 틀리면 false(= cue 째로 버림) */
    private static function actorDo(string $do, array $c, array &$e): bool
    {
        switch ($do) {
            case 'spawn_actor':
                $t = self::cell($c['tile'] ?? null);
                $s = $c['sprite'] ?? null;
                $actor = self::actorId($c['actor'] ?? null);
                $keys = is_array($s) ? array_values(array_filter(['unit_type', 'hero', 'npc_ref'], fn ($k) => is_string($s[$k] ?? null) && $s[$k] !== '' && strlen($s[$k]) <= 40)) : [];
                $side = $c['side'] ?? 'n';
                $fx = $c['fx'] ?? 'fade';
                if ($actor === null || $t === null || count($keys) !== 1 || ! in_array($side, ['a', 'b', 'n'], true) || ! in_array($fx, ['fade', 'ship', 'door'], true)
                    || (isset($c['facing']) && ! in_array($c['facing'], self::DIRS, true))) {
                    return false;
                }
                $e += ['actor' => $actor, 'tile' => $t, 'side' => $side, 'sprite' => [$keys[0] => $s[$keys[0]]], 'fx' => $fx]
                    + (is_string($c['name'] ?? null) && $c['name'] !== '' ? ['name' => mb_substr($c['name'], 0, 20)] : []) + (isset($c['facing']) ? ['facing' => $c['facing']] : []);

                return true;
            case 'walk':
                $actor = self::actorId($c['actor'] ?? null);
                $unit = is_string($c['unit'] ?? null) && $c['unit'] !== '' && strlen($c['unit']) <= 40 ? $c['unit'] : null;
                $path = null;
                if (isset($c['path'])) {
                    if (! is_array($c['path']) || count($c['path']) < 1 || count($c['path']) > 40 || in_array(null, $path = array_map(fn ($p) => self::cell($p), array_values($c['path'])), true)) {
                        return false;
                    }
                }
                $to = self::cell($c['to'] ?? null);
                $speed = $c['speed'] ?? 4;
                if (($actor === null) === ($unit === null) || ($path === null && $to === null) || ! (is_int($speed) || is_float($speed)) || $speed < 1 || $speed > 12
                    || (isset($c['wait']) && ! is_bool($c['wait'])) || (isset($c['id']) && self::actorId($c['id']) === null)) {
                    return false;
                }
                $e += ($actor !== null ? ['actor' => $actor] : ['unit' => $unit]) + ($path !== null ? ['path' => $path] : ['to' => $to])
                    + ['speed' => $speed, 'wait' => $c['wait'] ?? true] + (isset($c['id']) ? ['walk_id' => $c['id']] : []);   // 저작자 walk id 는 walk_id(e.id 는 cue id 예약)

                return true;
            case 'despawn_actor':
                $actor = self::actorId($c['actor'] ?? null);
                $fx = $c['fx'] ?? 'fade';
                if ($actor === null || ! in_array($fx, ['fade', 'ship', 'door'], true)) {
                    return false;
                }
                $e += ['actor' => $actor, 'fx' => $fx];

                return true;
            case 'face':
                $actor = self::actorId($c['actor'] ?? null);
                $unit = is_string($c['unit'] ?? null) && $c['unit'] !== '' && strlen($c['unit']) <= 40 ? $c['unit'] : null;
                if (($actor === null) === ($unit === null) || ! in_array($c['dir'] ?? null, self::DIRS, true)) {
                    return false;
                }
                $e += ($actor !== null ? ['actor' => $actor] : ['unit' => $unit]) + ['dir' => $c['dir']];

                return true;
            case 'wait':
                if (! is_int($c['ms'] ?? null) || $c['ms'] < 100 || $c['ms'] > 5000) {
                    return false;
                }
                $e += ['ms' => $c['ms']];

                return true;
            case 'parallel':
                if (! is_array($c['cues'] ?? null) || count($c['cues']) < 1 || count($c['cues']) > 6) {
                    return false;
                }
                $kids = [];
                foreach (array_values($c['cues']) as $ch) {   // 중첩 금지, 하위 하나라도 무효면 그룹 전체 무효
                    if (! is_array($ch) || ! in_array($ch['do'] ?? null, self::PARALLEL_DO, true)) {
                        return false;
                    }
                    $ce = ['do' => $ch['do']];
                    if (! ($ch['do'] === 'say' ? self::sayBody($ch, $ce) : self::actorDo($ch['do'], $ch, $ce))) {
                        return false;
                    }
                    $kids[] = $ce;
                }
                $e += ['cues' => $kids];

                return true;
        }

        return false;
    }

    /**
     * 액터/보행 cue 실행. state.actors 만 바꾼다(state.units 불변; 실제 유닛 walk 만 scriptMove 로 좌표 반영). 반환 payload(null=이벤트 없음).
     * 실제 유닛 walk 는 기존 move 이벤트에 path/speed/wait/walk_id 를 실어 emit 하고 null 반환. 경로 중간이 막혀 있으면(path_ok=false) 이동하지 않고 cue{do:walk,path_ok:false} 만 반환.
     */
    private static function actorEvent(Engine $engine, array &$state, array &$events, array $c, array $payload, array $extra = []): ?array
    {
        switch ($c['do']) {
            case 'spawn_actor':
                $id = $c['actor'];
                [$x, $y] = $c['tile'];
                if (isset($state['actors'][$id]) || isset($state['actor_used'][$id]) || count($state['actors'] ?? []) >= self::ACTOR_MAX || ! $engine->inBounds($state, $x, $y)) {
                    return null;
                }
                $a = ['id' => $id, 'side' => $c['side'], 'name' => $c['name'] ?? null, 'sprite' => $c['sprite'], 'x' => $x, 'y' => $y, 'facing' => $c['facing'] ?? 'down', 'alive' => true];
                $state['actors'][$id] = $a;
                $state['actor_used'][$id] = true;

                return $payload + ['actor' => $id, 'tile' => [$x, $y], 'side' => $c['side'], 'sprite' => $c['sprite'], 'name' => $a['name'], 'facing' => $a['facing'], 'fx' => $c['fx']];
            case 'despawn_actor':
                if (! isset($state['actors'][$c['actor']])) {
                    return null;
                }
                unset($state['actors'][$c['actor']]);

                return $payload + ['actor' => $c['actor'], 'fx' => $c['fx']];
            case 'wait':
                return $payload + ['ms' => $c['ms']];
            case 'face':
                if (isset($c['actor'])) {
                    if (! isset($state['actors'][$c['actor']])) {
                        return null;
                    }
                    $state['actors'][$c['actor']]['facing'] = $c['dir'];

                    return $payload + ['actor' => $c['actor'], 'dir' => $c['dir']];
                }
                $uid = self::resolveUnit($state, $c['unit'], true);

                return $uid === null ? null : $payload + ['unit_id' => $uid, 'dir' => $c['dir']];   // 실제 유닛 facing 은 판정 요소라 서버 상태는 바꾸지 않는다(FE 표시 전용)
            case 'walk':
                $cells = $c['path'] ?? [$c['to']];
                foreach ($cells as [$x, $y]) {
                    if (! $engine->inBounds($state, $x, $y)) {
                        return null;
                    }
                }
                $info = ['speed' => $c['speed'], 'wait' => $c['wait']] + (isset($c['walk_id']) ? ['walk_id' => $c['walk_id']] : []) + (isset($c['path']) ? ['path' => $c['path']] : ['to' => $c['to']]);
                if (isset($c['actor'])) {
                    $a = $state['actors'][$c['actor']] ?? null;
                    if ($a === null) {
                        return null;
                    }
                    [$lx, $ly] = $cells[count($cells) - 1];
                    [$px, $py] = count($cells) > 1 ? $cells[count($cells) - 2] : [$a['x'], $a['y']];
                    $state['actors'][$c['actor']] = ['x' => $lx, 'y' => $ly, 'facing' => Engine::axisDir($lx - $px, $ly - $py) ?? $a['facing']] + $a;

                    return $payload + ['actor' => $c['actor']] + $info;
                }
                $uid = self::resolveUnit($state, $c['unit'], true);
                if ($uid === null) {
                    return null;
                }
                $u = $state['units'][$uid];
                [$lx, $ly] = $cells[count($cells) - 1];
                if (isset($c['path']) && ! self::pathClear($engine, $state, $u, $cells)) {
                    return $payload + ['unit_id' => $uid, 'path_ok' => false] + $info;   // 이동하지 않음(FE 는 생략)
                }
                if ($engine->scriptMove($state, $events, $uid, $lx, $ly, ['cue_id' => $c['id'], 'scripted' => true, 'walk' => true] + $info + $extra) && ! empty($state['units'][$uid]['npc_ally'])) {
                    $state['units'][$uid]['moved'] = true;
                }

                return null;
        }

        return null;
    }

    /** 실제 유닛 walk 경로 현재 상태 검사: 각 칸이 맵 안·통행 가능이고 다른 유닛이 막지 않음(적대 칸 불가, 같은 편은 frozen ally_passthrough_cost>0 일 때만 통과, 마지막 칸은 빈 칸) */
    private static function pathClear(Engine $engine, array $state, array $u, array $cells): bool
    {
        $mt = $engine->rules()->unitType($u['type'])['move_type'];
        $pass = max(0, (int) ($state['frozen']['ally_passthrough_cost'] ?? 0));
        $last = count($cells) - 1;
        foreach ($cells as $i => [$x, $y]) {
            if (! $engine->passable($state, $mt, $x, $y)) {
                return false;
            }
            $occ = $engine->unitAt($state, $x, $y);
            if ($occ !== null && $occ['id'] !== $u['id'] && ($i === $last || $pass <= 0 || $occ['side'] !== $u['side'])) {
                return false;
            }
        }

        return true;
    }

    /** 화자가 hero:<code> 이고 이 전투에서 격파/퇴각했으며 지금 살아 있는 동일 영웅이 없으면 true(전장에 원래 없던 영웅은 false) */
    private static function speakerGone(array $state, ?string $speaker): bool
    {
        if ($speaker === null || ! str_starts_with($speaker, 'hero:') || EventConditions::units($state, $speaker) !== []) {
            return false;
        }
        foreach (['defeated', 'retreated'] as $k) {
            foreach ($state[$k] ?? [] as $id => $d) {
                if (EventConditions::matchesRef((string) $id, $d, $speaker)) {
                    return true;
                }
            }
        }

        return false;
    }

    /** $exact=true(move/retreat/defect): hero:npc_X 같은 인물 별칭을 허용하지 않고 정확히 그 코드의 유닛만 대상으로 한다(조건 판정·화자는 별칭 허용) */
    private static function resolveUnit(array $state, string $ref, bool $exact = false): ?string
    {
        if (str_starts_with($ref, 'ally_npc:')) {   // 아군 NPC 한정: 정확 일치(rank 2) 우선, 없으면 npc_X<->X 별칭(rank 1). 플레이어 소유 동일 코드 영웅은 대상 아님
            $best = null;
            $bestRank = 0;
            foreach ($state['units'] as $id => $u) {
                $r = $u['hp'] > 0 ? EventConditions::allyNpcRank($u, substr($ref, 9)) : 0;
                if ($r > $bestRank) {
                    $best = (string) $id;
                    $bestRank = $r;
                }
            }

            return $best;
        }
        if (str_starts_with($ref, 'hero:')) {
            foreach ($state['units'] as $id => $u) {
                if (EventConditions::matchesRef((string) $id, $u, $ref)) {   // hero:<code> / npc_ref / 같은 인물 별칭(hero:npc_X -> 아군 영웅 X) npc_ref: 적 squads[] 지휘관(영웅 행 없는 NPC)도 hero:<npc code> 로 참조
                    if ($u['hp'] <= 0 || ($exact && str_starts_with($ref, 'hero:npc_') && ($u['hero'] ?? null) !== substr($ref, 5) && ($u['npc_ref'] ?? null) !== substr($ref, 5))) {
                        continue;
                    }
                    return (string) $id;
                }
            }

            return null;
        }

        return isset($state['units'][$ref]) && $state['units'][$ref]['hp'] > 0 ? $ref : null;
    }

    /**
     * 큐로 소환된 영웅의 동반 일반병: 영웅 칸에서 가까운 빈 칸(BFS, 인접 우선)에 병종=영웅 병종(치유사·알 수 없는 병종은 sword)으로 생성.
     * 목표 수는 전투 생성 시 state.companions 에 고정된 스테이지 설정(진영 a: ally_by_hero > ally, ally_exclude 영웅은 0 / 진영 b: enemy). 설정이 없거나 0이면 무동작.
     * 진영 유닛 하드 상한을 넘기지 않는다. 병사는 leader_id=영웅(squad on)이라 기존 봇 leash 로 영웅을 따라간다.
     */
    private static function spawnCompanions(Engine $engine, array &$state, array &$events, string $heroId, array $hero, array $c): void
    {
        $cs = $state['companions'] ?? null;
        $hu = $state['units'][$heroId] ?? null;
        if (! is_array($cs) || $hu === null) {
            return;
        }
        $side = $hu['side'];
        $code = (string) ($hero['code'] ?? '');
        $max = (int) ($cs['max'] ?? 4);
        $cnt = $side === 'a'
            ? (in_array($code, (array) ($cs['ally_exclude'] ?? []), true) ? 0 : (int) ($cs['ally_by_hero'][$code] ?? $cs['ally'] ?? 0))
            : (int) ($cs['enemy'] ?? 0);
        $cnt = min($max, max(0, $cnt));
        $t = (string) ($hero['troop_type'] ?? $hu['type']);
        (! isset($engine->rules()->unitTypes[$t]) || $t === 'healer') && $t = 'sword';
        try {
            $cap = ArmyBuilder::unitHardCap();
        } catch (\Throwable) {
            $cap = 32;   // 순수 PHP 단위 테스트(config 없음)
        }
        for ($k = 0; $k < $cnt; $k++) {
            if (count(array_filter($state['units'], fn ($u) => $u['side'] === $side && ($u['hp'] ?? 0) > 0)) 
                >= $cap) {
                break;
            }
            $id = $engine->spawnUnit($state, $events, ['side' => $side, 'cells' => [[$hu['x'], $hu['y']]], 'level' => $hu['level'], 'type' => $t, 'hero' => null, 'ready' => $c['ready'], 'tag' => null,
                'npc_ally' => ! empty($hu['npc_ally']), 'must_survive' => false, 'growth' => (float) ($state['troop_growth'] ?? 3.0), 'cue_id' => $c['id']]);
            if ($id === null) {
                break;
            }
            Engine::squadOn($state) && $state['units'][$id]['leader_id'] = $heroId;
            ! empty($hu['facing']) && $state['units'][$id]['facing'] = $hu['facing'];
        }
    }

    /** @var \Closure|null fn(string $heroCode): ?array — 영웅 행 조회(BattleService 가 주입; 순수 엔진/시뮬레이터에는 없음) */
    private static ?\Closure $heroResolver = null;

    public static function setHeroResolver(?\Closure $f): void
    {
        self::$heroResolver = $f;
    }

    private static function spawn(array $c, array &$e): bool
    {
        $side = ($c['side'] ?? 'b') === 'a' ? 'a' : 'b';
        $hero = is_string($c['hero'] ?? null) && $c['hero'] !== '' ? $c['hero'] : null;
        $type = is_string($c['unit_type'] ?? null) && $c['unit_type'] !== '' ? $c['unit_type'] : null;
        $cells = array_values(array_filter(array_map(fn ($t) => self::cell($t), is_array($c['tiles'] ?? null) ? array_slice($c['tiles'], 0, 12) : (self::cell($c['tile'] ?? null) ? [$c['tile']] : []))));
        $tag = $c['tag'] ?? null;
        if (($hero === null) === ($type === null) || $cells === [] || ($tag !== null && ! (is_string($tag) && preg_match('/^[a-z0-9_]{1,24}$/', $tag)))
            || (isset($c['level']) && ! (is_int($c['level']) && $c['level'] >= 1 && $c['level'] <= 99))
            || (isset($c['count']) && ! (is_int($c['count']) && $c['count'] >= 1 && $c['count'] <= 6 && ($hero === null || $c['count'] === 1)))) {   // count: 병종 spawn 의 유닛 수(1~6, 영웅은 1)
            return false;
        }
        $e += ['count' => $c['count'] ?? 1, 'side' => $side, 'hero' => $hero, 'unit_type' => $type, 'cells' => $cells, 'level' => $c['level'] ?? null, 'ready' => (bool) ($c['ready'] ?? false), 'tag' => $tag,
            'npc_ally' => (bool) ($c['npc_ally'] ?? ($hero !== null && $side === 'a')), 'must_survive' => (bool) ($c['must_survive'] ?? false)];

        return true;
    }

    private static function cell(mixed $c): ?array
    {
        return is_array($c) && count($c) === 2 && is_int($c[0] ?? null) && is_int($c[1] ?? null) && $c[0] >= 0 && $c[1] >= 0 ? [$c[0], $c[1]] : null;
    }

    private static function camera(array $c, array &$e): bool
    {
        $mode = $c['mode'] ?? 'focus';
        if (! in_array($mode, ['focus', 'overview', 'restore'], true)) {
            return false;
        }
        $e += ['mode' => $mode, 'ms' => min(3000, max(0, (int) ($c['ms'] ?? 500)))];
        $unit = is_string($c['unit'] ?? null) && $c['unit'] !== '' && strlen($c['unit']) <= 40 ? $c['unit'] : null;   // 선택: 유닛 기준 focus(유닛 id | hero:<code> | UNIT@x,y -> 배치 후 id 로 치환됨)
        $unit !== null && $e['unit'] = $unit;
        ($c['follow'] ?? null) === true && $e['follow'] = true;   // 선택: focus 도착 후 유닛 추적(FE)
        if ($mode === 'focus') {
            $t = self::cell($c['tile'] ?? null);
            if ($t === null && $unit === null) {
                return false;   // tile 도 unit 도 없으면 focus 불가
            }
            $t !== null && $e['tile'] = $t;
        }

        return true;
    }

    private static function terrainChange(array $c, array &$e): bool
    {
        $tiles = array_values(array_filter(array_map(fn ($t) => self::cell($t), is_array($c['tiles'] ?? null) ? array_slice($c['tiles'], 0, 40) : [])));
        if ($tiles === [] || ! is_string($c['to'] ?? null) || ! preg_match('/^[a-z0-9_]{1,24}$/', $c['to'])) {
            return false;
        }
        $e += ['tiles' => $tiles, 'to' => $c['to']];
        if (($c['fx'] ?? null) === 'water_rise') {   // 선택: 물 차오름 연출 힌트(판정은 to 지형 그대로). FE 가 fx 를 모르면 일반 terrain_change 로 재렌더
            $e += ['fx' => 'water_rise', 'ms' => min(3000, max(200, (int) ($c['ms'] ?? 1200)))];
            in_array($c['dir'] ?? null, ['up', 'down', 'left', 'right'], true) && $e['dir'] = $c['dir'];   // 차오르는 진행 방향(생략 시 FE 가 칸 순서대로)
        }
        $t = $c['tile'] ?? null;   // 선택: FE 렌더용 타일 지정(tv2 전역 정수 인덱스 0~9999 또는 이름 [A-Za-z0-9_]{1,40}). 형식이 틀리면 무시
        if ((is_int($t) && $t >= 0 && $t <= 9999) || (is_string($t) && preg_match('/^[A-Za-z0-9_]{1,40}\z/', $t))) {
            $e['tile'] = $t;
        }

        return true;
    }

    private static function fire(array $c, array &$e): bool
    {
        $tiles = array_values(array_filter(array_map(fn ($t) => self::cell($t), is_array($c['tiles'] ?? null) ? array_slice($c['tiles'], 0, 40) : [])));
        if ($tiles === [] || ! is_int($c['turns'] ?? null) || $c['turns'] < 1 || $c['turns'] > 10) {
            return false;
        }
        $e += ['tiles' => $tiles, 'turns' => $c['turns']];

        return true;
    }
}
