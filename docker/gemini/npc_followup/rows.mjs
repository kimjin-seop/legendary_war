// 점검용(호출 없음): node rows.mjs out.png row scale sheet1 sheet2 ... — 각 64 시트의 지정 행(0 down,1 left,2 right,3 up) 3프레임을 나란히 확대
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/sp'}/`)('sharp');
const [out, row, sc, ...files] = process.argv.slice(2); const S = +sc; const comp = []; let x = 0;
for (const f of files) { const b = await sharp(f).extract({ left: 0, top: +row * 64, width: 192, height: 64 }).resize(192 * S, 64 * S, { kernel: 'nearest' }).png().toBuffer(); comp.push({ input: b, left: x, top: 0 }); x += 192 * S + 12; }
await sharp({ create: { width: x, height: 64 * S, channels: 4, background: '#5a6a50' } }).composite(comp).png().toFile(out); console.log(out);
