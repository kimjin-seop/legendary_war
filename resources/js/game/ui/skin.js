import Phaser from 'phaser';
import { COLOR, GRADE } from '../theme.js';

// UI 스킨: 코드로 생성하는 9-슬라이스 텍스처(딥 네이비 + 이중 금색 테두리 + 코너 장식).
// 텍스처는 S배(=3, 4K까지 선명) 해상도로 게임당 1회만 생성하고, 화면에는 1/S 스케일로 올린다. 교체는 키만 바꾸면 된다.
// 키 규격: btn_<primary|secondary|danger>_<normal|hover|pressed|disabled|selected>, btn_glow, panel, ribbon,
//          tab_on, tab_off, slot_<S|A|B|C>, gauge_bg, gauge_<green|red|blue|gold>, toggle_<off|on>, knob, slider_track
export const S = 3;
export const VARIANTS = ['primary', 'secondary', 'danger'];
export const STATES = ['normal', 'hover', 'pressed', 'disabled', 'selected'];
const SLICE = { btn: 16, panel: 22, ribbon: 18, tab: 12, slot: 14, gauge: 6, toggle: 14, track: 5 };

const mix = (a, b, t) => {
    const ar = (a >> 16) & 255; const ag = (a >> 8) & 255; const ab = a & 255;
    const br = (b >> 16) & 255; const bg = (b >> 8) & 255; const bb = b & 255;
    return (Math.round(ar + (br - ar) * t) << 16) | (Math.round(ag + (bg - ag) * t) << 8) | Math.round(ab + (bb - ab) * t);
};

function make(scene, key, wU, hU, draw) {
    if (scene.textures.exists(key)) return;
    const g = scene.make.graphics({ x: 0, y: 0, add: false });
    draw(g, wU * S, hU * S);
    g.generateTexture(key, wU * S, hU * S);
    g.destroy();
}

// 세로 그라데이션(스트립) + 모서리 라운드. r: 반경(px)
function grad(g, x, y, w, h, r, c1, c2, alpha = 1) {
    for (let i = 0; i < h; i += 2) {
        const dt = i; const db = h - i;
        const d = Math.min(dt, db);
        const inset = d < r ? r - Math.sqrt(Math.max(0, r * r - (r - d) * (r - d))) : 0;
        g.fillStyle(mix(c1, c2, i / h), alpha).fillRect(x + inset, y + i, w - inset * 2, 2);
    }
}

function corners(g, w, h, color, len = 16 * S, inset = 3 * S) {
    g.lineStyle(2 * S, color, 1);
    [[0, 0, 1, 1], [w, 0, -1, 1], [0, h, 1, -1], [w, h, -1, -1]].forEach(([cx, cy, sx, sy]) => {
        g.beginPath().moveTo(cx + sx * len, cy + sy * inset).lineTo(cx + sx * inset, cy + sy * inset).lineTo(cx + sx * inset, cy + sy * len).strokePath();
        const d = 4 * S;
        g.fillStyle(color, 1).fillPoints([
            { x: cx + sx * (inset + d * 2), y: cy + sy * (inset + d) }, { x: cx + sx * (inset + d * 3), y: cy + sy * (inset + d * 2) },
            { x: cx + sx * (inset + d * 2), y: cy + sy * (inset + d * 3) }, { x: cx + sx * (inset + d), y: cy + sy * (inset + d * 2) },
        ], true);
    });
}

const PAL = {
    primary: { top: 0xe6c872, bot: 0xa97f2c, edge: 0x5a4210, glow: 0xffe9a8 },
    secondary: { top: 0x38497a, bot: 0x1b2645, edge: COLOR.accent, glow: COLOR.accentLight },
    danger: { top: 0xd9694f, bot: 0x8e2f20, edge: 0xf0b0a0, glow: 0xffb0a0 },
};

