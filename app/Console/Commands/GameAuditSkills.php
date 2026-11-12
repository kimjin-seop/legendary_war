<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\PassiveEffects;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 영웅 스킬 등급 규칙 감사(읽기 전용). 대상 = database/data/hero_skill_redistribution.json 의 영웅.
 * 규칙: S 패시브3+액티브2 / A 2+2 / B 2+1 / C 1+1 (활성 스킬 기준, 액티브가 없는 영웅은 병종 기본 액티브 1개를 센다).
 * 검사: 활성 패시브/액티브 개수, 같은 영웅 내 패시브 템플릿 중복, 비활성(enabled=0) 연결 스킬, 엔진 미지원 템플릿 연결.
 * 정보: 영웅 등급보다 높은 등급 스킬(지형 특화 등, 허용 정책) 슬롯 수. 위반이 있으면 종료 코드 1.
 */
class GameAuditSkills extends Command
{
    protected $signature = 'game:audit-skills {--hero= : 한 영웅 코드만}';

    protected $description = '영웅 스킬 등급 규칙(S5/A4/B3/C2) 감사 (읽기 전용)';

    private const ORDER = ['C' => 1, 'B' => 2, 'A' => 3, 'S' => 4];

    /** 임밸런 v4 등급 상한: S 전용 템플릿/효과. 해당하면 사유 문자열, 아니면 null */
    private function sOnlyReason(string $template, array $params): ?string
    {
        if (in_array($template, ['T_ACTIVE_PIERCE', 'T_ACTIVE_STANCE', 'T_ACTIVE_DECOY', 'T_MATCHUP_NEGATE', 'T_TERRAIN_MASTER'], true)) {
            return $template;
        }
        if (in_array($template, ['T_ACTIVE_HEAL', 'T_ACTIVE_BUFF'], true) && (int) ($params['radius'] ?? 0) >= ($template === 'T_ACTIVE_HEAL' ? 1 : 2)) {
            return $template.' 반경 '.(int) $params['radius'];
        }

        return null;
    }

    /** 영웅 병종(보·기·창·궁) 쏠림 경고: 4종 합계 대비 각 병종 비율이 18~32% 밖이면 경고(목표 범위는 임밸런 v4 troop_type_distribution) */
    private function distributionWarnings(array &$warn): void
    {
        $rows = DB::table('heroes')->join('unit_types', 'unit_types.id', '=', 'heroes.unit_type_id')->where('heroes.campaign_only', 0)
            ->whereIn('unit_types.code', ['sword', 'spear', 'cavalry', 'archer'])->selectRaw('unit_types.code as t, count(*) as n')->groupBy('unit_types.code')->pluck('n', 't')->all();
        $sum = array_sum($rows);
        foreach (['sword', 'spear', 'cavalry', 'archer'] as $t) {
            $pct = $sum > 0 ? 100 * ($rows[$t] ?? 0) / $sum : 0;
            ($pct < 18 || $pct > 32) && $warn[] = sprintf('영웅 병종 분포: %s %.1f%% (목표 18~32%%, 가챠 영웅 %d명 중)', $t, $pct, $sum);
        }
    }

