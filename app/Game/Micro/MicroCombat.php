<?php

namespace App\Game\Micro;

/**
 * 병사 군집 미시 교전 시뮬레이터(고정 틱, 정수 연산만, 난수 없음). 규칙 상세: docs/MICRO_COMBAT_SPEC.md
 *
 * Engine::doAttack 이 맵 유닛 1기 대 1기 교전 시작 시 호출한다. 순수 함수이며 state['rng']를 쓰지 않는다
 * (동점은 전부 결정 규칙: 거리 -> 부착 공격자 수 -> 낮은 HP -> 개체 번호). 좌표 단위는 1칸=100 서브유닛.
 * 모든 수치는 DEFAULTS(임시 시작값, 임밸런 그림자 모드 튜닝 대상)이며 config('game.micro')로 덮어쓴다.
 */
final class MicroCombat
{
    public const MODES = ['off', 'shadow', 'on'];

    public const DEFAULTS = [
        'tick_ms' => 10,            // 1틱 = 10ms (정수)
        'ticks' => 109,             // 교전 구간 = 109 x 10ms = 1090ms (컷신 타격 교환 10박x105+40). 한쪽이 먼저 전멸해도 길이 고정
        'default_layout' => 'stagger343',   // 진형 비적용/기본 배치(LAYOUTS 키). 'grid2x5'=구 2열x5행
        'spacing_x' => 150,         // 슬롯 열 간격(서브유닛, 100=1칸). 진형 모양이 읽히도록 현행(100)보다 넓게. 조정 가능
        'spacing_y' => 150,         // 슬롯 행 간격(서브유닛)
        'gap' => 300,               // 교전 시작 시 양 전열 간격(서브유닛)
        'attack_period' => 60,      // 개체 타격 주기(틱). 임시 후보(임밸런 H1)
        'attack_phase' => [0, 6, 12, 18, 24],   // 개체 번호 % 5 -> 접촉(사거리 진입) 후 첫 타격까지 대기 틱(동시 타격 분산, 결정적)
        'dmg_pct' => 60,            // 임시 후보(임밸런 H1). 병사 1타 = 기본 타격 피해 D x 이 % / 10 (영웅 단일 개체는 D x 이 % x hero_dmg_mult)
        'attacker_cap' => 3,        // 적 1기당 동시 접근 공격자 상한(근접만 적용, 원거리 무제한)
        'speed' => ['foot' => 10, 'mounted' => 15, 'flying' => 12, 'naval' => 10],   // 틱당 서브유닛. flying 의 '장벽 무시'는 아레나에 장애물이 없어 현재 속도 차이로만 반영
        'hero_hp_mult' => 0.9,      // 영웅 개체 HP 배율(결과는 비율로 환산해 hp_after 에 반영). 임시값
        'hero_dmg_mult' => 0.5,     // 영웅 개체 타격 피해 배율. 임시값
        'hero_attacker_cap' => 10,  // 영웅 1체를 동시에 때릴 수 있는 근접 적 수 상한(포위 한도). 임시값
        'hp_scale' => 100,          // 내부 고정소수 배율: 개체 HP·피해를 이 배수 정수로 계산(양자화 오차 방지). hp_after 만 원래 단위로 환산. 이벤트 s/h/e/m 의 HP 는 이 배율 단위
        'legacy_counter' => false,  // 사용자 결정 대기 옵션. false=현행(방어측이 사거리 안이면 항상 반격). true=기존 공식 규칙(근접끼리만 반격, 원거리가 낀 교전은 방어측 무반격)
        'first_strike_phase' => 0,  // 사용자 결정 대기 옵션. 방어측 첫 타격 대기를 N틱 늘려 선공(공격)측에 위상 이점을 줌(0=off)
        'hero_incoming_pct' => 100, // 영웅 피격 1회당 피해 %(포위 피해 감쇠, 100=감쇠 없음). 임시값
        'ranged_hold' => false,     // true=원거리 병사(영웅 개체 제외)는 배치 전개(ranged_hold_ticks) 이후 제자리 사격만(사거리 안 표적만 선정, 사거리 밖이면 대기, 전진 없음). false=기존(원거리도 사거리까지 접근)
        'ranged_hold_ticks' => 60,  // 원거리 전개 구간(틱): 이 구간에는 기존대로 접근해 진형 후열(원진·학익 사거리 2 포함)까지 사거리에 들어온다(30이면 1기 누락, 60이면 전원 사격). 0=처음부터 제자리
        'ranged_vs_ranged_counter' => false,   // true=원거리 공격자 vs 원거리 방어자 교전만 방어측도 반격(상호 사격). legacy_counter 의미는 그대로(근접 공격자의 원거리 방어자·원거리 공격자의 근접 방어자는 무반격 유지)
        'formations_enabled' => false,   // 사용자 결정 2026-11-07: false=진형 시스템 비적용(모두 중립 기본 격자 grid2x5, 진형 속도·cap·ranged_cap·target 미적용, 결과에 formation 키 없음). true=진형 5종 복구(FormationBook·FORMATIONS·formation_rules 그대로)
        'ranged_min_range' => 0,    // 원거리 병사(영웅 제외)의 최소 사거리(서브유닛, 맨해튼): 이 거리 이내(근접 접촉)의 적은 표적으로 삼지 못해 반격·사격하지 않는다. 0=off(기존), 100=근접 접촉 거리
        'hit_and_return' => false,  // true=근접 병사의 타격마다 연출용 데이터 rt=[[틱, 개체, 타격x, 타격y, return_ticks, 0, 타격x, 타격y]] 를 출력(종류 0=접촉후복귀만, 기병 단일 돌격 개체는 제외: 위치는 k 에 있음)(FE: 타격 후 s 의 배치 위치로 return_ticks 동안 복귀 -> 다음 타격 전 재접근). 서버 결과(HP·타깃·이동)는 불변
        'return_ticks' => 12,
        'cavalry_charge' => false,  // true=기병(영웅 제외)은 교전 1회에 딱 1번 직선 돌격: 정면 레인(charge_lane)의 적을 지나며 타격(charge_hit_cap 상한) -> 적 라인을 관통해 빠져나간 뒤 배치 위치로 복귀하고 끝(재돌격·복귀 후 타격 없음). false=기존(접촉 후 계속 교전)
        'charge_hit_cap' => 3,      // 돌격 1회 타격 수 상한(개체당)
        'charge_lane' => 150,       // 돌격 레인 좌우 허용 폭(서브유닛, spacing_y(150) 이상이어야 진형 y 격자와 맞음). 자기 y 레인에 적이 없으면 가장 가까운 적 y 로 보정해 사선 직진
        'survivor_reset' => false,  // true=교전 종료 시 살아남은 병사 개체(영웅 개체 제외)의 HP 를 개체 최대 HP 로 복구(hp_after·e 에 반영, 쓰러진 병사만 손실). false=기존. 운영값은 config/game.php
    ];

