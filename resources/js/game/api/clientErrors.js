// 클라이언트 에러 리포트(#17, 2026-11-04): window error / unhandledrejection(Phaser 씬 update·create 예외도 RAF 안에서 던져져 window error 로 잡힌다)을
// POST /api/client-errors {message, stack?, level, scene?, url?, app_version?, platform?} 로 보낸다(인증 불필요, 서버 스로틀 IP당 분당 20회).
// - 개인정보 제외: 이메일·토큰·localStorage·쿼리스트링·해시를 보내지 않는다(url 은 경로만, 스택 안 URL 의 ?쿼리 제거, 이메일 패턴 마스킹).
// - 같은 오류(메시지+위치)는 세션당 1회, 전체는 분당 5건 이하. 전송 실패는 무시(재시도 없음, 오류 리포트가 또 오류를 만들지 않게).
import { ASSET_VERSION } from '../assetVersion.js';

const MAX_PER_MIN = 5;
const seen = new Set();
let sent = [];
let installed = false;
let gameRef = null;

const clean = (s, n) => String(s ?? '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]') // 이메일 마스킹
    .replace(/(https?:\/\/[^\s?#)]+)[?#][^\s)]*/g, '$1') // URL 쿼리·해시 제거(토큰 등)
    .replace(/(token|password|secret)=[^\s&]+/gi, '$1=[x]')
    .slice(0, n);

function activeScene() {
    try { return (gameRef?.scene?.getScenes?.(true) ?? []).map((s) => s.scene.key).join(',').slice(0, 64) || null; } catch { return null; }
}

export function reportClientError(err, { level = 'error', source = '' } = {}) {
    if (level !== 'error' && level !== 'warn') level = level === 'warning' ? 'warn' : 'error'; // 서버 검증 level in:error,warn(그 외 값은 422)
    try {
        const message = clean(err?.message ?? err ?? 'unknown', 300);
        if (!message) return;
        const key = `${message}|${source}`;
        if (seen.has(key)) return;
        const now = Date.now();
        sent = sent.filter((t) => now - t < 60000);
        if (sent.length >= MAX_PER_MIN) return;
        seen.add(key); sent.push(now);
        const body = {
            message,
            stack: clean(err?.stack ?? source, 2000) || undefined,
            level,
            scene: activeScene() ?? undefined,
            url: (typeof location !== 'undefined' ? location.pathname : '').slice(0, 200) || undefined,
            app_version: String(ASSET_VERSION ?? '').slice(0, 32) || undefined, // 서버 max:32
            platform: (typeof navigator !== 'undefined' ? `${navigator.platform ?? ''} ${(navigator.userAgent ?? '').slice(0, 120)}` : '').trim().slice(0, 64) || undefined, // 서버 max:64(이전 160 -> 422 원인, gacha111)
        };
        // 공통 클라이언트(api) 대신 fetch 직접: 인증 헤더·재시도·401 이벤트 없이(오류 리포트가 세션 상태를 건드리지 않게). 페이지 종료 중에도 보내도록 keepalive
        fetch('/api/client-errors', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: JSON.stringify(body), keepalive: true, credentials: 'omit' }).catch(() => {});
    } catch { /* 무시 */ }
}

// 게임 생성 시 1회 설치(중복 설치 무시)
export function installClientErrorReporter(game) {
    gameRef = game ?? gameRef;
    if (installed || typeof window === 'undefined') return;
    installed = true;
    window.addEventListener('error', (e) => {
        if (!e?.error && !e?.message) return; // 리소스 로드 실패(img 등)는 제외 — Phaser 로더가 따로 처리
        reportClientError(e.error ?? e.message, { source: `${clean(e.filename, 200)}:${e.lineno ?? 0}:${e.colno ?? 0}` });
    });
    window.addEventListener('unhandledrejection', (e) => {
        const r = e?.reason;
        if (r?.name === 'ApiError' || (r && typeof r.status === 'number' && 'code' in r)) return; // API 오류(서버 응답)는 서버 로그에 있으므로 제외
        reportClientError(r instanceof Error ? r : String(r ?? 'unhandled rejection'), { level: 'error', source: 'unhandledrejection' });
    });
}
