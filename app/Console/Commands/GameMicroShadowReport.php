<?php

namespace App\Console\Commands;

use App\Game\ArmyBuilder;
use App\Game\Duel;
use App\Services\GameData;
use Illuminate\Console\Command;

/**
 * 미시 교전 shadow 비교 리포트 (DB 읽기 전용, 파일 로그만 씀).
 * 스테이지 N개를 봇 vs 봇으로 자동 진행(micro_mode=shadow)하며 attack 이벤트마다 legacy 결과와 micro 결과를 비교한다.
 * 비교 항목: 양측 hp_after 차이(micro - legacy), 교전 승자 일치(남은 HP 비율이 높은 쪽), 방어측 처치 여부 일치.
 * --verify(기본): 같은 시드를 micro_mode=off 로도 돌려 shadow 가 legacy 진행(승자·턴)을 바꾸지 않는지 확인한다.
 * 규격: docs/MICRO_COMBAT_SPEC.md
 */
class GameMicroShadowReport extends Command
{
    protected $signature = 'game:micro-shadow-report
        {--stages=5 : 비교할 스테이지 수(권장 레벨 오름차순 앞에서부터)}
        {--games=4 : 스테이지당 판수(플레이어 영웅 순환, 양측 교대)}
        {--seed=1 : 기준 시드}
        {--delta=0 : 플레이어 영웅 레벨 = 권장 레벨 + delta}
        {--no-verify : off 대조 실행(shadow 가 legacy 진행을 바꾸지 않는지 확인)을 생략}
        {--log= : 집계 로그 파일 경로(기본: 시스템 임시 폴더의 micro_shadow_report_<일시>.log, storage/DB 미사용)}';

    protected $description = '미시 교전 shadow 비교 리포트: 스테이지 N개 자동 진행, 교전별 legacy vs micro hp_after 차이·승패 일치를 파일 로그로 집계';

