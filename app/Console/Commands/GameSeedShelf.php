<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\Cues;
use App\Game\EnemyV3Adapter;
use App\Game\Engine;
use App\Game\RouteAi;
use App\Game\StageRules;
use App\Services\GameData;
use App\Support\StageRulesMerge;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * (챕터당 stages_ch{N}_*.json 여러 개면 items 를 병합) 서가 챕터(ch19~ch99: 예 ch21 레그니차, ch22 파니파트; 챕터당 s1~s12, sort_order=챕터*100+N) 스테이지 적재(가산 전용, 개발 DB 전용 도구. 운영 DB 사용 금지).
 * game:seed-ch18 을 일반화: 챕터 번호는 --chapters 로 받고 코드 규칙은 ^ch{N}_s\d+$ (개수 고정 없음). 입력: stages_ch{N}_*.json 챕터당 정확히 1개(임밸런, EnemyV3Adapter 입력 + stages 행 필드).
 *  - 맵은 기존 맵(pk_* 등)을 재사용(없으면 중단). 증원 구역은 맵 meta.enemy_extra_zones 에 '<stage>_<id>' 로 병합(공유 맵의 다른 키 불변).
 *  - guest_heroes / recommended_party.named / excluded_heroes 는 엔진·스키마 미지원: 영웅 code 존재만 검증하고 저장하지 않음. rules.ally_npcs·cue spawn hero·forced_heroes 참조 영웅도 존재 검증.
 *  - --with-npc: npc_roster_shelf_ch21_22.json 의 npc_* 를 heroes(campaign_only)에 가산. heroes.json 영웅과 code 중복·접두 위반이면 중단. 기존 행은 --update 일 때만(campaign_only 행 한정) 갱신.
 * 기존 stages 행은 기본 건너뜀(--update 일 때만 갱신). --dry-run 은 전체 롤백. 어떤 검증이라도 실패하면 전체 롤백.
 */
class GameSeedShelf extends Command
{
    protected $signature = 'game:seed-shelf {--chapters=21,22 : 쉼표로 구분한 챕터 번호(11~999)} {--dry-run : 검증/계획만(트랜잭션 롤백)} {--update : 이미 있는 스테이지·NPC 행의 핵심 필드도 갱신(기본은 신규 행만)} {--with-npc : npc_roster_shelf_ch*.json 의 NPC 를 heroes(campaign_only)에 추가} {--with-ext : *_ext*.json(확장 스테이지·로스터)도 시드(기본 제외). 맵이 DB에 없는 확장 스테이지는 경고 후 건너뜀}';

    protected $description = '서가 챕터(기본 ch21·ch22) 스테이지(·NPC) 가산 적재(멱등)';

