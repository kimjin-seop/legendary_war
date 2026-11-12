import { gameApi } from '../api/gameApi.js';

// 멀티 진입 판정(fe46, 사용자 지시 "시즌전쟁이 진행 중이면 멀티를 누르면 시즌전쟁이 먼저"):
//  GET /api/war/active {active} 우선(가벼운 분기용). 구 서버(엔드포인트 없음)면 GET /api/war/state 로 판정
//  (season.status === 'active' && !season.ended, 404 season_not_found = 없음).
//  오류·시간 초과 = 진행 중 아님(기존 멀티 첫 화면 '방 대전'). 결과는 짧게 캐시(연속 탭 시 재조회 방지). War 씬이 state 를 받으면 noteWarState 로 갱신.
const TTL_MS = 60000;
const TIMEOUT_MS = 2500;
let cache = { at: 0, active: null };
let pending = null;

export const isActiveSeason = (st) => !!st?.season && st.season.status === 'active' && !st.season.ended;

export function noteWarState(st) { cache = { at: Date.now(), active: isActiveSeason(st) }; }
export function noteNoSeason() { cache = { at: Date.now(), active: false }; }

const viaState = () => gameApi.war.state().then((st) => { noteWarState(st); return cache.active; }).catch((e) => {
    if (e?.code === 'season_not_found') noteNoSeason();
    return false;
});

// 전황 읽음 처리(AC1): 시즌별 마지막으로 본 이벤트 id(localStorage, 실패 무시). 로비 진입점 뱃지도 같은 함수를 쓰도록 여기 둔다
const FEED_SEEN_KEY = 'war.feedSeen';
const seenMap = () => { try { const m = JSON.parse(localStorage.getItem(FEED_SEEN_KEY)); return m && typeof m === 'object' ? m : {}; } catch { return {}; } };
// -> number | null(이 시즌에 기록 없음)
export function feedSeenGet(seasonId) { const v = Number(seenMap()[String(seasonId)]); return Number.isFinite(v) ? v : null; }
export function feedSeenSet(seasonId, id) {
    if (seasonId == null || !Number.isFinite(Number(id))) return;
    try { const m = seenMap(); m[String(seasonId)] = Math.max(Number(id), Number(m[String(seasonId)]) || 0); localStorage.setItem(FEED_SEEN_KEY, JSON.stringify(m)); } catch { /* 저장 실패 무시 */ }
}
// 내 국가 관련 알림 이벤트: 점령·수도 함락·수도 포위 중 우리가 일으켰거나(country) 우리가 잃었거나(payload.from) 우리 수도가 포위된 것(ownerOf(territory))
const ALERT_TYPES = ['capture', 'capital_fall', 'capital_siege'];
export function isMyCountryAlert(e, my, ownerOf = () => null) {
    if (!my || !e || !ALERT_TYPES.includes(e.type)) return false;
    if (e.country === my || e.payload?.from === my) return true;
    return e.type === 'capital_siege' && ownerOf(e.territory) === my;
}

// 로비 멀티(시즌 전쟁) 진입점 읽지 않음 수: GET /api/war/active(season_id·joined) -> GET /api/war/unread?after_id=feedSeen.
//  이 시즌 기록이 없으면 War.js 와 같게 현재 last_id 를 기준점으로 저장하고 0(처음 보는 시즌의 과거 이벤트는 읽지 않음으로 치지 않음).
//  -> Promise<number>. 실패·시즌 없음·미가입 = 0(reject 하지 않음)
export async function warUnreadCount() {
    try {
        const a = await gameApi.war.active();
        if (typeof a?.active === 'boolean') cache = { at: Date.now(), active: a.active };
        if (!a?.active || a.season_id == null || a.joined === false) return 0;
        const seen = feedSeenGet(a.season_id);
        const r = await gameApi.war.unread(seen ?? 0);
        if (seen == null) { if (Number(r?.last_id) > 0) feedSeenSet(a.season_id, r.last_id); return 0; }
        return Math.max(0, Number(r?.count) || 0);
    } catch { return 0; }
}

// -> Promise<boolean>. 실패해도 reject 하지 않는다(false)
export function warSeasonActive({ fresh = false } = {}) {
    if (!fresh && cache.active != null && Date.now() - cache.at < TTL_MS) return Promise.resolve(cache.active);
    if (pending) return pending;
    const req = gameApi.war.active().then((r) => {
        if (typeof r?.active !== 'boolean') return viaState();
        cache = { at: Date.now(), active: r.active };
        return r.active;
    }).catch((e) => (e?.status === 404 || e?.status === 405 ? viaState() : false));
    const timeout = new Promise((res) => setTimeout(() => res(false), TIMEOUT_MS));
    pending = Promise.race([req, timeout]).finally(() => { pending = null; });
    return pending;
}