    public function handle(GameData $data): int
    {
        $engineShadow = $data->engine(['micro_mode' => 'shadow', 'micro_stages' => [], 'micro_rooms' => []]);
        $engineOff = $data->engine(['micro_mode' => 'off']);
        $heroes = $data->heroes();
        $heroList = array_values(array_filter($heroes, fn ($h) => empty($h['campaign_only'])));
        $byId = collect($heroes)->keyBy('id');
        $presets = [];
        foreach ($data->presets() as $p) {
            $presets[$p['hero_id']] = $p['units'];
        }
        foreach ($heroList as $hh) {
            $presets[$hh['id']] ??= array_slice(config('game.troop_default_by_type')[$hh['unit_type']] ?? ['sword', 'spear', 'archer'], 0, 3);
        }
        $presetHero = array_column($data->presets(), 'hero_id', 'id');
        $squadCfg = app(\App\Services\ProgressionService::class)->squadCfg();
        $spec = fn (array $h, int $lv, ?array $troops = null) => ['hero' => $h, 'level' => $lv, 'troops' => $troops ?? Duel::fixedTroops($h, $lv, $squadCfg) ?? $presets[$h['id']]];
        $stages = $data->stages();
        usort($stages, fn ($a, $b) => [(int) $a['recommended_level'], $a['code']] <=> [(int) $b['recommended_level'], $b['code']]);
        $stages = array_slice($stages, 0, max(1, (int) $this->option('stages')));
        $games = max(1, (int) $this->option('games'));
        $base = (int) $this->option('seed');
        $delta = (int) $this->option('delta');
        $log = (string) ($this->option('log') ?: sys_get_temp_dir().DIRECTORY_SEPARATOR.'micro_shadow_report_'.date('Ymd_His').'.log');
        $bot = config('game.bot');
        $growth = (float) config('game.troop_growth_pct');
        $maxTurns = (int) config('game.max_turns');
        $write = function (string $line) use ($log): void {
            file_put_contents($log, $line."\n", FILE_APPEND);
            $this->line($line);
        };
        $write('['.date('c').'] micro shadow report: stages='.count($stages).' games/stage='.$games.' seed='.$base.' delta='.$delta);

        $tot = $this->newAgg();
        $mismatch = 0;
        $runs = 0;
        foreach ($stages as $si => $st) {
            $agg = $this->newAgg();
            for ($k = 0; $k < $games; $k++) {
                $rec = (int) $st['recommended_level'];
                $mine = $heroList[($k + $si) % count($heroList)];
                $playerIsA = $k % 2 === 0;
                $p = $spec($mine, max(1, $rec + $delta));
                $lvl = max(1, (int) $st['enemy_level'] + (int) ($st['enemy_level_offset'] ?? 0));
                $squad = json_decode((string) ($st['enemy_squad'] ?? ''), true);
                if (is_array($squad) && isset($squad['commander']['unit_type'])) {
                    $e = ['generic' => $squad, 'level' => $lvl];
                } elseif (isset($presetHero[$st['enemy_preset_id']])) {
                    $enemy = $byId[$presetHero[$st['enemy_preset_id']]];
                    $extra = is_array($st['enemy_extra_troops'] ?? null) ? $st['enemy_extra_troops'] : (json_decode((string) ($st['enemy_extra_troops'] ?? '[]'), true) ?: []);
                    $e = $spec($enemy, $lvl, ArmyBuilder::fixedTypesFor($enemy, array_merge($presets[$enemy['id']], $extra)));
                } else {
                    continue;
                }
                $objective = json_decode((string) ($st['objective'] ?? ''), true);
                $trigs = json_decode((string) ($st['triggers'] ?? ''), true) ?: null;
                $seed = $base * 1000000 + 900000 + $si * 1000 + $k;
                $map = $data->map((int) $st['map_id']);
                $survive = in_array($objective['type'] ?? null, ['survive_turns', 'capture'], true);
                $playerIsA = $survive ? true : $playerIsA;
                $exec = function (\App\Game\Engine $eng, ?\Closure $sink) use ($map, $growth, $maxTurns, $bot, $seed, $p, $e, $playerIsA, $objective, $trigs, $rec, $delta): array {
                    $duel = new Duel($eng, $map, $growth, $maxTurns, $bot, $sink);

                    return $playerIsA ? $duel->run($seed, $p, $e, $objective, $trigs, 'b', [], null, max(1, $rec + $delta)) : $duel->run($seed, $e, $p, $objective, $trigs, 'a', [], null, max(1, $rec + $delta));
                };
                $sink = function (array $events) use (&$agg, &$tot): void {
                    foreach ($events as $i => $ev) {
                        if (($ev['type'] ?? '') !== 'attack' || ! isset($ev['micro'])) {
                            continue;
                        }
                        $m = $ev['micro'];
                        $hb = $m['hp_before'];   // [공격측, 방어측]
                        $legacyDef = (int) $ev['hp_after'];
                        $legacyAtt = $hb[0];
                        foreach ($events as $c) {   // 같은 액션의 반격 이벤트(대상=공격자)가 있으면 공격측 legacy 잔여 HP
                            if (($c['type'] ?? '') === 'counter' && $c['target_unit_id'] === $ev['actor_unit_id'] && $c['actor_unit_id'] === $ev['target_unit_id']) {
                                $legacyAtt = (int) $c['hp_after'];
                            }
                        }
                        $ratio = fn (int $after, int $before) => $before > 0 ? $after / $before : 0.0;
                        $win = function (int $a, int $d) use ($hb, $ratio): string {
                            $ra = $ratio($a, $hb[0]);
                            $rd = $ratio($d, $hb[1]);

                            return abs($ra - $rd) < 1e-9 ? 'draw' : ($ra > $rd ? 'att' : 'def');
                        };
                        $row = [
                            'd_att' => $m['hp_after'][0] - $legacyAtt, 'd_def' => $m['hp_after'][1] - $legacyDef,
                            'win' => $win($legacyAtt, $legacyDef) === $win($m['hp_after'][0], $m['hp_after'][1]),
                            'kill' => ($legacyDef <= 0) === ($m['hp_after'][1] <= 0),
                            'surv' => ! empty($m['survivors']),
                        ];
                        foreach ([&$agg, &$tot] as &$a) {
                            $a['n']++;
                            $a['sum_att'] += $row['d_att'];
                            $a['sum_def'] += $row['d_def'];
                            $a['abs_att'] += abs($row['d_att']);
                            $a['abs_def'] += abs($row['d_def']);
                            $row['win'] && $a['win_ok']++;
                            $row['kill'] && $a['kill_ok']++;
                            $row['surv'] && $a['survivors']++;
                        }
                        unset($a);
                    }
                };
                $shadow = $exec($engineShadow, $sink);
                $runs++;
                if (! $this->option('no-verify')) {
                    $off = $exec($engineOff, null);
                    if ([$off['winner'], $off['turn']] !== [$shadow['winner'], $shadow['turn']]) {
                        $mismatch++;
                        $write(sprintf('  [경고] shadow 가 legacy 진행을 바꿈: %s seed=%d off=%s/T%d shadow=%s/T%d', $st['code'], $seed, $off['winner'] ?? '-', $off['turn'], $shadow['winner'] ?? '-', $shadow['turn']));
                    }
                }
            }
            $write($this->fmt($st['code'].' (rec Lv'.$st['recommended_level'].')', $agg));
        }
        $write($this->fmt('TOTAL', $tot));
        $write($this->option('no-verify') ? 'legacy 불변 검증: 생략' : sprintf('legacy 불변 검증(off 대조 %d판, 승자·턴 일치): %s', $runs, $mismatch === 0 ? 'OK' : "불일치 {$mismatch}판"));
        $this->info('로그 파일: '.$log);

        return $mismatch === 0 ? self::SUCCESS : self::FAILURE;
    }

    private function newAgg(): array
    {
        return ['n' => 0, 'sum_att' => 0, 'sum_def' => 0, 'abs_att' => 0, 'abs_def' => 0, 'win_ok' => 0, 'kill_ok' => 0, 'survivors' => 0];
    }

    private function fmt(string $label, array $a): string
    {
        $n = max(1, $a['n']);

        return sprintf('%s: 교전 %d / 승자일치 %.1f%% / 처치일치 %.1f%% / hp_after 차(micro-legacy) 공격측 평균 %+.2f(|절대| %.2f) 방어측 평균 %+.2f(|절대| %.2f) / HP1 생존 교전 %d',
            $label, $a['n'], 100 * $a['win_ok'] / $n, 100 * $a['kill_ok'] / $n, $a['sum_att'] / $n, $a['abs_att'] / $n, $a['sum_def'] / $n, $a['abs_def'] / $n, $a['survivors']);
    }
}
