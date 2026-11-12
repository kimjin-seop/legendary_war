<?php

namespace App\Console\Commands;

use App\Game\EnemyV3Adapter;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * NPC 승격(방식 B): NPC 로스터(npc_roster_v3*.json, npc_roster_shelf_ch*.json)의 `playable: true` 행을 heroes.campaign_only=0 으로 해제해
 * 일반 영웅처럼 소유·방 대전 출전·무작위 편성 풀에 들어가게 한다. 코드(npc_*)와 스토리 사용(적 지휘관·forced_heroes)은 그대로.
 * 승격 대상의 culture 는 CULTURE_MAP 으로 정규화(mongol -> steppe). 되돌리기: --revert (campaign_only=1 복귀, 보유 user_heroes 행은 유지).
 * 개발 DB 전용(운영 환경 거부). 멱등. --dry-run 은 롤백.
 */
class GameNpcPromote extends Command
{
    protected $signature = 'game:npc-promote {--revert : 승격 해제(campaign_only=1 복귀)} {--dry-run : 변경을 보고만 하고 롤백}';

    protected $description = 'NPC 로스터 playable:true 행의 campaign_only 해제/복귀(승격 플래그 동기화)';

    public function handle(GameData $data): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행할 수 없습니다.');

            return self::FAILURE;
        }
        $targets = [];
        $files = array_merge(['npc_roster_v3.json'], array_map('basename', glob(database_path('data/npc_roster_v3_additions*.json')) ?: []), array_map('basename', glob(database_path('data/npc_roster_shelf_ch*.json')) ?: []));
        foreach ($files as $f) {
            $doc = json_decode((string) file_get_contents(database_path('data/'.$f)), true, 512, JSON_THROW_ON_ERROR);
            foreach ($doc['items'] ?? [] as $n) {
                if (! empty($n['playable']) && str_starts_with((string) $n['code'], 'npc_')) {
                    $targets[$n['code']] ??= EnemyV3Adapter::CULTURE_MAP[$n['culture'] ?? ''] ?? null;
                }
            }
        }
        $revert = (bool) $this->option('revert');
        DB::beginTransaction();
        $n = 0;
        foreach ($targets as $code => $cul) {
            $q = DB::table('heroes')->where('code', $code);
            $row = $q->first(['campaign_only', 'culture']);
            if (! $row) {
                $this->warn("heroes 행 없음(건너뜀): {$code}");

                continue;
            }
            $upd = ['campaign_only' => $revert];
            if (! $revert && $cul !== null && $row->culture !== $cul) {
                $upd['culture'] = $cul;
            }
            if ((bool) $row->campaign_only !== $revert || isset($upd['culture'])) {
                $q->update($upd + ['updated_at' => now()]);
                $n++;
                $this->line(($revert ? '복귀 ' : '승격 ').$code.(isset($upd['culture']) ? " culture {$row->culture}->{$cul}" : ''));
            }
        }
        $this->option('dry-run') ? DB::rollBack() : DB::commit();
        $this->info(sprintf('%s 대상 %d명 중 변경 %d명%s', $revert ? '복귀' : '승격', count($targets), $n, $this->option('dry-run') ? ' [dry-run 롤백]' : ''));
        $data->flush();

        return self::SUCCESS;
    }
}
