<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Support\Rarity;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Facades\Schema;

/**
 * 가챠. 풀·확률·가격은 database/data/gacha_pool.json(가정 시작값)이 단일 출처이며, 조회 API와 추첨이 같은 값을 쓴다.
 * 추첨은 서버가 전부 결정(random_int). 차감·지급·로그는 한 트랜잭션, 멱등키 = (user_id, request_id).
 */
class GachaService
{
    public function __construct(private readonly GameData $data, private readonly ProgressionService $progress)
    {
    }

    public static function enabled(): bool
    {
        return (bool) config('game.gacha.enabled', false);
    }

    public function assertEnabled(): void
    {
        if (! self::enabled()) {
            throw new IllegalAction('gacha_disabled', '가챠가 활성화되어 있지 않습니다.', 404);
        }
    }

    /**
     * 풀 로드 + 검증(확률 합 100, 코드 존재, 등급별 1명 이상).
     *
     * @return array{version:int,rates:array<string,float>,price:array,pity:array,shards:array<string,int>,by_rarity:array<string,string[]>}
     */
    public function pool(): array
    {
        $raw = json_decode(file_get_contents(config('game.gacha.pool_path') ?: database_path('data/gacha_pool.json')), true, 512, JSON_THROW_ON_ERROR);
        $rates = [];
        foreach (Rarity::ORDER as $r) {
            $rates[$r] = (float) ($raw['rates_pct'][$r] ?? throw new \RuntimeException("gacha_pool: rates_pct.$r 없음"));
            ($rates[$r] >= 0) || throw new \RuntimeException('gacha_pool: 음수 확률');
        }
        abs(array_sum($rates) - 100.0) < 1e-9 || throw new \RuntimeException('gacha_pool: 확률 합이 100이 아닙니다.');
        $heroes = $this->data->heroes();
        $exclude = array_flip($raw['exclude_codes'] ?? []);
        $by = array_fill_keys(Rarity::ORDER, []);
        $codes = $raw['hero_codes'];
        if (! empty($raw['include_campaign_npc'])) {   // 승격 NPC(npc_* 이면서 campaign_only 해제 = 플레이 가능, 주인공 원형 제외)만 풀에 포함. campaign_only=1 NPC(돌 아주머니·수레·무명 병사 등)는 포함하지 않는다
            foreach ($heroes as $c => $h) {
                if (str_starts_with((string) $c, 'npc_') && empty($h['campaign_only']) && empty($h['is_protagonist'])) {
                    $codes[] = $c;
                }
            }
        }
        if (! empty($raw['include_hero_expansion'])) {   // 신규 영웅 확장(보류 제외). DB에 없는 code는 건너뜀
            foreach (array_keys(\App\Support\HeroExpansion::raw()) as $c) {
                isset($heroes[$c]) && $codes[] = $c;
            }
        }
        if (! empty($raw['include_hero_wave3'])) {   // 3차 확장 신규 영웅(game:seed-hero-wave3). DB에 아직 없는 code는 건너뜀(campaign_only 는 아래에서 걸러짐)
            foreach (\App\Support\HeroWave3::newCodes() as $c) {
                isset($heroes[$c]) && $codes[] = $c;
            }
        }
        foreach (array_keys(\App\Support\GachaNamedNpc::readySet()) as $c) {   // version 7: 이름 있는 NPC 영웅(named_npc.ready_codes). pending 은 준비 완료 전이라 제외. DB에 없는 code는 건너뜀
            isset($heroes[$c]) && $codes[] = $c;
        }
        foreach (array_unique($codes) as $code) {
            if (isset($exclude[$code]) || array_filter((array) ($raw['exclude_patterns'] ?? []), fn ($pat) => fnmatch((string) $pat, (string) $code))) {   // exclude_codes(정확 일치) + exclude_patterns(fnmatch: 호송/장애물 NPC 일반 규칙, 예 npc_cart*)
                continue;
            }
            isset($heroes[$code]) || throw new \RuntimeException("gacha_pool: 알 수 없는 영웅 $code");
            if (! empty($heroes[$code]['campaign_only']) || ! empty($heroes[$code]['is_protagonist'])) {   // 캠페인 전용·주인공 원형은 hero_codes 에 있어도 뽑기 풀에서 제외(플레이 가능 영웅만)
                continue;
            }
            $by[Rarity::normalize($heroes[$code]['rarity'])][] = $code;
        }
        $shards = [];
        foreach (Rarity::ORDER as $r) {
            ($rates[$r] <= 0 || $by[$r] !== []) || throw new \RuntimeException("gacha_pool: 등급 $r 영웅 없음");
            sort($by[$r]);
            $shards[$r] = (int) ($raw['duplicate_shards'][$r] ?? 0);
        }

        return ['version' => (int) $raw['version'], 'rates' => $rates, 'price' => ['single' => (int) $raw['price']['single'], 'ten' => (int) $raw['price']['ten']],
            'pity' => $raw['pity'], 'shards' => $shards, 'by_rarity' => $by];
    }

    private function heroView(string $code): array
    {
        $h = $this->data->heroes()[$code];

        return ['hero' => $code, 'name' => $h['name_ko'], 'title' => $h['title'], 'short_name' => $h['short_name'], 'display_name' => $h['display_name'], 'rarity' => $h['rarity'], 'unit_type' => $h['unit_type']];
    }

    /** 도감 표시용 추가 필드. profile 은 history 데이터가 있을 때만(summary 는 전문: 128명 합계 약 2만 자라 별도 엔드포인트 없이 목록에 포함) */
    private function codexExtra(string $code): array
    {
        $out = ['culture' => $this->data->heroes()[$code]['culture'] ?? null];
        $p = $this->data->heroProfile($code);
        if ($p !== null && (($p['one_line'] ?? null) || ($p['summary'] ?? null))) {
            $out['profile'] = ['one_line' => $p['one_line'] ?? null, 'summary' => $p['summary'] ?? null];
        }

        return $out;
    }

    /** @var array<string,mixed>|null GET /api/gacha 한 번 동안만 켜지는 요청 범위 메모(null=끔 -> 항상 재계산). 뽑기 경로는 쓰지 않아 낡은 값 위험 없음 */
    private ?array $memo = null;

