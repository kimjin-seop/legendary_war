<?php

namespace App\Support;

/**
 * 영웅 등급 표(단일 출처). 등급 4단계: S > A > B > C.
 * 구 등급(SSR/SR/R)은 JSON 호환 레이어(normalize)로만 받아들이고, DB/API에는 항상 신 등급만 사용한다.
 * 뽑기 풀·확률 테이블은 이 상수(ORDER/LABELS)에 의존하도록 구성한다(확률 자체는 미구현).
 */
final class Rarity
{
    public const S = 'S';
    public const A = 'A';
    public const B = 'B';
    public const C = 'C';

    /** 높은 등급 -> 낮은 등급 순서 */
    public const ORDER = [self::S, self::A, self::B, self::C];

    /** 구 등급 -> 신 등급 (호환 매핑, 한 곳) */
    public const LEGACY_MAP = ['SSR' => self::S, 'SR' => self::A, 'R' => self::B];

    /** 표시용 라벨 */
    public const LABELS = [self::S => 'S등급', self::A => 'A등급', self::B => 'B등급', self::C => 'C등급'];

    /** 코스트 기본값(신규 영웅 기준. 기존 데이터의 cost 값은 영웅 행이 기준) */
    public const DEFAULT_COST = [self::S => 6, self::A => 4, self::B => 3, self::C => 2];

    /** 정렬 우선순위(작을수록 높은 등급) */
    public static function rank(string $rarity): int
    {
        $i = array_search(self::normalize($rarity), self::ORDER, true);

        return $i === false ? PHP_INT_MAX : $i;
    }

    /** 구/신 등급 문자열 -> 신 등급. 알 수 없는 값은 예외. */
    public static function normalize(string $value): string
    {
        $v = strtoupper(trim($value));
        $v = self::LEGACY_MAP[$v] ?? $v;
        if (! in_array($v, self::ORDER, true)) {
            throw new \InvalidArgumentException("알 수 없는 등급: {$value}");
        }

        return $v;
    }
}
