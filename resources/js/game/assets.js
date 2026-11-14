import Phaser from 'phaser';
import { audio } from './audio.js';
import { settings } from './settings.js';
import { RM_DIR, RM_SHEETS, rmTexKey } from './data/rmTileset.js';
import { U32_EXT, U32_EXT2, U32_EXT3, U32_KEY, U32_PATH, U32_PX, U32_TV2, U32_TV2_SHEETS, U32_WS, U32_WS_SHEETS } from './data/unityTileset.js';
import { TV3_BASE_KEY, TV3_BASE_PATH, TV3_OBJECTS, TV3_PIER_KEY, TV3_PIER_PATH, TV3_SETS, tv3ObjKey, tv3ObjPath, tv3SetKey, tv3SetPath } from './data/terrainV3.js';
import { TB_MANIFEST_KEY, TB_MANIFEST_PATH, artNeeded, tbTexKey } from './data/mapArt.js';
import { texHi, texScreenW } from './layout.js';
import { setSkinUnitPx } from './ui/skin.js';
import { ASSET_VERSION, withVer } from './assetVersion.js';
import { typeAlias } from './data/rules.js';

export { ASSET_VERSION, withVer };

// 에셋 로더(안아트 결과물 연결). public/assets/manifest.json(v2: items 배열 [{key, path, type, size, variants...}]) 의 키로 로드한다.
// manifest 가 없을 때만 FALLBACK(존재 확인된 파일) 목록을 쓴다. 존재하지 않는 경로는 SPA 폴백이 HTML 을 200 으로 주므로
// (이미지 디코딩 실패) manifest 에 있는 파일만 요청하고, 실패한 키는 로드 완료 시 console.warn 한 줄로만 요약한다.
// 논리 키 -> 텍스처 키: 점(.)을 밑줄(_)로. 예) tile.plain.a -> tile_plain_a, unit.sword.ally -> unit_sword_ally, icon.gold -> icon_gold, portrait.yi_sun_sin -> portrait_yi_sun_sin
// 오디오(bgm.*/sfx.*)는 public/assets/audio/manifest.json(slots) 로만 연결한다(본 manifest 의 오디오 항목은 중복이라 건너뜀).
//
// ---- 로드 범위(scope): "필요한 화면에서만 받는다" ----
// 부팅(Preload)은 scope 'boot' 만 받는다. 나머지는 화면 진입 시 queueScope(씬 preload 단계) / ensureScope(실행 중) 로 받는다.
// scope 결정(scopeOf): manifest(fragment 병합 결과) 항목의 scope 값 > lazy:false -> boot > 키 접두사 기본값(SCOPE_RULES).
//   boot   : UI 스킨 기본 아틀라스·타이틀/로비 배경·아이콘·장식(그 외 알 수 없는 키도 안전하게 boot)
//   battle : unit.*, tile.*, fx.*, bg.battle.*, bg.map_outside (편성 Deploy·전투 Battle preload 에서 로드, 로비 대기 중 HTTP 캐시 예열)
//   hero   : portrait.*(ensurePortraitTex 개별 지연 로드, LRU), icon.skill.* / skill.*
//   gacha  : atlas.uiskin_gacha, bg.screen.gacha (영웅·편성·뽑기 탭 진입 시, 전투 결과 배너)
//   equip  : equip.* (lobbyExtra 가 자체 지연 로드)
//   lazy   : deferred/lazy:true 인데 scope 미지정(ensureSkinTexture 로 개별 요청)
export const texKey = (logical) => logical.replace(/\./g, '_');
const pixelKeys = (k) => /^(tile|unit|icon|fx|deco|ship_overlay)[._]/.test(k) || k === 'pixel_badges' || k === 'skill_icons'; // skill_icons: 스킬 아이콘 도트 아틀라스(atlas.skill_icons, ui/SkillIcon.js) // ship_overlay: 수상 배 오버레이(도트, NEAREST) // pixel_badges: 도트 뱃지 아틀라스(atlas.pixel_badges)
const IMAGE_TYPES = new Set(['tile', 'unit', 'spritesheet', 'icon', 'effect', 'fx', 'portrait', 'deco', 'image']);
const CLASS_FILE = { flyer: 'flying', sailor: 'naval' }; // 병종 코드 -> 에셋 파일/키 이름 차이
// 유닛 시트가 없는 병종 -> 대체 병종. 수병: 안아트 수병 시트(unit.<culture>.naval.* -> unit.default.naval.*)가 없거나 아직 지연 로드 전이면 창병(조각 fallback 필드와 동일)
// 병종 v2 임시 스프라이트 별칭(전용 시트가 없을 때만): assassin -> archer, monster -> cavalry(팀장 지시 2026-11-03). naval 은 안아트 수병 시트가 있어 기존 창병 폴백 유지
const SPRITE_CLASS_FALLBACK = { naval: 'spear', assassin: 'archer', monster: 'cavalry', gunner: 'archer' }; // gunner: 전용 총병 시트 도착 전 문화권 궁병 시트(강화면 34회차: 컷신 청록 사각형)
const LINEAR_KEYS = ['uiskin', 'uiskin_extra', 'uiskin_gacha', 'bgscreen_title', 'bgscreen_lobby', 'bgscreen_gacha', 'bg_map_outside', 'mapedge'];

const FALLBACK = {};
['plain', 'forest', 'mountain', 'water', 'castle'].forEach((t) => { FALLBACK[`tile.${t}.a`] = { path: `assets/tiles/32/${t}_a.png`, type: 'tile' }; });
['sword', 'spear', 'cavalry', 'archer', 'mage', 'healer', 'heavy', 'flying'].forEach((t) => {
    FALLBACK[`unit.${t}.ally`] = { path: `assets/sprites/idle/${t}_ally.png`, type: 'unit' };
    FALLBACK[`unit.${t}.enemy`] = { path: `assets/sprites/idle/${t}_enemy.png`, type: 'unit' };
});
['hit_spark', 'slash', 'heal_glow', 'levelup_pillar', 'fire_burst', 'lightning'].forEach((f) => { FALLBACK[`fx.${f}`] = { path: `assets/test/effects/256/${f}.png`, type: 'effect' }; });

let heroMap = {};
const warnedHero = new Set();
// bytes: 텍스처/오디오 키 -> manifest bytes(로딩 화면 MB 표시용, 없으면 0)
export const loaded = { manifest: null, keys: new Set(), audio: new Map(), bgm: new Map(), failed: [], tileSrc: 32, bytes: new Map() };

// scope 판정. fragment 의 scope 값을 최우선(안아트 신규 에셋), 없으면 접두사 규칙
export function scopeOf(logical, v = {}) {
    if (v?.scope) return String(v.scope);
    if (v?.lazy === false) return 'boot';
    const [p, s] = logical.split('.');
    if (p === 'portrait') return 'hero';
    if (p === 'skill' || (p === 'icon' && s === 'skill')) return 'hero';
    if (p === 'unit' || p === 'tile' || p === 'fx' || p === 'effect' || v?.type === 'effect') return 'battle';
    if (p === 'bg' && s === 'battle') return 'battle';
    if (logical === 'bg.map_outside') return 'battle';
    if (logical === 'atlas.uiskin_gacha' || logical === 'bg.screen.gacha') return 'gacha';
    if (p === 'equip') return 'equip';
    if (v?.deferred || v?.lazy === true) return 'lazy';
    return 'boot';
}
const SKIP_PREFIX = new Set(['bgm', 'sfx', 'ui', 'brand', 'tileset']); // 오디오는 audio manifest, ui.* 는 JSON 스펙, brand.* 는 brand.js, tileset.* 는 queueRmTiles
const loadable = (logical, v) => !logical.startsWith('__') && v?.path && !SKIP_PREFIX.has(logical.split('.')[0]);

// preload(): manifest 들을 먼저 받고, 받는 대로 boot scope 파일을 로더에 추가한다(로더는 동적 추가를 지원).
export function queueAssets(scene) {
    const Ld = scene.load;
    loaded.failed = [];
    loaded.maxTex = Number(scene.sys.game?.renderer?.getMaxTextureSize?.()) || 4096; // 최대 텍스처 변(px). texFits 판정(4096 기기에서 4200·4794px 텍스처 회피)
    // 2026-11-14 성능 1단계: 런타임 manifest(scripts/build_runtime_manifest.mjs, 제작 메타 제외)를 먼저 받는다.
    //  text 로 받아 직접 파싱 -> 없거나(SPA 폴백 HTML 200 포함) 파싱 실패면 원본 manifest.json 으로 폴백(Phaser json 파싱 실패는 예외를 던져 클라이언트 오류 리포트로 남으므로 피함).
    //  원본 강제: 콘솔 settings.set({ manifestFull: true }) 후 새로고침
    const full = () => Ld.json('assets_manifest', withVer('/assets/manifest.json'));
    if (settings.get().manifestFull === true) full();
    else {
        Ld.text('assets_manifest_rt', withVer('/assets/manifest.runtime.json'));
        Ld.once('filecomplete-text-assets_manifest_rt', (_k, _t, txt) => {
            let data = null;
            try { data = JSON.parse(txt); } catch { data = null; }
            try { scene.cache.text.remove('assets_manifest_rt'); } catch { /* 무시 */ }
            if (!Array.isArray(data?.items)) { console.warn('[assets] manifest.runtime.json 없음/형식 오류 -> manifest.json 폴백'); full(); return; }
            loaded.manifestSource = 'runtime';
            onManifest(data);
        });
    }
    const onManifest = (data) => { loaded.terrainMap = data?.terrainMap ?? null; loaded.terrainByCode = null; setManifest(normalizeManifest(data)); queueScope(scene, 'boot'); }; // terrainMap: 지형 기호 -> 타일 키 후보(systems/terrainTiles)
    Ld.json('audio_manifest', withVer('/assets/audio/manifest.json'));
    Ld.json('hero_sprite_map', withVer('/assets/hero_sprite_map.json')); // 선택(없으면 무시)
    Ld.json('hero_sprite_map_v2', withVer('/assets/hero_sprite_map_v2.json')); // 안아트 감사 v2 재매핑(36명, {heroes:{code: 'unit.<문화권>.<병종>' | 'unit.hero.<에셋 코드>'}}) — 기존 맵 위에 덮어씀
    Ld.json('hero_sprite_map_v4', withVer('/assets/sprites/hero_sprite_map_v4.json')); // 안아트 v4: 영웅 101명 -> 초상화 1:1 전용 시트 base(unit.hero.<asset>[_v4]). v1·v2 보다 우선(manifest 조각 hero_v4 병합과 한 묶음)
    Ld.json('cutscene_sfx_cues', withVer('/assets/audio/cutscene_sfx_cues.json')); // 교전 컷신 효과음 큐(선택). sfx_battle_* 파일은 audio manifest 슬롯으로 함께 로드된다
    Ld.once('filecomplete-json-assets_manifest', (_k, _t, data) => { loaded.manifestSource = 'full'; onManifest(data); });
    Ld.once('filecomplete-json-audio_manifest', (_k, _t, data) => queueAudio(scene, data));
    Ld.on('loaderror', (f) => {
        if (f?.key === 'assets_manifest_rt') { console.warn('[assets] manifest.runtime.json 로드 실패 -> manifest.json 폴백'); full(); return; }
        if (f?.key === 'assets_manifest') { setManifest(FALLBACK); queueScope(scene, 'boot'); return; }
        if (f?.key !== 'audio_manifest' && f?.key !== 'hero_sprite_map' && f?.key !== 'hero_sprite_map_v2' && f?.key !== 'hero_sprite_map_v4' && f?.key !== 'cutscene_sfx_cues') loaded.failed.push(`${f?.type}:${f?.key}`);
    });
    Ld.once('complete', () => { if (loaded.failed.length) console.warn(`[assets] 로드 실패 ${loaded.failed.length}건(폴백 사용): ${loaded.failed.join(', ')}`); });
    queueRmTiles(scene);
}

