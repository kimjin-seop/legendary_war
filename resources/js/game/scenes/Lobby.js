import Phaser from 'phaser';
import { Tabs, fitLabel } from '../ui/Tabs.js';
import { portraitBox, sCard, heroSprite, ensureHeroSprite, troopBadges, heroPortraitLogical, troopSprite, ensureTroopSprite, troopTypeOf } from '../ui/HeroVisual.js';
import { ensureHeroMenuCards, heroMenuCard, HERO_CARD_RATIO } from '../ui/HeroMenuCard.js';
import { Button } from '../ui/Button.js';
import { StatBar } from '../ui/StatBar.js';
import { Modal } from '../ui/Modal.js';
import { openSettings } from '../ui/SettingsModal.js';
import { showToast } from '../ui/Toast.js';
import { makeText, addBackdrop, fitText } from '../ui/common.js';
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
import { protagonistInfo, protagonistName } from '../dialogue/dialogueData.js';
import { messageOf, errorTag } from '../api/errors.js';
import { auraDesc } from '../systems/glossary.js';
import { heroLabel, heroPlainName, heroShortName, gachaLabel } from '../systems/names.js';
import { skillDisplayName } from '../systems/skills.js';
import { withJosa } from '../systems/josa.js';
import { createSkeleton } from '../ui/Skeleton.js';
import { ensurePortrait } from '../ui/PortraitCard.js';
import { rarityMark, pixelLabel, pixelImage } from '../ui/PixelBadge.js';
import { isInstant } from '../ui/motion.js';
import { audio } from '../audio.js';
import { addBrandLogo, brandSmall, brandHeader, brandEmblem } from '../brand.js';
import { withUiImage } from '../ui/uiImage.js';
import { rememberStages, objectiveShort, goalLines, normRules, starCondsOf, starCondText, heroNameOf, playBeforeStage } from '../campaign/campaignFlow.js';
import { maybeCharacterCreate, openCharacterCreate, characterCheckPending } from '../campaign/characterCreate.js';
import { guideEnabled, markNewFlow } from '../tutorial/guideFlow.js';
import { loadCampaignMapMeta, buildCampaignMap, stagePlayable, stageLockText, missingHeroesOf, missingHeroText } from '../campaign/campaignMapData.js';
import { StageMapView } from '../ui/StageMapView.js';
import { tabDex } from './lobbyDex.js';
import { tabRank } from './lobbyRank.js';
import { warSeasonActive, warUnreadCount } from './warEntry.js';
import { openRecord } from '../ui/RecordPanel.js';

