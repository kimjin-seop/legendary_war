<?php

namespace Tests\Unit;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\Micro\FormationBook;
use App\Game\Micro\MicroCombat;
use App\Game\RuleSet;
use PHPUnit\Framework\TestCase;

class MicroCombatTest extends TestCase
{
    private const FAST = ['attack_period' => 30, 'dmg_pct' => 100, 'formations_enabled' => true];   // 연쇄가 한 교전 안에 보이도록 테스트 전용 빠른 노브(기본값과 무관)

    private function mr(array $a, array $b, array $o = []): array
    {
        return MicroCombat::run($a, $b, $o + ['formations_enabled' => true]);   // 진형 의존 테스트는 플래그 on
    }

    private function sp(int $hp, bool $hero = false): array
    {
        return ['hp' => $hp, 'max_hp' => 100, 'dmg' => 30, 'range' => 1, 'move_type' => 'foot', 'hero' => $hero];
    }

    public function test_같은_입력은_같은_결과이고_수가_많은_쪽이_잔존_비율이_높다_연쇄_타깃이_남는다(): void
    {
        $a = MicroCombat::run($this->sp(100), $this->sp(70), self::FAST);
        $this->assertSame($a, MicroCombat::run($this->sp(100), $this->sp(70), self::FAST));
        $this->assertGreaterThan(MicroCombat::run($this->sp(70), $this->sp(70), self::FAST)["hp_after"][0] / 70, $a['hp_after'][0] / 100);

        $dead = array_column($a['d'], 0, 1);   // 개체 -> 사망 틱
        $chain = false;
        foreach ($a['h'] as [$t, $att, $tg]) {
            foreach ($a['h'] as [$t2, $att2, $tg2]) {
                $chain = $chain || ($att === $att2 && $tg !== $tg2 && isset($dead[$tg]) && $dead[$tg] <= $t2 && $t2 > $t);   // 한 개체가 처치 후 다른 적을 같은 교전 안에서 타격
            }
        }
        $this->assertTrue($chain);
        $this->assertSame(109 * 10, $a['ticks'] * $a['tick_ms'] - 0);
    }

