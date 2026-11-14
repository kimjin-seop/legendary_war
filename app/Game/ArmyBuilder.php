<?php

namespace App\Game;

/**
 * 유닛 생성/레벨 스케일링/초기 상태/배치 보조 (순수 PHP).
 *
 * heroRow 형식: [code,name_ko,unit_type,hp_bonus,atk_bonus,def_bonus,growth_hp_pct,growth_atk_pct,growth_def_pct,
 *               aura(null|[radius,atk_pct,def_pct]), cost]
 */
final class ArmyBuilder
{
    public static function scale(float|int $base, float $growthPct, int $level): int
    {
        return (int) round($base * (1 + $growthPct / 100 * max(0, $level - 1)));
    }

    /** map: [width,height,tiles(행 문자열[])] */
    public static function initialState(RuleSet $rules, array $map, int $seed, int $maxTurns, string $firstSide = 'a', bool $facing = false, bool $squad = false, bool $alternate = false, ?array $snowball = null, ?array $mpKnobs = null, string $microMode = 'off'): array
    {
        $tiles = [];
        foreach ($map['tiles'] as $row) {
            $tiles[] = array_map(fn ($ch) => $rules->symbols[$ch] ?? 'plain', str_split($row));
        }

        $mapRules = Engine::sanitizeMapRules($map['rules'] ?? null);   // 맵별 규칙 오버라이드(없으면 state에 기록하지 않음 = 기존 동작)

        $snow = Engine::normalizeSnowball($snowball);   // 스노볼은 전투 생성 시 고정(null=off이면 state에 기록하지 않음 = 기존 동작)

        return ($mapRules ? ['rules' => $mapRules] : []) + ($snow ? ['snowball' => $snow] : []) + (in_array($microMode, ['shadow', 'on'], true) ? ['micro_mode' => $microMode] : []) + ($mpKnobs !== null ? ['mp_mode' => true, 'mp_knobs' => $mpKnobs] : []) + [   // mp_mode: 액티브 스킬 MP 방식(전투 생성 시 고정, 키 없음=레거시 cd/uses)
            'width' => $map['width'], 'height' => $map['height'], 'tiles' => $tiles,
            'turn' => 1, 'side' => $firstSide, 'max_turns' => $maxTurns,
            'status' => 'active', 'winner' => null,
            'rng' => Rng::seedToState($seed), 'event_seq' => 0, 'units' => [], 'init_hp' => ['a' => 0, 'b' => 0], 'first_side' => $firstSide,
            'facing' => $facing,   // 방향 시스템 on/off(전투 생성 시 고정)
            'squad' => $squad,     // 영웅-부대 소속 시스템 on/off(전투 생성 시 고정)
            'alternate' => $alternate,   // 교대 행동(부대 단위 번갈아 활성화) on/off(전투 생성 시 고정, 구 상태는 off 취급)
        ];
    }

    /** @var array<string,?array> 병종별 기본 액티브 정의 캐시 */
    private static array $defaultActiveCache = [];

    /**
     * 병종 기본 액티브 1개(database/data/default_active_skills.json, ActiveParams 로 정규화). 정의 없으면 [].
     *
     * @return array<int,array>
     */
    public static function defaultActives(string $unitType, ?string $rarity = null): array
    {
        $ck = $unitType.'|'.($rarity ?? '');
        if (! array_key_exists($ck, self::$defaultActiveCache)) {
            $doc = json_decode((string) @file_get_contents(database_path('data/default_active_skills.json')), true);
            $raw = $doc['by_unit_type'][$unitType] ?? null;
            $ov = $rarity !== null ? ($doc['by_rarity'][$unitType][$rarity] ?? null) : null;   // 등급별 보정(C 돌진 이동+1 등): 기본 params 위에 덮어씀
            is_array($raw) && is_array($ov) && $raw['params'] = array_merge($raw['params'] ?? [], $ov);
            $def = null;
            if (is_array($raw) && ActiveParams::has($raw['template'])) {
                $norm = ActiveParams::normalize($raw['template'], $raw['params'] ?? [], max(1, (int) config('game.active_skill_uses', 2)));
                $norm !== null && $def = ['code' => $raw['code'], 'name' => $raw['name'], 'template' => $raw['template'], 'power_pct' => (int) ($norm['power_pct'] ?? 0), 'cooldown' => (int) $norm['cooldown'], 'uses' => (int) $norm['uses'], 'mp_cost' => MpRules::cost($raw['template'], $norm), 'params' => $norm, 'is_default' => true];
            }
            self::$defaultActiveCache[$ck] = $def;
        }

        return self::$defaultActiveCache[$ck] ? [self::$defaultActiveCache[$ck]] : [];
    }

    /** 액티브가 없는 영웅 행에 병종 기본 액티브를 얹은 사본(a측=플레이어/아군 NPC는 game.default_active_skills, b측은 game.enemy_default_skills 가 켜졌을 때만) */
    public static function withDefaultActives(array $row, string $unitType, string $side): array
    {
        if (! empty($row['actives']) || ! config('game.default_active_skills', true) || ($side !== 'a' && ! config('game.enemy_default_skills', false))) {
            return $row;
        }

        return ['actives' => self::defaultActives($unitType, isset($row['rarity']) ? (string) $row['rarity'] : null)] + $row;
    }

    /**
     * 스테이지 적 지휘관용 "스킬 전용" 영웅 행: hero/npc_ref 코드가 heroes 에 있으면 그 패시브·액티브, 액티브가 없으면 병종 기본 액티브(노브).
     * 스탯은 일반 지휘관과 동일하게 유지(보너스 0, 성장=병사 성장률)하고 영웅 코드는 싣지 않는다(외형·이벤트 참조 불변). 줄 스킬이 없으면 null.
     *
     * @param  ?\Closure  $heroRow  fn(string $code): ?array
     */
    public static function enemySkillRow(array $c, string $unitType, float $troopGrowth, ?\Closure $heroRow): ?array
    {
        if (! config('game.stage_enemy_skills', true)) {
            return null;
        }
        $row = null;
        foreach ([$c['hero'] ?? null, $c['npc_ref'] ?? null] as $code) {
            if (is_string($code) && $code !== '' && $heroRow !== null && ! self::isNonHeroObject($code) && ($row = $heroRow($code)) !== null) {
                break;
            }
        }
        $passives = config('game.stage_enemy_passives', true);
        $actives = $row['actives'] ?? [];
        if (! $actives && config('game.stage_enemy_default_active', true)) {
            $actives = self::defaultActives($unitType, isset($row['rarity']) ? (string) $row['rarity'] : null);
        }
        $hasPassive = $passives && $row && (! empty($row['passive']) || ! empty($row['skills']) || ! empty($row['special']));
        if (! $actives && ! $hasPassive) {
            return null;
        }

        return ['code' => null, 'hp_bonus' => 0, 'atk_bonus' => 0, 'def_bonus' => 0, 'growth_hp_pct' => $troopGrowth, 'growth_atk_pct' => $troopGrowth, 'growth_def_pct' => $troopGrowth,
            'rarity' => $row['rarity'] ?? null, 'actives' => $actives,
            'passive' => $passives ? ($row['passive'] ?? null) : null, 'skills' => $passives ? ($row['skills'] ?? []) : [], 'special' => $passives ? ($row['special'] ?? []) : []];
    }

