<?php

namespace App\Console\Commands;

use App\Game\Duel;
use App\Services\GameData;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * 밸런스 시뮬레이션 (DB 읽기 전용, 시드 고정 재현).
 * 1) 지휘관 x 지휘관 매트릭스(양측 교대, 같은 시드 쌍) 2) 병종 미러 매치(부대 1칸 교체) 3) 레벨 차이(동수 4v4)
 * 규칙 전후 비교: --legacy(P1 규칙 모두 off) 또는 --rule=key=value (반복 가능).
 */
class GameSimulate extends Command
{
    protected $signature = 'game:simulate
        {--per-hero=160 : 영웅당 최소 판수(매트릭스). 1000 이상 권장}
        {--seed=1 : 기준 시드}
        {--level=5 : 매트릭스/미러 레벨(양측 동일)}
        {--mirror=100 : 병종 미러 매치 판수(병종당)}
        {--mirror-hero=joan_of_arc : 미러 기준 지휘관}
        {--mirror-slot=-1 : 미러에서 교체할 부대 칸 인덱스(-1=마지막). 예: 0이면 첫 칸}
        {--flyer-games=60 : flyer 섹션 판수(영웅 x 칸 조합당)}
        {--flyer-type=flyer : flyer 섹션에서 교체해 넣을 병종 코드}
        {--no-ally-npc : [3] 스테이지 rules.ally_npcs(아군 NPC)를 시뮬레이션에서 제외(기본은 포함해 실전과 같게 측정)}
        {--stage= : [3] 레벨 섹션을 이 스테이지 code 하나로 제한(예: stage_03)}
        {--by-stage : [3] 스테이지별 행 표(스테이지 x 레벨 차이)를 추가 출력}
        {--companions : [3] 스테이지 전투 생성과 같이 적 영웅·아군 NPC 영웅에 동반 일반병(config game.companions, database/data/stage_companions.json)을 붙인다(기본: config game.companions.simulate, 미지정 시 끔 = 기존 측정과 동일)}
        {--stage-set=* : 메모리 패치(DB 미변경) code:key=value (예: stage_03:enemy_level_offset=2, stage_03:enemy_extra_troops=["archer"])}
        {--formation-a= : formation 섹션 A측 편성 "영웅코드:병종,병종|영웅코드:병종" (첫 영웅=지휘관, squad on에서 영웅별 부대)}
        {--formation-b= : formation 섹션 B측 편성(생략 시 기본 지휘관 프리셋)}
        {--formation-games=200 : formation 섹션 판수(양측 교대)}
        {--troops-mode=fixed : 부대 병종 기본값: fixed=영웅 heroes.troop_type 1종 x 슬롯 수(실서비스 규칙, 기본) | preset=영웅 프리셋/병종 기본 편성(구 방식). 명시한 troops(--formation-a/b 병종, 미러·flyer 교체 실험, 스테이지 적)는 항상 override}
        {--map= : [3] 레벨 섹션의 맵을 이 map code로 고정(스테이지 맵 대신, 예: pk_01_plain_clash)}
        {--npc-playable-only : [3] 구 동작 재현: 아군 NPC 조회 풀에서 campaign_only 영웅 제외(전후 비교용)}
        {--party=1 : [3] 레벨 섹션 플레이어 파티 영웅 수(1=현행 지휘관 1명, 2~3=지휘관+영웅 풀 앞쪽에서 순서대로 동료 추가, 모두 같은 레벨)}
        {--defensive : [3] 시뮬 전용(realistic): 방어형 목표(survive_turns·hold_zone 등)에서 봇(비지휘관·비목표추구 유닛)이 sub_objectives hold_zone 구역(없으면 배치 중심)에서 2칸 넘게 전진하지 않고 입구를 지킨다. 실전 엔진·BattleService 무관}
        {--realistic : [3] 실제 스테이지 규칙 반영 모드: stages.rules 의 win_mode/win_conditions/lose_conditions/cues/sub_objectives/max_turns/ally_npcs(route 포함)를 실전 순서로 평가하고, 플레이어=a 고정, 아군 봇이 in_zone·capture 목표를 추구(호위 NPC 동행, 이동 후 공격·스킬). 종료 사유 분포를 함께 출력. 미지정 시 기존 동작}
        {--faithful : [3] 시뮬 전용(옵트인, 기본 동작 불변): 플레이어 파티를 실전 출전 구성으로 재현 - stages.forced_heroes({hero,unit_type,troop_type} 대여 포함)·@protagonist(--protagonist 영웅, rules.protagonist_troop 병종 덮어쓰기)·rules.deploy_slots.fixed_slots(고정 슬롯 영웅·좌표)를 반영. --party-heroes 가 있으면 무시}
        {--cue-goals : [3] 시뮬 전용(realistic, 옵트인): 아직 발동하지 않은 cue.when 의 in_zone(@protagonist 신호 타일 등)도 아군 봇이 목표로 추구}
        {--push-commander : [3] 시뮬 전용(realistic, 옵트인): defeat_commander 목표에서 사거리 안에 적이 없는 비-지휘관 전열이 적 지휘관 쪽으로 진격}
        {--must-survive : [3] 시뮬 전용(realistic, 옵트인): must_survive 아군 NPC(양규·호송 수레 등) 사망 패배를 종료 사유 rule=must_survive:<영웅> 로 구분 표기하고 route 없는 must_survive NPC 도 동행(호위) 대상에 넣는다. 패배 판정 자체는 기본에서도 실전 엔진이 처리}
        {--objective-only : [3] 시뮬 전용(realistic, 옵트인): 목표 추구자 외 플레이어 유닛이 단독 전진하지 않고 호위 대상(없으면 목표 추구자) 2칸 안에 머물며 사거리 안 적만 공격(수레 호송·탈출성 목표용). --push-commander 는 무시}
        {--death-log=0 : [3] 시뮬 전용(realistic, 옵트인): 플레이어 지휘관 사망 판의 직전 이벤트 로그를 최대 N판 출력(턴·가해 유닛·피해·지형·상성)}
        {--protagonist=protagonist_male_sword : --faithful 에서 @protagonist 로 쓸 주인공 영웅 code}
        {--party-heroes= : [3] 플레이어 파티를 영웅 code 목록(쉼표, 첫 영웅=지휘관)으로 지정(생략 시 --party 규칙). 모두 같은 레벨(권장+delta)}
        {--levels=48 : 레벨 차이 시나리오 판수(델타당)}
        {--sections=matrix,mirror,level : 실행할 섹션(flyer=비행 팀 지표, formation=편성 형태 시뮬 추가 가능)}
        {--commander-mode= : 봇 지휘관 모드 guard|engage}
        {--healer-ai= : 치유사 AI 1|0}
        {--bot=* : 봇 옵션 덮어쓰기 key=value (예: path_approach=1, formation_lead=2)}
        {--legacy : P1 규칙(패시브/치유%/상한/클램프/최소피해)을 모두 off}
        {--rule=* : 규칙 옵션 덮어쓰기 key=value (예: heal_percent=0, ranged_counter=1, clamp=[0.6,1.5])}';

