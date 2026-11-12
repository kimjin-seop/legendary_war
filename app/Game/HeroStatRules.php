<?php

namespace App\Game;

/**
 * 영웅 능력치 자동 생성/감사 규칙(순수 PHP, DB 미사용). 규칙 근거: database/data/hero_stat_rules.json (임밸런, 모두 시작값).
 * 입력: 풀 항목(rarity, unit_type ...) + 프로필(6축) -> cost, 보너스 3종, 성장률 3종, 오라/스킬 후보. 결정론(같은 입력=같은 출력).
 */
final class HeroStatRules
{
    public const AXES = ['OFF', 'DEF', 'MOB', 'CMD', 'INT', 'VAL'];

    /** 사용자 결정(2026-11-04): 영웅 체력 보너스는 전원 10, 체력 성장률은 전원 3으로 고정한다(공격·방어만 영웅별 차이). */
    public const FIXED_HP_BONUS = 10;

    public const FIXED_GROWTH_HP_PCT = 3.0;

    /** @param array<string,array{hp:int|float,atk:int|float,def:int|float}> $unitTypes */
    public function __construct(private readonly array $rules, private readonly array $unitTypes, private readonly array $skillTemplates = [])
    {
    }

    /** 축 중심값 c = (score or 2.5) - 2.5. verify/null/프로필 없음은 0(중립). @return array{c:array<string,float>,neutral:string[],missing:bool} */
    public function centered(?array $profile): array
    {
        $c = [];
        $neutral = [];
        foreach (self::AXES as $a) {
            $ax = $profile['axes'][$a] ?? null;
            $ok = $ax !== null && isset($ax['score']) && in_array($ax['evidence_level'] ?? 'verify', ['confirmed', 'accepted'], true);
            $c[$a] = $ok ? (float) $ax['score'] - 2.5 : 0.0;
            if (! $ok) {
                $neutral[] = $a;
            }
        }

        return ['c' => $c, 'neutral' => $neutral, 'missing' => $profile === null];
    }

    /** 틀(등급 평탄 보너스 x 병종 배율) hp, atk, def */
    public function frame(string $rarity, string $type): array
    {
        $flat = $this->rules['frame']['rarity_flat_bonus'][$rarity];
        $mul = $this->rules['frame']['type_bonus_multiplier'][$type];

        return [$flat[0] * $mul[0], $flat[1] * $mul[1], $flat[2] * $mul[2]];
    }

    /** 틀 성장률(중립 프로필) */
    public function frameGrowth(string $rarity, string $type): array
    {
        [$lo, $hi] = $this->rules['frame']['growth_range_pct'][$rarity];
        $pos = $this->rules['frame']['growth_type_position'][$type];

        return array_map(fn ($p) => $lo + ($hi - $lo) * max(0.0, min(1.0, 0.2 + 0.6 * $p)), $pos);
    }

    private function base(string $type): array
    {
        $u = $this->unitTypes[$type];

        return [$u['hp'], $u['atk'], $u['def']];
    }

    /** Lv1 보너스 점수 = 0.4*hp/base + 0.4*atk/base + 0.2*def/base */
    public function bonusScore(string $type, array $b): float
    {
        $base = $this->base($type);

        return 0.4 * $b[0] / $base[0] + 0.4 * $b[1] / $base[1] + 0.2 * $b[2] / $base[2];
    }

    /** Lv30 합산 점수: (base+bonus)*(1+g/100*29) 기준 */
    public function lv30Score(string $type, array $b, array $g): float
    {
        $base = $this->base($type);
        $w = [0.4, 0.4, 0.2];
        $s = 0.0;
        foreach ([0, 1, 2] as $i) {
            $s += $w[$i] * ($base[$i] + $b[$i]) * (1 + $g[$i] / 100 * 29) / $base[$i];
        }

        return $s;
    }

