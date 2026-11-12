// 전투 컷신 무대 배경 후처리: raw/bgbattle/<terrain>.jpg(21:9, 3168x1344) → public/assets/bg/battle_<terrain>_a.png(960x300) + bg/x2(1920x600) + 미리보기.
// 21:9 출력은 도트 격자가 가로·세로 불균일(주기 분석 on/off 약 1.3 / 1.7 로 약함)이라 격자 직접 샘플 대신
// 3.2:1 크롭 → 320x100 도트로 면적 평균 축소(원본 도트 약 9.9px 와 비슷한 크기) → 48색 메디안 컷(디더링 없음) → 최근접 x3 = 960x300(도트 3px 일정).
// 실행: SHARP_DIR=/tmp/pp node docker/gemini/pp_bg.mjs [terrain,...]
import { createRequire } from 'node:module';
import { readdirSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const RAW = process.env.RAW ?? 'public/assets/raw/bgbattle', OUT = 'public/assets/bg', W = 960, H = 300, DW = 320, DH = 100, PAL = 48;
// 세로 크롭 위치(0=맨 위, 1=맨 아래 정렬). 지면 띠가 70~85% 에 오도록 QA 후 조정
const CROP_Y = { default: 1, plain: 0.6, forest: 0.5, mountain: 0.95, castle: 1, village: 0.7, riverside: 0.9, mountain_b: 0.3, road: 0.8,
  // 수상(raw/bgbattle_sea, RAW 환경변수): 수평선이 결과 높이 0.38 에 오도록. cy = (원본 수평선 비율 - 0.28) / 0.263
  sea: 0.84, sea_b: 0.84, reef: 0.35, harbor: 0.74, river: 0.68 };
const only = process.argv[2] ? process.argv[2].split(',') : null;
mkdirSync(`${OUT}/x2`, { recursive: true });
function medianCut(px, n) { const boxes = [px]; while (boxes.length < n) { boxes.sort((a, b) => b.length - a.length); const bx = boxes.shift(); if (!bx || bx.length < 2) { if (bx) boxes.push(bx); break; } const rng = [0, 1, 2].map((c) => { let lo = 255, hi = 0; for (const q of bx) { if (q[c] < lo) lo = q[c]; if (q[c] > hi) hi = q[c]; } return hi - lo; }); const c = rng.indexOf(Math.max(...rng)); bx.sort((a, b) => a[c] - b[c]); const m = bx.length >> 1; boxes.push(bx.slice(0, m), bx.slice(m)); }
  return boxes.filter((b) => b.length).map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, q) => s + q[c], 0) / b.length))); }
const report = existsSync(`${OUT}/battle_bg_report.json`) ? (JSON.parse(readFileSync(`${OUT}/battle_bg_report.json`, 'utf8')).items ?? {}) : {}; // 기존 기록 유지(부분 실행 시 덮어쓰기 방지)
for (const f of readdirSync(RAW).filter((f) => /^[a-z]+(_b)?\.jpg$/.test(f)).sort()) {
  const id = f.slice(0, -4); if (only && !only.includes(id)) continue; const t = id.replace(/_b$/, ''), v = id.endsWith('_b') ? 'b' : 'a';
  const meta = await sharp(`${RAW}/${f}`).metadata(); const w = meta.width, h = meta.height; const ch = Math.round(w / 3.2); const cy = CROP_Y[id] ?? CROP_Y.default; const y0 = Math.round((h - ch) * cy);
  const { data } = await sharp(`${RAW}/${f}`).removeAlpha().extract({ left: 0, top: y0, width: w, height: ch }).resize(DW, DH, { kernel: 'lanczos2' }).raw().toBuffer({ resolveWithObject: true });
  const px = []; for (let i = 0; i < DW * DH; i++) px.push([data[i * 3], data[i * 3 + 1], data[i * 3 + 2]]);
  const pal = medianCut(px.slice(), PAL); const out = Buffer.alloc(DW * DH * 3); let mag = 0;
  px.forEach(([r, g, b], i) => { let best = 0, bd = 1e9; for (let q = 0; q < pal.length; q++) { const d = (r - pal[q][0]) ** 2 + (g - pal[q][1]) ** 2 + (b - pal[q][2]) ** 2; if (d < bd) { bd = d; best = q; } } out.set(pal[best], i * 3); if (pal[best][0] - pal[best][1] > 60 && pal[best][2] - pal[best][1] > 60) mag++; });
  const base = sharp(out, { raw: { width: DW, height: DH, channels: 3 } });
  await base.clone().resize(W, H, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toFile(`${OUT}/battle_${t}_${v}.png`);
  await base.clone().resize(W * 2, H * 2, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toFile(`${OUT}/x2/battle_${t}_${v}.png`);
  report[id] = { raw: `${w}x${h}`, crop: `0,${y0} ${w}x${ch}`, dots: `${DW}x${DH}`, scale: W / DW, colors: pal.length, magentaPixels: mag };
  console.log(`[bg ${id}] ${JSON.stringify(report[id])}`);
}
writeFileSync(`${OUT}/battle_bg_report.json`, JSON.stringify({ note: 'pp_bg.mjs 처리 기록. 지면선 비율은 manifest groundLineRatio', items: report }, null, 1));
// 미리보기: 960x300 원본 위에 지면선 가이드(70%·78%·85%), 유닛 크기 참고용 64px 스프라이트(배경 x2 표시 기준이면 배경 좌표 32px) 대신 좌우 1/4 지점에 32px 칸
const files = readdirSync(OUT).filter((f) => /^battle_.+_[ab]\.png$/.test(f)).filter((f) => !only || only.some((id) => f === `battle_${id.replace(/_b$/, '')}_${id.endsWith('_b') ? 'b' : 'a'}.png`)).sort(); const comps = [];
for (let i = 0; i < files.length; i++) { comps.push({ input: `${OUT}/${files[i]}`, left: 0, top: i * 310 });
  for (const [r, col] of [[0.38, '#00e5ff'], [0.70, '#ffffff'], [0.78, '#ffd700'], [0.85, '#ffffff']]) comps.push({ input: { create: { width: W, height: 1, channels: 4, background: col } }, left: 0, top: i * 310 + Math.round(H * r) }); }
if (files.length) await sharp({ create: { width: W, height: files.length * 310, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${OUT}/preview_battle_bg_guides.png`);
console.log(`미리보기: ${files.length}장`);
