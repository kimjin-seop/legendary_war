<?php

namespace App\Console\Commands;

use App\Services\BattleService;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 배치 슬롯 후보 생성(출력 전용). 스테이지의 기존 아군 배치 영역에서 spreadHeroPositions 로 슬롯 좌표를 제안해 rules.deploy_slots JSON 조각으로 출력한다.
 * DB·JSON 파일을 쓰지 않는다(--dry-run 은 호환용 표시일 뿐 항상 출력만 한다). 출력 JSON 은 사람이 검토해 database/data 시드 JSON 의 stages[].rules.deploy_slots 에 붙인다.
 */
class GameGenDeploySlots extends Command
{
    protected $signature = 'game:gen-deploy-slots {--stage=* : 스테이지 코드(여러 개 가능, 생략 시 forced_heroes 가 있는 전체)} {--free=2 : 선택 슬롯 수} {--dry-run : 출력 전용(항상 적용됨)}';

    protected $description = '기존 배치 영역에서 deploy_slots 후보를 출력만 한다(쓰기 없음)';

    public function handle(BattleService $bs): int
    {
        $q = DB::table('stages')->orderBy('sort_order');
        $codes = (array) $this->option('stage');
        $codes !== [] ? $q->whereIn('code', $codes) : $q->where('forced_heroes', '!=', '[]')->whereNotNull('forced_heroes');
        foreach ($q->get() as $s) {
            try {
                $sug = $bs->suggestDeploySlots($s, max(0, (int) $this->option('free')));
            } catch (\Throwable $e) {
                $this->warn("{$s->code}: 후보 생성 실패 - ".$e->getMessage());

                continue;
            }
            $this->line("# {$s->code}");
            $this->line(json_encode(['deploy_slots' => $sug], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
        }
        $this->info('출력 전용 - DB·JSON 변경 없음');

        return self::SUCCESS;
    }
}
