// 전투 맵 영웅 이름표 표기(아군·적 공통, 사용자 2026-11-14 "길어서 잘리면 성만 표기"). 순수 함수(Phaser 의존 없음)
// - max(5)자 이하: 그대로
// - 직함 이름(~대장·~지휘관 등): 기존 규칙(앞 max 자 + '…')
// - 공백 있는 이름('오다 노부나가', '한니발 바르카', '알렉산드로스 3세'): 첫 토큰(성 또는 서양식 첫 이름). 첫 토큰이 길면 아래 규칙
// - 공백 없는 긴 이름: 성/이름 구분 데이터가 없으므로(영웅 데이터에 surname 없음) 6자 이하 전체, 7자 이상 앞 max 자 + '…'
export const NAME_TAG_MAX = 5;
const TITLE_TAIL = /(대장|지휘관|장군|부장|수장|대장군|장수|사령관|두목|군관)$/;

export function nameTagText(name, max = NAME_TAG_MAX) {
    const nm = String(name ?? '').trim().replace(/\s+/g, ' ');
    if ([...nm].length <= max) return nm;
    if (TITLE_TAIL.test(nm)) return `${[...nm].slice(0, max).join('')}…`;
    const first = nm.includes(' ') ? nm.split(' ')[0] : nm;
    const chars = [...first];
    if (first !== nm && chars.length <= max) return first;
    // 공백 없는 이름(또는 긴 첫 토큰): 6자 이하 전체(폭은 UnitView 역스케일·폭 보정), 7자 이상 앞 max 자 + '…'
    return chars.length <= max + 1 ? first : `${chars.slice(0, max).join('')}…`;
}
