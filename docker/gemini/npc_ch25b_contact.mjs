// npc_ch25b QA 접촉 시트(호출 없음, npc_b11_contact.mjs 변형): 코드마다 [초상 | 아군 시트 x2(풀밭) | 적 시트 x1 | x1 idle 4방향 | 배 오버레이 위 idle(아군·적, x2)]. 실행: SHARP_DIR=/sp node docker/gemini/npc_ch25b_contact.mjs code1,code2 name
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const { plan } = await import('file:///app/docker/gemini/npc_ch25b_style.mjs');
const [list, name] = process.argv.slice(2); const G = 'docker/gemini/npc_ch25b', P = await plan();
const tileB = await sharp('public/assets/tiles/64/plain_a.png').resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
const grass = async (w, h) => { const c = []; for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) c.push({ input: tileB, left: x, top: y }); return sharp({ create: { width: w, height: h, channels: 4, background: '#000' } }).composite(c).png().toBuffer(); };
const label = (t, w) => Buffer.from(`<svg width="${w}" height="22"><rect width="100%" height="100%" fill="#202020"/><text x="4" y="16" font-size="14" font-family="sans-serif" fill="#ffee55">${String(t).replace(/[<>&]/g, '')}</text></svg>`);
const SO = 'public/assets/sprites/ship_overlay', ship = (c) => (P[c].side === 'ally' ? 'default' : 'china_junk');
const fr = async (f, c, r) => sharp(f).extract({ left: c * 64, top: r * 64, width: 64, height: 64 }).png().toBuffer();
const water = await sharp({ create: { width: 64, height: 64, channels: 4, background: '#1d4f86ff' } }).png().toBuffer();
const CW = 200 + 384 + 192 + 128 + 8 * 4 + 256, CH = 512 + 22, codes = list.split(','); const comps = [];
for (const [i, code] of codes.entries()) {
  const x0 = 0, y0 = i * (CH + 10); const h = P[code];
  const por = await sharp(h.portrait).resize({ width: 200, height: 268, fit: 'inside' }).flatten({ background: '#5a5a5a' }).png().toBuffer();
  comps.push({ input: label(`${code.slice(4)} [${h.troop}/${h.side}]`, CW), left: x0, top: y0 }, { input: por, left: x0, top: y0 + 22 });
  const a = `${G}/sprite_out/64/hero_${code}_ally_sheet.png`, e = `${G}/sprite_out/64/hero_${code}_enemy_sheet.png`;
  comps.push({ input: await sharp(await grass(384, 512)).composite([{ input: await sharp(a).resize(384, 512, { kernel: 'nearest' }).png().toBuffer() }]).png().toBuffer(), left: x0 + 208, top: y0 + 22 });
  comps.push({ input: await sharp(await grass(192, 256)).composite([{ input: e }]).png().toBuffer(), left: x0 + 600, top: y0 + 22 });
  const ones = []; for (let r = 0; r < 4; r++) ones.push({ input: await fr(a, 1, r), left: (r % 2) * 64, top: Math.floor(r / 2) * 64 });
  comps.push({ input: await sharp(await grass(128, 128)).composite(ones).png().toBuffer(), left: x0 + 800, top: y0 + 22 });
  if (h.troop === 'naval') { const s = ship(code); let k = 0;
    for (const [f, r] of [[a, 0], [a, 1], [e, 0], [e, 3]]) {
      const lay = [{ input: await fr(`${SO}/ship_${s}_back.png`, 0, r) }, { input: await fr(f, 1, r) }, { input: await fr(`${SO}/ship_${s}_front.png`, 0, r) }];
      const c = await sharp(water).composite(lay).png().toBuffer();
      comps.push({ input: await sharp(c).resize(128, 128, { kernel: 'nearest' }).png().toBuffer(), left: x0 + 936 + (k % 2) * 128, top: y0 + 22 + Math.floor(k / 2) * 128 }); k++; } }
}
await sharp({ create: { width: CW, height: codes.length * (CH + 10), channels: 3, background: '#303030' } }).composite(comps).png().toFile(`${G}/sprite_preview/contact_${name}.png`);
console.log('contact', name, codes.length);
