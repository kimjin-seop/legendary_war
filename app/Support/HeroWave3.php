<?php

namespace App\Support;

/**
 * 3차 영웅 확장(wave3) 데이터 로더. 입력(경로는 config game.hero_wave3.* 로 오버라이드 가능):
 *  - candidates : database/data/proposals/hero_expansion_wave3_candidates.json (송서사: 후보 60 = 핵심 55 + 예비 5; source=promote 승격 NPC / new 신규)
 *  - stats      : database/data/proposals/hero_wave3_stats.json (임밸런: 능력치·스킬. 스키마는 hero_wave3_stats.schema.json). 없으면 빈 배열.
 *  - gap_fill   : database/data/proposals/hero_gap_fill_v1.json (설명·인연 보강)
 * 적재는 `game:seed-hero-wave3` 가 한다. 이 클래스는 파일 해석·가챠 풀용 코드 목록·역사 part 파일 생성만 담당한다(DB 쓰기 없음).
 */
final class HeroWave3
{
    public const RELATION_TYPES = ['ally', 'rival', 'mentor', 'kin', 'lord_vassal', 'same_event', 'lineage'];

    public const HISTORY_PART = 'hero_history_part_wave3.json';

    public const HISTORY_RELATIONS = 'hero_history_relations_wave3.json';

    private static function path(string $key): string
    {
        $defaults = [
            'candidates' => 'proposals/hero_expansion_wave3_candidates.json',
            'stats' => 'proposals/hero_wave3_stats.json',
            'gap_fill' => 'proposals/hero_gap_fill_v1.json',
        ];
        $p = (string) (config("game.hero_wave3.{$key}") ?: database_path('data/'.$defaults[$key]));

        return $p;
    }

    private static function read(string $key): ?array
    {
        $p = self::path($key);

        return is_file($p) ? json_decode((string) file_get_contents($p), true, 512, JSON_THROW_ON_ERROR) : null;
    }

    /** @return list<array<string,mixed>> 후보 행(기본 핵심만, $withReserve 면 예비 포함). 파일이 없으면 빈 배열 */
    public static function candidates(bool $withReserve = false): array
    {
        $doc = self::read('candidates');
        $rows = array_values(array_filter((array) ($doc['candidates'] ?? []), fn ($c) => is_array($c) && ! empty($c['code'])));

        return $withReserve ? $rows : array_values(array_filter($rows, fn ($c) => ($c['tier'] ?? 'core') !== 'reserve'));
    }

    /** @return list<string> 신규(source=new) 핵심 코드. 가챠 풀 후보(DB에 행이 있고 campaign_only=0 인 것만 풀에 들어간다) */
    public static function newCodes(): array
    {
        return array_values(array_map(fn ($c) => $c['code'], array_filter(self::candidates(true), fn ($c) => ($c['source'] ?? '') === 'new')));
    }

    /** @return list<string> 승격(source=promote) 코드(예비 포함). 시드가 campaign_only 를 되돌리지 않게 보호하는 용도 */
    public static function promoteCodes(): array
    {
        return array_values(array_map(fn ($c) => $c['code'], array_filter(self::candidates(true), fn ($c) => ($c['source'] ?? '') === 'promote')));
    }

    /** @return array<string,array<string,mixed>> code => 능력치·스킬 정의(임밸런). 파일 없음 = [] */
    public static function stats(): array
    {
        $doc = self::read('stats');

        return array_column((array) ($doc['items'] ?? []), null, 'code');
    }

    /** @return array<string,mixed> stats 문서 원본(없으면 []) */
    public static function statsDoc(): array
    {
        return self::read('stats') ?? [];
    }

    /** @return array<string,array> 송서사 신규 스킬 이름(hero_wave3_skill_names.json; {skills:{code:{name_ko,flavor}}} 또는 {items:[{code,name_ko}]}). 없으면 [] */
    public static function skillNames(): array
    {
        $p = (string) (config('game.hero_wave3.skill_names') ?: database_path('data/proposals/hero_wave3_skill_names.json'));
        $j = is_file($p) ? json_decode((string) file_get_contents($p), true) : null;
        $out = (array) ($j['skills'] ?? []);
        foreach ((array) ($j['items'] ?? []) as $i) {
            isset($i['code']) && $out[$i['code']] = $i;
        }

        return $out;
    }

    /** @return array<string,array> code => 아직 skills 테이블에 없는 신규 스킬 정의(stats.new_skills; 시드 대기) */
    public static function newSkills(): array
    {
        return array_column((array) ((self::read('stats') ?? [])['new_skills'] ?? []), null, 'code');
    }

    /** stats 항목의 스킬 코드 목록: skills 우선, 없으면 passives+actives(순서 유지), 그것도 없으면 passive_skill/skill */
    public static function skillList(array $s): array
    {
        $l = $s['skills'] ?? array_merge((array) ($s['passives'] ?? []), (array) ($s['actives'] ?? []));
        $l !== [] || $l = array_filter([$s['passive_skill'] ?? null, $s['skill'] ?? null]);

        return array_values(array_unique($l));
    }

    /** 후보 중 적용 대상이 아닌(예비·다음 풀) 코드: 인연·역사에서 상대로 쓰지 않는다 */
    private static function unappliedCodes(): array
    {
        $doc = self::read('candidates') ?? [];
        $res = array_column(array_filter(self::candidates(true), fn ($c) => ($c['tier'] ?? '') === 'reserve'), 'code');

        return array_merge($res, (array) ($doc['reserve_codes'] ?? []), (array) ($doc['reserve_promotion_pool_next'] ?? []), (array) ($doc['reserve_new_pool_next'] ?? []));
    }

