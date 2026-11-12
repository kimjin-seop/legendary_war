// 문화권 시트 미리보기. (1) 기본: 행=병종, 열=default(down,left,right,up) | <culture>(…) idle 칸, 아군, 타일 위, x2 → preview_<culture>_vs_default.png
//                     (2) team 모드: 열=<culture> 아군 4방향 | <culture> 적 4방향 → preview_<culture>_team.png  (x2)
// 실행: SHARP_DIR=/tmp/pp node docker/gemini/preview_culture.mjs <culture> [team]
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const culture = process.argv[2] ?? 'korea'; const team = process.argv[3] === 'team'; const T = ['sword', 'spear', 'cavalry', 'archer', 'mage', 'healer', 'heavy', 'flying'];
const S = 'public/assets/sprites', tile = await sharp('public/assets/tiles/64/plain_a.png').png().toBuffer(); const comps = []; const K = 2;
for (let r = 0; r < T.length; r++) for (let side = 0; side < 2; side++) {
  const cf = `${S}/64/${culture}_${T[r]}_${team && side === 1 ? 'enemy' : 'ally'}_sheet.png`; const f = team || side === 1 ? (existsSync(cf) ? cf : null) : `${S}/64/${T[r]}_ally_sheet.png`;
  for (let d = 0; d < 4; d++) { const x = (side * 4 + d) * 64 * K, y = r * 64 * K; comps.push({ input: await sharp(tile).resize(64 * K, 64 * K, { kernel: 'nearest' }).png().toBuffer(), left: x, top: y });
    if (f) comps.push({ input: await sharp(f).extract({ left: 64, top: d * 64, width: 64, height: 64 }).resize(64 * K, 64 * K, { kernel: 'nearest' }).png().toBuffer(), left: x, top: y }); } }
await sharp({ create: { width: 8 * 64 * K, height: (existsSync(`${S}/64/${culture}_flying_ally_sheet.png`) ? 8 : 7) * 64 * K, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${S}/preview_${culture}_${team ? 'team' : 'vs_default'}.png`);
console.log('ok');
