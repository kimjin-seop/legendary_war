<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\EnemyV3Adapter;
use App\Game\Engine;
use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 임진왜란 10맵 + 수상(해전) 규칙 데이터 적재(멱등, code/키 기준 upsert). 운영 DB 사용 금지(개발 DB 전용 도구).
 *  1) 신규 지형 7종(sea·reef·harbor·sand·hill·void·rift_plank) + 기존 지형 naval 행 + water/boarding 속성, unit_types.naval, matchups(수병 궁병 상성)
 *  2) maps: maps_imjin10.json의 im_* 10행(tiles·spawns·deploy_zones·meta·tile_layer). deploy_zones는 config game.deploy_zone_size까지 BFS 확장(원본 스폰 유지)
 *     + stages_imjin10.json의 map_meta_patch(enemy_extra_zones 증원 구역)를 meta에 병합. MapChecker ERROR가 있으면 아무것도 쓰지 않는다.
 *  3) stages: ch1_s1~s7 행의 map/objective/forced_heroes/triggers/enemy_squad 재배정, ch1_s8~s10 신규(없을 때만 insert, --force면 보상 등도 덮어씀). stage_01~06 등 다른 행은 불변.
 * 원본 maps_imjin10_user_source.md는 읽지도 수정하지도 않는다. --dry-run: 모든 쓰기를 트랜잭션 롤백.
 */
class GameSeedImjin10 extends Command
{
    protected $signature = 'game:seed-imjin10 {--dry-run : 검증/계획만(트랜잭션 롤백)} {--force : 기존 ch1 행의 보상·이름 등 전체 필드도 덮어씀} {--enemy= : database/data 하위 파일명(쉼표로 여러 개). 형식 1) {"ch1_sN": enemy_squad,...} 적 편성만 교체 2) 임밸런 v3 문서(items[].enemy_squads, cells/triggers/ai/ally_zone_override/map_zone_proposals; stages_ch1_enemy_v3.json은 ch1_s1~10, stages_legacy6_enemy_v3.json은 기존 stage_01~06의 enemy_squad만 갱신)} {--with-protagonist : 캠페인 ch1 전 스테이지 forced_heroes에 @protagonist 추가(주인공 BE 반영 후)} {--named : 임밸런 additions(stages_*_enemy_v3_additions.json)의 enemy_squads 로 stage_02/03/04, ch1_s8/s10 만 치환(--enemy 로 읽은 v3 문서 대상, 유닛 총수 동일 검증)} {--with-npc : npc_roster_v3.json NPC + 송서사 화자(enemy_lines_draft.json) 중 미중복 항목을 heroes에 시드(campaign_only, 가챠/소유 제외)}';

    /** @var array<string,array> stages_imjin10.json map_meta_patch */
    private array $metaPatch = [];

    protected $description = '임진왜란 10맵·수상 지형·병종(naval) 적재 + ch1_s1~s10 스테이지 재배정(멱등)';

    public function handle(GameData $data): int
    {
        foreach ([['terrains', 'water'], ['terrains', 'boarding'], ['terrains', 'blocks_line_of_fire'], ['stages', 'forced_heroes'], ['stages', 'triggers'], ['stages', 'required_hero'], ['maps', 'meta']] as [$t, $c]) {
            if (! Schema::hasColumn($t, $c)) {
                $this->error("{$t}.{$c} 컬럼이 없습니다. 먼저 php artisan migrate 를 실행하세요.");

                return self::FAILURE;
            }
        }
        $stagesDoc = $this->json('stages_imjin10.json');
        $mapsDoc = $this->json('maps_imjin10.json');
        if ($this->option('named') && (! $this->option('enemy') || ! $this->option('with-npc'))) {
            $this->error('--named 는 --enemy=<v3 문서>(예: stages_ch1_enemy_v3.json,stages_legacy6_enemy_v3.json) 와 --with-npc 를 함께 지정해야 합니다.');

            return self::FAILURE;
        }
        $enemyOverride = [];
        $v3 =['items' => [], 'zones' => [], 'ally' => []];
        foreach (array_filter(array_map('trim', explode(',', (string) $this->option('enemy')))) as $f) {
            if ($f !== basename($f)) {
                $this->error('--enemy는 파일명만 허용합니다.');

                return self::FAILURE;
            }
            $doc = $this->json($f);
            if (isset($doc['items'][0]['enemy_squads'])) {   // 임밸런 v3 문서
                foreach ($doc['items'] as $it) {
                    $v3['items'][$it['code']] = $it;
                    ! empty($it['ally_zone_override']) && $v3['ally'][$it['map']] = $it['ally_zone_override'];
                }
                $v3['zones'] += $doc['map_zone_proposals'] ?? [];
            } else {
                $enemyOverride += $doc;
            }
        }
        $this->option('named') && $this->applyNamedAdditions($v3['items']);
        try {
            DB::beginTransaction();
            $this->seedRules();
            $data->flush();
            \App\Support\ScaleUpMaps::ensureFor(array_column($stagesDoc['items'], 'map'));   // su_ 확장 맵(스테이지 map 교체분)
            $this->metaPatch = $stagesDoc['map_meta_patch'] ?? [];
            $this->option('with-npc') && $this->seedNpcs();
            $data->flush();
            $mapIds = $this->seedMaps($mapsDoc, $stagesDoc['map_meta_patch'] ?? [], $data, $v3['zones'], $v3['ally']);
            $this->seedStages($stagesDoc['items'], $mapIds, $enemyOverride, $data, $v3['items']);
            $this->seedLegacy(array_filter($v3['items'], fn ($it, $c) => ! str_starts_with($c, 'ch1_'), ARRAY_FILTER_USE_BOTH), $data);
            if ($this->option('dry-run')) {
                DB::rollBack();
                $this->info('dry-run: DB 변경 없음(롤백)');
            } else {
                DB::commit();
                $this->info('seed-imjin10 완료');
            }
        } catch (\Throwable $e) {
            DB::rollBack();
            $this->error('중단(전체 롤백): '.$e->getMessage());

            return self::FAILURE;
        }

        return self::SUCCESS;
    }

