// 후처리: 크롭/리사이즈/크로마키 알파 제거/팔레트 양자화/타일셋/시트/미리보기.
// 실행(컨테이너): docker run --rm -v "$PWD":/app -w /app node:22 sh -c \
//   "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/postprocess.mjs <kind>"
// kind: tiles | tiles_pixel | sprites | sprites_pixel | sheets_pixel | effects
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';

const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const ROOT = 'public/assets/test';
const PALETTE_COLORS = 32; // 도트 공통 팔레트 색 수(디더링 없음)

const ids = (dir) => readdirSync(dir).filter((f) => f.endsWith('.jpg')).map((f) => f.replace('.jpg', ''));
const ensure = (d) => mkdirSync(d, { recursive: true });

async function loadRGBA(file) {
  const { data, info } = await sharp(file).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), w: info.width, h: info.height };
}
const toPng = (img, file) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } }).png().toFile(file);
async function resizeRGBA(img, w, h, kernel = 'lanczos3') {
  const { data, info } = await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .resize(w, h, { kernel, fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), w: info.width, h: info.height };
}
async function centerSquare(file) { // 정사각 중앙 크롭
  const m = await sharp(file).metadata(); const s = Math.min(m.width, m.height);
  const { data, info } = await sharp(file).extract({ left: Math.floor((m.width - s) / 2), top: Math.floor((m.height - s) / 2), width: s, height: s })
    .ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), w: info.width, h: info.height };
}

// ---- 크로마키(마젠타): 엄격 마스크 + 가장자리 번짐(느슨 마스크) 2px 확장 ----
function keyMagenta(img) {
  const { data, w, h } = img; const N = w * h;
  const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    strict[i] = r > 140 && b > 140 && g < 130 && r - g > 90 && b - g > 90 ? 1 : 0;
    loose[i] = r - g > 55 && b - g > 55 ? 1 : 0;
  }
  for (let it = 0; it < 2; it++) {
    const add = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const i = y * w + x; if (strict[i] || !loose[i]) continue;
      if ((x > 0 && strict[i - 1]) || (x < w - 1 && strict[i + 1]) || (y > 0 && strict[i - w]) || (y < h - 1 && strict[i + w])) add.push(i);
    }
    for (const i of add) strict[i] = 1;
  }
  for (let i = 0; i < N; i++) if (strict[i]) { data[i * 4 + 3] = 0; }
  return img;
}
// 이펙트용 소프트 키: 마젠타 성분을 알파로 환산하고 배경색을 역혼합(unmix)해 번짐 제거
function softKeyMagenta(img) {
  const { data, w, h } = img;
  for (let i = 0; i < w * h; i++) {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    const spill = Math.max(0, Math.min(r, b) - g);
    let a = Math.min(1, Math.max(0, 1 - Math.max(0, spill - 20) / 220));
    if (a < 0.03) { data[i * 4 + 3] = 0; continue; }
    const mix = (c, m) => Math.min(255, Math.max(0, Math.round((c - (1 - a) * m) / a)));
    data[i * 4] = mix(r, 255); data[i * 4 + 1] = mix(g, 0); data[i * 4 + 2] = mix(b, 255);
    data[i * 4 + 3] = Math.round(a * 255);
  }
  return img;
}
function bbox(img, thr = 128) {
  let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1;
  for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] >= thr) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

