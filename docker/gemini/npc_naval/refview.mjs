// QA 보조(호출 없음): 이미지 여러 장을 높이 H 로 맞춰 가로로 이어 붙임. 사용: node refview.mjs <out.png> <H> <bg> f1 f2 ...
import { createRequire } from 'node:module'; const sharp = createRequire('/sp/')('sharp');
const [out, H, bg, ...fs] = process.argv.slice(2); const comps = []; let x = 0;
for (const f of fs) { const b = await sharp(f).resize({ height: Number(H), kernel: f.includes('/64') || f.includes('ship_') || f.includes('sheet') ? 'nearest' : 'lanczos3' }).flatten({ background: bg }).png().toBuffer(); const m = await sharp(b).metadata(); comps.push({ input: b, left: x, top: 0 }); x += m.width + 6; }
await sharp({ create: { width: x, height: Number(H), channels: 3, background: '#222' } }).composite(comps).png().toFile(out); console.log('ok', out);
