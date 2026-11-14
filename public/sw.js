// 레전드리 워 서비스워커(최소). 설치 가능 요건 충족용으로만 등록한다(resources/js/pwa.js).
// fetch 핸들러를 두지 않는다 = 모든 요청은 브라우저 기본 네트워크/HTTP 캐시 그대로(index·API·빌드 모두 SW 가 가로채지 않음).
//  -> 배포 후 구버전 index/청크가 SW 캐시에 남는 문제가 원천적으로 없다.
// 이 파일을 바꾸면 브라우저가 새 SW 로 인식한다(웹서버는 /sw.js 를 Cache-Control: no-cache 로 서빙, docs/deploy_setup.md 3.6).
// 이후 정적 캐시를 도입하면 CACHE_PREFIX + 버전 키를 올리고, activate 에서 이전 버전 캐시가 지워진다.
const CACHE_PREFIX = 'lw-';
const VERSION = 'lw-v1';

self.addEventListener('install', () => { self.skipWaiting(); });

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== VERSION).map((k) => caches.delete(k)));
        await self.clients.claim();
    })());
});
