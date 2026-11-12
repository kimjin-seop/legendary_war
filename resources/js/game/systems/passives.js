// 조건부 패시브(영웅 유닛 skills[{code, atk_pct?, def_pct?, when}]) 예측 계산 — 서버 app/Game/PassiveEffects::evaluate + Engine::skillContext 사본.
// 판정은 서버가 한다. 서버 규칙이 바뀌면 같이 고친다(WHEN_KEYS·조건 의미·인접 수 규칙).
// 인접 아군: 서버는 같은 편·본인 제외·맨해튼 거리 1 유닛을 state.units 에서 센다(격파·후퇴 유닛은 state 에서 제거됨) -> FE 는 hp > 0 만 센다.
import { dist, terrainCode } from './grid.js';

export const WHEN_KEYS = ['terrain', 'vs', 'hp_below_pct', 'counter', 'target_full_hp', 'moved', 'adjacent_allies'];
const whenSupported = (when) => !!when && typeof when === 'object' && !Array.isArray(when) && Object.keys(when).length > 0 && Object.keys(when).every((k) => WHEN_KEYS.includes(k));

// 서버 Engine::skillContext. owner 가 (ox,oy)에 있다고 보고 other 를 상대로. origin = 예측 시 FE 임시 이동 전 칸(store s.origin, 없으면 null)
export function skillContext(map, units, owner, ox, oy, other, counter, asAttacker, origin = null) {
    let adj = 0;
    (units ?? []).forEach((u) => { if (u && u.hp > 0 && u.side === owner.side && u.id !== owner.id && dist({ x: ox, y: oy }, u) === 1) adj += 1; });
    let moved = false;
    if (asAttacker && !counter) {
        const from = origin ?? { x: owner.x, y: owner.y }; // 서버: 가정 위치(ox,oy)가 현재 칸과 다르면 이동한 것으로 본다. FE 는 임시 이동 전 칸(origin)이 '현재 칸'
        const mf = Array.isArray(owner.move_from) ? owner.move_from : null;
        moved = ox !== from.x || oy !== from.y || (!!owner.moved && !!mf && (mf[0] !== ox || mf[1] !== oy));
    }
    const maxHp = Number(owner.max_hp ?? owner.maxHp) || 0;
    const oMax = Number(other.max_hp ?? other.maxHp) || 0;
    return {
        terrain: terrainCode(map, ox, oy), vs: other.type,
        hp_pct: maxHp > 0 ? owner.hp * 100 / maxHp : 100,
        counter: !!counter, target_full_hp: other.hp >= oMax, moved, adjacent: adj,
    };
}

// 서버 PassiveEffects::evaluate. role 'atk' | 'def' -> { pct, codes }
export function evaluatePassives(skills, role, ctx) {
    const key = role === 'atk' ? 'atk_pct' : 'def_pct';
    let pct = 0;
    const codes = [];
    (Array.isArray(skills) ? skills : []).forEach((s) => {
        const v = Number(s?.[key] ?? 0);
        if (!(v > 0) || !whenSupported(s.when)) return;
        let mul = 1;
        for (const [k, w] of Object.entries(s.when)) {
            const isNum = typeof w === 'number' || (typeof w === 'string' && w.trim() !== '' && Number.isFinite(Number(w)));
            const ok = k === 'terrain' ? Array.isArray(w) && w.includes(ctx.terrain)
                : k === 'vs' ? Array.isArray(w) && w.includes(ctx.vs)
                : k === 'hp_below_pct' ? isNum && (ctx.hp_pct ?? 100) <= Number(w)
                : k === 'counter' ? w === true && !!ctx.counter
                : k === 'target_full_hp' ? w === true && !!ctx.target_full_hp
                : k === 'moved' ? w === true && role === 'atk' && !!ctx.moved
                : k === 'adjacent_allies' ? isNum && Number(w) >= 1 && (ctx.adjacent ?? 0) >= 1
                : false;
            if (!ok) return;
            if (k === 'adjacent_allies') mul = Math.min(Math.trunc(Number(w)), Math.trunc(ctx.adjacent ?? 0));
        }
        pct += v * mul;
        codes.push(s.code);
    });
    return { pct, codes };
}

// 서버 Engine::buffAmount: 같은 스탯 버프 중 최댓값(중첩 아님)
export const buffAmount = (u, stat) => (Array.isArray(u?.buffs) ? u.buffs : []).reduce((n, b) => (b?.stat === stat ? Math.max(n, Math.trunc(Number(b.amount) || 0)) : n), 0);
