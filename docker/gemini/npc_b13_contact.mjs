// npc_b13 QA 접촉 시트(호출 없음): 코드마다 [초상 | 아군 시트 x2(풀밭) | 적 시트 x1 | x1 idle 4방향], 2열. 실행: SHARP_DIR=/sp node docker/gemini/npc_b13_contact.mjs code1,code2 name
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [list, name] = process.argv.slice(2); const G = 'docker/gemini/npc_b13', P = JSON.parse(readFileSync(`${G}/plan.json`, 'utf8')).items;
const tileB = await sharp('public/assets/tiles/64/plain_a.png').resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
const grass = async (w, h) => { const c = []; for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) c.push({ input: tileB, left: x, top: y }); return sharp({ create: { width: w, height: h, channels: 4, background: '#000' } }).composite(c).png().toBuffer(); };
const esc = (s) => String(s).replace(/[<>&]/g, '');
const label = (t, w) => Buffer.from(`<svg width="${w}" height="22"><rect width="100%" height="100%" fill="#202020"/><text x="4" y="16" font-size="14" font-family="sans-serif" fill="#ffee55">${esc(t)}</text></svg>`);
const CW = 200 + 384 + 192 + 8 * 3 + 128, CH = 512 + 22, codes = list.split(','); const cols = 2, rows = Math.ceil(codes.length / cols); const comps = [];
for (const [i, code] of codes.entries()) {
  const x0 = (i % cols) * (CW + 12), y0 = Math.floor(i / cols) * (CH + 10); const h = P[code];
  const por = await sharp(h.portrait).resize({ width: 200, height: 268, fit: 'inside' }).flatten({ background: '#5a5a5a' }).png().toBuffer();
  comps.push({ input: label(`${code.slice(4)} ${h.name} [${h.tier}/${h.troop}]`, CW), left: x0, top: y0 }, { input: por, left: x0, top: y0 + 22 });
  const a = `${G}/sprite_out/64/hero_${code}_ally_sheet.png`, e = `${G}/sprite_out/64/hero_${code}_enemy_sheet.png`;
  const ax2 = await sharp(a).resize(384, 512, { kernel: 'nearest' }).png().toBuffer();
  comps.push({ input: await sharp(await grass(384, 512)).composite([{ input: ax2 }]).png().toBuffer(), left: x0 + 208, top: y0 + 22 });
  comps.push({ input: await sharp(await grass(192, 256)).composite([{ input: e }]).png().toBuffer(), left: x0 + 600, top: y0 + 22 });
  const ones = []; for (let r = 0; r < 4; r++) ones.push({ input: await sharp(a).extract({ left: 64, top: r * 64, width: 64, height: 64 }).png().toBuffer(), left: (r % 2) * 64, top: Math.floor(r / 2) * 64 });
  comps.push({ input: await sharp(await grass(128, 128)).composite(ones).png().toBuffer(), left: x0 + 800, top: y0 + 22 });
}
await sharp({ create: { width: cols * (CW + 12), height: rows * (CH + 10), channels: 3, background: '#303030' } }).composite(comps).png().toFile(`${G}/sprite_preview/contact_${name}.png`);
console.log('contact', name, codes.length);
