import { unitType, UNIT_TYPES, typeAlias, matchupOf } from '../data/rules.js';
import { skillDisplayName } from './skills.js';

// 병종(클래스) 표시 이름·글리프 단일 지점: rules UNIT_TYPES 의 label/glyph > 보조표(v2 병종 등 rules 미등록 코드) > 코드 그대로.
// 병종 v2 이름 변경(예: sword=보병, 승려·수병)은 rules 또는 setUnitClassNames 로 여기서만 바꾼다.
// 병종 v2 표시명(팀장 확정): sword=보병, healer=승려, heavy=보병(sword 통일, 중장갑 표기 제거), archer=궁병. 서버 코드값은 그대로, 표시명만 여기서 바꾼다
let UNIT_CLASS_NAMES = { sword: '보병', healer: '승려', heavy: '보병', spear: '창병', cavalry: '기병', mage: '마법사', archer: '궁병', lance: '창병', axe: '도끼병', monk: '승려', sailor: '수병', infantry: '보병', bow: '궁병', naval: '수병', monster: '마물', assassin: '암살자', gunner: '총병' }; // 도트 뱃지 9종(sword|spear|cavalry|naval|archer|mage|healer|monster|assassin) 중 rules 미등록 코드 보강
export function setUnitClassNames(map) { if (map && typeof map === 'object') UNIT_CLASS_NAMES = { ...UNIT_CLASS_NAMES, ...map }; }
// 퇴역 병종(서버 alias_of, 예 heavy -> sword)은 자기 표기가 없으면 대체 병종 표기를 쓴다
export const unitClassName = (type) => (type ? UNIT_CLASS_NAMES[type] ?? UNIT_CLASS_NAMES[typeAlias(type)] ?? UNIT_TYPES[type]?.label ?? String(type) : '-');
export const unitClassGlyph = (type) => { const nm = type ? UNIT_CLASS_NAMES[type] ?? UNIT_CLASS_NAMES[typeAlias(type)] : null; return type ? (nm ? nm.slice(0, 1) : UNIT_TYPES[type]?.glyph ?? unitClassName(type).slice(0, 1)) : '?'; };

// 표시 이름 단일 지점.
// - 영웅: 서버 display_name > '칭호 이름'(서버 title 이 있을 때만, 폴백 칭호 하드코딩 금지) > 이름.
// - 부대: 서버 display_name > '<소속 영웅 순수 이름>의 <병종 부대명>'(예: 이순신의 보병부대). 소속은 leader_id, 없으면 같은 진영 지휘관.
// - 병종 부대명: TROOP_NAMES(송서사 hero_titles.json 의 troop_names 가 오면 setTroopNames 로 교체) > rules 병종 이름 + '부대'.
let TROOP_NAMES = { heavy: '보병부대', archer: '궁병부대', healer: '승려부대', mage: '마법사부대' }; // 병종 v2: 중장갑 표기 제거(heavy=sword)
export function setTroopNames(map) { if (map && typeof map === 'object') TROOP_NAMES = { ...TROOP_NAMES, ...map }; }

export const troopTypeName = (type) => TROOP_NAMES[type] ?? TROOP_NAMES[typeAlias(type)] ?? `${unitClassName(type)}부대`;
const troopShort = (type) => troopTypeName(type); // 병종 v2 이름이 짧아 축약 불필요(예: '보병부대')

