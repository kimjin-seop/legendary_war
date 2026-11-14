import { createEmitter } from '../emitter.js';
import { ERROR_MESSAGES, FIELD_MESSAGES } from './errors.js';

// 공통 API 클라이언트 + 인증 상태.
// - 게스트: X-Guest-Token 헤더(토큰은 POST /api/guests 응답에서만 평문 -> localStorage 'srpg.guest.v1', 실패 시 메모리)
// - 회원: Sanctum SPA 쿠키. 쓰기 요청 전 GET /sanctum/csrf-cookie 후 X-XSRF-TOKEN(쿠키값 URL 디코드)
// - 회원/쿠키 요청에는 X-Guest-Token 을 붙이지 않는다. 토큰·비밀번호는 로그/콘솔/URL 에 남기지 않는다.
// - 오류: ApiError{status, code, message, fields, retryAfter}. 401 -> session 'unauthenticated' 이벤트.
// - 503 db_busy / 네트워크 오류는 Retry-After(없으면 지수 백오프)로 재시도(기본 2회). 네트워크·시간 초과(기본 20초)·502/504 재시도는 멱등 요청만(api() 주석).
const GUEST_KEY = 'srpg.guest.v1';
const GUEST_USER_KEY = 'srpg.guest.user.v1'; // 게스트 표시명 복구용(토큰 아님)
let memGuest = null;

const storage = {
    get() { try { return localStorage.getItem(GUEST_KEY) ?? memGuest; } catch { return memGuest; } },
    set(t) { memGuest = t; try { localStorage.setItem(GUEST_KEY, t); } catch { /* 메모리만 */ } },
    clear() { memGuest = null; try { localStorage.removeItem(GUEST_KEY); localStorage.removeItem(GUEST_USER_KEY); } catch { /* 무시 */ } },
};

export class ApiError extends Error {
    constructor({ status = 0, code = null, message = '', fields = null, retryAfter = 0, details = null }) {
        super(message || code || `http_${status}`);
        this.status = status;
        this.code = code;
        this.fields = fields; // {field: '한국어 안내'}
        this.retryAfter = retryAfter;
        this.details = details; // 서버 부가 수치(예: cost_exceeded {used, max, hero_cost, troop_cost}). 없으면 null
    }
}

// 서버 error 객체의 부가 필드 추출: error.details / error.extra / error.{그 외 키} 를 하나로 합친다(code·message 제외)
function errorDetails(err) {
    if (!err || typeof err !== 'object') return null;
    const { code: _c, message: _m, details, extra, ...rest } = err;
    const out = { ...rest, ...(extra && typeof extra === 'object' ? extra : {}), ...(details && typeof details === 'object' ? details : {}) };
    return Object.keys(out).length ? out : null;
}

const events = createEmitter();
export const session = {
    kind: 'none', // none | guest | member
    user: null, // {id, name, email, role, is_guest}
    profile: null, // {level, exp, exp_to_next, max_cost, max_party_slots, gold}
    party: null, // [user_hero_id]
    heroes: null, // [{user_hero_id, hero, name, rarity, cost, level, ...}]
    lineup: null, // GET /api/lineup 캐시(편성, 2026-11-14)
    restored: false,
    on: events.on,
    get name() { return this.user?.name ?? ''; },
    get authed() { return this.kind !== 'none'; },
};
// auth.restore 중복 제거 상태(진행 중 Promise / 비로그인 확정 시각)
let restoreInflight = null;
let restoreNoneAt = 0;
// 세대 카운터: 로그인·가입·게스트 시작·로그아웃이 세션을 바꾸면 +1 -> 그 전에 시작된 restore 결과(예: 401 -> none)가 새 세션을 덮지 않게 버린다
let restoreGen = 0;
const bumpRestore = () => { restoreGen += 1; restoreInflight = null; restoreNoneAt = 0; };
const RESTORE_NONE_TTL = 5000;
function setSession(patch) { if (patch.kind && patch.kind !== 'none') restoreNoneAt = 0; Object.assign(session, patch); events.emit('change', session); }

function readCookie(name) {
    const m = document.cookie.split('; ').find((c) => c.startsWith(name + '='));
    return m ? decodeURIComponent(m.slice(name.length + 1)) : '';
}

