import Phaser from 'phaser';
import { ensureScope, texKey, withVer } from '../assets.js';
import { view, fs } from '../theme.js';
import { makeText, fitText } from './common.js';
import { portraitBox, troopBadges } from './HeroVisual.js';
import { heroPlainName, heroShortName } from '../systems/names.js';

export const HERO_CARD_RATIO = 1200 / 896;
const RANKS = ['s', 'a', 'b', 'c'];
const CARD_KEYS = new Set([...RANKS.flatMap((rank) => [`card.frame.${rank}`, `card.bg.${rank}`]), 'card.shade', 'atlas.card_icons']);
let layout = null;
let layoutRequest = null;

// 카드 35키 전체 대신 합성 프레임/배경/그라데이션/아이콘만 받는다. 실패 시 기존 카드로 표시한다.
// 레이아웃 JSON 1회 요청. 첫 영웅 탭 진입 때는 카드·초상화 에셋 요청이 몰려(특히 dev 서버) 작은 JSON 도 대기열에서 늦게 응답하므로
// 시도당 20초 + 1회 재시도. 그래도 실패하면 이번에는 기본 카드로 표시하고, 실패 결과는 캐시하지 않아 다음 영웅 탭 진입 때 다시 시도한다.
const LAYOUT_TIMEOUT_MS = 20000;
function fetchLayout() {
    return fetch(withVer('/assets/card/card_layout.json'), { signal: AbortSignal.timeout(LAYOUT_TIMEOUT_MS) })
        .then((response) => { if (!response.ok) throw new Error('card layout unavailable'); return response.json(); })
        .then((data) => {
            if (!data?.rects?.name_text || !data?.text?.cost || !data?.compact_mode?.compact_lv_rect) throw new Error('card layout invalid');
            return data;
        });
}

export async function ensureHeroMenuCards(scene) {
    layoutRequest ??= fetchLayout()
        .catch((e) => (e?.message === 'card layout invalid' ? Promise.reject(e) : fetchLayout())) // 형식 오류는 재시도해도 같으므로 제외
        .then((data) => { layout = data; return data; })
        .catch(() => { console.warn('[cards] 레이아웃을 불러오지 못해 기본 카드를 표시합니다'); layoutRequest = null; return null; });
    const [data, assets] = await Promise.all([
        layoutRequest,
        new Promise((resolve) => ensureScope(scene, 'cards', (ok, count) => resolve({ ok, count }), { filter: (key) => CARD_KEYS.has(key) })),
    ]);
    if (assets.ok && scene.sys.isActive()) {
        for (const logical of CARD_KEYS) {
            const key = logical === 'atlas.card_icons' ? 'card_icons' : texKey(logical);
            if (scene.textures.exists(key)) scene.textures.get(key).setFilter(logical === 'atlas.card_icons' ? Phaser.Textures.FilterMode.NEAREST : Phaser.Textures.FilterMode.LINEAR);
        }
    }
    return { ok: !!data && assets.ok, changed: assets.count > 0 || !!data };
}

// 다듬기(polish) 좌표: 합성 프레임 실측값(카드 폭 W 비율, card.frame.*@3x 픽셀 측정). card_layout.json 은 프레임 원본 스펙으로 두고
// 텍스트·칩 배치만 여기서 조정한다. 명판 안쪽 x 0.28~0.905 / y 0.049~0.134, 스탯 바 안쪽 x 0.137~0.732 / y 1.143~1.256,
// 코스트 메달 중심 (0.869, 1.19), 등급 깃발 x 0.045~0.18 / 꼬리 끝 y 0.377.
const P = {
    portraitTop: 0.09,                       // 초상화를 아래로 내려 명판·칭호가 얼굴(머리 윗부분)을 덜 가리게 한다
    name: { cx: 0.5925, cy: 0.0915, w: 0.58, size: 0.066, min: 0.046 },
    title: { cy: 0.172, h: 0.056, maxW: 0.66, size: 0.04, padX: 0.03 },
    crest: { x0: 0.05, x1: 0.176, top: 0.028, side: 0.172, tip: 0.228, letterY: 0.106, size: 0.088 },
    badge: { x: 0.045, y: 0.405, size: 0.088, pad: 0.012 },
    lv: { x: 0.065, cy: 1.088, h: 0.056, size: 0.042, padX: 0.022 },
    bar: { x0: 0.137, x1: 0.732, cy: 1.2, icon: 0.072, gap: 0.016, size: 0.066 },
    cost: { cx: 0.869, cy: 1.19, w: 0.1, size: 0.088 },
};
// 등급 글자색: 프레임 색과 같은 계열이되 남색 문장 위에서 또렷하게(C 는 칙칙한 회청 대신 밝은 은색)
const RANK_TEXT = { s: '#FFD86B', a: '#E2B4FF', b: '#7EEBDD', c: '#E8EEF5' };
const INK = '#0B1328';

