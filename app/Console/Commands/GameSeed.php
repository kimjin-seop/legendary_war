<?php

namespace App\Console\Commands;

use App\Game\Engine;
use App\Game\PassiveEffects;
use App\Support\Rarity;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * database/data/*.json -> 설정 테이블 멱등 적재.
 * 기본: 없는 행만 추가(어드민이 수정한 값 보존). --force: JSON 값으로 덮어쓰기.
 */
class GameSeed extends Command
{
    protected $signature = 'game:seed {--force : 기존 행을 JSON 값으로 덮어씀(어드민 수정값 소실)}';

    protected $description = '게임 설정 JSON을 DB에 멱등 적재';

    /** heroes = heroes.json + 신규 영웅 확장(hero_expansion_*.json, App\Support\HeroExpansion, 보류 목록 제외). heroes_base = heroes.json만(스킬 배정안 정합 검증용) */
    private function items(string $file): array
    {
        $base = $file === 'heroes_base';
        $path = database_path('data/'.($base ? 'heroes' : $file).'.json');
        $items = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR)['items'];
        if ($file === 'heroes') {
            $exp = \App\Support\HeroExpansion::heroRows();
            $dup = array_intersect(array_column($exp, 'code'), array_column($items, 'code'));
            $dup === [] || throw new \RuntimeException('hero_expansion: heroes.json과 code 중복: '.implode(',', $dup));
            $items = array_merge($items, $exp);
        }

