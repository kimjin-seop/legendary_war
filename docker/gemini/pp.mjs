// 최종 에셋 후처리(public/assets/raw/<cat> → public/assets/<cat>). 도트 타일/걷기 시트/UI 아이콘/이펙트.
// 실행(컨테이너): docker run --rm -v "$PWD":/app -w /app node:22 sh -c \
//   "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp.mjs tiles sprites ui effects"
// 의존: sharp(Apache-2.0, libvips LGPL-3.0) — 프로젝트 package.json 은 수정하지 않음.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { RES } from './style_guide.mjs';

const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const RAW = 'public/assets/raw', OUT = 'public/assets';
const ensure = (d) => mkdirSync(d, { recursive: true });
const jpgs = (d) => (existsSync(d) ? readdirSync(d).filter((f) => f.endsWith('.jpg')).map((f) => f.slice(0, -4)).sort() : []);

async function loadRGBA(file) { const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
const raw = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });
const toPng = (img, file) => raw(img).png({ compressionLevel: 9 }).toFile(file);
async function resize(img, w, h, kernel = 'lanczos3') { const { data, info } = await raw(img).resize(w, h, { kernel, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
async function extract(img, left, top, width, height) { const { data, info } = await raw(img).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
async function centerSquare(img) { const s = Math.min(img.w, img.h); return extract(img, (img.w - s) >> 1, (img.h - s) >> 1, s, s); }
const scaleNearest = (img, k) => raw(img).resize(img.w * k, img.h * k, { kernel: 'nearest' }).png().toBuffer();

// ---- 마젠타 크로마키: 엄격 마스크 + 번짐 확장 + despill ----
function keyMagenta(img, grow = 2) {
  const { data, w, h } = img, N = w * h; const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < grow; it++) { const add = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if ((x > 0 && strict[i - 1]) || (x < w - 1 && strict[i + 1]) || (y > 0 && strict[i - w]) || (y < h - 1 && strict[i + w])) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) {
    if (strict[i]) { data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = data[i * 4 + 3] = 0; continue; }
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const spill = Math.max(0, Math.min(r, b) - g - 25); // despill: 마젠타 성분 제거
    if (spill > 0) { data[i * 4] = r - spill; data[i * 4 + 2] = b - spill; }
  }
  return img;
}
function bbox(img, thr = 128) { let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }

// ---- 공통 팔레트(메디안 컷) · 디더링 없음 · 알파 이진화 ----
function buildPalette(imgs, n) {
  const px = []; for (const im of imgs) for (let i = 0; i < im.w * im.h; i++) if (im.data[i * 4 + 3] >= 128) px.push([im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]]);
  const boxes = [px];
  while (boxes.length < n) { boxes.sort((a, b) => b.length - a.length); const bx = boxes.shift(); if (!bx || bx.length < 2) { if (bx) boxes.push(bx); break; }
    const rng = [0, 1, 2].map((c) => { let lo = 255, hi = 0; for (const p of bx) { if (p[c] < lo) lo = p[c]; if (p[c] > hi) hi = p[c]; } return hi - lo; });
    const c = rng.indexOf(Math.max(...rng)); bx.sort((a, b) => a[c] - b[c]); const mid = bx.length >> 1; boxes.push(bx.slice(0, mid), bx.slice(mid)); }
  return boxes.filter((b) => b.length).map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
}
function applyPalette(img, pal) {
  for (let i = 0; i < img.w * img.h; i++) { if (img.data[i * 4 + 3] < 128) { img.data.fill(0, i * 4, i * 4 + 4); continue; }
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2]; let best = 0, bd = Infinity;
    for (let k = 0; k < pal.length; k++) { const d = (r - pal[k][0]) ** 2 + (g - pal[k][1]) ** 2 + (b - pal[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
    img.data[i * 4] = pal[best][0]; img.data[i * 4 + 1] = pal[best][1]; img.data[i * 4 + 2] = pal[best][2]; img.data[i * 4 + 3] = 255; }
  return img;
}
function edgeDiff(img) { let h = 0, v = 0; for (let y = 0; y < img.h; y++) for (let c = 0; c < 3; c++) h += Math.abs(img.data[(y * img.w) * 4 + c] - img.data[(y * img.w + img.w - 1) * 4 + c]); for (let x = 0; x < img.w; x++) for (let c = 0; c < 3; c++) v += Math.abs(img.data[x * 4 + c] - img.data[((img.h - 1) * img.w + x) * 4 + c]); return { lr: +(h / (img.h * 3)).toFixed(1), tb: +(v / (img.w * 3)).toFixed(1) }; }
async function grid(cells, cw, ch, cols, file, scale = 1, gap = 0, bg = { r: 32, g: 32, b: 32, alpha: 1 }) {
  const rows = Math.ceil(cells.length / cols), W = cols * cw * scale + (cols + 1) * gap, H = rows * ch * scale + (rows + 1) * gap; const comps = [];
  for (let t = 0; t < cells.length; t++) comps.push({ input: await (scale === 1 ? raw(cells[t]).png().toBuffer() : scaleNearest(cells[t], scale)), left: gap + (t % cols) * (cw * scale + gap), top: gap + Math.floor(t / cols) * (ch * scale + gap) });
  await sharp({ create: { width: W, height: H, channels: 4, background: bg } }).composite(comps).png().toFile(file);
}
// 아군(파랑) → 적군(빨강) 색상 회전
function hueShiftBlueToRed(img) {
  const out = { ...img, data: Buffer.from(img.data) };
  for (let i = 0; i < img.w * img.h; i++) { if (out.data[i * 4 + 3] === 0) continue; let r = out.data[i * 4] / 255, g = out.data[i * 4 + 1] / 255, b = out.data[i * 4 + 2] / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, s = max ? d / max : 0; if (d === 0 || s < 0.22) continue;
    let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; if (hue < 185 || hue > 265) continue;
    const nh = ((hue - 225) * 0.5 + 357 + 360) % 360, c = max * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = max - c; const hs = Math.floor(nh / 60);
    [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][hs]; out.data[i * 4] = Math.round((r + m) * 255); out.data[i * 4 + 1] = Math.round((g + m) * 255); out.data[i * 4 + 2] = Math.round((b + m) * 255); }
  return out;
}

// ================= TILES =================
async function tiles() {
  const d = `${OUT}/tiles`; ensure(`${d}/32`); for (const k of RES.tileScales) ensure(`${d}/x${k}`);
  const ids = jpgs(`${RAW}/tiles`); const imgs = [], names = [];
  // 모델은 2K 캔버스를 약 256px 도트 격자(1도트≈8px)로 그린다. 작은 소품(꽃·풀)이 있는 평지는 중앙 1/2만 써서 소품을 3~4px 로 남기고, 큰 구조물(수관·봉우리·성)은 전체를 쓴다.
  const CROP = { plain_a: 0.5, plain_b: 0.5, plain_c: 0.5, water_a: 0.5, water_b: 0.5, castle_a: 0.62, mountain_a: 0.82, mountain_b: 0.66 };
  for (const id of ids) {
    let sq = await centerSquare(await loadRGBA(`${RAW}/tiles/${id}.jpg`));
    const fr = CROP[id] ?? 1; if (fr < 1) { const s = Math.round(sq.w * fr); sq = await extract(sq, (sq.w - s) >> 1, (sq.h - s) >> 1, s, s); }
    const mid = await resize(sq, 128, 128, 'lanczos3'); // 2단 축소: 2048→128(평균화)→32(최근접 대신 lanczos2: 격자 보존·잡음 억제)
    imgs.push(await resize(mid, RES.tile, RES.tile, 'lanczos2')); names.push(id);
  }
  // 길 가로 변형(회전, 호출 없음)
  for (let i = 0, n = imgs.length; i < n; i++) if (names[i].startsWith('road_')) { const rot = await raw(imgs[i]).rotate(90).raw().toBuffer({ resolveWithObject: true }); imgs.push({ data: Buffer.from(rot.data), w: 32, h: 32 }); names.push(names[i].replace('road_', 'road_h_')); }
  const pal = buildPalette(imgs, RES.palette); imgs.forEach((im) => applyPalette(im, pal));
  for (let i = 0; i < imgs.length; i++) { await toPng(imgs[i], `${d}/32/${names[i]}.png`); for (const k of RES.tileScales) writeFileSync(`${d}/x${k}/${names[i]}.png`, await scaleNearest(imgs[i], k)); console.log(`[tile ${names[i]}] 이음새 ${JSON.stringify(edgeDiff(imgs[i]))}`); }
  // Tiled 타일셋(열 8) + 3x3 미리보기(x4)
  const cols = 8, rows = Math.ceil(imgs.length / cols); const comps = [];
  for (let t = 0; t < imgs.length; t++) comps.push({ input: await raw(imgs[t]).png().toBuffer(), left: (t % cols) * 32, top: Math.floor(t / cols) * 32 });
  await sharp({ create: { width: cols * 32, height: rows * 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(`${d}/tileset_32.png`);
  writeFileSync(`${d}/tileset_32.tsx`, `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="terrain_32" tilewidth="32" tileheight="32" tilecount="${imgs.length}" columns="${cols}">\n <image source="tileset_32.png" width="${cols * 32}" height="${rows * 32}"/>\n${names.map((n, i) => ` <tile id="${i}"><properties><property name="code" value="${n.replace(/_(h_)?[a-z]$/, '')}"/><property name="variant" value="${n}"/></properties></tile>`).join('\n')}\n</tileset>\n`);
  writeFileSync(`${d}/tileset_32.json`, JSON.stringify({ tile: 32, columns: cols, order: names, palette: pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')) }, null, 1));
  const prev = []; for (const im of imgs) { const one = await raw(im).png().toBuffer(); const t3 = await sharp({ create: { width: 96, height: 96, channels: 4, background: '#000' } }).composite(Array.from({ length: 9 }, (_, j) => ({ input: one, left: (j % 3) * 32, top: Math.floor(j / 3) * 32 }))).raw().toBuffer(); prev.push({ data: Buffer.from(t3), w: 96, h: 96 }); }
  await grid(prev, 96, 96, 4, `${d}/preview_3x3_x4.png`, 4, 8);
  console.log(`tiles: ${imgs.length}장, 팔레트 ${pal.length}색`);
}

// ================= SPRITES (3x4 걷기 시트) =================
async function sprites() {
  const d = `${OUT}/sprites`; ensure(`${d}/x3`); ensure(`${d}/x4`); ensure(`${d}/idle`);
  const ids = jpgs(`${RAW}/sprites`).filter((i) => i.startsWith('sheet_')); const sheets = [];
  for (const id of ids) {
    const img = keyMagenta(await loadRGBA(`${RAW}/sprites/${id}.jpg`)); const cw = Math.floor(img.w / 3), ch = Math.floor(img.h / 4); const cells = [], boxes = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) { const cell = await extract(img, c * cw, r * ch, cw, ch); const b = bbox(cell, 128); cells.push(cell); boxes.push(b); }
    const maxH = Math.max(...boxes.map((b) => (b ? b.h : 0))), maxW = Math.max(...boxes.map((b) => (b ? b.w : 0)));
    const s = Math.min(30 / maxH, 30 / maxW); // 공통 배율(프레임 간 크기 일관), 각 프레임은 bbox 하단 중앙 정렬
    const frames = [];
    for (let i = 0; i < 12; i++) { const b = boxes[i]; if (!b) { frames.push({ data: Buffer.alloc(32 * 32 * 4), w: 32, h: 32 }); continue; }
      const crop = await extract(cells[i], b.x0, b.y0, b.w, b.h); const tw = Math.max(1, Math.round(b.w * s)), th = Math.max(1, Math.round(b.h * s));
      const small = await raw(await resize(crop, Math.max(tw * 4, 4), Math.max(th * 4, 4), 'lanczos3')).resize(tw, th, { kernel: 'lanczos2' }).png().toBuffer();
      const { data, info } = await sharp({ create: { width: 32, height: 32, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: small, left: (32 - tw) >> 1, top: 31 - th }]).raw().toBuffer({ resolveWithObject: true });
      frames.push({ data: Buffer.from(data), w: info.width, h: info.height }); }
    console.log(`[${id}] 셀 ${cw}x${ch}, 프레임 bbox h: ${boxes.map((b) => (b ? b.h : '-')).join(',')} → 배율 ${s.toFixed(3)}`);
    sheets.push({ unit: id.replace('sheet_', ''), frames });
  }
  const all = sheets.flatMap((s) => s.frames); const pal = buildPalette(all, RES.palette); all.forEach((f) => applyPalette(f, pal));
  const lineup = [];
  for (const s of sheets) {
    for (const side of ['ally', 'enemy']) {
      const fr = side === 'ally' ? s.frames : s.frames.map(hueShiftBlueToRed);
      const comps = fr.map((f, i) => ({ input: raw(f).png(), left: (i % 3) * 32, top: Math.floor(i / 3) * 32 }));
      const inputs = await Promise.all(comps.map(async (c) => ({ ...c, input: await c.input.toBuffer() })));
      const sheet = await sharp({ create: { width: 96, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(inputs).png().toBuffer();
      writeFileSync(`${d}/${s.unit}_${side}.png`, sheet);
      const sh = { data: Buffer.from(await sharp(sheet).raw().toBuffer()), w: 96, h: 128 };
      writeFileSync(`${d}/x3/${s.unit}_${side}.png`, await scaleNearest(sh, 3)); writeFileSync(`${d}/x4/${s.unit}_${side}.png`, await scaleNearest(sh, 4));
      await toPng(fr[1], `${d}/idle/${s.unit}_${side}.png`); lineup.push(fr[1]);
    }
  }
  await grid(lineup, 32, 32, 8, `${d}/preview_lineup_x4.png`, 4, 6); // 행: 유닛별 아군/적군 교대 → 8열이면 1행=4유닛
  await grid(sheets.flatMap((s) => s.frames), 32, 32, 12, `${d}/preview_sheets_x3.png`, 3, 4);
  writeFileSync(`${d}/palette.json`, JSON.stringify({ colors: pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')), note: '아군 공통 32색. 적군은 파랑 계열을 빨강으로 색상 회전한 파생색' }, null, 1));
  console.log(`sprites: ${sheets.length}종, 팔레트 ${pal.length}색`);
}

// ================= UI =================
const ICON_NAMES = {
  icons_a: ['class_sword', 'class_spear', 'class_cavalry', 'class_archer', 'class_mage', 'class_healer', 'class_heavy', 'class_flying', 'adv_up', 'adv_down', 'adv_even', 'gold', 'gem', 'star'],
  icons_b: ['terrain_plain', 'terrain_forest', 'terrain_mountain', 'terrain_water', 'terrain_castle', 'menu_battle', 'menu_hero', 'menu_gacha', 'menu_stage', 'menu_settings', 'menu_pause', 'menu_undo', 'menu_end_turn'],
};
async function fitInto(img, size, pad) { const b = bbox(img, 64); if (!b) return null; const crop = await extract(img, b.x0, b.y0, b.w, b.h); const s = Math.min((size - pad * 2) / b.w, (size - pad * 2) / b.h); const tw = Math.max(1, Math.round(b.w * s)), th = Math.max(1, Math.round(b.h * s));
  const small = await raw(crop).resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer(); return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: small, left: (size - tw) >> 1, top: (size - th) >> 1 }]).png({ compressionLevel: 9 }).toBuffer(); }
async function ui() {
  const d = `${OUT}/ui`; ensure(`${d}/icons`); ensure(`${d}/deco`); const previews = [];
  for (const sheetId of Object.keys(ICON_NAMES)) {
    if (!existsSync(`${RAW}/ui/${sheetId}.jpg`)) continue;
    const img = keyMagenta(await loadRGBA(`${RAW}/ui/${sheetId}.jpg`), 3); const cw = img.w / 4, ch = img.h / 4;
    for (let i = 0; i < ICON_NAMES[sheetId].length; i++) {
      const cell = await extract(img, Math.round((i % 4) * cw), Math.round(Math.floor(i / 4) * ch), Math.floor(cw), Math.floor(ch));
      const png = await fitInto(cell, RES.icon, 8); if (!png) { console.log(`[${ICON_NAMES[sheetId][i]}] 비어 있음`); continue; }
      writeFileSync(`${d}/icons/${ICON_NAMES[sheetId][i]}.png`, png); previews.push({ data: Buffer.from(await sharp(png).raw().toBuffer()), w: 128, h: 128 });
    }
  }
  for (const id of ['frame_corner', 'ribbon_end', 'divider']) {
    if (!existsSync(`${RAW}/ui/${id}.jpg`)) continue;
    const img = keyMagenta(await loadRGBA(`${RAW}/ui/${id}.jpg`), 3); const b = bbox(img, 64); if (!b) continue;
    const crop = await extract(img, b.x0, b.y0, b.w, b.h); const maxW = id === 'frame_corner' ? 256 : 1024; const s = Math.min(1, maxW / crop.w);
    await raw(crop).resize(Math.round(crop.w * s), Math.round(crop.h * s), { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${d}/deco/${id}.png`); console.log(`[deco ${id}] ${Math.round(crop.w * s)}x${Math.round(crop.h * s)}`);
  }
  if (previews.length) await grid(previews, 128, 128, 7, `${d}/preview_icons.png`, 1, 8, { r: 16, g: 28, b: 58, alpha: 1 });
  console.log(`ui: 아이콘 ${previews.length}개`);
}

// ================= EFFECTS (검정 배경 → 휘도 알파) =================
async function effects() {
  const d = `${OUT}/effects`; for (const s of RES.effect) ensure(`${d}/${s}`); ensure(`${d}/add_256`); const prev = [];
  for (const id of jpgs(`${RAW}/effects`)) {
    const sq = await centerSquare(await loadRGBA(`${RAW}/effects/${id}.jpg`));
    for (const s of RES.effect) {
      const im = await resize(sq, s, s); const add = { ...im, data: Buffer.from(im.data) };
      for (let i = 0; i < s * s; i++) { const r = im.data[i * 4], g = im.data[i * 4 + 1], b = im.data[i * 4 + 2]; const mx = Math.max(r, g, b); const a = Math.min(255, Math.round(mx < 12 ? 0 : (mx - 12) * 255 / 243));
        if (a === 0) { im.data.fill(0, i * 4, i * 4 + 4); continue; } const k = 255 / Math.max(a, 1); im.data[i * 4] = Math.min(255, Math.round(r * k)); im.data[i * 4 + 1] = Math.min(255, Math.round(g * k)); im.data[i * 4 + 2] = Math.min(255, Math.round(b * k)); im.data[i * 4 + 3] = a; }
      await toPng(im, `${d}/${s}/${id}.png`); if (s === 256) { for (let i = 0; i < s * s; i++) add.data[i * 4 + 3] = 255; await toPng(add, `${d}/add_256/${id}.png`); prev.push(im); }
    }
    console.log(`[fx ${id}] 128/256/add_256`);
  }
  if (prev.length) await grid(prev, 256, 256, 3, `${d}/preview_256.png`, 1, 8, { r: 16, g: 28, b: 58, alpha: 1 });
}

// ================= 64px 세트 =================
const PAL64 = 40; // 64px 공통 팔레트 색 수(32~48 범위)
function adjustTone(img, sat = 0.85, val = 0.95) { // 채도·명도 소폭 하향(차분한 톤)
  for (let i = 0; i < img.w * img.h; i++) { const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2]; const mx = Math.max(r, g, b), l = (r + g + b) / 3;
    img.data[i * 4] = Math.round((l + (r - l) * sat) * val); img.data[i * 4 + 1] = Math.round((l + (g - l) * sat) * val); img.data[i * 4 + 2] = Math.round((l + (b - l) * sat) * val); if (mx === 0) img.data.fill(0, i * 4, i * 4 + 3); }
  return img;
}
async function rotate(img, deg) { const r = await raw(img).rotate(deg).raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(r.data), w: r.info.width, h: r.info.height }; }
async function tiles64() {
  const d = `${OUT}/tiles`; ensure(`${d}/64`); ensure(`${d}/64_x2`);
  const CROP = { plain_a: 0.5, plain_b: 0.5, plain_c: 0.5, water_a: 0.5, water_b: 0.5, castle_a: 0.7, castle_b: 0.7, mountain_a: 0.85, mountain_b: 0.75 };
  const ids = jpgs(`${RAW}/tiles64`); const imgs = [], names = [];
  for (const id of ids) {
    let sq = await centerSquare(await loadRGBA(`${RAW}/tiles64/${id}.jpg`)); const fr = CROP[id] ?? 1; if (fr < 1) { const s = Math.round(sq.w * fr); sq = await extract(sq, (sq.w - s) >> 1, (sq.h - s) >> 1, s, s); }
    const mid = await resize(sq, 256, 256, 'lanczos3'); imgs.push(adjustTone(await resize(mid, 64, 64, 'lanczos2'))); names.push(id);
  }
  // 길 방향 변형(회전, 호출 없음): road_v → road_h, road_corner(아래→오른쪽) → 3회전, road_cross 그대로
  for (let i = 0, n = imgs.length; i < n; i++) {
    if (names[i] === 'road_v') { imgs.push(await rotate(imgs[i], 90)); names.push('road_h'); }
    if (names[i] === 'road_corner') { for (const [deg, nm] of [[90, 'road_corner_90'], [180, 'road_corner_180'], [270, 'road_corner_270']]) { imgs.push(await rotate(imgs[i], deg)); names.push(nm); } }
  }
  // 모서리 길 보정(ROAD_SYNTH=1 일 때만): road_v/road_h 합성으로 L자 생성. 기본은 모델이 그린 road_corner 원본 사용(2차 QA: 원본이 아래·오른쪽 가장자리까지 닿고, 합성본은 길 판정 누락으로 L 이 짧아짐)
  const isRoad = (im, i) => { const r = im.data[i * 4], g = im.data[i * 4 + 1], b = im.data[i * 4 + 2]; return r > 110 && r > g && g > b && r - b > 40; };
  const iv = names.indexOf('road_v'), ih = names.indexOf('road_h'), ic = names.indexOf('road_corner'), ip = names.indexOf('plain_a');
  if (process.env.ROAD_SYNTH === '1' && iv >= 0 && ih >= 0 && ic >= 0 && ip >= 0) {
    const base = { w: 64, h: 64, data: Buffer.from(imgs[ip].data) };
    for (let y = 0; y < 64; y++) for (let x = 0; x < 64; x++) { const i = y * 64 + x; let src = null;
      if (y >= 26 && isRoad(imgs[iv], i)) src = imgs[iv]; else if (x >= 26 && isRoad(imgs[ih], i)) src = imgs[ih];
      if (src) base.data.copy(base.data, i * 4, 0, 0), src.data.copy(base.data, i * 4, i * 4, i * 4 + 4); }
    imgs[ic] = base; for (const [deg, nm] of [[90, 'road_corner_90'], [180, 'road_corner_180'], [270, 'road_corner_270']]) imgs[names.indexOf(nm)] = await rotate(base, deg);
    console.log('[tile64 road_corner*] road_v/road_h 합성으로 대체');
  }
  const pal = buildPalette(imgs, PAL64); imgs.forEach((im) => applyPalette(im, pal));
  for (let i = 0; i < imgs.length; i++) { await toPng(imgs[i], `${d}/64/${names[i]}.png`); writeFileSync(`${d}/64_x2/${names[i]}.png`, await scaleNearest(imgs[i], 2)); console.log(`[tile64 ${names[i]}] 이음새 ${JSON.stringify(edgeDiff(imgs[i]))}`); }
  const cols = 8, rows = Math.ceil(imgs.length / cols); const comps = [];
  for (let t = 0; t < imgs.length; t++) comps.push({ input: await raw(imgs[t]).png().toBuffer(), left: (t % cols) * 64, top: Math.floor(t / cols) * 64 });
  await sharp({ create: { width: cols * 64, height: rows * 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(`${d}/tileset_64.png`);
  writeFileSync(`${d}/tileset_64.tsx`, `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="terrain_64" tilewidth="64" tileheight="64" tilecount="${imgs.length}" columns="${cols}">\n <image source="tileset_64.png" width="${cols * 64}" height="${rows * 64}"/>\n${names.map((n, i) => ` <tile id="${i}"><properties><property name="code" value="${n.split('_')[0]}"/><property name="variant" value="${n}"/></properties></tile>`).join('\n')}\n</tileset>\n`);
  writeFileSync(`${d}/tileset_64.json`, JSON.stringify({ tile: 64, columns: cols, order: names, palette: pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')) }, null, 1));
  const prev = []; for (const im of imgs) { const one = await raw(im).png().toBuffer(); const t3 = await sharp({ create: { width: 192, height: 192, channels: 4, background: '#000' } }).composite(Array.from({ length: 9 }, (_, j) => ({ input: one, left: (j % 3) * 64, top: Math.floor(j / 3) * 64 }))).raw().toBuffer(); prev.push({ data: Buffer.from(t3), w: 192, h: 192 }); }
  await grid(prev, 192, 192, 5, `${d}/preview_64_3x3_x2.png`, 2, 8);
  console.log(`tiles64: ${imgs.length}장, 팔레트 ${pal.length}색`);
}
async function spriteFit(file, size, inner) { // 크로마키 → bbox → inner 안에 맞춤(하단 중앙), 2단 축소
  const img = keyMagenta(await loadRGBA(file), 3); const b = bbox(img, 128); const crop = await extract(img, b.x0, b.y0, b.w, b.h); const s = Math.min(inner / b.h, inner / b.w);
  const tw = Math.max(1, Math.round(b.w * s)), th = Math.max(1, Math.round(b.h * s));
  const small = await raw(await resize(crop, tw * 4, th * 4, 'lanczos3')).resize(tw, th, { kernel: 'lanczos2' }).png().toBuffer();
  const { data, info } = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: small, left: (size - tw) >> 1, top: size - 2 - th }]).raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), w: info.width, h: info.height };
}
function tintTeam(img, side) { // 영웅용 팀 표시: 외곽 1px 팀색 링 + 12% 틴트
  const col = side === 'ally' ? [62, 142, 247] : [224, 74, 74]; const out = { ...img, data: Buffer.from(img.data) }; const { w, h } = img;
  for (let i = 0; i < w * h; i++) if (out.data[i * 4 + 3]) for (let c = 0; c < 3; c++) out.data[i * 4 + c] = Math.round(out.data[i * 4 + c] * 0.88 + col[c] * 0.12);
  const ring = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (img.data[i * 4 + 3]) continue; if ((x > 0 && img.data[(i - 1) * 4 + 3]) || (x < w - 1 && img.data[(i + 1) * 4 + 3]) || (y > 0 && img.data[(i - w) * 4 + 3]) || (y < h - 1 && img.data[(i + w) * 4 + 3])) ring.push(i); }
  for (const i of ring) { out.data[i * 4] = col[0]; out.data[i * 4 + 1] = col[1]; out.data[i * 4 + 2] = col[2]; out.data[i * 4 + 3] = 255; }
  return out;
}
async function sprites64() {
  const d = `${OUT}/sprites`; ensure(`${d}/64`); ensure(`${d}/64_x2`);
  const ids = jpgs(`${RAW}/sprites64`); const frames = [];
  for (const id of ids) frames.push(await spriteFit(`${RAW}/sprites64/${id}.jpg`, 64, 60));
  const pal = buildPalette(frames, PAL64); frames.forEach((f) => applyPalette(f, pal)); const lineup = [];
  for (let i = 0; i < ids.length; i++) for (const side of ['ally', 'enemy']) { const f = side === 'ally' ? frames[i] : hueShiftBlueToRed(frames[i]); await toPng(f, `${d}/64/${ids[i]}_${side}.png`); writeFileSync(`${d}/64_x2/${ids[i]}_${side}.png`, await scaleNearest(f, 2)); lineup.push(f); }
  await grid(lineup, 64, 64, 8, `${d}/preview_64_lineup_x3.png`, 3, 6);
  writeFileSync(`${d}/palette_64.json`, JSON.stringify({ colors: pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')), note: '64px 병종 공통 40색(아군). 적군은 파랑→빨강 색상 회전' }, null, 1));
  console.log(`sprites64: ${ids.length}종, 팔레트 ${pal.length}색`);
}
async function heroes() {
  const d = `${OUT}/sprites`; ensure(`${d}/64`); ensure(`${d}/64_x2`);
  const ids = jpgs(`${RAW}/heroes`); if (!ids.length) return; const frames = [];
  for (const id of ids) frames.push(await spriteFit(`${RAW}/heroes/${id}.jpg`, 64, 60));
  const pal = buildPalette(frames, 48); frames.forEach((f) => applyPalette(f, pal)); const lineup = [];
  for (let i = 0; i < ids.length; i++) for (const side of ['ally', 'enemy']) { const f = tintTeam(frames[i], side); await toPng(f, `${d}/64/hero_${ids[i]}_${side}.png`); writeFileSync(`${d}/64_x2/hero_${ids[i]}_${side}.png`, await scaleNearest(f, 2)); lineup.push(f); }
  await grid(lineup, 64, 64, 8, `${d}/preview_64_heroes_x3.png`, 3, 6);
  console.log(`heroes: ${ids.length}명, 팔레트 ${pal.length}색(영웅 전용 48색, 팀 표시=외곽 1px 링+12% 틴트)`);
}

async function pool() { // 3x3 시트 → 칸별 bbox → 64px, 공통 48색, 팀 표시(링+틴트)
  const d = `${OUT}/sprites`; ensure(`${d}/64`); ensure(`${d}/64_x2`); const { JOBS } = await import('./style_guide.mjs');
  const frames = [], names = [];
  for (const sheet of JOBS.pool) {
    const f = `${RAW}/pool/${sheet.id}.jpg`; if (!existsSync(f)) continue;
    const img = keyMagenta(await loadRGBA(f), 3); const cw = Math.floor(img.w / 3), ch = Math.floor(img.h / 3);
    for (let k = 0; k < sheet.members.length; k++) {
      const cell = await extract(img, (k % 3) * cw, Math.floor(k / 3) * ch, cw, ch); const b = bbox(cell, 128);
      if (!b || b.h < ch * 0.3) { console.log(`[pool ${sheet.members[k]}] 칸 비어 있음/작음 → 건너뜀`); continue; }
      const crop = await extract(cell, b.x0, b.y0, b.w, b.h); const s = Math.min(60 / b.h, 60 / b.w); const tw = Math.max(1, Math.round(b.w * s)), th = Math.max(1, Math.round(b.h * s));
      const small = await raw(await resize(crop, tw * 4, th * 4, 'lanczos3')).resize(tw, th, { kernel: 'lanczos2' }).png().toBuffer();
      const { data, info } = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: small, left: (64 - tw) >> 1, top: 62 - th }]).raw().toBuffer({ resolveWithObject: true });
      frames.push({ data: Buffer.from(data), w: 64, h: 64 }); names.push(sheet.members[k]);
    }
  }
  if (!frames.length) return; const pal = buildPalette(frames, 48); frames.forEach((f) => applyPalette(f, pal)); const lineup = [];
  for (let i = 0; i < names.length; i++) { for (const side of ['ally', 'enemy']) { const f = tintTeam(frames[i], side); await toPng(f, `${d}/64/cmd_${names[i]}_${side}.png`); writeFileSync(`${d}/64_x2/cmd_${names[i]}_${side}.png`, await scaleNearest(f, 2)); } lineup.push(tintTeam(frames[i], 'ally')); }
  await grid(lineup, 64, 64, 10, `${d}/preview_64_pool_x2.png`, 2, 6);
  writeFileSync(`${d}/pool_names.json`, JSON.stringify(names)); console.log(`pool: ${names.length}종, 팔레트 ${pal.length}색`);
}

// ================= 방향 스프라이트(64px 3x3 시트 → 192x256 4방향 시트) =================
// 입력: raw/dir64[_<culture>]/<type>.jpg (3열 walk1/idle/walk2 x 3행 정면/좌/후면). 출력: sprites/64/[<culture>_]<type>_<side>_sheet.png (3열x4행: down,left,right,up) + 64_x2.
// 처리: 크로마키 → 칸 분할 → (2행의 오른쪽을 향한 칸은 좌우 반전해 모두 '왼쪽 향함'으로 정규화: DIR_FACING) → 행 공통 배율·발 기준선(idle 칸 하단=y62, 하체 질량 중심 x=32) → 공통 팔레트 → right 행 = left 행 미러(mirror_baked).
// down 행: default = 기존 정면 이미지(unit.<type>.<side>.64), 다른 문화권 = 생성된 정면 idle 칸. 둘 다 3칸 모두 같은 정면 이미지(walk1/walk2 는 1px 위로 바운스; 생성된 정면 walk 칸은 무기 유무가 프레임마다 달라 폐기). 팀 표시: default=기존 병종 방식(파랑→빨강 색상 회전), 그 외 문화권=tintTeam(링+12% 틴트).
const DIR_TYPES = ['sword', 'spear', 'cavalry', 'archer', 'mage', 'healer', 'heavy', 'flying'];
const DIR_FACING = { // 2행(측면) 칸별 원본이 향한 방향(눈으로 판정). R 이면 좌우 반전해 L 로 정규화
  korea: { sword: 'LRR', spear: 'LLR', cavalry: 'LLR', archer: 'LLR', mage: 'LLR', healer: 'LRR', heavy: 'LLR' },
  default: { sword: 'LRR', spear: 'LLR', cavalry: 'LLR', archer: 'LLR', mage: 'LLR', healer: 'LRR', heavy: 'LLR', flying: 'RRR' },
};
const flop = async (img) => { const r = await raw(img).flop().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(r.data), w: r.info.width, h: r.info.height }; };
const shiftImg = async (img, dx, dy) => { const { data, info } = await sharp({ create: { width: img.w, height: img.h, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: await raw(img).png().toBuffer(), left: dx, top: dy }]).raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; };
function dropEdgeBlobs(img) { // 칸 경계를 넘어온 이웃 칸의 조각 제거: 가장 큰 덩어리 외에 칸 가장자리에 닿은 덩어리 삭제
  const { w, h, data } = img; const lab = new Int32Array(w * h); const comps = []; let n = 0;
  for (let i = 0; i < w * h; i++) { if (lab[i] || data[i * 4 + 3] < 128) continue; n++; const st = [i]; lab[i] = n; let size = 0, edge = false;
    while (st.length) { const p = st.pop(); size++; const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !lab[q] && data[q * 4 + 3] >= 128) { lab[q] = n; st.push(q); } }
    comps.push({ size, edge }); }
  if (!comps.length) return img; const big = comps.reduce((b, c, i) => (c.size > comps[b].size ? i : b), 0);
  for (let i = 0; i < w * h; i++) { const l = lab[i]; if (l && l - 1 !== big && comps[l - 1].edge) data.fill(0, i * 4, i * 4 + 4); }
  return img;
}
function bandH(img, cx, hw) { let y0 = img.h, y1 = -1; for (let y = 0; y < img.h; y++) for (let x = Math.max(0, Math.floor(cx - hw)); x <= Math.min(img.w - 1, Math.ceil(cx + hw)); x++) if (img.data[(y * img.w + x) * 4 + 3] >= 128) { if (y < y0) y0 = y; if (y > y1) y1 = y; } return y1 - y0 + 1; }
function footCx(img, b) { let sx = 0, n = 0; for (let y = Math.floor(b.y1 - b.h * 0.3); y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (img.data[(y * img.w + x) * 4 + 3] >= 128) { sx += x + 0.5; n++; } return n ? sx / n : (b.x0 + b.x1 + 1) / 2; }
async function dir64() {
  if (process.env.FORCE_V1 !== '1') { console.log('dir64(v1)는 폐기됨: 픽셀 파이프라인 v2 = docker/gemini/pp_v2.mjs 사용(덮어쓰려면 FORCE_V1=1)'); return; }
  const culture = process.env.CULTURE ?? 'default'; const pre = culture === 'default' ? '' : `${culture}_`; const dflt = culture === 'default';
  const rawDir = dflt ? `${RAW}/dir64` : `${RAW}/dir64_${culture}`; const d = `${OUT}/sprites`; ensure(`${d}/64`); ensure(`${d}/64_x2`);
  const facing = DIR_FACING[culture]; if (!facing) throw new Error(`DIR_FACING 미정의: ${culture}`);
  const types = DIR_TYPES.filter((t) => existsSync(`${rawDir}/${t}.jpg`)); const sheets = {}; const gens = [];
  for (const t of types) {
    const img = keyMagenta(await loadRGBA(`${rawDir}/${t}.jpg`), 3); const cw = Math.floor(img.w / 3), ch = Math.floor(img.h / 3); const cells = [];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let cell = dropEdgeBlobs(await extract(img, c * cw, r * ch, cw, ch)); if (r === 1 && facing[t][c] === 'R') cell = await flop(cell); cells.push(cell); }
    const bI = bbox(cells[4], 128); const hw = 0.08 * cw; let refH;
    if (dflt) { const front = await loadRGBA(`${d}/64/${t}_ally.png`); const bF = bbox(front, 128); refH = bandH(front, footCx(front, bF), 0.08 * 64); } else { const s0 = Math.min(60 / bI.h, 60 / bI.w); refH = bandH(cells[4], footCx(cells[4], bI), hw) * s0; }
    const frames = []; // 인덱스 r*3+c, r: 0 down(정면) 1 left 2 up(후면)
    for (let r = 0; r < 3; r++) {
      const bR = bbox(cells[r * 3 + 1], 128); const cx = footCx(cells[r * 3 + 1], bR); const bottom = bR.y1 + 1;
      const rb = [0, 1, 2].map((c) => bbox(cells[r * 3 + c], 128)); let s = refH / bandH(cells[r * 3 + 1], cx, hw); const sFit = Math.min(62 / Math.max(...rb.map((x) => x.h)), 62 / Math.max(...rb.map((x) => x.w))); if (sFit < s) { console.log(`[dir ${pre}${t}] 행 ${r} 배율 ${s.toFixed(3)}→${sFit.toFixed(3)}(잘림 방지)`); s = sFit; }
      for (let c = 0; c < 3; c++) { const cell = cells[r * 3 + c]; const b = bbox(cell, 128); const crop = await extract(cell, b.x0, b.y0, b.w, b.h);
        const tw = Math.max(1, Math.round(b.w * s)), th = Math.max(1, Math.round(b.h * s)); const small = await raw(await resize(crop, tw * 4, th * 4, 'lanczos3')).resize(tw, th, { kernel: 'lanczos2' }).png().toBuffer();
        let left = Math.round(32 + (b.x0 - cx) * s); left = Math.max(0, Math.min(left, 64 - tw)); const top = Math.round(62 + (b.y0 - bottom) * s);
        const cv = sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } });
        // 캔버스 밖으로 나가는 부분은 잘라냄
        const sm = sharp(small); const sx0 = Math.max(0, -left), sy0 = Math.max(0, -top), sw = Math.min(tw, 64 - left) - sx0, sh = Math.min(th, 64 - top) - sy0;
        const piece = await sm.extract({ left: sx0, top: sy0, width: sw, height: sh }).png().toBuffer();
        const o = await cv.composite([{ input: piece, left: Math.max(0, left), top: Math.max(0, top) }]).raw().toBuffer({ resolveWithObject: true });
        frames.push({ data: Buffer.from(o.data), w: 64, h: 64, clipped: left < 0 || top < 0 || left + tw > 64 || top + th > 64 }); }
    }
    sheets[t] = frames; gens.push(...frames.filter((_, i) => dflt ? i >= 3 : true));
  }
  let pal; if (dflt) pal = JSON.parse(readFileSync(`${d}/palette_64.json`, 'utf8')).colors.map((h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16))); else { pal = buildPalette(gens, 48); writeFileSync(`${d}/palette_64_${culture}.json`, JSON.stringify({ colors: pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')), note: `${culture} 문화권 병종 시트 공통 48색(아군)` }, null, 1)); }
  const prevS = { ally: [], enemy: [] }, tileCells = [];
  for (const t of types) {
    const fr = sheets[t]; fr.forEach((f, i) => { if (!dflt || i >= 3) applyPalette(f, pal); if (f.clipped) console.log(`[dir ${pre}${t}] 프레임 ${i} 가장자리 잘림`); });
    for (const side of ['ally', 'enemy']) {
      let down;
      if (dflt) { const f = await loadRGBA(`${d}/64/${t}_${side}.png`); down = [await shiftImg(f, 0, -1), f, await shiftImg(f, 0, -1)]; } else down = [await shiftImg(fr[1], 0, -1), fr[1], await shiftImg(fr[1], 0, -1)];
      const conv = (f) => (dflt ? (side === 'ally' ? f : hueShiftBlueToRed(f)) : tintTeam(f, side));
      const rows = { down: dflt ? down : down.map(conv), left: fr.slice(3, 6).map(conv), up: fr.slice(6, 9).map(conv) };
      rows.right = await Promise.all(rows.left.map(flop));
      const order = ['down', 'left', 'right', 'up']; const comps = [];
      for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) comps.push({ input: await raw(rows[order[r]][c]).png().toBuffer(), left: c * 64, top: r * 64 });
      const sheet = await sharp({ create: { width: 192, height: 256, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toBuffer();
      writeFileSync(`${d}/64/${pre}${t}_${side}_sheet.png`, sheet); const sh = { data: Buffer.from(await sharp(sheet).raw().toBuffer()), w: 192, h: 256 }; writeFileSync(`${d}/64_x2/${pre}${t}_${side}_sheet.png`, await scaleNearest(sh, 2));
      prevS[side].push(sh); for (const k of order) tileCells.push({ side, img: rows[k][1] });
    }
  }
  await grid(prevS.ally, 192, 256, 4, `${d}/preview_64_dir_${culture}_x2.png`, 2, 6);
  await grid(prevS.enemy, 192, 256, 4, `${d}/preview_64_dir_${culture}_enemy_x2.png`, 2, 6);
  const tile = await sharp(`${OUT}/tiles/64/plain_a.png`).png().toBuffer(); const comps = []; let n = 0;
  for (const c of tileCells) { const i = n++; const row = Math.floor(i / 8), col = i % 8; comps.push({ input: tile, left: col * 64, top: row * 64 }, { input: await raw(c.img).png().toBuffer(), left: col * 64, top: row * 64 }); }
  await sharp({ create: { width: 512, height: Math.ceil(tileCells.length / 8) * 64, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${d}/preview_64_dir_${culture}_ontile.png`);
  console.log(`dir64[${culture}]: ${types.length}종 x 2팀, 팔레트 ${pal.length}색`);
}

const runners = { tiles, sprites, ui, effects, tiles64, sprites64, heroes, pool, dir64 };
for (const k of process.argv.slice(2)) { if (!runners[k]) { console.error(`알 수 없음: ${k}`); continue; } console.log(`== ${k} ==`); await runners[k](); }
