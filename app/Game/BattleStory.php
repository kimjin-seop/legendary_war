<?php

namespace App\Game;

/** Campaign dialogue only: no combat effects or database writes. Fired events live in battle state. */
final class BattleStory
{
    private const STAGES = ['ch1_s1', 'ch1_s2', 'ch1_s3', 'ch1_s4', 'ch1_s5', 'ch1_s6', 'ch1_s7', 'ch1_s8', 'ch1_s9', 'ch1_s10'];

    // Scenario references are source CSV IDs, not heroes.id or combat unit IDs (hero_profiles.json).
    private const HERO_CODES = ['142' => 'yi_sun_sin', '144' => 'gwak_jae_u',
        '145' => 'kim_si_min', '148' => 'hyujeong', '149' => 'yujeong'];

    private static ?array $stages = null;

    public static function supports(string $stage): bool
    {
        return in_array($stage, self::STAGES, true);
    }

    public static function initialize(array &$state, string $stage, bool $repeat): void
    {
        if (self::supports($stage) && ! isset($state['story'])) {
            $state['story'] = ['stage_code' => $stage, 'repeat_battle' => $repeat];
            $state['story_events'] = [];
        }
    }

    /** Append after each atomic engine action, including every bot action, before state persistence. */
    public static function collect(array &$state, array &$events, bool $battleStart = false): void
    {
        $stage = $state['story']['stage_code'] ?? '';
        if (! self::supports($stage)) {
            return;
        }
        $fired = array_column($state['story_events'] ?? [], 'event_id');
        $eligible = [];
        foreach (self::definitions()[$stage] ?? [] as $event) {
            if (in_array($event['id'], $fired, true)) {
                continue;
            }
            $requires = $event['requires'] ?? [];
            if (! empty($requires['after_event']) && ! in_array($requires['after_event'], $fired, true)) {
                continue;
            }
            if (self::matches($event['trigger'], $state, $events, $battleStart)) {
                $eligible[] = $event;
            }
        }
        usort($eligible, fn ($a, $b) => ($b['priority'] <=> $a['priority']) ?: ($a['seq'] <=> $b['seq']));
        foreach ($eligible as $event) {
            $repeat = (bool) ($state['story']['repeat_battle'] ?? false);
            $lines = array_values($event['dialogue'] ?? []);   // 근거/검증 표시(verify 등)는 발화 여부에 영향을 주지 않는다
            if ($repeat) {
                if (($event['policy']['repeat_battle'] ?? 'skip') === 'skip') {
                    continue;
                }
                $lines = [['speaker' => 'caption', 'expr' => null, 'text' => $event['short']]];
            }
            // 클라이언트에는 표시용 필드만 내보낸다(note/dev_note/adaptation/direction/meta/requires/effects 등 제작용 필드 차단).
            $lines = array_map(function ($line) {
                $out = array_intersect_key($line, array_flip(['speaker', 'expr', 'text']));   // 근거/창작 표기(is_invented 등)는 화면에 내보내지 않는다. 데이터에 없어도 통과
                $out += self::lineFx($line);   // 줄 단위 장면 효과(sfx/shake/bg/fade/blackout, docs/DIALOGUE_SCENE_EFFECTS.md): 허용 값만 통과
                if (str_starts_with($out['speaker'] ?? '', 'hero:')) {
                    $csv = substr($out['speaker'], 5);
                    $out['speaker'] = 'hero:'.(self::HERO_CODES[$csv] ?? $csv);
                }
                return $out;
            }, $lines);
            if ($lines === []) {
                continue;
            }
            Engine::emit($state, $events, 'story_dialogue', [
                'event_id' => $event['id'], 'stage_code' => $stage, 'name' => $event['name'],
                'dialogue' => $lines, 'priority' => $event['priority'],
                'input' => $event['policy']['input'] ?? 'locked', 'short' => $repeat,
            ]);
            $state['story_events'][] = $events[array_key_last($events)];
        }
    }