// 맵 개편(mapArt) 에셋 지연 로드: 전투 진입 시 그 맵에 필요한 것만(Battle.ensureWorld 가 끝날 때까지 월드 구성을 미룸). 플래그·개편 필드가 없는 맵은 호출되지 않음.
// - v3 지면 시트(설정이 v3 가 아니어도 자동 활성 맵이면 필요) + 부두 시트, tb_manifest.json -> 이 맵이 쓰는 키(artNeeded)·오토타일 시트, 통그림(painted.key/url)
// - 실패한 파일은 건너뛰고(호출 측이 textures.exists 로 판정해 폴백) 항상 resolve. 15초 안전 타임아웃
// - 완료 판정 = '이 호출이 요청한 파일'만(텍스처 추가/로드 실패 이벤트). 로더 전체 'complete' 를 기다리지 않는다
//   (같은 씬 로더의 BGM·초상 등 다른 지연 로드까지 기다리느라 Deploy '배치 정보를 불러오는 중'이 길어지던 문제)
// - 씬 간 중복 요청 방지(artPending): Deploy(또는 relayout 재시작 전 Deploy)가 받는 중인 키를 Battle 이 또 큐에 넣으면
//   두 로더가 모두 addToCache -> 'Texture key already in use: tb_*'. 다른 로더가 받는 중이면 그 완료를 기다리고,
//   끝났는데도 텍스처가 없으면(원래 씬 종료로 시작 못 한 파일·실패) 이 씬 로더로 1회 다시 요청한다.
const ART_TIMEOUT_MS = 15000;
const artPending = new Map(); // texKey -> Promise(텍스처 추가·실패·원래 씬 종료(미시작)·시간 초과 시 resolve)
function trackArtKey(scene, k) {
    const Ld = scene.load; const tm = scene.textures;
    let file = null;
    Ld.list.forEach((f) => { if (f.key === k && f.type === 'image') file = f; });
    let p = null;
    p = new Promise((res) => {
        let settled = false;
        const settle = () => {
            if (settled) return; settled = true;
            tm.off(`addtexture-${k}`, settle); Ld.off('loaderror', onErr); scene.events.off('shutdown', onShut); clearTimeout(t);
            if (artPending.get(k) === p) artPending.delete(k);
            res();
        };
        const onErr = (f) => { if (f?.key === k) settle(); };
        // 씬 종료(relayout 재시작·씬 전환) 시 로더가 리셋된다: 이미 받는 중(XHR 진행)인 파일은 그대로 캐시에 추가되므로 계속 기다리고, 시작 전 파일은 버려지므로 즉시 해제
        const onShut = () => { if (!file || file.state === Phaser.Loader.FILE_PENDING) settle(); };
        const t = setTimeout(settle, ART_TIMEOUT_MS);
        tm.once(`addtexture-${k}`, settle);
        Ld.on('loaderror', onErr);
        scene.events.once('shutdown', onShut);
    });
    artPending.set(k, p);
    return p;
}
// tb_manifest.json 선요청(배치 API 응답을 기다리는 동안 병렬로). 이미 캐시에 있거나 받는 중이면 무시
export function prefetchMapArtManifest(scene) {
    try {
        if (scene.cache.json.exists(TB_MANIFEST_KEY)) return;
        scene.load.json(TB_MANIFEST_KEY, withVer(TB_MANIFEST_PATH)); // 같은 로더에 같은 키가 이미 있으면 Phaser 가 무시
        if (!scene.load.isLoading()) scene.load.start();
    } catch { /* 선요청 실패는 loadMapArtAssets 가 다시 요청 */ }
}
export function loadMapArtAssets(scene, map, opts, painted = null) {
    const Ld = scene.load;
    const tm = scene.textures;
    const wants = []; // [texKey, path]
    const waits = [];
    const borrowed = new Set(); // 다른 로더 결과를 기다린 키(재요청 후보). 이 로더가 받다 실패한 키는 재요청하지 않음
    const queue = (pairs, retry) => {
        let added = 0;
        pairs.forEach(([k, path]) => {
            if (tm.exists(k)) return;
            if (retry && !borrowed.has(k)) return;
            const pend = artPending.get(k);
            if (pend && !retry) { borrowed.add(k); waits.push(pend); return; } // 다른 로더(이전 Deploy 등)가 받는 중 -> 그 결과를 기다림
            if (pend) return; // 재시도 시점에도 받는 중이면 그대로 둔다(중복 등록 방지 우선)
            Ld.image(k, withVer(path)); added += 1;
            waits.push(trackArtKey(scene, k));
        });
        if (added && !Ld.isLoading()) Ld.start();
    };
    const img = (k, p) => wants.push([k, p]);
    img(TV3_BASE_KEY, TV3_BASE_PATH);
    TV3_SETS.forEach((t) => img(tv3SetKey(t), tv3SetPath(t)));
    TV3_OBJECTS.forEach((o) => img(tv3ObjKey(o), tv3ObjPath(o)));
    img(TV3_PIER_KEY, TV3_PIER_PATH);
    if (painted) img(painted.key, painted.src);
    const itemPairs = (data) => {
        const base = data?.base ?? '/assets/tiles/terrain_buildings/';
        const items = data?.items ?? {};
        const need = artNeeded(items, map, opts, data?.sheets);
        const out = [];
        need.keys.forEach((k) => out.push([tbTexKey(k), base + items[k].file]));
        need.sheets.forEach((sn) => { const sh = data?.sheets?.[sn]; if (sh?.file) out.push([`tb_sheet_${sn}`, base + sh.file]); if (sh?.file_b) out.push([`tb_sheet_${sn}_b`, base + sh.file_b]); });
        return out;
    };
    // tb_manifest: 캐시에 있으면 즉시, 없으면 이 씬 로더로 받는다(선요청 중이면 같은 파일 완료 이벤트를 함께 기다림)
    const manifest = scene.cache.json.exists(TB_MANIFEST_KEY)
        ? Promise.resolve(scene.cache.json.get(TB_MANIFEST_KEY))
        : new Promise((res) => {
            let ok = false;
            const fin = (data) => { if (ok) return; ok = true; clearTimeout(t); Ld.off(`filecomplete-json-${TB_MANIFEST_KEY}`, onDone); Ld.off('loaderror', onErr); res(data ?? (scene.cache.json.exists(TB_MANIFEST_KEY) ? scene.cache.json.get(TB_MANIFEST_KEY) : null)); };
            const onDone = (_k, _t, data) => fin(data);
            const onErr = (f) => { if (f?.key === TB_MANIFEST_KEY) fin(null); };
            const t = setTimeout(() => fin(null), ART_TIMEOUT_MS);
            Ld.once(`filecomplete-json-${TB_MANIFEST_KEY}`, onDone);
            Ld.on('loaderror', onErr);
            Ld.json(TB_MANIFEST_KEY, withVer(TB_MANIFEST_PATH));
            if (!Ld.isLoading()) Ld.start();
        });
    const work = (async () => {
        queue(wants, false);
        const data = await manifest;
        const items = data ? itemPairs(data) : [];
        queue(items, false);
        // 기다리는 대상이 추가될 수 있어(위 queue) 남은 것이 없을 때까지 모은다
        let seen = 0;
        while (seen < waits.length) { const batch = waits.slice(seen); seen = waits.length; await Promise.all(batch); }
        // 다른 로더를 기다렸는데 텍스처가 없으면(원래 씬 종료로 미시작) 이 로더로 1회 재요청
        const before = waits.length;
        queue([...wants, ...items], true);
        if (waits.length > before) await Promise.all(waits.slice(before));
    })().catch((e) => console.warn('[mapArt] 에셋 로드 중 오류(폴백)', e));
    // 15초 안전 타임아웃(기존과 같음)
    return Promise.race([work, new Promise((res) => setTimeout(res, ART_TIMEOUT_MS))]);
}

// 지형 타일셋(서드파티, manifest 와 분리 로드 — manifest 항목 tileset.unity32 는 등록부 기록용이며 queueScope 가 건너뜀). 용량이 작아(수십 KB) 부팅 유지.
// - 'unity32'(기본): Unity 32px 시트 1장(spritesheet 32x32, 프레임 0~29), ?v= 캐시 버스팅. RM 시트는 받지 않는다.
// - 'rm': RM MV 시트 7장(data/rmTileset.js). 실패하면 rmReady()=false -> legacy 타일로 폴백
function queueRmTiles(scene) {
    const style = settings.get().terrainStyle;
    if (style === 'unity32' || style === 'v3') {
        // 'v3'(자체 제작 지형 시범, data/terrainV3.js): unity32 시트 전부(폴백용) + v3 시트(질감 1·경계 8·오브젝트 5장, 약 60KB)
        if (style === 'v3') {
            const img = (k, p) => { if (!scene.textures.exists(k)) scene.load.image(k, withVer(p)); };
            img(TV3_BASE_KEY, TV3_BASE_PATH);
            TV3_SETS.forEach((s) => img(tv3SetKey(s), tv3SetPath(s)));
            TV3_OBJECTS.forEach((o) => img(tv3ObjKey(o), tv3ObjPath(o)));
            img(TV3_PIER_KEY, TV3_PIER_PATH); // 부두 h(선택, 없으면 그 칸만 unity32)
        }
        // Multiple 32x32 분할(margin/spacing 0, extrude 없음), 필터 NEAREST 는 applyFilters
        if (!scene.textures.exists(U32_KEY)) scene.load.spritesheet(U32_KEY, withVer(U32_PATH), { frameWidth: U32_PX, frameHeight: U32_PX });
        if (U32_EXT.enabled && !scene.textures.exists(U32_EXT.key)) scene.load.spritesheet(U32_EXT.key, withVer(U32_EXT.path), { frameWidth: U32_PX, frameHeight: U32_PX });
        if (U32_EXT2.enabled && !scene.textures.exists(U32_EXT2.key)) scene.load.spritesheet(U32_EXT2.key, withVer(U32_EXT2.path), { frameWidth: U32_PX, frameHeight: U32_PX }); // 전환 시트2(110~163)
        if (U32_EXT3.enabled && !scene.textures.exists(U32_EXT3.key)) scene.load.spritesheet(U32_EXT3.key, withVer(U32_EXT3.path), { frameWidth: U32_PX, frameHeight: U32_PX }); // 육상 세트(500~829)
        if (U32_WS.enabled) U32_WS_SHEETS.forEach((w) => { if (!scene.textures.exists(w.key)) scene.load.spritesheet(w.key, withVer(w.path), { frameWidth: U32_PX, frameHeight: U32_PX }); }); // 수상 세트(200~425, 합계 약 95KB). ws_overlay 는 전투 목표 깃발 스프라이트로도 사용
        if (settings.get().terrainTv2 === false) U32_TV2.enabled = false; // 콘솔 롤백 스위치(새로고침 후 기존 타일)
        if (U32_TV2.enabled) U32_TV2_SHEETS.forEach((w) => { if (!scene.textures.exists(w.key)) scene.load.spritesheet(w.key, withVer(w.path), { frameWidth: U32_PX, frameHeight: U32_PX }); }); // 타일셋 v2(U32_TV2_SHEETS: 1000~1676 정적, 1700~1747 애니, 1800~1908 애니2 tv2_anim2, 2000~2095 정적2 tv2_static2, 합계 약 175KB)
        return;
    }
    if (style === 'legacy') return;
    Object.entries(RM_SHEETS).forEach(([sheet, file]) => scene.load.image(rmTexKey(sheet), `${RM_DIR}${file}`));
}

// v2 배열 / v1 객체 모두 key -> {path, type, ...} 로
function normalizeManifest(data) {
    const out = {};
    const items = data?.items ?? data ?? {};
    if (Array.isArray(items)) items.forEach((it) => { if (it?.key && it.path) out[it.key] = it; });
    else Object.entries(items).forEach(([k, v]) => { if (k !== 'version' && v) out[k] = typeof v === 'string' ? { path: v } : v; });
    out.__tileSize = Number(data?.tileSize ?? 0) || 0;
    return out;
}
// 텍스처 키(texKey 변환 후)가 manifest 에서 mounted:true(말 탄 시트)인지. 서버 병종이 기병이 아니어도 시트가 기마면 UnitView 가 기병 표시 배율을 쓴다(예: shah_jahan sword·rana_pratap spear)
export const mountedTex = (key) => {
    if (!key || !loaded.manifest) return false;
    if (!loaded.mountedKeys) loaded.mountedKeys = new Set(Object.entries(loaded.manifest).filter(([, v]) => v?.mounted === true).map(([k]) => texKey(k)));
    return loaded.mountedKeys.has(key);
};
function setManifest(items) {
    loaded.manifest = items;
    loaded.mountedKeys = null;
    loaded.deferred = {};
    loaded.npcByName = new Map(); // NPC 이름(name_ko) -> npc 코드(manifest 항목의 npc 필드, 안아트 npc_naval 조각)
    Object.entries(items).forEach(([lg, v]) => {
        if (v?.textureKey) loaded.deferred[v.textureKey] = { logical: lg, v };
        if (v?.npc && v?.name_ko && !loaded.npcByName.has(v.name_ko)) loaded.npcByName.set(String(v.name_ko), String(v.npc));
    });
    // npc 필드가 없는 NPC 초상(portrait.npc_<x>, name_ko 있음: 안아트 preview 조각 황개·노숙 등) -> 이름으로도 연결
    Object.entries(items).forEach(([lg, v]) => {
        const m = /^portrait\.(npc_[a-z0-9_]+)$/.exec(lg);
        if (m && v?.path && v?.name_ko && !loaded.npcByName.has(v.name_ko)) loaded.npcByName.set(String(v.name_ko), m[1]);
    });
    // 적 지휘관 kind:'hero'(ref 가 npc_ 형식이 아니라 서버 npc_ref 로 안 넘어옴, hero=null) -> 이름으로 영웅 초상 연결(stages_*_enemy_v3 기준, 2026-11-02)
    Object.entries(ENEMY_HERO_LEADER_PORTRAIT).forEach(([nm, code]) => {
        if (!loaded.npcByName.has(nm) && items[`portrait.${code}`]?.path) loaded.npcByName.set(nm, code);
    });
}
const ENEMY_HERO_LEADER_PORTRAIT = {
    힐데가르트: 'hildegard', 광개토대왕: 'gwanggaeto', 장수왕: 'jangsu', 제갈량: 'zhuge_liang',
    한니발: 'hannibal', '칭기즈 칸': 'genghis_khan', 알렉산드로스: 'alexander',
    조조: 'cao_cao', 계백: 'gyebaek', '리처드 1세': 'richard_i', // 강화면 a7 전수: ch12_s3·ch13_s2·ch19_s3/s4 적장(kind hero, npc_ref 가 npc_ 형식 아님 -> 서버 미전달)이 문화권 시트로 폴백. 영웅 초상·unit.hero 시트 보유
};
export const manifestHas = (logical) => !!loaded.manifest?.[logical]?.path;

