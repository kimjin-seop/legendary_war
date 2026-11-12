// 초상화 접촉 시트(점검용, API 호출 없음). 사용: node portrait_contact.mjs <out.png> <cellW> <file...>  (SHARP_DIR 필요)
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [out, cw, ...files] = process.argv.slice(2); const W = Number(cw), H = Math.round(W * 4 / 3), cols = Math.min(files.length, 6);
const comps = []; for (let i = 0; i < files.length; i++) comps.push({ input: await sharp(files[i]).resize(W, H, { fit: 'contain', background: { r: 70, g: 80, b: 100, alpha: 1 } }).flatten({ background: { r: 70, g: 80, b: 100 } }).png().toBuffer(), left: (i % cols) * (W + 4), top: Math.floor(i / cols) * (H + 4) });
await sharp({ create: { width: cols * (W + 4), height: Math.ceil(files.length / cols) * (H + 4), channels: 3, background: '#202020' } }).composite(comps).png().toFile(out);
console.log('ok', out);
