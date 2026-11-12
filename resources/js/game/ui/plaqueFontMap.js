// 국호 판 폰트 매핑(단일 지점, 순수 모듈: 브라우저 API·다른 모듈 import 없음 — 런타임 plaqueFonts.js 와 서브셋 생성기 tools/build_plaque_fonts.mjs 가 함께 쓴다).
// 원천: Google Fonts 의 Noto 계열(SIL OFL 1.1). 판 큰 글자는 굵게(700).
// id -> Google Fonts 패밀리(서브셋 원천) / 페이지 내 패밀리명(시스템 Noto 와 충돌 방지용 고유 이름) / 두께
export const PLAQUE_FONTS = {
    han_kr: { google: 'Noto Serif KR', family: 'SRPG Plaque Han KR', weight: 700 }, // 한국·기본 한자
    han_jp: { google: 'Noto Serif JP', family: 'SRPG Plaque Han JP', weight: 700 }, // 일본(native_lang ja)
    han_tc: { google: 'Noto Serif TC', family: 'SRPG Plaque Han TC', weight: 700 }, // 중국 정체(zh, zh-Hant, lzh)
    han_sc: { google: 'Noto Serif SC', family: 'SRPG Plaque Han SC', weight: 700 }, // 중국 간체(zh-Hans)
    serif_lgc: { google: 'Noto Serif', family: 'SRPG Plaque Serif', weight: 700 }, // 라틴(악센트 é è ç œ)·그리스(다이어크리틱)·키릴
    arabic: { google: 'Noto Naskh Arabic', family: 'SRPG Plaque Arabic', weight: 700, rtl: true }, // 아랍어·페르시아어(RTL, 캔버스가 셰이핑)
    // 전통 몽골 문자(세로쓰기 문자). 가로 텍스트로 그리면 폰트 기본 방향 = 세로 줄을 반시계 90도 눕힌 모양 -> 왼쪽에서 오른쪽으로 읽힘(StageMapView 판)
    mongolian: { google: 'Noto Sans Mongolian', family: 'SRPG Plaque Mongolian', weight: 400 },
    xpeo: { google: 'Noto Sans Old Persian', family: 'SRPG Plaque Old Persian', weight: 400 }, // 고대 페르시아 설형문자(native_lang peo)
    deva: { google: 'Noto Serif Devanagari', family: 'SRPG Plaque Devanagari', weight: 700 }, // 데바나가리(힌디·산스크리트·마라티, 영웅 원어 이름)
};

const SCRIPT_ALIAS = { han: 'han', hanja: 'han', hani: 'han', hant: 'han', hans: 'han', kanji: 'han', hanzi: 'han', latin: 'lgc', latn: 'lgc', greek: 'lgc', grek: 'lgc', cyrillic: 'lgc', cyrl: 'lgc', arabic: 'arabic', arab: 'arabic', mongolian: 'mongolian', mong: 'mongolian', devanagari: 'deva', deva: 'deva' };

// (script, lang) -> PLAQUE_FONTS id | null(한글 등: 기본 UI 폰트)
export function plaqueFontId(script, lang = '') {
    const lg = String(lang ?? '').toLowerCase();
    if (lg === 'peo' || String(script ?? '').toLowerCase() === 'xpeo') return 'xpeo';
    const sc = SCRIPT_ALIAS[String(script ?? '').toLowerCase()] ?? null;
    if (sc === 'lgc') return 'serif_lgc';
    if (sc === 'arabic') return 'arabic';
    if (sc === 'mongolian') return 'mongolian';
    if (sc === 'deva') return 'deva';
    if (sc !== 'han') return null;
    if (lg.startsWith('ja')) return 'han_jp';
    if (lg === 'zh-hans' || lg === 'zh-cn' || lg === 'zh-sg') return 'han_sc';
    if (lg.startsWith('zh') || lg === 'lzh' || lg === 'och' || lg === 'ltc') return 'han_tc';
    return 'han_kr';
}

export const nfc = (s) => { try { return String(s ?? '').normalize('NFC'); } catch { return String(s ?? ''); } };
