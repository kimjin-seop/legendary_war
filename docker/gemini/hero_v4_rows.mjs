// QA 보조(호출 없음): 여러 영웅 시트의 특정 행을 x3 로 확대해 한 장에 모음. 사용: node hero_v4_rows.mjs <dir(64 상위)> <out.png> <row:0~3> code1,code2,...
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/sp'}/`)('sharp');
const [dir, out, row, list] = process.argv.slice(2); const codes = list.split(','); const comps = [];
const label = (t) => Buffer.from(`<svg width="576" height="20"><rect width="100%" height="100%" fill="#202020"/><text x="4" y="15" font-size="14" font-family="sans-serif" fill="#ffee55">${t}</text></svg>`);
for (let i = 0; i < codes.length; i++) {
  const b = await sharp(`${dir}/64/hero_${codes[i]}_ally_sheet.png`).extract({ left: 0, top: Number(row) * 64, width: 192, height: 64 }).resize(576, 192, { kernel: 'nearest' }).png().toBuffer();
  const x = (i % 3) * 584, y = Math.floor(i / 3) * 220; comps.push({ input: label(codes[i]), left: x, top: y }, { input: b, left: x, top: y + 20 });
}
await sharp({ create: { width: 1752, height: Math.ceil(codes.length / 3) * 220, channels: 3, background: '#6a8a4a' } }).composite(comps).png().toFile(out); console.log('ok', out);
