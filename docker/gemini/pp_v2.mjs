// 픽셀 파이프라인 v2: 방향 시트(raw/dir64[_<culture>]/<type>.jpg)를 '진짜 도트 격자'로 재후처리한다.
// 근거: 모델 출력(2048px)은 200x200 도트(1도트=10.24px, 위상 0)로 그려져 있다(경계 에너지 주기 분석: 10.24px 격자선 on/off 비 약 20:1).
//       v1 은 2048→64 를 보간 리샘플(배율 약 0.098)해 도트 경계가 번졌다. v2 는 도트 중심을 직접 샘플(보간 없음)해 1도트=1px 로 쓴다.
// 규칙: (a) 알파 0/255 하드  (b) 격자 샘플(7x7 평균) 후 병종·문화권별 32색 양자화, 디더링 없음
//       (c) 외곽선 1px, 병종 팔레트의 가장 어두운 색으로 통일(밝은 경계는 바깥에 1px 추가), 팀색 링 없음
//       (d) 아군/적: 적은 팔레트 스왑(파랑 계열 슬롯만 빨강 계열) + 발밑 팀색 받침 마커(MARKER=A 실선 / B 링)
// 실행: [CULTURE=default|korea] [MARKER=A|B] SHARP_DIR=/tmp/pp node docker/gemini/pp_v2.mjs   (이전 파일은 *_v1.png 로 1회 백업)
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, existsSync, copyFileSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const RAW = 'public/assets/raw', S = 'public/assets/sprites', GRID = 200;
const CULTURES = process.env.CULTURE ? process.env.CULTURE.split(',') : ['default', 'korea'];
const MARKER = process.env.MARKER ?? 'A', PAL_N = 32, BASE = 60; // 발 아래 끝 행(0부터). 61~63 행은 마커용
const ALLY_C = [62, 142, 247], ENEMY_C = [224, 74, 74];
const TYPES = ['sword', 'spear', 'cavalry', 'archer', 'mage', 'healer', 'heavy', 'flying'];
const FACING = { // 원본 2행(측면) 칸별 방향(눈으로 판정). R 이면 반전해 L 로 정규화 (pp.mjs DIR_FACING 과 동일)
  default: { sword: 'LRR', spear: 'LLR', cavalry: 'LLR', archer: 'LLR', mage: 'LLR', healer: 'LRR', heavy: 'LLR', flying: 'RRR' },
  korea: { sword: 'LRR', spear: 'LLR', cavalry: 'LLR', archer: 'LLR', mage: 'LLR', healer: 'LRR', heavy: 'LLR' },
};
if (existsSync('docker/gemini/dir64_facing.json')) Object.assign(FACING, JSON.parse(readFileSync('docker/gemini/dir64_facing.json', 'utf8'))); // 문화권별 판독 결과(2행 칸별 L/R)
// 측면 칸의 장비 흔들림 보정: {culture: {type: {legs, ref}}} → left 행 3칸의 상체는 ref 칸을 복제하고 발 기준선 위 legs 행(다리)만 각 칸 것을 사용. 환경변수 HOLD_SIDE(JSON)로 덮어쓰기 가능
const HOLD_SIDE = process.env.HOLD_SIDE ? JSON.parse(process.env.HOLD_SIDE) : { default: { heavy: { legs: 9, ref: 0 } }, korea: { heavy: { legs: 9, ref: 0 } } } /* ref: 상체 기준 칸(0=walk1, 1=idle). 재생성본은 idle 측면에서 방패가 몸 뒤로 가려져 walk1(방패 보임)을 기준으로 함 */;
const px = (w, h) => ({ w, h, d: new Uint8Array(w * h * 4) });
const A = (im, x, y) => im.d[(y * im.w + x) * 4 + 3];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const isMag = (r, g, b) => r > 140 && b > 140 && r - g > 70 && b - g > 70;
const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

