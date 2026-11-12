<?php

namespace App\Console\Commands;

use App\Game\Cues;
use App\Game\EventConditions;
use App\Game\StageRules;
use App\Game\SubObjectives;
use Illuminate\Console\Command;
use App\Game\ArmyBuilder;
use App\Game\SquadPlanner;
use App\Models\User;
use App\Services\BattleService;
use App\Services\CueWalkAudit;
use App\Services\GachaService;
use App\Services\GameData;
use App\Services\ProgressionService;
use Illuminate\Support\Facades\DB;

/**
 * 읽기 전용 점검: 전 스테이지에서 "조용히 무시되는 규칙"과 배치/참조 문제를 목록화한다(DB 쓰기 없음).
 * 항목: 아군 배치칸 부족 맵, cues/sub_objectives/win·lose 조건의 무시되는 항목, 칸 수 한도 초과(in_zone 60·protect_tiles/hold_zone 20),
 * hold_zone turns 누락, 존재하지 않는 hero: 참조, 시작 시 전투에 없을 수 있는 hero: 참조, 스폰 칸이 아닌 UNIT@x,y.
 */
class GameAuditStages extends Command
{
    protected $signature = 'game:audit-stages {--min-zone=24 : 아군 배치칸 최소 수} {--chapter= : 챕터 하나만} {--enemy-ratio=1.0 : 슬롯 스테이지 적 초기 유닛 수 >= 아군 최대 유닛 수 x 이 값(미달은 WARN)} {--user-level= : 고정 영웅 코스트 상한 계산에 쓸 유저 레벨(기본: 스테이지 recommended_level)} {--enemy-all : 적 병력 상한 검사를 슬롯 미정의 스테이지까지 확대} {--fail-on-error : ERROR 가 있으면 종료코드 1}';

    protected $description = '전 스테이지 규칙·맵 점검(읽기 전용)';

    private array $rows = [];

    private function add(string $stage, string $kind, string $msg): void
    {
        $this->rows[] = [$stage, $kind, $msg];
    }

    public function handle(): int
    {
        $minZone = (int) $this->option('min-zone');
        $heroes = DB::table('heroes')->pluck('campaign_only', 'code')->all();
        $q = DB::table('stages')->orderBy('sort_order');
        $this->option('chapter') !== null && $q->where('chapter', (int) $this->option('chapter'));
        $zoneSeen = [];
        $this->initDeployAudit();
        foreach ($q->get() as $s) {
            $code = $s->code;
            $map = DB::table('maps')->where('id', $s->map_id)->first();
            if ($map) {
                $zone = json_decode((string) $map->deploy_zones, true)['a'] ?? [];
                if (count($zone) < $minZone && ! isset($zoneSeen[$map->code])) {
                    $zoneSeen[$map->code] = true;
                    $this->add($code, 'zone_small', "맵 {$map->code} 아군 배치칸 ".count($zone).' < '.$minZone);
                }
            }
            $rules = json_decode((string) ($s->rules ?? ''), true) ?: [];
            $this->auditDeploy($s, $rules);
            if ($rules === []) {
                continue;
            }
            ($d = StageRules::dropped($rules)) > 0 && $this->add($code, 'rules_dropped', "win/lose 조건 무효·누락 {$d}건");
            ($d = Cues::dropped($rules['cues'] ?? null)) > 0 && $this->add($code, 'cues_dropped', "cue {$d}건 무시");
            if (! empty($rules['cues']) && $map) {   // 연출 액터/보행 cue 정적 검증(액터 cue 가 없으면 무동작)
                $sqA = json_decode((string) ($s->enemy_squad ?? ''), true) ?: [];
                foreach (app(CueWalkAudit::class)->check((int) $map->id, $rules['cues'], $sqA, $this->bs->liveSlots($s)['fixed'] ?? []) as $m) {
                    $this->add($code, str_starts_with($m, 'ERROR') ? 'ERROR cue_walk' : 'WARN cue_actor', preg_replace('/^(ERROR|WARN) /', '', $m));
                }
            }
            $this->auditSubObjectives($code, $rules['sub_objectives'] ?? null);

            $known = [];   // 시작 시 전투에 있거나 나중에 생기는 hero: 참조 대상
            foreach ($rules['ally_npcs'] ?? [] as $an) {
                is_array($an) && isset($an['hero']) && $known[$an['hero']] = true;
            }
            foreach (json_decode((string) ($s->forced_heroes ?? ''), true) ?: [] as $fh) {
                $key = is_array($fh) ? (string) ($fh['hero'] ?? $fh['code'] ?? $fh['hero_code'] ?? '') : (string) $fh;
                $key !== '' && $known[$key] = true;
            }
            isset($rules['enemy_commander']['hero']) && $known[$rules['enemy_commander']['hero']] = true;
            foreach ($rules['cues'] ?? [] as $c) {
                isset($c['hero']) && $known[$c['hero']] = true;
            }
            $sq = json_decode((string) ($s->enemy_squad ?? ''), true) ?: [];
            foreach (array_merge([$sq], $sq['squads'] ?? []) as $one) {
                isset($one['commander']['npc_ref']) && $known[$one['commander']['npc_ref']] = true;
            }
            $spawnsB = [];
            if ($map) {
                foreach (json_decode((string) $map->spawns, true)['b'] ?? [] as $p) {
                    $spawnsB["{$p[0]},{$p[1]}"] = true;
                }
                foreach (json_decode((string) $map->deploy_zones, true)['b'] ?? [] as $p) {
                    $spawnsB["{$p[0]},{$p[1]}"] = true;
                }
            }
            foreach (array_merge([$sq], $sq['squads'] ?? []) as $one) {   // v3 부대 좌표(cells)도 적 시작 칸
                foreach ($one['cells'] ?? [] as $p) {
                    $spawnsB["{$p[0]},{$p[1]}"] = true;
                }
            }
            $this->walk($code, $rules, $heroes, $known, $spawnsB);
        }
        if ($this->rows === []) {
            $this->info('문제 없음');

            return self::SUCCESS;
        }
        $this->table(['stage', 'kind', 'detail'], $this->rows);
        $this->info(count($this->rows).'건 (읽기 전용 점검, 수정 없음)');

        return $this->option('fail-on-error') && count(array_filter($this->rows, fn ($r) => str_starts_with($r[1], 'ERROR '))) > 0 ? self::FAILURE : self::SUCCESS;
    }

