// 주인공 초상화-스프라이트 1:1 비교 시트(호출 없음). 얼굴 1종 = 1행: [neutral 초상화] [base 시트 x2] [sword..heavy 시트 x2(있는 것만)] — 풀밭 타일 위.
// 출력: docker/gemini/protagonist_preview/compare_<face>.png. 실행: SHARP_DIR=/sp node docker/gemini/protagonist_compare.mjs
import { createRequire } from 'node:module';
import { existsSync, mkdirSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/sp'}/`)('sharp');
const SD = 'docker/gemini/protagonist_out/sprites/64', PV = 'docker/gemini/protagonist_preview'; mkdirSync(PV, { recursive: true });
const tileB = await sharp('public/assets/tiles/64/plain_a.png').resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
const grass = async (w, h) => { const c = []; for (let y = 0; y < h; y += 128) for (let x = 0; x < w; x += 128) c.push({ input: tileB, left: x, top: y }); return sharp({ create: { width: w, height: h, channels: 4, background: '#000' } }).composite(c).png().toBuffer(); };
const label = (t, w) => Buffer.from(`<svg width="${w}" height="24"><rect width="100%" height="100%" fill="#202020"/><text x="6" y="17" font-size="15" font-family="sans-serif" fill="#ffee55">${t}</text></svg>`);
for (const face of ['male_a', 'male_b', 'male_c', 'female_a', 'female_b', 'female_c']) {
  const pf = `public/assets/portraits/protagonist/protagonist_${face}_neutral.png`; if (!existsSync(pf)) continue;
  const por = await sharp(pf).resize({ height: 512 }).flatten({ background: '#5a5a5a' }).png().toBuffer(); const pw = (await sharp(por).metadata()).width;
  const comps = [{ input: label(face, pw), left: 0, top: 0 }, { input: por, left: 0, top: 24 }]; let x = pw + 8, n = 0;
  for (const cls of ['base', 'sword', 'spear', 'archer', 'cavalry', 'heavy']) {
    const f = `${SD}/hero_sheet_${face}_${cls}_ally_sheet.png`; if (!existsSync(f)) continue; n++;
    const sh = await sharp(f).resize(384, 512, { kernel: 'nearest' }).png().toBuffer();
    comps.push({ input: label(cls, 384), left: x, top: 0 }, { input: await sharp(await grass(384, 512)).composite([{ input: sh }]).png().toBuffer(), left: x, top: 24 }); x += 392;
  }
  if (!n) continue;
  await sharp({ create: { width: x, height: 536, channels: 3, background: '#303030' } }).composite(comps).png().toFile(`${PV}/compare_${face}.png`); console.log('compare', face, n);
}
