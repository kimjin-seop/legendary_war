import Phaser from 'phaser';
import { COLOR, CSS, MIN_TOUCH, view } from '../theme.js';
import { L, setupCamera } from '../layout.js';
import { session, sessionCache } from '../api/client.js';
import { gameApi, newGachaRequestId } from '../api/gameApi.js';
import { messageOf } from '../api/errors.js';
import { ensureScope, manifestHas, withVer } from '../assets.js';
import { ensurePortrait } from '../ui/PortraitCard.js';
import { makeText, addBackdrop, fitText, shrinkToFit } from '../ui/common.js';
import { Button } from '../ui/Button.js';
import { Modal } from '../ui/Modal.js';
import { alertModal, ScrollList } from '../ui/widgets.js';
import { icon, slice } from '../ui/skin.js';
import { showToast } from '../ui/Toast.js';
import { rarityColor, rarityCss, normRarity } from '../rarity.js';
import { heroPlainName, heroShortName, gachaShortName } from '../systems/names.js';
import { isInstant } from '../ui/motion.js';
import { audio, sfx } from '../audio.js';
import { LobbyScene } from './Lobby.js';
import { GachaReveal } from '../ui/GachaReveal.js';
import { troopIcon } from '../ui/GameIcons.js';
import { GACHA_KEYS, GACHA_TEXT, FEATURE_TAG_COLOR, FEATURED_MAX, texOr, has, ensureGachaFx, gradBand, featuredTex, dropFeaturedTex, pruneFeaturedTex, clipToRect, loadGachaUi, warmGachaFxCommon, loadGachaFxCommon, loadGachaFxRarity, loadGachaFxKeys, BANNER_THEMES, NORMAL_THEME, THEME_KEYS, HIDDEN_BANNER_KEYS, bannerArt, dynTint, KEYART_TINTS } from '../ui/gachaKeys.js';

// 영웅 소환 화면(로비 '뽑기' 탭에서 진입, 2026-11-03). 서버 API·상태는 로비 가챠 탭과 동일(GET /api/gacha, POST /api/gacha/pull, 같은 멱등 재시도 규칙).
// 구성: 상단 바(뒤로·제목·골드·확률 안내) / 좌측 세로 배너 목록(모바일 세로 = 상단 가로 스크롤 칩) / 우측 피처드 영웅 대형 초상 +
//   주황 태그·이름·등급 별·병종 / 하단 천장 게이지 + 1회·10회 소환 버튼. 공개 연출 = ui/GachaReveal.js(역사책).
// 배너: 서버에는 배너·배너별 확률 상승이 없다(단일 풀). 화면의 배너는 풀의 S 등급(없으면 A) 영웅을 '주목 영웅'으로 보여 주는 표시용이며
//   어느 배너에서 소환해도 같은 확률표(서버 rates)가 적용된다(화면에 명시). NEW 표시는 쓰지 않는다(2026-11-03 사용자 지시).
// 롤백: localStorage srpg.gachaScene=0 이면 로비 기존 가챠 탭(Lobby.tabGacha).

const fmtNum = (n) => Number(n ?? 0).toLocaleString('ko-KR');
const SEEN_KEY = 'srpg.gacha.seen';
const readSeen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? '[]')); } catch { return new Set(); } };
const writeSeen = (set) => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set].slice(-50))); } catch { /* 무시 */ } };
// 소환 요청 상태는 씬 실행(create)보다 오래 산다(정검수): 요청 대기 중 화면 크기 변경으로 씬이 재시작돼도
//   pending(재시도용 request_id, count+배너별)은 그대로 재사용하고(새 ID 재시도 = 이중 차감 방지), inFlight 동안 두 번째 요청을 막는다.
const pullState = { pending: {}, inFlight: false };
let runSeq = 0; // 씬 실행 번호: 이전 실행에서 시작한 요청의 완료 콜백이 재시작 뒤 실행을 구분하는 데 쓴다

export class GachaScene extends Phaser.Scene {
    constructor() { super('Gacha'); }

    // 로비 위 오버레이(2026-11-03 사용자 지시 "상하 메뉴 유지"): 로비가 scene.launch('Gacha', {rect}) 로 띄운다.
    // rect = 로비 상단 바 아래 ~ 하단 탭 위(논리 단위 {y, h}). 카메라는 전체 화면이지만 배경색 없음(투명) + 모든 내용을 rect 로 클리핑 -> 로비 상·하 메뉴가 그대로 보이고 눌린다.
    // 모달(확률·상세·오류)만 전체 화면. rect 가 없으면(단독 시작) 전체 화면 + 자체 상단 바.
    static carry = null; // 화면 크기 변경으로 로비가 다시 띄울 때 보던 결과(연출 중이었으면) 이어 표시
    init(data) {
        this.backTab = data?.backTab && data.backTab !== 'gacha' ? data.backTab : 'stage';
        this.selKey = data?.sel ?? GachaScene.carry?.sel ?? null;
        this.pendingResult = data?.result ?? GachaScene.carry?.result ?? null;
        GachaScene.carry = null;
        this.rect = data?.rect ?? null;
    }

