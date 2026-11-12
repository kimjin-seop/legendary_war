<?php

namespace App\Console\Commands;

use App\Game\ActiveParams;
use App\Game\Engine;
use App\Support\ActiveSkillAssignments;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 액티브 스킬 2단계 영웅 배정만 적재하는 전용 경로(전체 game:seed --force 없이 개발 DB 반영).
 * 원본 database/data/active_skill_assignments.json -> skills(code 기준 신규만 insert, --overwrite 시 기존 행 갱신) + hero_skills(신규 연결만 추가, 영웅당 액티브 1개, 기존 연결 뒤 sort_order).
 * 기존 패시브 배정·기존 4종(heroes.skill_id 연결)은 건드리지 않는다. 멱등(재실행 시 변경 없음, 연결 중복 없음, 어드민 수정 보존).
 */
class GameSeedActiveSkills extends Command
{
    protected $signature = 'game:seed-active-skills {--dry-run : 검증과 변경 예정 건수만 출력하고 DB는 쓰지 않음} {--overwrite : 기존 skills 행도 원본 값으로 갱신(기본은 신규만 insert, 어드민 수정 보존)}';

    protected $description = '액티브 스킬 배정(active_skill_assignments.json)을 skills/hero_skills에 멱등 적재';

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행하지 않습니다.');