    /** @return array<string,mixed> heroes.json 호환 항목 + _gen 메타 */
    public function generate(string $code, array $pool, ?array $profile): array
    {
        $rar = $pool['rarity'];
        $type = $pool['unit_type'];
        $cc = $this->centered($profile);
        $c = $cc['c'];
        $fr = $this->frame($rar, $type);
        $bw = $this->rules['profile_to_stat']['bonus_weights'];
        $rb = [];
        foreach (['hp_bonus', 'atk_bonus', 'def_bonus'] as $i => $k) {
            $rb[$i] = array_sum(array_map(fn ($ax, $w) => $w * $c[$ax], array_keys($bw[$k]), $bw[$k]));
        }
        // step3 제로섬 재분배
        $base = $this->base($type);
        $w = [0.4 / $base[0], 0.4 / $base[1], 0.2 / $base[2]];
        $den = array_sum(array_map(fn ($i) => $w[$i] * $fr[$i], [0, 1, 2]));
        $m = $den > 0 ? array_sum(array_map(fn ($i) => ($w[$i] * $fr[$i] / $den) * $rb[$i], [0, 1, 2])) : 0.0;
        $bonus = [];
        foreach ([0, 1, 2] as $i) {
            $bonus[$i] = max(0.5 * $fr[$i], min(1.6 * $fr[$i], $fr[$i] * (1 + 0.12 * ($rb[$i] - $m))));
        }
        $raw = $bonus;
        // step6 반올림 + 예산 상한(틀 점수) 초과 시 가중이 낮은 축부터 -1
        $rounded = array_map(fn ($x) => (int) round($x), $bonus);
        $cap = $this->bonusScore($type, $fr);
        $order = [0, 1, 2];
        usort($order, fn ($a, $b) => [$w[$a], $a] <=> [$w[$b], $b]);
        for ($guard = 0; $guard < 30 && $this->bonusScore($type, $rounded) > $cap + 1e-9; $guard++) {
            foreach ($order as $i) {
                if ($rounded[$i] > 0) {
                    $rounded[$i]--;
                    break;
                }
            }
        }
        // step4 성장률
        [$lo, $hi] = $this->rules['frame']['growth_range_pct'][$rar];
        $pos = $this->rules['frame']['growth_type_position'][$type];
        $gw = $this->rules['profile_to_stat']['growth_weights'];
        $growth = [];
        foreach (['growth_hp_pct', 'growth_atk_pct', 'growth_def_pct'] as $i => $k) {
            $rg = array_sum(array_map(fn ($ax, $wt) => $wt * $c[$ax], array_keys($gw[$k]), $gw[$k]));
            $p = max(0.0, min(1.0, 0.2 + 0.6 * $pos[$i] + 0.12 * $rg));
            $growth[$i] = round($lo + ($hi - $lo) * $p, 1);
        }
        $rounded[0] = self::FIXED_HP_BONUS;   // hp 고정(예산 재배분 없음: 공·방 기준 재설계는 임밸런)
        $growth[0] = self::FIXED_GROWTH_HP_PCT;
        $aura = $this->aura($rar, $c);
        $warn = [];
        $ver = array_filter($cc['neutral']);
        if ($cc['missing']) {
            $warn[] = '프로필 없음: 6축 모두 중립(2.5) 처리';
        } elseif ($ver) {
            $warn[] = '중립 처리 축(verify/null): '.implode(',', $ver).(count($ver) > 4 ? ' (4축 초과)' : '');
        }

        return [
            'code' => $code, 'name_ko' => $pool['name_ko'], 'name_en' => null, 'culture' => $pool['culture'] ?? null,
            'born' => null, 'died' => null, 'era' => null, 'region' => null,
            'unit_type' => $type, 'rarity' => $rar, 'cost' => $this->rules['frame']['cost'][$rar],
            'hp_bonus' => $rounded[0], 'atk_bonus' => $rounded[1], 'def_bonus' => $rounded[2],
            'growth_hp_pct' => $growth[0], 'growth_atk_pct' => $growth[1], 'growth_def_pct' => $growth[2],
            'skill' => null, 'aura' => $aura['code'], 'verify' => $cc['missing'] || count($ver) > 0, 'note' => 'auto-generated candidate',
            '_gen' => [
                'neutral_axes' => array_values($cc['neutral']), 'profile_missing' => $cc['missing'], 'warnings' => $warn,
                'bonus_unrounded' => array_map(fn ($x) => round($x, 2), $raw), 'frame_bonus' => array_map(fn ($x) => round($x, 2), $fr),
                'aura_candidate' => $aura['candidate'], 'skill_candidates' => $this->skillCandidates($rar, $type, $c), 'offset' => 0,
            ],
        ];
    }