    public function handle(GameData $data): int
    {
        foreach ([['stages', 'chapter'], ['stages', 'forced_heroes'], ['stages', 'triggers'], ['stages', 'rules'], ['maps', 'meta'], ['heroes', 'campaign_only']] as [$t, $c]) {
            if (! Schema::hasColumn($t, $c)) {
                $this->error("{$t}.{$c} 컬럼이 없습니다. 먼저 php artisan migrate 를 실행하세요.");

                return self::FAILURE;
            }
        }
        $chapters = array_values(array_unique(array_map('intval', array_filter(explode(',', (string) $this->option('chapters')), 'strlen'))));
        if ($chapters === [] || array_filter($chapters, fn ($c) => $c < 11 || $c > 999)) {
            $this->error('--chapters 는 11~999 의 정수 목록이어야 합니다(ch1/ch18/ch10x 는 전용 명령).');

            return self::FAILURE;
        }
        $dry = (bool) $this->option('dry-run');
        $began = false;
        try {
            $docs = [];
            foreach ($chapters as $ch) {
                $files = array_map('basename', glob(database_path("data/stages_ch{$ch}_*.json")) ?: []);
                $withExt = (bool) $this->option('with-ext');
                $files = array_values(array_filter($files, fn ($f) => $withExt || ! str_contains($f, '_ext')));   // 확장 스테이지 파일(*_ext*.json)은 --with-ext 일 때만
                sort($files);
                $files !== [] || throw new \RuntimeException("stages_ch{$ch}_*.json 이 없습니다.");
                $docs[$ch] = [];
                foreach ($files as $f) {   // 챕터당 여러 파일이면 items 를 합친다(code 중복은 아래에서 중단)
                    $its = $this->json($f)['items'] ?? throw new \RuntimeException("{$f}: items 없음");
                    str_contains($f, '_ext') && $its = array_map(fn ($it) => $it + ['_ext' => true], $its);
                    array_push($docs[$ch], ...$its);
                }
            }
            $roster = $this->roster();
            DB::beginTransaction();
            $began = true;
            $this->option('with-npc') && $this->seedNpcs();
            foreach ($docs as $ch => $items) {
                $this->line("== ch{$ch} ==");
                $this->seedStages($ch, $items, $roster, $data);
            }
            if ($this->bcueErrors !== []) {
                throw new \RuntimeException("battle_cues 병합 불일치 ".count($this->bcueErrors)."건:
  - ".implode("
  - ", $this->bcueErrors));
            }
            if ($dry) {
                DB::rollBack();
                $this->info('dry-run: DB 변경 없음(롤백)');
            } else {
                DB::commit();
                $this->info('seed-shelf 완료');
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

    /** @return array<string,array> NPC code => 로스터 행(culture 조회용). 기본 + additions* + 서가 로스터 병합, 충돌은 먼저 읽힌 행 우선 */
    private function roster(): array
    {
        $out = [];
        $files = array_map('basename', glob(database_path('data/npc_roster_v3_additions*.json')) ?: []);
        sort($files);
        foreach (array_merge(['npc_roster_v3.json'], $files, $this->shelfRosterFiles()) as $f) {
            foreach ($this->json($f)['items'] ?? [] as $n) {
                $out[$n['code']] ??= $n;
            }
        }

        return $out;
    }

    /** @return list<string> */
    private function shelfRosterFiles(): array
    {
        $f = array_values(array_filter(array_map('basename', glob(database_path('data/npc_roster_shelf_*.json')) ?: []), fn ($n) => ! str_ends_with($n, '_stats.json') && ! str_ends_with($n, '_additions.json') && ($this->option('with-ext') || ! str_contains($n, '_ext'))));   // *_stats/_additions.json 은 임밸런 제안 문서라 로스터에서 제외(값은 roster 파일에 반영)
        sort($f);

        return $f;
    }

    /** @var list<string> battle_cues 병합 불일치 목록(시드 종료 전에 한꺼번에 오류로 출력) */
    private array $bcueErrors = [];

    /**
     * 챕터 대사 JSON(database/data/ch{N}_*.json)의 battle_cues.<stage_code> 를 stages rules.cues 에 병합한다(멱등: 같은 cue 는 한 번만).
     * on.when 안의 zone_ref 는 이 스테이지 맵 meta.tile_tags[zone_ref](없으면 meta.zone_refs[zone_ref]) 좌표(최대 60칸)로 치환하고 zone_ref 는 지운다. 태그가 없거나 엔진이 버릴 cue 는 임의 보정하지 않고 오류 목록에 담는다.
     */
    private function mergeBattleCues(int $ch, string $code, array $rules, array $tags, array $zoneRefs = []): array
    {
        $add = [];
        foreach (glob(database_path("data/ch{$ch}_*.json")) ?: [] as $f) {
            if (str_contains(basename($f), '.bak')) {
                continue;
            }
            $add = array_merge($add, (array) (json_decode((string) file_get_contents($f), true)['battle_cues'][$code] ?? []));
        }
        if ($add === []) {
            return $rules;
        }
        $resolve = function ($node) use (&$resolve, $tags, $zoneRefs, $code) {
            if (! is_array($node)) {
                return $node;
            }
            if (array_key_exists('zone_ref', $node)) {
                $ref = (string) $node['zone_ref'];
                $cells = $tags[$ref] ?? $zoneRefs[$ref] ?? null;   // tile_tags 우선, 없으면 meta.zone_refs
                if (! is_array($cells) || $cells === []) {
                    $this->bcueErrors[] = "{$code}: zone_ref '{$ref}' 가 맵 tile_tags/zone_refs 에 없음(있는 이름: ".implode(',', array_merge(array_keys($tags), array_keys($zoneRefs))).')';
                } else {
                    unset($node['zone_ref']);
                    $node['tiles'] = array_slice(array_values($cells), 0, 60);
                }
            }
            foreach ($node as $k => $v) {
                is_array($v) && $k !== 'tiles' && $node[$k] = $resolve($v);
            }

            return $node;
        };
        $add = array_map($resolve, $add);
        ($d = Cues::dropped($add)) > 0 && $this->bcueErrors[] = "{$code}: battle_cues {$d}건이 엔진 정규화에서 버려짐(on/when/필드 확인)";
        $cur = (array) ($rules['cues'] ?? []);
        $have = array_map('json_encode', $cur);
        $n = 0;
        foreach ($add as $c) {
            if (! in_array(json_encode($c), $have, true)) {
                $cur[] = $c;
                $n++;
            }
        }
        $rules['cues'] = $cur;
        $this->line("  {$code}: battle_cues ".count($add)."건 중 신규 병합 {$n}건");

        return $rules;
    }

    private function seedNpcs(): void
    {
        $update = (bool) $this->option('update');
        $now = now();
        $heroesJson = array_column($this->json('heroes.json')['items'], 'code');
        $types = DB::table('unit_types')->pluck('id', 'code');
        $skills = DB::table('skills')->pluck('id', 'code');
        $auras = DB::table('auras')->pluck('id', 'code');
        $cultures = array_keys($this->json('hero_cultures.json')['sets'] ?? []);
        $existingNonNpc = DB::table('heroes')->where('campaign_only', false)->pluck('code')->all();
        $seen = [];
        $ins = 0;
        $upd = 0;
        $skip = 0;
        $promoted = 0;
        foreach ($this->shelfRosterFiles() as $f) {
            foreach ($this->json($f)['items'] as $n) {
                $code = $n['code'];
                (str_starts_with($code, 'npc_') || ($n['role'] ?? null) === 'reward_hero') || throw new \RuntimeException("NPC code 접두 위반: {$code}");
                isset($seen[$code]) && throw new \RuntimeException("NPC {$code}: 서가 로스터 내 code 중복");
                $seen[$code] = true;
                if (! in_array($code, $heroesJson, true) && empty($n['playable']) && in_array($code, $existingNonNpc, true) && str_starts_with($code, 'npc_')) {   // 승격(campaign_only=0)된 npc_ 행: 로스터에 playable 표시가 없어도 중단하지 않고 건너뜀(DB 값 보존)
                    $promoted++;
                    continue;
                }
                (in_array($code, $heroesJson, true) || (empty($n['playable']) && in_array($code, $existingNonNpc, true))) && throw new \RuntimeException("NPC {$code}: 일반 영웅(heroes.json/비 campaign_only 행)과 code 중복");
                isset($types[$n['unit_type']]) || throw new \RuntimeException("NPC {$code}: 알 수 없는 병종 {$n['unit_type']}");
                ($n['skill'] === null || isset($skills[$n['skill']])) || throw new \RuntimeException("NPC {$code}: 스킬 {$n['skill']} 없음");
                ($n['aura'] === null || isset($auras[$n['aura']])) || throw new \RuntimeException("NPC {$code}: 오라 {$n['aura']} 없음");
                $cul = EnemyV3Adapter::CULTURE_MAP[$n['culture'] ?? ''] ?? null;
                ($cul === null || in_array($cul, $cultures, true)) || throw new \RuntimeException("NPC {$code}: 문화권 {$cul} 미등록");
                $row = ['name_ko' => $n['name_ko'], 'name_en' => $code, 'era' => $n['era'] ?? null, 'unit_type_id' => $types[$n['unit_type']], 'rarity' => $n['rarity'], 'cost' => (int) $n['cost'],
                    'hp_bonus' => (int) $n['hp_bonus'], 'atk_bonus' => (int) $n['atk_bonus'], 'def_bonus' => (int) $n['def_bonus'],
                    'growth_hp_pct' => $n['growth_hp_pct'], 'growth_atk_pct' => $n['growth_atk_pct'], 'growth_def_pct' => $n['growth_def_pct'],
                    'skill_id' => $n['skill'] ? $skills[$n['skill']] : null, 'aura_id' => $n['aura'] ? $auras[$n['aura']] : null, 'culture' => $cul, 'troop_bonus' => 0,
                    'verify' => ($n['evidence_level'] ?? '') === 'verify', 'note' => mb_substr('NPC(캠페인 전용) '.($n['faction'] ?? '').' / 근거 '.($n['evidence_level'] ?? '?'), 0, 250),
                    'troop_type' => $n['unit_type'], 'campaign_only' => empty($n['playable']), 'is_protagonist' => false,   // playable:true = 승격 NPC(일반 영웅처럼 소유·출전 가능)
                    'short_name' => ! empty($n['short_name']) && mb_strlen($n['short_name']) <= 32 ? $n['short_name'] : null];
                $q = DB::table('heroes')->where('code', $code);
                if (! $q->exists()) {
                    DB::table('heroes')->insert(['code' => $code, 'created_at' => $now, 'updated_at' => $now] + $row);
                    $ins++;
                } elseif ($update) {
                    (empty($n['playable']) ? $q->where('campaign_only', true) : $q)->update($row + ['updated_at' => $now]);
                    $upd++;
                } else {
                    $skip++;
                }
            }
        }
        $this->line("NPC heroes 신규 {$ins}, 갱신 {$upd}, 이미 있어 건너뜀 {$skip}, 승격 NPC 보존 {$promoted}");
    }

    private function seedStages(int $ch, array $items, array $roster, GameData $data): void
    {
        $update = (bool) $this->option('update');
        $now = now();
        $types = array_keys($data->rules()->unitTypes);
        $heroes = DB::table('heroes')->pluck('id', 'code');
        \App\Support\ScaleUpMaps::ensureFor(array_column($items, 'map'));
        $maps = DB::table('maps')->pluck('id', 'code');
        // 확장(_ext) 스테이지 중 맵이 DB에 없는 것(과 그 선행 체인 후속)은 경고 후 건너뛴다. 기존(비 ext) 스테이지는 기존대로 맵이 없으면 중단
        $skip = [];
        do {
            $changed = false;
            foreach ($items as $it) {
                if (! empty($it['_ext']) && ! isset($skip[$it['code']]) && (! isset($maps[$it['map'] ?? '']) || isset($skip[$it['prerequisite'] ?? '']))) {
                    $skip[$it['code']] = true;
                    $changed = true;
                    $this->warn("  {$it['code']}: 확장 스테이지 건너뜀(맵 {$it['map']} 미등록 또는 선행 건너뜀)");
                }
            }
        } while ($changed);
        $skip !== [] && $items = array_values(array_filter($items, fn ($it) => ! isset($skip[$it['code']])));
        $fallbackPreset = (int) (DB::table('stages')->orderBy('id')->where('code', 'not like', 'ch%')->value('enemy_preset_id') ?: DB::table('presets')->orderBy('id')->value('id'));
        $allowedStars = ['clear', 'all_alive', 'turn_within', 'commander_hp_pct_min', 'sub_objective'];
        $codes = array_column($items, 'code');
        $codes !== [] && count($codes) === count(array_unique($codes)) || throw new \RuntimeException("ch{$ch}: items 가 비었거나 code 중복");
        $ids = [];
        $created = [];
        foreach ($items as $s) {
            $code = $s['code'];
            preg_match('/^ch'.$ch.'_s([1-9]|1[0-2])$/', $code, $cm) || throw new \RuntimeException("허용되지 않는 스테이지 코드(ch{$ch}_s1~s12 만): {$code}");
            (int) $s['chapter'] === $ch || throw new \RuntimeException("{$code}: chapter 는 {$ch}");
            (int) $s['sort_order'] === $ch * 100 + (int) $cm[1] || throw new \RuntimeException("{$code}: sort_order 는 ".($ch * 100 + (int) $cm[1]).' (시간순 코드 규칙)');
            $mapId = (int) ($maps[$s['map']] ?? throw new \RuntimeException("{$code}: 맵 {$s['map']} 이(가) DB maps에 없습니다."));
            $p = $s['prerequisite'] ?? null;
            ($p === null || in_array($p, $codes, true) || preg_match('/^ch'.$ch.'_s([1-9]|1[0-2])$/', $p)) || throw new \RuntimeException("{$code}: 선행 {$p} 는 같은 챕터 ch{$ch}_s1~s12 이어야 합니다.");
            foreach ($s['star_conditions'] as $c) {
                in_array($c['type'] ?? null, $allowedStars, true) || throw new \RuntimeException("{$code}: 알 수 없는 star_conditions.type");
            }
            $rules = $s['rules'] ?? null;
            (is_array($rules) && $rules !== []) || throw new \RuntimeException("{$code}: rules 는 비어 있지 않은 객체여야 합니다(null 금지: cues 삭제 방지)");
            ($d = Cues::dropped($rules['cues'] ?? null)) > 0 && $this->warn("  {$code}: cues {$d}건이 유효하지 않아 무시됨");
            ($d = StageRules::dropped($rules)) > 0 && throw new \RuntimeException("{$code}: win/lose 조건에 유효하지 않은 항목 {$d}건");
            array_key_exists('optional', $s) && $rules['optional'] = ($s['optional'] === true) ? true : null;   // 선택 스테이지 표시(숨은 종장 해금 집합에서 제외). false=키 삭제
            Engine::sanitizeStageRules($rules);   // max_turns(5~60) 등 맵 규칙 값 검증(잘못되면 InvalidArgumentException -> 전체 롤백)
            $winRefs = StageRules::references($rules);
            foreach ($rules['ally_npcs'] ?? [] as $an) {
                ! isset($an['route']) || RouteAi::normalize($an['route']) !== null || throw new \RuntimeException("{$code}: ally_npcs {$an['hero']} route 무효");
            }
            $subIds = array_column($rules['sub_objectives'] ?? [], 'id');
            foreach ($s['star_conditions'] as $sc) {
                ($sc['type'] ?? '') !== 'sub_objective' || in_array($sc['id'] ?? null, $subIds, true) || throw new \RuntimeException("{$code}: star_conditions sub_objective '".($sc['id'] ?? '?')."' 가 rules.sub_objectives 에 없음");
            }
            $forced = $s['forced_heroes'] ?? [];
            foreach ($winRefs['units'] as $ref) {   // win/lose 조건의 hero:<코드> 참조는 ally_npcs·forced_heroes·heroes 중 하나(오타로 영구 승리불가 방지). ally_commander/enemy_commander 는 엔진 예약어
                ! str_starts_with($ref, 'hero:') || isset($heroes[substr($ref, 5)]) || throw new \RuntimeException("{$code}: win/lose 조건의 {$ref} 가 heroes 에 없음");
            }
            $npcOnField = array_flip(array_merge(array_column($rules['ally_npcs'] ?? [], 'hero'),   // ally_npc:<코드> 참조는 아군 NPC(ally_npcs 또는 side a/npc_ally spawn cue)여야 함(npc_X<->X 별칭 허용)
                array_column(array_filter($rules['cues'] ?? [], fn ($c) => ($c['do'] ?? '') === 'spawn' && ($c['side'] ?? 'a') === 'a' && ($c['npc_ally'] ?? true)), 'hero')));
            $npcNorm = fn (string $c) => preg_replace('/^npc_/', '', $c);
            $npcSet = array_flip(array_map($npcNorm, array_keys($npcOnField)));
            $npcRefs = $winRefs['units'];
            $cuesTmp = (array) ($rules['cues'] ?? []);
            array_walk_recursive($cuesTmp, function ($v, $k) use (&$npcRefs) {
                in_array($k, ['unit', 'a', 'b'], true) && is_string($v) && $npcRefs[] = $v;
            });
            foreach ($npcRefs as $ref) {
                ! str_starts_with((string) $ref, 'ally_npc:') || isset($npcSet[$npcNorm(substr($ref, 9))]) || throw new \RuntimeException("{$code}: {$ref} 가 ally_npcs/아군 spawn cue 에 없음(ally_npc: 는 아군 NPC 전용)");
            }
            $refs = array_merge(array_column($s['guest_heroes'] ?? [], 'hero_code'), $s['excluded_heroes'] ?? [], $s['recommended_party']['named'] ?? [],
                array_column($rules['ally_npcs'] ?? [], 'hero'), array_filter([$rules['enemy_commander']['hero'] ?? null]),
                array_filter(array_column($rules['cues'] ?? [], 'hero')), array_column($s['join_hero'] ?? [], 'hero_code'),
                array_map(fn ($f) => is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f, array_filter($forced, fn ($f) => $f !== '@protagonist')));
            foreach (array_unique($refs) as $hc) {
                isset($heroes[$hc]) || throw new \RuntimeException("{$code}: 영웅 {$hc} 이(가) heroes에 없습니다(--with-npc 로 NPC 시드 필요).");
            }
            $meta = json_decode((string) DB::table('maps')->where('id', $mapId)->value('meta'), true) ?: [];
            $rules = $this->mergeBattleCues($ch, $code, $rules, (array) ($meta['tile_tags'] ?? []), (array) ($meta['zone_refs'] ?? []));   // 대사 JSON battle_cues.<stage_code> -> rules.cues (zone_ref -> 맵 tile_tags 좌표)
            $this->checkSpeakersOnField($ch, $code, $rules, $s, $forced);   // 대사 화자(hero:*)는 필드 유닛(아군 NPC/강제/적/소환 cue)이어야 함: ch12 strict, 나머지 경고
            $mw = (int) DB::table('maps')->where('id', $mapId)->value('width');
            $mh = (int) DB::table('maps')->where('id', $mapId)->value('height');
            foreach ($winRefs['cells'] as [$cx, $cy]) {
                ($cx < $mw && $cy < $mh) || throw new \RuntimeException("{$code}: win/lose 조건 칸 [{$cx},{$cy}] 가 맵 {$s['map']} ({$mw}x{$mh}) 밖");
            }
            foreach ($winRefs['rects'] as $rc) {
                ($rc[2] < $mw && $rc[3] < $mh) || throw new \RuntimeException("{$code}: win/lose 조건 rect 가 맵 {$s['map']} ({$mw}x{$mh}) 밖");
            }
            foreach ($rules['ally_npcs'] ?? [] as $an) {
                ($an['x'] < $mw && $an['y'] < $mh) || throw new \RuntimeException("{$code}: ally_npcs {$an['hero']} 위치가 맵 밖");
                foreach ($an['route']['waypoints'] ?? [] as [$wx, $wy]) {
                    ($wx < $mw && $wy < $mh) || throw new \RuntimeException("{$code}: ally_npcs {$an['hero']} route 웨이포인트가 맵 밖");
                }
            }
            $conv = EnemyV3Adapter::convert($s, $roster, $s['culture'] ?? null);
            $squad = $conv['enemy_squad'];
            $trigRaw = $conv['triggers'];
            $zones = [];
            foreach ($conv['zones'] as $zn => $cells) {   // 공유 맵 보호: 스테이지 접두 이름으로 병합
                $zones["{$code}_{$zn}"] = $cells;
            }
            foreach ($trigRaw as $i => $t) {
                $trigRaw[$i]['zone'] = "{$code}_{$t['zone']}";
            }
            $this->validateSquad($code, $squad, $types, $conv['units_peak']);
            Engine::resolveObjective($s['objective'], $meta) !== null || $s['objective']['type'] === 'defeat_commander' || throw new \RuntimeException("{$code}: objective 해석 실패");
            $spawnsB = json_decode((string) DB::table('maps')->where('id', $mapId)->value('spawns'), true)['b'] ?? [];
            $enemyCells = array_map('json_encode', array_merge($spawnsB, $squad['cells'] ?? [], ...array_map(fn ($q) => $q['cells'] ?? [], $squad['squads'] ?? [])));
            foreach ($rules['cues'] ?? [] as $cue) {   // UNIT@x,y cue 대상이 초기 적 배치/맵 spawns.b 에 없으면 경고(증원 유닛이면 정상)
                if (is_string($cue['unit'] ?? null) && preg_match('/^UNIT@(\d+),(\d+)$/', $cue['unit'], $mm) && ! in_array(json_encode([(int) $mm[1], (int) $mm[2]]), $enemyCells, true)) {
                    $this->warn("  {$code}: cue {$cue['unit']} 칸에 초기 적 유닛/spawns.b 가 없음(런타임 폴백 확인 필요)");
                }
            }
            if ($zones) {
                $meta['enemy_extra_zones'] = array_merge($meta['enemy_extra_zones'] ?? [], $zones);
            }
            $trig = Engine::normalizeTriggers($trigRaw, $meta['enemy_extra_zones'] ?? [], 1, 3.0, $types);
            count($trig) === count($trigRaw) || throw new \RuntimeException("{$code}: triggers 일부가 무효(zone/turn/units 확인)");
            foreach ($conv['deferred'] as $d) {
                $this->warn("  {$code}: 엔진 미지원 트리거 {$d['id']} -> enemy_squad.deferred_triggers 로만 보존");
            }
            ! empty($s['excluded_heroes']) && $this->warn("  {$code}: excluded_heroes(".implode(',', $s['excluded_heroes']).') 는 엔진 미지원이라 저장하지 않음');
            $r = $s['reward_proposal'];
            $core = ['map_id' => $mapId, 'objective' => json_encode($s['objective']), 'forced_heroes' => json_encode($forced, JSON_UNESCAPED_UNICODE), 'triggers' => json_encode($trigRaw, JSON_UNESCAPED_UNICODE),
                'enemy_squad' => json_encode($squad, JSON_UNESCAPED_UNICODE), 'enemy_extra_troops' => '[]', 'recommended_level' => (int) $s['recommended_level'],
                'enemy_level' => (int) $s['enemy_level'], 'enemy_level_offset' => (int) $s['enemy_level_offset'], 'chapter' => $ch, 'updated_at' => $now,
                'rules' => StageRulesMerge::resolve($code, $rules, $forced)];
            $soft = ['name' => $s['name'], 'reward_exp' => (int) $r['exp'], 'reward_user_exp' => (int) $r['user_exp'], 'reward_gold' => (int) $r['gold'], 'difficulty' => (int) $s['difficulty'],
                'sort_order' => (int) $s['sort_order'], 'star_conditions' => json_encode(array_values($s['star_conditions']))];
            $join = json_encode(array_values($s['join_hero'] ?? []), JSON_UNESCAPED_UNICODE);
            $q = DB::table('stages')->where('code', $code);
            if (! $q->exists()) {
                $zones && DB::table('maps')->where('id', $mapId)->update(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
                DB::table('stages')->insert($core + $soft + ['code' => $code, 'enemy_preset_id' => $fallbackPreset, 'join_hero' => $join, 'created_at' => $now]);
                $created[$code] = true;
                $this->line("  {$code} 신규 -> {$s['map']}");
            } elseif ($update) {
                $zones && DB::table('maps')->where('id', $mapId)->update(['meta' => json_encode($meta, JSON_UNESCAPED_UNICODE), 'updated_at' => $now]);
                $q->update($core + $soft + ['join_hero' => $join]);
                $created[$code] = true;
                $this->line("  {$code} 갱신 -> {$s['map']}");
            } else {
                $this->line("  {$code} 이미 있음 -> 건너뜀(--update 로 갱신)");
            }
            $ids[$code] = (int) DB::table('stages')->where('code', $code)->value('id');
        }
        foreach ($items as $s) {   // 선행 체인: 입력 파일 안 → DB의 같은 챕터 행 순으로 해석. 아직 없는 선행(후속 시드 예정)은 null 로 두고 경고 → 나중 실행에서 비어 있는 선행만 채운다
            $p = $s['prerequisite'] ?? null;
            $pid = $p === null ? null : ($ids[$p] ?? DB::table('stages')->where('code', $p)->value('id'));
            $p !== null && $pid === null && $this->warn("  {$s['code']}: 선행 {$p} 가 아직 DB에 없어 선행 없음(null)으로 둠(해당 스테이지 적재 후 재실행하면 채움)");
            $q = DB::table('stages')->where('id', $ids[$s['code']]);
            if (isset($created[$s['code']])) {
                $q->update(['prerequisite_stage_id' => $pid === null ? null : (int) $pid]);
            } elseif ($pid !== null) {   // 건너뛴 기존 행: 비어 있을 때만 채움(어드민 수정값 보존)
                $q->whereNull('prerequisite_stage_id')->update(['prerequisite_stage_id' => (int) $pid]);
            }
        }
    }

    /** 화자 필드 존재 검사를 오류로 올리는 챕터(나머지는 경고만). 점차 확대 */
    private const STRICT_SPEAKER_CHAPTERS = [12];

    /**
     * rules.cues 의 say 화자 hero:<코드> 가 이 스테이지 필드(ally_npcs·forced_heroes·enemy_commander.hero·enemy_squad npc_ref·spawn cue hero)에 없으면
     * 경고(ch12 는 오류). npc_X 와 X 는 같은 인물로 본다. 예외는 database/data/dialogue_speaker_allowlist.json({global:[], stages:{code:[]}}).
     *
     * @param  array  $s  입력 item(enemy_squads 에서 npc 지휘관 ref 수집)
     */
    private function checkSpeakersOnField(int $ch, string $code, array $rules, array $s, array $forced): void
    {
        $field = array_merge(array_column($rules['ally_npcs'] ?? [], 'hero'), array_filter([$rules['enemy_commander']['hero'] ?? null]),
            array_filter(array_column(array_filter($rules['cues'] ?? [], fn ($c) => ($c['do'] ?? '') === 'spawn'), 'hero')),
            array_map(fn ($f) => is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f, $forced));
        foreach ($s['enemy_squads'] ?? [] as $q) {
            ($ref = $q['leader']['ref'] ?? null) && $field[] = $ref;
        }
        foreach ($s['triggers'] ?? [] as $t) {
            ($ref = $t['squad']['leader']['ref'] ?? null) && $field[] = $ref;
        }
        $norm = fn (string $c) => preg_replace('/^npc_/', '', $c);
        $onField = array_flip(array_map($norm, $field));
        $allow = $this->json('dialogue_speaker_allowlist.json');
        $allowed = array_flip(array_map($norm, array_merge($allow['global'] ?? [], $allow['stages'][$code] ?? [])));
        $missing = [];
        foreach ($rules['cues'] ?? [] as $c) {
            $sp = (string) ($c['speaker'] ?? '');
            if (($c['do'] ?? '') === 'say' && str_starts_with($sp, 'hero:') && ! isset($onField[$norm(substr($sp, 5))]) && ! isset($allowed[$norm(substr($sp, 5))])) {
                $missing[substr($sp, 5)] = true;
            }
        }
        if ($missing === []) {
            return;
        }
        $msg = "{$code}: 대사 화자가 필드 유닛(ally_npcs/forced/enemy/spawn cue)에 없음: ".implode(', ', array_keys($missing)).' (허용 목록: data/dialogue_speaker_allowlist.json)';
        in_array($ch, self::STRICT_SPEAKER_CHAPTERS, true) ? throw new \RuntimeException($msg) : $this->warn('  '.$msg);
    }

    private function validateSquad(string $code, array $squad, array $types, int $peak): void
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
        $peak <= (int) config('game.max_alive_per_side_stage') || throw new \RuntimeException("{$code}: 증원 포함 적 {$peak}기 > 생존 상한 ".(int) config('game.max_alive_per_side_stage'));
    }
}
