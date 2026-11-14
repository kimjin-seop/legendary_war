import { createLoadingView } from './LoadingView.js';
import { loaded } from '../assets.js';

// 로더 진행 표시: 로딩 화면(LoadingView: 로고 + 얇은 진행 바 + 진행률 % + 용량 'x/yMB'). MB 는 manifest bytes 기준(없는 파일은 0으로 계산, 표시는 추정치).
// - 씬 preload() 에서 호출. 로더에 받을 파일이 없으면 아무것도 그리지 않는다(재시작·재진입 시 깜빡임 없음).
// - view 를 주면(Preload 처럼 직접 만든 로딩 화면) 그 화면만 갱신하고, 없으면 로딩 화면을 만들고 완료 시 지운다(title = 문구, 예: '전장 준비' -> '전장 준비 중…').
export function fmtDetail(doneBytes, totalBytes) {
    return totalBytes > 0 ? `${(Math.min(doneBytes, totalBytes) / 1e6).toFixed(1)} / ${(totalBytes / 1e6).toFixed(1)}MB` : '';
}

export function trackLoadProgress(scene, { view = null, title = '' } = {}) {
    const Ld = scene.load;
    const counted = new Set();
    let total = 0;
    let done = 0;
    const bytesOf = (key) => loaded.bytes.get(key) ?? 0;
    // 이미 큐에 들어간 파일 + 이후 동적으로 추가되는 파일
    // 크기는 키별로 기억했다가 늦게 알려지면 보정한다(강화면 2026-11-07 '4.0/1.7MB'): assets.js 는 scene.load.*() 다음 줄에서 loaded.bytes 를 채우는데
    //  Phaser 'addfile' 은 load.*() 안에서 동기로 발생하므로 처음 받는 키는 추가 시점 크기가 0 -> 총량에서 빠지고 완료 때만 더해져 받은 양이 총량을 넘었다.
    const sizes = new Map();
    const add = (key) => { if (key == null || sizes.has(key)) return; const b = bytesOf(key); sizes.set(key, b); total += b; };
    const resync = () => { sizes.forEach((b, key) => { const now = bytesOf(key); if (now > b) { total += now - b; sizes.set(key, now); } }); };
    try { Ld.list?.forEach?.((f) => add(f.key)); Ld.inflight?.forEach?.((f) => add(f.key)); } catch { /* 무시 */ }
    let own = null;
    const ensureUi = () => {
        if (view || own) return;
        own = createLoadingView(scene, { tagline: title ? `${title} 중…` : '' });
    };
    const onAdd = (key) => add(key);
    const onFile = (key) => { if (key == null || counted.has(key)) return; counted.add(key); add(key); resync(); done += sizes.get(key) ?? 0; }; // 추적 전에 큐에 들어간 파일도 총량에 포함
    const onProg = (p) => { resync(); ensureUi(); (view ?? own)?.set(p, fmtDetail(done, total)); };
    const cleanup = () => {
        Ld.off('addfile', onAdd); Ld.off('filecomplete', onFile); Ld.off('progress', onProg);
        if (own) { own.destroy(); own = null; }
    };
    Ld.on('addfile', onAdd);
    Ld.on('filecomplete', onFile);
    Ld.on('progress', onProg);
    Ld.once('complete', cleanup);
    scene.events.once('shutdown', cleanup);
    if ((Ld.list?.size ?? 0) > 0 && !view) ensureUi();
    return cleanup;
}
