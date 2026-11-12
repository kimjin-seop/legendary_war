<?php

namespace App\Game;

/**
 * 턴제 전술 규칙 엔진 (순수 PHP, 상태는 JSON 직렬화 가능한 배열).
 * 모든 수치(상성 배율, 지형 보정 등)는 RuleSet 주입값이며 '시작값'이다.
 */
final class Engine
{
    /** 규칙 옵션 기본값 = 레거시(모두 off). 앱은 config('game.rules')를 GameData::engine()으로 주입한다. */
    public const DEFAULT_OPTIONS = [
        'passive_skills' => false,   // passive 스킬(atk_pct/def_pct/heal) 적용
        'active_skills' => false,    // 액티브 스킬(use_skill 행동): 영웅 유닛 actives(쿨다운+전투당 횟수), 사용 시 영웅 행동 소모
        'mp_skills' => false,        // 액티브 스킬 MP 방식(쿨다운/횟수 대체): 전투 생성 시 state.mp_mode/mp_knobs에 고정(키 없음=레거시 cd/uses). active_skills가 on일 때만 의미
        'mp_start_pct' => 50,        // MP 방식: 시작 MP = mp_max x %
        'mp_regen_pct' => 15,        // MP 방식: 진영 턴(교대 행동은 라운드) 시작 회복 = max(mp_regen_min, round(mp_max x %))
        'mp_regen_min' => 5,
        'mp_skip_first_regen' => true, // MP 방식(진영 단위 턴 모드): 후공 진영의 1턴 시작 회복을 첫 틱 1회 건너뜀(선·후공 모두 시작 MP로 첫 행동). false=기존(후공 이점). 교대 행동은 해당 없음
        'mp_wait_pct' => 0,          // MP 방식: wait 시 추가 회복 mp_max x %(0=없음)
        'heal_percent' => 0.0,       // >0이면 치유량 = max(고정값, 대상 max_hp x 비율)
        'heal_cap' => 0,             // >0이면 턴 종료 시 진영 총 회복 상한
        'clamp' => null,             // [min,max]면 공격측 총배율(상성 x (1+공격보정)) 클램프
        'min_damage_pct' => 0.0,     // >0이면 최소 피해 = max(1, 공격력 x 비율)
        'ranged_counter' => false,   // true면 방어자 사거리 안이면 원거리끼리도 반격
        'turn_limit_rule' => 'hp_sum', // 턴 상한 판정: hp_sum(남은 HP 합) | hp_ratio(남은HP/초기HP 비율) | alive_then_ratio(생존 수 우선, 동수면 비율)
        'turn_limit_noncombatant_weight' => 1.0, // alive_then_ratio에서 비전투 유닛(치유사, 지휘관 제외)의 생존 수 가중치(1.0=동일, 0=무시)
        'first_turn_move_cap' => 0,  // >0이면 1턴 선공 진영 유닛의 이동력 상한(0=제한 없음). 선공 편향 보정 후보
        'second_atk_pct' => 0,       // >0이면 후공 진영 공격 보정(+%, 상성 배율에 가산). 선공 편향 보정 후보
        'highground_mult' => 1.0,    // 지형 2단계: 고지(terrains.elevation) 공격자 -> 저지 대상 피해 배율(1.0=off). clamp 이후, facing_cap 공유
        'forest_cover_mult' => 1.0,  // 숲(terrains.cover) 위 대상이 원거리(range_max>=2)에 맞을 때 배율(1.0=off)
        'forest_cover_exclude_ranged_target' => false, // true면 대상이 원거리 병종일 때 엄폐 제외(비교 측정용)
        'village_heal_pct' => 0.0,   // 마을(terrains.heals) 위 아군 턴 종료 시 최대 HP 비율 회복(0=off), heal_cap과 합산 관리
        'def_total_cap' => 0,        // >0이면 방어 보정 합(오라+패시브+지형 def%) 상한
        'squad' => false,            // 영웅-부대 소속 시스템(leader_id, 영웅 사망 시 부대 붕괴, 오라 수혜=소속): 전투 생성 시 state['squad']에 고정
        'squad_aura_self' => true,   // squad on: 오라원 본인도 오라 수혜(false면 부대만)
        'facing' => false,           // 방향(facing) 시스템: 전투 생성 시 state['facing']에 기록되어 그 전투에만 적용(진행 중 전투 불변)
        'facing_mult' => ['side' => 1.15, 'back' => 1.30], // 방향 배율(정면=1.0): 기존 clamp 이후에 곱함
        'facing_cap' => 1.8,         // 방향 배율 적용 후 총배율 상한
        'first_move_limit' => 0,     // >0이면 1턴 선공 진영은 최대 N기만 행동(이동/공격/대기). 0=제한 없음
        'alternate_activation' => false, // 교대 행동(부대 단위 번갈아 활성화): 전투 생성 시 state['alternate']에 고정. on이면 first_turn_move_cap/first_move_limit/second_atk_pct 무시
        'alt_consecutive_cap' => 2,  // 교대 행동: 상대가 소진됐을 때 한쪽이 연속 활성화할 수 있는 최대 횟수. 도달하면 라운드 종료(전투 첫 행동 시 state.alt.cap에 고정)
        'alt_first_rotate' => false, // 교대 행동: true면 짝수 라운드는 선공/후공을 맞바꿈(기본은 first_side 고정)
        'alt_implicit_activate' => false, // 교대 행동: true면 활성 부대가 없을 때 내 ready 부대 유닛의 move/attack/wait가 그 부대를 암묵 활성화(FE가 activate 미연동인 동안의 호환용)
        'dmg_mult' => 1.0,           // 피해 배율: dmg = max(최소피해, round((공격-방어) x dmg_mult)). 범위 0.5~2.0(생성자에서 clamp), 공격·반격 공통. 앱 기본은 config(1.2)
        'naval_water_atk_mult' => 1.0, // 수상(물) 규칙: 수병 공격자가 수상 칸(terrains.water=1)에 있을 때 총배율에 곱(1.0=off, clamp 이후, facing_cap 공유). 앱 기본은 config(1.35)
        'boarded_atk_mult' => 1.0,   // 배 탑승(sea·reef 위 foot·mounted·heavy) 비수병의 공격 배율(반격 포함, 1.0=off). 앱 기본은 config(0.90)
        'mage_def_ignore_pct' => 0, // 병종 v2 E1: 공격자 병종이 mage일 때 대상 기본 방어(def)의 N%를 무시(0=off, 지형·오라 방어 보정은 유지). 앱 기본은 config(30)
        'assassin_facing_mult' => null, // 병종 v2 E2: 공격자 병종이 assassin일 때 facing_mult 대신 쓰는 {side,back}(null=off, facing_cap 공유). 앱 기본은 config({side:1.25,back:1.5})
        'naval_land_atk_mult' => 1.0, // 수병이 수상이 아닌 칸에 있을 때 공격 배율(1.0=off). 앱 기본은 config(0.80)
        'ally_passthrough_cost' => 2, // 이동: 아군 유닛 칸은 통과 가능(진입 비용에 +N, 그 칸에 멈추기는 불가). 적 유닛 칸은 통과 불가. 0=비활성(기존: 모든 유닛 칸 통과 불가)
        'gunner_rules' => true,      // 총병(gunner) 전용: 사선(LOS, 중간 칸 terrains.blocks_line_of_fire 가 막음; 유닛은 불가) + 이동한 턴 사격 불가. 다른 병종에는 영향 없음. false=총병도 일반 사거리 규칙
        'micro_mode' => 'off',       // 병사 미시 교전(off|shadow|on). 전투 생성 시 state['micro_mode']에 고정(off면 키 없음). on 은 사용자 승인 전 금지. docs/MICRO_COMBAT_SPEC.md
        'micro_stages' => [],        // 미시 교전 화이트리스트(스테이지 code 또는 id). micro_stages/micro_rooms 중 하나라도 비어 있지 않으면 목록에 있는 스테이지·방만 micro_mode 적용(그 외 off). 둘 다 비면 전체 적용
        'micro_rooms' => [],         // 위와 같은 방(room code) 목록. 스테이지·방이 아닌 경로(시즌 전쟁 등)는 화이트리스트가 켜져 있으면 off
        'micro' => [],               // MicroCombat::DEFAULTS 덮어쓰기(앱은 config('game.micro'))
        'micro_no_snowball' => true, // 미시 모드(shadow/on)의 교전 타격 산출에서만 스노볼 가산을 끔(병사 수 우위 이중 가산 방지). off 모드 불변
        'snowball' => null,          // 병력 우위 스노볼(기본 off=null): {basis:hp|units, dead:0~0.5, slope:0~2, cap:0~0.5, hero_factor:0~1}. 전투 생성 시 state['snowball']에 고정. basis=units는 후공 편향이 커 비추천
    ];

    private readonly array $opts;

    public function __construct(private readonly RuleSet $rules, array $options = [])
    {
        $o = array_merge(self::DEFAULT_OPTIONS, $options);
        $o['dmg_mult'] = max(0.5, min(2.0, (float) $o['dmg_mult']));   // 잘못된 값 방지
        $o['snowball'] = self::normalizeSnowball($o['snowball']);
        $this->opts = $o;
    }

    /**
     * 새 전투에 적용할 미시 모드(off|shadow|on). 화이트리스트(micro_stages/micro_rooms)가 하나라도 있으면 scope(stage|room|other)와 key(스테이지 code/id, 방 code)가 목록에 있어야 한다.
     * 결과는 전투 생성 시 state['micro_mode']에 고정되므로 진행 중 전투는 설정 변경에 영향받지 않는다.
     *
     * @param  string|int|null  $keys  스테이지는 [code, id] 배열도 허용
     */
    public function microModeFor(string $scope = 'other', string|int|array|null $keys = null): string
    {
        $mode = (string) $this->opts['micro_mode'];
        if (! in_array($mode, ['shadow', 'on'], true)) {
            return 'off';
        }
        $stages = array_map('strval', (array) $this->opts['micro_stages']);
        $rooms = array_map('strval', (array) $this->opts['micro_rooms']);
        if ($stages === [] && $rooms === []) {
            return $mode;
        }
        $list = $scope === 'stage' ? $stages : ($scope === 'room' ? $rooms : []);
        foreach ((array) $keys as $k) {
            if ($k !== null && in_array((string) $k, $list, true)) {
                return $mode;
            }
        }

        return 'off';
    }

    /** 스노볼 옵션 정규화(null/비배열=off, 범위 clamp, basis 잘못되면 hp). */
    public static function normalizeSnowball(mixed $s): ?array
    {
        if (! is_array($s) || $s === []) {
            return null;
        }
        $c = fn (string $k, float $d, float $lo, float $hi) => max($lo, min($hi, is_numeric($s[$k] ?? null) ? (float) $s[$k] : $d));

        return [
            'basis' => ($s['basis'] ?? 'hp') === 'units' ? 'units' : 'hp',
            'dead' => $c('dead', 0.15, 0.0, 0.5), 'slope' => $c('slope', 0.5, 0.0, 2.0),
            'cap' => $c('cap', 0.10, 0.0, 0.5), 'hero_factor' => $c('hero_factor', 1.0, 0.0, 1.0),
        ];
    }

    /** 공격자 진영의 스노볼 보너스(0=없음). 상대 대비 진영 강도(HP 합 또는 유닛 수)가 dead 구간을 넘으면 slope 비례, cap 상한 */
    private function snowBonus(array $state, array $att): float
    {
        $sb = $state['snowball'] ?? null;
        if (! is_array($sb)) {
            return 0.0;
        }
        $own = 0.0;
        $en = 0.0;
        foreach ($state['units'] as $u) {
            $v = ($sb['basis'] ?? 'hp') === 'units' ? 1 : $u['hp'];
            $u['side'] === $att['side'] ? $own += $v : $en += $v;
        }
        $r = $own / max($en, 1e-6);
        $bonus = min((float) $sb['cap'], max(0.0, $r - 1 - (float) $sb['dead']) * (float) $sb['slope']);

        return $att['kind'] === 'troop' ? $bonus : $bonus * (float) $sb['hero_factor'];
    }

    /** 전투 생성용 MP 노브(MP 방식 off이면 null). initialState/makeUnit에 전달 -> state.mp_knobs에 고정 */
    public function mpKnobs(): ?array
    {
        if (! $this->opts['mp_skills'] || ! $this->opts['active_skills']) {
            return null;
        }

        return array_map('intval', array_intersect_key($this->opts, MpRules::DEFAULTS));
    }

    /** 이 전투가 MP 방식인가(전투 생성 시 고정된 state.mp_mode. 없으면 레거시 cd/uses) */
    public static function mpOn(array $state): bool
    {
        return ! empty($state['mp_mode']);
    }

    private function mpKnobsOf(array $state): array
    {
        return $state['mp_knobs'] ?? array_intersect_key($this->opts, MpRules::DEFAULTS);
    }

    /** 스킬 MP 비용(정의 mp_cost 우선, 없으면 MpRules 공식) */
    private function mpCost(array $d): int
    {
        return (int) ($d['mp_cost'] ?? MpRules::cost((string) $d['template'], (array) ($d['params'] ?? [])));
    }

    /** MP 방식 사용 가능(MP 충분 + 이번 턴 스킬 미사용). 레거시는 항상 true */
    private function mpOk(array $state, array $u, array $d): bool
    {
        return ! self::mpOn($state) || (! ($u['turn_skill_used'] ?? false) && (int) ($u['mp'] ?? 0) >= $this->mpCost($d));
    }

    /** MP 증감(+는 상한 clamp, 초과분은 state.mp_overflow 누적 계측, -는 0 하한). 실제 변화(delta!=0)가 있을 때만 mp_change 발행(만땅 회복 무변화는 이벤트 없이 계측만) */
    private function mpChange(array &$state, array &$events, string $id, int $delta, string $reason): void
    {
        $u = $state['units'][$id] ?? null;
        if ($u === null || ! isset($u['mp_max'])) {
            return;
        }
        $raw = (int) $u['mp'] + $delta;
        $new = max(0, min((int) $u['mp_max'], $raw));
        $overflow = max(0, $raw - (int) $u['mp_max']);
        $state['units'][$id]['mp'] = $new;
        $overflow > 0 && $state['mp_overflow'] = (int) ($state['mp_overflow'] ?? 0) + $overflow;
        if ($new === (int) $u['mp']) {
            return;
        }
        self::emit($state, $events, 'mp_change', [
            'unit_id' => $id, 'actor_unit_id' => $id, 'side' => $u['side'], 'delta' => $new - (int) $u['mp'], 'mp' => $new, 'mp_max' => (int) $u['mp_max'],
            'mp_pct' => (int) round($new * 100 / max(1, (int) $u['mp_max'])), 'reason' => $reason, 'overflow' => $overflow,
        ]);
    }

    /** MP 비율 5% 단위 양자화(상대 수치 역산 방지) */
    public static function quantPct(int $pct): int
    {
        return (int) (round($pct / 5) * 5);
    }

    /** 상대 진영 MP 수치 가림(5% 단위 비율만 공개): 상대의 mp_change는 mp/mp_max/delta/overflow 제거, skill_use는 mp_left 제거(mp_cost는 정적 카탈로그라 공개), mp_pct는 5% 양자화. $viewerSide=null이면 전원 가림 */
    public static function redactEvents(array $events, ?string $viewerSide): array
    {
        foreach ($events as $i => $e) {
            if (($e['side'] ?? null) === $viewerSide || ! in_array($e['type'] ?? null, ['mp_change', 'skill_use'], true) || ! array_key_exists('mp_pct', $e)) {   // mp_pct 없음 = 레거시 skill_use(그대로)
                continue;
            }
            unset($events[$i]['mp'], $events[$i]['mp_max'], $events[$i]['delta'], $events[$i]['overflow'], $events[$i]['mp_left']);
            $events[$i]['mp_pct'] = self::quantPct((int) $e['mp_pct']);
        }

        return $events;
    }

    /** 유닛 뷰용 MP 가림: 본인 진영만 mp/mp_max 수치, 상대는 5% 단위 mp_pct만. MP 없는 유닛(병사·레거시)은 그대로 */
    public static function redactUnitMp(array $u, ?string $viewerSide): array
    {
        if (! isset($u['mp_max'])) {
            return $u;
        }
        $u['mp_pct'] = (int) round((int) $u['mp'] * 100 / max(1, (int) $u['mp_max']));
        if ($u['side'] !== $viewerSide) {
            unset($u['mp'], $u['mp_max']);
            $u['mp_pct'] = self::quantPct($u['mp_pct']);
        }

        return $u;
    }

    public function options(): array
    {
        return $this->opts;
    }

    /** 맵별 규칙 오버라이드로 허용하는 규칙 키(봇 옵션 등은 제외) */
    public const MAP_RULE_KEYS = ['second_atk_pct', 'facing_mult', 'facing_cap', 'first_turn_move_cap', 'first_move_limit',
        'highground_mult', 'forest_cover_mult', 'forest_cover_exclude_ranged_target', 'village_heal_pct', 'def_total_cap', 'dmg_mult',
        'naval_water_atk_mult', 'boarded_atk_mult', 'naval_land_atk_mult'];

    /**
     * 맵 rules 검증/정규화(화이트리스트 키, 값 범위). 잘못되면 \InvalidArgumentException.
     *
     * @return array<string,mixed>
     */
    public static function sanitizeMapRules(?array $r): array
    {
        $out = [];
        foreach ($r ?? [] as $k => $v) {
            if (! in_array($k, self::MAP_RULE_KEYS, true)) {
                throw new \InvalidArgumentException("맵 rules에 허용되지 않는 키: {$k}");
            }
            $ok = match ($k) {
                'second_atk_pct' => is_int($v) && $v >= 0 && $v <= 50,
                'first_turn_move_cap', 'first_move_limit' => is_int($v) && $v >= 0 && $v <= 12,
                'facing_cap' => is_numeric($v) && $v >= 1 && $v <= 5,
                'highground_mult', 'forest_cover_mult', 'dmg_mult', 'naval_water_atk_mult', 'boarded_atk_mult', 'naval_land_atk_mult' => is_numeric($v) && $v >= 0.5 && $v <= 2,
                'forest_cover_exclude_ranged_target' => is_bool($v),
                'village_heal_pct' => is_numeric($v) && $v >= 0 && $v <= 0.5,
                'def_total_cap' => is_int($v) && $v >= 0 && $v <= 300,
                'facing_mult' => is_array($v) && array_keys($v) !== [] && ! array_diff(array_keys($v), ['side', 'back']) && count(array_filter($v, fn ($x) => is_numeric($x) && $x >= 1 && $x <= 3)) === count($v),
            };
            if (! $ok) {
                throw new \InvalidArgumentException("맵 rules 값이 올바르지 않습니다: {$k}");
            }
            $out[$k] = $v;
        }

        return $out;
    }

    /**
     * 스테이지 단위 규칙 오버라이드 검증: 맵 rules 허용 키 + max_turns(정수 5~60). 반환 ['rules'=>맵 규칙형, 'max_turns'=>int|null].
     *
     * @return array{rules: array<string,mixed>, max_turns: ?int}
     */
    public static function sanitizeStageRules(?array $r): array
    {
        $mt = null;
        is_array($r) && $r = array_diff_key($r, ['cues' => 1, 'sub_objectives' => 1, 'ally_npcs' => 1, 'factions' => 1, 'enemy_commander' => 1, 'protagonist_troop' => 1, 'commander_guard' => 1, 'win_mode' => 1, 'win_conditions' => 1, 'lose_conditions' => 1, 'optional' => 1, 'deploy_slots' => 1, 'required_heroes' => 1]);   // optional: 숨은 종장 집합 제외 표시. win_*/lose_*: StageRules. cues(연출)·ally_npcs(아군 NPC: normalizeAllyNpcs)는 맵 규칙 검증 대상이 아니다
        if (is_array($r) && array_key_exists('max_turns', $r)) {
            is_int($r['max_turns']) && $r['max_turns'] >= 5 && $r['max_turns'] <= 60 || throw new \InvalidArgumentException('스테이지 rules 값이 올바르지 않습니다: max_turns');
            $mt = $r['max_turns'];
            unset($r['max_turns']);
        }

        return ['rules' => self::sanitizeMapRules($r), 'max_turns' => $mt];
    }

