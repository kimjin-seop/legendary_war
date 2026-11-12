<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 스테이지별 필수 영웅 반영: database/data/stage_required_heroes.json {stage_code:[hero_code,...]} -> stages.rules.required_heroes(스테이지 단위, 다른 rules 키 보존).
 * 기본은 계획만 출력(DB 쓰기 없음). --apply 시에만 개발 DB 를 갱신한다(코드 존재 검증 실패 시 전체 중단). 빈 배열 = 해당 키 삭제(롤백).
 */
class GameSeedRequiredHeroes extends Command
{
    protected $signature = 'game:seed-required-heroes {--file= : JSON 경로(기본 database/data/stage_required_heroes.json)} {--apply : DB 에 반영(미지정 시 계획만 출력)}';

    protected $description = 'stage_required_heroes.json -> stages.rules.required_heroes (기본 dry-run)';

    public function handle(): int
    {
        $path = $this->option('file') ?: database_path('data/stage_required_heroes.json');
        if (! is_file($path)) {
            $this->warn("파일 없음: {$path} (송서사 데이터 대기)");

            return self::SUCCESS;
        }
        $data = json_decode(file_get_contents($path), true);
        if (! is_array($data)) {
            $this->error('JSON 형식 오류');

            return self::FAILURE;
        }
        $data = array_filter($data, fn ($v, $k) => $k[0] !== '_' && is_array($v) && array_is_list($v), ARRAY_FILTER_USE_BOTH);   // _meta 등 메타 키와 객체형 보조 섹션(unobtainable_story_figures, required_when_obtainable 등)은 무시: {stage_code:[hero_code..]} 만 처리
        $plan = [];
        foreach ($data as $stage => $codes) {
            $row = DB::table('stages')->where('code', $stage)->first(['id', 'rules']);
            if (! $row || ! is_array($codes)) {
                $this->error("{$stage}: 스테이지 없음 또는 값이 배열 아님");

                return self::FAILURE;
            }
            foreach ($codes as $c) {
                (is_string($c) && $c !== '' && $c[0] !== '@' && DB::table('heroes')->where('code', $c)->exists()) || throw new \RuntimeException("{$stage}: 필수 영웅 {$c} 가 heroes 에 없음(주인공 토큰은 제외)");
            }
            $plan[$stage] = [$row, array_values(array_unique($codes))];
        }
        foreach ($plan as $stage => [$row, $codes]) {
            $this->line("{$stage}: required_heroes = ".($codes === [] ? '(삭제)' : implode(',', $codes)));
        }
        if (! $this->option('apply')) {
            $this->info('계획만 출력(--apply 로 개발 DB 반영)');

            return self::SUCCESS;
        }
        foreach ($plan as [$row, $codes]) {
            $rules = json_decode((string) $row->rules, true) ?: [];
            $codes === [] ? $rules = array_diff_key($rules, ['required_heroes' => 1]) : $rules['required_heroes'] = $codes;
            DB::table('stages')->where('id', $row->id)->update(['rules' => $rules === [] ? null : json_encode($rules, JSON_UNESCAPED_UNICODE), 'updated_at' => now()]);
        }
        $this->info(count($plan).'개 스테이지 반영');

        return self::SUCCESS;
    }
}
