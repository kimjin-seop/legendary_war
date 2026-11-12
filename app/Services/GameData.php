<?php

namespace App\Services;

use App\Game\ActiveParams;
use App\Game\Engine;
use App\Game\MpRules;
use App\Game\PassiveEffects;
use App\Game\RuleSet;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/** DB(설정 테이블) -> 규칙 엔진 입력 배열 변환. 런타임 기준은 DB. 인스턴스 생존 중 캐시. */
class GameData
{
    private ?RuleSet $rules = null;

    private ?array $heroes = null;

    private ?array $skillRows = null;

    private ?array $terrainNames = null;

    private ?array $unitTypeNames = null;

    public function rules(): RuleSet
    {
        if ($this->rules) {
            return $this->rules;
        }
        $types = [];
        $byId = [];
        $retired = (array) config('game.retired_unit_types', []);   // 퇴역 병종 별칭(heavy => sword): DB 행은 남기되 규칙은 대체 병종 것을 쓴다
        foreach (DB::table('unit_types')->get() as $t) {
            $byId[$t->id] = $t->code;
            if (isset($retired[$t->code])) {
                continue;
            }
            $types[$t->code] = [
                'move' => (int) $t->move, 'range_min' => (int) $t->range_min, 'range_max' => (int) $t->range_max,
                'hp' => (int) $t->hp, 'atk' => (int) $t->atk, 'def' => (int) $t->def,
                'move_type' => $t->move_type, 'heal' => (int) $t->heal, 'name' => $t->name, 'cost' => (int) ($t->cost ?? 1),
            ];
        }
        $matchups = [];
        foreach (DB::table('matchup_rules')->get() as $m) {
            $att = $byId[$m->attacker_unit_type_id];
            $def = $byId[$m->defender_unit_type_id];
            if (isset($retired[$att]) || isset($retired[$def])) {
                continue;
            }
            $matchups[$att][$def] = (float) $m->multiplier;
        }
        foreach ($retired as $old => $new) {   // 별칭: 진행 중 전투 state의 퇴역 병종 유닛(type=heavy)이 대체 병종과 동일 수치·상성으로 동작
            if (! isset($types[$new])) {
                continue;
            }
            $types[$old] = $types[$new] + ['alias_of' => $new];
            foreach ($matchups as $a => $row) {
                isset($row[$new]) && $matchups[$a][$old] = $row[$new];
            }
            isset($matchups[$new]) && $matchups[$old] = $matchups[$new];
        }
        $tById = [];
        $symbols = [];
        $attrs = [];
        foreach (DB::table('terrains')->get() as $t) {
            $tById[$t->id] = $t->code;
            $symbols[$t->symbol] = $t->code;
            $attrs[$t->code] = ['elevation' => (int) ($t->elevation ?? 0), 'cover' => (int) ($t->cover ?? 0), 'heals' => (int) ($t->heals ?? 0), 'water' => (int) ($t->water ?? 0), 'boarding' => (int) ($t->boarding ?? 0), 'blocks_line_of_fire' => (int) ($t->blocks_line_of_fire ?? 0)];
        }
        $terrains = [];
        foreach (DB::table('terrain_modifiers')->get() as $m) {
            $terrains[$tById[$m->terrain_id]][$m->move_type] = [
                'cost' => $m->move_cost === null ? null : (int) $m->move_cost, 'def_pct' => (int) $m->def_pct,
            ];
        }

        return $this->rules = new RuleSet($types, $matchups, $terrains, $symbols, $attrs);
    }

    /** @return array<string,array> code => heroRow (+id,rarity) */
    public function heroes(): array
    {
        if ($this->heroes !== null) {
            return $this->heroes;
        }
        $rows = DB::table('heroes')
            ->join('unit_types', 'unit_types.id', '=', 'heroes.unit_type_id')
            ->leftJoin('auras', 'auras.id', '=', 'heroes.aura_id')
            ->leftJoin('skills', 'skills.id', '=', 'heroes.skill_id')
            ->select('heroes.*', 'unit_types.code as unit_type_code', 'auras.code as a_code', 'auras.name as a_name', 'auras.radius as a_radius', 'auras.atk_pct as a_atk', 'auras.def_pct as a_def', 'skills.type as s_type', 'skills.params as s_params', 'skills.enabled as s_enabled', 'skills.code as s_code', 'skills.name as s_name', 'skills.template as s_template')
            ->get();
        $multi = $this->heroSkillParams();
        $out = [];
        foreach ($rows as $h) {
            $out[$h->code] = $this->heroRow($h, $multi[(int) $h->id] ?? null) + ['actives' => $this->heroActives($h)];
        }

        return $this->heroes = $out;
    }

    public function heroById(int $id): ?array
    {
        foreach ($this->heroes() as $h) {
            if ($h['id'] === $id) {
                return $h;
            }
        }

        return null;
    }

    /** 표시용 이름: title이 있으면 `${title} ${short_name ?? name_ko}`, 없으면 name_ko. */
    public static function displayName(?string $title, ?string $shortName, string $nameKo): string
    {
        $base = ($shortName !== null && $shortName !== '') ? $shortName : $nameKo;

        return ($title !== null && $title !== '') ? $title.' '.$base : $nameKo;
    }

