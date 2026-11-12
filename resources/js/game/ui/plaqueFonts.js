// 국호 판(StageMapView 영토 plaque) 현지 문자 폰트: 문자 체계 -> 웹폰트 매핑 단일 지점.
// - 원천: Google Fonts 의 Noto 계열(SIL OFL 1.1). 필요한 글자만 서브셋한 woff2 를 자체 호스팅(public/fonts/plaque/<id>.woff2, Pretendard 와 같은 방침).
// - 서브셋 생성: node resources/js/game/tools/build_plaque_fonts.mjs (database/data/shelf_territories.json 의 plaque.native/text 글자 수집
//   -> resources/js/game/data/plaque_fonts.json 에 id별 파일·글자 기록). 데이터에 국호가 추가되면 다시 실행한다.
// - 런타임: 판을 그리기 전에 필요한 폰트만 FontFace(display swap)로 로드하고, 로드 완료 후에만 큰 글자를 그린다(두부 방지).
//   로드 실패면 한글 국호를 큰 글자로 폴백. 서브셋에 없는 글자는 브라우저 글꼴 대체(시스템 폰트)에 맡긴다.
// 매핑(문자 체계 -> 폰트)은 plaqueFontMap.js 한 곳.
import { FONT_FAMILY } from '../theme.js';
import { withVer } from '../assetVersion.js';
import PLAQUE_FONT_FILES from '../data/plaque_fonts.json';
import { PLAQUE_FONTS, plaqueFontId, nfc } from './plaqueFontMap.js';

export { PLAQUE_FONTS, plaqueFontId, nfc } from './plaqueFontMap.js';

// 판 큰 글자의 글꼴 정보. 반환 { id, stack(fontFamily), rtl, file(서브셋 있음) }
export function plaqueFace(script, lang) {
    const id = plaqueFontId(script, lang);
    const def = id ? PLAQUE_FONTS[id] : null;
    const file = id ? PLAQUE_FONT_FILES?.fonts?.[id] ?? null : null;
    return { id, stack: def && file ? `'${def.family}', ${FONT_FAMILY}, serif` : FONT_FAMILY, rtl: !!def?.rtl, file };
}

const LOADS = new Map(); // id -> Promise<boolean>
const READY = new Set(); // 로드 완료 id(동기 확인용)
export const plaqueFontReady = (id) => READY.has(id);
// id 폰트 로드(1회). 성공 true / 실패·미지원·서브셋 없음 false. timeoutMs 를 넘기면 false(폴백) — 늦게 끝나도 다음 호출부터는 true
export function loadPlaqueFont(id, timeoutMs = 6000) {
    const def = PLAQUE_FONTS[id]; const file = PLAQUE_FONT_FILES?.fonts?.[id];
    if (!def || !file?.file || typeof FontFace !== 'function' || typeof document === 'undefined' || !document.fonts) return Promise.resolve(false);
    if (!LOADS.has(id)) {
        const ff = new FontFace(def.family, `url(${withVer(file.file)}) format('woff2')`, { weight: String(def.weight), style: 'normal', display: 'swap' });
        LOADS.set(id, ff.load().then((f) => { document.fonts.add(f); READY.add(id); return true; }).catch((e) => { console.warn('[plaque] 국호 폰트 로드 실패(한글 폴백)', id, e?.message ?? e); return false; }));
    }
    const p = LOADS.get(id);
    return Promise.race([p, new Promise((r) => setTimeout(() => r(false), timeoutMs))]);
}
// 지도 화면 진입 시 서브셋 전체(합계 수십 KB)를 미리 받아 둔다(정적 서버가 지도·초상 이미지로 붐벼 판 생성 시점에 늦는 것 방지)
export function preloadPlaqueFonts() { Object.keys(PLAQUE_FONT_FILES?.fonts ?? {}).forEach((id) => { loadPlaqueFont(id); }); }
// 시간 제한 없는 로드 결과(늦게 끝난 폰트로 판을 다시 그릴 때). 로드를 시작하지 않은 id 면 null
export const plaqueFontSettled = (id) => LOADS.get(id) ?? null;
// 서브셋이 text 의 모든 글자를 담는지(공백·가운뎃점 제외). 아니면 호출 측이 한글로 폴백(데이터가 서브셋보다 새로울 때 두부 방지)
export function plaqueCovers(id, text) {
    const chars = PLAQUE_FONT_FILES?.fonts?.[id]?.chars;
    if (!chars) return false;
    return [...nfc(text)].every((ch) => !ch.trim() || ch === '·' || chars.includes(ch));
}