function drawButton(g, w, h, variant, state) {
    const p = PAL[variant];
    let top = p.top; let bot = p.bot;
    if (state === 'hover') { top = mix(top, 0xffffff, 0.16); bot = mix(bot, 0xffffff, 0.12); }
    if (state === 'pressed') { top = mix(top, 0x000000, 0.28); bot = mix(bot, 0x000000, 0.22); }
    if (state === 'disabled') { top = mix(top, 0x5a6070, 0.65); bot = mix(bot, 0x3a404e, 0.65); }
    const r = 7 * S;
    const outer = state === 'disabled' ? 0x7d8494 : state === 'selected' || state === 'hover' ? COLOR.accentLight : COLOR.accent;
    g.fillStyle(0x000000, 0.35).fillRoundedRect(S, 2 * S, w - 2 * S, h - 2 * S, r); // 하단 그림자
    grad(g, S, S, w - 2 * S, h - 3 * S, r, top, bot);
    // 상단 하이라이트 광택
    grad(g, 4 * S, 3 * S, w - 8 * S, (h - 6 * S) * 0.42, 5 * S, 0xffffff, 0xffffff, 0);
    for (let i = 0; i < (h - 6 * S) * 0.42; i += 2) {
        g.fillStyle(0xffffff, 0.2 * (1 - i / ((h - 6 * S) * 0.42))).fillRect(5 * S, 3 * S + i, w - 10 * S, 2);
    }
    g.lineStyle(2.5 * S, outer, 1).strokeRoundedRect(1.5 * S, 1.5 * S, w - 3 * S, h - 3 * S, r);
    g.lineStyle(S, state === 'selected' ? 0xffffff : p.glow, state === 'disabled' ? 0.25 : 0.55).strokeRoundedRect(5 * S, 5 * S, w - 10 * S, h - 10 * S, r - 2 * S);
    corners(g, w, h, state === 'disabled' ? 0x7d8494 : outer, 11 * S, 2 * S);
    if (state === 'pressed') g.fillStyle(0x000000, 0.18).fillRect(4 * S, 4 * S, w - 8 * S, 3 * S); // 눌림 내부 그림자
}

function drawPanel(g, w, h) {
    const r = 8 * S;
    g.fillStyle(0x000000, 0.4).fillRoundedRect(S, 2 * S, w - 2 * S, h - 2 * S, r);
    grad(g, S, S, w - 2 * S, h - 3 * S, r, 0x2b3a5e, 0x182139);
    // 은은한 노이즈(고정 시드)
    const rnd = new Phaser.Math.RandomDataGenerator(['panel-noise']);
    for (let i = 0; i < 260; i++) g.fillStyle(rnd.pick([0xffffff, 0x000000]), 0.04).fillRect(rnd.between(4 * S, w - 4 * S), rnd.between(4 * S, h - 4 * S), S, S);
    g.lineStyle(2.5 * S, COLOR.accent, 1).strokeRoundedRect(1.5 * S, 1.5 * S, w - 3 * S, h - 3 * S, r);
    g.lineStyle(S, COLOR.accentLight, 0.4).strokeRoundedRect(7 * S, 7 * S, w - 14 * S, h - 14 * S, r - 3 * S);
    corners(g, w, h, COLOR.accent, 18 * S, 2 * S);
}

function drawRibbon(g, w, h) {
    const n = 12 * S; // 양끝 꼬리 모양
    g.fillStyle(0x000000, 0.35).fillPoints([{ x: 0, y: 3 * S }, { x: w, y: 3 * S }, { x: w - n, y: h / 2 + 2 * S }, { x: w, y: h }, { x: 0, y: h }, { x: n, y: h / 2 + 2 * S }], true);
    for (let i = 0; i < h - 2 * S; i += 2) {
        const t = i / (h - 2 * S);
        const inset = t > 0.45 ? n * Math.min(1, (t - 0.45) / 0.1) * 0.0 : 0;
        g.fillStyle(mix(0x3a4c7e, 0x1c2745, t), 1).fillRect(inset, i, w - inset * 2, 2);
    }
    g.lineStyle(2 * S, COLOR.accent, 1).strokeRect(S, S, w - 2 * S, h - 4 * S);
    g.lineStyle(S, COLOR.accentLight, 0.45).strokeRect(4 * S, 4 * S, w - 8 * S, h - 10 * S);
    g.fillStyle(COLOR.accent, 1).fillRect(0, h - 4 * S, w, 2 * S);
}

function drawTab(g, w, h, on) {
    const r = 6 * S;
    grad(g, S, S, w - 2 * S, h - 2 * S, r, on ? 0xe6c872 : 0x34456f, on ? 0xa97f2c : 0x1c2745);
    for (let i = 0; i < (h - 4 * S) * 0.4; i += 2) g.fillStyle(0xffffff, 0.18 * (1 - i / ((h - 4 * S) * 0.4))).fillRect(4 * S, 3 * S + i, w - 8 * S, 2);
    g.lineStyle(2 * S, on ? COLOR.accentLight : COLOR.accent, on ? 1 : 0.7).strokeRoundedRect(S, S, w - 2 * S, h - 2 * S, r);
}

