<?php

namespace App\Game;

/**
 * 임밸런 적 편성 v3(stages_ch1_enemy_v3.json / stages_legacy6_enemy_v3.json 의 items[]) -> 엔진 스키마 변환(순수 함수, DB 접근 없음).
 *
 * 출력 enemy_squad = ArmyBuilder::addGenericSide 입력:
 *   {code, name, culture, commander{display_name_ko,unit_type,troop_type,hp_mult,atk_mult,def_mult,aura,skills,name_evidence,npc_ref,kind,culture?},
 *    units:string[], cells:[[x,y]..](첫 칸=지휘관), ai, id, role, squads:[{commander, units, cells, ai, id, role}...], deferred_triggers?}
 *  - main 부대(role=main)가 최상위, 나머지(vice/sub)는 squads[] (파일 순서 유지). 부대 병사 병종은 지휘관 병종 1종(엔진 규칙).
 *  - ai(advance_to_gate, hold_until_contact 등)는 데이터로만 보존하고 엔진은 읽지 않는다 = 전부 advance 동작(폴백). 알 수 없는 값은 advance 로 정규화.
 *  - triggers: on.turn spawn 은 증원 구역 'v3_<id>'(spawn_cell 1칸) + units(지휘관 병종 + 병사)로 변환. on.boss_hp_pct_lte 는 엔진 미지원 -> deferred_triggers 로 보존하고 stages.triggers 에는 넣지 않는다.
 */
final class EnemyV3Adapter
{
    /** 로스터/히어로 culture id -> 스프라이트 문화권 세트 id(hero_cultures.json sets). 없는 값(fiction 등)은 null = 스테이지 기본 culture 사용 */
    public const CULTURE_MAP = [
        'japan' => 'japan', 'china' => 'china', 'goguryeo' => 'korea', 'korea' => 'korea', 'mongol' => 'steppe', 'macedon' => 'ancient_med',
        'carthage' => 'ancient_med', 'south_asia' => 'south_asia', 'middle_east' => 'middle_east', 'hre' => 'europe', 'france' => 'europe', 'europe' => 'europe', 'steppe' => 'steppe', 'ancient_med' => 'ancient_med', 'southeast_asia' => 'southeast_asia',
    ];

    public const KNOWN_AI = ['advance', 'guard_commander', 'hold_until_contact', 'escort_main', 'hold_rear_until_turn', 'advance_to_gate', 'guard_point', 'hold_ambush', 'hold_gate'];

    /**
     * @param  array  $item  v3 items[] 항목(enemy_squads[], triggers[])
     * @param  array<string,array>  $roster  npc code => 로스터 행(culture 조회용)
     * @param  string|null  $baseCulture  스테이지 기본 culture(일반 지휘관·병사 스프라이트)
     * @return array{enemy_squad:array,triggers:array,zones:array<string,array>,deferred:array,units_initial:int,units_peak:int}
     */
    public static function convert(array $item, array $roster = [], ?string $baseCulture = null): array
    {
        $code = (string) ($item['code'] ?? '?');
        $list = array_values($item['enemy_squads'] ?? []);
        $list !== [] || throw new \InvalidArgumentException("{$code}: enemy_squads 가 비었습니다.");
        $mains = array_values(array_filter($list, fn ($s) => ($s['role'] ?? '') === 'main'));
        count($mains) === 1 || throw new \InvalidArgumentException("{$code}: role=main 부대는 정확히 1개여야 합니다(".count($mains).').');
        $others = array_values(array_filter($list, fn ($s) => ($s['role'] ?? '') !== 'main'));

        $m = self::squad($mains[0], $roster);
        $squad = [
            'code' => 'e3_'.$code, 'name' => ($item['name'] ?? $code).' 적 편성 v3', 'culture' => $baseCulture,
            'commander' => $m['commander'], 'units' => $m['units'], 'cells' => $m['cells'], 'ai' => $m['ai'], 'id' => $m['id'], 'role' => 'main', 'route' => $m['route'] ?? null,
            'squads' => array_map(fn ($s) => self::squad($s, $roster), $others),
        ];
        if (($mains[0]['apply_main_hold'] ?? false) === true && isset($mains[0]['hold_until_turn'])) {   // 옵트인: main 대기를 enemy_squad 최상위로 전달(ArmyBuilder::addGenericSide 가 읽음)
            $squad['apply_main_hold'] = true;
            $squad['hold_until_turn'] = $mains[0]['hold_until_turn'];
        }
        $squad = array_filter($squad, fn ($v) => $v !== null);
        $initial = self::countUnits($squad);

        $triggers = [];
        $zones = [];
        $deferred = [];
        $peak = $initial;
        foreach (array_values($item['triggers'] ?? []) as $t) {
            $sq = $t['squad'] ?? null;
            if (! is_array($sq) || ($t['action'] ?? null) !== 'spawn') {
                continue;
            }
            $conv = self::squad($sq, $roster);
            $units = array_merge([$conv['commander']['unit_type']], $conv['units']);
            $peak += count($units);
            if (isset($t['on']['turn'], $sq['spawn_cell'][0], $sq['spawn_cell'][1])) {
                $zone = 'v3_'.($sq['id'] ?? $t['id'] ?? count($zones));
                $zones[$zone] = [[(int) $sq['spawn_cell'][0], (int) $sq['spawn_cell'][1]]];
                $triggers[] = ['on' => ['turn' => (int) $t['on']['turn']], 'action' => 'spawn', 'side' => $t['side'] ?? 'b', 'zone' => $zone, 'units' => $units];
            } else {
                $deferred[] = ['id' => $t['id'] ?? null, 'on' => $t['on'] ?? null, 'units' => $units, 'spawn_cell' => $sq['spawn_cell'] ?? null, 'reason' => 'unsupported_trigger_condition'];
            }
        }
        $deferred !== [] && $squad['deferred_triggers'] = $deferred;

        return ['enemy_squad' => $squad, 'triggers' => $triggers, 'zones' => $zones, 'deferred' => $deferred, 'units_initial' => $initial, 'units_peak' => $peak];
    }

