import Phaser from 'phaser';
import { Tabs, fitLabel } from '../ui/Tabs.js';
import { portraitBox, sCard, heroSprite, ensureHeroSprite, troopBadges, heroPortraitLogical, troopSprite, ensureTroopSprite, troopTypeOf } from '../ui/HeroVisual.js';
import { ensureHeroMenuCards, heroMenuCard, HERO_CARD_RATIO } from '../ui/HeroMenuCard.js';
import { Button } from '../ui/Button.js';
import { StatBar } from '../ui/StatBar.js';
import { Modal } from '../ui/Modal.js';
import { openSettings } from '../ui/SettingsModal.js';
import { openInstallGuide, installButtonLabel } from '../ui/InstallModal.js';
import { showToast } from '../ui/Toast.js';
import { makeText, addBackdrop, fitText, shrinkToFit, scrollDragged } from '../ui/common.js';
import { slice, icon, skinOn, setSliceSize, skinImage, skinIcon, skinHas } from '../ui/skin.js';
import { DomInput, bindInputsToModal } from '../ui/DomInput.js';
import { raritySlotKey, rarityBadge, rarityCss, rarityLabel, compareRarity, rarityColor, RARITY_STARS, normRarity } from '../rarity.js';
import { ScrollList, listRow, noteText, alertModal, confirmModal, emptyState, Checkbox } from '../ui/widgets.js';
import { Chips } from '../ui/Chips.js';
import { MapPicker, sizePartyText } from '../ui/MapPicker.js';
import { tabQuest, tabRanking, tabShop, tabExchange, tabInventory, openEquipment, refreshQuestBadge, SLOT_KO } from './lobbyExtra.js';
import { TableView, kvTable } from '../ui/TableView.js';
import { statGauges } from '../ui/StatGauges.js';
import { troopIcon } from '../ui/GameIcons.js';
import { ensureSkillIcons, skillIconFrame, skillIconImage, skillIconsListed, skillIconsReady } from '../ui/SkillIcon.js';
import { COLOR, CSS, GRADE, syncView, MIN_TOUCH, view } from '../theme.js';
import { L, setupCamera, relayoutOnChange } from '../layout.js';
import { auth, session, sessionCache } from '../api/client.js';
import { gameApi, publicRules, newGachaRequestId } from '../api/gameApi.js';
import { ensureScope, warmScope, prefetchPortraits, ensurePortraitTex, unitPortraitLogical, loaded, texKey } from '../assets.js';
import { protagonistInfo } from '../dialogue/dialogueData.js';
import { messageOf, errorTag } from '../api/errors.js';
import { auraDesc } from '../systems/glossary.js';
import { heroLabel, heroPlainName, heroShortName, gachaLabel } from '../systems/names.js';
import { skillDisplayName } from '../systems/skills.js';
import { withJosa } from '../systems/josa.js';
import { createTabSkeleton, createTabLoadingBadge } from '../ui/TabLoading.js';
import { createLoadingView } from '../ui/LoadingView.js';
import { ensurePortrait } from '../ui/PortraitCard.js';
import { rarityMark, pixelLabel, pixelImage } from '../ui/PixelBadge.js';
import { isInstant } from '../ui/motion.js';
import { audio } from '../audio.js';
import { addBrandLogo, brandSmall, brandHeader, brandEmblem, BRAND_TITLE } from '../brand.js';
import { withUiImage } from '../ui/uiImage.js';
import { rememberStages, objectiveShort, goalLines, normRules, starCondsOf, starCondText, heroNameOf, playBeforeStage } from '../campaign/campaignFlow.js';
import { maybeCharacterCreate, openCharacterCreate, characterCheckPending } from '../campaign/characterCreate.js';
import { guideEnabled, markNewFlow, guideDone, conceptPopup } from '../tutorial/guideFlow.js';
import { openBriefReplay } from '../tutorial/briefReplay.js';
import { loadCampaignMapMeta, buildCampaignMap, stagePlayable, stageLockText, missingHeroesOf, missingHeroText, gachaHintOf } from '../campaign/campaignMapData.js';
import { StageMapView } from '../ui/StageMapView.js';
import { LibraryMapView, libraryMeta } from '../ui/LibraryMapView.js'; // 메인 스토리 '잊힌 서고' 도서관 지도(MVP 2026-11-14)
import { tabDex } from './lobbyDex.js';
import { tabRank } from './lobbyRank.js';
import { warSeasonActive, warUnreadCount } from './warEntry.js';
import { FEATURES, comingSoonOf } from '../features.js'; // 시즌 전쟁·랭크전 잠금 플래그(2026-11-14). 잠금 = 오픈 예정 티저(lobbyComingSoon.js)
import { tabComingSoon, markSoonTabs } from './lobbyComingSoon.js';
import { openRecord } from '../ui/RecordPanel.js';
import { openHeroDetail, heroStatusBody, heroHistorySection, heroRarityTag, heroSectionBg } from '../ui/HeroDetailView.js';
import { heroLevelText } from '../ui/heroLevel.js';
import { heroStatsNow, heroStatLine } from '../ui/heroStats.js';

// icon: 아틀라스 ico.<name>(안아트 생성 예정 ico.tab_*). 없으면 글자만(Tabs 폴백)
const TABS = [
    { key: 'stage', label: '역사 시나리오', icon: 'tab_stage' }, // 2026-11-14 사용자 지시: 표시 라벨만 '역사 시나리오'(key·딥링크·lastSub 불변)
    { key: 'hero', label: '영웅', icon: 'tab_hero' },
    { key: 'room', label: '방 대전', icon: 'tab_room' },
    // (편성 탭 제거 2026-11-01: 캠페인 출전 영웅은 출격(배치) 화면에서 고르고, 마지막 출격 구성은 서버가 자동 저장해 다음 배치 기본값으로 쓴다)
    // 퀘스트: 상단바 버튼에서 하단 탭으로 이동(빨간 점 = 탭 아이콘 우상단). 전용 ico.tab_quest(미제작)가 없으면 ico.quest
    { key: 'quest', label: '퀘스트', icon: 'tab_quest', iconFallback: 'quest' },
    // 랭킹: 전용 아이콘 ico.tab_rank(트로피/왕관, 미제작)이 있으면 사용, 없으면 가장 가까운 ico.log(목록) 폴백(buildTabs)
    { key: 'ranking', label: '랭킹', icon: 'tab_rank', iconFallback: 'log' },
    { key: 'more', label: '설정', icon: 'tab_more' }, // 2026-11-14: 더보기 -> 설정(사용자 지시 메뉴명)
];
// 뽑기 탭: 서버 rules.gacha 가 true 일 때만 '방 대전' 다음(퀘스트 앞)에 추가
const GACHA_TAB = { key: 'gacha', label: '뽑기', icon: 'tab_gacha' };
// 하단 탭 바에 없는 화면(더보기·상단 버튼에서 진입)
// protagonist = 영웅 그룹 서브 탭(주인공 스테이터스, fe-proto 2026-11-03: 영웅 카드 목록에서는 주인공 제외)
const EXTRA_TABS = [{ key: 'protagonist', label: '주인공' }, { key: 'dex', label: '도감' }, { key: 'rank', label: '랭크전' }, { key: 'shop', label: '상점' }, { key: 'exchange', label: '교환소' }, { key: 'inventory', label: '인벤토리' }, { key: 'main', label: '메인 스토리' }, { key: 'lineup', label: '편성' }]; // main = 캠페인 그룹 서브 탭(오리지널 메인 스토리, chapter 101+) // 랭킹은 하단 탭으로 이동
const gachaOn = () => !!publicRules()?.gacha;
const gachaSceneOn = () => { try { return localStorage.getItem('srpg.gachaScene') !== '0'; } catch { return true; } }; // 뽑기 탭 -> Gacha 씬(0 = 기존 탭)
const tabItems = () => { if (!gachaOn()) return TABS; const i = TABS.findIndex((t) => t.key === 'quest'); return [...TABS.slice(0, i), GACHA_TAB, ...TABS.slice(i)]; };
// 하단 탭 그룹(fe26 A안 -> fe45 -> 2026-11-14): 캠페인(스테이지·메인 스토리) / 멀티(방 대전·시즌 전쟁·랭크전·랭킹) / 영웅(영웅·주인공·도감·인벤토리) / 뽑기 / 보상(퀘스트·교환소) / 상점 / 설정.
// 그룹 안 서브 탭은 본문 상단 Tabs. 내부 tab 키(stage·hero·…)는 그대로. 'war' 서브 탭 = War 씬 직접 진입.
// 롤백(기존 7칸): TAB_GROUPS.enabled = false 또는 localStorage srpg.tabGroups=0
export const TAB_GROUPS = { enabled: true };
const groupsOn = () => { try { if (localStorage.getItem('srpg.tabGroups') === '0') return false; } catch { /* 무시 */ } return TAB_GROUPS.enabled; };
// fe45(2026-11-03, 사용자 지시 "영웅·뽑기는 싱글 전용이 아니다"): 영웅·뽑기를 싱글 그룹에서 빼 하단 독립 칸으로(모드 무관 접근).
//  싱글 = 스테이지·메인 스토리만. 뽑기 칸은 rules.gacha 가 true 일 때만(visibleGroups). 롤백 = .bak-fe45-20261103
// 2026-11-14 메뉴 재구성(사용자 지시): 캠페인 / 멀티 / 영웅 / 뽑기 / 보상 / 상점 / 설정 (뽑기는 rules.gacha 일 때만).
//  그룹 key 는 기존 값 유지(g_growth = 보상, g_more = 설정 — 퀘스트 배지·lastSub·딥링크 호환). 인벤토리 = 영웅 서브 탭, 랭킹 = 멀티 서브 탭, 상점 = 독립 칸
const GROUPS = [
    { key: 'g_single', label: '캠페인', icon: 'tab_stage', sub: ['main', 'stage'] }, // main = 메인 스토리(fe38). 2026-11-14 사용자 지시: 메인 스토리를 첫 서브 탭(그룹 첫 진입 기본) -> 역사 시나리오
    { key: 'g_multi', label: '멀티', icon: 'tab_room', sub: ['room', 'war', 'rank', 'ranking'] }, // rank = 랭크 대전(scenes/lobbyRank.js), ranking = 랭킹(레벨·주간 PvP)
    { key: 'g_hero', label: '영웅', icon: 'tab_hero', sub: ['hero', 'lineup', 'protagonist', 'dex', 'inventory'] }, // lineup = 편성(캠페인 출정 풀, 2026-11-14) // protagonist = 주인공 스테이터스(fe-proto), dex = 영웅 도감(scenes/lobbyDex.js), inventory = 보유 장비(2026-11-14 영웅 안으로)
    { key: 'g_gacha', label: '뽑기', icon: 'tab_gacha', sub: ['gacha'] },
    { key: 'g_growth', label: '보상', icon: 'tab_quest', iconFallback: 'quest', sub: ['quest', 'exchange'] }, // 퀘스트(일일·주간·월간·메인) + 일일 교환소(골드·펜 상품)
    { key: 'g_shop', label: '상점', icon: 'shop', sub: ['shop'] }, // 골드 상점(장비·소모품 전환)
    { key: 'g_more', label: '설정', icon: 'tab_more', sub: ['more'] }, // 게임 설정·공지·튜토리얼·계정·로그아웃
];
// 세로 내비 아이콘(안아트 ui.nav.<이름>, 2026-11-04): 그룹/탭 키 -> 이름. record(기록)는 비그룹 랭킹 탭용
const NAV_ICON = { g_single: 'single', g_hero: 'hero', g_gacha: 'gacha', g_multi: 'multi', g_growth: 'reward', g_more: 'more', stage: 'single', hero: 'hero', gacha: 'gacha', room: 'multi', quest: 'reward', ranking: 'record', more: 'more' };
// 서브 탭 아이콘(안아트 퀘스트 스펙 top_tab: atlas.uiskin ico.quest / ico.shop / ico.ticket). 아틀라스에 없으면 글자만(Tabs.skinIcon)
const CARD_LOADING_TABS = new Set(['hero', 'dex', 'inventory']); // 로딩 스켈레톤을 카드 격자로 그리는 탭(나머지 = 목록 행)
const SUB_ICON = { quest: 'quest', ranking: 'crown', shop: 'shop', exchange: 'ticket' }; // ranking = atlas.uiskin ico.crown(2026-11-04 아틀라스 확장)
const visibleGroups = () => GROUPS.filter((g) => g.key !== 'g_gacha' || gachaOn());
const subTabsOf = (g) => g.sub.filter((k) => k !== 'gacha' || gachaOn());
const groupOf = (key) => GROUPS.find((g) => g.sub.includes(key) || g.extra?.includes(key)) ?? GROUPS[0];
const tabLabel = (key) => (key === 'war' ? '시즌 전쟁' : [...TABS, GACHA_TAB, ...EXTRA_TABS].find((t) => t.key === key)?.label ?? '');
const fmtNum = (n) => Number(n ?? 0).toLocaleString('ko-KR');
const fmtPct = (n) => Number(n ?? 0).toLocaleString('ko-KR', { maximumFractionDigits: 4 }); // 서버 값 그대로(표시 자릿수만 제한)
// 천장 규칙 문구: 서버 pity 값으로 구성(하드코딩 금지)
const pityRuleText = (pity) => (pity?.applies_to_count && pity?.min_rarity
    ? `${pity.applies_to_count}연 뽑기 중 ${pity.min_rarity} 이상이 없으면 마지막 1회는 ${pity.min_rarity} 이상 (${pity.applies_to_count}연 뽑기에만 적용)`
    : '');
const stars = (n, max = 3) => { const k = Math.max(0, Math.min(max, Number(n) || 0)); return '★'.repeat(k) + '☆'.repeat(max - k); }; // 상한 클램프(fe43: 메인 스토리 difficulty 7~9 가 6칸 규격을 넘던 문제)
// 개발용 메뉴(전투 프로토타입·UI 스킨 데모) 노출: Vite 개발 서버 또는 ?debug=1 / localStorage srpg.debug=1
// 개발 서버(import.meta.env.DEV)에서도 플레이테스트 화면에는 숨김: ?debug=1 또는 localStorage srpg.debug=1 일 때만
const devMode = () => { try { return new URLSearchParams(location.search).get('debug') === '1' || localStorage.getItem('srpg.debug') === '1'; } catch { return false; } };
// 스테이지 챕터: 서버 chapter(0 = 튜토리얼·오리지널) > stage code 'ch<N>_' 접두. 헤더 문구
const stageChapter = (s) => (Number.isFinite(Number(s.chapter)) && s.chapter != null ? Number(s.chapter) : Number(/^ch(\d+)_/.exec(s.code ?? '')?.[1] ?? 0));
// 화면 제목에는 '○장' 번호 접두를 붙이지 않는다(내부 id ch1/ch18 은 유지)
const CHAPTER_TITLE = { 0: '튜토리얼 · 오리지널 스테이지', 1: '임진왜란', /* 2026-11-14 사용자 지시: '임진왜란 편' -> '임진왜란'(표시명 원천 = 이 표, 서버·메타 아님) */ 18: '칭기즈 칸과 몽골 제국', 21: '레그니차의 연기', 22: '파니파트의 수레벽', 23: '헤이스팅스의 방패벽', 24: '투르와 푸아티에', 999: '숨은 종장', 101: '메인 스토리 1막', 102: '메인 스토리 2막', 103: '메인 스토리 3막', 104: '메인 스토리 4막' };
// 오리지널 메인 스토리 = chapter 101 이상(1막 101 ~ 4막 104). 서가 지도·스테이지 탭에서는 빼고 '메인 스토리' 탭에만 표시
export const MAIN_STORY_CHAPTER = 101;
export const HIDDEN_CHAPTER = 999; // 숨은 종장(서가 지도에 표시, 메인 스토리 탭 아님)
const isMainStory = (s) => stageChapter(s) >= MAIN_STORY_CHAPTER && stageChapter(s) !== HIDDEN_CHAPTER;
// 튜토리얼·오리지널 스테이지(chapter 0, stage_01~06): 2026-11-14 사용자 지시로 '메인 스토리' 탭 맨 앞으로 이동(역사 시나리오 지도에서 제외). 집계·해금 로직은 그대로
export const TUTORIAL_CHAPTER = 0;
const isTutorial = (s) => stageChapter(s) === TUTORIAL_CHAPTER;
const inMainTab = (s) => isMainStory(s) || isTutorial(s);
// 표에 없는 장은 서가 지도 메타(shelf_map_meta.shelves[].name_ko) 이름(지도 메타를 받은 뒤 채움, 강화면 26회차: 서가 11~20 이 '시나리오'로 보임)
const SHELF_TITLE = {};
const chapterTitle = (n) => CHAPTER_TITLE[n] ?? SHELF_TITLE[n] ?? '시나리오';
// 캠페인 지도 화면 플래그(기본 켬). 즉시 복귀: ?stagemap=0 또는 localStorage srpg.stageMap=0
const STAGE_MAP_DEFAULT = true;
const stageMapOn = () => { try { const q = new URLSearchParams(location.search).get('stagemap'); if (q != null) return q !== '0'; const v = localStorage.getItem('srpg.stageMap'); if (v != null) return v !== '0'; } catch { /* 무시 */ } return STAGE_MAP_DEFAULT; };

// 로비: 상단 프로필 바(이름·레벨·EXP·골드·설정·로그아웃) + 하단 탭(스테이지/영웅/방 대전/퀘스트/랭킹/더보기).
// 모든 데이터는 API(gameApi) + session 캐시. 비로그인(401)이면 client 가 'unauthenticated' 를 내고 index.js 가 Title 로 보낸다.
export class LobbyScene extends Phaser.Scene {
    static scopeLoading = new Set(); // ensureTabAssets 진행 중 scope(씬 재시작 사이에도 중복 요청 방지)

    constructor() { super('Lobby'); }

    init(data) { this.tab = data?.tab ?? this.tab ?? 'main'; /* 기본 = 캠페인 첫 서브 탭 메인 스토리(2026-11-14) */ this.notice = data?.notice ?? ''; this.noticeMs = data?.noticeMs; this.autoSortie = !!data?.autoSortie; this.sortieStageId = data?.sortieStageId ?? null; this.directSortie = this.autoSortie || this.sortieStageId != null; } // sortieStageId: 결과 화면 '다음 스테이지' -> 해당 스테이지로 바로 출정

    create() {
        this.modalCount = 0;
        this.warUnread = 0; // 씬 인스턴스 재사용: 이전 진입의 읽지 않음 수를 새 탭 바에 잠깐 그리지 않게
        this.inputs = [];
        this.sortieBusy = false; // 출정 대기(pickStage go) 잠금: 씬 재사용 시 초기화
        this.resumeBusy = false; // 이어하기 연속 클릭 잠금: 씬 재사용 시 이전 진입의 잠금(전환으로 해제 타이머가 안 돈 값) 초기화(War.js 와 같은 방식)
        this.goldCap = null; this.brandLogo = null; this.softTimer = null; this.skel = []; // 씬 재생성 시 이전 인스턴스의 파괴된 UI 참조 제거(재진입 정지 방지)
        syncView();
        setupCamera(this, CSS.bg);
        // 화면 재구성(회전·창 크기·성능 가드 품질 변경)으로 씬이 재시작돼도 아직 실행 전인 자동 출정(결과 '다음 스테이지' sortieStageId·autoSortie)을 잃지 않게 함께 넘긴다
        //  (2026-11-15 '다음 스테이지 누르면 멈춤': 로비 진입 직후 품질 하향 -> {tab} 만으로 재시작 -> 출정 없이 로비에 머묾)
        relayoutOnChange(this, () => ({ tab: this.tab, ...(this.sortieStageId != null ? { sortieStageId: this.sortieStageId } : {}), ...(this.autoSortie ? { autoSortie: true } : {}) }));
        addBackdrop(this, L.lw, L.lh);
        // 이미지 스킨 배경(bgscreen_lobby, 글자 없음): 화면을 덮도록 cover 배치 + 남색 반투명 덮개(가독성)
        if (this.textures.exists('bgscreen_lobby')) {
            const bg = this.add.image(L.lw / 2, L.lh / 2, 'bgscreen_lobby');
            bg.setScale(Math.max(L.lw / bg.width, L.lh / bg.height));
            this.bgImg = bg;
            // 가독성: 와이드 레이아웃은 큰 창 없이 카드·글자가 배경 위에 바로 놓이므로 덮개를 진하게(0.35 -> 0.6, 실화면 확인 후 0.55~0.65 조정)
            this.add.rectangle(0, 0, L.lw, L.lh, COLOR.ink, 0.6).setOrigin(0);
        }
        if (!session.authed) { this.scene.start('Title', { notice: '로그인 또는 게스트 시작이 필요합니다.' }); return; }
        this.barH = 56 + L.safe.t;
        this.content = this.add.container(0, 0);
        const tabH = (L.portrait ? 60 : L.short ? Math.max(44, Math.ceil(MIN_TOUCH / (view.scale || 1))) : 48) + L.safe.b; // 바 얇게(사용자 2026-11-04 '적당히'): 세로 72 -> 60, 데스크톱 56 -> 48, 가로 폰은 터치 최소 유지 // L.short(가로 폰): 실제 화면 44 CSS px 이상(논리 약 49, 강화면 gacha44 Low)
        // 우측 세로 아이콘 내비(사용자 시안 2026-11-04): 가로 화면(데스크톱·가로 폰) = 하단 탭 대신 우측 세로 레일(railW), 세로 폰 = 하단 탭 유지
        this.railW = L.portrait ? 0 : (L.short ? 60 : 76) + L.safe.l; // 왼쪽 세로 레일(사용자 2026-11-04 '오른쪽은 어색 -> 왼쪽'), 왼쪽 안전 여백 포함
        this.tabH = this.railW ? L.safe.b : tabH;
        this.buildBar();
        if ((this.tab === 'gacha' && !gachaOn()) || this.tab === 'party') this.tab = 'stage'; // 'party' = 제거된 편성 탭(구 진입 경로 호환)
        this.buildTabs();
        this.show(this.tab);
        // 프롤로그 직후 자동 출정(autoSortie)일 때는 튜토리얼 완료 보상 토스트를 바로 띄우지 않고(곧바로 전투로 넘어가 어색함, 하플레이 2026-11-04) 다음 로비 진입 때 보여 준다
        if (this.notice && this.autoSortie) { try { sessionStorage.setItem('srpg.pendingNotice', this.notice); } catch { /* 저장 불가면 생략 */ } this.notice = ''; this.noticeMs = 0; }
        else if (!this.notice) { try { const pn = sessionStorage.getItem('srpg.pendingNotice'); if (pn) { sessionStorage.removeItem('srpg.pendingNotice'); this.notice = pn; } } catch { /* 무시 */ } }
        if (this.notice) showToast(this, this.notice, this.noticeMs ? { ms: this.noticeMs } : undefined);
        this.time.delayedCall(900, () => { if (this.sys.isActive()) this.checkNotices(); }); // 공지·점검 안내(세션당 1회, 실패 무시)
        this.offSession = session.on('change', () => this.refreshBar());
        this.events.once('shutdown', () => { this.offSession?.(); this.stopGachaOverlay(); this.stopWarOverlay(); }); // 로비를 떠나면 뽑기 오버레이도 종료
        // 첫 진입(가입 직후 등): 캐릭터 생성 필요 여부 확인 전에는 로비를 비추지 않는다(생성 화면으로 넘어가기 전 깜빡임 방지). 최대 5초 뒤엔 그대로 표시
        const hold = characterCheckPending();
        const reveal = () => { if (this.sys?.isActive() && this.cameras.main.alpha < 1) this.tweens.add({ targets: this.cameras.main, alpha: 1, duration: 160 }); };
        if (hold) { this.cameras.main.setAlpha(0); this.time.delayedCall(5000, reveal); }
        gameApi.profile(true).then((prof) => { this.refreshBar(); this.syncGachaTab(); maybeCharacterCreate(this, prof).then((went) => { if (!went) { reveal(); this.drawBadge(); } if (!went && this.sys.isActive()) this.maybeAutoTutorial(prof); if (!went && this.sys.isActive()) this.maybeGachaConcept(prof); }).catch(() => { reveal(); this.maybeAutoTutorial(prof); }); }).catch(() => reveal()); // 캐릭터 생성(protagonist_needed) 우선, 아니면 튜토리얼 자동 시작
        refreshQuestBadge(this); // 퀘스트 빨간 점(로비 진입마다)
        this.startWarUnread(); // 시즌 전쟁 전황 읽지 않음 뱃지(로비 진입마다 + 60초, 탭 비활성 시 건너뜀)
        this.time.delayedCall(2500, () => this.idlePrefetch()); // 로비 대기 중 저우선 예열(첫 화면 요청과 경쟁하지 않게 지연)
        this.time.delayedCall(600, () => this.preloadHeroThumbs()); // 영웅 탭 카드 썸네일 선로딩(보유 영웅, 텍스처까지) — 첫 진입 시 글자 자리표시 -> 교체 점프 방지
    }