// 요청 기본 타임아웃(2026-11-14 강화면 v10 Medium: 응답이 안 오면 로딩이 영구히 남음). api(..., {timeout}) 로 연장, 0 이면 끔
export const DEFAULT_TIMEOUT_MS = 20000;
const timeoutError = () => new ApiError({ status: 0, code: 'timeout', message: ERROR_MESSAGES.timeout });

// fetch + (선택) JSON 본문 읽기까지를 타임아웃으로 감싼다. 호출자 signal 취소는 AbortError 그대로, 시간 초과는 e.timedOut = true
async function timedFetch(url, init, { timeout = DEFAULT_TIMEOUT_MS, signal, json = false } = {}) {
    const ctl = new AbortController();
    let timedOut = false;
    const onAbort = () => ctl.abort();
    if (signal) { if (signal.aborted) ctl.abort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    const timer = timeout > 0 ? setTimeout(() => { timedOut = true; ctl.abort(); }, timeout) : null;
    try {
        const res = await fetch(url, { ...init, signal: ctl.signal });
        let data = null;
        if (json && res.status !== 204) { try { data = await res.json(); } catch (e) { if (e?.name === 'AbortError') throw e; data = null; } }
        return { res, data };
    } catch (e) {
        if (timedOut) e.timedOut = true;
        throw e;
    } finally {
        if (timer) clearTimeout(timer);
        if (signal) signal.removeEventListener('abort', onAbort);
    }
}

let csrfReady = false;
async function ensureCsrf() {
    if (csrfReady && readCookie('XSRF-TOKEN')) return;
    let r;
    try { ({ res: r } = await timedFetch('/sanctum/csrf-cookie', { credentials: 'same-origin', headers: { Accept: 'application/json' } })); } catch (e) {
        if (e?.timedOut) throw timeoutError();
        throw new ApiError({ status: 0, code: 'network', message: ERROR_MESSAGES.network });
    }
    if (!r.ok && r.status !== 204) throw new ApiError({ status: r.status, code: 'server', message: ERROR_MESSAGES.server });
    csrfReady = true;
}

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

function fieldErrors(errors) {
    if (!errors || typeof errors !== 'object') return null;
    const out = {};
    Object.keys(errors).forEach((k) => { out[k] = FIELD_MESSAGES[k] ?? '입력값을 확인해 주세요.'; });
    return out;
}

// api(method, path, {body, query, auth:'auto'|'guest'|'cookie'|'none', retry, signal, timeout, idempotent})
// - timeout(ms, 기본 20초, 0=끔): 시간 초과 -> ApiError code 'timeout'(status 0). 호출자 signal 취소 -> code 'aborted'
// - idempotent: 네트워크 오류·시간 초과·502/504 자동 재시도는 멱등 요청만(GET/HEAD 또는 body.request_id 가 있는 POST).
//   멱등하지 않은 쓰기(전투 행동·확정·포기 등)는 서버가 이미 처리했을 수 있어 재전송하지 않고 바로 오류를 던진다(중복 전송 방지)
export async function api(method, path, { body, query, auth = 'auto', retry = 2, signal, timeout = DEFAULT_TIMEOUT_MS, idempotent } = {}) {
    const canResend = idempotent ?? (method === 'GET' || method === 'HEAD' || (body != null && typeof body === 'object' && body.request_id != null));
    let url = path;
    if (query) {
        const q = Object.entries(query).filter(([, v]) => v !== undefined && v !== null).map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
        if (q) url += (url.includes('?') ? '&' : '?') + q;
    }
    const headers = { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' };
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const guestToken = storage.get();
    const useGuest = auth === 'guest' || (auth === 'auto' && session.kind !== 'member' && !!guestToken);
    if (useGuest && guestToken) headers['X-Guest-Token'] = guestToken;
    else if (auth !== 'none' && method !== 'GET') {
        await ensureCsrf();
        headers['X-XSRF-TOKEN'] = readCookie('XSRF-TOKEN');
    }
    for (let attempt = 0; ; attempt++) {
        let res;
        let data = null;
        try {
            ({ res, data } = await timedFetch(url, { method, headers, credentials: 'same-origin', body: body === undefined ? undefined : JSON.stringify(body) }, { timeout, signal, json: true }));
        } catch (e) {
            if (e?.timedOut) {
                // 시간 초과 재시도는 최대 1회(기본 20초 x 2 + 백오프 = 약 41초 안에 '다시 시도' 노출)
                if (canResend && attempt < Math.min(retry, 1) && !signal?.aborted) { await sleep(600 * 2 ** attempt); continue; }
                throw timeoutError();
            }
            if (e?.name === 'AbortError') throw new ApiError({ status: 0, code: 'aborted', message: '요청이 취소되었습니다.' });
            if (canResend && attempt < retry) { await sleep(600 * 2 ** attempt); continue; }
            throw new ApiError({ status: 0, code: 'network', message: ERROR_MESSAGES.network });
        }
        if (res.status === 204) return null;
        if (res.ok) return data;
        const retryAfter = Number(res.headers.get('Retry-After')) || 0;
        const code = data?.error?.code ?? (res.status === 422 && data?.errors ? 'validation' : res.status === 401 ? 'unauthenticated' : res.status === 429 ? 'too_many_attempts' : res.status === 503 ? 'db_busy' : res.status >= 500 ? 'server' : null);
        // 503(db_busy: 서버가 처리 전 거절)은 기존대로 재시도, 502/504(게이트웨이: 서버가 처리했을 수 있음)는 멱등 요청만
        if ((res.status === 503 || ((res.status === 502 || res.status === 504) && canResend)) && attempt < retry) {
            await sleep(retryAfter ? retryAfter * 1000 : 800 * 2 ** attempt);
            continue;
        }
        if (res.status === 419 && attempt < retry && !useGuest) { csrfReady = false; await ensureCsrf(); headers['X-XSRF-TOKEN'] = readCookie('XSRF-TOKEN'); continue; }
        const err = new ApiError({ status: res.status, code, message: data?.error?.message ?? data?.message ?? '', fields: fieldErrors(data?.errors), retryAfter, details: errorDetails(data?.error) });
        if (res.status === 401) {
            if (useGuest) storage.clear();
            if (session.kind !== 'none') { setSession({ kind: 'none', user: null, profile: null, party: null, heroes: null, lineup: null }); }
            events.emit('unauthenticated', err);
        }
        throw err;
    }
}

// FE A(battleApi.js) 합의 인터페이스: request(method, path, body?) -> JSON. 실패 시 ApiError{status, code, message, retryAfter} throw.
export const request = (method, path, body) => api(method, path, { body });

// ---------- 인증 ----------
export const auth = {
    hasGuestToken: () => !!storage.get(),

    async startGuest(nickname) {
        const data = await api('POST', '/api/guests', { body: { nickname }, auth: 'none', retry: 0 });
        if (!data?.guest_token) throw new ApiError({ status: 500, code: 'server', message: ERROR_MESSAGES.server });
        bumpRestore();
        storage.set(data.guest_token);
        // 게스트 표시명은 /api/profile 에 없어(이름을 주는 게스트용 API 부재) 로컬에 함께 보관해 복구 시 표시한다(토큰과 별개, 민감정보 아님)
        try { localStorage.setItem(GUEST_USER_KEY, JSON.stringify({ id: data.user?.id, name: data.user?.name ?? '', is_guest: true })); } catch { /* 무시 */ }
        setSession({ kind: 'guest', user: data.user, profile: null, party: null, heroes: null, lineup: null, restored: true });
        return data.user;
    },

    checkName: (name) => api('GET', '/api/auth/check-name', { query: { name }, auth: 'none', retry: 0 }),

    // 게스트 상태면 X-Guest-Token 을 함께 보내 승격. 성공 시 로컬 게스트 토큰 삭제 -> 쿠키 세션 전환.
    async register(fields) {
        const promote = session.kind === 'guest' && !!storage.get();
        if (!promote) await ensureCsrf();
        const data = await api('POST', '/api/auth/register', { body: fields, auth: promote ? 'guest' : 'cookie', retry: 0 });
        bumpRestore();
        storage.clear();
        csrfReady = false;
        await ensureCsrf().catch(() => {});
        // 가입 직후 세션 쿠키가 없을 수 있어 로그인으로 세션을 만든다(실패해도 가입은 성공)
        try { await api('POST', '/api/auth/login', { body: { email: fields.email, password: fields.password }, auth: 'cookie', retry: 0 }); } catch { /* 로그인 화면에서 재시도 */ }
        setSession({ kind: 'member', user: data.user, profile: null, party: null, heroes: null, lineup: null, restored: true });
        return data.user;
    },

    async login(email, password) {
        await ensureCsrf();
        const data = await api('POST', '/api/auth/login', { body: { email, password }, auth: 'cookie', retry: 0 });
        bumpRestore();
        storage.clear(); // 회원 세션으로 전환: 로컬 게스트 토큰 사용 중단
        setSession({ kind: 'member', user: data.user, profile: null, party: null, heroes: null, lineup: null, restored: true });
        return data.user;
    },

    async logout() {
        try {
            if (session.kind === 'member') await api('POST', '/api/auth/logout', { auth: 'cookie', retry: 0 });
        } catch { /* 서버 세션 정리 실패해도 로컬은 정리 */ }
        bumpRestore();
        storage.clear();
        csrfReady = false;
        setSession({ kind: 'none', user: null, profile: null, party: null, heroes: null, lineup: null });
    },

    // 새로고침 복구: 게스트 토큰 -> /api/profile, 없으면 쿠키 -> /api/auth/me. 둘 다 아니면 none.
    // 반환: {ok:true} | {ok:false, error} (서버 장애와 '비로그인' 구분)
    // 중복 제거(2026-11-08): 로드 중 레이아웃 변경으로 Title 씬이 여러 번 재시작되며 restore 를 반복 호출 -> 비로그인 방문자는 /api/auth/me 401 이 로드당 ~8회.
    // 진행 중 호출은 같은 Promise 를 공유하고, 직전 결과가 '비로그인 확정'(401)이면 RESTORE_NONE_TTL 동안 재사용. 로그인·가입·게스트 시작·로그아웃은 캐시를 지운다
    restore() {
        if (session.restored && session.kind !== 'none') return Promise.resolve({ ok: true });
        if (restoreInflight) return restoreInflight;
        if (restoreNoneAt && session.kind === 'none' && !storage.get() && Date.now() - restoreNoneAt < RESTORE_NONE_TTL) return Promise.resolve({ ok: true });
        restoreNoneAt = 0;
        const p = auth._restore(restoreGen).finally(() => { if (restoreInflight === p) restoreInflight = null; });
        restoreInflight = p;
        return p;
    },

    async _restore(gen = restoreGen) {
        const stale = () => gen !== restoreGen; // 진행 중에 세션이 바뀌었으면 결과를 반영하지 않는다
        if (storage.get()) {
            try {
                const d = await api('GET', '/api/profile', { auth: 'guest' });
                let saved = null;
                try { saved = JSON.parse(localStorage.getItem(GUEST_USER_KEY) || 'null'); } catch { saved = null; }
                if (stale()) return { ok: true };
                setSession({ kind: 'guest', profile: d.profile, restored: true, user: session.user ?? saved ?? { name: '', is_guest: true } });
                return { ok: true };
            } catch (e) {
                if (stale()) return { ok: true };
                if (e.status === 401) storage.clear();
                else if (e.status !== 403) return { ok: false, error: e };
            }
        }
        try {
            const d = await api('GET', '/api/auth/me', { auth: 'cookie' });
            if (stale()) return { ok: true };
            setSession({ kind: 'member', user: d.user, restored: true });
            return { ok: true };
        } catch (e) {
            if (stale()) return { ok: true };
            if (e.status === 401) { setSession({ kind: 'none', user: null, restored: true }); restoreNoneAt = Date.now(); return { ok: true }; }
            return { ok: false, error: e };
        }
    },
};

export const sessionCache = {
    setProfile(p) { setSession({ profile: p }); },
    setParty(ids) { setSession({ party: ids }); },
    setHeroes(h) { setSession({ heroes: h }); },
    clearGame() { setSession({ profile: null, party: null, heroes: null, lineup: null }); },
};
