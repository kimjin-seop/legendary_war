<?php

namespace App\Services;

use App\Game\ArmyBuilder;
use App\Game\IllegalAction;
use Illuminate\Database\UniqueConstraintViolationException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * 장비·상점. 정의는 equipment_items(database/data/equipment_*.json -> game:seed), 모든 수치는 데이터/config(game.equipment) 값.
 * 구매: gold 차감(wallet_transactions reason=shop_equip) + 보유 개체 생성 + 구매 로그를 한 트랜잭션, 멱등키 = (user_id, request_id).
 * 전투 적용: ArmyBuilder::makeUnit이 영웅 row의 equip를 scale() 이후 평탄 가산(클램프 포함). 합계는 이 서비스가 장착 현황(DB)에서 계산한다.
 */
class EquipmentService
{
    public const SLOTS = ['helm', 'armor', 'gloves', 'boots', 'accessory'];

    private const TABLES = ['equipment_items', 'user_equipment', 'hero_equipment', 'equipment_purchases'];

    public function __construct(private readonly GameData $data, private readonly ProgressionService $progress)
    {
    }

    /** 기능 on + 테이블 존재(마이그레이션 미적용 DB에서 500 방지) */
    public function available(): bool
    {
        if (! config('game.equipment.enabled', false)) {
            return false;
        }
        foreach (self::TABLES as $t) {
            if (! Schema::hasTable($t)) {
                return false;
            }
        }

        return true;
    }

    public function assertAvailable(): void
    {
        if (! $this->available()) {
            throw new IllegalAction('equipment_disabled', '장비 기능을 사용할 수 없습니다.', 404);
        }
    }

    /**
     * 영웅별 장착 현황. @param int[] $userHeroIds
     *
     * @return array<int,array<string,array>> user_hero_id => slot => {ue_id,code,name,slot,rarity,hp,atk,def}
     */
    public function equippedBy(array $userHeroIds): array
    {
        if (! $userHeroIds || ! $this->available()) {
            return [];
        }
        $out = [];
        $rows = DB::table('hero_equipment as he')
            ->join('user_equipment as ue', 'ue.id', '=', 'he.user_equipment_id')
            ->join('equipment_items as ei', 'ei.id', '=', 'ue.equipment_item_id')
            ->whereIn('he.user_hero_id', $userHeroIds)
            ->get(['he.user_hero_id', 'he.slot', 'ue.id as ue_id', 'ei.code', 'ei.name_ko', 'ei.rarity', 'ei.hp', 'ei.atk', 'ei.def']);
        foreach ($rows as $r) {
            $out[(int) $r->user_hero_id][$r->slot] = ['ue_id' => (int) $r->ue_id, 'code' => $r->code, 'name' => $r->name_ko, 'slot' => $r->slot, 'rarity' => $r->rarity, 'hp' => (int) $r->hp, 'atk' => (int) $r->atk, 'def' => (int) $r->def];
        }

        return $out;
    }

    /** @return array{hp:int,atk:int,def:int} 원시 합계(클램프 전) */
    public static function sum(array $slots): array
    {
        $t = ['hp' => 0, 'atk' => 0, 'def' => 0];
        foreach ($slots as $e) {
            foreach ($t as $k => $_) {
                $t[$k] += (int) $e[$k];
            }
        }

        return $t;
    }

    /** 응답용 장착 요약: slot => {id,code,name,rarity} */
    public static function summary(array $slots): array
    {
        $o = [];
        foreach ($slots as $slot => $e) {
            $o[$slot] = ['id' => $e['ue_id'], 'code' => $e['code'], 'name' => $e['name'], 'rarity' => $e['rarity']];
        }

        return $o;
    }