    /** @return array{code:?string,candidate:array} */
    private function aura(string $rar, array $c): array
    {
        $cmd = $c['CMD'];
        $tier = $cmd >= 1.5 ? 'strong' : ($cmd >= 0.5 ? 'mid' : 'weak');
        $cap = ['S' => 'strong', 'A' => 'strong', 'B' => 'mid', 'C' => 'weak'][$rar];
        $order = ['weak' => 0, 'mid' => 1, 'strong' => 2];
        $tier = $order[$tier] > $order[$cap] ? $cap : $tier;
        $kind = abs($c['OFF'] - $c['DEF']) <= 0.5 ? 'both' : ($c['OFF'] > $c['DEF'] ? 'atk' : 'def');
        // 현재 정의된 오라 코드는 strong급 3종뿐: weak/mid는 후보만 출력(aura=null)
        $code = $tier === 'strong' ? ['atk' => 'aura_atk', 'def' => 'aura_def', 'both' => 'aura_both'][$kind] : null;

        return ['code' => $code, 'candidate' => ['kind' => $kind, 'tier' => $tier, 'radius' => 2]];
    }

    /** 스킬 점수 환산(점수 규칙: point_system) */
    public function skillPoints(string $type, array $params): float
    {
        $ps = $this->skillTemplates['point_system'] ?? [];
        $u = $ps['unit_points'] ?? [];

        return ($params['atk_pct'] ?? 0) * ($u['atk_pct_per_1pct']['value'] ?? 3) * ($ps['type_multiplier_atk_pct'][$type] ?? 1)
            + ($params['def_pct'] ?? 0) * ($u['def_pct_per_1pct']['value'] ?? 1) * ($ps['type_multiplier_def_pct'][$type] ?? 1)
            + ($params['heal'] ?? 0) * ($u['heal_per_1hp']['value'] ?? 2.5);
    }

    /** @return string[] 공유 스킬 후보 코드(최대 3, 최종 선택은 사람) */
    private function skillCandidates(string $rar, string $type, array $c): array
    {
        $cap = ['S' => 70, 'A' => 54, 'B' => 35, 'C' => 19][$rar];
        $fit = ['T_ATK_UP' => $c['OFF'], 'T_DEF_UP' => $c['DEF'], 'T_ATKDEF_HYBRID' => ($c['OFF'] + $c['DEF']) / 2, 'T_HEAL_UP' => $c['INT']];
        $out = [];
        foreach ($this->skillTemplates['shared_supported_combo_table']['passive'] ?? [] as $s) {
            $t = $s['template'];
            if (! in_array($rar, $s['allowed_rarity'] ?? [], true) || ($t === 'T_HEAL_UP') !== ($type === 'healer') && $t === 'T_HEAL_UP'
                || ($type === 'healer' && in_array($t, ['T_ATK_UP', 'T_ATKDEF_HYBRID'], true))
                || $this->skillPoints($type, $s['params']) > $cap) {
                continue;
            }
            $out[] = [$fit[$t] ?? 0, $s['code']];
        }
        usort($out, fn ($a, $b) => [$b[0], $a[1]] <=> [$a[0], $b[1]]);

        return array_slice(array_column($out, 1), 0, 3);
    }