    public static function makeUnit(RuleSet $rules, string $id, string $side, string $kind, string $type, ?array $hero, int $level, int $x, int $y, float $troopGrowth, ?string $culture = null, ?array $mpKnobs = null, ?string $variant = null): array
    {
        $t = $rules->unitType($type);
        if ($hero) {
            $hp = self::scale($t['hp'] + $hero['hp_bonus'], $hero['growth_hp_pct'], $level);
            $atk = self::scale($t['atk'] + $hero['atk_bonus'], $hero['growth_atk_pct'], $level);
            $def = self::scale($t['def'] + $hero['def_bonus'], $hero['growth_def_pct'], $level);
            if (! empty($hero['equip'])) {   // 장비: scale() 이후 평탄 가산(영웅 유닛만, 서버가 장착 현황에서 계산해 전달). 병사 분기는 불변
                $eq = self::clampEquip($t, $hero, $hero['equip']);
                $hp += $eq['hp'];
                $atk += $eq['atk'];
                $def += $eq['def'];
            }
            if (! empty($hero['star_level'])) {   // 별(★) 보너스: 장비 가산 직후 평탄 가산(공·방만, 체력 제외). row 에 star_level 은 HeroStarService::attach 가 PvE(또는 apply_pvp)에서만 채움
                $sb = StarRules::bonus($t, $hero, (int) $hero['star_level']);
                $atk += $sb['atk'];
                $def += $sb['def'];
            }
        } else {
            $hp = self::scale($t['hp'], $troopGrowth, $level);
            $atk = self::scale($t['atk'], $troopGrowth, $level);
            $def = self::scale($t['def'], $troopGrowth, $level);
        }
        $move = $t['move'];
        $vd = UnitVariants::get($variant);   // 특수유닛: 기본 병종 일치 + enabled 일 때만 hp/atk/def/move 보정(type·상성·사거리 불변)
        if ($vd !== null && $vd['base_type'] === $type) {
            ['hp' => $hp, 'atk' => $atk, 'def' => $def, 'move' => $move] = UnitVariants::apply(['hp' => $hp, 'atk' => $atk, 'def' => $def, 'move' => $move], $vd);
        } else {
            $vd = null;
        }

        return ($hero && ! empty($hero['equip']) ? ['equip_total' => $eq, 'equipment' => $hero['equip_slots'] ?? (object) []] : []) + ($hero && ! empty($hero['skills']) ? ['skills' => $hero['skills']] : []) + ($hero && ! empty($hero['special']) ? ['special' => $hero['special']] : []) + ($hero && ! empty($hero['actives']) ? ['actives' => $hero['actives'], 'skill_state' => array_column(array_map(fn ($d) => [$d['code'], ['cd' => 0, 'uses_left' => (int) $d['uses']]], $hero['actives']), 1, 0)] : []) + ($hero && ! empty($hero['actives']) && $mpKnobs !== null ? self::mpFields($hero, $level, $type, $mpKnobs) : []) + [   // 조건부 패시브 목록(영웅 유닛만, 압축 params). 없으면 키 생략
            'id' => $id, 'side' => $side, 'kind' => $kind, 'type' => $type,
            'hero' => $hero['code'] ?? null, 'name' => $hero['name_ko'] ?? ($vd['name_ko'] ?? $t['name'] ?? $type), 'level' => $level,
            'x' => $x, 'y' => $y, 'hp' => $hp, 'max_hp' => $hp, 'atk' => $atk, 'def' => $def, 'move' => $move,
            'moved' => false, 'acted' => false,
            'aura' => $kind === 'commander' ? ($hero['aura'] ?? null) : null,
            // passive 스킬(영웅 유닛 본인에게만 적용, 규칙 옵션 passive_skills가 켜졌을 때만 사용)
            'passive' => $hero['passive'] ?? null,
            'facing' => null,   // up|down|left|right (방향 시스템 on일 때만 사용)
            'culture' => $hero['culture'] ?? $culture,   // 문화권 세트 id(영웅=본인, 부대=지휘관 culture를 전달받음). 미지정 null
        ] + ($vd !== null ? ['variant' => $variant, 'variant_name' => (string) $vd['name_ko']] : []) + (self::isNonHeroObject($hero['code'] ?? null) ? ['non_hero' => true] : []);   // 수레·배 오브젝트 NPC: 장수 목록(FE 장수/유닛 리스트)에서 제외 표시. 전투 유닛·호위 판정은 그대로
    }

    /**
     * 같은 인물 중복 검사: $heroCode 가 npc_<코드> 별칭이고 $side 에 실제 영웅(<코드>, NPC 아님)이 이미 있으면 그 유닛 id, 아니면 null.
     * (npc_joan_of_arc <-> joan_of_arc 등. 실제 영웅 코드가 npc_ 로 시작하지 않는 전제)
     */
    public static function samePersonOnSide(array $state, string $side, string $heroCode): ?string
    {
        if (! str_starts_with($heroCode, 'npc_')) {
            return null;
        }
        $base = substr($heroCode, 4);
        foreach ($state['units'] as $id => $u) {
            if ($u['side'] === $side && empty($u['npc_ally']) && ($u['hero'] ?? null) === $base) {
                return (string) $id;
            }
        }

        return null;
    }

    /** 장수가 아닌 오브젝트 NPC(수레 npc_cart_*, 배 npc_boat_*): 유닛 non_hero=true 로 표시해 FE 장수 목록에서 제외한다 */
    public static function isNonHeroObject(?string $heroCode): bool
    {
        return $heroCode !== null && preg_match('/^npc_(cart|boat)_/', $heroCode) === 1;
    }

    /** 선택: 부대(enemy_squad 또는 squads[])의 soldier_display_name_ko(1~20자 문자열)를 병사 유닛 이름으로 쓴다(없으면 기존 이름) */
    private static function applySoldierName(array &$unit, array $squad): void
    {
        $n = $squad['soldier_display_name_ko'] ?? null;
        if (is_string($n) && trim($n) !== '' && mb_strlen($n) <= 20) {
            $unit['name'] = $n;
        }
    }

    /**
     * 병사 외형(troop_look): 분대 정의의 soldier_look(npc_[a-z0-9_]+)을 병사 유닛 troop_look 으로 복사한다(squad on/off 무관, 뷰로 그대로 노출).
     * soldier_look 이 없으면 분대 지휘관 npc_ref 가 npc_erased_line 일 때 같은 값을 쓴다("병사도 같은 외형" NPC). 형식이 틀리면 키 생략.
     */
    private static function applyTroopLook(array &$unit, array $squad, array $commander): void
    {
        $look = $squad['soldier_look'] ?? (($commander['npc_ref'] ?? null) === 'npc_erased_line' ? 'npc_erased_line' : null);
        if (is_string($look) && preg_match('/^npc_[a-z0-9_]+$/', $look)) {
            $unit['troop_look'] = $look;
        }
    }

    /** NPC 로스터 코드(npc_ref)를 유닛 상태에 보존(클라이언트 뷰로 그대로 노출). 코드 형식 문자열일 때만, 없으면 키 생략(구 저장 상태 호환) */
    public static function applyNpcRef(array &$unit, array $commander): void
    {
        $ref = $commander['npc_ref'] ?? null;
        if (is_string($ref) && preg_match('/^npc_[a-z0-9_]+$/', $ref)) {
            $unit['npc_ref'] = $ref;
        }
    }

    /** MP 방식 영웅 유닛 필드(액티브 보유 영웅만, 병사 키 없음). 시작 MP = mp_max x mp_start_pct. 노브는 전투 생성 시 state.mp_knobs에 고정 */
    private static function mpFields(array $hero, int $level, string $type, array $knobs): array
    {
        $max = MpRules::maxMp($hero['rarity'] ?? null, $level, $type);

        return ['mp' => MpRules::startMp($max, $knobs), 'mp_max' => $max];
    }

