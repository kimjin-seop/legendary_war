<?php

namespace App\Services;

use App\Support\FacingFlag;

use App\Game\ArmyBuilder;
use App\Game\Engine;
use App\Game\IllegalAction;
use App\Models\Battle;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * 방(룸): solo(컴퓨터 자유 대전) / pvp(2인).
 * - 접근은 방 참가자만(비참가자는 404로 존재 은닉).
 * - 시간 제한/접속 판정은 서버 시각 기준이며 스케줄러가 없으므로 방 API 호출 시점에 지연 평가(tick)한다.
 * - 모든 변경은 트랜잭션 + battles.version 낙관적 락(BattleService::persist)으로 직렬화한다.
 */
class RoomService
{
    private const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    public function __construct(
        private readonly GameData $data,
        private readonly ProgressionService $progress,
        private readonly BattleService $battles,
    ) {
    }

    private function engine(): Engine
    {
        return $this->data->engine();
    }

    private function cfg(string $k): int
    {
        return (int) config("game.room.$k");
    }

    private function cfgd(string $k, int $default): int
    {
        return (int) config("game.room.$k", $default);
    }

    /**
     * 만료 지연 평가: 마지막 접속(room_players.last_seen_at)이 TTL(기본 30분)을 넘긴 대기/배치/진행 방을 닫고
     * 연결된 전투를 abandoned(보상 없음)로 정리한다. 유령 방으로 인한 already_in_room 잠김을 막는다.
     * 후보가 없으면 쓰기를 하지 않는다(읽기만).
     */
    public function expireStale(): void
    {
        $cutoff = now()->subMinutes($this->cfgd('ttl_minutes', 30));
        $ids = DB::table('rooms')->whereIn('status', ['waiting', 'deployment', 'in_progress'])
            ->whereNotExists(fn ($q) => $q->select(DB::raw(1))->from('room_players')->whereColumn('room_players.room_id', 'rooms.id')->where('room_players.last_seen_at', '>=', $cutoff))
            ->pluck('id');
        if ($ids->isEmpty()) {
            return;
        }
        DB::transaction(function () use ($ids) {
            DB::table('rooms')->whereIn('id', $ids)->update(['status' => 'closed', 'updated_at' => now()]);
            DB::table('battles')->whereIn('room_id', $ids)->whereIn('status', ['deployment', 'in_progress'])->update([
                'status' => 'abandoned', 'settled_at' => now(), 'turn_deadline_at' => null, 'updated_at' => now(),
                'result' => json_encode(['win' => false, 'abandoned' => true, 'expired' => true, 'stars' => 0, 'gold' => 0, 'heroes' => [], 'user' => null]),
            ]);
        });
    }

    /** last_seen_at 갱신을 N초 이내면 건너뛴다(폴링마다 쓰기 방지) */
    private function touch(object $me): void
    {
        $ls = $me->last_seen_at;
        if (! $ls || \Illuminate\Support\Carbon::parse($ls)->lt(now()->subSeconds($this->cfgd('touch_seconds', 10)))) {
            DB::table('room_players')->where('id', $me->id)->update(['last_seen_at' => now()]);
        }
    }

    private function newCode(): string
    {
        do {
            $code = '';
            for ($i = 0; $i < 8; $i++) {
                $code .= self::ALPHABET[random_int(0, 31)];
            }
        } while (DB::table('rooms')->where('code', $code)->exists());

        return $code;
    }

    /** @return array{0:object,1:object} [room, myPlayer]  비참가자는 404 */
    private function membership(User $user, string $code): array
    {
        $room = DB::table('rooms')->where('code', strtoupper($code))->first();
        $me = $room ? DB::table('room_players')->where(['room_id' => $room->id, 'user_id' => $user->id])->first() : null;
        if (! $room || ! $me) {
            throw new IllegalAction('room_not_found', '방을 찾을 수 없습니다.', 404);
        }

        return [$room, $me];
    }

    private function battleOf(object $room): ?Battle
    {
        return $room->battle_id ? Battle::find($room->battle_id) : null;
    }

    private function activeRoomOf(User $user): ?object
    {
        $this->expireStale();

        return DB::table('rooms')->join('room_players', 'room_players.room_id', '=', 'rooms.id')
            ->where('room_players.user_id', $user->id)->whereIn('rooms.status', ['waiting', 'deployment', 'in_progress'])
            ->select('rooms.*')->first();
    }