// 항목 1개를 씬 로더에 넣는다. 이미 텍스처가 있으면 false
const FAILED = new Set(); // 지연 로드 실패 텍스처 키(같은 세션에서 재요청 -> 재그리기 반복 방지)
function queueItem(scene, logical, v) {
    if (v.textureKey) {
        if (scene.textures.exists(v.textureKey) || FAILED.has(v.textureKey)) return false;
        loadSkinItem(scene.load, v.textureKey, v);
        return true;
    }
    const prefix = logical.split('.')[0];
    const type = v.type ?? prefix;
    if (!IMAGE_TYPES.has(type) && !/\.(png|jpg|jpeg|webp|gif)$/i.test(v.path)) return false;
    const key = texKey(logical);
    if (scene.textures.exists(key) || FAILED.has(key)) return false;
    if (!v.frameWidth && !v.grid && !v.frame && type !== 'spritesheet' && !/\.sheet$/.test(logical)) v = fitVariant(v); // 단일 이미지만: 최대 텍스처 초과면 맞는 변형(시트는 프레임 계산이 원본 기준이라 제외)
    const url = withVer(abs(v.path));
    // 프레임 크기: manifest frameWidth > size("WxH" 또는 [W,H]) + grid("3x4...") 로 계산 > 방향 시트(.sheet)는 3x4 > 그 외 spritesheet 32.
    // (영웅 방향 시트 26종은 frameWidth 가 없고 size 가 [192,256] 배열이라 예전 기본값 32 로 잘못 쪼개져 유닛이 조각나 보였다)
    const [sw, sh] = Array.isArray(v.size) ? v.size.map(Number) : String(v.size ?? '').split(/[x,]/).map(Number);
    const g = /^(\d+)x(\d+)/.exec(String(v.grid ?? '')) ?? (/\.sheet$/.test(logical) ? [0, 3, 4] : null);
    const fa = Array.isArray(v.frame) ? v.frame.map(Number) : null; // 병합 영웅 시트: frameWidth 없이 frame:[64,64]
    const fw = Number(v.frameWidth ?? fa?.[0] ?? (g && sw ? sw / Number(g[1]) : (type === 'spritesheet' ? 32 : 0)));
    const fh = Number(v.frameHeight ?? fa?.[1] ?? (g && sh ? sh / Number(g[2]) : fw));
    if (/\.sheet$/.test(logical) && sw && sh && (sw / fw !== 3 || sh / fh !== 4)) console.warn(`[assets] 방향 시트 프레임 불일치 ${logical} ${sw}x${sh} / ${fw}x${fh} -> 3x4 로 강제 분할`);
    if (fw > 0) scene.load.spritesheet(key, url, { frameWidth: fw, frameHeight: fh });
    else scene.load.image(key, url);
    loaded.keys.add(key);
    loaded.bytes.set(key, Number(v.bytes) || 0);
    return true;
}

// scope 의 항목을 씬 로더에 넣는다(portrait.* 제외 — ensurePortraitTex 전용). filter(logical, v) 로 일부만. 반환: 새로 넣은 개수.
// 씬 preload() 에서 부르면 Phaser 가 로드 후 create 를 부른다. 실행 중이면 ensureScope 를 쓴다.
// 유닛별 지연 키(2026-11-03 성능): 영웅 전용 시트 unit.hero.* · 주인공 시트 unit.protagonist.* 는 battle scope 이지만 일괄 큐(필터 없는 queueScope/warmScope)에서 뺀다.
// (이전: 전투·편성 진입마다 영웅 101명 x 진영 2 x 시트/단일 = 약 500장을 전부 요청) 전장에 나온 유닛 것만 ensureUnitTex(UnitView·편성 아이콘)가 받는다.
// 받기 전에는 문화권/병종 공용 시트(일괄 로드 유지)로 그려 두고 받으면 교체 -> 빈 프레임 없음
const PER_UNIT_LAZY = /^unit\.(hero|protagonist)\./;
// 컷신 지형 배경 bg.battle.*(27장)도 일괄 큐에서 빼고, 전장 지형에 쓰는 것만 ensureBattleBgs 로 받는다(.b 변형 등 안 쓰는 배경 요청 제거)
const BATTLE_BG_LAZY = /^bg\.battle\./;
// 영웅 스킬 이펙트 시트 fx.skill.*(39장, 안아트 2026-11-06)도 일괄 큐에서 빼고, 전장 유닛 액티브 스킬 것만 ensureSkillFx 로 받는다(fx/SkillFxSheet.preloadSkillFx)
const SKILL_FX_LAZY = /^fx\.skill\./;
const perUnitLazy = (lg, scope, filter) => scope === 'battle' && !filter && (PER_UNIT_LAZY.test(lg) || BATTLE_BG_LAZY.test(lg) || SKILL_FX_LAZY.test(lg));
// 스킬 이펙트 시트 지연 로드: manifest 에 있고 아직 없는(실패 제외) 키만. cb(ok) 는 받을 것이 없으면 호출 안 함. 반환: 요청했으면 true
export function ensureSkillFx(scene, logicals, cb = null) {
    if (!loaded.manifest) return false;
    const want = [...new Set(logicals ?? [])].filter((lg) => SKILL_FX_LAZY.test(lg) && manifestHas(lg) && !scene.textures.exists(texKey(lg)) && !FAILED.has(texKey(lg)));
    if (!want.length) return false;
    ensureScope(scene, scopeOf(want[0], loaded.manifest[want[0]]), (ok) => cb?.(ok), { filter: (lg) => want.includes(lg) });
    return true;
}
export const skillFxFailed = (logical) => FAILED.has(texKey(logical));
// 컷신 배경 지연 로드: logicals(우선순위 묶음 배열의 배열 [[후보1, 후보2..], ...]) 마다 manifest 에 있는 첫 후보 1장만 받는다.
// 이미 있거나 실패(FAILED)한 키는 다시 요청하지 않는다. 받기 전·실패 시 컷신은 코드 그래픽 배경으로 폴백(BattleCutscene.drawBackdrop). cb(ok) 는 받을 것이 없으면 호출 안 함
export function ensureBattleBgs(scene, groups, cb = null) {
    if (!loaded.manifest) return false;
    const want = [...new Set((groups ?? []).map((g) => (g ?? []).find((lg) => manifestHas(lg))).filter(Boolean))]
        .filter((lg) => !scene.textures.exists(texKey(lg)) && !FAILED.has(texKey(lg)));
    if (!want.length) return false;
    const scopes = [...new Set(want.map((lg) => scopeOf(lg, loaded.manifest[lg])))];
    let left = scopes.length; let okAll = true;
    scopes.forEach((sc) => ensureScope(scene, sc, (ok) => { okAll = okAll && ok; if (--left === 0) cb?.(okAll); }, { filter: (lg) => want.includes(lg) }));
    return true;
}
export function queueScope(scene, scope, { filter = null } = {}) {
    const m = loaded.manifest;
    if (!m) return 0;
    let n = 0;
    Object.entries(m).forEach(([lg, v]) => {
        if (!loadable(lg, v) || lg.startsWith('portrait.') || scopeOf(lg, v) !== scope) return;
        if (perUnitLazy(lg, scope, filter)) return;
        if (filter && !filter(lg, v)) return;
        if (queueItem(scene, lg, v)) n += 1;
    });
    if (n) {
        const Ld = scene.load;
        const onErr = (f) => { if (f?.key) FAILED.add(f.key); };
        Ld.on('loaderror', onErr);
        Ld.once('complete', () => { Ld.off('loaderror', onErr); applyFilters(scene); });
    }
    return n;
}
// 실행 중 지연 로드: cb(ok, queuedCount). 받을 것이 없으면 즉시 cb(true, 0)(동기). 로드 중 씬이 종료되면 cb(false, n)
// — 씬 종료 시 Phaser 로더가 리셋되어 complete 가 오지 않으므로 호출 측 '로딩 중' 플래그는 cb 에서 반드시 푼다(객체 생존 가드 필수).
export function ensureScope(scene, scope, cb, { filter = null } = {}) {
    const n = queueScope(scene, scope, { filter });
    if (!n) { cb?.(true, 0); return; }
    let done = false;
    const fin = (ok) => { if (done) return; done = true; scene.load.off('complete', onC); scene.events.off('shutdown', onS); cb?.(ok, n); };
    const onC = () => fin(true);
    const onS = () => fin(false);
    scene.load.once('complete', onC);
    scene.events.once('shutdown', onS);
    if (!scene.load.isLoading()) scene.load.start();
}

// ---- UI 스킨(manifest 병합분: textureKey 가 있는 항목) ----
// 캐시 버스팅: ASSET_VERSION/withVer 는 assetVersion.js(위에서 re-export). manifest 항목 URL 전부에 ?v= 를 붙인다.
const abs = (p) => (p.startsWith('/') || p.startsWith('http') ? p : `/${p}`);
// 최대 텍스처 크기 판정(2026-11-14 성능 1단계). size("WxH" | [W,H])를 모르면 true(기존 동작 유지).
//  4096 한도 기기(구형 안드로이드 등)에서 4096 초과 텍스처는 업로드 실패(검은 사각형)·드라이버 축소가 날 수 있어 저해상 변형을 고른다
export const sizeOf = (v) => { const s = v?.size; const [w, h] = Array.isArray(s) ? s.map(Number) : String(s ?? '').split(/[x,]/).map(Number); return [w || 0, h || 0]; };
export function texFits(v) {
    const [w, h] = sizeOf(v);
    const max = loaded.maxTex || 4096;
    return !(w > max || h > max);
}
// 한도를 넘는 항목이면 변형 중 한도 안에서 가장 큰 것(없으면 원본)
export function fitVariant(v) {
    if (!v || texFits(v) || !v.variants) return v;
    let best = null; let bw = 0;
    Object.values(v.variants).forEach((vv) => { if (!vv || typeof vv !== 'object' || !vv.path) return; const [w] = sizeOf(vv); if (w > 0 && texFits(vv) && w > bw) { best = vv; bw = w; } });
    return best ? { ...v, ...best, variants: v.variants } : v;
}
// 해상도 선택(가이드): 화면 1u 가 백킹 1.7px 이상이면 @3x, 아니면 @1.5x(layout.texHi — DPR 이중 곱 수정 2026-11-14). 세션 안에서 섞지 않는다(최초 1회 결정)
let hiRes = null;
const pickHiRes = () => { if (hiRes == null) hiRes = texHi(); return hiRes; };
loaded.unitPx = {}; // 아틀라스 텍스처 키 -> 1u 당 px(3 | 1.5)
loaded.deferred = {}; // textureKey -> {logical, v}
// 스킨 항목의 실제 파일(해상도 변형 선택 포함). [{url, kind:'img'|'json'}], bytes
function skinFiles(v) {
    const hi = pickHiRes();
    if (v.type === 'pixel-atlas') { // 도트 뱃지: 같은 해상도 규칙(hi -> @3x), 저해상도는 @2x(@1.5x 비정수 금지). 표시 배율은 ui/PixelBadge.js
        // @3x 아틀라스(4794x108)가 최대 텍스처(4096 기기)를 넘으면 @2x(3196x72). size 는 런타임 manifest 가 헤더에서 보강, 없으면 알려진 폭 4794 로 판정
        const v3 = v.variants?.['3x'] ?? v;
        const v3fits = v3.size ? texFits(v3) : (loaded.maxTex ?? 4096) >= 4794;
        const vv = hi && v3fits ? v3 : (v.variants?.['2x'] ?? v);
        if (hi && !v3fits) console.warn(`[assets] 최대 텍스처 ${loaded.maxTex}px 초과 -> 도트 뱃지 @2x 사용`);
        loaded.pixelScale = Number(vv.scale ?? (vv === v3 ? 3 : 2));
        return { vv, img: abs(vv.path), json: abs(vv.json), bytes: Number(vv.bytes ?? v.bytes) || 0 };
    }
    if (v.type === 'atlas' || v.type === 'nineslice') {
        const lo = v.variants?.['1.5x'] ?? v.variants?.['1x'] ?? v;
        const vv = hi && texFits(v) ? v : lo; // '1x': 스킬 아이콘 @1x(48px 칸, unitPx 1) — 저해상도만
        return { vv, img: abs(vv.path), json: v.type === 'atlas' ? abs(vv.json) : null, bytes: Number(vv.bytes ?? v.bytes) || 0 };
    }
    if (v.type === 'bg') {
        const big = texScreenW() > 1400; // 화면 백킹 폭(예전 식은 x dpr 이중 곱)
        const p = big && texFits(v) ? v : (v.variants?.['1280'] ?? v);
        return { vv: p, img: abs(p.path ?? v.path), json: null, bytes: Number(p.bytes ?? v.bytes) || 0 };
    }
    if (v.type === 'tile-bg') {
        const p = hi ? v : (v.variants?.['256'] ?? v);
        return { vv: p, img: abs(p.path ?? v.path), json: null, bytes: Number(p.bytes ?? v.bytes) || 0 };
    }
    return { vv: v, img: abs(v.path), json: null, bytes: Number(v.bytes) || 0 };
}
function loadSkinItem(load, tk, v) {
    const f = skinFiles(v);
    if (v.type === 'atlas' || v.type === 'nineslice') loaded.unitPx[tk] = Number(f.vv.unitPx ?? v.unitPx ?? 3);
    if (f.json) load.atlas(tk, withVer(f.img), withVer(f.json));
    else load.image(tk, withVer(f.img));
    loaded.keys.add(tk);
    loaded.bytes.set(tk, f.bytes);
}
// 지연 스킨 항목(예: uiskin_gacha) 로드 후 cb. 이미 있거나 manifest 에 없으면 즉시
export function ensureSkinTexture(scene, tk, cb) {
    if (scene.textures.exists(tk)) { cb?.(); return; }
    const d = loaded.deferred?.[tk];
    if (!d) { cb?.(); return; }
    ensureScope(scene, scopeOf(d.logical, d.v), () => cb?.(), { filter: (lg) => lg === d.logical });
}

