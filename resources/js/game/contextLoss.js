// WebGL 컨텍스트 손실 처리(2026-11-14 성능 1단계).
// 모바일(백그라운드 전환·메모리 부족)·PC(GPU 드라이버 재설정)에서 컨텍스트가 사라지면 Phaser 는 그리기를 멈추고 'losewebgl' 을 낸다.
// 브라우저가 컨텍스트를 돌려주면 'restorewebgl'(Phaser 4 가 텍스처·셰이더 등 GL 자원을 다시 만든다).
//  - 손실 즉시: 화면 위 DOM 안내('그래픽을 복구하는 중')
//  - 복구되면: 안내 제거 + 레이아웃 재적용 이벤트
//  - RESTORE_WAIT_MS 안에 복구되지 않으면: '복구하지 못했습니다' + RELOAD_SEC 초 카운트다운 후 새로고침(지금 새로고침·취소 버튼)
// 시험: 콘솔 game.renderer.gl.getExtension('WEBGL_lose_context').loseContext() / restoreContext()  (QA 훅 window.__ctxLossTest(ms) 도 있음)
// Canvas 렌더러(WebGL 아님)면 아무것도 하지 않는다.
import { L } from './layout.js';

const RESTORE_WAIT_MS = 6000;
const RELOAD_SEC = 10;

function box(parent) {
    const el = document.createElement('div');
    el.setAttribute('role', 'alert');
    el.style.cssText = 'position:absolute;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;'
        + 'background:rgba(8,12,24,0.82);color:#f3e6c4;font:600 16px/1.5 system-ui,sans-serif;text-align:center;padding:24px;';
    const host = parent && getComputedStyle(parent).position === 'static' ? (parent.style.position = 'relative', parent) : parent;
    (host ?? document.body).appendChild(el);
    return el;
}

export function watchContextLoss(game) {
    let el = null; let waitT = 0; let tickT = 0; let attached = null;
    const clear = () => { clearTimeout(waitT); clearInterval(tickT); waitT = 0; tickT = 0; el?.remove(); el = null; };
    const show = (html) => { if (!el) el = box(game.canvas?.parentElement ?? null); el.innerHTML = html; return el; };
    const fail = () => {
        let left = RELOAD_SEC;
        const render = () => {
            const e = show(`<div><div>그래픽 장치를 복구하지 못했습니다.</div><div style="opacity:.8;font-weight:400">${left}초 뒤 새로고침합니다. 진행 중인 전투는 서버에 저장되어 있습니다.</div>`
                + '<div style="margin-top:14px;display:flex;gap:10px;justify-content:center">'
                + '<button data-a="now" style="min-height:44px;padding:0 18px;font:inherit;border-radius:8px;border:1px solid #c9a24a;background:#2a2112;color:#f3e6c4">지금 새로고침</button>'
                + '<button data-a="cancel" style="min-height:44px;padding:0 18px;font:inherit;border-radius:8px;border:1px solid #556;background:#141a2a;color:#cbd">취소</button></div></div>');
            e.querySelector('[data-a=now]')?.addEventListener('click', () => location.reload());
            e.querySelector('[data-a=cancel]')?.addEventListener('click', () => { clearInterval(tickT); tickT = 0; show('<div>그래픽 장치를 복구하지 못했습니다.<br><span style="opacity:.8;font-weight:400">화면이 계속 멈춰 있으면 페이지를 새로고침해 주세요.</span></div>'); });
        };
        render();
        tickT = setInterval(() => { left -= 1; if (left <= 0) { clearInterval(tickT); location.reload(); return; } render(); }, 1000);
    };
    const onLose = () => {
        console.warn('[gl] WebGL 컨텍스트 손실 — 복구 대기');
        clear();
        show('<div>그래픽을 복구하는 중입니다…</div>');
        waitT = setTimeout(fail, RESTORE_WAIT_MS);
    };
    const onRestore = () => {
        console.warn('[gl] WebGL 컨텍스트 복구');
        clear();
        try { game.events.emit('layout', L); } catch { /* 레이아웃 재구성 실패는 무시(다음 resize 에서 재적용) */ }
    };
    const attach = () => {
        const r = game.renderer;
        if (!r || !r.gl || attached) return;
        attached = r;
        r.on('losewebgl', onLose);
        r.on('restorewebgl', onRestore);
    };
    attach();
    game.events.once('ready', attach);
    if (typeof window !== 'undefined') {
        // QA 훅: ms 동안 컨텍스트를 잃었다가 되돌린다(ms<0 이면 되돌리지 않아 실패 안내 경로 확인)
        window.__ctxLossTest = (ms = 1500) => {
            const ext = game.renderer?.gl?.getExtension('WEBGL_lose_context');
            if (!ext) return 'WEBGL_lose_context 없음';
            ext.loseContext();
            if (ms >= 0) setTimeout(() => ext.restoreContext(), ms);
            return 'ok';
        };
    }
    return () => {
        clear();
        attached?.off('losewebgl', onLose);
        attached?.off('restorewebgl', onRestore);
        if (typeof window !== 'undefined') delete window.__ctxLossTest;
    };
}
