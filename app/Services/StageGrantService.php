<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;

/** 스테이지 첫 클리어 1회 지급(장비·레벨 보장). 정의: database/data/stage_first_clear_grants.json. BattleService 첫 클리어 정산에서 호출(멱등). */
class StageGrantService
{
    public function __construct(private readonly EquipmentService $equipment)
    {
    }

    private function def(string $stageCode): ?array
    {
        $p = database_path('data/stage_first_clear_grants.json');
        $d = is_file($p) ? json_decode((string) file_get_contents($p), true) : null;

        return is_array($d) && is_array($d['stages'][$stageCode] ?? null) ? $d['stages'][$stageCode] : null;
    }

    /** @return array{equipment:string[],levels:array<int,array{user_hero_id:int,from:int,to:int}>} 지급 내역(없으면 빈 배열). 모든 쓰기는 중첩 트랜잭션(savepoint)이라 중간 실패 시 부분 지급이 남지 않는다 */
    public function grantFirstClear(User $user, string $stageCode): array
    {
        $def = $this->def($stageCode);
        if ($def === null) {
            return ['equipment' => [], 'levels' => []];
        }

        return DB::transaction(fn () => $this->apply($user, $stageCode, $def));
    }

    private function apply(User $user, string $stageCode, array $def): array
    {
        $out = ['equipment' => [], 'levels' => []];
        // 같은 유저·스테이지 동시 정산 직렬화(MySQL 행 잠금. SQLite 는 쓰기 트랜잭션이 직렬이라 잠금 구문이 무시됨). 중복 지급은 아래 source 태그 검사가 막는다
        $sid = DB::table('stages')->where('code', $stageCode)->value('id');
        $sid && DB::table('user_stage_progress')->where(['user_id' => $user->id, 'stage_id' => $sid])->lockForUpdate()->first();
        $now = now();
        $tag = 'stage_grant:'.$stageCode;
        if ($this->equipment->available()) {
            foreach ((array) ($def['equipment'] ?? []) as $code) {
                $item = DB::table('equipment_items')->where('code', $code)->first();
                if (! $item || DB::table('user_equipment')->where(['user_id' => $user->id, 'equipment_item_id' => $item->id, 'source' => $tag])->exists()) {
                    continue;
                }
                DB::table('user_equipment')->insert(['user_id' => $user->id, 'equipment_item_id' => $item->id, 'acquired_at' => $now, 'source' => $tag, 'created_at' => $now, 'updated_at' => $now]);
                $out['equipment'][] = $code;
            }
        }
        $floor = (int) ($def['min_level'] ?? 0);
        $pFloor = (int) ($def['protagonist_min_level'] ?? 0);
        $rows = DB::table('user_heroes')->join('heroes', 'heroes.id', '=', 'user_heroes.hero_id')->where('user_heroes.user_id', $user->id)
            ->get(['user_heroes.id', 'user_heroes.level', 'heroes.is_protagonist']);
        foreach ($rows as $r) {
            $to = max($floor, $r->is_protagonist ? $pFloor : 0);
            if ($to > (int) $r->level) {
                DB::table('user_heroes')->where('id', $r->id)->update(['level' => $to, 'exp' => 0, 'updated_at' => $now]);
                $out['levels'][] = ['user_hero_id' => (int) $r->id, 'from' => (int) $r->level, 'to' => $to];
            }
        }

        return $out;
    }
}