    protected $description = '밸런스 시뮬레이션: 지휘관 매트릭스/병종 미러/레벨 차이 + 95% 신뢰구간';

    /** 무=0.5 승점 기준 Wilson 95% 신뢰구간 */
    private function ci(float $points, int $n): string
    {
        if ($n === 0) {
            return '-';
        }
        $p = $points / $n;
        $z = 1.96;
        $den = 1 + $z * $z / $n;
        $c = ($p + $z * $z / (2 * $n)) / $den;
        $h = $z * sqrt($p * (1 - $p) / $n + $z * $z / (4 * $n * $n)) / $den;

        return sprintf('%.1f%% [%.1f-%.1f]', 100 * $p, 100 * max(0, $c - $h), 100 * min(1, $c + $h));
    }

    private function parseRule(string $v): mixed
    {
        $j = json_decode($v, true);

        return json_last_error() === JSON_ERROR_NONE ? $j : $v;
    }

    public function handle(GameData $data): int
    {
        $override = [];
        if ($this->option('legacy')) {
            $override = ['passive_skills' => false, 'heal_percent' => 0.0, 'heal_cap' => 0, 'clamp' => null, 'min_damage_pct' => 0.0, 'ranged_counter' => false];
        }
        foreach ((array) $this->option('rule') as $kv) {
            [$k, $v] = array_pad(explode('=', $kv, 2), 2, '1');
            $override[$k] = is_numeric($v) && in_array($k, ['ranged_counter', 'passive_skills', 'facing', 'squad', 'squad_aura_self', 'alternate_activation', 'alt_first_rotate']) ? (bool) (int) $v : $this->parseRule($v);
        }
        $bot = array_filter([
            'commander_mode' => $this->option('commander-mode') ?: null,
            'healer_ai' => $this->option('healer-ai') === null || $this->option('healer-ai') === '' ? null : (bool) (int) $this->option('healer-ai'),
        ], fn ($v) => $v !== null);
        foreach ((array) $this->option('bot') as $kv) {
            [$k, $v] = array_pad(explode('=', $kv, 2), 2, '1');
            $bot[$k] = in_array($k, ['path_approach', 'healer_ai'], true) ? (bool) (int) $v : $this->parseRule($v);
        }
        $bot += config('game.bot');
        $this->option('defensive') && $bot['sim_defensive'] = true;
        $this->option('cue-goals') && $bot['sim_cue_goals'] = true;
        $this->option('push-commander') && $bot['sim_push_commander'] = true;
        $this->option('must-survive') && $bot['sim_must_survive'] = true;
        $this->option('objective-only') && $bot['sim_objective_only'] = true;
        (int) $this->option('death-log') > 0 && empty($bot['sim_death_log']) && $bot['sim_death_log'] = true;
        $engine = $data->engine($override);
        $rules = $data->rules();
        $heroes = $data->heroes();
        $heroList = array_values(array_filter($heroes, fn ($h) => empty($h['campaign_only'])));   // 캠페인 전용(주인공 원형·NPC)은 대전표 풀에서 제외
        $map = $data->map($data->defaultMapId());
        $growth = (float) config('game.troop_growth_pct');
        $duel = new Duel($engine, $map, $growth, (int) config('game.max_turns'), $bot);
        $presets = [];
        foreach ($data->presets() as $p) {
            $presets[$p['hero_id']] = $p['units'];
        }
        foreach ($heroList as $hh) {   // 프리셋이 없는 영웅(신규 풀)은 병종 기본 편성(config game.troop_default_by_type 앞 3기)으로 폴백
            $presets[$hh['id']] ??= array_slice(config('game.troop_default_by_type')[$hh['unit_type']] ?? ['sword', 'spear', 'archer'], 0, 3);
        }
        $fixedMode = (string) $this->option('troops-mode') !== 'preset';
        $squadCfg = app(\App\Services\ProgressionService::class)->squadCfg();
        $spec = fn (array $h, int $lv, ?array $troops = null) => ['hero' => $h, 'level' => $lv, 'troops' => $troops ?? ($fixedMode ? Duel::fixedTroops($h, $lv, $squadCfg) : null) ?? $presets[$h['id']]];
        $base = (int) $this->option('seed');
        $L = (int) $this->option('level');
        $sections = explode(',', $this->option('sections'));
        $t0 = microtime(true);
        $this->info('규칙 옵션: '.json_encode($engine->options()).' / 봇: '.json_encode($bot).' / seed='.$base.' level='.$L);

        if (in_array('matrix', $sections, true)) {
            $this->matrix($duel, $heroList, $spec, $presets, $base, $L, (int) $this->option('per-hero'), $rules);
        }
        if (in_array('mirror', $sections, true)) {
            $this->mirror($duel, $heroes[$this->option('mirror-hero')], $spec, $presets, $base, $L, (int) $this->option('mirror'), $this->simTypes($rules));
        }
        if (in_array('formation', $sections, true)) {
            $this->formation($duel, $heroes, $presets, $base, $L, (int) $this->option('formation-games'), $engine);
        }
        if (in_array('flyer', $sections, true)) {
            $this->flyerTeam($duel, $heroList, $spec, $presets, $base, $L, (int) $this->option('flyer-games'), (string) $this->option('flyer-type'));
        }
        if (in_array('level', $sections, true)) {
            $this->levels($data, fn (int $mapId) => new Duel($engine, $data->map($mapId), $growth, (int) config('game.max_turns'), $bot), $heroList, $spec, $presets, $base, (int) $this->option('levels'), $heroes);
        }
        $this->line(sprintf('(소요 %.1fs)', microtime(true) - $t0));

        return self::SUCCESS;
    }

