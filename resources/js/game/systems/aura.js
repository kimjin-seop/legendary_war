// 오라 적용 판정 단일 지점. 화면 표시(범위·배지·안내)와 예측(auraBonus) 모두 이 함수를 쓴다.
// 서버 규칙(Engine::auraBonus): 소속(squad) off = 같은 진영 오라원 반경 안 아군 전체(본인 포함) / on = 오라원 소속(leader_id) 유닛 + 본인만.
// on/off 는 units[].leader_id 필드 존재로 판별한다(서버는 on 일 때만 이 필드를 준다).
export function auraAppliesTo(cmd, unit) {
    // 오라원 = 영웅(kind != troop, aura 보유, 생존). 서버 squad 규칙과 동일
    if (!cmd?.aura || cmd.hp <= 0 || cmd.kind === 'troop' || cmd.side !== unit.side) return false;
    if (cmd.id === unit.id) return true; // 본인 포함(서버 squad_aura_self 기본 true)
    // 소속(squad) on 전투: 서버가 units[].leader_id 필드를 준다(영웅=null). 필드가 있으면 그 오라원 소속 부대만 수혜, 다른 영웅·그 부대는 제외
    if (unit.leader_id !== undefined) return unit.leader_id === cmd.id;
    return true; // 소속 off(필드 없음): 기존 규칙(같은 진영 아군 전체)
}

// 오라 출처 목록: [{cmd, dist, atk, def}]. 지휘관 자신이 (x,y) 로 이동하는 미리보기면 그 위치를 중심으로 본다.
export function auraSources(units, unit, x, y) {
    const out = [];
    units.forEach((c) => {
        if (!auraAppliesTo(c, unit)) return;
        const cx = c.id === unit.id ? x : c.x;
        const cy = c.id === unit.id ? y : c.y;
        const d = Math.abs(x - cx) + Math.abs(y - cy);
        if (d <= c.aura.radius) out.push({ cmd: c, dist: d, atk: c.aura.atk_pct ?? 0, def: c.aura.def_pct ?? 0 });
    });
    return out;
}
