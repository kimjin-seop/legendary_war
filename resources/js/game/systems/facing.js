// 방향(facing) 시스템 공용 상수/계산(서버 Engine::axisDir / Engine::flank 와 동일 규칙). 서버 facing 이 꺼져 있으면(units[].facing 이 null/없음) 아무것도 쓰이지 않는다.
export const DIRS = ['up', 'down', 'left', 'right'];
export const OPP = { up: 'down', down: 'up', left: 'right', right: 'left' };
export const DIR_VEC = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export const DIR_GLYPH = { up: '▲', down: '▼', left: '◀', right: '▶' };
// 시작값은 서버 기본값(config game.rules.facing_mult). 전투 시작 시 profile.rules.facing_mult 로 갱신된다(setFlankMult). 표시용 참고값이며 판정은 서버.
export const FLANK_PCT = { side: 15, back: 30 };
// 서버 GET /api/profile 의 rules.facing_mult({side:1.15, back:1.30})가 오면 표시값을 그 값으로 갱신(없으면 시작값 유지)
export function setFlankMult(mult) {
    if (!mult) return;
    if (typeof mult.side === 'number') FLANK_PCT.side = Math.round((mult.side - 1) * 100);
    if (typeof mult.back === 'number') FLANK_PCT.back = Math.round((mult.back - 1) * 100);
}
// 표시용 시선(visual facing)의 초기값: 가장 가까운 적 쪽의 우세 축(좌/우 위주, 위·아래가 우세하면 up/down). 적이 없으면 아군=right, 적=left.
export function defaultLook(u, units) {
    let best = null;
    (units ?? []).forEach((o) => {
        if (o.team === u.team || o.hp <= 0) return;
        const d = Math.abs(o.x - u.x) + Math.abs(o.y - u.y);
        if (!best || d < best.d) best = { d, o };
    });
    return (best && axisDir(best.o.x - u.x, best.o.y - u.y)) || (u.team === 'ally' ? 'right' : 'left');
}
export const FLANK_LABEL = { side: '측면', back: '배후' };

// (dx,dy) 우세 축 방향(대각선은 x축). 영벡터는 null
export function axisDir(dx, dy) {
    if (dx === 0 && dy === 0) return null;
    return Math.abs(dx) >= Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
}

// 공격 위치(ax,ay) -> 대상 def({x,y,facing})의 타격 방향: 'none' | 'side' | 'back' (서버 Engine::flank 와 동일)
export function flankOf(ax, ay, def) {
    const f = def?.facing ?? null;
    if (f === null) return 'none';
    const dx = ax - def.x;
    const dy = ay - def.y;
    if (Math.abs(dx) === Math.abs(dy)) return dx === 0 ? 'none' : 'side';
    const dir = axisDir(dx, dy);
    if (dir === f) return 'none';
    return OPP[f] === dir ? 'back' : 'side';
}