    private BattleService $bs;

    private ProgressionService $prog;

    private GameData $gd;

    /** @var array<string,true> 획득 가능한 영웅 코드(뽑기 풀 + 가입 시 지급 시작 영웅). 스테이지 보상·대여 경로는 없다(영웅은 뽑기로만 획득) */
    private array $obtainable = [];

    private function initDeployAudit(): void
    {
        $this->bs = app(BattleService::class);
        $this->prog = app(ProgressionService::class);
        $this->gd = app(GameData::class);
        foreach ((array) config('game.starter_heroes') as $c) {
            $this->obtainable[$c] = true;
        }
        try {
            foreach (app(GachaService::class)->pool()['by_rarity'] as $codes) {
                foreach ($codes as $c) {
                    $this->obtainable[$c] = true;
                }
            }
        } catch (\Throwable) {
            $this->add('(all)', 'WARN gacha_pool_unreadable', '뽑기 풀을 읽지 못해 획득 경로 검사에서 뽑기를 제외함');
        }
    }

    /**
     * 배치 슬롯·필수 영웅 점검: (1) 슬롯 좌표/영웅 일치 (2) 슬롯 수 대비 적 초기 병력(WARN) (3) 증원 포함 적 합계 > max_alive_per_side_stage (4) 고정 영웅 코스트 합 vs 상한 (5) 필수 영웅 획득 경로.
     */
    private function auditDeploy(object $s, array $rules): void
    {
        $code = $s->code;
        $ds = $this->bs->liveSlots($s);
        $forcedRaw = json_decode((string) ($s->forced_heroes ?? ''), true) ?: [];
        foreach ($this->bs->slotCellIssues($s) as $msg) {
            $this->add($code, 'ERROR slot_invalid', $msg);
        }
        if ($ds !== null) {   // 슬롯 스테이지: forced_heroes 의 영웅은 모두 고정 슬롯에도 있어야 한다(없으면 배치 UI 에 자리가 없는 강제 영웅)
            $fixedHeroes = array_column($ds['fixed'], 'hero');
            foreach ($forcedRaw as $f) {
                $hc = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
                $hc !== '' && ! in_array($hc, $fixedHeroes, true) && $this->add($code, 'ERROR forced_not_in_fixed_slot', "forced_heroes '{$hc}' 가 deploy_slots.fixed_slots 에 없음 -> 고정 슬롯 추가 또는 forced_heroes 에서 제거");
            }
        }
        $level = max(1, (int) ($this->option('user-level') ?: $s->recommended_level));
        // (4) 고정/강제 영웅 코스트(영웅+부대) 합 vs 상한 (슬롯 스테이지 cost_cap 우선, 없으면 캠페인 곡선)
        if ($ds !== null || $forcedRaw !== []) {
            $entries = [];
            $tokens = array_merge(array_map(fn ($f) => is_array($f) ? $f : ['hero' => (string) $f], $forcedRaw), $ds['fixed'] ?? []);
            $seen = [];
            foreach ($tokens as $f) {
                $hc = (string) ($f['hero'] ?? '');
                if ($hc === '@protagonist') {
                    $row = collect($this->gd->heroes())->filter(fn ($h) => str_starts_with((string) $h['code'], 'protagonist_'))->sortByDesc('cost')->first();
                } else {
                    $row = $this->gd->heroes()[$hc] ?? null;
                }
                if ($row === null || isset($seen[$hc])) {
                    continue;
                }
                $seen[$hc] = true;
                foreach (['unit_type', 'troop_type'] as $k) {
                    isset($f[$k]) && $row[$k] = $f[$k];
                }
                $entries[] = $row;
            }
            if ($entries !== []) {
                $hs = [];
                foreach ($entries as $i => $row) {
                    $hs[$i] = ['uh' => (object) ['level' => $level], 'hero' => $row];
                }
                $c = $this->prog->costBreakdown(new User, $hs, null, true);
                $cap = $ds['cost_cap'] ?? $this->prog->campaignCostCap($level, $ds !== null ? count($ds['free']) : $this->prog->maxSlots($level, true), count($entries), true);
                $src = ($ds['cost_cap'] ?? null) !== null ? 'cost_cap' : "캠페인 곡선 Lv{$level}";
                $detail = "고정/강제 영웅 코스트 {$c['total']}(영웅 {$c['hero']} + 부대 {$c['troop']}) vs 상한 {$cap}({$src})";
                if ($c['total'] > $cap) {
                    $this->add($code, $ds !== null ? 'ERROR forced_cost_over' : 'ERROR forced_cost_over_legacy', $detail.($ds !== null ? ' -> rules.deploy_slots.cost_cap 상향 또는 고정 영웅 조정' : ' -> 슬롯 스테이지로 전환해 cost_cap 지정 필요'));
                } elseif ($ds !== null && $c['total'] === $cap) {
                    $this->add($code, 'WARN forced_cost_no_room', $detail.' -> 선택 슬롯에 둘 코스트 여유 0');
                }
            }
        }
        // (2)(3) 적 병력: 전투 생성과 같은 코드 경로(populateStageEnemy: enemy_squad/동반병/프리셋/추가부대 + triggers)
        if ($ds !== null || $this->option('enemy-all')) {
            try {
                $e = $this->bs->previewEnemyCounts($s);
            } catch (\Throwable $ex) {
                $this->add($code, 'WARN enemy_preview_failed', mb_substr($ex->getMessage(), 0, 120));

                return;
            }
            $max = (int) config('game.max_alive_per_side_stage');
            $e['initial'] + $e['reinforce'] > $max && $this->add($code, 'ERROR enemy_alive_over', "적 초기 {$e['initial']} + 증원 {$e['reinforce']} = ".($e['initial'] + $e['reinforce'])." > max_alive_per_side_stage {$max}");
            if ($ds !== null && (int) ($s->chapter ?? 0) !== 1) {   // 1장(ch1)은 튜토리얼: 슬롯 상한(선택 슬롯 최대 가정)과 신규 유저 실제 편성 차이가 커서 적<아군 비율 검사 제외(STAGES_CH1_SPEC 의도)
                $ally = $this->allyMaxUnits($s, $ds, $level, $rules);
                $r = (float) $this->option('enemy-ratio');
                $e['initial'] < $ally['total'] * $r && $this->add($code, 'WARN enemy_below_ally', "적 초기 {$e['initial']} < 아군 최대 {$ally['total']}(영웅 {$ally['heroes']} + 부대 {$ally['troops']} + 아군NPC {$ally['npc']}) x {$r}");
            }
        }
        // (5) 필수 영웅(스테이지 단위) 획득 경로: 뽑기 풀(또는 가입 시 시작 영웅)에 있어야 한다. 보상 경로 없음, campaign_only 는 풀에서 제외되므로 오류
        foreach ($this->bs->requiredStageHeroes(new User, $s, []) as $rh) {
            $h = $this->gd->heroes()[$rh['code']] ?? null;
            if ($h === null) {
                $this->add($code, 'ERROR required_hero_unobtainable', "필수 영웅 {$rh['code']} 가 heroes 에 없음");
            } elseif (! isset($this->obtainable[$rh['code']])) {
                $this->add($code, 'ERROR required_hero_unobtainable', "필수 영웅 {$rh['code']}(".($h['name_ko'] ?? '').')의 획득 경로 없음(뽑기 풀·시작 영웅에 없음'.(! empty($h['campaign_only']) ? ', campaign_only' : '').') -> 진행 불가(소프트락)');
            }
        }
    }