    private function memo(string $key, \Closure $fn): mixed
    {
        if ($this->memo === null) {
            return $fn();
        }

        return array_key_exists($key, $this->memo) ? $this->memo[$key] : ($this->memo[$key] = $fn());
    }

    /** GET /api/gacha 본문 */
    public function info(int $userId): array
    {
        $own = $this->memo === null;
        $own && $this->memo = [];
        try {
            return $this->infoBody($userId);
        } finally {
            $own && $this->memo = null;
        }
    }

    private function infoBody(int $userId): array
    {
        $pool = $this->pool();
        $owned = DB::table('user_heroes')->where('user_id', $userId)->pluck('hero_id')->flip();
        $heroes = [];
        $unaff = $this->unaffiliatedSet($pool);
        $rarityRows = [];
        foreach (Rarity::ORDER as $r) {
            $n = count($pool['by_rarity'][$r]);
            $rarityRows[] = ['rarity' => $r, 'rate_pct' => $pool['rates'][$r], 'hero_count' => $n, 'per_hero_rate_pct' => $n ? round($pool['rates'][$r] / $n, 6) : 0.0, 'duplicate_shards' => $pool['shards'][$r]];
            foreach ($pool['by_rarity'][$r] as $code) {
                $heroes[] = $this->heroView($code) + ['owned' => isset($owned[$this->data->heroes()[$code]['id']]), 'unaffiliated' => isset($unaff[$code])] + $this->codexExtra($code);   // 도감용: culture, profile{one_line,summary(전문)}(데이터 있을 때만)
            }
        }
        $pity = (int) (DB::table('gacha_user_states')->where('user_id', $userId)->value('pity_counter') ?? 0);
        $banners = $this->banners($pool, $userId, $owned);
        usort($heroes, fn ($a, $b) => [isset($unaff[$a['hero']]) ? 0 : 1, Rarity::rank($a['rarity'])] <=> [isset($unaff[$b['hero']]) ? 0 : 1, Rarity::rank($b['rarity'])]);   // 서고 풀 구성 목록: 비소속 먼저, 등급순(안정 정렬)

        return [
            'enabled' => true, 'pool_version' => $pool['version'], 'rates' => $rarityRows,
            'currency' => self::currency(), 'price' => self::currency() === 'pen' ? self::penPrice() : $pool['price'],   // price = 현재 결제 통화 기준 가격(gold 모드면 기존과 동일)
            'price_gold' => $pool['price'], 'price_pen' => self::penPrice(), 'pen' => $this->pen($userId),
            'pity' => ['rule' => $pool['pity']['rule'], 'min_rarity' => $pool['pity']['min_rarity'], 'applies_to_count' => (int) $pool['pity']['applies_to_count'], 'progress' => $pity],
            'required_pity' => $this->requiredPityInfo($userId, $pool, $owned),
            'hero_count_unaffiliated' => $this->unaffiliatedCount($pool),   // 어떤 시나리오 배너 풀에도 속하지 않은 영웅 수 {total, by_rarity}(서고 전용)
            'gold' => $this->gold($userId), 'heroes' => $heroes, 'banners' => $banners,
            // 안내: 지금 막힌 다음 스테이지의 미보유 필수 영웅이 속한 시나리오 배너 key 목록(없으면 []). 배너별 blocking 플래그와 같은 값
            'blocking_banners' => array_values(array_map(fn ($b) => $b['key'], array_filter($banners, fn ($b) => ! empty($b['blocking'])))),
        ];
    }

    /**
     * 배너 표시 정의(database/data/gacha_banners.json). 확률·풀에는 영향 없음(표시용). 현재 풀에 없는 코드는 제외.
     * 일반 소환(normal)은 KST 날짜 기준으로 풀의 지정 등급(S/A) 영웅 N명을 결정적으로 고른다(같은 날 같은 결과).
     *
     * @return array<int,array{key:string,title:string,sub:string,hero_codes:string[]}>
     */
    public function banners(array $pool, ?int $userId = null, $owned = null): array
    {
        $own = $this->memo === null;
        $own && $this->memo = [];
        try {
            return $this->bannersBody($pool, $userId, $owned);
        } finally {
            $own && $this->memo = null;
        }
    }