    private function json(string $file): array
    {
        $p = database_path('data/'.$file);
        is_file($p) || throw new \RuntimeException("파일 없음: data/{$file}");

        return json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR);
    }

    /** 지형·지형 보정·병종·상성. 기존 행은 보존하되 water/boarding 속성과 누락된 (지형, move_type) 보정 행·누락 상성은 채운다. --force면 JSON 값으로 덮어씀. */
    private function seedRules(): void
    {
        $force = (bool) $this->option('force');
        $now = now();
        $terrains = $this->json('terrains.json')['items'];
        foreach ($terrains as $t) {
            $row = ['name' => $t['name'], 'symbol' => $t['symbol'], 'elevation' => (int) ($t['elevation'] ?? 0), 'cover' => (int) ($t['cover'] ?? 0), 'heals' => (int) ($t['heals'] ?? 0),
                'water' => (int) ($t['water'] ?? 0), 'boarding' => (int) ($t['boarding'] ?? 0), 'blocks_line_of_fire' => (int) ($t['blocks_line_of_fire'] ?? 0)];
            $q = DB::table('terrains')->where('code', $t['code']);
            if (! $q->exists()) {
                DB::table('terrains')->insert(['code' => $t['code'], 'created_at' => $now, 'updated_at' => $now] + $row);
            } elseif ($force) {
                $q->update($row + ['updated_at' => $now]);
            } else {
                $q->update(['water' => $row['water'], 'boarding' => $row['boarding'], 'blocks_line_of_fire' => $row['blocks_line_of_fire'], 'updated_at' => $now]);
            }
        }
        $tid = DB::table('terrains')->pluck('id', 'code');
        $n = 0;
        foreach ($terrains as $t) {
            foreach ($t['modifiers'] as $mt => $m) {
                $q = DB::table('terrain_modifiers')->where(['terrain_id' => $tid[$t['code']], 'move_type' => $mt]);
                $vals = ['move_cost' => $m['cost'], 'def_pct' => $m['def_pct']];
                if (! $q->exists()) {
                    DB::table('terrain_modifiers')->insert(['terrain_id' => $tid[$t['code']], 'move_type' => $mt, 'created_at' => $now, 'updated_at' => $now] + $vals);
                    $n++;
                } elseif ($force) {
                    $q->update($vals + ['updated_at' => $now]);
                }
            }
        }
        foreach ($this->json('unit_types.json')['items'] as $u) {
            if ($u['code'] !== 'naval' && ! $force) {
                continue;   // 기존 병종은 건드리지 않음(naval 신규만)
            }
            $row = array_intersect_key($u, array_flip(['name', 'move', 'range_min', 'range_max', 'hp', 'atk', 'def', 'move_type', 'heal']));
            $q = DB::table('unit_types')->where('code', $u['code']);
            if (! $q->exists()) {
                DB::table('unit_types')->insert(['code' => $u['code'], 'cost' => (int) (config('game.troop_unit_cost')[$u['code']] ?? 1), 'created_at' => $now, 'updated_at' => $now] + $row);
            } elseif ($force) {
                $q->update($row + ['updated_at' => $now]);
            }
        }
        $types = DB::table('unit_types')->pluck('id', 'code');
        foreach ($this->json('matchups.json')['items'] as $m) {
            if (! isset($types[$m['attacker']], $types[$m['defender']]) || ($m['attacker'] !== 'naval' && $m['defender'] !== 'naval' && ! $force)) {
                continue;
            }
            $key = ['attacker_unit_type_id' => $types[$m['attacker']], 'defender_unit_type_id' => $types[$m['defender']]];
            $q = DB::table('matchup_rules')->where($key);
            if (! $q->exists()) {
                DB::table('matchup_rules')->insert($key + ['multiplier' => $m['multiplier'], 'created_at' => $now, 'updated_at' => $now]);
            } elseif ($force) {
                $q->update(['multiplier' => $m['multiplier'], 'updated_at' => $now]);
            }
        }
        $this->line(sprintf('지형 %d종, 보정 행 신규 %d, 병종 %d종', DB::table('terrains')->count(), $n, DB::table('unit_types')->count()));
    }

    /** @return array<string,int> map code => id */
    private function seedMaps(array $doc, array $metaPatch, GameData $data, array $zoneProps = [], array $allyOverride = []): array
    {
        $rules = $data->rules();
        $checker = new MapChecker($rules);
        $size = max(10, (int) config('game.deploy_zone_size', 16));
        $rows = [];
        $err = 0;
        $now = now();
        foreach ($doc['items'] as $m) {
            $w = strlen($m['tiles'][0]);
            $h = count($m['tiles']);
            $zones = $this->expandZones($m, $rules, $size);
            if (isset($zoneProps[$m['code']])) {   // 임밸런 v3 map_zone_proposals: 측당 30칸 구역으로 교체(MapChecker가 스폰/통행 검증)
                foreach (['a', 'b'] as $s) {
                    ! empty($zoneProps[$m['code']][$s]) && $zones[$s] = array_map(fn ($c) => [(int) $c[0], (int) $c[1]], $zoneProps[$m['code']][$s]);
                }
            }
            ! empty($allyOverride[$m['code']]) && $zones['a'] = array_map(fn ($c) => [(int) $c[0], (int) $c[1]], $allyOverride[$m['code']]);   // ally_zone_override(진주성 성 내부)
            $meta = $m['meta'];
            ! empty($m['tile_layer']) && $meta['tile_layer'] = $m['tile_layer'];
            foreach ($metaPatch[$m['code']] ?? [] as $k => $v) {
                $meta[$k] = $v;
            }
            $meta['deploy_zone_size'] = $size;
            if (! empty($m['tile_layer']) && ! GameData::tileLayerFits($m['tile_layer'], [$w, $h])) {
                $this->error("[{$m['code']}] tile_layer 크기 불일치");
                $err++;
            }
            $res = $checker->check(['code' => $m['code'], 'width' => $w, 'height' => $h, 'tiles' => $m['tiles'], 'spawns' => $m['spawns'], 'deploy_zones' => $zones]);
            $e = array_filter($res, fn ($r) => $r[1] === 'ERROR');
            $wn = array_filter($res, fn ($r) => $r[1] === 'WARN');
            foreach ($e as $r) {
                $this->error("[{$m['code']}] {$r[0]}: {$r[2]}");
            }
            foreach ($wn as $r) {
                $this->warn("[{$m['code']}] {$r[0]}: {$r[2]}");
            }
            $err += count($e);
            $this->line(sprintf('  %-22s %dx%d zone a%d/b%d  ERROR %d WARN %d', $m['code'], $w, $h, count($zones['a']), count($zones['b']), count($e), count($wn)));
            $rows[] = ['code' => $m['code'], 'name' => $m['name'], 'width' => $w, 'height' => $h, 'tiles' => json_encode($m['tiles']), 'spawns' => json_encode($m['spawns']),
                'deploy_zones' => json_encode($zones), 'biome' => $m['biome'] ?? null, 'meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'created_at' => $now, 'updated_at' => $now];
        }
        if ($err > 0) {
            throw new \RuntimeException("맵 검증 ERROR {$err}건");
        }
        $kept = \App\Support\MapRedesignGuard::upsert($rows, ['name', 'width', 'height', 'tiles', 'spawns', 'deploy_zones', 'biome', 'meta', 'updated_at']);
        foreach ($kept as $c) {
            $this->warn("  {$c}: meta.redesign 개편 맵 -> 덮어쓰기 건너뜀(보호)");
        }
        $this->info('im_* '.(count($rows) - count($kept)).'행 갱신'.($kept ? ' / 개편 보호 '.count($kept).'행' : ''));

        return DB::table('maps')->whereIn('code', array_column($rows, 'code'))->pluck('id', 'code')->map(fn ($v) => (int) $v)->all();
    }

    /**
     * 배치 영역 확장: 기존 영역 칸 + 원본 스폰(허공 위 스폰 제외)에서 4방향 BFS로 가장 가까운 보병 통행 칸을 채워 측당 $size칸까지.
     * 제외: 상대 스폰·상대 영역, 암초(reef)·허공 등 통행 불가. 두 영역이 겹치지 않게 a/b를 번갈아 한 칸씩 확장한다.
     */
    private function expandZones(array $m, $rules, int $size): array
    {
        $w = strlen($m['tiles'][0]);
        $h = count($m['tiles']);
        $terr = fn (int $x, int $y) => $rules->symbols[$m['tiles'][$y][$x]] ?? 'plain';
        $ok = fn (int $x, int $y) => $x >= 0 && $y >= 0 && $x < $w && $y < $h
            && $rules->terrainMod($terr($x, $y), 'foot')['cost'] !== null && $terr($x, $y) !== 'reef';
        $zone = ['a' => [], 'b' => []];
        $taken = [];
        foreach (['a', 'b'] as $s) {   // 원본 영역(유효 칸만) 보존
            foreach ($m['deploy_zones'][$s] as [$x, $y]) {
                if ($ok($x, $y) && ! isset($taken["$x,$y"])) {
                    $zone[$s][] = [$x, $y];
                    $taken["$x,$y"] = $s;
                }
            }
        }
        foreach (['a', 'b'] as $s) {   // 원본 스폰이 영역에 빠져 있으면 추가(통행 가능 칸만)
            foreach ($m['spawns'][$s] as [$x, $y]) {
                if ($ok($x, $y) && ! isset($taken["$x,$y"])) {
                    $zone[$s][] = [$x, $y];
                    $taken["$x,$y"] = $s;
                }
            }
        }
        $queue = ['a' => $zone['a'], 'b' => $zone['b']];
        $guard = 0;
        while ((count($zone['a']) < $size || count($zone['b']) < $size) && $guard++ < 5000) {
            $progress = false;
            foreach (['a', 'b'] as $s) {
                if (count($zone[$s]) >= $size) {
                    continue;
                }
                while ($queue[$s]) {
                    [$x, $y] = array_shift($queue[$s]);
                    foreach ([[0, -1], [-1, 0], [1, 0], [0, 1]] as [$dx, $dy]) {
                        $nx = $x + $dx;
                        $ny = $y + $dy;
                        if ($ok($nx, $ny) && ! isset($taken["$nx,$ny"]) && count($zone[$s]) < $size) {
                            $zone[$s][] = [$nx, $ny];
                            $taken["$nx,$ny"] = $s;
                            $queue[$s][] = [$nx, $ny];
                            $progress = true;
                        }
                    }
                    if ($progress) {
                        break;
                    }
                }
            }
            if (! $progress) {
                break;
            }
        }

        return $zone;
    }

    private function seedStages(array $items, array $mapIds, array $enemyOverride, GameData $data, array $v3Items = []): void
    {
        $force = (bool) $this->option('force');
        $now = now();
        $types = array_keys($data->rules()->unitTypes);
        $heroes = DB::table('heroes')->pluck('id', 'code');
        $fallbackPreset = (int) (DB::table('stages')->orderBy('id')->where('code', 'not like', 'ch1_%')->value('enemy_preset_id') ?: DB::table('presets')->orderBy('id')->value('id'));
        $ids = [];
        foreach ($items as $s) {
            $code = $s['code'];
            $mapId = $mapIds[$s['map']] ?? (str_starts_with((string) $s['map'], 'su_') ? DB::table('maps')->where('code', $s['map'])->value('id') : null) ?? throw new \RuntimeException("{$code}: 맵 {$s['map']} 없음");
            $meta = json_decode((string) DB::table('maps')->where('id', $mapId)->value('meta'), true) ?: [];
            if (! isset($mapIds[$s['map']]) && ! empty($this->metaPatch[$s['map']])) {   // su_ 맵: map_meta_patch(예: enemy_extra_zones) 병합
                foreach ($this->metaPatch[$s['map']] as $k => $v) {
                    $meta[$k] = $v;
                }
                DB::table('maps')->where('id', $mapId)->update(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
            }
            $squad = $enemyOverride[$code] ?? $s['enemy_squad'];
            $trigRaw = $s['triggers'] ?? [];
            $peak = null;
            if (isset($v3Items[$code])) {   // 임밸런 v3: 변환 + 증원 구역을 맵 meta.enemy_extra_zones에 병합 + 좌표 검증
                $conv = EnemyV3Adapter::convert($v3Items[$code], $this->roster(), $s['enemy_squad']['culture'] ?? null);
                $squad = $conv['enemy_squad'];
                $trigRaw = $conv['triggers'];
                $peak = $conv['units_peak'];
                if ($conv['zones']) {
                    $meta['enemy_extra_zones'] = array_merge($meta['enemy_extra_zones'] ?? [], $conv['zones']);
                    DB::table('maps')->where('id', $mapId)->update(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
                }
                $this->validateCells($code, $squad, $conv['zones'], (int) $mapId, $data);
                foreach ($conv['deferred'] as $d) {
                    $this->warn("  {$code}: 엔진 미지원 트리거 {$d['id']} (".json_encode($d['on']).') -> enemy_squad.deferred_triggers 로만 보존');
                }
            }
            $this->validateSquad($code, $squad, $types, $peak);
            foreach ([$s['rules']['cues'] ?? null, $s['new']['rules']['cues'] ?? null] as $rawCues) {   // 잘못된 cue 는 런타임에 조용히 버려지므로 시드 단계에서 경고
                ($d = \App\Game\Cues::dropped($rawCues)) > 0 && $this->warn("  {$code}: cues {$d}건이 유효하지 않아 무시됨(on/do/필드 확인)");
                foreach (app(\App\Services\CueWalkAudit::class)->check((int) $mapId, $rawCues, $squad, \App\Game\Engine::normalizeDeploySlots($s['rules']['deploy_slots'] ?? null)['fixed'] ?? []) as $m) {   // 연출 액터/보행 정적 검증(액터 cue 없으면 무동작)
                    $this->warn("  {$code}: cue 액터 {$m}");
                }
            }
            Engine::resolveObjective($s['objective'], $meta) !== null || ($s['objective']['type'] === 'defeat_commander') || throw new \RuntimeException("{$code}: objective 해석 실패(맵 objective_points 확인)");
            $trig = Engine::normalizeTriggers($trigRaw, $meta['enemy_extra_zones'] ?? [], 1, 3.0, $types);
            count($trig) === count($trigRaw) || throw new \RuntimeException("{$code}: triggers 일부가 무효(zone/turn/units 확인)");
            $forced = $s['forced_heroes'] ?? [];
            if ($this->option('with-protagonist') && ! in_array('@protagonist', $forced, true)) {
                $forced = array_merge(['@protagonist'], $forced);
            }
            foreach ($forced as $f) {
                $hc = is_array($f) ? ($f['hero'] ?? '') : $f;
                ($hc === '@protagonist' || isset($heroes[$hc])) || throw new \RuntimeException("{$code}: forced_heroes 영웅 {$hc} 없음");
            }
            $core = ['map_id' => $mapId, 'objective' => json_encode($s['objective']), 'forced_heroes' => json_encode($forced), 'triggers' => json_encode($trigRaw, JSON_UNESCAPED_UNICODE),
                'enemy_squad' => json_encode($squad, JSON_UNESCAPED_UNICODE), 'enemy_extra_troops' => '[]', 'updated_at' => $now];
            isset($v3Items[$code]) && is_int($v3Items[$code]['enemy_level_offset'] ?? null) && $core['enemy_level_offset'] = $v3Items[$code]['enemy_level_offset'];   // v3 문서의 오프셋(임밸런 조정값)을 stages.enemy_level_offset 에 반영
            array_key_exists('rules', $s) && $core['rules'] = \App\Support\StageRulesMerge::resolve($code, $s['rules'], $forced);   // stages.rules: 키 없음=유지 / null=지움 / 객체=병합(App\Support\StageRulesMerge)
            $q = DB::table('stages')->where('code', $code);
            if ($q->exists()) {
                $upd = $core;
                if ($force && isset($s['new'])) {
                    $upd += array_diff_key($s['new'], ['prerequisite' => 1, 'star_conditions' => 1]) + ['star_conditions' => json_encode($s['new']['star_conditions'])];
                }
                $q->update($upd);
                $this->line("  {$code} 갱신 -> {$s['map']}");
            } else {
                isset($s['new']) || throw new \RuntimeException("{$code}: 기존 행이 없고 new 정의도 없습니다.");
                $n = $s['new'];
                DB::table('stages')->insert($core + array_diff_key($n, ['prerequisite' => 1, 'star_conditions' => 1]) + [
                    'code' => $code, 'enemy_preset_id' => $fallbackPreset, 'chapter' => 1, 'star_conditions' => json_encode($n['star_conditions']), 'join_hero' => '[]', 'created_at' => $now,
                ]);
                $this->line("  {$code} 신규 -> {$s['map']}");
            }
            $ids[$code] = (int) DB::table('stages')->where('code', $code)->value('id');
        }
        foreach ($items as $s) {   // 선행 체인(신규 행만 채움: 기존 값 보존)
            $p = $s['new']['prerequisite'] ?? null;
            $p !== null && isset($ids[$p]) && DB::table('stages')->where('id', $ids[$s['code']])->whereNull('prerequisite_stage_id')->update(['prerequisite_stage_id' => $ids[$p]]);
        }
    }

    /** @var array<string,array>|null npc code => 로스터 행 */
    private ?array $roster = null;

    /** 병합 전 로스터 항목 총수(기본 + additions*). 병합 후 count + 충돌 건수와 일치해야 한다. */
    private int $rosterSourceCount = 0;

    private int $rosterConflicts = 0;

    /** additions 파일 내부 중복 code 건수(충돌과 별도 집계, 0이어야 함) */
    private int $rosterInternalDups = 0;

    /** additions 로 enemy_squads 치환을 허용하는 스테이지(임밸런: 승률 ±3%p 내 확인분만. 나머지는 scene_cast 전용 = 치환 금지) */
    private const NAMED_REPLACE = ['stage_02', 'stage_03', 'stage_04', 'ch1_s8', 'ch1_s10'];

    /** 기본 npc_roster_v3.json + npc_roster_v3_additions*.json(shelf 포함, 파일명순) 병합. code 충돌은 먼저 읽힌(기존) 행 우선 + 경고. */
    private function roster(): array
    {
        if ($this->roster === null) {
            $this->roster = [];
            $base = $this->json('npc_roster_v3.json')['items'];
            foreach ($base as $n) {
                $this->roster[$n['code']] = $n;
            }
            count($this->roster) === count($base) || throw new \RuntimeException('npc_roster_v3.json: 중복 code');
            $this->rosterSourceCount = count($base);
            $files = array_map('basename', glob(database_path('data/npc_roster_v3_additions*.json')) ?: []);
            sort($files);
            foreach ($files as $f) {
                $seenInFile = [];
                foreach ($this->json($f)['items'] as $n) {
                    $this->rosterSourceCount++;
                    if (isset($seenInFile[$n['code']])) {   // 같은 additions 파일 내부 중복: 타 파일과의 충돌 집계와 구분(seedNpcs 에서 중단)
                        $this->rosterInternalDups++;
                        $this->warn("  roster 파일 내부 중복: {$n['code']} ({$f})");

                        continue;
                    }
                    $seenInFile[$n['code']] = true;
                    if (isset($this->roster[$n['code']])) {
                        $this->rosterConflicts++;
                        $this->warn("  roster 충돌: {$n['code']} ({$f}) -> 먼저 로드된 행 우선, 무시");

                        continue;
                    }
                    $this->roster[$n['code']] = $n;   // battle_role=scene_only 도 로스터/heroes 행에는 포함(전투 편성은 stages.enemy_squad 만 결정)
                }
            }
        }

        return $this->roster;
    }

    /** --named: 허용 5개 스테이지의 v3 항목 enemy_squads 만 additions 값으로 교체(triggers·기타 불변). 유닛 총수가 달라지면 중단. */
    private function applyNamedAdditions(array &$v3Items): void
    {
        foreach (['stages_legacy6_enemy_v3_additions.json', 'stages_ch1_enemy_v3_additions.json'] as $f) {
            foreach ($this->json($f)['items'] as $add) {
                $code = $add['code'];
                if (! isset($v3Items[$code])) {
                    continue;
                }
                if (! in_array($code, self::NAMED_REPLACE, true)) {
                    $this->line("  {$code}: 치환 대상 아님(scene_cast 전용) -> 건너뜀");

                    continue;
                }
                if (! isset($add['enemy_squads'])) {
                    $this->warn("  {$code}: additions 항목에 enemy_squads 키 없음 -> 건너뜀({$f})");

                    continue;
                }
                $before = EnemyV3Adapter::countUnits(EnemyV3Adapter::convert($v3Items[$code])['enemy_squad']);
                $new = $v3Items[$code];
                $new['enemy_squads'] = $add['enemy_squads'];
                $after = EnemyV3Adapter::countUnits(EnemyV3Adapter::convert($new)['enemy_squad']);
                $before === $after || throw new \RuntimeException("{$code}: additions 치환 후 유닛 수 {$after} != 기존 {$before}");
                $v3Items[$code] = $new;
                $this->line("  {$code}: enemy_squads -> additions 치환 (유닛 {$after}기 동일)");
            }
        }
    }

    /**
     * v3 부대 좌표 검증(ERROR=예외): 맵 안, 부대 간 중복 없음, 병종 이동 타입으로 통행 가능한 지형. 아군 스폰과 맨해튼 5 미만은 WARN.
     *
     * @param  array<string,array>  $zones  증원 구역(이름 => 칸). 칸이 맵 안인지만 본다(엔진이 가장 가까운 빈 통행 칸으로 밀어냄)
     */
    private function validateCells(string $code, array $squad, array $zones, int $mapId, GameData $data): void
    {
        $rules = $data->rules();
        $map = DB::table('maps')->where('id', $mapId)->first(['tiles', 'spawns', 'width', 'height']);
        $tiles = json_decode($map->tiles, true);
        $spawnA = json_decode($map->spawns, true)['a'] ?? [];
        $seen = [];
        $parts = [[$squad['id'] ?? 'A', $squad['commander']['unit_type'], $squad['cells'] ?? []]];
        foreach ($squad['squads'] ?? [] as $sq) {
            $parts[] = [$sq['id'] ?? '?', $sq['commander']['unit_type'], $sq['cells'] ?? []];
        }
        foreach ($parts as [$sid, $type, $cells]) {
            $mt = $rules->unitType($type)['move_type'];
            foreach ($cells as [$x, $y]) {
                ($x >= 0 && $y >= 0 && $x < $map->width && $y < $map->height) || throw new \RuntimeException("{$code} 부대 {$sid}: 좌표 ({$x},{$y})가 맵 밖입니다.");
                isset($seen["$x,$y"]) && throw new \RuntimeException("{$code} 부대 {$sid}: 좌표 ({$x},{$y}) 중복(부대 {$seen["$x,$y"]}).");
                $seen["$x,$y"] = $sid;
                $terr = $rules->symbols[$tiles[$y][$x]] ?? 'plain';
                $rules->terrainMod($terr, $mt)['cost'] !== null || throw new \RuntimeException("{$code} 부대 {$sid}: ({$x},{$y}) {$terr} 칸은 {$type}({$mt})가 통행할 수 없습니다.");
                foreach ($spawnA as [$ax, $ay]) {
                    if (abs($ax - $x) + abs($ay - $y) < 5) {
                        $this->warn("  {$code} 부대 {$sid}: ({$x},{$y})가 아군 스폰 ({$ax},{$ay})와 맨해튼 5 미만");
                        break;
                    }
                }
            }
        }
        foreach ($zones as $name => $cells) {
            foreach ($cells as [$x, $y]) {
                ($x >= 0 && $y >= 0 && $x < $map->width && $y < $map->height) || throw new \RuntimeException("{$code} 증원 구역 {$name}: ({$x},{$y})가 맵 밖입니다.");
            }
        }
    }

    /**
     * 비캠페인 stage_01~06: 기존 행의 enemy_squad만 v3 편성으로 교체(map·보상·enemy_level·프리셋·triggers 불변, 행이 없으면 건너뜀).
     * 맵 코드가 v3 문서와 다르면 중단. 증원 트리거가 있으면 공유 맵(PvP 사용) meta를 건드리게 되므로 지원하지 않는다(중단).
     */
    private function seedLegacy(array $items, GameData $data): void
    {
        $types = array_keys($data->rules()->unitTypes);
        foreach ($items as $code => $it) {
            $row = DB::table('stages')->where('code', $code)->first(['id', 'map_id']);
            if (! $row) {
                $this->warn("  {$code}: stages 행 없음 -> 건너뜀");

                continue;
            }
            $mapCode = (string) DB::table('maps')->where('id', $row->map_id)->value('code');
            $mapCode === $it['map'] || throw new \RuntimeException("{$code}: 맵 불일치(DB {$mapCode} != v3 {$it['map']})");
            $baseCul = DB::table('heroes')->where('code', $it['commander_hero'] ?? '')->value('culture');
            $conv = EnemyV3Adapter::convert($it, $this->roster(), $baseCul ? (string) $baseCul : null);
            $conv['triggers'] === [] && $conv['deferred'] === [] || throw new \RuntimeException("{$code}: 비캠페인 스테이지의 증원 트리거는 지원하지 않습니다.");
            $this->validateCells($code, $conv['enemy_squad'], [], (int) $row->map_id, $data);
            $this->validateSquad($code, $conv['enemy_squad'], $types);
            DB::table('stages')->where('id', $row->id)->update(['enemy_squad' => json_encode($conv['enemy_squad'], JSON_UNESCAPED_UNICODE), 'updated_at' => now()]);
            $this->line(sprintf('  %s enemy_squad 갱신 -> v3 %d부대 %d기 (%s)', $code, 1 + count($conv['enemy_squad']['squads'] ?? []), $conv['units_initial'], $mapCode));
        }
    }

    /**
     * NPC 영웅 행 시드: npc_roster_v3.json 46명 + 송서사 화자(scenario/enemy_lines_draft.json) 11개 중 로스터와 같은 인물은 별칭으로 흡수(중복 행 금지), 나머지는 신규 행.
     * 플래그: heroes.campaign_only=1, is_protagonist=0(소유/가챠/도감/무작위 편성 제외 대상). 병종 naval 허용. 기존 행은 --force일 때만 덮어씀(멱등).
     */
    private function seedNpcs(): void
    {
        $force = (bool) $this->option('force');
        $now = now();
        $roster = $this->roster();
        $this->rosterInternalDups === 0 || throw new \RuntimeException("npc roster additions: 파일 내부 중복 code {$this->rosterInternalDups}건");
        $this->rosterSourceCount === count($roster) + $this->rosterConflicts + $this->rosterInternalDups || throw new \RuntimeException('npc roster: 병합 개수 불일치(파일 내부 중복 code?)');
        $heroesJson = array_column($this->json('heroes.json')['items'], 'code');
        $alias = $this->npcAliases($roster);   // 화자 code => 로스터 code
        $types = DB::table('unit_types')->pluck('id', 'code');
        $skills = DB::table('skills')->pluck('id', 'code');
        $auras = DB::table('auras')->pluck('id', 'code');
        $cultures = array_keys($this->json('hero_cultures.json')['sets'] ?? []);
        $rows = [];
        foreach ($roster as $code => $n) {
            in_array($code, $heroesJson, true) && throw new \RuntimeException("NPC {$code}: heroes.json 영웅과 code 중복");
            $rows[$code] = $n;
        }
        foreach ($this->npcSpeakers() as $sp) {   // 로스터에 없고 별칭도 아닌 화자 = 신규 행(스탯은 같은 병종·등급 틀의 로스터 행 복사)
            if (isset($roster[$sp['code']]) || isset($alias[$sp['code']])) {
                continue;
            }
            in_array($sp['code'], $heroesJson, true) && throw new \RuntimeException("NPC {$sp['code']}: heroes.json 영웅과 code 중복");
            $tpl = $roster['npc_manabe_samanojo'];   // 수군 C등급 틀
            $rows[$sp['code']] = array_merge($tpl, ['code' => $sp['code'], 'name_ko' => $sp['name_ko'], 'short_name' => null, 'hanja' => null, 'era' => null, 'faction' => $sp['faction'] ?? null,
                'evidence_level' => $sp['evidence_level'], 'appearance' => null, 'skill' => null, 'aura' => null, 'culture' => 'japan', 'used_in' => $sp['stages'] ?? []]);
        }
        $aliasOf = [];
        foreach ($alias as $speaker => $canon) {
            $aliasOf[$canon][] = $speaker;
        }
        $ins = 0;
        $upd = 0;
        foreach ($rows as $code => $n) {
            isset($types[$n['unit_type']]) || throw new \RuntimeException("NPC {$code}: 알 수 없는 병종 {$n['unit_type']}");
            ($n['skill'] === null || isset($skills[$n['skill']])) || throw new \RuntimeException("NPC {$code}: 스킬 {$n['skill']} 없음");
            ($n['aura'] === null || isset($auras[$n['aura']])) || throw new \RuntimeException("NPC {$code}: 오라 {$n['aura']} 없음");
            $cul = EnemyV3Adapter::CULTURE_MAP[$n['culture'] ?? ''] ?? null;
            ($cul === null || in_array($cul, $cultures, true)) || throw new \RuntimeException("NPC {$code}: 문화권 {$cul} 미등록");
            $note = mb_substr('NPC(캠페인 전용) '.($n['faction'] ?? '').' / 근거 '.($n['evidence_level'] ?? '?').(isset($aliasOf[$code]) ? ' / 화자별칭 '.implode(',', $aliasOf[$code]) : ''), 0, 250);
            $row = ['name_ko' => $n['name_ko'], 'name_en' => $n['code'], 'era' => $n['era'] ?? null, 'unit_type_id' => $types[$n['unit_type']], 'rarity' => $n['rarity'], 'cost' => (int) $n['cost'],
                'hp_bonus' => (int) $n['hp_bonus'], 'atk_bonus' => (int) $n['atk_bonus'], 'def_bonus' => (int) $n['def_bonus'],
                'growth_hp_pct' => $n['growth_hp_pct'], 'growth_atk_pct' => $n['growth_atk_pct'], 'growth_def_pct' => $n['growth_def_pct'],
                'skill_id' => $n['skill'] ? $skills[$n['skill']] : null, 'aura_id' => $n['aura'] ? $auras[$n['aura']] : null, 'culture' => $cul, 'troop_bonus' => 0,
                'verify' => ($n['evidence_level'] ?? '') === 'verify', 'note' => $note, 'troop_type' => $n['unit_type'], 'campaign_only' => empty($n['playable']), 'is_protagonist' => false,
                'short_name' => ! empty($n['short_name']) && mb_strlen($n['short_name']) <= 32 ? $n['short_name'] : null];
            $q = DB::table('heroes')->where('code', $code);
            if (! $q->exists()) {
                DB::table('heroes')->insert(['code' => $code, 'created_at' => $now, 'updated_at' => $now] + $row);
                $ins++;
            } elseif ($force) {
                if (in_array($code, \App\Support\HeroWave3::promoteCodes(), true) && ! $q->clone()->value('campaign_only')) {   // 3차 확장 승격(game:seed-hero-wave3)은 되돌리지 않는다
                    unset($row['campaign_only']);
                }
                $q->update($row + ['updated_at' => $now]);
                $upd++;
            } elseif (empty($n['playable']) && ! in_array($code, \App\Support\HeroWave3::promoteCodes(), true)) {   // 승격(playable) 행은 플래그를 되돌리지 않는다(game:npc-promote / game:seed-hero-wave3 로 관리)
                $q->where('campaign_only', false)->update(['campaign_only' => true, 'troop_type' => $n['unit_type'], 'updated_at' => $now]);   // 플래그만 보정
            }
        }
        $this->line(sprintf('NPC %d행(신규 %d, 갱신 %d), 화자 별칭 %d개는 로스터 행으로 흡수', count($rows), $ins, $upd, count($alias)));
    }

    /** 송서사 화자 목록(enemy_lines_draft.json speakers[]) */
    private function npcSpeakers(): array
    {
        $p = database_path('data/scenario/enemy_lines_draft.json');

        return is_file($p) ? (json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR)['speakers'] ?? []) : [];
    }

    /**
     * 화자 code -> 로스터 code 별칭. 규칙: npc_jp_X -> npc_X, 이름(name_ko) 일치 시 흡수(예: npc_ink_shadow_s8/npc_ink_shadow_final -> 같은 이름 로스터 행).
     * 같은 이름의 로스터 행이 없으면 별칭 아님(신규 행).
     */
    private function npcAliases(array $roster): array
    {
        $byName = [];
        foreach ($roster as $code => $n) {
            $byName[$n['name_ko']][] = $code;
        }
        $alias = [];
        foreach ($this->npcSpeakers() as $sp) {
            $c = $sp['code'];
            if (isset($roster[$c])) {
                continue;
            }
            $cand = 'npc_'.preg_replace('/^npc_(jp|ink)_/', '', $c);
            if (isset($roster[$cand]) && $roster[$cand]['name_ko'] === $sp['name_ko']) {
                $alias[$c] = $cand;
            } elseif (count($byName[$sp['name_ko']] ?? []) === 1) {
                $alias[$c] = $byName[$sp['name_ko']][0];
            }
        }

        return $alias;
    }

    private function validateSquad(string $code, array $squad, array $types, ?int $peak = null): void
    {
        $all = [$squad['commander']['unit_type'] ?? '', ...($squad['units'] ?? [])];
        $total = 1 + count($squad['units'] ?? []);
        foreach ($squad['squads'] ?? [] as $sq) {
            $all[] = $sq['commander']['unit_type'] ?? '';
            array_push($all, ...($sq['units'] ?? []));
            $total += 1 + count($sq['units'] ?? []);
        }
        foreach ($all as $t) {
            in_array($t, $types, true) || throw new \RuntimeException("{$code}: 알 수 없는 병종 '{$t}'");
        }
        $total <= ArmyBuilder::enemyStageCap() || throw new \RuntimeException("{$code}: 적 유닛 {$total}기 > 적 편성 상한 ".ArmyBuilder::enemyStageCap().' (config game.max_units_enemy_stage / max_units_hard_cap)');
        $peak === null || $peak <= (int) config('game.max_alive_per_side_stage') || throw new \RuntimeException("{$code}: 증원 포함 적 {$peak}기 > 생존 상한 ".(int) config('game.max_alive_per_side_stage').' (config game.max_alive_per_side_stage)');
    }
}
