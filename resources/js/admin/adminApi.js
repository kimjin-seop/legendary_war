// 관리자 화면 API(/api/admin/*, docs/ADMIN_API_SPEC.md). 게임 공통 클라이언트(game/api/client.js)의 api() 재사용:
// Sanctum 쿠키 세션만 사용(auth:'cookie' — 게스트 토큰을 붙이지 않음), 쓰기 요청은 CSRF 자동. 실패 = ApiError{status, code, message, fields}
// 비밀번호·토큰은 로그/콘솔/URL 에 남기지 않는다.
import { api } from '../game/api/client.js';

const A = (method, path, opts = {}) => api(method, `/api/admin${path}`, { ...opts, auth: 'cookie', retry: method === 'GET' ? 2 : 0 });

// 현재 로그인 사용자(쿠키 세션). 비로그인 = null. 게스트 토큰·게임 세션 상태는 건드리지 않는다
export async function adminMe() {
    try { const d = await api('GET', '/api/auth/me', { auth: 'cookie', retry: 1 }); return d?.user ?? null; } catch (e) { if (e.status === 401) return null; throw e; }
}
// 로그인(기존 회원 로그인 API 재사용). 게임의 로컬 게스트 토큰은 지우지 않는다(같은 브라우저 게스트 진행 보존)
export const adminLogin = (email, password) => api('POST', '/api/auth/login', { body: { email, password }, auth: 'cookie', retry: 0 }).then((d) => d?.user ?? null);
export const adminLogout = () => api('POST', '/api/auth/logout', { auth: 'cookie', retry: 0 }).catch(() => null);

export const adminApi = {
    // 게임 데이터 설정
    configList: (entity, query) => A('GET', `/config/${entity}`, { query }),
    configGet: (entity, id) => A('GET', `/config/${entity}/${id}`),
    configPatch: (entity, id, body) => A('PATCH', `/config/${entity}/${id}`, { body }),
    // 사용자
    users: (query) => A('GET', '/users', { query }),
    ban: (id, reason) => A('POST', `/users/${id}/ban`, { body: { reason } }),
    unban: (id, reason) => A('POST', `/users/${id}/unban`, { body: { reason } }),
    // 진행도 초기화: confirm = 대상 이름 정확 일치, reason 2~200자. 되돌릴 수 없음(운영은 사전 DB 백업 필수)
    resetProgress: (id, confirm, reason) => A('POST', `/users/${id}/reset-progress`, { body: { confirm, reason } }),
    // 전투 기록
    battles: (query) => A('GET', '/battles', { query }),
    battleActions: (id) => A('GET', `/battles/${id}/actions`),
    // 감사 로그
    audit: (query) => A('GET', '/audit-logs', { query }),
    // 채팅 운영
    reports: (query) => A('GET', '/chat/reports', { query }),
    handleReport: (id, action, note) => A('POST', `/chat/reports/${id}/handle`, { body: { action, ...(note ? { note } : {}) } }),
    deleteMessage: (id) => A('DELETE', `/chat/messages/${id}`),
    restrict: (userId, minutes, reason) => A('POST', `/chat/users/${userId}/restrict`, { body: { minutes, reason } }),
    unrestrict: (userId, reason) => A('POST', `/chat/users/${userId}/unrestrict`, { body: { reason } }),
    // 시즌 전쟁
    season: (seasonId) => A('GET', '/war/season', { query: seasonId ? { season_id: seasonId } : undefined }),
    createSeason: (scenarioCode, confirm) => A('POST', '/war/seasons', { body: { scenario_code: scenarioCode, confirm } }),
    endSeason: (id, confirm, reason) => A('POST', `/war/seasons/${id}/end`, { body: { confirm, reason } }),
    occupation: (territoryId, occupation, reason) => A('PATCH', `/war/territories/${territoryId}/occupation`, { body: { occupation, reason } }),
    // 대시보드 집계
    dashboard: () => A('GET', '/dashboard'),
    // 공지·점검
    announcements: (query) => A('GET', '/announcements', { query }),
    createAnnouncement: (body) => A('POST', '/announcements', { body }),
    updateAnnouncement: (id, body) => A('PATCH', `/announcements/${id}`, { body }),
    maintenance: () => A('GET', '/maintenance'),
    setMaintenance: (body) => A('PUT', '/maintenance', { body }),
    // 일일 교환소 상품
    exchangeProducts: () => A('GET', '/exchange/products'),
    createExchangeProduct: (body) => A('POST', '/exchange/products', { body }),
    updateExchangeProduct: (id, body) => A('PATCH', `/exchange/products/${id}`, { body }),
};

// 화면 표시용 오류 문구: 서버 {error:{code,message}} + 필드 오류. war_tick_busy 등 재시도 안내 포함
const HINT = {
    war_tick_busy: '시즌 틱 처리 중입니다. 잠시 후 다시 시도하세요.',
    version_conflict: '다른 변경과 충돌했습니다. 새로고침 후 다시 시도하세요.',
    confirm_required: '확인 문자열이 일치하지 않습니다.',
    forbidden: '관리자 권한이 필요합니다.',
};
export function errText(e) {
    if (!e) return '';
    const base = HINT[e.code] ?? (e.message || '요청을 처리하지 못했습니다.');
    const f = e.fields ? Object.values(e.fields).filter(Boolean).join(' / ') : '';
    return `${base}${f ? ` — ${f}` : ''}${e.code ? ` [${e.code}${e.status ? ` ${e.status}` : ''}]` : ''}`;
}

export const fmtTime = (s) => { if (!s) return '-'; const v = String(s); const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`); if (!Number.isFinite(t)) return v; const d = new Date(t); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`; };
export const short = (v, n = 80) => { const s = typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v); return s.length > n ? `${s.slice(0, n - 1)}…` : s; };
export const pretty = (v) => { if (v == null) return ''; if (typeof v === 'string') { try { return JSON.stringify(JSON.parse(v), null, 2); } catch { return v; } } return JSON.stringify(v, null, 2); };