    /**
     * 방 생성. mapCode: MapCatalog 허용 맵 code(maps.meta 기반, 레거시 8종 호환), 'random'(solo=전체, pvp=pvp_fair 후보), 생략 시 기본(첫) 맵.
     */
    public function create(User $user, string $mode, string $visibility, ?string $mapCode = null, bool $followTroops = false): object
    {
        return DB::transaction(function () use ($user, $mode, $visibility, $mapCode, $followTroops) {
            if ($this->activeRoomOf($user)) {
                throw new IllegalAction('already_in_room', '이미 참여 중인 방이 있습니다.', 409);
            }
            $mapId = $this->pickMap($mode, $mapCode);
            $id = DB::table('rooms')->insertGetId([
                'code' => $this->newCode(), 'host_user_id' => $user->id, 'mode' => $mode, 'visibility' => $mode === 'solo' ? 'private' : $visibility,
                'status' => 'waiting', 'map_id' => $mapId, 'turn_limit_seconds' => $this->cfg('turn_limit_seconds'),
                'disconnect_seconds' => $this->cfg('disconnect_seconds'), 'follow_troops' => $followTroops, 'created_at' => now(), 'updated_at' => now(),
            ]);
            DB::table('room_players')->insert(['room_id' => $id, 'user_id' => $user->id, 'side' => 'a', 'ready' => true, 'last_seen_at' => now(), 'created_at' => now(), 'updated_at' => now()]);

            return DB::table('rooms')->where('id', $id)->first();
        });
    }

    /** 공개 대기 방 목록 (private은 노출하지 않음) */
    /** 맵 선택 검증(서버가 maps 테이블과 허용 목록 기준으로 판단) */
    private function pickMap(string $mode, ?string $mapCode): int
    {
        // 허용 목록은 maps.meta 기반(MapCatalog). random: solo=전체 후보, pvp=pvp_fair 후보 중 서버 추첨. 비공정·보류 맵은 422 map_not_allowed.
        return (new MapCatalog)->pick($mode, $mapCode);
    }

    public function listPublic(): array
    {
        $this->expireStale();

        return DB::table('rooms')->join('users', 'users.id', '=', 'rooms.host_user_id')
            ->where(['rooms.status' => 'waiting', 'rooms.visibility' => 'public', 'rooms.mode' => 'pvp'])
            ->whereRaw('(select count(*) from room_players where room_players.room_id = rooms.id) < 2')
            ->orderByDesc('rooms.id')->limit(50)
            ->join('maps', 'maps.id', '=', 'rooms.map_id')
            ->get(['rooms.code', 'rooms.mode', 'users.name as host', 'rooms.turn_limit_seconds', 'rooms.created_at', 'rooms.map_id', 'maps.code as map_code', 'maps.width as map_width', 'maps.height as map_height'])
            ->map(function ($r) {
                $p = MapCatalog::partySizeFor((int) $r->map_id);
                unset($r->map_id);
                $r->party_size = $p['party_size'];
                $r->size_class = $p['size_class'];

                return $r;
            })->all();
    }

    public function join(User $user, string $code): object
    {
        return DB::transaction(function () use ($user, $code) {
            $room = DB::table('rooms')->where('code', strtoupper($code))->first();
            if (! $room || $room->mode !== 'pvp') {
                throw new IllegalAction('room_not_found', '방을 찾을 수 없습니다.', 404);
            }
            if (DB::table('room_players')->where(['room_id' => $room->id, 'user_id' => $user->id])->exists()) {
                return $room;   // 멱등
            }
            if ($room->status !== 'waiting') {
                throw new IllegalAction('room_not_joinable', '참가할 수 없는 방입니다.', 409);
            }
            if ($this->activeRoomOf($user)) {
                throw new IllegalAction('already_in_room', '이미 참여 중인 방이 있습니다.', 409);
            }
            if (DB::table('room_players')->where('room_id', $room->id)->count() >= 2) {
                throw new IllegalAction('room_full', '방이 가득 찼습니다.', 409);
            }
            DB::table('room_players')->insert(['room_id' => $room->id, 'user_id' => $user->id, 'side' => 'b', 'ready' => false, 'last_seen_at' => now(), 'created_at' => now(), 'updated_at' => now()]);

            return $room;
        });
    }

    public function leave(User $user, string $code): void
    {
        DB::transaction(function () use ($user, $code) {
            [$room, $me] = $this->membership($user, $code);
            if ($room->status === 'waiting') {
                if ($me->side === 'a') {
                    DB::table('rooms')->where('id', $room->id)->update(['status' => 'closed', 'updated_at' => now()]);
                } else {
                    DB::table('room_players')->where('id', $me->id)->delete();
                }

                return;
            }
            if (in_array($room->status, ['deployment', 'in_progress'], true)) {
                $b = $this->battleOf($room);
                if ($b && $b->status !== 'finished') {
                    $this->forfeit($room, $b, $me->side, 'left');   // 진행 중 나가기 = 기권
                }
            }
        });
    }

