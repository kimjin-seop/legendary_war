import { COLOR, CSS } from '../theme.js';
import { L } from '../layout.js';
import { makeText } from './common.js';
import { tween } from './motion.js';
import { slice, skinOn } from './skin.js';

let current = null;

// 하단 중앙 토스트. 동시에 하나만 표시.
export function showToast(scene, message, { ms = 1100 } = {}) { // ms: 표시 유지 시간(기본 1.1초, 여러 줄 안내는 길게)
    current?.destroy();
    const t = makeText(scene, 0, 0, message, { size: 18, color: CSS.text, origin: [0.5, 0.5], align: 'center' });
    const w = t.width + 48;
    const h = t.height + 20;
    const c = scene.add.container(L.lw / 2, L.lh - 60 - L.safe.b).setDepth(2000);
    // 이미지 스킨(toast.pill, 높이 맞춤 3h) 있으면 사용, 없으면 기존 사각형
    const pill = skinOn(scene) ? slice(scene, 'toast', w + 16, Math.max(h, 40), 'btn') : null;
    if (pill?.skinAtlas) { pill.setPosition(-(w + 16) / 2, -Math.max(h, 40) / 2); c.add([pill, t]); } else { pill?.destroy(); c.add([scene.add.rectangle(0, 0, w, h, COLOR.ink, 0.92).setStrokeStyle(2, COLOR.accent, 0.9), t]); }
    current = c;
    scene.time.delayedCall(ms, () => { // 표시 유지 시간은 연출이 아니므로 연출 끄기·배속과 무관(예전 wait() 는 연출 끄기면 즉시 사라졌음). 페이드만 연출 설정을 따른다
        if (!c.scene) return;
        tween(scene, { targets: c, to: { alpha: 0 }, duration: 250, onComplete: () => { c.destroy(); if (current === c) current = null; } });
    });
}

// 상단 중앙 알림(전투용): 작은 반투명 한 줄 칩. 동시에 최대 2개, 넘치면 큐에서 대기. 입력을 소비하지 않는다.
// o.y: 첫 칩 상단 y(설계 단위) 또는 그 값을 돌려주는 함수, o.tone: 'info' | 'warn' | 'good', o.maxW: 최대 폭
const NOTICE_MAX = 2;
const NOTICE_MS = 2200;
const queues = new WeakMap(); // scene -> { shown: [], wait: [] }

export function showNotice(scene, message, o = {}) {
    if (!scene?.sys?.isActive?.()) return;
    let q = queues.get(scene);
    if (!q) {
        q = { shown: [], wait: [] };
        queues.set(scene, q);
        scene.events.once('shutdown', () => queues.delete(scene));
    }
    if (q.wait.length >= 6) q.wait.shift(); // 몰리면 오래된 대기분 버림(정보는 전체 로그에 남아 있음)
    q.wait.push({ message, o });
    pumpNotice(scene, q);
}

function pumpNotice(scene, q) {
    while (q.shown.length < NOTICE_MAX && q.wait.length) {
        const { message, o } = q.wait.shift();
        const maxW = Math.min(o.maxW ?? 520, L.lw - 24);
        const border = o.tone === 'warn' ? COLOR.danger : o.tone === 'good' ? COLOR.ally : COLOR.accent;
        const t = makeText(scene, 0, 0, message, { size: 14, color: CSS.text, origin: [0.5, 0.5], wrap: maxW - 24 });
        const w = Math.min(maxW, t.width + 24);
        const h = t.height + 10;
        const c = scene.add.container(L.lw / 2, 0).setDepth(2000);
        c.add([scene.add.rectangle(0, 0, w, h, COLOR.ink, 0.72).setStrokeStyle(1, border, 0.85), t]);
        c.noticeH = h;
        if (scene.cutsceneOn) c.setVisible(false); // 교전 컷신 재생 중이면 숨겼다가 끝나면 다시 표시(setNoticesVisible)
        q.shown.push(c);
        layoutNotices(q, o);
        // 연출 스킵(snapAll)·연출 끄기와 무관하게 읽을 시간을 보장하려고 motion.wait 대신 씬 타이머·트윈을 직접 쓴다
        const end = () => { if (c.scene) c.destroy(); q.shown = q.shown.filter((x) => x !== c); layoutNotices(q, o); pumpNotice(scene, q); };
        scene.time.delayedCall(o.ms ?? NOTICE_MS, () => {
            if (!c.scene) { end(); return; }
            scene.tweens.add({ targets: c, alpha: 0, duration: 300, onComplete: end });
        });
    }
}

// 상단 알림 칩 일괄 표시/숨김(교전 컷신 재생 중 숨김: 컷신 상성 리본을 덮던 문제, 강화면 gacha65)
export function setNoticesVisible(scene, on) {
    const q = queues.get(scene);
    q?.shown.forEach((c) => { if (c.scene) c.setVisible(!!on); });
}

function layoutNotices(q, o) {
    let y = typeof o.y === 'function' ? o.y() : (o.y ?? 64);
    q.shown.forEach((c) => { if (!c.scene) return; c.y = y + c.noticeH / 2; y += c.noticeH + 4; });
}