    private function bannersBody(array $pool, ?int $userId = null, $owned = null): array
    {
        $path = config('game.gacha.banners_path') ?: database_path('data/gacha_banners.json');
        if (! is_file($path)) {
            return [];
        }
        try {
            $raw = json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return [];
        }
        $inPool = array_flip(array_merge(...array_values($pool['by_rarity'])));
        $scenario = $this->scenarioBanners($pool);
        $ownedMap = $owned ?? ($userId !== null ? DB::table('user_heroes')->where('user_id', $userId)->pluck('hero_id')->flip() : collect());
        $targets = ($scenario && $userId !== null) ? $this->requiredTargets($userId, $pool, $ownedMap) : [];   // 부스트·천장 ON/OFF 와 무관하게 '막힌 스테이지' 안내(blocking)에 쓴다
        $out = [];
        foreach ((array) ($raw['banners'] ?? []) as $b) {
            if (! is_array($b) || empty($b['key'])) {
                continue;
            }
            if (! array_key_exists('pool_codes', $b)) {   // v1 표시 전용 배너: 아래 두 번째 패스에서 시나리오 배너 뒤에 붙인다(같은 key 의 시나리오 배너가 있으면 그쪽 우선)
                continue;
            }
            // v2 시나리오 배너: 검증 통과한 것만 노출(위반은 비활성)
            $sb = $scenario[(string) $b['key']] ?? null;
            if ($sb === null) {
                continue;
            }
            {
                $isAlly = fn ($c) => ! isset($sb['sides'][$c]);   // 쇼케이스·대표 표시는 아군 확정자만(적군/미확정은 추첨 풀에만 포함)
                $show = array_values(array_filter((array) ($b['hero_codes'] ?? []), fn ($c) => isset($inPool[$c]) && in_array($c, $sb['codes'], true) && $isAlly($c)));
                if (! $show) {   // 쇼케이스 미지정이면 풀의 S, A 등급 앞쪽 아군 영웅
                    $draw = $this->drawPool($pool, array_values(array_filter($sb['codes'], $isAlly)) ?: $sb['codes']);
                    $show = array_slice(array_merge($draw['by_rarity']['S'], $draw['by_rarity']['A']), 0, 5);
                }
                $out[] = ['key' => (string) $b['key'], 'title' => (string) ($b['title'] ?? ''), 'sub' => (string) ($b['sub'] ?? ''), 'hero_codes' => $show, 'art_key' => isset($b['art_key']) ? (string) $b['art_key'] : null]
                    + $this->bannerDetail($sb, $pool, $userId, $ownedMap, $targets);   // art_key: 일러스트 키 별칭(선택, FE 사용)
            }
        }
        $have = array_flip(array_column($out, 'key'));
        foreach ((array) ($raw['banners'] ?? []) as $b) {   // v1 호환(표시 전용, 확률·풀 영향 없음)
            if (is_array($b) && ! empty($b['key']) && ! array_key_exists('pool_codes', $b) && ! isset($have[(string) $b['key']])) {
                $out[] = ['key' => (string) $b['key'], 'title' => (string) ($b['title'] ?? ''), 'sub' => (string) ($b['sub'] ?? ''),
                    'hero_codes' => array_values(array_filter((array) ($b['hero_codes'] ?? []), fn ($c) => isset($inPool[$c])))];
            }
        }
        if (is_array($raw['normal'] ?? null)) {
            $n = $raw['normal'];
            $unaff = $this->unaffiliatedSet($pool);
            $day = now('Asia/Seoul')->format('Y-m-d');
            $pick = fn (array $rs, bool $u) => (function () use ($rs, $u, $pool, $unaff, $day) {
                $c = [];
                foreach ($rs as $r) {
                    foreach ($pool['by_rarity'][$r] ?? [] as $x) {
                        isset($unaff[$x]) === $u && $c[] = $x;
                    }
                }
                usort($c, fn ($x, $y) => [crc32($day.$x), $x] <=> [crc32($day.$y), $y]);

                return $c;
            })();
            // 서고 쇼케이스: S급만, 비소속 S 우선 -> 부족하면 소속 S로 보충(A 이하는 쓰지 않음, KST 날짜 기준 결정적)
            $cands = array_values(array_unique(array_merge($this->diversify($pick(['S'], true), $day), $this->diversify($pick(['S'], false), $day))));   // 병종 필터 없음, 영웅 직업(heroes.unit_type: 마법사·치유사 포함 7종) 라운드로빈으로 쏠림 방지
            $out[] = ['key' => (string) ($n['key'] ?? 'normal'), 'title' => (string) ($n['title'] ?? ''), 'sub' => (string) ($n['sub'] ?? ''),
                'hero_codes' => $sc = array_slice($cands, 0, max(0, (int) ($n['pick'] ?? 5))),
                'showcase' => array_map(fn ($c) => $this->heroView($c), $sc)];   // 직업(unit_type) 표기용
        }

        return $out;
    }

    private function gold(int $userId): int
    {
        return (int) (DB::table('wallets')->where('user_id', $userId)->where('currency_code', 'gold')->value('balance') ?? 0);
    }

    private function pen(int $userId): int
    {
        return (int) (DB::table('wallets')->where('user_id', $userId)->where('currency_code', 'pen')->value('balance') ?? 0);
    }

    /** 뽑기 결제 통화(config game.gacha.currency: gold|pen, 그 외 값은 gold). 기본 gold = 기존 동작 */
    public static function currency(): string
    {
        return config('game.gacha.currency', 'gold') === 'pen' ? 'pen' : 'gold';
    }

    /** @return array{single:int,ten:int} 펜 가격(config game.gacha.pen_price, 후보 B 기본 5/45) */
    public static function penPrice(): array
    {
        $p = (array) config('game.gacha.pen_price', []);

        return ['single' => max(1, (int) ($p['single'] ?? 5)), 'ten' => max(1, (int) ($p['ten'] ?? 45))];
    }

    /** gacha_pulls 에 결제 통화·펜 사용량 컬럼(마이그레이션 2026_11_14_000100)이 있는지. 없으면 펜 결제는 쓰기 전에 거부한다 */
    private function currencyCols(): bool
    {
        static $c = null;

        return $c ??= Schema::hasColumn('gacha_pulls', 'pay_currency') && Schema::hasColumn('gacha_pulls', 'pen_spent');
    }

    /** 필수 영웅 소프트 천장 설정. enabled=false 면 기존 동작 그대로(K=0 이거나 컬럼 미마이그레이션) */
    private function requiredCfg(?string $banner = null): array
    {
        static $col = null;
        $col ??= Schema::hasColumn('gacha_user_states', 'required_pity_counters') && Schema::hasColumn('gacha_pulls', 'required_pity_before');
        $ov = $banner !== null ? (array) (config('game.gacha.banner_overrides', [])[$banner] ?? []) : [];   // 배너별 차등 훅: config game.gacha.banner_overrides[<배너 key>] = ['required_pity'=>K, 'required_boost'=>N] (기본 없음 = 전역 값)
        $k = max(0, (int) ($ov['required_pity'] ?? config('game.gacha.required_pity', 30)));

        return ['enabled' => $col && $k > 0, 'k' => $k, 'boost' => max(1, (int) ($ov['required_boost'] ?? config('game.gacha.required_boost', 5))), 'column' => $col];
    }

    /** stage_required_heroes.json 의 stage_code => hero_code[] (DB rules.required_heroes 가 아직 없을 때의 대체 출처) */
    public function requiredFileMap(): array
    {
        $path = config('game.gacha.required_path') ?: database_path('data/stage_required_heroes.json');
        $raw = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        $out = [];
        foreach ((array) $raw as $k => $v) {
            if (is_string($k) && $k !== '' && $k[0] !== '_' && is_array($v) && ! in_array($k, ['unobtainable_story_figures', 'required_when_obtainable'], true)) {
                $out[$k] = array_values(array_filter($v, fn ($c) => is_string($c) && $c !== '' && $c[0] !== '@'));
            }
        }

        return $out;
    }

