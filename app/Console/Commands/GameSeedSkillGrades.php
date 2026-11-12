<?php

namespace App\Console\Commands;

use App\Game\ActiveParams;
use App\Game\Engine;
use App\Game\PassiveEffects;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 영웅 스킬 등급별 재분배 적용(개발 DB 전용, 멱등). 원본 database/data/hero_skill_redistribution.json (v2).
 *  - new_skills(rd_* 105개: 이름·flavor 병합본, 마지막 6개는 S급 2단계 phase2)를 skills 에 upsert(command 소유 행이라 매번 원본 값으로 갱신).
 *  - 영웅별 최종 연결 = passives + actives(default_only 제외) 순서대로. 목록 밖의 기존 연결(dormant/removed/replace/convert 원본)은 hero_skills 에서만 해제한다(skills 행은 보존).
 *  - 엔진이 지원하게 된 기존 keep 스킬(engine:pending)은 enabled=1 로 켠다.
 *  - phase2(S급 3명): 교체 대상 패시브를 빼고 S급 패시브를 넣고, 두 번째 액티브를 S급 액티브로 교체한다.
 *  - default_only 슬롯은 연결을 만들지 않는다(병종 기본 액티브 런타임 주입). materialize_default(params:null) 행은 default_active_skills.json 의 병종 기본값으로 채운다.
 * 운영 환경(APP_ENV=production)에서는 실행하지 않는다. 변경 전 반드시 스냅샷(scripts/backup/backup-local.sh)과 --dry-run.
 */
class GameSeedSkillGrades extends Command
{
    protected $signature = 'game:seed-skill-grades {--dry-run : 검증과 변경 예정 건수만 출력하고 DB는 쓰지 않음(트랜잭션 롤백)} {--no-prune : 목록 밖 기존 연결을 해제하지 않음}';

    protected $description = '영웅 스킬 등급 재분배(hero_skill_redistribution.json v2)를 skills/hero_skills에 멱등 적용 (개발 DB 전용)';

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행하지 않습니다.');