function drawSlot(g, w, h, color) {
    const r = 6 * S;
    grad(g, S, S, w - 2 * S, h - 2 * S, r, 0x202c4a, 0x111830);
    g.lineStyle(3 * S, color, 1).strokeRoundedRect(1.5 * S, 1.5 * S, w - 3 * S, h - 3 * S, r);
    g.lineStyle(S, 0xffffff, 0.3).strokeRoundedRect(5 * S, 5 * S, w - 10 * S, h - 10 * S, r - 2 * S);
    corners(g, w, h, color, 10 * S, 2 * S);
}

function drawGauge(g, w, h, kind) {
    const r = h / 2;
    if (kind === 'bg') {
        grad(g, 0, 0, w, h, r, 0x070b16, 0x151c30);
        g.lineStyle(1.5 * S, COLOR.accent, 0.85).strokeRoundedRect(0.75 * S, 0.75 * S, w - 1.5 * S, h - 1.5 * S, r);
        return;
    }
    const c = { green: [0x7be0a0, 0x1f8a55], red: [0xff8a70, 0xa8301f], blue: [0x7fb4ff, 0x2a5bb0], gold: [0xffe08a, 0xb0842a] }[kind];
    grad(g, 0, 0, w, h, r, c[0], c[1]);
    for (let i = 0; i < h * 0.45; i += 2) g.fillStyle(0xffffff, 0.35 * (1 - i / (h * 0.45))).fillRect(r * 0.5, i + S, w - r, 2); // 유리 광택
    g.fillStyle(0x000000, 0.22);
    for (let x = 10 * S; x < w - 4 * S; x += 10 * S) g.fillRect(x, h - 5 * S, S, 4 * S); // 눈금
}

export function generateSkin(scene) {
    VARIANTS.forEach((v) => STATES.forEach((s) => make(scene, `btn_${v}_${s}`, 48, 48, (g, w, h) => drawButton(g, w, h, v, s))));
    make(scene, 'btn_glow', 48, 48, (g, w, h) => {
        for (let i = 6; i >= 1; i--) g.lineStyle(i * 1.6 * S, COLOR.accentLight, 0.07).strokeRoundedRect(8 * S, 8 * S, w - 16 * S, h - 16 * S, 8 * S);
    });
    make(scene, 'panel', 64, 64, drawPanel);
    make(scene, 'ribbon', 96, 36, drawRibbon);
    make(scene, 'tab_on', 40, 40, (g, w, h) => drawTab(g, w, h, true));
    make(scene, 'tab_off', 40, 40, (g, w, h) => drawTab(g, w, h, false));
    Object.entries(GRADE).forEach(([k, c]) => make(scene, `slot_${k}`, 48, 48, (g, w, h) => drawSlot(g, w, h, c)));
    make(scene, 'gauge_bg', 32, 16, (g, w, h) => drawGauge(g, w, h, 'bg'));
    ['green', 'red', 'blue', 'gold'].forEach((k) => make(scene, `gauge_${k}`, 32, 16, (g, w, h) => drawGauge(g, w, h, k)));
    make(scene, 'toggle_off', 52, 28, (g, w, h) => { grad(g, S, S, w - 2 * S, h - 2 * S, h / 2, 0x10162a, 0x232d4a); g.lineStyle(2 * S, COLOR.muted, 0.8).strokeRoundedRect(S, S, w - 2 * S, h - 2 * S, h / 2 - S); });
    make(scene, 'toggle_on', 52, 28, (g, w, h) => { grad(g, S, S, w - 2 * S, h - 2 * S, h / 2, 0xe6c872, 0xa97f2c); g.lineStyle(2 * S, COLOR.accentLight, 1).strokeRoundedRect(S, S, w - 2 * S, h - 2 * S, h / 2 - S); });
    make(scene, 'knob', 24, 24, (g, w, h) => { grad(g, S, S, w - 2 * S, h - 2 * S, h / 2, 0xffffff, 0xb9b3a0); g.lineStyle(S, COLOR.accent, 1).strokeCircle(w / 2, h / 2, w / 2 - S); });
    make(scene, 'slider_track', 24, 10, (g, w, h) => { grad(g, 0, 0, w, h, h / 2, 0x070b16, 0x1b2340); g.lineStyle(S, COLOR.accent, 0.8).strokeRoundedRect(S / 2, S / 2, w - S, h - S, h / 2); });
}

