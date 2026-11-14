import Phaser from 'phaser';
import { manifestHas, troopPortraitLogical, ensurePortraitTex, loaded, portraitCode, captainPortraitLogical, portraitFailed } from '../assets.js';
import { L } from '../layout.js';
import { makeText } from '../ui/common.js';
import { isBgKey } from './dialogueData.js';

// 대화 배경(bg.<set>.<name>): manifest 에 있을 때만 요청(없는 파일 요청 방지). 이미 로드된 텍스처(textureKey 지정·boot 로드)가 있으면 그 키,
// 아니면 assets.ensurePortraitTex 의 지연 로더(Image -> addImage, LINEAR, 30초 타임아웃, 실패 키 캐시)를 그대로 빌려 쓴다(assets.js 무수정).
// 반환: 텍스처 키 | null(onReady(키|null) 로 나중에). null 이 끝까지면 호출 측은 그라데이션 폴백
// 작은 화면(백킹 폭 < 1000px 급: CSS 폭 x DPR < 1000)은 variants['1280'] 을 별도 논리 키(<key>.v1280)로 받는다(manifest 메모리 항목만 추가, 파일 무수정).
// 회화풍 배경은 선형 필터(bg_archive_ / bg_imjin_ 등 bg_* — 전역 pixelArt NEAREST 의 계단 현상 방지)
const LINEAR_BG = /^bg_/;
const linear = (scene, k) => { if (k && LINEAR_BG.test(k) && scene.textures.exists(k)) scene.textures.get(k).setFilter(Phaser.Textures.FilterMode.LINEAR); return k; };
export const smallBgScreen = () => (Number(L.cssW) || 1280) * (globalThis.devicePixelRatio ?? 1) < 1000;
function bgVariantLogical(logical) {
    const v = loaded.manifest?.[logical];
    const small = v?.variants?.['1280'];
    if (!small || !smallBgScreen()) return logical;
    const k = `${logical}.v1280`;
    if (!loaded.manifest[k]) loaded.manifest[k] = { path: typeof small === 'string' ? small : small.path, type: 'image', scope: v.scope, deferred: true, variant_of: logical };
    return k;
}
export function dialogueBgTex(scene, logical, onReady = null) {
    if (!isBgKey(logical) || !manifestHas(logical)) return null;
    const tk = loaded.manifest?.[logical]?.textureKey;
    if (tk && scene.textures.exists(tk)) return linear(scene, tk);
    const lg = bgVariantLogical(logical);
    return linear(scene, ensurePortraitTex(scene, lg, onReady ? (k) => onReady(linear(scene, k)) : null));
}
// 밝은 배경(강·설경): 초상화 자리 뒤 남색 오버레이 알파(10~20%). 표 = data/dialogue/scene_bg_map.json _bright
const BRIGHT_BG = new Set(['bg.imjin.river', 'bg.imjin.pyongyang_winter']);
export const bgDimAlpha = (logical) => (BRIGHT_BG.has(logical) ? 0.16 : 0);

// 대화 초상화 공용(Dialogue 씬·전투 대사 오버레이): manifest 키 규약 -> 논리 키, 실루엣 폴백.
// 시오리 portrait.shiori.<expr>, 주인공 portrait.protagonist_<m|f>(성별·manifest 있을 때만), 병사 = 병종 초상화(문화권 -> default),
// 영웅 portrait.<code>.<expr>(manifest 에 있을 때만) > portrait.<code>. 없으면 null(호출 측이 실루엣)
export const SHIORI_EXPRS = ['neutral', 'smile', 'surprise', 'serious', 'cheer', 'regret'];
// 주인공: 초상화 선택(face=male_a..c/female_a..c) 키 portrait.protagonist_{face}.<expr> > .neutral > portrait.protagonist_{face} > 성별 기본 portrait.protagonist_<m|f>. manifest 에 있는 것만(없으면 null = 실루엣)
// 표정 키(안아트 protagonist_manifest_fragment keyRules): neutral/smile/determined/hurt. 구 키(serious/surprise 등)는 별칭, 그 외는 neutral 폴백
export const PROTAGONIST_EXPRS = ['neutral', 'smile', 'determined', 'hurt'];
const PROTO_EXPR_ALIAS = { serious: 'determined', angry: 'determined', cheer: 'smile', happy: 'smile', sad: 'hurt', regret: 'hurt', pain: 'hurt' };
export function protagonistPortraitLogical({ face, gender } = {}, expr0 = 'neutral') {
    const expr = PROTAGONIST_EXPRS.includes(expr0) ? expr0 : (PROTO_EXPR_ALIAS[expr0] ?? 'neutral');
    const c = [];
    if (face) c.push(`portrait.protagonist_${face}.${expr || 'neutral'}`, `portrait.protagonist_${face}.neutral`, `portrait.protagonist_${face}`);
    if (gender) c.push(`portrait.protagonist_${gender}`);
    return c.find((k) => manifestHas(k)) ?? null;
}