// 상성 안내 줄(툴팁·가이드 공용, rules.matchupOf 에서 생성 = 서버 /api/rules matchups 반영). 없으면 [] (대등만 있는 병종)
// 반환 [{text, kind:'adv'|'dis'|'threat'}]. 예) '유리: 창병 x1.25', '불리: 기병 x0.8', '주의: 기병에게 x1.25'
const fmtList = (xs) => xs.map((x) => `${unitClassName(x.type)} x${Math.round(x.m * 100) / 100}`).join(', ');
export function matchupLines(type) {
    if (!type) return [];
    const { strong, weak, threats } = matchupOf(type);
    const out = [];
    if (strong.length) out.push({ text: `유리: ${fmtList(strong)}`, kind: 'adv' });
    if (weak.length) out.push({ text: `불리: ${fmtList(weak)}`, kind: 'dis' });
    if (threats.length) out.push({ text: `주의: ${threats.map((x) => unitClassName(x.type)).join(', ')}에게 약함`, kind: 'threat' });
    return out;
}
// 공격 -> 방어 한 쌍 표기(예측 말풍선): '보병 → 창병 x1.25'
export const matchupPair = (att, def, m) => `${unitClassName(att)} → ${unitClassName(def)} x${Math.round((Number(m) || 1) * 100) / 100}`;
// 예측 말풍선 둘째 줄: 대등 = '궁병 vs 궁병 · 상성 대등', 유리/불리 = '기병 → 창병 x1.25 (유리)'
export const matchupPairLine = (att, def, m, aff) => (!att || !def ? null : Number(aff) > 0 ? `${matchupPair(att, def, m)} (유리)` : Number(aff) < 0 ? `${matchupPair(att, def, m)} (불리)` : `${unitClassName(att)} vs ${unitClassName(def)} · 상성 대등`);

// 문화권 표시명 단일 지점(서버 heroes.culture 코드 -> 한글). DB 실제 코드 11종 + 에셋·NPC 쪽 코드. 모르는 코드는 영문 원문 대신 '' (호출 측이 생략 또는 '기타')
const CULTURE_KO = { korea: '한국', china: '중국', japan: '일본', europe: '유럽', middle_east: '중동', ancient_med: '고대 지중해', steppe: '초원', south_asia: '남아시아', southeast_asia: '동남아시아', americas: '아메리카', africa: '아프리카', mongol: '몽골', hre: '신성 로마', default: '기타' };
export const cultureName = (c) => (c ? CULTURE_KO[c] ?? '' : '');

// 영웅 원어 이름(data/hero_native_names.json, 지연 청크 1회 로드). 형식 {code: {native, lang, script, ko}} 또는 {heroes: {...}}. 없으면 null
let NATIVE = null; let nativeP = null;
export function ensureHeroNatives() {
    if (NATIVE) return Promise.resolve(NATIVE);
    nativeP ??= import('../data/hero_native_names.json').then((m) => { const d = m.default ?? m; const src = (d?.items && typeof d.items === 'object') ? d.items : (d?.heroes && typeof d.heroes === 'object' ? d.heroes : d); NATIVE = Object.fromEntries(Object.entries(src ?? {}).filter(([k, v]) => !k.startsWith('_') && v && typeof v === 'object' && v.native)); return NATIVE; }).catch(() => { NATIVE = {}; return NATIVE; });
    return nativeP;
}
export const getNative = (code) => (NATIVE && code ? NATIVE[code] ?? null : null);