    private function matrix(Duel $duel, array $heroList, \Closure $spec, array $presets, int $base, int $L, int $perHero, $rules): void
    {
        $n = count($heroList);
        $g = max(1, (int) ceil($perHero / (2 * ($n - 1))));   // 영웅당 판수 = 2 x (n-1) x g
        $stat = [];
        $vs = [];
        $typeStat = [];
        $m = ['games' => 0, 'a_points' => 0.0, 'turns' => 0, 'ftk' => 0, 'tl' => 0, 'heals' => 0, 'heal_games' => 0];
        $alt = ['act' => 0, 'rounds' => 0, 'fs_n' => 0, 'fs_win' => 0, 'fs_loss' => 0, 'hl_n' => 0, 'hl_win' => 0];   // 교대 행동 on일 때만 출력
        $fs = ['flank' => ['none' => 0, 'side' => 0, 'back' => 0], 'by_type' => [], 'rot' => 0, 'taken' => [], 'collapses' => 0, 'hfk' => 0, 'high' => 0, 'cover' => 0, 'vheal' => 0, 'hits' => 0];   // facing on일 때만 출력
        $pairIdx = 0;
        for ($i = 0; $i < $n; $i++) {
            for ($j = $i + 1; $j < $n; $j++, $pairIdx++) {
                for ($k = 0; $k < $g; $k++) {
                    $seed = $base * 1000000 + $pairIdx * 1000 + $k;   // 같은 시드 쌍: 양측 교대 두 판이 같은 시드를 공유
                    foreach ([[$i, $j], [$j, $i]] as [$x, $y]) {
                        $r = $duel->run($seed, $spec($heroList[$x], $L), $spec($heroList[$y], $L));
                        $pa = $r['winner'] === 'a' ? 1.0 : ($r['winner'] === null ? 0.5 : 0.0);
                        $m['games']++;
                        $m['a_points'] += $pa;
                        $m['turns'] += $r['turn'];
                        $m['ftk'] += $r['first_turn_kill'] ? 1 : 0;
                        $m['tl'] += $r['turn_limit'] ? 1 : 0;
                        $m['heals'] += $r['heals'];
                        $alt['act'] += $r['activations'];
                        $alt['rounds'] += $r['rounds'];
                        if ($r['first_side_won'] !== null) {   // 무승부 제외 집계
                            $alt['fs_n']++;
                            $r['first_side_won'] ? $alt['fs_win']++ : $alt['fs_loss']++;
                        }
                        if ($r['first_hero_loss_side_won'] !== null) {
                            $alt['hl_n']++;
                            $r['first_hero_loss_side_won'] && $alt['hl_win']++;
                        }
                        foreach ($r['flank'] as $k2 => $v2) {
                            $fs['flank'][$k2] += $v2;
                        }
                        foreach ($r['flank_type'] as $ty => $arr) {
                            foreach ($arr as $k2 => $v2) {
                                $fs['by_type'][$ty][$k2] = ($fs['by_type'][$ty][$k2] ?? 0) + $v2;
                            }
                        }
                        foreach ($r['dmg_taken'] as $ty => $v2) {
                            $fs['taken'][$ty] = ($fs['taken'][$ty] ?? 0) + $v2;
                        }
                        $fs['rot'] += $r['rotations'];
                        $fs['collapses'] += $r['collapses'];
                        $fs['high'] += $r['high_attacks'];
                        $fs['cover'] += $r['cover_hits'];
                        $fs['vheal'] += $r['village_heal'];
                        $fs['hits'] += array_sum($r['flank']);
                        $fs['hfk'] += $r['hero_first_kill'] ? 1 : 0;
                        $m['heal_games'] += $r['heals'] > 0 ? 1 : 0;
                        foreach ([[$x, $pa, 'a'], [$y, 1 - $pa, 'b']] as [$h, $pts, $side]) {
                            $c = $heroList[$h]['code'];
                            $stat[$c] ??= ['g' => 0, 'p' => 0.0, 'ga' => 0, 'pa' => 0.0, 'gb' => 0, 'pb' => 0.0];
                            $stat[$c]['g']++;
                            $stat[$c]['p'] += $pts;
                            $stat[$c]['g'.$side]++;
                            $stat[$c]['p'.$side] += $pts;
                        }
                        $ca = $heroList[$x]['code'];
                        $cb = $heroList[$y]['code'];
                        $vs[$ca][$cb] = ($vs[$ca][$cb] ?? [0, 0.0]);
                        $vs[$ca][$cb][0]++;
                        $vs[$ca][$cb][1] += $pa;
                        $vs[$cb][$ca] = ($vs[$cb][$ca] ?? [0, 0.0]);
                        $vs[$cb][$ca][0]++;
                        $vs[$cb][$ca][1] += 1 - $pa;
                        foreach ([[$x, $pa], [$y, 1 - $pa]] as [$h, $pts]) {
                            $types = array_unique(array_merge([$heroList[$h]['unit_type']], $spec($heroList[$h], $L)['troops']));
                            foreach ($types as $ty) {
                                $typeStat[$ty] ??= [0, 0.0];
                                $typeStat[$ty][0]++;
                                $typeStat[$ty][1] += $pts;
                            }
                        }
                    }
                }
            }
        }
        $this->info(sprintf('[1] 지휘관 매트릭스: 쌍당 %d시드 x 양측 교대, 영웅당 %d판, 총 %d판, 레벨 %d', $g, 2 * ($n - 1) * $g, $m['games'], $L));
        ksort($stat);
        $this->table(['지휘관', '판수', '승률(무=0.5) [95% CI]', '선공 시', '후공 시'], array_map(fn ($c, $s) => [
            $c, $s['g'], $this->ci($s['p'], $s['g']), sprintf('%.1f%%', 100 * $s['pa'] / max(1, $s['ga'])), sprintf('%.1f%%', 100 * $s['pb'] / max(1, $s['gb'])),
        ], array_keys($stat), $stat));
        $codes = array_keys($stat);
        $this->table(array_merge(['행 vs 열'], array_map(fn ($c) => substr($c, 0, 6), $codes)), array_map(function ($r) use ($codes, $vs) {
            return array_merge([$r], array_map(fn ($c) => $r === $c ? '-' : sprintf('%.0f', 100 * $vs[$r][$c][1] / max(1, $vs[$r][$c][0])), $codes));
        }, $codes));
        ksort($typeStat);
        $this->table(['병종(팀 포함)', '팀 판수', '승률 [95% CI]'], array_map(fn ($k, $v) => [$k, $v[0], $this->ci($v[1], $v[0])], array_keys($typeStat), $typeStat));
        $G = $m['games'];
        $this->table(['지표', '값'], [
            ['선공(A) 승률(무=0.5) [95% CI]', $this->ci($m['a_points'], $G)],
            ['평균 턴 수', sprintf('%.2f', $m['turns'] / $G)],
            ['첫 턴 킬 발생 비율', sprintf('%.1f%%', 100 * $m['ftk'] / $G)],
            ['턴 상한 도달 비율', sprintf('%.1f%%', 100 * $m['tl'] / $G)],
            ['치유 이벤트 포함 판 비율', sprintf('%.1f%%', 100 * $m['heal_games'] / $G)],
            ['판당 치유 이벤트 수', sprintf('%.2f', $m['heals'] / $G)],
        ]);
        if ($duel->alternateOn()) {   // 교대 행동 on일 때만 추가 출력(off는 기존 출력과 동일)
            $decided = max(1, $alt['fs_n']);
            $pf = 100 * $alt['fs_win'] / $decided;
            $ps = 100 * $alt['fs_loss'] / $decided;
            $this->info('[1e] 교대 행동 지표 (선공=state.first_side, 무승부 제외)');
            $this->table(['지표', '값'], [
                ['선공 승률 / 후공 승률 (결판 난 판 기준)', sprintf('%.1f%% / %.1f%% (결판 %d판)', $pf, $ps, $alt['fs_n'])],
                ['선공-후공 승률차(%p)', sprintf('%+.1f %s', $pf - $ps, abs($pf - $ps) >= 5.0 ? '[경고: 5%p 이상]' : '(5%p 미만)')],
                ['판당 활성화 수', sprintf('%.1f', $alt['act'] / $G)],
                ['평균 종료 라운드', sprintf('%.2f', $alt['rounds'] / $G)],
                ['첫 영웅 처치를 당한 쪽의 최종 승률', $alt['hl_n'] ? sprintf('%.1f%% (%d판)', 100 * $alt['hl_win'] / $alt['hl_n'], $alt['hl_n']) : '-'],
            ]);
        }
        if ($duel->terrainRulesOn()) {   // 지형 규칙(고지/엄폐/마을/방어상한) on일 때만 추가 출력
            $this->info('[1d] 지형 규칙 통계(공격 이벤트 기준)');
            $this->table(['지표', '값'], [
                ['고지 공격 비율(고지->저지 보너스 적용)', sprintf('%.1f%%', 100 * $fs['high'] / max(1, $fs['hits']))],
                ['숲 엄폐 발생 비율(원거리 공격 중 엄폐 적용)', sprintf('%.1f%%', 100 * $fs['cover'] / max(1, $fs['hits']))],
                ['판당 마을 회복량(HP)', sprintf('%.1f', $fs['vheal'] / $G)],
            ]);
        }
        if ($duel->squadOn()) {   // squad on일 때만 추가 출력(off는 기존 출력과 동일)
            $this->info('[1c] 영웅-부대 소속(squad) 통계');
            $this->table(['지표', '값'], [
                ['판당 붕괴(collapse) 횟수', sprintf('%.2f', $fs['collapses'] / $G)],
                ['영웅/지휘관 선처치율(첫 처치가 영웅인 판)', sprintf('%.1f%%', 100 * $fs['hfk'] / $G)],
            ]);
        }
        if ($duel->facingOn()) {   // 방향 시스템 on일 때만 추가 출력(off는 기존 출력과 동일)
            $tot = max(1, array_sum($fs['flank']));
            $pct = fn (array $f) => sprintf('%.1f%% / %.1f%% / %.1f%%', 100 * ($f['none'] ?? 0) / max(1, array_sum($f)), 100 * ($f['side'] ?? 0) / max(1, array_sum($f)), 100 * ($f['back'] ?? 0) / max(1, array_sum($f)));
            $this->info('[1b] 방향(facing) 통계 (공격 이벤트 기준, 반격 제외)');
            $this->table(['지표', '값'], [
                ['정면/측면/후면 공격 비율(전체)', $pct($fs['flank']).sprintf(' (공격 %d회)', $tot)],
                ['판당 방향 전환 횟수', sprintf('%.1f', $fs['rot'] / $G)],
            ]);
            ksort($fs['by_type']);
            $this->table(['공격 병종', '정면 / 측면 / 후면'], array_map(fn ($t, $f) => [$t, $pct($f)], array_keys($fs['by_type']), $fs['by_type']));
            ksort($fs['taken']);
            $this->table(['피격 병종', '받은 피해 합계', '판당 평균'], array_map(fn ($t, $v) => [$t, $v, sprintf('%.1f', $v / $G)], array_keys($fs['taken']), $fs['taken']));
        }
    }