    public function setReady(User $user, string $code, bool $ready): void
    {
        DB::transaction(function () use ($user, $code, $ready) {
            [$room, $me] = $this->membership($user, $code);
            if ($room->status !== 'waiting') {
                throw new IllegalAction('room_not_waiting', '대기 중인 방이 아닙니다.', 409);
            }
            DB::table('room_players')->where('id', $me->id)->update(['ready' => $ready, 'last_seen_at' => now(), 'updated_at' => now()]);
        });
    }

    /** 방장이 시작: 전투를 배치 단계로 생성. pvp는 2인 모두 준비 필요 */
    public function start(User $user, string $code): object
    {
        return DB::transaction(function () use ($user, $code) {
            [$room, $me] = $this->membership($user, $code);
            if ($room->host_user_id !== $user->id) {
                throw new IllegalAction('not_host', '방장만 시작할 수 있습니다.', 403);
            }
            if ($room->status !== 'waiting') {
                throw new IllegalAction('room_not_waiting', '대기 중인 방이 아닙니다.', 409);
            }
            $players = DB::table('room_players')->where('room_id', $room->id)->get();
            if ($room->mode === 'pvp') {
                if ($players->count() < 2) {
                    throw new IllegalAction('need_opponent', '상대가 필요합니다.', 409);
                }
                if ($players->contains(fn ($p) => ! $p->ready)) {
                    throw new IllegalAction('not_all_ready', '모든 참가자가 준비해야 합니다.', 409);
                }
            }
            $map = $this->data->map((int) $room->map_id);
            $seed = random_int(1, 2147483647);
            $state = ArmyBuilder::initialState($this->data->rules(), $map, $seed, (int) config('game.max_turns'), config('game.first_side'), FacingFlag::forUser($user->id), \App\Support\SquadFlag::forUser($user->id), \App\Support\AlternateFlag::forUser($user->id), $this->engine()->options()['snowball'], $this->engine()->mpKnobs(), $this->engine()->microModeFor('room', $room->code ?? null));
            $opp = $players->firstWhere('side', 'b');
            $b = Battle::create([
                'user_id' => $room->host_user_id, 'opponent_user_id' => $opp?->user_id, 'mode' => $room->mode === 'pvp' ? 'pvp' : 'free',
                'stage_id' => null, 'map_id' => $map['id'], 'room_id' => $room->id, 'status' => 'deployment', 'seed' => $seed,
                'turn' => 1, 'current_side' => config('game.first_side'), 'version' => 0, 'state' => $state,
            ]);
            DB::table('rooms')->where('id', $room->id)->update(['status' => 'deployment', 'battle_id' => $b->id, 'updated_at' => now()]);
            DB::table('room_players')->where('room_id', $room->id)->update(['confirmed' => false, 'deployment' => null, 'missed_turns' => 0, 'last_seen_at' => now()]);

            return DB::table('rooms')->where('id', $room->id)->first();
        });
    }