    /**
     * 전투 유닛 배열에 호칭 필드(title, short_name, display_name)를 뷰 계층에서 덧붙인다(state·Engine은 불변).
     * 영웅 유닛(hero 코드 있음)만 호칭 값, 부대 유닛은 title/short_name=null, display_name=name.
     *
     * @param  array<int,array>  $units
     * @return array<int,array>
     */
    public function withTitles(array $units): array
    {
        $heroes = $this->heroes();
        foreach ($units as $i => $u) {
            $h = isset($u['hero']) ? ($heroes[$u['hero']] ?? null) : null;
            $units[$i]['title'] = $h['title'] ?? null;
            $units[$i]['short_name'] = $h['short_name'] ?? null;
            $units[$i]['display_name'] = $h['display_name'] ?? ($u['name'] ?? null);
        }

        return $units;
    }

    private function heroRow(object $h, ?array $skillParams): array
    {
        $fold = $this->passive($h, $skillParams);

        return [
            'id' => (int) $h->id, 'code' => $h->code, 'name_ko' => $h->name_ko, 'title' => $h->title ?? null, 'short_name' => $h->short_name ?? null, 'display_name' => self::displayName($h->title ?? null, $h->short_name ?? null, $h->name_ko), 'rarity' => $h->rarity, 'cost' => (int) $h->cost,
            'unit_type' => $h->unit_type_code, 'culture' => $h->culture ?? null, 'troop_bonus' => (int) ($h->troop_bonus ?? 0),
            'campaign_only' => (bool) ($h->campaign_only ?? false) && (! empty($h->is_protagonist) || ! isset(\App\Support\GachaNamedNpc::readySet()[$h->code])), 'is_protagonist' => (bool) ($h->is_protagonist ?? false),   // 캠페인 전용(주인공 원형·NPC): 가챠/무작위 편성/시뮬 풀에서 제외
            'troop_type' => $this->fixedTroopType($h->troop_type ?? null),   // 영웅별 고정 부대 병종(null=미지정, 컬럼 없어도 null)
            'hp_bonus' => (int) $h->hp_bonus, 'atk_bonus' => (int) $h->atk_bonus, 'def_bonus' => (int) $h->def_bonus,
            'growth_hp_pct' => (float) $h->growth_hp_pct, 'growth_atk_pct' => (float) $h->growth_atk_pct, 'growth_def_pct' => (float) $h->growth_def_pct,
            'passive' => $fold['passive'],
            'passive_effects' => $fold['effects'],      // 효과 객체 배열(when 조건 보존)
            'passive_ignored' => $fold['ignored'],      // 미지원 조건(when)으로 무시된 효과
            'special' => $fold['special'],              // 특수 패시브(matchup_negate/move_discount): 유닛 `special`로 전달. 없으면 빈 배열
            'skills' => $fold['conditional'],           // 지원 조건(when) 효과의 압축 목록(영웅 유닛 skills로 전달, Engine::damageInfo가 평가)
            'aura' => $h->a_radius === null ? null : ['code' => $h->a_code, 'name' => $h->a_name, 'radius' => (int) $h->a_radius, 'atk_pct' => (int) $h->a_atk, 'def_pct' => (int) $h->a_def],
        ];
    }

    /**
     * hero_skills(영웅당 복수 스킬) -> hero_id => [skill code => params]. enabled=true인 passive 스킬만, sort_order 순.
     * 연결 행이 없는 영웅은 null(heroes.skill_id 단일 연결로 폴백).
     *
     * @return array<int,array<string,array>>
     */
    private function heroSkillParams(): array
    {
        $out = [];
        foreach ($this->heroSkillRows() as $r) {
            $out[(int) $r->hero_id] ??= [];
            if ($r->type === 'passive' && (int) $r->enabled === 1) {
                $out[(int) $r->hero_id][$r->code] = json_decode($r->params, true) ?: [];
            }
        }

        return $out;
    }

    /** hero_skills x skills 전체(영웅·sort_order 순). 인스턴스 생존 중 캐시(영웅 목록 응답에서 N+1 방지). */
    private function heroSkillRows(): array
    {
        if ($this->skillRows !== null) {   // 캐시 적중 시 스키마 조회(hasColumn = 쿼리 2개)를 반복하지 않는다
            return $this->skillRows;
        }
        // 마이그레이션(2026_11_01_000300) 적용 전 중간 상태에서도 500이 나지 않도록 신규 컬럼은 존재할 때만 조회(없으면 null 상수). 없을 땐 needs_verify를 알 수 없으므로 flavor를 안전하게 숨긴다.
        $has = Schema::hasColumn('skills', 'needs_verify') && Schema::hasColumn('skills', 'review_status');
        $flags = $has ? ['skills.needs_verify', 'skills.review_status'] : [DB::raw('1 as needs_verify'), DB::raw('null as review_status')];

        return $this->skillRows ??= DB::table('hero_skills')->join('skills', 'skills.id', '=', 'hero_skills.skill_id')
            ->orderBy('hero_skills.hero_id')->orderBy('hero_skills.sort_order')->orderBy('hero_skills.id')
            ->get(array_merge(['hero_skills.hero_id', 'skills.code', 'skills.name', 'skills.type', 'skills.params', 'skills.enabled', 'skills.template', 'skills.tags', 'skills.flavor'], $flags))->all();
    }

