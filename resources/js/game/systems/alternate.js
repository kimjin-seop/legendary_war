// 교대 행동(부대 단위 활성화) 순수 함수 모음. Phaser·API 비의존(node 로 단독 검증 가능).
// 서버 계약(BattleService::view / Engine::altView):
//   view.alternate(bool), view.alt = {round, side, active_squad|null, round_first_side, consecutive{side,count,cap}, squads[{id,side,status:ready|active|done|gone,unit_ids[]}]}
//   이벤트: activation_start{actor_unit_id=squad_id, unit_ids, side, turn} / activation_end{actor_unit_id, side, reason:end|done|collapse|timeout, turn}
//          round_end{turn, reason:exhausted|cap} (이어서 turn_start{turn, side})
// 부대 키: squad on = 영웅 id(병사는 leader_id), squad off 또는 소속 불명 = 자기 id. 서버 squads[].unit_ids 가 있으면 그것을 우선한다.

// 서버 뷰 -> 로컬 교대 상태(off 면 null)
export function altFromView(view) {
    if (!view?.alternate || !view.alt) return null;
    const a = view.alt;
    const c = a.consecutive ?? {};
    return {
        round: Number(a.round ?? view.round ?? view.turn ?? 1),
        side: a.side ?? view.current_side ?? null,
        activeSquad: a.active_squad ?? null,
        firstSide: a.round_first_side ?? null,
        consecutive: { side: c.side ?? null, count: Number(c.count ?? 0), cap: Math.max(1, Number(c.cap ?? 2)) },
        squads: (a.squads ?? []).map((q) => ({ id: String(q.id), side: q.side, status: q.status ?? 'ready', unitIds: (q.unit_ids ?? []).map(String) })),
    };
}

// 유닛 -> 부대 키
export function squadKeyOf(unit, units = [], alt = null) {
    if (!unit) return null;
    const id = String(unit.id);
    const hit = alt?.squads?.find((q) => q.unitIds.includes(id));
    if (hit) return hit.id;
    if (unit.kind !== 'troop') return id;
    const l = unit.leader_id ?? unit.leaderId ?? null;
    return l != null && units.some((x) => String(x.id) === String(l)) ? String(l) : id;
}

export const squadById = (alt, id) => alt?.squads?.find((q) => q.id === String(id)) ?? null;

// 아군 유닛 선택 가능 여부(교대 on 전용).
// -> {ok:true, activate:boolean, squadId} | {ok:false, reason:'not_your_turn'|'locked'|'done'|'gone'|'acted', message}
export function altSelectCheck(alt, unit, units, mySide) {
    const squadId = squadKeyOf(unit, units, alt);
    if (!alt) return { ok: true, activate: false, squadId };
    if (alt.side !== mySide) return { ok: false, reason: 'not_your_turn', squadId, message: '지금은 상대 부대 차례입니다' };
    if (alt.activeSquad) {
        if (alt.activeSquad !== squadId) return { ok: false, reason: 'locked', squadId, message: '현재 활성 부대의 행동을 먼저 끝내세요' };
        if (unit.acted) return { ok: false, reason: 'acted', squadId, message: '이미 행동한 유닛입니다' };
        return { ok: true, activate: false, squadId };
    }
    const q = squadById(alt, squadId);
    const st = q?.status ?? 'ready';
    if (st === 'done') return { ok: false, reason: 'done', squadId, message: '이번 라운드에 이미 행동한 부대입니다' };
    if (st === 'gone') return { ok: false, reason: 'gone', squadId, message: '붕괴한 부대입니다' };
    if (unit.acted) return { ok: false, reason: 'acted', squadId, message: '이미 행동한 유닛입니다' };
    return { ok: true, activate: true, squadId };
}

// 이벤트 1개를 교대 상태에 반영(연출 시점 표시용 · 테스트용 reducer). 최종 상태는 항상 서버 뷰가 덮어쓴다.
export function altReduce(alt, e) {
    if (!alt || !e) return alt;
    const squads = alt.squads.map((q) => ({ ...q }));
    const find = (id) => squads.find((q) => q.id === String(id));
    const next = { ...alt, squads, consecutive: { ...alt.consecutive } };
    if (e.type === 'activation_start') {
        const q = find(e.actor_unit_id);
        if (q) { q.status = 'active'; if (Array.isArray(e.unit_ids)) q.unitIds = e.unit_ids.map(String); }
        next.activeSquad = String(e.actor_unit_id);
        next.side = e.side ?? next.side;
    } else if (e.type === 'activation_end') {
        const q = find(e.actor_unit_id);
        if (q) q.status = e.reason === 'collapse' ? 'gone' : 'done';
        next.activeSquad = null;
        const c = next.consecutive;
        next.consecutive = { ...c, side: e.side, count: c.side === e.side ? c.count + 1 : 1 };
        // 다음 차례: 상대 ready 가 있으면 상대, 없으면 같은 쪽(연속) — 라운드 종료는 round_end 가 알려 준다
        const other = e.side === 'a' ? 'b' : 'a';
        if (squads.some((x) => x.side === other && x.status === 'ready')) next.side = other;
    } else if (e.type === 'round_end') {
        squads.forEach((q) => { if (q.status === 'done' || q.status === 'active') q.status = 'ready'; });
        next.activeSquad = null;
        next.consecutive = { ...next.consecutive, side: null, count: 0 };
    } else if (e.type === 'turn_start') {
        next.round = Number(e.turn ?? next.round);
        next.side = e.side ?? next.side;
    } else if (e.type === 'collapse') {
        const q = find(e.target_unit_id);
        if (q) q.status = 'gone';
    }
    return next;
}

// HUD 요약: 내 부대 목록/상대 남은 부대 수/연속 카운터
export function altSummary(alt, mySide) {
    if (!alt) return null;
    const mine = alt.squads.filter((q) => q.side === mySide);
    const theirs = alt.squads.filter((q) => q.side !== mySide);
    const live = (q) => q.status !== 'gone';
    const c = alt.consecutive;
    return {
        round: alt.round,
        myTurn: alt.side === mySide,
        activeSquad: alt.activeSquad,
        mine,
        myReady: mine.filter((q) => q.status === 'ready').length,
        oppReady: theirs.filter((q) => q.status === 'ready').length,
        oppAlive: theirs.filter(live).length,
        streak: c.side && c.count > 0 ? { mine: c.side === mySide, count: c.count, cap: c.cap } : null,
    };
}