// ---- 이미지 스킨(안아트 UI 스킨 아틀라스 'uiskin', 톤 A안 남색 칠기+금박) ----
// 기존 코드 스킨 키 -> 아틀라스 프레임. 아틀라스·프레임이 없거나 최소 폭보다 좁으면 기존 코드 스킨으로 폴백(가이드 §5).
// 3h 프레임(버튼·탭·리본): 높이를 프레임 높이에 맞춰 균일 스케일, 9 프레임(패널): 아틀라스 unitPx 로 스케일.
export const SKIN_ATLAS = 'uiskin';
export const SKIN_ATLAS_GACHA = 'uiskin_gacha'; // 등급 프레임·카드 뒷면·승패 배너(지연 로드)
export const SKIN_ATLAS_EXTRA = 'uiskin_extra'; // 보조 아이콘(ico.tab_*·ico.gold, 36u 정사각)
export const skinOn = (scene) => scene.textures.exists(SKIN_ATLAS);
const frameOf = (key, w, h) => {
    let m = /^btn_(primary|secondary|danger)_(normal|hover|pressed|disabled|selected)$/.exec(key);
    if (m) return `btn.${m[1]}.${m[2] === 'selected' ? 'hover' : m[2]}`;
    if (key === 'btn_glow') return 'btn.glow';
    if (key === 'panel') return w >= 120 && h >= 120 ? 'panel.main' : 'panel.sub';
    if (key === 'panel_sub') return 'panel.sub';
    if (key === 'panel_hud') return 'panel.hud';
    if (key === 'ribbon') return 'header.ribbon';
    if (key === 'dialog') return 'dialog.box';
    if (key === 'nameplate') return 'dialog.nameplate';
    if (key === 'gauge_bg') return 'bar.track';
    m = /^gauge_(green|red|blue|gold|cost|hp_warn)$/.exec(key);
    if (m) return `bar.fill.${{ green: 'hp', red: 'hp_danger', blue: 'exp', gold: 'gold', cost: 'cost', hp_warn: 'hp_warn' }[m[1]]}`;
    m = /^slot_(S|A|B|C|base)$/.exec(key);
    if (m) return `frame.rank.${m[1].toLowerCase()}`;
    if (key === 'tab_on') return 'tab.on';
    if (key === 'tab_off') return 'tab.off';
    if (key === 'toast') return 'toast.pill';
    if (key === 'topbar') return 'topbar.strip';
    if (key === 'currency') return 'currency.capsule';
    m = /^row_(normal|hover|selected|disabled)$/.exec(key);
    if (m) return `row.list.${m[1]}`;
    return null;
};
// 프레임이 있는 아틀라스(uiskin -> uiskin_gacha 순)
const atlasOf = (scene, name) => [SKIN_ATLAS, SKIN_ATLAS_EXTRA, SKIN_ATLAS_GACHA].find((k) => scene.textures.exists(k) && scene.textures.get(k).has(name)) ?? null;
const atlasFrame = (scene, name) => { const k = atlasOf(scene, name); return k ? scene.textures.get(k).get(name) : null; };
const is3h = (f) => f.customData?.sliceMode === '3h' || f.is3Slice;
// 최소 폭(가이드): (l + r) / frame.height x 표시 높이
const minW = (f, h) => { const s = f.customData?.slice; return s && is3h(f) ? ((s.l + s.r) / f.height) * h : 0; };
let unitPxOf = () => 3;
export function setSkinUnitPx(fn) { unitPxOf = fn; } // assets.js 가 아틀라스 해상도(3 | 1.5)를 알려준다

