// 캠페인 지도 계산(순수 함수, Phaser 비의존 -> Node 로 검증 가능).
// 좌표: 등장방형 정규화 x=(경도+180)/360, y=(90-위도)/180 (data/shelf_map_meta.json).
// 카메라: { x, y, z } — (x,y) 화면 중심의 정규화 좌표, z = 360 / 화면에 보이는 경도폭(1 = 세계 전체 폭).
// 뷰포트: { w, h } 화면 px. 경도 1도 = 위도 1도 = 같은 px(등장방형) -> x 1단위 = w*z px, y 1단위 = w*z/2 px.

export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - ((-2 * t + 2) ** 3) / 2);

export const Z_MIN = 1;
export const Z_MAX = 160;

export function project(cam, vp, px, py) {
    const k = vp.w * cam.z;
    return { sx: vp.w / 2 + (px - cam.x) * k, sy: vp.h / 2 + (py - cam.y) * k / 2 };
}

// 지도 표시 영역(world_view_bounds): 전체 정규화 좌표계 안의 부분 사각형. 기본 = 전 지구 [0,1]
export const FULL_VIEW = Object.freeze({ x0: 0, y0: 0, x1: 1, y1: 1 });

// cover 최소 줌: 표시 영역 폭(span*w*z)·높이(span*w*z/2)가 화면 이상이 되도록(빈 띠 방지)
export const zCover = (vp, vb = FULL_VIEW) => {
    if (!(vp?.w > 0)) return Z_MIN;
    return Math.max(Z_MIN, 1 / (vb.x1 - vb.x0), (2 * vp.h) / (vp.w * (vb.y1 - vb.y0)));
};

// 표시 영역 밖(빈 공간)이 보이지 않게 줌(cover 이상)과 중심을 제한
export function clampCam(cam, vp, vb = FULL_VIEW) {
    const zc = zCover(vp, vb);
    const z = clamp(cam.z, zc, Math.max(Z_MAX, zc));
    const halfW = 1 / (2 * z);
    const halfH = vp.h / (vp.w * z); // y 단위(= (vp.h/2) / (w*z/2))
    const x = 2 * halfW >= vb.x1 - vb.x0 ? (vb.x0 + vb.x1) / 2 : clamp(cam.x, vb.x0 + halfW, vb.x1 - halfW);
    const y = 2 * halfH >= vb.y1 - vb.y0 ? (vb.y0 + vb.y1) / 2 : clamp(cam.y, vb.y0 + halfH, vb.y1 - halfH);
    return { x, y, z };
}

// LOD 화면 밀도: 경도 1도가 차지하는 장치 픽셀(세계판 표시 폭(device px)/360). devPerUnit = 레이아웃 1단위당 장치 px
export const screenPPD = (cam, vp, devPerUnit = 1) => (vp.w * cam.z * (devPerUnit || 1)) / 360;
// 지역판 불투명도: from 미만 0, to 이상 1, 사이 선형
export const lodAlpha = (ppd, from = 10, to = 16) => clamp((ppd - from) / (to - from), 0, 1);

// ---- LOD(지역판 고해상 지도) ----
// 지역 경계 -> 정규화 {x0,y0,x1,y1}. 입력: {x0,y0,x1,y1}(정규화) 또는 {west,east,north,south}(경위도, 도). 잘못되면 null
export function normBounds(b) {
    if (!b) return null;
    const n = (v) => Number(v);
    const r = 'west' in b ? { x0: (n(b.west) + 180) / 360, x1: (n(b.east) + 180) / 360, y0: (90 - n(b.north)) / 180, y1: (90 - n(b.south)) / 180 } : { x0: n(b.x0), y0: n(b.y0), x1: n(b.x1), y1: n(b.y1) };
    return [r.x0, r.y0, r.x1, r.y1].every(Number.isFinite) && r.x1 > r.x0 && r.y1 > r.y0 ? r : null;
}
export const inBounds = (b, x, y) => !!b && x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1;
// 선명도 한계 줌: 원본 폭 srcW(px) 이미지가 정규화 폭 spanX 를 덮을 때, 화면 백킹 px 이 원본 px 의 maxUp 배를 넘지 않는 최대 z.
// 표시 폭(백킹 px) = spanX * vpW * z * pxPerUnit <= srcW * maxUp
export function zSharp(srcW, spanX, vpW, pxPerUnit, maxUp = 2) {
    if (!(srcW > 0) || !(spanX > 0) || !(vpW > 0)) return Infinity;
    return (srcW * maxUp) / (spanX * vpW * Math.max(0.01, pxPerUnit || 1));
}

