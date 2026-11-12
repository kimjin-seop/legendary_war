<?php

namespace App\Console\Commands;

use App\Game\Cues;
use App\Game\Engine;
use App\Services\CueWalkAudit;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * ch1_s1~s10 의 stages.rules.cues 만 데이터 파일 최신값으로 동기화한다(다른 rules 키·다른 컬럼 불변).
 * 원본: stages_imjin10.json items[].rules.cues + (있으면) 대사 JSON battle_cues.<stage> (GameSeedShelf::mergeBattleCues 재사용, 같은 cue 중복 제거).
 * 기본은 dry-run(쓰기 없음). --apply 로 단일 트랜잭션 반영. 반영 전/후 Cues::dropped + CueWalkAudit(validateWalk) 검증, ERROR 가 있으면 반영 중단.
 * DB 경로는 DEV_SQLITE_PATH 로 바꿀 수 있다(복사본 리허설). 운영 DB 사용 금지.
 */
class GameSyncCh1Cues extends Command
{
    protected $signature = 'game:sync-ch1-cues {--apply : 실제 반영(기본 dry-run)} {--chapter=1 : 챕터}';

    protected $description = 'ch1 스테이지 rules.cues 를 stages_imjin10.json·대사 JSON 최신값으로 동기화(기본 dry-run)';

    public function handle(CueWalkAudit $audit, GameSeedShelf $shelf): int
    {
        $ch = (int) $this->option('chapter');
        $apply = (bool) $this->option('apply');
        $doc = json_decode((string) file_get_contents(database_path('data/stages_imjin10.json')), true, 512, JSON_THROW_ON_ERROR);
        $shelf->setOutput($this->output);
        $merge = new \ReflectionMethod($shelf, 'mergeBattleCues');
        $errProp = new \ReflectionProperty($shelf, 'bcueErrors');
        $this->info(($apply ? '[APPLY] ' : '[DRY-RUN] ').'DB='.DB::connection()->getDatabaseName());
        $plan = [];
        $bad = 0;
        foreach ($doc['items'] as $it) {
            $code = $it['code'];
            if (! preg_match('/^ch'.$ch.'_s\d+$/', $code)) {
                continue;
            }
            $row = DB::table('stages')->where('code', $code)->first();
            if (! $row) {
                $this->warn("{$code}: DB 에 스테이지 없음(건너뜀)");

                continue;
            }
            $rules = json_decode((string) $row->rules, true) ?: [];
            $src = $it['rules']['cues'] ?? null;
            $base = ['cues' => is_array($src) ? $src : []];
            $meta = json_decode((string) DB::table('maps')->where('id', $row->map_id)->value('meta'), true) ?: [];
            $merged = $merge->invoke($shelf, $ch, $code, $base, (array) ($meta['tile_tags'] ?? []), (array) ($meta['zone_refs'] ?? []));
            $new = $merged['cues'] ?? [];
            $cur = (array) ($rules['cues'] ?? []);
            if ($new === []) {
                $cur !== [] && $this->warn("{$code}: 데이터에 cues 없음, DB 에는 ".count($cur).'건 있음(삭제하지 않음)');

                continue;
            }
            $same = json_encode($new, JSON_UNESCAPED_UNICODE) === json_encode($cur, JSON_UNESCAPED_UNICODE);
            $d = Cues::dropped($new);
            if ($d > 0) {
                $this->error("{$code}: 엔진이 버리는 cue {$d}건");
                $bad++;
            }
            $sq = json_decode((string) $row->enemy_squad, true) ?: [];
            $fixed = Engine::normalizeDeploySlots($rules['deploy_slots'] ?? null)['fixed'] ?? [];
            foreach ($audit->check((int) $row->map_id, $new, $sq, $fixed) as $m) {
                $this->line("  {$code} {$m}");
                str_starts_with($m, 'ERROR') && $bad++;
            }
            $this->line(sprintf('%s: DB %d건 -> 데이터 %d건 (%s)', $code, count($cur), count($new), $same ? '변경 없음' : '변경'));
            if (! $same) {
                $plan[$code] = [$row->id, $rules, $new];
            }
        }
        foreach ((array) $errProp->getValue($shelf) as $e) {
            $this->error($e);
            $bad++;
        }
        if ($bad > 0) {
            $this->error("검증 실패 {$bad}건 - 반영하지 않음");

            return self::FAILURE;
        }
        $this->info('변경 대상: '.($plan ? implode(', ', array_keys($plan)) : '없음'));
        if (! $apply || ! $plan) {
            $apply || $this->comment('dry-run: 쓰기 없음. 반영은 --apply');

            return self::SUCCESS;
        }
        DB::transaction(function () use ($plan) {
            foreach ($plan as [$id, $rules, $new]) {
                $rules['cues'] = $new;   // rules 의 다른 키는 그대로
                DB::table('stages')->where('id', $id)->update(['rules' => json_encode($rules, JSON_UNESCAPED_UNICODE), 'updated_at' => now()]);
            }
        });
        $this->info('반영 완료: '.count($plan).'건');

        return self::SUCCESS;
    }
}