    /**
     * 슬롯 좌표 테이블(진형별): 이름 => 개체 순서대로 [열, 행]. 열 0=전열(적과 가까운 쪽), 행 2=중앙 레인. 실제 좌표 = 열 x spacing_x, 행 x spacing_y.
     * 기본 'grid2x5'(2열x5행, 중앙 행부터 채움)도 이 표의 한 항목이다. 진형 5종(학익·어린·방진·횡대·원진)은 이 표에 항목을 추가하고 입력의 'layout' 키로 고른다.
     */
    public const LAYOUTS = [
        'grid2x5' => [[0, 2], [0, 1], [0, 3], [0, 0], [0, 4], [1, 2], [1, 1], [1, 3], [1, 0], [1, 4]],
        // 기본 배치(2026-11-07): 3-4-3 비스듬(지그재그). 열 0=앞(적 쪽) 3명 / 열 1=중 4명(가장 넓은 폭) / 열 2=뒤 3명. 행은 spacing_y 배수이며 중열은 반 칸(0.5) 어긋난다. 채움 순서=앞열 중앙부터(중앙→위→아래) -> 중열(중앙 두 칸부터 바깥으로) -> 뒷열
        'stagger343' => [[0, 2], [0, 1], [0, 3], [1, 1.5], [1, 2.5], [1, 0.5], [1, 3.5], [2, 2], [2, 1], [2, 3]],
    ];