    /**
     * 장비 합계 클램프: 스탯별 min(합계, floor(L1 x cap_pct/100), cap_flat), L1 = 병종 기본 + 영웅 보너스. 음수는 0.
     * 입력 equip는 [hp,atk,def] 또는 {hp,atk,def}. @return array{hp:int,atk:int,def:int}
     */
    public static function clampEquip(array $unitType, array $hero, array $equip): array
    {
        $cfg = config('game.equipment', []);
        $flat = $cfg['cap_flat'] ?? ['hp' => 16, 'atk' => 3, 'def' => 2];
        $pct = $cfg['cap_pct'] ?? ['hp' => 20, 'atk' => 10, 'def' => 40];
        $out = [];
        foreach (['hp', 'atk', 'def'] as $i => $k) {
            $l1 = $unitType[$k] + $hero[$k.'_bonus'];
            $sum = (int) ($equip[$k] ?? $equip[$i] ?? 0);
            $out[$k] = max(0, min($sum, (int) floor($l1 * $pct[$k] / 100), (int) $flat[$k]));
        }

        return $out;
    }

    /** 지휘관 주변(거리순) 배치 영역 내 빈 타일에 부대를 자동 배치. @return array<int,array{0:int,1:int}> */
    public static function autoPlaceTroops(Engine $engine, array $state, array $zone, array $commanderXY, array $troopTypes): array
    {
        $taken = [];
        foreach ($state['units'] as $u) {
            $taken["{$u['x']},{$u['y']}"] = true;
        }
        $cells = $zone;
        usort($cells, function ($a, $b) use ($commanderXY) {
            return [Engine::dist($a[0], $a[1], $commanderXY[0], $commanderXY[1]), $a[0], $a[1]]
                <=> [Engine::dist($b[0], $b[1], $commanderXY[0], $commanderXY[1]), $b[0], $b[1]];
        });
        $out = [];
        foreach ($troopTypes as $i => $type) {
            $moveType = $engine->rules()->unitType($type)['move_type'];
            $found = null;
            foreach ($cells as [$cx, $cy]) {
                if (! isset($taken["$cx,$cy"]) && $engine->passable($state, $moveType, $cx, $cy)) {
                    $found = [$cx, $cy];
                    break;
                }
            }
            if ($found === null) {
                throw new IllegalAction('no_space_for_troops', '부대를 배치할 빈 타일이 부족합니다.');
            }
            $taken["{$found[0]},{$found[1]}"] = true;
            $out[$i] = $found;
        }

        return $out;
    }

    /**
     * 진영 병력을 상태에 추가한다.
     *
     * @param array $heroEntries [['row'=>heroRow,'level'=>int,'key'=>mixed], ...] 첫 번째가 지휘관
     * @param array<string,array{0:int,1:int}>|null $positions key => [x,y] (null이면 봇 휴리스틱 배치)
     */
    public static function addSide(Engine $engine, array &$state, string $side, array $heroEntries, array $troopTypes, array $zone, ?array $positions, float $troopGrowth, ?array $troopsByEntry = null): void
    {
        $rules = $engine->rules();
        if ($positions === null) {
            $items = [];
            foreach ($heroEntries as $i => $e) {
                $items[] = ['key' => $e['key'], 'type' => $e['row']['unit_type'], 'commander' => $i === 0];
            }
            $positions = BotDeployer::place($engine, $state, $side, $zone, $items);
        }
        $initFacing = self::initialFacing($state, $zone);
        $idx = 0;
        $heroXY = [];
        $cmdXY = null;
        $level = $heroEntries[0]['level'];
        foreach ($heroEntries as $i => $e) {
            [$x, $y] = $positions[$e['key']];
            $id = $side.$idx++;
            $state['units'][$id] = self::makeUnit($rules, $id, $side, $i === 0 ? 'commander' : 'hero', $e['row']['unit_type'], self::withDefaultActives($e['row'], $e['row']['unit_type'], $side), $e['level'], $x, $y, $troopGrowth, null, $state['mp_knobs'] ?? null, self::heroVariant($state, $e['row'], 'self'));
            if (isset($state['units'][$id]['equip_total'])) {   // 전투 생성 시점 장비 합계(적용값) 기록: 진행 중 장착 변경은 영향 없음
                $state['equip_applied'][$id] = $state['units'][$id]['equip_total'] + ['hero' => $e['row']['code']];
            }
            $heroXY[$i] = [$x, $y];
            if (Engine::squadOn($state)) {   // squad on: 영웅은 leader_id=null, 비지휘 영웅도 본인 오라 데이터를 가짐
                $state['units'][$id]['leader_id'] = null;
            }
            if ($i === 0) {
                $cmdXY = [$x, $y];
            }
        }
        if ($troopsByEntry !== null && Engine::squadOn($state)) {
            // squad on: 영웅마다 자기 부대를 생성(leader_id=영웅 id). 영웅별 인접 칸 우선, 라운드로빈으로 번갈아 배치, 자리가 없으면 해당 부대는 생략(예외 없음)
            $taken = [];
            foreach ($state['units'] as $u0) {
                $taken["{$u0['x']},{$u0['y']}"] = true;
            }
            $cells = [];
            foreach ($heroXY as $hi => [$hx, $hy]) {
                $c = $zone;
                $fw = self::forwardVector($state, $zone);   // 같은 거리면 적 쪽(앞) 칸 우선 -> 뒤 모서리 군집 방지
                usort($c, fn ($a, $b) => [self::distXY($a, $hx, $hy), -($a[0] * $fw[0] + $a[1] * $fw[1]), $a[0], $a[1]] <=> [self::distXY($b, $hx, $hy), -($b[0] * $fw[0] + $b[1] * $fw[1]), $b[0], $b[1]]);
                $cells[$hi] = $c;
            }
            // 위치가 지정된 부대(['type','x','y'])를 먼저 배치(검증은 배치 제출 단계에서 끝남; 칸이 막혔으면 자동 배치로 되돌림), 나머지는 문자열 큐
            $queues = [];
            foreach ($troopsByEntry as $hi => $list) {
                $queues[$hi] = [];
                foreach (array_values($list) as $item) {
                    if (is_array($item)) {
                        $moveType = $rules->unitType($item['type'])['move_type'];
                        if (! isset($taken["{$item['x']},{$item['y']}"]) && $engine->passable($state, $moveType, $item['x'], $item['y'])) {
                            $taken["{$item['x']},{$item['y']}"] = true;
                            $id = $side.$idx++;
                            $state['units'][$id] = self::makeUnit($rules, $id, $side, 'troop', $item['type'], null, $heroEntries[$hi]['level'], $item['x'], $item['y'], $troopGrowth, $heroEntries[$hi]['row']['culture'] ?? null, null, self::heroVariant($state, $heroEntries[$hi]['row'], 'troop'));
                            $state['units'][$id]['leader_id'] = $side.$hi;
                        } else {
                            $queues[$hi][] = $item['type'];
                        }
                    } else {
                        $queues[$hi][] = $item;
                    }
                }
            }
            while (array_filter($queues)) {
                foreach ($queues as $hi => $q) {
                    if (! $q) {
                        continue;
                    }
                    $type = array_shift($queues[$hi]);
                    $moveType = $rules->unitType($type)['move_type'];
                    // 1차: 이동 가능한 인접 빈 칸을 최소 N칸 남기는 칸만(영웅·병사가 서로를 가두지 않게), 2차: 규칙 없이 가장 가까운 빈 칸(자리가 없어도 부대 생략 방지)
                    try {
                        $minFree = max(0, (int) config('game.deploy_min_free_adjacent', 2));
                    } catch (\Throwable) {
                        $minFree = 2;   // 순수 PHP(앱 컨테이너 없음) 단위 테스트 기본값
                    }
                    $strict = array_values(array_filter($cells[$hi] ?? [], fn ($c) => ! isset($taken["{$c[0]},{$c[1]}"]) && $engine->passable($state, $moveType, $c[0], $c[1]) && self::keepsMobility($engine, $state, $side, $taken, $c[0], $c[1], $moveType, $minFree)));
                    foreach ($strict !== [] ? [$strict[0]] : ($cells[$hi] ?? []) as [$cx, $cy]) {
                        if (! isset($taken["$cx,$cy"]) && $engine->passable($state, $moveType, $cx, $cy)) {
                            $taken["$cx,$cy"] = true;
                            $id = $side.$idx++;
                            $state['units'][$id] = self::makeUnit($rules, $id, $side, 'troop', $type, null, $heroEntries[$hi]['level'], $cx, $cy, $troopGrowth, $heroEntries[$hi]['row']['culture'] ?? null, null, self::heroVariant($state, $heroEntries[$hi]['row'], 'troop'));
                            $state['units'][$id]['leader_id'] = $side.$hi;
                            break;
                        }
                    }
                }
            }
            $troopTypes = [];   // 기존 단일 부대 경로는 건너뜀
        }
        foreach (self::autoPlaceTroops($engine, $state, $zone, $cmdXY, $troopTypes) as $i => [$x, $y]) {
            $id = $side.$idx++;
            $state['units'][$id] = self::makeUnit($rules, $id, $side, 'troop', $troopTypes[$i], null, $level, $x, $y, $troopGrowth, $heroEntries[0]['row']['culture'] ?? null, null, self::heroVariant($state, $heroEntries[0]['row'], 'troop'));   // 부대는 지휘관 culture
            Engine::squadOn($state) && $state['units'][$id]['leader_id'] = $side.'0';   // 이번 증분: 부대는 모두 지휘관(첫 영웅) 소속
        }
        if (Engine::squadOn($state)) {   // 비지휘 영웅의 오라는 소속 부대가 1기 이상 있을 때만 부여(부대 없는 영웅의 자기 버프 방지)
            foreach ($heroEntries as $hi => $e) {
                $hid = $side.$hi;
                if ($hi > 0 && ($e['row']['aura'] ?? null) && array_filter($state['units'], fn ($u) => ($u['leader_id'] ?? null) === $hid)) {
                    $state['units'][$hid]['aura'] = $e['row']['aura'];
                }
            }
        }
        if ($initFacing !== null) {
            foreach ($state['units'] as $uid => $uu) {
                if ($uu['side'] === $side) {
                    $state['units'][$uid]['facing'] = $initFacing;
                }
            }
        }
        $state['init_hp'][$side] = array_sum(array_column(array_filter($state['units'], fn ($u) => $u['side'] === $side), 'max_hp'));
    }

