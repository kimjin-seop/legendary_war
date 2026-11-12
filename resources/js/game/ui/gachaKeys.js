import Phaser from 'phaser';
import { ensureScope, warmScope, loaded } from '../assets.js';
import { normRarity } from '../rarity.js';

// 소환(가챠) 화면 에셋 키·문구 상수. 출처 = 안아트 public/assets/gacha_ui/gacha_ui_spec.json(asset_key_table) + manifest_fragment.json.
// 텍스처 키 = 논리 키의 '.' -> '_'(assets.texKey). 텍스처가 있으면 사용, 없으면 코드 도형/기존 에셋 폴백(임시 도형은 폴백 전용).
// 필터: gacha_* 키는 assets.pixelKeys(NEAREST) 규칙(tile|unit|icon|fx|deco 접두)에 걸리지 않아 기본 LINEAR 로 로드된다.
const r1 = (r) => normRarity(r).toLowerCase(); // s|a|b|c
export const GACHA_KEYS = {
    bg: 'bgscreen_gacha', // 기존 bg.screen.gacha(서고, scope gacha)
    // --- gacha_ui(진입 시 로드) ---
    bannerBg: (r) => `gacha_banner_bg_${['s', 'a', 'b'].includes(r1(r)) ? r1(r) : 'b'}`, // 640x280, 빛 중심 오른쪽 62%
    listFrame: 'gacha_list_frame', listFrameSel: 'gacha_list_frame_selected', // 280x120 / 298x138(사방 9 큼), inner [3,3,277,117]
    chipFrame: 'gacha_chip_frame', chipFrameSel: 'gacha_chip_frame_selected', // 152x64 / 170x82
    tagRateup: 'gacha_tag_rateup', // 180x36, 글자 FE (미사용: 2026-11-08 하단 주목 영웅 태그 줄 제거)
    tagDiscount: 'gacha_tag_discount', // 140x35, 글자 FE
    scroll: 'gacha_scroll', // 480x195 두루마리 명판, 글자 #3A2A10, 안쪽 70%
    btnSingle: 'gacha_btn_pull_single', btnTen: 'gacha_btn_pull_ten', // 300x86 / 300x89 고정 비율
    warbannerL: 'gacha_warbanner_l', warbannerR: 'gacha_warbanner_r', // (미사용, 선택 장식)
    maskFeature: 'gacha_mask_feature', // (미사용: Phaser 4 마스크 대신 그라데이션 띠)
    // --- gacha_fx 공통(소환 클릭 시 로드, 진입 idle 때 HTTP 예열) ---
    bookCover: 'gacha_book_cover', bookCoverInner: 'gacha_book_cover_inner', // 288x350, sealCenter [135,166] 지름 103
    bookOpen: 'gacha_book_open', // 600x357, spineX 299
    bookPageflip: 'gacha_book_pageflip', // 시트 600x357 x6, 24fps
    seal: 'gacha_seal', sealCrack: 'gacha_seal_crack', sealShard: (i) => `gacha_seal_shard_${i}`, // 160x160, 파편 0~5(offset·dir = manifest)
    glyph: 'gacha_glyph', // 64x64 x16(0~7 먹, 8~15 금·틴트)
    particle: 'gacha_particle', // 64x64 x8(0 spark4, 1 spark8, 2 dot, 3 ember, 4 ring, 5 streak, 6 petal, 7 diamond), 틴트
    flash: 'gacha_flash', rays: 'gacha_rays',
    circleInner: 'gacha_circle_inner', circleGlow: 'gacha_circle_glow',
    maskEmerge: 'gacha_mask_emerge', // (미사용)
    // --- gacha_fx 등급별(결과 등급이 나온 뒤에만 로드) ---
    pageglow: (r) => `gacha_book_pageglow_${r1(r)}`, // 600x357 가산
    beam: (r) => `gacha_beam_${r1(r)}`, // 시트 192x768 x8, 12fps, origin(0.5,1)
    aura: (r) => `gacha_aura_${r1(r)}`, // 시트 384x384 x8, 16fps 1회
    pop: (r) => `gacha_pop_${r1(r)}`, // 시트 512x512 x8, 30fps 1회
    halo: (r) => `gacha_halo_${r1(r)}`, // 512 표시, 초상 높이 x1.1, 30s/바퀴
    cardglow: (r) => `gacha_cardglow_${r1(r)}`, // 카드 x(296/224, 372/300)
    // --- 코드 생성 폴백 ---
    glow: ['gacha_gen_glow'], ray: ['gacha_gen_ray'],
    burst: ['gacha_rays', 'result_fx_sunburst'],
};

