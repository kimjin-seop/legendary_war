<?php

namespace App\Services;

use App\Game\IllegalAction;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 방 생성용 전장 프리셋 카탈로그. 허용 목록은 maps.meta(pvp_fair/pvp_listing)로 산출한다.
 * meta가 없는 레거시 맵은 config game.room_map_codes에 있을 때만 허용(기존 클라이언트 호환, solo·pvp 모두).
 * meta.pvp_listing === 'hold' 맵은 solo/pvp 목록에서 모두 보류. PvP는 pvp_fair && pvp_listing==='default'(레거시 포함)만 허용.
 * meta 컬럼이 아직 없으면(마이그레이션 전) 레거시 목록만으로 동작한다.
 */
class MapCatalog
{
    private const SIZE_ORDER = ['S' => 0, 'M' => 1, 'L' => 2];

    /** @return array<int,array<string,mixed>> 정규화된 맵 행(타일 제외), 보류 맵 포함 */
    private function all(): array
    {
        $hasMeta = Schema::hasColumn('maps', 'meta');
        $cols = ['id', 'code', 'name', 'width', 'height', 'biome'];
        $hasMeta && ($cols[] = 'meta');
        $legacy = (array) config('game.room_map_codes');
        $out = [];
        foreach (DB::table('maps')->orderBy('id')->get($cols) as $m) {
            $meta = $hasMeta && $m->meta ? (json_decode($m->meta, true) ?: null) : null;
            if ($meta !== null && array_diff_key($meta, ['tile_layer' => 1]) === []) {
                $meta = null;   // tile_layer(시각용)만 있는 레거시 맵은 '메타 없음' 취급: 허용 목록(room_map_codes) 밖 맵이 목록에 새지 않게
            }
            if ($meta === null && ! in_array($m->code, $legacy, true)) {
                continue;   // meta 없는 비허용 레거시 맵(소형 변형 등)은 목록 제외
            }
            $w = (int) $m->width;
            $h = (int) $m->height;
            $cells = $w * $h;
            $c = $meta['contact'] ?? null;
            $out[] = [
                'id' => (int) $m->id, 'code' => $m->code, 'name' => $m->name, 'width' => $w, 'height' => $h,
                'theme' => $meta['theme'] ?? null, 'tags' => $meta['tags'] ?? [],
                'biome' => $meta['biome_tag'] ?? $m->biome,
                'size_class' => $meta['size_class'] ?? ($cells <= 200 ? 'S' : ($cells <= 400 ? 'M' : 'L')),
                'recommended_per_side' => $meta['recommended_per_side'] ?? null,
                'party_size' => (int) (config('game.room.party_size')[$meta['size_class'] ?? ($cells <= 200 ? 'S' : ($cells <= 400 ? 'M' : 'L'))] ?? 4),   // 방 대전 고정 출전 영웅 수
                'pvp_fair' => (bool) ($meta['pvp_fair'] ?? true),
                'pvp_listing' => $meta['pvp_listing'] ?? 'default',
                'campaign_ok' => (bool) ($meta['campaign_ok'] ?? true),
                'difficulty_hint' => $meta['difficulty_hint'] ?? null,
                'contact_rounds' => $c ? ['foot' => $c['foot_round'] ?? null, 'mounted' => $c['mounted_round'] ?? null] : null,
                'decor' => $meta['decor'] ?? null, 'village_style' => $meta['village_style'] ?? null,
                'has_meta' => $meta !== null,
            ];
        }

        return $out;
    }

    private function listed(array $m, string $mode): bool
    {
        if ($m['pvp_listing'] === 'hold') {
            return false;
        }

        return $mode === 'pvp' ? ($m['pvp_fair'] && $m['pvp_listing'] === 'default') : true;
    }

    /**
     * 방 대전(solo/pvp) 출전 영웅 수: 맵 크기(size_class S/M/L)로 고정(config game.room.party_size). 유저 레벨 슬롯과 무관.
     * size_class는 meta 우선, 없으면 칸 수(<=200 S, <=400 M, 그 외 L)로 산출(listing 필터와 무관하게 모든 맵 id에 적용).
     *
     * @return array{size_class:string,party_size:int}
     */
    public static function partySizeFor(int $mapId): array
    {
        $m = DB::table('maps')->where('id', $mapId)->first(Schema::hasColumn('maps', 'meta') ? ['width', 'height', 'meta'] : ['width', 'height']);
        $meta = ! empty($m->meta) ? (json_decode($m->meta, true) ?: []) : [];
        $cells = (int) ($m->width ?? 0) * (int) ($m->height ?? 0);
        $sc = $meta['size_class'] ?? ($cells <= 200 ? 'S' : ($cells <= 400 ? 'M' : 'L'));
        $table = (array) config('game.room.party_size');

        return ['size_class' => $sc, 'party_size' => (int) ($table[$sc] ?? $table['M'] ?? 4)];
    }

    /** 기본 맵(첫 맵: 기존 호환) */
    public function defaultMapId(): int
    {
        return (int) DB::table('maps')->orderBy('id')->value('id');
    }

