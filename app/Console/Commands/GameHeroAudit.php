<?php

namespace App\Console\Commands;

use App\Game\HeroStatRules;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;

/**
 * 영웅 후보 파일 감사(읽기 전용): audit_rules A1~A10(영웅별), G1~G3(그룹별). 종료 코드: FAIL이 있으면 1, --strict면 WARN도 1.
 * --simulate: local/testing 개발 DB에서만, 트랜잭션 안에 후보를 임시 시드해 game:simulate 매트릭스를 돌리고 롤백한다(DB 불변).
 */
class GameHeroAudit extends Command
{
    protected $signature = 'game:hero-audit
        {--file= : 후보 JSON(heroes.json 호환, items[])}
        {--profiles=database/data/hero_profiles.json}
        {--rules=database/data/hero_stat_rules.json}
        {--report= : 감사 리포트 JSON 출력 경로(기존 파일이면 실패)}
        {--strict : WARN도 실패로 처리}
        {--simulate : (개발 DB 한정) 후보를 임시 시드(롤백)해 game:simulate 매트릭스 실행}
        {--per-hero=300 : --simulate 영웅당 판수}
        {--seed=1 : --simulate 시드}
        {--timeout=900 : --simulate 제한 시간(초)}';

    protected $description = '영웅 후보 감사(A1~A10, G1~G3, 읽기 전용) + 선택적 시뮬(개발 DB 롤백)';

    private function abs(string $path): string
    {
        return preg_match('#^([A-Za-z]:|/)#', $path) ? $path : base_path($path);
    }

    private function load(string $path): array
    {
        $p = $this->abs($path);
        is_file($p) || throw new \RuntimeException("파일 없음: $path");

        return json_decode(file_get_contents($p), true, 512, JSON_THROW_ON_ERROR);
    }

    public function handle(): int
    {
        if (! $this->option('file')) {
            $this->error('--file이 필요합니다.');

            return self::FAILURE;
        }
        $report = (string) $this->option('report');
        if ($report !== '' && file_exists($this->abs($report))) {
            $this->error("리포트 파일이 이미 있습니다(덮어쓰기 금지): $report");

            return self::FAILURE;
        }
        $items = $this->load($this->option('file'))['items'];
        $profiles = array_column($this->load($this->option('profiles'))['items'], null, 'code');
        $types = [];
        foreach ($this->load('database/data/unit_types.json')['items'] as $u) {
            $types[$u['code']] = $u;
        }
        $rules = new HeroStatRules($this->load($this->option('rules')), $types, $this->load('database/data/skill_templates.json'));
        $rows = [];
        $devs = [];
        $s30 = [];
        $frames = [];
        $count = ['OK' => 0, 'WARN' => 0, 'FAIL' => 0];
        $per = [];
        foreach ($items as $h) {
            $r = $rules->audit($h, $profiles[$h['code']] ?? null);
            foreach ($r['rows'] as [$id, $lv, $msg]) {
                $count[$lv]++;
                if ($lv !== 'OK') {
                    $rows[] = [$h['code'], $id, $lv, $msg];
                }
            }
            $per[$h['code']] = $r['rows'];
            $devs['r'][$h['rarity']][] = $r['dev'];
            $devs['t'][$h['unit_type']][] = $r['dev'];
            $s30[$h['rarity']][] = $r['s30'];
            $frames[$h['rarity']][] = $r['frame_s30'];
        }
        $this->info(sprintf('[영웅별] %d명, 검사 OK %d / WARN %d / FAIL %d (아래는 WARN·FAIL만)', count($items), $count['OK'], $count['WARN'], $count['FAIL']));
        $rows && $this->table(['영웅', '규칙', '결과', '상세'], $rows);
        $grp = [];
        $lvl = fn (float $v, float $w, float $f) => abs($v) > $f ? 'FAIL' : (abs($v) > $w ? 'WARN' : 'OK');
        foreach (['S', 'A', 'B', 'C'] as $r) {
            if (isset($devs['r'][$r])) {
                $m = array_sum($devs['r'][$r]) / count($devs['r'][$r]);
                $grp[] = ['G1', "등급 $r (n=".count($devs['r'][$r]).')', sprintf('%+.1f%%', $m), $lvl($m, 4, 8)];
            }
        }
        ksort($devs['t']);
        foreach ($devs['t'] as $t => $list) {
            $m = array_sum($list) / count($list);
            $grp[] = ['G2', "병종 $t (n=".count($list).')', sprintf('%+.1f%%', $m), $lvl($m, 5, 10)];
        }
        $mean = fn (array $a) => array_sum($a) / max(1, count($a));
        foreach ([['S', 'A'], ['A', 'B'], ['B', 'C']] as [$hi, $lo]) {
            if (isset($s30[$hi], $s30[$lo])) {
                $d = (($mean($s30[$hi]) / $mean($s30[$lo])) / ($mean($frames[$hi]) / $mean($frames[$lo])) - 1) * 100;
                $grp[] = ['G3', "등급 간 비 $hi/$lo (후보 ".sprintf('%.3f', $mean($s30[$hi]) / $mean($s30[$lo])).')', sprintf('%+.1f%% (틀 대비)', $d), $lvl($d, 3, 6)];
            }
        }
        $this->info('[그룹별] 편차는 틀(등급x병종 중립 프로필) 대비 Lv30 점수 평균');
        $this->table(['규칙', '그룹', '평균 편차', '결과'], $grp);
        foreach ($grp as $g) {
            $count[$g[3]]++;
        }
        if ($report !== '') {
            $abs = $this->abs($report);
            @mkdir(dirname($abs), 0775, true);
            file_put_contents($abs, json_encode(['counts' => $count, 'groups' => $grp, 'heroes' => $per], JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT)."\n");
            $this->info("리포트 저장: $report");
        }
        if ($this->option('simulate')) {
            $this->simulate($items);
        }
        $fail = $count['FAIL'] > 0 || ($this->option('strict') && $count['WARN'] > 0);
        $this->line(sprintf('합계 OK %d / WARN %d / FAIL %d', $count['OK'], $count['WARN'], $count['FAIL']));

        return $fail ? self::FAILURE : self::SUCCESS;
    }