    public function deployment(User $user, string $code): array
    {
        [$room, $me] = $this->membership($user, $code);
        $b = $this->battleOf($room);
        if (! $b || $b->status !== 'deployment') {
            throw new IllegalAction('deployment_closed', '배치 단계가 아닙니다.', 409);
        }
        $map = $this->data->map((int) $b->map_id);
        $cands = [];
        foreach (DB::table('user_heroes')->where('user_id', $user->id)->get() as $uh) {
            $h = $this->data->heroById((int) $uh->hero_id);
            if (! empty($h['campaign_only'])) {   // 캠페인 전용(주인공 등)은 방 편성 후보에서 제외
                continue;
            }
            $cands[] = ['user_hero_id' => (int) $uh->id, 'hero' => $h['code'], 'name' => $h['name_ko'], 'title' => $h['title'], 'short_name' => $h['short_name'], 'display_name' => $h['display_name'], 'rarity' => $h['rarity'], 'cost' => $h['cost'], 'level' => (int) $uh->level, 'unit_type' => $h['unit_type'], 'troop_type' => $h['troop_type'], 'troop_label' => $this->data->troopLabel($h['troop_type'])];
        }

        foreach ($cands as $ci => $c) {
            $cands[$ci]['portrait'] = $this->battles->portraitFor($c['hero'], (int) $user->id);
            $cands[$ci]['detail'] = $this->data->heroDetail($this->data->heroes()[$c['hero']]);
        }
        $meta = $this->data->mapMeta((int) $b->map_id);
        $rule = $this->progress->roomPartyRule($user, (int) $b->map_id);   // 맵 크기별 고정 출전수(레벨 슬롯 대신)
        $defParty = array_slice($this->progress->party($user), 0, $rule['party_size']);

        return [
            'map_code' => $meta['code'], 'biome' => $meta['biome'], 'party_size' => $rule['party_size'], 'required_party' => $rule['required'], 'size_class' => $rule['size_class'],
            'side' => $me->side, 'max_cost' => $rule['cost_cap'], 'max_party_slots' => $rule['party_size'],
            'default_party' => $defParty, 'candidates' => $cands, 'deploy_zone' => $map['deploy_zones'][$me->side],
            'default_positions' => (object) $this->battles->defaultPositions($user, $b->state, $map['deploy_zones'][$me->side], $defParty),
            'width' => $map['width'], 'height' => $map['height'], 'tiles' => $b->state['tiles'],
            'submitted' => $me->deployment ? json_decode($me->deployment, true) : null, 'confirmed' => (bool) $me->confirmed,
        ] + $this->data->mapExtras((int) $b->map_id, [(int) $b->state['width'], (int) $b->state['height']]) + $this->battles->formationInfo($user, $b->state);
    }

    public function submitDeployment(User $user, string $code, array $placements): void
    {
        DB::transaction(function () use ($user, $code, $placements) {
            [$room, $me] = $this->membership($user, $code);
            $b = $this->battleOf($room);
            if (! $b || $b->status !== 'deployment') {
                throw new IllegalAction('deployment_closed', '배치 단계가 아닙니다.', 409);
            }
            if ($me->confirmed) {
                throw new IllegalAction('deployment_closed', '이미 확정했습니다.', 409);
            }
            $this->battles->validatePlacementList($user, $b->state, (int) $b->map_id, $me->side, $placements, null, true);
            DB::table('room_players')->where('id', $me->id)->update(['deployment' => json_encode(array_values($placements)), 'last_seen_at' => now(), 'updated_at' => now()]);
        });
    }

    /** 배치 확정. 모든 사람 참가자가 확정하면 전투 시작(in_progress) */
    public function confirm(User $user, string $code): void
    {
        DB::transaction(function () use ($user, $code) {
            [$room, $me] = $this->membership($user, $code);
            $b = $this->battleOf($room);
            if (! $b || $b->status !== 'deployment') {
                throw new IllegalAction('deployment_closed', '배치 단계가 아닙니다.', 409);
            }
            if (! $me->deployment) {
                throw new IllegalAction('deployment_missing', '배치를 먼저 제출하세요.');
            }
            $this->battles->validatePlacementList($user, $b->state, (int) $b->map_id, $me->side, json_decode($me->deployment, true), null, true);
            DB::table('room_players')->where('id', $me->id)->update(['confirmed' => true, 'last_seen_at' => now(), 'updated_at' => now()]);
            if (DB::table('room_players')->where('room_id', $room->id)->where('confirmed', false)->exists()) {
                return;
            }
            $this->beginBattle($room, $b);
        });
    }

