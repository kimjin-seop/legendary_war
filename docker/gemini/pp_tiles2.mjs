// 신규 지형 타일 후처리(raw/tsheets/<sheet>.jpg 2x2 시트 → tiles/64/<name>.png, 64_x2, 3x3 이음새 미리보기, 확장 팔레트).
// 모델 출력은 200x200 도트 격자(10.24px)이므로 도트 중심을 직접 샘플한 뒤, 질감 타일은 중앙 64x64 도트를 1:1 로(crop), 구조물 타일은 100도트 칸 전체를 64px 로 맞춤(fit).
// 실행: SHARP_DIR=/tmp/pp node docker/gemini/pp_tiles2.mjs [seamless]
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const RAW = 'public/assets/raw/tsheets', OUT = 'public/assets/tiles', GRID = 200;
const SEAMLESS = new Set((process.env.SEAMLESS ?? '').split(',').filter(Boolean)); // 이음새 보정할 타일(교차 페이드)
const SHEETS = { tsheet_water: ['shallows_a', 'shallows_b', 'swamp_a', 'swamp_b'], tsheet_snowdesert: ['snow_desert_a', 'ice_a', 'snow_desert_c', 'snow_desert_d'] /* b(얼음 호수)는 설원으로 읽히지 않아 얼음 전용 키로 분리 */, tsheet_cliffwall: ['cliff_a', 'cliff_b', 'wall_a', 'wall_b'], tsheet_village: ['village_a', 'village_b', 'bridge_h_a', 'bridge_h_b'] };
const MODE = { cliff_a: 'fit', cliff_b: 'fit', wall_a: 'fit', wall_b: 'fit', village_a: 'fit', village_b: 'fit', bridge_h_a: 'fit', bridge_h_b: 'fit' }; // 나머지는 crop
const NO_TONE = new Set(['snow_desert_a', 'ice_a', 'snow_desert_c', 'snow_desert_d']);
const mk = (w, h) => ({ w, h, d: new Uint8Array(w * h * 4) });
async function dots(file) { const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const W = info.width, st = W / GRID; const im = mk(GRID, GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) { const cx = Math.round((i + 0.5) * st), cy = Math.round((j + 0.5) * st); let r = 0, g = 0, b = 0, n = 0; for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const k = ((cy + dy) * W + cx + dx) * 3; r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; } const o = (j * GRID + i) * 4; im.d[o] = Math.round(r / n); im.d[o + 1] = Math.round(g / n); im.d[o + 2] = Math.round(b / n); im.d[o + 3] = 255; }
  return im; }
const sub = (im, x0, y0, w, h) => { const o = mk(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) o.d.set(im.d.subarray(((y0 + y) * im.w + x0 + x) * 4, ((y0 + y) * im.w + x0 + x) * 4 + 4), (y * w + x) * 4); return o; };
async function fit64(im) { const { data } = await sharp(Buffer.from(im.d), { raw: { width: im.w, height: im.h, channels: 4 } }).resize(64, 64, { kernel: 'lanczos3' }).raw().toBuffer({ resolveWithObject: true }); const o = mk(64, 64); o.d.set(data); return o; }
function tone(im, sat = 0.85, val = 0.95) { for (let i = 0; i < im.w * im.h; i++) { const r = im.d[i * 4], g = im.d[i * 4 + 1], b = im.d[i * 4 + 2], l = (r + g + b) / 3; im.d[i * 4] = Math.round((l + (r - l) * sat) * val); im.d[i * 4 + 1] = Math.round((l + (g - l) * sat) * val); im.d[i * 4 + 2] = Math.round((l + (b - l) * sat) * val); } return im; }
function seamless(im) { // 반 칸 이동 사본과 가장자리 쪽 가중 블렌딩(중앙은 원본, 가장자리는 이동본) → 상하좌우 이음새 완화
  const o = mk(64, 64); for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const wx = Math.min(x, 63 - x) / 31.5, wy = Math.min(y, 63 - y) / 31.5; const w = Math.min(1, Math.min(wx, wy) * 2.0); // 중앙 1, 가장자리 0
      const sx = (x + 32) % 64, sy = (y + 32) % 64; for (let c = 0; c < 3; c++) o.d[(y * 64 + x) * 4 + c] = Math.round(im.d[(y * 64 + x) * 4 + c] * w + im.d[(sy * 64 + sx) * 4 + c] * (1 - w)); o.d[(y * 64 + x) * 4 + 3] = 255; } return o; }
function buildPalette(ims, n) { const p = []; for (const im of ims) for (let i = 0; i < im.w * im.h; i++) p.push([im.d[i * 4], im.d[i * 4 + 1], im.d[i * 4 + 2]]); const boxes = [p];
  while (boxes.length < n) { boxes.sort((a, b) => b.length - a.length); const bx = boxes.shift(); if (!bx || bx.length < 2) { if (bx) boxes.push(bx); break; } const rng = [0, 1, 2].map((c) => { let lo = 255, hi = 0; for (const q of bx) { if (q[c] < lo) lo = q[c]; if (q[c] > hi) hi = q[c]; } return hi - lo; }); const c = rng.indexOf(Math.max(...rng)); bx.sort((a, b) => a[c] - b[c]); const m = bx.length >> 1; boxes.push(bx.slice(0, m), bx.slice(m)); }
  return boxes.filter((b) => b.length).map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, q) => s + q[c], 0) / b.length))); }
