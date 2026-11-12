// 검수용(호출 없음): 비교 시트 여러 장을 세로로 이어 붙인다(A2 검수 턴 절약용).
// 실행: sh docker/gemini/hero_v3_a2.sh node docker/gemini/hero_v3_stack_a2.mjs <out.png> <code1,code2,...>
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [out, list] = process.argv.slice(2); const D = 'docker/gemini/hero_v3_preview_a2/compare';
const ims = []; let W = 0, H = 0;
for (const c of list.split(',')) { const b = await sharp(`${D}/${c}_compare.png`).png().toBuffer(); const m = await sharp(b).metadata(); ims.push({ input: b, left: 0, top: H }); H += m.height + 6; W = Math.max(W, m.width); }
await sharp({ create: { width: W, height: H, channels: 3, background: '#000' } }).composite(ims).png().toFile(out);
console.log('ok', out);
