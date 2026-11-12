// 전후 비교 이미지: hero_dir_preview/before/<시트> vs 현재 시트. 풀밭 타일 위.
// 각 영웅: 1행 = 이전(x3) 12프레임(아군), 2행 = 이후(x3) 12프레임, 오른쪽 끝 = x1 원본 크기 4방향 idle(이전 위 / 이후 아래, 아군·적 교대)
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_dir_compare.mjs code1,code2 → docker/gemini/hero_dir_preview/<code>_r2_compare.png
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const S = 'public/assets/sprites/64', PV = 'docker/gemini/hero_dir_preview';
const tile = await sharp('public/assets/tiles/64/plain_a.png').png().toBuffer();
const frame = (f, r, c, sc) => sharp(f).extract({ left: c * 64, top: r * 64, width: 64, height: 64 }).resize(64 * sc, 64 * sc, { kernel: 'nearest' }).png().toBuffer();
const bg = (sc) => sharp(tile).resize(64 * sc, 64 * sc, { kernel: 'nearest' }).png().toBuffer();
for (const code of (process.argv[2] ?? '').split(',').filter(Boolean)) {
  const pairs = [[`${PV}/before/hero_${code}_ally_sheet.png`, `${PV}/before/hero_${code}_enemy_sheet.png`], [`${S}/hero_${code}_ally_sheet.png`, `${S}/hero_${code}_enemy_sheet.png`]];
  if (!existsSync(pairs[0][0])) { console.log(`[${code}] before 없음`); continue; }
  const comps = []; const sc = 3, B3 = await bg(3), B1 = await bg(1);
  for (let p = 0; p < 2; p++) { const [a, e] = pairs[p];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const x = (r * 3 + c) * 192, y = p * 200; comps.push({ input: B3, left: x, top: y }, { input: await frame(a, r, c, sc), left: x, top: y }); }
    for (let r = 0; r < 4; r++) for (const [i, f] of [[0, a], [1, e]]) { const x = 12 * 192 + 16 + r * 140 + i * 68, y = p * 200 + 60; comps.push({ input: B1, left: x, top: y }, { input: await frame(f, r, 1, 1), left: x, top: y }); } }
  await sharp({ create: { width: 12 * 192 + 16 + 4 * 140, height: 392, channels: 4, background: '#202020' } }).composite(comps).png().toFile(`${PV}/${code}_r2_compare.png`);
  console.log(`[${code}] ${PV}/${code}_r2_compare.png`);
}