    private function beginBattle(object $room, Battle $b): void
    {
        $engine = $this->engine();
        $state = $b->state;
        $map = $this->data->map((int) $b->map_id);
        $growth = (float) config('game.troop_growth_pct');
        $players = DB::table('room_players')->where('room_id', $room->id)->get();
        $hostLevels = [];
        $rankNorm = $room->mode === 'pvp' && DB::table('rank_matches')->where('room_id', $room->id)->exists() ? (array) config('game.rank.normalize') : null;   // 랭크 매치 방만 큐별 정규화(레벨 상한·장비 배율). 일반 PvP/solo 는 null
        foreach ($players as $p) {
            $u = User::find($p->user_id);
            $placements = json_decode($p->deployment, true);
            $sz = MapCatalog::partySizeFor((int) $b->map_id);
            $party = $this->progress->validateParty($u, array_column($placements, 'user_hero_id'), null, [], false, $sz['party_size'], (int) config('game.room.cost_cap')[$sz['size_class']]);   // 확정 시점 코스트(맵 크기별 고정 상한)·고정 출전수 재검증
            foreach ($party as $pp) {
                empty($pp['hero']['campaign_only']) || throw new IllegalAction('campaign_only_hero', '캠페인 전용 영웅은 방 대전에 출전할 수 없습니다.', 422);
            }
            $entries = [];
            $positions = [];
            foreach ($placements as $pl) {
                $lvl = (int) $party[$pl['user_hero_id']]['uh']->level;
                $rankNorm !== null && $lvl = min($lvl, (int) $rankNorm['level_cap']);
                $entries[] = ['row' => $party[$pl['user_hero_id']]['hero'], 'level' => $lvl, 'key' => $pl['user_hero_id']];
                $positions[$pl['user_hero_id']] = [$pl['x'], $pl['y']];
                $hostLevels[$p->side][] = (int) $party[$pl['user_hero_id']]['uh']->level;
            }
            $entries = app(HeroStarService::class)->attach($entries, true);   // 별(★) 보너스: apply_pvp=false(기본)면 불변
            $entries = app(EquipmentService::class)->attach($entries, $room->mode === 'pvp', $rankNorm !== null ? (float) $rankNorm['equip_scale'] : 1.0);   // 장비 합계(solo/PvP 공통, pvp는 equipment.pvp_scale 적용)
            $presetId = DB::table('presets')->where('hero_id', $entries[0]['row']['id'])->value('id');
            $rankNorm !== null && $state['no_variants'] = true;   // 랭크전은 특수유닛(variant) 비활성: 기본 병종
            ArmyBuilder::addSide($engine, $state, $p->side, $entries, $this->data->presetUnits((int) $entries[0]['row']['id'], $entries[0]['row']['unit_type']), $map['deploy_zones'][$p->side], $positions, $growth, $this->battles->squadPlanWithPositions($u, $state, $entries, $placements));
            if ($p->side === 'a') {
                $b->deployment = $placements;   // 정산(solo 자유 대전)에서 참가 영웅 exp 지급에 사용
            }
        }
        if ($room->mode === 'solo') {
            // 컴퓨터 상대: 방장 유저 레벨의 코스트 한도 내 무작위 편성, 영웅 레벨은 방장 영웅 평균
            $host = User::find($room->host_user_id);
            $lv = max(1, (int) round(array_sum($hostLevels['a']) / count($hostLevels['a'])));
            $party = ArmyBuilder::randomParty($this->data->heroes(), (int) config('game.room.cost_cap')[MapCatalog::partySizeFor((int) $b->map_id)['size_class']], MapCatalog::partySizeFor((int) $b->map_id)['party_size'], $state);   // 컴퓨터도 맵 크기별 같은 출전수
            $entries = [];
            foreach ($party as $i => $h) {
                $entries[] = ['row' => $h, 'level' => $lv, 'key' => $i];
            }
            $presetId = DB::table('presets')->where('hero_id', $party[0]['id'])->value('id');
            ArmyBuilder::addSide($engine, $state, 'b', $entries, ArmyBuilder::fixedTypesFor($party[0], $this->data->presetUnits((int) $party[0]['id'], $party[0]['unit_type'])), $map['deploy_zones']['b'], null, $growth, \App\Game\Engine::squadOn($state) ? $this->progress->squadTroops($entries, null) : null);
        }
        $state['side'] = config('game.first_side');
        $version = $b->version;
        $b->state = $state;
        $b->status = 'in_progress';
        $b->current_side = $state['side'];
        $b->turn_deadline_at = $room->mode === 'pvp' ? now()->addSeconds((int) $room->turn_limit_seconds) : null;   // 제한시간은 PvP 방만(solo=무제한)
        DB::table('battles')->where('id', $b->id)->update(['deployment' => json_encode($b->deployment), 'turn_deadline_at' => $b->turn_deadline_at]);
        $this->battles->persist($b, $version);
        DB::table('rooms')->where('id', $room->id)->update(['status' => 'in_progress', 'updated_at' => now()]);
        DB::table('room_players')->where('room_id', $room->id)->update(['missed_turns' => 0, 'last_seen_at' => now()]);
    }

