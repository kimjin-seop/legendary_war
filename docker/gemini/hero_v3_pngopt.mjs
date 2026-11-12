// 무손실 PNG 최적화(호출 없음): 팔레트(인덱스) PNG 로 재인코딩해 RGBA 픽셀이 원본과 100% 동일할 때만 교체. 다르면 원본 유지.
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_v3_pngopt.mjs <file1.png> <file2.png> ...
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
let before = 0, after = 0, kept = 0;
for (const f of process.argv.slice(2)) {
  const src = readFileSync(f); before += src.length;
  const a = await sharp(src).ensureAlpha().raw().toBuffer();
  const cand = await sharp(src).png({ palette: true, colors: 256, dither: 0, effort: 10, compressionLevel: 9 }).toBuffer();
  const b = await sharp(cand).ensureAlpha().raw().toBuffer();
  let same = a.length === b.length; for (let i = 0; same && i < a.length; i += 4) { if (a[i + 3] !== b[i + 3]) same = false; else if (a[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) same = false; } // 완전 투명 픽셀의 RGB 차이는 무시
  if (cand.length < src.length && same) { writeFileSync(f, cand); after += cand.length; } else { after += src.length; kept++; }
}
console.log(`files ${process.argv.length - 2}, bytes ${before} -> ${after}, 원본 유지 ${kept}`);