function ownPortraitLogical(info, expr) {
    if (info.kind === 'troop') return troopPortraitLogical(info.troop, info.culture, { thumb: false });
    if (!info.code) return null;
    const code = portraitCode(info.code); // NPC 별칭(npc_boorchu -> borchu 등)
    return manifestHas(`portrait.${code}.${expr}`) ? `portrait.${code}.${expr}` : `portrait.${code}`;
}
// 고유 초상이 없는 화자(연출 액터 '왜군'·초상 미제작 NPC·영웅) 폴백(2026-11-14 사용자 제보 '이름표만 있고 초상 없음'):
//  기본 부장 초상(captain_map: 이름 규칙 '^(일본|왜)' -> jp16 등·현재 스테이지 그룹·문화권) -> 병종 초상(문화권 -> default, 병종 모르면 sword). 새 이미지 없이 기존 에셋만
export function fallbackPortraitLogical(info) {
    if (!info) return null;
    const troop = info.troop ?? 'sword';
    return captainPortraitLogical({ name: info.name, culture: info.culture ?? null, troop }, { thumb: false })
        ?? troopPortraitLogical(troop, info.culture ?? null, { thumb: false });
}
export function dialoguePortraitLogical(info, expr) {
    if (!info) return null;
    if (info.kind === 'shiori') return `portrait.shiori.${SHIORI_EXPRS.includes(expr) ? expr : 'neutral'}`;
    if (info.kind === 'protagonist') return protagonistPortraitLogical(info, expr);
    const own = ownPortraitLogical(info, expr);
    if (own && manifestHas(own) && !portraitFailed(own)) return own;
    // manifest 로드 전이면 기존 동작(고유 키 그대로, 받는 중 실루엣). 로드 후 고유 초상이 없거나 받기 실패면 폴백
    if (!loaded.manifest) return own;
    return fallbackPortraitLogical(info) ?? own;
}

// 초상이 없는 일반 화자: 회색 실루엣 자리표시를 크게 세우지 않고 이름표 + 대사만 보인다(2026-11-09 강화면 결함).
//  2026-11-14: dialoguePortraitLogical 이 부장/병종 초상으로 폴백하므로 이 분기는 폴백 에셋까지 없거나 받기 실패한 경우에만 걸린다.
//  판정 = 논리 키 없음 / manifest(fragment 병합)에 그 초상 항목 없음(=파일 없음, 요청도 하지 않음) / 이미 로드 실패. manifest 로드 전이면 기존 동작(false).
//  시오리·주인공은 제외(주인공 성별 미정 실루엣은 의도된 자리표시). 초상이 있는 화자는 그대로
export function facelessSpeaker(info, logical) {
    if (!info || info.kind === 'shiori' || info.kind === 'protagonist') return false;
    if (!logical) return true;
    if (!loaded.manifest) return false;
    return !manifestHas(logical) || portraitFailed(logical);
}

// 실루엣(바닥 중앙 원점, 높이 H) + 이름. [graphics, text] 반환
export function drawSilhouette(scene, H, name, nameSize = 20) {
    const w = H * 0.6;
    const sil = scene.add.graphics();
    sil.fillStyle(0x0b1020, 0.75).fillRoundedRect(-w / 2, -H, w, H, 28);
    sil.fillStyle(0x2f3e60, 1).fillCircle(0, -H * 0.72, w * 0.22).fillRoundedRect(-w * 0.32, -H * 0.5, w * 0.64, H * 0.5, 24);
    const nm = makeText(scene, 0, -H * 0.3, name ?? '', { size: nameSize, heading: true, origin: [0.5, 0.5], wrap: w - 12, align: 'center' });
    return [sil, nm];
}