    /** stage_required_heroes.json 의 required_when_obtainable: stage_code => hero_code[] (풀 편입 대기 중인 필수 후보. 시나리오 배너 생성기가 참조) */
    public function requiredWhenObtainableMap(): array
    {
        $path = config('game.gacha.required_path') ?: database_path('data/stage_required_heroes.json');
        $raw = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        $out = [];
        foreach ((array) ($raw['required_when_obtainable'] ?? []) as $k => $v) {
            if (is_string($k) && $k !== '' && $k[0] !== '_' && is_array($v)) {
                $out[$k] = array_values(array_filter($v, fn ($c) => is_string($c) && $c !== '' && $c[0] !== '@'));
            }
        }

        return $out;
    }

    /**
     * 다음에 막힐 스테이지의 '미보유 필수 영웅 중 풀에 있는 영웅' 코드(순서 유지). 없으면 [].
     * 후보 = 미클리어이고 선행이 없거나 '통과 가능'한 스테이지를 sort_order,id 순으로 보아, 미보유 필수 영웅이 있는 첫 스테이지.
     * 통과 가능 = 클리어함, 또는 (필수 영웅을 모두 보유 + 선행도 통과 가능) -> 필수 영웅을 모은 스테이지 뒤를 한 칸씩 미리 내다본다.
     *
     * @param \Illuminate\Support\Collection $ownedHeroIds hero id => 키
     * @return string[]
     */
    private function requiredTargets(int $userId, array $pool, $ownedHeroIds): array
    {
        $inPool = [];
        foreach ($pool['by_rarity'] as $list) {
            foreach ($list as $c) {
                $inPool[$c] = true;
            }
        }
        $heroes = $this->data->heroes();
        [$stages, $byId, $req] = $this->memo('stageReqMap', function () use ($heroes) {   // 유저와 무관한 스테이지 순서·필수 영웅 맵(요청 범위 캐시)
            $file = $this->requiredFileMap();
            $stages = DB::table('stages')->orderBy('sort_order')->orderBy('id')->get(['id', 'code', 'prerequisite_stage_id', 'rules']);
            $req = [];
            $byId = [];
            foreach ($stages as $s) {
                $byId[$s->id] = $s;
                $codes = (json_decode((string) $s->rules, true) ?: [])['required_heroes'] ?? $file[$s->code] ?? [];
                $req[$s->id] = array_values(array_filter((array) $codes, fn ($c) => is_string($c) && isset($heroes[$c])));
            }

            return [$stages, $byId, $req];
        });
        $cleared = DB::table('user_stage_progress')->where('user_id', $userId)->where('clear_count', '>', 0)->pluck('stage_id')->flip();
        $owned = fn (string $c) => isset($ownedHeroIds[$heroes[$c]['id']]);
        $memo = [];
        $passable = function (int $id) use (&$passable, &$memo, $byId, $cleared, $req, $owned): bool {
            if (isset($memo[$id])) {
                return $memo[$id];
            }
            $memo[$id] = false;   // 순환 방지
            $s = $byId[$id] ?? null;
            if (! $s) {
                return false;
            }

            return $memo[$id] = isset($cleared[$id]) || (! array_filter($req[$id], fn ($c) => ! $owned($c)) && ($s->prerequisite_stage_id === null || $passable((int) $s->prerequisite_stage_id)));
        };
        foreach ($stages as $s) {
            if (isset($cleared[$s->id]) || ($s->prerequisite_stage_id !== null && ! $passable((int) $s->prerequisite_stage_id))) {
                continue;
            }
            $need = array_values(array_filter($req[$s->id], fn ($c) => ! $owned($c) && isset($inPool[$c])));
            if ($need) {
                return $need;
            }
        }

        return [];
    }

    /** 대상 영웅의 1회 뽑기 실효 확률(%): 같은 등급 안에서 대상만 boost 배 가중 */
    private function boostedRates(array $pool, array $targets, int $boost): array
    {
        $out = [];
        foreach (Rarity::ORDER as $r) {
            $list = $pool['by_rarity'][$r];
            $t = array_values(array_intersect($targets, $list));
            if (! $t) {
                continue;
            }
            $sum = count($list) - count($t) + count($t) * $boost;
            foreach ($t as $c) {
                $out[$c] = ['rarity' => $r, 'base_rate_pct' => round($pool['rates'][$r] / count($list), 6), 'effective_rate_pct' => round($pool['rates'][$r] * $boost / $sum, 6)];
            }
        }

        return $out;
    }

    /** 확률 공시용 블록(info 응답 required_pity) */
    private function requiredPityInfo(int $userId, array $pool, $owned): array
    {
        $cfg = $this->requiredCfg();
        $base = ['enabled' => $cfg['enabled'], 'applies_in_library' => (bool) config('game.gacha.required_library', false), 'threshold' => $cfg['k'], 'boost_multiplier' => $cfg['boost'], 'progress' => 0, 'targets' => [],
            'rule' => '다음에 진행할 스테이지의 필수 영웅을 아직 얻지 못했다면, 그 영웅은 같은 등급 안에서 뽑힐 확률이 '.$cfg['boost'].'배로 높아집니다. 또한 필수 영웅을 얻지 못한 채 '.$cfg['k'].'회를 뽑으면 다음 뽑기에서 그 영웅이 확정으로 나옵니다. 필수 영웅을 얻으면 횟수는 처음부터 다시 셉니다.'];
        if (! $cfg['enabled'] || ! $base['applies_in_library']) {   // 서고에서 OFF 면 서고용 대상 목록은 비운다(시나리오 배너 응답에 배너별 대상이 있다)
            return $base;
        }
        $targets = $this->requiredTargets($userId, $pool, $owned);
        $eff = $this->boostedRates($pool, $targets, $cfg['boost']);
        foreach ($targets as $c) {
            $base['targets'][] = $this->heroView($c) + ($eff[$c] ?? []);
        }
        $cnt = $this->requiredCounters($userId);
        foreach ($base['targets'] as &$tg) {
            $tg['progress'] = (int) ($cnt[$tg['hero']] ?? 0);   // 이 영웅이 나올 수 있는 풀에서 미획득으로 쌓인 뽑기 수(유저x영웅)
        }
        unset($tg);
        $base['progress'] = $base['targets'] ? $base['targets'][0]['progress'] : 0;   // 첫 대상 기준(하위 호환 표시용)

        return $base;
    }

