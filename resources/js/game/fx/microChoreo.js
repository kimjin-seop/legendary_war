// 병사 미시 교전 '안무형' 재생 시간표(순수 함수, phaser 의존 없음 -> node 로 위치 검증 가능).
// 서버 attack.micro 의 "결과"만 쓴다: 개체 초기 배치 s(진형 대열), 최대 HP m, 타격 h(순서·공격자·대상·남은 HP), 사망 d, 최종 생존 e.
// 서버 이동 기록 k·rt·tick 위치는 쓰지 않는다(시뮬 이동을 연출로 바꾸던 어색함 제거, MICRO_STYLE='choreo').
// 구조(동시 교전, 2026-11-07 사용자 정정: 교대 차례 폐기):
//  0) 진형 유지 HOLD_MS
//  1) 양측 동시 출발: 근접(보병·창·검)·영웅 개체는 각자 첫 대상 바로 앞(APPROACH_SUB)까지 달려가 붙는다(진형은 출발 위치에서만, 이동 중 흩어짐·옆 휨은 해시). 상대가 돌격 기병이면 제자리 받아치기
//     기병 = 자기 레인 일직선 관통 돌격(지나가는 순간 양쪽 타격) -> 빠져나가 제자리 복귀(재돌격 없음) / 원거리 = 제자리 사격 / 영웅 = 첫 대상 앞까지 나섬
//  2) 같은 일제 타격 구간에 양측 타격·피·쓰러짐이 겹친다(개체별 해시 흩어짐, 연속 타격은 STRIKE_GAP)
//  3) 같은 타이밍에 각자 제자리 복귀
//  타격이 없는 진영(원거리 무반격 legacy_counter 등)은 움직이지 않고 받기만 한다(유일한 비대칭)
//  원거리 방어자 + 근접 접촉 공격자: 방어측 반격 모션 생략(RANGED_NO_COUNTER_ANIM). 원거리 대 원거리는 양측 동시 사격
//  시각 제약(서버 순서 정합): 같은 대상에 대한 타격은 서버 순서대로, 쓰러지는 타격은 그 개체 자신의 마지막 타격보다 뒤
// 개체별 시작 지연은 개체 번호 해시(난수 없음): 같은 입력 = 같은 연출.