    private function mirror(Duel $duel, array $hero, \Closure $spec, array $presets, int $base, int $L, int $games, array $types): void
    {
        $troops = $presets[$hero['id']];
        $slot = (int) $this->option('mirror-slot');
        $last = $slot < 0 ? count($troops) - 1 : min($slot, count($troops) - 1);
        $rows = [];
        foreach ($types as $ti => $t) {
            $pts = 0.0;
            for ($k = 0; $k < $games; $k++) {
                $variant = $troops;
                $variant[$last] = $t;
                $seed = $base * 1000000 + 500000 + $ti * 1000 + $k;
                $variantIsA = $k % 2 === 0;   // 양측 교대
                $va = $spec($hero, $L, $variant);
                $ba = $spec($hero, $L, $troops);
                $r = $variantIsA ? $duel->run($seed, $va, $ba) : $duel->run($seed, $ba, $va);
                $w = $r['winner'];
                $pts += $w === null ? 0.5 : (($w === 'a') === $variantIsA ? 1.0 : 0.0);
            }
            $rows[] = [$t.($t === $troops[$last] ? ' (동일=대조군)' : ''), $games, $this->ci($pts, $games)];
        }
        $this->info(sprintf('[2] 병종 미러 매치: %s 지휘관, 부대 [%s]의 마지막 칸을 교체한 팀 vs 기본 팀 (레벨 %d)', $hero['code'], implode(',', $troops), $L));
        $this->table(['교체 병종', '판수', '교체팀 승률 [95% CI]'], $rows);
    }