    private function bannerCol(): bool
    {
        static $c = null;

        return $c ??= Schema::hasColumn('gacha_pulls', 'banner_key');
    }

    private function bannerRaw(): array
    {
        $path = config('game.gacha.banners_path') ?: database_path('data/gacha_banners.json');
        if (! is_file($path)) {
            return [];
        }
        try {
            return (array) json_decode((string) file_get_contents($path), true, 512, JSON_THROW_ON_ERROR);
        } catch (\Throwable) {
            return [];
        }
    }

    /**
     * 시나리오 배너(gacha_banners.json v2: pool_codes 가 있는 배너)의 검증된 정의. pool_codes 없는 v1 배너는 표시 전용이라 여기에 없다.
     * 검증: 모든 pool_codes 가 전체 풀(campaign_only=0 포함)에 있고, required_heroes 전원이 pool_codes 안에 있으며, 확률 > 0 인 등급마다 최소 인원,
     * 풀 크기 상한(game.gacha.banner_min_per_rarity 기본 1, banner_max_pool 기본 150). 위반 시 해당 배너만 비활성 + 경고 로그. banner_key 컬럼이 없으면 전부 비활성.
     *
     * pool_sides(선택): code => 'enemy'|'unspecified' (없는 코드 = 아군 확정). 적군은 추첨 풀에 포함되지만 쇼케이스·기본 목록에서는 가려진다.
     *
     * @return array<string,array{codes:string[],def:array,sides:array<string,string>}>
     */
    private function scenarioBanners(array $pool): array
    {
        return $this->memo('scenarioBanners', function () use ($pool) {
            $r = $this->scenarioBannersEval($pool);
            foreach ($r['bad'] as $key => $why) {
                Log::warning("gacha banner disabled: {$key} - {$why}");
            }

            return $r['ok'];
        });
    }

    /** 비활성 사유만 보고 싶을 때(감사 명령): key => 사유 */
    public function scenarioBannerProblems(array $pool): array
    {
        return $this->scenarioBannersEval($pool)['bad'];
    }

    /** @return array{ok:array<string,array>,bad:array<string,string>} */
    private function scenarioBannersEval(array $pool): array
    {
        if (! $this->bannerCol()) {
            return ['ok' => [], 'bad' => []];
        }
        $inFull = [];
        foreach ($pool['by_rarity'] as $r => $list) {
            foreach ($list as $c) {
                $inFull[$c] = $r;
            }
        }
        $out = [];
        $disabled = [];
        foreach ((array) ($this->bannerRaw()['banners'] ?? []) as $b) {
            if (! is_array($b) || empty($b['key']) || ! array_key_exists('pool_codes', $b)) {
                continue;
            }
            $key = (string) $b['key'];
            $codes = array_values(array_unique(array_map('strval', (array) $b['pool_codes'])));
            $why = null;
            if (isset($out[$key]) || $key === 'normal') {
                $why = '배너 key 중복/예약어';
            } elseif (count($codes) > (int) config('game.gacha.banner_max_pool', 150)) {
                $why = '풀 크기 상한 초과';
            } elseif ($bad = array_values(array_filter($codes, fn ($c) => ! isset($inFull[$c])))) {
                $why = '풀에 없거나 캠페인 전용인 영웅: '.implode(',', array_slice($bad, 0, 5));
            } elseif ($miss = array_values(array_diff(array_map('strval', (array) ($b['required_heroes'] ?? [])), $codes))) {
                $why = 'required_heroes 가 pool_codes 에 없음: '.implode(',', array_slice($miss, 0, 5));
            } else {
                $cnt = array_count_values(array_map(fn ($c) => $inFull[$c], $codes));
                foreach (Rarity::ORDER as $r) {
                    if ($pool['rates'][$r] > 0 && ($cnt[$r] ?? 0) < (int) config('game.gacha.banner_min_per_rarity', 1)) {
                        $why = "등급 $r 인원 부족";
                        break;
                    }
                }
            }
            if ($why !== null) {
                $disabled[$key] ??= $why;

                continue;
            }
            $sides = array_filter((array) ($b['pool_sides'] ?? []), fn ($v, $c) => in_array($v, ['enemy', 'unspecified'], true) && in_array((string) $c, $codes, true), ARRAY_FILTER_USE_BOTH);
            $out[$key] = ['codes' => $codes, 'def' => $b, 'sides' => array_map('strval', $sides)];
        }

        return ['ok' => $out, 'bad' => $disabled];
    }

    /** 영웅 직업(heroes.unit_type, 부대 병종 troop_type 아님)별 라운드로빈으로 섞는다(입력 순서=날짜 해시 순서 유지, 병종 그룹 순서도 날짜 해시로 결정적) */
    private function diversify(array $codes, string $day): array
    {
        $g = [];
        foreach ($codes as $c) {
            $g[$this->data->heroes()[$c]['unit_type']][] = $c;
        }
        uksort($g, fn ($x, $y) => [crc32($day.$x), $x] <=> [crc32($day.$y), $y]);
        $out = [];
        while ($g) {
            foreach ($g as $k => $list) {
                $out[] = array_shift($g[$k]);
                $g[$k] || $g = array_diff_key($g, [$k => 1]);
            }
        }

        return $out;
    }

    /** 비소속 = 풀 - 모든 시나리오 배너 풀의 합집합. code => true */
    private function unaffiliatedSet(array $pool): array
    {
        $in = [];
        foreach ($this->scenarioBanners($pool) as $sb) {
            foreach ($sb['codes'] as $c) {
                $in[$c] = true;
            }
        }
        $out = [];
        foreach ($pool['by_rarity'] as $list) {
            foreach ($list as $c) {
                isset($in[$c]) || $out[$c] = true;
            }
        }

        return $out;
    }

    /** @return array{total:int,by_rarity:array<string,int>} */
    private function unaffiliatedCount(array $pool): array
    {
        $u = $this->unaffiliatedSet($pool);
        $by = [];
        foreach (Rarity::ORDER as $r) {
            $by[$r] = count(array_filter($pool['by_rarity'][$r], fn ($c) => isset($u[$c])));
        }

        return ['total' => count($u), 'by_rarity' => $by];
    }