    /** 줄 효과 필드 화이트리스트 검증. 값이 틀린 필드는 조용히 버린다(대사는 그대로) */
    public static function lineFx(array $line): array
    {
        $fx = [];
        if (is_string($line['sfx'] ?? null) && preg_match('/^[a-z0-9_]{1,48}$/', $line['sfx'])) {
            $fx['sfx'] = $line['sfx'];
        }
        if (($line['shake'] ?? null) === true || in_array($line['shake'] ?? null, ['light', 'medium', 'heavy'], true)) {
            $fx['shake'] = $line['shake'];
        }
        if (is_string($line['bg'] ?? null) && preg_match('/^bg\.[a-z0-9_]+\.[a-z0-9_]+$/', $line['bg']) && strlen($line['bg']) <= 64) {
            $fx['bg'] = $line['bg'];
        }
        if (in_array($line['fade'] ?? null, ['out', 'in', 'flash'], true)) {
            $fx['fade'] = $line['fade'];
        }
        if (is_bool($line['blackout'] ?? null)) {
            $fx['blackout'] = $line['blackout'];
        }

        return $fx;
    }

    private static function matches(array $trigger, array $state, array $events, bool $battleStart): bool
    {
        if (($state['status'] ?? null) === 'finished') {
            return $trigger['type'] === 'battle_end' && ($trigger['result'] ?? '') === 'win' && ($state['winner'] ?? null) === 'a';
        }
        return match ($trigger['type']) {
            'battle_start' => $battleStart,
            'turn_phase_start' => self::turnStarted($trigger, $events),
            'unit_troop_tenths_lte' => self::hurtBelow($trigger, $state, $events),
            'cond' => ($c = EventConditions::normalize($trigger['when'] ?? null)) !== null && EventConditions::evaluate($c, $state),   // 상태 조건 트리(docs/CUTSCENE_SPEC.md 6절)
            'units_adjacent', 'unit_distance_lte', 'unit_enter_tile' => self::spatial($trigger, $state),
            default => false, // Tile/AI/reinforcement/buff/choice effects remain intentionally unsupported.
        };
    }

    /** 위치 기반 트리거(units_adjacent/unit_distance_lte/unit_enter_tile)를 EventConditions 리프로 변환해 평가. 데이터의 hero:<csv번호>는 영웅 코드로 바꾼다. 최초 1회는 fired 목록이 보장 */
    private static function spatial(array $t, array $state): bool
    {
        $ref = function ($r) {
            if (is_string($r) && str_starts_with($r, 'hero:')) {
                return 'hero:'.(self::HERO_CODES[substr($r, 5)] ?? substr($r, 5));
            }

            return $r;
        };
        $leaf = match ($t['type']) {
            'units_adjacent' => ['type' => 'adjacent', 'a' => $ref($t['a'] ?? null), 'b' => $ref($t['b'] ?? null)],
            'unit_distance_lte' => ['type' => 'unit_distance_lte', 'a' => $ref($t['a'] ?? null), 'b' => $ref($t['b'] ?? null), 'distance' => $t['distance'] ?? null],
            default => ['type' => 'unit_enter_tile', 'side' => ($t['side'] ?? '') === 'enemy' ? 'b' : (($t['side'] ?? '') === 'player' ? 'a' : ($t['side'] ?? null)), 'tile_tag' => $t['tile_tag'] ?? null],
        };

        return ($c = EventConditions::normalize($leaf)) !== null && EventConditions::evaluate($c, $state);
    }

    private static function turnStarted(array $trigger, array $events): bool
    {
        $side = ($trigger['phase'] ?? null) === 'enemy' ? 'b' : 'a';
        foreach ($events as $event) {
            if ($event['type'] === 'turn_start' && ($event['side'] ?? null) === $side && ($event['turn'] ?? null) === $trigger['turn']) {
                return true;
            }
        }
        return false;
    }

    private static function hurtBelow(array $trigger, array $state, array $events): bool
    {
        foreach ($state['units'] as $id => $unit) {
            $ref = $trigger['unit'];
            $matches = $ref === 'enemy_commander'
                ? $unit['side'] === 'b' && $unit['kind'] === 'commander'
                : $unit['side'] === 'a' && ($code = self::HERO_CODES[substr($ref, 5)] ?? null) !== null && ($unit['hero'] ?? null) === $code;
            if (! $matches || $unit['hp'] <= 0 || ($unit['max_hp'] ?? 0) <= 0 || $unit['hp'] * 10 > $unit['max_hp'] * $trigger['tenths']) {
                continue;
            }
            foreach ($events as $event) {
                if (in_array($event['type'], ['attack', 'counter'], true) && ($event['target_unit_id'] ?? null) === $id && $event['hp_before'] > $event['hp_after']) {
                    return true;
                }
            }
        }
        return false;
    }

