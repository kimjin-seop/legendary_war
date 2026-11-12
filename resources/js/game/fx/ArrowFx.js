import { tween, isInstant } from '../ui/motion.js';

// 궁병 화살 연출(공용): 정점 지정 포물선(컷신 = 중앙선, 지도 = 두 유닛 중점) + 접선 회전 + 짧은 잔상 + 발사 섬광 + 착탄 표시.
// 성능: 일제 사격 1회당 Graphics 1개만 만들어 모든 화살·잔상·섬광·착탄 표시를 매 프레임 다시 그린다(화살 수와 무관하게 객체 1개).
// 시간: tween 1개(motion.tween)로 진행하므로 배속(1/2/4x)·연출 끄기·스킵을 그대로 따른다(즉시 모드면 onLand 전부 즉시 호출).
// 마법·창 등 다른 공격은 이 모듈을 쓰지 않는다(호출부에서 병종 archer 일 때만 사용).

// 조정 상수 — 화살 연출은 여기 한 곳에서
export const ARROW = {
    arcRatio: 0.28, // 아치 높이 = 수평 거리 x 비율(가까우면 낮게)
    arcMinPx: 10, arcMaxPx: 120, // 아치 높이 하한/상한(px)
    len: 18, width: 2, headLen: 6, headW: 4, // 화살 길이·굵기·촉 크기(px, 월드/컷신 공통 기본값; 호출부가 scale 로 조정)
    color: 0xe8e4d8, headColor: 0xc9ccd4, fletchColor: 0xc8503c,
    trailSteps: 3, trailDt: 0.05, trailAlpha: 0.35, // 잔상: 곡선 위 과거 지점 3개(진행률 0.05 간격), 시작 투명도
    flashMs: 90, flashR: 7, flashColor: 0xfff1c9, // 발사 순간 활시위 섬광
    landMs: 130, landR: 9, landColor: 0xffe9a8, // 착탄 스파크(작은 방사선)
    jitterPx: 0.3, // 일제 사격 착탄 분산(대상 크기 비율)
    // 월드(맵) 공격 모션
    worldFlightMs: 400, worldArcMul: 1.6, // 비행 시간(1배속) / 아치 배율(사거리 2칸 = 약 47px)
    worldExtra: 2, worldExtraGap: 60, worldSpreadTile: 0.22, // 같이 쏘는 보조 화살 수(풀 연출일 때만) / 발사 간격 / 착탄 분산(칸 비율)
    apexMin: 0.2, // 정점 진행률 하한/상한(0.2~0.8, 중앙선이 한쪽 끝에 너무 붙을 때 보호)
    // 컷신: 정점 = 무대 중앙선(두 진영 사이). 앞열 -> 뒷열 순서로 열 간격 발사, 비행 시간은 개별 거리 비례, 마지막 착탄 = 충돌 시각
    cutWaveGap: 85, cutJitterMs: 18, // 열 사이 발사 간격(ms) / 같은 열 안 엇박(0~18ms)
    cutFlightMs: 440, // 가장 먼 화살의 비행 시간(1배속). 발사 구간(CUT_T.charge 650)에 안 들어가면 간격·비행을 비율로 축소
    cutBeatFlight: 1.6, cutBeatArc: 0.6, // 타격 교환 중 추가 사격: 박자 x 1.6 비행 / 아치 0.6배(낮게)
    // 컷신 중앙 분할 띠(두 진영 간격 표시, 무대 전체 높이 세로 띠)를 '위로 넘어가는' 아치로 보이게 하는 보정
    cutApexClear: 0.2, // 최소 아치 높이 = 무대 높이 x 0.2(+ 시작·끝 높이차 절반). 거리가 가까워 아치가 낮아질 때도 이 이상
    cutApexTop: 0.07, // 정점이 무대 상단에서 이만큼(무대 높이 비율) 아래까지만 올라가게(화면 밖 잘림 방지)
};

// 아치 높이: 수평 거리 비례 + 상·하한. rangeMul 로 사거리(칸) 보정
export function arcHeight(dx, rangeMul = 1) {
    return Math.max(ARROW.arcMinPx, Math.min(ARROW.arcMaxPx, Math.abs(dx) * ARROW.arcRatio * rangeMul));
}

// 정점 지정 포물선: 수평은 등속(x 선형), 높이 = 직선 기준선 - h * f(t). f 는 t=tv 에서 1(정점)인 좌우 반포물선.
// tv = 정점의 진행률(기본 0.5 = 두 지점 중앙). apexX(예: 컷신 중앙선)를 주면 그 x 를 지나는 진행률로 정해 정점이 그 선 위에 온다.
function arcF(s, t) {
    const w = t < s.tv ? s.tv : 1 - s.tv;
    const q = (t - s.tv) / w;
    return { f: 1 - q * q, df: (-2 * q) / w };
}
function bez(s, t) {
    return { x: s.from.x + (s.to.x - s.from.x) * t, y: s.from.y + (s.to.y - s.from.y) * t - s.h * arcF(s, t).f };
}
function tangent(s, t) {
    const x = s.to.x - s.from.x;
    const y = s.to.y - s.from.y - s.h * arcF(s, t).df;
    const l = Math.hypot(x, y) || 1;
    return { x: x / l, y: y / l };
}