    /**
     * passive 효과 합산(키별 합). 복수 스킬/효과 배열 지원. `when` 조건 효과는 지원 조건이면 conditional(엔진이 문맥 평가), 미지원이면 보존만 하고 무시(로그).
     *
     * @return array{passive:?array,effects:array,ignored:array,conditional:array}
     */
    private function passive(object $h, ?array $skillParams): array
    {
        if ($skillParams === null) {   // hero_skills 연결 없음 -> heroes.skill_id 단일 스킬(호환)
            $skillParams = $h->s_type === 'passive' && (int) ($h->s_enabled ?? 1) === 1 ? [$h->code => json_decode($h->s_params, true) ?: []] : [];
        }
        $fold = PassiveEffects::fold($skillParams);
        foreach ($fold['ignored'] as $ig) {
            Log::notice('skill passive: 미지원 조건(when) 효과는 적용하지 않음', ['hero' => $h->code, 'skill' => $ig['skill'], 'when' => $ig['when']]);
        }

        return $fold;
    }

    /**
     * 영웅의 액티브 스킬 정의(enabled=1, pending_review 제외). hero_skills 연결의 active가 우선, 없으면 heroes.skill_id(대표 스킬)가 active일 때 사용.
     * 전투당 사용 횟수 uses = params.uses ?? config game.active_skill_uses.
     *
     * @return array<int,array{code:string,name:string,template:string,power_pct:int,cooldown:int,uses:int,mp_cost:int,params:array}>
     */
    private function heroActives(object $h): array
    {
        // 정의 = {code,name,template,power_pct,cooldown,uses,params}. params는 템플릿 스키마(ActiveParams)로 clamp·기본값 처리한 전체 값(엔진·뷰 공용).
        // 스키마가 있는 템플릿(STRIKE/AOE/BUFF/HEAL/SURGE)에서 필수값(BUFF stat) 불량이면 정의를 제외하고 경고한다. 스키마 없는 템플릿(DECOY 등)은 기존 방식(엔진이 skill_unsupported로 거부).
        $def = function (string $code, string $name, ?string $tpl, ?string $params): ?array {
            $p = json_decode((string) $params, true) ?: [];
            $uses = max(1, (int) config('game.active_skill_uses', 2));
            if ($tpl !== null && ActiveParams::has($tpl)) {
                $warn = [];
                $norm = ActiveParams::normalize($tpl, $p, $uses, $warn);
                if ($norm === null) {
                    Log::warning('active skill: 정의 무효로 제외', ['skill' => $code, 'template' => $tpl, 'reason' => $warn]);

                    return null;
                }
                $warn && Log::warning('active skill: params 보정', ['skill' => $code, 'template' => $tpl, 'detail' => $warn]);

                return ['code' => $code, 'name' => $name, 'template' => $tpl, 'power_pct' => (int) ($norm['power_pct'] ?? 0), 'cooldown' => (int) $norm['cooldown'], 'uses' => (int) $norm['uses'], 'mp_cost' => MpRules::cost($tpl, $norm), 'params' => $norm];
            }

            return ['code' => $code, 'name' => $name, 'template' => (string) $tpl, 'power_pct' => (int) ($p['power_pct'] ?? 100), 'cooldown' => max(0, (int) ($p['cooldown'] ?? 3)), 'uses' => max(1, (int) ($p['uses'] ?? $uses)), 'mp_cost' => MpRules::cost((string) $tpl, $p), 'params' => $p];
        };
        $out = [];
        foreach ($this->heroSkillRows() as $r) {
            if ((int) $r->hero_id === (int) $h->id && $r->type === 'active' && (int) $r->enabled === 1 && $r->review_status !== 'pending_review') {
                ($d = $def($r->code, $r->name, $r->template, $r->params)) !== null && $out[] = $d;
            }
        }
        if ($out === [] && ($h->s_type ?? null) === 'active' && (int) ($h->s_enabled ?? 0) === 1) {
            ($d = $def((string) $h->s_code, (string) $h->s_name, $h->s_template ?? null, $h->s_params)) !== null && $out[] = $d;
        }

        return $out;
    }

    /** 허용 5종 밖 값(수동 수정 등)은 null 취급 -> SquadPlanner 폴백 */
    private function fixedTroopType(?string $t): ?string
    {
        return ($t !== null && in_array($t, (array) config('game.hero_troop_types.allowed'), true)) ? $t : null;
    }

    /** 고정 부대 병종 표시명(unit_types.name, 예 "검병"). null이면 null */
    public function troopLabel(?string $t): ?string
    {
        return $t === null ? null : ($this->rules()->unitTypes[$t]['name'] ?? $t);
    }