    public function defaultCode(): ?string
    {
        return DB::table('maps')->orderBy('id')->value('code');
    }

    /**
     * 방 생성용 맵 선택. 'random'은 모드별 후보 중 서버가 추첨(PvP는 meta 있는 pvp_fair 맵만).
     *
     * @throws IllegalAction invalid_map(없는/레거시 비허용) | map_not_allowed(비공정·보류)
     */
    public function pick(string $mode, ?string $mapCode): int
    {
        if ($mapCode === null || $mapCode === '') {
            // R6: 생략/빈 값도 모드별 목록(listed) 후보에서 선택(PvP 공정 맵 규칙 보존). 후보가 없으면 solo만 기존 기본 맵으로 폴백
            foreach ($this->all() as $m) {
                if ($this->listed($m, $mode)) {
                    return $m['id'];
                }
            }
            if ($mode === 'pvp') {
                throw new IllegalAction('invalid_map', '선택할 수 있는 맵이 없습니다.', 422);
            }

            return $this->defaultMapId();
        }
        $all = $this->all();
        if ($mapCode === 'random') {
            $pool = array_values(array_filter($all, fn ($m) => $this->listed($m, $mode) && ($mode === 'solo' || $m['has_meta'])));
            if (! $pool) {
                throw new IllegalAction('invalid_map', '선택할 수 있는 맵이 없습니다.', 422);
            }

            return $pool[random_int(0, count($pool) - 1)]['id'];
        }
        $hit = array_values(array_filter($all, fn ($m) => $m['code'] === $mapCode))[0] ?? null;
        if ($hit === null) {
            throw new IllegalAction('invalid_map', '선택할 수 없는 맵입니다.', 422);
        }
        if (! $this->listed($hit, $mode)) {
            throw new IllegalAction('map_not_allowed', $mode === 'pvp' ? '대인전(PvP)에서는 선택할 수 없는 맵입니다.' : '현재 선택할 수 없는 맵입니다.', 422);
        }

        return $hit['id'];
    }

    /** @return array{maps:array<int,array<string,mixed>>,default_code:?string} */
    public function list(string $mode, ?int $perSide, ?string $biome, ?string $sizeClass, bool $withTiles): array
    {
        $rows = array_values(array_filter($this->all(), function ($m) use ($mode, $perSide, $biome, $sizeClass) {
            if (! $this->listed($m, $mode)) {
                return false;
            }
            $r = $m['recommended_per_side'];
            if ($perSide !== null && $r && ($perSide < $r[0] || $perSide > $r[1])) {
                return false;
            }

            return ($biome === null || $m['biome'] === $biome) && ($sizeClass === null || $m['size_class'] === $sizeClass);
        }));
        usort($rows, fn ($a, $b) => [self::SIZE_ORDER[$a['size_class']] ?? 9, $a['name']] <=> [self::SIZE_ORDER[$b['size_class']] ?? 9, $b['name']]);
        $tiles = $withTiles && $rows ? DB::table('maps')->whereIn('id', array_column($rows, 'id'))->pluck('tiles', 'id') : null;
        $maps = array_map(function ($m) use ($tiles) {
            $o = $m;
            unset($o['id'], $o['has_meta']);
            foreach (['decor', 'village_style', 'contact_rounds'] as $k) {
                if ($o[$k] === null) {
                    unset($o[$k]);
                }
            }
            $tiles !== null && ($o['tiles'] = json_decode($tiles[$m['id']], true));

            return $o;
        }, $rows);

        return ['maps' => $maps, 'default_code' => $this->defaultCode()];
    }

    /** 미리보기(타일 격자, 60초 캐시). solo 기준 목록에 없는 맵은 null */
    public function preview(string $code): ?array
    {
        $hit = array_values(array_filter($this->all(), fn ($m) => $m['code'] === $code && $this->listed($m, 'solo')))[0] ?? null;
        if ($hit === null) {
            return null;
        }

        return Cache::remember('map_preview:'.$code, 60, function () use ($hit) {
            $row = DB::table('maps')->where('id', $hit['id'])->first(['tiles', 'spawns', 'deploy_zones']);
            $o = ['code' => $hit['code'], 'width' => $hit['width'], 'height' => $hit['height'], 'tiles' => json_decode($row->tiles, true),
                'spawns' => json_decode($row->spawns, true), 'deploy_zones' => json_decode($row->deploy_zones, true)];
            $hit['decor'] !== null && ($o['decor'] = $hit['decor']);
            $hit['village_style'] !== null && ($o['village_style'] = $hit['village_style']);
            // tile_layer는 용량이 커서 목록(list)에는 넣지 않고 미리보기에만 포함(없으면 키 생략)
            if (Schema::hasColumn('maps', 'meta')) {
                $pm = json_decode((string) DB::table('maps')->where('id', $hit['id'])->value('meta'), true) ?: [];
                ! empty($pm['tile_layer']) && ($o['tile_layer'] = $pm['tile_layer']);
                $o += GameData::artExtras($pm);   // props·painted_bg(경로 검증)·culture: 미리보기에만 포함, 목록(list)은 meta 전체를 싣지 않음
            }

            return $o;
        });
    }
}
