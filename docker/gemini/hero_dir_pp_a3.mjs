// [A3 복사본] hero_dir_pp.mjs 와 동일 + 영웅별 적 팀색 예외(FACE[code].enemy_swap=false → 의복 원색 유지·발밑 빨강 받침만 / enemy_hue=[lo,hi] → 스왑할 색상 범위 축소). 공유 원본 동시 수정 충돌 방지용 복사본(안아트 A3).
// 영웅 전용 방향 시트 후처리 = 픽셀 파이프라인 v2(pp_v2.mjs)의 영웅용 파라미터화 버전.
// pp_v2 와 동일 규칙: 도트 중심 직접 샘플(보간 없음, 1도트=1px), 알파 0/255 하드, 영웅별 32색 메디안컷(디더링 없음), 어두운 1px 외곽선, 팀색 링 없음,
//   적은 파랑 계열 슬롯만 빨강 계열 팔레트 스왑, 발밑 팀색 받침 마커 A안(61~63행), 정면 행 = idle + 1px 위로 띄운 bob(pp_v2 와 동일), 우측 = 좌측 미러.
// 차이: (1) 격자를 고정 200 이 아니라 raw 마다 hero_dir_grid.mjs 로 판정(주기·위상) — 영웅 정면 raw 는 100격자(20.48px), 방향 시트 raw 는 200격자(10.24px)
//       (2) 칸 → 프레임 매핑을 영웅별로 지정(hero_dir_facing.json: 행마다 [원본칸, 'f'=좌우반전] 3개). 모델이 측면 행에 오른쪽·3/4 각도 칸을 섞어 그리는 경우 대응
//       (3) 영웅별 팔레트·외곽선색, 미리보기/QA 이미지는 docker/gemini/hero_dir_preview/ 로 출력(공용 preview 파일 건드리지 않음)
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_dir_pp.mjs code1,code2   → public/assets/sprites/64/hero_<code>_{ally,enemy}_sheet.png (+64_x2)
import { createRequire } from 'node:module';
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { detectGrid } from './hero_dir_grid.mjs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
// 경로는 환경변수로 덮어쓸 수 있음(파일럿: HERO_RAWD=docker/gemini/hero_pilot_raw HERO_OUT=public/assets/sprites/heroes_pilot HERO_PV=docker/gemini/hero_pilot_preview). 기본값은 기존과 동일
const RAWD = process.env.HERO_RAWD ?? 'docker/gemini/hero_dir_raw', S = process.env.HERO_OUT ?? 'public/assets/sprites', PV = process.env.HERO_PV ?? 'docker/gemini/hero_dir_preview';
const PAL_N = 32, BASE = 60, ALLY_C = [62, 142, 247], ENEMY_C = [224, 74, 74];
const FACE_F = process.env.HERO_FACE ?? 'docker/gemini/hero_dir_facing.json'; // v3: HERO_FACE=docker/gemini/hero_v3_facing.json
const FACE = existsSync(FACE_F) ? JSON.parse(readFileSync(FACE_F, 'utf8')).heroes : {};
const DEF_MAP = { down: [[1], [1], [1]], left: [[3], [4], [5]], up: [[6], [7], [8]] };
const px = (w, h) => ({ w, h, d: new Uint8Array(w * h * 4) });
const A = (im, x, y) => im.d[(y * im.w + x) * 4 + 3];
const lum = (r, g, b) => 0.299 * r + 0.587 * g + 0.114 * b;
const isMag = (r, g, b) => r > 140 && b > 140 && r - g > 70 && b - g > 70;
const N4 = [[-1, 0], [1, 0], [0, -1], [0, 1]];

