import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { L, texHi } from '../layout.js';
import { settings } from '../settings.js';
import { makeText, fitText } from './common.js';
import { Button } from './Button.js';
import { fitLabel } from './Tabs.js';
import { ScrollList, listRow } from './widgets.js';
import { campaignCard, infoStrip, ribbonTag } from './campaignInfo.js';
import { campaignState, myHeroLevel, lineupLevel } from './campaignInfoRules.js';
import { session } from '../api/client.js';
import { skinIcon } from './skin.js';
import { pixelImage } from './PixelBadge.js';
import { isInstant } from './motion.js';
import { ensurePortrait } from './PortraitCard.js';
import { portraitCodeByName as portraitCodeByNameA, directLeaderBase } from '../assets.js';
import { loaded, manifestHas, texFits, ensureScope, scopeOf, texKey, withVer, portraitCode, captainPortraitLogical, ensureCaptainMap, ensurePortraitTex, npcPersonCode } from '../assets.js';
import { heroNameOf } from '../campaign/campaignFlow.js';
import HERO_TIPS from '../data/hero_tips.json';
import { sortieOf, stageLockText, stagePlayable, loadTerritories, territoriesFor, isGenericCommander } from '../campaign/campaignMapData.js';
import { plaqueFace, loadPlaqueFont, plaqueFontSettled, plaqueFontReady, plaqueCovers, preloadPlaqueFonts, nfc } from './plaqueFonts.js';
import { project, clampCam, fitBounds, flatGlobeTravel, overscan, declutter, placeLabels, gridStep, clamp, normBounds, inBounds, zSharp, FULL_VIEW, screenPPD, lodAlpha } from './stageMapMath.js';

// 캠페인 지도 선택 화면(스테이지 탭): 좌 지도(약 63%) + 우 목록·요약 / 세로 화면은 상단 지도(38%) + 하단 시트.
// 흐름: 진입(세계 줌 + 모든 캠페인 핀) -> 추천 캠페인 자동 선택 -> 카메라 이동 -> 핀 낙하 -> 파동 -> 영웅 칩 순차 -> 요약.
//       같은 캠페인 재선택 -> 스테이지 핀(번호) + 순차 점선 연결. 스테이지 핀/행 = Lobby.pickStage(onPick).
// 준비 중 캠페인(c.preview): 같은 연출·영토·칩·요약을 보여 주고 출정만 비활성('곧 공개'). 핀은 '곧 공개' 스타일(반투명 + 점선 링), 잠김(회색)과 구분.
//       스테이지 데이터가 없으면 재선택해도 스테이지 보기로 들어가지 않는다.
// 이동 연출은 travel({plan, sample}) 로 교체 가능(1차: stageMapMath.flatGlobeTravel, 2차: 셰이더 구체 회전 예정).
// 지도 에셋(map.world.* / map.icon.*)이 manifest 에 없으면 단순 모드(남색 바다 + 위경도 격자)로 그린다. 라벨은 전부 코드 텍스트.

// 연출 값(조정 가능)
export const MAP_FX = {
    entryDelayMs: 350,
    pinDropPx: 60, pinDropMs: 280, squashMs: 60, bounceMs: 120,
    rippleMs: 600, rippleCount: 2,
    chipGapMs: 70, chipMs: 180,
    stagePinGapMs: 90,
    summaryMs: 160,
};
// 지도 에셋(안아트 public/assets/map_world, manifest scope 'map'). 조회 순서: 데스크톱 = 항목 path(4096) > variants.mobile / 모바일 = variants.mobile(2048) > path.
// 레이어(아래 -> 위): base > overlay.greatwall(명대 근사 — GREATWALL_CH 캠페인만) > decor.sea > [코드: 도로선·핀·라벨] > decor.border
// (안아트 권장 순서는 sea 가 핀 위였으나 핀·번호 가독성 때문에 sea 를 핀 아래로 둠 — 조정 가능)
// 세계 기본판: 구대륙판(map.oldworld.*, 안아트 2026-11-02, 약 -25~175E / -38~78N)이 manifest 에 있으면 그것, 없으면 전지구판(map.world.*)
// (모듈 로드 시점엔 manifest 가 아직 없을 수 있어 함수로 판정)
const oldworld = () => !!loaded.manifest?.['map.oldworld.base']?.path;
const layerKeys = () => (oldworld()
    ? { base: 'map.oldworld.base', greatwall: 'map.oldworld.overlay.greatwall', sea: 'map.oldworld.decor.sea', border: 'map.oldworld.decor.border' }
    : { base: 'map.world.base', greatwall: 'map.world.overlay.greatwall', sea: 'map.world.decor.sea', border: 'map.world.decor.border' });
const GREATWALL_CH = new Set([1]);
// 같은 인물 다른 코드(서가 칩 중복 방지, 코드 기준). 키 -> 대표 코드. 이름(괄호 표기) 비교에 의존하지 않는다(2026-11-08 이름 괄호 제거)
const SAME_PERSON = { npc_yelu_longxu: 'npc_liao_shengzong' }; // ch11 거란 성종 = 야율융서
const UI_KEYS = { chip: 'map.world.ui.chip_frame', ripple: 'map.world.ui.ripple' };
const PIN_ICON = 'map.icon.pin_gem'; // 캠페인 핀(없으면 코드 그리기)
const HUB_ICON = 'map.icon.library_tower'; // 서고(가상 스테이지) 허브
// 스테이지 -> 랜드마크 아이콘(map.icon.<name>, 상태 변형 locked/cleared). 없으면 코드 핀
export const STAGE_ICON = {
    ch1_s1: 'port', ch1_s2: 'mountains', ch1_s3: 'harbor_city', ch1_s4: 'eupseong', ch1_s5: 'walled_capital',
    ch1_s6: 'mountain_fortress', ch1_s7: 'port', ch1_s8: 'library_tower', ch1_s9: 'harbor_city', ch1_s10: 'library_tower',
};
const CIRCLE_MASK = 'stagemap_circle_mask';
// 지도 LOD(단일 설정 지점). 좌표는 기존 정규화 경위도(x=(lon+180)/360, y=(90-lat)/180).
// - worldMaxUpscale: 세계판 확대 상한(화면 백킹 px / 원본 px). 넘으면 뭉개지므로 카메라 z 를 자른다(지역판이 덮는 곳은 지역판 기준으로 상한 완화).
// - regions: 지역판 고해상 지도(안아트 public/assets/map_world/regional/, bounds JSON + manifest 조각 병합 후 key·bounds 기입).
//   bounds = {x0,y0,x1,y1}(정규화) 또는 {west,east,north,south}(도). manifest 에 key 가 없거나 bounds 가 비면 무시(세계판 그대로).
//   key = 고해상(데스크톱) 항목, variants.mobile = 저해상. 캠페인 선택(줌 이동 시작) 시 초점·스테이지 핀이 bounds 안이면 지연 로드.
// - 전환(screenPPD = 세계판 표시 폭(장치 px)/360): < fadeFrom 세계판만, fadeFrom~fadeTo 지역판 불투명도 선형(세계판은 아래 유지), >= fadeTo 지역판.
//   변형: screenPPD <= hiPPD 면 mobile 변형, 넘으면 고해상(필요해질 때 지연 로드). 가장자리 featherFrac 비율은 알파 그라데이션(경계선 숨김).
export const MAP_LOD = {
    worldMaxUpscale: 2,
    regionMaxUpscale: 2,
    fadeFrom: 18, fadeTo: 26, hiPPD: 70, featherFrac: 0.035, // 안아트 보고값: screenPPD <18 세계판, 18~26 크로스페이드, >=26 지역판
    // 전장 지도(스테이지 보기 전용): 해당 장(ch)의 스테이지 보기로 들어가면 지연 로드해 그 bounds 에 불투명으로 덮는다(세계·지역판 위).
    // bounds = manifest 항목 bounds.normalized(없으면 여기 값). landmask(PNG 알파=육지)가 있으면 영토 색칠을 육지로 클리핑하는 마스크로 쓴다
    battles: [
        { id: 'imjin_battle', key: 'map.battle.imjin_battle', ch: 1, bounds: { x0: 0.8430555555555556, x1: 0.8652777777777778, y0: 0.275, y1: 0.3194444444444444 } },
    ],
    regions: [
        { id: 'east_asia', key: 'map.world.region.east_asia', bounds: { x0: 0.819444, x1: 0.916667, y0: 0.25, y1: 0.361111 } }, // 115~150E, 25~45N(east_asia_bounds.json)
    ],
};
// 세계판 표시 영역(world_view_bounds, 단일 설정 지점). 마커·영토 좌표는 계속 전지구 정규화(x=(lon+180)/360, y=(90-lat)/180)이고,
// 세계판 이미지는 이 사각형에 늘려 그리며 카메라 최소 줌·팬 제한도 이 사각형 기준(stageMapMath.clampCam). null = 전체 [0,1].
// 구대륙판(안아트 예정, 약 -25~175E / -38~78N)이 오면 그 JSON 의 정규화 사각형을 여기에 기입한다.
// bounds: 직접 지정(null = 자동). 자동 = 구대륙판을 쓰면 oldworldBounds(public/assets/map_world/oldworld/world_view_bounds.json normalized), 아니면 전체 [0,1]
export const MAP_VIEW = { bounds: null, oldworldBounds: { x0: 0.4305555555555556, x1: 0.9861111111111112, y0: 0.06666666666666667, y1: 0.7111111111111111 } };
// 구대륙판 영역: manifest 항목 bounds.normalized(또는 worldViewBounds 가 객체면 그 normalized) 우선, 없으면 MAP_VIEW.oldworldBounds
const oldworldBounds = () => { const e = loaded.manifest?.['map.oldworld.base']; const wv = e?.worldViewBounds; return normBounds(e?.bounds?.normalized ?? (wv && typeof wv === 'object' ? wv.normalized ?? wv : null)) ?? MAP_VIEW.oldworldBounds; };
const worldView = () => normBounds(MAP_VIEW.bounds ?? (oldworld() ? oldworldBounds() : null)) ?? FULL_VIEW;
// manifest 변형(variants.<name>)을 별도 논리 키(<key>.<name>)로 등록(메모리 항목만). 없으면 null
function variantKey(lg, name) {
    const v = loaded.manifest?.[lg]; const vv = v?.variants?.[name];
    if (!vv) return null;
    const k = `${lg}.${name}`;
    if (!loaded.manifest[k]) loaded.manifest[k] = { path: typeof vv === 'string' ? vv : vv.path, size: typeof vv === 'string' ? undefined : vv.size, type: 'image', scope: v.scope ?? 'map', variant_of: lg };
    return k;
}
// 지역판 고해상 키: 최대 텍스처(4096 기기)를 넘으면(east_asia 4200x2400) 4096 축소판(variants.max4096, 런타임 manifest 보강) > mobile 판
function regionHi(lg) { const v = loaded.manifest?.[lg]; if (!v || texFits(v)) return lg; return (texFits(v.variants?.max4096) ? variantKey(lg, 'max4096') : null) ?? variantKey(lg, 'mobile') ?? lg; }
const hiDpi = () => texHi(); // 1u 백킹 px 기준(layout.texHi). 예전 L.u x dpr 은 DPR 이중 곱(2026-11-14 수정, 롤백 settings.texDprLegacy)
// 적 진영 수장(대장 표식 대상): 메타 영웅 leader:true > 적 국호(factions side=enemy) id 와 같은 코드(조조 세력 id 'cao_cao' -> 조조) > 메타 적 인물 첫 번째(서가 메타 순서 = 기획 우선순위). 없으면 null
// 서가별 적 진영 수장(메타에 leader 표시가 없고 '메타 첫 적'이 현장 지휘관인 서가만). 진영의 우두머리(군주·가문 당주)를 대장으로.
//  데이터(shelf_map_meta heroes[].leader:true)가 생기면 그쪽이 우선. 표에 있는데 메타 적 목록에 없으면 칩을 새로 만든다
const SHELF_ENEMY_LEADER = {
    1: { name_ko: '우키타 히데이에' }, // 조선 침공군 총대장(스테이지 적 대표로 등장). 메타 첫 적은 수군 지휘관 구키 요시타카
    11: { code: 'npc_so_baeap' }, // 3차 침입(귀주대첩, 서가 결말) 거란군 총사령 소배압 — 서가 대표 1인 고정(1차 소손녕은 일반 칩)
    20: { code: 'npc_takeda_katsuyori' }, // 나가시노(1575) 다케다군 총대장 가쓰요리(신겐 사후)
};
export function enemyLeaderOf(c, foes) {
    const meta = foes.filter((h) => !h.captain); // 메타(서가 정의) 적 인물만(스테이지 적 대표로 추가된 칩 제외)
    const byMeta = meta.find((h) => h.leader === true);
    if (byMeta) return byMeta;
    const t = SHELF_ENEMY_LEADER[c?.ch];
    if (t) { const hit = foes.find((h) => (t.code && h.code === t.code) || (t.name_ko && (h.name_ko ?? h.name) === t.name_ko)); if (hit) return hit; if (t.code) return { code: t.code, name_ko: t.name_ko ?? heroNameOf(t.code) ?? '', role: 'enemy' }; }
    const ids = (c?.factions ?? []).filter((f) => f.side === 'enemy').flatMap((f) => [f.id, f.leader, f.leader_code]).filter(Boolean);
    return meta.find((h) => ids.includes(h.code) || ids.includes(String(h.code).replace(/^npc_/, ''))) ?? meta[0] ?? null;
}
// 이름 -> 초상 코드(manifest portrait.<code>.name_ko 일치, 괄호 설명 무시). 스테이지 적 대표에 영웅 코드가 없을 때 초상 연결용. 결과 캐시
let PORTRAIT_BY_NAME = null;
export function portraitCodeByName(name) { // 공용 규칙(assets.portraitCodeByName: 정확 일치 > 유일한 '<이름> ' 접두) + 'X 직속 …' 이면 X 로 한 번 더
    const hit = portraitCodeByNameA(name) ?? (directLeaderBase(name) ? portraitCodeByNameA(directLeaderBase(name)) : null);
    if (hit) return hit;
    return null; // 정확 일치·접두 규칙은 assets.portraitCodeByName 한 곳(manifest 교체 시 캐시 재구축, 정검수 Medium). 아래 옛 중복 캐시는 도달하지 않음
    // eslint-disable-next-line no-unreachable
    const n = String(name ?? '').replace(/\s*\(.*?\)\s*/g, '').trim();
    if (!n || !loaded.manifest) return null;
    if (!PORTRAIT_BY_NAME) { PORTRAIT_BY_NAME = new Map(); Object.entries(loaded.manifest).forEach(([k, v]) => { const m = /^portrait\.([a-z0-9_]+)$/.exec(k); const nk = String(v?.name_ko ?? '').replace(/\s*\(.*?\)\s*/g, '').trim(); if (m && nk && !PORTRAIT_BY_NAME.has(nk)) PORTRAIT_BY_NAME.set(nk, m[1]); }); }
    return PORTRAIT_BY_NAME.get(n) ?? null;
}
// 진영 깃발(안아트 2026-11-04, manifest ui.flag.<faction_id> 256x256 투명, reuse_of = 원 키 파일). 반환: 텍스처 키(이미 있으면) | null(manifest 에 없음). 로드 전이면 요청 후 onReady(tk)
export const MAX_CHIPS_PER_SIDE = 5; // 서가 지도 장수 칩: 진영당 최대 5명 한 줄(사용자 2026-11-04 '한 줄, 주요 인물 5명만' — 이전 5명 x 2줄 대체)
const FLAG_REQ = new Set(); // 요청한 깃발 텍스처(같은 키 중복 로드 방지)
export function flagTex(scene, id, onReady = null) { return id ? uiImageTex(scene, `ui.flag.${id}`, onReady) : null; }
// ui.* 단일 이미지(스코프 로드 대상 아님) 지연 로드: 반환 = 텍스처 키(이미 있으면) | null. 로드 전이면 요청 후 onReady(tk)
export function uiImageTex(scene, lg, onReady = null) {
    const ent = loaded.manifest?.[lg];
    if (!ent) return null;
    const src = ent.path ? ent : loaded.manifest?.[ent.reuse_of] ?? null;
    if (!src?.path) return null;
    const tk = texKey(ent.reuse_of && !ent.path ? ent.reuse_of : lg);
    if (scene.textures.exists(tk)) return tk;
    if (onReady) {
        const done = (key) => { if (key !== tk) return; scene.load.off('filecomplete-image-' + tk, done); onReady(tk); };
        scene.load.on('filecomplete-image-' + tk, done);
        if (!FLAG_REQ.has(tk)) { FLAG_REQ.add(tk); scene.load.image(tk, withVer(src.path.startsWith('/') ? src.path : `/${src.path}`)); }
        if (!scene.load.isLoading()) scene.load.start();
    }
    return null;
}