export const GACHA_TEXT = {
    title: '영웅 소환',
    // 배너 제목 폴백(서버 배너 제목 없을 때). 하단 '주목 영웅' 태그 줄·상세 정보 모달은 2026-11-08 사용자 요청으로 제거(featureTagRateUp·normalTag 삭제)
    featureTag: '주목 영웅',
    normalBanner: '일반 소환',
    sameRates: '모든 배너는 같은 확률표가 적용됩니다',
    unowned: '미보유',
    owned: '보유',
};

export const BOOK_GLYPHS = ['史', '記', '傳', '錄', '紀', '志', '印', '名']; // glyph 시트 없을 때 글자 폴백
export const RARITY_SFX = { S: 'sfx_gacha_reveal_ssr', A: 'sfx_gacha_reveal_sr', B: 'sfx_gacha_reveal_r', C: 'sfx_gacha_reveal_n' };
// 연출 단계 효과음(gacha_ui_spec sound_cues)
export const GACHA_SFX = { sealBreak: 'sfx_gacha_seal_break', bookOpen: 'sfx_gacha_book_open', pageFlip: 'sfx_gacha_page_flip', lightRise: 'sfx_gacha_light_rise', popIn: 'sfx_gacha_pop_in', cardSlide: 'sfx_gacha_card_slide' }; // sfx_gacha_new 는 사용하지 않음(신규 표시 제거)
export const FEATURE_TAG_COLOR = 0xe8892b;
export const FEATURED_MAX = 4;

export const texOr = (scene, keys) => [].concat(keys).find((k) => k && scene.textures.exists(k)) ?? null;
export const has = (scene, k) => !!k && scene.textures.exists(k);
export const manifestMeta = (logical) => loaded.manifest?.[logical] ?? null; // 레이아웃 메타(offset·dir·layout)

// 컨테이너를 화면(world) 사각 영역으로 픽셀 클리핑(Phaser 4 Mask 필터, ScrollList.enableClip 과 같은 방식). 캔버스 렌더러면 생략
export function clipToRect(scene, cont, x, y, w, h) {
    if (!scene.renderer?.gl || typeof cont.enableFilters !== 'function') return;
    const r = new Phaser.GameObjects.Rectangle(scene, x, y, w, h, 0xffffff, 1).setOrigin(0);
    cont.enableFilters();
    cont.filters.external.addMask(r, false, scene.cameras.main, 'world');
    cont.once('destroy', () => r.destroy());
}

// ---- 로드(gacha_ui_spec load_hints) ----
const RAR_SUFFIX = /\.(s|a|b|c)$/;
// 화면에서 쓰지 않는 큰 키는 받지 않는다(소환진 바깥 원 1024², 마스크 896x1200 2장, 군기 장식) — 첫 소환 로드량·대기 단축
const UNUSED = new Set(['gacha.circle.outer', 'gacha.mask.emerge', 'gacha.warbanner.l', 'gacha.warbanner.r', 'gacha.badge.new', 'gacha.ribbon.new']); // mask.feature 는 피처드 초상 합성에 사용
const isCommonFx = (lg) => lg.startsWith('gacha.') && !RAR_SUFFIX.test(lg) && !UNUSED.has(lg);
export function loadGachaUi(scene, cb) { ensureScope(scene, 'gacha_ui', cb, { filter: (lg) => !UNUSED.has(lg) }); }
export function warmGachaFxCommon(scene) { try { warmScope(scene, 'gacha_fx', { filter: isCommonFx }); } catch { /* 무시 */ } }
// 진행 중 논리 키(같은 키를 두 로드가 동시에 큐에 넣지 않게)
const inflight = new Set();
function loadFx(scene, pred, cb) {
    const mine = [];
    ensureScope(scene, 'gacha_fx', (ok, n) => { mine.forEach((k) => inflight.delete(k)); cb?.(ok, n); }, { filter: (lg) => { if (inflight.has(lg) || !pred(lg)) return false; inflight.add(lg); mine.push(lg); return true; } });
}
export function loadGachaFxCommon(scene, cb) { loadFx(scene, isCommonFx, cb); }
// 등급별 묶음: 결과에 나온 등급만(예: C/B 만 나온 10연은 S/A 시트를 받지 않는다). only = 논리 키 접두 제한(예: ['gacha.halo.'])
export function loadGachaFxRarity(scene, rarities, cb, only = null) {
    const set = new Set([...rarities].map(r1));
    loadFx(scene, (lg) => { const m = RAR_SUFFIX.exec(lg); return !!m && set.has(m[1]) && lg.startsWith('gacha.') && (!only || only.some((p) => lg.startsWith(p))); }, cb);
}

