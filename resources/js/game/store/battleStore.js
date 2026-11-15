import { createEmitter } from '../emitter.js';
import { reachable, fromServerTiles, pathTo, pathBetween, attackTiles, keyOf, unitAt, inBounds, rangeOf, moveTypeOf, lineOfFire, setAllyPassCost } from '../systems/grid.js';
import { terrainAttr, typeAlias } from '../data/rules.js';
import { forecast, auraBonus, setForecastRules } from '../systems/combat.js';
import { NPC_TROOP_LOOK } from '../assets.js';
import { troopDelta, soldierCount } from '../systems/soldiers.js';
import { setAuraCatalog } from '../systems/glossary.js';
import { unitDisplayName } from '../systems/names.js';
import { settings } from '../settings.js';
import { battleApi, errorText } from '../api/battleApi.js';
import { gameApi } from '../api/gameApi.js';
import { elementHitText } from '../systems/elements.js';
import { errorTag } from '../api/errors.js';
import { watchRealtime, WS_SAFETY_POLL_MS } from '../api/realtime.js';
import { SIDE_TEAM, terrainMod, unitType, applyServerRules } from '../data/rules.js';
import { axisDir, flankOf, setFlankMult } from '../systems/facing.js';
import { altFromView, altReduce, altSelectCheck, squadKeyOf } from '../systems/alternate.js';
import { registerSkillNames, skillName, activeSkillsOf, skillDisplayName } from '../systems/skills.js';

