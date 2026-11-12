<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 규칙 A(출전 시 주인공 필수)를 전 스테이지에 일괄 적용하는 준비용 커맨드. 기본은 dry-run(출력만, 쓰기 없음).
 * - 시드 JSON(stages_imjin10 / stages_ch18_mongol / stages.json)은 파일을 고치지 않고 "추가해야 할 forced_heroes" 계획만 출력한다.
 * - 개발 DB 반영은 --apply 와 --backup-done 을 모두 줘야 한다(백업 후 실행: AGENTS.md 4절). 운영 DB 금지.
 * - 이미 @protagonist 가 있는 스테이지는 건너뛴다. 기존 forced_heroes 항목은 보존하고 맨 앞에 @protagonist 를 넣는다(주인공=지휘관).
 */
class GameProtagonistRequired extends Command
{
    protected $signature = 'game:protagonist-required {--apply : 개발 DB stages.forced_heroes 에 반영} {--backup-done : DB 백업을 마쳤음을 확인(--apply 필수 동반)}';

    protected $description = '전 스테이지에 @protagonist 필수 출전 일괄 적용 계획(dry-run 기본)';

    public function handle(): int
    {
        if ($this->option('apply') && app()->environment('production')) {
            $this->error('운영 환경에서는 --apply 를 실행하지 않습니다(개발 DB 전용).');

            return self::FAILURE;
        }
        $rows = [];
        foreach (['stages_imjin10.json' => 'items', 'stages_ch18_mongol.json' => 'items', 'stages.json' => 'items'] as $file => $key) {
            $doc = json_decode(file_get_contents(database_path('data/'.$file)), true, 512, JSON_THROW_ON_ERROR);
            foreach ($doc[$key] ?? [] as $s) {
                $cur = $s['forced_heroes'] ?? [];
                $has = in_array('@protagonist', $cur, true);
                $rows[] = [$file, $s['code'], json_encode($cur, JSON_UNESCAPED_UNICODE), $has ? '(이미 있음)' : json_encode(array_merge(['@protagonist'], $cur), JSON_UNESCAPED_UNICODE)];
            }
        }
        $this->info('[시드 JSON] 추가 계획(파일 미수정). ch18/stages.json 은 forced_heroes 키 자체가 없고 해당 시드가 forced_heroes 를 읽지 않아 시드 코드 패치도 필요하다.');
        $this->table(['파일', 'code', '현재', '변경 후'], $rows);

        $dbRows = [];
        $todo = [];
        foreach (DB::table('stages')->orderBy('sort_order')->get(['id', 'code', 'forced_heroes']) as $s) {
            $cur = json_decode((string) $s->forced_heroes, true) ?: [];
            $has = in_array('@protagonist', $cur, true);
            $has || $todo[$s->id] = array_merge(['@protagonist'], $cur);
            $dbRows[] = [$s->code, json_encode($cur, JSON_UNESCAPED_UNICODE), $has ? '(이미 있음)' : json_encode($todo[$s->id], JSON_UNESCAPED_UNICODE)];
        }
        $this->info('[개발 DB stages] 변경 대상 '.count($todo).'건 / 전체 '.count($dbRows));
        $this->table(['code', '현재', '변경 후'], $dbRows);

        if (! $this->option('apply')) {
            $this->comment('dry-run 종료(쓰기 없음). 반영: 백업 후 --apply --backup-done');

            return self::SUCCESS;
        }
        if (! $this->option('backup-done')) {
            $this->error('--backup-done 없이는 반영하지 않습니다(개발 DB 백업 후 다시 실행).');

            return self::FAILURE;
        }
        foreach ($todo as $id => $forced) {
            DB::table('stages')->where('id', $id)->update(['forced_heroes' => json_encode($forced, JSON_UNESCAPED_UNICODE), 'updated_at' => now()]);
        }
        $this->info(count($todo).'건 반영 완료.');

        return self::SUCCESS;
    }
}