// 스프라이트시트 애니메이션(전역 1회 생성). 키 = <tex>@<fps>x<repeat>
export function sheetAnim(scene, tex, frames, fps, repeat = 0) {
    if (!has(scene, tex)) return null;
    const k = `${tex}@${fps}x${repeat}`;
    if (!scene.anims.exists(k)) {
        const n = Math.max(1, Math.min(frames, scene.textures.get(tex).frameTotal - 1 || frames));
        scene.anims.create({ key: k, frames: scene.anims.generateFrameNumbers(tex, { start: 0, end: n - 1 }), frameRate: fps, repeat });
    }
    return k;
}

// 코드 생성 폴백 텍스처(원형 광원 256, 세로 빛줄기 64x512). 1회만
export function ensureGachaFx(scene) {
    const tm = scene.textures;
    if (!tm.exists('gacha_gen_glow')) {
        const t = tm.createCanvas('gacha_gen_glow', 256, 256);
        const c = t?.context;
        if (c) {
            const g = c.createRadialGradient(128, 128, 0, 128, 128, 128);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.35, 'rgba(255,255,255,0.45)'); g.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = g; c.fillRect(0, 0, 256, 256); t.refresh();
        }
    }
    if (!tm.exists('gacha_gen_ray')) {
        const t = tm.createCanvas('gacha_gen_ray', 64, 512);
        const c = t?.context;
        if (c) {
            const v = c.createLinearGradient(0, 512, 0, 0);
            v.addColorStop(0, 'rgba(255,255,255,0.95)'); v.addColorStop(0.6, 'rgba(255,255,255,0.35)'); v.addColorStop(1, 'rgba(255,255,255,0)');
            c.fillStyle = v; c.fillRect(0, 0, 64, 512);
            c.globalCompositeOperation = 'destination-in';
            const h = c.createLinearGradient(0, 0, 64, 0);
            h.addColorStop(0, 'rgba(0,0,0,0)'); h.addColorStop(0.5, 'rgba(0,0,0,1)'); h.addColorStop(1, 'rgba(0,0,0,0)');
            c.fillStyle = h; c.fillRect(0, 0, 64, 512); c.globalCompositeOperation = 'source-over';
            t.refresh();
        }
    }
}

// 단색 그라데이션 띠. dir: 'down' | 'right'
export function gradBand(scene, x, y, w, h, color, a0, a1, dir = 'down', steps = 16) {
    const c = scene.add.container(0, 0);
    for (let i = 0; i < steps; i += 1) {
        const a = a0 + ((a1 - a0) * (i + 0.5)) / steps;
        if (dir === 'down') c.add(scene.add.rectangle(x, y + (h * i) / steps, w, Math.ceil(h / steps) + 1, color, a).setOrigin(0));
        else c.add(scene.add.rectangle(x + (w * i) / steps, y, Math.ceil(w / steps) + 1, h, color, a).setOrigin(0));
    }
    return c;
}

