import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { api } from './client.js';

// 웹소켓(Laravel Reverb) 푸시 구독. 서버 -> 클라 ping(seq/id)만 받고, 상세는 항상 기존 HTTP 로 재조회한다(권한·마스킹 불변).
// - 명령(행동·확정·채팅 전송 등)은 HTTP 그대로. 폴링 코드는 제거하지 않는다: 연결이 살아 있으면 호출 측이 폴링 간격을 늘리고(안전망),
//   끊기거나 구독 실패하면 즉시 기존 주기로 복귀한다. 재연결·구독 성공 직후에는 onLive 로 1회 즉시 재조회해 누락을 보정한다.
// - 채널 인증: POST /api/broadcasting/auth 를 공통 api() 로 호출 -> 회원(쿠키+CSRF)·게스트(X-Guest-Token) 모두 기존 방식 그대로.
// - 설정: Vite env VITE_REVERB_APP_KEY(없으면 기능 전체 비활성 = 폴링만), VITE_REVERB_HOST(미지정 = 같은 출처 /app 프록시. 지정 시에만 PORT·SCHEME 사용).
const ENV = import.meta.env ?? {};
const APP_KEY = ENV.VITE_REVERB_APP_KEY || '';

/** 폴링 안전망 간격(웹소켓 연결·구독 중일 때). 끊기면 호출 측이 기존 주기(1.5~4초)로 즉시 복귀 */
export const WS_SAFETY_POLL_MS = 20000;

let echo = null;
let broken = false; // 초기화 예외 시 이후 시도 생략(폴링만)
const chans = new Map(); // name -> { count }

function getEcho() {
    if (!APP_KEY || broken || typeof window === 'undefined') return null;
    if (echo) return echo;
    try {
        window.Pusher = Pusher;
        // 기본 = 같은 출처(현재 접속 호스트·포트·프로토콜): 앞단 프록시(docker/nginx-dev.conf)가 /app 을 reverb 로 전달한다.
        // VITE_REVERB_HOST 를 지정한 경우에만 별도 호스트·포트(VITE_REVERB_PORT/SCHEME)로 직접 접속한다(예: 127.0.0.1:8081).
        const own = !ENV.VITE_REVERB_HOST;
        const tls = own ? window.location.protocol === 'https:' : (ENV.VITE_REVERB_SCHEME || 'http') === 'https';
        const port = own ? (Number(window.location.port) || (tls ? 443 : 80)) : (Number(ENV.VITE_REVERB_PORT) || (tls ? 443 : 8080));
        echo = new Echo({
            broadcaster: 'reverb',
            key: APP_KEY,
            wsHost: own ? window.location.hostname : ENV.VITE_REVERB_HOST,
            wsPort: port,
            wssPort: port,
            forceTLS: tls,
            enabledTransports: ['ws', 'wss'],
            disableStats: true,
            authorizer: (channel) => ({
                authorize: (socketId, callback) => {
                    api('POST', '/api/broadcasting/auth', { body: { socket_id: socketId, channel_name: channel.name }, retry: 0 })
                        .then((data) => callback(null, data))
                        .catch((e) => callback(e, null));
                },
            }),
        });
    } catch { broken = true; echo = null; }
    return echo;
}

/**
 * private 채널 구독.
 * watchRealtime('room.ABCD1234', { events: { '.room.changed': (payload) => ... }, onLive: () => ..., onDown: () => ... })
 *  - onLive: 연결+구독 성공(재연결 포함) -> 호출 측: 즉시 1회 재조회 + 폴링 간격 확대
 *  - onDown: 연결 끊김/오류/구독 실패(인증 거부 포함) -> 호출 측: 즉시 기존 폴링 주기로 복귀
 * 반환: { live(): boolean, leave() }. 웹소켓 미설정/초기화 실패면 live() 는 항상 false 이고 콜백은 호출되지 않는다.
 */
export function watchRealtime(name, { events = {}, onLive, onDown } = {}) {
    const e = getEcho();
    if (!e) return { live: () => false, leave() {} };
    let live = false;
    let closed = false;
    const set = (v) => {
        if (closed || v === live) return;
        live = v;
        try { (v ? onLive : onDown)?.(); } catch { /* 호출 측 오류가 소켓 처리를 막지 않게 */ }
    };
    const ch = e.private(name);
    chans.set(name, { count: (chans.get(name)?.count ?? 0) + 1 });
    const handlers = Object.entries(events).map(([ev, fn]) => [ev, (payload) => { if (!closed) fn(payload); }]);
    handlers.forEach(([ev, h]) => ch.listen(ev, h));
    ch.subscribed(() => set(true)).error(() => set(false));
    const conn = e.connector?.pusher?.connection;
    const onState = ({ current }) => { if (current !== 'connected') set(false); };
    conn?.bind('state_change', onState);
    if (ch.subscription?.subscribed && conn?.state === 'connected') set(true); // 다른 소비자가 이미 구독 완료한 채널
    return {
        live: () => live,
        leave() {
            if (closed) return;
            closed = true;
            conn?.unbind('state_change', onState);
            handlers.forEach(([ev, h]) => ch.stopListening(ev, h));
            const c = (chans.get(name)?.count ?? 1) - 1;
            if (c <= 0) { chans.delete(name); e.leave(name); } else chans.set(name, { count: c });
        },
    };
}
