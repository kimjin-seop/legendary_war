// 대사창 전용 글꼴(스테이지 전·후·튜토리얼 Dialogue 씬 + 전투 대사 BattleDialogue). 다른 화면은 기본 UI 폰트(Pretendard) 그대로.
// - 글꼴: 고운바탕 Gowun Batang(SIL OFL 1.1, https://github.com/yangheeryu/Gowun-Batang, 원본 google/fonts ofl/gowunbatang).
//   자체 호스팅 public/fonts/dialogue/GowunBatang-{Regular,Bold}.subset.woff2 (KS X 1001 한글 2,350자 + 영숫자·구두점 + 대사 JSON 전 글자 서브셋,
//   pyftsubset). 라이선스 원문 public/fonts/dialogue/OFL.txt. 서브셋에 없는 글자는 폴백 스택(Pretendard -> 시스템)으로 그려진다.
// - 로드: FontFace 로 1회 로드(최대 timeoutMs). Phaser 텍스트는 캔버스에 한 번 그리면 폰트가 늦게 와도 다시 그리지 않으므로
//   호출 측이 loadDialogueFont() 를 기다린 뒤 텍스트를 만든다(시간 초과·실패면 폴백 스택으로 그대로 진행).
import { FONT_FAMILY } from '../theme.js';
import { withVer } from '../assetVersion.js';

export const DIALOGUE_FAMILY = 'Gowun Batang';
export const DIALOGUE_FONT = `'${DIALOGUE_FAMILY}', ${FONT_FAMILY}`;
const FILES = [
    ['400', '/fonts/dialogue/GowunBatang-Regular.subset.woff2'],
    ['700', '/fonts/dialogue/GowunBatang-Bold.subset.woff2'],
];

let loading = null;
let ready = false;
// 동기 확인용(document.fonts.check 는 등록 전 글꼴에도 true 를 돌려줘 쓰지 않는다)
export const dialogueFontReady = () => ready;
export function loadDialogueFont(timeoutMs = 2500) {
    if (typeof FontFace !== 'function' || typeof document === 'undefined' || !document.fonts) return Promise.resolve(false);
    if (!loading) {
        loading = Promise.all(FILES.map(([weight, url]) => new FontFace(DIALOGUE_FAMILY, `url(${withVer(url)}) format('woff2')`, { weight, style: 'normal', display: 'swap' })
            .load().then((f) => { document.fonts.add(f); return true; })))
            .then(() => { ready = true; return true; })
            .catch((e) => { console.warn('[dialogue] 대사 글꼴 로드 실패(기본 글꼴로 표시)', e?.message ?? e); return false; });
    }
    return Promise.race([loading, new Promise((r) => setTimeout(() => r(false), timeoutMs))]);
}

// makeText 로 만든 텍스트에 대사 글꼴 적용(크기·색 등 나머지 스타일 유지)
export const useDialogueFont = (t) => (t?.setFontFamily ? t.setFontFamily(DIALOGUE_FONT) : t);