    /** 편성 형태 시뮬(임밸런 측정용): "영웅코드:병종,병종|영웅코드:병종" 파싱 -> party 스펙 */
    private function parseFormation(string $s, array $heroes, int $level, array $types): array
    {
        $party = [];
        foreach (explode('|', $s) as $part) {
            [$code, $troops] = array_pad(explode(':', $part, 2), 2, '');
            isset($heroes[$code]) || throw new \InvalidArgumentException("알 수 없는 영웅: $code");
            // 병종 생략(콜론 없음)이고 troops-mode=fixed면 영웅 고정 병종, 콜론이 있으면(빈 값 포함) 명시 override
            $list = $troops !== '' ? explode(',', $troops) : (! str_contains($part, ':') && (string) $this->option('troops-mode') !== 'preset' ? (Duel::fixedTroops($heroes[$code], $level, app(\App\Services\ProgressionService::class)->squadCfg()) ?? []) : []);
            foreach ($list as $t) {
                in_array($t, $types, true) || throw new \InvalidArgumentException("알 수 없는 병종: $t");
            }
            $party[] = ['hero' => $heroes[$code], 'level' => $level, 'troops' => $list];
        }

        return $party;
    }

    /** 시뮬 대상 병종: 퇴역 별칭(heavy)과 적·이벤트 전용 monster 제외 */
    private function simTypes(\App\Game\RuleSet $rules): array
    {
        return array_values(array_filter(array_keys($rules->unitTypes), fn ($c) => ! isset($rules->unitTypes[$c]['alias_of']) && $c !== 'monster'));
    }

    private function formation(Duel $duel, array $heroes, array $presets, int $base, int $L, int $games, $engine): void
    {
        $types = $this->simTypes($this->laravel->make(GameData::class)->rules());
        $fa = (string) $this->option('formation-a');
        if ($fa === '') {
            $this->error('--formation-a가 필요합니다.');

            return;
        }
        $partyA = $this->parseFormation($fa, $heroes, $L, $types);
        $fb = (string) $this->option('formation-b');
        $partyB = $fb !== '' ? $this->parseFormation($fb, $heroes, $L, $types) : [['hero' => $heroes['joan_of_arc'], 'level' => $L, 'troops' => $presets[$heroes['joan_of_arc']['id']]]];
        $pts = 0.0;
        $turns = 0;
        $coll = 0;
        for ($k = 0; $k < $games; $k++) {
            $aIsA = $k % 2 === 0;
            $seed = $base * 1000000 + 700000 + $k;
            $r = $aIsA ? $duel->run($seed, ['party' => $partyA], ['party' => $partyB]) : $duel->run($seed, ['party' => $partyB], ['party' => $partyA]);
            $w = $r['winner'];
            $pts += $w === null ? 0.5 : (($w === 'a') === $aIsA ? 1.0 : 0.0);
            $turns += $r['turn'];
            $coll += $r['collapses'];
        }
        $this->info(sprintf('[5] 편성 형태 시뮬(레벨 %d, squad=%s): A 편성 vs B 편성, 양측 교대 %d판', $L, $engine->options()['squad'] ? 'on' : 'off', $games));
        $this->table(['지표', '값'], [
            ['A측 편성', $fa], ['B측 편성', $fb ?: '(기본 joan_of_arc 프리셋)'], ['A 승률 [95% CI]', $this->ci($pts, $games)],
            ['평균 턴', sprintf('%.1f', $turns / max(1, $games))], ['판당 붕괴(collapse)', sprintf('%.2f', $coll / max(1, $games))],
        ]);
    }

