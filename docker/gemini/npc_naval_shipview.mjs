// QA 보조(호출 없음): 수병 시트를 배 오버레이(back→유닛→front)와 겹쳐 x3 미리보기. 행 = 문화권/배, 열 = down/left/right/up idle(아군) + down idle(적)
// 사용: node npc_naval_shipview.mjs <sheetDir(64 상위)> <out.png>
import { createRequire } from 'node:module'; const sharp = createRequire('/sp/')('sharp');
const [dir, out] = process.argv.slice(2); const SO = 'public/assets/sprites/ship_overlay';
const rows = [['naval_japan', 'japan_sekibune'], ['naval_japan', 'japan_atakebune'], ['naval_korea', 'korea_panokseon'], ['naval_default', 'default']];
const fr = async (f, c, r) => sharp(f).extract({ left: c * 64, top: r * 64, width: 64, height: 64 }).png().toBuffer();
const water = await sharp({ create: { width: 64, height: 64, channels: 3, background: '#1d4f86' } }).png().toBuffer();
const comps = []; let y = 0;
for (const [s, ship] of rows) { let x = 0;
  for (const [side, r] of [['ally', 0], ['ally', 1], ['ally', 2], ['ally', 3], ['enemy', 0], ['enemy', 1]]) {
    const u = await fr(`${dir}/64/hero_${s}_${side}_sheet.png`, 1, r);
    const c = await sharp(water).composite([{ input: await fr(`${SO}/ship_${ship}_back.png`, 0, r) }, { input: u }, { input: await fr(`${SO}/ship_${ship}_front.png`, 0, r) }]).png().toBuffer();
    comps.push({ input: await sharp(c).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(), left: x, top: y }); x += 196;
    if (r === 0) { comps.push({ input: await sharp(c).png().toBuffer(), left: 6 * 196 + (side === 'ally' ? 0 : 70), top: y + 60 }); }
  } y += 196; }
await sharp({ create: { width: 6 * 196 + 140, height: y, channels: 3, background: '#202020' } }).composite(comps).png().toFile(out); console.log('ok', out);
