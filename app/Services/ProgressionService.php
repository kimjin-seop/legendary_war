<?php

namespace App\Services;

use App\Game\SquadPlanner;

use App\Game\IllegalAction;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * 유저/영웅 성장, 재화, 편성. 모든 재화 변경은 트랜잭션 + wallet_transactions 기록 원칙(credit()만 사용).
 * 게스트도 users 행(is_guest)이므로 동일하게 동작하고, 계정 전환은 같은 users 행을 승격하므로 진행 데이터가 그대로 이관된다.
 */
class ProgressionService
{
    public function __construct(private readonly GameData $data)
    {
    }

    /** @param bool $campaign true=캠페인(stage) 전투 전용 곡선(game.campaign_slots). PvP/방/자유전은 false(현행) */
    public function maxCost(int $level, bool $campaign = false): int
    {
        $row = DB::table('user_level_costs')->where('level', '<=', $level)->orderByDesc('level')->first();
        $base = (int) ($row->max_cost ?? 10);
        $cs = config('game.campaign_slots');
        if ($campaign && ! empty($cs['enabled'])) {
            if (! empty($cs['cost_cap_by_level'])) {   // 레벨별 상한표(등급 격차 v1): 슬롯 x cost_per_slot 계산을 대체. 표에 없는 하위 레벨은 폴백
                $cap = null;
                foreach ($cs['cost_cap_by_level'] as [$minLv, $v]) {
                    $level >= $minLv && $cap = (int) $v;
                }
                if ($cap !== null) {
                    return max($base, $cap);   // 곡선(user_level_costs)보다 낮추지 않는다
                }
            }

            return max($base, $this->maxSlots($level, true) * (int) $cs['cost_per_slot']);   // 폴백(표 없음): 곡선은 현행보다 낮추지 않는다
        }

        return $base;
    }

    /**
     * 캠페인 코스트 상한(강제/고정 영웅 포함 합산용): 표(cost_cap_by_level) 모드 = 레벨 상한 + 강제·고정 영웅 수 x cost_per_slot, 폴백 모드 = max(현행 곡선, (선택 슬롯 수 + 강제·고정 영웅 수) x cost_per_slot).
     * 강제 영웅도 슬롯 1칸 몫(8)의 코스트 예산을 갖는다
     * (코스트 면제 폐지로 신규 유저 기본 편성이 곡선 상한에 걸려 막히지 않게 함). 강제 영웅이 없거나 캠페인이 아니면 maxCost 와 같다.
     */
    public function campaignCostCap(int $level, int $slots, int $forcedCount, bool $campaign): int
    {
        $base = $this->maxCost($level, $campaign);
        $cs = config('game.campaign_slots');
        if ($campaign && $forcedCount > 0 && ! empty($cs['enabled'])) {
            if (! empty($cs['cost_cap_by_level'])) {
                return $base + $forcedCount * (int) $cs['cost_per_slot'];
            }

            return max($base, ($slots + $forcedCount) * (int) $cs['cost_per_slot']);
        }

        return $base;
    }

    /** 유저 레벨별 편성 슬롯 수(user_level_costs.party_slots). 행이 없으면 config 기본값. */
    public function maxSlots(int $level, bool $campaign = false): int
    {
        $row = DB::table('user_level_costs')->where('level', '<=', $level)->orderByDesc('level')->first();
        $base = (int) ($row->party_slots ?? config('game.max_party_slots'));
        $cs = config('game.campaign_slots');
        if ($campaign && ! empty($cs['enabled'])) {
            $slots = $base;
            foreach ($cs['levels'] as [$minLv, $n]) {
                $level >= $minLv && $slots = max($slots, (int) $n);
            }

            return $slots;
        }

        return $base;
    }

