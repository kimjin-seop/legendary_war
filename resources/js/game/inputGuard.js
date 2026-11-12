// 입력 멈춤 전역 안전장치(2026-11-04 사용자 '버튼이 안 눌러지고 멈춘다', 재현: 전투 결과창 상태에서 다른 창을 보고 오면 클릭 먹통).
// 1) 앱 복귀(visibilitychange visible · window focus · pageshow): 캔버스 화면 위치(scale bounds) 재계산 + 눌린 채 고착된 포인터 초기화 + 씬 입력 재활성
//    + game.events 'app-wake' 발행(전투 씬은 결과창이 사라졌으면 다시 띄움). 창 이동·모니터 변경·스크롤로 캔버스 위치가 바뀌면 클릭 좌표가 어긋나 버튼이 안 눌린다.
// 2) 모달 잠금 누수 감시(2초 간격): scene.modalCount(Modal·BattleDialogue 가 +1) > 실제 열린 모달 수(scene.__modals 등록부)가 4초 이상 이어지면 실제 수로 되돌린다
//    (모달이 close() 없이 사라지거나 생성 중 예외 -> 모든 버튼·맵 입력이 modalCount 검사로 막히던 경로). 되돌릴 때 콘솔 경고 + client-errors 리포트
// QA: window.__inputGuard() -> 활성 씬별 { key, modalCount, liveModals, inputEnabled, pointersDown } (개발 빌드·?debug=1 일 때만 노출)
import { reportClientError } from './api/clientErrors.js';

const liveModals = (sc) => [...(sc.__modals ?? [])].filter((o) => o && o.scene && !o.closed && o.active !== false && (o.level === undefined || o.level > 0)).length;

export function installInputGuard(game) {
    if (typeof window === 'undefined' || !game) return () => {};
    const wake = (why) => {
        try { game.scale?.updateBounds?.(); } catch (e) { console.warn('[inputGuard] scale 재계산 실패', e); }
        try {
            const mgr = game.input;
            if (mgr) mgr.enabled = true;
            (mgr?.pointers ?? []).forEach((p) => { if (p?.isDown) p.reset?.(); }); // 창을 벗어난 사이 pointerup 을 못 받아 눌린 상태로 고착된 포인터(드래그·버튼 pressed 고착)
        } catch (e) { console.warn('[inputGuard] 포인터 초기화 실패', e); }
        game.scene.getScenes(true).forEach((sc) => { if (sc.input && sc.input.enabled === false) sc.input.enabled = true; });
        game.events.emit('app-wake', why);
    };
    const onVis = () => { if (!document.hidden) wake('visible'); };
    const onFocus = () => wake('focus');
    const onShow = () => wake('pageshow');
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onFocus);
    window.addEventListener('pageshow', onShow);
    const strikes = new Map(); // scene key -> 연속 불일치 횟수
    const id = setInterval(() => {
        game.scene.getScenes(true).forEach((sc) => {
            const mc = Number(sc.modalCount) || 0; if (!mc) { strikes.delete(sc.scene.key); return; }
            const live = liveModals(sc);
            if (mc <= live) { strikes.delete(sc.scene.key); return; }
            const n = (strikes.get(sc.scene.key) ?? 0) + 1; strikes.set(sc.scene.key, n);
            if (n >= 2) { // 4초 이상 불일치: 잠금 누수로 보고 실제 열린 수로 되돌림
                console.warn(`[inputGuard] ${sc.scene.key} modalCount ${mc} > 열린 모달 ${live}: 입력 잠금 해제`);
                reportClientError(new Error(`modal lock leak ${sc.scene.key} ${mc}>${live}`), { level: 'warn', source: 'inputGuard' });
                sc.modalCount = live; strikes.delete(sc.scene.key);
            }
        });
    }, 2000);
    let qa = false;
    try { qa = (import.meta.env?.DEV || import.meta.env?.VITE_QA_HOOKS === '1') && new URLSearchParams(location.search).get('debug') === '1'; } catch { qa = false; }
    if (qa) window.__inputGuard = () => game.scene.getScenes(true).map((sc) => ({ key: sc.scene.key, modalCount: sc.modalCount ?? 0, liveModals: liveModals(sc), inputEnabled: sc.input?.enabled !== false, pointersDown: (game.input?.pointers ?? []).filter((p) => p.isDown).length }));
    return () => {
        clearInterval(id);
        document.removeEventListener('visibilitychange', onVis);
        window.removeEventListener('focus', onFocus);
        window.removeEventListener('pageshow', onShow);
        if (qa) delete window.__inputGuard;
    };
}
