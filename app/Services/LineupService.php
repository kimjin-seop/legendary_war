<?php

namespace App\Services;

use App\Game\IllegalAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * 영웅 편성 라인업(최대 MAX명). 캠페인 출정 후보 풀. parties(마지막 출격 구성)와 분리.
 * 주인공/campaign_only 영웅은 스테이지가 직접 채우므로 라인업 대상이 아니다(출정 시 면제).
 */
class LineupService
{
    public const MAX = 5;

    public function __construct(private readonly GameData $data)
    {
    }

    /** 라인업 가능한(campaign_only 아닌) 보유 영웅 행: user_hero_id => [row, hero] */
    private function eligibleOwned(int $userId): array
    {
        $out = [];
        foreach (DB::table('user_heroes')->where('user_id', $userId)->orderByDesc('level')->orderBy('id')->get() as $uh) {
            $h = $this->data->heroById((int) $uh->hero_id);
            if ($h && empty($h['campaign_only'])) {
                $out[(int) $uh->id] = ['uh' => $uh, 'hero' => $h];
            }
        }

        return $out;
    }

    /** user_lineups 테이블 존재 여부(마이그레이션 전 배포 안전장치: 없으면 라인업 미적용·500 없음) */
    public static function available(): bool
    {
        return \Illuminate\Support\Facades\Schema::hasTable('user_lineups');
    }

    /** 슬롯 순서의 user_hero_id 목록. 비어 있으면 레벨 상위 MAX명으로 자동 채움(기존 유저 보호). */
    public function ids(User $user): array
    {
        if (! self::available()) {
            return array_slice(array_keys($this->eligibleOwned((int) $user->id)), 0, self::MAX);   // 저장 없이 레벨 상위(테이블 없음)
        }
        $ids = DB::table('user_lineups')->where('user_id', $user->id)->orderBy('slot')->pluck('user_hero_id')->map(fn ($v) => (int) $v)->all();
        if ($ids !== []) {
            return $ids;
        }
        $top = array_slice(array_keys($this->eligibleOwned((int) $user->id)), 0, self::MAX);
        foreach ($top as $i => $id) {
            DB::table('user_lineups')->insertOrIgnore(['user_id' => $user->id, 'slot' => $i + 1, 'user_hero_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
        }

        return $top;
    }

    /** 신규 영웅 획득 시: 라인업이 비어 있지 않고 MAX 미만이면 빈 슬롯에 추가(비어 있으면 첫 조회 때 자동 채움). */
    public function autoAdd(int $userId, int $userHeroId): void
    {
        if (! \Illuminate\Support\Facades\Schema::hasTable('user_lineups')) {   // 마이그레이션 전 배포 순서 안전장치
            return;
        }
        $slots = DB::table('user_lineups')->where('user_id', $userId)->pluck('slot')->map(fn ($v) => (int) $v)->all();
        if ($slots === [] || count($slots) >= self::MAX) {
            return;
        }
        $uh = DB::table('user_heroes')->where('id', $userHeroId)->where('user_id', $userId)->first();
        $h = $uh ? $this->data->heroById((int) $uh->hero_id) : null;
        if (! $h || ! empty($h['campaign_only'])) {
            return;
        }
        for ($s = 1; $s <= self::MAX; $s++) {
            if (! in_array($s, $slots, true)) {
                DB::table('user_lineups')->insertOrIgnore(['user_id' => $userId, 'slot' => $s, 'user_hero_id' => $userHeroId, 'created_at' => now(), 'updated_at' => now()]);

                return;
            }
        }
    }

    /** @return array{lineup:array<int,array>,count:int,max:int,avg_level:float|null} */
    public function view(User $user): array
    {
        $ids = $this->ids($user);
        $rows = DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', $ids)->get()->keyBy('id');
        $out = [];
        $sum = 0;
        foreach ($ids as $i => $id) {
            $uh = $rows[$id] ?? null;
            if (! $uh) {
                continue;
            }
            $h = $this->data->heroById((int) $uh->hero_id);
            $sum += (int) $uh->level;
            $out[] = ['slot' => $i + 1, 'user_hero_id' => $id, 'hero' => $h['code'], 'name' => $h['name_ko'], 'display_name' => $h['display_name'], 'rarity' => $h['rarity'], 'cost' => $h['cost'],
                'level' => (int) $uh->level, 'unit_type' => $h['unit_type'], 'troop_type' => $h['troop_type'], 'troop_label' => $this->data->troopLabel($h['troop_type']), 'portrait' => $h['code']];
        }

        return ['lineup' => $out, 'count' => count($out), 'max' => self::MAX, 'avg_level' => $out ? round($sum / count($out), 1) : null];
    }

    /**
     * 라인업 저장(순서 = 슬롯, 전량 교체). 오류 422: lineup_empty | lineup_too_many | duplicate_hero | hero_not_owned | hero_not_allowed(campaign_only).
     *
     * @param  int[]  $userHeroIds
     */
    public function save(User $user, array $userHeroIds): array
    {
        if (! self::available()) {
            throw new IllegalAction('lineup_unavailable', '편성 기능을 준비 중입니다(마이그레이션 필요).', 503);
        }
        $userHeroIds = array_values($userHeroIds);
        if ($userHeroIds === []) {
            throw new IllegalAction('lineup_empty', '라인업에는 영웅이 최소 1명 필요합니다.', 422);
        }
        if (count($userHeroIds) > self::MAX) {
            throw new IllegalAction('lineup_too_many', '라인업은 최대 '.self::MAX.'명까지입니다.', 422, ['max' => self::MAX]);
        }
        if (count(array_unique($userHeroIds)) !== count($userHeroIds)) {
            throw new IllegalAction('duplicate_hero', '중복된 영웅이 있습니다.', 422);
        }
        $owned = DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', $userHeroIds)->get()->keyBy('id');
        foreach ($userHeroIds as $id) {
            if (! isset($owned[$id])) {
                throw new IllegalAction('hero_not_owned', '보유하지 않은 영웅입니다.', 422);
            }
            $h = $this->data->heroById((int) $owned[$id]->hero_id);
            if (! $h || ! empty($h['campaign_only'])) {
                throw new IllegalAction('hero_not_allowed', '주인공·캠페인 전용 영웅은 라인업에 넣을 수 없습니다(스테이지가 자동으로 출전시킵니다).', 422, ['user_hero_id' => $id]);
            }
        }
        DB::transaction(function () use ($user, $userHeroIds) {
            DB::table('user_lineups')->where('user_id', $user->id)->delete();
            foreach ($userHeroIds as $i => $id) {
                DB::table('user_lineups')->insert(['user_id' => $user->id, 'slot' => $i + 1, 'user_hero_id' => $id, 'created_at' => now(), 'updated_at' => now()]);
            }
        });

        return $this->view($user);
    }
}