function atlasSlice(scene, name, w, h, corner = 1) {
    const atlas = atlasOf(scene, name);
    const f = atlas ? scene.textures.get(atlas).get(name) : null;
    if (!f || w < minW(f, h) - 0.5) return null;
    let ns;
    if (is3h(f)) {
        const k = f.height / h;
        ns = scene.add.nineslice(0, 0, atlas, name, w * k, f.height);
        ns.setScale(1 / k);
    } else {
        const k = (unitPxOf(atlas) || 3) / (corner > 0 ? corner : 1); // corner < 1 = 모서리 장식을 그만큼 작게(같은 표시 크기)
        ns = scene.add.nineslice(0, 0, atlas, name, w * k, h * k);
        ns.setScale(1 / k);
    }
    ns.skinAtlasKey = atlas;
    ns.setOrigin(0, 0);
    ns.skinAtlas = true; ns.skinW = w; ns.skinH = h;
    // 기존 코드가 setTexture('btn_primary_hover') 처럼 코드 스킨 키로 상태를 바꾸므로 같은 키를 프레임으로 번역한다
    const base = ns.setTexture.bind(ns);
    ns.setTexture = (key, frame) => {
        if (key === SKIN_ATLAS || key === SKIN_ATLAS_GACHA) return base(key, frame);
        const fn = frameOf(key, ns.skinW, ns.skinH);
        const ak = fn ? atlasOf(scene, fn) : null;
        if (ak) { base(ak, fn); ns.setSlices(ns.width, ns.height); fit3h(ns); }
        return ns;
    };
    return ns;
}
// 3h 프레임 표시 폭 맞춤: 프레임 최소 폭(l+r 캡)보다 좁으면 캡이 겹쳐 깨지므로 최소 폭으로 만든 뒤 가로만 축소해 skinW 에 맞춘다.
// (예: tab.off 캡 32 / tab.on 캡 61 — 390px 7~8탭에서 선택 탭으로 바뀔 때 tab.on 캡이 칸보다 넓어 활성 탭 테두리가 어긋나던 문제)
function fit3h(ns) {
    const f = ns.frame;
    if (!is3h(f) || !ns.skinH) return;
    const k = f.height / ns.skinH;
    const w = Math.max(ns.skinW, minW(f, ns.skinH));
    ns.setSize(w * k, f.height);
    ns.setScale((1 / k) * (ns.skinW / w), 1 / k);
}

// 9-슬라이스 생성: 화면 크기(unit) w x h, 좌상단 원점. 이미지 스킨이 있으면 아틀라스 프레임, 없으면 코드 스킨(텍스처 S배, 1/S 스케일)
// opts.corner: 9-슬라이스 모서리 배율(기본 1, 예 0.6 = 세로 폰에서 금 모서리가 커 보일 때). 3h 프레임·코드 스킨에는 영향 없음
export function slice(scene, key, w, h, kind, opts = {}) {
    const fn = frameOf(key, w, h);
    const a = fn ? atlasSlice(scene, fn, w, h, opts.corner ?? 1) : null;
    if (a) return a;
    const c = SLICE[kind] * S;
    // 새 스킨 전용 키는 코드 스킨의 가장 가까운 텍스처로 폴백
    const legacy = { dialog: 'panel', nameplate: 'ribbon', panel_sub: 'panel', panel_hud: 'panel', slot_base: 'slot_C', topbar: 'panel', currency: 'panel', toast: 'panel', row_normal: 'panel', row_hover: 'panel', row_selected: 'panel', row_disabled: 'panel' }[key] ?? key;
    const ns = scene.add.nineslice(0, 0, legacy, undefined, w * S, h * S, c, c, kind === 'gauge' || kind === 'track' ? 0 : c, kind === 'gauge' || kind === 'track' ? 0 : c);
    ns.setOrigin(0, 0).setScale(1 / S);
    return ns;
}
export function setSliceSize(ns, w, h) {
    if (!ns?.scene) return; // 파괴된 NineSlice(vertices=[])에 크기 설정 금지
    if (!ns.skinAtlas) { ns.setSize(w * S, h * S); return; }
    ns.skinW = w; ns.skinH = h;
    if (is3h(ns.frame)) fit3h(ns); else { const k = unitPxOf(ns.skinAtlasKey ?? SKIN_ATLAS) || 3; ns.setSize(w * k, h * k); }
}
// 아틀라스 아이콘(ico.<name>) 이미지. 없으면 null(호출 측이 기호 텍스트로 폴백)
export function skinIcon(scene, name, size = 24) {
    const a = atlasOf(scene, `ico.${name}`);
    return a ? scene.add.image(0, 0, a, `ico.${name}`).setDisplaySize(size, size) : null;
}
// 아틀라스 단일 이미지 프레임(badge.dot 등)
export function skinImage(scene, name) { const a = atlasOf(scene, name); return a ? scene.add.image(0, 0, a, name) : null; }
export const skinHas = (scene, name) => !!atlasOf(scene, name);