    /**
     * 방 대전 필수 출전 수 = min(맵 크기별 고정 수, 보유한 출전 가능 영웅 수). 보유 영웅이 고정 수보다 적은 신규 유저가 막히지 않게 한다.
     *
     * @return array{size_class:string,party_size:int,required:int,cost_cap:int}
     */
    public function roomPartyRule(User $user, int $mapId): array
    {
        $r = MapCatalog::partySizeFor($mapId);
        $owned = 0;
        foreach (DB::table('user_heroes')->where('user_id', $user->id)->pluck('hero_id') as $hid) {
            empty($this->data->heroById((int) $hid)['campaign_only']) && $owned++;
        }

        $caps = (array) config('game.room.cost_cap');

        return $r + ['required' => max(1, min($r['party_size'], $owned)), 'cost_cap' => (int) ($caps[$r['size_class']] ?? $caps['M'] ?? 26)];
    }

    /** 최신 레벨(요청 중 stale한 모델 값 대신 DB 조회) */
    public function level(User $user): int
    {
        return (int) (DB::table('users')->where('id', $user->id)->value('level') ?? $user->level);
    }

    public function profile(User $user): array
    {
        $fresh = DB::table('users')->where('id', $user->id)->first(['level', 'exp']);
        $user->level = $fresh->level;
        $user->exp = $fresh->exp;
        $row = DB::table('user_level_costs')->where('level', $user->level)->first();
        $gold = DB::table('wallets')->where('user_id', $user->id)->where('currency_code', 'gold')->value('balance');
        $pen = DB::table('wallets')->where('user_id', $user->id)->where('currency_code', 'pen')->value('balance');

        return [
            'level' => (int) $user->level, 'exp' => (int) $user->exp, 'exp_to_next' => (int) ($row->exp_to_next ?? 0),
            'max_cost' => $this->maxCost($user->level), 'max_party_slots' => $this->maxSlots($user->level),
            'campaign_max_cost' => $this->maxCost($user->level, true), 'campaign_max_party_slots' => $this->maxSlots($user->level, true),   // 캠페인 전용(PvP는 위 값)
            'gold' => (int) ($gold ?? 0), 'pen' => (int) ($pen ?? 0),   // pen: 영구 재화(시즌 전쟁·랭크전·일일 퀘스트 획득)
        ];
    }

    /** 재화 증감(+). 이미 같은 reason/ref로 지급됐다면 false(멱등). */
    public function credit(int $userId, string $currency, int $amount, string $reason, string $refType, int $refId): bool
    {
        // 모든 재화 변경은 (사유, 참조) 멱등 키가 필수: ref 없는 지급은 이중 지급을 막을 수 없으므로 허용하지 않는다.
        // (SQLite UNIQUE는 NULL/빈 ref를 구분하지 못하므로 앱에서 차단)
        if (trim($refType) === '' || $refId <= 0) {
            throw new \InvalidArgumentException('credit() requires non-empty refType and positive refId');
        }
        return DB::transaction(function () use ($userId, $currency, $amount, $reason, $refType, $refId) {
            DB::table('wallets')->insertOrIgnore(['user_id' => $userId, 'currency_code' => $currency, 'balance' => 0, 'created_at' => now(), 'updated_at' => now()]);
            $w = DB::table('wallets')->where('user_id', $userId)->where('currency_code', $currency)->lockForUpdate()->first();   // 지갑 행 잠금(MySQL), SQLite 는 쓰기 직렬화
            // 멱등: 원장 행을 먼저 시도(unique wallet+reason+ref). 이미 있으면 잔액은 건드리지 않고 false
            $ins = DB::table('wallet_transactions')->insertOrIgnore([
                'wallet_id' => $w->id, 'reason_code' => $reason, 'delta' => $amount, 'balance_after' => 0,
                'ref_type' => $refType, 'ref_id' => $refId, 'created_at' => now(),
            ]);
            if ($ins === 0) {
                return false;
            }
            // 원자 갱신: 잔액이 음수가 되면 영향 행 0 -> 부족(트랜잭션 롤백으로 원장 행도 취소). 읽기-계산-쓰기 사이 lost update 없음
            $n = DB::update('update wallets set balance = balance + ?, updated_at = ? where id = ? and balance + ? >= 0', [$amount, now(), $w->id, $amount]);
            if ($n === 0) {
                throw new IllegalAction('insufficient_balance', '잔액이 부족합니다.');
            }
            DB::table('wallet_transactions')->where(['wallet_id' => $w->id, 'reason_code' => $reason, 'ref_type' => $refType, 'ref_id' => $refId])
                ->update(['balance_after' => (int) DB::table('wallets')->where('id', $w->id)->value('balance')]);

            return true;
        });
    }