// 점들이 화면의 pad 비율 안에 들어오는 카메라
export function fitBounds(points, vp, { pad = 0.7, zMin = Z_MIN, zMax = Z_MAX } = {}) {
    const pts = (points ?? []).filter((p) => p && Number.isFinite(p.x) && Number.isFinite(p.y));
    if (!pts.length) return { x: 0.5, y: 0.5, z: zMin };
    const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y);
    const minX = Math.min(...xs); const maxX = Math.max(...xs); const minY = Math.min(...ys); const maxY = Math.max(...ys);
    const bx = Math.max(1e-6, maxX - minX); const by = Math.max(1e-6, maxY - minY);
    const z = clamp(Math.min(pad / bx, (2 * pad * vp.h) / (vp.w * by)), zMin, zMax);
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2, z };
}

// ---- 목표 지점 이동 연출(교체 가능한 단계) ----
// 1차(A안) 평면 지도 '지구본 느낌': 먼 이동은 줌아웃 호(로그 줌 2차 베지어) + 진행 방향 약한 회전 + 세로 눌림(기울임), easeInOutCubic.
// 2차에서 셰이더 구체 회전으로 바꿀 때는 같은 시그니처(plan -> sample(t))의 다른 구현을 StageMapView 의 travel 옵션으로 넘긴다.
export const TRAVEL = {
    nearMs: 700, // 같은 지역 안 팬+줌
    arcMs: 900, // 지역 간 이동(줌아웃 호)
    arcRatio: 0.6, // 두 중심 거리 > 화면 폭(작은 쪽)의 이 비율이면 호 이동
    rotMaxDeg: 2.2, // 호 이동 중 최대 회전(도)
    tilt: 0.035, // 호 이동 중 세로 눌림 비율
};

export function planFlatGlobe(from, to, vp, opt = TRAVEL) {
    const f = clampCam(from, vp); const t = clampCam(to, vp);
    const dx = t.x - f.x; const dy = (t.y - f.y) / 2; // y 는 x 의 절반 px
    const d = Math.hypot(dx, dy);
    const span = 1 / Math.max(f.z, t.z); // 더 확대된 쪽의 화면 폭(x 단위)
    const arc = d > opt.arcRatio * span;
    let zMid = Math.min(f.z, t.z);
    if (arc) zMid = clamp(Math.min(zMid, fitBounds([f, t], vp, { pad: 0.55 }).z), Z_MIN, Z_MAX);
    const lf = Math.log(f.z); const lt = Math.log(t.z); const lm = Math.log(zMid);
    const lc = arc ? 2 * lm - 0.5 * (lf + lt) : (lf + lt) / 2; // B(0.5) = lm
    return { from: f, to: t, arc, duration: arc ? opt.arcMs : opt.nearMs, dir: Math.sign(dx) || 1, lf, lc, lt, zMid, opt };
}

// t: 0..1 -> { cam, rot(rad), tiltY(scaleY 배율) }
export function sampleFlatGlobe(plan, t) {
    const tt = clamp(t, 0, 1);
    const e = easeInOutCubic(tt);
    const lz = plan.arc ? (1 - e) ** 2 * plan.lf + 2 * e * (1 - e) * plan.lc + e * e * plan.lt : lerp(plan.lf, plan.lt, e);
    const z = Math.exp(lz);
    // 중심: 호 이동이면 줌아웃이 먼저 시작되도록 약간 늦게 출발
    const u = plan.arc ? easeInOutCubic(clamp((tt - 0.08) / 0.84, 0, 1)) : e;
    const bump = Math.sin(Math.PI * tt);
    const rot = plan.arc ? plan.dir * (plan.opt.rotMaxDeg * Math.PI / 180) * bump : 0;
    const tiltY = plan.arc ? 1 - plan.opt.tilt * bump : 1;
    return { cam: { x: lerp(plan.from.x, plan.to.x, u), y: lerp(plan.from.y, plan.to.y, u), z }, rot, tiltY };
}

export const flatGlobeTravel = { plan: planFlatGlobe, sample: sampleFlatGlobe };

