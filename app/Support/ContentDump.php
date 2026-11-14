<?php

namespace App\Support;

/**
 * 콘텐츠 덤프 이관 대상 정의(game:content-export / game:seed-all 공용).
 * 화이트리스트 방식: 여기 없는 테이블(users·wallets·gacha_*·user_*·battles·seasons 등 사용자/운영 데이터)은 절대 덤프·적재하지 않는다.
 * 순서 = FK 의존 순서(부모 먼저). 값 = 정렬 기준 컬럼(PK).
 */
final class ContentDump
{
    public const DIR = 'data/content_dump';

    /** @var array<string,string> table => order column */
    public const TABLES = [
        'unit_types' => 'id',
        'auras' => 'id',
        'terrains' => 'id',
        'terrain_modifiers' => 'id',
        'matchup_rules' => 'id',
        'skills' => 'id',
        'heroes' => 'id',
        'hero_skills' => 'id',
        'presets' => 'id',
        'maps' => 'id',
        'stages' => 'id',
        'hero_levels' => 'level',
        'user_level_costs' => 'level',
        'equipment_items' => 'id',
        'exchange_products' => 'id',
        'app_settings' => 'key',
    ];

    /** 테스트 전용: 덤프 디렉터리 대체 */
    public static ?string $dirOverride = null;

    public static function dir(): string
    {
        return self::$dirOverride ?? database_path(self::DIR);
    }
}