// 칩 짧은 이름 규칙(makeChip)
export function chipShortName(name) {
    const base = String(name ?? '').replace(/\s*\(.*?\)\s*/g, ' ').trim();
    let w = base.split(/[\s·]+/).filter(Boolean);
    if (w.length < 2) return base;
    // 나라·왕조 접두('거란 성종' -> '성종', '수 양제' -> '양제', '금 선종' -> '선종'): 칩이 나라 이름만 남아 진영 칩처럼 보이던 문제(강화면 gacha52 ch11 '거란')
    if (/^(거란|금|수|당|송|원|명|청|고려|백제|신라|고구려|서하|요|위|오|촉|일본|조선)$/.test(w[0])) w = w.slice(1);
    if (w.length < 2) return w.join(' ');
    const pi = w.findIndex((x) => /의$/.test(x)); if (pi >= 0 && pi < w.length - 1) return w.slice(pi + 1).join(' '); // 몬페라토의 콘라도 -> 콘라도
    const ti = w.findIndex((x, i) => i > 0 && i < w.length - 1 && /^(백작|공작|후작|왕|황제|술탄|대공|공|칸)$/.test(x));
    if (ti >= 0) return w.length - ti - 1 <= 2 ? w.slice(ti + 1).join(' ') : w.slice(0, ti + 1).join(' '); // 트리폴리 백작 레몽 3세 -> 레몽 3세 / 서퍽 백작 윌리엄 드 라 폴 -> 서퍽 백작
    if (/^\d+세$/.test(w[1])) return `${w[0]} ${w[1]}`; // 필리프 2세 오귀스트 -> 필리프 2세
    if (w[0].length < 2) return base; // '기 드 뤼지냥' 처럼 첫 단어가 한 글자면 전체
    return w[0];
}
// 모바일 지도(저해상 variants.mobile) 사용 조건. 2026-11-14 성능: 가로 폰(L.short)도 phone 이면 모바일 지도(예전엔 데스크톱 4000px 판을 받아 메모리·다운로드 과다).
//  레이어는 지도 영역 비율에 맞춰 그려지므로 배치는 같고 해상도만 낮다. 롤백: settings.set({ landscapePhoneDesktopMap: true }) 후 새로고침
const mobileMap = () => L.portrait || (L.cls === 'phone' && !(L.short && settings.get().landscapePhoneDesktopMap === true));
// 레이어 논리 키(해상도 선택)
function layerLogical(lg) { if (!manifestHas(lg)) return null; return (mobileMap() ? variantKey(lg, 'mobile') : null) ?? lg; }
// 아이콘 논리 키(state: normal|locked|cleared, 고해상 x2)
function iconLogical(name, state = 'normal') {
    const lg = `map.icon.${name}`;
    if (!manifestHas(lg)) return null;
    const base = state === 'normal' ? '' : state;
    const pick = hiDpi() ? [base ? `${base}_x2` : 'x2', base].filter(Boolean) : [base].filter(Boolean);
    for (const n of pick) { const k = variantKey(lg, n); if (k) return k; }
    return lg;
}
const C = {
    oceanFallback: 0x0e1a2e, oceanAsset: 0xcfe8de, grid: COLOR.accent,
    road: 0x8a5a2b, roadHi: 0xc08a4a,
    gold: COLOR.accent, goldLight: COLOR.accentLight, locked: 0x6b7280, ink: 0x1a1406,
    ally: COLOR.ally, enemy: COLOR.danger, neutral: COLOR.muted,
};
const SIDE = { ally: { col: C.ally, prio: 3 }, enemy: { col: C.enemy, prio: 2 }, neutral: { col: C.neutral, prio: 1 } };
const ROLE_ORDER = { key: 0, companion: 1, enemy: 2 };
const reducedMotion = () => { try { return isInstant() || (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { return isInstant(); } };
const tex = (lg) => loaded.manifest?.[lg]?.textureKey ?? texKey(lg);
// 초상화가 manifest 에 있을 때만 요청(없는 파일 404·경고 방지). 없으면 null -> 이니셜 폴백
const portraitKnown = (code) => { if (!code) return false; const c = portraitCode(code); return manifestHas(`portrait.${c}`) || manifestHas(`portrait.${c}.thumb`); }; // NPC 별칭 포함
const stars = (n, max = 3) => '★'.repeat(Math.max(0, n)) + '☆'.repeat(Math.max(0, max - n));
let lastKey = null; // 탭 재진입 시 마지막 선택 캠페인

// Phaser 4 Mask 필터로 [0,w]x[0,h] 밖을 자른다(ScrollList.enableClip 과 같은 방식). WebGL 이 아니면 생략
function clipTo(obj, w, h) {
    const scene = obj.scene;
    if (!scene.renderer?.gl || typeof obj.enableFilters !== 'function') return;
    const r = new Phaser.GameObjects.Rectangle(scene, 0, 0, w, h, 0xffffff, 1).setOrigin(0);
    obj.enableFilters();
    obj.filters.external.addMask(r, false, scene.cameras.main, 'world');
    const tm = new Phaser.GameObjects.Components.TransformMatrix();
    const sync = () => { if (!obj.scene) return; const m = obj.getWorldTransformMatrix(tm); r.setPosition(m.tx, m.ty); const cw = w * m.scaleX; const ch = h * m.scaleY; if (r.width !== cw || r.height !== ch) r.setSize(cw, ch); };
    sync();
    scene.events.on('prerender', sync);
    obj.once('destroy', () => { scene.events.off('prerender', sync); r.destroy(); });
}

export class StageMapView extends Phaser.GameObjects.Container {
    // opts: x,y,w,h, model(buildCampaignMap 결과), onPick(stage), onProtagonist(), onGacha()(필수 영웅 부족 시 소집 바로가기, null=숨김), wide(bool), travel({plan, sample})
    // resume: 진행 중 전투 1건({stage_name, status, turn, ...}, 가장 최근) | null, onResume(battle): 요약 카드 출정 버튼 옆 '이어하기'
    constructor(scene, { x = 0, y = 0, w, h, model, onPick, onProtagonist, onGacha = null, resume = null, onResume = null, wide = true, travel = flatGlobeTravel }) {
        super(scene, x, y);
        scene.add.existing(this);
        this.W = w; this.H = h; this.model = model; this.onPick = onPick; this.onProtagonist = onProtagonist; this.onGacha = onGacha; this.travel = travel;
        this.resume = resume && onResume ? resume : null; this.onResume = onResume;
        // 좌우 배치: 호출 측 판정(wide) 또는 영역 자체가 충분히 가로로 길 때(예: 1571x1433 CSS = 논리 786폭, 세로 시트에 다 안 들어가던 경우)
        this.wideLayout = wide || (!L.portrait && w >= 740 && w >= h * 1.3);
        this.big = wide && L.cssW >= 1600; // (구) 1920급 판정 — 대표 초상은 portraitsOn()(지도 크기 기준)으로 대체
        this.fx = []; this.loops = []; this.travelTw = null; this.traveling = false;
        this.mode = 'shelf'; this.sel = null; this.roadN = 0;
        this.shelfPins = new Map(); this.stagePins = []; this.factionObjs = []; this.chipObjs = [];
        this.layoutRects();
        this.vb = worldView();
        // 지역판: hi = 항목(고해상), lo = variants.mobile(없으면 hi). pending = 요청 중인 논리 키
        this.regions = MAP_LOD.regions.map((r) => ({ ...r, b: normBounds(r.bounds) })).filter((r) => r.b && manifestHas(r.key))
            .map((r) => ({ ...r, hi: regionHi(r.key), lo: variantKey(r.key, 'mobile') ?? r.key, pending: new Set(), im: null }));
        this.lodState = null;
        this.battles = MAP_LOD.battles.filter((bt) => manifestHas(bt.key)).map((bt) => {
            const v = loaded.manifest[bt.key];
            const lm = v.landmask ?? null;
            return { ...bt, b: normBounds(v.bounds?.normalized ?? bt.bounds), lg: (mobileMap() ? variantKey(bt.key, 'mobile') : null) ?? bt.key, maskPath: (mobileMap() ? lm?.mobile?.path : null) ?? lm?.desktop?.path ?? null, im: null, mask: null, pending: false };
        }).filter((bt) => bt.b);
        this.terrData = null; this.terrKey = null; this.terrImg = null; this.terrTexN = 0; this.terrInfo = null;
        this.buildMap();
        this.buildSide();
        this.cam = this.cc({ x: 0.5, y: 0.5, z: 1 });
        this.buildShelfPins();
        this.applyCam(this.cam);
        this.loadMapAssets();
        const init = model.campaigns.find((c) => c.key === lastKey) ?? model.campaigns.find((c) => c.key === model.recKey) ?? model.campaigns[0];
        this.renderList();
        preloadPlaqueFonts();
        loadTerritories().then((d) => { if (!this.scene) return; this.terrData = d; this.updateTerritories(); }).catch((e) => console.warn('[StageMap] 영토 데이터 로드 실패(색칠 생략)', e));
        if (init) { if (reducedMotion()) this.select(init, { user: false }); else this.after(MAP_FX.entryDelayMs, () => this.select(init, { user: false })); }
        this.once('destroy', () => { this.hideChipTip(); this.cancelFx(); this.loops.forEach((t) => t.remove()); this.loops = []; this.dropTerrTex(); });
    }

    layoutRects() {
        const { W, H } = this;
        // 비율 규칙(하드코딩 대신): 가로 = 측면 패널 폭 max(320, 37%), 요약 높이는 H 가 낮으면 축소. 세로 = 시트 최소 높이(요약+목록 2행+출정 버튼)를
        // 먼저 확보하고 남는 만큼 지도(H 의 24~38%). 그래도 모자라면 compact(요약 본문 생략)
        if (this.wideLayout) {
            const sw = Math.min(Math.round(W * 0.45), Math.max(320, Math.round(W * 0.37)));
            const mw = W - sw - 14;
            this.R = { map: { x: 0, y: 0, w: mw, h: H }, side: { x: mw + 14, y: 0, w: sw, h: H } };
            this.R.chips = { x: 12, y: H - 86, w: mw - 24, h: 80, inMap: true };
            this.lowH = H < 420; // 폰 가로 등 낮은 화면: 요약 압축·칩 한 줄·높이 상한
            this.sumH = this.lowH ? Math.round(clamp(H - 36 - 2 * 58, 120, 168)) : H < 470 ? 168 : 232;
        } else {
            const chipsH = 124; // 대결 구도 2단(아군 줄 / 적군 줄, 0.72배) 또는 한 줄(가운데)
            const SHEET_MIN = 16 + 116 + 8 + 26 + 2 * 64 + 76;
            const mh = Math.max(Math.round(H * 0.24), Math.min(Math.round(H * 0.38), H - chipsH - 8 - SHEET_MIN));
            // 2026-11-14 모바일 개선: 지도 아래 따로 있던 장수 칩 줄(chipsH + 간격 4)을 지도에 합쳐 지도를 그만큼 세로로 늘리고, 칩은 지도 하단 반투명 띠 위 2단 오버레이(stack).
            //  시트(요약·목록·출정) 높이는 이전과 같다. 롤백 = localStorage srpg.mapChipsBelow=1(지도 아래 2단 줄)
            const below = (() => { try { return localStorage.getItem('srpg.mapChipsBelow') === '1'; } catch { return false; } })();
            const mapH = below ? mh : mh + chipsH + 4; const bandH = Math.min(136, Math.round(mapH * 0.45));
            this.R = { map: { x: 0, y: 0, w: W, h: mapH }, chips: below ? { x: 0, y: mh + 4, w: W, h: chipsH, inMap: false } : { x: 0, y: mapH - bandH, w: W, h: bandH, inMap: true, stack: true } };
            this.R.side = { x: 0, y: mh + chipsH + 8, w: W, h: H - mh - chipsH - 8 };
            this.compact = this.R.side.h < SHEET_MIN;
            this.sumH = this.compact ? 84 : 116;
        }
        this.vp = { w: this.R.map.w, h: this.R.map.h };
    }

    // ---------- 지도 ----------
    buildMap() {
        const s = this.scene; const m = this.R.map;
        this.mapBox = s.add.container(m.x, m.y);
        this.add(this.mapBox);
        this.ocean = s.add.rectangle(0, 0, m.w, m.h, C.oceanFallback, 1).setOrigin(0);
        this.rot = s.add.container(m.w / 2, m.h / 2);
        this.imgLayer = s.add.container(0, 0);
        this.gridG = s.add.graphics();
        this.borderLayer = s.add.container(0, 0); // decor.border(핀 위)
        this.roadG = s.add.graphics();
        this.factionLayer = s.add.container(0, 0);
        this.pinLayer = s.add.container(0, 0);
        this.labelLayer = s.add.container(0, 0); // 캠페인·허브 라벨(핀 위, 테두리 아래): 다른 핀에 글자가 가려지지 않게
        this.terrLayer = s.add.container(0, 0); // 영토(세력권) 색칠 + 국호 판: 지도(base·지역판) 위, 도로·핀 아래
        this.terrPlaques = s.add.container(0, 0);
        this.terrLayer.add(this.terrPlaques);
        this.rot.add([this.imgLayer, this.terrLayer, this.gridG, this.roadG, this.pinLayer, this.factionLayer, this.labelLayer, this.borderLayer]);
        this.overlay = s.add.container(0, 0); // 회전하지 않는 층: 큰 초상·라벨 플레이트·칩
        this.heroLayer = s.add.container(0, 0);
        this.plate = s.add.container(10, 10);
        this.overlay.add([this.heroLayer, this.plate]);
        // 영토 면책 문구(한 줄, 지도 우하단). 영토를 칠한 캠페인에서만 보인다
        this.terrNote = makeText(s, m.w - 8, m.h - 5, '', { size: 10, color: '#3a2a14', origin: [1, 1], stroke: { color: '#f4ecd8', width: 3 } }).setVisible(false);
        // 전장 지도(OSM 해안선, ODbL) 크레딧: 전장 지도가 보일 때만 좌하단 작은 글자
        this.overlay.add([this.terrNote]);
        this.mapBox.add([this.ocean, this.rot, this.overlay, s.add.rectangle(0, 0, m.w, m.h, 0, 0).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6)]);
        clipTo(this.mapBox, m.w, m.h);
        // 칩 줄(데스크톱 = 지도 하단 안, 세로 화면 = 지도 아래 가로 스와이프)
        const cr = this.R.chips;
        this.chipBox = s.add.container(cr.x, cr.y);
        (cr.inMap ? this.overlay : this).add(this.chipBox);
        if (!cr.inMap) {
            this.chipRow = s.add.container(8, 0);
            const hit = s.add.rectangle(0, 0, cr.w, cr.h, 0xffffff, 0).setOrigin(0).setInteractive();
            this.chipBox.add([s.add.rectangle(0, 0, cr.w, cr.h, COLOR.navyDeep, 0.7).setOrigin(0), this.chipRow, hit]);
            let sx = null; let start = 0;
            let moved = 0;
            hit.on('pointerdown', (p) => { sx = p.worldX; start = this.chipRow.x; moved = 0; });
            hit.on('pointermove', (p) => {
                if (sx == null || !p.isDown) { if (!p.isDown && !p.wasTouch) { const o = this.chipAt(p.worldX, p.worldY); if (o) { if (this.chipTip?.owner !== o) this.showChipTip(o); } else this.hideChipTip(); } return; } // 마우스 호버 툴팁
                moved = Math.max(moved, Math.abs(p.worldX - sx));
                if (moved > 8) this.hideChipTip();
                const min = Math.min(8, cr.w - 8 - (this.chipRow.contentW ?? 0)); this.chipRow.x = clamp(start + (p.worldX - sx), min, 8);
            });
            hit.on('pointerup', (p) => { if (sx != null && moved <= 8) { const o = this.chipAt(p.worldX, p.worldY); if (o) this.showChipTip(o, 3000); } sx = null; }); // 탭(드래그 아님) = 툴팁
            hit.on('pointerout', () => { sx = null; this.hideChipTip(); });
            clipTo(this.chipBox, cr.w, cr.h);
        } else {
            this.chipRow = s.add.container(0, 0);
            this.chipBox.add(this.chipRow);
        }
    }

    // 지도 에셋 지연 로드(스테이지 탭 진입 시, scope 'map' 중 필요한 것만). manifest 에 없으면 단순 모드(남색 바다 + 격자) 유지
    loadMapAssets() {
        this.layers = Object.fromEntries(Object.entries(layerKeys()).map(([n, lg]) => [n, layerLogical(lg)]));
        this.ui = { chip: manifestHas(UI_KEYS.chip) ? (hiDpi() ? variantKey(UI_KEYS.chip, 'x2') : null) ?? UI_KEYS.chip : null, ripple: manifestHas(UI_KEYS.ripple) ? UI_KEYS.ripple : null };
        const icons = new Set([iconLogical('pin_gem')]);
        this.model.campaigns.forEach((c) => c.stages.forEach((t) => {
            const nm = STAGE_ICON[t.s.code] ?? (t.pin ? null : 'library_tower');
            if (nm) icons.add(iconLogical(nm, this.stageState(t.s)));
        }));
        icons.add(iconLogical('library_tower'));
        const missing = Object.entries(layerKeys()).filter(([n]) => !this.layers[n]).map(([, lg]) => lg);
        if (missing.length) console.warn('[StageMap] manifest 에 지도 레이어 없음(단순 모드/생략):', missing.join(', '));
        // 단계 로드: 1) 베이스 지도 + 핀 아이콘(먼저 붙여 단순 모드 노출 시간 단축) 2) 오버레이·장식·UI. 각 단계 완료마다 다시 그린다
        const phase1 = [this.layers.base, ...icons].filter(Boolean);
        const phase2 = [this.layers.greatwall, this.layers.sea, this.layers.border, ...Object.values(this.ui)].filter(Boolean);
        // 지역판(LOD)은 여기서 받지 않는다: 캠페인 선택(줌 이동 시작) 때 ensureRegions 가 지연 로드
        this.loadPhase(phase1, () => this.loadPhase(phase2, () => { if (this.sel) this.ensureRegions(this.sel); }));
    }

    // 캠페인 초점·스테이지 핀이 지역판 bounds 안이면 그 지역판(lo 변형)을 지연 로드. 디코드·페더 처리 전에는 세계판만 보인다
    ensureRegions(c) {
        if (!c || !this.layerImg?.base) return; // 세계판이 아직이면 phase2 완료 후 다시 호출
        const pts = [c.focus, ...c.stages.map((t) => t.pin)].filter(Boolean);
        this.regions.filter((r) => pts.some((p) => inBounds(r.b, p.x, p.y))).forEach((r) => this.requestRegion(r, r.lo));
    }

    requestRegion(r, lg) {
        if (!lg || r.pending.has(lg) || this.regionReady(lg)) return;
        r.pending.add(lg);
        this.loadPhase([lg], null, () => { r.pending.delete(lg); this.attachRegion(r, lg); });
    }

    // 로드 완료: 가장자리 페더 텍스처를 만들고(원본 텍스처는 메모리 절약을 위해 제거) 상한이 풀렸으면 현재 대상 카메라로 다시 이동
    attachRegion(r, lg) {
        if (!this.scene) return;
        const zPrev = this.zMaxAt(this.cam); // 상한에 걸려 있었는지(사용자가 직접 옮긴 카메라는 건드리지 않기 위해)
        if (!this.bakeFeather(lg)) return;
        console.info(`[StageMap] LOD 지역판 준비: ${r.id} ${lg} (${this.srcW(lg)}px)`);
        this.updateTerritories(); // 육지 마스크를 지역판 기준으로 갱신
        this.redraw();
        if (!this.sel || this.traveling || this.cam.z < zPrev * 0.99) return;
        const target = this.mode === 'stages' ? this.stageCam(this.sel) : this.shelfCam(this.sel);
        if (target.z > this.cam.z * 1.01) this.travelTo(target, () => this.redraw());
    }

    featherKey(lg) { return `${tex(lg)}__feather`; }
    regionReady(lg) { return !!lg && !!this.scene?.textures.exists(this.featherKey(lg)); }
    // 가장자리 featherFrac 폭을 투명 -> 불투명 선형 그라데이션으로(가로·세로 곱). 캔버스 2D destination-in 2회
    bakeFeather(lg) {
        const s = this.scene; const fk = this.featherKey(lg);
        if (s.textures.exists(fk)) return fk;
        if (!this.texReady(lg)) return null;
        try {
            const src = s.textures.get(tex(lg)).getSourceImage();
            const w = src.width; const h = src.height; const f = MAP_LOD.featherFrac;
            const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
            const g = cv.getContext('2d');
            g.drawImage(src, 0, 0);
            g.globalCompositeOperation = 'destination-in';
            [[w, 0], [0, h]].forEach(([gx, gy]) => {
                const gr = g.createLinearGradient(0, 0, gx, gy);
                gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(f, 'rgba(0,0,0,1)'); gr.addColorStop(1 - f, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
                g.fillStyle = gr; g.fillRect(0, 0, w, h);
            });
            s.textures.addCanvas(fk, cv).setFilter(Phaser.Textures.FilterMode.LINEAR);
            s.textures.remove(tex(lg));
            return fk;
        } catch (e) { console.warn('[StageMap] 지역판 페더 처리 실패(세계판 유지)', lg, e); return null; }
    }

    // want(논리 키) 를 scope 별 ensureScope 로 받고 apply(기본 attachMapAssets). 받지 못한 키는 콘솔 경고(원인: 404·디코드 실패·씬 종료 등)
    loadPhase(want, next, apply = (w) => this.attachMapAssets(w)) {
        if (!this.scene) return;
        if (!want.length) { next?.(); return; }
        const scopes = [...new Set(want.map((lg) => scopeOf(lg, loaded.manifest[lg])))];
        let left = scopes.length; let allOk = true;
        // ensureScope 는 로더 전체 complete(동시에 받는 BGM 등 포함)를 기다린다 -> 베이스 지도 파일이 끝나는 즉시 먼저 붙인다
        const ld = this.scene.load; const baseKey = this.layers?.base ? tex(this.layers.base) : null;
        const early = (key) => {
            if (!this.scene || !baseKey || key !== baseKey || this.mapImg || !want.includes(this.layers.base)) return;
            try { apply(want.filter((lg) => this.texReady(lg))); } catch (e) { console.warn('[StageMap] 지도 에셋 적용 실패(단순 모드 유지)', e); }
        };
        const unhook = () => ld.off('filecomplete', early);
        if (baseKey) { ld.on('filecomplete', early); this.once('destroy', unhook); }
        const done = (ok) => {
            if (ok === false) allOk = false;
            left -= 1;
            if (left > 0) return;
            unhook();
            if (!this.scene) return;
            const lost = want.filter((lg) => !this.texReady(lg));
            if (lost.length) console.warn(`[StageMap] 지도 에셋 로드 실패 ${lost.length}건${allOk ? '' : '(로드 중단)'}:`, lost.map((lg) => `${lg} -> ${loaded.manifest?.[lg]?.path ?? '(manifest 없음)'}`).join(', '));
            try { apply(want); } catch (e) { console.warn('[StageMap] 지도 에셋 적용 실패(단순 모드 유지)', e); }
            next?.();
        };
        scopes.forEach((sc) => ensureScope(this.scene, sc, done, { filter: (lg) => want.includes(lg) }));
    }

    stageState(s) { return !stagePlayable(s) ? 'locked' : s.clear_count > 0 ? 'cleared' : 'normal'; }

    texReady(lg) { return !!lg && !!this.scene?.textures.exists(tex(lg)); }

    attachMapAssets(want) {
        const s = this.scene;
        // 회화풍 지도·아이콘: 선형 필터(전역 pixelArt NEAREST 계단 방지)
        want.forEach((lg) => { if (this.texReady(lg)) s.textures.get(tex(lg)).setFilter(Phaser.Textures.FilterMode.LINEAR); });
        // 단계 로드로 여러 번 불린다: 레이어별 1회만 만들고, 순서(base < greatwall < sea, border 는 핀 위 층)는 addAt 으로 유지
        if (this.texReady(this.layers.base) && s.renderer?.gl) {
            this.layerImg = this.layerImg ?? {};
            const order = ['base', 'greatwall', 'sea'];
            const add = (n) => {
                if (this.layerImg[n] || !this.texReady(this.layers[n])) return;
                const im = s.add.image(0, 0, tex(this.layers[n])).setOrigin(0);
                if (n === 'border') this.borderLayer.add(im);
                else this.imgLayer.addAt(im, order.slice(0, order.indexOf(n)).filter((k) => this.layerImg[k]).length);
                this.layerImg[n] = im;
            };
            ['base', 'greatwall', 'sea', 'border'].forEach(add);
            this.mapImg = this.layerImg.base;
            this.greatwall = this.layerImg.greatwall ?? null;
            this.mapImgs = Object.values(this.layerImg);
            this.ocean.setFillStyle(C.oceanAsset, 1);
        }
        this.assetsReady = true;
        // 이미 만든 핀을 에셋 버전으로 다시 만든다(선택 상태 유지)
        this.shelfPins.forEach((o) => o.destroy()); this.shelfPins.clear();
        this.loops.forEach((t) => t.remove()); this.loops = [];
        this.buildShelfPins();
        if (this.mode === 'stages' && this.sel) { const shown = this.stagePins.map((o) => o.shown); this.buildStagePins(this.sel); this.stagePins.forEach((o, i) => { o.shown = shown[i] ?? true; }); }
        this.updateTerritories();
        this.redraw();
    }

    // 좌표 -> rot 층 로컬(화면 중심 원점)
    P(x, y) { const p = project(this.cam, this.vp, x, y); return { x: p.sx - this.vp.w / 2, y: p.sy - this.vp.h / 2, sx: p.sx, sy: p.sy }; }
    inView(p, m = 30) { return p.sx > -m && p.sx < this.vp.w + m && p.sy > -m && p.sy < this.vp.h + m; }

    // ---------- LOD / 확대 상한 ----------
    // 원본 폭(px): 로드된 텍스처 > manifest size("WxH")
    srcW(lg) {
        if (this.regionReady(lg)) return this.scene.textures.get(this.featherKey(lg)).getSourceImage().width;
        if (this.texReady(lg)) { const im = this.scene.textures.get(tex(lg)).getSourceImage(); if (im?.width) return im.width; }
        const sz = loaded.manifest?.[lg]?.size;
        const w = Array.isArray(sz) ? Number(sz[0]) : Number(String(sz ?? '').split(/[x,]/)[0]);
        return w > 0 ? w : 0;
    }
    // 세계판 선명도 한계 z(베이스 레이어 없으면 = 단순 모드 벡터 격자 -> 무제한)
    worldCap() { const lg = layerLogical(layerKeys().base); return lg ? zSharp(this.srcW(lg), this.vb.x1 - this.vb.x0, this.vp.w, Number(L.u) || 1, MAP_LOD.worldMaxUpscale) : Infinity; }
    // 지역판 중 준비된 최고 해상 논리 키(없으면 null)
    regionBest(r) { return this.regionReady(r.hi) ? r.hi : this.regionReady(r.lo) ? r.lo : null; }
    // (x,y) 를 덮는 준비된 지역판(로드 전·영역 밖이면 null -> 세계판 상한 유지)
    regionAt(x, y) { return this.regions.find((r) => inBounds(r.b, x, y) && this.regionBest(r)) ?? null; }
    // 스테이지 보기에서 보이는 준비된 전장 지도(없으면 null)
    battleOn() { return this.mode === 'stages' && this.sel ? this.battles.find((bt) => bt.ch === this.sel.ch && this.texReady(bt.lg)) ?? null : null; }
    zMaxAt(cam) {
        const bt = this.battleOn();
        if (bt && inBounds(bt.b, cam.x, cam.y)) return Math.max(this.worldCap(), zSharp(this.srcW(bt.lg), bt.b.x1 - bt.b.x0, this.vp.w, Number(L.u) || 1, MAP_LOD.regionMaxUpscale));
        const r = this.regionAt(cam.x, cam.y);
        if (r) return Math.max(this.worldCap(), zSharp(this.srcW(this.regionBest(r)), r.b.x1 - r.b.x0, this.vp.w, Number(L.u) || 1, MAP_LOD.regionMaxUpscale));
        return this.worldCap();
    }
    // 카메라 제한: 선명도 상한 + cover/표시 영역(clampCam, MAP_VIEW). 핀·라벨은 같은 cam 으로 project 하므로 상한이 바뀌어도 지도와 어긋나지 않는다
    cc(cam) { const zm = this.zMaxAt(cam); return clampCam(Number.isFinite(zm) ? { ...cam, z: Math.min(cam.z, zm) } : cam, this.vp, this.vb); }

    // 지역판 배치·크로스페이드(redraw 마다). 불투명도 = screenPPD 선형(fadeFrom~fadeTo), 변형 = screenPPD <= hiPPD ? lo : hi
    updateLod() {
        if (!this.regions.length) return;
        const s = this.scene; const { cam } = this; const k = this.vp.w * cam.z;
        const ppd = screenPPD(cam, this.vp, Number(L.u) || 1);
        const a = lodAlpha(ppd, MAP_LOD.fadeFrom, MAP_LOD.fadeTo);
        const st = [];
        this.regions.forEach((r) => {
            const wantHi = ppd > MAP_LOD.hiPPD;
            if (wantHi && r.hi !== r.lo && a > 0 && this.regionReady(r.lo)) this.requestRegion(r, r.hi); // 고해상은 필요해질 때만
            const lg = wantHi ? this.regionBest(r) : (this.regionReady(r.lo) ? r.lo : this.regionBest(r));
            if (!lg) { r.im?.setVisible(false); return; }
            const fk = this.featherKey(lg);
            if (!r.im) {
                r.im = s.add.image(0, 0, fk).setOrigin(0);
                const bi = this.layerImg?.base ? this.imgLayer.getIndex(this.layerImg.base) + 1 : 0;
                this.imgLayer.addAt(r.im, bi); // 세계판 베이스 바로 위(장성·바다 아래). 세계판은 그대로 아래 유지
                r.im.once('destroy', () => { r.im = null; });
            } else if (r.im.texture.key !== fk) r.im.setTexture(fk);
            const tl = this.P(r.b.x0, r.b.y0);
            r.im.setPosition(tl.x, tl.y).setDisplaySize((r.b.x1 - r.b.x0) * k, (r.b.y1 - r.b.y0) * k / 2).setAlpha(a).setVisible(a > 0);
            st.push(`${r.id}:${lg === r.hi ? 'hi' : 'lo'}:${a <= 0 ? 'world' : a < 1 ? 'fade' : 'region'}`);
        });
        const state = st.join(' ') || 'world';
        if (state !== this.lodState) console.info(`[StageMap] LOD ppd=${ppd.toFixed(1)} ${state}`);
        this.lodState = state; this.lodPPD = ppd;
    }

    applyCam(cam, rot = 0, tiltY = 1) {
        this.cam = this.cc(cam);
        const os = overscan(this.vp, rot, tiltY);
        this.rot.setRotation(rot).setScale(os, os * tiltY);
        this.redraw();
    }

    redraw() {
        if (!this.scene) return;
        const { vp, cam } = this;
        const k = vp.w * cam.z;
        const tl = this.P(0, 0);
        // 세계판 레이어는 표시 영역(MAP_VIEW) 사각형에 늘려 그린다(기본 전체 [0,1])
        const vb = this.vb; const vtl = this.P(vb.x0, vb.y0);
        (this.mapImgs ?? []).forEach((im) => im.setPosition(vtl.x, vtl.y).setDisplaySize((vb.x1 - vb.x0) * k, (vb.y1 - vb.y0) * k / 2));
        this.greatwall?.setVisible(!!this.sel && GREATWALL_CH.has(this.sel.ch));
        // 격자(단순 모드에서만 진하게, 에셋 위에는 생략)
        const g = this.gridG.clear();
        if (!this.mapImg) {
            const step = gridStep(cam.z); const ov = Math.max(vp.w, vp.h) * 0.25;
            const y0 = clamp(tl.y, -vp.h / 2 - ov, vp.h / 2 + ov); const y1 = clamp(tl.y + k / 2, -vp.h / 2 - ov, vp.h / 2 + ov);
            const x0 = clamp(tl.x, -vp.w / 2 - ov, vp.w / 2 + ov); const x1 = clamp(tl.x + k, -vp.w / 2 - ov, vp.w / 2 + ov);
            for (let lon = -180; lon <= 180; lon += step) {
                const x = tl.x + ((lon + 180) / 360) * k;
                if (x < -vp.w / 2 - ov || x > vp.w / 2 + ov) continue;
                g.lineStyle(1, C.grid, lon === 0 ? 0.22 : 0.09).lineBetween(x, y0, x, y1);
            }
            for (let lat = -90; lat <= 90; lat += step) {
                const y = tl.y + ((90 - lat) / 180) * (k / 2);
                if (y < -vp.h / 2 - ov || y > vp.h / 2 + ov) continue;
                g.lineStyle(1, C.grid, lat === 0 ? 0.22 : 0.09).lineBetween(x0, y, x1, y);
            }
        }
        this.updateLod();
        this.layoutBattle();
        this.roadG.clear();
        this.layoutShelfPins();
        this.layoutStagePins();
        this.layoutTerritories(); // 핀 위치 확정 후(판이 핀을 피한다)
        this.drawRoads();
        this.layoutFactions();
        this.placeEmblem();
    }

    // ---------- 핀 ----------
    // 파동 링: ui.ripple 이미지(안아트, scale 0.6 -> 1.4) 또는 코드 원(0.4 -> 1.8)
    makeRing() {
        const s = this.scene;
        if (this.texReady(this.ui?.ripple)) { const im = s.add.image(0, 0, tex(this.ui.ripple)); const b = 48 / Math.max(1, im.width); im.s0 = b * 0.6; im.s1 = b * 1.4; return im.setAlpha(0); }
        const g = s.add.graphics(); g.lineStyle(2, C.goldLight, 1).strokeCircle(0, 0, 14); g.s0 = 0.4; g.s1 = 1.8; return g.setAlpha(0);
    }

    // icon: 랜드마크/핀 아이콘 논리 키(로드돼 있으면 이미지, 기준점 아래 가운데 접지 그림자 y 0.9). 없으면 코드 핀(물방울)
    makePin({ fill, label = '', r = 9, onTap, icon = null, iconH = 40, dim = false, soon = false }) {
        const s = this.scene;
        const o = s.add.container(0, 0);
        const useIcon = this.texReady(icon);
        const shadow = s.add.ellipse(0, 0, r * 1.8, r * 0.7, 0x000000, useIcon ? 0 : 0.35);
        const ring = this.makeRing();
        const pulse = this.makeRing();
        const body = s.add.container(0, 0);
        let hy = -r * 1.9;
        if (useIcon) {
            const im = s.add.image(0, 0, tex(icon)).setOrigin(0.5, 0.9);
            im.setScale(iconH / Math.max(1, im.height));
            if (dim) im.setTint(0x8a8f99).setAlpha(0.85);
            else if (soon) im.setAlpha(0.62);
            body.add(im);
            hy = -iconH * 0.62;
            if (label) { // 번호 배지(아이콘 우상단)
                const bx = iconH * 0.32; const by = -iconH * 0.78; const br = 9;
                const g = s.add.graphics(); g.fillStyle(fill, 1).fillCircle(bx, by, br).lineStyle(1.5, C.ink, 0.9).strokeCircle(bx, by, br);
                body.add([g, makeText(s, bx, by, label, { size: 11, bold: true, color: '#1A1406', origin: [0.5, 0.5] })]);
            }
        } else {
            const gg = s.add.graphics().setAlpha(soon ? 0.62 : 1);
            gg.fillStyle(fill, 1).fillCircle(0, hy, r).fillTriangle(-r * 0.8, hy + r * 0.55, r * 0.8, hy + r * 0.55, 0, 0);
            gg.lineStyle(1.5, C.ink, 0.9).strokeCircle(0, hy, r);
            body.add(gg);
            if (label) body.add(makeText(s, 0, hy, label, { size: Math.round(r * 1.15), bold: true, color: '#1A1406', origin: [0.5, 0.5] }));
            else { const d = s.add.graphics(); d.fillStyle(C.ink, 0.9).fillCircle(0, hy, r * 0.38); body.add(d); }
        }
        o.add([shadow, ring, pulse, body]);
        if (soon) { // '곧 공개': 핀 머리 둘레 은은한 점선 링(잠김 회색과 구분)
            const rr = useIcon ? iconH * 0.46 : r + 5; const dg = s.add.graphics(); const n = 14;
            dg.lineStyle(1.6, C.goldLight, 0.85);
            for (let i = 0; i < n; i += 1) { const a0 = (i / n) * Math.PI * 2; dg.beginPath(); dg.arc(0, hy, rr, a0, a0 + (Math.PI / n) * 1.1, false); dg.strokePath(); }
            body.add(dg);
        }
        o.pinBody = body; o.ring = ring; o.pulse = pulse; o.shadow = shadow; o.r = r;
        if (onTap) {
            const hit = s.add.rectangle(0, hy * 0.7, Math.max(36, r * 3.4), Math.max(44, r * 4.6), 0xffffff, 0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', (p) => { if (s.modalCount > 0 || p.getDistance() > 12) return; onTap(); });
            o.add(hit);
        }
        return o;
    }

    buildShelfPins() {
        this.model.campaigns.filter((c) => c.pinAt ?? c.focus).forEach((c) => {
            const soon = !!c.preview;
            const o = this.makePin({ fill: c.unlocked || soon ? C.gold : C.locked, onTap: () => this.select(c), icon: iconLogical('pin_gem'), iconH: 34, dim: !c.unlocked && !soon, soon });
            const lb = this.makeMapLabel({ color: c.unlocked ? '#f0d58c' : soon ? '#e8dcb8' : CSS.muted });
            o.label = lb; o.once('destroy', () => lb.destroy());
            this.pinLayer.add(o);
            this.shelfPins.set(c.key, o);
            if (c.key === this.model.recKey && c.unlocked) this.loopPulse(o);
        });
        this.buildHiddenPin();
    }

    // 숨은 종장 잠김 핀: 지리 위치를 쓰지 않는 화면 고정 표식(지도 오른쪽 위). '아직 열리지 않은 책장' + 진행도 N/M. 누르면 그 항목 선택(요약에 안내)
    buildHiddenPin() {
        this.hiddenPin?.destroy(); this.hiddenPin = null;
        const c = this.model.campaigns.find((x) => x.hiddenLocked);
        if (!c) return;
        const s = this.scene;
        const o = s.add.container(0, 0);
        const t1 = makeText(s, 0, 0, '아직 열리지 않은 책장', { size: 12, bold: true, color: '#e8dcb8', origin: [1, 0], stroke: { color: '#0B1020', width: 3 } });
        const t2 = makeText(s, 0, t1.height + 2, `${c.cleared} / ${c.total}`, { size: 14, bold: true, color: '#f0d58c', origin: [1, 0], stroke: { color: '#0B1020', width: 3 } });
        const w = Math.max(t1.width, t2.width) + 34; const h = t1.height + t2.height + 12;
        const g = s.add.graphics().fillStyle(COLOR.ink, 0.78).fillRoundedRect(-w + 6, -6, w, h, 8).lineStyle(1, COLOR.accent, 0.55).strokeRoundedRect(-w + 6, -6, w, h, 8);
        // 자물쇠(코드 그림): 고리 + 몸통
        const lk = s.add.graphics(); const lx = -w + 18; const ly = h / 2 - 6;
        lk.lineStyle(2, 0xd9c08a, 1).strokeCircle(lx, ly - 4, 4); lk.fillStyle(0xd9c08a, 1).fillRoundedRect(lx - 6, ly - 2, 12, 10, 2);
        const hit = s.add.rectangle(-w + 6, -6, w, Math.max(h, 40), 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', (p) => { if (s.modalCount > 0 || p.getDistance() > 12) return; this.select(c); });
        o.add([g, lk, t1, t2, hit]);
        o.w0 = w; o.h0 = h;
        this.overlay.add(o);
        this.hiddenPin = o;
        this.layoutHiddenPin();
    }

    // 라벨 플레이트(좌상단)와 가로로 겹치면(가로 폰 667x375 등 좁은 지도) 플레이트 아래로 내린다. 겹치지 않는 화면은 기존 위치(오른쪽 위 14) 그대로
    layoutHiddenPin() {
        const o = this.hiddenPin; if (!o) return;
        const pr = this.plateRect; let y = 14;
        if (pr && this.plate?.visible && pr.x + pr.w / 2 + 6 > this.vp.w - 10 - o.w0) y = pr.y + pr.h / 2 + 12;
        o.setPosition(this.vp.w - 16, y); o.setVisible(this.mode === 'shelf');
    }

    loopPulse(o) {
        const { s0, s1 } = o.pulse;
        if (reducedMotion()) { o.pulse.setAlpha(0.6).setScale((s0 + s1) / 2); return; }
        o.pulse.setScale(s0).setAlpha(1);
        this.loops.push(this.scene.tweens.add({ targets: o.pulse, scale: s1, alpha: 0, duration: 1500, repeat: -1, ease: 'Sine.easeOut' }));
    }

    layoutShelfPins() {
        const show = this.mode === 'shelf';
        this.layoutHiddenPin();
        const pts = [];
        this.shelfPins.forEach((o, key) => {
            const c = this.model.campaigns.find((x) => x.key === key);
            const at = c.pinAt ?? c.focus; const p = this.P(at.x, at.y);
            o.true = p;
            const vis = show && this.inView(p);
            o.setVisible(vis);
            if (vis) pts.push({ id: key, sx: p.sx, sy: p.sy });
            o.label.setLabel(vis && c === this.sel ? (c.preview ? `${c.title} · 준비 중` : c.title) : '');
        });
        const off = declutter(pts, { minDist: 22, ring: 24 });
        pts.forEach((pt) => {
            const o = this.shelfPins.get(pt.id); const d = off.get(pt.id);
            o.setPosition(o.true.x + d.dx, o.true.y + d.dy);
            if (d.spread) this.roadG.lineStyle(1, C.goldLight, 0.5).lineBetween(o.true.x, o.true.y, o.x, o.y).fillStyle(C.goldLight, 0.8).fillCircle(o.true.x, o.true.y, 2);
        });
        // 라벨 배치: 핀 머리 위(기본) -> 아래 -> 오른쪽 -> 왼쪽 중 다른 보이는 핀과 덜 겹치는 자리
        const shown = pts.map((pt) => this.shelfPins.get(pt.id));
        shown.forEach((o) => { if (o.label.visible) this.placeMapLabel(o.label, o.x, o.y, shown.filter((q) => q !== o)); });
    }

    // 지도 라벨(반투명 플레이트 + 글자). labelLayer 에 두어 핀보다 항상 위에 그린다
    makeMapLabel({ color = '#f0d58c', size = 13 } = {}) {
        const s = this.scene;
        const o = s.add.container(0, 0);
        const bg = s.add.graphics();
        const t = makeText(s, 0, 0, '', { size, bold: true, color, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
        o.add([bg, t]);
        o.lw = 0; o.lh = 0;
        o.setLabel = (str) => {
            if (o.str === str) return o;
            o.str = str; t.setText(str); bg.clear();
            o.lw = str ? t.width + 12 : 0; o.lh = str ? t.height + 4 : 0;
            if (str) bg.fillStyle(COLOR.navyDeep, 0.72).fillRoundedRect(-o.lw / 2, -o.lh / 2, o.lw, o.lh, 5).lineStyle(1, C.goldLight, 0.35).strokeRoundedRect(-o.lw / 2, -o.lh / 2, o.lw, o.lh, 5);
            return o.setVisible(!!str);
        };
        o.setVisible(false);
        this.labelLayer.add(o);
        return o;
    }

    // 핀(x, y = 접지점) 기준 후보 자리 중 다른 핀 사각형(머리 포함 28x40)과 겹침이 가장 적은 곳에 라벨 중심을 둔다
    placeMapLabel(lb, x, y, others) {
        const hw = lb.lw / 2; const hh = lb.lh / 2;
        const cands = [[0, -38 - hh], [0, 8 + hh], [18 + hw, -16], [-18 - hw, -16]];
        const ov = (cx, cy) => others.reduce((a, q) => {
            const ox = Math.max(0, Math.min(cx + hw, q.x + 14) - Math.max(cx - hw, q.x - 14));
            const oy = Math.max(0, Math.min(cy + hh, q.y + 4) - Math.max(cy - hh, q.y - 36));
            return a + ox * oy;
        }, 0);
        let best = cands[0]; let bv = Infinity;
        cands.forEach(([dx, dy]) => { const v = ov(x + dx, y + dy); if (v < bv - 1) { bv = v; best = [dx, dy]; } });
        lb.setPosition(x + best[0], y + best[1]);
    }

    buildStagePins(c) {
        this.clearStagePins();
        const recId = this.model.recStageId;
        c.stages.forEach((t, i) => {
            if (!t.pin) return; // 지도 좌표 없는 스테이지는 목록에만(가상 스테이지는 campaignMapData.VIRTUAL_PINS 보정 위치로 핀 표시)
            const s0 = t.s;
            const fill = !stagePlayable(s0) ? C.locked : s0.clear_count > 0 ? C.goldLight : C.gold;
            const nm = STAGE_ICON[s0.code];
            const o = this.makePin({ fill, label: String(t.no), r: 11, onTap: () => { if (!c.preview) { this.pickTerr(s0); this.onPick?.(s0); } }, icon: t.pin && nm ? iconLogical(nm, this.stageState(s0)) : null, iconH: 40 });
            o.t = t;
            o.setVisible(false); o.shown = false;
            if (t.radius) { const rg = this.scene.add.graphics(); o.addAt(rg, 0); o.rad = rg; }
            this.pinLayer.add(o);
            this.stagePins.push(o);
            if (recId && s0.id === recId) o.isRec = true;
            o.order = i;
        });
    }

    clearStagePins() { this.stagePins.forEach((o) => o.destroy()); this.stagePins = []; this.roadN = 0; }

    layoutStagePins() {
        // 남해안처럼 촘촘한 핀은 묶음 둘레로 펼치고 실제 위치까지 지시선(핀 머리 지름 22 + 여유)
        const real = this.stagePins.filter((o) => o.t.pin).map((o) => { const p = this.P(o.t.pin.x, o.t.pin.y); return { id: o.order, sx: p.sx, sy: p.sy }; });
        const off = declutter(real, { minDist: 28, ring: 26 });
        this.stagePins.forEach((o) => {
            const q = this.P(o.t.pin.x, o.t.pin.y); const d = off.get(o.order) ?? { dx: 0, dy: 0, spread: false };
            const p = { x: q.x + d.dx, y: q.y + d.dy, sx: q.sx + d.dx, sy: q.sy + d.dy };
            o.truePt = q;
            if (d.spread && o.shown && this.mode === 'stages') this.roadG.lineStyle(1, C.goldLight, 0.6).lineBetween(q.x, q.y, p.x, p.y).fillStyle(C.goldLight, 0.9).fillCircle(q.x, q.y, 2.5);
            o.setPosition(p.x, p.y);
            o.setVisible(this.mode === 'stages' && o.shown && this.inView(p, 10));
            if (o.rad) { const rp = o.t.radius * this.vp.w * this.cam.z; o.rad.clear(); if (rp > 14) o.rad.fillStyle(C.goldLight, 0.08).fillCircle(0, 0, rp).lineStyle(1, C.goldLight, 0.35).strokeCircle(0, 0, rp); }
        });
    }

    // 도로선: 선택 캠페인의 스테이지 핀을 순서대로(캠페인 보기 = 옅은 실선, 스테이지 보기 = 점선 순차 공개)
    drawRoads() {
        const c = this.sel;
        if (!c || !c.stages.length) return;
        const g = this.roadG;
        // 스테이지 보기: 펼친 핀 위치끼리 연결 / 캠페인 보기: 실제 좌표끼리
        const pts = c.stages.map((t) => {
            if (this.mode !== 'stages') return t.pin ? this.P(t.pin.x, t.pin.y) : null;
            // 지도 좌표 없는 스테이지는 도로선에서 제외
            const o = t.pin ? this.stagePins.find((x) => x.t === t) : null; return o ? { x: o.x, y: o.y } : null;
        });
        const n = this.mode === 'stages' ? this.roadN : pts.length;
        let prev = null;
        // 인접 스테이지끼리 한 번씩만(prev -> p) 곡선으로. 진행 방향 오른쪽으로 휘게 해 북상(진주->평양)·남하(평양->행주->노량) 구간이 같은 직선 위에 겹쳐 두 줄 평행선처럼 보이던 현상을 분리
        for (let i = 0; i < pts.length && i < n; i += 1) {
            const p = pts[i];
            if (!p) continue;
            if (prev) {
                const curve = this.roadCurve(prev, p);
                if (this.mode === 'stages') this.dash(g, curve, C.roadHi, 0.95, 2.5);
                else if (curve.length > 1) g.lineStyle(2, C.road, 0.45).strokePoints(curve, false);
            }
            prev = p;
        }
    }

    // 2차 베지어(제어점 = 중점 + 진행 방향 오른쪽 법선 * 길이 비율) 샘플 점열
    roadCurve(a, b, bend = 0.2) {
        const dx = b.x - a.x; const dy = b.y - a.y; const d = Math.hypot(dx, dy);
        if (d < 1) return [];
        const cx = (a.x + b.x) / 2 - dy * bend; const cy = (a.y + b.y) / 2 + dx * bend;
        const n = clamp(Math.ceil(d / 4), 8, 160);
        const out = [];
        for (let i = 0; i <= n; i += 1) {
            const t = i / n; const u = 1 - t;
            out.push(new Phaser.Math.Vector2(u * u * a.x + 2 * u * t * cx + t * t * b.x, u * u * a.y + 2 * u * t * cy + t * t * b.y));
        }
        return out;
    }

    // 점열을 따라 점선(밑에 어두운 테두리 1회 + 길이 기준 on/off 대시)
    dash(g, pts, col, alpha, wdt, on = 7, off = 5) {
        if (pts.length < 2) return;
        g.lineStyle(wdt + 2, 0x1a1406, alpha * 0.45).strokePoints(pts, false);
        g.lineStyle(wdt, col, alpha);
        const per = on + off; let acc = 0;
        for (let i = 1; i < pts.length; i += 1) {
            const a = pts[i - 1]; const b = pts[i]; const d = Math.hypot(b.x - a.x, b.y - a.y);
            if (d <= 0) continue;
            // 이 구간 [acc, acc+d] 중 대시(on) 부분만 그린다
            let s = acc;
            while (s < acc + d) {
                const ph = s % per; const segEnd = ph < on ? Math.min(acc + d, s + (on - ph)) : Math.min(acc + d, s + (per - ph));
                if (ph < on) { const t0 = (s - acc) / d; const t1 = (segEnd - acc) / d; g.lineBetween(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0, a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1); }
                s = Math.max(segEnd, s + 1e-3); // 부동소수 정체 방지
            }
            acc += d;
        }
    }

    // ---------- 영토(세력권) 색칠: shelf_territories.json ----------
    // 선택 캠페인(스테이지 보기 = 출정 대상 스테이지의 stage_overrides)의 세력 폴리곤을 오프스크린 캔버스에 칠하고,
    // 지도 텍스처(지역판 > 세계판)의 색 임계값으로 만든 육지 마스크로 바다 부분을 잘라 한 장의 텍스처로 올린다(terrLayer, 지도 위·도로 아래).
    // 영토(전황) 기준 스테이지: 스테이지 보기 + 서가 보기 모두 '다음 출정(또는 복습) 스테이지'의 stage_overrides 를 쓴다 -> 진행에 따라 전황이 바뀐다
    //   (예 ch1: 첫 진입 = 1592년 5월 한성까지 점령, 이후 평양 선 -> 1593 탈환 -> 1597~98 해안). 출정 대상이 없으면 캠페인 기본 레이어
    // 사용자가 스테이지(핀·목록)를 고르면 그 스테이지 전황(terrPick, 캠페인을 바꾸면 해제) — 전부 클리어한 계정도 단계별 전황을 볼 수 있다(강화면 33회차)
    terrStageCode() { return this.sel ? (this.terrPick?.key === this.sel.key ? this.terrPick.code : null) ?? sortieOf(this.sel).stage?.code ?? null : null; }
    pickTerr(st) { if (!this.sel || !st?.code) return; this.terrPick = { key: this.sel.key, code: st.code }; this.updateTerritories(); }

    // 육지 마스크 원천: range 를 다 덮는 준비된 지역판(페더 캔버스) > 세계판 베이스. 베이스 레이어가 manifest 에 아예 없으면 'none'(마스크 없이), 로드 전이면 null(대기)
    // ---------- 전장 지도(스테이지 보기) ----------
    ensureBattle(c) {
        const bt = this.battles.find((x) => x.ch === c?.ch);
        if (!bt || bt.pending || (this.texReady(bt.lg) && (bt.mask || !bt.maskPath))) return;
        bt.pending = true;
        let left = bt.maskPath ? 2 : 1;
        const done = () => {
            left -= 1; if (left > 0 || !this.scene) return;
            bt.pending = false;
            if (!this.texReady(bt.lg)) return;
            this.scene.textures.get(tex(bt.lg)).setFilter(Phaser.Textures.FilterMode.LINEAR);
            console.info(`[StageMap] 전장 지도 준비: ${bt.id} ${bt.lg}${bt.mask ? ' + landmask' : ''}`);
            this.terrKey = null; this.updateTerritories(); // 육지 마스크를 전장 landmask 로
            this.redraw();
            if (this.mode === 'stages' && this.sel === c && !this.traveling) this.travelTo(this.stageCam(c), () => this.redraw()); // 상한이 풀렸으니 다시 맞춤
        };
        this.loadPhase([bt.lg], null, done);
        if (bt.maskPath) {
            const im = new Image();
            im.onload = () => { bt.mask = im; done(); };
            im.onerror = () => { console.warn('[StageMap] 전장 landmask 로드 실패(색 임계값 마스크 사용)', bt.maskPath); done(); };
            im.src = withVer(bt.maskPath.startsWith('/') ? bt.maskPath : `/${bt.maskPath}`);
        }
    }

    // 지도 하단 글자: 면책 문구(우하단, 좁으면 2줄 줄바꿈 — 말줄임 없음) + OSM 크레딧(전장 지도일 때 좌하단)
    layoutNotes() {
        // 저작권 표기(OpenStreetMap) 제거(사용자 요청 2026-11-04) — 지형 출처 문구만 오른쪽 아래
        if (!this.terrNoteStr) return;
        const room = this.vp.w - 16;
        this.terrNote.setWordWrapWidth(null).setText(this.terrNoteStr).setAlign('right');
        if (this.terrNote.width > room) this.terrNote.setWordWrapWidth(room, true);
        fitText(this.terrNote, room, { maxLines: 2 });
    }

    layoutBattle() {
        const on = this.battleOn();
        if (!!on !== this.osmOn) { this.osmOn = !!on; this.layoutNotes(); }
        this.battles.forEach((bt) => {
            if (bt !== on) { bt.im?.setVisible(false); return; }
            if (!bt.im) { bt.im = this.scene.add.image(0, 0, tex(bt.lg)).setOrigin(0); this.imgLayer.add(bt.im); bt.im.once('destroy', () => { bt.im = null; }); }
            const k = this.vp.w * this.cam.z; const tl = this.P(bt.b.x0, bt.b.y0);
            bt.im.setPosition(tl.x, tl.y).setDisplaySize((bt.b.x1 - bt.b.x0) * k, (bt.b.y1 - bt.b.y0) * k / 2).setVisible(true);
        });
    }

    terrMaskSrc(rg) {
        const bt = this.battleOn();
        if (bt?.mask && rg.x0 >= bt.b.x0 - 1e-6 && rg.x1 <= bt.b.x1 + 1e-6 && rg.y0 >= bt.b.y0 - 1e-6 && rg.y1 <= bt.b.y1 + 1e-6) return { id: `landmask:${bt.id}`, img: bt.mask, b: bt.b, alpha: true };
        const r = this.regions.find((x) => this.regionBest(x) && rg.x0 >= x.b.x0 && rg.x1 <= x.b.x1 && rg.y0 >= x.b.y0 && rg.y1 <= x.b.y1);
        if (r) { const lg = this.regionBest(r); return { id: lg, img: this.scene.textures.get(this.featherKey(lg)).getSourceImage(), b: r.b }; }
        if (this.texReady(this.layers?.base)) return { id: 'world', img: this.scene.textures.get(tex(this.layers.base)).getSourceImage(), b: this.vb };
        return this.layers && !this.layers.base ? { id: 'none' } : null;
    }

    updateTerritories() {
        if (!this.scene) return;
        const c = this.sel;
        let info = null;
        try { info = c && this.terrData ? territoriesFor(this.terrData, c.key, this.terrStageCode()) : null; } catch (e) { console.warn('[StageMap] 영토 데이터 해석 실패(색칠 생략)', e); }
        if (!info?.factions.length) { this.clearTerritories(); return; }
        let rg = info.range;
        if (!rg) { const ps = info.factions.flatMap((f) => f.polys.flatMap((p) => p.pts)); rg = { x0: Math.min(...ps.map((p) => p.x)), x1: Math.max(...ps.map((p) => p.x)), y0: Math.min(...ps.map((p) => p.y)), y1: Math.max(...ps.map((p) => p.y)) }; }
        if (!(rg.x1 > rg.x0 && rg.y1 > rg.y0)) { this.clearTerritories(); return; }
        const src = this.terrMaskSrc(rg);
        if (!src) return; // 지도 텍스처 로드 후(attachMapAssets) 다시 호출된다
        const key = `${c.key}|${this.terrStageCode()}|${src.id}`;
        if (key === this.terrKey) return;
        const t0 = performance.now();
        const cv = this.bakeTerritories(info, rg, src);
        if (!cv) return;
        const s = this.scene; const tk = `stagemap_terr_${(this.terrTexN += 1)}`;
        s.textures.addCanvas(tk, cv).setFilter(Phaser.Textures.FilterMode.LINEAR);
        const old = this.terrImg?.texture?.key;
        if (!this.terrImg) { this.terrImg = s.add.image(0, 0, tk).setOrigin(0); this.terrLayer.addAt(this.terrImg, 0); } else this.terrImg.setTexture(tk);
        if (old && old !== tk && s.textures.exists(old)) s.textures.remove(old);
        this.terrKey = key; this.terrRange = rg; this.terrInfo = info;
        this.buildPlaques(info);
        // 영토 면책 문구는 화면에서 뺐다(2026-11-02 사용자 요청, 공개 전 고지 위치 검토 메모: docs/PRE_RELEASE_NOTICES.md). terrNote 객체는 비워 둔 채 유지
        this.terrNoteStr = '';
        this.layoutNotes();
        this.terrNote.setVisible(false);
        console.info(`[StageMap] 영토 ${key} 세력 ${info.factions.length} (${Math.round(performance.now() - t0)}ms)`);
        this.layoutTerritories();
    }

    bakeTerritories(info, rg, src) {
        try {
            const dx = rg.x1 - rg.x0; const dy = rg.y1 - rg.y0;
            const W = 1280; const H = Math.max(16, Math.round(W * (dy / 2) / dx)); // 표시 비율 = dx : dy/2(등장방형 k, k/2)
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d');
            const px = (p) => [(p.x - rg.x0) / dx * W, (p.y - rg.y0) / dy * H];
            info.factions.forEach((f) => f.polys.forEach((poly) => {
                const low = poly.conf === 'low';
                const ov = /_(occ|front)_/.test(String(f.id ?? '')); // 점령·진군 덧칠 레이어: 채움·선 한 단계 진하게(강화면 33회차: 한성까지 점령이 한눈에). 다른 세력 레이어는 그대로
                g.beginPath();
                poly.pts.forEach((p, i) => { const [x, y] = px(p); if (i) g.lineTo(x, y); else g.moveTo(x, y); });
                g.closePath();
                g.globalAlpha = ov ? 0.4 : low ? 0.22 : 0.32; g.fillStyle = f.color; g.fill();
                g.globalAlpha = ov ? 0.95 : low ? 0.8 : poly.conf === 'high' ? 0.9 : 0.7; g.strokeStyle = f.color; g.lineWidth = ov ? 3.5 : low ? 2.5 : 3;
                g.setLineDash(low ? [10, 7] : []); g.stroke();
            }));
            g.globalAlpha = 1; g.setLineDash([]);
            if (src.img) {
                // 육지 마스크(저해상): 바다 = 연한 민트/흰색(r-b 약 -5), 육지 = 주황 양피지(r-b 100 이상). r-b 15~45 를 선형 알파(해안 관대)
                const MW = 480; const MH = Math.max(8, Math.round(MW * H / W));
                const mk = document.createElement('canvas'); mk.width = MW; mk.height = MH;
                const mg = mk.getContext('2d', { willReadFrequently: true });
                const iw = src.img.width; const ih = src.img.height; const bw = src.b.x1 - src.b.x0; const bh = src.b.y1 - src.b.y0;
                mg.drawImage(src.img, (rg.x0 - src.b.x0) / bw * iw, (rg.y0 - src.b.y0) / bh * ih, dx / bw * iw, dy / bh * ih, 0, 0, MW, MH);
                const id = mg.getImageData(0, 0, MW, MH); const d = id.data;
                for (let i = 0; i < d.length; i += 4) {
                    if (src.alpha) { d[i] = 0; d[i + 1] = 0; d[i + 2] = 0; continue; } // landmask: 알파 = 육지 그대로
                    const v = Math.max(0, Math.min(1, (d[i] - d[i + 2] - 15) / 30));
                    d[i + 3] = Math.round(v * d[i + 3]); d[i] = 0; d[i + 1] = 0; d[i + 2] = 0;
                }
                mg.putImageData(id, 0, 0);
                g.globalCompositeOperation = 'destination-in';
                g.imageSmoothingEnabled = true;
                g.drawImage(mk, 0, 0, W, H);
            }
            // 범위 가장자리 페더(전장 범위 밖 클리핑 경계가 칼선으로 보이지 않게)
            g.globalCompositeOperation = 'destination-in';
            const f = 0.03;
            [[W, 0], [0, H]].forEach(([gx, gy]) => {
                const gr = g.createLinearGradient(0, 0, gx, gy);
                gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(f, 'rgba(0,0,0,1)'); gr.addColorStop(1 - f, 'rgba(0,0,0,1)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
                g.fillStyle = gr; g.fillRect(0, 0, W, H);
            });
            g.globalCompositeOperation = 'source-over';
            return cv;
        } catch (e) { console.warn('[StageMap] 영토 색칠 실패(생략)', e); return null; }
    }

    // 국호 판: 큰 글자 = 현지 국호(plaque.native, 자국 문자·전용 웹폰트) / 없으면 기존 plaque.text. 작은 글자 = 한글 국호(plaque.ko > name_period).
    // 현지 문자 폰트(plaqueFonts.js)가 로드되기 전·실패·서브셋에 글자 없음이면 한글을 큰 글자로 그리고(두부 방지), 로드가 끝나면 현지 문자로 다시 그린다.
    // 판 없는 보조 세력은 label_caption 작은 캡션
    buildPlaques(info) {
        this.terrPlaques.removeAll(true);
        const faces = info.factions.map((f) => (f.native ? plaqueFace(f.nativeScript, f.nativeLang) : f.plaque ? plaqueFace(f.plaqueScript, '') : null));
        const alts = info.factions.map((f) => (f.native && f.nativeAlt ? plaqueFace(f.nativeAltScript, f.nativeAltLang) : null)); // 현지 폰트 실패 시 대체 표기(예: 몽골 문자 -> 大蒙古國)
        const ids = [...new Set([...faces, ...alts].filter((fc) => fc?.id).map((fc) => fc.id))];
        const token = (this.plaqueToken = (this.plaqueToken ?? 0) + 1);
        const live = () => this.scene && token === this.plaqueToken && this.terrInfo === info; // 그사이 다른 캠페인 선택이면 버림
        const draw = (ok) => { this.drawPlaques(info, faces, ok, alts); this.layoutTerritories(); this.layoutFactions(); };
        // 즉시: 로드된 폰트만 현지 문자, 나머지는 한글 큰 글자(이미 로드된 UI 폰트라 두부 없음) -> 폰트 로드가 끝나면 그 판들을 현지 문자로 다시 그린다
        const ok = new Map(ids.map((id) => [id, plaqueFontReady(id)]));
        draw(ok);
        ids.filter((id) => !ok.get(id)).forEach((id) => { loadPlaqueFont(id); plaqueFontSettled(id)?.then((v) => { if (v && live()) { ok.set(id, true); draw(ok); } }).catch(() => {}); });
    }

    drawPlaques(info, faces, ok, alts = []) {
        const s = this.scene;
        this.terrPlaques.removeAll(true);
        info.factions.forEach((f, i) => {
            if (!f.labelPos || (!f.plaque && !f.native && !f.caption)) return;
            const col = /^#?[0-9a-f]{6}$/i.test(String(f.color)) ? Phaser.Display.Color.HexStringToColor(f.color).color : 0x888888;
            const o = s.add.container(0, 0);
            const bg = s.add.graphics();
            o.add(bg);
            const fc = faces[i];
            const ko = f.ko || f.name || f.plaque;
            // 큰 글자 후보: 현지 국호(전용 폰트 로드 성공 시) > 기존 plaque.text(한자면 한자 폰트, 실패 시 기본 UI 폰트로도 표시) > 한글
            let bigStr = ''; let face = null;
            if (f.native && fc?.id && ok.get(fc.id) && plaqueCovers(fc.id, f.native)) { bigStr = nfc(f.native); face = f.nativeRtl ? { ...fc, rtl: true } : fc; } else if (f.native && f.nativeAlt && alts[i]?.id && ok.get(alts[i].id) && plaqueCovers(alts[i].id, f.nativeAlt)) { bigStr = nfc(f.nativeAlt); face = alts[i]; } else if (f.native) bigStr = ko; /* 폰트 로딩 전·글리프 없음: 한글 큰 글자(로딩 끝나면 재렌더) */ else if (f.plaque) { const pf = plaqueFace(f.plaqueScript, ''); bigStr = f.plaque; face = pf.id && ok.get(pf.id) ? pf : null; }
            if (bigStr) {
                const big = makeText(s, 0, 0, bigStr, { size: this.wideLayout ? 22 : 17, /* 넓은 화면 26 -> 22(답답함 완화) */ bold: true, color: '#fff6dc', origin: [0.5, 0.5], stroke: { color: '#1a1406', width: 4 } });
                if (face) { big.setFontFamily(face.stack); if (face.rtl) big.setRTL(true); }
                o.bigText = big.text;
                const maxW = this.wideLayout ? 230 : 150;
                if (big.width > maxW) big.setScale(maxW / big.width); // 긴 라틴 국호: 줄임표 대신 축소
                const smStr = ko && ko !== bigStr ? ko : '';
                const sm = smStr ? fitText(makeText(s, 0, 0, smStr, { size: 10, bold: true, color: '#f0e2bc', origin: [0.5, 0.5], stroke: { color: '#1a1406', width: 3 } }), 170) : null;
                const bh = big.displayHeight; const sh = sm ? sm.height : 0;
                o.pw = Math.max(big.displayWidth, sm ? sm.width : 0) + 18; o.ph = bh + sh + (sm ? 8 : 6);
                const y0 = -o.ph / 2; // 판 중심 = 컨테이너 원점(겹침 계산 기준)
                big.setY(y0 + 3 + bh / 2); sm?.setY(y0 + 3 + bh + 1 + sh / 2);
                bg.fillStyle(col, 0.48).fillRoundedRect(-o.pw / 2, y0, o.pw, o.ph, 6).lineStyle(1.5, 0x1a1406, 0.45).strokeRoundedRect(-o.pw / 2, y0, o.pw, o.ph, 6).lineStyle(1, 0xf4ecd8, 0.4).strokeRoundedRect(-o.pw / 2 + 2, y0 + 2, o.pw - 4, o.ph - 4, 5); // 테두리 얇고 은은하게(답답함 완화)
                o.add(sm ? [big, sm] : [big]);
                o.isPlaque = true;
                // (지도 위 국호 판 위 깃발은 사용자 지시 2026-11-04 '국기는 빼자'로 제거. 진영 깃발은 칩 묶음 국호 판 옆에만)
            } else {
                const t = makeText(s, 0, 0, f.caption, { size: 11, bold: true, color: '#fff2e0', origin: [0.5, 0.5], stroke: { color: '#1a1406', width: 3 } });
                o.pw = t.width + 10; o.ph = t.height + 4;
                bg.fillStyle(col, 0.45).fillRoundedRect(-o.pw / 2, -o.ph / 2, o.pw, o.ph, 4);
                o.add(t);
            }
            // 좁은 세로 화면(360: 논리 폭 400 < 390 의 433) 판 축소(강화면 2026-11-14: 360 에서 판이 지도에 비해 커 日本 판이 밖으로 밀리고 大明 판이 조선 오른쪽으로 감).
            //  폭 비율 제곱(360 약 0.85), 390·430 이상은 1(기존 그대로)
            const ps = !this.wideLayout && L.portrait ? Math.max(0.7, Math.min(1, (L.lw / 433) ** 2)) : 1;
            if (ps < 1) { o.setScale(ps); o.pw *= ps; o.ph *= ps; }
            o.pos = f.labelPos;
            this.terrPlaques.add(o);
        });
    }

    clearTerritories() {
        if (this.terrImg) { const k = this.terrImg.texture?.key; this.terrImg.destroy(); this.terrImg = null; if (k && this.scene?.textures.exists(k)) this.scene.textures.remove(k); }
        this.terrPlaques?.removeAll(true);
        this.terrNote?.setVisible(false);
        this.terrKey = null; this.terrInfo = null; this.terrRange = null;
    }

    dropTerrTex() { const k = this.terrImg?.texture?.key; if (k && this.scene?.textures.exists(k)) this.scene.textures.remove(k); }

    // 판이 피할 영역(rot 로컬 좌표, 중심 원점): 보이는 캠페인·스테이지 핀(머리 포함), 핀 라벨, 좌상단 캠페인 플레이트, 지도 안 영웅 칩 줄
    // 지도 위 오버레이(칩 줄·대표 초상·하단 글자)가 차지한 영역. 지도 화면 좌표(0..vp.w, 0..vp.h), {x,y}=중심. 국호 판·세력 라벨 회피 공통
    overlayRects() {
        const out = []; const cr = this.R.chips;
        if (cr.inMap && this.chipObjs.length) {
            if (this.chipRects?.length) out.push(...this.chipRects); // 묶음별(아군 왼쪽·적군 오른쪽)
            else { const cw = Math.min(cr.w, (this.chipRow.contentW ?? cr.w) + 12); const eh = this.chipRow.extraH ?? 0; out.push({ x: cr.x + cw / 2 - 6, y: cr.y + (cr.h - eh) / 2 - 4, w: cw + 8, h: cr.h + eh + 8 }); }
        }
        if (this.emblem?.rect) out.push({ ...this.emblem.rect }); // VS 엠블럼(overlay 좌표 = 지도 좌표)
        if (this.hiddenPin?.visible) out.push({ x: this.hiddenPin.x - this.hiddenPin.w0 / 2 + 6, y: this.hiddenPin.y + this.hiddenPin.h0 / 2 - 6, w: this.hiddenPin.w0 + 4, h: this.hiddenPin.h0 + 4 }); // 숨은 종장 잠김 핀(국호 판·라벨 회피)
        // 대표 초상(overlay 로컬, 원점 무관) — 트윈 중 위치가 아니라 최종 위치(x0) 기준
        this.heroLayer.list.forEach((im) => { const w = im.displayWidth; const h = im.displayHeight; const x0 = (im.side === 'right' ? this.vp.w : 0) - im.originX * w; out.push({ x: x0 + w / 2, y: im.y - im.originY * h + h / 2, w, h }); });
        [this.terrNote].forEach((t) => { if (!t?.visible || !t.text) return; const w = t.width; const h = t.height; const x0 = t.x - t.originX * w; const y0 = t.y - t.originY * h; out.push({ x: x0 + w / 2, y: y0 + h / 2, w: w + 4, h: h + 4 }); });
        return out;
    }

    plaqueObstacles() {
        const hw = this.vp.w / 2; const hh = this.vp.h / 2; const out = [];
        this.shelfPins.forEach((o) => {
            if (!o.visible) return;
            out.push({ x: o.x, y: o.y - 18, w: 34, h: 46 });
            if (o.label?.visible && o.label.lw) out.push({ x: o.label.x, y: o.label.y, w: o.label.lw, h: o.label.lh });
        });
        this.stagePins.forEach((o) => { if (o.visible) out.push({ x: o.x, y: o.y - 20, w: 40, h: 50 }); });
        const pr = this.plateRect; if (pr) out.push({ x: pr.x - hw, y: pr.y - hh, w: pr.w + 8, h: pr.h + 8 });
        // 칩 줄(캡션·여러 줄 포함)·대표 초상(좌/우)·지도 하단 글자 — 지도 로컬(중심 원점) 좌표로
        this.overlayRects().forEach((r) => out.push({ ...r, x: r.x - hw, y: r.y - hh }));
        return out;
    }

    // label_pos(화면 밖이면 가장자리로 당김) 기준 나선 후보 중 장애물·먼저 놓인 판과 겹치지 않는 가장 가까운 자리. 못 찾으면 null
    findPlaqueSpot(x0, y0, w, h, taken) {
        const hw = this.vp.w / 2; const hh = this.vp.h / 2; const gap = 6;
        const mx = w / 2 + 6; const my = h / 2 + 6; const bottom = hh - my - 14; // 하단 14 = 면책 문구 줄
        if (-hw + mx > hw - mx || -hh + my > bottom) return null;
        const hit = (x, y) => taken.some((o) => { const g = o.plaque ? 18 : gap; return Math.abs(x - o.x) * 2 < w + o.w + g && Math.abs(y - o.y) * 2 < h + o.h + g; }); // 국호 판끼리는 간격 18(맞붙어 보이지 않게), 핀·칩 등은 6
        const cx = clamp(x0, -hw + mx, hw - mx); const cy = clamp(y0, -hh + my, bottom);
        // label_pos 가 화면 밖이면 그 방향 절반 안에서만 찾는다(강화면 a27n: 360 에서 大明(압록강 서북, 화면 왼쪽 밖) 판이 조선 오른쪽 바다로 감).
        //  그쪽 절반에 자리가 없으면 반대편에 두지 않고 숨긴다(엉뚱한 위치보다 생략)
        const sideOk = (x, y) => !((x0 < -hw && x > 0) || (x0 > hw && x < 0) || (y0 < -hh && y > 0) || (y0 > hh && y < 0));
        const hit0 = hit; const hitS = (x, y) => !sideOk(x, y) || hit0(x, y);
        if (!hitS(cx, cy)) return { x: cx, y: cy };
        const step = 14; const maxR = Math.max(this.vp.w, this.vp.h) * 0.6;
        for (let r = step; r <= maxR; r += step) {
            const n = Math.max(8, Math.round((Math.PI * 2 * r) / step));
            let best = null; let bd = Infinity;
            for (let k = 0; k < n; k += 1) {
                const a = (k / n) * Math.PI * 2;
                const x = clamp(cx + Math.cos(a) * r * 1.4, -hw + mx, hw - mx); const y = clamp(cy + Math.sin(a) * r, -hh + my, bottom); // 가로로 조금 더 넓게 탐색(판이 가로로 긺)
                if (hitS(x, y)) continue;
                const d = Math.hypot(x - x0, y - y0);
                if (d < bd) { bd = d; best = { x, y }; }
            }
            if (best) return best;
        }
        return null;
    }

    // redraw 마다: 영토 텍스처 배치 + 판 위치. 판 = label_pos 기본, 핀·핀 라벨·플레이트·칩·다른 판과 겹치면 가까운 빈자리로(지시선 없음).
    // 우선순위 높은 판(priority 뒤쪽 = 위층)부터 자리를 잡고, 자리가 없으면 숨긴다. 캡션은 화면 안 + 빈자리일 때만
    layoutTerritories() {
        if (!this.terrImg || !this.terrRange) return;
        const rg = this.terrRange; const k = this.vp.w * this.cam.z;
        const tl = this.P(rg.x0, rg.y0);
        this.terrImg.setPosition(tl.x, tl.y).setDisplaySize((rg.x1 - rg.x0) * k, (rg.y1 - rg.y0) * k / 2);
        const list = this.terrPlaques.list;
        if (!list.length) return;
        const taken = this.plaqueObstacles();
        const order = list.map((o, i) => ({ o, i })).sort((a, b) => (b.o.isPlaque ? 100 : 0) + b.i - ((a.o.isPlaque ? 100 : 0) + a.i));
        order.forEach(({ o }) => {
            const p = this.P(o.pos.x, o.pos.y);
            if (!o.isPlaque) {
                const ok = this.inView(p, -10) && !taken.some((q) => Math.abs(p.x - q.x) * 2 < o.pw + q.w + 4 && Math.abs(p.y - q.y) * 2 < o.ph + q.h + 4);
                o.setPosition(p.x, p.y).setVisible(ok);
                if (ok) taken.push({ x: p.x, y: p.y, w: o.pw, h: o.ph });
                return;
            }
            const spot = this.findPlaqueSpot(p.x, p.y, o.pw, o.ph, taken);
            o.setVisible(!!spot);
            if (!spot) return;
            o.setPosition(spot.x, spot.y);
            taken.push({ x: spot.x, y: spot.y, w: o.pw, h: o.ph, plaque: true });
        });
    }

    // ---------- 세력 라벨(당대 국가·세력명, 선택 필드 factions) ----------
    buildFactions(c) {
        this.factionObjs.forEach((o) => o.destroy());
        this.factionObjs = [];
        const s = this.scene;
        (c?.factions ?? []).forEach((f) => {
            const side = SIDE[f.side] ?? SIDE.neutral;
            const o = s.add.container(0, 0);
            const t = makeText(s, 8, 0, f.name_ko, { size: 13, bold: true, color: '#f0d58c', origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } });
            fitText(t, 180);
            const w = t.width + 30; const h = 24;
            const bg = s.add.graphics();
            bg.fillStyle(C.gold, 0.2).fillRoundedRect(-w / 2, -h / 2, w, h, 6).lineStyle(1, side.col, 0.85).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
            const mk = s.add.graphics(); const mx = -w / 2 + 11;
            mk.fillStyle(side.col, 1);
            if (f.side === 'enemy') mk.fillTriangle(mx, -5, mx + 5, 0, mx, 5).fillTriangle(mx, -5, mx - 5, 0, mx, 5);
            else if (f.side === 'ally') mk.fillCircle(mx, 0, 4.5);
            else mk.fillRect(mx - 4, -4, 8, 8);
            t.setX(-w / 2 + 20);
            const arrow = s.add.graphics(); arrow.fillStyle(side.col, 0.95).fillTriangle(0, -6, 10, 0, 0, 6); arrow.setVisible(false);
            o.add([bg, mk, t, arrow]);
            o.f = f; o.w = w; o.h = h; o.prio = side.prio; o.arrow = arrow;
            o.setVisible(false).setAlpha(0);
            this.factionLayer.add(o);
            this.factionObjs.push(o);
        });
    }

    layoutFactions() {
        const c = this.sel;
        // 큰 국호 판이 있으면 같은 세력의 작은 라벨은 중복이라 숨긴다
        const plaques = this.terrPlaques.list.some((o) => o.isPlaque && o.visible); // 실제로 보이는 판이 있을 때만(판이 자리 부족으로 숨으면 작은 라벨 표시)
        const on = !!c && !this.traveling && this.cam.z >= c.zoom * 0.4 && this.factionsOn && !plaques;
        if (!this.factionObjs.length) return;
        const { vp } = this;
        const m = 8;
        // 차지한 영역(화면 좌표): 라벨 플레이트·칩 줄·보이는 핀
        const obst = [];
        if (this.plateRect) obst.push(this.plateRect);
        this.terrPlaques.list.forEach((o) => { if (o.visible) obst.push({ x: o.x + vp.w / 2, y: o.y + vp.h / 2, w: o.pw, h: o.ph }); });
        obst.push(...this.overlayRects()); // 칩 줄(캡션·여러 줄 포함)·대표 초상·하단 글자
        [...this.shelfPins.values(), ...this.stagePins].filter((o) => o.visible).forEach((o) => {
            obst.push({ x: o.x + vp.w / 2, y: o.y + vp.h / 2 - 16, w: 28, h: 40 });
            const lb = o.label; if (lb?.visible && lb.lw) obst.push({ x: lb.x + vp.w / 2, y: lb.y + vp.h / 2, w: lb.lw + 6, h: lb.lh + 4 }); // 핀 캡션(예 '투르와 푸아티에') 아래에 세력 라벨이 깔리지 않게(2026-11-03 강화면 r10)
        });
        const items = this.factionObjs.map((o) => {
            const p = this.P(o.f.label_pos.x, o.f.label_pos.y);
            const hw = o.w / 2 + m; const hh = o.h / 2 + m;
            const sx = clamp(p.sx, hw, vp.w - hw); const sy = clamp(p.sy, hh, vp.h - hh - (this.R.chips.inMap && this.chipObjs.length ? this.R.chips.h + (this.chipRow.extraH ?? 0) : 0));
            const off = Math.abs(sx - p.sx) > 1 || Math.abs(sy - p.sy) > 1;
            o.edge = off ? Math.atan2(p.sy - sy, p.sx - sx) : null;
            o.sx = sx; o.sy = sy;
            o.lid = `f${this.factionObjs.indexOf(o)}`; // 배치용 고유 id(데이터 id 누락·중복과 무관)
            return { id: o.lid, x: sx, y: sy, w: o.w, h: o.h, prio: o.prio + (off ? 0 : 10) };
        });
        // 세력 라벨끼리 간격 12(이전 4: '성지를 둘러싼 해' ch19 처럼 label_pos 가 가까운 서가에서 두 국호가 맞붙어 보임). 겹치면 위·아래로 비켜 놓고, 그래도 자리가 없을 때만 숨김
        const keep = placeLabels(items, obst, 20, { nudge: true, bounds: { w: vp.w, h: vp.h } }); // 라벨 박스 사이 최소 20(강화면 15차: 12 에서도 맞닿아 보임)
        const byId = new Map(items.map((it) => [it.id, it]));
        this.factionObjs.forEach((o) => {
            const vis = on && keep.has(o.lid);
            o.setVisible(vis);
            if (!vis) return;
            const it = byId.get(o.lid); if (it) { o.sx = it.x; o.sy = it.y; }
            o.setPosition(o.sx - vp.w / 2, o.sy - vp.h / 2);
            // 화면 밖 방향: 플레이트 가장자리에 방향 화살표
            if (o.edge != null) { const a = o.edge; o.arrow.setVisible(true).setRotation(a).setPosition(Math.cos(a) * (o.w / 2 + 2), Math.sin(a) * (o.h / 2 + 2)); } else o.arrow.setVisible(false);
        });
        // 최종 확인(실제 표시 경계, 지도 회전·기울기 반영): 그래도 겹치는 라벨·핀 캡션이 있으면 우선순위 낮은 라벨을 숨긴다(글자가 겹쳐 읽히지 않는 상태 방지)
        const R = Phaser.Geom.Rectangle; const shown = [];
        [...this.shelfPins.values(), ...this.stagePins].forEach((p) => { if (p.visible && p.label?.visible && p.label.lw) shown.push(p.label.getBounds()); });
        [...this.factionObjs].filter((o) => o.visible).sort((a, b) => (byId.get(b.lid)?.prio ?? 0) - (byId.get(a.lid)?.prio ?? 0)).forEach((o) => {
            const b = o.getBounds(); R.Inflate(b, 6, 4);
            if (shown.some((q) => R.Overlaps(q, b))) { o.setVisible(false); return; }
            shown.push(b);
        });
    }

    showFactions() {
        this.factionsOn = true;
        this.layoutFactions();
        this.factionObjs.forEach((o) => { if (reducedMotion()) o.setAlpha(1); else { o.setAlpha(0); this.tw({ targets: o, alpha: 1, duration: 220 }); } });
    }

    // ---------- 라벨 플레이트(캠페인명·연도·지역, 코드 텍스트) ----------
    renderPlate(c) {
        const s = this.scene;
        this.plate.removeAll(true).setVisible(true);
        if (!c) { this.plateRect = null; this.layoutHiddenPin(); return; }
        const maxW = Math.min(this.wideLayout ? 380 : this.vp.w - 20, this.vp.w - 20);
        const items = [];
        const t = fitText(makeText(s, 12, 8, c.title, { size: this.wideLayout ? 19 : 16, heading: true, color: '#FFE08A' }), maxW - 24); // 제목 위계 강화(2026-11-14): 크게·밝게, 부제는 작고 흐리게
        items.push(t);
        let y = 8 + t.height + 2;
        const sub = this.wideLayout ? [c.name && c.name !== c.title ? c.name : '', c.era].filter(Boolean).join(' · ') + (c.placeholder ? '  (준비 중)' : '') : ''; // 세로 화면: 제목 한 줄만(핀 가림 최소화)
        if (sub) { const st = fitText(makeText(s, 12, y, sub, { size: 12, color: '#D6D0C0' }), maxW - 24); items.push(st); y += st.height + 2; }
        if (c.region && this.wideLayout) { const rt = fitText(makeText(s, 12, y, c.region, { size: 12, color: CSS.muted, wrap: maxW - 24 }), maxW - 24, { maxLines: 2 }); items.push(rt); y += rt.height + 2; }
        const w = Math.min(maxW, Math.max(...items.map((o) => o.width)) + 24); const h = y + 8;
        const bg = s.add.graphics(); bg.fillStyle(COLOR.ink, 0.78).fillRoundedRect(0, 0, w, h, 8).lineStyle(1, COLOR.accent, 0.7).strokeRoundedRect(0, 0, w, h, 8);
        this.plate.add([bg, ...items]);
        this.plateRect = { x: this.plate.x + w / 2, y: this.plate.y + h / 2, w, h };
        this.plateFull = this.plateRect;
        this.layoutHiddenPin(); // 플레이트 폭이 바뀌면 숨은 책장 표식 겹침 재판정
        if (!reducedMotion()) { this.plate.setAlpha(0); this.tw({ targets: this.plate, alpha: 1, duration: 200 }); } else this.plate.setAlpha(1);
    }

    // ---------- 영웅 칩 ----------
    heroesOf(c) { const ord = (h) => (h.pending ? 10 : 0) + (ROLE_ORDER[h.role] ?? 3); return [...(c?.heroes ?? [])].sort((a, b) => ord(a) - ord(b)); }

    clearChips() { this.hideChipTip(); this.chipRow.removeAll(true); this.chipRow.setScale(1); this.chipRow.extraH = 0; this.chipObjs = []; this.chipRects = []; this.heroLayer.removeAll(true); this.chipStrip?.destroy(); this.chipStrip = null; this.emblem?.destroy(); this.emblem = null; }

    // nameHint: 메타 영웅 항목의 name_ko(있으면). 이름을 못 찾으면(보유하지 않은 미공개 영웅 등) 코드 문자열 대신 이름 줄을 비우고 이니셜만
    // pending: 초상화 제작 대기(heroes_pending) — 초상 요청 없이 이니셜 원형 + 이름, 은은하게
    // pcode: 초상화 코드(메타 portrait_key 'portrait.<pcode>' — 예: npc_muqali -> mukhali). 없으면 code
    // shortHint: 칩 이름이 넘칠 때 쓸 짧은 이름(메타 short_name). 없으면 첫 단어(예: '스키피오 아프리카누스' -> '스키피오')
    makeChip(code, role, silhouette, nameHint = '', pending = false, pcode = code, shortHint = '', capt = null) { // capt: 기본 부장 초상 조회 정보 {name, culture, troop, stageCode}(고유 초상 없는 적장)
        const s = this.scene; const framed = this.texReady(this.ui?.chip); const sz = this.chipSize();
        const o = s.add.container(0, 0);
        const col = role === 'key' ? COLOR.accentLight : role === 'enemy' ? COLOR.danger : COLOR.accent;
        const face = s.add.container(0, 0);
        const hn = heroNameOf(code);
        const nm0 = nameHint || (hn && hn !== code ? hn : loaded.manifest?.[`portrait.${portraitCode(code)}`]?.name_ko ?? ''); // 미보유 영웅: 초상화 manifest 의 name_ko(별칭·npc_ 초상 포함)
        const known = !!nm0 && nm0 !== code;
        const name = known ? nm0 : String(code ?? '?').charAt(0).toUpperCase();
        const draw = (tk) => {
            if (!o.scene) return;
            face.removeAll(true);
            if (framed) { this.drawFramedFace(face, tk, sz, silhouette, name, role); return; }
            if (!tk || !s.textures.exists(tk)) { // 초상 없음: 이니셜 원형
                face.add(s.add.circle(sz / 2, sz / 2, sz / 2 - 1, COLOR.ink, 0.88).setStrokeStyle(role === 'key' ? 2.5 : 1.5, silhouette ? C.locked : col, pending ? 0.6 : 1));
                face.add(makeText(s, sz / 2, sz / 2, silhouette ? '?' : name.slice(0, 1), { size: 20, bold: true, color: silhouette || pending ? CSS.muted : CSS.text, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
                return;
            }
            face.add(s.add.rectangle(0, 0, sz, sz, COLOR.ink, 0.85).setOrigin(0));
            if (tk && s.textures.exists(tk)) {
                const img = s.add.image(0, 0, tk).setOrigin(0);
                const fw = img.frame.realWidth; const fh = img.frame.realHeight; const cw = Math.min(fw, fh); const cy = Math.min(fh - cw, fh * 0.04); const sc = sz / cw;
                img.setCrop((fw - cw) / 2, cy, cw, cw).setScale(sc).setPosition(-((fw - cw) / 2) * sc, -cy * sc);
                if (silhouette) img.setTint(0x1c2433);
                face.add(img);
            } else face.add(makeText(s, sz / 2, sz / 2, silhouette ? '?' : name.slice(0, 1), { size: 20, bold: true, color: silhouette ? CSS.muted : CSS.text, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
            face.add(s.add.rectangle(0, 0, sz, sz, 0, 0).setOrigin(0).setStrokeStyle(role === 'key' ? 2.5 : 1.5, silhouette ? C.locked : col, 1));
        };
        const hasP = portraitKnown(pcode);
        const capLg = !hasP && capt ? captainPortraitLogical(capt, { thumb: true }) : null; // 기본 부장 초상(매핑·키가 있을 때만)
        if (!hasP && capt && !capLg) ensureCaptainMap((ok) => { if (!ok || !o.scene) return; const lg2 = captainPortraitLogical(capt, { thumb: true }); if (lg2) { const k2 = ensurePortraitTex(s, lg2, draw); if (k2) draw(k2); } }); // 매핑 첫 로드 후 다시 시도
        const k = hasP ? ensurePortrait(s, pcode, draw, { thumb: true }) : capLg ? ensurePortraitTex(s, capLg, draw) : null;
        draw(k);
        if (pending && !hasP) o.setAlpha(0.6); // 제작 대기 + 초상 없음(이니셜 칩)만 흐리게. 초상이 있으면 불투명(사용자 2026-11-04, 이전 0.85)
        // 칩 짧은 이름: 메타 short_name > 규칙(괄호 설명 제거 -> '~의 X' 는 X(몬페라토의 콘라도 -> 콘라도), 'A 백작 B' 같은 직함 뒤 이름은 직함 뒤(트리폴리 백작 레몽 3세 -> 레몽 3세) -> 첫 단어). 단어 중간에서 자르지 않는다(강화면 gacha52)
        const short = shortHint || (known ? chipShortName(name) : '');
        const nt = fitText(makeText(s, sz / 2, sz + 2, silhouette ? '???' : known ? name : '', { size: 11, bold: role === 'key', color: role === 'key' ? '#f0d58c' : CSS.text, origin: [0.5, 0], stroke: { color: '#0B1020', width: 2 } }), sz + 10, { fallback: !silhouette && short && short !== name ? short : undefined }); // 넘치면 짧은 이름 -> 그래도 넘치면 말줄임
        o.add([face, nt]);
        o.w = sz;
        return o;
    }

    chipSize() { return this.texReady(this.ui?.chip) ? 56 : 48; }

    // ---------- 장수 칩 툴팁(이름·생몰년·한 줄 설명) ----------
    // 데이터: data/hero_tips.json(tools/build_hero_tips.mjs 가 기존 영웅·NPC 데이터에서 생성). 없는 값은 '미상'. 잠긴(실루엣) 캠페인은 이름도 숨김
    // 입력: 지도 안 칩 = 마우스 호버(over/out) + 탭(pointerdown, 3초 뒤 자동 닫힘). 지도 아래 스와이프 줄 = 탭(드래그가 아닐 때, chipBox 의 hit 에서 처리)
    bindChipTip(o, cs) {
        const hit = this.scene.add.rectangle(0, 0, cs, cs + 16, 0xffffff, 0.001).setOrigin(0).setInteractive();
        hit.on('pointerover', () => this.showChipTip(o));
        hit.on('pointerout', () => this.hideChipTip(o));
        hit.on('pointerdown', (p) => { if (p.wasTouch) this.showChipTip(o, 3000); });
        o.add(hit);
    }

    chipAt(worldX, worldY) {
        const cs = this.chipSize(); const m = this.tipMat ??= new Phaser.GameObjects.Components.TransformMatrix(); const pt = this.tipPt ??= new Phaser.Math.Vector2();
        return this.chipObjs.find((o) => { o.getWorldTransformMatrix(m, this.tipParentMat ??= new Phaser.GameObjects.Components.TransformMatrix()).applyInverse(worldX, worldY, pt); return pt.x >= 0 && pt.x <= cs + 10 && pt.y >= 0 && pt.y <= cs + 24; }) ?? null; // 칩별 변환(묶음 배율·2단 대응)
    }

    showChipTip(o, autoHideMs = 0) {
        if (!o?.scene || !o.tipCode) return;
        this.hideChipTip();
        const s = this.scene;
        const tip = HERO_TIPS?.tips?.[o.tipCode] ?? {};
        const hn = heroNameOf(o.tipCode);
        const name = o.tipLocked ? '???' : (tip.name || (hn && hn !== o.tipCode ? hn : '') || '이름 미상');
        const lines = [];
        if (!o.tipLocked) {
            lines.push(tip.life ? `생몰 ${tip.life}` : tip.period ? `활동 시기 ${tip.period} · 생몰년 미상` : '생몰년 미상');
            if (tip.desc) lines.push(tip.desc);
        } else lines.push('아직 공개되지 않은 인물');
        const W = Math.min(300, L.lw - 24); const pad = 10;
        const t1 = makeText(s, pad, pad, name, { size: 16, bold: true, color: '#f0d58c' });
        const t2 = makeText(s, pad, pad + t1.height + 4, lines.join('\n'), { size: 13, color: CSS.text, wrap: W - pad * 2 });
        const h = Math.ceil(t1.height + 4 + t2.height + pad * 2);
        const w = Math.ceil(Math.max(t1.width, t2.width) + pad * 2);
        const g = s.add.graphics().fillStyle(COLOR.navyDeep, 0.96).fillRoundedRect(0, 0, w, h, 8).lineStyle(1, COLOR.accent, 0.8).strokeRoundedRect(0, 0, w, h, 8);
        const b = o.getBounds();
        let x = b.centerX - w / 2; let y = b.y - h - 6;
        x = Math.max(L.safe.l + 8, Math.min(L.lw - L.safe.r - 8 - w, x));
        if (y < L.safe.t + 8) y = b.bottom + 6;
        this.chipTip = s.add.container(x, y, [g, t1, t2]).setDepth(5000);
        this.chipTip.owner = o;
        if (autoHideMs) this.chipTipTimer = s.time.delayedCall(autoHideMs, () => this.hideChipTip());
    }

    hideChipTip(owner = null) {
        if (owner && this.chipTip?.owner !== owner) return;
        this.chipTipTimer?.remove(); this.chipTipTimer = null;
        this.chipTip?.destroy(); this.chipTip = null;
    }

    // 안아트 칩 프레임(map.world.ui.chip_frame): 초상은 지름 약 74% 원형(Phaser 4 내부 Mask 필터 + 코드 원 텍스처). WebGL 아니면 사각 초상 + 프레임
    drawFramedFace(face, tk, sz, silhouette, name, role) {
        const s = this.scene; const d = Math.round(sz * 0.74); const c0 = sz / 2;
        face.add(s.add.circle(c0, c0, d / 2, COLOR.ink, 0.9));
        if (tk && s.textures.exists(tk)) {
            const T = s.textures.get(tk); const src = T.get(); const fw = src.realWidth; const fh = src.realHeight; const cw = Math.min(fw, fh); const cy = Math.min(fh - cw, fh * 0.04);
            const fn = 'stagemap_face';
            if (!T.has(fn)) T.add(fn, 0, Math.round((fw - cw) / 2), Math.round(cy), Math.round(cw), Math.round(cw));
            const img = s.add.image(c0, c0, tk, fn).setDisplaySize(d, d);
            if (silhouette) img.setTint(0x1c2433);
            if (s.renderer?.gl && typeof img.enableFilters === 'function') {
                if (!s.textures.exists(CIRCLE_MASK)) { const g = s.make.graphics({ x: 0, y: 0 }, false); g.fillStyle(0xffffff, 1).fillCircle(64, 64, 64); g.generateTexture(CIRCLE_MASK, 128, 128); g.destroy(); }
                img.enableFilters(); img.filters.internal.addMask(CIRCLE_MASK);
            }
            face.add(img);
        } else face.add(makeText(s, c0, c0, silhouette ? '?' : name.slice(0, 1), { size: 20, bold: true, color: silhouette ? CSS.muted : CSS.text, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        const fr = s.add.image(c0, c0, tex(this.ui.chip)).setDisplaySize(sz, sz);
        if (silhouette) fr.setTint(0x9aa0aa); else if (role === 'enemy') fr.setTint(0xffb0a0);
        face.add(fr);
    }

    // 대결 구도(fe21). 아래 -> 위 레이어: 대표 초상(지도 바닥에 발치 고정, 좌 아군 / 우 적군 반전, 같은 상한·같은 바닥 기준선, 원본 비율)
    //   -> 장수 칩 묶음(아군 = 왼쪽, 적군 = 오른쪽, 반투명 바탕, 줄바꿈은 각 묶음 안에서만) -> 묶음 위 국호 캡션 -> 가운데 VS 엠블럼.
    // 국호 = 기준 스테이지 factions{ally,enemy}(BE) > 메타 factions 첫 ally/enemy(괄호 설명 생략) > '아군'/'적군'.
    // 아군 = role key·companion(key 먼저) + ally_npcs('지원'), 적군 = enemy_commander('대장', 맨 앞) + role enemy. 적이 없으면 VS 없이 한 묶음.
    // 높이 상한: 칩 묶음은 지도 높이의 42%(낮은 화면 30%, 한 줄)까지 — 넘치면 배율을 줄인다(최소 0.45).
    // 세로 화면(칩 줄이 지도 아래): 2단(위 = 아군 줄, 아래 = 적군 줄, 줄 앞에 국호), 가로 스와이프. VS 엠블럼은 지도 하단 가운데(작게)
    showChips(c, onDone) {
        this.clearChips();
        const list = this.heroesOf(c).filter((hh) => !hh.proto && !String(hh.code ?? '').startsWith('protagonist_')); // 주인공은 하단 장수 칩에 표시하지 않음(2026-11-03 사용자 요청, 표시만 — 모델·출전 판정 불변)
        if (!list.length) { onDone?.(); return; }
        const s = this.scene; const locked = !(c.opened ?? c.unlocked) && !c.preview; // 준비 중 캠페인은 실루엣 없이 초상 공개. 선행 미해금 서가만 전체 실루엣
        const lack = new Set((c.heroNeed?.missing ?? []).map((h) => h.code)); // 필수 영웅 미보유: 해당 칩만 흐리게(이름·툴팁 유지)
        const allies = list.filter((hh) => hh.role !== 'enemy'); const foes = list.filter((hh) => hh.role === 'enemy');
        // 지원(아군 NPC) 칩: 수레·배(non_hero, npc_cart_*/npc_boat_*)는 장수가 아니라 제외. 같은 인물의 영웅(npc_X ↔ X, 별칭 포함)이 이미 칩에 있으면(출전·합류 영웅, 보유 무관) NPC 쪽은 추가하지 않음(강화면 34회차)
        const person = (code) => { const k = String(code ?? '').replace(/^npc:/, ''); return npcPersonCode(SAME_PERSON[k] ?? k); }; // 같은 인물 다른 코드 별칭 포함
        (c.vs?.allyNpcs ?? []).forEach((h) => {
            if (!h?.code || h.non_hero || /^npc_(cart|boat)_/.test(String(h.code))) return;
            const i = allies.findIndex((x) => x.code === h.code);
            if (i >= 0) { allies[i] = { ...allies[i], support: true }; return; }
            if (allies.some((x) => person(x.code) === person(h.code))) return;
            allies.push({ code: h.code, name_ko: h.name, role: 'companion', support: true });
        });
        // 적 진영 칩(2026-11-04 사용자 지시, 전 서가 공통):
        //  (a) 메타 적 인물 + 이 서가 모든 스테이지의 '인물' 적 대표(enemy_commander: hero_code·npc_ref 이거나 일반 직함이 아닌 이름)를 합쳐 보여 준다(현재 스테이지 1명만 쓰던 것 확장)
        //  (b) '대장' 표식 = 진영 수장(enemyLeaderOf: 메타 leader 지정 > 적 국호(factions.id)와 같은 코드의 영웅 > 메타 적 인물 첫 번째). 스테이지 임시 지휘관에게 붙이지 않는다
        //  (c) 일반 부대 지휘 직함(isGenericCommander: BE generic 우선)은 칩에 넣지 않는다
        const nameOf = (h) => h?.name_ko ?? h?.name ?? '';
        const pre = (a, b) => !!a && !!b && (a.startsWith(b) || b.startsWith(a)); // '서퍽 백작' ↔ '서퍽 백작 윌리엄 드 라 폴' 같은 인물
        // 이름 핵심어(괄호 밖·괄호 안 각각, 2자 이상): '거란 성종(야율융서)' ↔ '야율융서(성종)' 같은 인물(괄호 표기 순서가 다른 경우)
        const keys = (n) => { const m = /^(.*?)\s*\((.*?)\)\s*$/.exec(String(n ?? '')); const parts = m ? [m[1], m[2]] : [String(n ?? '')]; return parts.map((p) => p.trim()).filter((p) => p.length >= 2); }; // 괄호 밖·괄호 안 전체만(마지막 단어 비교는 '이브라힘 로디'↔'마흐무드 로디' 같은 다른 인물을 묶어 제외)
        const kin = (a, b) => { const ka = keys(a); return keys(b).some((k) => ka.includes(k)); };
        // 코드 기준 같은 인물(이름 문자열 비교 의존 제거, 2026-11-08 영웅 이름 괄호 제거로 '거란 성종'↔'야율융서' 가 이름으로 안 맞음):
        //  'npc:' 접두 제거 -> SAME_PERSON 별칭 -> npcPersonCode(npc_X ↔ X·NPC_ASSET_ALIAS). 이름 비교는 코드가 없을 때의 보조
        const canon = (code) => { const k = String(code ?? '').replace(/^npc:/, ''); return k ? npcPersonCode(SAME_PERSON[k] ?? k) : ''; };
        const sameCode = (a, b) => !!a && !!b && canon(a) === canon(b);
        const same = (x, cmd, code) => x.code === code || sameCode(x.code, code) || sameCode(x.code, cmd.npc_ref) || sameCode(x.code, cmd.hero_code ?? cmd.hero) ||(!!cmd.name && (nameOf(x) === cmd.name || pre(nameOf(x), cmd.name) || kin(nameOf(x), cmd.name))) || (!!cmd.hero_code && x.code === cmd.hero_code) || (!!cmd.hero && x.code === cmd.hero) || (!!cmd.npc_ref && (x.code === cmd.npc_ref || x.code === `npc_${cmd.npc_ref}`));
        const cmds = [];
        (c.stages ?? []).forEach((t) => { const cm = t?.s?.enemy_commander ?? t?.s?.rules?.enemy_commander; if (cm?.name || cm?.hero_code || cm?.hero) cmds.push({ cm, stageCode: t.s.code }); });
        if (c.vs?.commander && !cmds.some((x) => x.cm === c.vs.commander)) cmds.unshift({ cm: c.vs.commander, stageCode: c.stages?.[0]?.s?.code ?? null });
        cmds.forEach(({ cm, stageCode }) => {
            if (isGenericCommander(cm) || /그림자/.test(String(cm.name ?? ''))) return; // 서가 연출용 '그림자' 보스(먹그림자·번진 기록의 그림자)는 인물이 아니라 제외
            const code = cm.hero_code ?? cm.hero ?? portraitCodeByName(cm.name) ?? `npc:${cm.npc_ref ?? cm.name}`; // 영웅 코드가 없으면 manifest 초상 name_ko 로 찾는다(ch11 야율세량: rules.enemy_commander.hero = null, 강화면 gacha54) // 시드 rules.enemy_commander 는 hero 필드
            if (foes.some((x) => same(x, cm, code))) return;
            foes.push({ code, name_ko: cm.name, role: 'enemy', captain: { name: cm.name, culture: cm.culture ?? null, troop: cm.troop_type ?? cm.unit_type ?? cm.type ?? null, stageCode } }); // 고유 초상 없는 적장 -> 기본 부장 초상 후보
        });
        const leader = enemyLeaderOf(c, foes);
        if (leader) { const i = foes.indexOf(leader); if (i >= 0) foes.splice(i, 1); foes.unshift({ ...leader, boss: true }); } // 표의 수장이 메타에 없으면 새 칩
        // 아군 수장(사용자 지시 2026-11-04: 진영마다 수장에 '대장'): 메타 leader:true > 서가 주인공 측 대표(role key) > 첫 아군. 지원(조종 불가) 칩은 제외
        { const al = allies.find((h) => h.leader === true && !h.support) ?? allies.find((h) => h.role === 'key' && !h.support) ?? allies.find((h) => !h.support); if (al) { const i = allies.indexOf(al); allies.splice(i, 1); allies.unshift({ ...al, boss: true }); } }
        // 진영당 칩 상한(사용자 의도: 최대 2줄 = 10명, 강화면 gacha59 ch23 3줄). 채우는 순서 = 대장 -> 서가 메타 영웅(메타 순서) -> 스테이지 합산 적 대표·지원 NPC. 넘치는 칩만 빼고 데이터는 그대로
        // 순서(주요 인물 우선, 사용자 2026-11-04 '주요 인물 5명만') = 대장 -> 주인공 측 key -> 서가 메타 영웅(메타 순서) -> 스테이지 합산 적 대표·지원 NPC
        const capSide = (arr) => { if (arr.length <= MAX_CHIPS_PER_SIDE) return; const rest = (h) => !h.boss && h.role !== 'key'; const out = [...arr.filter((h) => h.boss), ...arr.filter((h) => !h.boss && h.role === 'key' && !h.captain && !h.support), ...arr.filter((h) => rest(h) && !h.captain && !h.support), ...arr.filter((h) => !h.boss && (h.captain || h.support))].slice(0, MAX_CHIPS_PER_SIDE); arr.length = 0; arr.push(...out); };
        capSide(allies); capSide(foes);
        const vs = allies.length > 0 && foes.length > 0;
        const cr = this.R.chips; const inMap = cr.inMap;
        const lowMap = this.R.chips.inMap && this.lowH; // 낮은 가로 화면: 칩 이름 줄 숨김(이름은 툴팁), 높이 절약
        // 넓은 지도(데스크톱, 사용자 피드백 2026-11-04 '여백 많고 초상 작음'): 칩 간격 10->6, 이름 줄 24->16, 배율 상한 1->1.45(가로 여유 활용). 낮은 화면·가로 폰·세로는 기존 값
        const roomy = inMap && !this.lowH && !L.short && !L.portrait;
        const gap = roomy ? 6 : 10; const cs = this.chipSize(); const step = cs + gap; const unitH = lowMap ? cs + 6 : roomy ? cs + 16 : cs + 24;
        const coalition = vs && ['ally', 'enemy'].some((sd) => (c.factions ?? []).filter((x) => x.side === sd).length > 1); // 연합군 국호 패널(높이 18)이 있으면 국호 줄을 조금 높게
        const flagPx = L.short ? 28 : L.portrait || this.lowH ? 26 : 32; // 깃발 글자(魏 등) 가독성(안아트 권장 실제 28px 이상, 2026-11-04): 논리 단위 = 데스크톱 32(800 은 화면 배율 약 0.88 -> 실제 약 28), 가로 폰 28(실제 약 25), 세로·낮은 화면 26. 이전 26/22 // 칩 묶음 깃발: 국호 판 옆(안쪽)에 작게(사용자 피드백: 칩 위 높이 최소화). 화면 px
        const flagIds = (side) => (c.factions ?? []).filter((x) => x.side === side).map((x) => x.id).filter((id) => !!loaded.manifest?.[`ui.flag.${id}`]);
        const hasFlags = vs && (flagIds('ally').length > 0 || flagIds('enemy').length > 0);
        const capBase = vs ? (coalition ? 20 : 16) : 0; // 국호 줄 높이(줄 사이 간격에도 씀)
        const capH = capBase; // 국호 줄(박스 단위)
        const flagRoom = 0; // 깃발은 국호 판 옆이라 위쪽 추가 높이 없음
        const mk = (hh) => {
            const o = this.makeChip(hh.code, hh.role, locked, hh.name_ko ?? hh.name ?? '', !!hh.pending, typeof hh.portrait_key === 'string' ? hh.portrait_key.replace(/^portrait\./, '') : hh.code, hh.short_name ?? hh.name_short ?? '', hh.captain ?? null);
            if (!locked && lack.has(hh.code)) { o.setAlpha(0.45); o.lacking = true; }
            // 역할 마크 제거(사용자 2026-11-04 "대장·지원 마크 전부 빼"): 표시만 제거, 데이터·로직(npc_ally·commander·support·boss)은 그대로 — 칩 우상단 '지원'/'대장' 표식 삭제
            if (lowMap) o.list[1]?.setVisible(false); // makeChip 의 [face, 이름]
            o.tipCode = hh.code; o.tipLocked = locked;
            this.chipObjs.push(o);
            if (inMap) this.bindChipTip(o, cs);
            return o;
        };
        const capText = (x, y, label, color, maxW, origin) => fitLabel(makeText(s, x, y, label, { size: 12, bold: true, color, origin, stroke: { color: '#0B1020', width: 3 } }), Math.max(36, maxW), 12, 9); // 넘치면 9까지 축소 후 말줄임
        // 진영 국호 목록: 스테이지 응답 vs.factions[side](문자열) 우선, 없으면 서가 메타 factions 중 같은 side 전부(2개 이상 = 연합군, 예 ch1 조선·명, ch24 프랑크·아키텐)
        const fnames = (side, dflt) => {
            const clean = (v) => String(v ?? '').replace(/\s*\(.*?\)\s*/g, '').trim();
            const st = c.vs?.factions?.[side];
            const meta = (c.factions ?? []).filter((x) => x.side === side).map((x) => x.name_ko);
            // 서가 메타에 같은 진영 세력이 2개 이상(연합군)이면 메타 목록이 우선(스테이지 이름 하나 '조선 수군'·'프랑크·아키텐 군' 대신 연합 패널). 한 나라면 스테이지 이름이 더 구체적이라 우선
            const list = (Array.isArray(st) ? st : meta.length > 1 ? meta : st ? [st] : meta).map(clean).filter(Boolean);
            return list.length ? [...new Set(list)] : [dflt];
        };
        // 국호 패널: 한 나라 = 기존 글자(capText). 연합군 = 이름 칸을 한 줄로 나란히 붙이고 공통 테두리·칸 구분선으로 묶음. 폭을 넘으면 칸마다 글자 축소 -> 말줄임
        const capPanel = (x, y, names, color, maxW, origin) => {
            if (names.length < 2) return capText(x, y, names[0], color, maxW, origin);
            const lim = Math.max(36, maxW); const padX = 6; const H = 18;
            const per = Math.max(24, lim / names.length - padX * 2);
            const ts = names.map((nm) => fitLabel(makeText(s, 0, H / 2, nm, { size: 12, bold: true, color, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }), per, 12, 9));
            const ws = ts.map((t) => t.displayWidth + padX * 2);
            const W = ws.reduce((a, b) => a + b, 0);
            const box = s.add.container(x - (origin?.[0] === 1 ? W : 0), y - H); box.panelW = W; box.panelH = H; // 깃발 배치용
            const g = s.add.graphics();
            const col = Phaser.Display.Color.HexStringToColor(color).color;
            g.fillStyle(0x0b1020, 0.45).fillRoundedRect(0, 0, W, H, 5).lineStyle(1, col, 0.5).strokeRoundedRect(0, 0, W, H, 5);
            box.add(g);
            let cx = 0;
            ts.forEach((t, i) => { t.setX(cx + padX); box.add(t); cx += ws[i]; if (i < ts.length - 1) g.lineStyle(1, col, 0.5).lineBetween(cx, 3, cx, H - 3); });
            return box;
        };
        const ALLY_C = '#9fd8ff'; const FOE_C = '#ffb0a0';
        this.chipRects = []; // 지도 화면 좌표 {x,y,w,h}(중심) — 국호 판·세력 라벨 회피(overlayRects)
        let emblemH = 0;
        this.emblemX = null;
        if (inMap && cr.stack) {
            // 세로 화면 지도 안 2단(stack, 2026-11-14 모바일 개선): 지도 하단 그라디언트 띠 위 — 윗줄 아군, 아랫줄 적군. 왼쪽 국호 칸(capW)에 두 국호, 그 사이 작은 VS 엠블럼.
            //  배율 k = 띠 높이(2줄)와 폭(5명 한 줄) 중 작은 쪽(최대 1, 최소 0.45). 진영당 칩은 capSide 로 최대 5명(연합군은 국호 '+N')
            const rowsDef = vs ? [[allies, 'ally'], [foes, 'enemy']] : [[list, 'all']];
            const capW = vs ? 52 : 0; const pad = 6; const rg = vs ? 6 : 0; const nRow = rowsDef.length;
            const maxN = Math.max(1, ...rowsDef.map(([g]) => g.length));
            const kH = (cr.h - pad * 2 - rg * (nRow - 1)) / (nRow * unitH);
            const kW = (cr.w - capW - pad * 2) / Math.max(1, maxN * step - gap);
            const k = clamp(Math.min(kH, kW, 1), 0.45, 1); const rh = unitH * k;
            const top = cr.h - pad - nRow * rh - rg * (nRow - 1);
            const gT = Math.max(0, top - 22); const solid = Math.min(cr.h, top + 12);
            this.chipStrip = s.add.graphics();
            this.chipStrip.fillGradientStyle(COLOR.ink, COLOR.ink, COLOR.ink, COLOR.ink, 0, 0, 0.8, 0.8).fillRect(0, gT, cr.w, solid - gT); // 위 = 투명 -> 아래 = 짙은 남색
            this.chipStrip.fillStyle(COLOR.ink, 0.8).fillRect(0, solid, cr.w, cr.h - solid);
            this.chipBox.addAt(this.chipStrip, 0);
            rowsDef.forEach(([g, side], r) => {
                const y = top + r * (rh + rg);
                const box = s.add.container(capW + pad, y).setScale(k);
                g.forEach((hh, i) => { const o = mk(hh); o.setPosition(i * step, 0); box.add(o); });
                this.chipRow.add(box);
                if (vs) { const ns = fnames(side, side === 'ally' ? '아군' : '적군'); this.chipRow.add(capText(pad + capW / 2, y + (cs * k) / 2, `${ns[0].split(/[\s·]/)[0]}${ns.length > 1 ? `+${ns.length - 1}` : ''}`, side === 'ally' ? ALLY_C : FOE_C, capW - 4, [0.5, 0.5])); }
            });
            this.chipRects.push({ x: cr.x + cr.w / 2, y: cr.y + (gT + cr.h) / 2, w: cr.w, h: cr.h - gT }); // 국호 판·세력 라벨 회피 = 띠 전체
            this.chipRow.contentW = cr.w; this.chipRow.extraH = 0;
            if (vs) { // VS = 국호 칸 가운데, 두 국호 사이(두 줄 칩 얼굴 중심의 중간)
                this.stackEmblemD = Math.round(clamp((rh + rg) * 0.5, 24, 34));
                this.emblemX = cr.x + pad + capW / 2; this.emblemY = cr.y + top + (rh + rg) / 2 + (cs * k) / 2;
            }
        } else if (inMap) {
            const groups = vs ? [[allies, 'ally'], [foes, 'enemy']] : [[list, 'all']];
            const em = vs ? this.emblemSize() : 0;
            const avail = vs ? (cr.w - em - 24) / 2 : cr.w - 12;
            const need = Math.max(...groups.map(([g]) => g.length * step - gap));
            // 대표 초상이 보이는 폭: 칩 묶음이 초상 얼굴(초상 위쪽 약 45%)을 덮지 않게 초상 높이의 50%까지, 줄 수는 최대 2줄
            const portraitH = this.portraitsOn() ? Math.min(this.vp.h * 0.62, this.vp.h - 40) : 0;
            const maxH = roomy ? Math.min(this.vp.h * 0.55, portraitH ? portraitH * 0.7 : Infinity) /* 넓은 지도: 지도 55%·대표 초상 아래 70%(얼굴 위 30%만 보호). 한 줄 5명이라 보통 가로 폭이 먼저 상한(사용자 '답답해 보임' 2026-11-04, 66->55) */ : Math.min(this.vp.h * (this.lowH ? 0.3 : 0.42), portraitH ? portraitH * 0.5 : Infinity); // 넓은 지도: 지도 60%·대표 초상 아래 60%(얼굴 위쪽 40%는 가리지 않음)
            // 줄바꿈 규칙(2026-11-04 사용자 요청): 진영마다 한 줄 최대 5명 — 6~10명은 2줄, 11명 이상도 5명 단위로 줄 추가.
            //  배율 k = 5칸 폭이 진영 폭(avail)에 들어가는 값(최대 1) -> 전체 높이가 상한(maxH)을 넘으면 줄여 맞춘다(최소 0.45)
            const perRow = 5;
            const cols5 = Math.min(perRow, Math.max(1, ...groups.map(([g]) => g.length)));
            const rowsN = Math.max(1, ...groups.map(([g]) => Math.ceil(g.length / perRow)));
            const rowGap = roomy ? 4 : capBase; // 줄 사이 간격(넓은 지도는 좁게)
            const hOf = (kk) => (rowsN * unitH + (rowsN > 1 ? (rowsN - 1) * rowGap : 0) + capH) * kk; // 칩 배율은 칩·국호 줄로만 정한다(깃발 자리는 그 위에 고정 px 로 더함 — 깃발 때문에 칩이 작아지지 않게)
            let k = Math.min(roomy ? 1.8 : 1, avail / Math.max(1, cols5 * step - gap));
            while (hOf(k) > maxH && k > 0.45) k = Math.max(0.45, k - 0.05);
            k = Math.max(0.45, k); void need;
            const rowsMax = Math.max(...groups.map(([g]) => Math.ceil(g.length / perRow)));
            const rowH = unitH + (rowsMax > 1 ? rowGap : 0);
            this.chipStrip = s.add.graphics();
            this.chipBox.addAt(this.chipStrip, 0);
            const baseY = cr.h - unitH * k - 4; // 칩 줄 맨 아랫줄 = 칩 영역 바닥(지도 하단)에 붙임
            groups.forEach(([g, side]) => {
                if (!g.length) return;
                const box = s.add.container(0, 0).setScale(k);
                const rows = Math.ceil(g.length / perRow); const cols = Math.min(g.length, perRow);
                g.forEach((hh, i) => { const o = mk(hh); o.setPosition((i % perRow) * step, -(rows - 1 - Math.floor(i / perRow)) * rowH); box.add(o); });
                const gw = (cols * step - gap) * k; const extra = ((rows - 1) * rowH + capH) * k + flagRoom; // 깃발 자리 포함(바탕·회피 사각형)
                const x0 = side === 'enemy' ? cr.w - gw : 0; // 적 묶음은 오른쪽 끝에 맞춤
                box.setPosition(x0, baseY);
                if (vs) {
                    const ns = fnames(side, side === 'ally' ? '아군' : '적군');
                    const py = -(rows - 1) * rowH - 3;
                    const pan = capPanel(side === 'enemy' ? cols * step - gap : 0, py, ns, side === 'ally' ? ALLY_C : FOE_C, Math.max(cols * step - gap, ns.length > 1 ? 240 : 150), [side === 'enemy' ? 1 : 0, 1]);
                    box.add(pan);
                    const ids = flagIds(side);
                    if (ids.length) {
                        const pw = pan.panelW ?? pan.displayWidth ?? 0; const px0 = pan.panelW != null ? pan.x : pan.x - (pan.originX ?? 0) * pw; const ph = pan.panelH ?? pan.displayHeight ?? 18;
                        const fs = flagPx / k; const fg = 4 / k;
                        const fy = Math.min(py - ph / 2, -fs / 2 - 2 / k); /* 깃발이 커져도 아래 끝이 칩 윗변(0)보다 2px 위 */ const inward = side === 'ally' ? 1 : -1; let fx = inward > 0 ? px0 + pw + 4 / k + fs / 2 : px0 - 4 / k - fs / 2; // 아군 = 판 오른쪽, 적군 = 판 왼쪽(묶음 안쪽)
                        ids.forEach((id) => {
                            const x = fx; fx += inward * (fs + fg);
                            const put = (tk) => { if (!box.scene || !tk || !this.scene?.textures.exists(tk)) return; const im = s.add.image(x, fy, tk); im.setScale(fs / Math.max(im.width, im.height)); box.add(im); };
                            const tk = flagTex(s, id, put); if (tk) put(tk); // 로드 전에는 자리만(capH 에 포함), 도착하면 그림
                        });
                    }
                } // 칩이 적은 묶음도 국호가 잘리지 않게 폭 여유(연합군은 더 넓게) // 칩이 적은 묶음도 국호가 잘리지 않게 폭 여유(연합군은 더 넓게)
                this.chipRow.add(box);
                this.chipStrip.fillStyle(COLOR.ink, roomy ? 0.42 : 0.62).fillRoundedRect( /* 넓은 지도: 바탕 더 투명(답답함 완화) */x0 - 6, baseY - 4 - extra, gw + 12, unitH * k + extra + 6, 8);
                this.chipRects.push({ x: cr.x + x0 + gw / 2, y: cr.y + baseY + (unitH * k - extra) / 2 - 1, w: gw + 16, h: unitH * k + extra + 10 });
            });
            this.chipRow.contentW = cr.w; // (구 단일 줄 호환) 회피는 chipRects 사용
            this.chipRow.extraH = ((rowsMax - 1) * rowH + capH) * k + flagRoom;
            emblemH = unitH * k + capH * k;
            this.emblemY = cr.y + baseY + (unitH * k) / 2 - 6; // 칩 줄 높이 가운데
        } else {
            // 지도 아래(세로 화면): 2단 — 위 = 아군 줄, 아래 = 적군 줄. 줄 앞 국호(폭 48), 가로 스와이프는 두 줄 함께
            const rowsDef = vs ? [[allies, 'ally'], [foes, 'enemy']] : [[list, 'all']];
            const k = vs ? Math.min(1, (cr.h - 8) / (2 * unitH + 4)) : 1;
            const capW = vs ? 48 : 0; const rh = unitH * k;
            let maxW = 0;
            rowsDef.forEach(([g, side], r) => {
                const y = vs ? 2 + r * (rh + 4) : (cr.h - unitH) / 2;
                const box = s.add.container(capW, y).setScale(k);
                g.forEach((hh, i) => { const o = mk(hh); o.setPosition(i * step, 0); box.add(o); });
                this.chipRow.add(box);
                if (vs) { const ns = fnames(side, side === 'ally' ? '아군' : '적군'); this.chipRow.add(capText(0, y + (cs * k) / 2, `${ns[0].split(/[\s·]/)[0]}${ns.length > 1 ? `+${ns.length - 1}` : ''}`, side === 'ally' ? ALLY_C : FOE_C, capW - 6, [0, 0.5])); } // 세로 국호 칸(폭 48): 첫 단어 약어, 연합군은 '+N'
                maxW = Math.max(maxW, capW + (g.length * step - gap) * k);
            });
            this.chipRow.contentW = maxW;
            this.chipRow.extraH = 0;
            this.chipRow.y = 0;
            emblemH = 0;
            this.emblemY = null;
        }
        if (vs) this.showEmblem(emblemH);
        // 대표 초상: 지도가 충분히 크면(폭 560·높이 320 이상) 좌우 같은 상한으로 바닥에 앉힘(칩 묶음이 그 앞을 반투명 바탕으로 덮음)
        if (this.portraitsOn()) {
            this.showKeyHero(c, allies.find((hh) => hh.role === 'key' && !hh.proto && !hh.pending && portraitKnown(hh.code)) ?? allies.find((hh) => !hh.pending && portraitKnown(hh.code)), locked, 'left');
            if (vs) this.showKeyHero(c, foes.find((hh) => !hh.pending && portraitKnown(hh.code)), locked, 'right');
        }
        this.layoutTerritories(); // 칩 줄이 생겼으니 국호 판 재배치
        this.layoutFactions();
        if (reducedMotion()) { onDone?.(); return; }
        this.chipObjs.forEach((o, i) => { o.baseAlpha = o.alpha; o.setAlpha(0); const y0 = o.y; o.y0 = y0; o.y = y0 + 10; this.tw({ targets: o, alpha: o.baseAlpha, y: y0, duration: MAP_FX.chipMs, delay: i * MAP_FX.chipGapMs, ease: 'Quad.easeOut' }); });
        this.after((this.chipObjs.length - 1) * MAP_FX.chipGapMs + MAP_FX.chipMs, () => onDone?.());
    }

    portraitsOn() { return this.R.chips.inMap && !this.R.chips.stack && this.vp.w >= 480 && this.vp.h >= 300; } // 1024x768(지도 폭 약 550)에서도 표시(초상 폭 상한 = 지도 30%)
    // VS 엠블럼 지름: 지도 짧은 변의 20%(56~112). 작은 화면은 크기만 줄이고 가운데 유지
    emblemSize() {
        if (this.R.chips.stack) return this.stackEmblemD ?? 30; // 세로 화면 지도 안 2단: 국호 칸 안 작은 엠블럼(showChips)
        if (this.emblemAsset()) { // 이미지 엠블럼: 1280 약 112~128, 667 약 72~84, 세로 폰(지도 밖 칩) 64
            if (!this.R.chips.inMap) return 64;
            return Math.round(L.short || this.lowH ? clamp(Math.min(this.vp.w, this.vp.h) * 0.28, 72, 84) : clamp(Math.min(this.vp.w, this.vp.h) * 0.24, 96, 128));
        }
        return Math.round(this.R.chips.inMap ? clamp(Math.min(this.vp.w, this.vp.h) * 0.2, 48, 112) : clamp(Math.min(this.vp.w, this.vp.h) * 0.16, 30, 112)); } // 세로 화면(지도 낮음)은 더 작게

    // VS 엠블럼(코드 그림: 교차한 두 칼 + 금테 이중 원 + 'VS'). 지도 가로 중앙 — 지도 안 칩이면 칩 줄 높이, 세로 화면이면 지도 하단
    showEmblem(rowH = 0) {
        const s = this.scene;
        const d = Math.round(rowH && !this.emblemAsset() ? Math.min(this.emblemSize(), Math.max(40, rowH + 12)) : this.emblemSize()); const r = d / 2; // 이미지 엠블럼은 칩 줄 높이로 줄이지 않음(칩 묶음은 emblemSize 폭만큼 비켜 배치)
        const cx = this.emblemX ?? this.vp.w / 2;
        const cy = this.emblemY != null ? this.emblemY : this.vp.h - r - 6;
        const o = s.add.container(cx, cy);
        this.emblemArt(o, r);
        const box = this.emblemAsset() ? d * 1.02 : d * 1.15; // 회피 영역: 이미지 = 정사각 이미지 크기(검·술 포함), 도형 = 칼끝 포함 1.15
        o.rect = { x: cx, y: cy, w: box, h: box };
        o.home = { x: cx, y: cy };
        this.emblem = o;
        this.overlay.add(o);
        this.placeEmblem();
        if (!reducedMotion()) { o.setScale(0.6).setAlpha(0); this.tw({ targets: o, scale: 1, alpha: 1, duration: 260, ease: 'Back.easeOut' }); }
    }

    // VS 엠블럼 에셋(안아트 2026-11-04): 글자 포함 ui.vs_emblem_text 우선 > 글자 없는 ui.vs_emblem(+ 'VS' 텍스트) > 없음(코드 도형)
    emblemAsset() {
        if (loaded.manifest?.['ui.vs_emblem_text']) return { lg: 'ui.vs_emblem_text', text: false };
        if (loaded.manifest?.['ui.vs_emblem']) return { lg: 'ui.vs_emblem', text: true };
        return null;
    }

    // VS 엠블럼 그림을 컨테이너 o(중심 원점)에 넣는다. 에셋이 있으면 지연 로드 — 로드 전에는 코드 도형, 도착하면 이미지로 교체(검·술 장식은 이미지에 포함)
    emblemArt(o, r) {
        const s = this.scene; const as = this.emblemAsset();
        const shape = this.emblemShape(r);
        const put = (tk) => {
            if (!o.scene || !tk || !s.textures.exists(tk)) return;
            o.removeAll(true);
            const im = s.add.image(0, 0, tk); im.setScale((r * 2) / Math.max(im.width, im.height));
            o.add(im);
            if (as.text) o.add(makeText(s, 0, 1, 'VS', { size: Math.max(14, Math.round(r * 0.5)), bold: true, heading: true, color: '#f4d98a', origin: [0.5, 0.5], stroke: { color: '#3a2508', width: Math.max(3, Math.round(r * 0.08)) } }));
        };
        const tk = as ? uiImageTex(s, as.lg, put) : null;
        if (tk) put(tk); else o.add(shape); // 이미 로드됨 = 바로 이미지(깜빡임 없음), 아니면 도형 먼저
        if (tk) shape.forEach((x) => x.destroy());
    }

    // 코드 도형 엠블럼(교차한 두 칼 + 금테 이중 원 + 'VS'). 에셋 없거나 로드 전 폴백
    emblemShape(r) {
        const s = this.scene;
        const g = s.add.graphics();
        const gold = 0xd9b45a; const goldD = 0x8a6a24; const steel = 0xcfd6e0;
        const sword = (a) => { // 칼날 + 코등이 + 손잡이(원 뒤로 끝이 보이게)
            const ca = Math.cos(a); const sa = Math.sin(a); const Ln = r * 1.45;
            const P = (u, v) => [u * ca - v * sa, u * sa + v * ca];
            const b0 = P(-Ln * 0.55, -2.5); const b1 = P(Ln, 0); const b2 = P(-Ln * 0.55, 2.5);
            g.fillStyle(steel, 1).fillTriangle(b0[0], b0[1], b1[0], b1[1], b2[0], b2[1]);
            g.lineStyle(1, 0x0b1020, 0.8).strokeTriangle(b0[0], b0[1], b1[0], b1[1], b2[0], b2[1]);
            const q0 = P(-Ln * 0.55, -r * 0.18); const q1 = P(-Ln * 0.55, r * 0.18); g.lineStyle(Math.max(2, r * 0.08), gold, 1).lineBetween(q0[0], q0[1], q1[0], q1[1]);
            const h0 = P(-Ln * 0.57, 0); const h1 = P(-Ln * 0.85, 0); g.lineStyle(Math.max(3, r * 0.1), goldD, 1).lineBetween(h0[0], h0[1], h1[0], h1[1]);
        };
        sword(-Math.PI * 0.75); sword(-Math.PI * 0.25);
        g.fillStyle(0x0b1020, 0.92).fillCircle(0, 0, r * 0.78);
        g.lineStyle(Math.max(2, r * 0.07), gold, 1).strokeCircle(0, 0, r * 0.78);
        g.lineStyle(1.5, goldD, 1).strokeCircle(0, 0, r * 0.64);
        const tx = makeText(s, 0, 1, 'VS', { size: Math.max(14, Math.round(r * 0.62)), bold: true, heading: true, color: '#f4d98a', origin: [0.5, 0.5], stroke: { color: '#3a2508', width: Math.max(3, Math.round(r * 0.1)) } });
        return [g, tx];
    }

    // 세로 화면(엠블럼이 지도 하단): 핀·핀 라벨(서가명 등)과 겹치면 같은 높이에서 좌우로 비켜 놓는다(가운데 우선). 지도 안 칩 줄의 엠블럼은 묶음 사이 고정
    placeEmblem() {
        const o = this.emblem;
        if (!o?.home || this.R.chips.inMap) return;
        const hw = this.vp.w / 2; const hh = this.vp.h / 2; const d = o.rect.w;
        const obs = [];
        [...this.shelfPins.values(), ...this.stagePins].forEach((p) => {
            if (!p.visible) return;
            obs.push({ x: p.x + hw, y: p.y + hh - 18, w: 34, h: 46 });
            const lb = p.label; if (lb?.visible && lb.lw) obs.push({ x: lb.x + hw, y: lb.y + hh, w: lb.lw, h: lb.lh });
        });
        const hit = (c) => obs.some((q) => Math.abs(c.x - q.x) * 2 < d + q.w && Math.abs(c.y - q.y) * 2 < d + q.h);
        const cands = [0, -1, 1, -2, 2, -3, 3].map((k) => ({ x: clamp(o.home.x + k * d * 1.1, d / 2 + 4, this.vp.w - d / 2 - 4), y: o.home.y }));
        const best = cands.find((c) => !hit(c)) ?? cands[0];
        o.setPosition(best.x, best.y); o.rect.x = best.x; o.rect.y = best.y;
    }

    // 대표 초상. side 'left' = 아군(지도 왼쪽), 'right' = 적군(오른쪽, 좌우 반전). 두 초상은 같은 상한·같은 바닥 기준선(지도 하단), 원본 비율 유지(잘림 없음)
    showKeyHero(c, hh, locked, side = 'left') {
        if (!hh || hh.pending || !portraitKnown(hh.code)) return;
        const s = this.scene; const right = side === 'right';
        const place = (tk) => {
            if (!this.scene || this.sel !== c || !tk || !s.textures.exists(tk)) return;
            this.heroLayer.list.filter((o) => o.side === side).forEach((o) => o.destroy());
            const x0 = right ? this.vp.w : 0;
            const img = s.add.image(x0, this.vp.h, tk).setOrigin(right ? 1 : 0, 1).setFlipX(right);
            img.side = side;
            const hCap = Math.min(this.vp.h * 0.62, this.vp.h - 40); const wCap = this.vp.w * 0.3;
            img.setScale(Math.min(hCap / img.height, wCap / img.width));
            if (locked) img.setTint(0x1c2433);
            this.heroLayer.add(img);
            this.layoutTerritories();
            this.layoutFactions();
            const ka = 1; // 대표 초상 불투명(사용자 2026-11-04 '스테이지 초상화 반투명 -> 불투명', 이전 0.82)
            if (reducedMotion()) img.setAlpha(ka); else { img.setAlpha(0).setX(x0 + (right ? 24 : -24)); this.tw({ targets: img, alpha: ka, x: x0, duration: 260, ease: 'Quad.easeOut' }); }
        };
        const k = ensurePortrait(s, hh.code, place, { thumb: false });
        if (k) place(k);
    }

    // ---------- 우측(또는 하단 시트) ----------
    buildSide() {
        const s = this.scene; const r = this.R.side;
        this.side = s.add.container(r.x, r.y);
        this.add(this.side);
        if (!this.wideLayout) {
            const g = s.add.graphics(); g.fillStyle(COLOR.navyDeep, 0.92).fillRoundedRect(0, 0, r.w, r.h, { tl: 12, tr: 12, bl: 0, br: 0 }).lineStyle(1, COLOR.accent, 0.5).strokeRoundedRect(0, 0, r.w, r.h, { tl: 12, tr: 12, bl: 0, br: 0 });
            g.fillStyle(COLOR.muted, 0.6).fillRoundedRect(r.w / 2 - 22, 6, 44, 4, 2); // 시트 손잡이
            this.side.add(g);
        }
        this.btnH = this.wideLayout ? 0 : this.compact ? 56 : 76; // 세로 화면: 출정 버튼 하단 고정(좁은 시트는 낮게)
        this.sumBox = s.add.container(this.wideLayout ? 0 : 12, this.wideLayout ? 0 : 16);
        this.side.add(this.sumBox);
        this.listW = this.wideLayout ? r.w : r.w - 24;
        this.listHead = s.add.container(this.wideLayout ? 0 : 12, 0);
        this.side.add(this.listHead);
        this.placeList(this.wideLayout ? this.sumH + 10 : 16 + this.sumH + 4);
        if (!this.wideLayout) { this.btnBox = s.add.container(12, r.h - this.btnH + 4); this.side.add(this.btnBox); }
    }

    // 목록 위치(ly = 목록 머리 y). 목록 높이 = 시트 남은 높이(출정 버튼 줄 제외). ScrollList 는 크기 변경이 없어 다시 만든다
    // 머리 줄 높이: 스테이지 보기('< 캠페인 목록' 줄) 26, 캠페인 목록은 안내 문구를 없애 0(목록이 그만큼 위로 늘어남)
    placeList(ly) {
        const s = this.scene; const r = this.R.side;
        const hh = this.mode === 'stages' && this.sel ? 26 : 0;
        if (this.stageList && this.listTop === ly && this.listHeadH === hh) return false;
        this.listTop = ly; this.listHeadH = hh;
        this.listHead.setY(ly);
        this.keepScroll = this.stageList?.content?.y ?? null; // 목록을 다시 만들어도(요약 높이 변화) 같은 목록이면 스크롤 위치 유지
        this.stageList?.destroy();
        // 주의: Container 예약 속성(list·body·data·state·name·type 등)과 겹치는 이름 금지 — this.list 를 덮으면 자식 배열이 사라져 렌더 루프가 멈춘다
        this.stageList = new ScrollList(s, { x: this.wideLayout ? 0 : 12, y: ly + hh, w: this.listW, h: Math.max(48, r.h - ly - hh - this.btnH), clip: true, bar: true, barW: 6 }); // 굵은 스크롤바(트랙+손잡이, 2026-11-14)
        this.side.addAt(this.stageList, this.side.getIndex(this.listHead) + 1);
        return true;
    }

    renderSummary(c) {
        const s = this.scene; const box = this.sumBox;
        box.removeAll(true);
        this.btnBox?.removeAll(true);
        if (!c) return;
        const wide = this.wideLayout;
        const w = wide ? this.R.side.w : this.R.side.w - 24;
        if (wide) box.add(s.add.rectangle(0, 0, w, this.sumH, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.55));
        const px = wide ? 14 : 0;
        let y = wide ? 12 : 0;
        // 1장: 주인공 열람 카드(기존 1장 헤더 버튼 이전)
        let protoW = 0;
        if (c.ch === 1 && this.onProtagonist) {
            protoW = 124;
            const cb = listRow(s, { x: w - protoW - (wide ? 10 : 0), y: y - 2, w: protoW, h: 28, onClick: () => this.onProtagonist() });
            cb.add(makeText(s, protoW / 2, 14, '주인공 열람 카드', { size: 12, bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
            box.add(cb);
        }
        const tt = fitText(makeText(s, px, y, c.title, { size: wide && !this.lowH ? 22 : 18, heading: true, color: '#FFE08A' }), w - px * 2 - protoW - 8); // 제목 위계 강화(2026-11-14 '타이틀이 눈에 안 들어옴')
        box.add(tt); y += tt.height + 4;
        const sub = [c.name && c.name !== c.title ? c.name : '', c.era, c.preview ? '준비 중' : ''].filter(Boolean).join(' · ');
        // 출정 버튼 자리(가로 = 요약 상자 아래쪽, 세로 = 하단 고정 줄). 가로 요약의 모든 줄은 버튼 위(btnTop)까지만
        const bh = wide && this.lowH ? 36 : !wide && this.compact ? 40 : 44;
        const by0 = wide ? this.sumH - bh - 12 : this.compact ? 8 : 24;
        const so = sortieOf(c);
        const hn = !c.preview && c.heroNeed?.need ? c.heroNeed : null;
        // 하단 버튼 줄: [다음 배지] ... [이어하기][출정]. 이어하기 = 진행 중 전투 가장 최근 1건(없으면 숨김)
        const rs = this.resume;
        const rsW = rs ? (wide ? Math.round(clamp(w * 0.26, 104, 150)) : Math.min(120, Math.round(w * 0.32))) : 0;
        const bw = wide ? Math.min(rs ? 150 : 180, w - 28 - (rs ? rsW + 8 : 0)) : w;
        const bx = wide ? w - bw - 14 : 0; const by = by0;
        // 필수 영웅 부족: '소집으로 이동' 바로가기(가챠 탭 이동만, 자동 구매 없음)
        const gachaW = this.onGacha && !c.preview && (so.missing?.length || hn?.missing.length) ? 104 : 0;
        const leftR = (rs ? bx - rsW - 8 : bx) - 8; // 가로: 배지가 쓸 수 있는 오른쪽 끝
        const badgeUp = wide && leftR - px < 150; // 버튼 줄 왼쪽이 좁으면 배지를 버튼 줄 위 한 줄로
        const badgeH = wide ? (badgeUp ? 26 : gachaW ? 22 : 28) : 20;
        const btnTop = wide ? (badgeUp ? by0 - badgeH - 10 : by0 - 4) : this.sumH + (this.compact ? 0 : 24); // 세로 시트: 요약이 sumH 를 넘으면 줄 생략(목록이 밀려 줄어들지 않게)
        // 낮은 화면은 부제 생략(난이도·보유 줄 우선)
        if (sub && y + 18 <= btnTop && !(wide && this.lowH)) { const st = fitText(makeText(s, px, y, sub, { size: 12, color: '#C9C2AE' }), w - px * 2); box.add(st); y += st.height + 4; } // 부제는 작고 흐리게(제목 우선)
        // 정보 줄(2026-11-14 재디자인: 난이도 불꽃 게이지 · 권장 레벨 방패 배지(내 영웅 상위 5명 평균 대비 녹/주황/적) · 진행 바 + 별 칩, 공통 ui/campaignInfo.infoStrip).
        //  가로 = 출정 버튼 줄 바로 위에 고정(설명문 아래 빈 여백 활용) -> 설명문·보조 줄은 그 위(tb)까지만. 세로 시트 = 흐름 안 한 줄(compact)
        const ref = so.stage ?? c.stages[0]?.s;
        const prog = !c.placeholder && c.total > 0;
        const hasStrip = !!ref || prog;
        const stripH = wide ? (this.lowH ? 30 : 44) : 30;
        const tb = wide && hasStrip ? btnTop - stripH - 8 : btnTop;
        const tw = Math.min(w - px * 2, 560); // 설명문 최대 줄 길이(가독성)
        if (c.summaryLines?.length && wide) { // 요약 줄(summary_lines): 줄마다 최대 2줄 줄바꿈, 정보 줄 위까지만
            c.summaryLines.forEach((ln) => {
                if (y + 17 > tb) return;
                const sm = fitText(makeText(s, px, y, ln, { size: 13, color: '#D6D0C0', wrap: tw }), tw, { maxLines: 2 });
                sm.setLineSpacing(3);
                if (y + sm.height > tb) { sm.destroy(); return; }
                box.add(sm); y += sm.height + 4;
            });
            y += 3;
        } else if (c.summary && wide && y + 17 <= tb) {
            const sm = fitText(makeText(s, px, y, c.summary, { size: 13, color: '#D6D0C0', wrap: tw }), tw, { maxLines: Math.max(1, Math.min(3, Math.floor((tb - y) / 20))) });
            sm.setLineSpacing(3);
            if (y + sm.height > tb) sm.destroy(); else { box.add(sm); y += sm.height + 6; }
        }
        // 비교 기준(2026-11-14 편성): 편성(라인업) 캐시가 있으면 편성 상위 recommended_party 명, 없으면 보유 영웅 상위 3명 평균
        const party = Number(ref?.recommended_party) || 3; const lu = session.lineup?.lineup ?? []; const ll = lineupLevel(lu, party);
        const stripO = { d: ref ? (ref.difficulty ?? 0) : null, rec: ref?.recommended_level, my: ll ? ll.avg : myHeroLevel(session.heroes), myTotal: ll?.total, recTotal: Number(ref?.recommended_total) || null, party, lineup: lu, cleared: prog ? c.cleared : 0, total: prog ? c.total : 0, stars: c.stars, maxStars: c.maxStars };
        // 서가 필수 영웅 보유 현황(주인공 제외). 가로: 별도 줄(공간 있을 때), 세로: 정보 줄 아래
        const needTxt = hn ? `필요 영웅 ${hn.need}명 중 ${hn.owned}명 보유` : '';
        if (hasStrip && !wide && y + stripH <= btnTop) { const sp = infoStrip(s, w - px * 2, stripH, stripO).setPosition(px, y); box.add(sp); y += stripH + 6; }
        if (needTxt && y + 16 <= tb) { const nt = fitText(makeText(s, px, y, needTxt, { size: 12, color: hn.missing.length ? CSS.dangerText : '#C9C2AE' }), w - px * 2); box.add(nt); y += nt.height + 4; } // 별도 줄(잘림 방지)
        // 지도 메타 요약이 없는 캠페인(튜토리얼 등): 출정 대상 스테이지의 보상·합류 영웅(사실 데이터)으로 빈 칸을 채운다
        if (!c.summary && !c.summaryLines?.length && ref && wide) {
            const rw = ref.rewards ?? {};
            const parts = [rw.exp ? `영웅 EXP ${rw.exp}` : '', rw.user_exp ? `계정 EXP ${rw.user_exp}` : '', rw.gold ? `골드 ${rw.gold}` : ''].filter(Boolean);
            const join = (Array.isArray(ref.join_hero) ? ref.join_hero : []).map((h) => heroNameOf(typeof h === 'string' ? h : h?.hero_code ?? h?.code)).filter(Boolean);
            const lines = [parts.length ? `보상  ${parts.join(' · ')}` : '', join.length ? `첫 클리어 합류  ${join.join(', ')}` : ''].filter(Boolean);
            lines.forEach((ln) => { if (y + 16 > tb) return; const ft = fitText(makeText(s, px, y, ln, { size: 12, color: '#C9C2AE' }), w - px * 2); box.add(ft); y += ft.height + 4; });
        }
        if (hasStrip && wide) box.add(infoStrip(s, w - px * 2, stripH, stripO).setPosition(px, tb + 2));
        const sumText = c.summary || (c.summaryLines ?? []).join(' ');
        if (sumText && !wide && !this.compact) { const sm = fitText(makeText(s, px, y, sumText, { size: 12, color: '#C9C2AE', wrap: w }), w, { maxLines: 2 }); box.add(sm); y += sm.height + 2; }
        // 세로 시트: 요약 실제 높이에 맞춰 목록을 붙인다(빈 공간 제거). 상한 sumH(넘치면 잘리지 않게 목록이 아래로)
        if (!wide && this.placeList(16 + Math.min(Math.max(y, 40), this.sumH + 40) + 8)) this.renderList();
        // 출정/복습(추천 스테이지 = pickStage). 잠김이면 비활성 + 사유
        const tgt = wide ? box : this.btnBox;
        const bw1 = wide ? bw : bw - (gachaW ? gachaW + 8 : 0) - (rs ? rsW + 8 : 0);
        const btn = new Button(s, { x: bx, y: by, w: bw1, h: bh, label: so.label, variant: 'primary', disabled: !so.stage, reason: so.reason ?? '', onClick: () => so.stage && this.onPick?.(so.stage, { direct: true }) }); // 출정 버튼 = 확인 완료(확인창 생략)
        tgt.add(btn);
        // 이어하기(출정 옆): 라벨 + 작은 글자(스테이지명 · 턴). 가로 = 출정 왼쪽, 세로 = 출정 오른쪽
        if (rs) {
            const rx = wide ? bx - rsW - 8 : bx + bw1 + 8;
            const rb = new Button(s, { x: rx, y: by, w: rsW, h: bh, label: '이어하기', variant: 'default', size: 14, onClick: () => this.onResume?.(rs) });
            const turn = rs.status === 'deployment' ? '배치 중' : `${rs.turn ?? 1}턴`;
            rb.label.setY(-7);
            rb.face.add(fitText(makeText(s, 0, bh >= 40 ? 10 : 8, `${rs.stage_name ?? '전투'} · ${turn}`, { size: 10, color: '#C9C2AE', origin: [0.5, 0.5] }), rsW - 14));
            tgt.add(rb);
        }
        let badgeW = wide ? leftR - px : w; let badgeY = wide ? by + (bh - badgeH) / 2 : 0;
        if (gachaW) {
            let gx = wide ? px : bx + bw1 + 8 + (rs ? rsW + 8 : 0); let gy = wide ? by + bh - 22 : by + (bh - 24) / 2;
            if (wide && badgeUp) { badgeW = w - px * 2 - gachaW - 8; gx = px + badgeW + 8; gy = by - badgeH - 6 + (badgeH - 24) / 2; } // 배지 줄 오른쪽
            else if (wide) badgeY = by - 4; // 버튼 줄 왼쪽 위(배지) / 아래(소집)
            const gb = listRow(s, { x: gx, y: gy, w: gachaW, h: 24, onClick: () => this.onGacha() });
            gb.add(makeText(s, gachaW / 2, 12, '소집으로 이동', { size: 12, bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
            tgt.add(gb);
        } else if (wide && badgeUp) badgeW = w - px * 2;
        if (wide && badgeUp) badgeY = by - badgeH - 6;
        // '다음' 배지(칭호 리본 + 상태 아이콘). 좁은 시트(compact)는 생략(목록 행에 같은 사유 표시)
        if (wide || !this.compact) {
            const no = so.stage ? c.stages.find((t) => t.s === so.stage)?.no : null;
            const nm = so.stage ? (no ? `${no}. ${so.stage.name}` : so.stage.name) : '';
            const bd = !so.stage ? (so.soon ? { kind: 'soon', tag: c.hiddenLocked ? '잠김' : '준비', icon: c.hiddenLocked ? 'lock' : 'hourglass', text: so.reason ?? '곧 공개' } : { kind: 'locked', tag: '잠김', icon: 'lock', text: so.reason || '아직 열리지 않았습니다' })
                : so.label === '복습' ? { kind: 'done', tag: '완료', icon: 'check', text: `다음 스테이지 없음 · 복습 ${nm}` }
                    : { kind: 'next', tag: '다음', icon: 'tab_stage', text: nm };
            if (badgeW >= 60) tgt.add(this.nextBadge(bd, wide ? px : 0, badgeY, badgeW, badgeH));
        }
    }

    // '다음' 배지: 남색 띠 + 금 테두리, 왼쪽 칭호 리본(상태 아이콘 + 라벨, 오른쪽 끝 화살촉), 오른쪽 스테이지 이름. 아이콘 = uiskin ico.*(없으면 pix.lock, 그래도 없으면 글자만)
    nextBadge({ kind, tag, icon, text }, x, y, w, h) {
        const s = this.scene; const box = s.add.container(x, y);
        const P = {
            next: { fill: C.gold, hi: C.goldLight, ink: '#1A1406', txt: '#f0d58c' },
            done: { fill: C.gold, hi: C.goldLight, ink: '#1A1406', txt: '#C9C2AE' },
            soon: { fill: 0x8a7a52, hi: C.goldLight, ink: '#1A1406', txt: CSS.accent },
            locked: { fill: C.locked, hi: 0xaab0bb, ink: '#0B1020', txt: CSS.dangerText },
        }[kind] ?? { fill: C.gold, hi: C.goldLight, ink: '#1A1406', txt: '#f0d58c' };
        const g = s.add.graphics();
        g.fillStyle(COLOR.navyDeep, 0.95).fillRoundedRect(0, 0, w, h, 4).lineStyle(1, P.fill, 0.9).strokeRoundedRect(0.5, 0.5, w - 1, h - 1, 4);
        g.lineStyle(1, P.hi, 0.22).strokeRoundedRect(3, 3, w - 6, h - 6, 2);
        const icS = Math.max(12, h - 10);
        const ic = icon ? (skinIcon(s, icon, icS) ?? (icon === 'lock' ? pixelImage(s, 'pix.lock', 0, 0, icS) : icon === 'hourglass' ? this.hourglassIcon(icS) : null)) : null;
        const tt = makeText(s, 0, h / 2, tag, { size: h >= 24 ? 12 : 11, bold: true, color: P.ink, origin: [0, 0.5] });
        const tw = 8 + (ic ? icS + 4 : 0) + tt.width + 4; const n = Math.round(h * 0.34);
        const rib = [{ x: 0, y: 0 }, { x: tw, y: 0 }, { x: tw + n, y: h / 2 }, { x: tw, y: h }, { x: 0, y: h }];
        g.fillStyle(P.fill, 1).fillPoints(rib, true);
        g.fillStyle(0xffffff, 0.2).fillRect(1, 1, tw, Math.round(h * 0.4)); // 상단 광택
        g.lineStyle(1, P.hi, 0.9).strokePoints(rib, true);
        g.fillStyle(P.fill, 0.9).fillPoints([{ x: w - 8, y: h / 2 - 3 }, { x: w - 5, y: h / 2 }, { x: w - 8, y: h / 2 + 3 }, { x: w - 11, y: h / 2 }], true); // 끝 마름모 장식
        box.add(g);
        let cx = 8;
        if (ic) { ic.setPosition(cx + icS / 2, h / 2); if (kind === 'locked') ic.setTint(0x2a3040); box.add(ic); cx += icS + 4; }
        tt.setX(cx); box.add(tt);
        const nx = tw + n + 8;
        if (w - nx - 16 > 20) box.add(fitText(makeText(s, nx, h / 2, text, { size: h >= 24 ? 13 : 12, bold: kind === 'next', color: P.txt, origin: [0, 0.5] }), w - nx - 16));
        return box;
    }

    // '준비' 배지 모래시계: uiskin 에는 ico.hourglass 가 없어(강화면 gacha129) 이미 로드된 다른 아틀라스/이미지를 찾아 쓴다. 없으면 null -> 글자만
    hourglassIcon(size) {
        const s = this.scene; const T = s.textures;
        if (T.exists('card_icons') && T.get('card_icons').has('ico.hourglass')) return s.add.image(0, 0, 'card_icons', 'ico.hourglass').setDisplaySize(size, size);
        const k = texKey('ui.battle.ico.hourglass');
        return k && T.exists(k) ? s.add.image(0, 0, k).setDisplaySize(size, size) : null;
    }

    revealSummary() {
        if (reducedMotion()) { this.sumBox.setAlpha(1); return; }
        this.sumBox.setAlpha(0.25);
        this.tw({ targets: this.sumBox, alpha: 1, duration: MAP_FX.summaryMs });
    }

    renderList() {
        this.placeList(this.listTop); // 모드가 바뀌면 머리 줄 높이(0/26)에 맞춰 목록을 다시 놓는다(같으면 그대로)
        const s = this.scene; const lc = this.stageList.content; const w = this.listW - 10;
        // 스크롤 유지(2026-11-04 서가 10스테이지): 같은 목록(모드·캠페인)을 다시 그릴 때는 이전 위치, 다른 목록이면 맨 위. 390 세로 시트에서 스테이지를 누를 때마다 맨 위로 튀던 문제
        const listKey = `${this.mode}|${this.mode === 'stages' ? this.sel?.key ?? '' : ''}`;
        const keepY = this.lastListKey === listKey ? (this.keepScroll ?? lc.y ?? 0) : 0;
        this.keepScroll = null; this.lastListKey = listKey;
        lc.removeAll(true);
        this.listHead.removeAll(true);
        let y = 0;
        if (this.mode === 'stages' && this.sel) {
            const c = this.sel;
            const back = listRow(s, { x: 0, y: 0, w: 132, h: 24, onClick: () => this.leaveStages() });
            back.add(makeText(s, 66, 12, '< 캠페인 목록', { size: 12, bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
            this.listHead.add([back, fitText(makeText(s, 142, 12, /스테이지\s*$/.test(c.title ?? '') ? c.title : `${c.title} 스테이지`, { size: 13, bold: true, color: '#f0d58c', origin: [0, 0.5] }), w - 146)]);
            const rowH = 58;
            c.stages.forEach((t) => {
                const st = t.s;
                const row = listRow(s, { x: 0, y, w, h: rowH, disabled: !stagePlayable(st) || !!c.preview, onClick: () => { if (c.preview) return; const o = this.stagePins.find((p) => p.t === t); if (o) this.ripple(o, 1); this.pickTerr(st); this.onPick?.(st); } });
                row.add(makeText(s, 12, 18, `${t.no}`, { size: 14, bold: true, color: stagePlayable(st) ? CSS.accent : CSS.muted, origin: [0, 0.5] }));
                const isRec = st.id === this.model.recStageId;
                row.add(fitText(makeText(s, 34, 18, st.name, { size: 15, bold: true, color: stagePlayable(st) ? CSS.text : CSS.muted, origin: [0, 0.5] }), w - 34 - (isRec ? 58 : 12)));
                if (isRec) row.add(ribbonTag(s, '추천', { h: 18 }).setPosition(w - 1, 6)); // 캠페인 카드와 같은 모서리 리본
                const state = stagePlayable(st) ? (st.clear_count > 0 ? `최고 ${stars(st.best_stars ?? 0)}  클리어 ${st.clear_count}회` : '미클리어') : stageLockText(st);
                const where = [t.year, t.place].filter(Boolean).join(' · ');
                row.add(fitText(makeText(s, 34, 40, where ? `${state}   ${where}` : state, { size: 11, color: stagePlayable(st) ? '#C9C2AE' : CSS.dangerText, origin: [0, 0.5] }), w - 46));
                row.clipH = rowH;
                lc.add(row);
                y += rowH + 6;
            });
        } else {
            // 안내 문구('캠페인 · 시대 (한 번 더 누르면 …)') 삭제(사용자 2026-11-06). 같은 캠페인 재선택 -> 스테이지 보기 동작은 select() 그대로
            // 2026-11-14 카드 재디자인(사용자 "디자인이 이상해"): 장식 프레임(row 스킨) 대신 얇은 금테 + 모서리 포인트, 왼쪽 상태 아이콘(완료 체크·잠금 자물쇠·준비 모래시계·장 번호),
            //  제목 크게 / 아래 줄 [연대 칩][진행 바 n/m][★ 칩], 추천 = 모서리 리본, 선택 = 금 글로우 + 오른쪽 화살표. 높이 56 -> 50(한 화면 노출 증가). 공통 헬퍼 ui/campaignInfo.js
            const rowH = 50;
            this.model.campaigns.forEach((c, ci) => {
                const state = campaignState(c);
                const note = c.hiddenLocked ? `서가 기록 ${c.cleared}/${c.total} · 모든 서가를 마치면 열립니다` // 숨은 종장 잠김: 이름·시대 비노출, 진행도만
                    : c.preview ? '준비 중 · 곧 공개'
                        : !c.unlocked ? (sortieOf(c).reason || stageLockText(c.stages[0]?.s) || '아직 열리지 않았습니다') : '';
                const card = campaignCard(s, 0, y, {
                    w, h: rowH, selected: c === this.sel, state, title: c.title, era: c.hiddenLocked ? '' : c.era, note,
                    cleared: c.cleared, total: c.total, stars: c.stars, maxStars: c.maxStars, rec: c.key === this.model.recKey,
                    ready: !!c.heroReady && !!c.unlocked && !c.preview && !c.hiddenLocked, // 필수 영웅 전원 보유 + 출정 가능 = '출전 가능'. 미충족은 기존 잠김(흐림 + 필요 영웅 사유) 그대로
                    no: ci + 1 /* 목록 순번(서가 ch 번호는 비연속이라 쓰지 않음) */, onClick: () => this.select(c),
                });
                lc.add(card);
                y += rowH + 6;
            });
        }
        this.stageList.setContentHeight(y + 6);
        this.stageList.scrollTo(keepY);
        this.stageList.refreshMask();
    }

    // ---------- 카메라 목표 ----------
    shelfCam(c) { return c.focus ? this.cc({ x: c.focus.x, y: c.focus.y, z: c.zoom }) : this.cc({ x: 0.5, y: 0.5, z: 1 }); }

    stageCam(c) {
        const pts = c.stages.map((t) => t.pin).filter(Boolean);
        if (!pts.length) return this.shelfCam(c);
        const zMin0 = Math.max(1, c.zoom * 0.5);
        const st = this.R.chips.stack ? this.R.chips.h : 0; // 세로 화면 지도 안 칩 띠: 띠 위 영역에 핀을 맞춘다
        const f = fitBounds(pts, st ? { w: this.vp.w, h: Math.max(80, this.vp.h - st) } : this.vp, { pad: 0.62, zMin: zMin0, zMax: 144 });
        // 넓은 지도(폭 600 이상): 좌우 대표 초상(각 최대 폭 30%, showKeyHero)이 하단 핀을 가리지 않게 핀 가로 범위를 가운데 칸(폭 40%) 안으로(강화면 gacha107: ch14 3·4·7번 핀이 수 양제 초상에 가림).
        //  좁은 화면(390 등)은 초상이 작고 시야가 좁아 기존 그대로
        if (this.vp.w >= 600 && pts.length > 1) {
            const xs = pts.map((p) => p.x); const bx = Math.max(1e-6, Math.max(...xs) - Math.min(...xs));
            const kC = 1 - 2 * 0.3; f.z = Math.max(zMin0, Math.min(f.z, (0.62 * kC) / bx));
        }
        // 칩 줄·플레이트를 피해 약간 아래로(데스크톱 칩은 지도 하단)
        // 상한 적용 후 줌 기준으로 칩 회피 오프셋 계산
        const z = this.cc({ x: f.x, y: f.y, z: f.z }).z; const kk = this.vp.w * z;
        return this.cc({ x: f.x, y: f.y + (this.R.chips.inMap ? (st ? st / 2 : 30) : 0) / (kk / 2), z });
    }

    // ---------- 연출 ----------
    tw(cfg) { const t = this.scene.tweens.add(cfg); this.fx.push(t); return t; }
    after(ms, fn) { const e = this.scene.time.delayedCall(ms, () => { this.fx = this.fx.filter((x) => x !== e); if (this.scene) fn(); }); this.fx.push(e); return e; }

    // 진행 중 연출 취소(현재 카메라에서 다음 이동 시작)
    cancelFx() {
        this.travelTw?.remove(); this.travelTw = null; this.traveling = false;
        this.fx.forEach((t) => t.remove?.(false));
        this.fx = [];
        this.shelfPins.forEach((o) => { o.pinBody.setPosition(0, 0).setScale(1); o.ring.setAlpha(0); });
        this.chipObjs.forEach((o) => { o.setAlpha(o.baseAlpha ?? 1); if (o.y0 != null) o.y = o.y0; });
        // 요약 카드(출정 버튼 포함)는 select() 가 0.25로 낮추고 revealSummary() 에서만 복구 -> 체인을 끊을 때 함께 복구(강화면 gacha129: 연출 중 스테이지 진입 후 반투명 고정). select() 는 cancelFx 뒤에 다시 0.25로 낮춘다
        this.sumBox?.setAlpha(1);
    }

    travelTo(target, onDone) {
        this.travelTw?.remove(); this.travelTw = null;
        if (reducedMotion()) { this.traveling = false; this.applyCam(target); onDone?.(); return; }
        const plan = this.travel.plan(this.cam, target, this.vp);
        const o = { t: 0 };
        this.traveling = true;
        this.layoutFactions();
        this.travelTw = this.scene.tweens.add({
            targets: o, t: 1, duration: plan.duration, ease: 'Linear',
            onUpdate: () => { const sm = this.travel.sample(plan, o.t); this.applyCam(sm.cam, sm.rot, sm.tiltY); },
            onComplete: () => { this.travelTw = null; this.traveling = false; this.applyCam(target); onDone?.(); },
        });
    }

    dropPin(o, onDone) {
        if (!o) { onDone?.(); return; }
        if (reducedMotion()) { o.pinBody.setPosition(0, 0).setScale(1); onDone?.(); return; }
        o.pinBody.setPosition(0, -MAP_FX.pinDropPx).setScale(1);
        o.shadow.setScale(0.5);
        this.tw({ targets: o.shadow, scale: 1, duration: MAP_FX.pinDropMs, ease: 'Quad.easeIn' });
        this.tw({
            targets: o.pinBody, y: 0, duration: MAP_FX.pinDropMs, ease: 'Quad.easeIn',
            onComplete: () => this.tw({
                targets: o.pinBody, scaleX: 1.18, scaleY: 0.72, duration: MAP_FX.squashMs, ease: 'Quad.easeOut',
                onComplete: () => this.tw({ targets: o.pinBody, scaleX: 1, scaleY: 1, duration: MAP_FX.bounceMs, ease: 'Back.easeOut', onComplete: () => onDone?.() }),
            }),
        });
    }

    ripple(o, count = MAP_FX.rippleCount) {
        if (!o || reducedMotion()) return;
        o.ring.setScale(o.ring.s0).setAlpha(1);
        this.tw({ targets: o.ring, scale: o.ring.s1, alpha: 0, duration: MAP_FX.rippleMs, repeat: count - 1, ease: 'Sine.easeOut' });
    }

    // ---------- 선택 ----------
    select(c, { user = true } = {}) {
        if (!this.scene || !c) return;
        if (user && this.sel === c) { if (this.mode === 'shelf' && c.stages.length) this.enterStages(); return; }
        this.cancelFx();
        this.sel = c; this.mode = 'shelf'; lastKey = c.key;
        this.clearStagePins(); this.clearChips(); this.factionsOn = false;
        this.buildFactions(c);
        this.renderList();
        this.renderSummary(c);
        this.sumBox.setAlpha(reducedMotion() ? 1 : 0.25);
        this.renderPlate(c);
        this.updateTerritories();
        const pin = this.shelfPins.get(c.key);
        this.ensureRegions(c); // 지역판 지연 로드(줌 이동과 동시에 시작, 준비 전에는 세계판만)
        this.travelTo(this.shelfCam(c), () => {
            this.dropPin(pin, () => {
                this.ripple(pin);
                this.showFactions();
                const go = () => this.showChips(c, () => this.revealSummary());
                if (reducedMotion()) go(); else this.after(150, go);
            });
        });
    }

    enterStages() {
        const c = this.sel;
        this.cancelFx();
        this.mode = 'stages';
        if (!this.wideLayout) { this.plate.setVisible(false); this.plateRect = null; } // 세로 화면 스테이지 보기: 제목은 목록 머리에 있으므로 지도 플레이트를 숨겨 핀 가림 방지
        this.ensureBattle(c); // 전장 지도(있으면) 지연 로드 — 준비되면 덮고 확대 상한을 풀어 다시 맞춘다
        this.buildStagePins(c);
        this.renderList();
        this.updateTerritories();
        this.travelTo(this.stageCam(c), () => {
            const pins = [...this.stagePins].sort((a, b) => a.order - b.order);
            const showOne = (i) => {
                const o = pins[i];
                if (!o) return;
                o.shown = true; this.roadN = o.order + 1; // order = c.stages 인덱스(가상 스테이지는 핀이 없어 건너뜀)
                this.redraw();
                this.dropPin(o);
                if (o.isRec) this.after(MAP_FX.pinDropMs, () => this.ripple(o));
            };
            if (reducedMotion()) { pins.forEach((_, i) => showOne(i)); return; }
            pins.forEach((_, i) => this.after(i * MAP_FX.stagePinGapMs, () => showOne(i)));
        });
    }

    leaveStages() {
        const c = this.sel;
        if (!c) return;
        this.cancelFx();
        this.plate.setVisible(true); this.plateRect = this.plateFull ?? this.plateRect;
        this.mode = 'shelf';
        this.clearStagePins();
        this.renderList();
        this.updateTerritories();
        this.travelTo(this.shelfCam(c), () => this.redraw());
    }
}
