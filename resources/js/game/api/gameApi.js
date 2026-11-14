import { api, session, sessionCache } from './client.js';
import { setGachaCultures } from '../systems/names.js';
import { rememberStageChapters } from '../campaign/stageChapterInfo.js';

// /api/profile 의 공개 규칙(rules) 마지막 값. 로비 탭 구성(rules.gacha) 판단용. 받기 전에는 null(= 모든 플래그 off 로 간주)
let lastRules = null;
export const publicRules = () => lastRules;
// 저장된 편성의 서버 코스트 {hero, troop, total, max}(GET/PUT /api/party 응답 cost). 서버가 단일 출처, 없으면 null
let lastPartyCost = null;
const keepCost = (d) => { if (d && d.cost && typeof d.cost === 'object') lastPartyCost = d.cost; };

// 가챠 요청 ID: 8~64자 [A-Za-z0-9_-]. 클릭 1회당 1개 생성, 네트워크 오류 재시도 때는 같은 값을 재사용(서버 멱등)
export function newGachaRequestId() {
    const rand = globalThis.crypto?.randomUUID?.().replace(/-/g, '')
        ?? Array.from({ length: 24 }, () => Math.floor(Math.random() * 36).toString(36)).join('');
    return `g_${Date.now().toString(36)}_${rand}`.slice(0, 64);
}

// 시즌 전쟁 시나리오 선택(세션 동안 유지). null = 서버 기본
let warScenario = null;
export const setWarScenario = (code) => { warScenario = code && /^[a-z0-9_]{1,32}$/.test(code) ? code : null; };
export const getWarScenario = () => warScenario;
const wq = () => (warScenario ? { scenario: warScenario } : undefined);
const mapPreviewCache = new Map(); // code -> Promise(미리보기 응답). 실패 시 제거(재시도 가능)

// POST /api/battles/{id}/forecast 응답 -> FE 예측 형식(서버 필드명은 여기서만 안다). 확정 계약(박백엔 2026-11-14) 200 필드 13개:
//  target_hp_before, target_hp_after, target_max_hp, attacker_hp_before, attacker_hp_after, attacker_max_hp, dmg, counter_dmg,
//  target_defeated, attacker_defeated, micro(미시 실제 시뮬 true / shadow false), flank, affinity(null 가능). 격파 = *_hp_after 0 + *_defeated true.
//  병력 단계는 서버가 주지 않음 -> 호출부가 *_hp_after 를 stepsOf(hp, max_hp)로 환산. target_hp_after 가 없으면 형식 오류(throw -> 호출부 폴백)
function normalizeForecast(f) {
    const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
    const nn = (v) => (num(v) == null ? null : Math.max(0, num(v)));
    const targetHpAfter = nn(f?.target_hp_after);
    if (targetHpAfter == null) throw new Error('forecast_malformed');
    const attackerHpAfter = nn(f.attacker_hp_after);
    return {
        targetHpBefore: nn(f.target_hp_before), targetHpAfter, targetMaxHp: nn(f.target_max_hp),
        attackerHpBefore: nn(f.attacker_hp_before), attackerHpAfter, attackerMaxHp: nn(f.attacker_max_hp),
        dmg: nn(f.dmg), counterDmg: nn(f.counter_dmg),
        targetDefeated: f.target_defeated === true || targetHpAfter <= 0,
        attackerDefeated: f.attacker_defeated === true || attackerHpAfter === 0,
        micro: f.micro === true, flank: f.flank ?? null, affinity: f.affinity ?? null,
    };
}