// ---- 공통 팔레트(메디안 컷) 양자화, 디더링 없음, 알파는 이진화 ----
function buildPalette(imgs, n) {
  let px = [];
  for (const im of imgs) for (let i = 0; i < im.w * im.h; i++) if (im.data[i * 4 + 3] >= 128) px.push([im.data[i * 4], im.data[i * 4 + 1], im.data[i * 4 + 2]]);
  const boxes = [px];
  while (boxes.length < n) {
    boxes.sort((a, b) => b.length - a.length);
    const bx = boxes.shift(); if (!bx || bx.length < 2) { if (bx) boxes.push(bx); break; }
    const rng = [0, 1, 2].map((c) => Math.max(...bx.map((p) => p[c])) - Math.min(...bx.map((p) => p[c])));
    const c = rng.indexOf(Math.max(...rng));
    bx.sort((a, b) => a[c] - b[c]);
    const mid = bx.length >> 1; boxes.push(bx.slice(0, mid), bx.slice(mid));
  }
  return boxes.filter((b) => b.length).map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, p) => s + p[c], 0) / b.length)));
}
function applyPalette(img, pal) {
  for (let i = 0; i < img.w * img.h; i++) {
    if (img.data[i * 4 + 3] < 128) { img.data[i * 4 + 3] = 0; continue; }
    const r = img.data[i * 4], g = img.data[i * 4 + 1], b = img.data[i * 4 + 2];
    let best = 0, bd = Infinity;
    for (let k = 0; k < pal.length; k++) { const d = (r - pal[k][0]) ** 2 + (g - pal[k][1]) ** 2 + (b - pal[k][2]) ** 2; if (d < bd) { bd = d; best = k; } }
    img.data[i * 4] = pal[best][0]; img.data[i * 4 + 1] = pal[best][1]; img.data[i * 4 + 2] = pal[best][2]; img.data[i * 4 + 3] = 255;
  }
  return img;
}

