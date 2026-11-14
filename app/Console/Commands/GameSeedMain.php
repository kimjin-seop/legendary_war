<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\Engine;
use App\Game\MapChecker;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 오리지널 메인 스토리 1막 시드(가산 전용, 개발 DB 전용 도구). 입력:
 * --act=N(기본 1): 아래 파일·접두의 a1/ch101 은 N막 값(a2/ch102 ...)으로 치환된다. 2막 이상은 s1 의 prerequisite 로 직전 막의 이미 적재된 스테이지(예: ch101_s5)를 허용한다.
 *  - database/data/stages_main_a1.json  : stages ch101_s1~s5 (chapter 101, 선형 prerequisite, rules.cues, 선택 join_hero 포함)
 *  - database/data/maps_main_a1.json    : maps main_a1_* (맵디자이너 산출, maps_imjin10.json 과 같은 items[] 형식; deploy_zones 필수). 없으면 --dry-run 은 맵 검증만 건너뛰고, 실제 실행은 중단.
 *  - database/data/npc_roster_main_a1.json : --with-npc / --npc-all 일 때만 heroes campaign_only 행 추가
 *
 * 안전 규칙: 코드 접두 ch101_ (stages) / main_a1_ (maps) / npc_roster_main_a1.json 의 npc_* 만 다룬다. 기존(다른 접두) 행은 읽기만 하고 쓰지 않는다.
 * 이미 있는 ch101_/main_a1_ 행은 기본적으로 건너뛴다(--update 일 때만 핵심 필드 갱신). stages.rules 는 null 불가(cues 전체 삭제 방지) -> 객체만 허용하고 StageRulesMerge 로 병합.
 * heroes.json 영웅 code 와 겹치는 NPC 는 중단. 모든 쓰기는 하나의 트랜잭션, --dry-run 은 롤백.
 *
 * AGENTS.md 4절 절차(개발 DB 실제 실행 전 반드시):
 *  1) 백업: docker compose cp app:/var/www/dbdata/database.sqlite database\database.sqlite.bak-main-a1-<날짜시각>
 *  2) 영향 범위: stages 신규 5행(ch101_s1~s5), maps 신규 5행(main_a1_*), (--with-npc) heroes 신규 1행(npc_red_pen) / (--npc-all) 15행. 기존 행 변경 0(--update 도 ch101_/main_a1_/로스터 npc 행만).
 *  3) 롤백: 위 백업 파일로 database.sqlite 복원(docker compose cp 역방향), 또는 DELETE FROM stages WHERE code LIKE 'ch101\_%' ESCAPE '\'; DELETE FROM maps WHERE code LIKE 'main\_a1\_%' ESCAPE '\'; DELETE FROM heroes WHERE code IN (로스터 npc code) (battles 등 참조 행이 없을 때). 운영 DB 사용 금지.
 */
class GameSeedMain extends Command
{
    protected $signature = 'game:seed-main {--act=1 : 막 번호(1~4). ch10N_s1~s5 / main_aN_* / *_main_aN.json 을 다룬다} {--dry-run : 검증/계획만(트랜잭션 롤백)} {--update : 이미 있는 ch101_/main_a1_/로스터 npc 행의 핵심 필드도 갱신(기본은 신규 행만)} {--with-npc : npc_roster_main_a1.json 중 seed_phase=act1 행을 heroes(campaign_only)에 추가} {--npc-all : npc_roster_main_a1.json 전 행을 heroes(campaign_only)에 추가}';

    protected $description = '오리지널 메인 N막(--act, 기본 1) ch10N_s1~s5 스테이지·main_aN_* 맵(·NPC) 가산 적재(멱등)';

    private int $act = 1;

    /** 막 번호에서 파생: 스테이지 코드 정규식·챕터·맵 접두·파일 접미 */
    private function stageRe(): string
    {
        return '/^ch10'.$this->act.'_s[1-5]$/';
    }

