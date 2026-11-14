import { dist, terrainCode, rangeOf, moveTypeOf } from './grid.js';
import { auraAppliesTo } from './aura.js';
import { multiplier, terrainMod, terrainAttr, unitType, RULES } from '../data/rules.js';
import { flankOf } from './facing.js';
import { publicRules } from '../api/gameApi.js';
import { soldierCount } from './soldiers.js';
import { skillContext, evaluatePassives, buffAmount } from './passives.js';

// 전투 예측(참고용). 서버 app/Game/Engine.php::damageInfo 공식을 그대로 옮긴 것이며 판정은 서버가 한다.
// 서버 events 의 dmg/hp_after 와 다르면 서버 값을 우선한다(이 모듈 결과는 예측창 표시에만 사용).
//   total = 상성배율 x (1 + (오라 atk_pct + 패시브 atk_pct)/100) -> clamp[0.6,1.5]
//   raw = atk x total, defense = def x (1 + (오라 def_pct + 패시브 def_pct + 지형 def_pct)/100)
//   -> x 스노볼 -> x 방향(측면·배후, facing_cap) -> x 고지(facing_cap 공유) -> x 숲 엄폐(원거리) -> x 수상(수병 수상/육상·배 탑승, 증가분 facing_cap 공유)
//   defense 보정 합은 def_total_cap 상한, dmg = max(min, round((raw - defense) x dmg_mult)), min = max(1, round(atk x 0.15))
//   공격 가산 풀 = 오라 + 고정 패시브 + 조건부 패시브(systems/passives.js = PassiveEffects) + 액티브 버프(buffAmount) + 후공 보정(second_atk_pct). 방어 풀도 같은 순서
//   규칙 값은 /api/profile rules(publicRules, config 기준) 위에 전투 view rules_effective(맵/스테이지 오버라이드 + first_side, 있을 때만)를 덮어 쓴다
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// [atk_pct, def_pct]: 같은 진영 지휘관 오라 반경 내 합산
export function auraBonus(units, unit, x, y) {
    let atk = 0;
    let def = 0;
    units.forEach((c) => {
        if (auraAppliesTo(c, unit) && dist({ x, y }, c) <= c.aura.radius) { // 적용 대상 판정은 systems/aura.js 한 곳
            atk += c.aura.atk_pct ?? 0;
            def += c.aura.def_pct ?? 0;
        }
    });
    return [atk, def];
}

export { auraSources } from './aura.js'; // 호환용 재노출

// 전투 화면에서 받은 규칙(battleApi.profile().rules). 로비를 거치지 않은 진입 대비(publicRules 가 null 일 때)
let battleRules = null;
export function setForecastRules(r) { if (r && typeof r === 'object') battleRules = r; }

// 스노볼(병력 우위) 보너스: 서버 Engine::snowBonus 와 동일(basis hp|units, dead, slope, cap, hero_factor)
function snowBonus(sb, units, att) {
    if (!sb || typeof sb !== 'object') return 0;
    let own = 0; let en = 0;
    units.forEach((u) => { if (u.hp <= 0) return; const v = (sb.basis ?? 'hp') === 'units' ? 1 : u.hp; if (u.side === att.side) own += v; else en += v; });
    const bonus = Math.min(Number(sb.cap) || 0, Math.max(0, own / Math.max(en, 1e-6) - 1 - (Number(sb.dead) || 0)) * (Number(sb.slope) || 0));
    return att.kind === 'troop' ? bonus : bonus * (Number(sb.hero_factor) || 1);
}