// ---- HTTP 캐시 예열(저우선): 텍스처를 만들지 않고 파일만 받아 둔다(GPU 메모리 0). 로비 대기 중 다음 화면(전투) 대비 ----
// 서버 캐시 헤더가 없으면 효과가 줄어든다(재방문 캐시 0 이슈는 서버 설정 확인 필요).
// 2026-11-14 성능 1단계: 예열 기본 꺼짐(WARM_DEFAULT). 서버가 /assets/* 에 캐시 헤더(장기 max-age/immutable)를 주는지 확인되기 전에는
//  받은 파일이 캐시되지 않아 같은 파일을 전투 진입 때 다시 받는다(대역폭·모바일 데이터 2배). 확인 후 WARM_DEFAULT=true 로 켠다(docs/deploy_nginx_tuning.md).
//  시험 켜기(UI 없음): 콘솔 settings.set({ warmPrefetch: true }). 대상: 로비 warmScope('battle')·prefetchPortraits·뽑기 연출 공용 FX 예열(gachaKeys.warmGachaFxCommon)
const WARM_DEFAULT = false;
const warmEnabled = () => { const v = settings.get().warmPrefetch; return v === true || v === false ? v : WARM_DEFAULT; };
const WARM_MAX = 2;
const warm = { q: [], active: 0, seen: new Set() };
export function warmUrls(urls) {
    if (!warmEnabled()) return;
    urls.forEach((u) => { if (u && !warm.seen.has(u)) { warm.seen.add(u); warm.q.push(u); } });
    pumpWarm();
}
function pumpWarm() {
    while (warm.active < WARM_MAX && warm.q.length) {
        const url = warm.q.shift();
        warm.active += 1;
        const ctl = typeof AbortController === 'function' ? new AbortController() : null;
        const t = setTimeout(() => ctl?.abort(), 30000);
        fetch(url, { priority: 'low', credentials: 'same-origin', signal: ctl?.signal }).then((r) => r.blob()).catch(() => {}).finally(() => { clearTimeout(t); warm.active -= 1; pumpWarm(); });
    }
}
// scope 의 파일 URL(이미 텍스처가 있는 항목 제외)을 예열 큐에 넣는다
export function warmScope(scene, scope, { filter = null } = {}) {
    const m = loaded.manifest;
    if (!m || typeof fetch !== 'function' || !warmEnabled()) return 0;
    const urls = [];
    Object.entries(m).forEach(([lg, v]) => {
        if (!loadable(lg, v) || lg.startsWith('portrait.') || scopeOf(lg, v) !== scope) return;
        if (perUnitLazy(lg, scope, filter)) return; // 영웅·주인공 시트는 예열도 생략(전투에서 유닛별 지연 로드)
        if (filter && !filter(lg, v)) return;
        if (scene.textures.exists(v.textureKey ?? texKey(lg))) return;
        if (v.textureKey) { const f = skinFiles(v); urls.push(withVer(f.img)); if (f.json) urls.push(withVer(f.json)); } else urls.push(withVer(abs(v.path)));
    });
    warmUrls(urls);
    return urls.length;
}

function queueAudio(scene, data) {
    const slots = data?.slots ?? {};
    Object.entries(slots).forEach(([slot, v]) => {
        if (!v?.path) return;
        const url = withVer(abs(v.path));
        // BGM 은 부팅에서 받지 않는다(전투·결과 포함): audio.bgm(key, scene) 지연 로드, 전투·결과 트랙은 로비 대기 중 audio.prefetchBgm
        // paths(예: opus -> mp3) 가 있으면 배열로 넘겨 Phaser 가 지원 포맷을 고른다(.opus = ogg;codecs=opus 판정). loopMarker = 마커 구간만 반복(파일 전체 loop 금지 트랙)
        if (v.type === 'bgm') { loaded.bgm.set(slot, { key: slot, url: Array.isArray(v.paths) && v.paths.length ? [...v.paths].sort((x, y) => Number(/\.mp3$/.test(y)) - Number(/\.mp3$/.test(x))).map((p) => withVer(abs(p))) : url, volume: v.volume ?? 0.5, marker: v.loopMarker?.name && Number(v.loopMarker.duration) > 0 ? { name: v.loopMarker.name, start: Number(v.loopMarker.start) || 0, duration: Number(v.loopMarker.duration) } : null }); return; }
        // 전투 음성(category battle_voice.*, 약 1.16MB): 부팅에서 받지 않고 목록만 등록 -> 전투 씬 진입 시 fx/BattleVoice.voicePreload 지연 로드
        if (/^battle_voice(\.|$)/.test(String(v.category ?? ''))) { audio.voiceCatalog.set(slot, { url, volume: v.volume ?? 0.6 }); return; }
        loaded.audio.set(slot, { key: slot, loop: !!v.loop, volume: v.volume ?? 0.6 });
        loaded.bytes.set(slot, Number(v.bytes) || 0);
        scene.load.audio(slot, url);
    });
}

const firstTex = (scene, keys) => keys.map(texKey).find((k) => scene.textures.exists(k)) ?? null;

// 타일 텍스처 키: tile.<code>.64 > tile.<code> > tile.<code>.a(변형 a) > 코드 생성 tile_<code>
export const tileTexKey = (scene, code) => firstTex(scene, [`tile.${code}.64`, `tile.${code}.64.a`, `tile.${code}`, `tile.${code}.a`]) ?? (scene.textures.exists(`tile_${code}`) ? `tile_${code}` : null);

// 타일 원본 크기(px): 하드코딩하지 않고 manifest 의 tileSize 또는 실제 로드된 평지 타일 이미지 폭으로 결정(64 우선, 없으면 32 폴백).
// 타일은 battle scope 라 부팅 직후엔 없다 -> battle scope 로드 후 applyFilters 가 다시 계산한다.
export const tileSrc = () => loaded.tileSrc;

// 로드된 텍스처 필터(도트 NEAREST / 스킨·배경 LINEAR) + 타일 원본 크기. 지연 로드 후에도 다시 호출(멱등)
export function applyFilters(scene) {
    const tx = scene.textures;
    loaded.keys.forEach((k) => { if (tx.exists(k) && pixelKeys(k)) tx.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST); });
    LINEAR_KEYS.forEach((k) => { if (tx.exists(k)) tx.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR); });
    [U32_KEY, U32_EXT.key, U32_EXT2.key, U32_EXT3.key, ...U32_WS_SHEETS.map((w) => w.key), ...U32_TV2_SHEETS.map((w) => w.key)].forEach((k) => { if (tx.exists(k)) tx.get(k).setFilter(Phaser.Textures.FilterMode.NEAREST); }); // Unity 도트 타일셋(+확장): Point(no filter)
    Object.keys(RM_SHEETS).forEach((s) => { if (tx.exists(rmTexKey(s))) tx.get(rmTexKey(s)).setFilter(Phaser.Textures.FilterMode.LINEAR); }); // RM 회화풍: 선형(소품 확대·축소)
    const plain = tileTexKey(scene, 'plain');
    const frame = plain && /^tile_/.test(plain) && loaded.keys.has(plain) ? tx.get(plain).get(0) : null;
    loaded.tileSrc = frame?.width || loaded.manifest?.__tileSize || 32;
}

// create(): 필터·원본 크기·오디오 슬롯 연결
export function finishAssets(scene) {
    heroMap = mergeHeroMaps(readJson(scene, 'hero_sprite_map'), readJson(scene, 'hero_sprite_map_v2'), readJson(scene, 'hero_sprite_map_v4'));
    setSkinUnitPx((tk) => loaded.unitPx[tk] ?? 3); // UI 스킨 아틀라스 해상도(9 슬라이스 스케일)
    applyFilters(scene);
    const sound = scene.sound;
    loaded.audio.forEach((a, slot) => {
        if (!scene.cache.audio.exists(a.key) || a.loop) return;
        audio.register(slot, () => { // 효과음 볼륨·음소거(설정 sfxVolume/sfxMuted) 반영
            const st = settings.get();
            const vol = st.sfxMuted ? 0 : a.volume * (st.sfxVolume ?? 1);
            if (!sound.locked && vol > 0) sound.play(a.key, { volume: vol });
        });
    });
    audio.initBgm({ sm: sound, cache: scene.cache.audio, catalog: loaded.bgm }); // 씬 간 유지되는 BGM 매니저(audio.js)
}

export const hasTex = (scene, logical) => scene.textures.exists(texKey(logical));

// 유닛 스프라이트 키 해석(폴백 규칙): 영웅(지휘관/영웅 유닛, 서버 units[].hero = 영웅 code)은 unit.hero.<code>.<side>.<64|32|없음> 우선,
// 없으면 병종 공용 unit.<type>.<side>.<64|32|없음>(flyer 는 파일명 flying). 부대(troop)는 항상 병종 공용. 모두 없으면 null(코드 생성 도형 폴백).
// 반환 {key, frame}: 스프라이트시트(3열 x 4행, 행 down/left/right/up, 열 walk1/idle/walk2)면 정면 idle 프레임(1)
// 방향 시트(안아트 v2): 192x256, 3열 x 4행, 행 down/left/right/up, 열 walk1/idle/walk2 (right 는 미러 구워져 flipX 불필요, 정면 down 은 idle 칸 복제). 키 접미 `.64.sheet`.
// 시트가 없으면 정면 단일 이미지 + 좌우 반전(SINGLE_FLIP 규약: left 만 flipX) + 유닛 마커로 폴백한다.
export const SHEET_ROW = { down: 0, left: 1, right: 2, up: 3 };
export const SINGLE_FLIP = { left: true, right: false, up: false, down: false };
const sheetFrame = (dir) => `sheet_${(SHEET_ROW[dir] ?? 0) * 3 + 1}`; // idle 열(1), 이름 프레임(ensureSheetFrames)

// 이미지로 로드된 시트(프레임 정의 없음)에 12개 프레임(0..11)을 직접 정의한다. 이미 스프라이트시트로 로드됐으면 그대로.
// 로더가 어떤 프레임 크기로 쪼갰든(이미지/잘못된 frameWidth 포함) 원본 크기 기준 3x4 이름 프레임 'sheet_0..11' 을 따로 정의해 쓴다.
export const sheetFrameName = (i) => `sheet_${i}`;
export function ensureSheetFrames(scene, key) {
    const t = scene.textures.get(key);
    if (!t || t.has(sheetFrameName(0))) return;
    const src = t.getSourceImage();
    const fw = Math.floor(src.width / 3);
    const fh = Math.floor(src.height / 4);
    if (src.width % 3 || src.height % 4) console.warn(`[assets] 방향 시트 크기 ${src.width}x${src.height} 가 3x4 로 나눠떨어지지 않음: ${key}`);
    for (let i = 0; i < 12; i++) t.add(sheetFrameName(i), 0, (i % 3) * fw, Math.floor(i / 3) * fh, fw, fh);
}

// 영웅 스프라이트 맵 병합: v1(hero_sprite_map.json) -> v2(문화권 병종 임시 재매핑) -> v4(영웅 101명 초상화 1:1 전용 시트) 순으로 덮어씀(뒤가 우선).
// v4 base 예: unit.hero.yi_sun_sin / 교체 5명 unit.hero.<code>_v4 / 별칭 gwak_jae_u -> unit.hero.gwak_jaeu, kim_si_min -> unit.hero.kim_simin.
// 맵에 없는 영웅은 기본 규칙 unit.hero.<code>. 문화권 병종 시트는 unitTex 의 키 로드 실패 안전망(폴백 시 경고 1회).
const readJson = (scene, key) => { try { return scene.cache.json.get(key); } catch { return null; } };
export function mergeHeroMaps(...maps) {
    const pick = (m) => (m && typeof m === 'object' ? (m.heroes && typeof m.heroes === 'object' ? m.heroes : m) : {});
    return Object.assign({}, ...maps.map(pick));
}