    /** 부대 1개 변환 */
    private static function squad(array $s, array $roster): array
    {
        $sid = (string) ($s['id'] ?? '?');
        $l = $s['leader'] ?? [];
        $type = (string) ($l['troop_type'] ?? $s['soldier_type'] ?? '');
        $type !== '' || throw new \InvalidArgumentException("부대 {$sid}: leader.troop_type 없음");
        $soldierType = (string) ($s['soldier_type'] ?? $type);
        $soldierType === $type || throw new \InvalidArgumentException("부대 {$sid}: 병사 병종({$soldierType})은 지휘관 병종({$type})과 같아야 합니다.");
        $ref = $l['ref'] ?? null;
        $cul = $ref !== null ? (self::CULTURE_MAP[$roster[$ref]['culture'] ?? ''] ?? null) : null;
        $cmd = [
            'display_name_ko' => (string) ($l['display_name_ko'] ?? '적 지휘관'), 'name_evidence' => $l['evidence_level'] ?? null, 'kind' => $l['kind'] ?? 'generic', 'npc_ref' => $ref,
            'unit_type' => $type, 'troop_type' => $type, 'hp_mult' => (float) ($l['hp_mult'] ?? 1.0), 'atk_mult' => 1.0, 'def_mult' => 1.0, 'aura' => null, 'skills' => [],
        ];
        $cul !== null && $cmd['culture'] = $cul;
        $cells = array_values(array_map(fn ($c) => [(int) $c[0], (int) $c[1]], $s['cells'] ?? []));
        $units = array_fill(0, max(0, (int) ($s['soldiers'] ?? 0)), $soldierType);
        if ($cells !== [] && count($cells) !== 1 + count($units)) {
            throw new \InvalidArgumentException("부대 {$sid}: cells ".count($cells).'칸 != 지휘관 1 + 병사 '.count($units));
        }
        $ai = (string) ($s['ai'] ?? 'advance');
        $out = ['id' => $s['id'] ?? null, 'role' => $s['role'] ?? 'sub', 'commander' => $cmd, 'units' => $units, 'cells' => $cells, 'ai' => in_array($ai, self::KNOWN_AI, true) ? $ai : 'advance'];
        foreach (['hold_range', 'hold_until_turn', 'point', 'pocket'] as $k) {
            isset($s[$k]) && $out[$k] = $s[$k];
        }
        if (isset($s['route'])) {   // 적 경로 이동 AI(RouteAi 스키마). 무효면 조용히 버리지 않고 저작 오류로 중단
            ($rt = RouteAi::normalize($s['route'])) !== null || throw new \InvalidArgumentException("부대 {$sid}: route 가 유효하지 않음(waypoints [[x,y]..1~8], from_turn, move_cap)");
            $out['route'] = $rt;
        }

        return $out;
    }

    /** enemy_squad 전체 유닛 수(지휘관 포함) */
    public static function countUnits(array $squad): int
    {
        $n = 1 + count($squad['units'] ?? []);
        foreach ($squad['squads'] ?? [] as $s) {
            $n += 1 + count($s['units'] ?? []);
        }

        return $n;
    }
}