export const CHOREO = {
    // 이동 속도 배율(한 곳에서 튜닝): 실제 최고 속도 = 기준 속도(V_*, V_MAX 상한) x 이 값.
    //  이력(2026-11-07): 1.0(기본, 상한 1.5) -> 0.5 -> 0.3(느리게 요청) -> 2.0(최신 지시 '기본의 2배', 상한 3.0 sub/ms)
    //  타격·사망·병력 수치 감소 연출 길이(MicroCutscene 의 LUNGE/FLASH/DEATH/SPARK/BLOOD/PROJ, BattleCutscene stepBar)는 이 배율과 무관
    MOVE_SPEED_SCALE: 1.2, // 2026-11-07 사용자 "속도 좀 더 줄여줘" 1.5 -> 1.2
    CAV_SPEED_SCALE: null, // 기병만 따로 배율(null = MOVE_SPEED_SCALE)
    V_WALK: 1.2,         // 보병 전진·복귀 기준 최고 속도(서브유닛/ms, 배율 전)
    V_HERO: 1.2,         // 영웅 개체(배율 전, 병사와 같은 속도)
    HERO_MEET: 0.8,      // 영웅과 병사가 서로 노릴 때 맞붙는 지점(영웅 출발 위치 -> 상대 출발 위치 비율). 0.5 = 중간
    HERO_LEAD: 120,      // 영웅이 병사보다 먼저 출발하는 시간(ms)
    HERO_RUN_OVERSHOOT: 150, // 근접 영웅 질주: 가장 뒤 적 개체를 넘어 더 달리는 거리(서브유닛). 유닛 축소 비율로 200 -> 150
    HERO_RETURN_SCALE: 1.4,  // 근접 영웅 복귀 속도 = 질주 속도 x 이 값(속도 상한 V_MAX 예외: 배율 1.2 기준 1.44 x 1.4 = 2.02 sub/ms)
    V_CAV: 1.5,          // 기병 돌격·복귀(배율 전)
    V_MAX: 1.5,          // 기준 최대 속도 상한(배율 전). 실제 상한 = V_MAX x 배율
    EASE_R: 0.25,        // 이동 가감속 구간 비율(앞뒤 각 25% 가감속, 가운데 일정 속도)
    MIN_MOVE_MS: 120,    // 아주 짧은 이동도 이 시간 이상
    HOLD_MS: 300,        // 진형 유지(시작)
    STAGGER_MS: 70,      // 개체별 출발·복귀 지연 최대(해시 분산)
    APPROACH_SUB: 65, // 근접 개체가 대상 바로 앞에 붙는 거리(서브유닛). 유닛 폭(UNIT_SCALE 0.45 에서 약 65 서브유닛) x 1.0 -> 겹치지 않고 닿아 보임
    SLOT_DEG: 55, // 한 대상에 여럿이 붙을 때 둘레 링 위 자리 간격(도). 반지름 65 에서 이웃 자리 간격 약 60 서브유닛(유닛 폭 근처)
    BEND_SUB: 30, // 접근·복귀 경로 옆 휨 최대(해시). 유닛 축소 비율(0.75)로 40 -> 30
    BRACE_SUB: 55, // 기병에게 달려든 개체가 기병 경로 옆에서 맞서는 거리(접촉, 유닛 폭 x 0.85)
    HIT_HOLD: 80,        // 대상이 바뀔 때 앞 타격 뒤 머묾
    RANGED_NO_COUNTER_ANIM: true, // 원거리 방어자 + 근접 접촉 공격자: 방어측 반격 모션 생략(피해는 반영). 원거리 대 원거리는 적용 안 함
    LUNGE_SUB: 19, // 안무 찌르기 앞뻗음 폭(서브유닛). 유닛 축소 비율로 25 -> 19
    STRIKE_PCT: 0.75,    // 일제 타격 기준 = 접근 도착 시각 분위(1 = 가장 늦은 개체까지 기다림)
    STRIKE_SPREAD: 70,   // 일제 타격 개체별 흩어짐(해시)
    STRIKE_GAP: 100,     // 한 개체의 연속 타격 간격(2타 이상일 때)
    STRIKE_SPAN: 220,    // 연속 타격 전체 폭 상한
    SHOT_SPREAD: 120,    // 원거리 일제 사격 흩어짐
    SHOT_GAP: 130,       // 원거리 연속 사격 간격
    RANGED_LEAD: 60,     // 이동하는 진영이 없을 때 첫 사격까지
    HOLD_AFTER: 90,      // 일제 타격 구간 끝 -> 복귀 출발 전 머묾
    EPS: 35,             // 쓰러뜨리는 타격은 대상 자신의 마지막 타격 뒤 이만큼
    EPS_SAME: 20,        // 같은 대상 연속 피격 최소 간격(서버 순서 유지)
    EPS_SAME_CAV: 4,     // 돌격 중인 기병이 연달아 맞을 때 간격
    CAV_RUN_MAX: null,   // 기병 돌격 거리 상한(서브유닛, null = 무제한). 느린 배율에서 길이를 줄일 때만
    CAV_EXIT: 75, // 기병이 자기 마지막 대상을 지나 빠져나가는 거리. 유닛 축소 비율로 100 -> 75
    CAV_PAUSE: 70,       // 관통 후 방향 전환 머묾
    TAIL_DEATH_MS: 150,  // 마지막 사망 후 여유(넉백 KNOCKBACK_MS 뒤에 더함)
    // ---- 사망 넉백(2026-11-07 '타격감'): 쓰러뜨린 공격자 반대쪽으로 짧게 튕겨 나가며(포물선·기울기) 땅에 닿아 쓰러진 뒤 사라짐 ----
    //  방향 = 공격자->사망자 x 부호(같으면 자기 진영 뒤쪽). 거리·높이·기울기는 개체 번호 해시로 +-20% 변주(난수 없음). 영웅은 거리 x 1.3. 착지 x 는 필드 안으로 클램프
    KNOCKBACK_SUB: 64, // 수평 넉백 거리(서브유닛). 유닛 축소 비율로 85 -> 64(높이는 유닛 높이 비율이라 자동)
    KNOCKBACK_LIFT: 0.32,     // 튕길 때 뜨는 높이 = 유닛 표시 높이 x 이 값
    KNOCKBACK_TILT_DEG: 32,   // 튕기는 동안 기울기 최대(도, 넉백 방향). 착지 후 쓰러짐(80도)으로 이어짐
    KNOCKBACK_MS: 230,        // 튕김 구간(ms). 이후 쓰러짐·사라짐은 MicroCutscene DEATH_MS(320)
    KNOCKBACK_HERO: 1.3,      // 영웅 개체 넉백 거리 배율
    // ---- 대형 위치 = 초상 기준(2026-11-07 사용자 '초상화를 아슬아슬하게 가리는 포지션') ----
    //  BattleCutscene.buildCutIn(CUT_STYLE 'ref', 데스크톱·가로 폰) 초상: 높이 ph = round(min(H x 0.54, SH x 0.81)), 폭 pw = round(ph x 0.75), 중심 x = pw x 0.3(왼쪽) -> 안쪽 경계 = pw x 0.8.
    //  기준 해상도(REF_*)에서 그 경계를 필드 x 로 환산하고, 맨 뒷열(서버 배치 x LAYOUT_BACK_X) 유닛의 바깥 가장자리가 경계 안쪽으로 PORTRAIT_OVERLAP(유닛 폭 비율)만큼 들어가게 대형을 민다.
    //  1280x720 과 667x375(같은 16:9)는 환산 경계가 같다(-37). 세로 폰(390x844)은 초상이 병사 위쪽에 따로 있어 겹치지 않는다. 초상 식이 바뀌면 portraitInnerPx 도 같이 바꾼다
    REF_W: 1280, REF_H: 720, REF_PANEL: 108, // 기준 해상도와 그때 하단 패널 높이(ref 스타일: round(min(112, max(92, H x 0.15))))
    PORTRAIT_OVERLAP: 0.15,   // 맨 뒷열 유닛 폭 중 초상에 가리는 비율
    LAYOUT_BACK_X: 0,         // 서버 배치(stagger343) 공격측 맨 뒷열 x(방어측은 중심 대칭 900)
    LAYOUT_FRONT_X: 300,      // 서버 배치 공격측 앞열 x(방어측 600). 앞줄 간격 하한 계산용
    FORMATION_PULL_FWD: 80,   // 초상 가림 위치에서 대형을 앞(중앙선 쪽)으로 더 당기는 거리(2026-11-07 '앞으로 좀 더'). 맨 뒷열 가림 비율은 줄어듦(허용)
    FRONT_GAP_MIN_X: 2.5,     // 양 앞줄 간격 하한 = APPROACH_SUB x 이 값(시작부터 닿을 듯 붙지 않게). 당김이 이 하한을 넘으면 하한에서 클램프
    // ---- 영웅 질주 속도(2026-11-07 '영웅 돌진 1.5배') ----
    HERO_RUN_SCALE: 1.2,      // 근접 영웅 질주 속도 = 영웅 기준 속도(V_HERO x MOVE_SPEED_SCALE = 1.44) x 이 값 -> 1.73 sub/ms(병사 1.44 의 1.2배, 속도 상한 예외). 2026-11-07 1.5 안 -> 1.2
    HERO_RETURN_MAX: 3.5,     // 영웅 복귀 속도(질주 x HERO_RETURN_SCALE) 절대 상한(sub/ms)
    // ---- 이동 먼지(2026-11-07 '돌진할 때 뒤에 먼지'): 코드 그래픽 퍼프, 외부 에셋 없음 ----
    //  일정 속도 이상 이동하는 개체의 발 뒤(이동 반대쪽)에 이동 거리 간격으로 생성 -> 커지며 떠오르고 흩어지며 사라짐. 위치·크기는 개체 번호 해시(난수 없음)
    DUST_ON: true,
    DUST_MIN_SPEED: 0.6,      // 이 속도(sub/ms) 이상 이동할 때만
    DUST_STEP_RATIO: 0.6,     // 생성 간격 = APPROACH_SUB(유닛 폭 근사) x 이 값(이동 거리 기준 -> 속도에 비례해 많아짐). 기병·영웅 질주는 x 0.8(더 촘촘)
    DUST_MS: 320,             // 퍼프 수명(ms, 해시로 +-20%)
    DUST_COLOR: 0xc9b48c,     // 연한 황토(지면 톤)
    DUST_MAX: 80,             // 동시에 그리는 퍼프 상한(넘으면 오래된 것부터만 그림)
    DUST_RIDER_K: 1.4,        // 기병·영웅 질주 퍼프 크기 배율
    DUST_RETURN_K: 0.7,       // 복귀(뒤로 달림) 퍼프 크기·진하기 배율(약하게)
    // ---- 화살 깊이감(2026-11-07 '대각선 화살에도 필드 거리감') ----
    //  지면 궤적(그림자) = 사수 발 -> 목표 발 직선(세로 행 차이만큼 대각선). 화살 = 지면 궤적 위로 높이(가슴 높이 보간 + 포물선 호)만큼 떠서 이동.
    //  크기·진하기는 지면 궤적의 깊이(y: 지면 위쪽 = 멀다)로 보간, 그림자는 높을수록 옅고 작게. 모두 결정적(난수 없음)
    ARROW_FLIGHT_MS: 260,     // 안무 화살 비행 시간(ms, 타격 시각에 도착). sim 은 기존 PROJ_MS(90)
    ARROW_ARC_MIN: 0.35,      // 포물선 최고 높이 최소(유닛 높이 비율)
    ARROW_ARC_PER_PX: 0.0016, // 화면 거리 1px 당 추가 높이(유닛 높이 비율)
    ARROW_ARC_MAX: 1.4,       // 포물선 최고 높이 상한(유닛 높이 비율)
    ARROW_RELEASE_H: 0.55,    // 쏘는 높이(사수 발 위, 유닛 높이 비율)
    ARROW_HIT_H: 0.5,         // 맞는 높이(목표 발 위, 유닛 높이 비율)
    ARROW_LEN: 0.24,          // 화살 길이(유닛 높이 비율, 깊이 배율 적용 전)
    ARROW_DEPTH_FAR: 0.8,     // 지면 위 경계(먼 쪽)에서의 크기 배율(지면 아래 경계 = 1.0)
    ARROW_ALPHA_FAR: 0.8,     // 먼 쪽 진하기 배율
    ARROW_SHADOW_ALPHA: 0.3,  // 그림자 진하기(땅에 붙어 있을 때). 높이에 따라 최대 절반까지 옅어짐
    ARROW_SHADOW_LEN: 0.9,    // 그림자 길이(화살 길이 비율). 높이에 따라 줄어듦
    ARROW_SHADOW_COLOR: 0x1a140c,
    TAIL_HIT_MS: 150,    // 마지막 타격 후 여유
    // ---- 고정 필드(2026-11-07 사용자 확정: 모든 교전에서 컷신 필드 크기·위치·스케일 동일) ----
    //  서버 배치 범위(MicroCombat grid2x5, formations_enabled=false): 공격측 x 300·150, 방어측 x 600·750(gap 300, spacing 150), y 0~600.
    //  필드 = x -225~1125(폭 1350 = 이전 최소 폭, 중앙 450), y 0~600. 화면 배율은 이 고정 범위로만 계산하고, 모든 이동은 필드 경계(FIELD_EDGE 안쪽)로 클램프
    FIELD_X0: -225, FIELD_X1: 1125, FIELD_Y0: 75, FIELD_Y1: 525, // 세로 = 서버 stagger343 실제 배치 y 범위(75~525, FIELD_SPREAD_Y 1.0)
    FIELD_EDGE: 40,      // x 클램프 여유(필드 끝에서 이만큼 안쪽까지만 이동)
    FIELD_Y_PAD: 10, // y 클램프 여유(링·휨 허용). 필드 y (FIELD_Y0 - PAD) ~ (FIELD_Y1 + PAD) 가 배경 지면 띠 전체에 대응. 20 -> 10(행 간격 확보)
    // 배경 지면 띠(2026-11-07 '배경 위에 병사가 떠 있다'): 컷신 배경(bg.battle.*, 960x300, manifest groundBand '0.70~0.85 평탄', groundLine 0.78~0.82)의 지면 영역 비율.
    //  유닛 발(y)은 이 띠 안에만 선다. 배경은 무대에 cover(가운데 크롭)로 깔리므로 같은 cover 계산으로 화면 y 를 구한다(BattleCutscene.coverImage 와 같은 식)
    BG_W: 960, BG_H: 300,
    GROUND_TOP_PCT: 0.67, // 지면 위 경계(배경 이미지 높이 비율). 가장 위 병사 발이 이 아래. 2026-11-07 '상하 간격 살짝 늘려' 0.70 -> 0.67(지평선 쪽 땅을 조금 더 사용)
    GROUND_BOT_PCT: 0.98, // 지면 아래 한계(2026-11-07 팀장 결정: 화면 앞쪽 땅까지 사용. 위아래 이웃 겹침 약 34% 허용, UNIT_SCALE 0.6 유지)
    // ---- 유닛 크기·간격(2026-11-07 사용자 '유닛이 너무 크다, 간격 넓게') ----
    UNIT_SCALE: 0.45, // 유닛 표시 높이 = 기준 높이(1280x720 에서 119.7px) x 이 값 -> 53.9px(폭 동일, 약 65 서브유닛). 2026-11-07 사용자 승인 0.6 -> 0.45. 타격 불꽃·피·투사체·막대·쓰러짐 폭도 같은 비율
    FIELD_SPREAD_X: 0.5, // 컷신에서만 서버 배치 좌표를 중심(SPREAD_CX) 기준으로 같은 비율로 조정(지그재그 모양 유지): 열 간격 150 -> 75. 2026-11-07 '살짝만 늘려' 0.375 -> 0.5. 이력 1.6 -> 1.3 -> 1.12 -> 0.95 -> 0.75 -> 0.375 -> 0.5
    FORMATION_FORWARD: null, // 양 진영 대형 x 오프셋(서브유닛, +적 쪽 / -뒤쪽, 출발·복귀 위치 공통). null = 초상 기준 자동(formationForward: 맨 뒷열 유닛 바깥 PORTRAIT_OVERLAP 이 초상 안쪽 경계에 가림). 숫자를 넣으면 그 값 고정
    FIELD_SPREAD_Y: 1.0, // 세로는 서버 y 그대로(화면 세로 간격은 지면 띠 매핑이 결정). 이력 1.3 -> 0.85 -> 1.0(stagger343)
    SPREAD_CX: 450, SPREAD_CY: 300, // 서버 stagger343 배치 중심(공격 x 0~300, 방어 600~900, y 75~525)
};

