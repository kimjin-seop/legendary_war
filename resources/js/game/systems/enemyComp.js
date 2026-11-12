// 적 편성 집계·상성 연결(표시 전용, 판정은 서버). Deploy 적 미리보기 줄과 패배 결과창 힌트가 같이 쓴다.
// 상성은 rules.js MATCHUPS(서버 /api/rules 로 교체된 표)만 사용한다. 증원·함정·적 영웅 정보는 여기서 만들지 않는다(호출부가 넘긴 공개 유닛만 집계).
import { typeAlias, multiplier } from '../data/rules.js';
import { unitClassName } from './names.js';
import { withJosa } from './josa.js';

// 플레이어가 편성할 수 있는 병종만 '유리한 병종' 후보로 쓴다(monster·assassin 같은 적 전용 병종을 권하지 않게)
const COUNTER_POOL = ['sword', 'spear', 'cavalry', 'archer', 'mage', 'healer', 'flyer', 'gunner', 'naval'];

// [{type, n}] 많은 순. 퇴역 병종은 대체 병종으로 합산(heavy -> sword). 수레·배(non_hero)는 전투 병종이 아니라 제외. skip(u) = true 면 제외
export function enemyTypeCounts(units, skip = null) {
    const m = new Map();
    (units ?? []).forEach((u) => {
        if (!u?.type || u.non_hero || (skip && skip(u))) return;
        const t = typeAlias(u.type);
        m.set(t, (m.get(t) ?? 0) + 1);
    });
    return [...m.entries()].map(([type, n]) => ({ type, n })).sort((a, b) => b.n - a.n);
}

// type 을 유리하게 치는 병종 1개(배율 큰 순, 같으면 역상성이 덜 아픈 쪽). 없으면 null
export function counterOf(type) {
    const t = typeAlias(type);
    let best = null;
    COUNTER_POOL.forEach((c) => {
        if (c === t) return;
        const v = multiplier(c, t);
        if (v <= 1) return;
        if (!best || v > best.m || (v === best.m && multiplier(t, c) < multiplier(t, best.type))) best = { type: c, m: v };
    });
    return best?.type ?? null;
}

// 패배 결과창 한 줄 힌트: 적 전투 병종 중 한 병종이 40% 이상(동률 1위 없음, 3기 이상)이고 그 병종을 유리하게 치는 병종이 있을 때만. 그 외 null(숨김)
// ownTypes(선택): 플레이어가 가진 병종 목록. 주어졌는데 유리 병종이 그 안에 없으면 권할 수 없으므로 궁병 보유 시 궁병 일반 조언, 아니면 null
export function defeatHint(units, ownTypes = null) {
    const list = enemyTypeCounts(units);
    const total = list.reduce((s, x) => s + x.n, 0);
    if (total < 3 || !list.length) return null;
    const top = list[0];
    if (top.n / total < 0.4 || (list[1] && list[1].n === top.n)) return null;
    const c = counterOf(top.type);
    if (!c) return null;
    const own = Array.isArray(ownTypes) && ownTypes.length ? new Set(ownTypes.map(typeAlias)) : null;
    if (own && !own.has(c)) return own.has('archer') ? '궁병은 떨어져서 쏘는 병종입니다. 앞열에 보병을 두고 사거리를 유지하세요' : null;
    return `이 스테이지는 ${unitClassName(top.type)} 비중이 높습니다. ${withJosa(unitClassName(c), '이/가')} 유리합니다`;
}
