import Phaser from 'phaser';
import { COLOR, CSS } from '../theme.js';
import { makeText, fitText } from './common.js';
import { slice } from './skin.js';
import { soldierCount } from '../systems/soldiers.js';
import { unitClassName } from '../systems/names.js';
import { matchupOf } from '../data/rules.js';
import { auraName } from '../systems/glossary.js';
import { troopIcon } from './GameIcons.js';
import { withVer } from '../assetVersion.js';

// 전투 유닛 정보 툴팁(2026-11-14 재구성, 사용자 '텍스트만 나열돼 난잡'). 시안 = public/assets/ui/tooltip/qa/tooltip_mock_x1.png
//  헤더(병종 뱃지 + 이름) -> 병력 줄(tip.troops · '병력' · 10칸 pip · n/10) -> 구분선 -> '받는 효과' 칩 + 효과 한 줄씩(오라 아이콘 · 효과명 · 공(주황)/방(청록) · 출처·거리 회색 오른쪽)
//  -> 구분선 -> 상성 2열('유리' 청록 칩 + adv_up + 병종 + 배율 / '불리' 적색 칩 + adv_down + 병종 + 배율) -> 맨 아래 '주의' 띠(남색 + tip.warn + 적색 문구)
// 아이콘 = 안아트 tip.*(public/assets/ui/tooltip/x2|x3, manifest 미병합이라 경로로 직접 지연 로드, NEAREST). 아직 없으면 코드 도형 폴백(다음 툴팁부터 이미지)
// 입력 없음(클릭은 아래 맵으로). 공개 필드 tw/th(Battle.updateHoverTip 배치용)는 기존 UnitTip 과 같다
const ICONS = {
    'tip.adv_up': 'adv_up', 'tip.adv_down': 'adv_down', 'tip.warn': 'warn', 'tip.aura': 'aura', 'tip.troops': 'troops',
    'tip.pip.ally': 'pip_ally', 'tip.pip.enemy': 'pip_enemy', 'tip.pip.empty': 'pip_empty',
    'tip.chip.gold': 'chip_gold', 'tip.chip.teal': 'chip_teal', 'tip.chip.red': 'chip_red',
    'tip.divider.cap_l': 'divider_cap_l', 'tip.divider.line': 'divider_line', 'tip.divider.gem': 'divider_gem', 'tip.divider.cap_r': 'divider_cap_r',
};
const texOf = (k) => `uitip_${k.replace(/\./g, '_')}`;
let loading = false;
function ensureTipTextures(scene) {
    if (loading || !scene?.load) return;
    const dir = (globalThis.devicePixelRatio ?? 1) >= 2.5 ? 'x3' : 'x2';
    const need = Object.entries(ICONS).filter(([k]) => !scene.textures.exists(texOf(k)));
    if (!need.length) return;
    loading = true;
    const release = () => { loading = false; };
    scene.events?.once('shutdown', release); scene.events?.once('destroy', release); // 로드 중 씬이 끝나면 플래그 고착 방지(다음 씬에서 다시 요청)
    need.forEach(([k, f]) => scene.load.image(texOf(k), withVer(`/assets/ui/tooltip/${dir}/${f}.png`)));
    scene.load.once('complete', () => {
        loading = false;
        scene.events?.off('shutdown', release); scene.events?.off('destroy', release);
        need.forEach(([k]) => { const t = scene.textures?.exists(texOf(k)) ? scene.textures.get(texOf(k)) : null; t?.setFilter?.(Phaser.Textures.FilterMode.NEAREST); }); // 텍스처는 게임 전역이라 씬 상태와 무관하게 필터 지정
    });
    scene.load.start();
}
const has = (scene, k) => scene.textures.exists(texOf(k));
const img = (scene, k, x, y, w, h, origin = [0, 0.5]) => (has(scene, k) ? scene.add.image(x, y, texOf(k)).setOrigin(...origin).setDisplaySize(w, h) : null);

const S = 1.5; // 아이콘 표시 배율(기준 12px -> 18)
const C_ATK = '#f08a55'; const C_DEF = '#4fd1c1'; const C_GRAY = '#9AA3B5'; const C_RED = '#ff8f80'; const C_TEAL = '#4fd1c1';

