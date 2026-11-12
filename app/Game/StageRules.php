<?php

namespace App\Game;

/**
 * 스테이지 승패 규칙(stages.rules, docs/CUTSCENE_SPEC.md 10절). 전투 생성 시 state 에 고정된다. 규칙이 없으면 모든 메서드가 즉시 반환/통과(기존 동작 100% 불변).
 *
 *  - win_mode "all"  : 기본 목표(stages.objective: capture/survive_turns/지휘관 격파) 달성 AND win_conditions 전부 참이어야 승리(순서 무관).
 *  - win_mode "only" : 기본 목표 달성은 승리로 인정하지 않는다. win_conditions 전부 참일 때만 승리.
 *    win_conditions = [{"label"?:str(40자), "latch"?:bool(기본 false: true 면 한 번 참이 된 뒤 계속 참으로 본다), "when":<EventConditions 조건 트리>}] (1~6개)
 *  - lose_conditions = [{"id"?:str, "label"?:str(40자), "when":<조건 트리>}] (1~6개): 전투 중 조건이 참이 되는 즉시 패배(승리 판정이 같은 시점에 성립하면 승리 우선).
 *  - 두 모드 모두 턴 상한(max_turns) 도달 시 HP 비교 판정을 하지 않고 패배(승리 조건을 못 채운 채 시간이 다 됨).
 * 평가 시점: 엔진 행동·연출 직후(Cues::collect 가 호출). 잘못된 항목은 조용히 버리고(StageRules::dropped 로 시드 단계 경고/거부), win 규칙은 유효 조건이 0개면 무시한다.
 */
final class StageRules
{
    private const MAX = 6;

    public static function initialize(array &$state, mixed $rules): void
    {
        $rules = is_array($rules) ? $rules : [];
        ($rules['commander_guard'] ?? true) === false && $state['commander_guard_off'] = true;   // 스테이지 단위로 봇 지휘관 보호 AI 끄기(기본 켜짐, 키 없으면 state 불변)
        $mode = $rules['win_mode'] ?? null;
        if (in_array($mode, ['all', 'only'], true) && ($conds = self::winConds($rules['win_conditions'] ?? null)) !== []) {
            $state['win_rule'] = ['mode' => $mode, 'conds' => $conds, 'primary' => false, 'latched' => []];
        }
        $lose = [];
        foreach (self::items($rules['lose_conditions'] ?? null) as $i => $l) {
            if (is_array($l) && ($w = EventConditions::normalize($l['when'] ?? null)) !== null) {
                $lose[] = ['id' => is_string($l['id'] ?? null) && preg_match('/^[a-z0-9_]{1,32}$/', $l['id']) ? $l['id'] : 'lose'.$i, 'label' => self::label($l), 'when' => $w];
            }
        }
        $lose !== [] && $state['lose_rules'] = $lose;
    }

    /** 저작 오류 수(무효 항목 수 + win_conditions 만 있고 win_mode 가 없거나 틀린 경우 1). 시드 단계 검증용 */
    public static function dropped(mixed $rules): int
    {
        $rules = is_array($rules) ? array_filter($rules, fn ($v) => $v !== null) : [];   // null = 키 삭제(StageRulesMerge 의미): 없는 키로 본다
        $n = 0;
        $mode = $rules['win_mode'] ?? null;
        if ($mode !== null && ! in_array($mode, ['all', 'only'], true)) {
            $n++;
        }
        if (array_key_exists('win_conditions', $rules)) {
            $in = is_array($rules['win_conditions']) ? count($rules['win_conditions']) : 1;
            $valid = count(self::winConds($rules['win_conditions']));
            $n += max(0, $in - $valid);
            $mode === null && $n++;
            $mode !== null && $valid === 0 && $n++;   // 모드가 있는데 유효 조건 0개(빈 배열 포함): initialize 가 규칙을 만들지 않아 기본 목표로 이겨 버림
        } elseif ($mode !== null) {
            $n++;   // 모드만 있고 조건이 없음
        }
        if (array_key_exists('lose_conditions', $rules)) {
            $in = is_array($rules['lose_conditions']) ? count($rules['lose_conditions']) : 1;
            $n += max(0, $in - count(self::loseCount($rules['lose_conditions'])));
        }

        return $n;
    }

    /**
     * 시드 검증용: win/lose 조건 트리가 참조하는 유닛 참조 문자열과 칸/rect 를 모은다(유효 항목만).
     *
     * @return array{units:string[],cells:array<int,array{0:int,1:int}>,rects:array<int,array>}
     */
    public static function references(mixed $rules): array
    {
        $rules = is_array($rules) ? $rules : [];
        $out = ['units' => [], 'cells' => [], 'rects' => []];
        $trees = array_column(self::winConds($rules['win_conditions'] ?? null), 'when');
        foreach (self::items($rules['lose_conditions'] ?? null) as $l) {
            is_array($l) && ($w = EventConditions::normalize($l['when'] ?? null)) !== null && $trees[] = $w;
        }
        $walk = function (array $n) use (&$walk, &$out) {
            foreach (['all', 'any'] as $k) {
                if (isset($n[$k])) {
                    array_map($walk, $n[$k]);

                    return;
                }
            }
            if (isset($n['not'])) {
                $walk($n['not']);

                return;
            }
            foreach (['unit', 'a', 'b'] as $k) {
                isset($n[$k]) && $out['units'][] = $n[$k];
            }
            array_push($out['cells'], ...($n['tiles'] ?? []));
            isset($n['rect']) && $out['rects'][] = $n['rect'];
        };
        array_map($walk, $trees);

        return $out;
    }