    /**
     * 신규 유저 시작 영웅/골드/기본 편성 지급 (멱등).
     * 시작 영웅 = ① 이순신(KEY_HERO) 고정 + ② game.starter_hero_rarity(C) 등급 무작위 1명(이순신 제외). 서버가 가입 시 1회만 추첨하고
     * 지급 원장(starter_grant)이 이미 있으면(재호출·기존 계정) 영웅은 건드리지 않는다.
     */
    /** 가입 시 고정 지급하는 캠페인 키 영웅(ch1_s1 필수 영웅) */
    public const KEY_HERO = 'yi_sun_sin';

    public function grantStarter(User $user): void
    {
        DB::transaction(function () use ($user) {
            if (! $this->credit($user->id, 'gold', (int) config('game.starter_gold'), 'starter_grant', 'user', $user->id)) {
                return;   // 이미 지급됨: 재추첨 금지
            }
            $this->credit($user->id, 'pen', (int) config('game.pen.starter', 0), 'starter_pen', 'user', $user->id);   // 시작 펜(소환 통화). 일일 상한 밖
            $heroes = $this->data->heroes();
            $slot = 1;
            foreach ($this->pickStarterCodes() as $code) {
                if (! isset($heroes[$code])) {
                    continue;
                }
                DB::table('user_heroes')->insertOrIgnore([
                    'user_id' => $user->id, 'hero_id' => $heroes[$code]['id'], 'level' => 1, 'exp' => 0,
                    'obtained_at' => now(), 'created_at' => now(), 'updated_at' => now(),
                ]);
                $uhId = DB::table('user_heroes')->where(['user_id' => $user->id, 'hero_id' => $heroes[$code]['id']])->value('id');
                DB::table('parties')->insertOrIgnore(['user_id' => $user->id, 'slot' => $slot++, 'user_hero_id' => $uhId, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    /**
     * 시작 영웅 후보 추첨: 시작 등급 풀(뽑기 풀 기준, 없으면 영웅 데이터 기준)에서 서로 다른 병종 우선으로 N명.
     * 우선순위: 기본 전투 병종(sword/spear/archer/cavalry)·일반 영웅(npc_ 아님) -> 기본 병종 -> 나머지. 풀이 N명 미만이면 있는 만큼만.
     *
     * @return string[]
     */
    public function pickStarterCodes(): array
    {
        $rarity = (string) config('game.starter_hero_rarity', 'C');
        $count = max(0, (int) config('game.starter_hero_count', 1));
        $heroes = $this->data->heroes();
        try {
            $pool = app(GachaService::class)->pool()['by_rarity'][$rarity] ?? [];
        } catch (\Throwable) {
            $pool = [];
        }
        if ($pool === []) {
            foreach ($heroes as $c => $h) {
                ($h['rarity'] ?? null) === $rarity && empty($h['campaign_only']) && empty($h['is_protagonist']) && $pool[] = $c;
            }
        }
        $pool = array_values(array_filter($pool, fn ($c) => $c !== self::KEY_HERO && isset($heroes[$c]) && empty($heroes[$c]['campaign_only']) && empty($heroes[$c]['is_protagonist'])));
        $core = ['sword', 'spear', 'archer', 'cavalry'];
        $tiers = [[], [], []];
        foreach ($pool as $c) {
            $isCore = in_array($heroes[$c]['unit_type'] ?? '', $core, true);
            $tiers[$isCore ? (str_starts_with((string) $c, 'npc_') ? 1 : 0) : 2][] = $c;
        }
        $order = [];
        foreach ($tiers as $t) {
            shuffle($t);
            array_push($order, ...$t);
        }
        $picked = [];
        $types = [];
        foreach ($order as $c) {   // 1차: 병종이 안 겹치는 영웅만
            if (count($picked) >= $count) {
                break;
            }
            $ut = $heroes[$c]['unit_type'] ?? '';
            if (! isset($types[$ut])) {
                $picked[] = $c;
                $types[$ut] = true;
            }
        }
        foreach ($order as $c) {   // 2차: 병종 종류가 부족하면 겹침 허용
            if (count($picked) >= $count) {
                break;
            }
            in_array($c, $picked, true) || $picked[] = $c;
        }

        array_unshift($picked, self::KEY_HERO);   // 슬롯 1 = 캠페인 키 영웅(이순신 고정), 슬롯 2 = C급 무작위

        return $picked;
    }

    /**
     * 편성 검증: 슬롯 상한, 중복, 보유(타인 영웅 포함 거부), 코스트 합 <= 현재 max_cost.
     *
     * @param int[] $userHeroIds 순서 = 슬롯(1번=지휘관)
     * @return array<int,array> user_hero id => ['uh'=>row,'hero'=>heroRow]
     */
    /** @param array<int,string[]>|null $troops user_hero_id => 부대 병종 목록(null이면 저장된 편성 사용) */
    public function validateParty(User $user, array $userHeroIds, ?array $troops = null, array $forced = [], bool $campaign = false, ?int $fixedSlots = null, ?int $costCap = null): array
    {
        if ($userHeroIds === []) {
            throw new IllegalAction('party_empty', '출격 영웅이 최소 1명 필요합니다.');
        }
        $slots = $fixedSlots ?? $this->maxSlots($this->level($user), $campaign);   // fixedSlots: 방 대전 맵 크기별 고정 출전수(레벨 슬롯 대체)
        $freeIds = [];   // 강제/대여(고정 슬롯) 영웅은 슬롯 수만 면제한다. 코스트는 합산에 포함(2026-11-08 변경: 기존에는 면제. 부대 코스트는 troop_cost off 라 0)
        if ($forced) {
            foreach (DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', $userHeroIds)->get() as $uh) {
                $h0 = $this->data->heroById((int) $uh->hero_id);
                isset($forced[$h0['code'] ?? '']) && $freeIds[] = (int) $uh->id;
            }
        }
        if (count($userHeroIds) - count($freeIds) > $slots) {
            throw new IllegalAction('too_many_slots', "출격 인원({$slots}명 상한)을 초과했습니다. 편성을 수정하세요.");
        }
        if (count(array_unique($userHeroIds)) !== count($userHeroIds)) {
            throw new IllegalAction('duplicate_hero', '중복된 영웅이 있습니다.');
        }
        $owned = DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', $userHeroIds)->get()->keyBy('id');
        $out = [];
        foreach ($userHeroIds as $id) {
            if (! isset($owned[$id])) {
                throw new IllegalAction('hero_not_owned', '보유하지 않은 영웅입니다.', 422);
            }
            $hero = $this->data->heroById((int) $owned[$id]->hero_id);
            $out[$id] = ['uh' => $owned[$id], 'hero' => isset($forced[$hero['code']]) ? array_merge($hero, $forced[$hero['code']]) : $hero];
        }
        // 합산 대상은 전달된 출전 영웅($userHeroIds)뿐 -- 파티에 있으나 출전하지 않은 영웅(벤치)은 포함하지 않는다.
        $c = $this->costBreakdown($user, $out, $troops, $campaign);   // 강제 영웅 포함 전체 합산
        $max = $costCap ?? $this->campaignCostCap($this->level($user), $slots, count($freeIds), $campaign);   // costCap: 방 대전 맵 크기별/스테이지 지정 고정 상한(양측 동일)
        if ($c['total'] > $max) {
            throw new IllegalAction(
                'cost_exceeded',
                "편성 코스트({$c['total']})가 상한({$max})을 초과했습니다(영웅 {$c['hero']} + 부대 {$c['troop']}). 편성을 수정하세요.",
                422,
                ['used' => $c['total'], 'max' => $max, 'hero_cost' => $c['hero'], 'troop_cost' => $c['troop']],
            );
        }

        return $out;
    }

    /**
     * 코스트 합산(서버가 단일 출처). 영웅 cost 합 + (troop_cost on이면) 실제 구성 부대 병종 cost 합(진영 유닛 상한 감축 반영).
     *
     * @param array<int,array> $heroes user_hero id => ['uh'=>row,'hero'=>heroRow] (출전 영웅만)
     * @return array{hero:int,troop:int,total:int}
     */
    public function costBreakdown(User $user, array $heroes, ?array $troops = null, bool $campaign = false): array
    {
        $hero = 0;
        $troop = 0;
        $entries = [];
        foreach ($heroes as $id => $o) {
            $hero += (int) $o['hero']['cost'];
            $entries[] = ['row' => $o['hero'], 'level' => (int) $o['uh']->level, 'key' => $id, 'troops' => $troops === null ? null : ($troops[$id] ?? [])];
        }
        if (config('game.rules.troop_cost')) {   // 사용자 선택 > 프리셋 > 기본 편성으로 계산된 실제 구성
            $unitCost = fn (string $t) => (int) ($this->data->rules()->unitType($t)['cost'] ?? 1);
            foreach ($this->squadTroops($entries, $user->id, $campaign) as $list) {
                $troop += array_sum(array_map($unitCost, $list));
            }
        }

        return ['hero' => $hero, 'troop' => $troop, 'total' => $hero + $troop];
    }

    /**
     * 코스트 상한 초과 파티 보정(등급 격차 v1로 영웅 코스트가 오른 기존 유저 보호). 저장 데이터(parties)는 건드리지 않고, 출전 기본 편성에서만 초과분을 뒤쪽 영웅부터 뺀다.
     * 보호 대상(강제·고정·대여 영웅 = $protectedIds)은 빼지 않는다. 보호 영웅만으로도 초과면 더 못 빼고 그대로 반환(validateParty 가 cost_exceeded 로 안내).
     *
     * @param array<int,array> $heroes user_hero id => ['uh'=>row,'hero'=>heroRow] (기본 편성 순서)
     * @param int[] $protectedIds
     * @return array{kept:array<int,array>,dropped:int[]}
     */
    public function trimPartyToCost(User $user, array $heroes, array $protectedIds, int $max, bool $campaign = false): array
    {
        $dropped = [];
        while ($heroes !== [] && $this->costBreakdown($user, $heroes, null, $campaign)['total'] > $max) {
            $pick = null;
            foreach (array_keys($heroes) as $id) {
                in_array($id, $protectedIds, true) || $pick = $id;   // 마지막 비보호 영웅
            }
            if ($pick === null) {
                break;
            }
            unset($heroes[$pick]);
            $dropped[] = $pick;
        }

        return ['kept' => $heroes, 'dropped' => $dropped];
    }

    /** 저장된 파티의 코스트 합산(FE 표시용). 보유하지 않는 행은 무시. @return array{hero:int,troop:int,total:int,max:int} */
    public function savedPartyCost(User $user, bool $campaign = false): array
    {
        $ids = array_slice($this->party($user), 0, $this->maxSlots($this->level($user), $campaign));
        $owned = DB::table('user_heroes')->where('user_id', $user->id)->whereIn('id', $ids)->get()->keyBy('id');
        $heroes = [];
        foreach ($ids as $id) {
            if (isset($owned[$id])) {
                $heroes[$id] = ['uh' => $owned[$id], 'hero' => $this->data->heroById((int) $owned[$id]->hero_id)];
            }
        }

        return $this->costBreakdown($user, $heroes, null, $campaign) + ['max' => $this->maxCost($this->level($user), $campaign)];
    }

    /**
     * 캠페인 배치 확정 시 자동 저장: parties = '마지막 출격 구성'. 이미 배치 검증을 통과한 id만 받으므로 재검증하지 않는다.
     * 강제/대여 영웅은 호출 측에서 제외(스테이지가 매번 서버에서 채움). 비면 기존 값을 유지한다.
     *
     * @param int[] $userHeroIds 배치 순서
     */
    public function rememberLastParty(User $user, array $userHeroIds): void
    {
        $userHeroIds = array_values(array_unique($userHeroIds));
        if ($userHeroIds === []) {
            return;
        }
        DB::table('parties')->where('user_id', $user->id)->delete();
        foreach ($userHeroIds as $i => $id) {
            DB::table('parties')->insert(['user_id' => $user->id, 'slot' => $i + 1, 'user_hero_id' => $id, 'troops' => null, 'created_at' => now(), 'updated_at' => now()]);
        }
    }

    /**
     * (deprecated: 별도 편성 메뉴 제거, 영웅 선택은 출격 화면에서만. parties는 '마지막 출격 구성'이며 배치 확정 시 자동 저장된다. 호환용 유지)
     * 편성 저장. 영웅별 고정 부대 병종 규칙: 사용자 troops 입력은 무시(검증 오류·저장 없음, 하위 호환). parties.troops는 항상 null로 저장.
     *
     * @param  array<int,string[]>|null  $troops (무시됨, 호환용 시그니처)
     */
    public function saveParty(User $user, array $userHeroIds, ?array $troops = null, bool $keepTroops = false): void
    {
        $userHeroIds = array_values($userHeroIds);
        $this->validateParty($user, $userHeroIds);
        DB::transaction(function () use ($user, $userHeroIds) {
            DB::table('parties')->where('user_id', $user->id)->delete();
            foreach ($userHeroIds as $i => $id) {
                DB::table('parties')->insert(['user_id' => $user->id, 'slot' => $i + 1, 'user_hero_id' => $id, 'troops' => null, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
    }

    /** 영웅-부대 편성 설정(config). $campaign=true(스테이지 전투 state.campaign)면 아군 상한을 max_units_per_side_stage로, 아니면 PvP 기본 max_units_per_side(12) */
    public function squadCfg(bool $campaign = false): array
    {
        $max = $campaign ? \App\Game\ArmyBuilder::allyStageCap() : max(1, min(\App\Game\ArmyBuilder::unitHardCap(), (int) config('game.max_units_per_side')));

        return [
            'slots' => config('game.troop_slots'), 'slots_by_rarity' => (array) config('game.troop_slots_by_rarity'), 'cap' => (int) config('game.troop_cap'), 'max_units' => $max,
            'default_by_type' => config('game.troop_default_by_type'),
        ];
    }

    /**
     * squad on 전투용 영웅별 부대 병종 계획. entries: [['row'=>heroRow,'level'=>int,'key'=>user_hero_id|index,'troops'=>무시], ...]
     * 영웅 troop_type 고정 > (troop_type null 폴백) 영웅 프리셋(presets.units) > 병종 기본 편성(config). 사용자 troops·parties.troops는 읽지 않는다.
     *
     * @return array<int,string[]>
     */
    public function squadTroops(array $entries, ?int $userId, bool $campaign = false): array
    {
        $plan = [];
        foreach ($entries as $i => $e) {
            $preset = ! empty($e['row']['troop_type']) ? null : DB::table('presets')->where('hero_id', $e['row']['id'])->value('units');
            $plan[$i] = ['row' => $e['row'], 'level' => $e['level'], 'troops' => null, 'preset' => $preset ? json_decode($preset, true) : null];
        }

        return SquadPlanner::plan($plan, $this->squadCfg($campaign));
    }

    /** @return array<int,string[]> 고정 병종 규칙으로 사용자 선택 부대는 더 이상 읽지 않음(항상 빈 배열, FE 호환) */
    public function partyTroops(User $user): array
    {
        return [];
    }

    public function party(User $user): array
    {
        return DB::table('parties')->where('user_id', $user->id)->orderBy('slot')->pluck('user_hero_id')->map(fn ($v) => (int) $v)->all();
    }

    /**
     * 유저 exp 지급. lost update 방지: exp는 원자적 증가(exp = exp + ?) 후, 갱신된 행(최신 level/exp)을 기준으로 레벨업을 계산한다.
     *
     * @return array{leveled:bool,level:int,max_cost:int,exp:int,gained:int}
     */
    public function addUserExp(User $user, int $amount): array
    {
        return DB::transaction(function () use ($user, $amount) {
            DB::table('users')->where('id', $user->id)->update(['exp' => DB::raw('exp + '.(int) $amount)]);
            $row = DB::table('users')->where('id', $user->id)->lockForUpdate()->first(['level', 'exp']);
            $level = (int) $row->level;
            $exp = (int) $row->exp;
            $leveled = false;
            $fromLevel = $level;
            $maxLevel = (int) DB::table('user_level_costs')->max('level');
            while ($level < $maxLevel) {
                $need = (int) DB::table('user_level_costs')->where('level', $level)->value('exp_to_next');
                if ($need <= 0 || $exp < $need) {
                    break;
                }
                $exp -= $need;
                $level++;
                $leveled = true;
            }
            DB::table('users')->where('id', $user->id)->update(['level' => $level, 'exp' => $exp]);
            $user->level = $level;
            $user->exp = $exp;

            $slots = $this->maxSlots($level);

            return [
                'leveled' => $leveled, 'level' => $level, 'max_cost' => $this->maxCost($level),
                'max_party_slots' => $slots, 'campaign_max_party_slots' => $this->maxSlots($level, true), 'campaign_max_cost' => $this->maxCost($level, true), 'slots_increased' => $slots > $this->maxSlots($fromLevel),
                'exp' => $exp, 'gained' => $amount,
            ];
        });
    }

    /** @return array{user_hero_id:int,hero:string,gained:int,from_level:int,level:int,exp:int} */
    public function addHeroExp(int $userHeroId, int $amount): array
    {
        $uh = DB::table('user_heroes')->where('id', $userHeroId)->first();
        $from = $level = (int) $uh->level;
        $exp = (int) $uh->exp + $amount;
        $max = \App\Game\LevelRewards::maxLevel($this->data->heroById((int) $uh->hero_id)['rarity'] ?? null);   // 등급별 만렙(만렙 초과 보유 영웅은 레벨 유지·상승만 정지)
        $needs = DB::table('hero_levels')->pluck('exp_to_next', 'level')->all();   // 1회 조회(레벨업 루프 내 쿼리 제거)
        while ($level < $max) {
            $need = (int) ($needs[$level] ?? 0);
            if ($need <= 0 || $exp < $need) {
                break;
            }
            $exp -= $need;
            $level++;
        }
        DB::table('user_heroes')->where('id', $userHeroId)->update(['level' => $level, 'exp' => $exp, 'updated_at' => now()]);

        $toNext = $level < $max ? (int) ($needs[$level] ?? 0) : 0;

        return ['user_hero_id' => $userHeroId, 'hero' => $this->data->heroById((int) $uh->hero_id)['code'], 'gained' => $amount, 'from_level' => $from, 'level' => $level, 'exp' => $exp,
            'leveled' => $level > $from, 'exp_to_next' => $toNext, 'rewards_unlocked' => \App\Game\LevelRewards::unlocked($from, $level, $this->data->heroById((int) $uh->hero_id)['rarity'] ?? null)];
    }
}
