import { reachable, keyOf } from '../systems/grid.js';
import { unitType } from '../data/rules.js';

// 이동 미리보기(2026-11-03 UX): 목적지까지의 실제 이동 경로를 점선 + 화살촉으로, 자동 추종 병사의 '예상' 도착 칸을 옅은 마커로 그린다.
// 그래픽만(입력 소비 없음). 판정은 서버이며 추종 예상은 서버 Engine::autoFollowTroops 를 근사한 참고 표시다(지형·first_turn_move_cap 등으로 다를 수 있음).

const center = (t, T) => ({ x: t.x * T + T / 2, y: t.y * T + T / 2 });

// origin: {x,y} 출발 칸, path: [{x,y}...] 출발 칸 제외 경로(grid.pathTo 형식), T: 타일 px
export function drawMovePath(g, origin, path, T, o = {}) {
    if (!origin || !path?.length) return;
    const pts = [origin, ...path].map((t) => center(t, T));
    const col = o.color ?? 0xffe08a;
    // 1) 바닥 대비용 어두운 굵은 선(지형 색과 무관하게 보이게)
    g.lineStyle(7, 0x0b1020, 0.45);
    g.beginPath(); g.moveTo(pts[0].x, pts[0].y); pts.slice(1).forEach((p) => g.lineTo(p.x, p.y)); g.strokePath();
    // 2) 점선(구간 사이 위상 이어짐). 마지막 구간은 화살촉 자리만큼 줄인다
    const DASH = 9; const GAP = 6; const HEAD = 11;
    let phase = 0;
    g.lineStyle(3.5, col, 0.95);
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1]; const b = pts[i];
        let len = Math.hypot(b.x - a.x, b.y - a.y);
        if (!len) continue;
        const ux = (b.x - a.x) / len; const uy = (b.y - a.y) / len;
        if (i === pts.length - 1) len = Math.max(0, len - HEAD);
        let d = 0;
        while (d < len) {
            const inDash = phase < DASH;
            const step = Math.min(len - d, inDash ? DASH - phase : DASH + GAP - phase);
            if (inDash) g.lineBetween(a.x + ux * d, a.y + uy * d, a.x + ux * (d + step), a.y + uy * (d + step));
            d += step; phase = (phase + step) % (DASH + GAP);
        }
    }
    // 3) 화살촉(마지막 구간 방향)
    const b = pts[pts.length - 1]; const a = pts[pts.length - 2];
    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / L; const uy = (b.y - a.y) / L;
    const tip = { x: b.x + ux * 4, y: b.y + uy * 4 };
    const base = { x: tip.x - ux * (HEAD + 4), y: tip.y - uy * (HEAD + 4) };
    const w = 8;
    const tri = [tip.x, tip.y, base.x - uy * w, base.y + ux * w, base.x + uy * w, base.y - ux * w];
    g.fillStyle(0x0b1020, 0.6).fillTriangle(tri[0] + ux, tri[1] + uy, tri[2] - ux * 2, tri[3] - uy * 2, tri[4] - ux * 2, tri[5] - uy * 2);
    g.fillStyle(col, 1).fillTriangle(...tri);
}

// 추종 병사 예상 도착 칸. leader 를 dest 에 세운 것으로 보고, 소속 병사(candidates 중 leaderId === leader.id, 치유 병종 제외)를
// 영웅에서 먼 순으로 '이동 가능 칸 중 오라 반경(없으면 2) 안, 영웅과 가깝고 이동 비용 적은 칸'으로 배치한다. 반경 안이면 제자리(표시 없음).
// 반환 [{id, x, y}]. 소속 병사가 없으면 [].
export function predictFollowers(map, units, leader, dest, candidates) {
    if (!map || !leader || !dest || leader.kind === 'troop') return [];
    const mine = (candidates ?? []).filter((u) => String(u.leaderId) === String(leader.id) && !u.moved && !(unitType(u.type)?.heal > 0));
    if (!mine.length) return [];
    const radius = Number(leader.aura?.radius ?? 2) || 2;
    const md = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    // 작업용 위치 사본(배치될 때마다 갱신해 다음 병사가 그 칸을 피한다)
    const work = units.filter((u) => u.hp > 0).map((u) => (String(u.id) === String(leader.id) ? { ...u, x: dest.x, y: dest.y } : { ...u }));
    const out = [];
    [...mine].sort((a, b) => md(b, dest) - md(a, dest)).forEach((c) => {
        const w = work.find((u) => String(u.id) === String(c.id));
        if (!w || md(w, dest) <= radius) return;
        const here = md(w, dest);
        let best = null;
        reachable(map, work, w).forEach((n, k) => {
            if (k === keyOf(w.x, w.y)) return;
            const d = md(n, dest);
            const rank = d <= radius ? [0, d, n.cost, n.x, n.y] : [1, d, n.cost, n.x, n.y];
            if (!best || cmp(rank, best) < 0) best = rank; // 서버: 반경 밖이면 영웅까지 경로 비용 기준 — 여기선 맨해튼 근사
        });
        if (!best || (best[0] === 1 && best[1] >= here)) return; // 가까워지지 않으면 제자리
        w.x = best[3]; w.y = best[4];
        out.push({ id: c.id, x: w.x, y: w.y });
    });
    return out;
}

function cmp(a, b) {
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
}

// 예상 칸 마커: 옅은 점선 원(칸 가운데). '예상' 글자는 호출 측(makeText)에서 붙인다
export function drawFollowerMarks(g, marks, T) {
    marks.forEach((m) => {
        const c = center(m, T);
        g.fillStyle(0xdcecff, 0.16).fillCircle(c.x, c.y, T * 0.3);
        const r = T * 0.3; const n = 12;
        g.lineStyle(2, 0xdcecff, 0.7);
        for (let i = 0; i < n; i += 2) {
            const a0 = (i / n) * Math.PI * 2; const a1 = ((i + 1) / n) * Math.PI * 2;
            g.beginPath(); g.arc(c.x, c.y, r, a0, a1); g.strokePath();
        }
    });
}