// ctx(선택): { origin: 공격자 임시 이동 전 칸, alternate: 교대 행동 전투 여부, firstSide: 선공 진영(기본 'a'), rules: 전투 view rules_effective(맵 오버라이드 + first_side) }
export function damageInfo(map, units, att, ax, ay, def, counter = false, ctx = {}) {
    const R = { ...(publicRules() ?? battleRules ?? {}), ...(ctx.rules ?? {}) }; // 오버라이드가 있으면 공개 규칙 위에 덮어 씀(facing_mult 는 서버가 기본과 병합해 보냄)
    const mult = multiplier(att.type, def.type);
    const terrain = terrainCode(map, def.x, def.y);
    const tdef = terrainMod(terrain, moveTypeOf(def)).def_pct;
    let [aAtk] = auraBonus(units, att, ax, ay);
    let [, dDef] = auraBonus(units, def, def.x, def.y);
    if (RULES.passive_skills) {
        aAtk += att.passive?.atk_pct ?? 0;
        dDef += def.passive?.def_pct ?? 0;
        // 조건부 패시브(서버 Engine::damageInfo 와 같은 위치·풀): 공격 측 atk, 방어 측 def
        if (Array.isArray(att.skills) && att.skills.length) aAtk += evaluatePassives(att.skills, 'atk', skillContext(map, units, att, ax, ay, def, counter, true, counter ? null : ctx.origin)).pct;
        if (Array.isArray(def.skills) && def.skills.length) dDef += evaluatePassives(def.skills, 'def', skillContext(map, units, def, def.x, def.y, att, counter, false)).pct;
    }
    aAtk += buffAmount(att, 'atk'); // 액티브 버프(같은 가산 풀, 반격에도 적용)
    dDef += buffAmount(def, 'def');
    const sap = Number(R.second_atk_pct) || 0; // 후공 진영 보정(교대 행동 전투에서는 무시)
    if (sap > 0 && !ctx.alternate && att.side !== (ctx.rules?.first_side ?? ctx.firstSide ?? 'a')) aAtk += sap;
    let total = mult * (1 + aAtk / 100);
    if (RULES.clamp) total = clamp(total, RULES.clamp[0], RULES.clamp[1]);
    const snow = snowBonus(R.snowball, units, att);
    if (snow > 0) total *= 1 + snow;
    const fcap = Number(R.facing_cap) || 1.8;
    const flank = counter || R.facing === false ? 'none' : flankOf(ax, ay, def);
    if (flank !== 'none') {
        // 병종 v2 E2: 암살자는 assassin_facing_mult({side,back}, 없으면 off)를 일반 facing_mult 위에 덮어 씀(facing_cap 공유). 서버 Engine::damageInfo 와 같은 위치
        const am = att.type === 'assassin' && R.assassin_facing_mult && typeof R.assassin_facing_mult === 'object' ? R.assassin_facing_mult : null;
        const fm = am?.[flank] != null ? am[flank] : R.facing_mult?.[flank];
        total = Math.max(total, Math.min(fcap, total * (Number(fm) || 1)));
    }
    const hg = Number(R.highground_mult) || 1;
    if (hg > 1 && terrainAttr(terrainCode(map, ax, ay), 'elevation') > terrainAttr(terrain, 'elevation')) total = Math.max(total, Math.min(fcap, total * hg));
    const cv = Number(R.forest_cover_mult) || 1;
    if (cv < 1 && terrainAttr(terrain, 'cover') > 0 && (unitType(att.type)?.range_max ?? 1) >= 2 && !(R.forest_cover_exclude_ranged_target && (unitType(def.type)?.range_max ?? 1) >= 2)) total *= cv;
    // 수상 규칙(서버 Engine::damageInfo 와 같은 순서·조건, 옵션 1.0 = off): 공격자가 수병이면 공격자 칸이 수상(terrains.water)일 때 naval_water_atk_mult, 아니면 naval_land_atk_mult.
    // 수병이 아니고 배 탑승 상태(공격자 칸 boarding + foot/mounted/heavy)면 boarded_atk_mult. 증가분은 facing_cap 공유, 감소는 그대로 곱. 반격(counter=true)도 같은 함수라 동일 적용
    let wMult = 1;
    const attMove = unitType(att.type)?.move_type;
    const attTerrain = terrainCode(map, ax, ay);
    if (attMove === 'naval') wMult *= Number(terrainAttr(attTerrain, 'water') > 0 ? R.naval_water_atk_mult : R.naval_land_atk_mult) || 1;
    else if (terrainAttr(attTerrain, 'boarding') > 0 && ['foot', 'mounted', 'heavy'].includes(attMove)) wMult *= Number(R.boarded_atk_mult) || 1;
    if (wMult > 1) total = Math.max(total, Math.min(fcap, total * wMult));
    else if (wMult < 1) total *= wMult;
    let defTotal = dDef + tdef;
    const dcap = Number(R.def_total_cap) || 0;
    if (dcap > 0 && defTotal > dcap) defTotal = dcap;
    const raw = att.atk * total;
    // 병종 v2 E1: 마법사 공격은 대상 기본 방어(def)의 N%(mage_def_ignore_pct, 없으면 0)를 무시. 지형·오라 방어 보정(defTotal)은 그대로
    const ign = att.type === 'mage' ? clamp(Number(R.mage_def_ignore_pct) || 0, 0, 100) : 0;
    const defense = def.def * (1 - ign / 100) * (1 + defTotal / 100);
    const minDmg = RULES.min_damage_pct > 0 ? Math.max(1, Math.round(att.atk * RULES.min_damage_pct)) : 1;
    const dm = Number(R.dmg_mult) || 1;
    return {
        dmg: Math.max(minDmg, Math.round((raw - defense) * dm)), multiplier: mult,
        affinity: mult > 1 ? 'adv' : mult < 1 ? 'dis' : 'none', terrain, terrain_def_pct: tdef, flank,
    };
}

