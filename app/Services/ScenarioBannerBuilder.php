<?php

namespace App\Services;

use App\Game\Engine;
use App\Support\Rarity;
use Illuminate\Support\Facades\DB;

/**
 * 시나리오 레지스트리(database/data/scenario_registry.json) -> 시나리오 배너(gacha_banners.json) 결정적 생성기.
 * 같은 입력(레지스트리 + 스테이지/필수 영웅 데이터 + 현재 풀)이면 항상 같은 출력(날짜·난수 독립)이라 재실행이 안전하다.
 * 풀 = 필수 영웅 + 스테이지 등장자(아군 ally_npcs/forced/join, 적 지휘관) + 레지스트리 roster/include + 등급 하한 보충 - exclude. 현재 풀에 없는 코드(승격 대기 등)는 조용히 빠지고 보고만 한다.
 * side: 필수·스테이지 아군=ally, 적 지휘관=enemy, 그 밖(include/roster/보충)=unspecified, 레지스트리 sides 로 덮어쓴다. 상세는 docs/GACHA_REQUIRED_PITY_20261108.md 3장.
 */
class ScenarioBannerBuilder
{
    public const DEFAULT_MIN = ['S' => 1, 'A' => 3, 'B' => 8, 'C' => 8];

    /** 직함형·무명 NPC 코드 제외 정규식(스테이지 등장자에만 적용) */
    public const TITLE_PATTERN = '~_(captain|chief|commander|vanguard|scout|guard|shadow|garrison|patrol|quartermaster|headman|keeper)(_|$)~';

    public function __construct(private readonly GachaService $gacha, private readonly GameData $data)
    {
    }

    public static function registryPath(): string
    {
        return config('game.gacha.registry_path') ?: database_path('data/scenario_registry.json');
    }

    /** 등급별 최소 인원: 코드 기본값 < 레지스트리 defaults.min_counts < 배너 min_counts (일부 등급만 적어도 나머지는 하위 값 유지) */
    public static function minCounts(array $entry, array $defaults = []): array
    {
        return array_merge(self::DEFAULT_MIN, $defaults, (array) ($entry['min_counts'] ?? []));
    }

    public function registry(?string $path = null): array
    {
        return (array) json_decode((string) file_get_contents($path ?: self::registryPath()), true, 512, JSON_THROW_ON_ERROR);
    }

    /** 레지스트리 항목 중 status 가 active(기본) 인 것 */
    public function isActive(array $entry): bool
    {
        return ($entry['status'] ?? 'active') === 'active';
    }

    /** @return array<string,string> code => rarity (현재 풀) */
    public function poolMap(array $pool): array
    {
        $m = [];
        foreach ($pool['by_rarity'] as $r => $list) {
            foreach ($list as $c) {
                $m[$c] = $r;
            }
        }

        return $m;
    }

    /**
     * 챕터의 스테이지 등장자. DB 스테이지가 없으면(테스트·미시드) stage_required_heroes.json 의 chN_s* 키로 스테이지 목록과 필수 영웅만 얻는다.
     *
     * @return array{stages:string[],required:string[],ally:string[],enemy:string[]}
     */
    public function appearances(int $chapter): array
    {
        $file = $this->gacha->requiredFileMap();
        $later = $this->gacha->requiredWhenObtainableMap();
        $rows = DB::table('stages')->where('chapter', $chapter)->orderBy('sort_order')->orderBy('id')->get();
        $stages = [];
        $req = [];
        $ally = [];
        $enemy = [];
        if ($rows->isEmpty()) {
            $keys = array_values(array_filter(array_unique(array_merge(array_keys($file), array_keys($later))), fn ($k) => (bool) preg_match('~^ch'.$chapter.'_s\d+$~', $k)));
            usort($keys, 'strnatcmp');
            foreach ($keys as $k) {
                $stages[] = $k;
                array_push($req, ...($file[$k] ?? []), ...($later[$k] ?? []));
            }
        }
        foreach ($rows as $s) {
            $stages[] = $s->code;
            $rules = json_decode((string) ($s->rules ?? ''), true) ?: [];
            array_push($req, ...(array) ($rules['required_heroes'] ?? $file[$s->code] ?? []), ...($later[$s->code] ?? []));
            foreach (Engine::normalizeAllyNpcs($rules['ally_npcs'] ?? null) as $n) {
                $ally[] = $n['hero'];
            }
            foreach ((array) json_decode((string) ($s->forced_heroes ?? ''), true) as $f) {
                $c = is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f;
                $c !== '' && $c[0] !== '@' && $ally[] = $c;
            }
            foreach ((array) json_decode((string) ($s->join_hero ?? ''), true) as $j) {
                $c = is_array($j) ? (string) ($j['hero_code'] ?? $j['hero'] ?? '') : '';
                $c !== '' && $ally[] = $c;
            }
            $this->walkNpcRef(json_decode((string) ($s->enemy_squad ?? ''), true), $enemy);
            if (is_string($h = $rules['enemy_commander']['hero'] ?? null) && $h !== '') {
                $enemy[] = $h;
            }
        }
        $u = fn (array $a) => array_values(array_unique(array_filter(array_map('strval', $a), fn ($c) => $c !== '' && $c[0] !== '@')));

        return ['stages' => $stages, 'required' => $u($req), 'ally' => $u($ally), 'enemy' => $u($enemy)];
    }

