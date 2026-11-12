<?php

namespace App\Console\Commands;

use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 맵 검증(읽기 전용): 지형 문자/배치 영역/스폰/병종별 도달·접근 비용 대칭/지형 비율/고립 영역.
 * 종료 코드: ERROR가 있으면 1, --strict면 WARN도 1.
 */
class GameMapCheck extends Command
{
    protected $signature = 'game:map-check
        {--map= : 맵 code(생략 시 전체)}
        {--strict : WARN도 실패로 처리}
        {--tolerance=0.25 : 진영 간 접근 비용 비대칭 허용 비율}';

    protected $description = '맵 검증기(DB 읽기 전용): 도달 가능성, 배치 영역, 지형 비율, 고립 영역';

    public function handle(GameData $data): int
    {
        $q = DB::table('maps')->orderBy('id');
        $this->option('map') && $q->where('code', $this->option('map'));
        $maps = $q->get();
        if ($maps->isEmpty()) {
            $this->error('맵이 없습니다.');

            return self::FAILURE;
        }
        $checker = new MapChecker($data->rules(), (float) $this->option('tolerance'));
        $err = 0;
        $warn = 0;
        foreach ($maps as $m) {
            $rows = $checker->check([
                'code' => $m->code, 'width' => (int) $m->width, 'height' => (int) $m->height, 'tiles' => json_decode($m->tiles, true),
                'spawns' => json_decode($m->spawns, true), 'deploy_zones' => json_decode($m->deploy_zones, true),
                'known_isolated' => (json_decode((string) ($m->meta ?? ''), true) ?: [])['known_isolated'] ?? [],
            ]);
            $this->info("[{$m->code}] {$m->width}x{$m->height}");
            $this->table(['검사', '결과', '상세'], $rows);
            $err += count(array_filter($rows, fn ($r) => $r[1] === 'ERROR'));
            $warn += count(array_filter($rows, fn ($r) => $r[1] === 'WARN'));
        }
        $this->line("ERROR $err / WARN $warn");

        return ($err > 0 || ($this->option('strict') && $warn > 0)) ? self::FAILURE : self::SUCCESS;
    }
}