    /** 영웅 상세 모달용(읽기 전용): 문화권, 병종, 오라(code/name/반경/효과), 레벨 1 능력치(병종 기본+보너스)와 성장률 */
    public function heroDetail(array $h): array
    {
        $t = $this->rules()->unitType($h['unit_type']);
        $effType = $h['troop_type'] ?? $h['unit_type'];   // 실제 부대 병종(미지정이면 영웅 병종)
        $tt = $this->rules()->unitTypes[$effType] ?? null;
        $mv = $tt !== null ? ['move' => (int) ($tt['move'] ?? 0), 'range_min' => (int) ($tt['range_min'] ?? 1), 'range_max' => (int) ($tt['range_max'] ?? 1), 'move_unit_type' => $effType, 'move_unit_label' => $this->troopLabel($effType)] : [];   // 이동 게이지용(기존 필드 불변, 키 추가만)
        $profile = $this->heroProfile((string) ($h['code'] ?? ''));

        return ($profile !== null ? ['profile' => $profile] : []) + [
            'culture' => $h['culture'] ?? null, 'unit_type' => $h['unit_type'], 'troop_type' => $h['troop_type'], 'troop_label' => $this->troopLabel($h['troop_type']), 'aura' => $h['aura'], 'skills' => $this->heroSkillList((int) $h['id']),
            'stats' => [
                'hp' => $t['hp'] + $h['hp_bonus'], 'atk' => $t['atk'] + $h['atk_bonus'], 'def' => $t['def'] + $h['def_bonus'],
                'hp_bonus' => $h['hp_bonus'], 'atk_bonus' => $h['atk_bonus'], 'def_bonus' => $h['def_bonus'],
                'mp_max' => \App\Game\MpRules::maxMp($h['rarity'] ?? null, 1, (string) $h['unit_type']),   // 마력(Lv1). 레벨당 +2(상한 160), 마법사·치유사 +20
                'growth_hp_pct' => $h['growth_hp_pct'], 'growth_atk_pct' => $h['growth_atk_pct'], 'growth_def_pct' => $h['growth_def_pct'],
            ] + $mv,
        ];
    }

    /** 역사 설명 원본(hero_history_part*.json의 items[]를 code 키로 병합). 파일 누락·깨짐 시 해당 part만 건너뜀(로그). 프로세스 내 캐시. */
    private static ?array $historyItems = null;