// 한 줄 텍스트를 폭에 맞춘다: 글자 크기를 minSize 까지 줄여 보고, 그래도 넘치면 대체 문자열 → 말줄임(fitText) 순서.
function shrinkFit(text, maxW, minSize, fallback) {
    let size = parseFloat(text.style.fontSize);
    const floor = Math.max(1, Math.min(size, fs(minSize))); // makeText 와 같은 글자 크기 단계(fs) 적용
    while (text.width > maxW && size - 1 >= floor) { size -= 1; text.setFontSize(`${size}px`); }
    return fitText(text, maxW, { fallback });
}

export function heroMenuCard(scene, hero, x, y, w, h, selected = false) {
    const rank = String(hero.rarity ?? '').toLowerCase();
    const frameKey = texKey(`card.frame.${rank}`);
    const bgKey = texKey(`card.bg.${rank}`);
    const shadeKey = texKey('card.shade');
    if (!layout || !RANKS.includes(rank) || ![frameKey, bgKey, shadeKey].every((key) => scene.textures.exists(key))) return null;
    const card = scene.add.container(x, y);
    card.cardArt = true;
    card.clipH = h;
    const W = (v) => v * w;
    const minPx = (px) => px / view.scale; // 실제 화면 px 하한 → 논리 단위
    const rankColor = Phaser.Display.Color.HexStringToColor(RANK_TEXT[rank]).color;
    const image = (key) => scene.add.image(0, 0, key).setOrigin(0).setDisplaySize(w, h);
    card.add(image(bgKey));
    // 높이를 줄여 아래로 내리면 portraitBox 가 폭 전체를 유지하고 아래쪽(스탯 바에 가려지는 부분)만 잘라낸다.
    const top = W(P.portraitTop);
    card.portrait = portraitBox(scene, hero, 0, top, w, h - top, { lazy: true, border: false, focus: 0 });
    card.add([card.portrait, image(shadeKey), image(frameKey)]);
    if (selected) card.add(scene.add.rectangle(2, 2, w - 4, h - 4, 0xf0d58c, 0.12).setOrigin(0).setStrokeStyle(2, 0xf0d58c));

    // 가독성: 모든 글자에 남색 외곽선 + 아래 그림자
    const text = (cx, cy, value, size, color, { origin = [0.5, 0.5], strokeW = 0.007 } = {}) => {
        const t = makeText(scene, cx, cy, String(value), {
            size, color, bold: true, origin, stroke: { color: INK, width: Math.max(2, W(strokeW)) },
        });
        t.setShadow(0, Math.max(1, Math.round(W(0.006))), '#000000', 0, true, true);
        return t;
    };
    const chip = (cx, cy, cw, ch, alpha = 0.78, stroke = null) => {
        const g = scene.add.graphics();
        g.fillStyle(0x0b1328, alpha).fillRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, ch / 2);
        if (stroke != null) g.lineStyle(1, stroke, 0.9).strokeRoundedRect(cx - cw / 2, cy - ch / 2, cw, ch, ch / 2);
        return g;
    };

    // ① 이름(주) — 명판 안에서 크게, 넘치면 글자 축소 → 칭호 생략형 → 말줄임
    const nameT = text(W(P.name.cx), W(P.name.cy), heroPlainName(hero), Math.max(minPx(12), W(P.name.size)), layout.text.name.color);
    shrinkFit(nameT, W(P.name.w), Math.max(minPx(11), W(P.name.min)), heroShortName(hero));
    card.add(nameT);
    // ② 칭호(보조) — 명판 경계선에 걸치지 않게 명판 바로 아래 반투명 칩 위에 작게
    if (hero.title) {
        const tt = text(W(P.name.cx), W(P.title.cy), hero.title, Math.max(minPx(10), W(P.title.size)), '#EADFC0', { strokeW: 0.005 });
        shrinkFit(tt, W(P.title.maxW - P.title.padX * 2), minPx(9));
        const cw = Math.min(W(P.title.maxW), tt.width + W(P.title.padX * 2));
        card.add([chip(W(P.name.cx), W(P.title.cy), cw, W(P.title.h), 0.72), tt]);
    }

    // ⑥ 등급 문장 — 프레임마다 다르게 구워진 원/글자(B 는 원 밖으로 넘침)를 같은 방패 문장으로 덮어 S/A/B/C 형태를 통일
    {
        const c = P.crest; const cx = W((c.x0 + c.x1) / 2);
        const pts = [[c.x0 + 0.012, c.top], [c.x1 - 0.012, c.top], [c.x1, c.top + 0.012], [c.x1, c.side], [(c.x0 + c.x1) / 2, c.tip], [c.x0, c.side], [c.x0, c.top + 0.012]]
            .map(([px, py]) => ({ x: W(px), y: W(py) }));
        const g = scene.add.graphics();
        g.fillStyle(0x101c3a, 0.96).fillPoints(pts, true);
        g.lineStyle(Math.max(1.5, W(0.008)), rankColor, 1).strokePoints(pts, true);
        g.lineStyle(1, 0xf0d58c, 0.55).strokePoints(pts.map((p) => ({ x: cx + (p.x - cx) * 0.8, y: W(0.118) + (p.y - W(0.118)) * 0.82 })), true);
        const letter = text(cx, W(c.letterY), rank.toUpperCase(), Math.max(minPx(12), W(c.size)), RANK_TEXT[rank], { strokeW: 0.009 });
        card.add([g, letter]);
        card.rankCrest = g;
    }

    const compact = w * view.scale < layout.compact_mode.when_card_width_px_below;
    const stats = hero.detail?.stats ?? hero.stats;
    const statValues = [stats?.atk, stats?.def];
    const showStats = !compact && statValues.every((value) => typeof value === 'number' && Number.isFinite(value));
    const b = P.bar; const barCy = W(b.cy);
    // ③ Lv — 초상화에 묻히지 않게 반투명 칩(등급색 테두리). 좁은 카드(스탯 숨김)는 스탯 바 중앙에 표시
    if (showStats) {
        const lt = text(0, W(P.lv.cy), `Lv.${hero.level}`, Math.max(minPx(10), W(P.lv.size)), '#FFFFFF', { origin: [0, 0.5], strokeW: 0.005 });
        const cw = lt.width + W(P.lv.padX * 2);
        lt.x = W(P.lv.x) + W(P.lv.padX);
        card.add([chip(W(P.lv.x) + cw / 2, W(P.lv.cy), cw, W(P.lv.h), 0.82, rankColor), lt]);
    } else {
        card.add(fitText(text(W((b.x0 + b.x1) / 2), barCy, `Lv.${hero.level}`, Math.max(minPx(10), W(b.size)), '#FFFFFF'), W(b.x1 - b.x0)));
    }
    // ④ 코스트 숫자(메달 중앙)는 2026-11-08 사용자 요청으로 영웅 정보 화면에서 제거(코스트는 편성 화면에서 표시). 메달은 프레임 이미지에 구워져 있어 빈 메달로 남는다(P.cost 좌표는 보존)
    // ④ 공격/방어 — 바 안쪽을 반으로 나눠 [아이콘+값] 묶음을 각 칸 가운데 정렬, 칸 사이 얇은 구분선
    if (showStats) {
        const half = (b.x1 - b.x0) / 2;
        const g = scene.add.graphics();
        g.lineStyle(1, 0xf0d58c, 0.35).lineBetween(W(b.x0 + half), barCy - W(0.034), W(b.x0 + half), barCy + W(0.034));
        card.add(g);
        const hasAtlas = scene.textures.exists('card_icons');
        statValues.forEach((value, index) => {
            const frame = index === 0 ? 'ico.stat_atk' : 'ico.stat_def'; // 병력 통합 정책: HP 원수치는 노출하지 않는다.
            const iconS = W(b.icon);
            const icon = hasAtlas && scene.textures.get('card_icons').has(frame)
                ? scene.add.image(0, barCy, 'card_icons', frame).setDisplaySize(iconS, iconS).setOrigin(0, 0.5)
                : text(0, barCy, index === 0 ? '공' : '방', Math.max(minPx(10), W(b.size * 0.8)), '#F3DC8E', { origin: [0, 0.5], strokeW: 0.005 });
            const num = text(0, barCy, value, Math.max(minPx(11), W(b.size)), '#FFFFFF', { origin: [0, 0.5] });
            const slotW = W(half - 0.02);
            fitText(num, Math.max(W(0.05), slotW - iconS - W(b.gap)));
            const iw = icon.displayWidth ?? icon.width;
            const groupW = iw + W(b.gap) + num.width;
            const left = W(b.x0 + half * index + half / 2) - groupW / 2;
            icon.x = left; num.x = left + iw + W(b.gap);
            card.add([icon, num]);
        });
    }
    // ⑤ 병종 — 깃발 꼬리 아래로 내리고 반투명 받침으로 [영웅 병종 / 병사 병종] 두 뱃지를 한 묶음으로 보이게 한다(툴팁은 기존 유지)
    const heroClass = hero.unit_type ?? hero.detail?.unit_type;
    if (heroClass) {
        const size = W(P.badge.size); const pad = W(P.badge.pad);
        const badges = troopBadges(scene, {
            heroClass, troopClass: hero.troop_type ?? hero.detail?.troop_type,
            troopLabel: hero.troop_label ?? hero.detail?.troop_label, size, vertical: true,
        });
        const bw = badges.w ?? size; const bh = badges.h ?? size;
        const bx = W(P.badge.x) + pad; const by = W(P.badge.y) + pad;
        const plate = scene.add.graphics();
        plate.fillStyle(0x0b1328, 0.6).fillRoundedRect(bx - pad, by - pad, bw + pad * 2, bh + pad * 2, Math.min(W(0.03), (bw + pad * 2) / 2));
        plate.lineStyle(1, rankColor, 0.55).strokeRoundedRect(bx - pad, by - pad, bw + pad * 2, bh + pad * 2, Math.min(W(0.03), (bw + pad * 2) / 2));
        badges.setPosition(bx, by);
        card.add([plate, badges]);
        card.troopBadges = badges;
    }
    return card;
}