    private function walkNpcRef(mixed $node, array &$out): void
    {
        if (! is_array($node)) {
            return;
        }
        foreach ($node as $k => $v) {
            if ($k === 'npc_ref' && is_string($v) && $v !== '') {
                $out[] = $v;
            } elseif (is_array($v)) {
                $this->walkNpcRef($v, $out);
            }
        }
    }

    /**
     * 한 시나리오의 풀 구성(결정적).
     *
     * @param  bool  $topup  false 면 등급 하한 보충을 하지 않는다(draft 동기화용)
     * @return array{codes:string[],sides:array<string,string>,required:string[],pending_required:string[],dropped:string[],topup:string[],fallback_other_culture:string[],counts:array<string,int>,side_counts:array<string,int>,stages:string[],derived:string[]}
     */
    public function derive(array $entry, array $pool, bool $topup = true): array
    {
        $inPool = $this->poolMap($pool);
        $src = (array) ($entry['appearance_sources'] ?? ['required', 'stage_allies', 'stage_enemies']);
        $pat = (string) ($entry['exclude_title_pattern'] ?? self::TITLE_PATTERN);
        $ap = $this->appearances((int) $entry['chapter']);
        $order = [];   // code => side(기본)
        $add = function (array $codes, string $side, bool $title) use (&$order, $pat) {
            foreach ($codes as $c) {
                if ($c === '' || ($title && preg_match($pat, $c))) {
                    continue;
                }
                $order[$c] ??= $side;
            }
        };
        $requiredAll = array_values(array_unique(array_merge($ap['required'], array_map('strval', (array) ($entry['required_extra'] ?? [])))));
        in_array('required', $src, true) && $add($requiredAll, 'ally', false);
        in_array('stage_allies', $src, true) && $add($ap['ally'], 'ally', true);
        ($entry['include_enemies'] ?? true) && in_array('stage_enemies', $src, true) && $add($ap['enemy'], 'enemy', true);
        $derivedCodes = array_keys($order);
        foreach ((array) ($entry['roster'] ?? []) as $r) {
            is_array($r) ? $add([(string) ($r['code'] ?? '')], (string) ($r['side'] ?? 'unspecified'), false) : $add([(string) $r], 'unspecified', false);
        }
        $add(array_map('strval', (array) ($entry['include'] ?? [])), 'unspecified', false);
        foreach (array_map('strval', (array) ($entry['exclude'] ?? [])) as $c) {
            unset($order[$c]);
        }
        $dropped = array_values(array_filter(array_keys($order), fn ($c) => ! isset($inPool[$c])));
        $order = array_filter($order, fn ($c) => isset($inPool[$c]), ARRAY_FILTER_USE_KEY);
        $min = self::minCounts($entry);
        $topped = [];
        $fallback = [];
        if ($topup) {
            $cnt = array_count_values(array_map(fn ($c) => $inPool[$c], array_keys($order)));
            $cult = array_map('strval', (array) ($entry['cultures'] ?? []));
            $excl = array_flip(array_map('strval', (array) ($entry['exclude'] ?? [])));
            $heroes = $this->data->heroes();
            $key = (string) $entry['key'];
            foreach (Rarity::ORDER as $r) {
                $need = (int) ($min[$r] ?? 0) - ($cnt[$r] ?? 0);
                if ($need <= 0) {
                    continue;
                }
                $cands = array_values(array_filter($pool['by_rarity'][$r], fn ($c) => ! isset($order[$c]) && ! isset($excl[$c]) && ! preg_match($pat, $c)));
                $rank = fn ($c) => [(int) ! in_array($heroes[$c]['culture'] ?? '', $cult, true), crc32($key.'|'.$c), $c];
                usort($cands, fn ($a, $b) => $rank($a) <=> $rank($b));
                foreach (array_slice($cands, 0, $need) as $c) {
                    $order[$c] = 'unspecified';
                    $topped[] = $c;
                    $cult && ! in_array($heroes[$c]['culture'] ?? '', $cult, true) && $fallback[] = $c;
                }
            }
        }
        foreach ((array) ($entry['sides'] ?? []) as $c => $v) {
            in_array($v, ['ally', 'enemy', 'unspecified'], true) && isset($order[(string) $c]) && $order[(string) $c] = $v;
        }
        $idx = array_flip(array_keys($order));
        $codes = array_keys($order);
        usort($codes, fn ($a, $b) => [Rarity::rank($inPool[$a]), $idx[$a]] <=> [Rarity::rank($inPool[$b]), $idx[$b]]);
        $sides = [];
        foreach ($codes as $c) {
            $order[$c] !== 'ally' && $sides[$c] = $order[$c];
        }
        $required = array_values(array_filter($requiredAll, fn ($c) => isset($inPool[$c])));
        $counts = array_fill_keys(Rarity::ORDER, 0);
        foreach ($codes as $c) {
            $counts[$inPool[$c]]++;
        }

        return ['codes' => $codes, 'sides' => $sides, 'required' => $required, 'pending_required' => array_values(array_diff($requiredAll, $required)), 'dropped' => $dropped,
            'topup' => $topped, 'fallback_other_culture' => $fallback, 'counts' => $counts, 'stages' => $ap['stages'],
            'side_counts' => ['ally' => count($codes) - count($sides), 'enemy' => count(array_filter($sides, fn ($v) => $v === 'enemy')), 'unspecified' => count(array_filter($sides, fn ($v) => $v === 'unspecified'))],
            'derived' => $derivedCodes];
    }

