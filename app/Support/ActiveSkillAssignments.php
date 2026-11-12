<?php

namespace App\Support;

/** 액티브 스킬 영웅 배정 시드(database/data/active_skill_assignments.json) 로더. game:seed-active-skills와 game:seed(연결 보존)가 공유한다. */
final class ActiveSkillAssignments
{
    public static function path(): string
    {
        return database_path('data/active_skill_assignments.json');
    }

    /** @return array<int,array<string,mixed>> 배정 목록(파일이 없으면 빈 배열) */
    public static function load(): array
    {
        return is_file(self::path()) ? (json_decode(file_get_contents(self::path()), true, 512, JSON_THROW_ON_ERROR)['assignments'] ?? []) : [];
    }

    /** @return string[] 시드가 관리하는 스킬 code */
    public static function codes(): array
    {
        return array_column(self::load(), 'skill_code');
    }
}