    /** 비행 팀 지표: 모든 지휘관 x 부대 칸마다 해당 칸을 flyer로 교체한 팀 vs 기본 팀(양측 교대). 칸별 평균과 전체 평균을 출력. */
    private function flyerTeam(Duel $duel, array $heroList, \Closure $spec, array $presets, int $base, int $L, int $games, string $type): void
    {
        $slotPts = [];
        $slotN = [];
        $heroRows = [];
        foreach ($heroList as $hi => $hero) {
            $troops = $presets[$hero['id']];
            $hp = 0.0;
            $hn = 0;
            foreach (array_keys($troops) as $slot) {
                $variant = $troops;
                $variant[$slot] = $type;
                for ($k = 0; $k < $games; $k++) {
                    $seed = $base * 1000000 + 600000 + $hi * 10000 + $slot * 1000 + $k;
                    $variantIsA = $k % 2 === 0;
                    $va = $spec($hero, $L, $variant);
                    $ba = $spec($hero, $L, $troops);
                    $r = $variantIsA ? $duel->run($seed, $va, $ba) : $duel->run($seed, $ba, $va);
                    $w = $r['winner'];
                    $p = $w === null ? 0.5 : (($w === 'a') === $variantIsA ? 1.0 : 0.0);
                    $slotPts[$slot] = ($slotPts[$slot] ?? 0.0) + $p;
                    $slotN[$slot] = ($slotN[$slot] ?? 0) + 1;
                    $hp += $p;
                    $hn++;
                }
            }
            $heroRows[] = [$hero['code'], $hn, $this->ci($hp, $hn)];
        }
        $this->info(sprintf('[4] %s 팀 지표: 지휘관 x 칸 교체 팀 vs 기본 팀(레벨 %d, 조합당 %d판)', $type, $L, $games));
        $this->table(['지휘관', '판수', $type.' 교체팀 승률 [95% CI]'], $heroRows);
        $this->table(['교체 칸', '판수', '승률 [95% CI]'], array_map(fn ($s) => [$s, $slotN[$s], $this->ci($slotPts[$s], $slotN[$s])], array_keys($slotPts)));
        $this->line(sprintf('FLYER_TEAM_AVG %.1f%%', 100 * array_sum($slotPts) / max(1, array_sum($slotN))));
    }

