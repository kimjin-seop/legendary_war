import Phaser from 'phaser';
import { COLOR, CSS, textStyle } from '../theme.js';
import { L } from '../layout.js';
import { fxScale, isInstant, tween, wait } from '../ui/motion.js';
import { unitTex, unitPortraitLogical, ensurePortraitTex, texKey, ensureBattleBgs, manifestHas, troopPortraitLogical, loaded, withVer } from '../assets.js';
import { unitClassName, unitClassGlyph } from '../systems/names.js';
import { FX } from '../fx_config.js';
import { CutsceneSfx } from './CutsceneSfx.js';
import { stepsOf } from '../systems/soldiers.js';
import { ARROW, arcHeight, fireVolley, volleySchedule } from './ArrowFx.js';
import { cutIntro, cutImpact, dismissSkillBanner } from './SkillFx.js';
import { waterStateOf, showsShip, shipTypeOf, shipTexKey, shipFrame } from '../systems/water.js';
import { isBoatSheetUnit } from '../UnitView.js'; // 사람 없는 배 시트 판정(맵 UnitView 와 같은 규칙)
import { u32AnimFrame } from '../data/unityTileset.js';
import { slice, icon } from '../ui/skin.js';
import { troopIcon } from '../ui/GameIcons.js'; // 병종 아이콘 단일 소스(2026-11-08)
import { setNoticesVisible } from '../ui/Toast.js';
import { STAT_CAP } from '../ui/PortraitCard.js'; // 능력치 게이지 상한(영웅 상세 카드와 같은 기준)
import { microPlayable, buildMicro, runMicro } from './MicroCutscene.js'; // 병사 미시 교전 재생(서버 attack.micro, shadow/on 에서만. 없으면 기존 연출)