    private function chapter(): int
    {
        return 100 + $this->act;
    }

    private function mapPrefix(): string
    {
        return 'main_a'.$this->act.'_';
    }

    private function f(string $kind): string
    {
        return $kind.'_main_a'.$this->act.'.json';
    }

    public function handle(GameData $data): int
    {
        foreach ([['stages', 'chapter'], ['stages', 'forced_heroes'], ['stages', 'triggers'], ['stages', 'rules'], ['maps', 'meta'], ['heroes', 'campaign_only']] as [$t, $c]) {
            if (! Schema::hasColumn($t, $c)) {
                $this->error("{$t}.{$c} 컬럼이 없습니다. 먼저 php artisan migrate 를 실행하세요.");

                return self::FAILURE;
            }
        }
        $dry = (bool) $this->option('dry-run');
        $this->act = (int) $this->option('act');
        if ($this->act < 1 || $this->act > 4) {
            $this->error('--act 는 1~4');

            return self::FAILURE;
        }
        $began = false;
        try {
            $stages = $this->json($this->f('stages'))['items'] ?? throw new \RuntimeException($this->f('stages').': items 없음');
            $mapsDoc = is_file(database_path('data/'.$this->f('maps'))) ? $this->json($this->f('maps')) : null;
            if ($mapsDoc === null) {
                $dry || throw new \RuntimeException('database/data/'.$this->f('maps').' 이 없습니다(맵디자이너 산출 대기). 실제 실행 불가.');
                $this->warn($this->f('maps').' 없음: 맵 적재·목표 칸 해석 검증을 건너뜁니다(--dry-run 한정).');
            }
            DB::beginTransaction();
            $began = true;
            $this->option('with-npc') || $this->option('npc-all') ? $this->seedNpcs() : null;
            \App\Support\ScaleUpMaps::ensureFor(array_column($stages, 'map'));   // su_ 확장 맵(스테이지 map 교체분)
            $mapIds = $mapsDoc !== null ? $this->seedMaps($mapsDoc, $data) : [];
            $this->seedStages($stages, $mapIds, $mapsDoc !== null, $data);
            if ($dry) {
                DB::rollBack();
                $this->info('dry-run: DB 변경 없음(롤백)');
            } else {
                DB::commit();
                $this->info('seed-main 완료');
            }
        } catch (\Throwable $e) {
            $began && DB::rollBack();
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

    /** @return array<string,int> 맵 code => id (이번 파일의 맵) */
    private function seedMaps(array $doc, GameData $data): array
    {
        $checker = new MapChecker($data->rules());
        $now = now();
        $update = (bool) $this->option('update');
        $err = 0;
        $codes = [];
        foreach ($doc['items'] ?? [] as $m) {
            $code = (string) ($m['code'] ?? '');
            str_starts_with($code, $this->mapPrefix()) || throw new \RuntimeException("맵 코드 접두 위반(허용: ".$this->mapPrefix()."*): {$code}");
            isset($codes[$code]) && throw new \RuntimeException("맵 코드 중복: {$code}");
            $codes[$code] = true;
            foreach (['a', 'b'] as $s) {
                ! empty($m['deploy_zones'][$s]) || throw new \RuntimeException("{$code}: deploy_zones.{$s} 필수");
            }
            $w = strlen($m['tiles'][0]);
            $h = count($m['tiles']);
            $meta = $m['meta'] ?? [];
            ! empty($m['tile_layer']) && $meta['tile_layer'] = $m['tile_layer'];
            if (! empty($m['tile_layer']) && ! GameData::tileLayerFits($m['tile_layer'], [$w, $h])) {
                $this->error("[{$code}] tile_layer 크기 불일치");
                $err++;
            }
            $res = $checker->check(['code' => $code, 'width' => $w, 'height' => $h, 'tiles' => $m['tiles'], 'spawns' => $m['spawns'], 'deploy_zones' => $m['deploy_zones']]);
            foreach ($res as $r) {
                if ($r[1] === 'ERROR') {
                    $this->error("[{$code}] {$r[0]}: {$r[2]}");
                    $err++;
                } elseif ($r[1] === 'WARN') {
                    $this->warn("[{$code}] {$r[0]}: {$r[2]}");
                }
            }
            $row = ['name' => $m['name'], 'width' => $w, 'height' => $h, 'tiles' => json_encode($m['tiles']), 'spawns' => json_encode($m['spawns']),
                'deploy_zones' => json_encode($m['deploy_zones']), 'biome' => $m['biome'] ?? null, 'meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'updated_at' => $now];
            $q = DB::table('maps')->where('code', $code);
            if (! $q->exists()) {
                DB::table('maps')->insert(['code' => $code, 'created_at' => $now] + $row);
                $this->line("  map {$code} 신규 {$w}x{$h}");
            } elseif (\App\Support\MapRedesignGuard::isRedesigned($q->value('meta'))) {
                $this->warn("  map {$code} meta.redesign 개편 맵 -> 덮어쓰기 건너뜀(보호)");
            } elseif ($update) {
                $q->update($row);
                $this->line("  map {$code} 갱신 {$w}x{$h}");
            } else {
                $this->line("  map {$code} 이미 있음 -> 건너뜀(--update 로 갱신)");
            }
        }
        $err > 0 && throw new \RuntimeException("맵 검증 ERROR {$err}건");

        return DB::table('maps')->whereIn('code', array_keys($codes))->pluck('id', 'code')->map(fn ($v) => (int) $v)->all();
    }

    private function seedStages(array $items, array $mapIds, bool $haveMaps, GameData $data): void
    {
        $update = (bool) $this->option('update');
        $now = now();
        $types = array_keys($data->rules()->unitTypes);
        $heroes = DB::table('heroes')->pluck('id', 'code');
        $codes = array_column($items, 'code');
        count($codes) === count(array_unique($codes)) || throw new \RuntimeException('스테이지 code 중복');
        $fallbackPreset = (int) (DB::table('stages')->orderBy('id')->where('code', 'not like', 'ch%')->value('enemy_preset_id') ?: DB::table('presets')->orderBy('id')->value('id'));
        $ids = [];
        foreach ($items as $s) {
            $code = $s['code'];
            preg_match($this->stageRe(), $code) || throw new \RuntimeException("허용되지 않는 스테이지 코드(ch10{$this->act}_s1~s5만): {$code}");
            (int) $s['chapter'] === $this->chapter() || throw new \RuntimeException("{$code}: chapter 는 {$this->chapter()}");
            (is_array($s['rules'] ?? null) && ! empty($s['rules'])) || throw new \RuntimeException("{$code}: rules 는 비어 있지 않은 객체여야 합니다(null 금지: cues 삭제 방지)");
            $p = $s['prerequisite'] ?? null;
            ($p === null || in_array($p, $codes, true) || $this->prevActStageId($p) !== null) || throw new \RuntimeException("{$code}: prerequisite {$p} 는 입력 파일 안의 스테이지이거나 이미 적재된 직전 막(ch10".($this->act - 1)."_s*) 스테이지여야 합니다");
            $join = $s['join_hero'] ?? [];
            foreach ($join as $j) {
                isset($heroes[$j['hero_code'] ?? '']) || throw new \RuntimeException("{$code}: join_hero 영웅 ".($j['hero_code'] ?? '?').' 없음');
            }
            ($d = Cues::dropped($s['rules']['cues'] ?? null)) > 0 && $this->warn("  {$code}: cues {$d}건이 유효하지 않아 무시됨");
            (($d = \App\Game\StageRules::dropped($s['rules'])) > 0) && throw new \RuntimeException("{$code}: win_mode/win_conditions/lose_conditions 에 유효하지 않은 항목 {$d}건(docs/CUTSCENE_SPEC.md 10절)");   // 승리 조건이 조용히 버려지면 승리가 쉬워지므로 시드 단계에서 거부
            $refs = \App\Game\StageRules::references($s['rules']);   // win/lose 조건의 hero:<코드> 참조는 ally_npcs·forced_heroes·heroes 중 하나여야 한다(오타로 영구 승리불가 방지)
            $knownHeroes = array_merge(array_column($s['rules']['ally_npcs'] ?? [], 'hero'), array_map(fn ($f) => is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f, $s['forced_heroes'] ?? []));
            foreach ($refs['units'] as $ref) {
                ! str_starts_with($ref, 'hero:') || in_array(substr($ref, 5), $knownHeroes, true) || isset($heroes[substr($ref, 5)]) || throw new \RuntimeException("{$code}: win/lose 조건의 {$ref} 가 ally_npcs·forced_heroes·heroes 어디에도 없음");
            }
            foreach ($s['rules']['ally_npcs'] ?? [] as $an) {
                ! isset($an['route']) || \App\Game\RouteAi::normalize($an['route']) !== null || throw new \RuntimeException("{$code}: ally_npcs {$an['hero']} route 가 유효하지 않음(docs/CUTSCENE_SPEC.md 11절)");
            }
            $this->validateSquad($code, $s['enemy_squad'], $types);
            $subIds = array_column($s['rules']['sub_objectives'] ?? [], 'id');
            foreach ($s['star_conditions'] as $sc) {
                ($sc['type'] ?? '') !== 'sub_objective' || in_array($sc['id'] ?? null, $subIds, true) || throw new \RuntimeException("{$code}: star_conditions sub_objective '".($sc['id'] ?? '?')."' 가 rules.sub_objectives 에 없음");
            }
            foreach (array_values($s['forced_heroes'] ?? []) as $f) {
                $hc = is_array($f) ? ($f['hero'] ?? '') : $f;
                ($hc === '@protagonist' || isset($heroes[$hc])) || throw new \RuntimeException("{$code}: forced_heroes 영웅 {$hc} 없음");
            }
            $mapCode = (string) $s['map'];
            (str_starts_with($mapCode, $this->mapPrefix()) || str_starts_with($mapCode, 'su_')) || throw new \RuntimeException("{$code}: 맵 {$mapCode} 는 ".$this->mapPrefix().'* 여야 합니다(기존 맵 재사용 금지)');
            $mapId = null;
            if ($haveMaps) {
                $mapId = $mapIds[$mapCode] ?? DB::table('maps')->where('code', $mapCode)->value('id');
                $mapId !== null || throw new \RuntimeException("{$code}: 맵 {$mapCode} 가 맵 파일/DB 에 없습니다.");
                $meta = json_decode((string) DB::table('maps')->where('id', $mapId)->value('meta'), true) ?: [];
                Engine::resolveObjective($s['objective'], $meta) !== null || ($s['objective']['type'] === 'defeat_commander') || throw new \RuntimeException("{$code}: objective 해석 실패(맵 meta.objective_points 확인)");
                $spawnsB = json_decode((string) DB::table('maps')->where('id', $mapId)->value('spawns'), true)['b'] ?? [];
                foreach ($s['rules']['cues'] ?? [] as $cue) {   // cue 의 UNIT@x,y 는 그 맵 spawns.b 칸이어야 한다(런타임 폴백이 엉뚱한 유닛을 고르지 않게)
                    if (is_string($cue['unit'] ?? null) && preg_match('/^UNIT@(\d+),(\d+)$/', $cue['unit'], $mm)) {
                        in_array([(int) $mm[1], (int) $mm[2]], $spawnsB, true) || throw new \RuntimeException("{$code}: cue {$cue['unit']} 가 맵 {$mapCode} spawns.b 에 없음");
                    }
                }
                $mw = (int) DB::table('maps')->where('id', $mapId)->value('width');
                $mh = (int) DB::table('maps')->where('id', $mapId)->value('height');
                foreach ($refs['cells'] as [$cx, $cy]) {
                    ($cx < $mw && $cy < $mh) || throw new \RuntimeException("{$code}: win/lose 조건 칸 [{$cx},{$cy}] 가 맵 {$mapCode} ({$mw}x{$mh}) 밖");
                }
                foreach ($refs['rects'] as $rc) {
                    ($rc[2] < $mw && $rc[3] < $mh) || throw new \RuntimeException("{$code}: win/lose 조건 rect 가 맵 {$mapCode} ({$mw}x{$mh}) 밖");
                }
                foreach ($s['rules']['sub_objectives'] ?? [] as $so) {   // protect_tiles 칸은 맵 meta.protect_tiles 와 같아야 한다
                    ($so['type'] ?? '') !== 'protect_tiles' || ($so['tiles'] ?? null) == ($meta['protect_tiles'] ?? null) || throw new \RuntimeException("{$code}: sub_objective {$so['id']} tiles 가 맵 meta.protect_tiles 와 다름");
                }
            } else {
                $this->warn("  {$code}: 맵 파일 없음 -> objective/맵 연결 검증 생략");
                $mapId = (int) DB::table('maps')->orderBy('id')->value('id');   // dry-run 한정 자리표시(롤백됨)
            }
            $forced = $s['forced_heroes'] ?? [];
            ($pt = $s['rules']['protagonist_troop'] ?? null) === null || in_array($pt, $types, true) || throw new \RuntimeException("{$code}: rules.protagonist_troop '{$pt}' 는 알 수 없는 병종");
            $core = ['map_id' => $mapId, 'objective' => json_encode($s['objective']), 'forced_heroes' => json_encode($forced, JSON_UNESCAPED_UNICODE), 'triggers' => json_encode($s['triggers'] ?? [], JSON_UNESCAPED_UNICODE),
                'enemy_squad' => json_encode($s['enemy_squad'], JSON_UNESCAPED_UNICODE), 'enemy_extra_troops' => '[]', 'recommended_level' => (int) $s['recommended_level'],
                'enemy_level' => (int) $s['enemy_level'], 'enemy_level_offset' => (int) $s['enemy_level_offset'], 'chapter' => $this->chapter(), 'updated_at' => $now];
            $core['rules'] = \App\Support\StageRulesMerge::resolve($code, $s['rules'], $forced);
            $r = $s['reward'];
            $soft = ['name' => $s['name'], 'reward_exp' => (int) $r['exp'], 'reward_user_exp' => (int) $r['user_exp'], 'reward_gold' => (int) $r['gold'], 'difficulty' => (int) $s['difficulty'],
                'sort_order' => (int) $s['sort_order'], 'star_conditions' => json_encode(array_values($s['star_conditions']))];
            $q = DB::table('stages')->where('code', $code);
            if (! $q->exists()) {
                DB::table('stages')->insert($core + $soft + ['code' => $code, 'enemy_preset_id' => $fallbackPreset, 'join_hero' => json_encode(array_values($join), JSON_UNESCAPED_UNICODE), 'created_at' => $now]);
                $this->line("  {$code} 신규 -> {$mapCode}");
            } elseif ($update) {
                $q->update($core + $soft + ['join_hero' => json_encode(array_values($join), JSON_UNESCAPED_UNICODE)]);
                $this->line("  {$code} 갱신 -> {$mapCode}");
            } else {
                $this->line("  {$code} 이미 있음 -> 건너뜀(--update 로 갱신)");
            }
            $ids[$code] = (int) DB::table('stages')->where('code', $code)->value('id');
        }
        foreach ($items as $s) {   // 선행 체인: 신규(null)만 채움, --update 면 덮어씀. 대상은 ch101_ 행뿐
            $pre = $s['prerequisite'] ?? null;
            $q = DB::table('stages')->where('id', $ids[$s['code']]);
            $update || $q->whereNull('prerequisite_stage_id');
            $q->update(['prerequisite_stage_id' => $pre === null ? null : ($ids[$pre] ?? $this->prevActStageId($pre))]);
        }
    }

    /** 직전 막 스테이지(ch10{act-1}_sN)의 DB id. 해당 접두가 아니거나 없으면 null */
    private function prevActStageId(string $code): ?int
    {
        $tutorialTail = $this->act === 1 && $code === 'stage_06';   // 1막 s1 은 튜토리얼 마지막 stage_06 클리어로 해금
        if (! $tutorialTail && ($this->act < 2 || ! preg_match('/^ch10'.($this->act - 1).'_s[1-5]$/', $code))) {
            return null;
        }
        $id = DB::table('stages')->where('code', $code)->value('id');

        return $id === null ? null : (int) $id;
    }

    private function validateSquad(string $code, array $squad, array $types): void
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
        $total <= ArmyBuilder::enemyStageCap() || throw new \RuntimeException("{$code}: 적 유닛 {$total}기 > 적 편성 상한 ".ArmyBuilder::enemyStageCap());
    }

    /** npc_roster_main_a1.json -> heroes campaign_only 행(가산). 기존 행이 있으면 --update 일 때만 갱신(campaign_only 행 한정), heroes.json 영웅과 code 중복이면 중단 */
    private function seedNpcs(): void
    {
        $all = (bool) $this->option('npc-all');
        $update = (bool) $this->option('update');
        $now = now();
        $heroesJson = array_column($this->json('heroes.json')['items'], 'code');
        $types = DB::table('unit_types')->pluck('id', 'code');
        $ins = 0;
        $upd = 0;
        foreach ($this->json($this->f('npc_roster'))['items'] as $n) {
            if (! $all && ($n['seed_phase'] ?? '') !== 'act'.$this->act) {
                continue;
            }
            $code = $n['code'];
            str_starts_with($code, 'npc_') || throw new \RuntimeException("NPC code 접두 위반: {$code}");
            in_array($code, $heroesJson, true) && throw new \RuntimeException("NPC {$code}: heroes.json 영웅과 code 중복");
            isset($types[$n['unit_type']]) || throw new \RuntimeException("NPC {$code}: 알 수 없는 병종 {$n['unit_type']}");
            $row = ['name_ko' => $n['name_ko'], 'name_en' => $code, 'era' => $n['era'] ?? null, 'unit_type_id' => $types[$n['unit_type']], 'rarity' => $n['rarity'], 'cost' => (int) $n['cost'],
                'hp_bonus' => (int) $n['hp_bonus'], 'atk_bonus' => (int) $n['atk_bonus'], 'def_bonus' => (int) $n['def_bonus'],
                'growth_hp_pct' => $n['growth_hp_pct'], 'growth_atk_pct' => $n['growth_atk_pct'], 'growth_def_pct' => $n['growth_def_pct'],
                'skill_id' => null, 'aura_id' => null, 'culture' => null, 'troop_bonus' => 0, 'verify' => false,
                'note' => mb_substr('NPC(캠페인 전용) '.($n['faction'] ?? '').' / 근거 '.($n['evidence_level'] ?? '?').' / 메인 1막', 0, 250),
                'troop_type' => $n['unit_type'], 'campaign_only' => true, 'is_protagonist' => false, 'short_name' => ! empty($n['short_name']) && mb_strlen($n['short_name']) <= 32 ? $n['short_name'] : null];
            $q = DB::table('heroes')->where('code', $code);
            if (! $q->exists()) {
                DB::table('heroes')->insert(['code' => $code, 'created_at' => $now, 'updated_at' => $now] + $row);
                $ins++;
            } elseif ($update) {
                $q->where('campaign_only', true)->update($row + ['updated_at' => $now]);
                $upd++;
            }
        }
        $this->line("NPC heroes 신규 {$ins}, 갱신 {$upd}");
    }
}