    public function test_shadow는_기존_결과와_이벤트를_유지하고_on은_미시_결과로_확정된다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $run = function (string $mode) use ($r) {
            $e = new Engine($r, ['micro_mode' => $mode]);
            $s = ArmyBuilder::initialState($r, ['width' => 4, 'height' => 1, 'tiles' => ['pppp']], 1, 30, 'a', false, false, false, null, null, $mode);
            $s['units']['a1'] = ArmyBuilder::makeUnit($r, 'a1', 'a', 'troop', 'sword', null, 1, 1, 0, 3.0);
            $s['units']['a9'] = ArmyBuilder::makeUnit($r, 'a9', 'a', 'commander', 'sword', null, 1, 0, 0, 3.0);
            $s['units']['b1'] = ArmyBuilder::makeUnit($r, 'b1', 'b', 'troop', 'sword', null, 1, 2, 0, 3.0);
            $s['units']['b9'] = ArmyBuilder::makeUnit($r, 'b9', 'b', 'commander', 'sword', null, 1, 3, 0, 3.0);

            return $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a1', 'target_id' => 'b1']);
        };
        [$so, $eo] = $run('off');
        [$ss, $es] = $run('shadow');
        [$sn, $en] = $run('on');
        $this->assertArrayNotHasKey('micro_mode', $so);
        $this->assertArrayNotHasKey('micro', $eo[0]);
        $strip = fn (array $ev) => array_map(fn ($x) => array_diff_key($x, ['micro' => 1]), $ev);
        $this->assertSame($eo, $strip($es));                       // shadow: 기존 이벤트 필드 불변, micro 만 추가
        $this->assertSame($so['units']['b1']['hp'], $ss['units']['b1']['hp']);
        $this->assertSame($so['rng'], $ss['rng']);
        $this->assertSame($so['rng'], $sn['rng']);                  // state['rng'] 미소비
        $this->assertSame($en[0]['micro']['hp_after'][1], $sn['units']['b1']['hp'] ?? 0);   // on: 미시 결과로 확정
    }
    public function test_진형별_결정적이고_기본_배치는_진형_없음과_같으며_데이터_없으면_폴백한다(): void
    {
        $base = $this->mr($this->sp(100), $this->sp(100));
        $this->assertSame($base['s'], $this->mr($this->sp(100) + ['formation' => 'grid2x5'], $this->sp(100))['s']);   // 진형 없음 = grid2x5
        $shapes = [];
        foreach (array_keys(MicroCombat::FORMATIONS) as $f) {
            $r = $this->mr($this->sp(100) + ['formation' => $f], $this->sp(100) + ['formation' => 'line']);
            $this->assertSame($r, $this->mr($this->sp(100) + ['formation' => $f], $this->sp(100) + ['formation' => 'line']));
            $this->assertSame([$f, 'line'], $r['formation']);
            $shapes[json_encode(array_slice($r['s'], 0, 10))] = true;
        }
        $this->assertCount(5, $shapes);   // 진형마다 배치가 다름
        $hero = $this->mr($this->sp(100, true) + ['formation' => 'fish'], $this->sp(100));
        $this->assertSame('grid2x5', $hero['formation'][0]);   // 영웅 개체는 진형 제외

        FormationBook::clearCache();
        $draft = __DIR__.'/../../docs/data/hero_formations.draft.json';   // 읽기 전용(초안 파일은 수정하지 않는다)
        $this->assertSame('crane', FormationBook::forHero('yi_sun_sin', $draft));
        $this->assertNull(FormationBook::forHero('no_such_hero', $draft));
        $this->assertNull(FormationBook::forHero('yi_sun_sin', __DIR__.'/no_such_file.json'));
        $this->assertNull(FormationBook::normalize('없는진형'));
    }
    public function test_대칭_반복_교전에서_양측_동시_전멸이_없다(): void
    {
        foreach (array_merge([null], array_keys(MicroCombat::FORMATIONS)) as $f) {
            $a = $b = 100;
            for ($n = 0; $n < 20 && $a > 0 && $b > 0; $n++) {   // 공격 교대 반복
                $x = $n % 2 === 0
                    ? $this->mr($this->sp($a) + ['formation' => $f], $this->sp($b) + ['formation' => $f])['hp_after']
                    : array_reverse($this->mr($this->sp($b) + ['formation' => $f], $this->sp($a) + ['formation' => $f])['hp_after']);
                [$a, $b] = $x;
                $this->assertTrue($a > 0 || $b > 0, "양측 전멸: ".($f ?? 'grid2x5'));
            }
        }
    }
    public function test_on_모드에서_지휘관을_처치하면_기존과_같은_승패가_난다(): void
    {
        $t = ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0];
        $r = new RuleSet(['sword' => $t], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $res = [];
        foreach (['off', 'on'] as $mode) {
            $e = new Engine($r, ['micro_mode' => $mode]);
            $s = ArmyBuilder::initialState($r, ['width' => 4, 'height' => 1, 'tiles' => ['pppp']], 1, 30, 'a', false, false, false, null, null, $mode);
            $s['units']['a0'] = ArmyBuilder::makeUnit($r, 'a0', 'a', 'commander', 'sword', null, 1, 1, 0, 3.0);
            $s['units']['b0'] = ArmyBuilder::makeUnit($r, 'b0', 'b', 'commander', 'sword', null, 1, 2, 0, 3.0);
            $s['units']['b0']['hp'] = 1;
            [$s2, $ev] = $e->apply($s, 'a', ['type' => 'attack', 'unit_id' => 'a0', 'target_id' => 'b0']);
            $res[$mode] = [$s2['status'], $s2['winner'], in_array('commander_defeated', array_column($ev, 'reason'), true) || in_array('battle_end', array_column($ev, 'type'), true)];
        }
        $this->assertSame(['finished', 'a', true], $res['off']);
        $this->assertSame($res['off'], $res['on']);
    }
    public function test_화이트리스트는_목록의_스테이지_방만_켜고_survivors_필드와_이동유형별_속도_오버라이드가_있다(): void
    {
        $r = new RuleSet(['sword' => ['move' => 3, 'range_min' => 1, 'range_max' => 1, 'hp' => 100, 'atk' => 28, 'def' => 10, 'move_type' => 'foot', 'heal' => 0]], [], ['plain' => ['foot' => ['cost' => 1, 'def_pct' => 0]]], ['p' => 'plain']);
        $all = new Engine($r, ['micro_mode' => 'shadow']);
        $this->assertSame('shadow', $all->microModeFor('stage', ['s1', 5]));   // 화이트리스트 없음 = 전체
        $wl = new Engine($r, ['micro_mode' => 'on', 'micro_stages' => ['s1', '7'], 'micro_rooms' => ['ROOM1']]);
        $this->assertSame('on', $wl->microModeFor('stage', ['s1', 5]));
        $this->assertSame('on', $wl->microModeFor('stage', ['zz', 7]));         // id 로도 매칭
        $this->assertSame('off', $wl->microModeFor('stage', ['s2', 5]));
        $this->assertSame('on', $wl->microModeFor('room', 'ROOM1'));
        $this->assertSame('off', $wl->microModeFor('other'));
        $this->assertSame('off', (new Engine($r, ['micro_mode' => 'off', 'micro_stages' => ['s1']]))->microModeFor('stage', ['s1']));

        $x = MicroCombat::run($this->sp(100), $this->sp(100), self::FAST);
        $this->assertIsArray($x['survivors']);                                   // 상호 전멸 방지 HP1 생존 [tick, 개체, hp]
        $same = MicroCombat::run($this->sp(100) + ['formation' => 'fish'], $this->sp(100), self::FAST);
        $this->assertSame($same, MicroCombat::run($this->sp(100) + ['formation' => 'fish'], $this->sp(100), self::FAST + ['formation_rules' => ['fish' => ['speed_pct_by_move' => ['foot' => 115]]]]));   // 기본 speed_pct(115)와 같은 값이면 동일
        $slow = MicroCombat::run($this->sp(100) + ['formation' => 'fish'], $this->sp(100), self::FAST + ['formation_rules' => ['fish' => ['speed_pct_by_move' => ['foot' => 50]]]]);
        $this->assertNotSame($same['k'], $slow['k']);
    }

    private function ty(string $kind, int $hp = 100, array $extra = []): array
    {
        $t = ['arc' => ['range' => 3, 'move_type' => 'foot'], 'inf' => ['range' => 1, 'move_type' => 'foot'], 'cav' => ['range' => 1, 'move_type' => 'mounted']][$kind];

        return $t + ['hp' => $hp, 'max_hp' => 100, 'dmg' => 30, 'hero' => false] + $extra;
    }

    public function test_원거리_진형_ranged_cap은_사격_집중을_제한하고_기본_null이면_기존_결과와_같다(): void
    {
        $att = $this->ty('arc');
        $def = $this->ty('inf', 100, ['formation' => 'phalanx']);
        $base = MicroCombat::run($att, $def, self::FAST);
        $this->assertSame($base, MicroCombat::run($att, $def, self::FAST + ['formation_rules' => ['phalanx' => ['ranged_cap' => null]]]));
        $capped = MicroCombat::run($att, $def, self::FAST + ['formation_rules' => ['phalanx' => ['ranged_cap' => 1]]]);
        $this->assertGreaterThan($base['hp_after'][1], $capped['hp_after'][1]);   // 엄폐(집중 제한)로 방어측 잔여가 늘어난다
        // 근접 공격자에는 ranged_cap 무관
        $m = $this->ty('inf');
        $this->assertSame(MicroCombat::run($m, $def, self::FAST), MicroCombat::run($m, $def, self::FAST + ['formation_rules' => ['phalanx' => ['ranged_cap' => 1]]]));
    }

    public function test_원거리_대_원거리는_legacy_counter에_따라_무반격_또는_상호_사격(): void
    {
        $a = $this->ty('arc');
        $d = $this->ty('arc');
        $hits = fn (array $r) => count(array_filter($r['h'], fn ($h) => $r['s'][$h[1]][0] === 1));   // 방어측(역할 1) 타격 수
        $this->assertSame(0, $hits(MicroCombat::run($a, $d, self::FAST + ['legacy_counter' => true])));
        $this->assertGreaterThan(0, $hits(MicroCombat::run($a, $d, self::FAST + ['legacy_counter' => false])));
        $this->assertSame(0, MicroCombat::run($a, $this->ty('inf'), self::FAST + ['legacy_counter' => true])['hp_after'][0] - 100);   // 원거리 vs 근접: 공격측 무손실
    }

    public function test_기병은_진형이_느려도_속도_오버라이드로_보병보다_먼저_접촉한다(): void
    {
        $rules = ['formation_rules' => ['phalanx' => ['speed_pct' => 60, 'speed_pct_by_move' => ['mounted' => 120]]]];
        $first = fn (array $r) => min(array_column($r['h'], 0) ?: [999]);
        $def = $this->ty('inf');
        $cav = MicroCombat::run($this->ty('cav', 100, ['formation' => 'phalanx']), $def, self::FAST + $rules);
        $inf = MicroCombat::run($this->ty('inf', 100, ['formation' => 'phalanx']), $def, self::FAST + $rules);
        $this->assertLessThan($first($inf), $first($cav));
    }

    public function test_ranged_cap_슬롯은_사격자가_죽거나_표적이_죽으면_반환되어_교착_없이_끝난다(): void
    {
        $rules = self::FAST + ['legacy_counter' => false, 'formation_rules' => ['line' => ['ranged_cap' => 1]]];
        $r = MicroCombat::run($this->ty('arc', 100, ['formation' => 'line']), $this->ty('arc', 30, ['formation' => 'line']), $rules);
        $this->assertSame(0, $r['alive'][1]);   // 표적이 영구 보호되지 않고 방어측 3기 전멸
        $this->assertSame($r, MicroCombat::run($this->ty('arc', 100, ['formation' => 'line']), $this->ty('arc', 30, ['formation' => 'line']), $rules));
    }

    public function test_ranged_hold는_원거리가_제자리에서_사거리_안만_사격하고_사거리_밖이면_교착_없이_정상_종료한다(): void
    {
        $arc = fn (int $hp = 100) => array_replace($this->ty('arc', $hp), ['range' => 2]);
        $rules = self::FAST + ['legacy_counter' => false, 'ranged_hold' => true, 'ranged_hold_ticks' => 0, 'formation_rules' => ['grid2x5' => ['ranged_cap' => 1]]];
        // 원거리 vs 근접: 궁병은 이동 없음(개체 0~9 = 공격측), 근접이 다가오면 사격
        $r = MicroCombat::run($arc(), $this->ty('inf'), $rules);
        $this->assertSame([], array_values(array_filter($r['k'], fn ($k) => $r['s'][$k[0]][0] === 0)));
        $this->assertGreaterThan(0, count(array_filter($r['h'], fn ($h) => $r['s'][$h[1]][0] === 0)));
        // 원거리 vs 원거리(사거리 2 < 간격): 서로 접근하지 않아 교전 없이 끝난다(교착이 아니라 정상 종료, 피해 0)
        $x = MicroCombat::run($arc(), $arc(), $rules);
        $this->assertSame([], $x['h']);
        $this->assertSame([100, 100], $x['hp_after']);
        // 끄면(기본) 기존대로 접근해 교전
        $this->assertNotSame([], MicroCombat::run($arc(), $arc(), ['ranged_hold' => false] + $rules)['h']);
    }

    public function test_hit_and_return은_연출용_rt만_추가하고_결과를_바꾸지_않는다(): void
    {
        $off = MicroCombat::run($this->ty('inf'), $this->ty('inf'), self::FAST + ['hit_and_return' => false]);
        $on = MicroCombat::run($this->ty('inf'), $this->ty('inf'), self::FAST + ['hit_and_return' => true]);
        $this->assertArrayNotHasKey('rt', $off);
        $this->assertSame($off, array_diff_key($on, ['rt' => 1]));   // HP·이동·타격 불변
        $this->assertNotSame([], $on['rt']);
    }

    public function test_기병은_교전당_한_번만_직선_돌격해_상한까지_타격하고_복귀한_뒤_다시_타격하지_않는다(): void
    {
        $rules = self::FAST + ['cavalry_charge' => true, 'charge_hit_cap' => 2, 'legacy_counter' => false];
        $r = MicroCombat::run($this->ty('cav'), $this->ty('inf'), $rules);
        $mine = array_values(array_filter($r['h'], fn ($h) => $r['s'][$h[1]][0] === 0));
        foreach (array_count_values(array_column($mine, 1)) as $n) {
            $this->assertLessThanOrEqual(2, $n);   // 돌격 1회 타격 상한, 재돌격 없음
        }
        $this->assertSame($r, MicroCombat::run($this->ty('cav'), $this->ty('inf'), $rules));
        $this->assertNotSame($r['h'], MicroCombat::run($this->ty('cav'), $this->ty('inf'), ['cavalry_charge' => false] + $rules)['h']);   // 끄면 기존 접촉 교전

        // 병력 불균형(기병 10 vs 보병 2): 레인 보정으로 모든 기병이 1회 이상 타격한다(격자 불일치로 0회 방지)
        $u = MicroCombat::run(array_replace($this->ty('cav'), ['dmg' => 1]), array_replace($this->ty('inf', 20), ['dmg' => 1]), $rules);   // 약한 타격: 적이 일찍 전멸해 교전이 끝나는 것 방지
        $hitters = array_unique(array_column(array_filter($u['h'], fn ($h) => $u['s'][$h[1]][0] === 0), 1));
        $this->assertCount(10, $hitters);
    }

    public function test_ranged_min_range는_근접에_붙은_궁병이_반격하지_못해_근접_공격자가_피해를_받지_않는다(): void
    {
        $arc = array_replace($this->ty('arc'), ['range' => 2]);
        $rules = self::FAST + ['legacy_counter' => false, 'ranged_hold' => true, 'ranged_hold_ticks' => 0, 'cavalry_charge' => false];
        // 방어측 궁병이 접촉한 근접(공격측 보병)에게 반격: min_range 0 이면 쏘고, 100 이면 접촉 후엔 못 쏨
        $meleeHits = fn (array $r) => count(array_filter($r['h'], fn ($h) => $r['s'][$h[1]][0] === 1));   // 방어측(궁병) 타격 수
        $off = MicroCombat::run($this->ty('inf'), $arc, $rules + ['ranged_min_range' => 0]);
        $on = MicroCombat::run($this->ty('inf'), $arc, $rules + ['ranged_min_range' => 100]);
        $this->assertGreaterThan($meleeHits($on), $meleeHits($off));
        $this->assertGreaterThanOrEqual($off['hp_after'][0], $on['hp_after'][0]);   // 근접 공격자 손실은 늘지 않는다
        // 최소 사거리 0(기본)은 기존 결과 불변
        $this->assertSame(MicroCombat::run($this->ty('inf'), $arc, $rules), $off);
    }

    public function test_원거리끼리는_상호_사격하고_궁병_방어자는_접촉한_근접에게_피해를_못_준다(): void
    {
        $arc = fn () => array_replace($this->ty('arc'), ['range' => 3]);
        $rules = self::FAST + ['legacy_counter' => true, 'ranged_hold' => true, 'ranged_min_range' => 100];
        $by = fn (array $r, int $role) => count(array_filter($r['h'], fn ($h) => $r['s'][$h[1]][0] === $role));
        $rr = MicroCombat::run($arc(), $arc(), $rules + ['ranged_vs_ranged_counter' => true]);
        $this->assertGreaterThan(0, $by($rr, 0));
        $this->assertGreaterThan(0, $by($rr, 1));   // 방어 궁병도 쏜다(양측 피해)
        $this->assertSame(0, $by(MicroCombat::run($arc(), $arc(), $rules + ['ranged_vs_ranged_counter' => false]), 1));   // 끄면 legacy 무반격
        $m = MicroCombat::run($this->ty('inf'), $arc(), $rules + ['ranged_vs_ranged_counter' => true, 'ranged_hold_ticks' => 0]);
        $this->assertSame(0, $by($m, 1));           // 접촉한 근접에게는 반격 불가(legacy_counter 무반격 유지)
    }

    public function test_survivor_reset은_생존_병사_HP를_풀로_복구해_hp_after에_반영하고_끄면_기존과_같다(): void
    {
        $off = MicroCombat::run($this->sp(100), $this->sp(70), self::FAST);
        $on = MicroCombat::run($this->sp(100), $this->sp(70), self::FAST + ['survivor_reset' => true]);
        $this->assertSame($off, MicroCombat::run($this->sp(100), $this->sp(70), self::FAST + ['survivor_reset' => false]));   // 기본 off
        $this->assertSame($off['d'], $on['d']);   // 사망 규칙 불변
        foreach ($on['e'] as [$i, $hp]) {
            $this->assertSame($on['m'][$i], $hp);   // 생존 병사 개체 전원 풀 HP
        }
        $this->assertSame([10 * $on['alive'][0], 10 * $on['alive'][1]], $on['hp_after']);   // max_hp 100 -> 병사 1명=10, 원래 HP(100/70) 초과 없음
        $this->assertGreaterThanOrEqual($off['hp_after'][0], $on['hp_after'][0]);
        // 영웅 개체는 복구 대상이 아니다
        $h = MicroCombat::run($this->sp(100, true), $this->sp(70), self::FAST + ['survivor_reset' => true]);
        $this->assertSame(MicroCombat::run($this->sp(100, true), $this->sp(70), self::FAST)['hp_after'][0], $h['hp_after'][0]);
    }

    public function test_formations_enabled_기본_off는_진형을_전혀_적용하지_않고_formation_키도_내지_않는다(): void
    {
        $a = $this->sp(100) + ['formation' => 'phalanx'];
        $d = $this->sp(100) + ['formation' => 'line'];
        $off = MicroCombat::run($a, $d);
        $this->assertArrayNotHasKey('formation', $off);
        $this->assertSame($off, MicroCombat::run($this->sp(100), $this->sp(100)));   // 진형 지정이 있어도 중립 기본 격자와 동일
        $on = MicroCombat::run($a, $d, ['formations_enabled' => true]);
        $this->assertSame(['phalanx', 'line'], $on['formation']);   // 플래그 on 이면 복구
        $this->assertNotSame($off['s'], $on['s']);
    }

    public function test_기본_배치는_3_4_3_지그재그이고_양측_좌우_반전이다(): void
    {
        $r = MicroCombat::run($this->sp(100), $this->sp(100));   // 진형 비적용 = stagger343
        $att = array_values(array_filter($r['s'], fn ($s) => $s[0] === 0));
        $this->assertCount(10, $att);
        $byX = [];
        foreach ($att as [, $x, $y]) {
            $byX[$x][] = $y;
        }
        krsort($byX);   // 앞열(적 쪽, x 큰 쪽) -> 뒷열
        $cols = array_values($byX);
        $this->assertSame([3, 4, 3], array_map('count', $cols));
        foreach ($cols as &$c) {
            sort($c);
        }
        $this->assertSame([[150, 300, 450], [75, 225, 375, 525], [150, 300, 450]], $cols);   // 중열은 반 칸(75) 어긋남, y 0~600 안
        $def = array_values(array_filter($r['s'], fn ($s) => $s[0] === 1));
        $this->assertSame(array_column($att, 2), array_column($def, 2));            // y 동일
        $this->assertSame(array_map(fn ($a) => 900 - $a, array_column($att, 1)), array_column($def, 1));   // x 좌우 반전(전열 300 vs 600, 중심 450)
    }
}
