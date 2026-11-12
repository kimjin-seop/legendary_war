// 스킬 표시용 보조(판정은 서버). 액티브 스킬 목록·사용 불가 사유·코드 -> 이름 변환표.
// 이름 출처: 서버 view units[].active_skills[].name, units[].skills[].name(조건부 패시브, 서버가 name 을 주는 경우에만).
// 이름을 모르는 코드는 null(화면에서 숨김). 서버가 패시브 이름을 주지 않는 동안 패시브 팝업·로그 이름은 대부분 생략된다.
const NAMES = new Map();

// 스킬 표시명: 서버 이름 끝의 내부 등급 키 '(weak|mid|strong)' 를 사용자 표기 ' · 약/중/강' 으로 바꾼다(예: '공격력 강화 (mid)' -> '공격력 강화 · 중').
// 미등록 영문 키 괄호(예: '(lv2)', '(foo_bar)')는 괄호째 제거. 한글 괄호(예: '(준비 중)')는 건드리지 않는다.
const SKILL_TIER_KO = { weak: '약', low: '약', mid: '중', medium: '중', strong: '강', high: '강' };
export function skillDisplayName(name) {
    if (name == null) return name;
    return String(name)
        .replace(/\s*\(\s*([A-Za-z][A-Za-z0-9_-]*)\s*\)/g, (m, k) => { const t = SKILL_TIER_KO[k.toLowerCase()]; return t ? ` · ${t}` : ''; })
        .trim();
}

export function registerSkillNames(units) {
    (units ?? []).forEach((u) => {
        (Array.isArray(u?.active_skills) ? u.active_skills : []).forEach((s) => { if (s?.code && s?.name) NAMES.set(s.code, skillDisplayName(s.name)); });
        (Array.isArray(u?.skills) ? u.skills : []).forEach((s) => { if (s?.code && s?.name) NAMES.set(s.code, skillDisplayName(s.name)); });
    });
}

export const skillName = (code) => (code ? NAMES.get(code) ?? null : null);

// 유닛의 액티브 스킬 배열(없으면 빈 배열). 서버는 액티브가 없는 유닛에 키를 주지 않는다.
export const activeSkillsOf = (u) => (Array.isArray(u?.active_skills) ? u.active_skills : []);

// 사용 불가 사유(사용 가능하면 null). 서버 usable 이 false 면 쿨다운/횟수/행동 완료 순으로 사유를 고른다.
// targetCount: 현재(임시 이동 반영) 위치에서 사거리 안 적 수(로컬 계산, 참고용)
// MP 방식(battle.mp_mode, 2026-11-04): 쿨다운·횟수 대신 마력(MP). opt = { mpMode, unit } — unit.mp(본인 영웅 수치) < mp_cost 면 '마력 부족'
export const skillMpOf = (sk, unit) => { const v = unit?.mp ?? sk?.mp_left; return v == null || !Number.isFinite(Number(v)) ? null : Number(v); };
export function skillBlockReason(sk, targetCount, opt = {}) {
    if (opt.mpMode) {
        const mp = skillMpOf(sk, opt.unit); const cost = Number(sk.mp_cost);
        if (Number.isFinite(cost) && mp != null && mp < cost) return `마력 부족 (${mp}/${cost})`;
        if (sk.usable === false) return '지금은 사용할 수 없습니다';
        if (targetCount === 0) return '사거리 안에 대상이 없습니다';
        return null;
    }
    if ((sk.cooldown_left ?? 0) > 0) return `재사용 대기 ${sk.cooldown_left}턴`;
    if ((sk.uses_left ?? 1) <= 0) return '이 전투의 사용 횟수를 모두 썼습니다';
    if (sk.usable === false) return '지금은 사용할 수 없습니다';
    if (targetCount === 0) return '사거리 안에 대상이 없습니다';
    return null;
}

// 메뉴 버튼 라벨: '이름 150%' + 쿨다운이면 '(N턴)' / 횟수 표시 'n/m'
export function skillLabel(sk, opt = {}) {
    if (opt.mpMode) return `${skillDisplayName(sk.name) ?? sk.code}${Number.isFinite(Number(sk.mp_cost)) ? ` · 마력 ${sk.mp_cost}` : ''}`; // MP 방식: 이름 + 마력 소모(위력%·횟수 생략, 효과는 메뉴 설명 줄)
    const cd = (sk.cooldown_left ?? 0) > 0 ? ` (${sk.cooldown_left}턴)` : '';
    const uses = sk.uses != null ? ` ${Math.max(0, sk.uses_left ?? 0)}/${sk.uses}` : '';
    return `${skillDisplayName(sk.name) ?? sk.code} ${sk.power_pct ?? 100}%${cd || uses}`;
}
