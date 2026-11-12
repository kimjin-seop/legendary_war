<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * 영웅 칭호 데이터 로더/적용기. 원본: database/data/hero_titles.json(v1, troop_names 블록 포함·유지) 위에
 * hero_titles_v2_proposal.json(송서사 v2, titles.<code>.{title, short_name, evidence_level, needs_verify, ...})을 덮어쓴다(v2에 없는 code는 v1 값 유지).
 * evidence_level/needs_verify 등 메타는 DB 컬럼 없이 JSON 파일에만 유지한다. DB에는 title·short_name(varchar 32)만 쓴다.
 */
final class HeroTitles
{
    public const MAX_LEN = 32;

    /** @return array<string,array{title:?string,short_name:?string}> code => 값(검증 완료). 길이 32 초과 시 RuntimeException */
    public static function load(): array
    {
        $out = [];
        foreach (['hero_titles.json', 'hero_titles_v2_proposal.json'] as $f) {   // 뒤 파일이 앞 파일을 덮어씀
            $path = database_path('data/'.$f);
            if (! is_file($path)) {
                continue;
            }
            foreach (json_decode(file_get_contents($path), true, 512, JSON_THROW_ON_ERROR)['titles'] ?? [] as $code => $t) {
                $out[$code] = [
                    'title' => ($t['title'] ?? '') !== '' ? (string) $t['title'] : null,
                    'short_name' => ($t['short_name'] ?? '') !== '' ? (string) $t['short_name'] : null,
                ];
            }
        }
        foreach (HeroExpansion::titles() as $code => $t) {   // 신규 영웅 확장(narrative.title). v1/v2에 같은 code가 있으면 기존값 우선
            $out[$code] ??= $t;
        }
        foreach ($out as $code => $v) {
            foreach (['title', 'short_name'] as $k) {
                if ($v[$k] !== null && mb_strlen($v[$k]) > self::MAX_LEN) {
                    throw new \RuntimeException("hero titles: {$code}.{$k} 길이가 ".self::MAX_LEN.'자를 초과합니다.');
                }
            }
        }

        return $out;
    }

    /**
     * heroes.title/short_name만 갱신(DB에 없는 code는 무시). 값이 달라지는 행만 UPDATE.
     *
     * @return array{rows:int,changed:int} 대상 행 수 / 변경 행 수 (dryRun이면 쓰지 않음)
     */
    public static function apply(bool $dryRun = false): array
    {
        $rows = 0;
        $changed = 0;
        $cur = DB::table('heroes')->get(['code', 'title', 'short_name'])->keyBy('code');
        foreach (self::load() as $code => $v) {
            if (! isset($cur[$code])) {
                continue;
            }
            $rows++;
            if ($cur[$code]->title === $v['title'] && $cur[$code]->short_name === $v['short_name']) {
                continue;
            }
            $changed++;
            $dryRun || DB::table('heroes')->where('code', $code)->update($v);
        }

        return ['rows' => $rows, 'changed' => $changed];
    }
}