// ---- 아이콘: 에셋 담당 PNG 세트(public/assets/ui/icons/*.png)가 준비되면 이 표만 교체한다 ----
// icon(scene, key, size) -> GameObject. 현재는 코드로 그린 임시 벡터 텍스처.
const ICON_KEYS = ['sword', 'axe', 'lance', 'bow', 'adv', 'dis', 'plain', 'forest', 'mountain', 'water', 'gold', 'menu', 'star'];
export function generateIcons(scene) {
    const size = 32;
    ICON_KEYS.forEach((k) => make(scene, `icon_${k}`, size, size, (g, w, h) => {
        const c = w / 2;
        g.fillStyle(COLOR.text, 1).lineStyle(2 * S, COLOR.text, 1);
        if (k === 'sword') { g.fillRect(c - S, 3 * S, 2 * S, 18 * S); g.fillRect(c - 6 * S, 20 * S, 12 * S, 2 * S); g.fillRect(c - S, 22 * S, 2 * S, 6 * S); }
        else if (k === 'axe') { g.fillRect(c - S, 4 * S, 2 * S, 24 * S); g.fillTriangle(c + S, 5 * S, c + 12 * S, 10 * S, c + S, 16 * S); }
        else if (k === 'lance') { g.fillRect(c - S, 10 * S, 2 * S, 20 * S); g.fillTriangle(c, 2 * S, c - 5 * S, 12 * S, c + 5 * S, 12 * S); }
        else if (k === 'bow') { g.beginPath().arc(c + 6 * S, c, 12 * S, Math.PI * 0.6, Math.PI * 1.4, false).strokePath(); g.lineBetween(c - 4 * S, 6 * S, c - 4 * S, 26 * S); }
        else if (k === 'adv') { g.fillStyle(COLOR.ally, 1).fillTriangle(c, 3 * S, c - 10 * S, 17 * S, c + 10 * S, 17 * S).fillRect(c - 4 * S, 17 * S, 8 * S, 10 * S); }
        else if (k === 'dis') { g.fillStyle(COLOR.danger, 1).fillTriangle(c, 29 * S, c - 10 * S, 15 * S, c + 10 * S, 15 * S).fillRect(c - 4 * S, 5 * S, 8 * S, 10 * S); }
        else if (k === 'plain') { g.fillStyle(0x6a7893, 1).fillRect(4 * S, 4 * S, 24 * S, 24 * S); }
        else if (k === 'forest') { g.fillStyle(0x3d7d6e, 1).fillTriangle(c, 3 * S, 5 * S, 26 * S, 27 * S, 26 * S); }
        else if (k === 'mountain') { g.fillStyle(0xa0a6b8, 1).fillTriangle(c, 4 * S, 2 * S, 27 * S, 30 * S, 27 * S); }
        else if (k === 'water') { g.lineStyle(2 * S, 0x6fa0d8, 1); [10, 17, 24].forEach((y) => g.lineBetween(4 * S, y * S, 28 * S, y * S)); }
        else if (k === 'gold') { g.fillStyle(COLOR.accent, 1).fillCircle(c, c, 11 * S); g.lineStyle(2 * S, COLOR.accentLight, 1).strokeCircle(c, c, 11 * S); }
        else if (k === 'menu') { [8, 16, 24].forEach((y) => g.fillRect(5 * S, y * S - S, 22 * S, 2.5 * S)); }
        else if (k === 'star') { g.fillStyle(COLOR.accent, 1).fillPoints([{ x: c, y: 3 * S }, { x: c + 4 * S, y: 12 * S }, { x: c + 13 * S, y: 12 * S }, { x: c + 6 * S, y: 18 * S }, { x: c + 8 * S, y: 28 * S }, { x: c, y: 22 * S }, { x: c - 8 * S, y: 28 * S }, { x: c - 6 * S, y: 18 * S }, { x: c - 13 * S, y: 12 * S }, { x: c - 4 * S, y: 12 * S }], true); }
    }));
}
// 아틀라스 ico.<key>(예: ico.gold — 안아트 생성 예정)가 있으면 우선, 없으면 코드 아이콘(function 선언이라 위의 skinIcon 보다 먼저 써도 됨)
export const icon = (scene, key, size = 24) => skinIcon(scene, key, size) ?? scene.add.image(0, 0, `icon_${key}`).setDisplaySize(size, size);