// 서버 판정 전투 스토어(Pinia 비의존). 클라이언트는 행동만 보내고(POST /battles/{id}/actions) 판정·봇 턴은 서버가 한다.
// 'change': 상태 변경 / 'event': 연출·안내 이벤트 {type: cursor|toast|move|attack|heal|kill|turnStart|sync|result|auth|error|cutin}
// 상태(units)는 서버 응답을 받는 즉시 최종값으로 바뀌고, 연출은 이벤트 큐로 순차 재생된 뒤 'sync' 에서 화면을 최종값에 맞춘다.
// 선택 흐름(phase): idle -> move(이동 칸 선택: 서버 moves 조회) -> menu -> target -> confirm | facing(대기 방향 선택, 방향 시스템 on 일 때만)
//   | skill(액티브 스킬 목록) -> target(targetMode 'skill') -> confirm -> use_skill 전송.
// 방향(facing): 서버 units[].facing 이 null 이 아니면 on(s.facingOn). off 면 phase 'facing' 은 절대 진입하지 않고 기존 흐름과 동일하다.
//   이동은 '임시 이동'으로 로컬에만 반영하고(취소 가능), 공격/대기를 고를 때 move -> attack|wait 순서로 서버에 보낸다.
export function createBattleStore() {
    const em = createEmitter();
    const s = {
        status: 'loading', // loading | deploy | battle | finished | error
        battleId: null, version: 0, turn: 1, currentSide: 'a', side: 'ally', winner: null,
        map: { w: 1, h: 1, tiles: [['plain']] },
        units: [],
        facingOn: false, facingChoice: null,
        phase: 'idle', selectedId: null, origin: null, moved: false, reach: null, standableTiles: [], attackTiles: [], targets: [], targetMode: null, targetId: null, forecast: null, skill: null, // targetMode: 선택 상태('attack'|'skill'|null), skill: 고른 액티브 스킬(active_skills 항목). 전투 종류는 mode('stage'|'room')
        cursor: { x: 0, y: 0 },
        busy: false, error: null, result: null, profileBefore: null, profileAfter: null, stage: null,
        storyEvents: [], // 서버 발동 기록. 씬 복귀 시 미완 대사만 다시 큐에 넣는다.
        log: [],
        // 방(룸) 전투: mode 'stage'|'room', mySide 'a'|'b'(아군 = 내 진영), lastSeq(폴링 증분), room{mode, turn{is_my_turn, remaining_seconds}, players, turnAt}
        mode: 'stage', roomCode: null, mySide: 'a', lastSeq: 0, room: null, opponentLabel: '적군',
        // 교대 행동(부대 단위 활성화): alternate=false 면 alt=null 이고 기존 턴제 흐름(end_turn)과 완전히 같다.
        // alt = systems/alternate.altFromView 결과 {round, side('a'|'b'), activeSquad, firstSide, consecutive{side,count,cap}, squads[{id,side,status,unitIds}]}
        alternate: false, alt: null,
        // 전투 소모품(docs/BATTLE_ITEMS_SPEC.md 7절): itemsLeft = state.items.left(남은 사용 횟수, null = 이 전투는 사용 불가: 방·랭크·전쟁·구 전투),
        // itemCatalog = GET /api/shop/items 의 items(이름·효과·보유 owned), itemCode = 고른 소모품(phase 'item' -> 'target' targetMode 'item')
        itemsLeft: null, itemMax: 3, itemCatalog: null, itemCode: null,
        mpMode: false, // 액티브 스킬 MP 방식(battle.mp_mode). 본인 영웅 units[].mp/mp_max, 상대 영웅 mp_pct(5% 단위)만
    };
    let pollTimer = 0;
    let expireTimer = 0; // 턴 마감 만료 후 재조회 타이머(onTurnExpired)
    let polling = false;
    let pollAgain = false; // 푸시가 폴링 중에 도착하면 끝난 뒤 한 번 더 조회
    let rt = null; // 웹소켓 구독(pvp 방 전투). 연결 중엔 폴링 간격 확대, 끊기면 즉시 기존 주기 복귀
    let itemsLoading = false;
    let stopped = false;
    const alive = () => s.units.filter((u) => u.hp > 0);
    const isHealItem = (it) => !!it && (it.kind === 'heal' || it.heal_flat != null || it.heal_pct != null); // 회복 계열 소모품
    const hpMissing = (u) => { const mx = Number(u.maxHp ?? u.max_hp); return !Number.isFinite(mx) || mx <= 0 || u.hp < mx; }; // 최대 병력 모르면 후보 유지(판정은 서버)
    const get = (id) => s.units.find((u) => u.id === id);
    const selected = () => (s.selectedId ? get(s.selectedId) : null);
    const change = () => em.emit('change', s);
    const ev = (e) => em.emit('event', e);
    let lastToast = { m: '', t: 0 };
    const toast = (message, ms) => { const now = Date.now(); const mk = String(message ?? '').replace(/[.。\s]+$/, ''); if (mk === lastToast.m && now - lastToast.t < 1500) return; lastToast = { m: mk, t: now }; ev({ type: 'toast', message, ms }); }; // ms: 표시 시간(없으면 기본 2.2초) // 같은 안내 1.5초 안 중복 제거(강화면 gacha97: '지원 아군…' 2개)
    const addLog = (line) => { s.log.push(line); s.logSeq = (s.logSeq ?? 0) + 1; if (s.log.length > 40) s.log.shift(); }; // logSeq: 누적 줄 수(새 줄 감지용, 40줄 순환과 무관)
    const name = (id) => (get(id) ? unitDisplayName(get(id), s.units, { short: true }) : id); // 로그용 축약 이름(영웅 short_name ?? name / '<영웅> <병종>부대')

    // ---- 서버 뷰 -> 로컬 상태 ----
    function decorate(u) {
        const t = unitType(u.type);
        return { ...u, leaderId: u.leader_id ?? null, team: u.side === s.mySide ? 'ally' : 'enemy', maxHp: u.max_hp, rmin: t.range_min, rmax: t.range_max, commander: u.kind === 'commander', cls: u.type, skillUsed: true };
    }
    const teamOf = (side) => (side === s.mySide ? 'ally' : 'enemy');
    function applyView(view) {
        s.battleId = view.battle_id;
        s.version = view.version;
        s.turn = view.turn;
        s.currentSide = view.current_side;
        s.side = teamOf(view.current_side);
        s.winner = view.winner;
        s.map = { w: view.width, h: view.height, tiles: view.tiles, biome: view.biome ?? (/desert/.test(view.map_code ?? '') ? 'desert' : null), decor: view.decor ?? null, villageStyle: view.village_style ?? null, tileLayer: view.tile_layer ?? view.map?.tile_layer ?? null, rockfallTile: view.rockfall_tile_name ?? view.meta?.rockfall_tile_name ?? view.map?.meta?.rockfall_tile_name ?? null, props: view.props ?? view.meta?.props ?? view.map?.meta?.props ?? null, paintedBg: view.painted_bg ?? view.meta?.painted_bg ?? view.map?.meta?.painted_bg ?? null, culture: view.culture ?? view.meta?.culture ?? view.map?.meta?.culture ?? null, gates: view.gates ?? view.meta?.gates ?? null, castleRender: view.castle_render ?? view.meta?.castle_render ?? null, groundTone: view.ground_tone ?? view.meta?.ground_tone ?? null, wallStyle: view.wall_style ?? view.meta?.wall_style ?? null, pierStyle: view.pier_style ?? view.meta?.pier_style ?? null }; // props·paintedBg·culture·gates·castleRender·groundTone: 맵 개편 시각 전용(서버 뷰 최상위 또는 meta, 있으면 그 맵만 mapArt 자동 활성. 서버 미제공이면 null) // rockfallTile: 맵 meta.rockfall_tile_name(낙석 terrain_change to mountain 칸 렌더 타일, 서버 뷰 제공 시) // biome/map_code 는 서버 미제공(요청서). decor·village_style: rm 지형 시각 전용(선택, 없으면 무시)
        s.units = view.units.map(decorate);
        // 지금까지 화면에 나온 적 유닛 병종(id -> type, 격파돼 목록에서 빠져도 유지): 패배 결과창 상성 힌트(systems/enemyComp.defeatHint)용. 아직 안 나온 증원은 포함되지 않음
        if (s.enemySeenBattle !== s.battleId) { s.enemySeen = new Map(); s.enemySeenBattle = s.battleId; }
        s.units.forEach((u) => { if (u.team === 'enemy' && u.type && !u.non_hero) s.enemySeen.set(String(u.id), { id: u.id, type: u.type, kind: u.kind }); });
        // 분대 지휘관이 '병사도 같은 외형' NPC(assets NPC_TROOP_LOOK, 예 npc_erased_line)면 그 분대 병사에 npc_look 을 붙인다(서버 troop_look 이 오면 그 값 우선).
        // 소속(leader_id)은 서버 squad on 전투에서만 온다 -> off 면 서버 troop_look 필드가 있어야 연결된다(박백엔 요청 사항)
        { const byId = new Map(s.units.map((u) => [u.id, u])); s.units.forEach((u) => { if (u.kind !== 'troop' || u.troop_look) return; const ld = byId.get(u.leader_id); const code = ld?.npc_ref ?? (typeof ld?.hero === 'string' && /^npc_/.test(ld.hero) ? ld.hero : null); if (code && NPC_TROOP_LOOK.has(code)) u.npc_look = code; }); }
        registerSkillNames(view.units); // 스킬 코드 -> 이름(액티브 active_skills, 패시브는 서버가 name 을 줄 때만)
        s.facingOn = s.units.some((u) => u.facing != null);
        s.alt = altFromView(view);
        s.alternate = !!s.alt;
        // 턴 제한시간(서버 turn_deadline epoch ms·turn_input_seconds, 없으면 null = 표시 안 함). 마감 처리는 서버가 하고 FE 는 표시·재조회만
        const tKey = `${view.turn}|${view.current_side}`;
        if (s.turnKey !== tKey) { s.turnKey = tKey; s.turnStartAt = Date.now(); s.turnExpiredNotified = false; }
        const dl = Number(view.turn_deadline);
        const prevDl = s.turnDeadline;
        s.turnDeadline = Number.isFinite(dl) && dl > 0 ? (dl < 1e12 ? dl * 1000 : dl) : null;
        if (s.turnDeadline !== prevDl) { s.turnExpiredNotified = false; s.timeLocked = false; } // 마감 갱신(턴·활성화 전환) = 새 제한시간: 만료 잠금 해제
        s.turnInputSeconds = Number(view.turn_input_seconds) || null;
        // 서버-클라 시계 보정: battle view 의 server_time(epoch ms). 오프셋 = 서버 - 로컬(응답 지연만큼 오차, 표시용)
        const stime = Number(view.server_time);
        if (Number.isFinite(stime) && stime > 1e12) s.clockOffset = stime - Date.now();
        if (view.no_turn_timer || view.state?.no_turn_timer) { s.turnDeadline = null; s.turnInputSeconds = null; } // 튜토리얼 전투 등: 타이머 숨김
        if (s.turnDeadline == null) s.timeLocked = false; // 제한시간 없음(스테이지·solo): 잠금 없음
        if (view.turn_timed_out) toast('시간 초과 — 남은 유닛은 대기 처리되고 턴이 넘어갔습니다');
        if (view.status === 'deployment') s.status = 'deploy';
        else if (view.status === 'in_progress') s.status = 'battle';
        else s.status = 'finished';
        // 캠페인: 목표(objective {type, turns?})·생존 목표 남은 라운드(survive_remaining, 현재 라운드 포함, 그 외 null)·스테이지 id(전투 후 대사 판정)
        s.subObjectives = Array.isArray(view.sub_objectives) ? view.sub_objectives : []; // 보조 목표 [{id,label,type,status:pending|met|failed,progress,target}](없으면 빈 배열 = HUD 없음)
        s.rulesEffective = view.rules_effective && typeof view.rules_effective === 'object' ? view.rules_effective : null; // 맵/스테이지 rules 오버라이드(있는 전투만, CUTSCENE_SPEC 끝). 예측은 공개 규칙 위에 덮어 씀 + first_side
        if (s.rulesEffective?.facing_mult) setFlankMult(s.rulesEffective.facing_mult); // 말풍선 측면·배후 % 표기도 맵 값으로
        s.stageRules = view.stage_rules && typeof view.stage_rules === 'object' ? view.stage_rules : null; // 승패 규칙 {mode:all|only, primary, conditions[{label,met}], lose[label]}(CUTSCENE_SPEC 10절, 규칙 없는 전투는 키 없음)
        s.objective = view.objective ?? null; // capture: {type, points, mode, hold_turns, by, held[{x,y,holder}], progress{hold,need,enemy_hold,enemy_need}}
        s.objectivePoints = Array.isArray(view.objective_points) ? view.objective_points : []; // [[x,y]] 점령 목표 칸(깃발 표시)
        s.triggers = Array.isArray(view.triggers) ? view.triggers : []; // 증원 예고 [{id, turn, side, count, zone, cells[[x,y]]}](미완료만)
        s.surviveRemaining = Number.isFinite(Number(view.survive_remaining)) && view.survive_remaining !== null ? Number(view.survive_remaining) : null;
        s.stageId = view.stage_id ?? s.stageId ?? null;
        s.mpMode = view.mp_mode === true;
        if (view.micro_mode != null) s.microOn = view.micro_mode === 'on'; // 서버가 view 에 micro_mode 를 주면 그 값(현재 미노출 -> attack 이벤트 micro.mode 'on' 을 보면 켬)
        if (view.micro_mode != null) s.microMode = String(view.micro_mode); // 서버 view 값 그대로(off|shadow|on). 'on' 일 때만 서버 공격 예측 호출(refineForecast)
        { const il = view.state?.items?.left ?? view.items?.left; s.itemsLeft = s.mode !== 'room' && il != null && Number.isFinite(Number(il)) ? Number(il) : null; } // 키 없음 = 소모품 불가 전투
        s.storyEvents = Array.isArray(view.story_events) ? view.story_events : [];
        if (s.mode !== 'room') s.storyEvents.forEach((event) => ev(event));
        // 전투 연출 cue: 조회/배치확정 응답에만 온다(행동 응답에 없으면 이벤트로 갱신한 값 유지). start = 시작 연출, fires = 현재 타는 불(재접속 복원)
        if (view.cues && typeof view.cues === 'object' && s.mode !== 'room') {
            s.cueStart = Array.isArray(view.cues.start) ? view.cues.start : [];
            s.cueFires = Array.isArray(view.cues.fires) ? view.cues.fires : [];
            if (Array.isArray(view.cues.tile_patch)) s.tilePatch = view.cues.tile_patch; // 지형 변경 누적(재접속 복원): 월드 구성 직후 Battle.applyTilePatch 가 일괄 적용
            s.cueActors = Array.isArray(view.cues.actors) ? view.cues.actors : []; // 연출 액터(14절, 판정 제외): 키 없음 = 남은 액터 없음. sync 때 CuePlayer 가 화면을 맞춘다
        }
    }

    // 시작 연출(battle.cues.start): 전투당 1회(sessionStorage, story_events 와 같은 방식). 라운드 1 에서만(늦은 재접속 시 재생 안 함)
    function playStartCues() {
        const list = s.cueStart ?? [];
        if (s.mode === 'room' || !list.length || s.status !== 'battle' || Number(s.turn) > 1) return;
        const key = `lw.cue:${s.battleId}:start`;
        try { if (localStorage.getItem(key) === 'done' || sessionStorage.getItem(key) === 'done') return; localStorage.setItem(key, 'done'); } catch { /* 저장 차단: 이번 진입만 재생 */ } // 이어하기: 브라우저를 다시 열어도 반복 안 함(localStorage)
        playEvents(list);
        ev({ type: 'sync' }); // 시작 cue 이동은 서버 좌표가 이미 최종값: 연출 뒤 스냅
    }

    function clearSelection() {
        const u = selected();
        if (u && s.moved && s.origin) { u.x = s.origin.x; u.y = s.origin.y; } // 임시 이동 되돌림(서버 미반영분)
        Object.assign(s, { phase: 'idle', facingChoice: null, selectedId: null, origin: null, moved: false, reach: null, standableTiles: [], attackTiles: [], targets: [], targetMode: null, targetId: null, forecast: null, skill: null, itemCode: null, lockedPreview: null, movePath: null });
    }

    // ---- 서버 공격 예측(미시 모드 on 전용) ----
    // 로컬 forecast()(damageInfo 1회 선형식)는 미시 교전 결과와 어긋날 수 있어, 서버 view micro_mode === 'on' 이면 POST /api/battles/{id}/forecast 로 덮어쓴다.
    // 요청 중에는 로컬값 그대로(표식 없음), 마지막 요청만 반영(fcSeq + forecast 객체 동일성), 실패·타임아웃이면 로컬값에 tentative(참고용(변동 가능)) 표기.
    // 캐시 키: 전투·version·턴·공격자·대상·공격자 칸(version 포함: 같은 턴이라도 다른 행동 후엔 대상 HP 가 바뀜). off/shadow 면 아무것도 하지 않는다
    let fcSeq = 0;
    const fcCache = new Map();
    function applyServerForecast(fc, att, def, r) {
        const remaining = r.targetHpAfter;
        const killed = r.targetDefeated || remaining <= 0;
        const withMax = (u, mx) => (mx > 0 ? { ...u, max_hp: mx, maxHp: mx } : u); // 병력 단계 = stepsOf(hp, 서버 max_hp)
        const tBefore = soldierCount(def);
        const tAfter = killed ? 0 : Math.max(0, Math.min(tBefore, soldierCount(withMax(def, r.targetMaxHp), remaining)));
        const aHp = r.attackerHpAfter;
        let counter = fc.counter; // 서버가 공격자 HP 를 안 주면 로컬 반격 예측 유지
        if (aHp != null) {
            const aBefore = soldierCount(att);
            const aAfter = r.attackerDefeated ? 0 : Math.max(0, Math.min(aBefore, soldierCount(withMax(att, r.attackerMaxHp), aHp)));
            counter = !killed && aHp < (r.attackerHpBefore ?? att.hp) ? { dmg: r.counterDmg ?? ((r.attackerHpBefore ?? att.hp) - aHp), remaining: aHp, hit: null, troop: { before: aBefore, after: aAfter, loss: aBefore - aAfter } } : null;
        }
        if (killed) counter = null; // 격파 = 반격 줄 대신 격파 예상 문구(ContextMenu 기존 문구)
        // 격파 시 '동시 교전: 반격 피해 가능': 서버가 공격자 손실을 예측했거나 로컬상 반격 가능한 조합일 때. 원거리 등 반격 불가 조합은 '격파 예상 · 반격 없음'
        const microCounter = killed && ((aHp != null && aHp < (r.attackerHpBefore ?? att.hp)) || !!fc.microCounter || !!fc.counter);
        return { ...fc, dmg: r.dmg ?? Math.max(0, def.hp - remaining), remaining, counter, microCounter, troop: { before: tBefore, after: tAfter, loss: tBefore - tAfter }, server: true, tentative: false, serverMicro: r.micro, rev: (fc.rev ?? 0) + 1 };
    }
    function refineForecast(att, def) {
        const seq = ++fcSeq;
        if (!s.forecast) return;
        s.forecast = { ...s.forecast, reqSeq: seq }; // 씬: 같은 reqSeq 의 말풍선 재생성은 페이드 없이(깜빡임 최소화)
        if (s.microMode !== 'on' || !s.battleId) return;
        const key = `${s.battleId}|${s.version}|${s.turn}|${att.id}|${def.id}|${att.x},${att.y}`;
        const hit = fcCache.get(key);
        if (hit) { s.forecast = applyServerForecast(s.forecast, att, def, hit); return; } // 호출부가 이어서 change()
        const fcRef = s.forecast;
        const live = () => seq === fcSeq && s.forecast === fcRef && s.phase === 'confirm' && s.targetId === def.id;
        const body = { unitId: att.id, targetId: def.id, ...(s.moved ? { x: att.x, y: att.y } : {}) }; // 임시 이동(서버 미전송) 칸
        gameApi.forecastAttack(s.battleId, body).then((r) => {
            fcCache.set(key, r);
            if (fcCache.size > 64) fcCache.delete(fcCache.keys().next().value);
            if (!live()) return; // 대상·칸이 바뀌었거나 취소됨: 이전 응답 무시
            s.forecast = applyServerForecast(s.forecast, get(att.id) ?? att, get(def.id) ?? def, r);
            change();
        }).catch(() => {
            if (!live()) return;
            s.forecast = { ...s.forecast, tentative: true, rev: (s.forecast.rev ?? 0) + 1 }; // 로컬값 유지 + 참고용(변동 가능)
            change();
        });
    }

    // ---- 서버 이벤트 -> 연출 이벤트(순차 큐). 스냅샷으로 경로/HP 를 추적한다 ----
    // opt.localMove = {unitId,x,y}: 임시 이동(moveTo)으로 이미 걷기 연출을 끝낸 유닛. 그 유닛의 서버 move(같은 도착 칸) 1건은 걷기 연출을 다시 내지 않는다
    //  (commitMove 응답의 move 는 from=이동 전 칸이라 그대로 재생하면 도착 칸에 서 있던 뷰가 출발 칸 쪽으로 미끄러졌다가 다시 걸어오는 '한 번 더 이동' 버그)
    function playEvents(events, opt = {}) {
        let localMove = opt.localMove ?? null;
        const snap = s.units.map((u) => ({ ...u }));
        const sget = (id) => snap.find((u) => u.id === id);
        const merged = new Set(); // 교전 병합으로 이미 처리한 counter 이벤트 인덱스
        let altSnap = s.alt; // 교대 행동: 연출 시점의 부대 상태(표시용). 최종값은 applyView 가 덮어쓴다
        // 패시브 발동(skills_applied 코드): 이름을 아는 코드만, 소유 유닛(공격자/피격자 skills[].code)별로 묶는다. 모르면 생략
        const ownsSkill = (u, code) => Array.isArray(u?.skills) && u.skills.some((k) => k?.code === code);
        const passivesOf = (e) => {
            const by = new Map();
            (Array.isArray(e.skills_applied) ? e.skills_applied : []).forEach((code) => {
                const nm = skillName(code);
                if (!nm) return;
                const owner = ownsSkill(sget(e.target_unit_id), code) && !ownsSkill(sget(e.actor_unit_id), code) ? e.target_unit_id : e.actor_unit_id;
                if (!by.has(owner)) by.set(owner, []);
                if (!by.get(owner).includes(nm)) by.get(owner).push(nm);
            });
            return [...by].map(([unitId, names]) => ({ unitId, names }));
        };
        const passiveTxt = (e) => { const ns = passivesOf(e).flatMap((p) => p.names); return ns.length ? ` · 발동: ${ns.join(', ')}` : ''; };
        let pendingSkill = null; // skill_use 직후 같은 행위자의 attack 에 스킬 연출 정보를 붙인다
        // 패배 결과창 패인 한 줄(s.endCause): 이 응답 안에서 마지막으로 쓰러진 아군(kill / unit_removed death)과 그 턴. 서버 battle_end 는 원인 유닛을 주지 않아 직전 사망으로 판단
        let curTurn = Number(s.turn) || null; let lastAllyDown = null;
        const noteAllyDown = (id) => { const u = sget(id); if (u && u.team === 'ally') lastAllyDown = { name: unitDisplayName(u, snap, { short: true }), kind: u.kind ?? null, turn: curTurn }; };
        const hitOf = (e) => ({ dmg: e.dmg, crit: !!e.crit, affinity: e.affinity, terrain: e.terrain, terrainDef: e.terrain_def_pct, kill: !!e.kill, hpAfter: e.hp_after, flank: e.flank ?? 'none', passives: passivesOf(e), waterMult: Number(e.water_mult) || null });
        // 수상 피해 배율(선택 필드 water_mult, 1.0 이면 서버가 생략): 로그에 '수상 ×1.2' 처럼 표기
        const waterTxt = (e) => { const m = Number(e.water_mult); return Number.isFinite(m) && m > 0 && m !== 1 ? ` · 수상 ×${Math.round(m * 100) / 100}` : ''; };
        (events ?? []).forEach((e, idx, list) => {
            if (merged.has(idx)) return;
            if (e.type === 'story_dialogue') {
                if (s.mode !== 'room') ev(e);
            } else if (e.type === 'cue') { // 전투 연출 cue(docs/CUTSCENE_SPEC.md): 판정 없음. fire/fire_end 는 불 목록(s.cueFires)만 갱신(최종값은 view.cues.fires)
                if (s.mode === 'room') return;
                if (e.do === 'fire' && Array.isArray(e.tiles)) s.cueFires = [...(s.cueFires ?? []).filter((f) => f.cue_id !== e.cue_id), { cue_id: e.cue_id, tiles: e.tiles, until_turn: e.until_turn ?? null }];
                else if (e.do === 'fire_end') s.cueFires = (s.cueFires ?? []).filter((f) => f.cue_id !== e.cue_id);
                else if (e.do === 'spawn_actor' && e.actor && Array.isArray(e.tile)) s.cueActors = [...(s.cueActors ?? []).filter((a) => a.id !== e.actor), { id: e.actor, side: e.side ?? 'n', name: e.name ?? null, sprite: e.sprite ?? {}, x: e.tile[0], y: e.tile[1], facing: e.facing ?? 'down', alive: true }]; // 연출 액터 최종값(행동 응답엔 view.cues 가 없을 수 있어 이벤트로 갱신)
                else if (e.do === 'walk' && e.actor && e.path_ok !== false) { const last = Array.isArray(e.path) && e.path.length ? e.path[e.path.length - 1] : e.to; if (Array.isArray(last)) s.cueActors = (s.cueActors ?? []).map((a) => (a.id === e.actor ? { ...a, x: last[0], y: last[1] } : a)); }
                else if (e.do === 'face' && e.actor) s.cueActors = (s.cueActors ?? []).map((a) => (a.id === e.actor ? { ...a, facing: e.dir ?? a.facing } : a));
                else if (e.do === 'despawn_actor' && e.actor) s.cueActors = (s.cueActors ?? []).filter((a) => a.id !== e.actor);
                else if (e.do === 'terrain_change') { // 지형 변경: 이동·방어 판정용 지도 갱신(서버 state.tiles 가 이미 바뀜) + 재접속 대비 누적. 막힌 칸(skipped)은 무시
                    const ch = Array.isArray(e.changed) ? e.changed : [];
                    if (!ch.length) return;
                    ch.forEach(({ x, y, to }) => { if (s.map?.tiles?.[y] && to) s.map.tiles[y][x] = to; });
                    s.tilePatch = [...(s.tilePatch ?? []).filter((p) => !ch.some((c) => c.x === p.x && c.y === p.y)), ...ch.map(({ x, y, to, tile }) => (tile != null ? { x, y, to, tile } : { x, y, to }))]; // tile(선택, tv2 id) = UnityGround.patchCells 우선 타일
                }
                ev({ type: 'cue', cue: e });
            } else if (e.type === 'move') {
                const u = sget(e.actor_unit_id);
                if (!u) return;
                if (e.walk && Array.isArray(e.path)) { // 14절 cue walk(실제 유닛): 서버 path 그대로 + speed/wait/walk_id/group. 출발 칸·충돌 회피·병렬은 CuePlayer.walkUnit
                    const from = Array.isArray(e.from) ? { x: e.from[0], y: e.from[1] } : { x: u.x, y: u.y };
                    const wpath = e.path.filter((p) => Array.isArray(p)).map(([x, y]) => ({ x, y }));
                    u.x = e.to?.[0] ?? u.x; u.y = e.to?.[1] ?? u.y;
                    ev({ type: 'move', unitId: u.id, path: wpath, from, scripted: true, walk: { speed: e.speed, wait: e.wait !== false, walkId: e.walk_id ?? null, group: Number.isInteger(e.group) ? e.group : null } });
                    return;
                }
                if (e.scripted && Array.isArray(e.from)) ev({ type: 'move', unitId: u.id, path: [], snapTo: { x: e.from[0], y: e.from[1] } }); // cue 이동: 출발 칸에서 걷기 시작(시작 연출은 뷰가 이미 최종 좌표)
                const already = !e.scripted && localMove && String(localMove.unitId) === String(u.id) && e.to?.[0] === localMove.x && e.to?.[1] === localMove.y;
                if (already) localMove = null; // 1건만
                const path = already ? [] : pathBetween(s.map, snap, u, e.from, e.to);
                u.x = e.to[0]; u.y = e.to[1];
                if (e.facing) { u.facing = e.facing; ev({ type: 'facing', unitId: u.id, facing: e.facing }); }
                if (!already) ev({ type: 'move', unitId: u.id, path, scripted: !!e.scripted }); // scripted(cue 이동): 연출 병렬 묶음에서 제외(FxManager)
            } else if (e.type === 'attack' || e.type === 'counter') {
                if (e.micro && typeof e.micro === 'object' && e.micro.mode === 'on') s.microOn = true; // 미시 교전 확정 전투(예측 반격 문구 판정용)
                const t = sget(e.target_unit_id);
                const tLoss = t ? -troopDelta(t, t.hp, e.hp_after) : null; // 로그는 병력 단계 감소로 표기(HP 수치 비노출)
                if (t) t.hp = e.hp_after;
                if (e.facing) { // 방향 on: 공격자는 대상 쪽(서버 값), 피격 유닛은 공격자 쪽으로 자동 회전(반격은 회전 없음)
                    const at = sget(e.actor_unit_id);
                    if (at) { at.facing = e.facing; ev({ type: 'facing', unitId: at.id, facing: e.facing }); }
                    if (at && t && e.type === 'attack') { const f = axisDir(at.x - t.x, at.y - t.y); if (f) { t.facing = f; ev({ type: 'facing', unitId: t.id, facing: f }); } }
                }
                addLog(`${name(e.actor_unit_id)} → ${name(e.target_unit_id)} 병력 -${tLoss ?? '?'}${e.type === 'counter' ? ' (반격)' : ''}${e.kill ? ' · 격파' : ''}${elementHitText(e.element, e.element_pct) ? ` · ${elementHitText(e.element, e.element_pct)}` : ''}${waterTxt(e)}${passiveTxt(e)}`); // 속성 약점/내성(element_pct)
                // 교전 병합: 서버 Engine::doAttack 은 attack 직후(사이에 다른 이벤트 없이) counter 를 보내고 kill 은 그 뒤에 보낸다.
                // 바로 다음 이벤트가 행위자·대상이 뒤바뀐 counter 이면 한 번의 교전(컷신 1회)으로 묶는다. 그 외(원거리 선제·반격 불가·격파)는 단일 방향.
                const nx = list[idx + 1];
                let counterHit = null;
                if (e.type === 'attack' && nx?.type === 'counter' && nx.actor_unit_id === e.target_unit_id && nx.target_unit_id === e.actor_unit_id) {
                    merged.add(idx + 1);
                    const at = sget(nx.target_unit_id);
                    const aLoss = at ? -troopDelta(at, at.hp, nx.hp_after) : null;
                    if (at) at.hp = nx.hp_after;
                    if (nx.facing) { const ca = sget(nx.actor_unit_id); if (ca) ca.facing = nx.facing; }
                    addLog(`${name(nx.actor_unit_id)} → ${name(nx.target_unit_id)} 병력 -${aLoss ?? '?'} (반격)${nx.kill ? ' · 격파' : ''}${waterTxt(nx)}${passiveTxt(nx)}`);
                    counterHit = hitOf(nx);
                }
                const skill = e.type === 'attack' && pendingSkill && pendingSkill.actorId === e.actor_unit_id ? pendingSkill : null;
                pendingSkill = null;
                // atkUnit/defUnit: 이 교전 시점의 유닛 사본. 응답의 최종 상태(applyView)가 먼저 반영돼 격파·사망 유닛이 목록에서 빠져도 컷신이 재생되게(적 턴 다수 교전·격파 교전에서 컷신이 빠지던 원인)
                const su = (id) => { const x = sget(id); return x ? { ...x } : null; };
                ev({ type: 'attack', attackerId: e.actor_unit_id, targetId: e.target_unit_id, ...hitOf(e), element: e.element ?? null, elementPct: Number(e.element_pct) || 0, miss: false, counter: e.type === 'counter', counterHit, skill, atkUnit: su(e.actor_unit_id), defUnit: su(e.target_unit_id), micro: e.type === 'attack' && e.micro && typeof e.micro === 'object' && e.micro.mode === 'on' ? e.micro : null }); // micro: 병사 미시 교전 -> 컷신 개체 재생. 확정값(micro.mode 'on')일 때만. shadow(참고용, 맵 HP는 기존 공식)·필드 없음은 기존 연출
            } else if (e.type === 'wait') { // 방향 on 전투에서만 온다(상대·봇 대기 방향 갱신)
                const u = sget(e.actor_unit_id);
                if (u && e.facing) { u.facing = e.facing; ev({ type: 'facing', unitId: u.id, facing: e.facing }); }
            } else if (e.type === 'unit_removed') { // 퇴각(cue retreat): 사망이 아님 — 격파 로그·붕괴 연출 없이 '○○ 퇴각'. 부대원(unit_ids) 포함 제거
                const ids = (e.unit_ids ?? [e.actor_unit_id]).map(String);
                const nm = name(e.actor_unit_id);
                if (e.reason === 'death') noteAllyDown(e.actor_unit_id);
                if (ids.includes(String(s.selectedId))) clearSelection();
                s.units = s.units.filter((u) => !ids.includes(String(u.id)));
                addLog(e.reason === 'retreat' ? `${nm} 퇴각` : e.reason === 'death' ? `${nm} 쓰러짐` : `${nm} 이탈`); // death = 연출용 사망(cue retreat reason death, CUTSCENE_SPEC 13절)
                ev({ type: 'retreat', unitIds: ids, actorId: e.actor_unit_id, name: nm, team: e.side ? teamOf(e.side) : 'enemy', reason: e.reason ?? 'retreat' });
            } else if (e.type === 'unit_defected') { // 이탈·배신(cue defect, CUTSCENE_SPEC 13절): unit_ids 의 진영을 to(a|b)로 전환. 아군으로 넘어오면 서버가 npc_ally 로 조종
                const ids = (e.unit_ids ?? [e.actor_unit_id]).filter(Boolean).map(String);
                const to = e.to === 'b' ? 'b' : 'a';
                const leadId = ids[0];
                const nm = name(leadId);
                // sget 은 연출용 스냅샷(snap)이라 그것만 바꾸면 store 의 실제 유닛(s.units)은 그대로 -> 뷰 재생성 때 옛 진영 색이 남았다(강화면 16차, window.__cue 경로). 스냅샷·실제 유닛 둘 다 갱신(서버 view 가 오면 그 값으로 다시 덮임)
                const flip = (u) => { if (!u) return; u.side = to; u.team = to === s.mySide ? 'ally' : 'enemy'; if (to === s.mySide) u.npc_ally = true; else delete u.npc_ally; };
                ids.forEach((id) => { flip(sget(id)); flip(s.units.find((x) => String(x.id) === id)); });
                if (ids.includes(String(s.selectedId))) clearSelection();
                const toAlly = to === s.mySide;
                addLog(toAlly ? `${nm} 아군 합류` : `${nm} 적군으로 돌아섬`);
                ev({ type: 'defect', unitIds: ids, actorId: leadId, name: nm, toAlly });
            } else if (e.type === 'collapse') { // 소속(squad) on: 영웅 사망 시 소속 유닛 전원 제거
                (e.unit_ids ?? []).forEach((id) => { const u = sget(id); if (u) u.hp = 0; });
                addLog(`${name(e.target_unit_id)} 쓰러짐 · 소속 부대 붕괴(${(e.unit_ids ?? []).length})`);
                ev({ type: 'collapse', leaderId: e.target_unit_id, unitIds: e.unit_ids ?? [] });
            } else if (e.type === 'kill') {
                noteAllyDown(e.target_unit_id);
                ev({ type: 'kill', unitId: e.target_unit_id });
            } else if (e.type === 'heal') {
                const t = sget(e.target_unit_id);
                const gain = t ? troopDelta(t, e.hp_before ?? t.hp, e.hp_after) : null;
                if (t) t.hp = e.hp_after;
                addLog(`${name(e.actor_unit_id)} → ${name(e.target_unit_id)} 병력 +${gain ?? '?'} 회복`);
                ev({ type: 'heal', unitId: e.target_unit_id, actorId: e.actor_unit_id, amount: e.hp_after - e.hp_before, hpAfter: e.hp_after });
            } else if (e.type === 'mp_change') { // MP 증감(턴 시작 회복·스킬 소모 등): 본인 = mp/mp_max, 상대 = mp_pct 만(서버가 수치 제거)
                [sget(e.unit_id ?? e.actor_unit_id), get(e.unit_id ?? e.actor_unit_id)].forEach((t) => { if (!t) return; if (e.mp != null) t.mp = Number(e.mp); if (e.mp_max != null) t.mp_max = Number(e.mp_max); if (e.mp_pct != null) t.mp_pct = Number(e.mp_pct); });
                ev({ type: 'mp', unitId: e.unit_id ?? e.actor_unit_id, mp: e.mp ?? null, mpMax: e.mp_max ?? null, pct: e.mp_pct ?? null, reason: e.reason ?? null });
            } else if (e.type === 'skill_use') { // 액티브 스킬: 이름 로그 + 컷인/컷신 배너, 이어지는 attack 에 위력 정보 전달(임팩트 강도)
                const nm = skillDisplayName(e.name) ?? skillName(e.skill) ?? '스킬';
                const ign = Number(e.def_ignore_pct) || 0; // T_ACTIVE_PIERCE: 기본 방어 무시 %
                // fx*: 스킬 이펙트 시트(fx/SkillFxSheet) 해석용. 서버 fx_family/fx_variant(SkillFx.php, 없을 수 있음) + center/radius/stat(AOE 중심·heal 반경·buff 종류)
                pendingSkill = { actorId: e.actor_unit_id, code: e.skill, name: nm, template: e.template ?? null, kind: e.kind ?? null, powerPct: Number(e.power_pct) || 100, defIgnorePct: ign || null,
                    fxFamily: e.fx_family ?? null, fxVariant: e.fx_variant ?? null, center: Array.isArray(e.center) ? e.center : null, radius: e.radius ?? null, stat: e.stat ?? null };
                const selfCast = e.kind === 'stance' || !e.target_unit_id; // 반격태세 등 대상 없는 스킬: '→ 대상' 생략
                addLog(`${name(e.actor_unit_id)} 스킬 「${nm}」${e.kind === 'stance' || e.kind === 'buff' ? '' : `(위력 ${pendingSkill.powerPct}%${ign ? ` · 방어 무시 ${ign}%` : ''})`}${e.mp_cost != null ? ` · 마력 -${e.mp_cost}` : ''}${selfCast ? '' : ` → ${name(e.target_unit_id)}`}`);
                if (e.mp_left != null || e.mp_pct != null) [sget(e.actor_unit_id), get(e.actor_unit_id)].forEach((t) => { if (!t) return; if (e.mp_left != null) t.mp = Number(e.mp_left); if (e.mp_pct != null) t.mp_pct = Number(e.mp_pct); }); // MP 바 갱신(mp_change 가 따로 오면 그쪽이 최종)
                ev({ type: 'skillUse', unitId: e.actor_unit_id, targetId: e.target_unit_id, name: nm, template: pendingSkill.template, kind: pendingSkill.kind, powerPct: pendingSkill.powerPct, defIgnorePct: pendingSkill.defIgnorePct, fx: { ...pendingSkill } });
                if (selfCast) pendingSkill = null;
            } else if (e.type === 'item_use') { // 소모품: 이름 로그 + 남은 횟수·보유 수 갱신. 효과는 뒤따르는 heal(via_item)·buff_apply 가 기존 연출로
                addLog(`${name(e.actor_unit_id)} 소모품 「${e.name ?? e.item}」${e.target_unit_id && e.target_unit_id !== e.actor_unit_id ? ` → ${name(e.target_unit_id)}` : ''}`);
                if (e.items_left != null && Number.isFinite(Number(e.items_left))) s.itemsLeft = Number(e.items_left);
                const it = s.itemCatalog?.find((x) => x.code === e.item); if (it) it.owned = Math.max(0, (it.owned ?? 0) - 1);
            } else if (e.type === 'buff_apply') { // 강화 부여(T_ACTIVE_BUFF·T_ACTIVE_STANCE): stat = atk|def|counter|... (counter = 반격 태세: 반격 피해 가산·불리 상성 무시)
                const STAT = { atk: '공격', def: '방어', counter: '반격 태세', move: '이동', heal: '회복' };
                const lb = STAT[e.stat] ?? '강화';
                addLog(`${name(e.target_unit_id)} ${lb}${e.stat === 'counter' ? '' : ''} +${e.amount ?? 0}%${e.left ? ` (${e.left}턴)` : ''}`);
                ev({ type: 'buff', unitId: e.target_unit_id, actorId: e.actor_unit_id, stat: e.stat, amount: e.amount, left: e.left });
            } else if (e.type === 'skill') { // 구 계약 예비(서버는 skill_use 를 보낸다): 오면 컷인 재생
                ev({ type: 'cutin', unitId: e.actor_unit_id, skill: e.skill ?? e.name ?? '필살기' });
            } else if (e.type === 'turn_start') {
                if (e.turn != null) curTurn = Number(e.turn);
                addLog(`--- ${s.alternate ? '라운드' : '턴'} ${e.turn} ${teamOf(e.side) === 'ally' ? '아군' : s.opponentLabel} ---`);
                ev({ type: 'turnStart', side: teamOf(e.side), turn: e.turn, label: teamOf(e.side) === 'ally' ? '아군' : s.opponentLabel });
            } else if (e.type === 'battle_end') {
                s.endReason = e.reason ?? null; // objective(목표 달성) / objective_lost(적 점령) 등: 결과창 문구
                s.endCause = { battleId: s.battleId, reason: e.reason ?? null, label: typeof e.label === 'string' ? e.label : null, down: e.reason === 'commander_defeated' ? lastAllyDown : null }; // label = StageRules 패배 규칙 문구
                ev({ type: 'battleEnd', winner: e.winner, reason: e.reason });
            } else if (e.type === 'reinforce') { // 증원 등장(라운드 시작): unit_ids 는 이 응답 battle.units 에 있다(연출 시점에 store 최종값으로 위치 확인)
                if (e.skipped || !(e.unit_ids ?? []).length) return; // (이벤트별 콜백) 연출 cue spawn 이 칸이 막혀 생성 안 됨(skipped) — 알림·연출 없음
                const team = e.side ? teamOf(e.side) : 'enemy';
                const ids = (e.unit_ids ?? []).map(String);
                const heroName = e.hero ? (get(ids[0])?.name ?? null) : null; // 이름 있는 영웅 난입/합류(cue spawn hero)
                addLog(heroName ? `${team === 'ally' ? '아군' : s.opponentLabel} ${heroName} 등장` : `${team === 'ally' ? '아군' : s.opponentLabel} 증원 ${ids.length}부대 등장${e.delayed ? ` (${e.delayed}부대는 자리가 없어 다음 라운드)` : ''}`);
                ev({ type: 'reinforce', team, unitIds: ids, zone: e.zone ?? null, delayed: Number(e.delayed) || 0, turn: e.turn, hero: e.hero ?? null, heroName, tag: e.tag ?? null });
            } else if (e.type === 'objective_progress') { // 점령 진행(라운드 종료 판정): hold/need, enemy_hold/enemy_need
                addLog(`점령 진행 ${e.hold ?? 0}/${e.need ?? '?'}${e.enemy_need ? ` · 적 점유 ${e.enemy_hold ?? 0}/${e.enemy_need}` : ''}`);
                ev({ type: 'objectiveProgress', hold: Number(e.hold) || 0, need: Number(e.need) || 0, enemyHold: Number(e.enemy_hold) || 0, enemyNeed: Number(e.enemy_need) || 0 });
            } else if (e.type === 'activation_start' || e.type === 'activation_end' || e.type === 'round_end') { // 교대 행동(on 전투에서만 온다)
                altSnap = altReduce(altSnap, e);
                const team = e.side ? teamOf(e.side) : null;
                const who = team === 'ally' ? '아군' : s.opponentLabel;
                const sq = e.actor_unit_id != null ? String(e.actor_unit_id) : null;
                if (e.type === 'activation_start') addLog(`[${who}] ${name(sq)} 부대 행동 시작`);
                else if (e.type === 'activation_end') addLog(`[${who}] ${name(sq)} 부대 행동 종료${{ collapse: ' (붕괴)', timeout: ' (시간 초과)' }[e.reason] ?? ''}`);
                else addLog(`--- 라운드 ${e.turn} 종료${e.reason === 'cap' ? ' (연속 상한)' : ''} ---`);
                ev({ type: 'alt', kind: e.type === 'activation_start' ? 'start' : e.type === 'activation_end' ? 'end' : 'round', team, squadId: sq, unitIds: (e.unit_ids ?? []).map(String), reason: e.reason ?? null, turn: e.turn, alt: altSnap });
            }
            if (altSnap && (e.type === 'turn_start' || e.type === 'collapse')) altSnap = altReduce(altSnap, e);
        });
    }

    // 행동 제출: 스테이지는 /battles/{id}/actions, 방은 /rooms/{code}/actions (응답 = {events} + 방 상태)
    const act = (action) => (s.mode === 'room' ? battleApi.room.action(s.roomCode, action) : battleApi.action(s.battleId, action));

    // 방 상태(폴링/행동 응답) 반영: 턴 소유·남은 시간·플레이어·마지막 seq
    function applyRoom(res) {
        if (!res || s.mode !== 'room') return;
        if (typeof res.last_seq === 'number') s.lastSeq = Math.max(s.lastSeq, res.last_seq);
        s.room = { mode: res.room?.mode ?? s.room?.mode, status: res.room?.status, players: res.players ?? s.room?.players ?? [], turn: res.turn ?? null, turnAt: Date.now(), battleStatus: res.battle_status, followTroops: typeof res.room?.follow_troops === 'boolean' ? res.room.follow_troops : (s.room?.followTroops ?? false) }; // followTroops: 방 옵션(서버 room.follow_troops)
        s.opponentLabel = s.room.mode === 'pvp' ? '상대' : '적군';
    }

    // 응답(battle + events) 반영: 상태는 즉시 최종값, 연출은 큐, 마지막에 sync
    async function absorb(res) {
        playEvents(res.events);
        if (res.battle) applyView(res.battle);
        applyRoom(res);
        change();
        ev({ type: 'sync' });
        if (s.status === 'finished') await loadResult(res.result);
    }

    // ---- 방 폴링(1.5초, 탭 비활성 4초, 오류 시 백오프 최대 10초). 내 행동 중(busy)에는 건너뛴다 ----
    let pollBackoff = 0;
    function schedulePoll(ms) {
        if (stopped || s.mode !== 'room' || s.status === 'finished') return;
        clearTimeout(pollTimer);
        pollTimer = setTimeout(pollOnce, ms ?? (rt?.live() ? WS_SAFETY_POLL_MS : (typeof document !== 'undefined' && document.hidden ? 4000 : 1500)));
    }
    function kickPoll() { if (stopped || s.mode !== 'room' || s.status === 'finished') return; clearTimeout(pollTimer); pollOnce(); }
    async function pollOnce() {
        if (stopped || s.status === 'finished') return;
        if (polling) { pollAgain = true; return; }
        if (s.busy) { schedulePoll(500); return; }
        polling = true;
        try {
            const res = await battleApi.room.poll(s.roomCode, s.lastSeq);
            pollBackoff = 0;
            const had = (res.events ?? []).length > 0;
            if (had) playEvents(res.events);
            // 입력 중(선택·임시 이동·메뉴·대상 선택·예측창: selectedId 가 있음)에 서버 상태가 그대로면 units 를 덮어쓰지 않는다
            // (덮어쓰면 임시 이동 좌표가 원복돼 확정 시 원위치로 move 가 전송됨). 이벤트·턴 전환·버전 변경·종료·내 유닛 서버 행동 완료면 기존대로 동기화
            const sv = res.battle;
            const srvSel = sv && s.selectedId ? (sv.units ?? []).find((u) => u.id === s.selectedId) : null;
            const serverChanged = !sv || had || sv.version !== s.version || `${sv.turn}|${sv.current_side}` !== s.turnKey || sv.status !== 'in_progress' || !srvSel || !!srvSel.acted;
            if (sv && s.selectedId && !serverChanged) {
                applyRoom(res);
                change();
            } else if (res.battle) {
                // 내 선택 중(임시 이동 등)에 서버 상태가 바뀌면 선택을 접고 서버 기준으로
                const cleared = !!s.selectedId;
                if (cleared) clearSelection();
                const prevSide = s.side;
                applyView(res.battle);
                applyRoom(res);
                change();
                if (had || cleared || prevSide !== s.side) ev({ type: 'sync' });
                if (s.status === 'finished') { await loadResult(res.result); return; }
            } else { applyRoom(res); change(); }
        } catch (e) {
            if (e.status === 401) { ev({ type: 'auth' }); return; }
            if (e.status === 404) { toast(errorText(e)); s.status = 'finished'; change(); await loadResult({ win: false, abandoned: true, stars: 0, gold: 0, heroes: [], user: null }); return; }
            pollBackoff = Math.min(10000, (pollBackoff || 1500) * 2);
        } finally { polling = false; }
        const again = pollAgain;
        pollAgain = false;
        schedulePoll(again ? 0 : (pollBackoff || undefined));
    }

    async function loadResult(given) {
        let result = given ?? null;
        clearTimeout(pollTimer);
        if (!result && s.mode !== 'room') { // 방 전투 결과는 폴링 응답(result)으로만 온다(/battles/{id}/result 는 스테이지 전용)
            try { result = (await battleApi.result(s.battleId)).result; } catch (e) { toast(errorText(e)); }
        }
        try { s.profileAfter = (await battleApi.profile()).profile; } catch { /* 선택 정보 */ }
        s.result = result ?? { win: s.winner === 'a', stars: 0, gold: 0, heroes: [], user: null };
        s.status = 'finished';
        clearSelection();
        change();
        ev({ type: 'result', result: s.result });
    }

    // ---- 오류 처리: 401 로그인, 409/422 안내 + 서버 기준 재동기화, 네트워크는 재시도 안내 ----
    async function fail(e, retry) {
        console.warn('[battle api]', e);
        // 진입(로딩) 중 실패: 로딩 상태를 끝내고(status 'error') 화면이 안내 모달 + 돌아가기를 띄우게 한다.
        // (이전: 409/422 는 toast 후 battleId 가 없으면 아무것도 안 해 '불러오는 중'에 영구 정지)
        if (s.status === 'loading') {
            console.error(`[battle load failed] ${errorTag(e)}`, e?.message ?? '');
            s.status = 'error';
            s.error = { code: e?.code ?? 'unknown', message: errorText(e), retry };
            change();
            if (e?.status === 401) { ev({ type: 'auth' }); return; }
            ev({ type: 'loadFailed', code: e?.code ?? 'unknown', status: e?.status ?? 0, message: errorText(e), retry });
            return;
        }
        if (e.status === 401) { s.error = { code: 'unauthenticated', message: errorText(e) }; change(); ev({ type: 'auth' }); return; }
        if (e.status === 409 || e.status === 422 || e.status === 403 || e.status === 404) {
            toast(errorText(e), 3000); // 서버 거부 안내: 재동기화 연출 뒤에도 읽을 수 있게 3초(강화면 gacha99)
            if (s.battleId) await actions.resync();
            return;
        }
        // 503(db_busy)·네트워크: 화면의 임시 이동·대상 확정 상태가 서버와 어긋날 수 있으므로 선택을 접는다(원위치 복원). 서버 상태는 다시 시도/재동기화로 받는다
        if (s.selectedId) { clearSelection(); ev({ type: 'sync' }); }
        s.error = { code: e.code, message: errorText(e), retry };
        change();
        ev({ type: 'error', message: errorText(e), retry });
    }

    async function run(fn, retry) {
        if (s.busy) return false;
        s.busy = true;
        s.error = null;
        change();
        try { await fn(); return true; } catch (e) { await fail(e, retry); return false; } finally { s.busy = false; change(); }
    }

    // ---- 배치(임시 자동 배치): FE B 의 Deploy 씬이 생기면 그쪽에서 PUT/confirm 하고 Battle 에는 {battleId} 만 넘긴다 ----
    function autoPlacements(dep) {
        if (dep.lineup_enforced && Array.isArray(dep.candidates)) dep = { ...dep, candidates: dep.candidates.filter((c) => c.in_pool !== false || c.forced) }; // 편성 라인업 풀 안에서만(2026-11-14)
        const cand = new Map(dep.candidates.map((c) => [c.user_hero_id, c]));
        // 저장된 편성(default_party)만 출전시킨다. 편성이 비었을 때만 보유 영웅으로 채운다
        // (이전: 편성 밖 대기 영웅까지 슬롯을 채워 출전 -> 서버 코스트 합산 초과(cost_exceeded)로 진입 실패)
        const party = (dep.default_party ?? []).filter((id, i, a) => cand.has(id) && a.indexOf(id) === i);
        const order = party.length ? party : dep.candidates.map((c) => c.user_hero_id);
        // 부대 코스트는 서버 규칙 rules.troop_cost 가 켜진 경우에만 합산한다(기본 off = 영웅 코스트만, 값이 없으면 off). 최종 판정은 서버
        const troopCostOf = (id) => (s.troopCostOn === true && dep.squad ? ((dep.formation?.[id] ?? dep.formation?.[String(id)])?.troops ?? []).reduce((a, t) => a + (Number(t.cost) || 0), 0) : 0);
        // 필수 출전(forced[]·candidates[].forced·고정 슬롯 영웅)은 슬롯 수 면제(Deploy.isFreeSlot·서버 validateParty 와 같은 규칙), 항상 맨 앞에 포함. 코스트는 합산
        const forcedIds = new Set();
        (dep.forced ?? []).forEach((f) => { const c = f?.user_hero_id != null ? cand.get(f.user_hero_id) : dep.candidates.find((x) => x.hero === f?.hero); if (c && f.free_slot !== false) forcedIds.add(c.user_hero_id); });
        dep.candidates.forEach((c) => { if (c.forced) forcedIds.add(c.user_hero_id); });
        (dep.slot_mode && Array.isArray(dep.slots) ? dep.slots : []).forEach((q) => { if (q?.kind === 'fixed' && q.user_hero_id != null && cand.has(Number(q.user_hero_id))) forcedIds.add(Number(q.user_hero_id)); });
        const picked = [];
        let cost = 0;
        let used = 0;   // 슬롯 상한 판정용(필수 출전 제외)
        // 순서: 서버 default_party(강제 영웅 선언 순서, 주인공 지휘관 맨 앞 = protagonist_must_lead) 우선
        const forcedOrder = [...new Set([...order.filter((x) => forcedIds.has(x)), ...forcedIds])].filter((x) => cand.has(x));
        for (const id of forcedOrder) { const c = cand.get(id); picked.push(c); cost += c.cost + troopCostOf(id); }
        for (const id of order) {
            if (forcedIds.has(id)) continue;
            const c = cand.get(id);
            const add = c.cost + troopCostOf(id);
            if (used >= dep.max_party_slots || cost + add > dep.max_cost) continue;
            picked.push(c);
            cost += add;
            used++;
        }
        const map = { w: dep.width, h: dep.height, tiles: dep.tiles };
        const occupied = new Set(dep.enemy_units.map((u) => keyOf(u.x, u.y)));
        const cx = dep.width / 2;
        const cy = dep.height / 2;
        const zone = [...dep.deploy_zone].sort((a, b) => (Math.abs(a[0] - cx) + Math.abs(a[1] - cy)) - (Math.abs(b[0] - cx) + Math.abs(b[1] - cy)));
        const placements = [];
        const slotMode = !!dep.slot_mode && Array.isArray(dep.slots) && dep.slots.length > 0;
        const dp = dep.default_positions ?? {};
        for (const c of picked) {
            // 서버 기본 위치(슬롯 스테이지는 슬롯 칸) 우선. 슬롯 모드에서 자리가 없으면 영역 임의 칸이 not_a_slot(422)이므로 건너뛴다
            const sp = dp[c.user_hero_id] ?? dp[String(c.user_hero_id)];
            if (sp && !occupied.has(keyOf(sp.x, sp.y))) { occupied.add(keyOf(sp.x, sp.y)); placements.push({ user_hero_id: c.user_hero_id, x: sp.x, y: sp.y }); continue; }
            if (slotMode) {
                // 기본 위치가 없으면 이 영웅이 설 수 있는 빈 슬롯(고정 슬롯 제외·병종 허용, Deploy.takeSlotCell 과 같은 규칙). 없으면 건너뛴다
                const ut = c.unit_type;
                const sl = dep.slots.find((q) => Number.isInteger(q?.x) && Number.isInteger(q?.y) && q.kind !== 'fixed' && !occupied.has(keyOf(q.x, q.y))
                    && (!Array.isArray(q.unit_types) || !q.unit_types.length || q.unit_types.includes(ut) || q.unit_types.includes(typeAlias(ut))));
                if (sl) { occupied.add(keyOf(sl.x, sl.y)); placements.push({ user_hero_id: c.user_hero_id, x: sl.x, y: sl.y }); }
                continue;
            }
            const mt = unitType(c.unit_type).move_type;
            const t = zone.find(([x, y]) => !occupied.has(keyOf(x, y)) && terrainMod(map.tiles[y][x], mt).cost !== null);
            if (!t) continue;
            occupied.add(keyOf(t[0], t[1]));
            placements.push({ user_hero_id: c.user_hero_id, x: t[0], y: t[1] });
        }
        return placements;
    }

    async function startMovePhase(u) {
        if (u.moved) { s.reach = null; s.standableTiles = []; s.phase = 'menu'; return; } // 서버상 이미 이동한 유닛: 바로 행동 메뉴
        let reach;
        let mv = null;
        try {
            if (s.mode === 'room') reach = reachable(s.map, s.units, u); // 방 전투는 moves 조회 API 가 없어 로컬 계산(참고용, 판정은 서버)
            else { mv = await battleApi.moves(s.battleId, u.id); reach = fromServerTiles(mv.tiles, u, reachable(s.map, s.units, u)); s.srvTargets = Array.isArray(mv?.targets) ? { unitId: u.id, ids: mv.targets.map(String) } : null; } // 서버 공격 대상(현재 칸 기준)
        } catch (e) {
            if (e.status === 401) throw e;
            toast(`${errorText(e)} · 로컬 계산으로 표시합니다`);
            reach = reachable(s.map, s.units, u);
        }
        // 교대 행동: 활성 부대 밖 유닛 조회는 서버가 locked 로 답한다. preview_tiles(+preview_targets)가 있으면 활성화 전 이동 범위를 흐리게 보여 주고
        // (선택은 하지 않음 = 행동 불가), no_moves 면 '대기만 가능' 안내. 미리보기 필드가 없는 구 응답은 기존처럼 409 squad_locked 처리
        if (mv?.locked) {
            if (!Array.isArray(mv.preview_tiles) && !mv.no_moves) throw Object.assign(new Error('squad_locked'), { status: 409, code: mv.reason ?? 'squad_locked' });
            clearSelection();
            s.lockedPreview = { unitId: u.id, tiles: (mv.preview_tiles ?? []).filter((t) => !(t.x === u.x && t.y === u.y)), targets: mv.preview_targets ?? [], noMoves: !!mv.no_moves };
            toast(mv.no_moves ? '이 부대는 지금 이동·공격할 수 없습니다. 대기만 가능합니다.' : '활성 부대가 아닙니다. 흐린 칸 = 이 부대를 활성화하면 이동할 수 있는 범위입니다.');
            return;
        }
        s.lockedPreview = null;
        s.reach = reach;
        s.standableTiles = [...reach.values()].filter((n) => { const o = unitAt(s.units, n.x, n.y); return !o || o.id === u.id; });
        s.phase = 'move';
    }

    function select(u) {
        return run(async () => {
            s.selectedId = u.id;
            s.origin = { x: u.x, y: u.y };
            s.moved = false;
            await startMovePhase(u);
        });
    }

    // 교대 행동: 명시 활성화(activate{squad_id}) 후 해당 유닛 선택. 서버 암묵 활성화(alt_implicit_activate)에는 의존하지 않는다.
    // 409(squad_locked / squad_already_activated): 서버 상태로 재동기화한 뒤 이미 그 부대가 활성이면 그대로 계속, 아니면 안내만.
    async function activateSquad(squadId) {
        try {
            const res = await act({ type: 'activate', squad_id: String(squadId) });
            playEvents(res.events);
            if (res.battle) applyView(res.battle);
            applyRoom(res);
            return true;
        } catch (e) {
            if (e.status !== 409) throw e;
            const view = await fetchView();
            if (view) applyView(view);
            if (s.alt?.activeSquad === String(squadId)) return true;
            toast(errorText(e));
            ev({ type: 'sync' });
            return false;
        }
    }
    function activateAndSelect(u, squadId) {
        return run(async () => {
            if (!(await activateSquad(squadId))) return;
            const cur = get(u.id);
            if (!cur || cur.acted || cur.hp <= 0) { change(); ev({ type: 'sync' }); return; }
            s.selectedId = cur.id;
            s.origin = { x: cur.x, y: cur.y };
            s.moved = false;
            await startMovePhase(cur);
        });
    }
    // 교대 on 에서 아군 유닛 탭: 선택 가능 판정 -> (필요 시) 확인 팝업 이벤트 -> 활성화+선택. 교대 off 면 기존 select 와 동일.
    function trySelect(u) {
        if (!s.alternate) return select(u);
        const chk = altSelectCheck(s.alt, u, s.units, s.mySide);
        if (!chk.ok) { toast(chk.message); return false; }
        if (!chk.activate) return select(u);
        const go = () => activateAndSelect(u, chk.squadId);
        if (settings.get().altConfirmSkip) return go();
        ev({ type: 'altConfirm', squadId: chk.squadId, unitId: u.id, onYes: go, onSkip: () => { settings.set({ altConfirmSkip: true }); return go(); } });
        return false;
    }

    // 임시 이동 위치에서의 공격 대상(로컬 계산, 참고용)
    // 총병(gunner): 이동한 턴(서버 moved 또는 임시 이동)은 대상·칸 없음, 그 외에는 사선(LOS)이 열린 거리 3 칸만. 서버 targets(현재 칸·이동 전)가 있으면 그것을 신뢰
    const isGunner = (u) => typeAlias(u?.type) === 'gunner';
    function targetsFrom(u) {
        const { rmin, rmax } = rangeOf(u);
        if (isGunner(u) && (u.moved || (s.moved && s.selectedId === u.id))) return { tiles: [], targets: [], gunMoved: true };
        let tiles = attackTiles(s.map, u.x, u.y, rmin, rmax);
        if (isGunner(u)) tiles = tiles.filter((t) => lineOfFire(s.map, u.x, u.y, t.x, t.y, (code) => terrainAttr(code, 'blocks_line_of_fire') > 0));
        const set = new Set(tiles.map((t) => keyOf(t.x, t.y)));
        let targets = alive().filter((e) => e.team !== u.team && set.has(keyOf(e.x, e.y))).map((e) => e.id);
        if (isGunner(u) && s.srvTargets?.unitId === u.id && !s.moved) targets = s.srvTargets.ids.filter((id) => alive().some((e) => String(e.id) === id)); // 서버 판정 우선
        return { tiles, targets };
    }

    // 임시 이동분을 서버에 전송(이미 보냈으면 생략)
    async function commitMove(u) {
        if (!s.moved || u.moved) return;
        const res = await act({ type: 'move', unit_id: u.id, x: u.x, y: u.y });
        s.moved = false; // 서버 반영 완료(더 이상 되돌릴 수 없음)
        playEvents(res.events, { localMove: { unitId: u.id, x: u.x, y: u.y } }); // 걷기 연출은 moveTo 에서 이미 재생함
        if (res.battle) applyView(res.battle);
        applyRoom(res);
        if (s.status === 'finished') { ev({ type: 'sync' }); await loadResult(res.result); }
    }

    async function finishWith(action) {
        const u = selected();
        if (!u) return;
        const moveStep = s.moved && !u.moved;
        try {
            await commitMove(u);
        } catch (e) {
            if (moveStep && e.status !== 401 && e.status !== 0) { s.moved = false; } // 이동 자체가 거부됨: 선택 유지 안 함
            throw e;
        }
        try {
            const res = await act({ unit_id: u.id, ...action });
            const next = selected();
            if (next) next.skillUsed = true;
            clearSelection();
            await absorb(res);
            // 자동 턴 종료는 기존 턴제 전용. 교대 행동은 활성 부대 전원이 행동하면 서버가 activation_end(reason 'done')로 자동 종료하므로 FE 가 중복 호출하지 않는다
            if (!s.alternate && s.status === 'battle' && s.side === 'ally' && alive().filter((x) => x.team === 'ally' && !x.npc_ally).every((x) => x.acted)) { // 아군 NPC(AI 조종)는 제외
                await actions.endTurn({ force: true });
            }
        } catch (e) {
            // 이동은 서버에 반영됐지만 공격/대기가 거부된 경우: 선택을 유지한 채 서버 기준으로 재동기화(메뉴에서 대기/공격만 가능)
            if (moveStep && (e.status === 422 || e.status === 409)) {
                toast(errorText(e));
                applyView(await fetchView());
                const cur = get(u.id);
                if (cur && !cur.acted) { s.origin = { x: cur.x, y: cur.y }; s.moved = false; Object.assign(s, { phase: 'menu', attackTiles: [], targets: [], targetId: null, forecast: null, targetMode: null, skill: null }); }
                else clearSelection();
                ev({ type: 'sync' });
                return;
            }
            throw e;
        }
    }

    // 최신 전투 뷰(스테이지: GET /battles/{id}, 방: 폴링 응답의 battle)
    async function fetchView() {
        if (s.mode === 'room') { const r = await battleApi.room.poll(s.roomCode, s.lastSeq); applyRoom(r); if (r.events?.length) playEvents(r.events); return r.battle; }
        return (await battleApi.show(s.battleId)).battle;
    }

    const actions = {
        state: s,
        on: em.on,
        get,
        unitAt: (x, y) => unitAt(s.units, x, y),
        alive,
        targetsFrom,
        squadOf: (u) => squadKeyOf(u, s.units, s.alt), // 교대 행동 부대 키(off 여도 계산은 가능)
        // 진단용(읽기 전용, window.__cue): 가짜 cue/move 이벤트를 로컬 연출 큐로만 재생. 서버 전송·유닛 좌표 변경 없음(끝에 sync 로 서버 좌표 복귀)
        // 축약 입력 허용: {do:'say',text} / {do:'move',unit:'b5',to:[x,y]}(from 생략 시 현재 좌표) / 서버 이벤트 형식 그대로
        debugCues(list) {
            const norm = (e, i) => {
                if (!e || typeof e !== 'object') return null;
                if (e.type) return e;
                if (e.do === 'move') { const u = get(e.unit ?? e.actor_unit_id); return u ? { type: 'move', actor_unit_id: u.id, from: e.from ?? [u.x, u.y], to: e.to, scripted: true, cue_id: e.cue_id ?? `dbg${i}` } : null; }
                return { type: 'cue', cue_id: e.cue_id ?? `dbg${i}`, ...e };
            };
            playEvents((Array.isArray(list) ? list : [list]).map(norm).filter(Boolean));
            change();
            ev({ type: 'sync' });
        },
        // 씬 종료 시 폴링 중단
        stop() { stopped = true; clearTimeout(pollTimer); clearTimeout(expireTimer); rt?.leave(); rt = null; },
        // 남은 턴 시간(초): 마지막 폴링값에서 경과 시간을 뺀 로컬 추정
        // 턴 남은 시간(ms): 서버 turn_deadline 우선, 없으면 turn_input_seconds 로 턴 시작 시각 기준 추정, 둘 다 없으면 null
        turnRemainingMs() {
            if (s.status !== 'battle') return null;
            // 제한시간은 서버가 turn_deadline 을 줄 때만(PvP 방). 스테이지·solo(deadline null)는 타이머 UI·잠금·자동 종료 요청 모두 없음
            return s.turnDeadline == null ? null : Math.max(0, s.turnDeadline - (Date.now() + (s.clockOffset ?? 0))); // 서버 시각 기준
        },
        turnTotalMs() { return (s.turnInputSeconds ?? 60) * 1000; },
        // 마감 도달(마감당 1회): 내 차례면 즉시 조작 잠금(선택·메뉴 닫기)+안내. 서버는 마감+유예(2초) 경과 후 요청이 올 때 자동 종료하므로
        // 그 시점(+300ms, 서버 시계 보정)에 재조회해 자동 종료 이벤트를 큐 순서대로 재생. 실패·미반영 시 1초 간격 최대 3회 재시도. 상대 차례도 재조회만 동일
        onTurnExpired() {
            if (s.turnExpiredNotified || s.status !== 'battle' || s.turnDeadline == null) return;
            s.turnExpiredNotified = true;
            const key = s.turnDeadline;
            if (s.side === 'ally') {
                s.timeLocked = true;
                if (s.selectedId || s.lockedPreview) { clearSelection(); ev({ type: 'sync' }); }
                change();
                toast('시간 초과 — 남은 유닛은 대기 처리되고 턴이 넘어갑니다');
            }
            let tries = 0;
            const attempt = async () => {
                if (stopped || s.status !== 'battle' || s.turnDeadline !== key) return; // 이미 다음 차례로 넘어감
                tries += 1;
                try {
                    if (s.mode === 'room') { clearTimeout(pollTimer); await pollOnce(); } // 폴링이 서버 tick(자동 종료)을 유발하고 이벤트·선택·결과를 처리
                    else if (!s.busy) await absorb(await battleApi.show(s.battleId)); // (구 서버 호환) 스테이지: GET 이 지연 평가 후 events 를 준다
                } catch (e) { if (e?.status === 401) { ev({ type: 'auth' }); return; } }
                if (tries < 4 && !stopped && s.status === 'battle' && s.turnDeadline === key) { clearTimeout(expireTimer); expireTimer = setTimeout(attempt, 1000); }
            };
            clearTimeout(expireTimer);
            expireTimer = setTimeout(attempt, Math.max(0, key + 2000 + 300 - (Date.now() + (s.clockOffset ?? 0))));
        },
        remainingSeconds() { const t = s.room?.turn; if (!t || t.remaining_seconds == null) return null; return Math.max(0, Math.round(t.remaining_seconds - (Date.now() - s.room.turnAt) / 1000)); },

        // 진입: {mode:'room', roomCode} 방 전투(폴링) | {battleId} 우선 | {stageId}(도전 생성 + 임시 자동 배치 + 확정) | 둘 다 없으면 첫 해금 스테이지
        async start({ mode, roomCode, battleId, stageId } = {}) {
            s.status = 'loading';
            stopped = false;
            if (mode === 'room' && roomCode) { s.mode = 'room'; s.roomCode = roomCode; }
            change();
            return run(async () => {
                // 공개 규칙표(지형 전체·병종 기본 능력치·오라 카탈로그): 진입 시 1회, 실패하면 FE 시작값 유지
                battleApi.rules().then((r) => { s.troopCostOn = r?.troop_cost === true; applyServerRules(r); setAuraCatalog(r?.auras); change(); }).catch(() => {});
                try { const pr = await battleApi.profile(); s.profileBefore = pr.profile; setFlankMult(pr.rules?.facing_mult); setForecastRules(pr.rules); if (pr.rules?.ally_passthrough_cost != null) setAllyPassCost(pr.rules.ally_passthrough_cost); } catch (e) { if (e.status === 401) throw e; }
                let view;
                let dep = null;
                if (s.mode === 'room') {
                    const r = await battleApi.room.poll(s.roomCode, 0);
                    s.mySide = r.my_side ?? 'a';
                    applyRoom(r);
                    if (!r.battle || r.battle.status === 'deployment') throw Object.assign(new Error('전투가 아직 시작되지 않았습니다'), { status: 409, code: 'deployment_phase' });
                    s.lastSeq = r.last_seq ?? 0; // 과거 이벤트는 재생하지 않고 현재 상태부터
                    applyView(r.battle);
                    const cmd0 = s.units.find((u) => u.team === 'ally' && u.commander) ?? s.units[0];
                    if (cmd0) s.cursor = { x: cmd0.x, y: cmd0.y };
                    addLog(`${s.room.mode === 'pvp' ? '대전' : '자유 대전'} 시작 (턴 ${s.turn})`);
                    ev({ type: 'sync' });
                    if (s.status === 'finished') await loadResult(r.result);
                    else {
                        if (s.room?.mode === 'pvp') rt = watchRealtime(`room.${s.roomCode}`, { events: { '.room.changed': kickPoll }, onLive: kickPoll, onDown: kickPoll });
                        schedulePoll(1500);
                    }
                    return;
                }
                if (battleId) {
                    view = (await battleApi.show(battleId)).battle;
                    if (view.status === 'deployment') dep = await battleApi.deployment(battleId);
                } else {
                    if (!stageId) {
                        const { stages } = await battleApi.stages();
                        const st = stages.find((x) => (typeof x.playable === 'boolean' ? x.playable : x.unlocked)) ?? stages[0]; // 필수 영웅 미보유(422) 스테이지 제외
                        stageId = st?.id ?? 1;
                        s.stage = st ?? null;
                    }
                    const r = await battleApi.challenge(stageId);
                    view = r.battle;
                    dep = r.deployment;
                }
                if (view.status === 'deployment' && dep) {
                    const placements = autoPlacements(dep);
                    if (!placements.length) throw Object.assign(new Error('배치할 영웅이 없습니다'), { status: 0, code: 'no_party' });
                    await battleApi.submitDeployment(view.battle_id, placements);
                    view = (await battleApi.confirm(view.battle_id)).battle;
                }
                applyView(view);
                const cmd = s.units.find((u) => u.team === 'ally' && u.commander) ?? s.units[0];
                if (cmd) s.cursor = { x: cmd.x, y: cmd.y };
                addLog(`전투 시작 (턴 ${s.turn})`);
                ev({ type: 'sync' });
                playStartCues();
                if (s.status === 'finished') await loadResult();
                else if (s.side === 'enemy') await actions.botTurn();
            }, () => actions.start({ battleId, stageId }));
        },

        // 서버 기준 재동기화(409/422 뒤, 복귀 시)
        async resync() {
            if (!s.battleId && s.mode !== 'room') return;
            try {
                const view = await fetchView();
                clearSelection();
                if (view) applyView(view);
                change();
                ev({ type: 'sync' });
                if (s.status === 'finished' && !s.result) await loadResult();
                else if (s.status === 'battle' && s.side === 'enemy') await actions.botTurn();
            } catch (e) { if (e.status === 401) { ev({ type: 'auth' }); } else toast(errorText(e)); }
        },

        // 봇 차례에 멈춘 전투 재처리
        async botTurn() {
            if (s.status !== 'battle' || s.side !== 'enemy' || s.mode === 'room') return; // 방 전투는 폴링이 상대/봇 턴을 가져온다
            try { await absorb(await battleApi.botTurn(s.battleId)); } catch (e) { await fail(e, () => actions.botTurn()); }
        },

        setCursor(x, y) {
            if (!inBounds(s.map, x, y) || (s.cursor.x === x && s.cursor.y === y)) return;
            s.cursor = { x, y };
            ev({ type: 'cursor', x, y });
            change();
        },

        tap(x, y) {
            if (s.status !== 'battle' || s.side !== 'ally' || s.busy) return;
            if (s.timeLocked) { toast('시간 초과 — 턴 종료 처리 중입니다'); return; }
            actions.setCursor(x, y);
            const u = unitAt(s.units, x, y);
            if (u?.npc_ally && u.team === 'ally' && s.phase !== 'target' && s.phase !== 'confirm') { toast('지원 아군은 자동으로 행동합니다'); return; } // 아군 NPC: 선택 불가(서버도 403 npc_ally_uncontrollable)
            if (s.phase === 'idle') {
                if (u && u.team === 'ally' && !u.acted) trySelect(u);
                else if (u && u.team === 'ally') toast(s.alternate ? (altSelectCheck(s.alt, u, s.units, s.mySide).reason === 'done' ? '이번 라운드에 이미 행동한 부대입니다' : '이미 행동한 유닛입니다') : '이미 행동한 유닛입니다');
            } else if (s.phase === 'move') {
                if (s.standableTiles.some((t) => t.x === x && t.y === y)) actions.moveTo(x, y);
                else if (u && u.team === 'ally' && !u.acted && !s.moved) {
                    if (s.alternate && squadKeyOf(u, s.units, s.alt) !== s.alt?.activeSquad) toast('현재 활성 부대의 행동을 먼저 끝내세요');
                    else select(u);
                }
                else toast('이동할 수 없는 칸입니다');
            } else if (s.phase === 'menu') {
                if (u && u.team === 'ally' && !u.acted && u.id !== s.selectedId && !s.moved) {
                    if (s.alternate && squadKeyOf(u, s.units, s.alt) !== s.alt?.activeSquad) toast('현재 활성 부대의 행동을 먼저 끝내세요');
                    else { clearSelection(); select(u); }
                }
            } else if (s.phase === 'target' || s.phase === 'confirm') {
                if (u && s.targets.includes(u.id)) actions.setTarget(u);
                else if (s.phase === 'target' && s.targetMode === 'skill' && s.skill) { // 스킬 범위 밖·무효 칸: 아무것도 소모하지 않고 안내만(취소는 우클릭/Esc/하단 취소)
                    const tk = s.skill.target_kind;
                    toast(tk === 'self' || tk === 'none' ? '시전자(자신)를 눌러 사용하세요 (취소: 취소 버튼·Esc)' : tk === 'ally' ? '표시된 범위 안의 아군을 선택하세요 (취소: 취소 버튼·Esc)' : '표시된 범위 안의 적을 선택하세요 (취소: 취소 버튼·Esc)');
                }
            }
        },

        // 임시 이동(로컬): 서버 전송은 공격/대기 확정 시
        moveTo(x, y) {
            const u = selected();
            if (!u || s.phase !== 'move') return;
            const path = pathTo(s.reach, x, y);
            u.x = x; u.y = y;
            s.moved = x !== s.origin.x || y !== s.origin.y;
            s.reach = null;
            s.standableTiles = [];
            s.phase = 'menu';
            s.movePath = s.moved && path.length ? path : null; // 이동 미리보기(확정 전 단계 경로 표시, Battle.refreshOverlay)
            if (path.length) ev({ type: 'move', unitId: u.id, path });
            if (s.moved && isGunner(u)) toast('총병: 이동하면 이번 턴에는 사격할 수 없습니다'); // 사격하려면 제자리(이동 취소)
            change();
        },

        // 스킬 목록에서 하나 고름 -> 대상 선택(targetMode 'skill'). 대상 = 현재(임시 이동 반영) 위치의 사거리 안 적(서버 targets 는 서버 위치 기준이라
        // 이동하지 않았으면 서버 targets 와 교집합, 이동했으면 로컬 계산. 판정은 서버가 다시 한다)
        // 대상 종류(서버 active_skills[].target_kind, 2026-11-04 스킬 재분배): enemy(기본) = 사거리 안 적 / ally = 아군(자신 포함, 서버 targets 우선, 없으면 cast_range 이내) /
        //  self·none = 대상 지정 없음(시전자 중심: 반격태세 T_ACTIVE_STANCE·자기 강화 buff·surge 등) -> selfCast=true, targets 는 표시용(반경 안 아군)
        skillTargets(u, sk) {
            const tk = sk?.target_kind ?? 'enemy';
            if (tk === 'self' || tk === 'none') { // tiles = 시전자 중심 반경(맨해튼, 서버 allyIdsWithin 과 같은 거리) — 대상 선택 모드의 범위 표시용
                const ids = !s.moved && !u.moved && Array.isArray(sk?.targets) ? sk.targets.map(String) : [];
                const rad = Math.max(0, Number(sk?.params?.radius ?? 0) || 0);
                return { tiles: attackTiles(s.map, u.x, u.y, 0, rad), targets: ids.length ? ids : [u.id], selfCast: true };
            }
            if (tk === 'ally') { // tiles = 시전 거리(cast_range) 범위 전체(범위 표시용), targets = 그 안의 아군
                const cr = Number(sk?.params?.cast_range ?? 2);
                let ids = alive().filter((e) => e.team === u.team && Math.abs(e.x - u.x) + Math.abs(e.y - u.y) <= cr).map((e) => e.id);
                if (!s.moved && !u.moved && Array.isArray(sk?.targets)) ids = ids.filter((id) => sk.targets.map(String).includes(String(id)));
                return { tiles: attackTiles(s.map, u.x, u.y, 0, cr), targets: ids, ally: true };
            }
            const [rmin, rmax] = Array.isArray(sk?.range) ? sk.range : [rangeOf(u).rmin, rangeOf(u).rmax];
            const tiles = attackTiles(s.map, u.x, u.y, rmin, rmax);
            const set = new Set(tiles.map((t) => keyOf(t.x, t.y)));
            let targets = alive().filter((e) => e.team !== u.team && set.has(keyOf(e.x, e.y))).map((e) => e.id);
            if (!s.moved && !u.moved && Array.isArray(sk?.targets)) targets = targets.filter((id) => sk.targets.map(String).includes(String(id)));
            return { tiles, targets };
        },
        pickSkill(code) {
            if (s.phase !== 'skill' || s.busy || s.timeLocked) return;
            const u = selected();
            const sk = activeSkillsOf(u).find((k) => k.code === code);
            if (!u || !sk) return;
            if (s.mpMode) { const mp = u.mp ?? sk.mp_left; if (mp != null && Number.isFinite(Number(sk.mp_cost)) && Number(mp) < Number(sk.mp_cost)) { toast(`마력이 부족합니다 (${mp}/${sk.mp_cost})`); return; } } // MP 방식: 쿨다운·횟수 무시
            else if ((sk.cooldown_left ?? 0) > 0) { toast(`재사용 대기 중입니다(${sk.cooldown_left}턴)`); return; }
            if (!s.mpMode && (sk.uses_left ?? 1) <= 0) { toast('이 전투의 사용 횟수를 모두 썼습니다'); return; }
            if (sk.usable === false) { toast('지금은 이 스킬을 사용할 수 없습니다'); return; }
            const { tiles, targets, selfCast } = actions.skillTargets(u, sk);
            // 2026-11-07 사용자: 스킬 탭 = 범위 표시 + 대상 선택 모드, 대상 탭 = 즉시 사용(패널 [사용]·예측 확인 단계 없음).
            // 자신 중심 스킬(selfCast)도 바로 쓰지 않고 반경을 보여 준 뒤 시전자 칸을 탭해야 발동(오발동 방지). 클릭 가능한 대상 = 시전자 1명
            if (!selfCast && !targets.length) { toast(sk.target_kind === 'ally' ? '범위 안에 대상 아군이 없습니다' : '사거리 안에 대상이 없습니다'); return; }
            Object.assign(s, { attackTiles: tiles, targets: selfCast ? [u.id] : targets, targetMode: 'skill', skill: sk, phase: 'target', targetId: null, forecast: null });
            change();
        },

        // 소모품 목록(GET /api/shop/items: 이름·효과·보유 수). 사용 가능한 전투(itemsLeft != null)에서만 1회 조회. 실패·꺼짐(404 items_disabled)이면 빈 목록
        async loadItems(force = false) {
            if (s.itemsLeft == null || (s.itemCatalog && !force) || itemsLoading) return;
            itemsLoading = true;
            try { const d = await gameApi.shopItems(); s.itemCatalog = Array.isArray(d?.items) ? d.items : []; if (Number.isFinite(Number(d?.max_per_battle))) s.itemMax = Number(d.max_per_battle); }
            catch (e) { s.itemCatalog = []; console.warn('[items]', errorTag(e)); }
            finally { itemsLoading = false; }
            change();
        },
        // 소모품을 쓸 수 없는 이유(null = 사용 가능): 행동 메뉴 '소모품' 항목의 비활성 사유
        itemBlockReason(u) {
            if (s.itemsLeft == null) return '이 전투에서는 소모품을 쓸 수 없습니다';
            if (!u || u.kind === 'troop' || u.non_hero) return '영웅만 소모품을 쓸 수 있습니다';
            if (s.itemsLeft <= 0) return `이 전투의 사용 횟수(${s.itemMax}회)를 모두 썼습니다`;
            if (!s.itemCatalog) return '소모품 정보를 불러오는 중입니다';
            const owned = s.itemCatalog.filter((x) => (x.owned ?? 0) > 0);
            if (!owned.length) return '보유한 소모품이 없습니다 (상점에서 구매)';
            if (owned.every((x) => actions.itemTargets(u, x).targets.length === 0)) return '회복이 필요한 아군이 없습니다'; // 보유분이 모두 회복약이고 대상(자신·인접)이 모두 병력 가득
            return null;
        },
        // 소모품 대상: 자신 + 인접(거리 1, 현재 임시 이동 위치 기준) 생존 아군. 회복 계열(heal_flat·heal_pct)은 병력이 가득 찬 유닛 제외(서버 422 item_no_effect 방지). 판정은 서버
        itemTargets(u, it = null) {
            const heal = isHealItem(it);
            const ids = alive().filter((e) => e.team === u.team && Math.abs(e.x - u.x) + Math.abs(e.y - u.y) <= 1 && (!heal || hpMissing(e))).map((e) => e.id);
            return { targets: ids, tiles: ids.map((id) => get(id)).filter(Boolean).map((e) => ({ x: e.x, y: e.y })) };
        },
        pickItem(code) {
            if (s.phase !== 'item' || s.busy || s.timeLocked) return;
            const u = selected();
            const it = s.itemCatalog?.find((x) => x.code === code);
            if (!u || !it) return;
            if ((it.owned ?? 0) <= 0) { toast('보유한 수량이 없습니다'); return; }
            const { tiles, targets } = actions.itemTargets(u, it);
            if (!targets.length) { toast('회복이 필요한 아군이 없습니다'); return; }
            if (targets.length === 1) { const tid = targets[0]; run(() => finishWith({ type: 'use_item', item: code, ...(tid !== u.id ? { target_id: tid } : {}) })); return; } // 대상 1명: 바로(자신이면 target_id 생략)
            Object.assign(s, { attackTiles: tiles, targets, targetMode: 'item', itemCode: code, phase: 'target', targetId: null, forecast: null });
            change();
        },

        // 메뉴: attack | skill | item | wait | cancel
        menu(name, opt = {}) {
            if (s.phase !== 'menu' || s.busy || s.timeLocked) return;
            const u = selected();
            if (!u) return;
            if (name === 'attack') {
                const { tiles, targets, gunMoved } = targetsFrom(u);
                if (gunMoved) { toast('총병은 이동한 턴에는 사격할 수 없습니다'); return; }
                if (!targets.length) { toast('사거리 안에 대상이 없습니다'); return; }
                Object.assign(s, { attackTiles: tiles, targets, targetMode: 'attack', phase: 'target', targetId: null, forecast: null });
                change();
            } else if (name === 'item') {
                const why = actions.itemBlockReason(u);
                if (why) { toast(why); return; }
                s.phase = 'item';
                change();
            } else if (name === 'skill') { // 액티브 스킬 목록(phase 'skill'). 목록·사용 불가 사유 표시는 씬(ContextMenu)이 담당
                if (!activeSkillsOf(u).length) { toast('사용할 수 있는 스킬이 없습니다'); return; }
                s.phase = 'skill';
                change();
            }
            else if (name === 'wait') {
                // 대기 방향 선택: 방향 규칙 on 이면 항상, off 여도 설정 '대기 시 방향 선택'(waitFacing, 기본 켜짐)이면 표시용 시선 선택
                if (s.facingOn || settings.get().waitFacing !== false) { s.phase = 'facing'; s.facingChoice = (s.moved ? opt.look : null) ?? u.facing ?? opt.look ?? 'down'; change(); } // 임시 이동 직후면 현재 시선(이동 방향) 우선: 서버도 이동 시 facing 을 이동 방향으로 바꾼다
                else run(() => finishWith({ type: 'wait' }));
            }
            else if (name === 'cancel') actions.cancel();
        },

        setTarget(foe) {
            const u = selected();
            if (!u) return;
            s.targetId = foe.id;
            if (s.targetMode === 'item' && s.itemCode) { const code = s.itemCode; run(() => finishWith({ type: 'use_item', item: code, ...(foe.id !== u.id ? { target_id: foe.id } : {}) })); return; } // 소모품: 자신이면 target_id 생략
            const sk = s.targetMode === 'skill' ? s.skill : null;
            if (sk) { // 스킬: 대상 탭 = 즉시 사용(2026-11-07 사용자, 예측 확인 단계 없음). 자신 중심(self·none) = target_id 생략(기존 계약 그대로), 적·아군 = target_id
                const code = sk.code; const selfCast = sk.target_kind === 'self' || sk.target_kind === 'none';
                if (selfCast && foe.id !== u.id) return;
                run(() => finishWith({ type: 'use_skill', skill: code, ...(selfCast ? {} : { target_id: foe.id }) }));
                return;
            }
            s.forecast = forecast(s.map, s.units, u, foe, { powerPct: sk?.power_pct, viaSkill: !!sk, origin: s.origin, alternate: s.alternate, rules: s.rulesEffective, micro: !!s.microOn }); // origin: 임시 이동 전 칸(조건부 패시브 moved 판정), alternate: 후공 보정 off 판정
            if (sk) s.forecast = { ...s.forecast, skill: { code: sk.code, name: skillDisplayName(sk.name) ?? sk.code, powerPct: sk.power_pct ?? 100 } }; // code: 스킬 아이콘(ui/SkillIcon.js)
            if (s.facingOn) s.forecast = { ...s.forecast, flank: flankOf(u.x, u.y, foe) }; // 참고용(판정은 서버)
            // 오라 분리 표기: 내 공격 오라 % / 적 방어 오라 % (auraBonus 와 같은 규칙)
            const [aAtk] = auraBonus(s.units, u, u.x, u.y);
            const [, dDef] = auraBonus(s.units, foe, foe.x, foe.y);
            s.forecast = { ...s.forecast, auraAtk: aAtk, auraDef: dDef };
            if (!sk) refineForecast(u, foe); // 미시 on: 서버 예측으로 덮어쓰기(캐시 적중이면 즉시, 아니면 응답 후). 로컬값은 먼저 그린다
            s.phase = 'confirm';
            change();
        },

        // 방향 선택(phase 'facing'): 선택 방향 변경(미리보기) / 확정(대기 + facing 전송)
        setFacingChoice(dir) {
            if (s.phase !== 'facing' || s.busy || s.facingChoice === dir) return;
            s.facingChoice = dir;
            change();
        },
        confirmFacing(dir) {
            if (s.phase !== 'facing' || s.busy || s.timeLocked) return;
            const facing = dir ?? s.facingChoice;
            if (s.facingOn) { run(() => finishWith({ type: 'wait', facing })); return; }
            // 규칙 off: 서버에는 facing 을 보내지 않고(서버는 off 면 무시하지만 계약상 생략) 표시용 시선만 갱신
            const id = s.selectedId;
            ev({ type: 'look', unitId: id, facing });
            run(() => finishWith({ type: 'wait' }));
        },

        // 우클릭/Esc/취소: 임시 이동은 원위치로(서버 미전송이므로 가능). 서버에 이미 이동한 유닛은 되돌릴 수 없다.
        cancel() {
            if (s.status !== 'battle' || s.side !== 'ally' || s.busy) return;
            const u = selected();
            if (!u) { if (s.lockedPreview) { s.lockedPreview = null; change(); } return; } // 잠긴 부대 미리보기 닫기
            if (s.phase === 'move') { clearSelection(); change(); }
            else if (s.phase === 'menu') {
                if (u.moved) { toast('이미 이동한 유닛은 되돌릴 수 없습니다'); return; }
                if (s.moved) { ev({ type: 'move', unitId: u.id, path: [], snapTo: { ...s.origin } }); u.x = s.origin.x; u.y = s.origin.y; s.moved = false; }
                s.movePath = null;
                run(async () => { await startMovePhase(u); });
            } else if (s.phase === 'facing') { Object.assign(s, { phase: 'menu', facingChoice: null }); change(); }
            else if (s.phase === 'skill' || s.phase === 'item') { s.phase = 'menu'; change(); }
            else if (s.phase === 'target') { Object.assign(s, { phase: s.targetMode === 'skill' ? 'skill' : s.targetMode === 'item' ? 'item' : 'menu', attackTiles: [], targets: [], targetMode: null, skill: null, itemCode: null }); change(); }
            else if (s.phase === 'confirm') { Object.assign(s, { phase: 'target', targetId: null, forecast: null }); change(); }
        },

        confirm() {
            if (s.phase !== 'confirm' || s.busy || s.timeLocked) return;
            const targetId = s.targetId;
            if (s.targetMode === 'skill' && s.skill) { const code = s.skill.code; run(() => finishWith({ type: 'use_skill', skill: code, target_id: targetId })); return; }
            run(() => finishWith({ type: 'attack', target_id: targetId }));
        },

        // 교대 행동: 활성 부대 행동 종료(end_activation). 응답에 상대(봇) 부대 활성화 이벤트가 이어서 올 수 있다(solo 서버 자동 실행)
        endActivation() {
            if (s.status !== 'battle' || s.side !== 'ally' || s.busy || !s.alternate || s.timeLocked) return;
            if (!s.alt?.activeSquad) { toast('먼저 부대를 선택하세요'); return; }
            return run(async () => {
                clearSelection();
                change();
                await absorb(await act({ type: 'end_activation' }));
                if (s.status === 'battle' && s.side === 'enemy') await actions.botTurn(); // 서버 봇 실행이 안전 상한으로 중단된 경우 재개
            }, () => actions.endActivation());
        },

        // 부대 칩 탭(교대 on): 해당 부대 영웅(없으면 첫 생존 유닛)으로 카메라 이동 + 선택 시도
        pickSquad(squadId) {
            const q = s.alt?.squads?.find((x) => x.id === String(squadId));
            if (!q) return;
            const members = q.unitIds.map(get).filter((u) => u && u.hp > 0);
            const lead = get(q.id)?.hp > 0 ? get(q.id) : members[0];
            if (!lead) { toast('붕괴한 부대입니다'); return; }
            actions.setCursor(lead.x, lead.y);
            ev({ type: 'focus', x: lead.x, y: lead.y });
            if (s.status !== 'battle' || s.side !== 'ally' || s.busy || q.side !== s.mySide || s.timeLocked) return;
            if (s.selectedId && s.moved) return; // 임시 이동 중에는 선택을 바꾸지 않는다
            const pick = !lead.acted ? lead : members.find((u) => !u.acted);
            if (!pick) { toast(q.status === 'done' ? '이번 라운드에 이미 행동한 부대입니다' : '이미 행동한 유닛입니다'); return; }
            if (s.selectedId === pick.id) return;
            if (s.selectedId) { if (squadKeyOf(pick, s.units, s.alt) !== s.alt?.activeSquad) { toast('현재 활성 부대의 행동을 먼저 끝내세요'); return; } clearSelection(); }
            trySelect(pick);
        },

        // follow: 행동 안 한 소속 일반병 자동 영웅 추종(서버가 기존 move 이벤트로 돌려준다. 이동만, 공격 없음). 방 대전은 방 옵션 follow_troops 가 켜진 방만 보낸다(꺼진 방이면 서버가 무시)
        endTurn({ force = false, follow = false } = {}) {
            if (s.status !== 'battle' || s.side !== 'ally') return;
            if (s.alternate) return force ? undefined : actions.endActivation(); // 교대 on: '턴 종료' 대신 부대 행동 종료(서버는 end_turn 을 invalid_action 으로 거부)
            if ((s.busy || s.timeLocked) && !force) return; // 시간 초과 잠금: 서버 자동 종료를 기다린다(수동 end_turn 중복 방지)
            const fol = !!follow && (s.mode !== 'room' || s.room?.followTroops === true);
            const go = async () => {
                clearSelection();
                change();
                await absorb(await act(fol ? { type: 'end_turn', follow: true } : { type: 'end_turn' }));
            };
            return force ? go().catch((e) => fail(e, () => actions.endTurn({ follow: fol }))) : run(go, () => actions.endTurn({ follow: fol }));
        },

        // 자동 추종 대상 미리보기(확인 모달 문구용): 행동 안 한 아군 일반병(kind troop) 중 소속 영웅(leader_id)이 살아 있는 유닛.
        // 이미 오라 반경 안이면 서버가 제자리에 둘 수 있다(정확한 이동 여부는 서버 판정)
        followCandidates() {
            return alive().filter((u) => u.team === 'ally' && !u.npc_ally && !u.acted && u.kind === 'troop' && u.leaderId != null && String(u.leaderId) !== String(u.id) && (get(u.leaderId)?.hp ?? 0) > 0);
        },


        abandon() {
            if (s.status !== 'battle' && s.status !== 'deploy') return;
            return run(async () => {
                if (s.mode === 'room') { // 나가기 = 진행 중이면 기권. 결과는 폴링 한 번으로 받는다
                    await battleApi.room.leave(s.roomCode);
                    clearTimeout(pollTimer);
                    let res = null;
                    try { res = await battleApi.room.poll(s.roomCode, s.lastSeq); } catch { /* 방이 닫혔을 수 있음 */ }
                    if (res?.events?.length) playEvents(res.events);
                    if (res?.battle) applyView(res.battle);
                    s.status = 'finished';
                    change();
                    ev({ type: 'sync' });
                    await loadResult(res?.result ?? { win: false, abandoned: true, stars: 0, gold: 0, heroes: [], user: null });
                    return;
                }
                const res = await battleApi.abandon(s.battleId);
                playEvents(res.events);
                applyView(res.battle);
                s.status = 'finished';
                change();
                ev({ type: 'sync' });
                await loadResult(res.result);
            });
        },

        // 다시 시도: 원래 동작을 재실행하고(있으면) 끝나면 서버 상태로 정합화(phase/선택/임시 이동 초기화)
        async retry() { const r = s.error?.retry; s.error = null; change(); try { await r?.(); } finally { if (s.status === 'battle' && !s.error) await actions.resync(); } },
    };
    return actions;
}