    /**
     * 진형 5종(2단계). 슬롯은 [열, 행]이며 행 0=중앙 레인(좌표 y = 300 + 행 x spacing_y), 열 0=전열. 개체 순서대로 채우므로 병력이 적으면 앞쪽 슬롯만 쓴다(모양 유지).
     * 배치·타깃·접촉 구조만 다르고 피해/HP 수치 가산은 없다. 영웅 단일 개체는 진형에서 제외. 코드(영문)가 키, 이름은 name_ko.
     */
    public const FORMATIONS = [
        'crane' => ['name_ko' => '학익진', 'slots' => [[0, -3], [0, 3], [1, -2], [1, 2], [2, -1], [2, 1], [3, 0], [1, -3], [1, 3], [4, 0]]],    // V자 날개가 적 쪽으로 굽음(포위형)
        'fish' => ['name_ko' => '어린진', 'slots' => [[0, 0], [1, -1], [1, 1], [2, -2], [2, 0], [2, 2], [3, -1], [3, 1], [3, -3], [3, 3]]],    // 쐐기(돌파형)
        'phalanx' => ['name_ko' => '방진', 'slots' => [[0, 0], [0, -1], [0, 1], [1, 0], [1, -1], [1, 1], [2, 0], [2, -1], [2, 1], [3, 0]]],      // 조밀 사각(방어형)
        'line' => ['name_ko' => '횡대', 'slots' => [[0, 0], [0, -1], [0, 1], [0, -2], [0, 2], [0, -3], [0, 3], [0, -4], [0, 4], [0, 5]]],         // 가로 한 줄(확장형)
        'circle' => ['name_ko' => '원진', 'slots' => [[0, 0], [4, 0], [2, -2], [2, 2], [1, -1], [1, 1], [3, -1], [3, 1], [2, 0], [1, 0]]],        // 원형, 마지막 두 슬롯이 중심 약병(방어형)
    ];

    /**
     * 진형별 규칙(데이터, 임시 시작값, 임밸런 튜닝 대상). 별도 피해 배율 없음. 상성은 접촉 구조에서 자연 발생하게 하고 아래 3개만 조정한다.
     *  ranged_cap: 이 진형 개체 1기에게 동시에 사격할 수 있는 원거리 적 수(밀집·엄폐 표현). null=무제한(기존 동작, 기본). 근접 cap 과 별개이며 근접 공격자·영웅 개체에는 적용되지 않는다. 한도가 찬 표적은 건너뛰고 빈 표적이 없으면 사격 대기
     *  speed_pct: 이동 속도 %(speed_pct_by_move 에 이동 유형 foot|mounted|flying|naval 키가 있으면 그 유형은 이 값을 대신 쓴다. 기본 [] = 전 유형 speed_pct, 값 조정은 임밸런) / cap: 이 진형 개체 1기를 동시에 때릴 수 있는 근접 적 수(접촉 상한) / target: nearest(가까운 적) | spread(덜 공격받는 적 우선 = 측면·분산 접근)
     */
    public const FORMATION_RULES = [
        'grid2x5' => ['speed_pct' => 100, 'speed_pct_by_move' => [], 'cap' => null, 'target' => 'nearest', 'ranged_cap' => null],   // cap null = 전역 attacker_cap
        'crane' => ['speed_pct' => 100, 'speed_pct_by_move' => [], 'cap' => 3, 'target' => 'spread'],
        'fish' => ['speed_pct' => 115, 'speed_pct_by_move' => [], 'cap' => 3, 'target' => 'nearest'],
        'phalanx' => ['speed_pct' => 85, 'speed_pct_by_move' => [], 'cap' => 2, 'target' => 'nearest'],
        'line' => ['speed_pct' => 100, 'speed_pct_by_move' => [], 'cap' => 4, 'target' => 'nearest'],
        'circle' => ['speed_pct' => 90, 'speed_pct_by_move' => [], 'cap' => 3, 'target' => 'nearest'],
    ];