// 교전 컷신(랑그릿사식 구성 참고, 에셋/UI 복제 없음): 상단 약 56% = 측면 무대(원거리 = 좌우 지형 분할, 근접 = 한 장면; 영웅 1체 또는 병사 최대 10 군집),
// 하단 약 40% = 정보 패널(초상화/이름/병력 수/VS/HP 바). 돌격 -> 충돌 -> 타격 교환(접전)+병력 수 카운트다운·HP 감소 -> 원위치 복귀 -> 유지 -> 종료.
// 시간은 모두 motion.js 의 tween/wait 를 거쳐 배속을 따르고, 연출 끄기/스킵이면 즉시 끝난다(끄기면 아무것도 만들지 않음).
//
// BattleCutscene.play(scene, parent, { attacker, defender, result, onDone }) -> Promise<void>
//   attacker/defender: { unit(서버 유닛 필드 team/type/hero/name/kind), side: 'left'|'right', hp(공격 직전 HP), hpMax, soldiers? }
//   result: { dmgToDef, dmgToAtk, soldiersLostDef, soldiersLostAtk, defenderDead, attackerDead } (soldiers 값이 없으면 HP 비율로 추정)
const MAX_SOLDIERS = 10;
// 컷신 초상 후보(원본 > 썸네일). manifest 에 있는 초상이 하나도 없으면 문화권·병종 병사 초상(portrait.troop.<culture>.<troop>, 문화권 폴백 포함)을 마지막 후보로
// 일반 병사 부대(troop, 2026-11-14 사용자 '일반 병종이랑 싸우면 소속 영웅 초상이 나옴'): 소속 영웅 초상으로 넘어가지 않게 leader 없이 조회(병종 초상·특수 병사 외형 초상만)
function portraitCands(s, leaderStub) {
    const stub = s.unit?.kind === 'troop' ? null : leaderStub;
    const lgs = [unitPortraitLogical(s.unit, stub, { thumb: false }), unitPortraitLogical(s.unit, stub, { thumb: true })].filter(Boolean);
    if (!lgs.some((k) => manifestHas(k))) { const fb = troopPortraitLogical(s.unit?.troop_type ?? s.unit?.type, s.unit?.culture ?? leaderStub?.culture ?? null, { thumb: false }); if (fb) lgs.push(fb); }
    return lgs;
}
const RANGED = new Set(['archer', 'mage', 'gunner']); // gunner: 원거리 교전 연출(전용 총격 연출·에셋 전 임시로 원거리 공용)
// 교전 컷신 타이밍(ms, 1배속·풀 모드) — 조정은 여기 한 곳에서. 축약(k=0.65)·배속(settings.speed)이 곱해진다.
// 흐름: 진입(검정+와이프) -> 돌진(빠르게) -> 히트스톱 -> 타격 교환(접전, 병력 틱다운 동시) -> 정리 -> 원위치 복귀(빠르게) -> 결과 유지 -> 와이프아웃
// 총 길이(보병 근접, 일반): 70+150 + 650 + 80 + (10x105+40) + 100 + 260 + 1060 + 200 = 약 3.66초(이전 약 3.66초와 동일 수준).
// 이전 값: 돌격 1150 / 기병 800 / 난전 흔들림 160 / 유지 1350 / 복귀 없음(돌격 위치에서 종료)
export const CUT_T = {
    enterBlack: 70, wipeIn: 150, panelFade: 200, // 진입(변경 없음)
    charge: 650, chargeCav: 480, // 돌진(이전 1150 / 800). 원거리 발사 구간도 charge 를 쓴다
    waveGap: 70, waveCap: 0.4, // 파도식 출발 간격(이전 약 100~120ms) / 최대 지연 비율(이전 0.45)
    zoomIn: 150, hitstop: 80, // 충돌 직전 줌 / 히트스톱(변경 없음)
    flashAlpha: 0.33, flashMs: 100, shakeAmp: 4, shakeAmpBack: 5, shakeMs: 300, // 약한 플래시·쉐이크(변경 없음)
    beats: 10, beat: 105, beatJitter: 40, lungePx: 14, recoilPx: 6, // 타격 교환(신규): 박자 수·박자 길이·병사별 엇박·찌르기/밀림 폭
    tickMin: 80, tickMax: 120, tickBudget: 500, // 병력 숫자 틱다운(변경 없음, 타격 교환과 동시 진행)
    heroSlow: 400, heroFall: 300, // 영웅 사망 슬로모션(변경 없음)
    settle: 100, back: 260, // 교환 종료 후 정리 / 원위치 복귀(신규)
    hold: 1060, out: 200, // 복귀 후 결과 유지(이전 1350) / 와이프아웃
    // 영상 참고 구성(2026-11-04 docs/ATTACK_MOTION_REF.md): 배경 뒤 빈 대기 / 돌진 후 오버슛 / 걸어서 복귀 / 영웅끼리 겹침 / 군집 뒤엉킴 / 위로 튕겨 사라짐 / 마법 구슬·불덩이
    refIdle: 300, refBeats: 4, refHoldEnd: 520, refOvershoot: 200, refWalk: 420, refOverlap: 150, refTangle: 400, refFly: 220, refHold: 600,
    mageOrbs: 11, mageOrbMs: 400, mageBoomMs: 130, mageBoomGap: 90,
};
const T = CUT_T;
// 컷신 화면 구성: 'ref' = 참고 이미지 구성(2026-11-04 사용자 제공: 큰 반신 컷인·붓 스트로크·속도선·상단 상성 리본·얇은 하단 패널) / 'classic' = 직전 구성(buildPanel·buildPanelShort). 되돌리기 = 'classic'
const CUT_STYLE = 'ref';
// 초상 아래쪽 페이드 텍스처(캔버스, 키 캐시): 아래 frac 구간을 불투명 -> 투명. 실패하면 원본 키
function fadeBottom(sc, key, frac = 0.3) {
    const nk = `${key}__fadeb`;
    if (sc.textures.exists(nk)) return nk;
    try {
        const src = sc.textures.get(key).getSourceImage(); const fr = sc.textures.getFrame(key);
        const w = fr.realWidth; const h = fr.realHeight;
        const ct = sc.textures.createCanvas(nk, w, h); const ctx = ct.getContext();
        ctx.drawImage(src, fr.cutX, fr.cutY, fr.cutWidth, fr.cutHeight, 0, 0, w, h);
        ctx.globalCompositeOperation = 'destination-in';
        // destination-in 은 그린 도형 밖을 지우므로 전체를 그라데이션 한 번으로 채운다(위 1-frac 불투명 -> 바닥 투명)
        const gr = ctx.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(1 - frac, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ct.refresh();
        return nk;
    } catch (e) { console.warn('[cutscene] 페이드 텍스처 실패(원본 사용)', e); if (sc.textures.exists(nk)) sc.textures.remove(nk); return key; }
}
const CUT_FX_REQ = new Set(); // 컷신 연출 이미지(fx.cut_*·ui.cut_ribbon) 로드 요청 키(중복 방지)
// 근접 교전 배경으로 쓸 지형 쪽: 'defender'(방어자 진지, 기본) | 'attacker'
export const MELEE_BG_SIDE = 'defender';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
// 막대 폭만 바꾸기(원점 고정): Rectangle.width 직접 대입은 표시 원점(displayOrigin)이 처음 폭 기준으로 남아 줄어든 막대가 가운데·반대쪽으로 밀렸다(사용자 2026-11-04 '체력바가 가운데로 정렬됨').
//  setSize + 원점 재계산, 0 에 가까우면 숨김(0 폭 도형 깨짐 방지)
function setBarW(r, w) {
    if (!r?.scene) return;
    const ww = Math.max(0, w); const h = r.height;
    if (ww < 0.5) { r.setVisible(false); return; }
    r.setVisible(true);
    if (r.setSize) r.setSize(ww, h); else r.width = ww;
    r.setDisplayOrigin?.(r.originX * ww, r.originY * h);
}
const PANEL_BG = 0x0a0e18;
// 이름 맞춤(말줄임 금지, 사용자 요청 2026-11-04): 폭을 넘으면 글자 축소(minSize까지) -> 그래도 넘치면 2줄(공백 우선, 없으면 가운데 글자) + 필요 시 더 축소(최소 9)
function fitName(t, maxW, minSize) {
    let fs = parseInt(t.style.fontSize, 10) || 16;
    while (t.width > maxW && fs > minSize) { fs -= 1; t.setFontSize(`${fs}px`); }
    if (t.width <= maxW) return t;
    const str = String(t.text); const mid = Math.ceil(str.length / 2);
    let cut = -1; for (let k = 0; k <= mid; k += 1) { if (str[mid + k] === ' ') { cut = mid + k; break; } if (str[mid - k] === ' ') { cut = mid - k; break; } }
    t.setText(cut > 0 ? `${str.slice(0, cut)}\n${str.slice(cut + 1)}` : `${str.slice(0, mid)}\n${str.slice(mid)}`);
    while (t.width > maxW && fs > 9) { fs -= 1; t.setFontSize(`${fs}px`); }
    return t;
} // 하단 패널 단색(불투명, 필드 하단과 어울리는 짙은 톤)
// 병사 수/영웅 HP 10단계는 공용 규칙(systems/soldiers: ceil, hp>0 최소 1, 최대 10)
const visualCount = (hp, max) => stepsOf(hp, max);
// 컷신 배경 표(drawBackdrop 공용). 수상 배경(안아트 2026-11-03, 960x300 수평선 약 0.38): 바다 = sea_b(유닛 영역이 가장 단조, 기본) -> sea_a, 암초 = reef_a, 항구 = harbor_a, 강·여울 = river_a
const WET_BG = { sea: ['sea_b', 'sea_a'], reef: ['reef_a', 'sea_b', 'sea_a'], harbor: ['harbor_a', 'sea_b', 'sea_a'], water: ['river_a'], shallows: ['river_a'] };
// 지형 코드 -> 안아트 컷신 배경 키(bg.battle.<name>.a). 전용 배경이 없는 지형은 가까운 배경으로 대체(수상 이미지가 없을 때의 최종 대체 = 강가)
const BG_ALIAS = { water: 'riverside', shallows: 'riverside', sea: 'riverside', reef: 'riverside', harbor: 'riverside', sand: 'riverside', rift_plank: 'bridge', road: 'plain', cliff: 'mountain', wall: 'castle', snow_desert: 'snow', hill: 'plain', dunes: 'desert', sand_plain: 'desert', sand_slow: 'desert', desert_a: 'desert', mountain_path: 'mountain', hills: 'plain', snowfield: 'snow', tundra: 'snow' };
// 지형 1개의 컷신 배경 후보(논리 키, 우선순위 순): sea=true(배가 수면 위) 목록 / 육상 목록. drawBackdrop 과 같은 규칙
const wetLogical = (n) => `bg.battle.${n.replace(/_([ab])$/, '.$1')}`; // sea_b -> bg.battle.sea.b
export function cutsceneBgCandidates(terrain, sea = false) {
    if (sea) return (WET_BG[terrain] ?? WET_BG.sea).map(wetLogical);
    const wetLand = ['sea', 'reef', 'harbor'].includes(terrain) ? WET_BG[terrain].map(wetLogical) : [];
    return [...wetLand, `bg.battle.${terrain}.a`, `bg.battle.${BG_ALIAS[terrain] ?? terrain}.a`];
}
// 전장 지형 목록 -> 지연 로드할 후보 묶음(assets.ensureBattleBgs 입력). 수상 지형(WET_BG 키)은 배 위 목록도 함께
export const cutsceneBgGroups = (terrains) => [...new Set(terrains)].filter(Boolean).flatMap((t) => (WET_BG[t] ? [cutsceneBgCandidates(t), cutsceneBgCandidates(t, true)] : [cutsceneBgCandidates(t)]));
const bold = (size, color = CSS.text, extra = {}) => textStyle(size, color, { fontStyle: 'bold', stroke: '#0B1020', strokeThickness: Math.max(3, size / 8), ...extra });

export class BattleCutscene {
    static play(scene, parent, opts) {
        return new Promise((resolve) => {
            // 컷신 시작: 맵의 커서 툴팁·버튼 툴팁을 닫고, 끝날 때까지 다시 뜨지 않게(scene.cutsceneOn, 강화면 38회차)
            scene.hideHoverTip?.(); scene.hideTip?.(); scene.cutsceneOn = (scene.cutsceneOn || 0) + 1;
            setNoticesVisible(scene, false); // 상단 알림 칩(오라 안내 등, depth 2000)이 컷신 위를 덮지 않게 재생 중 숨김
            const finish = () => { scene.cutsceneOn = Math.max(0, (scene.cutsceneOn || 1) - 1); if (!scene.cutsceneOn) setNoticesVisible(scene, true); opts.onDone?.(); resolve(); };
            if (isInstant()) { finish(); return; }
            let cs;
            try { cs = new BattleCutscene(scene, parent, opts); } catch (e) { console.error('[cutscene]', e); finish(); return; }
            cs.run(finish);
        });
    }

    constructor(scene, parent, { attacker, defender, result = {}, counter = false, flank = null, onTap = null, terrain = 'plain', terrainAtk = null, distance = 1, skill = null, hit = null, micro = null }) {
        this.scene = scene;
        this.counterCut = !!counter; // 이 컷 자체가 반격(왼쪽 = 반격하는 쪽)
        this.hit = hit; // {crit, affinity, counterCrit, counterAffinity}: 충돌 시 한 줄 강조(없으면 표시 없음)
        this.skill = skill; // 액티브 스킬 교전({name, powerPct, template}): 이름 배너 + 시전자 오라 + 충돌 강화 임팩트(fx/SkillFx). null 이면 기존과 동일
        this.mutual = !!result.mutual; // 반격이 있는 교전: 양쪽이 동시에 돌격·피해
        // 후면 공격 시 방어측이 등을 보이던 처리(up 행) 제거(사용자 2026-11-04 '배후공격도 똑같이 상대를 보게'): 스프라이트·배 방향은 항상 서로 마주 봄. '배후!' 표기·흔들림·보너스 표시는 this.flank 로 그대로
        this.flankIn = null;
        this.k = fxScale() < 1 ? 0.65 : 1; // 축약: 더 짧게, 먼지 생략
        this.distance = distance; // 화살 아치 높이 보정용
        this.short = this.k < 1;
        this.W = L.lw;
        this.H = L.lh;
        // 하단 패널 = 화면 아래 컴팩트 띠(2026-11-03: 44% -> 약 24~27%, 필드 가시 영역 확대). 무대 높이 = 나머지
        // 2026-11-04 사용자 '병종 아이콘 쓸데없이 큼 -> 세로폭 줄이고 초상 키워': 세로 폰 178 -> 166, 데스크톱 184~210 -> 156~176
        // 폰(세로 L.portrait·가로 L.short)은 하단 패널 없음(사용자 2026-11-04 '모바일에선 하단 패널을 아예 없애줘') -> 무대 = 화면 전체. 데스크톱(800 이상 가로, 높이 560 이상)은 그대로
        this.noPanel = false; // (원복 2026-11-04: '모바일 하단 패널 없애줘'는 컷신이 아니라 전투 화면 얘기였음 -> 폰 컷신도 패널 표시. 끄려면 (L.portrait || L.short))
        const PHc = this.noPanel ? 0 : CUT_STYLE === 'ref' ? (L.short ? 84 : this.W < 760 ? 132 : Math.round(Math.min(112, Math.max(92, this.H * 0.15)))) /* 참고 구성: 얇은 한 줄(세로 폰 2단) */ : L.short ? 104 : this.W < 760 ? 166 : Math.round(Math.min(176, Math.max(156, this.H * 0.23))); // 좁은 화면은 내용 높이에 맞춘 고정 178(강화면 37회차: 아래 빈 공간)
        this.SH = this.H - PHc;
        this.groundY = Math.round(this.SH * 0.78);
        this.destroyed = false;
        this.root = scene.add.container(0, 0).setAlpha(0);
        parent.add(this.root);
        // 입력 차단막(HUD/필드로 입력이 가지 않게) + 탭 스킵
        this.root.add(scene.add.rectangle(0, 0, this.W, this.H, 0x000000, 0.001).setOrigin(0).setInteractive().on('pointerdown', () => onTap?.()));
        this.shaker = scene.add.container(0, 0); // 흔들림 대상(무대만, 패널 제외)
        this.stage = scene.add.container(0, 0); // 줌 대상
        this.shaker.add(this.stage);
        this.root.add(this.shaker);
        // 수상: 맵 뷰의 수상 상태(spec.water, 없으면 서버 필드/지형 추정) -> 배 탑승(boarded)·수병(naval)이면 컷신에서도 배에 태우고,
        // 수상 칸이면 무대 배경을 수면(바다/강)으로 그린다(강가 흙바닥 배경 재사용 금지: 평지 전투처럼 보이던 원인)
        const wsOf = (spec, terr) => spec?.water ?? waterStateOf(spec?.unit, terr);
        const wa = wsOf(attacker, terrainAtk ?? terrain);
        const wd = wsOf(defender, terrain);
        // 사람 없는 배 시트(npc_boat_* / manifest object:'boat')는 시트 자체가 배 -> 컷신 배 오버레이 생략(이중 그림 방지). 수면 배경·항적은 유지
        const boatA = isBoatSheetUnit(attacker?.unit); const boatD = isBoatSheetUnit(defender?.unit);
        this.shipOn = [showsShip(wa) && !boatA, showsShip(wd) && !boatD];
        const seaA = (this.shipOn[0] || (boatA && showsShip(wa))) && !!wa?.onWater;
        const seaD = (this.shipOn[1] || (boatD && showsShip(wd))) && !!wd?.onWater;
        this.seaOn = [seaA, seaD]; // 수면 위 배(항적 fx.cut_wake 표시 대상)
        // 거리 규칙: 원거리(>=2) 분할(좌=공격자 타일, 우=대상 타일), 근접(1) 한 장면(MELEE_BG_SIDE).
        // 근접이라도 한쪽만 수면(배 vs 해안)이면 분할해 각자 발밑 지형을 보여준다
        const split = distance >= 2 || seaA !== seaD;
        const melee = MELEE_BG_SIDE === 'attacker' ? (terrainAtk ?? terrain) : terrain;
        const meleeSea = MELEE_BG_SIDE === 'attacker' ? seaA : seaD;
        this.cut = CUT_STYLE === 'ref' ? [this.cutKeysOf(attacker), this.cutKeysOf(defender)] : [null, null]; // 컷인 초상(고유 초상 있는 쪽만)
        this.buildStage({ left: split ? (terrainAtk ?? terrain) : melee, right: split ? terrain : melee, split, seaL: split ? seaA : meleeSea, seaR: split ? seaD : meleeSea });
        this.oppType = [defender?.unit?.type ?? null, attacker?.unit?.type ?? null]; // [공격측의 상대, 수비측의 상대] 병종(창병 방진 판정)
        this.sides = [this.buildSide(attacker, result, true), this.buildSide(defender, result, false)];
        // 배·물결 동기화(매 프레임, 트윈 뒤): 배가 하나라도 있거나 수면 물결이 있을 때만 등록
        if (this.sides.some((s) => s.ship) || this.waves.length) { this.onUpd = (time) => this.syncWater(time); scene.events.on('update', this.onUpd); }
        if (CUT_STYLE === 'ref') { this.buildCutIn(); this.buildPanelRef(); } else this.buildPanel();
        // 방향(facing) 피격: 'back'|'side' 이면 배너 + 추가 흔들림(1차: 후면 스프라이트가 없어 배너/색만). off 면 null
        this.flank = flank === 'back' || flank === 'side' ? flank : null;
        // 효과음(병종 큐 + 반격 변형). 정리는 destroy()/씬 종료에서 보장
        this.sfx = new CutsceneSfx(scene, { type: attacker.unit.type, counter, losesTroops: this.sides[1].lost > 0, scale: this.k, atk: attacker, def: defender, noCounter: !result.mutual }); // atk/def/noCounter: 전투 음성 함성 규모·방어측 응답 판정
        this.onShut = () => this.sfx.stop();
        scene.events.once('shutdown', this.onShut);
        this.flash = scene.add.rectangle(0, 0, this.W, this.SH, 0xffffff, 0).setOrigin(0);
        this.root.add(this.flash);
        this.curtain = scene.add.rectangle(0, 0, this.W, this.H, 0x000000, 1).setOrigin(0); // 와이프 커튼(진입·종료)
        this.root.add(this.curtain);
        // 병사 미시 교전(서버 micro_mode shadow/on 의 attack.micro): 형식이 맞으면 무대 병사 군집을 개체 단위 재생으로 교체(패널·초상·배경은 그대로).
        //  액티브 스킬 교전(서버 미시 제외)·배 탑승(개체 배 연출 미구현) 은 기존 연출. micro 가 없으면(off) 아무것도 바뀌지 않는다
        this.micro = null;
        if (micro && !skill && !this.shipOn.some(Boolean) && microPlayable(micro)) buildMicro(this, micro, [attacker, defender]);
        if (this.micro?.tl) this.sfx.voice.noCounter = !!this.micro.tl.noCounter; // 미시 교전: 서버 결과의 반격 없음 판정 우선
    }

    // 미시 교전 첫 타격 순간: 치명타 줄 + 배후/측면 배너 + 반격 리본(기존 clash 와 같은 표시, 흔들림·줌 없음)
    microImpact() {
        if (this.destroyed) return;
        this.hitLine();
        if (this.counterMarks) tween(this.scene, { targets: this.counterMarks, to: { alpha: 1 }, duration: 160 });
        if (this.flank) {
            const back = this.flank === 'back';
            if (back) this.vsText.setText('배후!').setColor('#ff7a6b');
            const had = dismissSkillBanner(this); // 스킬 이름 배너(같은 자리)를 먼저 걷고, 걷혔으면 0.09초 뒤 등장(겹침 없음)
            const bn = this.scene.add.text(this.W / 2, this.SH * 0.14, back ? '배후 공격!' : '측면 공격!', bold(40, back ? '#FF6B6B' : '#FFB347', { stroke: '#2a0a0a' })).setOrigin(0.5).setScale(1.5);
            this.root.add(bn);
            if (had) { bn.setAlpha(0); tween(this.scene, { targets: bn, to: { alpha: 1 }, duration: 60, delay: 90 }); }
            tween(this.scene, { targets: bn, to: { scale: 1 }, duration: 160, ease: 'Back.easeOut', delay: had ? 90 : 0 });
        }
    }

    // 진영: 영웅 1(전열 중앙, 큼) + 병사(사선 군집). 병사 수는 최대 10 으로 표시
    buildSide(spec, result, isAtk) {
        const { unit, side, hp, hpMax } = spec;
        const dir = side === 'left' ? 1 : -1; // 상대(중앙) 방향
        const before = spec.soldiers != null ? Math.min(MAX_SOLDIERS, Math.max(0, spec.soldiers)) : visualCount(hp, hpMax);
        const dmg = (isAtk ? result.dmgToAtk : result.dmgToDef) ?? 0;
        const dead = !!(isAtk ? result.attackerDead : result.defenderDead);
        const srvAfter = isAtk ? result.hpAfterAtk : result.hpAfterDef; // 서버 hp_after 가 있으면 우선(맵 배지 병력 N/10 과 같은 값)
        const hpAfter = dead ? 0 : Math.max(0, srvAfter ?? (hp - dmg));
        let lost = isAtk ? result.soldiersLostAtk : result.soldiersLostDef;
        if (lost == null) lost = before - (dead ? 0 : Math.max(before > 0 ? 1 : 0, visualCount(hpAfter, hpMax)));
        lost = Math.max(0, Math.min(before, lost));
        const after = before - lost;

        // 시선: 공격측(왼쪽 칸)은 오른쪽, 방어측(오른쪽 칸)은 왼쪽 측면 행. 후면 공격이면 방어측은 up 행(시트 없으면 left 폴백)
        const look = side === 'left' ? 'right' : 'left';
        const pick = (u) => {
            const back = !isAtk && this.flankIn === 'back';
            const t = unitTex(this.scene, u, back ? 'up' : look);
            return back && t && !t.sheet ? unitTex(this.scene, u, look) : t;
        };
        // 교전 당사자 종류: 영웅(지휘관/영웅, kind != troop) = 1체 / 부대(troop) = 병사 최대 10명
        const isHeroUnit = unit.kind !== 'troop';
        const heroTex = pick(unit);
        const troopTex = pick({ ...unit, kind: 'troop', hero: null });
        const srcH = (t) => (t ? this.scene.textures.getFrame(t.key, t.frame).realHeight : 32);
        const unitH = srcH(troopTex ?? heroTex);
        // 병사 크기: 원작처럼 화면 높이 약 1/8. 좁은 화면(세로)은 칸 폭 기준(반쪽 폭 / 4.2)과 비교해 작은 쪽(정수 배율 하한 1)
        const halfW = this.W / 2 - 12;
        const sizeT = this.W < 760 ? Math.min(this.H * 0.125, halfW / 4.2) : this.H * 0.125;
        // 참고 구성: 유닛 1.5배(사용자 2026-11-04 '전체 유닛 사이즈 1.5배', 컷신만). 정수 기준 배율 x 1.5(최근접 필터), 영웅은 아래 heroScale 이 같은 표시 높이로 따라감, 열·행 간격은 wpx 비례로 함께 커짐
        const UNIT_K = CUT_STYLE === 'ref' ? 1.5 : 1;
        const baseScale = Math.max(1, Math.round(sizeT / unitH)) * UNIT_K;
        const wpx = unitH * baseScale;
        const heroScale0 = Math.max(1, Math.round((this.W < 760 ? Math.min(this.H * 0.17, halfW * 0.5) : this.H * 0.17) / srcH(heroTex)));
        // 영웅 크기 = 일반 병사와 같은 표시 높이(사용자 2026-11-04 '영웅 크기를 일반 병종이랑 똑같게'): 참고 구성은 병사 표시 높이(wpx)에 맞춘 정수 배율. 이전 = 화면 높이 17%
        const heroScale = CUT_STYLE === 'ref' ? wpx / Math.max(1, srcH(heroTex)) : heroScale0; /* 소수 배율 허용(강화면 gacha88: 667·390 에서 반올림 때문에 영웅 34~41px vs 병사 46~52px). 텍스처 필터는 최근접 그대로 */ // 영웅 1체: 화면 높이 약 17%(좁은 화면은 칸 폭 절반 이하)
        const color = unit.team === 'ally' ? COLOR.ally : COLOR.danger;
        const mk = (tex, scale) => {
            if (tex) return this.scene.add.image(0, 0, tex.key, tex.frame).setScale(scale).setOrigin(0.5, 1).setFlipX(!!tex.flipX); // 시트는 flip 없음, 단일 이미지는 left 만 flipX
            return this.scene.add.rectangle(0, 0, 32 * scale, 32 * scale, color).setOrigin(0.5, 1).setStrokeStyle(2, COLOR.text);
        };
        const cutHere = !!this.cut?.[isAtk ? 0 : 1] && !(this.W < 760 && !L.short); // 컷인 초상이 있는 쪽(세로 폰 제외 = 초상은 위쪽)은 군집을 중앙 쪽으로(초상과 겹치지 않게)
        // 군집 시작 위치(사용자 2026-11-04 '초상화 무시하고 뒤쪽으로'): 참고 구성 = 초상과 무관하게 진영 반쪽 바깥쪽(화면 가운데에서 32%, 세로 폰 30%). 병사가 초상 위에 그려지는 순서는 그대로.
        //  돌진·접근 시간은 고정(T.charge 650ms)이라 거리가 늘어난 만큼 속도만 빨라진다(충돌 지점 = 가운데). 이전 = 초상 있는 쪽 18%·없는 쪽 25%
        const home = this.W / 2 + dir * -1 * this.W * (CUT_STYLE === 'ref' ? (this.W < 760 && !L.short ? 0.3 : 0.32) : (cutHere ? 0.18 : 0.25)); // 칸 중심(2026-11-04 '옆으로 더': 데스크톱 0.32->0.41, 가로 폰 0.37, 세로 폰 0.30->0.32. 바깥 열은 아래 칸 클램프로 화면 안)
        // 간격 1.2배(사용자 2026-11-04 '너무 오밀조밀': 이전 열 wpx*0.72·행 wpx*0.45 상한) + 병사별 고정 시드 지터(아래). 칸 폭·무대 높이 상한은 그대로 비례 확대
        // 창병 방진(사용자 2026-11-04): 창병(영웅·일반)이 기병을 상대할 때만 열·행 간격을 평소의 약 58%로 좁히고 지터도 줄인다(앞열 2줄 창 겨눔 = 앞으로 기울임)
        const isCav = (t) => /cav|horse|knight|mount/i.test(String(t ?? ''));
        const phalanx = CUT_STYLE === 'ref' && unit.type === 'spear' && isCav(this.oppType?.[isAtk ? 0 : 1]);
        const SPREAD = phalanx ? 0.58 : 1.2;
        const sp = Math.min(wpx * 0.72 * SPREAD, Math.max(4, ((halfW - wpx) / 3.2) * SPREAD)); // 열 간격
        const gap0 = Math.min(wpx * 0.45 * SPREAD, ((this.SH * 0.38) / 4) * SPREAD); // 행 간격
        const gap = CUT_STYLE === 'ref' && !phalanx && sp < wpx * 0.5 ? Math.max(gap0, Math.min(wpx * 0.75, ((this.SH * 0.38) / 4) * SPREAD)) : gap0; // 열 간격이 좁으면(390 세로 폰) 세로로 더 벌려 겹침 완화(무대 높이 상한 안)
        // 고정 시드 난수(유닛 id + 병력): 컷 안에서 흔들리지 않고 같은 교전은 같은 배치
        let seed = 2166136261; for (const ch of `${unit.id ?? ''}|${spec.soldiers ?? hp}|${isAtk ? 'a' : 'd'}`) { seed ^= ch.charCodeAt(0); seed = Math.imul(seed, 16777619) >>> 0; }
        const rnd = () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
        const jit = (amp) => (rnd() * 2 - 1) * amp * (phalanx ? 0.4 : 1);
        const midY = this.groundY - this.SH * 0.03;
        const members = [];
        if (isHeroUnit) {
            // 영웅 유닛: 전용 스프라이트(없으면 병종 폴백) 1체를 정수 배율로 크게. 숫자는 HP 10단계
            members.push({ o: mk(heroTex, heroScale), hero: true, x0: home + dir * sp * 0.4, y0: midY + gap * 0.5, died: dead });
        } else {
            // 부대 유닛: 병사 최대 10명, 4/3/3 열(앞열=중앙 쪽), 뒤 열일수록 바깥쪽 + 사선. 영웅은 그리지 않는다
            // 폰(가로 폰·세로 폰, 참고 구성): 1.5배 크기에서 같은 진영 겹침이 심해(강화면 gacha89: 667 겹침 쌍 32/34) 표시 병사를 최대 6명(3/3 두 열)으로. 쓰러지는 병사 수는 비율로 환산(병력 숫자·바는 실제 값 그대로)
            const phone = CUT_STYLE === 'ref' && (L.short || L.portrait || this.W < 760);
            const cap = phone ? 6 : MAX_SOLDIERS;
            const vis = Math.min(before, cap);
            const visLost = dead ? vis : before > 0 ? Math.min(vis, lost > 0 ? Math.max(1, Math.round((lost * vis) / before)) : 0) : 0;
            const cols = phone ? [3, 3] : [4, 3, 3];
            let i = 0;
            cols.forEach((n, c) => {
                for (let r = 0; r < n && i < vis; r++, i++) {
                    members.push({
                        o: mk(troopTex, baseScale),
                        x0: home + dir * sp * 0.9 - dir * c * sp + dir * (r % 2) * 10 + jit(sp * 0.45), // 가로 지터 ±간격 45%(2026-11-04 '더 흩트려', 이전 30%)
                        y0: midY + (r - (n - 1) / 2) * gap + c * gap * 0.22 + jit(gap * 0.4), // 열마다 아래로 비켜(뒷열이 앞열에 가려지지 않게) + 세로 지터 ±간격 40%(이전 25%)
                        died: i < visLost, // 앞열부터 쓰러짐(폰은 표시 인원 비율로 환산)
                        col: c, // 열(0 = 앞열). 궁병 순차 사격 순서
                    });
                }
            });
            // members[0] = 앞열 가운데(돌격 목표·타격 숫자·발사 기준점)
            const lead = Math.min(members.length - 1, 1);
            if (lead > 0) [members[0], members[lead]] = [members[lead], members[0]];
            if (!members.length) members.push({ o: mk(troopTex, baseScale), x0: home, y0: midY, died: true }); // 방어 코드(병력 0)
        }
        if (phalanx) members.forEach((m) => { if ((m.col ?? 0) <= 1) m.o.setAngle(dir * 8); }); // 방진 앞 2열: 창을 앞으로 겨눈 자세
        // 칸 안으로 클램프(좁은 화면에서 가장자리 잘림·분할선 넘침 방지)
        const lo = (side === 'left' ? 8 : this.W / 2 + 10);
        const hi = (side === 'left' ? this.W / 2 - 10 : this.W - 8);
        // 참고 구성(2026-11-04 '화면 바깥으로'): 바깥 가장자리는 병사 폭 절반 가까이(45%)까지 화면 밖으로 걸쳐도 허용(통째로 사라지지 않게), 안쪽(가운데선) 한계는 그대로
        const outCut = 0; // (되돌림 2026-11-04: 이동 대상은 병력이 아니라 초상 -> 바깥 가장자리 8px 안쪽 클램프로 복귀) // 바깥쪽 클램프에서 hw 를 몇 배 덜 쓸지(0.9 -> 최대 폭의 45% 가 화면 밖)
        members.forEach((m) => { const hw = (m.o.displayWidth ?? wpx) / 2; m.x0 = side === 'left' ? Math.max(lo - 8 * (outCut ? 1 : 0) + hw * (1 - outCut), Math.min(hi - hw, m.x0)) : Math.max(lo + hw, Math.min(hi + 8 * (outCut ? 1 : 0) - hw * (1 - outCut), m.x0)); });
        members.forEach((m) => { m.o.setPosition(m.x0, m.y0); this.stage.add(m.o); });
        // 배(맵과 같은 안아트 ship_overlay back/front 시트, 행 = 시선). 시트가 없으면 코드로 그린 선체 폴백. 병사마다 1척(돌격·복귀·피격을 같이 움직인다)
        const ship = this.shipOn[isAtk ? 0 : 1];
        if (ship) members.forEach((m) => { m.ship = this.makeShip(m, m.hero ? unit : { ...unit, kind: 'troop', hero: null }, !isAtk && this.flankIn === 'back' ? 'up' : look, this.seaOn[isAtk ? 0 : 1], !isAtk); });
        members.slice().sort((a, b) => a.y0 - b.y0).forEach((m) => { // 아래가 앞. 배: 항적 -> back -> 병사 -> front
            if (m.ship?.wake) this.stage.bringToTop(m.ship.wake);
            if (m.ship?.back) this.stage.bringToTop(m.ship.back);
            this.stage.bringToTop(m.o);
            if (m.ship?.front) this.stage.bringToTop(m.ship.front);
        });
        return {
            ship,
            phalanx, vsPhalanx: CUT_STYLE === 'ref' && isCav(unit.type) && this.oppType?.[isAtk ? 0 : 1] === 'spear',
            displayName: spec.displayName, leaderName: spec.leaderName, stats: spec.stats ?? null, isHero: isHeroUnit, portraitHero: spec.portraitHero ?? unit.hero, leader: spec.leader ?? null, unit, dir, home, members, hp, hpMax, hpAfter, dmg, before, after, lost, dead, color,
            // 단일 방향 교전은 공격측만 움직이고, 반격이 있는 교전(mutual)은 방어측도 병종대로 움직인다
            mode: !isAtk && !this.mutual ? 'idle' : RANGED.has(unit.type) ? 'ranged' : unit.type === 'flyer' ? 'dive' : CUT_STYLE !== 'ref' ? (unit.type === 'cavalry' ? 'cav' : 'charge') : (unit.type === 'spear' || (unit.kind === 'troop' && unit.type !== 'cavalry') ? 'march' : 'charge'), // 창병은 영웅도 일반공격
            // 참고 구성(사용자 2026-11-04): 돌진(charge) = 영웅 보병·영웅 기병·일반 기병 / 일반 보병 부대(창병 포함) = march(걸어서 접근 -> 기존 박자 접전, 오버슛 없음)
        };
    }

    // 무대 배경(거리 규칙): 원거리(거리 >= 2) = 좌(공격자 타일 지형) / 우(대상 타일 지형) 분할 + 디더링 분할 띠,
    // 근접(거리 1) = 분할 없이 한 장면(지형은 MELEE_BG_SIDE 상수: 기본 방어측 타일). 바닥선 높이는 양쪽 동일.
    // 지형별 통짜 배경 이미지(bg.battle.<terrain>.a)가 있으면 칸 폭에 맞게 cover 크롭, 없으면 코드 그래픽으로 폴백.
    buildStage({ left = 'plain', right = 'plain', split = false, seaL = false, seaR = false } = {}) {
        const { W, SH } = this;
        this.waves = []; // 수면 물결 레이어(syncWater 가 좌우로 일렁이게)
        const g = this.scene.add.graphics();
        this.stage.add(g);
        // 양쪽 지형·수면 상태가 같으면 분할하지 않고 한 장면으로(2026-11-03: 같은 평지끼리도 반쪽 cover 두 장 + 디더 분할 띠가 가운데 회색 체크무늬 세로 띠로 보이던 문제)
        // 2026-11-07: 원거리(split)면 지형이 같아도 한 장면 위에 가운데 경계선(옅게, alpha 0.5)을 그린다(사용자: 거리가 있으면 필드 사이에 벽). 근접은 선 없음
        const one = left === right && !!seaL === !!seaR;
        if (!split || one) { this.drawBackdrop(g, 0, W, right, false, seaR); if (!split) return; }
        else { this.drawBackdrop(g, 0, W / 2, left, true, seaL); this.drawBackdrop(g, W / 2, W / 2, right, true, seaR); }
        const same = left === right;
        // 경계: 가운데 얇은 진한 선(2px) + 양쪽으로 부드럽게 옅어지는 그림자(2px 띠를 알파만 줄여 겹침). 2026-11-03: 이전 3px 격자 디더가 밝은 하늘 위에서 회색 체크무늬로 보였다
        const half = 18; const g2 = this.scene.add.graphics().setAlpha(same ? 0.5 : 1);
        for (let dx = 0; dx < half; dx += 2) { const a = 0.42 * (1 - dx / half) ** 1.6; g2.fillStyle(0x0b0704, a).fillRect(W / 2 + 1 + dx, 0, 2, SH).fillRect(W / 2 - 3 - dx, 0, 2, SH); }
        g2.fillStyle(0x24160a, 1).fillRect(W / 2 - 1, 0, 2, SH);
        g2.fillStyle(0xf0d58c, 0.35).fillRect(W / 2 - 2, 0, 1, SH).fillRect(W / 2 + 1, 0, 1, SH); // 금빛 가는 테두리
        this.stage.add(g2);
    }

    // 한 칸(ox, 폭 W) 배경. part=true 면 분할 칸이라 실루엣이 이웃 칸으로 넘치지 않게 안쪽에만 둔다.
    // 배경 래퍼(2026-11-04 강화면 gacha47): 지형 배경이 아직 로드 전이면(전투 진입 직후·QA 훅·전장에 없던 지형) 코드 배경을 먼저 그리고 지연 로드 요청 ->
    //  도착하면 그 칸의 코드 배경 오브젝트를 지우고 이미지로 교체(흐름·카메라 영향 없음). 이미 있으면 기존처럼 바로 이미지
    drawBackdrop(g, ox, W, terrain, part, sea = false) {
        const n0 = this.stage.list.length;
        this.bgPick = null;
        if (this.drawBackdrop0(g, ox, W, terrain, part, sea)) {
            // 이미지는 그렸지만 우선 후보가 아직 안 와서 별칭(예: 바다 -> 강가 riverside)을 쓴 경우: 우선 후보를 받아 도착 시 교체(강화면 gacha48 Low: 바다 컷이 강가 배경)
            const pk = this.bgPick; this.bgPick = null;
            const pref = pk?.cands.find((lg) => manifestHas(lg));
            if (pk && pref && texKey(pref) !== pk.key) {
                const s0 = this.scene;
                try {
                    ensureBattleBgs(s0, [[pref]], (ok) => {
                        if (!ok || this.destroyed || !pk.img?.scene || !s0.textures.exists(texKey(pref))) return;
                        const img = this.coverImage(texKey(pref), ox, W);
                        this.stage.moveTo(img, this.stage.getIndex(pk.img));
                        pk.img.destroy();
                    });
                } catch { /* 별칭 유지 */ }
            }
            return;
        }
        const extra = this.stage.list.slice(n0).filter((o) => o !== g);
        const groups = sea ? [cutsceneBgCandidates(terrain, true)] : [cutsceneBgCandidates(terrain)];
        const s = this.scene;
        try {
            ensureBattleBgs(s, groups, (ok) => {
                if (!ok || this.destroyed || !this.stage?.scene) return;
                const k2 = groups[0].map(texKey).find((k) => s.textures.exists(k));
                if (!k2) return;
                extra.forEach((o) => o.destroy());
                this.waves = (this.waves ?? []).filter((w) => w.scene);
                const img = this.coverImage(k2, ox, W);
                this.stage.moveTo(img, Math.min(this.stage.list.length - 1, this.stage.getIndex(g) + 1)); // 공용 바탕 그래픽 바로 위(유닛·연출 아래)
            });
        } catch { /* 폴백 유지 */ }
    }

    drawBackdrop0(g, ox, W, terrain, part, sea = false) {
        const s = this.scene;
        const { SH } = this;
        const gy = Math.round(SH * 0.61); // 바닥 시작(양쪽 동일)
        // 수상 배경(안아트 2026-11-03, 960x300 수평선 약 0.38): 바다 = sea_b(유닛 영역이 가장 단조, 기본) -> sea_a, 암초 = reef_a, 항구 = harbor_a,
        // 강·여울 = river_a(강 한가운데). sea=true(배가 수면 위)면 이 목록만 보고, 이미지가 없으면(미로드·manifest 누락) 코드 수면(drawSea)으로 폴백.
        // sea=false 인 수상 지형(비행·도보로 항구·여울에 선 경우): 바다·암초·항구는 같은 수상 이미지, 강·여울은 기존 강가(riverside, 물가에 선 구도)
        // (표 WET_BG·BG_ALIAS 는 모듈 상단 cutsceneBgCandidates 로 이동 — 전투 진입 시 이 전장 지형의 배경만 지연 로드하는 데 같은 규칙을 쓴다)
        const has = (k) => s.textures.exists(k);
        if (sea) {
            const wk = cutsceneBgCandidates(terrain, true).map(texKey).find(has);
            if (wk) { this.bgPick = { img: this.coverImage(wk, ox, W), key: wk, cands: cutsceneBgCandidates(terrain, true) }; return true; }
            this.drawSea(g, ox, W, terrain, part, gy);
            return;
        }
        // 지형 코드 -> 안아트 컷신 배경 키(bg.battle.<name>.a). 전용 배경이 없는 지형은 가까운 배경으로 대체, 없으면 아래 코드 배경 폴백
        const key = cutsceneBgCandidates(terrain).map(texKey).find(has) ?? '';
        if (key) { this.bgPick = { img: this.coverImage(key, ox, W), key, cands: cutsceneBgCandidates(terrain) }; return true; }
        const T2 = {
            forest: { sky: [0x1d2b3a, 0x2c4152], ground: 0x3d5a2e, groundD: 0x2c4321 },
            castle: { sky: [0x1b2236, 0x2b3550], ground: 0x6d6658, groundD: 0x55503f },
            wall: { sky: [0x1b2236, 0x2b3550], ground: 0x6d6658, groundD: 0x55503f },
            mountain: { sky: [0x22304a, 0x3a4d6a], ground: 0x6b5a44, groundD: 0x524433 },
            cliff: { sky: [0x22304a, 0x3a4d6a], ground: 0x6b5a44, groundD: 0x524433 },
            water: { sky: [0x203a5a, 0x3b6a8f], ground: 0x2e5f7a, groundD: 0x244c63 },
            sea: { sky: [0x203a5a, 0x3b6a8f], ground: 0x2e5f7a, groundD: 0x244c63 },
            reef: { sky: [0x203a5a, 0x3b6a8f], ground: 0x3c6e80, groundD: 0x2c5566 },
            shallows: { sky: [0x203a5a, 0x3b6a8f], ground: 0x4c7f86, groundD: 0x3a6469 },
            swamp: { sky: [0x26302a, 0x3a463b], ground: 0x4a523a, groundD: 0x373e2b },
            snow_desert: { sky: [0x6d86a3, 0x9fb6cc], ground: 0xd9c48a, groundD: 0xbfa970 },
            village: { sky: [0x2a3c5c, 0x4a6488], ground: 0x6a7a3e, groundD: 0x55632f },
        }[terrain] ?? { sky: [0x2a4468, 0x5a7ea6], ground: 0x5f8a45, groundD: 0x4a6e35 };
        const inside = (x, spread) => !part || (x - spread >= ox && x + spread <= ox + W);
        // 하늘: 3단 띠(그라데이션 대용)
        g.fillStyle(T2.sky[0], 1).fillRect(ox, 0, W, gy * 0.45);
        g.fillStyle(T2.sky[1], 1).fillRect(ox, gy * 0.45, W, gy * 0.55);
        g.fillStyle(T2.sky[1], 0.6).fillRect(ox, gy * 0.3, W, gy * 0.15);
        // 원경 언덕
        g.fillStyle(T2.groundD, 0.55);
        for (let i = 0; i < 6; i++) { const cx = ox + (W / 5) * i + ((i * 37) % 60); const ew = W * 0.32; if (inside(cx, ew / 2)) g.fillEllipse(cx, gy, ew, gy * 0.42); }
        const silo = (spread, fn) => { for (let i = 0; i < 14; i++) { const x = ox + (W / 13) * i + ((i * 53) % 40) - 20; if (inside(x, spread)) fn(x, i); } };
        if (terrain === 'forest') {
            silo(34, (x, i) => { const h = gy * (0.38 + ((i * 17) % 10) / 40); g.fillStyle(0x1f3a24, 1).fillTriangle(x, gy - h, x - 34, gy, x + 34, gy); g.fillStyle(0x2b5530, 1).fillTriangle(x, gy - h * 0.8, x - 22, gy - h * 0.15, x + 22, gy - h * 0.15); });
        } else if (terrain === 'castle' || terrain === 'wall') {
            const wy = gy - gy * 0.42;
            g.fillStyle(0x4b5060, 1).fillRect(ox, wy, W, gy - wy);
            g.fillStyle(0x5d6373, 1);
            for (let x = 0; x + 24 <= W; x += 40) g.fillRect(ox + x, wy - 14, 24, 14); // 총안
            g.fillStyle(0x3b3f4b, 1);
            for (let x = 0; x + 70 <= W; x += 80) g.fillRect(ox + x + ((x / 80) % 2) * 40, wy + 20, 30, 2); // 석재 줄눈
            (part ? [0.25, 0.75] : [0.12, 0.38, 0.62, 0.88]).forEach((f) => { const tx = ox + W * f; g.fillStyle(0x555b6b, 1).fillRect(tx - 26, wy - gy * 0.22, 52, gy * 0.22 + 2); g.fillStyle(0x6a7080, 1); for (let k = 0; k < 3; k++) g.fillRect(tx - 26 + k * 20, wy - gy * 0.22 - 12, 12, 12); g.fillStyle(0xc8503c, 1).fillRect(tx - 1, wy - gy * 0.22 - 44, 3, 32).fillRect(tx + 2, wy - gy * 0.22 - 44, 18, 10); });
        } else if (terrain === 'mountain' || terrain === 'cliff') {
            silo(90, (x, i) => { const h = gy * (0.55 + ((i * 13) % 10) / 30); g.fillStyle(0x4d5262, 1).fillTriangle(x, gy - h, x - 90, gy, x + 90, gy); g.fillStyle(0xe9eef4, 1).fillTriangle(x, gy - h, x - 20, gy - h + 30, x + 20, gy - h + 30); });
        } else if (terrain === 'water' || terrain === 'shallows' || terrain === 'swamp') {
            g.fillStyle(terrain === 'swamp' ? 0x3d4a3a : 0x2f6a8c, 1).fillRect(ox, gy - gy * 0.18, W, gy * 0.18);
            g.fillStyle(0xdff6ff, terrain === 'swamp' ? 0.15 : 0.5);
            for (let i = 0; i < 24; i++) { const x = (i * 97) % Math.max(1, W - 34); g.fillRect(ox + x, gy - gy * 0.16 + ((i * 13) % 6) * (gy * 0.025), 18 + (i % 3) * 8, 2); }
            if (terrain === 'swamp') { g.fillStyle(0xe6ecef, 0.18); for (let i = 0; i < 6; i++) { const cx = ox + (W / 5) * i; if (inside(cx, 110)) g.fillEllipse(cx, gy - 10, 220, 30); } }
        } else if (terrain === 'snow_desert') {
            g.fillStyle(0xeef3f8, 0.9); for (let i = 0; i < 5; i++) { const cx = ox + (W / 4) * i; if (inside(cx, W * 0.2)) g.fillEllipse(cx, gy, W * 0.4, gy * 0.3); }
        } else if (terrain === 'village') {
            silo(42, (x, i) => { if (i % 2) return; const hw = 34; const hy = gy - 46; g.fillStyle(0xb39f74, 1).fillRect(x - hw, hy, hw * 2, 46); g.fillStyle(0x7a3222, 1).fillTriangle(x, hy - 30, x - hw - 8, hy, x + hw + 8, hy); g.fillStyle(0x3a3020, 1).fillRect(x - 6, gy - 20, 12, 20); });
        } else {
            g.fillStyle(0xffffff, 0.35); for (let i = 0; i < 5; i++) { const cx = ox + (W / 4) * i + 60; if (inside(cx, 80)) g.fillEllipse(cx, gy * (0.18 + (i % 2) * 0.1), 160, 26); }
        }
        // 바닥 띠 + 결(가로 줄) + 경계선(양쪽 같은 높이)
        g.fillStyle(T2.ground, 1).fillRect(ox, gy, W, SH - gy);
        g.fillStyle(T2.groundD, 1);
        for (let i = 0; i < 18; i++) { const x = (i * 131) % Math.max(1, W - 60); g.fillRect(ox + x, gy + 12 + ((i * 29) % Math.max(1, SH - gy - 20)), 26 + (i % 4) * 10, 3); }
        g.fillStyle(0x000000, 0.25).fillRect(ox, gy, W, 4);
    }

    // 통짜 배경 이미지를 칸(ox, 폭 W) x 무대 높이에 cover 크롭(가운데 기준)
    coverImage(key, ox, W) {
        const { SH } = this;
        const img = this.scene.add.image(ox + W / 2, SH / 2, key);
        const fw = img.frame.realWidth; const fh = img.frame.realHeight;
        const sca = Math.max(W / fw, SH / fh);
        const cw = W / sca; const chh = SH / sca;
        img.setCrop((fw - cw) / 2, (fh - chh) / 2, cw, chh).setScale(sca);
        this.stage.add(img);
        return img;
    }

    // 수면 무대(이미지 폴백: 배 탑승·수병이 수상 칸에 있는데 bg.battle.sea 등 이미지가 없을 때): 하늘 -> 원경(바다 = 먼 섬, 강 = 맞은편 기슭, 항구 = 부두 말뚝) -> 수평선 아래 전체 수면 + 물결.
    // 바닥선(gy)보다 위에서 수면이 시작해 병사·배가 물 위에 떠 있게 보인다. 물결 줄은 별도 레이어(this.waves)라 syncWater 가 일렁이게 한다
    drawSea(g, ox, W, terrain, part, gy) {
        const s = this.scene;
        const { SH } = this;
        const river = terrain === 'water' || terrain === 'shallows';
        const hy = Math.round(gy * 0.62); // 수평선
        const inside = (x, spread) => !part || (x - spread >= ox && x + spread <= ox + W);
        // 하늘(3단 띠) + 구름
        g.fillStyle(0x2a4a72, 1).fillRect(ox, 0, W, hy * 0.45);
        g.fillStyle(0x4a76a2, 1).fillRect(ox, hy * 0.45, W, hy * 0.55);
        g.fillStyle(0x8fb4d2, 0.5).fillRect(ox, hy * 0.82, W, hy * 0.18);
        g.fillStyle(0xffffff, 0.3);
        for (let i = 0; i < 4; i++) { const cx = ox + (W / 3.5) * i + 50; if (inside(cx, 80)) g.fillEllipse(cx, hy * (0.2 + (i % 2) * 0.14), 150, 22); }
        // 원경
        if (river) { // 맞은편 기슭(풀 언덕)
            g.fillStyle(0x3d5f3a, 1);
            for (let i = 0; i < 6; i++) { const cx = ox + (W / 5) * i + ((i * 37) % 50); const ew = W * 0.34; if (inside(cx, ew / 2)) g.fillEllipse(cx, hy, ew, hy * 0.28); }
            g.fillStyle(0x2d4a2c, 1).fillRect(ox, hy - 3, W, 4);
        } else { // 먼 섬 실루엣
            g.fillStyle(0x5b7896, 0.85);
            for (let i = 0; i < 3; i++) { const cx = ox + W * (0.18 + i * 0.33) + ((i * 41) % 30); const ew = W * (0.16 + (i % 2) * 0.08); if (inside(cx, ew / 2)) g.fillEllipse(cx, hy, ew, hy * (0.16 + (i % 2) * 0.08)); }
        }
        // 수면: 수평선부터 무대 바닥까지 4단 띠(멀수록 밝고 가까울수록 짙게)
        const deep = river ? [0x4f8fb0, 0x3f7ea2, 0x326d92, 0x285d80] : [0x5a93bd, 0x3d7aa8, 0x2c6893, 0x20567d];
        const bands = [hy, hy + (gy - hy) * 0.45, gy, gy + (SH - gy) * 0.45, SH];
        for (let i = 0; i < 4; i++) g.fillStyle(deep[i], 1).fillRect(ox, bands[i], W, bands[i + 1] - bands[i] + 1);
        g.fillStyle(0xe8f6ff, 0.55).fillRect(ox, hy, W, 2); // 수평선 반짝임
        if (terrain === 'reef') { // 암초: 중경에 바위 머리 + 흰 포말
            for (let i = 0; i < 5; i++) {
                const cx = ox + (W / 4.5) * i + ((i * 53) % 40) + 20;
                if (!inside(cx, 30)) continue;
                const ry = hy + (gy - hy) * (0.35 + (i % 2) * 0.3);
                g.fillStyle(0x4a4e58, 1).fillEllipse(cx, ry, 44, 14);
                g.fillStyle(0x6a6f7a, 1).fillEllipse(cx - 4, ry - 3, 26, 8);
                g.fillStyle(0xf2fbff, 0.7).fillRect(cx - 24, ry + 5, 48, 2);
            }
        } else if (terrain === 'harbor') { // 항구: 원경 부두 말뚝
            g.fillStyle(0x5a3e24, 1);
            for (let x = ox + 18; x < ox + W - 18; x += 34) g.fillRect(x, hy - 14, 5, 22);
            g.fillStyle(0x7a5634, 1).fillRect(ox, hy - 14, W, 4);
        }
        // 물결 줄(별도 레이어, 칸 안쪽에만: 일렁여도 분할 띠를 넘지 않게 좌우 여백 14px)
        const w = s.add.graphics();
        const pad = 14;
        for (let i = 0; i < 34; i++) {
            const t = i / 34;
            const y = Math.round(hy + 6 + (SH - hy - 10) * t); // 아래로 갈수록 굵고 길게(원근)
            const len = 12 + t * 34 + (i % 3) * 6;
            const x = ox + pad + ((i * 97) % Math.max(1, W - pad * 2 - len));
            w.fillStyle(0xe8f6ff, 0.25 + t * 0.35).fillRect(x, y, len, t > 0.5 ? 3 : 2);
            if (i % 2) w.fillStyle(0x183f5e, 0.35).fillRect(x + 6, y + 3, len * 0.6, 2); // 골(어두운 줄)
        }
        this.stage.add(w);
        this.waves.push({ g: w, ph: ox * 0.01 });
    }

    // 병사 1명분 배(back: 병사 뒤, front: 병사 앞). 크기 = 병사 표시 높이(맵과 같은 1:1 규약, 흘수선 = 시트 바닥 62/64)
    // wakeOn: 수면 위면 안아트 fx.cut_wake(32x16 4프레임 8fps, 수면선 = 위에서 11px, 뱃머리 물보라 = 오른쪽)를 선체 아래에 깐다. 왼쪽 향(방어측)은 flipX.
    // 크기 = 병사 표시 높이 / 32 의 정수 배율(NEAREST). 시트가 없으면 생략(코드 물보라 puff 는 그대로)
    makeShip(m, unit, dir, wakeOn = false, faceLeft = false) {
        const s = this.scene;
        let type = shipTypeOf(unit);
        if (!s.textures.exists(shipTexKey(type, 'back'))) type = 'default';
        const bk = shipTexKey(type, 'back');
        const fk = shipTexKey(type, 'front');
        const h = m.o.displayHeight || 64;
        const ship = { dir, f: -1, bob: 0, lastY: null, sink: null, sheet: false };
        if (s.textures.exists(bk) && s.textures.exists(fk)) {
            const sc = h / 64;
            ship.back = s.add.image(m.x0, m.y0, bk, shipFrame(dir, 0)).setOrigin(0.5, 1).setScale(sc);
            ship.front = s.add.image(m.x0, m.y0, fk, shipFrame(dir, 0)).setOrigin(0.5, 1).setScale(sc);
            ship.sheet = true;
        } else { // 시트 미로드 폴백: 코드 선체(갈색 사다리꼴 + 뱃전 띠). back 없음
            const g = s.add.graphics();
            const hw = h * 0.5;
            const hh = h * 0.3;
            g.fillStyle(0x6b4423, 1).fillPoints([{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw * 0.72, y: 0 }, { x: -hw * 0.72, y: 0 }], true);
            g.fillStyle(0x9a6a3a, 1).fillRect(-hw, -hh, hw * 2, Math.max(2, hh * 0.22));
            g.fillStyle(0x3a2412, 1).fillRect(-hw * 0.72, -2, hw * 1.44, 2);
            g.setPosition(m.x0, m.y0);
            ship.front = g;
        }
        if (wakeOn && s.textures.exists('fx_cut_wake')) {
            ship.wakeK = Math.max(1, Math.round(h / 32));
            ship.wake = s.add.image(m.x0, m.y0, 'fx_cut_wake', 0).setOrigin(0.5, 11 / 16).setScale(ship.wakeK).setFlipX(!!faceLeft);
            ship.wf = -1;
            this.stage.add(ship.wake);
        }
        if (ship.back) this.stage.add(ship.back);
        this.stage.add(ship.front);
        return ship;
    }

    // 매 프레임(scene update, 트윈 갱신 뒤): 물결 일렁임 + 배를 병사 위치에 맞추고 배와 병사를 함께 위아래로 흔든다(bob, 정수 px).
    // 병사 y 는 트윈이 절대값으로 쓰므로, 직전에 우리가 더한 bob 이 그대로 남아 있을 때만 빼고 다시 더한다(누적 방지).
    // 사망 병사: 병사가 날아가는 동안 배는 그 자리에서 기울며 가라앉는다(알파 동기화)
    syncWater(time) {
        if (this.destroyed) return;
        const still = isInstant();
        this.waves.forEach((w) => { if (w.g.active) w.g.x = still ? 0 : Math.round(Math.sin(time / 900 + w.ph) * 6); });
        const f = u32AnimFrame(time);
        const wf = Math.floor(time / 125) % 4; // 항적 8fps
        this.sides.forEach((s) => {
            if (!s.ship) return;
            s.members.forEach((m, i) => {
                const sh = m.ship;
                if (!sh || !m.o.active) return;
                const px = Math.max(1, Math.round((m.o.displayHeight || 64) / 32)); // 32 기준 1텍셀
                const base = sh.lastY != null && m.o.y === sh.lastY ? m.o.y - sh.bob : m.o.y;
                const dying = m.died && m.o.alpha < 1;
                const bob = still || dying ? 0 : Math.max(0, Math.round(Math.sin(time / 520 + i * 1.7 + (s.dir > 0 ? 0 : 2)) * 0.9 + 0.1)) * -px;
                if (!dying) { m.o.y = base + bob; sh.bob = bob; sh.lastY = m.o.y; } else { sh.bob = 0; sh.lastY = null; }
                if (dying && !sh.sink) sh.sink = { x: sh.front.x, y: sh.front.y };
                if (f !== sh.f && sh.sheet) { sh.f = f; const fr = shipFrame(sh.dir, f); sh.back.setFrame(fr); sh.front.setFrame(fr); }
                if (sh.wake) { // 항적: 수면에 고정(bob 미적용, 흘수선 = 시트 바닥 약 2/64 위)
                    if (wf !== sh.wf) { sh.wf = wf; sh.wake.setFrame(wf); }
                    const wx = sh.sink ? sh.sink.x : m.o.x;
                    const wy = (sh.sink ? sh.sink.y : base) - (m.o.displayHeight || 64) * (2 / 64);
                    sh.wake.setPosition(Math.round(wx), Math.round(wy));
                    sh.wake.alpha = m.o.alpha;
                }
                const parts = sh.back ? [sh.back, sh.front] : [sh.front];
                if (sh.sink) {
                    const t = 1 - m.o.alpha;
                    parts.forEach((o) => { o.x = sh.sink.x; o.y = sh.sink.y + t * (m.o.displayHeight || 64) * 0.35; o.angle = -s.dir * 14 * t; o.alpha = m.o.alpha; });
                } else {
                    parts.forEach((o) => { o.x = m.o.x; o.y = m.o.y; o.angle = m.o.angle * 0.3; o.alpha = m.o.alpha; });
                }
            });
        });
    }

    // 하단 정보 패널(2026-11-04 사용자 요청 '예전 디자인으로 원복'): 11/3 개편 전 디자인 재구성 — 남색 바탕 + 가운데 띠 / 이중 금테 프레임 + 모서리 장식(사각+마름모) /
    //  게이지 사이 중앙 메달 / 좌우 초상 자리(이제 액자 대신 투명 초상이 패널 뒤에서 서고, 자리에는 큰 병종 아이콘·역할 띠·레벨) / 이름·병종·큰 병력 숫자 /
    //  중앙 큰 VS / 중앙 하단 능력치(예전 표 자리: 좌우 대칭 게이지 + 보너스 칩, 아이콘 포함).
    //  예전과 다른 점: 초상 액자(이중 금테 박스) 없음(사용자 요청 '박스 제거·투명 초상'), 패널 높이는 1차 개편 높이(184~210) 유지, 표 숫자 -> 게이지.
    //  가로 폰(L.short)은 buildPanelShort(패널 104, 같은 프레임 장식).
    buildPanel() {
        if (L.short) { this.buildPanelShort(); return; }
        const sc = this.scene;
        const { W, H, SH } = this;
        const PH = H - SH;
        const panel = sc.add.container(0, SH);
        this.root.add(panel);
        const portLayer = sc.add.container(0, 0); // 투명 초상(패널 바탕보다 아래 = 아래쪽은 패널이 가림)
        panel.add(portLayer);
        const g = sc.add.graphics();
        panel.add(g);
        const GOLD = COLOR.accent;
        const GOLD_L = COLOR.accentLight;
        // 바탕 + 은은한 띠(예전 그대로)
        g.fillStyle(0x0e1733, 1).fillRect(0, 0, W, PH);
        g.fillStyle(0x16224a, 1).fillRect(0, PH * 0.12, W, PH * 0.76);
        // 장식 프레임: 바깥 금선 2px + 안쪽 밝은 금선 1px + 모서리 장식(사각 + 마름모)
        const fr = (x, y, w, h) => {
            g.lineStyle(2, GOLD, 1).strokeRect(x + 1, y + 1, w - 2, h - 2);
            g.lineStyle(1, GOLD_L, 0.7).strokeRect(x + 6, y + 6, w - 12, h - 12);
            [[x, y], [x + w, y], [x, y + h], [x + w, y + h]].forEach(([cx, cy]) => {
                g.fillStyle(GOLD, 1).fillRect(cx - 6, cy - 6, 12, 12);
                g.fillStyle(0x0e1733, 1).fillRect(cx - 3, cy - 3, 6, 6);
                g.fillStyle(GOLD_L, 1).fillPoints([{ x: cx, y: cy - 3 }, { x: cx + 3, y: cy }, { x: cx, y: cy + 3 }, { x: cx - 3, y: cy }], true);
            });
        };
        fr(0, 0, W, PH);
        const compact = W < 760;
        const m = 16;
        const nameSize = compact ? 16 : 24;
        const countSize0 = Math.round(compact ? Math.min(W * 0.1, 44) : Math.min(H * 0.094 * 1.15, PH * 0.32));
        const vsSize = Math.round(compact ? Math.min(W * 0.075, 30) : Math.min(PH * 0.3, 92));
        const ps = Math.round(compact ? Math.min(W * 0.22, PH * 0.32) : Math.min(W * 0.2, 280)); // 초상 자리 폭. 데스크톱 = 초상 폭(화면 20%, 최대 280 — 이전 min(PH-44, W*0.16, 210)): 자리에 초상이 직접 선다
        const portFront = compact ? null : sc.add.container(0, 0); // 데스크톱: 초상을 패널 바탕 위(글자 아래)에 그려 자리 칸을 초상이 채움
        if (portFront) panel.add(portFront);
        const barY = compact ? 22 : 26;
        const barH = compact ? 12 : 16;
        // 중앙 메달(HP 바 사이)
        g.fillStyle(GOLD, 1).fillCircle(W / 2, barY, 13);
        g.fillStyle(0x0e1733, 1).fillCircle(W / 2, barY, 8);
        g.fillStyle(GOLD_L, 1).fillCircle(W / 2, barY, 4);
        g.lineStyle(2, GOLD, 1).lineBetween(W / 2 - 34, barY, W / 2 - 14, barY).lineBetween(W / 2 + 14, barY, W / 2 + 34, barY);
        const portY = compact ? barY + barH + 18 : Math.round((PH - ps) / 2 + 10);
        const vsY = compact ? barY + 30 : Math.round(PH * 0.36);
        // 능력치 영역(예전 표 자리) 세로 위치: 게이지 2줄 + 보너스 칩 1줄을 패널 아래쪽에 붙인다
        const rowG = compact ? 18 : 26; const gH = compact ? 8 : 12; const chipH = compact ? 22 : 28;
        const gy0 = compact ? 114 : Math.round( /* 세로 폰: 초상 자리 큰 아이콘 제거로 자리 높이와 무관(이전 max(124, 자리 아래 +12)) */Math.max(vsY + vsSize * 0.6, PH - 10 - chipH - 10 - rowG * 2 + gH / 2));
        const by = gy0 + rowG + gH / 2 + (compact ? 6 : 8) + chipH / 2; // 보너스 칩 줄 중심
        this.sides.forEach((s) => {
            const isLeft = s.dir === 1;
            const px = isLeft ? m : W - m - ps;
            // 초상: 투명 PNG 전체(액자 없음)를 초상 자리 위에 세운다. 아래 일부는 패널 뒤로(패널이 위 레이어)
            const leaderStub = s.leader ?? (s.portraitHero ? { hero: s.portraitHero } : null);
            const lgs = portraitCands(s, leaderStub);
            // 초상 크게(사용자 2026-11-04 '아이콘 대신 초상 키워'): 폭 = 데스크톱 화면 20%(최대 280, 이전 자리 x1.3) / 세로 폰 화면 34%(최대 160, 이전 자리 x1.3 약 74px). 높이 상한 무대 72%(세로 폰 60%)
            const slotTop = compact ? portY : Math.max(barY + barH / 2 + 8, portY);
            const slotH = compact ? Math.max(36, gy0 - gH / 2 - 8 - slotTop) : PH - slotTop - 12;
            const pw = Math.round(compact ? Math.min(W * 0.34, 160) : ps); const ph = Math.round(Math.min(pw / 0.75, compact ? SH * 0.6 : SH * 0.72 + slotTop + slotH));
            const pcx = isLeft ? Math.max(pw / 2 + 4, px + ps / 2) : Math.min(W - pw / 2 - 4, px + ps / 2);
            const sink = compact ? Math.round(PH * 0.12) : slotTop + slotH; // 데스크톱: 초상 바닥 = 자리 칸 바닥(패널 안까지 보임)
            const putPortrait = (key) => { const img = sc.add.image(pcx, sink, key).setOrigin(0.5, 1); img.setScale(Math.min(pw / Math.max(1, img.frame.realWidth), ph / Math.max(1, img.frame.realHeight))); (portFront ?? portLayer).add(img); return img; };
            const pk = lgs.map(texKey).find((k) => sc.textures.exists(k));
            if (pk) putPortrait(pk);
            else { const late = lgs[lgs.length - 1]; if (late) ensurePortraitTex(sc, late, (key) => { if (!key || this.destroyed || !portLayer.scene || !sc.sys?.isActive?.()) return; putPortrait(key); }); }
            // 초상 자리(예전 액자 칸): 위 레벨 + 작은 병종 배지(우상단) + 아래 역할 띠('공격'/'반격'). 큰 병종 아이콘 제거(사용자 2026-11-04 '쓸데없이 큼')
            if (compact) { g.fillStyle(0x07101f, 0.55).fillRect(px, slotTop, ps, slotH); g.lineStyle(1, GOLD_L, 0.35).strokeRect(px, slotTop, ps, slotH); } // 데스크톱은 칸 바탕 없음(초상이 채움)
            const isz = compact ? 16 : 28; // 작은 배지(이전 자리 50~62% 크기). 세로 폰 16 = 좁은 칸(약 53px)에서 Lv 글자와 한 줄
            const icx = px + ps - (compact ? 3 : 4) - isz / 2; const icy = slotTop + 4 + isz / 2;
            const ticon = troopIcon(sc, s.unit.type, icx, icy, isz, { glyph: false }); // 병종 아이콘 단일 소스(영웅 카드 뱃지와 같은 도트 그림), 없으면 아래 글자
            if (ticon) panel.add(ticon);
            else panel.add(sc.add.text(icx, icy, unitClassGlyph(s.unit.type), bold(Math.round(isz * 0.75), '#f0d58c')).setOrigin(0.5));
            const role = isLeft ? (this.counterCut ? '반격' : '공격') : (this.mutual ? '반격' : null);
            if (role) {
                const rc = role === '반격' ? 0xe0782a : 0xffe08a;
                const hg = sc.add.graphics();
                hg.lineStyle(3, rc, 1).strokeRect(px - 3, slotTop - 3, ps + 6, slotH + 6);
                const rh = compact ? 18 : 24;
                const rb = sc.add.rectangle(px, slotTop + slotH - rh, ps, rh, role === '반격' ? 0x8a3a0c : 0x5a4310, 0.92).setOrigin(0);
                const rt = sc.add.text(px + ps / 2, slotTop + slotH - rh / 2, role, bold(compact ? 12 : 16, role === '반격' ? '#FFD2A8' : '#FFE08A')).setOrigin(0.5);
                panel.add([hg, rb, rt]);
                if (!isLeft) { [hg, rb, rt].forEach((o) => o.setAlpha(0)); this.counterMarks = [hg, rb, rt]; }
            }
            const lvN = Number(s.unit.level);
            if (Number.isFinite(lvN) && lvN > 0) panel.add(sc.add.text(px + 6, slotTop + 4, `Lv ${lvN}`, bold(compact ? 11 : 14, '#ffffff')).setOrigin(0, 0));
            // 이름 + 병종 / 병력 숫자: 초상 자리 안쪽(중앙 방향). 이름은 말줄임 없이: 폭에 맞춰 글자 축소 -> 그래도 넘치면 2줄
            const tx = isLeft ? px + ps + (compact ? 10 : 18) : px - (compact ? 10 : 18);
            const ox = isLeft ? 0 : 1;
            const nameMaxW = Math.max(60, Math.abs(W / 2 - tx) - (compact ? vsSize * 0.8 + 4 : 70));
            const name = fitName(sc.add.text(tx, compact ? portY : barY + barH + 12, s.displayName ?? s.unit.name ?? '', bold(nameSize)).setOrigin(ox, 0).setAlign(isLeft ? 'left' : 'right'), nameMaxW, compact ? 12 : 16);
            const cls = sc.add.text(tx, name.y + name.height + 1, unitClassName(s.unit.type), bold(compact ? 12 : 15, CSS.muted)).setOrigin(ox, 0);
            // 병력 숫자: 남은 높이(능력치 게이지 위 6)에 맞춰 크기 조정(이름이 2줄이어도 겹치지 않게)
            const countY = compact ? cls.y - 2 : cls.y + cls.height + 2; // 세로 폰: 병종명 줄 높이에 안쪽(VS 쪽) 정렬로 크게
            const lim = compact ? gy0 - gH / 2 - 6 : PH - 12;
            const countSize = Math.max(compact ? 18 : 26, Math.min(countSize0, Math.floor((lim - countY) / 1.18)));
            const countX = compact ? W / 2 - (isLeft ? 1 : -1) * Math.round(vsSize * 0.6) : tx;
            s.countText = sc.add.text(countX, countY, String(s.before), bold(countSize, '#ffffff', { stroke: '#000000', strokeThickness: Math.max(4, countSize / 9) })).setOrigin(compact ? 1 - ox : ox, 0);
            panel.add([name, cls, s.countText]);
            // HP 장식 바(예전 위치: 패널 상단, 메달 양옆) + 잔상 바
            const outer = compact ? m : m + ps + 18;
            const bx = isLeft ? outer : W / 2 + 40;
            const bw = Math.max(60, (isLeft ? W / 2 - 40 : W - outer) - bx);
            g.fillStyle(0x07101f, 1).fillRect(bx, barY - barH / 2, bw, barH);
            g.lineStyle(2, GOLD, 1).strokeRect(bx, barY - barH / 2, bw, barH);
            g.fillStyle(GOLD_L, 1).fillRect(isLeft ? bx - 6 : bx + bw, barY - barH / 2 - 2, 6, barH + 4); // 끝 장식
            s.fillW = bw - 6;
            s.fillX = bx + 3;
            const w0 = s.fillW * clamp01(s.before / MAX_SOLDIERS);
            // 장식 바 = 병력 비율(before/10, HP 비율 아님): 숫자·병사 쓰러짐과 같은 단계로 줄어든다(잔상 바는 stepBar 끝에 따라옴)
            s.ghost = sc.add.rectangle(s.fillX, barY, w0, barH - 6, 0xffd08a, 0.85).setOrigin(0, 0.5);
            s.fill = sc.add.rectangle(s.fillX, barY, w0, barH - 6, s.color).setOrigin(0, 0.5);
            s.fillHi = sc.add.rectangle(s.fillX, barY - (barH - 6) / 2 + 1, w0, 2, 0xffffff, 0.35).setOrigin(0, 0.5);
            s.hpText = sc.add.text(isLeft ? bx + bw : bx, barY + barH / 2 + 3, `${s.before}/${MAX_SOLDIERS}`, bold(compact ? 12 : 14)).setOrigin(isLeft ? 1 : 0, 0).setVisible(false); // 수치는 기본 숨김(바만)
            panel.add([s.ghost, s.fill, s.fillHi, s.hpText]);
        });
        // 중앙 VS(마법이면 '마법', 후면이면 '배후!')
        this.vsText = sc.add.text(W / 2, vsY, 'VS', bold(vsSize, '#f0d58c', { fontStyle: 'italic bold', stroke: '#2a1a05', strokeThickness: Math.max(5, vsSize / 9) })).setOrigin(0.5);
        panel.add(this.vsText);
        // 능력치(예전 표 자리): 가운데 라벨 AT/DF + 좌우 대칭 게이지(공격측 왼쪽, 방어측 오른쪽) + 바깥 끝 숫자(보정 부호·색). 상한 = STAT_CAP(공 92·수 54)
        const [a, d] = this.sides;
        const lab = compact ? 15 : 22; const numW = compact ? 40 : 56;
        const innerL = a.countText.x + (compact ? 0 : a.countText.width) + 10; // 게이지가 병력 숫자·이름 열을 침범하지 않게(데스크톱)
        const gwMax = compact ? Math.floor(W / 2 - m - lab - numW - 6) : Math.floor(W / 2 - lab - numW - Math.max(m + ps + 18, innerL));
        const gw = Math.max(40, Math.min(240, gwMax));
        const stat = (sd, k) => { const st = sd.stats; if (!st) return null; const b = k === 'AT' ? st.atBase : st.dfBase; const x = k === 'AT' ? st.atBonus : st.dfBonus; return b == null ? null : { b: Number(b) || 0, x: Number(x) || 0 }; };
        const g2 = sc.add.graphics(); panel.add(g2);
        ['AT', 'DF'].forEach((k, ri) => {
            const y = gy0 + ri * rowG;
            panel.add(sc.add.text(W / 2, y, k, bold(compact ? 13 : 18, '#f0d58c')).setOrigin(0.5));
            [a, d].forEach((sd, si) => {
                const dir = si === 0 ? -1 : 1; const x0 = W / 2 + dir * lab; const bx = dir < 0 ? x0 - gw : x0;
                g2.fillStyle(0x07101f, 1).fillRect(bx, y - gH / 2, gw, gH);
                g2.lineStyle(1, GOLD, 0.8).strokeRect(bx, y - gH / 2, gw, gH);
                const v = stat(sd, k); const fs = compact ? 12 : 16;
                if (!v) { panel.add(sc.add.text(x0 + dir * (gw + 5), y, '-', bold(fs, CSS.muted)).setOrigin(dir < 0 ? 1 : 0, 0.5)); return; }
                const cap = k === 'AT' ? STAT_CAP.at : STAT_CAP.df; const tot = Math.max(0, v.b + v.x);
                const wBase = gw * clamp01(v.b / cap); const wTot = gw * clamp01(tot / cap);
                const seg = (from, len, col) => { if (len <= 0.5) return; g2.fillStyle(col, 1).fillRect(dir < 0 ? x0 - from - len : x0 + from, y - gH / 2 + 1, len, gH - 2); };
                seg(0, Math.min(wBase, wTot), 0xd8b25a);
                if (v.x > 0) seg(wBase, wTot - wBase, 0x6fcf97);
                if (v.x < 0) seg(wTot, wBase - wTot, 0x7a2a24);
                panel.add(sc.add.text(x0 + dir * (gw + 5), y, v.x ? `${v.b}${v.x > 0 ? '+' : '−'}${Math.abs(v.x)}` : `${v.b}`, bold(fs, v.x > 0 ? '#b8f0c8' : v.x < 0 ? '#ffb3ab' : '#ffffff')).setOrigin(dir < 0 ? 1 : 0, 0.5));
            });
        });
        // 보너스 칩(예전 오라·지형 줄 자리): 아이콘 + 항목명 + 부호, 색 구분(상성 유리 금·불리 적 / 지형 가산 녹·감산 적 / 오라 청 / 스킬 보라). 가운데에서 바깥으로, 자리 없으면 생략
        this.bonusChips(panel, { W, PH, y: by, h: chipH, fs: compact ? 11 : 14, isz: compact ? 16 : 22, m: compact ? m : m + ps + 18 });
        this.panel = panel;
    }

    // 보너스 칩 줄(데스크톱·세로 폰 공용)
    bonusChips(panel, { W, PH, y, h, fs, isz, m }) {
        const sc = this.scene;
        const PAL = { adv: ['#FFD27A', 0x4a3208, 'adv'], dis: ['#FFB3AB', 0x4a1612, 'dis'], aura: ['#9FD8FF', 0x10304a, null], tp: ['#B8F0C8', 0x123a22, null], tn: ['#FFB3AB', 0x4a1612, null], skill: ['#D9C2FF', 0x2e1a4a, null] };
        const terrIcon = (code) => { const c = String(code ?? ''); return /forest|wood|jungle|bamboo/.test(c) ? 'forest' : /mountain|hill|cliff|highland/.test(c) ? 'mountain' : /water|river|sea|shallow|swamp|lake|marsh/.test(c) ? 'water' : 'plain'; };
        this.sides.forEach((sd, si) => {
            const st = sd.stats; const items = [];
            const affV = si === 0 ? this.hit?.affinity : (this.mutual ? this.hit?.counterAffinity : null);
            if (affV === 'adv') items.push(['상성 유리 ▲', 'adv', 'adv']);
            else if (affV === 'dis') items.push(['상성 불리 ▼', 'dis', 'dis']);
            if (st?.terrainPct) items.push([`${st.terrain ?? '지형'} ${st.terrainPct > 0 ? '+' : '−'}${Math.abs(st.terrainPct)}%`, st.terrainPct > 0 ? 'tp' : 'tn', terrIcon(st.code)]);
            if (st?.auraAtk || st?.auraDef) items.push([`오라 공+${st.auraAtk ?? 0}% 수+${st.auraDef ?? 0}%`, 'aura', null]);
            if (si === 0 && this.skill?.name) items.push([`${this.skill.name}${this.skill.powerPct ? ` ${this.skill.powerPct}%` : ''}`, 'skill', null]);
            const dir = si === 0 ? -1 : 1;
            let x = W / 2 + dir * 6; const lim = si === 0 ? m : W - m;
            items.forEach(([t, kind, ik]) => {
                const [fg, bg] = PAL[kind];
                const ic = ik ? icon(sc, ik, isz) : null;
                const tx = sc.add.text(0, 0, t, bold(fs, fg)).setOrigin(0, 0.5);
                const iw = ic ? isz + 4 : 0;
                const cw = Math.round(8 + iw + tx.width + 8);
                if ((dir < 0 ? x - cw < lim : x + cw > lim) || y + h / 2 > PH - 3) { tx.destroy(); ic?.destroy(); return; } // 자리가 없으면 생략(겹침 금지)
                const left = dir < 0 ? x - cw : x;
                const r = sc.add.rectangle(left, y, cw, h, bg, 1).setOrigin(0, 0.5).setStrokeStyle(1.5, Phaser.Display.Color.HexStringToColor(fg).color, 0.85);
                panel.add(r);
                if (ic) { ic.setPosition(left + 8 + isz / 2, y); panel.add(ic); }
                tx.setPosition(left + 8 + iw, y);
                panel.add(tx);
                x += dir * (cw + 5);
            });
        });
    }

    // [가로 폰 전용] 1차 개편 패널(높이 104) + 예전 프레임 장식. 아래 주석은 1차 개편 당시 설명
    // 하단 정보 패널(2026-11-03 UI 개선): 화면 하단에 붙은 컴팩트 띠. 짙은 단색(불투명) + 경계선·금테·프레임 없음(필드와 선 없이 맞닿음).
    // 초상 = 박스·프레임 없이 패널 뒤 레이어에서 필드 위로 선다(완전 불투명, 아래쪽은 패널이 가림).
    // 패널 = 진영 게이지(스킨 트랙 + 잔상 바 + 10칸 눈금) / 병종 아이콘·이름 / 병종·역할·레벨·상성 칩 / 큰 병력 숫자 / 중앙 VS / AT·DF·(오라)·지형 표
    buildPanelShort() {
        const sc = this.scene;
        const { W, H, SH } = this;
        const PH = H - SH;
        const panel = sc.add.container(0, SH);
        this.root.add(panel);
        const compact = W < 760 && !L.short; // 가로 폰(L.short)은 폭이 좁아도 좌우 한 줄 배치
        const short = L.short; // 가로 폰: 패널 104 높이(게이지·이름·병력 숫자·칩 + 능력치 한 줄)
        const GOLD = COLOR.accent;
        const m = compact ? 10 : 18;
        const portLayer = sc.add.container(0, 0); // 초상(패널 바탕보다 아래)
        panel.add(portLayer);
        const g = sc.add.graphics();
        panel.add(g);
        // 예전 디자인 프레임(원복 요청 2026-11-04): 바탕 + 가운데 띠 + 이중 금테 + 모서리 장식
        g.fillStyle(0x0e1733, 1).fillRect(0, 0, W, PH);
        g.fillStyle(0x16224a, 1).fillRect(0, PH * 0.12, W, PH * 0.76);
        g.lineStyle(2, COLOR.accent, 1).strokeRect(1, 1, W - 2, PH - 2);
        g.lineStyle(1, COLOR.accentLight, 0.7).strokeRect(6, 6, W - 12, PH - 12);
        [[0, 0], [W, 0], [0, PH], [W, PH]].forEach(([cx, cy]) => { g.fillStyle(COLOR.accent, 1).fillRect(cx - 6, cy - 6, 12, 12); g.fillStyle(0x0e1733, 1).fillRect(cx - 3, cy - 3, 6, 6); });
        const statSize = compact ? 13 : 16;
        const nameSize = compact ? 15 : 22;
        const countSize = compact ? 30 : short ? 30 : 46; // 가로 폰 34 -> 30(아래 미니 게이지와 간격)
        const vsSize = compact ? 22 : short ? 28 : 40;
        const barY = compact ? 16 : 20;
        const barH = compact ? 10 : 14;
        // 초상 크기(3:4 투명 PNG 전체, 바닥 기준). 아래 sink 만큼 패널 뒤로 들어간다
        const ph = Math.round(W < 800 ? Math.min(SH * 0.42, 220) : Math.min(SH * 0.52, 273)); // 좁은 가로 폰(667): 초상을 조금 줄여 무대 바깥 열(기병 끝)을 덜 가림(강화면 gacha44) // 가로 폰 초상: 1.3배(이전 min(SH*0.4, 210)) — 사용자 요청 '좀 더 크고 위로'
        const pw = Math.round(ph * 0.75);
        const sink = Math.round(PH * 0.35); // 패널 뒤로 숨는 깊이 50% -> 35%(더 위로)
        // 중앙 메달(게이지 사이)
        g.fillStyle(GOLD, 1).fillCircle(W / 2, barY, compact ? 9 : 12);
        g.fillStyle(PANEL_BG, 1).fillCircle(W / 2, barY, compact ? 5 : 7);
        g.fillStyle(COLOR.accentLight, 1).fillCircle(W / 2, barY, compact ? 2.5 : 3.5);
        const vsY = compact ? barY + 26 : short ? barY + 34 : barY + 46;
        // 칩(작은 라벨 상자): dir 1 = 오른쪽으로 쌓기(x 가 왼쪽 끝), -1 = 왼쪽으로(x 가 오른쪽 끝). 반환 = 다음 x
        const chip = (x, y, txt, fg, bgc, dir, store) => {
            const t = sc.add.text(0, 0, txt, bold(compact ? 10 : 12, fg)).setOrigin(0.5);
            const cw = Math.round(t.width + 10); const chh = Math.round(t.height + 2);
            const r = sc.add.rectangle(x, y, cw, chh, bgc, 1).setOrigin(dir === 1 ? 0 : 1, 0.5).setStrokeStyle(1, GOLD, 0.6);
            t.setPosition(dir === 1 ? x + cw / 2 : x - cw / 2, y);
            panel.add([r, t]);
            store?.push(r, t);
            return x + dir * (cw + 5);
        };
        this.sides.forEach((s) => {
            const isLeft = s.dir === 1;
            const dir = isLeft ? 1 : -1;
            const ox = isLeft ? 0 : 1;
            const edge = isLeft ? m : W - m; // 바깥 끝
            // 초상: 영웅 본인 > 부대 병종 초상 > 소속 지휘관(unitPortraitLogical, HUD 카드와 같은 키). 원본 > 썸네일 중 로드된 것, 없으면 썸네일 요청 후 도착 시 표시
            const leaderStub = s.leader ?? (s.portraitHero ? { hero: s.portraitHero } : null);
            const lgs = portraitCands(s, leaderStub);
            const pcx = isLeft ? m + pw / 2 : W - m - pw / 2;
            const putPortrait = (key) => {
                const img = sc.add.image(pcx, sink, key).setOrigin(0.5, 1);
                img.setScale(Math.min(pw / Math.max(1, img.frame.realWidth), ph / Math.max(1, img.frame.realHeight)));
                portLayer.add(img);
                return img;
            };
            const pk = lgs.map(texKey).find((k) => sc.textures.exists(k));
            if (pk) putPortrait(pk);
            else {
                const late = lgs[lgs.length - 1];
                if (late) ensurePortraitTex(sc, late, (key) => { if (!key || this.destroyed || !portLayer.scene || !sc.sys?.isActive?.()) return; putPortrait(key); });
            }
            // 게이지: 바깥 끝 -> 메달 옆. 좌우 대칭(바깥 끝 기준으로 채움, 줄면 중앙 쪽부터 빈다)
            const bw = Math.max(60, W / 2 - (compact ? 24 : 34) - m);
            const bx = isLeft ? m : W - m - bw;
            panel.add(slice(sc, 'gauge_bg', bw, barH, 'gauge').setPosition(bx, barY - barH / 2));
            const ih = Math.max(4, barH - 4);
            s.fillW = bw - 4;
            s.fillX = isLeft ? bx + 2 : bx + bw - 2;
            const w0 = s.fillW * clamp01(s.before / MAX_SOLDIERS);
            // 장식 바 = 병력 비율(before/10, HP 비율 아님): 숫자·병사 쓰러짐과 같은 단계로 줄어든다. 잔상 바는 stepBar 끝에 따라 줄어듦
            s.ghost = sc.add.rectangle(s.fillX, barY, w0, ih, 0xffd08a, 0.9).setOrigin(ox, 0.5);
            s.fill = sc.add.rectangle(s.fillX, barY, w0, ih, s.color).setOrigin(ox, 0.5);
            s.fillHi = sc.add.rectangle(s.fillX, barY - ih / 2, w0, Math.max(2, Math.round(ih * 0.4)), 0xffffff, 0.3).setOrigin(ox, 0);
            const ticks = sc.add.graphics();
            for (let i = 1; i < MAX_SOLDIERS; i += 1) ticks.fillStyle(0x000000, 0.4).fillRect(Math.round(bx + 2 + (s.fillW * i) / MAX_SOLDIERS), barY - ih / 2, 1, ih);
            s.hpText = sc.add.text(isLeft ? bx + bw : bx, barY + barH / 2 + 3, `${s.before}/${MAX_SOLDIERS}`, bold(compact ? 12 : 14)).setOrigin(isLeft ? 1 : 0, 0).setVisible(false); // 수치는 기본 숨김(바만)
            panel.add([s.ghost, s.fill, s.fillHi, ticks, s.hpText]);
            // 1줄: 병종 아이콘 + 이름(넘치면 축소 후 말줄임). 데스크톱은 안쪽 끝에 큰 병력 숫자
            const rowY = barY + barH / 2 + (compact ? 6 : 8);
            const isz = Math.round(nameSize * 1.6); // 병종 아이콘 크게(1.05 -> 1.6배)
            const ticon = troopIcon(sc, s.unit.type, edge + dir * (isz / 2), rowY + nameSize * 0.62, isz, { glyph: false }); // 병종 아이콘 단일 소스(도트 -> ico.troop), 없으면 생략
            if (ticon) panel.add(ticon);
            const nx = ticon ? edge + dir * (isz + 6) : edge;
            const disp = s.displayName ?? s.unit.name ?? '';
            const nmMax = 99; // 말줄임 금지(아래 fitName 이 축소·2줄) // 글자 수 상한은 넉넉히, 실제 맞춤은 아래 폭 기준(강화면 37회차: 390 에서 7자 말줄임이 너무 이름)
            const full = disp; // 길면 칭호 생략형 먼저, 그래도 길면 말줄임
            const name = sc.add.text(nx, rowY, full.length > nmMax ? `${full.slice(0, nmMax - 1)}…` : full, bold(nameSize)).setOrigin(ox, 0);
            const countX = compact ? edge : W / 2 - dir * (compact ? 30 : 56);
            const countY = compact ? rowY + nameSize + 4 : rowY - 2;
            s.countText = sc.add.text(countX, countY, String(s.before), bold(countSize, '#ffffff', { stroke: '#000000', strokeThickness: Math.max(4, countSize / 9) })).setOrigin(compact ? ox : 1 - ox, 0);
            const limit = compact ? W / 2 - dir * (vsSize * 0.9) : countX - dir * (countSize * 1.4 + 8); // 이름이 VS·병력 숫자와 겹치지 않는 안쪽 한계
            const maxW = Math.abs(limit - nx);
            if (maxW > 0) { name.setAlign(isLeft ? 'left' : 'right'); fitName(name, maxW, 11); }
            panel.add([name, s.countText]);
            // 2줄: 병종명 + 역할(공격/반격) + 레벨 + 상성 칩. 좁은 화면은 병력 숫자 옆 / 그 아래 줄
            const r2y = compact ? countY + countSize * 0.5 : rowY + nameSize + 16;
            let cx = compact ? edge + dir * (s.countText.width + 8) : edge;
            const cls = sc.add.text(cx, r2y, unitClassName(s.unit.type), bold(compact ? 11 : 13, CSS.muted)).setOrigin(ox, 0.5);
            panel.add(cls);
            cx += dir * (cls.width + 8);
            let cy = r2y;
            if (compact) { cx = edge; cy = countY + countSize + 10; }
            const role = isLeft ? (this.counterCut ? '반격' : '공격') : (this.mutual ? '반격' : null);
            if (role) {
                const marks = [];
                cx = chip(cx, cy, role, role === '반격' ? '#FFD2A8' : '#FFE08A', role === '반격' ? 0x6a2c08 : 0x4a3810, dir, marks);
                if (!isLeft) { marks.forEach((o) => o.setAlpha(0)); this.counterMarks = marks; } // 반격 발동 순간에 켬(run)
            }
            const lvN = Number(s.unit.level);
            if (Number.isFinite(lvN) && lvN > 0) cx = chip(cx, cy, `Lv ${lvN}`, '#ffffff', 0x18223a, dir);
            const affV = isLeft ? this.hit?.affinity : (this.mutual ? this.hit?.counterAffinity : null);
            if (short && (affV === 'adv' || affV === 'dis')) cx = chip(cx, cy, affV === 'adv' ? '유리 ▲' : '불리 ▼', affV === 'adv' ? '#FFC27A' : '#C9D4E6', affV === 'adv' ? 0x5a2a08 : 0x1d2a40, dir);
        });
        // 중앙 VS(마법이면 '마법', 후면이면 '배후!')
        this.vsText = sc.add.text(W / 2, vsY, 'VS', bold(vsSize, '#f0d58c', { fontStyle: 'italic bold', stroke: '#2a1a05', strokeThickness: Math.max(4, vsSize / 9) })).setOrigin(0.5);
        panel.add(this.vsText);
        // 중앙 능력치 게이지(2026-11-04 사용자 요청): 숫자 표 대신 좌우 대칭 막대. 공격측 = 가운데에서 왼쪽으로, 방어측 = 오른쪽으로 뻗는다.
        //  막대 상한 = 영웅 상세 카드와 같은 STAT_CAP(공 92·수 54, 2026-11-14 재산정) -> 양측·전투 간 비교 일관. 기본 = 금색, 가산 보정 = 녹색 연장, 감산 = 붉은 빈칸 + 숫자 기호(+/−)
        //  보너스 줄(데스크톱·세로 폰): 상성(금/적 + ▲▼)·지형(녹/적 + 부호)·오라(청)·스킬(보라) 칩을 가운데에서 바깥으로. 가로 폰(short)은 미니 게이지 2줄만(칩 생략, 상성은 2줄 칩에 있음)
        const [a, d] = this.sides;
        const CAP = { AT: STAT_CAP.at, DF: STAT_CAP.df };
        const stat = (sd, k) => { const st = sd.stats; if (!st) return null; const b = k === 'AT' ? st.atBase : st.dfBase; const x = k === 'AT' ? st.atBonus : st.dfBonus; return b == null ? null : { b: Number(b) || 0, x: Number(x) || 0 }; };
        const gRows = ['AT', 'DF'];
        const gy0 = short ? PH - 30 : compact ? Math.max(98, Math.round(vsY + vsSize * 0.6)) : Math.round(vsY + vsSize * 0.6) + 4;
        const gH = short ? 5 : compact ? 8 : 10;
        const rowG = short ? 14 : compact ? 18 : 22;
        const lab = short ? 13 : compact ? 15 : 20; // 가운데 라벨 반폭
        const numW = short ? 30 : compact ? 40 : 50; // 바깥 끝 숫자 자리
        const gw = Math.max(36, Math.min(short ? Math.round(W * 0.13) : 220, Math.floor(W / 2 - m - lab - numW - 6)));
        const g2 = sc.add.graphics();
        panel.add(g2);
        gRows.forEach((k, ri) => {
            const y = gy0 + ri * rowG;
            panel.add(sc.add.text(W / 2, y, k, bold(short ? 10 : compact ? 12 : 14, '#f0d58c')).setOrigin(0.5));
            [a, d].forEach((sd, si) => {
                const dir = si === 0 ? -1 : 1;
                const x0 = W / 2 + dir * lab;
                const bx = dir < 0 ? x0 - gw : x0;
                g2.fillStyle(0x05070d, 1).fillRect(bx, y - gH / 2, gw, gH);
                g2.lineStyle(1, COLOR.accentLight, 0.45).strokeRect(bx, y - gH / 2, gw, gH);
                const v = stat(sd, k);
                const fs = short ? 10 : compact ? 11 : 13;
                if (!v) { panel.add(sc.add.text(x0 + dir * (gw + 4), y, '-', bold(fs, CSS.muted)).setOrigin(dir < 0 ? 1 : 0, 0.5)); return; }
                const cap = CAP[k]; const tot = Math.max(0, v.b + v.x);
                const wBase = gw * clamp01(v.b / cap); const wTot = gw * clamp01(tot / cap);
                const seg = (from, len, col) => { if (len <= 0.5) return; g2.fillStyle(col, 1).fillRect(dir < 0 ? x0 - from - len : x0 + from, y - gH / 2 + 1, len, Math.max(1, gH - 2)); };
                seg(0, Math.min(wBase, wTot), 0xd8b25a); // 기본(감산이면 줄어든 만큼만)
                if (v.x > 0) seg(wBase, wTot - wBase, 0x6fcf97); // 가산 보정
                if (v.x < 0) seg(wTot, wBase - wTot, 0x7a2a24); // 감산된 몫(어두운 적색)
                const txt = v.x ? `${v.b}${v.x > 0 ? '+' : '−'}${Math.abs(v.x)}` : `${v.b}`;
                panel.add(sc.add.text(x0 + dir * (gw + 4), y, txt, bold(fs, v.x > 0 ? '#b8f0c8' : v.x < 0 ? '#ffb3ab' : '#ffffff')).setOrigin(dir < 0 ? 1 : 0, 0.5));
            });
        });
        if (!short) {
            const by = gy0 + (gRows.length - 1) * rowG + gH / 2 + (compact ? 10 : 14); // 마지막 게이지 아래
            const PAL = { adv: ['#FFD27A', 0x4a3208], dis: ['#FFB3AB', 0x4a1612], aura: ['#9FD8FF', 0x10304a], tp: ['#B8F0C8', 0x123a22], tn: ['#FFB3AB', 0x4a1612], skill: ['#D9C2FF', 0x2e1a4a] };
            const cfs = compact ? 10 : 12;
            [a, d].forEach((sd, si) => {
                const st = sd.stats; const items = [];
                const affV = si === 0 ? this.hit?.affinity : (this.mutual ? this.hit?.counterAffinity : null);
                if (affV === 'adv') items.push(['상성 유리 ▲', 'adv']);
                else if (affV === 'dis') items.push(['상성 불리 ▼', 'dis']);
                if (st?.terrainPct) items.push([`지형${st.terrain ? ` ${st.terrain}` : ''} ${st.terrainPct > 0 ? '+' : '−'}${Math.abs(st.terrainPct)}%`, st.terrainPct > 0 ? 'tp' : 'tn']);
                if (st?.auraAtk || st?.auraDef) items.push([`오라 공+${st.auraAtk ?? 0}% 수+${st.auraDef ?? 0}%`, 'aura']);
                if (si === 0 && this.skill?.name) items.push([`스킬 ${this.skill.name}${this.skill.powerPct ? ` ${this.skill.powerPct}%` : ''}`, 'skill']);
                const dir = si === 0 ? -1 : 1;
                let x = W / 2 + dir * 6; const lim = si === 0 ? m : W - m;
                items.forEach(([t, kind]) => {
                    const [fg, bg] = PAL[kind];
                    const tx = sc.add.text(0, 0, t, bold(cfs, fg)).setOrigin(0.5);
                    const cw = Math.round(tx.width + 10); const ch = Math.round(tx.height + 2);
                    if (dir < 0 ? x - cw < lim : x + cw > lim) { tx.destroy(); return; } // 자리가 없으면 생략(겹침 금지)
                    if (by + ch / 2 > PH - 3) { tx.destroy(); return; }
                    const r = sc.add.rectangle(x, by, cw, ch, bg, 1).setOrigin(dir < 0 ? 1 : 0, 0.5).setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(fg).color, 0.7);
                    tx.setPosition(dir < 0 ? x - cw / 2 : x + cw / 2, by);
                    panel.add([r, tx]);
                    x += dir * (cw + 4);
                });
            });
        }
        this.panel = panel;
    }

    // ===== 참고 이미지 구성(사용자 2026-11-04 '이런 느낌 그대로'): 큰 반신 컷인 + 붓 스트로크·속도선 + 상단 상성 리본 + 얇은 하단 한 줄 패널 =====
    // 컷인 초상 후보(고유 초상만): 영웅·지휘관 유닛의 portrait.<code>(병사·기본 부장 초상 제외). 없으면 null = 컷인 생략(병사 군집만)
    //  부대(troop)는 소속 지휘관(spec.leader, 수레·배 non_hero 제외)의 고유 초상으로 컷인(2026-11-04 '컷신에서 초상이 안 나오는 경우' — 교전 대부분이 부대라 컷인이 거의 안 나왔다). 지휘관도 고유 초상이 없으면 생략
    cutKeysOf(spec) {
        if (!spec?.unit) return [];
        const u = spec.unit;
        const uniq = (unit, stub) => [unitPortraitLogical(unit, stub, { thumb: false }), unitPortraitLogical(unit, stub, { thumb: true })]
            .filter((k) => typeof k === 'string' && manifestHas(k) && /^portrait\./.test(k) && !/^portrait\.(troop|captain)\./.test(k));
        const ph = spec.portraitHero ?? u.hero;
        const leaderStub = spec.leader ?? (ph ? { hero: ph } : null);
        let lgs = [];
        if (u.kind !== 'troop') lgs = uniq(u, leaderStub);
        // 부대(troop)는 소속 지휘관 고유 초상을 쓰지 않는다(2026-11-14 사용자 지시: 일반 병종은 병종 초상). 아래 폴백의 병종 초상(portrait.troop.<문화권>.<병종>)으로
        if (lgs.length) return lgs;
        // 폴백(사용자 2026-11-04 '양쪽 초상은 항상'): NPC·기본 부장 초상(unitPortraitLogical 의 일반 경로) -> 문화권·병종 병사 초상
        const genStub = u.kind === 'troop' ? null : leaderStub; // 부대: leader 폴백(소속 영웅 초상) 차단
        const gen = [unitPortraitLogical(u, genStub, { thumb: false }), unitPortraitLogical(u, genStub, { thumb: true }),
            troopPortraitLogical(u.troop_type ?? u.type, u.culture ?? spec.leader?.culture ?? null, { thumb: false }), troopPortraitLogical(u.troop_type ?? u.type, u.culture ?? spec.leader?.culture ?? null, { thumb: true })]
            .filter((k) => typeof k === 'string' && manifestHas(k));
        return [...new Set(gen)]; // 비면 buildCutIn 이 실루엣
    }

    // 컷인 레이어(무대 위·패널 아래): 양 끝 속도선 + 초상 있는 쪽 붓 스트로크 + 반신 초상(좌 = 원본, 우 = 좌우 반전, 화면 가장자리로 잘림, 아래는 패널 뒤)
    //  세로 폰: 무대가 길어 초상을 위쪽 모서리에(병사 군집·데미지 숫자 아래로 내려오지 않게, 바닥 = 무대 58%)
    buildCutIn() {
        const sc = this.scene; const { W, H, SH } = this; const PH = H - SH;
        const compact = W < 760 && !L.short;
        const layer = sc.add.container(0, 0); // 초상 레이어: 무대 안, 속도선 위·병사 군집 아래(초상이 커져도 병사·데미지 숫자를 가리지 않게, 2026-11-04 1.5배 확대)
        this.cutLayer = layer;
        const both = !!(this.cut[0] && this.cut[1]);
        // 속도선·붓 스트로크는 무대 안 배경 바로 위(병사 군집 뒤)에 넣는다 — 병사·배를 가리지 않게. 초상은 레이어(무대 위)
        //  안아트 에셋(fx.cut_speedlines / fx.cut_brush_ally·enemy, 기준 = 왼쪽 진영, 오른쪽은 setFlipX)이 있으면 이미지로, 로드 전·없으면 코드 그림(폴백)
        const g = sc.add.graphics();
        const idx = this.sides.flatMap((sd) => sd.members.map((mm) => this.stage.getIndex(mm.o))).filter((v) => v >= 0);
        this.stage.addAt(g, idx.length ? Math.min(...idx) : this.stage.list.length);
        this.stage.addAt(layer, this.stage.getIndex(g) + 1);
        const under = (o, ref) => { if (this.destroyed || !ref.scene) { o.destroy(); return; } this.stage.addAt(o, this.stage.getIndex(ref)); }; // ref 바로 아래(병사 뒤)
        const rnd = (a, b) => a + Math.random() * (b - a);
        this.cutFx('fx.cut_speedlines', (key) => {
            if (this.destroyed || !g.scene) return;
            g.clear();
            [0, 1].forEach((i) => under(sc.add.image(i ? W : 0, SH * 0.46, key).setOrigin(i ? 1 : 0, 0.5).setFlipX(!!i).setDisplaySize(W * (compact ? 0.55 : 0.42), SH * 0.92).setAlpha(0.9), g));
        });
        // 속도선: 양 끝에서 안쪽으로 뻗는 흰 쐐기(가늘고 긴 삼각형)
        [0, 1].forEach((i) => {
            const ex = i === 0 ? 0 : W; const d = i === 0 ? 1 : -1;
            const n = compact ? 9 : 14;
            for (let j = 0; j < n; j += 1) {
                const y = SH * rnd(0.04, compact ? 0.9 : 0.86); const len = W * (compact ? rnd(0.12, 0.34) : rnd(0.07, 0.24)); const t = rnd(2, compact ? 5 : 7);
                g.fillStyle(0xffffff, rnd(0.35, 0.8)).fillTriangle(ex, y - t / 2, ex, y + t / 2, ex + d * len, y + rnd(-6, 6));
            }
        });
        this.cutImgs = []; this.cutRank = [];
        [0, 1].forEach((i) => {
            const keys = this.cut[i] ?? [];
            const isLeft = i === 0; const d = isLeft ? 1 : -1;
            // 크기: 직전의 1.5배(사용자 2026-11-04 '50% 늘려봐'). 데스크톱·가로 폰 = 화면 높이 54%(무대 81% 상한), 세로 폰 = 화면 폭 37.5% 기준(무대 37.5% 상한)
            const ph = Math.round(compact ? Math.min(SH * 0.375, (W * 0.375) / 0.75) : Math.min(H * 0.54, SH * 0.81));
            const pw = Math.round(ph * 0.75);
            // 세로 폰(사용자 2026-11-04 '하단 중앙에 몰려 어색'): 이전 = 중심 x 폭 0.55 지점(390: 80/310)·바닥 무대 66% -> 두 초상이 화면 가운데 띠에 나란히 떠 보였다.
            //  지금 = 좌우 가장자리로 더 붙이고(중심 = 폭 0.32, 바깥 약 18% 는 화면 밖) 바닥을 무대 55%(병사 머리 위)로 -> 양 끝에서 안쪽을 보는 배치, 병사 군집과 세로로 분리
            const by = compact ? Math.round(SH * 0.55) : SH + Math.round(PH * 0.35); // 바닥 일부는 패널 뒤(세로 폰은 아래 페이드)
            const cx = Math.round(isLeft ? pw * 0.3 : W - pw * 0.3); // 초상 폭의 20% 가 화면 밖(사용자 2026-11-04 '초상화가 바깥으로 좀 잘려도'): 이전 데스크톱 0.55(잘림 0)·세로 폰 0.32(18%)
            // 초상 뒤 배경(붓 스트로크·카드) 없음 — 누끼 초상만(사용자 2026-11-04)
            const rankOf = (k) => { const j = keys.map(texKey).indexOf(k); return j < 0 ? 99 : j; }; // 0 = 원본(가장 좋음)
            const put = (key0) => {
                if (!key0 || this.destroyed || !layer.scene || !sc.textures.exists(key0)) return;
                const r = rankOf(key0); if (this.cutRank[i] != null && this.cutRank[i] <= r) return; // 이미 더 좋은(또는 같은) 초상이 있으면 무시(늦은 썸네일이 원본을 덮지 않게)
                const swap = !!this.cutImgs[i]?.scene && this.cutRank[i] != null; this.cutRank[i] = r;
                if (this.cutImgs[i]?.scene) this.cutImgs[i].destroy(); // 실루엣·썸네일 -> 실제/원본 초상으로 교체
                const key = compact ? fadeBottom(sc, key0, 0.3) : key0; // 세로 폰은 패널 뒤로 숨지 않으므로 아래 30% 페이드
                const img = sc.add.image(cx, by, key).setOrigin(0.5, 1).setFlipX(!isLeft);
                img.setScale(Math.min(pw / Math.max(1, img.frame.realWidth), ph / Math.max(1, img.frame.realHeight)));
                layer.add(img); this.cutImgs[i] = img;
                if (!isInstant() && !swap) { img.setAlpha(0).setX(cx - d * 30); tween(sc, { targets: img, to: { alpha: 1, x: cx }, duration: 220, ease: 'Quad.easeOut' }); }
            };
            const sil = () => { // 초상 키가 하나도 없을 때(또는 로드 전): 단색 실루엣(머리 + 어깨)
                const g2 = sc.add.graphics();
                const hr = pw * 0.2; const hy = by - ph * 0.72;
                g2.fillStyle(0x0d1322, 0.92).fillCircle(cx, hy, hr).fillPoints([{ x: cx - pw * 0.42, y: by }, { x: cx - pw * 0.3, y: hy + hr * 1.3 }, { x: cx + pw * 0.3, y: hy + hr * 1.3 }, { x: cx + pw * 0.42, y: by }], true);
                g2.lineStyle(2, 0x4a5d82, 0.8).strokeCircle(cx, hy, hr);
                layer.add(g2); this.cutImgs[i] = g2;
            };
            const pk = keys.map(texKey).find((k) => sc.textures.exists(k));
            if (pk) put(pk);
            else { sil(); if (keys.length) ensurePortraitTex(sc, keys[keys.length - 1], (key) => put(key)); }
            // 원본이 아직 없으면(썸네일·실루엣으로 시작) 원본도 요청해 도착하면 교체
            if (keys[0] && !sc.textures.exists(texKey(keys[0]))) ensurePortraitTex(sc, keys[0], (key) => put(key));
        });
    }

    // 컷신 연출 이미지 지연 로드: manifest 에 있으면 cb(텍스처 키)(이미 있으면 즉시, 아니면 도착 시). 없거나 실패면 호출 안 함(코드 그림 유지)
    cutFx(lg, cb) {
        const sc = this.scene;
        if (!manifestHas(lg)) return false;
        const key = texKey(lg);
        if (sc.textures.exists(key)) { cb(key); return true; }
        sc.load.once(`filecomplete-image-${key}`, () => { if (!this.destroyed) cb(key); });
        if (!CUT_FX_REQ.has(key)) { CUT_FX_REQ.add(key); sc.load.image(key, withVer(`/${String(loaded.manifest[lg].path).replace(/^\//, '')}`)); }
        if (!sc.load.isLoading()) sc.load.start();
        return true;
    }

    // 상단 상성 리본(검은 붓터치 띠 + 붉은 결): '상성 불리 ▼ · 반격 상성 유리 ▲'(불리 = 청, 유리 = 적). 상성 값이 없으면 생략. 스킬 배너(무대 13%)가 있으면 그 아래
    affinityRibbon() {
        const h = this.hit; if (!h || this.destroyed) return;
        const sc = this.scene; const { W, SH } = this;
        const compact = W < 760;
        const seg = (v, pre = '') => (v === 'adv' ? [`${pre}상성 유리 ▲`, '#FF5A4A'] : v === 'dis' ? [`${pre}상성 불리 ▼`, '#A9C8FF'] : null);
        const parts = [seg(h.affinity), this.mutual ? seg(h.counterAffinity, '반격 ') : null].filter(Boolean);
        if (!parts.length) return;
        const fs = compact ? 15 : L.short ? 16 : 24;
        const c = sc.add.container(W / 2, this.skill ? SH * 0.25 : Math.max(22, SH * 0.075));
        const ts = []; let x = 0;
        parts.forEach(([t, col], i) => {
            if (i) { const dot = sc.add.text(x, 0, '  ·  ', bold(fs, '#E8E0C8')).setOrigin(0, 0.5); ts.push(dot); x += dot.width; }
            const tx = sc.add.text(x, 0, t, bold(fs, col, { stroke: '#0A0D18' })).setOrigin(0, 0.5); ts.push(tx); x += tx.width;
        });
        const tw = x; ts.forEach((t) => { t.x -= tw / 2; });
        const rw = Math.min(W - 16, tw + fs * 4); const rh = Math.round(fs * 1.75);
        const g = sc.add.graphics();
        const band = (w, hh, col, a, dy = 0) => { const L0 = -w / 2; const R0 = w / 2; g.fillStyle(col, a).fillPoints([{ x: L0, y: -hh / 2 + dy + 3 }, { x: L0 + hh * 0.9, y: -hh / 2 + dy }, { x: R0 - hh * 0.5, y: -hh / 2 + dy + 2 }, { x: R0, y: dy - 3 }, { x: R0 - hh * 0.8, y: hh / 2 + dy }, { x: L0 + hh * 0.4, y: hh / 2 + dy - 2 }, { x: L0 + hh * 0.15, y: dy + 2 }], true); };
        band(rw + 18, rh + 6, 0x7a1020, 0.55, 3); // 붉은 결(뒤)
        band(rw, rh, 0x0c1122, 0.92);
        g.fillStyle(0xffffff, 0.08).fillRect(-rw / 2 + rh, -rh / 2 + 3, rw - rh * 2, 2); // 붓결 하이라이트
        c.add([g, ...ts]);
        // 안아트 리본(ui.cut_ribbon 1024x247, 가운데 70% 폭 일정 -> 가로 늘림): 있으면 코드 띠 대신
        this.cutFx('ui.cut_ribbon', (key) => { if (this.destroyed || !c.scene) return; g.clear(); c.addAt(sc.add.image(0, 2, key).setDisplaySize(rw + fs * 2.4, rh * 1.9), 0); });
        const base = Math.min(1, (W - 16) / Math.max(1, rw + 18));
        this.root.add(c);
        if (isInstant()) c.setScale(base); else { c.setScale(base * 1.25).setAlpha(0); tween(sc, { targets: c, to: { scale: base, alpha: 1 }, duration: 200, ease: 'Back.easeOut' }); }
    }

    // 하단 얇은 한 줄 패널(데스크톱·가로 폰) / 2단(세로 폰): Lv 마름모(병종 배지) + 행동 리본(공격/반격) / 이름·병종 / 큰 병력 숫자(진영 색) /
    //  위쪽 가는 HP 바 / 가운데 쪽 능력치 게이지 2줄(공·수, 상한 STAT_CAP) / 중앙 VS 엠블럼(ui.vs_emblem_text > ui.vs_emblem + 글자 > 글자). 지형·오라 칩은 패널 바로 위
    //  run()이 쓰는 필드 계약 유지: s.countText / s.fill·fillHi·ghost·hpText / s.fillW·fillX / this.vsText(setText·setColor) / this.counterMarks / this.panel
    // 패널 없는 폰 화면: run()·stepBar 가 쓰는 필드만 보이지 않는 객체로 채운다(병력 숫자·바는 화면에 없음, 데미지 숫자·병사 연출은 그대로)
    buildNoPanel() {
        const sc = this.scene;
        const panel = sc.add.container(0, this.SH).setVisible(false); this.root.add(panel);
        this.sides.forEach((s) => {
            s.fillW = 0; s.fillX = 0;
            s.fill = sc.add.rectangle(0, 0, 1, 1, s.color).setVisible(false);
            s.fillHi = sc.add.rectangle(0, 0, 1, 1, 0xffffff).setVisible(false);
            s.ghost = sc.add.rectangle(0, 0, 1, 1, 0xffd08a).setVisible(false);
            s.hpText = sc.add.text(0, 0, '').setVisible(false);
            s.countText = sc.add.text(0, 0, String(s.before)).setVisible(false);
            panel.add([s.fill, s.fillHi, s.ghost, s.hpText, s.countText]);
        });
        this.vsText = { setText: () => this.vsText, setColor: () => this.vsText };
        this.panel = panel;
    }

    buildPanelRef() {
        if (this.noPanel) { this.buildNoPanel(); return; }
        const sc = this.scene; const { W, H, SH } = this; const PH = H - SH;
        const compact = W < 760 && !L.short; const short = L.short;
        const panel = sc.add.container(0, SH); this.root.add(panel);
        const g = sc.add.graphics(); panel.add(g);
        const GOLD = COLOR.accent; const GOLD_L = COLOR.accentLight;
        g.fillStyle(0x0a0f1e, 0.95).fillRect(0, 0, W, PH);
        g.fillStyle(0x141c34, 0.9).fillRect(0, 6, W, PH - 10);
        g.lineStyle(2, GOLD, 0.95).lineBetween(0, 1, W, 1);
        g.lineStyle(1, GOLD_L, 0.45).lineBetween(0, 5, W, 5);
        g.lineStyle(1, GOLD, 0.6).lineBetween(0, PH - 2, W, PH - 2);
        const m = compact || short ? 8 : 14;
        const vsD = Math.round(short ? 70 : compact ? 64 : Math.min(128, PH * 1.05)); const vsR = vsD / 2;
        const rowA = compact ? 66 : PH; // 세로 폰 1단(이름 줄) 높이
        const hbY = compact || short ? 9 : 11; const hbH = compact || short ? 6 : 8;
        const dia = compact || short ? 40 : Math.round(Math.min(58, PH * 0.52));
        const rh = compact ? 14 : short ? 16 : 20;
        const nameSize = compact || short ? 13 : 20; const clsSize = compact || short ? 10 : 12;
        const countSize = short ? 28 : compact ? 26 : Math.round(Math.min(52, PH * 0.44));
        const numW = short ? 34 + 16 : compact ? 40 : 52 + 18; // 데스크톱·가로 폰: 숫자 앞 작은 AT/DF 라벨 자리(+16/+18, 하플레이 2026-11-04)
        const gw = compact ? Math.max(60, Math.floor(W / 2 - 22 - numW - m)) : Math.round(Math.max(56, Math.min(170, W * (short ? 0.1 : 0.11))));
        const gH = short ? 6 : compact ? 7 : 9;
        const gRows = compact ? [rowA + 18, rowA + 42] : [Math.round(PH * 0.44), Math.round(PH * 0.7)];
        const gInner = compact ? 20 : vsR + 8;
        const dcy = compact ? 8 + dia / 2 : Math.round((PH - rh) / 2) + 2;
        this.sides.forEach((s) => {
            const isLeft = s.dir === 1; const dir = isLeft ? 1 : -1; const ox = isLeft ? 0 : 1;
            const edge = isLeft ? m : W - m;
            // Lv 마름모 + 병종 배지
            const dcx = edge + (dir * dia) / 2;
            const pts = [{ x: dcx, y: dcy - dia / 2 }, { x: dcx + dia / 2, y: dcy }, { x: dcx, y: dcy + dia / 2 }, { x: dcx - dia / 2, y: dcy }];
            g.fillStyle(0x0c1428, 1).fillPoints(pts, true);
            g.lineStyle(2, GOLD, 1).strokePoints(pts, true, true);
            g.lineStyle(1, GOLD_L, 0.45).strokePoints(pts.map((p) => ({ x: dcx + (p.x - dcx) * 0.8, y: dcy + (p.y - dcy) * 0.8 })), true, true);
            const lvN = Number(s.unit.level);
            // 병종 아이콘 = 마름모 가운데, Lv = 위 꼭짓점의 작은 알약(겹침 분리, 강화면 gacha64)
            const isz = Math.round(dia * 0.46);
            const ticon = troopIcon(sc, s.unit.type, dcx, dcy + 1, isz, { glyph: false }); // 병종 아이콘 단일 소스
            panel.add(ticon ?? sc.add.text(dcx, dcy + 1, unitClassGlyph(s.unit.type), bold(Math.round(isz * 0.8), '#f0d58c')).setOrigin(0.5));
            if (Number.isFinite(lvN) && lvN > 0) {
                const lt = sc.add.text(dcx, 0, `Lv${lvN}`, bold(compact || short ? 10 : 12, '#ffffff')).setOrigin(0.5);
                const ly = Math.max(lt.height / 2 + 3, dcy - dia / 2 + 1);
                lt.setY(ly);
                panel.add([sc.add.rectangle(dcx, ly, lt.width + 8, lt.height, 0x0c1428, 1).setStrokeStyle(1, GOLD, 0.9), lt]);
            }
            // 행동 리본(금테): 공격 / 반격(오른쪽은 반격 발동 순간에 켬)
            const role = isLeft ? (this.counterCut ? '반격' : '공격') : (this.mutual ? '반격' : null);
            if (role) {
                const ry = dcy + dia / 2 - 2; const rw = dia + 16;
                const rb = sc.add.rectangle(dcx, ry, rw, rh, role === '반격' ? 0x8a3a0c : 0x5a4310, 1).setStrokeStyle(1.5, GOLD, 1);
                const rt = sc.add.text(dcx, ry, role, bold(compact ? 10 : short ? 11 : 14, role === '반격' ? '#FFD2A8' : '#FFE08A')).setOrigin(0.5);
                panel.add([rb, rt]);
                if (!isLeft) { [rb, rt].forEach((o) => o.setAlpha(0)); this.counterMarks = [rb, rt]; }
            }
            // 가는 HP 바(위쪽): 마름모 옆 -> VS 옆. 바깥 끝 기준으로 채움
            const bOut = edge + dir * (dia + 10); const bIn = W / 2 - dir * (vsR + 4);
            const bx = Math.min(bOut, bIn); const bw = Math.max(40, Math.abs(bIn - bOut));
            g.fillStyle(0x05070d, 1).fillRect(bx, hbY, bw, hbH);
            g.lineStyle(1, GOLD, 0.7).strokeRect(bx, hbY, bw, hbH);
            s.fillW = bw - 2; s.fillX = isLeft ? bx + 1 : bx + bw - 1;
            const w0 = s.fillW * clamp01(s.before / MAX_SOLDIERS); const ih = Math.max(2, hbH - 2);
            s.ghost = sc.add.rectangle(s.fillX, hbY + hbH / 2, w0, ih, 0xffd08a, 0.85).setOrigin(ox, 0.5);
            s.fill = sc.add.rectangle(s.fillX, hbY + hbH / 2, w0, ih, s.color).setOrigin(ox, 0.5);
            s.fillHi = sc.add.rectangle(s.fillX, hbY + 1, w0, 1, 0xffffff, 0.4).setOrigin(ox, 0);
            s.hpText = sc.add.text(s.fillX, hbY + hbH + 2, `${s.before}/${MAX_SOLDIERS}`, bold(10)).setOrigin(ox, 0).setVisible(false);
            panel.add([s.ghost, s.fill, s.fillHi, s.hpText]);
            // 이름·병종 + 큰 병력 숫자(진영 색). 안쪽 한계 = 세로 폰은 VS 옆, 그 외는 능력치 게이지 숫자 바깥
            const inner = compact ? W / 2 - dir * (vsR + 2) : W / 2 - dir * (gInner + gw + numW + 8);
            const nx = edge + dir * (dia + 12); const ny = hbY + hbH + (compact || short ? 5 : 8);
            const cw = countSize * 1.25;
            const name = fitName(sc.add.text(nx, ny, s.displayName ?? s.unit.name ?? '', bold(nameSize)).setOrigin(ox, 0).setAlign(isLeft ? 'left' : 'right'), Math.max(40, Math.abs(inner - nx) - cw - 10), compact || short ? 10 : 13);
            const cls = sc.add.text(nx, name.y + name.height, unitClassName(s.unit.type), bold(clsSize, CSS.muted)).setOrigin(ox, 0);
            const cAfter = nx + dir * (Math.max(name.width, cls.width) + 12);
            const cx = isLeft ? Math.min(cAfter, inner - cw) : Math.max(cAfter, inner + cw);
            const cy = compact ? ny - 4 : Math.round((PH - countSize * 1.2) / 2) + 4;
            s.countText = sc.add.text(cx, cy, String(s.before), bold(countSize, s.unit.team === 'ally' ? '#8FD0FF' : '#FF6B5A', { fontStyle: 'italic bold', stroke: '#05070d', strokeThickness: Math.max(4, countSize / 9) })).setOrigin(ox, 0);
            panel.add([name, cls, s.countText]);
            // 지형·오라 칩: 패널 바로 위(무대 하단), 안쪽(VS 옆)에서 바깥으로
            const st = s.stats; const items = [];
            if (st?.terrainPct) items.push([`${st.terrain ?? '지형'} ${st.terrainPct > 0 ? '+' : '−'}${Math.abs(st.terrainPct)}%`, st.terrainPct > 0 ? ['#B8F0C8', 0x123a22] : ['#FFB3AB', 0x4a1612]]);
            if (st?.auraAtk || st?.auraDef) items.push([`오라 공+${st.auraAtk ?? 0}% 수+${st.auraDef ?? 0}%`, ['#9FD8FF', 0x10304a]]);
            let qx = W / 2 - dir * (vsR + 6); const lim = isLeft ? m : W - m;
            items.forEach(([t, [fg, bgc]]) => {
                const tx = sc.add.text(0, -12, t, bold(compact || short ? 10 : 12, fg)).setOrigin(0.5);
                const w = Math.round(tx.width + 10);
                if (isLeft ? qx - w < lim : qx + w > lim) { tx.destroy(); return; }
                const r = sc.add.rectangle(qx, -12, w, Math.round(tx.height + 2), bgc, 0.95).setOrigin(isLeft ? 1 : 0, 0.5).setStrokeStyle(1, Phaser.Display.Color.HexStringToColor(fg).color, 0.7);
                tx.setX(isLeft ? qx - w / 2 : qx + w / 2);
                panel.add([r, tx]);
                qx -= dir * (w + 4);
            });
        });
        // 능력치 게이지 2줄(공·수): 중앙(VS 옆)에서 바깥으로, 바깥 끝 숫자(보정 부호·색). 세로 폰은 2단 + 가운데 라벨
        const stat = (sd, k) => { const st = sd.stats; if (!st) return null; const b = k === 'AT' ? st.atBase : st.dfBase; const x = k === 'AT' ? st.atBonus : st.dfBonus; return b == null ? null : { b: Number(b) || 0, x: Number(x) || 0 }; };
        const g2 = sc.add.graphics(); panel.add(g2);
        ['AT', 'DF'].forEach((k, ri) => {
            const y = gRows[ri];
            if (compact) panel.add(sc.add.text(W / 2, y, k, bold(11, '#f0d58c')).setOrigin(0.5));
            this.sides.forEach((sd, si) => {
                const d = si === 0 ? -1 : 1; const x0 = W / 2 + d * gInner; const bx = d < 0 ? x0 - gw : x0;
                g2.fillStyle(0x05070d, 1).fillRect(bx, y - gH / 2, gw, gH);
                g2.lineStyle(1, GOLD, 0.7).strokeRect(bx, y - gH / 2, gw, gH);
                const v = stat(sd, k); const fs = short ? 10 : compact ? 11 : 14;
                let nx = x0 + d * (gw + 5);
                if (!compact) { const lt = sc.add.text(nx, y, k, bold(short ? 8 : 10, '#f0d58c')).setOrigin(d < 0 ? 1 : 0, 0.5); panel.add(lt); nx += d * (lt.width + 3); } // 공(AT)/수(DF) 라벨(세로 폰은 가운데 라벨)
                if (!v) { panel.add(sc.add.text(nx, y, '-', bold(fs, CSS.muted)).setOrigin(d < 0 ? 1 : 0, 0.5)); return; }
                const cap = k === 'AT' ? STAT_CAP.at : STAT_CAP.df; const tot = Math.max(0, v.b + v.x);
                const wB = gw * clamp01(v.b / cap); const wT = gw * clamp01(tot / cap);
                const seg = (from, len, col) => { if (len <= 0.5) return; g2.fillStyle(col, 1).fillRect(d < 0 ? x0 - from - len : x0 + from, y - gH / 2 + 1, len, Math.max(1, gH - 2)); };
                seg(0, Math.min(wB, wT), sd.unit.team === 'ally' ? 0x5fb4e8 : 0xd8b25a);
                if (v.x > 0) seg(wB, wT - wB, 0x6fcf97);
                if (v.x < 0) seg(wT, wB - wT, 0x7a2a24);
                panel.add(sc.add.text(nx, y, v.x ? `${v.b}${v.x > 0 ? '+' : '−'}${Math.abs(v.x)}` : `${v.b}`, bold(fs, v.x > 0 ? '#b8f0c8' : v.x < 0 ? '#ffb3ab' : '#ffffff')).setOrigin(d < 0 ? 1 : 0, 0.5));
            });
        });
        // 중앙 VS 엠블럼: 이미지가 있으면 이미지(글자 포함판 우선), 없으면 글자. vsText 는 '마법'·'배후!' 교체용 래퍼(바뀌면 이미지를 숨기고 글자)
        const vy = compact ? Math.round(rowA / 2) : Math.round(PH / 2) - (short ? 2 : 6);
        const vt = sc.add.text(W / 2, vy, 'VS', bold(Math.round(vsD * 0.4), '#f0d58c', { fontStyle: 'italic bold', stroke: '#2a1a05', strokeThickness: Math.max(4, vsD / 18) })).setOrigin(0.5);
        panel.add(vt);
        const lg = manifestHas('ui.vs_emblem_text') ? 'ui.vs_emblem_text' : manifestHas('ui.vs_emblem') ? 'ui.vs_emblem' : null;
        let em = null; let changed = false;
        const putEm = () => {
            if (this.destroyed || !panel.scene || !lg || !sc.textures.exists(texKey(lg))) return;
            em = sc.add.image(W / 2, vy, texKey(lg)); em.setScale(vsD / Math.max(em.width, em.height));
            panel.addAt(em, panel.getIndex(vt)); em.setVisible(!changed);
            vt.setVisible(changed || lg === 'ui.vs_emblem');
            if (!changed && lg === 'ui.vs_emblem') vt.setFontSize(Math.round(vsD * 0.3));
        };
        if (lg) { if (sc.textures.exists(texKey(lg))) putEm(); else { const key = texKey(lg); sc.load.once(`filecomplete-image-${key}`, putEm); sc.load.image(key, withVer(`/${String(loaded.manifest[lg].path).replace(/^\//, '')}`)); if (!sc.load.isLoading()) sc.load.start(); } }
        this.vsText = {
            setText: (t) => { changed = t !== 'VS'; vt.setText(t).setVisible(true).setFontSize(Math.round(vsD * (changed ? 0.32 : 0.4))); em?.setVisible(!changed); return this.vsText; },
            setColor: (c) => { vt.setColor(c); return this.vsText; },
        };
        this.panel = panel;
    }

    // 미시 교전 실시간 병력 표시(MicroCutscene 이 병사 쓰러짐·영웅 피격마다 호출): 숫자·바를 v(병력 단계, 0~10, 소수 가능)로 즉시 맞춘다.
    //  숫자는 올림(영웅 HP 가 조금 줄어도 단계가 바로 내려가지 않게), 숫자가 바뀌면 빨간색 + 펀치. 잔상 바는 끝(stepBar)에서 따라온다
    microHud(s, v) {
        if (this.destroyed) return;
        s.microV = v;
        const w = s.fillW * clamp01(v / MAX_SOLDIERS);
        setBarW(s.fill, w);
        setBarW(s.fillHi, w);
        const n = Math.max(0, Math.ceil(v - 1e-6));
        s.hpText?.setText?.(`${n}/${MAX_SOLDIERS}`);
        if (s.countText?.scene && s.countText.text !== String(n)) {
            s.countText.setText(String(n));
            if (n < s.before) s.countText.setColor('#FF6B5A');
            s.countText.setScale(1.3); tween(this.scene, { targets: s.countText, to: { scale: 1 }, duration: 100 });
        }
    }

    // 병력 바 계단식 감소(4단계, 단계마다 흰 깜빡임) + 잔상 바 + 수치 갱신. 병력 단계(before -> after) 기준(HP 비율 아님)
    //  from: 시작 단계(기본 before). 미시 교전 실시간 표시 뒤에는 그 값부터 남은 만큼만 내린다(이미 after 면 잔상 바만 따라 줄어듦)
    stepBar(s, k, from = s.before) {
        const sc = this.scene;
        const steps = 4;
        const live = from !== s.before;
        const to = s.after;
        const tick = (i) => {
            const v = from + ((to - from) * i) / steps;
            const w = s.fillW * clamp01(v / MAX_SOLDIERS);
            setBarW(s.fill, w);
            setBarW(s.fillHi, w);
            s.hpText.setText(`${Math.max(0, Math.round(v))}/${MAX_SOLDIERS}`);
            s.fill.setFillStyle(i < steps ? 0xffffff : s.color);
            wait(sc, 50 * k, () => s.fill.setFillStyle(s.color));
            if (i < steps) wait(sc, 140 * k, () => tick(i + 1));
            else if (s.ghost) wait(sc, 160 * k, () => { if (s.ghost.scene) { const p = { w: s.ghost.width }; tween(sc, { targets: p, to: { w }, duration: 380 * k, ease: 'Cubic.easeIn', onUpdate: () => setBarW(s.ghost, p.w), onComplete: () => setBarW(s.ghost, w) }); } }); // 잔상 바: 마지막 단계 뒤 따라 줄어듦(폭만, 원점 고정)
        };
        if (to === from) {
            if (live && s.ghost) tick(steps); // 실시간 표시로 이미 도달: 최종 폭 확정 + 잔상 바만 따라 줄어듦
            return;
        }
        wait(sc, 120 * k, () => tick(1));
    }

    run(finish) {
        if (this.micro) { runMicro(this, finish, { holdMs: CUT_STYLE === 'ref' ? T.refHoldEnd : T.hold, wipeIn: T.wipeIn, enterBlack: T.enterBlack, panelFade: T.panelFade, out: T.out }); return; }
        const sc = this.scene;
        const [a, d] = this.sides; // 공격측(항상 왼쪽) / 방어측(오른쪽)
        const k = this.k;
        const full = !this.short; // 히트스톱·쉐이크·플래시·줌·충격파는 '풀'에서만
        let ended = false;
        const end = () => { if (ended) return; ended = true; this.destroy(); finish(); };

        // 이동 목표(진영 전체를 평행 이동해 군집 형태 유지):
        //  - 양쪽 모두 돌격(mutual 근접): 중앙보다 약간 방어측 쪽에서 맞부딪힌다
        //  - 공격측만 돌격: 공격측 선두가 방어측 선두 바로 앞까지
        const isMover = (s) => s.mode === 'charge' || s.mode === 'cav' || s.mode === 'dive' || s.mode === 'march';
        const movers = this.sides.filter(isMover);
        const both = movers.length === 2;
        const meet = this.W / 2 + this.W * 0.03;
        const ms = (CUT_STYLE !== 'ref' && movers.some((s) => s.mode === 'cav') ? T.chargeCav : T.charge) * k; // 돌진(원거리는 발사) 구간. 참고 구성은 보병·기병 같은 길이
        this.sides.forEach((s) => {
            const other = s === a ? d : a;
            const lead = s.members[0];
            const target = both ? meet - s.dir * lead.o.displayWidth * 0.5 : other.members[0].x0 - s.dir * other.members[0].o.displayWidth * 0.8;
            const delta = isMover(s) ? target - lead.x0 : 0;
            // 파도 출발: 중앙에 가까운 순으로 4~5개 파도(선두 0초, 이후 T.waveGap 간격), 열이 어긋나게 약간 무작위
            const order = s.members.slice().sort((p, q) => (q.x0 - p.x0) * s.dir);
            const per = Math.max(1, Math.ceil(order.length / 5));
            order.forEach((m, rank) => {
                const wave = Math.floor(rank / per);
                m.dly = Math.min(T.waveCap, (wave * T.waveGap * (1 + Math.random() * 0.2) * k) / ms);
                m.rank = rank;
            });
            s.members.forEach((m) => {
                m.x1 = m.x0 + delta + (CUT_STYLE === 'ref' && delta ? (Math.random() - 0.5) * 20 : 0); // 참고 구성: 병사마다 충돌 지점 ±10px
                if (s.mode === 'dive') { m.yStart = m.y0 - this.SH * 0.9; m.o.y = m.yStart; }
            });
        });

        let leadHit = false;
        const setCharge = (t) => {
            movers.forEach((s) => s.members.forEach((m) => {
                const lt = clamp01((t - m.dly) / (1 - m.dly));
                const e = s.mode === 'march' ? 0.5 - 0.5 * Math.cos(Math.PI * lt) : CUT_STYLE === 'ref' ? Math.pow(lt, 1.15) : lt * lt; // march = 걸어서 접근(부드럽게 출발·정지), 돌진 = 거의 등속(영상), 이전 = 이징 인
                m.o.x = m.x0 + (m.x1 - m.x0) * e;
                m.o.y = s.mode === 'dive'
                    ? m.yStart + (m.y0 - m.yStart) * e
                    : m.y0 - (lt < 1 ? Math.abs(Math.sin(lt * Math.PI * 10)) * (s.ship ? 2 : 5) : 0); // 달리기 위아래 흔들림(배는 노 젓기처럼 약하게)
                if (m.rank === 0 && lt >= 1 && !leadHit && both) { leadHit = true; sparks(m.o.x + s.dir * m.o.displayWidth * 0.4, m.o.y - m.o.displayHeight * 0.5, 4); } // 선두끼리 먼저 접촉(연쇄 충돌의 시작)
            }));
        };

        const DUST = 0xcbbf9a;
        const FOAM = 0xe8f6ff; // 수상(배) 쪽 먼지 대신 물보라
        const dustOf = (s) => (s?.ship ? FOAM : DUST);
        const BLOOD = 0xc8503c;
        const rangeMul = Math.min(1.2, 0.6 + 0.2 * this.distance); // 화살 아치: 사거리(칸) 보정(2칸 = 1.0)
        const arrowScale = Math.max(1, Math.min(2, this.H / 500)); // 화살 크기: 병사 크기(화면 높이 비례)에 맞춤
        // 화살 아치 높이: 거리 비례(arcHeight) + 중앙 분할 띠를 '위로 넘어가게' 최소 높이 보장 + 무대 상단 밖으로 안 나가게 상한. mul = 낮은 사격 배율
        const lobH = (from, to, mul = 1) => {
            const hMin = (this.SH * ARROW.cutApexClear + Math.abs(to.y - from.y) / 2) * mul;
            const hTop = (from.y + to.y) / 2 - this.SH * ARROW.cutApexTop;
            return Math.max(ARROW.arcMinPx, Math.min(hTop, Math.max(hMin, arcHeight(to.x - from.x, rangeMul * mul))));
        };
        const puff = (x, y, n, color, spread = 70) => { // 먼지/붉은 파티클(축약이면 줄임)
            const cnt = this.short ? Math.ceil(n / 3) : n;
            for (let i = 0; i < cnt; i++) {
                const p = sc.add.circle(x, y, 2 + Math.random() * 3, color, 0.8);
                this.stage.add(p);
                tween(sc, { targets: p, to: { x: x + (Math.random() - 0.5) * spread, y: y - 10 - Math.random() * 30, alpha: 0, scale: 1.8 }, duration: 300 + Math.random() * 200, onComplete: () => p.destroy() });
            }
        };
        // 불꽃(도트 사각), 수명 0.3~0.5초
        function sparks(x, y, n) {
            for (let i = 0; i < n; i++) {
                const ang = Math.random() * Math.PI * 2;
                const r = 30 + Math.random() * 40;
                const p = sc.add.rectangle(x, y, 4, 4, i % 2 ? 0xffe9a8 : 0xffffff, 1);
                stageAdd(p);
                tween(sc, { targets: p, to: { x: x + Math.cos(ang) * r, y: y + Math.sin(ang) * r * 0.6, alpha: 0 }, duration: 300 + Math.random() * 200, ease: 'Quad.easeOut', onComplete: () => p.destroy() });
            }
        }
        const stageAdd = (o) => this.stage.add(o);
        // 총병: 직사 직선 탄(arc 0, 출발 -> 목표 선형 보간) + 총구 화염(fx.gun_muzzle 4프레임) + 화약 연기(fx.gun_smoke 6프레임). 시트가 없으면 코드 섬광·연기
        const sheetPlay = (key, x, y, frames, fps, flip, scale) => {
            if (!sc.textures.exists(key)) return false;
            const o = sc.add.image(x, y, key, 0).setOrigin(2 / 32, 0.5).setScale(scale).setFlipX(flip);
            stageAdd(o);
            for (let f = 1; f <= frames; f += 1) wait(sc, (f * 1000) / fps, () => { if (!o.scene) return; if (f >= frames) o.destroy(); else o.setFrame(f); });
            return true;
        };
        // 총병(조총·화승총 등 type gunner 전부, 사용자 2026-11-04 '궁병이랑 비슷, 직사로 빠르게'): 총구 섬광 + 연기 한 줄기 + 사수 2~3px 반동 + 가는 탄선·짧은 잔상(비행 40~80ms) + 명중 스파크
        const gunShot = (from, to, delay, dur, dirX, onLand, shooter = null) => wait(sc, delay, () => {
            if (this.destroyed) return;
            const flip = dirX < 0;
            if (shooter?.scene) { const sx = shooter.x; tween(sc, { targets: shooter, to: { x: sx - dirX * 3 }, final: { x: sx }, duration: 45, yoyo: true, ease: 'Quad.easeOut' }); } // 미세 반동
            const fs = Math.max(2, Math.round(arrowScale * 2));
            if (!sheetPlay(texKey('fx.gun_muzzle'), from.x, from.y, 4, 24, flip, fs)) { const fl = sc.add.circle(from.x, from.y, 6, 0xfff1a8, 1); stageAdd(fl); tween(sc, { targets: fl, to: { scale: 1.8, alpha: 0 }, duration: 110, onComplete: () => fl.destroy() }); }
            if (full && !sheetPlay(texKey('fx.gun_smoke'), from.x, from.y - 2, 6, 10, flip, fs)) { const sm = sc.add.circle(from.x, from.y - 2, 7, 0xb8b8b8, 0.5); stageAdd(sm); tween(sc, { targets: sm, to: { scale: 2.2, alpha: 0, y: from.y - 22 }, duration: 520, onComplete: () => sm.destroy() }); }
            const ang = Math.atan2(to.y - from.y, to.x - from.x);
            const b = sc.add.rectangle(from.x, from.y, 8, 2, 0xfff4c8, 1).setRotation(ang);
            const tr = sc.add.rectangle(from.x, from.y, 26, 1, 0xffe9a8, 0.55).setOrigin(1, 0.5).setRotation(ang); // 짧은 잔상(탄 뒤 꼬리)
            stageAdd(tr); stageAdd(b);
            tween(sc, { targets: [b, tr], to: { x: to.x, y: to.y }, duration: dur, ease: 'Linear', onComplete: () => { b.destroy(); tween(sc, { targets: tr, to: { alpha: 0 }, duration: 60, onComplete: () => tr.destroy() }); if (!this.destroyed) { sparks(to.x, to.y, 3); onLand?.(to); } } });
        });

        // [참고 구성] 마법 시전: 제자리. 지팡이 끝 연두 구체가 계속 빛나고, 노랑·흰 구슬 10여 개가 포물선으로 날아가 적 위치마다 주황 불덩이가 시간차로 터진다(마지막 폭발 = 충돌 시각 ms)
        const mageCast = (a, d) => {
            const h = a.members[0].o;
            const ox = h.x + a.dir * h.displayWidth * 0.42; const oy = h.y - h.displayHeight * 0.62;
            const orb = sc.add.circle(ox, oy, 7, 0xb8ff6a, 1); const halo = sc.add.circle(ox, oy, 14, 0xb8ff6a, 0.35);
            stageAdd(halo); stageAdd(orb);
            tween(sc, { targets: halo, to: { scale: 1.5, alpha: 0.15 }, duration: 420, yoyo: true, repeat: 3 });
            wait(sc, ms + T.refHold, () => { if (orb.scene) orb.destroy(); if (halo.scene) halo.destroy(); });
            if (a === this.sides[0]) this.vsText.setText('마법');
            const n = T.mageOrbs; const fly = T.mageOrbMs * k; const t0 = Math.max(0, ms - fly - (n - 1) * 35 - T.mageBoomGap * 3);
            const tg = d.members.length ? d.members : [{ o: { x: this.W / 2, y: this.groundY, displayHeight: 40, displayWidth: 30 }, x0: this.W / 2, y0: this.groundY }];
            for (let i = 0; i < n; i += 1) {
                const tm = tg[i % tg.length];
                const to = { x: tm.x0 + (Math.random() - 0.5) * 18, y: tm.y0 - (tm.o.displayHeight ?? 40) * (0.3 + Math.random() * 0.3) };
                wait(sc, t0 + i * 35, () => {
                    if (this.destroyed) return;
                    const b = sc.add.circle(ox, oy, 3 + Math.random() * 2.5, i % 2 ? 0xffffff : 0xfff07a, 1); stageAdd(b);
                    const arc = 50 + Math.random() * 40; const p = { t: 0 };
                    tween(sc, { targets: p, to: { t: 1 }, duration: fly, ease: 'Linear', onUpdate: () => { b.x = ox + (to.x - ox) * p.t; b.y = oy + (to.y - oy) * p.t - Math.sin(Math.PI * p.t) * arc; b.setScale(1 - p.t * 0.3); },
                        onComplete: () => { b.destroy(); } });
                });
            }
            // 적 위치마다 불덩이(30~45px, 약 130ms) 시간차. 마지막 폭발이 충돌(clash) 시각 무렵
            tg.slice(0, 6).forEach((tm, i) => wait(sc, Math.max(0, ms - (Math.min(tg.length, 6) - 1 - i) * T.mageBoomGap * k), () => {
                if (this.destroyed) return;
                const r = 15 + Math.random() * 8; const fb = sc.add.circle(tm.x0, tm.y0 - (tm.o.displayHeight ?? 40) * 0.45, r, 0xff8a2a, 0.95); const core = sc.add.circle(fb.x, fb.y, r * 0.5, 0xffe08a, 1);
                stageAdd(fb); stageAdd(core);
                tween(sc, { targets: [fb, core], to: { scale: 1.6, alpha: 0 }, duration: T.mageBoomMs, ease: 'Quad.easeOut', onComplete: () => { fb.destroy(); core.destroy(); } });
            }));
        };

        // 원거리: 제자리 사격. 가는 가로 볼트(마법은 구슬 빛 볼트 + 시전자 발광 + 중앙 라벨 VS -> 마법)
        const fire = (a, d) => {
            const mage = a.unit.type === 'mage';
            if (mage && CUT_STYLE === 'ref') { mageCast(a, d); return; }
            if (mage && a === this.sides[0]) { // 중앙 '마법' 문구는 공격측이 마법병일 때만
                this.vsText.setText('마법');
                const h = a.members[0].o;
                const glow = sc.add.circle(h.x + a.dir * h.displayWidth * 0.4, h.y - h.displayHeight * 0.55, 10, 0x8f7cff, 0.9);
                this.stage.add(glow);
                tween(sc, { targets: glow, to: { scale: 2.4, alpha: 0.2 }, final: { scale: 2.4, alpha: 0 }, duration: ms, ease: 'Sine.easeInOut', onComplete: () => glow.destroy() });
            }
            if (a.unit.type === 'gunner') { // 총병 일제 사격: 앞열 -> 뒷열 짧은 간격, 직선 탄. 마지막 착탄 = 충돌(clash) 시각 ms
                const n = Math.max(1, a.members.length);
                const flight = CUT_STYLE === 'ref' ? Math.round(40 + Math.min(40, Math.abs(d.home - a.home) / this.W * 60)) * k : Math.max(80, ms * 0.18); // 참고 구성: 직사 40~80ms(거리 비례)
                a.members.forEach((m, i) => {
                    const tgt = d.members[Math.min(i, d.members.length - 1)];
                    const from = { x: m.o.x + a.dir * m.o.displayWidth * 0.45, y: m.o.y - m.o.displayHeight * 0.55 };
                    const to = { x: tgt.x0 - a.dir * tgt.o.displayWidth * 0.2, y: tgt.y0 - tgt.o.displayHeight * (0.4 + Math.random() * 0.2) };
                    const order = (m.col ?? 0) * 3 + (i % 3);
                    gunShot(from, to, Math.max(0, ms - flight - ((n - 1 - Math.min(order, n - 1)) * ms * (CUT_STYLE === 'ref' ? 0.3 : 0.35)) / n), flight, a.dir, full ? (p) => puff(p.x, p.y + 4, 1, DUST, 16) : null, m.o);
                });
                return;
            }
            if (!mage) { // 궁병: 정점이 무대 중앙선(W/2)에 오는 포물선. 앞열 -> 뒷열 순서로 열 간격 발사, 비행 시간은 개별 거리 비례, 마지막 착탄 = 충돌(clash) 시각 ms
                const shots = a.members.map((m, i) => {
                    const tgt = d.members[Math.min(i, d.members.length - 1)];
                    const from = { x: m.o.x + a.dir * 20, y: m.o.y - m.o.displayHeight * 0.55 };
                    const to = { x: tgt.x0 + (Math.random() - 0.5) * tgt.o.displayWidth * ARROW.jitterPx * 2, y: tgt.y0 - tgt.o.displayHeight * (0.35 + Math.random() * 0.25) };
                    return { from, to, apexX: this.W / 2, h: CUT_STYLE === 'ref' ? Math.max(ARROW.arcMinPx, Math.min(24, Math.abs(to.x - from.x) * 0.04)) : lobH(from, to) * (0.95 + Math.random() * 0.1), // 참고 구성: 거의 수평 화살
                        onLand: full ? (p) => !this.destroyed && puff(p.x, p.y + 4, 1, DUST, 20) : null }; // 착탄 먼지(풀 연출에서만 1개)
                });
                const sched = volleySchedule(a.members.map((m, i) => ({ wave: m.col ?? 0, dist: Math.abs(shots[i].to.x - shots[i].from.x) })), ms, k);
                shots.forEach((s, i) => Object.assign(s, sched[i]));
                fireVolley(sc, this.stage, shots, { scale: arrowScale, trail: true });
                return;
            }
            a.members.forEach((m, i) => {
                const tgt = d.members[Math.min(i, d.members.length - 1)];
                const ln = sc.add.rectangle(m.o.x + a.dir * 20, m.o.y - m.o.displayHeight * 0.5, mage ? 18 : 30, mage ? 6 : 2, mage ? 0xb9acff : 0xe8e4d8).setAlpha(0.95);
                this.stage.add(ln);
                tween(sc, { targets: ln, to: { x: tgt.x0 }, duration: ms * 0.6, ease: 'Linear', delay: (ms * 0.4 * i) / Math.max(1, a.members.length), onComplete: () => ln.destroy() });
            });
        };

        const popNum = (s, label) => { // 병력 단계 감소(-N). HP 피해 수치는 표시하지 않는다
            const h = s.members[0].o;
            const big = s.lost >= 2; const fsz = CUT_STYLE === 'ref' ? Math.round((30 + 6 * Math.min(4, Math.max(0, s.lost))) * (this.W < 760 ? 0.8 : 1)) : 34; // 참고 구성: 많이 잃을수록 크게, 2 이상 주황
            const t = sc.add.text(h.x, h.y - h.displayHeight - 6, String(label), bold(fsz, CUT_STYLE === 'ref' && big ? '#FF7A2E' : '#FFFFFF', { stroke: CUT_STYLE === 'ref' ? '#2a0800' : '#5A1010' })).setOrigin(0.5);
            this.stage.add(t);
            tween(sc, { targets: t, to: { y: t.y - 36, alpha: 0 }, duration: 700, ease: 'Quad.easeOut', onComplete: () => t.destroy() });
        };

        // 사망 병사: 위로 튕기는 호(높이 20~30px, 0.35초) 후 소멸 + 붉은 파티클. slow=영웅 사망 슬로모션(0.5배속 구간)
        const launch = (s, m, slow = 1) => {
            if (CUT_STYLE === 'ref' && isMover(s) && !s.vsPhalanx) { // 돌진 측: 막힌 지점에서 뒤로 튕겨 나가며(위로 살짝 뜨는 포물선) 쓰러짐(창병 방진 상대 기병은 아래 '위로 튕김')
                puff(m.o.x, m.o.y - m.o.displayHeight * 0.5, 3, BLOOD, 30);
                const x0 = m.o.x; const y0 = m.o.y; const dx = -s.dir * (40 + Math.random() * 40); const hgt = 16 + Math.random() * 14;
                const p = { t: 0 };
                tween(sc, { targets: p, to: { t: 1 }, duration: T.refFly * slow * (0.9 + Math.random() * 0.25), ease: 'Linear',
                    onUpdate: () => { m.o.x = x0 + dx * p.t; m.o.y = y0 - Math.sin(Math.PI * p.t) * hgt; m.o.angle = -s.dir * 70 * p.t; m.o.alpha = 1 - p.t * p.t; },
                    onComplete: () => { m.o.alpha = 0; } });
                return;
            }
            if (CUT_STYLE === 'ref') { // 위(+바깥쪽 약간)로 포물선을 그리며 무대 위로 날아가 사라짐
                puff(m.o.x, m.o.y - m.o.displayHeight * 0.5, 3, BLOOD, 30);
                const x0 = m.o.x; const y0 = m.o.y; const dx = -s.dir * (30 + Math.random() * 50); const up = y0 + m.o.displayHeight + 20;
                const p = { t: 0 };
                tween(sc, { targets: p, to: { t: 1 }, duration: T.refFly * slow * (0.85 + Math.random() * 0.3), ease: 'Quad.easeOut',
                    onUpdate: () => { m.o.x = x0 + dx * p.t; m.o.y = y0 - up * p.t; m.o.angle = -s.dir * 25 * p.t; m.o.alpha = 1 - p.t * p.t; },
                    onComplete: () => { m.o.alpha = 0; } });
                return;
            }
            puff(m.o.x, m.o.y - m.o.displayHeight * 0.5, 6, BLOOD, 50);
            const x0 = m.o.x; const y0 = m.o.y; const hgt = 20 + Math.random() * 10; const dx = -s.dir * (24 + Math.random() * 24);
            const p = { t: 0 };
            tween(sc, {
                targets: p, to: { t: 1 }, duration: 350 * slow, ease: 'Linear',
                onUpdate: () => { m.o.x = x0 + dx * p.t; m.o.y = y0 - Math.sin(Math.PI * p.t) * hgt; m.o.angle = -s.dir * 90 * p.t; m.o.alpha = 1 - p.t; },
                onComplete: () => { m.o.alpha = 0; },
            });
        };

        // 와이프: 검정 커튼이 위에서 아래로 걷힘(오픈) / 위에서 내려와 덮음(종료)
        const curtain = this.curtain;
        const wipeOut = () => {
            curtain.setPosition(0, -this.H).setVisible(true);
            tween(sc, { targets: curtain, to: { y: 0 }, duration: T.out, ease: 'Quad.easeIn', onComplete: end });
        };
        // 원위치 복귀 후 결과 유지 -> 와이프아웃 -> 맵 복귀
        const hold = () => wait(sc, (CUT_STYLE === 'ref' ? T.refHoldEnd : T.hold) * k, wipeOut); // 참고 구성: 마지막 정지 1060 -> 520ms(강화면 gacha84: 끝 1~1.5초 정지, 목표 근접 약 2.5초·원거리 3초)
        const alive = (s) => s.members.filter((m) => !m.died);
        // 생존자 전원을 출발 자리(x0, y0)로 확정(복귀 완료·스킵 시 중간 위치에 남지 않게)
        const snapHome = () => this.sides.forEach((s) => alive(s).forEach((m) => { m.o.setPosition(m.x0, m.y0); m.o.angle = 0; }));
        // 복귀: 돌진했던 생존자가 원래 자리로 빠르게(이징 아웃, 병사별 소폭 엇출발) 돌아온다. 복귀 완료 뒤에만 유지 -> 종료로 넘어간다
        const goHome = () => {
            const back = movers.flatMap((s) => alive(s).map((m) => ({ s, m, x: m.o.x, y: m.o.y, d: Math.min(0.25, (m.rank ?? 0) * 0.03) })));
            if (!back.length) { snapHome(); wait(sc, T.back * k, hold); return; } // 움직인 쪽이 없으면(원거리) 같은 길이만큼 대기해 총 길이 유지
            movers.forEach((s) => { const l = alive(s)[0]; if (l) puff(l.o.x, this.groundY + 6, 3, dustOf(s), 40); });
            const p = { t: 0 };
            tween(sc, {
                targets: p, to: { t: 1 }, duration: (CUT_STYLE === 'ref' ? T.refWalk : T.back) * k, ease: 'Linear',
                onUpdate: () => back.forEach((b) => {
                    const lt = clamp01((p.t - b.d) / (1 - b.d));
                    const e = 1 - (1 - lt) * (1 - lt); // 이징 아웃(빠르게 출발해 자리에서 멈춤)
                    b.m.o.x = b.x + (b.m.x0 - b.x) * e;
                    b.m.o.y = b.y + (b.m.y0 - b.y) * e - (lt < 1 ? Math.abs(Math.sin(lt * Math.PI * 4)) * (b.s.ship ? 2 : 4) : 0);
                }),
                onComplete: () => { snapHome(); hold(); },
            });
        };
        // 타격 교환과 병력 틱다운이 모두 끝나면 -> 정리 -> 복귀
        let pending = 2;
        const joined = () => { pending -= 1; if (pending === 0) wait(sc, T.settle * k, goHome); };
        let xchgOn = false; // 타격 교환 중에는 영웅 피격 넉백을 교환 모션이 대신한다(같은 x 를 두 트윈이 다투지 않게)
        // 타격 교환(접전): 박자마다 공격 측(교대)이 앞으로 찌르고 맞는 측은 뒤로 밀린다. 단일 방향 교전은 공격측만 친다.
        // 근접(돌진 측)은 찌르기, 원거리 측은 제자리에서 추가 사격(볼트). 사망 예정 병사(m.died)는 틱다운의 쓰러짐 연출이 담당하므로 제외.
        const refMelee = (onDone) => {
            const mv = this.sides.filter((sd) => isMover(sd) && alive(sd).length);
            if (!mv.length) return false;
            const troopsBoth = both && this.sides.every((sd) => sd.mode === 'march'); // 일반 보병 부대끼리: 사선 뒤엉킴(영상 C)
            if (troopsBoth) { // 일반 병사끼리: 중앙에서 사선 한 줄로 뒤엉킴(생존자 각자 무작위 사선 이동)
                xchgOn = true;
                const live = this.sides.flatMap((sd) => alive(sd).map((m) => ({ sd, m, x: m.o.x, y: m.o.y, tx: meet + (Math.random() - 0.5) * this.W * 0.18, ty: m.o.y + (Math.random() - 0.5) * 30 })));
                live.forEach((q) => { q.tx = q.tx + (q.ty - this.groundY) * 0.6; }); // 사선(아래일수록 오른쪽)
                const p = { t: 0 };
                tween(sc, { targets: p, to: { t: 1 }, duration: T.refTangle * k, ease: 'Sine.easeInOut', onUpdate: () => live.forEach((q) => { if (q.m.died && q.m.o.alpha < 1) return; q.m.o.x = q.x + (q.tx - q.x) * p.t + Math.sin(p.t * Math.PI * 4) * 4; q.m.o.y = q.y + (q.ty - q.y) * Math.sin(p.t * Math.PI); }),
                    onComplete: () => { xchgOn = false; live.forEach((q) => { if (!q.m.died) { q.m.x1 = q.m.o.x; } }); onDone(); } });
                return true;
            }
            // 영웅 돌진(사용자 2026-11-04 '중간에 막힌다는 건 체력 0'): 격파되지 않는 돌진 측은 충돌 지점을 지나 끝까지 달리고(오버슛, 영상 보병 영웅 7~8초),
            //  격파되는 측(s.dead)은 충돌 지점에서 멈춘다. 쓰러지는 병사(m.died)는 병력 감소 순서대로 그 자리에서 튕겨 나간다(launch: 돌진 측 = 뒤로, 서 있던 측 = 위로)
            const chargers = mv.filter((sd) => sd.mode === 'charge');
            if (!chargers.length) return false; // 돌진 측이 없으면(일반 보병 부대가 공격) 기존 박자 접전(exchange) 그대로
            const runners = chargers.filter((sd) => !sd.dead);
            wait(sc, both ? T.refOverlap * k : 0, () => {
                if (!runners.length) { onDone(); return; }
                const st = runners.flatMap((sd) => alive(sd).map((m) => ({ m, sd, x: m.o.x })));
                const run = this.W * 0.14; const p = { t: 0 };
                tween(sc, { targets: p, to: { t: 1 }, duration: T.refOvershoot * k, ease: 'Quad.easeOut', onUpdate: () => st.forEach((q) => { if (q.m.died) return; const hw = (q.m.o.displayWidth ?? 40) / 2; q.m.o.x = Math.max(8 + hw, Math.min(this.W - 8 - hw, q.x + q.sd.dir * run * p.t)); }), // 오버슛도 화면 안(강화면 gacha84: 오버슛 병사가 화면 밖으로 나가 0명 측정)
                    onComplete: () => onDone() });
            });
            return true;
        };
        const exchange = (onDone) => {
            if (CUT_STYLE === 'ref' && refMelee(onDone)) return;
            const strikers = this.sides.filter((s) => s.mode !== 'idle');
            const nB = CUT_STYLE === 'ref' ? T.refBeats : T.beats; // 참고 구성: 접전 박자 10 -> 4(일반 보병·창병·원거리 교환이 1.1초 걸려 길었던 원인)
            const order = Array.from({ length: nB }, (_, i) => strikers[i % strikers.length]);
            const beatMs = T.beat * k;
            const span = beatMs * nB;
            const total = span + T.beatJitter * k;
            const live = this.sides.flatMap((s) => alive(s).map((m) => ({ s, m, j: Math.random() * T.beatJitter * k })));
            const offset = (s, lt) => {
                if (lt < 0 || lt >= span) return 0;
                const st = order[Math.floor(lt / beatMs)];
                const ph = Math.sin(Math.PI * ((lt % beatMs) / beatMs));
                return s === st ? s.dir * (isMover(s) ? T.lungePx : 0) * ph : -s.dir * T.recoilPx * ph;
            };
            order.forEach((st, i) => wait(sc, i * beatMs, () => {
                if (this.destroyed) return;
                const ot = st === a ? d : a;
                const tl = (alive(ot)[0] ?? ot.members[0]).o;
                if (st.mode === 'ranged') { // 원거리: 생존 병사 1명이 짧은 볼트 1발
                    const sh = alive(st)[Math.floor(Math.random() * Math.max(1, alive(st).length))] ?? st.members[0];
                    const mage = st.unit.type === 'mage';
                    if (st.unit.type === 'gunner') { // 총병: 직선 탄 1발
                        gunShot({ x: sh.o.x + st.dir * sh.o.displayWidth * 0.45, y: sh.o.y - sh.o.displayHeight * 0.55 }, { x: tl.x - st.dir * tl.displayWidth * 0.2, y: tl.y - tl.displayHeight * (0.4 + Math.random() * 0.2) }, 0, CUT_STYLE === 'ref' ? 60 * k : Math.max(60, beatMs * 0.5), st.dir, null, sh.o); // 참고 구성: 직사 60ms + 반동
                    } else if (!mage) { // 궁병: 낮은 포물선 화살 1발
                        const from = { x: sh.o.x + st.dir * 20, y: sh.o.y - sh.o.displayHeight * 0.55 };
                        const to = { x: tl.x + (Math.random() - 0.5) * tl.displayWidth * ARROW.jitterPx, y: tl.y - tl.displayHeight * (0.35 + Math.random() * 0.25) };
                        fireVolley(sc, this.stage, [{ from, to, apexX: this.W / 2, h: CUT_STYLE === 'ref' ? Math.max(ARROW.arcMinPx, 10) : lobH(from, to, ARROW.cutBeatArc), delay: 0, dur: beatMs * ARROW.cutBeatFlight }], { scale: arrowScale, trail: full, flash: full });
                    } else {
                        const ln = sc.add.rectangle(sh.o.x + st.dir * 20, sh.o.y - sh.o.displayHeight * 0.5, mage ? 16 : 26, mage ? 5 : 2, mage ? 0xb9acff : 0xe8e4d8).setAlpha(0.95);
                        stageAdd(ln);
                        tween(sc, { targets: ln, to: { x: tl.x }, duration: beatMs * 1.6, ease: 'Linear', onComplete: () => ln.destroy() });
                    }
                } else {
                    sparks(tl.x - st.dir * tl.displayWidth * 0.35, tl.y - tl.displayHeight * (0.35 + Math.random() * 0.3), full ? 3 : 2);
                }
                if (i % 2 === 0) this.sfx.oneShot?.('sfx_battle_clash', 0.12, 1.25 + Math.random() * 0.2); // 박자 타격음(작게, 2박자에 1번)
            }));
            xchgOn = true;
            const p = { t: 0 };
            tween(sc, {
                targets: p, to: { t: 1 }, duration: total, ease: 'Linear',
                onUpdate: () => live.forEach(({ s, m, j }) => { if (!m.died) m.o.x = m.x1 + offset(s, p.t * total - j); }),
                onComplete: () => { xchgOn = false; live.forEach(({ m }) => { if (!m.died) m.o.x = m.x1; }); onDone(); },
            });
        };

        // 충돌 직전 0.15초 무대 줌인 1.0 -> 1.06(무대 중심 기준), 충돌 후 0.3초에 복귀
        const zoomTo = (z, dur) => tween(sc, { targets: this.stage, to: { scaleX: z, scaleY: z, x: (this.W / 2) * (1 - z), y: (this.SH / 2) * (1 - z) }, duration: dur, ease: 'Sine.easeOut' });

        // 충돌 -> (히트스톱) -> 병력 숫자 틱 다운 + HP 바 감소
        const clash = () => {
            setCharge(1);
            const cx = both ? meet : d.members[0].o.x;
            const cy = this.groundY - (d.members[0].o.displayHeight ?? 40) * 0.5;
            this.sfx.oneShot?.('sfx_battle_clash', 0.6, 1.0);
            if (full) {
                this.flash.setFillStyle(0xffffff, Math.min(T.flashAlpha, FX.flash.maxAlpha)); // 약하게(0.33 이하), 0.1초
                tween(sc, { targets: this.flash, to: { fillAlpha: 0 }, duration: Math.min(T.flashMs, FX.flash.maxMs), ease: 'Linear' });
                // 충격파 링(0.2초, 반경 0 -> 60px, 도트 느낌의 두꺼운 선)
                const ring = sc.add.circle(cx, cy, 60).setStrokeStyle(4, 0xfff4d0, 1).setScale(0.05);
                this.stage.add(ring);
                tween(sc, { targets: ring, to: { scale: 1, alpha: 0 }, duration: 200, ease: 'Quad.easeOut', onComplete: () => ring.destroy() });
                // 속도선(선두 뒤로 3~5줄)
                movers.forEach((s) => {
                    const l = s.members[0].o;
                    for (let i = 0; i < 4; i++) {
                        const ln = sc.add.rectangle(l.x - s.dir * 30, l.y - l.displayHeight * (0.2 + i * 0.18), 46, 2, 0xffffff, 0.8);
                        this.stage.add(ln);
                        tween(sc, { targets: ln, to: { x: ln.x - s.dir * 30, alpha: 0 }, duration: 220, onComplete: () => ln.destroy() });
                    }
                });
                this.shake((this.flank === 'back' ? T.shakeAmpBack : T.shakeAmp) * Math.max(fxScale(), 0.6), T.shakeMs); // 수평 우선, 0.3초 감쇠(무대만)
                zoomTo(1, 300);
            }
            sparks(cx, cy, full ? 8 : 4);
            puff(cx, this.groundY, full ? 5 : 2, dustOf(d), 90);
            if (this.flank) {
                const back = this.flank === 'back';
                if (back) this.vsText.setText('배후!').setColor('#ff7a6b');
                const had = dismissSkillBanner(this); // 스킬 이름 배너(같은 자리)를 먼저 걷고, 걷혔으면 0.09초 뒤 등장(겹침 없음)
                const bn = sc.add.text(this.W / 2, this.SH * 0.14, back ? '배후 공격!' : '측면 공격!', bold(40, back ? '#FF6B6B' : '#FFB347', { stroke: '#2a0a0a' })).setOrigin(0.5).setScale(1.5);
                this.root.add(bn);
                if (had) { bn.setAlpha(0); tween(sc, { targets: bn, to: { alpha: 1 }, duration: 60, delay: 90 }); }
                tween(sc, { targets: bn, to: { scale: 1 }, duration: 160, ease: 'Back.easeOut', delay: had ? 90 : 0 });
            }
            if (this.counterMarks) tween(sc, { targets: this.counterMarks, to: { alpha: 1 }, duration: 160 }); // 반격 발동: 오른쪽 강조 켜기
            this.hitLine();
            const skillStop = this.skill ? cutImpact(this, cx, cy) : 0; // 스킬: 대형 충격 링·방사선 + 추가 흔들림, 반환 = 추가 히트스톱(ms)
            puff(d.members[0].o.x, this.groundY, 6, BLOOD, 80);
            if (this.mutual) puff(a.members[0].o.x, this.groundY, 6, BLOOD, 80); // 양쪽 동시 피해
            if (d.ship) puff(d.members[0].o.x, this.groundY + 4, 5, FOAM, 60); // 수상 피격 물보라
            if (this.mutual && a.ship) puff(a.members[0].o.x, this.groundY + 4, 5, FOAM, 60);
            if (d.dmg > 0) popNum(d, d.lost > 0 ? `-${d.lost}` : '0');
            if (a.dmg > 0) popNum(a, a.lost > 0 ? `-${a.lost}` : '0');

            // 병력 숫자 틱 다운: 1명당 0.08~0.12초, 전체 약 0.5초 안. 숫자 바뀔 때마다 1.3 -> 1.0 펀치
            const queue = this.sides.map((s) => ({ s, died: s.members.filter((m) => m.died), cur: s.before, left: s.lost }));
            const maxLost = Math.max(1, ...queue.map((q) => q.left));
            const perStep = CUT_STYLE === 'ref' ? Math.max(1, Math.ceil(maxLost / 2)) : maxLost > 6 ? Math.ceil(maxLost / 5) : 1; // 참고 구성: 한 덩어리로 2단계 감소(영상 '10→8→0')
            const steps = Math.ceil(maxLost / perStep);
            const stepMs = Math.max(T.tickMin, Math.min(T.tickMax, T.tickBudget / steps)) * k;
            const punch = (t) => { t.setScale(1.3); tween(sc, { targets: t, to: { scale: 1 }, duration: 100 }); };
            const flick = (s, m) => {
                if (m.o.setTintMode) { m.o.setTint(0xffffff).setTintMode(Phaser.TintModes?.FILL ?? 1); wait(sc, 70 * k, () => m.o.clearTint?.()); } // Phaser 4 흰 플래시
                const bx = m.o.x;
                if (m.died || !xchgOn) tween(sc, { targets: m.o, to: { x: bx - s.dir * 8 }, final: { x: bx }, duration: 70, yoyo: true }); // 교환 중 생존 영웅의 밀림은 교환 모션이 담당
                puff(m.o.x, m.o.y - m.o.displayHeight * 0.5, 4, BLOOD, 50);
            };
            const nextStep = () => {
                let any = false;
                let heroDeath = null;
                queue.forEach((q) => {
                    if (q.left <= 0) return;
                    any = true;
                    const chunk = Math.min(q.left, q.s.isHero ? Math.max(1, Math.ceil(q.s.lost / steps)) : perStep);
                    q.left -= chunk;
                    q.cur -= chunk;
                    if (q.s.isHero) { const h = q.s.members[0]; if (q.left === 0 && h.died) heroDeath = q; else flick(q.s, h); }
                    else q.died.splice(0, chunk).forEach((m) => launch(q.s, m));
                    q.s.countText.setText(String(Math.max(q.s.after, q.cur))).setColor(CSS.dangerText);
                    punch(q.s.countText);
                    this.sfx.oneShot?.('sfx_battle_clash', 0.18, 1.5); // 숫자 감소마다 짧은 타격음
                });
                if (heroDeath) { // 영웅 사망 직전 슬로모션(0.5배속) 후 쓰러짐
                    const h = heroDeath.s.members[0];
                    flick(heroDeath.s, h);
                    wait(sc, T.heroSlow * k, () => { launch(heroDeath.s, h, 2); wait(sc, T.heroFall * k, nextStep); });
                    return;
                }
                if (any) { wait(sc, stepMs, nextStep); return; }
                queue.forEach((q) => q.s.countText.setText(String(q.s.after)));
                joined(); // 틱다운 완료(타격 교환 완료와 합류 후 복귀)
            };
            this.sides.forEach((s) => this.stepBar(s, k)); // HP 장식 바 계단식 감소
            // 히트스톱(풀에서만) 뒤 타격 교환(접전)과 병력 틱다운을 동시에 진행 -> 둘 다 끝나면 복귀
            wait(sc, full ? T.hitstop + skillStop : 0, () => {
                exchange(joined);
                nextStep();
            });
        };

        this.sfx.collideAt = (T.enterBlack + T.wipeIn * k + ms) / 1000; // 효과음 큐를 실제 충돌 시각에 맞춘다(1배속 기준 초)
        this.sfx.start(); // 컷 시작(t=0) 기준 효과음 스케줄
        // 진입: 검정 2프레임(약 0.07초) -> 위에서 아래로 와이프(0.15초) + 패널 0.2초 페이드인
        this.root.setAlpha(1);
        this.panel.setAlpha(0);
        curtain.setPosition(0, 0).setVisible(true);
        wait(sc, T.enterBlack, () => {
            tween(sc, { targets: this.panel, to: { alpha: 1 }, duration: T.panelFade });
            tween(sc, {
                targets: curtain, to: { y: this.H }, duration: T.wipeIn * k, ease: 'Quad.easeIn',
                onComplete: () => {
                    curtain.setVisible(false);
                    if (CUT_STYLE === 'ref') this.affinityRibbon(); // 상단 상성 리본(진입 직후)
                    if (this.skill) cutIntro(this, ms); // 스킬 이름 배너 + 시전자 오라
                    this.sides.forEach((s, i) => { if (s.mode === 'ranged') fire(s, this.sides[1 - i]); }); // 원거리 측은 제자리 사격
                    if (!movers.length) { wait(sc, ms, clash); return; }
                    if (full && CUT_STYLE !== 'ref') wait(sc, Math.max(0, ms - T.zoomIn), () => zoomTo(1.06, T.zoomIn)); // 충돌 직전(참고 구성 = 카메라 고정) 줌인
                    const proxy = { t: 0 };
                    const last = { t: 0 };
                    tween(sc, {
                        targets: proxy, to: { t: 1 }, duration: ms, ease: 'Linear',
                        onUpdate: () => {
                            setCharge(proxy.t);
                            if (proxy.t - last.t > 0.12) { last.t = proxy.t; movers.forEach((s) => { if (s.mode !== 'dive') puff(s.members[0].o.x - s.dir * 30, this.groundY + 6, 2, dustOf(s), 30); }); } // 질주 먼지(배 = 항적 물보라)
                        },
                        onComplete: clash,
                    });
                },
            });
        });
    }

    // 충돌 순간 한 줄 강조(치명타·상성 유리/불리, 반격 쪽도). 서버 이벤트에 있는 값만, 없으면 아무것도 만들지 않는다.
    // 위치 = 무대 27%(스킬 이름 배너 13%·측면/배후 배너 14% 아래), 컷신 길이에는 영향 없음(대기 없이 함께 사라짐)
    hitLine() {
        const h = this.hit;
        if (!h || this.destroyed) return;
        const aff = (v, pre = '') => (v === 'adv' ? `${pre}상성 유리 ▲` : v === 'dis' ? `${pre}상성 불리 ▼` : null);
        const ref = CUT_STYLE === 'ref'; // 참고 구성: 상성은 상단 리본(affinityRibbon)이 담당 -> 여기는 치명타만
        const parts = [h.crit ? '치명타!' : null, ref ? null : aff(h.affinity)];
        if (this.mutual) parts.push(h.counterCrit ? '반격 치명타!' : null, ref ? null : aff(h.counterAffinity, '반격 '));
        const list = parts.filter(Boolean);
        if (!list.length) return;
        const col = h.crit || h.counterCrit ? '#FFE14A' : (h.affinity ?? h.counterAffinity) === 'dis' ? '#B9C6D8' : '#FF9A3C';
        const t = this.scene.add.text(this.W / 2, this.SH * (ref ? (this.skill ? 0.36 : 0.22) : 0.27), list.join('  ·  '), bold(this.W < 760 ? 20 : 30, col, { stroke: '#2a1a05' })).setOrigin(0.5);
        const base = Math.min(1, (this.W - 24) / Math.max(1, t.width));
        t.setScale(base * 1.35);
        this.root.add(t);
        tween(this.scene, { targets: t, to: { scale: base }, duration: 160, ease: 'Back.easeOut' });
    }

    // 무대만 흔든다(패널 제외)
    shake(amp, ms) {
        const r = this.shaker;
        const p = { t: 1 };
        tween(this.scene, {
            targets: p, to: { t: 0 }, duration: ms, ease: 'Linear',
            onUpdate: () => r.setPosition(Math.round((Math.random() * 2 - 1) * amp * p.t), Math.round((Math.random() * 2 - 1) * amp * 0.35 * p.t)), // 수평 우선
            onComplete: () => r.setPosition(0, 0),
        });
    }

    destroy() {
        if (this.destroyed) return;
        this.destroyed = true;
        this.sfx.stop(); // 종료·스킵·끄기 시 소리/루프/덕킹 즉시 정리
        this.scene.events.off('shutdown', this.onShut);
        if (this.onUpd) this.scene.events.off('update', this.onUpd);
        this.root.destroy(true);
    }
}