// 주인공(protagonist) 스프라이트 키 확장 훅(안아트 제작 중, 아직 호출처 없음): face+class 전용 -> face 기본 -> class 기본 순 후보 base.
// 키 규약 예정: unit.protagonist.<face>.<class>.<team>.64.sheet (+ .64 단일). 확정되면 unitTex 의 isHero 분기에서 이 후보를 heroBase 앞에 넣는다.
// 확정 규약(안아트 keyRules): unit.protagonist.<face>.<class>.<side>.64.sheet -> unit.protagonist.<face>.base.<side>.64.sheet -> (unitTex 의 병종 공용 unit.<class>.<side>.64.sheet)
export const protagonistBases = (face, cls) => [face && cls && `unit.protagonist.${face}.${cls}`, face && `unit.protagonist.${face}.base`].filter(Boolean);
// 주인공 얼굴(face=male_a..female_c): 전투 유닛 뷰에 portrait 필드가 없으면 로그인 사용자 주인공 상태(protagonistQuiz.applyProtagonistState)로 보완
let protoFace = null;
export const setProtagonistFace = (face) => { protoFace = face || null; };
const protagonistFaceOf = (unit) => {
    const p = /^protagonist_(.+)$/.exec(String(unit?.portrait ?? ''))?.[1];
    if (p) return p;
    const mine = (unit?.team ?? (unit?.side === 'b' ? 'enemy' : 'ally')) === 'ally';
    return (unit?.protagonist || /^protagonist_/.test(String(unit?.hero ?? ''))) && mine ? protoFace : null;
};

// 반환 {key, frame, sheet, flipX}. dir(up|down|left|right)을 주면 방향 프레임/반전, 생략하면 정면(down) idle.
// unit.* 은 battle scope(편성·전투 진입 시 로드, 로비 영웅·편성 탭은 아군 유닛만 지연 로드) — 아직 없으면 null(호출 측 폴백)
export function unitTex(scene, unit, dir = null) {
    const side = unit.team ?? (unit.side === 'b' ? 'enemy' : 'ally');
    const sizes = ['.64', '.32', ''];
    const keys = unitOwnKeys(unit, side);
    const heroKeyCount = keys.length;
    const isHero = unit.hero && unit.kind !== 'troop';
    // 전용 시트(영웅·주인공·NPC)가 manifest 에 있으나 아직 지연 로드 전(UnitView 생성 직후 ensureUnitTex 가 받아 교체)이면 '없음' 경고 대상 아님
    const ownFirst = keys.find((k) => manifestHas(k)); // lazyUnitKeys 가 받는 키(manifest 에 있는 첫 전용 후보)
    const ownPending = !!ownFirst && !scene.textures.exists(texKey(ownFirst)) && !FAILED.has(texKey(ownFirst));
    const ut = typeAlias(unit.type); // 퇴역 병종(heavy 등)은 서버 alias_of 대체 병종 시트(heavy -> sword). 진행 중 전투의 heavy 유닛도 보병 시트로 표시
    const cls = CLASS_FILE[ut] ?? ut;
    culturesOf(unit.culture).forEach((c) => keys.push(`unit.${c}.${cls}.${side}.64.sheet`)); keys.push(`unit.${cls}.${side}.64.sheet`); // 문화권 시트 -> 폴백 문화권(hre->europe) -> default -> 병종 공용 시트
    sizes.forEach((s) => keys.push(`unit.${cls}.${side}${s}`));
    // 전용 시트가 없는 병종(수병 등)은 같은 문화권의 대체 병종 시트 -> 공용 대체 병종 시트(코드 도형보다 우선)
    const alt = SPRITE_CLASS_FALLBACK[cls];
    if (alt) { culturesOf(unit.culture).forEach((c) => keys.push(`unit.${c}.${alt}.${side}.64.sheet`)); keys.push(`unit.${alt}.${side}.64.sheet`); }
    const key = firstTex(scene, keys);
    if (isHero && !ownPending && (!key || keys.map(texKey).indexOf(key) >= heroKeyCount) && !warnedHero.has(unit.hero) && unitScopeReady(scene)) {
        warnedHero.add(unit.hero);
        console.warn(`[assets] 영웅 스프라이트 없음: ${unit.hero} (병종 공용으로 폴백)`);
    }
    if (!key) return null;
    if (key.endsWith('_sheet')) { ensureSheetFrames(scene, key); return { key, frame: sheetFrame(dir ?? 'down'), sheet: true, flipX: false }; }
    const total = scene.textures.get(key).frameTotal;
    return { key, frame: total > 2 ? 1 : 0, sheet: false, flipX: dir ? !!SINGLE_FLIP[dir] : false };
}
// 유닛 전용 텍스처 후보(우선순위 순): 주인공 시트 -> 영웅 시트/단일/지휘관 풀 -> NPC 시트 -> 공용 클론 -> NPC 별칭 영웅 시트. 문화권·병종 공용 폴백은 unitTex 가 뒤에 붙인다
function unitOwnKeys(unit, side) {
    const sizes = ['.64', '.32', ''];
    const keys = [];
    const isHero = unit.hero && unit.kind !== 'troop';
    if (isHero) {
        // hero_sprite_map.json(선택): {<code>: '<hero 키 base>' | {hero?, pool_id?}} 또는 {heroes:{...}}. 형식이 달라도 없으면 무시.
        const ent = heroMap[unit.hero];
        const heroBase = (typeof ent === 'string' ? ent : ent?.hero) ?? HERO_SHEET_ALIAS[unit.hero] ?? `unit.hero.${unit.hero}`;
        const pool = ent?.pool_id ?? ent?.pool ?? unit.pool_id;
        // 얼굴: 유닛 portrait/로그인 주인공 상태. 모르거나 그 얼굴 시트가 manifest 에 없으면(로비를 거치지 않은 전투 진입·PvP 상대 등) 영웅 코드의 성별 기본 얼굴(<성별>_a)
        //  (2026-11-08 강화면: 'protagonist_male_sword 영웅 스프라이트 없음' 경고 + 병종 공용 시트 폴백 — 얼굴을 몰라 주인공 시트 후보가 비었음)
        const pm = /^protagonist_(male|female)_[a-z]+$/.exec(String(unit.hero));
        const faceOk = (f) => !!f && ['ally', 'enemy'].some((sd) => manifestHas(`unit.protagonist.${f}.base.${sd}.64.sheet`));
        const pf0 = protagonistFaceOf(unit);
        const pf = faceOk(pf0) ? pf0 : (pm && faceOk(`${pm[1]}_a`) ? `${pm[1]}_a` : pf0);
        // 주인공 전용 시트 최우선. 직업(외형) = 영웅 코드 protagonist_<male|female>_<직업>의 직업이 우선(2026-11-08: heavy 직업은 서버 unit_type 이 sword 라
        //  철퇴·연 방패 heavy 시트가 안 쓰였다). 그 직업 시트가 manifest 에 없으면 unit.type 병종 시트 -> 얼굴 기본(base). 전투 규칙·병종 뱃지(unit.type)는 그대로
        if (pf) {
            const job = /^protagonist_(?:male|female)_([a-z]+)$/.exec(String(unit.hero))?.[1];
            const jobBase = job ? protagonistBases(pf, CLASS_FILE[job] ?? job)[0] : null;
            if (jobBase && manifestHas(`${jobBase}.${side}.64.sheet`)) keys.push(`${jobBase}.${side}.64.sheet`);
            protagonistBases(pf, CLASS_FILE[unit.type] ?? unit.type).forEach((b) => { const k = `${b}.${side}.64.sheet`; if (!keys.includes(k)) keys.push(k); });
        }
        keys.push(`${heroBase}.${side}.64.sheet`);
        sizes.forEach((s) => keys.push(`${heroBase}.${side}${s}`));
        // 영웅 키 시트가 없고 같은 인물의 NPC 시트만 있는 영웅(2026-11-04: shimazu_yoshihiro -> npc_jp_shimazu_yoshihiro, subutai -> npc_subutai): NPC 시트(진영 -> 적 시트) 후보
        if (!manifestHas(`${heroBase}.${side}.64.sheet`)) [`npc_${unit.hero}`, `npc_jp_${unit.hero}`, `npc_ink_${unit.hero}`].forEach((nc) => { [side, 'enemy', 'ally'].forEach((sd) => { const k = `unit.npc.${nc}.${sd}.64.sheet`; if (manifestHas(k) && !keys.includes(k)) keys.push(k); }); });
        if (pool != null) sizes.forEach((s) => keys.push(`unit.cmd.${pool}.${side}${s}`));
    }
    const npc = npcSheetCode(npcCodeOf(unit)); // 시트 전용 코드(초상만 있는 npc_<x> 대신 시트가 있는 별칭·npc_jp_/npc_ink_·영웅 코드)
    const npcKey = npc ? `unit.npc.${npc}.${npcSheetSide(npc, side)}.64.sheet` : null;
    if (npcKey) keys.push(npcKey); // NPC 전용 시트(일본군 지휘관 = enemy 시트). 없으면(거란 등) 아래 문화권/default 계열
    // NPC 별칭이 영웅 에셋 코드(npc_ 접두사 없음, 예 npc_jalal_ad_din -> jalal_ad_din)면 영웅 계열 시트 unit.hero.<code>(hero_sprite_map 우선)도 후보(진영 시트 -> 적 시트)
    // + 3차 영웅 승격 NPC(영웅 코드 = npc_ 코드 그대로, 예 npc_kato_kiyomasa·npc_zhang_liao): unit.npc 시트는 없고 unit.hero.<npc 코드>(hero_sprite_map_v4) 시트만 있는 적 지휘관(npc_ref)도 같은 영웅 시트 후보(강화면 a7: 문화권 공용 폴백)
    const heroCode = npc && (!/^npc_/.test(npc) || (!npcHasSheet(npc) && heroHasSheet(npc))) ? npc : null;
    if (heroCode) { const hb = heroSheetBase(heroCode); keys.push(`${hb}.${side}.64.sheet`); if (side !== 'enemy') keys.push(`${hb}.enemy.64.sheet`); }
    const clone = npc ? NPC_CLONE[npc] : null;
    if (clone && manifestHas(`${clone.sheet}.${side}.64.sheet`)) keys.push(`${clone.sheet}.${side}.64.sheet`); else if (clone) keys.push(`${clone.sheet}.enemy.64.sheet`); // (전용 시트 키 묶음에 포함: '영웅 스프라이트 없음' 오경고 방지) 공용 클론 무장 시트(아군 시트 없으면 적 시트)
    return keys;
}
// unitTex 가 고를 첫 텍스처 1장(manifest 에 있는 첫 후보: 전용 -> 문화권 -> 병종 공용)만 받는다. 전투 scope 를 일괄로 받지 않는 화면(로비 영웅 상세·장비 창)용.
// 받을 것이 없으면(이미 있음·manifest 없음·실패 기록) false, 있으면 true + 완료 시 cb(ok)
export function ensureUnitFirstTex(scene, unit, cb) {
    if (!unit || !loaded.manifest) return false;
    const side = unit.team ?? (unit.side === 'b' ? 'enemy' : 'ally');
    const ut = typeAlias(unit.type); const cls = CLASS_FILE[ut] ?? ut;
    const keys = [...unitOwnKeys(unit, side)];
    culturesOf(unit.culture).forEach((c) => keys.push(`unit.${c}.${cls}.${side}.64.sheet`)); keys.push(`unit.${cls}.${side}.64.sheet`);
    ['.64', '.32', ''].forEach((sz) => keys.push(`unit.${cls}.${side}${sz}`));
    const alt = SPRITE_CLASS_FALLBACK[cls]; if (alt) { culturesOf(unit.culture).forEach((c) => keys.push(`unit.${c}.${alt}.${side}.64.sheet`)); keys.push(`unit.${alt}.${side}.64.sheet`); } // unitTex 와 같은 대체 병종(총병 -> 궁병 등)
    const lg = keys.find((k) => manifestHas(k));
    if (!lg || scene.textures.exists(texKey(lg)) || FAILED.has(texKey(lg))) return false;
    ensureScope(scene, scopeOf(lg, loaded.manifest[lg]), (ok) => cb?.(ok), { filter: (k) => k === lg });
    return true;
}
// 유닛 텍스처가 한 번이라도 로드됐는지(로드 전 '영웅 스프라이트 없음' 오경고 방지)
const unitScopeReady = (scene) => [...loaded.keys].some((k) => k.startsWith('unit_') && scene.textures.exists(k));

