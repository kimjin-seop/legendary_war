import Phaser from 'phaser';
import { COLOR } from '../theme.js';
import { makeText } from './common.js';
import { skinHas, skinImage, skinIcon } from './skin.js';
import { pixelImage, pixelTroop } from './PixelBadge.js';
import { texKey, loaded } from '../assets.js';
import { unitClassGlyph } from '../systems/names.js';

// 병종·장비 슬롯·능력치 아이콘 공용(가운데 원점, size 정사각). 키 우선순위(안아트 아이콘 키가 생기면 코드 변경 없이 자동 사용):
//   1) 안아트 아이콘 세트(manifest ico.<group>.<code>.{64,32}, public/assets/ui/icons/set, boot scope): 표시 32 이하 = .32 우선, 그 위 = .64 우선
//      능력치(ico.stat.*)는 도트(manifest pixel/filter NEAREST): NEAREST 필터 + 표시 크기를 원본의 정수배(또는 1/2)로 맞춘다
//   2) 스킨 아틀라스 프레임 / 크기 접미사 없는 같은 논리 키 텍스처
//   3) 기존 도트 아이콘(병종 sym.troop.<code>, 능력치 pix.heart|atk|def) 또는 Graphics 도형(슬롯)
//   4) 글자(병종 글리프 한 글자 / 슬롯 첫 글자)
// 단, 병종(troopIcon)은 2026-11-08부터 3)도트 sym.troop 을 1순위로 쓴다(영웅 카드 도트 뱃지와 같은 그림으로 통일, 아래 troopIcon 주석)
const pixelSnap = (src, size) => { if (size >= src) return Math.max(1, Math.floor(size / src)) * src; return size >= src / 2 ? src / 2 : size; }; // 정수 배율(축소는 1/2 까지)
function keyed(scene, name, x, y, size) {
    const order = size <= 32 ? ['32', '64'] : ['64', '32'];
    for (const sz of order) {
        const lg = `${name}.${sz}`; const tk = texKey(lg);
        if (!scene.textures.exists(tk)) continue;
        const ent = loaded.manifest?.[lg];
        const pixel = ent?.pixel === true || String(ent?.filter ?? '').toUpperCase() === 'NEAREST';
        if (pixel) { try { scene.textures.get(tk).setFilter(Phaser.Textures.FilterMode.NEAREST); } catch { /* 필터 지정 실패는 무시 */ } }
        const d = pixel ? pixelSnap(Number(sz), size) : size;
        return scene.add.image(x, y, tk).setDisplaySize(d, d);
    }
    if (skinHas(scene, name)) { const im = skinImage(scene, name); im.setPosition(x, y).setDisplaySize(size, size); return im; }
    const tk = texKey(name);
    if (tk && scene.textures.exists(tk)) return scene.add.image(x, y, tk).setDisplaySize(size, size);
    return null;
}
export const troopIconCode = (type) => pixelTroop(type) ?? type ?? null;
// 안아트 병종 아이콘 키(ico.troop.<code>)만 확인(없으면 null). 2026-11-08 이후 troopIcon 내부 폴백 전용(호출부에서 직접 쓰지 말 것)
// 병종 코드 그대로 먼저, 없으면 도트 별칭(pixelTroop: lance->spear, bow->archer, sailor->naval, monk->healer, infantry/heavy->sword)
export function troopIconKeyed(scene, type, x, y, size = 24) { if (!type) return null; const code = troopIconCode(type); return keyed(scene, `ico.troop.${type}`, x, y, size) ?? (code && code !== type ? keyed(scene, `ico.troop.${code}`, x, y, size) : null); }
// 병종 아이콘 단일 소스(2026-11-08 사용자 '영웅 탭 영웅카드 병종 아이콘으로 통일'). 기준 = 영웅 카드 병종 뱃지(HeroVisual.troopBadges -> pixel_badges badge.hero/troop.<pixelTroop>)와 같은 그림:
//   1) 도트 sym.troop.<pixelTroop(type)> (영웅 카드 뱃지 안 그림과 같은 도트 병종 그림, 틀 없음)
//   2) 안아트 아이콘 세트 ico.troop.<type|code> (도트 11종에 없는 병종·아틀라스 미로드만. 영웅 카드 코드 그리기 폴백 classMark 와 같은 순서)
//   3) 병종 글자(names.unitClassGlyph). glyph:false 면 글자 대신 null
// 틀(원형·방패·받침)은 호출 화면이 그린다. 도트는 PixelBadge 정수배로 스냅되므로(목표보다 커질 수 있음) 틀 안에 넣는 곳은 max(표시 상한, unit)를 주면 상한 이하 정수배로 내린다(최소 1배)
export function troopIcon(scene, type, x, y, size = 24, { glyphColor = '#ffffff', glyph = true, glyphSize = null, stroke = 3, max = Infinity } = {}) {
    if (!type) return glyph ? makeText(scene, x, y, '?', { size: glyphSize ?? Math.max(10, Math.round(size * 0.62)), bold: true, color: glyphColor, origin: [0.5, 0.5] }) : null;
    const code = troopIconCode(type);
    const p = code ? pixelImage(scene, `sym.troop.${code}`, x, y, size) : null;
    if (p) {
        const m = p.pixelM ?? 1;
        if (m > 1 && p.displayWidth > max) { const m2 = Math.max(1, Math.floor((max / p.displayWidth) * m)); p.setScale((p.scaleX * m2) / m); p.pixelM = m2; }
        return p;
    }
    const a = troopIconKeyed(scene, type, x, y, size);
    if (a) return a;
    if (!glyph) return null;
    return makeText(scene, x, y, unitClassGlyph(type), { size: glyphSize ?? Math.max(10, Math.round(size * 0.62)), bold: true, color: glyphColor, origin: [0.5, 0.5], stroke: { color: '#0B1020', width: stroke } });
}
const STAT_PIX = { hp: 'pix.heart', atk: 'pix.atk', def: 'pix.def' };
const STAT_DOT = { hp: 0x5cc46a, atk: 0xe0663c, def: 0x4a9be8, move: 0x9a7be0, range: 0x48b8c8 };
export function statIcon(scene, key, x, y, size = 16) {
    const a = keyed(scene, `ico.stat.${key}`, x, y, size);
    if (a) return a;
    const p = STAT_PIX[key] ? pixelImage(scene, STAT_PIX[key], x, y, size) : null;
    if (p) return p;
    const g = scene.add.graphics({ x, y }); // 폴백: 항목 색 원 + 흰 테
    g.fillStyle(STAT_DOT[key] ?? COLOR.accent, 1).fillCircle(0, 0, size * 0.36).lineStyle(1.5, 0xffffff, 0.8).strokeCircle(0, 0, size * 0.36);
    if (g.displayWidth === undefined) { g.displayWidth = size; g.displayHeight = size; }
    return g;
}
// 장비 슬롯 도형(Graphics, 가운데 원점): 투구 = 반원 + 챙 / 갑옷 = 몸통 / 장갑 = 손 / 신발 = 장화 / 장신구 = 고리 + 보석
const SLOT_FIRST = { helm: '투', armor: '갑', gloves: '장', boots: '신', accessory: '신' };
export function slotIcon(scene, slot, x, y, size = 28, color = 0x9aa8c0) {
    const a = keyed(scene, `ico.slot.${slot}`, x, y, size);
    if (a) return a;
    const g = scene.add.graphics({ x, y }); const s = size / 2;
    g.lineStyle(Math.max(1.5, size * 0.07), color, 0.95).fillStyle(color, 0.22);
    if (slot === 'helm') { g.beginPath().arc(0, s * 0.15, s * 0.62, Math.PI, 0, false).closePath().fillPath().strokePath(); g.lineBetween(-s * 0.8, s * 0.15, s * 0.8, s * 0.15); g.lineBetween(0, -s * 0.47, 0, s * 0.15); }
    else if (slot === 'armor') { const P = [[-s * 0.7, -s * 0.6], [-s * 0.25, -s * 0.75], [0, -s * 0.5], [s * 0.25, -s * 0.75], [s * 0.7, -s * 0.6], [s * 0.55, s * 0.75], [-s * 0.55, s * 0.75]].map(([px, py]) => ({ x: px, y: py })); g.fillPoints(P, true).strokePoints(P, true); }
    else if (slot === 'gloves') { g.fillRoundedRect(-s * 0.45, -s * 0.2, s * 0.9, s * 0.85, 4).strokeRoundedRect(-s * 0.45, -s * 0.2, s * 0.9, s * 0.85, 4); [-0.3, -0.1, 0.1, 0.3].forEach((d) => g.lineBetween(s * d, -s * 0.2, s * d, -s * 0.7)); }
    else if (slot === 'boots') { const P = [[-s * 0.35, -s * 0.75], [s * 0.15, -s * 0.75], [s * 0.15, s * 0.25], [s * 0.75, s * 0.4], [s * 0.75, s * 0.75], [-s * 0.35, s * 0.75]].map(([px, py]) => ({ x: px, y: py })); g.fillPoints(P, true).strokePoints(P, true); }
    else if (slot === 'accessory') { g.strokeCircle(0, s * 0.15, s * 0.5); g.fillStyle(0x6fd6ff, 1).fillCircle(0, -s * 0.38, s * 0.2); }
    else { g.destroy(); return makeText(scene, x, y, SLOT_FIRST[slot] ?? '?', { size: Math.round(size * 0.5), bold: true, origin: [0.5, 0.5] }); }
    g.iconSize = size; if (g.displayWidth === undefined) { g.displayWidth = size; g.displayHeight = size; } // Graphics 는 표시 크기가 없어 배치(Tabs 등)용으로 지정
    return g;
}

