import { COLOR } from '../theme.js';
import { skinHas, skinImage } from './skin.js';
import { itemIconFrame } from '../systems/items.js';

// 소모품 아이콘(가운데 원점, size 정사각): 스킨 아틀라스에 ico.item.<code> 가 있으면 그 프레임, 없으면 코드 도형
// 코드 폴백: 회복약 = 둥근 병(소/중/대 = 붉은 물약 높이 차이), 강장제 = 금색 병 + 위쪽 화살표
const LIQ = { potion_s: 0.45, potion_m: 0.65, potion_l: 0.85 };
export function itemIcon(scene, it, x, y, size = 40) {
    const fr = itemIconFrame(it?.code);
    if (it?.code && skinHas(scene, fr)) { const im = skinImage(scene, fr); im.setPosition(x, y).setDisplaySize(size, size); return im; }
    const g = scene.add.graphics({ x, y });
    const r = size * 0.3; const cy = size * 0.08;
    const buff = it?.kind === 'buff';
    const liquid = buff ? 0xe8b84a : 0xd8464a;
    g.fillStyle(COLOR.ink, 0.9).fillCircle(0, cy, r + 2);
    const lv = LIQ[it?.code] ?? 0.7; // 물약 높이(원 지름 대비, 아래쪽부터)
    g.fillStyle(liquid, 1).fillCircle(0, cy, r - 1);
    // 빈 윗부분: 수면(y = cy + r(1 - 2lv)) 위 원호 + 현으로 닫은 조각을 어두운 색으로 덮는다
    const sn = Math.max(-0.999, Math.min(0.999, 1 - 2 * lv)); const a1 = Math.asin(sn); const a2 = Math.PI - a1;
    g.fillStyle(0x2a3550, 1).beginPath().arc(0, cy, r - 1, a2, a1 + Math.PI * 2, false).closePath().fillPath();
    g.fillStyle(0x9aa8c0, 1).fillRect(-r * 0.35, cy - r - size * 0.16, r * 0.7, size * 0.16); // 병목
    g.fillStyle(0x8a5a2a, 1).fillRect(-r * 0.45, cy - r - size * 0.24, r * 0.9, size * 0.09); // 마개
    g.lineStyle(1.5, 0xffffff, 0.5).strokeCircle(0, cy, r);
    if (buff) g.lineStyle(2.5, 0xffffff, 1).lineBetween(0, cy + r * 0.45, 0, cy - r * 0.45).lineBetween(0, cy - r * 0.45, -r * 0.35, cy - r * 0.1).lineBetween(0, cy - r * 0.45, r * 0.35, cy - r * 0.1);
    return g;
}