// ---- NPC(적 지휘관·번진 그림자·서가 NPC) / 수병 전용 시트(안아트 npc_naval 조각, scope 'npc'/'naval' = battle 일괄 로드 제외) ----
// NPC 코드 판정: 서버 유닛 필드 npc_code | npc_ref | npc(문자열) -> 별칭 정규화, 없으면 지휘관/영웅 유닛 이름(name/display_name)이 manifest NPC name_ko 와 같을 때.
// 별칭: 로스터 코드 npc_<x>(database/data/npc_roster_v3.json) -> 에셋 코드 npc_jp_<x> / npc_ink_<x> 중 manifest 에 있는 것. 'npc:' 접두사 허용.
// 시트/초상화가 없는 NPC(서가11 거란 측 등)는 null 키 -> 기존 문화권 -> default -> 병종 공용 시트 / 지휘관 초상화 폴백(결정 2026-11-01).
const npcKnown = (c) => manifestHas(`portrait.${c}`) || manifestHas(`unit.npc.${c}.enemy.64.sheet`) || manifestHas(`unit.npc.${c}.ally.64.sheet`);
// 로스터 코드 -> 에셋 코드 명시 별칭(접두사 규칙 npc_jp_/npc_ink_ 로 안 이어지는 그림자 NPC). 박백엔 추정 짝 — 안아트 확인 필요(2026-11-01)
const NPC_ASSET_ALIAS = {
    npc_shadow_last: 'npc_ink_shadow_final',
    npc_shadow_ink: 'npc_ink_shadow_s8',
    npc_shadow_vanguard: 'npc_ink_shadow_s8',
    npc_shadow_archivist: 'npc_ink_shadow_s8',
    npc_shadow_warden: 'npc_ink_shadow_s8',
    // 먹그림자 5종(npc_roster_v3_additions.json) -> s8 초상 공용(안아트 권고, 2026-11-02)
    npc_shadow_seal: 'npc_ink_shadow_s8', npc_shadow_proofreader: 'npc_ink_shadow_s8', npc_shadow_ironguard: 'npc_ink_shadow_s8',
    npc_shadow_scribe: 'npc_ink_shadow_s8', npc_shadow_printer: 'npc_ink_shadow_s8',
    // 몽골 장수(npc_roster·서가 메타 코드 -> 안아트 preview 초상 코드, 2026-11-02)
    npc_muqali: 'mukhali', npc_subutai: 'subutai', npc_jebe: 'jebe', npc_boorchu: 'borchu',
    // 22장 바부르(stages_ch22 hero npc_babur·대사 'hero:npc_babur' -> 안아트 초상 portrait.babur, 2026-11-03)
    npc_babur: 'babur',
    // 18장 s6 적장 잘랄 앗딘(서버 npc_ref npc_jalal_ad_din -> 영웅 에셋 portrait.jalal_ad_din / unit.hero.jalal_ad_din.*, 2026-11-03)
    npc_jalal_ad_din: 'jalal_ad_din',
    // ch23/24 아군 NPC(일반 영웅 william_i·charles_martel 과 같은 인물): portrait.<영웅> + unit.hero.<영웅> 시트. npc_ 전용 초상·시트가 manifest 에 생기면 npcKnown 이 그쪽을 먼저 고른다(2026-11-03)
    npc_yi_sun_sin: 'yi_sun_sin', npc_seo_hui: 'seo_hui', npc_fabius_maximus: 'fabius_maximus', // 강화면 26회차·안아트 확인: 영웅 portrait.<영웅> + unit.hero.<영웅> 시트(아군·적)
    npc_alexander: 'alexander', npc_saladin: 'saladin', // 강화면 25회차: 영웅 portrait.<영웅> + unit.hero.<영웅> 시트(아군·적) 보유 인물(2026-11-03)
    npc_oda_nobunaga: 'oda_nobunaga', // 오다 노부나가 NPC 행 -> 영웅 portrait.oda_nobunaga + unit.hero.oda_nobunaga 시트(강화면 22회차, 2026-11-03)
    npc_william_i: 'william_i', npc_charles_martel: 'charles_martel', npc_kim_yusin: 'kim_yusin', npc_joan_of_arc: 'joan_of_arc',   // ch13·ch16 아군 NPC 행(일반 영웅 초상 재사용)
    npc_cleitus: 'npc_cleitus_black', // 클레이토스(같은 인물 기존 초상 portrait.npc_cleitus_black, 안아트 npc_missing 권고, 2026-11-09)
    npc_bulssi: 'npc_jjogi', // 메인 스토리 '불씨'(쪽이와 같은 인물, 2026-11-08): portrait.npc_jjogi + unit.npc.npc_jjogi 시트 재사용. 이름은 dialogueData NPC_NAMES npc_bulssi '불씨'
};
// 3차 영웅(wave3) 승격 NPC 영웅 코드 -> 이미 있던 시트 base(키 이름이 영웅 코드와 달라 hero_sprite_map_v4 에 없는 8명, 2026-11-06).
// hero_sprite_map(v1/v2/v4) 항목이 생기면 그쪽이 우선. 초상은 portrait.<영웅 코드>(npc_*) 가 manifest 에 있어 별칭 불필요
const HERO_SHEET_ALIAS = {
    npc_zhao_yun: 'unit.hero.zhao_yun',
    npc_lu_su: 'unit.npc.npc_lu_su', npc_harold_godwinson: 'unit.npc.npc_harold_godwinson', npc_dunois: 'unit.npc.npc_dunois',
    npc_konishi_yukinaga: 'unit.npc.npc_jp_konishi_yukinaga', npc_wakizaka_yasuharu: 'unit.npc.npc_jp_wakizaka_yasuharu', npc_kurushima_michifusa: 'unit.npc.npc_jp_kurushima_michifusa',
    npc_babur: 'unit.npc.babur',
};
// 전용 에셋 없는 NPC 장수 -> 공용 병종 초상·시트(안아트 2026-11-03 '공용 클론 무장'). portraitCode 가 'troop.<culture>.<troop>' 를 돌려 portrait.<code> 경로가 그대로 공용 초상을 찾는다
const NPC_CLONE = {
    npc_sulislaw_krakow: { portrait: 'troop.europe.cavalry', sheet: 'unit.europe.cavalry' },
    npc_coloman_hungary: { portrait: 'troop.europe.cavalry', sheet: 'unit.europe.cavalry' },
    npc_boleslav_depolt: { portrait: 'troop.europe.spear', sheet: 'unit.europe.spear' },
    npc_rembald_voczon: { portrait: 'troop.europe.sword', sheet: 'unit.europe.heavy' },
    // ch22 로디 측·오스만 포수(안아트 2026-11-03 공용 클론). 시트는 진영(side) 시트 우선, 없으면 적 시트
    npc_bihar_khan_lodi: { portrait: 'troop.middle_east.cavalry', sheet: 'unit.middle_east.cavalry' },
    npc_hamid_khan: { portrait: 'troop.middle_east.cavalry', sheet: 'unit.middle_east.cavalry' },
    npc_hasan_khan_mewati: { portrait: 'troop.middle_east.cavalry', sheet: 'unit.middle_east.cavalry' },
    npc_mahmud_lodi: { portrait: 'troop.middle_east.sword', sheet: 'unit.middle_east.sword' }, // ch22 s8 보병(troop_type sword) 지휘관
    npc_mustafa_rumi: { portrait: 'troop.middle_east.archer', sheet: 'unit.middle_east.archer' }, // 아군 NPC -> ally 시트
    // ch24 전위 대장(이름 없는 범용 지휘관): europe spear 공용 클론 유지. ch23/24 NPC 7명은 안아트 전용 초상·시트(portrait.<code>, unit.npc.<code>.ally|enemy.64.sheet) 병합으로 클론 제거(2026-11-03)
    npc_frankish_vanguard: { portrait: 'troop.europe.spear', sheet: 'unit.europe.spear' },
    // ch25 바익당(쩐 왕조=china 공용, 대원=steppe 초상/middle_east 시트 공용). 전용 초상·시트가 manifest 에 생기면 자동 우선(안아트 신규 초상 요청 대상: toghan·tran_nhan_tong·omar·tran_khanh_du·sogetu·pham_ngu_lao)
    npc_tran_nhan_tong: { portrait: 'troop.china.healer', sheet: 'unit.china.healer' },
    npc_tran_thanh_tong: { portrait: 'troop.china.healer', sheet: 'unit.china.healer' },
    npc_tran_quang_khai: { portrait: 'troop.china.spear', sheet: 'unit.china.spear' },
    npc_tran_nhat_duat: { portrait: 'troop.china.archer', sheet: 'unit.china.archer' },
    npc_tran_khanh_du: { portrait: 'troop.china.naval', sheet: 'unit.default.naval' },
    npc_pham_ngu_lao: { portrait: 'troop.china.spear', sheet: 'unit.china.spear' },
    npc_tran_quoc_toan: { portrait: 'troop.china.cavalry', sheet: 'unit.china.cavalry' },
    npc_nguyen_khoai: { portrait: 'troop.china.spear', sheet: 'unit.china.spear' },
    npc_yet_kieu: { portrait: 'troop.china.naval', sheet: 'unit.default.naval' },
    npc_da_tuong: { portrait: 'troop.china.spear', sheet: 'unit.china.spear' },
    npc_dai_viet_scout_captain: { portrait: 'troop.china.archer', sheet: 'unit.china.archer' },
    npc_dai_viet_boat_captain: { portrait: 'troop.china.naval', sheet: 'unit.default.naval' },
    npc_toghan: { portrait: 'troop.steppe.cavalry', sheet: 'unit.middle_east.cavalry' },
    npc_sogetu: { portrait: 'troop.steppe.sword', sheet: 'unit.middle_east.sword' },
    npc_omar: { portrait: 'troop.steppe.naval', sheet: 'unit.default.naval' },
    npc_li_heng: { portrait: 'troop.steppe.archer', sheet: 'unit.middle_east.archer' },
    npc_fan_yi: { portrait: 'troop.steppe.naval', sheet: 'unit.default.naval' },
    npc_aoluchi: { portrait: 'troop.steppe.naval', sheet: 'unit.default.naval' },
    npc_zhang_wenhu: { portrait: 'troop.steppe.naval', sheet: 'unit.default.naval' },
    npc_yuan_vanguard_captain: { portrait: 'troop.steppe.cavalry', sheet: 'unit.middle_east.cavalry' },
    npc_yuan_garrison_captain: { portrait: 'troop.steppe.spear', sheet: 'unit.middle_east.spear' },
    npc_yuan_patrol_captain: { portrait: 'troop.steppe.naval', sheet: 'unit.default.naval' },
};
// 문화권 시트·병사 초상 폴백: 서버 culture 코드 -> 에셋 문화권(없으면 default). hre(신성 로마 제국 측) = europe 공용 에셋
// south_asia(ch22 파니파트) = middle_east. steppe(ch21 몽골)·carthage = middle_east, ancient_med(ch15 로마)·macedon = europe (안아트 점검 2026-11-04: 전용·공용 시트 없음)
const CULTURE_FALLBACK = { hre: 'europe', south_asia: 'middle_east', steppe: 'middle_east', ancient_med: 'europe', carthage: 'middle_east', macedon: 'europe', persia: 'middle_east', west: 'europe' };
// 결정 대기(폴백 없음 = default/병종 기본 시트): americas(데이터 55건), africa(31건)
export const culturesOf = (c) => [...new Set([c, CULTURE_FALLBACK[c], 'default'].filter(Boolean))];
// NPC 행 코드 -> 같은 인물의 영웅 코드(명시 별칭이 영웅 에셋 코드일 때, 예 npc_joan_of_arc -> joan_of_arc). 없으면 접두사만 뗀 코드
export const npcPersonCode = (code) => { const c = String(code ?? '').replace(/^npc:/, ''); const al = NPC_ASSET_ALIAS[c]; return al && !/^npc_/.test(al) ? al : c.replace(/^npc_/, ''); };
export function npcCode(raw) {
    const c = String(raw ?? '').replace(/^npc:/, '');
    if (!/^npc_[a-z0-9_]+$/.test(c)) return null;
    if (npcKnown(c)) return c;
    const al = NPC_ASSET_ALIAS[c];
    if (al && npcKnown(al)) return al;
    const rest = c.slice(4);
    return [`npc_jp_${rest}`, `npc_ink_${rest}`].find(npcKnown) ?? c;
}
// 부대원(일반 병사)도 NPC 전용 시트를 쓰는 NPC(지휘관과 같은 외형의 병사 무리). 병사 유닛에 npc_look(서버 troop_look 또는 store 가 분대 지휘관 npc_ref 로 채움)이 이 집합의 코드일 때만
export const NPC_TROOP_LOOK = new Set(['npc_erased_line']); // ch999 '지워진 줄'(팀장 결정 2026-11-03)
export function npcCodeOf(unit) {
    if (unit?.kind === 'troop') { const lk = unit.troop_look ?? unit.npc_look; return lk && NPC_TROOP_LOOK.has(String(lk)) ? npcCode(lk) : null; } // 그 외 병사는 기존대로 문화권·병종 공용 시트
    if (!unit) return null;
    const raw = unit.npc_code ?? unit.npc_ref ?? (typeof unit.npc === 'string' ? unit.npc : null);
    if (raw) return npcCode(raw);
    if (typeof unit.hero === 'string' && /^npc_/.test(unit.hero)) return npcCode(unit.hero); // 아군 NPC(npc_ally) 등 NPC 영웅 행(hero = npc_won_gyun 등) -> unit.npc.<code> 시트
    if (unit.hero) return null; // 영웅 코드가 있는 유닛은 이름 일치로 NPC 판정하지 않음(동명이인 예: 영웅 '유방' vs 고려 NPC 유방)
    const nm = unit.display_name ?? unit.name;
    return (nm && loaded.npcByName?.get(String(nm))) || null;
}
// 일본군 지휘관(npc_jp_*)은 원래 적 시트 고정(안아트 keyRules 권장)이었으나 아군 시트(npc_naval 조각 ally 8종)도 있어 아군 NPC(시마즈 요시히로 등)가 적 표식으로 보였다.
// 시트 우선 규칙(2026-11-07, npcSheetCode·NPC_CLONE 과 같은 방식): 진영 시트가 manifest 에 있으면 그 진영, 없으면 적 시트
const npcSheetSide = (code, side) => (/^npc_jp_/.test(code) && !manifestHas(`unit.npc.${code}.${side}.64.sheet`) ? 'enemy' : side);
// 스프라이트 시트용 NPC 코드(초상 해석과 분리, 2026-11-07): npcCode 는 portrait.npc_<x> 만 있어도 그 코드를 돌려주므로(초상 신규 추가 후 영웅·NPC 시트 25명이 문화권 시트로 폴백)
// 시트가 실제로 있는 코드를 고른다: 그 코드의 unit.npc 시트 -> 명시 별칭(NPC_ASSET_ALIAS) -> npc_jp_/npc_ink_ -> 접두사 뗀 영웅 코드(hero_sprite_map v4 / unit.hero.<code>). 모두 없으면 원래 코드
const npcHasSheet = (c) => manifestHas(`unit.npc.${c}.enemy.64.sheet`) || manifestHas(`unit.npc.${c}.ally.64.sheet`);
const heroSheetBase = (c) => { const he = heroMap[c]; return (typeof he === 'string' ? he : he?.hero) ?? `unit.hero.${c}`; };
const heroHasSheet = (c) => manifestHas(`${heroSheetBase(c)}.ally.64.sheet`) || manifestHas(`${heroSheetBase(c)}.enemy.64.sheet`);
export function npcSheetCode(code) {
    if (!code) return code;
    const c = String(code).replace(/^npc:/, '');
    if (!/^npc_/.test(c) || npcHasSheet(c)) return c;
    const rest = c.slice(4);
    const has = (k) => (/^npc_/.test(k) ? npcHasSheet(k) : heroHasSheet(k));
    return [NPC_ASSET_ALIAS[c], `npc_jp_${rest}`, `npc_ink_${rest}`, rest].find((k) => k && has(k)) ?? c;
}
// 이 유닛이 쓸 수 있는 지연 시트 논리 키(manifest 에 있는 것만): scope npc/naval + 유닛별 지연(PER_UNIT_LAZY: 영웅·주인공 시트 중 unitTex 가 고를 첫 후보 1장 — 단일 이미지·반대 진영은 받지 않음)
const LAZY_UNIT_SCOPES = new Set(['npc', 'naval']);
export function lazyUnitKeys(unit) {
    if (!unit || !loaded.manifest) return [];
    const side = unit.team ?? (unit.side === 'b' ? 'enemy' : 'ally');
    const out = [];
    if (unit.kind !== 'troop') { const own = unitOwnKeys(unit, side).find((k) => manifestHas(k)); if (own && (PER_UNIT_LAZY.test(own) || LAZY_UNIT_SCOPES.has(scopeOf(own, loaded.manifest[own])))) out.push(own); } // npc scope 별칭 시트(HERO_SHEET_ALIAS unit.npc.*)도 지연 로드
    const npc = npcCodeOf(unit);
    const nsc = npcSheetCode(npc);
    if (nsc) out.push(`unit.npc.${nsc}.${npcSheetSide(nsc, side)}.64.sheet`);
    const cls = CLASS_FILE[unit.type] ?? unit.type;
    if (cls === 'naval' && !(unit.hero && unit.kind !== 'troop' && !(npc && !npcKnown(npc)))) { // 수병(영웅은 전용 시트 우선이라 제외, 단 전용 시트 없는 NPC 영웅 = 배 NPC npc_boat_2 등은 수병 시트): 문화권 수병 -> default 수병 중 manifest 에 있는 첫 키
        const k = [`unit.${unit.culture ?? 'default'}.naval.${side}.64.sheet`, `unit.default.naval.${side}.64.sheet`].find((x) => manifestHas(x));
        if (k) out.push(k);
    }
    return [...new Set(out)].filter((lg) => manifestHas(lg) && (PER_UNIT_LAZY.test(lg) || LAZY_UNIT_SCOPES.has(scopeOf(lg, loaded.manifest[lg]))));
}
// 필요한 NPC/수병 시트만 실행 중 지연 로드(StageMapView 와 같은 ensureScope + filter 패턴). 받을 것이 없으면 false(cb 호출 안 함),
// 있으면 true + 완료(성공/실패/씬 종료) 시 cb(ok) 1회 — 호출 측은 객체 생존 가드 후 프레임 갱신. 실패 키는 FAILED 로 재요청 안 함(폴백 유지)
export function ensureUnitTex(scene, unit, cb) {
    const want = lazyUnitKeys(unit).filter((lg) => !scene.textures.exists(texKey(lg)) && !FAILED.has(texKey(lg)));
    if (!want.length) return false;
    const scopes = [...new Set(want.map((lg) => scopeOf(lg, loaded.manifest[lg])))];
    let left = scopes.length; let okAll = true;
    scopes.forEach((sc) => ensureScope(scene, sc, (ok) => { okAll = okAll && ok; if (--left === 0) cb?.(okAll); }, { filter: (lg) => want.includes(lg) }));
    return true;
}