// ---- 전투 목표 아이콘(목표 패널, 2026-11-04 사용자 '디자인 + 아이콘') ----
// 종류: defeat(격파·섬멸) / boss(적장 격파) / defend(수비·보호·확보) / reach(도달·탈출·호위 목적지) / escort(호위) / survive(턴 버티기·생존) / capture(점령) / flag(기본·헤더) / lose(패배 조건)
// 서버 objective/sub_objective type 우선, 없으면 문구 키워드. 아이콘: 기존 ico.stat.*(atk/def/move/hp) 재사용, 없는 종류는 Graphics 도형(새 그림 없음)
const OBJ_TYPE = { defeat_all: 'defeat', rout: 'defeat', defeated: 'defeat', clear: 'defeat', defeat_commander: 'boss', capture: 'capture', hold_zone: 'defend', protect_tiles: 'defend', survive_turns: 'survive', turn_within: 'survive', turn_gte: 'survive', unit_survive: 'escort', all_alive: 'escort', alive_count: 'escort', in_zone: 'reach', reach: 'reach', escape: 'reach' };
const OBJ_WORDS = [[/호위/, 'escort'], [/지켜|수비|방어|사수|보호|확보|버텨|막아/, 'defend'], [/도달|탈출|까지|이동|건너/, 'reach'], [/점령|함락|차지/, 'capture'], [/턴|라운드|생존|살아남|견뎌/, 'survive'], [/장수|지휘관|대장|총대장|적장|수장/, 'boss'], [/격파|섬멸|처치|전멸|물리쳐|쓰러뜨려|무찔러/, 'defeat']];
export function objKind(type, text = '') {
    if (type && OBJ_TYPE[type]) return OBJ_TYPE[type];
    const t = String(text ?? '');
    for (const [re, k] of OBJ_WORDS) if (re.test(t)) return k;
    return 'flag';
}
export function objIcon(scene, kind, x, y, size = 16, tint = null) {
    const statOf = { defeat: 'atk', defend: 'def', reach: 'move' }[kind];
    if (statOf) { const a = statIcon(scene, statOf, x, y, size); if (a) return a; }
    const g = scene.add.graphics({ x, y }); const s = size / 2; const col = tint ?? 0xf0d58c;
    if (kind === 'flag' || kind === 'capture') { // 깃대 + 삼각 깃발(점령 = 붉은 깃발)
        g.lineStyle(2, 0xe8e2cf, 1).lineBetween(-s * 0.55, -s * 0.85, -s * 0.55, s * 0.9);
        g.fillStyle(kind === 'capture' ? 0xd8584a : col, 1).fillTriangle(-s * 0.45, -s * 0.85, s * 0.8, -s * 0.45, -s * 0.45, -s * 0.05);
    } else if (kind === 'survive') { // 모래시계
        g.fillStyle(0x9fd8ff, 0.9).fillTriangle(-s * 0.55, -s * 0.8, s * 0.55, -s * 0.8, 0, 0).fillTriangle(-s * 0.55, s * 0.8, s * 0.55, s * 0.8, 0, 0);
        g.lineStyle(1.5, 0xe8e2cf, 1).lineBetween(-s * 0.7, -s * 0.85, s * 0.7, -s * 0.85).lineBetween(-s * 0.7, s * 0.85, s * 0.7, s * 0.85);
    } else if (kind === 'escort') { // 수레(상자 + 바퀴 둘)
        g.fillStyle(0xc89a5a, 1).fillRect(-s * 0.8, -s * 0.45, s * 1.6, s * 0.75); g.lineStyle(1.5, 0x0b1020, 0.9).strokeRect(-s * 0.8, -s * 0.45, s * 1.6, s * 0.75);
        g.fillStyle(0xe8e2cf, 1).fillCircle(-s * 0.45, s * 0.5, s * 0.28).fillCircle(s * 0.45, s * 0.5, s * 0.28);
    } else if (kind === 'boss') { // 적장 격파: 표적(동심원 2개 + 가운데 점 + 십자 눈금). 붉은 X 원은 실패처럼 읽혀 교체(강화면 gacha108)
        g.lineStyle(1.8, 0xf0b04a, 1).strokeCircle(0, 0, s * 0.85).strokeCircle(0, 0, s * 0.48);
        g.fillStyle(0xf0b04a, 1).fillCircle(0, 0, s * 0.16);
        g.lineStyle(1.5, 0xf0e6d0, 0.9).lineBetween(0, -s, 0, -s * 0.6).lineBetween(0, s * 0.6, 0, s).lineBetween(-s, 0, -s * 0.6, 0).lineBetween(s * 0.6, 0, s, 0);
    } else if (kind === 'lose') { // 패배 조건: 붉은 원 + 느낌표
        g.fillStyle(0xc0504a, 1).fillCircle(0, 0, s * 0.9).fillStyle(0xffffff, 1).fillRect(-1.2, -s * 0.55, 2.4, s * 0.7).fillCircle(0, s * 0.42, 1.5);
    } else { g.fillStyle(col, 1).fillCircle(0, 0, s * 0.45); }
    if (g.displayWidth === undefined) { g.displayWidth = size; g.displayHeight = size; }
    return g;
}