    /** 영웅 지정 변형(hero_variants.json). 랭크전 등 state.no_variants 면 null(기본 병종). 병사 변형은 병사 병종이 변형 base_type 과 같을 때만 makeUnit 이 적용 */
    private static function heroVariant(array $state, array $row, string $kind): ?string
    {
        return ! empty($state['no_variants']) ? null : UnitVariants::forHero($row['code'] ?? null, $kind);
    }

    /** 영웅 없는 일반 지휘관 진영의 총 유닛 상한(지휘관 포함). 초과 부대는 잘라낸다. */
    public const GENERIC_MAX_UNITS = 16;

    /** 진영 유닛 하드 상한(config game.max_units_hard_cap, 기본 GENERIC_MAX_UNITS): 스테이지 적 편성·편성 상한의 천장. 하한 1 */
    public static function unitHardCap(): int
    {
        return max(1, (int) config('game.max_units_hard_cap', self::GENERIC_MAX_UNITS));
    }

    /** 스테이지 적 초기 편성 상한(config game.max_units_enemy_stage, 아군 한도와 분리). 하드 상한을 넘지 못한다 */
    public static function enemyStageCap(): int
    {
        return max(1, min(self::unitHardCap(), (int) config('game.max_units_enemy_stage', 24)));
    }

    /** 스테이지(캠페인) 전투 아군 배치 상한(config game.max_units_per_side_stage). 하드 상한을 넘지 못한다 */
    public static function allyStageCap(): int
    {
        return max(1, min(self::unitHardCap(), (int) config('game.max_units_per_side_stage', 24)));
    }

    /**
     * 봇/적 진영 병종 정규화: 영웅에 고정 병종(troop_type)이 있으면 병사 수(슬롯)는 유지한 채 전부 그 병종 1종으로 바꾼다.
     * 고정 병종이 없으면(null) 입력 목록 그대로. 프리셋/enemy_extra_troops의 병종 지정보다 영웅 고정 병종이 우선한다.
     *
     * @param  string[]  $types
     * @return string[]
     */
    public static function fixedTypesFor(array $hero, array $types): array
    {
        $t = $hero['troop_type'] ?? null;

        // 병종 v2: 퇴역 병종(heavy)은 대체 병종(sword)으로 해석한다(DB 이관 전이어도 보병으로 동작)
        is_string($t) && $t !== '' && ($t = (string) (config('game.retired_unit_types')[$t] ?? $t));

        return is_string($t) && $t !== '' ? array_fill(0, count($types), $t) : array_values($types);
    }

