// 전투 대사 카메라(순수 계산, Phaser 의존 없음 -> node 로 직접 검증 가능).
// Battle.dialogueFocus / dlgCamEnd 가 사용한다. 좌표는 모두 논리 단위(scene 카메라 zoom = L.u 이전), 월드 배율 s = world.scaleX.
// 규칙
//  1) 채움(fill): 대사 중 맵은 화면 가로·세로를 모두 덮는 배율(cover) 이상. 기존 배율이 이미 더 크면 기존 배율 유지. 맵 밖 빈 영역(레터박스) 없음.
//  2) 포커스: 화자 유닛이 있으면 타일 CSS 크기 = 화면 짧은 변 x FOCUS_FRAC(하한·상한 px) 가 되는 배율(채움 배율 x [MIN_GAIN, MAX_GAIN] 로 제한),
//     유닛 칸 중심을 화면 가로 중앙·세로 ANCHOR_Y(상단 60% 영역의 중심 = 0.3) 에 둔다. 맵 경계에서는 빈 영역이 생기지 않게 클램프(정확한 중앙이 아닐 수 있음).
//  3) 화자 유닛 없음(캡션·시오리·병사·매핑 실패): 채움 배율로 대사 시작 직전 화면 중심을 세로 DEFAULT_Y 에 둔다.
export const DLG_CAM = {
    FOCUS_FRAC: 0.17, // 포커스 타일 CSS 크기 = 짧은 변 x 0.17
    FOCUS_MIN_CSS: 56, // 하한(px)
    FOCUS_MAX_CSS: 120, // 상한(px)
    MIN_GAIN: 1.15, // 포커스 배율 >= 채움 x 1.15 (확대가 눈에 띄게)
    MAX_GAIN: 2.6, // 포커스 배율 <= 채움 x 2.6 (작은 화면에서 과확대 방지)
    ANCHOR_Y: 0.3, // 화면 상단 60% 영역의 중심
    DEFAULT_Y: 0.4,
    MOVE_MS: 450, // 화자 전환·시작 이동 시간
    RETURN_MS: 340, // 대사 종료 후 원래 전투 뷰 복귀 시간
    EASE: 'Cubic.easeInOut',
};

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 맵이 화면을 가로·세로 모두 덮는 최소 배율(경계 0.05% 여유: 반올림으로 1px 틈이 생기지 않게)
export function coverScale({ lw, lh, mapW, mapH, tile }) {
    return Math.max(lw / (mapW * tile), lh / (mapH * tile)) * 1.0005;
}

// 빈 영역 없는 위치 클램프(s >= cover 이면 맵이 화면을 항상 덮는다). 맵이 더 작은 축은 가운데 정렬(안전장치)
// padB: 하단 대사 패널이 덮는 높이(논리 px). 맵 마지막 행은 패널 뒤로만 더 끌어올릴 수 있다(패널 위 보이는 영역은 항상 맵으로 가득,
//  가장자리 행 화자도 패널 위로 올라온다). 패널 뒤 틈은 패널·좌우 여백 일부에만 생긴다.
export function clampFill(x, y, s, { lw, lh, mapW, mapH, tile, padB = 0 }) {
    const w = mapW * tile * s; const h = mapH * tile * s;
    return {
        x: w <= lw ? (lw - w) / 2 : clamp(x, lw - w, 0),
        y: h <= lh ? (lh - h) / 2 : clamp(y, lh - h - Math.max(0, padB), 0),
    };
}

// 목표 뷰 계산.
// v = { lw, lh, mapW, mapH, tile, baseS, cssPerLogical(= L.u / L.R), cssShort(짧은 변 CSS px), sMax?, padB?(대사 패널 높이: 포커스 때만 사용) }
// focus = 월드 로컬 좌표 {x, y}(유닛 칸 중심) | null, center = 월드 로컬 {x, y}(유닛 없을 때 중심)
export function planDialogueView(v, focus, center) {
    const sFill = Math.max(v.baseS, coverScale(v));
    let s = sFill;
    let anchorY = DLG_CAM.DEFAULT_Y;
    let pt = center;
    if (focus) {
        const css = clamp(v.cssShort * DLG_CAM.FOCUS_FRAC, DLG_CAM.FOCUS_MIN_CSS, DLG_CAM.FOCUS_MAX_CSS);
        const sT = css / (v.tile * v.cssPerLogical);
        s = clamp(sT, sFill * DLG_CAM.MIN_GAIN, sFill * DLG_CAM.MAX_GAIN);
        if (v.sMax) s = Math.max(sFill, Math.min(s, v.sMax));
        anchorY = DLG_CAM.ANCHOR_Y;
        pt = focus;
    }
    const want = { x: v.lw / 2 - pt.x * s, y: v.lh * anchorY - pt.y * s };
    const p = clampFill(want.x, want.y, s, focus ? v : { ...v, padB: 0 }); // 기본 뷰는 하단 틈 없이(완전 채움)
    return { s, x: p.x, y: p.y, fill: sFill, focused: !!focus, tileCss: v.tile * s * v.cssPerLogical };
}

// 유닛의 영웅/NPC 코드 후보(서버 필드 형태 차이 흡수)
function unitCodes(u) {
    const out = [];
    if (typeof u.hero === 'string') out.push(u.hero); else if (u.hero && typeof u.hero.code === 'string') out.push(u.hero.code);
    if (typeof u.hero_code === 'string') out.push(u.hero_code);
    if (typeof u.npc_ref === 'string') out.push(u.npc_ref);
    return out;
}

// 화자 -> 전장 유닛. rawSpeaker = 대사 줄의 speaker 원문, info = BattleDialogue.speakerOf 결과({kind, code, npc}).
// 캡션·시오리·병사(troop:*) 는 맵 위 개별 유닛이 없으므로 null. 주인공은 protagonist 플래그 유닛만(지휘관으로 추정하지 않음).
// 영웅/NPC: 'hero:'·'npc:' 접두를 떼고 npc_ 유무 두 형태 + info.code 로 비교. 살아 있는 유닛만, 분대 병사(kind troop)보다 영웅 유닛 우선. 실패 시 null(기본 뷰).
export function matchSpeakerUnit(rawSpeaker, info, units) {
    const kind = info?.kind;
    if (!Array.isArray(units) || !units.length || !kind || kind === 'caption' || kind === 'shiori' || kind === 'troop') return null;
    const alive = units.filter((u) => u && (u.hp ?? 1) > 0 && Number.isFinite(u.x) && Number.isFinite(u.y));
    if (kind === 'protagonist') return alive.find((u) => u.protagonist) ?? null;
    const codes = new Set();
    if (info.code) codes.add(String(info.code));
    const raw = String(rawSpeaker ?? '').replace(/^hero:/, '').replace(/^npc:/, '');
    if (raw && !/^\d+$/.test(raw)) {
        codes.add(raw);
        if (/^npc_/.test(raw)) codes.add(raw.slice(4)); else codes.add(`npc_${raw}`);
    }
    if (!codes.size) return null;
    const hits = alive.filter((u) => unitCodes(u).some((c) => codes.has(c)));
    return hits.find((u) => u.kind !== 'troop') ?? hits[0] ?? null;
}
