<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Game\StarRules;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 영웅 강화(★). 같은 영웅 중복 조각(user_heroes.shards)+골드로 별 1단계 상승(확정 성공, 실패 없음).
 * 한 트랜잭션: 조각 차감 + 골드 차감(credit reason=hero_star_up, ref=hero_star_ups.id) + star 증가 + audit_logs. 멱등키 (user_id, request_id).
 * 전투 반영: attach()가 영웅 row 에 star_level 을 채우면 ArmyBuilder::makeUnit 이 공·방에 가산(PvE 만, apply_pvp 시 PvP 도).
 */
class HeroStarService
{
    public function __construct(private readonly GameData $data, private readonly ProgressionService $progress)
    {
    }

    public static function enabled(): bool
    {
        return (bool) config('game.star.enabled', true) && Schema::hasTable('hero_star_ups');
    }

    public function assertEnabled(): void
    {
        if (! self::enabled()) {
            throw new IllegalAction('star_disabled', '영웅 강화가 활성화되어 있지 않습니다.', 404);
        }
    }

    /** @return array<string,mixed> */
    public function starUp(int $userId, int $userHeroId, string $requestId): array
    {
        $this->assertEnabled();
        try {
            return DB::transaction(fn () => $this->tx($userId, $userHeroId, $requestId));
        } catch (UniqueConstraintViolationException) {   // 동시 재전송: 먼저 커밋된 로그를 재조회
            return DB::transaction(fn () => $this->replay($userId, $userHeroId, $requestId) ?? throw new IllegalAction('star_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409));
        }
    }

    private function replay(int $userId, int $userHeroId, string $requestId): ?array
    {
        $log = DB::table('hero_star_ups')->where(['user_id' => $userId, 'request_id' => $requestId])->first();
        if (! $log) {
            return null;
        }
        if ((int) $log->user_hero_id !== $userHeroId) {
            throw new IllegalAction('request_id_reused', '같은 request_id로 다른 요청을 보낼 수 없습니다.', 409);
        }

        return $this->response($log, true);
    }

    private function response(object $log, bool $replay): array
    {
        $uh = DB::table('user_heroes')->where('id', $log->user_hero_id)->first(['star', 'shards', 'hero_id']);
        $h = $this->data->heroById((int) $log->hero_id);
        $gold = (int) (DB::table('wallets')->where(['user_id' => $log->user_id, 'currency_code' => 'gold'])->value('balance') ?? 0);

        return ['replay' => $replay, 'star_up_id' => (int) $log->id, 'user_hero_id' => (int) $log->user_hero_id, 'hero' => $h['code'] ?? null,
            'star_before' => (int) $log->star_before, 'star' => (int) $log->star_after, 'shards_spent' => (int) $log->shards_spent, 'gold_spent' => (int) $log->gold_spent,
            'shards' => (int) ($uh->shards ?? $log->shards_after), 'gold' => $gold,
            'bonus_pct' => StarRules::bonusPct((int) $log->star_after), 'star_next' => $h ? StarRules::next($h['rarity'], (int) ($uh->star ?? $log->star_after)) : null];
    }

    private function tx(int $userId, int $userHeroId, string $requestId): array
    {
        if ($r = $this->replay($userId, $userHeroId, $requestId)) {
            return $r;
        }
        $uh = DB::table('user_heroes')->where(['id' => $userHeroId, 'user_id' => $userId])->first();
        if (! $uh) {
            throw new IllegalAction('hero_not_found', '보유하지 않은 영웅입니다.', 404);
        }
        $h = $this->data->heroById((int) $uh->hero_id) ?? throw new IllegalAction('hero_not_found', '영웅 정보를 찾을 수 없습니다.', 404);
        $star = (int) $uh->star;
        $cost = StarRules::cost($h['rarity'], $star) ?? throw new IllegalAction('star_max', '이미 최고 단계입니다.', 422);
        if ((int) $uh->shards < $cost['shards_need']) {   // 쓰기 전에 거부
            throw new IllegalAction('insufficient_shards', '조각이 부족합니다.', 422, ['need' => $cost['shards_need'], 'have' => (int) $uh->shards]);
        }
        $gold = (int) (DB::table('wallets')->where(['user_id' => $userId, 'currency_code' => 'gold'])->value('balance') ?? 0);
        if ($gold < $cost['gold']) {
            throw new IllegalAction('insufficient_gold', '골드가 부족합니다.', 422, ['need' => $cost['gold'], 'have' => $gold]);
        }
        $logId = DB::table('hero_star_ups')->insertGetId([
            'user_id' => $userId, 'user_hero_id' => $userHeroId, 'hero_id' => (int) $uh->hero_id, 'request_id' => $requestId, 'star_before' => $star, 'star_after' => $star + 1,
            'shards_spent' => $cost['shards_need'], 'gold_spent' => $cost['gold'], 'shards_after' => (int) $uh->shards - $cost['shards_need'], 'created_at' => now(),
        ]);
        $n = DB::table('user_heroes')->where(['id' => $userHeroId, 'user_id' => $userId, 'star' => $star])->where('shards', '>=', $cost['shards_need'])
            ->update(['star' => $star + 1, 'shards' => DB::raw('shards - '.(int) $cost['shards_need']), 'updated_at' => now()]);   // 낙관적 조건: 동시 강화 시 한쪽만 성공
        if ($n !== 1) {
            throw new IllegalAction('star_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409);
        }
        $this->progress->credit($userId, 'gold', -$cost['gold'], 'hero_star_up', 'hero_star_up', $logId);   // 잔액 부족 시 IllegalAction -> 전체 롤백
        DB::table('audit_logs')->insert(['user_id' => $userId, 'action' => 'hero_star_up', 'entity' => 'user_heroes', 'entity_key' => (string) $userHeroId,
            'before' => json_encode(['star' => $star, 'shards' => (int) $uh->shards]), 'after' => json_encode(['star' => $star + 1, 'shards' => (int) $uh->shards - $cost['shards_need'], 'gold_spent' => $cost['gold'], 'star_up_id' => $logId]), 'created_at' => now()]);

        return $this->response(DB::table('hero_star_ups')->find($logId), false);
    }

    /**
     * 전투 생성용: entries(key=user_hero_id)의 영웅 row 에 star_level 을 채운다(ArmyBuilder::makeUnit 이 공·방에 가산).
     * $pvp=true(랭크·자유대전·시즌전쟁)는 config game.star.apply_pvp=false 면 불변. 기능 off 이거나 별 0 이면 불변.
     *
     * @param  array<int,array{row:array,level:int,key:mixed}>  $entries
     */
    public function attach(array $entries, bool $pvp = false): array
    {
        if (! config('game.star.enabled', true) || ($pvp && ! config('game.star.apply_pvp', false)) || $entries === []) {
            return $entries;
        }
        $stars = DB::table('user_heroes')->whereIn('id', array_map(fn ($e) => (int) $e['key'], $entries))->pluck('star', 'id');
        foreach ($entries as $i => $e) {
            $s = (int) ($stars[(int) $e['key']] ?? 0);
            $s > 0 && $entries[$i]['row']['star_level'] = $s;
        }

        return $entries;
    }
}
