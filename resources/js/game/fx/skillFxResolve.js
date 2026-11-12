import { SKILL_FX_BY_CODE } from '../data/skillFxMap.js';

// 스킬 이펙트 시트 키 해석(순수 함수, Phaser 의존 없음 — tools/build_skill_fx_map.mjs --check 도 같은 함수로 대조).
// 해석 순서(안아트 skill_fx_request.json resolve_order):
//  1) 스킬 코드 표(SKILL_FX_BY_CODE)  2) fx.skill.<fx_family>.<fx_variant>  3) 계열 기본값(buff = stat, heal = radius 분기)
//  has(logical) 가 false 인 후보는 건너뛴다. 모두 없으면 null(호출 측은 기존 코드 드로잉으로 폴백)
const FAMILY_DEFAULT = {
    strike: 'strike.base', aoe: 'aoe.base', pierce: 'pierce.base', surge: 'surge.base', stance: 'stance.base', decoy: 'decoy.base',
};
const BUFF_DEFAULT = { atk: 'buff.atk', def: 'buff.def', move: 'surge.base' };
// 서버 template -> 계열(서버가 fx_family 를 안 보내는 구 응답 대비, Engine::ACTIVE_TEMPLATES 와 같은 표)
const TEMPLATE_FAMILY = { T_ACTIVE_STRIKE: 'strike', T_ACTIVE_AOE: 'aoe', T_ACTIVE_BUFF: 'buff', T_ACTIVE_HEAL: 'heal', T_ACTIVE_SURGE: 'surge', T_ACTIVE_PIERCE: 'pierce', T_ACTIVE_STANCE: 'stance', T_ACTIVE_DECOY: 'decoy' };

export const skillFxFamily = ({ family, kind, template } = {}) => family ?? TEMPLATE_FAMILY[template] ?? kind ?? null;

export function resolveSkillFxKey({ code = null, family = null, variant = null, kind = null, template = null, stat = null, radius = null } = {}, has = () => true) {
    const fam = skillFxFamily({ family, kind, template });
    const cands = [];
    if (code && SKILL_FX_BY_CODE[code]) cands.push(SKILL_FX_BY_CODE[code]);
    if (fam && variant) cands.push(`${fam}.${variant}`);
    if (fam === 'buff') cands.push(BUFF_DEFAULT[stat] ?? 'buff.holy');
    else if (fam === 'heal') cands.push(Number(radius) > 0 ? 'heal.area' : 'heal.single');
    else if (fam && FAMILY_DEFAULT[fam]) cands.push(FAMILY_DEFAULT[fam]);
    for (const c of cands) { const k = `fx.skill.${c}`; if (has(k)) return k; }
    return null;
}
