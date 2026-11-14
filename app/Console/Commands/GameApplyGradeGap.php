<?php

namespace App\Console\Commands;

use App\Support\HeroExpansion;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 등급 격차 v1(2026-11-14) 데이터 반영 전용 명령: JSON 원본 -> 개발 DB 를 좁은 범위로만 동기화한다.
 *  - heroes: heroes.json + hero_expansion_stats.json(보류 제외) 의 cost / atk_bonus / def_bonus 만 갱신(다른 컬럼·어드민 수정 보존)
 *  - JSON 밖 플레이 가능(campaign_only=0) 행: cost 만 등급 코스트(config game.hero_cost_by_grade)로 통일(캠페인 전용 행 불변)
 *  - hero_levels, user_level_costs: JSON 행 upsert(JSON 에 없는 행은 삭제하지 않음)
 * game:seed --force 는 맵·스킬 등 전 테이블을 덮어쓰므로 쓰지 않는다. 기본은 계획(diff)만 출력, --apply 에서만 쓰기.
 * 운영 환경에서는 실행 불가. --apply 전 개발 DB 백업(AGENTS.md 4절)은 사람이 먼저 한다.
 */
class GameApplyGradeGap extends Command
{
    protected $signature = 'game:apply-grade-gap {--apply : 개발 DB 에 쓰기(미지정 시 변경 계획만 출력)}';

    protected $description = '등급 격차 v1: heroes cost/atk/def + hero_levels + user_level_costs 를 JSON 기준으로 동기화(기본 dry-run)';

    public function handle(): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행할 수 없습니다.');

            return self::FAILURE;
        }
        $read = fn (string $f) => json_decode((string) file_get_contents(database_path('data/'.$f)), true, 512, JSON_THROW_ON_ERROR)['items'];
        $src = array_column($read('heroes.json'), null, 'code');
        foreach (HeroExpansion::heroRows() as $r) {
            $src[$r['code']] ??= $r;
        }

        $heroPlan = [];
        $missing = [];
        foreach ($src as $code => $h) {
            $row = DB::table('heroes')->where('code', $code)->first(['id', 'cost', 'atk_bonus', 'def_bonus']);
            if (! $row) {
                $missing[] = $code;   // 아직 시드되지 않은 영웅(보류 등): 건너뜀
                continue;
            }
            $want = ['cost' => (int) $h['cost'], 'atk_bonus' => (int) $h['atk_bonus'], 'def_bonus' => (int) $h['def_bonus']];
            $have = ['cost' => (int) $row->cost, 'atk_bonus' => (int) $row->atk_bonus, 'def_bonus' => (int) $row->def_bonus];
            $want !== $have && $heroPlan[$code] = [(int) $row->id, $have, $want];
        }
        $this->info('heroes 변경 '.count($heroPlan).'명 / 대상 '.count($src).'명(DB 없음 '.count($missing).'명 건너뜀)');
        foreach ($heroPlan as $code => [, $have, $want]) {
            $this->line(sprintf('  %-26s cost %d->%d  atk %d->%d  def %d->%d', $code, $have['cost'], $want['cost'], $have['atk_bonus'], $want['atk_bonus'], $have['def_bonus'], $want['def_bonus']));
        }

        // JSON 밖 행(NPC 승격·가챠 편입 등) 중 플레이 가능(campaign_only=0)한 영웅: 코스트만 등급 코스트로 통일. 캠페인 전용(campaign_only=1) 행은 건드리지 않는다.
        $byGrade = (array) config('game.hero_cost_by_grade');
        $extraPlan = [];
        foreach (DB::table('heroes')->where('campaign_only', 0)->get(['id', 'code', 'rarity', 'cost']) as $r) {
            isset($src[$r->code]) || (isset($byGrade[$r->rarity]) && (int) $r->cost !== (int) $byGrade[$r->rarity] && $extraPlan[$r->code] = [(int) $r->id, (int) $r->cost, (int) $byGrade[$r->rarity]]);
        }
        $this->info('JSON 밖 플레이 가능 영웅 코스트 통일 '.count($extraPlan).'명');
        foreach ($extraPlan as $code => [, $from, $to]) {
            $this->line(sprintf('  %-26s cost %d->%d', $code, $from, $to));
        }

        $levels = $read('hero_levels.json');
        $userLevels = $read('user_level_costs.json');
        $hl = $this->diffCount('hero_levels', $levels, ['exp_to_next']);
        $ul = $this->diffCount('user_level_costs', $userLevels, ['exp_to_next', 'max_cost', 'party_slots']);
        $this->info("hero_levels: JSON {$hl['total']}행 중 변경/추가 {$hl['changed']}행 / user_level_costs: JSON {$ul['total']}행 중 변경/추가 {$ul['changed']}행 (JSON 에 없는 DB 행은 삭제하지 않음)");

        if (! $this->option('apply')) {
            $this->info('계획만 출력(--apply 로 개발 DB 반영). 먼저 개발 DB 백업을 하세요.');

            return self::SUCCESS;
        }
        DB::transaction(function () use ($heroPlan, $extraPlan, $levels, $userLevels) {
            foreach ($extraPlan as [$id, , $to]) {
                DB::table('heroes')->where('id', $id)->update(['cost' => $to, 'updated_at' => now()]);
            }
            foreach ($heroPlan as [$id, , $want]) {
                DB::table('heroes')->where('id', $id)->update($want + ['updated_at' => now()]);
            }
            DB::table('hero_levels')->upsert($levels, ['level'], ['exp_to_next']);
            DB::table('user_level_costs')->upsert($userLevels, ['level'], ['exp_to_next', 'max_cost', 'party_slots']);
        });
        $this->info('반영 완료');

        return self::SUCCESS;
    }

    /** @return array{total:int,changed:int} */
    private function diffCount(string $table, array $rows, array $cols): array
    {
        $db = DB::table($table)->get()->keyBy('level');
        $changed = 0;
        foreach ($rows as $r) {
            $cur = $db[$r['level']] ?? null;
            $diff = $cur === null;
            foreach ($cols as $c) {
                $diff = $diff || (int) $cur->{$c} !== (int) $r[$c];
            }
            $diff && $changed++;
        }

        return ['total' => count($rows), 'changed' => $changed];
    }
}