    private function levels(GameData $data, \Closure $duelFor, array $heroList, \Closure $spec, array $presets, int $base, int $games, array $allHeroes = []): void
    {
        $stages = $data->stages();
        foreach ((array) $this->option('stage-set') as $kv) {   // 메모리 패치: code:key=value
            [$code, $rest] = array_pad(explode(':', $kv, 2), 2, '');
            [$k, $v] = array_pad(explode('=', $rest, 2), 2, '');
            foreach ($stages as &$sr) {
                if ($sr['code'] === $code) {
                    $sr[$k] = is_numeric($v) ? (int) $v : $v;
                }
            }
            unset($sr);
        }
        if ($this->option('stage')) {
            $stages = array_values(array_filter($stages, fn ($s) => $s['code'] === $this->option('stage')));
            if (! $stages) {
                $this->error('알 수 없는 스테이지: '.$this->option('stage'));

                return;
            }
        }
        $heroes = collect($heroList)->keyBy('id');
        $presetHero = array_column($data->presets(), 'hero_id', 'id');
        $agg = ['games' => 0, 'turns' => 0, 'tl' => 0, 'a_dec' => 0, 'a_win' => 0, 'reasons' => [], 'goal_moves' => 0, 'skills' => 0, 'loss_win' => [0.0, 0], 'loss_lose' => [0.0, 0]];   // [3] 보조 지표: 평균 종료 턴 / 턴 제한 종료율 / a(선공) 진영 승률(무승부 제외) / realistic: 종료 사유 분포
        $fixedMode = (string) $this->option('troops-mode') !== 'preset';
        $realistic = (bool) $this->option('realistic');
        $deathLeft = (int) $this->option('death-log');
        $runDelta = function (array $stageList, int $di, int $delta, int $n) use ($heroes, $heroList, $allHeroes, $presetHero, $spec, $presets, $duelFor, $base, &$agg, $fixedMode, $realistic, &$deathLeft): array {
            $noNpc = (bool) $this->option('no-ally-npc');
            $heroByCode = collect($this->option('npc-playable-only') ? $heroList : ($allHeroes ?: $heroList))->keyBy('code');   // campaign_only 아군 NPC 포함 전체 영웅
            $partySize = max(1, min(3, (int) $this->option('party')));
            $faithful = (bool) $this->option('faithful');
            $pts = 0.0;
            $lossSum = 0.0;   // 아군 손실률(시작 아군 체력 합 대비 감소 비율) 합
            for ($k = 0; $k < $n; $k++) {
                $st = $stageList[$k % count($stageList)];
                $rec = (int) $st['recommended_level'];
                $mine = $heroList[intdiv($k, count($stageList)) % count($heroList)];   // 플레이어 지휘관은 순환(스테이지 x 영웅 균등)
                $objective = json_decode((string) ($st['objective'] ?? ''), true);
                $survive = in_array($objective['type'] ?? null, ['survive_turns', 'capture'], true);
                $playerIsA = $survive || $realistic ? true : $k % 2 === 0;   // 양측 교대(survive_turns·capture는 플레이어=a 고정, realistic 은 실전처럼 항상 a)
                $forcedOv = [];   // 해전 수군 대여(stages.forced_heroes의 unit_type/troop_type 덮어쓰기)를 플레이어 지휘관에 적용
                foreach (json_decode((string) ($st['forced_heroes'] ?? ''), true) ?: [] as $fh) {
                    if (is_array($fh)) {
                        $forcedOv = array_intersect_key($fh, array_flip(['unit_type', 'troop_type']));
                    }
                }
                $forcedOv && $mine = array_merge($mine, $forcedOv);
                $named = array_values(array_filter(explode(',', (string) $this->option('party-heroes'))));
                if ($named !== []) {   // 영웅 code 로 파티 지정(첫 영웅=지휘관)
                    $mine = $heroByCode[$named[0]] ?? throw new \InvalidArgumentException('알 수 없는 영웅: '.$named[0]);
                    $partySize = count($named);
                }
                $skipParty = false;
                $p = $spec($mine, max(1, $rec + $delta));
                if ($faithful && $named === [] && ($fp = $this->faithfulParty($st, $heroByCode, $spec, max(1, $rec + $delta))) !== null) {
                    $p = $fp;
                    $playerIsA || $p = array_diff_key($p, ['positions' => 1]);   // 고정 슬롯 좌표는 a 진영 배치 영역 기준 -> b 로 뛸 때는 자동 배치
                    $skipParty = true;   // 파티는 이미 구성됨(아래 다중 영웅 합성 건너뜀)
                }
                if (! $skipParty && $partySize > 1) {   // 다중 영웅 파티: 지휘관(mine) + 풀 앞쪽 영웅(중복 제외) 또는 --party-heroes
                    $party = [['hero' => $p['hero'], 'level' => $p['level'], 'troops' => $p['troops']]];
                    $mates = $named !== [] ? array_map(fn ($c) => $heroByCode[$c] ?? throw new \InvalidArgumentException('알 수 없는 영웅: '.$c), array_slice($named, 1)) : $heroList;
                    foreach ($mates as $mate) {
                        if (count($party) >= $partySize) {
                            break;
                        }
                        if ($mate['id'] !== $mine['id']) {
                            $ms = $spec($mate, max(1, $rec + $delta));
                            $party[] = ['hero' => $ms['hero'], 'level' => $ms['level'], 'troops' => $ms['troops']];
                        }
                    }
                    $p = ['party' => $party];
                }
                $lvl = (int) $st['enemy_level'] + (int) ($st['enemy_level_offset'] ?? 0);
                $squad = json_decode((string) ($st['enemy_squad'] ?? ''), true);
                $cset = ($this->option('companions') || config('game.companions.simulate', false)) ? \App\Game\ArmyBuilder::companionSettings((string) $st['code']) : ['enabled' => false];   // 실전(BattleService)과 같은 동반 일반병 규칙
                if (is_array($squad) && isset($squad['commander']['unit_type'])) {   // 영웅 없는 일반 지휘관 + 가변 부대(캠페인)
                    [$squad] = \App\Game\ArmyBuilder::withEnemyCompanions($squad, $cset);
                    $e = ['generic' => $squad, 'level' => max(1, $lvl)];
                } else {
                    // 스테이지 전용 필드 반영: 추가 부대(enemy_extra_troops)와 레벨 가산(enemy_level_offset). 맵은 스테이지 맵 사용
                    $enemy = $heroes[$presetHero[$st['enemy_preset_id']]];
                    $extra = is_array($st['enemy_extra_troops'] ?? null) ? $st['enemy_extra_troops'] : (json_decode((string) ($st['enemy_extra_troops'] ?? '[]'), true) ?: []);
                    $eTroops = array_merge($presets[$enemy['id']], $extra);
                    $e = $spec($enemy, $lvl, $fixedMode ? \App\Game\ArmyBuilder::fixedTypesFor($enemy, $eTroops) : $eTroops);   // fixed 모드: 적도 영웅 고정 병종(슬롯 수 유지)
                }
                $duel = $duelFor($this->option('map') ? (int) (\Illuminate\Support\Facades\DB::table('maps')->where('code', $this->option('map'))->value('id') ?: throw new \InvalidArgumentException('알 수 없는 맵: '.$this->option('map'))) : (int) $st['map_id']);
                $seed = $base * 1000000 + 800000 + $di * 10000 + $k;
                $trigs = json_decode((string) ($st['triggers'] ?? ''), true) ?: null;
                $npcs = $noNpc ? [] : \App\Game\Engine::normalizeAllyNpcs((json_decode((string) ($st['rules'] ?? ''), true) ?: [])['ally_npcs'] ?? null);   // 아군 NPC는 플레이어 진영에 합류(봇이 같이 구동)
                $npcRow = fn (string $c) => $heroByCode[$c] ?? null;
                $comp = ! empty($cset['enabled']) ? fn (string $c): int => in_array($c, $cset['ally_exclude'], true) ? 0 : min((int) $cset['max'], max(0, (int) ($cset['ally_by_hero'][$c] ?? $cset['ally']))) : null;
                $stageCtx = $realistic ? ['rules' => json_decode((string) ($st['rules'] ?? ''), true) ?: [], 'first_side' => config('game.first_side')] : null;
                $r = $playerIsA ? $duel->run($seed, $p, $e, $objective, $trigs, 'b', $npcs, $npcRow, max(1, $rec + $delta), $comp, $stageCtx) : $duel->run($seed, $e, $p, $objective, $trigs, 'a', $npcs, $npcRow, max(1, $rec + $delta), $comp);
                $w = $r['winner'];
                if ($realistic) {
                    $key = $w === null ? 'draw' : ($w === 'a' ? 'win' : 'lose').':'.($r['end_reason'] ?? '?').(($r['rule'] ?? null) ? '('.$r['rule'].')' : '');
                    $agg['reasons'][$key] = ($agg['reasons'][$key] ?? 0) + 1;
                    $agg['goal_moves'] += $r['goal_moves'] ?? 0;
                    $agg['skills'] += $r['skill_uses'] ?? 0;
                    if (! empty($r['cmd_death']) && $deathLeft > 0) {
                        $deathLeft--;
                        $this->line(sprintf('    [cmd-death] %s seed=%d delta=%+d 판%d: T%d 지휘관 사망 가해=%s', $st['code'], $seed, $delta, $k, $r['cmd_death']['turn'], $r['cmd_death']['killer']));
                        foreach ($r['cmd_death']['events'] as $ln) {
                            $this->line('        '.$ln);
                        }
                    }
                }
                $lossSum += $r['ally_loss'] ?? 0.0;
                if ($w !== null) {   // 플레이어 기준 승/패 분리 집계
                    $lk = ($w === 'a') === $playerIsA ? 'loss_win' : 'loss_lose';
                    $agg[$lk][0] += $r['ally_loss'] ?? 0.0;
                    $agg[$lk][1]++;
                }
                $pts += $w === null ? 0.5 : (($w === 'a') === $playerIsA ? 1.0 : 0.0);
                $agg['games']++;
                $agg['turns'] += $r['turn'];
                $agg['tl'] += $r['turn_limit'] ? 1 : 0;
                if ($w !== null) {
                    $agg['a_dec']++;
                    $agg['a_win'] += $w === 'a' ? 1 : 0;
                }
            }

            return [$pts, $n, $lossSum];
        };
        $rows = [];
        foreach ([-2, 0, 2] as $di => $delta) {
            [$pts, $n, $lossSum] = $runDelta($stages, $di, $delta, $games);
            $rows[] = [sprintf('%+d', $delta), $n, $this->ci($pts, $n), sprintf('%.1f%%', 100 * $lossSum / max(1, $n))];
        }
        $this->info('[3] 레벨 차이: 플레이어(영웅 레벨=권장+delta, 지휘관 1+부대 3) vs 스테이지 적(enemy_level+offset, 프리셋+extra 부대, 스테이지 맵), 양측 교대');
        $this->table(['영웅 레벨 - 권장 레벨', '판수', '플레이어 승률 [95% CI]', '아군 평균 손실률'], $rows);
        $this->line(sprintf('    평균 종료 턴 %.2f / 턴 제한 종료율 %.1f%% / a(선공) 진영 승률 %.1f%% (무승부 제외 %d판)', $agg['turns'] / max(1, $agg['games']), 100 * $agg['tl'] / max(1, $agg['games']), 100 * $agg['a_win'] / max(1, $agg['a_dec']), $agg['a_dec']));
        $this->line(sprintf('    아군 손실률(시작 아군 체력 대비 감소, 아군 NPC 포함): 승리 판 평균 %s / 패배 판 평균 %s', $agg['loss_win'][1] ? sprintf('%.1f%%(%d판)', 100 * $agg['loss_win'][0] / $agg['loss_win'][1], $agg['loss_win'][1]) : '-', $agg['loss_lose'][1] ? sprintf('%.1f%%(%d판)', 100 * $agg['loss_lose'][0] / $agg['loss_lose'][1], $agg['loss_lose'][1]) : '-'));
        if ($realistic) {
            ksort($agg['reasons']);
            $this->line('    [realistic] 종료 사유(전 델타 합산 '.$agg['games'].'판): '.json_encode($agg['reasons'], JSON_UNESCAPED_UNICODE).sprintf(' / 목표 이동 %d회 / 스킬 사용 %d회', $agg['goal_moves'], $agg['skills']));
        }
        if ($this->option('by-stage')) {
            $srows = [];
            foreach ($stages as $st) {
                $cells = [];
                foreach ([-2, 0, 2] as $di => $delta) {
                    [$pts, $n, $lossSum] = $runDelta([$st], $di, $delta, $games);
                    $cells[] = sprintf('%.1f%% (손실 %.0f%%)', 100 * $pts / max(1, $n), 100 * $lossSum / max(1, $n));
                }
                $extra = is_array($st['enemy_extra_troops'] ?? null) ? $st['enemy_extra_troops'] : (json_decode((string) ($st['enemy_extra_troops'] ?? '[]'), true) ?: []);
                $sq = json_decode((string) ($st['enemy_squad'] ?? ''), true);
                $extra = is_array($sq) ? ['squad:'.count($sq['units'] ?? []).'부대'] : $extra;
                $srows[] = array_merge([$st['code'], $st['recommended_level'], (int) $st['enemy_level'] + (int) ($st['enemy_level_offset'] ?? 0), implode(',', $extra) ?: '-'], $cells);
            }
            $this->info(sprintf('[3b] 스테이지별 플레이어 승률 (셀당 %d판)', $games));
            $this->table(['스테이지', '권장Lv', '적Lv(+offset)', 'extra', '-2', '+0', '+2'], $srows);
        }
    }

