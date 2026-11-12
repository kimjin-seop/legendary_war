import { tween, isInstant } from '../ui/motion.js';
import { TILE } from '../UnitView.js';
import { loaded, manifestHas, texKey, ensureSkillFx, skillFxFailed } from '../assets.js';
import { resolveSkillFxKey, skillFxFamily } from './skillFxResolve.js';
import { activeSkillsOf } from '../systems/skills.js';

// 영웅 스킬 이펙트 시트(안아트 fx.skill.<계열>.<변형>, spritesheet 1회 재생) 월드 재생. 판정·데미지 숫자·히트스톱은 건드리지 않는다(SkillFx.js 원칙).
// - 시트가 없거나(manifest 미등록·로드 전·로드 실패) 연출 끄기/스킵이면 아무것도 만들지 않고 false -> 호출 측이 기존 코드 드로잉(SkillFx.js)으로 폴백
// - 큐를 붙잡지 않는다(비차단 장식). 재생 길이는 maxMs 로 상한(프레임이 많은 시트는 fps 를 올림) -> 턴 템포 불변
// - 시간은 motion.tween(배속·스킵 스냅·슬로모션/히트스톱 timeScale 반영)
// - 컷신(BattleCutscene) 재생 교전은 컷신 안 기존 임팩트를 쓰고 여기서는 재생하지 않는다(FxManager 분기)
export const SKILL_SHEET = {
    scale: TILE / 64, // 1 이펙트 px = 64px 유닛 시트 1 px. 전장 유닛은 52px 표시 -> 같은 배율
    maxMs: 700, // 1배속 기준 재생 상한(기존 스킬 임팩트 링 340ms + 히트스톱 구간 안팎)
    footK: 0.42, // 유닛 발밑 = 칸 중심 + TILE x footK
    bodyPx: 26, headPx: 56, aoePx: 12, // 발밑에서 위로(64px 시트 기준 px, scale 곱함)
    pierceSidePx: 12, // 관통 타격점: 대상 몸통에서 시전자 쪽으로
};

// 키별 앵커 위치(spec playback.*.anchor): 'body' | 'foot' | 'head' | 'aoe'
export const anchorMode = (logical) => {
    const v = logical.replace(/^fx\.skill\./, '');
    if (/^strike\.(thunder|water_ice|water)$/.test(v)) return 'foot';
    if (/^(strike|pierce)\./.test(v)) return 'body';
    if (/^aoe\./.test(v)) return 'aoe';
    if (v === 'buff.rally') return 'head';
    if (/^passive\./.test(v)) return 'head';
    return 'foot';
};
// 좌우 방향이 있는 시트(facing right): 시전자가 대상 오른쪽에 있으면 flipX
const FLIP_KEYS = /^fx\.skill\.(strike\.(base|charge|press|resolve|snipe|longbow|volley)|pierce\.[a-z_]+|aoe\.base)$/; // 2026-11-08 배치 E 방향성 strike 변형 추가

const sheetInfo = (logical) => loaded.manifest?.[logical] ?? null;
export const skillSheetReady = (scene, logical) => !!logical && scene.textures.exists(texKey(logical)) && !skillFxFailed(logical);

// 스킬 정보(battleStore pendingSkill / skillUse 이벤트) -> manifest 키(없으면 null)
export const skillSheetKey = (sk) => (sk ? resolveSkillFxKey({ code: sk.code, family: sk.fxFamily, variant: sk.fxVariant, kind: sk.kind, template: sk.template, stat: sk.stat, radius: sk.radius }, manifestHas) : null);

// 전투 진입 시 전장 유닛 액티브 스킬의 시트만 지연 로드(일괄 큐 제외, assets.ensureSkillFx). 시전 시점에 아직 없으면 그 회차만 코드 드로잉
export function preloadSkillFx(scene, units) {
    const keys = new Set();
    (units ?? []).forEach((u) => activeSkillsOf(u).forEach((s) => {
        const p = s?.params ?? {};
        const k = resolveSkillFxKey({ code: s?.code, template: s?.template, kind: s?.kind, stat: p.stat ?? s?.stat, radius: p.radius ?? s?.radius }, manifestHas);
        if (k) keys.add(k);
    }));
    if (keys.size) ensureSkillFx(scene, [...keys]);
    return keys.size;
}

