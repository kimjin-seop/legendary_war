// 엠블럼 원본(JPEG, 마젠타 배경) → 투명 PNG(키·despill·경계 1px 침식·잡티 제거). API 호출 없음.
// 실행: docker run --rm -v "<프로젝트>":/app -w /app node:22 sh -c "cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp_brand_key.mjs public/assets/brand emblem_a emblem_b"
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [OUT = 'public/assets/brand', ...ids] = process.argv.slice(2);
for (const id of ids) {
  const { data, info } = await sharp(`${OUT}/raw/${id}.jpg`).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); const w = info.width, h = info.height, N = w * h;
  const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < 3; it++) { const add = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if (strict[i - 1] || strict[i + 1] || strict[i - w] || strict[i + w]) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) { if (strict[i]) { data.fill(0, i * 4, i * 4 + 4); continue; } const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const sp = Math.max(0, Math.min(r, b) - g - 25); if (sp) { data[i * 4] = r - sp; data[i * 4 + 2] = b - sp; } }
  const kill = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (data[i * 4 + 3] && (!data[(i - 1) * 4 + 3] || !data[(i + 1) * 4 + 3] || !data[(i - w) * 4 + 3] || !data[(i + w) * 4 + 3])) kill.push(i); } for (const i of kill) data[i * 4 + 3] = 0;
  // 잡티(연결 성분 < 400px) 제거
  const seen = new Uint8Array(N); for (let s = 0; s < N; s++) { if (seen[s] || !data[s * 4 + 3]) continue; const c = [s]; seen[s] = 1; for (let k = 0; k < c.length; k++) { const i = c[k], x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !seen[j] && data[j * 4 + 3]) { seen[j] = 1; c.push(j); } } if (c.length < 400) for (const i of c) data.fill(0, i * 4, i * 4 + 4); }
  let mag = 0, pink = 0; for (let i = 0; i < N; i++) { const a = data[i * 4 + 3]; if (!a) continue; const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; if (a >= 128 && r - g > 60 && b - g > 60) mag++; if (a < 255 && r - g > 40 && b - g > 40) pink++; }
  await sharp(data, { raw: { width: w, height: h, channels: 4 } }).trim({ threshold: 0 }).png({ compressionLevel: 9 }).toFile(`${OUT}/raw/${id}_key.png`);
  console.log(JSON.stringify({ id, magenta_px: mag, pink_edge_px: pink }));
}