    /**
     * 역사 설명 part 문서 + 인연 오버레이 문서를 만든다(핵심 후보만, 외부 노출 금지 필드 제외).
     *  - part: 후보(has_history=false) 의 얇은 설명(one_line/life/summary) + hero_gap_fill 의 NPC 3명 설명(전체 항목).
     *  - relations: code => [{code,type,note}] (양방향, 상대가 적용 대상이 아닌 항목 제외). GameData::historyItems 가 기존 relations 뒤에 덧붙인다.
     *
     * @return array{part:array,relations:array}
     */
    public static function buildHistory(): array
    {
        $gap = self::read('gap_fill') ?? [];
        $skip = array_flip(self::unappliedCodes());
        $items = [];
        $names = [];
        foreach (self::candidates() as $c) {
            $names[$c['code']] = $c['name_ko'] ?? $c['code'];
            if (empty($c['has_history'])) {
                $items[$c['code']] = array_filter([
                    'code' => $c['code'], 'name_ko' => $c['name_ko'] ?? $c['code'], 'one_line' => $c['one_line'] ?? null,
                    'life' => $c['era_origin'] ?? null, 'summary' => $c['key_event'] ?? null,
                    'evidence' => ['level' => ($c['evidence_level'] ?? 'verify') === 'verify' ? 'verify' : 'accepted'],
                ], fn ($v) => $v !== null);
            }
        }
        foreach ((array) ($gap['history']['items'] ?? []) as $h) {   // 노출 금지 필드(evidence_level/source/notes) 제거
            $items[$h['code']] = array_diff_key($h, array_flip(['evidence_level', 'source', 'notes'])) + ['evidence' => ['level' => ($h['evidence_level'] ?? 'verify') === 'verify' ? 'verify' : 'accepted']];
        }

        $rel = [];
        $add = function (string $a, string $b, string $type, ?string $note) use (&$rel, $skip) {
            if ($a === $b || isset($skip[$a]) || isset($skip[$b]) || ! in_array($type, self::RELATION_TYPES, true)) {
                return;
            }
            foreach ([[$a, $b], [$b, $a]] as [$x, $y]) {
                $dup = array_filter($rel[$x] ?? [], fn ($r) => $r['code'] === $y && $r['type'] === $type);
                $dup || $rel[$x][] = array_filter(['code' => $y, 'type' => $type, 'note' => $note], fn ($v) => $v !== null);
            }
        };
        foreach (self::candidates() as $c) {
            foreach ((array) ($c['relations'] ?? []) as $r) {
                $add($c['code'], (string) ($r['to'] ?? ''), (string) ($r['type'] ?? ''), $r['reason'] ?? null);
            }
        }
        foreach (['relations_primary', 'relations_extra'] as $k) {
            foreach ((array) ($gap[$k] ?? []) as $h) {
                foreach ((array) ($h['pairs'] ?? []) as $p) {
                    $add((string) $h['hero'], (string) ($p['to'] ?? ''), (string) ($p['type'] ?? ''), $p['reason'] ?? null);
                }
            }
        }
        foreach ((array) ($gap['npc_playable_relations'] ?? []) as $p) {
            $add((string) $p['hero_a'], (string) $p['hero_b'], (string) ($p['type'] ?? ''), $p['reason'] ?? null);
        }
        ksort($rel);

        return [
            'part' => ['_note' => '3차 영웅 확장(wave3) 역사 설명. game:seed-hero-wave3 --write-history 로 생성(proposals 원본에서 파생). 기존 part 항목은 덮어쓰지 않는다.', 'items' => array_values($items)],
            'relations' => ['_note' => '3차 영웅 확장(wave3) 인연 오버레이(양방향). GameData 가 기존 history relations 뒤에 덧붙인다.', 'relations' => $rel],
        ];
    }

    /**
     * 초상·스프라이트 에셋 누락 점검(public/assets/manifest.json + 모든 manifest_fragment*.json 의 key).
     * 초상 = portrait.<code>, 스프라이트 = unit.hero.<code>.* 또는 unit.npc.<code>.* 중 하나. 없어도 FE 가 실루엣/공용 시트로 폴백한다.
     *
     * @param  list<string>  $codes
     * @return array{portrait:list<string>,sprite:list<string>}
     */
    public static function missingAssets(array $codes): array
    {
        $keys = [];
        $files = array_merge([public_path('assets/manifest.json')], glob(public_path('assets/*/manifest_fragment*.json')) ?: [], glob(public_path('assets/manifest_fragment*.json')) ?: []);
        foreach ($files as $f) {
            if (! is_file($f)) {
                continue;
            }
            $j = json_decode((string) file_get_contents($f), true);
            foreach ((array) ($j['items'] ?? $j['entries'] ?? []) as $it) {
                is_array($it) && isset($it['key']) && $keys[(string) $it['key']] = true;
            }
        }
        $has = fn (string $prefix) => (bool) array_filter(array_keys($keys), fn ($k) => str_starts_with($k, $prefix));
        $out = ['portrait' => [], 'sprite' => []];
        foreach ($codes as $c) {
            isset($keys["portrait.{$c}"]) || $out['portrait'][] = $c;
            $bare = preg_replace('/^npc_/', '', $c);   // NPC 시트 키는 npc_ 접두 없이 unit.npc.<이름> / unit.hero.<이름>
            ($has("unit.hero.{$c}.") || $has("unit.hero.{$bare}.") || $has("unit.npc.{$bare}.") || $has("unit.npc.{$c}.")) || $out['sprite'][] = $c;
        }

        return $out;
    }
}