    /**
     * 스테이지 배치 슬롯(stages.rules.deploy_slots) 정규화. 입력 {fixed_slots:[{id,x,y,hero,unit_type?,troop_type?}], free_slots:[{id,x,y,unit_types?:[..]}], cost_cap?:int}.
     * 잘못된 항목(좌표 비정수, 고정 슬롯 hero 누락, id/좌표 중복)은 버린다. 유효 슬롯이 하나도 없거나 배열이 아니면 null(= 슬롯 미정의, 현행 동작).
     * 좌표가 배치 영역 안인지/통행 가능한지는 맵이 필요하므로 여기서 보지 않는다(전투 생성·game:audit-stages 가 검사).
     *
     * @return array{fixed:array<int,array>,free:array<int,array>,cost_cap:?int}|null
     */
    public static function normalizeDeploySlots(mixed $raw): ?array
    {
        if (! is_array($raw)) {
            return null;
        }
        $ids = [];
        $cells = [];
        $take = function (mixed $s) use (&$ids, &$cells): bool {
            if (! is_array($s) || ! is_string($s['id'] ?? null) || $s['id'] === '' || ! is_int($s['x'] ?? null) || ! is_int($s['y'] ?? null)) {
                return false;
            }
            $k = $s['x'].','.$s['y'];
            if (isset($ids[$s['id']]) || isset($cells[$k])) {
                return false;
            }
            $ids[$s['id']] = $cells[$k] = true;

            return true;
        };
        $fixed = [];
        foreach (is_array($raw['fixed_slots'] ?? null) ? $raw['fixed_slots'] : [] as $s) {
            if (! is_array($s) || ! is_string($s['hero'] ?? null) || $s['hero'] === '' || ! $take($s)) {
                continue;
            }
            $fixed[] = ['id' => $s['id'], 'x' => $s['x'], 'y' => $s['y'], 'hero' => $s['hero']]
                + (is_string($s['unit_type'] ?? null) ? ['unit_type' => $s['unit_type']] : []) + (is_string($s['troop_type'] ?? null) ? ['troop_type' => $s['troop_type']] : []);
        }
        $free = [];
        foreach (is_array($raw['free_slots'] ?? null) ? $raw['free_slots'] : [] as $s) {
            if (! $take($s)) {
                continue;
            }
            $ut = is_array($s['unit_types'] ?? null) ? array_values(array_filter($s['unit_types'], 'is_string')) : [];
            $free[] = ['id' => $s['id'], 'x' => $s['x'], 'y' => $s['y']] + ($ut !== [] ? ['unit_types' => $ut] : []);
        }
        if ($fixed === [] && $free === []) {
            return null;
        }

        return ['fixed' => $fixed, 'free' => $free, 'cost_cap' => is_int($raw['cost_cap'] ?? null) && $raw['cost_cap'] > 0 ? $raw['cost_cap'] : null];
    }

    /**
     * 스테이지 아군 NPC(stages.rules.ally_npcs) 정규화. 항목 {hero:영웅코드, x:int, y:int, level?:int, unit_type?:병종, must_survive?:bool(기본 false)}.
     * 잘못된 항목은 버린다. 없으면 [](현행 동작).
     *
     * @return array<int,array{hero:string,x:int,y:int,level:?int,unit_type:?string,must_survive:bool}>
     */
    public static function normalizeAllyNpcs(mixed $raw): array
    {
        $out = [];
        foreach (is_array($raw) ? $raw : [] as $n) {
            if (! is_array($n) || ! is_string($n['hero'] ?? null) || $n['hero'] === '' || ! is_int($n['x'] ?? null) || ! is_int($n['y'] ?? null)) {
                continue;
            }
            $out[] = ['hero' => $n['hero'], 'x' => $n['x'], 'y' => $n['y'], 'level' => is_int($n['level'] ?? null) && $n['level'] >= 1 ? $n['level'] : null,
                'unit_type' => is_string($n['unit_type'] ?? null) ? $n['unit_type'] : null, 'must_survive' => ! empty($n['must_survive'])]
                + (($rt = RouteAi::normalize($n['route'] ?? null)) !== null ? ['route' => $rt] : []);   // route: 경로 이동 AI(RouteAi, 없으면 기존 키 구성 그대로)
        }

        return $out;
    }

    /** 전투 state의 맵 규칙 오버라이드가 있으면 그 값, 없으면 전역 옵션 */
    /** 전투 생성 시 state.frozen 에 고정된 값(없으면 현재 설정: 구 전투 호환) */
    public static function freezeOpts(array $opts): array
    {
        return ['ally_passthrough_cost' => (int) $opts['ally_passthrough_cost'], 'gunner_rules' => (bool) $opts['gunner_rules']];
    }

    public function frozenOpts(): array
    {
        return self::freezeOpts($this->opts);
    }

    private function frozen(array $state, string $key): mixed
    {
        return $state['frozen'][$key] ?? $this->opts[$key];
    }

    private function opt(array $state, string $key): mixed
    {
        $v = $state['rules'][$key] ?? null;
        if ($v === null) {
            return $this->opts[$key];
        }

        return $key === 'facing_mult' ? array_merge($this->opts['facing_mult'], $v) : $v;
    }

    /**
     * 뷰용: 맵/스테이지 rules 오버라이드(state.rules, MAP_RULE_KEYS)가 있는 키의 실제 적용 값(엔진 opt 와 동일, facing_mult 는 기본과 병합) + first_side.
     * 오버라이드가 없으면 [] (FE 는 키가 없으면 공개 규칙 기본값을 쓴다).
     */
    public function rulesEffective(array $state): array
    {
        $out = [];
        foreach (self::MAP_RULE_KEYS as $k) {
            if (($state['rules'][$k] ?? null) !== null) {
                $out[$k] = $this->opt($state, $k);
            }
        }

        return $out === [] ? [] : $out + ['first_side' => $state['first_side'] ?? 'a'];
    }

    public function rules(): RuleSet
    {
        return $this->rules;
    }

    public static function dist(int $x1, int $y1, int $x2, int $y2): int
    {
        return abs($x1 - $x2) + abs($y1 - $y2);
    }

    public function terrainAt(array $state, int $x, int $y): string
    {
        return $state['tiles'][$y][$x];
    }

    public function inBounds(array $state, int $x, int $y): bool
    {
        return $x >= 0 && $y >= 0 && $x < $state['width'] && $y < $state['height'];
    }

    public function unitAt(array $state, int $x, int $y): ?array
    {
        foreach ($state['units'] as $u) {
            if ($u['x'] === $x && $u['y'] === $y) {
                return $u;
            }
        }

        return null;
    }

    /** 해당 병종이 이 지형에 설 수 있는가 */
    public function passable(array $state, string $moveType, int $x, int $y): bool
    {
        return $this->inBounds($state, $x, $y)
            && $this->rules->terrainMod($this->terrainAt($state, $x, $y), $moveType)['cost'] !== null;
    }

    /**
     * 이동 가능 타일(비용 한도 내). 적 유닛 점유 칸은 통과 불가, 아군 유닛 칸은 ally_passthrough_cost>0 이면 통과만 가능(진입 비용 +N, 도착지 목록에서는 제외). 옵션 0 이면 모든 유닛 칸 통과 불가(기존). 현재 위치(비용 0) 포함.
     *
     * @return array<string,int> "x,y" => cost
     */
    public function reachable(array $state, string $unitId): array
    {
        $u = $state['units'][$unitId];
        $moveType = $this->rules->unitType($u['type'])['move_type'];
        $passCost = max(0, (int) $this->frozen($state, 'ally_passthrough_cost'));
        $budget = $this->moveBudget($state, $u);
        $discounts = $this->opts['passive_skills'] ? (array) ($u['special']['move_discount'] ?? []) : [];
        $best = ["{$u['x']},{$u['y']}" => 0];
        $queue = [[0, $u['x'], $u['y']]];
        while ($queue) {
            usort($queue, fn ($a, $b) => $a[0] <=> $b[0]);
            [$c, $x, $y] = array_shift($queue);
            if ($c > ($best["$x,$y"] ?? PHP_INT_MAX)) {
                continue;
            }
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if (! $this->inBounds($state, $nx, $ny)) {
                    continue;
                }
                $cost = $this->rules->terrainMod($this->terrainAt($state, $nx, $ny), $moveType)['cost'];
                $occ = $this->unitAt($state, $nx, $ny);
                if ($cost === null || ($occ !== null && ($passCost <= 0 || $occ['side'] !== $u['side']))) {
                    continue;   // 적 유닛 칸은 통과 불가. 아군 칸은 ally_passthrough_cost>0 일 때만 통과(진입 비용 가산)
                }
                if ($cost !== null && $discounts !== []) {   // T_TERRAIN_MASTER: 해당 지형 진입 비용 -N(최소 1)
                    $tc = $this->terrainAt($state, $nx, $ny);
                    foreach ($discounts as $dsc) {
                        if (in_array($tc, $dsc['terrain'], true)) {
                            $cost = max(1, $cost - (int) $dsc['amount']);
                        }
                    }
                }
                if ($occ !== null) {
                    $cost += $passCost;
                }
                $nc = $c + $cost;
                if ($nc > $budget || $nc >= ($best["$nx,$ny"] ?? PHP_INT_MAX)) {
                    continue;
                }
                $best["$nx,$ny"] = $nc;
                $queue[] = [$nc, $nx, $ny];
            }
        }
        if ($passCost > 0) {   // 아군 칸은 지나가기만 가능: 멈출 수 있는 칸(도착지)에서 제외(자기 칸은 유지)
            foreach (array_keys($best) as $k) {
                [$bx, $by] = array_map('intval', explode(',', $k));
                if (($o = $this->unitAt($state, $bx, $by)) !== null && $o['id'] !== $u['id']) {
                    unset($best[$k]);
                }
            }
        }