    /** 슬롯 스테이지 아군 최대 유닛 수(상한 추정): 영웅 슬롯 수 + 영웅당 부대(레벨/troop_bonus, 선택 슬롯은 최대 troop_bonus 가정) + 아군 NPC(본체+동반병). */
    private function allyMaxUnits(object $s, array $ds, int $level, array $rules): array
    {
        $cfg = $this->prog->squadCfg(true);
        $heroes = count($ds['fixed']) + count($ds['free']);
        $maxBonus = (int) collect($this->gd->heroes())->filter(fn ($h) => empty($h['campaign_only']))->max('troop_bonus');
        $troops = 0;
        foreach ($ds['fixed'] as $fs) {
            $troops += SquadPlanner::count($level, (int) ($this->gd->heroes()[$fs['hero']]['troop_bonus'] ?? 0), $cfg);
        }
        $troops += count($ds['free']) * SquadPlanner::count($level, $maxBonus, $cfg);
        $troops = min($troops, max(0, ArmyBuilder::allyStageCap() - $heroes));
        $set = ArmyBuilder::companionSettings((string) $s->code);
        $npc = 0;
        foreach (\App\Game\Engine::normalizeAllyNpcs($rules['ally_npcs'] ?? null) as $n) {
            $npc += 1 + (! empty($set['enabled']) && ! in_array($n['hero'], $set['ally_exclude'], true) ? min((int) $set['max'], max(0, (int) ($set['ally_by_hero'][$n['hero']] ?? $set['ally']))) : 0);
        }

        return ['heroes' => $heroes, 'troops' => $troops, 'npc' => $npc, 'total' => $heroes + $troops + $npc];
    }