    /** @return array<string,mixed> */
    public static function config(?array $override = null): array
    {
        $c = array_replace(self::DEFAULTS, $override ?? []);
        $c['speed'] = array_replace(self::DEFAULTS['speed'], (array) ($override['speed'] ?? []));
        $c['formation_rules'] = self::FORMATION_RULES;
        foreach ((array) ($override['formation_rules'] ?? []) as $k => $v) {
            $c['formation_rules'][$k] = array_replace(self::FORMATION_RULES[$k] ?? self::FORMATION_RULES['grid2x5'], (array) $v);
        }

        return $c;
    }

    /** troop: ceil(hp x 10 / max_hp) 1~10, 영웅/지휘관(single)은 1 */
    public static function soldierCount(int $hp, int $maxHp, bool $single): int
    {
        return $single ? 1 : max(1, min(10, (int) ceil($hp * 10 / max(1, $maxHp) - 1e-9)));
    }

    /**
     * @param array{hp:int,max_hp:int,dmg:int,range:int,move_type:string,hero:bool} $att 공격 측(역할 0)
     * @param array{hp:int,max_hp:int,dmg:int,range:int,move_type:string,hero:bool} $def 방어 측(역할 1)
     *   dmg = 그 유닛의 기본 타격 피해 D(Engine::damageInfo 결과, 유닛 전체 1회분)
     * @return array hp_after[att,def](실제 HP 단위), alive, ticks, tick_ms, 키프레임 s/k/h/d/r (규격: 문서)
     */
    public static function run(array $att, array $def, ?array $override = null): array
    {
        $c = self::config($override);
        $N = (int) $c['ticks'];
        $E = [];
        $sides = [$att, $def];
        $S = max(1, (int) $c['hp_scale']);
        $hpDiv = [1000, 1000];   // 영웅 HP 배율(천분율 정수)
        $hpBefore = [(int) $att['hp'], (int) $def['hp']];
        $forms = ['grid2x5', 'grid2x5'];
        foreach ($sides as $role => $sd) {
            $hero = (bool) $sd['hero'];
            $n = self::soldierCount((int) $sd['hp'], (int) $sd['max_hp'], $hero);
            $pm = $hero ? (int) round((float) $c['hero_hp_mult'] * 1000) : 1000;   // 천분율 정수
            $hpDiv[$role] = $pm;
            $pool = intdiv((int) $sd['hp'] * $S * $pm + 500, 1000);
            $hm = (int) round((float) $c['hero_dmg_mult'] * 1000);
            $d = $hero ? intdiv((int) $sd['dmg'] * $S * (int) $c['dmg_pct'] * $hm + 50000, 100000) : intdiv((int) $sd['dmg'] * $S * (int) $c['dmg_pct'] + 500, 1000);
            $d = max(1, $d);
            $mx = $hero ? intdiv((int) $sd['max_hp'] * $S * $pm + 500, 1000) : intdiv((int) $sd['max_hp'] * $S, 10);   // 개체 최대 HP(고정소수, 막대 비율용)
            $mute = $role === 1 && $c['legacy_counter'] && ! ((int) $att['range'] <= 1 && (int) $def['range'] <= 1) && ! ($c['ranged_vs_ranged_counter'] && (int) $att['range'] > 1 && (int) $def['range'] > 1);
            $fm = ($c['formations_enabled'] && ! $hero && isset($sd['formation'], self::FORMATIONS[$sd['formation']])) ? $sd['formation'] : 'grid2x5';   // 영웅 개체는 진형 제외
            $forms[$role] = $fm;
            $fr = $c['formation_rules'][$fm] ?? self::FORMATION_RULES['grid2x5'];
            $slots = $fm === 'grid2x5' ? (self::LAYOUTS[$sd['layout'] ?? $c['default_layout']] ?? self::LAYOUTS[$c['default_layout']] ?? self::LAYOUTS['grid2x5']) : self::FORMATIONS[$fm]['slots'];
            for ($k = 0; $k < $n; $k++) {
                [$col, $row] = $hero ? [0, 2] : $slots[$k % count($slots)];
                $y = $fm === 'grid2x5' ? (int) round($row * (int) $c['spacing_y']) : 300 + $row * (int) $c['spacing_y'];
                $E[] = [
                    'i' => count($E), 'r' => $role, 'hero' => $hero,
                    'x' => $role === 0 ? 300 - $col * (int) $c['spacing_x'] : 300 + (int) $c['gap'] + $col * (int) $c['spacing_x'],
                    'y' => $y, 'form' => $fm, 'cap' => $hero ? (int) $c['hero_attacker_cap'] : (int) ($fr['cap'] ?? $c['attacker_cap']), 'chg' => ! $hero && (bool) $c['cavalry_charge'] && (int) $sd['range'] <= 1 && $sd['move_type'] === 'mounted', 'cs' => 0, 'chit' => [], 'home' => [$role === 0 ? 300 - $col * (int) $c['spacing_x'] : 300 + (int) $c['gap'] + $col * (int) $c['spacing_x'], $y],
                    'rmin' => (! $hero && (int) $sd['range'] > 1) ? (int) $c['ranged_min_range'] : 0,
                    'tmode' => $fr['target'], 'rcap' => $hero ? null : ($fr['ranged_cap'] ?? null),
                    'hp' => intdiv($pool, $n) + ($k < $pool % $n ? 1 : 0), 'mx' => $mx, 'mute' => $mute, 'alive' => true,
                    'dmg' => $d, 'reach' => max(1, (int) $sd['range']) * 100, 'melee' => (int) $sd['range'] <= 1,
                    'speed' => intdiv((int) ($c['speed'][$sd['move_type']] ?? $c['speed']['foot']) * (int) ($fr['speed_pct_by_move'][$sd['move_type']] ?? $fr['speed_pct']), 100),
                    'cd' => (int) $c['attack_phase'][$k % count($c['attack_phase'])] + ($role === 1 ? (int) $c['first_strike_phase'] : 0), 'tg' => -1, 'near' => -1, 'vx' => 0, 'vy' => 0,
                ];
            }
        }
        $init = array_map(fn ($e) => [$e['r'], $e['x'], $e['y'], $e['hp']], $E);
        $maxHp = array_column($E, 'mx');
        $lastAct = -1;
        $K = [];
        $H = [];
        $D = [];
        $R = [];
        $RT = [];   // 연출 전용: 근접 병사 타격 시점 위치(hit_and_return)
        $SV = [];   // 상호 전멸 방지로 HP 1 생존한 개체: [tick, 개체, hp(스케일)] (사망 이벤트 없이 끝남 -> FE 처리용)
        $capOf = fn (array $e) => $e['cap'];

        $holdOn = fn (array $e, int $t): bool => (bool) $c["ranged_hold"] && ! $e["melee"] && ! $e["hero"] && $t >= (int) $c["ranged_hold_ticks"];   // 이 틱에 제자리 사격 모드인 원거리 병사
        // 기병 단일 돌격(cavalry_charge): cs 0=대기/돌격(직선, 경로상 레인 안의 적 타격 상한 charge_hit_cap) -> 1=적 라인을 지나 복귀 -> 2=끝(이동·타격 없음). 반환 [vx, vy]
        $chargeStep = function (int $i, array $e, array $snap, array &$pending) use (&$E, $c): array {
            $dir = $e['r'] === 0 ? 1 : -1;
            if ($e['cs'] === 0) {
                if ($e['cd'] > 0) {
                    $E[$i]['cd']--;   // 개체별 출발 지연(attack_phase)
                    return [0, 0];
                }
                if (! isset($e['ly'])) {   // 돌격 레인: 자기 y 의 레인(charge_lane) 안에 적이 있으면 자기 y, 없으면 y 가 가장 가까운 생존 적의 y 로 보정(직선 사선 돌격). 격자 불일치로 타격 0회가 되는 것 방지
                    $ly = $e['y'];
                    $nearY = null;
                    foreach ($E as $o) {
                        if ($o['r'] !== $e['r'] && $o['alive']) {
                            $dyy = abs($snap[$o['i']][1] - $e['y']);
                            $nearY = ($nearY === null || [$dyy, $o['i']] < $nearY[0]) ? [[$dyy, $o['i']], $snap[$o['i']][1]] : $nearY;
                        }
                    }
                    $nearY !== null && $nearY[0][0] > (int) $c['charge_lane'] && $ly = $nearY[1];
                    $e['ly'] = $E[$i]['ly'] = $ly;
                }
                $vyc = max(-$e["speed"], min($e["speed"], $e["ly"] - $e["y"]));
                $nx = $e['x'] + $dir * $e['speed'];
                $ny = $e['y'] + $vyc;
                $far = null;
                foreach ($E as $o) {
                    if ($o['r'] === $e['r'] || ! $o['alive']) {
                        continue;
                    }
                    $far = $far === null ? $snap[$o['i']][0] * $dir : max($far, $snap[$o['i']][0] * $dir);
                    if (count($E[$i]['chit']) < (int) $c['charge_hit_cap'] && ! isset($E[$i]['chit'][$o['i']]) && ! $e['mute']
                        && abs($snap[$o['i']][0] - $nx) <= $e['reach'] && abs($snap[$o['i']][1] - $ny) <= (int) $c['charge_lane']) {
                        $E[$i]['chit'][$o['i']] = true;
                        $pending[] = [$i, $o['i']];
                    }
                }
                if ($far === null || $nx * $dir > $far + $e['reach']) {
                    $E[$i]['cs'] = 1;   // 라인 관통 완료 -> 다음 틱부터 복귀
                }

                return [$dir * $e['speed'], $vyc];
            }
            if ($e['cs'] === 1) {
                $dx = $e['home'][0] - $e['x'];
                $dy = $e['home'][1] - $e['y'];
                if ($dx === 0 && $dy === 0) {
                    $E[$i]['cs'] = 2;

                    return [0, 0];
                }
                $mv = min($e['speed'], abs($dx) + abs($dy));
                $m1 = min($mv, abs($dx) >= abs($dy) ? abs($dx) : abs($dy));
                $m2 = $mv - $m1;
                $firstX = abs($dx) >= abs($dy);

                return [$firstX ? ($dx <=> 0) * $m1 : ($dx <=> 0) * $m2, $firstX ? ($dy <=> 0) * $m2 : ($dy <=> 0) * $m1];
            }

            return [0, 0];
        };
        $select = function (int $i, int $t) use (&$E, &$R, $capOf, $holdOn): void {
            $hold = $holdOn($E[$i], $t);
            $cnt = fn (int $oi): int => count(array_filter($E, fn ($x) => $x["alive"] && $x["melee"] && $x["tg"] === $oi));   // 살아서 이 표적에 부착한 근접 공격자 수(매번 계산)
            $shooters = fn (int $oi): int => count(array_filter($E, fn ($x) => $x["alive"] && ! $x["melee"] && $x["tg"] === $oi));   // 현재 살아서 이 표적을 사격 중인 원거리 수(매번 계산: 사망·표적 변경 시 슬롯 자동 반환)
            $best = null;
            $near = null;
            foreach ($E as $o) {
                if ($o['r'] === $E[$i]['r'] || ! $o['alive']) {
                    continue;
                }
                $dist = abs($o['x'] - $E[$i]['x']) + abs($o['y'] - $E[$i]['y']);
                if ($near === null || [$dist, $o['i']] < $near[0]) {
                    $near = [[$dist, $o['i']], $o['i']];
                }
                if ($E[$i]["rmin"] > 0 && $dist <= $E[$i]["rmin"]) {
                    continue;   // 근접 접촉한 적은 쏘지 못한다(ranged_min_range)
                }
                if ($hold && $dist > $E[$i]["reach"]) {
                    continue;   // 제자리 사격: 사거리 밖 표적은 후보 제외
                }
                if ($E[$i]['melee'] && $cnt($o["i"]) >= $capOf($o)) {
                    continue;
                }
                if (! $E[$i]['melee'] && $o['rcap'] !== null && $shooters($o["i"]) >= $o["rcap"]) {
                    continue;
                }
                $k = $E[$i]['tmode'] === 'spread' ? [$cnt($o["i"]), $dist, $o['hp'], $o['i']] : [$dist, $cnt($o["i"]), $o['hp'], $o['i']];
                if ($best === null || $k < $best[0]) {
                    $best = [$k, $o['i']];
                }
            }
            $new = $best[1] ?? -1;
            $E[$i]['near'] = $near[1] ?? -1;
            if ($new !== $E[$i]['tg']) {
                $R[] = [$t, $i, $new];
            }
            $E[$i]['tg'] = $new;
        };

        $endT = $N;
        for ($t = 0; $t < $N; $t++) {
            $a0 = false;
            $a1 = false;
            foreach ($E as $e) {
                if ($e['alive']) {
                    $e['r'] === 0 ? $a0 = true : $a1 = true;
                }
            }
            if (! $a0 || ! $a1) {
                $endT = $t;
                break;   // 한쪽 전멸: 남은 틱은 정지(재생 길이는 ticks 로 고정)
            }
            foreach ($E as $i => $e) {
                if ($e['alive'] && ! $e['chg'] && ($e['tg'] < 0 || ! $E[$e['tg']]['alive'] || ($e['rmin'] > 0 && abs($E[$e['tg']]['x'] - $e['x']) + abs($E[$e['tg']]['y'] - $e['y']) <= $e['rmin']) || ($holdOn($e, $t) && abs($E[$e['tg']]['x'] - $e['x']) + abs($E[$e['tg']]['y'] - $e['y']) > $e['reach']))) {
                    $select($i, $t);
                }
            }
            $snap = array_map(fn ($e) => [$e['x'], $e['y']], $E);
            $pending = [];
            foreach ($E as $i => $e) {
                if (! $e['alive']) {
                    continue;
                }
                $vx = 0;
                $vy = 0;
                if ($e['chg']) {
                    [$vx, $vy] = $chargeStep($i, $e, $snap, $pending);
                }
                $goal = $e['chg'] ? -1 : ($e['tg'] >= 0 ? $e['tg'] : $e['near']);
                if ($goal >= 0) {
                    $dx = $snap[$goal][0] - $e['x'];
                    $dy = $snap[$goal][1] - $e['y'];
                    $dist = abs($dx) + abs($dy);
                    if ($dist <= $e['reach']) {
                        if ($e['cd'] > 0) {
                            $E[$i]['cd']--;   // 대기 시간은 사거리 안에 있을 때만 흐른다(행군 중 소진 방지)
                        }
                        if ($e['tg'] >= 0 && $E[$i]['cd'] === 0 && ! $e['mute']) {
                            $pending[] = [$i, $e['tg']];
                            $E[$i]['cd'] = (int) $c['attack_period'];
                        }
                    } elseif (! $holdOn($e, $t)) {
                        $mv = min($e['speed'], $dist - $e['reach']);
                        $firstX = abs($dx) >= abs($dy);   // 큰 축 먼저, 동률이면 x. 대각 이동 없음
                        $m1 = min($mv, $firstX ? abs($dx) : abs($dy));
                        $m2 = $mv - $m1;
                        $sx = $dx <=> 0;
                        $sy = $dy <=> 0;
                        $vx = $firstX ? $sx * $m1 : $sx * $m2;
                        $vy = $firstX ? $sy * $m2 : $sy * $m1;
                    }
                }
                ($vx !== 0 || $vy !== 0) && $lastAct = $t;
                if ($vx !== $e['vx'] || $vy !== $e['vy']) {
                    $K[] = [$i, $t, $e['x'], $e['y']];
                    $E[$i]['vx'] = $vx;
                    $E[$i]['vy'] = $vy;
                }
                $E[$i]['x'] += $vx;
                $E[$i]['y'] += $vy;
            }
            $pending && $lastAct = $t;
            $firstHit = count($H);
            foreach ($pending as [$a, $b]) {   // 같은 틱 피해는 동시 적용
                $dm = $E[$b]['hero'] ? max(1, intdiv($E[$a]['dmg'] * (int) $c['hero_incoming_pct'] + 50, 100)) : $E[$a]['dmg'];
                $E[$b]['hp'] -= $dm;
                $H[] = [$t, $a, $b, $dm, 0];
                if ($c["hit_and_return"] && $E[$a]["melee"] && ! $E[$a]["hero"] && ! $E[$a]["chg"]) {
                    $RT[] = [$t, $a, $E[$a]["x"], $E[$a]["y"], (int) $c["return_ticks"], 0, $E[$a]["x"], $E[$a]["y"]];
                }
            }
            for ($h = $firstHit; $h < count($H); $h++) {
                $H[$h][4] = max(0, $E[$H[$h][2]]['hp']);
            }
            $died = [];
            foreach ($E as $i => $e) {
                if ($e['alive'] && $e['hp'] <= 0) {
                    $E[$i]['alive'] = false;
                    $died[$i] = true;
                    $D[] = [$t, $i];
                    $lastAct = $t;
                    if ($E[$i]['vx'] !== 0 || $E[$i]['vy'] !== 0) {
                        $K[] = [$i, $t + 1, $E[$i]['x'], $E[$i]['y']];
                        $E[$i]['vx'] = 0;
                        $E[$i]['vy'] = 0;
                    }
                }
            }
            if ($died) {   // 동시 전멸 방지: 이 틱에 양측 생존이 모두 0이 되면 교전 개시측(역할 0)의 사망 개체 중 번호가 가장 낮은 1기를 HP 1로 생존시킨다(동점 상황에서만 작동, 결정적)
                $left = [0, 0];
                foreach ($E as $e) {
                    $e['alive'] && $left[$e['r']]++;
                }
                if ($left[0] === 0 && $left[1] === 0) {
                    foreach ($died as $i => $_) {
                        if ($E[$i]['r'] !== 0) {
                            continue;
                        }
                        $E[$i]['alive'] = true;
                        $E[$i]['hp'] = 1;
                        unset($died[$i]);
                        $SV[] = [$t, $i, 1];
                        $D = array_values(array_filter($D, fn ($d) => ! ($d[0] === $t && $d[1] === $i)));
                        for ($h = count($H) - 1; $h >= 0 && $H[$h][0] === $t; $h--) {
                            $H[$h][2] === $i && $H[$h][4] = 1;   // 이 틱 피격 기록의 잔여 HP 를 1로 정정
                        }
                        break;
                    }
                }
            }
            if ($died) {   // 같은 틱 재선정: 대상이 쓰러진 개체는 즉시 새 대상(이동/타격은 다음 틱부터)
                foreach ($E as $i => $e) {
                    if ($e['alive'] && $e['tg'] >= 0 && isset($died[$e['tg']])) {
                        $select($i, $t);
                    }
                }
            }
        }
        foreach ($E as $e) {
            if ($e['alive'] && ($e['vx'] !== 0 || $e['vy'] !== 0)) {
                $K[] = [$e['i'], $endT, $e['x'], $e['y']];
            }
        }
        if ($c['survivor_reset']) {   // 교전 종료: 생존 병사 개체(영웅 개체 제외, HP 1 생존 포함)의 HP 를 개체 최대 HP 로 복구. 아래 합산·hp_after·e 가 복구값을 반영
            foreach ($E as $i => $e) {
                $e['alive'] && ! $e['hero'] && $E[$i]['hp'] = $e['mx'];
            }
        }
        $sum = [0, 0];
        $alive = [0, 0];
        foreach ($E as $e) {
            if ($e['alive']) {
                $sum[$e['r']] += $e['hp'];
                $alive[$e['r']]++;
            }
        }
        $hpAfter = [];
        foreach ([0, 1] as $r) {
            $hpAfter[$r] = $sum[$r] <= 0 ? 0 : min((int) $sides[$r]['hp'], max(1, intdiv($sum[$r] * 1000 + $S * $hpDiv[$r] - 1, $S * $hpDiv[$r])));   // 고정소수 -> 원래 HP 단위 올림(생존 시 최소 1), 영웅 HP 배율은 비율로 환산
        }

        return [
            'v' => 1, 'tick_ms' => (int) $c['tick_ms'], 'ticks' => $N,
            'hp_after' => $hpAfter, 'alive' => $alive,
            'hp_scale' => $S, 'hp_before' => $hpBefore, 'end_tick' => $lastAct < 0 ? 0 : min($N, $lastAct + 1),
            's' => $init, 'm' => $maxHp, 'e' => array_values(array_map(fn ($e) => [$e['i'], $e['hp']], array_filter($E, fn ($e) => $e['alive']))),
            'k' => $K, 'h' => $H, 'd' => $D, 'r' => $R, 'survivors' => $SV,
        ] + ($c['hit_and_return'] ? ['rt' => $RT] : []) + ($c['formations_enabled'] ? ['formation' => $forms] : []);
    }
}