    /**
     * 전투 생성용: entries(key=user_hero_id)의 영웅 row에 equip(합계)·equip_slots를 서버 계산값으로 채운다.
     * 장착이 없거나 기능 off/테이블 없음이면 entries 불변. $pvp면 config equipment.pvp_scale을 합계에 곱해 내림.
     *
     * @param  array<int,array{row:array,level:int,key:mixed}>  $entries
     */
    public function attach(array $entries, bool $pvp = false, float $extraScale = 1.0): array
    {
        if (! $this->available()) {
            return $entries;
        }
        $by = $this->equippedBy(array_map(fn ($e) => (int) $e['key'], $entries));
        $scale = ($pvp ? (float) config('game.equipment.pvp_scale', 1.0) : 1.0) * $extraScale;   // extraScale: 랭크 정규화 등 호출부 추가 배율
        foreach ($entries as $i => $e) {
            $slots = $by[(int) $e['key']] ?? [];
            if (! $slots) {
                continue;
            }
            $sum = self::sum($slots);
            if ($scale !== 1.0) {
                $sum = array_map(fn ($v) => (int) floor($v * $scale), $sum);
            }
            $entries[$i]['row']['equip'] = $sum;
            $entries[$i]['row']['equip_slots'] = array_map(fn ($s) => ['code' => $s['code'], 'name' => $s['name']], $slots);
        }

        return $entries;
    }

    /** 영웅 목록·상세용: 슬롯 요약 + 적용될 합계(클램프 후) + 원시 합계 */
    public function heroView(array $hero, array $slots): array
    {
        $raw = self::sum($slots);
        $eff = $slots ? ArmyBuilder::clampEquip($this->data->rules()->unitType($hero['unit_type']), $hero, $raw) : ['hp' => 0, 'atk' => 0, 'def' => 0];

        return ['equipment' => (object) self::summary($slots), 'equip_total' => $eff, 'equip_raw' => $raw];
    }

    private function gold(int $userId): int
    {
        return (int) (DB::table('wallets')->where('user_id', $userId)->where('currency_code', 'gold')->value('balance') ?? 0);
    }

    private function ownedCount(int $userId): int
    {
        return DB::table('user_equipment')->where('user_id', $userId)->count();
    }

    private function cap(): int
    {
        return (int) config('game.equipment.inventory_cap', 100);
    }

    private function itemView(object $i, int $owned): array
    {
        return ['code' => $i->code, 'name' => $i->name_ko, 'description' => $i->description, 'culture' => $i->culture, 'slot' => $i->slot, 'rarity' => $i->rarity,
            'stats' => ['hp' => (int) $i->hp, 'atk' => (int) $i->atk, 'def' => (int) $i->def], 'req_level' => (int) $i->req_level, 'price_gold' => (int) $i->price_gold, 'owned' => $owned];
    }

    /** GET /api/shop */
    public function shop(int $userId): array
    {
        $this->assertAvailable();
        $owned = DB::table('user_equipment as ue')->join('equipment_items as ei', 'ei.id', '=', 'ue.equipment_item_id')->where('ue.user_id', $userId)->groupBy('ei.code')->selectRaw('ei.code, count(*) as n')->pluck('n', 'code');
        $items = DB::table('equipment_items')->where('enabled', 1)->orderBy('sort_order')->orderBy('id')->get()->map(fn ($i) => $this->itemView($i, (int) ($owned[$i->code] ?? 0)))->all();

        return ['items' => $items, 'gold' => $this->gold($userId), 'inventory_count' => (int) $owned->sum(), 'inventory_cap' => $this->cap()];
    }

    /** POST /api/shop/buy. 같은 request_id 재전송 = 같은 결과(replay=true). */
    public function buy(int $userId, string $code, string $requestId): array
    {
        $this->assertAvailable();
        try {
            $r = DB::transaction(fn () => $this->buyTx($userId, $code, $requestId));
            app(QuestService::class)->record($userId, 'equip_buy', 'equip:'.$r['purchase_id']);   // 퀘스트 훅(멱등, 실패 무시)

            return $r;
        } catch (UniqueConstraintViolationException) {
            return DB::transaction(fn () => $this->replay($userId, $code, $requestId) ?? throw new IllegalAction('shop_conflict', '요청이 충돌했습니다. 다시 시도하세요.', 409));
        }
    }

