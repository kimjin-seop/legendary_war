<?php

namespace App\Game\Micro;

/**
 * 영웅-진형 데이터 로더. database/data/hero_formations.json: {hero_id: {formation, alt, reason}} (formation 은 한글 이름 또는 영문 코드).
 * 파일이 없거나 영웅 키가 없거나 알 수 없는 진형이면 null(= 기본 grid2x5 배치). docs/data/hero_formations.draft.json 은 읽지 않는다(초안, 이동·수정 금지).
 */
final class FormationBook
{
    /** 한글 이름 -> 코드 */
    public const NAMES = ['학익진' => 'crane', '어린진' => 'fish', '방진' => 'phalanx', '횡대' => 'line', '원진' => 'circle'];

    /** @var array<string,array<string,string>> 경로별 캐시 */
    private static array $cache = [];

    /** 진형 이름/코드 -> 코드(알 수 없으면 null) */
    public static function normalize(mixed $name): ?string
    {
        if (! is_string($name)) {
            return null;
        }

        return self::NAMES[$name] ?? (isset(MicroCombat::FORMATIONS[$name]) ? $name : null);
    }

    /** @return array<string,string> hero_id => 진형 코드 */
    public static function load(?string $path = null): array
    {
        $path ??= function_exists('database_path') ? database_path('data/hero_formations.json') : __DIR__.'/../../../database/data/hero_formations.json';
        if (isset(self::$cache[$path])) {
            return self::$cache[$path];
        }
        $out = [];
        $doc = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        foreach (is_array($doc) ? $doc : [] as $hid => $row) {
            $code = self::normalize(is_array($row) ? ($row['formation'] ?? null) : $row);
            $code !== null && $out[(string) $hid] = $code;
        }

        return self::$cache[$path] = $out;
    }

    public static function forHero(?string $heroCode, ?string $path = null): ?string
    {
        return $heroCode === null ? null : (self::load($path)[$heroCode] ?? null);
    }

    public static function clearCache(): void
    {
        self::$cache = [];
    }
}
