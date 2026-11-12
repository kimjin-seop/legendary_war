import Phaser from 'phaser';
import { Button } from '../ui/Button.js';
import { showToast } from '../ui/Toast.js';
import { makeText, fitText, addBackdrop } from '../ui/common.js';
import { noteText, alertModal, confirmModal, listRow, ScrollList } from '../ui/widgets.js';
import { Modal } from '../ui/Modal.js';
import { Tabs } from '../ui/Tabs.js';
import { slice } from '../ui/skin.js';
import { withUiImage } from '../ui/uiImage.js';
import { COLOR, CSS, syncView } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { session } from '../api/client.js';
import { gameApi, setWarScenario, getWarScenario } from '../api/gameApi.js';
import { messageOf } from '../api/errors.js';
import { audio } from '../audio.js';
import { loaded, manifestHas, ensureScope, scopeOf, texKey, withVer, ensurePortraitTex } from '../assets.js';
import { project, fitBounds, normBounds } from '../ui/stageMapMath.js';
import { loadTerritories } from '../campaign/campaignMapData.js';
import { plaqueFace, loadPlaqueFont, plaqueCovers } from '../ui/plaqueFonts.js';
import { noteWarState, noteNoSeason, feedSeenGet, feedSeenSet, isMyCountryAlert } from './warEntry.js';