    /**
     * 영웅 없는 일반 지휘관 + 가변 부대 진영 생성(스테이지 적 / 시뮬레이터 공용).
     * squad = {commander:{display_name_ko, unit_type, hp_mult, atk_mult, def_mult, aura(null|{radius,atk_pct,def_pct}), skills(무시)}, units:string[]}
     * 배치: 지휘관=spawns[0](통행 불가면 첫 통행 가능 칸), 부대=남은 spawns 순서 -> 배치 영역 칸을 지휘관 거리·좌표순(결정적)으로.
     * 칸이 모자라거나 상한 초과로 생략된 부대 수는 반환한다(예외 없음).
     *
     * @param  array<int,array{0:int,1:int}>  $spawns
     * @param  array<int,array{0:int,1:int}>  $zone
     * @return array{placed:int,skipped:int}
     */
    public static function addGenericSide(Engine $engine, array &$state, string $side, array $squad, int $level, array $spawns, array $zone, float $troopGrowth, array $namedZones = [], ?\Closure $heroRow = null): array
    {
        $rules = $engine->rules();
        $c = $squad['commander'];
        // 지휘관 단위 단일 병종(ch1 v2): troop_type(생략 시 unit_type) 1종으로 지휘관 병종과 모든 units[]를 정규화(길이 유지). 혼합 입력이면 경고 로그. hp/atk/def_mult는 지휘관에만 적용
        $cType = (string) ($c['troop_type'] ?? $c['unit_type']);
        $cul = $c['culture'] ?? $squad['culture'] ?? null;   // 문화권 세트 id(enemy_squad.culture 또는 commander.culture): 스프라이트 세트 선택용
        $rawUnits = array_values($squad['units'] ?? []);
        if (array_filter($rawUnits, fn ($t) => (string) $t !== $cType)) {
            \Illuminate\Support\Facades\Log::warning('addGenericSide: 혼합 병종 입력을 지휘관 단일 병종으로 정규화', ['commander' => $cType, 'units' => $rawUnits]);
        }
        $units = array_slice(array_fill(0, count($rawUnits), $cType), 0, self::enemyStageCap() - 1);
        $skipped = count($squad['units'] ?? []) - count($units);
        $taken = [];
        foreach ($state['units'] as $u0) {
            $taken["{$u0['x']},{$u0['y']}"] = true;
        }
        $anchor = null;   // 후보 칸이 모자랄 때 지휘관 주변 맵 전체에서 가까운 통행 칸으로 확장(배치 영역보다 편성이 클 때)
        $free = function (string $type, array $cells) use ($engine, &$state, &$taken, $rules, &$anchor): ?array {
            $mt = $rules->unitType($type)['move_type'];
            foreach ($cells as [$x, $y]) {
                if (! isset($taken["$x,$y"]) && $engine->passable($state, $mt, $x, $y)) {
                    $taken["$x,$y"] = true;

                    return [$x, $y];
                }
            }
            if ($anchor !== null) {
                $all = [];
                for ($yy = 0; $yy < $state['height']; $yy++) {
                    for ($xx = 0; $xx < $state['width']; $xx++) {
                        if (! isset($taken["$xx,$yy"]) && $engine->passable($state, $mt, $xx, $yy)) {
                            $all[] = [self::distXY([$xx, $yy], $anchor[0], $anchor[1]), $xx, $yy];
                        }
                    }
                }
                sort($all);
                if ($all) {
                    $taken["{$all[0][1]},{$all[0][2]}"] = true;

                    return [$all[0][1], $all[0][2]];
                }
            }

            return null;
        };
        $mainCells = self::validCells($squad['cells'] ?? [], $state);   // v3: 부대 좌표(cells, 첫 칸=지휘관). 없으면 기존 규칙(spawns -> zone)
        $cxy = $free($cType, array_merge($mainCells, $spawns, $zone)) ?? throw new IllegalAction('no_space_for_enemy', '적 지휘관을 배치할 칸이 없습니다.', 500);
        $cmd = self::makeUnit($rules, $side.'0', $side, 'commander', $cType, self::enemySkillRow($c, $cType, $troopGrowth, $heroRow), $level, $cxy[0], $cxy[1], $troopGrowth, $cul, $state['mp_knobs'] ?? null, $c['variant'] ?? null);   // 스테이지 명시 변형(commander.variant)
        $cmd['hp'] = $cmd['max_hp'] = max(1, (int) round($cmd['max_hp'] * (float) ($c['hp_mult'] ?? 1.0)));
        $cmd['atk'] = max(1, (int) round($cmd['atk'] * (float) ($c['atk_mult'] ?? 1.0)));
        $cmd['def'] = max(0, (int) round($cmd['def'] * (float) ($c['def_mult'] ?? 1.0)));
        $cmd['name'] = (string) ($c['display_name_ko'] ?? $cmd['name']);
        $a = $c['aura'] ?? null;
        $cmd['aura'] = is_array($a) && isset($a['radius'], $a['atk_pct'], $a['def_pct']) ? ['radius' => (int) $a['radius'], 'atk_pct' => (float) $a['atk_pct'], 'def_pct' => (float) $a['def_pct']] : null;
        self::applyNpcRef($cmd, $c);
        $mainRoute = RouteAi::normalize($squad['route'] ?? null);   // 적 부대 경로 이동 AI(없으면 현행 휴리스틱)
        $mainRoute !== null && $cmd['route'] = $mainRoute + ['i' => 0];
        $mainHold = ($squad['apply_main_hold'] ?? false) === true ? ($squad['hold_until_turn'] ?? null) : null;   // 옵트인: main 부대 대기. enemy_squad.apply_main_hold=true 일 때만 hold_until_turn(1~99) 적용(기본은 무시 = 기존 동작)
        $mainHold = is_int($mainHold) && $mainHold >= 1 && $mainHold <= 99 ? $mainHold : null;
        $mainHold !== null && $cmd['hold_until_turn'] = $mainHold;
        ($fm = \App\Game\Micro\FormationBook::normalize($squad['formation'] ?? null)) !== null && $cmd['formation'] = $fm;   // 적 부대 진형(스테이지 데이터 formation, 없으면 기본 배치)
        $state['units'][$side.'0'] = $cmd;
        $anchor = [$cxy[0], $cxy[1]];
        $rest = array_values(array_filter($zone, fn ($z) => ! isset($taken["{$z[0]},{$z[1]}"])));
        usort($rest, fn ($p, $q) => [self::distXY($p, $cxy[0], $cxy[1]), $p[0], $p[1]] <=> [self::distXY($q, $cxy[0], $cxy[1]), $q[0], $q[1]]);
        $cells = array_merge($mainCells, $spawns, $rest);
        $n = 1;
        foreach ($units as $type) {
            $type = (string) $type;
            $xy = $free($type, $cells);
            if ($xy === null) {
                $skipped++;

                continue;
            }
            $id = $side.$n++;
            $state['units'][$id] = self::makeUnit($rules, $id, $side, 'troop', $type, null, $level, $xy[0], $xy[1], $troopGrowth, $cul, null, $squad['variant'] ?? null);   // squad.variant = 병사 변형
            self::applySoldierName($state['units'][$id], $squad);
            $fm !== null && $state['units'][$id]['formation'] = $fm;
            self::applyTroopLook($state['units'][$id], $squad, $c);
            $mainRoute !== null && $state['units'][$id]['route'] = $mainRoute + ['i' => 0];
            $mainHold !== null && $state['units'][$id]['hold_until_turn'] = $mainHold;
        }
        // 추가 부대(squads[]): 부대별 지휘관(kind=hero, 사망 시 소속 병사 붕괴) + 병사 N + 선택 배치 구역(zone 이름 -> $namedZones). 총 유닛은 unitHardCap까지
        $leaders = [];
        $cap = self::enemyStageCap();
        foreach (array_values($squad['squads'] ?? []) as $sq) {
            $sc = $sq['commander'] ?? null;
            $count = count(array_filter($state['units'], fn ($u) => $u['side'] === $side));
            if (! is_array($sc) || ! isset($sc['unit_type']) || $count >= $cap) {
                $skipped += 1 + count($sq['units'] ?? []);

                continue;
            }
            $sType = (string) ($sc['troop_type'] ?? $sc['unit_type']);
            $sCul = $sc['culture'] ?? $cul;
            $pool = array_merge(self::validCells($sq['cells'] ?? [], $state), $namedZones[$sq['zone'] ?? ''] ?? [], $cells);   // cells(v3 좌표) > 이름 구역 > 기본 칸
            $sxy = $free($sType, $pool);
            if ($sxy === null) {
                $skipped += 1 + count($sq['units'] ?? []);

                continue;
            }
            $sid = $side.$n++;
            $su = self::makeUnit($rules, $sid, $side, 'hero', $sType, self::enemySkillRow($sc, $sType, $troopGrowth, $heroRow), $level, $sxy[0], $sxy[1], $troopGrowth, $sCul, $state['mp_knobs'] ?? null, $sc['variant'] ?? null);
            $su['hp'] = $su['max_hp'] = max(1, (int) round($su['max_hp'] * (float) ($sc['hp_mult'] ?? 1.0)));
            $su['atk'] = max(1, (int) round($su['atk'] * (float) ($sc['atk_mult'] ?? 1.0)));
            $su['def'] = max(0, (int) round($su['def'] * (float) ($sc['def_mult'] ?? 1.0)));
            $su['name'] = (string) ($sc['display_name_ko'] ?? $su['name']);
            $sa = $sc['aura'] ?? null;
            $su['aura'] = is_array($sa) && isset($sa['radius'], $sa['atk_pct'], $sa['def_pct']) ? ['radius' => (int) $sa['radius'], 'atk_pct' => (float) $sa['atk_pct'], 'def_pct' => (float) $sa['def_pct']] : null;
            self::applyNpcRef($su, $sc);
            $hold = $sq['hold_until_turn'] ?? null;   // 부대 단위 대기: 이 라운드 전까지 제자리(HeuristicBot 이 행동을 건너뜀). 지휘관·소속 병사 모두 적용
            $holdOk = is_int($hold) && $hold >= 1 && $hold <= 99;
            $holdOk && $su['hold_until_turn'] = $hold;
            $subRoute = RouteAi::normalize($sq['route'] ?? null);
            $subRoute !== null && $su['route'] = $subRoute + ['i' => 0];
            ($sfm = \App\Game\Micro\FormationBook::normalize($sq['formation'] ?? null)) !== null && $su['formation'] = $sfm;
            $state['units'][$sid] = $su;
            $room = max(0, $cap - $count - 1);
            $subUnits = array_slice(array_fill(0, count($sq['units'] ?? []), $sType), 0, $room);
            $skipped += count($sq['units'] ?? []) - count($subUnits);
            $saveAnchor = $anchor;
            $anchor = [$sxy[0], $sxy[1]];
            foreach ($subUnits as $t) {
                $txy = $free($t, $pool);
                if ($txy === null) {
                    $skipped++;

                    continue;
                }
                $tid = $side.$n++;
                $state['units'][$tid] = self::makeUnit($rules, $tid, $side, 'troop', $t, null, $level, $txy[0], $txy[1], $troopGrowth, $sCul, null, $sq['variant'] ?? null);
                $holdOk && $state['units'][$tid]['hold_until_turn'] = $hold;
                $sfm !== null && $state['units'][$tid]['formation'] = $sfm;
                $subRoute !== null && $state['units'][$tid]['route'] = $subRoute + ['i' => 0];
                self::applySoldierName($state['units'][$tid], $sq);
                self::applyTroopLook($state['units'][$tid], $sq, $sc);
                $leaders[$tid] = $sid;
            }
            $anchor = $saveAnchor;
        }
        if (Engine::squadOn($state)) {
            foreach ($state['units'] as $uid => $u) {
                if ($u['side'] === $side) {
                    $state['units'][$uid]['leader_id'] = $u['kind'] === 'troop' ? ($leaders[$uid] ?? $side.'0') : null;
                }
            }
        }
        if (($f = self::initialFacing($state, $zone)) !== null) {
            foreach ($state['units'] as $uid => $u) {
                if ($u['side'] === $side) {
                    $state['units'][$uid]['facing'] = $f;
                }
            }
        }
        $state['init_hp'][$side] = array_sum(array_column(array_filter($state['units'], fn ($u) => $u['side'] === $side), 'max_hp'));

        return ['placed' => $n, 'skipped' => $skipped];
    }