    // 탭이 쓰는 scope 만 받는다(로비 첫 화면=스테이지 탭은 boot 에셋만). gacha: 등급 프레임·카드 뒷면·뽑기 배경 / battle(아군 unit.*): 영웅 카드·상세의 유닛 스프라이트 폴백
    // 같은 scope 중복 요청은 정적 Set 으로 막고, 씬 종료로 끊기면 콜백(ok=false)에서 풀려 다음 진입 때 다시 받는다
    ensureTabAssets(key) {
        const need = [];
        if (['hero', 'gacha'].includes(key)) need.push(['gacha', null, ['hero', 'gacha']]);
        // 2026-11-03 성능: 영웅 탭·도감은 초상(썸네일)만 쓴다. 아군 unit.* 시트(수백 장) 일괄 선로드를 없애고, 영웅 상세·장비 창이 열릴 때 그 영웅 시트 1장만 받는다(HeroVisual.ensureHeroSprite)
        need.forEach(([scope, filter, tabs]) => {
            const id = scope + (filter ? ':ally' : '');
            if (LobbyScene.scopeLoading.has(id)) return;
            LobbyScene.scopeLoading.add(id);
            ensureScope(this, scope, (ok, n) => {
                LobbyScene.scopeLoading.delete(id);
                if (ok && n && this.sys.isActive() && tabs.includes(this.tab)) this.softRefresh(tabs);
            }, { filter });
        });
        if (key === 'hero' && !LobbyScene.scopeLoading.has('cards')) {
            LobbyScene.scopeLoading.add('cards');
            ensureHeroMenuCards(this).then(({ ok, changed }) => {
                LobbyScene.scopeLoading.delete('cards');
                if (ok && changed && this.sys.isActive() && this.tab === 'hero' && !this.cardsReady) {
                    this.cardsReady = true;
                    this.softRefresh(['hero']);
                }
            });
        }
    }

    // U02: 탭 에셋(scope)이 늦게 도착하면 그 탭을 다시 그린다. 원인(모바일 첫 탭 무반응): 예전에는 scope 2개가 각각 show() 를 불러
    // 네트워크 재조회(heroes(true)) 동안 카드·히트영역이 비어 첫 탭이 허공에 떨어졌다. -> 80ms 묶음 1회 + 캐시 데이터로 즉시 재구성(soft),
    // 손가락이 눌린 중이면 뗀 뒤에 다시 그린다(누르는 도중 히트영역 교체 방지)
    softRefresh(tabs) {
        if (this.softTimer) return;
        this.softTimer = this.time.delayedCall(80, () => {
            this.softTimer = null;
            if (!this.sys.isActive() || !tabs.includes(this.tab)) return;
            if (this.input.manager.pointers.some((pt) => pt.isDown)) { this.input.once('pointerup', () => this.softRefresh(tabs)); return; }
            this.show(this.tab, { soft: true });
        });
    }

    // 보유 영웅 카드 썸네일(256px)을 텍스처까지 미리 만든다(전역 초상 큐: 동시 6, 중복 합치기·LRU). 최대 24장(카드 첫 화면 분량 우선)
    preloadHeroThumbs() {
        if (!this.sys.isActive()) return;
        gameApi.heroes().then((hs) => {
            if (!this.sys.isActive()) return;
            this.protoHero = (hs ?? []).find((h) => h.protagonist) ?? null; this.drawBadge(); // 상단 뱃지 주인공 초상(fe45)
            (hs ?? []).slice(0, 24).map((h) => heroPortraitLogical(h, { thumb: true })).filter(Boolean).forEach((lg) => ensurePortraitTex(this, lg, null));
        }).catch(() => {});
    }

    // 저우선 예열(텍스처·GPU 메모리 없이 HTTP 캐시만): 전투·결과 BGM(오디오 캐시), 전투 scope 파일, 보유 영웅 초상화
    idlePrefetch() {
        if (!this.sys.isActive()) return;
        try {
            audio.prefetchBgm(['bgm_battle'], this); // 결과 화면은 전투 곡 유지(승)·정지(패)라 bgm_result 는 받지 않는다
            warmScope(this, 'battle');
            gameApi.heroes().then((hs) => prefetchPortraits((hs ?? []).map((h) => h.hero))).catch(() => {});
        } catch (e) { console.warn('[lobby] 예열 실패(무시)', e); }
    }

    buildTabs() {
        this.tabsGacha = gachaOn();
        if (this.tabBar?.scene) this.tabBar.destroy(); // 씬 재시작 후 남은 이전 참조(이미 파괴됨)는 건너뜀
        const grouped = groupsOn();
        const items = grouped ? visibleGroups() : tabItems();
        LobbyScene.lastSub = LobbyScene.lastSub ?? {}; // 그룹별 마지막 서브 탭(씬 재시작 사이 유지)
        this.railBg?.destroy(); this.railBg = null; this.railNs?.destroy(); this.railNs = null;
        if (this.railW) { // 레일 바탕: 짙은 반투명 띠 + 왼쪽 금선
            const rx = 0; // 왼쪽 레일: x 0 ~ railW, 금선은 레일 오른쪽 가장자리
            this.railBg = this.add.graphics().fillStyle(COLOR.navyDeep, 0.72).fillRect(rx, this.barH, this.railW, L.lh - this.barH).lineStyle(1, COLOR.accent, 0.55).lineBetween(rx + this.railW, this.barH + 6, rx + this.railW, L.lh - 6);
            // 안아트 레일 띠(ui.nav.rail 96x590, 세로 3-slice t35·b35): 도착하면 코드 띠 대신(폭 = 레일 폭, 위아래 캡은 비율 유지)
            const rbg = this.railBg; const rH = L.lh - this.barH;
            withUiImage(this, 'ui.nav.rail', (k) => {
                if (!rbg.scene || !this.sys.isActive()) return;
                const sc = this.railW / 96;
                try {
                    // NineSlice 는 setFlipX 가 없다(강화면 gacha71 Critical: TypeError 로 레일 탭이 안 그려짐) -> 좌우 반전은 음수 scaleX(오른쪽 끝 기준점)
                    const ns = this.add.nineslice(rx + this.railW, this.barH, k, undefined, 96, rH / sc, 0, 0, 35, 35).setOrigin(0).setScale(-sc, sc);
                    this.children.moveTo(ns, this.children.getIndex(rbg)); this.railNs?.destroy(); this.railNs = ns; // 코드 띠 자리(내비 아래)로
                    rbg.clear().lineStyle(1, COLOR.accent, 0.55).lineBetween(rx + this.railW, this.barH + 6, rx + this.railW, L.lh - 6); // 바탕만 이미지로, 금선은 레일 오른쪽 가장자리에 유지
                } catch (e) { console.warn('[lobby] 레일 띠 이미지 실패(코드 띠 유지)', e); }
            });
        }
        const railTop = this.railTopY = Math.max(this.barH + (L.short ? 4 : 12), this.logoBox && this.logoBox.bottom > this.barH && this.logoBox.x < this.railW ? Math.ceil(this.logoBox.bottom) + 4 : 0); // 로고가 바 밖으로 나올 때만 // 로고가 레일 위로 걸치면 첫 칸을 로고 아래로
        const railBox = this.railW ? { x: L.safe.l, y: railTop, w: this.railW - L.safe.l, h: L.lh - railTop - (L.short ? 4 : 12) - L.safe.b } : null;
        this.tabBar = new Tabs(this, { vertical: !!railBox, x: railBox ? railBox.x : L.safe.l, y: railBox ? railBox.y : L.lh - this.tabH, w: railBox ? railBox.w : L.lw - L.safe.l - L.safe.r, h: railBox ? railBox.h : this.tabH - L.safe.b, items: items.map((it) => (it.iconFallback && !skinHas(this, `ico.${it.icon}`) ? { ...it, icon: it.iconFallback } : it)).map((it) => (railBox && NAV_ICON[it.key] ? { ...it, navIcon: `ui.nav.${NAV_ICON[it.key]}` } : it)), active: grouped ? groupOf(this.tab).key : this.tab, size: L.portrait ? 20 : 18, minSize: 10,
            onChange: (k) => { if (!grouped) { this.show(k); return; } const g = GROUPS.find((x) => x.key === k); const subs = subTabsOf(g); const last = LobbyScene.lastSub[k];
                // fe46: 멀티 = 진행 중 시즌 전쟁이 있으면 시즌 전쟁(War 씬) 먼저, 없으면 기존(마지막 서브 탭 또는 방 대전). 판정 = scenes/warEntry.js
                if (k === 'g_multi' && FEATURES.seasonWar) { warSeasonActive().then((on) => { if (!this.sys.isActive() || this.tabBar?.active !== 'g_multi') return; if (on) this.show('war'); else this.show(subs.includes(last) && last !== 'war' ? last : subs[0]); }); return; }
                this.show(subs.includes(last) && last !== 'war' ? last : subs[0]); } });
        this.applyQuestBadge();
        this.applyWarBadge();
    }

    // 프로필 응답의 rules.gacha 가 바뀌었을 때만 탭 바를 다시 만든다(off→off 는 아무 변화 없음)
    syncGachaTab() {
        if (!this.tabBar?.scene || this.tabsGacha === gachaOn()) return;
        if (this.tab === 'gacha' && !gachaOn()) { this.tab = 'stage'; this.buildTabs(); this.show('stage'); return; }
        this.buildTabs();
        this.refreshSubTabs(); // 그룹 모드: 뽑기는 하단 독립 칸(fe45)이라 서브 탭 영향 없음(호출은 무해, 비그룹 롤백 대비 유지)
    }

    // 현재 그룹 서브 탭 줄만 다시 그림(탭 본문은 유지)
    refreshSubTabs() {
        const p = this.panel;
        if (!groupsOn() || !p?.scene) return;
        const subs = subTabsOf(groupOf(this.tab));
        if (!subs.includes(this.tab) || subs.length < 2) return;
        this.subTabs?.destroy();
        this.subTabs = new Tabs(this, { x: 0, y: -4, w: Math.min(p.w, subs.length * (L.portrait ? 120 : 160)), h: L.short ? 34 : 44, items: subs.map((k) => ({ key: k, label: tabLabel(k), icon: SUB_ICON[k] })), active: this.tab, size: 16, onChange: (k) => this.show(k) });
        p.add(this.subTabs);
        this.applyWarBadge();
    }

    // ---------- 프로필 바 ----------
    // fe45 상단 개편(사용자 지시 2026-11-03): 왼쪽 = 브랜드 로고, 오른쪽 = 프로필 패널 [주인공 원형 뱃지 | 1줄 Lv·닉네임(·코스트/슬롯) / 2줄 EXP 바(현재/다음) | 골드 캡슐].
    //  뱃지 = 스테이지 지도 장수 칩과 같은 방식(StageMapView.drawFramedFace): 프레임 map.world.ui.chip_frame + 지름 74% 원형 초상(Phaser 4 내부 Mask 필터,
    //  같은 마스크 텍스처 stagemap_circle_mask·같은 크롭 프레임 stagemap_face). 프레임이 아직 없으면 금테 원(스테이지 탭이 프레임을 받으면 show() 에서 다시 그림).
    //  모든 항목은 바 '안쪽 띠'(topbar.strip 실측 y 12~144/192)의 중심선 cy 에 맞춘다. 상단 설정 버튼은 더보기 탭으로 이동(fe45). 롤백 = .bak-fe45top-20261103
    // 상단 패널 제거(사용자 2026-11-14): topbar.strip 띠(배경·금테·금선·좌우 덩굴)와 프로필/2단 판을 그리지 않는다. 초상·Lv·닉네임·EXP·재화 캡슐만
    //  투명 배경 위에 두고, 가독성용으로 위에서 아래로 옅어지는 어두운 그림자(패널 모양 아님)만 깐다. 스킨 띠는 세로 중심선(cy) 계산용으로만 읽고 숨긴다.
    //  (이전 hideStripConnector 임시 덮개는 띠 자체를 숨기므로 삭제)
    buildBar() {
        const y = L.safe.t;
        const SH = L.short ? 44 : 60; // 상단 바(사용자 2026-11-04 '적당히 얇게'): 72 -> 60, 가로 폰 52 -> 44
        const strip = skinOn(this) ? slice(this, 'topbar', L.lw, SH, 'panel') : null;
        const skinBar = !!strip?.skinAtlas;
        const BH = skinBar ? SH : (L.short ? 42 : 54); // 스킨 없을 때 64 -> 54, 50 -> 42
        if (skinBar) strip.setVisible(false); else strip?.destroy();
        this.barH = y + BH; // 탭 본문 시작 = 바 아래(show)
        const nb = this.narrowBar = L.lw < 640;
        // 세로 폰 2단 바(2026-11-14 모바일 로비 개선): 한 줄(390 논리 433)에 문장·뱃지·닉네임·EXP·펜·골드를 넣으면 문장이 바 위로 잘리고(높이 56 > 띠 41)
        //  좌우 덩굴 캡 위에 문장·골드 캡슐이 겹쳤다. 1단(스킨 띠) = 문장 + 펜·골드(캡 덩굴 안쪽), 2단(띠 아래 얇은 판) = 주인공 뱃지·Lv·닉네임·EXP
        const two = nb && L.portrait;
        const ROW2 = two ? 38 : 0;
        if (two) this.barH = y + BH + ROW2;
        // 가독성 그림자: 화면 위(안전 영역 포함)에서 바 아래까지 0.45 -> 0 으로 옅어지는 어두운 그라데이션(테두리·모서리 없음)
        this.add.graphics().fillGradientStyle(COLOR.navyDeep, COLOR.navyDeep, COLOR.navyDeep, COLOR.navyDeep, 0.45, 0.45, 0, 0).fillRect(0, 0, L.lw, this.barH + 8);
        const fr = skinBar ? strip.frame : null;
        const k = fr ? BH / fr.height : 0;
        const bandT = y + (fr ? Math.ceil(fr.height * (12 / 192) * k) : 2);
        const bandB = y + (fr ? Math.floor(fr.height * (144 / 192) * k) : BH - 2);
        const cy = Math.round((bandT + bandB) / 2);
        this.barCy = cy;
        // 좌우 캡 장식(frame.customData.slice.l 의 약 80%) 안쪽에서 시작. 좁은 화면은 캡이 폭의 40% 가까이 먹으므로 캡 위로 내용을 올린다(여백 10)
        // 2026-11-14 패널 제거: 좌우 덩굴 캡이 더 이상 그려지지 않으므로 캡 회피 여백 0(양끝 12 여백만)
        const capL = 0;
        // 좁은 화면: 10/18 이면 로고 방패가 왼쪽 마름모·사선 테두리·구름 덩굴(캡 프레임 x<=137, k=0.375 -> 화면 x<=51)에 겹침(390x844) -> 52.
        // 52 = 프레임 x 139: 로고 17 높이 세로 범위(프레임 y 55~101)에 장식 없음. infoW 가 96~132 구간이면 room 이 xL 과 무관(94)이라 로고 높이 유지, 정보 열만 좁아짐
        const xL = L.safe.l + (nb ? 12 : Math.max(12, Math.round(capL * 0.8) + 8));
        // 2단 바: 오른쪽 캡 덩굴(프레임 x 0~160/209 구간 = 캡 폭의 약 77%)과 골드 캡슐이 겹치지 않게 캡 안쪽 80% 에서 끝
        const xR = L.lw - L.safe.r - (two ? Math.max(12, Math.round(capL * 0.8)) : nb ? 10 : Math.max(12, Math.round(capL * 0.8)));
        // 프로필 패널 배치(오른쪽 끝부터): 골드 캡슐 -> 정보 열 -> 원형 뱃지(패널 왼쪽 끝에 걸친 메달)
        const sz = two ? 32 : L.short ? 36 : nb ? 44 : 48; // 뱃지 지름(바 축소에 맞춤: 40/50/56 -> 36/44/48), 2단 바 2단 = 32
        const goldW = nb ? 72 : 128;
        const penW = nb ? (two ? 56 : 46) : L.short ? 80 : goldW; // 데스크톱: 펜·골드 캡슐 같은 폭(시안 2026-11-04 '재화 2개 pill') // 가로 폰 96 -> 80(헤더 로고 자리, 2026-11-04) // 펜 캡슐(골드 왼쪽). 좁은 화면 = 펜촉+숫자만 46(닉네임 열 확보, 강화면 gacha45)
        const goldX1 = xR - 6; const goldX0 = goldX1 - goldW;
        const penX1 = goldX0 - 6; const penX0 = penX1 - penW;
        let infoW; let infoX0; let infoX1; let bcx; let pcy = cy; let expW = 0; let expX0 = 0;
        if (two) {
            // 2단: 띠 아래 얇은 판(좌우 8) 안에 [뱃지][Lv 닉네임 ……][EXP 바]. EXP 바 폭 = 판 폭 40%(120~180)
            const ry = y + BH + 1; const rx0 = L.safe.l + 8; const rx1 = L.lw - L.safe.r - 8;
            pcy = Math.round(ry + ROW2 / 2 - 1);
            bcx = rx0 + 4 + sz / 2;
            expW = Math.round(Math.max(120, Math.min(180, (rx1 - rx0) * 0.4))); expX0 = rx1 - 8 - expW;
            infoX0 = bcx + sz / 2 + 8; infoX1 = expX0 - 10; infoW = infoX1 - infoX0;
        } else {
            infoW = nb ? Math.max(110, Math.min(132, xR - xL - sz - goldW - penW - 136)) : L.short ? 160 : Math.round(Math.min(300, Math.max(210, L.lw * 0.2))); // 가로 폰 210 -> 160(헤더 로고 높이 44 이상 확보, 닉네임은 말줄임)
            infoX1 = penX0 - 10; infoX0 = infoX1 - infoW;
            bcx = infoX0 - 8 - sz / 2;
            // 프로필 패널(금테 둥근 판)은 2026-11-14 패널 제거로 그리지 않음
        }
        this.bar = { cy, pcy, sz, infoX0, infoX1, infoW, goldX0, goldX1, penX0, penX1, nb, two, expW };
        // 원형 뱃지(눌러서 영웅 탭)
        this.badge = this.add.container(bcx - sz / 2, pcy - sz / 2);
        this.badgeFace = this.add.container(0, 0);
        const hs = Math.max(sz, Math.ceil(MIN_TOUCH / (view.scale || 1))); // 터치 영역 = 실제 화면 44px 이상(보이는 뱃지 크기는 그대로, 강화면 gacha65: 667 에서 32px)
        const hit = this.add.rectangle(-(hs - sz) / 2, -(hs - sz) / 2, hs, hs, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => { if (this.modalCount > 0 || this.tab === 'protagonist') return; this.selectTab('protagonist'); }); // 주인공 초상 뱃지 -> 주인공 스테이터스(fe-proto)
        this.badge.add([this.badgeFace, hit]);
        this.badgeSig = '';
        this.protoHero = (session.heroes ?? []).find((h) => h.protagonist) ?? null; // 영웅 목록 캐시가 있으면 즉시(없으면 preloadHeroThumbs 응답에서)
        // 정보 열: 1줄 = Lv 태그 + 닉네임, 2줄 = EXP 바(트랙 안 'EXP 현재/다음'). 와이드 오른쪽 '코스트 N · 슬롯 N'은 2026-11-08 사용자 요청으로 제거(출전 상한은 편성 화면에서 표시)
        // 가로 폰(L.short, 667x390): 패널 높이 34 안에서 닉네임(15px+외곽선)과 EXP 바(12)가 2~3px 겹치던 문제(강화면 a13) -> 닉네임 13px·바 10·줄 간격 16
        // 2단 바: Lv·닉네임·EXP 를 한 줄(pcy)에. 닉네임은 정보 열 끝에서 말줄임(refreshBar fitText)
        const r1 = two ? pcy : cy - (L.short ? 8 : 9); const r2 = two ? pcy : cy + (L.short ? 8 : 9);
        this.lvT = makeText(this, infoX0, r1, '', { size: nb || L.short ? 12 : 13, bold: true, color: CSS.accent, origin: [0, 0.5], stroke: { color: '#0B1020', width: L.short ? 2 : 3 } });
        this.nameT = makeText(this, infoX0, r1, '', { size: nb || L.short ? 13 : 15, bold: true, origin: [0, 0.5], stroke: { color: '#0B1020', width: L.short ? 2 : 3 } });
        this.expBar = new StatBar(this, { x: two ? expX0 : infoX0, y: r2 - 9, w: two ? expW : infoW, h: L.short ? 10 : 14, max: 1, value: 0, skin: 'blue', label: 'EXP' });
        this.expBar.y = Math.round(r2 - this.expBar.barH / 2);
        // 골드 캡슐(이미지 스킨 currency, 없으면 코드 캡슐) + 아이콘 + 숫자(오른쪽 정렬)
        this.goldCap = skinOn(this) ? slice(this, 'currency', goldW, 30, 'panel') : null;
        if (this.goldCap && !this.goldCap.skinAtlas) { this.goldCap.destroy(); this.goldCap = null; }
        if (this.goldCap) this.goldCap.setPosition(goldX0, cy - 15);
        else this.add.graphics().fillStyle(COLOR.ink, 0.85).fillRoundedRect(goldX0, cy - 14, goldW, 28, 14).lineStyle(1, COLOR.accent, 0.6).strokeRoundedRect(goldX0, cy - 14, goldW, 28, 14);
        this.goldIcon = icon(this, 'gold', nb ? 18 : 22).setPosition(goldX0 + (nb ? 14 : 18), cy);
        // 상점 바로가기(BATTLE_ITEMS·상점 확장 2026-11-04): 골드 캡슐 탭 = 상점(성장·보상 > 상점). 넓은 바는 캡슐 오른쪽 끝 '+' 표식, 좁은 바(390)는 탭 영역만
        const plusW = nb ? 0 : 20;
        if (plusW) { const pg = this.add.graphics(); const px = goldX1 - 13; pg.fillStyle(COLOR.accent, 1).fillCircle(px, cy, 8).lineStyle(2.5, COLOR.ink, 1).lineBetween(px - 4, cy, px + 4, cy).lineBetween(px, cy - 4, px, cy + 4); }
        { const gh = Math.max(30, Math.ceil(MIN_TOUCH / (view.scale || 1))); const ghit = this.add.rectangle(goldX0, cy - gh / 2, goldW, gh, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
            ghit.on('pointerup', () => { if (this.modalCount > 0) return; this.selectTab('shop'); }); }
        this.goldT = makeText(this, goldX1 - 10 - plusW, cy, '', { size: nb ? 13 : 16, bold: true, color: CSS.accent, origin: [1, 0.5], stroke: { color: '#0B1020', width: 2 } });
        // 펜 캡슐: 청색 테 + 펜촉 도형(코드) + 숫자. 서고 콘셉트 재화 '펜'(골드와 색·모양 구분). 잔액은 GET /api/pen(로비 진입·교환 후 갱신)
        this.penBox = this.add.container(0, 0);
        { const pg = this.add.graphics(); pg.fillStyle(COLOR.ink, 0.85).fillRoundedRect(penX0, cy - 14, penW, 28, 14).lineStyle(1, 0x8fc7ff, 0.75).strokeRoundedRect(penX0, cy - 14, penW, 28, 14);
            const nx = penX0 + (nb ? 13 : 16); const ny = cy; // 펜촉: 마름모 + 가운데 홈 + 아래 점
            pg.fillStyle(0x8fc7ff, 1).fillPoints([{ x: nx, y: ny - 9 }, { x: nx + 5, y: ny - 1 }, { x: nx, y: ny + 8 }, { x: nx - 5, y: ny - 1 }], true);
            pg.fillStyle(COLOR.ink, 1).fillRect(nx - 0.75, ny - 5, 1.5, 9).fillCircle(nx, ny - 1, 1.6);
            this.penBox.add(pg); }
        this.penT = makeText(this, penX1 - 10, cy, '-', { size: nb ? 12 : 15, bold: true, color: '#9FD8FF', origin: [1, 0.5], stroke: { color: '#0B1020', width: 2 } });
        this.penBox.add(this.penT);
        if (LobbyScene.penUser !== (session.user?.id ?? null)) { LobbyScene.penBalance = null; LobbyScene.penUser = session.user?.id ?? null; } // 다른 계정으로 들어오면 캐시 무효
        this.penBox.setVisible(LobbyScene.penBalance != null);
        if (LobbyScene.penBalance != null) this.penT.setText(Number(LobbyScene.penBalance).toLocaleString('ko-KR'));
        this.refreshPen();
        this.setBtn = null; // fe45: 상단 설정 버튼 제거 -> 더보기 탭 '설정'
        this.outBtn = null; // U05: 로그아웃은 더보기 탭(확인 모달)
        // 로고(왼쪽): 뱃지 왼쪽까지 남는 폭에 맞춘 높이(최대 32, 좁은 화면 26). 14 미만이면 생략. 실패 시 텍스트 폴백(brand.js)
        const room = two ? penX0 - 12 - xL : bcx - sz / 2 - 12 - xL; // 2단 바: 1단에는 문장 오른쪽에 펜 캡슐만
        // 새 헤더 로고(가로 현판, ui.logo.header): 넓은 바(390 제외)에서 남는 폭에 맞춰 키우고 바 높이의 1.35배까지 허용(사용자 '넘치면 UI 를 벗어나도 됨').
        //  바 아래로 걸쳐도 본문은 이 뒤에 그려져 버튼이 로고 위에 오고, 이미지는 입력을 받지 않아 터치를 막지 않는다. 화면 위로는 넘지 않게 중심을 내림
        this.logoBox = null;
        const hv0 = !nb ? brandHeader() : null;
        // 재제작 현판(2026-11-14)은 이미지 높이 = 바 높이 BH 로 그려야 금테가 바 띠에 맞는다 -> 그 폭(BH / ratio)이 안 들어가는 좁은 바는 문장 로고 폴백
        const hv = hv0 && (bcx - sz / 2 - 12 - (L.safe.l + 10)) * hv0.ratio >= BH ? hv0 : null;
        if (hv) {
            // 헤더 로고 x = 화면 왼쪽 가장자리 + 10(사용자 2026-11-04 '타이틀이 좌측으로', 이전 = 상단 바 캡 장식 안쪽 xL ≈ 60). 폭 한도는 같은 규칙(뱃지 왼쪽 -12)
            const xH = L.safe.l + 10; const roomH = bcx - sz / 2 - 12 - xH;
            // 사용자 2026-11-04 '로고 더 크게, 넘치면 UI 벗어나도 됨': 서브 탭·본문 위로 걸쳐 내려와도 된다(본문이 로고보다 나중에 그려져 버튼이 위, 로고는 입력 없음).
            //  높이 = 바 높이 x 1.75(1280 약 105, 667 약 77), 폭은 뱃지 왼쪽까지(펜·골드·뱃지·닉네임·EXP 를 가리지 않음)
            // 사용자 2026-11-04 '로고 때문에 UI 가 내려와 이득 없음 -> 줄여서 바 안으로': 높이 = 바 높이 - 6(위아래 3px), 바 세로 가운데. 바 밖으로 나가지 않으므로 본문·레일·뽑기 밀어내림은 logoBox.bottom 기준으로 자동 0
            const hH = BH; void roomH; // 2026-11-14: 이미지 높이 = 바 높이(위쪽 y 부터, 가운데 기준 y + BH/2). 재제작 현판의 금테가 바 띠와 일치
            const hy = y + BH / 2;
            const hv2 = brandHeader(hH) ?? hv; // 표시 높이 기준 해상도(@2x)
            // 로고는 레일·본문보다 위(depth 5, 모달 1000 아래), 입력 없음. 레일 첫 칸은 로고 아래 끝 밑에서 시작(buildTabs: this.logoBox)
            this.logoBox = { x: xH, bottom: hy + hH / 2, w: hH / hv.ratio };
            addBrandLogo(this, hv2, xH, hy, { maxW: hH / hv.ratio, maxH: hH, origin: [0, 0.5], fallbackSize: 18, onReady: (o) => { this.brandLogo = o; o.setDepth?.(5); } });
            this.refreshBar();
            return;
        }
        // 좁은 바(390): 문장 로고(ui.logo.emblem, 안아트 2026-11-04). 바 높이 안, 뱃지 왼쪽 남는 폭에 맞춤. 없으면 아래 기존 소형 로고
        const em0 = nb || hv0 ? brandEmblem() : null; // 좁은 바(390) 또는 현판 폭이 안 들어가는 바
        if (em0) {
            // 높이 상한 = 바 안쪽 띠(bandT~bandB, 390 약 41). 예전 BH - 4(56)는 띠 중심 cy 기준이라 문장 윗부분이 화면 위로 잘리고 좌측 캡 덩굴을 덮었다(2026-11-14 모바일 로고 깨짐)
            const eH = Math.max(14, Math.min(BH - 4, bandB - bandT, Math.floor(room * em0.ratio)));
            const em = brandEmblem(eH) ?? em0;
            addBrandLogo(this, em, xL, cy, { maxW: eH / em0.ratio, maxH: eH, origin: [0, 0.5], fallbackSize: 14, onReady: (o) => { this.brandLogo = o; } });
            // 2단 바: 문장 오른쪽 남는 폭에 게임 이름(들어갈 때만, 비율 고정 이미지 대신 글자 — 현판 이미지는 폭이 모자라 늘림·잘림 위험)
            if (two) {
                const tx = xL + eH / em0.ratio + 6; const tw = penX0 - 10 - tx;
                const tt = makeText(this, tx, cy, BRAND_TITLE, { size: 16, heading: true, color: '#f0d58c', origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } });
                if (tw < 60) tt.destroy(); else if (tt.width > tw) tt.setScale(tw / tt.width);
            }
            this.refreshBar();
            return;
        }
        const sv0 = brandSmall(nb ? 26 : 32);
        const logoH = Math.min(nb ? 26 : 32, Math.floor(room * sv0.ratio));
        if (logoH >= 14) {
            const sv = brandSmall(logoH);
            addBrandLogo(this, sv, xL, cy, { maxW: Math.min(room, logoH / sv.ratio), maxH: logoH, origin: [0, 0.5], fallbackSize: nb ? 14 : 18, onReady: (o) => { this.brandLogo = o; } });
        }
        this.refreshBar();
    }

