import { loaded, ensureSkinTexture } from '../assets.js';
import { L } from '../layout.js';
import { typeAlias } from '../data/rules.js';

// 스킬 아이콘(안아트 atlas.skill_icons, textureKey 'skill_icons', scope 'skill' 지연 로드, NEAREST — assets.pixelKeys).
// 프레임 이름 skill.<code>. 해상도: assets.skinFiles 가 고해상도 = @2x(96px 칸, unitPx 2) / 저해상도 = variants['1x'](48px 칸, unitPx 1).
// 폴백(public/assets/skill_icons/skill_icon_map.json rules.fallback):
//   skill.<code> -> 액티브: skill.default_<병종> / 패시브: 계열 skill.sh_atk_m|sh_def_m|sh_heal_m|sh_hyb_m / 오라: skill.aura_both -> null(아이콘 칸 숨김, 빈 사각 금지)
export const SKILL_ATLAS = 'skill_icons';
const BASE_CELL = 48; // @1x 칸 px(unitPx 배수가 실제 프레임 크기)

// 템플릿 -> 계열(skill_icon_map.json rules.category_by_template 사본, 패시브 폴백용)
const CAT_BY_TPL = {
    T_ACTIVE_AOE: 'atk', T_ACTIVE_STRIKE: 'atk', T_ATK_UP: 'atk', T_AURA_ATK: 'atk', T_CHARGE: 'atk', T_COUNTER_ATK: 'atk', T_FIRST_STRIKE: 'atk', T_PURSUIT: 'atk', T_SIEGE_ATK: 'atk', T_VS_TYPE_ATK: 'atk',
    T_AURA_DEF: 'def', T_DEF_UP: 'def', T_TERRAIN_DEF: 'def',
    T_ACTIVE_HEAL: 'heal', T_HEAL_UP: 'heal', T_REGEN: 'heal',
};
const PASSIVE_FB = { atk: 'sh_atk_m', def: 'sh_def_m', heal: 'sh_heal_m' }; // 그 외 계열 -> sh_hyb_m
const UNIT_ALIAS = { sailor: 'naval', flying: 'flyer' }; // default_<병종> 프레임: sword spear cavalry archer mage healer heavy naval flyer
// 병종 v2 임시 아이콘 별칭(전용 default_<병종> 프레임이 없을 때만 다음 후보): assassin -> archer, monster -> cavalry(팀장 지시 2026-11-03)
const UNIT_ICON_FALLBACK = { assassin: 'archer', monster: 'cavalry' };

export const skillIconsListed = () => !!loaded.deferred?.[SKILL_ATLAS]; // manifest 에 아틀라스 등록 여부
export const skillIconsReady = (scene) => !!scene?.textures?.exists(SKILL_ATLAS);
const has = (scene, f) => scene.textures.get(SKILL_ATLAS).has(f);

// 지연 로드(이미 있거나 manifest 에 없으면 즉시 cb). 중복 요청은 ensureScope 가 이미 큐에 있는 텍스처를 건너뛴다
export function ensureSkillIcons(scene, cb) {
    if (skillIconsReady(scene) || !skillIconsListed()) { cb?.(skillIconsReady(scene)); return; }
    ensureSkinTexture(scene, SKILL_ATLAS, () => cb?.(skillIconsReady(scene)));
}

// 프레임 이름 해석. kind: 'active' | 'passive' | 'aura'(생략 시 aura_/au_ 접두사면 오라, 아니면 패시브). 아틀라스 미로드/전부 없음 -> null
export function skillIconFrame(scene, code, { kind, unitType, template, category } = {}) {
    if (!skillIconsReady(scene)) return null;
    const c = code ? String(code) : '';
    const k = kind ?? (/^(aura_|au_)/.test(c) ? 'aura' : 'passive');
    const cand = [];
    if (c) cand.push(`skill.${c}`);
    if (k === 'active') { const t = UNIT_ALIAS[unitType] ?? unitType; if (t) [t, typeAlias(t), UNIT_ICON_FALLBACK[t]].filter(Boolean).forEach((x) => cand.push(`skill.default_${x}`)); } // 자기 병종 -> 서버 별칭(heavy -> sword) -> 임시 별칭
    else if (k === 'aura') cand.push('skill.aura_both');
    else cand.push(`skill.${PASSIVE_FB[category ?? CAT_BY_TPL[template]] ?? 'sh_hyb_m'}`);
    return cand.find((f) => has(scene, f)) ?? null;
}

// 아이콘 이미지(원점 0.5). size = 목표 표시 크기(unit). frame 없으면 null
// 도트 선명도: 카메라 zoom = L.u(unit -> 백킹 px) 이므로 프레임 칸(@2x 96 | @1x 48) -> 백킹 px 배율 k = size * L.u / cell 이
// 비정수(예: DPR 3 에서 24 -> @2x 0.75배)면 NEAREST 도트가 불규칙해진다. k 를 정수 또는 0.5/0.25 로 맞춘다(PixelBadge 와 같은 방식).
// 레이아웃 침범 방지: 목표의 1.2배를 넘지 않는 가장 큰 후보(최소 0.25). 예: k 0.75 -> 0.5, 1.5 -> 1, 0.45 -> 0.5, 2 -> 2
const snapIconK = (k) => { const lim = k * 1.2; if (lim >= 1) return Math.max(1, Math.floor(lim)); return lim >= 0.5 ? 0.5 : 0.25; };
export function skillIconImage(scene, frame, x, y, size) {
    if (!frame || !skillIconsReady(scene) || !has(scene, frame)) return null;
    const cell = BASE_CELL * (Number(loaded.unitPx?.[SKILL_ATLAS]) || 2);
    const u = Number(L.u) || 1;
    return scene.add.image(x, y, SKILL_ATLAS, frame).setScale(snapIconK((size * u) / cell) / u);
}
