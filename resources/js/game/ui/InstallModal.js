import { Modal } from './Modal.js';
import { makeText } from './common.js';
import { showToast } from './Toast.js';
import { CSS } from '../theme.js';
import { L } from '../layout.js';
import { PWA_GATE, isStandalone, isIOS, isAndroid, inAppBrowser, canPrompt, promptInstall, wasJustInstalled, externalOpenUrl, onPwaChange, bypassGate } from '../../pwa.js';

// '앱으로 설치(홈 화면에 추가)' 안내 모달(2026-11-14). 진입: Title 메뉴 '앱으로 설치', 로비 설정 탭.
//  상태별: 이미 앱 실행 / 방금 설치 / 인앱 브라우저(외부 브라우저 열기) / 설치 프롬프트 가능(Android·데스크톱 Chrome/Edge) / iOS(공유 > 홈 화면에 추가 단계) / 그 외 안내
//  gate=true: 설치 게이트(pwa.js PWA_GATE, 기본 꺼짐). Esc 로 닫히지 않고, 허용된 경우에만 '브라우저로 계속' -> onContinue
export function installState() {
    if (isStandalone()) return 'standalone';
    if (wasJustInstalled()) return 'installed';
    if (inAppBrowser()) return 'inapp';
    if (canPrompt()) return 'prompt';
    if (isIOS()) return 'ios';
    if (isAndroid()) return 'android';
    return 'desktop';
}

// 설치 버튼 문구(메뉴용). 앱 실행 중이면 null(버튼 숨김)
export function installButtonLabel() { return isStandalone() ? null : '앱으로 설치 (홈 화면에 추가)'; }

export function openInstallGuide(scene, { gate = false, onContinue } = {}) {
    const st = installState();
    if (st === 'standalone' && !gate) return new Modal(scene, { title: '앱으로 설치', body: '이미 앱으로 실행 중입니다.', w: 480, h: 240 });
    let unsub = null;
    const canContinue = gate && (PWA_GATE.allowBrowserContinue || st === 'inapp' || st === 'android' || st === 'desktop' || st === 'installed');
    const contBtn = canContinue ? [{ label: '브라우저로 계속', onClick: () => { bypassGate(); onContinue?.(); } }] : [];
    const closeBtn = gate ? contBtn : [{ label: '닫기' }];
    let title = '앱으로 설치'; let body = ''; let buttons = closeBtn; let h = 300; let steps = null;
    if (st === 'installed') {
        body = '설치되었습니다. 홈 화면(또는 앱 목록)의 레전드리 워 아이콘으로 실행해 주세요.';
    } else if (st === 'inapp') {
        title = '외부 브라우저에서 열기';
        body = '카카오톡 등 앱 안의 브라우저에서는 홈 화면 설치가 되지 않습니다.\niPhone은 Safari, Android는 Chrome으로 열어 주세요.';
        const url = externalOpenUrl();
        buttons = [url
            ? { label: '외부 브라우저로 열기', variant: 'primary', keepOpen: true, onClick: () => { window.location.href = url; } }
            : { label: '링크 복사', variant: 'primary', keepOpen: true, onClick: () => copyLink(scene) }, ...closeBtn];
        h = 320;
    } else if (st === 'prompt') {
        body = '홈 화면(또는 앱 목록)에 레전드리 워 아이콘이 추가되고, 주소창 없이 전체 화면으로 실행됩니다.';
        buttons = [{ label: '설치', variant: 'primary', keepOpen: true, onClick: async () => {
            const r = await promptInstall();
            if (r === 'dismissed') showToast(scene, '설치를 취소했습니다.');
        } }, ...closeBtn];
    } else if (st === 'ios') {
        title = '홈 화면에 추가 (iPhone·iPad)';
        steps = [
            ['share', 'Safari 하단(iPad는 주소창 옆)의 공유 버튼을 누릅니다.'],
            ['plus', "목록을 올려 '홈 화면에 추가'를 누릅니다."],
            ['add', "오른쪽 위 '추가'를 누른 뒤 홈 화면의 아이콘으로 실행합니다."],
        ];
        if (gate && !canContinue) buttons = [{ label: '추가했어요', variant: 'primary', keepOpen: true, onClick: () => showToast(scene, '홈 화면의 레전드리 워 아이콘으로 실행해 주세요.', { ms: 2200 }) }];
        h = L.short ? 330 : 380;
    } else if (st === 'android') {
        body = "Chrome 메뉴(오른쪽 위 점 3개) > '홈 화면에 추가' 또는 '앱 설치'를 눌러 주세요.\n이미 설치했다면 홈 화면의 아이콘으로 실행해 주세요.";
        h = 320;
    } else {
        body = "Chrome 또는 Edge 주소창 오른쪽의 설치 아이콘(또는 메뉴 > '앱 설치')으로 설치할 수 있습니다.\n이 브라우저는 앱 설치를 지원하지 않을 수 있습니다.";
        h = 320;
    }
    if (gate && !buttons.length) buttons = [{ label: '설치 안내', keepOpen: true, onClick: () => {} }]; // 버튼 없는 게이트 방지(이론상 도달 안 함)
    const m = new Modal(scene, {
        title, body, w: 540, h, buttons, escClose: !gate,
        onClose: () => unsub?.(), // 게이트에서 계속 불가 상태는 모든 버튼이 keepOpen + Esc 무시라 닫히지 않는다
    });
    if (steps) drawSteps(scene, m, steps);
    // 상태 변화(beforeinstallprompt 늦게 도착·설치 완료) 시 같은 옵션으로 다시 연다
    unsub = onPwaChange(() => {
        if (m.closed || installState() === st) return;
        m.close();
        openInstallGuide(scene, { gate, onContinue });
    });
    m.once('destroy', () => unsub?.()); // 씬 종료로 파괴돼도 구독 해제
    return m;
}