// 시즌 전쟁(수직 슬라이스): 국가 선택(미가입) -> 시즌 지도(영토 핀 + 반투명 원, 소유국 색, 점령도 게이지, 인접선) -> 공격 -> Battle 씬.
// 서버(routes/api.php 상단 주석): GET /api/war/state, POST /api/war/join, GET /api/war/map, POST /api/war/territories/{code}/attack.
// 판정(인접·자국·공성·쿨다운·일일 횟수)은 전부 서버. 지도의 attackable/attack_blocked_reason 을 그대로 표시하고, 공격 거부 코드는 errors.js 한국어 문구.
// 지도: 캠페인 지도와 같은 좌표계(등장방형 정규화 x=(lon+180)/360, y=(90-lat)/180, ui/stageMapMath)와 같은 manifest 지도 에셋
//  (map.battle.imjin_battle: 임진 전장 지역판, bounds.normalized) 사용. 에셋이 없으면 남색 바다 단순 모드. 영토 폴리곤 없음(핀 + 원, 결정 Q12/Q13).
// 전투 진입: scene.start('Battle', {mode:'war', battleId, fresh:true, territory}). 결과창은 result.war 를 한 줄로 보여 주고 '시즌 지도로' 복귀.
const MAP_KEY = 'map.battle.imjin_battle'; // 기본(임진) 지도 이미지
// 시나리오별 지도 키(안아트 2026-11-04: map.battle.<scenario>_battle, bounds·landmask 포함 = imjin 과 같은 규칙). manifest 에 없으면:
//  시나리오 코드가 없거나 imjin = 임진 지도, 다른 시나리오 = 지도 없이 남색 단순 모드(다른 지역 지도를 깔면 영토 핀이 엉뚱한 땅 위에 놓인다)
const mapKeyFor = (scn) => { const k = scn ? `map.battle.${scn}_battle` : MAP_KEY; return manifestHas(k) ? k : (!scn || scn === 'imjin') && manifestHas(MAP_KEY) ? MAP_KEY : null; };
// 시즌 전쟁 지도 r2(안아트 2026-11-04, 서버 거점 기준): ui.season.map.base @1x 531x846 = 경도 124.3E~ / 위도 42.4N~ 90px/도(px = ((lon-124.3)*90, (42.4-lat)*90)).
//  임진 시나리오이고 키가 있으면 이 지도 + 거점별 영역 cell.<code>(점령 진영색 알파 0.55 틴트) + cell_edges. 키가 없으면 기존 map.battle 지도(서버 lon/lat 투영) 폴백
const SEASON_BASE = 'ui.season.map.base';
const SEASON_GEO = { lon0: 124.3, lat0: 42.4, ppd: 90, w: 531, h: 866 }; // r3(2026-11-04): 남쪽 여백 +20(531x866), 좌표식 동일
const SEASON_VB = { x0: (SEASON_GEO.lon0 + 180) / 360, x1: (SEASON_GEO.lon0 + SEASON_GEO.w / SEASON_GEO.ppd + 180) / 360, y0: (90 - SEASON_GEO.lat0) / 180, y1: (90 - (SEASON_GEO.lat0 - SEASON_GEO.h / SEASON_GEO.ppd)) / 180 };
const SEASON_TINT = { joseon: 0x2e6fd8, japan: 0xc8322e }; const SEASON_NEUTRAL = 0x6b7280;
const SEA_EDGES = new Set(['busan|tsushima', 'jeju|jeonju']); // 바다 위 점선(#9FC3E8)
// r2 지도 보정 상수(강화면 gacha112: 땅이 검은 배경과 구분 안 됨·틴트 약함). 안아트 에셋 밝기 보정이 오면 landLift·tintAlpha 를 낮춘다
const SEASON_FX = { sea: 0x3f5f80, seaAlpha: 1, landLift: 0, tintAlpha: 0.38, terrainAlpha: 0.35, edgeAlpha: 1, glowAlpha: 0.5, pad: 10 }; // gacha117: 틴트 0.65 는 지형이 안 보여 0.38 + 지형 한 겹(일반 혼합 0.35) + 경계 금빛 글로우(가산 미사용) // landLift(가산 혼합 겹침)는 0: r3 에셋이 밝고, 필터·가산 혼합 조합을 피함(gacha114) // r3 에셋 땅 밝기 보정 반영: landLift 0.5 -> 0.15, tintAlpha 0.7 -> 0.65
// 지도 위 HUD 예약 높이(타이틀·비율 바): 지도 이미지를 그 아래에 두어 핀·이름표를 가리지 않게(gacha112: 667 의주 가림)
const hudBig = (r) => !L.short && !L.portrait && r.w >= 520 && r.h >= 380;
const hudTop = () => 0; // 지도 위 HUD 없음(타이틀·비율 바·진영 판은 우측 패널로 이동, 사용자 2026-11-04) -> 예약 높이 0
// 사용자 2026-11-04 '시즌전쟁 조선지도 원래대로 롤백': r2/r3 시즌 지도(base + 셀 틴트 + 지형·경계 글로우 + 진군 화살표 + 바다 판) 비활성.
//  false = 기존 map.battle.imjin_battle 지도(서버 lon/lat 투영 + 보로노이 세력 색칠 + 마스크 필터) 폴백. 코드·에셋은 남겨 true 로 되돌리면 재활성
const SEASON_R3_MAP = false;
const seasonOn = (scn) => SEASON_R3_MAP && (!scn || scn === 'imjin') && manifestHas(SEASON_BASE);
// 시나리오 선택 줄(동시 진행 시즌이 2개 이상일 때만): 코드 -> 표시명(없으면 시즌 이름)
const SCN_LABEL = { imjin: '1592년 조선', france: '프랑스', rome: '로마', legnica: '레그니차' }; // 표시명(코드 imjin 은 그대로, 사용자 지시 2026-11-04: '임진' 표기 제거)
// 국가 코드 -> 표시명 폴백(응답에 국가 목록이 없을 때만)
const COUNTRY_KO = { joseon: '조선', japan: '일본', ming: '명', france: '프랑스', england: '잉글랜드', burgundy: '부르고뉴', rome: '로마', carthage: '카르타고', numidia: '누미디아', balearic: '발레아레스', mongol: '몽골 제국', europe: '유럽 연합', teutonic: '튜턴 기사단', bohemia: '보헤미아 왕국' }; // database/data/war/*.json countries·retired_countries(원군) 이름과 같게
const SCN_BAR = 46; // 선택 줄 높이(area 위쪽에서 뺀다)
const BLOCK_TEXT = { own_territory: '아군 영토', not_adjacent: '인접하지 않음', siege_by_other: '타국 공성 중', cooldown: '쿨다운 중', not_joined: '국가 미선택', allied: '동맹국 영토' };
const hexNum = (c, fb = COLOR.muted) => { const n = parseInt(String(c ?? '').replace('#', ''), 16); return Number.isFinite(n) ? n : fb; };
// 국가 색(남색 배경 위 글자용): 흰색과 45% 섞어 대비 확보
const textCol = (c) => { const n = hexNum(c); const m = (v) => Math.round(v + (255 - v) * 0.45); return '#' + [16, 8, 0].map((sh) => m((n >> sh) & 255).toString(16).padStart(2, '0')).join(''); };
const norm = (lon, lat) => ({ x: (Number(lon) + 180) / 360, y: (90 - Number(lat)) / 180 });
// 서브 탭(목록 영역): 영토 | 순위 | 전황 | 기록. 순위/전황/기록은 GET /api/war/ranking|events|history 를 탭을 열 때 1회 조회(새로고침 버튼으로 재조회)
const TABS = [{ key: 'board', label: '현황' }, { key: 'terr', label: '거점' }, { key: 'rank', label: '순위' }, { key: 'feed', label: '전황' }, { key: 'hist', label: '기록' }];
// 거점 아이콘(manifest map.icon.*, 서가 지도와 같은 에셋): 수도 = 성곽 도성, 그 외 = 읍성
const TERR_ICON = { capital: 'map.icon.walled_capital', normal: 'map.icon.eupseong' };
// 국호 판: 서가 지도 영토 데이터(shelf_territories.json)의 같은 국가 판(plaque.native/ko)을 재사용. 시나리오 -> 영토 데이터 id 접두사
const PLAQUE_PREFIX = { imjin: 'ch1_', legnica: 'ch21_' }; // legnica = 서가 ch21(레그니차) 국호 판(ch21_mongol 등). 표에 없는 시나리오는 접두 규칙 없음(임진 판을 다른 시나리오에 쓰지 않게)
const fmtLeft = (ms) => { const m = Math.max(0, Math.floor(ms / 60000)); const d = Math.floor(m / 1440); const h = Math.floor((m % 1440) / 60); return d > 0 ? `${d}일 ${h}시간` : h > 0 ? `${h}시간 ${m % 60}분` : `${m % 60}분`; };
// 서버 시각: DB 문자열 'YYYY-MM-DD HH:MM:SS'(UTC, config app.timezone) 또는 ISO
const parseUtc = (s) => { if (!s) return NaN; const v = String(s); return Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v.replace(' ', 'T')}Z`); };
const fmtDur = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}시간 ${m % 60}분` : `${m}분`; };
const fmtAgo = (s) => { const t = parseUtc(s); if (!Number.isFinite(t)) return ''; const m = Math.floor((Date.now() - t) / 60000); if (m < 1) return '방금'; if (m < 60) return `${m}분 전`; if (m < 1440) return `${Math.floor(m / 60)}시간 전`; return `${Math.floor(m / 1440)}일 전`; };
const fmtDate = (s) => { const t = parseUtc(s); if (!Number.isFinite(t)) return '-'; const d = new Date(t); return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`; };
// 일일 공격 횟수 초기화: 매일 05:00 KST = 20:00 UTC
const msToReset = () => { const n = new Date(); let t = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate(), 20, 0, 0); if (t <= n.getTime()) t += 86400000; return t - n.getTime(); };
// 같은 영토 재공격 쿨다운 잔여: GET /api/war/map 영토 cooldown_until 을 우선 사용, 없을 때(구버전 응답 등) 폴백으로 이 기기에서 공격 시작한 시각을 기억해 추정
const CD_KEY = 'war.lastAttack';
const cdLoad = () => { try { return JSON.parse(localStorage.getItem(CD_KEY)) ?? {}; } catch { return {}; } };
// 영토 색칠용 육지 마스크(manifest map.battle.imjin_battle.landmask, PNG 알파=육지). 씬 재진입 사이 캐시. img: undefined=로드 중, null=실패/없음
const LM = { path: null, img: undefined, cbs: [] };
const landMaskPath = (key = MAP_KEY) => { const lm = loaded.manifest?.[key]?.landmask; const mob = L.portrait || (L.cls === 'phone' && !L.short); return (mob ? lm?.mobile?.path : null) ?? lm?.desktop?.path ?? null; };
const loadLandMask = (path, cb) => {
    LM.path = path; LM.img = undefined; LM.cbs = [cb];
    const im = new Image();
    const fin = (v) => { if (LM.path !== path) return; LM.img = v; const cbs = LM.cbs; LM.cbs = []; cbs.forEach((f) => { try { f(); } catch (e) { console.warn('[War] landmask 콜백 실패', e); } }); };
    im.onload = () => fin(im);
    im.onerror = () => { console.warn('[War] landmask 로드 실패(마스크 없이 색칠)', path); fin(null); };
    im.src = withVer(path.startsWith('/') ? path : `/${path}`);
};
// AC2 자동 갱신 주기(ms): War 씬이 지도 화면일 때만, 모달·공격 진입 중·탭 숨김이면 건너뜀
const AUTO_MS = 45000;
// AC4 편성 문제(서버 WarService::createBattle -> validateParty 거부 코드). 편성 전용 화면이 없어 스테이지 출격(배치) 화면으로 안내
const PARTY_CODES = ['party_empty', 'no_party', 'cost_exceeded', 'too_many_slots', 'too_many_heroes', 'duplicate_hero', 'hero_not_owned'];
const PARTY_NOTICE = '스테이지 출격(배치) 화면에서 출전 영웅을 고르면 편성이 저장되어 시즌 전쟁 공격에 쓰입니다.';
// AC3: 진행 중인 시즌 전투(state.open_battle)가 있으면 새 공격은 서버가 war_battle_open 으로 거부 -> 공격 버튼 사전 비활성 문구
const OPEN_BATTLE_TEXT = '진행 중인 시즌 전투를 먼저 끝내거나 포기하세요';
const RESULT_TEXT = { att_win: '공격 승리', def_win: '공격 실패', draw: '무승부' };
const cdSave = (season, code) => { try { const m = cdLoad(); m[`${season}:${code}`] = Date.now(); localStorage.setItem(CD_KEY, JSON.stringify(m)); } catch { /* 저장 실패 무시 */ } };

export class WarScene extends Phaser.Scene {
    constructor() { super('War'); }

    // rect = 로비 위 오버레이(2026-11-03 사용자 요청: 다른 화면처럼 로비 상단 바·하단 탭 유지, Gacha 와 같은 방식). 없으면 단독 화면(자체 상단 바)
    init(data) { this.notice = data?.notice ?? ''; this.rect = data?.rect ?? null; this.embedded = !!this.rect; this.AW = this.rect?.w ?? null; this.AX = this.rect?.x ?? 0; } // AX·AW = 로비 왼쪽 세로 레일을 뺀 시작·폭

    create() {
        this.scnList = null; this.scnBar = null; // 시나리오 목록은 진입마다 다시 조회
        this.modalCount = 0;
        this.busy = false;
        this.selCode = null; // 재진입 시 선택·상세 패널 초기화(씬 인스턴스는 재사용됨)
        this.panBound = false; this.mapDrag = null; // 정검수: InputPlugin.shutdown 이 전역 이동 리스너를 지우므로 재진입마다 다시 걸게(지도 팬 사망 방지)
        this.cellGen = 0; // 시즌 셀 그리기 세대(오래된 비동기 콜백 무시)
        this.tab = 'board'; // 진입마다 세력 현황판부터(5차 보완: 마지막 탭 유지하지 않음)
        this.events.once('shutdown', () => { if (this.realmTex && this.textures.exists(this.realmTex)) this.textures.remove(this.realmTex); this.realmTex = null; });
        this.ticks = []; // 30초마다 갱신할 잔여 시간 글자들(clear 시 비움)
        this.time.addEvent({ delay: 30000, loop: true, callback: () => this.ticks.forEach((f) => f()) });
        // AC2: 45초마다 state·map 조용히 재조회. 씬 종료 시 타이머 제거(Phaser Clock 도 정리하지만 명시적으로)
        this.refreshing = false; this.checkingParty = false; this.cacheKeep = null; this.tabList = null;
        this.feedMode = 'all'; this.unread = 0; this.feedMax = 0; this.feedChecking = false; this.tabsUI = null; this.barBadge = null; this.resumeBusy = false; // 2차: 전황 필터·읽지 않음 뱃지·이어하기
        this.gen = (this.gen ?? 0) + 1; // 씬 재시작 전 시작된 자동 갱신 응답은 버림
        this.autoTimer = this.time.addEvent({ delay: AUTO_MS, loop: true, callback: () => this.autoRefresh() });
        this.events.once('shutdown', () => { this.autoTimer?.remove(false); this.autoTimer = null; this.refreshing = false; });
        syncView();
        if (this.embedded) setupCamera(this).setBackgroundColor('rgba(0,0,0,0)'); else setupCamera(this, CSS.bg); // 오버레이 = 배경색 없음(로비 바·탭이 비침, 씬 재사용 시 이전 단독 진입 배경색 제거)
        if (!this.embedded) relayoutOnChange(this, () => ({})); // 오버레이는 로비가 재시작하며 다시 띄운다
        if (!this.embedded) addBackdrop(this, L.lw, L.lh);
        if (!this.embedded && this.textures.exists('bgscreen_lobby')) {
            const bg = this.add.image(L.lw / 2, L.lh / 2, 'bgscreen_lobby');
            bg.setScale(Math.max(L.lw / bg.width, L.lh / bg.height));
            this.add.rectangle(0, 0, L.lw, L.lh, COLOR.ink, 0.6).setOrigin(0);
        }
        audio.bgm(audio.lobbyBgm(), this); // 로비 BGM 유지(같은 트랙이면 이어서 재생)
        if (!session.authed) { this.go('Title', { notice: '로그인 또는 게스트 시작이 필요합니다.' }); return; }
        if (this.embedded) this.buildInlineBar(); else this.buildBar();
        this.content = this.add.container(0, 0);
        if (this.notice) showToast(this, this.notice, { ms: 2600 });
        this.load_();
    }

    // ---------- 상단 바: 로비로 + 제목 + 요약 ----------
    buildBar() {
        const y = L.safe.t;
        this.barH = y + 56;
        this.add.rectangle(0, 0, L.lw, this.barH, COLOR.navyDeep, 0.92).setOrigin(0);
        this.add.rectangle(0, this.barH - 1, L.lw, 2, COLOR.accent).setOrigin(0);
        const x0 = L.safe.l + 12;
        new Button(this, { x: x0, y: y + 6, w: 92, h: 44, label: '로비로', size: 14, onClick: () => this.go('Lobby', { tab: 'stage' }) }); // 로비 기본(싱글). 방 대전은 오른쪽 '방 대전'
        this.titleT = makeText(this, x0 + 106, y + 28, '시즌 전쟁', { size: L.portrait ? 18 : 22, heading: true, color: '#f0d58c', origin: [0, 0.5] });
        // 멀티의 다른 모드(방 대전) 바로 가기: 시즌 전쟁이 멀티 첫 화면이므로 오른쪽 위에 둔다
        const rb = L.lw - L.safe.r - 12 - 104;
        new Button(this, { x: rb, y: y + 6, w: 104, h: 44, label: '방 대전', size: 14, onClick: () => this.go('Lobby', { tab: 'room' }) });
        this.sumT = makeText(this, rb - 12, y + 28, '', { size: 14, bold: true, color: CSS.accent, origin: [1, 0.5], align: 'right' }).setVisible(!L.portrait && L.lw >= 900); // 좁은 화면은 패널 머리에 같은 정보
    }

    // 오버레이: 로비 상단 바·멀티 서브 탭이 위에 있으므로 자체 바 없음. 제목은 숨김(전황 뱃지 위치 계산용), 요약은 서브 탭 줄 오른쪽 끝
    buildInlineBar() {
        this.barH = this.rect.y - 10;
        this.titleT = makeText(this, 0, 0, '시즌 전쟁', { size: 14 }).setVisible(false);
        this.sumT = makeText(this, (this.AW != null ? this.AX + this.AW : L.lw) - L.safe.r - 16, this.rect.y - 26, '', { size: 14, bold: true, color: CSS.accent, origin: [1, 0.5], align: 'right', stroke: { color: '#0B1020', width: 3 } }).setVisible(!L.portrait && L.lw >= 900);
    }

    // 씬 전환 단일 지점: 오버레이면 로비를 통해 전환(로비가 멈추며 이 씬도 정리 — 전투 화면 아래 로비가 남지 않게). 로비 탭 이동은 로비 탭 전환
    go(key, data) {
        const lob = this.embedded ? this.scene.get('Lobby') : null;
        if (!lob?.sys?.isActive()) { this.scene.start(key, data); return; }
        if (key === 'Lobby') { if (data?.notice) showToast(lob, data.notice, { ms: 2600 }); lob.selectTab(data?.tab ?? 'stage'); return; }
        lob.scene.start(key, data);
    }

    area() {
        const pad = L.lw >= 900 ? 24 : 10;
        const sb = this.scnList?.length > 1 ? (L.short ? 36 : SCN_BAR) : 0; // 시나리오 선택 줄(가로 폰 36)
        if (this.embedded) { const x = (this.AX || L.safe.l) + pad; const t = L.short ? 4 : 8; return { x, y: this.rect.y + t + sb, w: (this.AW ?? L.lw) - (this.AX ? 0 : L.safe.l) - L.safe.r - pad * 2, h: this.rect.h - t * 2 - sb }; } // 가로 폰: 위아래 여백 4
        const x = L.safe.l + pad; const top = this.barH + 10 + sb;
        return { x, y: top, w: L.lw - L.safe.l - L.safe.r - pad * 2, h: L.lh - top - L.safe.b - 10 };
    }

    // 시나리오 선택(임진·프랑스·로마 동시 시즌): GET /api/war/seasons. 2개 이상이면 지도 위 한 줄 버튼(참가한 시즌 표시), 고르면 그 시나리오로 다시 조회.
    //  기본 = 이미 고른 것 > 참가한 시즌 > 첫 시즌. 1개 이하면 줄 없음(서버 기본). 실패는 무시(기존 동작)
    async loadScenarios() {
        let list = []; let act = null;
        const cur0 = getWarScenario();
        if (!cur0) setWarScenario(null);
        [list, act] = await Promise.all([
            gameApi.war.seasons().then((d) => d?.seasons ?? []).catch(() => []),
            cur0 ? Promise.resolve(null) : gameApi.war.active().catch(() => null), // 서버 기본 시즌(가입한 시즌, 미가입이면 france) — 선택이 없을 때만
        ]);
        if (!this.sys.isActive()) return;
        if (!Array.isArray(list)) list = [];
        if (!list.length && Array.isArray(act?.seasons)) list = act.seasons;
        this.scnList = list;
        const has = (c) => !!c && list.some((x) => x.scenario_code === c);
        // 기본값 우선순위(2026-11-04 팀장 지시): 이미 고른 것 > /api/war/active 의 scenario_code > 가입한 시즌 > 첫 시즌
        const pick = has(cur0) ? cur0 : has(act?.scenario_code) ? act.scenario_code : (list.find((x) => x.joined) ?? list[0])?.scenario_code ?? act?.scenario_code ?? null;
        setWarScenario(pick);
        this.drawScenarioBar();
    }

    drawScenarioBar() {
        this.scnBar?.destroy(); this.scnBar = null;
        const list = this.scnList ?? [];
        if (list.length < 2) return;
        const pad = L.lw >= 900 ? 24 : 10;
        const x0 = (this.embedded && this.AX ? this.AX : L.safe.l) + pad; const y0 = (this.embedded ? this.rect.y + (L.short ? 4 : 8) : this.barH + 10);
        const c = this.add.container(0, 0); this.scnBar = c;
        const cur = getWarScenario();
        const bw0 = Math.max(88, Math.min(150, Math.floor(((this.AW ?? L.lw) - (this.AX ? 0 : L.safe.l) - L.safe.r - pad * 2 - (list.length - 1) * 8) / list.length)));
        const bw = L.short ? Math.max(70, Math.min(bw0, Math.floor((280 - (list.length - 1) * 6) / list.length))) : bw0; // 가로 폰: 오른쪽 패널(최소 300) 폭 안
        const xs = L.short ? (this.AW != null ? this.AX + this.AW : L.lw) - L.safe.r - pad - (list.length * (bw + 8) - 8) : x0; // 가로 폰: 오른쪽 정렬(지도 위 공간 비움)
        list.forEach((sn, i) => {
            const on = sn.scenario_code === cur;
            const label = `${SCN_LABEL[sn.scenario_code] ?? sn.name ?? sn.scenario_code}${sn.joined ? (L.short ? ' ✓' : ' · 참가') : ''}`; // 가로 폰: 칩 폭이 좁아 참가 표시는 ✓
            c.add(new Button(this, { x: xs + i * (bw + 8), y: y0, w: bw, h: L.short ? 30 : 38, label, size: L.short ? 13 : 14, variant: on ? 'primary' : undefined,
                onClick: () => { if (on || this.busy || this.scnBusy || this.modalCount > 0) return; this.mp = null; setWarScenario(sn.scenario_code); this.selCode = null; this.tab = 'board'; this.cacheKeep = null; this.cache = {}; this.drawScenarioBar(); this.load_(); } }));
        });
    }

    clear() { this.content.removeAll(true); this.ticks = []; this.cache = this.cacheKeep ?? {}; this.cacheKeep = null; this.tabList = null; }

    // 쿨다운 잔여(ms). 서버 cooldown_until(UTC ISO, 쿨다운 중에만 값) 우선, 없으면 이 기기 공격 기록으로 추정. 기록이 없거나 지났으면 0
    cdLeft(t) {
        const until = parseUtc(t?.cooldown_until);
        if (Number.isFinite(until)) return Math.max(0, until - Date.now());
        const at = cdLoad()[`${this.st?.season?.id}:${t?.code}`];
        if (!at) return 0;
        return Math.max(0, at + (this.st?.rules?.cooldown_minutes ?? 30) * 60000 - Date.now());
    }

    blockText(t) {
        if (t.attack_blocked_reason !== 'cooldown') return BLOCK_TEXT[t.attack_blocked_reason] ?? '공격 불가';
        const ms = this.cdLeft(t);
        return ms > 0 ? `쿨다운 ${fmtDur(ms)} 남음` : `쿨다운 중(최대 ${this.st?.rules?.cooldown_minutes ?? 30}분)`;
    }

    message(msg, { retry = true } = {}) {
        this.clear();
        const a = this.area();
        this.content.add(noteText(this, a.x, a.y + 10, msg, { kind: 'error', size: 16, wrap: a.w }));
        if (retry) this.content.add(new Button(this, { x: a.x, y: a.y + 60, w: 160, label: '다시 시도', variant: 'primary', onClick: () => this.load_() }));
    }

    // 시나리오 일치: 기대(선택 > state) 와 map 응답 scenario_code 가 다르면 기대값, 같거나 판정 불가면 null (load_·autoRefresh 공용, 정검수 2차)
    scenarioMismatch(st, mp) {
        const want = getWarScenario() ?? st?.scenario_code ?? st?.season?.scenario_code ?? null;
        return want && mp?.scenario_code && mp.scenario_code !== want ? want : null;
    }

    async load_() {
        // 세대 가드(정검수 2차): 로딩 중 다른 칩을 누르면(gen 증가) 이전 로딩 결과(st/mp)를 버린다 -> 두 시나리오 상태가 섞이지 않음
        const gen = this.gen = (this.gen ?? 0) + 1;
        const stale = () => gen !== this.gen || !this.sys.isActive();
        this.scnBusy = true;
        try { await this.load0(stale); } finally { if (gen === this.gen) { this.scnBusy = false; this.drawScenarioBar?.(); } }
    }

    async load0(stale) {
        if (!this.scnList) await this.loadScenarios(); // 진입 1회: 시나리오 목록(선택 줄 높이가 area 에 반영되도록 먼저)
        if (stale()) return;
        this.clear();
        const a = this.area();
        this.content.add(makeText(this, a.x + a.w / 2, a.y + 40, '불러오는 중...', { size: 18, color: CSS.muted, origin: [0.5, 0.5] }));
        try {
            const st = await gameApi.war.state();
            if (stale()) return;
            this.st = st;
            noteWarState(st); // 멀티 진입 판정 캐시(warEntry.js) 갱신
            this.refreshSummary();
            // 미가입이어도 지도·세력 현황을 먼저 보여 주고 현황 탭에서 참가(지도 조회 실패 시에만 기존 국가 선택 화면)
            let mp;
            try { mp = await gameApi.war.map(); } catch (e2) { if (!st.me?.joined && !stale()) { this.renderJoin(); return; } throw e2; }
            if (stale()) return;
            // 시나리오 일치 확인(강화면 gacha46 High: 프랑스 칩인데 임진 지도·핀). 기대 = 선택 시나리오 > state 시나리오
            const want = this.scenarioMismatch(st, mp);
            if (want) {
                console.warn('[War] /api/war/map 시나리오 불일치 -> 재요청', { want, got: mp.scenario_code, state: st.scenario_code ?? st.season?.scenario_code });
                try { const mp2 = await gameApi.war.map(); if (mp2?.scenario_code === want) mp = mp2; } catch { /* 아래 경고 */ }
                if (stale()) return;
                if (mp?.scenario_code !== want) { this.message(`지도 정보가 선택한 시즌과 맞지 않습니다(${want} / 지도 ${mp?.scenario_code ?? '-'}). 잠시 후 다시 시도해 주세요.`); return; }
            }
            this.mp = mp;
            this.renderMap();
            this.checkFeed(); // AC1 읽지 않음 뱃지(실패 무시, 기다리지 않음)
        } catch (e) {
            if (stale()) return;
            if (e.code === 'season_not_found') { noteNoSeason(); this.renderNoSeason(messageOf(e)); return; }
            this.message(messageOf(e));
        }
    }

    // AC2 자동 갱신 가능 여부: 지도 화면이 떠 있고, 모달·공격 진입(busy)·이전 갱신 진행 중이 아니고, 브라우저 탭이 보일 때
    canAutoRefresh() {
        return this.sys.isActive() && !!this.mp && !!this.mapBox?.scene && !this.busy && !this.checkingParty && !this.refreshing
            && !(this.modalCount > 0) && !(typeof document !== 'undefined' && document.hidden);
    }

    // AC2: state·map 을 조용히 재조회(로딩 표시 없음, 실패 무시). 바뀐 게 없으면 다시 그리지 않음.
    //  다시 그릴 때 선택 거점·현재 탭·탭 캐시(순위/전황/기록)·목록 스크롤 위치 유지. 지도 색칠(drawRealm)·점령도·남은 공격·현황판은 renderMap 이 새 데이터로 다시 그림
    async autoRefresh() {
        if (!this.canAutoRefresh()) return;
        this.refreshing = true;
        const gen = this.gen;
        try {
            const [st, mp] = await Promise.all([gameApi.war.state(), gameApi.war.map()]);
            if (gen !== this.gen || !this.canAutoRefreshAfter()) return; // 기다리는 사이 모달·공격·씬 전환
            if (this.scenarioMismatch(st, mp)) { console.warn('[War] 자동 갱신 시나리오 불일치 -> 건너뜀', { want: this.scenarioMismatch(st, mp), got: mp?.scenario_code }); return; }
            const same = JSON.stringify(st) === JSON.stringify(this.st) && JSON.stringify(mp) === JSON.stringify(this.mp);
            this.st = st; this.mp = mp;
            noteWarState(st);
            this.refreshSummary();
            this.checkFeed(); // AC1: 새 내 국가 이벤트 -> 전황 탭·상단 뱃지
            if (same) return;
            if (this.selCode && !(mp.territories ?? []).some((t) => t.code === this.selCode)) this.selCode = null;
            const oy = this.tabList?.scene ? this.tabList.content.y : null;
            this.cacheKeep = this.cache; // clear() 가 탭 캐시를 비우지 않게(순위/전황/기록 탭은 네트워크 없이 다시 그림)
            this.renderMap();
            if (oy != null && this.tabList?.scene) this.tabList.scrollTo?.(oy);
        } catch (e) {
            console.warn(`[War] 자동 갱신 실패(무시) code=${e?.code ?? 'unknown'}`);
        } finally { if (gen === this.gen) this.refreshing = false; }
    }

    canAutoRefreshAfter() { return this.sys.isActive() && !!this.mapBox?.scene && !this.busy && !this.checkingParty && !(this.modalCount > 0); }

    // 진행 중 시즌 없음: 안내 + 지난 시즌 기록(history 는 활성 시즌이 없어도 조회 가능)
    renderNoSeason(msg) {
        this.message(msg, { retry: false });
        const a = this.area();
        const top = a.y + 50;
        const box = this.add.container(a.x, top);
        this.content.add(box);
        this.tabBox = this.add.container(0, 0);
        box.add(this.tabBox);
        this.tabR = { w: a.w, h: a.h - 50 };
        this.renderTab('hist');
    }

    countryOf(code) { return (this.st?.countries ?? []).find((c) => c.code === code) ?? (this.mp?.countries ?? []).find((c) => c.code === code) ?? null; }

    refreshSummary() {
        const st = this.st;
        this.titleT.setText(L.portrait ? '시즌 전쟁' : `시즌 전쟁 · ${st.season?.name ?? ''}`);
        fitText(this.titleT, Math.max(120, L.lw * (L.portrait ? 0.3 : 0.45)));
        const me = st.me?.joined ? this.countryOf(st.me.country) : null;
        const at = st.attacks ?? {};
        this.sumT.setText(me ? `${me.name} 소속 · 남은 공격 ${at.left ?? 0}/${at.limit ?? 0}${L.portrait ? '' : ` · 기여도 ${st.me.contribution ?? 0}`}` : '국가 미선택');
        if (me) this.sumT.setColor(textCol(me.color));
        this.updateBadges(); // 제목 폭이 바뀌면 상단 뱃지 위치도 다시
    }

    // ---------- AC1 읽지 않음 뱃지: 최신 이벤트 30개 중 내 국가 관련(점령/함락/수도 포위) & 마지막 본 id 초과 개수 ----------
    //  이 시즌 첫 확인(기록 없음)은 현재 최대 id 를 본 것으로 저장(지난 소식 폭주 방지). 전황 탭을 보고 있으면 바로 읽음
    async checkFeed() {
        const st = this.st; const my = st?.me?.joined ? st.me.country : null; const season = st?.season?.id;
        if (!my || season == null || this.feedChecking) return;
        this.feedChecking = true;
        const gen = this.gen;
        try {
            const d = await gameApi.war.events({ limit: 30 });
            if (gen !== this.gen || !this.sys.isActive()) return;
            const evs = d?.events ?? [];
            const max = evs.reduce((m, e) => Math.max(m, Number(e.id) || 0), 0);
            this.feedMax = Math.max(this.feedMax, max);
            if (this.tab !== 'feed' && this.cache) this.cache.feed = d; // 전황 탭을 열 때 네트워크 없이 최신 목록
            let seen = feedSeenGet(season);
            if (seen == null) { feedSeenSet(season, max); seen = max; }
            if (this.tab === 'feed' && this.tabBox?.scene) { this.markFeedRead(); return; }
            const ownerOf = (code) => (this.mp?.territories ?? []).find((t) => t.code === code)?.owner?.code ?? null;
            this.unread = evs.filter((e) => Number(e.id) > seen && isMyCountryAlert(e, my, ownerOf)).length;
            this.updateBadges();
        } catch (e) {
            console.warn(`[War] 전황 확인 실패(무시) code=${e?.code ?? 'unknown'}`);
        } finally { if (gen === this.gen) this.feedChecking = false; }
    }

    markFeedRead(d) {
        const season = this.st?.season?.id;
        const max = (d?.events ?? []).reduce((m, e) => Math.max(m, Number(e.id) || 0), this.feedMax);
        this.feedMax = max;
        if (season != null && max > 0) feedSeenSet(season, max);
        if (this.unread) { this.unread = 0; this.updateBadges(); }
    }

    // 빨간 원 + 개수(9 초과 '9+')
    badge(x, y, n) {
        const c = this.add.container(x, y);
        const s = n > 9 ? '9+' : String(n);
        c.add(this.add.circle(0, 0, s.length > 1 ? 12 : 10, COLOR.danger, 1).setStrokeStyle(2, COLOR.ink, 1));
        c.add(makeText(this, 0, 0, s, { size: 12, bold: true, color: '#ffffff', origin: [0.5, 0.5] }));
        return c;
    }

    // 전황 탭 버튼 우상단 + 상단 바 제목 옆(누르면 전황 탭 열기)
    updateBadges() {
        this.tabBadge?.destroy(); this.tabBadge = null;
        this.barBadge?.destroy(); this.barBadge = null;
        const n = this.unread;
        if (!n) return;
        const tb = this.tabsUI;
        if (tb?.scene && tb.parentContainer?.scene) {
            const p = tb.badgePos('feed');
            if (p) { this.tabBadge = this.badge(tb.x + p.x + 4, tb.y + p.y, n); tb.parentContainer.add(this.tabBadge); }
        }
        if (this.titleT?.scene && !this.embedded) { // 오버레이는 로비 '시즌 전쟁' 서브 탭 뱃지가 대신
            const maxX = L.lw - L.safe.r - 12 - 104 - 26; // '방 대전' 버튼 왼쪽
            const bx = Math.min(maxX, this.titleT.x + this.titleT.displayWidth + 16);
            const c = this.badge(bx, this.titleT.y - 8, n).setDepth(5);
            const hit = this.add.rectangle(0, 8, 44, 44, 0xffffff, 0.001).setInteractive({ useHandCursor: true });
            hit.on('pointerup', () => this.openFeed());
            c.add(hit);
            this.barBadge = c;
        }
    }

    openFeed() {
        if (this.modalCount > 0 || !this.tabsUI?.scene) return;
        this.feedMode = 'all';
        if (this.tab !== 'feed') { this.tab = 'feed'; this.tabsUI.setActive('feed'); }
        this.renderTab('feed');
    }

    // ---------- AC3 이어하기: 지도 영역 위 한 줄(이어하기 + 포기) ----------
    buildOpenBattle(a, ob) {
        const h = 44; const gw = 96; const gap = 8;
        const label = `진행 중인 전투 이어하기 (${ob.territory_name ?? ob.territory_id ?? '전투'} · ${ob.status === 'deployment' ? '배치 중' : `${ob.turn ?? 1}턴`})`;
        const bw = Math.min(a.w - gw - gap, 520);
        this.content.add(new Button(this, { x: a.x, y: a.y, w: bw, h, label, variant: 'primary', size: 15, onClick: () => this.resumeWar(ob) }));
        this.content.add(new Button(this, { x: a.x + bw + gap, y: a.y, w: gw, h, label: '포기', variant: 'danger', size: 14, onClick: () => this.confirmAbandon(ob) }));
        return h + 10;
    }

    // Lobby 이어하기와 같은 방식: 진행 중 = Battle 씬(fresh, 서버 view 로 복원)
    resumeWar(ob) {
        if (this.resumeBusy || this.busy || this.modalCount > 0) return;
        this.resumeBusy = true; this.time.delayedCall(1500, () => { this.resumeBusy = false; });
        this.go('Battle', { mode: 'war', battleId: ob.battle_id, fresh: true, territory: ob.territory_id ?? null });
    }

    confirmAbandon(ob) {
        if (this.busy) return;
        confirmModal(this, '전투 포기', `${ob.territory_name ?? '진행 중인'} 전투를 포기합니다.\n포기하면 패배(보상 없음)로 처리되고 사용한 공격 횟수는 돌아오지 않습니다.`, async () => {
            if (this.busy) return;
            this.busy = true;
            try {
                await gameApi.battle.abandon(ob.battle_id);
            } catch (e) {
                if (e?.status !== 404 && e?.status !== 409) { if (this.sys.isActive()) alertModal(this, '포기 실패', messageOf(e)); return; }
            } finally { this.busy = false; }
            if (!this.sys.isActive()) return;
            showToast(this, '전투를 포기했습니다');
            this.load_();
        }, { okLabel: '포기', danger: true });
    }

    // ---------- 국가 선택 ----------
    renderJoin() {
        this.clear();
        const a = this.area(); const st = this.st;
        const guest = session.kind === 'guest';
        let y = a.y;
        const h1 = makeText(this, a.x, y, '참가할 국가를 선택하세요', { size: 20, heading: true, color: '#f0d58c' });
        this.content.add(h1); y += h1.height + 6;
        const n1 = noteText(this, a.x, y, '국가는 시즌 중 한 번만 선택할 수 있습니다.', { kind: 'info', size: 14, wrap: a.w });
        this.content.add(n1); y += n1.height + 8;
        if (guest) {
            const g = noteText(this, a.x, y, '게스트 계정은 시즌 전쟁에 참가할 수 없습니다. 회원 가입(진행 데이터 유지) 후 참가해 주세요.', { kind: 'error', size: 15, wrap: a.w - 180 });
            this.content.add(g);
            this.content.add(new Button(this, { x: a.x + a.w - 170, y: y - 4, w: 170, h: 44, label: '회원 가입', variant: 'primary', size: 15, onClick: () => this.go('Auth', { mode: 'register' }) }));
            y += Math.max(g.height, 44) + 10;
        }
        const list = st.countries ?? [];
        const gap = 14;
        const cols = L.portrait || a.w < 640 ? 1 : Math.min(3, Math.max(1, list.length));
        const cw = Math.min(360, Math.floor((a.w - gap * (cols - 1)) / cols));
        const ch = cols === 1 ? 152 : 190;
        const ox = a.x + (a.w - (cw * cols + gap * (cols - 1))) / 2;
        list.forEach((c, i) => {
            const cx = ox + (i % cols) * (cw + gap); const cy = y + Math.floor(i / cols) * (ch + gap);
            const card = this.add.container(cx, cy);
            const col = hexNum(c.color);
            card.add(this.add.rectangle(0, 0, cw, ch, COLOR.navyDeep, 0.9).setOrigin(0).setStrokeStyle(2, c.recommended ? COLOR.accentLight : COLOR.accent, c.recommended ? 1 : 0.5));
            card.add(this.add.rectangle(0, 0, 10, ch, col, 1).setOrigin(0));
            card.add(this.add.circle(36, 34, 16, col, 0.9).setStrokeStyle(2, COLOR.ink, 0.9));
            const nm = makeText(this, 62, 34, c.name, { size: 22, heading: true, origin: [0, 0.5] });
            card.add(nm);
            if (c.recommended) {
                const bx = 62 + nm.width + 10;
                card.add(this.add.rectangle(bx, 22, 46, 24, COLOR.accent, 1).setOrigin(0));
                card.add(makeText(this, bx + 23, 34, '추천', { size: 13, bold: true, color: '#1A1406', origin: [0.5, 0.5] }));
            }
            const info = `인원 ${c.member_count}명 · 점수 ${c.score}${c.is_ai ? ' · 현재 AI 운영' : ''}`;
            card.add(makeText(this, 24, 62, info, { size: 14, color: CSS.muted, wrap: cw - 36 }));
            const bw = cols === 1 ? 150 : cw - 36;
            const bx = cols === 1 ? cw - bw - 14 : 18;
            const by = ch - 44 - 14;
            card.add(new Button(this, { x: bx, y: by, w: bw, h: 44, label: '이 국가로 참가', variant: c.recommended ? 'primary' : 'default', size: 15, disabled: guest, reason: '게스트 계정은 참가할 수 없습니다. 회원 가입 후 참가해 주세요.', onClick: () => this.confirmJoin(c) }));
            this.content.add(card);
        });
    }

    confirmJoin(c) {
        confirmModal(this, '국가 선택', `${c.name}(으)로 참가합니다.\n시즌이 끝날 때까지 국가를 바꿀 수 없습니다.`, async () => {
            if (this.busy) return;
            this.busy = true;
            try {
                this.st = await gameApi.war.join(c.code, getWarScenario() ?? this.st?.scenario_code ?? this.st?.season?.scenario_code ?? null); // body.scenario 필수
                if (!this.sys.isActive()) return;
                showToast(this, `${c.name}에 참가했습니다`);
                await this.load_();
            } catch (e) {
                if (!this.sys.isActive()) return;
                alertModal(this, '참가 실패', messageOf(e), () => { if (e.code === 'already_joined') this.load_(); });
            } finally { this.busy = false; }
        }, { okLabel: '참가' });
    }

    // ---------- 시즌 지도 ----------
    renderMap() {
        this.clear();
        const a = this.area();
        const ob = this.st?.me?.joined ? this.st?.open_battle : null; // AC3: 진행 중 시즌 전투 -> 지도·목록 위 이어하기 줄
        if (ob?.battle_id) { const dy = this.buildOpenBattle(a, ob); a.y += dy; a.h -= dy; }
        // 서가 지도와 같은 2단: 가로 = 왼쪽 거점 목록·요약 / 오른쪽 지도, 세로 = 위 지도 / 아래 목록(지도 높이 = 영역의 42~50%)
        const wide = !L.portrait && (a.w >= 760 || L.short); // 가로 폰(667x375 등 폭 < 760)도 지도|패널 좌우 분할(세로로 쌓으면 지도가 너무 낮음)
        this.wideLayout = wide;
        // fe46 현황판: 가로이고 높이가 충분하면(1280x720 등) 왼쪽 = 현황판(시즌·진영 현황·내 진영·선택 거점 상세+공격·탭), 오른쪽 = 지도.
        //  낮은 가로(844x390)·세로는 기존 요약+지도 안 상세 패널 유지
        // fe46 재작업: 가로 = 왼쪽 큰 지도(약 62%) + 오른쪽 세력 현황판, 세로 = 위 지도(48%) + 아래 현황판(탭 전환)
        // 세로로 긴 지도(2026-11-04 1592년 조선 지도 1728x2448, 화면 비율 = 2*경도폭/위도폭 ≈ 0.71): 지도 상자를 '높이 맞춤 폭'으로 좁히고 남는 폭을 패널에
        const scnL = this.mp?.scenario_code ?? this.st?.scenario_code ?? this.st?.season?.scenario_code ?? null;
        const mkL = mapKeyFor(scnL); const nbL = seasonOn(scnL) ? SEASON_VB : mkL ? normBounds(loaded.manifest?.[mkL]?.bounds?.normalized) : null;
        const mapAsp = nbL ? (2 * (nbL.x1 - nbL.x0)) / Math.max(1e-6, nbL.y1 - nbL.y0) : 0;
        const tallMap = mapAsp > 0 && mapAsp < 1;
        let listW = wide ? (L.short ? Math.max(300, Math.min(440, Math.round(a.w * 0.42))) : Math.max(360, Math.min(480, Math.round(a.w * 0.36)))) : a.w;
        if (wide && tallMap) listW = Math.max(L.short ? 300 : 360, Math.min(L.short ? 440 : 520, Math.round(a.w - a.h * mapAsp - 14)));
        const sbH = this.scnList?.length > 1 ? (L.short ? 36 : SCN_BAR) : 0; // 시나리오 칩 줄 높이(area 가 이미 뺀 값)
        if (wide && tallMap && L.short) listW = 280;
        const mapR = wide ? (L.short && sbH ? { x: a.x, y: a.y - sbH, w: a.w - listW - 14, h: a.h + sbH } : { x: a.x, y: a.y, w: a.w - listW - 14, h: a.h }) : { x: a.x, y: a.y, w: a.w, h: Math.round(a.h * (tallMap ? 0.58 : 0.48)) };
        const gapS = L.short && sbH ? 8 : 0;
        const listR = wide ? { x: a.x + mapR.w + 14, y: a.y + gapS, w: listW, h: a.h - gapS } : { x: a.x, y: mapR.y + mapR.h + 12, w: a.w, h: a.h - mapR.h - 12 };
        this.buildMapView(mapR);
        this.buildMapHud(mapR); // 시안 HUD(타이틀·비율 바·진영 판·범례)
        this.buildList(listR);
    }

    buildMapView(r) {
        const box = this.add.container(r.x, r.y);
        this.content.add(box);
        this.mapBox = box; this.mapR = r;
        box.add(this.add.rectangle(0, 0, r.w, r.h, 0x0e1a2e, 1).setOrigin(0));
        this.imgLayer = this.add.container(0, 0);
        this.drawG = this.add.graphics();
        this.pinLayer = this.add.container(0, 0);
        // 인접선·영토 원·핀·라벨은 지도 상자 [0,w]x[0,h] 로 픽셀 클리핑(상단 바·목록 쪽으로 넘치지 않게)
        this.labelLayer = this.add.container(0, 0); // 거점 라벨: 모든 핀·아이콘 위(다른 핀 원 밑에 깔리지 않게)
        this.realmLayer = this.add.container(0, 0); // 세력 영토 색칠 텍스처(drawRealm)
        // 드래그 팬(2026-11-04 사용자 요청): 지도 이미지까지 panLayer 에 넣어 함께 이동. 마스크는 clipLayer(고정)에 걸려 상자 밖은 잘린다
        this.panLayer = this.add.container(0, 0, [this.imgLayer, this.realmLayer, this.drawG, this.pinLayer, this.labelLayer]);
        this.clipLayer = this.add.container(0, 0, [this.panLayer]);
        // 시즌 지도(r3)는 마스크 필터 없이(gacha114: Phaser 4 filters.external.addMask 경로에서 지도·바다·셀이 (0,0,0)으로 그려짐). contain 이라 지도가 상자 안에 다 들어가 클립이 필요 없다
        const scnE = this.mp?.scenario_code ?? this.st?.scenario_code ?? this.st?.season?.scenario_code ?? null;
        this.clipped = seasonOn(scnE) ? false : this.enableMapClip(this.clipLayer, r);
        // 드래그 영역(핀보다 아래): 빈 곳을 누르고 끌면 팬. 핀 위에서 시작한 드래그도 전역 이동 이벤트로 처리
        this.panZone = this.add.rectangle(0, 0, r.w, r.h, 0, 0.001).setOrigin(0).setInteractive();
        this.panZone.on('pointerdown', (p) => this.panStart(p));
        box.add([this.panZone, this.clipLayer]);
        { const bg2 = this.add.graphics(); bg2.lineStyle(1, COLOR.accent, 0.7).strokeRect(0, 0, r.w, r.h); box.add(bg2); } // 상자 테두리 = Graphics(채움 없음)
        // 카메라: 시나리오 map_view(경위도 사각형)를 화면에 맞추고, 지도 에셋 bounds 안으로 제한(빈 띠 방지)
        const vp = { w: r.w, h: r.h };
        this.vp = vp;
        const mv = this.mp?.view;
        const ts = this.mp?.territories ?? [];
        // 세로(좁은 지도)는 영토 핀 범위에 맞춰 더 확대(라벨 겹침 완화), 가로는 시나리오 범위 전체
        const narrow = r.w < 600;
        const pts = mv && !narrow ? [norm(mv.lon_min, mv.lat_max), norm(mv.lon_max, mv.lat_min)] : ts.map((t) => norm(t.lon, t.lat));
        const scn = this.mp?.scenario_code ?? this.st?.scenario_code ?? this.st?.season?.scenario_code ?? null;
        this.mapKey = mapKeyFor(scn); // 시나리오 지도(프랑스·로마·임진)
        const ent = this.mapKey ? loaded.manifest?.[this.mapKey] : null;
        this.vb = ent ? normBounds(ent?.bounds?.normalized) : null;
        this.seasonMap = seasonOn(scn);
        if (this.seasonMap) { this.mapKey = SEASON_BASE; this.vb = { ...SEASON_VB }; }
        const cam = fitBounds(pts, vp, { pad: mv && !narrow ? 0.96 : 0.6 });
        // 지도 에셋이 있으면 에셋 전체가 상자 안에 들어오게(contain). cover(clampCam)는 상자 비율 때문에 남쪽(히젠 나고야)이 잘렸다(2026-11-02 강화면 f1).
        // 에셋 밖 영토는 drawTerritories 가 상자 가장자리로 끌어와 표시한다
        if (this.vb) {
            const sx = this.vb.x1 - this.vb.x0; const sy = this.vb.y1 - this.vb.y0;
            const zContain = Math.min(1 / sx, (2 * vp.h) / (vp.w * sy)); const zCover = Math.max(1 / sx, (2 * vp.h) / (vp.w * sy)) * 1.01;
            const zPins = fitBounds(ts.map((x) => norm(x.lon, x.lat)), vp, { pad: 0.88 }).z; // 거점이 모두 들어가는 배율
            // 가로 지도 = cover(패널을 꽉 채움, 지도 밖 거점은 가장자리로 끌어와 화살표). 세로 지도(화면 비율 < 1) = contain(한반도 전체·제주·쓰시마·회령까지 잘리지 않게, 좌우는 남색 여백)
            const z = this.seasonMap ? zContain : (2 * sx) / sy < 1 ? 1 / sx : zCover; void zPins; void zContain; // 시즌 지도(r2) = 전체가 상자 안(contain, 667·390 에서도 잘리지 않게) // 세로 지도 = 폭 맞춤(넘치는 세로는 드래그), 가로 지도 = cover
            const hx = 0.5 / z; const hy = vp.h / (vp.w * z);
            const cl = (v, a, b) => (a > b ? (a + b) / 2 : Math.max(a, Math.min(b, v)));
            const keep = this.panCam && this.panCam.key === `${this.mapKey}|${vp.w}x${vp.h}` ? this.panCam : null;
            const selT = !keep && this.selCode ? ts.find((x) => x.code === this.selCode) : null; const selN = selT ? norm(selT.lon, selT.lat) : null;
            // 첫 화면: 교전(공성) 중 거점이 있으면 그 평균 위치를 가운데로(gacha120: 1280 첫 화면이 북쪽이라 부산 공성이 안 보임). 세로 드래그·지도 모습은 그대로
            const sg = !keep && !selN ? ts.filter((x) => x.state === 'siege' && x.siege_country).map((x) => norm(x.lon, x.lat)) : [];
            const sgC = sg.length ? { x: sg.reduce((a, q) => a + q.x, 0) / sg.length, y: sg.reduce((a, q) => a + q.y, 0) / sg.length } : null;
            const want = keep ?? selN ?? (sgC ? { x: cam.x, y: sgC.y } : cam); // 유지된 팬 > 선택 영토 > 교전 거점 중심(세로만) > 영토 범위 중심
            this.camLim = { x0: this.vb.x0 + hx, x1: this.vb.x1 - hx, y0: this.vb.y0 + hy, y1: this.vb.y1 - hy };
            this.cam = { x: cl(want.x, this.camLim.x0, this.camLim.x1), y: cl(want.y, this.camLim.y0, this.camLim.y1), z };
            if (this.seasonMap) { // r2: 상단 HUD 아래 + 사방 여백(제주·쓰시마가 가장자리 핀 끌어오기 없이 보이게) 안에 지도 전체(contain), 카메라 고정
                // 핀이 있는 범위(가장 북쪽 거점 위도)만 HUD 아래에 오면 되므로, 그 위 북쪽 띠(f0)는 타이틀 뒤로 겹쳐 지도를 상자 높이에 가깝게 키운다(gacha113: 228x364 -> 약 480+)
                const top = hudTop(r) + 4; const pad = SEASON_FX.pad; const aw = Math.max(80, vp.w - pad * 2);
                const latMax = Math.max(...ts.map((x) => Number(x.lat)).filter(Number.isFinite), SEASON_GEO.lat0 - 2); const f0 = Math.max(0, Math.min(0.5, ((SEASON_GEO.lat0 - latMax) * SEASON_GEO.ppd - 24) / SEASON_GEO.h));
                const hMax = (vp.h - pad - top) / Math.max(0.5, 1 - f0); const ah = Math.min(hMax, vp.h - pad * 2);
                const zs = Math.min(aw / (vp.w * sx), (2 * ah) / (vp.w * sy)); const k = vp.w * zs; const hImg = ((this.vb.y1 - this.vb.y0) * k) / 2;
                const imgTop = Math.max(pad - hImg * f0, vp.h - pad - hImg); // 아래 끝을 상자 아래 여백에 맞춤(북쪽 띠는 위로 걸침)
                const cy = (this.vb.y0 + this.vb.y1) / 2 - ((imgTop + hImg / 2) - vp.h / 2) / (k / 2);
                this.cam = { x: (this.vb.x0 + this.vb.x1) / 2, y: cy, z: zs };
                this.camLim = { x0: this.cam.x, x1: this.cam.x, y0: this.cam.y, y1: this.cam.y };
            }
        } else { this.cam = cam; this.camLim = null; }
        this.drawTerritories();
        this.loadMapImage();
    }

    // ScrollList.enableClip 과 같은 방식(Phaser 4 Mask 필터, 화면 좌표). WebGL 이 아니면 false(호출 측이 가시성으로 대체)
    enableMapClip(layer, r) {
        if (!this.renderer?.gl || typeof layer.enableFilters !== 'function') return false;
        const rect = new Phaser.GameObjects.Rectangle(this, 0, 0, r.w, r.h, 0xffffff, 1).setOrigin(0);
        layer.enableFilters();
        layer.filters.external.addMask(rect, false, this.cameras.main, 'world');
        const tm = new Phaser.GameObjects.Components.TransformMatrix();
        const sync = () => {
            if (!layer.scene) return;
            const m = layer.getWorldTransformMatrix(tm);
            rect.setPosition(m.tx, m.ty);
            const cw = r.w * m.scaleX; const ch = r.h * m.scaleY;
            if (rect.width !== cw || rect.height !== ch) rect.setSize(cw, ch);
        };
        sync();
        this.events.on('prerender', sync);
        layer.once('destroy', () => { this.events.off('prerender', sync); rect.destroy(); });
        return true;
    }

    // ---------- 지도 드래그 팬 ----------
    // 시작: 지도 상자 빈 곳(panZone) 또는 핀(pointerdown). 6px 넘게 움직이면 팬(그 뒤 핀 탭 무시), 카메라 경계(camLim) 밖으로 못 나감, 관성 없음
    panStart(p) {
        if (!this.camLim || this.modalCount > 0 || this.busy) return;
        this.mapDrag = { id: p.id, sx: p.worldX, sy: p.worldY, cam0: { ...this.cam }, moved: false, dx: 0, dy: 0 };
        this.panSuppress = false;
        if (!this.panBound) {
            this.panBound = true;
            this.input.on('pointermove', (q) => this.panMove(q));
            this.input.on('pointerup', (q) => this.panEnd(q));
            this.input.on('pointerupoutside', (q) => this.panEnd(q));
        }
    }
    panMove(q) {
        const d = this.mapDrag; if (!d || q.id !== d.id || !q.isDown || !this.panLayer?.scene) return;
        const k = this.vp.w * d.cam0.z;
        const L0 = this.camLim;
        const nx = Math.max(L0.x0, Math.min(L0.x1, d.cam0.x - (q.worldX - d.sx) / k));
        const ny = Math.max(L0.y0, Math.min(L0.y1, d.cam0.y - (q.worldY - d.sy) / (k / 2)));
        d.dx = (d.cam0.x - nx) * k; d.dy = (d.cam0.y - ny) * (k / 2);
        if (!d.moved && Math.hypot(q.worldX - d.sx, q.worldY - d.sy) > 6) { d.moved = true; this.panSuppress = true; }
        if (d.moved) this.panLayer.setPosition(Math.round(d.dx), Math.round(d.dy));
    }
    panEnd(q) {
        const d = this.mapDrag; if (!d || q.id !== d.id) return;
        this.mapDrag = null;
        if (!d.moved || !this.panLayer?.scene) return;
        const k = this.vp.w * d.cam0.z;
        this.cam = { ...d.cam0, x: d.cam0.x - d.dx / k, y: d.cam0.y - d.dy / (k / 2) };
        this.panCam = { key: `${this.mapKey}|${this.vp.w}x${this.vp.h}`, x: this.cam.x, y: this.cam.y };
        this.panLayer.setPosition(0, 0);
        this.drawTerritories(); // 핀·라벨(겹침 완화는 새 화면 좌표 기준)·색칠·국호 판 다시
        this.loadMapImage();
        this.time.delayedCall(0, () => { this.panSuppress = false; }); // 이번 손 뗌의 핀 탭만 무시
    }

    P(lon, lat) { const n = norm(lon, lat); const p = project(this.cam, this.vp, n.x, n.y); return { x: p.sx, y: p.sy }; }

    // 시즌 지도 사각형(화면 좌표): base·cell 공통
    seasonRect() { const { vb, cam, vp } = this; const k = vp.w * cam.z; const tl = project(cam, vp, vb.x0, vb.y0); return { x: tl.sx, y: tl.sy, w: (vb.x1 - vb.x0) * k, h: ((vb.y1 - vb.y0) * k) / 2 }; }
    // 셀 이미지는 RGBA(흰색 + 영역 알파) 가정: 일반 혼합에 tint 만 곱한다(gacha116: 알파 없는 흑백 L 모드 PNG 는 불투명 검정으로 덮여 지도가 검게 보였음 -> 안아트 RGBA 재생성).
    //  가산·곱하기 등 blendMode 는 쓰지 않는다(L 모드가 다시 들어와도 검은 판 외 부작용 없게)
    // 거점 영역 색칠(r2 cell): 소유국 색(조선 #2E6FD8 / 일본 #C8322E / 그 외 서버 색, 소유 없음 #6B7280) 알파 0.55 + 경계 cell_edges
    drawSeasonCells() {
        const layer = this.realmLayer; if (!layer) return;
        layer.removeAll(true);
        const gen = (this.cellGen = (this.cellGen ?? 0) + 1); // 이번 그리기 세대: 이전 그리기의 늦은 withUiImage 콜백은 무시(이중 틴트 방지, 정검수)
        const ts = this.mp?.territories ?? [];
        const keepTop = () => gen === this.cellGen && layer.list.filter((o) => o.isTerrain || o.isEdge).sort((a, b) => (a.isEdge ? 1 : 0) - (b.isEdge ? 1 : 0)).forEach((o) => layer.bringToTop(o)); // 순서: 셀 < 지형 < 경계
        const put = (k, tint, alpha) => { if (!layer.scene || gen !== this.cellGen) return; const rr = this.seasonRect(); const im = this.add.image(rr.x, rr.y, k).setOrigin(0).setDisplaySize(rr.w, rr.h).setAlpha(alpha); if (tint != null) im.setTint(tint); layer.add(im); return im; };
        ts.forEach((t) => {
            const key = `ui.season.map.cell.${t.code}`; if (!manifestHas(key) || loaded.manifest[key]?.deprecated) return;
            const tint = t.owner?.code ? (SEASON_TINT[t.owner.code] ?? hexNum(t.owner.color, SEASON_NEUTRAL)) : SEASON_NEUTRAL;
            withUiImage(this, key, (k) => { put(k, tint, SEASON_FX.tintAlpha); keepTop(); }); // 늦게 온 셀도 지형·경계 아래로
        });
        // 지형 질감: 틴트 위에 지도를 한 겹 더(일반 혼합, 알파 terrainAlpha) -> 진영색 아래 베이지 땅·산 질감이 비친다
        if (SEASON_FX.terrainAlpha > 0) withUiImage(this, SEASON_BASE, (k) => { const im = put(k, null, SEASON_FX.terrainAlpha); if (im) im.isTerrain = true; keepTop(); });
        // 경계: 금빛 글로우(1px 사방 어긋난 4겹, 금색 틴트) + 어두운 그림자 + 흰 본선(알파 1). 전부 일반 혼합
        if (manifestHas('ui.season.map.cell_edges')) withUiImage(this, 'ui.season.map.cell_edges', (k) => {
            const main = put(k, null, SEASON_FX.edgeAlpha); if (!main) return;
            const extra = [[-1, 0], [1, 0], [0, -1], [0, 1]].map(([dx, dy]) => { const g = put(k, 0xf0d58c, SEASON_FX.glowAlpha); if (g) g.setPosition(main.x + dx, main.y + dy); return g; });
            const sh = put(k, 0x14182a, 0.55); if (sh) sh.setPosition(main.x + 1, main.y + 2);
            [...extra, sh, main].forEach((o) => { if (o) o.isEdge = true; }); keepTop();
        });
    }

    loadMapImage() {
        const MK = this.mapKey ?? MAP_KEY;
        if (!this.vb) { console.warn('[War] manifest 에 지도 에셋 없음(단순 모드):', MK); return; }
        if (this.seasonMap) { // r2 시즌 지도: ui.* 키(로비와 같은 지연 로더)
            withUiImage(this, SEASON_BASE, (tk) => {
                if (!this.mapBox?.scene) return; const rr = this.seasonRect();
                this.imgLayer.removeAll(true);
                this.imgLayer.add(this.add.rectangle(rr.x, rr.y, rr.w, rr.h, SEASON_FX.sea, SEASON_FX.seaAlpha).setOrigin(0)); // 바다 판(지도 투명 영역 = 바다)
                this.imgLayer.add(this.add.image(rr.x, rr.y, tk).setOrigin(0).setDisplaySize(rr.w, rr.h));
                if (SEASON_FX.landLift > 0) this.imgLayer.add(this.add.image(rr.x, rr.y, tk).setOrigin(0).setDisplaySize(rr.w, rr.h).setBlendMode('ADD').setAlpha(SEASON_FX.landLift)); // 땅 밝기(가산, 땅 알파 안에서만)
                { const fg = this.add.graphics(); fg.lineStyle(2, COLOR.accent, 0.6).strokeRect(rr.x, rr.y, rr.w, rr.h); this.imgLayer.add(fg); } // 테두리 = Graphics(채움 0 Rectangle 은 마스크 필터 안에서 검은 판으로 그려졌다, gacha113)
            });
            return;
        }
        const ent = loaded.manifest[MK];
        const tk = ent.textureKey ?? texKey(MK);
        const attach = () => {
            if (!this.mapBox?.scene || !this.textures.exists(tk)) return;
            this.textures.get(tk).setFilter(Phaser.Textures.FilterMode.LINEAR);
            const { vb, cam, vp } = this;
            const k = vp.w * cam.z;
            const tl = project(cam, vp, vb.x0, vb.y0);
            const dw = (vb.x1 - vb.x0) * k; const dh = (vb.y1 - vb.y0) * k / 2;
            const im = this.add.image(tl.sx, tl.sy, tk).setOrigin(0).setDisplaySize(dw, dh);
            // 지도 상자 밖으로 넘치는 부분은 잘라 낸다(텍스처 px 기준 crop)
            const sx = im.width / dw; const sy = im.height / dh;
            const cx = Math.max(0, -tl.sx) * sx; const cy = Math.max(0, -tl.sy) * sy;
            if (!this.clipped) im.setCrop(cx, cy, Math.min(im.width - cx, vp.w * sx), Math.min(im.height - cy, vp.h * sy)); // 마스크 없는 캔버스 렌더만 잘라 냄
            this.imgLayer.removeAll(true);
            this.imgLayer.add(im);
        };
        if (this.textures.exists(tk)) { attach(); return; }
        ensureScope(this, scopeOf(MK, ent), () => attach(), { filter: (lg) => lg === MK });
    }

    drawTerritories() {
        const ts = this.mp?.territories ?? [];
        const byCode = new Map(ts.map((t) => [t.code, t]));
        const g = this.drawG.clear();
        this.pinLayer.removeAll(true); this.labelLayer.removeAll(true); // 팬 뒤 다시 그릴 때 이전 핀·라벨 제거(첫 그리기는 빈 레이어)
        const R = Math.max(26, Math.min(54, Math.min(this.vp.w, this.vp.h) * 0.085));
        // 핀 위치: 상자 밖 영토는 가장자리 안쪽(m)으로 끌어오고(off = 실제 방향 화살표), 끌어온 핀끼리 겹치면 가장자리를 따라 민다
        const { w: VW0, h: VH0 } = this.vp;
        const m = this.seasonMap ? 4 : Math.round(R + 10); // 끌어온 핀의 원(공격 가능 고리 R+9 포함)이 상자 밖으로 잘리지 않게. 시즌 지도(r3)는 전체가 상자 안이라 화살표 모드 사실상 끔(gacha113 '제주 ▼')
        const pos = new Map();
        ts.forEach((t) => {
            const raw = this.P(t.lon, t.lat);
            const p = { x: Math.max(m, Math.min(VW0 - m, raw.x)), y: Math.max(m, Math.min(VH0 - m, raw.y)), off: '' };
            if (raw.x < m) p.off = '◀'; else if (raw.x > VW0 - m) p.off = '▶'; else if (raw.y < m) p.off = '▲'; else if (raw.y > VH0 - m) p.off = '▼';
            pos.set(t.code, p);
        });
        // 끌어온 핀 분산: 상자 안 핀을 먼저 고정하고, 끌어온 핀은 가장자리를 따라 원래 자리에서 가까운 순(0, +s, -s, +2s, ...)으로
        // 다른 핀과 R*1.7 이상 떨어진 첫 자리. 같은 가장자리에 자리가 없으면 다른 축(안쪽)으로 민다. 모서리(쓰시마·나고야)에서도 같은 좌표로 겹치지 않게
        const fixed = ts.filter((x) => !pos.get(x.code).off).map((x) => pos.get(x.code));
        const gapOk = (x, y) => fixed.every((o) => Math.hypot(o.x - x, o.y - y) >= R * 1.7);
        const s = R * 1.8;
        ts.filter((x) => pos.get(x.code).off).forEach((x) => {
            const p = pos.get(x.code);
            const alongY = p.off === '◀' || p.off === '▶';
            const tries = [];
            for (let k = 0; k <= 10; k += 1) [k, -k].forEach((d, i) => { if (k === 0 && i) return; tries.push(alongY ? [p.x, p.y + d * s] : [p.x + d * s, p.y]); });
            for (let k = 1; k <= 6; k += 1) tries.push(alongY ? [p.x + (p.off === '▶' ? -k : k) * s, p.y] : [p.x, p.y + (p.off === '▼' ? -k : k) * s]); // 안쪽으로
            const ok = tries.map(([tx, ty]) => [Math.max(m, Math.min(VW0 - m, tx)), Math.max(m, Math.min(VH0 - m, ty))]).find(([tx, ty]) => gapOk(tx, ty));
            const cand = tries.map(([tx, ty]) => [Math.max(m, Math.min(VW0 - m, tx)), Math.max(m, Math.min(VH0 - m, ty))]);
            const far = ok ?? cand.reduce((b, q) => { const dm = Math.min(...fixed.map((o) => Math.hypot(o.x - q[0], o.y - q[1]))); return dm > b.d ? { d: dm, q } : b; }, { d: -1, q: null }).q; // 빈자리 없으면 다른 핀과 가장 먼 후보
            if (far) { p.x = far[0]; p.y = far[1]; }
            fixed.push(p);
        });
        const PP = (t) => pos.get(t.code);
        if (this.seasonMap) this.drawSeasonCells(); else this.drawRealm(pos, R); // 세력 영토 색칠 + 경계선(핀·인접선 아래). r2 시즌 지도 = 거점 cell 틴트
        // 인접선(점선): 영토 쌍마다 1회
        const seen = new Set();
        this.linkRects = []; // 인접 점선 영역(국호 판 회피용, 12px 간격 점)
        ts.forEach((t) => (t.neighbors ?? []).forEach((nc) => {
            const o = byCode.get(nc); const key = [t.code, nc].sort().join('|');
            if (!o || seen.has(key)) return;
            seen.add(key);
            const p = PP(t); const q = PP(o);
            const d = Math.hypot(q.x - p.x, q.y - p.y); const ux = (q.x - p.x) / d; const uy = (q.y - p.y) / d;
            for (let s = R * 0.6; s < d - R * 0.6; s += 14) {
                const e = Math.min(d - R * 0.6, s + 8);
                this.linkRects.push({ x0: p.x + ux * s - 5, x1: p.x + ux * s + 5, y0: p.y + uy * s - 5, y1: p.y + uy * s + 5 });
                g.lineStyle(5, COLOR.ink, 0.5).lineBetween(p.x + ux * s, p.y + uy * s, p.x + ux * e, p.y + uy * e);
                g.lineStyle(2.5, SEA_EDGES.has(key) ? 0x9fc3e8 : 0xf4ecd8, 0.95).lineBetween(p.x + ux * s, p.y + uy * s, p.x + ux * e, p.y + uy * e); // 바다 건너 간선(부산-쓰시마·전주-제주) = 옅은 파랑
            }
        }));
        // 진군 화살표(ui.season.arrow.<ally|enemy>, 시즌 지도만): 공성 중 거점마다, 공성국이 소유한 인접 거점에서 그 거점 쪽으로(간선 가운데, 진행 방향 회전). 키·데이터 없으면 생략
        if (this.seasonMap) {
            const me = this.st?.me?.country ?? this.st?.countries?.[0]?.code;
            ts.filter((t) => t.state === 'siege' && t.siege_country).forEach((t) => {
                const src = (t.neighbors ?? []).map((nc) => byCode.get(nc)).find((o) => o?.owner?.code === t.siege_country); if (!src) return;
                const a = PP(src); const b = PP(t); const d = Math.hypot(b.x - a.x, b.y - a.y); if (d < 30) return;
                const key = `ui.season.arrow.${t.siege_country === me ? 'ally' : 'enemy'}`;
                withUiImage(this, key, (k) => { if (!this.pinLayer?.scene) return; const im = this.add.image((a.x + b.x) / 2, (a.y + b.y) / 2, k); const sc0 = Math.min(1, (d * 0.55) / im.width); im.setScale(sc0).setRotation(Math.atan2(b.y - a.y, b.x - a.x)).setAlpha(0.9); this.pinLayer.addAt(im, 0); });
            });
        }
        const { w: VW, h: VH } = this.vp;
        const inBox = (p, m = 0) => p.x >= -m && p.x <= VW + m && p.y >= -m && p.y <= VH + m;
        // 라벨 배치: 수도 먼저, 아래 기본 -> 겹치면 위 -> 둘 다 겹치면 겹침이 적은 쪽 + 축소. 다른 핀(±12px)·이미 놓인 라벨과의 겹침, 지도 상자 이탈을 비용으로 본다
        const pins = ts.map((t) => ({ t, p: PP(t) }));
        const placed = [];
        const ov = (a, b) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
        const out = (q) => Math.max(0, -q.x0) + Math.max(0, q.x1 - VW) + Math.max(0, -q.y0) + Math.max(0, q.y1 - VH);
        const tight = VW < 600 || VH < 360; // 좁은 지도: 겹치는 비우선 라벨은 숨김(핀만, 탭하면 상세 패널)
        const placeLabel = (self, lab, lw, lh, must = true) => {
            const p = self.p;
            // 가로: 지도 상자 안으로 밀어 넣기(핀이 상자 안일 때만)
            let dx = 0;
            if (inBox(p)) { const l = p.x - lw / 2; const rr = p.x + lw / 2; if (l < 4) dx = 4 - l; else if (rr > VW - 4) dx = VW - 4 - rr; }
            // 후보: 아래 / 위 / 오른쪽 / 왼쪽(부산·쓰시마처럼 남북으로 붙은 핀은 옆으로 비킨다). 같은 비용이면 앞 후보 우선
            const far = R * 0.9; // 기본 4방향 + 더 먼 4방향·대각(다른 핀 원을 피할 자리 확보)
            const cands = [[dx, 16], [dx, -16 - lh], [16 + lw / 2, -lh / 2], [-16 - lw / 2, -lh / 2], [dx, 16 + far], [dx, -16 - lh - far], [16 + lw / 2 + far, -lh / 2], [-16 - lw / 2 - far, -lh / 2], [16 + lw / 2, 12], [-16 - lw / 2, 12], [16 + lw / 2, -12 - lh], [-16 - lw / 2, -12 - lh]].map(([ox, dy]) => {
                const q = { x0: p.x + ox - lw / 2, x1: p.x + ox + lw / 2, y0: p.y + dy, y1: p.y + dy + lh };
                let cost = placed.reduce((s, b) => s + ov(q, b), 0);
                pins.forEach((o) => { if (o !== self) cost += ov(q, { x0: o.p.x - R * 0.85, x1: o.p.x + R * 0.85, y0: o.p.y - R * 0.85, y1: o.p.y + R * 0.85 }); }); // 다른 핀 원(마커)을 덮는 자리 회피
                cost += out(q) * 1000; // 지도 상자 밖으로 잘리는 자리(끌어온 가장자리 핀 포함)
                return { ox, dy, q, cost };
            }).filter((c, i) => !p.off || i < 4 || i > 7); // 지도 밖(가장자리로 끌어온) 핀은 먼 후보(R*0.9 떨어진 4곳) 제외: 라벨이 핀에서 멀어져 어느 핀 라벨인지 헷갈림(2026-11-03 강화면 Low)
            const best = cands.find((c) => c.cost <= 0) ?? cands.reduce((a, b) => (b.cost < a.cost ? b : a));
            if (best.cost > 0 && !must) { lab.setVisible(false); return; }
            lab.setPosition(p.x + best.ox, p.y + best.dy); // labelLayer(절대 좌표)
            if (best.cost > 0) lab.setScale(0.82);
            placed.push(best.q);
        };
        const prio = (o) => (o.t.code === this.selCode ? 4 : 0) + (o.t.occupation > 0 || o.t.state === 'siege' ? 1 : 0);
        const order = [...pins].sort((a, b) => prio(b) - prio(a)); // 선택 > 점령 진행 거점 순으로 라벨 자리 우선(수도 우선순위 제거 — 화면에 수도 구분 없음)
        order.forEach((pin) => {
            const { t, p } = pin;
            const col = hexNum(t.owner?.color);
            const c = this.add.container(p.x, p.y);
            if (!this.clipped && !inBox(p, R)) c.setVisible(false); // 캔버스 렌더(마스크 없음): 상자 밖 핀은 숨김
            // 영토 범위(반투명 원, 소유국 색) + 공성 중이면 공성국 색 바깥 고리
            const r0 = Math.round(R * 0.42); // 영토 범위는 색칠(drawRealm)이 보여 주므로 원은 작게·흐리게, 선택/호버 때만 강조
            const area = this.add.circle(0, 0, r0, col, this.selCode === t.code ? 0.45 : 0.14).setStrokeStyle(2, col, this.selCode === t.code ? 1 : 0.5);
            c.add(area); c.area = area;
            if (t.state === 'siege' && t.siege_country) c.add(this.add.circle(0, 0, r0 + 6).setFillStyle().setStrokeStyle(3, hexNum(this.countryOf(t.siege_country)?.color, COLOR.danger), 0.95));
            if (t.attackable) {
                const ring = this.add.circle(0, 0, r0 + 10).setFillStyle().setStrokeStyle(2, COLOR.accentLight, 1);
                c.add(ring);
                this.tweens.add({ targets: ring, alpha: 0.25, duration: 800, yoyo: true, repeat: -1 });
            }
            // 핀: 모든 거점 같은 모양(수도 금테·별·도성 아이콘 표시 제거, 데이터 kind 는 그대로)
            const cap = false; const major = t.kind === 'capital'; // 주요 거점: 원을 조금 키우고 금테(수도·별 표기 없음)
            const dot = this.add.circle(0, 0, major ? 10 : 8, col, 1).setStrokeStyle(major ? 2.5 : 2, major ? COLOR.accentLight : COLOR.ink, 1);
            c.add(dot);
            // 시즌 핀(안아트 ui.season.pin.<major|normal>.<ally|enemy|neutral>): 주요 거점 = 서버 kind capital(표기는 '주요 거점'만), 진영 = 내 국가(미가입이면 첫 국가) 기준 아군/적/중립
            if (SEASON_R3_MAP) { const me = this.st?.me?.country ?? this.st?.countries?.[0]?.code; const sd = !t.owner?.code ? 'neutral' : t.owner.code === me ? 'ally' : 'enemy'; const rk = t.kind === 'capital' ? 'major' : 'normal'; // 시즌 핀 이미지도 r3 지도와 함께 비활성(롤백: gacha111 이전 원형 핀)
              const ph = tight ? 30 : 42; const pw = rk === 'major' ? ph * (64 / 75) : ph;
              withUiImage(this, `ui.season.pin.${rk}.${sd}`, (k) => { if (!c.scene) return; dot.setVisible(false); const im = this.add.image(0, 0, k).setOrigin(0.5, 0.78).setDisplaySize(pw, ph); c.addAt(im, c.getIndex(dot) + 1); c.seasonPin = im; });
              withUiImage(this, 'ui.season.pin.selected', (k) => { if (!c.scene) return; const sim = this.add.image(0, 0, k).setDisplaySize(ph * 1.5, ph * 1.5).setVisible(this.selCode === t.code); c.addAt(sim, 0); const old = c.selRing; old?.setAlpha(0); c.selRing = sim; this.tweens.add({ targets: sim, alpha: { from: 0.55, to: 1 }, duration: 900, yoyo: true, repeat: -1 }); }); }
            if (cap) c.add(makeText(this, 0, -1, '★', { size: 12, bold: true, color: '#f0d58c', origin: [0.5, 0.5] }));
            // 거점 아이콘(map.icon 성곽) 제거(사용자 2026-11-04: 성 이미지와 원형 핀이 겹쳐 그려짐 -> 진영색 원형 핀만). addTerrIcon 함수는 남김
            // 채움 없는 고리: fillAlpha 0 도형은 지도 마스크 필터 안에서 검게 그려질 수 있어 채움 자체를 끈다(setFillStyle(), gacha113)
            const sel = this.add.circle(0, 0, r0 + 14).setFillStyle().setStrokeStyle(3, 0xffffff, 0.95).setVisible(this.selCode === t.code);
            c.add(sel); c.selRing = sel; c.code = t.code;
            // 이름 + 점령도 게이지(라벨 묶음 lab: 핀 기준 아래/위로 배치)
            const lab = this.add.container(0, 0);
            const offL = p.off === '◀' || p.off === '▲' ? `${p.off} ` : ''; const offR = p.off === '▶' || p.off === '▼' ? ` ${p.off}` : ''; // 지도 밖 영토: 실제 방향
            const nm = makeText(this, 0, 0, `${offL}${t.name}${offR}`, { size: tight ? 12 : 15, bold: true, origin: [0.5, 0], stroke: { color: '#0B1020', width: tight ? 3 : 4 } }); // 좁은 지도: 작은 글자·'(수도)' 생략(핀의 별로 구분) — 이름표 겹침 완화(강화면 gacha52)
            if (p.off) { const bwp = nm.width + 12; lab.add(this.add.rectangle(-bwp / 2, -2, bwp, nm.height + 4, COLOR.ink, 0.85).setOrigin(0).setStrokeStyle(2, col, 1)); }
            lab.add(nm);
            // 점령도: 진행 중(>0)일 때만 이름 아래 얇은 막대(글자는 상세 패널에서만)
            const gw = 56; const gy = nm.height + 2; const req = Math.max(1, t.occupation_required || 100);
            const bar = t.occupation > 0;
            if (bar) {
                lab.add(this.add.rectangle(-gw / 2, gy, gw, 6, COLOR.ink, 0.85).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.8));
                lab.add(this.add.rectangle(-gw / 2 + 1, gy + 1, Math.max(2, (gw - 2) * Math.min(1, t.occupation / req)), 4, COLOR.accentLight, 1).setOrigin(0));
            }
            this.labelLayer.add(lab);
            if (!this.clipped && !inBox(p, R)) lab.setVisible(false);
            placeLabel(pin, lab, Math.max(nm.width + (p.off ? 20 : 0), bar ? gw : 0), gy + (bar ? 7 : 0) + (p.off ? 6 : 0), !tight || prio(pin) > 0 || !!p.off); // 지도 밖 거점(방향 화살표 라벨)은 숨기지 않음
            // 탭: 공격 가능하면 공격 확인, 아니면 사유 토스트. 판정 영역 = 원 안 + 지도 상자 안(상자 밖으로 넘친 원이 상단 바 버튼 입력을 가리지 않게)
            const hitCirc = new Phaser.Geom.Circle(R, R, R);
            const hit = this.add.circle(0, 0, R, 0xffffff, 0.001).setInteractive({
                hitArea: hitCirc,
                hitAreaCallback: (area, hx, hy) => Phaser.Geom.Circle.Contains(area, hx, hy) && inBox({ x: p.x + hx - R, y: p.y + hy - R }),
                useHandCursor: true,
            });
            hit.on('pointerdown', (ptr) => this.panStart(ptr)); // 핀 위에서 시작한 드래그도 팬
            hit.on('pointerup', (ptr) => { // 탭 = 상세 패널. 히트 원이 겹치면 누른 지점에서 가장 가까운 핀
                if (this.modalCount > 0 || this.panSuppress) return; // 6px 넘게 끌었으면(팬) 탭 무시
                const mm = this.clipLayer.getWorldTransformMatrix(); const lp = mm.applyInverse(ptr.worldX, ptr.worldY);
                const nearT = pins.reduce((b, o) => { const d = Math.hypot(o.p.x - lp.x, o.p.y - lp.y); return d < b.d ? { d, t: o.t } : b; }, { d: Infinity, t }).t;
                this.selectTerr(nearT);
            });
            hit.on('pointerover', () => { if (this.selCode !== t.code) area.setFillStyle(col, 0.38).setStrokeStyle(3, 0xf4ecd8, 1); }); // 호버 = 밝은 테두리로 분명히
            hit.on('pointerout', () => { if (this.selCode !== t.code) area.setFillStyle(col, 0.14).setStrokeStyle(2, col, 0.5); });
            c.addAt(hit, 0);
            this.pinLayer.add(c);
        });
        this.pinRects = placed.concat(pins.map((o) => ({ x0: o.p.x - R * 0.6, x1: o.p.x + R * 0.6, y0: o.p.y - R * 0.6, y1: o.p.y + R * 0.6 })));
        this.drawPlaques(pos);
        // QA(개발·?debug=1): 핀 컨테이너 실제 좌표 vs 투영 기대 좌표(서버 lon/lat) 비교 — window.__warPins()
        try { if ((import.meta.env?.DEV || import.meta.env?.VITE_QA_HOOKS === '1') && new URLSearchParams(location.search).get('debug') === '1') { window.__warPins = () => (this.pinLayer?.list ?? []).filter((c) => c.code).map((c) => { const t = ts.find((x) => x.code === c.code); const e = t ? this.P(t.lon, t.lat) : null; const p = pos.get(c.code); return { code: c.code, lon: t?.lon, lat: t?.lat, x: Math.round(c.x), y: Math.round(c.y), ex: e ? Math.round(e.x) : null, ey: e ? Math.round(e.y) : null, off: p?.off ?? '' }; }); this.events.once('shutdown', () => { delete window.__warPins; }); } } catch { /* QA 훅 실패 무시 */ }
        if (this.selCode) this.renderDetail();
    }

    // 거점 아이콘: map.icon.walled_capital / eupseong(scope map 지연 로드). 없으면 원형 핀만
    addTerrIcon(c, cap, R) {
        const lg = TERR_ICON[cap ? 'capital' : 'normal'];
        if (!manifestHas(lg)) return;
        const ent = loaded.manifest[lg]; const tk = ent.textureKey ?? texKey(lg);
        const put = () => { if (!c.scene || !this.textures.exists(tk)) return; const im = this.add.image(0, -4, tk).setOrigin(0.5, 1); im.setScale(Math.min(R * 1.1, 44) / im.height); c.addAt(im, 2); };
        if (this.textures.exists(tk)) put(); else ensureScope(this, scopeOf(lg, ent), put, { filter: (k) => k === lg });
    }

    // 국호 판(국기 에셋 없음): 국가별로 소유 거점 중 수도(없으면 첫 거점) 근처 빈자리에 '현지 국호(큰 글자) + 한글'. 데이터 = 서가 영토 판(plaque.native/ko)
    drawPlaques(pos) {
        this.plaqueLayer?.destroy();
        this.plaqueLayer = this.add.container(0, 0);
        (this.panLayer ?? this.clipLayer).addAt(this.plaqueLayer, Math.min(2, (this.panLayer ?? this.clipLayer).list.length));
        const ts = this.mp?.territories ?? [];
        const scnP = this.mp?.scenario_code ?? this.st?.season?.scenario_code ?? 'imjin'; const pre = PLAQUE_PREFIX[scnP] ?? (scnP === 'imjin' ? 'ch1_' : null);
        const draw = (terr) => {
            if (!this.plaqueLayer?.scene) return;
            this.plaqueLayer.removeAll(true);
            const taken = [...(this.pinRects ?? []), ...(this.linkRects ?? [])]; // 핀·라벨·인접 점선 회피
            (this.st?.countries ?? []).forEach((co) => {
                const own = ts.filter((x) => x.owner?.code === co.code);
                if (!own.length) return;
                const ops = own.map((x) => pos.get(x.code)).filter(Boolean);
                const at = { x: ops.reduce((s, q) => s + q.x, 0) / ops.length, y: ops.reduce((s, q) => s + q.y, 0) / ops.length }; // 자국 거점 중심
                const a0 = Math.atan2(at.y - this.vp.h / 2, at.x - this.vp.w / 2); // 지도 가운데에서 바깥 방향
                const foreign = ts.filter((x) => x.owner?.code !== co.code).map((x) => pos.get(x.code)).filter(Boolean);
                const near = (x, y) => ops.some((q) => Math.hypot(q.x - x, q.y - y) <= 140) && !foreign.some((q) => Math.hypot(q.x - x, q.y - y) < Math.min(...ops.map((o) => Math.hypot(o.x - x, o.y - y)))); // 자국 거점이 타국 거점보다 가까운 자리만
                // 판 데이터 우선순위: 서버 countries[].plaque > territory_faction_id 의 영토 판 > 시나리오 접두사 규칙(PLAQUE_PREFIX, 폴백)
                const fp = co.plaque && typeof co.plaque === 'object' ? co.plaque : (terr?.factions ?? []).find((x) => x.id === (co.territory_faction_id ?? (pre ? `${pre}${co.code}` : null)))?.plaque ?? null;
                const native = fp?.native ?? fp?.text ?? '';
                const face = native ? plaqueFace(fp.native_script ?? fp.script, fp.native_lang) : null;
                const big = native && face?.file && plaqueCovers(face.id, native) ? native : co.name;
                const o = this.add.container(0, 0);
                const t1 = makeText(this, 0, -6, big, { size: 20, bold: true, color: '#fff6da', origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 4 } });
                if (big === native && face) t1.setFontFamily(face.stack);
                const t2 = big === native ? makeText(this, 0, 13, co.name, { size: 11, bold: true, color: textCol(co.color), origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }) : null;
                const w = Math.max(t1.width, t2?.width ?? 0) + 18; const h = t2 ? 46 : 32;
                const bg = this.add.graphics().fillStyle(hexNum(co.color), 0.78).fillRoundedRect(-w / 2, -h / 2, w, h, 6).lineStyle(2, 0xf4ecd8, 0.9).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
                o.add([bg, t1, ...(t2 ? [t2] : [])]);
                // 자리: 거점 위쪽부터 나선 후보, 핀·라벨·다른 판과 겹치지 않는 첫 자리(지도 상자 안). 없으면 생략
                const hit = (x, y) => taken.some((q) => x + w / 2 > q.x0 && x - w / 2 < q.x1 && y + h / 2 > q.y0 && y - h / 2 < q.y1) || x - w / 2 < 4 || x + w / 2 > this.vp.w - 4 || y - h / 2 < 4 || y + h / 2 > this.vp.h - 4;
                let spot = null;
                for (let r = 0; r <= 180 && !spot; r += 20) for (let k = 0; k < 12 && !spot; k += 1) { const a = a0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * (Math.PI / 6); const x = at.x + Math.cos(a) * r * 1.2; const y = at.y + Math.sin(a) * r; if (!hit(x, y) && near(x, y)) spot = { x, y }; } // 자리 없으면 생략(국가 요약은 목록에)
                if (!spot) { o.destroy(); return; }
                o.setPosition(spot.x, spot.y);
                taken.push({ x0: spot.x - w / 2 - 4, x1: spot.x + w / 2 + 4, y0: spot.y - h / 2 - 4, y1: spot.y + h / 2 + 4 });
                this.plaqueLayer.add(o);
                if (big !== native && native && face?.id && face.file) loadPlaqueFont(face.id).then((ok) => { if (ok && this.plaqueLayer?.scene) draw(terr); }); // 폰트가 늦게 오면 현지 국호로 다시
            });
        };
        draw(this.terrData ?? null);
        if (!this.terrData) loadTerritories().then((d) => { this.terrData = d; draw(d); }).catch(() => { /* 판 없이 한글 국호 */ });
    }

    // ---------- 거점 상세 패널(지도 안: 가로 = 오른쪽 위, 세로 = 아래) ----------
    selectTerr(t) {
        this.selCode = t?.code ?? null;
        this.pinLayer?.list.forEach((c) => {
            c.selRing?.setVisible(c.code === this.selCode);
            const on = c.code === this.selCode; const col = c.area?.fillColor;
            if (c.area) c.area.setFillStyle(col, on ? 0.45 : 0.14).setStrokeStyle(2, col, on ? 1 : 0.5);
        });
        this.renderDetail();
        if (this.tab === 'terr' && this.tabBox?.scene) this.renderTab('terr');
    }

    renderDetail() {
        this.detail?.destroy(); this.detail = null;
        const t = (this.mp?.territories ?? []).find((x) => x.code === this.selCode);
        if (!t || !this.mapBox?.scene) return;
        const at = this.st?.attacks ?? {};
        const vp = this.vp; const wide = this.wideLayout;
        if (wide && vp.h < 420) { this.renderDetailBar(t, at); return; } // 낮은 가로(844x390 등): 한 줄 바
        const w = wide ? Math.min(280, vp.w - 24) : vp.w - 16;
        const pp = this.pinLayer?.list.find((c) => c.code === t.code);
        const x = wide ? vp.w - w - 10 : 8;
        const box = this.add.container(x, 0);
        const bgR = this.add.rectangle(0, 0, w, 10, COLOR.navyDeep, 0.98).setOrigin(0).setStrokeStyle(2, hexNum(t.owner?.color, COLOR.accent), 0.95);
        box.add(bgR);
        const close = this.add.rectangle(w - 34, 4, 30, 30, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
        close.on('pointerup', () => this.selectTerr(null));
        box.add([close, makeText(this, w - 19, 19, '×', { size: 20, bold: true, color: CSS.muted, origin: [0.5, 0.5] })]);
        let yy = 10;
        const add = (str, o) => { const tx = fitText(makeText(this, 12, yy, str, o), w - 52); box.add(tx); yy += tx.height + 4; return tx; };
        add(`${t.name}`, { size: 18, heading: true, color: '#f0d58c' });
        add(`${t.owner?.name ?? '-'} 점령${this.originText(t)}`, { size: 13, bold: true, color: textCol(t.owner?.color) });
        add(this.defenseText(t), { size: 12, color: CSS.text });
        if (t.state === 'siege' && t.siege_country) add(`${this.cname(t.siege_country)} 공성 중`, { size: 12, color: CSS.dangerText });
        const req = Math.max(1, t.occupation_required || 100); const gw = w - 24;
        box.add(this.add.rectangle(12, yy + 2, gw, 10, COLOR.ink, 0.9).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.8));
        if (t.occupation > 0) box.add(this.add.rectangle(13, yy + 3, Math.max(2, (gw - 2) * Math.min(1, t.occupation / req)), 8, COLOR.accentLight, 1).setOrigin(0));
        yy += 16;
        add(`점령도 ${t.occupation}/${req}`, { size: 12, color: CSS.muted });
        const { can, reason } = this.attackGate(t, at);
        const bh = 44;
        if (!can && reason) { yy += 4; add(reason, { size: 12, color: t.attack_blocked_reason === 'cooldown' ? CSS.accent : CSS.muted }); } // 점령도 줄과 간격(겹침 방지)
        const by = yy + 6; const h = Math.min(vp.h - 16, by + bh + 10); // 내용 높이에 맞춘 패널(사유 문구 아래에 버튼)
        bgR.setSize(w, h);
        box.add(new Button(this, { x: 12, y: Math.min(by, h - bh - 10), w: w - 24, h: bh, label: '공격', variant: 'primary', size: 16, disabled: !can, reason, onClick: () => this.confirmAttack(t) }));
        if (wide) box.y = pp && pp.x > vp.w - w - 40 && pp.y < h + 20 ? vp.h - h - 10 : 10;
        else {
            // 세로(390 등): 위(8)/아래(vp.h-h-8) 중 고른 핀(반경 약 30 + 라벨)과 덜 겹치는 쪽. 둘 다 겹치면 핀에서 먼 쪽
            const top = 8; const bot = vp.h - h - 8; const py0 = (pp?.y ?? -999) - 30; const py1 = (pp?.y ?? -999) + 44;
            const ov = (y0) => Math.max(0, Math.min(y0 + h, py1) - Math.max(y0, py0));
            const ot = ov(top); const ob = ov(bot);
            box.y = !pp ? bot : ot === ob ? (pp.y > vp.h / 2 ? top : bot) : ot < ob ? top : bot;
        } // 고른 핀을 가리지 않는 쪽
        this.mapBox.add(box);
        this.detail = box;
    }

    // 공격 버튼 가능 여부·사유: 서버 attackable > 진행 중 시즌 전투(open_battle, war_battle_open 방지) > 일일 횟수
    attackGate(t, at = this.st?.attacks ?? {}) {
        if (!t.attackable) return { can: false, reason: this.blockText(t) };
        if (this.st?.open_battle?.battle_id) return { can: false, reason: OPEN_BATTLE_TEXT };
        if ((at.left ?? 0) <= 0) return { can: false, reason: messageOf({ code: 'daily_limit' }) };
        return { can: true, reason: '' };
    }

    // 방어 정보(서버 defense{level, max_heroes, max_cost}, 없으면 defense_level)
    defenseText(t) {
        const d = t.defense ?? {};
        const lv = d.level ?? t.defense_level;
        return [`방어 ${lv}단계`, d.max_heroes != null ? `수비 장수 ${d.max_heroes}명` : '', d.max_cost != null ? `코스트 ${d.max_cost}` : ''].filter(Boolean).join(' · ');
    }
    // 원래 주인(start_country)과 현 점령국이 다르면 ' · ○○ 원래 영토'
    originText(t) { return t.start_country && t.start_country !== t.owner?.code ? ` · ${this.cname(t.start_country)} 원래 영토` : ''; }

    // 한 줄 상세 바: 이름·점령국·점령도 + 공격 버튼. 고른 핀이 아래쪽이면 위에 둔다
    renderDetailBar(t, at) {
        const vp = this.vp; const h = 52; const w = vp.w - 16;
        const pp = this.pinLayer?.list.find((c) => c.code === t.code);
        const y = pp && pp.y > vp.h - h - 50 ? 8 : vp.h - h - 8;
        const box = this.add.container(8, y);
        box.add(this.add.rectangle(0, 0, w, h, COLOR.navyDeep, 0.94).setOrigin(0).setStrokeStyle(2, hexNum(t.owner?.color, COLOR.accent), 0.95));
        const { can, reason } = this.attackGate(t, at);
        const req = Math.max(1, t.occupation_required || 100);
        const bw = 92; const cw = 30;
        box.add(fitText(makeText(this, 10, 16, `${t.name}  ${t.owner?.name ?? '-'}`, { size: 15, bold: true, color: textCol(t.owner?.color), origin: [0, 0.5] }), w - bw - cw - 24));
        box.add(fitText(makeText(this, 10, 36, `점령도 ${t.occupation}/${req} · ${this.defenseText(t)}${this.originText(t)}${!can && reason ? ` · ${reason}` : ''}`, { size: 12, color: CSS.muted, origin: [0, 0.5] }), w - bw - cw - 24));
        box.add(new Button(this, { x: w - bw - cw - 8, y: 6, w: bw, h: h - 12, label: '공격', variant: 'primary', size: 15, disabled: !can, reason, onClick: () => this.confirmAttack(t) }));
        const close = this.add.rectangle(w - cw - 2, 6, cw, h - 12, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
        close.on('pointerup', () => this.selectTerr(null));
        box.add([close, makeText(this, w - cw / 2 - 2, h / 2, '×', { size: 20, bold: true, color: CSS.muted, origin: [0.5, 0.5] })]);
        this.mapBox.add(box);
        this.detail = box;
    }

    // ---------- 오른쪽(세로: 아래) 패널(fe46 재작업): 머리(시즌·남은 시간·내 소속/기여/순위) + 탭[현황|거점|순위|전황|기록] ----------
    // 모든 레이아웃(가로 1280x720·낮은 가로·세로 390x844) 공통. 기본 탭 = '현황'(세력 현황판). 성·거점 상세는 지도 위 패널(renderDetail)
    // ---------- 시즌 전쟁 시안(사용자 2026-11-04 images/65.png) 지도 위 HUD: 타이틀 배너 · 시즌명·기간 · 두 진영 비율 바 · 좌우 진영 판 · 범례 ----------
    //  데이터 = state(season·countries[score·member_count·color·plaque]) + map(territories[kind·owner·state]). 전투력 추정·진영 문구는 데이터가 없어 표시 안 함.
    //  거점 구분은 '주요 거점'(kind capital) / '일반 거점' 2종만(수도·승리 조건 표기 없음, 사용자 지시). 에셋 키(ui.war.*)가 오기 전에는 스킨·코드 도형
    buildMapHud(r) {
        // 사용자 2026-11-04 '맵을 가리는 게이지나 참가인원은 전부 주요 거점 현황 위로': 지도 위에는 타이틀·비율 바·진영 판을 얹지 않는다(우측 현황 탭 buildFactionBlock 으로 이동).
        //  지도 위에 남는 것은 범례뿐이며, 그것도 지도 이미지 바깥 왼쪽 여백에 들어갈 때만(시즌 지도 contain). 핀을 가릴 수 있는 자리면 생략
        const st = this.st;
        const cs = [...(st?.countries ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 2);
        const hud = this.add.container(r.x, r.y); this.content.add(hud); this.mapHud = hud;
        const rows0 = 6 + cs.length; const lh0 = 22 + rows0 * 20;
        const rrL = this.seasonMap ? this.seasonRect() : null;
        const big = hudBig(r) && r.h - lh0 - 12 > 0; void rrL; // 범례 = 지도 위 좌하단(사용자 2026-11-04 '아까처럼 지도 위로 되돌려'). 데스크톱만, 입력 없음(비차단). 667·390 은 생략(지도 가림 방지)
        // 범례(좌하단): 주요 거점 · 일반 거점 · 전군로 · 진영 영토 색 · 교전 지역
        if (big) {
            const rows = [['major', '주요 거점'], ['normal', '일반 거점'], ['road', '전군로'], ...cs.map((c) => ['terr', `${c.name} 영토`, hexNum(c.color)]), ['siege', '교전 지역']];
            const lw = 150; const lh = 22 + rows.length * 20; const rr0 = this.seasonMap ? this.seasonRect() : { x: 0 }; const lx = Math.max(8, (rr0.x - lw) / 2); const ly = r.h - lh - 12; // 지도 왼쪽 여백에 들어가면 그 가운데
            // 위치: 네 모서리(좌하·우하·좌상·우상) 중 핀·이름표(가장자리 '▼' 화살표 포함)와 가장 덜 겹치는 곳(gacha120: 좌하단이 '제주 ▼'를 덮음)
            const objs = [...(this.pinLayer?.list ?? []).map((o) => ({ x: o.x - 16, y: o.y - 16, w: 32, h: 32 })), ...(this.labelLayer?.list ?? []).map((o) => { try { const b = o.getBounds(); return { x: b.x - r.x, y: b.y - r.y, w: b.width, h: b.height }; } catch { return null; } }).filter(Boolean)];
            const cands = [[lx, ly], [r.w - lw - 8, ly], [lx, 8], [r.w - lw - 8, 8]];
            const hitN = ([cx, cy]) => objs.reduce((n, q) => n + (q.x < cx + lw && q.x + q.w > cx && q.y < cy + lh && q.y + q.h > cy ? 1 : 0), 0);
            const [bx0, by0] = cands.reduce((best, cd) => (hitN(cd) < hitN(best) ? cd : best), cands[0]);
            const lg = this.add.container(bx0, by0); hud.add(lg);
            lg.add(this.add.rectangle(0, 0, lw, lh, 0x0b1328, 0.82).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.6));
            lg.add(makeText(this, 10, 11, '범례', { size: 13, bold: true, color: '#f0d58c', origin: [0, 0.5] }));
            rows.forEach(([k, label, col], i) => {
                const cy = 30 + i * 20; const g = this.add.graphics({ x: 18, y: cy }); lg.add(g);
                if (k === 'major') { g.fillStyle(0xf0d58c, 1).fillRect(-6, -4, 12, 9).fillTriangle(-7, -4, 0, -9, 7, -4).lineStyle(1, 0x2a1206, 1).strokeRect(-6, -4, 12, 9); }
                else if (k === 'normal') g.lineStyle(2.5, 0xe8e2cf, 1).strokeCircle(0, 0, 5);
                else if (k === 'road') { g.lineStyle(2, 0xe8e2cf, 1); [-8, -2, 4].forEach((x0) => g.lineBetween(x0, 0, x0 + 4, 0)); }
                else if (k === 'terr') g.fillStyle(col, 0.85).fillRect(-8, -5, 16, 10).lineStyle(1, 0xffffff, 0.5).strokeRect(-8, -5, 16, 10);
                else { g.fillStyle(0x6a5a7a, 0.85).fillRect(-8, -5, 16, 10); g.lineStyle(1, 0xffffff, 0.6); [-6, -1, 4].forEach((x0) => g.lineBetween(x0, 5, x0 + 4, -5)); }
                lg.add(makeText(this, 34, cy, label, { size: 12, color: CSS.text, origin: [0, 0.5] }));
            });
        }
    }

    // 진영 현황 블록(현황 탭, 주요 거점 현황 위): 점수 비율 바(점수가 모두 0 이면 거점 수 비율) + 두 진영 행(문장 ui.season.emblem.<국가> · 국호 · 참가 인원). 초상·깃발은 생략
    buildFactionBlock(c0, w, y) {
        const ts = this.mp?.territories ?? [];
        const cs = [...(this.st?.countries ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 2);
        if (cs.length < 2) return y;
        const own = (c) => ts.filter((x) => x.owner?.code === c.code).length;
        let a = Number(cs[0].score) || 0; let b = Number(cs[1].score) || 0; if (a + b <= 0) { a = own(cs[0]); b = own(cs[1]); }
        const pa = a + b > 0 ? Math.round((a / (a + b)) * 100) : 50;
        const bh = 24; const bx = 2; const bw = w - 4; const split = Math.round(bw * pa / 100);
        const ca = hexNum(cs[0].color, COLOR.ally); const cb = hexNum(cs[1].color, COLOR.danger);
        const g = this.add.graphics(); c0.add(g);
        g.fillStyle(0x0b1020, 0.9).fillRoundedRect(bx - 2, y - 2, bw + 4, bh + 4, 7);
        g.fillStyle(ca, 1).fillRoundedRect(bx, y, Math.max(8, split), bh, { tl: 6, bl: 6, tr: 0, br: 0 });
        g.fillStyle(cb, 1).fillRoundedRect(bx + split, y, Math.max(8, bw - split), bh, { tl: 0, bl: 0, tr: 6, br: 6 });
        g.lineStyle(1.5, COLOR.accent, 0.9).strokeRoundedRect(bx - 2, y - 2, bw + 4, bh + 4, 7);
        g.lineStyle(3, 0xf0d58c, 1).lineBetween(bx + split - 7, y + 5, bx + split + 7, y + bh - 5).lineBetween(bx + split + 7, y + 5, bx + split - 7, y + bh - 5);
        c0.add(makeText(this, bx + 10, y + bh / 2, `${cs[0].name} ${pa}%`, { size: 14, bold: true, origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        c0.add(makeText(this, bx + bw - 10, y + bh / 2, `${100 - pa}% ${cs[1].name}`, { size: 14, bold: true, origin: [1, 0.5], stroke: { color: '#0B1020', width: 3 } }));
        y += bh + 10;
        const half = Math.floor((w - 8) / 2);
        cs.forEach((c, i) => {
            const x0 = i ? half + 8 : 0; const col = hexNum(c.color, i ? COLOR.danger : COLOR.ally);
            const row = this.add.container(x0, y); c0.add(row);
            row.add(this.add.rectangle(0, 0, half, 52, COLOR.navyDeep, 0.85).setOrigin(0).setStrokeStyle(1.5, col, 0.85));
            row.add(this.add.rectangle(0, 0, 4, 52, col, 1).setOrigin(0));
            const nm = c.plaque?.native || c.plaque?.ko || c.name;
            const tx = 46;
            withUiImage(this, `ui.season.emblem.${c.code}`, (k) => { if (!row.scene) return; row.add(this.add.image(25, 26, k).setDisplaySize(34, 34)); });
            row.add(fitText(makeText(this, tx, 16, nm, { size: 17, heading: true, color: textCol(c.color), origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } }), half - tx - 8));
            row.add(fitText(makeText(this, tx, 38, `${nm !== c.name ? `${c.name} · ` : ''}참가 인원 ${Number(c.member_count ?? 0).toLocaleString('ko-KR')}명`, { size: 12, color: CSS.muted, origin: [0, 0.5] }), half - tx - 8));
        });
        return y + 52 + 12;
    }

    // 범례 블록(현황 탭, 주요 거점 현황 아래): 주요 거점 · 일반 거점 · 전군로 · 진영 영토 색 · 교전 지역(수도·승리 문구 없음). 가로로 흘려 배치(폭이 모자라면 다음 줄)
    buildLegendBlock(c0, w, y) {
        const cs = [...(this.st?.countries ?? [])].sort((a, b) => (b.score ?? 0) - (a.score ?? 0)).slice(0, 2);
        const items = [['major', '주요 거점'], ['normal', '일반 거점'], ['road', '전군로'], ...cs.map((c) => ['terr', `${c.name} 영토`, hexNum(c.color)]), ['siege', '교전 지역']];
        const small = w < 420; const fs = small ? 11 : 12; const rowH = small ? 20 : 22;
        c0.add(makeText(this, 2, y, '범례', { size: small ? 13 : 15, bold: true, color: '#f0d58c' })); y += small ? 20 : 24;
        const box = this.add.container(0, y); c0.add(box);
        let x = 8; let yy = rowH / 2 + 4;
        items.forEach(([k, label, col]) => {
            const t = makeText(this, 0, 0, label, { size: fs, color: CSS.text, origin: [0, 0.5] }); const iw = 22 + t.width + 14;
            if (x + iw > w - 4) { x = 8; yy += rowH; }
            const g = this.add.graphics({ x: x + 9, y: yy }); box.add(g);
            if (k === 'major') { g.fillStyle(0xf0d58c, 1).fillRect(-6, -4, 12, 9).fillTriangle(-7, -4, 0, -9, 7, -4).lineStyle(1, 0x2a1206, 1).strokeRect(-6, -4, 12, 9); }
            else if (k === 'normal') g.lineStyle(2.5, 0xe8e2cf, 1).strokeCircle(0, 0, 5);
            else if (k === 'road') { g.lineStyle(2, 0xe8e2cf, 1); [-8, -2, 4].forEach((x0) => g.lineBetween(x0, 0, x0 + 4, 0)); }
            else if (k === 'terr') g.fillStyle(col, 0.85).fillRect(-8, -5, 16, 10).lineStyle(1, 0xffffff, 0.5).strokeRect(-8, -5, 16, 10);
            else { g.fillStyle(0x6a5a7a, 0.85).fillRect(-8, -5, 16, 10); g.lineStyle(1, 0xffffff, 0.6); [-6, -1, 4].forEach((x0) => g.lineBetween(x0, 5, x0 + 4, -5)); }
            t.setPosition(x + 22, yy); box.add(t);
            x += iw;
        });
        const bh = yy + rowH / 2 + 4;
        box.addAt(this.add.rectangle(0, 0, w, bh, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.35), 0);
        return y + bh + 12;
    }

    // 교전 지역(현황 탭): 지금 교전 중(공성)이거나 점령이 진행 중인 거점(map 응답 state·siege_country·occupation), 최대 5개.
    //  행 = 소유 진영색 점 · 거점명 · 상태('○○ 공성 중 n/m' 또는 '점령 진행 n/m') · 돋보기(지도 선택). 없으면 '교전 중인 거점 없음'
    buildContestList(c0, w, y) {
        const ts = this.mp?.territories ?? [];
        const req = (x) => Math.max(1, x.occupation_required || 100);
        const list = ts.filter((x) => (x.state === 'siege' && x.siege_country) || x.occupation > 0)
            .sort((a, b) => (Number(b.state === 'siege') - Number(a.state === 'siege')) || (b.occupation / req(b)) - (a.occupation / req(a))).slice(0, 5);
        c0.add(makeText(this, 2, y, '교전 지역', { size: 15, bold: true, color: '#f0d58c' })); y += 24;
        if (!list.length) { const nt = noteText(this, 2, y, '교전 중인 거점 없음', { kind: 'muted', size: 13, wrap: w - 8 }); c0.add(nt); return y + nt.height + 12; }
        list.forEach((t) => {
            const row = this.add.container(0, y); c0.add(row);
            row.add(this.add.rectangle(0, 0, w, 34, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.35));
            row.add(this.add.circle(14, 17, 7, hexNum(t.owner?.color, 0x6b7280), 1).setStrokeStyle(1.5, COLOR.ink, 1));
            row.add(fitText(makeText(this, 28, 17, t.name, { size: 14, bold: true, origin: [0, 0.5] }), Math.max(40, w * 0.32)));
            const siege = t.state === 'siege' && t.siege_country;
            const st = siege ? `${this.cname(t.siege_country)} 공성 중 ${t.occupation}/${req(t)}` : `점령 진행 ${t.occupation}/${req(t)}`;
            row.add(fitText(makeText(this, w - 36, 17, st, { size: 12, bold: true, color: siege ? CSS.dangerText : CSS.accent, origin: [1, 0.5] }), Math.max(60, w * 0.5)));
            const mag = this.add.graphics({ x: w - 18, y: 17 }); mag.lineStyle(2, 0xe8e2cf, 1).strokeCircle(-2, -2, 6).lineBetween(2, 2, 7, 7); row.add(mag);
            const hit = this.add.rectangle(0, 0, w, 34, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', (p) => { if (p.getDistance?.() > 12 || this.modalCount > 0) return; this.selectTerr(t); }); row.add(hit);
            y += 38;
        });
        return y + 6;
    }

    // 주요 거점 현황(현황 탭 상단): kind capital 거점만 '주요 거점'으로(수도·승리 조건 표기 없음). 행 = 이름 · 소유국 칩(공성 중이면 '교전 중') · 돋보기(지도 선택). 반환 = 다음 y
    buildMajorList(c0, w, y) {
        const ts = (this.mp?.territories ?? []).filter((x) => x.kind === 'capital');
        if (!ts.length) return y;
        c0.add(makeText(this, 2, y, `주요 거점 현황 (${ts.length}개)`, { size: 15, bold: true, color: '#f0d58c' })); y += 24;
        ts.forEach((t) => {
            const row = this.add.container(0, y); c0.add(row);
            row.add(this.add.rectangle(0, 0, w, 34, COLOR.navyDeep, 0.8).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.35));
            row.add(fitText(makeText(this, 10, 17, t.name, { size: 14, bold: true, origin: [0, 0.5] }), w - 190));
            const siege = t.state === 'siege' && t.siege_country;
            const chipT = siege ? `교전 중 · ${this.cname(t.siege_country)}` : t.owner?.name ? `${t.owner.name} 점령` : '중립';
            const col = siege ? 0x6a5a7a : hexNum(t.owner?.color, 0x4a4a5a);
            const ct = makeText(this, 0, 0, chipT, { size: 12, bold: true, color: '#ffffff', origin: [0.5, 0.5] }); const cw = Math.min(140, ct.width + 18);
            const pillR = this.add.rectangle(w - 44 - cw, 5, cw, 24, col, 0.95).setOrigin(0).setStrokeStyle(1, 0xffffff, 0.35); row.add(pillR); row.add(ct.setPosition(w - 44 - cw / 2, 17)); fitText(ct, cw - 8);
            { const me = this.st?.me?.country ?? this.st?.countries?.[0]?.code; const sd = siege ? 'neutral' : !t.owner?.code ? 'neutral' : t.owner.code === me ? 'ally' : 'enemy'; // 시즌 진영 알약(ui.season.pill.*)
              withUiImage(this, `ui.season.pill.${sd}`, (k) => { if (!row.scene) return; pillR.setVisible(false); row.addAt(this.add.image(w - 44 - cw / 2, 17, k).setDisplaySize(cw, 26), row.getIndex(ct)); }); }
            const mag = this.add.graphics({ x: w - 20, y: 17 }); mag.lineStyle(2, 0xe8e2cf, 1).strokeCircle(-2, -2, 6).lineBetween(2, 2, 7, 7); row.add(mag);
            const hit = this.add.rectangle(0, 0, w, 34, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', (p) => { if (p.getDistance?.() > 12 || this.modalCount > 0) return; this.selectTerr(t); }); row.add(hit);
            y += 38;
        });
        return y + 6;
    }

    // '전쟁 출정'(우측 패널 하단 큰 버튼): 할 일 목록의 첫 공격 가능 거점(우리 공성 중 > 공격 가능 인접)으로 출정 확인. 없으면 사유 안내
    marchTarget() {
        const items = this.todoItems().filter((it) => it.kind !== 'threat');
        const pick = items.find((it) => this.attackGate(it.t).can) ?? null;
        return pick?.t ?? null;
    }

    // 시즌 규칙(서버 rules: occupation_gain · occupation_required · cooldown_minutes · 공격 횟수). 수도·승리 표현 없음
    openRules() {
        const r = this.st?.rules ?? {}; const at = this.st?.attacks ?? {};
        const lines = [
            r.occupation_gain ? `공격에 성공하면 그 거점의 점령도가 ${r.occupation_gain} 오릅니다.` : '',
            r.occupation_required ? `점령도가 ${r.occupation_required}에 이르면 거점을 점령합니다.` : '',
            r.cooldown_minutes ? `같은 거점은 공격 후 ${r.cooldown_minutes}분 동안 다시 공격할 수 없습니다.` : '',
            at.limit ? `하루에 ${at.limit}번 공격할 수 있습니다.` : '',
            '인접한 거점만 공격할 수 있습니다. 지도에서 거점을 누르면 상세와 공격 버튼이 나옵니다.',
        ].filter(Boolean);
        new Modal(this, { title: '시즌 규칙', body: lines.join('\n'), w: 560, h: 150 + lines.length * 34, buttons: [{ label: '닫기' }] });
    }

    buildList(r) {
        const st = this.st;
        const box = this.add.container(r.x, r.y);
        this.content.add(box);
        box.add(this.add.rectangle(-6, -6, r.w + 12, r.h + 12, 0x0b1328, 0.78).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.55));
        let y = 0;
        const short = r.h < 420; // 낮은 화면: 머리 1줄
        const seasonT = fitText(makeText(this, 0, y, st.season?.name ?? '시즌 정보 없음', { size: short ? 16 : 20, heading: true, color: '#f0d58c' }), short ? r.w * 0.5 : r.w - 118); box.add(seasonT);
        box.add(new Button(this, { x: r.w - (short ? 92 : 110), y: short ? -6 : -4, w: short ? 92 : 110, h: short ? 30 : 36, label: '시즌 규칙', size: short ? 12 : 13, onClick: () => this.openRules() })); // 시안: 우측 패널 우상단(667·390 도 항상, gacha112)
        const endAt = parseUtc(st.season?.end_at);
        const per = makeText(this, short ? r.w - 100 : 0, short ? y + 2 : y + 28, '', /* 좁은 화면: 오른쪽 '시즌 규칙' 버튼(92) 앞까지 */ { size: 13, bold: true, color: CSS.accent, origin: short ? [1, 0] : [0, 0] });
        const updP = () => {
            if (!per.scene) return;
            const left = Number.isFinite(endAt) ? (endAt > Date.now() ? `종료까지 ${fmtLeft(endAt - Date.now())}` : '시즌 종료') : '종료 시각 없음';
            per.setText(short ? left : `${fmtDate(st.season?.start_at)} ~ ${fmtDate(st.season?.end_at)} · ${left}`);
            fitText(per, short ? Math.max(60, r.w * 0.48 - 100) : r.w);
            if (short && seasonT.scene) fitText(seasonT, Math.max(60, r.w - 100 - per.width - 14)); // 좁은 화면: 시즌명이 오른쪽 기간 글자와 겹치지 않게(gacha113 667 4px 겹침)
        };
        updP(); this.ticks.push(updP);
        box.add(per);
        y += short ? 26 : 50;
        // 내 소속·기여·순위(state.me.rank) + 남은 공격. 미가입이면 참가 안내
        const meC = st.me?.joined ? this.countryOf(st.me.country) : null;
        const at = st.attacks ?? {};
        const myStr = meC
            ? `${meC.name} 소속 · 기여도 ${st.me.contribution ?? 0}${st.me.rank ? ` · 개인 ${st.me.rank}위` : ''} · 남은 공격 ${at.left ?? 0}/${at.limit ?? 0}`
            : '아직 소속 국가가 없습니다 · 현황 탭에서 참가';
        box.add(fitText(makeText(this, 0, y, myStr, { size: 14, bold: true, color: meC ? textCol(meC.color) : CSS.dangerText }), r.w));
        y += 26;
        this.tabsUI = new Tabs(this, { x: 0, y, w: r.w, h: 44, items: TABS, active: this.tab, size: 15, onChange: (k) => { this.tab = k; this.renderTab(k); } });
        box.add(this.tabsUI);
        y += 50;
        this.tabBox = this.add.container(0, y);
        box.add(this.tabBox);
        // 시안 '전쟁 출정'(패널 하단 큰 버튼): 가입자만. 할 일의 첫 공격 가능 거점으로 출정 확인(없으면 비활성 + 사유)
        const marchH = st.me?.joined && r.h >= 360 ? 60 : 0;
        if (marchH) {
            const tgt = this.marchTarget();
            box.add(new Button(this, { x: 0, y: r.h - marchH + 4, w: r.w, h: marchH - 8, label: '전쟁 출정', size: 22, variant: 'danger', disabled: !tgt, reason: tgt ? '' : '지금 공격할 수 있는 거점이 없습니다(공격 횟수·쿨다운·인접 여부 확인)', onClick: () => { const t = this.marchTarget(); if (t) { this.selectTerr(t); this.confirmAttack(t); } } }));
        }
        this.tabR = { w: r.w, h: Math.max(60, r.h - y - marchH) };
        this.renderTab(this.tab);
        this.updateBadges();
    }

    // AC7 '할 일' 항목(내 국가 기준, map 응답만으로 계산): ① 우리가 공성 중인 거점 ② 적이 공성 중인 우리 거점 ③ 공격 가능한 인접 거점(상위 3~5개)
    //  ③ 정렬 = 점령도 진행 많은 순 > 수도 > 방어 단계 낮은 순. ③ 개수 = max(3, 5 - (①+②))
    todoItems() {
        const my = this.st?.me?.country; const ts = this.mp?.territories ?? [];
        if (!my) return [];
        const req = (x) => Math.max(1, x.occupation_required || 100);
        const ours = ts.filter((x) => x.state === 'siege' && x.siege_country === my);
        const threat = ts.filter((x) => x.owner?.code === my && x.state === 'siege' && x.siege_country && x.siege_country !== my);
        const used = new Set([...ours, ...threat].map((x) => x.code));
        const lv = (x) => Number(x.defense?.level ?? x.defense_level ?? 0);
        const atk = ts.filter((x) => x.attackable && !used.has(x.code))
            .sort((a, b) => (b.occupation / req(b)) - (a.occupation / req(a)) || lv(a) - lv(b))
            .slice(0, Math.max(3, 5 - ours.length - threat.length));
        return [
            ...ours.map((t) => ({ t, kind: 'ours', tag: '공성 중', color: COLOR.accentLight, text: `${t.name} · 점령도 ${t.occupation}/${req(t)}${t.attackable ? ' · 계속 공격 가능' : ` · ${this.blockText(t)}`}` })),
            ...threat.map((t) => ({ t, kind: 'threat', tag: '방어 필요', color: COLOR.danger, text: `${t.name} · ${this.cname(t.siege_country)} 공성 중 · 점령도 ${t.occupation}/${req(t)}` })),
            ...atk.map((t) => ({ t, kind: 'atk', tag: '공격 가능', color: COLOR.accent, text: `${t.name} · ${t.owner?.name ?? '-'} · 방어 ${lv(t)}단계${t.occupation > 0 ? ` · 점령도 ${t.occupation}/${req(t)}` : ''}` })),
        ];
    }

    // '할 일' 패널(현황 탭 상단). 가입자만(미가입·게스트는 표시 안 함). 항목 탭 = 지도에서 선택 + 상세 패널. 반환 = 다음 y
    buildTodo(c0, w) {
        if (!this.st?.me?.joined || session.kind === 'guest') return 0;
        let y = 0;
        const at = this.st?.attacks ?? {}; const noLeft = (at.left ?? 0) <= 0;
        c0.add(makeText(this, 2, y, `할 일 · 남은 공격 ${at.left ?? 0}/${at.limit ?? 0}`, { size: 15, bold: true, color: '#f0d58c' }));
        y += 24;
        if (noLeft) {
            const nt = noteText(this, 2, y, `오늘 공격 횟수를 모두 사용했습니다 · 초기화까지 ${fmtLeft(msToReset())}`, { kind: 'muted', size: 12, wrap: w - 8 });
            c0.add(nt); y += nt.height + 6;
        }
        const items = this.todoItems();
        if (!items.length) {
            const nt = noteText(this, 2, y, '지금 공성 중이거나 공격 가능한 인접 거점이 없습니다.', { kind: 'muted', size: 13, wrap: w - 8 });
            c0.add(nt); return y + nt.height + 12;
        }
        const rh = 40; const tagW = 74;
        items.forEach((it) => {
            const row = listRow(this, { x: 0, y, w, h: rh, selected: this.selCode === it.t.code, onClick: () => this.selectTerr(it.t) });
            row.add(this.add.rectangle(0, 0, 6, rh, it.color, 1).setOrigin(0));
            row.add(this.add.rectangle(12, 9, tagW, 22, it.color, 0.9).setOrigin(0));
            row.add(makeText(this, 12 + tagW / 2, 20, it.tag, { size: 12, bold: true, color: '#1A1406', origin: [0.5, 0.5] }));
            row.add(fitText(makeText(this, 12 + tagW + 8, 20, it.text, { size: 13, bold: it.kind !== 'atk', color: it.kind === 'threat' ? CSS.dangerText : CSS.text, origin: [0, 0.5] }), Math.max(40, w - tagW - 30)));
            c0.add(row); y += rh + 6;
        });
        return y + 8;
    }

    // 세력 현황판(현황 탭): 국가별 순위·성/거점 점령 수·점수·점유 막대·동맹, 미가입이면 국가 참가 버튼. 데이터 = state.countries + map.territories
    buildBoardTab(box, w, h) {
        const st = this.st; const ts = this.mp?.territories ?? [];
        const list = new ScrollList(this, { x: 0, y: 0, w, h, clip: true, bar: true });
        this.tabList = list;
        box.add(list);
        const c0 = list.content;
        let y = this.buildTodo(c0, w);
        y = this.buildFactionBlock(c0, w, y); // 진영 비율 바 + 두 진영 국호·문장·참가 인원(지도 위에서 이동)
        y = this.buildContestList(c0, w, y); // '교전 지역'(사용자 2026-11-04: 주요 거점 현황 대체, buildMajorList 함수는 보존)
        const guest = session.kind === 'guest'; // 아래 참가 안내용(제거한 세력 표 블록에 있던 선언)
        // '세력 현황'(국가 순위 표)·전황 한 줄 제거(사용자 2026-11-04: 진영 현황·교전 지역과 중복). 개인 기여 순위는 순위 탭
        y += 4;
        if (!st.me?.joined) {
            // 미가입: 지도·현황을 보면서 국가 참가(시즌 중 1회)
            c0.add(makeText(this, 2, y, '참가할 국가 선택', { size: 15, bold: true, color: '#f0d58c' })); y += 24;
            const nt = noteText(this, 2, y, guest ? '게스트 계정은 참가할 수 없습니다. 회원 가입 후 참가해 주세요.' : '국가는 시즌 중 한 번만 선택할 수 있습니다.', { kind: guest ? 'error' : 'info', size: 13, wrap: w - 4 });
            c0.add(nt); y += nt.height + 8;
            const cs = st.countries ?? [];
            const gap = 8; const n = Math.max(1, cs.length); const bw = Math.floor((w - gap * (n - 1)) / n);
            cs.forEach((c, i) => c0.add(new Button(this, { x: i * (bw + gap), y, w: bw, h: 44, label: `${c.name}${c.recommended ? '(추천)' : ''}`, variant: c.recommended ? 'primary' : 'default', size: 14, disabled: guest, reason: '게스트 계정은 참가할 수 없습니다. 회원 가입 후 참가해 주세요.', onClick: () => this.confirmJoin(c) })));
            y += 52;
            if (guest) { c0.add(new Button(this, { x: 0, y, w: 150, h: 44, label: '회원 가입', variant: 'primary', size: 14, onClick: () => this.go('Auth', { mode: 'register' }) })); y += 52; }
        } else {
            const nt = noteText(this, 2, y, '지도에서 성·거점을 누르면 소유국·방어·점령도와 공격 버튼이 나옵니다.', { kind: 'muted', size: 13, wrap: w - 4 });
            c0.add(nt); y += nt.height + 8;
        }
        list.setContentHeight(y);
        list.refreshMask?.();
    }

    // 세력 영토 색칠(fe46 5차 보완): 폴리곤 데이터 없음 -> 성·거점 화면 좌표의 최근접 영역(보로노이, 4px 격자)을 소유국 색으로 칠한 오프스크린 캔버스를
    //  부드럽게 확대(bilinear)하고, 세력이 다른 칸 사이에 양쪽 세력의 진한 색 경계선(각 약 2px)을 그린 뒤, 지도 에셋 landmask(PNG 알파=육지)로 바다를 잘라 한 장 텍스처로 올린다.
    //  landmask 로드 전에는 그리지 않고(바다 번짐 깜빡임 방지) 로드 후 다시 그림. landmask 가 없거나 실패하면 마스크 없이(반경 제한). 지도 밖으로 끌어온 거점(off)은 색칠 제외
    drawRealm(pos, R) {
        const layer = this.realmLayer;
        if (!layer?.scene) return;
        const path = this.vb ? landMaskPath(this.mapKey ?? MAP_KEY) : null;
        if (path && LM.path === path && LM.img === undefined) { LM.cbs.push(() => this.drawRealm(pos, R)); return; }
        if (path && LM.path !== path) { loadLandMask(path, () => this.drawRealm(pos, R)); return; }
        const mask = path && LM.path === path ? LM.img : null;
        const ts = (this.mp?.territories ?? []).filter((t) => pos.get(t.code) && !pos.get(t.code).off);
        if (!ts.length) return;
        try {
            const { w: VW, h: VH } = this.vp;
            const cs = Math.max(1, Math.min(2, Math.round((L.u || 1) * 2) / 2));
            const W = Math.round(VW * cs); const H = Math.round(VH * cs);
            const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
            const g = cv.getContext('2d');
            const step = 4; const cols = Math.ceil(VW / step); const rows = Math.ceil(VH / step);
            const maxD = R * (mask ? 4 : 2.4); const fade = R * 0.8;
            const pts = ts.map((t) => { const n = hexNum(t.owner?.color); const rgb = [(n >> 16) & 255, (n >> 8) & 255, n & 255]; const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255; return { p: pos.get(t.code), rgb, own: t.owner?.code ?? '', alpha: Math.max(0.32, Math.min(0.52, 0.34 + (0.62 - lum) * 0.8)) }; }); // 어두운 색(조선 청색 등)은 지도 위에서 묻히므로 진하게
            const grid = new Int16Array(cols * rows).fill(-1);
            const sm = document.createElement('canvas'); sm.width = cols; sm.height = rows;
            const sg = sm.getContext('2d'); const id = sg.createImageData(cols, rows); const d = id.data;
            for (let j = 0; j < rows; j += 1) {
                for (let i = 0; i < cols; i += 1) {
                    const x = i * step + step / 2; const y = j * step + step / 2;
                    let best = -1; let bd = maxD * maxD;
                    for (let k = 0; k < pts.length; k += 1) { const dx = pts[k].p.x - x; const dy = pts[k].p.y - y; const dd = dx * dx + dy * dy; if (dd < bd) { bd = dd; best = k; } }
                    if (best < 0) continue;
                    const c = j * cols + i; grid[c] = best;
                    const a = pts[best].alpha * Math.min(1, (maxD - Math.sqrt(bd)) / fade); // 반경 끝은 서서히 투명
                    d[c * 4] = pts[best].rgb[0]; d[c * 4 + 1] = pts[best].rgb[1]; d[c * 4 + 2] = pts[best].rgb[2]; d[c * 4 + 3] = Math.round(a * 255);
                }
            }
            sg.putImageData(id, 0, 0);
            g.imageSmoothingEnabled = true;
            g.drawImage(sm, 0, 0, cols * step * cs, rows * step * cs);
            // 경계선: 다른 세력 칸 사이 중점마다 양쪽 세력의 진한 색 점(4px 간격 -> 이어진 선). 색별 Path2D 로 모아 한 번에 칠함
            const dark = (rgb) => `rgb(${Math.round(rgb[0] * 0.55)},${Math.round(rgb[1] * 0.55)},${Math.round(rgb[2] * 0.55)})`;
            const paths = new Map();
            const dot = (k, x, y) => { const key = dark(pts[k].rgb); let p2 = paths.get(key); if (!p2) { p2 = new Path2D(); paths.set(key, p2); } p2.moveTo((x + 1.3) * cs, y * cs); p2.arc(x * cs, y * cs, 1.3 * cs, 0, Math.PI * 2); };
            for (let j = 0; j < rows; j += 1) {
                for (let i = 0; i < cols; i += 1) {
                    const a = grid[j * cols + i]; if (a < 0) continue;
                    const r1 = i + 1 < cols ? grid[j * cols + i + 1] : -1; const d1 = j + 1 < rows ? grid[(j + 1) * cols + i] : -1;
                    if (r1 >= 0 && pts[r1].own !== pts[a].own) { const x = (i + 1) * step; const y = j * step + step / 2; dot(a, x - 1.2, y); dot(r1, x + 1.2, y); }
                    if (d1 >= 0 && pts[d1].own !== pts[a].own) { const x = i * step + step / 2; const y = (j + 1) * step; dot(a, x, y - 1.2); dot(d1, x, y + 1.2); }
                }
            }
            g.globalAlpha = 0.9;
            paths.forEach((p2, col) => { g.fillStyle = col; g.fill(p2); });
            g.globalAlpha = 1;
            // 육지만 남김: landmask 를 지도 이미지와 같은 자리·크기로(loadMapImage 와 같은 투영)
            if (mask) {
                const { vb, cam, vp } = this;
                const k = vp.w * cam.z; const tl = project(cam, vp, vb.x0, vb.y0);
                g.globalCompositeOperation = 'destination-in';
                g.drawImage(mask, tl.sx * cs, tl.sy * cs, (vb.x1 - vb.x0) * k * cs, ((vb.y1 - vb.y0) * k / 2) * cs);
                g.globalCompositeOperation = 'source-over';
            }
            const tk = `war_realm_${(WarScene.realmN = (WarScene.realmN ?? 0) + 1)}`;
            this.textures.addCanvas(tk, cv).setFilter(Phaser.Textures.FilterMode.LINEAR);
            layer.removeAll(true);
            if (this.realmTex && this.realmTex !== tk && this.textures.exists(this.realmTex)) this.textures.remove(this.realmTex);
            this.realmTex = tk;
            layer.add(this.add.image(0, 0, tk).setOrigin(0).setDisplaySize(VW, VH));
        } catch (e) { console.warn('[War] 영토 색칠 실패(생략)', e); }
    }

    // ---------- 서브 탭(순위/전황/기록은 열 때 1회 조회, 새로고침 버튼으로 재조회) ----------
    async renderTab(key) {
        const box = this.tabBox; const { w, h } = this.tabR;
        if (!box?.scene) return;
        box.removeAll(true);
        if (key === 'terr') { this.buildTerritoryList(box, w, h); return; }
        if (key === 'board') { this.buildBoardTab(box, w, h); return; }
        const fetchers = { rank: () => gameApi.war.ranking(), feed: () => gameApi.war.events({ limit: 30 }), hist: () => gameApi.war.history(), mine: () => gameApi.war.myBattles({ limit: 20 }) };
        this.cache = this.cache ?? {};
        // AC8: 전황 탭 = [전체 | 내 활동]. 내 활동 = GET /api/war/my-battles(캐시 키 'mine')
        const mine = key === 'feed' && this.feedMode === 'mine' && !!this.st?.me?.joined;
        const ck = mine ? 'mine' : key;
        const stale = () => !this.sys.isActive() || !box.scene || this.tabBox !== box || (this.tab !== key && this.st?.me?.joined) || (key === 'feed' && (this.feedMode === 'mine') !== mine);
        const filterBar = () => {
            if (key !== 'feed' || !this.st?.me?.joined) return false;
            const fw = Math.min(110, Math.floor((w - 118 - 8) / 2));
            [['all', '전체'], ['mine', '내 활동']].forEach(([k, lb], i) => box.add(new Button(this, { x: i * (fw + 6), y: 0, w: fw, h: 44, label: lb, size: 14, variant: this.feedMode === k ? 'primary' : 'default', onClick: () => { if (this.feedMode === k) return; this.feedMode = k; this.renderTab('feed'); } })));
            return true;
        };
        if (key === 'feed') this.markFeedRead(this.cache.feed); // AC1: 전황 탭을 열면 읽음
        if (!this.cache[ck]) {
            const fy = filterBar() ? 52 : 0;
            box.add(makeText(this, w / 2, fy + 40, '불러오는 중...', { size: 16, color: CSS.muted, origin: [0.5, 0.5] }));
            try {
                const d = await fetchers[ck]();
                if (!this.sys.isActive()) return;
                this.cache[ck] = d;
            } catch (e) {
                if (stale()) return;
                box.removeAll(true);
                const ey = filterBar() ? 52 : 0;
                box.add(noteText(this, 0, ey + 6, messageOf(e), { kind: 'error', size: 14, wrap: w }));
                box.add(new Button(this, { x: 0, y: ey + 40, w: 140, h: 44, label: '다시 시도', size: 15, onClick: () => this.renderTab(key) }));
                return;
            }
            if (stale()) return; // 기다리는 사이 다른 탭/화면으로 바뀜
        }
        box.removeAll(true);
        const d = this.cache[ck];
        if (key === 'feed' && !mine) this.markFeedRead(d);
        const items = key === 'rank' ? this.rankItems(d) : mine ? this.mineItems(d) : key === 'feed' ? this.feedItems(d) : this.histItems(d);
        if (!filterBar()) box.add(makeText(this, 0, 22, { rank: '현재 시즌 순위', feed: '최근 전황(최신순)', hist: '지난 시즌 기록' }[key], { size: 15, bold: true, color: '#f0d58c', origin: [0, 0.5] }));
        box.add(new Button(this, { x: w - 110, y: 0, w: 110, h: 44, label: '새로고침', size: 14, onClick: () => { delete this.cache[ck]; this.renderTab(key); } }));
        const list = new ScrollList(this, { x: 0, y: 52, w, h: h - 52, clip: true, bar: true });
        this.tabList = list;
        box.add(list);
        if (!items.length) {
            list.content.add(noteText(this, 0, 8, mine ? '이번 시즌 공격 기록이 없습니다.' : { rank: '순위 정보가 없습니다.', feed: '아직 전황 소식이 없습니다.', hist: '종료된 시즌 기록이 없습니다.' }[key], { kind: 'muted', size: 14, wrap: w }));
            list.setContentHeight(40);
        } else list.setContentHeight(this.cardRows(list.content, w, items));
        list.refreshMask?.();
    }

    // 카드 행(기존 listRow 배경): items[{section} | {lines:[{t,size,color,bold}], color, me}] -> 전체 높이
    cardRows(parent, w, items) {
        let y = 0; const gap = 6;
        items.forEach((it) => {
            if (it.section) {
                const t = makeText(this, 2, y + 4, it.section, { size: 14, bold: true, color: '#f0d58c' });
                parent.add(t); y += t.height + 10;
                return;
            }
            const texts = []; let ty = 8;
            it.lines.forEach((ln) => {
                const t = makeText(this, 16, ty, ln.t, { size: ln.size ?? 13, bold: !!ln.bold, color: ln.color ?? CSS.text, wrap: w - 28 });
                texts.push(t); ty += t.height + 3;
            });
            const rh = Math.max(40, ty + 5);
            const row = listRow(this, { x: 0, y, w, h: rh, selected: !!it.me });
            if (it.color != null) row.add(this.add.rectangle(0, 0, 6, rh, hexNum(it.color), 1).setOrigin(0));
            row.add(texts);
            parent.add(row);
            y += rh + gap;
        });
        return y;
    }

    cname(code) { return this.countryOf(code)?.name ?? COUNTRY_KO[code] ?? (code ? '다른 세력' : '-'); } // 내부 코드('japan' 등)를 화면에 쓰지 않는다(강화면 gacha46 Low)
    ccolor(code) { return this.countryOf(code)?.color ?? null; }

    rankItems(d) {
        const out = [];
        const me = d?.me;
        if (me) out.push({ me: true, lines: [{ t: `내 순위 ${me.rank}위 · 기여도 ${me.contribution}`, size: 15, bold: true, color: CSS.accent }] });
        out.push({ section: '국가 순위' });
        (d?.countries ?? []).forEach((c) => out.push({ color: c.color, me: c.code === this.st?.me?.country, lines: [
            { t: `${c.rank}위  ${c.name}${c.ai_only ? ' (AI 전용)' : ''}`, size: 15, bold: true, color: textCol(c.color) },
            { t: `점수 ${c.score} · 영토 ${c.territories} · 인원 ${c.member_count}명`, size: 12, color: CSS.muted },
        ] }));
        out.push({ section: '개인 기여도 순위' });
        (d?.players ?? []).forEach((p) => out.push({ color: this.ccolor(p.country), me: p.me, lines: [
            { t: `${p.rank}위  ${p.name}${p.me ? ' (나)' : ''}`, size: 14, bold: true },
            { t: `${this.cname(p.country)} · 기여도 ${p.contribution}`, size: 12, color: CSS.muted },
        ] }));
        if ((d?.my_country_members ?? []).length) {
            out.push({ section: '우리 국가 구성원' });
            d.my_country_members.forEach((m) => out.push({ me: m.me, lines: [
                { t: `${m.name}${m.me ? ' (나)' : ''}`, size: 14, bold: true },
                { t: `기여도 ${m.contribution} · 공격 승리 ${m.attack_wins} · 점령 ${m.captures}`, size: 12, color: CSS.muted },
            ] }));
        }
        return out;
    }

    // 이벤트 문구: 공성(공격)·점령·방어(공성 해제/AI 공격 격퇴)·AI 행동·시즌 종료. 결과 값은 WarService(att_win = 공격 승리)
    eventText(e) {
        const c = e.country_name ?? this.cname(e.country); const t = e.territory_name ?? ((this.mp?.territories ?? []).find((x) => x.code === e.territory)?.name) ?? (e.territory ? '거점' : ''); // 영토 코드 노출 금지(새 시나리오 legnica 등)
        const p = e.payload ?? {}; const by = e.user ? ` (${e.user})` : '';
        switch (e.type) {
            case 'siege_start': return `[공성] ${c}, ${t} 공성 시작${p.defender ? ` · 방어 ${this.cname(p.defender)}` : ''}${by}`;
            case 'capital_siege': return `[공성] ${c}, ${t} 포위`;
            case 'capture': return `[점령] ${c}, ${t} 점령${p.from ? ` (${this.cname(p.from)}에게서)` : ''}${p.ai ? ' · AI' : by}`;
            case 'capital_fall': return `[함락] ${t} 함락 · ${c}${p.from ? ` <- ${this.cname(p.from)}` : ''}`;
            case 'siege_end': return `[방어] ${t} 공성 해제${p.reason === 'stagnation' ? '(장기 정체)' : ''} · ${c}`;
            case 'ai_attack': return `[AI] ${c}, ${t} 공격 · ${p.result === 'att_win' ? '공격 승리' : '방어 성공'}${p.captured ? ' · 점령' : ''}`;
            case 'season_end': return `[시즌 종료] 우승 ${p.winner ? this.cname(p.winner) : '없음'}`;
            default: return `[${({ admin_adjust: '운영 조정', siege_end: '방어' })[e.type] ?? '소식'}] ${c} ${t}`; // 내부 이벤트 코드 노출 금지
        }
    }

    feedItems(d) {
        return (d?.events ?? []).map((e) => ({ color: this.ccolor(e.country), lines: [
            { t: this.eventText(e), size: 13, bold: true },
            { t: fmtAgo(e.created_at), size: 11, color: CSS.muted },
        ] }));
    }

    // AC8 내 활동(my-battles): 거점명·승패·점령도 변화·시각. 진행 중(result null & in_progress)은 강조 + 이어하기 안내
    mineItems(d) {
        return (d?.battles ?? []).map((b) => {
            const live = b.result == null && b.status === 'in_progress';
            const res = live ? '진행 중' : RESULT_TEXT[b.result] ?? (b.status === 'abandoned' ? '포기' : '종료');
            const col = live ? CSS.accent : b.result === 'att_win' ? '#9fe0a0' : b.result === 'def_win' || b.status === 'abandoned' ? CSS.dangerText : CSS.muted;
            const occ = b.occ_before != null && b.occ_after != null
                ? `점령도 ${b.occ_before} -> ${b.occ_after}${b.occ_delta != null ? ` (${b.occ_delta >= 0 ? '+' : ''}${b.occ_delta})` : ''}`
                : live ? '상단 버튼으로 이어하기' : '점령도 변화 없음';
            return { me: live, color: this.ccolor(this.st?.me?.country), lines: [
                { t: `${b.territory_name ?? b.territory ?? '-'} · ${res}${b.captured ? ' · 점령' : ''}`, size: 14, bold: true, color: col },
                { t: `${occ} · ${fmtAgo(b.settled_at ?? b.created_at)}`, size: 12, color: CSS.muted },
            ] };
        });
    }

    histItems(d) {
        return (d?.seasons ?? []).map((s) => {
            const w = s.winner; const mvp = s.mvp;
            const lines = [
                { t: s.name ?? `시즌 ${s.season_id}`, size: 15, bold: true, color: '#f0d58c' },
                { t: `${fmtDate(s.start_at)} ~ ${fmtDate(s.ended_at)} · 전투 ${s.battles ?? 0}회`, size: 12, color: CSS.muted },
                { t: w ? `우승 ${w.name} · ${w.score}점 · 영토 ${w.territories}` : '우승 국가 없음', size: 13, bold: true },
            ];
            if (mvp) lines.push({ t: `MVP ${mvp.name}${mvp.me ? ' (나)' : ''} · ${this.cname(mvp.country)} · 기여도 ${mvp.contribution}`, size: 13 });
            if ((s.ranking ?? []).length) lines.push({ t: s.ranking.map((x) => `${x.rank}. ${x.name} ${x.score}점`).join('  '), size: 12, color: CSS.muted });
            return { lines, me: !!mvp?.me || (s.top_contributors ?? []).some((m) => m?.me) };
        });
    }

    buildTerritoryList(box, w, h) {
        const at = this.st?.attacks ?? {};
        const r = { w };
        const list = new ScrollList(this, { x: 0, y: 0, w, h, clip: true, bar: true });
        this.tabList = list;
        box.add(list);
        const rowH = 76; const gap = 8;
        const noLeft = (at.left ?? 0) <= 0;
        (this.mp?.territories ?? []).forEach((t, i) => {
            const row = listRow(this, { x: 0, y: i * (rowH + gap), w: r.w, h: rowH, selected: this.selCode === t.code, onClick: () => this.selectTerr(t) }); // 행 탭 = 지도 선택 + 상세 패널
            const col = hexNum(t.owner?.color);
            row.add(this.add.rectangle(0, 0, 6, rowH, col, 1).setOrigin(0));
            const btnW = 96;
            const textW = r.w - btnW - 34;
            const head = makeText(this, 16, 10, `${t.name}`, { size: 16, bold: true });
            row.add(fitText(head, textW * 0.55));
            row.add(fitText(makeText(this, 16 + head.width + 10, 12, `${t.owner?.name ?? '-'} · 방어 ${t.defense?.level ?? t.defense_level}`, { size: 13, color: textCol(t.owner?.color) }), Math.max(40, textW - head.width - 10)));
            const req = Math.max(1, t.occupation_required || 100);
            const gw = Math.max(60, Math.min(160, textW - 110));
            row.add(this.add.rectangle(16, 42, gw, 10, COLOR.ink, 0.9).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.8));
            if (t.occupation > 0) row.add(this.add.rectangle(17, 43, Math.max(2, (gw - 2) * Math.min(1, t.occupation / req)), 8, COLOR.accentLight, 1).setOrigin(0));
            const siege = t.state === 'siege' && t.siege_country ? ` · ${this.countryOf(t.siege_country)?.name ?? t.siege_country} 공성 중` : '';
            row.add(fitText(makeText(this, 16 + gw + 8, 40, `점령도 ${t.occupation}/${req}${siege}`, { size: 12, color: CSS.muted }), Math.max(40, textW - gw - 8)));
            if (t.attackable) {
                const ob = !!this.st?.open_battle?.battle_id; // 진행 중 시즌 전투가 있으면 새 공격 불가
                row.add(makeText(this, r.w - 12, rowH / 2, ob ? '전투 진행 중' : noLeft ? '횟수 소진' : '공격 가능', { size: 13, bold: true, color: ob || noLeft ? CSS.muted : CSS.accent, origin: [1, 0.5] }));
            } else {
                const cd = t.attack_blocked_reason === 'cooldown';
                const bt = makeText(this, r.w - 12, rowH / 2, this.blockText(t), { size: 13, color: cd ? CSS.accent : CSS.muted, origin: [1, 0.5] });
                row.add(bt);
                if (cd) this.ticks.push(() => { if (bt.scene) bt.setText(this.blockText(t)); });
            }
            list.content.add(row);
        });
        list.setContentHeight((this.mp?.territories ?? []).length * (rowH + gap));
        list.refreshMask?.();
    }

    // '편성하기': 독립 편성 화면이 없어(로비 편성 탭 제거) 스테이지 탭으로 보내고 출격 화면에서 편성하도록 안내
    goParty() { this.go('Lobby', { tab: 'stage', notice: PARTY_NOTICE }); }

    // AC4: 공격 확인 전 저장된 편성(GET /api/party, 읽기 전용)으로 빈 편성·코스트 초과 가능성을 미리 안내. 조회 실패면 기존 확인창으로 진행
    //  서버는 캠페인 전용 영웅 제외·슬롯 상한으로 다시 잘라 판정하므로 FE 판단은 '가능성' 안내(빈 편성만 차단, 코스트는 '그래도 공격' 허용)
    async confirmAttack(t) {
        const at = this.st?.attacks ?? {};
        if (this.st?.open_battle?.battle_id) { alertModal(this, '공격 불가', `${OPEN_BATTLE_TEXT}.
화면 위 '진행 중인 전투 이어하기'에서 계속할 수 있습니다.`); return; }
        if ((at.left ?? 0) <= 0) { alertModal(this, '공격 불가', messageOf({ code: 'daily_limit' })); return; }
        if (this.busy || this.checkingParty) return;
        // 2차: 서버 사전검사(state/map.party_check, createBattle 과 같은 규칙) 우선. code 있으면 편성 안내(서버도 같은 이유로 거부하므로 '그래도 공격' 없음), null 이면 통과
        const pc = this.mp?.party_check ?? this.st?.party_check;
        if (pc && typeof pc === 'object' && 'code' in pc) {
            if (pc.code) {
                const cnt = Number.isFinite(Number(pc.used)) && Number.isFinite(Number(pc.max)) ? `
(출전 영웅 ${pc.used}/${pc.max})` : '';
                new Modal(this, { title: pc.code === 'party_empty' || pc.code === 'no_party' ? '편성이 비어 있습니다' : '편성을 확인해 주세요', body: `${messageOf({ code: pc.code })}${cnt}
${PARTY_NOTICE}`, w: 480, h: 300, buttons: [{ label: '취소' }, { label: '편성하기', variant: 'primary', onClick: () => this.goParty() }] });
                return;
            }
            confirmModal(this, `${t.name} 공격`, `현재 편성(자동 배치)으로 ${t.name}의 방어 부대와 전투를 시작합니다.
남은 공격 ${at.left}/${at.limit}회 중 1회를 사용합니다.`, () => this.attack(t), { okLabel: '공격 시작' });
            return;
        }
        // 폴백(구 서버: party_check 없음): 저장된 편성으로 근사 판정
        this.checkingParty = true;
        let issue = null;
        try {
            const { party, cost } = await gameApi.party(true);
            if (!(party ?? []).length) issue = 'party_empty';
            else if (cost && Number.isFinite(Number(cost.total)) && Number.isFinite(Number(cost.max)) && Number(cost.max) > 0 && Number(cost.total) > Number(cost.max)) issue = { code: 'cost_exceeded', used: Number(cost.total), max: Number(cost.max) };
        } catch (e) {
            console.warn(`[War] 편성 사전 확인 실패(무시) code=${e?.code ?? 'unknown'}`);
        } finally { this.checkingParty = false; }
        if (!this.sys.isActive() || this.modalCount > 0) return;
        const body = `현재 편성(자동 배치)으로 ${t.name}의 방어 부대와 전투를 시작합니다.\n남은 공격 ${at.left}/${at.limit}회 중 1회를 사용합니다.`;
        if (issue === 'party_empty') {
            new Modal(this, { title: '편성이 비어 있습니다', body: `출전할 영웅이 없어 공격할 수 없습니다.\n${PARTY_NOTICE}`, w: 480, h: 300, buttons: [{ label: '취소' }, { label: '편성하기', variant: 'primary', onClick: () => this.goParty() }] });
            return;
        }
        if (issue?.code === 'cost_exceeded') {
            new Modal(this, { title: `${t.name} 공격`, body: `편성 코스트가 상한을 넘을 수 있습니다(${issue.used}/${issue.max}).\n이대로면 공격이 거부될 수 있으니 편성을 먼저 확인해 주세요.`, w: 520, h: 300, buttons: [{ label: '취소' }, { label: '편성하기', variant: 'primary', onClick: () => this.goParty() }, { label: '그래도 공격', onClick: () => this.attack(t) }] });
            return;
        }
        confirmModal(this, `${t.name} 공격`, body, () => this.attack(t), { okLabel: '공격 시작' });
    }

    async attack(t) {
        if (this.busy) return;
        this.busy = true;
        try {
            const r = await gameApi.war.attack(t.code);
            cdSave(this.st?.season?.id, t.code); // 쿨다운 잔여 추정용(서버가 만료 시각 미제공)
            if (!this.sys.isActive()) return;
            this.go('Battle', { mode: 'war', battleId: r.battle_id ?? r.battle?.battle_id, fresh: true, territory: t.code });
        } catch (e) {
            if (!this.sys.isActive()) return;
            console.warn(`[War] 공격 실패 code=${e?.code ?? 'unknown'} status=${e?.status ?? 0}`);
            if (PARTY_CODES.includes(e?.code)) { // 서버가 편성 문제로 거부: 편성하기 이동 제공
                new Modal(this, { title: '공격할 수 없습니다', body: `${messageOf(e)}\n${PARTY_NOTICE}`, w: 480, h: 300, buttons: [{ label: '닫기' }, { label: '편성하기', variant: 'primary', onClick: () => this.goParty() }] });
                return;
            }
            alertModal(this, '공격할 수 없습니다', messageOf(e), () => { if (this.sys.isActive()) this.load_(); });
        } finally { this.busy = false; }
    }
}
