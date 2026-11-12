<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 영웅 교체 적용(개발 DB 전용, 멱등, 기본 dry-run): 구 영웅 슬롯의 등급·병종·스탯·스킬 연결을 신규 코드 영웅에 상속시킨다.
 *  - 신규 코드로 heroes 행 추가(구 행 복사 + 이름·시대·문화·칭호 덮어쓰기). 구 코드는 삭제하지 않는다.
 *  - hero_skills 연결 복사(스킬 이름·설명 교체는 hero_skill_redistribution/new_skill_names 반영 후 game:seed-skill-grades).
 *  - --migrate-owned: 구 영웅 보유 user_heroes 를 신규 영웅으로 이관(레벨·경험치 유지, 신규 영웅 중복 보유 계정은 건너뜀).
 *  - 구 영웅의 가챠 제외는 gacha_pool.json exclude_codes(파일, 반영 완료). --deactivate 는 DB campaign_only=1 로 무작위 편성 풀에서도 뺀다.
 *  - 신규 영웅 행은 보통 game:seed(hero_expansion_*)가 만들고, 이 명령은 없을 때만 구 행을 복사해 보충한다.
 * 입력 --file: items[]에 구 코드(current.code 또는 old)와 신규 정의(primary 또는 new: code,name_ko,name_en,born,died,era,region,culture,title,short_name).
 */
class GameReplaceHeroes extends Command
{
    protected $signature = 'game:replace-heroes
        {--file=database/data/proposals/old_world_replacement_final.json : 교체 정의 JSON(송서사 최종본)}
        {--apply : 실제 적용(기본은 dry-run 롤백)}
        {--migrate-owned : 구 영웅 보유 계정의 user_heroes 를 신규 영웅으로 이관}
        {--deactivate : 구 영웅 heroes.campaign_only=1(가챠·무작위 편성 풀 제외, 보유 계정의 user_heroes 는 유지)}';

    protected $description = '구 영웅 슬롯을 신규 코드 영웅으로 교체(스탯·스킬 연결 상속, 구 코드 보존, 멱등)';

    /** heroes 복사 시 새 값으로 덮어쓰지 않고 제외할 컬럼 */
    private const SKIP = ['id', 'created_at', 'updated_at'];

    /** 신규 정의에서 heroes 컬럼으로 덮어쓸 필드 */
    private const OVERRIDE = ['code', 'name_ko', 'name_en', 'born', 'died', 'era', 'region', 'culture', 'title', 'short_name'];

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행할 수 없습니다.');