    // 펜 잔액 조회(실패·기능 꺼짐 = 캡슐 숨김). 교환소 구매·탭 전환 뒤 호출
    async refreshPen(bal) {
        if (bal != null) LobbyScene.penBalance = Number(bal) || 0;
        else {
            try { const d = await gameApi.pen(); LobbyScene.penBalance = d?.enabled === false ? null : (Number(d?.balance) || 0); } catch { LobbyScene.penBalance = LobbyScene.penBalance ?? null; }
        }
        if (!this.penT?.scene) return;
        this.penBox.setVisible(LobbyScene.penBalance != null);
        if (LobbyScene.penBalance != null) { this.penT.setText(Number(LobbyScene.penBalance).toLocaleString('ko-KR')).setScale(1); fitLabel(this.penT, (this.bar?.penX1 ?? 0) - 10 - ((this.bar?.penX0 ?? 0) + (this.bar?.nb ? 22 : 28)), this.bar?.nb ? 12 : 15, 9); }
    }

    refreshBar() {
        if (!this.nameT?.scene) return;
        const p = session.profile;
        const b = this.bar;
        // U05: 게스트 이름이 이미 '게스트…'면 '(게스트)' 중복 표기 생략
        const nm = session.kind === 'guest' ? (!session.name || /게스트/.test(session.name) ? session.name || '게스트' : `${session.name} (게스트)`) : session.name || '-';
        this.lvT.setText(p ? `Lv.${p.level}` : '');
        this.nameT.setText(p ? nm : `${nm}  불러오는 중...`).setX(b.infoX0 + (this.lvT.text ? this.lvT.width + 6 : 0));
        const nameMax = b.infoX1 - this.nameT.x; // 상단 '코스트·슬롯' 글자 제거(2026-11-08): 이름이 정보 열 오른쪽 끝까지 사용
        fitText(this.nameT, Math.max(30, nameMax), { fallback: nm.replace(/ \(게스트\)$/, '') });
        if (p) { this.expBar.max = Math.max(1, p.exp_to_next || 1); this.expBar.setValue(Math.min(p.exp, this.expBar.max), false); }
        if (p && Number(p.exp_to_next) === 0 && Number(p.level) > 1) { this.expBar.max = 1; this.expBar.setValue(1, false); this.expBar.txt?.setText?.('만렙'); } // 유저 만렙(user_level_costs 마지막 행, 현행 Lv.50): 서버 exp_to_next=0
        this.expBar.txt.setScale(1); fitLabel(this.expBar.txt, (b.expW || b.infoW) - 8, 14, 9); // 좁은 트랙: 'EXP 현재/다음' 글자 축소(넘치면 말줄임)
        this.goldT.setText(p ? p.gold.toLocaleString('ko-KR') : '-').setScale(1);
        fitLabel(this.goldT, b.goldX1 - 10 - (this.goldIcon.x + this.goldIcon.displayWidth / 2 + 6), b.nb ? 13 : 16, 10);
        this.drawBadge();
    }

    // 주인공 초상 논리 키: 영웅 목록의 주인공(protagonist:true, portrait 필드) 우선 -> 캐릭터 생성 상태(face/성별) -> null(이니셜)
    protagonistPortrait() {
        if (this.protoHero) { const lg = heroPortraitLogical(this.protoHero, { thumb: true }); if (lg) return lg; }
        const pi = protagonistInfo();
        if (!pi.face && !pi.gender) return null;
        return unitPortraitLogical({ kind: 'hero', hero: pi.gender ? `protagonist_${pi.gender}` : 'protagonist', portrait: pi.face ? `protagonist_${pi.face}` : undefined, protagonist: true, team: 'ally' }, null, { thumb: true });
    }

    // 원형 뱃지 그리기(같은 입력이면 생략). 초상 텍스처가 늦게 오면 콜백으로 다시 그림
    drawBadge() {
        const face = this.badgeFace;
        if (!face?.scene) return;
        const sz = this.bar.sz; const c0 = sz / 2;
        const lg = this.protagonistPortrait();
        const tk = lg ? ensurePortraitTex(this, lg, () => this.drawBadge()) : null;
        const frameKey = loaded.manifest?.['map.world.ui.chip_frame']?.textureKey ?? texKey('map.world.ui.chip_frame');
        const framed = this.textures.exists(frameKey);
        const sig = `${tk ?? ''}|${framed}|${session.name ?? ''}`;
        if (sig === this.badgeSig) return;
        this.badgeSig = sig;
        face.removeAll(true);
        const d = framed ? Math.round(sz * 0.74) : sz - 6;
        face.add(this.add.circle(c0, c0, (framed ? d : sz) / 2, COLOR.ink, 0.92));
        if (tk && this.textures.exists(tk)) {
            const T = this.textures.get(tk); const src = T.get(); const fw = src.realWidth; const fh = src.realHeight; const cw = Math.min(fw, fh); const cyy = Math.min(fh - cw, fh * 0.04);
            const fn = 'stagemap_face';
            if (!T.has(fn)) T.add(fn, 0, Math.round((fw - cw) / 2), Math.round(cyy), Math.round(cw), Math.round(cw));
            const img = this.add.image(c0, c0, tk, fn).setDisplaySize(d, d);
            if (this.renderer?.gl && typeof img.enableFilters === 'function') {
                const MASK = 'stagemap_circle_mask';
                if (!this.textures.exists(MASK)) { const g = this.make.graphics({ x: 0, y: 0 }, false); g.fillStyle(0xffffff, 1).fillCircle(64, 64, 64); g.generateTexture(MASK, 128, 128); g.destroy(); }
                img.enableFilters(); img.filters.internal.addMask(MASK);
            }
            face.add(img);
        } else {
            // 초상 로딩 전·미생성: 이름 첫 글자 대신 중립 실루엣(머리+어깨)(강화면 v10 Low: 신규 게스트 'q' 표기)
            face.add([this.add.circle(c0, c0 - d * 0.12, d * 0.17, 0x5A6478, 0.9), this.add.ellipse(c0, c0 + d * 0.27, d * 0.54, d * 0.34, 0x5A6478, 0.9)]);
        }
        if (framed) face.add(this.add.image(c0, c0, frameKey).setDisplaySize(sz, sz));
        else face.add(this.add.circle(c0, c0, sz / 2 - 1.5, 0, 0).setStrokeStyle(3, COLOR.accent, 1));
    }

    // 퀘스트 빨간 점: 수령 가능 수(0이면 숨김)
    setQuestBadge(n) { this.questCount = n; this.applyQuestBadge(); }

    // 하단 탭의 퀘스트 칸 아이콘(없으면 라벨) 우상단에 빨간 점 + 숫자. 탭 바를 다시 만들면(buildTabs) 다시 붙인다
    applyQuestBadge() {
        const n = this.questCount ?? 0;
        const bk = groupsOn() ? 'g_growth' : 'quest'; // 그룹 모드: 퀘스트가 든 그룹 버튼에 표시
        const cell = this.tabBar?.scene ? this.tabBar.cells.find((c) => c.key === bk) : null;
        if (!cell) return;
        if (!cell.dot?.scene) {
            const { x: dx, y: dy } = this.tabBar.badgePos(bk);
            cell.dot = this.add.circle(dx, dy, 8, COLOR.danger).setStrokeStyle(2, COLOR.text);
            cell.dotN = makeText(this, dx, dy, '', { size: 10, bold: true, origin: [0.5, 0.5] });
            this.tabBar.add([cell.dot, cell.dotN]);
        }
        cell.dot.setVisible(n > 0); cell.dotN.setVisible(n > 0).setText(n > 9 ? '9+' : String(n));
    }

    // 시즌 전쟁 읽지 않음 수(warEntry.warUnreadCount: active -> unread?after_id=war.feedSeen). 게스트는 호출 생략, 실패 = 0.
    //  War 씬에서 전황 탭을 열면 feedSeen 이 갱신되므로 로비 복귀(create) 시 다시 조회해 사라진다
    startWarUnread() {
        this.warUnread = 0;
        if (session.kind === 'guest' || !FEATURES.seasonWar) return; // 시즌 전쟁 잠금 중이면 전황 조회 안 함
        const poll = () => {
            if (!this.sys.isActive() || (typeof document !== 'undefined' && document.hidden)) return;
            warUnreadCount().then((n) => { if (!this.sys.isActive()) return; this.warUnread = n; this.applyWarBadge(); });
        };
        poll();
        this.time.addEvent({ delay: 60000, loop: true, callback: poll });
        const onVis = () => { if (!document.hidden) poll(); };
        document.addEventListener('visibilitychange', onVis);
        this.events.once('shutdown', () => document.removeEventListener('visibilitychange', onVis));
    }

    // 진입점 빨간 숫자 뱃지(최대 9+): 그룹 모드 = 하단 '멀티' 칸 + 멀티 서브 탭 '시즌 전쟁', 비그룹 = 하단 '방 대전' 칸(시즌 전쟁 버튼이 있는 탭)
    applyWarBadge() {
        markSoonTabs(this, this.subTabs); // 잠긴 서브 탭(시즌 전쟁·랭크전) '오픈 예정' 배지. 서브 탭을 새로 만들 때마다 이 함수가 불린다
        const n = this.warUnread ?? 0;
        const targets = groupsOn() ? [[this.tabBar, 'g_multi'], [this.subTabs, 'war']] : [[this.tabBar, 'room']];
        targets.forEach(([tb, key]) => {
            const cell = tb?.scene ? tb.cells.find((c) => c.key === key) : null;
            if (!cell) return;
            if (!cell.warDot?.scene) {
                if (n <= 0) return;
                const pos = tb.badgePos(key); if (!pos) return;
                cell.warDot = this.add.circle(pos.x, pos.y, 8, COLOR.danger).setStrokeStyle(2, COLOR.text);
                cell.warDotN = makeText(this, pos.x, pos.y, '', { size: 10, bold: true, origin: [0.5, 0.5] });
                tb.add([cell.warDot, cell.warDotN]);
            }
            cell.warDot.setVisible(n > 0); cell.warDotN.setVisible(n > 0).setText(n > 9 ? '9+' : String(n));
        });
    }

    // 튜토리얼 자동 시작(서버 profile.tutorial.auto_start: 미시작·미종료 신규 유저). 세션당 1회만 시도
    maybeAutoTutorial(prof) {
        const t = prof?.tutorial;
        if (!t || !t.auto_start || t.done || LobbyScene.tutorialTried || this.modalCount > 0) return;
        LobbyScene.tutorialTried = true;
        // 새 흐름(플래그 on): 짧은 프롤로그 6줄 -> 끝나면 로비가 추천 첫 스테이지로 바로 출정(autoSortie) -> 첫 전투 조작 안내. 끄면 기존 10스텝 대사
        if (guideEnabled()) { markNewFlow(); this.scene.start('Dialogue', { source: 'guide_prologue', next: { scene: 'Lobby', data: { tab: 'main', autoSortie: true } } }); return; } // 튜토리얼 stage_01 = 메인 스토리 탭(2026-11-14)
        this.scene.start('Dialogue', { source: 'tutorial', server: true, stepIndex: Math.max(0, Number(t.step) || 0), next: { scene: 'Lobby', data: { tab: this.tab } } });
    }

    // 펜 안내(개념 팝업 C_gacha, 시오리 브리핑 1회): 튜토리얼 완료(서버 tutorial.done 또는 새 흐름 조작 안내 완료) 후 로비 진입 때 한 번.
    //  뽑기가 열려 있을 때만, 바로 출정(autoSortie·결과 '다음 스테이지')하는 진입은 제외. 중복·완료 기록(srpg.tip.gacha)은 conceptPopup 이 처리(표시 직전 기록)
    maybeGachaConcept(prof) {
        if (!gachaOn() || this.directSortie || !this.sys.isActive()) return;
        if (!(prof?.tutorial?.done || guideDone())) return;
        conceptPopup(this, 'C_gacha');
    }

    logout() {
        confirmModal(this, '로그아웃', session.kind === 'guest' ? '게스트 토큰이 이 기기에서 삭제됩니다. 가입하지 않은 게스트 진행 데이터는 다시 불러올 수 없습니다.' : '로그아웃 하시겠습니까?', async () => {
            await auth.logout();
            LobbyScene.penBalance = null; LobbyScene.penUser = null; // 계정 전환 시 이전 계정 펜 잔액을 보이지 않게(정검수 2차 Low)
            this.scene.start('Title');
        }, { okLabel: '로그아웃', danger: true });
    }