function copyLink(scene) {
    const url = window.location.origin + '/battle';
    const ok = () => showToast(scene, '링크를 복사했습니다. Safari/Chrome에 붙여 넣어 열어 주세요.', { ms: 2400 });
    try { navigator.clipboard.writeText(url).then(ok, () => showToast(scene, url, { ms: 4000 })); } catch { showToast(scene, url, { ms: 4000 }); }
}

// iOS 단계 안내: 왼쪽 코드 도형(공유·더하기·추가) + 문구. 새 이미지 없음
function drawSteps(scene, m, steps) {
    const w = Math.min(540, L.lw - 24) - 48;
    const step = L.short ? 52 : 64;
    steps.forEach(([kind, text], i) => {
        const y = 8 + i * step;
        const cx = 24 + 22; const cy = y + 20;
        const g = scene.add.graphics();
        g.fillStyle(0x172750, 1).fillRoundedRect(cx - 22, cy - 22, 44, 44, 8);
        g.lineStyle(2, 0xf0d58c, 1);
        if (kind === 'share') {
            g.strokePoints([{ x: cx - 5, y: cy - 6 }, { x: cx - 10, y: cy - 6 }, { x: cx - 10, y: cy + 12 }, { x: cx + 10, y: cy + 12 }, { x: cx + 10, y: cy - 6 }, { x: cx + 5, y: cy - 6 }]);
            g.lineBetween(cx, cy - 15, cx, cy + 4);
            g.lineBetween(cx, cy - 15, cx - 5, cy - 10).lineBetween(cx, cy - 15, cx + 5, cy - 10);
        } else if (kind === 'plus') {
            g.strokeRoundedRect(cx - 12, cy - 12, 24, 24, 5);
            g.lineBetween(cx, cy - 7, cx, cy + 7).lineBetween(cx - 7, cy, cx + 7, cy);
        }
        m.inner.add(g);
        if (kind === 'add') m.inner.add(makeText(scene, cx, cy, '추가', { size: 15, bold: true, color: '#5ab0ff', origin: [0.5, 0.5] }));
        m.inner.add(makeText(scene, cx + 34, cy, `${i + 1}. ${text}`, { size: L.short ? 15 : 16, color: CSS.text, origin: [0, 0.5], wrap: w - 80 }));
    });
}