// 피처드 초상 합성 텍스처(1회, 캔버스): 원본 x gacha.mask.feature(왼쪽·아래 부드럽게) + 오른쪽·아래·왼쪽 가장자리 페이드.
// 원본 그림이 액자처럼 잘린 가장자리(사각 경계)가 배경 위에 드러나지 않게 한다. 마스크가 아직 없으면 가장자리 페이드만.
const featMade = new Set();
export function featuredTex(scene, src) {
    const key = src + '__feat';
    if (scene.textures.exists(key)) return key;
    const img = scene.textures.get(src)?.getSourceImage?.();
    if (!img || !img.width) return src;
    const w = img.width; const h = img.height;
    const ct = scene.textures.createCanvas(key, w, h);
    const c = ct?.context;
    if (!c) return src;
    c.drawImage(img, 0, 0, w, h);
    const mk = 'gacha_mask_feature';
    if (scene.textures.exists(mk)) { c.globalCompositeOperation = 'destination-in'; c.drawImage(scene.textures.get(mk).getSourceImage(), 0, 0, w, h); }
    c.globalCompositeOperation = 'destination-out';
    const fade = (x0, y0, x1, y1, rx, ry, rw, rh) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,1)'); c.fillStyle = g; c.fillRect(rx, ry, rw, rh); };
    fade(w * 0.84, 0, w, 0, w * 0.84, 0, w * 0.16, h); // 오른쪽
    fade(w * 0.12, 0, 0, 0, 0, 0, w * 0.12, h); // 왼쪽
    fade(0, h * 0.78, 0, h, 0, h * 0.78, w, h * 0.22); // 아래
    c.globalCompositeOperation = 'source-over';
    ct.refresh();
    featMade.add(key);
    return key;
}
// 배너 전환 시 이전 합성본 해제(사용 객체는 clearLayer 로 이미 파괴된 뒤 호출) — 메모리 누적 방지
export const pruneFeaturedTex = (scene) => dropFeaturedTex(scene);
export function dropFeaturedTex(scene) { featMade.forEach((k) => { if (scene.textures.exists(k)) scene.textures.remove(k); }); featMade.clear(); }

