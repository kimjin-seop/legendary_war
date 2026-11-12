import { COLOR } from '../theme.js';
import { makeText } from './common.js';
import { ensurePortrait } from './PortraitCard.js';
import { unitTex, texKey, portraitLogical, manifestHas, ensurePortraitTex, ensureUnitFirstTex, portraitFailed, loaded, portraitCode, ensureSkinTexture } from '../assets.js';
import { slice, skinImage, skinHas } from './skin.js';
import { rarityColor } from '../rarity.js';
import { heroPlainName, unitClassName, gachaCultureOf } from '../systems/names.js';
import { L } from '../layout.js';
import { pixelImage, pixelHas, pixelTroop } from './PixelBadge.js';
import { isInstant } from './motion.js';
import { troopIcon } from './GameIcons.js';

// 로비 영웅 표시 공용: 초상화 박스(지연 로드 + 폴백)와 전투필드 유닛 스프라이트(정면 idle).
// 초상화: portrait_<code>(/assets/portraits/<code>.png, PortraitCard.ensurePortrait 지연 로드).
// 폴백 순서: 초상화 -> 전투 스프라이트(영웅 전용 -> 병종 공용, assets.unitTex) -> 등급색 실루엣 + 이니셜.

const unitTypeOf = (hh) => hh?.unit_type ?? hh?.detail?.unit_type ?? null;

// 전투필드 유닛 스프라이트(정면 idle). 없으면 null
const heroUnitOf = (hh) => ({ hero: hh.hero, type: unitTypeOf(hh), team: 'ally', kind: 'hero', culture: hh.detail?.culture ?? hh.culture, protagonist: !!hh.protagonist, portrait: hh.portrait });
// 영웅 전용 시트가 아직 없으면(로비는 시트를 일괄로 받지 않음) 그 영웅 시트 1장만 지연 로드 -> 받으면 onReady(). 받을 것이 없으면 false
export function ensureHeroSprite(scene, hh, onReady) {
    if (!hh || !unitTypeOf(hh)) return false;
    return ensureUnitFirstTex(scene, heroUnitOf(hh), (ok) => { if (ok) onReady?.(); }); // 전용 시트가 없으면 문화권·병종 시트 1장
}
export function heroSprite(scene, hh, x, y, size) {
    const t = unitTypeOf(hh) ? unitTex(scene, heroUnitOf(hh)) : null;
    if (!t || !scene.textures.exists(t.key)) return null;
    const img = scene.add.image(x, y, t.key, t.frame);
    const k = size / Math.max(img.frame.realWidth || img.width, img.frame.realHeight || img.height, 1);
    img.setScale(k).setFlipX(!!t.flipX);
    return img;
}

// 영웅에 딸린 일반 병사(병종 정보의 '병사' = troop_type) 스프라이트: 문화권 병사 시트 -> 병종 공용 -> 대체 병종(총병 -> 궁병 등, assets.unitTex 규칙 그대로)
const troopUnitOf = (hh) => { const t = hh?.troop_type ?? hh?.detail?.troop_type; return t ? { type: t, team: 'ally', kind: 'troop', culture: hh.detail?.culture ?? hh.culture } : null; };
export const troopTypeOf = (hh) => hh?.troop_type ?? hh?.detail?.troop_type ?? null;
export function ensureTroopSprite(scene, hh, onReady) { const u = troopUnitOf(hh); return u ? ensureUnitFirstTex(scene, u, (ok) => { if (ok) onReady?.(); }) : false; }
export function troopSprite(scene, hh, x, y, size) {
    const u = troopUnitOf(hh);
    const t = u ? unitTex(scene, u) : null;
    if (!t || !scene.textures.exists(t.key)) return null;
    const img = scene.add.image(x, y, t.key, t.frame);
    img.setScale(size / Math.max(img.frame.realWidth || img.width, img.frame.realHeight || img.height, 1)).setFlipX(!!t.flipX);
    return img;
}

// 영웅 초상화 논리 키. 주인공(서버 protagonist:true, portrait=protagonist_{face}, hero=protagonist_<male|female>_<class>):
// portrait.protagonist_{face}(.thumb) -> .neutral -> 성별 기본 portrait.protagonist_<m|f>(.thumb) 중 manifest 에 있는 것(없으면 null = 스프라이트/이니셜 폴백).
// 일반 영웅 = portrait.<hero code>(.thumb)
export function heroPortraitLogical(hh, { thumb = true } = {}) {
    if (!hh?.protagonist) return hh?.hero ? portraitLogical(hh.hero, { thumb }) : null;
    const g = /^protagonist_(male|female)_/.exec(String(hh.hero ?? ''))?.[1];
    const bases = [hh.portrait && `portrait.${hh.portrait}`, g && `portrait.protagonist_${g[0]}`].filter(Boolean);
    const cands = bases.flatMap((b) => [thumb && `${b}.thumb`, b, `${b}.neutral`].filter(Boolean));
    return cands.find((k) => manifestHas(k)) ?? null;
}

