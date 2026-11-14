import { L } from './layout.js';
import { settings } from './settings.js';

// 성능 측정 오버레이(2026-11-14 모바일 성능): 주소에 ?perf=1 이 있을 때만 동작. 없으면 리스너·DOM 을 만들지 않는다(비용 0).
// game.events 'postrender' 마다 프레임 간격(ms)을 최근 120개 링버퍼에 기록하고 500ms 마다 DOM 한 줄로 표시.
// 콘솔 window.__perf() = 같은 값 JSON(객체) 반환.
const N = 120;
const SLOW_MS = 50;
const QUALITY = ['높음', '보통', '낮음'];

function countObjects(list) {
    let n = 0;
    for (const o of list ?? []) { n += 1; if (o?.list && Array.isArray(o.list)) n += countObjects(o.list); }
    return n;
}

function pct(sorted, p) { return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] : 0; }

export function mountPerfOverlay(game) {
    let on = false;
    try { on = new URLSearchParams(window.location.search).get('perf') === '1'; } catch { on = false; }
    if (!on) return () => {};

    const buf = new Float32Array(N);
    let len = 0; let idx = 0; let last = 0; let slowTotal = 0;
    const onPost = () => {
        const now = performance.now();
        if (last) {
            const d = now - last;
            buf[idx] = d; idx = (idx + 1) % N; if (len < N) len += 1;
            if (d > SLOW_MS) slowTotal += 1;
        }
        last = now;
    };
    game.events.on('postrender', onPost);

    const snapshot = () => {
        const arr = Array.from(buf.subarray(0, len)).sort((a, b) => a - b);
        const slowRecent = arr.filter((d) => d > SLOW_MS).length;
        const scenes = game.scene.getScenes(true).map((s) => ({ key: s.scene.key, top: s.sys.displayList?.length ?? 0, all: countObjects(s.sys.displayList?.list) }));
        const q = settings.get().quality;
        return {
            actualFps: +(game.loop?.actualFps ?? 0).toFixed(1),
            frames: len,
            p50: +pct(arr, 0.5).toFixed(1),
            p95: +pct(arr, 0.95).toFixed(1),
            max: +(arr[arr.length - 1] ?? 0).toFixed(1),
            slowRecent,
            slowTotal,
            R: +(+L.R).toFixed(3),
            backing: { w: L.bw, h: L.bh, px: L.bw * L.bh },
            quality: q, qualityLabel: QUALITY[q] ?? String(q), userQuality: settings.userQuality?.(),
            renderer: game.renderer?.type === 2 ? 'webgl' : 'canvas',
            scenes,
        };
    };
    window.__perf = snapshot;

    const el = document.createElement('div');
    el.setAttribute('data-perf-overlay', '1');
    Object.assign(el.style, {
        position: 'fixed', left: '4px', top: '4px', zIndex: '99999', pointerEvents: 'none',
        font: '11px/1.35 monospace', color: '#e8f0d0', background: 'rgba(0,0,0,0.62)', padding: '3px 6px',
        whiteSpace: 'pre', borderRadius: '3px',
    });
    document.body.appendChild(el);
    const timer = setInterval(() => {
        const s = snapshot();
        el.textContent = `fps ${s.actualFps}  dt p50 ${s.p50} p95 ${s.p95} max ${s.max}  >${SLOW_MS}ms ${s.slowRecent}/${s.frames} (누적 ${s.slowTotal})\n`
            + `R ${s.R}  백킹 ${s.backing.w}x${s.backing.h} (${(s.backing.px / 1e6).toFixed(2)}M px)  품질 ${s.qualityLabel}  ${s.renderer}\n`
            + s.scenes.map((x) => `${x.key} 객체 ${x.top}/${x.all}`).join('  ');
    }, 500);

    return () => {
        clearInterval(timer);
        game.events.off('postrender', onPost);
        el.remove();
        if (window.__perf === snapshot) delete window.__perf;
    };
}
