// 검수용 컨택트 시트(호출 없음): 이미지 여러 장을 라벨과 함께 격자로 묶는다.
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_v3_contact.mjs <out.png> <cols> <cellPx> <img1> <img2> ...
import { createRequire } from 'node:module';
import path from 'node:path';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [out, colsS, cellS, ...files] = process.argv.slice(2); const cols = Number(colsS), cell = Number(cellS), lab = 22;
const rows = Math.ceil(files.length / cols); const comps = [];
for (let i = 0; i < files.length; i++) {
  const x = (i % cols) * cell, y = Math.floor(i / cols) * (cell + lab);
  const im = await sharp(files[i]).resize(cell, cell, { fit: 'contain', background: '#5a5a5a', kernel: 'nearest' }).flatten({ background: '#5a5a5a' }).png().toBuffer();
  comps.push({ input: im, left: x, top: y + lab });
  const name = path.basename(files[i]).replace(/\.(png|jpg)$/, '');
  comps.push({ input: Buffer.from(`<svg width="${cell}" height="${lab}"><text x="4" y="16" font-size="15" font-family="sans-serif" fill="#ffee55">${name}</text></svg>`), left: x, top: y });
}
await sharp({ create: { width: cols * cell, height: rows * (cell + lab), channels: 3, background: '#282828' } }).composite(comps).png().toFile(out);
console.log('ok', out);
