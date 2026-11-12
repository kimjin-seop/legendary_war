<?php

namespace App\Support;

/**
 * 뽑기 풀에 편입된 '이름 있는 NPC 영웅' 목록(gacha_pool.json named_npc.ready_codes, version 7).
 * 이 목록의 코드는 DB 의 heroes.campaign_only=1 이어도 GameData 가 campaign_only=false 로 취급해
 * 보유 후 편성·방 대전·시즌전쟁 출전·무작위 편성이 가능하다(재시드로 DB 플래그가 되돌아가도 안전).
 * exclude_codes / exclude_patterns(호송·장애물)에 걸리는 코드는 목록에 있어도 제외한다.
 */
class GachaNamedNpc
{
    /** @var array<string,array<string,true>> */
    private static array $cache = [];

    /** @return array<string,true> code => true */
    public static function readySet(): array
    {
        $path = config('game.gacha.pool_path') ?: database_path('data/gacha_pool.json');
        $key = $path.'@'.(@filemtime($path) ?: 0);
        if (isset(self::$cache[$key])) {
            return self::$cache[$key];
        }
        $set = [];
        $raw = is_file($path) ? json_decode((string) file_get_contents($path), true) : null;
        if (is_array($raw)) {
            $exclude = array_flip((array) ($raw['exclude_codes'] ?? []));
            $patterns = (array) ($raw['exclude_patterns'] ?? []);
            foreach ((array) ($raw['named_npc']['ready_codes'] ?? []) as $c) {
                $c = (string) $c;
                if (isset($exclude[$c]) || array_filter($patterns, fn ($p) => fnmatch((string) $p, $c))) {
                    continue;
                }
                $set[$c] = true;
            }
        }

        self::$cache = [$key => $set];

        return $set;
    }
}
