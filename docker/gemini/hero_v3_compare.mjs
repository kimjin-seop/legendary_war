// 초상화-스프라이트 비교 시트(호출 없음): [초상화] [아군 시트 x2, 풀밭 위] [적군 시트 x2] [x1 실제 크기 4방향 idle]
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_v3_compare.mjs <sheetDir(64 폴더의 상위)> <outDir> code1,code2
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [dir, outDir, list] = process.argv.slice(2); mkdirSync(outDir, { recursive: true });
const H = 512, tileB = await sharp('public/assets/tiles/64/plain_a.png').resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
const grass = async (w, h) => { const c = []; for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) c.push({ input: tileB, left: x, top: y }); return sharp({ create: { width: w, height: h, channels: 4, background: '#000' } }).composite(c).png().toBuffer(); };
const label = (t, w) => Buffer.from(`<svg width="${w}" height="24"><rect width="100%" height="100%" fill="#202020"/><text x="6" y="17" font-size="15" font-family="sans-serif" fill="#ffee55">${t}</text></svg>`);
for (const code of list.split(',')) {
  const por = await sharp(`public/assets/portraits/${code}.png`).resize({ height: H }).flatten({ background: '#5a5a5a' }).png().toBuffer(); const pm = await sharp(por).metadata();
  const comps = [{ input: label(`${code} | portrait`, pm.width), left: 0, top: 0 }, { input: por, left: 0, top: 24 }]; let x = pm.width + 8;
  for (const side of ['ally', 'enemy']) {
    const sh = await sharp(`${dir}/64/hero_${code}_${side}_sheet.png`).resize(384, 512, { kernel: 'nearest' }).png().toBuffer();
    comps.push({ input: label(`${side} sheet x2 (walk1/idle/walk2, down/left/right/up)`, 384), left: x, top: 0 }, { input: await sharp(await grass(384, 512)).composite([{ input: sh }]).png().toBuffer(), left: x, top: 24 }); x += 392;
  }
  const g1 = await grass(128, 128); const ones = [];
  for (let r = 0; r < 4; r++) ones.push({ input: await sharp(`${dir}/64/hero_${code}_ally_sheet.png`).extract({ left: 64, top: r * 64, width: 64, height: 64 }).png().toBuffer(), left: 32 + (r % 2) * 64 - 32, top: Math.floor(r / 2) * 64 });
  comps.push({ input: label('x1', 128), left: x, top: 0 }, { input: await sharp(g1).composite(ones).png().toBuffer(), left: x, top: 24 }); x += 136;
  await sharp({ create: { width: x, height: H + 24, channels: 3, background: '#303030' } }).composite(comps).png().toFile(`${outDir}/${code}_compare.png`);
  console.log('ok', code);
}