    /** 뽑는 풀의 등급 확률(%)을 존재하는 등급 기준으로 정규화(drawRarity 의 상대 가중과 동일) */
    private function normalizedRates(array $draw): array
    {
        $w = [];
        foreach (Rarity::ORDER as $r) {
            $w[$r] = $draw['by_rarity'][$r] ? (int) round($draw['rates'][$r] * 100) : 0;
        }
        $sum = array_sum($w) ?: 1;

        return array_map(fn ($v) => round($v * 100 / $sum, 6), $w);
    }

    /** GET /api/gacha 의 시나리오 배너 확장 필드 */
    private function bannerDetail(array $sb, array $pool, ?int $userId, $owned, array $nextTargets): array
    {
        $draw = $this->drawPool($pool, $sb['codes']);
        $rates = $this->normalizedRates($draw);
        $heroes = $this->data->heroes();
        $rows = [];
        $summary = [];
        $list = [];
        foreach (Rarity::ORDER as $r) {
            $n = count($draw['by_rarity'][$r]);
            $summary[$r] = $n;
            $rows[] = ['rarity' => $r, 'rate_pct' => $rates[$r], 'hero_count' => $n, 'per_hero_rate_pct' => $n ? round($rates[$r] / $n, 6) : 0.0];
            foreach ($draw['by_rarity'][$r] as $c) {
                $side = ($sb['sides'][$c] ?? 'ally') === 'enemy' ? 'enemy' : 'ally';   // 응답 side: ally|enemy(미확정은 ally 로 표시하되 쇼케이스에서는 제외). 적군도 확률 계산에는 포함, default_visible=false 로 기본 목록에서만 숨김
                $list[] = $this->heroView($c) + ['side' => $side, 'default_visible' => $side === 'ally'] + ($userId !== null ? ['owned' => isset($owned[$heroes[$c]['id']])] : []);
            }
        }
        $req = array_values(array_map('strval', (array) ($sb['def']['required_heroes'] ?? [])));
        $reqOwned = $userId !== null ? count(array_filter($req, fn ($c) => isset($heroes[$c]) && isset($owned[$heroes[$c]['id']]))) : 0;
        $cfg = $this->requiredCfg((string) ($sb['def']['key'] ?? ''));
        $tg = array_values(array_intersect($nextTargets, $sb['codes']));
        $eff = $this->boostedRates(['by_rarity' => $draw['by_rarity'], 'rates' => $rates] + $draw, $tg, $cfg['boost']);
        $cnt = $userId !== null ? $this->requiredCounters($userId) : [];
        $tgRows = [];
        foreach ($tg as $c) {
            $tgRows[] = $this->heroView($c) + ($eff[$c] ?? []) + ['progress' => (int) ($cnt[$c] ?? 0)];
        }

        return ['scenario' => true, 'scenario_refs' => (array) ($sb['def']['scenario_refs'] ?? []), 'pool_summary' => $summary, 'rates' => $rows, 'pool_heroes' => $list,
            'pool_side_counts' => ['ally' => count(array_filter($list, fn ($x) => $x['side'] === 'ally')), 'enemy' => count(array_filter($list, fn ($x) => $x['side'] === 'enemy'))],
            'blocking' => $tg !== [],   // 현재 막힌 다음 스테이지의 미보유 필수 영웅이 이 배너 풀에 있음(부스트·천장 ON/OFF 와 무관)
            'recommended' => $cfg['enabled'] && $tg !== [], 'required_heroes' => $req, 'required_owned' => $reqOwned, 'required_total' => count($req),
            'required_pity' => ['enabled' => $cfg['enabled'], 'threshold' => $cfg['k'], 'boost_multiplier' => $cfg['boost'], 'targets' => $tgRows]];
    }

    /** 유저별 필수 영웅 카운터 map(hero_code => 누적 미획득 뽑기 수) */
    private function requiredCounters(int $userId): array
    {
        return $this->memo('counters:'.$userId, function () use ($userId) {
            $raw = DB::table('gacha_user_states')->where('user_id', $userId)->value('required_pity_counters');

            return array_map('intval', (array) (is_string($raw) ? json_decode($raw, true) : []));
        });
    }

    /**
     * 이번 뽑기에서 실제로 추첨하는 풀. 지금은 전체 풀 그대로($codes=null). 시나리오 배너 풀 제도가 들어오면 banner 의 영웅 코드 목록을 $codes 로 넘기면 된다
     * (pull()/pullTx() 가 draw 풀만 쓰도록 분리돼 있음: 확률 추첨·부스트·천장 확정·카운트는 모두 draw 풀 기준, 대상 판정은 전체 풀 기준).
     * 영웅이 없는 등급은 확률 0 으로 두고(drawRarity 는 상대 가중으로 정규화) 10연 최소 등급 보장은 high 등급이 풀에 없으면 건너뛴다.
     */
    private function drawPool(array $pool, ?array $codes = null): array
    {
        if ($codes === null) {
            return $pool;
        }
        $allow = array_flip($codes);
        foreach (Rarity::ORDER as $r) {
            $pool['by_rarity'][$r] = array_values(array_filter($pool['by_rarity'][$r], fn ($c) => isset($allow[$c])));
            $pool['by_rarity'][$r] === [] && $pool['rates'][$r] = 0.0;
        }
        array_sum($pool['rates']) > 0 || throw new \RuntimeException('gacha: 배너 풀이 비어 있습니다.');

        return $pool;
    }

    /** 등급 안에서 영웅 1명 선택. 대상이 있으면 boost 배 가중, 없으면 균등(기존과 동일한 random_int 호출) */
    private function pickCode(array $list, array $targets, int $boost): string
    {
        $t = $boost > 1 ? array_flip(array_intersect($targets, $list)) : [];
        if (! $t) {
            return $list[random_int(0, count($list) - 1)];
        }
        $roll = random_int(1, count($list) - count($t) + count($t) * $boost);
        foreach ($list as $c) {
            if (($roll -= isset($t[$c]) ? $boost : 1) <= 0) {
                return $c;
            }
        }

        return end($list);
    }