    public function handle(): int
    {
        $doc = json_decode((string) @file_get_contents(database_path('data/hero_skill_redistribution.json')), true);
        if (! is_array($doc)) {
            $this->error('hero_skill_redistribution.json 을 읽을 수 없습니다.');

            return self::FAILURE;
        }
        $grade = [];   // skill code => grade
        foreach ($doc['heroes'] as $h) {
            foreach (array_merge($h['passives'] ?? [], $h['actives'] ?? []) as $s) {
                $grade[$s['code']] = $s['grade'] ?? null;
            }
        }
        foreach ($doc['new_skills'] as $c => $s) {
            $grade[$c] = $s['grade'] ?? ($grade[$c] ?? null);
        }
        $heroes = DB::table('heroes')->pluck('id', 'code');
        $links = DB::table('hero_skills')->join('skills', 'skills.id', '=', 'hero_skills.skill_id')
            ->orderBy('hero_skills.hero_id')->orderBy('hero_skills.sort_order')
            ->get(['hero_skills.hero_id', 'skills.code', 'skills.type', 'skills.template', 'skills.enabled', 'skills.review_status', 'skills.params'])->groupBy('hero_id');
        $bad = [];
        $warn = [];   // 경고(종료 코드에 영향 없음): 등급 상한·병종 분포
        $upper = 0;
        $total = 0;
        $held = 0;
        $byRarity = [];
        foreach ($doc['heroes'] as $code => $h) {
            if ($this->option('hero') && $this->option('hero') !== $code) {
                continue;
            }
            $rarity = $h['rarity'];
            $rule = $doc['rules'][$rarity];
            $hid = $heroes[$code] ?? null;
            if ($hid === null) {
                (($h['source'] ?? null) === 'expansion_hold' || str_starts_with($code, 'npc_')) ? $held++ : $bad[] = "{$code}: heroes 에 없음";   // 확장 보류 영웅은 아직 시드 전

                continue;
            }
            $total++;
            $np = $na = 0;
            $tpls = [];
            foreach ($links[$hid] ?? [] as $l) {
                $on = (int) $l->enabled === 1;
                if (! $on) {
                    $bad[] = "{$code}: 연결된 스킬 {$l->code} 가 비활성(enabled=0)";

                    continue;
                }
                if ($l->type === 'active') {
                    isset(Engine::ACTIVE_TEMPLATES[$l->template]) ? $na++ : $bad[] = "{$code}: {$l->code} 엔진 미지원 액티브 템플릿 {$l->template}";
                    $l->review_status === 'pending_review' && $bad[] = "{$code}: {$l->code} 액티브가 pending_review(게임에서 제외됨)";
                } else {
                    in_array($l->template, PassiveEffects::SUPPORTED_TEMPLATES, true) ? $np++ : $bad[] = "{$code}: {$l->code} 엔진 미지원 패시브 템플릿 {$l->template}";
                    if (isset($tpls[$l->template])) {
                        $bad[] = "{$code}: 패시브 템플릿 중복 {$l->template} ({$tpls[$l->template]}, {$l->code})";
                    }
                    $tpls[$l->template] = $l->code;
                }
                $lp = (array) json_decode((string) $l->params, true);   // 표시 효과 비어 있음 검사: 영웅 상세 스킬 표의 효과 요약·쿨다운·횟수 칸이 '-'가 되는 스킬
                if (app(\App\Services\GameData::class)->displayEffect((string) $l->type, (string) $l->template, $lp) === '') {
                    $bad[] = "{$code}: {$l->code} 표시 효과 요약이 비어 있음({$l->template})";
                }
                $l->type === 'active' && (! isset($lp['cooldown']) || ! isset($lp['uses'])) && $bad[] = "{$code}: {$l->code} 액티브 cooldown/uses 누락(표시 칸이 '-')";
                $so = $this->sOnlyReason((string) $l->template, (array) json_decode((string) $l->params, true));
                $so !== null && $rarity !== 'S' && $warn[] = "{$code}({$rarity}): {$l->code} 는 S 전용 효과({$so})";
                if (isset(self::ORDER[$grade[$l->code] ?? '']) && self::ORDER[$grade[$l->code]] > self::ORDER[$rarity]) {
                    $upper++;
                }
            }
            $na === 0 && ArmyBuilder::defaultActives((string) $h['unit_type']) !== [] && $na = 1;   // 병종 기본 액티브 런타임 주입
            if ($np !== $rule['passive'] || $na !== $rule['active']) {
                $bad[] = sprintf('%s(%s): 패시브 %d/%d 액티브 %d/%d', $code, $rarity, $np, $rule['passive'], $na, $rule['active']);
            }
            $byRarity[$rarity] = ($byRarity[$rarity] ?? 0) + 1;
        }
        ksort($byRarity);
        $this->distributionWarnings($warn);
        $this->info("대상 영웅 {$total}명 (".implode(', ', array_map(fn ($k, $v) => "{$k} {$v}", array_keys($byRarity), $byRarity)).") / 영웅 등급보다 높은 스킬 슬롯 {$upper}개(허용 정책, 정보용)".($held ? " / 시드 전 확장 보류 영웅 {$held}명 제외" : ''));
        foreach ($warn as $w) {
            $this->line('  [경고] '.$w);
        }
        $warn !== [] && $this->warn('경고 '.count($warn).'건(등급 상한·병종 분포, 정보용)');
        if ($bad === []) {
            $this->info('위반 0건');

            return self::SUCCESS;
        }
        foreach ($bad as $b) {
            $this->line('  - '.$b);
        }
        $this->error('위반 '.count($bad).'건');

        return self::FAILURE;
    }
}
