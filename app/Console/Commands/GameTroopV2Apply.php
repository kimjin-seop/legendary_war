<?php

namespace App\Console\Commands;

use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 병종 v2 1단계 개발 DB 적용(멱등, 개발 DB 전용. 운영 환경에서는 실행 거부).
 *  1) unit_types: JSON 기준 신규(assassin·monster 등) 삽입 + 기존 행 표시명 갱신(sword=보병). heavy 행은 삭제하지 않는다(config game.retired_unit_types 별칭).
 *  2) matchup_rules: matchups.json(9x9) upsert. terrain_modifiers: terrains.json의 naval 보정 갱신(heavy 행은 보존, 런타임에서 쓰이지 않음).
 *  3) heroes: 병종 heavy 영웅(영웅 class heavy, NPC·주인공 원형 포함) -> sword + Lv1 능력치 보존 보정(hp +11, atk -6, def +5 = sword-heavy 기본값 차이, D5).
 *     heroes.troop_type heavy -> sword.
 *  4) presets.units / stages(enemy_squad·enemy_extra_troops·rules·triggers) 안의 heavy 문자열 값 -> sword. maps.meta의 heavy_round/heavy_min_cut 제거.
 * 진행 중 전투 state(battles.*)의 heavy는 건드리지 않는다(런타임 별칭 보호). 백업은 호출 전에 사람이 수행한다.
 */
class GameTroopV2Apply extends Command
{
    protected $signature = 'game:troop-v2-apply {--dry-run : 변경을 보고만 하고 롤백}';

    protected $description = '병종 v2 1단계: heavy 폐지 이관 + naval/상성 9x9 데이터 개발 DB 적용(멱등)';

    private const COMP = ['hp_bonus' => 11, 'atk_bonus' => -6, 'def_bonus' => 5];   // sword(84/28/10) - heavy(95/22/15) 의 반대 부호

    public function handle(GameData $data): int
    {
        if (app()->environment('production')) {
            $this->error('운영 환경에서는 실행할 수 없습니다.');

            return self::FAILURE;
        }
        $retired = (array) config('game.retired_unit_types');
        DB::beginTransaction();
        try {
            $this->unitTypesAndRules();
            foreach ($retired as $old => $new) {
                $this->migrate($old, $new);
            }
            $this->mapMeta();
        } catch (\Throwable $e) {
            DB::rollBack();
            throw $e;
        }
        $this->option('dry-run') ? DB::rollBack() : DB::commit();
        $this->info($this->option('dry-run') ? '[dry-run] 롤백됨' : '적용 완료');
        $data->flush();

        return self::SUCCESS;
    }

    private function json(string $f): array
    {
        return json_decode((string) file_get_contents(database_path('data/'.$f)), true, 512, JSON_THROW_ON_ERROR);
    }

    private function unitTypesAndRules(): void
    {
        $now = now();
        foreach ($this->json('unit_types.json')['items'] as $u) {
            $row = array_intersect_key($u, array_flip(['name', 'move', 'range_min', 'range_max', 'hp', 'atk', 'def', 'move_type', 'heal']));
            $q = DB::table('unit_types')->where('code', $u['code']);
            if (! $q->exists()) {
                DB::table('unit_types')->insert(['code' => $u['code'], 'cost' => (int) (config('game.troop_unit_cost')[$u['code']] ?? 1), 'created_at' => $now, 'updated_at' => $now] + $row);
                $this->line("unit_types 신규: {$u['code']}");
            } elseif (in_array($u['code'], ['mage'], true) && (array) $q->first(['name', 'move', 'range_min', 'range_max', 'hp', 'atk', 'def', 'move_type', 'heal']) != $row) {   // 2단계(E1): mage 능력치 개편 동기화
                $q->update($row + ['updated_at' => $now]);
                $this->line("unit_types 능력치: {$u['code']}");
            } elseif ($q->value('name') !== $u['name']) {
                $q->update(['name' => $u['name'], 'updated_at' => $now]);
                $this->line("unit_types 표시명: {$u['code']} -> {$u['name']}");
            }
        }
        $types = DB::table('unit_types')->pluck('id', 'code');
        $n = 0;
        foreach ($this->json('matchups.json')['items'] as $m) {
            $key = ['attacker_unit_type_id' => $types[$m['attacker']], 'defender_unit_type_id' => $types[$m['defender']]];
            $q = DB::table('matchup_rules')->where($key);
            if (! $q->exists()) {
                DB::table('matchup_rules')->insert($key + ['multiplier' => $m['multiplier'], 'created_at' => $now, 'updated_at' => $now]);
                $n++;
            } elseif ((float) $q->value('multiplier') !== (float) $m['multiplier']) {
                $q->update(['multiplier' => $m['multiplier'], 'updated_at' => $now]);
                $n++;
            }
        }
        $this->line("matchup_rules 변경/신규 {$n}행");
        $tid = DB::table('terrains')->pluck('id', 'code');
        $n = 0;
        foreach ($this->json('terrains.json')['items'] as $t) {
            foreach (($t['modifiers'] ?? []) as $mt => $m) {
                if ($mt !== 'naval' || ! isset($tid[$t['code']])) {
                    continue;
                }
                $q = DB::table('terrain_modifiers')->where(['terrain_id' => $tid[$t['code']], 'move_type' => 'naval']);
                if (! $q->exists()) {
                    DB::table('terrain_modifiers')->insert(['terrain_id' => $tid[$t['code']], 'move_type' => 'naval', 'move_cost' => $m['cost'], 'def_pct' => $m['def_pct'], 'created_at' => $now, 'updated_at' => $now]);
                    $n++;
                } elseif ($q->value('move_cost') !== $m['cost'] || (int) $q->value('def_pct') !== (int) $m['def_pct']) {
                    $q->update(['move_cost' => $m['cost'], 'def_pct' => $m['def_pct'], 'updated_at' => $now]);
                    $n++;
                }
            }
        }
        $this->line("terrain_modifiers(naval) 변경/신규 {$n}행");
    }