function applyPalette(im, pal) { for (let i = 0; i < im.w * im.h; i++) { const r = im.d[i * 4], g = im.d[i * 4 + 1], b = im.d[i * 4 + 2]; let best = 0, bd = 1e9; for (let k = 0; k < pal.length; k++) { const dd = (r - pal[k][0]) ** 2 + (g - pal[k][1]) ** 2 + (b - pal[k][2]) ** 2; if (dd < bd) { bd = dd; best = k; } } im.d[i * 4] = pal[best][0]; im.d[i * 4 + 1] = pal[best][1]; im.d[i * 4 + 2] = pal[best][2]; im.d[i * 4 + 3] = 255; } return im; }
const edgeDiff = (im) => { let h = 0, v = 0; for (let y = 0; y < 64; y++) for (let c = 0; c < 3; c++) h += Math.abs(im.d[(y * 64) * 4 + c] - im.d[(y * 64 + 63) * 4 + c]); for (let x = 0; x < 64; x++) for (let c = 0; c < 3; c++) v += Math.abs(im.d[x * 4 + c] - im.d[(63 * 64 + x) * 4 + c]); return { lr: +(h / 192).toFixed(1), tb: +(v / 192).toFixed(1) }; };
const hex = (c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('');
const png = (im, file) => sharp(Buffer.from(im.d), { raw: { width: im.w, height: im.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file);
const pngBuf = (im, sc = 1) => sharp(Buffer.from(im.d), { raw: { width: im.w, height: im.h, channels: 4 } }).resize(im.w * sc, im.h * sc, { kernel: 'nearest' }).png().toBuffer();

mkdirSync(`${OUT}/64`, { recursive: true }); mkdirSync(`${OUT}/64_x2`, { recursive: true });
const tiles = {}; // name → 64x64 RGBA
for (const [sheet, names] of Object.entries(SHEETS)) { const f = `${RAW}/${sheet}.jpg`; if (!existsSync(f)) continue; const d = await dots(f);
  for (let q = 0; q < 4; q++) { const name = names[q]; const quad = sub(d, (q % 2) * 100, Math.floor(q / 2) * 100, 100, 100); let t = (MODE[name] ?? 'crop') === 'fit' ? await fit64(quad) : sub(quad, 18, 18, 64, 64); if (!NO_TONE.has(name)) tone(t); tiles[name] = t; } }
const existing = JSON.parse(readFileSync(`${OUT}/tileset_64.json`, 'utf8')).palette.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)));
const fresh = buildPalette(Object.values(tiles), 32); const pal = [...existing, ...fresh];
for (const n of Object.keys(tiles)) { applyPalette(tiles[n], pal); }
for (const n of SEAMLESS) if (tiles[n]) { tiles[n] = applyPalette(seamless(tiles[n]), pal); }
// 다리 세로(가로 다리 90° 회전 파생, 호출 없음)
for (const v of ['a', 'b']) { const r = await sharp(Buffer.from(tiles[`bridge_h_${v}`].d), { raw: { width: 64, height: 64, channels: 4 } }).rotate(90).raw().toBuffer(); const o = mk(64, 64); o.d.set(r); tiles[`bridge_v_${v}`] = o; }
const names = Object.keys(tiles); const seam = {};
for (const n of names) { await png(tiles[n], `${OUT}/64/${n}.png`); writeFileSync(`${OUT}/64_x2/${n}.png`, await pngBuf(tiles[n], 2)); seam[n] = edgeDiff(tiles[n]); console.log(`[tile ${n}] 이음새 ${JSON.stringify(seam[n])}`); }
// 확장 타일셋 + 팔레트 + 3x3 미리보기(x2)
const cols = 8, rows = Math.ceil(names.length / cols); const comps = []; names.forEach((n, i) => comps.push({ input: Buffer.from(tiles[n].d), raw: 1, i }));
const sheetBuf = []; for (let i = 0; i < names.length; i++) sheetBuf.push({ input: await pngBuf(tiles[names[i]], 1), left: (i % cols) * 64, top: Math.floor(i / cols) * 64 });
await sharp({ create: { width: cols * 64, height: rows * 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(sheetBuf).png().toFile(`${OUT}/tileset_64_ext.png`);
writeFileSync(`${OUT}/tileset_64_ext.json`, JSON.stringify({ tile: 64, columns: cols, order: names, seam_edge_diff: seam, palette: pal.map(hex), note: '기존 tileset_64 팔레트 40색 + 신규 32색. 기존 타일은 변경하지 않음' }, null, 1));
const prev = []; for (let i = 0; i < names.length; i++) { const one = await pngBuf(tiles[names[i]], 1); const g = await sharp({ create: { width: 192, height: 192, channels: 4, background: '#000' } }).composite(Array.from({ length: 9 }, (_, j) => ({ input: one, left: (j % 3) * 64, top: Math.floor(j / 3) * 64 }))).png().toBuffer(); prev.push({ input: await sharp(g).resize(384, 384, { kernel: 'nearest' }).png().toBuffer(), left: (i % 4) * 388, top: Math.floor(i / 4) * 388 }); }
await sharp({ create: { width: 4 * 388, height: Math.ceil(names.length / 4) * 388, channels: 4, background: '#202020' } }).composite(prev).png().toFile(`${OUT}/preview_64_ext_3x3_x2.png`);
console.log(`tiles ext: ${names.length}장, 팔레트 ${pal.length}색`);