    private static function definitions(): array
    {
        if (self::$stages === null) {
            self::$stages = [];
            try {
                $doc = json_decode(file_get_contents(database_path('data/scenario/battle_events_ch1_5.json')), true, 512, JSON_THROW_ON_ERROR);
                $stages = [];
                foreach ($doc['stages'] as $stage) {
                    if (self::supports($stage['stage'])) {
                        $stages[$stage['stage']] = $stage['events'];
                    }
                }
                self::$stages = $stages;
            } catch (\Throwable $e) {
                // Story is cosmetic; never block core battle flow.
                logger()->warning('BattleStory definitions unavailable: '.$e->getMessage());
            }
            try {
                self::$stages += self::loadChapter6to10();
            } catch (\Throwable $e) {
                logger()->warning('BattleStory ch6_10 definitions unavailable: '.$e->getMessage());
            }
        }
        return self::$stages;
    }

    /**
     * battle_events_ch6_10.json(stage_id / scene.{captions,lines,short} / turn_start·hp_threshold·stage_victory 스키마)을
     * ch1_5 형식(stage / dialogue / short / policy / seq)으로 변환한다. patch_v6(v5 대체)의 events_set 중
     * 대사·캡션·요약·이름·트리거만 덮어쓴다(effects/direction 등은 사용하지 않음).
     * 엔진이 지원하지 않는 트리거(구역 진입·거리·인접·페어·아군 HP)는 null 로 두어 발화하지 않는다.
     */
    private static function loadChapter6to10(): array
    {
        $dir = database_path('data/scenario/');
        $doc = json_decode(file_get_contents($dir.'battle_events_ch6_10.json'), true, 512, JSON_THROW_ON_ERROR);
        $patches = [];
        try {
            $patch = json_decode(file_get_contents($dir.'battle_events.patch_v6.json'), true, 512, JSON_THROW_ON_ERROR);
            foreach ($patch['battle_events_ch6_10']['events_set'] ?? [] as $row) {
                $patches[$row['event_id'] ?? ''] = $row['set'] ?? [];
            }
        } catch (\Throwable $e) {
            logger()->warning('BattleStory patch_v6 unavailable: '.$e->getMessage());
        }
        $out = [];
        foreach ($doc['stages'] ?? [] as $stage) {
            $code = $stage['stage_id'] ?? '';
            if (! self::supports($code)) {
                continue;
            }
            $events = [];
            foreach (array_values($stage['events'] ?? []) as $i => $event) {
                $set = $patches[$event['id'] ?? ''] ?? [];
                $scene = $event['scene'] ?? [];
                $trigger = self::convertTrigger($set['trigger'] ?? $event['trigger'] ?? []);
                if ($trigger === null) {
                    continue;
                }
                $dialogue = [];
                foreach ($set['scene_captions'] ?? $scene['captions'] ?? [] as $caption) {
                    $dialogue[] = ['speaker' => 'caption', 'expr' => null, 'text' => (string) ($caption['text'] ?? '')];
                }
                foreach ($set['scene_lines'] ?? $scene['lines'] ?? [] as $line) {
                    $dialogue[] = $line;
                }
                $events[] = [
                    'id' => $event['id'], 'name' => $set['name'] ?? $event['name'] ?? '', 'trigger' => $trigger,
                    'priority' => (int) ($event['priority'] ?? 50), 'seq' => $i, 'dialogue' => $dialogue,
                    'short' => (string) ($set['scene_short'] ?? $scene['short'] ?? ''),
                    'policy' => ['input' => 'locked', 'repeat_battle' => 'short'],
                ];
            }
            $out[$code] = $events;
        }

        return $out;
    }

    /** ch6_10 트리거 -> BattleStory::matches 가 이해하는 트리거. 지원하지 않는 형태는 null */
    private static function convertTrigger(array $t): ?array
    {
        return match ($t['type'] ?? null) {
            'turn_start' => ['type' => 'turn_phase_start', 'turn' => $t['turn'] ?? 0, 'phase' => $t['phase'] ?? 'player'],
            'stage_victory' => ['type' => 'battle_end', 'result' => 'win'],
            'hp_threshold' => ($t['unit'] ?? null) === 'enemy_commander' && isset($t['lte_tenths'])
                ? ['type' => 'unit_troop_tenths_lte', 'unit' => 'enemy_commander', 'tenths' => $t['lte_tenths']] : null,
            default => null,
        };
    }
}