// 뷰(UnitView) 기준 앵커 좌표
export function anchorPoint(view, mode, center = null) {
    const S = SKILL_SHEET;
    const cx = center ? center.x * TILE + TILE / 2 : view.c.x;
    const cy = center ? center.y * TILE + TILE / 2 : view.c.y;
    const foot = cy + TILE * S.footK;
    if (mode === 'body') return { x: cx, y: foot - S.bodyPx * S.scale };
    if (mode === 'head') return { x: cx, y: foot - S.headPx * S.scale };
    if (mode === 'aoe') return { x: cx, y: foot - S.aoePx * S.scale };
    return { x: cx, y: foot };
}

// 시트 1회 재생(x, y = 앵커 지점, 월드 좌표). layer 기본 = fxm.d.worldFx(유닛 위). 반환: 재생했으면 true
export function playSkillSheet(fxm, logical, x, y, { flipX = false, layer = null, scaleMul = 1 } = {}) {
    const sc = fxm?.scene;
    const ly = layer ?? fxm?.d?.worldFx;
    if (!sc || !ly || !logical || isInstant()) return false;
    if (!skillSheetReady(sc, logical)) { ensureSkillFx(sc, [logical]); return false; } // 다음 시전부터 재생(이번은 폴백)
    const v = sheetInfo(logical) ?? {};
    const key = texKey(logical);
    const total = Math.max(1, (sc.textures.get(key)?.frameTotal ?? 1) - 1); // frameTotal 은 __BASE 포함
    const frames = Math.max(1, Math.min(total, Number(v.frames) || total));
    const fps = Math.max(Number(v.fps_hint) || 14, (frames * 1000) / SKILL_SHEET.maxMs);
    const ox = Number(v.anchor?.originX); const oy = Number(v.anchor?.originY);
    const img = sc.add.image(x, y, key, 0).setOrigin(Number.isFinite(ox) ? ox : 0.5, Number.isFinite(oy) ? oy : 0.5).setScale(SKILL_SHEET.scale * scaleMul).setFlipX(!!flipX);
    if (flipX && Number.isFinite(ox)) img.setOrigin(1 - ox, img.originY); // 뒤집으면 앵커도 좌우 대칭
    ly.add(img);
    const p = { f: 0 };
    tween(sc, {
        targets: p, to: { f: frames }, duration: (frames * 1000) / fps, ease: 'Linear',
        onUpdate: () => { if (img.scene) img.setFrame(Math.min(frames - 1, Math.floor(p.f))); },
        onComplete: () => { if (img.scene) img.destroy(); }, // 마지막 프레임이 빈칸이라 끝나면 제거
    });
    return true;
}

// 액티브 스킬 시트 재생 진입점. phase:
//  'cast'   = skill_use 시점(시전자/대상 기준 계열: buff·surge·stance·decoy·heal)
//  'impact' = 주 대상 타격 순간(strike·pierce·aoe). a = 시전자 뷰, t = 대상 뷰
// 반환: 재생했으면 true(호출 측은 같은 역할의 코드 드로잉을 생략)
const CAST_FAMILIES = new Set(['buff', 'surge', 'stance', 'decoy', 'heal']);
const IMPACT_FAMILIES = new Set(['strike', 'pierce', 'aoe']);
export function playSkillFx(fxm, sk, phase, a, t = null) {
    if (!sk) return false;
    const fam = skillFxFamily({ family: sk.fxFamily, kind: sk.kind, template: sk.template });
    if (phase === 'cast' ? !CAST_FAMILIES.has(fam) : !IMPACT_FAMILIES.has(fam)) return false;
    const logical = skillSheetKey(sk);
    if (!logical) return false;
    const mode = anchorMode(logical);
    const heal = fam === 'heal';
    const base = heal ? (t ?? a) : (phase === 'impact' ? t : a);
    if (!base) return false;
    const center = mode === 'aoe' && Array.isArray(sk.center) ? { x: Number(sk.center[0]), y: Number(sk.center[1]) } : null;
    const pt = anchorPoint(base, mode, center);
    let flipX = false;
    if (FLIP_KEYS.test(logical) && a && t) flipX = a.c.x > t.c.x; // 시전자가 오른쪽 = 왼쪽을 향함
    if (/^fx\.skill\.pierce\./.test(logical) && a && t) pt.x += (a.c.x > t.c.x ? 1 : -1) * SKILL_SHEET.pierceSidePx * SKILL_SHEET.scale;
    return playSkillSheet(fxm, logical, pt.x, pt.y, { flipX });
}
