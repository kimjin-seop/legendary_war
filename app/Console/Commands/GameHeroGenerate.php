<?php

namespace App\Console\Commands;

use App\Game\HeroStatRules;
use Illuminate\Console\Command;

/**
 * 영웅 능력치 후보 자동 생성(파일 입력/출력, DB 미사용). 규칙: database/data/hero_stat_rules.json.
 * 결정론: 같은 입력이면 같은 출력(타임스탬프 없음). 기존 파일 덮어쓰기 금지, heroes.json은 하드 차단.
 */
class GameHeroGenerate extends Command
{
    protected $signature = 'game:hero-generate
        {--base=database/data/hero_pool100.json : 풀(코드별 rarity/unit_type)}
        {--profiles=database/data/hero_profiles.json : 6축 프로필}
        {--rules=database/data/hero_stat_rules.json : 규칙}
        {--out= : 후보 JSON 출력 경로(기존 파일이면 실패, heroes.json 차단)}
        {--only= : 쉼표 구분 영웅 코드만}
        {--dry-run : 파일을 쓰지 않고 요약만 출력}';

    protected $description = '영웅 능력치 후보 자동 생성(heroes.json 호환 별도 후보 파일, 덮어쓰기 금지)';

    private function load(string $path): array
    {
        $p = preg_match('#^([A-Za-z]:|/)#', $path) ? $path : base_path($path);
        is_file($p) || throw new \RuntimeException("파일 없음: $path");

        return json_decode(file_get_contents($p), true, 512, JSON_THROW_ON_ERROR);
    }

    public function handle(): int
    {
        $out = (string) $this->option('out');
        if (! $this->option('dry-run')) {
            if ($out === '') {
                $this->error('--out 경로가 필요합니다(또는 --dry-run).');

                return self::FAILURE;
            }
            $abs = preg_match('#^([A-Za-z]:|/)#', $out) ? $out : base_path($out);
            if (strtolower(basename($abs)) === 'heroes.json' || (is_file($abs) && realpath($abs) === realpath(database_path('data/heroes.json')))) {
                $this->error('heroes.json에는 쓸 수 없습니다(후보는 별도 파일로).');

                return self::FAILURE;
            }
            if (file_exists($abs)) {
                $this->error("출력 파일이 이미 있습니다(덮어쓰기 금지): $out");

                return self::FAILURE;
            }
        }
        $pool = $this->load($this->option('base'))['pool'];
        $profiles = array_column($this->load($this->option('profiles'))['items'], null, 'code');
        $rules = $this->load($this->option('rules'));
        $types = [];
        foreach ($this->load('database/data/unit_types.json')['items'] as $u) {
            $types[$u['code']] = $u;
        }
        $gen = new HeroStatRules($rules, $types, $this->load('database/data/skill_templates.json'));
        $only = $this->option('only') ? array_flip(explode(',', $this->option('only'))) : null;
        $items = [];
        $skipped = [];
        foreach ($pool as $code => $p) {
            if ($only !== null && ! isset($only[$code])) {
                continue;
            }
            if (($p['status'] ?? '') === 'pending_review') {
                $skipped[] = [$code, 'pending_review'];

                continue;
            }
            if (empty($p['rarity']) || ! in_array($p['rarity'], ['S', 'A', 'B', 'C'], true)) {
                $skipped[] = [$code, 'rarity 없음(null)'];

                continue;
            }
            if (! isset($types[$p['unit_type'] ?? ''])) {
                $skipped[] = [$code, 'unit_type 알 수 없음: '.($p['unit_type'] ?? 'null')];

                continue;
            }
            $items[] = $gen->generate($code, $p, $profiles[$code] ?? null);
        }
        $warn = array_filter($items, fn ($i) => $i['_gen']['warnings']);
        $this->table(['등급', '병종', '수', '평균 cost', 'hp+', 'atk+', 'def+', '성장 hp/atk/def'], $this->summary($items));
        $this->line(sprintf('생성 %d명 / 건너뜀 %d명 / 경고(중립 처리 등) %d명', count($items), count($skipped), count($warn)));
        foreach ($skipped as [$c, $why]) {
            $this->line("  건너뜀 $c: $why");
        }
        if (! $this->option('dry-run')) {
            $abs = preg_match('#^([A-Za-z]:|/)#', $out) ? $out : base_path($out);
            @mkdir(dirname($abs), 0775, true);
            $json = json_encode(['_note' => '자동 생성 후보(적용 전 사람 검토 필수). heroes.json 호환 + _gen 메타. 같은 입력이면 같은 출력.', 'items' => $items], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT | JSON_PRESERVE_ZERO_FRACTION);
            file_put_contents($abs, $json."\n");
            $this->info("후보 파일 저장: $out");
        }

        return self::SUCCESS;
    }

    /** @param array<int,array> $items */
    private function summary(array $items): array
    {
        $g = [];
        foreach ($items as $i) {
            $g[$i['rarity'].'|'.$i['unit_type']][] = $i;
        }
        ksort($g);
        $rows = [];
        foreach ($g as $k => $list) {
            [$r, $t] = explode('|', $k);
            $n = count($list);
            $avg = fn (string $f) => array_sum(array_column($list, $f)) / $n;
            $rows[] = [$r, $t, $n, sprintf('%.1f', $avg('cost')), sprintf('%.1f', $avg('hp_bonus')), sprintf('%.1f', $avg('atk_bonus')), sprintf('%.1f', $avg('def_bonus')),
                sprintf('%.2f/%.2f/%.2f', $avg('growth_hp_pct'), $avg('growth_atk_pct'), $avg('growth_def_pct'))];
        }

        return $rows;
    }
}