// 필드 경계 클램프(이동 목표·경유점)
export const clampField = (x, y) => [
    Math.min(CHOREO.FIELD_X1 - CHOREO.FIELD_EDGE, Math.max(CHOREO.FIELD_X0 + CHOREO.FIELD_EDGE, x)),
    Math.min(CHOREO.FIELD_Y1 + CHOREO.FIELD_Y_PAD, Math.max(CHOREO.FIELD_Y0 - CHOREO.FIELD_Y_PAD, y)),
];

// 초상 안쪽 경계(화면 px, 왼쪽 초상 기준). BattleCutscene.buildCutIn 의 비-compact 식과 같다
export const portraitInnerPx = (W, H, SH) => { const ph = Math.round(Math.min(H * 0.54, SH * 0.81)); const pw = Math.round(ph * 0.75); return pw * 0.8; };

// 대형 x 오프셋(서브유닛, 진영 방향 +). FORMATION_FORWARD 가 숫자면 그 값, null 이면 기준 해상도의 초상 경계로 자동 계산
export function formationForward() {
    const C = CHOREO;
    if (C.FORMATION_FORWARD != null) return C.FORMATION_FORWARD;
    const SH = C.REF_H - C.REF_PANEL;
    const v = microView({ W: C.REF_W, H: C.REF_H, SH, groundY: Math.round(SH * 0.78) });
    const innerX = v.cx + (portraitInnerPx(C.REF_W, C.REF_H, SH) - C.REF_W / 2) / v.sx; // 초상 안쪽 경계의 필드 x(왼쪽)
    const wSub = v.want / v.sx; // 기준 해상도 유닛 폭(서브유닛)
    const backTarget = innerX + (0.5 - C.PORTRAIT_OVERLAP) * wSub; // 맨 뒷열 유닛 중심 x
    const backNow = C.SPREAD_CX + (C.LAYOUT_BACK_X - C.SPREAD_CX) * C.FIELD_SPREAD_X;
    const fwd = backTarget - backNow + C.FORMATION_PULL_FWD;
    // 앞줄 간격 하한: (방어 앞열 - 공격 앞열) - 2 x fwd >= APPROACH_SUB x FRONT_GAP_MIN_X
    const baseGap = 2 * (C.SPREAD_CX - (C.SPREAD_CX + (C.LAYOUT_FRONT_X - C.SPREAD_CX) * C.FIELD_SPREAD_X));
    return Math.min(fwd, (baseGap - C.APPROACH_SUB * C.FRONT_GAP_MIN_X) / 2);
}