    /** 퇴역 병종 old -> new 이관 */
    private function migrate(string $old, string $new): void
    {
        $oldId = DB::table('unit_types')->where('code', $old)->value('id');
        $newId = DB::table('unit_types')->where('code', $new)->value('id');
        if (! $oldId || ! $newId) {
            return;
        }
        $now = now();
        $heroes = DB::table('heroes')->where('unit_type_id', $oldId)->get(['id', 'code', 'hp_bonus', 'atk_bonus', 'def_bonus']);
        foreach ($heroes as $h) {
            DB::table('heroes')->where('id', $h->id)->update(['unit_type_id' => $newId, 'hp_bonus' => $h->hp_bonus + self::COMP['hp_bonus'], 'atk_bonus' => $h->atk_bonus + self::COMP['atk_bonus'], 'def_bonus' => $h->def_bonus + self::COMP['def_bonus'], 'updated_at' => $now]);
            $this->line(sprintf('heroes class %s->%s: %s  bonus %d/%d/%d -> %d/%d/%d', $old, $new, $h->code, $h->hp_bonus, $h->atk_bonus, $h->def_bonus, $h->hp_bonus + 11, $h->atk_bonus - 6, $h->def_bonus + 5));
        }
        if (Schema::hasColumn('heroes', 'troop_type')) {
            $codes = DB::table('heroes')->where('troop_type', $old)->pluck('code')->all();
            DB::table('heroes')->where('troop_type', $old)->update(['troop_type' => $new, 'updated_at' => $now]);
            $this->line('heroes troop_type '.$old.'->'.$new.': '.count($codes).'명 ('.implode(',', $codes).')');
        }
        foreach (DB::table('presets')->get(['id', 'name', 'units']) as $p) {
            [$units, $c] = $this->swap(json_decode((string) $p->units, true), $old, $new);
            if ($c > 0) {
                DB::table('presets')->where('id', $p->id)->update(['units' => json_encode($units, JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
                $this->line("presets #{$p->id} {$p->name}: {$c}개");
            }
        }
        foreach (DB::table('stages')->get(['id', 'code', 'enemy_squad', 'enemy_extra_troops', 'rules', 'triggers']) as $s) {
            $upd = [];
            $info = [];
            foreach (['enemy_squad', 'enemy_extra_troops', 'rules', 'triggers'] as $col) {
                $dec = $s->$col === null ? null : json_decode((string) $s->$col, true);
                if (! is_array($dec)) {
                    continue;
                }
                [$out, $c] = $this->swap($dec, $old, $new);
                if ($c > 0) {
                    $upd[$col] = json_encode($out, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
                    $info[] = "$col:$c";
                }
            }
            if ($upd) {
                DB::table('stages')->where('id', $s->id)->update($upd + ['updated_at' => $now]);
                $this->line("stages {$s->code}: ".implode(' ', $info));
            }
        }
    }

    /** JSON 값(키 제외) 중 정확히 $old 인 문자열을 $new 로. @return array{0:mixed,1:int} */
    private function swap(mixed $v, string $old, string $new): array
    {
        if ($v === $old) {
            return [$new, 1];
        }
        if (! is_array($v)) {
            return [$v, 0];
        }
        $n = 0;
        foreach ($v as $k => $x) {
            [$v[$k], $c] = $this->swap($x, $old, $new);
            $n += $c;
        }

        return [$v, $n];
    }

    /** maps.meta 에서 heavy_round / heavy_min_cut 제거 */
    private function mapMeta(): void
    {
        $n = 0;
        foreach (DB::table('maps')->whereNotNull('meta')->get(['id', 'meta']) as $m) {
            $meta = json_decode((string) $m->meta, true);
            if (! is_array($meta) || (! isset($meta['contact']['heavy_round']) && ! isset($meta['choke']['heavy_min_cut']))) {
                continue;
            }
            unset($meta['contact']['heavy_round'], $meta['choke']['heavy_min_cut']);
            DB::table('maps')->where('id', $m->id)->update(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), 'updated_at' => now()]);
            $n++;
        }
        $this->line("maps.meta heavy 지표 제거 {$n}맵");
    }
}