// 1) 도트 격자 샘플링 + 하드 크로마키
async function sampleDots(file) {
  const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const W = info.width, step = W / GRID; const im = px(GRID, GRID);
  for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
    const cx = Math.round((i + 0.5) * step), cy = Math.round((j + 0.5) * step); let r = 0, g = 0, b = 0, n = 0;
    for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) { const k = ((cy + dy) * W + cx + dx) * 3; r += data[k]; g += data[k + 1]; b += data[k + 2]; n++; }
    r = Math.round(r / n); g = Math.round(g / n); b = Math.round(b / n); const o = (j * GRID + i) * 4;
    if (isMag(r, g, b)) continue; // 알파 0
    const sp = Math.max(0, Math.min(r, b) - g - 25); im.d[o] = r - sp; im.d[o + 1] = g; im.d[o + 2] = b - sp; im.d[o + 3] = 255;
  }
  const kill = []; // 경계의 마젠타 잔여 도트 제거 1회
  for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) { if (!A(im, x, y)) continue; const o = (y * GRID + x) * 4; const r = im.d[o], g = im.d[o + 1], b = im.d[o + 2];
    if (r - g > 40 && b - g > 40 && N4.some(([dx, dy]) => x + dx < 0 || y + dy < 0 || x + dx >= GRID || y + dy >= GRID || !A(im, x + dx, y + dy))) kill.push(o); }
  for (const o of kill) im.d[o + 3] = 0;
  return im;
}
function crop(im, x0, y0, w, h) { const o = px(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x0 + x, sy = y0 + y; if (sx < im.w && sy < im.h) o.d.set(im.d.subarray((sy * im.w + sx) * 4, (sy * im.w + sx) * 4 + 4), (y * w + x) * 4); } return o; }
function flop(im) { const o = px(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.d.set(im.d.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + (im.w - 1 - x)) * 4); return o; }
function dropEdgeBlobs(im) { // 칸 경계를 넘어온 이웃 칸의 조각 제거(가장 큰 덩어리 외에 가장자리에 닿은 덩어리)
  const { w, h, d } = im; const lab = new Int32Array(w * h); const comps = []; let n = 0;
  for (let i = 0; i < w * h; i++) { if (lab[i] || d[i * 4 + 3] < 128) continue; n++; const st = [i]; lab[i] = n; let size = 0, edge = false;
    while (st.length) { const p = st.pop(); size++; const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !lab[q] && d[q * 4 + 3] >= 128) { lab[q] = n; st.push(q); } }
    comps.push({ size, edge }); }
  if (!comps.length) return im; const big = comps.reduce((b, c, i) => (c.size > comps[b].size ? i : b), 0);
  for (let i = 0; i < w * h; i++) { const l = lab[i]; if (l && l - 1 !== big && comps[l - 1].edge) d.fill(0, i * 4, i * 4 + 4); }
  return im;
}
function bbox(im) { let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
function footCx(im, b) { let sx = 0, n = 0; for (let y = Math.floor(b.y1 - b.h * 0.3); y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (A(im, x, y)) { sx += x + 0.5; n++; } return n ? sx / n : (b.x0 + b.x1 + 1) / 2; }
function place(cell, dx, dy, st) { const o = px(64, 64); for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) { if (!A(cell, x, y)) continue; const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= 64 || ty >= 64) { st.clip++; continue; } o.d.set(cell.d.subarray((y * cell.w + x) * 4, (y * cell.w + x) * 4 + 4), (ty * 64 + tx) * 4); } return o; }

// 2) 팔레트 양자화(메디안 컷, 디더링 없음)
function buildPalette(ims, n) {
  const p = []; for (const im of ims) for (let i = 0; i < im.w * im.h; i++) if (im.d[i * 4 + 3]) p.push([im.d[i * 4], im.d[i * 4 + 1], im.d[i * 4 + 2]]);
  const boxes = [p];
  while (boxes.length < n) { boxes.sort((a, b) => b.length - a.length); const bx = boxes.shift(); if (!bx || bx.length < 2) { if (bx) boxes.push(bx); break; }
    const rng = [0, 1, 2].map((c) => { let lo = 255, hi = 0; for (const q of bx) { if (q[c] < lo) lo = q[c]; if (q[c] > hi) hi = q[c]; } return hi - lo; }); const c = rng.indexOf(Math.max(...rng)); bx.sort((a, b) => a[c] - b[c]); const m = bx.length >> 1; boxes.push(bx.slice(0, m), bx.slice(m)); }
  return boxes.filter((b) => b.length).map((b) => [0, 1, 2].map((c) => Math.round(b.reduce((s, q) => s + q[c], 0) / b.length)));
}
function applyPalette(im, pal) {
  for (let i = 0; i < im.w * im.h; i++) { if (!im.d[i * 4 + 3]) { im.d.fill(0, i * 4, i * 4 + 4); continue; } const r = im.d[i * 4], g = im.d[i * 4 + 1], b = im.d[i * 4 + 2]; let best = 0, bd = 1e9;
    for (let k = 0; k < pal.length; k++) { const dd = (r - pal[k][0]) ** 2 + (g - pal[k][1]) ** 2 + (b - pal[k][2]) ** 2; if (dd < bd) { bd = dd; best = k; } }
    im.d[i * 4] = pal[best][0]; im.d[i * 4 + 1] = pal[best][1]; im.d[i * 4 + 2] = pal[best][2]; im.d[i * 4 + 3] = 255; }
  return im;
}