// ---- 전투 행동 메뉴 아이콘(ContextMenu 항목 icon, 2026-11-07 사용자 '버튼 글자 앞 아이콘') ----
// 기존 에셋 재사용 우선(새 그림 없음): attack = ico.stat.atk(도트 칼) / skill = 별(아틀라스 ico.star -> 코드 별 icon_star) /
// item = 아틀라스 ico.inventory(가방) / wait = card_icons ico.hourglass(모래시계) -> 목표 아이콘 모래시계 도형 / cancel = 아틀라스 ico.back(화살표).
// 텍스처가 없으면 남색+금박 톤 Graphics 글리프(가운데 원점, displayWidth = size). 알 수 없는 키는 null(글자만)
const GOLD = 0xe0b85a; const GOLD_L = 0xf3dc9a; const NAVY = 0x0b1020;
function glyph(scene, kind, size) {
    const g = scene.add.graphics(); const s = size / 2;
    g.lineStyle(Math.max(1.5, size * 0.08), NAVY, 0.9).fillStyle(GOLD, 1);
    if (kind === 'item') { g.fillRoundedRect(-s * 0.7, -s * 0.35, s * 1.4, s * 1.15, 3).strokeRoundedRect(-s * 0.7, -s * 0.35, s * 1.4, s * 1.15, 3); g.lineStyle(Math.max(1.5, size * 0.08), GOLD_L, 1).beginPath().arc(0, -s * 0.35, s * 0.38, Math.PI, 0, false).strokePath(); }
    else if (kind === 'cancel') { g.fillTriangle(-s * 0.85, 0, -s * 0.15, -s * 0.7, -s * 0.15, s * 0.7).fillRect(-s * 0.2, -s * 0.28, s * 1.0, s * 0.56); }
    else if (kind === 'skill') { const P = []; for (let i = 0; i < 10; i++) { const r = i % 2 ? s * 0.4 : s * 0.9; const a = -Math.PI / 2 + (i * Math.PI) / 5; P.push({ x: Math.cos(a) * r, y: Math.sin(a) * r }); } g.fillPoints(P, true).strokePoints(P, true); }
    else { g.destroy(); return null; }
    if (g.displayWidth === undefined) { g.displayWidth = size; g.displayHeight = size; }
    return g;
}
export function actionIcon(scene, kind, size = 22) {
    if (kind === 'attack') return statIcon(scene, 'atk', 0, 0, size);
    if (kind === 'skill') {
        if (skinHas(scene, 'ico.star')) { const im = skinImage(scene, 'ico.star'); return im.setDisplaySize(size, size); }
        if (scene.textures.exists('icon_star')) return scene.add.image(0, 0, 'icon_star').setDisplaySize(size, size); // skin.generateIcons 코드 별(부팅 시 생성)
        return glyph(scene, 'skill', size);
    }
    if (kind === 'item') return skinIcon(scene, 'inventory', size) ?? glyph(scene, 'item', size);
    if (kind === 'wait') {
        const T = scene.textures;
        if (T.exists('card_icons') && T.get('card_icons').has('ico.hourglass')) return scene.add.image(0, 0, 'card_icons', 'ico.hourglass').setDisplaySize(size, size);
        return objIcon(scene, 'survive', 0, 0, size);
    }
    if (kind === 'cancel') return skinIcon(scene, 'back', size) ?? glyph(scene, 'cancel', size);
    return null;
}
