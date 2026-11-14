import Phaser from 'phaser';
import { createBattleStore } from '../store/battleStore.js';
import { terrainAt, pathTo, lineOfFire } from '../systems/grid.js';
import { terrainMod, unitType, TERRAINS, terrainAttr, terrainName, typeAlias, matchupOf } from '../data/rules.js';
import { UnitView, TILE } from '../UnitView.js';
import { tileSrc, tileTexKey, portraitKey, ensureSkinTexture, queueScope, ensureScope, ensurePortraitTex, portraitLogical, unitPortraitLogical, ensureBattleBgs, setCaptainStage, texKey, loadMapArtAssets, ensureSkillFx, manifestHas } from '../assets.js';
import { cutsceneBgGroups } from '../fx/BattleCutscene.js';
import { preloadSkillFx, playSkillSheet, anchorPoint, anchorMode } from '../fx/SkillFxSheet.js';
import { resolveSkillFxKey } from '../fx/skillFxResolve.js';
import { trackLoadProgress } from '../ui/LoadProgress.js';
import { createLoadingView } from '../ui/LoadingView.js';
import { skinImage, slice, icon } from '../ui/skin.js';
import { objIcon, objKind } from '../ui/GameIcons.js';
import { FxManager } from '../fx/FxManager.js';
import { BattleCutscene } from '../fx/BattleCutscene.js';
import { voicePreload, voiceHeroFall, voiceVictory } from '../fx/BattleVoice.js';
import { FX } from '../fx_config.js';
import { settings } from '../settings.js';
import { audio } from '../audio.js';
import { battleApi } from '../api/battleApi.js';
import { reportClientError } from '../api/clientErrors.js';
import { gameApi } from '../api/gameApi.js';
import { L, setupCamera } from '../layout.js';
import { COLOR, CSS, MIN_TOUCH, view, syncView } from '../theme.js';
import { Panel } from '../ui/Panel.js';
import { FlatPanel } from '../ui/FlatPanel.js';
import { PortraitCard } from '../ui/PortraitCard.js';
import { InfoBar } from '../ui/InfoBar.js';
import { itemEffectText } from '../systems/items.js';
import { elementInfo, resistText } from '../systems/elements.js';
import { unitDisplayName, heroLabel, unitClassName, matchupLines, matchupPair, isHeroUnit } from '../systems/names.js';
import { soldierCount, troopLabel } from '../systems/soldiers.js';
import { GroundBlend } from '../fx/GroundBlend.js';
import { UnitAnimator } from '../fx/UnitAnimator.js';
import { PropLayer } from '../fx/PropLayer.js';
import { RmGround, rmReady } from '../fx/RmGround.js';
import { tv2Diag } from '../fx/UnityGround.js';
import { MapArtLayer, PaintedGround, paintedKey, tbVillageReady, tbWallReady } from '../fx/MapArtLayer.js';
import { artCulture, mapArtOpts, normalizePainted } from '../data/mapArt.js';
import { MapBackdrop } from '../fx/MapBackdrop.js';
import { auraSources, auraAppliesTo } from '../systems/aura.js';
import { terrainTileKey } from '../systems/terrainTiles.js';
import { altSummary } from '../systems/alternate.js';
import { auraKind, auraLabel, auraDesc, AURA_COLOR, AURA_CSS } from '../systems/glossary.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { BattleDialogue } from '../ui/BattleDialogue.js';
import { matchSpeakerUnit } from '../ui/dialogueCam.js';
const DLG_PAN_MS = 320; // 대사 화자 포커스 팬 시간(1배속, 배속으로 나눔)
const DLG_ANCHOR_Y = 0.45; // 화자 세로 위치 = 상단 바 아래 ~ 대사창 윗변 사이의 45%(화면 중앙 약간 위, 대사창에 가리지 않게)
import { loadCampaign } from '../dialogue/dialogueData.js';
import { withUiImage } from '../ui/uiImage.js';
import { loadDialogueFont } from '../dialogue/dialogueFont.js';
import { CuePlayer } from '../fx/CuePlayer.js';
import { resultExtraLines, playAfterStage, cachedStage, stagesUnlockedBy, objectiveText, defeatCauseText } from '../campaign/campaignFlow.js';
import { StatBar } from '../ui/StatBar.js';
import { MiniMap } from '../ui/MiniMap.js'; // (CostMeter 행동 게이지는 2026-11-03 제거)
import { ContextMenu, ForecastBubble, UnitTip, placeNear } from '../ui/ContextMenu.js';
import { UnitInfoTip, tipEffects, tipOwnAura } from '../ui/UnitInfoTip.js'; // 유닛 정보 툴팁 재구성(2026-11-14). UnitTip 은 다른 호출 호환용으로 유지
import { activeSkillsOf, skillBlockReason, skillLabel, skillDisplayName, skillMpOf } from '../systems/skills.js';
import { SkillMenu } from '../ui/SkillMenu.js';
import { ensureSkillIcons, skillIconFrame, skillIconsListed, skillIconsReady } from '../ui/SkillIcon.js';
import { FacingPicker } from '../ui/FacingPicker.js';
import { flankOf, FLANK_LABEL, campLook } from '../systems/facing.js';
import { openSettings } from '../ui/SettingsModal.js';
import { showToast, showNotice } from '../ui/Toast.js';
import { makeText, fitText, stack, addBackdrop } from '../ui/common.js';
import { tween, wait, fx, clearRegistry, isInstant, snapAll } from '../ui/motion.js';
import { waterStateOf, moveTileKind, isNavalType } from '../systems/water.js';
import { u32AnimFrame } from '../data/unityTileset.js';
import { mountRoomChat, markRoomChatUnavailable } from '../ui/RoomChat.js';
import { BattleGuide } from '../tutorial/battleGuide.js';
import { drawMovePath, predictFollowers, drawFollowerMarks } from '../ui/MovePreview.js';
import { guidePending, conceptEligible, conceptPopup } from '../tutorial/guideFlow.js';

// 서버 판정 전투 씬: 렌더·입력만 담당. 상태는 battleStore(서버 응답), 예측은 systems/combat(참고용), 연출은 FxManager.
// 좌표계: 설계 단위(unit). 카메라 zoom = L.u. 월드(맵)는 타일 원본(assets.tileSrc: 64 우선/32 폴백)을 정수 배율 k 로 표시한다.
// 진입 data: {battleId}(FE B Deploy 씬에서 확정 후) | {stageId}(도전 생성+임시 자동 배치) | 없음(첫 해금 스테이지) | {resume:true}(설정 변경 재시작)
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
// 시즌 전쟁 결과 한 줄: result.war = true(서버 WarService 평면 필드) 또는 객체 {occupation_before/after/delta, captured} 모두 허용. 아니면 null
function warResultLine(result) {
    const w = result?.war; if (!w) return null;
    const src = typeof w === 'object' ? w : result;
    const before = Number(src.occupation_before ?? 0); const delta = Number(src.occupation_delta ?? 0); const captured = !!src.captured;
    const to = before + delta; // 점령 시 서버 occupation_after 는 0(초기화)이라 도달값은 before + delta
    if (captured) return { text: `점령도 ${before}→${to} (+${delta}) 영토 점령!`, captured, src };
    if (delta > 0) return { text: `점령도 ${before}→${to} (+${delta})`, captured, src };
    return { text: `점령도 변화 없음 (${before})`, captured, src };
}
// 시즌 전쟁 결과 상세 줄(warResultLine 아래): 기여도 획득, 순위 변화(rank_before/after {personal,country}), 보상 경험치(result.reward, 없으면 생략)
// 순위는 숫자가 작을수록 높음: 올라가면 ▲n, 내려가면 ▼n, 같으면 '-'. 값이 없으면(null) 그 순위는 생략
function warDetailLines(src, result) {
    const out = [];
    const gain = Number(src.my_contribution_gain ?? 0); const bonus = Number(src.capture_bonus_gain ?? 0);
    if (src.my_contribution_gain != null || bonus) out.push({ text: `기여도 +${gain}${bonus ? ` · 점령 보너스 +${bonus}` : ''}`, kind: 'gain' });
    const rb = src.rank_before ?? {}; const ra = src.rank_after ?? {};
    const one = (label, b, a) => {
        if (a == null) return null;
        if (b == null) return `${label} ${a}위`;
        const d = Number(b) - Number(a);
        return `${label} ${b}위→${a}위 ${d > 0 ? `▲${d}` : d < 0 ? `▼${-d}` : '-'}`;
    };
    const ranks = [one('개인 순위', rb.personal, ra.personal), one('국가 순위', rb.country, ra.country)].filter(Boolean);
    if (ranks.length) out.push({ text: ranks.join(' · '), kind: 'rank' });
    const rw = result?.reward;
    if (rw && Number(rw.exp) > 0) out.push({ text: `보상 경험치 +${Number(rw.exp).toLocaleString()}`, kind: 'exp' });
    if (rw?.blocked === 'daily_cap') out.push({ text: '오늘의 시즌 보상 한도에 도달했습니다', kind: 'cap' }); // 서버 result.reward.blocked(일일 상한 -> exp 0)
    return out;
}
const snap = (v) => Math.round(v * L.u) / L.u; // 백킹 픽셀 정렬

// 필드 전체 화면 + 반투명 플랫 HUD 오버레이. lay.map = 전체 화면(입력 zone·카메라 팬 범위), lay.fit = 카메라 기준 영역,
// lay.popup = 메뉴/말풍선/툴팁이 놓일 수 있는 영역(가장자리·HUD 에서 안쪽으로 밀어낸다).
// 가로: 상단 바(로그 버튼 포함) + 상단 중앙 안내 배너(필요할 때만, 한 줄) + 우하단 도구 + 좌하단 초상화 카드(선택 시) + 하단 한 줄 정보 바.
// 세로: 상단 바 + 도구(상단 우측) + 그 아래 안내 배너(필요할 때만) + 하단 한 줄 정보 바 + 그 위 초상화 카드.
// 시스템 알림 노출: 전투 수치는 유닛 위 플로팅 숫자(FxManager.popup), 턴 시작은 턴 배너, 행동 불가 사유·중요 로그는 상단 알림 칩(showNotice),
// 전체 행동 로그는 상단 '로그' 버튼(새 중요 알림이면 빨간 점) → 모달. 표시 양은 설정 '전투 알림'(최소 기본/보통/상세/끄기).
// (좌측 '정보' 토글/정보 패널은 제거: 칸 정보는 한 줄 정보 바, 유닛 상세는 초상화 카드)
// 전투 소모품(docs/BATTLE_ITEMS_SPEC.md 7절): 행동 메뉴 '소모품' 항목(효과 문구는 systems/items.js)
function itemMenuEntry(store, u, guard) {
    const s = store.state;
    const why = store.itemBlockReason(u);
    const owned = (s.itemCatalog ?? []).reduce((n, x) => n + Math.max(0, x.owned ?? 0), 0);
    const label = s.itemsLeft == null ? '소모품' : `소모품 ${owned ? `${owned}개` : ''}`.trim();
    return { label, icon: 'item', disabled: !!why, reason: why ?? '', onClick: guard(() => store.menu('item')) };
}

function battleLayout() {
    const { lw, lh, safe, portrait, dense } = L;
    const m = 12;
    // 상단 칩 줄(사용자 2026-11-04 '바 적당히 얇게'): 56 -> 48(터치 버튼 높이 bh + 4 이상 보장). 칩 38(이전 44)
    const bhN = Math.max(MIN_TOUCH, Math.ceil(MIN_TOUCH / (view.scale || 1)));
    const barH = Math.max(48, bhN + 4) + safe.t;
    const left = safe.l + m;
    const right = lw - safe.r - m;
    const bottom = lh - safe.b - m;
    // 강화면 gacha96: 가로 폰(L.short) 우하단 묶음(미니맵 접힘 기준)이 화면 높이 37% -> 30% 안쪽 목표. 도구 줄 46(버튼 44 터치 최소)·간격 6·'턴 종료' 44(터치 최소 유지), 접힌 미니맵 버튼은 도구 줄 왼쪽 옆
    const shortL = !portrait && L.short;
    const toolsH = shortL ? 46 : 48;
    const vGap = shortL ? 6 : 8;
    const infoH = 26; // 한 줄 정보 바 높이(30 -> 26)
    const lay = { m, barH, portrait, dense, endInBar: true, map: { x: 0, y: 0, w: lw, h: lh }, infoH, left, right, bottom };
    const aY = barH + 8;
    // 안내 배너(lay.B, 구 우측 행동 패널/세로 하단 시트 대체): 상단 중앙의 작은 한 줄 칩. 폭·높이는 refreshAction 이 내용에 맞춰 줄인다.
    // 팝업(행동 메뉴·예측 말풍선) 영역은 배너 한 줄 높이(bannerH)만큼 아래에서 시작해 배너와 겹치지 않는다.
    const bannerH = 52;
    // 2026-11-03 HUD 개편: 상단 띠(전폭 배경) 제거 -> 좌상단 턴 칩 + 우상단 로그·일시정지 버튼만 맵 위에 겹침(barH = 그 칩 줄 아래 끝).
    // 하단: 가운데 '턴 종료'(lay.endBtn, 높이 52) / 우하단 아이콘 도구 줄(미니맵·전체 보기·시점 맞춤, 정사각 48) / 그 위 미니맵(큰 맵만).
    // 한 줄 정보 바는 '턴 종료' 줄 위(lay.infoY). 행동 게이지(CostMeter)는 제거
    const btnS = 44; // 도구 버튼(정사각). 열 폭 = toolsRowW(아래)
    const endH = 44; // '턴 종료' 52 -> 44(터치 최소)
    lay.btnS = btnS; lay.toolGap = shortL ? 6 : 8;
    // 우하단 열 폭 통일(사용자 2026-11-04 '미니맵·도구 줄·턴 종료 폭이 중구난방, 가장 긴 쪽으로'): 가장 긴 요소 = 도구 줄(최대 5칸: 확대·축소·전체·맞춤·병사 추종 + 좌우 여백 6).
    //  열 폭 colW 에 '턴 종료'·도구 줄 배경·(가로) 미니맵 패널을 모두 맞추고 오른쪽 끝(right)을 같이 둔다. 도구 버튼은 열 안에 고르게 배치(buildTools)
    const toolsRowW = 5 * btnS + 4 * lay.toolGap + 12;
    // 2026-11-14 사용자 '확대 축소 같은 버튼은 모바일에서 세로로 두 줄씩 나오게 하면 왼쪽 공간이 확보': 모바일은 도구 버튼(최대 5개)을 가로 한 줄(264) 대신 격자로.
    //  가로 폰(L.short) = 3열 x 2행(폭 3x44+2x6+8 = 152 -> 열 폭 max(152, '턴 종료' ew 160~220), 높이 2x44+6+8 = 102). 2열 x 3행(높이 152)은 가로 폰 높이(논리 417~433)에서
    //   우하단 묶음이 47%까지 커져 3열 x 2행을 쓴다(열 폭 264 -> 160, '턴 종료' 왼쪽 줄 +104).
    //  좁은 세로 폰(기존 '턴 종료' 축소 조건과 같음: 열 왼쪽 줄 < 280) = 2열 x 3행(버튼 열 2x44+8 = 96, 좌우 여백 8 -> 열 폭 112, 높이 3x44+2x8+8 = 156).
    //   '턴 종료'도 열 폭 112(아이콘 22 + 6 + 라벨 약 66 = 94 < 100), 정보 띠는 격자 왼쪽(턴 종료 줄 위)으로 내려 전폭 줄 하나를 없앤다. 데스크톱·세로 태블릿은 기존 그대로
    const gridPad = 4; const portGrid = portrait && (right - left) - toolsRowW - 8 < 280; const landGrid = shortL;
    lay.cy = safe.t + Math.round((barH - safe.t) / 2); // 상단 칩 줄 세로 중심(이전 28)
    if (!portrait) {
        const cardH = L.short ? 82 : 158; // 정보 패널 124 -> 158(2026-11-06 사용자 '능력치 한 줄에 하나씩': 병력·마력·공격·수비·이동·범위 세로 6줄). 가로 폰(L.short): 선택 유닛 카드 접기(능력치 게이지 생략, 큰 초상 없음) — docs/PLAN_LANDSCAPE_PHONE.md ⑤
        const cardW = Math.min(330, Math.max(240, lw * 0.26));
        // 전투 HUD 시안(사용자 2026-11-04 참고 이미지): 우하단 세로 묶음 = 미니맵 -> 도구 줄 -> 큰 '턴 종료'. 정보 바는 하단 가운데(카드와 '턴 종료' 사이)
        const ew = Math.round(Math.min(220, Math.max(160, lw * 0.16))); const endH2 = L.short ? endH : 52;
        const gridW = 3 * btnS + 2 * lay.toolGap + 2 * gridPad; const gridH = 2 * btnS + lay.toolGap + 2 * gridPad;
        const colW = Math.min(right - left, Math.max(landGrid ? gridW : toolsRowW, ew)); lay.colW = colW;
        lay.endBtn = { x: right - colW, y: bottom - endH2, w: colW, h: endH2 };
        lay.toolsY0 = lay.endBtn.y - vGap - toolsH; // 한 줄 도구 기준 윗단: 초기 배율(kScr)·팝업 영역은 격자 전환 전과 같게 유지(카메라 배율 불변)
        lay.tools = { x: right - colW, y: landGrid ? lay.endBtn.y - vGap - gridH : lay.toolsY0, w: colW, h: landGrid ? gridH : toolsH };
        if (landGrid) lay.toolGrid = { cols: 3, rows: 2, pad: gridPad };
        lay.infoY = bottom - infoH;
        lay.infoX = { x0: left + cardW + 8, x1: lay.endBtn.x - 8 };
        lay.mini = { right, bottom: lay.tools.y - vGap, maxW: colW - 20, maxH: Math.min(120, Math.round(lh * 0.18)) }; // 시안 묶음 높이 축소(이전 130·22%)
        // 선택 유닛 카드(좌하단): 하단 정보 패널 + 위로 큰 반투명 초상(높이 상한 portMax: 데스크톱 화면 높이 34%, 최대 230.
        // 낮은 화면(논리 높이 < 600, 폰 가로 등)은 22%로 줄여 지도를 덜 가린다)
        lay.card = { x: left, y: bottom - cardH, w: cardW, h: cardH, portMax: L.short ? Math.round(Math.min(120, lh * 0.3)) : Math.round(Math.min(300, lh * (dense ? 0.28 : 0.42))) }; // 초상 상한 확대(사용자 2026-11-04 '좌하단 초상 더 크게'): 데스크톱 230/34% -> 300/42%, 가로 폰 0(생략) -> 120/30%. 유닛을 가리면 cardPortMax 가 60%·생략으로 줄인다
        lay.A = { x: left, y: aY, w: clamp(lw * 0.2, 220, 300), h: 160 }; // (사용 안 함: 정보 패널 제거, 호환용 자리)
        const bY = barH + 6;
        lay.banner = { y: bY, maxW: Math.min(640, right - left) };
        lay.B = { x: (lw - lay.banner.maxW) / 2, y: bY, w: lay.banner.maxW, h: bannerH };
        const pY = bY + bannerH + 6;
        lay.popup = { x: left, y: pY, w: right - left, h: lay.toolsY0 - 8 - pY }; // 우측 패널 제거로 전체 폭 사용(도구 줄 위까지. 가로 폰 격자는 한 줄 기준 높이 유지)
    } else {
        // 세로: 하단 줄 = '턴 종료'(남는 폭 가운데) + 우하단 아이콘 도구. 그 위 정보 바, 그 위 초상화 카드. 미니맵은 우상단(칩 줄 아래)
        // 강화면 gacha95: 도구 줄(5개)이 '턴 종료'를 덮던 문제 -> 세로 폰도 '턴 종료'(오른쪽 아래, 정보 바와 같은 줄) 위에 도구 줄을 독립 줄로
        // 열 폭 통일(위 colW): '턴 종료'를 도구 줄 폭으로 넓히면 같은 줄의 정보 띠 자리가 없어져 정보 띠는 도구 줄 위 전폭 한 줄로 올린다(gacha96·97: 정보 띠가 '턴 종료'를 덮지 않게)
        // 2026-11-14 사용자 '모바일에서 턴 종료 가로 사이즈를 줄이면': 좁은 세로(턴 종료 왼쪽 줄 < 280)는 '턴 종료'를 줄여 같은 줄 왼쪽에 압축 카드를 도킹(compactCardSlot).
        //  같은 날 격자 전환(위 portGrid): 열 폭 = 112(2열 격자·'턴 종료' 공통), 격자는 '턴 종료' 위, 정보 띠는 격자 왼쪽('턴 종료' 줄 바로 위). 도구 줄 한 줄 + 전폭 정보 띠 줄이 없어진다
        const gridW = 2 * btnS + lay.toolGap + 16; const gridH = 3 * btnS + 2 * lay.toolGap + 2 * gridPad;
        const colW = Math.min(right - left, portGrid ? gridW : toolsRowW); lay.colW = colW;
        const endW = colW; lay.endNarrow = portGrid;
        lay.endBtn = { x: right - endW, y: bottom - endH, w: endW, h: endH };
        if (portGrid) {
            lay.toolGrid = { cols: 2, rows: 3, pad: gridPad };
            lay.tools = { x: right - colW, y: lay.endBtn.y - 8 - gridH, w: colW, h: gridH };
            lay.infoY = lay.endBtn.y - 8 - infoH;
            lay.infoX = { x0: left, x1: lay.tools.x - 8 };
        } else {
            lay.tools = { x: right - colW, y: lay.endBtn.y - 8 - toolsH, w: colW, h: toolsH };
            lay.infoY = lay.tools.y - 8 - infoH;
            lay.infoX = { x0: left, x1: right };
        }
        // 초상 카드(데스크톱 마우스 세로 창의 큰 카드)·카메라 기준 영역(lay.fit)·팝업 영역은 격자 전환 전 위치(한 줄 도구 + 전폭 정보 띠 위) 그대로: 초기 배율 불변.
        //  격자와 세로로 겹치면 카드 폭만 격자 왼쪽까지로 줄인다
        const cardY0 = bottom - endH - 8 - toolsH - 8 - infoH - 8 - 158;
        lay.A = { x: left, y: aY, w: Math.min(right - left, 340), h: 160 };
        const bY = barH + 6;
        lay.banner = { y: bY, maxW: right - left };
        lay.B = { x: left, y: bY, w: right - left, h: bannerH };
        lay.mini = { right, top: barH + 6, maxW: Math.min(130, Math.round((right - left) * 0.3)), maxH: 100 };
        lay.card = { x: left, y: cardY0, w: Math.min(portGrid && cardY0 + 158 > lay.tools.y ? lay.tools.x - 8 - left : right - left, 320), h: 158 /* 124 -> 158(능력치 세로 6줄, 2026-11-06) */, portMax: Math.round(Math.min(190, lh * 0.22)) }; // 정보 패널 124 + 큰 초상 상한(모바일 화면 높이 22%, 최대 190. 이전 18%·150, 사용자 2026-11-04 '초상 더 크게')
        const pY = bY + bannerH + 6;
        lay.popup = { x: left, y: pY, w: right - left, h: lay.card.y - 8 - pY };
    }
    // 카메라 기준 영역(맞춤·초점 이동의 '화면 가운데'): 상단 칩 줄 아래 ~ 하단 카드 위(v19: 가장자리 유닛이 턴 칩·카드 밑에서 시작하던 문제)
    // 2026-11-06 카드 124 -> 158(능력치 세로 6줄)은 선택 시에만 뜨는 오버레이 변경이라 초기 배율·초점 기준은 이전 124 기준을 유지(강화면 QA: 1280x720 fit.h 530 -> 496, 칸 58.9 -> 55.1px 축소 원복)
    const fitCardY = lay.card.h === 158 ? lay.card.y + (158 - 124) : lay.card.y;
    lay.fit = { x: 0, y: barH + 6, w: lw, h: Math.max(120, fitCardY - (barH + 6)) };
    return lay;
}

// MP 방식 영웅 마력 문구: 본인 = 'mp/mp_max', 상대 = 'N%'(서버 5% 단위). short = 숫자만(정보 띠, 아이콘이 앞에 붙음), 아니면 '마력 …'
function mpTextOf(s, u, { short = false } = {}) {
    if (!s?.mpMode || !u || u.kind === 'troop') return '';
    const v = u.mp_max != null && Number(u.mp_max) > 0 && u.mp != null ? `${u.mp}/${u.mp_max}` : u.mp_pct != null ? `${u.mp_pct}%` : '';
    return v ? (short ? v : `마력 ${v}`) : '';
}

// 보조 목표 표시명: 서버 label > 유형 기본 문구(label 없는 저작 대비) > id
const SUBOBJ_TYPE_LABEL = { protect_tiles: '지정 칸 지키기', unit_survive: '아군 생존', hold_zone: '지역 확보' };
const subObjLabel = (o) => o?.label || SUBOBJ_TYPE_LABEL[o?.type] || o?.id || '';

// 결과창 영웅 이름(칭호 없이): short_name > 정식 이름. 이름 문자열이 '칭호 이름' 으로 합쳐 내려오면 칭호 접두를 뗀다(칭호 필드가 있을 때만, 모호하면 그대로)
function pureHeroName(u) {
    let n = String(heroLabel(u, { compact: true }) ?? '');
    const t = String(u?.title ?? '').trim();
    if (t && n.startsWith(`${t} `) && n.length > t.length + 1) n = n.slice(t.length + 1);
    return n || String(u?.hero ?? '?');
}

export class BattleScene extends Phaser.Scene {
    static LOAD_SLOW_MS = 15000; // 로딩 지연 안내 기준(ms)
    constructor() { super('Battle'); }

    // 전투 scope 로드(편성 화면에서 이미 받았으면 즉시). 방 모드 등 편성을 거치지 않은 진입은 여기서 진행률과 함께 받는다
    preload() {
        try { if (queueScope(this, 'battle')) trackLoadProgress(this, { title: '전장 준비' }); } catch (e) { console.warn('[battle] 전투 에셋 큐 실패(폴백)', e); }
    }

    init(data) {
        const fresh = data?.battleId || data?.stageId || data?.roomCode || data?.fresh || !BattleScene.store || !data?.resume;
        if (fresh) { BattleScene.store?.stop?.(); BattleScene.store = createBattleStore(); BattleScene.startData = { mode: data?.mode, roomCode: data?.roomCode, battleId: data?.battleId, stageId: data?.stageId, stageCode: data?.stageCode ?? null, territory: data?.territory ?? null }; }
        this.store = BattleScene.store;
        { const sc = BattleScene.startData?.stageCode ?? ''; const chN = /^stage_\d+$/.test(sc) ? 30 : Number(/^ch(\d+)_/.exec(sc)?.[1] ?? 0); if (chN) loadCampaign(chN).catch(() => {}); } // 전투 중 대사(cue·이벤트) 화자 이름표(speaker_profile) 미리 등록(코드 노출 방지, 실패해도 무시)
        setCaptainStage(BattleScene.startData?.stageCode ?? null); // 기본 부장 초상(정보 카드·컷신) stage_group 판정 + 매핑 미리 받기
        this.modalCount = 0;
        this.skillIconReq = false; // 스킬 아이콘 지연 로드 요청 1회 플래그(씬 재시작 시 초기화)
        this.pausing = false; // 씬 재시작(설정 글자 변경) 시 일시정지 팝업 잠금 해제
        this.views = new Map();
        this.drag = null;
        this.pinch = null;
        this.unsub = [];
        this.lastKey = 0;
        this.resultShown = false;
        this.leaving = false; this.lastResult = null; this.resultModal = null; this.leaveTimer = null;
        this.card = null; this.infoBar = null; this.subObjBox = null; this.subObjRect = null; this.terrPanel = null; this.minimap = null; this.subObjKey = ''; // 씬 인스턴스 재사용: 이전 실행의 파괴된 HUD 참조를 진입 시 끊는다(gacha110 2차 실행 pageerror 'reading sys') // 결과창 이동 감시(leaveWrap) 상태: 씬 인스턴스가 재사용되므로 매 진입 초기화
        this.storyQueued = new Set();
        this.storyDialogue = null;
        this.dlgCam = null; // 대사 카메라 상태(씬 인스턴스 재사용: 진입 시 초기화)
        this.deferPop = false;
        this.popupKey = '';
        this.menuCtx = null;
        this.bubble = null;
        this.tip = null;
        this.worldBuilt = false;
        this.loadingShown = false; // 로딩 화면 첫 표시 지연(200ms) 판정용, 씬 재사용 시 초기화
        this.touch = false;
        this.infoOpen = false; // 좌측 정보/로그 패널: 기본 접힘
        this.logSeen = null; // 마지막으로 처리한 store.logSeq(null = 첫 refresh 에서 현재값으로 맞춤: 재진입 시 지난 로그 알림 폭주 방지)
        this.logUnread = false; // 로그 버튼 빨간 점
        this.fieldPointers = new Set(); // 필드(zone)에서 시작한 포인터 id: 핀치는 이 둘일 때만
        this.portraitsPrimed = false;
        this.prTimer = null;
        // 초상화 도착 콜백(전역 로더 -> 이 씬): 실패(null)·비활성 씬이면 무시, 여러 장 도착은 80ms 로 묶어 1회 refresh
        this.onPortrait = (tex) => { if (!tex || this.prTimer || !this.sys.isActive()) return; this.prTimer = this.time.delayedCall(80, () => { this.prTimer = null; this.refresh(); }); };
    }

    create() {
        this.userCursor = false; // 선택 카드: 이번 전투에서 사용자가 커서를 움직이기(마우스 오버·탭·방향키) 전에는 숨김
        this.cutsceneOn = 0; // 씬 재사용: 이전 진입에서 끝나지 않은 컷신 카운트 초기화(툴팁 금지 해제)
        // 맵 개편 지연 로드 상태 초기화(정검수 M1: 로드 중 씬 재시작 시 잔존 상태로 월드가 안 만들어지던 문제). artGen 이 바뀌면 이전 로드 콜백은 무시
        this.artGen = (this.artGen ?? 0) + 1; this.artLoadingFor = null; this.artReadyFor = null; this.mapArtOverride = null; this.mapArt = null;
        const store = this.store;
        syncView();
        loadDialogueFont(); // 전투 대사(BattleDialogue) 글꼴 미리 받기(첫 이벤트 대사에서 폴백 글꼴로 그려지지 않게)
        setupCamera(this, CSS.bg);
        this.backdrop = addBackdrop(this, L.lw, L.lh);
        this.outside = new MapBackdrop(this); // 맵 바깥 배경(연장 타일 대체, depth -900, 약한 패럴랙스)
        this.input.mouse?.disableContextMenu();
        this.lay = battleLayout();

        // ---- 월드(타일맵·오버레이·유닛·연출 레이어): 팬/줌 대상 ----
        this.world = this.add.container(0, 0);
        this.tileLayer = this.add.container(0, 0);
        this.auraGfx = this.add.graphics();
        this.overlay = this.add.container(0, 0);
        this.cursor = this.add.graphics();
        this.drawCursor();
        this.unitLayer = this.add.container(0, 0);
        this.worldFx = this.add.container(0, 0);
        this.propLayer = this.add.container(0, 0); // 지형지물(소품): 타일 위, 하이라이트/유닛 아래. 입력 없음
        this.objLayer = this.add.container(0, 0); // 점령 목표 깃발·증원 예고 구역(하이라이트 위, 커서·유닛 아래). refreshObjectives
        this.objFlags = [];
        this.fgLayer = this.add.container(0, 0); // tile_layer.v2 foreground(나무 윗부분 등): 유닛 위, 전투 연출 아래. UnityGround fgParent
        this.world.add([this.tileLayer, this.propLayer, this.auraGfx, this.overlay, this.objLayer, this.cursor, this.unitLayer, this.fgLayer, this.worldFx]);
        this.world.setVisible(false);

        // ---- UI 레이어(흔들림 제외) ----
        // depth 규약: 월드 -1000~50 / 입력 zone -10 / HUD 100 / 컷신 500(HUD 위, 컷신 중 HUD 입력 차단) / 모달 1000 / 토스트 2000
        this.world.setDepth(0);
        this.ui = this.add.container(0, 0).setDepth(100);
        this.cut = this.add.container(0, 0).setDepth(500);
        this.fx = new FxManager(this, {
            world: this.world, worldFx: this.worldFx, ui: this.ui, cut: this.cut,
            getView: (id) => this.views.get(id),
            removeView: (id) => { this.views.get(id)?.destroy(); this.views.delete(id); },
            getUnit: (id) => this.store.get(id),
            getState: () => this.store.state,
            aim: (attackerId, targetId, done) => this.aimFx(attackerId, targetId, done), // 적·NPC 공격 컷신 직전 대상 지정 커서
        });
        // 연출 큐가 비는 순간(fx idle) 조작 안내·오라 개념 팝업 재평가: 대사 종료 시점엔 큐가 아직 재생 중(calm=false)이라 미뤄진 팝업을 맵 탭 없이 띄운다.
        // 다음 프레임으로 미뤄 큐 처리 중 재진입을 피함(그 사이 새 연출이 들어오면 calm 판정으로 다시 미뤄짐)
        this.fx.onIdle = () => this.time.delayedCall(0, () => {
            if (!this.worldBuilt || !this.scene.isActive() || this.fx.playing) return;
            this.cues?.autoRestore?.(); // restore 없는 camera cue 뒤 시점 복귀(아군이 화면 밖에 남지 않게)
            this.guide?.update();
            this.refreshAuraBadges(this.store.state);
        });
        this.anim =new UnitAnimator(this, () => this.views, this.world); // 유닛 idle/걷기 공용 업데이트 루프
        this.cues = new CuePlayer(this); // 전투 연출 cue(say/camera/sfx/shake/fire, docs/CUTSCENE_SPEC.md)
        // 목표 패널 아래 유닛 비침(강화면 a16 Low: ch13_s2 1280 좌상단 패널이 김유신 주변 아군을 가림). 항상 전체 표시 규칙은 유지하고,
        //  살아 있는 유닛 칸이 패널 영역과 겹치면 패널을 0.3 으로 흐리게(겹침 없으면 1). 150ms 주기 점검, 씬 time 이벤트라 shutdown 시 자동 해제
        this.time.addEvent({ delay: 150, loop: true, callback: () => this.fadeObjOverUnits() });
        // 진단용(읽기 전용): window.__cue([{do:'say',text:'...'},{do:'camera',tile:[x,y]},{do:'fire',cue_id:'t',tiles:[[x,y]]},{do:'move',unit:'b5',to:[x,y]}]) 로컬 연출만 재생, window.__cueFires() 현재 불 목록
        // 진단 전역은 __qa 와 같은 게이트(개발 빌드 또는 VITE_QA_HOOKS=1 + ?debug=1)에서만 만들고 shutdown 때 지운다(정검수 Medium)
        const qaGate = (import.meta.env?.DEV || import.meta.env?.VITE_QA_HOOKS === '1') && (() => { try { return new URLSearchParams(location.search).get('debug') === '1'; } catch { return false; } })();
        if (qaGate) {
        window.__cue = (list) => this.store.debugCues(list);
        window.__cueFires = () => [...this.cues.fires.entries()].map(([id, r]) => ({ id, tiles: r.objs.length, animated: r.tweens.length }));
        // 진단용(읽기 전용): 콘솔에서 window.__unitTex() 로 유닛 텍스처 키·프레임·원본/표시 크기 확인(스프라이트 깨짐 점검)
        // 진단용: 화면의 모든 Text 객체(내용·화면 좌표·부모·depth·visible) 덤프 -> 출처 불명 글자 특정
        window.__texts = () => { const out = []; const walk = (o, path) => { (o.list ?? []).forEach((c, i) => { if (c.type === 'Text') { const m = c.getWorldTransformMatrix?.(); out.push({ text: c.text, x: Math.round(m?.tx ?? c.x), y: Math.round(m?.ty ?? c.y), parent: path, visible: c.visible && c.alpha > 0, depth: c.depth }); } if (c.list) walk(c, `${path}/${c.type}[${i}]`); }); }; walk(this.children, 'scene'); return out; };
        if (import.meta.env?.DEV) window.__tv2Diag = (opts) => tv2Diag(this, opts); // 개발 빌드 전용 진단(읽기 전용, shutdown 시 제거): 타일셋 v2 ext2 구간(obj2·fx·static2) 시트 로드·빈 프레임·애니 판정 + 4프레임 미리보기 url
        window.__unitTex = () => [...this.views.values()].filter((v) => v.sprite).map((v) => ({ id: v.id, key: v.body.texture?.key, frame: v.body.frame?.name, src: `${v.body.frame?.realWidth}x${v.body.frame?.realHeight}`, shown: `${Math.round(v.body.displayWidth)}x${Math.round(v.body.displayHeight)}`, frames: v.body.texture?.frameTotal }));
        this.events.once('shutdown', () => { delete window.__cue; delete window.__cueFires; delete window.__texts; delete window.__unitTex; });
        // 맵 개편 QA(QA 게이트 = 개발 빌드 또는 VITE_QA_HOOKS=1 + ?debug=1 에서만, 정검수 L1). 시각 전용(서버 요청·상태 변경 없음).
        // window.__mapArt({props:[...], painted_bg:{src,tile_px}, culture, gates, castle_render, ground_tone}) = 서버 데이터 없이 소품·통그림 주입 후 월드 재구성. 인자 없이 = 현재 상태
        window.__mapArt = (d) => {
            if (d && typeof d === 'object') { this.mapArtOverride = { ...(this.mapArtOverride ?? {}), ...('props' in d ? { props: d.props } : {}), ...('painted_bg' in d ? { paintedBg: d.painted_bg } : {}), ...('culture' in d ? { culture: d.culture } : {}), ...('gates' in d ? { gates: d.gates } : {}), ...('castle_render' in d ? { castleRender: d.castle_render } : {}), ...('ground_tone' in d ? { groundTone: d.ground_tone } : {}), ...('wall_style' in d ? { wallStyle: d.wall_style } : {}), ...('pier_style' in d ? { pierStyle: d.pier_style } : {}) }; this.worldBuilt = false; this.ensureWorld(); }
            const g = this.ground;
            return { on: !!mapArtOpts(settings.get(), this.store.state.map), auto: !!mapArtOpts(settings.get(), this.store.state.map)?.auto, ground: g?.style ?? null, terrain: g?.tv3 ? 'v3' : (g?.style ?? null), structCells: g?.structArt ?? 0, walls: this.mapArt?.wallCount ?? 0, villageCells: this.ground?.villageArt ?? 0, props: this.mapArt?.count ?? 0, village: this.mapArt?.villageCount ?? 0, ysorted: this.mapArt?.ups?.length ?? 0, missing: [...(this.mapArt?.missing ?? [])], loading: this.artLoadingFor ?? null };
        };
        this.events.once('shutdown', () => { delete window.__mapArt; });
        }
        // QA 훅(2026-11-03 강화면 요청): 개발 빌드 또는 VITE_QA_HOOKS=1 로 만든 빌드에서, 주소에 ?debug=1 이 있을 때만 노출. 일반 프로덕션 번들에서는 만들지 않는다
        //  window.__qa.cutscene({atkTerrain, defTerrain, distance, atkType, defType}) = 화면의 아군·적 첫 유닛으로 교전 컷신만 재생(서버 판정·상태 변경 없음)
        //  window.__qa.tooltip(unitId) = 그 유닛 툴팁(오라·상성 줄 포함)을 띄우고 줄 문구 배열 반환
        if ((import.meta.env?.DEV || import.meta.env?.VITE_QA_HOOKS === '1') && (() => { try { return new URLSearchParams(location.search).get('debug') === '1'; } catch { return false; } })()) {
            window.__qa = {
                // hit(선택): {affinity:'adv'|'dis', counterAffinity, crit, counterCrit} = 상성 리본·치명타 줄 검증용(강화면 gacha64). mutual=true 면 반격 상성도 표시
                // lostAtk/lostDef(병사 감소 수)·atkDead/defDead(격파): 쓰러짐·막힘 튕김 확인용(시각 재생만, 서버 판정 없음)
                // micro(선택): 병사 미시 교전 재생 확인. 'troops'|'hero'|'ranged'|'rout'|'survivor' = 서버 MicroCombat 실제 출력 샘플(fx/microSamples.js, QA 게이트 안 동적 import라 릴리스 번들 제외) 또는 attack.micro 객체 직접 주입.
                //  패널 HP 는 micro.hp_before -> hp_after(최대 100 가정)로 맞춘다
                cutscene: ({ atkTerrain = 'plain', defTerrain = 'plain', distance = 2, atkType: atkIn = null, defType: defIn = null, hit = null, mutual = false, lostAtk = 0, lostDef = 0, atkDead = false, defDead = false, flank = null, micro = null, qaHero = null } = {}) => { // flank: 'back'|'side' = 배후·측면 배너·흔들림 확인(방향은 항상 마주 봄)
                    // 미시 샘플 이름 재생 시 병종을 안 주면 샘플에 맞는 병종(안무형 재생은 진영 병종으로 근접·기병·원거리·영웅을 정한다. 기본 궁 vs 궁이면 영웅·보병도 제자리 사격으로 보임)
                    const SAMPLE_TYPES = { troops: ['sword', 'spear'], hero: ['sword', 'spear'], ranged: ['archer', 'sword'], rout: ['cavalry', 'sword'], survivor: ['sword', 'sword'], melee_rt: ['sword', 'spear'], cav_charge: ['cavalry', 'sword'], hero_duel: ['cavalry', 'sword'] };
                    const SAMPLE_HERO = { hero: [true, false], hero_duel: [true, true] }; // 영웅 샘플: 화면 첫 유닛이 병사여도 컷신 유닛을 영웅(kind)으로 취급(안무 역할 판정용)
                    const st = typeof micro === 'string' ? SAMPLE_TYPES[micro] : null;
                    const atkType = atkIn ?? st?.[0] ?? 'archer'; const defType = defIn ?? st?.[1] ?? 'archer';
                    if (typeof micro === 'string') return import('../fx/microSamples.js').then(({ MICRO_SAMPLES }) => (MICRO_SAMPLES[micro] ? window.__qa?.cutscene({ atkTerrain, defTerrain, distance, atkType, defType, hit, flank, micro: MICRO_SAMPLES[micro], qaHero: SAMPLE_HERO[micro] ?? null }) : `unknown sample: ${micro} (${Object.keys(MICRO_SAMPLES).join(', ')})`));
                    const us = this.store.state.units ?? [];
                    const a0 = us.find((u) => u.team === 'ally' && u.hp > 0); const d0 = us.find((u) => u.team === 'enemy' && u.hp > 0);
                    if (!a0 || !d0) return 'no units';
                    const sp = (u, type, left) => ({ unit: { ...u, type }, side: left ? 'left' : 'right', hp: u.hp, hpMax: u.max_hp ?? u.maxHp ?? u.hp, stats: null, portraitHero: u.hero ?? null, leader: null, displayName: unitDisplayName(u, us), shortName: unitDisplayName(u, us, { short: true }), leaderName: null, water: null });
                    try { ensureBattleBgs(this, cutsceneBgGroups([atkTerrain, defTerrain])); } catch { /* 폴백 */ } // 전장에 없는 지형 배경도 요청(도착 전이면 컷신이 도착 시 교체)
                    fx.skipping = false; // 이전 탭 넘김 상태 초기화(실제 전투는 연출 큐가 항목마다 초기화)
                    if (micro && typeof micro === 'object') { // 미시 샘플: HP 를 샘플 값으로(최대 100), 양방향 교전
                        const hb = Array.isArray(micro.hp_before) ? micro.hp_before : [100, 100]; const ha = Array.isArray(micro.hp_after) ? micro.hp_after : hb;
                        const spm = (u, type, left, i) => { const o = { ...sp(u, type, left), hp: hb[i], hpMax: 100 }; if (qaHero?.[i] && o.unit.kind === 'troop') o.unit = { ...o.unit, kind: 'hero' }; return o; };
                        return BattleCutscene.play(this, this.cut ?? this.ui, { attacker: spm(a0, atkType, true, 0), defender: spm(d0, defType, false, 1), terrain: defTerrain, terrainAtk: atkTerrain, flank: flank === 'back' || flank === 'side' ? flank : null, distance, hit: hit && typeof hit === 'object' ? hit : null, micro,
                            onTap: () => { if (settings.get().cutTapSkip !== false) { fx.skipping = true; snapAll(); } },
                            result: { mutual: true, dmgToDef: hb[1] - ha[1], dmgToAtk: hb[0] - ha[0], defenderDead: ha[1] <= 0, attackerDead: ha[0] <= 0, hpAfterDef: ha[1], hpAfterAtk: ha[0] } });
                    }
                    return BattleCutscene.play(this, this.cut ?? this.ui, { attacker: sp(a0, atkType, true), defender: sp(d0, defType, false), terrain: defTerrain, terrainAtk: atkTerrain, flank: flank === 'back' || flank === 'side' ? flank : null, distance, hit: hit && typeof hit === 'object' ? hit : null, onTap: () => { if (settings.get().cutTapSkip !== false) { fx.skipping = true; snapAll(); } }, // 실제 전투(FxManager.skip)와 같은 탭 넘김(강화면 gacha84: 훅은 탭이 무시됐음)
                        result: { mutual: !!mutual, dmgToDef: lostDef || defDead ? 1 : 0, dmgToAtk: lostAtk || atkDead ? 1 : 0, soldiersLostDef: defDead ? 99 : lostDef, soldiersLostAtk: atkDead ? 99 : lostAtk, defenderDead: !!defDead, attackerDead: !!atkDead } });
                },
                card: () => ({ ...(this.cardState ?? {}), shown: !!this.card?.visible, touch: !!this.touch }), // 선택 카드 표시 상태(강화면 gacha78)
                // 스킬 이펙트 시트 강제 재생(시각 전용, 서버 요청·상태 변경 없음): skillFx('aoe','fire', x?, y?) = 칸(x,y, 생략 시 화면 첫 적 유닛 칸) 앵커에 fx.skill.<family>.<variant> 1회.
                //  variant 생략 = 계열 기본값. 시트가 아직 없으면 지연 로드 후 재생. 반환 Promise<{key, played}>
                skillFx: (family, variant = null, x = null, y = null) => new Promise((resolve) => {
                    const key = resolveSkillFxKey({ family, variant, stat: variant, radius: variant === 'area' ? 1 : 0 }, (k) => !!this.textures.exists(texKey(k)) || manifestHas(k));
                    if (!key) { resolve({ key: null, played: false, error: `unknown fx.skill.${family}.${variant ?? '*'}` }); return; }
                    const tu = x != null && y != null ? { x: Number(x), y: Number(y) } : (this.store.state.units ?? []).find((u) => u.team === 'enemy' && u.hp > 0) ?? (this.store.state.units ?? [])[0];
                    if (!tu) { resolve({ key, played: false, error: 'no tile' }); return; }
                    const go = () => { fx.skipping = false; const pt = anchorPoint(null, anchorMode(key), { x: tu.x, y: tu.y }); resolve({ key, played: playSkillSheet(this.fx, key, pt.x, pt.y), at: [tu.x, tu.y] }); };
                    if (this.textures.exists(texKey(key))) go(); else if (!ensureSkillFx(this, [key], go)) go();
                }),
                tooltip: (unitId) => {
                    const u = this.store.get(unitId); if (!u) return 'no unit';
                    const extra = [...this.auraLines(u), ...this.matchupTipLines(u)];
                    this.tip?.destroy();
                    this.tip = new UnitTip(this, { anchor: this.anchorOf(u), bounds: { x: 0, y: 0, w: L.lw, h: L.lh }, unit: u, name: unitDisplayName(u, this.store.state.units), extra });
                    this.ui.add(this.tip);
                    return extra.map((l) => l.text);
                },
                // 대사 카메라 확인(시각 전용, 서버 요청·완료 기록 없음): dialogue(lines?) = 시험 대사 재생. lines 생략 시 [아군 첫 영웅, 캡션, 적 첫 영웅, 시오리] 4줄.
                //  dialogueCam() = 현재 상태 {active, key, unit, scale, world, covers(맵이 화면을 덮는지), unitScreen(포커스 유닛 화면 좌표 / 화면 크기 비율)}
                dialogue: (lines = null) => {
                    const us = (this.store.state.units ?? []).filter((u) => u.hp > 0 && u.kind !== 'troop');
                    const code = (u) => (typeof u?.hero === 'string' ? u.hero : u?.hero?.code ?? u?.npc_ref ?? null);
                    const a = us.find((u) => u.team === 'ally' && code(u)); const e = us.find((u) => u.team === 'enemy' && code(u));
                    const list = Array.isArray(lines) ? lines : [
                        a && { speaker: `hero:${code(a)}`, text: '아군 화자 줄입니다. 카메라가 이 유닛으로 이동합니다.' },
                        { speaker: 'caption', text: '캡션 줄: 맵 채움 기본 뷰.' },
                        e && { speaker: `hero:${code(e)}`, text: '적 화자 줄입니다. 다음 화자 유닛으로 이동합니다.' },
                        { speaker: 'shiori', text: '시오리 줄: 맵 위 유닛 없음 -> 기본 뷰.' },
                    ].filter(Boolean);
                    this.storyDialogue?.close();
                    if (this.dlgCam?.ending) this.dlgCamFinish(this.dlgCam); // 이전 대사 복귀 중이면 즉시 끝내고 새로 시작
                    this.storyDialogue = new BattleDialogue(this, { event_id: 'qa', name: 'QA 대사 카메라', dialogue: list }, () => { this.storyDialogue = null; this.dlgCamEnd(() => {}); });
                    return list.map((l) => l.speaker);
                },
                dialogueCam: () => {
                    const c = this.dlgCam; const w = this.world; const m = this.store.state.map;
                    const u = c?.unitId != null ? this.store.get(c.unitId) : null;
                    const W = m.w * TILE * w.scaleX; const H = m.h * TILE * w.scaleY;
                    const sx = u ? w.x + (u.x + 0.5) * TILE * w.scaleX : null; const sy = u ? w.y + (u.y + 0.5) * TILE * w.scaleY : null;
                    return { active: !!c, key: c?.key ?? null, unit: u?.id ?? null, k: this.k, scale: +w.scaleX.toFixed(4), base: c?.base ?? null, world: { x: Math.round(w.x), y: Math.round(w.y), w: Math.round(W), h: Math.round(H) }, screen: { w: Math.round(L.lw), h: Math.round(L.lh) },
                        covers: w.x <= 0.5 && w.y <= 0.5 && w.x + W >= L.lw - 0.5 && w.y + H >= L.lh - 0.5, tileCss: Math.round((w.scaleX * TILE * L.u) / (L.R || 1)), unitScreen: u ? { x: Math.round(sx), y: Math.round(sy), fx: +(sx / L.lw).toFixed(2), fy: +(sy / L.lh).toFixed(2) } : null, tweening: !!c?.tween, zoomK: c?.zoomK ?? null };
                },
            };
            this.events.once('shutdown', () => { delete window.__qa; });
        }
        this.buildUI();
        this.buildInput();
        // 레이아웃 변경(회전/창 크기/품질 하향)은 씬 재시작 없이 제자리 재배치(선택·임시 이동·메뉴 상태는 store 에 있어 보존)
        this.onLayout = () => {
            if (this.input.manager.pointers.some((p) => p.isDown)) { this.input.once('pointerup', () => setTimeout(() => this.scene.isActive() && this.relayout(), 60)); return; }
            this.relayout();
        };
        this.game.events.on('layout', this.onLayout);
        // 앱 복귀(inputGuard 'app-wake'): 드래그·핀치·필드 포인터 고착 해제 + 전투가 끝났는데 결과창이 없거나 가려졌으면 다시 띄움(결과창 상태에서 다른 창 보고 오면 클릭 먹통 제보)
        this.onWake = () => {
            if (!this.sys?.isActive()) return;
            const panned = !!this.drag?.moved;
            this.drag = null; this.pinch = null; this.fieldPointers?.clear?.();
            if (panned) { this.popupKey = ''; this.updatePopups(); } // 팬 중 숨긴 팝업 복구
            if (this.store?.state?.status === 'finished' && this.lastResult) this.reshowResult();
        };
        this.game.events.on('app-wake', this.onWake);
        this.unsub.push(store.on('change', () => this.refresh()), store.on('event', (e) => this.onEvent(e)));
        // 튜토리얼 개편: 새 흐름 사용자의 다음 새 스테이지 전투 1회만 조작 안내(G1~G5). 방 PvP 제외. 개념 팝업은 새 흐름 사용자에게 처음 마주칠 때 1회
        this.guide = !['room', 'war'].includes(BattleScene.startData?.mode) && guidePending() ? new BattleGuide(this) : null;
        if (BattleScene.startData?.mode !== 'room' && conceptEligible()) this.unsub.push(store.on('change', () => this.guidePopups()));
        this.events.once('shutdown', () => {
            if (window.__tv2Diag) delete window.__tv2Diag; // 씬 클로저 해제(정검수 Low)
            // 열린 대사 오버레이 정리(done 미호출) + 파괴된 모달 참조 해제(재시작 후 낡은 참조로 close()/중복 차단 방지)
            this.storyDialogue?.destroy?.(); this.storyDialogue = null;
            this.altConfirmModal = this.pauseModal = this.loadSlowModal = this.loadErrModal = this.errorModal = this.authModal = null;
            this.game.events.off('layout', this.onLayout);
            this.game.events.off('app-wake', this.onWake);
            this.unsub.forEach((f) => f());
            this.input.keyboard?.removeAllListeners();
            clearRegistry();
            fx.skipping = false;
            fx.skipTurn = false;
            audio.stopBgm();
            this.hudTimer?.remove();
            this.ground?.destroy(); this.ground = null; // rm 지형 캐시 텍스처 해제(전투마다 누적 방지)
            if (this.store.state.status === 'finished') this.store.stop(); // 종료된 전투는 폴링 중단(진행 중 설정 재시작은 유지)
        });
        if (BattleScene.startData?.mode === 'room') this.hudTimer = this.time.addEvent({ delay: 1000, loop: true, callback: () => this.refreshHud() }); // 남은 턴 시간 초 단위 갱신
        // 방 채팅(방 대전만, solo 방은 서버 409 로 자동 숨김). 기본 접힘. 가로 = 우하단 도구 줄 위, 세로 = 상단 도구·안내 배너 아래 우측(battleLayout 수치 기준)
        // 2026-11-06(강화면 gacha133): 방 모드(store.state.room.mode)가 확인된 뒤에만 마운트 — pvp = 채팅, solo = chat-settings 요청 생략(409 콘솔 오류 방지)
        if (BattleScene.startData?.mode === 'room' && BattleScene.startData.roomCode) {
            const rc = BattleScene.startData.roomCode;
            let decided = false; let off = null;
            const decide = () => {
                const rm = store.state.room?.mode;
                if (decided || !rm || !this.sys?.isActive?.()) return;
                decided = true; off?.();
                if (rm === 'pvp') mountRoomChat(this, { roomCode: rc, anchor: () => (L.portrait ? { right: L.safe.r + 12, top: 56 + L.safe.t + 6 + 52 + 6 } : { right: L.safe.r + 12, bottom: L.safe.b + 12 + 48 + 8 }) });
                else markRoomChatUnavailable(rc);
            };
            off = store.on('change', decide);
            this.unsub.push(() => off?.());
            decide();
        }
        audio.bgm('bgm_battle', this); // 로비 프리페치가 안 끝났으면 여기서 받고, 받기 전엔 무음(받은 뒤에도 원하는 트랙일 때만 재생)
        const s = store.state;
        if (s.status === 'loading' && !store.started) { store.started = true; store.start(BattleScene.startData ?? {}); }
        else if (s.status === 'error' && !s.battleId) this.showLoadError({ message: s.error?.message, code: s.error?.code, retry: s.error?.retry }); // 진입 실패 상태로 재시작(레이아웃 변경 등): 안내 다시 표시
        else if (s.status !== 'loading') {
            this.ensureWorld();
            this.cues.onSync(); // 씬 재시작(레이아웃 변경 등): 타는 불 복원
            (s.storyEvents ?? []).forEach((event) => this.onStoryEvent(event));
            if (s.result) this.fx.enqueue((done) => { this.showResult(s.result); done(); });
        }
        this.armLoadWatch();
        this.refresh();
    }

    update(time) { this.anim?.update(time); if (this.worldBuilt) { this.cues?.tickFollow?.(); this.props?.cull(this.world); this.blend?.cull(this.world); this.ground?.cull(this.world); this.mapArt?.update(time, this.views); this.outside?.follow(this.world); this.tickWater(time); } const cutOn = (this.cut?.list?.length ?? 0) > 0; if (this.panelB && this.panelB.cutHidden !== cutOn) { this.panelB.cutHidden = cutOn; this.panelB.setAlpha?.(cutOn ? 0 : 1); } if (time - (this.ttAt ?? 0) > 200) { this.ttAt = time; this.drawTurnTimer(); } } // 컷신 재생 중 상단 안내 배너('적군 부대 행동 중' 등) 숨김

    // 수상 애니(4fps 전역 시계): 지면 애니 타일(UnityGround.tick)·배 오버레이 프레임·목표 깃발 프레임을 같은 f 로 갱신
    tickWater(time) {
        const f = u32AnimFrame(time);
        this.ground?.tick?.(time);
        const still = isInstant(); // 연출 끄기: 물결 흔들림 정지
        this.views.forEach((v) => { if (v.ship) { v.tickShip(f); v.tickBob(time, still); } });
        if (f !== this.waterF) { this.waterF = f; this.objFlags.forEach((o) => { if (o.scene) o.setFrame(f); }); }
    }

    // 퇴각 연출(unit_removed reason retreat): 지도 가장자리(가까운 좌/우) 쪽으로 걸어 나가며 페이드아웃 후 제거 + '○○ 퇴각' 알림. 사망 연출과 구분
    retreatFx(e, done) {
        const s = this.store.state;
        const death = e.reason === 'death'; // 연출용 사망: 퇴장(옆으로 빠짐) 대신 격파와 같은 쓰러짐 연출
        this.notice(death ? `${e.name} 쓰러짐` : `${e.name} 퇴각`, e.team === 'ally' ? 'info' : 'warn', 1800);
        if (death) { const hu = (e.unitIds ?? []).map((id) => this.views.get(id)?.unit).find((u) => isHeroUnit(u)); if (hu) voiceHeroFall(this, hu); } // 영웅 사망 외침(연출 끄기여도 재생, 퇴각은 없음)
        const views = (e.unitIds ?? []).map((id) => this.views.get(id)).filter(Boolean);
        if (death && views.length && !isInstant()) { let n = views.length; views.forEach((v) => this.fx.kill(v, () => { n -= 1; if (n === 0) done(); })); return; }
        if (!views.length || isInstant()) { views.forEach((v) => { v.destroy(); this.views.delete(v.id); }); done(); return; }
        const midX = (s.map.w * TILE) / 2;
        let left = views.length;
        views.forEach((v, i) => {
            const dir = v.c.x < midX ? -1 : 1;
            tween(this, { targets: v.c, to: { x: v.c.x + dir * TILE * 1.6, alpha: 0 }, duration: 650, delay: Math.min(300, i * 40), ease: 'Quad.easeIn', onComplete: () => { v.destroy(); this.views.delete(v.id); left -= 1; if (left === 0) done(); } });
        });
    }

    // 진영 전환(unit_defected): 해당 유닛 뷰를 다시 만들어 진영 색·지원 배지 갱신 + 흰 섬광 + 알림. 순간 모드면 즉시 교체
    defectFx(e, done) {
        this.notice(e.toAlly ? `${e.name} 아군 합류` : `${e.name} 적군으로 돌아섬`, e.toAlly ? 'info' : 'warn', 2000);
        const ids = e.unitIds ?? [];
        ids.forEach((id) => { const v = this.views.get(id); if (v) { v.destroy(); this.views.delete(id); } });
        this.syncViews(); // store 의 바뀐 side/team 으로 UnitView 재생성
        if (isInstant()) { done(); return; }
        const fresh = ids.map((id) => this.views.get(id)).filter(Boolean);
        fresh.forEach((v) => { v.tintWhite?.(true); this.time.delayedCall(180, () => { if (v.c?.active) v.tintWhite?.(false); }); });
        const lead = fresh[0];
        if (lead) { const r = this.add.circle(lead.c.x, lead.c.y, TILE * 0.6, 0xffffff, 0.55); this.worldFx.add(r); tween(this, { targets: r, to: { alpha: 0, scale: 1.8 }, duration: 420, onComplete: () => r.destroy() }); }
        this.time.delayedCall(450, done);
    }

    // 전투 목표 패널(사용자 2026-11-04 '디자인 + 아이콘'): 스킨 패널(panel_hud, 없으면 반투명 판) + 헤더('전투 목표' 아이콘·개수·접기/펼치기) + 항목(종류 아이콘 · 문구 · 진행/달성 표시).
    //  항목 = 승패 규칙(battle.stage_rules: all = 기본 목표 + 추가 조건 / only = 추가 조건만, lose = 패배 조건) + 보조 목표(battle.sub_objectives). 목표 문구·서버 데이터는 그대로 쓴다.
    //  색: 승리 조건 = 금색 띠, 패배 조건 = 붉은 띠, 보조 목표 = 청색 띠. 달성 = 녹색 체크 원, 실패 = 회색 X, 진행 = 'n/m'.
    //  항상 전체 표시(사용자 2026-11-04: 접기/펼치기·'외 N개' 없음). 자리가 모자라면 줄 높이 22 -> 14·글자 11 로 줄여 화면에 모두 넣는다. 가로 = 좌상단(상단 바 아래), 세로 = 안내 배너 아래(미니맵 왼쪽까지)
    refreshSubObjectives() {
        const list = this.store.state.subObjectives ?? [];
        const sr = this.store.state.stageRules;
        const rule = sr && (sr.mode === 'all' || sr.mode === 'only') ? sr : null;
        const conds = Array.isArray(rule?.conditions) ? rule.conditions : [];
        const loses = (Array.isArray(sr?.lose) ? sr.lose : []).filter((l) => typeof l === 'string' && l.trim()); // 패배 규칙만 있는 전투(mode null|'default', ch103_s5)도 표시
        this.objOpen = true; // 사용자 2026-11-04 '접기/펼치기 없애고 다 보여줘': 항상 전체 표시(토글·'외 N개' 없음)
        const key = JSON.stringify([this.store.state.status, this.objOpen, !!this.minimap?.visible, list.map((o) => [o.id, o.status, o.progress]), rule ? [rule.mode, !!rule.primary, conds.map((c) => !!c?.met)] : null, loses]);
        if (key === this.subObjKey && this.subObjBox?.scene) return;
        this.subObjKey = key;
        this.subObjBox?.destroy(); this.subObjBox = null; this.subObjRect = null;
        if ((!list.length && !rule && !loses.length) || this.store.state.status !== 'battle') return;
        // 항목 모델: {kind(아이콘), text, side('win'|'lose'|'sub'), state('met'|'failed'|'todo'), prog}
        const items = [];
        if (rule) {
            if (rule.mode === 'all') items.push({ text: objectiveText(this.store.state.objective), side: 'win', state: rule.primary ? 'met' : 'todo', kind: objKind(this.store.state.objective?.type, objectiveText(this.store.state.objective)) });
            conds.forEach((c) => items.push({ text: c?.label || '추가 조건', side: 'win', state: c?.met ? 'met' : 'todo', kind: objKind(null, c?.label) }));
        }
        list.forEach((o) => {
            const prog = o.type === 'protect_tiles' ? (o.progress > 0 ? `침범 ${o.progress}칸` : '') : o.target ? `${Math.min(o.progress ?? 0, o.target)}/${o.target}` : ''; // protect_tiles: progress = 침범 칸 수
            items.push({ text: subObjLabel(o), side: 'sub', state: o.status === 'met' ? 'met' : o.status === 'failed' ? 'failed' : 'todo', prog, kind: objKind(o.type, subObjLabel(o)) });
        });
        // 패배 조건은 마지막 고정 구역(강화면 gacha108: 높이 상한에 걸려 '외 N개'에 묻힘). 펼침 = 3개 이하 각 줄 / 4개 이상 요약 한 줄, 접힘 = 요약 한 줄
        const loseRows = loses.map((l) => ({ text: l, side: 'lose', state: 'todo', kind: 'lose' })); // 패배 조건 = 마지막 구역, 전부 각 줄
        const lay = this.lay;
        // 폭: 최대 300. 세로 폰은 우상단 미니맵 왼쪽까지(gacha108: 펼친 패널이 미니맵을 14px 덮음)
        // 폰 폭 상한(강화면 gacha110: 항상 표시 패널이 맵을 크게 가림): 세로 = 화면 55%, 가로 폰 = 35%, 데스크톱 = 300
        const phone = lay.portrait || L.short;
        let w = Math.min(300, lay.right - lay.left, lay.portrait ? Math.round(L.lw * 0.55) : L.short ? Math.round(L.lw * 0.35) : 300);
        if (lay.portrait && this.minimap?.visible) { const mr = this.minimap.rect(); w = Math.max(150, Math.min(w, mr.x - lay.left - 8)); }
        const y0 = lay.portrait ? lay.B.y + lay.B.h + 4 : lay.barH + 8;
        const box = this.add.container(lay.left, y0);
        const SIDE_COL = { win: COLOR.accent, lose: COLOR.danger, sub: 0x6fa8dc };
        const headH = phone ? 20 : 26; const pad = phone ? 6 : 8;
        // 줄 높이: 기본 22, 전부 넣을 세로 자리(세로 폰 = 카드 위까지, 가로 = 화면 아래 여백 전까지)가 모자라면 14까지 줄인다(글자 11, 아이콘 14)
        const nRows = items.length + loseRows.length;
        // 세로 자리: 세로 폰 = 카드(초상 포함 위 끝) 위까지, 가로 = 좌하단 카드 위 끝까지(gacha110: 667 패널-카드 14px 겹침), 데스크톱 = 화면 아래
        const cardTop = lay.card ? lay.card.y - (lay.card.portMax && !lay.portrait ? 0 : 0) : L.lh;
        const availH = (phone ? cardTop - 6 : L.lh - 12) - y0;
        // 줄 높이: 데스크톱 22, 폰 16(글자 11). 1열에 다 안 들어가면 2열(폭 2배, 상한 = 세로 90% / 가로 폰 70%)
        const rowMax = phone ? 16 : 22;
        let cols = 1; let rowH = Math.max(13, Math.min(rowMax, Math.floor((availH - headH - 6) / Math.max(1, nRows))));
        if (phone && nRows * 13 > availH - headH - 6) { cols = 2; w = Math.min(Math.round(L.lw * (lay.portrait ? 0.9 : 0.7)), w * 2); rowH = Math.max(13, Math.min(rowMax, Math.floor((availH - headH - 6) / Math.ceil(nRows / 2)))); }
        const fs = rowH >= 20 ? 12 : 11; const icS = rowH >= 18 ? 16 : 12;
        // 헤더: 깃발 아이콘 + '전투 목표' + 달성 수 + 접기 화살표(탭 영역 = 헤더 전체)
        const done = items.filter((it) => it.state === 'met').length; const goals = items.length; // items = 승리·보조(패배는 loseRows)
        const hdr = this.add.container(0, 0);
        hdr.add(objIcon(this, 'flag', pad + 8, headH / 2 + 1, 16));
        hdr.add(makeText(this, pad + 22, headH / 2 + 1, '전투 목표', { size: 13, heading: true, color: '#f0d58c', origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        if (goals) hdr.add(makeText(this, w - pad, headH / 2 + 1, `${done}/${goals}`, { size: 12, bold: true, color: done === goals ? CSS.allyText : CSS.muted, origin: [1, 0.5] }));
        // (접기/펼치기 화살표 제거: 항상 전체 표시)
        // 본문 행
        const shown = [...items, ...loseRows]; // 전부 표시(승리·보조 -> 패배)
        const body = this.add.container(0, headH + 2);
        const perCol = Math.ceil(shown.length / cols); const cw = Math.floor(w / cols);
        shown.forEach((it, i) => {
            const ci = Math.floor(i / perCol); const ri = i % perCol; const ox = ci * cw; const w = cw; // 열 안 좌표(행 그리기는 열 폭 w 기준)
            const cy = ri * rowH + rowH / 2;
            body.add(this.add.rectangle(ox + pad - 2, cy - rowH / 2 + 2, 3, rowH - 4, SIDE_COL[it.side], 0.95).setOrigin(0)); // 왼쪽 색 띠(승리/패배/보조)
            const ic = objIcon(this, it.kind, ox + pad + icS / 2 + 4, cy, icS, it.side === 'lose' ? COLOR.danger : null); if (ic) { if (it.state === 'failed') ic.setAlpha?.(0.45); body.add(ic); }
            const right = it.state === 'met' || it.state === 'failed' ? 20 : it.prog ? 46 : 4;
            const col = it.side === 'lose' ? CSS.dangerText : it.state === 'met' ? CSS.allyText : it.state === 'failed' ? CSS.muted : CSS.text;
            const tx = ox + pad + icS + 10; body.add(fitText(makeText(this, tx, cy, it.text, { size: fs, bold: it.state === 'met', color: col, origin: [0, 0.5] }), Math.max(30, w - (tx - ox) - right - pad)));
            if (it.state === 'met') { const g = this.add.graphics(); const cx = ox + w - pad - 8; g.fillStyle(0x3fae5a, 1).fillCircle(cx, cy, 7).lineStyle(2, 0xffffff, 1).lineBetween(cx - 3.5, cy, cx - 1, cy + 3).lineBetween(cx - 1, cy + 3, cx + 4, cy - 3); body.add(g); }
            else if (it.state === 'failed') { const g = this.add.graphics(); const cx = ox + w - pad - 8; g.lineStyle(2, 0x8a93a6, 1).lineBetween(cx - 4, cy - 4, cx + 4, cy + 4).lineBetween(cx + 4, cy - 4, cx - 4, cy + 4); body.add(g); }
            else if (it.prog) body.add(makeText(this, ox + w - pad, cy, it.prog, { size: fs, bold: true, color: '#9FD8FF', origin: [1, 0.5] }));
        });
        const bh = perCol * rowH;
        const h = headH + 2 + bh + 4;
        // 바탕: 스킨 패널(panel_hud 9-slice, 턴 배너와 같은 금테 톤) > 반투명 판. 헤더 아래 구분선
        box.add(this.add.rectangle(0, 0, w, h, COLOR.navyDeep, phone ? 0.55 : 0.72).setOrigin(0)); // 판(폰은 반투명 0.55: 아래 맵·유닛이 비쳐 보이게, gacha110)
        box.add(slice(this, 'panel_hud', w, h, 'panel').setAlpha(phone ? 0.6 : 0.95)); // 아틀라스 panel.hud(없으면 코드 스킨 panel)
        box.add(this.add.rectangle(pad, headH, w - pad * 2, 1, COLOR.accent, 0.35).setOrigin(0));
        box.add([hdr, body]);
        // 입력 비차단(강화면 gacha110 High: 패널이 아래 아군 유닛 탭을 막음): 상호작용 객체 없음 + overUi 판정에서도 제외 -> 패널 위 탭은 아래 맵 칸·유닛으로 통과
        this.ui.add(box);
        this.subObjBox = box;
        this.subObjRect = { x: lay.left, y: y0, w, h }; // cardSlot: 좌상단 카드가 목표 패널과 겹치지 않게 그 아래로
        if (this.card?.scene && this.card.visible) this.refreshCard(); // 패널 높이가 바뀌면 초상 상한(cardPortMax: 패널 아래 끝까지)을 다시 계산(gacha111: 667 초상-패널 60px 겹침)
    }

    // 목표 패널이 유닛 칸(화면 좌표, anchorOf)과 겹치면 흐리게. 입력은 원래 통과(상호작용 없음)
    fadeObjOverUnits() {
        const box = this.subObjBox; const R = this.subObjRect;
        if (!box?.scene || !R || !this.worldBuilt || !this.world?.visible) return;
        const over = (this.store.state.units ?? []).some((u) => {
            if (!(u.hp > 0) || !Number.isFinite(u.x) || !Number.isFinite(u.y)) return false;
            const a = this.anchorOf(u);
            return a.x < R.x + R.w && a.x + a.w > R.x && a.y < R.y + R.h && a.y + a.h > R.y;
        });
        const to = over ? 0.3 : 1;
        if (box.objFadeTo === to) return;
        box.objFadeTo = to;
        this.tweens.killTweensOf(box);
        if (isInstant()) box.setAlpha(to);
        else this.tweens.add({ targets: box, alpha: to, duration: 180 });
    }

    // 지형 변경 칸 재렌더(cue terrain_change / tile_patch). unity32 지면 = UnityGround.patchCells, 그 외(rm·legacy) = 칸 이미지 덮기.
    // 이동 범위는 매번 s.map.tiles 로 계산(store 가 갱신)하므로 별도 캐시 무효화 불필요. flash: 짧은 흰 번쩍임
    applyTilePatch(list, { flash = false } = {}) {
        if (!this.worldBuilt || !Array.isArray(list) || !list.length) return;
        if (typeof this.ground?.patchCells === 'function') this.ground.patchCells(list);
        else list.forEach(({ x, y, to }) => { const key = tileTexKey(this, to) ?? tileTexKey(this, 'plain'); if (key) this.tileLayer.add(this.add.image(x * TILE, y * TILE, key).setOrigin(0).setDisplaySize(TILE, TILE)); });
        if (!flash || isInstant()) return;
        list.forEach(({ x, y }) => {
            const r = this.add.rectangle(x * TILE, y * TILE, TILE, TILE, 0xffffff, 0.75).setOrigin(0);
            this.worldFx.add(r);
            tween(this, { targets: r, to: { alpha: 0 }, duration: 420, onComplete: () => r.destroy() });
        });
    }

    // 서버 상태가 도착하면 월드 구성(타일·유닛)
    ensureWorld() {
        const s = this.store.state;
        if (this.worldBuilt || s.status === 'loading' || s.status === 'error') return;
        // 맵 개편(mapArt): 사용자 플래그(settings.mapArt) 또는 개편 필드(props·painted_bg·gates·castle_render·ground_tone)가 있는 맵이면 켠다(사용자가 mapArt:false 면 끔).
        // 필요한 에셋(v3 시트·이 맵의 소품 키·통그림)을 먼저 받고 월드를 1회만 만든다. 받지 못한 것은 기존 렌더로 폴백. 필드 없는 맵 + 플래그 없음 = 기존 경로 그대로
        if (this.mapArtOverride) Object.assign(s.map, this.mapArtOverride); // QA 훅 __mapArt 주입값(서버 뷰 갱신 뒤에도 유지)
        const art = mapArtOpts(settings.get(), s.map);
        const painted0 = art?.painted ? normalizePainted(s.map.paintedBg) : null;
        const painted = painted0 ? { ...painted0, key: paintedKey(painted0.src) } : null;
        if (art) {
            const want = `${painted?.src ?? ''}|${s.map.culture ?? ''}|${JSON.stringify(s.map.props ?? null)}|${JSON.stringify(s.map.castleRender ?? null)}|${s.map.wallStyle ?? ''}|${s.map.pierStyle ?? ''}`; // 필요한 에셋 묶음 식별
            if (this.artReadyFor !== want) {
                if (this.artLoadingFor === want) return;
                this.artLoadingFor = want;
                const gen = this.artGen;
                loadMapArtAssets(this, s.map, art, painted).then(() => {
                    if (gen !== this.artGen || this.artLoadingFor !== want) return; // 씬 재시작·다른 요청으로 무효
                    this.artLoadingFor = null; this.artReadyFor = want;
                    if (painted && !this.textures.exists(painted.key)) console.warn('[mapArt] 통그림 로드 실패 -> 기존 지면', painted.src);
                    if (this.sys?.isActive()) this.ensureWorld();
                });
                return;
            }
        }
        this.worldBuilt = true;
        // 교전 컷신 지형 배경: 이 전장에 있는 지형 것만 지연 로드(일괄 큐 제외, assets.ensureBattleBgs). 받기 전·실패 시 컷신은 코드 배경 폴백
        try { ensureBattleBgs(this, cutsceneBgGroups((s.map?.tiles ?? []).flat())); } catch (e) { console.warn('[battle] 컷신 배경 지연 로드 실패(폴백)', e); }
        try { voicePreload(this); } catch { /* 전투 음성 지연 로드(sfx_bv_* 약 1.16MB). 받기 전·실패 시 무음 */ }
        try { preloadSkillFx(this, s.units); } catch (e) { console.warn('[battle] 스킬 이펙트 시트 지연 로드 실패(폴백)', e); } // 전장 유닛 액티브 스킬 시트만(fx.skill.*, 받기 전·실패 시 코드 드로잉)
        if (BattleScene.startData && BattleScene.startData.t0 == null) BattleScene.startData.t0 = Date.now(); // 결과창 '소요 시간'(이 기기 기준, U24)
        this.tileLayer.removeAll(true);
        this.fgLayer.removeAll(true);
        s.map.smooth = settings.get().terrainSmooth !== false; // 지형 표현: 매끄럽게(기본)/격자
        s.map.hideObjectiveOverlay = true; // tile_layer 의 목표 깃발 덧그림(420~423)은 굽지 않음 -> refreshObjectives(objective_points + 점유 색)
        // 지형: terrainStyle 'rm'(기본) = RM 오토타일 1회 합성 캐시(fx/RmGround), 실패·'legacy' = 기존 칸별 이미지
        // 맵 밖 연장 타일은 두 모드 모두 없음(2026-11 사용자 지시) — 바깥은 MapBackdrop 배경 + 경계 테두리
        this.ground?.destroy();
        this.ground = null;
        if (painted && this.textures.exists(painted.key)) {
            try { this.ground = new PaintedGround(this, this.tileLayer, s.map, painted, art); console.info(`[terrain] painted ${painted.src} tile_px ${painted.tilePx}`); } catch (e) { console.warn('[mapArt] 통그림 지면 실패 -> 기존 지면', e); this.ground?.destroy(); this.ground = null; }
        }
        if (!this.ground && rmReady(this)) {
            const culture = artCulture(s.map, art);
            const artOpts = art ? { forceV3: true, villageArt: !!art.village && tbVillageReady(this, culture), structArt: art.walls !== false && tbWallReady(this), groundTone: s.map.groundTone ?? null } : {};
            try { this.ground = new RmGround(this, this.tileLayer, s.map, { tile: TILE, fgParent: this.fgLayer, ...artOpts }); console.info(`[terrain] ${this.ground.style ?? 'rm'} 합성 ${this.ground.chunks.length}청크 ${this.ground.opCount}조각 ${this.ground.ms}ms`); } catch (e) { console.warn('[terrain] rm 합성 실패 -> legacy', e); this.ground?.destroy(); this.ground = null; }
        }
        if (!this.ground) {
            for (let y = 0; y < s.map.h; y++) {
                for (let x = 0; x < s.map.w; x++) {
                    const code = s.map.tiles[y][x];
                    // manifest.terrainMap 기준(변형 좌표 해시, 다리 h/v·도로 연결·바이옴) -> 없으면 기존 키 규칙 -> 평지
                    const key = terrainTileKey(this, s.map, x, y) ?? tileTexKey(this, code) ?? tileTexKey(this, 'plain') ?? 'tile_plain';
                    this.tileLayer.add(this.add.image(x * TILE, y * TILE, key).setOrigin(0).setDisplaySize(TILE, TILE));
                }
            }
        }
        this.outside.makeBorder(this.tileLayer, s.map.w, s.map.h, TILE);
        if (s.tilePatch?.length) this.applyTilePatch(s.tilePatch); // 재접속: 이미 바뀐 지형(battle.cues.tile_patch) 일괄 적용
        this.blend?.destroy();
        this.blend = this.ground || settings.get().terrainSmooth === false ? null : new GroundBlend(this, this.propLayer, s.map); // 지형 경계 전이(legacy 전용)
        this.props?.destroy();
        this.props = null;
        const isPainted = this.ground instanceof PaintedGround;
        if (!isPainted) try { // 통그림 맵: 코드 소품 생략(그림에 포함)
            this.props = new PropLayer(this, this.propLayer, { ...s.map, units: s.units }); // (scene, parent, map) 유닛 칸 주변 비움용 units 포함
            // 자체 검사: 소품이 붙을 지형(숲·산 등)이 있는데 레이어가 비어 있으면 경고(시각 요소라 전투는 계속)
            const expect = s.map.tiles.some((row) => row.some((c) => c === 'forest' || c === 'mountain'));
            if (expect && this.props.count === 0) console.info('[props] 소품 0개(숲·산은 보조 소품만이라 0일 수 있음)');
            if (this.props.outside) console.warn(`[props] 맵 밖 좌표 소품 ${this.props.outside}개를 제외했습니다`);
        } catch (e) { console.warn('[props]', e); this.props = null; } // 소품 실패는 무시(시각 요소)
        this.mapArt?.destroy();
        this.mapArt = null;
        this.mapArtRing = !!(isPainted && art?.unitRing); // UnitView 생성 시 발밑 진영색 링(통그림 맵 보조 표시)
        this.views.forEach((v) => v.setFootRing?.(this.mapArtRing));
        if (art) {
            try { this.mapArt = new MapArtLayer(this, { groundParent: this.propLayer, sortParent: this.unitLayer }, s.map, art, { village: !!art.village && (this.ground?.villageArt ?? 0) > 0, walls: (this.ground?.structArt ?? 0) > 0 }); } catch (e) { console.warn('[mapArt] 소품 실패(시각 요소라 무시)', e); this.mapArt?.destroy(); this.mapArt = null; }
        }
        this.syncViews();
        this.world.setVisible(true);
        this.buildTools(); // 큰 맵 판정 가능 -> 미니맵 버튼·미니맵 추가
        this.fitMap();
        const cmd = s.units.find((u) => u.team === 'ally' && u.commander) ?? s.units.find((u) => u.team === 'ally');
        if (this.fitBox) this.focusTile(this.fitBox.x, this.fitBox.y, false); // 첫 진입: 아군+적 전체가 들어가면 그 가운데
        else if (cmd) this.focusTile(cmd.x, cmd.y, false); // 아니면 아군 지휘관 중심(기존)
        this.placeCursor(false);
        this.loading?.destroy();
        this.loading = null;
        this.dlgCamRebase(); // 대사 중 월드가 다시 만들어졌으면 대사 카메라 기준을 새 뷰로
    }

    // 큐 끝에서 호출: 모든 뷰를 store(서버 최종값)에 맞춘다
    syncViews() {
        const s = this.store.state;
        const ids = new Set();
        s.units.forEach((u) => {
            ids.add(u.id);
            let v = this.views.get(u.id);
            if (!v) { v = new UnitView(this, this.unitLayer, u); this.views.set(u.id, v); }
            v.place(u.x, u.y);
            v.setHp(u.hp, false);
            v.setActed(this.dimOf(u, s));
            v.setFacing(u.facing ?? null); // 서버 방향 시스템 off 면 null -> 마커 없음
            if (!v.look) v.setLook(campLook(u, s.units)); // 표시용 시선 초기값: 진영 대치 방향(좌/우, 2026-11-14). 서버 facing 이 있으면 위에서 이미 설정
            v.setWater(waterStateOf(u, s.map.tiles?.[u.y]?.[u.x]), u); // 수상: 서버 boarded/naval/on_water(없으면 지형 추정) -> 배 오버레이·그림자
        });
        [...this.views.keys()].forEach((id) => { if (!ids.has(id)) { this.views.get(id).destroy(); this.views.delete(id); } });
    }

    drawCursor() {
        const g = this.cursor;
        const len = 14;
        g.clear().lineStyle(4, COLOR.accent, 1);
        [[0, 0, 1, 1], [TILE, 0, -1, 1], [0, TILE, 1, -1], [TILE, TILE, -1, -1]].forEach(([x, y, sx, sy]) => {
            g.beginPath().moveTo(x + sx * len, y + sy * 2).lineTo(x + sx * 2, y + sy * 2).lineTo(x + sx * 2, y + sy * len).strokePath();
        });
        g.lineStyle(1, COLOR.text, 0.7).strokeRect(3, 3, TILE - 6, TILE - 6);
        if (settings.get().fxLevel === 0) this.tweens.add({ targets: g, alpha: 0.55, duration: 450, yoyo: true, repeat: -1 }); // 초당 3회 미만 점멸
    }

    // ================= 맵 맞춤: 타일 원본(tileSrc px)을 정수 배율 k 로 =================
    // 정수 배율 우선: 정수 k 가 영역의 72% 이상을 채우면 정수(남는 여백은 배경 패턴). 그보다 작아질 때만 최후 수단으로 NEAREST 비정수(95% 채움).
    // 64px 원본이면 1920x1080 에서 k=1(64px)로 대부분을 채우므로 비정수 경로는 32px 폴백 + 작은 화면에서만 발생한다.
    fitMap() {
        const a = this.lay.fit; // HUD 를 뺀 안전 영역 기준 초기 맞춤(팬 범위는 전체 맵: clampWorld)
        const m = this.store.state.map;
        const src = tileSrc();
        const fitW = (a.w * L.u) / (m.w * src);
        const fitH = (a.h * L.u) / (m.h * src);
        void fitW; void fitH;
        // cover: 맵이 전체 화면(HUD 는 오버레이)을 가로·세로 모두 덮는 가장 작은 정수 배율(1~4). 4 로도 못 덮는 작은 맵은 4 에서 덮지 못한 축을 가운데 정렬
        // (맵 밖은 MapBackdrop 배경). 줌아웃 하한 = cover 배율(여백이 생기지 않게), 줌인은 정수 단계.
        // (초기 배율 기준. 줌아웃 하한은 아래 contain x 0.75 로 완화 — 여백 허용)
        const cover = Math.max((L.lw * L.u) / (m.w * src), (L.lh * L.u) / (m.h * src));
        let k = Math.min(4, Math.max(1, Math.ceil(cover - 0.001)));
        let kMin = k;
        if (L.portrait || L.lw < 760) {
            // 세로 화면: cover 대신 가로 시야 하한. 가로로 보이는 칸이 6~8 이 되는 정수 배율 중 가장 큰 값(없으면 6칸 이상인 최대), 줌 하한 1(가로 약 12칸 이상)
            const cols = (n) => (L.lw * L.u) / (src * n);
            const cand = [4, 3, 2, 1].find((n) => cols(n) >= 6 && cols(n) <= 8) ?? [4, 3, 2, 1].find((n) => cols(n) >= 6) ?? 1;
            k = cand;
            kMin = 1;
        }
        // contain(전체 보기) 배율 kAll: 맵 전체가 HUD(상단 바/세로 도구 줄 = padT, 하단 카드·정보 바 = padB, 좌우 여백 m)를 뺀 영역에 들어가는 배율(비정수).
        // 줌아웃 하한 kMin = contain x 0.75(맵 주변에 여백이 생겨도 축소 허용). 모든 화면·맵 공통, 휠·핀치·버튼 같은 하한.
        // 축소 영역(정수 1 미만 또는 contain 근처)은 비정수 배율 허용(픽셀 텍스처는 NEAREST 유지), 확대 쪽은 기존 정수 단계(zoomStops).
        const usableW = Math.max(1, L.lw - 2 * this.lay.m - L.safe.l - L.safe.r);
        const usableH = Math.max(1, L.lh - this.padT() - this.padB() - 8);
        const kAll = Math.min((usableW * L.u) / (m.w * src), (usableH * L.u) / (m.h * src));
        kMin = kAll * 0.75;
        if (!(L.portrait || L.lw < 760) && this.isBigMap(m)) {
            // 가로 큰 맵(20칸 이상 등): 초기 배율은 contain 이하의 가장 큰 정수(선명), 1 미만이면 1(가장자리는 팬). 타일이 CSS 48px 미만이면 한 단계 위.
            const kInt = Math.max(1, Math.floor(kAll + 0.001));
            // 한 단계 위(kInt+1)는 세로가 HUD(padT)·하단 카드/정보 바(padB) 사이에 들어갈 때만 — 넘치면 하단 행·아군 유닛이 왼쪽 아래 카드 밑에 숨는다(v4 이슈 4)
            const fitsV = (kk) => (m.h * src * kk) / L.u <= usableH;
            k = Math.min(k, (src * kInt) / L.R < 48 && fitsV(kInt + 1) ? kInt + 1 : kInt);
        }
        // 가로 화면(Mid-6): '화면에 들어가는' 최대 정수 배율 kScr = 상단 바 아래 ~ 하단 도구 줄 위(배너·카드는 필요할 때만 뜨는 오버레이라 제외), 좌우 여백 m.
        // 작은 맵은 초기 배율도 kScr 이하(cover 정수 배율이 화면을 넘지 않게), 전체 보기는 HUD 기준 contain(비정수, unity32 면 0.5 단위로 내려 너무 작아짐) 대신 kScr 이 더 크면 kScr.
        let kScr = 0;
        if (!(L.portrait || L.lw < 760)) {
            const scrH = Math.max(1, (this.lay.toolsY0 ?? this.lay.tools.y) - 8 - this.lay.barH); // 가로 폰 도구 격자(2026-11-14)는 한 줄 기준 윗단 유지(배율 불변)
            kScr = Math.floor(Math.min((usableW * L.u) / (m.w * src), (scrH * L.u) / (m.h * src)) + 0.001);
            if (kScr >= 1 && !this.isBigMap(m)) k = Math.min(k, kScr);
        }
        // 초기 시야(하플레이 2026-11-04: 작은 맵에서 cover 배율로 아군 일부만 크게 보이고 적·위아래 유닛이 잘림): 살아 있는 아군+적 전체(+1칸 여백)가
        //  HUD 를 뺀 영역(lay.fit)에 들어가는 배율까지 낮춘다(기존 배율보다 키우지는 않음). 하한 = 타일 CSS 36px(세로·좁은 화면 30px) — 그보다 작아지면 하한에서 멈추고 지휘관 중심(기존)
        {
            const us = (this.store.state.units ?? []).filter((u) => u.hp > 0 && Number.isFinite(u.x) && Number.isFinite(u.y));
            this.fitBox = null;
            if (us.length) {
                const x0 = Math.max(0, Math.min(...us.map((u) => u.x)) - 1); const x1 = Math.min(m.w - 1, Math.max(...us.map((u) => u.x)) + 1);
                const y0 = Math.max(0, Math.min(...us.map((u) => u.y)) - 1); const y1 = Math.min(m.h - 1, Math.max(...us.map((u) => u.y)) + 1);
                const kU = Math.min((a.w * L.u) / ((x1 - x0 + 1) * src), (a.h * L.u) / ((y1 - y0 + 1) * src));
                // 하한(타일 CSS px): 세로 폰 16 / 가로 폰 22 / 좁은 화면 26 / 데스크톱 36.
                // 세로 폰은 '양 진영 전체가 가로 폭에 들어가는 칸 크기'를 우선(강화면 gacha101 High: 28 하한이면 390 stage_01(river_02 20x14, 아군 x0~1 / 적 x18~19)에서 아군 전원이 화면 밖.
                //  gacha70 도 같은 유형). 20칸 + 여백 = 390 에서 약 18px -> 16 하한 안이라 전체가 보인다
                const kRead = ((L.portrait ? 16 : L.short ? 22 : L.lw < 760 ? 26 : 36) * (L.R || 1)) / src;
                const k2 = Math.max(Math.min(k, kU), Math.min(k, kRead));
                if (kU >= k2 - 0.001) this.fitBox = { x: (x0 + x1) / 2, y: (y0 + y1) / 2 };
                else { // 하한에서도 다 안 들어가면: 두 진영 무게중심의 가운데를 목표로 하되, 아군 전원(+1칸)이 화면 안에 남는 범위로 제한(조작 안내 '아군 유닛을 눌러 선택' 시점에 아군이 보이게)
                    const cen = (arr) => (arr.length ? { x: arr.reduce((p, u) => p + u.x, 0) / arr.length, y: arr.reduce((p, u) => p + u.y, 0) / arr.length } : null);
                    const al = us.filter((u) => u.team === 'ally');
                    const ca = cen(al); const ce = cen(us.filter((u) => u.team !== 'ally'));
                    if (ca && ce) {
                        const cols = (a.w * L.u) / (src * k2); const rows = (a.h * L.u) / (src * k2); // 보이는 칸 수
                        const keep = (want, lo0, hi0, span) => { const lo = hi0 + 0.5 - span / 2; const hi = lo0 - 0.5 + span / 2; return lo <= hi ? clamp(want, lo, hi) : (lo0 + hi0) / 2; }; // 보이는 범위 [t+0.5-span/2, t+0.5+span/2] 가 [lo0, hi0+1] 를 덮게
                        const ax0 = Math.max(0, Math.min(...al.map((u) => u.x)) - 1); const ax1 = Math.min(m.w - 1, Math.max(...al.map((u) => u.x)) + 1);
                        const ay0 = Math.max(0, Math.min(...al.map((u) => u.y)) - 1); const ay1 = Math.min(m.h - 1, Math.max(...al.map((u) => u.y)) + 1);
                        this.fitBox = { x: keep((ca.x + ce.x) / 2, ax0, ax1, cols), y: keep((ca.y + ce.y) / 2, ay0, ay1, rows) };
                    } else if (ca) this.fitBox = { x: ca.x, y: ca.y };
                }
                k = k2;
            }
        }
        this.kFit = k;
        this.kMax = Math.max(k + 2, 4);
        this.kAll = Math.min(Math.max(kAll, kScr >= 1 ? kScr : 0), this.kMax);
        this.kMin = Math.min(kMin, k, this.kAll);
        // unity32: 최소 배율은 32px 도트의 정수 배(그 이하 최대값, 전체 보기보다 크지 않게). 전체 보기(kAll)는 2026-11 부터 '화면에 맞춤' 비정수 허용
        // (예전엔 정수 배로 내려 하한 32px 에 걸려 큰 맵이 작게 보였다). 비정수 배율도 지면 텍스처는 NEAREST 라 번지지 않는다(칸마다 도트 폭 ±1px 차이만).
        if (this.ground?.style === 'unity32') { const q = 32 / src; const dn = (v) => Math.max(q, Math.floor(v / q + 0.001) * q); this.kMin = Math.min(dn(this.kMin), this.kAll); }
        this.fullView = null; // 전체 보기 토글 상태(null = 꺼짐, {k, tx, ty} = 이전 배율·중심 타일)
        this.syncFullBtn();
        this.setZoomK(k);
        const w = m.w * TILE * this.world.scaleX;
        const h = m.h * TILE * this.world.scaleY;
        this.world.setPosition(snap(a.x + (a.w - w) / 2), snap(a.y + (a.h - h) / 2));
        this.clampWorld();
        this.popupKey = '';
        this.updatePopups();
    }

    setZoomK(k) {
        this.k = clamp(k, Math.min(0.5, this.kMin ?? 0.5), this.kMax);
        this.world.setScale((tileSrc() * this.k) / (TILE * L.u));
        this.tileCssPx = (tileSrc() * this.k) / (L.R || 1); // 타일 CSS 크기: 병력 배지 세그먼트/숫자 전환(UnitView.setDetail)
        this.views?.forEach((v) => v.setDetail(this.tileCssPx));
    }

    // 큰 맵 판정(가로 초기 배율):가로 20칸 이상 또는 세로 14칸 이상
    isBigMap(m) { return (m?.w ?? 0) >= 20 || (m?.h ?? 0) >= 14; }

    // 화면 중앙(안전 영역)에 있는 타일 좌표(맵 범위로 클램프)
    centerTile() {
        const a = this.lay.fit;
        const m = this.store.state.map;
        const s = this.world.scaleX * TILE;
        return { x: clamp(Math.floor((a.x + a.w / 2 - this.world.x) / s), 0, m.w - 1), y: clamp(Math.floor((a.y + a.h / 2 - this.world.y) / s), 0, m.h - 1) };
    }

    // 전체 보기 토글: 켜면 전체 보기 배율(kAll)로 맵 가운데 정렬, 끄면 이전 배율·중심 타일로 복귀
    toggleFullView() {
        if (!this.worldBuilt || this.modalCount) return;
        const m = this.store.state.map;
        if (this.fullView) {
            const prev = this.fullView;
            this.fullView = null;
            this.setZoomK(clamp(prev.k, this.kMin, this.kMax));
            this.focusTile(prev.tx, prev.ty, false);
        } else {
            if (Math.abs(this.k - this.kAll) < 0.01) { this.notice('이미 맵 전체를 보고 있습니다', 'info', 1800); return; }
            const c = this.centerTile();
            this.fullView = { k: this.k, tx: c.x, ty: c.y };
            this.setZoomK(this.kAll);
            this.focusTile((m.w - 1) / 2, (m.h - 1) / 2, false);
        }
        this.syncFullBtn();
        this.popupKey = '';
        this.updatePopups();
    }

    // 행동 게이지가 도구 줄 버튼(전체·맞춤)과 겹치지 않게 남는 폭에 맞춰 축소(최소 0.6배)
    // 좌상단 턴 칩 폭 = 아이콘 + 턴 문구(+ 교대 보조 줄·제한시간 바) 오른쪽 끝 + 여백, 로그 버튼 왼쪽까지로 제한
    fitTurnChip() {
        const c = this.turnChip; if (!c?.scene || !this.turnText?.scene) return;
        let r = this.turnText.x + this.turnText.displayWidth;
        if (this.altSub?.visible) r = Math.max(r, this.altSub.x + this.altSub.displayWidth);
        if (this.ttT?.visible) r = Math.max(r, this.ttT.x + this.ttT.displayWidth);
        const maxR = (this.logBtn?.x ?? L.lw) - 6;
        c.width = Math.max(60, Math.min(maxR, r + 12) - c.x);
        if (this.turnChipImg?.scene) { const sc = this.turnChipImg.scaleY; this.turnChipImg.setSize(Math.max(96, c.width / sc), this.turnChipImg.height); } // 3-slice 바탕도 칩 폭에 맞춤
        c.setSize(c.width, c.height);
        if (c.input?.hitArea) c.input.hitArea.setSize(c.width, c.height);
    }

    fitCostMeter() { if (this.cost && this.costAvail && this.cost.meterW > this.costAvail) this.cost.setScale(Math.max(0.6, this.costAvail / this.cost.meterW)); }

    syncFullBtn() { if (this.fullBtn?.scene) { this.fullBtn.setSelected(!!this.fullView); if (!this.fullBtn.icon) this.fullBtn.setLabel(this.fullView ? '이전' : '전체'); } } // 아이콘 전용: 전체 보기 중 = 눌림(selected) 표시, 이름은 툴팁('전체 보기'/'이전 배율')

    // 월드 위치 클램프: 맵 경계 밖으로 나가지 않는다. 맵이 화면보다 작은 축은 안전 영역 가운데 고정.
    clampPos(x, y, s = null) { // s: 계산용 배율(생략 = 현재 월드 배율. 대사 카메라 줌 트윈의 목표 배율 계산용)
        const m = this.store.state.map;
        const a = this.lay.fit;
        const w = m.w * TILE * (s ?? this.world.scaleX);
        const h = m.h * TILE * (s ?? this.world.scaleY);
        return {
            x: snap(w <= L.lw ? a.x + (a.w - w) / 2 : clamp(x, L.lw - w, 0)),
            // 세로: HUD(상단 바·하단 카드/시트) 높이만큼 패딩을 둬 가장자리 행을 HUD 밖으로 끌어낼 수 있다(바깥은 MapBackdrop 배경)
            y: snap(h <= L.lh - this.padT() - this.padB() ? this.padT() + (L.lh - this.padT() - this.padB() - h) / 2 : clamp(y, L.lh - h - this.padB(), this.padTopPan())),
        };
    }

    // 상단 패딩: 상단 바(세로는 도구 줄까지) + 안내 배너·알림 칩 한 줄(lay.B.h) — 배너·알림이 맵 첫 행·유닛을 덮지 않게 그 아래까지 맵을 내릴 수 있다
    // 세로(U19): 도구 줄과 맵 사이 빈 띠 축소 — 배너 전체 높이(52) 대신 한 줄 칩 높이(32)만 예약(버튼 달린 배너는 첫 행 위쪽 일부만 덮는다)
    // 2026-11-03: 상단 띠·배너 예약 제거 -> 칩 줄 아래만 예약(배너·알림 칩은 필요할 때 맵 위에 겹치는 반투명 오버레이)
    padT() { return this.lay.barH + 6; }
    // 위쪽 팬 여유: 좌상단 목표 패널이 있으면 그 아래까지 맵 첫 행을 끌어내릴 수 있게(v19: 첫 행 유닛이 패널 밑에 깔림)
    padTopPan() { const O = this.subObjBox?.scene && this.subObjBox.visible !== false ? this.subObjRect : null; return Math.max(this.padT(), O ? O.y + O.h + 6 : 0); }
    // 하단 패딩: 초상화 카드 + (교대 행동) 부대 칩 줄이 보이면 그 위까지 — 카드·부대 바가 맵 마지막 행을 덮지 않게
    padB() { const base = L.lh - this.lay.card.y; const st = this.squadStrip?.visible ? L.lh - this.squadStrip.y + 6 : 0; return Math.max(base, st); }

    clampWorld() {
        const p = this.clampPos(this.world.x, this.world.y);
        this.world.setPosition(p.x, p.y);
    }

    // 타일 (tx,ty) 를 안전 영역 가운데로(경계 클램프). animate 면 짧게 이동.
    focusTile(tx, ty, animate = true) {
        const a = this.lay.fit;
        const sx = this.world.scaleX;
        const p = this.clampPos(a.x + a.w / 2 - (tx + 0.5) * TILE * sx, a.y + a.h / 2 - (ty + 0.5) * TILE * sx);
        const done = () => { this.popupKey = ''; this.updatePopups(); };
        if (!animate) { this.world.setPosition(p.x, p.y); return; }
        tween(this, { targets: this.world, to: p, duration: 220, ease: 'Sine.easeInOut', onComplete: done });
    }

    // 연출 중 자동 팔로우: 대상 타일이 화면 중앙 60% 밖이면 따라간다(설정 autoFollow=false 로 끌 수 있음)
    followTile(tx, ty) {
        if (!this.worldBuilt || this.dlgCam || settings.get().autoFollow === false) return; // 대사 카메라 중에는 팔로우하지 않음
        const sx = this.world.scaleX;
        const px = this.world.x + (tx + 0.5) * TILE * sx;
        const py = this.world.y + (ty + 0.5) * TILE * sx;
        if (px > L.lw * 0.2 && px < L.lw * 0.8 && py > L.lh * 0.2 && py < L.lh * 0.8) return false;
        this.focusTile(tx, ty, true);
        return true; // 패닝함(호출부가 패닝 완료를 기다릴 수 있게)
    }

    // 적·NPC·상대 공격의 대상 지정 연출(사용자 2026-11-07 '이동 → 커서가 대상 칸으로 이동해 지정 → 컷신'): 선택 커서가 공격자 칸에서 대상 칸으로 빠르게 옮겨 가고,
    //  대상 칸에 플레이어 대상 선택과 같은 모양(금 테두리 + 적이면 머리 위 붉은 ▼)을 잠깐 표시한 뒤 커서를 원래 위치(store 커서)로 돌린다.
    //  약 0.28초(1배속, tween/wait 가 배속으로 나눔). 연출 즉시(스킵·끄기·자동 진행 skipTurn)면 생략. FxManager.attack 이 컷신 재생 직전에만 부른다
    //  강화면 실화면(2026-11-07 a7): 연속 공격에서 앞 컷신 종료 직후 프레임은 컷신 파괴·피격 후속·카메라 패닝으로 한 프레임이 수백 ms 걸린다.
    //  그 긴 프레임의 delta 가 커서 tween(120ms)·wait(160ms)를 한꺼번에 소진해 테두리가 그려진 프레임에 바로 끝났다(표시 0~1프레임).
    //  -> 시작 전 안정 대기(컷신 0·월드 카메라 tween 없음·연속 2프레임 간격 < 50ms, 최대 0.7초) + 표시 유지는 실제 시간(performance.now) 160ms 이상 AND 렌더 3프레임 이상
    aimFx(attackerId, targetId, done) {
        const a = this.views.get(attackerId); const t = this.views.get(targetId);
        if (!this.worldBuilt || !a || !t || !this.cursor?.scene || isInstant()) { done(); return; }
        let fin = false;
        let off = null; // 진행 중인 프레임 감시 해제
        const ge = this.game.events;
        const watch = (fn) => { const h = () => fn(); ge.on('postrender', h); off = () => { ge.off('postrender', h); off = null; }; };
        const onShut = () => { fin = true; off?.(); }; // 씬 종료: 감시만 해제(종료된 씬의 연출 큐는 진행하지 않음 — 기존 tween 파괴와 같은 동작)
        this.events.once('shutdown', onShut);
        const end = () => { if (fin) return; fin = true; off?.(); this.events.off('shutdown', onShut); const g = this.aimGfx; if (g?.scene) g.clear().setVisible(false); if (this.cursor?.scene) this.placeCursor(false); done(); };
        const dead = () => !this.cursor?.scene || !a.c?.scene || !t.c?.scene;
        const start = () => {
            off?.();
            if (fin) return;
            if (dead() || isInstant()) { end(); return; }
            const tile = (v) => ({ x: Math.floor(v.c.x / TILE), y: Math.floor(v.c.y / TILE) });
            const at = tile(a); const tt = tile(t);
            if (!this.aimGfx?.scene) { this.aimGfx = this.add.graphics(); this.world.addAt(this.aimGfx, this.world.getIndex(this.cursor)); } // 커서 바로 아래(유닛 아래) 층
            const g = this.aimGfx;
            g.clear().setVisible(true);
            this.cursor.setPosition(at.x * TILE, at.y * TILE);
            tween(this, { targets: this.cursor, to: { x: tt.x * TILE, y: tt.y * TILE }, duration: 120, ease: 'Sine.easeOut', onComplete: () => {
                if (fin) return;
                if (g.scene) {
                    const r = (p, ins) => [p.x * TILE + ins, p.y * TILE + ins, TILE - ins * 2, TILE - ins * 2];
                    g.fillStyle(COLOR.accent, 0.3).fillRect(...r(tt, 0)); // 확정 대상 칸(refreshOverlay 의 targetId 면)
                    g.lineStyle(4, COLOR.accent, 1).strokeRect(...r(tt, 2)); // 공격 대상 금 테두리
                    const cx = tt.x * TILE + TILE / 2; const ty = tt.y * TILE - 2;
                    g.fillStyle(COLOR.danger, 1).fillTriangle(cx - 7, ty - 10, cx + 7, ty - 10, cx, ty).lineStyle(1.5, 0x2a0a0a, 0.9).strokeTriangle(cx - 7, ty - 10, cx + 7, ty - 10, cx, ty); // 대상 ▼(refreshOverlay 와 같은 모양). 적이 아군을 노릴 때도 표시(공격받는 쪽 식별)
                }
                if (isInstant()) { end(); return; } // 탭 스킵(snapAll)으로 끝난 tween 이면 바로 종료
                // 표시 유지: 실제 시간 160ms(배속 반영) 이상 + 테두리가 실제로 렌더된 프레임 3개 이상. 탭 스킵·끄기는 즉시 종료
                const holdMs = 160 / Math.max(0.1, settings.get().speed || 1);
                const t0 = performance.now(); let frames = 0;
                watch(() => {
                    if (fin) return;
                    if (dead() || isInstant()) { end(); return; }
                    frames += 1;
                    if (frames >= 3 && performance.now() - t0 >= holdMs) end();
                });
            } });
        };
        // 안정 대기: 앞 컷신이 완전히 끝나고(cutsceneOn 0) 카메라(월드) 이동 tween 이 없으며 프레임 간격이 연속 2번 50ms 미만일 때 시작. 최대 0.7초(느린 기기에서 영구 대기 방지)
        const w0 = performance.now(); let last = w0; let calm = 0;
        watch(() => {
            if (fin) return;
            if (dead() || isInstant()) { end(); return; }
            const now = performance.now(); const dt = now - last; last = now;
            const busy = (this.cutsceneOn ?? 0) > 0 || this.tweens.isTweening(this.world) || !!this.fx?.shaking; // 컷신·카메라 패닝(focusTile)·피격 흔들림(proxy tween) 중이면 대기
            calm = !busy && dt < 50 ? calm + 1 : 0;
            if (calm >= 2 || (!busy && now - w0 > 700) || now - w0 > 1500) start();
        });
    }

    // 줌 단계: [kMin(contain x0.75), contain, (contain 미만 구간 0.5 간격 비정수), 정수 1..kMax]. 0.05 이내로 붙은 값은 하나로.
    zoomStops() {
        const lo = this.kMin ?? 1;
        const raw = [lo, this.kAll ?? lo];
        for (let v = Math.ceil(lo * 2) / 2; v < 1; v += 0.5) raw.push(v); // 1 미만 축소 구간: 0.5 단위
        for (let i = 1; i <= this.kMax; i++) raw.push(i);
        const out = [];
        // unity32: 표시 배율이 32px 도트의 정수 배인 단계만(백킹 = 디바이스 px 이면 디바이스 타일도 32 의 정수 배). 예외: 전체 보기 맞춤 배율(kAll)은 비정수라도 포함
        const q = this.ground?.style === 'unity32' ? 32 / tileSrc() : 0;
        const fitK = this.kAll;
        raw.filter((v) => v >= lo - 0.001 && v <= this.kMax + 0.001 && (!q || v === fitK || Math.abs(v / q - Math.round(v / q)) < 0.001)).sort((a, b) => a - b).forEach((v) => { if (!out.length || v - out[out.length - 1] > 0.05) out.push(v); });
        return out;
    }

    // 휠/핀치: 단계별 확대/축소(포인터 아래 지점 고정). 하한 kMin = contain x 0.75(여백 허용), 확대는 정수 단계
    zoomStep(dir, px, py) {
        const stops = this.zoomStops();
        const next = dir > 0 ? stops.find((v) => v > this.k + 0.01) : [...stops].reverse().find((v) => v < this.k - 0.01);
        if (next == null) return;
        const k = clamp(next, this.kMin, this.kMax);
        if (Math.abs(k - this.k) < 0.001) return;
        if (this.fullView) { this.fullView = null; this.syncFullBtn(); } // 수동 줌: 전체 보기 토글 해제(현재 배율이 새 기준)
        const wx = (px - this.world.x) / this.world.scaleX;
        const wy = (py - this.world.y) / this.world.scaleY;
        this.setZoomK(k);
        this.world.setPosition(snap(px - wx * this.world.scaleX), snap(py - wy * this.world.scaleY));
        this.clampWorld();
        this.popupKey = '';
        this.updatePopups();
    }

    relayout() {
        if (!this.scene.isActive()) return;
        this.fx.skip();
        // D8(모바일 성능 2026-11-14): 회전·창 크기·품질 하향 재배치에서 줌 단계·화면 중심 타일을 보존(초기 진입은 기존 fitMap 그대로).
        //  보존 기준 = 타일 CSS 크기(품질 하향으로 해상도 배율 L.R 이 바뀌어도 같은 크기) -> 새 줌 단계(정수 배율 규칙) 중 가장 가까운 값. 전체 보기(kAll) 상태면 새 kAll.
        let keep = null;
        if (this.worldBuilt && this.k != null && this.lay?.fit && this.store.state.map) {
            const a = this.lay.fit; const s = this.world.scaleX * TILE;
            keep = { css: this.tileCssPx, all: !!this.fullView || Math.abs(this.k - (this.kAll ?? -1)) < 0.01, full: this.fullView,
                tx: (a.x + a.w / 2 - this.world.x) / s - 0.5, ty: (a.y + a.h / 2 - this.world.y) / s - 0.5 };
        }
        syncView();
        setupCamera(this, CSS.bg);
        this.lay = battleLayout();
        this.backdrop.setSize(L.lw, L.lh);
        this.outside?.resize();
        this.clearPopups();
        this.ui.removeAll(true);
        this.zone?.destroy();
        this.buildUI();
        this.makeZone();
        if (this.worldBuilt) { this.fitMap(); if (keep) this.restoreView(keep); this.placeCursor(false); this.dlgCamRebase(); }
        this.popupKey = '';
        this.refresh();
        this.storyDialogue?.relayout();
    }

    // relayout 의 fitMap 직후: 직전 줌(타일 CSS 크기 기준 가장 가까운 줌 단계)·중심 타일·전체 보기 상태 복원(toggleFullView 복원 방식과 같음)
    restoreView(keep) {
        const m = this.store.state.map;
        let k = this.k;
        if (keep.all) k = this.kAll;
        else if (keep.css > 0) {
            const want = (keep.css * (L.R || 1)) / tileSrc();
            const stops = this.zoomStops();
            const dist = (v) => Math.abs(Math.log(v / want));
            if (stops.length) k = stops.reduce((b, v) => (dist(v) < dist(b) - 0.001 ? v : b), stops[0]);
        }
        this.setZoomK(clamp(k, this.kMin, this.kMax));
        if (keep.full) { this.fullView = keep.full; this.syncFullBtn(); this.focusTile((m.w - 1) / 2, (m.h - 1) / 2, false); }
        else this.focusTile(clamp(keep.tx, 0, m.w - 1), clamp(keep.ty, 0, m.h - 1), false);
    }

    // ================= UI 구성 =================
    buildUI() {
        const ui = this.ui;
        const lay = this.lay;
        const bh = Math.max(MIN_TOUCH, Math.ceil(MIN_TOUCH / view.scale));
        // 교대 행동 HUD 는 refreshHud 에서 다시 만든다(relayout 의 ui.removeAll 로 파괴된 참조 초기화)
        this.altSub = null; this.squadStrip = null; this.squadStripKey = ''; this.squadStripRect = null; this.turnTextAlt = false; this.endAltMode = undefined;
        // 상단: 전폭 띠 없음(2026-11-03). 좌상단 반투명 턴 칩(내용 폭에 맞춤: refreshHud 의 fitTurnChip) + 우상단 로그·일시정지 버튼만 맵 위에 겹친다
        const cy = lay.cy;
        this.turnChip = this.add.rectangle(L.safe.l + 12, cy - 19, 120, 38, COLOR.navyDeep, 0.86).setOrigin(0).setStrokeStyle(2, COLOR.accent, 0.95).setInteractive(); // 금테 턴 패널(시안), ui.battle.turn_panel 자산이 오면 교체 // 입력 소비(칩 아래 칸 탭 방지)
        this.turnIcon = this.add.rectangle(L.safe.l + 30, cy, 18, 18, COLOR.ally).setAngle(45).setStrokeStyle(2, COLOR.text);
        this.turnText = makeText(this, L.safe.l + 52, cy, '', { size: 24, heading: true, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } });
        ui.add([this.turnChip, this.turnIcon, this.turnText]);
        // 안아트 전투 HUD 자산(ui.battle.turn_panel)이 manifest 에 생기면 턴 패널 바탕을 이미지로(칩 사각형은 투명 입력 영역으로 남김). 없으면 금테 사각(코드)
        this.turnChipImg = null;
        withUiImage(this, 'ui.battle.ico.swords_cross', (k) => { const t = this.turnIcon; if (!t?.scene) return; const im = this.add.image(t.x, t.y, k).setDisplaySize(28, 28); this.ui.add(im); t.setVisible(false); this.turnEmblem = im; });
        withUiImage(this, 'ui.battle.turn_panel', (k) => { const c = this.turnChip; if (!c?.scene) return; const im = this.hudSlice(k, c.width, c.height, { l: 52, r: 42, t: 0, b: 0 }).setPosition(c.x, c.y); this.ui.addAt(im, this.ui.getIndex(c)); c.setFillStyle(0, 0.001).setStrokeStyle(0); this.turnChipImg = im; });
        withUiImage(this, 'ui.battle.ico.hourglass', () => { this.time.delayedCall(0, () => { if (this.sys?.isActive() && this.turnText?.scene && this.endBtn?.scene) this.refreshHud?.(); }); }); // 다음 틱: 텍스처가 이미 있으면 콜백이 buildUI 도중 즉시 불려 새 endBtn 생성 전(재배치 직후 파괴된 이전 버튼)에 refreshHud 가 돌던 원인(gacha111 pageerror 'reading sys') // 모래시계: 도착하면 턴 문구 다시 그림(남은 턴 앞)
        let bx = L.lw - L.safe.r - 12;
        const narrowBar = L.lw < 560; // 세로 휴대폰: 버튼 폭을 줄여 턴 표시와 겹치지 않게
        const pauseW = narrowBar ? 88 : 108;
        bx -= pauseW;
        ui.add(new Button(this, { x: bx, y: cy - bh / 2, w: pauseW, h: bh, label: '일시정지', size: narrowBar ? 14 : 16, onClick: () => this.openPause() }));
        // '턴 종료': 하단 가운데 큰 버튼(lay.endBtn, 높이 52 = 터치 48 이상). 교대 모드 라벨 교체는 refreshHud
        const eb = lay.endBtn;
        this.endBtn = new Button(this, { x: eb.x, y: eb.y, w: eb.w, h: Math.max(eb.h, bh), label: '턴 종료', size: 20, variant: 'primary', disabled: this.store.state.status !== 'battle' || this.store.state.side !== 'ally', onClick: () => this.requestEndTurn() }); // v19: 로딩 중 첫 프레임은 비활성(refreshHud 가 갱신)
        ui.add(this.endBtn);
        { const b = this.endBtn; const bw = b.w; const bhh = b.h;
          withUiImage(this, 'ui.battle.btn_turn_end', (k) => {
              if (!b.scene) return;
              const im = this.hudSlice(k, bw, bhh, { l: 35, r: 35, t: 0, b: 0 }).setPosition(-bw / 2, -bhh / 2);
              b.face.addAt(im, b.face.getIndex(b.ns)); b.ns.setVisible(false); b.turnEndImg = im;
              withUiImage(this, 'ui.battle.btn_turn_end.pressed', () => {}); withUiImage(this, 'ui.battle.btn_turn_end.disabled', () => { if (b.scene) b.setState(b.state); }); // 상태 텍스처 미리 받기
              const st0 = b.setState.bind(b);
              b.setState = (st) => { if (!b.scene) return b; st0(st); if (!im.scene) return b; const tk = st === 'pressed' ? texKey('ui.battle.btn_turn_end.pressed') : st === 'disabled' ? texKey('ui.battle.btn_turn_end.disabled') : k; im.setTexture(this.textures.exists(tk) ? tk : k); b.ns.setVisible(false); return b; }; // 누름·비활성 3상태
              b.setState(b.disabled ? 'disabled' : 'normal');
          });
          withUiImage(this, 'ui.battle.ico.swords_cross', (k) => { if (!b.scene) return; const sz = Math.round(bhh * 0.5); b.swordIco = this.add.image(0, 0, k).setDisplaySize(sz, sz); b.face.add(b.swordIco); this.placeEndIcon(); }); }
        // 전체 행동 로그: 평소 숨기고 버튼으로만 연다(새 중요 알림이면 빨간 점)
        // 좁은 화면(U19): 폭 48 고정 + 아이콘 단독(글자 잘림 방지). 아이콘 아틀라스가 없으면 글자 '로그'로 폴백
        const logW = narrowBar ? 48 : 72;
        bx -= logW + 8;
        this.logBtn = new Button(this, { x: bx, y: cy - bh / 2, w: logW, h: bh, label: '로그', icon: 'log', size: narrowBar ? 14 : 16, onClick: () => this.openLog() });
        if (narrowBar && this.logBtn.icon) { this.logBtn.label.setVisible(false); this.logBtn.icon.setPosition(0, -1); }
        this.logDot = this.add.circle(bx + logW - 6, cy - bh / 2 + 6, 6, COLOR.danger).setStrokeStyle(2, COLOR.text).setVisible(!!this.logUnread);
        ui.add([this.logBtn, this.logDot]);

        this.panelA = new FlatPanel(this, { x: lay.A.x, y: lay.A.y, w: lay.A.w, h: lay.A.h });
        this.panelB = new FlatPanel(this, { x: lay.B.x, y: lay.B.y, w: lay.B.w, h: lay.B.h, alpha: 0.6 }); // 상단 중앙 안내 배너(구 우측 패널)
        this.panelA.setShown(this.infoOpen);
        this.panelB.setShown(false); // v19: 로딩 첫 프레임 빈 배너 틀 번쩍임 방지(refreshAction 이 내용 있을 때 표시)
        ui.add([this.panelA, this.panelB]);
        const cd = lay.card;
        this.card = new PortraitCard(this, { x: cd.x, y: cd.y, w: cd.w, h: cd.h, portMax: cd.portMax, topLimit: this.lay.barH + 8 });
        ui.add(this.card);
        this.infoBar = new InfoBar(this); // 한 줄 정보 바(hover/탭 칸), 입력 소비 없음
        ui.add(this.infoBar);

        // 우하단 아이콘 도구 줄(정사각 버튼, 글자 없음 + 호버/길게 누르기 툴팁): [미니맵(큰 맵만)] [전체 보기 토글] [시점 맞춤]. 행동 게이지(CostMeter) 제거(2026-11-03)
        this.cost = null;
        this.buildTools();

        if (!this.worldBuilt) {
            const a = lay.map;
            this.loading?.destroy();
            void a; // 2026-11-14 로딩 화면 통일: 지도 가운데 글자 대신 로딩 화면(LoadingView 덮개·대기 바, HUD 100 위·모달 1000 아래). 재배치 때는 즉시
            this.loading = createLoadingView(this, { tagline: '전투를 불러오는 중…', overlay: true, indeterminate: true, delay: this.loadingShown ? 0 : 200 });
            this.loadingShown = true;
        }
    }

    // 우하단 아이콘 도구 줄 + 미니맵. buildUI(재배치 포함)와 월드 구성 직후(큰 맵 판정이 가능해질 때) 호출 — 이전 객체는 지우고 다시 만든다
    buildTools() {
        (this.toolObjs ?? []).forEach((o) => o?.destroy?.());
        this.toolObjs = [];
        this.minimap?.destroy(); this.minimap = null;
        this.hideTip?.();
        const lay = this.lay; const t = lay.tools; const S = lay.btnS ?? 48; const gap = lay.toolGap ?? 8;
        const m = this.store.state.map;
        const big = this.worldBuilt && !!m && this.isBigMap(m) && BattleScene.startData?.mode !== 'room'; // 방 대전은 우하단에 채팅이 있어 미니맵 생략
        const defs = [];
        defs.push({ key: 'zin', icon: 'plus', fb: '+', tip: () => '확대', onClick: () => { const a = this.lay.fit; this.zoomStep(1, a.x + a.w / 2, a.y + a.h / 2); } });
        defs.push({ key: 'zout', fb: '−', tip: () => '축소', onClick: () => { const a = this.lay.fit; this.zoomStep(-1, a.x + a.w / 2, a.y + a.h / 2); } });
        defs.push({ key: 'full', icon: 'fullview', fb: '전체', tip: () => (this.fullView ? '이전 배율' : '전체 보기'), onClick: () => this.toggleFullView() });
        defs.push({ key: 'fit', icon: 'fit', fb: '맞춤', tip: () => '시점 맞춤', onClick: () => { this.fitMap(); const c = this.store.state.cursor; this.focusTile(c.x, c.y, false); } });
        // 병사 자동 추종 토글(싱글/캠페인 + 방 옵션 follow_troops 가 켜진 방, 교대 행동은 숨김). 도구 줄 맨 왼쪽. 줄이 '턴 종료' 버튼과 겹치면(세로 좁은 화면 + 미니맵 버튼) 도구 줄 위 오른쪽 끝에 따로 둔다
        this.followBtn = null; this.followRect = null;
        this.followShown = this.followAllowed(); // refresh 에서 값이 바뀌면(방 옵션 늦게 도착) 도구 줄을 다시 만든다
        const followDef = this.followShown ? { key: 'follow', tip: () => (settings.get().followSoldiers !== false ? '병사 자동 추종 켜짐: 턴 종료 시 소속 병사가 영웅을 따라 이동' : '병사 자동 추종 꺼짐 (탭하여 켜기)'), onClick: () => { const on = settings.get().followSoldiers === false; settings.set({ followSoldiers: on }); this.followBtn?.setSelected(on); } } : null;
        let followAlone = false;
        if (followDef) {
            const W4 = (defs.length + 1) * S + defs.length * gap;
            const eb = lay.endBtn;
            followAlone = !!eb && !lay.infoX && t.x + t.w - 4 - W4 - 6 < eb.x + eb.w + 4; // 가로 화면(시안 배치)은 도구 줄이 '턴 종료' 위라 겹치지 않음
            if (!followAlone) defs.unshift(followDef);
        }
        // 열 폭(lay.colW)이 있으면 배경 = 열 전체 폭, 버튼은 그 안에 고르게(간격 = 남는 폭 / (n-1), 최소 gap). 없으면 기존(오른쪽 정렬)
        const colW = lay.colW ?? null;
        const g2 = colW && defs.length > 1 ? Math.max(gap, (colW - 12 - defs.length * S) / (defs.length - 1)) : gap;
        const W = defs.length * S + (defs.length - 1) * g2;
        const x0 = colW ? t.x + (colW - W) / 2 : t.x + t.w - 4 - W; const y = t.y + (t.h - S) / 2;
        let bx0 = colW ? t.x : x0 - 6; const bw0 = colW ? colW : W + 12;
        let by0 = t.y - 2; let bh0 = t.h + 4;
        // 모바일 도구 격자(battleLayout lay.toolGrid, 2026-11-14): 열 폭 안 가운데, 아래('턴 종료' 쪽) 정렬. 빈 칸은 맨 윗줄 왼쪽.
        //  3열(가로 폰): 5개 = [ _ 확대 축소 ] / [ 전체 맞춤 추종 ](확대·축소 같은 줄), 4개(추종 없음) = 2열 x 2행. 2열(세로 폰): [ _ 추종 ] / [ 확대 축소 ] / [ 전체 맞춤 ]
        let cellAt = null;
        const G = lay.toolGrid;
        if (G && !followAlone) {
            if (G.cols === 3 && defs[0]?.key === 'follow') defs.push(defs.shift());
            const n = defs.length; const cols = G.cols === 3 && n <= 4 ? 2 : G.cols; const rows = Math.ceil(n / cols); const e = rows * cols - n;
            const iw = cols * S + (cols - 1) * gap; const ih = rows * S + (rows - 1) * gap;
            const gx = t.x + (t.w - iw) / 2; const gy = t.y + t.h - G.pad - ih;
            cellAt = (i) => { const c = i + e; return { x: gx + (c % cols) * (S + gap), y: gy + Math.floor(c / cols) * (S + gap) }; };
            bx0 = t.x; by0 = gy - G.pad; bh0 = ih + 2 * G.pad;
        }
        const bg = this.add.rectangle(bx0, by0, bw0, bh0, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6).setInteractive();
        this.toolRect = { x: bx0, y: by0, w: bw0, h: bh0 };
        this.ui.add(bg); this.toolObjs.push(bg);
        const fy = (lay.infoY ?? t.y) - 8 - S; // 따로 둘 때: 정보 바 위 오른쪽 끝(세로 화면 미니맵은 우상단이라 겹치지 않음)
        if (followAlone) {
            const fx0 = t.x + t.w - 4 - S;
            const fbg = this.add.rectangle(fx0 - 6, fy - 4, S + 12, S + 8, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6).setInteractive();
            this.followRect = { x: fx0 - 6, y: fy - 4, w: S + 12, h: S + 8 };
            this.ui.add(fbg); this.toolObjs.push(fbg);
        }
        [...defs, ...(followAlone ? [followDef] : [])].forEach((d, i) => {
            const alone = followAlone && d === followDef;
            const cell = cellAt && !alone ? cellAt(i) : null;
            const b = new Button(this, { x: cell ? cell.x : alone ? t.x + t.w - 4 - S : x0 + i * (S + g2), y: cell ? cell.y : alone ? fy : y, w: S, h: S, label: '', icon: d.icon, size: 13, onClick: () => { d.onClick(); this.flashTip(b, d.tip()); } });
            if (d.key === 'follow') { // 아이콘: 금색 영웅(큰 원) + 청색 병사 둘 + 영웅 쪽 화살표. 켜짐 = 눌림(selected)
                const g = this.add.graphics();
                g.fillStyle(COLOR.accent, 1).fillCircle(7, -4, 6).lineStyle(2, COLOR.text, 1).strokeCircle(7, -4, 6);
                g.fillStyle(COLOR.ally, 1).fillCircle(-9, 2, 3.5).fillCircle(-5, 9, 3.5);
                g.lineStyle(2, COLOR.text, 1).lineBetween(-4, 1, 1, -2).lineBetween(1, -2, -2, -3.5).lineBetween(1, -2, 0, 1.5);
                b.face.add(g);
                b.setSelected(settings.get().followSoldiers !== false);
                this.followBtn = b;
            }
            b.arrow.setAlpha(0); // 호버 화살표(라벨 버튼용)는 아이콘을 덮으므로 숨김
            if (b.icon) b.icon.setPosition(0, -1).setDisplaySize(26, 26);
            else if (d.fb) b.setLabel(d.fb); // 아이콘 아틀라스 없음: 짧은 글자 폴백
            if (d.key === 'mini') { const g = this.add.graphics(); g.lineStyle(2, COLOR.text, 1).strokeRect(-11, -9, 22, 18).fillStyle(COLOR.ally, 1).fillCircle(-4, -2, 2.5).fillStyle(COLOR.danger, 1).fillCircle(5, 3, 2.5).lineStyle(1.5, COLOR.accent, 1).strokeRect(-7, -6, 10, 9); b.face.add(g); this.miniBtn = b; }
            if (d.key === 'zin' || d.key === 'zout') withUiImage(this, d.key === 'zin' ? 'ui.battle.ico.zoom_in' : 'ui.battle.ico.zoom_out', (k) => { if (!b.scene) return; b.icon?.setVisible(false); b.label?.setVisible(false); b.face.add(this.add.image(0, -1, k).setDisplaySize(26, 26)); });
            if (d.key === 'full') this.fullBtn = b;
            b.hit.on('pointerover', (p) => { if (!p.wasTouch) this.showTip(b, d.tip()); });
            b.hit.on('pointerout', () => this.hideTip());
            b.hit.on('pointerdown', (p) => { if (p.wasTouch) { this.tipHold?.remove(); this.tipHold = this.time.delayedCall(450, () => this.showTip(b, d.tip())); } });
            b.hit.on('pointerup', () => { this.tipHold?.remove(); this.tipHold = null; });
            this.ui.add(b); this.toolObjs.push(b);
        });
        this.syncFullBtn();
        if (big) {
            if (this.miniOn == null) { let v = null; try { v = localStorage.getItem('srpg.minimap'); } catch { /* 무시 */ } this.miniOn = v == null ? !L.short : v !== '0'; } // 가로 폰은 저장값 없으면 접힘 기본
            const mr = lay.mini;
            this.minimap = new MiniMap(this, { right: mr.right, top: mr.top, bottom: mr.bottom, maxW: mr.maxW, maxH: mr.maxH });
            this.minimap.setVisible(this.miniOn);
            this.miniBtn?.setSelected(this.miniOn);
            this.ui.add(this.minimap);
            if (!lay.portrait && lay.colW) { // 가로: 미니맵 패널을 열 폭에 맞춤(프레임 바깥 = 열 폭, 안쪽 판 = 열 폭 - 14). 지도는 비율 유지·가운데
                const mm0 = this.minimap; const inner = lay.colW - 14; const r0 = mm0.rect();
                if (r0.w < inner) { const dx = (inner - r0.w) / 2; mm0.x = lay.right - 7 - inner + 3 + dx; mm0.bg?.setPosition(-3 - dx, -3).setSize(inner, r0.h); mm0.hit?.setPosition(-3 - dx, -3).setSize(inner, r0.h); mm0.hit?.input?.hitArea?.setSize?.(inner, r0.h); mm0.panelDx = dx; const h0 = r0.h; mm0.rect = () => ({ x: mm0.x - 3 - dx, y: mm0.y - 3, w: inner, h: h0 }); } // rect = 넓힌 패널(입력 판정 overUi·접기 버튼 위치가 같이 따라옴)
            }
            { const r = this.minimap.rect(); const mm = this.minimap; const pdx = mm.panelDx ?? 0; const pw = r.w; // 패널(배경) 폭 기준 프레임(rect 가 넓힌 패널이면 그 폭)
              withUiImage(this, 'ui.battle.minimap_frame', (k) => { if (!mm.scene) return; const fr = this.hudSlice(k, pw + 14, r.h + 14, { l: 26, r: 26, t: 26, b: 26 }).setPosition(-10 - pdx, -10); mm.add(fr); mm.bg?.setStrokeStyle(0); });
              // 접기 ^: 미니맵 오른쪽 위 모서리(시안). 누르면 미니맵 접기/펼치기(도구 줄 '미니맵' 버튼과 같은 동작)
              const fs0 = 24; const fx = r.x + r.w - fs0 - 2; const fy = r.y + 2;
              const fold = this.add.container(fx, fy);
              const fbg = this.add.rectangle(0, 0, fs0, fs0, COLOR.navyDeep, 0.9).setOrigin(0).setStrokeStyle(1.5, COLOR.accent, 0.9);
              const fg = this.add.graphics(); const drawArrow = () => { fg.clear(); fg.lineStyle(2.5, COLOR.accentLight, 1); if (this.miniOn) fg.lineBetween(6, 15, 12, 9).lineBetween(12, 9, 18, 15); else fg.lineBetween(6, 9, 12, 15).lineBetween(12, 15, 18, 9); };
              drawArrow();
              const fh = this.add.rectangle(-10, -10, fs0 + 20, fs0 + 20, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
              // 접힘 위치: 세로 = 미니맵 자리 아래 끝 / 가로 = 도구 줄 왼쪽 옆(강화면 gacha96: 접어도 묶음이 미니맵 자리만큼 높게 남던 문제)
              const tr = this.toolRect ?? lay.tools;
              const placeFold = () => { const p = this.miniOn ? { x: fx, y: fy } : lay.portrait ? { x: fx, y: r.y + r.h - fs0 } : { x: tr.x - fs0 - 8, y: lay.toolGrid ? tr.y + 4 : tr.y + (tr.h - fs0) / 2 }; /* 가로 폰 격자: 격자 왼쪽 위(아래쪽 격자 옆은 엄지 [취소] 자리) */ fold.setPosition(p.x, p.y); this.foldRect = this.miniOn ? { x: fx - 10, y: fy - 10, w: fs0 + 20, h: r.h + 20 } : { x: p.x - 10, y: p.y - 10, w: fs0 + 20, h: fs0 + 20 }; };
              fh.on('pointerup', () => { if (this.modalCount) return; this.miniOn = !this.miniOn; try { localStorage.setItem('srpg.minimap', this.miniOn ? '1' : '0'); } catch { /* 무시 */ } this.minimap?.setVisible(this.miniOn); this.miniBtn?.setSelected(this.miniOn); placeFold(); drawArrow(); this.refreshSubObjectives?.(); /* 세로: 목표 패널 폭(미니맵 회피) 재계산 */ fold.icoImg?.setFlipY(!this.miniOn); });
              fold.add([fbg, fg, fh]);
              withUiImage(this, 'ui.battle.ico.collapse', (k) => { if (!fold.scene) return; fbg.setVisible(false); fg.setVisible(false); const im = this.add.image(fs0 / 2, fs0 / 2, k).setDisplaySize(fs0, fs0).setFlipY(!this.miniOn); fold.addAt(im, 0); fold.icoImg = im; });
              placeFold(); // 접힘이면 위 규칙 위치에 버튼만
              this.ui.add(fold); this.toolObjs.push(fold); }
        } else this.miniBtn = null;
    }

    // 도구 버튼 툴팁(호버 = 표시, 벗어나면 숨김 / 터치 = 길게 누르기 또는 탭 직후 1.2초). 화면 밖으로 나가지 않게 위치 보정
    showTip(btn, text) {
        if (!btn?.scene || !text || this.cutsceneOn) return; // 컷신 중 툴팁 금지(강화면 38회차)
        this.hideTip();
        const pad = 8;
        const t = makeText(this, pad, pad - 2, text, { size: 14, bold: true, color: CSS.text });
        const w = t.width + pad * 2; const h = t.height + pad * 2 - 4;
        const g = this.add.graphics().fillStyle(COLOR.navyDeep, 0.96).fillRoundedRect(0, 0, w, h, 6).lineStyle(1, COLOR.accent, 0.9).strokeRoundedRect(0, 0, w, h, 6);
        const cx = btn.x + btn.w / 2;
        const above = btn.y > L.lh / 2;
        const x = clamp(cx - w / 2, L.safe.l + 4, L.lw - L.safe.r - 4 - w);
        const y = above ? btn.y - h - 6 : btn.y + btn.h + 6;
        this.tipBox = this.add.container(x, clamp(y, 4, L.lh - h - 4), [g, t]).setDepth(960);
    }
    hideTip() { this.tipTimer?.remove(); this.tipTimer = null; this.tipBox?.destroy(); this.tipBox = null; }
    flashTip(btn, text) { if (!this.touch && !this.input.activePointer?.wasTouch) { if (this.tipBox) this.showTip(btn, text); return; } this.showTip(btn, text); this.tipTimer = this.time.delayedCall(1200, () => this.hideTip()); } // 터치 탭: 잠깐 표시 / 마우스: 호버 중이면 상태 바뀐 문구로 갱신

    // ================= 입력 =================
    pt(p) { return { x: p.x / L.u, y: p.y / L.u }; }

    inMap(q) {
        const a = this.lay.map;
        return q.x >= a.x && q.x <= a.x + a.w && q.y >= a.y && q.y <= a.y + a.h;
    }

    // HUD(상단 바/패널/도구) 위인지: 마우스 호버 커서 갱신·휠 줌에서 제외
    overUi(q) {
        const l = this.lay;
        const inR = (r) => r && q.x >= r.x && q.x <= r.x + r.w && q.y >= r.y && q.y <= r.y + r.h;
        // 상단 띠 제거(2026-11-03): 상단은 턴 칩·우상단 버튼 줄(로그 버튼 왼쪽 끝부터)만 HUD. 하단 '턴 종료'·도구 줄·미니맵 포함
        const topBtns = q.y <= l.barH && q.x >= (this.logBtn?.x ?? L.lw) - 4;
        const chip = this.turnChip?.scene ? { x: this.turnChip.x, y: this.turnChip.y, w: this.turnChip.width, h: this.turnChip.height } : null;
        return topBtns || inR(chip) || inR(this.toolRect ?? l.tools) || inR(this.followRect) || inR(this.foldRect) || inR(l.endBtn) || inR(this.thumbCancel?.visible ? this.thumbCancelRect : null) || !!this.minimap?.contains(q.x, q.y) || (this.squadStrip?.visible && inR(this.squadStripRect)) || [this.panelB, this.card, this.guide, this.__briefQ?.cur].some((p) => p?.contains(q.x, q.y));
    }

    overPopup(q) { return [this.menuCtx, this.bubble, this.facingPicker].some((o) => o && o.contains(q.x, q.y)); }

    // 팬(드래그·핀치) 시작: 호버 툴팁·행동 메뉴·말풍선을 숨긴다. 이동 중에는 updatePopups/syncPopups 가 건너뛰고 pointerup 에서 1회 재생성(D1)
    beginPan() {
        if (this.drag) this.drag.moved = true;
        this.hideHoverTip();
        this.clearPopups();
    }

    // 핀치 시작·종료 시 남은(눌린) 필드 포인터 기준으로 드래그 기준점 재설정(D3). 남은 손가락이 없으면 그대로
    rebaseDrag() {
        const rest = this.input.manager.pointers.find((x) => x.isDown && this.fieldPointers.has(x.id));
        if (!rest) return;
        const q = this.pt(rest);
        this.drag = { id: rest.id, sx: q.x, sy: q.y, wx: this.world.x, wy: this.world.y, moved: true };
    }

    makeZone() {
        const a = this.lay.map;
        this.zone = this.add.rectangle(a.x, a.y, a.w, a.h, 0x000000, 0).setOrigin(0).setDepth(-10).setInteractive();
        this.zone.on('pointerdown', (p) => {
            if (this.modalCount) return;
            this.touch = !!p.wasTouch;
            if (p.rightButtonDown()) { this.cancelAction(); return; }
            if (this.fx.skip()) { this.drag = null; return; } // 탭 1회: 현재 연출 스킵(입력 소비)
            this.fieldPointers.add(p.id);
            const q = this.pt(p);
            const cur = this.drag;
            if (cur?.moved && cur.id !== p.id && this.input.manager.pointers.some((x) => x.id === cur.id && x.isDown)) return; // 팬 중 두 번째 손가락: 팬 상태 유지(핀치로 이어짐, 탭으로 오인하지 않음)
            this.drag = { id: p.id, sx: q.x, sy: q.y, wx: this.world.x, wy: this.world.y, moved: false };
        });
    }

    buildInput() {
        this.makeZone();
        this.input.on('pointermove', (p) => {
            if (this.modalCount) return;
            const q = this.pt(p);
            const p1 = this.input.pointer1;
            const p2 = this.input.pointer2;
            if (p1?.isDown && p2?.isDown && this.fieldPointers.has(p1.id) && this.fieldPointers.has(p2.id)) { // 핀치: 거리 비율이 임계를 넘을 때 정수 배율 한 단계씩
                const d = Phaser.Math.Distance.Between(p1.x, p1.y, p2.x, p2.y);
                const mx = (p1.x + p2.x) / 2 / L.u; const my = (p1.y + p2.y) / 2 / L.u;
                if (this.drag && !this.drag.moved) this.beginPan();
                if (!this.pinch) { this.pinch = { d, mx, my, wx: this.world.x, wy: this.world.y }; return; }
                const pc = this.pinch;
                // D4: 두 손가락 중점 이동만큼 맵 이동(기준 = 핀치 시작/직전 줌 단계 시점의 중점·월드 위치)
                const cp = this.clampPos(pc.wx + mx - pc.mx, pc.wy + my - pc.my);
                if (cp.x !== this.world.x || cp.y !== this.world.y) this.world.setPosition(cp.x, cp.y);
                const z = d / pc.d > 1.35 ? 1 : d / pc.d < 0.74 ? -1 : 0;
                if (z) { this.zoomStep(z, mx, my); Object.assign(pc, { d, mx, my, wx: this.world.x, wy: this.world.y }); } // 줌 후 기준 재설정(점프 방지)
                return;
            }
            if (this.pinch) { this.pinch = null; this.rebaseDrag(); } // 핀치가 끝났는데 pointerup 을 놓친 경우: 남은 손가락 기준으로 팬 재시작
            const dr = this.drag;
            if (dr && p.id === dr.id && p.isDown) {
                if (!dr.moved && Math.hypot(q.x - dr.sx, q.y - dr.sy) > 10) this.beginPan();
                // D1: 이동 중에는 팝업(행동 메뉴·말풍선)을 재생성하지 않는다 — beginPan 에서 숨기고 pointerup 에서 한 번만 다시 그림
                if (dr.moved) { const cp = this.clampPos(dr.wx + q.x - dr.sx, dr.wy + q.y - dr.sy); if (cp.x !== this.world.x || cp.y !== this.world.y) this.world.setPosition(cp.x, cp.y); }
            } else if (!p.wasTouch && this.inMap(q) && !this.overUi(q) && !this.overPopup(q) && this.worldBuilt) {
                // 마우스 호버 = 타일 커서 이동. 메뉴/말풍선 위에서는 갱신하지 않는다(메뉴 재생성으로 클릭이 씹히는 문제 방지)
                const t = this.tileAt(p);
                if (t) { this.userCursor = true; this.store.setCursor(t.x, t.y); }
                this.updateHoverTip(q, t); // 유닛 상태 툴팁 = 커서를 따라감(2026-11-03 사용자 요청)
            } else this.hideHoverTip();
        });
        this.input.on('gameout', () => this.hideHoverTip()); // 커서가 게임 화면 밖으로
        this.input.on('pointerup', (p) => {
            this.fieldPointers.delete(p.id);
            const dr = this.drag;
            const wasPinch = !!this.pinch;
            if (dr && p.id === dr.id) {
                this.drag = null;
                if (!dr.moved && !this.pinch && !this.modalCount && this.worldBuilt) {
                    const t = this.tileAt(p);
                    if (t) { this.userCursor = true; this.store.tap(t.x, t.y); } // userCursor: 선택 카드는 사용자가 커서를 움직인 뒤에만(refreshCard)
                }
            }
            if (!(this.input.pointer1?.isDown && this.input.pointer2?.isDown)) this.pinch = null;
            // D3: 핀치 중 한 손가락을 떼면 남은 손가락 기준으로 드래그 재설정(떼는 순서와 무관하게 이어서 팬, 위치 점프 없음)
            if (wasPinch && !this.pinch) this.rebaseDrag();
            if (dr?.moved && !this.drag?.moved) { this.popupKey = ''; this.updatePopups(); } // 팬·핀치 종료: 팝업 1회 재생성
        });
        this.input.on('wheel', (p, objs, dx, dy) => {
            if (objs?.[0] && objs[0] !== this.zone) return; // 최상단 입력이 맵(zone)이 아니면(대화창·컷신·팝업·패널 위) 줌 안 함
            const q = this.pt(p);
            if (!this.modalCount && this.inMap(q) && !this.overUi(q) && this.worldBuilt) this.zoomStep(dy > 0 ? -1 : 1, q.x, q.y);
        });

        // 키보드: 키 반복은 120ms 이상 간격일 때만 처리. 리스너는 씬당 1회만 등록되고 shutdown 시 제거된다.
        const kb = this.input.keyboard;
        if (!kb) return;
        const move = (dx, dy) => (e) => {
            if (this.modalCount || !this.worldBuilt) return;
            if (this.store.state.phase === 'facing' && this.store.state.side === 'ally') { // 방향 선택 중: 방향키 = 방향 변경(Enter 로 확정)
                this.store.setFacingChoice(dx < 0 ? 'left' : dx > 0 ? 'right' : dy < 0 ? 'up' : 'down');
                return;
            }
            if (this.menuCtx) { this.menuCtx.move(dx + dy < 0 ? -1 : 1); return; }
            const now = performance.now();
            if (e?.repeat && now - this.lastKey < 120) return;
            this.lastKey = now;
            if (this.fx.skip()) return;
            const c = this.store.state.cursor;
            this.userCursor = true; this.store.setCursor(c.x + dx, c.y + dy);
        };
        kb.on('keydown-LEFT', move(-1, 0));
        kb.on('keydown-RIGHT', move(1, 0));
        kb.on('keydown-UP', move(0, -1));
        kb.on('keydown-DOWN', move(0, 1));
        const ok = (e) => {
            if (this.modalCount || e?.repeat || !this.worldBuilt || this.fx.skip()) return;
            if (this.menuCtx) { this.menuCtx.activate(); return; }
            const s = this.store.state;
            if (s.phase === 'facing') { this.facingCommitted = true; this.store.confirmFacing(); return; }
            if (s.phase === 'confirm') this.store.confirm();
            else this.store.tap(s.cursor.x, s.cursor.y);
        };
        kb.on('keydown-ENTER', ok);
        kb.on('keydown-SPACE', ok);
        kb.on('keydown-ESC', (e) => {
            if (e?.repeat || this.modalCount || performance.now() - (this.lastModalEsc ?? 0) < 200) return;
            this.cancelAction();
        });
    }

    cancelAction() {
        if (this.fx.skip()) return;
        this.store.cancel();
    }

    tileAt(p) {
        const q = this.pt(p);
        const x = Math.floor((q.x - this.world.x) / this.world.scaleX / TILE);
        const y = Math.floor((q.y - this.world.y) / this.world.scaleY / TILE);
        const m = this.store.state.map;
        return x >= 0 && y >= 0 && x < m.w && y < m.h ? { x, y } : null;
    }

    // ================= 스토어 이벤트 =================
    onEvent(e) {
        // 연출 cue parallel(group) 순서 보장: cue·cue 보행 move 가 아닌 연출 이벤트가 오면 모아 둔 그룹을 먼저 큐에 넣는다(CuePlayer.flushGroup)
        if (e.type !== 'cue' && !(e.type === 'move' && e.walk)) this.cues?.flushGroup();
        if (e.type === 'move' && e.walk) { this.cues?.walkUnit(e); return; } // 14절 실제 유닛 보행(경로·속도·충돌 회피·병렬)
        if (e.type === 'cursor') { if (this.worldBuilt) { this.placeCursor(true); this.expandNames(); } }
        else if (e.type === 'mp') { if (!this.worldBuilt || !this.card?.scene) return; this.cardState = null; this.refreshCard?.(); this.refreshAction?.(); } // 재시작 직후(buildUI 전) 이전 실행의 파괴된 카드에 접근하지 않게(gacha110 pageerror 'reading sys') // MP 변화: 카드 MP 바·정보 띠 갱신
        else if (e.type === 'toast') this.notice(e.message, 'warn', e.ms); // 행동 불가 사유 등: 설정과 무관하게 상단 알림 칩(직접 조작에 대한 응답)
        else if (e.type === 'loadFailed') this.showLoadError(e);
        else if (e.type === 'story_dialogue') this.onStoryEvent(e);
        else if (e.type === 'sync') { if (!this.safeEnsureWorld()) return; this.fx.enqueue((done) => { this.syncViews(); this.popupKey = ''; this.syncPopups(); done(); }); }
        else if (e.type === 'result') this.fx.enqueue((done) => { this.showResult(e.result); done(); });
        else if (e.type === 'auth') this.showAuth();
        else if (e.type === 'error') this.showError(e.message, e.retry);
        else if (e.type === 'battleEnd') { /* 결과 모달은 result 이벤트에서 */ }
        else if (e.type === 'alt') this.onAltEvent(e);
        else if (e.type === 'altConfirm') this.confirmActivate(e);
        else if (e.type === 'focus') { if (this.worldBuilt && !this.dlgCam) this.focusTile(e.x, e.y, true); } // 대사 카메라 중에는 전투 포커스 무시
        else if (e.type === 'reinforce') { this.holdReinforceZone(e); this.onReinforce(e); }
        else if (e.type === 'cue') this.cues.handle(e.cue);
        else if (e.type === 'retreat') this.fx.enqueue((done) => this.retreatFx(e, done));
        else if (e.type === 'defect') this.fx.enqueue((done) => this.defectFx(e, done));
        else if (e.type === 'objectiveProgress') this.fx.enqueue((done) => { if ((settings.get().notify ?? 1) > 0) { if (e.need > 0) this.notice(`점령 진행 ${e.hold}/${e.need}턴`, 'info', 1600); if (e.enemyNeed > 0 && e.enemyHold > 0) this.notice(`적이 목표를 점유 중 ${e.enemyHold}/${e.enemyNeed}턴`, 'warn', 1800); } done(); });
        else {
            if (e.type === 'move' && !e.snapTo) { // 이동 카메라(사용자 2026-11-07): 먼저 출발 칸(연출 시점 뷰 위치)으로 따라가 어디서 움직이는지 보이게 -> 패닝했으면 끝날 때까지 기다린 뒤 걷기 -> 도착 칸이 화면 밖이면 다시 따라감
                this.fx.enqueue((done) => { const v = this.views.get(e.unitId); const p = v ? { x: Math.floor(v.c.x / TILE), y: Math.floor(v.c.y / TILE) } : (e.path?.[e.path.length - 1] ?? null); if (p && this.followTile(p.x, p.y)) wait(this, 230, done); else done(); }, { kind: 'camera' }); // 병렬 이동 묶음에 포함(FxManager.runMoveBatch: 묶음은 첫 카메라만, 기다림 없이)
            } else if (e.type === 'attack') { // 공격 대상이 화면 밖이면 따라간다
                this.fx.enqueue((done) => { const u = this.store.get(e.targetId); if (u) this.followTile(u.x, u.y); done(); });
            }
            this.fx.handle(e);
            if (e.type === 'move' && !e.snapTo) this.fx.enqueue((done) => { const last = e.path?.[e.path.length - 1]; if (last) this.followTile(last.x, last.y); done(); }, { kind: 'camera' }); // 도착 칸 확인(이미 화면 안이면 그대로)
        }
        if (e.type === 'sync' && this.worldBuilt) this.cues.onSync(); // 불 오버레이를 store 최종값(cueFires)에 맞춤
    }

    // 증원 등장(서버 reinforce): 알림 + 카메라 + 등장 연출(링 확산·페이드 인, 수면이면 물보라). 뷰는 여기서 먼저 만들고 sync 가 최종값으로 맞춘다
    onReinforce(e) {
        this.fx.enqueue((done) => {
            if (!this.worldBuilt) { done(); return; }
            const s = this.store.state;
            const units = (e.unitIds ?? []).map((id) => this.store.get(id)).filter((u) => u && u.hp > 0);
            const who = e.team === 'ally' ? '아군' : s.opponentLabel;
            this.notice(e.heroName ? `${who} ${e.heroName} 등장` : `${who} 증원 ${units.length || (e.unitIds ?? []).length}부대 등장${e.delayed ? ` · ${e.delayed}부대는 다음 라운드` : ''}`, e.team === 'ally' ? 'info' : 'warn', 2000);
            if (units[0]) this.followTile(units[0].x, units[0].y);
            const col = e.team === 'ally' ? COLOR.ally : COLOR.danger;
            units.forEach((u, i) => {
                let v = this.views.get(u.id);
                if (!v) { v = new UnitView(this, this.unitLayer, u); this.views.set(u.id, v); v.setLook(campLook(u, s.units)); }
                v.setWater(waterStateOf(u, s.map.tiles?.[u.y]?.[u.x]), u);
                if (isInstant()) return;
                v.c.setAlpha(0);
                tween(this, { targets: v.c, to: { alpha: 1 }, duration: 380, delay: i * 90 });
                const ring = this.add.circle(v.c.x, v.c.y, TILE * 0.32).setStrokeStyle(3, col, 1).setFillStyle(col, 0.2);
                this.worldFx.add(ring);
                tween(this, { targets: ring, to: { scaleX: 2.2, scaleY: 2.2, alpha: 0 }, duration: 520, delay: i * 90, onComplete: () => ring.destroy() });
                if (v.water?.onWater) this.fx.splash(v.c.x, v.c.y);
            });
            this.releaseReinforceZone(e, col, units.length || (e.unitIds ?? []).length);
            this.objKey = ''; // 증원 예고 구역 갱신
            this.refreshObjectives();
            if (isInstant()) done(); else this.time.delayedCall(560 + units.length * 90, done);
        });
    }

    // 증원 예고 구역 유지(2026-11-03 P1): reinforce 이벤트(store 가 상태 반영과 같은 시점에 동기 발행)가 오면, 직전에 그려 둔 예고(trigSeen) 중
    // 같은 진영·구역(zone) 항목을 hold 에 넣어 연출 큐가 그 등장 연출에 도달할 때까지 빗금을 남긴다. 구역 정보가 없으면(cue spawn) 아무것도 안 함
    holdReinforceZone(e) {
        if (!e.zone || !Array.isArray(this.trigSeen)) return;
        const s = this.store.state;
        const side = e.team === 'ally' ? s.mySide : null;
        const hit = this.trigSeen.filter((t) => t.zone === e.zone && (side ? t.side === side : t.side !== s.mySide));
        if (!hit.length) return;
        this.reinfHold = this.reinfHold ?? new Map();
        hit.forEach((t) => this.reinfHold.set(t.id, { ...t, arriving: true, holdKey: `${e.team}:${e.zone}` }));
    }

    // 등장 연출 시점: hold 해제 + 구역 칸 1회 섬광(면 채움 -> 페이드) + '적 증원 ×N' 글자 상승. 연출 즉시(스킵·끄기·배속 스킵)면 섬광 없이 해제만
    releaseReinforceZone(e, col, n) {
        const key = `${e.team}:${e.zone}`;
        const rel = [...(this.reinfHold?.values() ?? [])].filter((t) => t.holdKey === key);
        rel.forEach((t) => this.reinfHold.delete(t.id));
        if (isInstant() || !this.worldFx) return;
        const cells = rel.flatMap((t) => (Array.isArray(t.cells) ? t.cells : []));
        if (!cells.length) return;
        const g = this.add.graphics();
        cells.forEach(([x, y]) => { g.fillStyle(col, 0.5).fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4); g.lineStyle(3, 0xffffff, 0.8).strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6); });
        this.worldFx.add(g);
        tween(this, { targets: g, to: { alpha: 0 }, duration: 520, onComplete: () => g.destroy() });
        const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length; const cy = Math.min(...cells.map((c) => c[1]));
        const lbl = makeText(this, cx * TILE + TILE / 2, cy * TILE - 4, `${e.team === 'ally' ? '아군' : '적'} 증원 ×${n}`, { size: 18, bold: true, color: e.team === 'ally' ? CSS.allyText : CSS.dangerText, origin: [0.5, 1], stroke: { color: '#0B1020', width: 5 } });
        this.worldFx.add(lbl);
        tween(this, { targets: lbl, to: { y: lbl.y - 26, alpha: 0 }, duration: 560, ease: 'Quad.easeOut', onComplete: () => lbl.destroy() });
    }

    // 점령 목표 깃발(objective_points + objective.held 점유 색) + 증원 예고 구역(triggers: 미완료, 남은 라운드 표기). 상태가 바뀔 때만 다시 그린다
    refreshObjectives() {
        const s = this.store.state;
        if (!this.objLayer || !this.worldBuilt) return;
        const pts = s.objectivePoints ?? [];
        const held = s.objective?.held ?? [];
        const pend = s.status === 'battle' ? (s.triggers ?? []).filter((t) => Number(t.turn) > Number(s.turn ?? 0)) : [];
        // 등장 연출 직전까지 유지: 서버 상태는 이미 증원 완료(목록에서 빠짐)여도 reinforce 연출이 큐에서 재생되기 전까지는 직전 예고 구역을 그대로 그린다(holdReinforceZone)
        const hold = s.status === 'battle' ? [...(this.reinfHold?.values() ?? [])].filter((t) => !pend.some((p) => p.id === t.id)) : [];
        const trig = [...pend, ...hold];
        this.trigSeen = pend; // 다음 reinforce 이벤트가 왔을 때 '직전 예고' 로 쓸 목록
        const key = JSON.stringify([pts, held, trig.map((t) => [t.id, t.turn, t.side, t.count, !!t.arriving]), s.turn, s.status]);
        if (key === this.objKey) return;
        this.objKey = key;
        this.objLayer.removeAll(true);
        this.objFlags = [];
        const g = this.add.graphics();
        this.objLayer.add(g);
        trig.forEach((t) => {
            const col = t.side === s.mySide ? COLOR.ally : COLOR.danger;
            const cells = Array.isArray(t.cells) ? t.cells : [];
            cells.forEach(([x, y]) => {
                g.fillStyle(col, 0.14).fillRect(x * TILE + 2, y * TILE + 2, TILE - 4, TILE - 4);
                g.lineStyle(2, col, 0.7).strokeRect(x * TILE + 3, y * TILE + 3, TILE - 6, TILE - 6);
                g.lineStyle(1, col, 0.35);
                for (let k = 12; k < TILE * 2; k += 12) g.lineBetween(x * TILE + Math.max(0, k - TILE), y * TILE + Math.min(TILE, k), x * TILE + Math.min(TILE, k), y * TILE + Math.max(0, k - TILE)); // 빗금(예고 구역)
            });
            if (!cells.length) return;
            const cx = cells.reduce((a, c) => a + c[0], 0) / cells.length; const cy = Math.min(...cells.map((c) => c[1]));
            const left = Number(t.turn) - Number(s.turn ?? 0);
            const txt = `${t.side === s.mySide ? '아군' : '적'} 증원 ×${t.count ?? '?'} · ${t.arriving ? '등장' : left <= 1 ? '다음 라운드' : `${left}라운드 후`}`;
            this.objLayer.add(makeText(this, cx * TILE + TILE / 2, cy * TILE - 2, txt, { size: 12, bold: true, color: t.side === s.mySide ? CSS.allyText : CSS.dangerText, origin: [0.5, 1], stroke: { color: '#0B1020', width: 4 } }));
        });
        pts.forEach((p) => {
            const [x, y] = Array.isArray(p) ? p : [p?.x, p?.y];
            if (!Number.isInteger(x) || !Number.isInteger(y)) return;
            const h = held.find((q) => q.x === x && q.y === y)?.holder ?? null;
            const col = h == null ? COLOR.accent : h === s.mySide ? COLOR.ally : COLOR.danger;
            g.fillStyle(col, h == null ? 0.18 : 0.32).fillEllipse(x * TILE + TILE / 2, y * TILE + TILE * 0.78, TILE * 0.86, TILE * 0.34);
            g.lineStyle(2.5, col, 0.95).strokeEllipse(x * TILE + TILE / 2, y * TILE + TILE * 0.78, TILE * 0.86, TILE * 0.34);
            if (this.textures.exists('ws_overlay')) {
                const img = this.add.image(x * TILE, y * TILE, 'ws_overlay', this.waterF ?? 0).setOrigin(0).setDisplaySize(TILE, TILE); // 목표 깃발 4프레임(ws_overlay 0~3)
                this.objLayer.add(img); this.objFlags.push(img);
            } else { // 시트 없음: 도형 깃발
                g.lineStyle(2, COLOR.ink, 1).lineBetween(x * TILE + TILE * 0.42, y * TILE + TILE * 0.18, x * TILE + TILE * 0.42, y * TILE + TILE * 0.8);
                g.fillStyle(col, 1).fillTriangle(x * TILE + TILE * 0.44, y * TILE + TILE * 0.18, x * TILE + TILE * 0.78, y * TILE + TILE * 0.3, x * TILE + TILE * 0.44, y * TILE + TILE * 0.42);
            }
            if (h != null) this.objLayer.add(makeText(this, x * TILE + TILE / 2, y * TILE + 2, h === s.mySide ? '점령' : '적 점령', { size: 11, bold: true, color: h === s.mySide ? CSS.allyText : CSS.dangerText, origin: [0.5, 0], stroke: { color: '#0B1020', width: 4 } }));
        });
    }

    onStoryEvent(event) {
        if (this.store.state.mode === 'room' || !event.event_id || !Array.isArray(event.dialogue)) return;
        const key = `lw.story:${this.store.state.battleId}:${event.event_id}`;
        if (this.storyQueued.has(key)) return;
        try { if (localStorage.getItem(key) === 'done' || sessionStorage.getItem(key) === 'done') return; } catch { /* 저장 차단 시 현재 씬 내 중복만 차단 */ } // 이어하기(브라우저 재시작 후)에도 지난 대사 반복 방지: localStorage(구 기록 sessionStorage 도 인정)
        this.storyQueued.add(key);
        this.fx.enqueue((done) => {
            if (!this.scene.isActive()) { done(); return; }
            this.drag = null;
            this.pinch = null;
            this.fieldPointers.clear();
            this.clearPopups();
            this.storyDialogue = new BattleDialogue(this, event, () => {
                try { localStorage.setItem(key, 'done'); } catch { /* 저장 공간이 없어도 전투는 계속 */ }
                this.storyDialogue = null;
                this.dlgCamEnd(() => this.afterStoryDialogue(done)); // 대사 카메라 해제(원위치 복귀 없음, 화자 팬이 끝난 뒤) 후 다음 연출(턴 진행) 재개
            });
        });
    }

    afterStoryDialogue(done) {
        done();
        this.popupKey = '';
        this.syncPopups();
        // 대사 종료는 store 'change'를 내지 않으므로 조작 안내(G1 목표 배너)·오라 개념 팝업을 여기서 다시 평가(맵 클릭 없이 바로 뜨게)
        this.guide?.update();
        if (this.worldBuilt && this.scene.isActive()) this.refreshAuraBadges(this.store.state);
    }

    // ================= 대사 카메라(2026-11-08 사용자 확정 규칙) =================
    // 대사 줄마다(BattleDialogue.showLine -> dialogueFocus):
    //  - 화자가 맵 위 유닛(matchSpeakerUnit)이면 현재 배율 그대로 그 유닛을 화면 가로 중앙 · 대사창 위 영역의 약간 위(DLG_ANCHOR_Y)로 짧게 팬(DLG_PAN_MS, 배속 반영)
    //  - 같은 화자 다음 줄은 이동 없음. 화자 유닛이 없으면(캡션·시오리·병사·퇴장) 카메라를 움직이지 않는다
    //  - 데이터 camera 큐가 같은 대사 묶음 직전에 실행됐거나 cue follow 추적 중이면 camera 큐가 이긴다(대사 카메라는 이동하지 않음)
    //  - 대사가 끝나도 원위치로 되돌리지 않는다(그 자리 유지). 대사 중에는 전투 followTile·focus 가 끼어들지 않고, 끝난 뒤 다음 연출이 이어받는다
    //  - 배율(줌)은 원칙적으로 바꾸지 않는다(구 규칙의 채움·확대·복귀 줌 제거: 화자 전환·종료 때마다 확대/축소·원복 점프가 '멋대로 움직임'으로 보였다)
    //  - 예외(2026-11-14 사용자 승인 '초반에 포커스 맞출 때 세로로 사이즈 맞춰서 확대한 상태로 포커스'): 대사 묶음에서 처음으로 화자 유닛·액터에 포커스할 때 1회,
    //    맵 세로가 '상단 바 아래 ~ 대사창 윗변' 가용 높이보다 작게 보이면 그 높이에 맞는 배율(kMax 상한)로 확대하면서 팬(dlgCamZoomOnce).
    //    화자 유닛이 없으면 줌도 없음, camera 큐·cue follow 우선이면 줌도 없음, 이후 줄은 배율 불변, 대사 종료 후 원래 배율로 되돌리지 않음.
    //    맵 가로가 화면보다 좁으면(가로 폰의 20x14 등) 가로는 여전히 가운데 정렬이라 화자가 정확히 가로 중앙에 오지 않을 수 있다
    // 이 상태(this.dlgCam)는 대사 진행 중 표시용이며, 모든 대사 종료 경로(onStoryEvent·CuePlayer.say·QA)가 dlgCamEnd 로 해제한다.
    // BattleDialogue.showLine 이 줄마다 호출(info = speakerOf 결과, line = 원본 줄, instant = 재배치 복원(즉시), boxTop = 하단 대사 패널 윗변 y)
    dialogueFocus(info, line, instant = false, boxTop = null) {
        if (!this.worldBuilt || !this.world?.scene || !this.store.state.map) return;
        if (!this.dlgCam) {
            this.tweens.getTweensOf(this.world).forEach((t) => t.stop()); // 진행 중 팔로우 이동은 현재 위치에서 멈춤(끝으로 점프하지 않음)
            this.dlgCam = { key: null, unitId: null, tween: null, boxTop: null, hold: !!this.cues?.camHold() };
        }
        const c = this.dlgCam;
        if (Number.isFinite(boxTop)) c.boxTop = boxTop;
        if (line?.focus === false) return; // cue say focus:false = 카메라 이동 안 함
        // 화자 액터(14절 say.actor / speaker 'actor:<id>'): 연출 액터 컨테이너 위치로
        const ac = line?.actor ? this.cues?.actorC(line.actor) : null;
        if (ac) {
            const key = `a:${line.actor}`;
            if (key === c.key && !instant) return;
            c.key = key; c.unitId = null; c.actorC = ac;
            if (c.hold || this.cues?.follow) { c.zoomTried = true; return; } // 데이터 카메라 우선: 이 대사 묶음은 줌하지 않음
            this.dlgCamApply(instant, this.dlgCamZoomOnce(c));
            return;
        }
        const u = matchSpeakerUnit(line?.speaker, info, this.store.state.units);
        if (!u) return; // 화자 유닛 없음: 카메라 그대로(이전 화자 위치 유지)
        const key = `u:${u.id}`;
        if (key === c.key && !instant) return; // 같은 화자 다음 줄·쪽: 그대로
        c.key = key; c.unitId = u.id; c.actorC = null;
        if (c.hold || this.cues?.follow) { c.zoomTried = true; return; } // 데이터 camera 큐 우선(줌도 하지 않음)
        this.dlgCamApply(instant, this.dlgCamZoomOnce(c));
    }

    // 대사 묶음의 첫 화자 포커스 1회: 맵 세로가 대사창 위 가용 높이(padT ~ 대사창 윗변)보다 작으면 그 높이에 맞는 배율 k(kMax 상한)를 돌려준다. 아니면 null(배율 유지)
    dlgCamZoomOnce(c) {
        if (!c || c.zoomTried) return null;
        c.zoomTried = true;
        const m = this.store.state.map;
        const top = this.padT();
        const boxTop = Number.isFinite(c.boxTop) ? c.boxTop : L.lh;
        const avail = boxTop - top;
        if (!m?.h || avail < 40) return null;
        const kV = ((avail / (m.h * TILE)) * TILE * L.u) / tileSrc(); // setZoomK 배율식의 역산: world.scale = tileSrc * k / (TILE * L.u)
        const k = Math.min(kV, this.kMax ?? kV);
        if (!(k > (this.k ?? 0) + 0.01)) return null; // 이미 그 이상으로 보이면 줌 없음
        c.zoomK = k;
        if (this.fullView) { this.fullView = null; this.syncFullBtn(); } // 전체 보기 토글 상태 해제(대사 후 '이전' 버튼이 엉뚱한 배율로 돌아가지 않게)
        return k;
    }

    // 화자 유닛을 가로 중앙 · 대사창 위 영역의 DLG_ANCHOR_Y 높이에 두는 월드 위치(현재 배율, 맵 경계 클램프. 대사창 뒤로만 마지막 행을 더 끌어올릴 수 있다)
    dlgCamPlan(s = this.world.scaleX) { // s: 목표 배율(첫 포커스 줌이면 줌 후 배율)
        const c = this.dlgCam;
        let ux; let uy;
        if (c?.actorC?.scene) { ux = c.actorC.x; uy = c.actorC.y; } // 화자 연출 액터
        else {
            const u = c?.unitId != null ? this.store.get(c.unitId) : null;
            if (!u || !(u.hp > 0)) return null;
            const v = this.views?.get(u.id);
            ux = v?.c ? v.c.x : (u.x + 0.5) * TILE; uy = v?.c ? v.c.y : (u.y + 0.5) * TILE; // 화면에 그려진 위치(이동 연출 중이면 그 위치)
        }
        const boxTop = Number.isFinite(c.boxTop) ? c.boxTop : L.lh;
        const top = this.padT();
        const want = { x: L.lw / 2 - ux * s, y: top + (Math.max(top + 40, boxTop) - top) * DLG_ANCHOR_Y - uy * s };
        const m = this.store.state.map;
        const h = m.h * TILE * s;
        const p = this.clampPos(want.x, want.y, s);
        const padB = Math.max(this.padB(), L.lh - boxTop);
        // 맵 세로가 대사창 위 영역에 다 들어가면 그 영역 가운데(예전: HUD 기준 가운데 = 아래 행이 대사창 뒤로 갈 수 있었다). 넘치면 화자 기준 클램프
        const y = h <= L.lh - top - padB ? snap(top + (L.lh - padB - top - h) / 2) : snap(clamp(want.y, L.lh - h - padB, this.padTopPan()));
        return { x: p.x, y };
    }

    // zoomK: 첫 포커스 줌 목표 배율(dlgCamZoomOnce, null = 배율 유지). 팬과 같은 트윈으로 배율·위치를 함께 옮기고 끝에서 setZoomK 로 k·타일 표시 상태를 맞춘다
    dlgCamApply(instant, zoomK = null) {
        const c = this.dlgCam;
        if (!c) return;
        if (c.tween) { const zk = c.tweenZoomK; c.tween.stop(); c.tween = null; c.tweenZoomK = null; if (zk != null) this.setZoomK(zk); } // 줌 트윈 도중 다음 줄: 목표 배율로 확정 후 계획
        const s = zoomK != null ? (tileSrc() * zoomK) / (TILE * L.u) : this.world.scaleX;
        const p = this.dlgCamPlan(s);
        if (!p) return;
        const fin = () => { this.popupKey = ''; this.updatePopups(); };
        if (zoomK == null && Math.abs(p.x - this.world.x) < 1 && Math.abs(p.y - this.world.y) < 1) return; // 이미 그 자리
        if (instant || isInstant()) { if (zoomK != null) this.setZoomK(zoomK); this.world.setPosition(p.x, p.y); fin(); return; }
        const to = zoomK != null ? { x: p.x, y: p.y, scaleX: s, scaleY: s } : { x: p.x, y: p.y };
        c.tweenZoomK = zoomK;
        c.tween = this.tweens.add({ targets: this.world, ...to, duration: DLG_PAN_MS / (settings.get().speed || 1), ease: 'Sine.easeInOut', onComplete: () => {
            if (zoomK != null) { this.setZoomK(zoomK); this.world.setPosition(p.x, p.y); } // k·tileCssPx·유닛 표시 세부(setDetail) 동기화
            if (c.tween) { c.tween = null; c.tweenZoomK = null; }
            fin();
        }, onStop: () => { // 외부에서 월드 트윈을 끊어도(다음 연출·리사이즈) 배율 상태(k)와 월드 배율이 어긋나지 않게 목표로 확정
            if (zoomK != null && c.tweenZoomK === zoomK && this.world?.scene) { this.setZoomK(zoomK); this.world.setPosition(p.x, p.y); c.tweenZoomK = null; }
        } });
    }

    // 대사 종료: 원위치 복귀 없이 그 자리 유지. 진행 중인 화자 팬은 끝까지 진행(멈추면 중간에서 끊겨 보임)하고 상태만 해제한 뒤 cb
    dlgCamEnd(cb) {
        const c = this.dlgCam;
        this.dlgCam = null;
        const tw = c?.tween;
        if (tw && tw.isPlaying?.() && this.world?.scene) { let fired = false; const go = () => { if (fired) return; fired = true; cb?.(); }; tw.once('complete', go); tw.once('stop', go); this.time.delayedCall(DLG_PAN_MS + 200, go); return; } // 팬이 끝난 뒤 다음 연출(followTile 등과 같은 월드 동시 트윈 방지)
        cb?.();
    }

    dlgCamFinish(c) { if (this.dlgCam === c) this.dlgCam = null; } // QA 경로 호환(복귀 동작 없음)

    // fitMap 직후(리사이즈·월드 재구성): 진행 중 팬을 멈추고 현재 화자를 새 뷰 기준으로 즉시 다시 맞춘다(화자 없으면 그대로)
    dlgCamRebase() {
        const c = this.dlgCam;
        if (!c) return;
        c.tweenZoomK = null; c.tween?.stop(); c.tween = null; // fitMap 이 배율을 새로 잡았으므로 진행 중 줌 목표는 버린다
        if (c.hold || this.cues?.follow) return;
        const z = c.zoomK != null ? (c.zoomTried = false, this.dlgCamZoomOnce(c)) : null; // 첫 포커스 줌을 했던 대사면 새 화면 기준으로 다시 맞춤
        this.dlgCamApply(true, z);
    }

    // 교대 행동 이벤트(연출 큐 순서대로): 아군 활성화 시작 = '건너뛰기'(skipTurn) 해제, 상대 활성화 = 알림 칩 + 영웅 쪽으로 카메라,
    // 라운드 종료 = 알림 칩(라운드 시작 배너는 기존 turn_start 배너가 담당). 알림은 설정 '전투 알림' 끄기(0)면 생략.
    onAltEvent(e) {
        const s = this.store.state;
        this.fx.enqueue((done) => {
            const nl = settings.get().notify ?? 1;
            if (e.kind === 'start' && e.team === 'ally') fx.skipTurn = false;
            if (e.kind === 'start' && e.team === 'enemy') {
                const u = this.store.get(e.squadId);
                if (u && u.hp > 0) this.followTile(u.x, u.y);
                if (nl > 0 && nl < 3) this.notice(`${s.opponentLabel} 부대 행동 중 · ${u ? unitDisplayName(u, s.units, { short: true }) : ''}`, 'info', 1400);
            } else if (e.kind === 'round' && nl > 0 && nl < 3) this.notice(`라운드 ${e.turn} 종료${e.reason === 'cap' ? ' (연속 행동 상한)' : ''}`, 'info', 1400);
            done();
        });
    }

    // 첫 활성화 확인(활성화는 취소할 수 없음). '다시 묻지 않기' = settings.altConfirmSkip(localStorage)
    confirmActivate(e) {
        if (this.altConfirmModal) return;
        const s = this.store.state;
        const u = this.store.get(e.squadId) ?? this.store.get(e.unitId);
        const nm = u ? unitDisplayName(u, s.units, { short: true }) : '이';
        this.altConfirmModal = new Modal(this, {
            title: '이 부대로 행동할까요?', w: 540, h: 300,
            body: `${nm} 부대를 활성화합니다.\n활성화는 취소할 수 없고, 이 부대의 행동을 끝낼 때까지 다른 부대를 고를 수 없습니다.`,
            onClose: () => { this.altConfirmModal = null; },
            buttons: [
                { label: '취소' },
                { label: '다시 묻지 않기', onClick: () => e.onSkip?.() },
                { label: '행동', variant: 'primary', onClick: () => e.onYes?.() },
            ],
        });
    }

    placeCursor(animate) {
        const { x, y } = this.store.state.cursor;
        const to = { x: x * TILE, y: y * TILE };
        if (animate) tween(this, { targets: this.cursor, to, duration: 70 });
        else this.cursor.setPosition(to.x, to.y);
    }

    // 초상화(hero scope) 지연 로드: 월드가 서면 참가 유닛(영웅·부대 소속 영웅)의 초상화를 한 번 요청하고, 받을 때마다 화면 갱신(80ms 묶음).
    // 콜백은 씬이 살아 있을 때만 refresh(전환·종료 후 도착하면 무시)
    primePortraits() {
        if (!this.worldBuilt || this.portraitsPrimed) return;
        this.portraitsPrimed = true;
        const us = this.store.state.units;
        const list = Array.isArray(us) ? us : Object.values(us ?? {});
        [...new Set(list.map((u) => u?.hero).filter(Boolean))].forEach((h) => ensurePortraitTex(this, portraitLogical(h), this.onPortrait)); // HUD·칩은 썸네일
    }

    // 결과창 이름용 영웅 스냅샷(hero 코드 -> 이름 필드): 지휘관이 전사해 최종 units 에서 빠져도 결과창에 코드('yi_sun_sin')가 아닌 이름이 나오게.
    // 전투 store 에 둔다(새 전투 = 새 store 로 초기화, 설정 재시작(resume)은 유지)
    rememberHeroes() {
        const st = this.store;
        const list = st?.state?.units;
        if (!Array.isArray(list)) return;
        st.heroSeen ??= new Map();
        list.forEach((u) => {
            if (!u?.hero || !isHeroUnit(u) || st.heroSeen.has(u.hero)) return; // 수레·배(non_hero)는 장수 스냅샷 제외
            st.heroSeen.set(u.hero, { hero: u.hero, display_name: u.display_name, title: u.title, short_name: u.short_name, hero_name: u.hero_name, name_ko: u.name_ko, name: u.name });
        });
    }

    // ================= 화면 갱신 =================
    refresh() {
        if (!this.scene.isActive()) return;
        this.ensureWorld();
        this.rememberHeroes();
        this.primePortraits();
        if (this.worldBuilt) { this.refreshOverlay(); this.refreshObjectives(); }
        if (this.worldBuilt && this.toolObjs && this.followShown !== undefined && this.followShown !== this.followAllowed()) this.buildTools();
        this.refreshHud();
        this.refreshInfo();
        this.refreshLogNotices();
        this.refreshAction();
        this.refreshCard();
        this.refreshInfoBar();
        this.updatePopups();
    }

    // 한 줄 정보 바: 커서(hover/탭) 칸의 유닛 또는 지형. 중요도 순(이름·병종·공·수·HP > 이동·사거리 > 오라 > 소속 > 지형)으로 넘치면 뒤에서부터 숨김
    refreshInfoBar() {
        const s = this.store.state;
        const bar = this.infoBar;
        if (!bar) return;
        if (!this.worldBuilt || s.status !== 'battle') { bar.hide(); this.terrPanel?.setVisible(false); return; } // 지형 패널도 함께(정검수)
        const { x, y } = s.cursor;
        const code = s.map.tiles[y]?.[x];
        if (!code) { bar.hide(); this.terrPanel?.setVisible(false); return; }
        const tName = this.terrainLabel(code);
        const u = this.store.unitAt(x, y);
        // U18: 커서 유닛이 초상화 카드에 이미 보이면(이름·병력·공·수·이동·지형은 카드에 통합) 하단 줄은 숨긴다 — 같은 정보 두 곳 표시 제거·맵 가림 최소화
        if (this.card?.visible) this.terrPanel?.setVisible(false); // 카드와 지형 패널은 번갈아
        if (u && this.card?.visible && this.cardUnitId === u.id) { bar.hide(); return; }
        const segs = [];
        if (u) {
            const t = unitType(u.type);
            const st = this.fx.statsOf?.(u);
            const ratio = Math.max(0, Math.min(1, u.hp / (u.max_hp ?? u.maxHp ?? 1)));
            void ratio;
            const steps = soldierCount(u); // 부대 병사 수 / 영웅 HP 10단계(공용 규칙)
            const enemy = u.team !== 'ally';
            // 이름: 영웅 '칭호 이름 · 병종', 부대 '<영웅>의 <병종>부대'. 좁은 화면은 축약형('이순신 중장갑부대')
            const nm = unitDisplayName(u, s.units, { short: L.lw < 760 || u.kind !== 'troop' }); // 영웅은 이름 중심(칭호 생략: 칭호는 카드 부제)
            // 세로 좁은 폰(정보 띠가 '턴 종료' 앞까지만, 390 약 210): 병종 생략 + 병력 > 공 > 수 순으로 남긴다(강화면 gacha97: 띠에 이름만 남던 문제)
            // 띠 폭(아래 배치와 같은 규칙)이 좁으면(390 세로·667 가로 약 130): 병종 생략 + 이름은 수치보다 먼저 생략(pri 3, 강화면 gacha108: 667 에서 이름만 남고 병력·공·수가 빠짐)
            const lb = this.lay; const barW = lb.portrait ? ((lb.infoX?.x1 ?? lb.right) - lb.left) : lb.infoX ? (this.card?.visible ? lb.infoX.x1 - (this.cardDockX1 != null ? this.cardDockX1 + 8 : lb.infoX.x0) : lb.infoX.x1 - lb.left) : 400; // 가로: 카드가 없으면 띠가 왼쪽 끝부터(아래 배치와 같은 규칙)
            const tight = (this.lay.portrait && L.lw < 480) || barW < 300;
            // 생략 순서(InfoBar 는 pri 큰 것부터 뺀다, gacha109): 지형·소속·오라 -> 이름 -> 사거리 -> 이동 -> 마력. 병력·공·수(pri 1)는 끝까지 남긴다
            segs.push({ text: `[${nm}${u.kind === 'troop' || tight ? '' : ` · ${unitClassName(u.type)}`}]`, color: enemy ? CSS.dangerText : CSS.allyText, bold: true, pri: tight ? 4.6 : 0 });
            segs.push({ text: troopLabel(steps), pri: 1, ico: 'hp' });
            if (st) { segs.push({ text: `${st.atBase}+${st.atBonus}`, pri: 1, ico: 'atk' }); segs.push({ text: `${st.dfBase}+${st.dfBonus}`, pri: 1, ico: 'def' }); } // 공·수 = 아이콘(ico.stat.atk/def) + 수치
            { const mt = mpTextOf(s, u, { short: true }); if (mt) segs.push({ text: mt, pri: 3, ico: 'mp', color: '#9FD8FF' }); } // MP 방식 영웅 마력
            segs.push({ text: `${u.move ?? t.move}`, pri: 4.2, ico: 'move' }); // 이동·사거리 = 아이콘(ico.stat.move/range) + 숫자(글자 생략)
            segs.push({ text: `${t.range_min === t.range_max ? t.range_min : `${t.range_min}-${t.range_max}`}`, pri: 4.4, ico: 'range' });
            const src = auraSources(s.units, u, u.x, u.y);
            if (u.aura && u.kind !== 'troop') segs.push({ text: `오라 ${auraLabel(u.aura)}`, color: '#f0d58c', pri: 4.8 });
            else if (src.length) segs.push({ text: `오라 ${auraLabel(src[0].cmd.aura)}`, color: '#f0d58c', pri: 4.8 });
            { const rt = resistText(u.resists); if (rt) segs.push({ text: rt, color: '#ff9a8a', pri: 4.7 }); } // 속성 약점·내성(0 생략)
            if (u.kind === 'troop' && u.leader_id != null) { const ld = this.store.get(u.leader_id); if (ld) segs.push({ text: `소속 ${heroLabel(ld, { compact: true })}`, color: CSS.muted, pri: 5 }); }
            { const dp = terrainMod(code, t.move_type).def_pct; segs.push({ text: `${tName} 방어 ${dp >= 0 ? '+' : ''}${dp}%`, color: CSS.muted, pri: 6 }); }
        } else {
            const sel = s.selectedId && this.store.get(s.selectedId);
            const mt = sel ? unitType(sel.type).move_type : 'foot';
            const known = !!TERRAINS[code];
            const me = terrainMod(code, mt);
            const mo = terrainMod(code, 'mounted');
            segs.push({ text: `[${tName}]`, color: CSS.accent, bold: true, pri: 0 });
            if (known) {
                segs.push({ text: me.cost === null ? '통행 불가' : `이동 소모 ${me.cost}${mt !== 'mounted' && mo.cost !== me.cost ? ` (기병 ${mo.cost ?? '불가'})` : ''}`, pri: 1 });
                segs.push({ text: `방어 ${me.def_pct >= 0 ? '+' : ''}${me.def_pct}%`, pri: 1 });
            } else segs.push({ text: '이동·방어 보정은 서버 규칙 기준', color: CSS.muted, pri: 2 });
        }
        const l = this.lay;
        if (!l.portrait) {
            const terrOnly = !u && l.infoX && !this.card?.visible; // 지형 정보(유닛 없음): 시안처럼 좌하단(카드 자리)에
            if (terrOnly) { bar.hide(); this.showTerrainPanel(code); return; }
            this.terrPanel?.setVisible(false);
            const x0 = terrOnly ? l.left : l.infoX ? (this.card?.visible ? (this.cardDockX1 != null ? this.cardDockX1 + 8 /* 압축 카드가 '턴 종료' 왼쪽 띠에 도킹: 카드 오른쪽부터(겹침 없음) */ : l.infoX.x0) : l.left) /* 카드가 없으면 카드 자리까지 써서 병력·공·수가 들어가게(gacha109: 667 약 130 폭) */ : l.left + (this.card?.visible && this.card.y >= l.card.y ? l.card.w + 8 : 0); // 카드가 좌상단으로 비켜 있으면 정보 바는 왼쪽 끝부터
            const x1 = terrOnly ? l.left + l.card.w : l.infoX ? l.infoX.x1 : l.tools.x - 8;
            bar.show(segs, { x: x0, y: l.infoY ?? l.bottom - l.infoH, w: Math.max(120, x1 - x0), h: l.infoH }, 'center'); // '턴 종료' 줄 위
        } else {
            const y0 = l.infoY ?? l.bottom + 8 - l.infoH - 6; // 하단 '턴 종료'·도구 줄 위
            const x1 = l.infoX?.x1 ?? l.right; // 강화면 gacha96: 세로 폰 정보 띠가 전폭이라 '턴 종료'를 덮던 문제 -> 같은 줄 왼쪽('턴 종료' 앞까지)만
            bar.show(segs, { x: l.left, y: y0, w: Math.max(120, x1 - l.left), h: l.infoH }, 'center', { fill: true }); // 세로: 도구 줄 위 전폭 띠(강화면 gacha108)
        }
    }

    // '턴 종료' 검 아이콘 + 라벨 가운데 정렬: [아이콘][6][라벨] 묶음을 버튼 가운데에. 라벨이 바뀌면(교대 모드·축소) refreshHud 가 다시 부른다
    placeEndIcon() {
        const b = this.endBtn; const ic = b?.swordIco; if (!ic?.scene) return;
        const sz = ic.displayWidth; const lw = b.label.displayWidth; const tot = sz + 6 + lw;
        ic.setPosition(-tot / 2 + sz / 2, -1); b.label.setOrigin(0.5, 0.5).setX(-tot / 2 + sz + 6 + lw / 2);
    }

    // 안아트 전투 HUD 스킨(@2x PNG, manifest 의 slice 인셋 @2x px): w x h(표시 단위) 슬라이스. 3-slice(t=b=0) 는 높이 기준 균일 배율
    hudSlice(k, w, h, ins) {
        const fr = this.textures.getFrame(k); const fh = fr?.realHeight || 64;
        if (!ins.t && !ins.b) { const sc = h / fh; return this.add.nineslice(0, 0, k, undefined, Math.max(ins.l + ins.r + 2, w / sc), fh, ins.l, ins.r, 0, 0).setOrigin(0).setScale(sc); }
        return this.add.nineslice(0, 0, k, undefined, w * 2, h * 2, ins.l, ins.r, ins.t, ins.b).setOrigin(0).setScale(0.5);
    }

    // 지형 정보 패널(시안 좌하단 금테 3줄): [지형 아이콘] 이름 / [이동] 이동 소모 N(기병 M) / [방어] 방어 +N%. 자산 키(ui.battle.terrain_panel·terrain_<종류>·icon_move·icon_defense)가 있으면 이미지, 없으면 코드(스킨 패널·코드 아이콘·글자)
    showTerrainPanel(code) {
        const l = this.lay; const s = this.store.state;
        const sel = s.selectedId && this.store.get(s.selectedId);
        const mt = sel ? unitType(sel.type).move_type : 'foot';
        const me = terrainMod(code, mt); const mo = terrainMod(code, 'mounted');
        const known = !!TERRAINS[code];
        const name = this.terrainLabel(code);
        const kind = /forest|wood|jungle|bamboo/.test(code) ? 'forest' : /mountain|hill|cliff|highland/.test(code) ? 'mountain' : /water|river|sea|shallow|swamp|lake|marsh|reef/.test(code) ? 'water' : /castle|wall|fort|gate/.test(code) ? 'castle' : /sand|desert|dune/.test(code) ? 'sand' : 'plain';
        const key = `${code}|${mt}`;
        const w = Math.min(260, l.card.w); const h = L.short ? 66 : 84;
        const x = l.left; const y = l.bottom - h;
        if (!this.terrPanel?.scene) {
            const c = this.add.container(x, y); this.ui.add(c); this.terrPanel = c;
            const bg = slice(this, 'panel_hud', w, h, 'panel'); c.add(bg); c.bgW = bg;
            const g = this.add.graphics(); g.lineStyle(1.5, COLOR.accent, 0.95).strokeRect(1, 1, w - 2, h - 2); c.add(g); c.frameG = g;
            withUiImage(this, 'ui.battle.terrain_panel', (k) => { if (!c.scene) return; bg.setVisible(false); g.setVisible(false); c.addAt(this.hudSlice(k, w, h, { l: 22, r: 22, t: 22, b: 22 }), 0); });
            const fs1 = L.short ? 14 : 16; const fs2 = L.short ? 11 : 13;
            c.ico = this.add.container(16, h * 0.24); c.add(c.ico);
            c.t1 = makeText(this, 32, h * 0.24, '', { size: fs1, bold: true, color: CSS.accent, origin: [0, 0.5] });
            c.i2 = this.add.container(16, h * 0.56); c.i3 = this.add.container(16, h * 0.82);
            c.t2 = makeText(this, 32, h * 0.56, '', { size: fs2, color: CSS.text, origin: [0, 0.5] });
            c.t3 = makeText(this, 32, h * 0.82, '', { size: fs2, color: CSS.text, origin: [0, 0.5] });
            c.add([c.t1, c.i2, c.i3, c.t2, c.t3]);
            const lineIcon = (box, lg, glyph) => { const t = makeText(this, 0, 0, glyph, { size: fs2, bold: true, color: CSS.accent, origin: [0.5, 0.5] }); box.add(t); withUiImage(this, lg, (k) => { if (!box.scene) return; t.setVisible(false); box.add(this.add.image(0, 0, k).setDisplaySize(16, 16)); }); };
            lineIcon(c.i2, 'ui.battle.ico.move_cost', '⇢'); lineIcon(c.i3, 'ui.battle.ico.defense', '◆');
        }
        const c = this.terrPanel; c.setVisible(true);
        if (c.key === key) return; c.key = key;
        c.ico.removeAll(true);
        const ci = icon(this, kind === 'castle' || kind === 'sand' ? 'plain' : kind, 18); if (ci) c.ico.add(ci);
        withUiImage(this, `ui.battle.ico.terrain.${kind}`, (k) => { if (!c.ico.scene || c.key !== key) return; c.ico.removeAll(true); c.ico.add(this.add.image(0, 0, k).setDisplaySize(20, 20)); });
        c.t1.setText(name);
        c.t2.setText(!known ? '이동 보정은 서버 규칙 기준' : me.cost === null ? '통행 불가' : `이동 소모 ${me.cost}${mt !== 'mounted' && mo.cost !== me.cost ? ` (기병 ${mo.cost ?? '불가'})` : ''}`);
        c.t3.setText(known ? `방어 ${me.def_pct >= 0 ? '+' : ''}${me.def_pct}%` : '');
    }

    // 커서(hover) 또는 선택 유닛의 초상화 카드(아군·적 공통). 부대는 소속 영웅(leader_id, 없으면 같은 진영 지휘관) 초상화
    refreshCard() {
        const s = this.store.state;
        if (!this.card?.scene) return; // 파괴된 카드(씬 재시작 사이 이전 실행 참조)면 무시: 파괴된 객체의 setInteractive -> this.scene.sys 접근 오류
        const cu = this.worldBuilt ? this.store.unitAt(s.cursor.x, s.cursor.y) : null;
        const sel = s.selectedId && this.store.get(s.selectedId);
        // 커서(hover/키보드) 유닛은 아군·적 모두 카드 표시. 단 그 유닛 칸이 카드 자리와 겹치면 카드가 클릭을 가로채므로 hover 카드는 띄우지 않는다.
        // 카드에 띄울 유닛(초점) 후보를 먼저 정하고 그 유닛 기준으로 자리를 고른다(초점 유닛이 카드에 가려질 때만 좌상단으로)
        const focus0 = this.touch ? (sel || (this.userCursor ? cu : null)) : ((this.userCursor ? cu : null) || sel);
        const compact = this.cardCompact(); // 모바일(터치 + 세로/가로 폰/좁은 폭): 초상·게이지 없는 한 줄 띠(2026-11-14 사용자 제보). 데스크톱은 기존 그대로
        const slot = compact ? this.compactCardSlot(focus0) : this.cardSlot(focus0); // 기본 좌하단 도킹, 초점 유닛이 그 자리 정보 패널에 가려지면 좌상단
        const pm = compact ? 0 : this.cardPortMax(slot); // 큰 초상 높이(아래 유닛을 가리면 축소, 그래도 가리면 생략)
        const hov = cu && !this.cardHits(cu, slot, pm) ? cu : null; // 정보 패널 + 초상 액자
        // 우선순위: 마우스/키보드는 hover 우선(커서가 빈 칸으로 가면 선택 유닛으로 복귀), 터치는 기존대로 선택 우선(탭 동작 유지)
        // 전투 시작 시 커서가 자동으로 지휘관 칸에 놓이므로, 사용자가 커서를 움직이기 전(userCursor=false)에는 커서 카드를 띄우지 않는다(하플레이·강화면 gacha78: 터치는 this.touch 가 첫 터치 전까지 false 라 데스크톱 규칙으로 떠 있었음).
        //  이후: 마우스·키보드 = hover 우선, 터치 = 선택 우선(기존)
        const hv = this.userCursor ? hov : null;
        const u = this.touch ? (sel || hv) : (hv || sel);
        this.cardState = { visible: !!u, unit: u?.id ?? null, userCursor: !!this.userCursor }; // QA 확인용(__qa.card)
        this.cardDockX1 = compact && slot?.dock && u && s.status === 'battle' ? slot.x + slot.w : null; // '턴 종료' 왼쪽 띠에 도킹한 압축 카드 오른쪽 끝(정보 띠는 그 오른쪽부터, refreshInfoBar)
        if (!u || s.status !== 'battle') { this.card.hide(); this.cardUnitId = null; return; }
        if (this.card.x !== slot.x || this.card.y !== slot.y) this.card.setPosition(slot.x, slot.y);
        this.card.w = slot.w; this.card.h = slot.h; // 압축형 <-> 기본 전환 시 크기(contains·배경 그리기 기준)
        this.card.portMax = pm;
        const leader = u.kind !== 'troop' ? u : (u.leader_id != null ? this.store.get(u.leader_id) : s.units.find((x) => x.side === u.side && x.kind === 'commander' && x.hp > 0)) ?? null;
        const sqSt = s.alternate ? s.alt?.squads?.find((q) => q.unitIds.includes(String(u.id)))?.status : null; // 교대: 부대 상태
        const status = u.acted ? '행동 완료' : u.moved ? '이동 완료' : sqSt === 'done' ? '부대 행동 완료' : (u.npc_ally ? '지원(자동 행동)' : u.team === 'ally' && s.side === 'ally' ? (sqSt === 'active' ? '활성 부대' : '행동 가능') : '');
        // U18: 하단 한 줄 정보(공·수·이동·사거리·지형)를 카드로 통합. 중요도 순 — 카드 폭을 넘으면 뒤에서부터 생략
        const t = unitType(u.type);
        const st = this.fx.statsOf?.(u);
        const code = s.map?.tiles?.[u.y]?.[u.x];
        const stats = [];
        if (st) stats.push(`공 ${st.atBase}+${st.atBonus}`, `수 ${st.dfBase}+${st.dfBonus}`);
        stats.push(`이동 ${u.move ?? t.move}`, `사거리 ${t.range_min === t.range_max ? t.range_min : `${t.range_min}-${t.range_max}`}`);
        if (code) { const dp = terrainMod(code, t.move_type).def_pct; stats.push(`${this.terrainLabel(code)} 방어 ${dp >= 0 ? '+' : ''}${dp}%`); }
        const hero = isHeroUnit(u); // 수레·배(non_hero)는 장수 카드(칭호·영웅 초상) 대신 일반 유닛 카드
        const mpTxt = mpTextOf(s, u); // MP 방식 영웅 마력(가로 폰 = 능력치 줄 맨 앞 글자, 그 외 카드 MP 바)
        if (compact) { // 한 줄: 이름 · 병종 · 병력 · (마력) · 공 · 방 · 이동 · 범위 · (지형 방어, 0%면 생략) / 둘째 줄: 강함·약함(배율 생략, 최대 3종)
            const tdp0 = code ? terrainMod(code, t.move_type).def_pct : 0;
            const mo = u.type ? matchupOf(u.type) : { strong: [], threats: [] };
            const parts = [{ t: troopLabel(soldierCount(u)), keep: true }, mpTextOf(s, u, { short: true }), st ? { t: `공 ${st.atBase + st.atBonus}`, keep: true } : '', st ? { t: `방 ${st.dfBase + st.dfBonus}`, keep: true } : '', `이동 ${u.move ?? t.move}`, `범위 ${t.range_min === t.range_max ? t.range_min : `${t.range_min}-${t.range_max}`}`, status, code && tdp0 ? `${this.terrainLabel(code)} 방어 ${tdp0 > 0 ? '+' : ''}${tdp0}%` : ''].filter(Boolean);
            if (!mo.strong.length && !(mo.threats ?? []).length && this.card.h > 22) { const dy = slot.atTop ? 0 : this.card.h - 22; this.card.h = 22; if (dy) this.card.setPosition(slot.x, slot.y + dy); } // 상성 줄 없음: 한 줄 높이(아래 도킹이면 아래 끝 유지)
            this.card.show(u, leader, { compact: { name: hero ? heroLabel(u, { compact: true }) : unitDisplayName(u, s.units), shortName: unitDisplayName(u, s.units, { short: true }), cls: unitClassName(u.type), parts, strong: mo.strong.slice(0, 3).map((x) => unitClassName(x.type)), weak: (mo.threats ?? []).slice(0, 3).map((x) => unitClassName(x.type)) } });
            this.card.bg?.disableInteractive(); // 입력 비소비(이동 칸·대상 탭이 그대로 맵으로)
            this.cardUnitId = u.id;
            return;
        }
        // 이름 중심 + 칭호 부제(영웅). 부대는 '<영웅>의 <부대명>'(넘치면 축약형)
        // 게이지용 수치(공·수 = [기본, 보정], 이동, 사거리 [min,max]) + 지형 한 줄
        const gauges = { at: st ? [st.atBase, st.atBonus] : null, df: st ? [st.dfBase, st.dfBonus] : null, move: u.move ?? t.move, range: [t.range_min, t.range_max] };
        const tdp = code ? terrainMod(code, t.move_type).def_pct : 0;
        const terrain = code ? `${this.terrainLabel(code)} 방어 ${tdp >= 0 ? '+' : ''}${tdp}%` : ''; // 음수는 '-10%'(기존 '+-10%' 표기 수정)
        this.card.show(u, leader, { status, name: hero ? heroLabel(u, { compact: true }) : unitDisplayName(u, s.units), shortName: unitDisplayName(u, s.units, { short: true }), title: hero ? (u.title || null) : null, stats: L.short ? [mpTxt, terrain, ...stats.slice(0, stats.length - (code ? 1 : 0))].filter(Boolean) : stats, gauges: L.short ? null : gauges, terrain: L.short ? '' : terrain, mpMode: !!s.mpMode, mpInline: !!L.short, resist: resistText(u.resists) }); // 가로 폰: 게이지 2x2 생략(카드 높이 82), 지형을 능력치 줄 맨 앞에(아래 지형 줄은 높이 부족으로 잘렸다, 강화면 gacha43)
        // 이동·대상 선택 중엔 카드가 클릭을 가로채지 않게(카드 아래 이동 범위·대상 칸도 탭 가능, 2026-11-03 사용자 제보). 그 외 단계는 기존대로 입력 소비
        if (this.card.bg?.input) { if (s.phase === 'move' || s.phase === 'target') this.card.bg.disableInteractive(); else this.card.bg.setInteractive(); } else if (this.card.visible && s.phase !== 'move' && s.phase !== 'target') this.card.bg?.setInteractive();
        this.cardUnitId = u.id;
    }

    // 지형 표시 이름(rules TERRAINS > 보조표 > 코드)
    terrainLabel(code) {
        const TN = { shallows: '여울', bridge: '다리', road: '도로', swamp: '늪', snow_desert: '설원', cliff: '절벽', wall: '성벽', village: '마을' };
        return TERRAINS[code]?.name ?? TN[code] ?? code;
    }

    // 유닛 칸(화면 좌표)이 초상화 카드 자리와 겹치는지(카드 배경이 입력을 소비하므로 hover 카드 표시 판단용)
    underCard(u) { const sl = this.cardSlot(u); return this.cardHits(u, sl, this.card?.portMax ?? sl?.portMax ?? 0); }

    // 초상 액자 사각형(PortraitCard.buildPortrait 와 같은 규칙: 위 공간(상단 바 아래)이 되면 패널 위, 아니면 패널 아래)
    portRectOf(slot, pm) {
        if (!slot || !(pm > 0)) return null;
        const above = slot.y - pm >= this.lay.barH + 8;
        return { x: slot.x, y: above ? slot.y - pm : slot.y + slot.h, w: Math.round(pm * 0.75), h: pm };
    }
    cardHits(u, slot, pm) { return this.tileHits(u, slot) || this.tileHits(u, this.portRectOf(slot, pm)); }
    // 초상 높이: 기본 상한 -> 아군·적 유닛을 가리면 60% -> 그래도 가리면 0(초상 생략, 정보 패널만). 교대 모드 세로 화면은 부대 칩 줄이 액자 위에 오므로 그대로
    cardPortMax(slot) {
        let full = slot?.portMax ?? this.lay?.card?.portMax ?? 0;
        if (!full || !this.worldBuilt) return full;
        // 좌상단 목표 패널(항상 전체 표시라 길어질 수 있음)과 겹치지 않게: 패널 위 초상이면 패널 아래 끝까지만(60 미만이면 생략)
        const O = this.subObjBox?.scene && this.subObjBox.visible !== false ? this.subObjRect : null;
        if (O && O.x < slot.x + slot.w && O.x + O.w > slot.x && slot.y > O.y && slot.y - full >= this.lay.barH + 8) { const room = slot.y - (O.y + O.h) - 6; if (room < full) full = room >= 60 ? Math.floor(room) : 0; if (!full) return 0; } // 초상이 패널 위로 갈 때(portRectOf above)만 패널 아래 끝까지로 제한. 아래로 가는 초상(좌상단 도킹)은 패널과 무관(정검수)
        const hit = (pm) => this.store.alive().some((x) => this.tileHits(x, this.portRectOf(slot, pm)));
        if (!hit(full)) return full;
        const small = Math.round(full * 0.6);
        return hit(small) ? 0 : small;
    }

    // 칸(u.x, u.y)의 화면 사각형이 rect 와 겹치는지
    tileHits(u, c) {
        const w = this.world;
        if (!c || !w || !u) return false;
        const x0 = w.x + u.x * TILE * w.scaleX; const y0 = w.y + u.y * TILE * w.scaleY;
        const x1 = x0 + TILE * w.scaleX; const y1 = y0 + TILE * w.scaleY;
        return x1 > c.x && x0 < c.x + c.w && y1 > c.y && y0 < c.y + c.h;
    }

    // 초상화 카드 자리(가로 화면만): 기본 좌하단(lay.card). 그 자리에 살아 있는 유닛이 있고 좌상단(상단 바·안내 배너 아래)이 더 적게 가리면 좌상단.
    // 하단 아군 유닛·타일이 카드에 가려지는 문제 완화(카메라·줌은 그대로, HUD 위치만). 세로 화면은 상단에 도구 줄이 있어 기존 자리 유지
    // 2026-11-04 사용자 '부대 정보가 왜 위로 붙어?': 이전엔 좌하단 자리(정보 패널 + 큰 초상 액자, 데스크톱 초상 최대 230 높이)에 '아무' 유닛이라도 걸리면
    //  덜 가리는 좌상단(턴 배너·목표 패널 아래)으로 옮겨, 1280 에서 배너 -> 목표 -> 카드가 위쪽에 한 열로 쌓였다(초상은 이미 cardPortMax 가 가리면 줄이거나 생략하는데도).
    //  지금: 기본 = 좌하단 도킹(도구 열·턴 종료와 다른 쪽). 좌상단으로 옮기는 경우 = 카드에 띄우는 초점 유닛(선택/hover) 자체가 좌하단 정보 패널에 가려질 때만
    //  (다른 유닛 가림은 초상 축소·생략으로 처리). 좌상단도 그 유닛을 가리면 좌하단 유지
    // 모바일 압축 카드 사용 여부: 터치 입력 + (세로 화면 | 가로 폰 L.short | 논리 폭 < 760). 마우스(데스크톱)는 항상 기존 카드
    cardCompact() { return !!this.touch && !!this.lay && (!!this.lay.portrait || !!L.short || L.lw < 760); }

    // 압축 카드 자리(높이 40 = 능력치 한 줄 + 상성 한 줄): 하단 정보 띠 바로 위 전폭(가로 폰은 '턴 종료' 열 앞까지, 최대 560).
    //  초점 유닛 칸이 그 띠에 가려지면 상단(칩 줄·안내 배너·목표 패널 아래)으로. 상단도 가리면 하단 유지
    // 2026-11-14 사용자 '턴 종료 왼쪽에 우겨넣기': 가로 화면이고 '턴 종료' 왼쪽 줄(left ~ endBtn.x - 8)이 400 이상이면 그 줄(턴 종료와 같은 높이 띠, 아래 끝 = bottom)에
    //  카드(왼쪽, 폭 = min(400, 줄 - 8 - 160)) + 정보 띠(오른쪽, 160 이상)를 나란히 둔다(dock: true -> refreshInfoBar 가 카드 오른쪽부터 정보 띠를 그림).
    //  844x390(논리 938x433): 줄 650 -> 카드 400 + 띠 242 / 667x375(논리 741x417): 줄 453 -> 카드 285 + 띠 160. 세로 폰(390: 줄 145)·568 가로(줄 343)는 기존 위치
    compactCardSlot(focus = null) {
        const l = this.lay; const h = 40;
        const row = l.endBtn ? l.endBtn.x - 8 - l.left : 0;
        let d;
        // 도구 격자 전환(2026-11-14, 가로 폰 열 폭 264 -> 160): 844 줄 650 -> 746(카드 상한 400 -> 460, 띠 278) / 667 줄 453 -> 549(카드 285 -> 381, 띠 160)
        if (!l.portrait && row >= 400) d = { x: l.left, y: l.bottom - h, w: Math.round(Math.min(l.toolGrid ? 460 : 400, row - 8 - 160)), h, portMax: 0, dock: true };
        // 세로 폰('턴 종료' = 도구 격자 열 폭 112, battleLayout): 줄 전체를 카드가 쓴다(정보 띠는 바로 위 줄 = 격자 왼쪽, 다른 줄이라 겹침 없음). 아래 끝 = bottom(턴 종료 44와 아래 정렬)
        //  390x844(논리 433): 줄 273 -> 289 / 360x740(논리 400): 줄 240 -> 256 / 412x915(논리 458): 줄 298 -> 314. 넓은 세로(태블릿, 턴 종료 미축소)는 기존 위치
        else if (l.portrait && l.endNarrow && row >= 220) d = { x: l.left, y: l.bottom - h, w: Math.round(Math.min(400, row)), h, portMax: 0, dock: true };
        else {
            const x1 = l.portrait ? (l.toolGrid ? l.tools.x - 8 : l.right) : Math.min(l.left + 560, (l.endBtn?.x ?? l.right) - 8); // 세로 도구 격자: 격자 왼쪽까지(정보 띠 위 줄이 격자 옆)
            d = { x: l.left, y: (l.infoY ?? l.bottom - l.infoH) - 6 - h, w: Math.max(200, x1 - l.left), h, portMax: 0 };
        }
        if (!focus || !this.worldBuilt || !this.tileHits(focus, d)) return d;
        let ay = l.barH + 8;
        const B = this.panelB;
        if (B?.shown && B.x < d.x + d.w && B.x + (B.w ?? 0) > d.x) ay = Math.max(ay, B.y + (B.h ?? l.B.h) + 6);
        const O = this.subObjBox?.scene && this.subObjBox.visible !== false ? this.subObjRect : null;
        if (O && O.x < d.x + d.w && O.x + O.w > d.x) ay = Math.max(ay, O.y + O.h + 6);
        const a = { ...d, y: ay, atTop: true, dock: false }; // 상단 대체 자리: 정보 띠는 기존 자리(카드와 무관)
        return this.tileHits(focus, a) ? d : a;
    }

    cardSlot(focus = null) {
        const d = this.lay?.card;
        if (!d || this.lay.portrait || !this.worldBuilt) return d;
        if (!focus || !this.tileHits(focus, d)) return d;
        const B = this.panelB;
        let ay = this.lay.barH + 8;
        if (B?.shown && B.x < d.x + d.w && B.x + (B.w ?? 0) > d.x) ay = Math.max(ay, B.y + (B.h ?? this.lay.B.h) + 6); // 배너와 가로로 겹치면 그 아래
        const O = this.subObjBox?.scene && this.subObjBox.visible !== false ? this.subObjRect : null; // 목표·패배 조건 패널(좌상단)과 가로로 겹치면 그 아래(ch103_s1: 글자 섞임)
        if (O && O.x < d.x + d.w && O.x + O.w > d.x) ay = Math.max(ay, O.y + O.h + 6);
        const a = { x: d.x, y: ay, w: d.w, h: d.h, portMax: d.portMax };
        return this.tileHits(focus, a) ? d : a;
    }

    refreshOverlay() {
        const s = this.store.state;
        this.overlay.removeAll(true);
        this.auraGfx.clear();
        const g = this.add.graphics();
        this.overlay.add(g);
        const rect = (t, inset = 0) => [t.x * TILE + inset, t.y * TILE + inset, TILE - inset * 2, TILE - inset * 2];

        const sel = s.selectedId && this.store.get(s.selectedId);
        // rm 지형(밝은 회화풍 바닥) 위 대비 보강: 선택 링 아래 어두운 외곽선, 이동 범위는 옅은 면 + 범위 외곽선(ink+청색). legacy 는 기존 그대로
        const rmHi = !!this.ground;
        if (sel && rmHi) g.lineStyle(7, COLOR.ink, 0.6).strokeRect(...rect(sel, 2));
        if (sel) { g.lineStyle(4, COLOR.accent, 1).strokeRect(...rect(sel, 2)); g.lineStyle(2, COLOR.accentLight, 0.8).strokeRect(...rect(sel, 5)); }
        if (s.phase === 'move') {
            const mover = sel;
            if (rmHi) {
                const inR = new Set(s.standableTiles.map((t) => `${t.x},${t.y}`));
                const edges = [];
                s.standableTiles.forEach((t) => {
                    const X = t.x * TILE; const Y = t.y * TILE;
                    if (!inR.has(`${t.x},${t.y - 1}`)) edges.push([X, Y, X + TILE, Y]);
                    if (!inR.has(`${t.x},${t.y + 1}`)) edges.push([X, Y + TILE, X + TILE, Y + TILE]);
                    if (!inR.has(`${t.x - 1},${t.y}`)) edges.push([X, Y, X, Y + TILE]);
                    if (!inR.has(`${t.x + 1},${t.y}`)) edges.push([X + TILE, Y, X + TILE, Y + TILE]);
                });
                [[5, COLOR.ink, 0.6], [2.5, 0x8fc0ff, 1]].forEach(([w, c, a]) => { g.lineStyle(w, c, a); edges.forEach(([x1, y1, x2, y2]) => g.lineBetween(x1, y1, x2, y2)); });
            }
            s.standableTiles.forEach((t) => {
                // (2026-11) 풀(녹색) 위에서 옅은 청색 면이 섞여 청록으로 묻혀 보이던 것 보강: 녹색과 먼 남청색 면을 조금 더 진하게 + 칸마다 밝은 안쪽 테두리(지면에 없는 격자 무늬로 구분)
                if (rmHi) { g.fillStyle(0x2f5fe0, 0.4).fillRect(...rect(t)); g.lineStyle(1.5, 0xdcecff, 0.75).strokeRect(...rect(t, 2.5)); }
                else { g.fillStyle(COLOR.move, 0.5).fillRect(...rect(t)); g.lineStyle(1, 0xb6d4fa, 0.9).strokeRect(...rect(t, 1)); }
                // 수상 칸 표시(표시 전용, 칸 목록은 서버 reachable 그대로): 수병의 수상 칸 = 좌하단 물결 2줄(하늘색), 비수병의 탑승 칸 = 좌하단 배 모양(밝은 갈색)
                const wk = mover ? moveTileKind(mover, s.map.tiles?.[t.y]?.[t.x]) : null;
                if (wk) this.drawWaterMark(g, t, wk);
                // 이동 미리보기: 이 칸에 서면 받는 오라(우상단 작은 마름모, 오라 종류색)
                if (mover) {
                    const src = auraSources(s.units, mover, t.x, t.y);
                    if (src.length) {
                        const a = src.reduce((p, c) => ({ atk_pct: p.atk_pct + c.atk, def_pct: p.def_pct + c.def }), { atk_pct: 0, def_pct: 0 });
                        const cx = t.x * TILE + TILE - 9; const cy = t.y * TILE + 9;
                        g.fillStyle(AURA_COLOR[auraKind(a)], 1).fillTriangle(cx, cy - 6, cx + 6, cy, cx, cy + 6).fillTriangle(cx, cy - 6, cx - 6, cy, cx, cy + 6);
                        g.lineStyle(1, 0x0b1020, 1).strokeTriangle(cx, cy - 6, cx + 6, cy, cx, cy + 6).strokeTriangle(cx, cy - 6, cx - 6, cy, cx, cy + 6);
                    }
                }
            });
        }
        // 교대 행동: 활성 부대가 아닌 유닛을 눌렀을 때 서버 미리보기(preview_tiles/targets)를 흐리게(행동 불가 표시, 회색 테두리)
        const lp = s.lockedPreview;
        if (lp && s.phase === 'idle') {
            lp.tiles.forEach((t) => { g.fillStyle(COLOR.move, 0.16).fillRect(...rect(t)); g.lineStyle(1, 0xb6d4fa, 0.4).strokeRect(...rect(t, 2)); });
            lp.targets.forEach((tt) => { const p = tt && typeof tt === 'object' && tt.x != null ? tt : this.store.get(tt?.id ?? tt); if (p) g.lineStyle(2, COLOR.danger, 0.55).strokeRect(...rect(p, 3)); });
            const pu = this.store.get(lp.unitId);
            if (pu) g.lineStyle(3, COLOR.muted, 0.9).strokeRect(...rect(pu, 2));
        }
        if (s.phase === 'target' || s.phase === 'confirm') {
            const skillMode = s.targetMode === 'skill'; // 스킬 대상: 적색 면 + 적색 굵은 테두리(일반 공격은 금색 테두리)
            const stk = skillMode ? (s.skill?.target_kind ?? 'enemy') : null;
            const support = stk === 'ally' || stk === 'self' || stk === 'none'; // 아군·자신 중심 스킬: 범위 = 청록 면(공격 빗금 아님), 대상 = 청록·금 테두리
            (s.targetMode === 'item' ? [] : s.attackTiles).forEach((t) => { // 소모품 대상(자신·인접 아군): 공격 빗금 없이 금색 테두리만
                if (support) { g.fillStyle(COLOR.ally, 0.22).fillRect(...rect(t)); if (rmHi) g.lineStyle(4, COLOR.ink, 0.5).strokeRect(...rect(t, 1)); g.lineStyle(2, COLOR.ally, 0.95).strokeRect(...rect(t, 1)); return; }
                this.overlay.add(this.add.image(t.x * TILE, t.y * TILE, 'hatch').setOrigin(0).setDisplaySize(TILE, TILE).setAlpha(0.55));
                if (rmHi) g.lineStyle(4, COLOR.ink, 0.6).strokeRect(...rect(t, 1));
                g.lineStyle(2, COLOR.danger, 1).strokeRect(...rect(t, 1));
            });
            if (support && sel && stk !== 'ally') { // 자신 중심: 반경 안 아군(효과 받는 쪽) = 얇은 청록 테두리, 클릭 대상(시전자)은 아래 굵은 금 테두리
                const inR = new Set(s.attackTiles.map((t) => `${t.x},${t.y}`));
                this.store.alive().forEach((a) => { if (a.team === sel.team && a.id !== sel.id && inR.has(`${a.x},${a.y}`)) g.lineStyle(3, COLOR.ally, 1).strokeRect(...rect(a, 3)); });
            }
            s.targets.forEach((id) => { const u = this.store.get(id); if (!u) return; if (support) { g.fillStyle(COLOR.accent, 0.28).fillRect(...rect(u)); g.lineStyle(5, COLOR.accent, 1).strokeRect(...rect(u, 2)); g.lineStyle(2, 0xffffff, 0.85).strokeRect(...rect(u, 6)); } else if (skillMode) { g.fillStyle(COLOR.danger, 0.32).fillRect(...rect(u)); g.lineStyle(5, COLOR.danger, 1).strokeRect(...rect(u, 2)); g.lineStyle(2, 0xffe08a, 0.9).strokeRect(...rect(u, 6)); } else g.lineStyle(4, COLOR.accent, 1).strokeRect(...rect(u, 2)); });
            s.targets.forEach((id) => { const u = this.store.get(id); if (!u || u.team === 'ally') return; const cx = u.x * TILE + TILE / 2; const ty = u.y * TILE - 2; g.fillStyle(COLOR.danger, 1).fillTriangle(cx - 7, ty - 10, cx + 7, ty - 10, cx, ty).lineStyle(1.5, 0x2a0a0a, 0.9).strokeTriangle(cx - 7, ty - 10, cx + 7, ty - 10, cx, ty); }); // 대상 표식(시안: 적 머리 위 붉은 ▼)
            if (s.targetMode === 'item' && sel) this.store.itemTargets(sel).targets.filter((id) => !s.targets.includes(id)).forEach((id) => { const a = this.store.get(id); if (a) { g.fillStyle(0x000000, 0.25).fillRect(...rect(a)); g.lineStyle(2, COLOR.muted, 0.8).strokeRect(...rect(a, 2)); } }); // 회복약: 병력 가득(대상 제외) 인접 아군 = 회색(비활성)
            const tgt = s.targetId && this.store.get(s.targetId);
            if (tgt) g.fillStyle(COLOR.accent, 0.3).fillRect(...rect(tgt));
            // 방향 on: 후면/측면으로 때릴 수 있는 대상 타일을 색 + 글자로 표시(접근성: 색만으로 구분하지 않는다)
            if (s.facingOn && sel && s.targetMode !== 'item') {
                s.targets.forEach((id) => {
                    const f = this.store.get(id);
                    const fl = f ? flankOf(sel.x, sel.y, f) : 'none';
                    if (fl === 'none') return;
                    g.fillStyle(fl === 'back' ? COLOR.danger : 0xe08a2a, 0.45).fillRect(...rect(f, 3));
                    this.overlay.add(makeText(this, f.x * TILE + TILE / 2, f.y * TILE + 4, FLANK_LABEL[fl], { size: 12, bold: true, color: '#ffffff', origin: [0.5, 0], stroke: { color: '#0B1020', width: 3 } }));
                });
            }
        }
        // 방향 선택 중 미리보기(선택 유닛 마커) / 단계를 벗어나면 서버 값으로 복원
        // 방향 선택 미리보기: 규칙 on = 서버 facing(마커 포함), off = 표시용 시선만(마커·보너스 없음). 확정되면 유지, 취소면 원래 시선 복원
        if (this.facingPreviewId && (s.phase !== 'facing' || this.facingPreviewId !== s.selectedId)) {
            const pv = this.views.get(this.facingPreviewId);
            const pu = this.store.get(this.facingPreviewId);
            if (s.facingOn) pv?.setFacing(pu?.facing ?? null);
            else if (pv && !this.facingCommitted && this.facingPrevLook) { pv.look = null; pv.setLook(this.facingPrevLook); }
            this.facingPreviewId = null; this.facingCommitted = false;
        }
        if (s.phase === 'facing' && s.selectedId && s.facingChoice) {
            const v = this.views.get(s.selectedId);
            if (this.facingPreviewId !== s.selectedId) this.facingPrevLook = v?.look ?? null;
            if (s.facingOn) v?.setFacing(s.facingChoice); else v?.setLook(s.facingChoice);
            this.facingPreviewId = s.selectedId;
        }
        this.drawMovePreview(s, sel, g);
        const ga = this.add.graphics(); // 오라 범위: 하이라이트 위에 희미하게(입력 없음)
        this.overlay.add(ga);
        this.drawAuras(s, rect, ga);
        this.drawSquad(s, rect, ga);
        // 교대 행동: 활성 부대 중 아직 행동하지 않은 유닛을 금색 모서리 표시(내 차례일 때만)
        if (s.alternate && s.alt?.activeSquad && s.side === 'ally' && s.status === 'battle') {
            const q = s.alt.squads.find((x) => x.id === s.alt.activeSquad);
            (q?.unitIds ?? []).forEach((id) => {
                const u = this.store.get(id);
                if (!u || u.hp <= 0 || u.acted || id === s.selectedId) return;
                const [x, y, w, h] = rect(u, 3); const k = 10;
                ga.lineStyle(3, COLOR.accent, 0.95);
                [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([cx, cy, dx, dy]) => { ga.lineBetween(cx, cy, cx + k * dx, cy); ga.lineBetween(cx, cy, cx, cy + k * dy); });
            });
        }
        this.views.forEach((v, id) => { const u = this.store.get(id); if (u) v.setActed(this.dimOf(u, s)); v.setSelected(id === s.selectedId); });
        this.expandNames();
        this.refreshAuraBadges(s);
    }

    // 이동 미리보기(2026-11-03 UX): ① 이동 칸 선택 중(phase move) 커서(마우스 호버·키보드)가 이동 가능 칸이면 그 칸까지의 실제 경로(store reach 역추적)를
    // 점선 화살표로, ② 목적지를 고른 뒤 확정 전(임시 이동 상태: menu/skill/target/confirm/facing)에는 출발 칸 -> 현재 칸 경로(store.movePath)를 표시.
    // 터치는 탭 = 즉시 임시 이동이라 ②로 확인한다. 자동 추종 on(followOn) + 영웅 이동이면 소속 병사의 '예상' 도착 칸을 옅은 마커로(서버 판정과 다를 수 있음).
    // 추종 예상은 목적지가 바뀔 때만 다시 계산(cache)해 호버 비용을 줄인다.
    drawMovePreview(s, sel, g) {
        if (!sel || s.side !== 'ally' || s.status !== 'battle') { this.followPv = null; return; }
        let origin = null; let path = null;
        if (s.phase === 'move' && s.reach && (s.cursor.x !== sel.x || s.cursor.y !== sel.y) && s.standableTiles.some((t) => t.x === s.cursor.x && t.y === s.cursor.y)) {
            origin = { x: sel.x, y: sel.y }; path = pathTo(s.reach, s.cursor.x, s.cursor.y);
        } else if (s.moved && s.origin && s.movePath?.length && ['menu', 'skill', 'item', 'target', 'confirm', 'facing'].includes(s.phase)) {
            origin = s.origin; path = s.movePath;
        }
        if (!path?.length) { this.followPv = null; return; }
        drawMovePath(g, origin, path, TILE);
        if (!this.followOn() || sel.kind === 'troop') return;
        const dest = path[path.length - 1];
        const key = `${sel.id}:${dest.x},${dest.y}:${s.turn}:${s.units.reduce((n, u) => n + (u.acted || u.moved ? 1 : 0), 0)}`; // 같은 턴에 다른 유닛이 움직이면 다시 계산
        if (this.followPv?.key !== key) {
            let marks = [];
            try { marks = predictFollowers(s.map, s.units, sel, dest, this.store.followCandidates()); } catch (e) { console.warn('[battle] 추종 예상 실패', e); }
            this.followPv = { key, marks };
        }
        const marks = this.followPv.marks;
        if (!marks.length) return;
        drawFollowerMarks(g, marks, TILE);
        marks.forEach((m) => this.overlay.add(makeText(this, m.x * TILE + TILE / 2, m.y * TILE + TILE - 2, '예상', { size: 10, bold: true, color: '#dcecff', origin: [0.5, 1], stroke: { color: '#0B1020', width: 3 } })));
    }

    // 행동 완료 흐림: 기존 = 현재 차례 진영의 acted 유닛. 교대 on = 추가로 이번 라운드 행동을 마친(done) 내 부대 소속
    dimOf(u, s) {
        if (u.team !== s.side) return false;
        if (u.acted) return true;
        if (!s.alternate) return false;
        return s.alt?.squads?.find((q) => q.unitIds.includes(String(u.id)))?.status === 'done';
    }

    // ---- 오라 표시 ----
    // 범위는 영웅(지휘관)을 선택했을 때만 희미한 반투명(채움 0.2, 외곽선 0.35, 오라 종류색)으로 표시하고 선택 해제 시 사라진다.
    //  - 이동 미리보기(phase move): 이동 예정 칸(커서가 이동 가능 칸 위)에 선 것으로 보고 범위를 옮겨 보여 준다.
    //    이동하는 유닛이 지휘관이 아니면 같은 편 지휘관 범위를 더 희미하게 보여 줘 '이 칸에서 오라를 받는지' 확인하게 한다.
    //  - 커서(hover/탭)로 가리킨 영웅도 표시: 아군은 오라 종류색 실선, 적은 붉은 계열 점선(희미하게).
    //  - 소속(squad) on 이면 범위 안 실제 수혜자(본인+소속 부대)만 칸 테두리로 강조.
    //  - 첫 오라 안내(한 번)에서만 잠깐 강조.
    // 이동·공격 하이라이트 위에 얹되 알파를 낮춰 가독성을 해치지 않는다. 그래픽만이라 입력을 소비하지 않는다.
    drawAuras(s, rect, g) {
        const cur = this.store.unitAt(s.cursor.x, s.cursor.y);
        const sel = s.selectedId && this.store.get(s.selectedId);
        const flashOn = this.auraFlash && this.time.now < this.auraFlash.until;
        const list = [];
        const has = (c) => c && c.kind !== 'troop' && c.hp > 0 && c.aura;
        const dest = s.phase === 'move' && s.standableTiles.some((t) => t.x === s.cursor.x && t.y === s.cursor.y) ? s.cursor : null;
        if (has(sel)) list.push({ c: sel, cx: dest?.x ?? sel.x, cy: dest?.y ?? sel.y, a: 1 });
        if (sel && !has(sel) && s.phase === 'move') s.units.forEach((c) => { if (has(c) && c.side === sel.side) list.push({ c, cx: c.x, cy: c.y, a: 0.6 }); });
        // 커서(hover/탭)로 가리킨 영웅: 아군·적군 모두 현재 위치 기준으로 표시(선택·이동 미리보기에 이미 있으면 중복 없음)
        if (has(cur) && cur !== sel && !list.some((l) => l.c === cur)) list.push({ c: cur, cx: cur.x, cy: cur.y, a: 1 });
        if (flashOn) { const c = this.store.get(this.auraFlash.id); if (has(c) && !list.some((l) => l.c === c)) list.push({ c, cx: c.x, cy: c.y, a: 1.4 }); }
        list.forEach(({ c, cx, cy, a }) => {
            const ally = c.team === 'ally';
            const col = ally ? AURA_COLOR[auraKind(c.aura)] : AURA_COLOR.enemy;
            const r = c.aura.radius;
            const inR = (x, y) => Math.abs(x - cx) + Math.abs(y - cy) <= r && x >= 0 && y >= 0 && x < s.map.w && y < s.map.h;
            g.fillStyle(col, (ally ? 0.2 : 0.15) * a);
            const edges = [];
            for (let y = cy - r; y <= cy + r; y++) {
                for (let x = cx - r; x <= cx + r; x++) {
                    if (!inR(x, y)) continue;
                    g.fillRect(...rect({ x, y }));
                    const X = x * TILE; const Y = y * TILE;
                    if (!inR(x, y - 1)) edges.push([X, Y, X + TILE, Y]);
                    if (!inR(x, y + 1)) edges.push([X, Y + TILE, X + TILE, Y + TILE]);
                    if (!inR(x - 1, y)) edges.push([X, Y, X, Y + TILE]);
                    if (!inR(x + 1, y)) edges.push([X + TILE, Y, X + TILE, Y + TILE]);
                }
            }
            g.lineStyle(2, col, Math.min(0.75, 0.55 * a)); // 판별이 쉽게 약간 진하게
            edges.forEach(([x1, y1, x2, y2]) => {
                if (ally) { g.lineBetween(x1, y1, x2, y2); return; }
                const len = Math.hypot(x2 - x1, y2 - y1); const ux = (x2 - x1) / len; const uy = (y2 - y1) / len;
                for (let d = 0; d < len; d += 10) g.lineBetween(x1 + ux * d, y1 + uy * d, x1 + ux * Math.min(len, d + 6), y1 + uy * Math.min(len, d + 6)); // 점선(적)
            });
            // 소속(squad) on(leader_id 필드 존재): 범위 안이라도 실제 수혜자는 본인+소속 부대뿐 → 수혜 유닛 칸만 오라색 테두리로 강조(auraAppliesTo 와 같은 판정)
            if (c.leader_id !== undefined) {
                g.lineStyle(3, col, Math.min(0.9, 0.7 * a));
                s.units.forEach((u) => {
                    if (u.hp <= 0 || !auraAppliesTo(c, u)) return;
                    const ux = u.id === c.id ? cx : u.x; const uy = u.id === c.id ? cy : u.y;
                    if (inR(ux, uy)) g.strokeRect(...rect({ x: ux, y: uy }, 4));
                });
            }
        });
    }

    // 소속 표시(squad on 전투만: leader_id 필드가 있을 때): 영웅을 선택하면 소속 부대를, 부대를 선택하면 소속 영웅을 연결선 + 점선 테두리로(색만으로 구분하지 않음)
    drawSquad(s, rect, g) {
        const focus = s.selectedId && this.store.get(s.selectedId); // 선택했을 때만(hover 제외: 커서만 올려도 글자가 남아 '0'/'자' 같은 잘린 글자로 보였다)
        if (!focus || focus.leader_id === undefined) return;
        const leader = focus.kind === 'troop' ? this.store.get(focus.leader_id) : focus;
        if (!leader) return;
        const members = s.units.filter((u) => u.hp > 0 && u.leader_id === leader.id);
        if (!members.length) return;
        const col = leader.team === 'ally' ? COLOR.accentLight : AURA_COLOR.enemy;
        const cx = (u) => u.x * TILE + TILE / 2;
        const cy = (u) => u.y * TILE + TILE / 2;
        g.lineStyle(2, col, 0.55);
        members.forEach((u) => {
            g.lineBetween(cx(leader), cy(leader), cx(u), cy(u));
            const [x, y, w, h] = rect(u, 3);
            for (let d = 0; d < w; d += 8) { g.lineBetween(x + d, y, x + Math.min(w, d + 4), y); g.lineBetween(x + d, y + h, x + Math.min(w, d + 4), y + h); }
            for (let d = 0; d < h; d += 8) { g.lineBetween(x, y + d, x, y + Math.min(h, d + 4)); g.lineBetween(x + w, y + d, x + w, y + Math.min(h, d + 4)); }
            // U20: 유닛 위 '<영웅> 소속' 글자 라벨 제거(이름 4자 잘림·위 칸 병력 숫자와 겹침). 소속은 연결선 + 점선 테두리(모양)로 표시하고,
            // 이름은 초상화 카드('<영웅>의 <부대명>')에서 확인한다.
        });
    }

    // 오라 범위 안 유닛 머리 위 배지 + 첫 오라 적용 안내(한 번만, settings.tips=false 로 끔)
    // 이름표 확장(2026-11-14): 선택 유닛 + 커서(호버·키보드 커서)가 놓인 칸의 유닛만 전체 이름, 나머지는 짧은 이름
    expandNames() {
        const s = this.store?.state; if (!s || !this.views) return;
        const c = s.cursor;
        this.views.forEach((v, id) => { const u = this.store.get(id); v.setNameExpanded?.(!!u && (id === s.selectedId || (!!c && u.x === c.x && u.y === c.y))); });
    }

    refreshAuraBadges(s) {
        let firstAlly = null;
        this.views.forEach((v, id) => {
            const u = this.store.get(id);
            if (!u || u.hp <= 0) { v.setAuraBadge(null); return; }
            const src = auraSources(s.units, u, u.x, u.y);
            const atk = src.reduce((p, c) => p + c.atk, 0);
            const def = src.reduce((p, c) => p + c.def, 0);
            v.setAuraBadge(src.length ? { atk, def, enemy: u.team !== 'ally' } : null);
            if (src.length && u.team === 'ally' && !firstAlly) firstAlly = src[0].cmd;
        });
        const calm = s.side === 'ally' && !s.busy && !this.fx?.playing; // 연출·적 페이즈 중이면 다음 갱신으로 미룸
        if (firstAlly && calm && s.status === 'battle' && !this.storyDialogue && conceptEligible()) { if (!this.guideActive() && settings.get().tips !== false) conceptPopup(this, 'C_aura'); } // 개념 팝업 대상(새 흐름 + 기존 유저, 2026-11-14 시오리 브리핑): 오라 개념 팝업(안내 진행 중엔 미룸, srpg.tip.aura 공유)
        else if (firstAlly && calm && s.status === 'battle' && !this.storyDialogue && settings.get().tips !== false && !localStorage.getItem('srpg.tip.aura')) { // 내레이션·개전 배너 중에는 오라 안내를 미룬다(내레이션을 가리지 않게)
            try { localStorage.setItem('srpg.tip.aura', '1'); } catch { /* 무시 */ }
            this.auraFlash = { id: firstAlly.id, until: this.time.now + 3500 };
            this.notice(`오라: ${auraLabel(firstAlly.aura)} — ${firstAlly.name} 주변 ${firstAlly.aura.radius}칸 아군 강화 (영웅을 선택하면 범위가 희미하게 표시됩니다)`, 'info', 4000);
            this.time.delayedCall(3600, () => { if (this.scene.isActive() && this.worldBuilt) this.refreshOverlay(); });
        }
    }

    // 유닛이 받는/주는 오라 설명 줄: [{text, color}]
    // 이동 칸의 수상 표시(drawOverlay 의 이동 칸 루프에서 호출, 그래픽 g 에 그림). kind: 'sea' | 'board'
    drawWaterMark(g, t, kind) {
        const x0 = t.x * TILE + 6; const y0 = t.y * TILE + TILE - 8;
        if (kind === 'sea') {
            g.lineStyle(2, 0x0b1020, 0.7);
            for (let r = 0; r < 2; r++) { const y = y0 - r * 6; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 4, y - 3); g.lineTo(x0 + 8, y); g.lineTo(x0 + 12, y - 3); g.lineTo(x0 + 16, y); g.strokePath(); }
            g.lineStyle(1.5, 0x9be7ff, 1);
            for (let r = 0; r < 2; r++) { const y = y0 - r * 6; g.beginPath(); g.moveTo(x0, y); g.lineTo(x0 + 4, y - 3); g.lineTo(x0 + 8, y); g.lineTo(x0 + 12, y - 3); g.lineTo(x0 + 16, y); g.strokePath(); }
        } else {
            g.fillStyle(0x0b1020, 0.7).fillTriangle(x0 - 1, y0 - 5, x0 + 19, y0 - 5, x0 + 15, y0 + 1).fillTriangle(x0 - 1, y0 - 5, x0 + 3, y0 + 1, x0 + 15, y0 + 1);
            g.fillStyle(0xd9a86c, 1).fillTriangle(x0, y0 - 4, x0 + 18, y0 - 4, x0 + 14, y0).fillTriangle(x0, y0 - 4, x0 + 4, y0, x0 + 14, y0);
            g.lineStyle(1.5, 0xf3e2c0, 1).lineBetween(x0 + 9, y0 - 4, x0 + 9, y0 - 12);
        }
    }

    // 유닛 정보 툴팁(헤더·병력 pip·받는 효과·상성 2열·주의 띠, ui/UnitInfoTip). 폭 = 화면 폭 - 16 이하(390 대응)
    unitInfoTip(u, s = this.store.state) {
        return new UnitInfoTip(this, { unit: u, name: unitDisplayName(u, s.units, { short: L.lw < 760 }), effects: tipEffects(auraSources(s.units, u, u.x, u.y), u), ownAura: tipOwnAura(u), maxW: Math.min(280, L.lw - L.safe.l - L.safe.r - 16) });
    }

    // 유닛 툴팁 상성 줄(9종, MATCHUPS 생성): 유리 = 아군색, 불리·주의 = 위험색
    matchupTipLines(u) {
        if (!u?.type) return [];
        return matchupLines(u.type).map((l) => ({ text: l.text, color: l.kind === 'adv' ? CSS.allyText : CSS.dangerText }));
    }

    auraLines(u, x = u.x, y = u.y) {
        const out = [];
        if (u.aura && u.kind !== 'troop') out.push({ text: `오라: ${auraDesc(u.aura)}`, color: AURA_CSS[u.team === 'ally' ? auraKind(u.aura) : 'enemy'] });
        auraSources(this.store.state.units, u, x, y).forEach((c) => {
            out.push({ text: `받는 효과: ${auraLabel(c.cmd.aura)} (${c.cmd.id === u.id ? '본인' : c.cmd.name} 오라, 거리 ${c.dist})`, color: AURA_CSS[u.team === 'ally' ? auraKind(c.cmd.aura) : 'enemy'] });
        });
        return out;
    }

    // 턴 제한시간 HUD(상단 바, 턴 표시 아래): 바 + 남은 초. 내 턴 = 청록, 10초 이하 = 적색 강조 + 10초 도달 시 경고음 1회, 상대 턴 = 회색(남은 시간만).
    // 서버가 turn_deadline 을 주지 않으면(스테이지·solo) 표시하지 않는다. 0초 도달 시 store.onTurnExpired(잠금 + 마감+유예 후 재조회)
    drawTurnTimer() {
        const s = this.store.state;
        const ms = this.store.turnRemainingMs?.();
        if (ms == null || !this.turnText) { this.ttG?.setVisible(false); this.ttT?.setVisible(false); return; }
        const mine = s.side === 'ally';
        const sec = Math.ceil(ms / 1000);
        const total = this.store.turnTotalMs();
        // 씬 재생성 시 이전 인스턴스의 파괴된 참조(ttG/ttT)는 새로 만든다
        if (!this.ttG?.scene || !this.ttT?.scene) { this.ttG = this.add.graphics(); this.ttT = makeText(this, 0, 0, '', { size: 13, bold: true, origin: [0, 0.5] }); this.ui.add([this.ttG, this.ttT]); }
        const x = this.turnText.x; const y = this.lay.barH - 9; const w = Math.min(180, Math.max(100, L.lw * 0.14)); const h = 5;
        const warn = mine && sec <= 10;
        const col = !mine ? COLOR.muted : warn ? COLOR.danger : COLOR.ally;
        this.ttG.clear().setVisible(true).fillStyle(COLOR.ink, 0.7).fillRect(x, y, w, h).fillStyle(col, 1).fillRect(x, y, w * Math.max(0, Math.min(1, ms / total)), h);
        this.ttT.setVisible(true).setPosition(x + w + 6, y + h / 2).setText(`${mine ? '' : '상대 '}${sec}초`).setColor(!mine ? CSS.muted : warn ? CSS.dangerText : CSS.allyText);
        if (mine && sec === 10 && this.ttBeep !== s.turnKey) { this.ttBeep = s.turnKey; audio.play('sfx_ui_tap'); }
        if (ms <= 0) this.store.onTurnExpired?.(); // 내 차례: 잠금+자동 종료 반영, 상대 차례: 만료 후 재조회(마감당 1회는 store 가 보장)
    }

    refreshHud() {
        if (!this.endBtn?.scene || !this.turnText?.scene) return; // HUD 재구성 도중(파괴된 이전 버튼·글자 참조) 호출 무시
        const s = this.store.state;
        const ally = s.side === 'ally';
        this.turnIcon.setFillStyle(ally ? COLOR.ally : COLOR.danger);
        this.turnIcon.setAngle(ally ? 0 : 45);
        let label = s.status === 'loading' ? '불러오는 중' : s.status === 'finished' ? '전투 종료' : `${ally ? '아군 턴' : `${s.opponentLabel} 턴`}  ${s.turn}`;
        if (s.mode === 'room' && s.status === 'battle') { // 방 전투: 턴 소유자·남은 시간(서버 계산값 기준 로컬 추정)
            const rs = this.store.turnRemainingMs?.() != null ? null : this.store.remainingSeconds(); // 제한시간 바(drawTurnTimer)가 보이면 바 옆 숫자만(중복 표시 제거)
            const opp = s.room?.players?.find((p) => !p.is_me);
            label += `${rs != null ? `  ⏱ ${rs}초` : ''}${opp ? `  vs ${opp.nickname}${opp.connected === false ? '(접속 끊김)' : ''}` : ''}`;
        }
        const alt = s.alternate && s.status === 'battle' ? altSummary(s.alt, s.mySide) : null;
        if (alt) label = label.replace(/^(아군 턴|.+ 턴) {2}\d+/, `라운드 ${alt.round}  ${ally ? '아군 차례' : `${s.opponentLabel} 차례`}`); // 교대 on: 턴 -> 라운드 + 차례
        // 캠페인 생존 목표(survive_turns): 서버 survive_remaining(현재 라운드 포함 남은 턴)
        const sv = s.status === 'battle' && s.surviveRemaining != null ? s.surviveRemaining : null;
        const hgK = texKey('ui.battle.ico.hourglass'); const hgOn = this.textures.exists(hgK);
        if (sv != null) label += `  |  ${hgOn ? '    ' : ''}${sv <= 1 ? '생존 마지막 턴' : `생존 ${sv}턴 남음`}`; // 시안: 턴 | (모래시계) 남은 턴
        // 점령 목표(capture): 내 점유 거점 수 + 유지 진행(hold/need) + 적 점유 진행(enemy_hold/enemy_need, 패배 조건일 때만)
        const ob = s.status === 'battle' && s.objective?.type === 'capture' && s.stageRules?.mode !== 'only' ? s.objective : null; // only 규칙: 점령은 승리로 인정되지 않으므로 상단 바 점령 진행 생략(목표 패널 체크리스트가 대신함)
        if (ob) {
            const pr = ob.progress ?? {};
            const mine = (ob.held ?? []).filter((h) => h.holder === s.mySide).length;
            label += `  · 점령 ${mine}/${(ob.points ?? []).length}곳${pr.need ? ` ${pr.hold ?? 0}/${pr.need}턴` : ''}${pr.enemy_need ? ` · 적 점유 ${pr.enemy_hold ?? 0}/${pr.enemy_need}` : ''}`;
        }
        // 증원 예고: 다음 라운드에 오는 적 증원이 있으면 한 줄 경고
        if (s.status === 'battle' && (s.triggers ?? []).some((t) => t.side !== s.mySide && Number(t.turn) - Number(s.turn) === 1)) label += '  · 다음 라운드 적 증원';
        this.turnText.setText(label).setColor(ally ? CSS.allyText : CSS.dangerText);
        { // 모래시계 위치: '|' 뒤 공백 자리(같은 글꼴로 앞부분 폭을 재서)
            const i = hgOn && sv != null ? label.indexOf('|  ') : -1;
            if (i >= 0) {
                if (!this.hgMeasure?.scene) this.hgMeasure = this.add.text(0, 0, '', this.turnText.style).setVisible(false);
                this.hgMeasure.setText(label.slice(0, i + 3));
                if (!this.hgIcon?.scene) { this.hgIcon = this.add.image(0, 0, hgK); this.ui.add(this.hgIcon); }
                const sz = Math.round(this.turnText.displayHeight * 0.62); // 축소된 글자(세로 폰)에서도 공백 폭 안에
                this.hgIcon.setDisplaySize(sz, sz).setPosition(this.turnText.x + this.hgMeasure.width * this.turnText.scaleX + sz * 0.55, this.turnText.y).setVisible(true);
            } else this.hgIcon?.setVisible(false);
        }
        this.refreshSubObjectives();
        this.refreshAltHud(alt);
        if (!alt) { const maxW = Math.max(60, (this.logBtn?.x ?? L.lw / 2) - this.turnText.x - 10); this.turnText.setScale(this.turnText.width > maxW ? Math.max(0.5, maxW / this.turnText.width) : 1); } // 좁은 화면: 로그 버튼과 겹치지 않게 축소
        // 행동 가능 게이지(CostMeter)는 제거(2026-11-03). 행동 완료 표시는 유닛 회색 처리·카드 상태('행동 완료')·전원 행동 시 자동 턴 종료 안내가 담당
        this.fitTurnChip();
        // 종료 버튼: 교대 off = '턴 종료'(end_turn, 기존 그대로) / on = '부대 행동 종료'(end_activation, 활성 부대 없으면 비활성 + 누르면 안내)
        const altOn = !!s.alternate;
        if (this.endAltMode !== altOn) {
            this.endAltMode = altOn;
            const lbl = altOn ? (L.lw < 560 ? '부대 종료' : '부대 행동 종료') : '턴 종료';
            this.endBtn.setLabel(lbl);
            this.endBtn.label.setScale(1);
            const icW = this.endBtn.swordIco?.scene ? this.endBtn.swordIco.displayWidth + 6 : 0; // 아이콘 자리만큼 라벨 폭 한도 축소
            if (this.endBtn.label.width > this.endBtn.w - 12 - icW) this.endBtn.label.setScale((this.endBtn.w - 12 - icW) / this.endBtn.label.width);
        }
        const noActive = altOn && !s.alt?.activeSquad;
        this.placeEndIcon();
        this.endBtn.reason = noActive && ally && s.status === 'battle' ? '먼저 부대를 선택하세요' : '';
        this.endBtn.setDisabled(!ally || s.status !== 'battle' || s.busy || noActive);
    }

    // ---- 교대 행동 HUD: 상단 바 보조 줄(연속 카운터·활성 부대·상대 남은 부대) + 내 부대 칩 줄 ----
    // alt = altSummary(...) | null(교대 off·전투 외: 모두 숨김, 기존 화면과 동일)
    refreshAltHud(alt) {
        const s = this.store.state;
        if (!alt) {
            if (this.altSub) this.altSub.setVisible(false);
            if (this.turnTextAlt) { this.turnText.setY(this.lay.barH - 28).setScale(1); this.turnTextAlt = false; }
            if (this.squadStrip) this.squadStrip.setVisible(false);
            return;
        }
        // 상단 바: 제목 줄(라운드·차례)을 조금 올리고 아래에 작은 보조 줄
        const cy = this.lay.barH - 28;
        if (!this.turnTextAlt) { this.turnText.setY(cy - 9).setScale(0.8); this.turnTextAlt = true; }
        const maxW = Math.max(60, (this.logBtn?.x ?? L.lw / 2) - this.turnText.x - 10);
        if (this.turnText.width * 0.8 > maxW) this.turnText.setScale(Math.max(0.5, maxW / this.turnText.width));
        if (!this.altSub) { this.altSub = makeText(this, this.turnText.x, cy + 12, '', { size: 13, bold: true, color: CSS.muted, origin: [0, 0.5] }); this.ui.add(this.altSub); }
        const act = alt.activeSquad ? this.store.get(alt.activeSquad) : null;
        const parts = [];
        if (alt.streak) parts.push(`연속 ${alt.streak.count}/${alt.streak.cap}${alt.streak.mine ? '' : `(${s.opponentLabel})`}`);
        if (act) parts.push(`활성 ${unitDisplayName(act, s.units, { short: true })}`);
        parts.push(`${s.opponentLabel} 대기 ${alt.oppReady}/${alt.oppAlive}`);
        this.altSub.setText(parts.join(' · ')).setVisible(true).setPosition(this.turnText.x, cy + 12);
        fitText(this.altSub, maxW);
        this.refreshSquadStrip(alt);
    }

    // 내 부대 칩 줄(최대 6개 기준, 넘치면 칩 폭 축소). 상태 = 색 + 기호(접근성: 색만으로 구분하지 않음)
    //   ready 청색 테두리 '●' / active 금색 굵은 테두리 '▶' / done 회색·반투명 '✓' / gone 적색·반투명 '✕'
    // 위치: 가로 = 하단 정보 바 위, 초상화 카드와 도구 줄 사이 / 세로 = 초상화 카드 자리 위. 칩 탭 = 해당 영웅으로 카메라 이동 + 선택.
    refreshSquadStrip(alt) {
        const s = this.store.state;
        const l = this.lay;
        const mine = alt.mine;
        const chipH = 40;
        let x0; let x1; let y;
        if (!l.portrait) {
            x0 = l.left + l.card.w + 8; x1 = l.tools.x - 8;
            y = (l.infoY ?? l.bottom - l.infoH) - 6 - chipH; // 정보 바('턴 종료' 줄 위) 위
            if (x1 - x0 < 200) { x0 = l.tools.x; x1 = l.right; y = l.tools.y - chipH - 8; } // 좁은 가로: 도구 줄 위
        } else {
            x0 = l.left; x1 = l.right; y = l.card.y - (l.card.portMax ?? 0) - chipH - 6; // 큰 초상 액자 위(액자와 겹치지 않게)
        }
        const gap = 4;
        const oppW = 58;
        const n = Math.max(1, mine.length);
        const chipW = clamp(Math.floor((x1 - x0 - oppW - gap * n) / n), 24, 92); // 부대 10개(장수 확장)도 화면 안에: 최소 24(이름 숨김, 초상만)
        const key = JSON.stringify([mine.map((q) => [q.id, q.status]), alt.activeSquad, s.selectedId, alt.oppReady, alt.oppAlive, x0, x1, y, chipW, s.side]);
        if (this.squadStrip && this.squadStripKey === key) { this.squadStrip.setVisible(true); return; }
        this.squadStripKey = key;
        this.squadStrip?.destroy();
        const c = this.add.container(0, y);
        this.squadStrip = c;
        this.ui.add(c);
        const total = mine.length * (chipW + gap) + oppW;
        let x = Math.max(x0, x0 + (x1 - x0 - total) / 2);
        const ST = { ready: { col: COLOR.ally, mark: '●', a: 1 }, active: { col: COLOR.accent, mark: '▶', a: 1 }, done: { col: 0x8a8f9c, mark: '✓', a: 0.55 }, gone: { col: COLOR.danger, mark: '✕', a: 0.45 } };
        mine.forEach((q) => {
            const st = ST[q.status] ?? ST.ready;
            const u = this.store.get(q.id) ?? q.unitIds.map((id) => this.store.get(id)).find(Boolean);
            const chip = this.add.container(snap(x), 0);
            const bg = this.add.rectangle(0, 0, chipW, chipH, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(q.status === 'active' ? 3 : 1.5, st.col, 1);
            chip.add(bg);
            const pk = u ? portraitKey(this, u.hero ?? this.store.get(u.leaderId)?.hero, this.onPortrait, { thumb: true }) : null; // 미로드면 이름만, 로드되면 다시 그림(썸네일)
            let tx = 6;
            if (pk) {
                const img = this.add.image(3, 3, pk).setOrigin(0);
                const side = Math.min(img.width, img.height);
                const ps = Math.max(10, Math.min(chipH - 6, chipW - 6)); // 칩이 좁으면 초상도 칩 폭 안으로
                img.setCrop(0, 0, side, side).setScale(ps / side);
                chip.add(img);
                tx = ps + 6;
            }
            if (chipW - tx >= 30 && u) {
                const nm = makeText(this, tx, chipH / 2, unitDisplayName(u, s.units, { short: true }), { size: 12, bold: true, color: q.status === 'active' ? '#f0d58c' : CSS.text, origin: [0, 0.5] });
                fitText(nm, chipW - tx - 14);
                chip.add(nm);
            }
            chip.add(makeText(this, chipW - 3, 3, st.mark, { size: 11, bold: true, color: q.status === 'active' ? '#f0d58c' : q.status === 'gone' ? CSS.dangerText : q.status === 'done' ? CSS.muted : CSS.allyText, origin: [1, 0] }));
            if (s.selectedId && q.unitIds.includes(String(s.selectedId))) chip.add(this.add.rectangle(0, chipH - 3, chipW, 3, COLOR.accent, 1).setOrigin(0));
            chip.setAlpha(st.a);
            bg.setInteractive({ useHandCursor: q.status !== 'gone' });
            bg.on('pointerup', () => { if (this.modalCount || this.fx.skip()) return; this.store.pickSquad(q.id); });
            c.add(chip);
            x += chipW + gap;
        });
        // 상대 남은 부대(이번 라운드 대기 / 생존)
        const ob = this.add.rectangle(snap(x), 0, oppW, chipH, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(1.5, COLOR.danger, 0.9);
        c.add(ob);
        c.add(makeText(this, snap(x) + oppW / 2, chipH / 2, `${s.opponentLabel}\n${alt.oppReady}/${alt.oppAlive}`, { size: 11, bold: true, color: CSS.dangerText, origin: [0.5, 0.5], align: 'center' }));
        this.squadStripRect = { x: Math.max(x0, x0 + (x1 - x0 - total) / 2), y, w: total, h: chipH };
    }

    // 좌 패널: 커서 타일·유닛 정보(초상화·지형 보정) + 행동 로그
    refreshInfo() {
        if (!this.infoOpen) return; // 좌측 정보/로그는 기본 접힘
        const s = this.store.state;
        const b = this.panelA.body;
        const dense = this.panelA.h < 200;
        const W = this.panelA.w - 40;
        this.panelA.clearBody();
        if (s.status === 'loading' || s.status === 'error') { b.add(makeText(this, 20, 14, s.status === 'loading' ? '서버에서 전투를 불러오는 중…' : '오류', { size: 16, color: CSS.muted, wrap: W })); return; }
        const { x, y } = s.cursor;
        const t = terrainAt(s.map, x, y);
        const u = this.store.unitAt(x, y);
        const mod = terrainMod(t.key, u ? unitType(u.type).move_type : 'foot');
        const acted = u && u.acted && u.team === s.side;
        const items = [makeText(this, 20, 0, `지형  ${t.name}${mod.cost === null ? ' · 통행 불가' : ` · 방어 ${mod.def_pct >= 0 ? '+' : ''}${mod.def_pct}% · 이동 소모 ${mod.cost}`}`, { size: dense ? 14 : 16, bold: true, color: CSS.accent, wrap: W })];
        if (u) {
            const pk = ensurePortraitTex(this, unitPortraitLogical(u, u.kind === 'troop' && u.leaderId != null ? this.store.get(u.leaderId) : null), this.onPortrait); // 영웅 -> 병종(문화권 -> default) -> 지휘관, 썸네일
            let tx = 20;
            if (pk && !dense) {
                const img = this.add.image(20, 0, pk).setOrigin(0, 0);
                img.setScale(72 / img.height * (4 / 3) * 0.75);
                img.setCrop(0, 0, img.width, img.height);
                items.push(img);
                tx = 20;
            }
            items.push(makeText(this, tx, 0, `${unitDisplayName(u, s.units, { short: dense })}` /* 지휘관 ★ 표식 제거(사용자 2026-11-04) */, { size: dense ? 18 : 20, heading: true, wrap: W }));
            items.push(makeText(this, tx, 0, `${u.team === 'ally' ? '아군' : '적군'} · ${unitType(u.type).label} · Lv ${u.level}${acted ? ' · 행동 완료' : ''}`, { size: 14, color: u.team === 'ally' ? CSS.allyText : CSS.dangerText, wrap: W }));
            items.push(new StatBar(this, { x: 20, w: W, max: 10, value: soldierCount(u), label: '병력', color: u.team === 'ally' ? COLOR.ally : COLOR.danger }));
            const r = `${u.rmin === u.rmax ? u.rmin : `${u.rmin}-${u.rmax}`}`;
            items.push(makeText(this, 20, 0, `공격 ${u.atk}   방어 ${u.def}   이동 ${u.move}   사거리 ${r}`, { size: 15, wrap: W }));
            this.auraLines(u).forEach((l) => items.push(makeText(this, 20, 0, l.text, { size: 13, bold: true, color: l.color, wrap: W })));
        } else {
            items.push(makeText(this, 20, 0, '유닛 없음', { size: 15, color: CSS.muted }));
        }
        b.add(items);
        const endY = stack(items, dense ? 12 : 16, 6);
        if (!dense && !this.lay.portrait) { // 행동 로그(최근)
            const lines = s.log.slice(-Math.max(3, Math.floor((this.panelA.h - endY - 60) / 20)));
            b.add(makeText(this, 20, endY + 14, '행동 로그', { size: 14, heading: true, color: '#f0d58c' }));
            b.add(makeText(this, 20, endY + 36, lines.join('\n') || '-', { size: 13, color: CSS.muted, wrap: W }));
        }
    }

    // 상단 중앙 안내 배너(구 우측 행동 패널 256x588 / 세로 하단 시트 약 253 높이 대체): 단계 제목 + (설정에 따라) 짧은/긴 안내 + 꼭 필요한 버튼만.
    // 아군 대기(idle)에는 숨긴다. 전투 예측의 확정/취소는 대상 옆 말풍선(ForecastBubble), 행동 선택은 유닛 옆 메뉴가 담당한다.
    refreshAction() {
        const s = this.store.state;
        const P = this.panelB;
        const lay = this.lay;
        const nl = settings.get().notify ?? 1; // 0 끄기 / 1 최소 / 2 보통 / 3 상세
        const idleAlly = s.status === 'battle' && s.side === 'ally' && !s.busy && s.phase === 'idle';
        const unit = s.selectedId ? this.store.get(s.selectedId) : null;
        const go = (fn) => () => { if (!this.fx.skip()) fn(); };
        const cancel = { label: '취소', onClick: go(() => this.store.cancel()) };
        let head = ''; let headFb; let brief = ''; let detail = ''; const btns = []; let extra = [];
        if (s.status === 'loading') { head = '준비 중'; brief = '서버에 전투 요청 중'; detail = '서버에 전투를 요청하고 있습니다.'; }
        else if (s.status === 'error') { head = '연결 오류'; brief = detail = s.error?.message ?? '오류'; if (s.error?.retry) btns.push({ label: '다시 시도', variant: 'primary', onClick: go(() => this.store.retry()) }); }
        else if (s.status === 'finished' && this.resultShown) { head = ''; } // U24: 결과창이 떠 있으면 상단 '전투 종료' 칩 중복 제거(상단 바 제목으로 충분)
        else if (s.status === 'finished') { head = '전투 종료'; brief = detail = s.winner === 'a' ? '승리했습니다.' : s.winner === 'b' ? '패배했습니다.' : '무승부'; }
        else if (s.busy) { head = '서버 처리 중'; brief = '잠시만 기다려 주세요'; detail = '잠시만 기다려 주세요…'; }
        else if (s.side === 'enemy') {
            const pvp = s.mode === 'room' && s.room?.mode === 'pvp';
            head = s.alternate ? `${s.opponentLabel} 부대 행동 중` : pvp ? '상대 턴' : `${s.opponentLabel} 행동 중`;
            brief = pvp ? '입력 잠김' : '탭: 연출 건너뛰기';
            detail = pvp ? '상대가 행동을 마칠 때까지 입력이 잠깁니다. 상대 행동은 도착하는 대로 재생됩니다.' : '화면을 탭하면 현재 연출을 건너뜁니다.';
            if (!pvp) btns.push({ label: '건너뛰기', onClick: () => { this.fx.setSkipTurn(true); this.fx.skip(); } });
            btns.push({ label: `배속 ${settings.get().speed}x`, onClick: go(() => { const sp = FX.speeds; settings.set({ speed: sp[(sp.indexOf(settings.get().speed) + 1) % sp.length] }); this.refreshAction(); }) });
        } else if (s.phase === 'idle' && s.alternate && s.alt?.activeSquad) { // 교대: 활성 부대 일부만 행동한 상태(배너 유지)
            const lead = this.store.get(s.alt.activeSquad);
            head = `${lead ? unitDisplayName(lead, s.units, { short: true }) : ''} 부대 행동 중`; brief = '남은 유닛 선택 또는 부대 행동 종료';
            detail = '활성 부대의 남은 유닛을 선택하거나, 상단 \'부대 행동 종료\'로 차례를 넘기세요. 행동하지 않은 유닛은 이번 라운드에 더 행동할 수 없습니다.';
        } else if (s.phase === 'idle') { head = '대기'; brief = s.alternate ? '행동할 부대의 유닛을 선택하세요' : '아군 유닛을 선택하세요'; detail = '아군 유닛을 선택하세요. 클릭/탭: 선택 · 우클릭/Esc: 취소 · 방향키+Enter 로도 조작할 수 있습니다.'; }
        else if (s.phase === 'move') {
            head = '이동 위치 선택'; brief = '청색 칸 선택'; detail = '청색 칸 중 이동할 곳을 선택하세요. 제자리를 선택하면 이동 없이 행동합니다.'; btns.push(cancel);
            // 수상 안내(표시 전용): 수병 = 물결 표시 칸이 수상 칸, 비수병 = 배 표시 칸이 탑승 칸. 칸 목록은 서버 reachable 그대로
            const mv = s.selectedId && this.store.get(s.selectedId);
            const kinds = mv ? new Set((s.standableTiles ?? []).map((t) => moveTileKind(mv, s.map.tiles?.[t.y]?.[t.x])).filter(Boolean)) : new Set();
            if (mv && isNavalType(mv.type)) { brief = '청색 칸 선택 · 수병'; detail += ' 수병은 배로 움직입니다. 물결 표시 칸 = 물 위(바다·강·여울 등) 칸입니다.'; }
            else if (kinds.has('board')) detail += ' 배 표시 칸은 배에 올라 서는 칸입니다(탑승).';
        }
        else if (s.phase === 'menu') {
            head = `${unit ? unitDisplayName(unit, s.units, { short: true }) : ''} 행동`; brief = '유닛 옆 메뉴에서 선택'; detail = '유닛 옆 메뉴에서 공격/스킬/대기/취소를 선택하세요. (방향키+Enter, 우클릭/Esc: 취소)';
            if (unit) extra = this.auraLines(unit);
        } else if (s.phase === 'facing') {
            head = '방향 선택'; brief = '화살표를 탭'; detail = '유닛 주변 화살표를 탭하면 그 방향을 보고 대기합니다. 현재 방향(금색)을 누르면 그대로 유지합니다. (방향키 + Enter 확정, Esc: 돌아가기)';
            if (!s.facingOn) detail += ' 이 전투는 방향 규칙이 꺼져 있어 보이는 방향만 바뀝니다(보너스 없음).';
            btns.push(cancel);
        } else if (s.phase === 'skill') { head = '스킬 선택'; brief = '스킬을 누르면 범위 표시'; detail = '스킬을 누르면 맵에 범위가 표시되고, 범위 안의 대상을 누르면 바로 사용합니다. 어둡게 표시된 스킬은 마력 부족·재사용 대기·대상 없음 등으로 지금 쓸 수 없습니다(누르면 사유 표시). (우클릭/Esc: 돌아가기)'; btns.push(cancel); }
        else if (s.phase === 'item') { head = '소모품 선택'; brief = '유닛 옆 목록에서 선택'; detail = `사용할 소모품을 고르세요. 영웅의 이번 행동을 소모합니다(전투당 ${s.itemMax}회). (우클릭/Esc: 돌아가기)`; btns.push(cancel); }
        else if (s.phase === 'target' && s.targetMode === 'item') { const it = s.itemCatalog?.find((x) => x.code === s.itemCode); head = `소모품 대상 선택 · ${it?.name ?? ''}`; brief = '자신 또는 인접 아군 선택'; detail = '금색 테두리의 자신 또는 인접(1칸) 아군을 선택하세요.'; btns.push(cancel); }
        else if (s.phase === 'target' && s.targetMode === 'skill') { // 대상 탭 = 즉시 사용(예측 확인 없음) -> 안내에 효과 설명을 붙인다(터치는 패널 상세를 못 보고 들어오므로)
            const tk = s.skill?.target_kind ?? 'enemy'; const eff = s.skill?.effect || s.skill?.description || '';
            head = `스킬 대상 선택 · ${skillDisplayName(s.skill?.name) ?? ''}`;
            if (tk === 'self' || tk === 'none') { brief = '자신을 누르면 사용'; detail = '청록색이 효과 범위입니다. 금색 테두리의 시전자(자신)를 누르면 바로 사용합니다.'; }
            else if (tk === 'ally') { brief = '금색 아군을 누르면 사용'; detail = '청록색이 시전 거리입니다. 금색 테두리의 아군을 누르면 바로 사용합니다.'; }
            else { brief = '적색 적을 누르면 사용'; detail = `적색으로 표시된 적을 누르면 바로 사용합니다. 위력 ${s.skill?.power_pct ?? 100}%로 공격합니다(반격 규칙은 일반 공격과 같음).`; }
            if (eff) detail += ` 효과: ${eff}`;
            detail += ' (우클릭/Esc/취소: 스킬 목록으로)';
            btns.push(cancel);
        }
        else if (s.phase === 'target') { head = '공격 대상 선택'; brief = '빗금 안의 적 선택'; detail = '붉은 빗금 안의 금색 테두리 적을 선택하세요.'; btns.push(cancel); }
        else if (s.phase === 'confirm' && s.forecast) {
            const fc = s.forecast;
            const ct = fc.counter?.troop;
            const counterTxt = fc.counter ? `반격 병력 -${ct?.loss ?? '?'}${ct ? ` (내 병력 ${ct.before}→${ct.after})` : ''}` : (fc.remaining === 0 ? (fc.microCounter ? '격파 예상 · 동시 교전: 반격 피해 가능' : '격파 예상') : '반격 없음');
            head = fc.skill ? `스킬 예측 · ${fc.skill.name} ${fc.skill.powerPct}%` : '전투 예측'; headFb = fc.skill ? `${fc.skill.name} ${fc.skill.powerPct}%` : undefined; brief = `병력 -${fc.troop?.loss ?? '?'} · ${counterTxt}${fc.tentative ? ' · 참고용(변동 가능)' : ''}`;
            detail = `${brief} · 상성 ${fc.attType && fc.defType ? matchupPair(fc.attType, fc.defType, fc.multiplier) : `x${fc.multiplier}`}${fc.aff > 0 ? '(유리)' : fc.aff < 0 ? '(불리)' : ''} · 지형 방어 +${fc.terrain_def_pct}%${fc.auraAtk || fc.auraDef ? ` · 오라 공격 +${fc.auraAtk ?? 0}% / 적 방어 +${fc.auraDef ?? 0}%` : ''} (참고용, 판정은 서버)`;
        }
        // 2026-11-14 사용자(가로 폰 캡처) '공격 대상 선택 [취소]가 화면 가운데라 불편': 모바일(터치 + 세로/가로 폰/좁은 폭)의 선택 단계(이동·방향·공격/스킬/소모품 대상)는
        //  [취소]를 배너에서 빼 오른쪽 아래 엄지 자리(도구 줄·미니맵 위, placeThumbCancel)로 옮기고, 배너는 버튼 없는 작은 한 줄(제목 + 짧은 안내)만. 데스크톱은 기존 그대로
        const thumb = !!this.touch && !!lay && (lay.portrait || !!L.short || L.lw < 760) && ['move', 'facing', 'target'].includes(s.phase) && btns.includes(cancel);
        if (thumb) btns.splice(btns.indexOf(cancel), 1);
        this.placeThumbCancel(thumb ? cancel : null);
        // 숨김: 아군 대기, 또는 알림 끄기인데 눌러야 할 버튼도 없을 때(오류·전투 종료는 끄기여도 제목은 보인다)
        const must = s.status === 'error' || s.status === 'finished';
        const textOn = nl > 0 || must;
        if ((idleAlly && !(s.alternate && s.alt?.activeSquad)) || !head || (!textOn && !btns.length)) { P.setShown(false); return; }
        P.setShown(true);
        P.clearBody();
        const b = P.body;
        const bh = Math.max(MIN_TOUCH, Math.ceil(MIN_TOUCH / view.scale));
        const pad = 10;
        // 세로 화면: 우상단 미니맵(배너와 같은 줄)이 보이면 배너를 미니맵 왼쪽 빈 폭 안에 왼쪽 정렬(겹침 방지)
        const mm = this.minimap;
        const mmL = lay.portrait && mm?.visible && lay.mini?.top != null ? mm.x - 3 - 8 : null; // 3 = 미니맵 테두리 pad, 8 = 간격
        const maxW = mmL != null ? Math.max(120, Math.min(lay.banner.maxW, mmL - lay.left)) : lay.banner.maxW;
        const bws = btns.map((o) => Math.max(64, o.label.length * 15 + 24));
        const btnsW = bws.reduce((a, w) => a + w, 0) + Math.max(0, bws.length - 1) * 6;
        const textMax = Math.max(80, maxW - pad * 2 - (btns.length ? btnsW + 10 : 0));
        let tw = 0; let th = 0;
        if (textOn) {
            const ht = makeText(this, pad, 0, head, { size: 16, bold: true, color: '#f0d58c' });
            fitText(ht, textMax, { fallback: headFb }); // 좁으면 '스킬 예측 · ' 접두어를 뺀 짧은 제목으로
            b.add(ht);
            tw = ht.width; th = ht.height;
            const sub = thumb ? (nl >= 2 ? brief : '') : nl >= 3 ? detail : nl === 2 ? brief : ''; // 엄지 취소 모드: 상세여도 짧은 안내 한 줄만(지도 가림 최소)
            const room0 = textMax - ht.width - 10;
            if (sub && !(thumb && room0 < 90)) { // 엄지 취소 모드는 같은 줄에 안 들어가면 안내 생략(제목만 한 줄)
                const room = room0;
                if ((nl === 2 || thumb) && room >= 90) { // 보통: 제목 옆 같은 줄
                    const st = makeText(this, pad + ht.width + 10, 0, sub, { size: 14, color: CSS.muted });
                    fitText(st, room);
                    b.add(st);
                    st.y = (ht.height - st.height) / 2;
                    tw = ht.width + 10 + st.width;
                } else { // 상세(또는 좁아서 둘째 줄): 제목 아래 줄바꿈(최대 3줄)
                    const st = makeText(this, pad, th + 2, sub, { size: 13, color: CSS.muted, wrap: textMax });
                    fitText(st, textMax, { maxLines: 3 });
                    b.add(st);
                    tw = Math.max(tw, st.width); th += 2 + st.height;
                }
            }
            if (nl >= 3 && !thumb) extra.forEach((l) => { const t = makeText(this, pad, th + 2, l.text, { size: 12, bold: true, color: l.color, wrap: textMax }); fitText(t, textMax); b.add(t); tw = Math.max(tw, t.width); th += 2 + t.height; });
        }
        const h = Math.max(btns.length ? bh + 8 : 0, th + 12);
        const w = Math.min(maxW, pad * 2 + tw + (btns.length ? (tw ? 10 : 0) + btnsW : 0));
        b.list.forEach((o) => { o.y += (h - th) / 2; });
        let bx = w - pad - btnsW;
        btns.forEach((o, i) => {
            b.add(new Button(this, { x: bx, y: (h - bh) / 2, w: bws[i], h: bh, label: o.label, size: 14, variant: o.variant ?? 'default', onClick: o.onClick }));
            bx += bws[i] + 6;
        });
        P.resize(w, h);
        P.setPosition(snap(mmL != null ? lay.left : (L.lw - w) / 2), lay.banner.y);
    }

    // 모바일 선택 단계의 엄지 [취소](refreshAction): 오른쪽 열(right 정렬, 폭 104 x 높이 터치 최소)에서 '턴 종료' 위로 올리며 HUD(도구 줄·미니맵(프레임 포함, 접힘이어도 자리 확보)·
    //  병사 추종·부대 칩 줄·카드·세로 정보 띠)와 겹치지 않는 가장 낮은 자리. c = null 이면 숨김
    placeThumbCancel(c) {
        const old = this.thumbCancel?.scene ? this.thumbCancel : null;
        if (!c || !this.lay?.endBtn) { old?.setVisible(false); this.thumbCancelRect = null; return; }
        // 모바일 도구 격자(2026-11-14): 오른쪽 열이 격자로 높아져 열 위로 올리면 엄지에서 멀어진다 -> 격자 바로 왼쪽(같은 높이대)에서 시작해 위로 회피
        const l = this.lay; const bh = Math.max(MIN_TOUCH, Math.ceil(MIN_TOUCH / (view.scale || 1))); const w = 104; const x = snap(l.toolGrid ? l.tools.x - 8 - w : l.right - w);
        const R = [l.endBtn, l.tools && { x: l.tools.x, y: l.tools.y - 2, w: l.tools.w, h: l.tools.h + 4 }, this.toolRect, this.followRect, this.minimap?.scene && !this.miniOn ? this.foldRect : null];
        const mr = this.minimap?.scene ? this.minimap.rect() : null; if (mr) R.push({ x: mr.x - 10, y: mr.y - 10, w: mr.w + 20, h: mr.h + 20 });
        if (this.squadStrip?.visible) R.push(this.squadStripRect);
        if (this.card?.visible) R.push({ x: this.card.x, y: this.card.y, w: this.card.w, h: this.card.h });
        if (l.portrait && l.infoY != null) R.push({ x: l.left, y: l.infoY, w: (l.infoX?.x1 ?? l.right) - l.left, h: l.infoH });
        let y = l.endBtn.y - 8 - bh;
        for (let k = 0, moved = true; moved && k < 10; k++) { moved = false; for (const r of R) if (r && r.x < x + w && r.x + r.w > x && r.y < y + bh && r.y + r.h > y) { y = r.y - 8 - bh; moved = true; } }
        y = snap(Math.max(l.barH + 8, y));
        let b = old;
        if (!b) { b = new Button(this, { x, y, w, h: bh, label: '취소', size: 16, onClick: () => this.thumbCancelFn?.() }); this.ui.add(b); this.thumbCancel = b; }
        this.thumbCancelFn = c.onClick;
        b.setPosition(x, y).setVisible(true);
        this.thumbCancelRect = { x, y, w, h: bh };
    }

    // 상단 알림 칩(배너 아래). 동시에 최대 2개.
    notice(message, tone = 'info', ms) {
        const lay = this.lay;
        showNotice(this, message, { tone, ms, maxW: Math.min(520, lay.banner.maxW), y: () => (this.panelB?.shown ? this.panelB.y + this.panelB.h + 6 : this.lay.banner.y) });
    }

    // 새 로그 줄 감지: 중요(격파·붕괴)는 로그 버튼 빨간 점, 설정 '보통'은 중요 줄을, '상세'는 모든 줄(턴 구분선 제외)을 상단 알림 칩으로.
    // 알림은 연출 큐 뒤에 넣어 해당 장면이 재생된 뒤 뜬다. 로그 데이터(store.log)는 그대로 둔다.
    refreshLogNotices() {
        const s = this.store.state;
        const seq = s.logSeq ?? 0;
        if (this.logSeen === null) { this.logSeen = seq; return; }
        if (seq <= this.logSeen) return;
        const n = Math.min(seq - this.logSeen, s.log.length);
        this.logSeen = seq;
        const nl = settings.get().notify ?? 1;
        if (nl === 0) return;
        const lines = s.log.slice(-n);
        const important = (l) => /격파|붕괴|쓰러짐/.test(l);
        if (lines.some(important)) { this.logUnread = true; this.logDot?.setVisible(true); }
        const skillLine = (l) => l.includes(' 스킬 「'); // 액티브 스킬 사용(이름 표시)은 '보통'에서도 알림
        const show = lines.filter((l) => !l.startsWith('---') && (nl >= 3 || (nl === 2 && (important(l) || skillLine(l)))));
        show.forEach((l) => this.fx.enqueue((done) => { if (this.scene.isActive()) this.notice(l, important(l) ? 'warn' : 'info'); done(); }));
    }

    // 전체 행동 로그 모달(최근 40줄, 페이지 넘김). 열면 빨간 점 해제.
    openLog() {
        if (this.modalCount) return;
        this.logUnread = false;
        this.logDot?.setVisible(false);
        const log = this.store.state.log;
        const hMax = Math.min(L.lh - 24, L.portrait ? 720 : 560);
        const w = Math.min(560, L.lw - 24);
        // U23: 내부 설명(페이지·자동 삭제 문구) 제거, '--- 턴 1 적군 ---' 구분선은 턴 헤더 스타일, 창 높이는 내용에 맞춤.
        // 줄마다 실제 높이로 페이지를 나눈다(긴 줄 줄바꿈 포함). chrome = 제목 리본·본문 여백(74) + 하단 여백 16 + 버튼(48) + 프레임 24
        const chrome = 62 + 12 + 16 + Math.max(48, MIN_TOUCH) + 24;
        const avail = Math.max(120, hMax - chrome);
        const headOf = (l) => { const mm = /^-{2,}\s*(.+?)\s*-{2,}$/.exec(String(l)); return mm ? mm[1].replace(/^턴\s*(\d+)\s*/, '턴 $1 · ') : null; };
        const mk = (l) => { const hd = headOf(l); return hd != null ? makeText(this, 24, 0, hd, { size: 14, bold: true, color: '#f0d58c' }) : makeText(this, 24, 0, l, { size: 14, color: CSS.text, wrap: w - 48 }); };
        const gapOf = (l, i) => (i > 0 && headOf(l) != null ? 10 : 4); // 턴 헤더 위는 넓게
        const heights = log.map((l) => { const t = mk(l); const hh = t.height; t.destroy(); return hh; });
        const pagesIdx = []; let cur = []; let used = 0;
        log.forEach((l, i) => { const need = heights[i] + gapOf(l, cur.length); if (cur.length && used + need > avail) { pagesIdx.push(cur); cur = []; used = 0; } used += heights[i] + gapOf(l, cur.length); cur.push(i); });
        if (cur.length || !pagesIdx.length) pagesIdx.push(cur);
        const pages = pagesIdx.length;
        let page = pages - 1; // 최신 페이지부터
        const contentH = pages > 1 ? avail : Math.max(24, pagesIdx[0].reduce((a, i, k) => a + heights[i] + gapOf(log[i], k), 0));
        const h = Math.min(hMax, Math.ceil(chrome + contentH));
        let m = null;
        const render = () => {
            m.inner.removeAll(true);
            const idx = pagesIdx[page];
            if (!idx.length) { m.inner.add(makeText(this, 24, 0, '기록이 없습니다.', { size: 14, color: CSS.muted })); return; }
            let y = 0;
            idx.forEach((i, k) => {
                const l = log[i]; const t = mk(l);
                y += k ? gapOf(l, k) : 0;
                t.setY(y);
                if (headOf(l) != null) m.inner.add(this.add.rectangle(24, y + t.height + 1, w - 48, 1, COLOR.accent, 0.45).setOrigin(0)); // 헤더 밑줄
                m.inner.add(t);
                y += t.height;
            });
        };
        const prev = () => { if (page > 0) { page -= 1; render(); } };
        const next = () => { if (page < pages - 1) { page += 1; render(); } };
        m = new Modal(this, {
            title: pages > 1 ? `전투 로그 (${page + 1}/${pages})` : '전투 로그', w, h,
            buttons: pages > 1 ? [{ label: '이전', keepOpen: true, onClick: () => { prev(); m.panel.titleT?.setText(`전투 로그 (${page + 1}/${pages})`); } }, { label: '다음', keepOpen: true, onClick: () => { next(); m.panel.titleT?.setText(`전투 로그 (${page + 1}/${pages})`); } }, { label: '닫기', variant: 'primary' }] : [{ label: '닫기', variant: 'primary' }],
        });
        render();
    }

    // ================= 유닛 옆 컨텍스트 UI (행동 메뉴 / 예측 말풍선 / 선택 툴팁) =================
    anchorOf(u) {
        const ws = this.world.scaleX;
        const size = TILE * ws;
        return { x: this.world.x + u.x * TILE * ws, y: this.world.y + u.y * TILE * ws, w: size, h: size };
    }

    // 유닛 툴팁 위치 보정: 기본(위쪽 우선)은 위 이웃 유닛·이동 칸을 덮는다 -> 선택 유닛 상하좌우 후보 중 가리는 유닛(가중 3)·이동/대상 칸(1)이 가장 적은 쪽.
    // 동점이면 오른쪽 > 왼쪽 > 위 > 아래(옆 우선). 후보가 영역 밖으로 밀리면(클램프) 감점. 선택 유닛 칸 자체는 덮지 않는다
    placeTip(tip, u, bounds) {
        const b = tip.getBounds?.();
        if (!b || !b.width) return;
        const w = b.width; const h = b.height;
        const anchor = this.anchorOf(u);
        const s = this.store.state;
        const cells = s.phase === 'move' ? (s.standableTiles ?? []) : []; // 대상 선택 단계의 대상은 유닛(others)으로 센다
        const others = this.store.alive().filter((x) => x.id !== u.id);
        let best = null;
        ['right', 'left', 'top', 'bottom'].forEach((side, i) => {
            const p = placeNear(anchor, w, h, bounds, [side], 6);
            if (!p) return;
            const r = { x: p.x, y: p.y, w, h };
            if (this.tileHits(u, r)) return;
            const cover = others.reduce((c, x) => c + (this.tileHits(x, r) ? 3 : 0), 0) + cells.reduce((c, t) => c + (t && (t.x !== u.x || t.y !== u.y) && this.tileHits(t, r) ? 1 : 0), 0);
            const score = cover * 10 + (p.score ?? 0) / 4 + i * 0.1;
            if (!best || score < best.score) best = { ...p, score };
        });
        if (best) tip.setPosition(best.x, best.y);
    }

    // 커서 툴팁(마우스 전용): 커서 칸의 유닛 상태(병력·오라·상성). 커서 오른쪽 아래 18px, 화면 끝이면 반대쪽으로 뒤집음. 유닛 밖이면 즉시 숨김. 입력 없음
    updateHoverTip(q, t) {
        const s = this.store.state;
        const u = t && this.worldBuilt && s.status === 'battle' && !this.modalCount && !this.fx.playing && !this.pausing && !this.cutsceneOn ? this.store.unitAt(t.x, t.y) : null;
        if (!u || !q) { this.hideHoverTip(); return; }
        const key = `${u.id}|${u.hp}|${u.x},${u.y}|${s.units.length}`;
        if (!this.hTip?.scene || this.hTipKey !== key) {
            this.hTip?.destroy();
            this.hTip = this.unitInfoTip(u, s);
            this.hTip.setDepth(5);
            this.ui.add(this.hTip);
            this.hTipKey = key;
        }
        const w = this.hTip.tw ?? 160; const h = this.hTip.th ?? 60; const off = 18;
        let x = q.x + off; let y = q.y + off;
        if (x + w > L.lw - L.safe.r - 4) x = q.x - off - w;
        // 커서 칸 유닛의 발밑 이름표(호버 시 전체 이름으로 확장)를 가리지 않게: 아래로 띄울 때는 유닛 칸 아래 끝 + 4 밑으로(강화면 a27h Low)
        const ar = this.anchorOf(u); const nameBottom = ar.y + ar.h + 4;
        if (y < nameBottom && x < ar.x + ar.w + 24 && x + w > ar.x - 24) y = nameBottom;
        if (y + h > L.lh - L.safe.b - 4) y = Math.min(q.y - off, ar.y - 4) - h; // 위로 뒤집을 때는 유닛 칸 위쪽으로
        this.hTip.setPosition(Math.round(Math.max(L.safe.l + 4, x)), Math.round(Math.max(L.safe.t + 4, y)));
    }

    hideHoverTip() { this.hTip?.destroy(); this.hTip = null; this.hTipKey = ''; }

    clearPopups() {
        this.hideHoverTip(); // 상태가 바뀌면(이동·공격·연출) 다음 커서 이동 때 새 값으로 다시
        [this.menuCtx, this.bubble, this.tip, this.facingPicker].forEach((o) => o?.destroy());
        this.facingPicker = null;
        this.menuCtx = null;
        this.bubble = null;
        this.tip = null;
        this.popupKey = '';
    }

    // 팝업은 관련 상태(phase/선택/대상/위치/줌)가 바뀔 때만 재생성한다. 커서 호버 등 무관한 change 로는 유지(클릭 씹힘 방지).
    popupKeyOf() {
        const s = this.store.state;
        const u = s.selectedId ? this.store.get(s.selectedId) : null;
        return `${s.status}|${s.side}|${s.busy}|${s.phase}|${s.selectedId}|${s.targetId}|${u ? `${u.x},${u.y}` : ''}|${this.world.x},${this.world.y},${this.k}|${s.units.length}|${s.facingChoice ?? ''}|${s.itemsLeft ?? '-'}|${s.itemCatalog ? s.itemCatalog.map((x) => x.owned ?? 0).join(',') : '-'}|${s.forecast?.rev ?? 0}`; // forecast.rev: 서버 예측 도착·폴백 시 말풍선 갱신
    }

    updatePopups() {
        if (!this.worldBuilt || this.drag?.moved) return; // 팬·핀치 중에는 재생성하지 않음(pointerup 에서 1회)
        const key = this.popupKeyOf();
        if (key === this.popupKey && !this.fx.playing) return;
        if (this.fx.playing) {
            this.clearPopups();
            if (!this.deferPop) {
                this.deferPop = true;
                this.fx.enqueue((done) => { this.deferPop = false; this.syncPopups(); done(); });
            }
            return;
        }
        this.syncPopups();
    }

    syncPopups() {
        this.clearPopups();
        if (this.pausing) return; // 일시정지 중: 행동 메뉴 숨김(U21), 재개 시 resumeFromPause 가 다시 그린다
        if (this.drag?.moved) return; // 팬·핀치 중: 숨긴 채 유지(popupKey='' 라 pointerup 에서 다시 그린다)
        const s = this.store.state;
        this.popupKey = this.popupKeyOf();
        if (s.status !== 'battle' || s.side !== 'ally' || !s.selectedId || s.busy) return;
        const u = this.store.get(s.selectedId);
        if (!u) return;
        const bounds = { ...this.lay.popup }; // HUD 를 피해 안쪽으로 밀린 영역
        if (this.infoOpen) { // 열린 정보 패널을 가리지 않게
            const A = this.lay.A;
            if (!L.portrait) { const r = A.x + A.w + 8; bounds.w -= Math.max(0, r - bounds.x); bounds.x = Math.max(bounds.x, r); }
            else { const b2 = A.y + A.h + 8; bounds.h -= Math.max(0, b2 - bounds.y); bounds.y = Math.max(bounds.y, b2); }
        }
        const narrow = bounds.w < 300 || L.lw < 560 || L.short; // 가로 폰: 행동 메뉴 2x2(세로 높이 절약)
        const touch = this.touch;
        const guard = (fn) => () => { if (!this.fx.skip()) fn(); };
        // 액티브 스킬: 항목별 사용 불가 사유(쿨다운·횟수·대상 없음). 대상 수는 현재(임시 이동 반영) 위치 기준 로컬 계산(판정은 서버)
        // 대상이 너무 멀 때 안내(하플레이 2026-11-10): 가장 가까운 살아 있는 적까지 맨해튼 거리(서버 Engine::dist) > 최대 사거리일 때만. 아니면 ''(LOS 차단 등은 기존 문구)
        const NO_TGT = '사거리 안에 대상이 없습니다';
        const nearestFoe = (s.units ?? []).filter((e) => e.hp > 0 && e.team !== u.team).reduce((m, e) => Math.min(m, Math.abs(e.x - u.x) + Math.abs(e.y - u.y)), Infinity);
        const farHint = (lo, hi, what = '사거리') => { lo = Number(lo) || 1; hi = Number(hi) || lo; return Number.isFinite(nearestFoe) && nearestFoe > hi ? `대상이 너무 멉니다. 가장 가까운 적까지 ${nearestFoe}칸, ${what} ${lo === hi ? hi : `${lo}~${hi}`}칸` : ''; };
        // 총병 사선 차단 안내(2026-11-10): 거리 lo~hi 안 살아 있는 적이 있는데 대상이 없으면 = 사선(LOS) 막힘(battleStore.targetsFrom 과 같은 isGunner·lineOfFire 판정). 이동 후(gunMoved)는 기존 문구
        const gunStill = typeAlias(u.type) === 'gunner' && !u.moved && !(s.moved && s.selectedId === u.id);
        const losHint = (lo, hi) => {
            if (!gunStill || !s.map) return '';
            lo = Number(lo) || 1; hi = Number(hi) || lo;
            const names = new Set(); let inRange = false;
            (s.units ?? []).forEach((e) => {
                if (!(e.hp > 0) || e.team === u.team) return;
                const d = Math.abs(e.x - u.x) + Math.abs(e.y - u.y);
                if (d < lo || d > hi) return;
                inRange = true;
                lineOfFire(s.map, u.x, u.y, e.x, e.y, (code) => { const b = terrainAttr(code, 'blocks_line_of_fire') > 0; if (b) names.add(terrainName(code)); return b; });
            });
            if (!inRange) return '';
            const nm = [...names].join('·'); const lc = nm.charCodeAt(nm.length - 1) - 0xac00; const josa = lc >= 0 && lc < 11172 && lc % 28 === 0 ? '가' : '이'; // 받침 유무
            return nm ? `사선이 막혔습니다. ${nm}${josa} 가로막고 있습니다` : '사선이 막혔습니다. 숲·산·성벽이 가로막고 있습니다';
        };
        const skills = activeSkillsOf(u).map((sk) => {
            let why = skillBlockReason(sk, this.store.skillTargets(u, sk).targets.length, { mpMode: !!s.mpMode, unit: u }); // MP 방식: 쿨다운·횟수 대신 마력 부족
            // 거리 안내는 스킬 자체 사거리(sk.range)가 있을 때만(a27b QA: 사거리 없는 스킬에 유닛 공격 사거리 문구가 붙어 오해) -> 없으면 스킬 사유 그대로
            if (why === NO_TGT && (sk.target_kind ?? 'enemy') === 'enemy') { if (Array.isArray(sk.range)) { const [lo, hi] = sk.range; why = farHint(lo, hi, '스킬 사거리') || losHint(lo, hi) || '스킬 사거리 안에 대상이 없습니다'; } else why = '스킬을 쓸 대상이 없습니다'; }
            return { sk, why };
        });
        // 행동 메뉴 '스킬' 버튼 비활성 사유: 스킬별 실제 판정 사유(스킬명: 사유). 2개 이상이면 2개까지 + '외 N개'. 사유가 비면 중립 문구
        const skillMenuReason = () => {
            const ws = skills.filter((x) => x.why);
            if (!ws.length) return '사용할 수 있는 스킬이 없습니다';
            const line = ({ sk, why }) => `${skillDisplayName(sk.name) ?? sk.code}: ${why}`;
            return ws.length === 1 ? line(ws[0]) : `${ws.slice(0, 2).map(line).join('\n')}${ws.length > 2 ? `\n외 ${ws.length - 2}개` : ''}`;
        };
        // 스킬 아이콘(atlas skill_icons, scope 'skill'): 스킬 목록·스킬 예측에서 처음 필요할 때 지연 로드 -> 완료 시 팝업 재생성(아이콘 없이 먼저 표시)
        if ((s.phase === 'skill' || (s.phase === 'confirm' && s.forecast?.skill)) && !skillIconsReady(this) && skillIconsListed() && !this.skillIconReq) {
            this.skillIconReq = true;
            ensureSkillIcons(this, (ok) => { if (ok && this.sys?.isActive() && this.worldBuilt) { this.popupKey = ''; this.updatePopups(); } });
        }
        const iconOf = (sk) => skillIconFrame(this, sk?.code, { kind: 'active', unitType: u.type });
        // 행동 메뉴가 가리면 안 되는 칸: 사거리 안 공격 대상 적(하플레이 2026-11-04: 이동 후 메뉴가 대상 적을 덮음)
        const avoid = (s.phase === 'menu' || s.phase === 'skill') ? this.store.targetsFrom(u).targets.map((id) => this.store.get(id)).filter(Boolean).map((e) => this.anchorOf(e)) : [];
        if (s.phase === 'menu' && s.itemsLeft != null && !s.itemCatalog) this.store.loadItems(); // 소모품 목록(사용 가능한 전투에서 처음 메뉴를 열 때 1회)
        if (s.phase !== 'skill') this.skillPickCode = null; // 스킬 패널 선택(재생성: 팬·줌·아이콘 로드 때 유지, 패널을 벗어나면 초기화)
        if (s.phase === 'menu') {
            const tf = this.store.targetsFrom(u);
            const hasTargets = tf.targets.length > 0;
            // 대상 없음 사유: 최소 사거리(unit_types.range_min > 1, 궁병 등) 안쪽에 적이 있으면 '너무 가깝다' 안내(거리 = 서버 Engine::dist 맨해튼)
            const rmin = Number(unitType(u.type)?.range_min) || 1;
            const tooClose = !hasTargets && rmin > 1 && (s.units ?? []).some((e) => e.hp > 0 && e.team !== u.team && Math.abs(e.x - u.x) + Math.abs(e.y - u.y) < rmin);
            const tooFar = !hasTargets && !tooClose && !tf.gunMoved ? farHint(rmin, unitType(u.type)?.range_max) : ''; // 총병 이동 후 비활성은 기존 문구 유지
            const losBlk = !hasTargets && !tooClose && !tooFar && !tf.gunMoved ? losHint(rmin, unitType(u.type)?.range_max) : ''; // 사선 차단: tooClose·tooFar·gunMoved 다음
            const atkReason = tooClose ? `너무 가깝습니다. 최소 사거리 ${rmin}칸 이상 떨어져야 합니다` : (tooFar || losBlk || NO_TGT);
            const ready = skills.filter((x) => !x.why);
            const minCd = Math.min(...skills.map((x) => x.sk.cooldown_left ?? 0).filter((n) => n > 0), Infinity);
            // 준비된 스킬 없음: 비활성 + 사유는 호버·탭 시 메뉴 옆 말풍선(ContextMenu -> ui/ReasonTip, 2026-11-14 목록 사이 문구 삽입 제거). 막연한 '지금은 사용할 수 없습니다'는 버튼 아래에 쓰지 않는다(사용자 2026-11-07, 흐린 버튼만으로 표시 · 탭 토스트 사유는 유지)
            const skillItem = !skills.length
                ? { label: '스킬', icon: 'skill', disabled: true, reason: '스킬이 없는 유닛입니다(영웅·지휘관만 사용)', onClick: () => {} }
                : { label: !s.mpMode && !ready.length && skills.every((x) => (x.sk.cooldown_left ?? 0) > 0) ? `스킬 (${minCd}턴)` : '스킬', icon: 'skill', disabled: !ready.length, reason: ready.length ? '' : skillMenuReason(), onClick: guard(() => this.store.menu('skill')) };
            this.menuCtx = new ContextMenu(this, {
                anchor: this.anchorOf(u), bounds, narrow, touch, avoid,
                items: [
                    { label: '공격', icon: 'attack', variant: 'primary', disabled: !hasTargets, reason: atkReason, onClick: guard(() => this.store.menu('attack')) },
                    skillItem,
                    ...(isHeroUnit(u) && !u.npc_ally ? [itemMenuEntry(this.store, u, guard)] : []), // 소모품(영웅만): 방·랭크·전쟁·보유 0·횟수 소진이면 비활성 + 사유
                    { label: '대기', icon: 'wait', onClick: guard(() => this.store.menu('wait', { look: this.views.get(u.id)?.look })) },
                    { label: '취소', icon: 'cancel', disabled: !!u.moved, reason: '이미 이동한 유닛은 되돌릴 수 없습니다', onClick: guard(() => this.store.menu('cancel')) },
                ],
            });
            this.ui.add(this.menuCtx);
        } else if (s.phase === 'item') { // 소모품 목록: 이름 x보유 · 효과. 보유 0은 회색
            const list = (s.itemCatalog ?? []).filter((it) => it && it.code);
            this.menuCtx = new ContextMenu(this, {
                anchor: this.anchorOf(u), bounds, narrow, touch, width: Math.max(236, Math.min(320, bounds.w - 24)), oneCol: true, size: 15, avoid, // 소모품 문구(이름 x보유 · 효과)가 236 에서 잘림(하플레이 #6) -> 화면이 허락하면 320 까지
                items: [
                    ...list.map((it) => { const none = !((it.owned ?? 0) > 0); const noTgt = !none && this.store.itemTargets(u, it).targets.length === 0; return { label: `${it.name ?? it.code} ×${it.owned ?? 0} · ${itemEffectText(it)}`, variant: none || noTgt ? undefined : 'primary', disabled: none || noTgt, reason: none ? '보유한 수량이 없습니다 (상점에서 구매)' : '회복이 필요한 아군이 없습니다', onClick: guard(() => this.store.pickItem(it.code)) }; }), // 회복약: 자신·인접 아군이 모두 병력 가득이면 비활성
                    { label: `뒤로 (남은 ${s.itemsLeft ?? 0}/${s.itemMax}회)`, onClick: guard(() => this.store.cancel()) },
                ],
            });
            this.ui.add(this.menuCtx);
        } else if (s.phase === 'skill') { // 액티브 스킬 패널(ui/SkillMenu, 2026-11-06): 카드(큰 아이콘·이름·마력 칩·사용 불가 사유) -> 탭 = 바로 pickSkill(대상 선택 모드: 맵 범위 표시, 대상 탭 = 즉시 사용, 2026-11-07). hover·키보드 포커스 = 상세 미리보기. 사유·판정 로직은 기존(skillBlockReason) 그대로
            const tkLabel = { enemy: '대상 적', ally: '대상 아군', self: '자신 중심' };
            const rangeOf = (sk) => { const p = sk.params ?? {}; if (sk.target_kind === 'ally' && p.cast_range != null) return `거리 ${p.cast_range}칸`; if (sk.target_kind === 'self' && p.radius != null) return `반경 ${p.radius}칸`; const r = Array.isArray(sk.range) ? sk.range : null; return r && sk.target_kind !== 'self' ? `사거리 ${r[0] === r[1] ? r[0] : `${r[0]}-${r[1]}`}` : ''; };
            this.menuCtx = new SkillMenu(this, {
                anchor: this.anchorOf(u), bounds, touch, avoid,
                selected: skills.findIndex((x) => x.sk.code === this.skillPickCode), onSelect: (i) => { this.skillPickCode = skills[i]?.sk.code ?? null; },
                onClose: guard(() => this.store.cancel()),
                items: skills.map(({ sk, why }) => {
                    const cost = s.mpMode && Number.isFinite(Number(sk.mp_cost)) ? Number(sk.mp_cost) : null;
                    const mp = skillMpOf(sk, u);
                    const cdL = sk.cooldown_left ?? 0;
                    return {
                        name: skillDisplayName(sk.name) ?? sk.code, cost, mpShort: cost != null && mp != null && mp < cost, power: s.mpMode ? null : (sk.power_pct ?? 100),
                        meta: [tkLabel[sk.target_kind] ?? '', rangeOf(sk), s.mpMode && sk.target_kind === 'enemy' && sk.power_pct != null && sk.power_pct !== 100 ? `위력 ${sk.power_pct}%` : '', !s.mpMode && (sk.cooldown ?? 0) > 0 ? `재사용 ${sk.cooldown}턴` : '', !s.mpMode && sk.uses != null ? `횟수 ${Math.max(0, sk.uses_left ?? 0)}/${sk.uses}` : ''],
                        sub: !s.mpMode ? (cdL > 0 ? `재사용 대기 ${cdL}턴` : sk.uses != null ? `남은 횟수 ${Math.max(0, sk.uses_left ?? 0)}/${sk.uses}` : '') : '',
                        desc: sk.effect || sk.description || '', why: why ?? '', iconFrame: iconOf(sk), dotColor: elementInfo(sk.element)?.color ?? null /* 속성 색 점 */,
                        onClick: guard(() => this.store.pickSkill(sk.code)),
                    };
                }),
            });
            this.ui.add(this.menuCtx);
        } else if (s.phase === 'facing') {
            this.facingPicker = new FacingPicker(this, {
                anchor: this.anchorOf(u), bounds, selected: s.facingChoice, touch,
                onPick: (dir) => { if (!this.fx.skip()) { this.facingCommitted = true; this.store.confirmFacing(dir); } },
            });
            this.ui.add(this.facingPicker);
        } else if (s.phase === 'confirm' && s.forecast) {
            const def = this.store.get(s.targetId);
            if (!def) return;
            const instant = s.forecast.reqSeq != null && this.lastBubbleSeq === s.forecast.reqSeq; // 같은 예측 요청의 갱신(서버값 덮어쓰기)은 페이드 없이
            this.lastBubbleSeq = s.forecast.reqSeq;
            this.bubble = new ForecastBubble(this, {
                anchor: this.anchorOf(def), bounds, fc: s.forecast.skill ? { ...s.forecast, skill: { ...s.forecast.skill, iconFrame: iconOf(s.forecast.skill) } } : s.forecast, narrow, touch, instant,
                onConfirm: guard(() => this.store.confirm()),
                onCancel: guard(() => this.store.cancel()),
            });
            this.ui.add(this.bubble);
        } else if (s.phase === 'target' && touch && !this.drag?.moved && !this.cardCompact()) {
            // 2026-11-14 모바일 제보(큰 상성 툴팁이 지도를 덮음): 모바일(cardCompact)은 이 툴팁을 띄우지 않는다. 같은 정보(병력·능력치·강함/약함)는 하단 압축 카드 두 줄로 표시
            // 2026-11-03 사용자 요청: 마우스는 커서 툴팁(updateHoverTip)만 — 선택 유닛 옆 고정 팝업은 터치 대체 동작으로만.
            // 터치: 탭한 유닛 옆(대상을 덜 가리는 쪽)에 잠깐 표시 후 자동 숨김. 입력은 원래 소비하지 않는다
            // 2026-11-14 모바일 제보(툴팁이 이동 경로 지정 방해): 이동 칸 선택(move) 단계에서는 띄우지 않는다(390 폭에서 툴팁이 화면 폭 ~70%라 이동 칸을 덮고,
            //  드래그 팬마다 popupKey 초기화로 재생성되며 2.2초 타이머가 계속 리셋돼 사라지지 않았음). 선택 유닛 정보는 좌하단 선택 카드(refreshCard, 터치=선택 우선)로 확인.
            //  드래그 팬 중(this.drag.moved)에도 재생성하지 않는다
            const tp = this.unitInfoTip(u, s);
            this.tip = tp;
            this.placeTip(tp, u, bounds);
            this.ui.add(tp);
            this.time.delayedCall(2200, () => { if (tp.scene && this.tip === tp) tween(this, { targets: tp, to: { alpha: 0 }, duration: 220, onComplete: () => { if (this.tip === tp) this.tip = null; tp.destroy(); } }); });
        }
    }

    // ================= 시스템 메뉴 / 오류 / 인증 =================
    // 본문 한 덩어리 모달의 내용 맞춤 높이(U21): 제목 리본(bodyY 62) + 본문 여백 + 본문 + 24 + 버튼(48) + 하단 프레임 24
    fitModalH(body, w) {
        const t = makeText(this, 0, 0, body, { size: 18, wrap: Math.min(w, L.lw - 24) - 48 });
        const th = t.height; t.destroy();
        return Math.ceil(62 + 12 + 8 + th + 24 + Math.max(48, MIN_TOUCH) + 24);
    }

    // 턴 종료(U22): 행동 가능한 아군이 남아 있으면 확인 후 진행. 자동 종료(전원 행동·시간 초과)·교대 행동·상대 턴은 store 경로 그대로(확인 없음)
    requestEndTurn() {
        if (this.fx.skip()) return;
        const s = this.store.state;
        const can = !s.alternate && s.status === 'battle' && s.side === 'ally' && !s.busy && !s.timeLocked;
        const left = can ? this.store.alive().filter((u) => u.team === 'ally' && !u.npc_ally && !u.acted).length : 0;
        const follow = this.followOn();
        if (!left) { this.store.endTurn({ follow }); return; }
        if (this.modalCount) return;
        this.clearPopups();
        const turn0 = s.turn;
        // 병사 자동 추종 on: 행동 안 한 소속 병사는 영웅을 따라 자동 이동한다고 안내(영웅·비소속만 남았으면 기존 문구)
        const nFollow = follow ? this.store.followCandidates().length : 0;
        const rest = left - nFollow;
        const body = !nFollow ? `행동 가능 ${left}기가 남았습니다. 턴을 종료할까요?`
            : `${rest > 0 ? `행동 가능 ${rest}기(영웅·비소속)가 남았습니다. ` : ''}남은 소속 병사 ${nFollow}기는 영웅을 따라 자동 이동합니다. 턴을 종료할까요?`;
        new Modal(this, {
            title: '턴 종료', w: 480, h: this.fitModalH(body, 480), body,
            onClose: () => { this.popupKey = ''; this.updatePopups(); },
            // 확인 사이 턴이 바뀌었으면(시간 초과 자동 종료 등) 새 턴을 끝내지 않는다
            buttons: [{ label: '취소' }, { label: '턴 종료', variant: 'primary', onClick: () => { const c = this.store.state; if (c.turn === turn0 && c.side === 'ally') this.store.endTurn({ follow: this.followOn() }); } }],
        });
    }

    // 병사 자동 추종(턴 종료 follow=true): 설정 켜짐 + 싱글/캠페인 전투만(방 대전·교대 행동은 end_turn 경로가 아니거나 서버가 무시)
    // 방 대전: 방 옵션 follow_troops(store room.followTroops)가 켜진 방만. 스테이지/캠페인은 기존 그대로(교대 행동만 제외)
    followAllowed() {
        const s = this.store.state;
        if (s.alternate) return false;
        const room = BattleScene.startData?.mode === 'room' || s.mode === 'room';
        return !room || s.room?.followTroops === true;
    }
    followOn() { return this.followAllowed() && settings.get().followSoldiers !== false; }

    // 일시정지(U21): 내용 맞춤 높이, 열 때 행동 메뉴 등 유닛 옆 팝업을 닫고(닫을 때 복원), 포기 확인은 겹치지 않게 일시정지 창과 교체.
    // swapped = 포기 확인에서 '아니오'로 돌아온 경우(fx 는 계속 일시정지 상태)
    openPause(swapped = false) {
        if (!swapped && (this.fx.skip() || this.modalCount)) return;
        this.fx.paused = true;
        this.pausing = true; // 일시정지·포기 확인 동안 유닛 옆 팝업 재생성 막기(syncPopups)
        this.clearPopups();
        let next = null; // 닫힌 뒤 할 일(포기 확인으로 교체)
        // 중간 저장(2026-11-03): 스테이지 전투는 서버가 행동마다 자동 저장 -> '저장하고 나가기' = API 호출 없이 로비로(로비 '이어하기'로 복귀). 방·전쟁 전투는 제외
        const canSave = !!this.store.state.battleId && this.store.state.status === 'battle' && !['room', 'war'].includes(BattleScene.startData?.mode);
        const body = canSave ? '게임이 일시정지되었습니다.\n진행 상황은 행동마다 자동 저장됩니다. 로비의 \'이어하기\'로 돌아올 수 있습니다.' : '게임이 일시정지되었습니다.';
        const pw = canSave ? 600 : 520;
        this.pauseModal = new Modal(this, {
            title: '일시정지', w: pw, h: this.fitModalH(body, pw), body, onClose: () => { this.pauseModal = null; if (next) next(); else this.resumeFromPause(); },
            buttons: [
                { label: '계속', variant: 'primary' },
                { label: '설정', keepOpen: true, onClick: () => openSettings(this, ({ fontChanged }) => { if (fontChanged) { this.fx.paused = false; this.scene.restart({ resume: true }); } }) },
                ...(canSave ? [{ label: L.lw < 480 ? '저장·종료' : '저장 후 나가기', onClick: () => { next = () => { this.store.stop(); this.scene.start('Lobby', { tab: this.lobbyTab(), notice: '저장되었습니다. 로비에서 이어하기로 계속할 수 있습니다.' }); }; } }] : []),
                { label: '포기', variant: 'danger', onClick: () => { next = () => this.confirmSurrender(); } }, // 포기 = 확인 팝업(패배 기록) 유지, 적색으로 구분
            ],
        });
    }

    resumeFromPause() {
        this.fx.paused = false;
        this.pausing = false;
        this.fx.pump();
        this.popupKey = '';
        this.updatePopups();
    }

    confirmSurrender() {
        let yes = false;
        const body = '정말 포기하시겠습니까? 패배로 기록되며 보상은 없습니다.';
        new Modal(this, {
            title: '전투 포기', w: 480, h: this.fitModalH(body, 480), body,
            // 포기 확정: fx.paused 를 풀어야 결과 이벤트(fx 큐)가 바로 재생돼 결과창이 뜬다. 아니오/Esc = 일시정지 창으로 복귀
            onClose: () => { if (yes) { this.resumeFromPause(); this.store.abandon(); } else this.openPause(true); },
            buttons: [{ label: '아니오' }, { label: '포기한다', variant: 'danger', onClick: () => { yes = true; } }],
        });
    }

    // ================= 진입(로딩) 실패·지연 안전장치 =================
    // 지도 구성 중 예외(텍스처·데이터 이상)로 '불러오는 중'에 남지 않게: 실패하면 로딩 안내를 내리고 오류 모달
    safeEnsureWorld() {
        try {
            this.ensureWorld();
            if (this.worldBuilt) { this.loadSlowModal?.close(); this.loadWatch?.remove(false); this.loadWatch = null; }
            return true;
        } catch (err) {
            console.error('[battle load failed] code=render_failed', err);
            this.worldBuilt = false;
            this.showLoadError({ code: 'render_failed', message: '지도를 표시하는 중 오류가 발생했습니다. 다시 시도해 주세요.', retry: null });
            return false;
        }
    }

    // 로딩 15초 초과 시 지연 안내(다시 시도/돌아가기/계속 기다리기)
    armLoadWatch() {
        this.loadWatch?.remove(false);
        this.loadWatch = null;
        if (this.worldBuilt || this.store.state.status !== 'loading') return;
        this.loadWatch = this.time.delayedCall(BattleScene.LOAD_SLOW_MS, () => {
            this.loadWatch = null;
            if (this.worldBuilt || this.store.state.status !== 'loading' || this.loadErrModal) return;
            console.warn(`[battle load slow] code=load_timeout after=${BattleScene.LOAD_SLOW_MS}ms`);
            this.loadSlowModal = new Modal(this, {
                title: '불러오기 지연', w: 560, h: 300, body: '시간이 오래 걸리고 있습니다.\n다시 시도하거나 이전 화면으로 돌아갈 수 있습니다.', onClose: () => { this.loadSlowModal = null; },
                buttons: [
                    { label: this.backTarget().label, onClick: () => this.goBackFromLoad() },
                    { label: '계속 기다리기', onClick: () => this.armLoadWatch() },
                    { label: '다시 시도', variant: 'primary', onClick: () => this.scene.start('Battle', { ...(BattleScene.startData ?? {}), fresh: true }) },
                ],
            });
        });
    }

    // 실패 시 돌아갈 화면: 방 -> 방 대전 탭, 배치 중이던 스테이지 전투 -> 출격(배치) 화면(편성 문제 포함, 편성 탭은 제거됨), 그 외 -> 스테이지 탭
    backTarget(code) {
        const d = BattleScene.startData ?? {};
        const partyIssue = ['cost_exceeded', 'too_many_slots', 'too_many_heroes', 'party_empty', 'no_party', 'duplicate_hero', 'hero_not_owned'].includes(code);
        if (d.mode === 'room' && d.roomCode && code === 'deployment_phase') return { label: '대기실로', go: () => this.scene.start('Room', { code: d.roomCode }) }; // 아직 배치 단계: 대기실이 배치 화면으로 보낸다
        if (d.mode === 'room') return { label: '방 대전으로', go: () => this.scene.start('Lobby', { tab: 'room' }) };
        if (d.mode === 'war') return { label: '시즌 지도로', go: () => this.scene.start('War') }; // 시즌 전쟁 전투(scenes/War.js)
        if (d.battleId && partyIssue) return { label: '출격 화면으로', go: () => this.scene.start('Deploy', { mode: 'stage', battleId: d.battleId }) };
        return { label: '로비로', go: () => this.scene.start('Lobby', { tab: this.lobbyTab() }) };
    }

    // 로비 복귀 탭: 메인 스토리 스테이지(code ch101_ 이상)면 'main', 그 외 'stage'
    // 결과 화면 '다음 스테이지'·로비 복귀 탭: 메인 스토리(ch101+, 숨은 종장 999 제외)와 튜토리얼(chapter 0, stage_NN)은 '메인 스토리' 탭(2026-11-14), 그 외 역사 시나리오('stage')
    lobbyTab() {
        const st = cachedStage(BattleScene.startData?.stageId ?? this.store?.state?.stageId);
        const code = BattleScene.startData?.stageCode ?? st?.code ?? '';
        const ch = st?.chapter != null && Number.isFinite(Number(st.chapter)) ? Number(st.chapter) : /^stage_\d+$/.test(code) ? 0 : Number(/^ch(\d+)_/.exec(code)?.[1] ?? -1); // 코드로 판정 불가면 -1 = 역사 시나리오(기존 기본)
        return (ch >= 101 && ch !== 999) || ch === 0 ? 'main' : 'stage';
    }

    goBackFromLoad(code) { this.store.stop(); this.backTarget(code).go(); }

    // 진입 실패: 로딩 표시 해제 + 서버 사유(코스트 초과면 used/max 포함) + 돌아가기/다시 시도
    showLoadError({ message, code, retry } = {}) {
        this.loadWatch?.remove(false);
        this.loadWatch = null;
        this.loadSlowModal?.close();
        this.loading?.destroy();
        this.loading = null;
        this.refresh?.();
        if (this.loadErrModal) return;
        const back = this.backTarget(code);
        this.loadErrModal = new Modal(this, {
            title: '전투를 시작하지 못했습니다', w: 560, h: 320, body: `${message || '오류가 발생했습니다.'}${code ? `\n(오류 코드: ${code})` : ''}`, onClose: () => { this.loadErrModal = null; },
            buttons: [
                { label: back.label, variant: code === 'cost_exceeded' ? 'primary' : 'default', onClick: () => this.goBackFromLoad(code) },
                { label: '다시 시도', variant: code === 'cost_exceeded' ? 'default' : 'primary', onClick: () => {
                    if (retry) { this.armLoadAfterRetry(); this.store.retry(); }
                    else this.scene.start('Battle', { ...(BattleScene.startData ?? {}), fresh: true });
                } },
            ],
        });
    }

    // 다시 시도(같은 씬): 로딩 안내를 다시 띄우고 지연 감시 재가동
    armLoadAfterRetry() {
        if (!this.worldBuilt && !this.loading) {
            const a = this.lay.map;
            void a;
            this.loading = createLoadingView(this, { tagline: '전투를 불러오는 중…', overlay: true, indeterminate: true });
        }
        this.time.delayedCall(0, () => this.armLoadWatch()); // store.retry 가 status 를 loading 으로 되돌린 뒤
    }

    showError(message, retry) {
        if (this.errorModal) return;
        this.errorModal = new Modal(this, {
            // 전달 메시지(messageOf)에 이미 '네트워크 상태를 확인…' 안내가 들어 있으면 다시 붙이지 않는다(중복 문구 I-15)
            title: '연결 오류', w: 520, h: 300, body: /네트워크|다시 시도/.test(String(message ?? '')) ? String(message) : `${message ?? '서버와 통신하지 못했습니다.'}\n네트워크 상태를 확인한 뒤 다시 시도하세요.`, onClose: () => { this.errorModal = null; },
            buttons: [{ label: '로비로', onClick: () => this.scene.start('Lobby', { tab: 'stage' }) }, { label: '다시 시도', variant: 'primary', onClick: () => { if (retry) this.store.retry(); else this.store.resync(); } }],
        });
    }

    // 401: FE B 의 Login 씬이 있으면 그쪽으로, 없으면 임시로 게스트 생성 후 재시도
    showAuth() {
        if (this.authModal) return;
        const hasLogin = !!this.scene.get('Auth'); // FE B 인증 씬 이름 'Auth'
        this.authModal = new Modal(this, {
            title: '로그인 필요', w: 520, h: 300, body: '전투를 진행하려면 로그인(또는 게스트 시작)이 필요합니다.', onClose: () => { this.authModal = null; },
            buttons: [
                { label: hasLogin ? '로그인 화면' : '타이틀로', onClick: () => this.scene.start(hasLogin ? 'Auth' : 'Title', hasLogin ? { mode: 'login' } : undefined) },
                { label: '게스트로 시작', variant: 'primary', onClick: async () => {
                    try { await battleApi.createGuest(`게스트${Math.floor(Math.random() * 9000 + 1000)}`); this.scene.start('Battle', BattleScene.startData ?? {}); }
                    catch (e) { showToast(this, e?.message ?? '게스트 생성 실패'); }
                } },
            ],
        });
    }

    // ================= 정산: 승패 + 별 + 골드 + 경험치 바(유저/영웅) + 레벨업·코스트 상승 칩 =================
    guideActive() { return !!this.guide && !this.guide.done; }

    popupBlocked() { return !!this.resultShown || !!this.fx?.playing || this.store.state.status !== 'battle'; } // 개념 팝업 금지 구간: 연출 재생 중·결과 진입 후(guideFlow.conceptPopup 이 표시 직전에도 확인)
    // 개념 팝업(새 흐름 사용자, 1회씩): 지형(지형 보정 칸에 선 아군 선택) / 방향(첫 방향 선택 단계). 조작 안내 진행 중·대사 중에는 미룬다
    guidePopups() {
        const s = this.store.state;
        if (s.status !== 'battle' || this.storyDialogue || this.guideActive() || (this.modalCount ?? 0) > 0 || this.popupBlocked()) return; // 교전 연출(컷신 포함)·결과 화면 중에는 미룬다(하플레이 #2). 연출이 끝나면 fx idle 재평가가 다시 부른다
        if (s.phase === 'facing') { conceptPopup(this, 'C_facing'); return; }
        const u = s.selectedId != null ? this.store.get(s.selectedId) : null;
        const code = u && u.team === 'ally' ? s.map?.tiles?.[u.y]?.[u.x] : null;
        if (code && terrainMod(code, unitType(u.type).move_type).def_pct) conceptPopup(this, 'C_terrain');
    }

    // 결과창 버튼 감시(2026-11-04 사용자 '결과창에서 다른 창 보고 오니 클릭이 안 됨'): 버튼을 누르면 모달은 바로 닫히고 이동(playAfterStage -> 대사/씬 시작)은 비동기다.
    //  이동이 예외·멈춤으로 일어나지 않으면 전투 종료 화면(HUD 비활성)만 남아 아무것도 눌리지 않는다 -> 버튼 처리 예외를 잡고, 8초 안에 씬이 바뀌지 않으면 결과창을 다시 띄운다
    leaveWrap(buttons) {
        return (buttons ?? []).map((b) => ({ ...b, onClick: () => {
            if (this.leaving) return; // 이동 시작 뒤 중복 클릭(playAfterStage 이중 실행) 방지
            this.leaving = true;
            const t0 = this.time.now;
            const back = (why) => { if (!this.sys?.isActive() || this.store?.state?.status !== 'finished') return; this.leaving = false; console.warn('[result] 결과창 이동 실패, 결과창 복원:', why); this.reshowResult('이동하지 못했습니다. 다시 눌러 주세요.'); };
            this.leaveTimer?.remove(false);
            this.leaveTimer = this.time.delayedCall(8000, () => { if (this.leaving && this.time.now - t0 >= 7900) back('timeout'); });
            try { const r = b.onClick?.(); if (r && typeof r.catch === 'function') r.catch((e) => { reportClientError?.(e, { source: 'result_button' }); back(e?.message ?? 'reject'); }); } catch (e) { back(e?.message ?? 'throw'); }
        } }));
    }
    // 결과창 다시 띄우기(닫혔는데 씬이 그대로인 경우: 이동 실패·앱 복귀 시 결과창 없음)
    reshowResult(msg = '', { quiet = true } = {}) {
        if (!this.lastResult || this.store?.state?.status !== 'finished' || this.leaving) return;
        if (this.resultModal && !this.resultModal.closed && this.resultModal.scene) { this.children.bringToTop(this.resultModal); return; }
        this.resultShown = false;
        this.showResult(this.lastResult, { quiet });
        if (msg) this.notice(msg, 'warn', 3000);
    }

    showResult(result, { quiet = false } = {}) { // quiet: 결과창 복원(reshowResult) = 승패음·덕킹·별·EXP·카드·첫 승리 팝업 연출 없이 최종 상태로
        if (this.resultShown) return;
        // 첫 클리어 보상(BattleService result.first_clear_grant {equipment:[code], levels:[{user_hero_id,from,to}]}): 장비는 코드만 오므로
        //  이름을 인벤토리(GET /api/inventory)에서 찾은 뒤 결과창을 그린다(최대 1.5초, 실패·초과면 'N종'으로)
        const fcg0 = result?.win ? result?.first_clear_grant : null;
        if (fcg0 && Array.isArray(fcg0.equipment) && fcg0.equipment.length && this.fcgNames === undefined) {
            this.fcgNames = null;
            Promise.race([gameApi.inventory(), new Promise((ok) => setTimeout(() => ok(null), 1500))])
                .then((d) => { const its = Array.isArray(d?.items) ? d.items : []; const nm = fcg0.equipment.map((c) => its.find((i) => i.code === c)?.name ?? null); this.fcgNames = nm.every(Boolean) ? nm : null; })
                .catch(() => { this.fcgNames = null; })
                .finally(() => { if (this.sys.isActive()) this.showResult(result, { quiet }); });
            return;
        }
        this.resultShown = true;
        // 결과창 뒤에 이벤트 대사창이 남아 비치지 않게(강화면 v8): 열린 대사가 있으면 스킵과 같이 닫는다(완료 기록·카메라 해제는 대사 done 콜백)
        if (this.storyDialogue && !this.storyDialogue.closed) this.storyDialogue.close();
        const s = this.store.state;
        const win = !!result?.win;
        if (win && !quiet && conceptEligible()) this.time.delayedCall(900, () => { if (this.sys.isActive()) conceptPopup(this, 'C_victory_result', { reward_exp: Number(result?.user?.gained) > 0 ? Number(result.user.gained) : null, reward_gold: Number(result?.gold) > 0 ? Number(result.gold) : null }); }); // 첫 승리 정산 개념 팝업(보상 값 = 결과 user.gained·gold, 없으면 그 문장 생략)
        if (!quiet) audio.play(win ? 'win' : 'lose');
        if (!quiet && win) voiceVictory(this); // 승리 환호(0.35s 뒤, 전투 음성 끔이면 무음). 패배는 음성 없음
        if (quiet) { /* 복원: 음향 상태는 처음 표시 때 그대로 */ } else if (win) audio.duckPush('battle.result', 0.5); else audio.stopBgm(); // 결과 BGM: 승리 = 전투 곡 유지(덕킹) + sfx_victory, 패배 = BGM 정지 후 sfx_defeat 만. 덕킹은 shutdown 의 stopBgm 이 복원
        this.refreshAction(); // U24: 상단 '전투 종료' 칩 숨김(결과창과 중복)
        // 이미지 스킨 승패 배너(uiskin_gacha 의 banner.victory/defeat)는 지연 로드: 로드(또는 실패·지연 1.5초) 후 한 번만 결과 창을 만든다.
        // 배너 유무에 따라 패널 위쪽 여백·세로 위치가 달라지므로 창을 만들기 전에 결정한다. 배너가 없으면 패널 리본 제목(기존 폴백)
        let built = false;
        const build = () => {
            if (built || this.sys.settings.status >= Phaser.Scenes.SHUTDOWN) return; // 씬 종료 후 콜백(로드 완료·지연 타이머) 무시
            built = true;
            this.buildResultModal(result, win, { quiet });
        };
        if (result?.abandoned) build();
        else {
            // 결과 화면 에셋(result.* scope 'result', 안아트 result_ui) + 구 배너(uiskin_gacha) 지연 로드: 둘 다 끝나면 즉시, 늦으면 1.5초 후 있는 것으로
            let wait = 2;
            const one = () => { wait -= 1; if (wait <= 0) build(); };
            this.time.delayedCall(1500, build);
            ensureSkinTexture(this, 'uiskin_gacha', one);
            try { ensureScope(this, 'result', one); } catch (e) { console.warn('[result] 에셋 로드 실패(폴백)', e); one(); }
        }
    }

    // 결과 화면 장식 연출(안아트 result_ui, 스펙 docker/gemini/result_screen_spec.json): 배너 스탬프 인/무거운 낙하, 승리 sunburst·glow·폭죽·색종이, 패배 smoke·glow.
    // 레이어: 딤 위·패널 뒤(sunburst/glow/smoke) / 최상위(폭죽·색종이, 입력 없음). 탭(클릭) 1회 = 장식 즉시 정리(전체 화면 플래시 없음). 연출 끄기(isInstant)면 정적 배치만
    resultFx(modal, { win, cx, cy, bn, bt, bw, bh }) {
        const RX = (k) => this.textures.exists(k);
        const ADD = Phaser.BlendModes.ADD;
        const fxObjs = [];
        const back = (o) => { modal.addAt(o, 1); fxObjs.push(o); return o; }; // [딤, (여기), 패널, ...]
        const front = (o) => { modal.add(o); fxObjs.push(o); return o; };
        const still = isInstant();
        // 배너 등장
        if (!still) {
            const by = bn.y; const ty = bt.y;
            if (win) { bn.setAlpha(0).setScale(bn.scaleX * 1.6); bn.y = by - 24; const k = bn.scaleX / 1.6; tween(this, { targets: bn, to: { alpha: 1, scaleX: k, scaleY: k, y: by }, duration: 380, ease: 'Back.easeOut' }); }
            else { const k = bn.scaleX; bn.setScale(k * 1.15); bn.y = by - 40; tween(this, { targets: bn, to: { scaleX: k, scaleY: k, y: by }, duration: 450, ease: 'Bounce.easeOut' }); }
            bt.setAlpha(0); bt.y = ty - (win ? 24 : 40); tween(this, { targets: bt, to: { alpha: 1, y: ty }, duration: win ? 380 : 450, ease: win ? 'Back.easeOut' : 'Bounce.easeOut' });
        }
        if (win) {
            const sz = Math.min(L.lw, L.lh) * 0.9;
            if (RX('result_fx_sunburst')) { const s = back(this.add.image(cx, cy, 'result_fx_sunburst').setDisplaySize(sz, sz).setBlendMode(ADD).setAlpha(still ? 0.55 : 0)); if (!still) { tween(this, { targets: s, to: { alpha: 0.55 }, duration: 400, delay: 300 }); this.tweens.add({ targets: s, angle: 360, duration: 40000, repeat: -1 }); } }
            if (RX('result_fx_glow_victory')) { const g = back(this.add.image(cx, cy, 'result_fx_glow_victory').setDisplaySize(bw * 0.8, bw * 0.8).setBlendMode(ADD).setAlpha(still ? 0.8 : 0)); if (!still) tween(this, { targets: g, to: { alpha: 0.8 }, duration: 400, delay: 300 }); }
            if (!still && RX('result_fx_firework')) [[-0.36, -0.1], [0.36, -0.18]].forEach(([dx, dy], i) => {
                const f = front(this.add.image(cx + bw * dx, cy + bh * dy, 'result_fx_firework').setBlendMode(ADD).setScale(0.1));
                const k = (bw * 0.42) / f.width;
                tween(this, { targets: f, to: { scaleX: k * 1.1, scaleY: k * 1.1, alpha: 0 }, duration: 900, delay: 450 + i * 220, ease: 'Quad.easeOut', onComplete: () => f.destroy() });
            });
            const cf = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `result_confetti_${n}`).filter(RX);
            if (!still && cf.length) for (let i = 0; i < 30; i++) {
                const c = front(this.add.image(Math.random() * L.lw, -20 - Math.random() * 120, cf[i % cf.length]).setDisplaySize(16 + Math.random() * 10, 16 + Math.random() * 10).setAngle(Math.random() * 360));
                const dur = 1800 + Math.random() * 700;
                this.tweens.add({ targets: c, y: L.lh * (0.55 + Math.random() * 0.4), x: c.x + (Math.random() - 0.5) * 120, angle: c.angle + (Math.random() - 0.5) * 540, duration: dur, delay: 500 + Math.random() * 400, ease: 'Sine.easeIn' });
                this.tweens.add({ targets: c, alpha: 0, duration: 500, delay: 500 + dur, onComplete: () => c.destroy() });
            }
        } else {
            if (RX('result_fx_smoke')) { const sm = back(this.add.image(L.lw / 2, L.lh, 'result_fx_smoke').setOrigin(0.5, 1).setDisplaySize(L.lw * 1.1, L.lw * 1.1 * 720 / 1280).setAlpha(still ? 0.6 : 0)); if (!still) { tween(this, { targets: sm, to: { alpha: 0.6 }, duration: 800, delay: 300 }); this.tweens.add({ targets: sm, x: sm.x + 24, duration: 8000, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); } }
            if (RX('result_fx_glow_defeat')) { const g = back(this.add.image(cx, cy, 'result_fx_glow_defeat').setDisplaySize(bw * 0.8, bw * 0.8).setAlpha(still ? 0.35 : 0)); if (!still) tween(this, { targets: g, to: { alpha: 0.35 }, duration: 600, delay: 300 }); }
        }
        // 탭 스킵: 장식(폭죽·색종이)은 즉시 정리, 별·카드는 최종 상태로
        this.input.once('pointerdown', () => {
            fxObjs.forEach((o) => { if (o.scene && (o.texture?.key === 'result_fx_firework' || /^result_confetti_/.test(o.texture?.key ?? ''))) o.destroy(); });
            (this.resultStars?.list ?? []).forEach((st) => st.f.scene && st.f.setVisible(true));
            (this.resultCards ?? []).forEach((c) => { if (c.obj.scene) { c.obj.setAlpha(1); c.obj.y = 0; c.vt.setText(`${c.plus ? '+' : ''}${Number(c.value).toLocaleString()}`); } });
            snapAll();
        });
    }

    // 결과 창 레이아웃(승리/패배 공통). 세로 리듬: [배너] → 결과 문장 → 요약(턴·시간) → 구분선 → 골드 → 경험치 행(이름·Lv | +EXP / 바 | 값) → 버튼
    // 배너: 패널과 같은 폭·같은 중심, 아랫단 장식(창·월계수 끝, 이미지 높이의 약 12%)만 패널 위 테두리에 걸치고 본문은 그 아래에서 시작한다.
    buildResultModal(result, win, { quiet = false } = {}) { // quiet: showResult 에서 전달(결과창 복원 = 연출 없음). 이전엔 미전달로 ReferenceError(gacha120)
        const s = this.store.state;
        const PAD = 28; // 패널 좌우 안쪽 여백(코너 장식 안쪽)
        const COLGAP = 24;
        // 낮은 가로 화면(844x390·360 등 논리 높이 < 560, fe42): 2열 기준 열 폭으로 만들고 별·보상 카드를 조금 줄인다. 그 외(1280x720 등)는 기존 값 그대로
        // 667x375(논리 약 741x417)도 포함(강화면 v8: 1열 + 최소 축소 0.55 로도 넘쳐 3번째 경험치 행이 버튼에 가려짐) -> 기준 760 -> 700. 700 이상이면 2열 폭 조건(lw-24 >= 2W+COLGAP+2PAD)이 성립
        const lowH = L.lh < 560 && L.lw >= 700;
        const w = lowH ? Math.min(600, Math.floor((L.lw - 24 - PAD * 2 - COLGAP) / 2) + PAD * 2) : Math.min(600, L.lw - 24);
        const W = w - PAD * 2;
        const GOLD = '#f0d58c';
        const EXPC = '#8cc4ff';
        const btnH = Math.max(48, MIN_TOUCH);
        const items = [];
        const add = (o, gap = 8) => { o.gapAfter = gap; items.push(o); return o; };
        const stars = '★'.repeat(result?.stars ?? 0) + '☆'.repeat(Math.max(0, 3 - (result?.stars ?? 0)));
        // 결과 문장(가운데, 큰 글자) + 별(승리 시)
        // 종료 사유(battle_end reason, 연출 중 받은 경우만 s.endReason): objective = 목표 달성(점령·생존), objective_lost = 적이 목표를 점유
        const objType = s.objective?.type;
        const head = result?.abandoned ? '전투를 포기했습니다'
            : s.endReason === 'objective_lost' ? '적에게 목표 지점을 빼앗겼습니다'
                : win && s.endReason === 'objective' ? (objType === 'capture' ? '목표 지점을 점령했습니다' : objType === 'survive_turns' ? '끝까지 버텨 냈습니다' : '목표를 달성했습니다')
                    : win && s.endReason === 'turn_limit' ? '제한 턴이 끝나 우세 판정으로 승리했습니다'
                        : win && (s.endReason === 'survive_turns' || objType === 'survive_turns') ? '끝까지 버텨 냈습니다'
                            : win && objType === 'capture' ? '목표 지점을 점령했습니다'
                                // 기본 목표(objective 없음·defeat_commander 등) = 적 지휘관 격파(엔진 commander_defeated). 이전 '모든 적을 물리쳤습니다'는 승리 조건과 어긋남
                                : win ? '적 지휘관을 격파했습니다' : '전투에서 패배했습니다';
        add(makeText(this, PAD + W / 2, 0, head, { size: 20, heading: true, wrap: W, align: 'center', origin: [0.5, 0] }), win ? 2 : 4);
        // 패인 한 줄(연출 중 받은 battle_end 기준, 같은 전투일 때만. 결과 복원 등 원인을 모르면 생략)
        const cause = !win && !result?.abandoned && s.endCause?.battleId === s.battleId ? defeatCauseText(s.endCause) : null;
        if (cause) add(makeText(this, PAD + W / 2, 0, cause, { size: 15, bold: true, color: CSS.dangerText, wrap: W, align: 'center', origin: [0.5, 0] }), 4);
        const warLine = warResultLine(result); // 시즌 전쟁: 점령도 변화 한 줄(result.war)
        this.resultWarCap = null;
        if (warLine) {
            // 점령 성공: 큰 금색 문구(아래에서 스탬프 연출) + 점령도 줄
            if (warLine.captured) this.resultWarCap = add(makeText(this, PAD + W / 2, 0, '점령 성공! 영토를 손에 넣었습니다', { size: 22, heading: true, color: GOLD, wrap: W, align: 'center', origin: [0.5, 0], stroke: { color: '#3a2508', width: 3 } }), 4);
            add(makeText(this, PAD + W / 2, 0, warLine.text, { size: 18, bold: true, color: warLine.captured ? GOLD : CSS.text, wrap: W, align: 'center', origin: [0.5, 0] }), 6);
            warDetailLines(warLine.src, result).forEach((ln) => add(makeText(this, PAD + W / 2, 0, ln.text, { size: ln.kind === 'rank' ? 14 : 15, bold: ln.kind !== 'rank', color: ln.kind === 'exp' ? EXPC : ln.kind === 'cap' ? CSS.dangerText : ln.kind === 'gain' ? CSS.allyText : CSS.text, wrap: W, align: 'center', origin: [0.5, 0] }), 4));
        }
        const RX = (k) => this.textures.exists(k); // 결과 화면 새 에셋(result_ui) 유무
        this.resultStars = null; this.resultCards = null;
        const starObjs = [];
        if (win && !warLine && RX('result_star_empty') && RX('result_star_filled')) { // 별 3개(가운데 1.2배·위로 8px 아치), 점등은 아래 순차 연출
            const n = result?.stars ?? 0; const sz = L.lw < 560 || lowH ? 48 : 60;
            const row = this.add.container(PAD + W / 2, 0);
            [-1, 0, 1].forEach((d, i) => {
                const big = d === 0 ? 1.2 : 1; const y = (sz * 1.2) / 2 + (d === 0 ? -8 : 0);
                const e = this.add.image(d * sz * 1.25, y, 'result_star_empty').setDisplaySize(sz * big, sz * big);
                const f = this.add.image(d * sz * 1.25, y, 'result_star_filled').setDisplaySize(sz * big, sz * big).setVisible(false);
                row.add([e, f]);
                if (i < n) starObjs.push({ f, x: d * sz * 1.25, y, s: sz * big });
            });
            row.setSize(W, sz * 1.2 + 4);
            row.height = sz * 1.2 + 4;
            add(row, 6);
            this.resultStars = { row, list: starObjs };
        } else if (win && !warLine) add(makeText(this, PAD + W / 2, 0, stars, { size: 22, heading: true, color: GOLD, origin: [0.5, 0] }), 4);
        // 캠페인 데이터 슬롯(서버 star_detail·joined_heroes 가 있을 때만 줄 추가, 없으면 기존 결과창과 동일). 디자인 에셋(안아트) 적용 시 이 줄들을 교체
        // 보조 목표 최종 판정(한 줄, 별 조건 줄과 별개): '보조 목표  A ✓ · B ✗'
        const subs = (s.subObjectives ?? []).filter((o) => subObjLabel(o));
        // 패배·포기: 서버가 종료 시 미판정(pending) 항목을 met 으로 확정해 주므로(protect_tiles 등) 달성 표시를 하지 않는다 -> 실패만 ✗, 나머지 '-'(해당 없음)
        if (subs.length) add(makeText(this, PAD + W / 2, 0, `보조 목표  ${subs.map((o) => `${subObjLabel(o)} ${o.status === 'failed' ? '✗' : win && o.status === 'met' ? '✓' : win ? '✗' : '-'}`).join(' · ')}`, { size: 13, color: CSS.muted, wrap: W, align: 'center', origin: [0.5, 0] }), 4);
        // ctx: 패배 상성 힌트(지금까지 화면에 나온 적 병종 s.enemySeen, 미등장 증원 제외) / aff: 상성 유리 처치(서버 affinity_kills) / hint: 패배 힌트
        const extraCtx = { win, abandoned: !!result?.abandoned, mode: s.mode === 'room' ? 'room' : BattleScene.startData?.mode === 'war' || warLine ? 'war' : 'stage', rulesMode: s.stageRules?.mode ?? null, enemyUnits: [...(s.enemySeen?.values() ?? [])], allyUnits: (s.units ?? []).filter((u) => u.team === 'ally' && !u.non_hero && !u.npc_ally) };
        resultExtraLines(result, extraCtx).forEach((ln) => add(makeText(this, PAD + W / 2, 0, ln.text, { size: ln.kind === 'join' ? 16 : ln.kind === 'hint' ? 14 : 13, bold: ln.kind === 'join' || ln.kind === 'aff', color: ln.kind === 'join' ? CSS.allyText : ln.kind === 'aff' ? GOLD : ln.kind === 'hint' ? CSS.text : CSS.muted, wrap: W, align: 'center', origin: [0.5, 0] }), 4));
        // 다음 스테이지 해금(첫 클리어 승리 + 로비 캐시에 이 스테이지가 선행인 잠긴 스테이지가 있을 때만 한 줄)
        const unlockedNext = win && result?.first_clear ? stagesUnlockedBy(s.stageId ?? s.stage?.id ?? BattleScene.startData?.stageId) : [];
        if (unlockedNext.length) add(makeText(this, PAD + W / 2, 0, `다음 스테이지 해금: ${unlockedNext.map((x) => x.name).join(', ')}`, { size: 14, bold: true, color: GOLD, wrap: W, align: 'center', origin: [0.5, 0] }), 4);
        // 첫 클리어 보상 한 줄 + 장착 안내(장비가 있을 때)
        const fcg = win && result?.first_clear_grant ? result.first_clear_grant : null;
        const fcgEq = Array.isArray(fcg?.equipment) ? fcg.equipment : []; const fcgLv = Array.isArray(fcg?.levels) ? fcg.levels : [];
        if (fcgEq.length || fcgLv.length) {
            const eqTxt = fcgEq.length ? `${this.fcgNames ? this.fcgNames.join('·') : `장비 ${fcgEq.length}종`} 획득` : '';
            add(makeText(this, PAD + W / 2, 0, `첫 클리어 보상: ${[eqTxt, fcgLv.length ? '아군 레벨 보정' : ''].filter(Boolean).join(', ')}`, { size: 15, bold: true, color: GOLD, wrap: W, align: 'center', origin: [0.5, 0] }), 4);
            if (fcgEq.length) add(makeText(this, PAD + W / 2, 0, '받은 장비는 영웅 상세 → 장비에서 장착할 수 있습니다', { size: 13, color: CSS.muted, wrap: W, align: 'center', origin: [0.5, 0] }), 2);
        }
        if (!win && s.mode !== 'room' && BattleScene.startData?.mode !== 'war' && !warLine) add(makeText(this, PAD + W / 2, 0, '레벨업·장비·영웅 편성을 정비한 뒤 다시 도전해 보세요', { size: 14, color: CSS.muted, wrap: W, align: 'center', origin: [0.5, 0] }), 4); // 패배 정비 안내(하플레이 2026-11-04)
        const t0 = BattleScene.startData?.t0;
        const sec = t0 ? Math.max(0, Math.round((Date.now() - t0) / 1000)) : null;
        const sum = [s.turn ? `${s.turn}턴` : '', sec != null ? `소요 시간 ${Math.floor(sec / 60)}분 ${String(sec % 60).padStart(2, '0')}초` : ''].filter(Boolean).join(' · ');
        if (sum) add(makeText(this, PAD + W / 2, 0, sum, { size: 14, color: CSS.muted, origin: [0.5, 0] }), 4);
        if (result?.reward_blocked) add(makeText(this, PAD + W / 2, 0, `보상 제한: ${result.reward_blocked === 'too_short' ? '진행 턴 부족' : '일일 상한 초과'}`, { size: 14, color: CSS.dangerText, origin: [0.5, 0] }), 4);
        // 구분선(금박 톤 옅게): 요약부와 보상부 분리
        const dvKey = win ? 'result_divider_victory' : 'result_divider_defeat';
        const divider = RX(dvKey) ? this.add.image(PAD + W / 2, 0, dvKey).setOrigin(0.5, 0) : this.add.rectangle(PAD, 0, W, 1, COLOR.accent, 0.45).setOrigin(0);
        if (RX(dvKey)) { const dw = W - 40; divider.setDisplaySize(dw, dw * (divider.height / divider.width)); }
        items[items.length - 1].gapAfter = 12;
        add(divider, 12);
        const cardKey = 'result_card_reward';
        if (warLine) { /* 시즌 전쟁: 골드 보상 없음(서버 gold 0) -> 골드 카드/줄 생략, 보상은 위 경험치 줄과 아래 영웅 행 */ } else if (RX(cardKey) && !result?.reward_blocked) { // 보상 카드 줄(골드·경험치·합류 영웅). 없는 보상은 생략, 골드 0 은 회색 +0
            const ch = L.lw < 560 || lowH ? 104 : 120; const cw = Math.round(ch * 0.646);
            const cards = [{ icon: ['icon_gold', 'result_ico_chest'], label: '골드', value: result?.gold ?? 0, plus: true },
                result?.user?.gained ? { icon: ['result_ico_exp'], label: '경험치', value: result.user.gained, plus: true } : null,
                (result?.joined_heroes ?? []).length ? { icon: ['result_ico_hero'], label: '합류 영웅', value: result.joined_heroes.length, plus: false } : null].filter(Boolean);
            const row = this.add.container(PAD, 0);
            const total = cards.length * cw + (cards.length - 1) * 12;
            cards.forEach((c, i) => {
                const cx = (W - total) / 2 + i * (cw + 12) + cw / 2;
                const cc = this.add.container(cx, 0);
                cc.add(this.add.image(0, 0, cardKey).setOrigin(0.5, 0).setDisplaySize(cw, ch));
                const ik = c.icon.find((k) => RX(k));
                if (ik) cc.add(this.add.image(0, ch * 0.36, ik).setDisplaySize(cw * 0.7 * 0.7, cw * 0.7 * 0.7));
                cc.add(makeText(this, 0, ch * 0.62, c.label, { size: 12, color: CSS.muted, origin: [0.5, 0.5] }));
                const vt = makeText(this, 0, ch * 0.87, `${c.plus ? '+' : ''}${Number(c.value).toLocaleString()}`, { size: 16, bold: true, color: c.value ? GOLD : CSS.muted, origin: [0.5, 0.5] });
                cc.add(vt);
                cc.setAlpha(0); cc.y = 16; c.obj = cc; c.vt = vt;
                row.add(cc);
            });
            row.setSize(W, ch); row.height = ch;
            add(row, 14);
            this.resultCards = cards;
        } else add(makeText(this, PAD, 0, `획득 골드  +${result?.gold ?? 0}`, { size: 18, heading: true, color: GOLD }), 14);
        const bars = [];
        const rowChips = []; // [{row, list:[{text,color,sfx}]}]
        // 경험치 행: 1줄 = 이름·Lv(왼쪽) + EXP +n(오른쪽), 2줄 = 바 + 값(바 밖 오른쪽). 레벨업 칩은 1줄 +EXP 왼쪽에 나타난다
        const u = result?.user;
        const pb = s.profileBefore;
        const pa = s.profileAfter;
        const rows = [];
        if (u) {
            const chips = [];
            if (u.leveled) chips.push({ text: 'LEVEL UP!', color: GOLD, sfx: 'levelup' });
            if (pb && u.max_cost > pb.max_cost) chips.push({ text: `코스트 ${pb.max_cost}→${u.max_cost}`, color: CSS.allyText, sfx: 'costup' });
            rows.push({ name: '플레이어', lv: `Lv ${u.level}`, gained: u.gained, max: Number(pa?.exp_to_next) > 0 ? Number(pa.exp_to_next) : Math.max(1, pa?.exp ?? u.exp), from: u.leveled ? 0 : (pb?.exp ?? 0), to: pa?.exp ?? u.exp, chips }); // exp = 현재 레벨 안 누적, exp_to_next = 그 레벨 필요 총량(ProgressionService addUserExp, 최고 레벨이면 0)
        }
        const unlockLines = []; // 결과 영웅 rewards_unlocked 문구(경험치 행 아래)
        // 시즌 전쟁: 영웅 경험치는 최상위 result.reward.heroes(서버가 result.heroes 에도 같은 배열). 없으면 기존 result.heroes(캠페인 정산 UI 그대로 재사용)
        ((warLine && result?.reward?.heroes?.length ? result.reward.heroes : result?.heroes) ?? []).filter((hr) => !hr?.non_hero && !/^npc_(cart|boat)_/.test(String(hr?.hero ?? '')) && !s.units.some((x) => x.hero === hr.hero && x.non_hero)).forEach((hr) => { // 수레·배는 결과 장수 목록 제외
            // 이름: 최종 units(생존) > 전투 중 스냅샷(전사한 지휘관) > 서버 result 의 이름 필드(있으면) > 코드
            const unit = s.units.find((x) => x.hero === hr.hero && x.kind !== 'troop') ?? this.store.heroSeen?.get(hr.hero)
                ?? (hr.display_name || hr.name || hr.name_ko ? hr : null);
            // 경험치 바: ProgressionService.addHeroExp 기준 exp = 현재 레벨 안 누적(레벨업 때 필요량을 빼고 남은 값), exp_to_next = 현재 레벨의 필요 총량(최고 레벨 0).
            //  -> 바 = exp / exp_to_next(레벨업이면 0 부터). exp_to_next 가 없거나 0 이면 이전 방식(획득량 기준)
            const etn = Number(hr.exp_to_next); const hasEtn = Number.isFinite(etn) && etn > 0;
            const lvUp = hr.level > hr.from_level;
            // 이름만(사용자 2026-11-14: '삼도수군통제사 이순신' -> '이순신'): short_name > name. 이름 앞에 칭호가 붙어 내려오면(title + ' ' 접두) 떼어 낸다
            const nmR = unit ? pureHeroName(unit) : hr.hero;
            (Array.isArray(hr.rewards_unlocked) ? hr.rewards_unlocked : []).filter((rw) => rw?.label).forEach((rw) => unlockLines.push(`${nmR} Lv.${rw.level} 달성 보상: ${rw.label}`)); // 레벨업으로 열린 보상
            rows.push({
                name: nmR, unit: unit ?? { kind: 'hero', hero: hr.hero },
                lv: `Lv ${hr.from_level}${lvUp ? ` → ${hr.level}` : ''}`,
                gained: hr.gained, max: hasEtn ? etn : Math.max(1, hr.exp + hr.gained), from: hasEtn ? (lvUp ? 0 : Math.max(0, hr.exp - hr.gained)) : Math.max(0, hr.exp - hr.gained), to: hr.exp,
                chips: [...(hr.level > hr.from_level ? [{ text: 'LEVEL UP!', color: GOLD, sfx: 'levelup' }] : []), ...(hr.exp_to_next != null && Number(hr.exp_to_next) === 0 && hr.level != null ? [{ text: '만렙', color: GOLD }] : [])], // 등급별 만렙 도달(서버 exp_to_next=0)
            });
        });
        // 바 밖 값 텍스트 예약 폭: 가장 긴 '최대/최대' 기준(행마다 바 길이가 같도록 공통 폭)
        const probe = makeText(this, 0, 0, '', { size: 13, bold: true });
        const valueW = Math.ceil(Math.max(48, ...rows.map((r) => { probe.setText(`${r.max}/${r.max}`); return probe.width; }))) + 4;
        probe.destroy();
        // 행 왼쪽 초상(사용자 2026-11-14): 영웅 = 초상 썸네일(지연 로드, 도착하면 채움), 플레이어·초상 없음 = 기본 실루엣. 나머지(이름·EXP·바)는 초상 오른쪽 폭(IW)
        const FS = L.lw < 480 ? 34 : 40; const faceX = FS + 10; const IW = W - faceX;
        const faceBox = (unit) => {
            const fc = this.add.container(0, 0);
            fc.add(this.add.rectangle(0, 0, FS, FS, 0x0b1020, 1).setOrigin(0).setStrokeStyle(1.5, COLOR.accent, 0.8));
            const sil = this.add.graphics(); // 기본 실루엣(머리 + 어깨)
            sil.fillStyle(0x3a4766, 1).fillCircle(FS / 2, FS * 0.4, FS * 0.2).fillRoundedRect(FS * 0.2, FS * 0.64, FS * 0.6, FS * 0.3, { tl: FS * 0.25, tr: FS * 0.25, bl: 2, br: 2 });
            fc.add(sil);
            const lg = unit?.hero ? unitPortraitLogical(unit, null, { thumb: true }) : null;
            const paint = (k) => {
                if (!k || !fc.scene || !this.textures.exists(k)) return;
                const im = this.add.image(FS / 2, FS / 2, k); const fw = im.frame.realWidth; const fh = im.frame.realHeight; const sd = Math.min(fw, fh);
                im.setCrop((fw - sd) / 2, 0, sd, sd).setDisplaySize((FS - 3) * fw / sd, (FS - 3) * fh / sd).setOrigin(0.5, (sd / 2) / fh);
                sil.setVisible(false); fc.addAt(im, 1);
            };
            const tk = lg ? ensurePortraitTex(this, lg, () => paint(tk)) : null;
            if (tk) paint(tk);
            return fc;
        };
        rows.forEach((r, ri) => {
            const row = this.add.container(PAD, 0);
            const face = faceBox(r.unit);
            const body = this.add.container(faceX, 0);
            const expT = makeText(this, IW, 0, `EXP +${r.gained}`, { size: 15, bold: true, color: EXPC, origin: [1, 0] });
            const chipObjs = r.chips.map((c) => makeText(this, 0, 0, c.text, { size: 14, heading: true, color: c.color, origin: [1, 0] }).setAlpha(0).setScale(1.4));
            let cx = IW - expT.width - 10;
            chipObjs.forEach((c) => { c.x = cx; cx -= c.width + 8; });
            const lvT = makeText(this, 0, 0, r.lv, { size: 14, color: CSS.muted });
            const nameT = fitText(makeText(this, 0, 0, r.name, { size: 15, bold: true }), Math.max(60, cx - lvT.width - 10));
            lvT.setPosition(nameT.width + 8, Math.max(0, (nameT.height - lvT.height) / 2));
            const lineH = Math.max(nameT.height, expT.height);
            chipObjs.forEach((c) => { c.y = Math.max(0, (lineH - c.height) / 2); });
            const bar = new StatBar(this, { x: 0, y: lineH + 6, w: IW, h: 16, max: r.max, value: r.from, color: COLOR.exp, label: 'EXP', valueW });
            body.add([nameT, lvT, expT, ...chipObjs, bar]);
            const rh = Math.max(FS, lineH + 6 + bar.displayHeight);
            face.y = Math.round((rh - FS) / 2);
            row.add([face, body]);
            row.setSize(W, rh);
            row.col = 1; // 낮은 화면 2열 배치 시 오른쪽 열(경험치 행)
            add(row, ri === rows.length - 1 ? 0 : 12);
            bars.push({ bar, to: r.to });
            rowChips.push({ chips: chipObjs, list: r.chips });
        });
        unlockLines.forEach((t, i) => add(makeText(this, PAD + W / 2, 0, t, { size: 13, bold: true, color: GOLD, wrap: W, align: 'center', origin: [0.5, 0] }), i === unlockLines.length - 1 ? 0 : 4));
        // 세로 누적(항목별 gapAfter)
        const stack = (list) => { let y = 0; list.forEach((o) => { o.y = y; y += (o.displayHeight || o.height || 0) + o.gapAfter; }); return y; };
        let contentH = stack(items);
        // 낮은 화면(844x390 등, 논리 높이 600~650) 대응(fe42): 내용이 화면에 다 들어가면 기존 1열 그대로.
        // 넘치면 (1) 가로 여유가 있으면 2열(왼쪽 = 결과·별·보상 카드, 오른쪽 = 경험치 행), (2) 그래도 넘치면 아래에서 내용 전체를 축소(최소 0.55배)
        const bottomPad = 20 + btnH + 24; // 내용 → 버튼 간격 20 + 버튼 + 하단 프레임 24
        const fitAvail = L.lh - 24 - (62 + 12) - bottomPad; // 배너 없는(최소 상단) 기준 내용 가용 높이
        const w1 = w; // 1열 패널 폭(배너 폭 기준)
        let mw = w; // 실제 모달 폭
        const right = items.filter((o) => o.col === 1);
        if (contentH > fitAvail && right.length && right.length < items.length && L.lw - 24 >= W * 2 + COLGAP + PAD * 2) {
            const left = items.filter((o) => o.col !== 1);
            left[left.length - 1].gapAfter = 0;
            contentH = Math.max(stack(left), stack(right));
            right.forEach((o) => { o.x += W + COLGAP; });
            mw = W * 2 + COLGAP + PAD * 2;
        }

        // 배너 + 패널 세로 배치
        const bannerKey = !result?.abandoned ? (win ? 'banner.victory' : 'banner.defeat') : null;
        const nbKey = !result?.abandoned ? (win ? 'result_banner_victory' : 'result_banner_defeat') : null;
        const BL = win ? { titleY: 0.523, titleSafeW: 0.28, panelTopY: 0.72, titleFill: '#5A3A10', titleStroke: '#F8E7B0', sw: 3 } : { titleY: 0.502, titleSafeW: 0.5, panelTopY: 0.7, titleFill: '#F6DCD2', titleStroke: '#0B1020', sw: 4 }; // manifest result.banner.* layout
        const newBanner = !!(nbKey && RX(nbKey));
        let bn = newBanner ? this.add.image(0, 0, nbKey) : bannerKey ? skinImage(this, bannerKey) : null;
        const TAIL = newBanner ? 1 - BL.panelTopY : 0.12; // 배너 이미지 아랫단 장식 비율(패널 위 테두리에 걸치는 부분)
        let topPad = 62 + 12; // 배너 없음: 리본 제목 + 여백(Panel.bodyY + Modal 12)
        let bw = 0; let bh = 0;
        if (bn) {
            const ratio = bn.height / bn.width;
            bw = w1; bh = bw * ratio;
            const avail = L.lh - 24;
            const panelH = (b) => Math.ceil(b * TAIL + 18 + contentH + bottomPad);
            // 화면 높이가 모자라면 배너만 줄인다(패널 폭의 60%까지). 그래도 모자라면 배너 생략(리본 제목 폴백)
            const over = bh * (1 - TAIL) + panelH(bh) - avail;
            if (over > 0) { bh = Math.max(0, bh - over); bw = bh / ratio; }
            if (bw < w1 * 0.6) { bn.destroy(); bn = null; } else topPad = Math.round(bh * TAIL + 18);
        }
        const h = Math.min(L.lh - 24, Math.max(bn ? 200 : 240, Math.ceil(topPad + contentH + bottomPad)));
        const fitK = Math.min(1, Math.max(0.55, (h - topPad - bottomPad) / Math.max(1, contentH))); // 그래도 넘치면 내용 축소 비율(들어가면 1 = 기존)
        const modal = new Modal(this, {
            title: bn ? '' : (win ? '승리' : result?.abandoned ? '포기' : '패배'), w: mw, h, body: '', escClose: false, // 결과창은 Esc 로 닫지 않음(닫히면 HUD 비활성인 채 남음, 정검수)
            buttons: this.leaveWrap(BattleScene.startData?.mode === 'war' || warLine
                ? [{ label: '시즌 지도로', variant: 'primary', onClick: () => this.scene.start('Lobby', { tab: 'war', notice: warLine?.text ?? '' }) }] // 시즌 지도 = 로비 멀티 > 시즌 전쟁(상단 바·하단 탭 유지)
                : s.mode === 'room'
                ? [{ label: '로비로', variant: 'primary', onClick: () => this.scene.start('Lobby', { tab: 'room', notice: win ? '대전에서 승리했습니다' : '대전이 종료되었습니다' }) }]
                : [
                    ...(unlockedNext.length ? [{ label: L.lw < 480 ? '다음으로' : '다음 스테이지', variant: 'primary', onClick: () => playAfterStage(this, s.stageId ?? s.stage?.id ?? BattleScene.startData?.stageId, result, { scene: 'Lobby', data: { tab: this.lobbyTab(), sortieStageId: unlockedNext[0].id } }) }] : []), // 새로 열린 스테이지가 있으면 바로 출정(클리어 후 대사 먼저, 하플레이 2026-11-04)
                    { label: '다시 도전', variant: unlockedNext.length ? undefined : 'primary', onClick: () => playAfterStage(this, s.stageId ?? s.stage?.id ?? BattleScene.startData?.stageId, result, { scene: 'Battle', data: { stageId: s.stageId ?? s.stage?.id ?? BattleScene.startData?.stageId ?? undefined, fresh: true } }) }, // 캠페인 승리: 클리어 후 대사(<code>_post) 먼저. stageId: 배치 화면 경유(battleId 진입)도 같은 스테이지 재도전(view.stage_id)
                    fcgEq.length // 첫 클리어 장비를 받았으면 '로비로' 대신 '장비 장착'(로비 영웅 탭 + 장착 안내, 버튼 수 유지)
                        ? { label: '장비 장착', onClick: () => playAfterStage(this, s.stageId ?? s.stage?.id ?? BattleScene.startData?.stageId, result, { scene: 'Lobby', data: { tab: 'hero', notice: '영웅을 고른 뒤 상세 → 장비에서 받은 장비를 장착하세요.' } }) }
                        : { label: '로비로', onClick: () => playAfterStage(this, s.stageId ?? s.stage?.id ?? BattleScene.startData?.stageId, result, { scene: 'Lobby', data: { tab: this.lobbyTab() } }) },
                ]),
        });
        this.resultModal = modal; this.lastResult = result;
        const inner = modal.inner;
        inner.y = topPad;
        if (fitK < 1) { inner.setScale(fitK); inner.x += Math.round((mw * (1 - fitK)) / 2); } // 가운데 정렬 유지
        if (bn) {
            const total = bh * (1 - TAIL) + h;
            const top = Math.max(12, (L.lh - total) / 2);
            modal.panel.y = Math.round(top + bh * (1 - TAIL));
            bn.setScale(bw / bn.width).setPosition(L.lw / 2, top + bh / 2);
            // 글자: 리본 띠의 세로 중앙(이미지 높이의 약 56%)
            const bt = newBanner
                ? fitText(makeText(this, L.lw / 2, top + bh * BL.titleY, win ? '승리' : '패배', { size: clamp(Math.round(bh * 0.2), 26, 40), heading: true, color: BL.titleFill, origin: [0.5, 0.5], stroke: { color: BL.titleStroke, width: BL.sw } }), Math.max(60, bw * BL.titleSafeW))
                : makeText(this, L.lw / 2, top + bh * 0.56, win ? '승리' : '패배', { size: clamp(Math.round(bh * 0.16), 22, 34), heading: true, color: win ? '#5a3a10' : '#f6dcd2', origin: [0.5, 0.5], stroke: win ? { color: '#f8e7b0', width: 3 } : { color: '#0B1020', width: 5 } });
            modal.add([bn, bt]);
            if (newBanner && !quiet) this.resultFx(modal, { win, cx: L.lw / 2, cy: top + bh * 0.45, bn, bt, bw, bh });
        }
        inner.add(items);
        const cap = this.resultWarCap; // 점령 성공 문구 스탬프 인(연출 끄기면 정적)
        if (cap && !isInstant()) { const k = cap.scaleX; cap.setAlpha(0).setScale(k * 1.6); tween(this, { targets: cap, to: { alpha: 1, scaleX: k, scaleY: k }, duration: 360, delay: 500, ease: 'Back.easeOut' }); }
        if (quiet) { // 연출 없이 최종 상태: 별 점등·카드 값·EXP 바·칩
            (this.resultStars?.list ?? []).forEach((st) => st.f.scene && st.f.setVisible(true));
            (this.resultCards ?? []).forEach((c) => { if (c.obj.scene) { c.obj.setAlpha(1); c.obj.y = 0; c.vt.setText(`${c.plus ? '+' : ''}${Number(c.value).toLocaleString()}`); } });
            bars.forEach(({ bar, to }) => { bar.value = to; bar.render?.(to); });
            rowChips.forEach(({ chips }) => chips.forEach((chip) => chip.setAlpha?.(1).setScale?.(1)));
            return;
        }
        let delay = 0;
        // 별 순차 점등(750ms 부터 220ms 간격, filled scale 1.8 -> 1) + 3성 펄스, 보상 카드 순차 등장 + 카운트업
        (this.resultStars?.list ?? []).forEach((st, i) => {
            this.time.delayedCall(750 + i * 220, () => { if (!st.f.scene) return; st.f.setVisible(true); const k = st.f.scaleX; st.f.setScale(k * 1.8); tween(this, { targets: st.f, to: { scaleX: k, scaleY: k }, duration: 200, ease: 'Back.easeOut' }); audio.play('star'); });
        });
        (this.resultCards ?? []).forEach((c, i) => {
            this.time.delayedCall(1600 + i * 120, () => {
                if (!c.obj.scene) return;
                tween(this, { targets: c.obj, to: { alpha: 1, y: 0 }, duration: 180 });
                const proxy = { v: 0 }; const fmt = (v) => `${c.plus ? '+' : ''}${Math.round(v).toLocaleString()}`;
                tween(this, { targets: proxy, to: { v: Number(c.value) || 0 }, duration: 600, onUpdate: () => c.vt.setText(fmt(proxy.v)), onComplete: () => c.vt.setText(fmt(c.value)) });
            });
        });
        if (this.resultCards?.length) delay = 2100;
        bars.forEach(({ bar, to }) => {
            this.time.delayedCall(delay, () => { audio.play('exp'); const proxy = { v: bar.value }; tween(this, { targets: proxy, to: { v: to }, duration: FX.result.expMs, onUpdate: () => bar.render(proxy.v), onComplete: () => { bar.value = to; bar.render(to); } }); });
            delay += FX.result.rowGapMs + FX.result.expMs * 0.6;
        });
        let ci = 0;
        rowChips.forEach(({ chips, list }) => chips.forEach((chip, k) => {
            const at = delay + (ci++) * FX.result.chipMs;
            this.time.delayedCall(at, () => { audio.play(list[k].sfx); tween(this, { targets: chip, to: { alpha: 1, scale: 1 }, duration: FX.result.chipMs, ease: 'Back.easeOut' }); });
        }));
    }
}