    /** 행동 제출: 현재 턴 소유자만. end_turn 후 solo는 봇 턴을 서버가 처리 */
    public function action(User $user, string $code, array $action): array
    {
        [$room, $events, $timedOut, $closed] = DB::transaction(function () use ($user, $code, $action) {
            [$room, $me] = $this->membership($user, $code);
            // 행동자는 tick(기권 판정) 전에 접속 시각을 먼저 갱신한다: 오래 쉬다 돌아와 행동해도 기권되지 않게
            DB::table('room_players')->where('id', $me->id)->update(['last_seen_at' => now()]);
            $b = $this->battleOf($room);
            $dl = $b && $b->status === 'in_progress' && $room->mode === 'pvp' ? $b->turn_deadline_at : null;
            // 내 턴 입력 마감+유예 경과 여부(tick이 자동 종료하기 전에 판정)
            $late = $dl && $b->state['side'] === $me->side && \Illuminate\Support\Carbon::parse($dl)->addSeconds($this->graceSeconds())->lte(now());
            $this->tick($room, $b);
            $room = DB::table('rooms')->where('id', $room->id)->first();
            $b = $this->battleOf($room)?->refresh();
            if (! $b || $b->status === 'deployment' || $room->status === 'waiting') {
                throw new IllegalAction('deployment_phase', '전투가 아직 시작되지 않았습니다.', 409);
            }
            if ($b->status !== 'in_progress') {
                return [$room, [], false, true];   // tick이 만든 기권·정산이 롤백되지 않도록 커밋 후 트랜잭션 밖에서 409
            }
            $beforeActive = $b->state['alt']['active'] ?? null;
            $beforeSide = $b->state['side'];
            if ($late) {   // 마감+유예 경과: tick이 이미 자동 종료(대기 처리)함 -> 이 행동은 적용하지 않음
                return [$room, [], true, false];
            }
            if (array_key_exists('follow', $action)) {   // 병사 따라가기는 방 옵션이 켜진 경우에만(서버가 최종 판단, 꺼진 방은 무시=기본 동작)
                $action['follow'] = $action['follow'] === true && (bool) ($room->follow_troops ?? false) && ($action['type'] ?? '') === 'end_turn';
            }
            [$state, $events] = $this->engine()->apply($b->state, $me->side, $action);   // 소유/합법성 검증(불법이면 롤백)
            $version = $b->version;
            $this->battles->log($b, 'player', $me->side, $action, $events);
            $b->state = $state;
            $this->battles->applyStatus($b, $state);
            $this->persist($b, $version);
            DB::table('room_players')->where('id', $me->id)->update(['missed_turns' => 0, 'last_seen_at' => now()]);
            $all = $events;
            // 차례(마감) 전환: end_turn / 교대 행동에서는 활성화 시작·종료(활성 부대 변경·진영 교체)마다 마감 재설정
            $switched = ($action['type'] ?? '') === 'end_turn'
                || (Engine::altOn($state) && ((($state['alt']['active'] ?? null) !== $beforeActive) || $state['side'] !== $beforeSide));
            if ($b->status === 'in_progress' && $switched) {
                if ($room->mode === 'solo' && $state['side'] === 'b') {
                    $all = array_merge($all, $this->battles->botTurn($b));
                }
                if ($b->status === 'in_progress') {
                    $this->resetDeadline($b, $room);
                }
            }
            if ($b->status === 'finished') {
                $this->finishRoom($room, $b);
            }

            return [$room, Engine::redactEvents($all, $me->side), false, false];
        });
        if ($closed) {
            throw new IllegalAction('battle_finished', '이미 종료된 전투입니다.', 409);
        }
        if ($timedOut && in_array($action['type'] ?? null, ['move', 'attack', 'use_skill'], true)) {   // 트랜잭션 커밋 후 거절(자동 종료는 유지)
            throw new IllegalAction('turn_timeout', '턴 입력 시간이 지나 턴이 자동 종료되었습니다.', 409);
        }

        return [$room, $events, $timedOut];
    }

    private function graceSeconds(): int
    {
        return max(0, (int) config('game.turn_input_grace_seconds', 2));
    }

    private function persist(Battle $b, int $version): void
    {
        $this->battles->persist($b, $version);
    }

    private function resetDeadline(Battle $b, object $room): void
    {
        if ($room->mode !== 'pvp') {   // solo 방은 마감 없음
            return;
        }
        DB::table('battles')->where('id', $b->id)->update(['turn_deadline_at' => now()->addSeconds((int) $room->turn_limit_seconds)]);
    }

    private function finishRoom(object $room, Battle $b): void
    {
        DB::table('rooms')->where('id', $room->id)->update(['status' => 'finished', 'updated_at' => now()]);
        DB::table('battles')->where('id', $b->id)->update(['turn_deadline_at' => null]);
        $this->battles->settle($b->refresh(), User::find($b->user_id));
    }