        return $best;
    }

    /** 이번 턴 이동력: 기본 move + 액티브 가산(stat=move 버프 최대치 + surge skill_move_bonus), first_turn_move_cap 적용(가산해도 cap 초과 불가) */
    public function moveBudget(array $state, array $u): int
    {
        $move = $u['move'] + $this->buffAmount($u, 'move') + (int) ($u['skill_move_bonus'] ?? 0)
            + ($this->opts['passive_skills'] ? (int) ($u['passive']['move'] ?? 0) : 0);   // T_MOVE_UP(상시 이동력 가산)
        $cap = (int) $this->opt($state, 'first_turn_move_cap');
        if ($cap > 0 && ! self::altOn($state) && ($state['turn'] ?? 1) === 1 && $u['side'] === ($state['first_side'] ?? 'a')) {
            return min($move, $cap);
        }

        return $move;
    }

    /** 유닛에 걸린 해당 stat 버프량(같은 stat은 max 갱신이라 1개). 없으면 0 */
    private function buffAmount(array $u, string $stat): int
    {
        $n = 0;
        foreach ($u['buffs'] ?? [] as $b) {
            if ($b['stat'] === $stat) {
                $n = max($n, (int) $b['amount']);
            }
        }

        return $n;
    }

    /**
     * 역방향 최단 이동 비용(다익스트라, reachable()과 같은 진입 비용 규칙): 각 타일에서 sources 중 하나에 도달하는 최소 비용.
     * $blocked("x,y"=>true) 타일은 통과·정차 불가. sources는 blocked여도 목표로 허용. 도달 불가 타일은 결과에 없다.
     *
     * @param  array<int,array{0:int,1:int}>  $sources
     * @return array<string,int> "x,y" => cost
     */
    public function costToReach(array $state, string $moveType, array $sources, array $blocked = []): array
    {
        $best = [];
        $queue = new \SplPriorityQueue;
        foreach ($sources as [$sx, $sy]) {
            $best["$sx,$sy"] = 0;
            $queue->insert([$sx, $sy, 0], 0);
        }
        while (! $queue->isEmpty()) {
            [$x, $y, $c] = $queue->extract();
            if ($c > ($best["$x,$y"] ?? PHP_INT_MAX)) {
                continue;
            }
            $enter = $this->rules->terrainMod($this->terrainAt($state, $x, $y), $moveType)['cost'] ?? 0;
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if (! $this->inBounds($state, $nx, $ny) || isset($blocked["$nx,$ny"])
                    || $this->rules->terrainMod($this->terrainAt($state, $nx, $ny), $moveType)['cost'] === null) {
                    continue;
                }
                $nc = $c + $enter;
                if ($nc < ($best["$nx,$ny"] ?? PHP_INT_MAX)) {
                    $best["$nx,$ny"] = $nc;
                    $queue->insert([$nx, $ny, $nc], -$nc);
                }
            }
        }

        return $best;
    }

    /** @return string[] 공격 가능한 적 유닛 id (유닛이 (x,y)에 있다고 가정) */
    public function targetsFrom(array $state, array $unit, int $x, int $y): array
    {
        $t = $this->rules->unitType($unit['type']);
        $gun = $this->frozen($state, 'gunner_rules') && $unit['type'] === 'gunner';
        if ($gun && (! empty($unit['moved']) || $x !== $unit['x'] || $y !== $unit['y'])) {
            return [];   // 총병: 이동 후 사격 불가(이동한 턴·다른 칸에서의 가정 사격 모두 없음)
        }
        $out = [];
        foreach ($state['units'] as $e) {
            if ($e['side'] === $unit['side']) {
                continue;
            }
            $d = self::dist($x, $y, $e['x'], $e['y']);
            if ($d >= $t['range_min'] && $d <= $t['range_max'] && (! $gun || $this->lineOfFire($state, $x, $y, $e['x'], $e['y']))) {
                $out[] = $e['id'];
            }
        }

        return $out;
    }

    /**
     * 사선(LOS) 판정: 두 칸 중심을 잇는 선분이 지나는 중간 칸(양 끝 칸 제외) 중 terrains.blocks_line_of_fire 칸이 하나라도 있으면 false.
     * 선분이 칸 경계(변·꼭짓점)를 정확히 지나면 맞닿은 두 칸 중 하나라도 막는 칸이면 막힘. 유닛(아군·적)은 막지 않는다. 정수 연산(칸 중심=(2x+1,2y+1), 칸=[2x,2x+2]).
     */
    public function lineOfFire(array $state, int $x0, int $y0, int $x1, int $y1): bool
    {
        $px = 2 * $x0 + 1;
        $py = 2 * $y0 + 1;
        $dx = 2 * ($x1 - $x0);
        $dy = 2 * ($y1 - $y0);
        for ($cy = min($y0, $y1); $cy <= max($y0, $y1); $cy++) {
            for ($cx = min($x0, $x1); $cx <= max($x0, $x1); $cx++) {
                if (($cx === $x0 && $cy === $y0) || ($cx === $x1 && $cy === $y1)) {
                    continue;
                }
                $pos = 0;
                $neg = 0;
                foreach ([[2 * $cx, 2 * $cy], [2 * $cx + 2, 2 * $cy], [2 * $cx, 2 * $cy + 2], [2 * $cx + 2, 2 * $cy + 2]] as [$qx, $qy]) {
                    $cr = $dx * ($qy - $py) - $dy * ($qx - $px);
                    $cr > 0 && $pos++;
                    $cr < 0 && $neg++;
                }
                if ($pos < 4 && $neg < 4 && $this->rules->terrainAttr($this->terrainAt($state, $cx, $cy), 'blocks_line_of_fire') > 0) {
                    return false;   // 선분이 이 칸(경계 포함)을 지남
                }
            }
        }

        return true;
    }

    /** 지휘관 오라 보정 (같은 진영 지휘관 반경 내) @return array{0:int,1:int} [atk_pct, def_pct] */
    public function auraBonus(array $state, array $unit, int $x, int $y): array
    {
        $atk = 0;
        $def = 0;
        if (self::squadOn($state)) {
            // squad on: 오라원(commander/hero, kind != troop)의 수혜 대상 = 그 영웅 소속(leader_id === 오라원 id) 유닛 + (옵션) 본인. 유닛당 1개.
            foreach ($state['units'] as $c) {
                if ($c['side'] !== $unit['side'] || $c['kind'] === 'troop' || ! ($c['aura'] ?? null)) {
                    continue;
                }
                $mine = ($unit['leader_id'] ?? null) === $c['id'] || ($c['id'] === $unit['id'] && $this->opts['squad_aura_self']);
                if ($mine && self::dist($x, $y, $c['x'], $c['y']) <= $c['aura']['radius']) {
                    return [$c['aura']['atk_pct'], $c['aura']['def_pct']];
                }
            }

            return [0, 0];
        }
        foreach ($state['units'] as $c) {
            if ($c['side'] === $unit['side'] && $c['kind'] === 'commander' && $c['aura']
                && self::dist($x, $y, $c['x'], $c['y']) <= $c['aura']['radius']) {
                $atk += $c['aura']['atk_pct'];
                $def += $c['aura']['def_pct'];
            }
        }

        return [$atk, $def];
    }

    public const FACINGS = ['up', 'down', 'left', 'right'];

    public static function squadOn(array $state): bool
    {
        return ! empty($state['squad']);
    }

    public static function facingOn(array $state): bool
    {
        return ! empty($state['facing']);
    }

    /** (dx,dy) 벡터의 우세 축 방향(대각선은 x축). 영벡터는 null */
    public static function axisDir(int $dx, int $dy): ?string
    {
        if ($dx === 0 && $dy === 0) {
            return null;
        }

        return abs($dx) >= abs($dy) ? ($dx > 0 ? 'right' : 'left') : ($dy > 0 ? 'down' : 'up');
    }

    /**
     * 공격 위치(ax,ay) -> 대상 def의 타격 방향: none(정면/방향 없음) | side | back.
     * 공격 방향 = (공격자 - 대상) 벡터의 우세 축. 대상 facing과 같으면 정면, 반대면 후면, 직각이면 측면, 대각선(|dx|=|dy|)은 측면.
     */
    public function flank(array $state, int $ax, int $ay, array $def): string
    {
        $f = $def['facing'] ?? null;
        if (! self::facingOn($state) || $f === null) {
            return 'none';
        }
        $dx = $ax - $def['x'];
        $dy = $ay - $def['y'];
        if (abs($dx) === abs($dy)) {
            return $dx === 0 ? 'none' : 'side';
        }
        $dir = self::axisDir($dx, $dy);
        if ($dir === $f) {
            return 'none';
        }
        $opp = ['up' => 'down', 'down' => 'up', 'left' => 'right', 'right' => 'left'];

        return $opp[$f] === $dir ? 'back' : 'side';
    }

    /** attacker가 (ax,ay)에서 defender(현재 위치)를 공격할 때의 피해량. counter=true면 반격(정면 취급, 방향 보정 없음) */
    public function damage(array $state, array $att, int $ax, int $ay, array $def, bool $counter = false): int
    {
        return $this->damageInfo($state, $att, $ax, $ay, $def, $counter)['dmg'];
    }

    /**
     * 연출용 피해 내역. multiplier=병종 상성 배율, terrain/terrain_def_pct=피격자 타일 지형과 방어 보정(%).
     *
     * @return array{dmg:int,multiplier:float,affinity:string,terrain:string,terrain_def_pct:int,flank:string}
     */
    public function damageInfo(array $state, array $att, int $ax, int $ay, array $def, bool $counter = false, float $defIgnorePct = 0.0, ?string $element = null): array
    {
        $mult = $this->rules->multiplier($att['type'], $def['type']);
        if ($mult < 1.0 && $this->opts['passive_skills'] && in_array($def['type'], (array) ($att['special']['matchup_negate'] ?? []), true)) {
            $mult = 1.0;   // T_MATCHUP_NEGATE: 지정 병종 상대 상성 불리 배율을 1.0으로 취급(유리 배율은 그대로)
        } elseif ($mult < 1.0 && $counter && $this->buffAmount($att, 'counter') > 0) {
            $mult = 1.0;   // T_ACTIVE_STANCE 반격태세: 반격 시 상성 불리 배율 1.0 취급
        }
        $terrain = $this->terrainAt($state, $def['x'], $def['y']);
        $tdef = $this->rules->terrainMod($terrain, $this->rules->unitType($def['type'])['move_type'])['def_pct'];
        [$aAtk] = $this->auraBonus($state, $att, $ax, $ay);
        [, $dDef] = $this->auraBonus($state, $def, $def['x'], $def['y']);
        $skillsApplied = [];
        if ($this->opts['passive_skills']) {
            $aAtk += $att['passive']['atk_pct'] ?? 0;      // 공격 보정은 합산(가산)
            $dDef += $def['passive']['def_pct'] ?? 0;      // 방어 보정(오라+패시브)은 지형과 합산
            // 조건부 패시브(영웅 유닛 `skills`). 풀 배치 - 각 효과는 한 풀에만 들어간다(이중 계산 방지):
            //  (a) atk_pct -> 공격 가산 풀 $aAtk (아래 clamp 안쪽, 총배율 clamp가 상한)
            //  (c) def_pct -> 방어 풀 $dDef (지형 def와 합산, def_total_cap 적용)
            //  (b) clamp 이후 곱셈 풀은 현재 사용하는 템플릿 없음(임밸런 추천 대기). 추가하더라도 facing_cap 이내로 제한할 것.
            // 확장 지점(미구현, 임밸런 신규 설계 대기): 상성 완화/무시($mult 보정, 아래 clamp 이전), 반격 무효(doAttack canCounter),
            //  방어 관통(def_total_cap 이전 $defTotal 감산), 지형 무시($tdef 보정). 모두 스킬이 clamp/facing_cap/def_total_cap을 우회하지 못하도록 이 함수 안에서만 처리한다.
            if (! empty($att['skills'])) {
                $r = PassiveEffects::evaluate($att['skills'], 'atk', $this->skillContext($state, $att, $ax, $ay, $def, $counter, true));
                $aAtk += $r['pct'];
                $skillsApplied = $r['codes'];
            }
            if (! empty($def['skills'])) {
                $r = PassiveEffects::evaluate($def['skills'], 'def', $this->skillContext($state, $def, $def['x'], $def['y'], $att, $counter, false));
                $dDef += $r['pct'];
                $skillsApplied = array_merge($skillsApplied, $r['codes']);
            }
        }
        if ($counter) {
            $aAtk += $this->buffAmount($att, 'counter');   // T_ACTIVE_STANCE: 반격 피해 가산(같은 풀, 총배율 clamp 이내)
        }
        $aAtk += $this->buffAmount($att, 'atk');   // 액티브 버프: 같은 가산 풀(clamp/def_total_cap/facing_cap이 상한, 반격에도 적용)
        $dDef += $this->buffAmount($def, 'def');
        if ($this->opt($state, 'second_atk_pct') > 0 && ! self::altOn($state) && $att['side'] !== ($state['first_side'] ?? 'a')) {
            $aAtk += $this->opt($state, 'second_atk_pct');
        }
        $total = $mult * (1 + $aAtk / 100);
        if ($this->opts['clamp']) {
            $total = max($this->opts['clamp'][0], min($this->opts['clamp'][1], $total));
        }
        $snow = $this->snowBonus($state, $att);
        if ($snow > 0) {   // 병력 우위 스노볼: 상성 clamp 이후, 방향·고지 이전(공격·반격 공통)
            $total *= 1 + $snow;
        }
        $flank = $counter ? 'none' : $this->flank($state, $ax, $ay, $def);
        if ($flank !== 'none') {   // 순서: 상성x(1+보정) -> clamp -> x방향 -> facing_cap -> -방어
            $fm = (array) $this->opt($state, 'facing_mult');
            $am = $this->opts['assassin_facing_mult'];
            if ($att['type'] === 'assassin' && is_array($am)) {   // E2: 암살자 전용 측/후방 배율
                $fm = array_merge($fm, array_intersect_key($am, ['side' => 1, 'back' => 1]));
            }
            $total = max($total, min((float) $this->opt($state, 'facing_cap'), $total * (float) $fm[$flank]));   // cap이 낮아도 방향 보너스가 배율을 낮추지 않음
        }
        // 지형 2단계(플래그 off면 1.0): 고지(공격자 타일 elevation > 대상 타일 elevation) x배율(facing_cap 공유), 숲 엄폐(원거리 공격 + 대상 숲)
        $hMult = 1.0;
        $cover = 1.0;
        $hg = (float) $this->opt($state, 'highground_mult');
        if ($hg > 1.0 && $this->rules->terrainAttr($this->terrainAt($state, $ax, $ay), 'elevation') > $this->rules->terrainAttr($terrain, 'elevation')) {
            $hMult = $hg;
            $total = max($total, min((float) $this->opt($state, 'facing_cap'), $total * $hg));
        }
        $cv = (float) $this->opt($state, 'forest_cover_mult');
        if ($cv < 1.0 && $this->rules->terrainAttr($terrain, 'cover') > 0 && $this->rules->unitType($att['type'])['range_max'] >= 2
            && ! ($this->opt($state, 'forest_cover_exclude_ranged_target') && $this->rules->unitType($def['type'])['range_max'] >= 2)) {
            $cover = $cv;
            $total *= $cv;
        }
        // 수상 규칙(옵션 1.0=off): 수병은 수상 칸에서 강화·육상에서 약화, 배 탑승 비수병은 약화. 총배율 clamp 이후, 증가분은 facing_cap 공유
        $wMult = 1.0;
        $attMoveType = $this->rules->unitType($att['type'])['move_type'];
        $attTerrain = $this->terrainAt($state, $ax, $ay);
        if ($attMoveType === 'naval') {
            $wMult *= (float) $this->opt($state, $this->rules->isWater($attTerrain) ? 'naval_water_atk_mult' : 'naval_land_atk_mult');
        } elseif ($this->rules->isBoarded($att['type'], $attTerrain)) {
            $wMult *= (float) $this->opt($state, 'boarded_atk_mult');
        }
        if ($wMult > 1.0) {
            $total = max($total, min((float) $this->opt($state, 'facing_cap'), $total * $wMult));
        } elseif ($wMult < 1.0) {
            $total *= $wMult;
        }
        $defTotal = $dDef + $tdef;
        $capped = false;
        $dcap = (int) $this->opt($state, 'def_total_cap');
        if ($dcap > 0 && $defTotal > $dcap) {   // 방어 보정 합 상한
            $defTotal = $dcap;
            $capped = true;
        }
        $raw = $att['atk'] * $total;
        $ign = $att['type'] === 'mage' ? max(0.0, min(100.0, (float) $this->opts['mage_def_ignore_pct'])) : 0.0;   // E1: 기본 방어만 일부 무시(지형·오라 방어 보정은 유지)
        if ($defIgnorePct > 0) {
            $ign = max($ign, min(100.0, $defIgnorePct));   // T_ACTIVE_PIERCE: 같은 방식(기본 방어만). 마법사 무시와는 큰 쪽만(중복 합산 없음)
        }
        $defense = $def['def'] * (1 - $ign / 100) * (1 + $defTotal / 100);
        $minDmg = $this->opts['min_damage_pct'] > 0 ? max(1, (int) round($att['atk'] * $this->opts['min_damage_pct'])) : 1;

        $dm = (float) $this->opt($state, 'dmg_mult');   // 맵 rules 오버라이드는 sanitizeMapRules 범위(0.5~2.0) 검증됨

        $em = 1.0;   // 속성 스킬 배율(1 - 내성%): 방어 감산 이후 최종 피해에 곱함. element 없으면 1.0 = 기존과 동일
        if ($element !== null) {
            $em = Elements::multiplier($element, $def, $terrain);
        }

        return ($element !== null ? ['element' => $element, 'element_pct' => (int) round(($em - 1.0) * 100)] : []) + [
            'dmg' => max($minDmg, (int) round(($raw - $defense) * $dm * $em)), 'multiplier' => $mult,
            'affinity' => $mult > 1 ? 'adv' : ($mult < 1 ? 'dis' : 'none'), 'terrain' => $terrain, 'terrain_def_pct' => $tdef, 'flank' => $flank,
            'elevation_mult' => $hMult, 'cover_mult' => $cover, 'def_capped' => $capped, 'snow_bonus' => round($snow, 4), 'dmg_mult' => $dm, 'water_mult' => $wMult,
            'skills_applied' => $skillsApplied,
        ];
    }

    /**
     * 조건부 패시브 평가 문맥(소유자 기준). $owner가 (ox,oy)에 서 있고 상대는 $other.
     * 소유자가 공격자($asAttacker)일 때 moved = 이번 턴 실제 이동(원래 타일과 다름, 반격 제외). 이동 출발점은 doMove가 영웅 유닛의 move_from에 기록한다
     * (moved 플래그는 제자리 이동·대기에도 true라 돌격 판정에 쓸 수 없다).
     */
    private function skillContext(array $state, array $owner, int $ox, int $oy, array $other, bool $counter, bool $asAttacker): array
    {
        $adj = 0;
        foreach ($state['units'] as $u) {
            if ($u['side'] === $owner['side'] && $u['id'] !== $owner['id'] && self::dist($ox, $oy, $u['x'], $u['y']) === 1) {
                $adj++;
            }
        }
        $moved = false;
        if ($asAttacker && ! $counter) {
            $moved = ($ox !== $owner['x'] || $oy !== $owner['y'])   // 가정 위치(봇 평가)면 이동한 것으로 본다
                || (! empty($owner['moved']) && isset($owner['move_from']) && $owner['move_from'] !== [$ox, $oy]);
        }

        return [
            'terrain' => $this->terrainAt($state, $ox, $oy), 'vs' => $other['type'],
            'hp_pct' => $owner['max_hp'] > 0 ? $owner['hp'] * 100 / $owner['max_hp'] : 100,
            'counter' => $counter, 'target_full_hp' => $other['hp'] >= $other['max_hp'], 'moved' => $moved, 'adjacent' => $adj,
            'target_hp_pct' => $other['max_hp'] > 0 ? $other['hp'] * 100 / $other['max_hp'] : 100,   // T_PURSUIT
            'target_terrain' => $this->terrainAt($state, $other['x'], $other['y']),                  // T_SIEGE_ATK
        ];
    }

    /**
     * 연출 이벤트 계약(고정 키). seq는 전투 전체에서 단조 증가(state.event_seq).
     * 규칙 미지원 필드: crit(항상 false), skill/aura 이벤트(발생 없음) - 값은 기본값으로만 존재.
     */
    public static function emit(array &$state, array &$events, string $type, array $f = []): void
    {
        $state['event_seq'] = ($state['event_seq'] ?? 0) + 1;
        $events[] = array_merge([
            'seq' => $state['event_seq'], 'type' => $type, 'actor_unit_id' => null, 'target_unit_id' => null,
            'from' => null, 'to' => null, 'dmg' => 0, 'crit' => false, 'affinity' => 'none', 'multiplier' => 1.0,
            'terrain' => null, 'terrain_def_pct' => 0, 'hp_before' => null, 'hp_after' => null, 'kill' => false,
            'flank' => 'none', 'facing' => null, 'unit_ids' => null, 'elevation_mult' => 1.0, 'cover_mult' => 1.0, 'def_capped' => false,
        ], $f);
    }

    /**
     * 설계 메모(액티브 스킬, 2단계 - 미구현): 액션 type 'skill'(unit_id, skill_code, target_id|x,y)을 apply 스위치와 applyAlt 스위치(doActivate 경유)에 추가한다.
     *  - 영웅 행동 소모(공격 대체): 사용 시 영웅 유닛 acted=true, 활성화(교대 행동)당 영웅 스킬 최대 1개, 병사 행동은 별개.
     *  - 쿨다운+전투당 횟수: state['skill_cd'][unit_id][skill_code] = ['cd'=>남은 라운드, 'uses'=>남은 횟수]. turn_start/round_end에서 cd 감소. 전투 생성 시 uses 초기화.
     *  - 이벤트 'skill_use'(actor_unit_id, skill_code, target_unit_id, dmg...) 예약(emit 기본 키에 skill 필드는 아직 없음). 피해는 damageInfo를 재사용해 clamp/facing_cap/def_total_cap 일관 유지.
     *  - 유닛 `skills`에는 passive 조건부만 있으므로 액티브는 별도 필드(`actives`)로 분리한다. enabled=0 + type=active로 이미 적재되어 있음.
     *
     * @return array{0:array,1:array} [새 상태, 이벤트]
     */
    public function apply(array $state, string $side, array $action): array
    {
        if (($state['status'] ?? 'active') !== 'active') {
            throw new IllegalAction('battle_finished', '이미 종료된 전투입니다.', 409);
        }
        if ($state['side'] !== $side) {
            throw new IllegalAction('not_your_turn', '내 턴이 아닙니다.', 409);
        }
        if (self::altOn($state)) {
            return $this->applyAlt($state, $side, $action);
        }
        $type = $action['type'] ?? null;
        $events = [];
        $this->assertFirstMoveSlot($state, $side, $type, $action);
        switch ($type) {
            case 'end_turn':
                $this->endTurn($state, $events, ($action['follow'] ?? false) === true);
                break;
            case 'move':
                $this->doMove($state, $this->ownUnit($state, $side, $action['unit_id'] ?? null), $action, $events);
                break;
            case 'attack':
                $this->doAttack($state, $this->ownUnit($state, $side, $action['unit_id'] ?? null), $action, $events);
                break;
            case 'wait':
                $this->doWait($state, $this->ownUnit($state, $side, $action['unit_id'] ?? null), $action, $events);
                break;
            case 'use_skill':
                $this->doUseSkill($state, $this->ownUnit($state, $side, $action['unit_id'] ?? null), $action, $events);
                break;
            case 'use_item':
                $this->doUseItem($state, $this->ownUnit($state, $side, $action['unit_id'] ?? null), $action, $events);
                break;
            default:
                throw new IllegalAction('invalid_action', '알 수 없는 행동입니다.');
        }

        return [$state, $events];
    }

    /** first_move_limit: 1턴 선공 진영의 행동 가능 잔여 칸 수. 제한 없으면 null. */
    public function firstMoveSlots(array $state, string $side): ?int
    {
        $limit = (int) $this->opt($state, 'first_move_limit');
        if (self::altOn($state) || $limit <= 0 || ($state['turn'] ?? 1) !== 1 || $side !== ($state['first_side'] ?? 'a')) {
            return null;
        }
        $used = 0;
        foreach ($state['units'] as $u) {
            if ($u['side'] === $side && ($u['moved'] || $u['acted'])) {
                $used++;
            }
        }

        return max(0, $limit - $used);
    }

    private function assertFirstMoveSlot(array $state, string $side, mixed $type, array $action): void
    {
        // 교대 행동(applyAlt)은 first_move_limit 자체가 무시되므로(firstMoveSlots=null) 이 검사는 apply() 경로에서만 의미가 있다.
        if (! in_array($type, ['move', 'attack', 'wait', 'use_item'], true) && ! ($type === 'use_skill' && $this->useSkillConsumesAction($state, $action))) {
            return;
        }
        $u = is_string($action['unit_id'] ?? null) ? ($state['units'][$action['unit_id']] ?? null) : null;
        if ($this->firstMoveSlots($state, $side) === 0 && $u && $u['side'] === $side && ! $u['moved'] && ! $u['acted']) {
            throw new IllegalAction('first_move_limit', '선공 1턴에는 행동 가능한 유닛 수가 제한됩니다.');
        }
    }

    /**
     * use_skill이 영웅 행동을 소모하는지(슬롯 검사 대상). strike/aoe/heal/atk·def buff = 소모.
     * surge·move buff는 행동 미소모(이후 일반 move/attack이 이어짐)라 슬롯 규칙과 충돌하지 않도록 검사 제외(기존 동작 유지).
     * 알 수 없는 스킬/미지원은 검사 제외(doUseSkill이 기존 오류로 거부).
     */
    private function useSkillConsumesAction(array $state, array $action): bool
    {
        if (! $this->opts['active_skills']) {
            return false;   // 옵션 off: doUseSkill이 skill_disabled로 거부(오류 코드 유지)
        }
        $u = is_string($action['unit_id'] ?? null) ? ($state['units'][$action['unit_id']] ?? null) : null;
        $code = $action['skill'] ?? null;
        $d = $u && is_string($code) ? $this->activeDef($u, $code) : null;
        $kind = $d ? (self::ACTIVE_TEMPLATES[$d['template']] ?? null) : null;
        if ($kind === 'buff') {
            return (string) $this->ap($d, 'stat', '') !== 'move';
        }

        return in_array($kind, ['strike', 'aoe', 'heal', 'pierce', 'stance'], true);
    }

    private function ownUnit(array $state, string $side, mixed $id): array
    {
        if (! is_string($id) || ! isset($state['units'][$id])) {
            throw new IllegalAction('unit_not_found', '유닛을 찾을 수 없습니다.', 404);
        }
        if ($state['units'][$id]['side'] !== $side) {
            throw new IllegalAction('unit_not_owned', '내 유닛이 아닙니다.', 403);
        }
        if ($state['units'][$id]['acted']) {
            throw new IllegalAction('already_acted', '이미 행동을 마친 유닛입니다.');
        }

        return $state['units'][$id];
    }

    private function doMove(array &$state, array $u, array $a, array &$events): void
    {
        if ($u['moved']) {
            throw new IllegalAction('already_moved', '이미 이동했습니다.');
        }
        if (! isset($a['x'], $a['y']) || ! is_int($a['x']) || ! is_int($a['y']) || ! $this->inBounds($state, $a['x'], $a['y'])) {
            throw new IllegalAction('out_of_bounds', '맵 밖 좌표입니다.');
        }
        $key = "{$a['x']},{$a['y']}";
        if (($o = $this->unitAt($state, $a['x'], $a['y'])) !== null && $o['id'] !== $u['id']) {
            throw new IllegalAction('tile_occupied', '점유된 타일입니다.');
        }
        if (! isset($this->reachable($state, $u['id'])[$key])) {
            throw new IllegalAction('unreachable', '이동할 수 없는 타일입니다.');
        }
        $terrain = $this->terrainAt($state, $a['x'], $a['y']);
        $newFacing = self::facingOn($state) ? (self::axisDir($a['x'] - $u['x'], $a['y'] - $u['y']) ?? ($u['facing'] ?? null)) : ($u['facing'] ?? null);   // 이동 방향(우세 축)을 바라봄
        self::emit($state, $events, 'move', [
            'actor_unit_id' => $u['id'], 'from' => [$u['x'], $u['y']], 'to' => [$a['x'], $a['y']], 'terrain' => $terrain, 'facing' => $newFacing,
            'terrain_def_pct' => $this->rules->terrainMod($terrain, $this->rules->unitType($u['type'])['move_type'])['def_pct'],
        ]);
        $state['units'][$u['id']]['x'] = $a['x'];
        $state['units'][$u['id']]['y'] = $a['y'];
        $state['units'][$u['id']]['moved'] = true;
        $state['units'][$u['id']]['facing'] = $newFacing;
        if (! empty($u['skills'])) {
            $state['units'][$u['id']]['move_from'] = [$u['x'], $u['y']];   // 돌격(T_CHARGE) 판정용 이동 출발점(조건부 스킬 보유 유닛만)
        }
        if (! empty($state['units'][$u['id']]['route'])) {   // 경로 AI 유닛: 웨이포인트에 선 순간 진행 인덱스를 state 에 고정(HeuristicBot::plan 은 복사본에서 계산하므로 여기서 영속화해야 되돌아가지 않는다)
            $rt = &$state['units'][$u['id']]['route'];
            $wps = $rt['waypoints'] ?? [];
            $i = (int) ($rt['i'] ?? 0);
            while ($i < count($wps) && $wps[$i] === [$a['x'], $a['y']]) {
                $i++;
            }
            $rt['i'] = $i;
            unset($rt);
        }
        $this->objectiveOnMove($state, $events);   // capture 도달형(hold_turns=0): 목표 칸에 서는 순간 승리
    }

    /**
     * 연출용 스크립트 이동(App\Game\Cues): 이동력·reachable·moved 검사를 건너뛰고 맵 안/빈 칸/통행 가능만 확인한다. 이동 후처리 중 capture 도달형 점령 판정(objectiveOnMove)만 발동하고 돌격·반격 등은 발동하지 않는다.
     * 기존 'move' 이벤트 형식으로 emit($extra 병합). 막히면 false(상태·이벤트 불변).
     */
    public function scriptMove(array &$state, array &$events, string $unitId, int $x, int $y, array $extra = []): bool
    {
        $u = $state['units'][$unitId] ?? null;
        if ($u === null || $u['hp'] <= 0 || ! $this->inBounds($state, $x, $y) || $this->unitAt($state, $x, $y) !== null) {
            return false;
        }
        $moveType = $this->rules->unitType($u['type'])['move_type'];
        if (! $this->passable($state, $moveType, $x, $y)) {
            return false;
        }
        $terrain = $this->terrainAt($state, $x, $y);
        $newFacing = self::facingOn($state) ? (self::axisDir($x - $u['x'], $y - $u['y']) ?? ($u['facing'] ?? null)) : ($u['facing'] ?? null);
        self::emit($state, $events, 'move', [
            'actor_unit_id' => $unitId, 'from' => [$u['x'], $u['y']], 'to' => [$x, $y], 'terrain' => $terrain, 'facing' => $newFacing,
            'terrain_def_pct' => $this->rules->terrainMod($terrain, $moveType)['def_pct'],
        ] + $extra);
        $state['units'][$unitId]['x'] = $x;
        $state['units'][$unitId]['y'] = $y;
        $state['units'][$unitId]['facing'] = $newFacing;
        $this->objectiveOnMove($state, $events);   // capture 도달형: 연출 이동으로 목표 칸에 서도 즉시 승리(doMove 와 동일 판정, active 가 아니면 내부에서 무시)

        return true;
    }

    private function doWait(array &$state, array $u, array $a, array &$events): void
    {
        if (array_key_exists('facing', $a) && (! is_string($a['facing']) || ! in_array($a['facing'], self::FACINGS, true))) {
            throw new IllegalAction('invalid_action', 'facing은 up|down|left|right 중 하나여야 합니다.');
        }
        $state['units'][$u['id']]['acted'] = true;
        $state['units'][$u['id']]['moved'] = true;
        if (self::mpOn($state) && isset($u['mp_max']) && ($w = MpRules::waitRegen((int) $u['mp_max'], $this->mpKnobsOf($state))) > 0) {
            $this->mpChange($state, $events, $u['id'], $w, 'wait');   // 옵션 노브(기본 0)
        }
        if (self::facingOn($state)) {   // facing 시스템 on일 때만 방향 반영 + wait 이벤트(off는 기존처럼 이벤트 없음)
            if (isset($a['facing'])) {
                $state['units'][$u['id']]['facing'] = $a['facing'];
            }
            self::emit($state, $events, 'wait', ['actor_unit_id' => $u['id'], 'facing' => $state['units'][$u['id']]['facing'] ?? null]);
        }
    }

    private function doAttack(array &$state, array $u, array $a, array &$events, float $powerMult = 1.0, ?string $viaSkill = null, float $defIgnorePct = 0.0, ?string $element = null): void
    {
        $tid = $a['target_id'] ?? null;
        if (! is_string($tid) || ! isset($state['units'][$tid])) {
            throw new IllegalAction('invalid_target', '대상을 찾을 수 없습니다.', 404);
        }
        $t = $state['units'][$tid];
        if ($t['side'] === $u['side']) {
            throw new IllegalAction('invalid_target', '아군은 공격할 수 없습니다.');
        }
        if (! in_array($tid, $this->targetsFrom($state, $u, $u['x'], $u['y']), true)) {
            throw new IllegalAction('out_of_range', '사거리 밖입니다.');
        }
        $info = $this->damageInfo($state, $u, $u['x'], $u['y'], $t, false, $defIgnorePct, $element);
        if ($viaSkill === null && ($u['skill_attack_pct'] ?? 100) > 100) {   // surge 돌진: 그 턴 첫 일반 공격에만 배율(스킬 공격과는 곱하지 않음), 소비 후 제거
            $powerMult = (int) $u['skill_attack_pct'] / 100;
            unset($state['units'][$u['id']]['skill_attack_pct']);
        }
        if ($powerMult !== 1.0) {   // 액티브 강타: 일반 피해식 결과에 스킬 배율(최소 1)
            $info['dmg'] = max(1, (int) round($info['dmg'] * $powerMult));
        }
        $dmg = $info['dmg'];
        $micro = ($viaSkill === null && in_array($state['micro_mode'] ?? 'off', ['shadow', 'on'], true)) ? $this->microEngage($state, $u, $t, $info) : null;   // 액티브 스킬 교전은 미시 제외(기존 공식)
        $microOn = $micro !== null && $state['micro_mode'] === 'on';
        if ($microOn) {
            $dmg = $t['hp'] - $micro['res']['hp_after'][1];
            $info['dmg'] = $dmg;
        }
        $state['units'][$tid]['hp'] = $microOn ? $micro['res']['hp_after'][1] : max(0, $t['hp'] - $dmg);
        if (self::facingOn($state)) {   // 자동 회전: 공격자는 대상 쪽, 피격 유닛은 공격자 쪽(대각선은 x축)
            $state['units'][$u['id']]['facing'] = self::axisDir($t['x'] - $u['x'], $t['y'] - $u['y']) ?? ($u['facing'] ?? null);
            $state['units'][$tid]['facing'] = self::axisDir($u['x'] - $t['x'], $u['y'] - $t['y']) ?? ($t['facing'] ?? null);
        }
        self::emit($state, $events, 'attack', $this->hitFields($u['id'], $tid, $info, $t['hp'], $state['units'][$tid]['hp'], $state['units'][$u['id']]['facing'] ?? null) + ($viaSkill !== null ? ['via_skill' => $viaSkill] : []) + ($micro !== null ? ['micro' => $micro['event']] : []));
        $state['units'][$u['id']]['acted'] = true;
        $state['units'][$u['id']]['moved'] = true;

        if ($microOn) {   // 미시 on: 반격은 교전 안에서 동시 처리됨. 공격자 손실이 있으면 counter 이벤트 1회(기존 FE 호환)
            $lost = $u['hp'] - $micro['res']['hp_after'][0];
            $state['units'][$u['id']]['hp'] = $micro['res']['hp_after'][0];
            if ($lost > 0) {
                $cinfo = $micro['cinfo'];
                $cinfo['dmg'] = $lost;
                self::emit($state, $events, 'counter', $this->hitFields($tid, $u['id'], $cinfo, $u['hp'], $state['units'][$u['id']]['hp'], $state['units'][$tid]['facing'] ?? null));
            }
        } elseif ($state['units'][$tid]['hp'] > 0) {
            // 반격: 근접(사거리 1)끼리, 생존 시, 거리 1
            $ut = $this->rules->unitType($u['type']);
            $tt = $this->rules->unitType($t['type']);
            $d = self::dist($u['x'], $u['y'], $t['x'], $t['y']);
            $canCounter = $this->opts['ranged_counter']
                ? ($d >= $tt['range_min'] && $d <= $tt['range_max'])
                : ($ut['range_max'] === 1 && $tt['range_max'] === 1 && $d === 1);
            if ($canCounter) {
                $cinfo = $this->damageInfo($state, $state['units'][$tid], $t['x'], $t['y'], $state['units'][$u['id']], true);   // 반격은 정면 취급
                $state['units'][$u['id']]['hp'] = max(0, $u['hp'] - $cinfo['dmg']);
                self::emit($state, $events, 'counter', $this->hitFields($tid, $u['id'], $cinfo, $u['hp'], $state['units'][$u['id']]['hp'], $state['units'][$tid]['facing'] ?? null));
            }
        }
        foreach ([$tid => $u['id'], $u['id'] => $tid] as $id => $killer) {
            $this->resolveDeath($state, $id, $killer, $events);
        }
    }

    /**
     * 미시 교전 실행(shadow/on 공통). 개체당 기본 타격 피해는 기존 damageInfo 산출값(공격측 $info, 방어측은 반격 취급=정면)을 재사용한다.
     * state['rng']는 쓰지 않는다. micro_no_snowball 이면 이 산출에서만 스노볼을 끈다(복사본 사용, 원본 state 불변).
     *
     * @return array{res:array,cinfo:array,event:array}
     */
    private function microEngage(array $state, array $u, array $t, array $info): array
    {
        $calc = $state;
        if ($this->opts['micro_no_snowball'] && isset($calc['snowball'])) {
            unset($calc['snowball']);
            $keep = $info['dmg'] !== $this->damageInfo($state, $u, $u['x'], $u['y'], $t, false)['dmg'];   // 서지 돌진 등으로 이미 배율이 적용됐으면 그 값을 유지
            $info = $keep ? $info : $this->damageInfo($calc, $u, $u['x'], $u['y'], $t, false);
        }
        $cinfo = $this->damageInfo($calc, $t, $t['x'], $t['y'], $u, true);
        $spec = fn (array $x, int $d) => ['hp' => $x['hp'], 'max_hp' => $x['max_hp'], 'dmg' => $d, 'range' => $this->rules->unitType($x['type'])['range_max'],
            'move_type' => $this->rules->unitType($x['type'])['move_type'], 'hero' => ($x['kind'] ?? 'troop') !== 'troop',
            'formation' => $this->microFormation($state, $x)];
        $res = \App\Game\Micro\MicroCombat::run($spec($u, $info['dmg']), $spec($t, $cinfo['dmg']), $this->opts['micro']);

        return ['res' => $res, 'cinfo' => $cinfo, 'event' => ['mode' => $state['micro_mode'], 'hp_after' => $res['hp_after'], 'ticks' => $res['ticks'], 'tick_ms' => $res['tick_ms']]
            + (isset($res['formation']) ? ['formation' => $res['formation'], 'formation_ko' => array_map(fn ($c) => \App\Game\Micro\MicroCombat::FORMATIONS[$c]['name_ko'] ?? '기본', $res['formation'])] : [])
            + array_intersect_key($res, array_flip(['v', 'alive', 'hp_scale', 'hp_before', 'end_tick', 's', 'm', 'e', 'k', 'h', 'd', 'r', 'survivors', 'rt']))];
    }

    /** 병사 유닛의 진형 코드: 유닛 자체 지정(적 부대 formation) > 소속 영웅(leader_id)의 영웅-진형 데이터 > null(기본 배치). 영웅/지휘관 개체는 항상 null */
    private function microFormation(array $state, array $x): ?string
    {
        if (($x['kind'] ?? 'troop') !== 'troop') {
            return null;
        }
        if (isset($x['formation'])) {
            return \App\Game\Micro\FormationBook::normalize($x['formation']);
        }

        return \App\Game\Micro\FormationBook::forHero($state['units'][$x['leader_id'] ?? '']['hero'] ?? null);
    }

    /** hp<=0인 유닛의 kill/collapse/commander_defeated 처리(doAttack과 AOE splash 공용). 이미 제거됐거나 생존이면 아무 일도 하지 않는다. */
    /**
     * 퇴각(연출 cue `retreat`): 유닛을 전장에서 제거한다(사망 아님: kill 이벤트·격파(defeated) 기록·지휘관 패배 판정 없음).
     * 지휘관·캠페인 주인공은 퇴각 불가(false). 소속(squad) 부대원도 함께 제거. state.retreated[id]={side,kind,hero,turn} 기록. 이벤트 unit_removed{unit_ids,reason:'retreat'}.
     */
    public function retreatUnit(array &$state, array &$events, string $id, ?string $cueId = null, bool $death = false): bool
    {
        $u = $state['units'][$id] ?? null;
        if ($u === null || $u['hp'] <= 0 || $u['kind'] === 'commander' || ! empty($u['protagonist'])) {
            return false;
        }
        $gone = [$id];
        if (self::squadOn($state) && $u['kind'] !== 'troop') {
            $gone = array_merge($gone, array_keys(array_filter($state['units'], fn ($o) => ($o['leader_id'] ?? null) === $id)));
        }
        foreach ($gone as $gid) {
            unset($state['units'][$gid]);
        }
        $rec = ['side' => $u['side'], 'kind' => $u['kind'], 'hero' => $u['hero'] ?? null, 'turn' => $state['turn']] + (empty($u['npc_ally']) ? [] : ['npc_ally' => true]);   // npc_ally: ally_npc: 참조 매칭용
        $death ? $state['defeated'][$id] = $rec : $state['retreated'][$id] = $rec;   // 연출용 사망은 defeated 조건(EventConditions)에도 잡힌다
        self::emit($state, $events, 'unit_removed', ['actor_unit_id' => $id, 'unit_ids' => $gone, 'reason' => $death ? 'death' : 'retreat', 'side' => $u['side'], 'hero' => $u['hero'] ?? null, 'cue_id' => $cueId]);
        if ($death && ! empty($u['must_survive']) && ($state['status'] ?? 'active') === 'active' && ($u['side'] === 'a' || StageRules::gate($state))) {   // 연출 사망도 must_survive 유닛이면 resolveDeath 와 같이 즉시 패배(우회 방지). 일반 retreat 는 의도된 퇴장이라 판정 없음
            $this->finish($state, $u['side'] === 'a' ? 'b' : 'a', 'commander_defeated', $events);
        }

        return true;
    }

    /**
     * 이탈·배신(cue defect): 유닛과 그 소속 병사의 진영을 $to 로 바꾼다(a=아군 NPC 로 전환되어 아군 NPC AI 가 조종, b=적 봇). 지휘관·주인공·이미 같은 진영·사망 유닛은 false(상태 불변).
     * 경로·대기 AI(route/hold_until_turn)는 제거하고, 이번 라운드 행동은 하지 않은 것으로 둔다. 이벤트 unit_defected {unit_ids, from, to, hero, cue_id}.
     */
    public function defectUnit(array &$state, array &$events, string $id, string $to, ?string $cueId = null): bool
    {
        $u = $state['units'][$id] ?? null;
        if ($u === null || $u['hp'] <= 0 || $u['kind'] === 'commander' || ! empty($u['protagonist']) || ! empty($u['must_survive']) || $u['side'] === $to || ! in_array($to, ['a', 'b'], true)) {   // must_survive 유닛은 전환 불가(생존 의무 해제 우회 방지)
            return false;
        }
        $ids = [$id];
        if (self::squadOn($state) && $u['kind'] !== 'troop') {
            $ids = array_merge($ids, array_keys(array_filter($state['units'], fn ($o) => ($o['leader_id'] ?? null) === $id)));
        }
        foreach ($ids as $uid) {
            $state['units'][$uid]['side'] = $to;
            unset($state['units'][$uid]['route'], $state['units'][$uid]['hold_until_turn'], $state['units'][$uid]['must_survive']);
            if ($to === 'a') {
                $state['units'][$uid]['npc_ally'] = true;
            } else {
                unset($state['units'][$uid]['npc_ally']);
            }
            $state['units'][$uid]['moved'] = false;
            $state['units'][$uid]['acted'] = false;
        }
        self::emit($state, $events, 'unit_defected', ['actor_unit_id' => $id, 'unit_ids' => $ids, 'from' => $u['side'], 'to' => $to, 'hero' => $u['hero'] ?? null, 'cue_id' => $cueId]);

        return true;
    }

    private function resolveDeath(array &$state, string $id, string $killer, array &$events): void
    {
        if (! isset($state['units'][$id]) || $state['units'][$id]['hp'] > 0) {   // isset: 붕괴로 이미 제거된 유닛 가드
            return;
        }
        self::emit($state, $events, 'kill', [
            'actor_unit_id' => $killer, 'target_unit_id' => $id, 'hp_before' => 0, 'hp_after' => 0, 'kill' => true,
        ]);
        $dead = $state['units'][$id];
        unset($state['units'][$id]);
        if (isset($state['cues']) || isset($state['story']) || isset($state['sub_objectives']) || isset($state['win_rule']) || isset($state['lose_rules'])) {   // 이벤트 조건(EventConditions defeated)용 격파 기록: 연출·스토리가 있는 전투에만(그 외 state 불변)
            $state['defeated'][$id] = ['side' => $dead['side'], 'kind' => $dead['kind'], 'hero' => $dead['hero'] ?? null] + (empty($dead['npc_ally']) ? [] : ['npc_ally' => true]);   // npc_ally: ally_npc: 참조 매칭용
        }
        if (self::squadOn($state) && $dead['kind'] !== 'troop') {   // 영웅 사망 -> 소속 유닛 즉시 붕괴(kill 직후, battle_end 이전)
            $gone = array_keys(array_filter($state['units'], fn ($o) => ($o['leader_id'] ?? null) === $id));
            if ($gone) {
                foreach ($gone as $gid) {
                    unset($state['units'][$gid]);
                }
                self::emit($state, $events, 'collapse', ['actor_unit_id' => $killer, 'target_unit_id' => $id, 'unit_ids' => $gone]);
            }
        }
        // 지휘관 사망 즉시 패배. 캠페인 주인공(unit.protagonist)도 지휘관과 같이 취급: 목표(survive_turns·capture)와 무관하게 사망 즉시 패배(승리 판정보다 우선)
        if (($dead['kind'] === 'commander' || ! empty($dead['protagonist']) || ! empty($dead['must_survive'])) && ($state['status'] ?? 'active') === 'active'
            && ($dead['side'] === 'a' || StageRules::gate($state))) {   // 적(b) 사망으로 인한 승리만 StageRules(win_mode)가 보류할 수 있다(규칙 없으면 gate=true)
            $this->finish($state, $dead['side'] === 'a' ? 'b' : 'a', 'commander_defeated', $events);
        }
    }

    /** 액티브 템플릿 -> 효과 종류. T_ACTIVE_DECOY는 미구현(데이터 비활성) */
    public const ACTIVE_TEMPLATES = ['T_ACTIVE_STRIKE' => 'strike', 'T_ACTIVE_AOE' => 'aoe', 'T_ACTIVE_BUFF' => 'buff', 'T_ACTIVE_HEAL' => 'heal', 'T_ACTIVE_SURGE' => 'surge',
        'T_ACTIVE_PIERCE' => 'pierce', 'T_ACTIVE_STANCE' => 'stance'];

    /** 턴/라운드 시작 자원 갱신(side=null이면 양측): 레거시=쿨다운 -1, MP 방식=MP 회복(mp_change turn_start) + 버프 지속 -1(0이 되면 buff_expire) */
    private function tickResources(array &$state, ?string $side, array &$events): void
    {
        $mp = self::mpOn($state);
        $skipFirst = $mp && $side !== null && empty($state['mp_first_tick_skipped']) && ! empty($this->mpKnobsOf($state)['mp_skip_first_regen']);   // 키 없는 진행 중 전투(노브 미고정)는 기존 동작
        $skipFirst && $state['mp_first_tick_skipped'] = true;
        foreach ($state['units'] as $id => $u) {
            if ($side !== null && $u['side'] !== $side) {
                continue;
            }
            if ($mp) {
                if (! $skipFirst && isset($u['mp_max'])) {   // $skipFirst: 후공 진영 첫 틱(1턴 시작) 회복 생략(진영 단위 턴 모드, 1회)
                    $this->mpChange($state, $events, $id, MpRules::regen((int) $u['mp_max'], $this->mpKnobsOf($state)), 'turn_start');
                }
            } else {
                foreach ($u['skill_state'] ?? [] as $code => $st) {
                    $state['units'][$id]['skill_state'][$code]['cd'] = max(0, (int) $st['cd'] - 1);
                }
            }
            if (! empty($u['buffs'])) {
                $keep = [];
                foreach ($u['buffs'] as $b) {
                    $b['left'] = (int) $b['left'] - 1;
                    if ($b['left'] > 0) {
                        $keep[] = $b;
                    } else {
                        self::emit($state, $events, 'buff_expire', ['target_unit_id' => $id, 'stat' => $b['stat']]);
                    }
                }
                if ($keep) {
                    $state['units'][$id]['buffs'] = $keep;
                } else {
                    unset($state['units'][$id]['buffs']);
                }
            }
        }
    }

    /** 유닛의 액티브 정의(code로). 없으면 null */
    private function activeDef(array $u, string $code): ?array
    {
        foreach ($u['actives'] ?? [] as $d) {
            if ($d['code'] === $code) {
                return $d;
            }
        }

        return null;
    }

    /** 공격형 액티브의 속성(params.element, 허용 코드만). 없으면 null = 속성 없는 기존 피해 */
    private function skillElement(array $d): ?string
    {
        return Elements::valid($this->ap($d, 'element', null));
    }

    /** 액티브 파라미터(검증된 params 우선, 없으면 정의 최상위 키, 없으면 기본값) */
    private function ap(array $d, string $key, mixed $default): mixed
    {
        return $d['params'][$key] ?? $d[$key] ?? $default;
    }

    /** 대상 종류: enemy(적 유닛) | ally(아군 유닛, 자신 포함) | self(시전자 중심, 대상 지정 없음) | none(대상 없음) */
    private function activeTargetKind(array $d): string
    {
        return match (self::ACTIVE_TEMPLATES[$d['template']] ?? null) {
            'strike', 'aoe', 'pierce' => 'enemy',
            'heal' => 'ally',
            'stance' => 'self',
            'buff' => $this->ap($d, 'target_mode', 'self_area') === 'ally' ? 'ally' : 'self',
            default => 'none',
        };
    }

    /** 같은 진영 유닛 id(중심 반경 이내, 문자열 오름차순). 시전자 포함 */
    private function allyIdsWithin(array $state, string $side, int $cx, int $cy, int $r): array
    {
        $ids = [];
        foreach ($state['units'] as $o) {
            if ($o['side'] === $side && self::dist($cx, $cy, $o['x'], $o['y']) <= $r) {
                $ids[] = $o['id'];
            }
        }
        sort($ids, SORT_STRING);

        return $ids;
    }

    /** 치유 대상 후보(부상 아군, 시전 가능 거리 이내) */
    private function healCandidates(array $state, array $u, array $d): array
    {
        $out = [];
        foreach ($this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], (int) $this->ap($d, 'cast_range', 2)) as $id) {
            if ($state['units'][$id]['hp'] < $state['units'][$id]['max_hp']) {
                $out[] = $id;
            }
        }

        return $out;
    }

    /** 사용 조건(쿨다운·횟수·행동·템플릿별 전제) 가용 여부. strike/aoe는 기존 의미대로 대상 유무를 보지 않고(targets로 판단), heal은 부상 아군이 없으면 false */
    private function activeUsable(array $state, array $u, array $d): bool
    {
        $st = $u['skill_state'][$d['code']] ?? ['cd' => 0, 'uses_left' => (int) $d['uses']];
        $kind = self::ACTIVE_TEMPLATES[$d['template']] ?? null;
        if ($kind === null || $u['acted'] || (self::mpOn($state) ? ! $this->mpOk($state, $u, $d) : ((int) $st['cd'] > 0 || (int) $st['uses_left'] <= 0))) {
            return false;
        }

        return match ($kind) {
            'heal' => $this->healCandidates($state, $u, $d) !== [],
            'surge' => ! $u['moved'] && (int) ($state['turn'] ?? 1) >= (int) $this->ap($d, 'min_turn', 2),
            default => true,
        };
    }

    /**
     * 봇 공용: 공격 대체형(strike/aoe) 액티브 중 이번 공격 대상 $targetId에 쓸 만한 첫 항목(쿨다운 0, 잔여 횟수>0, 영웅 행동 미소모). 없으면 null.
     * strike = 항상 사용, aoe = 대상 주변 인접 적(오폭 아군 제외)이 1명 이상 더 있을 때만(횟수 낭비 방지). $targetId=null이면 strike만 판단(레거시 호출).
     * buff/heal/surge는 공격을 대체하지 않으므로 supportActive()/surgeAction()이 따로 판단한다.
     */
    public function usableActive(array $state, array $u, ?string $targetId = null): ?array
    {
        if (! $this->opts['active_skills'] || empty($u['actives']) || $u['acted']) {
            return null;
        }
        foreach ($u['actives'] as $d) {
            $st = $u['skill_state'][$d['code']] ?? ['cd' => 0, 'uses_left' => (int) $d['uses']];
            if (self::mpOn($state) ? ! $this->mpOk($state, $u, $d) : ((int) $st['cd'] !== 0 || (int) $st['uses_left'] <= 0)) {
                continue;   // MP 방식: MP 부족/이번 턴 사용 후면 건너뜀(봇은 일반 공격)
            }
            $kind = self::ACTIVE_TEMPLATES[$d['template']] ?? null;
            if ($kind === 'strike' || $kind === 'pierce') {
                return $d;
            }
            if ($kind === 'aoe' && $targetId !== null && isset($state['units'][$targetId])) {
                $t = $state['units'][$targetId];
                $r = (int) $this->ap($d, 'radius', 1);
                $net = 0;
                foreach ($state['units'] as $o) {
                    if ($o['id'] === $t['id'] || $o['id'] === $u['id'] || self::dist($t['x'], $t['y'], $o['x'], $o['y']) > $r) {
                        continue;
                    }
                    if ($o['side'] !== $u['side']) {
                        $net++;
                    } elseif ($this->ap($d, 'friendly_fire', false)) {
                        $net--;
                    }
                }
                if ($net >= (int) config('game.bot_skill.aoe_min_extra', 0) && ($net >= 1 || (int) $d['power_pct'] >= 100)) {   // 노브 aoe_min_extra: 주변 추가 명중 최소 수(기본 0 = 단일 대상이라도 위력 100% 이상이면 사용, 1 = 구 동작)
                    return $d;
                }
            }
        }

        return null;
    }

    /**
     * 봇 공용: 이동·공격과 별개로 쓰는 지원형 액티브(buff/heal)의 사용 판단. 사용할 action을 반환(없으면 null).
     * buff self_area: 반경 내 아군(본인 포함) 3명 이상 + 가장 가까운 적이 (이동력+사거리+2) 이내 + 같은 stat 버프가 남아 있지 않을 때.
     * buff ally: 사거리 내 가장 앞선(적과 가장 가까운) 아군 1명(같은 stat 버프가 없을 때). heal: 최저 HP 비율 아군의 결손 >= 예상 치유량의 70%.
     */
    public function supportActive(array $state, array $u): ?array
    {
        if (! $this->opts['active_skills'] || empty($u['actives']) || $u['acted']) {
            return null;
        }
        foreach ($u['actives'] as $d) {
            $kind = self::ACTIVE_TEMPLATES[$d['template']] ?? null;
            if (! in_array($kind, ['buff', 'heal', 'stance'], true) || ! $this->activeUsable($state, $u, $d)) {
                continue;
            }
            $base = ['type' => 'use_skill', 'unit_id' => $u['id'], 'skill' => $d['code']];
            if ($kind === 'stance') {   // 반격태세: 교전 임박 + 반경 내 아군 2명 이상(본인 포함) + 같은 효과가 남아 있지 않을 때
                $near = 99;
                foreach ($state['units'] as $o) {
                    if ($o['side'] !== $u['side']) {
                        $near = min($near, self::dist($u['x'], $u['y'], $o['x'], $o['y']));
                    }
                }
                if ($near > $u['move'] + $this->rules->unitType($u['type'])['range_max'] + 2) {
                    continue;
                }
                $need = (int) $this->ap($d, 'counter_pct', 50);
                $recv = $this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], (int) $this->ap($d, 'radius', 2));
                if (count($recv) >= 2 && array_filter($recv, fn ($id) => $this->buffAmount($state['units'][$id], 'counter') < $need) !== []) {
                    return $base;
                }

                continue;
            }
            if ($kind === 'heal') {
                $best = null;
                foreach ($this->healCandidates($state, $u, $d) as $id) {
                    $a = $state['units'][$id];
                    $k = [$a['hp'] / max(1, $a['max_hp']), $id];
                    if ($best === null || $k < $best[0]) {
                        $best = [$k, $a];
                    }
                }
                $a = $best[1];
                $est = max((int) $this->ap($d, 'heal_flat', 14), (int) ceil($a['max_hp'] * (int) $this->ap($d, 'heal_pct', 20) / 100));
                if ($a['max_hp'] - $a['hp'] >= (float) config('game.bot_skill.heal_ratio', 0.5) * $est) {   // 노브 heal_ratio(구 0.7)
                    return $base + ['target_id' => $a['id']];
                }

                continue;
            }
            $stat = (string) $this->ap($d, 'stat', 'atk');
            $near = 99;
            foreach ($state['units'] as $o) {
                if ($o['side'] !== $u['side']) {
                    $near = min($near, self::dist($u['x'], $u['y'], $o['x'], $o['y']));
                }
            }
            if ($near > $u['move'] + $this->rules->unitType($u['type'])['range_max'] + 2) {
                continue;   // 교전 임박 아님
            }
            $need = (int) $this->ap($d, 'amount', 1);
            if ($this->ap($d, 'target_mode', 'self_area') === 'ally') {
                $best = null;
                foreach ($this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], (int) $this->ap($d, 'cast_range', 2)) as $id) {
                    $a = $state['units'][$id];
                    if ($this->buffAmount($a, $stat) >= $need) {
                        continue;
                    }
                    $foe = PHP_INT_MAX;
                    foreach ($state['units'] as $o) {
                        $o['side'] !== $u['side'] && $foe = min($foe, self::dist($a['x'], $a['y'], $o['x'], $o['y']));
                    }
                    $k = [$foe, $id];
                    if ($best === null || $k < $best[0]) {
                        $best = [$k, $id];
                    }
                }
                if ($best !== null) {
                    return $base + ['target_id' => $best[1]];
                }

                continue;
            }
            $recv = $this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], (int) $this->ap($d, 'radius', 2));
            $fresh = array_filter($recv, fn ($id) => $this->buffAmount($state['units'][$id], $stat) < $need);
            if (count($recv) >= (int) config('game.bot_skill.buff_min_allies', 2) && $fresh !== []) {   // 노브 buff_min_allies(구 3)
                return $base;
            }
        }

        return null;
    }

    /** 봇 공용: surge 사용 판단. 일반 이동으로는 닿지 못하지만 (이동력+move_bonus)로 닿는 적이 있을 때만 use_skill action 반환(이후 일반 move/attack은 봇이 이어서 계획) */
    public function surgeAction(array $state, array $u): ?array
    {
        if (! $this->opts['active_skills'] || empty($u['actives']) || $u['acted'] || $u['moved']) {
            return null;
        }
        foreach ($u['actives'] as $d) {
            if ((self::ACTIVE_TEMPLATES[$d['template']] ?? null) !== 'surge' || ! $this->activeUsable($state, $u, $d)) {
                continue;
            }
            if ($this->canReachAttack($state, $u)) {
                return null;   // 일반 이동으로도 공격 가능 -> 횟수 낭비 금지
            }
            $sim = $state;
            $sim['units'][$u['id']]['skill_move_bonus'] = (int) $this->ap($d, 'move_bonus', 2);
            if ($this->canReachAttack($sim, $sim['units'][$u['id']])) {
                return ['type' => 'use_skill', 'unit_id' => $u['id'], 'skill' => $d['code']];
            }
        }

        return null;
    }

    /** 현재 이동력으로 닿는 칸 중 한 곳이라도 공격 가능한 적이 있는가 */
    private function canReachAttack(array $state, array $u): bool
    {
        foreach ($this->reachable($state, $u['id']) as $key => $_) {
            [$x, $y] = array_map('intval', explode(',', $key));
            if ($this->targetsFrom($state, $u, $x, $y) !== []) {
                return true;
            }
        }

        return false;
    }

    /**
     * 뷰용 액티브 목록: [{code,name,type,template,kind,target_kind,params,power_pct,cooldown,cooldown_left,uses,uses_left,range,usable,targets}]
     * kind=strike|aoe|buff|heal|surge, target_kind=enemy|ally|self|none, params=서버 검증된 정의(FE 표시용, 요청에 쓰지 않음).
     * range=영웅 병종 사거리[min,max](enemy 대상 스킬은 일반 공격과 같은 사거리).
     * targets=지금 위치에서 고를 수 있는 대상 id 미리보기(사용 불가면 빈 배열): enemy=사거리 내 적, ally(heal)=시전 거리 내 부상 아군, ally(buff)=시전 거리 내 아군(자신 포함),
     * self(buff self_area)=효과를 받을 아군(본인 포함), none(surge)=빈 배열.
     */
    public function activeSkillView(array $state, array $u): array
    {
        if (! $this->opts['active_skills'] || empty($u['actives'])) {
            return [];
        }
        $t = $this->rules->unitType($u['type']);
        $mpOn = self::mpOn($state);
        $out = [];
        foreach ($u['actives'] as $d) {
            $st = $u['skill_state'][$d['code']] ?? ['cd' => 0, 'uses_left' => (int) $d['uses']];
            $kind = self::ACTIVE_TEMPLATES[$d['template']] ?? null;
            $tk = $kind === null ? 'none' : $this->activeTargetKind($d);
            $usable = $this->activeUsable($state, $u, $d);
            $targets = [];
            if ($usable) {
                $targets = match (true) {
                    $tk === 'enemy' => $this->targetsFrom($state, $u, $u['x'], $u['y']),
                    $kind === 'heal' => $this->healCandidates($state, $u, $d),
                    $tk === 'ally' => $this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], (int) $this->ap($d, 'cast_range', 2)),
                    $tk === 'self' => $this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], (int) $this->ap($d, 'radius', 2)),
                    default => [],
                };
            }
            $out[] = [
                'code' => $d['code'], 'name' => $d['name'], 'type' => 'active', 'template' => $d['template'], 'kind' => $kind, 'target_kind' => $tk,
                'params' => (object) ($d['params'] ?? []), 'power_pct' => (int) $d['power_pct'],
                'cooldown' => $mpOn ? 0 : (int) $d['cooldown'], 'cooldown_left' => $mpOn ? 0 : (int) $st['cd'],
                'uses' => $mpOn ? null : (int) $d['uses'], 'uses_left' => $mpOn ? null : (int) $st['uses_left'],
                'mp_cost' => $this->mpCost($d), 'mp_left' => $mpOn ? (int) ($u['mp'] ?? 0) : null,   // mp_left: 시전 유닛 현재 MP(레거시 null). 상대 유닛은 뷰 계층에서 제거
                'range' => [$t['range_min'], $t['range_max']], 'usable' => $usable, 'targets' => $targets,
            ];
        }

        return $out;
    }

    /** 대상 검증: enemy = 적 + 일반 공격 사거리, ally = 같은 진영(자신 포함) + 시전 거리. 실패 시 상태는 건드리지 않고 IllegalAction */
    private function skillTarget(array $state, array $u, array $a, string $kind, int $castRange = 0): array
    {
        $tid = $a['target_id'] ?? null;
        if (! is_string($tid) || ! isset($state['units'][$tid])) {
            throw new IllegalAction('invalid_target', '대상을 찾을 수 없습니다.', 404);
        }
        $t = $state['units'][$tid];
        if ($kind === 'enemy') {
            if ($t['side'] === $u['side']) {
                throw new IllegalAction('invalid_target', '아군은 공격할 수 없습니다.');
            }
            if (! in_array($tid, $this->targetsFrom($state, $u, $u['x'], $u['y']), true)) {
                throw new IllegalAction('out_of_range', '사거리 밖입니다.');
            }
        } else {
            if ($t['side'] !== $u['side']) {
                throw new IllegalAction('invalid_target', '아군만 대상으로 지정할 수 있습니다.');
            }
            if (self::dist($u['x'], $u['y'], $t['x'], $t['y']) > $castRange) {
                throw new IllegalAction('out_of_range', '시전 거리 밖입니다.');
            }
        }

        return $t;
    }

    /** 쿨다운 시작 + 잔여 횟수 차감(모든 검증을 통과한 뒤에만 호출). 남은 횟수 반환 */
    private function spendSkill(array &$state, array $u, array $d, array $st, array &$events): ?int
    {
        if (self::mpOn($state)) {   // MP 방식: MP 차감 + 이번 턴 스킬 사용 표시(mp_change reason=skill 이 skill_use보다 먼저 발행). 쿨다운/횟수 미사용
            $this->mpChange($state, $events, $u['id'], -$this->mpCost($d), 'skill');
            $state['units'][$u['id']]['turn_skill_used'] = true;

            return null;
        }
        $left = (int) $st['uses_left'] - 1;
        $state['units'][$u['id']]['skill_state'][$d['code']] = ['cd' => (int) $d['cooldown'], 'uses_left' => $left];

        return $left;
    }

    /** skill_use 이벤트 공통 필드(+ 템플릿별 추가 필드). 기존 키(skill,name,template,target_unit_id,power_pct,cooldown_left,uses_left)는 유지, kind/targets 추가 */
    private function skillUseFields(array $u, array $d, string $kind, ?int $usesLeft, array $extra): array
    {
        $mp = $usesLeft === null && isset($u['mp_max']);   // spendSkill이 null을 돌려주면 MP 방식
        $cost = $this->mpCost($d);
        $left = max(0, (int) ($u['mp'] ?? 0) - $cost);

        $el = in_array($kind, ['strike', 'aoe', 'pierce'], true) ? $this->skillElement($d) : null;

        return ($el !== null ? ['element' => $el] : []) + SkillFx::fields($kind, $el) + $extra + ['actor_unit_id' => $u['id'], 'skill' => $d['code'], 'name' => $d['name'], 'template' => $d['template'], 'kind' => $kind,
            'cooldown_left' => $mp ? 0 : (int) $d['cooldown'], 'uses_left' => $usesLeft, 'mp_cost' => $cost]
            + ($mp ? ['mp_left' => $left, 'mp_pct' => (int) round($left * 100 / max(1, (int) $u['mp_max'])), 'side' => $u['side']] : []);
    }

    /**
     * use_skill {unit_id, skill, target_id?}. 공통 검증: 옵션 on, 영웅 유닛 보유, 템플릿 지원, 쿨다운 0, 잔여 횟수. 이후 템플릿별 검증을 모두 통과한 뒤에만 쿨다운/횟수를 차감한다.
     * strike/aoe/heal = 영웅 행동 소모, buff = 소모(stat=move는 미소모), surge = 미소모(사용 -> 일반 move -> 일반 attack).
     * 이벤트: skill_use(kind) 뒤에 attack/counter/kill(strike·aoe) | buff_apply(buff) | heal(heal, via_skill).
     */
    private function doUseSkill(array &$state, array $u, array $a, array &$events): void
    {
        if (! $this->opts['active_skills']) {
            throw new IllegalAction('skill_disabled', '액티브 스킬을 사용할 수 없습니다.', 422);
        }
        $code = $a['skill'] ?? null;
        $d = is_string($code) ? $this->activeDef($u, $code) : null;
        if ($d === null) {
            throw new IllegalAction('skill_not_found', '보유하지 않은 스킬입니다.', 404);
        }
        $kind = self::ACTIVE_TEMPLATES[$d['template']] ?? null;
        if ($kind === null) {
            throw new IllegalAction('skill_unsupported', '지원하지 않는 스킬입니다.', 422);
        }
        $st = $u['skill_state'][$code] ?? ['cd' => 0, 'uses_left' => (int) $d['uses']];
        if (self::mpOn($state)) {   // MP 방식: 쿨다운/횟수 없음. 영웅 1턴 스킬 1회(surge·move 버프 포함) + MP 검증(차감은 템플릿 검증 통과 후 spendSkill에서만)
            if (! isset($u['mp_max'])) {
                throw new IllegalAction('skill_not_found', '보유하지 않은 스킬입니다.', 404);
            }
            if ($u['turn_skill_used'] ?? false) {
                throw new IllegalAction('skill_turn_locked', '이번 턴에 이미 스킬을 사용했습니다.', 409);
            }
            if ((int) $u['mp'] < $this->mpCost($d)) {
                throw new IllegalAction('insufficient_mp', "MP가 부족합니다({$u['mp']}/{$this->mpCost($d)}).", 409);
            }
        } else {
            if ((int) $st['cd'] > 0) {
                throw new IllegalAction('skill_cooldown', "쿨다운 중입니다({$st['cd']}).", 409);
            }
            if ((int) $st['uses_left'] <= 0) {
                throw new IllegalAction('skill_no_uses', '사용 횟수를 모두 소진했습니다.', 409);
            }
        }
        match ($kind) {
            'strike' => $this->useStrike($state, $u, $a, $d, $st, $events),
            'aoe' => $this->useAoe($state, $u, $a, $d, $st, $events),
            'buff' => $this->useBuff($state, $u, $a, $d, $st, $events),
            'heal' => $this->useHeal($state, $u, $a, $d, $st, $events),
            'surge' => $this->useSurge($state, $u, $d, $st, $events),
            'pierce' => $this->usePierce($state, $u, $a, $d, $st, $events),
            'stance' => $this->useStance($state, $u, $d, $st, $events),
        };
    }

    /**
     * use_item {unit_id, item, target_id?}: 전투 소모품(스테이지 전투 state.items.left 가 있을 때만). 영웅/지휘관 유닛이 아직 행동하지 않았을 때 자신 또는 인접(거리 1) 아군에게 사용,
     * 영웅 행동 1회 소모(acted/moved=true), 전투당 총 state.items.left 회. 보유 수량 확인·차감은 BattleService 가 한다. 이벤트: item_use + (heal | buff_apply).
     */
    private function doUseItem(array &$state, array $u, array $a, array &$events): void
    {
        if (! isset($state['items']['left']) || $u['side'] !== 'a') {
            throw new IllegalAction('items_disabled', '이 전투에서는 소모품을 사용할 수 없습니다.', 422);
        }
        if ((int) $state['items']['left'] <= 0) {
            throw new IllegalAction('item_limit', '이 전투의 소모품 사용 횟수를 모두 소진했습니다.', 409);
        }
        if (! in_array($u['kind'], ['commander', 'hero'], true)) {
            throw new IllegalAction('not_hero', '영웅만 소모품을 사용할 수 있습니다.', 422);
        }
        if ($u['acted']) {
            throw new IllegalAction('already_acted', '이미 행동을 마친 유닛입니다.');
        }
        $code = $a['item'] ?? null;
        $d = is_string($code) ? \App\Game\BattleItems::get($code) : null;
        if ($d === null) {
            throw new IllegalAction('item_not_found', '알 수 없는 소모품입니다.', 404);
        }
        $tid = $a['target_id'] ?? $u['id'];
        $t = is_string($tid) ? ($state['units'][$tid] ?? null) : null;
        if ($t === null || $t['side'] !== $u['side']) {
            throw new IllegalAction('invalid_target', '아군만 대상으로 지정할 수 있습니다.', 404);
        }
        if (self::dist($u['x'], $u['y'], $t['x'], $t['y']) > 1) {
            throw new IllegalAction('out_of_range', '자신 또는 인접한 아군에게만 사용할 수 있습니다.');
        }
        if ($d['kind'] === 'heal' && $t['hp'] >= $t['max_hp']) {
            throw new IllegalAction('item_no_effect', '이미 체력이 가득 찬 대상입니다.', 422);
        }
        $cap = (int) ($d['per_battle_uses'] ?? 0);
        if ($cap > 0 && (int) ($state['items']['used'][$d['code']] ?? 0) >= $cap) {   // 소모품별 전투당 상한
            throw new IllegalAction('item_limit', '이 소모품의 전투당 사용 횟수를 모두 소진했습니다.', 409);
        }
        $state['items']['used'][$d['code']] = (int) ($state['items']['used'][$d['code']] ?? 0) + 1;
        $state['items']['left'] = (int) $state['items']['left'] - 1;
        $state['units'][$u['id']]['acted'] = true;
        $state['units'][$u['id']]['moved'] = true;
        self::emit($state, $events, 'item_use', ['actor_unit_id' => $u['id'], 'target_unit_id' => $t['id'], 'item' => $d['code'], 'name' => $d['name_ko'], 'kind' => $d['kind'], 'items_left' => $state['items']['left']]);
        if ($d['kind'] === 'heal') {
            $amt = isset($d['heal_flat']) ? (int) $d['heal_flat'] : (int) ceil($t['max_hp'] * (int) ($d['heal_pct'] ?? 0) / 100);
            $n = min($t['max_hp'] - $t['hp'], max(1, $amt));
            $cur = $t['hp'];
            $state['units'][$t['id']]['hp'] = $cur + $n;
            self::emit($state, $events, 'heal', ['actor_unit_id' => $u['id'], 'target_unit_id' => $t['id'], 'hp_before' => $cur, 'hp_after' => $cur + $n, 'via_item' => $d['code']]);
        } else {
            $this->applyBuffs($state, $events, $u['id'], [$t['id']], (string) $d['stat'], (int) $d['amount'], max(1, (int) $d['duration']));
        }
    }

    private function useStrike(array &$state, array $u, array $a, array $d, array $st, array &$events): void
    {
        $t = $this->skillTarget($state, $u, $a, 'enemy');
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'strike', $left, [
            'target_unit_id' => $t['id'], 'targets' => [$t['id']], 'power_pct' => (int) $d['power_pct'],
        ]));
        $this->doAttack($state, $state['units'][$u['id']], ['target_id' => $t['id']], $events, max(0.1, (float) $d['power_pct'] / 100), $d['code'], 0.0, $this->skillElement($d));
    }

    /** AOE: 대상 유닛 중심(v1은 타일 지정 없음). 주 대상 = 일반 공격 경로(반격 규칙 동일), 인접 적 = 감쇠 피해 + 반격 없음 */
    private function useAoe(array &$state, array $u, array $a, array $d, array $st, array &$events): void
    {
        $t = $this->skillTarget($state, $u, $a, 'enemy');
        $radius = (int) $this->ap($d, 'radius', 1);
        $splash = (int) $this->ap($d, 'splash_pct', 60);
        $ff = (bool) $this->ap($d, 'friendly_fire', false);
        $victims = [];
        foreach ($state['units'] as $o) {
            if ($o['id'] !== $t['id'] && $o['id'] !== $u['id'] && ($ff || $o['side'] !== $u['side']) && self::dist($t['x'], $t['y'], $o['x'], $o['y']) <= $radius) {
                $victims[] = $o['id'];
            }
        }
        sort($victims, SORT_STRING);
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        $power = max(0.1, (float) $d['power_pct'] / 100);
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'aoe', $left, [
            'target_unit_id' => $t['id'], 'targets' => array_merge([$t['id']], $victims), 'center' => [$t['x'], $t['y']], 'radius' => $radius,
            'power_pct' => (int) $d['power_pct'], 'splash_pct' => $splash, 'friendly_fire' => $ff,
        ]));
        $this->doAttack($state, $state['units'][$u['id']], ['target_id' => $t['id']], $events, $power, $d['code'], 0.0, $this->skillElement($d));
        foreach ($victims as $vid) {
            if (($state['status'] ?? 'active') !== 'active' || ! isset($state['units'][$u['id']])) {
                break;   // 전투 종료 또는 시전자가 주 대상 반격으로 사망: 남은 splash 취소
            }
            if (! isset($state['units'][$vid])) {
                continue;   // 앞선 처치/붕괴로 이미 제거
            }
            $att = $state['units'][$u['id']];
            $v = $state['units'][$vid];
            $info = $this->damageInfo($state, $att, $att['x'], $att['y'], $v, true, 0.0, $this->skillElement($d));   // 정면 취급(방향 보정 없음)
            $info['dmg'] = max(1, (int) round($info['dmg'] * $power * $splash / 100));
            $state['units'][$vid]['hp'] = max(0, $v['hp'] - $info['dmg']);
            self::emit($state, $events, 'attack', $this->hitFields($u['id'], $vid, $info, $v['hp'], $state['units'][$vid]['hp'], $att['facing'] ?? null) + ['via_skill' => $d['code'], 'splash' => true]);
            $this->resolveDeath($state, $vid, $u['id'], $events);
        }
    }

    /** BUFF: stat(atk|def|move) 택일. self_area = 시전자 중심 반경 내 아군 전원(본인 포함), ally = 지정 아군 중심. 같은 stat은 max 갱신(합산 금지) */
    private function useBuff(array &$state, array $u, array $a, array $d, array $st, array &$events): void
    {
        $stat = (string) $this->ap($d, 'stat', '');
        if (! in_array($stat, ['atk', 'def', 'move'], true)) {
            throw new IllegalAction('skill_unsupported', '지원하지 않는 스킬입니다.', 422);
        }
        $amount = (int) $this->ap($d, 'amount', 1);
        $duration = max(1, (int) $this->ap($d, 'duration', 1));
        $mode = $this->ap($d, 'target_mode', 'self_area') === 'ally' ? 'ally' : 'self_area';
        $radius = (int) $this->ap($d, 'radius', $mode === 'ally' ? 0 : 2);
        $t = null;
        if ($mode === 'ally') {
            $t = $this->skillTarget($state, $u, $a, 'ally', (int) $this->ap($d, 'cast_range', 2));
            $cx = $t['x'];
            $cy = $t['y'];
        } else {
            $cx = $u['x'];
            $cy = $u['y'];
        }
        $recv = $this->allyIdsWithin($state, $u['side'], $cx, $cy, $radius);
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        if ($stat !== 'move') {   // stat=move는 이동 전에 써야 의미가 있으므로 영웅 행동을 소모하지 않는다(팀장 확정)
            $state['units'][$u['id']]['acted'] = true;
            $state['units'][$u['id']]['moved'] = true;
        }
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'buff', $left, [
            'target_unit_id' => $t['id'] ?? null, 'targets' => $recv, 'center' => [$cx, $cy], 'radius' => $radius,
            'stat' => $stat, 'amount' => $amount, 'duration' => $duration, 'target_mode' => $mode,
        ]));
        $this->applyBuffs($state, $events, $u['id'], $recv, $stat, $amount, $duration);
    }

    /** 수신 유닛들에 stat 버프를 건다(같은 stat은 max 갱신, 합산 금지). buff_apply 이벤트 발행. useBuff/useStance 공용 */
    private function applyBuffs(array &$state, array &$events, string $actorId, array $recv, string $stat, int $amount, int $duration): void
    {
        foreach ($recv as $id) {
            $buffs = $state['units'][$id]['buffs'] ?? [];
            $found = null;
            foreach ($buffs as $i => $b) {
                if ($b['stat'] === $stat) {
                    $buffs[$i]['amount'] = max((int) $b['amount'], $amount);
                    $buffs[$i]['left'] = max((int) $b['left'], $duration);
                    $found = $buffs[$i];
                }
            }
            if ($found === null) {
                $found = ['stat' => $stat, 'amount' => $amount, 'left' => $duration];
                $buffs[] = $found;
            }
            $state['units'][$id]['buffs'] = $buffs;
            self::emit($state, $events, 'buff_apply', ['actor_unit_id' => $actorId, 'target_unit_id' => $id, 'stat' => $found['stat'], 'amount' => $found['amount'], 'left' => $found['left']]);
        }
    }

    /** PIERCE(결전 돌파 등): 강타와 같은 경로(행동 소모, 반격 규칙 동일)로 대상 기본 방어의 def_ignore_pct%를 무시한다(지형·오라 방어 보정은 유지) */
    private function usePierce(array &$state, array $u, array $a, array $d, array $st, array &$events): void
    {
        $t = $this->skillTarget($state, $u, $a, 'enemy');
        $ign = (int) $this->ap($d, 'def_ignore_pct', 30);
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'pierce', $left, [
            'target_unit_id' => $t['id'], 'targets' => [$t['id']], 'power_pct' => (int) $d['power_pct'], 'def_ignore_pct' => $ign,
        ]));
        $this->doAttack($state, $state['units'][$u['id']], ['target_id' => $t['id']], $events, max(0.1, (float) $d['power_pct'] / 100), $d['code'], (float) $ign, $this->skillElement($d));
    }

    /** STANCE(반격태세): 시전자 중심 반경 내 아군(본인 포함) 전원에 duration 라운드 동안 반격 피해 +counter_pct%·반격 시 상성 불리 1.0 취급(buff stat=counter). 영웅 행동 소모 */
    private function useStance(array &$state, array $u, array $d, array $st, array &$events): void
    {
        $amount = (int) $this->ap($d, 'counter_pct', 50);
        $duration = max(1, (int) $this->ap($d, 'duration', 1));
        $radius = (int) $this->ap($d, 'radius', 2);
        $recv = $this->allyIdsWithin($state, $u['side'], $u['x'], $u['y'], $radius);
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        $state['units'][$u['id']]['acted'] = true;
        $state['units'][$u['id']]['moved'] = true;
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'stance', $left, [
            'target_unit_id' => null, 'targets' => $recv, 'center' => [$u['x'], $u['y']], 'radius' => $radius,
            'stat' => 'counter', 'amount' => $amount, 'duration' => $duration, 'target_mode' => 'self_area',
        ]));
        $this->applyBuffs($state, $events, $u['id'], $recv, 'counter', $amount, $duration);
    }

    /** HEAL: 치유량 = min(결손, max(heal_flat, ceil(max_hp x heal_pct%))). heal_cap(패시브 치유 진영 합 상한)과 분리. radius=1이면 주 대상 인접 아군에게 area_pct 감쇠 치유 */
    private function useHeal(array &$state, array $u, array $a, array $d, array $st, array &$events): void
    {
        $t = $this->skillTarget($state, $u, $a, 'ally', (int) $this->ap($d, 'cast_range', 2));
        if ($t['hp'] >= $t['max_hp']) {
            throw new IllegalAction('skill_no_effect', '이미 체력이 가득 찬 대상입니다.', 422);
        }
        $flat = (int) $this->ap($d, 'heal_flat', 14);
        $pct = (int) $this->ap($d, 'heal_pct', 20);
        $base = fn (array $x) => max($flat, (int) ceil($x['max_hp'] * $pct / 100));
        $plan = [$t['id'] => min($t['max_hp'] - $t['hp'], $base($t))];
        $radius = (int) $this->ap($d, 'radius', 0);
        if ($radius >= 1) {
            $area = (int) $this->ap($d, 'area_pct', 50);
            foreach ($this->allyIdsWithin($state, $u['side'], $t['x'], $t['y'], $radius) as $id) {
                $b = $state['units'][$id];
                if ($id !== $t['id'] && $b['hp'] < $b['max_hp']) {
                    $plan[$id] = min($b['max_hp'] - $b['hp'], (int) round($base($b) * $area / 100));
                }
            }
        }
        $plan = array_filter($plan, fn ($n) => $n > 0);
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        $state['units'][$u['id']]['acted'] = true;
        $state['units'][$u['id']]['moved'] = true;
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'heal', $left, [
            'target_unit_id' => $t['id'], 'targets' => array_map('strval', array_keys($plan)), 'heal_flat' => $flat, 'heal_pct' => $pct, 'radius' => $radius,
        ]));
        foreach ($plan as $id => $n) {
            $cur = $state['units'][$id]['hp'];
            $state['units'][$id]['hp'] = $cur + $n;
            self::emit($state, $events, 'heal', ['actor_unit_id' => $u['id'], 'target_unit_id' => (string) $id, 'hp_before' => $cur, 'hp_after' => $cur + $n, 'via_skill' => $d['code']]);
        }
    }

    /** SURGE: 이번 턴 이동력 +move_bonus(영웅 행동 미소모), attack_pct>100이면 그 턴 첫 일반 공격 배율. 사용 -> 일반 move -> 일반 attack */
    private function useSurge(array &$state, array $u, array $d, array $st, array &$events): void
    {
        if ($u['moved']) {
            throw new IllegalAction('already_moved', '이미 이동했습니다. 이동 전에 사용해야 합니다.');
        }
        $min = (int) $this->ap($d, 'min_turn', 2);
        if ((int) ($state['turn'] ?? 1) < $min) {
            throw new IllegalAction('skill_turn_locked', "{$min}턴부터 사용할 수 있습니다.", 409);
        }
        $bonus = (int) $this->ap($d, 'move_bonus', 2);
        $atkPct = (int) $this->ap($d, 'attack_pct', 100);
        $left = $this->spendSkill($state, $u, $d, $st, $events);
        $state['units'][$u['id']]['skill_move_bonus'] = $bonus;
        if ($atkPct > 100) {
            $state['units'][$u['id']]['skill_attack_pct'] = $atkPct;
        }
        self::emit($state, $events, 'skill_use', $this->skillUseFields($u, $d, 'surge', $left, [
            'targets' => [$u['id']], 'move_bonus' => $bonus, 'attack_pct' => $atkPct,
        ]));
    }

    /** attack/counter 공통 이벤트 필드 */
    private function hitFields(string $actor, string $target, array $info, int $hpBefore, int $hpAfter, ?string $facing = null): array
    {
        // 표시용 가산 필드: 기본값(snow_bonus 0, dmg_mult 1.0)이면 기존 이벤트와 동일(키 없음=0/1.0, FE 하위 호환)
        $extra = [];
        if (isset($info['element'])) {   // 속성 스킬 피해: element + element_pct(내성 반영 증감 %, +30=약점, -30=내성). 속성 없으면 키 생략
            $extra['element'] = $info['element'];
            $extra['element_pct'] = (int) $info['element_pct'];
        }
        if (($info['snow_bonus'] ?? 0) > 0) {
            $extra['snow_bonus'] = $info['snow_bonus'];
        }
        if (($info['dmg_mult'] ?? 1.0) != 1.0) {
            $extra['dmg_mult'] = $info['dmg_mult'];
        }
        if (($info['water_mult'] ?? 1.0) != 1.0) {   // 수상 규칙 배율(수병 수상 강화·육상 약화·배 탑승 약화). 1.0이면 키 생략 = 하위 호환
            $extra['water_mult'] = round((float) $info['water_mult'], 4);
        }
        if (! empty($info['skills_applied'])) {   // 발동한 조건부 스킬 코드(없으면 키 생략 = 하위 호환)
            $extra['skills_applied'] = array_values(array_unique($info['skills_applied']));
        }

        return $extra + [
            'actor_unit_id' => $actor, 'target_unit_id' => $target, 'dmg' => $info['dmg'], 'crit' => false,
            'affinity' => $info['affinity'], 'multiplier' => $info['multiplier'], 'terrain' => $info['terrain'],
            'terrain_def_pct' => $info['terrain_def_pct'], 'hp_before' => $hpBefore, 'hp_after' => $hpAfter, 'kill' => $hpAfter <= 0,
            'flank' => $info['flank'] ?? 'none', 'facing' => $facing,
            'elevation_mult' => $info['elevation_mult'] ?? 1.0, 'cover_mult' => $info['cover_mult'] ?? 1.0, 'def_capped' => $info['def_capped'] ?? false,
        ];
    }

    private function endTurn(array &$state, array &$events, bool $follow = false): void
    {
        $side = $state['side'];
        if ($follow && $this->autoFollowTroops($state, $side, $events)) {
            return;   // 자동 이동 중 capture 즉시 승리로 전투 종료
        }
        $this->healSide($state, $events, $side);
        $next = $side === 'a' ? 'b' : 'a';
        if ($side === 'b') {
            if ($this->objectiveRoundEnd($state, $events)) {   // capture 점유형/적 점유 패배 판정(턴 상한보다 우선)
                return;
            }
            if ($this->surviveWon($state) && StageRules::gate($state)) {   // survive_turns: 라운드 N 종료 시 플레이어 지휘관 생존 -> 승리(max_turns 판정보다 우선)
                $this->finish($state, 'a', 'survive_turns', $events);

                return;
            }
            if ($state['turn'] >= $state['max_turns']) {
                $this->finishByHp($state, $events);

                return;
            }
            $state['turn']++;
            $this->runTriggers($state, $events);   // 라운드 시작 증원(stage.triggers spawn)
        }
        $state['side'] = $next;
        foreach ($state['units'] as $id => $_) {
            $state['units'][$id]['moved'] = false;
            $state['units'][$id]['acted'] = false;
            unset($state['units'][$id]['skill_move_bonus'], $state['units'][$id]['skill_attack_pct'], $state['units'][$id]['turn_skill_used']);   // surge 효과는 그 턴 한정
        }
        $this->tickResources($state, $next, $events);
        self::emit($state, $events, 'turn_start', ['turn' => $state['turn'], 'side' => $next]);
    }

    /**
     * 턴 종료 시 소속 일반병 자동 영웅 추종(end_turn follow=true 일 때만). 미행동(moved=false && acted=false) 병사를 영웅 오라 반경(없으면 2) 안으로 이동.
     * 치유사·npc_ally·영웅 사망/부재 병사 제외. 공격 없음, move_from 미기록(돌격 판정 불변), first_move_limit 슬롯 미소모, first_turn_move_cap은 moveBudget 으로 동일 적용.
     *
     * @return bool 이동 중 전투가 종료되었으면 true(capture 도달형 즉시 승리)
     */
    private function autoFollowTroops(array &$state, string $side, array &$events): bool
    {
        $blockedFor = function (string $id, string $heroId) use (&$state): array {
            $b = [];
            foreach ($state['units'] as $o) {
                if ($o['id'] !== $id && $o['id'] !== $heroId) {
                    $b["{$o['x']},{$o['y']}"] = true;
                }
            }

            return $b;
        };
        $todo = [];
        foreach ($state['units'] as $id => $u) {
            if ($u['side'] !== $side || ($u['kind'] ?? null) !== 'troop' || $u['hp'] <= 0 || $u['moved'] || $u['acted'] || ! empty($u['npc_ally'])
                || $this->rules->unitType($u['type'])['heal'] > 0) {
                continue;
            }
            $h = $state['units'][$u['leader_id'] ?? ''] ?? null;
            if ($h === null || $h['hp'] <= 0 || $h['side'] !== $side) {
                continue;
            }
            $cost = $this->costToReach($state, $this->rules->unitType($u['type'])['move_type'], [[$h['x'], $h['y']]], $blockedFor($id, $h['id']));
            $todo[$id] = $cost["{$u['x']},{$u['y']}"] ?? 1000000;
        }
        arsort($todo);   // 영웅에서 먼 병사부터
        foreach (array_keys($todo) as $id) {
            $u = $state['units'][$id];
            $h = $state['units'][$u['leader_id']];   // 영웅의 최종 위치
            $radius = (int) ($h['aura']['radius'] ?? 2);
            if (self::dist($u['x'], $u['y'], $h['x'], $h['y']) <= $radius) {
                continue;
            }
            $moveType = $this->rules->unitType($u['type'])['move_type'];
            $toHero = $this->costToReach($state, $moveType, [[$h['x'], $h['y']]], $blockedFor($id, $h['id']));
            $best = null;
            foreach ($this->reachable($state, $id) as $key => $moveCost) {
                if ($key === "{$u['x']},{$u['y']}") {
                    continue;
                }
                [$x, $y] = array_map('intval', explode(',', $key));
                $d = self::dist($x, $y, $h['x'], $h['y']);
                $rank = $d <= $radius ? [0, $d, $moveCost, $x, $y] : [1, $toHero[$key] ?? 1000000, $moveCost, $x, $y];
                if ($best === null || $rank < $best) {
                    $best = $rank;
                }
            }
            if ($best === null || ($best[0] === 1 && $best[1] >= ($toHero["{$u['x']},{$u['y']}"] ?? 1000000))) {
                continue;   // 갈 곳이 없거나 가까워지지 않으면 제자리
            }
            [$x, $y] = [$best[3], $best[4]];
            $terrain = $this->terrainAt($state, $x, $y);
            $newFacing = self::facingOn($state) ? (self::axisDir($x - $u['x'], $y - $u['y']) ?? ($u['facing'] ?? null)) : ($u['facing'] ?? null);
            self::emit($state, $events, 'move', [
                'actor_unit_id' => $id, 'from' => [$u['x'], $u['y']], 'to' => [$x, $y], 'terrain' => $terrain, 'facing' => $newFacing,
                'terrain_def_pct' => $this->rules->terrainMod($terrain, $moveType)['def_pct'],
            ]);
            $state['units'][$id]['x'] = $x;
            $state['units'][$id]['y'] = $y;
            $state['units'][$id]['moved'] = true;
            $state['units'][$id]['facing'] = $newFacing;
            $this->objectiveOnMove($state, $events);
            if (($state['status'] ?? 'active') !== 'active') {
                return true;
            }
        }

        return false;
    }

    /** 치유사 회복 + 마을 회복(해당 진영 기준, heal_cap은 호출당 진영 합산). end_turn과 교대 행동 라운드 종료가 공유한다. */
    private function healSide(array &$state, array &$events, string $side): void
    {
        // T_REGEN: 자기 진영 턴 종료 시 영웅 본인이 최대 HP의 N% 회복(heal_cap 과 별개, 치유사 회복보다 먼저)
        if ($this->opts['passive_skills']) {
            foreach ($state['units'] as $id => $r) {
                $pct = (int) ($r['passive']['regen_hp'] ?? 0);
                if ($r['side'] !== $side || $pct <= 0 || $r['hp'] <= 0 || $r['hp'] >= $r['max_hp']) {
                    continue;
                }
                $amount = min(max(1, (int) ceil($r['max_hp'] * $pct / 100)), $r['max_hp'] - $r['hp']);
                $state['units'][$id]['hp'] = $r['hp'] + $amount;
                self::emit($state, $events, 'heal', ['actor_unit_id' => null, 'target_unit_id' => $id, 'hp_before' => $r['hp'], 'hp_after' => $r['hp'] + $amount]);
            }
        }
        // 치유사: 턴 종료 시 인접 아군 회복
        $healed = 0;
        foreach ($state['units'] as $h) {
            $heal = $this->rules->unitType($h['type'])['heal'];
            if ($h['side'] !== $side || $heal <= 0) {
                continue;
            }
            if ($this->opts['passive_skills']) {
                $heal += $h['passive']['heal'] ?? 0;
            }
            foreach ($state['units'] as $id => $ally) {
                if ($ally['side'] === $side && $id !== $h['id'] && self::dist($h['x'], $h['y'], $ally['x'], $ally['y']) === 1 && $state['units'][$id]['hp'] < $ally['max_hp']) {
                    $cur = $state['units'][$id]['hp'];   // 다른 치유사에게 이미 회복됐을 수 있어 최신 hp 사용
                    $amount = $this->opts['heal_percent'] > 0 ? max($heal, (int) ceil($ally['max_hp'] * $this->opts['heal_percent'])) : $heal;
                    $amount = min($amount, $ally['max_hp'] - $cur);
                    if ($this->opts['heal_cap'] > 0) {
                        $amount = min($amount, $this->opts['heal_cap'] - $healed);
                    }
                    if ($amount <= 0) {
                        continue;
                    }
                    $healed += $amount;
                    $state['units'][$id]['hp'] = $cur + $amount;
                    self::emit($state, $events, 'heal', [
                        'actor_unit_id' => $h['id'], 'target_unit_id' => $id, 'hp_before' => $cur, 'hp_after' => $state['units'][$id]['hp'],
                    ]);
                }
            }
        }
        $vp = (float) $this->opt($state, 'village_heal_pct');
        if ($vp > 0) {   // 마을(heals 지형) 위 아군 회복: 최대 HP 비율, heal_cap과 합산 관리
            foreach ($state['units'] as $id => $v) {
                if ($v['side'] !== $side || $v['hp'] >= $v['max_hp'] || ! $this->rules->terrainAttr($this->terrainAt($state, $v['x'], $v['y']), 'heals')) {
                    continue;
                }
                $amount = min((int) ceil($v['max_hp'] * $vp), $v['max_hp'] - $v['hp']);
                if ($this->opts['heal_cap'] > 0) {
                    $amount = min($amount, $this->opts['heal_cap'] - $healed);
                }
                if ($amount <= 0) {
                    continue;
                }
                $healed += $amount;
                $cur = $v['hp'];
                $state['units'][$id]['hp'] = $cur + $amount;
                self::emit($state, $events, 'heal', ['actor_unit_id' => null, 'target_unit_id' => $id, 'hp_before' => $cur, 'hp_after' => $cur + $amount]);
            }
        }
    }

    // ------------------------------------------------------------------
    // 교대 행동(alternate activation): 활성화 단위 = 부대(squad on: 영웅+소속 유닛, off: 유닛 1기)
    // state.alternate(bool, 생성 시 고정), state.alt = {squads{a[],b[]}, active, done[], streak{side,count}, cap, rotate, activations}
    // ------------------------------------------------------------------

    public static function altOn(array $state): bool
    {
        return ! empty($state['alternate']);
    }

    /** 유닛이 속한 활성화 단위 키(squad on: 영웅 id(부대원은 leader_id), off 또는 소속 불명: 자기 id) */
    public function squadKey(array $state, array $u): string
    {
        if (self::squadOn($state)) {
            if ($u['kind'] !== 'troop') {
                return $u['id'];
            }
            $l = $u['leader_id'] ?? null;

            return ($l !== null && isset($state['units'][$l])) ? $l : $u['id'];
        }

        return $u['id'];
    }

    /** @return string[] 부대 키에 속한 생존 유닛 id */
    public function altMembers(array $state, string $key): array
    {
        $out = [];
        foreach ($state['units'] as $id => $u) {
            if ($this->squadKey($state, $u) === $key) {
                $out[] = $id;
            }
        }

        return $out;
    }

    private function altInit(array $state): array
    {
        $squads = ['a' => [], 'b' => []];
        foreach ($state['units'] as $u) {
            if (! empty($u['npc_ally'])) {   // 아군 NPC는 AI 자동 행동 대상: 활성화 부대·라운드 진행 조건에서 제외(진행을 막지 않음)
                continue;
            }
            $squads[$u['side']][$this->squadKey($state, $u)] = true;
        }

        return [
            'squads' => ['a' => array_keys($squads['a']), 'b' => array_keys($squads['b'])], 'active' => null, 'done' => [],
            'streak' => ['side' => null, 'count' => 0], 'cap' => max(1, (int) $this->opts['alt_consecutive_cap']),
            'rotate' => (bool) $this->opts['alt_first_rotate'], 'activations' => 0,
        ];
    }

    private function altStatus(array $state, array $alt, string $key): string
    {
        if (! $this->altMembers($state, $key)) {
            return 'gone';
        }

        return $alt['active'] === $key ? 'active' : (in_array($key, $alt['done'], true) ? 'done' : 'ready');
    }

    /** @return string[] 아직 활성화하지 않은 생존 부대 키 */
    public function altReadySquads(array $state, string $side): array
    {
        $alt = $state['alt'] ?? $this->altInit($state);

        return array_values(array_filter($alt['squads'][$side], fn ($k) => $this->altStatus($state, $alt, $k) === 'ready'));
    }

    /** 이번 라운드의 선공 진영 */
    private function altRoundFirst(array $state, array $alt): string
    {
        $first = $state['first_side'] ?? 'a';
        if ($alt['rotate'] && ($state['turn'] ?? 1) % 2 === 0) {
            return $first === 'a' ? 'b' : 'a';
        }

        return $first;
    }

    /** 클라이언트용 교대 행동 뷰(off면 null) */
    public function altView(array $state): ?array
    {
        if (! self::altOn($state)) {
            return null;
        }
        $alt = $state['alt'] ?? $this->altInit($state);
        $squads = [];
        foreach (['a', 'b'] as $s) {
            foreach ($alt['squads'][$s] as $k) {
                $squads[] = ['id' => $k, 'side' => $s, 'status' => $this->altStatus($state, $alt, $k), 'unit_ids' => $this->altMembers($state, $k)];
            }
        }

        return [
            'round' => (int) ($state['turn'] ?? 1), 'side' => $state['side'], 'active_squad' => $alt['active'],
            'round_first_side' => $this->altRoundFirst($state, $alt),
            'consecutive' => ['side' => $alt['streak']['side'], 'count' => $alt['streak']['count'], 'cap' => $alt['cap']],
            'squads' => $squads,
        ];
    }

    /** 암묵 활성화 허용 여부: 옵션 on + 활성 부대 없음 + 유닛의 부대가 이번 라운드 ready (조회 API 공용) */
    public function altImplicitOk(array $state, array $u): bool
    {
        if (! $this->opts['alt_implicit_activate'] || ! self::altOn($state)) {
            return false;
        }
        $alt = $state['alt'] ?? $this->altInit($state);

        return $alt['active'] === null && $this->altStatus($state, $alt, $this->squadKey($state, $u)) === 'ready';
    }

    /** @return array{0:array,1:array} */
    private function applyAlt(array $state, string $side, array $action): array
    {
        $state['alt'] ??= $this->altInit($state);
        $type = $action['type'] ?? null;
        $events = [];
        $active = $state['alt']['active'];
        switch ($type) {
            case 'activate':
                $this->doActivate($state, $side, $action, $events);
                break;
            case 'end_activation':
                if ($active === null) {
                    throw new IllegalAction('squad_locked', '활성화된 부대가 없습니다.', 409);
                }
                $this->completeActivation($state, $events, 'end');
                break;
            case 'move':
            case 'attack':
            case 'wait':
            case 'use_skill':
            case 'use_item':
                $u = $this->ownUnit($state, $side, $action['unit_id'] ?? null);
                if ($active === null && $this->altImplicitOk($state, $u)) {   // 호환: 암묵 활성화(activation_start 이벤트 포함)
                    $this->doActivate($state, $side, ['squad_id' => $this->squadKey($state, $u)], $events);
                    $active = $state['alt']['active'];
                }
                if ($active === null || $this->squadKey($state, $u) !== $active) {
                    throw new IllegalAction('squad_locked', '활성화된 부대의 유닛만 행동할 수 있습니다. 먼저 부대를 활성화하세요.', 409);
                }
                match ($type) {
                    'move' => $this->doMove($state, $u, $action, $events),
                    'attack' => $this->doAttack($state, $u, $action, $events),
                    'wait' => $this->doWait($state, $u, $action, $events),
                    'use_skill' => $this->doUseSkill($state, $u, $action, $events),
                    'use_item' => $this->doUseItem($state, $u, $action, $events),
                };
                $this->afterUnitAction($state, $events);
                break;
            default:   // end_turn 포함: 교대 행동 전투에서는 사용 불가
                throw new IllegalAction('invalid_action', '알 수 없는 행동입니다(교대 행동 전투: activate|end_activation|move|attack|wait|use_skill).');
        }

        return [$state, $events];
    }

    private function doActivate(array &$state, string $side, array $a, array &$events): void
    {
        $key = $a['squad_id'] ?? null;
        if (! is_string($key) || ! in_array($key, $state['alt']['squads'][$side], true) || ! $this->altMembers($state, $key)) {
            throw new IllegalAction('squad_not_found', '활성화할 수 있는 내 부대가 아닙니다.', 404);
        }
        if ($state['alt']['active'] !== null) {
            throw new IllegalAction('squad_locked', '이미 활성화된 부대가 있습니다. end_activation 후 선택하세요.', 409);
        }
        if (in_array($key, $state['alt']['done'], true)) {
            throw new IllegalAction('squad_already_activated', '이번 라운드에 이미 활성화한 부대입니다.', 409);
        }
        $state['alt']['active'] = $key;
        $state['alt']['activations']++;
        self::emit($state, $events, 'activation_start', ['actor_unit_id' => $key, 'unit_ids' => $this->altMembers($state, $key), 'side' => $side, 'turn' => $state['turn']]);
    }

    /** 유닛 행동 후: 활성 부대가 붕괴했거나 모든 소속 유닛이 행동 완료면 활성화 종료 */
    private function afterUnitAction(array &$state, array &$events): void
    {
        if (($state['status'] ?? 'active') !== 'active' || $state['alt']['active'] === null) {
            return;
        }
        $members = $this->altMembers($state, $state['alt']['active']);
        if (! $members) {
            $this->completeActivation($state, $events, 'collapse');
        } elseif (! array_filter($members, fn ($id) => ! $state['units'][$id]['acted'])) {
            $this->completeActivation($state, $events, 'done');
        }
    }

    /** 활성 부대 종료 -> 다음 차례 결정(상대 우선 교대, 상대 소진 시 연속 cap까지, 그 외 라운드 종료) */
    private function completeActivation(array &$state, array &$events, string $reason): void
    {
        $side = $state['side'];
        $key = $state['alt']['active'];
        $state['alt']['done'][] = $key;
        $state['alt']['active'] = null;
        $st = $state['alt']['streak'];
        $state['alt']['streak'] = ['side' => $side, 'count' => $st['side'] === $side ? $st['count'] + 1 : 1];
        self::emit($state, $events, 'activation_end', ['actor_unit_id' => $key, 'side' => $side, 'reason' => $reason, 'turn' => $state['turn']]);
        $other = $side === 'a' ? 'b' : 'a';
        if ($this->altReadySquads($state, $other)) {
            $state['side'] = $other;

            return;
        }
        $ownReady = $this->altReadySquads($state, $side) !== [];
        if ($ownReady && $state['alt']['streak']['count'] < $state['alt']['cap']) {
            return;
        }
        $this->endRound($state, $events, $ownReady ? 'cap' : 'exhausted');
    }

    /** 라운드 종료: 양측 치유·마을 회복 일괄, round(turn)++, 상한 초과 시 finishByHp, 다음 라운드 선공 결정 */
    private function endRound(array &$state, array &$events, string $reason): void
    {
        self::emit($state, $events, 'round_end', ['turn' => $state['turn'], 'reason' => $reason]);
        $first = $state['first_side'] ?? 'a';
        foreach ([$first, $first === 'a' ? 'b' : 'a'] as $s) {
            $this->healSide($state, $events, $s);
        }
        if ($this->objectiveRoundEnd($state, $events)) {
            return;
        }
        if ($this->surviveWon($state) && StageRules::gate($state)) {   // survive_turns: 라운드 N 종료 시 플레이어 지휘관 생존 -> 승리
            $this->finish($state, 'a', 'survive_turns', $events);

            return;
        }
        if ($state['turn'] >= $state['max_turns']) {
            $this->finishByHp($state, $events);

            return;
        }
        $state['turn']++;
        $this->runTriggers($state, $events);
        foreach ($state['units'] as $id => $_) {
            $state['units'][$id]['moved'] = false;
            $state['units'][$id]['acted'] = false;
            unset($state['units'][$id]['skill_move_bonus'], $state['units'][$id]['skill_attack_pct'], $state['units'][$id]['turn_skill_used']);   // surge 효과는 그 턴 한정
        }
        $state['alt']['done'] = [];
        $state['alt']['active'] = null;
        $state['alt']['streak'] = ['side' => null, 'count' => 0];
        $this->tickResources($state, null, $events);   // 라운드 시작: 양측 쿨다운 -1 / MP 회복
        $rf = $this->altRoundFirst($state, $state['alt']);
        $rs = $rf === 'a' ? 'b' : 'a';
        if ($this->altReadySquads($state, $rf)) {
            $next = $rf;
        } elseif ($this->altReadySquads($state, $rs)) {
            $next = $rs;
        } else {
            $this->finishByHp($state, $events);   // 양쪽 모두 부대 없음(비정상)

            return;
        }
        $state['side'] = $next;
        self::emit($state, $events, 'turn_start', ['turn' => $state['turn'], 'side' => $next]);
    }

    /**
     * 타임아웃 자동 종료(교대 행동): 활성 부대가 있으면 그 부대를, 없으면 첫 ready 부대를 활성화 직후 종료(행동권 소진).
     *
     * @return array{0:array,1:array} [새 상태, 이벤트]
     */
    public function timeoutActivation(array $state, string $side): array
    {
        if (($state['status'] ?? 'active') !== 'active') {
            throw new IllegalAction('battle_finished', '이미 종료된 전투입니다.', 409);
        }
        if ($state['side'] !== $side) {
            throw new IllegalAction('not_your_turn', '내 턴이 아닙니다.', 409);
        }
        if (! self::altOn($state)) {
            throw new IllegalAction('invalid_action', '교대 행동 전투가 아닙니다.');
        }
        $state['alt'] ??= $this->altInit($state);
        $events = [];
        if ($state['alt']['active'] === null) {
            $ready = $this->altReadySquads($state, $side);
            if (! $ready) {
                throw new IllegalAction('squad_locked', '활성화할 부대가 없습니다.', 409);
            }
            $this->doActivate($state, $side, ['squad_id' => $ready[0]], $events);
        }
        $this->completeActivation($state, $events, 'timeout');

        return [$state, $events];
    }

    /**
     * 목표 정규화(전투 생성 시 state['objective']에 고정 -> 진행 중 전투는 이후 스테이지 데이터 변경에 영향받지 않는다).
     *  - survive_turns{turns>=1} -> ['type'=>'survive_turns','turns'=>N]
     *  - capture{points:[[x,y],..](필수, 전투 생성 시 맵 meta.objective_points로 해석해 전달), mode:any|all, hold_turns:0..30, by:any_unit|commander, fail_if_enemy_holds:null|1..30}
     *    -> ['type'=>'capture','points'=>..,'mode'=>..,'hold_turns'=>..,'by'=>..,'side'=>'a','fail_if_enemy_holds'=>..]
     *  그 외/없음/잘못된 값 = null = 기본 defeat_commander(state에 기록하지 않아 기존 동작).
     */
    public static function normalizeObjective(mixed $o): ?array
    {
        if (is_array($o) && ($o['type'] ?? null) === 'survive_turns' && (int) ($o['turns'] ?? 0) >= 1) {
            return ['type' => 'survive_turns', 'turns' => min(99, (int) $o['turns'])];
        }
        if (is_array($o) && ($o['type'] ?? null) === 'capture') {
            $pts = [];
            foreach ((array) ($o['points'] ?? []) as $p) {
                if (is_array($p) && count($p) === 2 && is_int($p[0]) && is_int($p[1]) && $p[0] >= 0 && $p[1] >= 0) {
                    $pts[] = [$p[0], $p[1]];
                }
            }
            if ($pts === []) {
                return null;
            }
            $efh = isset($o['fail_if_enemy_holds']) ? (int) $o['fail_if_enemy_holds'] : 0;

            return [
                'type' => 'capture', 'points' => $pts, 'mode' => ($o['mode'] ?? 'any') === 'all' ? 'all' : 'any',
                'hold_turns' => max(0, min(30, (int) ($o['hold_turns'] ?? 0))), 'by' => ($o['by'] ?? 'any_unit') === 'commander' ? 'commander' : 'any_unit',
                'side' => 'a', 'fail_if_enemy_holds' => $efh >= 1 ? min(30, $efh) : null,
            ];
        }

        return null;
    }

    /**
     * 스테이지/시뮬 입력 목표를 해석해 정규화한다: capture.points가 'map'(또는 생략)이면 맵 meta.objective_points를 쓴다.
     * 맵에 목표 점이 없으면 null(기본 defeat_commander).
     */
    public static function resolveObjective(mixed $raw, array $mapMeta = []): ?array
    {
        if (is_array($raw) && ($raw['type'] ?? null) === 'capture' && (! isset($raw['points']) || $raw['points'] === 'map')) {
            $raw['points'] = $mapMeta['objective_points'] ?? [];
        }

        return self::normalizeObjective($raw);
    }

    /** state에 고정된 survive_turns 목표 라운드 수(없거나 다른 목표면 null) */
    public static function surviveTurns(array $state): ?int
    {
        $o = self::normalizeObjective($state['objective'] ?? null);

        return $o && $o['type'] === 'survive_turns' ? $o['turns'] : null;
    }

    /** state에 고정된 capture 목표(없으면 null) */
    public static function captureObjective(array $state): ?array
    {
        $o = self::normalizeObjective($state['objective'] ?? null);

        return $o && $o['type'] === 'capture' ? $o : null;
    }

    /**
     * 뷰용 목표 정보(항상 type 포함). capture면 points/mode/hold_turns/by/held[{x,y,holder}]/progress{hold,need,enemy_hold,enemy_need}.
     *
     * @return array<string,mixed>
     */
    public static function objectiveView(array $state): array
    {
        $o = self::normalizeObjective($state['objective'] ?? null);
        if ($o === null) {
            return ['type' => 'defeat_commander'];
        }
        if ($o['type'] === 'survive_turns') {
            return $o;
        }
        $pr = $state['objective_progress'] ?? [];
        $held = [];
        foreach ($o['points'] as [$x, $y]) {
            $held[] = ['x' => $x, 'y' => $y, 'holder' => self::pointHolder($state, $o, $x, $y)];
        }

        return $o + ['held' => $held, 'progress' => ['hold' => (int) ($pr['hold'] ?? 0), 'need' => $o['hold_turns'], 'enemy_hold' => (int) ($pr['enemy_hold'] ?? 0), 'enemy_need' => $o['fail_if_enemy_holds']]];
    }

    /** 목표 칸 (x,y)을 점유한 진영('a'|'b') 또는 null. a 진영은 by=commander면 지휘관 유닛만 인정 */
    private static function pointHolder(array $state, array $o, int $x, int $y): ?string
    {
        foreach ($state['units'] as $u) {
            if ($u['x'] === $x && $u['y'] === $y) {
                if ($u['side'] === 'a' && $o['by'] === 'commander' && $u['kind'] !== 'commander') {
                    return null;
                }

                return $u['side'];
            }
        }

        return null;
    }

    /** side 진영이 목표 조건(any: 한 곳 이상 / all: 전부)을 지금 충족하는가 */
    private static function captureHeld(array $state, array $o, string $side): bool
    {
        $n = 0;
        foreach ($o['points'] as [$x, $y]) {
            self::pointHolder($state, $o, $x, $y) === $side && $n++;
        }

        return $o['mode'] === 'all' ? $n === count($o['points']) : $n >= 1;
    }

    /** capture 도달형(hold_turns=0): 이동 직후 조건 충족 시 즉시 승리. 지휘관 사망 패배(resolveDeath)는 이미 처리된 뒤라 우선순위는 지휘관 사망 > 점령 승리 */
    private function objectiveOnMove(array &$state, array &$events): void
    {
        $o = self::captureObjective($state);
        if ($o === null || $o['hold_turns'] > 0 || ($state['status'] ?? 'active') !== 'active') {
            return;
        }
        if (self::captureHeld($state, $o, 'a') && StageRules::gate($state)) {
            $this->finish($state, 'a', 'objective', $events);
        }
    }

    /**
     * 라운드 종료 시 capture 판정: 점유형(hold_turns>0)은 연속 점유 라운드 수를 올리고(조건 불충족이면 리셋) N 도달 시 승리,
     * fail_if_enemy_holds는 적 점유 연속 N 라운드면 패배. @return bool 전투가 끝났으면 true
     */
    private function objectiveRoundEnd(array &$state, array &$events): bool
    {
        $o = self::captureObjective($state);
        if ($o === null || ($state['status'] ?? 'active') !== 'active') {
            return false;
        }
        $pr = $state['objective_progress'] ?? ['hold' => 0, 'enemy_hold' => 0];
        if ($o['hold_turns'] > 0) {
            $pr['hold'] = self::captureHeld($state, $o, 'a') ? ((int) $pr['hold'] + 1) : 0;
        }
        if ($o['fail_if_enemy_holds'] !== null) {
            $pr['enemy_hold'] = self::captureHeld($state, $o, 'b') ? ((int) $pr['enemy_hold'] + 1) : 0;
        }
        $state['objective_progress'] = $pr;
        self::emit($state, $events, 'objective_progress', ['turn' => $state['turn'], 'hold' => $pr['hold'], 'need' => $o['hold_turns'], 'enemy_hold' => $pr['enemy_hold'], 'enemy_need' => $o['fail_if_enemy_holds']]);
        if ($o['hold_turns'] > 0 && $pr['hold'] >= $o['hold_turns'] && StageRules::gate($state)) {
            $this->finish($state, 'a', 'objective', $events);

            return true;
        }
        if ($o['fail_if_enemy_holds'] !== null && $pr['enemy_hold'] >= $o['fail_if_enemy_holds']) {
            $this->finish($state, 'b', 'objective_lost', $events);

            return true;
        }

        return false;
    }

    /**
     * 증원 트리거 정규화(전투 생성 시 state['triggers']에 고정). 입력 stage.triggers[]: {on:{turn:N>=2}, action:'spawn', side:'b', zone:이름, units:string[], limit?:int}
     * zones = 맵 meta.enemy_extra_zones {이름 => [[x,y],..]}. 알 수 없는 zone/빈 units/잘못된 turn은 건너뛴다(예외 없음).
     *
     * @return array<int,array<string,mixed>>
     */
    public static function normalizeTriggers(mixed $triggers, array $zones, int $level, float $growth, array $knownTypes): array
    {
        $out = [];
        foreach ((array) $triggers as $i => $t) {
            if (! is_array($t) || ($t['action'] ?? null) !== 'spawn' || (int) ($t['on']['turn'] ?? 0) < 2 || ! isset($zones[$t['zone'] ?? '']) || (array) $zones[$t['zone']] === []) {
                continue;
            }
            $units = array_values(array_filter((array) ($t['units'] ?? []), fn ($x) => is_string($x) && in_array($x, $knownTypes, true)));
            isset($t['limit']) && (int) $t['limit'] > 0 && $units = array_slice($units, 0, (int) $t['limit']);
            if ($units === []) {
                continue;
            }
            $out[] = ['id' => 't'.$i, 'turn' => (int) $t['on']['turn'], 'action' => 'spawn', 'side' => ($t['side'] ?? 'b') === 'a' ? 'a' : 'b',
                'zone' => (string) $t['zone'], 'cells' => array_values($zones[$t['zone']]), 'units' => $units, 'level' => $level, 'growth' => $growth, 'done' => false];
        }

        return $out;
    }

    /** 뷰용 증원 예고(아직 안 끝난 트리거): turn/side/남은 유닛 수/구역 이름과 칸 */
    public static function triggersView(array $state): array
    {
        $out = [];
        foreach ($state['triggers'] ?? [] as $t) {
            if (empty($t['done'])) {
                $out[] = ['id' => $t['id'], 'turn' => (int) $t['turn'], 'side' => $t['side'], 'count' => count($t['units']), 'zone' => $t['zone'], 'cells' => $t['cells']];
            }
        }

        return $out;
    }

    /**
     * 라운드 시작 증원: state.triggers 중 turn <= 현재 라운드이고 미완료인 spawn을 실행. 구역 칸이 점유됐으면 구역에서 가장 가까운 빈 통행 칸으로 밀어내고,
     * 자리가 없으면 남은 유닛은 다음 라운드로 지연한다. 이벤트 'reinforce'(unit_ids, side, turn, zone, delayed). triggers 키가 없는 구 전투는 영향 없음.
     */
    private function runTriggers(array &$state, array &$events): void
    {
        if (empty($state['triggers']) || ($state['status'] ?? 'active') !== 'active') {
            return;
        }
        foreach ($state['triggers'] as $ti => $t) {
            if (! empty($t['done']) || (int) $t['turn'] > (int) $state['turn']) {
                continue;
            }
            $side = $t['side'];
            $spawned = [];
            $remain = [];
            foreach ($t['units'] as $type) {
                $mt = $this->rules->unitType($type)['move_type'];
                $cell = $this->nearestFreeCell($state, $mt, $t['cells']);
                if ($cell === null) {
                    $remain[] = $type;

                    continue;
                }
                $n = max((int) ($state['spawn_seq'][$side] ?? 0), $this->maxUnitIndex($state, $side)) + 1;
                $state['spawn_seq'][$side] = $n;
                $id = $side.$n;
                $leader = $state['units'][$side.'0'] ?? null;
                $u = ArmyBuilder::makeUnit($this->rules, $id, $side, 'troop', $type, null, (int) $t['level'], $cell[0], $cell[1], (float) $t['growth'], $leader['culture'] ?? null);
                $u['facing'] = $leader['facing'] ?? null;
                self::squadOn($state) && $u['leader_id'] = $leader ? $side.'0' : null;
                $state['units'][$id] = $u;
                $state['init_hp'][$side] = ($state['init_hp'][$side] ?? 0) + $u['max_hp'];   // 턴 상한 비율 판정의 초기 HP에 증원분 포함
                $spawned[] = $id;
            }
            $state['triggers'][$ti]['units'] = $remain;
            $state['triggers'][$ti]['done'] = $remain === [];
            if ($spawned !== [] || $remain !== []) {
                self::emit($state, $events, 'reinforce', ['unit_ids' => $spawned, 'side' => $side, 'turn' => $state['turn'], 'zone' => $t['zone'], 'delayed' => count($remain)]);
            }
        }
    }

    /**
     * 유닛 1기 생성(연출 cue `spawn`용 일반화): 증원 병사 또는 이름 있는 영웅 난입/합류.
     * spec: side(a|b), cells(우선순위 칸 목록), level, type(병종), hero(영웅 행|null), ready(false=생성 턴 행동 불가), tag, npc_ally(AI 조종 아군), must_survive, growth.
     * 칸이 모두 막히면 생성하지 않고 skipped 를 알린다. 이벤트는 FE 호환을 위해 reinforce 형식(+hero/tag/ready/skipped). 생성 id 를 반환(실패 null).
     */
    public function spawnUnit(array &$state, array &$events, array $spec): ?string
    {
        $side = $spec['side'] === 'a' ? 'a' : 'b';
        $type = $spec['type'];
        $mt = $this->rules->unitType($type)['move_type'];
        $cell = $this->nearestFreeCell($state, $mt, $spec['cells']);
        $hero = $spec['hero'] ?? null;
        $npc = ! empty($spec['npc_ally']);
        $base = ['side' => $side, 'turn' => $state['turn'], 'zone' => null, 'delayed' => 0, 'tag' => $spec['tag'] ?? null, 'hero' => $hero['code'] ?? null, 'cue_id' => $spec['cue_id'] ?? null];
        if ($cell === null) {
            self::emit($state, $events, 'reinforce', $base + ['unit_ids' => [], 'skipped' => true]);

            return null;
        }
        $prefix = $npc ? 'n' : $side;
        $n = $npc ? (function () use ($state) {   // 아군 NPC id: n0 부터 살아 있지도 사망 기록에도 없는 첫 번호(ArmyBuilder::addAllyNpcs 와 같은 id 체계)
            for ($k = 0; isset($state['units']['n'.$k]) || isset($state['defeated']['n'.$k]); $k++) {   // 사망한 NPC id 재사용 금지(defeated 조건과 충돌)
            }

            return $k;
        })() : max((int) ($state['spawn_seq'][$side] ?? 0), $this->maxUnitIndex($state, $side)) + 1;
        $npc || $state['spawn_seq'][$side] = $n;
        $id = $prefix.$n;
        $leader = $state['units'][$side.'0'] ?? null;
        $u = ArmyBuilder::makeUnit($this->rules, $id, $side, $hero ? 'hero' : 'troop', $type, $hero, (int) $spec['level'], $cell[0], $cell[1], (float) $spec['growth'], $hero ? null : ($leader['culture'] ?? null), $state['mp_knobs'] ?? null);
        $u['facing'] = $leader['facing'] ?? null;
        self::squadOn($state) && $u['leader_id'] = $hero ? null : ($leader ? $side.'0' : null);
        $npc && $u['npc_ally'] = true;
        ! empty($spec['must_survive']) && $u['must_survive'] = true;
        isset($spec['tag']) && $u['tag'] = $spec['tag'];
        if (empty($spec['ready'])) {   // ready=false: 생성된 그 턴에는 행동 불가(다음 턴 시작 시 endTurn 이 초기화)
            $u['moved'] = true;
            $u['acted'] = true;
        }
        $state['units'][$id] = $u;
        $state['init_hp'][$side] = ($state['init_hp'][$side] ?? 0) + $u['max_hp'];
        self::emit($state, $events, 'reinforce', $base + ['unit_ids' => [$id], 'ready' => ! empty($spec['ready'])]);

        return $id;
    }

    private function maxUnitIndex(array $state, string $side): int
    {
        $m = 0;
        foreach ($state['units'] as $id => $_) {
            if (str_starts_with((string) $id, $side) && ctype_digit(substr((string) $id, strlen($side)))) {
                $m = max($m, (int) substr((string) $id, strlen($side)));
            }
        }

        return $m;
    }

    /** cells(우선순위 순) 중 빈 통행 칸, 없으면 cells에서 BFS로 가장 가까운 빈 통행 칸. 없으면 null */
    private function nearestFreeCell(array $state, string $moveType, array $cells): ?array
    {
        $seen = [];
        $queue = [];
        foreach ($cells as [$x, $y]) {
            $seen["$x,$y"] = true;
            $queue[] = [$x, $y];
        }
        for ($i = 0; $i < count($queue); $i++) {
            [$x, $y] = $queue[$i];
            if ($this->inBounds($state, $x, $y) && $this->passable($state, $moveType, $x, $y) && $this->unitAt($state, $x, $y) === null) {
                return [$x, $y];
            }
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if ($this->inBounds($state, $nx, $ny) && ! isset($seen["$nx,$ny"])) {
                    $seen["$nx,$ny"] = true;
                    $queue[] = [$nx, $ny];
                }
            }
        }

        return null;
    }

    /** survive_turns: 라운드(turn)가 목표 턴 수에 도달했고 플레이어(a) 지휘관이 생존. 지휘관 사망은 kill 시점에 이미 즉시 패배 처리됨. */
    private function surviveWon(array $state): bool
    {
        $n = self::surviveTurns($state);
        if ($n === null || (int) $state['turn'] < $n) {
            return false;
        }
        foreach ($state['units'] as $u) {
            if ($u['side'] === 'a' && $u['kind'] === 'commander' && $u['hp'] > 0) {
                return true;
            }
        }

        return false;
    }

    private function finishByHp(array &$state, array &$events): void
    {
        if (StageRules::timeoutLoses($state)) {   // win_mode 전투: 승리 조건을 못 채우고 턴 상한 -> 패배(HP 비교 승리 없음)
            $this->finish($state, 'b', 'turn_limit', $events);

            return;
        }
        $hp = ['a' => 0, 'b' => 0];
        $alive = ['a' => 0.0, 'b' => 0.0];
        $maxAlive = ['a' => 0, 'b' => 0];
        foreach ($state['units'] as $u) {
            $hp[$u['side']] += $u['hp'];
            $alive[$u['side']] += ($u['kind'] !== 'commander' && $this->rules->unitType($u['type'])['heal'] > 0)
                ? (float) $this->opts['turn_limit_noncombatant_weight'] : 1.0;
            $maxAlive[$u['side']] += $u['max_hp'];
        }
        // 초기 HP 합은 ArmyBuilder가 state.init_hp에 기록(없는 구 상태는 생존 유닛 최대 HP 합으로 대체)
        $ratio = fn (string $s) => $hp[$s] / max(1, $state['init_hp'][$s] ?? $maxAlive[$s]);
        $cmp = fn ($x, $y) => abs($x - $y) < 1e-9 ? 0 : ($x <=> $y);
        $c = match ($this->opts['turn_limit_rule']) {
            'hp_ratio' => $cmp($ratio('a'), $ratio('b')),
            'alive_then_ratio' => $cmp($alive['a'], $alive['b']) ?: $cmp($ratio('a'), $ratio('b')),
            default => $hp['a'] <=> $hp['b'],
        };
        $this->finish($state, $c === 0 ? null : ($c > 0 ? 'a' : 'b'), 'turn_limit', $events);
    }

    private function finish(array &$state, ?string $winner, string $reason, array &$events, array $extra = []): void
    {
        $state['status'] = 'finished';
        $state['winner'] = $winner;
        self::emit($state, $events, 'battle_end', ['winner' => $winner, 'reason' => $reason] + $extra);
    }

    /** StageRules(승패 규칙)가 전투를 끝낸다. battle_end 에 rule(+label) 필드가 추가된다 */
    public function finishByRule(array &$state, ?string $winner, string $reason, array &$events, array $extra = []): void
    {
        $this->finish($state, $winner, $reason, $events, $extra);
    }
}