    private static function historyItems(): array
    {
        if (self::$historyItems !== null) {
            return self::$historyItems;
        }
        $out = [];
        for ($i = 1; $i <= 9; $i++) {
            $f = database_path("data/hero_history_part{$i}.json");
            if (! is_file($f)) {
                if ($i <= 4) {
                    Log::warning('hero_history: part 파일 없음', ['file' => basename($f)]);
                }

                continue;
            }
            try {
                $j = json_decode((string) file_get_contents($f), true, 512, JSON_THROW_ON_ERROR);
                foreach ((array) ($j['items'] ?? []) as $it) {
                    if (is_array($it) && ! empty($it['code'])) {
                        $out[$it['code']] = $it;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('hero_history: part 파일 읽기 실패(건너뜀)', ['file' => basename($f), 'error' => $e->getMessage()]);
            }
        }

        $extra = glob(database_path('data/hero_history_part_*.json')) ?: [];   // 이름 붙은 보조 part(예: part_npc1): code 로 매칭, 숫자 part·기존 항목은 덮어쓰지 않음
        sort($extra);
        foreach ($extra as $f) {
            try {
                $j = json_decode((string) file_get_contents($f), true, 512, JSON_THROW_ON_ERROR);
                foreach ((array) ($j['items'] ?? []) as $it) {
                    if (is_array($it) && ! empty($it['code'])) {
                        $out[$it['code']] ??= $it;
                    }
                }
            } catch (\Throwable $e) {
                Log::warning('hero_history: 보조 part 읽기 실패(건너뜀)', ['file' => basename($f), 'error' => $e->getMessage()]);
            }
        }

        foreach (\App\Support\HeroExpansion::history() as $code => $it) {   // 신규 영웅 확장(narrative.history). part 파일에 없는 code만
            $out[$code] ??= $it;
        }

        foreach (glob(database_path('data/hero_history_relations_*.json')) ?: [] as $f) {   // 인연 오버레이(wave3 등): 기존 항목의 relations 뒤에 덧붙임(같은 code+type 은 건너뜀). 항목이 없는 code 는 무시
            try {
                $j = json_decode((string) file_get_contents($f), true, 512, JSON_THROW_ON_ERROR);
                foreach ((array) ($j['relations'] ?? []) as $code => $rels) {
                    if (! isset($out[$code])) {
                        continue;
                    }
                    $cur = (array) ($out[$code]['relations'] ?? []);
                    foreach ((array) $rels as $r) {
                        $dup = array_filter($cur, fn ($x) => ($x['code'] ?? null) === ($r['code'] ?? null) && ($x['type'] ?? null) === ($r['type'] ?? null));
                        $dup || $cur[] = $r;
                    }
                    $out[$code]['relations'] = $cur;
                }
            } catch (\Throwable $e) {
                Log::warning('hero_history: 인연 오버레이 읽기 실패(건너뜀)', ['file' => basename($f), 'error' => $e->getMessage()]);
            }
        }

        return self::$historyItems = $out;
    }

    /** 영웅 상세용 역사 프로필. 데이터가 없거나 변환 실패 시 null(= profile 키 생략). */
    public function heroProfile(string $code): ?array
    {
        try {
            $all = self::historyItems();
            $it = $all[$code] ?? null;
            if ($it === null) {
                return null;
            }
            $lv = $it['evidence']['level'] ?? 'verify';
            $needs = ! empty($it['evidence']['verify_fields']);
            $rel = [];
            foreach ((array) ($it['relations'] ?? []) as $r) {
                $o = $all[$r['code'] ?? ''] ?? null;
                if ($o !== null) {
                    $rel[] = ['code' => $r['code'], 'name_ko' => $o['name_ko'] ?? $r['code'], 'type' => $r['type'] ?? null, 'note' => $r['note'] ?? null];
                }
            }

            return [
                'era' => $it['tags'][0] ?? null, 'region' => $it['tags'][1] ?? null, 'role' => $it['tags'][2] ?? null,
                'summary' => $it['summary'] ?? null,
                'evidence_level' => $lv === 'verify' ? 'verify' : 'accepted', 'needs_verify' => $needs,
                'one_line' => $it['one_line'] ?? null, 'life' => $it['life'] ?? null, 'battle_style' => $it['battle_style'] ?? null,
                'anecdote' => $it['anecdote'] ?? null, 'relations' => $rel, 'game_note' => $it['game_note'] ?? null,
            ];
        } catch (\Throwable $e) {
            Log::warning('hero_history: profile 생성 실패', ['hero' => $code, 'error' => $e->getMessage()]);

            return null;
        }
    }

    /**
     * 영웅 상세 API용 스킬 목록(읽기 전용). sort_order 순.
     * 항목: code, name, type, template, tags[], tier(weak|mid|strong|null), enabled(bool, false=준비 중/엔진 미지원),
     *       effect(효과 한 줄), condition(조건 요약, 무조건이면 null), flavor(설명문).
     * 규칙: needs_verify(hv) 스킬은 flavor를 내려주지 않는다(null, 중립 설명 effect/condition만). review_status=pending_review(근거 보류) 스킬은 목록에서 제외한다.
     *
     * @return array<int,array<string,mixed>>
     */
    public function heroSkillList(int $heroId): array
    {
        $out = [];
        foreach ($this->heroSkillRows() as $r) {
            if ((int) $r->hero_id !== $heroId || $r->review_status === 'pending_review') {
                continue;
            }
            $params = json_decode($r->params, true) ?: [];
            $hide = (int) $r->needs_verify === 1;
            $out[] = [
                'code' => $r->code, 'name' => $r->name, 'type' => $r->type, 'template' => $r->template, 'tags' => json_decode($r->tags ?? '[]', true) ?: [],
                'tier' => $params['tier'] ?? null, 'enabled' => (int) $r->enabled === 1,
                'effect' => $this->displayEffect((string) $r->type, (string) $r->template, $params), 'condition' => $this->describeCondition($params),
                'element' => $r->type === 'active' ? \App\Game\Elements::valid($params['element'] ?? null) : null,   // 속성 스킬(fire|thunder|water_ice|poison), 없으면 null
                'mp_cost' => $r->type === 'active' ? \App\Game\MpRules::cost((string) $r->template, $params) : null,   // MP 방식 소모량(params.mp_cost 우선, 없으면 템플릿 공식)
                'cooldown' => $r->type === 'active' && isset($params['cooldown']) ? (int) $params['cooldown'] : null,   // 액티브 표시용(쿨다운 턴·사용 횟수). 패시브는 null
                'uses' => $r->type === 'active' && isset($params['uses']) ? (int) $params['uses'] : null,
                'flavor' => $hide ? null : $r->flavor,
            ];
        }

        return $out;
    }

    /** 스킬 상세 표시용 효과 요약(액티브=템플릿별 params 요약, 패시브=효과 한 줄). 비면 FE 표에 '-'로 보이므로 game:audit-skills 가 빈 값을 위반으로 본다. */
    public function displayEffect(string $type, string $template, array $params): string
    {
        return $type === 'active' ? $this->describeActive($template, $params) : $this->describeEffects($params);
    }

    /** 액티브 효과 한 줄 설명(템플릿별 params 요약). 쿨다운·횟수는 별도 필드(cooldown/uses). 알 수 없는 템플릿은 빈 문자열(감사 game:audit-skills 가 잡는다). */
    public function describeActive(string $template, array $p): string
    {
        $i = fn (string $k, int $d = 0): int => (int) ($p[$k] ?? $d);
        $stat = ['atk' => '공격력', 'def' => '방어력', 'move' => '이동력'];

        $el = in_array($template, ['T_ACTIVE_STRIKE', 'T_ACTIVE_AOE', 'T_ACTIVE_PIERCE'], true) ? \App\Game\Elements::valid($p['element'] ?? null) : null;
        $pre = $el !== null ? '['.\App\Game\Elements::name($el).' 속성] ' : '';

        return $pre.match ($template) {
            'T_ACTIVE_STRIKE' => '대상 1명을 공격력 '.$i('power_pct', 100).'% 위력으로 강타',
            'T_ACTIVE_AOE' => '대상에게 위력 '.$i('power_pct', 100).'%, 반경 '.$i('radius', 1).'칸 주변에 '.$i('splash_pct', 60).'% 피해'.(! empty($p['friendly_fire']) ? '(아군 피해 포함)' : ''),
            'T_ACTIVE_BUFF' => (($p['target_mode'] ?? 'self_area') === 'ally' ? '사거리 '.$i('cast_range', 2).'칸 내 아군 1명' : '시전자 중심 반경 '.$i('radius', 2).'칸 아군')
                .'의 '.($stat[$p['stat'] ?? ''] ?? '능력').' +'.$i('amount').(($p['stat'] ?? '') === 'move' ? '' : '%').' ('.$i('duration', 1).'턴)',
            'T_ACTIVE_HEAL' => '사거리 '.$i('cast_range', 2).'칸 내 아군 1명의 체력 회복(고정 '.$i('heal_flat', 14).' 또는 최대 체력의 '.$i('heal_pct', 20).'% 중 큰 값)'.($i('radius') > 0 ? ', 인접 아군은 '.$i('area_pct', 50).'%' : ''),
            'T_ACTIVE_SURGE' => $i('min_turn', 2).'턴부터 이동 전에 사용: 이번 턴 이동력 +'.$i('move_bonus', 2).(! empty($p['leap']) ? '(장애물 도약)' : '').($i('attack_pct', 100) > 100 ? ', 첫 공격 위력 '.$i('attack_pct').'%' : ''),
            'T_ACTIVE_PIERCE' => '대상 1명을 위력 '.$i('power_pct', 120).'%로 공격, 대상 기본 방어 '.$i('def_ignore_pct', 30).'% 무시',
            'T_ACTIVE_STANCE' => '반경 '.$i('radius', 2).'칸 아군의 반격 피해 +'.$i('counter_pct', 50).'%, 반격 시 상성 불리 무효 ('.$i('duration', 1).'턴)',
            default => '',
        };
    }

    /** 효과 한 줄 설명(중립 문구). 효과가 여러 개면 ' / '로 연결. */
    private function describeEffects(array $params): string
    {
        $parts = [];
        foreach (isset($params['effects']) && is_array($params['effects']) ? $params['effects'] : [$params] as $e) {
            $per = isset($e['when']['adjacent_allies']) ? '인접 아군 1명당 ' : '';
            $p = [];
            isset($e['atk_pct']) && $p[] = "공격력 +{$e['atk_pct']}%";
            isset($e['def_pct']) && $p[] = "방어력 +{$e['def_pct']}%";
            isset($e['heal']) && $p[] = "치유량 +{$e['heal']}";
            isset($e['move']) && $p[] = "이동력 +{$e['move']}";
            isset($e['regen_hp']) && $p[] = "턴 종료 시 최대 체력의 {$e['regen_hp']}% 회복";
            $p && $parts[] = $per.implode(', ', $p);
        }
        if (is_array($params['move_discount'] ?? null) && (int) ($params['move_discount']['amount'] ?? 0) > 0) {   // T_TERRAIN_MASTER: 해당 지형(조건 문구에 지형 목록 표기) 이동 비용 감소
            $parts[] = "해당 지형 이동 비용 -{$params['move_discount']['amount']}(최소 1)";
        }
        if (is_array($params['matchup_negate'] ?? null) && $params['matchup_negate'] !== []) {   // T_MATCHUP_NEGATE
            $this->unitTypeNames ??= DB::table('unit_types')->pluck('name', 'code')->all();
            $parts[] = implode('·', array_map(fn ($t) => $this->unitTypeNames[$t] ?? $t, $params['matchup_negate'])).' 상대 상성 불리 무효';
        }

        return implode(' / ', $parts);
    }

    /** 조건 요약. 무조건이면 null. 엔진 미지원 조건 키는 원문 키 대신 '특수 조건'으로 표기. */
    private function describeCondition(array $params): ?string
    {
        $this->terrainNames ??= DB::table('terrains')->pluck('name', 'code')->all();
        $out = [];
        foreach ($params['effects'] ?? [] as $e) {
            $w = $e['when'] ?? null;
            if (! is_array($w) || $w === []) {
                continue;
            }
            $c = [];
            foreach ($w as $k => $v) {
                $c[] = match ($k) {
                    'terrain' => implode('·', array_map(fn ($t) => $this->terrainNames[$t] ?? $t, (array) $v)).' 지형에 있을 때',
                    'vs' => implode('·', array_map(fn ($t) => $this->rules()->unitType($t)['name'] ?? $t, (array) $v)).' 상대로',
                    'hp_below_pct' => "체력 {$v}% 이하일 때",
                    'counter' => '반격할 때',
                    'target_full_hp' => '체력이 가득 찬 적을 공격할 때',
                    'moved' => '이동 후 공격할 때',
                    'adjacent_allies' => "인접 아군 수에 비례(최대 {$v}명)",
                    'target_hp_below_pct' => "대상 체력 {$v}% 이하일 때",
                    'target_terrain' => implode('·', array_map(fn ($t) => $this->terrainNames[$t] ?? $t, (array) $v)).' 위의 적을 공격할 때',
                    default => '특수 조건',
                };
            }
            $out[] = implode(', ', $c);
        }

        return $out ? implode(' / ', array_unique($out)) : null;
    }

    /** @return array<int,array{code:string,name:string,radius:int,atk_pct:int,def_pct:int}> */
    public function auras(): array
    {
        return DB::table('auras')->orderBy('id')->get(['code', 'name', 'radius', 'atk_pct', 'def_pct'])->map(fn ($a) => ['code' => $a->code, 'name' => $a->name, 'radius' => (int) $a->radius, 'atk_pct' => (int) $a->atk_pct, 'def_pct' => (int) $a->def_pct])->all();
    }

    /** @return array{code:?string,biome:?string} */
    public function mapMeta(int $id): array
    {
        $m = DB::table('maps')->where('id', $id)->first(['code', 'biome']);

        return ['code' => $m->code ?? null, 'biome' => $m->biome ?? null];
    }

    /** 맵 장식 선택 필드(maps.meta의 decor, village_style): 값이 있는 키만 반환(없으면 [] = 응답 불변). 전투 view·배치·방 응답 최상위에 병합한다. */
    public function mapExtras(int $id, ?array $size = null): array
    {
        if (! \Illuminate\Support\Facades\Schema::hasColumn('maps', 'meta')) {
            return [];
        }
        $meta = json_decode((string) DB::table('maps')->where('id', $id)->value('meta'), true) ?: [];
        $o = [];
        ! empty($meta['decor']) && ($o['decor'] = $meta['decor']);
        ! empty($meta['village_style']) && ($o['village_style'] = $meta['village_style']);
        // tile_layer(시각용 타일 인덱스): size=[w,h](진행 중 전투 state 크기)가 주어지면 크기가 다를 때(맵 갱신 전 전투) 생략
        if (! empty($meta['tile_layer']) && self::tileLayerFits($meta['tile_layer'], $size)) {
            $o['tile_layer'] = $meta['tile_layer'];
        }

        $o += self::artExtras($meta);

        return $o;
    }

    /** 맵 개편 시각 필드(meta.props·painted_bg·culture). 없거나 검증 실패한 키는 생략. preview도 공용 */
    public static function artExtras(array $meta): array
    {
        $o = [];
        ! empty($meta['props']) && is_array($meta['props']) && ($o['props'] = $meta['props']);
        if (! empty($meta['painted_bg']) && is_array($meta['painted_bg']) && ($bg = self::sanitizePaintedBg($meta['painted_bg'])) !== null) {
            $o['painted_bg'] = $bg;
        }
        isset($meta['culture']) && in_array($meta['culture'], ['kr', 'jp', 'cn', 'eu', 'me'], true) && ($o['culture'] = $meta['culture']);
        ! empty($meta['gates']) && ($g = self::sanitizeGates($meta['gates'])) !== null && ($o['gates'] = $g);
        isset($meta['castle_render']) && ($cr = self::sanitizeCastleRender($meta['castle_render'])) !== null && ($o['castle_render'] = $cr);
        isset($meta['ground_tone']) && ($gt = self::sanitizeGroundTone($meta['ground_tone'])) !== null && ($o['ground_tone'] = $gt);
        isset($meta['wall_style']) && is_string($meta['wall_style']) && preg_match('/^[A-Za-z0-9_\-]{1,24}$/', $meta['wall_style']) && ($o['wall_style'] = $meta['wall_style']);
        isset($meta['pier_style']) && is_string($meta['pier_style']) && preg_match('/^[A-Za-z0-9_\-]{1,24}$/', $meta['pier_style']) && ($o['pier_style'] = $meta['pier_style']);

        return $o;
    }

    /** gates: [{x,y,dir?}] 또는 [[x,y]] (정수 0~255, 최대 64개). 항목 하나라도 잘못되면 null(키 생략). 원 형태를 유지한다 */
    public static function sanitizeGates(mixed $gates): ?array
    {
        if (! is_array($gates) || ! array_is_list($gates) || count($gates) > 64) {
            return null;
        }
        $ok = fn ($v) => is_int($v) && $v >= 0 && $v <= 255;
        $out = [];
        foreach ($gates as $g) {
            if (is_array($g) && array_is_list($g) && count($g) === 2 && $ok($g[0]) && $ok($g[1])) {
                $out[] = [$g[0], $g[1]];
            } elseif (is_array($g) && isset($g['x'], $g['y']) && $ok($g['x']) && $ok($g['y'])) {
                $e = ['x' => $g['x'], 'y' => $g['y']];
                if (isset($g['dir'])) {
                    if (! is_string($g['dir']) || ! preg_match('/^[A-Za-z0-9_\-]{1,12}$/', $g['dir'])) {
                        return null;
                    }
                    $e['dir'] = $g['dir'];
                }
                $out[] = $e;
            } else {
                return null;
            }
        }

        return $out;
    }

    /** castle_render: 'none' | 키 문자열(영숫자_ 1~48자) | 소품 배열(최대 200, 각 항목 key 문자열 필수) */
    public static function sanitizeCastleRender(mixed $v): array|string|null
    {
        if (is_string($v)) {
            return preg_match('/^[A-Za-z0-9_]{1,48}$/', $v) ? $v : null;
        }
        if (is_array($v) && $v !== [] && count($v) <= 200 && array_is_list($v)) {
            foreach ($v as $p) {
                if (! is_array($p) || ! is_string($p['key'] ?? $p['kind'] ?? null) || ! preg_match('/^[A-Za-z0-9_]{1,48}$/', $p['key'] ?? $p['kind'])) {
                    return null;
                }
            }

            return $v;
        }

        return null;
    }

    /** ground_tone: 'arid|dry|autumn|cold' | {color:'#rrggbb', alpha:0~1} */
    public static function sanitizeGroundTone(mixed $v): array|string|null
    {
        if (is_string($v)) {
            return in_array($v, ['arid', 'dry', 'autumn', 'cold'], true) ? $v : null;
        }
        if (is_array($v) && is_string($v['color'] ?? null) && preg_match('/^#[0-9a-fA-F]{6}$/', $v['color']) && is_numeric($v['alpha'] ?? null) && $v['alpha'] >= 0 && $v['alpha'] <= 1) {
            return ['color' => $v['color'], 'alpha' => $v['alpha'] + 0];
        }

        return null;
    }

    /** painted_bg 검증: src는 public/assets/maps/ 하위 상대 경로의 이미지 파일만(외부 URL·..·스킴 금지). 실패 시 null(필드 생략) */
    public static function sanitizePaintedBg(array $bg): ?array
    {
        $src = $bg['src'] ?? null;
        if (! is_string($src) || ! preg_match('#^/?assets/maps/(?:[A-Za-z0-9_\-]+/)*[A-Za-z0-9_\-]+(?:\.[A-Za-z0-9_\-]+)*\.(?:png|webp|jpe?g)$#i', $src) || str_contains($src, '..')) {
            return null;
        }
        $px = $bg['tile_px'] ?? null;
        if (! is_numeric($px) || $px <= 0 || $px > 1024) {
            return null;
        }
        $o = ['src' => '/'.ltrim($src, '/'), 'tile_px' => $px + 0];
        foreach (['ox', 'oy'] as $k) {
            isset($bg[$k]) && is_numeric($bg[$k]) && ($o[$k] = $bg[$k] + 0);
        }
        isset($bg['filter']) && in_array($bg['filter'], ['linear', 'nearest'], true) && ($o['filter'] = $bg['filter']);

        return $o;
    }

    /** tile_layer rows(행당 공백 구분 인덱스) 크기가 [w,h]와 일치하는지. size null이면 true */
    public static function tileLayerFits(array $layer, ?array $size): bool
    {
        if ($size === null) {
            return true;
        }
        $rows = $layer['rows'] ?? [];

        return count($rows) === (int) $size[1] && isset($rows[0]) && count(preg_split('/\s+/', trim((string) $rows[0]))) === (int) $size[0];
    }

    /** config('game.rules')를 적용한 규칙 엔진 */
    public function engine(array $override = []): Engine
    {
        return new Engine($this->rules(), array_merge(config('game.rules', []), $override));
    }

    public function map(int $id): array
    {
        $m = DB::table('maps')->where('id', $id)->first();

        return [
            'id' => (int) $m->id, 'code' => $m->code, 'width' => (int) $m->width, 'height' => (int) $m->height,
            'tiles' => json_decode($m->tiles, true), 'spawns' => json_decode($m->spawns, true),
            'deploy_zones' => json_decode($m->deploy_zones, true), 'biome' => $m->biome ?? null,
            'rules' => $m->rules === null ? null : (json_decode($m->rules, true) ?: null),   // 맵별 규칙 오버라이드(선택)
            'meta' => json_decode((string) ($m->meta ?? ''), true) ?: [],   // 맵 메타(objective_points·enemy_extra_zones·enemy_zones 등)
        ];
    }

    /** @return array{hero:array,units:array<int,string>} */
    public function preset(int $id): array
    {
        $p = DB::table('presets')->where('id', $id)->first();

        return ['hero' => $this->heroById((int) $p->hero_id), 'units' => json_decode($p->units, true)];
    }

    /** 영웅의 프리셋 부대(병종 3개). 프리셋이 없는 영웅(신규 풀)은 병종 기본 편성(config game.troop_default_by_type 앞 3기)으로 폴백 */
    public function presetUnits(int $heroId, string $unitType): array
    {
        $json = DB::table('presets')->where('hero_id', $heroId)->value('units');
        if ($json) {
            return json_decode($json, true);
        }

        return array_slice(config('game.troop_default_by_type')[$unitType] ?? ['sword', 'spear', 'archer'], 0, 3);
    }

    /** @return array<int,array{id:int,hero_id:int,units:array<int,string>}> id => 프리셋 (시뮬 메모리 패치용으로 오버라이드 가능) */
    public function presets(): array
    {
        $out = [];
        foreach (DB::table('presets')->orderBy('id')->get() as $p) {
            $out[(int) $p->id] = ['id' => (int) $p->id, 'hero_id' => (int) $p->hero_id, 'units' => json_decode($p->units, true)];
        }

        return $out;
    }

    /** @return array<int,array<string,mixed>> sort_order 순 스테이지 행(배열). 시뮬 메모리 패치용으로 오버라이드 가능 */
    public function stages(): array
    {
        return DB::table('stages')->orderBy('sort_order')->get()->map(fn ($s) => (array) $s)->all();
    }

    public function defaultMapId(): int
    {
        return (int) DB::table('maps')->orderBy('id')->value('id');
    }

    /** 병종/희귀 데이터 변경 후 재조회가 필요할 때 */
    public function flush(): void
    {
        $this->rules = null;
        $this->heroes = null;
        $this->skillRows = null;
        $this->terrainNames = null;
    }
}
