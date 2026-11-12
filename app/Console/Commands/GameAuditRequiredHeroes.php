<?php

namespace App\Console\Commands;

use App\Services\GachaService;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 읽기 전용 점검: stage_required_heroes.json 의 필수 영웅 전원이 'heroes 행 존재 + DB campaign_only=0 + 가챠 풀 포함'인지 확인한다.
 * 미통과가 하나라도 있으면 종료코드 1. DB 쓰기 없음.
 */
class GameAuditRequiredHeroes extends Command
{
    protected $signature = 'game:audit-required-heroes {--file= : JSON 경로(기본 database/data/stage_required_heroes.json)}';

    protected $description = '스테이지 필수 영웅 전원이 뽑기로 얻을 수 있는지(풀 포함·campaign_only=0) 점검';

    public function handle(GachaService $gacha, GameData $data): int
    {
        $path = $this->option('file') ?: database_path('data/stage_required_heroes.json');
        $doc = json_decode((string) file_get_contents($path), true);
        if (! is_array($doc)) {
            $this->error('JSON 형식 오류');

            return self::FAILURE;
        }
        $need = [];
        foreach ($doc as $stage => $codes) {
            if ($stage[0] === '_' || $stage === 'unobtainable_story_figures' || $stage === 'required_when_obtainable' || ! is_array($codes)) {
                continue;
            }
            foreach ($codes as $c) {
                $need[$c][] = $stage;
            }
        }
        $inPool = [];
        foreach ($gacha->pool()['by_rarity'] as $r => $list) {
            foreach ($list as $c) {
                $inPool[$c] = $r;
            }
        }
        $raw = DB::table('heroes')->whereIn('code', array_keys($need))->pluck('campaign_only', 'code');
        $fail = [];
        $byRarity = [];
        foreach ($need as $c => $stages) {
            $why = [];
            $raw->has($c) || $why[] = 'heroes 행 없음';
            ! $raw->get($c) || $why[] = 'DB campaign_only=1';
            ! empty($data->heroes()[$c]['campaign_only']) && $why[] = '유효 campaign_only=1';
            isset($inPool[$c]) || $why[] = '가챠 풀 미포함';
            if ($why) {
                $fail[$c] = implode(', ', $why).' (첫 스테이지 '.$stages[0].')';
            } else {
                $byRarity[$inPool[$c]] = ($byRarity[$inPool[$c]] ?? 0) + 1;
            }
        }
        ksort($byRarity);
        $this->info(sprintf('필수 영웅 %d명 / 통과 %d명 / 미통과 %d명  등급 분포(통과분) %s', count($need), count($need) - count($fail), count($fail), json_encode($byRarity)));
        foreach ($fail as $c => $m) {
            $this->error("FAIL {$c}: {$m}");
        }

        return $fail ? self::FAILURE : self::SUCCESS;
    }
}