// ---- S 등급 카드 레이어(안아트 2026-11-04): manifest portrait.<code>.s_layers {bg, frame, ornament}. 가챠 결과·영웅 상세·도감 상세에서만(목록·대사·컷신은 인물만) ----
// 테마가 없는 S 영웅: 문화권 기본 테마(동아시아 royal_east / 서양 royal_west / 초원 steppe / 중동·남아시아 fire / 그 외 royal_east)
const S_THEME_BY_CULTURE = { korea: 'royal_east', china: 'royal_east', japan: 'royal_east', europe: 'royal_west', hre: 'royal_west', ancient_med: 'royal_west', macedon: 'royal_west', carthage: 'royal_west', west: 'royal_west', steppe: 'steppe', middle_east: 'fire', persia: 'fire', south_asia: 'fire', africa: 'fire', americas: 'dawn', southeast_asia: 'royal_east', france: 'royal_west', oceania: 'sea' };
export function sLayersOf(hh) {
    const code = hh?.hero ?? hh?.code; if (!code) return null;
    const ent = loaded.manifest?.[`portrait.${portraitCode(code)}`];
    const isS = String(ent?.grade ?? '').toUpperCase() === 'S' || String(hh?.rarity ?? '').toUpperCase() === 'S';
    if (!isS) return null;
    const sl = ent?.s_layers ?? {};
    const culture = hh?.culture ?? hh?.detail?.culture ?? gachaCultureOf(code); // 뽑기 결과 행은 culture 없음 -> 뽑기 풀(GET /api/gacha) 문화권
    const bg = sl.bg && manifestHas(sl.bg) ? sl.bg : (() => { const t = S_THEME_BY_CULTURE[culture] ?? 'royal_east'; const k = `portrait.s_bg.${t}`; return manifestHas(k) ? k : null; })();
    const fr = String(sl.frame ?? 'atlas.uiskin_gacha#frame.rank.s').split('#')[1] ?? 'frame.rank.s';
    const orn = String(sl.ornament ?? 'atlas.uiskin_gacha#frame.rank.s.ornament').split('#')[1] ?? null;
    return { bg, frame: fr, ornament: orn };
}
// 장식(frame.rank.s.ornament = 모서리 4 + 상단 크레스트 한 장, 312x345@3x): 통째로 늘리면 크레스트가 찌그러져 5조각으로 잘라 카드 모서리·상단 중앙에 같은 배율로 붙인다
const ORN_PIECES = [ // [crop x0, y0, x1, y1](원본 비율), 붙일 기준: 카드 모서리(ax, ay = 0 | 1) 또는 상단 중앙(crest)
    { r: [0, 0.08, 0.3, 0.36], ax: 0, ay: 0 }, { r: [0.7, 0.08, 1, 0.36], ax: 1, ay: 0 },
    { r: [0, 0.72, 0.3, 1], ax: 0, ay: 1 }, { r: [0.7, 0.72, 1, 1], ax: 1, ay: 1 },
    { r: [0.3, 0, 0.7, 0.24], crest: true },
];
function ornamentPieces(scene, name, w, h) {
    const probe = skinImage(scene, name); if (!probe) return [];
    const fw = probe.frame.realWidth, fh = probe.frame.realHeight; probe.destroy();
    const k = Math.min(w / fw, h / fh, (Math.min(w, h) * 0.32) / (fw * 0.3)); // 모서리 조각 <= 카드 짧은 변의 32%
    return ORN_PIECES.map((p) => {
        const im = skinImage(scene, name).setOrigin(0).setScale(k);
        const [x0, y0, x1, y1] = p.r;
        im.setCrop(x0 * fw, y0 * fh, (x1 - x0) * fw, (y1 - y0) * fh);
        const pw = (x1 - x0) * fw * k, ph = (y1 - y0) * fh * k;
        const tx = p.crest ? (w - pw) / 2 : p.ax ? w - pw : 0; const ty = p.crest ? -ph * 0.3 : p.ay ? h - ph : 0; // 크레스트는 위로 30% 걸친다
        return im.setPosition(tx - x0 * fw * k, ty - y0 * fh * k);
    });
}
// S 카드: 컨테이너 c(좌상단 원점, w x h) 안에 배경(맨 뒤) + inner(인물 portraitBox 등) + 프레임·장식(맨 앞). 키가 없거나 로드 실패면 그 레이어만 생략(현행 폴백)
export function sCard(scene, hh, x, y, w, h, makeInner) {
    const sl = sLayersOf(hh);
    const c = scene.add.container(x, y);
    c.clipH = h;
    const inner = makeInner(0, 0, !!sl);
    if (!sl) { c.add(inner); return c; }
    const bgBox = scene.add.container(0, 0); c.add(bgBox);
    c.add(inner);
    const top = scene.add.container(0, 0); c.add(top);
    if (sl.bg) { const put = (k) => { if (!bgBox.scene || !k || !scene.textures.exists(k)) return; bgBox.removeAll(true); const im = scene.add.image(0, 0, k).setOrigin(0); const iw = im.frame.realWidth, ih = im.frame.realHeight; const s0 = Math.max(w / iw, h / ih); const cx = (iw - w / s0) / 2, cy = (ih - h / s0) / 2; im.setCrop(cx, cy, w / s0, h / s0).setScale(s0).setPosition(-cx * s0, -cy * s0); bgBox.add(im); if (!isInstant()) { im.setAlpha(0); scene.tweens.add({ targets: im, alpha: 1, duration: 180 }); } }; const k = ensurePortraitTex(scene, sl.bg, put); if (k) put(k); } // 배경 판: 지연 로드(도착 시 페이드인), 실패면 생략
    const drawFrame = () => { if (!top.scene) return; top.removeAll(true); if (skinHas(scene, 'frame.rank.s')) top.add(slice(scene, 'slot_S', w, h, 'panel')); if (sl.ornament) ornamentPieces(scene, sl.ornament, w, h).forEach((o) => top.add(o)); };
    drawFrame();
    if (!skinHas(scene, sl.frame)) ensureSkinTexture(scene, 'uiskin_gacha', () => drawFrame()); // 등급 프레임 아틀라스(뽑기 전용 지연 로드)가 없으면 받아서 다시
    c.sLayered = true;
    return c;
}