// ---- 배너 테마(키아트 구성, 2026-11-03 사용자 레퍼런스) ----
// 서버에는 배너가 없어(단일 풀·같은 확률표) FE 표시용 정의. heroes = 대표 영웅 코드(최대 3, 풀에 있는 것만 표시, 앞이 가운데).
// 이벤트 기간·확률 상승 문구는 쓰지 않는다. 안아트 키아트·타이틀 플레이트가 오면 아래 키로 자동 교체(없으면 그라데이션 + 기존 배경).
export const BANNER_THEMES = [
    { key: 'imjin', title: '임진의 바다', sub: '나라를 지킨 이름들', tint: 0x2a6fa8, nativeTitle: false, heroes: ['yi_sun_sin', 'gwon_yul', 'gwak_jae_u'] },
    { key: 'conquest', title: '정복의 시대', sub: '정복자들이 깨어난다', tint: 0xb8862b, nativeTitle: true, heroes: ['alexander', 'genghis_khan', 'napoleon'] },
    { key: 'three_kingdoms', title: '천하삼분', sub: '난세를 가른 세 깃발', tint: 0xa83a2a, nativeTitle: true, heroes: ['cao_cao', 'liu_bei', 'sun_quan'], layout: 'ltr' }, // 2026-11-03 사용자 요청: 화면 왼쪽부터 조조·유비(가운데)·손권(이전 zhuge_liang, guan_yu, cao_cao)
    { key: 'europe', title: '대륙의 패권', sub: '왕관을 다투는 군주들', tint: 0x1f3a8a, nativeTitle: true, heroes: ['peter_great', 'julius_caesar', 'elizabeth_i'], layout: 'ltr' }, // 2026-11-03 사용자 요청: 천하삼분 다음 유럽 배너. 왼쪽부터 표트르 대제·카이사르(가운데 대표)·엘리자베스 1세(ltr = 배열 순서대로 왼쪽->가운데->오른쪽, 서버 hero_codes 도 같은 순서). 색 = 안아트 확정 주색 #1F3A8A(강조 #E9C46A). 타이틀 이미지(gacha.title.europe / .native)·키아트 없으면 FE 글자 타이틀·기본 배경 폴백
    { key: 'sengoku', title: '전국의 패자', sub: '천하를 다툰 무장들', tint: 0x7a3aa8, nativeTitle: true, heroes: ['takeda_shingen', 'oda_nobunaga', 'uesugi_kenshin'], layout: 'ltr' }, // 2026-11-03 사용자 지정: 화면 왼쪽부터 다케다·오다(가운데)·우에스기. layout 'ltr' = 배열 순서대로 왼쪽->가운데->오른쪽(다른 배너는 '앞이 가운데')
];
// 표시 목록에서 숨길 배너 key(정의·에셋은 유지). 현재 비어 있음: 표시 여부는 서버 배너 응답(시나리오 파생 목록)이 결정(2026-11-08 사용자 정정 — 삼국지·전국 시나리오 존재)
export const HIDDEN_BANNER_KEYS = new Set();
// 전용 일러스트(art_key 정의)가 없는 시나리오 배너의 동적 테마 색(2026-11-08 사용자 '배너 일러스트가 하나로 통일'): 목록 순서대로 서로 다른 색을 배정해
// 배경 색조 막·글로우·목록 테두리가 배너마다 구별되게 한다(색상환을 고르게 나눈 20색, 같은 화면 안 중복 없음)
export const DYN_TINTS = [0x2f7fbf, 0xc0503a, 0x3f9a5a, 0x8a4fc0, 0xc98a2a, 0x2a9a9a, 0xb84a7a, 0x5a6fc8, 0x8a9a2a, 0xd0683a, 0x3a7a5a, 0xa04a4a, 0x4a8ac8, 0x9a6a3a, 0x6a4aa8, 0x3aa07a, 0xc85a8a, 0x7a8aa0, 0xb0902a, 0x5a9ab8];
export const dynTint = (i) => DYN_TINTS[((i % DYN_TINTS.length) + DYN_TINTS.length) % DYN_TINTS.length];
// 전용 키아트(gacha.keyart.sc_chNN, 2026-11-08 안아트)가 있는 시나리오 배너의 테마 색 = 키아트 실측 주색(public/assets/gacha_ui/keyart_sc_theme_proposal.json tint).
// 동적 테마(dynTheme) 배너는 순번 색(dynTint) 대신 이 색을 써서 목록 테두리·색 띠·키아트 위 글로우가 그림과 맞게 한다. 메인스토리(sc_ch101~104)는 배너 제거로 제외
export const KEYART_TINTS = { sc_ch11: 0x9cc3dc, sc_ch13: 0x5d7a2a, sc_ch14: 0x1f8a78, sc_ch15: 0x14a9d6, sc_ch16: 0x6f8ff5, sc_ch17: 0xc82a3c, sc_ch18: 0x62c043, sc_ch19: 0xe8c27a, sc_ch21: 0x56677e, sc_ch22: 0xf57a14, sc_ch23: 0x8fb59a, sc_ch24: 0x7a2a44, sc_ch25: 0x5ed6b0 };
// 배너 일러스트(타이틀·키아트·tint) 조회 키: 서버 배너 art_key(예 카이사르 루비콘 -> 'europe' 일러스트 재활용) > key. 정의에 없으면 null(기본 배경·FE 글자 타이틀 폴백)
export const bannerArt = (key, artKey = null) => (artKey && BANNER_THEMES.find((t) => t.key === artKey)) || BANNER_THEMES.find((t) => t.key === key) || null;
// heroes: 일반 소환 대표 5명 고정(사용자 지정 2026-11-03). 배열 순서 = 배치 칸 순서(0 가운데 · 1 왼쪽 안 · 2 오른쪽 안 · 3 왼쪽 끝 · 4 오른쪽 끝)
//   -> 화면 왼쪽부터 관우 · 칭기즈 칸 · 잔 다르크(가운데) · 오다 노부나가 · 알렉산드로스. 풀에 없는 코드는 건너뜀. 비우면 서버(날짜별) 선택
export const NORMAL_THEME = { key: 'normal', nativeTitle: false, title: '역사의 서고', sub: '모든 시대의 영웅들', tint: 0x2fb5a6, collage: 5, heroes: ['joan_of_arc', 'genghis_khan', 'oda_nobunaga', 'guan_yu', 'alexander'] };
// 안아트 요청 예정 키(텍스처 키). 배너별: keyart(풀블리드 배경, 영웅 없음) · title(붓글씨 타이틀 플레이트, 글자 포함). 공용: titleBrush(글자 없는 먹 붓터치 띠, FE 글자 뒤)
export const THEME_KEYS = {
    keyart: (k) => `gacha_keyart_${k}`,
    title: (k) => `gacha_title_${k}`,
    titleNative: (k) => `gacha_title_${k}_native`, // 원어 붓글씨 타이틀(안아트 gacha.title.<key>.native, 같은 스코프). 있으면 큰 제목, 아래 한글 제목 병기. nativeTitle 배너만
    titleBrush: 'gacha_title_brush',
    heroTag: 'gacha_tag_hero', // 영웅 이름 태그 띠(마름모 아이콘 칸 + 이름 칸)
    listItem: 'gacha_list_compact', listItemSel: 'gacha_list_compact_selected', // 컴팩트 배너 목록 항목
};
// 메인 화면 분위기용 소형 fx(꽃잎·빛 파티클 시트 10KB)만 진입 시 받는다
export function loadGachaFxKeys(scene, logicals, cb) { loadFx(scene, (lg) => logicals.includes(lg), cb); }