// icon: 아틀라스 ico.<name>(안아트 생성 예정 ico.tab_*). 없으면 글자만(Tabs 폴백)
const TABS = [
    { key: 'stage', label: '스테이지', icon: 'tab_stage' },
    { key: 'hero', label: '영웅', icon: 'tab_hero' },
    { key: 'room', label: '방 대전', icon: 'tab_room' },
    // (편성 탭 제거 2026-11-01: 캠페인 출전 영웅은 출격(배치) 화면에서 고르고, 마지막 출격 구성은 서버가 자동 저장해 다음 배치 기본값으로 쓴다)
    // 퀘스트: 상단바 버튼에서 하단 탭으로 이동(빨간 점 = 탭 아이콘 우상단). 전용 ico.tab_quest(미제작)가 없으면 ico.quest
    { key: 'quest', label: '퀘스트', icon: 'tab_quest', iconFallback: 'quest' },
    // 랭킹: 전용 아이콘 ico.tab_rank(트로피/왕관, 미제작)이 있으면 사용, 없으면 가장 가까운 ico.log(목록) 폴백(buildTabs)
    { key: 'ranking', label: '랭킹', icon: 'tab_rank', iconFallback: 'log' },
    { key: 'more', label: '더보기', icon: 'tab_more' },
];
// 뽑기 탭: 서버 rules.gacha 가 true 일 때만 '방 대전' 다음(퀘스트 앞)에 추가
const GACHA_TAB = { key: 'gacha', label: '뽑기', icon: 'tab_gacha' };
// 하단 탭 바에 없는 화면(더보기·상단 버튼에서 진입)
// protagonist = 영웅 그룹 서브 탭(주인공 스테이터스, fe-proto 2026-11-03: 영웅 카드 목록에서는 주인공 제외)
const EXTRA_TABS = [{ key: 'protagonist', label: '주인공' }, { key: 'dex', label: '도감' }, { key: 'rank', label: '랭크전' }, { key: 'shop', label: '상점' }, { key: 'exchange', label: '교환소' }, { key: 'inventory', label: '인벤토리' }, { key: 'main', label: '메인 스토리' }]; // main = 싱글 그룹 서브 탭(오리지널 메인 스토리, chapter 101+) // 랭킹은 하단 탭으로 이동
const gachaOn = () => !!publicRules()?.gacha;
const gachaSceneOn = () => { try { return localStorage.getItem('srpg.gachaScene') !== '0'; } catch { return true; } }; // 뽑기 탭 -> Gacha 씬(0 = 기존 탭)
const tabItems = () => { if (!gachaOn()) return TABS; const i = TABS.findIndex((t) => t.key === 'quest'); return [...TABS.slice(0, i), GACHA_TAB, ...TABS.slice(i)]; };
// 하단 탭 그룹(fe26 A안 -> fe45): 싱글(스테이지·메인 스토리) / 영웅 / 뽑기 / 멀티(방 대전·시즌 전쟁) / 성장·보상(퀘스트·랭킹) / 더보기.
// 그룹 안 서브 탭은 본문 상단 Tabs. 내부 tab 키(stage·hero·…)는 그대로. 'war' 서브 탭 = War 씬 직접 진입.
// 롤백(기존 7칸): TAB_GROUPS.enabled = false 또는 localStorage srpg.tabGroups=0
export const TAB_GROUPS = { enabled: true };
const groupsOn = () => { try { if (localStorage.getItem('srpg.tabGroups') === '0') return false; } catch { /* 무시 */ } return TAB_GROUPS.enabled; };
// fe45(2026-11-03, 사용자 지시 "영웅·뽑기는 싱글 전용이 아니다"): 영웅·뽑기를 싱글 그룹에서 빼 하단 독립 칸으로(모드 무관 접근).
//  싱글 = 스테이지·메인 스토리만. 뽑기 칸은 rules.gacha 가 true 일 때만(visibleGroups). 롤백 = .bak-fe45-20261103
const GROUPS = [
    { key: 'g_single', label: '싱글', icon: 'tab_stage', sub: ['stage', 'main'] }, // main = 메인 스토리(fe38)
    { key: 'g_hero', label: '영웅', icon: 'tab_hero', sub: ['hero', 'protagonist', 'dex'] }, // protagonist = 주인공 스테이터스(fe-proto), dex = 영웅 도감(전체 플레이 가능 영웅, scenes/lobbyDex.js)
    { key: 'g_gacha', label: '뽑기', icon: 'tab_gacha', sub: ['gacha'] },
    { key: 'g_multi', label: '멀티', icon: 'tab_room', sub: ['room', 'war', 'rank'] }, // rank = 랭크 대전(scenes/lobbyRank.js, 2026-11-03 골격)
    { key: 'g_growth', label: '성장·보상', icon: 'tab_quest', iconFallback: 'quest', sub: ['quest', 'ranking', 'shop', 'exchange'] }, // 2026-11-04: 상점(장비)·일일 교환소를 성장·보상 서브 탭으로(더보기 '장비 상점'은 같은 화면 별칭)
    { key: 'g_more', label: '더보기', icon: 'tab_more', sub: ['more'], extra: ['inventory'] }, // 인벤토리 = 더보기·상점에서 진입(서브 탭 없음). 상점은 성장·보상 서브 탭
];
// 세로 내비 아이콘(안아트 ui.nav.<이름>, 2026-11-04): 그룹/탭 키 -> 이름. record(기록)는 비그룹 랭킹 탭용
const NAV_ICON = { g_single: 'single', g_hero: 'hero', g_gacha: 'gacha', g_multi: 'multi', g_growth: 'growth', g_more: 'more', stage: 'single', hero: 'hero', gacha: 'gacha', room: 'multi', quest: 'reward', ranking: 'record', more: 'more' };
// 서브 탭 아이콘(안아트 퀘스트 스펙 top_tab: atlas.uiskin ico.quest / ico.shop / ico.ticket). 아틀라스에 없으면 글자만(Tabs.skinIcon)
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
const CHAPTER_TITLE = { 0: '튜토리얼 · 오리지널 스테이지', 1: '임진왜란 편', 18: '칭기즈 칸과 몽골 제국', 21: '레그니차의 연기', 22: '파니파트의 수레벽', 23: '헤이스팅스의 방패벽', 24: '투르와 푸아티에', 999: '숨은 종장', 101: '메인 스토리 1막', 102: '메인 스토리 2막', 103: '메인 스토리 3막', 104: '메인 스토리 4막' };
// 오리지널 메인 스토리 = chapter 101 이상(1막 101 ~ 4막 104). 서가 지도·스테이지 탭에서는 빼고 '메인 스토리' 탭에만 표시
export const MAIN_STORY_CHAPTER = 101;
export const HIDDEN_CHAPTER = 999; // 숨은 종장(서가 지도에 표시, 메인 스토리 탭 아님)
const isMainStory = (s) => stageChapter(s) >= MAIN_STORY_CHAPTER && stageChapter(s) !== HIDDEN_CHAPTER;
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

    init(data) { this.tab = data?.tab ?? this.tab ?? 'stage'; this.notice = data?.notice ?? ''; this.noticeMs = data?.noticeMs; this.autoSortie = !!data?.autoSortie; this.sortieStageId = data?.sortieStageId ?? null; } // sortieStageId: 결과 화면 '다음 스테이지' -> 해당 스테이지로 바로 출정

    create() {
        this.modalCount = 0;
        this.warUnread = 0; // 씬 인스턴스 재사용: 이전 진입의 읽지 않음 수를 새 탭 바에 잠깐 그리지 않게
        this.inputs = [];
        this.resumeBusy = false; // 이어하기 연속 클릭 잠금: 씬 재사용 시 이전 진입의 잠금(전환으로 해제 타이머가 안 돈 값) 초기화(War.js 와 같은 방식)
        this.goldCap = null; this.brandLogo = null; this.softTimer = null; this.skel = []; // 씬 재생성 시 이전 인스턴스의 파괴된 UI 참조 제거(재진입 정지 방지)
        syncView();
        setupCamera(this, CSS.bg);
        relayoutOnChange(this, () => ({ tab: this.tab }));
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
        gameApi.profile(true).then((prof) => { this.refreshBar(); this.syncGachaTab(); maybeCharacterCreate(this, prof).then((went) => { if (!went) { reveal(); this.drawBadge(); } if (!went && this.sys.isActive()) this.maybeAutoTutorial(prof); }).catch(() => { reveal(); this.maybeAutoTutorial(prof); }); }).catch(() => reveal()); // 캐릭터 생성(protagonist_needed) 우선, 아니면 튜토리얼 자동 시작
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
                if (k === 'g_multi') { warSeasonActive().then((on) => { if (!this.sys.isActive() || this.tabBar?.active !== 'g_multi') return; if (on) this.show('war'); else this.show(subs.includes(last) && last !== 'war' ? last : subs[0]); }); return; }
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
    buildBar() {
        const y = L.safe.t;
        const SH = L.short ? 44 : 60; // 상단 바(사용자 2026-11-04 '적당히 얇게'): 72 -> 60, 가로 폰 52 -> 44
        const strip = skinOn(this) ? slice(this, 'topbar', L.lw, SH, 'panel') : null;
        const skinBar = !!strip?.skinAtlas;
        const BH = skinBar ? SH : (L.short ? 42 : 54); // 스킨 없을 때 64 -> 54, 50 -> 42
        if (skinBar) { if (y > 0) this.add.rectangle(0, 0, L.lw, y + 2, COLOR.navyDeep, 1).setOrigin(0); strip.setPosition(0, y); }
        else { strip?.destroy(); this.add.rectangle(0, 0, L.lw, y + BH, COLOR.navyDeep, 0.92).setOrigin(0); this.add.rectangle(0, y + BH - 1, L.lw, 2, COLOR.accent).setOrigin(0); }
        this.barH = y + BH; // 탭 본문 시작 = 바 아래(show)
        const nb = this.narrowBar = L.lw < 640;
        const fr = skinBar ? strip.frame : null;
        const k = fr ? BH / fr.height : 0;
        const bandT = y + (fr ? Math.ceil(fr.height * (12 / 192) * k) : 2);
        const bandB = y + (fr ? Math.floor(fr.height * (144 / 192) * k) : BH - 2);
        const cy = Math.round((bandT + bandB) / 2);
        this.barCy = cy;
        // 좌우 캡 장식(frame.customData.slice.l 의 약 80%) 안쪽에서 시작. 좁은 화면은 캡이 폭의 40% 가까이 먹으므로 캡 위로 내용을 올린다(여백 10)
        const capL = fr ? (fr.customData?.slice?.l ?? fr.height * (250 / 192)) * k : 0;
        // 좁은 화면: 10/18 이면 로고 방패가 왼쪽 마름모·사선 테두리·구름 덩굴(캡 프레임 x<=137, k=0.375 -> 화면 x<=51)에 겹침(390x844) -> 52.
        // 52 = 프레임 x 139: 로고 17 높이 세로 범위(프레임 y 55~101)에 장식 없음. infoW 가 96~132 구간이면 room 이 xL 과 무관(94)이라 로고 높이 유지, 정보 열만 좁아짐
        const xL = L.safe.l + (nb ? 52 : Math.max(12, Math.round(capL * 0.8) + 8));
        const xR = L.lw - L.safe.r - (nb ? 10 : Math.max(12, Math.round(capL * 0.8)));
        // 프로필 패널 배치(오른쪽 끝부터): 골드 캡슐 -> 정보 열 -> 원형 뱃지(패널 왼쪽 끝에 걸친 메달)
        const sz = L.short ? 36 : nb ? 44 : 48; // 뱃지 지름(바 축소에 맞춤: 40/50/56 -> 36/44/48)
        const goldW = nb ? 72 : 128;
        const penW = nb ? 46 : L.short ? 80 : goldW; // 데스크톱: 펜·골드 캡슐 같은 폭(시안 2026-11-04 '재화 2개 pill') // 가로 폰 96 -> 80(헤더 로고 자리, 2026-11-04) // 펜 캡슐(골드 왼쪽). 좁은 화면 = 펜촉+숫자만 46(닉네임 열 확보, 강화면 gacha45)
        const infoW = nb ? Math.max(110, Math.min(132, xR - xL - sz - goldW - penW - 136)) : L.short ? 160 : Math.round(Math.min(300, Math.max(210, L.lw * 0.2))); // 가로 폰 210 -> 160(헤더 로고 높이 44 이상 확보, 닉네임은 말줄임)
        const goldX1 = xR - 6; const goldX0 = goldX1 - goldW;
        const penX1 = goldX0 - 6; const penX0 = penX1 - penW;
        const infoX1 = penX0 - 10; const infoX0 = infoX1 - infoW;
        const bcx = infoX0 - 8 - sz / 2;
        const ph = L.short ? 34 : nb ? 40 : 42; // 프로필 패널 높이(38/44/48 -> 34/40/42)
        this.add.graphics().fillStyle(COLOR.navyDeep, 0.82).fillRoundedRect(bcx, cy - ph / 2, xR - bcx, ph, 10).lineStyle(1, COLOR.accent, 0.7).strokeRoundedRect(bcx, cy - ph / 2, xR - bcx, ph, 10);
        this.bar = { cy, sz, infoX0, infoX1, infoW, goldX0, goldX1, penX0, penX1, nb };
        // 원형 뱃지(눌러서 영웅 탭)
        this.badge = this.add.container(bcx - sz / 2, cy - sz / 2);
        this.badgeFace = this.add.container(0, 0);
        const hs = Math.max(sz, Math.ceil(MIN_TOUCH / (view.scale || 1))); // 터치 영역 = 실제 화면 44px 이상(보이는 뱃지 크기는 그대로, 강화면 gacha65: 667 에서 32px)
        const hit = this.add.rectangle(-(hs - sz) / 2, -(hs - sz) / 2, hs, hs, 0xffffff, 0.001).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerup', () => { if (this.modalCount > 0 || this.tab === 'protagonist') return; this.selectTab('protagonist'); }); // 주인공 초상 뱃지 -> 주인공 스테이터스(fe-proto)
        this.badge.add([this.badgeFace, hit]);
        this.badgeSig = '';
        this.protoHero = (session.heroes ?? []).find((h) => h.protagonist) ?? null; // 영웅 목록 캐시가 있으면 즉시(없으면 preloadHeroThumbs 응답에서)
        // 정보 열: 1줄 = Lv 태그 + 닉네임, 2줄 = EXP 바(트랙 안 'EXP 현재/다음'). 와이드 오른쪽 '코스트 N · 슬롯 N'은 2026-11-08 사용자 요청으로 제거(출전 상한은 편성 화면에서 표시)
        // 가로 폰(L.short, 667x390): 패널 높이 34 안에서 닉네임(15px+외곽선)과 EXP 바(12)가 2~3px 겹치던 문제(강화면 a13) -> 닉네임 13px·바 10·줄 간격 16
        const r1 = cy - (L.short ? 8 : 9); const r2 = cy + (L.short ? 8 : 9);
        this.lvT = makeText(this, infoX0, r1, '', { size: nb || L.short ? 12 : 13, bold: true, color: CSS.accent, origin: [0, 0.5], stroke: { color: '#0B1020', width: L.short ? 2 : 3 } });
        this.nameT = makeText(this, infoX0, r1, '', { size: nb || L.short ? 13 : 15, bold: true, origin: [0, 0.5], stroke: { color: '#0B1020', width: L.short ? 2 : 3 } });
        this.expBar = new StatBar(this, { x: infoX0, y: r2 - 9, w: infoW, h: L.short ? 10 : 14, max: 1, value: 0, skin: 'blue', label: 'EXP' });
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
        const room = bcx - sz / 2 - 12 - xL;
        // 새 헤더 로고(가로 현판, ui.logo.header): 넓은 바(390 제외)에서 남는 폭에 맞춰 키우고 바 높이의 1.35배까지 허용(사용자 '넘치면 UI 를 벗어나도 됨').
        //  바 아래로 걸쳐도 본문은 이 뒤에 그려져 버튼이 로고 위에 오고, 이미지는 입력을 받지 않아 터치를 막지 않는다. 화면 위로는 넘지 않게 중심을 내림
        this.logoBox = null;
        const hv = !nb ? brandHeader() : null;
        if (hv) {
            // 헤더 로고 x = 화면 왼쪽 가장자리 + 10(사용자 2026-11-04 '타이틀이 좌측으로', 이전 = 상단 바 캡 장식 안쪽 xL ≈ 60). 폭 한도는 같은 규칙(뱃지 왼쪽 -12)
            const xH = L.safe.l + 10; const roomH = bcx - sz / 2 - 12 - xH;
            // 사용자 2026-11-04 '로고 더 크게, 넘치면 UI 벗어나도 됨': 서브 탭·본문 위로 걸쳐 내려와도 된다(본문이 로고보다 나중에 그려져 버튼이 위, 로고는 입력 없음).
            //  높이 = 바 높이 x 1.75(1280 약 105, 667 약 77), 폭은 뱃지 왼쪽까지(펜·골드·뱃지·닉네임·EXP 를 가리지 않음)
            // 사용자 2026-11-04 '로고 때문에 UI 가 내려와 이득 없음 -> 줄여서 바 안으로': 높이 = 바 높이 - 6(위아래 3px), 바 세로 가운데. 바 밖으로 나가지 않으므로 본문·레일·뽑기 밀어내림은 logoBox.bottom 기준으로 자동 0
            const hH = Math.max(14, Math.min(Math.floor(roomH * hv.ratio), BH - 2)); // 시안(2026-11-04): 바 높이를 거의 다 쓰는 현판(위아래 1px), 바 밖으로는 나가지 않음
            const hy = y + BH / 2;
            const hv2 = brandHeader(hH) ?? hv; // 표시 높이 기준 해상도(@2x)
            // 로고는 레일·본문보다 위(depth 5, 모달 1000 아래), 입력 없음. 레일 첫 칸은 로고 아래 끝 밑에서 시작(buildTabs: this.logoBox)
            this.logoBox = { x: xH, bottom: hy + hH / 2, w: hH / hv.ratio };
            addBrandLogo(this, hv2, xH, hy, { maxW: hH / hv.ratio, maxH: hH, origin: [0, 0.5], fallbackSize: 18, onReady: (o) => { this.brandLogo = o; o.setDepth?.(5); } });
            this.refreshBar();
            return;
        }
        // 좁은 바(390): 문장 로고(ui.logo.emblem, 안아트 2026-11-04). 바 높이 안, 뱃지 왼쪽 남는 폭에 맞춤. 없으면 아래 기존 소형 로고
        const em0 = nb ? brandEmblem() : null;
        if (em0) {
            const eH = Math.max(14, Math.min(BH - 4, Math.floor(room * em0.ratio)));
            const em = brandEmblem(eH) ?? em0;
            addBrandLogo(this, em, xL, cy, { maxW: eH / em0.ratio, maxH: eH, origin: [0, 0.5], fallbackSize: 14, onReady: (o) => { this.brandLogo = o; } });
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
        this.expBar.txt.setScale(1); fitLabel(this.expBar.txt, b.infoW - 8, 14, 9); // 좁은 트랙: 'EXP 현재/다음' 글자 축소(넘치면 말줄임)
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
            const ch = [...String(protagonistName() ?? '?')][0] ?? '?';
            face.add(makeText(this, c0, c0, ch, { size: Math.round(sz * 0.4), bold: true, color: CSS.text, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } }));
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
        if (session.kind === 'guest') return;
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
        if (guideEnabled()) { markNewFlow(); this.scene.start('Dialogue', { source: 'guide_prologue', next: { scene: 'Lobby', data: { tab: 'stage', autoSortie: true } } }); return; }
        this.scene.start('Dialogue', { source: 'tutorial', server: true, stepIndex: Math.max(0, Number(t.step) || 0), next: { scene: 'Lobby', data: { tab: this.tab } } });
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
        if (groupsOn()) { LobbyScene.lastSub = LobbyScene.lastSub ?? {}; LobbyScene.lastSub[groupOf(key).key] = key; }
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
        if (key === 'main') this.addResumeButton(p, w); // 중간 저장: 진행 중 전투가 있으면 본문 상단 오른쪽 '이어하기'. 스테이지 탭은 지도 요약 카드의 출정 옆(지도 폴백 시에만 상단, tabStage)
        p.bodyY = L.short ? 36 : 46;
        // 가독성: 탭 본문(목록·카드·버튼 그리드) 뒤 반투명 남색 얇은 판(0x0B1328 a0.6 + 금색 1px). 큰 장식 창 대신 단색 판
        p.add(this.add.rectangle(-8, p.bodyY - 6, w + 16, h - p.bodyY + 10, 0x0b1328, 0.6).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.45));
        this.content.add(p);
        this.panel = p;
        this.area = { x: 0, y: p.bodyY, w, h: h - p.bodyY };
        this.loading = makeText(this, w / 2, p.bodyY + 40, '불러오는 중...', { size: 18, color: CSS.muted, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
        p.add(this.loading);
        // U34: 로딩 스켈레톤(행 3개, 연출 끄기면 정지). done()/fail() 에서 제거. soft 재구성은 캐시라 생략
        this.skel?.forEach((o) => o.destroy());
        this.skel = soft ? [] : [0, 1, 2].map((i) => createSkeleton(this, 0, p.bodyY + 72 + i * 64, Math.min(w, 640), 52));
        this.skel.forEach((o) => p.add(o));
        const fn = { stage: this.tabStage, main: this.tabMain, hero: this.tabHero, protagonist: this.tabProtagonist, dex: (pp) => tabDex(this, pp), rank: (pp) => tabRank(this, pp), war: this.tabWar, room: this.tabRoom, gacha: this.tabGacha, more: this.tabMore, quest: (pp) => tabQuest(this, pp), ranking: (pp) => tabRanking(this, pp), shop: (pp) => tabShop(this, pp), exchange: (pp) => tabExchange(this, pp), inventory: (pp) => tabInventory(this, pp) }[key];
        fn.call(this, p).catch((e) => this.fail(p, e));
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
    sectionBg(x, y, w, h, alpha = 0.82) {
        const sk = skinOn(this) ? slice(this, 'panel_sub', w, h, 'panel') : null;
        if (sk?.skinAtlas) return sk.setPosition(x, y).setAlpha(alpha);
        sk?.destroy();
        return this.add.rectangle(x, y, w, h, COLOR.navyDeep, alpha).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.5);
    }

    fail(p, e) {
        if (!p.scene || !this.loading?.scene) return; // 탭이 바뀌어 패널이 사라짐
        this.done();
        const a = this.area;
        p.add(noteText(this, a.x, a.y + 10, messageOf(e), { kind: 'error', size: 16, wrap: a.w }));
        p.add(new Button(this, { x: a.x, y: a.y + 50, w: 160, label: '다시 시도', variant: 'primary', onClick: () => this.show(this.tab) }));
    }

    done() { this.loading?.setText(''); this.skel?.forEach((o) => o.destroy()); this.skel = []; }

    // ---------- 스테이지 ----------
    async tabStage(p) {
        const all = await gameApi.stages();
        rememberStages(all); // 캠페인 흐름(전투 후 대사 판정)용 stage id -> code 캐시
        if (!p.scene) return;
        const stages = all.filter((s) => !isMainStory(s)); // 메인 스토리(chapter 101+)는 '메인 스토리' 탭 전용: 서가 지도·카드 그리드에 섞지 않음
        // 캠페인 지도(StageMapView): 메타/좌표가 없거나 꺼져 있으면 아래 기존 카드 그리드. 끄기: ?stagemap=0 또는 localStorage srpg.stageMap=0
        // 안전장치: 메타 로드·모델 생성·뷰 생성 중 예외면 만들던 뷰를 버리고 카드 그리드로 폴백(빈 화면 방지, 콘솔 경고)
        if (stageMapOn() && stages.length) {
            const actP = this.activeBattles(); // 이어하기(가장 최근 1건): 지도 요약 카드 출정 옆. 실패해도 빈 목록
            const meta = await loadCampaignMapMeta(stages).catch((e) => { console.warn('[StageMap] 지도 메타 로드 실패, 카드 그리드로 폴백', e); return null; });
            (meta?.shelves ?? []).forEach((sh) => { const n = Number(sh?.chapter); if (Number.isFinite(n) && sh?.name_ko && !CHAPTER_TITLE[n]) SHELF_TITLE[n] = sh.name_ko; });
            const hidden = await gameApi.hiddenChapter().catch(() => null); // 숨은 종장 진행도(실패·미배포면 null = 지도에 아무것도 안 함)
            const resume = (await actP).battles?.[0] ?? null; // 서버 응답 최근순 -> 첫 건
            if (!p.scene) return;
            let model = null;
            try { model = meta ? buildCampaignMap(stages, meta, { chapterOf: stageChapter, chapterTitle, hidden, hiddenChapter: HIDDEN_CHAPTER }) : null; } catch (e) { console.warn('[StageMap] 지도 모델 생성 실패, 카드 그리드로 폴백', e); }
            if (model?.usable) {
                const a = this.area;
                let view = null;
                try {
                    view = new StageMapView(this, { x: a.x, y: a.y, w: a.w, h: a.h, model, wide: (this.wide() || L.short) && !L.portrait, /* 가로 폰(667 포함)도 좌우 배치(띠 지도 + 목록이 하단 탭 뒤로 가려지던 문제, 강화면 gacha44) */ onPick: (s, o) => this.pickStage(s, o), onGacha: gachaOn() ? () => this.goGacha() : null, resume, onResume: (b) => { if (this.modalCount > 0) return; this.resumeBattle(b); }, onProtagonist: () => openCharacterCreate(this, { mode: 'create', next: { scene: 'Lobby', data: { tab: 'stage' } } }) });
                    // 렌더 중 예외는 try/catch 로 못 잡으므로 생성 직후 Container 자식 배열이 정상인지 확인(예약 속성 덮어쓰기 방지)
                    if (!Array.isArray(view.list)) throw new Error('StageMapView.list 가 배열이 아님(Container 예약 속성 충돌)');
                    this.done();
                    if (this.sortieStageId != null) { const sid = this.sortieStageId; this.sortieStageId = null; const sN = stages.find((x) => Number(x.id) === Number(sid)); if (sN && sN.unlocked !== false) this.time.delayedCall(300, () => { if (this.sys.isActive()) this.pickStage(sN, { direct: true }); }); } // 결과 화면 '다음 스테이지'(하플레이 2026-11-04)
                    if (this.autoSortie) { this.autoSortie = false; const s0 = stages.find((x) => x.id === model.recStageId); if (s0) this.time.delayedCall(this.noticeMs ? this.noticeMs + 300 : 400, () => { if (this.sys.isActive()) this.pickStage(s0, { direct: true }); }); } // 새 튜토리얼: 프롤로그 직후 추천 첫 스테이지로 바로 출정
                    p.add(view);
                    return;
                } catch (e) {
                    console.warn('[StageMap] 지도 화면 생성 실패, 카드 그리드로 폴백', e);
                    try { view?.destroy(); } catch { /* 무시 */ }
                }
            }
        }
        this.done();
        this.addResumeButton(p, p.w); // 지도 폴백(카드 그리드): 이어하기는 기존처럼 본문 상단 오른쪽
        this.stageCards(p, stages, { msg: '열린 스테이지가 없습니다', sub: '잠시 후 다시 시도해 주세요.' });
    }

    // ---------- 메인 스토리(오리지널, chapter 101+) ----------
    // stages 응답에서 chapter>=101 만 막(장) 순서·응답 순서대로 카드 목록. 해금·별점·잠금 표시와 출정(pickStage -> 전 대사 -> 배치)은 스테이지 카드와 같은 경로
    async tabMain(p) {
        const all = await gameApi.stages();
        rememberStages(all);
        if (!p.scene) return;
        const stages = all.filter(isMainStory).sort((x, y) => stageChapter(x) - stageChapter(y)); // 같은 막 안은 서버 순서 유지(안정 정렬)
        this.done();
        // 추천 배지는 한 곳에만(하플레이 2026-11-04 '추천 중복'): 스테이지 탭(서가 지도)에 진행할 스테이지가 남아 있으면 메인 스토리 탭은 추천 표시 생략
        const shelfLeft = all.some((s) => !isMainStory(s) && stagePlayable(s) && !(s.clear_count > 0));
        this.stageCards(p, stages, { msg: '메인 스토리 준비 중', sub: '곧 열립니다.' }, { noRec: shelfLeft });
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
            const prog = g.ch > 0 ? `   클리어 ${g.items.filter(([s]) => s.clear_count > 0).length}/${g.items.length} · ★ ${g.items.reduce((n, [s]) => n + (s.best_stars ?? 0), 0)}/${g.items.length * 3}` : '';
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
                let tx = 14;
                row.add(makeText(this, tx, 10, `${i + 1}`, { size: 12, color: CSS.muted }));
                // U16: 자물쇠 이모지 대신 도트 pix.lock(없으면 ico.lock, 둘 다 없으면 '잠김' 글자)
                if (!ok) {
                    const lk = pixelImage(this, 'pix.lock', 0, 0, 16) ?? skinIcon(this, 'lock', 18);
                    if (lk) { lk.setPosition(tx + 8, 37); row.add(lk); tx += 22; } else { const lt = makeText(this, tx, 37, '잠김', { size: 12, bold: true, color: CSS.dangerText, origin: [0, 0.5] }); row.add(lt); tx += lt.width + 6; }
                }
                const chipW = isRec ? 52 : 0;
                row.add(fitText(makeText(this, tx, 37, s.name, { size: cols > 1 ? 18 : 17, bold: true, color: c, origin: [0, 0.5] }), cw - tx - 14 - chipW));
                if (isRec) {
                    row.add(this.add.rectangle(cw - 14 - 44, 27, 44, 20, COLOR.accent, 0.95).setOrigin(0));
                    row.add(makeText(this, cw - 14 - 22, 37, '추천', { size: 12, bold: true, color: '#1A1406', origin: [0.5, 0.5] }));
                }
                // 캠페인: 목표 유형 병기(생존 목표만 강조색). 기존 스테이지(chapter 0)는 목표 문구 생략(전부 지휘관 격파)
                const wr = normRules(s.stage_rules ?? s.rules); // 승패 규칙(only/all) 있으면 그 라벨, 없으면 기존 짧은 목표
                const objTxt = stageChapter(s) > 0 ? `   목표 ${wr && ['only', 'all'].includes(wr.mode) ? goalLines(s.objective, wr).join(' · ') : objectiveShort(s.objective)}` : '';
                row.add(fitText(makeText(this, 14, 60, `난이도 ${stars(s.difficulty, 6)}   권장 Lv.${s.recommended_level}${objTxt}`, { size: 12, color: s.objective?.type === 'survive_turns' ? '#9fd8c8' : '#C9C2AE', origin: [0, 0.5] }), cw - 28));
                row.add(fitText(makeText(this, 14, 78, `보상  EXP ${s.rewards.user_exp} · 영웅 EXP ${s.rewards.exp} · 골드 ${s.rewards.gold}`, { size: 12, color: CSS.accent, origin: [0, 0.5] }), cw - 28));
                const lockMsg = stageLockText(s); // 선행 사유 우선 + '필요 영웅: ...'
                const joinTxt = s.join_hero?.length && !(s.clear_count > 0) ? `  · 합류 ${s.join_hero.map(heroNameOf).join(', ')}` : ''; // 첫 클리어 합류 영웅(클리어 후엔 생략)
                const st = ok ? (s.clear_count > 0 ? `최고 ${stars(s.best_stars)}  클리어 ${s.clear_count}회` : `미클리어${joinTxt}`) : lockMsg;
                row.add(fitText(makeText(this, 14, 96, st, { size: 12, color: ok ? CSS.accent : CSS.dangerText, origin: [0, 0.5] }), cw - 28));
                list.content.add(row);
            });
            y += Math.ceil(g.items.length / cols) * (rowH + gap) + 8;
        });
        list.setContentHeight(y + 12);
        list.refreshMask();
    }

    // ---------- 이어하기(중간 저장) ----------
    // 서버가 스테이지 전투를 행동마다 저장 -> GET /api/battles/active 로 진행 중 전투 조회. 실패하면 빈 목록(로비 동작에 영향 없음)
    async activeBattles() { try { return await gameApi.battle.active(); } catch (e) { console.warn('[resume] 진행 중 전투 조회 실패', e); return { battles: [], maxOpen: 3 }; } }

    // 본문 상단 오른쪽(서브 탭 줄) '이어하기 (스테이지명 · N턴)' 버튼(메인 스토리 탭·스테이지 지도 폴백). 이어하기는 하나만: 진행 중 전투가 여러 개여도 가장 최근 1건(서버 응답 최근순 첫 건)
    async addResumeButton(p, w) {
        const { battles } = await this.activeBattles();
        if (!p.scene || this.panel !== p || !battles.length) return;
        let used = 200; // 서브 탭(또는 제목) 폭
        try { if (this.subTabs?.scene && this.subTabs.parentContainer === p) used = Math.min(w, this.subTabs.getBounds().width); } catch { /* 기본값 */ }
        const bw = Math.max(120, Math.min(300, w - used - 8));
        const one = battles[0];
        const st1 = one.status === 'deployment' ? '배치 중' : `${one.turn}턴`;
        // 좁은 버튼(390 등 폭 220 미만): 스테이지명 생략(하플레이 #8 라벨 잘림). 스테이지명은 탭 후 진입 화면에서 보인다
        const label = bw < 220 ? `이어하기 · ${st1}` : `이어하기 (${one.stage_name ?? '전투'} · ${st1})`;
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
        const go = async () => {
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
                new Modal(this, { title: '열린 전투 상한', body: `진행 중인 전투가 ${act.battles.length}개입니다(최대 ${act.maxOpen}개).
새로 도전하면 가장 오래된 '${old?.stage_name ?? '전투'}' 전투가 자동으로 포기 처리됩니다.`, w: 540, h: 240,
                    buttons: [{ label: '취소' }, { label: '그래도 도전', variant: 'danger', onClick: () => this.pickStage(s, { ...opts, direct: true, fresh: true, capOk: true }) }] });
                return;
            }
            try {
                const r = await gameApi.challenge(s.id);
                const deploy = { scene: 'Deploy', data: { mode: 'stage', battleId: r.battle.battle_id, info: r.deployment, stageName: s.name, stageCode: s.code } };
                // 캠페인: 미시청 장 시작(ch1_open)·스테이지 전(<code>_pre) 대사를 재생한 뒤 배치 화면으로
                if (camp) await playBeforeStage(this, s, deploy); else this.scene.start(deploy.scene, deploy.data);
            } catch (e) {
                if (e?.code === 'required_hero_missing') { this.heroMissingModal(missingHeroesOf(e.details ?? {})); return; } // 원시 서버 문구 대신 영웅 이름 안내
                alertModal(this, '도전 실패', messageOf(e));
            }
        };
        if (opts.direct) { go(); return; }
        // 소탕(2026-11-04, docs/SHOP_EXCHANGE_SPEC.md §2): 직접 3성 클리어한 스테이지만 확인창에 '소탕' 버튼(전투 없이 보상만, 일일 한도 공유)
        const sweepBtn = (Number(s.best_stars) || 0) >= 3 ? [{ label: '소탕', onClick: () => this.time.delayedCall(0, () => this.openSweep(s)) }] : [];
        if (!camp && !sweepBtn.length) { confirmModal(this, s.name, body, go, { okLabel: '출정' }); return; }
        new Modal(this, { title: s.name, body, w: 520, h: Math.min(L.lh - 24, 200 + body.split('\n').length * 24), buttons: [{ label: '취소' }, ...sweepBtn, { label: '출정', variant: 'primary', onClick: go }] });
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
    heroMissingModal(missing) {
        const body = `${missingHeroText(missing) || '필요 영웅을 보유하지 않았습니다.'}
영웅을 영입하면 출정할 수 있습니다.`;
        const buttons = [{ label: '닫기' }];
        if (gachaOn()) buttons.push({ label: '소집으로 이동', variant: 'primary', onClick: () => this.goGacha() });
        new Modal(this, { title: '출정 불가', body, w: 460, h: 220, buttons });
    }

    goGacha() { if (!gachaOn()) return; this.selectTab('gacha'); }

    // 코드에서 탭 이동(하단 바 강조 동기화: 그룹 모드면 그 탭이 든 그룹 버튼)
    selectTab(key) { this.tabBar?.setActive(groupsOn() ? groupOf(key).key : key); this.show(key); }

    // ---------- 영웅 ----------
    async tabHero(p) {
        // 주인공(protagonist:true)은 영웅 카드 목록에서 제외 -> '주인공' 서브 탭(tabProtagonist)에서 스테이터스 확인(fe-proto 2026-11-03, 사용자 지시)
        const heroes = [...(await gameApi.heroes(!this.softShow))].filter((h) => !h.protagonist).sort((x, y) => compareRarity(x.rarity, y.rarity) || (y.level - x.level));
        if (!p.scene) return;
        this.done();
        const a = this.area;
        const list = new ScrollList(this, { x: a.x, y: a.y, w: a.w, h: a.h, clip: true, bar: true });
        p.add(list);
        if (!heroes.length) { list.content.add(emptyState(this, { w: a.w, msg: '보유 영웅이 없습니다', sub: '스테이지를 클리어하거나 뽑기로 영웅을 얻으세요.', cta: gachaOn() ? '뽑기로 이동' : '스테이지로 이동', onCta: () => this.selectTab(gachaOn() ? 'gacha' : 'stage') })); return; }
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
        // 주인공 이름: 서브 탭 줄 오른쪽 빈 자리(서브 탭 폭 = 2 x 120|160)에 오른쪽 정렬. 자리가 부족하면 생략
        const nameW = p.w - (this.subTabs?.scene ? this.subTabs.x + Math.min(p.w, 2 * (L.portrait ? 120 : 160)) : 160) - 12;
        if (nameW >= 60) p.add(fitText(makeText(this, p.w, 16, heroPlainName(hh), { size: 15, bold: true, color: CSS.accent, origin: [1, 0.5], stroke: { color: '#0B1020', width: 3 } }), nameW, { fallback: heroShortName(hh) }));
    }

    // 등급 표식: 도트 badge.rarity.<R> + 별(pix.star/star_empty). 아틀라스 없으면 기존 텍스트(S ★★★★). 좌상단 (x, y)
    rarityTag(rarity, x, y, textStyle) {
        const mk = rarityMark(this, rarity, { size: Math.round((textStyle?.size ?? 12) * 1.3) });
        return mk ? mk.setPosition(x, y) : makeText(this, x, y, rarityBadge(rarity), textStyle);
    }

    // Lv 표식(pix.level + 숫자, 가운데 정렬 cx, cy). 아틀라스 없으면 텍스트. 영웅 코스트는 2026-11-08 사용자 요청으로 영웅 정보 화면에서 제거(편성 화면에서만 표시)
    lvTag(hh, cx, cy, size) {
        const lv = pixelLabel(this, 'pix.level', `Lv.${hh.level}`, makeText, { size: size + 2, textStyle: { color: CSS.accent } });
        if (!lv) return makeText(this, cx, cy, `Lv.${hh.level}`, { size, color: CSS.accent, origin: [0.5, 0.5] });
        const c = this.add.container(0, 0);
        const lw = lv.w; // Phaser 4 Container.setPosition 이 .w 를 0 으로 덮어써 먼저 보관
        lv.setPosition(cx - lw / 2, cy);
        c.add(lv);
        return c;
    }

    heroCard(hh, x, y, w, h, onClick, selected = false, art = false) {
        const c = (art && heroMenuCard(this, hh, x, y, w, h, selected)) || this.add.container(x, y);
        c.clipH = h;
        if (!c.cardArt) {
        const bg = slice(this, `${raritySlotKey(hh.rarity)}`, w, h, 'slot');
        c.add(bg);
        if (selected) c.add(this.add.rectangle(4, 4, w - 8, h - 8, COLOR.accentLight, 0.18).setOrigin(0));
        const sub = hh.title && h - 6 - 70 >= 50 ? hh.title : ''; // U14: 칭호는 이름 위 부제(공간 있을 때만)
        const ph = h - 6 - 58 - (sub ? 12 : 0); // 초상화 높이(아래 이름·Lv 2줄 48 + 하단 프레임 장식 여유 10, Low-3: Lv 줄이 장식에 잘림). 병종은 우상단 뱃지로
        if (ph >= 50) {
            // 초상화 카드: 초상화(지연 로드, 폴백 스프라이트/이니셜) + 등급 배지 + 이름·칭호 + Lv
            c.portrait = portraitBox(this, hh, 6, 6, w - 12, ph, { lazy: true }); // 보이는 카드만 로드(lazyPortraits)
            c.add(c.portrait);
            c.add(this.rarityTag(hh.rarity, 10, 9, { size: 12, heading: true, color: rarityCss(hh.rarity), stroke: { color: '#0B1020', width: 3 } }));
            let ny = ph + 6;
            if (sub) { c.add(fitText(makeText(this, w / 2, ny + 8, sub, { size: 12, color: CSS.muted, origin: [0.5, 0.5] }), w - 12)); ny += 12; }
            c.add(fitText(makeText(this, w / 2, ny + 14, heroPlainName(hh), { size: w < 130 ? 13 : 15, bold: true, origin: [0.5, 0.5] }), w - 10, { fallback: heroShortName(hh) }));
            c.add(this.lvTag(hh, w / 2, ny + 30, 12));
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
            const vertical = w < 140;
            const bs = Math.round(Math.max(18, Math.min(30, w * (vertical ? 0.19 : 0.17))));
            const tb = troopBadges(this, { heroClass: ut, troopClass: tt, troopLabel: tl, size: bs, vertical });
            tb.setPosition(w - 8 - tb.w, 8);
            c.add(tb);
        }
        return c;
    }

    heroDetail(hh) {
        // 레이아웃: 와이드 = 좌(큰 초상화 + 전투 유닛 스프라이트) / 우(섹션 카드 스크롤: 2열 + 전폭 표), 좁은 화면 = 상(초상화·스프라이트) / 하(섹션 1열)
        // 섹션: 기본 정보 · 능력치 · 병종 · 장비 (라벨-값 표) / 스킬 (표) / 역사적 설명 (라벨-값 + 요약 박스, 서버 미제공 시 숨김)
        const W = Math.min(1180, L.lw - 24); const H = Math.min(720, L.lh - 24);
        // 주인공(서버 protagonist:true): '열람 카드' = 초상화 변경(PUT face)·다시 작성(재검사) 진입. 돌아오면 주인공 탭(영웅 카드 목록에서는 주인공 제외)
        const protoBtn = hh.protagonist ? [{ label: '열람 카드', onClick: () => this.openProtoCard() }] : [];
        const m = new Modal(this, { title: heroPlainName(hh), w: W, h: H, buttons: [...protoBtn, { label: '장비', variant: 'primary', onClick: () => openEquipment(this, hh, () => sessionCache.setHeroes(null), { onDetail: () => this.heroDetail(hh) }) }, { label: '닫기' }], footer: true });
        // 표·섹션 영역은 하단 고정 버튼 바(footerY) 위까지만
        const bodyH = m.footerY - (m.panel.bodyY + 12) - 8;
        this.heroStatusBody(m.inner, hh, { x: 24, y: 0, w: W - 48, h: bodyH, wide: W >= 760 || L.short }); // 가로 폰(667 포함)은 좌우 배치(세로 쌓기면 스크롤 영역이 28px)
    }

    // 주인공 열람 카드(초상화 변경·다시 작성) 진입. 돌아오면 주인공 탭 + 영웅 목록 재조회(초상화 갱신)
    openProtoCard() { sessionCache.setHeroes(null); openCharacterCreate(this, { mode: 'create', next: { scene: 'Lobby', data: { tab: 'protagonist' } } }); }

    // 영웅 스테이터스 본문(초상화·스프라이트 + 기본 정보·능력치·(오라)·장비·스킬·역사 섹션). 영웅 상세 모달과 주인공 탭이 공용
    // tgt: 담을 컨테이너, (ix, iy, iw, bodyH): 영역, wideM: 좌우 배치 여부
    heroStatusBody(tgt, hh, { x: ix, y: iy = 0, w: iw, h: bodyH, wide: wideM }) {
        const skills = (hh.detail?.skills ?? []).filter((k) => k && k.name);
        const tl = hh.troop_label ?? hh.detail?.troop_label;
        const ut = hh.unit_type ?? hh.detail?.unit_type;
        const aura = hh.aura ?? hh.detail?.aura;
        const st = hh.detail?.stats;
        const eqT = hh.equip_total;
        // 역사 프로필(서버 미제공 시 섹션 숨김): profile{era,region,role,summary,evidence_level,needs_verify} — BE 요청 필드
        const pf = hh.profile ?? hh.detail?.profile ?? null;
        // 비주얼 영역
        // 가로 폰(L.short, 와이드): 왼쪽 열 = 초상 + 스프라이트 상자를 본문 높이 안에 나눠 담는다(상자 = 본문 40% 최대 110, 초상 = 나머지, 폭 = 높이/1.3)
        const sbH0 = wideM && L.short ? Math.min(110, Math.round(bodyH * 0.4)) : 0;
        const pw = wideM ? (L.short ? Math.max(90, Math.min(280, Math.floor(iw * 0.28), Math.round((bodyH - sbH0 - 8) / 1.3))) : Math.min(280, Math.floor(iw * 0.28))) : Math.min(150, Math.floor(iw * 0.42));
        const phh = wideM ? (L.short ? Math.max(80, bodyH - sbH0 - 8) : Math.min(Math.round(pw * 1.3), bodyH - 140)) : Math.round(pw * 1.25);
        tgt.add(sCard(this, hh, ix, iy, pw, phh, (x0, y0, sl) => portraitBox(this, hh, x0, y0, pw, phh, { focus: 0.02, thumb: false, bare: sl }))); // 상세: 원본(S 등급 = 배경 판 -> 인물 -> 등급 프레임 -> 장식)
        const rTag = this.rarityTag(hh.rarity, ix + 8, iy + 6, { size: 14, heading: true, color: rarityCss(hh.rarity), stroke: { color: '#0B1020', width: 3 } });
        tgt.add(rTag);
        // 병종 뱃지(초상화 우상단). 좁은 초상(390 등)에서 등급 별과 겹치면 세로로 쌓고, 그래도 겹치면 별 줄 아래로 내린다(강화면 Low: 별 4개가 3개로 가려 보임)
        if (ut) {
            // 등급 표식 실제 폭: 컨테이너(rarityMark)는 width 가 0 이라 겹침 판정이 빠져 별 4번째가 병종 뱃지에 가렸다(강화면 gacha41 Low, 390) -> getBounds 우선
            const rbx = rTag.getBounds?.(); const rw = (rbx?.width || 0) > 0 ? rbx.width : (rTag.w ?? rTag.displayWidth ?? rTag.width ?? 0); const rh = (rbx?.height || 0) > 0 ? rbx.height : (rTag.h ?? rTag.displayHeight ?? rTag.height ?? 18);
            const mk = (vertical) => troopBadges(this, { heroClass: ut, troopClass: hh.troop_type ?? hh.detail?.troop_type, troopLabel: tl, size: wideM ? 34 : 26, vertical });
            let tb = mk(false);
            if (ix + 8 + rw + 6 > ix + pw - 6 - tb.w) { tb.destroy(); tb = mk(true); }
            const below = ix + 8 + rw + 6 > ix + pw - 6 - tb.w;
            tb.setPosition(ix + pw - 6 - tb.w, below ? iy + 6 + rh + 4 : iy + 6);
            tgt.add(tb);
        }
        const sbW = wideM ? pw : Math.min(120, iw - pw - 12); const sbH = wideM ? Math.min(128, bodyH - phh - 8) : phh;
        const sbx = wideM ? ix : ix + pw + 12; const sby = iy + (wideM ? phh + 8 : 0);
        if (sbW >= 60 && sbH >= 60) {
            tgt.add(this.sectionBg(sbx, sby, sbW, sbH, 0.7));
            // 2026-11-03 사용자 요청: 영웅 유닛 오른쪽에 일반 병사(troop_type) 스프라이트를 나란히.
            // 2026-11-08 사용자 요청: 아래 캡션('전투 유닛 · <병종>' / '병사 · <병종>') 제거 -> 캡션 자리 없이 칸 세로 가운데에 배치
            const trT = troopTypeOf(hh);
            const spS = trT ? Math.max(24, Math.min(Math.floor(sbW * 0.44), sbH - 24)) : Math.min(sbW, sbH) - 24;
            const spY = sby + sbH / 2;
            const hx = trT ? sbx + sbW * 0.3 : sbx + sbW / 2; const qx = sbx + sbW * 0.72;
            const shadow = (x) => tgt.add(this.add.ellipse(x, spY + spS / 2 - 4, Math.min(44, spS * 0.7), 10, 0x000000, 0.35));
            // 영웅 스프라이트: 전용 시트가 아직 안 왔는데 같은 문화권·병종 공용 시트가 이미 로드돼 있으면(병사 스프라이트·다른 화면이 받음) unitTex 가 공용을 돌려준다.
            // 그래서 항상 전용 시트 지연 로드를 먼저 요청하고(받을 것이 있으면 true), 도착하면 공용으로 그린 것을 전용으로 바꿔 그린다(사용자 제보 2026-11-03: 마르쿠스가 공용 보병으로 표시)
            let heroObjs = [];
            const putSp = () => { const sp = heroSprite(this, hh, hx, spY, spS); if (!sp) return false; heroObjs.forEach((o) => o.destroy()); const sh = this.add.ellipse(hx, spY + spS / 2 - 4, Math.min(44, spS * 0.7), 10, 0x000000, 0.35); tgt.add([sh, sp]); heroObjs = [sh, sp]; return true; };
            const drawn = putSp();
            const wait = drawn ? null : makeText(this, hx, spY, trT ? '준비 중' : '스프라이트 준비 중', { size: 12, color: CSS.muted, origin: [0.5, 0.5] });
            if (wait) tgt.add(wait);
            ensureHeroSprite(this, hh, () => { if (!tgt.scene) return; if (putSp()) wait?.destroy(); }); // 이 영웅 시트 1장만 지연 로드(전용 > 문화권 > 공용 중 manifest 의 첫 후보)
            if (trT) {
                // 병사도 영웅 칸과 같은 방식(강화면 gacha41 Low): 공용 시트가 이미 있으면 먼저 그리고, 문화권 시트(korea_sword 등)를 항상 요청해 도착하면 교체
                let trObjs = [];
                const putTr = () => { const sp = troopSprite(this, hh, qx, spY, Math.round(spS * 0.86)); if (!sp) return false; trObjs.forEach((o) => o.destroy()); const sh = this.add.ellipse(qx, spY + spS / 2 - 4, Math.min(44, spS * 0.7), 10, 0x000000, 0.35); tgt.add([sh, sp]); trObjs = [sh, sp]; return true; }; // 병사는 영웅보다 조금 작게
                const trDrawn = putTr();
                const w2 = trDrawn ? null : makeText(this, qx, spY, '준비 중', { size: 12, color: CSS.muted, origin: [0.5, 0.5] });
                if (w2) tgt.add(w2);
                const trLoading = ensureTroopSprite(this, hh, () => { if (!tgt.scene) return; if (putTr()) w2?.destroy(); });
                if (!trLoading && w2) { w2.destroy(); tgt.add(troopIcon(this, trT, qx, spY, Math.min(32, spS), { max: spS })); } // 받을 시트도 없고 그린 것도 없으면 병종 아이콘(단일 소스)
            }
        }
        // 정보 영역(스크롤) — 섹션 카드
        const tx = wideM ? ix + pw + 16 : ix; const ty0 = wideM ? 0 : phh + 12;
        const tw = wideM ? iw - pw - 16 : iw; const th = bodyH - ty0 - 8; // 하단 버튼 바와 8 간격(U01 겹침)
        const list = new ScrollList(this, { x: tx, y: iy + ty0, w: tw, h: Math.max(80, th), clip: true, bar: true }); // U01: 스크롤바 + 하단 페이드(스킬 표 등 아래 내용 단서) // clip: 경계에 걸친 섹션 카드가 모달 밖·초상화 위로 비치지 않게 픽셀 클리핑(Mid-1)
        tgt.add(list);
        const gap = 10;
        // 섹션 카드: 배경 + 제목(18) + 본문 컨테이너. build(c, innerW) 가 본문 높이를 반환
        const section = (title, w, build, chipText, chipColor) => {
            const c = this.add.container(0, 0);
            const body = this.add.container(12, 40);
            const t = makeText(this, 12, 20, title, { size: 18, heading: true, color: '#f0d58c', origin: [0, 0.5] });
            const bh = build(body, w - 24);
            c.add(this.sectionBg(0, 0, w, bh + 52, 0.8));
            c.add(t);
            if (chipText) { const ct = makeText(this, w - 14, 20, chipText, { size: 12, bold: true, origin: [1, 0.5] }); c.add(this.add.rectangle(ct.x - ct.width - 6, 10, ct.width + 12, 20, chipColor ?? COLOR.ink, 0.9).setOrigin(0)); c.add(ct); }
            c.add(body);
            c.h = bh + 52; c.clipH = c.h;
            return c;
        };
        const kv = (pairs) => (c, w) => { const tb = kvTable(this, { w, pairs, labelW: Math.min(110, Math.round(w * 0.36)), size: 14 }); c.add(tb); return tb.h; };
        const cols = wideM && tw >= 640 ? 2 : 1;
        const colW = Math.floor((tw - gap * (cols - 1)) / cols);
        const small = [
            ['기본 정보', kv([
                ...(hh.title ? [['칭호', { text: hh.title, color: CSS.accent, bold: true }]] : []),
                ['등급', { text: `${rarityLabel(hh.rarity)} ${'★'.repeat(RARITY_STARS[normRarity(hh.rarity)] ?? 1)}`, color: rarityCss(hh.rarity) }], // 'S등급 ★★★★'(S 중복 제거, 2026-11-08 강화면 Low)
                ['레벨', `Lv.${hh.level}  (EXP ${fmtNum(hh.exp)}${(() => { const need = Number(hh.level_info?.exp_to_next ?? hh.exp_to_next); return need > 0 ? ` / 다음까지 ${fmtNum(Math.max(0, need - (Number(hh.exp) || 0)))}` : ''; })() /* exp_to_next = 현재 레벨 필요 총량, exp = 레벨 안 누적 -> 남은 양 = 총량 - 현재 */})`],
                ...(hh.level_info?.next_reward?.label && hh.level_info.next_reward.level != null ? [['다음 레벨 보상', { text: `Lv.${hh.level_info.next_reward.level} ${hh.level_info.next_reward.label}`, color: CSS.accent }]] : []), // 박백엔 level_info.next_reward(없으면 생략)
                // 코스트·성급·조각 줄은 2026-11-08 사용자 요청으로 제거(코스트는 편성 화면, 조각은 가챠 결과에서 표시)
            ])],
            ['능력치', st ? (c, w) => { // 공격·방어 = 라벨 + 게이지 + 숫자(사용자 2026-11-04: 영웅 체력은 고정 10이라 능력치에서 제외. 장비 체력(병력) 보너스는 장비창·장비 칩에서만)(ui/StatGauges, 상한 STAT_GAUGE_CAP, 장비분 금색 + '(+N)'), 그 아래 성장률·기준은 표
                const sn = hh.level_info?.stats_now; // 현재 레벨 능력치(서버 level_info.stats_now). 있으면 게이지를 현재 값으로, 없으면 Lv.1 기본값
                const gs = statGauges(this, { w, rows: [...((sn?.mp_max ?? st.mp_max) != null ? [{ key: 'mp', label: '마력', base: sn?.mp_max ?? st.mp_max }] : []), { key: 'atk', label: '공격', base: sn?.atk ?? st.atk, bonus: eqT?.atk }, { key: 'def', label: '방어', base: sn?.def ?? st.def, bonus: eqT?.def }] });
                c.add(gs);
                const tb = kvTable(this, { y: gs.h + 4, w, labelW: Math.min(110, Math.round(w * 0.36)), size: 14, pairs: [
                ...(st.growth_atk_pct != null || st.growth_def_pct != null ? [['성장률', [st.growth_atk_pct != null ? `공격 ${st.growth_atk_pct}%` : '', st.growth_def_pct != null ? `방어 ${st.growth_def_pct}%` : ''].filter(Boolean).join(' · ')]] : []), // 값 없으면 'undefined' 대신 생략(정검수)
                ['기준', { text: sn ? `현재 Lv.${hh.level ?? 1} 능력치 (괄호·금색 = 장비)` : `Lv.1 기본값 · 현재 Lv.${hh.level ?? 1}은 성장률만큼 더 높음 (괄호·금색 = 장비)`, color: CSS.muted, size: 12 }], // 하플레이 gacha104: Lv2 인데 Lv.1 수치로 읽힘(서버가 레벨별 수치를 주지 않아 표기만 명확히)
                ] });
                c.add(tb);
                return gs.h + 4 + tb.h;
            } : kv([['능력치', { text: '정보 없음', color: CSS.muted }]])],
            ...(Array.isArray(hh.level_info?.milestones) && hh.level_info.milestones.length ? [['성장 보상', (c, w) => { // 레벨 마일스톤(level_info.milestones[{level,label,reached}]): 도달 = 녹색 체크, 미도달 = 회색 원
                const rh = 24; let yy = 0;
                hh.level_info.milestones.forEach((m) => {
                    const cy = yy + rh / 2; const g = this.add.graphics();
                    if (m.reached) g.fillStyle(0x3fae5a, 1).fillCircle(8, cy, 7).lineStyle(2, 0xffffff, 1).lineBetween(4.5, cy, 7, cy + 3).lineBetween(7, cy + 3, 12, cy - 3);
                    else g.lineStyle(1.5, 0x8a93a6, 1).strokeCircle(8, cy, 6.5);
                    c.add(g);
                    c.add(makeText(this, 22, cy, `Lv.${m.level}`, { size: 13, bold: true, color: m.reached ? CSS.allyText : CSS.muted, origin: [0, 0.5] }));
                    c.add(fitText(makeText(this, 76, cy, m.label ?? '', { size: 13, color: m.reached ? CSS.text : CSS.muted, origin: [0, 0.5] }), Math.max(40, w - 76)));
                    yy += rh;
                });
                return yy;
            }]] : []),
            // '병종' 섹션(영웅 병종·병사 표)은 2026-11-08 사용자 요청으로 제거(병종은 초상화 우상단 뱃지·툴팁으로 표시). 같은 카드에 있던 오라 행은 병종 정보가 아니라 별도 섹션으로 유지
            ...(aura ? [['오라', kv([['오라', { text: auraDesc(aura), color: CSS.accent }]])]] : []),
            ['장비', (c, w) => {
                const eq = hh.equipment ?? {};
                const tb = kvTable(this, { w, labelW: Math.min(110, Math.round(w * 0.36)), pairs: Object.entries(SLOT_KO).map(([k, lb]) => [lb, eq[k] ? { text: `${rarityBadge(eq[k].rarity)} ${eq[k].name}`, color: rarityCss(eq[k].rarity) } : { text: '비어 있음', color: CSS.muted }]) });
                c.add(tb);
                return tb.h;
            }],
        ];
        let y = 0;
        for (let i = 0; i < small.length; i += cols) {
            const row = small.slice(i, i + cols).map(([t, b], j) => { const c = section(t, colW, b); c.setPosition(j * (colW + gap), y); return c; });
            row.forEach((c) => list.content.add(c));
            y += Math.max(...row.map((c) => c.h)) + gap;
        }
        // 스킬 표: 구분 칩 · 스킬명 · 효과 요약 · 조건/쿨다운 · 횟수 (준비 중 = 회색 행)
        if (skills.length) {
            const narrowT = tw < 560;
            const c = section(`스킬 (${skills.length})`, tw, (b, w) => {
                const typeKo = (k) => (k.type === 'active' ? '액티브' : k.type === 'passive' ? '패시브' : k.type ?? '-');
                const chipC = (k) => (k.type === 'active' ? 0x8a4a1c : 0x2f5d8a);
                // 좁은 표(390·667): 액티브 쿨다운·횟수 줄(강화면 gacha106: 넓은 표의 '조건 / 쿨다운'·'횟수' 열 내용이 좁은 표에서 빠짐). 값 없으면 생략
                const actLine = (k) => (k.type === 'active' ? (k.mp_cost != null ? `마력 ${k.mp_cost}` : [k.cooldown != null ? `쿨 ${k.cooldown}턴` : '', k.uses != null ? `${k.uses}회` : ''].filter(Boolean).join(' · ')) : ''); // MP 방식(mp_cost 있음) = '마력 N', 레거시 = 쿨·횟수
                const condOf = (k) => [k.condition, k.mp_cost != null ? `마력 ${k.mp_cost}` : k.cooldown != null ? `쿨 ${k.cooldown}턴` : ''].filter(Boolean).join(' · ') || '-'; // MP 방식은 쿨다운 대신 마력
                // T_TERRAIN_MASTER(지형 장인): 서버 효과 요약에 이동비용 할인 문구가 없으면 덧붙인다(params.move_discount.amount, 상세 응답에 params 가 없으면 데이터 기준 1)
                const effOf = (k) => { const e0 = k.effect || ''; if (k.template !== 'T_TERRAIN_MASTER' || /이동/.test(e0)) return e0 || '-'; const amt = Number(k.params?.move_discount?.amount ?? 1) || 1; return `${e0 ? `${e0} · ` : ''}해당 지형 이동 비용 -${amt}(최소 1)`; };
                // 스킬 아이콘 열(48, atlas skill_icons 지연 로드 — manifest 에 있을 때만 열 추가). 로드 전에는 칸만 두고 완료 시 아이콘을 얹는다. 해석 실패 행은 비움(빈 사각 없음)
                const withIco = skillIconsListed();
                const icoCol = withIco ? [{ label: '', width: 56, align: 'center' }] : [];
                const icoCell = withIco ? [''] : [];
                const colsT = narrowT
                    ? [...icoCol, { label: '구분', width: 64, align: 'center' }, { label: '스킬 · 효과', ratio: 1, wrap: true }]
                    : [...icoCol, { label: '구분', width: 70, align: 'center' }, { label: '스킬명', ratio: 1.1 }, { label: '효과 요약', ratio: 2, wrap: true }, { label: skills.some((k) => k.mp_cost != null) ? '조건 / 마력' : '조건 / 쿨다운', ratio: 1.3, wrap: true }, { label: '횟수', width: 52, align: 'center' }];
                const rows = skills.map((k) => ({ muted: k.enabled === false, cells: narrowT
                    ? [...icoCell, { text: typeKo(k), chip: chipC(k), size: 12, bold: true }, `${skillDisplayName(k.name)}${k.enabled === false ? ' (준비 중)' : ''}\n${effOf(k)}${k.condition ?`\n조건: ${k.condition}` : ''}${actLine(k) ? `\n${actLine(k)}` : ''}`]
                    : [...icoCell, { text: typeKo(k), chip: chipC(k), size: 12, bold: true }, { text: `${skillDisplayName(k.name)}${k.enabled === false ? ' (준비 중)' : ''}`, bold: true }, effOf(k), condOf(k), k.mp_cost == null && k.uses != null ? `${k.uses}회` : '-'] }));
                const tb = new TableView(this, { w, cols: colsT, rows, rowH: withIco ? 56 : 38, size: 14 });
                b.add(tb);
                if (withIco) {
                    const put = () => {
                        if (!tb.scene) return; // 모달이 닫혀 표가 파괴됨
                        const col = tb.colBoxes[0];
                        skills.forEach((k, i) => {
                            const rb = tb.rowBoxes[i];
                            const f = rb && skillIconFrame(this, k.code, { kind: k.type === 'active' ? 'active' : k.type === 'aura' ? 'aura' : 'passive', unitType: ut, template: k.template });
                            const ic = f ? skillIconImage(this, f, col.x + col.w / 2, rb.y + Math.min(rb.h, 56) / 2, 48) : null;
                            if (ic) { if (k.enabled === false) ic.setAlpha(0.45); tb.add(ic); }
                        });
                    };
                    if (skillIconsReady(this)) put(); else ensureSkillIcons(this, (ok) => { if (ok) put(); });
                }
                return tb.h;
            });
            c.setPosition(0, y); list.content.add(c); y += c.h + gap;
        }
        // 역사적 설명(BE GameData::heroProfile, 스펙 database/data/HERO_HISTORY_SPEC.md): one_line 헤더 · 시대/지역/역할/생애 표 · 요약 박스(좁은 화면 긴 글 '더 보기')
        // · 전투 스타일 · 일화(있을 때만, 전승/검증 필요 태그) · 인연(최대 3 + 외 N명) · game_note. 필드 없으면 해당 블록 숨김, 전부 없으면 섹션 숨김(근거 없는 창작 금지)
        const hasHist = pf && (pf.summary || pf.era || pf.region || pf.role || pf.one_line || pf.life || pf.battle_style || pf.anecdote?.text || pf.relations?.length);
        const histY = y;
        let histC = null; let noteT = null; let sumOpen = false;
        const renderTail = () => {
            histC?.destroy(); noteT?.destroy(); histC = null;
            let yy0 = histY;
            if (hasHist) { histC = this.historySection(pf, tw, section, { open: sumOpen, onToggle: () => { sumOpen = !sumOpen; this.time.delayedCall(0, () => { if (!list.scene) return; const keep = list.content.y; renderTail(); list.scrollTo(Math.max(keep, -histY)); }); } }); /* 펼침/접기 후 스크롤 보정: 이전 위치 유지하되 역사 섹션 머리(소개 줄)가 위 경계 밖으로 나가지 않게(강화면 18차 390) */ histC.setPosition(0, yy0); list.content.add(histC); yy0 += histC.h + gap; }
            // 등급 면책 문구는 화면 정리로 제거(2026-11-02, docs/PRE_RELEASE_NOTICES.md 에 보존)
            list.setContentHeight(yy0 + 8);
            list.refreshMask();
        };
        renderTail();
    }

    // 영웅 상세 '역사적 설명' 섹션 카드(heroDetail 의 section 빌더 사용). open: 요약 펼침 여부, onToggle: '더 보기/접기'
    historySection(pf, tw, section, { open = false, onToggle = null } = {}) {
        // 근거 수준·전승·검증 필요·game_note 표기는 렌더하지 않는다(사용자 방침 2026-11-03, 데이터 필드는 유지)
        const REL_KO = { ally: '동맹', rival: '라이벌', mentor: '스승·제자', kin: '혈연', lord_vassal: '군신', same_event: '같은 사건', lineage: '계보' };
        const SUM_CUT = 110; // 좁은 화면(390px 등)에서 이보다 긴 요약은 접어 둔다
        // 접기 사용 안 함(2026-11-03 강화면 17~19차: 390 상세에서 '더 보기'가 반영되지 않는 결함 반복). 상세 본문은 이미 스크롤 목록이라 요약 전문을 항상 그대로 보여 준다.
        // 되돌리려면 아래를 tw < 560 && 길이 > SUM_CUT + 10 으로(렌더·토글 코드는 남겨 둠)
        const fold = false && tw < 560 && String(pf.summary ?? '').length > SUM_CUT + 10;
        // 정렬 규칙(2026-11-03 사용자 요청 '정렬이 안 맞고 지저분함'): 모든 소제목·본문 왼쪽 x=0 정렬, 문단은 같은 글자 크기(14)·줄 간격(4)·문단 간격(GAP).
        // 긴 글(요약·전투 스타일·일화)은 같은 '인용' 모양(왼쪽 금색 세로줄 + 들여쓰기 IND) 하나로 통일. 라벨-값 항목(시대·지역·역할·생애, 인연)은 같은 폭의 표(kvTable)로 정렬
        return section('역사적 설명', tw, (b, w) => {
            const GAP = 14; const IND = 14; const LS = 4;
            const labelW = Math.min(110, Math.round(w * 0.36)); // 영웅 상세 다른 표(기본 정보 등)와 같은 라벨 폭
            let yy = 0;
            const gap = () => { if (yy > 0) yy += GAP; };
            const sub = (txt) => { gap(); const t = makeText(this, 0, yy, txt, { size: 13, bold: true, color: '#d9c08a' }); b.add(t); yy += t.height + 6; };
            const para = (txt, { quote = true } = {}) => {
                const x = quote ? IND : 0;
                const t = makeText(this, x, yy, txt, { size: 14, wrap: w - x - 4 }).setLineSpacing(LS);
                if (quote) b.add(this.add.rectangle(0, yy + 1, 3, Math.max(8, t.height - 2), COLOR.accent, 0.55).setOrigin(0));
                b.add(t); yy += t.height;
                return t;
            };
            if (pf.one_line) { const t = makeText(this, 0, yy, pf.one_line, { size: 16, bold: true, color: '#f0d58c', wrap: w - 4 }).setLineSpacing(LS); b.add(t); yy += t.height; }
            const facts = [pf.era && ['시대', pf.era], pf.region && ['지역', pf.region], pf.role && ['역할', pf.role], pf.life && ['생애', pf.life]].filter(Boolean);
            if (facts.length) { gap(); const tb = kvTable(this, { y: yy, w, labelW, size: 14, pairs: facts }); b.add(tb); yy += tb.h; }
            if (pf.summary) {
                const s = String(pf.summary);
                sub('요약');
                para(fold && !open ? `${[...s].slice(0, SUM_CUT).join('').trimEnd()}…` : s);
                // 영웅 상세는 모달 안: modal:true 가 없으면 modalCount>0 이라 usable() 가 거짓(클릭 무반응)
                if (fold && onToggle) { yy += 8; b.add(new Button(this, { x: w - 100, y: yy, w: 100, h: 32, label: open ? '접기' : '더 보기', size: 13, modal: true, onClick: onToggle })); yy += 32; }
            }
            if (pf.battle_style) { sub('전투 스타일'); para(pf.battle_style); }
            if (pf.anecdote?.text) { sub('일화'); para(pf.anecdote.text); }
            const rel = (Array.isArray(pf.relations) ? pf.relations : []).filter((r) => r?.name_ko);
            if (rel.length) {
                sub('인연');
                const tb = kvTable(this, { y: yy, w, labelW, size: 14, pairs: rel.slice(0, 3).map((r) => [r.name_ko, `${REL_KO[r.type] ?? r.type ?? '관계'}${r.note ? ` — ${r.note}` : ''}`]) });
                b.add(tb); yy += tb.h;
                if (rel.length > 3) { const t = makeText(this, 0, yy + 4, `외 ${rel.length - 3}명`, { size: 13, color: CSS.muted }); b.add(t); yy += t.height + 4; }
            }
            return Math.max(0, yy + 4);
        }, '', COLOR.ink);
    }

    // ---------- 방 대전 ----------
    async tabRoom(p) {
        const a = this.area;
        // 시즌 전쟁 진입(제목 줄 오른쪽, 기존 Button). 국가 선택·시즌 지도는 scenes/War.js
        if (!groupsOn()) p.add(new Button(this, { x: p.w - 150, y: -6, w: 150, h: 44, label: '시즌 전쟁', variant: 'primary', size: 15, onClick: () => this.show('war') })); // 그룹 모드는 멀티 > 시즌 전쟁 서브 탭
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
        if (gachaSceneOn()) {
            this.done();
            this.stopGachaOverlay();
            this.scene.launch('Gacha', { rect: { y: this.barH, h: Math.max(240, L.lh - this.barH - this.tabH), x: this.railW || 0, w: L.lw - (this.railW || 0), logo: this.logoBox ? { x: this.logoBox.x, r: this.logoBox.x + this.logoBox.w, bottom: this.logoBox.bottom } : null }, backTab: this.preGachaTab ?? 'stage' }); // x·w = 왼쪽 세로 레일 오른쪽부터 화면 끝까지
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
            const retryable = e.code === 'network' || e.code === 'gacha_conflict' || e.code === 'db_busy' || e.status >= 500;
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
        const summary = [`골드 -${fmtNum(r.gold_spent)} · 남은 골드 ${fmtNum(r.gold)}`];
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

    // ---------- 더보기 ----------
    async tabMore(p) {
        this.done();
        const a = this.area;
        const w = Math.min(480, a.w); // 좁은 화면: 본문 폭 가득(이전 300 고정 = 390 에서 오른쪽이 비어 보임, 하플레이 #9)
        const items = [
            // fe45: 설정은 상단 바에서 내려와 여기(첫 항목). 글꼴 변경 시 더보기 탭으로 씬 재시작(기존 상단 버튼과 같은 콜백). 로그아웃은 여기만(확인 모달). 개발용 항목은 devMode() 에서만
            ['설정', () => openSettings(this, ({ fontChanged }) => { if (fontChanged) this.scene.restart({ tab: this.tab }); })],
            [session.kind === 'guest' ? '회원 가입(진행 데이터 유지)' : '계정 정보', () => (session.kind === 'guest' ? this.scene.start('Auth', { mode: 'register' }) : alertModal(this, '계정', `${session.name}\n${session.user?.email ?? ''}`))],
            ['로그아웃', () => this.logout()],
            ['상점 (장비·소모품)', () => this.show('shop')],
            ['공지', () => this.openNotices()],
            ['인벤토리', () => this.show('inventory')],
            ['튜토리얼 보기', () => this.scene.start('Dialogue', { source: 'tutorial', server: !session.profile?.tutorial?.done, stepIndex: 0, next: { scene: 'Lobby', data: { tab: 'more' } } })], // 이미 완료한 튜토리얼 재열람은 서버에 진행·건너뛰기를 보내지 않음
            ...(devMode() ? [['전투 프로토타입(오프라인)', () => this.scene.start('Battle', { fresh: true })], ['UI 스킨 데모', () => this.scene.start('UiDemo')]] : []),
        ];
        // 로그아웃은 맨 끝(위험 동작은 마지막, Danger 44)
        const oi = items.findIndex(([lb]) => lb === '로그아웃'); if (oi >= 0) items.push(...items.splice(oi, 1));
        if (this.wide()) {
            // 와이드: 가로 그리드(3~5열, 행 우선)로 화면 폭 전체 사용
            const gap = 14;
            const cols = this.gridCols(a.w, 240, gap, [3, 5]);
            const cw = Math.floor((a.w - gap * (cols - 1)) / cols);
            items.forEach(([label, fn], i) => p.add(new Button(this, { x: a.x + (i % cols) * (cw + gap), y: a.y + Math.floor(i / cols) * 72, w: cw, h: 58, label, size: 17, variant: label === '로그아웃' ? 'danger' : 'default', onClick: fn })));
            return;
        }
        // 항목이 늘어 세로 공간이 부족하면 2열
        const perCol = Math.max(1, Math.floor(a.h / 58));
        const cw = items.length > perCol ? Math.min(360, (a.w - 12) / 2) : w;
        items.forEach(([label, fn], i) => p.add(new Button(this, { x: a.x + Math.floor(i / perCol) * (cw + 12), y: a.y + (i % perCol) * 58, w: cw, h: 48, label, size: 17, variant: label === '로그아웃' ? 'danger' : 'default', onClick: fn })));
    }
}