// 화살 자세(순수, 화면 px): a/b = 사수·목표의 발 위치 {x, y}, pf = 비행 진행 0~1, uh = 유닛 표시 높이, band = {groundTop, groundBot}
//  반환: gx·gy(지면 궤적 점 = 그림자), x·y(화살 끝), ang(진행 방향), len(화살 길이), alpha, sx·sy·slen·salpha(그림자), h(지면 위 높이)
export function arrowPose(a, b, pf, uh, band) {
    const C = CHOREO;
    const gx = a.x + (b.x - a.x) * pf; const gy = a.y + (b.y - a.y) * pf; // 지면 궤적(대각선)
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    const arc = uh * Math.min(C.ARROW_ARC_MAX, C.ARROW_ARC_MIN + C.ARROW_ARC_PER_PX * dist);
    const hAt = (u) => uh * (C.ARROW_RELEASE_H + (C.ARROW_HIT_H - C.ARROW_RELEASE_H) * u) + arc * 4 * u * (1 - u);
    const h = hAt(pf);
    const depth = Math.min(1, Math.max(0, (gy - band.groundTop) / Math.max(1, band.groundBot - band.groundTop))); // 0 = 먼 쪽(위), 1 = 가까운 쪽(아래)
    const k = C.ARROW_DEPTH_FAR + (1 - C.ARROW_DEPTH_FAR) * depth;
    const du = 0.02; const u2 = Math.min(1, pf + du); const u1 = Math.max(0, u2 - du);
    const p1 = { x: a.x + (b.x - a.x) * u1, y: a.y + (b.y - a.y) * u1 - hAt(u1) }; const p2 = { x: a.x + (b.x - a.x) * u2, y: a.y + (b.y - a.y) * u2 - hAt(u2) };
    const ang = Math.atan2(p2.y - p1.y, p2.x - p1.x);
    const lift = Math.min(1, h / Math.max(1, uh * (C.ARROW_RELEASE_H + C.ARROW_ARC_MAX)));
    const len = uh * C.ARROW_LEN * k;
    return { gx, gy, x: gx, y: gy - h, h, ang, len, k, alpha: C.ARROW_ALPHA_FAR + (1 - C.ARROW_ALPHA_FAR) * depth,
        sx: gx, sy: gy, slen: len * C.ARROW_SHADOW_LEN * (1 - 0.4 * lift), salpha: C.ARROW_SHADOW_ALPHA * (1 - 0.5 * lift), sang: Math.atan2(b.y - a.y, b.x - a.x) };
}

// 고정 필드 -> 화면 변환(순수). stage = {W, H, SH, groundY}. 반환 sx·sy(px/서브유닛), 중심, 띠 중앙, 유닛 표시 높이 want(px, 병종·샘플 무관 동일)
export function microView({ W, H, SH, groundY }) {
    const C = CHOREO;
    const padX = Math.max(28, W * 0.06);
    const sx = (W - padX * 2) / (C.FIELD_X1 - C.FIELD_X0);
    const cx = (C.FIELD_X0 + C.FIELD_X1) / 2;
    // 세로: 배경 cover 크롭 기준 지면 띠(GROUND_TOP_PCT ~ GROUND_BOT_PCT)의 무대 y -> 필드 y (Y0 - PAD) ~ (Y1 + PAD) 를 그 띠에 선형 대응
    const sca = Math.max(W / C.BG_W, SH / C.BG_H); const top = (C.BG_H - SH / sca) / 2;
    const yAt = (r) => (r * C.BG_H - top) * sca;
    const groundTop = yAt(C.GROUND_TOP_PCT); const groundBot = yAt(C.GROUND_BOT_PCT);
    const fy0 = C.FIELD_Y0 - C.FIELD_Y_PAD; const fy1 = C.FIELD_Y1 + C.FIELD_Y_PAD;
    const sy = (groundBot - groundTop) / (fy1 - fy0);
    const cy = (C.FIELD_Y0 + C.FIELD_Y1) / 2; const bandMid = groundTop + (cy - fy0) * sy;
    // 유닛 표시 높이(px): 지면 띠 배율과 무관한 고정 기준(이전 세로 띠 SH x 0.36 / 600)으로 계산 -> 병종·샘플·세로 압축 무관 동일
    const syRef = (SH * 0.36) / 600;
    const want = Math.max(12, Math.min(H * 0.125 * 1.5, 150 * sx * 1.15, 150 * syRef * 2.4) * C.UNIT_SCALE);
    return { sx, sy, cx, cy, bandMid, groundTop, groundBot, want, toX: (x) => W / 2 + (x - cx) * sx, toY: (y) => groundTop + (y - fy0) * sy };
}

const RANGED_TYPES = new Set(['archer', 'mage', 'gunner']);
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

// 진영 역할: specs[side].unit({type, kind}) -> 'ranged' | 'cav' | 'hero' | 'melee'. 서버 micro 에 병종 필드가 없어 진영 단위 유닛 정보로 판정(진영 내 병종 동일 가정)
export function microRoles(specs, m) {
    const count = [0, 1].map((side) => (Array.isArray(m?.s) ? m.s.filter((r) => Array.isArray(r) && r[0] === side).length : 0));
    const heroCav = [false, false]; // 기병 영웅(항상 관통 질주)
    const roles = [0, 1].map((side) => {
        const u = specs?.[side]?.unit ?? {};
        const type = u.type ?? null;
        const hero = u.kind != null && u.kind !== 'troop' && count[side] === 1;
        heroCav[side] = hero && type === 'cavalry' && !RANGED_TYPES.has(type);
        if (RANGED_TYPES.has(type)) return 'ranged';
        if (hero) return 'hero';
        if (type === 'cavalry') return 'cav';
        return 'melee';
    });
    roles.heroCav = heroCav;
    return roles;
}

// 결정적 해시 [0,1)
export const hash01 = (i, salt = 0) => {
    let h = (Math.imul((i + 1) | 0, 2654435761) ^ Math.imul((salt + 7) | 0, 40503)) >>> 0;
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; h = Math.imul(h, 3266489917) >>> 0; h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
};

// 가감속-일정속도-가감속(사다리꼴 속도). 최고 속도 = 거리 / (길이 x (1-r))
const trap = (u, r) => {
    if (u <= 0) return 0; if (u >= 1) return 1;
    const k = 2 * r * (1 - r);
    if (u < r) return (u * u) / k;
    if (u <= 1 - r) return (u - r / 2) / (1 - r);
    return 1 - ((1 - u) * (1 - u)) / k;
};
// 실제 최고 속도(서브유닛/ms) = 기준 속도(V_MAX 상한) x 배율. cav = 기병 배율(CAV_SPEED_SCALE, null 이면 공통)
export const vPeak = (v, cav = false) => Math.min(CHOREO.V_MAX, v) * (cav && CHOREO.CAV_SPEED_SCALE != null ? CHOREO.CAV_SPEED_SCALE : CHOREO.MOVE_SPEED_SCALE);
const moveMs = (dist, vp) => Math.max(CHOREO.MIN_MOVE_MS, dist / (vp * (1 - CHOREO.EASE_R)));

// 경로 [{t,x,y,bend}] 에 (t0 에 출발해) 목표까지 최고 속도 vp 로 이동 추가. 반환 = 도착 시각
//  bend: 경로 가운데가 진행 방향의 옆으로 휘는 폭(서브유닛, sin 곡선). 뒷줄이 앞줄 사이·옆으로 돌아 들어가게(겹침 완화). 휜 만큼 길이를 늘려 속도 상한 유지
//  via: 중간 경유점 [[x,y],...](기병 관통: 대상들을 차례로 스치는 꺾은선, 일정 속도로 이어 달림)
function moveTo(trk, t0, x, y, vp, bend = 0, via = null) {
    const last = trk[trk.length - 1];
    const s = Math.max(t0, last.t);
    if (s > last.t) trk.push({ t: s, x: last.x, y: last.y });
    [x, y] = clampField(x, y);
    if (via) via = via.map(([vx, vy]) => clampField(vx, vy));
    const pts = [[last.x, last.y], ...(via ?? []), [x, y]];
    let d = 0; for (let j = 1; j < pts.length; j += 1) d += Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]);
    if (d < 1e-6) return s;
    const t1 = s + moveMs(d + Math.abs(bend) * 2.2, vp);
    trk.push({ t: t1, x, y, bend: d > 1 && !via?.length ? bend : 0, via: via?.length ? via : null });
    return t1;
}

