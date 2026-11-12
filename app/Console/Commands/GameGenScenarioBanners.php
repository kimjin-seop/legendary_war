<?php

namespace App\Console\Commands;

use App\Services\GachaService;
use App\Services\ScenarioBannerBuilder;
use Illuminate\Console\Command;

/**
 * 시나리오 레지스트리(scenario_registry.json) -> gacha_banners.json 의 시나리오 배너 생성. 기본은 dry-run(표만 출력, 파일 불변).
 * --write: 갱신 전 원본을 `<파일>.bak-<날짜시각>` 로 백업. --sync-draft=FILE: 임밸런 초안(gacha_banners_v2_draft.json)의 include/sides/showcase/제목을 레지스트리에 반영(초안 갱신 시 재동기화).
 * 개발 DB 읽기만 한다(쓰기 없음). 결정적이라 재실행 안전.
 */
class GameGenScenarioBanners extends Command
{
    protected $signature = 'game:gen-scenario-banners {--write : 파일 갱신(백업 후)} {--sync-draft= : 임밸런 초안 JSON 경로로 레지스트리 동기화} {--registry= : 레지스트리 경로} {--banners= : gacha_banners.json 경로}';

    protected $description = '시나리오 레지스트리에서 가챠 시나리오 배너(gacha_banners.json)를 생성(dry-run 기본)';

    public function handle(GachaService $gacha, ScenarioBannerBuilder $b): int
    {
        $regPath = $this->option('registry') ?: ScenarioBannerBuilder::registryPath();
        $banPath = $this->option('banners') ?: (config('game.gacha.banners_path') ?: database_path('data/gacha_banners.json'));
        $write = (bool) $this->option('write');
        $pool = $gacha->pool();
        $reg = $b->registry($regPath);

        if ($draftPath = $this->option('sync-draft')) {
            $draft = json_decode((string) file_get_contents($draftPath), true);
            if (! is_array($draft)) {
                $this->error('초안 JSON 형식 오류');

                return self::FAILURE;
            }
            $r = $b->syncFromDraft($reg, $draft, $pool);
            $reg = $r['registry'];
            $this->info(sprintf('초안 동기화: 일치 %d개, 레지스트리에 없는 초안 배너 %d개 %s', count($r['matched']), count($r['unmatched']), $r['unmatched'] ? '('.implode(',', $r['unmatched']).')' : ''));
            if ($write) {
                $this->backup($regPath);
                $this->atomicWrite($regPath, $this->json($reg));
                $this->line("레지스트리 갱신: {$regPath}");
            }
        }

        $out = $b->build($reg, $pool);
        $this->table(['key', '챕터', '풀', 'S/A/B/C', '아군/적군/미확정', '필수', '보충', '풀밖 제외', '필수 대기'], array_map(function ($bn) use ($out) {
            $d = $out['reports'][$bn['key']];

            return [$bn['key'], $bn['scenario_chapter'], count($d['codes']), implode('/', $d['counts']), implode('/', $d['side_counts']), count($d['required']), count($d['topup']), count($d['dropped']), count($d['pending_required'])];
        }, $out['banners']));
        foreach ($out['skipped'] as $k => $st) {
            $this->line("건너뜀(status={$st}): {$k}");
        }
        foreach ($out['reports'] as $k => $d) {
            $d['dropped'] && $this->line("  {$k} 풀 밖 제외(승격 대기 등): ".implode(',', $d['dropped']));
            $d['pending_required'] && $this->line("  {$k} 필수 대기(풀 밖): ".implode(',', $d['pending_required']));
        }
        $this->info(sprintf('시나리오 배너 %d개 생성 대상, 건너뜀 %d개', count($out['banners']), count($out['skipped'])));

        $existing = is_file($banPath) ? (array) json_decode((string) file_get_contents($banPath), true) : [];
        $doc = $b->compose($existing, $out['banners']);
        if (! $write) {
            $this->line('dry-run: 파일을 쓰지 않았습니다(--write 로 갱신).');

            return self::SUCCESS;
        }
        $this->backup($banPath);
        $this->atomicWrite($banPath, $this->json($doc));
        $this->info("갱신: {$banPath}");

        return self::SUCCESS;
    }

    private function json(array $doc): string
    {
        return json_encode($doc, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES)."\n";
    }

    /** 임시 파일에 쓴 뒤 rename: 쓰기 도중 중단돼도 원본이 깨지지 않는다 */
    private function atomicWrite(string $path, string $contents): void
    {
        $tmp = $path.'.tmp-'.getmypid();
        file_put_contents($tmp, $contents) === strlen($contents) || throw new \RuntimeException("임시 파일 쓰기 실패: {$tmp}");
        rename($tmp, $path) || throw new \RuntimeException("rename 실패: {$path}");
    }

    private function backup(string $path): void
    {
        if (is_file($path)) {
            $bak = $path.'.bak-'.now()->format('Ymd_His');
            copy($path, $bak);
            $this->line("백업: {$bak}");
        }
    }
}
