<?php

namespace App\Console\Commands;

use App\Support\HeroWave3;
use App\Support\Rarity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 3차 영웅 확장 적재(개발 DB 전용, 멱등, 기본 dry-run 롤백). 입력: 후보 JSON(송서사) + 능력치·스킬 JSON(임밸런, hero_wave3_stats.json).
 *  - 중복 검증: 신규(source=new) 코드가 heroes 에 이미 있으면 오류, 승격(source=promote) 행이 없거나 주인공이면 오류(이미 campaign_only=0 이면 "이미 승격"으로 통과).
 *  - 승격: heroes.campaign_only=0 (+ stats 항목이 있으면 병종·등급·능력치·스킬 연결 갱신, culture 는 후보값). 가챠 풀 편입은 GachaService 의 include_campaign_npc 가 자동 처리.
 *  - 신규: heroes 행 생성(culture/unit_type/rarity/능력치/hp_bonus 10 고정/스킬 연결). stats 항목이 없는 신규는 건너뛰고 목록으로 출력한다(능력치 미확정). 가챠 풀 편입은 gacha_pool.json include_hero_wave3.
 *  - hp_bonus 는 전원 10 고정(아니면 오류). 스킬 코드는 skills 테이블에 있어야 한다. troop_type 은 허용 병종(config game.hero_troop_types.allowed)만(mage 는 영웅 병종은 가능하나 부대 병종은 stats.troop_type 으로 따로 지정).
 *  - 초상·스프라이트 키가 manifest 에 없는 영웅은 목록으로 출력(FE 가 실루엣/공용 시트로 폴백).
 *  - --write-history: 역사 설명 part·인연 오버레이 파일(hero_history_part_wave3.json / hero_history_relations_wave3.json)을 후보 원본에서 생성(DB 무관).
 *  - --retire-twins: 정사 영웅과 같은 인물인 npc_william_i / npc_charles_martel 을 campaign_only=1 로(스토리 출연은 유지, 가챠·편성 풀에서만 제외; 보유 계정이 있으면 건너뜀).
 *  - --apply 시 SQLite 파일 DB 는 docker/db-backup/wave3-*.sqlite 로 먼저 백업한다(--no-backup 으로 생략).
 * game:seed 재실행으로 되돌아가지 않는다: game:seed 는 heroes.json 코드만 다루고, NPC 시더(imjin10)는 HeroWave3::promoteCodes() 행의 campaign_only=0 을 보존한다.
 */
class GameSeedHeroWave3 extends Command
{
    protected $signature = 'game:seed-hero-wave3
        {--apply : 실제 적용(기본은 dry-run 롤백)}
        {--with-reserve : 예비 후보 5명도 포함(기본은 핵심 55명)}
        {--retire-twins : npc_william_i / npc_charles_martel 을 campaign_only=1 로(정사 영웅과 중복 인물)}
        {--write-history : 역사 part·인연 오버레이 파일 생성(DB 변경 없음)}
        {--c-boost= : C 등급 보강안(stats.c_boost_options 의 B 안만 지원: 신규 B->C 6명 rarity=C, cost=2)}
        {--no-backup : --apply 시 자동 백업 생략}';

    protected $description = '3차 영웅 확장: NPC 승격 + 신규 영웅 적재(기본 dry-run, 자동 백업, 멱등)';

    private const NOTE = '3차 확장';

    private const TWINS = ['npc_william_i' => 'william_i', 'npc_charles_martel' => 'charles_martel'];

    private const STAT_COLS = ['rarity', 'cost', 'hp_bonus', 'atk_bonus', 'def_bonus', 'growth_hp_pct', 'growth_atk_pct', 'growth_def_pct'];

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행할 수 없습니다.');