            return self::FAILURE;
        }
        $path = database_path('data/hero_skill_redistribution.json');
        $doc = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (! is_array($doc) || ! isset($doc['heroes'], $doc['new_skills'], $doc['rules'])) {
            $this->error('원본 JSON을 읽을 수 없습니다: '.$path);

            return self::FAILURE;
        }
        $defaults = json_decode((string) @file_get_contents(database_path('data/default_active_skills.json')), true)['by_unit_type'] ?? [];

        // 1) 영웅별 최종 슬롯 계산 + 검증
        $plan = [];
        $skipped = [];
        $errors = [];
        $existing = DB::table('skills')->pluck('id', 'code')->all();
        $heroIds = DB::table('heroes')->pluck('id', 'code')->all();
        foreach ($doc['heroes'] as $hero => $h) {
            if (! isset($heroIds[$hero])) {
                if (($h['source'] ?? null) === 'expansion_hold' || str_starts_with($hero, 'npc_')) {   // 확장 보류 영웅·NPC 승격 영웅(NPC 행은 game:seed-imjin10 --with-npc 로 적재, 없는 DB에서는 생략): 아직 heroes 에 없음 -> 연결 생략(스킬 행은 미리 적재)
                    $skipped[] = $hero;
                } else {
                    $errors[] = "{$hero}: heroes 테이블에 없음";
                }

                continue;
            }
            $passives = array_column($h['passives'] ?? [], 'code');
            $actives = array_column(array_filter($h['actives'] ?? [], fn ($s) => $s['action'] !== 'default_only'), 'code');
            $defaultOnly = count(array_filter($h['actives'] ?? [], fn ($s) => $s['action'] === 'default_only'));
            if (! empty($h['phase2']['applied'])) {   // S급 2단계: 교체
                $p2 = $h['phase2'];
                $passives = array_values(array_diff($passives, [$p2['passive']['replace'] ?? '']));
                $passives[] = $p2['passive']['skill'];
                if (! empty($p2['active']['replace_second']) && count($actives) >= 2) {
                    $actives[1] = $p2['active']['skill'];
                } else {
                    $actives[] = $p2['active']['skill'];
                }
            }
            $target = $doc['rules'][$h['rarity']] ?? null;
            if ($target === null) {
                $errors[] = "{$hero}: 알 수 없는 등급 {$h['rarity']}";

                continue;
            }
            if (count($passives) !== $target['passive'] || count($actives) + $defaultOnly !== $target['active']) {
                $errors[] = sprintf('%s(%s): 개수 위반 패시브 %d/%d 액티브 %d+기본%d/%d', $hero, $h['rarity'], count($passives), $target['passive'], count($actives), $defaultOnly, $target['active']);
            }
            foreach (array_merge($passives, $actives) as $code) {
                isset($existing[$code]) || isset($doc['new_skills'][$code]) || $errors[] = "{$hero}: 스킬 {$code} 가 DB와 new_skills 어디에도 없음";
            }
            $plan[$hero] = array_merge($passives, $actives);
        }
        // 2) new_skills 행 준비/검증
        $rows = [];
        foreach ($doc['new_skills'] as $code => $s) {
            $params = $s['params'] ?? null;
            if ($params === null) {   // materialize_default: 병종 기본 액티브 값
                $hero = $this->heroOfMaterialize($doc, $code);
                $params = $defaults[$doc['heroes'][$hero]['unit_type'] ?? '']['params'] ?? null;
                $params === null && $errors[] = "{$code}: 기본 액티브 params 를 찾을 수 없음";
            }
            $enabled = true;
            if ($s['type'] === 'active') {
                $enabled = isset(Engine::ACTIVE_TEMPLATES[$s['template']]);
                foreach (ActiveParams::violations((string) $s['template'], (array) $params) as $v) {
                    $errors[] = "{$code}: params {$v}";
                }
            } else {
                $enabled = in_array($s['template'], PassiveEffects::SUPPORTED_TEMPLATES, true);
                foreach ((array) ($params['effects'] ?? []) as $e) {
                    isset($e['when']) && ! PassiveEffects::whenSupported($e['when']) && $errors[] = "{$code}: 미지원 when ".json_encode($e['when']);
                }
            }
            $enabled || $errors[] = "{$code}: 엔진 미지원 템플릿 {$s['template']}";
            $rows[$code] = ['s' => $s, 'params' => $params, 'enabled' => $enabled];
        }
        if ($errors) {
            foreach ($errors as $e) {
                $this->error($e);
            }

            return self::FAILURE;
        }

        $dry = (bool) $this->option('dry-run');
        $prune = ! $this->option('no-prune');
        $st = ['hero_attr' => 0, 'overrides' => 0, 'enable_ex' => 0, 'skipped' => count($skipped), 'skills_new' => 0, 'skills_upd' => 0, 'enabled_on' => 0, 'flavor_on' => 0, 'links_new' => 0, 'links_del' => 0, 'links_resort' => 0, 'heroes' => count($plan)];
        $run = function () use ($rows, $plan, $heroIds, $prune, $doc, &$st, &$mark) {
            $now = now();
            $has = fn (string ...$c) => array_reduce($c, fn ($ok, $x) => $ok && Schema::hasColumn('skills', $x), true);
            foreach ($rows as $code => $r) {
                $s = $r['s'];
                $row = ['name' => $s['name_ko'] ?? $code, 'type' => $s['type'], 'params' => json_encode($r['params'], JSON_UNESCAPED_UNICODE), 'description' => null, 'template' => $s['template'],
                    'flavor' => $s['flavor'] ?? null, 'enabled' => $r['enabled'] ? 1 : 0, 'updated_at' => $now];
                $has('evidence_level') && $row['evidence_level'] = 'invented';
                $has('tags', 'is_invented', 'rarity_min') && $row += ['tags' => json_encode(! empty($s['terrain_specialist']) ? ['terrain_specialist'] : []), 'is_invented' => 1, 'rarity_min' => $s['grade'] ?? null];
                $has('needs_verify', 'review_status') && $row += ['needs_verify' => ! empty($s['provisional_name']) ? 1 : 0, 'review_status' => null];   // 송서사가 쓴 이름·flavor 는 표시. 임시 이름(phase2)은 flavor 숨김
                $id = DB::table('skills')->where('code', $code)->value('id');
                if ($id === null) {
                    $st['skills_new']++;
                    DB::table('skills')->insert(['code' => $code, 'created_at' => $now] + $row);
                } else {
                    $st['skills_upd']++;
                    DB::table('skills')->where('id', $id)->update($row);
                }
            }
            // 기존 스킬(코드 유지)의 params 상한 보정(영웅 1명 전용 스킬, v3 param_overrides)
            foreach (($doc['param_overrides'] ?? []) as $code => $o) {
                $n = DB::table('skills')->where('code', $code)->update(['params' => json_encode($o['params'], JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
                $n === 1 && $st['overrides']++;
            }
            // 엔진 지원이 된 기존 스킬 활성화(v3 enable_existing)
            foreach (($doc['enable_existing'] ?? []) as $code) {
                $k = DB::table('skills')->where('code', $code)->first(['id', 'type', 'template', 'enabled']);
                if ($k && (int) $k->enabled === 0 && ($k->type === 'active' ? isset(Engine::ACTIVE_TEMPLATES[$k->template]) : in_array($k->template, PassiveEffects::SUPPORTED_TEMPLATES, true))) {
                    DB::table('skills')->where('id', $k->id)->update(['enabled' => 1, 'updated_at' => $now]);
                    $st['enable_ex']++;
                }
            }
            // 영웅 등급·영웅 병종·부대 병종 동기화(코스트는 건드리지 않음: 보유 영웅 유지 정책)
            $utypes = DB::table('unit_types')->pluck('id', 'code');
            foreach ($doc['heroes'] as $hero => $h) {
                if (! isset($heroIds[$hero]) || ! isset($utypes[$h['unit_type']])) {
                    continue;
                }
                $cur = DB::table('heroes')->where('id', $heroIds[$hero])->first(['rarity', 'unit_type_id', 'troop_type']);
                $upd = [];
                $cur->rarity !== $h['rarity'] && $upd['rarity'] = $h['rarity'];
                (int) $cur->unit_type_id !== (int) $utypes[$h['unit_type']] && $upd['unit_type_id'] = $utypes[$h['unit_type']];
                isset($h['troop_type']) && $cur->troop_type !== $h['troop_type'] && $upd['troop_type'] = $h['troop_type'];
                if ($upd) {
                    DB::table('heroes')->where('id', $heroIds[$hero])->update($upd + ['updated_at' => $now]);
                    $st['hero_attr']++;
                }
            }
            $ids = DB::table('skills')->get(['id', 'code', 'type', 'template', 'enabled'])->keyBy('code');
            // 엔진이 지원하게 된 기존 keep 스킬(engine:pending) 활성화
            foreach (array_unique(array_merge(...array_values($plan))) as $code) {
                $k = $ids[$code] ?? null;
                if ($k === null || (int) $k->enabled === 1 || str_starts_with($code, 'rd_')) {
                    continue;
                }
                $ok = $k->type === 'active' ? isset(Engine::ACTIVE_TEMPLATES[$k->template]) : in_array($k->template, PassiveEffects::SUPPORTED_TEMPLATES, true);
                if ($ok) {
                    $st['enabled_on']++;
                    DB::table('skills')->where('id', $k->id)->update(['enabled' => 1, 'updated_at' => $now]);
                }
            }
            // 송서사 검수로 flavor 가 확정된(needs_verify/hv=false, pending 아님) 기존 스킬은 숨김 해제 + flavor 반영(액티브 배정안·패시브 배정안 원본 기준)
            $verified = [];
            foreach (\App\Support\ActiveSkillAssignments::load() as $it) {
                isset($it['flavor']) && empty($it['needs_verify']) && $verified[$it['skill_code']] = $it['flavor'];
            }
            $pa = json_decode((string) @file_get_contents(database_path('data/hero_skill_assignments.json')), true)['heroes'] ?? [];
            foreach ($pa as $ph) {
                foreach (array_merge($ph['skills'] ?? [], $ph['pending_review'] ?? []) as $sk) {
                    isset($sk['flavor']) && empty($sk['hv']) && ($sk['status'] ?? null) !== 'pending_review' && $verified[$sk['code']] = $sk['flavor'];
                }
            }
            $used = array_flip(array_merge(...array_values($plan)));
            foreach ($verified as $code => $fl) {
                if (isset($used[$code]) && ! str_starts_with($code, 'rd_')
                    && DB::table('skills')->where('code', $code)->where(fn ($q) => $q->where('needs_verify', 1)->orWhere('review_status', 'pending_review'))->exists()) {
                    $st['flavor_on']++;
                    DB::table('skills')->where('code', $code)->update(['flavor' => $fl, 'needs_verify' => 0, 'review_status' => null, 'updated_at' => $now]);
                }
            }
            // 영웅별 연결
            foreach ($plan as $hero => $codes) {
                $hid = (int) $heroIds[$hero];
                $want = [];
                foreach ($codes as $i => $code) {
                    $want[(int) $ids[$code]->id] = $i + 1;
                }
                $cur = DB::table('hero_skills')->where('hero_id', $hid)->get(['id', 'skill_id', 'sort_order']);
                $seen = [];
                foreach ($cur as $c) {
                    $sid = (int) $c->skill_id;
                    if (! isset($want[$sid]) || isset($seen[$sid])) {
                        if ($prune || isset($seen[$sid])) {
                            $st['links_del']++;
                            DB::table('hero_skills')->where('id', $c->id)->delete();
                        }

                        continue;
                    }
                    $seen[$sid] = true;
                    if ((int) $c->sort_order !== $want[$sid]) {
                        $st['links_resort']++;
                        DB::table('hero_skills')->where('id', $c->id)->update(['sort_order' => $want[$sid], 'updated_at' => $now]);
                    }
                }
                foreach ($want as $sid => $order) {
                    if (! isset($seen[$sid])) {
                        $st['links_new']++;
                        DB::table('hero_skills')->insert(['hero_id' => $hid, 'skill_id' => $sid, 'sort_order' => $order, 'created_at' => $now, 'updated_at' => $now]);
                    }
                }
            }
            $mark();
        };
        $mark = fn () => Schema::hasTable('app_settings') && DB::table('app_settings')->upsert([['key' => 'skill_grades', 'value' => json_encode(['version' => $doc['version'] ?? 2, 'heroes' => array_keys($plan)], JSON_UNESCAPED_UNICODE), 'updated_at' => now()]], ['key'], ['value', 'updated_at']);   // game:seed 가 이 영웅들의 스킬 연결을 옛 배정안으로 되돌리지 않게 하는 표식
        if ($dry) {
            DB::beginTransaction();
            try {
                $run();
            } finally {
                DB::rollBack();
            }
        } else {
            DB::transaction($run);
        }
        $st['skipped'] > 0 && $this->warn("heroes 에 아직 없는 확장 보류 영웅 {$st['skipped']}명은 연결을 생략했습니다(시드 후 재실행하면 연결): ".implode(', ', $skipped));
        $this->info(sprintf('영웅 속성 갱신 %d·param 보정 %d·추가 활성 %d', $st['hero_attr'], $st['overrides'], $st['enable_ex']));
        $this->info(sprintf('%s: 영웅 %d명 / skills 신규 %d·갱신 %d / 기존 스킬 활성화 %d·flavor 공개 %d / hero_skills 신규 %d·해제 %d·순서변경 %d%s',
            $dry ? 'dry-run(DB 변경 없음)' : '적용 완료', $st['heroes'], $st['skills_new'], $st['skills_upd'], $st['enabled_on'], $st['flavor_on'], $st['links_new'], $st['links_del'], $st['links_resort'], $prune ? '' : ' (no-prune)'));

        return self::SUCCESS;
    }

    /** rd_<hero>_a1 형태 materialize 행의 영웅 코드(actives 에서 이 code 를 가진 영웅) */
    private function heroOfMaterialize(array $doc, string $code): string
    {
        foreach ($doc['heroes'] as $hero => $h) {
            foreach ($h['actives'] ?? [] as $s) {
                if (($s['code'] ?? null) === $code) {
                    return (string) $hero;
                }
            }
        }

        return '';
    }
}