// 회전·눌림 시 모서리가 비지 않게 필요한 확대 배율
export function overscan(vp, rot, tiltY = 1) {
    const c = Math.abs(Math.cos(rot)); const s = Math.abs(Math.sin(rot));
    const need = Math.max((vp.w * c + vp.h * s) / vp.w, (vp.w * s + vp.h * c) / (vp.h * tiltY));
    return Math.max(1, need);
}

// ---- 겹침 정리 ----
// 가까운 핀(minDist 이내)을 묶어 묶음 중심 둘레(ring) 에 펼친다. 반환 Map<id, {dx, dy, spread}>
// 펼친 결과가 이웃 묶음과 다시 겹치면 묶음을 합쳐 다시 펼친다(겹침이 없을 때까지). 묶음 안 순서 = 입력 순서(시계 방향, 12시 시작)
export function declutter(points, { minDist = 22, ring = 22 } = {}) {
    const near = (a, b) => Math.hypot(a.x - b.x, a.y - b.y) < minDist;
    let groups = points.map((p) => [p]);
    const spreadOf = (g) => {
        if (g.length === 1) return [{ p: g[0], x: g[0].sx, y: g[0].sy }];
        const cx = g.reduce((s, p) => s + p.sx, 0) / g.length; const cy = g.reduce((s, p) => s + p.sy, 0) / g.length;
        const r = Math.max(ring, (minDist * 1.15 * g.length) / (2 * Math.PI)); // 이웃 간 호 길이 >= minDist
        const ord = [...g].sort((a, b) => points.indexOf(a) - points.indexOf(b));
        return ord.map((p, k) => { const a = -Math.PI / 2 + (2 * Math.PI * k) / g.length; return { p, x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r }; });
    };
    let placed = groups.map(spreadOf);
    for (let it = 0; it < points.length; it += 1) {
        let merged = false;
        for (let i = 0; i < groups.length && !merged; i += 1) {
            for (let j = i + 1; j < groups.length && !merged; j += 1) {
                if (placed[i].some((a) => placed[j].some((b) => near(a, b)))) {
                    groups[i] = [...groups[i], ...groups[j]]; groups.splice(j, 1); merged = true;
                }
            }
        }
        if (!merged) break;
        placed = groups.map(spreadOf);
    }
    const out = new Map();
    placed.forEach((arr) => arr.forEach(({ p, x, y }) => out.set(p.id, { dx: x - p.sx, dy: y - p.sy, spread: arr.length > 1 })));
    return out;
}

// 라벨 배치: items = [{id, x, y, w, h, prio}] (x,y = 중심). prio 큰 순으로 놓고 겹치면 버린다. obstacles = 이미 차지한 사각형
// opts.nudge: 겹치면 버리기 전에 위·아래(1~2칸)·좌우 반 칸 옮긴 자리를 차례로 시도(항목 x,y 를 그 자리로 고침). opts.bounds {w,h}: 옮긴 자리가 화면 밖이면 건너뜀
export function placeLabels(items, obstacles = [], gap = 4, { nudge = false, bounds = null } = {}) {
    const placed = [...obstacles];
    const keep = new Set();
    const hit = (a, b) => Math.abs(a.x - b.x) * 2 < a.w + b.w + gap && Math.abs(a.y - b.y) * 2 < a.h + b.h + gap;
    const inB = (p) => !bounds || (p.x - p.w / 2 >= 0 && p.x + p.w / 2 <= bounds.w && p.y - p.h / 2 >= 0 && p.y + p.h / 2 <= bounds.h);
    [...items].sort((a, b) => b.prio - a.prio).forEach((it) => {
        const dy = it.h + gap; const dx = it.w / 2 + gap;
        const cands = nudge ? [[0, 0], [0, -dy], [0, dy], [-dx, -dy], [dx, -dy], [-dx, dy], [dx, dy], [0, -2 * dy], [0, 2 * dy]] : [[0, 0]];
        const at = cands.map(([ox, oy]) => ({ ...it, x: it.x + ox, y: it.y + oy })).find((p) => (p === undefined ? false : inB(p) || (p.x === it.x && p.y === it.y)) && !placed.some((o) => hit(o, p)));
        if (!at) return;
        it.x = at.x; it.y = at.y;
        placed.push(it); keep.add(it.id);
    });
    return keep;
}

// 위경도 격자 간격(도): 화면 폭에 4~10줄
export function gridStep(z) {
    const span = 360 / z;
    return [30, 15, 10, 5, 2, 1, 0.5, 0.25].find((s) => span / s <= 10) ?? 0.25;
}