// ---- 이음새: 좌우/상하 가장자리 평균 절대 차이(0~255) + 오프셋 블렌드 심리스 보정 ----
function edgeDiff(img) {
  let h = 0, v = 0;
  for (let y = 0; y < img.h; y++) for (let c = 0; c < 3; c++) h += Math.abs(img.data[(y * img.w) * 4 + c] - img.data[(y * img.w + img.w - 1) * 4 + c]);
  for (let x = 0; x < img.w; x++) for (let c = 0; c < 3; c++) v += Math.abs(img.data[x * 4 + c] - img.data[((img.h - 1) * img.w + x) * 4 + c]);
  return { lr: +(h / (img.h * 3)).toFixed(1), tb: +(v / (img.w * 3)).toFixed(1) };
}
function seamless(img) { // 반 칸 오프셋 이미지와 중심 가중 블렌드: 가장자리는 오프셋본(=원본 중앙부, 연속)이 되어 이음새가 사라짐
  const { w, h, data } = img; const out = Buffer.from(data);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const wx = 1 - Math.abs(x - (w - 1) / 2) / (w / 2), wy = 1 - Math.abs(y - (h - 1) / 2) / (h / 2);
    const wt = Math.min(1, Math.max(0, wx * wy * 1.0)); // 중심 1, 가장자리 0
    const sx = (x + (w >> 1)) % w, sy = (y + (h >> 1)) % h;
    for (let c = 0; c < 3; c++) out[(y * w + x) * 4 + c] = Math.round(data[(y * w + x) * 4 + c] * wt + data[(sy * w + sx) * 4 + c] * (1 - wt));
  }
  return { ...img, data: out };
}
async function preview3x3(tiles, tileSize, scale, file, cols = 3) { // tiles: RGBA img(tileSize)
  const block = tileSize * 3 * scale, gap = 8, rows = Math.ceil(tiles.length / cols);
  const W = cols * block + (cols + 1) * gap, H = rows * block + (rows + 1) * gap;
  const comps = [];
  for (let t = 0; t < tiles.length; t++) {
    const up = await sharp(tiles[t].data, { raw: { width: tileSize, height: tileSize, channels: 4 } }).resize(tileSize * scale, tileSize * scale, { kernel: 'nearest' }).png().toBuffer();
    const bx = gap + (t % cols) * (block + gap), by = gap + Math.floor(t / cols) * (block + gap);
    for (let j = 0; j < 3; j++) for (let i = 0; i < 3; i++) comps.push({ input: up, left: bx + i * tileSize * scale, top: by + j * tileSize * scale });
  }
  await sharp({ create: { width: W, height: H, channels: 4, background: '#202020' } }).composite(comps).png().toFile(file);
}
async function tileset(tiles, size, file, name) {
  const cols = 3, rows = Math.ceil(tiles.length / cols);
  const comps = [];
  for (let t = 0; t < tiles.length; t++) comps.push({ input: await sharp(tiles[t].data, { raw: { width: size, height: size, channels: 4 } }).png().toBuffer(), left: (t % cols) * size, top: Math.floor(t / cols) * size });
  await sharp({ create: { width: cols * size, height: rows * size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png().toFile(file);
  writeFileSync(file.replace('.png', '.tsx'), `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="${name}" tilewidth="${size}" tileheight="${size}" tilecount="${tiles.length}" columns="${cols}">\n <image source="${path.basename(file)}" width="${cols * size}" height="${rows * size}"/>\n</tileset>\n`);
}

const kind = process.argv[2];
const dir = (k) => path.join(ROOT, k);

if (kind === 'tiles') { // 일러스트풍 타일: 정사각 크롭 -> 64/128
  const d = dir('tiles'); ensure(`${d}/64`); ensure(`${d}/128`);
  const t64 = [];
  for (const id of ids(`${d}/raw`)) {
    const sq = await centerSquare(`${d}/raw/${id}.jpg`);
    const a = await resizeRGBA(sq, 64, 64), b = await resizeRGBA(sq, 128, 128);
    await toPng(a, `${d}/64/${id}.png`); await toPng(b, `${d}/128/${id}.png`); t64.push(a);
    console.log(`[${id}] 64/128 저장, 이음새 차이(64px) ${JSON.stringify(edgeDiff(a))}`);
  }
  await tileset(t64, 64, `${d}/tileset_64.png`, 'test_tiles_64');
  await preview3x3(t64, 64, 1, `${d}/preview_3x3.png`);
}

if (kind === 'tiles_pixel') { // 도트 타일: 정사각 크롭 -> 32x32 -> 공통 팔레트. 16 비교는 생략(32 우선), seamless 변형 포함
  const d = dir('tiles_pixel');
  for (const variant of ['normal', 'seamless']) {
    const out = variant === 'normal' ? d : `${d}/seamless`; ensure(`${out}/32`);
    const imgs = [], names = [];
    for (const id of ids(`${d}/raw`)) {
      let sq = await centerSquare(`${d}/raw/${id}.jpg`);
      if (variant === 'seamless') sq = seamless(sq);
      imgs.push(await resizeRGBA(sq, 32, 32, 'lanczos3')); names.push(id); // 블록 평균에 가까운 필터(최근접은 32px당 1샘플이라 잡음)
    }
    const pal = buildPalette(imgs, PALETTE_COLORS);
    imgs.forEach((im) => applyPalette(im, pal));
    for (let i = 0; i < imgs.length; i++) { await toPng(imgs[i], `${out}/32/${names[i]}.png`); console.log(`[${variant}/${names[i]}] 32x32, 이음새 차이 ${JSON.stringify(edgeDiff(imgs[i]))}`); }
    await tileset(imgs, 32, `${out}/tileset_32.png`, `test_tiles_pixel_${variant}`);
    await preview3x3(imgs, 32, 4, `${out}/preview_3x3_x4.png`);
    console.log(`[${variant}] 팔레트 ${pal.length}색`);
  }
}

async function spriteToSize(file, size) { // 크로마키 -> bbox 트림 -> size 안에 비율 유지로 맞춰 하단 중앙 정렬
  const img = keyMagenta(await loadRGBA(file));
  const bb = bbox(img, 128);
  const crop = await sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: bb.x0, top: bb.y0, width: bb.w, height: bb.h }).png().toBuffer();
  const inner = size - 2, s = Math.min(inner / bb.w, inner / bb.h);
  const tw = Math.max(1, Math.round(bb.w * s)), th = Math.max(1, Math.round(bb.h * s));
  const small = await sharp(crop).resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer();
  const { data, info } = await sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: small, left: Math.floor((size - tw) / 2), top: size - 1 - th }]).raw().toBuffer({ resolveWithObject: true });
  return { data: Buffer.from(data), w: info.width, h: info.height };
}