// 영웅 이름 3종(서버 GameData::displayName 과 같은 규칙, 필드: title|null, short_name|null, display_name):
//  - 정식 이름(상세·도감·대사): heroPlainName = name_ko/name (예: 한니발 바르카)
//  - 한 줄 표시: heroLabel(u)               = display_name > (title ? `${title} ${short_name ?? name}` : name) (예: 카르타고의 한니발)
//  - 좁은 곳:   heroLabel(u, {compact:true}) = short_name ?? name, 칭호 생략 (예: 한니발)
// 부대 유닛에는 쓰지 않는다(부대 이름은 unitDisplayName).
export const heroPlainName = (u) => u?.hero_name ?? u?.name_ko ?? u?.name ?? '?';
export const heroShortName = (u) => u?.short_name || heroPlainName(u);
export const heroDisplayName = (u) => u?.display_name || (u?.title ? `${u.title} ${heroShortName(u)}` : heroPlainName(u));
// 장수(영웅·지휘관) 목록 대상인지: 병사(troop)·수레/배 등 서버 non_hero 유닛(npc_cart_*, npc_boat_*) 제외. 맵 표시와는 무관
export const isHeroUnit = (u) => !!u && u.kind !== 'troop' && !u.non_hero;
export const heroLabel = (u, opts = {}) => (opts.compact ? heroShortName(u) : heroDisplayName(u));
// 뽑기 화면에서 짧은 이름 대신 정식 이름(name_ko 전체)을 쓰는 영웅: 일본 무장 전체(culture = japan, 사용자 지시 2026-11-03). 다른 문화권은 기존 표시 그대로.
// 문화권 = 영웅 행의 culture > GET /api/gacha heroes[] 로 등록한 코드별 문화권(뽑기 결과 행에는 culture 가 없어 풀 목록으로 보완)
export const GACHA_FULL_NAME_CULTURES = new Set(['japan']);
const GACHA_CULTURE = new Map();
export const gachaCultureOf = (code) => (code ? GACHA_CULTURE.get(code) ?? null : null); // 뽑기 풀 문화권(GET /api/gacha heroes[].culture). 뽑기 결과 행에는 culture 가 없어 S 카드 배경 테마 폴백에 쓴다
export function setGachaCultures(heroes) { (Array.isArray(heroes) ? heroes : []).forEach((h) => { if (h?.hero && h.culture) GACHA_CULTURE.set(h.hero, h.culture); }); }
const fullOnly = (u) => GACHA_FULL_NAME_CULTURES.has(u?.culture ?? GACHA_CULTURE.get(u?.hero ?? u?.code) ?? u?.detail?.culture);
export const gachaShortName = (u) => (fullOnly(u) ? heroPlainName(u) : heroShortName(u) || heroPlainName(u)); // 기존 heroShortName(x) || heroPlainName(x) 자리
export const gachaLabel = (u, opts = {}) => (fullOnly(u) ? (u.title ? `${u.title} ${heroPlainName(u)}` : heroPlainName(u)) : heroLabel(u, opts)); // 기존 heroLabel 자리(칭호 + 정식 이름)

// 영웅 스킬 목록 문구(서버 heroDetail.skills[]: {name, enabled, effect, condition}). 최대 max 줄, 넘치면 '외 N개'
export function skillLines(skills, max = 6) {
    const list = (skills ?? []).filter((k) => k && k.name);
    const out = list.slice(0, max).map((k) => `· ${skillDisplayName(k.name)}${k.enabled === false ? ' (준비 중)' : ''}${k.effect ? ` — ${k.effect}` : ''}${k.condition ? ` [${k.condition}]` : ''}`);
    if (list.length > max) out.push(`  외 ${list.length - max}개`);
    return list.length ? ['스킬', ...out] : [];
}

export function leaderOf(units, u) {
    if (!u || u.kind !== 'troop') return null;
    return (u.leader_id != null ? units?.find((x) => x.id === u.leader_id) : null)
        ?? units?.find((x) => x.side === u.side && x.kind === 'commander') ?? null;
}

// opts.short: 폭이 모자랄 때 축약형(영웅 '한니발' / 부대 '이순신 보병부대')
export function unitDisplayName(u, units, opts = {}) {
    if (!u) return '';
    if (u.kind !== 'troop') return heroLabel(u, { compact: !!opts.short });
    // 서버는 부대 display_name 을 기존 name(병종명, 예: '궁수')과 같게 내려준다 → 같으면 무시하고 '<영웅>의 <부대명>' 조합
    if (u.display_name && u.display_name !== u.name && !opts.short) return u.display_name;
    const ld = leaderOf(units, u);
    const lname = ld ? heroShortName(ld) : null;
    if (opts.short) return lname ? `${lname} ${troopShort(u.type)}` : troopShort(u.type);
    return lname ? `${lname}의 ${troopTypeName(u.type)}` : troopTypeName(u.type);
}
