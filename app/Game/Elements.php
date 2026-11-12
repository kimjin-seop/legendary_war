<?php

namespace App\Game;

/**
 * 속성(fire|thunder|water_ice|poison) 내성 계산(원본 database/data/elements.json). 순수 PHP(DB 불필요).
 * 속성 스킬(params.element) 피해에만 곱해지며 일반 공격·element 없는 스킬은 영향 없음.
 * 내성 합산 = 피격자 병종 + 피격자 타일 지형 + 영웅 + 장비 가산(장비는 다음 증분), +-clamp 제한. 배율 = 1 - 합산/100.
 */
final class Elements
{
    private static ?array $data = null;

    /** 테스트용: 원본 데이터 교체(null=파일 다시 읽기) */
    public static function useData(?array $data): void
    {
        self::$data = $data;
    }

    private static function data(): array
    {
        if (self::$data === null) {
            $raw = json_decode((string) @file_get_contents(dirname(__DIR__, 2).'/database/data/elements.json'), true);
            if (! is_array($raw)) {
                try {
                    \Illuminate\Support\Facades\Log::warning('elements.json 을 읽을 수 없어 속성 내성 없이 동작합니다.');
                } catch (\Throwable) {
                }
            }
            self::$data = is_array($raw) ? $raw : ['elements' => [], 'resist_clamp' => 50, 'unit_type_resist' => [], 'terrain_resist' => [], 'hero_resist' => []];
        }

        return self::$data;
    }

    /** @return string[] 허용 속성 코드 */
    public static function codes(): array
    {
        return array_column(self::data()['elements'] ?? [], 'code');
    }

    public static function name(string $element): string
    {
        foreach (self::data()['elements'] ?? [] as $e) {
            if ($e['code'] === $element) {
                return (string) $e['name_ko'];
            }
        }

        return $element;
    }

    /** 허용 속성 코드면 그대로, 아니면 null */
    public static function valid(mixed $element): ?string
    {
        return is_string($element) && in_array($element, self::codes(), true) ? $element : null;
    }

    /**
     * 피격자의 합산 내성(%). 양수=내성, 음수=약점.
     *
     * @param  array{type?:string,hero?:?string,equip_resist?:array}  $def  피격자 유닛
     */
    public static function resist(string $element, array $def, ?string $terrain): int
    {
        $d = self::data();
        $sum = (int) ($d['unit_type_resist'][$def['type'] ?? ''][$element] ?? 0)
            + (int) ($d['terrain_resist'][$terrain ?? ''][$element] ?? 0)
            + (int) ($d['hero_resist'][$def['hero'] ?? ''][$element] ?? 0)
            + (int) ($def['equip_resist'][$element] ?? 0);
        $c = (int) ($d['resist_clamp'] ?? 50);

        return max(-$c, min($c, $sum));
    }

    /** 속성 피해 배율(1 - 내성%/100) */
    public static function multiplier(string $element, array $def, ?string $terrain): float
    {
        return 1.0 - self::resist($element, $def, $terrain) / 100;
    }

    /** FE 표시용: 유닛 병종·영웅 기준 속성별 내성(지형 제외) 목록. 0인 속성은 생략 */
    public static function unitResists(array $unit): array
    {
        $out = [];
        foreach (self::codes() as $c) {
            $r = self::resist($c, $unit, null);
            if ($r !== 0) {
                $out[$c] = $r;
            }
        }

        return $out;
    }
}