            return self::FAILURE;
        }
        foreach (['template', 'enabled', 'params'] as $c) {
            if (! Schema::hasColumn('skills', $c)) {
                $this->error("skills.{$c} 컬럼이 없습니다. php artisan migrate 후 다시 실행하세요.");

                return self::FAILURE;
            }
        }
        $hasFlags = Schema::hasColumn('skills', 'needs_verify') && Schema::hasColumn('skills', 'review_status');
        $hasEvidence = Schema::hasColumn('skills', 'evidence_level');
        $hasMeta = Schema::hasColumn('skills', 'tags') && Schema::hasColumn('skills', 'is_invented') && Schema::hasColumn('skills', 'rarity_min');
        $hasFlags || $this->warn('skills.needs_verify/review_status 컬럼 없음: 검수 표식 없이 적재합니다(migrate 후 재실행 권장).');

        $items = ActiveSkillAssignments::load();
        if ($items === []) {
            $this->error('배정 파일이 없거나 비어 있습니다: '.ActiveSkillAssignments::path());

            return self::FAILURE;
        }
        $managed = $this->gradeManagedHeroes();   // 스킬 등급 재분배(game:seed-skill-grades) 적용 영웅: 연결은 그쪽이 소유 -> 재삽입·1영웅 1액티브 검증 대상 아님
        $errors = $this->validate($items, $managed);
        if ($errors) {
            foreach ($errors as $e) {
                $this->error($e);
            }

            return self::FAILURE;
        }

        $heroes = DB::table('heroes')->pluck('id', 'code');
        $existing = DB::table('skills')->pluck('id', 'code');
        $now = now();
        $plan = ['skills_new' => 0, 'skills_upd' => 0, 'links_new' => 0, 'enabled' => 0, 'disabled' => 0, 'by_tpl' => []];
        $dry = (bool) $this->option('dry-run');
        $overwrite = (bool) $this->option('overwrite');
        $run = function () use ($items, $managed, $heroes, $existing, $now, $hasFlags, $hasEvidence, $hasMeta, $dry, $overwrite, &$plan) {
            foreach ($items as $it) {
                $row = ['name' => $it['name'], 'type' => 'active', 'params' => json_encode($it['params'], JSON_UNESCAPED_UNICODE), 'description' => null, 'template' => $it['template'], 'flavor' => $it['flavor'] ?? null,
                    'enabled' => $it['enabled'] ? 1 : 0, 'updated_at' => $now];
                $hasEvidence && $row['evidence_level'] = $it['ev'] ?? null;
                $hasMeta && $row += ['tags' => json_encode([]), 'is_invented' => 1, 'rarity_min' => $it['rarity'] ?? null];
                $hasFlags && $row += ['needs_verify' => (isset($it['flavor']) && empty($it['needs_verify'])) ? 0 : 1, 'review_status' => null];   // 기본은 flavor 숨김(needs_verify=1). 송서사 검수로 flavor 가 확정된 항목만 needs_verify=false 로 해제
                $sid = $existing[$it['skill_code']] ?? null;
                if ($sid === null) {
                    $plan['skills_new']++;
                    $sid = $dry ? 0 : DB::table('skills')->insertGetId(['code' => $it['skill_code'], 'created_at' => $now] + $row);
                } elseif ($overwrite) {
                    $plan['skills_upd']++;
                    $dry || DB::table('skills')->where('id', $sid)->update($row);
                }   // 기존 행은 기본 미변경(어드민이 수정한 review_status/enabled/params 보존). --overwrite일 때만 갱신
                $hid = (int) $heroes[$it['hero']];
                if (isset($managed[$it['hero']])) {
                    continue;   // 등급 재분배 영웅: skills 행만 다루고 hero_skills 는 건드리지 않는다(재분배 결과 보존)
                }
                $linked = $sid !== 0 && DB::table('hero_skills')->where('hero_id', $hid)->where('skill_id', $sid)->exists();   // dry-run의 신규 스킬(sid=0)은 연결 없음
                if (! $linked) {
                    $plan['links_new']++;
                    $dry || DB::table('hero_skills')->insert(['hero_id' => $hid, 'skill_id' => $sid, 'sort_order' => min(250, 1 + (int) DB::table('hero_skills')->where('hero_id', $hid)->max('sort_order')), 'created_at' => $now, 'updated_at' => $now]);
                }
                $plan[$it['enabled'] ? 'enabled' : 'disabled']++;
                $plan['by_tpl'][$it['template']][$it['enabled'] ? 'on' : 'off'] = ($plan['by_tpl'][$it['template']][$it['enabled'] ? 'on' : 'off'] ?? 0) + 1;
            }
        };
        $dry ? $run() : DB::transaction($run);

        $this->info(sprintf('%s: 배정 %d명 / skills 신규 %d·갱신 %d / hero_skills 신규 연결 %d / 활성 %d·비활성(needs_verify) %d', $dry ? 'dry-run' : '적재 완료', count($items), $plan['skills_new'], $plan['skills_upd'], $plan['links_new'], $plan['enabled'], $plan['disabled']));
        if ($overwrite) {
            $this->warn(sprintf('--overwrite: 기존 skills %d행을 %s(어드민 수정값 review_status/enabled/params 덮어씀).', $plan['skills_upd'], $dry ? '덮어쓸 예정' : '덮어씀'));
        }
        ksort($plan['by_tpl']);
        foreach ($plan['by_tpl'] as $t => $c) {
            $this->line(sprintf('  %-18s 활성 %d / 비활성 %d', $t, $c['on'] ?? 0, $c['off'] ?? 0));
        }

        return self::SUCCESS;
    }

    /** @return array<string,int> app_settings.skill_grades 표식의 영웅 code => 1 (표식 없으면 빈 배열) */
    private function gradeManagedHeroes(): array
    {
        $v = Schema::hasTable('app_settings') ? json_decode((string) DB::table('app_settings')->where('key', 'skill_grades')->value('value'), true) : null;

        return array_flip((array) ($v['heroes'] ?? []));
    }

    /** @return string[] 오류 목록 */
    private function validate(array $items, array $managed = []): array
    {
        $errors = [];
        $heroes = DB::table('heroes')->pluck('id', 'code');
        $seenHero = [];
        $seenCode = [];
        // 기존 액티브 보유 영웅: 연결(hero_skills) 또는 대표 스킬(heroes.skill_id)이 active인 다른 스킬
        $hasActive = [];
        foreach (DB::table('hero_skills')->join('skills', 'skills.id', '=', 'hero_skills.skill_id')->where('skills.type', 'active')->get(['hero_skills.hero_id', 'skills.code']) as $r) {
            $hasActive[(int) $r->hero_id][] = $r->code;
        }
        foreach (DB::table('heroes')->join('skills', 'skills.id', '=', 'heroes.skill_id')->where('skills.type', 'active')->get(['heroes.id', 'skills.code']) as $r) {
            $hasActive[(int) $r->id][] = $r->code;
        }
        foreach (DB::table('skills')->whereIn('code', array_column($items, 'skill_code'))->get(['code', 'type']) as $r) {
            $r->type === 'active' || $errors[] = "{$r->code}: 이미 존재하는 스킬이 active가 아닙니다(type={$r->type}).";
        }
        foreach ($items as $it) {
            $c = $it['skill_code'] ?? '?';
            isset($heroes[$it['hero'] ?? '']) || $errors[] = "{$c}: 영웅 {$it['hero']} 없음";
            isset($seenHero[$it['hero']]) && $errors[] = "{$c}: 영웅 {$it['hero']}에 액티브가 둘 이상(한 영웅 액티브 1개)";
            isset($seenCode[$c]) && $errors[] = "{$c}: code 중복";
            $seenHero[$it['hero']] = $seenCode[$c] = true;
            isset(Engine::ACTIVE_TEMPLATES[$it['template'] ?? '']) || $errors[] = "{$c}: 엔진 미지원 템플릿 {$it['template']}";
            foreach (ActiveParams::violations((string) ($it['template'] ?? ''), (array) ($it['params'] ?? [])) as $v) {
                $errors[] = "{$c}: params {$v}";
            }
            $others = array_diff($hasActive[(int) ($heroes[$it['hero']] ?? 0)] ?? [], [$c]);
            $others && ! isset($managed[$it['hero']]) && $errors[] = "{$c}: 영웅 {$it['hero']}에 이미 액티브 ".implode(',', $others).' 보유(한 영웅 액티브 1개)';
        }

        return $errors;
    }
}