    /** CSPRNG 등급 추첨(0.01% 단위) */
    private function drawRarity(array $rates, ?array $only = null): string
    {
        $w = [];
        foreach (Rarity::ORDER as $r) {
            if ($only === null || in_array($r, $only, true)) {
                $w[$r] = (int) round($rates[$r] * 100);
            }
        }
        $roll = random_int(1, array_sum($w));
        foreach ($w as $r => $v) {
            if (($roll -= $v) <= 0) {
                return $r;
            }
        }

        return array_key_last($w);
    }

    /**
     * 뽑기 실행. 같은 request_id 재전송은 저장된 같은 결과를 replay=true로 반환한다.
     *
     * @return array<string,mixed>
     */
    public function pull(int $userId, int $count, string $requestId, ?string $banner = null): array
    {
        $this->assertEnabled();
        $pool = $this->pool();   // 설정 검증 실패는 트랜잭션 전에 예외
        $banner = ($banner === null || $banner === '' || $banner === 'normal') ? null : $banner;   // 생략/normal = 서고(전체 풀, 기존과 동일)
        $codes = null;
        if ($banner !== null) {   // 알 수 없거나 비활성(검증 위반) 배너는 쓰기 전에 422
            $codes = ($this->scenarioBanners($pool)[$banner] ?? throw new IllegalAction('banner_unknown', '알 수 없거나 열려 있지 않은 배너입니다.', 422))['codes'];
        }
        $draw = $this->drawPool($pool, $codes);
        try {
            $r = DB::transaction(fn () => $this->pullTx($userId, $count, $requestId, $pool, $draw, $banner));
            app(QuestService::class)->record($userId, 'gacha_pull', 'gacha:'.$r['pull_id'], (int) $r['count']);   // 퀘스트 훅(멱등, 실패 무시)

            return $r;
        } catch (UniqueConstraintViolationException) {
            // 동시 재전송 경합: 먼저 커밋된 로그를 재조회
            return DB::transaction(fn () => $this->replay($userId, $count, $requestId, $banner) ?? throw new IllegalAction('gacha_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409));
        }
    }

    private function replay(int $userId, int $count, string $requestId, ?string $banner = null): ?array
    {
        $log = DB::table('gacha_pulls')->where(['user_id' => $userId, 'request_id' => $requestId])->first();
        if (! $log) {
            return null;
        }
        if ((int) $log->pull_count !== $count || ($log->banner_key ?? null) !== $banner) {
            throw new IllegalAction('request_id_reused', '같은 request_id로 다른 요청을 보낼 수 없습니다.', 409);
        }

        return $this->response($log, true);
    }

    private function response(object $log, bool $replay): array
    {
        return ['replay' => $replay, 'pull_id' => (int) $log->id, 'pool_version' => (int) $log->pool_version, 'count' => (int) $log->pull_count,
            'gold_spent' => (int) $log->gold_spent, 'gold' => $this->gold((int) $log->user_id),
            'currency' => (string) ($log->pay_currency ?? 'gold'), 'pen_spent' => (int) ($log->pen_spent ?? 0), 'pen' => $this->pen((int) $log->user_id), 'banner' => $log->banner_key ?? null,
            'pity' => ['before' => (int) $log->pity_before, 'after' => (int) $log->pity_after, 'guarantee_applied' => (bool) $log->pity_applied],
            'results' => $results = json_decode($log->results, true),
            'required_pity' => ['before' => (object) (json_decode((string) ($log->required_pity_before ?? ''), true) ?: []), 'after' => (object) (json_decode((string) ($log->required_pity_after ?? ''), true) ?: []), 'guarantee_applied' => (bool) array_filter($results, fn ($x) => ($x['required_via'] ?? null) === 'pity')]];
    }

    private function pullTx(int $userId, int $count, string $requestId, array $fullPool, array $pool, ?string $banner = null): array
    {
        // 같은 유저의 동시 뽑기 직렬화: 상태 행이 없으면 만들고(insertOrIgnore) 행 잠금(lockForUpdate)을 먼저 잡은 뒤 replay 확인과 모든 읽기를 한다
        // (REPEATABLE READ 에서 첫 일반 SELECT 가 스냅샷을 고정하므로, 락 대기 후 낡은 값을 읽지 않도록 락을 replay 보다 앞에 둔다. SQLite 는 쓰기 잠금이 DB 전체라 무시됨)
        DB::table('gacha_user_states')->insertOrIgnore(['user_id' => $userId, 'pity_counter' => 0, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('gacha_user_states')->where('user_id', $userId)->lockForUpdate()->value('user_id');
        if ($r = $this->replay($userId, $count, $requestId, $banner)) {
            return $r;
        }
        $cur = self::currency();
        $prices = $cur === 'pen' ? self::penPrice() : $pool['price'];
        $cost = $count === 10 ? $prices['ten'] : $prices['single'];
        if ($cur === 'pen' && ! $this->currencyCols()) {   // 마이그레이션 전: 쓰기 전에 거부
            throw new IllegalAction('gacha_pen_unavailable', '펜 결제 준비 중입니다.', 503);
        }
        if (($cur === 'pen' ? $this->pen($userId) : $this->gold($userId)) < $cost) {   // 쓰기 전에 거부(차감·로그 없음)
            throw new IllegalAction($cur === 'pen' ? 'insufficient_pen' : 'insufficient_gold', $cur === 'pen' ? '펜이 부족합니다.' : '골드가 부족합니다.', 422);
        }
        $rates = $pool['rates'];   // 이번에 뽑는 풀(drawPool) 기준 등급 확률
        $min = $pool['pity']['min_rarity'];
        $high = array_values(array_filter(Rarity::ORDER, fn ($r) => Rarity::rank($r) <= Rarity::rank($min) && $rates[$r] > 0 && $pool['by_rarity'][$r] !== []));
        $guaranteeSlot = $count === (int) $pool['pity']['applies_to_count'] && $high !== [];   // 10연 최소 등급 보장(기존 천장): 마지막 슬롯까지 high 가 없으면 마지막 슬롯을 high 로 재추첨
        $applied = false;
        $gotHigh = false;

        // 필수 영웅 소프트 천장. 우선순위 = 필수 천장 확정 > 10연 최소 등급 보장 > 필수 영웅 부스트(같은 등급 안 가중).
        // 확정 슬롯이 마지막이고 확정 영웅이 high 가 아니며 앞 슬롯에도 high 가 없으면 그 10연의 최소 등급 보장은 적용되지 않는다(천장 우선). 확정/부스트/카운트 모두 '이번에 뽑는 풀에 있는 대상'에만 적용(배너 인지: 시나리오 배너는 그 풀의 영웅만)
        $cfg = $this->requiredCfg($banner);
        $owned = DB::table('user_heroes')->where('user_id', $userId)->pluck('hero_id')->flip();
        $libOff = $banner === null && ! config('game.gacha.required_library', false);   // 서고(전체 풀)에서는 기본 OFF(문기획 권고). 시나리오 배너에서만 부스트·천장
        $targets = ($cfg['enabled'] && ! $libOff) ? $this->requiredTargets($userId, $fullPool, $owned) : [];
        $inDraw = array_flip(array_merge(...array_values($pool['by_rarity'])));
        $targets = array_values(array_filter($targets, fn ($c) => isset($inDraw[$c])));
        $rpAll = $cfg['enabled'] ? $this->requiredCounters($userId) : [];
        $rpBefore = array_intersect_key($rpAll, array_flip($targets));

        $pityBefore = (int) (DB::table('gacha_user_states')->where('user_id', $userId)->value('pity_counter') ?? 0);
        $pity = $pityBefore;
        $now = now();
        $results = [];
        for ($i = 0; $i < $count; $i++) {
            $via = null;
            $forced = null;
            foreach ($targets as $cand) {
                if (($rpAll[$cand] ?? 0) >= $cfg['k']) {
                    $forced = $cand;
                    break;   // 여러 명이면 앞선 1명만(스테이지 순서), 한 슬롯에 1명
                }
            }
            if ($forced !== null) {
                $code = $forced;
                $rar = Rarity::normalize($this->data->heroes()[$code]['rarity']);
                $via = 'pity';
            } else {
                $rar = $this->drawRarity($rates);
                if ($guaranteeSlot && $i === $count - 1 && ! $gotHigh && ! in_array($rar, $high, true)) {
                    $rar = $this->drawRarity($rates, $high);
                    $applied = true;
                }
                $code = $this->pickCode($pool['by_rarity'][$rar], $targets, $cfg['boost']);
            }
            $h = $this->data->heroes()[$code];
            $uh = DB::table('user_heroes')->where(['user_id' => $userId, 'hero_id' => $h['id']])->first();
            if ($uh) {
                $gain = $pool['shards'][$rar];
                DB::table('user_heroes')->where('id', $uh->id)->update(['shards' => (int) $uh->shards + $gain, 'updated_at' => $now]);
                $res = $this->heroView($code) + ['user_hero_id' => (int) $uh->id, 'is_new' => false, 'shards_gained' => $gain, 'shards_total' => (int) $uh->shards + $gain];
            } else {
                $id = DB::table('user_heroes')->insertGetId(['user_id' => $userId, 'hero_id' => $h['id'], 'level' => 1, 'exp' => 0, 'shards' => 0, 'obtained_at' => $now, 'created_at' => $now, 'updated_at' => $now]);
                app(LineupService::class)->autoAdd((int) $userId, (int) $id);   // 라인업이 5명 미만이면 신규 영웅 자동 추가
                $res = $this->heroView($code) + ['user_hero_id' => (int) $id, 'is_new' => true, 'shards_gained' => 0, 'shards_total' => 0];
            }
            foreach ($targets as $c) {   // 대상 영웅별 카운터: 획득하면 제거, 아니면 +1 (이 뽑기가 그 영웅이 나올 수 있는 풀에서 이뤄진 경우만 대상에 남아 있음)
                if ($c === $code) {
                    $via ??= 'boost';
                    unset($rpAll[$c]);
                } else {
                    $rpAll[$c] = ($rpAll[$c] ?? 0) + 1;
                }
            }
            $targets = array_values(array_diff($targets, [$code]));
            $via !== null && $res['required_via'] = $via;
            $results[] = $res;
            $in = Rarity::rank($rar) <= Rarity::rank($min);
            $gotHigh = $gotHigh || $in;
            $pity = $in ? 0 : $pity + 1;
        }

        $logId = DB::table('gacha_pulls')->insertGetId([
            'user_id' => $userId, 'request_id' => $requestId, 'pool_version' => $pool['version'], 'rates_snapshot' => json_encode($rates), 'pull_count' => $count,
            'results' => json_encode($results, JSON_UNESCAPED_UNICODE), 'gold_spent' => $cur === 'pen' ? 0 : $cost, 'pity_before' => $pityBefore, 'pity_after' => $pity, 'pity_applied' => $applied ? 1 : 0, 'created_at' => $now,
        ] + ($this->currencyCols() ? ['pay_currency' => $cur, 'pen_spent' => $cur === 'pen' ? $cost : 0] : []) + ($this->bannerCol() ? ['banner_key' => $banner] : []) + ($cfg['column'] ? ['required_pity_before' => json_encode($rpBefore), 'required_pity_after' => json_encode(array_intersect_key($rpAll, $rpBefore))] : []));
        $cur === 'pen'
            ? $this->progress->credit($userId, 'pen', -$cost, 'gacha_pull_pen', 'gacha_pull', $logId)   // 펜 차감(reason 분리, ref=로그 id 멱등)
            : $this->progress->credit($userId, 'gold', -$cost, 'gacha_pull', 'gacha_pull', $logId);   // 잔액 부족 시 IllegalAction -> 전체 롤백
        DB::table('gacha_user_states')->upsert([['user_id' => $userId, 'pity_counter' => $pity, 'created_at' => $now, 'updated_at' => $now] + ($cfg['column'] && $cfg['enabled'] ? ['required_pity_counters' => json_encode($rpAll)] : [])], ['user_id'], array_merge(['pity_counter', 'updated_at'], $cfg['column'] && $cfg['enabled'] ? ['required_pity_counters'] : []));   // enabled=false(예: 배너 required_pity=0)는 다른 배너 카운터를 건드리지 않는다(기존 값 보존)

        return $this->response(DB::table('gacha_pulls')->find($logId), false);
    }
}