    create() {
        this.nativeTried = new Set(); // 원어 타이틀 직접 로드 시도(씬 진입마다 초기화)
        this.modalCount = 0;
        this.runId = ++runSeq;
        this.busy = pullState.inFlight; // 이전 실행의 소환 요청이 아직 대기 중이면 버튼 잠금 유지(완료 시 pull 이 풀어 준다)
        this.reveal = null;
        this.info = null;
        this.featToken = 0;
        // 씬 인스턴스는 stop/start(로비 재시작·화면 크기 변경·탭 재진입) 사이에 재사용된다. InputPlugin.shutdown 이 씬 입력 리스너를 모두 지우므로
        // 1회 등록 플래그(listDragBound)·드래그 상태·꽃잎 참조를 실행마다 초기화한다(재시작 뒤 배너 목록 드래그 스크롤·휠 위치 기억이 죽던 문제)
        this.listDragBound = false; this.listDrag = null; this.listInertia = null; this.bannerList = null; this.chipInner = null; this.petals = null; this.layoutRestart = false;
        setupCamera(this); // 배경색 없음(로비가 비침)
        // 화면 크기 변경: 로비가 재시작하며 이 씬을 멈췄다가 다시 띄운다 -> 그 경우에만 보던 결과·배너를 넘긴다
        const onLayout = () => { this.layoutRestart = true; };
        this.game.events.on('layout', onLayout);
        this.events.once('shutdown', () => {
            this.game.events.off('layout', onLayout);
            if (this.layoutRestart) GachaScene.carry = { sel: this.selKey, result: this.reveal?.alive ? this.lastRes : null };
        });
        if (!session.authed) { this.scene.start('Title', { notice: '로그인 또는 게스트 시작이 필요합니다.' }); return; }
        audio.bgm(audio.lobbyBgm(), this); // 로비와 같은 트랙(사용자 지시: 로비 음악 통일)
        ensureGachaFx(this);
        this.mobile = L.portrait || (L.lw < 760 && !L.short); // 가로 폰(L.short)은 폭이 좁아도(667x375) 좌우 배치 + 높이 압축(docs/PLAN_LANDSCAPE_PHONE.md ②)
        this.embedded = !!this.rect;
        this.barH = this.embedded ? 0 : 56 + L.safe.t; // 자체 상단 바(단독 시작일 때만)
        this.AY = this.embedded ? this.rect.y : this.barH; // 콘텐츠 영역(논리 단위)
        this.AH = this.embedded ? this.rect.h : L.lh - this.barH; this.AW = this.embedded && this.rect.w ? this.rect.w : L.lw; this.AX = this.embedded ? (this.rect.x ?? 0) : 0; // 콘텐츠 폭·왼쪽 시작(로비 왼쪽 세로 레일 제외)
        this.SB = this.embedded ? 0 : L.safe.b;
        // 모든 레이어를 한 루트에 넣고 영역으로 클리핑(순서 = 그리는 순서)
        this.rootC = this.add.container(this.AX, 0).setDepth(0); // 왼쪽 레일 폭만큼 루트를 오른쪽으로(내부 좌표는 0 ~ AW 그대로). 모달·결과 연출은 루트 밖(전체 화면)
        clipToRect(this, this.rootC, this.AX, this.AY, this.AW, this.AH);
        this.bgLayer = this.add.container(0, 0);
        this.featLayer = this.add.container(0, 0);
        this.petalLayer = this.add.container(0, 0);
        this.hudLayer = this.add.container(0, 0);
        this.listLayer = this.add.container(0, 0);
        this.rootC.add([this.bgLayer, this.featLayer, this.petalLayer, this.hudLayer, this.listLayer]);
        this.drawBackdrop();
        if (!this.embedded) this.buildTopBar();
        this.loadingT = makeText(this, this.AW / 2, this.AY + this.AH / 2, '불러오는 중...', { size: 18, color: CSS.muted, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 3 } });
        this.rootC.add(this.loadingT);
        // 뽑기 scope(배경·등급 프레임·카드 뒷면) + 결과 화면 이펙트(result.fx.*). 늦게 오면 배경만 다시 그린다
        ensureScope(this, 'gacha', (ok, n) => { if (ok && n && this.sys.isActive()) { this.drawBackdrop(); if (this.info) this.drawFeature(); } });
        // gacha_ui(프레임·버튼·태그·명판·배너 배경, 약 1.3MB) 진입 시. 도착하면 본문 다시 그림. gacha_fx 공통은 idle 에 HTTP 예열만(load_hints)
        loadGachaUi(this, (ok, n) => { if (ok && n && this.sys.isActive() && this.info && !this.reveal?.alive) this.buildMain(); this.ensureNativeTitles(); });
        this.time.delayedCall(1500, () => { if (this.sys.isActive()) warmGachaFxCommon(this); });
        this.events.once('shutdown', () => dropFeaturedTex(this));
        this.fetchInfo();
    }

    // 원어 타이틀 이미지 안전망: gacha_ui scope 로드가 끝났는데도 원어 텍스처가 없으면(탭이 열려 있던 동안 manifest 갱신·옛 manifest 캐시·
    // 에셋 등록 전 같은 탭에서 한 번 실패해 실패 목록에 남은 경우 등) 안아트 규약 경로(assets/gacha_ui/keyart/title_<key>_native.png)로 직접 받아 다시 그린다.
    // 시도는 씬 진입마다 배너당 1회(이전엔 게임 전체 1회라 에셋 도착 전 404 뒤로는 새로고침 전까지 재시도하지 않았다). 실패하면 기존 한글 타이틀 그대로
    ensureNativeTitles() {
        if (!this.sys.isActive()) return;
        this.nativeTried ??= new Set();
        const keys = [...new Set([...(this.banners ?? []).filter((b) => !b.normal && b.nativeTitle !== false).map((b) => b.theme), ...BANNER_THEMES.filter((t) => t.nativeTitle).map((t) => t.key)])]
            .filter((k) => k && !String(k).startsWith('auto') && (BANNER_THEMES.find((t) => t.key === k)?.nativeTitle ?? manifestHas(`gacha.title.${k}.native`)) && !this.textures.exists(THEME_KEYS.titleNative(k)) && !this.nativeTried.has(k));
        // 일반 소환 한글 제목 이미지(안아트 2026-11-04 gacha.title.normal = keyart/title_normal.png): gacha_ui 로드 뒤에도 없으면(옛 manifest 캐시 등) 규약 경로로 1회 직접
        const normalT = THEME_KEYS.title(NORMAL_THEME.key);
        const wantNormal = !this.textures.exists(normalT) && !this.nativeTried.has('__normal');
        if (!keys.length && !wantNormal) return;
        if (wantNormal) { this.nativeTried.add('__normal'); this.load.image(normalT, withVer('/assets/gacha_ui/keyart/title_normal.png')); }
        keys.forEach((k) => { this.nativeTried.add(k); this.load.image(THEME_KEYS.titleNative(k), withVer(`/assets/gacha_ui/keyart/title_${k}_native.png`)); });
        this.load.once('complete', () => { if (this.sys.isActive() && this.info && !this.reveal?.alive) this.buildMain(); });
        if (!this.load.isLoading()) this.load.start();
    }

    // ---------- 데이터 ----------
    async fetchInfo() {
        let info;
        try { info = await gameApi.gacha.info(); } catch (e) {
            if (!this.sys.isActive()) return;
            this.loadingT?.destroy();
            alertModal(this, '소환 정보를 불러오지 못했습니다', messageOf(e), () => this.goBack());
            return;
        }
        if (!this.sys.isActive()) return;
        this.loadingT?.destroy();
        this.info = info;
        if (session.profile && Number.isFinite(info.gold) && session.profile.gold !== info.gold) sessionCache.setProfile({ ...session.profile, gold: info.gold });
        this.banners = this.makeBanners(info);
        const si = this.banners.findIndex((b) => b.key === this.selKey);
        this.selIdx = si >= 0 ? si : 0;
        this.markSeen(this.banners[this.selIdx]);
        // 재시작 전에 보낸 소환 응답이 먼저 도착해 결과 연출 중이면 응답 골드 유지(이 GET 이 소환 전 값일 수 있음, 닫으면 refreshInfo 가 서버 값으로 맞춤)
        this.setGold(this.reveal?.alive && Number.isFinite(this.lastRes?.gold) ? this.lastRes.gold : info.gold);
        this.buildMain();
        // 분위기 꽃잎(gacha.particle 시트 10KB)만 진입 시 받는다
        loadGachaFxKeys(this, ['gacha.particle'], () => { if (this.sys.isActive()) this.spawnPetals(); });
        if (this.pendingResult) { const r = this.pendingResult; this.pendingResult = null; this.openReveal(r, true); }
    }

    // 배너 순서: 일반 소환 '역사의 서고'(normal)를 항상 맨 위(2026-11-08 사용자 요청), 나머지는 원래 순서(서버/테마 순) 유지.
    // 선택 복원은 인덱스가 아니라 key(selKey·refreshInfo)라 순서가 바뀌어도 보던 배너 유지. 복원할 key 가 없으면(처음 열기) 맨 위 = 서고가 기본 선택
    makeBanners(info) {
        const list = this.makeBannersRaw(info);
        return [...list.filter((b) => b.normal), ...list.filter((b) => !b.normal)];
    }

    // 표시용 배너(서버 배너 없음, 모두 같은 확률표): 테마별 대표 영웅 최대 3명(풀에 있는 영웅만) + 일반 소환(전체 영웅 콜라주 5명)
    makeBannersRaw(info) {
        const heroes = info.heroes ?? [];
        const byCode = new Map(heroes.map((h) => [h.hero, h]));
        const seen = readSeen();
        const out = [];
        // 서버 배너(GET /api/gacha banners[{key,title,sub,hero_codes}], 표시용·확률 무관)가 있으면 그것을 쓴다. 색(tint)·키아트 키는 같은 key 의 FE 테마 값, 없으면 기본색. 없으면 아래 FE 상수(BANNER_THEMES) 폴백
        const srv = Array.isArray(info.banners) ? info.banners.filter((b) => b?.key) : [];
        if (srv.length) {
            let dynN = 0; // 전용 일러스트 없는 시나리오 배너 순번(동적 테마 색 배정)
            srv.forEach((b) => {
                const normal = b.key === NORMAL_THEME.key;
                if (!normal && HIDDEN_BANNER_KEYS.has(b.key)) return; // 숨김 목록(현재 비어 있음)
                // 일러스트(타이틀·키아트·tint) = 서버 art_key 정의 > key 정의 > 기본(tint 금색, 키아트 없음 = 기본 배경·FE 글자 타이틀). 알 수 없는 key 도 크래시 없이 표시
                const artKey = typeof b.art_key === 'string' && b.art_key ? b.art_key : null;
                const own = normal ? NORMAL_THEME : BANNER_THEMES.find((t) => t.key === b.key) ?? null;
                const art = normal ? NORMAL_THEME : bannerArt(b.key, artKey);
                // 전용 일러스트(art 정의)가 없는 시나리오 배너 = 동적 테마: 목록 순서대로 서로 다른 색(dynTint) -> 배경 색조 막·글로우·목록 테두리로 구별(drawFeature). 인물은 서버 쇼케이스, 제목·부제는 서버 값
                const dyn = !normal && !art && !own;
                const kaTint = dyn ? ((Object.hasOwn(KEYART_TINTS, artKey ?? b.key) ? KEYART_TINTS[artKey ?? b.key] : null)) : null; // 전용 키아트가 있는 동적 테마 = 키아트 주색
                const base = { ...(own ?? {}), tint: art?.tint ?? own?.tint ?? (dyn ? (kaTint ?? dynTint(dynN++)) : 0xb8862b), nativeTitle: art?.nativeTitle ?? own?.nativeTitle, layout: own?.layout ?? (normal ? undefined : art?.layout), dynTheme: dyn };
                // 쇼케이스 인물(2026-11-08 사용자 '천하삼분은 예전처럼 조조·유비·손권'):
                //  - 서고(normal) = FE 고정 5명 우선(사용자 지정 유지), 부족분만 서버 hero_codes
                //  - 전용 일러스트 테마(art_key -> BANNER_THEMES: imjin·three_kingdoms·sengoku) = 그 테마 heroes 우선(키아트 구도와 맞춤), 풀에 없으면 건너뛰고 서버 hero_codes 로 보충
                //  - europe 일러스트 재사용(sc_ch26 루비콘, 로마 시나리오)·동적 테마 = 서버 hero_codes 우선(아군 확정자)
                const srvCodes = Array.isArray(b.hero_codes) ? b.hero_codes : [];
                const themeFirst = normal || (art && art.key !== 'europe' && Array.isArray(art.heroes) && art.heroes.length);
                // 테마 인물은 이 배너 추첨 풀(pool_heroes, 진영 무관: 적벽의 조조 = enemy 도 뽑힘)에 있을 때만. 빠진 자리는 같은 칸에 서버 쇼케이스 인물로 채워 layout(ltr 가운데 인물)을 유지
                const poolSet = new Set((Array.isArray(b.pool_heroes) ? b.pool_heroes : []).filter((x) => x?.hero).map((x) => x.hero));
                const extra = new Map([...(Array.isArray(b.showcase) ? b.showcase : []), ...(Array.isArray(b.pool_heroes) ? b.pool_heroes : [])].filter((x) => x?.hero).map((x) => [x.hero, x])); // 서고 목록(info.heroes)에 없으면 배너 응답의 heroView
                const okCode = (c) => !!(byCode.get(c) ?? extra.get(c)) && (normal || !poolSet.size || poolSet.has(c));
                const themeList = themeFirst ? ((normal ? NORMAL_THEME.heroes : art.heroes) ?? []) : [];
                const fill = srvCodes.filter((c) => !themeList.includes(c) && okCode(c));
                const slotsT = themeList.map((c) => (okCode(c) ? c : fill.shift())).filter(Boolean);
                const codes = [...new Set([...slotsT, ...fill])];
                const hs = codes.map((c) => byCode.get(c) ?? extra.get(c)).filter(Boolean).slice(0, normal ? NORMAL_THEME.collage : 3);
                if (!hs.length) return;
                const k = normal ? 'normal' : `theme:${b.key}`;
                const theme = normal ? b.key : (art?.key ?? artKey ?? b.key); // 텍스처 키(gacha_keyart_<theme> 등) 조회 이름
                const blocking = !!b.blocking || (Array.isArray(info.blocking_banners) && info.blocking_banners.includes(b.key));
                // srvKey = 소환 요청 banner 값(서고는 생략), srv = 배너 원본(확률 모달: rates·pool_heroes·required_pity). 서버에 없는 필드는 null/false 로 안전하게
                out.push({ ...base, title: b.title || own?.title || GACHA_TEXT.featureTag, sub: b.sub ?? own?.sub ?? '', key: k, theme, normal, heroesData: hs, isNew: !normal && !seen.has(k),
                    srvKey: normal ? null : b.key, srv: b, blocking, recommended: !!b.recommended,
                    reqOwned: Number.isFinite(Number(b.required_owned)) ? Number(b.required_owned) : null, reqTotal: Number(b.required_total) > 0 ? Number(b.required_total) : 0 });
            });
            if (out.length) { if (!out.some((b) => b.normal)) out.push({ ...NORMAL_THEME, key: 'normal', theme: 'normal', normal: true, heroesData: (() => { const fx = (NORMAL_THEME.heroes ?? []).map((c) => byCode.get(c)).filter(Boolean); return (fx.length ? fx : heroes.filter((h) => ['S', 'A'].includes(normRarity(h.rarity)))).slice(0, NORMAL_THEME.collage); })(), isNew: false }); return out; }
        }
        BANNER_THEMES.forEach((t) => {
            if (HIDDEN_BANNER_KEYS.has(t.key)) return; // 숨김 목록(현재 비어 있음)
            if (t.key === 'europe') return; // 대륙의 패권: 서버에서 삭제(루비콘 sc_ch26 이 art_key europe 승계) -> FE 폴백 목록에서도 제외(2026-11-08). 정의·일러스트는 art_key 조회용으로 유지
            const hs = t.heroes.map((c) => byCode.get(c)).filter(Boolean).slice(0, 3);
            if (hs.length) out.push({ ...t, key: `theme:${t.key}`, theme: t.key, heroesData: hs, isNew: !seen.has(`theme:${t.key}`) });
        });
        if (!out.length) { // 테마 영웅이 풀에 없을 때: S 등급 3명씩 자동 묶음
            const S = heroes.filter((h) => normRarity(h.rarity) === 'S').slice(0, 9);
            for (let i = 0; i < S.length; i += 3) out.push({ key: `auto:${i}`, theme: `auto${i}`, title: GACHA_TEXT.featureTag, sub: '', tint: 0xb8862b, heroesData: S.slice(i, i + 3), isNew: false });
        }
        // 일반 소환 콜라주: S/A 영웅(NPC 제외) 중 날짜 기준으로 섞은 5명(하루 동안 같은 구성)
        const day = new Date().toISOString().slice(0, 10);
        const hash = (s) => { let x = 2166136261; for (let i = 0; i < s.length; i += 1) { x ^= s.charCodeAt(i); x = Math.imul(x, 16777619); } return x >>> 0; };
        const fixed = (NORMAL_THEME.heroes ?? []).map((c) => byCode.get(c)).filter(Boolean);
        const pick = fixed.length ? fixed.slice(0, NORMAL_THEME.collage) : heroes.filter((h) => ['S', 'A'].includes(normRarity(h.rarity)) && !String(h.hero).startsWith('npc_'))
            .sort((a, b) => hash(a.hero + day) - hash(b.hero + day)).slice(0, NORMAL_THEME.collage);
        out.push({ ...NORMAL_THEME, key: 'normal', theme: 'normal', normal: true, heroesData: pick, isNew: false });
        return out;
    }

    markSeen(b) {
        if (!b?.isNew) return;
        b.isNew = false;
        const s = readSeen(); s.add(b.key); writeSeen(s);
    }

    // ---------- 배경: 서고(bg.screen.gacha) + 어두운 덮개(키아트가 위에 덮음) ----------
    drawBackdrop() {
        const g = this.bgLayer;
        this.clearLayer(g);
        g.add(this.add.rectangle(0, this.AY, this.AW, this.AH, 0x05070d, 1).setOrigin(0)); // 영역 바탕(로비 배경 가림)
        const bk = texOr(this, GACHA_KEYS.bg);
        if (bk) {
            const img = this.add.image(this.AW / 2, this.AY + this.AH / 2, bk);
            img.setScale(Math.max(this.AW / img.width, this.AH / img.height));
            g.add(img);
        }
        g.add(this.add.rectangle(0, this.AY, this.AW, this.AH, 0x05070d, bk ? 0.55 : 0.85).setOrigin(0));
    }

    // 분위기 꽃잎(particle 시트 6 = petal). 연출 끄기면 없음
    spawnPetals() {
        if (isInstant() || !has(this, GACHA_KEYS.particle) || this.petals) return;
        this.petals = this.add.container(0, 0);
        this.petalLayer.add(this.petals);
        for (let i = 0; i < 14; i += 1) {
            const p = this.add.image(Math.random() * this.AW, this.AY - 20 - Math.random() * this.AH, GACHA_KEYS.particle, 6).setTint(i % 3 ? 0xffb7c8 : 0xffe6b0).setAlpha(0.55).setScale(0.25 + Math.random() * 0.25);
            this.petals.add(p);
            const dur = 9000 + Math.random() * 7000;
            this.tweens.add({ targets: p, y: this.AY + this.AH + 40, x: p.x - 120 - Math.random() * 160, angle: 360 * (Math.random() > 0.5 ? 1 : -1), duration: dur, delay: Math.random() * 6000, repeat: -1, onRepeat: () => { p.x = Math.random() * this.AW * 1.1; p.y = this.AY - 30; } });
        }
    }

    // 레이어 비우기: 반복 트윈을 먼저 끊고 파괴
    clearLayer(layer) {
        const all = [];
        const walk = (o) => { all.push(o); o.list?.forEach(walk); };
        layer.list.forEach(walk);
        if (all.length) this.tweens.killTweensOf(all);
        layer.removeAll(true);
    }

    // ---------- 상단 바: 뒤로 · 홈 · 제목 / 재화 ----------
    buildTopBar() {
        const bar = this.add.container(0, 0).setDepth(50);
        bar.add(gradBand(this, 0, 0, this.AW, this.barH + 24, 0x05070d, 0.75, 0, 'down', 10));
        const y = L.safe.t + 6;
        const bw = this.mobile ? 84 : 104;
        bar.add(new Button(this, { x: L.safe.l + 10, y, w: bw, h: 44, label: '‹ 뒤로', size: 16, onClick: () => this.goBack() }));
        const hx = L.safe.l + 10 + bw + 8;
        bar.add(new Button(this, { x: hx, y, w: 52, h: 44, label: '홈', size: 15, onClick: () => this.goBack('stage') }));
        const cw = this.mobile ? 128 : 170;
        const cx = this.AW - L.safe.r - 12 - cw;
        const cap = this.add.graphics();
        cap.fillStyle(COLOR.ink, 0.8).fillRoundedRect(cx, y + 4, cw, 36, 18).lineStyle(1.5, COLOR.accent, 0.8).strokeRoundedRect(cx, y + 4, cw, 36, 18);
        bar.add(cap);
        const gi = icon(this, 'gold', 24);
        if (gi) bar.add(gi.setPosition(cx + 20, y + 22));
        this.goldT = makeText(this, cx + cw - 14, y + 22, '-', { size: 17, bold: true, color: CSS.accent, origin: [1, 0.5] });
        bar.add(this.goldT);
        const tx = hx + 52 + 14;
        if (cx - tx > 70) {
            const t = makeText(this, tx, y + 22, GACHA_TEXT.title, { size: this.mobile ? 18 : 22, heading: true, color: '#f0d58c', origin: [0, 0.5] });
            fitText(t, cx - tx - 10);
            bar.add(t);
        }
    }

    setGold(n) {
        this.gold = Number(n) || 0;
        this.goldT?.setText(fmtNum(this.gold));
    }

    // ---------- 본문 ----------
    // 데스크톱: 키아트 = 화면 전체, 배너 목록 = 왼쪽 위 컴팩트. 모바일 세로: 상단 칩 줄 + 키아트(가운데) + 하단 CTA
    rects() {
        const top = this.AY;
        // 로비 헤더 로고가 바 아래로 걸쳐 내려오면(rect.logo, 화면 좌표) 첫 배너 칩을 로고 아래 끝 밑으로(강화면 gacha71 Low)
        const lg = this.rect?.logo; const lx0 = L.safe.l + 16; const lw0 = L.short ? 200 : 240;
        const ly = lg && lg.bottom > this.AY && lg.r > this.AX + lx0 && lg.x < this.AX + lx0 + lw0 ? Math.max(top + (L.short ? 6 : 10), Math.ceil(lg.bottom) + 14) /* 로비 본문과 같은 여백 14 */ : top + (L.short ? 6 : 10);
        if (!this.mobile) return { list: { x: lx0, y: ly, w: lw0 }, art: { x: 0, y: top, w: this.AW, h: this.AH } };
        const bottom = 210 + this.SB; // 하단 CTA 영역
        return { chips: { x: L.safe.l + 10, y: top + 6, w: this.AW - L.safe.l - L.safe.r - 20, h: 60 }, art: { x: 0, y: top + 72, w: this.AW, h: Math.max(160, this.AH - 72 - bottom) } };
    }

    buildMain() {
        this.R = this.rects();
        this.listLayer.removeAll(true);
        if (this.mobile) this.buildChips(this.R.chips); else this.buildList(this.R.list);
        this.drawFeature();
        this.drawHud();
    }

    select(i) {
        if (i === this.selIdx || !this.banners[i] || this.reveal?.alive) return;
        this.selIdx = i;
        this.selKey = this.banners[i].key;
        this.markSeen(this.banners[i]);
        const keepX = this.chipInner?.x;
        this.buildMain();
        if (this.mobile && keepX != null && this.chipInner) this.chipInner.x = keepX;
    }

    // 배너 목록 항목(컴팩트: 썸네일 + 타이틀 + 부제). 좌상단 원점. 안아트 gacha.list.compact(.selected) 가 있으면 프레임 이미지
    bannerView(b, i, w, h, chip = false) {
        const c = this.add.container(0, 0);
        const sel = i === this.selIdx;
        const tint = b.tint ?? COLOR.accent;
        const fk = sel ? THEME_KEYS.listItemSel : THEME_KEYS.listItem;
        if (has(this, fk)) c.add(this.add.image(0, 0, fk).setOrigin(0).setDisplaySize(w, h));
        else {
            const g = this.add.graphics();
            g.fillStyle(sel ? 0x1a1408 : COLOR.ink, sel ? 0.9 : 0.78).fillRoundedRect(0, 0, w, h, 10);
            if (sel) g.lineStyle(6, COLOR.accentLight, 0.22).strokeRoundedRect(-3, -3, w + 6, h + 6, 12);
            g.lineStyle(sel ? 2.5 : 1, sel ? COLOR.accentLight : tint, sel ? 1 : 0.7).strokeRoundedRect(0, 0, w, h, 10);
            c.add(g);
        }
        // 썸네일 칸: 이미지 프레임(gacha.list.compact 480x152)이면 프레임에 그려진 초상 칸(약 x 12~140, y 12~140) 안쪽에 정확히 맞춘다(강화면·사용자 지적: 검은 여백·테두리 어긋남).
        // 코드 그림 카드는 기존 정사각(위·왼쪽 6). 초상은 칸을 꽉 채우는 cover 크롭(가로 가운데, 세로는 상단 기준이라 얼굴이 잘리지 않음). 원본 비율이 달라도 같은 방식
        const framed = has(this, fk);
        const slot = framed ? { x: Math.round(w * 14 / 480), y: Math.round(h * 14 / 152), w: Math.round(w * 124 / 480), h: Math.round(h * 124 / 152) } : { x: 6, y: 6, w: h - 12, h: h - 12 };
        const ts = slot.w; const tx = slot.x; const ty = slot.y;
        const art = this.add.container(tx, ty);
        c.add(art);
        art.add(this.add.rectangle(0, 0, slot.w, slot.h, 0x05070d, 1).setOrigin(0).setStrokeStyle(framed ? 0 : 1, tint, framed ? 0 : 0.8));
        // 대표 영웅: 기본 = 배열 첫 번째(가운데), layout 'ltr' 배너(전국의 패자)는 가운데 = 배열 두 번째
        const hero0 = b.normal ? null : (b.layout === 'ltr' && (b.heroesData?.length ?? 0) >= 3 ? b.heroesData[1] : b.heroesData?.[0]);
        const cropPut = (tex, focus = 0.05) => {
            if (!art.scene || !tex || !this.textures.exists(tex)) return;
            const img = this.add.image(0, 0, tex).setOrigin(0, 0);
            const fw = img.frame.realWidth; const fh = img.frame.realHeight;
            const a = slot.w / slot.h; // 칸 비율로 cover
            const useW = Math.min(fw, fh * a); const useH = useW / a; // 원본 안에서 칸 비율의 가장 큰 영역(cover)
            const sc = slot.w / useW;
            const cx = (fw - useW) / 2; const cy = Math.max(0, Math.min(fh - useH, fh * focus));
            img.setCrop(cx, cy, useW, useH).setScale(sc).setPosition(-cx * sc, -cy * sc);
            art.addAt(img, 1);
        };
        if (hero0) cropPut(ensurePortrait(this, hero0.hero, (t) => cropPut(t), { thumb: true }));
        else if (b.normal) { const h0 = b.heroesData?.[0]; if (h0) cropPut(ensurePortrait(this, h0.hero, (t) => cropPut(t), { thumb: true })); }
        const lx = tx + ts + (framed ? 12 : 16); const lw = w - lx - 10; // 썸네일과 제목 사이 여백(강화면 15차: 제목이 썸네일 끝에 붙어 보임)
        // 이미지 프레임(gacha.list.compact, 480x152)에는 가로 구분선이 y=75/152 에 구워져 있다 -> 타이틀은 선 위, 부제는 선 아래에 배치(2026-11-03 강화면 Low: 부제가 선에 닿음)
        const frameLine = has(this, fk) ? Math.round(h * (75 / 152)) : null;
        const tt = makeText(this, lx, frameLine != null ? frameLine - 4 : (chip ? 8 : 10), b.title, { size: chip ? 14 : 17, heading: true, color: sel ? '#f6d98c' : '#ffffff', origin: frameLine != null ? [0, 1] : [0, 0] });
        fitText(tt, lw);
        c.add(tt);
        if (b.sub && !(chip && h < 44)) { // 낮은 칩(가로 폰 목록)은 부제 생략
            const sy = frameLine != null ? frameLine + 5 : tt.y + tt.height + 2;
            const st = makeText(this, lx, sy, b.sub, { size: chip ? 11 : 12, color: CSS.muted, wrap: chip ? undefined : lw });
            if (chip) shrinkToFit(st, lw, 9); // 390 상단 칩: 한 줄 폭에 맞춰 글자 먼저 줄이고(최소 9), 그래도 넘치면 말줄임(강화면 gacha41 Low)
            const room = frameLine != null ? h - sy - 6 : Infinity; // 선 아래 남은 높이에 맞춰 줄 수 제한
            fitText(st, lw, { maxLines: chip || room < (parseInt(st.style.fontSize, 10) || 12) * 2.6 ? 1 : 2 });
            c.add(st);
        }
        if (b.dynTheme) c.add(this.add.rectangle(3, Math.round(h * 0.12), 4, Math.round(h * 0.76), tint, 0.95).setOrigin(0)); // 동적 테마 배너: 왼쪽 색 띠(이미지 프레임이면 테두리 tint 가 안 보여 구별 표시)
        // 시나리오 배너 안내(서버 응답 있을 때만): 오른쪽 위 태그 '필요 영웅'(blocking = 다음에 막힐 스테이지의 미보유 필수 영웅이 이 풀에 있음) 또는 '추천'(recommended),
        // 오른쪽 아래 '필수 n/m'(required_owned/required_total, 필수 영웅이 있는 배너만)
        const tag = b.blocking ? { t: '필요 영웅', bg: 0x8a2a1c } : b.recommended ? { t: '추천', bg: 0x2a6a3a } : null;
        if (tag) {
            const tt2 = makeText(this, 0, 0, tag.t, { size: chip ? 10 : 11, bold: true, color: '#ffffff', origin: [1, 0] });
            const pw = tt2.width + 10; const ph = tt2.height + 4;
            c.add(this.add.rectangle(w - 6, 5, pw, ph, tag.bg, 0.95).setOrigin(1, 0).setStrokeStyle(1, 0xffe0b0, 0.8));
            c.add(tt2.setPosition(w - 11, 7));
        }
        if (b.reqTotal > 0 && b.reqOwned != null && !(chip && h < 44)) {
            const done = b.reqOwned >= b.reqTotal;
            c.add(makeText(this, w - 8, h - 6, `필수 ${b.reqOwned}/${b.reqTotal}`, { size: chip ? 10 : 11, bold: true, color: done ? CSS.allyText : '#f0d58c', origin: [1, 1], stroke: { color: '#0B1020', width: 3 } }));
        }
        return c;
    }

    // 데스크톱: 왼쪽 위 세로 목록(선택 항목은 오른쪽으로 8 내밀기)
    // 2026-11-08 사용자 요청(시나리오 배너 21개로 목록이 화면 아래까지 늘어짐): 고정 높이 뷰포트 + 스크롤.
    //  서고(맨 위, normal)는 스크롤 밖 고정 -> 그 아래 시나리오 배너는 ScrollList(픽셀 클리핑 + 스크롤바 + 아래 페이드 + 휠).
    //  뷰포트 아래 끝 = 데스크톱 콘텐츠 높이 60% / 가로 폰 하단 왼쪽 HUD(확률 정보 버튼 등 약 140) 위. 항목 위 드래그(관성)는 씬 입력으로 처리(ScrollList 의 바닥 판은 항목 탭 영역 아래라 못 받음),
    //  8px 넘게 끌면 탭(선택)으로 치지 않는다. 스크롤 위치는 다시 그려도 유지하고, 선택 배너가 보이게 자동 스크롤
    buildList(r) {
        const gap = L.short ? 4 : 8;
        const h = L.short ? 40 : 64; // 항목 높이 고정(개수와 무관)
        const chipMode = L.short && h < 50; // 낮은 항목: 부제 생략
        const listW = r.w + 12; // 선택 항목 8 내밀기 + 스크롤바 4
        const item = (b, i, w) => {
            const sel = i === this.selIdx;
            const v = this.bannerView(b, i, w, h, chipMode);
            v.clipH = h;
            const hit = this.add.rectangle(0, 0, w, h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
            hit.on('pointerdown', (p) => this.listDragStart(p));
            hit.on('pointerup', () => { if (this.modalCount > 0 || this.listDrag?.moved) return; sfx('sfx_ui_tap'); this.select(i); });
            v.add(hit);
            return { v, sel };
        };
        let y0 = r.y;
        const idx = this.banners.map((b, i) => i);
        const pin = this.banners[0]?.normal ? 0 : -1; // 서고 고정
        if (pin === 0) {
            const { v, sel } = item(this.banners[0], 0, r.w);
            v.setPosition(r.x + (sel ? 8 : 0), y0);
            this.listLayer.add(v);
            y0 += h + gap + 2;
            idx.shift();
        }
        if (!idx.length) { this.bannerList = null; return; }
        const contentH = idx.length * (h + gap) - gap;
        const bottom = L.short ? this.AY + this.AH - 140 : this.AY + this.AH * 0.6;
        const vpH = Math.max(h, Math.min(contentH, Math.floor(bottom - y0)));
        const list = new ScrollList(this, { x: r.x, y: y0, w: listW, h: vpH, clip: true, bar: true });
        idx.forEach((i, k) => { const { v, sel } = item(this.banners[i], i, r.w); v.setPosition(sel ? 8 : 0, k * (h + gap)); list.content.add(v); });
        this.listLayer.add(list);
        list.setContentHeight(contentH);
        this.bannerList = list;
        // 스크롤 위치 복원 + 선택 배너가 뷰포트 안에 오게
        let sy = Number.isFinite(this.listScrollY) ? this.listScrollY : 0;
        const k = idx.indexOf(this.selIdx);
        if (k >= 0) { const top = k * (h + gap); if (top + sy < 0) sy = -top; else if (top + h + sy > vpH) sy = vpH - top - h; }
        list.scrollTo(sy);
        this.listScrollY = list.content.y;
        this.bindListDrag();
    }

    // 배너 목록 드래그 스크롤(씬 입력 1회 등록). 항목 pointerdown 에서 시작 -> 이동 8px 초과면 moved(탭 무시) -> 놓으면 마지막 속도로 짧은 관성
    listDragStart(p) {
        const list = this.bannerList;
        if (!list?.scene || !list.inside(p)) { this.listDrag = null; return; }
        this.listInertia?.stop(); this.listInertia = null;
        this.listDrag = { y0: p.worldY, s0: list.content.y, moved: false, ly: p.worldY, lt: performance.now(), v: 0 };
    }

    bindListDrag() {
        if (this.listDragBound) return;
        this.listDragBound = true;
        this.input.on('pointermove', (p) => {
            const d = this.listDrag; const list = this.bannerList;
            if (!d || !p.isDown || !list?.scene) return;
            const dy = p.worldY - d.y0;
            if (!d.moved && Math.abs(dy) > 8) d.moved = true;
            if (!d.moved) return;
            const now = performance.now(); const dt = Math.max(1, now - d.lt);
            d.v = (p.worldY - d.ly) / dt; d.ly = p.worldY; d.lt = now;
            list.scrollTo(d.s0 + dy);
            this.listScrollY = list.content.y;
        });
        this.input.on('pointerup', () => {
            const d = this.listDrag; const list = this.bannerList;
            this.time.delayedCall(0, () => { if (this.listDrag === d) this.listDrag = null; }); // 항목 pointerup(탭 판정)이 moved 를 본 뒤 해제
            if (!d?.moved || !list?.scene || isInstant() || Math.abs(d.v) < 0.2) return;
            const from = list.content.y; const to = from + d.v * 180; // 관성: 마지막 속도(px/ms) x 180ms
            const o = { y: from };
            this.listInertia = this.tweens.add({ targets: o, y: to, duration: 320, ease: 'Cubic.easeOut', onUpdate: () => { if (!list.scene) return; list.scrollTo(o.y); this.listScrollY = list.content.y; } });
        });
        // 휠: ScrollList 기본 휠 스크롤 뒤 위치 기억
        this.input.on('wheel', () => { const list = this.bannerList; if (list?.scene) this.listScrollY = list.content.y; });
    }

    // 모바일 세로: 상단 가로 스크롤 칩(끌기 = 스크롤, 짧은 탭 = 선택)
    buildChips(r) {
        const c = this.add.container(r.x, r.y);
        const inner = this.add.container(0, 0);
        c.add(inner);
        this.chipInner = inner;
        const cw = 178; const gap = 8;
        this.banners.forEach((b, i) => inner.add(this.bannerView(b, i, cw, r.h, true).setPosition(i * (cw + gap), 0)));
        const total = this.banners.length * (cw + gap) - gap;
        const minX = Math.min(0, r.w - total);
        inner.x = Math.max(minX, Math.min(0, r.w / 2 - this.selIdx * (cw + gap) - cw / 2));
        const hit = this.add.rectangle(0, 0, r.w, r.h, 0xffffff, 0).setOrigin(0).setInteractive();
        c.add(hit);
        const wx = (p) => this.cameras.main.getWorldPoint(p.x, p.y).x;
        let drag = null;
        hit.on('pointerdown', (p) => { drag = { x0: wx(p), ix: inner.x, moved: false }; });
        const move = (p) => {
            if (!drag || !p.isDown || !inner.scene) return;
            const dx = wx(p) - drag.x0;
            if (Math.abs(dx) > 8) drag.moved = true;
            if (drag.moved) inner.x = Math.max(minX, Math.min(0, drag.ix + dx));
        };
        const up = (p) => {
            if (!drag) return;
            const d = drag; drag = null;
            if (d.moved || this.modalCount > 0 || !inner.scene) return;
            const lx = wx(p) - r.x - inner.x;
            const i = Math.floor(lx / (cw + gap));
            if (i >= 0 && lx - i * (cw + gap) <= cw) { sfx('sfx_ui_tap'); this.select(i); }
        };
        const release = () => { if (drag?.moved) drag = null; };
        hit.on('pointerup', up);
        this.input.on('pointermove', move);
        this.input.on('pointerup', release);
        c.once('destroy', () => { this.input.off('pointermove', move); this.input.off('pointerup', release); });
        this.listLayer.add(c);
    }

    // 키아트: 분위기 배경(안아트 gacha.keyart.<테마> 또는 임시 그라데이션) + 대표 영웅 최대 3명 겹침(일반 소환 = 5명 콜라주) + 영웅별 등급·이름 태그 + 오른쪽 타이틀
    drawFeature() {
        const f = this.featLayer;
        this.clearLayer(f);
        pruneFeaturedTex(this); // 이전 배너 초상 합성본 해제
        const b = this.banners?.[this.selIdx];
        const A = this.R?.art;
        if (!b || !A) return;
        const token = ++this.featToken;
        this.featTags = []; // 이름표(하단 HUD 겹침 클램프용, drawHud 끝에서 사용)
        const m = this.mobile;
        const tint = b.tint ?? COLOR.accent;
        // 배경
        const bg = this.add.container(0, 0); f.add(bg);
        const ka = THEME_KEYS.keyart(b.theme);
        const cover = (key, alpha) => { const im = this.add.image(this.AW / 2, this.AY + this.AH / 2, key).setAlpha(alpha); im.setScale(Math.max(this.AW / im.width, this.AH / im.height)); bg.add(im); return im; };
        if (has(this, ka)) {
            cover(ka, 1);
            // 동적 테마 + 전용 키아트(sc_chNN): 키아트 주색 글로우를 영웅 뒤(가운데)에만 은은하게. 타이틀 자리(오른쪽 30%, 밝은 하늘이 많음)는 가산 글로우로 더 밝아지면
            // 원어 타이틀(먹 글씨)·흰 글자 대비가 떨어지므로 보조(오른쪽 위) 글로우는 넣지 않는다
            const gk = b.dynTheme ? texOr(this, GACHA_KEYS.glow) : null;
            if (gk) { const gl = this.add.image(this.AW * 0.42, A.y + A.h * 0.48, gk).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.26); gl.setDisplaySize(this.AW * 0.7, this.AW * 0.7); bg.add(gl); if (!isInstant()) this.tweens.add({ targets: gl, alpha: 0.36, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); }
        } else {
            const c0 = b.heroesData?.[0];
            const bb = c0 ? GACHA_KEYS.bannerBg(c0.rarity) : null;
            if (bb && has(this, bb)) cover(bb, 0.5);
            // 배너 색조 막(전용 키아트 없음): 같은 등급 배경이 반복돼 배너가 하나로 보이던 문제(2026-11-08) -> 배너 tint 로 전체를 물들이고 위쪽은 진하게
            bg.add(this.add.rectangle(0, this.AY, this.AW, this.AH, tint, b.dynTheme ? 0.22 : 0.12).setOrigin(0));
            bg.add(gradBand(this, 0, this.AY, this.AW, this.AH * 0.55, tint, b.dynTheme ? 0.38 : 0.2, 0, 'down', 10));
            const gk = texOr(this, GACHA_KEYS.glow);
            if (gk && b.dynTheme) { const g2 = this.add.image(this.AW * 0.82, A.y + A.h * 0.2, gk).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.35); g2.setDisplaySize(this.AW * 0.6, this.AW * 0.6); bg.add(g2); } // 오른쪽 위(타이틀 뒤) 보조 글로우
            if (gk) { const gl = this.add.image(this.AW * 0.5, A.y + A.h * 0.42, gk).setBlendMode(Phaser.BlendModes.ADD).setTint(tint).setAlpha(0.45); gl.setDisplaySize(this.AW * 0.95, this.AW * 0.95); bg.add(gl); if (!isInstant()) this.tweens.add({ targets: gl, alpha: 0.6, duration: 3200, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); }
        }
        // 영웅 배치(index 0 = 가운데 앞)
        const listR = m ? 0 : (this.R.list.x + this.R.list.w + 8); // 목록 오른쪽 끝
        const five = (b.heroesData ?? []).length > 3; // 5명 콜라주(일반 소환): 데스크톱은 가로 폭을 넓혀 양옆 얼굴이 앞 초상에 가리지 않게(강화면 30회차)
        const x0 = m ? A.x + A.w * 0.06 : five ? listR + 12 : Math.max(this.AW * 0.22, listR + this.AW * 0.03);
        const x1 = m ? A.x + A.w * 0.94 : five ? this.AW * 0.8 : this.AW * 0.62; // 3명: 오른쪽 큰 타이틀(원래 대비 1.5배, 2026-11-03) 자리를 위해 0.66 -> 0.62
        const TITLE_RESERVE_M = 0; // 모바일도 영웅 묶음은 원래 위치(강화면 gacha39 Medium: 아래로 밀리면 이름판이 '주목 영웅' 띠·상세/확률 버튼 뒤로 숨음). 모바일 타이틀은 원래 대비 1.1배로만 키운다
        const S3 = m ? [{ x: 0.5, h: 0.98, t: 0.0 }, { x: 0.16, h: 0.8, t: 0.1 }, { x: 0.84, h: 0.8, t: 0.1 }]
            : [{ x: 0.5, h: 0.98, t: -0.02 }, { x: 0.2, h: 0.82, t: 0.08 }, { x: 0.8, h: 0.82, t: 0.08 }];
        const S5 = m ? [{ x: 0.5, h: 0.94, t: 0.02 }, { x: 0.27, h: 0.78, t: 0.12 }, { x: 0.73, h: 0.78, t: 0.12 }, { x: 0.06, h: 0.64, t: 0.22 }, { x: 0.94, h: 0.64, t: 0.22 }]
            : [{ x: 0.5, h: 0.84, t: 0.02 }, { x: 0.28, h: 0.72, t: 0.1 }, { x: 0.72, h: 0.72, t: 0.1 }, { x: 0.06, h: 0.62, t: 0.17 }, { x: 0.94, h: 0.62, t: 0.17 }]; // 데스크톱 5명: 앞 초상 축소 + 간격 확대(가운데-안쪽 = 폭의 22%, 안쪽-끝 = 22%)
        const hs0 = (b.heroesData ?? []).slice(0, b.normal ? 5 : 3);
        // 기본 배치 = 배열 앞이 가운데(칸 0 가운데·1 왼쪽·2 오른쪽). 테마 layout 'ltr'(예 전국의 패자)이면 배열 순서 = 화면 왼쪽부터 -> 두 번째가 가운데(맨 앞)
        const hs = b.layout === 'ltr' && hs0.length === 3 ? [hs0[1], hs0[0], hs0[2]] : hs0;
        const slots = hs.length > 3 ? S5 : hs.length === 2 ? [{ x: 0.35, h: S3[0].h, t: S3[0].t }, { x: 0.7, h: S3[1].h, t: S3[1].t }] : S3;
        const baseH = A.h; // 높이 기준 = 콘텐츠 영역
        const heroL = this.add.container(0, 0); f.add(heroL);
        const tagL = this.add.container(0, 0); // 태그는 영웅 위
        const placed = []; // 태그 영역(겹침 회피)
        const order = hs.map((h, i) => i).reverse(); // 뒤(바깥)부터 그려 가운데가 앞
        const holders = [];
        order.forEach((i) => { const ho = this.add.container(0, 0); heroL.add(ho); holders[i] = ho; });
        hs.forEach((h, i) => {
            const sl = slots[i];
            const Hpx = baseH * sl.h;
            const cx = x0 + (x1 - x0) * sl.x;
            const top = A.y + TITLE_RESERVE_M + baseH * sl.t;
            const ho = holders[i];
            const put = (src) => {
                if (!ho.scene || token !== this.featToken || !src || !this.textures.exists(src)) return;
                this.clearLayer(ho);
                const img = this.add.image(cx, top, featuredTex(this, src)).setOrigin(0.5, 0);
                img.setScale(Hpx / img.frame.realHeight);
                if (i > 0) img.setTint(i > 2 ? 0x9a9aa6 : 0xc8c8d0); // 뒤쪽 영웅은 살짝 어둡게(깊이감)
                // 화면 아래로 넘치는 부분 잘라내기(모바일: 키아트 영역 아래 CTA 와 겹치지 않게)
                const bottom = A.y + A.h;
                const left = cx - img.displayWidth / 2;
                const cl = !m && left < listR ? (listR - left) / img.scaleX : 0; // 배너 목록 뒤로 비치는 왼쪽 잘라냄
                const vis = top + Hpx > bottom ? (bottom - top) / img.scaleY : img.frame.realHeight;
                if (cl > 0 || vis < img.frame.realHeight) img.setCrop(cl, 0, Math.max(1, img.frame.realWidth - cl), Math.max(1, vis));
                ho.add(img);
                if (!isInstant()) {
                    img.setAlpha(0); img.y = top + 16;
                    this.tweens.add({ targets: img, alpha: 1, y: top, duration: 420, delay: (hs.length - 1 - i) * 90, ease: 'Cubic.easeOut' });
                    if (i === 0) this.time.delayedCall(700, () => { if (img.scene) this.tweens.add({ targets: img, y: top - 4, duration: 2600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' }); }); // 가운데 호흡
                }
            };
            const full = ensurePortrait(this, h.hero, (t) => put(t), { thumb: false });
            if (full) put(full); else put(ensurePortrait(this, h.hero, null, { thumb: true }));
            // 등급·이름 태그(배꼽 높이). 일반 소환 콜라주 바깥 2명도 표시(강화면 28회차: 생략돼 이름표 없음) — 겹치면 아래 회피 루프가 세로로 엇갈려 놓는다
            // 가로 폰: 이름표 0.72배 + 칭호 줄 생략 + 폭 = 영웅 간격 이하(이름표끼리 겹침, 강화면 gacha43)
            // 가로 폰에서 영웅 간격이 이름표보다 좁으면(667·844·932 모두 약 55~105) 가운데(대표) 영웅 이름표만 그린다(강화면 gacha44). 하단 '주목 영웅' 이름 줄은 2026-11-08 사용자 요청으로 제거 -> 가로 폰에서 나머지 영웅 이름은 표시되지 않음
            if (L.short && i > 0 && (x1 - x0) * 0.3 < 150) return;
            const tg = this.heroTag(h, m ? 0.8 : L.short ? 0.72 : 1, m ? this.AW * 0.62 : L.short ? Math.min(240, this.AW * 0.26) : Math.min(360, this.AW * 0.3), { noTitle: L.short });
            const tx = Math.max(m ? 8 : listR + 6, Math.min(this.AW - tg.tw - 8, cx - tg.tw * (i === 0 && !L.short ? 0.35 : 0.5)));
            // 이름표 = 초상 배꼽 높이(세로 58%, 2026-11-03 사용자 요청). 초상 아래가 잘린 화면(모바일)은 보이는 영역 안으로
            const th = tg.bh; const ta = tg.above; // 이름 띠 높이 / 띠 위(등급·칭호) 높이
            let tyy = Math.min(top + Hpx * 0.58, A.y + A.h - th - 8);
            const hitR = (y) => placed.find((r) => tx < r.x + r.w + 6 && tx + tg.tw + 6 > r.x && y - ta < r.y + r.h && y + th > r.y - r.a);
            const y0 = tyy; for (let k = 1; k <= 16 && hitR(tyy); k += 1) tyy = y0 + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 12; // 아래·위 번갈아 엇갈림
            this.featTags.push(tg);
            placed.push({ x: tx, y: tyy, w: tg.tw, h: th, a: ta });
            tg.setPosition(tx, tyy);
            tagL.add(tg);
            this.clampTags(); // drawHud 없이 drawFeature 만 다시 그릴 때(에셋 도착)도 HUD 위 8px 유지
            if (!isInstant()) { tg.setAlpha(0); this.tweens.add({ targets: tg, alpha: 1, duration: 300, delay: 450 + i * 90 }); }
        });
        // 아래·왼쪽 어둡게(목록·CTA 가독성) + 태그
        if (!m) f.add(gradBand(this, 0, this.AY, 300, this.AH, 0x05070d, 0.7, 0, 'right', 10));
        f.add(gradBand(this, 0, A.y + A.h - (m ? 70 : 200), this.AW, m ? 70 : 200, 0x05070d, 0, 0.9, 'down', 12));
        f.add(tagL);
        // 타이틀(오른쪽): 안아트 gacha.title.<테마>(글자 포함) > 붓터치 띠(gacha.title.brush) + FE 글자 > FE 글자
        const tl = this.add.container(0, 0); f.add(tl);
        const tk = THEME_KEYS.title(b.theme);
        // 2026-11-03 사용자 요청: 큰 타이틀 묶음(원어/한글 타이틀 이미지 + 한글 제목 + 부제) 원래 대비 1.5배(2배는 너무 큼). 폭 상한 = 데스크톱은 가장 오른쪽 영웅 얼굴 오른쪽 ~ 화면 끝(최대 원래 폭 1.5배, 최소 원래 폭),
        // 모바일은 원래 대비 1.1배·폭 66%(영웅 위치는 그대로). 폭이 모자라면 비율 유지해 최대치
        const rx = this.AW - L.safe.r - (m ? 16 : 44);
        const TH = L.short ? this.AH : Math.max(this.AH, m ? 600 : 520); // 타이틀 크기 기준 높이(영역이 작아도 너무 작아지지 않게). 가로 폰은 실제 영역 높이(520 하한이면 타이틀이 영역 절반을 먹음)
        const faceR = m ? null : Math.max(...slots.slice(0, hs.length).map((sl) => x0 + (x1 - x0) * sl.x + baseH * sl.h * 0.16)); // 영웅 얼굴 오른쪽 끝(초상 3:4, 얼굴 = 폭 중앙 약 ±21%)
        const tMaxW = m ? Math.min(this.AW * 0.66, this.AW - L.safe.l - L.safe.r - 32) : Math.max(this.AW * 0.29, Math.min(this.AW * 0.435, rx - (faceR ?? this.AW * 0.71) - 16));
        const tTop = m ? A.y + 10 : this.AY + this.AH * 0.05; // 묶음 윗단
        const ntk = b.nativeTitle !== false && !b.normal ? THEME_KEYS.titleNative(b.theme) : null; // FE 테마에 없는 서버 배너도 원어 텍스처가 있으면 원어(임진·일반 소환은 nativeTitle:false = 한글 유지)
        const nativeImg = !!ntk && has(this, ntk);
        let titleBottom; let titleIsImg = false;
        if (nativeImg || has(this, tk)) {
            const im = this.add.image(rx, tTop, nativeImg ? ntk : tk).setOrigin(1, 0);
            im.setScale(Math.min(tMaxW / im.width, (nativeImg ? (m ? 0.094 : 0.21) : (m ? 0.11 : 0.24)) * TH / im.height)); // 데스크톱 = 원래 0.14(원어)·0.16(한글)의 1.5배, 모바일 = 원래 0.085·0.1 의 1.1배(영웅 얼굴 위 여백 안)
            titleBottom = tTop + im.displayHeight; titleIsImg = true;
            // 어두운 채움 타이틀(임진의 바다·원어 이미지): 뒤에 은은한 아이보리 글로우(겹친 타원, 바깥일수록 옅게)
            if (DARK_TITLE_THEMES.has(b.theme) || nativeImg) {
                const gw = im.displayWidth; const gh = im.displayHeight; const gx = rx - gw / 2; const gy = tTop + gh / 2;
                const glow = this.add.graphics();
                for (let k = 6; k >= 1; k -= 1) glow.fillStyle(0xfff1c8, 0.05).fillEllipse(gx, gy, gw * (0.9 + k * 0.08), gh * (0.7 + k * 0.12));
                tl.add(glow);
            }
            tl.add(im);
        } else {
            const t = makeText(this, rx, tTop, b.title, { size: Math.round(TH * (m ? 0.044 : 0.1125)), heading: true, color: '#ffffff', origin: [1, 0], stroke: { color: '#0B1020', width: m ? 6 : 8 } });
            if (t.width > tMaxW) t.setScale(tMaxW / t.width);
            if (has(this, THEME_KEYS.titleBrush)) { const br = this.add.image(rx + 20, tTop + t.displayHeight / 2, THEME_KEYS.titleBrush).setOrigin(1, 0.5).setAlpha(0.9); br.setDisplaySize(t.displayWidth + 140, t.displayHeight * 1.5); tl.add(br); }
            tl.add(t);
            titleBottom = tTop + t.displayHeight;
        }
        let ny = titleBottom + (m ? 4 : 8);
        if (nativeImg) { // 원어 큰 제목 아래 한글 제목(굵게)
            const kt = makeText(this, rx, ny, b.title, { size: Math.round(TH * (m ? 0.022 : 0.048)), bold: true, color: '#fff6dc', origin: [1, 0], stroke: { color: '#0B1020', width: m ? 4 : 6 } });
            shrinkToFit(kt, tMaxW, 14); tl.add(kt);
            ny = kt.y + kt.displayHeight + (m ? 3 : 6);
        }
        if (b.sub) { const st = makeText(this, rx, ny, b.sub, { size: Math.round(TH * (m ? 0.0165 : (nativeImg ? 0.036 : 0.042))), bold: true, color: '#f3e6c8', origin: [1, 0], stroke: { color: '#0B1020', width: m ? 4 : 5 } }); shrinkToFit(st, tMaxW, 12); fitText(st, tMaxW); tl.add(st); }
        void titleIsImg;
        // 좁은 화면(390 세로 등): 오른쪽 영웅 이름표가 타이틀 묶음(제목·부제)과 겹치면 이름표를 타이틀 아래로 내린다(자리가 없으면 타이틀 왼쪽으로).
        // 강화면 2026-11-08: 천하삼분 손권 이름표가 '천하삼분/난세를 가른 세 깃발' 뒤로 가려짐. 좌표는 featLayer 로컬(이름표 tagL·타이틀 tl 모두 같은 부모)
        {
            const wb = tl.getBounds(); const fm = f.getWorldTransformMatrix();
            const tb = { x0: wb.x - fm.tx, x1: wb.right - fm.tx, y0: wb.y - fm.ty, y1: wb.bottom - fm.ty };
            if (wb.width > 0 && wb.height > 0) (this.featTags ?? []).forEach((tg) => {
                if (!tg.scene) return;
                const ta = tg.above ?? 0; const th = tg.bh ?? 0;
                const hit = tg.x + tg.tw > tb.x0 - 4 && tg.x < tb.x1 + 4 && tg.y + th > tb.y0 - 4 && tg.y - ta < tb.y1 + 4;
                if (!hit) return;
                const below = tb.y1 + 6 + ta;
                const lim = Math.min(A.y + A.h - 8, (this.hudBox?.top ?? Infinity) - 8) - th; // clampTags 가 다시 끌어올리지 않을 범위
                if (below <= lim) tg.y = below;
                else tg.x = Math.max(m ? 8 : listR + 6, tb.x0 - 6 - tg.tw);
            });
        }
        if (!isInstant()) { tl.setAlpha(0); tl.x = 24; this.tweens.add({ targets: tl, alpha: 1, x: 0, duration: 420, delay: 150, ease: 'Cubic.easeOut' }); }
    }

    // 영웅 태그: 등급 문자(위) + 마름모 병종 아이콘 + 이름 띠. 반환 컨테이너(.tw = 폭)
    // 2026-11-03 사용자 요청: 등급 글자 1.5배(26 -> 40), 이름 크게(17 -> 22), 이름 바로 위에 칭호(h.title, 없으면 생략·자리 비우지 않음). maxW 넘치면 축소 후 말줄임
    heroTag(h, k = 1, maxW = 360, { noTitle = false } = {}) {
        const c = this.add.container(0, 0);
        const rar = normRarity(h.rarity);
        const rt = makeText(this, 2 * k, 0, rar, { size: Math.round(40 * k), heading: true, color: rarityCss(rar), origin: [0, 1], stroke: { color: '#0B1020', width: 5 } });
        // 이름: 기존 규칙(짧은 이름 우선), 신겐·겐신만 정식 이름(names.gachaShortName). 크기 22(확대). 넘치면 글자 축소(최소 12) 후 말줄임
        // 칭호가 '~의'로 끝나는 접두형(예 '라미선의', '간토의')이면 이름 앞에 붙여 한 덩어리('라미선의 레 러이'), 완결형('가이의 호랑이')은 이름 위 작은 줄
        const prefixTitle = !noTitle && !!h.title && /의$/.test(String(h.title).trim()); // 가로 폰(noTitle)은 칭호 생략
        const nm = makeText(this, 0, 0, prefixTitle ? `${String(h.title).trim()} ${gachaShortName(h)}` : gachaShortName(h), { size: Math.round(22 * k), bold: true, color: '#ffffff', origin: [0, 0.5], stroke: { color: '#0B1020', width: 4 } });
        const d = 34 * k; const bh = 36 * k;
        const nameMax = Math.max(80, maxW - d - 26 * k);
        shrinkToFit(nm, nameMax, Math.round(12 * k));
        fitText(nm, nameMax);
        const nameW = nm.width + 26 * k;
        const tw = d + nameW;
        if (has(this, THEME_KEYS.heroTag)) c.add(this.add.image(d / 2, bh / 2, THEME_KEYS.heroTag).setOrigin(0, 0.5).setDisplaySize(nameW + d / 2, bh));
        else c.add(gradBand(this, d / 2, 0, nameW + d / 2, bh, 0x05070d, 0.85, 0.05, 'right', 8));
        const dm = this.add.rectangle(d / 2, bh / 2, d * 0.72, d * 0.72, 0x1a1408, 1).setStrokeStyle(2, rarityColor(rar), 1).setAngle(45);
        c.add(dm);
        // 병종 아이콘 단일 소스(GameIcons.troopIcon = 영웅 카드 뱃지와 같은 도트 그림), 마름모 안에 들어가게 상한
        c.add(troopIcon(this, h.unit_type, d / 2, bh / 2, 16 * k, { glyphSize: Math.round(13 * k), glyphColor: '#f0d58c', stroke: 0, max: d * 0.72 }));
        c.add(nm.setPosition(d + 8 * k, bh / 2));
        // 칭호: 이름 띠 바로 위(등급 글자 오른쪽), 작게. 없으면 그리지 않는다
        let above = rt.height;
        if (h.title && !prefixTitle && !noTitle) { const tt = makeText(this, d + 8 * k, -2 * k, h.title, { size: Math.round(13 * k), bold: true, color: '#f3e6c8', origin: [0, 1], stroke: { color: '#0B1020', width: 3 } }); fitText(tt, nameMax); c.add(tt); above = Math.max(above, tt.height + 2 * k); }
        c.add(rt);
        c.tw = Math.max(tw, rt.width + 4 * k);
        c.bh = bh; c.above = above; // 배치 겹침 계산용(띠 높이 / 띠 위로 올라간 높이)
        return c;
    }

    // 하단: 왼쪽 = 태그·안내 + 상세 정보/확률 정보, 오른쪽 = 천장 게이지 + 1회/10회(10회 금색 강조)
    drawHud() {
        const K = GACHA_KEYS;
        const h = this.hudLayer;
        h.removeAll(true);
        const info = this.info;
        const m = this.mobile;
        const price ={ 1: info.price?.single ?? 0, 10: info.price?.ten ?? 0 };
        const pad = m ? 16 : 24;
        const by0 = this.AY + this.AH - this.SB - pad;
        // 소환 버튼
        const gap = 14;
        const imgBtn = has(this, K.btnSingle) && has(this, K.btnTen);
        // 가로 폰(L.short): 우측 세로 내비만큼 좁아진 폭에서 왼쪽 '확률 정보'(110) 버튼과 겹치지 않게 소환 버튼 폭을 줄인다(최대 190, 최소 140). 140 미만이면 왼쪽 버튼을 소환 줄 위로(강화면 gacha66)
        // 2026-11-08 사용자 요청: 왼쪽 '상세 정보' 버튼 제거 -> 왼쪽 버튼 1개 폭만 확보
        const sPw = 110; const sNeed = sPw + 12;
        const sBw = L.short && !m ? Math.min(190, Math.floor((this.AW - L.safe.l - L.safe.r - pad * 2 - gap - sNeed) / 2)) : 190;
        const sLift = L.short && !m && sBw < 140;
        const bw = m ? Math.floor((this.AW - L.safe.l - L.safe.r - pad * 2 - gap) / 2) : L.short ? (sLift ? 190 : sBw) : 240; // 가로 폰: 버튼 높이도 함께 줄어듦(비율)
        const btnH = imgBtn ? Math.max(52, Math.round(bw * (89 / 300))) : 64;
        const rowW = bw * 2 + gap;
        const bx = m ? L.safe.l + pad : this.AW - L.safe.r - pad - rowW;
        const by = by0 - btnH;
        if (m) h.add(gradBand(this, 0, this.AY + this.AH - 230 - this.SB, this.AW, 230 + this.SB, 0x05070d, 0.3, 0.95, 'down', 10));
        this.pullBtns = {};
        [1, 10].forEach((n, i) => {
            const short = this.gold < price[n];
            const opts = { x: bx + i * (bw + gap), y: by, w: bw, h: btnH, label: `${n === 1 ? '1회' : '10회'} 소환  ${fmtNum(price[n])}`, size: m ? 16 : L.short ? 14 : 19, // 가로 폰: 버튼 폭 190 에 '10회 소환 900' 이 말줄임 없이
                disabled: short || this.busy, short, reason: short ? `골드가 부족합니다. (필요 ${fmtNum(price[n])}, 보유 ${fmtNum(this.gold)})` : '', onClick: () => this.pull(n) };
            const btn = imgBtn ? new PullImgButton(this, { ...opts, tex: n === 10 ? K.btnTen : K.btnSingle })
                : new Button(this, { ...opts, icon: 'gold', variant: n === 10 ? 'primary' : 'default' });
            btn.short = short;
            this.pullBtns[n] = btn;
            h.add(btn);
        });
        if (!imgBtn) h.add(this.add.rectangle(bx + bw + gap - 3, by - 3, bw + 6, btnH + 6, 0, 0).setOrigin(0).setStrokeStyle(2, COLOR.accentLight, 0.9)); // 10회 금색 강조(폴백)
        // 10회 할인(서버 가격으로 계산, 있을 때만)
        const disc = price[1] > 0 && price[10] > 0 ? Math.round((1 - price[10] / (price[1] * 10)) * 100) : 0;
        if (disc > 0) {
            const tagImg = has(this, K.tagDiscount);
            const lt = makeText(this, 0, 0, `${disc}% 할인`, { size: 12, bold: true, color: tagImg ? '#ffffff' : '#1A1406', origin: [0.5, 0.5], stroke: tagImg ? { color: '#5A1A17', width: 3 } : undefined });
            const tw = Math.max(lt.width + 28, 84);
            const lx = bx + bw + gap + bw / 2; const ly = by - 4;
            if (tagImg) h.add(this.add.image(lx, ly, K.tagDiscount).setDisplaySize(tw, tw * (35 / 140)));
            else h.add(this.add.rectangle(lx, ly, lt.width + 16, 20, FEATURE_TAG_COLOR, 1).setStrokeStyle(1, 0xffe0b0, 1));
            h.add(lt.setPosition(lx, ly));
        }
        // 천장 게이지(버튼 위, 버튼 줄 폭)
        const p = info.pity;
        let gy = by - (disc > 0 ? 34 : 22);
        this.hudBox = { x: bx - 8, w: rowW + 16, top: p?.min_rarity ? gy - 22 : by - 4 }; // 오른쪽 HUD(천장 보장 안내·게이지·버튼) 윗선
        if (p?.min_rarity) {
            const cnt = Math.max(1, Number(p.applies_to_count) || 10);
            const prog = Number(p.progress) || 0;
            // 왼쪽 '천장 · <등급> 이상 연속 미출현 N회' 문구는 2026-11-08 사용자 요청으로 제거(게이지 막대·오른쪽 보장 안내는 유지 -> 윗선 gy - 22 그대로)
            h.add(makeText(this, bx + rowW, gy - 12, `${cnt}회 소환 시 ${p.min_rarity} 이상 1회 보장`, { size: 11, color: CSS.muted, origin: [1, 0.5], stroke: { color: '#0B1020', width: 3 } }));
            h.add(slice(this, 'gauge_bg', rowW, 8, 'gauge').setPosition(bx, gy));
            const fw = rowW * Math.min(1, prog / cnt);
            if (fw >= 12) h.add(slice(this, 'gauge_gold', fw, 8, 'gauge').setPosition(bx, gy));
            gy -= 30;
        }
        // 왼쪽: 확률 정보(모바일 = 게이지 위 한 줄 전폭, 가로 폰 110, 데스크톱 150 왼쪽 정렬)
        // 2026-11-08 사용자 요청: 왼쪽 하단 '주목 영웅' 태그 + 대표 영웅 이름 줄과 '상세 정보' 버튼 제거. 확률 안내는 '확률 정보' 버튼
        const pw = m ? rowW : L.short ? sPw : 150;
        const py = m || sLift ? gy - 50 : by0 - 44; // sLift: 가로 폰 폭 부족 = 천장 게이지 위
        const px = m ? bx : L.safe.l + pad;
        h.add(new Button(this, { x: px, y: py, w: pw, h: 44, label: '확률 정보', size: 15, onClick: () => this.openRates() }));
        // 이름표가 하단 HUD(오른쪽 천장 게이지 줄 · 왼쪽 태그·버튼 줄 중 높은 쪽) 바로 위에 붙지 않게 최소 8px 위로(강화면 28·30회차)
        // (기준선 = 오른쪽 천장 게이지 줄 윗선. 왼쪽 태그·버튼 줄까지 넣으면 이름표가 얼굴 쪽으로 과하게 올라가 제외)
        this.clampTags();
    }

    clampTags() {
        const hb = this.hudBox;
        // 가로 겹침과 무관하게 모든 이름표 아랫단을 하단 HUD 윗선(천장 게이지·버튼 중 가장 위)보다 8px 이상 위로(강화면 30회차: 일반 소환 콜라주 아랫줄 4px)
        if (hb) (this.featTags ?? []).forEach((tg) => { if (!tg.scene) return; const lim = hb.top - 8 - (tg.bh ?? 0); if (tg.y > lim) tg.y = lim; });
    }

    setBusy(b) {
        this.busy = b;
        Object.values(this.pullBtns ?? {}).forEach((btn) => { if (btn.scene) btn.setDisabled(b || btn.short); });
    }

    // ---------- 소환(로비 gachaPull 과 같은 규칙: 클릭 1회 = request_id 1개, 재시도 가능한 오류는 같은 ID 재사용) ----------
    async pull(count) {
        if (this.busy || pullState.inFlight || this.reveal?.alive) return;
        if (!this.info) { showToast(this, '소환 정보를 불러오는 중입니다. 잠시 후 다시 눌러 주세요'); return; } // (하플레이 #5: 정보 재조회 중 탭이 무반응으로 버려지던 경로)
        // 시나리오 배너(서버 key sc_chN)면 그 풀에서 추첨(banner 필드). 재시도 request_id 는 count+배너별(같은 id 를 다른 배너로 보내면 409 request_id_reused)
        const banner = this.banners?.[this.selIdx]?.srvKey ?? null;
        const pk = `${count}:${banner ?? "normal"}`;
        const rid = (pullState.pending[pk] ??= newGachaRequestId());
        const run = this.runId;
        pullState.inFlight = true;
        this.setBusy(true);
        // 완료 시점의 씬 상태: 같은 실행이거나(재시작돼) 새 실행이 활성일 때만 화면을 만진다. 멈춘 씬(다른 탭)이면 아무것도 하지 않는다.
        // 재시작 뒤라면 이전 실행의 버튼은 이미 파괴됐고 setBusy 는 현재 실행의 버튼(this.pullBtns)만 다룬다. inFlight 동안 새 요청이 없으므로 잠금 해제가 다른 요청을 풀 일은 없다.
        const live = () => this.sys.isActive();
        // 응답이 늦으면(개발 서버·재시도 포함 수 초) 진행 중 안내: 버튼만 비활성이라 '반응 없음'으로 보이던 문제(하플레이 #5, 12초)
        const t0 = Date.now();
        const slowT = this.time.delayedCall(700, () => { if (this.busy && this.runId === run && this.sys.isActive()) showToast(this, '소환 중입니다… 잠시만 기다려 주세요'); });
        const endSlow = () => { if (this.runId === run) slowT.remove(false); const ms = Date.now() - t0; if (ms > 3000) console.warn(`[gacha] pull 응답 ${ms}ms`); };
        // 연출 공통 에셋(책·인장·글자·파티클·섬광)은 요청과 병렬로 받기 시작
        const commonP = new Promise((ok) => loadGachaFxCommon(this, () => ok()));
        let res = null;
        try {
            res = await gameApi.gacha.pull(count, rid, banner);
            delete pullState.pending[pk];
            pullState.inFlight = false;
            endSlow();
        } catch (e) {
            pullState.inFlight = false;
            endSlow();
            const retryable = e.code === 'network' || e.code === 'gacha_conflict' || e.code === 'db_busy' || e.status >= 500;
            if (!retryable) delete pullState.pending[pk];
            this.busy = false;
            if (!live()) return;
            this.setBusy(false);
            if (retryable) {
                new Modal(this, { title: '소환 실패', body: `${messageOf(e)}\n같은 요청으로 다시 시도하므로 골드가 두 번 차감되지 않습니다.`, w: 480, h: 290,
                    buttons: [{ label: '닫기' }, { label: '다시 시도', variant: 'primary', onClick: () => this.pull(count) }] });
            } else {
                alertModal(this, '소환 실패', messageOf(e), () => {
                    if (e.code === 'gacha_disabled') { gameApi.profile(true).catch(() => {}); this.goBack(); return; }
                    if (e.code === 'insufficient_gold' || e.code === 'banner_unknown') this.refreshInfo(); // banner_unknown: 비활성·삭제된 배너 -> 목록 재조회
                });
            }
            return;
        }
        // 등급별 묶음(beam·aura·pop·halo·pageglow·cardglow)은 나온 등급만. 최대 2.5초 기다린 뒤 없는 것은 도형 폴백
        const rars = [...new Set((res?.results ?? []).map((r) => normRarity(r.rarity)))];
        loadGachaFxRarity(this, rars, null);
        void commonP; // 대기는 연출(GachaReveal.waitTex)이 단계별로 한다: 책·첫 등급 최대 4초, 다음 영웅 등급 최대 2.5초
        this.busy = false;
        if (!live()) return;
        this.setBusy(false);
        this.applyResult(res);
        this.openReveal(res, false);
    }

    // 응답 반영: 골드·천장·보유 표시(다음 GET 전까지 화면 일관성)
    applyResult(res) {
        this.setGold(res?.gold);
        if (this.info?.pity && Number.isFinite(res?.pity?.after)) this.info.pity.progress = res.pity.after;
        const got = new Set((res?.results ?? []).map((r) => r.hero));
        (this.info?.heroes ?? []).forEach((h) => { if (got.has(h.hero)) h.owned = true; });
        if (this.info) this.info.gold = this.gold; // 소환 응답 대기 중 화면 크기 변경으로 씬이 다시 시작되면 info 가 아직 없을 수 있다(새 fetchInfo 전) -> 결과 연출은 그대로 연다
    }

    openReveal(res, summaryOnly) {
        this.lastRes = res;
        this.hudLayer?.setVisible(false); // 결과 연출 중 하단 소환 버튼·천장 게이지 숨김(하플레이 gacha104: 결과 '확인'과 '1회 소환'이 겹쳐 보임). 닫으면 buildMain 이 다시 그림
        try {
            this.reveal = new GachaReveal(this, {
                res, summaryOnly, minRarity: this.info?.pity?.min_rarity ?? 'A',
                cardFn: (r, x, y, w, h) => LobbyScene.prototype.gachaCard.call(this, r, x, y, w, h), // 로비 결과 카드 재사용(this = 이 씬)
                onClose: () => { this.reveal = null; this.hudLayer?.setVisible(true); if (this.sys.isActive()) this.buildMain(); this.refreshInfo(); },
            });
        } catch (e) { // 생성자 예외면 onClose 가 불리지 않아 소환 버튼·천장 게이지가 숨겨진 채 남는다(정검수): 복원 후 기존 오류 처리로 다시 던짐
            this.reveal = null;
            this.hudLayer?.setVisible(true);
            throw e;
        }
    }

    // 서버 값 재조회(골드·천장·보유). 실패는 무시(화면은 응답 반영값 유지)
    refreshInfo() {
        gameApi.gacha.info().then((info) => {
            if (!this.sys.isActive() || this.reveal?.alive) return;
            this.info = info;
            this.setGold(info.gold);
            const key = this.banners?.[this.selIdx]?.key;
            this.banners = this.makeBanners(info);
            const si = this.banners.findIndex((b) => b.key === key);
            this.selIdx = si >= 0 ? si : 0;
            this.buildMain();
        }).catch(() => {});
    }

    // 확률 안내: 로비와 같은 확률 모달(서버 rates/pity/heroes 그대로)
    openRates() {
        if (!this.info || this.modalCount > 0) return;
        const b = this.banners?.[this.selIdx];
        LobbyScene.prototype.gachaRates.call(this, this.info, b?.srvKey ? { ...b.srv, displayTitle: b.title } : null); // 시나리오 배너면 그 배너 풀·확률·필수 영웅 천장
    }

    goBack(tab) { // 오류·비활성 시 복귀. 로비 위 오버레이면 로비 탭 전환(로비가 이 씬을 멈춤), 단독이면 로비 시작
        if (this.busy || this.reveal?.alive) return;
        const lob = this.scene.get('Lobby');
        if (this.embedded && lob?.sys.isActive()) { lob.selectTab(tab ?? this.backTab); return; }
        this.scene.start('Lobby', { tab: tab ?? this.backTab });
    }
}

// 타이틀 글자 채움이 어두워 어두운 키아트 위에서 대비가 낮은 배너(뒤에 은은한 밝은 글로우)
const DARK_TITLE_THEMES = new Set(['imjin', 'normal']); // 글자 채움이 어두운 타이틀 이미지(뒤에 아이보리 글로우). normal = 안아트 title_normal(평균색 짙은 갈색, 2026-11-04)

// 이미지 소환 버튼(gacha.btn.pull.single/ten, 고정 비율). 눌림 = scale 0.96 + 어둡게, 비활성 = 회색 틴트·alpha 0.6 + 사유 토스트.
// 히트 영역은 실제 화면 44px 이상(Button 과 같은 규칙). API: setDisabled(b), short(호출 측 표시)
class PullImgButton extends Phaser.GameObjects.Container {
    constructor(scene, { x, y, w, h, tex, label, size = 18, onClick, disabled = false, reason = '', short = false }) {
        super(scene, x, y);
        this.bw = w; this.bh = h; this.onClick = onClick; this.reason = reason;
        this.face = scene.add.container(w / 2, h / 2);
        this.img = scene.add.image(0, 0, tex).setDisplaySize(w, h);
        const gi = icon(scene, 'gold', Math.min(24, h * 0.42));
        this.label = makeText(scene, 0, -1, label, { size, bold: true, color: '#ffffff', origin: [0.5, 0.5], stroke: { color: '#2a1206', width: 4 } });
        shrinkToFit(this.label, w - 56, 11); fitText(this.label, w - 56); // 먼저 글자 축소(최소 11), 그래도 넘칠 때만 말줄임(가로 폰 10회 가격 말줄임, 강화면 gacha43 Low)
        const total = (gi ? gi.displayWidth + 6 : 0) + this.label.width;
        if (gi) gi.setPosition(-total / 2 + gi.displayWidth / 2, -1);
        this.label.x = -total / 2 + (gi ? gi.displayWidth + 6 : 0) + this.label.width / 2;
        this.face.add(gi ? [this.img, gi, this.label] : [this.img, this.label]);
        if (short) { // 골드 부족: 라벨을 조금 올리고 아래 작은 안내(비활성 원인이 보이게)
            const dy = -Math.round(h * 0.12);
            this.label.y += dy; if (gi) gi.y += dy;
            this.face.add(makeText(scene, 0, Math.round(h * 0.2), '골드 부족', { size: 12, bold: true, color: '#ffb4a4', origin: [0.5, 0.5], stroke: { color: '#2a1206', width: 3 } }));
        }
        const need = Math.ceil(MIN_TOUCH / (view.scale || 1));
        const hw = Math.max(w, need); const hh = Math.max(h, need);
        this.hit = scene.add.rectangle(-(hw - w) / 2, -(hh - h) / 2, hw, hh, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        this.add([this.face, this.hit]);
        const usable = () => !!this.scene && !(this.scene.modalCount > 0);
        this.hit.on('pointerdown', () => { if (!usable()) return; this.down = true; if (!this.disabled) { this.face.setScale(0.96); this.img.setTint(0xd8d8d8); } });
        const reset = () => { this.down = false; if (!this.scene) return; this.face.setScale(1); if (!this.disabled) this.img.clearTint(); };
        this.hit.on('pointerout', reset);
        this.hit.on('pointerup', () => {
            const was = this.down; reset();
            if (was && this.scene && this.scene.modalCount > 0) console.warn('[gacha] 모달 카운트가 남아 소환 버튼 입력 무시', this.scene.modalCount); // 진단(하플레이 #5)
            if (!was || !usable()) return;
            if (this.disabled) { if (this.reason) showToast(this.scene, this.reason); return; }
            sfx('sfx_ui_confirm');
            this.onClick?.();
        });
        this.setDisabled(disabled);
        scene.add.existing(this);
    }

    setDisabled(b) {
        this.disabled = b;
        if (!this.scene) return;
        if (b) this.img.setTint(0x9a9a9a); else this.img.clearTint();
        this.face.setAlpha(b ? 0.85 : 1);
    }
}