    private function replay(int $userId, string $code, string $requestId): ?array
    {
        $log = DB::table('equipment_purchases as p')->join('equipment_items as ei', 'ei.id', '=', 'p.equipment_item_id')
            ->where(['p.user_id' => $userId, 'p.request_id' => $requestId])->first(['p.*', 'ei.code']);
        if (! $log) {
            return null;
        }
        if ($log->code !== $code) {
            throw new IllegalAction('request_id_reused', '같은 request_id로 다른 요청을 보낼 수 없습니다.', 409);
        }

        return $this->buyResponse($userId, $log->code, (int) $log->user_equipment_id, (int) $log->price_gold, (int) $log->id, true);
    }

    private function buyResponse(int $userId, string $code, int $ueId, int $price, int $purchaseId, bool $replay): array
    {
        $i = DB::table('equipment_items')->where('code', $code)->first();

        return ['replay' => $replay, 'purchase_id' => $purchaseId, 'item' => $this->itemView($i, (int) DB::table('user_equipment')->where('user_id', $userId)->where('equipment_item_id', $i->id)->count()),
            'user_equipment_id' => $ueId, 'gold_spent' => $price, 'gold' => $this->gold($userId), 'inventory_count' => $this->ownedCount($userId), 'inventory_cap' => $this->cap()];
    }

    private function buyTx(int $userId, string $code, string $requestId): array
    {
        if ($r = $this->replay($userId, $code, $requestId)) {
            return $r;
        }
        $item = DB::table('equipment_items')->where('code', $code)->where('enabled', 1)->first();   // 가격은 DB만 신뢰
        if (! $item) {
            throw new IllegalAction('item_not_found', '존재하지 않는 상품입니다.', 404);
        }
        if ($this->ownedCount($userId) >= $this->cap()) {
            throw new IllegalAction('inventory_full', '인벤토리가 가득 찼습니다.', 422);
        }
        $price = (int) $item->price_gold;
        if ($this->gold($userId) < $price) {   // 쓰기 전에 거부
            throw new IllegalAction('insufficient_gold', '골드가 부족합니다.', 422);
        }
        $now = now();
        $ueId = DB::table('user_equipment')->insertGetId(['user_id' => $userId, 'equipment_item_id' => $item->id, 'acquired_at' => $now, 'source' => 'shop', 'created_at' => $now, 'updated_at' => $now]);
        $pid = DB::table('equipment_purchases')->insertGetId(['user_id' => $userId, 'request_id' => $requestId, 'equipment_item_id' => $item->id, 'user_equipment_id' => $ueId, 'price_gold' => $price, 'created_at' => $now]);
        if ($price > 0) {
            $this->progress->credit($userId, 'gold', -$price, 'shop_equip', 'equipment_purchase', $pid);   // 잔액 부족 시 IllegalAction -> 전체 롤백
        }

        return $this->buyResponse($userId, $code, $ueId, $price, $pid, false);
    }

    /** GET /api/inventory */
    public function inventory(int $userId): array
    {
        $this->assertAvailable();
        $rows = DB::table('user_equipment as ue')->join('equipment_items as ei', 'ei.id', '=', 'ue.equipment_item_id')
            ->leftJoin('hero_equipment as he', 'he.user_equipment_id', '=', 'ue.id')
            ->where('ue.user_id', $userId)->orderBy('ei.sort_order')->orderBy('ue.id')
            ->get(['ue.id', 'ue.acquired_at', 'ue.source', 'ei.code', 'ei.name_ko', 'ei.slot', 'ei.rarity', 'ei.hp', 'ei.atk', 'ei.def', 'ei.req_level', 'he.user_hero_id as equipped_uh']);
        $uhHero = DB::table('user_heroes')->where('user_id', $userId)->pluck('hero_id', 'id');
        $items = $rows->map(function ($r) use ($uhHero) {
            $eq = null;
            if ($r->equipped_uh !== null) {
                $h = $this->data->heroById((int) ($uhHero[$r->equipped_uh] ?? 0));
                $eq = ['user_hero_id' => (int) $r->equipped_uh, 'hero' => $h['code'] ?? null, 'display_name' => $h['display_name'] ?? null];
            }

            return ['id' => (int) $r->id, 'code' => $r->code, 'name' => $r->name_ko, 'slot' => $r->slot, 'rarity' => $r->rarity,
                'stats' => ['hp' => (int) $r->hp, 'atk' => (int) $r->atk, 'def' => (int) $r->def], 'req_level' => (int) $r->req_level,
                'acquired_at' => $r->acquired_at, 'source' => $r->source, 'equipped_by' => $eq];
        })->all();

        return ['items' => $items, 'inventory_count' => count($items), 'inventory_cap' => $this->cap()];
    }