    /** 개발 DB 한정: 트랜잭션 안에서 후보를 임시 시드 -> game:simulate -> 롤백(DB 불변). 로그: storage/logs/hero-audit-simulate.log */
    private function simulate(array $items): void
    {
        if (! app()->environment(['local', 'testing'])) {
            $this->error('--simulate는 local/testing 개발 환경에서만 실행할 수 있습니다.');

            return;
        }
        set_time_limit((int) $this->option('timeout'));
        $log = storage_path('logs/hero-audit-simulate.log');
        DB::beginTransaction();
        try {
            $types = DB::table('unit_types')->pluck('id', 'code');
            $auras = DB::table('auras')->pluck('id', 'code');
            $presetByType = [];
            $pr = DB::table('presets')->join('heroes', 'heroes.id', '=', 'presets.hero_id')->join('unit_types', 'unit_types.id', '=', 'heroes.unit_type_id')->get(['presets.units', 'unit_types.code as t']);
            foreach ($pr as $p) {
                $presetByType[$p->t] ??= $p->units;
            }
            $n = 0;
            foreach ($items as $h) {
                if (DB::table('heroes')->where('code', $h['code'])->exists()) {
                    continue;   // 기존 영웅은 그대로 둠(후보 신규만)
                }
                $id = DB::table('heroes')->insertGetId([
                    'code' => $h['code'], 'name_ko' => $h['name_ko'], 'name_en' => $h['name_en'] ?? $h['code'], 'born' => $h['born'] ?? 0, 'died' => $h['died'] ?? 0,
                    'era' => $h['era'] ?? '-', 'region' => $h['region'] ?? '-', 'unit_type_id' => $types[$h['unit_type']], 'rarity' => $h['rarity'], 'cost' => $h['cost'],
                    'hp_bonus' => $h['hp_bonus'], 'atk_bonus' => $h['atk_bonus'], 'def_bonus' => $h['def_bonus'],
                    'growth_hp_pct' => $h['growth_hp_pct'], 'growth_atk_pct' => $h['growth_atk_pct'], 'growth_def_pct' => $h['growth_def_pct'],
                    'aura_id' => isset($h['aura']) ? ($auras[$h['aura']] ?? null) : null, 'verify' => 1, 'culture' => $h['culture'] ?? null,
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                DB::table('presets')->insert([
                    'code' => 'tmp_'.$h['code'], 'name' => 'tmp', 'hero_id' => $id, 'units' => $presetByType[$h['unit_type']] ?? json_encode(['sword', 'spear', 'archer']),
                    'created_at' => now(), 'updated_at' => now(),
                ]);
                $n++;
            }
            $this->line("임시 시드 후보 {$n}명(롤백 예정). game:simulate 실행...");
            $t0 = microtime(true);
            Artisan::call('game:simulate', ['--per-hero' => (int) $this->option('per-hero'), '--seed' => (int) $this->option('seed'), '--sections' => 'matrix', '--mirror' => 10, '--levels' => 6]);
            $out = Artisan::output();
            file_put_contents($log, '['.date('c').'] '.sprintf('%.1fs', microtime(true) - $t0)."\n".$out."\n", FILE_APPEND);
            $this->line($out);
            $this->line("(시뮬 로그: $log)");
        } finally {
            DB::rollBack();   // 개발 DB 불변
        }
    }
}