// 초상화 키(portrait.<code>, 투명 PNG). 아직 없으면 null(사용처는 폴백) + 지연 로드 시작(onReady(texKey|null) 은 완료/실패 시 1회)
// thumb:true 면 썸네일(카드·HUD·칩), 기본 false = 원본(컷인 등 큰 표시)
export const portraitKey = (scene, hero, onReady = null, { thumb = false } = {}) => {
    if (!hero) return null;
    const lg = portraitLogical(hero, { thumb });
    const k = firstTex(scene, [lg]);
    if (k) { touchPortrait(k); return k; }
    ensurePortraitTex(scene, lg, onReady);
    return null;
};

// 초상화 논리 키(썸네일 우선): 카드·목록·HUD·분대 칩은 portrait.<code>.thumb(256px WebP, 원본의 약 1/20), 상세·대사·컷인은 thumb:false(원본).
// thumb 가 manifest 에 없으면 원본 키.
export const portraitLogical = (code, { thumb = true } = {}) => {
    if (!code) return null;
    // 주인공 클래스 코드(protagonist_male_sword 등)는 초상화 키가 아님 -> 성별 기본 초상(portrait.protagonist_m|f)
    const pg = /^protagonist_(male|female)_/.exec(String(code))?.[1];
    if (pg && manifestHas(`portrait.protagonist_${pg[0]}`)) code = `protagonist_${pg[0]}`;
    code = portraitCode(code);
    const base = `portrait.${code}`;
    return thumb && manifestHas(`${base}.thumb`) ? `${base}.thumb` : base;
};
// 초상 코드 정규화: portrait.<code> 가 없고 NPC 코드(npc_*)면 NPC 별칭(NPC_ASSET_ALIAS·npc_jp_/npc_ink_ 접두사) 적용. 예: npc_muqali -> mukhali, npc_boorchu -> borchu
export function portraitCode(code) {
    const c = String(code ?? '');
    if (!c || manifestHas(`portrait.${c}`)) return c;
    if (!/^(npc:)?npc_/.test(c)) return manifestHas(`portrait.npc_${c}`) ? `npc_${c}` : c; // 접두사 없는 코드인데 초상이 npc_ 쪽에만 있는 경우(예 join_hero baha_ad_din -> portrait.npc_baha_ad_din)
    const cl = NPC_CLONE[c.replace(/^npc:/, '')];
    if (cl && manifestHas(`portrait.${cl.portrait}`)) return cl.portrait; // 공용 클론 무장 초상
    // 초상이 실제로 있는 코드를 고른다: npcCode 는 전용 시트(unit.npc.<code>)만 있어도 그 코드를 돌려주므로(예 npc_jebe: 시트는 npc_jebe, 초상은 portrait.jebe)
    // 초상 조회는 npcCode 결과 -> 명시 별칭(NPC_ASSET_ALIAS) -> 접두사 규칙(npc_jp_/npc_ink_) 중 portrait.<code> 가 있는 첫 코드(2026-11-03 안아트 분석: 별칭 영웅이 글자 폴백)
    const base = c.replace(/^npc:/, '');
    const nc = npcCode(c);
    const cands = [nc, NPC_ASSET_ALIAS[base], `npc_jp_${base.slice(4)}`, `npc_ink_${base.slice(4)}`].filter(Boolean);
    return cands.find((k) => manifestHas(`portrait.${k}`)) ?? nc ?? c;
}
// 일반 병사(무명) 초상화: portrait.troop.<culture>.<troop> -> portrait.troop.default.<troop> -> null(호출 측: 지휘관 초상화/이니셜 폴백).
// 병종 별칭(heavy -> sword 등). flyer·monster 는 초상화 없음(null). manifest 에 있는 키만 고른다(없는 파일 요청 방지).
const TROOP_PORTRAIT_ALIAS = { heavy: 'sword', infantry: 'sword', lance: 'spear', bow: 'archer', sailor: 'naval', monk: 'healer' };
export function troopPortraitLogical(type, culture, { thumb = true } = {}) {
    if (!type) return null;
    const t = TROOP_PORTRAIT_ALIAS[type] ?? type;
    for (const c of culturesOf(culture)) {
        const k = `portrait.troop.${c}.${t}`;
        if (thumb && manifestHas(`${k}.thumb`)) return `${k}.thumb`;
        if (manifestHas(k)) return k;
    }
    return null;
}
// ---- 기본 부장 초상(클론 무장 이니셜 대체, 안아트 2026-11-03) ----
// 매핑 public/assets/portraits/captain/captain_map.json(형식 = docker/gemini/portrait_captain/plan.json: troops, troop_alias, groups{id:{troops[]}}, overrides?, resolve{stage_group, name_rules[{match, group|key}], culture_group})
// 키 portrait.captain.<group>.<troop>(+.thumb). 필요할 때 1회 fetch + 캐시(번들 미포함). 파일이 없거나 키가 manifest 에 없으면 null(호출 측 기존 폴백 = 이니셜/병종 초상)
// 조회 순서: overrides[이름] -> name_rules 정규식 -> stage_group(스테이지 코드 접두, 가장 긴 접두 우선) -> culture_group. (고유 portrait.<npc 코드> 는 호출 측이 먼저 확인)
const CAPT = { map: null, state: 'idle', cbs: [], stage: null };
export function ensureCaptainMap(cb = null) {
    if (CAPT.state === 'done') { cb?.(!!CAPT.map); return true; }
    if (cb) CAPT.cbs.push(cb);
    if (CAPT.state === 'loading' || typeof fetch !== 'function') return false;
    CAPT.state = 'loading';
    fetch(withVer('/assets/portraits/captain/captain_map.json'), { credentials: 'same-origin' })
        .then((r) => (r.ok ? r.json() : null)).catch(() => null)
        .then((j) => { CAPT.map = j && typeof j === 'object' ? j : null; CAPT.state = 'done'; const cbs = CAPT.cbs; CAPT.cbs = []; cbs.forEach((f) => { try { f(!!CAPT.map); } catch { /* 무시 */ } }); });
    return false;
}
// 현재 화면의 스테이지 코드(전투·대사 화면이 진입 시 설정). stage_group 판정용. 설정하면서 매핑 파일도 미리 받는다
export function setCaptainStage(code) { CAPT.stage = code ? String(code) : null; ensureCaptainMap(); }
const CAPT_TROOP_ALIAS0 = { heavy: 'sword', infantry: 'sword', mage: 'sword', healer: 'sword', gun: 'archer', bow: 'archer', lance: 'spear', sailor: 'naval', monk: 'sword' };
// {name, culture, troop, stageCode} -> 논리 키 | null
export function captainPortraitLogical({ name = '', culture = null, troop = null, stageCode = null } = {}, { thumb = true } = {}) {
    const m = CAPT.map;
    if (!m) { ensureCaptainMap(); return null; }
    const groups = m.groups ?? {};
    const rs = m.resolve ?? m; // 매핑 파일 형식: resolve{...} 아래(구) 또는 최상위 name_rules·stage_group·culture_group(현행 captain_map.json). 이전 코드는 resolve 만 읽어 규칙이 전부 무시되고 있었다
    const alias = { ...CAPT_TROOP_ALIAS0, ...(m.troop_alias ?? {}) };
    const tr0 = String(troop ?? 'sword');
    const keyOf = (group) => {
        const gt = Array.isArray(groups[group]?.troops) ? groups[group].troops : (m.troops ?? []);
        let t = alias[tr0] ?? tr0;
        if (!gt.includes(t)) t = 'sword'; // 그룹에 없는 병종(수군 없는 그룹의 naval 등) -> sword
        return `portrait.captain.${group}.${t}`;
    };
    const pick = (lg) => { if (!lg || !manifestHas(lg)) return null; return thumb && manifestHas(`${lg}.thumb`) ? `${lg}.thumb` : lg; };
    const viaRule = (r) => (r?.key ? pick(r.key) : r?.group ? pick(keyOf(r.group)) : null);
    const nm = String(name ?? '').trim();
    const ov = (m.overrides ?? rs.overrides ?? {})[nm];
    if (ov) { const k = typeof ov === 'string' ? (ov.startsWith('portrait.') ? pick(ov) : pick(keyOf(ov))) : viaRule(ov); if (k) return k; }
    for (const r of Array.isArray(rs.name_rules) ? rs.name_rules : []) { try { if (r?.match && new RegExp(r.match).test(nm)) { const k = viaRule(r); if (k) return k; } } catch { /* 잘못된 정규식 무시 */ } }
    const sc = String(stageCode ?? CAPT.stage ?? '');
    if (sc) { const pre = Object.keys(rs.stage_group ?? {}).filter((p) => sc.startsWith(p)).sort((a, b) => b.length - a.length)[0]; if (pre) { const k = pick(keyOf(rs.stage_group[pre])); if (k) return k; } }
    const cg = culture ? (rs.culture_group ?? {})[culture] : null;
    return cg ? pick(keyOf(cg)) : null;
}