            return self::FAILURE;
        }
        if ($this->option('write-history')) {
            return $this->writeHistory();
        }
        $stats = HeroWave3::stats();
        $cands = HeroWave3::candidates((bool) $this->option('with-reserve') || $stats !== []);
        if ($stats !== []) {   // stats 가 있으면 stats 에 항목이 있는 후보만 대상(중복 제외된 npc_babur 는 빠지고, 핵심으로 격상된 예비 후보는 들어온다)
            $cands = array_values(array_filter($cands, fn ($c) => isset($stats[$c['code']])));
        }
        $boost = $this->option('c-boost') === 'B' ? array_flip((array) (HeroWave3::statsDoc()['c_boost_options']['optionB_new_B_to_C']['heroes'] ?? [])) : [];
        if ($cands === []) {
            $this->error('후보 파일이 없거나 비어 있습니다.');

            return self::FAILURE;
        }
        $apply = (bool) $this->option('apply');
        if ($apply && ! $this->option('no-backup') && ! $this->backup()) {
            return self::FAILURE;
        }
        $stats === [] && $this->warn('hero_wave3_stats.json 없음/비어 있음: 승격은 플래그만 해제하고 신규는 모두 건너뜁니다.');
        $cultures = array_keys((array) (json_decode((string) @file_get_contents(database_path('data/hero_cultures.json')), true)['sets'] ?? []));
        $allowed = (array) config('game.hero_troop_types.allowed');
        $types = DB::table('unit_types')->pluck('id', 'code');
        $auras = DB::table('auras')->pluck('id', 'code');
        $cols = Schema::getColumnListing('heroes');

        $defined = HeroWave3::newSkills();
        $st = ['skills_new' => 0,'promoted' => 0, 'already' => 0, 'created' => 0, 'exists_new' => 0, 'stats_applied' => 0, 'links' => 0, 'retired' => 0];
        $errors = [];
        $skippedNew = [];
        $touched = [];

        DB::beginTransaction();
        try {
            $st['skills_new'] = $this->seedSkills($defined, $errors);
            $skills = DB::table('skills')->pluck('id', 'code');
            foreach ($cands as $c) {
                $code = (string) $c['code'];
                $src = (string) ($c['source'] ?? '');
                $row = DB::table('heroes')->where('code', $code)->first();
                $s = $stats[$code] ?? null;
                if ($s !== null && isset($boost[$code])) {
                    $s['rarity'] = 'C';
                    $s['cost'] = 2;
                    if (count((array) ($s['passives'] ?? [])) > 1) {   // C 등급 스킬 규칙(패시브 1+액티브 1): 첫 패시브만 유지
                        $this->line("  C 보강 {$code}: 패시브 ".implode(',', array_slice($s['passives'], 1)).' 연결 제외(C 규칙 1+1)');
                        $s['passives'] = array_slice($s['passives'], 0, 1);
                    }
                }
                if ($src === 'new' && $row) {
                    if (str_starts_with((string) $row->note, self::NOTE)) {   // 이 명령이 만든 행: 멱등 재실행(스킬 연결만 보충)
                        $st['exists_new']++;
                        $s !== null && $st["links"] += $this->linkSkills((int) $row->id, HeroWave3::skillList($s), DB::table("skills")->pluck("id", "code"));
                    } else {
                        $errors[] = "{$code}: 신규인데 heroes 에 이미 존재(중복)";
                    }

                    continue;
                }
                if ($src === 'promote' && (! $row || $row->is_protagonist)) {
                    $errors[] = "{$code}: 승격 대상 행 없음/주인공";

                    continue;
                }
                if ($c['culture'] ?? null) {
                    ($cultures === [] || in_array($c['culture'], $cultures, true)) || $errors[] = "{$code}: 알 수 없는 문화권 {$c['culture']}";
                }
                if ($s !== null) {   // 스킬 목록 정규화(skills > passives+actives 순서), 없는 코드는 오류
                    $s['skills'] = HeroWave3::skillList($s);
                    foreach ($s['skills'] as $m) {
                        isset($skills[$m]) || $errors[] = "{$code}: 스킬 {$m} 없음(skills/new_skills 어디에도 정의 없음)";
                    }
                    $s['skills'] = array_values(array_filter($s['skills'], fn ($x) => isset($skills[$x])));
                    foreach (['skill', 'passive_skill'] as $k) {
                        isset($s[$k]) && ! isset($skills[$s[$k]]) && $s[$k] = null;
                    }
                }
                if ($s !== null && ($e = $this->checkStats($code, $s, $types, $skills, $auras, $allowed)) !== []) {
                    array_push($errors, ...$e);

                    continue;
                }
                if ($src === 'new') {
                    if ($s === null) {
                        $skippedNew[] = $code;

                        continue;
                    }
                    $hid = $this->createHero($c, $s, $types, $skills, $auras, $cols);
                    $st['created']++;
                } else {
                    $hid = (int) $row->id;
                    $upd = [];
                    if ((bool) $row->campaign_only) {
                        $upd['campaign_only'] = 0;
                        $st['promoted']++;
                    } else {
                        $st['already']++;
                    }
                    if (($c['culture'] ?? null) && $row->culture !== $c['culture']) {
                        $upd['culture'] = $c['culture'];
                    }
                    if ($s !== null) {
                        $upd += $this->statUpdate($s, $types, $skills, $auras);
                        $st['stats_applied']++;
                    }
                    $upd !== [] && DB::table('heroes')->where('id', $hid)->update($upd + ['updated_at' => now()]);
                }
                $s !== null && $st['links'] += $this->linkSkills($hid, (array) ($s['skills'] ?? []), $skills);
                $touched[] = $code;
            }
            if ($this->option('retire-twins')) {
                $st['retired'] = $this->retireTwins();
            }
            $audit = $this->auditSkills($touched);
            $this->line(sprintf('스킬 규칙 감사(대상 %d명): 위반 %d건', count($touched), count($audit)));
            foreach ($audit as $a) {
                $this->line('  - '.$a);
            }
            foreach ($errors as $e) {
                $this->warn($e);
            }
            $this->info(($apply ? '적용' : 'dry-run(롤백)').': '.json_encode($st));
            $skippedNew && $this->line('능력치 미확정으로 건너뛴 신규 '.count($skippedNew).'명: '.implode(', ', $skippedNew));
            $miss = HeroWave3::missingAssets(array_map(fn ($c) => $c['code'], $cands));
            $this->line('초상 누락 '.count($miss['portrait']).'명(FE 폴백): '.implode(', ', $miss['portrait']));
            $this->line('스프라이트 누락 '.count($miss['sprite']).'명(병종 공용 시트 폴백): '.implode(', ', $miss['sprite']));
            if ($apply && $errors === []) {
                DB::commit();
                app(\App\Services\GameData::class)->flush();
            } else {
                DB::rollBack();
                $apply && $this->error('오류가 있어 롤백했습니다. 적용되지 않았습니다.');
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        return $errors === [] ? self::SUCCESS : self::FAILURE;
    }

    /** @return list<string> */
    private function checkStats(string $code, array $s, $types, $skills, $auras, array $allowed): array
    {
        $e = [];
        if (isset($s['hp_bonus']) && (int) $s['hp_bonus'] !== 10) {
            $e[] = "{$code}: hp_bonus 는 10 고정(현재 {$s['hp_bonus']})";
        }
        isset($s['unit_type']) && ! isset($types[$s['unit_type']]) && $e[] = "{$code}: 알 수 없는 unit_type {$s['unit_type']}";
        isset($s['rarity']) && ! in_array(Rarity::normalize((string) $s['rarity']), Rarity::ORDER, true) && $e[] = "{$code}: 알 수 없는 rarity {$s['rarity']}";
        $tt = $s['troop_type'] ?? (in_array($s['unit_type'] ?? null, $allowed, true) ? $s['unit_type'] : null);
        if ($tt !== null && ! in_array($tt, $allowed, true)) {
            $e[] = "{$code}: troop_type {$tt} 는 허용 병종 밖";
        }
        if (isset($s['unit_type']) && $tt === null) {
            $e[] = "{$code}: unit_type {$s['unit_type']} 의 부대 병종(troop_type)을 stats 에 지정해야 함";
        }
        ! empty($s['aura']) && ! isset($auras[$s['aura']]) && $e[] = "{$code}: 오라 {$s['aura']} 없음";

        return $e;
    }

    /** stats 항목 -> heroes 갱신 컬럼(있는 필드만) */
    private function statUpdate(array $s, $types, $skills, $auras): array
    {
        $u = [];
        foreach (self::STAT_COLS as $k) {
            array_key_exists($k, $s) && $u[$k] = $k === 'rarity' ? Rarity::normalize((string) $s[$k]) : $s[$k];
        }
        isset($s['unit_type']) && $u['unit_type_id'] = $types[$s['unit_type']];
        isset($s['troop_type']) && $u['troop_type'] = $s['troop_type'];
        (! isset($s['troop_type']) && isset($s['unit_type'])) && $u['troop_type'] = $s['unit_type'];
        $primary = $s['passive_skill'] ?? $s['skill'] ?? (($s['skills'] ?? [])[0] ?? null);   // 대표 = 첫 패시브(p1)
        $primary !== null && $u['skill_id'] = $skills[$primary];
        array_key_exists('aura', $s) && $u['aura_id'] = $s['aura'] ? $auras[$s['aura']] : null;
        foreach (['title', 'short_name', 'troop_bonus'] as $k) {
            array_key_exists($k, $s) && $u[$k] = $s[$k];
        }

        return $u;
    }

    private function createHero(array $c, array $s, $types, $skills, $auras, array $cols): int
    {
        foreach (['unit_type', ...self::STAT_COLS] as $k) {
            (isset($s[$k]) && $s[$k] !== '') || throw new \RuntimeException("{$c['code']}: stats.{$k} 없음");
        }
        $row = [
            'code' => $c['code'], 'name_ko' => $c['name_ko'], 'name_en' => $s['name_en'] ?? $c['name_en'] ?? $c['code'],
            'born' => $s['born'] ?? null, 'died' => $s['died'] ?? null, 'era' => mb_substr((string) ($s['era'] ?? $c['era_origin'] ?? ''), 0, 100) ?: null,
            'region' => null, 'culture' => $c['culture'] ?? null, 'troop_bonus' => 0,
            'verify' => 1, 'note' => self::NOTE.' 신규 영웅(능력치 임밸런 확정 필요)',
            'campaign_only' => 0, 'is_protagonist' => 0, 'created_at' => now(), 'updated_at' => now(),
        ] + $this->statUpdate($s + ['troop_type' => $s['troop_type'] ?? null], $types, $skills, $auras);
        $row['troop_type'] ?? ($row['troop_type'] = $s['unit_type']);
        $row['hp_bonus'] = 10;

        return (int) DB::table('heroes')->insertGetId(array_intersect_key($row, array_flip($cols)));
    }

    /** hero_skills 연결(없는 것만 추가, 순서는 stats.skills 배열 순; 기존 연결은 삭제하지 않음) */
    private function linkSkills(int $hid, array $codes, $skills): int
    {
        $n = 0;
        foreach (array_values($codes) as $i => $sc) {
            $sid = $skills[$sc];
            if (! DB::table('hero_skills')->where('hero_id', $hid)->where('skill_id', $sid)->exists()) {
                DB::table('hero_skills')->insert(['hero_id' => $hid, 'skill_id' => $sid, 'sort_order' => $i, 'created_at' => now(), 'updated_at' => now()]);
                $n++;
            }
        }

        return $n;
    }

    /**
     * stats.new_skills(w3_*) -> skills 신규 insert(기존 행은 건드리지 않음). 이름 = hero_wave3_skill_names.json(송서사) > name_ko > name_hint(임시).
     * 액티브는 엔진 템플릿/ActiveParams 검증, 패시브는 PassiveEffects::SUPPORTED_TEMPLATES 검증. flavor 가 없으면 needs_verify=1(화면 숨김).
     *
     * @return int 신규 insert 수
     */
    private function seedSkills(array $defined, array &$errors): int
    {
        $names = HeroWave3::skillNames();
        $now = now();
        $n = 0;
        $temp = 0;
        foreach ($defined as $code => $d) {
            $tpl = (string) $d['template'];
            if (($d['type'] ?? '') === 'active') {
                isset(\App\Game\Engine::ACTIVE_TEMPLATES[$tpl]) || $errors[] = "{$code}: 엔진 미지원 액티브 템플릿 {$tpl}";
                foreach (\App\Game\ActiveParams::violations($tpl, (array) $d['params']) as $v) {
                    $errors[] = "{$code}: params {$v}";
                }
            } else {
                in_array($tpl, \App\Game\PassiveEffects::SUPPORTED_TEMPLATES, true) || $errors[] = "{$code}: 엔진 미지원 패시브 템플릿 {$tpl}";
            }
            if (DB::table('skills')->where('code', $code)->exists()) {
                continue;
            }
            $nm = $names[$code]['name_ko'] ?? $d['name_ko'] ?? null;
            if (! $nm) {
                $nm = $d['name_hint'] ?? $code;
                $temp++;
            }
            $row = ['code' => $code, 'name' => mb_substr((string) $nm, 0, 60), 'type' => $d['type'], 'params' => json_encode($d['params'], JSON_UNESCAPED_UNICODE), 'description' => $names[$code]['desc_ko'] ?? null,   // desc_ko 는 수치 포함 설명이라 화면 노출(flavor)에 쓰지 않고 참고용 description 에만 보관(UI 는 params 에서 효과·쿨다운·횟수를 자동 생성)
                
                'template' => $tpl, 'tags' => json_encode($d['tags'] ?? []), 'evidence_level' => null, 'is_invented' => 1, 'rarity_min' => $d['rarity_min'] ?? null,
                'flavor' => ($names[$code]['flavor'] ?? null) ?: null, 'enabled' => ($d['enabled'] ?? true) ? 1 : 0, 'created_at' => $now, 'updated_at' => $now];
            if (Schema::hasColumn('skills', 'needs_verify')) {
                $row['needs_verify'] = $row['flavor'] ? 0 : 1;   // flavor(송서사 확정 서사 한 줄)가 있으면 화면 노출, 없으면 숨김
                $row['review_status'] = null;
            }
            DB::table('skills')->insert($row);
            $n++;
        }
        $temp > 0 && $this->warn("스킬 이름 미확정 {$temp}종은 name_hint 로 임시 이름 사용(hero_wave3_skill_names.json 병합 후 재시드 필요)");

        return $n;
    }

    /** 대상 영웅의 연결 스킬이 등급 규칙(S 3+2 / A 2+2 / B 2+1 / C 1+1)·엔진 지원 템플릿·표시 효과에 맞는지(game:audit-skills 와 같은 기준) @return list<string> */
    private function auditSkills(array $codes): array
    {
        $rule = ['S' => [3, 2], 'A' => [2, 2], 'B' => [2, 1], 'C' => [1, 1]];
        $bad = [];
        $gd = app(\App\Services\GameData::class);
        foreach ($codes as $code) {
            $h = DB::table('heroes')->where('code', $code)->first(['id', 'rarity']);
            $np = $na = 0;
            $tpls = [];
            foreach (DB::table('hero_skills')->join('skills', 'skills.id', '=', 'hero_skills.skill_id')->where('hero_skills.hero_id', $h->id)->get(['skills.code', 'skills.type', 'skills.template', 'skills.enabled', 'skills.params']) as $l) {
                if (! $l->enabled) {
                    $bad[] = "{$code}: {$l->code} 비활성";

                    continue;
                }
                if ($l->type === 'active') {
                    isset(\App\Game\Engine::ACTIVE_TEMPLATES[$l->template]) ? $na++ : $bad[] = "{$code}: {$l->code} 미지원 액티브 {$l->template}";
                } else {
                    in_array($l->template, \App\Game\PassiveEffects::SUPPORTED_TEMPLATES, true) ? $np++ : $bad[] = "{$code}: {$l->code} 미지원 패시브 {$l->template}";
                    isset($tpls[$l->template]) && $bad[] = "{$code}: 패시브 템플릿 중복 {$l->template} ({$tpls[$l->template]}, {$l->code})";
                    $tpls[$l->template] = $l->code;
                }
                $gd->displayEffect((string) $l->type, (string) $l->template, (array) json_decode((string) $l->params, true)) === '' && $bad[] = "{$code}: {$l->code} 표시 효과 비어 있음";
            }
            [$rp, $ra] = $rule[$h->rarity] ?? [0, 0];
            ($np !== $rp || $na !== $ra) && $bad[] = sprintf('%s(%s): 패시브 %d/%d 액티브 %d/%d', $code, $h->rarity, $np, $rp, $na, $ra);
        }

        return $bad;
    }

    /** 정사 영웅과 같은 인물인 npc_* 쌍둥이를 풀에서 제외(보유 계정이 있으면 건너뜀) */
    private function retireTwins(): int
    {
        $n = 0;
        foreach (self::TWINS as $npc => $canon) {
            $r = DB::table('heroes')->where('code', $npc)->first();
            if (! $r || $r->campaign_only || ! DB::table('heroes')->where('code', $canon)->exists()) {
                continue;
            }
            if (DB::table('user_heroes')->where('hero_id', $r->id)->exists()) {
                $this->warn("{$npc}: 보유 계정이 있어 건너뜀");

                continue;
            }
            DB::table('heroes')->where('id', $r->id)->update(['campaign_only' => 1, 'updated_at' => now()]);
            $this->line("  퇴역(풀 제외) {$npc} (정사 {$canon})");
            $n++;
        }

        return $n;
    }

    private function writeHistory(): int
    {
        $b = HeroWave3::buildHistory();
        $flags = JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES;
        file_put_contents(database_path('data/'.HeroWave3::HISTORY_PART), json_encode($b['part'], $flags)."\n");
        file_put_contents(database_path('data/'.HeroWave3::HISTORY_RELATIONS), json_encode($b['relations'], $flags)."\n");
        $this->info(sprintf('역사 part %d건, 인연 오버레이 %d명 생성', count($b['part']['items']), count($b['relations']['relations'])));

        return self::SUCCESS;
    }

    /** SQLite 파일 DB 일관 스냅샷(VACUUM INTO). 메모리/비 SQLite 는 건너뜀 */
    private function backup(): bool
    {
        $conn = config('database.default');
        $db = (string) config("database.connections.{$conn}.database");
        if (config("database.connections.{$conn}.driver") !== 'sqlite' || $db === '' || $db === ':memory:') {
            $this->line('자동 백업 건너뜀(파일 SQLite 아님)');

            return true;
        }
        $dir = base_path('docker/db-backup');
        is_dir($dir) || @mkdir($dir, 0775, true);
        $dest = $dir.'/wave3-'.date('Ymd-His').'.sqlite';
        try {
            $pdo = DB::connection()->getPdo();
            $pdo->exec('VACUUM INTO '.$pdo->quote($dest));
            $this->line('백업 완료: '.$dest);

            return true;
        } catch (\Throwable $e) {
            $this->error('백업 실패(적용 중단): '.$e->getMessage());

            return false;
        }
    }
}
