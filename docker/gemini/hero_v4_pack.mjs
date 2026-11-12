// QA 보조(호출 없음): [초상화 | 아군 시트 x2] 를 4명씩 한 장으로 묶음. 사용: node hero_v4_pack.mjs <sheetDir(64 상위)> <outPrefix> code1,code2,... [sheetSuffix]
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/sp'}/`)('sharp');
const [dir, pre, list] = process.argv.slice(2); const codes = list.split(',');
const alias = { gwak_jae_u: 'gwak_jaeu', kim_si_min: 'kim_simin' };
const label = (t, w) => Buffer.from(`<svg width="${w}" height="22"><rect width="100%" height="100%" fill="#202020"/><text x="4" y="16" font-size="15" font-family="sans-serif" fill="#ffee55">${t}</text></svg>`);
const tile = await sharp('public/assets/tiles/64/plain_a.png').resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
for (let p = 0; p * 4 < codes.length; p++) {
  const comps = []; const part = codes.slice(p * 4, p * 4 + 4);
  for (let i = 0; i < part.length; i++) {
    const c = part[i], s = alias[c] ?? c, x0 = (i % 2) * 780, y0 = Math.floor(i / 2) * 540;
    const por = await sharp(`public/assets/portraits/${s}.png`).resize({ height: 512, width: 380, fit: 'inside' }).flatten({ background: '#5a5a5a' }).png().toBuffer();
    const g = []; for (let y = 0; y < 512; y += 128) for (let x = 0; x < 384; x += 128) g.push({ input: tile, left: x, top: y });
    const sh = await sharp(`${dir}/64/hero_${s}_ally_sheet.png`).resize(384, 512, { kernel: 'nearest' }).png().toBuffer();
    const bg = await sharp({ create: { width: 384, height: 512, channels: 4, background: '#000' } }).composite([...g, { input: sh }]).png().toBuffer();
    comps.push({ input: label(c, 772), left: x0, top: y0 }, { input: por, left: x0, top: y0 + 22 }, { input: bg, left: x0 + 388, top: y0 + 22 });
  }
  await sharp({ create: { width: 1560, height: Math.ceil(part.length / 2) * 540, channels: 3, background: '#303030' } }).composite(comps).png().toFile(`${pre}_${p + 1}.png`);
}
console.log('ok');