// 초상화 박스(좌상단 x,y / w x h). 원본 상단 중심을 박스 비율로 크롭. 지연 로드되면 다시 그린다.
// lazy=true: 즉시 로드하지 않고 폴백만 그린 뒤 c.load() 호출 시 초상화를 지연 로드(목록에서 보이는 카드만 로드, 896x1200 원본 메모리 절약)
// thumb=true(기본): 256px 썸네일(카드·목록). 상세처럼 큰 표시는 thumb:false(원본)
export function portraitBox(scene, hh, x, y, w, h, { border = true, focus = 0.04, lazy = false, thumb = true, bare = false } = {}) {
    const c = scene.add.container(x, y);
    c.clipH = h;
    const col = rarityColor(hh?.rarity) ?? COLOR.accent;
    // skel: 초상화가 manifest 에 있는데 아직 로드 전 -> 이니셜 대신 스켈레톤(어두운 판 + 은은한 점멸). 도착하면 페이드인(레이아웃 점프·글자 깜빡임 제거)
    const draw = (tex, { skel = false, fade = false } = {}) => {
        if (!c.scene) return;
        c.removeAll(true);
        c.skelTw?.remove(); c.skelTw = null;
        const hasImg = !skel && tex && scene.textures.exists(tex);
        if (!(bare && hasImg)) c.add(scene.add.rectangle(0, 0, w, h, COLOR.ink, bare ? 0.25 : 0.55).setOrigin(0)); // bare: S 카드 배경 판 위(인물 뒤 어두운 판 생략)
        if (skel) {
            const sk = scene.add.rectangle(0, 0, w, h, col, 0.12).setOrigin(0);
            c.add(sk);
            if (!isInstant()) c.skelTw = scene.tweens.add({ targets: sk, alpha: 0.45, duration: 700, yoyo: true, repeat: -1 });
            c.once('destroy', () => c.skelTw?.remove());
        } else if (tex && scene.textures.exists(tex)) {
            const img = scene.add.image(0, 0, tex).setOrigin(0, 0);
            const fw = img.frame.realWidth; const fh = img.frame.realHeight;
            const a = w / h;
            const cw = Math.min(fw, fh * a); const ch = cw / a;
            const cx = (fw - cw) / 2; const cy = Math.max(0, Math.min(fh - ch, fh * focus));
            const s = w / cw;
            img.setCrop(cx, cy, cw, ch).setScale(s).setPosition(-cx * s, -cy * s);
            c.add(img);
            if (fade && !isInstant()) { img.setAlpha(0); scene.tweens.add({ targets: img, alpha: 1, duration: 180 }); }
        } else {
            const sp = heroSprite(scene, hh, w / 2, h / 2, Math.min(w, h) * 0.8);
            if (sp) { c.add(scene.add.rectangle(0, 0, w, h, col, 0.18).setOrigin(0)); c.add(sp); }
            else {
                c.add(scene.add.rectangle(0, 0, w, h, col, 0.3).setOrigin(0));
                c.add(makeText(scene, w / 2, h / 2, heroPlainName(hh).slice(0, 1), { size: Math.round(Math.min(w, h) * 0.42), bold: true, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: 4 } }));
            }
        }
        if (border && !bare) c.add(scene.add.rectangle(0, 0, w, h, 0, 0).setOrigin(0).setStrokeStyle(1, col, 0.9));
    };
    let started = false;
    const lg = heroPortraitLogical(hh, { thumb });
    const ready = !!lg && scene.textures.exists(texKey(lg));
    const later = (tex) => draw(tex, { fade: true }); // 비동기 도착(실패면 tex=null -> 이니셜/스프라이트 폴백)
    // 실패로 기록된 키는 콜백이 다시 오지 않는다 -> 스켈레톤(빈 등급색 판)에 머물지 않고 바로 스프라이트/이니셜 폴백(2026-11-03 강화면 Low: 초상 없는 카드가 빈 보라 배경)
    c.load = () => { if (started) return; started = true; const k = hh?.protagonist ? ensurePortraitTex(scene, lg, later) : ensurePortrait(scene, hh?.hero, later, { thumb }); if (k) draw(k); else draw(null, { skel: !!lg && !portraitFailed(lg) }); };
    if (lazy && !ready) draw(null, { skel: !!lg && !portraitFailed(lg) }); else c.load();
    return c;
}