    private function auditSubObjectives(string $code, mixed $raw): void
    {
        if (! is_array($raw) || $raw === []) {
            return;
        }
        $st = ['turn' => 1];
        SubObjectives::initialize($st, $raw);
        $out = $st['sub_objectives'] ?? [];
        foreach ($raw as $s) {
            $id = is_array($s) ? ($s['id'] ?? '?') : '?';
            if (! isset($out[$id])) {
                $this->add($code, 'sub_dropped', "sub_objective {$id} 무시(형식 오류)");

                continue;
            }
            $n = count($s['tiles'] ?? []);
            if (in_array($s['type'] ?? '', ['protect_tiles', 'hold_zone'], true) && $n > 20) {
                $this->add($code, 'sub_tiles_over', "{$id} ({$s['type']}) 칸 {$n} > 20 (앞 20칸만 적용)");
            }
            ($s['type'] ?? '') === 'hold_zone' && ! isset($s['turns']) && $this->add($code, 'sub_dropped', "{$id} hold_zone turns 누락");
        }
    }

    /** rules 트리를 재귀로 훑어 in_zone 칸 수·hero:/UNIT@ 참조를 점검 */
    private function walk(string $code, mixed $node, array $heroes, array $known, array $spawnsB, string $path = ''): void
    {
        if (! is_array($node)) {
            return;
        }
        if (($node['type'] ?? null) === 'in_zone' && count($node['tiles'] ?? []) > 60) {
            $this->add($code, 'in_zone_over', $path.' in_zone 칸 '.count($node['tiles']).' > 60 (앞 60칸만 적용)');
        }
        if (($node['type'] ?? null) === 'in_zone' && isset($node['tiles']) && EventConditions::normalize($node) === null) {
            $this->add($code, 'in_zone_invalid', $path.' in_zone 무효');
        }
        foreach (['unit', 'a', 'b'] as $k) {
            $v = $node[$k] ?? null;
            if (! is_string($v)) {
                continue;
            }
            if (str_starts_with($v, 'hero:')) {
                $h = substr($v, 5);
                if (! array_key_exists($h, $heroes)) {
                    $this->add($code, 'hero_missing', "{$path}.{$k} {$v}: heroes 테이블에 없음");
                } elseif (! isset($known[$h])) {
                    $this->add($code, 'hero_unplaced', "{$path}.{$k} {$v}: 아군NPC·강제편성·적 지휘관·spawn 어디에도 없음(소유·편성해야만 존재)");
                }
            } elseif (str_starts_with($v, 'ally_npc:')) {   // 아군 NPC 전용 참조(npc_X<->X 별칭 허용)
                $h = preg_replace('/^npc_/', '', substr($v, 9));
                $okNpc = array_filter(array_keys($known), fn ($k) => preg_replace('/^npc_/', '', (string) $k) === $h);
                $okNpc !== [] || $this->add($code, 'hero_unplaced', "{$path}.{$k} {$v}: 아군NPC(ally_npcs/spawn)에 없음");
            } elseif (preg_match('/^UNIT@(\d+),(\d+)$/', $v, $m) && ! isset($spawnsB["{$m[1]},{$m[2]}"])) {
                $this->add($code, 'unit_cell', "{$path}.{$k} {$v}: 적 스폰/배치 칸이 아님(런타임에 가장 가까운 적 병사 폴백)");
            }
        }
        foreach ($node as $k => $child) {
            if (is_array($child) && $k !== 'tiles') {
                $this->walk($code, $child, $heroes, $known, $spawnsB, $path.'/'.$k);
            }
        }
    }
}
