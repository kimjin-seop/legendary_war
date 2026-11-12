// 한국어 조사 자동 처리(을/를, 이/가, 은/는, 와/과, 으로/로). 화면 문구의 '을(를)'·'이(가)' 자리표시자 대신 사용한다.
// 판별 기준 = 단어의 마지막 '발음 글자':
//  - 끝의 공백·닫는 괄호·따옴표(」』)]}>"'’” 〉》 등)는 건너뛴다. 예: 「한산도, 학의 날개」 -> '개'(받침 없음) -> 를
//  - 한글: 종성 유무(ㄹ 종성은 '로' 판정용으로 구분)
//  - 숫자: 한국어 읽기(1 일, 2 이, 3 삼 ... / 끝이 0 이면 10 십·100 백·1000 천·10000 만)
//  - 영문: 대문자 약어는 글자 읽기(L 엘·R 알 = ㄹ, M 엠·N 엔 = 받침), 소문자 단어는 끝 자음으로 근사(m n ng l k t p b g d)
//  - 판별 불가(기호만, 빈 문자열): 병기형 '을(를)' 대신 받침 없는 형태를 기본값으로 쓴다
// 사용: withJosa('투구', '이/가') -> '투구가', josa('갑옷', '을/를') -> '을'

const CLOSERS = new Set([' ', '\t', '\n', '」', '』', ')', ']', '}', '>', '"', "'", '’', '”', '〉', '》', '】', '〕', '.', '…', '!', '?', ',', '·']);
// 받침 상태: 0 = 없음, 1 = 있음(ㄹ 제외), 2 = ㄹ 받침
const DIGIT = { 0: 1, 1: 2, 2: 0, 3: 1, 4: 0, 5: 0, 6: 1, 7: 2, 8: 2, 9: 0 }; // 영(받침)·일(ㄹ)·이·삼·사·오·육·칠(ㄹ)·팔(ㄹ)·구
const ZEROS = { 1: 1, 2: 1, 3: 1, 4: 1 }; // 십(ㅂ)·백(ㄱ)·천(ㄴ)·만(ㄴ)
const UPPER = { L: 2, R: 2, M: 1, N: 1 }; // 엘·알·엠·엔, 나머지 알파벳 이름은 받침 없음

export function finalState(word) {
    const s = String(word ?? '');
    let i = s.length - 1;
    while (i >= 0 && CLOSERS.has(s[i])) i -= 1;
    if (i < 0) return null;
    const ch = s[i];
    const code = ch.charCodeAt(0);
    if (code >= 0xac00 && code <= 0xd7a3) {
        const jong = (code - 0xac00) % 28;
        return jong === 0 ? 0 : jong === 8 ? 2 : 1;
    }
    if (/[0-9]/.test(ch)) {
        let z = 0;
        while (i - z >= 0 && s[i - z] === '0') z += 1;
        if (z > 0 && i - z >= 0 && /[0-9]/.test(s[i - z])) return ZEROS[Math.min(z, 4)] ?? 1;
        return DIGIT[ch];
    }
    if (/[A-Za-z]/.test(ch)) {
        const prev = i > 0 ? s[i - 1] : '';
        if (ch === ch.toUpperCase() && (!/[a-z]/.test(prev))) return UPPER[ch] ?? 0; // 약어(대문자 끝)
        const lc = ch.toLowerCase();
        if (lc === 'l') return 2;
        if (lc === 'g' && prev.toLowerCase() === 'n') return 1;
        return 'mnkptbgd'.includes(lc) ? 1 : 0;
    }
    return null;
}

const PAIRS = { '을/를': ['을', '를'], '이/가': ['이', '가'], '은/는': ['은', '는'], '와/과': ['과', '와'], '과/와': ['과', '와'], '으로/로': ['으로', '로'], '이다/다': ['이다', '다'] };
// 한쪽만 줘도 된다('을', '를', '이', '가' ...)
const ALIAS = { 을: '을/를', 를: '을/를', 이: '이/가', 가: '이/가', 은: '은/는', 는: '은/는', 와: '와/과', 과: '와/과', 으로: '으로/로', 로: '으로/로' };

export function josa(word, pair) {
    const key = PAIRS[pair] ? pair : ALIAS[pair] ?? pair;
    const [withBatchim, without] = PAIRS[key] ?? [pair, pair];
    const st = finalState(word);
    if (key === '으로/로') return st === 1 ? withBatchim : without; // ㄹ 받침·받침 없음 -> 로
    return st === 1 || st === 2 ? withBatchim : without;
}

export const withJosa = (word, pair) => `${word ?? ''}${josa(word, pair)}`;

// 서버·데이터 문구 보정(표시 직전 1회): ① 병기형 자리표시자 '을(를)'·'이(가)'·'은(는)'·'와(과)'·'(으)로' ② 닫는 괄호·따옴표 바로 뒤 조사
// (예: '「한산도, 학의 날개」을' -> '「한산도, 학의 날개」를'). 일반 낱말 속 '이'·'가' 오인을 막기 위해 ②는 」』"’”)] 바로 뒤만 고친다.
const PH = [[/(\S+?)\s?(?:을\(를\)|를\(을\))/g, '을/를'], [/(\S+?)\s?(?:이\(가\)|가\(이\))/g, '이/가'], [/(\S+?)\s?(?:은\(는\)|는\(은\))/g, '은/는'], [/(\S+?)\s?(?:와\(과\)|과\(와\))/g, '와/과'], [/(\S+?)\s?\(으\)로/g, '으로/로']];
export function fixJosa(text) {
    if (text == null) return text;
    let s = String(text);
    PH.forEach(([re, pair]) => {
        s = s.replace(re, (m, w) => `${w}${josa(w, pair)}`);
    });
    return s.replace(/([^\s][」』"’”)\]]+)(으로|로|을|를|이|가|은|는|와|과)(?=[\s.,!?·]|$)/g, (m, w, p) => `${w}${josa(w, p)}`);
}
