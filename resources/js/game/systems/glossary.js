// 용어집(Glossary): 화면에 나오는 게임 용어·라벨을 한 곳에서 관리한다.
// 오라 이름/효과 라벨은 서버 데이터가 우선이다: 유닛 aura 에 name/code 가 오거나 GET /api/rules 가 auras 목록을 주면 그 값을 쓴다(setAuraCatalog).
// 지금 서버는 유닛 aura 로 {radius, atk_pct, def_pct} 만 주므로, 이름은 카탈로그(수치 서명 매칭)로 찾고, 카탈로그가 없을 때만
// database/data/auras.json 시작값과 같은 임시 폴백(AURA_FALLBACK)을 쓴다. 서버 필드가 오면 폴백은 쓰이지 않는다.
export const TERMS = {
    aura: '오라',
    auraHelp: '지휘관 주변(맨해튼 거리 반경 칸, 본인 포함)의 아군 공격·방어를 %만큼 올리는 효과',
    auraReceive: '받는 효과',
    flankBack: '배후',
    flankSide: '측면',
};

// 임시 폴백(auras.json 시작값과 동일). TODO: 서버가 aura.name/code 또는 /api/rules auras 를 내려주면 제거
const AURA_FALLBACK = [
    { code: 'aura_atk', name: '전의 고양', atk_pct: 10, def_pct: 0 },
    { code: 'aura_def', name: '철벽 수호', atk_pct: 0, def_pct: 10 },
    { code: 'aura_both', name: '사기 진작', atk_pct: 5, def_pct: 5 },
];
let catalog = null;
export function setAuraCatalog(list) { if (Array.isArray(list) && list.length) catalog = list; }

// 오라 종류: 공격(atk) / 방어(def) / 복합(both)
export const auraKind = (a) => ((a?.atk_pct ?? 0) > 0 && (a?.def_pct ?? 0) > 0 ? 'both' : (a?.def_pct ?? 0) > 0 ? 'def' : 'atk');
// 색: 공격 붉은 주황 / 방어 청록 / 복합 금색 (적 오라는 붉은 계열 + 점선으로 따로 구분)
export const AURA_COLOR = { atk: 0xe8743b, def: 0x2fb5a6, both: 0xd8b04a, enemy: 0xd9534f };
export const AURA_CSS = { atk: '#f08a55', def: '#4fd1c1', both: '#f0d58c', enemy: '#ee8a76' };

export function auraName(a) {
    if (!a) return '';
    if (a.name) return a.name;
    const find = (list) => list?.find((c) => (a.code && c.code === a.code) || (c.atk_pct === (a.atk_pct ?? 0) && c.def_pct === (a.def_pct ?? 0)));
    return (find(catalog) ?? find(AURA_FALLBACK))?.name ?? TERMS.aura;
}

// 짧은 효과 표기: '공+10%' / '방+10%' / '공+5%·방+5%'
export function auraEffectShort(a) {
    const p = [];
    if (a?.atk_pct) p.push(`공+${a.atk_pct}%`);
    if (a?.def_pct) p.push(`방+${a.def_pct}%`);
    return p.join('·') || '효과 없음';
}

// 라벨: 이름 + 효과 ('전의 고양 · 공+10%')
export const auraLabel = (a) => `${auraName(a)} · ${auraEffectShort(a)}`;

// 설명: '전의 고양 — 반경 2칸, 아군 공격 +10%'
export function auraDesc(a) {
    const p = [];
    if (a?.atk_pct) p.push(`공격 +${a.atk_pct}%`);
    if (a?.def_pct) p.push(`방어 +${a.def_pct}%`);
    return `${auraName(a)} — 반경 ${a?.radius ?? '?'}칸, 아군(본인 포함) ${p.join(' · ')}`;
}