        return $items;
    }

    /** 전장 프리셋 20종(maps_pack20.json) + 튜토리얼 개편 3맵(maps_tutorial_v2.json, stage_01~03 연결). 파일이 없으면 건너뜀. */
    private function packItems(): array
    {
        $out = [];
        foreach (['maps_pack20', 'maps_tutorial_v2'] as $f) {
            is_file(database_path('data/'.$f.'.json')) && $out = array_merge($out, $this->items($f));
        }

        return $out;
    }

    /** maps.meta JSON: meta + decor(맵 데이터에 있을 때만) */
    private function mapMeta(array $m): ?string
    {
        $meta = $m['meta'] ?? null;
        foreach (['decor', 'village_style'] as $k) {   // 장식 선택 필드는 meta에 함께 저장
            ! empty($m[$k]) && ($meta = ($meta ?? []) + [$k => $m[$k]]);
        }

        if (! empty($m['tile_layer'])) {   // 시각용 타일 인덱스: 맵 크기와 맞을 때만 저장(불일치는 경고 후 생략 -> 기존 meta.tile_layer도 갱신되며 upsert가 meta 전체를 덮어쓴다)
            if (\App\Services\GameData::tileLayerFits($m['tile_layer'], [strlen($m['tiles'][0]), count($m['tiles'])])) {
                $meta = ($meta ?? []) + ['tile_layer' => $m['tile_layer']];
            } else {
                $this->warn("[{$m['code']}] tile_layer 크기가 맵과 달라 저장하지 않습니다.");
            }
        }

        return $meta === null ? null : json_encode($meta, JSON_UNESCAPED_UNICODE);
    }

    /** 프리셋 맵 검증(MapChecker): 결과 출력, ERROR가 있으면 시드 실패(트랜잭션 롤백) */
    private function checkPackMaps(array $packItems): void
    {
        if ($packItems === [] || ! class_exists(\App\Game\MapChecker::class)) {
            return;
        }
        $checker = new \App\Game\MapChecker((new \App\Services\GameData)->rules());
        $err = $warn = 0;
        foreach ($packItems as $m) {
            $rows = $checker->check(['code' => $m['code'], 'width' => strlen($m['tiles'][0]), 'height' => count($m['tiles']), 'tiles' => $m['tiles'], 'spawns' => $m['spawns'], 'deploy_zones' => $m['deploy_zones']]);
            foreach ($rows as $r) {
                if ($r[1] === 'ERROR') {
                    $err++;
                    $this->error("[{$m['code']}] {$r[0]}: {$r[2]}");
                } elseif ($r[1] === 'WARN') {
                    $warn++;
                    $this->warn("[{$m['code']}] {$r[0]}: {$r[2]}");
                }
            }
        }
        $this->info(sprintf('전장 프리셋 %d종 검증: ERROR %d / WARN %d', count($packItems), $err, $warn));
        $err > 0 && throw new \RuntimeException("전장 프리셋 검증 오류 $err 건");
    }

    /** @param array<int,array> $rows */
    private function put(string $table, array $rows, array $unique, array $update): void
    {
        $now = now();
        $rows = array_map(fn ($r) => $r + ['created_at' => $now, 'updated_at' => $now], $rows);
        if ($this->option('force') && $table === 'maps') {   // 개편 맵(meta.redesign)은 되돌리지 않는다
            foreach (\App\Support\MapRedesignGuard::upsert($rows, array_merge($update, ['updated_at'])) as $c) {
                $this->warn("  maps {$c}: meta.redesign 개편 맵 -> 덮어쓰기 건너뜀(보호)");
            }
        } elseif ($this->option('force')) {
            DB::table($table)->upsert($rows, $unique, array_merge($update, ['updated_at']));
        } else {
            DB::table($table)->insertOrIgnore($rows);
        }
    }

    /** 타임스탬프 없는 곡선 테이블 */
    private function putPlain(string $table, array $rows, array $unique, array $update): void
    {
        $this->option('force') ? DB::table($table)->upsert($rows, $unique, $update) : DB::table($table)->insertOrIgnore($rows);
    }

    /**
     * skills 행 = skills.json(기본 필드) + skill_templates.json(migration_examples 메타, shared_supported_combo_table.passive 공유 스킬).
     * template/tags는 skill_templates.json의 templates/tag_list에 있어야 한다(없으면 시드 실패).
     *
     * @return array<int,array<string,mixed>>
     */
    private function skillRows(): array
    {
        $tpl = json_decode(file_get_contents(database_path('data/skill_templates.json')), true, 512, JSON_THROW_ON_ERROR);
        $templates = array_column($tpl['templates'], null, 'id');
        $tags = array_flip(array_column($tpl['tag_list'], 'tag'));
        $meta = array_column($tpl['migration_examples'], null, 'code');
        $row = function (array $s, array $m) use ($templates, $tags) {
            $t = $m['template'] ?? null;
            ($t === null || isset($templates[$t])) || throw new \RuntimeException("skill {$s['code']}: unknown template {$t}");
            foreach ($m['tags'] ?? [] as $g) {
                isset($tags[$g]) || throw new \RuntimeException("skill {$s['code']}: unknown tag {$g}");
            }

            return [
                'code' => $s['code'], 'name' => $s['name'], 'type' => $s['type'], 'params' => json_encode($s['params']), 'description' => $s['description'] ?? null,
                'template' => $t, 'tags' => json_encode($m['tags'] ?? []), 'evidence_level' => $m['evidence_level'] ?? null, 'source' => $m['source'] ?? null,
                'is_invented' => ! empty($m['is_invented']) ? 1 : 0, 'rarity_min' => $m['rarity_min'] ?? null, 'fx_key' => $m['fx_key'] ?? null,
                'flavor' => $m['flavor'] ?? null, 'enabled' => ($m['enabled'] ?? true) ? 1 : 0,
                'needs_verify' => ! empty($m['needs_verify']) ? 1 : 0, 'review_status' => $m['review_status'] ?? null,
            ];
        };
        $rows = [];
        foreach ($this->items('skills') as $s) {
            $rows[$s['code']] = $row($s, $meta[$s['code']] ?? []);
        }
        foreach ($tpl['shared_supported_combo_table']['passive'] ?? [] as $sh) {   // 공유 스킬 라이브러리(영웅 미연결, 후보)
            $t = $templates[$sh['template']] ?? throw new \RuntimeException("shared {$sh['code']}: unknown template");
            $rows[$sh['code']] ??= $row(
                ['code' => $sh['code'], 'name' => $t['name'].' ('.$sh['tier'].')', 'type' => 'passive', 'params' => $sh['params'], 'description' => '공유 스킬 시작값'],
                ['template' => $sh['template'], 'tags' => $t['tags'] ?? [], 'evidence_level' => 'invented', 'is_invented' => true, 'rarity_min' => $sh['rarity_min'] ?? null, 'flavor' => $t['name'].' '.$sh['tier'], 'enabled' => true],
            );
        }

        foreach ($this->assignmentData()['rows'] as $code => $r) {   // 송서사 배정안 스킬(공유 sh_* 포함)이 우선(같은 code면 덮어씀)
            $rows[$code] = $r;
        }

        return array_values($rows);
    }

    private ?array $assignmentCache = null;

    /**
     * hero_skill_assignments.json -> skills 행(code 기준) + 영웅별 연결 순서 + 영웅별 p1(대표 패시브).
     * enabled 정책: 엔진 지원 템플릿(PassiveEffects::SUPPORTED_TEMPLATES)만 1, 그 외(needs_engine_*, 템플릿 미정의, 액티브)와 pending_review는 0으로 보존.
     * params는 템플릿 tier 수치+args를 {tier, effects:[{...,when}]} 정규화 구조로 변환(조건부 템플릿은 when으로 변환되어 조건 무시 합산이 일어나지 않는다).
     *
     * @return array{rows:array<string,array>,links:array<string,array<int,string>>,p1:array<string,string>}
     */
    private function assignmentData(): array
    {
        if ($this->assignmentCache !== null) {
            return $this->assignmentCache;
        }
        $path = database_path('data/hero_skill_assignments.json');
        if (! is_file($path)) {
            return $this->assignmentCache = ['rows' => [], 'links' => [], 'p1' => []];
        }
        $a = json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR)['heroes'];
        $tpl = json_decode(file_get_contents(database_path('data/skill_templates.json')), true, 512, JSON_THROW_ON_ERROR);
        $templates = array_column($tpl['templates'], null, 'id');
        $rows = [];
        $links = [];
        $p1 = [];
        foreach ($a as $hero => $H) {
            $list = array_merge($H['skills'] ?? [], array_map(fn ($s) => $s + ['status' => 'pending_review'], $H['pending_review'] ?? []));   // 보류 항목은 마지막 순서
            foreach ($list as $s) {
                $t = $templates[$s['tpl']] ?? null;
                $pending = ($s['status'] ?? null) === 'pending_review';
                $supported = $t !== null && in_array($s['tpl'], PassiveEffects::SUPPORTED_TEMPLATES, true) && ($t['kind'] ?? null) === 'passive';
                $tier = $s['tier'] ?? null;
                $values = $t !== null && $tier !== null ? ($t['tiers'][$tier] ?? null) : null;
                ($t === null || $values !== null) || throw new \RuntimeException("assign {$s['code']}: unknown tier {$tier} of {$s['tpl']}");
                $params = $t === null ? [] : ['tier' => $tier, 'effects' => [$this->skillEffect($s['tpl'], $values, $s['args'] ?? [], $t)]];
                $row = [
                    'code' => $s['code'], 'name' => $s['name'], 'type' => $t['kind'] ?? 'passive', 'params' => json_encode($params, JSON_UNESCAPED_UNICODE), 'description' => null,
                    'template' => $s['tpl'], 'tags' => json_encode($t['tags'] ?? []), 'evidence_level' => $s['ev'] ?? null, 'source' => null,
                    'is_invented' => 1, 'rarity_min' => null, 'fx_key' => null, 'flavor' => $s['flavor'] ?? null,
                    'enabled' => $supported && ! $pending ? 1 : 0,
                    'needs_verify' => ! empty($s['hv']) ? 1 : 0, 'review_status' => $pending ? 'pending_review' : null,
                ];
                if (isset($rows[$s['code']]) && ($rows[$s['code']]['template'] !== $row['template'] || $rows[$s['code']]['params'] !== $row['params'])) {
                    throw new \RuntimeException("assign {$s['code']}: 같은 code가 서로 다른 정의로 중복됩니다.");
                }
                $rows[$s['code']] = $row;
                $links[$hero][] = $s['code'];
                if (! empty($s['p1'])) {
                    isset($p1[$hero]) && throw new \RuntimeException("assign {$hero}: p1이 둘 이상입니다.");
                    ($supported && ! $pending) || throw new \RuntimeException("assign {$hero}: p1 {$s['code']}는 엔진 지원 템플릿이어야 합니다.");
                    $p1[$hero] = $s['code'];
                }
            }
        }

        return $this->assignmentCache = ['rows' => $rows, 'links' => $links, 'p1' => $p1];
    }

    /**
     * 템플릿 tier 수치 -> 정규화 효과 1개. 조건은 when(PassiveEffects::WHEN_KEYS 의미)으로 변환한다.
     * 엔진 미지원 템플릿(PURSUIT/SIEGE_ATK/MOVE_UP/REGEN 등)도 의도를 보존해 저장하지만 enabled=0이며, 켜더라도 when 키가 미지원이면 무시(fail-closed)된다.
     */
    private function skillEffect(string $tpl, array $v, array $args, array $t): array
    {
        $v = array_diff_key($v, ['points' => 1, 'aura_points' => 1]);
        $num = fn (array $keys) => array_filter(array_intersect_key($v, array_flip($keys)), fn ($x) => $x > 0);
        $schema = $t['param_schema'] ?? [];

        return match ($tpl) {
            'T_ATK_UP', 'T_DEF_UP', 'T_ATKDEF_HYBRID', 'T_HEAL_UP' => $num(['atk_pct', 'def_pct', 'heal']),
            'T_TERRAIN_ATK' => $num(['atk_pct']) + ['when' => ['terrain' => $args['terrains'] ?? []]],
            'T_TERRAIN_DEF' => $num(['def_pct']) + ['when' => ['terrain' => $args['terrains'] ?? []]],
            'T_VS_TYPE_ATK' => $num(['atk_pct']) + ['when' => ['vs' => $args['vs'] ?? []]],
            'T_LAST_STAND' => $num(['atk_pct', 'def_pct']) + ['when' => ['hp_below_pct' => (int) ($v['hp_below_pct'] ?? $schema['hp_below_pct']['default'] ?? 50)]],
            'T_COUNTER_ATK' => $num(['atk_pct']) + ['when' => ['counter' => true]],
            'T_FIRST_STRIKE' => $num(['atk_pct']) + ['when' => ['target_full_hp' => true]],
            'T_CHARGE' => $num(['atk_pct']) + ['when' => ['moved' => true]],
            'T_FORMATION' => $num(['atk_pct', 'def_pct']) + ['when' => ['adjacent_allies' => (int) ($v['max_allies'] ?? $schema['max_allies']['default'] ?? 3)]],
            'T_PURSUIT' => $num(['atk_pct']) + ['when' => ['target_hp_below_pct' => (int) ($v['target_hp_below_pct'] ?? $schema['target_hp_below_pct']['default'] ?? 50)]],
            'T_SIEGE_ATK' => $num(['atk_pct']) + ['when' => ['target_terrain' => $args['target_terrains'] ?? []]],
            default => $num(array_keys($v)),   // T_MOVE_UP(move)/T_REGEN(regen_hp) 등: 엔진이 읽지 않는 키(normalize가 버림)
        };
    }

    /** heroes.json의 culture(문화권 세트 id). hero_cultures.json이 있으면 sets 키에 없는 값은 시드 실패. 없으면 null */
    /** hero_titles.json(titles: code -> {title, short_name?}) -> heroes.title/short_name 멱등 동기화. 파일이 없으면 건너뜀. DB에 없는 code는 무시. */
    private function syncHeroTitles(): void
    {
        \App\Support\HeroTitles::apply();   // v1(hero_titles.json) 위에 v2(hero_titles_v2_proposal.json) 덮어쓰기, 길이 32 초과는 시드 실패
    }

    /**
     * hero_troop_types.json(heroes: code -> {troop_type}) -> heroes.troop_type. 멱등: 값이 null인 영웅만 채움(--force면 JSON 기준 덮어쓰기).
     * 허용 병종(config game.hero_troop_types.allowed: sword|spear|cavalry|archer|naval, heavy 폐지) 밖의 값은 시드 실패. 컬럼/파일이 없으면 건너뜀.
     */
    private function syncHeroTroopTypes(): void
    {
        $path = config('game.hero_troop_types.path') ?: database_path('data/hero_troop_types.json');
        if (! is_file($path) || ! Schema::hasColumn('heroes', 'troop_type')) {
            return;
        }
        $allowed = (array) config('game.hero_troop_types.allowed');
        $map = (json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR)['heroes'] ?? []) + array_map(fn ($t) => ['troop_type' => $t], \App\Support\HeroExpansion::troopTypes());   // 확장 영웅은 부대 병종 = 영웅 병종
        foreach ($map as $code => $m) {
            in_array($m['troop_type'] ?? null, $allowed, true) || throw new \RuntimeException("hero_troop_types.json: {$code}의 troop_type이 허용 밖 값입니다.");
        }
        foreach ($map as $code => $m) {
            $q = DB::table('heroes')->where('code', $code);
            $this->option('force') || $q->whereNull('troop_type');
            $q->update(['troop_type' => $m['troop_type']]);
        }
    }

    private function culture(array $h): ?string
    {
        $c = $h['culture'] ?? null;
        if ($c === null) {
            return null;
        }
        $path = database_path('data/hero_cultures.json');
        if (is_file($path)) {
            $sets = json_decode(file_get_contents($path), true)['sets'] ?? [];
            ($sets === [] || isset($sets[$c])) || throw new \RuntimeException("hero {$h['code']}: unknown culture {$c}");
        }

        return (string) $c;
    }

    /** 특수유닛(variant) 정의·영웅 지정·스테이지 명시 지정 검증. 위반이면 DB 쓰기 전에 시드 실패 */
    private function validateVariants(): void
    {
        $vh = [];
        foreach ($this->items('heroes') as $h) {
            $vh[$h['code']] = ['code' => $h['code'], 'rarity' => Rarity::normalize($h['rarity']), 'unit_type' => $h['unit_type'], 'culture' => $h['culture'] ?? null];
        }
        $err = \App\Game\UnitVariants::validateHeroFile($vh);
        foreach (glob(database_path('data/stages*.json')) ?: [] as $f) {
            $doc = json_decode((string) file_get_contents($f), true);
            is_array($doc) && $err = array_merge($err, \App\Game\UnitVariants::validateStageDoc($doc, basename($f)));
        }
        $err === [] || throw new \RuntimeException('특수유닛 variant 검증 실패: '.implode(' / ', $err));
    }

    public function handle(): int
    {
        $this->validateVariants();   // DB 쓰기 전에 검증(실패 시 부분 적재 방지)
        DB::transaction(function () {
            $this->put('unit_types', array_map(fn ($u) => $u + ['cost' => (int) (config('game.troop_unit_cost')[$u['code']] ?? 1)], $this->items('unit_types')), ['code'], ['name', 'move', 'range_min', 'range_max', 'hp', 'atk', 'def', 'move_type', 'heal']);   // cost는 unit_types.json에 있으면 그 값, 없으면 config 시작값(force가 아니면 기존 행 보존)
            $types = DB::table('unit_types')->pluck('id', 'code');

            $this->put('matchup_rules', array_map(fn ($m) => [
                'attacker_unit_type_id' => $types[$m['attacker']], 'defender_unit_type_id' => $types[$m['defender']], 'multiplier' => $m['multiplier'],
            ], $this->items('matchups')), ['attacker_unit_type_id', 'defender_unit_type_id'], ['multiplier']);

            $terrains = $this->items('terrains');
            $this->put('terrains', array_map(fn ($t) => ['code' => $t['code'], 'name' => $t['name'], 'symbol' => $t['symbol'], 'elevation' => (int) ($t['elevation'] ?? 0), 'cover' => (int) ($t['cover'] ?? 0), 'heals' => (int) ($t['heals'] ?? 0), 'water' => (int) ($t['water'] ?? 0), 'boarding' => (int) ($t['boarding'] ?? 0), 'blocks_line_of_fire' => (int) ($t['blocks_line_of_fire'] ?? 0)], $terrains), ['code'], ['name', 'symbol', 'elevation', 'cover', 'heals', 'water', 'boarding', 'blocks_line_of_fire']);
            $tid = DB::table('terrains')->pluck('id', 'code');
            $mods = [];
            foreach ($terrains as $t) {
                foreach ($t['modifiers'] as $moveType => $m) {
                    $mods[] = ['terrain_id' => $tid[$t['code']], 'move_type' => $moveType, 'move_cost' => $m['cost'], 'def_pct' => $m['def_pct']];
                }
            }
            $this->put('terrain_modifiers', $mods, ['terrain_id', 'move_type'], ['move_cost', 'def_pct']);

            $skillRows = $this->skillRows();
            $flagCols = ['needs_verify', 'review_status'];
            $hasFlags = Schema::hasColumn('skills', 'needs_verify') && Schema::hasColumn('skills', 'review_status');
            if (! $hasFlags) {   // 마이그레이션(2026_11_01_000300) 미적용 DB: 검수 표식 컬럼 없이 적재(안전 폴백, 마이그레이션 후 재시드하면 표식 반영)
                $skillRows = array_map(fn ($r) => array_diff_key($r, array_flip($flagCols)), $skillRows);
                $this->warn('skills.needs_verify/review_status 컬럼 없음: 검수 표식 없이 적재합니다(php artisan migrate 후 game:seed 재실행 필요).');
            }
            $this->put('skills', $skillRows, ['code'], array_merge(['name', 'type', 'params', 'description', 'template', 'tags', 'evidence_level', 'source', 'is_invented', 'rarity_min', 'fx_key', 'flavor', 'enabled'], $hasFlags ? $flagCols : []));
            foreach ($hasFlags ? $this->assignmentData()['rows'] : [] as $r) {   // 검수 표식(hv/pending)은 어드민 수정 대상이 아니므로 비-force에서도 JSON 기준으로 동기화
                DB::table('skills')->where('code', $r['code'])->update(['needs_verify' => $r['needs_verify'], 'review_status' => $r['review_status']]);
            }
            // 메타 컬럼 보충: 기존 행(마이그레이션 직후 등)에서 template이 비어 있는 행만 채움(어드민 수정값은 건드리지 않음)
            foreach ($skillRows as $r) {
                $meta = array_diff_key($r, array_flip(['code', 'name', 'type', 'params', 'description']));
                $r['template'] !== null && DB::table('skills')->where('code', $r['code'])->whereNull('template')->update($meta + ['updated_at' => now()]);
            }
            $this->put('auras', $this->items('auras'), ['code'], ['name', 'radius', 'atk_pct', 'def_pct']);
            $skills = DB::table('skills')->pluck('id', 'code');
            $auras = DB::table('auras')->pluck('id', 'code');

            $baseStats = array_column($this->items('unit_types'), null, 'code');   // 음수 보너스 허용(병종 v2 D5 heavy 이관 보정)하되 병종 기본값+보너스는 양수여야 한다
            foreach ($this->items('heroes') as $h) {
                $u = $baseStats[$h['unit_type']] ?? null;
                if ($u && ($u['hp'] + $h['hp_bonus'] <= 0 || $u['atk'] + $h['atk_bonus'] <= 0 || $u['def'] + $h['def_bonus'] < 0)) {
                    throw new \RuntimeException("heroes.json:{$h['code']}의 병종 기본값+보너스가 0 이하입니다(음수 보너스 한계).");
                }
            }
            $this->put('heroes', array_map(function ($h) use ($types, $skills, $auras) {
                return [
                    'code' => $h['code'], 'name_ko' => $h['name_ko'], 'name_en' => $h['name_en'], 'born' => $h['born'], 'died' => $h['died'],
                    'era' => $h['era'], 'region' => $h['region'], 'unit_type_id' => $types[$h['unit_type']], 'rarity' => Rarity::normalize($h['rarity']), 'cost' => $h['cost'],
                    'hp_bonus' => $h['hp_bonus'], 'atk_bonus' => $h['atk_bonus'], 'def_bonus' => $h['def_bonus'],
                    'growth_hp_pct' => $h['growth_hp_pct'], 'growth_atk_pct' => $h['growth_atk_pct'], 'growth_def_pct' => $h['growth_def_pct'],
                    'skill_id' => $skills[$h['skill']] ?? null, 'aura_id' => $auras[$h['aura']] ?? null, 'culture' => $this->culture($h), 'troop_bonus' => max(0, min(4, (int) ($h['troop_bonus'] ?? 0))),
                    'verify' => $h['verify'] ? 1 : 0, 'note' => $h['note'] ?: null,
                ];
            }, $this->items('heroes')), ['code'], ['name_ko', 'name_en', 'born', 'died', 'era', 'region', 'unit_type_id', 'rarity', 'cost', 'hp_bonus', 'atk_bonus', 'def_bonus', 'growth_hp_pct', 'growth_atk_pct', 'growth_def_pct', 'skill_id', 'aura_id', 'culture', 'troop_bonus', 'verify', 'note']);
            // culture 보충: 기존 행에서 비어 있는 경우에만 채움(--force 없이도 마이그레이션 직후 반영, 수정값 보존)
            foreach ($this->items('heroes') as $h) {
                ($c = $this->culture($h)) !== null && DB::table('heroes')->where('code', $h['code'])->whereNull('culture')->update(['culture' => $c]);
            }
            $this->syncHeroTitles();
            $this->syncHeroTroopTypes();
            $heroes = DB::table('heroes')->pluck('id', 'code');
            // 영웅당 복수 스킬: 대표 skill(+ heroes.json의 선택 필드 skills[])을 hero_skills에 적재(대표=sort_order 0).
            // 비-force: 연결 행이 하나도 없는 영웅에게만 적재(기존 연결 보존, passive 중복 합산 방지). --force: JSON과 동기화(JSON에 없는 연결 삭제).
            // hero_skills는 어드민 편집 대상이 아니다(AdminController config 엔티티에 없음) -> 보존할 수정 행 없음.
            $links = [];
            $synced = [];
            $hasLinks = DB::table('hero_skills')->distinct()->pluck('hero_id')->flip();
            $assign = $this->assignmentData();
            ($assign['links'] === [] || array_diff(array_keys($assign['links']), array_column($this->items('heroes_base'), 'code')) === [])
                || throw new \RuntimeException('hero_skill_assignments.json에 heroes.json에 없는 영웅이 있습니다.');
            // 스킬 등급 재분배(game:seed-skill-grades)를 적용한 DB는 app_settings.skill_grades 표식이 있다 -> 그 영웅들의 연결은 옛 배정안으로 되돌리지 않는다(--force 포함)
            $gradeMarked = Schema::hasTable('app_settings') ? json_decode((string) DB::table('app_settings')->where('key', 'skill_grades')->value('value'), true) : null;
            $gradeHeroes = array_flip((array) ($gradeMarked['heroes'] ?? []));
            foreach ($this->items('heroes') as $h) {
                if (isset($gradeHeroes[$h['code']])) {
                    continue;
                }
                $hid = $heroes[$h['code']];
                // 배정안(hero_skill_assignments.json)이 있는 영웅은 배정안이 연결의 기준이다(hero_skills는 어드민 편집 대상이 아니므로 비-force에서도 동기화 -> 옛 대표 스킬과 합산 중복 방지).
                // 배정안에 없는 영웅은 기존 규칙(대표 skill + skills[], 비-force는 연결 없는 영웅만).
                $authoritative = isset($assign['links'][$h['code']]);
                $codes = $authoritative ? $assign['links'][$h['code']] : array_values(array_unique(array_filter(array_merge([$h['skill'] ?? null], $h['skills'] ?? []))));
                if (! $authoritative && ! $this->option('force') && isset($hasLinks[$hid])) {
                    continue;
                }
                $synced[$hid] = [];
                foreach ($codes as $i => $sc) {
                    isset($skills[$sc]) || throw new \RuntimeException("hero {$h['code']}: unknown skill {$sc}");
                    $links[] = ['hero_id' => $hid, 'skill_id' => $skills[$sc], 'sort_order' => $i];
                    $synced[$hid][] = $skills[$sc];
                }
            }
            $keepActive = DB::table('skills')->whereIn('code', \App\Support\ActiveSkillAssignments::codes())->pluck('id')->all();   // game:seed-active-skills 연결은 동기화 삭제 대상에서 제외
            foreach ($synced as $hid => $sids) {
                DB::table('hero_skills')->where('hero_id', $hid)->whereNotIn('skill_id', array_merge($sids, $keepActive))->delete();
            }
            $links && $this->put('hero_skills', $links, ['hero_id', 'skill_id'], ['sort_order']);
            if ($assign['links'] !== []) {   // 정합 검증: 배정안 영웅 수 == heroes.json 영웅 수, 영웅당 p1 정확히 1개
                $heroCodes = array_column($this->items('heroes_base'), 'code');   // 배정안은 heroes.json 기준(확장 영웅은 passive_skill 단일 연결)
                (count($assign['links']) === count($heroCodes) && array_diff($heroCodes, array_keys($assign['p1'])) === [])
                    || throw new \RuntimeException(sprintf('스킬 배정 불일치: 영웅 %d명 / 배정 %d명 / p1 %d개', count($heroCodes), count($assign['links']), count($assign['p1'])));
            }

            $hasMeta = Schema::hasColumn('maps', 'meta');   // 마이그레이션 전에도 시드가 깨지지 않게 폴백
            $packItems = $this->packItems();
            $this->put('maps', array_map(fn ($m) => [
                'code' => $m['code'], 'name' => $m['name'], 'width' => strlen($m['tiles'][0]), 'height' => count($m['tiles']),
                'tiles' => json_encode($m['tiles']), 'spawns' => json_encode($m['spawns']), 'deploy_zones' => json_encode($m['deploy_zones']),
                'biome' => $m['biome'] ?? null, 'rules' => ($mr = Engine::sanitizeMapRules($m['rules'] ?? null)) ? json_encode($mr) : null,   // 선택 필드, 허용 키만
            ] + ($hasMeta ? ['meta' => $this->mapMeta($m)] : []), array_merge($this->items('maps'), $packItems)),
                ['code'], array_merge(['name', 'width', 'height', 'tiles', 'spawns', 'deploy_zones', 'biome', 'rules'], $hasMeta ? ['meta'] : []));
            if ($hasMeta) {   // meta 보충(비어 있을 때만, 기존 행 보존)
                foreach ($packItems as $m) {
                    DB::table('maps')->where('code', $m['code'])->whereNull('meta')->update(['meta' => $this->mapMeta($m)]);
                }
                foreach (array_merge($this->items('maps'), $packItems) as $m) {   // tile_layer 보충: meta가 이미 있는 행(비-force 시드는 기존 행 보존)에도 tile_layer 키만 갱신(다른 meta 키·어드민 값 불변)
                    if (empty($m['tile_layer']) || ! \App\Services\GameData::tileLayerFits($m['tile_layer'], [strlen($m['tiles'][0]), count($m['tiles'])])) {
                        continue;
                    }
                    $row = DB::table('maps')->where('code', $m['code'])->first(['id', 'meta']);
                    if ($row) {
                        $meta = json_decode((string) $row->meta, true) ?: [];
                        if (empty($meta['redesign']) && ($meta['tile_layer'] ?? null) !== $m['tile_layer']) {   // 개편 맵은 tile_layer 도 보존
                            DB::table('maps')->where('id', $row->id)->update(['meta' => json_encode(['tile_layer' => $m['tile_layer']] + $meta, JSON_UNESCAPED_UNICODE)]);
                        }
                    }
                }
            }
            $this->checkPackMaps($packItems);
            foreach (array_merge($this->items('maps'), $packItems) as $m) {   // biome 보충(비어 있을 때만)
                isset($m['biome']) && DB::table('maps')->where('code', $m['code'])->whereNull('biome')->update(['biome' => $m['biome']]);
            }
            // rules 보충: 기존 맵 행에서 비어 있는 경우에만 채움(어드민 수정값 보존)
            foreach ($this->items('maps') as $m) {
                ($mr = Engine::sanitizeMapRules($m['rules'] ?? null)) && DB::table('maps')->where('code', $m['code'])->whereNull('rules')->update(['rules' => json_encode($mr)]);
            }
            $maps = DB::table('maps')->pluck('id', 'code');

            $this->put('presets', array_map(fn ($p) => [
                'code' => $p['code'], 'name' => $p['name'], 'hero_id' => $heroes[$p['hero']], 'units' => json_encode($p['units']),
            ], $this->items('presets')), ['code'], ['name', 'hero_id', 'units']);
            $presets = DB::table('presets')->pluck('id', 'code');

            $this->putPlain('hero_levels', $this->items('hero_levels'), ['level'], ['exp_to_next']);
            $this->putPlain('user_level_costs', $this->items('user_level_costs'), ['level'], ['exp_to_next', 'max_cost', 'party_slots']);

            $stages = $this->items('stages');
            $this->put('stages', array_map(fn ($s) => [
                'code' => $s['code'], 'name' => $s['name'], 'map_id' => $maps[$s['map']], 'enemy_preset_id' => $presets[$s['enemy_preset']],
                'recommended_level' => $s['recommended_level'], 'enemy_level' => $s['enemy_level'], 'reward_exp' => $s['reward_exp'],
                'reward_user_exp' => $s['reward_user_exp'], 'reward_gold' => $s['reward_gold'], 'difficulty' => $s['difficulty'], 'sort_order' => $s['sort_order'],
                'enemy_extra_troops' => json_encode($s['enemy_extra_troops'] ?? []), 'enemy_level_offset' => $s['enemy_level_offset'] ?? 0,
            ], $stages), ['code'], ['name', 'map_id', 'enemy_preset_id', 'recommended_level', 'enemy_level', 'reward_exp', 'reward_user_exp', 'reward_gold', 'difficulty', 'sort_order', 'enemy_extra_troops', 'enemy_level_offset']);
            foreach ($stages as $s) {   // 출전 강제(규칙 A: @protagonist 등): JSON에 forced_heroes 가 있을 때만(없으면 기존 값 유지)
                if (array_key_exists('forced_heroes', $s) && \Illuminate\Support\Facades\Schema::hasColumn('stages', 'forced_heroes')) {
                    DB::table('stages')->where('code', $s['code'])->update(['forced_heroes' => json_encode($s['forced_heroes'], JSON_UNESCAPED_UNICODE)]);
                }
            }
            foreach ($stages as $s) {   // 스테이지 단위 rules 오버라이드(JSON에 rules가 있을 때만, 컬럼 있을 때만). 검증 실패 시 예외
                if (array_key_exists('rules', $s) && \Illuminate\Support\Facades\Schema::hasColumn('stages', 'rules')) {
                    Engine::sanitizeStageRules($s['rules']);   // 검증(ally_npcs·factions·enemy_commander·cues 는 맵 규칙 검증 제외). 반영은 병합 규칙: 키 없음=유지 / null=지움 / 객체=병합
                    DB::table('stages')->where('code', $s['code'])->update(['rules' => \App\Support\StageRulesMerge::resolve($s['code'], $s['rules'], array_key_exists('forced_heroes', $s) ? (array) $s['forced_heroes'] : null)]);
                }
            }
            $sid = DB::table('stages')->pluck('id', 'code');
            foreach ($stages as $s) {
                if ($s['prerequisite'] !== null) {
                    DB::table('stages')->where('id', $sid[$s['code']])->whereNull('prerequisite_stage_id')->update(['prerequisite_stage_id' => $sid[$s['prerequisite']]]);
                }
            }
        });

        foreach (['unit_types', 'matchup_rules', 'terrains', 'terrain_modifiers', 'skills', 'hero_skills', 'auras', 'heroes', 'maps', 'presets', 'hero_levels', 'user_level_costs', 'stages'] as $t) {
            $this->line(sprintf('%-18s %d', $t, DB::table($t)->count()));
        }
        $a = $this->assignmentData();
        if ($a['links'] !== [] && Schema::hasColumn('skills', 'review_status')) {
            $codes = array_keys($a['rows']);
            $st = DB::table('skills')->whereIn('code', $codes)->selectRaw("sum(enabled=1) as on_n, sum(enabled=0 and review_status is null) as off_n, sum(review_status='pending_review') as pend_n, sum(needs_verify=1) as hv_n, count(*) as n")->first();
            $this->info(sprintf('스킬 배정: 영웅 %d명 / p1 %d개 / 스킬 %d종(활성 %d, 비활성 %d, 보류 %d) / hv(flavor 숨김) %d', count($a['links']), count($a['p1']), $st->n, $st->on_n, $st->off_n, $st->pend_n, $st->hv_n));
            $byTpl = DB::table('skills')->whereIn('code', $codes)->selectRaw('template, sum(enabled=1) as on_n, count(*) as n')->groupBy('template')->orderBy('template')->get();
            foreach ($byTpl as $r) {
                $this->line(sprintf('  %-16s 활성 %3d / 전체 %3d', $r->template, $r->on_n, $r->n));
            }
        }
        $this->seedEquipment();
        $this->seedExchange();
        $pool = app(\App\Services\GachaService::class)->pool();   // gacha_pool.json 검증(확률 합 100·영웅 코드·등급별 풀). DB 적재 없음(런타임에 JSON 직접 읽음)
        $this->info('gacha_pool 검증 OK (v'.$pool['version'].', 풀 '.array_sum(array_map('count', $pool['by_rarity'])).'명)');
        $this->info($this->option('force') ? 'seed 완료 (--force 덮어쓰기)' : 'seed 완료 (기존 행 보존)');

        return self::SUCCESS;
    }

    /** exchange_products.json -> 교환소 기본 상품 멱등 적재(code 기준, --force 면 덮어쓰기). 장비 코드·payload 는 검증하고 테이블/파일 없으면 건너뜀 */
    private function seedExchange(): void
    {
        if (! Schema::hasTable('exchange_products') || ! is_file(database_path('data/exchange_products.json'))) {
            return;
        }
        $hasCur = Schema::hasColumn('exchange_products', 'price_currency');
        $rows = [];
        foreach ($this->items('exchange_products') as $e) {
            \App\Services\ExchangeService::validatePayload($e['kind'], $e['payload']);
            $rows[] = ['code' => $e['code'], 'name_ko' => $e['name_ko'], 'description' => $e['description'] ?? null, 'kind' => $e['kind'], 'payload' => json_encode($e['payload']),
                'price_gold' => (int) $e['price_gold'], 'daily_limit' => (int) $e['daily_limit'], 'enabled' => (int) ($e['enabled'] ?? true), 'sort_order' => (int) ($e['sort_order'] ?? 0)];
            $hasCur && $rows[array_key_last($rows)]['price_currency'] = in_array($e['price_currency'] ?? 'gold', ['gold', 'pen'], true) ? ($e['price_currency'] ?? 'gold') : throw new \RuntimeException("exchange {$e['code']}: price_currency 는 gold|pen");
        }
        // --force 로 덮어써도 enabled 는 갱신하지 않는다(어드민이 끈 상품 보존). 신규 행만 파일의 enabled 로 들어간다
        $this->put('exchange_products', $rows, ['code'], array_merge(['name_ko', 'description', 'kind', 'payload', 'price_gold', 'daily_limit', 'sort_order'], $hasCur ? ['price_currency'] : []));
        $this->line(sprintf('%-18s %d', 'exchange_products', DB::table('exchange_products')->count()));
    }

    /** equipment_proposal.json(수치·가격, 임밸런) + equipment_text_proposal.json(이름·설명, 송서사)를 code로 합쳐 장비 정의를 멱등 적재. 테이블 없으면 건너뜀(마이그레이션 전 안전 폴백). */
    private function seedEquipment(): void
    {
        if (! Schema::hasTable('equipment_items')) {
            $this->warn('equipment_items 테이블 없음: 장비 적재를 건너뜁니다(php artisan migrate 후 game:seed 재실행 필요).');

            return;
        }
        $text = array_column($this->items('equipment_text_proposal'), null, 'code');
        $rows = [];
        foreach ($this->items('equipment_proposal') as $i => $e) {
            $t = $text[$e['code']] ?? throw new \RuntimeException("equipment {$e['code']}: 이름·설명(equipment_text_proposal.json) 없음");
            $rows[] = [
                'code' => $e['code'], 'slot' => $e['slot'], 'rarity' => $e['rarity'],
                'hp' => (int) $e['stats']['hp'], 'atk' => (int) $e['stats']['atk'], 'def' => (int) $e['stats']['def'],
                'req_level' => (int) $e['req_level'], 'price_gold' => (int) $e['price_gold'],
                'name_ko' => $t['name_ko'], 'description' => $t['description'] ?? null, 'culture' => $t['culture'] ?? null,
                'evidence_level' => $t['evidence_level'] ?? null, 'enabled' => 1, 'sort_order' => $i + 1,
            ];
        }
        // enabled는 어드민/운영 토글 보존을 위해 force에서도 갱신하지 않음
        $this->put('equipment_items', $rows, ['code'], ['slot', 'rarity', 'hp', 'atk', 'def', 'req_level', 'price_gold', 'name_ko', 'description', 'culture', 'evidence_level', 'sort_order']);
        $this->line(sprintf('%-18s %d', 'equipment_items', DB::table('equipment_items')->count()));
    }
}