    /**
     * PUT /api/heroes/{user_hero_id}/equipment — body {equipment:{slot: 개체 id | null}}. 주어진 슬롯만 변경(null=해제), 전체 원자 처리.
     *
     * @param  array<string,int|null>  $changes
     */
    public function equip(int $userId, int $userHeroId, array $changes): array
    {
        $this->assertAvailable();
        $uh = DB::table('user_heroes')->where('id', $userHeroId)->where('user_id', $userId)->first();
        if (! $uh) {
            throw new IllegalAction('hero_not_found', '보유하지 않은 영웅입니다.', 404);
        }
        foreach (array_keys($changes) as $slot) {
            if (! in_array($slot, self::SLOTS, true)) {
                throw new IllegalAction('invalid_slot', '알 수 없는 슬롯입니다.', 422);
            }
        }
        DB::transaction(function () use ($userId, $userHeroId, $uh, $changes) {
            foreach ($changes as $slot => $ueId) {
                if ($ueId === null) {
                    DB::table('hero_equipment')->where(['user_hero_id' => $userHeroId, 'slot' => $slot])->delete();
                    continue;
                }
                $ue = DB::table('user_equipment as ue')->join('equipment_items as ei', 'ei.id', '=', 'ue.equipment_item_id')
                    ->where('ue.id', (int) $ueId)->where('ue.user_id', $userId)->first(['ue.id', 'ei.slot', 'ei.req_level', 'ei.code']);   // 타 유저 개체는 존재 은닉(404)
                if (! $ue) {
                    throw new IllegalAction('equipment_not_found', '보유하지 않은 장비입니다.', 404);
                }
                if ($ue->slot !== $slot) {
                    throw new IllegalAction('slot_mismatch', '장비 슬롯이 일치하지 않습니다.', 422);
                }
                if ((int) $ue->req_level > (int) $uh->level) {
                    throw new IllegalAction('level_too_low', "영웅 레벨이 부족합니다(필요 Lv{$ue->req_level}).", 422, ['req_level' => (int) $ue->req_level, 'hero_level' => (int) $uh->level]);
                }
                $other = DB::table('hero_equipment')->where('user_equipment_id', $ue->id)->first();
                if ($other && (int) $other->user_hero_id !== $userHeroId) {
                    throw new IllegalAction('equipped_elsewhere', '다른 영웅이 장착 중인 장비입니다.', 409, ['user_hero_id' => (int) $other->user_hero_id]);
                }
                if ($other && $other->slot === $slot) {
                    continue;   // 이미 장착(멱등)
                }
                DB::table('hero_equipment')->where(['user_hero_id' => $userHeroId, 'slot' => $slot])->delete();
                DB::table('hero_equipment')->insert(['user_hero_id' => $userHeroId, 'slot' => $slot, 'user_equipment_id' => $ue->id, 'created_at' => now(), 'updated_at' => now()]);
            }
        });
        $h = $this->data->heroById((int) $uh->hero_id);

        return ['user_hero_id' => $userHeroId, 'hero' => $h['code']] + $this->heroView($h, $this->equippedBy([$userHeroId])[$userHeroId] ?? []);
    }
}