// 3) 외곽선 1px 통일: 어두운 경계 픽셀은 외곽선색으로, 밝은 경계 픽셀은 바깥에 외곽선 1px 추가
function outline(im, oc) {
  const isT = (x, y) => x < 0 || y < 0 || x >= im.w || y >= im.h || !A(im, x, y); const dark = [], add = [];
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { if (!A(im, x, y) || !N4.some(([dx, dy]) => isT(x + dx, y + dy))) continue; const o = (y * im.w + x) * 4;
    if (lum(im.d[o], im.d[o + 1], im.d[o + 2]) < 75) dark.push(o); else for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < im.w && b < im.h && !A(im, a, b)) add.push((b * im.w + a) * 4); } }
  for (const o of dark) { im.d[o] = oc[0]; im.d[o + 1] = oc[1]; im.d[o + 2] = oc[2]; }
  for (const o of add) { im.d[o] = oc[0]; im.d[o + 1] = oc[1]; im.d[o + 2] = oc[2]; im.d[o + 3] = 255; }
  return im;
}

// 4) 팀: 팔레트 스왑(파랑 계열 슬롯만 빨강 계열) + 발밑 마커
const swapMemo = new Map();
function toEnemy(r0, g0, b0) {
  const key = (r0 << 16) | (g0 << 8) | b0; if (swapMemo.has(key)) return swapMemo.get(key); let r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, s = max ? d / max : 0; let out = [r0, g0, b0];
  if (d && s >= 0.22) { let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
    if (hue >= 185 && hue <= 265) { const nh = ((hue - 225) * 0.5 + 357 + 360) % 360, c = max * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = max - c; [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(nh / 60)]; out = [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; } }
  swapMemo.set(key, out); return out;
}
function swapTeam(im) { const o = px(im.w, im.h); o.d.set(im.d); for (let i = 0; i < im.w * im.h; i++) if (o.d[i * 4 + 3]) { const c = toEnemy(o.d[i * 4], o.d[i * 4 + 1], o.d[i * 4 + 2]); o.d[i * 4] = c[0]; o.d[i * 4 + 1] = c[1]; o.d[i * 4 + 2] = c[2]; } return o; }
function addMarker(im, col, style) { // 61~63 행 타원: A 실선(아래 행 70% 명도) / B 링(가운데 비움)
  const o = px(im.w, im.h); o.d.set(im.d); const hw = [8, 11, 8]; const inMask = (x, y) => { const r = y - 61; return r >= 0 && r < 3 && x >= 32 - hw[r] && x < 32 + hw[r]; };
  for (let y = 61; y <= 63; y++) for (let x = 0; x < 64; x++) { if (!inMask(x, y) || A(o, x, y)) continue; if (style === 'B' && N4.every(([dx, dy]) => inMask(x + dx, y + dy))) continue;
    const k = style === 'A' && y === 63 ? 0.7 : 1; const i = (y * 64 + x) * 4; o.d[i] = Math.round(col[0] * k); o.d[i + 1] = Math.round(col[1] * k); o.d[i + 2] = Math.round(col[2] * k); o.d[i + 3] = 255; }
  return o;
}

const png = (im, file) => sharp(Buffer.from(im.d), { raw: { width: im.w, height: im.h, channels: 4 } }).png({ compressionLevel: 9 }).toFile(file);
const pngBuf = (im, sc = 1) => sharp(Buffer.from(im.d), { raw: { width: im.w, height: im.h, channels: 4 } }).resize(im.w * sc, im.h * sc, { kernel: 'nearest' }).png().toBuffer();
function sheetOf(rows) { const o = px(192, 256); ['down', 'left', 'right', 'up'].forEach((k, r) => rows[k].forEach((f, c) => { for (let y = 0; y < 64; y++) o.d.set(f.d.subarray(y * 256, y * 256 + 256).subarray(0, 256), ((r * 64 + y) * 192 + c * 64) * 4); })); return o; }
function shiftUp(f) { const o = px(64, 64); for (let y = 1; y < 64; y++) o.d.set(f.d.subarray(y * 256, y * 256 + 256), (y - 1) * 256); return o; }

const result = {};
for (const culture of CULTURES) {
  const pre = culture === 'default' ? '' : `${culture}_`; const dir = culture === 'default' ? `${RAW}/dir64` : `${RAW}/dir64_${culture}`; const pals = {}; result[culture] = {};
  for (const t of TYPES) {
    const f = `${dir}/${t}.jpg`; if (!existsSync(f)) continue; const dots = await sampleDots(f); const cells = []; const cuts = [0, 67, 133, 200];
    for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) { let cl = dropEdgeBlobs(crop(dots, cuts[c], cuts[r], cuts[c + 1] - cuts[c], cuts[r + 1] - cuts[r])); if (r === 1 && FACING[culture][t][c] === 'R') cl = flop(cl); cells.push(cl); }
    const pal = buildPalette(cells, PAL_N); pals[t] = pal.map((c) => '#' + c.map((v) => v.toString(16).padStart(2, '0')).join('')); cells.forEach((c) => applyPalette(c, pal));
    const oc = pal.reduce((b, c) => (lum(...c) < lum(...b) ? c : b)); const st = { clip: 0 }; const fr = [];
    for (let r = 0; r < 3; r++) { const idle = cells[r * 3 + 1]; const b = bbox(idle); const cx = footCx(idle, b); let dx = Math.round(32 - cx), dy = BASE - b.y1; // 행 3칸의 합집합이 캔버스 안에 들어오도록 보정(가로 이동, 세로는 마커 행 일부까지 허용)
      const ub = [0, 1, 2].map((c) => bbox(cells[r * 3 + c])); const uMinX = Math.min(...ub.map((q) => q.x0)), uMaxX = Math.max(...ub.map((q) => q.x1)), uMinY = Math.min(...ub.map((q) => q.y0));
      if (uMaxX + dx > 63) dx = 63 - uMaxX; if (uMinX + dx < 0) dx = -uMinX; if (uMinY + dy < 0) dy = Math.min(BASE + 2, -uMinY);
      for (let c = 0; c < 3; c++) fr.push(outline(place(cells[r * 3 + c], dx, dy, st), oc)); }
    const s0 = bbox(fr[1]), s1 = bbox(fr[4]), s2 = bbox(fr[7]);
    console.log(`[v2 ${pre}${t}] 정면 ${s0.w}x${s0.h}, 측면 ${s1.w}x${s1.h}, 후면 ${s2.w}x${s2.h}, 색 ${pal.length}, 잘린 픽셀 ${st.clip}`);
    const hold = HOLD_SIDE[culture]?.[t]; if (hold) { const ref = fr[3 + hold.ref]; const bI = bbox(ref); const ys = bI.y1 - hold.legs + 1; const src = fr.slice(3, 6); for (const k of [0, 1, 2]) { if (k === hold.ref) continue; const o = px(64, 64); o.d.set(ref.d.subarray(0, ys * 256)); o.d.set(src[k].d.subarray(ys * 256), ys * 256); fr[3 + k] = outline(o, oc); } console.log(`[v2 ${pre}${t}] 측면 상체 고정(칸 ${hold.ref} 기준), 다리 ${hold.legs}행만 칸별`); }
    const left = fr.slice(3, 6), up = fr.slice(6, 9); const rowsA = { down: [shiftUp(fr[1]), fr[1], shiftUp(fr[1])], left, right: left.map(flop), up };
    const rowsE = Object.fromEntries(Object.entries(rowsA).map(([k, v]) => [k, v.map(swapTeam)])); result[culture][t] = { ally: rowsA, enemy: rowsE };
    for (const side of ['ally', 'enemy']) {
      const withM = Object.fromEntries(Object.entries(result[culture][t][side]).map(([k, v]) => [k, v.map((fm) => addMarker(fm, side === 'ally' ? ALLY_C : ENEMY_C, MARKER))])); const sh = sheetOf(withM);
      const base = `${S}/64/${pre}${t}_${side}_sheet`, base2 = `${S}/64_x2/${pre}${t}_${side}_sheet`;
      for (const [p, q] of [[`${base}.png`, `${base}_v1.png`], [`${base2}.png`, `${base2}_v1.png`]]) if (existsSync(p) && !existsSync(q)) copyFileSync(p, q);
      await png(sh, `${base}.png`); writeFileSync(`${base2}.png`, await pngBuf(sh, 2));
    }
  }
  writeFileSync(`${S}/palette_64_dir_${culture}_v2.json`, JSON.stringify({ note: `v2: 병종별 ${PAL_N}색(아군 기준), 디더링 없음. 적은 파랑 계열 슬롯만 빨강 계열로 스왑. 외곽선=각 병종 팔레트의 가장 어두운 색. 팀 마커 스타일 ${MARKER}`, types: pals }, null, 1));
}