    /** 쇼케이스(아군 확정자만, 등급 높은 순, 필수 우선, 최대 5) */
    public function showcase(array $entry, array $d, array $pool): array
    {
        $inPool = $this->poolMap($pool);
        $ally = fn ($c) => ! isset($d['sides'][$c]);
        $manual = array_values(array_filter(array_map('strval', (array) ($entry['showcase'] ?? [])), fn ($c) => in_array($c, $d['codes'], true) && $ally($c)));
        if ($manual) {
            return array_slice($manual, 0, 5);
        }
        $cands = array_values(array_filter($d['codes'], fn ($c) => $ally($c) && in_array($inPool[$c], ['S', 'A'], true)));
        $idx = array_flip($d['codes']);
        $req = array_flip($d['required']);
        usort($cands, fn ($a, $b) => [Rarity::rank($inPool[$a]), isset($req[$a]) ? 0 : 1, $idx[$a]] <=> [Rarity::rank($inPool[$b]), isset($req[$b]) ? 0 : 1, $idx[$b]]);

        return array_slice($cands, 0, 5);
    }

    /**
     * @return array{banners:array<int,array>,reports:array<string,array>,skipped:array<string,string>}
     */
    public function build(array $registry, array $pool): array
    {
        $defMin = (array) ($registry['defaults']['min_counts'] ?? []);
        $banners = [];
        $reports = [];
        $skipped = [];
        foreach ((array) ($registry['scenarios'] ?? []) as $e) {
            $key = (string) $e['key'];
            if (! $this->isActive($e)) {
                $skipped[$key] = (string) ($e['status'] ?? '');

                continue;
            }
            $e['min_counts'] = self::minCounts($e, $defMin);   // 레지스트리 defaults.min_counts 반영(감사 명령과 같은 기준)
            $d = $this->derive($e, $pool);
            $reports[$key] = $d;
            $banners[] = array_filter([
                'key' => $key, 'title' => (string) ($e['title'] ?? ''), 'sub' => (string) ($e['sub'] ?? ''),
                'art_key' => $e['art_key'] ?? null, 'scenario_chapter' => (int) $e['chapter'], 'scenario_refs' => $d['stages'],
                'required_heroes' => $d['required'], 'hero_codes' => $this->showcase($e, $d, $pool), 'pool_codes' => $d['codes'],
                'pool_sides' => $d['sides'] ?: null, 'pending_required' => $d['pending_required'] ?: null, 'generated' => true,
            ], fn ($v) => $v !== null);
        }

        return ['banners' => $banners, 'reports' => $reports, 'skipped' => $skipped];
    }

