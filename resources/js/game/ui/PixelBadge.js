import { loaded } from '../assets.js';
import { L } from '../layout.js';
import { normRarity, RARITY_STARS } from '../rarity.js';
import { typeAlias } from '../data/rules.js';

// 도트 뱃지·표식(안아트 pixel_badges 아틀라스, manifest atlas.pixel_badges — 부팅 1회 로드, NEAREST).
// 프레임 이름 = 조각 키: badge.hero.<troop> / badge.troop.<troop> / sym.troop.<troop> / badge.rarity.<S|A|B|C> / badge.rank.<tier> / pix.<name>
// 선명도 규칙: 표시 크기는 원본 도트 크기(@1x 기준, 예 32px)의 정수배(1x/2x/3x...)를 화면 백킹 픽셀 기준으로 맞춘다.
//   카메라 zoom = L.u(unit -> 백킹 px) 이므로 표시 unit = m * 원본px / L.u, m = round(목표 unit * L.u / 원본px) (최소 1).
//   아틀라스 해상도(@3x/@2x)는 assets.skinFiles 가 기존 해상도 규칙으로 고르고(@1.5x 금지), N배 nearest 원본을 m배로 표시해도 도트 1개 = m px 로 균일.
// 아틀라스가 없거나 프레임이 없으면 null(호출 측 기존 코드 그리기 폴백).
export const PIXEL_ATLAS = 'pixel_badges';
// 병종 키 별칭(서버/구 코드 -> 도트 병종 11종: sword|spear|cavalry|naval|archer|mage|healer|monster|assassin|gunner|flyer). flying(에셋 파일명 계열, SkillIcon UNIT_ALIAS 와 같음) -> flyer
export const PIXEL_TROOP_ALIAS = { infantry: 'sword', heavy: 'sword', lance: 'spear', bow: 'archer', sailor: 'naval', monk: 'healer', flying: 'flyer' };
export const pixelTroop = (t) => (t ? PIXEL_TROOP_ALIAS[t] ?? typeAlias(t) : null); // 표에 없는 퇴역 병종은 서버 alias_of 대체

export const pixelHas = (scene, name) => !!name && scene.textures.exists(PIXEL_ATLAS) && scene.textures.get(PIXEL_ATLAS).has(name);

// 정수배 표시 배율 계산(테스트 가능하도록 순수 함수): 반환 { m, scale, w, h } — scale 은 아틀라스 프레임에 곱할 값(unit 좌표계)
export function pixelFit(frameW, frameH, atlasScale, targetUnits, u) {
    const N = atlasScale > 0 ? atlasScale : 1;
    const base = frameW / N; // 원본(@1x) 도트 px
    const uu = u > 0 ? u : 1;
    const m = Math.max(1, Math.round((targetUnits * uu) / base));
    const scale = m / (N * uu);
    return { m, scale, w: frameW * scale, h: frameH * scale };
}

// 도트 이미지 1개(원점 0.5). size = 목표 표시 크기(unit, 가로 기준). 없으면 null
export function pixelImage(scene, name, x, y, size) {
    if (!pixelHas(scene, name)) return null;
    const img = scene.add.image(x, y, PIXEL_ATLAS, name);
    const f = pixelFit(img.frame.realWidth, img.frame.realHeight, loaded.pixelScale ?? 3, size, Number(L.u) || 1);
    img.setScale(f.scale);
    img.pixelM = f.m;
    return img;
}

// 등급 표식: badge.rarity.<R> + 별(pix.star x 등급 별 수, 나머지 pix.star_empty, 최대 4). 좌상단 원점 컨테이너(.w/.h). 아틀라스 없으면 null
export function rarityMark(scene, rarity, { size = 20, stars = true } = {}) {
    const r = normRarity(rarity);
    if (!pixelHas(scene, `badge.rarity.${r}`)) return null;
    const c = scene.add.container(0, 0);
    const b = pixelImage(scene, `badge.rarity.${r}`, 0, 0, size).setOrigin(0, 0);
    c.add(b);
    let x = b.displayWidth + 2; let h = b.displayHeight;
    if (stars && pixelHas(scene, 'pix.star')) {
        const n = RARITY_STARS[r] ?? 1;
        const ss = size * 0.62;
        const total = pixelHas(scene, 'pix.star_empty') ? 4 : n;
        for (let i = 0; i < total; i++) {
            const s = pixelImage(scene, i < n ? 'pix.star' : 'pix.star_empty', 0, 0, ss);
            s.setOrigin(0, 0.5).setPosition(x, b.displayHeight / 2);
            c.add(s);
            x += s.displayWidth;
            h = Math.max(h, s.displayHeight);
        }
    }
    c.w = x; c.h = h;
    return c;
}

// 아이콘 + 텍스트 표식(pix.cost / pix.level 등). 아틀라스 없으면 null
export function pixelLabel(scene, name, text, makeText, { size = 14, textStyle = {} } = {}) {
    if (!pixelHas(scene, name)) return null;
    const c = scene.add.container(0, 0);
    const i = pixelImage(scene, name, 0, 0, size).setOrigin(0, 0.5);
    const t = makeText(scene, i.displayWidth + 3, 0, text, { size: Math.round(size * 0.9), origin: [0, 0.5], ...textStyle });
    c.add([i, t]);
    c.w = i.displayWidth + 3 + t.width; c.h = Math.max(i.displayHeight, t.height);
    return c;
}

// 랭킹 티어 배지(badge.rank.<tier>). 서버 tier 가 오면 그 값, 없으면 순위 기반 임시 규칙(문기획 확정 전 가정):
// 1위 master, 2~3위 diamond, 4~10위 gold, 11~25위 silver, 26위~ bronze. platinum 은 5종 우선 정책으로 미사용.
export function rankTier(entry) {
    const t = String(entry?.tier ?? '').toLowerCase();
    if (['bronze', 'silver', 'gold', 'platinum', 'diamond', 'master'].includes(t)) return t;
    const r = Number(entry?.rank);
    if (!Number.isFinite(r) || r < 1) return null;
    return r === 1 ? 'master' : r <= 3 ? 'diamond' : r <= 10 ? 'gold' : r <= 25 ? 'silver' : 'bronze';
}