    /**
     * 기본 목표 달성(적 지휘관 격파/capture 점령·유지/survive_turns)이 성립한 순간 Engine 이 호출한다. true 면 그대로 승리 처리, false 면 승리를 보류한다.
     * 규칙이 없으면 true(기존 동작). "all" 은 기본 목표 달성을 기록(primary)하고 조건이 이미 모두 참이면 true, "only" 는 항상 false.
     */
    public static function gate(array &$state): bool
    {
        $w = $state['win_rule'] ?? null;
        if ($w === null) {
            return true;
        }
        if ($w['mode'] === 'only') {
            return false;
        }
        $state['win_rule']['primary'] = true;

        return self::condsMet($state);
    }

    /** 승패 규칙 평가(행동·연출 직후). 규칙이 없으면 무동작 */
    public static function check(Engine $engine, array &$state, array &$events): void
    {
        if (($state['status'] ?? 'active') !== 'active' || (empty($state['win_rule']) && empty($state['lose_rules']))) {
            return;
        }
        if (isset($state['win_rule'])) {
            $met = self::condsMet($state);   // latch 갱신 포함
            if ($met && ($state['win_rule']['mode'] === 'only' || $state['win_rule']['primary'])) {
                $engine->finishByRule($state, 'a', 'objective', $events, ['rule' => 'win_'.$state['win_rule']['mode']]);

                return;
            }
        }
        foreach ($state['lose_rules'] ?? [] as $l) {
            if (EventConditions::evaluate($l['when'], $state)) {
                $engine->finishByRule($state, 'b', 'objective_lost', $events, ['rule' => $l['id'], 'label' => $l['label']]);

                return;
            }
        }
    }

    /** 턴 상한 도달 시 HP 비교 대신 패배로 처리해야 하는가(승리 규칙이 있는 전투) */
    public static function timeoutLoses(array $state): bool
    {
        return isset($state['win_rule']);
    }

    /** 뷰용: 승리 규칙이 있으면 {mode, primary, conditions:[{label,met}]}, 없으면 [](키 자체를 응답에 넣지 않는다) */
    public static function view(array $state): array
    {
        $w = $state['win_rule'] ?? null;
        if ($w === null) {
            $lose = array_column($state['lose_rules'] ?? [], 'label');

            return isset($state['lose_rules']) ? ['stage_rules' => ['mode' => 'default', 'conditions' => [], 'lose' => $lose]] : [];   // 패배 조건만 있는 스테이지: 기본 목표 + 패배 조건 표시용(primary 생략)
        }
        $items = [];
        foreach ($w['conds'] as $i => $c) {
            $items[] = ['label' => $c['label'], 'met' => ! empty($w['latched'][$i]) || EventConditions::evaluate($c['when'], $state)];
        }

        return ['stage_rules' => ['mode' => $w['mode'], 'primary' => (bool) $w['primary'], 'conditions' => $items, 'lose' => array_column($state['lose_rules'] ?? [], 'label')]];
    }

    /** 로비(스테이지 목록)용: 전투 없이 stages.rules 만으로 view() 와 같은 형태(met 제외)를 만든다. 승리/패배 조건이 없으면 null */
    public static function lobbyView(mixed $rules): ?array
    {
        $tmp = [];
        self::initialize($tmp, $rules);
        if (! isset($tmp['win_rule']) && ! isset($tmp['lose_rules'])) {
            return null;
        }

        return ['mode' => $tmp['win_rule']['mode'] ?? 'default', 'conditions' => array_map(fn ($c) => ['label' => $c['label']], $tmp['win_rule']['conds'] ?? []), 'lose' => array_column($tmp['lose_rules'] ?? [], 'label')];
    }

    /** 모든 승리 조건이 참인가(latch 조건은 한 번 참이면 기록). 호출 시 latch 를 갱신한다 */
    private static function condsMet(array &$state): bool
    {
        $all = true;
        foreach ($state['win_rule']['conds'] as $i => $c) {
            if (! empty($state['win_rule']['latched'][$i])) {
                continue;
            }
            if (EventConditions::evaluate($c['when'], $state)) {
                $c['latch'] && $state['win_rule']['latched'][$i] = true;
            } else {
                $all = false;
            }
        }

        return $all;
    }

    /** @return array<int,array{label:?string,latch:bool,when:array}> */
    private static function winConds(mixed $raw): array
    {
        $out = [];
        foreach (self::items($raw) as $c) {
            if (is_array($c) && ($w = EventConditions::normalize($c['when'] ?? null)) !== null) {
                $out[] = ['label' => self::label($c), 'latch' => ! empty($c['latch']), 'when' => $w];
            }
        }

        return $out;
    }

    private static function loseCount(mixed $raw): array
    {
        return array_filter(self::items($raw), fn ($l) => is_array($l) && EventConditions::normalize($l['when'] ?? null) !== null);
    }

    private static function items(mixed $raw): array
    {
        return is_array($raw) ? array_slice(array_values($raw), 0, self::MAX) : [];
    }

    private static function label(array $c): ?string
    {
        return is_string($c['label'] ?? null) && $c['label'] !== '' ? mb_substr($c['label'], 0, 40) : null;
    }
}