    /**
     * 후보 항목 감사(A1~A10). @param array $profile 프로필 항목(없으면 null)
     *
     * @return array{rows:array<int,array{0:string,1:string,2:string}>,dev:float,s30:float,frame_s30:float}
     */
    public function audit(array $h, ?array $profile): array
    {
        $rar = $h['rarity'];
        $type = $h['unit_type'];
        $b = [$h['hp_bonus'], $h['atk_bonus'], $h['def_bonus']];
        $g = [$h['growth_hp_pct'], $h['growth_atk_pct'], $h['growth_def_pct']];
        $fr = $this->frame($rar, $type);
        $fg = $this->frameGrowth($rar, $type);
        $hpFixed = (int) $h['hp_bonus'] === self::FIXED_HP_BONUS && (float) $h['growth_hp_pct'] === self::FIXED_GROWTH_HP_PCT;
        $b[0] = $fr[0];   // hp 는 고정값이라 틀 점수 비교에서 제외(편차 0 취급), 대신 A12 에서 고정값 여부를 검사
        $g[0] = $fg[0];
        $s30 = $this->lv30Score($type, $b, $g);
        $frameS30 = $this->lv30Score($type, $fr, $fg);
        $dev = ($s30 / $frameS30 - 1) * 100;
        $rows = [];
        $add = function (string $id, string $lv, string $msg) use (&$rows) {
            $rows[] = [$id, $lv, $msg];
        };
        $add('A12', $hpFixed ? 'OK' : 'FAIL', sprintf('hp 고정 10 / 성장 3.0 (현재 %s / %s)', $h['hp_bonus'], $h['growth_hp_pct']));
        $add('A1', $dev > 8 || $dev < -15 ? 'FAIL' : ($dev > 5 || $dev < -8 ? 'WARN' : 'OK'), sprintf('Lv30 점수 편차 %+.1f%%', $dev));
        $d2 = ($this->bonusScore($type, $b) / max(1e-9, $this->bonusScore($type, $fr)) - 1) * 100;
        $add('A2', $d2 > 20 ? 'FAIL' : ($d2 > 10 ? 'WARN' : 'OK'), sprintf('Lv1 보너스 점수 편차 %+.1f%%', $d2));
        [$lo, $hi] = $this->rules['frame']['growth_range_pct'][$rar];
        $bad = array_filter($g, fn ($x) => $x < $lo - 0.05 || $x > $hi + 0.05);
        $add('A3', $bad ? 'FAIL' : 'OK', $bad ? "성장률 범위 [$lo,$hi] 밖: ".implode('/', $g) : "성장률 범위 [$lo,$hi] 안");
        $ratios = array_map(fn ($i) => $fr[$i] > 0 ? $b[$i] / $fr[$i] : 1, [0, 1, 2]);
        $neg = array_values(array_filter([0, 1, 2], fn ($i) => $b[$i] < 0));   // 음수 보너스 축(병종 v2: heavy 이관 Lv1 보정 등)은 틀 비율 검사에서 제외하고 A11에서 본다
        $out4 = array_filter($ratios, fn ($r, $i) => ! in_array($i, $neg, true) && ($r < 0.5 - 0.15 || $r > 1.6 + 0.15), ARRAY_FILTER_USE_BOTH);   // 정수 반올림 오차 허용
        $add('A4', $out4 ? 'WARN' : 'OK', '보너스/틀 '.implode('/', array_map(fn ($r) => sprintf('%.2f', $r), $ratios)));
        // A11: 병종 기본값 + 보너스(음수 포함)의 실효 스탯. 0 이하는 FAIL, 기본값의 50% 미만은 WARN, 음수 보너스가 있으면 정보로 표시
        $base = $this->base($type);
        $eff = array_map(fn ($i) => $base[$i] + $b[$i], [0, 1, 2]);
        $effMin = min(array_map(fn ($i) => $eff[$i] / max(1, $base[$i]), [0, 1, 2]));
        $add('A11', min($eff) <= 0 ? 'FAIL' : ($effMin < 0.5 ? 'WARN' : 'OK'), sprintf('실효 hp/atk/def %s%s', implode('/', $eff), $neg ? ' (음수 보너스 축: '.implode(',', array_map(fn ($i) => ['hp', 'atk', 'def'][$i], $neg)).')' : ''));
        // A5~A7: 스킬(skill 코드가 공유 표/예시에 있을 때만)
        $sk = $this->findSkill($h['skill'] ?? null);
        if ($sk) {
            $budget = ['S' => 100, 'A' => 70, 'B' => 45, 'C' => 25][$rar];
            $pts = $this->skillPoints($type, $sk['params']);
            $add('A5', $pts > $budget ? 'FAIL' : 'OK', sprintf('스킬 점수 %.1f / 예산 %d', $pts, $budget));
            $add('A6', $dev + 5 * ($pts / $budget) > 9 ? 'FAIL' : 'OK', sprintf('stat_dev %.1f + 5*%.2f', $dev, $pts / $budget));
            $v7 = [];
            ($type === 'healer' && isset($sk['params']['atk_pct'])) && $v7[] = 'healer atk 스킬';
            $auraAtk = ['aura_atk' => 10, 'aura_both' => 5][$h['aura'] ?? ''] ?? 0;
            ($auraAtk + ($sk['params']['atk_pct'] ?? 0) > 20) && $v7[] = '오라+패시브 atk>20';
            $add('A7', $v7 ? 'FAIL' : 'OK', $v7 ? implode(', ', $v7) : '스킬 제약 통과');
        }
        $s = fn (string $ax) => ($profile['axes'][$ax]['score'] ?? null) !== null && in_array($profile['axes'][$ax]['evidence_level'] ?? '', ['confirmed', 'accepted'], true) ? $profile['axes'][$ax]['score'] : null;
        $contra = [];
        ($type === 'cavalry' && $s('MOB') !== null && $s('OFF') !== null && $s('MOB') < 3 && $s('OFF') < 3) && $contra[] = 'cavalry: MOB<3 & OFF<3';
        ($type === 'mage' && $s('INT') !== null && $s('INT') < 3) && $contra[] = 'mage: INT<3';
        ($type === 'healer' && $s('OFF') !== null && $s('OFF') >= 3) && $contra[] = 'healer: OFF>=3';
        (in_array($type, ['archer', 'gunner'], true) && $s('OFF') !== null && $s('OFF') < 2) && $contra[] = $type.': OFF<2';
        $add('A8', $contra ? 'WARN' : 'OK', $contra ? implode(', ', $contra) : '병종-프로필 모순 없음');
        $off = abs((float) ($h['_gen']['offset'] ?? 0));
        $add('A9', $off > 5 ? 'FAIL' : 'OK', "balance_offset {$off}%");
        $neutral = $profile === null ? 6 : count(array_filter(HeroStatRules::AXES, fn ($ax) => $s($ax) === null));
        $noBasis = $profile === null ? [] : array_filter(self::AXES, fn ($ax) => ($profile['axes'][$ax]['score'] ?? null) !== null && trim((string) ($profile['axes'][$ax]['basis'] ?? '')) === '');
        $add('A10', ($profile === null || $neutral > 4 || $noBasis) ? 'WARN' : 'OK', $profile === null ? '프로필 없음(중립)' : "중립 축 {$neutral}개".($noBasis ? ', 근거 문장 없는 축: '.implode(',', $noBasis) : ''));

        return ['rows' => $rows, 'dev' => $dev, 's30' => $s30, 'frame_s30' => $frameS30];
    }

    private function findSkill(?string $code): ?array
    {
        if ($code === null) {
            return null;
        }
        foreach (array_merge($this->skillTemplates['shared_supported_combo_table']['passive'] ?? [], $this->skillTemplates['migration_examples'] ?? []) as $s) {
            if (($s['code'] ?? null) === $code && isset($s['params'])) {
                return $s;
            }
        }

        return null;
    }
}
