import { COLOR } from '../theme.js';
import { L } from '../layout.js';
import { makeText } from './common.js';

// 비활성 사유 말풍선(공통, 2026-11-14 사용자 지시 "호버하거나 클릭하면 옆에 안내문구"): 메뉴 목록 사이에 글자를 끼워 넣지 않고(레이아웃 불변)
// 버튼 옆 '패널 바깥'에 말풍선으로 띄운다. 오른쪽 -> 왼쪽 -> (둘 다 화면 밖이면) 버튼 바로 위 겹침 순으로 자리를 고른다. 입력 비차단(인터랙티브 없음).
// host: 버튼들의 부모 컨테이너(host.x/y = bounds 와 같은 좌표계, host.w = 패널 폭), target: host 의 자식(x, y, w, h = host 로컬 좌상단 기준)
// opts.bounds: {x, y, w, h} 화면 안 영역(없으면 논리 화면 전체), opts.ms: 자동 숨김(기본 2.4초). 호스트당 1개(다른 버튼이면 교체)
export function showReasonTip(host, target, text, { bounds, ms = 2400 } = {}) {
    const scene = host?.scene;
    if (!scene || !target || !text) return;
    const cur = host.__reasonTip;
    if (cur?.target === target && cur.c?.scene) { cur.timer?.remove(false); cur.timer = scene.time.delayedCall(ms, () => hideReasonTip(host)); return; }
    hideReasonTip(host);
    const B = bounds ?? { x: 0, y: 0, w: L.lw, h: L.lh };
    const maxW = Math.max(120, Math.min(240, B.w - 24));
    const t = makeText(scene, 0, 0, String(text), { size: 13, bold: true, color: '#FFD9B0', wrap: maxW - 20, origin: [0, 0] });
    const tw = Math.min(maxW, t.width + 20); const th = t.height + 14;
    const hw = host.w ?? 0; const gap = 10;
    const cy = target.y + (target.h ?? 0) / 2;
    let x; let y; let side;
    if (host.x + hw + gap + tw <= B.x + B.w) { x = hw + gap; side = 'right'; } // 패널 오른쪽 바깥
    else if (host.x - gap - tw >= B.x) { x = -gap - tw; side = 'left'; } // 패널 왼쪽 바깥
    else { x = target.x + ((target.w ?? 0) - tw) / 2; side = 'top'; } // 좁은 화면: 버튼 바로 위에 겹쳐 띄움(목록은 밀지 않음)
    y = side === 'top' ? target.y - th - 6 : cy - th / 2;
    // 화면 안으로 클램프(host 로컬 좌표)
    x = Math.max(B.x - host.x + 4, Math.min(x, B.x + B.w - host.x - tw - 4));
    y = Math.max(B.y - host.y + 4, Math.min(y, B.y + B.h - host.y - th - 4));
    const c = scene.add.container(x, y);
    const g = scene.add.graphics();
    g.fillStyle(0x000000, 0.3).fillRoundedRect(2, 3, tw, th, 8);
    g.fillStyle(COLOR.ink, 0.95).fillRoundedRect(0, 0, tw, th, 8);
    g.lineStyle(1.5, 0xe8963a, 1).strokeRoundedRect(0, 0, tw, th, 8);
    // 버튼 쪽 꼬리
    const ty = Math.max(8, Math.min(th - 8, cy - y));
    g.fillStyle(COLOR.ink, 0.95);
    if (side === 'right') g.fillTriangle(0, ty - 6, 0, ty + 6, -7, ty).lineStyle(1.5, 0xe8963a, 1).lineBetween(-7, ty, 0, ty - 6).lineBetween(-7, ty, 0, ty + 6);
    else if (side === 'left') g.fillTriangle(tw, ty - 6, tw, ty + 6, tw + 7, ty).lineStyle(1.5, 0xe8963a, 1).lineBetween(tw + 7, ty, tw, ty - 6).lineBetween(tw + 7, ty, tw, ty + 6);
    t.setPosition(10, 7);
    c.add([g, t]);
    host.add(c);
    c.setAlpha(0);
    scene.tweens.add({ targets: c, alpha: 1, duration: 120 });
    host.__reasonTip = { c, target, timer: scene.time.delayedCall(ms, () => hideReasonTip(host)) };
}

// target 을 주면 그 버튼의 말풍선일 때만 숨김(다른 버튼으로 옮겨 간 경우 유지)
export function hideReasonTip(host, target) {
    const cur = host?.__reasonTip;
    if (!cur || (target && cur.target !== target)) return;
    cur.timer?.remove(false);
    if (cur.c?.scene) cur.c.destroy();
    host.__reasonTip = null;
}
