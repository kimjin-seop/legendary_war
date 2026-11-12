// 스킬 컷인(영웅 초상 + 스킬 이름) 순수 계산: 길이·타임라인·배치. Phaser 의존 없음(노드에서 단위 확인 가능).
// 그리기는 fx/SkillCutin.js. 좌표 = UI 설계 단위(L.lw x L.lh, 원점 좌상단).

export const CUTIN = {
    ms: 1100, // 첫 스킬 컷인(1배속 기준)
    msChain: 820, // 직전 컷인이 끝난 지 chainGapMs 안(같은 턴 연속 스킬)
    msRepeat: 650, // 같은 유닛이 이번 턴에 다시 쓴 스킬
    chainGapMs: 1600,
    reducedMul: 0.75, // 연출 '축약'
    liteMs: 700, // 간소화(그래픽 품질 하향·연출 끄기): 초상 페이드 + 문구
    nameSize: { wide: 64, tall: 46 },
    subSize: { wide: 20, tall: 17 },
    charStaggerMs: 45, staggerCapMs: 300, // 글자별 등장 간격(전체 상한)
};

// 재생 길이(ms). repeat = 같은 유닛 이번 턴 2회차 이상, chained = 직전 컷인과 간격이 짧음, reduced = 연출 축약
export function cutinMs({ repeat = false, chained = false, reduced = false } = {}) {
    const base = repeat ? CUTIN.msRepeat : chained ? CUTIN.msChain : CUTIN.ms;
    return Math.round(base * (reduced ? CUTIN.reducedMul : 1));
}

// 타임라인(ms 시점). ms 에 비례해 줄어든다(1100 기준 값)
export function cutinTimeline(ms, chars = 1) {
    const f = ms / CUTIN.ms;
    const stagger = Math.min(CUTIN.charStaggerMs * f, CUTIN.staggerCapMs * f / Math.max(1, chars - 1));
    return {
        vignette: { at: 0, dur: 140 * f },
        band: { at: 0, dur: 170 * f }, // 뒤 띠 슬라이드 인
        stripe: { at: 90 * f, dur: 180 * f }, // 앞 띠(반대 방향)
        portrait: { at: 60 * f, dur: 280 * f }, // 초상 대각선 슬라이드 + 스케일 인
        slash: { at: 230 * f, dur: 150 * f }, // 띠 위 섬광 사선
        name: { at: 250 * f, dur: 190 * f, stagger }, // 글자별
        sub: { at: 420 * f, dur: 160 * f },
        out: { at: ms * 0.78, dur: ms * 0.22 },
    };
}

// 배치. W/H = 화면(설계 단위), ally = 아군(초상 왼쪽) / 적(초상 오른쪽, 좌우 반전)
// 반환: band(중심선 y(x) = cy + k*(x - W/2), 높이 bandH), portrait(중심 x, 바닥 y, 높이 h, 폭 w, 진입 시작점), name(중심, 최대 폭), sub
export function cutinLayout(W, H, ally = true) {
    const dir = ally ? 1 : -1; // 초상 쪽 -> 이름 쪽 방향
    const tall = W < H;
    const k = -0.08 * dir; // 띠 기울기: 초상 쪽이 낮고 이름 쪽이 높다
    const bandH = Math.round(tall ? clamp(H * 0.17, 110, 190) : clamp(H * 0.3, 140, 240));
    const cy = Math.round(H * (tall ? 0.55 : 0.5));
    const yAt = (x) => cy + k * (x - W / 2);
    let ph; let pw; let px; let bottom;
    if (tall) {
        // 세로: 초상은 띠 위쪽(머리가 화면 위로 나가지 않게), 이름은 띠 아래 반(화면 폭 전체)
        ph = Math.min(H * 0.42, (W * 0.78) / 0.75);
        pw = ph * 0.75;
        px = clamp(W * (ally ? 0.4 : 0.6), pw / 2 + 4, W - pw / 2 - 4);
        bottom = yAt(px) + bandH * 0.3;
    } else {
        px = 0; pw = 0;
        const guess = W * (ally ? 0.24 : 0.76);
        bottom = Math.min(H - 4, yAt(guess) + bandH * 0.35);
        ph = Math.min(H * 0.8, bottom - 8);
        pw = ph * 0.75;
        px = clamp(guess, pw / 2 + 8, W - pw / 2 - 8);
    }
    ph = Math.min(ph, bottom - 4); // 머리 잘림 방지
    pw = ph * 0.75;
    let name;
    if (tall) {
        const nx = W / 2;
        name = { x: nx, y: yAt(nx) + bandH * 0.16, maxW: W - 28 };
    } else {
        const a = ally ? px + pw * 0.45 : 24; const b = ally ? W - 24 : px - pw * 0.45;
        const nx = (a + b) / 2;
        name = { x: nx, y: yAt(nx) - bandH * 0.1, maxW: Math.max(120, b - a) };
    }
    const sub = { x: name.x, y: tall ? yAt(name.x) + bandH * 0.4 : yAt(name.x) + bandH * 0.3 };
    return {
        W, H, tall, dir, k, cy, bandH,
        stripe: { top: bandH * 0.18, bottom: bandH * 0.5 }, // 중심선 기준 앞 띠(초상 바닥을 가림)
        portrait: { x: px, bottom, h: ph, w: pw, fromX: px - dir * W * 0.32, fromY: bottom + H * 0.1, glowY: bottom - ph * 0.55 },
        name, sub,
    };
}

// 이름 글자 폭 합이 maxW 를 넘으면 줄일 배율(1 이하)
export const fitScale = (totalW, maxW) => (totalW > maxW && totalW > 0 ? maxW / totalW : 1);

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