if (kind === 'sprites') { // 일러스트풍 SD 스프라이트: 64/128 투명 PNG
  const d = dir('sprites'); ensure(`${d}/64`); ensure(`${d}/128`);
  for (const id of ids(`${d}/raw`)) {
    for (const s of [64, 128]) { const im = await spriteToSize(`${d}/raw/${id}.jpg`, s); await toPng(im, `${d}/${s}/${id}.png`); }
    console.log(`[${id}] 64/128 투명 PNG 저장`);
  }
}

if (kind === 'sprites_pixel') { // 일러스트풍 원본을 32x32 도트로 변환(공통 팔레트 32색, 디더링 없음)
  const d = dir('sprites_pixel'); ensure(`${d}/32`);
  const names = ids(`${dir('sprites')}/raw`), imgs = [];
  for (const id of names) imgs.push(await spriteToSize(`${dir('sprites')}/raw/${id}.jpg`, 32));
  const pal = buildPalette(imgs, PALETTE_COLORS);
  for (let i = 0; i < imgs.length; i++) { applyPalette(imgs[i], pal); await toPng(imgs[i], `${d}/32/${names[i]}.png`); console.log(`[${names[i]}] 32x32 도트 저장`); }
  // 8종 한 장 미리보기(x6)
  const comps = [];
  for (let i = 0; i < imgs.length; i++) comps.push({ input: await sharp(imgs[i].data, { raw: { width: 32, height: 32, channels: 4 } }).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(), left: (i % 4) * 196, top: Math.floor(i / 4) * 196 });
  await sharp({ create: { width: 4 * 196, height: 2 * 196, channels: 4, background: '#303030' } }).composite(comps).png().toFile(`${d}/preview_x6.png`);
  console.log(`팔레트 ${pal.length}색`);
}