    // ---------- 탭 공통 ----------
    show(key, { soft = false } = {}) {
        if (key === 'party') key = 'stage'; // 제거된 편성 탭
        if (key !== 'gacha') this.stopGachaOverlay(); // 뽑기 오버레이는 뽑기 탭에서만
        if (key !== 'war') this.stopWarOverlay(); // 멀티 > 시즌 전쟁 = 로비 위 오버레이(War 씬, tabWar). 다른 탭이면 닫는다
        if (key === 'gacha' && this.tab !== 'gacha') this.preGachaTab = this.tab; // 소환 화면(Gacha 씬) '뒤로' 복귀 탭
        this.tab = key;
        if (groupsOn()) {
            LobbyScene.lastSub = LobbyScene.lastSub ?? {}; LobbyScene.lastSub[groupOf(key).key] = key;
            const gk = groupOf(key).key; if (this.tabBar?.scene && this.tabBar.active !== gk && this.tabBar.cells?.some((c) => c.key === gk)) this.tabBar.setActive(gk); // 다른 그룹 화면으로 바로 이동(상점 <-> 인벤토리 등)해도 하단 메뉴 강조 일치
        }
        this.softShow = soft; // 에셋 도착 후 다시 그리기: 서버 재조회 없이 캐시 사용(U02)
        // 배경: 뽑기 탭 = bgscreen_gacha, 그 외 = bgscreen_lobby(있을 때만)
        if (this.bgImg?.scene) { const bk = key === 'gacha' && this.textures.exists('bgscreen_gacha') ? 'bgscreen_gacha' : 'bgscreen_lobby'; if (this.bgImg.texture.key !== bk) { this.bgImg.setTexture(bk); this.bgImg.setScale(Math.max(L.lw / this.bgImg.width, L.lh / this.bgImg.height)); } }
        this.drawBadge?.(); // 상단 뱃지: 스테이지 지도가 칩 프레임을 받은 뒤면 프레임 방식으로 다시(입력 같으면 생략)
        if (!(key === 'gacha' && gachaSceneOn())) this.ensureTabAssets(key); // 소환 화면으로 바로 넘어가면 로비에서 gacha scope 를 받지 않는다(Gacha 씬이 받음 — 같은 키 중복 로드 'Texture key already in use' 방지). 탭별 scope 지연 로드(뽑기 아틀라스·아군 유닛 스프라이트) — 받은 뒤 그 탭이면 다시 그림
        audio.bgm(audio.lobbyBgm(), this); // 로비 모든 탭(뽑기 포함) 공통 트랙(사용자 지시: 로비 음악 통일). 같은 트랙이면 끊김 없이 이어서 재생
        this.inputs.forEach((i) => i.destroy());
        this.inputs = [];
        this.content.removeAll(true);
        // 풀 와이드 내용영역: 큰 외곽 창(Panel) 없이 배경 위에 직접 배치. 가로 안전 여백만(데스크톱 28, 좁은 화면 12)
        const m = L.short ? 6 : 12; // 가로 폰: 본문 위아래 여백 12 -> 6
        this.panelM = m;
        const pad = this.wide() ? 28 : 12;
        const x0 = (this.railW || L.safe.l) + pad; // 왼쪽 세로 레일 오른쪽부터
        const w = L.lw - (this.railW || L.safe.l) - L.safe.r - pad * 2; // 레일 폭만큼 본문 폭 축소
        // 헤더 로고가 바 아래로 걸쳐 내려와 본문과 가로로 겹치면 본문(서브 탭·제목 줄 포함) 시작을 로고 아래 끝 + 4 로(사용자 2026-11-04 'UI 를 안 가리는 선에서', 모든 탭 공통)
        const lb = this.logoBox; const top0 = this.barH + m;
        // 여백 14: 서브 탭은 본문 y - 4 에 그려지고, 실측 로고 아래 끝이 계산값보다 최대 약 9px 아래(강화면: 800 y85·667 y71 걸침) -> 서브 탭 윗변이 로고 아래 끝 + 10 이상
        const LOGO_GAP = 14;
        const top = lb && lb.bottom > this.barH && lb.x + lb.w > x0 && Math.ceil(lb.bottom) + LOGO_GAP > top0 ? Math.ceil(lb.bottom) + LOGO_GAP : top0;
        this.contentTop = top;
        // 로고 영역 공통 노출(다른 오버레이·씬이 참조): registry 'logoBox' = {x, w, bottom}(화면 좌표, 없으면 null), 'contentTop' = 본문 시작 y. 디버그(?debug=1)면 window.__qaLogo
        this.registry.set('logoBox', this.logoBox ?? null); this.registry.set('contentTop', top);
        try { if ((import.meta.env?.DEV || import.meta.env?.VITE_QA_HOOKS === '1') && new URLSearchParams(location.search).get('debug') === '1') { if (!window.__qaLogo) this.events.once('shutdown', () => { delete window.__qaLogo; }); window.__qaLogo = { logo: this.logoBox ?? null, contentTop: top, barH: this.barH, railTop: this.railTopY ?? null, lw: L.lw, lh: L.lh }; } } catch { /* 무시 */ } // __qa 와 같은 게이트, shutdown 때 삭제
        const h = L.lh - this.tabH - top - m;
        const p = this.add.container(x0, top);
        p.w = w; p.h = h;
        const subs = groupsOn() ? subTabsOf(groupOf(key)) : [];
        if (subs.length > 1 && subs.includes(key)) { // 그룹 서브 탭(본문 상단). 제목 줄 대신
            this.subTabs = new Tabs(this, { x: 0, y: -4, w: Math.min(w, subs.length * (L.portrait ? 120 : 160)), h: L.short ? 34 : 44, items: subs.map((k) => ({ key: k, label: tabLabel(k), icon: SUB_ICON[k] })), active: key, size: 16, onChange: (k) => this.show(k) });
            p.add(this.subTabs);
            this.applyWarBadge();
        } else {
            const tt = makeText(this, 0, L.short ? 12 : 16, tabLabel(key), { size: L.short ? 18 : 22, heading: true, color: '#f0d58c', origin: [0, 0.5], stroke: { color: '#0B1020', width: 4 } });
            p.add(tt);
            p.add(this.add.rectangle(0, L.short ? 26 : 34, Math.min(w, Math.max(160, tt.width + 48)), 2, COLOR.accent, 0.8).setOrigin(0));
        }
        if (key === 'main' || key === 'stage') this.addResumeButton(p, w); // 2026-11-14 위치 통일: 메인 스토리·역사 시나리오(지도형·폴백 모두) 같은 자리(서브 탭 줄 오른쪽). 이전 주석: 중간 저장: 진행 중 전투가 있으면 본문 상단 오른쪽 '이어하기'. 스테이지 탭은 지도 요약 카드의 출정 옆(지도 폴백 시에만 상단, tabStage)
        p.bodyY = L.short ? 36 : 46;
        // 가독성: 탭 본문(목록·카드·버튼 그리드) 뒤 반투명 남색 얇은 판(0x0B1328 a0.6 + 금색 1px). 큰 장식 창 대신 단색 판
        p.add(this.add.rectangle(-8, p.bodyY - 6, w + 16, h - p.bodyY + 10, 0x0b1328, 0.6).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.45));
        this.content.add(p);
        this.panel = p;
        this.area = { x: 0, y: p.bodyY, w, h: h - p.bodyY };
        // U34 로딩 표현(2026-11-14 재디자인, ui/TabLoading): 실제 화면 모양 스켈레톤(카드 격자/목록 행, 둥근 모서리·금 헤어라인·완만한 shimmer) + 본문 중앙 배지(금 고리 + 문장 + '불러오는 중…').
        //  스켈레톤은 done()/fail() 에서 파괴, 배지(this.loading)는 숨김만(fail() 의 탭 생존 판정·ShioriBrief 보류 판정이 loading.scene/visible 을 씀). soft 재구성은 캐시라 스켈레톤 생략
        this.skel?.forEach((o) => o.destroy());
        const sa = { x: 0, y: p.bodyY + 4, w, h: Math.max(40, h - p.bodyY - 10) }; // 본문 판(위 rectangle) 안쪽
        let skelOpt = { kind: 'row' };
        if (CARD_LOADING_TABS.has(key)) {
            const gap = 12; const usable = sa.w - 8;
            const ratio = key === 'hero' ? HERO_CARD_RATIO : 1.3;
            const cols = L.short ? Math.min(8, Math.max(2, Math.ceil((usable + gap) / (Math.floor((sa.h - 10) / ratio) + gap)))) : this.gridCols(usable, key === 'hero' ? (L.portrait ? 160 : 220) : (L.portrait ? 104 : 132), gap, key === 'hero' ? [4, 6] : [5, 9], key === 'hero' ? 2 : 3);
            skelOpt = { kind: 'card', cols, ratio, gap };
        }
        this.skel = soft ? [] : [createTabSkeleton(this, sa, skelOpt)];
        this.skel.forEach((o) => p.add(o));
        this.loading = createTabLoadingBadge(this, w / 2, sa.y + sa.h / 2, { fadeIn: !soft });
        p.add(this.loading);
        const fn = { lineup: this.tabLineup, stage: this.tabStage, main: this.tabMain, hero: this.tabHero, protagonist: this.tabProtagonist, dex: (pp) => tabDex(this, pp), rank: (pp) => tabRank(this, pp), war: this.tabWar, room: this.tabRoom, gacha: this.tabGacha, more: this.tabMore, quest: (pp) => tabQuest(this, pp), ranking: (pp) => tabRanking(this, pp), shop: (pp) => tabShop(this, pp), exchange: (pp) => tabExchange(this, pp), inventory: (pp) => tabInventory(this, pp) }[key];
        const soon = comingSoonOf(key); // 잠긴 기능 = 티저만(War 오버레이·랭크 API 호출 없음)
        (soon ? tabComingSoon(this, p, soon) : fn.call(this, p)).catch((e) => this.fail(p, e));
    }

    // 목록(ScrollList)에서 보이는 카드의 초상화만 지연 로드: 즉시 1회 + 스크롤 대비 250ms 주기 확인(목록 파괴 시 정리)
    lazyPortraits(list) {
        const tick = () => { if (!list.scene) { ev?.remove(false); return; } list.content.list.forEach((o) => { if (o.visible) o.portrait?.load(); }); };
        const ev = this.time.addEvent({ delay: 250, loop: true, callback: tick });
        tick();
    }

    // 와이드(데스크톱·태블릿 가로) 판정: 논리 폭 900 이상
    wide() { return L.lw >= 900; }

    // 그리드 열 수: 최소 카드 폭(minW) 기준 자동, 와이드는 [wMin,wMax], 좁은 화면은 [1,nMax]
    gridCols(w, minW, gap, [wMin, wMax] = [1, 99], nMax = 2) {
        const n = Math.max(1, Math.floor((w + gap) / (minW + gap)));
        return this.wide() ? Math.max(wMin, Math.min(wMax, n)) : Math.max(1, Math.min(nMax, n));
    }

    // 섹션 카드 배경(반투명 남색 panel.sub). 스킨이 없으면 단색 + 얇은 금선
    sectionBg(x, y, w, h, alpha = 0.82) { return heroSectionBg(this, x, y, w, h, alpha); } // ui/HeroDetailView 공용

    fail(p, e) {
        if (!p.scene || !this.loading?.scene) return; // 탭이 바뀌어 패널이 사라짐
        this.done();
        const a = this.area;
        p.add(noteText(this, a.x, a.y + 10, messageOf(e), { kind: 'error', size: 16, wrap: a.w }));
        p.add(new Button(this, { x: a.x, y: a.y + 50, w: 160, label: '다시 시도', variant: 'primary', onClick: () => this.show(this.tab) }));
    }

    // 2026-11-14: 로딩 문구는 숨김 처리(파괴하지 않음: fail() 의 '탭 생존' 판정이 loading.scene 을 씀). ShioriBrief 는 visible 까지 봐서 로딩 끝난 뒤 안내 보류가 풀린다
    done() { this.loading?.stopAnim?.(); this.loading?.setText?.(''); this.loading?.setVisible(false); this.skel?.forEach((o) => o.destroy()); this.skel = []; }

    // ---------- 스테이지 ----------
    async tabStage(p) {
        const all = await gameApi.stages();
        rememberStages(all); // 캠페인 흐름(전투 후 대사 판정)용 stage id -> code 캐시
        await gameApi.lineup().catch(() => null); // 편성 캐시(정보 줄 권장 레벨 비교·말풍선). 실패해도 진행
        if (!p.scene) return;
        const stages = all.filter((s) => !inMainTab(s)); // 메인 스토리(chapter 101+)·튜토리얼(chapter 0)은 '메인 스토리' 탭 전용: 서가 지도·카드 그리드에 섞지 않음
        // 캠페인 지도(StageMapView): 메타/좌표가 없거나 꺼져 있으면 아래 기존 카드 그리드. 끄기: ?stagemap=0 또는 localStorage srpg.stageMap=0
        // 안전장치: 메타 로드·모델 생성·뷰 생성 중 예외면 만들던 뷰를 버리고 카드 그리드로 폴백(빈 화면 방지, 콘솔 경고)
        if (stageMapOn() && stages.length) {
            const meta = await loadCampaignMapMeta(stages).catch((e) => { console.warn('[StageMap] 지도 메타 로드 실패, 카드 그리드로 폴백', e); return null; });
            (meta?.shelves ?? []).forEach((sh) => { const n = Number(sh?.chapter); if (Number.isFinite(n) && sh?.name_ko && !CHAPTER_TITLE[n]) SHELF_TITLE[n] = sh.name_ko; });
            const hidden = await gameApi.hiddenChapter().catch(() => null); // 숨은 종장 진행도(실패·미배포면 null = 지도에 아무것도 안 함)
            const resume = null; // 이어하기는 출정 옆이 아니라 본문 상단(서브 탭 줄 오른쪽, addResumeButton)으로 통일(2026-11-14 사용자 '출정 옆 어색'). StageMapView resume 옵션은 null = 숨김
            if (!p.scene) return;
            let model = null;
            try { model = meta ? buildCampaignMap(stages, meta, { chapterOf: stageChapter, chapterTitle, hidden, hiddenChapter: HIDDEN_CHAPTER }) : null; } catch (e) { console.warn('[StageMap] 지도 모델 생성 실패, 카드 그리드로 폴백', e); }
            if (model?.usable) {
                const a = this.area;
                let view = null;
                try {
                    view = new StageMapView(this, { x: a.x, y: a.y, w: a.w, h: a.h, model, wide: (this.wide() || L.short) && !L.portrait, /* 가로 폰(667 포함)도 좌우 배치(띠 지도 + 목록이 하단 탭 뒤로 가려지던 문제, 강화면 gacha44) */ onPick: (s, o) => this.pickStage(s, o), onGacha: gachaOn() ? () => this.goGacha({ focusBlocking: true }) : null, resume, onResume: (b) => { if (this.modalCount > 0) return; this.resumeBattle(b); }, onProtagonist: () => openCharacterCreate(this, { mode: 'create', next: { scene: 'Lobby', data: { tab: 'stage' } } }) });
                    // 렌더 중 예외는 try/catch 로 못 잡으므로 생성 직후 Container 자식 배열이 정상인지 확인(예약 속성 덮어쓰기 방지)
                    if (!Array.isArray(view.list)) throw new Error('StageMapView.list 가 배열이 아님(Container 예약 속성 충돌)');
                    this.done();
                    if (this.sortieStageId != null) { const sid = this.sortieStageId; const sN = stages.find((x) => Number(x.id) === Number(sid)); if (sN && sN.unlocked !== false) this.time.delayedCall(300, () => { if (!this.sys.isActive() || this.sortieStageId == null) return; this.sortieStageId = null; this.pickStage(sN, { direct: true }); }); else this.sortieStageId = null; } // 결과 화면 '다음 스테이지'(하플레이 2026-11-04)
                    if (this.autoSortie) { const s0 = stages.find((x) => x.id === model.recStageId); if (s0) this.time.delayedCall(this.noticeMs ? this.noticeMs + 300 : 400, () => { if (!this.sys.isActive() || !this.autoSortie) return; this.autoSortie = false; this.pickStage(s0, { direct: true }); }); else this.autoSortie = false; } // 새 튜토리얼: 프롤로그 직후 추천 첫 스테이지로 바로 출정
                    p.add(view);
                    return;
                } catch (e) {
                    console.warn('[StageMap] 지도 화면 생성 실패, 카드 그리드로 폴백', e);
                    try { view?.destroy(); } catch { /* 무시 */ }
                }
            }
        }
        this.done();
        this.stageCards(p, stages, { msg: '열린 스테이지가 없습니다', sub: '잠시 후 다시 시도해 주세요.' });
    }

    // ---------- 메인 스토리(오리지널, chapter 101+) ----------
    // stages 응답에서 chapter>=101 만 막(장) 순서·응답 순서대로 카드 목록. 해금·별점·잠금 표시와 출정(pickStage -> 전 대사 -> 배치)은 스테이지 카드와 같은 경로
    async tabMain(p) {
        const all = await gameApi.stages();
        rememberStages(all);
        await gameApi.lineup().catch(() => null); // 편성 캐시(정보 줄 권장 레벨 비교)
        if (!p.scene) return;
        // 튜토리얼(chapter 0) 먼저(서버 순서) -> 메인 스토리 1~4막. 같은 막 안은 서버 순서 유지(안정 정렬)
        const stages = [...all.filter(isTutorial), ...all.filter(isMainStory).sort((x, y) => stageChapter(x) - stageChapter(y))];
        this.done();
        // 추천 배지는 한 곳에만(하플레이 2026-11-04 '추천 중복'). 튜토리얼이 이 탭으로 온 뒤(2026-11-14): 튜토리얼에 진행할 스테이지가 남아 있으면 이 탭이 추천,
        //  아니면 기존 규칙(역사 시나리오 지도에 진행할 스테이지가 남아 있으면 이 탭은 추천 생략)
        const tutLeft = stages.some((s) => isTutorial(s) && stagePlayable(s) && !(s.clear_count > 0));
        const shelfLeft = !tutLeft && all.some((s) => !inMainTab(s) && stagePlayable(s) && !(s.clear_count > 0));
        // 도서관 지도(역사 시나리오 지도와 같은 플래그 stageMapOn). 모델·뷰 생성 예외면 기존 카드 그리드 폴백
        if (stageMapOn() && stages.length) {
            let view = null;
            try {
                const model = buildCampaignMap(stages, libraryMeta(), { chapterOf: stageChapter, chapterTitle });
                if (model?.usable) {
                    const a = this.area;
                    view = new LibraryMapView(this, { x: a.x, y: a.y, w: a.w, h: a.h, model, wide: (this.wide() || L.short) && !L.portrait, onPick: (s, o) => this.pickStage(s, o), onGacha: gachaOn() ? () => this.goGacha({ focusBlocking: true }) : null, resume: null, onProtagonist: null });
                    if (!Array.isArray(view.list)) throw new Error('LibraryMapView.list 가 배열이 아님');
                    p.add(view);
                    this.mainTabSortie(stages, shelfLeft);
                    return;
                }
            } catch (e) { console.warn('[LibraryMap] 도서관 지도 생성 실패, 카드 그리드로 폴백', e); try { view?.destroy(); } catch { /* 무시 */ } }
        }
        this.stageCards(p, stages, { msg: '메인 스토리 준비 중', sub: '곧 열립니다.' }, { noRec: shelfLeft });
        this.mainTabSortie(stages, shelfLeft);
    }

    // 메인 스토리 탭의 자동 출정(튜토리얼 이동 후): 결과 화면 '다음 스테이지'(sortieStageId)·새 튜토리얼 프롤로그 직후(autoSortie) = 역사 시나리오 지도(tabStage)와 같은 동작
    mainTabSortie(stages, noRec) {
        if (this.sortieStageId != null) { const sid = this.sortieStageId; const sN = stages.find((x) => Number(x.id) === Number(sid)); if (sN) { if (sN.unlocked !== false) this.time.delayedCall(300, () => { if (!this.sys.isActive() || this.sortieStageId == null) return; this.sortieStageId = null; this.pickStage(sN, { direct: true }); }); else this.sortieStageId = null; } } // 소비(null)는 실제 출정 직전: 그 전에 씬이 재시작되면 relayout 데이터로 이어짐
        if (this.autoSortie) {
            const s0 = noRec ? null : stages.find((s) => stagePlayable(s) && !(s.clear_count > 0)); // stageCards 추천과 같은 규칙
            if (s0) this.time.delayedCall(this.noticeMs ? this.noticeMs + 300 : 400, () => { if (!this.sys.isActive() || !this.autoSortie) return; this.autoSortie = false; this.pickStage(s0, { direct: true }); });
        }
    }

    // 스테이지 카드 그리드(챕터 헤더 + 카드). 빈 목록이면 빈 상태 문구
    stageCards(p, stages, empty, { noRec = false } = {}) {
        const a = this.area;
        const list = new ScrollList(this, { x: a.x, y: a.y, w: a.w, h: a.h, clip: true, bar: true });
        p.add(list);
        if (!stages.length) { list.content.add(emptyState(this, { w: a.w, ...empty })); return; }
        // U12: 챕터별 헤더(서버 chapter, 없으면 code 'ch<N>_') + 추천 배지(첫 진행 가능 = 해금·미클리어 첫 스테이지)
        // U13: 카드 정보 순서 통일(와이드·좁은 화면 동일) = 번호·제목 / 난이도·권장 Lv / 보상 / 상태. 하단 패딩 12
        const gap = 12;
        const cols = this.gridCols(a.w, 280, gap, [3, 5], 1);
        const cw = Math.floor((a.w - gap * (cols - 1)) / cols);
        const rowH = cols > 1 ? 120 : 108;
        const rec = noRec ? null : stages.find((s) => stagePlayable(s) && !(s.clear_count > 0));
        const groups = [];
        stages.forEach((s, i) => { const ch = stageChapter(s); let g = groups.find((x) => x.ch === ch); if (!g) { g = { ch, items: [] }; groups.push(g); } g.items.push([s, i]); });
        let y = 0;
        groups.forEach((g) => {
            const head = this.add.container(0, y); head.clipH = 36;
            // 캠페인 장(chapter>0): 진행도(클리어 수·별 합계) 병기
            const prog = g.ch >= 0 ? `   클리어 ${g.items.filter(([s]) => s.clear_count > 0).length}/${g.items.length} · ★ ${g.items.reduce((n, [s]) => n + (s.best_stars ?? 0), 0)}/${g.items.length * 3}` : '';
            const ht = makeText(this, 0, 18, chapterTitle(g.ch) + prog, { size: 16, heading: true, color: '#f0d58c', origin: [0, 0.5] });
            // 1장 헤더 우측: 주인공 열람 카드(캐릭터 생성·재검사·초상화 변경, 재검사 가능 여부는 BE 정책)
            const cardW = g.ch === 1 ? 132 : 0;
            head.add([ht, this.add.rectangle(ht.width + 12, 18, Math.max(0, a.w - ht.width - 20 - (cardW ? cardW + 8 : 0)), 1, COLOR.accent, 0.5).setOrigin(0, 0.5)]);
            if (cardW) {
                const cb = listRow(this, { x: a.w - cardW - 8, y: 3, w: cardW, h: 30, onClick: () => openCharacterCreate(this, { mode: 'create', next: { scene: 'Lobby', data: { tab: 'stage' } } }) });
                cb.add(makeText(this, cardW / 2, 15, '주인공 열람 카드', { size: 12, bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
                head.add(cb);
            }
            list.content.add(head);
            y += 36 + 4;
            g.items.forEach(([s, i], k) => {
                const row = listRow(this, { x: (k % cols) * (cw + gap), y: y + Math.floor(k / cols) * (rowH + gap), w: cw, h: rowH, disabled: !stagePlayable(s), onClick: () => this.pickStage(s) });
                const ok = stagePlayable(s);
                const c = ok ? CSS.text : CSS.muted;
                const isRec = rec && s.id === rec.id;
                // 안쪽 여백: 1열(390·667)은 row 스킨 모서리 장식이 번호·첫 글자를 덮어(강화면 a27c Low) 24, 다열(1280)은 기존 14
                const pad = cols > 1 ? 14 : 24;
                let tx = pad;
                row.add(makeText(this, tx, 10, `${i + 1}`, { size: 12, color: CSS.muted }));
                // U16: 자물쇠 이모지 대신 도트 pix.lock(없으면 ico.lock, 둘 다 없으면 '잠김' 글자)
                if (!ok) {
                    const lk = pixelImage(this, 'pix.lock', 0, 0, 16) ?? skinIcon(this, 'lock', 18);
                    if (lk) { lk.setPosition(tx + 8, 37); row.add(lk); tx += 22; } else { const lt = makeText(this, tx, 37, '잠김', { size: 12, bold: true, color: CSS.dangerText, origin: [0, 0.5] }); row.add(lt); tx += lt.width + 6; }
                }
                const chipW = isRec ? 52 : 0;
                row.add(fitText(makeText(this, tx, 37, s.name, { size: cols > 1 ? 18 : 17, bold: true, color: c, origin: [0, 0.5] }), cw - tx - pad - chipW));
                if (isRec) {
                    row.add(this.add.rectangle(cw - pad - 44, 27, 44, 20, COLOR.accent, 0.95).setOrigin(0));
                    row.add(makeText(this, cw - pad - 22, 37, '추천', { size: 12, bold: true, color: '#1A1406', origin: [0.5, 0.5] }));
                }
                // 캠페인: 목표 유형 병기(생존 목표만 강조색). 기존 스테이지(chapter 0)는 목표 문구 생략(전부 지휘관 격파)
                const wr = normRules(s.stage_rules ?? s.rules); // 승패 규칙(only/all) 있으면 그 라벨, 없으면 기존 짧은 목표
                const objTxt = stageChapter(s) > 0 ? `   목표 ${wr && ['only', 'all'].includes(wr.mode) ? goalLines(s.objective, wr).join(' · ') : objectiveShort(s.objective)}` : '';
                row.add(fitText(makeText(this, pad, 60, `난이도 ${stars(s.difficulty, 6)}   권장 Lv.${s.recommended_level}${objTxt}`, { size: 12, color: s.objective?.type === 'survive_turns' ? '#9fd8c8' : '#C9C2AE', origin: [0, 0.5] }), cw - pad * 2));
                row.add(fitText(makeText(this, pad, 78, `보상  EXP ${s.rewards.user_exp} · 영웅 EXP ${s.rewards.exp} · 골드 ${s.rewards.gold}`, { size: 12, color: CSS.accent, origin: [0, 0.5] }), cw - pad * 2));
                const lockMsg = stageLockText(s); // 선행 사유 우선 + '필요 영웅: ...'
                const joinTxt = s.join_hero?.length && !(s.clear_count > 0) ? `  · 합류 ${s.join_hero.map(heroNameOf).join(', ')}` : ''; // 첫 클리어 합류 영웅(클리어 후엔 생략)
                const st = ok ? (s.clear_count > 0 ? `최고 ${stars(s.best_stars)}  클리어 ${s.clear_count}회` : `미클리어${joinTxt}`) : lockMsg;
                row.add(fitText(makeText(this, pad, 96, st, { size: 12, color: ok ? CSS.accent : CSS.dangerText, origin: [0, 0.5] }), cw - pad * 2));
                list.content.add(row);
            });
            y += Math.ceil(g.items.length / cols) * (rowH + gap) + 8;
        });
        list.setContentHeight(y + 12);
        list.refreshMask();
    }

    // ---------- 이어하기(중간 저장) ----------
    // 서버가 스테이지 전투를 행동마다 저장 -> GET /api/battles/active 로 진행 중 전투 조회. 실패하면 빈 목록(로비 동작에 영향 없음)
    async activeBattles() { try { return await gameApi.battle.active(); } catch (e) { console.warn('[resume] 진행 중 전투 조회 실패', e); return { battles: [], maxOpen: 1 }; } } // 서버 열린 전투 상한 기본 1(2026-11-14 config)

    // 본문 상단 오른쪽(서브 탭 줄) '이어하기 (스테이지명 · N턴)' 버튼(메인 스토리 탭·스테이지 지도 폴백). 이어하기는 하나만: 진행 중 전투가 여러 개여도 가장 최근 1건(서버 응답 최근순 첫 건)
    async addResumeButton(p, w) {
        const { battles } = await this.activeBattles();
        if (!p.scene || this.panel !== p || !battles.length) return;
        let used = 200; // 서브 탭(또는 제목) 폭
        try { if (this.subTabs?.scene && this.subTabs.parentContainer === p) used = Math.min(w, this.subTabs.getBounds().width); } catch { /* 기본값 */ }
        const bw = Math.max(96, Math.min(300, w - used - 8)); // 서브 탭과 8 이상 띄움(390: 서브 탭 240 -> 남는 폭에 맞춰 축소)
        const one = battles[0];
        const st1 = one.status === 'deployment' ? '배치 중' : `${one.turn}턴`;
        // 좁은 버튼: 220 미만이면 스테이지명 생략(하플레이 #8 라벨 잘림), 140 미만이면 '이어하기'만. 스테이지명은 탭 후 진입 화면에서 보인다
        const label = bw < 140 ? '이어하기' : bw < 220 ? `이어하기 · ${st1}` : `이어하기 · ${one.stage_name ?? '전투'} · ${st1}`;
        const btn = new Button(this, { x: w - bw, y: -4, w: bw, h: L.short ? 34 : 40, label, variant: 'primary', size: 15, onClick: () => { if (this.modalCount > 0) return; this.resumeBattle(one); } }); // v19: 모달 열린 동안 무시(이중 방어)
        p.add(btn);
    }

    // 배치 중 = 배치 화면(Deploy 가 배치 정보 재조회), 진행 중 = 전투 씬(서버 view 로 복원. 지난 대사·시작 연출은 localStorage 기록으로 반복 안 함)
    resumeBattle(b) {
        if (this.resumeBusy) return; // 연속 클릭으로 씬 이중 시작 방지
        this.resumeBusy = true; this.time.delayedCall(1500, () => { this.resumeBusy = false; });
        this.events.once('shutdown', () => { this.resumeBusy = false; }); // 전환으로 씬이 끝나면 위 타이머가 돌지 않으므로 여기서 해제
        const code = b.stage_code ?? null;
        if (b.status === 'deployment') this.scene.start('Deploy', { mode: 'stage', battleId: b.battle_id, stageName: b.stage_name, stageCode: code });
        else this.scene.start('Battle', { mode: 'stage', battleId: b.battle_id, fresh: true, stageCode: code });
    }

    // opts.direct: 지도 요약의 '출정' 버튼(이미 확인한 셈) -> 확인창 없이 바로 배치로
    pickStage(s, opts = {}) {
        if (!stagePlayable(s)) {
            if (s.unlocked && missingHeroesOf(s).length) { this.heroMissingModal(missingHeroesOf(s)); return; }
            showToast(this, '아직 해금되지 않은 스테이지입니다.'); return;
        }
        // 편성 라인업 사전 판정(서버 lineup_ready, 최종 판정은 서버): 부족하면 출정 전에 안내 + '편성 화면으로'
        if (s.lineup_ready === false) {
            const need = Number(s.min_party) || 1;
            const why = s.lineup_reason === 'lineup_empty' ? '편성에 영웅이 없습니다.' : `이 스테이지는 최소 ${need}명이 필요합니다.`;
            confirmModal(this, '편성 필요', `${why}\n영웅 > 편성에서 출전할 영웅을 넣어 주세요.`, () => this.selectTab('lineup'), { okLabel: '편성 화면으로' });
            return;
        }
        const prof = session.profile;
        const warn = prof && prof.level < s.recommended_level ? `\n! 권장 레벨(${s.recommended_level})보다 낮습니다.` : '';
        // 캠페인 정보(목표·별 조건·첫 클리어 합류 영웅). 기존 스테이지(chapter 0)는 기존 문구·확인창 그대로
        const camp = stageChapter(s) > 0;
        const info = camp ? [
            `목표: ${goalLines(s.objective, s.stage_rules ?? s.rules).join(' / ')}`, // 승패 규칙 반영(only = 추가 조건 라벨만)
            `별 조건: ${starCondsOf(s).map((c) => starCondText(c, s)).join(' / ')}`,
            s.join_hero?.length && !(s.clear_count > 0) ? `첫 클리어 합류: ${s.join_hero.map(heroNameOf).join(', ')}` : '',
        ].filter(Boolean).join('\n') + '\n' : '';
        const body = `권장 Lv.${s.recommended_level} · 보상 골드 ${s.rewards.gold}${warn}\n${info}\n출정하면 배치 화면으로 이동합니다.`;
        // 출정 대기 표시(2026-11-15 '다음 스테이지 누르면 멈춤'): 진행 중 전투 조회 + 도전(POST challenge, 서버 부하 시 15~20초)은 화면 변화 없이 기다려
        //  멈춘 것처럼 보였다 -> 0.3초 넘게 걸리면 입력 차단 덮개 + '출정 준비 중…', 끝나면(모달·오류·씬 이동) 해제. 대기 중 중복 출정 무시
        const go = async () => {
            if (this.sortieBusy) return;
            this.sortieBusy = true;
            const wait = createLoadingView(this, { tagline: '출정 준비 중…', overlay: true, indeterminate: true, delay: 300 });
            try { await this.sortieGo(s, opts, camp); } catch (e) { console.error('[sortie] 출정 실패', e); if (this.sys.isActive()) showToast(this, `출정하지 못했습니다. ${messageOf(e)}`, { kind: 'warn' }); } finally { this.sortieBusy = false; wait.destroy(); }
        };
        if (opts.direct) { go(); return; }
        // 소탕(2026-11-04, docs/SHOP_EXCHANGE_SPEC.md §2): 직접 3성 클리어한 스테이지만 확인창에 '소탕' 버튼(전투 없이 보상만, 일일 한도 공유)
        const sweepBtn = (Number(s.best_stars) || 0) >= 3 ? [{ label: '소탕', onClick: () => this.time.delayedCall(0, () => this.openSweep(s)) }] : [];
        if (!camp && !sweepBtn.length) { confirmModal(this, s.name, body, go, { okLabel: '출정' }); return; }
        new Modal(this, { title: s.name, body, w: 520, h: Math.min(L.lh - 24, 200 + body.split('\n').length * 24), buttons: [{ label: '취소' }, ...sweepBtn, { label: '출정', variant: 'primary', onClick: go }] });
    }

    // pickStage 출정 본체(진행 중 전투 확인 -> 도전 -> 개전 전 대사 -> 배치). 반환 = 끝(모달 표시·오류 안내·씬 이동 시작)
    async sortieGo(s, opts, camp) {
        // 중간 저장: 같은 스테이지에 열린 전투가 있으면 이어하기/새로 시작 선택, 열린 전투가 상한(max_open)이면 가장 오래된 전투 자동 포기 경고
        const act = await this.activeBattles();
        if (!this.sys.isActive()) return;
        const same = act.battles.find((b) => Number(b.stage_id) === Number(s.id));
        if (same && !opts.fresh) {
            new Modal(this, { title: '진행 중인 전투', body: `'${s.name}' 전투가 진행 중입니다(${same.status === 'deployment' ? '배치 중' : `${same.turn}턴`}).
새로 시작하면 이전 전투는 포기(패배) 처리됩니다.`, w: 520, h: 240,
                buttons: [{ label: '취소' }, { label: '새로 시작', variant: 'danger', onClick: async () => { try { await gameApi.battle.abandon(same.battle_id); } catch (e) { if (e?.status !== 404 && e?.status !== 409) { alertModal(this, '포기 실패', messageOf(e)); return; } } this.pickStage(s, { ...opts, direct: true, fresh: true }); } }, { label: '이어하기', variant: 'primary', onClick: () => this.resumeBattle(same) }] });
            return;
        }
        if (!opts.capOk && act.battles.length >= act.maxOpen) {
            const old = act.battles[act.battles.length - 1]; // 최근 갱신순 -> 마지막이 가장 오래됨
            // 상한 1(기본): 진행 중 전투 1개 기준 문구 + 이어하기. 상한이 2 이상이면 기존 '가장 오래된 전투' 문구
            const oldSt = old ? (old.status === 'deployment' ? '배치 중' : `${old.turn ?? 1}턴`) : '';
            const body = act.maxOpen <= 1
                ? `진행 중인 '${old?.stage_name ?? '전투'}' 전투가 있습니다(${oldSt}).
새로 시작하면 기존 전투는 포기(패배) 처리됩니다.`
                : `진행 중인 전투가 ${act.battles.length}개입니다(최대 ${act.maxOpen}개).
새로 도전하면 가장 오래된 '${old?.stage_name ?? '전투'}' 전투가 자동으로 포기 처리됩니다.`;
            new Modal(this, { title: act.maxOpen <= 1 ? '진행 중인 전투' : '열린 전투 상한', body, w: 540, h: 240,
                buttons: [{ label: '취소' }, { label: act.maxOpen <= 1 ? '새로 시작' : '그래도 도전', variant: 'danger', onClick: () => this.pickStage(s, { ...opts, direct: true, fresh: true, capOk: true }) },
                    ...(act.maxOpen <= 1 && old ? [{ label: '이어하기', variant: 'primary', onClick: () => this.resumeBattle(old) }] : [])] });
            return;
        }
        try {
            const r = await gameApi.challenge(s.id);
            const deploy = { scene: 'Deploy', data: { mode: 'stage', battleId: r.battle.battle_id, info: r.deployment, stageName: s.name, stageCode: s.code } };
            // 캠페인: 미시청 장 시작(ch1_open)·스테이지 전(<code>_pre) 대사를 재생한 뒤 배치 화면으로
            if (camp || /^stage_\d+$/.test(s.code ?? '')) await playBeforeStage(this, s, deploy); else this.scene.start(deploy.scene, deploy.data); // 일반 스테이지 stage_NN 도 개전 전 대사(ch30, stage_01 은 장면 없음 -> 바로 배치)
        } catch (e) {
            if (e?.code === 'required_hero_missing') { this.heroMissingModal(missingHeroesOf(e.details ?? {})); return; } // 원시 서버 문구 대신 영웅 이름 안내
            showToast(this, `도전 실패: ${messageOf(e)}`, { kind: 'error', ms: 3500 }); // 서버 오류·거부 사유는 토스트(사용자 규칙 2026-11-15, 이전 alertModal)
        }
    }

    // 공지·점검(2026-11-04, GET /api/announcements·/api/maintenance): 로비 첫 진입 때 1회.
    //  점검 예정/진행(maintenance.enabled) = 안내 모달. 공지 = 아직 안 본(localStorage srpg.notice.seen) 것 중 고정 우선 최신 1건만 모달(나머지는 '더보기 > 공지')
    async checkNotices() {
        if (LobbyScene.noticeChecked) return;
        LobbyScene.noticeChecked = true;
        const fmtT = (s) => { const t = Date.parse(String(s ?? '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(s ?? '')) ? '' : 'Z')); if (!Number.isFinite(t)) return ''; const d = new Date(t); return `${d.getMonth() + 1}/${d.getDate()} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
        try {
            const m = await gameApi.maintenance();
            if (this.sys.isActive() && m?.enabled && !this.modalCount) {
                const when = [fmtT(m.starts_at), fmtT(m.ends_at)].filter(Boolean).join(' ~ ');
                new Modal(this, { title: m.active ? '서버 점검 중' : '점검 예정', body: [m.message || '서버 점검이 예정되어 있습니다.', when ? `일정: ${when}` : ''].filter(Boolean).join('\n'), w: 480, h: 240, buttons: [{ label: '확인', variant: 'primary' }] });
                return;
            }
        } catch { /* 무시 */ }
        let list = [];
        try { list = (await gameApi.announcements())?.announcements ?? []; } catch { return; }
        if (!this.sys.isActive() || !list.length) return;
        LobbyScene.notices = list;
        let seen = [];
        try { seen = JSON.parse(localStorage.getItem('srpg.notice.seen') || '[]'); } catch { seen = []; }
        const n = list.find((x) => !seen.includes(x.id));
        if (!n || this.modalCount) return;
        try { localStorage.setItem('srpg.notice.seen', JSON.stringify([...seen, n.id].slice(-50))); } catch { /* 무시 */ }
        this.showNotice(n);
    }

    showNotice(n) {
        const KIND = { notice: '공지', event: '이벤트', maintenance: '점검' };
        new Modal(this, { title: `[${KIND[n.kind] ?? '공지'}] ${n.title ?? ''}`, body: String(n.body ?? ''), w: Math.min(620, L.lw - 24), h: Math.min(L.lh - 40, 420), buttons: [{ label: '닫기', variant: 'primary' }] });
    }

    // 공지 목록(더보기 > 공지): 최신 목록을 다시 받아 제목 목록 모달, 누르면 본문
    async openNotices() {
        let list = LobbyScene.notices ?? [];
        try { list = (await gameApi.announcements())?.announcements ?? list; } catch { /* 캐시 사용 */ }
        if (!this.sys.isActive()) return;
        if (!list.length) { alertModal(this, '공지', '등록된 공지가 없습니다.'); return; }
        const KIND = { notice: '공지', event: '이벤트', maintenance: '점검' };
        const top = list.slice(0, 6);
        new Modal(this, { title: '공지', body: top.map((n, i) => `${i + 1}. [${KIND[n.kind] ?? '공지'}] ${n.title ?? ''}`).join('\n'), w: Math.min(620, L.lw - 24), h: Math.min(L.lh - 40, 200 + top.length * 26),
            buttons: [{ label: '닫기' }, ...top.slice(0, 3).map((n, i) => ({ label: `${i + 1}번 보기`, onClick: () => this.time.delayedCall(0, () => this.showNotice(n)) }))] });
    }

    // 소탕 횟수 선택 -> POST /api/stages/{id}/sweep(request_id 멱등: 같은 선택 재시도는 같은 ID). 결과 = 실제 실행 횟수·보상, 일일 한도로 일부만 실행되면 안내
    openSweep(s) {
        const MAX = Math.max(1, Number(publicRules()?.sweep?.max_count ?? publicRules()?.sweep_max_count ?? LobbyScene.sweepMax) || 10); // 서버 값(규칙표·직전 소탕 응답 max_count) 우선, 없으면 10(서버 기본 game.sweep.max_count)
        this.sweepPending ??= {};
        const run = async (n) => {
            if (this.sweepBusy) return;
            this.sweepBusy = true;
            const key = `${s.id}:${n}`;
            const rid = (this.sweepPending[key] ??= `sw_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`);
            try {
                const r = await gameApi.sweep(s.id, n, rid);
                delete this.sweepPending[key];
                if (Number(r?.max_count) > 0) LobbyScene.sweepMax = Number(r.max_count); // 서버가 상한을 알려 주면 다음 창부터 사용
                // 응답 gold = 이번 소탕 획득량(보유 총액 아님), user = 계정 레벨 결과(level·exp·max_cost 등) -> 프로필에 반영(재전송 replay 는 이미 반영됨)
                if (r?.profile && typeof r.profile === 'object') sessionCache.setProfile({ ...(session.profile ?? {}), ...r.profile }); // 서버 현재 프로필(레벨·exp·골드, replay 도 최신) 우선
                else if (session.profile && !r?.replay) { const u = r?.user ?? {}; sessionCache.setProfile({ ...session.profile, ...(u.level != null ? { level: u.level } : {}), ...(u.exp != null ? { exp: u.exp } : {}), ...(u.max_cost != null ? { max_cost: u.max_cost } : {}), ...(u.max_party_slots != null ? { max_party_slots: u.max_party_slots } : {}), gold: (Number(session.profile.gold) || 0) + (Number(r?.gold) || 0) }); }
                sessionCache.setHeroes?.(null); // 영웅 경험치 변화 -> 다음 조회 때 새로
                const lines = [`소탕 ${r.executed}회 완료${r.executed < r.requested ? ` (요청 ${r.requested}회)` : ''}`, `골드 +${Number(r.gold ?? 0).toLocaleString('ko-KR')}`, r.user_exp ? `계정 EXP +${r.user_exp}` : '', r.hero_exp_total ? `영웅 EXP +${r.hero_exp_total}` : ''].filter(Boolean);
                if (r.reward_blocked === 'stage_daily_cap') lines.push('오늘 이 스테이지의 보상 한도에 도달했습니다.');
                new Modal(this, { title: `${s.name} 소탕`, body: lines.join('\n'), w: 440, h: 150 + lines.length * 26, buttons: [{ label: '확인', variant: 'primary', onClick: () => { if (this.tab === 'stage') this.show('stage', { soft: false }); } }] });
            } catch (e) {
                if (e?.status && e.status < 500) delete this.sweepPending[key]; // 확정 오류는 새 ID, 네트워크·5xx 는 같은 ID 재사용
                alertModal(this, '소탕 실패', messageOf(e));
            } finally { this.sweepBusy = false; }
        };
        // 창 높이 = 본문 실제 줄 수에 맞춤(강화면 gacha42 M1: 390 에서 4줄로 줄바꿈돼 마지막 줄이 버튼과 겹침). Modal 본문과 같은 글자 크기·폭으로 잰다
        const sweepBody = `전투 없이 3성 보상을 반복해 받습니다.\n오늘 이 스테이지의 보상 한도를 함께 씁니다.\n횟수를 고르세요(최대 ${MAX}회).`;
        const mw = Math.min(520, L.lw - 24);
        const probe = makeText(this, 0, 0, sweepBody, { size: L.short ? 16 : 18, wrap: mw - 48 }); const bodyH = probe.height; probe.destroy();
        new Modal(this, { title: `${s.name} 소탕`, body: sweepBody, w: 520, h: Math.ceil(62 + 12 + 8 + bodyH + 24 + Math.max(48, MIN_TOUCH) + 24),
            buttons: [{ label: '취소' }, { label: '1회', onClick: () => run(1) }, { label: '5회', onClick: () => run(5) }, { label: `${MAX}회`, variant: 'primary', onClick: () => run(MAX) }] });
    }

    // 필수 영웅 미보유 안내(대여 없음). 소집(가챠) 탭으로 이동만 하고 자동 구매는 하지 않는다
    //  해결책 안내(2026-11-14): GET /api/gacha 의 시나리오 배너(pool_heroes·required_pity)에서 그 영웅이 나오는 배너 제목·필수 천장을 찾아 덧붙인다(수치는 서버 값만, 실패 시 기본 문구)
    async heroMissingModal(missing) {
        if (this.heroHintBusy) return;
        this.heroHintBusy = true;
        let hint = null;
        try { if (gachaOn()) hint = gachaHintOf(await gameApi.gacha.info(), missing); } catch { /* 안내 없이 기본 문구 */ } finally { this.heroHintBusy = false; }
        if (!this.sys.isActive()) return;
        const body = [missingHeroText(missing) || '필요 영웅을 보유하지 않았습니다.', hint?.text || '영웅을 영입하면 출정할 수 있습니다.'].join('\n');
        const buttons = [{ label: '닫기' }];
        if (gachaOn()) buttons.push({ label: hint ? '배너로 이동' : '소집으로 이동', variant: 'primary', onClick: () => this.goGacha(hint ? { sel: hint.sel } : { focusBlocking: true }) });
        // 창 높이 = 본문 실제 줄 수에 맞춤(소탕 모달과 같은 계산, 강화면 2026-11-14: 390 폭에서 고정 260 이면 마지막 줄이 잘림). 최소는 기존 값
        const mw = Math.min(500, L.lw - 24);
        const probe = makeText(this, 0, 0, body, { size: L.short ? 16 : 18, wrap: mw - 48 }); const bodyH = probe.height; probe.destroy();
        new Modal(this, { title: '출정 불가', body, w: 500, h: Math.min(L.lh - 24, Math.max(hint ? 260 : 220, Math.ceil(62 + 12 + 8 + bodyH + 24 + Math.max(48, MIN_TOUCH) + 24))), buttons });
    }

    // opts.sel = 열 배너 key(Gacha 씬 'theme:<배너 key>'), opts.focusBlocking = 막힌 스테이지 필수 영웅 배너(서버 blocking) 우선 선택
    goGacha(opts = null) { if (!gachaOn()) return; this.gachaFocus = opts; this.selectTab('gacha'); }

    // 코드에서 탭 이동(하단 바 강조 동기화: 그룹 모드면 그 탭이 든 그룹 버튼)
    selectTab(key) { this.tabBar?.setActive(groupsOn() ? groupOf(key).key : key); this.show(key); }

    // ---------- 영웅 ----------
    // ---------- 편성(라인업, 2026-11-14) ----------
    // 캠페인 스테이지 출정 풀(최대 max 명, 서버 GET/PUT /api/lineup). 위 = 편성 슬롯(탭 = 빼기), 아래 = 보유 영웅(탭 = 넣기·빼기). 저장 = PUT 전량 교체
    async tabLineup(p) {
        const [lu, heroes] = await Promise.all([gameApi.lineup(true), gameApi.heroes()]);
        if (!p.scene) return;
        this.done();
        const a = this.area; const max = Number(lu?.max) || 5;
        let ids = (lu?.lineup ?? []).map((h) => h.user_hero_id);
        const pool = (heroes ?? []).filter((h) => !h.protagonist && !h.campaign_only);
        const byId = new Map(pool.map((h) => [h.id ?? h.user_hero_id, h]));
        (lu?.lineup ?? []).forEach((h) => { if (!byId.has(h.user_hero_id)) byId.set(h.user_hero_id, { ...h, id: h.user_hero_id }); });
        const root = this.add.container(a.x, a.y); p.add(root);
        // 2026-11-15 보유 영웅도 카드(가로 PC·세로 폰 공통) + 공·방 줄(ui/heroStats, 영웅 상세와 같은 값). 가로 폰(L.short)은 높이가 모자라 가로형 카드(heroRowCard)
        // 성능(보유 수백 명): 목록은 한 번만 만들고, 넣기/빼기·저장 때는 위 영역(머리줄·슬롯·저장)만 다시 그린 뒤 '편성됨' 상태가 바뀐 카드만 교체.
        //  화면 밖 카드는 ScrollList 가시성 클리핑으로 숨기고 초상은 보이는 카드만 로드(lazyPortraits). 스크롤 위치는 목록을 유지하므로 그대로
        const short = L.short;
        const note = makeText(this, 0, 24, '캠페인 출정은 편성 영웅(+ 필수·고정 영웅, 주인공) 안에서만 고를 수 있습니다.', { size: 12, color: CSS.muted, wrap: a.w });
        root.add(note);
        // 편성 슬롯 = 초상 카드(heroCard 비아트형: 초상 지연 로드 + 등급 표식 + 이름 1줄 + Lv + 공·방). 탭 = 빼기, 길게 = 영웅 상세
        //  높이 = 폭 + 76(초상 >= 50 + 공·방 줄 16). 가로 폰: 슬롯 폭 150 이상이면 가로형 카드(높이 64, 공·방 포함), 좁으면 기존 116 상한 초상 카드(공·방 생략)
        const sw0 = Math.floor((a.w - (max - 1) * 8) / max);
        const rowTop = short && sw0 >= 150;
        const sw = Math.min(rowTop ? 220 : 120, sw0); const sh = rowTop ? 64 : short ? Math.min(sw + 60, 116) : sw + 76;
        const sy = Math.max(52, Math.ceil(note.y + note.height + 8)); // 안내문이 2줄로 접히면(390) 슬롯 카드를 그 아래로
        const saveY = sy + sh + 10;
        const top = this.add.container(0, 0); root.add(top);
        root.add(fitText(makeText(this, 0, saveY + 20, '보유 영웅 (탭 = 넣기/빼기 · 길게 = 상세)', { size: 13, bold: true, color: CSS.text, origin: [0, 0.5] }), a.w - 150));
        const ly = saveY + 48; const listH = Math.max(60, a.h - ly);
        const list = new ScrollList(this, { x: 0, y: ly, w: a.w, h: listH, clip: true, bar: true });
        root.add(list);
        const sorted = [...pool].sort((x, y) => (Number(y.level) || 0) - (Number(x.level) || 0));
        const idOf = (h) => h.id ?? h.user_hero_id;
        let sync = () => {};
        const toggle = (id) => {
            if (ids.includes(id)) ids = ids.filter((x) => x !== id); else if (ids.length < max) ids = [...ids, id]; else { showToast(this, `편성은 최대 ${max}명입니다`); return; }
            sync();
        };
        const drawTop = () => {
            top.removeAll(true);
            const lv = ids.map((id) => Number(byId.get(id)?.level) || 0);
            const avg = lv.length ? (lv.reduce((x, y) => x + y, 0) / lv.length).toFixed(1) : '-';
            top.add(makeText(this, 0, 0, `편성 ${ids.length}/${max}  ·  평균 Lv.${avg}`, { size: 16, heading: true, color: '#f0d58c' }));
            for (let i = 0; i < max; i += 1) {
                const id = ids[i]; const h = id != null ? byId.get(id) : null;
                if (h) {
                    const card = rowTop ? this.heroRowCard(h, i * (sw + 8), sy, sw, sh, true, false) : this.heroCard(h, i * (sw + 8), sy, sw, sh, null, true, false, { stats: true });
                    this.pressCard(card, sw, sh, () => { ids = ids.filter((x) => x !== id); sync(); }, () => this.heroDetail(h));
                    card.portrait?.load();
                    top.add(card);
                } else {
                    const row = listRow(this, { x: i * (sw + 8), y: sy, w: sw, h: sh, selected: false });
                    row.add(makeText(this, sw / 2, sh / 2, '빈 칸', { size: 13, bold: true, color: CSS.muted, origin: [0.5, 0.5] }));
                    top.add(row);
                }
            }
            top.add(new Button(this, { x: a.w - 140, y: saveY, w: 140, h: 40, label: '편성 저장', variant: 'primary', size: 15, disabled: !ids.length, reason: '영웅을 1명 이상 넣어 주세요', onClick: async () => {
                try { const d = await gameApi.saveLineup(ids); ids = (d?.lineup ?? []).map((h) => h.user_hero_id); showToast(this, '편성을 저장했습니다'); sync(); } catch (e) { alertModal(this, '편성 저장 실패', messageOf(e)); }
            } }));
        };
        // 보유 영웅 카드 배치: 세로 폰 = 3열(기존), 가로 PC·태블릿 = 최소 폭 124 기준 3~10열 + 카드 한 장이 목록 높이 안에 들도록 열을 늘림, 가로 폰 = 가로형 카드(최소 폭 180, 높이 64)
        const gap = 8; const usable = a.w - 8; // 스크롤바 여유
        let cols; let cw; let ch;
        if (short) {
            cols = Math.max(1, Math.floor((usable + gap) / (180 + gap))); cw = Math.floor((usable - gap * (cols - 1)) / cols); ch = 64;
        } else {
            cols = L.portrait ? this.gridCols(usable, 104, gap, [4, 6], 3) : Math.max(3, Math.min(10, Math.floor((usable + gap) / (124 + gap)))); // 433(390)·400(360)·478(430) 논리 폭 모두 3열
            const size = () => { cw = Math.floor((usable - gap * (cols - 1)) / cols); ch = Math.round(cw * 0.95) + 80; }; // +80 = 이름·Lv 2줄 + 공·방 줄 + 하단 장식 여유
            size();
            while (!L.portrait && ch > listH - 8 && cw > 104 && cols < 12) { cols += 1; size(); }
        }
        const makeCard = (h, k) => {
            const id = idOf(h); const inL = ids.includes(id);
            const x = (k % cols) * (cw + gap); const y = Math.floor(k / cols) * (ch + gap);
            const card = short ? this.heroRowCard(h, x, y, cw, ch, inL) : this.heroCard(h, x, y, cw, ch, null, inL, false, { stats: true });
            if (inL) {
                card.add(this.add.rectangle(1, 1, cw - 2, ch - 2).setOrigin(0).setStrokeStyle(2, COLOR.accentLight, 1)); // 편성됨 = 테두리 강조
                if (!short) { // 편성됨 표식: 초상 아래쪽 가운데 금색 칩(가로형 카드는 heroRowCard 가 Lv 줄 오른쪽에 그림)
                    const py = card.portraitH ? card.portraitH : 20;
                    card.add(this.add.rectangle(cw / 2, py - 6, 46, 18, COLOR.accent, 0.95).setStrokeStyle(1, COLOR.ink, 1));
                    card.add(makeText(this, cw / 2, py - 6, '편성됨', { size: 11, bold: true, color: '#0B1020', origin: [0.5, 0.5] }));
                }
            }
            this.pressCard(card, cw, ch, () => toggle(id), () => this.heroDetail(h));
            card.inL = inL;
            return card;
        };
        const cards = new Map();
        sorted.forEach((h, k) => { const c = makeCard(h, k); cards.set(idOf(h), c); list.content.add(c); });
        list.setContentHeight(Math.ceil(sorted.length / cols) * (ch + gap));
        list.refreshMask?.();
        this.lazyPortraits(list); // 보이는 카드 초상만 로드
        sync = () => {
            if (!root.scene) return;
            drawTop();
            sorted.forEach((h, k) => {
                const id = idOf(h); const old = cards.get(id);
                if (!old || old.inL === ids.includes(id)) return;
                const c = makeCard(h, k); cards.set(id, c); list.content.add(c); old.destroy();
            });
            list.refreshMask?.();
        };
        drawTop();
    }

    // 가로 폰(L.short) 편성 탭 가로형 카드(2026-11-15): 좌 = 정사각 초상(등급 표식·병종 뱃지 겹침), 우 = Lv(+편성됨 칩) / 이름 / 공·방 3줄. 높이 64 기준
    // chip: '편성됨' 칩 표시(기본 = selected). 위쪽 편성 슬롯은 전부 편성 영웅이라 칩 생략 -> Lv 줄 폭 확보(844x390 'Lv...' 잘림, 강화면 2026-11-15)
    heroRowCard(hh, x, y, w, h, selected = false, chip = selected) {
        const c = this.add.container(x, y); c.clipH = h;
        c.add(slice(this, `${raritySlotKey(hh.rarity)}`, w, h, 'slot'));
        if (selected) c.add(this.add.rectangle(4, 4, w - 8, h - 8, COLOR.accentLight, 0.18).setOrigin(0));
        const ps = h - 12;
        c.portrait = portraitBox(this, hh, 6, 6, ps, ps, { lazy: true }); c.add(c.portrait);
        const rtag = this.rarityTag(hh.rarity, 8, 8, { size: 10, heading: true, color: rarityCss(hh.rarity), stroke: { color: '#0B1020', width: 3 } });
        const rw = rtag.cw ?? rtag.width ?? 0; if (rw > ps - 4) rtag.setScale((ps - 4) / rw);
        c.add(rtag);
        const ut = hh.unit_type ?? hh.detail?.unit_type;
        if (ut) {
            const tb = troopBadges(this, { heroClass: ut, troopClass: hh.troop_type ?? hh.detail?.troop_type, troopLabel: hh.troop_label ?? hh.detail?.troop_label, size: 14, vertical: false });
            const ts = Math.min(1, 16 / Math.max(1, tb.h), (ps - 4) / Math.max(1, tb.w)); if (ts < 1) tb.setScale(ts);
            tb.setPosition(6 + ps - 2 - tb.w * ts, 6 + ps - 2 - tb.h * ts);
            c.add(tb);
        }
        const tx = 6 + ps + 6; const tw = Math.max(20, w - tx - 6);
        const chipW = chip ? 44 : 0;
        c.add(fitText(shrinkToFit(makeText(this, tx, 14, heroLevelText(hh, { short: true }), { size: 12, bold: true, color: CSS.accent, origin: [0, 0.5] }), tw - (chipW ? chipW + 4 : 0), 10), tw - (chipW ? chipW + 4 : 0)));
        if (chip) {
            c.add(this.add.rectangle(w - 8 - chipW / 2, 14, chipW, 16, COLOR.accent, 0.95).setStrokeStyle(1, COLOR.ink, 1));
            c.add(makeText(this, w - 8 - chipW / 2, 14, '편성됨', { size: 11, bold: true, color: '#0B1020', origin: [0.5, 0.5] }));
        }
        c.add(fitText(shrinkToFit(makeText(this, tx, h / 2, heroPlainName(hh), { size: 14, bold: true, origin: [0, 0.5] }), tw, 12), tw, { fallback: heroShortName(hh) }));
        const sl = heroStatLine(this, heroStatsNow(hh), tx, h - 14, tw, { size: 12, align: 'left' }); if (sl) c.add(sl);
        return c;
    }

    async tabHero(p) {
        // 주인공(protagonist:true)은 영웅 카드 목록에서 제외 -> '주인공' 서브 탭(tabProtagonist)에서 스테이터스 확인(fe-proto 2026-11-03, 사용자 지시)
        const heroes = [...(await gameApi.heroes(!this.softShow))].filter((h) => !h.protagonist).sort((x, y) => compareRarity(x.rarity, y.rarity) || (y.level - x.level));
        if (!p.scene) return;
        this.done();
        const a = this.area;
        const list = new ScrollList(this, { x: a.x, y: a.y, w: a.w, h: a.h, clip: true, bar: true });
        p.add(list);
        if (!heroes.length) { list.content.add(emptyState(this, { w: a.w, msg: '보유 영웅이 없습니다', sub: '스테이지를 클리어하거나 뽑기로 영웅을 얻으세요.', cta: gachaOn() ? '뽑기로 이동' : '역사 시나리오로 이동', onCta: () => this.selectTab(gachaOn() ? 'gacha' : 'stage') })); return; }
        // 합성 프레임 고정 비율: 데스크톱 4~6열, 좁은 화면 2열. 편성의 작은 카드는 기존 UI 유지.
        const gap = 12;
        const usable = a.w - 8; // 우측 스크롤바(4px)가 마지막 열 테두리를 덮지 않게 여유
        // 가로 폰(L.short): 카드 한 장이 목록 높이 안에 들어가도록 높이 기준으로 열 수를 정한다(667x375 에서 2열 카드가 화면보다 길던 문제, 강화면 gacha43)
        const colsH = L.short ? Math.max(2, Math.ceil((usable + gap) / (Math.floor((a.h - 10) / HERO_CARD_RATIO) + gap))) : 0;
        const cols = L.short ? Math.min(8, colsH) : this.gridCols(usable, L.portrait ? 160 : 220, gap, [4, 6], 2);
        const cw = Math.floor((usable - gap * (cols - 1)) / cols);
        const ch = Math.round(cw * HERO_CARD_RATIO);
        const ox = Math.floor((usable - (cw * cols + gap * (cols - 1))) / 2); // 내림 나머지를 좌우로 나눠 열 정렬
        heroes.forEach((hh, i) => {
            const cx = ox + (i % cols) * (cw + gap); const cy = Math.floor(i / cols) * (ch + gap);
            list.content.add(this.heroCard(hh, cx, cy, cw, ch, () => this.heroDetail(hh), false, true));
        });
        list.setContentHeight(Math.ceil(heroes.length / cols) * (ch + gap));
        list.refreshMask();
        this.lazyPortraits(list);
    }

    // ---------- 주인공 스테이터스(영웅 그룹 서브 탭, fe-proto 2026-11-03) ----------
    // 데이터 = 영웅 목록(gameApi.heroes)의 protagonist:true 1건(새 API 없음). 본문은 영웅 상세와 같은 heroStatusBody, 하단 = 장비·열람 카드
    async tabProtagonist(p) {
        const hh = (await gameApi.heroes(!this.softShow)).find((h) => h.protagonist) ?? null;
        if (!p.scene) return;
        this.done();
        const a = this.area;
        if (!hh) { p.add(emptyState(this, { x: a.x, y: a.y, w: a.w, msg: '주인공이 아직 없습니다', sub: '캐릭터를 만들면 주인공 스테이터스를 볼 수 있습니다.', cta: '주인공 만들기', onCta: () => this.openProtoCard() })); return; }
        this.protoHero = hh;
        const btnH = 44; const gapB = 10;
        const bodyH = a.h - btnH - gapB - 4;
        this.heroStatusBody(p, hh, { x: a.x, y: a.y + 4, w: a.w, h: bodyH, wide: a.w >= 712 || L.short });
        const bw = Math.min(180, Math.floor((a.w - gapB) / 2)); const by = a.y + a.h - btnH;
        // 장비 변경 후: 모달이 닫히면 주인공 탭을 다시 그림(장비·능력치 갱신)
        const onChanged = () => {
            sessionCache.setHeroes(null);
            this.protoWait?.remove(false); // 씬 재시작 후 남은 참조여도 안전(중복 대기 방지)
            this.protoWait =this.time.addEvent({ delay: 300, loop: true, callback: () => { if (this.modalCount > 0) return; this.protoWait.remove(false); this.protoWait = null; if (this.sys.isActive() && this.tab === 'protagonist') this.show('protagonist'); } });
        };
        p.add(new Button(this, { x: a.x + a.w - bw, y: by, w: bw, h: btnH, label: '장비', variant: 'primary', size: 16, onClick: () => openEquipment(this, hh, onChanged, { onDetail: () => this.show('protagonist') }) }));
        p.add(new Button(this, { x: a.x + a.w - bw * 2 - gapB, y: by, w: bw, h: btnH, label: '열람 카드', size: 16, onClick: () => this.openProtoCard() }));
        // 주인공 이름: 서브 탭 줄 오른쪽 빈 자리에 오른쪽 정렬. 자리가 부족하면 생략
        //  서브 탭 폭 = 실제 서브 탭 수 x 120|160(refreshSubTabs 와 같은 식). 이전엔 2개로 가정해 영웅 그룹 5칸(390)에서 '인벤토리' 위에 이름이 겹쳤다(강화면 2026-11-14)
        const subN = groupsOn() ? Math.max(2, subTabsOf(groupOf(this.tab)).length) : 2;
        const nameW = p.w - (this.subTabs?.scene ? this.subTabs.x + Math.min(p.w, subN * (L.portrait ? 120 : 160)) : 160) - 12;
        if (nameW >= 60) p.add(fitText(makeText(this, p.w, 16, heroPlainName(hh), { size: 15, bold: true, color: CSS.accent, origin: [1, 0.5], stroke: { color: '#0B1020', width: 3 } }), nameW, { fallback: heroShortName(hh) }));
    }

    // 등급 표식: 도트 badge.rarity.<R> + 별(pix.star/star_empty). 아틀라스 없으면 기존 텍스트(S ★★★★). 좌상단 (x, y)
    rarityTag(rarity, x, y, textStyle) { return heroRarityTag(this, rarity, x, y, textStyle); } // ui/HeroDetailView 공용

    // Lv 표식(pix.level + 숫자, 가운데 정렬 cx, cy). 아틀라스 없으면 텍스트. 영웅 코스트는 2026-11-08 사용자 요청으로 영웅 정보 화면에서 제거(편성 화면에서만 표시)
    // maxW: 좁은 카드(390 편성 슬롯)에서 'Lv.N/M' 이 카드 테두리에 닿지 않게 폭 상한(넘치면 축소)
    lvTag(hh, cx, cy, size, maxW = 0) {
        const lv = pixelLabel(this, 'pix.level', heroLevelText(hh, { short: true }), makeText, { size: size + 2, textStyle: { color: CSS.accent } });
        if (!lv) return shrinkToFit(makeText(this, cx, cy, heroLevelText(hh, { short: true }), { size, color: CSS.accent, origin: [0.5, 0.5] }), maxW || Infinity, 9);
        const c = this.add.container(0, 0);
        const lw = lv.w; // Phaser 4 Container.setPosition 이 .w 를 0 으로 덮어써 먼저 보관
        const s = maxW > 0 && lw > maxW ? maxW / lw : 1;
        if (s < 1) lv.setScale(s);
        lv.setPosition(cx - (lw * s) / 2, cy);
        c.add(lv);
        return c;
    }

    // opts.stats: 초상 카드 Lv 아래에 공·방 한 줄(ui/heroStats, 편성 탭 2026-11-15). 초상 50 이상을 지킬 수 있을 때만(못 지키면 생략)
    heroCard(hh, x, y, w, h, onClick, selected = false, art = false, opts = {}) {
        const c = (art && heroMenuCard(this, hh, x, y, w, h, selected)) || this.add.container(x, y);
        c.clipH = h;
        let badgeMaxH = h - 16; // 병종 뱃지 세로 상한(초상 카드 = 초상 영역 안, 아래 칭호·이름을 가리지 않게)
        if (!c.cardArt) {
        const bg = slice(this, `${raritySlotKey(hh.rarity)}`, w, h, 'slot');
        c.add(bg);
        if (selected) c.add(this.add.rectangle(4, 4, w - 8, h - 8, COLOR.accentLight, 0.18).setOrigin(0));
        const stv = opts.stats ? heroStatsNow(hh) : null;
        const statH = stv && h - 6 - 58 - 16 >= 50 ? 16 : 0; // 공·방 줄 높이
        const sub = hh.title && h - 6 - 70 - statH >= 50 ? hh.title : ''; // U14: 칭호는 이름 위 부제(공간 있을 때만)
        const ph = h - 6 - 58 - (sub ? 12 : 0) - statH; // 초상화 높이(아래 이름·Lv 2줄 48 + 하단 프레임 장식 여유 10, Low-3: Lv 줄이 장식에 잘림). 병종은 우상단 뱃지로
        c.portraitH = ph >= 50 ? ph : 0;
        if (ph >= 50) {
            badgeMaxH = ph - 4;
            // 초상화 카드: 초상화(지연 로드, 폴백 스프라이트/이니셜) + 등급 배지 + 이름·칭호 + Lv
            c.portrait = portraitBox(this, hh, 6, 6, w - 12, ph, { lazy: true }); // 보이는 카드만 로드(lazyPortraits)
            c.add(c.portrait);
            const rtag = this.rarityTag(hh.rarity, 10, 9, { size: 12, heading: true, color: rarityCss(hh.rarity), stroke: { color: '#0B1020', width: 3 } });
            if (w < 110 && rtag.cw > w - 20) rtag.setScale((w - 20) / rtag.cw); // 좁은 카드(390 편성 슬롯 75폭): 등급 별이 카드 오른쪽 밖으로(강화면 a27n Low)
            c.add(rtag);
            let ny = ph + 6;
            if (sub) { c.add(fitText(makeText(this, w / 2, ny + 8, sub, { size: 12, color: CSS.muted, origin: [0.5, 0.5] }), w - 12)); ny += 12; }
            c.add(fitText(makeText(this, w / 2, ny + 14, heroPlainName(hh), { size: w < 130 ? 13 : 15, bold: true, origin: [0.5, 0.5] }), w - 10, { fallback: heroShortName(hh) }));
            c.add(this.lvTag(hh, w / 2, ny + 30, 12, w - 14));
            if (statH) { const sl = heroStatLine(this, stv, w / 2, ny + 46, w - 10, { size: w < 110 ? 11 : 12 }); if (sl) c.add(sl); }
        } else {
            c.add(this.rarityTag(hh.rarity, 10, 12, { size: 12, heading: true, color: rarityCss(hh.rarity) }));
            // 칭호 포함 표시 이름(최대 2줄, 넘치면 칭호 생략형 → 말줄임)
            c.add(fitText(makeText(this, w / 2, h / 2 - 2, heroPlainName(hh), { size: 16, bold: true, origin: [0.5, 0.5], wrap: w - 12, align: 'center' }), w - 12, { maxLines: 2, fallback: heroShortName(hh) }));
            c.add(this.lvTag(hh, w / 2, h - 24, 13));
        }
        }
        if (onClick) {
            const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerup', (pt) => { if (this.modalCount > 0 || pt.getDistance() > 12) return; onClick(); });
            c.add(hit);
        }
        if (c.troopBadges) c.bringToTop(c.troopBadges);
        // 병종 뱃지(우상단, 등급 줄 맞은편): 영웅 본체(원형 금테) + 병사(방패형 은청 테). 좁은 카드는 세로로 쌓고 크기 축소. 클릭 영역 위(툴팁)
        const ut = hh.unit_type ?? hh.detail?.unit_type;
        if (ut && !c.cardArt) {
            const tl = hh.troop_label ?? hh.detail?.troop_label;
            const tt = hh.troop_type ?? hh.detail?.troop_type;
            // 아주 좁은 초상 카드(w < 110, 390 편성 슬롯): 우상단 세로 2개가 초상 얼굴을 덮음(강화면 a27n Low) -> 작게 가로로, 초상 아래쪽 모서리(얼굴 아래)에 둔다
            const tiny = w < 110 && badgeMaxH < h - 16;
            const vertical = !tiny && w < 140;
            const bs = tiny ? 14 : Math.round(Math.max(18, Math.min(30, w * (vertical ? 0.19 : 0.17))));
            const tb = troopBadges(this, { heroClass: ut, troopClass: tt, troopLabel: tl, size: bs, vertical });
            // 도트 뱃지는 정수 배율로 맞춰져 요청 크기보다 커질 수 있다(390 편성 슬롯 75폭: 세로 2개가 초상 아래 칭호·이름까지 내려와 겹침, 강화면 2026-11-14) -> 상한 안으로 축소
            const ts = Math.min(1, (tiny ? 16 : badgeMaxH) / Math.max(1, tb.h), (w - 16) / Math.max(1, tb.w));
            if (ts < 1) tb.setScale(ts);
            tb.setPosition(w - 8 - tb.w * ts, tiny ? 6 + badgeMaxH + 4 - tb.h * ts - 2 : 8);
            c.add(tb);
        }
        return c;
    }

    // 카드 탭/길게 누르기(편성 탭 초상 카드): 탭(이동 12 이하) = onTap, 450ms 누름 = onHold(영웅 상세). 스크롤 드래그·모달 중에는 무시
    pressCard(c, w, h, onTap, onHold) {
        const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        let t = null; let held = false;
        const cancel = () => { t?.remove(false); t = null; };
        hit.on('pointerdown', () => { held = false; cancel(); t = this.time.delayedCall(450, () => { t = null; if (this.modalCount > 0 || !hit.scene) return; held = true; onHold(); }); });
        hit.on('pointermove', (pt) => { if (pt.isDown && (pt.getDistance() > 12 || scrollDragged(pt))) cancel(); });
        hit.on('pointerout', cancel);
        hit.on('pointerup', (pt) => { cancel(); if (held || this.modalCount > 0 || pt.getDistance() > 12 || scrollDragged(pt)) return; onTap(); });
        c.add(hit);
        return hit;
    }

    heroDetail(hh) {
        // 레이아웃: 와이드 = 좌(큰 초상화 + 전투 유닛 스프라이트) / 우(섹션 카드 스크롤: 2열 + 전폭 표), 좁은 화면 = 상(초상화·스프라이트) / 하(섹션 1열)
        // 섹션: 기본 정보 · 능력치 · 병종 · 장비 (라벨-값 표) / 스킬 (표) / 역사적 설명 (라벨-값 + 요약 박스, 서버 미제공 시 숨김)
        // 주인공(서버 protagonist:true): '열람 카드' = 초상화 변경(PUT face)·다시 작성(재검사) 진입. 돌아오면 주인공 탭(영웅 카드 목록에서는 주인공 제외)
        const protoBtn = hh.protagonist ? [{ label: '열람 카드', onClick: () => this.openProtoCard() }] : [];
        openHeroDetail(this, hh, { buttons: [...protoBtn, { label: '장비', variant: 'primary', onClick: () => openEquipment(this, hh, () => sessionCache.setHeroes(null), { onDetail: () => this.heroDetail(hh) }) }, { label: '닫기' }] }); // 모달·본문 = ui/HeroDetailView
    }

    // 주인공 열람 카드(초상화 변경·다시 작성) 진입. 돌아오면 주인공 탭 + 영웅 목록 재조회(초상화 갱신)
    openProtoCard() { sessionCache.setHeroes(null); openCharacterCreate(this, { mode: 'create', next: { scene: 'Lobby', data: { tab: 'protagonist' } } }); }

    // 영웅 스테이터스 본문(초상화·스프라이트 + 기본 정보·능력치·(오라)·장비·스킬·역사 섹션). 영웅 상세 모달과 주인공 탭이 공용
    // tgt: 담을 컨테이너, (ix, iy, iw, bodyH): 영역, wideM: 좌우 배치 여부
    heroStatusBody(tgt, hh, opts) { return heroStatusBody(this, tgt, hh, opts); } // 본문 = ui/HeroDetailView(출전 배치 (i) 와 공용)

    // 영웅 상세 '역사적 설명' 섹션 카드(heroDetail 의 section 빌더 사용). open: 요약 펼침 여부, onToggle: '더 보기/접기'
    // 영웅 상세 '역사적 설명' 섹션 카드 -> ui/HeroDetailView.heroHistorySection
    historySection(pf, tw, section, opts = {}) { return heroHistorySection(this, pf, tw, section, opts); }

    // ---------- 방 대전 ----------
    async tabRoom(p) {
        const a = this.area;
        // 시즌 전쟁 진입(제목 줄 오른쪽, 기존 Button). 국가 선택·시즌 지도는 scenes/War.js
        if (!groupsOn()) p.add(new Button(this, { x: p.w - 150, y: -6, w: 150, h: 44, label: FEATURES.seasonWar ? '시즌 전쟁' : '시즌 전쟁 · 오픈 예정', variant: FEATURES.seasonWar ? 'primary' : undefined, size: FEATURES.seasonWar ? 15 : 13, onClick: () => this.show('war') })); // 그룹 모드는 멀티 > 시즌 전쟁 서브 탭
        p.add(new Button(this, { x: p.w - (groupsOn() ? 0 : 158) - 110, y: -6, w: 110, h: 44, label: '내 전적', size: 15, onClick: () => openRecord(this) })); // 개인 PvP 전적(ui/RecordPanel.js)
        // U11: 좁은 화면(두 줄) = [방 만들기][새로고침] / [입장 코드 입력][참가]. 입력칸은 버튼과 같은 높이 48(같은 줄 규격 통일)
        const nb = a.w < 600;
        const bw = nb ? Math.floor((a.w - 8) / 2) : Math.min(150, (a.w - 16) / 3);
        p.add(new Button(this, { x: a.x, y: a.y, w: bw, h: 48, label: '방 만들기', variant: 'primary', size: 15, onClick: () => this.createRoom() }));
        p.add(new Button(this, { x: a.x + bw + 8, y: a.y, w: bw, h: 48, label: '새로고침', size: 15, onClick: () => this.show('room') }));
        const ry = nb ? a.y + 56 : a.y;
        const inputW = nb ? a.w - 96 : Math.min(200, a.w - (bw + 8) * 2 - 96);
        const ix = nb ? a.x : a.x + (bw + 8) * 2;
        const inp = new DomInput(this, { x: this.panel.x + ix, y: this.panel.y + ry, w: inputW, h: 48, placeholder: '입장 코드 8자', maxLength: 8, autocomplete: 'off', ariaLabel: '입장 코드', onEnter: () => join() });
        this.inputs.push(inp);
        const join = async () => {
            const code = inp.value.trim().toUpperCase();
            if (!/^[A-Z0-9]{8}$/.test(code)) { showToast(this, '입장 코드는 영문·숫자 8자입니다.'); return; }
            try { const st = await gameApi.rooms.join(code); this.scene.start('Room', { code: st.room.code, state: st }); }
            catch (e) { alertModal(this, '참가 실패', messageOf(e)); }
        };
        p.add(new Button(this, { x: ix + inputW + 8, y: ry, w: 88, h: 48, label: '참가', size: 15, onClick: join }));
        bindInputsToModal(this, this.inputs);
        const rooms = await gameApi.rooms.list();
        if (!p.scene || this.tab !== 'room') return;
        this.done();
        const ly = ry + 56 + 4; // 목록 설명 문구 제거(2026-11-02 화면 정리)
        const list = new ScrollList(this, { x: a.x, y: ly, w: a.w, h: a.h - (ly - a.y), clip: true, bar: true });
        p.add(list);
        if (!rooms.length) list.content.add(emptyState(this, { w: a.w, msg: '대기 중인 공개 방이 없습니다', sub: '방을 직접 만들어 친구에게 입장 코드를 알려 주세요.', cta: '방 만들기', onCta: () => this.createRoom() }));
        const rowH = 60; const gap = 8;
        const cols = this.gridCols(a.w, 380, gap, [2, 4], 1);
        const rw = Math.floor((a.w - gap * (cols - 1)) / cols);
        rooms.forEach((r, i) => {
            const row = listRow(this, { x: (i % cols) * (rw + gap), y: Math.floor(i / cols) * (rowH + gap), w: rw, h: rowH, onClick: async () => {
                try { const st = await gameApi.rooms.join(r.code); this.scene.start('Room', { code: st.room.code, state: st }); }
                catch (e) { alertModal(this, '참가 실패', messageOf(e)); }
            } });
            row.add(fitText(makeText(this, 14, rowH / 2, `${r.host}  ·  ${r.mode.toUpperCase()}${sizePartyText(r) ? `  ·  ${sizePartyText(r)}` : ''}  ·  턴 ${r.turn_limit_seconds}초`, { size: 16, bold: true, origin: [0, 0.5] }), rw - 140));
            row.add(makeText(this, rw - 14, rowH / 2, `코드 ${r.code}`, { size: 14, color: CSS.accent, origin: [1, 0.5] }));
            list.content.add(row);
        });
        list.setContentHeight(Math.ceil(rooms.length / cols) * (rowH + gap));
        list.refreshMask();
    }

    // 방 만들기: 모드·공개 범위 + 맵 선택(MapPicker: 필터·랜덤·선택 시 미리보기). 선택값은 map_code 로 전송(목록 실패 시 생략 = 서버 기본)
    createRoom() {
        let mode = 'solo'; let vis = 'private';
        let fol = false; // 방 옵션 follow_troops(병사 자동 따라가기). 기본 해제, 양 플레이어 동일 적용(랭크 방은 서버가 항상 false)
        let picker = null;
        let busy = false;
        const mw = Math.min(920, L.lw - 24); const mh = Math.min(700, L.lh - 24);
        const m = new Modal(this, { title: '방 만들기', w: mw, h: mh, onClose: () => { picker?.destroy(); picker = null; }, buttons: [{ label: '취소' }, { label: '만들기', variant: 'primary', keepOpen: true, onClick: async () => {
            if (busy) return;
            busy = true;
            try { const st = await gameApi.rooms.create(mode, vis, picker?.value() ?? null, { followTroops: fol }); m.close(); this.scene.start('Room', { code: st.room.code, state: st }); }
            catch (e) {
                busy = false;
                console.warn('[rooms] 생성 실패', errorTag(e));
                if (e?.code === 'invalid_map' || e?.code === 'map_not_allowed') { alertModal(this, '맵 선택 확인', messageOf(e)); picker?.reload(); return; } // 모달 유지: 다른 맵 선택
                m.close(); alertModal(this, '생성 실패', messageOf(e));
            }
        } }] });
        const iw = mw - 48;
        const wide = iw >= 640;
        const tw = wide ? Math.floor((iw - 16) / 2) : iw;
        // 2026-11-06 정리: 모드·공개 범위 = [라벨] + 작은 칩(높이 32, 장식 테두리 없음), 병사 자동 따라가기 = 토글 스위치 1개(라벨·보조문구 옆)
        const rowH = 32;
        const group = (gx, gy, label, items, active, onChange) => {
            const t = makeText(this, gx, gy + rowH / 2, label, { size: 13, color: CSS.muted, origin: [0, 0.5] });
            m.inner.add(t);
            const cx = gx + Math.ceil(t.width) + 10;
            m.inner.add(new Chips(this, { x: cx, y: gy, w: gx + tw - cx, h: rowH, size: 13, modal: true, items, active, onChange }));
        };
        group(24, 0, '모드', [{ key: 'solo', label: '솔로(컴퓨터 대전)' }, { key: 'pvp', label: 'PvP(2인)' }], mode, (k) => { mode = k; picker?.setMode(k); });
        const vx = wide ? 24 + tw + 16 : 24; const vy = wide ? 0 : rowH + 12;
        group(vx, vy, '공개 범위(PvP)', [{ key: 'private', label: '비공개(코드 입장)' }, { key: 'public', label: '공개 목록' }], vis, (k) => { vis = k; });
        // 짧은 높이(가로 폰, L.short) + 모드·공개 한 줄(wide): 토글을 MapPicker 크기 칩 줄 왼쪽('맵 선택' 제목 자리)에 두고 구분선·제목 생략,
        // 맵 목록 높이는 하단 버튼 줄 위까지 정확히 계산(220 하한 때문에 목록이 [취소]/[만들기] 밑으로 깔리던 문제, 강화면 gacha133 667x375). 그 외 화면은 기존 배치 그대로
        if (L.short && wide) {
            const py = vy + rowH + 10;
            const fcb = new Checkbox(this, { x: 24, y: py + 1, label: '병사 자동 따라가기', checked: fol, size: 14, modal: true, onChange: (b) => { fol = b; } });
            fcb.text.setFontStyle('bold');
            m.inner.add(fcb);
            const fsx = 24 + 62 + Math.ceil(fcb.text.width) + 12;
            const fsub = makeText(this, fsx, py + 15, '양 플레이어에게 동일하게 적용', { size: 12, color: CSS.muted, origin: [0, 0.5] });
            if (fsx + fsub.width <= 24 + iw - 290) m.inner.add(fsub); else fsub.destroy(); // 크기 칩 줄(약 270)과 겹치면 보조문구 생략
            const btnTop = m.panel.h - Math.max(48, MIN_TOUCH) - 24 - (m.panel.bodyY + 12); // Modal 버튼 줄 top(inner 좌표)
            // clip: 목록 높이가 행(52+6) 배수가 아니라 경계에 걸친 행(3번째 카드)이 가시성 클리핑으로 버튼 밑까지 4~5px 보이던 문제(강화면 k134 667x375) -> 픽셀 클리핑
            picker = new MapPicker(this, m.inner, { x: 24, y: py, w: iw, h: Math.max(96, btnTop - py - 10), mode, clip: true });
            return;
        }
        // 병사 자동 따라가기: 토글(Checkbox 스킨) + 굵은 라벨, 보조문구는 같은 줄 오른쪽(폭이 모자라면 아래 줄). 값 fol -> followTroops 전송은 그대로
        const fy = vy + rowH + 14;
        const fcb = new Checkbox(this, { x: 24, y: fy, label: '병사 자동 따라가기', checked: fol, size: 14, modal: true, onChange: (b) => { fol = b; } });
        fcb.text.setFontStyle('bold');
        m.inner.add(fcb);
        const fsx = 24 + 62 + Math.ceil(fcb.text.width) + 12;
        const fsub = makeText(this, fsx, fy + 14, '양 플레이어에게 동일하게 적용', { size: 12, color: CSS.muted, origin: [0, 0.5] });
        let fb = fy + 28;
        if (fsx + fsub.width > 24 + iw) { fsub.setPosition(24 + 62, fy + 36); fb = fy + 46; }
        m.inner.add(fsub);
        // 구분선 + 맵 선택 라벨(하단 버튼 바와 16 여백: 제목·버튼 줄 = 약 170 + 16)
        m.inner.add(this.add.rectangle(24, fb + 12, iw, 1, COLOR.accent, 0.25).setOrigin(0));
        // '맵 선택' 제목은 MapPicker 크기 칩 줄(오른쪽 정렬, 높이 30)과 같은 줄 왼쪽
        const py = fb + 24;
        m.inner.add(makeText(this, 24, py + 15, '맵 선택', { size: 14, bold: true, color: CSS.text, origin: [0, 0.5] }));
        picker = new MapPicker(this, m.inner, { x: 24, y: py, w: iw, h: Math.max(220, mh - py - 186), mode });
    }

    // ---------- 뽑기(가챠) ----------
    // 서버 추첨·멱등. 클릭 1회 = request_id 1개, 재시도 가능한 오류(네트워크·5xx·gacha_conflict)면 같은 횟수 재시도에 같은 ID 재사용.
    async tabGacha(p) {
        // 소환 전용 화면(scenes/Gacha.js, 2026-11-03). 롤백: localStorage srpg.gachaScene=0 -> 아래 기존 탭 화면
        // 2026-11-03: 별도 화면 전환 대신 로비 위 오버레이(scene.launch) — 상단 바·하단 탭은 로비가 그대로 그린다. 다른 탭·씬 전환 때 stopGachaOverlay
        const focus = this.gachaFocus; this.gachaFocus = null; // 출정 불가 안내에서 온 경우만 해당 배너 선택(1회)
        if (gachaSceneOn()) {
            this.done();
            this.stopGachaOverlay();
            this.scene.launch('Gacha', { ...(focus?.sel ? { sel: focus.sel } : {}), focusBlocking: !!focus?.focusBlocking, rect: { y: this.barH, h: Math.max(240, L.lh - this.barH - this.tabH), x: this.railW || 0, w: L.lw - (this.railW || 0), logo: this.logoBox ? { x: this.logoBox.x, r: this.logoBox.x + this.logoBox.w, bottom: this.logoBox.bottom } : null }, backTab: this.preGachaTab ?? 'stage' }); // x·w = 왼쪽 세로 레일 오른쪽부터 화면 끝까지
            return;
        }
        const info = await gameApi.gacha.info();
        if (!p.scene || this.tab !== 'gacha') return;
        this.done();
        this.gachaInfo = info;
        if (session.profile && Number.isFinite(info.gold) && session.profile.gold !== info.gold) sessionCache.setProfile({ ...session.profile, gold: info.gold });
        const a = this.area;
        const gold = info.gold ?? 0;
        const price = { 1: info.price?.single ?? 0, 10: info.price?.ten ?? 0 };
        const gw = Math.min(a.w, 860); // 뽑기는 가운데 섹션 카드(가독성), 바깥 창 없음
        const top = this.add.container(a.x + (a.w - gw) / 2, a.y + 8);
        p.add(top);
        const gi = icon(this, 'gold', 24);
        if (gi) top.add(gi.setPosition(12, 22));
        top.add(makeText(this, gi ? 30 : 0, 22, `보유 골드 ${fmtNum(gold)}`, { size: 20, bold: true, color: CSS.accent, origin: [0, 0.5] }));
        top.add(new Button(this, { x: gw - 130, y: 0, w: 130, h: 44, label: '확률 보기', size: 16, onClick: () => this.gachaRates(info) }));
        let y = 58;
        const rule = pityRuleText(info.pity);
        if (rule) { const t = noteText(this, 0, y, `보장: ${rule}`, { kind: 'info', size: 15, wrap: gw }); top.add(t); y += t.height + 6; }
        if (info.pity) {
            const mr = info.pity.min_rarity ?? 'A';
            const t = makeText(this, 0, y, `천장 진행도: ${mr} 이상 연속 미출현 ${fmtNum(info.pity.progress)}회`, { size: 15, color: CSS.text, wrap: gw });
            top.add(t); y += t.height + 14;
        }
        const bw = Math.min(280, (gw - 12) / 2);
        const bx = (gw - (bw * 2 + 12)) / 2;
        this.gachaBtns = {};
        [1, 10].forEach((n, i) => {
            const short = gold < price[n];
            const b = new Button(this, { x: bx + i * (bw + 12), y, w: bw, h: 64, label: `${n === 1 ? '1회' : '10연'} 뽑기 (${fmtNum(price[n])} 골드)`, size: 17, variant: n === 10 ? 'primary' : 'default',
                disabled: short || this.gachaBusy, reason: short ? `골드가 부족합니다. (필요 ${fmtNum(price[n])}, 보유 ${fmtNum(gold)})` : '', onClick: () => this.gachaPull(n) });
            b.short = short;
            this.gachaBtns[n] = b;
            top.add(b);
        });
        y += 64 + 10;
        if (gold < price[1]) { const t = noteText(this, 0, y, '골드가 부족합니다. 스테이지를 클리어해 골드를 모아 주세요.', { kind: 'error', size: 14, wrap: gw }); top.add(t); y += t.height + 6; }
        else if (gold < price[10]) { const t = noteText(this, 0, y, `10연 뽑기에는 ${fmtNum(price[10])} 골드가 필요합니다.`, { kind: 'error', size: 14, wrap: gw }); top.add(t); y += t.height + 6; }
        const heroes = info.heroes ?? [];
        const lines = [`뽑기 대상 영웅 ${heroes.length}명 · 보유 ${heroes.filter((h) => h.owned).length}명`, '이미 보유한 영웅이 나오면 등급별 조각으로 지급됩니다. 조각 사용(돌파)은 준비 중입니다.'];
        const lt = makeText(this, 0, y + 6, lines.join('\n'), { size: 14, color: CSS.muted, wrap: gw });
        top.add(lt);
        top.addAt(this.sectionBg(-10, -14, gw + 20, y + 6 + lt.height + 30), 0);
    }

    // ---------- 시즌 전쟁(2026-11-03 사용자 요청: 다른 화면처럼 상단 바·하단 탭 유지) ----------
    // 본문 판(서브 탭 아래 ~ 하단 탭 위) 안에 War 씬을 오버레이로 띄운다(Gacha 와 같은 방식). War 씬 전환(전투 등)은 로비를 통해(War.go)
    async tabWar(p) {
        this.done();
        this.stopWarOverlay();
        const y = (this.contentTop ?? this.barH + (this.panelM ?? 12)) + p.bodyY - 6;
        const bottom = L.lh - this.tabH - 8;
        this.scene.launch('War', { rect: { y, h: Math.max(240, bottom - y), x: this.railW || 0, w: L.lw - (this.railW || 0) } });
    }

    stopWarOverlay() {
        const sc = this.scene.get('War');
        if (sc?.sys && (sc.sys.isActive() || sc.sys.isPaused())) this.scene.stop('War');
    }

    stopGachaOverlay() {
        const sc = this.scene.get('Gacha');
        if (sc?.sys && (sc.sys.isActive() || sc.sys.isPaused())) this.scene.stop('Gacha');
    }

    setGachaBusy(b) {
        this.gachaBusy = b;
        Object.values(this.gachaBtns ?? {}).forEach((btn) => { if (btn.scene) btn.setDisabled(b || btn.short); });
    }

    async gachaPull(count) {
        if (this.gachaBusy) return; // 이중 클릭 방지
        this.gachaPending ??= {};
        const rid = (this.gachaPending[count] ??= newGachaRequestId());
        this.setGachaBusy(true);
        let res = null;
        try {
            res = await gameApi.gacha.pull(count, rid);
            delete this.gachaPending[count];
        } catch (e) {
            const retryable = e.code === 'network' || e.code === 'timeout' || e.code === 'gacha_conflict' || e.code === 'db_busy' || e.status >= 500;
            if (!retryable) delete this.gachaPending[count];
            this.setGachaBusy(false);
            if (!this.sys.isActive()) return;
            if (retryable) {
                new Modal(this, { title: '뽑기 실패', body: `${messageOf(e)}\n같은 요청으로 다시 시도하므로 골드가 두 번 차감되지 않습니다.`, w: 480, h: 290,
                    buttons: [{ label: '닫기', onClick: () => { if (this.tab === 'gacha') this.show('gacha'); } }, { label: '다시 시도', variant: 'primary', onClick: () => this.gachaPull(count) }] });
            } else {
                alertModal(this, '뽑기 실패', messageOf(e), () => {
                    if (e.code === 'gacha_disabled') gameApi.profile(true).then(() => this.syncGachaTab()).catch(() => {});
                    else if (this.tab === 'gacha') this.show('gacha');
                });
            }
            return;
        }
        this.setGachaBusy(false);
        if (this.sys.isActive()) this.gachaResult(res);
    }

    // 결과: 카드 뒷면 → 순차 공개(연출 끄기면 즉시). '건너뛰기'로 전부 즉시 공개.
    gachaResult(r) {
        const results = r?.results ?? [];
        const multi = results.length > 1;
        const W = Math.min(multi ? 760 : 420, L.lw - 24);
        const H = Math.min(multi ? 600 : 480, L.lh - 24);
        const timers = [];
        const cards = [];
        const revealAll = () => { timers.forEach((t) => t.remove(false)); cards.forEach((c) => c.reveal(true)); };
        const m = new Modal(this, { title: multi ? `${results.length}연 뽑기 결과` : '뽑기 결과', w: W, h: H,
            buttons: [{ label: '건너뛰기', keepOpen: true, onClick: revealAll }, { label: '확인', variant: 'primary' }],
            onClose: () => { timers.forEach((t) => t.remove(false)); if (this.sys.isActive() && this.tab === 'gacha') this.show('gacha'); } });
        const iw = W - 48;
        const innerH = H - (m.panel.bodyY + 12) - 84;
        const summary = [r.currency === 'pen' ? `펜 -${fmtNum(r.pen_spent)} · 남은 펜 ${fmtNum(r.pen)}` : `골드 -${fmtNum(r.gold_spent)} · 남은 골드 ${fmtNum(r.gold)}`]; // 결제 통화(서버 currency: pen 기본, gold 롤백)
        if (r.pity?.guarantee_applied) summary.push(`${this.gachaInfo?.pity?.min_rarity ?? 'A'} 이상 보장 적용`);
        if (r.replay) summary.push('이전 요청 결과');
        const sumT = makeText(this, 24, 0, summary.join(' · '), { size: 14, color: CSS.muted, wrap: iw });
        m.inner.add(sumT);
        const top = sumT.height + 10;
        const cols = multi ? 5 : 1;
        const rows = Math.ceil(results.length / cols) || 1;
        const gap = 8;
        const cw = Math.floor(Math.min(multi ? 136 : 200, (iw - gap * (cols - 1)) / cols));
        const ch = Math.floor(Math.max(90, Math.min(cw * 1.45, (innerH - top - gap * (rows - 1)) / rows)));
        const gx = 24 + (iw - (cw * cols + gap * (cols - 1))) / 2;
        results.forEach((res, i) => {
            const c = this.gachaCard(res, gx + (i % cols) * (cw + gap), top + Math.floor(i / cols) * (ch + gap), cw, ch);
            m.inner.add(c);
            cards.push(c);
        });
        if (isInstant()) { revealAll(); return; }
        cards.forEach((c, i) => timers.push(this.time.delayedCall(250 + i * 160, () => c.reveal(false))));
    }

    // 결과 카드 1장. 컨테이너 원점 = 카드 위쪽 가운데(가로 뒤집기 연출용)
    gachaCard(res, x, y, w, h) {
        const c = this.add.container(x + w / 2, y);
        const ox = -w / 2;
        const col = rarityColor(res.rarity);
        const back = this.add.container(0, 0);
        // 카드 뒷면: 이미지 스킨 card.back(있으면), 없으면 기존 사각형 + '?'
        const cb = skinImage(this, 'card.back');
        if (cb) back.add(cb.setOrigin(0).setPosition(ox, 0).setDisplaySize(w, h));
        else {
            back.add(this.add.rectangle(ox, 0, w, h, COLOR.navyDeep, 1).setOrigin(0).setStrokeStyle(2, COLOR.accent, 0.8));
            back.add(makeText(this, 0, h / 2, '?', { size: Math.round(Math.min(w, h) * 0.35), bold: true, color: CSS.accent, origin: [0.5, 0.5] }));
        }
        const front = this.add.container(0, 0).setVisible(false);
        const fr = slice(this, raritySlotKey(res.rarity), w, h, 'slot').setPosition(ox, 0);
        front.add(fr);
        if (!fr.skinAtlas) front.add(this.add.rectangle(ox + 1, 1, w - 2, h - 2, 0, 0).setOrigin(0).setStrokeStyle(2, col, 1));
        // S 등급 장식(frame.rank.s.ornament): 288px 프레임 기준 오프셋(-12, -45)을 카드 폭 비율로
        const orn = String(res.rarity).toUpperCase() === 'S' ? skinImage(this, 'frame.rank.s.ornament') : null;
        const ornLayer = orn ? (() => { const k = w / 288; orn.setOrigin(0).setScale(k).setPosition(ox - 12 * k, -45 * k); return orn; })() : null;
        const ps = Math.floor(Math.min(w - 16, h * 0.52));
        const py = 8;
        const pc = this.add.container(0, 0);
        front.add(pc);
        const drawPortrait = (tex) => {
            if (!pc.scene) return;
            pc.removeAll(true);
            if (tex && this.textures.exists(tex)) {
                const img = this.add.image(0, 0, tex).setOrigin(0, 0);
                const fw = img.frame.realWidth; const fh = img.frame.realHeight;
                const side = Math.min(fw, fh);
                const cx = (fw - side) / 2; const cy = Math.max(0, Math.min(fh - side, fh * 0.04)); // 상단 중심 정사각형(얼굴)
                const s = ps / side;
                img.setCrop(cx, cy, side, side).setScale(s).setPosition(-ps / 2 - cx * s, py - cy * s);
                pc.add(img);
            } else {
                pc.add(this.add.rectangle(-ps / 2, py, ps, ps, col, 0.35).setOrigin(0));
                pc.add(makeText(this, 0, py + ps / 2, heroPlainName(res).slice(0, 1), { size: Math.round(ps * 0.45), bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 4 } }));
            }
            pc.add(this.add.rectangle(-ps / 2, py, ps, ps, 0, 0).setOrigin(0).setStrokeStyle(1, col, 1));
        };
        drawPortrait(ensurePortrait(this, res.hero, (tex) => drawPortrait(tex))); // 지연 로드(없으면 이니셜 폴백)
        let ty = py + ps + 4;
        const badge = makeText(this, 0, ty, rarityBadge(res.rarity), { size: 18, heading: true, color: rarityCss(res.rarity), origin: [0.5, 0] }); // 등급 표시 1.5배(12 -> 18, 2026-11-03 사용자 요청)
        fitText(badge, w - 8);
        front.add(badge);
        ty += badge.height + 2;
        const tagY = h - 8;
        const nameMid = (ty + tagY - 16) / 2;
        front.add(fitText(makeText(this, 0, nameMid, gachaLabel(res), { size: w < 120 ? 13 : 15, bold: true, origin: [0.5, 0.5], wrap: w - 10, align: 'center' }), w - 10, { maxLines: 2, fallback: gachaLabel(res, { compact: true }) })); // 신겐·겐신만 칭호 + 정식 이름(names.gachaLabel)
        // 신규 'NEW' 표시 제거(2026-11-03 사용자 지시): 중복일 때만 조각 표시
        if (!res.is_new) front.add(makeText(this, 0, tagY, `조각 +${fmtNum(res.shards_gained)}`, { size: 13, bold: true, color: res.is_new ? CSS.accent : CSS.allyText, origin: [0.5, 1], stroke: { color: '#0B1020', width: 3 } }));
        if (ornLayer) front.add(ornLayer);
        c.add([back, front]);
        c.revealed = false;
        // 뒤집기는 씬 트윈을 직접 써서 '건너뛰기' 때 killTweensOf 로 즉시 끝낼 수 있게 한다(진행 중인 카드도 완료 상태로)
        const finish = () => { this.tweens.killTweensOf(c); c.scaleX = 1; back.setVisible(false); front.setVisible(true); };
        c.reveal = (instant) => {
            if (!c.scene) return;
            if (c.revealed) { if (instant) finish(); return; }
            c.revealed = true;
            if (instant || isInstant()) { finish(); return; }
            this.tweens.add({ targets: c, scaleX: 0, duration: 90, ease: 'Sine.easeIn', onComplete: () => {
                if (!c.scene) return;
                back.setVisible(false); front.setVisible(true);
                this.tweens.add({ targets: c, scaleX: 1, duration: 110, ease: 'Sine.easeOut' });
            } });
        };
        return c;
    }

    // 확률 보기: 서버 rates/pity/heroes 그대로 표시
    // bn(선택) = 시나리오 배너 원본(GET /api/gacha banners[]: rates, pool_heroes[{side, default_visible}], pool_side_counts, required_owned/total, required_pity, blocking).
    //  있으면 그 배너 풀 기준(목록은 아군만, 적군은 인원만 표기하되 확률 계산엔 포함), 없으면 서고(전체 풀). 서버에 없는 필드는 건너뛴다
    gachaRates(info, bn = null) {
        const W = Math.min(680, L.lw - 24);
        const H = Math.min(640, L.lh - 24);
        const toDex = () => { if (this.scene.key === 'Lobby') this.time.delayedCall(0, () => { if (this.sys.isActive()) this.show('dex'); }); else this.scene.start('Lobby', { tab: 'dex' }); }; // 확률표의 영웅을 도감(영웅 > 도감)에서 초상으로 확인. Gacha 씬에서 호출되면 로비 도감 탭으로 이동
        const m = new Modal(this, { title: bn ? `확률 보기 · ${bn.displayTitle ?? bn.title ?? ''}` : '확률 보기', w: W, h: H, buttons: [{ label: '도감 보기', onClick: toDex }, { label: '닫기' }] });
        const iw = W - 48;
        const listH = H - (m.panel.bodyY + 12) - 84;
        const list = new ScrollList(this, { x: 24, y: 0, w: iw, h: listH });
        m.inner.add(list);
        let y = 0;
        const addT = (str, opts = {}) => { const t = makeText(this, opts.x ?? 0, y, str, { size: 15, wrap: iw, ...opts }); list.content.add(t); y += t.height + (opts.gapAfter ?? 6); return t; };
        addT(`뽑기 풀 버전 ${info.pool_version ?? '-'} · 1회 ${fmtNum(info.price?.single)} 골드 · 10연 ${fmtNum(info.price?.ten)} 골드`, { color: CSS.muted, size: 13 });
        const rule = pityRuleText(info.pity);
        if (rule) addT(`보장: ${rule}`, { color: CSS.accent, size: 14, gapAfter: 12 });
        const enemyN = bn ? (Number(bn.pool_side_counts?.enemy) || (Array.isArray(bn.pool_heroes) ? bn.pool_heroes.filter((h) => h?.side === 'enemy').length : 0)) : 0;
        if (bn) {
            addT('이 배너의 영웅 풀에서만 추첨합니다(역사의 서고와 별도).', { size: 13, color: CSS.muted });
            if (bn.blocking) addT('다음에 도전할 스테이지에 필요한 영웅이 이 배너에 있습니다.', { size: 14, color: '#f0b04a' });
            if (Number(bn.required_total) > 0) addT(`필수 영웅 보유 ${fmtNum(bn.required_owned ?? 0)}/${fmtNum(bn.required_total)}`, { size: 14, color: CSS.accent });
            const rp = bn.required_pity;
            if (rp?.enabled && Number(rp.threshold) > 0) {
                addT(`필수 영웅 천장: 아직 없는 필수 영웅이 ${fmtNum(rp.threshold)}회 소환 동안 나오지 않으면 다음 소환에서 확정${Number(rp.boost_multiplier) > 1 ? ` · 같은 등급 안에서 확률 ×${rp.boost_multiplier}` : ''}`, { size: 13, color: CSS.text });
                (Array.isArray(rp.targets) ? rp.targets : []).forEach((t) => addT(`  ${gachaLabel(t)}  진행 ${fmtNum(t.progress ?? 0)}/${fmtNum(rp.threshold)}${t.effective_rate_pct != null ? ` · 확률 ${fmtPct(t.effective_rate_pct)}%` : ''}`, { size: 13, color: rarityCss(t.rarity) }));
            }
            y += 6;
        }
        addT('등급별 확률', { bold: true, size: 16 });
        const shardOf = new Map((info.rates ?? []).map((r) => [r.rarity, r.duplicate_shards])); // 배너 rates 에는 조각 수가 없어 서고 표 값(등급 공통)
        const rates = bn && Array.isArray(bn.rates) && bn.rates.length ? bn.rates : (info.rates ?? []);
        rates.forEach((r) => {
            const sh = r.duplicate_shards ?? shardOf.get(r.rarity);
            addT(`${rarityBadge(r.rarity)}   ${fmtPct(r.rate_pct)}%   (영웅 ${fmtNum(r.hero_count)}명, 1명당 ${fmtPct(r.per_hero_rate_pct)}%)${sh != null ? `   중복 시 조각 +${fmtNum(sh)}` : ''}`, { color: rarityCss(r.rarity), size: 14 });
        });
        if (enemyN > 0) addT(`적군 진영 영웅 ${fmtNum(enemyN)}명도 추첨 대상입니다(확률 계산 포함, 아래 목록에서는 생략).`, { size: 12, color: CSS.muted });
        y += 10;
        // 목록: 배너 = 아군(default_visible)만, 서고 = 전체(서고 전용 영웅 = unaffiliated 표시)
        const src = bn && Array.isArray(bn.pool_heroes) ? bn.pool_heroes.filter((h) => h && h.default_visible !== false && h.side !== 'enemy') : (info.heroes ?? []);
        const heroes = [...src].sort((p1, p2) => compareRarity(p1.rarity, p2.rarity));
        const cols = iw >= 520 ? 3 : 2;
        const colW = Math.floor(iw / cols);
        const rowH = 22;
        let lastR = null;
        let idx = 0;
        heroes.forEach((h) => {
            if (h.rarity !== lastR) {
                if (idx % cols) y += rowH;
                lastR = h.rarity; idx = 0;
                const cnt = heroes.filter((x) => x.rarity === h.rarity).length;
                y += 4;
                addT(`${rarityLabel(h.rarity)} 영웅 (${cnt}명)`, { bold: true, size: 15, color: rarityCss(h.rarity) });
            }
            const label = `${gachaLabel(h)}${h.owned ? ' (보유)' : ''}${!bn && h.unaffiliated ? ' · 서고 전용' : ''}`;
            const t = makeText(this, (idx % cols) * colW, y, label, { size: 13, color: h.owned ? CSS.text : CSS.muted });
            list.content.add(fitText(t, colW - 8, { fallback: `${gachaLabel(h, { compact: true })}${h.owned ? ' (보유)' : ''}` }));
            idx++;
            if (idx % cols === 0) y += rowH;
        });
        if (idx % cols) y += rowH;
        y += 8;
        addT('(보유) = 보유 중. 등급은 게임 내 희귀도와 전투 역할을 나타내며 인물의 역사적 평가와 무관합니다.', { size: 12, color: CSS.muted });
        list.setContentHeight(y);
        list.refreshMask();
    }

    // ---------- 설정(구 더보기, 2026-11-14 개편) ----------
    // 용도별 섹션 카드(게임 / 계정 / 로그아웃) + 공통 Button(primary·default·danger 변형, 호버·눌림 모션과 클릭음은 Button 공통).
    // 아이콘 = 코드 도형(menuGlyph, 새 이미지 없음). 버튼 높이 48(터치 44 이상), 좁은 화면 1열·넓은 화면 2~3열, 넘치면 세로 스크롤.
    // 상점·인벤토리 바로가기는 하단 메뉴 '상점'·'영웅 > 인벤토리'로 옮겨 여기서 뺐다(기능 중복 제거). 로그아웃은 확인 모달(logout) 유지
    async tabMore(p) {
        this.done();
        const a = this.area;
        const reload = ({ fontChanged } = {}) => { if (fontChanged) this.scene.restart({ tab: this.tab }); }; // 글꼴 변경 시 설정 탭으로 씬 재시작(기존 콜백)
        const sections = [
            { title: '게임', items: [
                { label: '게임 설정 (소리·화면)', glyph: 'gear', variant: 'primary', fn: () => openSettings(this, reload) },
                { label: '공지', glyph: 'scroll', fn: () => this.openNotices() },
                { label: '튜토리얼 보기', glyph: 'book', fn: () => this.scene.start('Dialogue', { source: 'tutorial', server: !session.profile?.tutorial?.done, stepIndex: 0, next: { scene: 'Lobby', data: { tab: 'more' } } }) }, // 이미 완료한 튜토리얼 재열람은 서버에 진행·건너뛰기를 보내지 않음
                { label: '도움말 다시 보기', glyph: 'scroll', fn: () => openBriefReplay(this) }, // 2026-11-14 시오리 브리핑: 본 안내(개념 팝업·스테이지 안내·전투 조작 안내)를 골라 다시 재생
                ...(installButtonLabel() ? [{ label: installButtonLabel(), glyph: 'install', fn: () => openInstallGuide(this) }] : []), // PWA 설치(이미 앱 실행 중이면 숨김, ui/InstallModal.js)
            ] },
            { title: '계정', items: [
                session.kind === 'guest'
                    ? { label: '회원 가입 (진행 데이터 유지)', glyph: 'person', variant: 'primary', fn: () => this.scene.start('Auth', { mode: 'register' }) }
                    : { label: '계정 정보', glyph: 'person', fn: () => alertModal(this, '계정', `${session.name}\n${session.user?.email ?? ''}`) },
            ] },
            ...(devMode() ? [{ title: '개발', items: [{ label: '전투 프로토타입(오프라인)', glyph: 'gear', fn: () => this.scene.start('Battle', { fresh: true }) }, { label: 'UI 스킨 데모', glyph: 'gear', fn: () => this.scene.start('UiDemo') }] }] : []),
            { title: null, danger: true, items: [{ label: '로그아웃', glyph: 'exit', variant: 'danger', fn: () => this.logout() }] }, // 위험 동작은 맨 아래 단독(적색 + 확인 모달)
        ];
        const W = Math.min(a.w, this.wide() ? 980 : 560);
        const pad = 14; const bh = 48; const gap = 10;
        const cols = this.wide() ? 3 : W >= 500 ? 2 : 1;
        const list = new ScrollList(this, { x: a.x, y: a.y + 4, w: a.w, h: a.h - 4, clip: true, bar: true });
        p.add(list);
        let y = 0;
        sections.forEach((sec) => {
            const n = sec.items.length; const rows = Math.ceil(n / cols);
            const head = sec.title ? 34 : 0;
            const h = pad + head + rows * bh + (rows - 1) * gap + pad;
            const c = this.add.container(0, y); c.clipH = h;
            if (sec.danger) { // 로그아웃 구역: 카드 없이 적색 가는 구분선 + 버튼
                c.add(this.add.rectangle(0, 2, W, 1, COLOR.danger, 0.55).setOrigin(0));
            } else {
                c.add(this.sectionBg(0, 0, W, h, 0.85));
                const t = makeText(this, pad, pad + 10, sec.title, { size: 16, heading: true, color: '#f0d58c', origin: [0, 0.5], stroke: { color: '#0B1020', width: 3 } });
                c.add(t);
                c.add(this.add.rectangle(pad + t.width + 10, pad + 10, Math.max(0, W - pad * 2 - t.width - 10), 1, COLOR.accent, 0.45).setOrigin(0, 0.5)); // 제목 옆 금색 가는 선
            }
            const bw = Math.floor((W - pad * 2 - gap * (cols - 1)) / cols);
            sec.items.forEach((it, i) => {
                const col = i % cols; const row = Math.floor(i / cols);
                const glyphColor = it.variant === 'primary' ? 0x1a1406 : it.variant === 'danger' ? 0xffffff : 0xf0d58c;
                c.add(new Button(this, { x: pad + col * (bw + gap), y: pad + head + row * (bh + gap), w: bw, h: bh, label: it.label, size: 16, variant: it.variant ?? 'default', iconFn: (sc, z) => menuGlyph(sc, it.glyph, z, glyphColor), onClick: it.fn }));
            });
            list.content.add(c);
            y += h + 12;
        });
        list.setContentHeight(y);
        list.refreshMask?.();
    }
}

// 설정 메뉴 버튼 아이콘(코드 도형, 가운데 원점). Button.layoutContent 가 displayWidth 를 쓰므로 컨테이너 크기를 지정한다
function menuGlyph(scene, kind, size, color = 0xf0d58c) {
    const c = scene.add.container(0, 0).setSize(size, size);
    const g = scene.add.graphics(); c.add(g);
    const r = size / 2; const lw = Math.max(1.5, size / 11);
    g.lineStyle(lw, color, 1); g.fillStyle(color, 1);
    if (kind === 'gear') {
        for (let i = 0; i < 8; i += 1) { const an = (i / 8) * Math.PI * 2; g.fillCircle(Math.cos(an) * r * 0.72, Math.sin(an) * r * 0.72, r * 0.2); }
        g.fillCircle(0, 0, r * 0.62); g.fillStyle(0x0b1020, 1).fillCircle(0, 0, r * 0.26);
    } else if (kind === 'scroll') {
        g.strokeRect(-r * 0.55, -r * 0.7, r * 1.1, r * 1.4);
        g.fillRect(-r * 0.75, -r * 0.85, r * 1.5, r * 0.22).fillRect(-r * 0.75, r * 0.63, r * 1.5, r * 0.22);
        g.lineBetween(-r * 0.3, -r * 0.25, r * 0.3, -r * 0.25).lineBetween(-r * 0.3, r * 0.05, r * 0.3, r * 0.05).lineBetween(-r * 0.3, r * 0.35, r * 0.15, r * 0.35);
    } else if (kind === 'book') {
        g.strokeRect(-r * 0.85, -r * 0.6, r * 0.82, r * 1.25).strokeRect(r * 0.03, -r * 0.6, r * 0.82, r * 1.25);
        g.lineBetween(-r * 0.6, -r * 0.25, -r * 0.25, -r * 0.25).lineBetween(r * 0.25, -r * 0.25, r * 0.6, -r * 0.25).lineBetween(-r * 0.6, r * 0.1, -r * 0.25, r * 0.1).lineBetween(r * 0.25, r * 0.1, r * 0.6, r * 0.1);
    } else if (kind === 'person') {
        g.fillCircle(0, -r * 0.35, r * 0.34);
        g.beginPath().arc(0, r * 0.75, r * 0.7, Math.PI, 0, false).closePath().fillPath();
    } else if (kind === 'install') { // 아래 화살표 + 받침(앱 설치)
        g.lineBetween(0, -r * 0.8, 0, r * 0.2);
        g.fillTriangle(0, r * 0.45, -r * 0.4, 0, r * 0.4, 0);
        g.lineBetween(-r * 0.8, r * 0.75, r * 0.8, r * 0.75);
    } else if (kind === 'exit') {
        g.strokeRect(-r * 0.8, -r * 0.8, r * 0.9, r * 1.6);
        g.lineBetween(-r * 0.2, 0, r * 0.75, 0);
        g.fillTriangle(r * 0.9, 0, r * 0.5, -r * 0.35, r * 0.5, r * 0.35);
    } else g.fillCircle(0, 0, r * 0.4);
    return c;
}