    private function forfeit(object $room, Battle $b, string $loserSide, string $reason): void
    {
        $state = $b->state;
        $events = [];
        $state['status'] = 'finished';
        $state['winner'] = $loserSide === 'a' ? 'b' : 'a';
        $state['end_reason'] = 'forfeit_'.$reason;   // 랭킹 집계용: 기권·타임아웃·퇴장 승리 구분(settle이 win_by_forfeit로 기록)
        Engine::emit($state, $events, 'battle_end', ['winner' => $state['winner'], 'reason' => 'forfeit_'.$reason, 'side' => $loserSide]);
        $version = $b->version;
        $this->battles->log($b, 'system', $loserSide, ['type' => 'forfeit', 'reason' => $reason], $events);
        $b->state = $state;
        $this->battles->applyStatus($b, $state);
        $this->persist($b, $version);
        if ($reason === 'left' && $room->mode === 'solo') {
            // 스테이지 abandon과 동일 정책: 진행 중 나가기는 패배 처리, 보상 없음(정산 선점으로 이후 settle 차단)
            DB::table('battles')->where('id', $b->id)->update([
                'settled_at' => now(),
                'result' => json_encode(['win' => false, 'abandoned' => true, 'stars' => 0, 'gold' => 0, 'heroes' => [], 'user' => null]),
            ]);
        }
        $this->finishRoom($room, $b);
    }

    /** 시간 초과/접속 끊김 지연 평가 (트랜잭션 안에서 호출) */
    private function tick(object $room, ?Battle $b): void
    {
        for ($i = 0; $i < 4 && $b && $b->status === 'in_progress'; $i++) {
            $players = DB::table('room_players')->where('room_id', $room->id)->get()->keyBy('side');
            $stale = now()->subSeconds((int) $room->disconnect_seconds);
            if ($room->mode === 'pvp') {
                $cur = $b->state['side'];
                $order = [$cur, $cur === 'a' ? 'b' : 'a'];   // 둘 다 끊기면 현재 턴 소유자가 기권
                foreach ($order as $side) {
                    $p = $players[$side] ?? null;
                    if ($p && $p->last_seen_at && \Illuminate\Support\Carbon::parse($p->last_seen_at)->lt($stale)) {
                        $this->forfeit($room, $b, $side, 'disconnect');

                        return;
                    }
                }
            }
            $deadline = DB::table('battles')->where('id', $b->id)->value('turn_deadline_at');
            if ($room->mode !== 'pvp' || ! $deadline || \Illuminate\Support\Carbon::parse($deadline)->addSeconds($this->graceSeconds())->gt(now())) {
                return;
            }
            $side = $b->state['side'];
            $p = $players[$side];
            $missed = $p->missed_turns + 1;
            DB::table('room_players')->where('id', $p->id)->update(['missed_turns' => $missed]);
            if ($missed >= $this->cfg('max_missed_turns')) {
                $this->forfeit($room, $b, $side, 'timeout');

                return;
            }
            // 자동 턴 종료
            if (Engine::altOn($b->state)) {   // 교대 행동: 활성화당 마감 -> 현재(없으면 첫 ready) 부대 자동 종료
                [$state, $events] = $this->engine()->timeoutActivation($b->state, $side);
                $autoType = 'end_activation';
            } else {
                [$state, $events] = $this->engine()->apply($b->state, $side, ['type' => 'end_turn']);
                $autoType = 'end_turn';
            }
            $version = $b->version;
            $this->battles->log($b, 'system', $side, ['type' => $autoType, 'auto' => true], $events);
            $b->state = $state;
            $this->battles->applyStatus($b, $state);
            $this->persist($b, $version);
            if ($b->status === 'in_progress' && $room->mode === 'solo' && $state['side'] === 'b') {
                $this->battles->botTurn($b);
            }
            if ($b->status === 'finished') {
                $this->finishRoom($room, $b);

                return;
            }
            $this->resetDeadline($b, $room);
            $b->refresh();
        }
    }

    /** tick(쓰기)이 필요한가: 턴 마감 경과, pvp 참가자 접속 끊김(90초 폴링 부재). 평시엔 읽기 전용으로 응답한다. */
    private function tickNeeded(object $room, Battle $b): bool
    {
        if ($room->mode === 'pvp' && $b->turn_deadline_at && \Illuminate\Support\Carbon::parse($b->turn_deadline_at)->addSeconds($this->graceSeconds())->lte(now())) {
            return true;
        }
        if ($room->mode === 'pvp') {
            return DB::table('room_players')->where('room_id', $room->id)
                ->where('last_seen_at', '<', now()->subSeconds((int) $room->disconnect_seconds))->exists();
        }

        return false;
    }