if (kind === 'sheets_pixel') { // (a) 모델 생성 3x4 시트 -> 96x128 (b) 폴백: 정면 1포즈에서 코드 변형
  const d = dir('sheets_pixel');
  const names = ids(`${d}/raw`), sheets = [];
  for (const id of names) {
    const img = keyMagenta(await loadRGBA(`${d}/raw/${id}.jpg`));
    // 프레임별 bbox(원본 해상도, 셀=이미지/3x4) 기록 -> 일관성 근거
    const cw = img.w / 3, ch = img.h / 4, rows = ['아래', '왼쪽', '오른쪽', '위'];
    console.log(`[${id}] 셀 ${cw.toFixed(0)}x${ch.toFixed(0)}, 프레임별 캐릭터 bbox(높이x너비, 셀 하단 여백):`);
    for (let r = 0; r < 4; r++) {
      const line = [];
      for (let c = 0; c < 3; c++) {
        const sub = { w: Math.round(cw), h: Math.round(ch), data: Buffer.alloc(Math.round(cw) * Math.round(ch) * 4) };
        for (let y = 0; y < sub.h; y++) for (let x = 0; x < sub.w; x++) { const si = ((Math.round(r * ch) + y) * img.w + Math.round(c * cw) + x) * 4; if (si + 3 < img.data.length) img.data.copy(sub.data, (y * sub.w + x) * 4, si, si + 4); }
        const b = bbox(sub); line.push(b ? `${b.h}x${b.w}(y ${b.y0}-${b.y1})` : '없음');
      }
      console.log(`  ${rows[r]}행: ${line.join(' | ')}`);
    }
    const small = await resizeRGBA(img, 96, 128, 'lanczos3');
    sheets.push({ id, small });
  }
  const pal = buildPalette(sheets.map((s) => s.small), PALETTE_COLORS);
  for (const s of sheets) {
    applyPalette(s.small, pal);
    await toPng(s.small, `${d}/${s.id}.png`);
    await sharp(s.small.data, { raw: { width: 96, height: 128, channels: 4 } }).resize(384, 512, { kernel: 'nearest' }).png().toFile(`${d}/${s.id}_preview_x4.png`);
    console.log(`[${s.id}] 96x128 시트 저장`);
  }
  // 폴백: sprites_pixel/32/<병종>.png 정면 1포즈 -> 3x4
  for (const [sheetId, unit] of [['fallback_sword', 'sword'], ['fallback_archer', 'archer']]) {
    const f = `${dir('sprites_pixel')}/32/${unit}.png`;
    if (!existsSync(f)) { console.log(`[${sheetId}] 건너뜀: ${f} 없음(sprites_pixel 먼저 실행)`); continue; }
    const base = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const front = { data: Buffer.from(base.data), w: 32, h: 32 };
    const flip = { ...front, data: Buffer.from(await sharp(front.data, { raw: { width: 32, height: 32, channels: 4 } }).flop().raw().toBuffer()) };
    const dark = { ...front, data: Buffer.from(front.data) };
    for (let i = 0; i < 1024; i++) { dark.data[i * 4] = dark.data[i * 4] * 0.75; dark.data[i * 4 + 1] = dark.data[i * 4 + 1] * 0.75; dark.data[i * 4 + 2] = dark.data[i * 4 + 2] * 0.75; }
    // 열: [왼발(1px 올림), 서있음, 오른발(좌우반전+1px 올림)] / 행: 아래=정면, 왼쪽=정면, 오른쪽=반전, 위=어둡게(뒷모습 대체)
    const rowsSrc = [front, front, flip, dark];
    const comps = [];
    for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) {
      let src = rowsSrc[r];
      if (c === 2 && (r === 0 || r === 3)) src = { ...src, data: Buffer.from(await sharp(src.data, { raw: { width: 32, height: 32, channels: 4 } }).flop().raw().toBuffer()) }; // 정면/뒷모습만 발 교대용 반전
      let img = sharp(src.data, { raw: { width: 32, height: 32, channels: 4 } });
      if (c !== 1) img = img.extract({ left: 0, top: 1, width: 32, height: 31 }); // 1px 위로 바운스(걸음 흉내)
      comps.push({ input: await img.png().toBuffer(), left: c * 32, top: r * 32 });
    }
    const safe = comps;
    const out = await sharp({ create: { width: 96, height: 128, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(safe).png().toBuffer();
    writeFileSync(`${d}/${sheetId}.png`, out);
    await sharp(out).resize(384, 512, { kernel: 'nearest' }).png().toFile(`${d}/${sheetId}_preview_x4.png`);
    console.log(`[${sheetId}] 폴백 96x128 시트 저장 (4방향 변형: 좌우 반전, 1px 바운스; 뒷모습은 명암 대체)`);
  }
}

if (kind === 'effects') { // 소프트 키 -> 128/256 PNG, add 블렌드용 검정 배경 256 버전
  const d = dir('effects'); ensure(`${d}/128`); ensure(`${d}/256`); ensure(`${d}/add_256`);
  for (const id of ids(`${d}/raw`).filter((i) => !i.startsWith('sheet_'))) {
    const sq = softKeyMagenta(await centerSquare(`${d}/raw/${id}.jpg`));
    for (const s of [128, 256]) { const im = await resizeRGBA(sq, s, s); await toPng(im, `${d}/${s}/${id}.png`); if (s === 256) {
      const add = Buffer.from(im.data); for (let i = 0; i < s * s; i++) { const a = add[i * 4 + 3] / 255; add[i * 4] *= a; add[i * 4 + 1] *= a; add[i * 4 + 2] *= a; add[i * 4 + 3] = 255; }
      await toPng({ data: add, w: s, h: s }, `${d}/add_256/${id}.png`);
    } }
    console.log(`[${id}] 128/256/add_256 저장`);
  }
  for (const id of ids(`${d}/raw`).filter((i) => i.startsWith('sheet_'))) { // 시트는 키잉만(분할 없음)
    await toPng(softKeyMagenta(await loadRGBA(`${d}/raw/${id}.jpg`)), `${d}/${id}_keyed.png`); console.log(`[${id}] 키잉 PNG 저장`);
  }
}