// 꺾은선 위 비율 f 의 점
function alongPolyline(pts, f) {
    const segs = []; let L = 0;
    for (let j = 1; j < pts.length; j += 1) { const l = Math.hypot(pts[j][0] - pts[j - 1][0], pts[j][1] - pts[j - 1][1]); segs.push(l); L += l; }
    let r = f * L;
    for (let j = 0; j < segs.length; j += 1) {
        if (r <= segs[j] || j === segs.length - 1) { const g = segs[j] > 0 ? Math.min(1, r / segs[j]) : 1; return { x: pts[j][0] + (pts[j + 1][0] - pts[j][0]) * g, y: pts[j][1] + (pts[j + 1][1] - pts[j][1]) * g }; }
        r -= segs[j];
    }
    return { x: pts[pts.length - 1][0], y: pts[pts.length - 1][1] };
}

// 경로 위치(화면 ms). moving = 이동 구간, back = 진영 전진 방향의 반대로 이동 중(복귀: 스프라이트 뒤돌기용)
export function choreoPosAt(e, t) {
    const trk = e.ctrk;
    if (e.deadMs != null && t > e.deadMs) t = e.deadMs;
    if (!trk || !trk.length || t <= trk[0].t) return { x: trk?.[0]?.x ?? e.x0, y: trk?.[0]?.y ?? e.y0, moving: false, back: false };
    for (let j = trk.length - 1; j >= 0; j -= 1) {
        if (trk[j].t <= t) {
            const a = trk[j]; const b = trk[j + 1];
            if (!b) return { x: a.x, y: a.y, moving: false, back: false };
            const f = trap(b.t > a.t ? (t - a.t) / (b.t - a.t) : 1, CHOREO.EASE_R);
            const moving = b.x !== a.x || b.y !== a.y;
            if (b.via) { const q = alongPolyline([[a.x, a.y], ...b.via, [b.x, b.y]], f); return { x: q.x, y: q.y, moving, back: moving && (b.x - a.x) * e.dir < 0 }; }
            let x = a.x + (b.x - a.x) * f; let y = a.y + (b.y - a.y) * f;
            if (b.bend) { const dx = b.x - a.x; const dy = b.y - a.y; const L = Math.hypot(dx, dy) || 1; const o = Math.sin(Math.PI * f) * b.bend; x += (-dy / L) * o; y += (dx / L) * o; }
            y = clampField(x, y)[1]; // 휨이 필드(지면 띠) 위아래를 넘지 않게
            return { x, y, moving, back: moving && (b.x - a.x) * e.dir < 0 };
        }
    }
    return { x: e.x0, y: e.y0, moving: false, back: false };
}

// 두 개체가 가장 가까워지는 시각(기병이 대상을 스치는 순간, 양쪽 다 움직여도 됨, 5ms 표본). 같은 거리면 먼저 오는 시각
function closestAt(ea, eb, tFrom, tTo) {
    let best = tFrom; let bd = Infinity;
    for (let t = tFrom; t <= tTo; t += 5) {
        const a = choreoPosAt({ ...ea, deadMs: null }, t); const b = choreoPosAt({ ...eb, deadMs: null }, t);
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bd - 0.5) { bd = d; best = t; }
    }
    return best;
}