    /** 폴링: 서버 계산 남은 시간, 마지막 seq, 상대 접속 상태, after_seq 이후 이벤트 증분 (평시 읽기 전용, 접속 갱신은 throttle) */
    public function poll(User $user, string $code, int $afterSeq): array
    {
        [$room, $me] = $this->membership($user, $code);
        $this->expireStale();
        $this->touch($me);
        $room = DB::table('rooms')->where('id', $room->id)->first();
        $b = $this->battleOf($room);
        if ($b && $b->status === 'in_progress' && $this->tickNeeded($room, $b)) {
            try {
                DB::transaction(function () use ($room) {
                    $r = DB::table('rooms')->where('id', $room->id)->first();
                    $this->tick($r, $this->battleOf($r));
                });
            } catch (IllegalAction $e) {   // R3: 동시 요청이 먼저 상태를 바꿈 -> 아래에서 최신 상태 재조회
                if ($e->reason !== 'version_conflict') {
                    throw $e;
                }
            }
            $room = DB::table('rooms')->where('id', $room->id)->first();
            $b = $this->battleOf($room);
        }
        $players = DB::table('room_players')->join('users', 'users.id', '=', 'room_players.user_id')->where('room_id', $room->id)
            ->orderBy('side')->get(['room_players.*', 'users.name'])
            ->map(function ($p) use ($user) {
                $since = $p->last_seen_at ? max(0, (int) \Illuminate\Support\Carbon::parse($p->last_seen_at)->diffInSeconds(now(), false)) : null;

                return [
                    'side' => $p->side, 'user_id' => (int) $p->user_id, 'nickname' => $p->name, 'is_me' => (int) $p->user_id === $user->id,
                    'ready' => (bool) $p->ready, 'confirmed' => (bool) $p->confirmed, 'missed_turns' => (int) $p->missed_turns,
                    'seconds_since_seen' => $since, 'connected' => $since !== null && $since <= $this->cfg('presence_seconds'),
                ];
            })->all();

        $turn = null;
        $events = [];
        $lastSeq = 0;
        $view = null;
        if ($b) {
            $lastSeq = (int) $b->last_event_seq;
            if ($b->status !== 'deployment') {
                $view = $this->battles->view($b, collect($players)->firstWhere('is_me', true)['side'] ?? null);   // 상대 영웅 MP는 비율만 공개
            }
            if ($b->status === 'in_progress') {
                $side = $b->state['side'];
                $owner = collect($players)->firstWhere('side', $side);
                $deadline = $room->mode === 'pvp' && $b->turn_deadline_at ? \Illuminate\Support\Carbon::parse($b->turn_deadline_at) : null;
                $turn = [
                    'side' => $side, 'owner_user_id' => $owner['user_id'] ?? null, 'is_my_turn' => ($owner['user_id'] ?? null) === $user->id,
                    'remaining_seconds' => $deadline ? max(0, (int) now()->diffInSeconds($deadline, false)) : null,
                ];
            }
            if ($afterSeq < $lastSeq) {   // 증분: (battle_id, last_event_seq) 인덱스로 필요한 행만 읽음
                foreach (DB::table('battle_actions')->where('battle_id', $b->id)->where('last_event_seq', '>', $afterSeq)->orderBy('seq')->pluck('events') as $json) {
                    foreach (json_decode($json, true) ?: [] as $e) {
                        if ($e['seq'] > $afterSeq) {
                            $events[] = $e;   // 아래에서 상대 MP 수치 가림
                        }
                    }
                }
            }
        }

        return [
            'room' => ['code' => $room->code, 'mode' => $room->mode, 'visibility' => $room->visibility, 'status' => $room->status,
                'map_code' => $this->data->mapMeta((int) $room->map_id)['code'], 'map_width' => (int) DB::table('maps')->where('id', $room->map_id)->value('width'), 'map_height' => (int) DB::table('maps')->where('id', $room->map_id)->value('height'),
                'party_size' => MapCatalog::partySizeFor((int) $room->map_id)['party_size'], 'size_class' => MapCatalog::partySizeFor((int) $room->map_id)['size_class'],
                'turn_limit_seconds' => (int) $room->turn_limit_seconds, 'follow_troops' => (bool) ($room->follow_troops ?? false), 'is_host' => $room->host_user_id === $user->id] + $this->data->mapExtras((int) $room->map_id),
            'players' => $players, 'my_side' => $me->side, 'battle_status' => $b?->status, 'winner' => $b?->winner,
            'turn' => $turn, 'last_seq' => $lastSeq, 'events' => Engine::redactEvents($events, collect($players)->firstWhere('is_me', true)['side'] ?? null), 'battle' => $view,
            'result' => ($b && $b->status === 'finished') ? $b->result : null, 'server_time' => now()->toIso8601String(),
        ];
    }
}