    /** 스테이지 데이터 좌표 목록 정규화: [x,y] 정수 쌍이고 맵 안인 것만(통행 여부는 free()가 병종별로 검사) */
    private static function validCells(mixed $cells, array $state): array
    {
        $out = [];
        foreach ((array) $cells as $c) {
            if (is_array($c) && count($c) === 2 && is_int($c[0]) && is_int($c[1]) && $c[0] >= 0 && $c[1] >= 0 && $c[0] < $state['width'] && $c[1] < $state['height']) {
                $out[] = [$c[0], $c[1]];
            }
        }

        return $out;
    }

    /** 배치 영역 중심에서 맵 중심(적 쪽)으로 향하는 우세 축 단위 벡터 [dx,dy] (영역이 맵 중앙이면 [0,0]) */
    public static function forwardVector(array $state, array $zone): array
    {
        if (! $zone) {
            return [0, 0];
        }
        $zx = array_sum(array_column($zone, 0)) / count($zone) - ($state['width'] - 1) / 2;
        $zy = array_sum(array_column($zone, 1)) / count($zone) - ($state['height'] - 1) / 2;
        if (abs($zx) < 1e-9 && abs($zy) < 1e-9) {
            return [0, 0];
        }

        return abs($zx) >= abs($zy) ? [$zx > 0 ? -1 : 1, 0] : [0, $zy > 0 ? -1 : 1];
    }

    /** ($cx,$cy)에 병사를 놓은 뒤에도 인접한 같은 진영 유닛과 새 병사가 각자 min(N, 자기 이동 가능 인접 칸 수)만큼 빈 인접 칸을 유지하는가 */
    private static function keepsMobility(Engine $engine, array $state, string $side, array $taken, int $cx, int $cy, string $moveType, int $minFree): bool
    {
        if ($minFree <= 0) {
            return true;
        }
        $taken["$cx,$cy"] = true;
        $check = [[$cx, $cy, $moveType]];
        foreach ($state['units'] as $u) {
            if ($u['side'] === $side && abs($u['x'] - $cx) + abs($u['y'] - $cy) === 1) {
                $check[] = [$u['x'], $u['y'], $engine->rules()->unitType($u['type'])['move_type']];
            }
        }
        foreach ($check as [$x, $y, $mt]) {
            $total = 0;
            $free = 0;
            foreach ([[1, 0], [-1, 0], [0, 1], [0, -1]] as [$dx, $dy]) {
                $nx = $x + $dx;
                $ny = $y + $dy;
                if (! $engine->inBounds($state, $nx, $ny) || ! $engine->passable($state, $mt, $nx, $ny)) {
                    continue;
                }
                $total++;
                if (! isset($taken["$nx,$ny"])) {
                    $free++;
                }
            }
            if ($free < min($minFree, $total)) {
                return false;
            }
        }

        return true;
    }

    /**
     * 기본(자동) 영웅 배치: 배치 영역 안에서 영웅을 앞열(적 쪽 2열)의 서로 다른 레인으로 고르게 퍼뜨린다(지휘관=가운데 레인).
     * 병사는 addSide가 영웅 반경 안에서 인접 이동 공간을 남기며 배치한다. 칸이 모자라면 영역 순서로 채움.
     *
     * @param  array<int,string>  $moveTypes 영웅 순서별 move_type
     * @return array<int,array{0:int,1:int}> 영웅 순서 => [x,y]
     */
    public static function spreadHeroPositions(Engine $engine, array $state, array $zone, array $moveTypes): array
    {
        $n = count($moveTypes);
        $fw = self::forwardVector($state, $zone);
        $prog = fn (array $c) => $c[0] * $fw[0] + $c[1] * $fw[1];
        $perp = fn (array $c) => $fw[0] !== 0 ? $c[1] : $c[0];
        $max = $zone ? max(array_map($prog, $zone)) : 0;
        $front = array_values(array_filter($zone, fn ($c) => $prog($c) >= $max - 1));   // 적 쪽 2열
        usort($front, fn ($a, $b) => [$perp($a), -$prog($a)] <=> [$perp($b), -$prog($b)]);
        $lanes = [];
        foreach ($front as $c) {
            $lanes[$perp($c)][] = $c;   // 레인(가로/세로 줄)별 후보, 맨 앞 칸 먼저
        }
        ksort($lanes);
        $laneKeys = array_keys($lanes);
        $m = count($laneKeys);
        // 레인 선택: n명을 m개 레인에 균등 분산, 지휘관(0)이 가운데 레인
        $pick = [];
        for ($k = 0; $k < $n && $m > 0; $k++) {
            $pick[$k] = $laneKeys[(int) round(($k + 0.5) * $m / max(1, $n) - 0.5)];
        }
        $order = $n > 0 ? self::centerOut($n) : [];   // 지휘관이 가운데 레인이 되도록 슬롯 순서
        $out = [];
        $taken = [];
        foreach ($order as $rank => $heroIdx) {
            $lane = $pick[$rank] ?? null;
            $cands = $lane !== null ? $lanes[$lane] : [];
            foreach (array_merge($cands, $zone) as [$x, $y]) {
                if (! isset($taken["$x,$y"]) && $engine->passable($state, $moveTypes[$heroIdx], $x, $y) && $engine->unitAt($state, $x, $y) === null) {
                    $taken["$x,$y"] = true;
                    $out[$heroIdx] = [$x, $y];
                    break;
                }
            }
        }
        ksort($out);

        return $out;
    }