// 이름 -> 초상 코드(manifest portrait.<code>.name_ko 일치, 괄호 설명 무시). 정확히 같은 이름 > '<이름> ' 으로 시작하는 유일한 초상(예 '도도' -> '도도 다카토라'). 결과 캐시
let PORTRAIT_BY_NAME = null; let PORTRAIT_BY_NAME_SRC = null; const PREFIX_WARNED = new Set();
export function portraitCodeByName(name) {
    const norm = (v) => String(v ?? '').replace(/\s*\(.*?\)\s*/g, '').trim();
    const n = norm(name);
    if (!n || !loaded.manifest) return null;
    if (PORTRAIT_BY_NAME && PORTRAIT_BY_NAME_SRC !== loaded.manifest) PORTRAIT_BY_NAME = null; // manifest 교체·갱신 시 캐시 재구축(정검수 Medium)
    if (!PORTRAIT_BY_NAME) { PORTRAIT_BY_NAME_SRC = loaded.manifest; PORTRAIT_BY_NAME = new Map(); Object.entries(loaded.manifest).forEach(([k, v]) => { const m = /^portrait\.([a-z0-9_]+)$/.exec(k); const nk = norm(v?.name_ko); if (m && nk && !PORTRAIT_BY_NAME.has(nk)) PORTRAIT_BY_NAME.set(nk, m[1]); }); }
    if (PORTRAIT_BY_NAME.has(n)) return PORTRAIT_BY_NAME.get(n);
    const hits = [...PORTRAIT_BY_NAME.keys()].filter((k) => k.startsWith(`${n} `)).sort((a, b) => a.length - b.length);
    if (hits.length > 1 && !PREFIX_WARNED.has(n)) { PREFIX_WARNED.add(n); console.warn(`[portrait] '${n}' 접두 후보 ${hits.length}개 -> 가장 짧은 '${hits[0]}' 사용`, hits); } // 신규 영웅 추가로 후보가 늘어도 깨지지 않게
    return hits.length ? PORTRAIT_BY_NAME.get(hits[0]) : null;
}
// 'X 직속 부대/보병/창병/병선…' 형태 일반 지휘관 이름 -> X(없으면 null). 사용자 2026-11-04: 직속 부대는 X 본인 초상으로
export function directLeaderBase(name) { const m = /^(.+?)\s+직속(?:\s|$)/.exec(String(name ?? '').trim()); return m ? m[1].trim() : null; }

// 유닛 초상화 논리 키: 영웅(kind != troop) = 본인 -> 부대 = 병종 초상화(문화권 -> default) -> 소속 지휘관 초상화. 모두 없으면 null(이니셜)
export function unitPortraitLogical(u, leader = null, { thumb = true } = {}) {
    if (!u) return null;
    if (u.kind !== 'troop' && u.hero) { // 주인공: portrait.protagonist_<face>(.thumb) -> .neutral (face = 유닛 portrait 필드, 없으면 로그인 주인공 face 보완)
        const pf = protagonistFaceOf(u);
        if (pf) { const c = [thumb && `portrait.protagonist_${pf}.thumb`, thumb && `portrait.protagonist_${pf}.neutral.thumb`, `portrait.protagonist_${pf}.neutral`, `portrait.protagonist_${pf}`].filter(Boolean).find((k) => manifestHas(k)); if (c) return c; }
        // 주인공 클래스 코드(protagonist_male_sword 등)는 초상화 키가 아님 -> 성별 기본 초상(portrait.protagonist_m|f). 없으면 아래 일반 경로
        const pg = /^protagonist_(male|female|m|f)(?:_|$)/.exec(String(u.hero))?.[1];
        if (pg) { const gk = pg[0]; const c = [thumb && `portrait.protagonist_${gk}.thumb`, `portrait.protagonist_${gk}`].filter(Boolean).find((k) => manifestHas(k)); if (c) return c; }
        if (/^npc_/.test(String(u.hero)) && !manifestHas(`portrait.${portraitCode(u.hero)}`)) { const cp = captainPortraitLogical({ name: u.display_name ?? u.name, culture: u.culture, troop: u.troop_type ?? u.type }, { thumb }); if (cp) return cp; } // 초상 없는 NPC 영웅 행 -> 기본 부장 초상
        return portraitLogical(u.hero, { thumb });
    }
    const npc = npcCodeOf(u); // NPC 지휘관(영웅 코드 없음): portrait.<npc>(.thumb) — manifest 에 있을 때만, 없으면 기존 폴백(이니셜)
    const npcP = npc ? portraitCode(npc) : null; // 시트 코드와 초상 코드가 다른 NPC(npc_jebe -> portrait.jebe) 포함
    if (npcP && manifestHas(`portrait.${npcP}`)) return portraitLogical(npcP, { thumb });
    if (u.kind !== 'troop') { // 'X 직속 부대' 일반 지휘관(leader.kind=generic, ref=null): X 본인 초상(이름으로 조회). 없으면 아래 기존 폴백(기본 부장 초상 등)
        const base = directLeaderBase(u.display_name ?? u.display_name_ko ?? u.name);
        const pc = base ? portraitCodeByName(base) : null;
        if (pc && manifestHas(`portrait.${pc}`)) return portraitLogical(pc, { thumb });
    }
    if (u.kind !== 'troop') { const cp = captainPortraitLogical({ name: u.display_name ?? u.name, culture: u.culture, troop: u.troop_type ?? u.type }, { thumb }); if (cp) return cp; } // 영웅·고유 초상 없는 지휘관 -> 기본 부장 초상(없으면 아래 기존 폴백)
    if (u.kind === 'troop') {
        const tp = troopPortraitLogical(u.troop_type ?? u.type, u.culture ?? leader?.culture ?? leader?.detail?.culture, { thumb });
        if (tp) return tp;
    }
    return leader?.hero ? portraitLogical(leader.hero, { thumb }) : null;
}

// ---- 초상화 지연 로더(부팅 선로드 대신: 109장 x 약 1MB, hero scope) ----
// - 씬 로더(scene.load)를 쓰지 않는다: 씬 종료 시 로더가 리셋·리스너 전부 제거되어 대기 콜백이 영영 안 불리던 문제 방지.
//   HTMLImageElement 로 받아 전역 TextureManager 에 addImage(씬과 무관하게 유지). 콜백 대상 객체의 생존 확인은 호출 측 책임(가드 필수).
// - 같은 키 중복 요청은 한 작업으로 합치고(콜백만 추가), 동시 다운로드 상한 PORTRAIT_MAX.
// - URL: manifest 항목 path(+?v=). manifest 에 없는 단일 키(portrait.<code>)만 관례 경로 /assets/portraits/<code>.png 시도,
//   그 외(표정·병종 등 다단 키)는 manifest 에 없으면 요청하지 않고 즉시 실패(SPA 폴백 HTML 요청 방지).
// - 디코딩 실패(파일 없음 -> SPA 가 HTML 200)는 영구 실패로 기억(경고 1회), 타임아웃은 다음 요청 때 재시도.
// - 메모리: 씬 종료(shutdown) 시점에 최근 사용 PORTRAIT_KEEP 장만 남기고 해제(LRU). 종료된 씬의 객체는 이미 파괴되어 안전.
// - 저우선 프리페치(prefetchPortraits)는 텍스처를 만들지 않고 HTTP 캐시만 예열한다(warmUrls).
const PORTRAIT_MAX = 6;
const PORTRAIT_KEEP = 20;
const PORTRAIT_TIMEOUT_MS = 30000;
const PQ = { tm: null, jobs: new Map(), q: [], active: 0, missing: new Set(), lru: new Map(), hooked: new WeakSet(), seq: 0 };
const touchPortrait = (key) => { PQ.lru.set(key, ++PQ.seq); };
export function portraitUrl(logical) {
    const v = loaded.manifest?.[logical];
    if (v?.path) return withVer(abs(v.path));
    const m = /^portrait\.([a-z0-9_]+)$/i.exec(logical);
    return m ? withVer(`/assets/portraits/${m[1]}.png`) : null;
}
// 반환: 이미 있으면 텍스처 키, 아니면 null(onReady 로 나중에 키 또는 null)
// 초상 키가 이미 실패(404·디코드 실패·URL 없음)로 기록됐는지: 호출 측이 스켈레톤 대신 최종 폴백(이니셜 등)을 바로 그리게
export const portraitFailed = (logical) => !!logical && PQ.missing.has(texKey(logical));
export function ensurePortraitTex(scene, logical, onReady = null) {
    if (!logical) return null;
    const key = texKey(logical);
    const tm = scene?.sys?.textures ?? scene?.textures ?? PQ.tm;
    if (!tm) return null;
    PQ.tm = tm;
    if (scene?.events && !PQ.hooked.has(scene)) { PQ.hooked.add(scene); scene.events.on('shutdown', () => setTimeout(trimPortraits, 0)); } // 종료 씬의 객체 파괴가 끝난 뒤 해제
    if (tm.exists(key)) { touchPortrait(key); return key; }
    if (PQ.missing.has(key)) return null; // 이미 실패한 키: 콜백 없음(폴백 유지. 실패 콜백 -> 재그리기 -> 재요청 무한 반복 방지)
    let job = PQ.jobs.get(key);
    if (!job) {
        const url = portraitUrl(logical);
        if (!url) { PQ.missing.add(key); return null; }
        job = { key, logical, url, cbs: [] };
        PQ.jobs.set(key, job);
        PQ.q.push(job);
    }
    if (onReady) job.cbs.push(onReady);
    pumpPortraits();
    return null;
}
// 저우선 프리페치(로비 대기 중 보유 영웅): codes = 영웅 code 배열. 텍스처 생성 없이 HTTP 캐시만 예열
export function prefetchPortraits(codes) {
    const tm = PQ.tm;
    // 목록 카드가 쓰는 썸네일(있으면)만 예열
    warmUrls([...new Set((codes ?? []).filter(Boolean))].map((c) => portraitLogical(c)).filter((lg) => !tm?.exists(texKey(lg)) && !PQ.missing.has(texKey(lg))).map((lg) => portraitUrl(lg)));
}
function safeCall(fn, arg) { try { fn(arg); } catch (e) { console.warn('[portrait] 콜백 오류(무시)', e); } }
function pumpPortraits() {
    while (PQ.active < PORTRAIT_MAX && PQ.q.length) startPortrait(PQ.q.shift());
}
function startPortrait(job) {
    PQ.active += 1;
    const img = new Image();
    img.decoding = 'async';
    let settled = false;
    let timer = null;
    const finish = (ok, permanent) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        img.onload = null; img.onerror = null;
        PQ.active -= 1;
        PQ.jobs.delete(job.key);
        let res = null;
        if (ok) {
            try {
                const tm = PQ.tm;
                if (!tm.exists(job.key)) tm.addImage(job.key, img);
                tm.get(job.key).setFilter(Phaser.Textures.FilterMode.LINEAR);
                touchPortrait(job.key);
                res = job.key;
            } catch (e) { console.warn(`[portrait] 텍스처 등록 실패: ${job.logical}`, e); }
        } else if (permanent) {
            PQ.missing.add(job.key);
            console.warn(`[portrait] 초상화 없음: ${job.logical} (폴백 표시)`);
        }
        job.cbs.forEach((fn) => safeCall(fn, res));
        pumpPortraits();
    };
    timer = setTimeout(() => { finish(false, false); img.src = ''; }, PORTRAIT_TIMEOUT_MS);
    img.onload = () => finish(img.naturalWidth > 0, img.naturalWidth === 0);
    img.onerror = () => finish(false, true);
    img.src = job.url;
}
function trimPortraits() {
    const tm = PQ.tm;
    if (!tm || PQ.lru.size <= PORTRAIT_KEEP) return;
    const old = [...PQ.lru.entries()].sort((a, b) => a[1] - b[1]).slice(0, PQ.lru.size - PORTRAIT_KEEP);
    old.forEach(([k]) => { PQ.lru.delete(k); try { if (tm.exists(k)) tm.remove(k); } catch { /* 무시 */ } });
}

// 아이콘: manifest 의 icon.<key> 가 있으면 그 PNG, 없으면 skin.js 의 코드 생성 아이콘(같은 키 규격 icon_<key>)
export const icon = (scene, key, size = 24) => (scene.textures.exists(`icon_${key}`) ? scene.add.image(0, 0, `icon_${key}`).setDisplaySize(size, size) : null);