    /** 기존 gacha_banners.json 에 생성 결과를 반영한 새 문서(normal 등 나머지는 유지, pool_codes 없는 v1 표시 전용 배너는 승계가 끝나 제거) */
    public function compose(array $existing, array $banners): array
    {
        $doc = $existing;
        $doc['_note'] = '가챠 배너 정의 v2. 시나리오 배너는 database/data/scenario_registry.json 에서 `php artisan game:gen-scenario-banners --write` 로 생성한다(손으로 고치지 말고 레지스트리를 고칠 것). pool_codes = 그 배너의 추첨 풀(아군+적군), pool_sides = 아군이 아닌 코드의 side(enemy|unspecified), hero_codes = 쇼케이스(아군 확정자만). 로드 시 GachaService::scenarioBanners 가 검증하며 위반 배너는 비활성+로그. normal = 서고(전체 풀) 쇼케이스.';
        $doc['version'] = 2;
        $doc['banners'] = $banners;

        return $doc;
    }

    /**
     * 임밸런 초안(gacha_banners_v2_draft.json)을 레지스트리에 동기화한 새 레지스트리: key 가 같은 항목의 title/sub/art_key(있으면)/showcase/include/sides 갱신.
     * include = 초안 풀 중 스테이지에서 파생되지 않는 코드(사료 후보·보충 등), sides = 초안 side 가 기본값(파생 side, include 는 unspecified)과 다른 코드.
     *
     * @return array{registry:array,matched:string[],unmatched:string[]}
     */
    public function syncFromDraft(array $registry, array $draft, array $pool): array
    {
        $byKey = [];
        foreach ((array) ($draft['banners'] ?? []) as $b) {
            $byKey[(string) $b['key']] = $b;
        }
        $matched = [];
        foreach ($registry['scenarios'] as $i => $e) {
            $b = $byKey[(string) $e['key']] ?? null;
            if ($b === null) {
                continue;
            }
            $matched[] = $e['key'];
            $base = $e;
            unset($base['include'], $base['sides'], $base['roster'], $base['showcase']);
            $d = $this->derive($base, $pool, false);
            $derived = array_flip($d['derived']);
            $include = [];
            $sides = [];
            foreach ((array) $b['pool_codes'] as $row) {
                $c = (string) $row['code'];
                $want = (string) ($row['side'] ?? 'unspecified');
                if (! isset($derived[$c])) {
                    $include[] = $c;
                    $want !== 'unspecified' && $sides[$c] = $want;
                } elseif ($want !== ($d['sides'][$c] ?? 'ally')) {
                    $sides[$c] = $want;
                }
            }
            $e['title'] = (string) ($b['title'] ?? $e['title'] ?? '');
            $e['sub'] = (string) ($b['sub'] ?? $e['sub'] ?? '');
            ! empty($b['art_key']) && $e['art_key'] = (string) $b['art_key'];
            $e['include'] = array_values(array_unique($include));
            $e['sides'] = $sides;
            $e['showcase'] = array_values(array_map('strval', (array) ($b['showcase_codes'] ?? [])));
            $registry['scenarios'][$i] = $e;
        }

        return ['registry' => $registry, 'matched' => $matched, 'unmatched' => array_values(array_diff(array_keys($byKey), $matched))];
    }
}