// ---------- 병종 뱃지(영웅 본체 병종 + 병사 병종) ----------
// 규칙: ㉮ 영웅 = 원형 + 금테(COLOR.accent) / ㉯ 병사 = 방패형 + 은청색 테 + 하단 '사람 3명' 점 표식.
// 그림: 도트 뱃지(pixel_badges badge.hero/troop.<pixelTroop>, 틀+그림 일체) 우선 = 병종 아이콘 통일 기준. 폴백 코드 뱃지 안 그림은 GameIcons.troopIcon(같은 도트 sym.troop).
// 이름은 names.js(unitClassName) 단일 지점, 병사는 서버 troop_label 우선. 터치/호버 시 툴팁.
// 반환 컨테이너: 좌상단 원점, .w/.h = 전체 크기. vertical=true 면 세로로 쌓는다.
const SILVER = 0x9fc3e6;
// 코드 그리기 뱃지 안 그림 = 병종 아이콘 단일 소스(GameIcons.troopIcon: 도트 sym.troop -> ico.troop -> 글자). 도트 뱃지(badge.*)와 같은 도트 그림이 나오게(2026-11-08 통일)
function classMark(scene, type, cx, cy, s, max = Infinity) {
    return troopIcon(scene, type, cx, cy, s, { glyphSize: Math.max(9, Math.round(s * 0.8)), stroke: 2, max });
}
let tipObj = null;
function showTip(scene, target, text) {
    tipObj?.destroy(); tipObj = null;
    if (!target.scene) return;
    const m = target.getWorldTransformMatrix();
    const t = makeText(scene, 8, 6, text, { size: 13, bold: true });
    const w = t.width + 16; const h = t.height + 12;
    const x = Math.max(4, Math.min(L.lw - w - 4, m.tx + (target.w ?? 0) - w));
    const y = m.ty + (target.h ?? 0) + 4 + h > L.lh ? m.ty - h - 4 : m.ty + (target.h ?? 0) + 4;
    const c = scene.add.container(x, y).setDepth(3000);
    c.add([scene.add.rectangle(0, 0, w, h, COLOR.ink, 0.95).setOrigin(0).setStrokeStyle(1, COLOR.accent, 0.8), t]);
    tipObj = c;
    scene.time.delayedCall(2200, () => { if (tipObj === c) { c.destroy(); tipObj = null; } });
}
// 도트 뱃지(안아트 pixel_badges): 영웅 badge.hero.<troop>(원형 금테 32px) / 병사 badge.troop.<troop>(방패 은테 30x32). 표시 크기는 원본 도트의 정수배(PixelBadge).
// 아틀라스 미로드·도트 프레임 없는 병종(도트 11종 밖)은 아래 코드 그리기 뱃지로 폴백.
function pixelTroopBadges(scene, c, { heroClass, troopClass, size, vertical, gap }) {
    const hk = `badge.hero.${pixelTroop(heroClass)}`;
    const tk = troopClass ? `badge.troop.${pixelTroop(troopClass)}` : null;
    if (!pixelHas(scene, hk) || (tk && !pixelHas(scene, tk))) return false;
    const hi = pixelImage(scene, hk, 0, 0, size).setOrigin(0, 0);
    c.add(hi);
    let w = hi.displayWidth; let h = hi.displayHeight;
    if (tk) {
        const ti = pixelImage(scene, tk, 0, 0, size * (30 / 32)).setOrigin(0, 0); // 방패 30x32: 영웅 뱃지와 같은 배율
        if (vertical) { ti.setPosition((w - ti.displayWidth) / 2, h + gap); h += gap + ti.displayHeight; } else { ti.setPosition(w + gap, 0); w += gap + ti.displayWidth; h = Math.max(h, ti.displayHeight); }
        c.add(ti);
    }
    c.w = w; c.h = h;
    return true;
}
export function troopBadges(scene, { heroClass, troopClass, troopLabel, size = 26, vertical = false, tooltip = true } = {}) {
    const c = scene.add.container(0, 0);
    const gap = Math.max(3, Math.round(size * 0.15));
    if (!pixelTroopBadges(scene, c, { heroClass, troopClass, size, vertical, gap })) drawTroopBadges(scene, c, { heroClass, troopClass, size, vertical, gap });
    if (tooltip) addBadgeTip(scene, c, heroClass, troopClass, troopLabel);
    return c;
}
// 구버전 코드 그리기 뱃지(폴백)
function drawTroopBadges(scene, c, { heroClass, troopClass, size, vertical, gap }) {
    const g = scene.add.graphics();
    c.add(g);
    const r = size / 2;
    // ㉮ 영웅 본체 병종: 원형 금테
    g.fillStyle(COLOR.ink, 0.92).fillCircle(r, r, r - 1);
    g.lineStyle(2, COLOR.accent, 1).strokeCircle(r, r, r - 1);
    c.add(classMark(scene, heroClass, r, r, size * 0.6, size - 4)); // 원 안(지름 size-2)
    if (troopClass) {
        // ㉯ 병사 병종: 방패형 은청색 테 + 하단 사람 3명 표식
        const ox = vertical ? 0 : size + gap; const oy = vertical ? size + gap : 0;
        const sw = size * 0.9; const sh = size; const x0 = ox + (size - sw) / 2;
        const pts = [x0, oy + 1, x0 + sw, oy + 1, x0 + sw, oy + sh * 0.6, x0 + sw / 2, oy + sh - 1, x0, oy + sh * 0.6];
        g.fillStyle(0x1c2a44, 0.95).fillPoints(toPts(pts), true);
        g.lineStyle(2, SILVER, 1).strokePoints(toPts(pts), true);
        c.add(classMark(scene, troopClass, ox + size / 2, oy + sh * 0.4, size * 0.48, size * 0.7)); // 방패 윗부분 안
        const pr = Math.max(1.2, size * 0.055);
        [-1, 0, 1].forEach((d) => { g.fillStyle(SILVER, 1).fillCircle(ox + size / 2 + d * pr * 2.6, oy + sh * 0.76, pr); });
    }
    c.w = troopClass && !vertical ? size * 2 + gap : size;
    c.h = troopClass && vertical ? size * 2 + gap : size;
}
function addBadgeTip(scene, c, heroClass, troopClass, troopLabel) {
    {
        const text = `영웅: ${unitClassName(heroClass)}${troopClass || troopLabel ? ` / 병사: ${troopLabel ?? unitClassName(troopClass)}(고정)` : ''}`;
        const hit = scene.add.rectangle(0, 0, c.w, c.h, 0xffffff, 0).setOrigin(0).setInteractive({ useHandCursor: true });
        hit.on('pointerover', () => showTip(scene, c, text));
        hit.on('pointerout', () => { tipObj?.destroy(); tipObj = null; });
        hit.on('pointerdown', (p, lx, ly, ev) => { ev?.stopPropagation?.(); showTip(scene, c, text); });
        hit.on('pointerup', (p, lx, ly, ev) => ev?.stopPropagation?.());
        c.add(hit);
    }
}
const toPts = (a) => { const o = []; for (let i = 0; i < a.length; i += 2) o.push({ x: a[i], y: a[i + 1] }); return o; };