function drawArrow(g, p, d, k) {
    const L = ARROW.len * k; const hl = ARROW.headLen * k; const hw = ARROW.headW * k;
    const tx = p.x - d.x * L; const ty = p.y - d.y * L;
    const nx = -d.y; const ny = d.x;
    g.lineStyle(Math.max(1, ARROW.width * k), ARROW.color, 1).lineBetween(tx, ty, p.x - d.x * hl * 0.6, p.y - d.y * hl * 0.6);
    g.fillStyle(ARROW.headColor, 1).fillTriangle(p.x, p.y, p.x - d.x * hl + nx * hw * 0.5, p.y - d.y * hl + ny * hw * 0.5, p.x - d.x * hl - nx * hw * 0.5, p.y - d.y * hl - ny * hw * 0.5);
    // 깃(꼬리 양쪽 짧은 사선)
    g.lineStyle(Math.max(1, k), ARROW.fletchColor, 0.9)
        .lineBetween(tx, ty, tx - d.x * 3 * k + nx * 3 * k, ty - d.y * 3 * k + ny * 3 * k)
        .lineBetween(tx, ty, tx - d.x * 3 * k - nx * 3 * k, ty - d.y * 3 * k - ny * 3 * k);
}

// 컷신 순차 사격 시간표: 열(wave) 순서로 일정 간격 발사, 비행 시간은 개별 수평 거리에 비례, 마지막 착탄 = endMs(충돌 시각).
// items: [{ wave, dist }] -> [{ delay, dur }]. k = 축약 배율
export function volleySchedule(items, endMs, k = 1) {
    const maxD = Math.max(1, ...items.map((it) => it.dist));
    const gap = ARROW.cutWaveGap * k;
    let fly = ARROW.cutFlightMs * k; // 가장 먼 화살의 비행 시간
    const raw = items.map((it) => ({ d: it.wave * gap + Math.random() * ARROW.cutJitterMs * k, r: Math.max(0.5, it.dist / maxD) }));
    let last = Math.max(...raw.map((x) => x.d + fly * x.r));
    if (last > endMs) { // 시간이 모자라면 간격·비행을 같은 비율로 줄인다
        const f = endMs / last;
        raw.forEach((x) => { x.d *= f; });
        fly *= f;
        last = endMs;
    }
    const shift = endMs - last; // 앞을 비워 마지막 착탄을 endMs 에 맞춤
    return raw.map((x) => ({ delay: x.d + shift, dur: fly * x.r }));
}

// 일제 사격. shots: [{ from:{x,y}, to:{x,y}, h(아치 높이), apexX?(정점 x, 없으면 중점), delay(ms), dur(ms), onLand? }]
// opts: { scale(화살 크기 배율, 기본 1), trail(잔상 on/off), flash, land(착탄 표시) }
// 반환 없음. 모든 onLand 는 정확히 1번 호출된다(스킵/즉시/레이어 파괴 시에도).
export function fireVolley(scene, layer, shots, { scale = 1, trail = true, flash = true, land = true } = {}) {
    if (!shots.length) return;
    if (isInstant()) { shots.forEach((s) => s.onLand?.(s.to)); return; } // 끄기/스킵: 객체 생성 없이 착탄 콜백만
    shots.forEach((s) => {
        const dx = s.to.x - s.from.x;
        s.tv = s.apexX != null && Math.abs(dx) > 1 ? Math.max(ARROW.apexMin, Math.min(1 - ARROW.apexMin, (s.apexX - s.from.x) / dx)) : 0.5;
        s.landed = false;
    });
    const endAt = Math.max(...shots.map((s) => s.delay + s.dur)) + (land ? ARROW.landMs : 0);
    const g = scene.add.graphics();
    layer.add(g);
    const landOne = (s) => { if (!s.landed) { s.landed = true; s.onLand?.(s.to); } };
    const p = { t: 0 };
    const draw = () => {
        const now = p.t;
        shots.forEach((s) => { if (now >= s.delay + s.dur) landOne(s); });
        if (!g.scene) return; // 컷신 종료 등으로 레이어가 파괴됨
        g.clear();
        shots.forEach((s) => {
            const lt = (now - s.delay) / s.dur;
            if (lt < 0) return;
            if (flash && now - s.delay < ARROW.flashMs) { // 발사 섬광
                const f = (now - s.delay) / ARROW.flashMs;
                g.fillStyle(ARROW.flashColor, 0.85 * (1 - f)).fillCircle(s.from.x, s.from.y, ARROW.flashR * scale * (0.6 + f * 0.8));
            }
            if (lt < 1) {
                if (trail) {
                    for (let i = ARROW.trailSteps; i >= 1; i--) {
                        const a = Math.max(0, lt - ARROW.trailDt * i); const b = Math.max(0, lt - ARROW.trailDt * (i - 1));
                        if (b <= a) continue;
                        const pa = bez(s, a); const pb = bez(s, b);
                        g.lineStyle(Math.max(1, scale * (ARROW.trailSteps - i + 1) * 0.7), 0xffffff, ARROW.trailAlpha * (1 - (i - 1) / ARROW.trailSteps)).lineBetween(pa.x, pa.y, pb.x, pb.y);
                    }
                }
                drawArrow(g, bez(s, lt), tangent(s, lt), scale);
            } else if (land && now - s.delay - s.dur < ARROW.landMs) { // 착탄 스파크
                const f = (now - s.delay - s.dur) / ARROW.landMs;
                const r = ARROW.landR * scale * (0.4 + f);
                g.lineStyle(Math.max(1, scale * 1.5), ARROW.landColor, 1 - f);
                for (let i = 0; i < 5; i++) {
                    const ang = -Math.PI * (0.1 + i * 0.2); // 위쪽 반원으로 튀는 파편
                    g.lineBetween(s.to.x + Math.cos(ang) * r * 0.4, s.to.y + Math.sin(ang) * r * 0.4, s.to.x + Math.cos(ang) * r, s.to.y + Math.sin(ang) * r);
                }
            }
        });
    };
    draw();
    tween(scene, {
        targets: p, to: { t: endAt }, duration: endAt, ease: 'Linear', onUpdate: draw,
        onComplete: () => { shots.forEach(landOne); if (g.scene) g.destroy(); },
    });
}