    /** 0..n-1 중 가운데부터 바깥으로 번갈아 나열한 인덱스(rank -> 영웅 index는 아님: 반환[rank]=heroIdx, rank는 레인 순서) */
    private static function centerOut(int $n): array
    {
        // 레인 순서 rank 0..n-1(위->아래)에 영웅 인덱스를 배정: 영웅 0(지휘관)=가운데, 1,2,...는 가운데에서 번갈아 바깥
        $center = intdiv($n - 1, 2);
        $ranks = [$center];
        for ($d = 1; count($ranks) < $n; $d++) {
            foreach ([$center + $d, $center - $d] as $r) {
                if ($r >= 0 && $r < $n && count($ranks) < $n) {
                    $ranks[] = $r;
                }
            }
        }
        $out = [];
        foreach ($ranks as $heroIdx => $rank) {
            $out[$rank] = $heroIdx;
        }
        ksort($out);

        return $out;
    }

    private static function distXY(array $c, int $x, int $y): int
    {
        return abs($c[0] - $x) + abs($c[1] - $y);
    }

    /** @var ?array stage_companions.json 캐시 */
    private static ?array $companionFile = null;

    /** 동반 일반병 설정(config game.companions + database/data/stage_companions.json 스테이지별 예외). 꺼져 있으면 enabled=false */
    public static function companionSettings(string $stageCode): array
    {
        try {
            $cfg = (array) config('game.companions', []);
        } catch (\Throwable) {
            $cfg = [];   // 순수 PHP 단위 테스트: 비활성
        }
        if (empty($cfg['enabled'])) {
            return ['enabled' => false];
        }
        self::$companionFile ??= (json_decode((string) @file_get_contents(database_path('data/stage_companions.json')), true) ?: []);
        $max = max(0, min(4, (int) ($cfg['max'] ?? 4)));
        $o = self::$companionFile['stages'][$stageCode] ?? [];

        return [
            'enabled' => true, 'max' => $max,
            'enemy' => min($max, max(0, (int) ($o['enemy'] ?? $cfg['enemy_target'] ?? 3))), 'enemy_by_index' => (array) ($o['enemy_by_index'] ?? []),
            'ally' => min($max, max(0, (int) ($o['ally'] ?? $cfg['ally_target'] ?? 3))), 'ally_by_hero' => (array) ($o['ally_by_hero'] ?? []),
            'ally_exclude' => (array) (self::$companionFile['ally_exclude_heroes'] ?? []),
        ];
    }

    /**
     * 적 편성(enemy_squad)의 영웅(지휘관=0, squads[i]=i+1)마다 일반병이 target기 미만이면 그 영웅 병종으로 채운 사본을 돌려준다.
     * 이미 target 이상이면 그대로, 힐러 영웅은 제외, 진영 총 유닛은 enemyStageCap 이내(라운드로빈 배분, 남는 예산 없으면 중단).
     *
     * @return array{0:array,1:array{added:int,budget_short:int}}
     */
    public static function withEnemyCompanions(array $squad, array $set): array
    {
        $rep = ['added' => 0, 'budget_short' => 0];
        if (empty($set['enabled']) || ! isset($squad['commander']['unit_type'])) {
            return [$squad, $rep];
        }
        $heroes = [0 => ['t' => (string) ($squad['commander']['troop_type'] ?? $squad['commander']['unit_type']), 'n' => count($squad['units'] ?? [])]];
        foreach (array_values($squad['squads'] ?? []) as $i => $sq) {
            if (is_array($sq['commander'] ?? null) && isset($sq['commander']['unit_type'])) {
                $heroes[$i + 1] = ['t' => (string) ($sq['commander']['troop_type'] ?? $sq['commander']['unit_type']), 'n' => count($sq['units'] ?? [])];
            }
        }
        $used = count($heroes) + array_sum(array_column($heroes, 'n'));
        $budget = max(0, self::enemyStageCap() - $used);
        $want = [];
        foreach ($heroes as $k => $h) {
            $target = min((int) $set['max'], max(0, (int) ($set['enemy_by_index'][(string) $k] ?? $set['enemy'])));
            $want[$k] = $h['t'] === 'healer' ? 0 : max(0, $target - $h['n']);
        }
        $add = array_fill_keys(array_keys($heroes), 0);
        while ($budget > 0 && array_sum($want) > 0) {
            foreach ($want as $k => $w) {
                if ($w > 0 && $budget > 0) {
                    $add[$k]++;
                    $want[$k]--;
                    $budget--;
                }
            }
        }
        $rep['budget_short'] = array_sum($want);
        foreach ($add as $k => $n) {
            if ($n <= 0) {
                continue;
            }
            $extra = array_fill(0, $n, $heroes[$k]['t']);
            if ($k === 0) {
                $squad['units'] = array_merge(array_values($squad['units'] ?? []), $extra);
            } else {
                $squad['squads'][$k - 1]['units'] = array_merge(array_values($squad['squads'][$k - 1]['units'] ?? []), $extra);
            }
            $rep['added'] += $n;
        }

        return [$squad, $rep];
    }

    /**
     * 아군 NPC 영웅 1기 주변(맨해튼 반경 4, 거리·좌표순 결정적)에 일반병 $count기 생성(npc_ally=true, AI 조종, leader_id=영웅).
     * 칸 부족/진영 유닛 하드 상한이면 남은 수는 건너뛴다. @return array{added:int,skipped:int}
     */
    private static function addNpcCompanions(Engine $engine, array &$state, string $side, string $heroId, array $row, string $heroType, int $level, float $troopGrowth, int $count): array
    {
        $rules = $engine->rules();
        $t = (string) ($row['troop_type'] ?? $heroType);
        (! isset($rules->unitTypes[$t]) || $t === 'healer') && $t = 'sword';
        $hero = $state['units'][$heroId];
        $moveType = $rules->unitType($t)['move_type'];
        $cells = [];
        for ($dy = -4; $dy <= 4; $dy++) {
            for ($dx = -4; $dx <= 4; $dx++) {
                $d = abs($dx) + abs($dy);
                if ($d >= 1 && $d <= 4) {
                    $cells[] = [$d, $hero['x'] + $dx, $hero['y'] + $dy];
                }
            }
        }
        sort($cells);
        $added = 0;
        foreach ($cells as [, $cx, $cy]) {
            if ($added >= $count || count(array_filter($state['units'], fn ($u) => $u['side'] === $side)) >= self::unitHardCap()) {
                break;
            }
            if (! $engine->inBounds($state, $cx, $cy) || ! $engine->passable($state, $moveType, $cx, $cy) || $engine->unitAt($state, $cx, $cy) !== null) {
                continue;
            }
            $id = $heroId.'t'.($added + 1);
            $u = self::makeUnit($rules, $id, $side, 'troop', $t, null, $level, $cx, $cy, $troopGrowth, $row['culture'] ?? null);
            $u['npc_ally'] = true;
            Engine::squadOn($state) && $u['leader_id'] = $heroId;
            ($hero['facing'] ?? null) !== null && $u['facing'] = $hero['facing'];
            $state['units'][$id] = $u;
            $state['init_hp'][$side] = ($state['init_hp'][$side] ?? 0) + $u['max_hp'];
            $added++;
        }

        return ['added' => $added, 'skipped' => $count - $added];
    }