export const affToNum = (a) => (a === 'adv' ? 1 : a === 'dis' ? -1 : 0);

// 반격 규칙(서버와 동일): ranged_counter off 이면 근접(사거리 최대 1)끼리 거리 1일 때만
export function canCounter(att, def) {
    const a = rangeOf(att);
    const d = rangeOf(def);
    const dd = dist(att, def);
    return RULES.ranged_counter ? dd >= d.rmin && dd <= d.rmax : a.rmax === 1 && d.rmax === 1 && dd === 1;
}

// {attackerId, defenderId, dmg, aff, affinity, terrain, terrain_def_pct, remaining, counter:{dmg, remaining}|null, hit:null(서버에 명중 개념 없음)}
// opts.powerPct: 액티브 스킬 위력(%). 서버 Engine::doAttack 과 같이 일반 피해식 결과에 x power_pct/100(최소 1). 반격은 일반 피해식 그대로
// opts.viaSkill: 스킬 공격이면 돌진(surge) 배율을 쓰지 않는다. opts.origin/alternate/firstSide: damageInfo ctx
// opts.micro: 서버 병사 미시 교전(micro_mode 'on') 전투. 동시 교전이라 방어자가 격파돼도 공격자 손실(반격) 가능 -> 격파 예상이어도 '반격 없음'을 단정하지 않는다(microCounter = true, 수치 예측은 안 함)
export function forecast(map, units, att, def, { powerPct, viaSkill = false, origin = null, alternate = false, firstSide = 'a', rules = null, micro = false } = {}) {
    const ctx = { origin, alternate, firstSide, rules };
    const main = damageInfo(map, units, att, att.x, att.y, def, false, ctx);
    // 서버 doAttack: 일반 공격이고 돌진(surge) skill_attack_pct > 100 이면 그 배율(그 턴 첫 일반 공격), 아니면 스킬 위력
    const surge = !viaSkill && Number(att.skill_attack_pct) > 100 ? Math.trunc(Number(att.skill_attack_pct)) / 100 : 0;
    const pm = surge || (Number(powerPct) > 0 ? Math.max(0.1, Number(powerPct) / 100) : 1);
    if (pm !== 1) main.dmg = Math.max(1, Math.round(main.dmg * pm));
    const remaining = Math.max(0, def.hp - main.dmg);
    let counter = null;
    if (remaining > 0 && canCounter(att, def)) {
        const c = damageInfo(map, units, def, def.x, def.y, att, true, ctx); // 반격은 정면 취급(방향 보정 없음)
        const cRem = Math.max(0, att.hp - c.dmg);
        counter = { dmg: c.dmg, remaining: cRem, hit: null, troop: troopForecast(att, cRem) };
    }
    const microCounter = !!micro && !counter && remaining === 0 && canCounter(att, def); // MICRO_COMBAT_SPEC: 격파여도 동시 교전 피해 가능
    return { attackerId: att.id, defenderId: def.id, attType: att.type, defType: def.type, ...main, aff: affToNum(main.affinity), remaining, counter, microCounter, hit: null, estimated: true, troop: troopForecast(def, remaining) };
}

// 예측 HP -> 병력 단계(화면 표기용 {before, after, loss}). 단계 변환은 systems/soldiers 한 곳
function troopForecast(u, hpAfter) {
    const before = soldierCount(u);
    const after = Math.min(before, soldierCount(u, hpAfter));
    return { before, after, loss: before - after };
}
