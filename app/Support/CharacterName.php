<?php

namespace App\Support;

/** 캐릭터명 규칙: NFC 정규화/공백 제거, 2~12자, 한글(완성형)·영문·숫자만, 숫자만 금지, 금칙어 차단. */
final class CharacterName
{
    public static function normalize(string $name): string
    {
        $name = trim($name);
        if (class_exists(\Normalizer::class)) {
            $name = \Normalizer::normalize($name, \Normalizer::FORM_C) ?: $name;
        }

        return $name;
    }

    /** 유니크 비교 키(소문자) */
    public static function key(string $name): string
    {
        return mb_strtolower(self::normalize($name));
    }

    /** @return string|null 위반 사유: length|invalid_chars|digits_only|forbidden, 통과 시 null */
    public static function violation(string $name): ?string
    {
        $n = self::normalize($name);
        $len = mb_strlen($n);
        if ($len < config('names.min_length', 2) || $len > config('names.max_length', 12)) {
            return 'length';
        }
        if (! preg_match('/^[가-힣A-Za-z0-9]+$/u', $n)) {
            return 'invalid_chars';
        }
        if (ctype_digit($n)) {
            return 'digits_only';
        }
        $k = mb_strtolower($n);
        foreach (array_merge(config('names.reserved', []), config('names.profanity', [])) as $w) {
            $w = mb_strtolower($w);
            if (mb_strlen($w) >= 3 ? str_contains($k, $w) : $k === $w) {
                return 'forbidden';
            }
        }

        return null;
    }
}