// 플레이어/스테이지/편성/배치/방 API (전투 진행 API 는 FE A 의 battleApi.js 담당)
export const gameApi = {
    async profile(force = false) {
        if (!force && session.profile) return session.profile;
        const d = await api('GET', '/api/profile');
        if (d.rules && typeof d.rules === 'object') lastRules = d.rules;
        sessionCache.setProfile(d.profile);
        return d.profile;
    },
    async heroes(force = false) {
        if (!force && session.heroes) return session.heroes;
        const d = await api('GET', '/api/heroes');
        sessionCache.setHeroes(d.heroes ?? []);
        return session.heroes;
    },
    // 편성 라인업(2026-11-14, routes/api.php): GET {lineup[], count, max, avg_level} / PUT {hero_ids} 전량 교체(같은 응답). 캐시 = session.lineup
    async lineup(force = false) {
        if (!force && session.lineup) return session.lineup;
        const d = await api('GET', '/api/lineup');
        session.lineup = d; return d;
    },
    async saveLineup(heroIds) {
        const d = await api('PUT', '/api/lineup', { body: { hero_ids: heroIds }, retry: 0 }); // api() 3번째 인자 = {body,query,auth,retry,signal}
        session.lineup = d; return d;
    },
    async party(force = false) {
        if (!force && session.party && session.profile) return { party: session.party, profile: session.profile, cost: lastPartyCost };
        const d = await api('GET', '/api/party');
        sessionCache.setParty(d.party ?? []);
        if (d.profile) sessionCache.setProfile(d.profile);
        keepCost(d);
        return { party: session.party, profile: session.profile, cost: lastPartyCost };
    },
    // troops: [[병종..], ..] 영웅 슬롯 순서(선택, squad 편성). 비면 서버 프리셋 폴백
    async saveParty(userHeroIds, troops = null) {
        const d = await api('PUT', '/api/party', { body: troops ? { user_hero_ids: userHeroIds, troops } : { user_hero_ids: userHeroIds }, retry: 0 });
        sessionCache.setParty(d.party ?? userHeroIds);
        if (d.profile) sessionCache.setProfile(d.profile);
        keepCost(d);
        return d;
    },
    // 배열(서버 순서 = 필수 영웅 충족 스테이지 먼저, FE 재정렬 금지) + .chapters(서가별 필수 영웅 집계 {"<chapter>": {need[{code,name,owned}], need_count, owned_count, ready}}, 없으면 null)
    //  + .chapterOrder(chapter_order: 충족 챕터 먼저 [int], 없으면 null). filter() 후에도 쓰도록 campaign/stageChapterInfo 에도 보관
    stages: () => api('GET', '/api/stages').then((d) => {
        const a = Array.isArray(d.stages) ? d.stages : [];
        a.chapters = d.chapters && typeof d.chapters === 'object' ? d.chapters : null;
        a.chapterOrder = Array.isArray(d.chapter_order) ? d.chapter_order : null;
        rememberStageChapters(a.chapters, a.chapterOrder);
        return a;
    }),
    // -> {battle, deployment}
    challenge: (stageId) => api('POST', `/api/stages/${stageId}/challenge`, { retry: 0 }),

    battle: {
        show: (id) => api('GET', `/api/battles/${id}`).then((d) => d.battle),
        deployment: (id) => api('GET', `/api/battles/${id}/deployment`),
        submit: (id, placements) => api('PUT', `/api/battles/${id}/deployment`, { body: { placements }, retry: 0 }),
        confirm: (id) => api('POST', `/api/battles/${id}/confirm`, { retry: 0 }),
        abandon: (id) => api('POST', `/api/battles/${id}/abandon`, { retry: 0 }),
        // 이어하기: {battles:[{battle_id, stage_id, stage_code, stage_name, status(deployment|in_progress), turn, current_side, updated_at}] 최근순, max_open}
        active: () => api('GET', '/api/battles/active').then((d) => ({ battles: Array.isArray(d?.battles) ? d.battles : [], maxOpen: Math.max(1, Number(d?.max_open) || 1) })), // 서버 상한 기본 1(2026-11-14)
    },

    // 공격 예측(미시 모드 on 전투 전용, 서버 개체별 교전 시뮬). 요청 {unit_id, target_id, x?, y?}(x,y = 임시 이동 칸, 서버 미전송 이동).
    // 응답 필드명 매핑은 이 함수(normalizeForecast) 한 곳에서만 한다(계약 확정 시 여기만 고침). 재시도 없음 + 짧은 타임아웃(실패 시 호출부가 로컬 예측으로 폴백)
    // -> normalizeForecast 결과. 오류(404 battle_not_found, 409 out_of_range·not_your_turn 등, 403, 422, 시간 초과 code 'aborted')는 ApiError throw -> 호출부가 토스트 없이 폴백
    async forecastAttack(battleId, { unitId, targetId, x, y } = {}, { timeoutMs = 2000 } = {}) {
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const timer = ctl ? setTimeout(() => ctl.abort(), timeoutMs) : 0;
        try {
            const body = { unit_id: unitId, target_id: targetId, ...(Number.isInteger(x) && Number.isInteger(y) ? { x, y } : {}) };
            const d = await api('POST', `/api/battles/${encodeURIComponent(battleId)}/forecast`, { body, retry: 0, signal: ctl?.signal });
            return normalizeForecast(d);
        } finally { clearTimeout(timer); }
    },

    rooms: {
        list: () => api('GET', '/api/rooms').then((d) => d.rooms ?? []),
        // mapCode: 생략(null) = 서버 기본, 목록 code, 'random'(서버 추첨 — 최종 맵은 응답 room.map_code)
        // opts.followTroops(선택): 방 옵션 '병사 자동 따라가기'(서버 follow_troops, 기본 false·랭크 방은 서버가 항상 false). 생략하면 필드를 보내지 않는다(기존 호출 불변)
        create: (mode, visibility, mapCode = null, opts = {}) => api('POST', '/api/rooms', { body: { mode, visibility, ...(mapCode ? { map_code: mapCode } : {}), ...(typeof opts.followTroops === 'boolean' ? { follow_troops: opts.followTroops } : {}) }, retry: 0 }),
        join: (code) => api('POST', '/api/rooms/join', { body: { code: String(code).toUpperCase() }, retry: 0 }),
        poll: (code, afterSeq = 0, signal) => api('GET', `/api/rooms/${code}`, { query: { after_seq: afterSeq }, retry: 0, signal }),
        leave: (code) => api('POST', `/api/rooms/${code}/leave`, { retry: 0 }),
        ready: (code, ready) => api('POST', `/api/rooms/${code}/ready`, { body: { ready }, retry: 0 }),
        start: (code) => api('POST', `/api/rooms/${code}/start`, { retry: 0 }),
        deployment: (code) => api('GET', `/api/rooms/${code}/deployment`),
        submit: (code, placements) => api('PUT', `/api/rooms/${code}/deployment`, { body: { placements }, retry: 0 }),
        confirm: (code) => api('POST', `/api/rooms/${code}/confirm`, { retry: 0 }),
    },

    // 방 채팅(pvp 참가자만, solo 방 409 chat_not_available). body 는 서버 HTML 이스케이프 완료 -> ui/RoomChat.js 가 디코드 후 textContent 로만 표시
    chat: {
        // -> {messages[{id,side,name,mine,kind,quick_id,body,created_at}], latest_id, has_more, unread, can_send, cannot_send_reason, muted, read_only}
        messages: (code, sinceId = 0, read = false, signal) => api('GET', `/api/rooms/${code}/messages`, { query: { since_id: sinceId, read: read ? 1 : 0 }, retry: 0, signal }),
        sendText: (code, text) => api('POST', `/api/rooms/${code}/messages`, { body: { kind: 'text', text }, retry: 0 }),
        sendQuick: (code, quickId) => api('POST', `/api/rooms/${code}/messages`, { body: { kind: 'quick', quick_id: quickId }, retry: 0 }),
        report: (code, id, reason) => api('POST', `/api/rooms/${code}/messages/${id}/report`, { body: { reason }, retry: 0 }),
        // -> {muted, can_send, cannot_send_reason, is_guest, free_text, max_length, send_interval_seconds, report_reasons, quick_presets[{id,text}]}
        settings: (code) => api('GET', `/api/rooms/${code}/chat-settings`, { retry: 0 }),
        setMuted: (code, muted) => api('PUT', `/api/rooms/${code}/chat-settings`, { body: { muted: !!muted }, retry: 0 }),
    },

    // 맵 목록/미리보기(방 만들기). 목록은 타일 없이(include_tiles 미사용), 미리보기는 선택 시에만 요청 + 세션 캐시
    maps: {
        // filters: {mode:'solo'|'pvp', per_side?, biome?, size_class?:'S'|'M'|'L'} -> {maps:[...], default_code}
        list: (filters = {}) => api('GET', '/api/maps', { query: filters }).then((d) => ({ maps: d.maps ?? [], default_code: d.default_code ?? null })),
        preview(code) {
            mapPreviewCache.get(code) ?? mapPreviewCache.set(code, api('GET', `/api/maps/${encodeURIComponent(code)}/preview`).catch((e) => { mapPreviewCache.delete(code); throw e; }));
            return mapPreviewCache.get(code);
        },
    },

    // 퀘스트(메인·일일·주간). claimable_count = 로비 빨간 점
    quests: {
        list: () => api('GET', '/api/quests'),
        // -> {claimed, reward{gold,user_exp,pen}, quest, claimable_count}. 같은 퀘스트 중복 수령은 409(멱등 아님) -> 자동 재시도 없음
        claim: (code) => api('POST', `/api/quests/${encodeURIComponent(code)}/claim`, { retry: 0 }),
    },
    // 시즌 전쟁(routes/api.php 상단 주석). 공격 응답 {battle_id, territory_battle_id, territory, battle} 이후 전투는 기존 /api/battles/{id}/*
    // 시즌 전쟁. 시나리오(임진·프랑스·로마 동시 시즌) 선택 = setWarScenario(code). 선택이 있으면 모든 war 요청에 ?scenario= (join 은 body.scenario)를 붙인다.
    //  선택이 없으면(null) 서버 기본(가입한 시즌 > 첫 활성 시즌)
    war: {
        active: () => api('GET', '/api/war/active', { query: wq() }), // -> {active, season_id|null, joined, scenario_code, seasons[]}(멀티 진입 분기, 시즌 없음도 200 active=false)
        seasons: () => api('GET', '/api/war/seasons'), // -> {seasons[{season_id, scenario_code, name, end_at, joined, country}]} 진행 중 시즌 목록(시나리오 선택용)
        state: () => api('GET', '/api/war/state', { query: wq() }),
        // -> {count, last_id, my_country}(로비 뱃지). 시즌 없음·미가입·게스트 = {0,0,null}
        unread: (afterId = 0) => api('GET', '/api/war/unread', { query: { ...wq(), after_id: Math.max(0, Number(afterId) || 0) }, retry: 0 }),
        join: (country, scenario = null) => { const sc = scenario || warScenario; return api('POST', '/api/war/join', { body: { country, ...(sc ? { scenario: sc } : {}) }, retry: 0 }); }, // 가입 body.scenario 필수(서버 2026-11-04)
        map: () => api('GET', '/api/war/map', { query: wq() }),
        attack: (code) => api('POST', `/api/war/territories/${encodeURIComponent(code)}/attack`, { query: wq(), retry: 0 }),
        ranking: () => api('GET', '/api/war/ranking', { query: wq() }),
        events: ({ afterId, limit } = {}) => api('GET', '/api/war/events', { query: { ...wq(), ...(afterId ? { after_id: afterId } : {}), ...(limit ? { limit } : {}) } }),
        history: () => api('GET', '/api/war/history', { query: wq() }),
        // -> {season_id, battles[{battle_id, territory, territory_name, status, result(att_win|def_win|draw|null), win, occ_before, occ_after, occ_delta, captured, created_at, settled_at}]} 최신순
        myBattles: ({ limit = 10 } = {}) => api('GET', '/api/war/my-battles', { query: { ...wq(), limit } }),
    },
    // 개인 PvP 전적(docs/PVP_RECORD_SPEC.md §1) -> {guest, summary{wins,losses,draws,total,win_rate,win_rate_decided,recent10[]}, records[{battle_id,result,reason,forfeit_by_me,opponent_name,map_name,my_side,rounds,ended_at}], page{page,per_page,total,last_page}}
    me: {
        record: ({ page = 1, perPage = 20 } = {}) => api('GET', '/api/me/record', { query: { page, per_page: perPage } }),
    },
    // 랭크 대전(RankController, 회원 전용). me -> {season{id,name,starts_at,ends_at}, me{rank|null,name,rating,peak_rating,wins,losses,draws,games}}
    //  ranking -> {season, entries[{rank,name,rating,wins,losses,draws,games,is_me}], me} / queue 등록·취소·상태 -> {state:'idle'|'queued'|'matched', ...}
    //  queued: waited_seconds, rating, range, timeout_in / matched: match_id, room_code, side, opponent{name,rating}, deploy_deadline_seconds / idle: timeout?, cancelled?
    //  match(id) -> {match_id, status, result, reason, side, rating_before, rating_after, delta, opponent{name,rating}, settled_at}
    // 숨은 종장(ch999, docs/HIDDEN_CHAPTER_SPEC.md 응답 계약): 잠김 {unlocked:false, progress{cleared,total}, chapter:null} / 해금 {unlocked:true, progress, chapter{chapter:999, stages[{id,code,name,clear_count}]}}
    hiddenChapter: () => api('GET', '/api/hidden-chapter'),
    rank: {
        me: () => api('GET', '/api/rank/me'),
        ranking: () => api('GET', '/api/rank/ranking'),
        enqueue: () => api('POST', '/api/rank/queue', { retry: 0 }),
        cancel: () => api('DELETE', '/api/rank/queue', { retry: 0 }),
        status: () => api('GET', '/api/rank/queue', { retry: 0 }),
        match: (id) => api('GET', `/api/rank/matches/${encodeURIComponent(String(id))}`),
    },
    // 랭킹 board: 'level' | 'weekly_pvp'
    ranking: (board = 'level') => api('GET', '/api/ranking', { query: { board } }),
    // 장비·상점·인벤토리(off 면 404 equipment_disabled)
    shop: () => api('GET', '/api/shop'),
    // 같은 requestId 재전송 = 같은 결과(서버 멱등) -> 네트워크 재시도 허용
    buy: (code, requestId) => api('POST', '/api/shop/buy', { body: { code, request_id: requestId }, retry: 2 }),
    // 전투 소모품(docs/BATTLE_ITEMS_SPEC.md 7절): {items[{code,name,kind(heal|buff),price,owned,heal_pct|stat,amount,duration}], gold, max_per_battle, max_stack}. 꺼짐 = 404 items_disabled
    shopItems: () => api('GET', '/api/shop/items'),
    items: () => api('GET', '/api/items'), // {items[{code,qty}]}(보유 1개 이상만)
    // -> {replay, code, qty, gold_spent, gold, owned}. 같은 request_id 재전송 = 같은 결과(멱등)
    buyItem: (code, qty, requestId) => api('POST', '/api/shop/items/buy', { body: { code, qty, request_id: requestId }, retry: 2 }),
    // 일일 교환소(docs/SHOP_EXCHANGE_SPEC.md §1): GET -> {products[{code,name,description,kind,payload,price_gold,daily_limit,bought_today,remaining|null}], gold, period_key, reset_at}
    exchange: () => api('GET', '/api/exchange'),
    // 도감 '조우 장수'(서가 NPC, 박백엔 2026-11-04): {heroes[{code,name_ko|null,culture,unit_type,grade,one_line|null,life|null,shelf_code,shelf_name,portrait_key,revealed,silhouette}]}. 꺼짐 = 404 encounter_dex_disabled
    dexEncounter: () => api('GET', '/api/dex/encounter'),
    // 펜(영구 재화, docs/SEASON_PEN_DESIGN.md): {enabled, balance, earned_today, daily_cap(0=무제한), remaining_today|null, recent[]}
    pen: () => api('GET', '/api/pen', { retry: 1 }),
    // 소탕(수동 3성 스테이지, 전투 없음): -> {replay, sweep_id, stage_id, requested, executed, reward_blocked(stage_daily_cap|null), gold, hero_exp_total, user_exp, heroes[], user}
    sweep: (stageId, count, requestId) => api('POST', `/api/stages/${encodeURIComponent(stageId)}/sweep`, { body: { count, request_id: requestId }, retry: 2 }),
    // 공지·점검(공개): {announcements[{id,kind(notice|event|maintenance),title,body,pinned,starts_at,ends_at,created_at}]} / {active,enabled,message,starts_at,ends_at}
    announcements: () => api('GET', '/api/announcements', { auth: 'none', retry: 1 }),
    maintenance: () => api('GET', '/api/maintenance', { auth: 'none', retry: 1 }),
    exchangeBuy: (code, requestId) => api('POST', '/api/exchange/buy', { body: { code, request_id: requestId }, retry: 2 }), // -> {replay, purchase_id, code, gold_spent, granted, gold, reset_at}. 같은 request_id 재전송 = 멱등
    inventory: () => api('GET', '/api/inventory'),
    // equipment: {helm|armor|gloves|boots|accessory: 개체 id | null}
    async equip(userHeroId, equipment) {
        const d = await api('PUT', `/api/heroes/${userHeroId}/equipment`, { body: { equipment }, retry: 0 });
        sessionCache.setHeroes(null); // 영웅 목록의 equipment 갱신
        return d;
    },
    // 튜토리얼 진행(서버 저장): PUT {step, skipped?, done?} -> {tutorial, granted}
    tutorial: {
        get: () => api('GET', '/api/tutorial').then((d) => d.tutorial),
        put: (body) => api('PUT', '/api/tutorial', { body, retry: 1 }),
    },

    // 가챠(플래그 game.gacha.enabled off 면 404 gacha_disabled)
    gacha: {
        // -> {enabled, pool_version, rates[], price{single,ten}, pity{rule,min_rarity,applies_to_count,progress}, gold, heroes[]}
        info: async () => { const d = await api('GET', '/api/gacha'); setGachaCultures(d?.heroes); return d; }, // 풀 영웅 문화권 등록(뽑기 화면 일본 무장 정식 이름 규칙, names.gachaShortName)
        // -> {replay, pull_id, count, gold_spent, gold, pity{before,after,guarantee_applied}, results[]}
        // 같은 requestId 재전송은 서버가 같은 결과를 돌려준다(이중 차감 없음) → 네트워크 오류 자동 재시도(retry 2) 허용
        // banner(선택, 2026-11-08 시나리오 배너): 서버 배너 key(sc_chN). 생략·'normal' = 서고(전체 풀). 같은 request_id 는 같은 count+banner 로만 재전송
        async pull(count, requestId, banner = null) {
            const body = { count, request_id: requestId };
            if (banner && banner !== 'normal') body.banner = banner;
            const d = await api('POST', '/api/gacha/pull', { body, retry: 2 });
            if (session.profile && Number.isFinite(d?.gold)) sessionCache.setProfile({ ...session.profile, gold: d.gold });
            sessionCache.setHeroes(null); // 신규 영웅·조각 반영: 다음 영웅/편성 조회 때 다시 받는다
            return d;
        },
    },
};
