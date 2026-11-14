// PWA(홈 화면 앱) 설치 지원 (2026-11-14). app.js 에서 initPwa() 를 가장 먼저 호출해 beforeinstallprompt 를 놓치지 않게 한다.
// - Android/데스크톱 Chrome·Edge: beforeinstallprompt 를 저장했다가 버튼 클릭 시 prompt()
// - iOS: 프로그램 설치 불가 -> 공유 > '홈 화면에 추가' 안내(ui/InstallModal.js)
// - 서비스워커(public/sw.js)는 fetch 핸들러 없는 최소 등록(캐시 없음, 배포 후 구버전 잔류 방지)
// 설치 게이트(PWA_GATE): 모바일 브라우저에서 게임 시작 전 설치 안내를 강제로 띄움. 기본 꺼짐(켜기는 사용자 승인 후).
//  주의: 클라이언트 검사이므로 우회 가능(강제 불가, 안내 UX 수준). iOS 는 Safari 와 홈 화면 앱의 저장소가 분리돼
//  게스트 토큰(localStorage 'srpg.guest.v1')·로그인 쿠키가 설치 앱으로 넘어가지 않는다 -> 이전 수단 마련 전에는 켜지 말 것.
export const PWA_GATE = {
    enabled: false,              // 게이트 켜기(기본 꺼짐)
    allowBrowserContinue: true,  // '그래도 브라우저로 계속' 탈출구. false 여도 설치 경로가 없는 환경(인앱·프롬프트 미발생)은 항상 계속 가능
};

const BYPASS_KEY = 'srpg.pwa.gateBypass';
let deferred = null;
let justInstalled = false;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => { try { fn(); } catch { /* 무시 */ } });

export function onPwaChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function initPwa() {
    if (typeof window === 'undefined' || window.__pwaInit) return;
    window.__pwaInit = true;
    window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; notify(); });
    window.addEventListener('appinstalled', () => { deferred = null; justInstalled = true; notify(); });
    if ('serviceWorker' in navigator && window.isSecureContext) {
        const reg = () => navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => { /* 설치 버튼만 비활성(안내 문구로 대체) */ });
        if (document.readyState === 'complete') reg(); else window.addEventListener('load', reg, { once: true });
    }
}

export function isStandalone() {
    try {
        return window.matchMedia('(display-mode: standalone)').matches || window.matchMedia('(display-mode: fullscreen)').matches || window.navigator.standalone === true;
    } catch { return false; }
}

const ua = () => (typeof navigator !== 'undefined' ? navigator.userAgent || '' : '');
export function isIOS() {
    return /iPad|iPhone|iPod/.test(ua()) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS 13+ 는 Mac 으로 보고
}
export function isAndroid() { return /Android/i.test(ua()); }
export function isMobile() { return isIOS() || isAndroid(); }

// 인앱 브라우저(설치 불가): 카카오톡·네이버·인스타그램·페이스북·라인·다음·밴드·에브리타임, Android WebView(; wv)
export function inAppBrowser() {
    const u = ua();
    if (/KAKAOTALK/i.test(u)) return 'kakao';
    if (/NAVER\(inapp/i.test(u)) return 'naver';
    if (/Instagram/i.test(u)) return 'instagram';
    if (/FBAN|FBAV|FB_IAB/i.test(u)) return 'facebook';
    if (/\bLine\//i.test(u)) return 'line';
    if (/DaumApps|BAND\/|everytimeApp/i.test(u)) return 'other';
    if (isAndroid() && /; wv\)/.test(u)) return 'other';
    return null;
}

export function canPrompt() { return !!deferred; }
export function wasJustInstalled() { return justInstalled; }

// 설치 프롬프트 표시(사용자 클릭 핸들러 안에서 호출). 'accepted' | 'dismissed' | 'unavailable'
export async function promptInstall() {
    const e = deferred;
    if (!e) return 'unavailable';
    deferred = null; // 한 이벤트는 한 번만 prompt 가능
    try {
        await e.prompt();
        const r = await e.userChoice;
        notify();
        return r?.outcome === 'accepted' ? 'accepted' : 'dismissed';
    } catch { notify(); return 'unavailable'; }
}

// 외부 브라우저로 열기 URL(인앱 탈출). 없으면 null(링크 복사 안내)
export function externalOpenUrl() {
    const here = window.location.href;
    if (inAppBrowser() === 'kakao') return 'kakaotalk://web/openExternal?url=' + encodeURIComponent(here);
    if (isAndroid()) return `intent://${here.replace(/^https?:\/\//, '')}#Intent;scheme=${window.location.protocol.replace(':', '')};package=com.android.chrome;end`;
    return null;
}

export function shouldGate() {
    if (!PWA_GATE.enabled || !isMobile() || isStandalone()) return false;
    try { if (sessionStorage.getItem(BYPASS_KEY) === '1') return false; } catch { /* 무시 */ }
    return true;
}
export function bypassGate() { try { sessionStorage.setItem(BYPASS_KEY, '1'); } catch { /* 무시 */ } }