export class UnitInfoTip extends Phaser.GameObjects.Container {
    // o: { unit, name, effects[{name, atk, def, src, dist, own}], ownAura({name, radius, atk, def})|null, maxW }
    constructor(scene, { unit, name, effects = [], ownAura = null, maxW = 280 }) {
        super(scene, 0, 0);
        ensureTipTextures(scene);
        const W = Math.max(200, Math.min(280, maxW)); const pad = 12; const inner = W - pad * 2;
        const items = []; let y = pad;
        const ally = unit.team === 'ally';
        // 헤더: 병종 뱃지 + 이름
        const badge = troopIcon(scene, unit.type, pad + 11, y + 11, 22, { max: 24 });
        if (badge) items.push(badge);
        items.push(fitText(makeText(scene, pad + 28, y + 11, name ?? unit.name ?? '', { size: 15, heading: true, color: '#FFF6E0', origin: [0, 0.5] }), inner - 28));
        y += 28;
        // 병력: 아이콘 · '병력' · 10칸 pip · n/10
        const n = soldierCount(unit); const max = 10;
        const ti = img(scene, 'tip.troops', pad, y + 9, 12 * S, 12 * S); if (ti) items.push(ti);
        items.push(makeText(scene, pad + 22, y + 9, '병력', { size: 12, bold: true, color: CSS.text, origin: [0, 0.5] }));
        const px0 = pad + 58; const pw = 5 * S; const ph = 8 * S; const gap = 2;
        const g = scene.add.graphics(); items.push(g);
        for (let i = 0; i < max; i += 1) {
            const k = i < n ? (ally ? 'tip.pip.ally' : 'tip.pip.enemy') : 'tip.pip.empty';
            const im = img(scene, k, px0 + i * (pw + gap), y + 9, pw, ph);
            if (im) items.push(im); else g.fillStyle(i < n ? (ally ? 0x4fd1c1 : 0xe0483a) : 0x2a3142, 1).fillRect(px0 + i * (pw + gap), y + 9 - ph / 2, pw, ph);
        }
        items.push(makeText(scene, px0 + max * (pw + gap) + 4, y + 9, `${n}/${max}`, { size: 12, bold: true, color: n <= 3 ? C_RED : ally ? C_TEAL : '#FFD9B0', origin: [0, 0.5] }));
        y += 22;
        const divider = () => {
            const dy = y + 4;
            const parts = [img(scene, 'tip.divider.cap_l', pad, dy, 6 * S, 7 * S), img(scene, 'tip.divider.line', pad + 6 * S, dy, inner - 12 * S, 7 * S), img(scene, 'tip.divider.gem', pad + inner / 2 - 4.5 * S, dy, 9 * S, 7 * S), img(scene, 'tip.divider.cap_r', pad + inner - 6 * S, dy, 6 * S, 7 * S)];
            if (parts.every(Boolean)) items.push(...parts);
            else { parts.forEach((p) => p?.destroy()); g.lineStyle(1, COLOR.accent, 0.7).lineBetween(pad, dy, pad + inner, dy).fillStyle(COLOR.accent, 1).fillCircle(pad + inner / 2, dy, 2.5); }
            y += 12;
        };
        const chip = (key, label, x, cy, color) => {
            const t = makeText(scene, 0, cy, label, { size: 11, bold: true, color, origin: [0.5, 0.5] });
            const cw = Math.max(32 * S, t.width + 14); const im = img(scene, key, x, cy, cw, 12 * S);
            if (im) items.push(im); else g.lineStyle(1, Phaser.Display.Color.HexStringToColor(color).color, 1).strokeRoundedRect(x, cy - 9, cw, 18, 4);
            t.setX(x + cw / 2); items.push(t); return cw;
        };
        // 받는 효과(+ 보유 오라)
        if (effects.length || ownAura) {
            divider();
            chip('tip.chip.gold', '받는 효과', pad, y + 9, '#F6D98C'); y += 24;
            const rows = [...(ownAura ? [{ ...ownAura, src: `보유 오라 · 반경 ${ownAura.radius ?? '?'}칸`, own: true }] : []), ...effects];
            rows.slice(0, 4).forEach((e) => {
                const ai = img(scene, 'tip.aura', pad, y + 8, 12 * S, 12 * S); if (ai) items.push(ai);
                let x = pad + 22;
                const nt = makeText(scene, x, y + 8, e.name ?? '', { size: 12, bold: true, color: CSS.text, origin: [0, 0.5] }); items.push(nt); x += nt.width + 6;
                if (e.atk) { const t = makeText(scene, x, y + 8, `공+${e.atk}%`, { size: 12, bold: true, color: C_ATK, origin: [0, 0.5] }); items.push(t); x += t.width + 4; }
                if (e.def) { const t = makeText(scene, x, y + 8, `방+${e.def}%`, { size: 12, bold: true, color: C_DEF, origin: [0, 0.5] }); items.push(t); x += t.width + 4; }
                const src = e.src ?? '';
                if (src) items.push(fitText(makeText(scene, pad + inner, y + 8, src, { size: 11, color: C_GRAY, origin: [1, 0.5] }), Math.max(30, pad + inner - x - 4)));
                y += 20;
            });
        }
        // 상성 2열
        const mo = unit.type ? matchupOf(unit.type) : { strong: [], weak: [], threats: [] };
        if (mo.strong.length || mo.weak.length) {
            divider();
            const colW = inner / 2; const y0 = y;
            const col = (list, x, key, label, color, arrow, mcol) => {
                let yy = y0; chip(key, label, x, yy + 9, color); yy += 24;
                list.slice(0, 3).forEach((m) => {
                    const ai = img(scene, arrow, x, yy + 8, 12 * S, 12 * S); if (ai) items.push(ai);
                    const nt = makeText(scene, x + 22, yy + 8, unitClassName(m.type), { size: 12, bold: true, color: CSS.text, origin: [0, 0.5] }); items.push(nt);
                    items.push(makeText(scene, x + colW - 6, yy + 8, `x${Math.round(m.m * 100) / 100}`, { size: 12, bold: true, color: mcol, origin: [1, 0.5] }));
                    yy += 20;
                });
                return yy;
            };
            const yl = mo.strong.length ? col(mo.strong, pad, 'tip.chip.teal', '유리', C_TEAL, 'tip.adv_up', C_TEAL) : y0;
            const yr = mo.weak.length ? col(mo.weak, pad + colW, 'tip.chip.red', '불리', C_RED, 'tip.adv_down', C_RED) : y0;
            y = Math.max(yl, yr) + 2;
        }
        // 주의 띠
        if (mo.threats?.length) {
            y += 4;
            const bandH = 24;
            const bg = scene.add.graphics().fillStyle(0x141d33, 1).fillRoundedRect(pad - 4, y, inner + 8, bandH, 4); items.push(bg);
            const wi = img(scene, 'tip.warn', pad + 2, y + bandH / 2, 12 * S, 12 * S); if (wi) items.push(wi);
            items.push(fitText(makeText(scene, pad + 24, y + bandH / 2, `${mo.threats.map((x) => unitClassName(x.type)).join('·')}에게 약함`, { size: 12, bold: true, color: C_RED, origin: [0, 0.5] }), inner - 26));
            y += bandH;
        }
        const H = y + pad;
        this.tw = W; this.th = H;
        this.add([slice(scene, 'panel', W, H, 'panel'), ...items]);
        scene.add.existing(this);
    }

    contains() { return false; }
}

// 오라 데이터 -> 툴팁 효과 줄(Battle 의 auraSources 결과): {name, atk, def, src, dist}
export function tipEffects(sources, unit) {
    return (sources ?? []).filter((c) => c.cmd.id !== unit.id).map((c) => ({ name: auraName(c.cmd.aura), atk: c.atk ?? c.cmd.aura?.atk_pct ?? 0, def: c.def ?? c.cmd.aura?.def_pct ?? 0, src: `${c.cmd.name} · 거리 ${c.dist}` }));
}
export function tipOwnAura(unit) {
    if (!unit?.aura || unit.kind === 'troop') return null;
    return { name: auraName(unit.aura), atk: unit.aura.atk_pct ?? 0, def: unit.aura.def_pct ?? 0, radius: unit.aura.radius };
}