async function sampleDots(file) {
  const g = await detectGrid(file); const { data, info } = await sharp(file).removeAlpha().raw().toBuffer({ resolveWithObject: true }); const W = info.width, H = info.height;
  const step = g.step, GW = Math.round(W / step), GH = Math.round(H / step), rad = Math.max(1, Math.floor(step * 0.3)); const im = px(GW, GH);
  for (let j = 0; j < GH; j++) for (let i = 0; i < GW; i++) {
    const cx = Math.min(W - 1 - rad, Math.max(rad, Math.round(g.phase + (i + 0.5) * step))), cy = Math.min(H - 1 - rad, Math.max(rad, Math.round(g.phase + (j + 0.5) * step))); let r = 0, gg = 0, b = 0, n = 0;
    for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const k = ((cy + dy) * W + cx + dx) * 3; r += data[k]; gg += data[k + 1]; b += data[k + 2]; n++; }
    r = Math.round(r / n); gg = Math.round(gg / n); b = Math.round(b / n); const o = (j * GW + i) * 4;
    if (isMag(r, gg, b)) continue;
    const sp = Math.max(0, Math.min(r, b) - gg - 25); im.d[o] = r - sp; im.d[o + 1] = gg; im.d[o + 2] = b - sp; im.d[o + 3] = 255;
  }
  const kill = [];
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) { if (!A(im, x, y)) continue; const o = (y * GW + x) * 4; const r = im.d[o], gg = im.d[o + 1], b = im.d[o + 2];
    if (r - gg > 40 && b - gg > 40 && N4.some(([dx, dy]) => x + dx < 0 || y + dy < 0 || x + dx >= GW || y + dy >= GH || !A(im, x + dx, y + dy))) kill.push(o); }
  for (const o of kill) im.d[o + 3] = 0;
  return { im, grid: g };
}
function crop(im, x0, y0, w, h) { const o = px(w, h); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const sx = x0 + x, sy = y0 + y; if (sx < im.w && sy < im.h) o.d.set(im.d.subarray((sy * im.w + sx) * 4, (sy * im.w + sx) * 4 + 4), (y * w + x) * 4); } return o; }
function flop(im) { const o = px(im.w, im.h); for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) o.d.set(im.d.subarray((y * im.w + x) * 4, (y * im.w + x) * 4 + 4), (y * im.w + (im.w - 1 - x)) * 4); return o; }
function dropEdgeBlobs(im) {
  const { w, h, d } = im; const lab = new Int32Array(w * h); const comps = []; let n = 0;
  for (let i = 0; i < w * h; i++) { if (lab[i] || d[i * 4 + 3] < 128) continue; n++; const st = [i]; lab[i] = n; let size = 0, edge = false;
    while (st.length) { const p = st.pop(); size++; const x = p % w, y = (p / w) | 0; if (x === 0 || y === 0 || x === w - 1 || y === h - 1) edge = true;
      for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !lab[q] && d[q * 4 + 3] >= 128) { lab[q] = n; st.push(q); } }
    comps.push({ size, edge }); }
  if (!comps.length) return im; const big = comps.reduce((b, c, i) => (c.size > comps[b].size ? i : b), 0);
  for (let i = 0; i < w * h; i++) { const l = lab[i]; if (l && l - 1 !== big && (comps[l - 1].edge || comps[l - 1].size < 4)) d.fill(0, i * 4, i * 4 + 4); }
  return im;
}
function stripFloating(im, frac) { // 몸통(최대 덩어리)과 떨어진 작은 덩어리(최대의 frac 미만) 제거 — 모델이 칸 사이에 떠 있게 그린 소품 잔상 대응(영웅별 옵션)
  const { w, h, d } = im; const lab = new Int32Array(w * h); const sizes = []; let n = 0;
  for (let i = 0; i < w * h; i++) { if (lab[i] || d[i * 4 + 3] < 128) continue; n++; const st = [i]; lab[i] = n; let size = 0;
    while (st.length) { const p = st.pop(); size++; const x = p % w, y = (p / w) | 0; for (const q of [x > 0 ? p - 1 : -1, x < w - 1 ? p + 1 : -1, y > 0 ? p - w : -1, y < h - 1 ? p + w : -1]) if (q >= 0 && !lab[q] && d[q * 4 + 3] >= 128) { lab[q] = n; st.push(q); } }
    sizes.push(size); }
  if (!sizes.length) return im; const mx = Math.max(...sizes);
  for (let i = 0; i < w * h; i++) { const l = lab[i]; if (l && sizes[l - 1] < mx * frac) d.fill(0, i * 4, i * 4 + 4); }
  return im;
}
function buildPaletteUnique(ims, n) { // 영웅별 옵션(pal_mode=unique): 4비트 반올림 고유색 단위로 메디안컷 → 면적이 작은 소품색(양피지 등)이 큰 면적색(검은 수도복·피부)에 흡수되지 않게
  const seen = new Map(); for (const im of ims) for (let i = 0; i < im.w * im.h; i++) if (im.d[i * 4 + 3]) { const k = ((im.d[i * 4] >> 3) << 10) | ((im.d[i * 4 + 1] >> 3) << 5) | (im.d[i * 4 + 2] >> 3); const e = seen.get(k); if (e) { e[0] += im.d[i * 4]; e[1] += im.d[i * 4 + 1]; e[2] += im.d[i * 4 + 2]; e[3]++; } else seen.set(k, [im.d[i * 4], im.d[i * 4 + 1], im.d[i * 4 + 2], 1]); }
  const one = { w: seen.size, h: 1, d: new Uint8Array(seen.size * 4) }; let j = 0; for (const e of seen.values()) { one.d.set([Math.round(e[0] / e[3]), Math.round(e[1] / e[3]), Math.round(e[2] / e[3]), 255], j * 4); j++; }
  return buildPalette([one], n);
}
function bbox(im) { let x0 = im.w, y0 = im.h, x1 = -1, y1 = -1; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (A(im, x, y)) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
function footCx(im, b) { let sx = 0, n = 0; for (let y = Math.floor(b.y1 - b.h * 0.3); y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) if (A(im, x, y)) { sx += x + 0.5; n++; } return n ? sx / n : (b.x0 + b.x1 + 1) / 2; }
function place(cell, dx, dy, st) { const o = px(64, 64); for (let y = 0; y < cell.h; y++) for (let x = 0; x < cell.w; x++) { if (!A(cell, x, y)) continue; const tx = x + dx, ty = y + dy; if (tx < 0 || ty < 0 || tx >= 64 || ty >= 64) { st.clip++; continue; } o.d.set(cell.d.subarray((y * cell.w + x) * 4, (y * cell.w + x) * 4 + 4), (ty * 64 + tx) * 4); } return o; }
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
function outline(im, oc) {
  const isT = (x, y) => x < 0 || y < 0 || x >= im.w || y >= im.h || !A(im, x, y); const dark = [], add = [];
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { if (!A(im, x, y) || !N4.some(([dx, dy]) => isT(x + dx, y + dy))) continue; const o = (y * im.w + x) * 4;
    if (lum(im.d[o], im.d[o + 1], im.d[o + 2]) < 75) dark.push(o); else for (const [dx, dy] of N4) { const a = x + dx, b = y + dy; if (a >= 0 && b >= 0 && a < im.w && b < im.h && !A(im, a, b)) add.push((b * im.w + a) * 4); } }
  for (const o of dark) { im.d[o] = oc[0]; im.d[o + 1] = oc[1]; im.d[o + 2] = oc[2]; }
  for (const o of add) { im.d[o] = oc[0]; im.d[o + 1] = oc[1]; im.d[o + 2] = oc[2]; im.d[o + 3] = 255; }
  return im;
}
const swapMemo = new Map();
let HUE_LO = 185, HUE_HI = 265;
function toEnemy(r0, g0, b0) {
  const key = (r0 << 16) | (g0 << 8) | b0; if (swapMemo.has(key)) return swapMemo.get(key); let r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, s = max ? d / max : 0; let out = [r0, g0, b0];
  if (d && s >= 0.22) { let hue = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360;
    if (hue >= HUE_LO && hue <= HUE_HI) { const nh = ((hue - 225) * 0.5 + 357 + 360) % 360, c = max * s, x = c * (1 - Math.abs(((nh / 60) % 2) - 1)), m = max - c; [r, g, b] = [[c, x, 0], [x, c, 0], [0, c, x], [0, x, c], [x, 0, c], [c, 0, x]][Math.floor(nh / 60)]; out = [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]; } }
  swapMemo.set(key, out); return out;
}
function swapTeam(im) { const o = px(im.w, im.h); o.d.set(im.d); for (let i = 0; i < im.w * im.h; i++) if (o.d[i * 4 + 3]) { const c = toEnemy(o.d[i * 4], o.d[i * 4 + 1], o.d[i * 4 + 2]); o.d[i * 4] = c[0]; o.d[i * 4 + 1] = c[1]; o.d[i * 4 + 2] = c[2]; } return o; }
function addMarker(im, col) { // A안: 61~63 행 실선 타원, 아래 행 70% 명도 (pp_v2 MARKER=A 와 동일)
  const o = px(im.w, im.h); o.d.set(im.d); const hw = [8, 11, 8];
  for (let y = 61; y <= 63; y++) for (let x = 0; x < 64; x++) { const r = y - 61; if (!(x >= 32 - hw[r] && x < 32 + hw[r]) || A(o, x, y)) continue;
    const k = y === 63 ? 0.7 : 1; const i = (y * 64 + x) * 4; o.d[i] = Math.round(col[0] * k); o.d[i + 1] = Math.round(col[1] * k); o.d[i + 2] = Math.round(col[2] * k); o.d[i + 3] = 255; }
  return o;
}
const pngBuf = (im, sc = 1) => sharp(Buffer.from(im.d), { raw: { width: im.w, height: im.h, channels: 4 } }).resize(im.w * sc, im.h * sc, { kernel: 'nearest' }).png({ compressionLevel: 9 }).toBuffer();
function sheetOf(rows) { const o = px(192, 256); ['down', 'left', 'right', 'up'].forEach((k, r) => rows[k].forEach((f, c) => { for (let y = 0; y < 64; y++) o.d.set(f.d.subarray(y * 256, y * 256 + 256), ((r * 64 + y) * 192 + c * 64) * 4); })); return o; }
function shiftUp(f) { const o = px(64, 64); for (let y = 1; y < 64; y++) o.d.set(f.d.subarray(y * 256, y * 256 + 256), (y - 1) * 256); return o; }

const codes = (process.argv[2] ?? '').split(',').filter(Boolean); mkdirSync(PV, { recursive: true }); const report = {};
const tile = await sharp('public/assets/tiles/64/plain_a.png').png().toBuffer();
async function onTile(f, sc) { return sharp({ create: { width: 64 * sc, height: 64 * sc, channels: 4, background: '#000' } }).composite([{ input: await sharp(tile).resize(64 * sc, 64 * sc, { kernel: 'nearest' }).png().toBuffer() }, { input: await pngBuf(f, sc) }]).png().toBuffer(); }
for (const code of codes) {
  const f = `${RAWD}/${code}.jpg`; if (!existsSync(f)) { console.log(`[${code}] raw 없음`); continue; }
  // 칸 지정: [칸, 'f'|'' , 원본 접미사(예 'try1' → <code>_try1.jpg, 생략 시 최신 <code>.jpg)] — 재시도본과 이전본의 행을 섞을 때 사용(두 raw 모두 같은 격자일 때만)
  const cache = {}; let grid = null;
  const cellsOf = async (sfx) => { if (cache[sfx]) return cache[sfx]; const file = sfx ? `${RAWD}/${code}_${sfx}.jpg` : f; const r = await sampleDots(file); if (!sfx) grid = r.grid; else if (Math.abs(r.grid.step - (grid?.step ?? r.grid.step)) > 0.05) console.log(`[${code}] 경고: ${sfx} 격자 다름 ${r.grid.step}`);
    const dots = r.im, G = dots.w, GH = dots.h, cuts = [0, Math.round(G / 3), Math.round((2 * G) / 3), G], cutsY = [0, Math.round(GH / 3), Math.round((2 * GH) / 3), GH]; const cs = []; // 세로는 실제 높이 기준(정사각 raw 는 기존과 동일, 파일럿 16:9 반쪽 raw 대응)
    for (let rr = 0; rr < 3; rr++) for (let c = 0; c < 3; c++) { let cl = dropEdgeBlobs(crop(dots, cuts[c], cutsY[rr], cuts[c + 1] - cuts[c], cutsY[rr + 1] - cutsY[rr])); if (FACE[code]?.strip_floating) cl = stripFloating(cl, 0.1); cs.push(cl); }
    return (cache[sfx] = { cs, G }); };
  const { G } = await cellsOf('');
  const map = { ...DEF_MAP, ...(FACE[code]?.map ?? {}) };
  for (const row of Object.values(map)) for (const s of row) await cellsOf(s[2] ?? '');
  const pick = (spec) => { const [i, fl, sfx] = spec; const cl = cache[sfx ?? ''].cs[i]; return fl === 'f' ? flop(cl) : cl; };
  const ROWS = map.right ? ['down', 'left', 'right', 'up'] : ['down', 'left', 'up']; // map.right 가 있으면 우측 행을 미러 대신 별도 프레임으로 굽는다(asym 영웅)
  const src = Object.fromEntries(ROWS.map((k) => [k, map[k].map(pick)]));
  const all = ROWS.flatMap((k) => src[k]); const pal0 = FACE[code]?.pal_mode === "unique" ? buildPaletteUnique(all, PAL_N) : buildPalette(all, PAL_N);
  const oc = pal0.reduce((b, c) => (lum(...c) < lum(...b) ? c : b));
  // lift(감마 g<1): 외곽선색을 제외한 팔레트 슬롯 명도 상향(영웅별 옵션, 호출 없이 톤 보정). 색상·채도 비율은 유지
  const g = FACE[code]?.lift; const pal = g ? pal0.map((c) => (c === oc ? c : c.map((v) => Math.round(255 * (v / 255) ** g)))) : pal0;
  all.forEach((c) => applyPalette(c, pal0)); // 원 팔레트로 양자화한 뒤 슬롯 단위로 치환(상향 팔레트로 바로 최근접 매핑하면 상향이 상쇄됨)
  if (g) { const m = new Map(pal0.map((c, i) => [c.join(','), pal[i]])); for (const c of new Set(all)) for (let i = 0; i < c.w * c.h; i++) if (c.d[i * 4 + 3]) { const t = m.get(`${c.d[i * 4]},${c.d[i * 4 + 1]},${c.d[i * 4 + 2]}`); if (t) c.d.set(t, i * 4); } }
  const st = { clip: 0 }; const fr = {};
  const meanLum = (p) => Math.round(p.filter((c) => c !== oc).reduce((s, c) => s + lum(...c), 0) / (p.length - 1));
  for (const k of ROWS) { const row = src[k]; const idle = row[1]; const b = bbox(idle); const cx = footCx(idle, b); let dx = Math.round(32 - cx), dy = BASE - b.y1;
    const ub = row.map(bbox); const uMinX = Math.min(...ub.map((q) => q.x0)), uMaxX = Math.max(...ub.map((q) => q.x1)), uMinY = Math.min(...ub.map((q) => q.y0));
    if (uMaxX + dx > 63) dx = 63 - uMaxX; if (uMinX + dx < 0) dx = -uMinX; if (uMinY + dy < 0) dy = Math.min(BASE + 2, -uMinY);
    fr[k] = row.map((c) => outline(place(c, dx, dy, st), oc)); }
  const ally = { down: [shiftUp(fr.down[1]), fr.down[1], shiftUp(fr.down[1])], left: fr.left, right: fr.right ?? fr.left.map(flop), up: fr.up };
  if (FACE[code]?.down_walk) ally.down = fr.down; // 정면 걷기 프레임을 원본 그대로 쓰는 예외
  swapMemo.clear(); [HUE_LO, HUE_HI] = FACE[code]?.enemy_hue ?? [185, 265];
  const enemy = Object.fromEntries(Object.entries(ally).map(([k, v]) => [k, FACE[code]?.enemy_swap === false ? v : v.map(swapTeam)]));
  const sz = Object.fromEntries(['down', 'left', 'up'].map((k) => { const b = bbox(fr[k][1]); return [k, `${b.w}x${b.h}`]; }));
  report[code] = { grid: { step_px: grid.step, dots: G, ratio: grid.ratio }, colors: pal.length, clipped_px: st.clip, idle_size: sz, outline: '#' + oc.map((v) => v.toString(16).padStart(2, '0')).join(''), right: fr.right ? 'separate' : 'mirror', ...(g ? { lift_gamma: g, palette_mean_luma: `${meanLum(pal0)}→${meanLum(pal)}` } : {}) };
  // 단일 정면 폴백 export(영웅별 옵션 export_single): 시트 down idle 프레임(마커 포함)을 hero_<code>_<side>.png 로. 이미 있으면 건드리지 않음
  if (FACE[code]?.export_single) for (const [side, rows] of [['ally', ally], ['enemy', enemy]]) { const fm = addMarker(rows.down[1], side === 'ally' ? ALLY_C : ENEMY_C);
    for (const [p, sc] of [[`${S}/64/hero_${code}_${side}.png`, 1], [`${S}/64_x2/hero_${code}_${side}.png`, 2]]) { if (existsSync(p)) { console.log(`[${code}] ${p} 이미 있음 — 유지`); continue; } writeFileSync(p, await pngBuf(fm, sc)); console.log(`[${code}] 단일 정면 export ${p}`); } }
  const out = {};
  for (const [side, rows] of [['ally', ally], ['enemy', enemy]]) {
    const withM = Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, v.map((fm) => addMarker(fm, side === 'ally' ? ALLY_C : ENEMY_C))])); const sh = sheetOf(withM); out[side] = withM;
    writeFileSync(`${S}/64/hero_${code}_${side}_sheet.png`, await pngBuf(sh, 1)); writeFileSync(`${S}/64_x2/hero_${code}_${side}_sheet.png`, await pngBuf(sh, 2));
  }
  // QA 미리보기(x3, 풀밭 타일 위): 1행 = [기존 정면 ally] [새 down idle] [left idle] [right idle] [up idle] [적 down] [적 left] [적 up]
  //                               2행 = 아군 12프레임 중 down/left/up 각 3프레임 순서(순환 확인) + x1 축소 4방향
  const comps = []; const sc = 3; let c = 0;
  const old = `${S}/64/hero_${code}_ally.png`;
  if (existsSync(old)) { const ob = await sharp(old).resize(64 * sc, 64 * sc, { kernel: 'nearest' }).png().toBuffer(); comps.push({ input: await sharp(tile).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(), left: 0, top: 0 }, { input: ob, left: 0, top: 0 }); }
  c = 1; for (const [s2, k] of [['ally', 'down'], ['ally', 'left'], ['ally', 'right'], ['ally', 'up'], ['enemy', 'down'], ['enemy', 'left'], ['enemy', 'up']]) { comps.push({ input: await onTile(out[s2][k][1], sc), left: c * 192, top: 0 }); c++; }
  c = 0; for (const k of ['down', 'left', 'up']) for (let i = 0; i < 3; i++) { comps.push({ input: await onTile(out.ally[k][i], sc), left: c * 192, top: 192 }); c++; }
  const small = []; ['down', 'left', 'right', 'up'].forEach((k, i) => small.push({ k, i }));
  for (const { k, i } of small) comps.push({ input: await onTile(out[i % 2 ? 'enemy' : 'ally'][k][1], 1), left: 9 * 192 + 10 + i * 70, top: 192 + 60 });
  await sharp({ create: { width: 9 * 192 + 300, height: 384, channels: 4, background: '#202020' } }).composite(comps).png().toFile(`${PV}/${code}_qa.png`);
  console.log(`[${code}]`, JSON.stringify(report[code]));
}
const RP = `${PV}/pp_report.json`; const prev = existsSync(RP) ? JSON.parse(readFileSync(RP, 'utf8')) : {}; writeFileSync(RP, JSON.stringify({ ...prev, ...report }, null, 1));