// 5) 미리보기
const tile = await sharp('public/assets/tiles/64/plain_a.png').png().toBuffer();
async function onTile(f, sc) { return sharp({ create: { width: 64 * sc, height: 64 * sc, channels: 4, background: '#000' } }).composite([{ input: await sharp(tile).resize(64 * sc, 64 * sc, { kernel: 'nearest' }).png().toBuffer() }, { input: await pngBuf(f, sc) }]).png().toBuffer(); }
if (result.default) { // 마커 2안(x4)
  const comps = []; let n = 0;
  for (const style of ['A', 'B']) for (const t of ['sword', 'mage', 'cavalry', 'healer']) for (const side of ['ally', 'enemy']) { comps.push({ input: await onTile(addMarker(result.default[t][side].down[1], side === 'ally' ? ALLY_C : ENEMY_C, style), 4), left: (n % 8) * 256, top: Math.floor(n / 8) * 256 }); n++; }
  await sharp({ create: { width: 2048, height: 512, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${S}/preview_pixel_marker_ab.png`);
}
for (const [culture, sc] of [['default', 2], ['korea', 3]]) { // 정수 배율 미리보기(최근접) x2 / x3, 열: 아군 4방향 | 적 4방향
  if (!result[culture]) continue; const comps = []; let r = 0;
  for (const t of TYPES) { if (!result[culture][t]) continue; let c = 0; for (const side of ['ally', 'enemy']) for (const k of ['down', 'left', 'right', 'up']) { comps.push({ input: await onTile(addMarker(result[culture][t][side][k][1], side === 'ally' ? ALLY_C : ENEMY_C, MARKER), sc), left: c * 64 * sc, top: r * 64 * sc }); c++; } r++; }
  await sharp({ create: { width: 8 * 64 * sc, height: r * 64 * sc, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${S}/preview_pixel_v2_${culture}_x${sc}.png`);
}
{ // v1 vs v2 (아군 정면·좌측 idle, x3): 열 = v1 down, v1 left, v2 down, v2 left
  const sel = [['', 'sword'], ['', 'mage'], ['', 'heavy'], ['', 'cavalry'], ['korea_', 'sword'], ['korea_', 'mage']]; const comps = []; let r = 0;
  const bgc = await sharp(tile).resize(192, 192, { kernel: 'nearest' }).png().toBuffer();
  for (const [pre, t] of sel) { const v1 = `${S}/64/${pre}${t}_ally_sheet_v1.png`, v2 = `${S}/64/${pre}${t}_ally_sheet.png`; if (!existsSync(v1)) continue; let c = 0;
    for (const f of [v1, v2]) for (const row of [0, 1]) { const one = await sharp(f).extract({ left: 64, top: row * 64, width: 64, height: 64 }).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(); comps.push({ input: bgc, left: c * 192, top: r * 192 }, { input: one, left: c * 192, top: r * 192 }); c++; } r++; }
  if (r) await sharp({ create: { width: 768, height: r * 192, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${S}/preview_pixel_v1_vs_v2.png`);
}
console.log('v2 완료', CULTURES.join(','), 'marker', MARKER);