    /**
     * 스테이지 아군 NPC(rules.ally_npcs) 생성: $side 진영 영웅 유닛(kind hero, npc_ally=true, id n0..), 동반 일반병은 $companions 가 있을 때만(addNpcCompanions, id n<i>t<k>).
     * 지정 칸이 막혔으면 맨해튼 반경 6 안에서 가장 가까운 빈 통행 칸(결정적). side b면 x,y 대신 $zone 첫 칸을 기준점으로 쓴다(시뮬레이터용 대칭 근사).
     * 실전(BattleService)과 시뮬레이터(Duel)가 공용으로 쓴다.
     *
     * @param  array<int,array>  $npcs Engine::normalizeAllyNpcs 결과
     * @param  \Closure  $heroRow fn(string $code): ?array  영웅 행(hp_bonus·skills 등 포함)
     * @param  ?\Closure  $companions  fn(string $heroCode, array $npc): int  NPC 영웅당 동반 일반병 수(null=동반 없음 = 기존 동작)
     * @return array{added:int,skipped:int}
     */
    public static function addAllyNpcs(Engine $engine, array &$state, array $npcs, string $side, \Closure $heroRow, int $defaultLevel, float $troopGrowth, array $zone, ?\Closure $companions = null): array
    {
        $rep = ['added' => 0, 'skipped' => 0];
        $rules = $engine->rules();
        $facing = self::initialFacing($state, $zone);
        foreach ($npcs as $i => $n) {
            if (($dupId = self::samePersonOnSide($state, $side, $n['hero'])) !== null) {   // 플레이어가 같은 인물의 실제 영웅을 출전시켰으면 NPC 지원은 배치하지 않는다(중복 방지). must_survive 는 실제 영웅이 이어받음
                $n['must_survive'] && $state['units'][$dupId]['must_survive'] = true;
                $rep['deduped'] = ($rep['deduped'] ?? 0) + 1;

                continue;
            }
            $row = $heroRow($n['hero']);
            if (! $row) {
                continue;
            }
            $type = $n['unit_type'] !== null && isset($rules->unitTypes[$n['unit_type']]) ? $n['unit_type'] : $row['unit_type'];
            $moveType = $rules->unitType($type)['move_type'];
            [$ax, $ay] = $side === 'a' || $zone === [] ? [$n['x'], $n['y']] : [$zone[0][0], $zone[0][1]];
            $cell = null;
            for ($r = 0; $r <= 6 && $cell === null; $r++) {
                for ($dy = -$r; $dy <= $r && $cell === null; $dy++) {
                    for ($dx = -$r; $dx <= $r; $dx++) {
                        if (abs($dx) + abs($dy) !== $r) {
                            continue;
                        }
                        [$cx, $cy] = [$ax + $dx, $ay + $dy];
                        if ($engine->inBounds($state, $cx, $cy) && $engine->passable($state, $moveType, $cx, $cy) && $engine->unitAt($state, $cx, $cy) === null) {
                            $cell = [$cx, $cy];
                            break;
                        }
                    }
                }
            }
            if ($cell === null) {
                continue;
            }
            $id = 'n'.$i;
            $u = self::makeUnit($rules, $id, $side, 'hero', $type, self::withDefaultActives($row, $type, $side), $n['level'] ?? $defaultLevel, $cell[0], $cell[1], $troopGrowth, null, $state['mp_knobs'] ?? null);
            $u['npc_ally'] = true;
            $n['must_survive'] && $u['must_survive'] = true;
            isset($n['route']) && $u['route'] = $n['route'] + ['i' => 0];   // 경로 이동 AI(RouteAi): BattleService::allyPhase 가 봇 대신 사용
            Engine::squadOn($state) && $u['leader_id'] = null;
            $facing !== null && $u['facing'] = $facing;
            $state['units'][$id] = $u;
            $state['init_hp'][$side] = ($state['init_hp'][$side] ?? 0) + $u['max_hp'];
        }
        // 동반 일반병은 모든 NPC 영웅을 먼저 놓은 뒤 생성(지정 칸 충돌 방지). 영웅 id 는 n<i>, 병사 id 는 n<i>t<k>
        if ($companions !== null) {
            foreach ($npcs as $i => $n) {
                $hid = 'n'.$i;
                $cnt = isset($state['units'][$hid]) ? (int) $companions($n['hero'], $n) : 0;
                if ($cnt > 0) {
                    $r = self::addNpcCompanions($engine, $state, $side, $hid, $heroRow($n['hero']), $state['units'][$hid]['type'], $state['units'][$hid]['level'], $troopGrowth, $cnt);
                    $rep['added'] += $r['added'];
                    $rep['skipped'] += $r['skipped'];
                }
            }
        }

        return $rep;
    }

    /** 방향 시스템 on일 때 배치 영역 기준 초기 facing(적 진영=맵 반대편 방향의 우세 축). off/영역 없음이면 null */
    public static function initialFacing(array $state, array $zone): ?string
    {
        if (! Engine::facingOn($state) || ! $zone) {
            return null;
        }
        $zx = array_sum(array_column($zone, 0)) / count($zone) - ($state['width'] - 1) / 2;
        $zy = array_sum(array_column($zone, 1)) / count($zone) - ($state['height'] - 1) / 2;

        return Engine::axisDir((int) round(-$zx * 100), (int) round(-$zy * 100));
    }

    /** 코스트 상한·슬롯 상한 내 무작위 편성(봇/시뮬레이션용) @return array heroRow[] */
    public static function randomParty(array $heroRows, int $maxCost, int $maxSlots, array &$state): array
    {
        // 캠페인 전용 주인공 원형(protagonist_*)은 컴퓨터 무작위 편성 풀에서 제외
        $pool = array_values(array_filter($heroRows, fn ($h) => ! str_starts_with((string) ($h['code'] ?? ''), 'protagonist_') && empty($h['campaign_only'])));   // NPC(campaign_only)도 제외
        for ($i = count($pool) - 1; $i > 0; $i--) {
            $j = Rng::int($state, $i + 1);
            [$pool[$i], $pool[$j]] = [$pool[$j], $pool[$i]];
        }
        $party = [];
        $cost = 0;
        foreach ($pool as $h) {
            if (count($party) < $maxSlots && $cost + $h['cost'] <= $maxCost) {
                $party[] = $h;
                $cost += $h['cost'];
            }
        }

        return $party;
    }
}
