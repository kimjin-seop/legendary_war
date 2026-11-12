// 스킬 속성·유닛 내성 표시 공용(박백엔 2026-11-04: skill.element, unit.resists, 이벤트 attack.element/element_pct)
// 부호 규칙: unit.resists[el] 음수 = 약점(그만큼 더 받음), 양수 = 내성. 이벤트 element_pct 양수 = 약점 적중(피해 증가), 음수 = 내성(피해 감소)
// 모르는 속성 코드는 회색 + 코드 그대로(데이터가 늘어도 깨지지 않게)
export const ELEMENTS = {
    fire: { ko: '불', color: 0xe8643c, css: '#ff8a5c' },
    thunder: { ko: '번개', color: 0xe8c83c, css: '#ffe070' },
    lightning: { ko: '번개', color: 0xe8c83c, css: '#ffe070' },
    water: { ko: '물', color: 0x4aa8e8, css: '#8fd0ff' },
    water_ice: { ko: '물·얼음', color: 0x4aa8e8, css: '#8fd0ff' }, // 서버 database/data/elements.json 코드(2026-11-06 QA: 원시 키 노출)
    ice: { ko: '얼음', color: 0x8fdcf0, css: '#b8f0ff' },
    frost: { ko: '얼음', color: 0x8fdcf0, css: '#b8f0ff' },
    poison: { ko: '독', color: 0x6cc05a, css: '#9fe08a' },
};
export const elementInfo = (el) => (el ? ELEMENTS[el] ?? { ko: String(el), color: 0x9aa8c0, css: '#c9c2ae' } : null);

// 내성 칩 목록: [{ text: '불 약점 20%', css, weak }] (0 은 생략, 약점 먼저)
export function resistChips(resists) {
    if (!resists || typeof resists !== 'object') return [];
    return Object.entries(resists).map(([el, v]) => ({ el, v: Number(v) })).filter((x) => Number.isFinite(x.v) && x.v !== 0)
        .sort((a, b) => a.v - b.v)
        .map(({ el, v }) => { const e = elementInfo(el); return { text: `${e.ko} ${v < 0 ? '약점' : '내성'} ${Math.abs(v)}%`, css: v < 0 ? '#ff9a8a' : '#9fd8ff', weak: v < 0 }; });
}
export const resistText = (resists) => resistChips(resists).map((c) => c.text).join(' · ');

// 공격 이벤트 속성 문구: element_pct > 0 '불 약점 +30%', < 0 '불 내성 -30%', 0/없음 = ''
export function elementHitText(el, pct) {
    const p = Number(pct); if (!el || !Number.isFinite(p) || !p) return '';
    const e = elementInfo(el); return `${e.ko} ${p > 0 ? '약점' : '내성'} ${p > 0 ? '+' : ''}${p}%`;
}
