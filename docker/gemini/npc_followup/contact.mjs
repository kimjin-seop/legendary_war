// 점검용 연락 시트(호출 없음): node contact.mjs out.png h file1 file2 ... (회색 배경 위 가로 나열, 높이 h)
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/sp'}/`)('sharp');
const [out, hs, ...files] = process.argv.slice(2); const h = +hs; const bufs = [];
for (const f of files) { const b = await sharp(f).resize({ height: h, kernel: f.includes('/64') || f.includes('_sheet') ? 'nearest' : 'lanczos3' }).png().toBuffer(); const m = await sharp(b).metadata(); bufs.push({ b, w: m.width }); }
const W = bufs.reduce((s, x) => s + x.w + 8, 8); let x = 8; const comp = bufs.map((q) => { const o = { input: q.b, left: x, top: 8 }; x += q.w + 8; return o; });
await sharp({ create: { width: W, height: h + 16, channels: 4, background: '#7a7a7a' } }).composite(comp).png().toFile(out); console.log(out, W);