    /**
     * --faithful: 실전(BattleService::forcedOf + deploy_slots.fixed)과 같은 플레이어 파티. 해석 가능한 forced/고정 슬롯 영웅이 없으면 null(기존 경로).
     * 순서: 주인공(@protagonist 있으면 지휘관) -> forced_heroes 순 -> 고정 슬롯 영웅. 같은 영웅은 한 번만, unit_type/troop_type 은 덮어쓰기 병합.
     * 고정 슬롯 좌표는 모든 파티원이 슬롯을 가질 때만 positions 로 전달한다(자유 슬롯·부대는 자동 배치).
     */
    private function faithfulParty(array $st, \Illuminate\Support\Collection $heroByCode, \Closure $spec, int $lvl): ?array
    {
        $rules = json_decode((string) ($st['rules'] ?? ''), true) ?: [];
        $slots = \App\Game\Engine::normalizeDeploySlots($rules['deploy_slots'] ?? null);
        $entries = json_decode((string) ($st['forced_heroes'] ?? ''), true) ?: [];
        foreach ($slots['fixed'] ?? [] as $fs) {
            $entries[] = array_intersect_key($fs, array_flip(['unit_type', 'troop_type'])) + ['hero' => $fs['hero']];
        }
        $pt = $rules['protagonist_troop'] ?? null;
        $order = [];
        foreach ($entries as $f) {
            $c = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
            $ov = is_array($f) ? array_intersect_key($f, array_flip(['unit_type', 'troop_type'])) : [];
            if ($c === '@protagonist') {
                $c = (string) $this->option('protagonist');
                is_string($pt) && $pt !== '' && $ov = ['unit_type' => $pt, 'troop_type' => $pt];
                $key = '@protagonist';
            } elseif ($c === '' || $c[0] === '@') {
                continue;
            } else {
                $key = $c;
            }
            $order[$key] = ['code' => $c, 'ov' => array_merge($order[$key]['ov'] ?? [], $ov)];
        }
        if ($order === []) {
            return null;
        }
        if (isset($order['@protagonist'])) {
            $order = ['@protagonist' => $order['@protagonist']] + $order;
        }
        $slotXY = [];
        foreach ($slots['fixed'] ?? [] as $fs) {
            $slotXY[$fs['hero']] = [$fs['x'], $fs['y']];
        }
        $party = [];
        $pos = [];
        foreach ($order as $key => $o) {
            $row = $heroByCode[$o['code']] ?? throw new \InvalidArgumentException('알 수 없는 영웅: '.$o['code']);
            $row = array_merge($row, $o['ov']);
            $ms = $spec($row, $lvl);
            $party[] = ['hero' => $ms['hero'], 'level' => $ms['level'], 'troops' => $ms['troops']];
            isset($slotXY[$key]) && $pos[count($party) - 1] = $slotXY[$key];
        }

        return ['party' => $party] + (count($pos) === count($party) ? ['positions' => $pos] : []);
    }
}
