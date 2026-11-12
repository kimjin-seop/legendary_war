// 대사 연출 공용 레이아웃 규칙(상단 무대 = 화자 초상화, 하단 = 디자인 대사 패널, 캡션 = 상단 띠).
// 기준: ui/BattleDialogue.js layout()/slotX()/sideFor()/setActive() 값(2026-11-01 재작성본)을 그대로 옮겼다.
// 사용처: scenes/Dialogue.js(스테이지 전·후·튜토리얼·프롤로그). BattleDialogue.js 는 다른 작업 잠금 중이라 아직 자체 사본을 쓰며,
// 잠금 해제 후 layout()/slotX()/sideFor()/setActive() 를 이 모듈 호출로 바꾸면 된다(값 동일, 동작 변화 없음).
import { L } from '../layout.js';
import { MIN_TOUCH, view, fs } from '../theme.js';

export const DIM_TINT = 0x5c6070;
export const speakerId = (info) => info?.code ?? info?.name;

// 패널(box)·상단 버튼 줄(topY, bh)·캡션 띠(band)·초상화 크기(portraitH/portraitMaxW)·바닥선(baseY)·본문 글자 크기
export function dialogueLayout() {
    const { lw, lh, safe, portrait, short } = L; // short = 가로 폰(논리 높이 < 560, docs/PLAN_LANDSCAPE_PHONE.md 중간 6): 패널·글자 압축
    const m = short ? 8 : 12;
    const bh = Math.max(MIN_TOUCH, Math.ceil(MIN_TOUCH / (view.scale || 1)));
    const w = Math.min(1100, lw - safe.l - safe.r - m * 2);
    const h = portrait ? 276 : short ? 150 : 220; // 2026-11-02 대사 글자 +28% 에 맞춰 키움(이전 236/184)
    const x = safe.l + (lw - safe.l - safe.r - w) / 2;
    const box = { x, y: lh - safe.b - m - h, w, h };
    const topY = safe.t + (short ? 6 : 10);
    const stageTop = topY + bh + (short ? 8 : 16);
    const room = box.y + 32 - stageTop; // 초상화 바닥(box.y + 32)부터 위로 쓸 수 있는 높이
    const textSize = portrait ? 23 : short ? 20 : 26;
    // 캡션 띠(1줄, captionBand: y = stageTop - 6, 높이 = 글자 줄 + pad 14 x 2) 아래에서 초상화 머리가 시작하도록 그만큼 비워 둔다(2026-11-03 시오리 머리 겹침)
    const capReserve = Math.ceil(fs(Math.max(14, textSize - 4)) * 1.3) + 22;
    return {
        bh, box, topY, m,
        band: { x, y: stageTop, w },
        portraitH: Math.max(120, Math.min(portrait ? Math.min(room * 0.62, lh * 0.42) : Math.min(room, lh * 0.74), room - capReserve)),
        portraitMaxW: portrait ? lw * 0.62 : short ? lw * 0.3 : lw * 0.36,
        baseY: box.y + (short ? 24 : 32),
        textSize, // 이전 18/20(+28~30%). 글자 크기 설정(fontLevel)은 makeText->fs 가 곱한다
        nameSize: portrait ? 22 : short ? 18 : 23, // 이름표(이전 18)
        nameH: short ? 34 : 44, // 이름표 판 높이(이전 36)
        textY: short ? 28 : 36, // 패널 안 본문 시작 y(이름표 아래, 이전 30)
        bandMaxH: portrait ? 220 : short ? 100 : 150,
    };
}

export function dialogueSlotX(lay, side) {
    const { box } = lay;
    const k = L.portrait ? 0.27 : 0.2;
    return side === 'left' ? box.x + box.w * k : box.x + box.w * (1 - k);
}

// 좌우 배치: 무대에 이미 있으면 그 자리, 아니면 시오리·주인공 좌 / 그 외 우. 같은 쪽 직전 화자와 대화하면 반대편
export function pickSide(portraits, active, info) {
    const id = speakerId(info);
    for (const [side, p] of portraits) if (p.id === id || speakerId(p.info) === id) return side;
    const pref = info.kind === 'shiori' || info.kind === 'protagonist' ? 'left' : 'right';
    const other = pref === 'left' ? 'right' : 'left';
    return portraits.get(pref) && portraits.get(pref) === active ? other : pref;
}

// 배경 16:9 cover: 화면을 빈틈없이 덮는 배율(정수 배율 아님, 넘치는 쪽은 가운데 기준으로 잘림)
export const bgCoverScale = (w, h, lw = L.lw, lh = L.lh) => (w > 0 && h > 0 ? Math.max(lw / w, lh / h) : 1);

// 나레이션 캡션 띠: 상단 버튼 줄 아래, 대사 패널 폭에 맞춘 반투명 띠(초상화 머리와 겹칠 수 있어 잠시 보였다 흐려진다)
export function captionBand(lay) {
    const { band, textSize } = lay;
    return { x: band.x, y: band.y - 6, w: band.w, pad: 14, size: Math.max(14, textSize - 4) };
}

// 초상화 이미지 배율(높이·최대 폭 둘 다 맞춤) / 실루엣 높이
export const portraitScale = (lay, img) => Math.min(lay.portraitH / img.height, lay.portraitMaxW / img.width);
export const silhouetteH = (lay) => Math.min(lay.portraitH, lay.portraitMaxW / 0.6);

// 화자 강조 / 비화자 어둡게(active = null 이면 전원 어둡게: 캡션)
export function applySpeakerFocus(scene, tweenFn, layer, portraits, active, lay) {
    portraits.forEach((q) => {
        const on = q === active;
        if (q.img?.setTint) q.img.setTint(on ? 0xffffff : DIM_TINT);
        tweenFn(scene, { targets: q.c, to: { alpha: 1, scale: on ? 1 : 0.94, y: on ? lay.baseY : lay.baseY + 10 }, duration: 160 });
        if (on) layer.bringToTop(q.c);
    });
}
