<?php

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * 시드 JSON 의 stages.rules 반영 규칙(시드 3종 공통): 키 없음=기존 값 유지(호출부가 건너뜀) / null=전부 지움 / 객체=기존 rules 에 병합(값이 null 인 키는 삭제, cues 등 다른 키 보존).
 * ally_npcs 의 영웅 코드는 heroes 에 존재해야 한다(없으면 RuntimeException = 시드 실패; npc_* 는 game:seed-imjin10 --with-npc 로 먼저 시드).
 */
final class StageRulesMerge
{
    /** @return string|null stages.rules 에 쓸 JSON(null=비움) */
    /** @param string[]|null $forced 이 스테이지의 forced_heroes(시드가 함께 쓰는 값). null 이면 DB 현재 값으로 교집합 검증 */
    public static function resolve(string $code, mixed $incoming, ?array $forced = null): ?string
    {
        if ($incoming === null) {
            return null;
        }
        foreach ((array) ($incoming['ally_npcs'] ?? []) as $n) {
            DB::table('heroes')->where('code', (string) ($n['hero'] ?? ''))->exists() || throw new \RuntimeException("{$code}: rules.ally_npcs 영웅 ".($n['hero'] ?? '?').' 없음(npc_* 는 --with-npc 선행)');
        }
        $cur = json_decode((string) DB::table('stages')->where('code', $code)->value('rules'), true) ?: [];
        foreach ($incoming as $k => $v) {
            if ($v === null) {
                unset($cur[$k]);
            } else {
                $cur[$k] = $v;
            }
        }

        $forced ??= json_decode((string) DB::table('stages')->where('code', $code)->value('forced_heroes'), true) ?: [];
        $forcedCodes = array_map(fn ($f) => is_array($f) ? (string) ($f['hero'] ?? '') : (string) $f, $forced);   // forced_heroes 항목: 코드 문자열 또는 {hero,unit_type,...}
        $dup = array_intersect(array_column((array) ($cur['ally_npcs'] ?? []), 'hero'), $forcedCodes);   // 아군 NPC(AI 조종)가 출전 강제 영웅이면 모순(플레이어 배치 불가 + 필수)
        $dup === [] || throw new \RuntimeException("{$code}: ally_npcs 와 forced_heroes 가 겹침(".implode(',', $dup).')');

        return $cur === [] ? null : json_encode($cur, JSON_UNESCAPED_UNICODE);
    }
}