// 이벤트 + 진영 역할 -> 시간표. roles = microRoles(specs, m)
export function microChoreo(m, roles = ['melee', 'melee']) {
    const C = CHOREO;
    const n = m.s.length;
    const ok = (i) => Number.isInteger(i) && i >= 0 && i < n;
    // 서버 배치 좌표 -> 컷신 좌표(FIELD_SPREAD 로 간격 확대, 중심 고정 + FORMATION_FORWARD 만큼 적 쪽으로). 이후 모든 안무 계산(출발·복귀 위치 포함)은 이 좌표 기준
    const FWD = formationForward();
    const spX = (x) => C.SPREAD_CX + (x - C.SPREAD_CX) * C.FIELD_SPREAD_X; const spY = (y) => C.SPREAD_CY + (y - C.SPREAD_CY) * C.FIELD_SPREAD_Y;
    const ents = m.s.map((r, i) => ({ i, side: r[0], dir: r[0] === 0 ? 1 : -1, x0: spX(num(r[1])) + (r[0] === 0 ? 1 : -1) * FWD, y0: spY(num(r[2])), hp0: Math.max(0, num(r[3])), max: Math.max(1, num(m.m?.[i], 1)), deadMs: null }));
    ents.forEach((e) => { e.ctrk = [{ t: 0, x: e.x0, y: e.y0 }]; });
    // 타격: 서버 순서(틱, 같은 틱은 기록 순서)
    const hits = (Array.isArray(m.h) ? m.h : []).filter((r) => Array.isArray(r) && ok(r[1]) && ok(r[2]))
        .map((r, j) => ({ j, tick: num(r[0]), a: r[1], b: r[2], dmg: num(r[3]), hpAfter: Math.max(0, num(r[4])) }))
        .sort((p, q) => p.tick - q.tick || p.j - q.j);
    hits.forEach((h, k) => { h.ord = k; h.side = ents[h.a].side; h.melee = roles[h.side] !== 'ranged'; });
    // 궁병(원거리) 방어자는 근접 접촉 공격자에게 반격하지 않는다: 이벤트에 방어측 타격이 있어도(구 서버) 사격·찌르기 모션 없이 피해·사망만 반영(silent).
    //  원거리 대 원거리(공격측도 원거리)는 양측 동시 사격 그대로
    const silentCounter = C.RANGED_NO_COUNTER_ANIM && roles[1] === 'ranged' && roles[0] !== 'ranged';
    hits.forEach((h) => { h.silent = silentCounter && h.side === 1; });
    const deathTick = new Array(n).fill(null);
    (Array.isArray(m.d) ? m.d : []).forEach((r) => { if (Array.isArray(r) && ok(r[1]) && deathTick[r[1]] == null) deathTick[r[1]] = num(r[0]); });
    const finalHp = new Array(n).fill(null);
    if (Array.isArray(m.e)) m.e.forEach((r) => { if (Array.isArray(r) && ok(r[0])) finalHp[r[0]] = Math.max(0, num(r[1])); });
    else ents.forEach((e) => { if (deathTick[e.i] == null) { const last = hits.filter((h) => h.b === e.i).pop(); finalHp[e.i] = last ? last.hpAfter : e.hp0; } });
    // 쓰러뜨린 타격 = 사망 틱 이하의 그 개체 대상 마지막 타격(같은 틱 과잉 타격은 그 뒤에 표시)
    const killHit = new Array(n).fill(null);
    hits.forEach((h) => { if (deathTick[h.b] != null && h.tick <= deathTick[h.b]) killHit[h.b] = h; });
    const stag = (i, salt) => hash01(i, salt) * C.STAGGER_MS;

    // ---- 이동 계획(동시 교전, 접근형): 타격이 있는 진영만 움직인다(무반격 진영은 제자리에서 받기만) ----
    //  출발 위치에서만 진형 대열. 근접·영웅 개체는 각자 서버 첫 타격 대상 바로 앞(APPROACH_SUB)까지 달려가 붙어 친다.
    //  서로를 노리는 짝은 중간에서 맞붙고, 한 대상에 여럿이 붙으면 대상 둘레 링(SLOT_DEG 간격)으로 감싼다. 대상이 바뀌면 그 대상 앞으로 옮겨 붙는다
    const acts = [0, 1].map((s) => hits.some((h) => h.side === s));
    const VW = vPeak(C.V_WALK); const VH = vPeak(C.V_HERO); const VC = vPeak(C.V_CAV, true);
    const sideEnts = [0, 1].map((s) => ents.filter((e) => e.side === s));
    const frontOf = (s) => Math.max(...sideEnts[s].map((e) => e.x0 * (s === 0 ? 1 : -1))); // 진영 전열(진영 방향 좌표)
    const T0 = C.HOLD_MS;
    const own = ents.map(() => []); hits.forEach((h) => own[h.a].push(h));
    const firstT = ents.map((e) => (own[e.i].length ? own[e.i][0].b : null));
    const heroE = (x) => roles[x.side] === 'hero';
    const startOf = (e) => (heroE(e) ? Math.max(0, T0 - C.HERO_LEAD) : T0 + stag(e.i, 1)); // 근접 출발(영웅은 병사보다 약간 앞서)
    // 영웅 돌파: 근접 영웅은 적 병사와 맞붙어 멈추지 않고 대열을 뚫고 지나간다(상대도 돌진하는 근접 영웅이면 서로 맞붙음 = 일반 짝 규칙)
    //  기병 영웅은 상대가 누구든 관통 질주. 보병 영웅은 상대가 타격하는 영웅이면 서로 맞붙음(상대가 기병 영웅이면 그 경로로 달려들어 맞섬 = 맞돌격 규칙)
    const heroCavE = (e) => !!roles.heroCav?.[e.side];
    const heroRush = (e) => heroE(e) && acts[e.side] && (heroCavE(e) || !(roles[1 - e.side] === 'hero' && acts[1 - e.side]));
    const cavE = (e) => (roles[e.side] === 'cav' && acts[e.side]) || heroRush(e); // 일직선 관통 경로를 쓰는 개체(기병·돌파 영웅)
    // 기병: 자기 대상들을 앞에서부터 차례로 스치는 꺾은선 관통(되돌아가지 않음) -> 마지막 대상 + CAV_EXIT 지점으로 빠져나감(상한 CAV_RUN_MAX)
    //  ptOf(대상) = 대상을 스칠 지점(처음엔 출발 위치, 대상이 달려 나와 맞서면 그 자리)
    const buildRider = (e, ptOf) => {
        const o = 1 - e.side;
        if (heroRush(e)) { // 영웅 질주: 자기 y 유지 직선으로 적 대열 전체를 통과해 가장 뒤 적 개체 + HERO_RUN_OVERSHOOT 까지 정지 없이 달린 뒤 바로 반전 복귀(복귀는 HERO_RETURN_SCALE 배 빠르게)
            const foes = sideEnts[o];
            if (!foes.length) return;
            const edge = e.dir > 0 ? C.FIELD_X1 - C.FIELD_EDGE : -(C.FIELD_X0 + C.FIELD_EDGE); // 진행 방향 필드 끝(진영 방향 좌표)
            const far = Math.min(Math.max(...foes.map((t) => t.x0 * e.dir)) + C.HERO_RUN_OVERSHOOT, edge);
            e.rush = { far: e.dir * far, passed: foes.filter((t) => Math.abs(t.y0 - e.y0) <= C.APPROACH_SUB).length };
            e.ctrk = [{ t: 0, x: e.x0, y: e.y0 }];
            e.chargeEnd = moveTo(e.ctrk, startOf(e), e.dir * far, e.y0, VH * C.HERO_RUN_SCALE);
            return;
        }
        const foeFront = sideEnts[o].length ? -frontOf(o) : e.x0 * e.dir;
        const tgs = [...new Set(own[e.i].map((h) => h.b))].map((b) => ({ b, p: ptOf(ents[b]) }))
            .filter((t) => t.p.x * e.dir > e.x0 * e.dir).sort((p, q) => p.p.x * e.dir - q.p.x * e.dir);
        let far = Math.max(foeFront, e.x0 * e.dir, ...tgs.map((t) => t.p.x * e.dir)) + C.CAV_EXIT;
        if (C.CAV_RUN_MAX != null) far = Math.min(far, e.x0 * e.dir + C.CAV_RUN_MAX);
        const via = tgs.filter((t) => t.p.x * e.dir < far).map((t) => [t.p.x, t.p.y]);
        const exitY = via.length ? via[via.length - 1][1] : e.y0;
        e.ctrk = [{ t: 0, x: e.x0, y: e.y0 }];
        e.chargeEnd = moveTo(e.ctrk, T0 + stag(e.i, 5), e.dir * far, exitY, VC, 0, via);
    };
    const home = (t) => ({ x: t.x0, y: t.y0 });
    ents.forEach((e) => { if (cavE(e)) buildRider(e, home); });
    const riding = (i) => ents[i].chargeEnd != null;
    // 근접 이동 개체: 근접·영웅 + 타격 있음 + 첫 대상이 돌격 기병이 아님(기병 상대는 아래 '맞돌격')
    const isMover = (e) => acts[e.side] && (roles[e.side] === 'melee' || roles[e.side] === 'hero') && !riding(e.i) && firstT[e.i] != null && !riding(firstT[e.i]);
    const movers = ents.filter(isMover);
    // 맞돌격: 근접·영웅 + 첫 대상이 돌격 기병 -> 다른 근접 병사와 같은 시각에 출발해 그 기병의 경로로 달려들어 만나는 지점(경로 옆 BRACE_SUB)에서 타격 후 복귀.
    //  만남 = 출발 후 쉬지 않고 달려 도착하는 가장 이른 경로 지점(도착 즉시 기병이 그 자리에 옴 -> 서서 기다리는 구간 없음).
    //  달려도 못 만나면(이미 지나감) 뒤쫓지 않고 기병이 가장 가까이 지나간 지점으로 가서 친다
    const chargers = ents.filter((e) => acts[e.side] && (roles[e.side] === 'melee' || roles[e.side] === 'hero') && !riding(e.i) && firstT[e.i] != null && riding(firstT[e.i]));
    const meetPt = new Map();
    const solveMeet = (e) => {
        const r = ents[firstT[e.i]]; const st = startOf(e); const v = heroE(e) ? VH : VW;
        const at = (t) => { const p = choreoPosAt({ ...r, deadMs: null }, t); const sg = e.y0 >= p.y ? 1 : -1; return { x: p.x, y: p.y + sg * C.BRACE_SUB }; };
        for (let t = st; t <= r.chargeEnd; t += 5) {
            const q = at(t);
            if (st + moveMs(Math.hypot(q.x - e.x0, q.y - e.y0), v) <= t) return { ...q, t };
        }
        const tc = closestAt(r, { ...e, ctrk: [{ t: 0, x: e.x0, y: e.y0 }] }, T0, r.chargeEnd);
        return { ...at(tc), t: null };
    };
    chargers.forEach((e) => meetPt.set(e.i, solveMeet(e)));
    // 기병 경로를 맞돌격 지점 기준으로 다시 그리고(대상이 나와 선 자리를 스침), 만남 지점을 한 번 더 맞춘다
    ents.forEach((e) => { if (cavE(e)) buildRider(e, (t) => meetPt.get(t.i) ?? home(t)); });
    chargers.forEach((e) => meetPt.set(e.i, solveMeet(e)));
    chargers.forEach((e) => {
        const q = meetPt.get(e.i);
        e.ctrk = [{ t: 0, x: e.x0, y: e.y0 }];
        moveTo(e.ctrk, startOf(e), q.x, q.y, heroE(e) ? VH : VW);
    });
    const mutual = (e) => { const b = firstT[e.i]; return isMover(ents[b]) && firstT[b] === e.i; };
    // 한 대상에 붙는 k 번째 자리: 대상 둘레 반지름 APPROACH_SUB 링 위(정면 0, 이후 위아래 번갈아 SLOT_DEG 씩 돌아 옆·뒤로 감쌈)
    const ring = (e, k) => { const th = (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2) * C.SLOT_DEG) * Math.PI / 180; return { x: -e.dir * C.APPROACH_SUB * Math.cos(th), y: C.APPROACH_SUB * Math.sin(th) }; };
    const slot = new Map(); const byT = new Map();
    movers.forEach((e) => { const b = firstT[e.i]; if (!byT.has(b)) byT.set(b, []); byT.get(b).push(e); });
    byT.forEach((list) => { list.sort((p, q) => (mutual(q) ? 1 : 0) - (mutual(p) ? 1 : 0) || p.i - q.i); list.forEach((e, k) => slot.set(e.i, k)); });
    // 붙는 자리 확정: 움직이지 않는 개체·서로 노리는 짝(중간에서 맞붙음)부터 고정하고, 대상 자리가 고정된 개체를 차례로 고정(대상 링 위).
    //  쫓고 쫓기는 순환(0->11->2->10->0 등)은 남은 개체 중 번호가 가장 낮은 개체를 자기 출발 위치와 대상 출발 위치의 중간에 고정해 끊는다(결정적)
    const stand = ents.map((e) => ({ x: e.x0, y: e.y0 }));
    const fixed = ents.map((e) => !isMover(e));
    // 맞붙는 지점: 보통 두 출발 위치의 중간. 영웅이 낀 짝은 영웅 쪽에서 HERO_MEET 지점(영웅이 적 쪽으로 깊이 돌진, 영웅끼리는 중간)
    const meetW = (e, tb) => (heroE(e) === heroE(tb) ? 0.5 : heroE(e) ? C.HERO_MEET : 1 - C.HERO_MEET);
    const midFix = (e) => { const tb = ents[firstT[e.i]]; const o = ring(e, 0); const w = meetW(e, tb); stand[e.i] = { x: e.x0 + (tb.x0 - e.x0) * w + o.x / 2, y: e.y0 + (tb.y0 - e.y0) * w }; fixed[e.i] = true; };
    movers.forEach((e) => { if (mutual(e)) midFix(e); });
    for (let guard = 0; guard <= n; guard += 1) {
        let prog = true;
        while (prog) {
            prog = false;
            movers.forEach((e) => {
                if (fixed[e.i] || !fixed[firstT[e.i]]) return;
                const sb = stand[firstT[e.i]]; const o = ring(e, slot.get(e.i));
                stand[e.i] = { x: sb.x + o.x, y: sb.y + o.y }; fixed[e.i] = true; prog = true;
            });
        }
        const rest = movers.find((e) => !fixed[e.i]);
        if (!rest) break;
        midFix(rest);
    }
    // 대상별 붙는 자리(첫 대상 = stand, 바뀐 대상 = 그 대상 자리 앞 + 해시 옆 오프셋)
    const spotOf = (e, h, j) => { if (h.b === firstT[e.i]) return stand[e.i]; const o = ring(e, 1 + Math.floor(hash01(e.i, 17 + j) * 4)); return { x: stand[h.b].x + o.x, y: stand[h.b].y + o.y }; };
    const bendOf = (e, salt) => (hash01(e.i, salt) * 2 - 1) * C.BEND_SUB;
    // 첫 접근 도착 = 일제 타격 기준(가장 늦게 도착하는 개체에 맞춤)
    let strikeBase = T0 + C.RANGED_LEAD;
    // 일제 타격 기준 = 접근 도착 시각의 STRIKE_PCT 분위(먼 대상을 쫓는 소수는 도착하는 대로 친다 -> 한 명 때문에 전원이 기다리지 않음)
    const arrivals = movers.map((e) => {
        const v = roles[e.side] === 'hero' ? VH : VW;
        const p = stand[e.i]; const bend = heroE(e) ? 0 : bendOf(e, 19);
        return startOf(e) + moveMs(Math.hypot(p.x - e.x0, p.y - e.y0) + Math.abs(bend) * 2.2, v);
    }).sort((p, q) => p - q);
    if (arrivals.length) strikeBase = Math.max(strikeBase, arrivals[Math.min(arrivals.length - 1, Math.floor((arrivals.length - 1) * C.STRIKE_PCT))]);
    // ---- 원하는 타격 시각: 양측이 같은 일제 타격 구간에 겹친다 ----
    const cnt = new Map(); hits.forEach((h) => { const c = cnt.get(h.a) ?? 0; h.k = c; cnt.set(h.a, c + 1); });
    const gapOf = (c, g) => (c > 1 ? Math.min(g, C.STRIKE_SPAN / (c - 1)) : 0);
    hits.forEach((h) => {
        if (riding(h.a) || riding(h.b)) { // 기병 관통 순간(기병도, 맞서는 적도 그 순간 타격)
            const r = riding(h.a) ? ents[h.a] : ents[h.b];
            h.want = closestAt(ents[h.a], ents[h.b], T0, r.chargeEnd);
            return;
        }
        const c = cnt.get(h.a);
        h.want = h.melee ? strikeBase + hash01(h.a, 13) * C.STRIKE_SPREAD + h.k * gapOf(c, C.STRIKE_GAP)
            : strikeBase + hash01(h.a, 11) * C.SHOT_SPREAD + h.k * gapOf(c, C.SHOT_GAP);
    });
    // ---- 순서 제약: 같은 대상 피격은 연출 시각 순서가 서버 순서와 달라도 된다(표시 HP = 지금까지의 최저 hp_after -> 다시 늘지 않고 최종값 일치).
    //  쓰러뜨리는 타격만 그 대상에 대한 다른 모든 타격 뒤(EPS_SAME), 그리고 대상 자신의 마지막 타격 뒤(EPS)(같은 틱 맞교환은 반복 수렴) ----
    const settle = () => {
        let ownMax = new Array(n).fill(-1e9); let onMax = new Array(n).fill(-1e9);
        for (let pass = 0; pass < 12; pass += 1) {
            const lw = new Array(n).fill(-1e9); const lo = new Array(n).fill(-1e9); let moved = false;
            hits.forEach((h) => {
                let t = h.want;
                if (killHit[h.b] === h) t = Math.max(t, onMax[h.b] + (riding(h.b) ? C.EPS_SAME_CAV : C.EPS_SAME), ownMax[h.b] + C.EPS);
                if (h.at !== t) moved = true;
                h.at = t;
                if (deathTick[h.a] == null || h.tick < deathTick[h.a]) lw[h.a] = Math.max(lw[h.a], t); // 자기가 쓰러지는 틱의 타격(맞교환)은 제약에서 제외 -> 순환(서로 쓰러뜨림) 방지
                if (killHit[h.b] !== h) lo[h.b] = Math.max(lo[h.b], t);
            });
            ownMax = lw; onMax = lo;
            if (!moved) break;
        }
        // 같은 틱 맞교환: 쓰러지는 틱에 친 타격보다 쓰러짐이 먼저 오지 않게, 쓰러뜨리는 타격을 그 시각까지 늦춘다(간격 없이 같게 -> 서로 쓰러뜨려도 수렴, 시각은 늘기만 해 순서 제약 유지)
        for (let pass = 0; pass < 6; pass += 1) {
            let moved = false;
            hits.forEach((h) => {
                const kh = killHit[h.a];
                if (kh && deathTick[h.a] === h.tick && h.at > kh.at) { kh.at = h.at; moved = true; }
            });
            if (!moved) break;
        }
    };
    // 접근 경로 생성(정해진 타격 시각 기준) -> 도착이 늦은 타격은 도착 시각으로 미루고 다시 정합(최대 4회)
    const buildApproach = () => {
        let late = false;
        movers.forEach((e) => {
            const v = roles[e.side] === 'hero' ? VH : VW;
            e.ctrk = [{ t: 0, x: e.x0, y: e.y0 }];
            const p0 = stand[e.i];
            moveTo(e.ctrk, startOf(e), p0.x, p0.y, v, heroE(e) ? 0 : bendOf(e, 19));
            let cur = p0;
            own[e.i].forEach((h, j) => {
                const sp = spotOf(e, h, j);
                let arr;
                if (j > 0 && Math.hypot(sp.x - cur.x, sp.y - cur.y) > 1) { // 대상이 바뀜: 앞 타격 뒤 옮겨 붙는다
                    arr = moveTo(e.ctrk, own[e.i][j - 1].at + C.HIT_HOLD, sp.x, sp.y, v, bendOf(e, 23 + j) * 0.5);
                    cur = sp;
                } else arr = e.ctrk[e.ctrk.length - 1].t;
                if (arr > h.want + 0.5) { h.want = arr; late = true; }
            });
        });
        return late;
    };
    for (let it = 0; it < 4; it += 1) { settle(); if (!buildApproach()) break; }
    settle();
    buildApproach(); // 최종 시각 기준 경로
    ents.forEach((e) => { e.deadMs = killHit[e.i] ? killHit[e.i].at : null; });
    const lastAt = hits.reduce((a, h) => Math.max(a, h.at), C.HOLD_MS);
    ents.forEach((e) => { if (deathTick[e.i] != null && e.deadMs == null) e.deadMs = lastAt; }); // 사망 기록만 있고 타격 없음
    // ---- 복귀: 일제 타격 구간이 끝나면 양측이 같은 타이밍에 각자 제자리로(기병은 관통 직후) ----
    const strikeEnd = hits.filter((h) => !riding(h.a)).reduce((a, h) => Math.max(a, h.at), strikeBase);
    let endMs = lastAt + C.TAIL_HIT_MS;
    ents.forEach((e) => {
        const last = e.ctrk[e.ctrk.length - 1];
        if (last.x === e.x0 && last.y === e.y0) return; // 움직이지 않음
        const r = roles[e.side];
        const ownLast = own[e.i].reduce((a, h) => Math.max(a, h.at), -1e9);
        const s = e.rush ? e.chargeEnd // 영웅 질주: 끝에서 바로 반전
            : e.chargeEnd != null ? e.chargeEnd + C.CAV_PAUSE + stag(e.i, 7) : Math.max(strikeEnd + C.HOLD_AFTER + stag(e.i, 9), last.t);
        const t1 = moveTo(e.ctrk, s, e.x0, e.y0, e.rush ? Math.min(C.HERO_RETURN_MAX, VH * C.HERO_RUN_SCALE * C.HERO_RETURN_SCALE) : r === 'cav' ? VC : r === 'hero' ? VH : VW, e.chargeEnd != null ? 0 : bendOf(e, 29));
        if (e.deadMs == null || e.deadMs > t1) endMs = Math.max(endMs, t1);
    });
    const deaths = ents.filter((e) => e.deadMs != null).map((e) => ({ ms: e.deadMs, i: e.i })).sort((p, q) => p.ms - q.ms);
    if (deaths.length) endMs = Math.max(endMs, deaths[deaths.length - 1].ms + C.KNOCKBACK_MS + C.TAIL_DEATH_MS);
    // 사망 넉백(연출 전용): 쓰러진 위치에서 공격자 반대쪽으로. 착지 x 는 필드 안(clampField)
    const vary = (i, salt) => 0.8 + 0.4 * hash01(i, salt);
    ents.forEach((e) => {
        if (e.deadMs == null) return;
        const pe = choreoPosAt(e, e.deadMs);
        const kh = killHit[e.i]; const pa = kh ? choreoPosAt(ents[kh.a], e.deadMs) : null;
        const sign = pa && Math.abs(pe.x - pa.x) > 1 ? Math.sign(pe.x - pa.x) : -e.dir;
        const kb = C.KNOCKBACK_SUB * vary(e.i, 31) * (heroE(e) ? C.KNOCKBACK_HERO : 1);
        const land = clampField(pe.x + sign * kb, pe.y)[0];
        e.knock = { sign, x: pe.x, y: pe.y, dx: land - pe.x, lift: C.KNOCKBACK_LIFT * vary(e.i, 37), tilt: C.KNOCKBACK_TILT_DEG * vary(e.i, 41) };
    });
    // 이동 먼지 퍼프 목록(시각 순): 10ms 표본으로 경로를 따라가며 DUST_MIN_SPEED 이상 구간의 이동 거리를 누적해 간격마다 1개
    const dust = [];
    if (C.DUST_ON) ents.forEach((e) => {
        const end = Math.min(e.deadMs ?? Infinity, endMs);
        const rider = e.chargeEnd != null;
        const step = C.APPROACH_SUB * C.DUST_STEP_RATIO * (rider ? 0.8 : 1);
        const free = { ...e, deadMs: null };
        let prev = choreoPosAt(free, 0); let acc = 0; let k = 0;
        for (let t = 10; t <= end; t += 10) {
            const q = choreoPosAt(free, t);
            const d = Math.hypot(q.x - prev.x, q.y - prev.y);
            if (d / 10 >= C.DUST_MIN_SPEED) {
                acc += d;
                if (acc >= step) {
                    acc -= step; k += 1;
                    const back = !!q.back;
                    dust.push({ t, x: q.x, y: q.y, dir: -(Math.sign(q.x - prev.x) || e.dir), k: rider ? C.DUST_RIDER_K : back ? C.DUST_RETURN_K : 1, a: back ? C.DUST_RETURN_K : 1, h: hash01(e.i * 131 + k, 53) });
                }
            }
            prev = q;
        }
    });
    dust.sort((p, q) => p.t - q.t);
    const noCounter = hits.length > 0 && !hits.some((h) => ents[h.a].side === 1) && ents.some((e) => e.side === 1 && finalHp[e.i] != null);
    const shown = hits.slice().sort((p, q) => p.at - q.at || p.ord - q.ord);
    return { choreo: true, n, roles, ents, hits: shown, deathTick, deaths, finalHp, noCounter, dust, playMs: Math.round(endMs) };
}

// 실시간 병력 표시 값(병력 단계 0~10, 패널 숫자·바). side = {before, after, isHero}(BattleCutscene buildSide)
//  HP 비율 값 = 진영 개체 HP 합이 시작(hp0Sum) -> 최종(finalSum, 서버 e) 으로 줄어든 비율만큼 before -> after (마지막 타격에서 정확히 after)
//  병사 부대: min(before - 쓰러진 병사 수, HP 비율 값) -> 병사가 쓰러지는 순간 1단계 즉시 감소, 생존 병사 피해도 비율로 반영. after 아래로는 내려가지 않음
//  영웅 부대: HP 비율 값(타격마다 연속 감소)
export function microHudValue(side, deaths, hpSum, hp0Sum, finalSum) {
    const { before, after } = side;
    if (!(before > after)) return before;
    const span = hp0Sum - finalSum;
    const p = span > 0 ? Math.min(1, Math.max(0, (hp0Sum - hpSum) / span)) : 0;
    const byHp = before - (before - after) * p;
    if (side.isHero) return byHp;
    return Math.max(after, Math.min(before - deaths, byHp));
}