            return self::FAILURE;
        }
        $path = preg_match('#^([A-Za-z]:|/)#', (string) $this->option('file')) ? (string) $this->option('file') : base_path((string) $this->option('file'));
        if (! is_file($path)) {
            $this->error('파일 없음: '.$this->option('file'));

            return self::FAILURE;
        }
        $doc = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        $items = $doc['slots'] ?? $doc['items'] ?? [];   // 최종본=slots, v1 제안=items
        $renames = [];
        foreach ($items as $it) {
            foreach ((array) ($it['skill_rename'] ?? []) as $r) {
                if (! str_starts_with((string) ($r['new_name'] ?? '('), '(')) {
                    $renames[$r['old_code']] = $r;
                }
            }
        }
        // 데이터 파일(hero_skill_assignments.json)의 현재 표시명이 교체 최종본보다 우선(후속 문구 수정 반영)
        $asg = json_decode((string) @file_get_contents(database_path('data/hero_skill_assignments.json')), true)['heroes'] ?? [];
        foreach ($asg as $h) {
            foreach ((array) ($h['skills'] ?? []) as $sk) {
                if (isset($renames[$sk['code'] ?? ''])) {
                    $renames[$sk['code']]['new_name'] = $sk['name'] ?? $renames[$sk['code']]['new_name'];
                    $renames[$sk['code']]['new_flavor'] = $sk['flavor'] ?? $renames[$sk['code']]['new_flavor'];
                }
            }
        }
        $nn = json_decode((string) @file_get_contents(database_path('data/new_skill_names.json')), true)['skills'] ?? [];
        foreach ($nn as $code => $v) {
            if (isset($renames[$code]) && ! empty($v['name_ko'])) {
                $renames[$code]['new_name'] = $v['name_ko'];
                $renames[$code]['new_flavor'] = $v['flavor'] ?? $renames[$code]['new_flavor'];
            }
        }
        $apply = (bool) $this->option('apply');
        $migrate = (bool) $this->option('migrate-owned');
        $cols = Schema::getColumnListing('heroes');
        $st = ['created' => 0, 'exists' => 0, 'skills' => 0, 'migrated' => 0, 'skipped_owned' => 0];
        $gachaExclude = [];
        $errors = [];

        DB::beginTransaction();
        try {
            foreach ($items as $it) {
                $oldCode = (string) (is_array($it['old'] ?? null) ? ($it['old']['code'] ?? '') : ($it['old'] ?? $it['current']['code'] ?? ''));
                $new = (array) ($it['new'] ?? $it['primary'] ?? []);
                $newCode = (string) ($new['code'] ?? '');
                if ($oldCode === '' || $newCode === '') {
                    $errors[] = 'slot '.($it['slot'] ?? '?').': 구/신 코드 없음';

                    continue;
                }
                $old = DB::table('heroes')->where('code', $oldCode)->first();
                if (! $old) {
                    $errors[] = "{$oldCode}: DB에 구 영웅 없음";

                    continue;
                }
                $gachaExclude[] = $oldCode;
                if ($this->option('deactivate')) {
                    DB::table('heroes')->where('id', $old->id)->update(['campaign_only' => 1, 'updated_at' => now()]);
                }
                $cur = DB::table('heroes')->where('code', $newCode)->first();
                if ($cur) {
                    $st['exists']++;
                    $newId = (int) $cur->id;
                } else {
                    $row = array_diff_key((array) $old, array_flip(self::SKIP));
                    foreach (self::OVERRIDE as $k) {
                        if (in_array($k, $cols, true) && array_key_exists($k, $new)) {
                            $row[$k] = $new[$k];
                        }
                    }
                    $row['campaign_only'] = 0;
                    $row['verify'] = 1;
                    $row['note'] = "교체 영웅(구 {$oldCode} 슬롯 상속)";
                    $row['created_at'] = $row['updated_at'] = now();
                    $newId = (int) DB::table('heroes')->insertGetId($row);
                    $st['created']++;
                    $this->line("  + {$oldCode} -> {$newCode} (".($new['name_ko'] ?? '?').", {$old->rarity}, culture ".($row['culture'] ?? '-').')');
                }
                foreach (DB::table('hero_skills')->where('hero_id', $old->id)->get() as $hs) {
                    $has = DB::table('hero_skills')->where('hero_id', $newId)->where('skill_id', $hs->skill_id)->exists();
                    if (! $has) {
                        DB::table('hero_skills')->insert(['hero_id' => $newId, 'skill_id' => $hs->skill_id, 'sort_order' => $hs->sort_order, 'created_at' => now(), 'updated_at' => now()]);
                        $st['skills']++;
                    }
                }
                if ($migrate) {
                    foreach (DB::table('user_heroes')->where('hero_id', $old->id)->get() as $uh) {
                        if (DB::table('user_heroes')->where('user_id', $uh->user_id)->where('hero_id', $newId)->exists()) {
                            $st['skipped_owned']++;

                            continue;
                        }
                        DB::table('user_heroes')->where('id', $uh->id)->update(['hero_id' => $newId, 'updated_at' => now()]);
                        $st['migrated']++;
                    }
                }
            }
            // 스킬 표시명 교체(이미 적재된 skills 행: 시드가 기존 행 이름을 바꾸지 않으므로 DB 반영). 행이 없으면 건너뜀
            foreach ($renames as $code => $r) {
                $upd = ['name' => $r['new_name'], 'updated_at' => now()];
                if (! empty($r['new_flavor'])) {
                    $upd['flavor'] = $r['new_flavor'];
                }
                $st['renamed'] = ($st['renamed'] ?? 0) + DB::table('skills')->where('code', $code)->update($upd);
            }
            foreach ($errors as $e) {
                $this->warn($e);
            }
            $this->info(($apply ? '적용' : 'dry-run(롤백)').': '.json_encode($st));
            $this->line('gacha_pool.json exclude_codes 에 추가할 구 코드: '.implode(', ', $gachaExclude));
            $apply && $errors === [] ? DB::commit() : DB::rollBack();
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error($e->getMessage());

            return self::FAILURE;
        }

        return $errors === [] ? self::SUCCESS : self::FAILURE;
    }
}
