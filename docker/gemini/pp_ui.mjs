// UI 스킨 시험 후처리: <OUT>/raw/*.jpg → 마젠타 키 → 좌우 대칭 → 9/3-slice 압축(중앙 균일 구간 재표본) → 상태 파생 → 아틀라스(@3x, @1.5x) → QA 패널 → manifest 조각.
// 실행(컨테이너): docker run --rm -v "<프로젝트>":/app -w /app node:22 sh -c \
//   "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp_ui.mjs public/assets/ui_trial"
// 의존: sharp 0.33.5(Apache-2.0, libvips LGPL-3.0). API 호출 없음. 규칙 단일 출처: style_guide.mjs(UISKIN_*), 문서: ui_design_system.md
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { UISKIN_PAL } from './style_guide.mjs';

const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const OUT = process.argv[2] ?? 'public/assets/ui_trial';
const RAW = `${OUT}/raw`;
const M = 3; // 마스터 배율: 1 unit = 3px (기존 skin.js S=3 와 동일)
const ensure = (d) => mkdirSync(d, { recursive: true });
['pieces', 'atlas', 'preview'].forEach((d) => ensure(`${OUT}/${d}`));

// ---------- 기본 버퍼 연산 ----------
const img = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) });
const toSharp = (im) => sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } });
async function fromSharp(s) { const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
const load = (f) => fromSharp(sharp(f));
const png = (im) => toSharp(im).png({ compressionLevel: 9 }).toBuffer();
async function resize(im, w, h) { return fromSharp(toSharp(im).resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { kernel: 'lanczos3', fit: 'fill' })); }
function crop(im, x, y, w, h) { const o = img(w, h); for (let j = 0; j < h; j++) im.data.copy(o.data, j * w * 4, ((y + j) * im.w + x) * 4, ((y + j) * im.w + x + w) * 4); return o; }
function hcat(parts) { const h = parts[0].h, w = parts.reduce((a, p) => a + p.w, 0), o = img(w, h); let x0 = 0; for (const p of parts) { for (let j = 0; j < h; j++) p.data.copy(o.data, (j * w + x0) * 4, j * p.w * 4, (j + 1) * p.w * 4); x0 += p.w; } return o; }
function vcat(parts) { const w = parts[0].w; return { w, h: parts.reduce((a, p) => a + p.h, 0), data: Buffer.concat(parts.map((p) => p.data)) }; }

// pp.mjs / pp_equip.mjs keyMagenta 와 동일(엄격 마스크 + 번짐 확장 + despill)
function keyMagenta(im, grow = 3) {
  const { data, w, h } = im, N = w * h; const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < grow; it++) { const add = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if ((x > 0 && strict[i - 1]) || (x < w - 1 && strict[i + 1]) || (y > 0 && strict[i - w]) || (y < h - 1 && strict[i + w])) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) {
    if (strict[i]) { data.fill(0, i * 4, i * 4 + 4); continue; }
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const spill = Math.max(0, Math.min(r, b) - g - 25);
    if (spill > 0) { data[i * 4] = r - spill; data[i * 4 + 2] = b - spill; }
  }
  return im;
}
// 가장자리 1px 알파 침식(키잉 경계의 반쯤 섞인 분홍 화소 제거)
function erode(im) { const { w, h, data } = im; const kill = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!data[i * 4 + 3]) continue; if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[(i - 1) * 4 + 3] || !data[(i + 1) * 4 + 3] || !data[(i - w) * 4 + 3] || !data[(i + w) * 4 + 3]) kill.push(i); } for (const i of kill) data[i * 4 + 3] = 0; return im; }
function bbox(im, thr = 64, x0 = 0, x1 = im.w) { let a = im.w, b = im.h, c = -1, d = -1; for (let y = 0; y < im.h; y++) for (let x = x0; x < x1; x++) if (im.data[(y * im.w + x) * 4 + 3] >= thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return { x: a, y: b, w: c - a + 1, h: d - b + 1 }; }
const cropBox = (im, bb) => crop(im, bb.x, bb.y, bb.w, bb.h);
// 왼쪽 절반을 오른쪽에 거울 복사(좌우 대칭 보장)
function mirrorH(im) { const { w, h, data } = im; for (let y = 0; y < h; y++) for (let x = 0; x < (w >> 1); x++) data.copy(data, (y * w + (w - 1 - x)) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4); return im; }
// 열 x 가 기준 열과 얼마나 다른가(평균 RGBA 차)
function colDiff(im, x, ref) { let s = 0; for (let y = 0; y < im.h; y++) { const i = (y * im.w + x) * 4, j = (y * im.w + ref) * 4; for (let k = 0; k < 4; k++) s += Math.abs(im.data[i + k] - im.data[j + k]); } return s / (im.h * 4); }
function rowDiff(im, y, ref) { let s = 0; for (let x = 0; x < im.w; x++) { const i = (y * im.w + x) * 4, j = (ref * im.w + x) * 4; for (let k = 0; k < 4; k++) s += Math.abs(im.data[i + k] - im.data[j + k]); } return s / (im.w * 4); }
// 기준 열에서 바깥으로 가며 처음 차이가 thr 을 넘는 열 = 모서리 조각 경계
// 중앙에서 바깥으로 가며 국소 변화(3px 떨어진 열과 차이 > 24 인 화소 비율 > 0.8%)가 처음 나타나는 열 = 모서리 조각 경계. 부드러운 광택 그라데이션은 무시, 가는 금 문양은 잡는다
function colEdge(im, x) { let n = 0; for (let y = 0; y < im.h; y++) { const i = (y * im.w + x) * 4, j = (y * im.w + x + 3) * 4; let m = 0; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(im.data[i + k] - im.data[j + k])); if (m > 24) n++; } return n / im.h; }
function rowEdge(im, y) { let n = 0; for (let x = 0; x < im.w; x++) { const i = (y * im.w + x) * 4, j = ((y + 3) * im.w + x) * 4; let m = 0; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(im.data[i + k] - im.data[j + k])); if (m > 24) n++; } return n / im.w; }
function insetX(im, ref) { let x = ref; while (x > 0 && colEdge(im, x - 1) < 0.008) x--; return x + 3; }
function insetY(im, ref) { let y = ref; while (y > 0 && rowEdge(im, y - 1) < 0.008) y--; return y + 3; }
// 중앙 균일 구간을 C px 로 재표본해 압축(가로)
async function compactX(im, L, C = 12) { const mid = crop(im, L, 0, im.w - 2 * L, im.h); return hcat([crop(im, 0, 0, L, im.h), await resize(mid, C, im.h), crop(im, im.w - L, 0, L, im.h)]); }
async function compactY(im, T, C = 12) { const mid = crop(im, 0, T, im.w, im.h - 2 * T); return vcat([crop(im, 0, 0, im.w, T), await resize(mid, im.w, C), crop(im, 0, im.h - T, im.w, T)]); }

// ---------- 색 연산(상태 파생) ----------
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
function mapRGB(im, f) { const o = { ...im, data: Buffer.from(im.data) }; for (let i = 0; i < im.w * im.h; i++) { if (!o.data[i * 4 + 3]) continue; const [r, g, b] = f(o.data[i * 4], o.data[i * 4 + 1], o.data[i * 4 + 2]); o.data[i * 4] = clamp(r); o.data[i * 4 + 1] = clamp(g); o.data[i * 4 + 2] = clamp(b); } return o; }
const hover = (im) => mapRGB(im, (r, g, b) => [r * 1.12 + 8, g * 1.12 + 8, b * 1.1 + 6]);
const pressed = (im) => mapRGB(im, (r, g, b) => [r * 0.78, g * 0.78, b * 0.8]);
const disabled = (im) => mapRGB(im, (r, g, b) => { const l = 0.3 * r + 0.59 * g + 0.11 * b; return [l * 0.42 + 14, l * 0.44 + 16, l * 0.48 + 26]; });
const hx = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
// 남색 면(파랑 우세 화소)을 진홍 램프로 치환, 금 테두리는 유지 → danger 변형
function navyToCrimson(im) {
  const lo = hx('#3A0E0C'), hi = hx(UISKIN_PAL.crimsonLight);
  return mapRGB(im, (r, g, b) => { if (!(b > r + 8 && b >= g)) return [r, g, b]; const l = Math.min(1, (0.3 * r + 0.59 * g + 0.11 * b) / 110); return lo.map((v, k) => v + (hi[k] - v) * l); });
}
async function glow(im, pad, color = UISKIN_PAL.goldLight) {
  const [r, g, b] = hx(color); const o = img(im.w + pad * 2, im.h + pad * 2);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const a = im.data[(y * im.w + x) * 4 + 3]; const j = ((y + pad) * o.w + x + pad) * 4; o.data[j] = r; o.data[j + 1] = g; o.data[j + 2] = b; o.data[j + 3] = a; }
  for (let i = 0; i < o.w * o.h; i++) if (!o.data[i * 4 + 3]) { o.data[i * 4] = r; o.data[i * 4 + 1] = g; o.data[i * 4 + 2] = b; }
  const bl = await fromSharp(toSharp(o).blur(pad / 2.5));
  for (let i = 0; i < bl.w * bl.h; i++) bl.data[i * 4 + 3] = clamp(bl.data[i * 4 + 3] * 0.75);
  return bl;
}

// ---------- QA 지표 ----------
function metrics(im) {
  let opaque = 0, magenta = 0, purple = 0, pinkEdge = 0; const { w, h, data } = im;
  for (let i = 0; i < w * h; i++) { const a = data[i * 4 + 3]; if (!a) continue; const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (a < 255 && r - g > 40 && b - g > 40) pinkEdge++;
    if (a < 128) continue; opaque++; if (r - g > 60 && b - g > 60) magenta++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d > 40 && mx > 60) { let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; if (hue >= 255 && hue <= 330) purple++; } }
  return { opaque, magenta_px: magenta, pink_edge_px: pinkEdge, purple_ratio: +(purple / Math.max(1, opaque)).toFixed(4) };
}

// ---------- 조각 처리 ----------
const frames = {}; // name -> {im, slice:{l,r,t,b}, unit:{w,h}}
const qa = {};
async function prepRaw(id) { const im = keyMagenta(await load(`${RAW}/${id}.jpg`)); erode(im); return im; }

// 버튼: 3-slice(가로만 늘림). 높이 56unit 마스터(=168px)
async function button(id, variants) {
  const raw = await prepRaw(id); let im = cropBox(raw, bbox(raw)); mirrorH(im);
  const H = 56 * M; im = await resize(im, im.w * H / im.h, H);
  const ref = im.w >> 1; const L = Math.min(insetX(im, ref, 6) + 2, (im.w >> 1) - 8);
  im = await compactX(im, L);
  for (const [v, base] of Object.entries(variants)) {
    const b = base(im);
    const st = { normal: b, hover: hover(b), pressed: pressed(b), disabled: disabled(b) };
    for (const [s, x] of Object.entries(st)) frames[`btn.${v}.${s}`] = { im: x, slice: { l: L, r: L, t: 0, b: 0 }, mode: '3h' };
    qa[`btn.${v}`] = { src: `${id}.jpg`, ...metrics(b), slice_px_at_master: L, master: [b.w, b.h] };
  }
  if (!frames['btn.glow']) { const g = await glow(im, 8 * M); frames['btn.glow'] = { im: g, slice: { l: L + 8 * M, r: L + 8 * M, t: 0, b: 0 }, mode: '3h', pad: 8 * M }; }
}

// 패널: 9-slice. 마스터 150unit(=450px), 모서리 장식이 들어가도록 inset 자동 측정(가로 측정값을 세로에도 사용: 정사각·대각 대칭 장식)
async function panel(id) {
  const raw = await prepRaw(id); let im = cropBox(raw, bbox(raw)); mirrorH(im);
  im = await resize(im, 150 * M, 150 * M);
  const ref = im.w >> 1; let I = insetX(im, ref, 5) + 2;
  // 세로: 위·아래 몰딩/장식 구간 측정(행 비교는 그라데이션 영향 → 기준 행과 차이가 아니라 열 측정값과 큰 값 사용)
  let T = insetY(im, im.h >> 1);
  I = Math.max(I, T); T = I; // 정사각 대칭 유지
  im = await compactX(im, I); im = await compactY(im, T);
  frames['panel.main'] = { im, slice: { l: I, r: I, t: T, b: T }, mode: '9' };
  qa['panel.main'] = { src: `${id}.jpg`, ...metrics(im), slice_px_at_master: I, master: [im.w, im.h] };
}

// 탭: 시트에서 좌(선택)·우(비선택) 분리 → 각각 3-slice. 선택 탭 윗변 중앙 마름모는 늘어나지 않게 별도 조각(tab.gem)으로 떼고 본체에서 지운다.
async function tabs(id) {
  const raw = await prepRaw(id); const half = raw.w >> 1;
  const H = 56 * M; const out = {};
  for (const [name, x0, x1] of [['on', 0, half], ['off', half, raw.w]]) {
    let im = cropBox(raw, bbox(raw, 64, x0, x1)); mirrorH(im);
    im = await resize(im, im.w * H / im.h, H);
    out[name] = im;
  }
  // 선택 탭의 마름모: 윗부분 중앙. 폭 = 중앙에서 기준 열(35%)과 달라지는 구간
  let on = out.on; const cx = on.w >> 1; const refC = Math.round(on.w * 0.36);
  let gx = cx; while (gx > refC && colDiff(on, gx, refC) > 4) gx--; const gw = (cx - gx + 3) * 2;
  const gemTop = bbox(on).y; let gh = 0; for (let y = 0; y < on.h; y++) { const i = (y * on.w + gx - 2) * 4; if (on.data[i + 3] > 64) { gh = y; break; } } // 마름모 옆 열이 불투명해지는 높이 = 탭 윗변
  const gem = crop(on, cx - (gw >> 1), 0, gw, Math.min(on.h, gh + Math.round(H * 0.12)));
  for (let y = 0; y < on.h; y++) for (let x = cx - (gw >> 1); x < cx + (gw >> 1); x++) on.data.copy(on.data, (y * on.w + x) * 4, (y * on.w + refC) * 4, (y * on.w + refC) * 4 + 4);
  // 마름모를 지운 뒤 위쪽 빈 줄 제거(탭 본체 높이 통일) — 마름모가 차지하던 위쪽 여백은 gem 조각으로만 표현
  const top = gh; on = crop(on, 0, top, on.w, on.h - top); on = await resize(on, on.w * H / on.h, H);
  const gemS = await resize(gem, gem.w * (H / (out.on.h - top)), gem.h * (H / (out.on.h - top)));
  for (const [name, im0] of [['on', on], ['off', out.off]]) {
    const L = Math.min(insetX(im0, Math.round(im0.w * 0.5), 6) + 2, (im0.w >> 1) - 8);
    const im = await compactX(im0, L);
    frames[`tab.${name}`] = { im, slice: { l: L, r: L, t: 0, b: 0 }, mode: '3h' };
    qa[`tab.${name}`] = { src: `${id}.jpg`, ...metrics(im), slice_px_at_master: L, master: [im.w, im.h] };
  }
  frames['tab.gem'] = { im: gemS, slice: null, mode: 'image', anchor: { x: 0.5, y: 'top', offsetY_px: -(gh) * (H / (out.on.h - top)) } };
  qa['tab.gem'] = { ...metrics(gemS), master: [gemS.w, gemS.h] };
}

await button('btn_primary', { primary: (x) => x });
await button('btn_secondary', { secondary: (x) => x, danger: navyToCrimson });
await panel('panel');
await tabs('tab_pair');

// ---------- 조각 PNG + 아틀라스(@3x, @1.5x) ----------
for (const [k, f] of Object.entries(frames)) writeFileSync(`${OUT}/pieces/${k}.png`, await png(f.im));
async function atlas(scale, file) {
  const PAD = 4, MAXW = 1024; let x = PAD, y = PAD, rowH = 0; const comps = [], map = {};
  const items = await Promise.all(Object.entries(frames).map(async ([k, f]) => { const im = scale === 1 ? f.im : await resize(f.im, f.im.w * scale, f.im.h * scale); return [k, f, im]; }));
  items.sort((a, b) => b[2].h - a[2].h);
  for (const [k, f, im] of items) {
    if (x + im.w + PAD > MAXW) { x = PAD; y += rowH + PAD; rowH = 0; }
    comps.push({ input: await png(im), left: x, top: y });
    const sl = f.slice ? Object.fromEntries(Object.entries(f.slice).map(([a, v]) => [a, Math.round(v * scale)])) : null;
    map[k] = { frame: { x, y, w: im.w, h: im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: im.w, h: im.h }, sourceSize: { w: im.w, h: im.h }, slice: sl, sliceMode: f.mode };
    x += im.w + PAD; rowH = Math.max(rowH, im.h);
  }
  const H = y + rowH + PAD; const W = MAXW;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toFile(`${OUT}/atlas/${file}.png`);
  writeFileSync(`${OUT}/atlas/${file}.json`, JSON.stringify({ frames: map, meta: { app: 'docker/gemini/pp_ui.mjs', image: `${file}.png`, format: 'RGBA8888', size: { w: W, h: H }, scale: String(scale * M), unitPx: scale * M, note: 'slice = Phaser nineslice 의 left/right/top/bottom(px, 이 아틀라스 기준). 3h = 가로만 늘림(top/bottom 0, 높이는 균일 스케일)' } }, null, 1));
  return { W, H };
}
const a3 = await atlas(1, 'ui_skin@3x');
const a15 = await atlas(0.5, 'ui_skin@1.5x');

// ---------- 9-slice 렌더(Phaser nineslice 와 같은 방식: 모서리는 텍스처 크기 유지, 오브젝트 전체를 균일 스케일) ----------
async function nine(f, dispW, dispH, pxPerUnit = 1.5) {
  const s = pxPerUnit / M; // 마스터 → 표시 배율(1080p = 0.5)
  const { im } = f; const sl = f.slice;
  if (f.mode === '3h') { const sc = (dispH) / im.h; const tw = Math.max(sl.l + sl.r + 1, Math.round(dispW / sc)); const mid = crop(im, sl.l, 0, im.w - sl.l - sl.r, im.h);
    const full = hcat([crop(im, 0, 0, sl.l, im.h), await resize(mid, tw - sl.l - sl.r, im.h), crop(im, im.w - sl.r, 0, sl.r, im.h)]); return resize(full, dispW, dispH); }
  const tw = Math.round(dispW / s), th = Math.round(dispH / s); const cw = im.w - sl.l - sl.r, ch = im.h - sl.t - sl.b;
  const rows = []; for (const [y0, hh, th2] of [[0, sl.t, sl.t], [sl.t, ch, th - sl.t - sl.b], [im.h - sl.b, sl.b, sl.b]]) {
    const parts = []; for (const [x0, ww, tw2] of [[0, sl.l, sl.l], [sl.l, cw, tw - sl.l - sl.r], [im.w - sl.r, sl.r, sl.r]]) parts.push(await resize(crop(im, x0, y0, ww, hh), tw2, th2)); rows.push(hcat(parts)); }
  return resize(vcat(rows), dispW, dispH);
}
const svgText = (w, h, t, color, size) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${size}" fill="${color}">${t}</text></svg>`);
const label = (w, h, t, color, size = 15) => sharp(svgText(w, h, t, color, size)).png().toBuffer();

// ---------- QA 패널 ----------
const W = 1600; const comps = []; let Y = 16;
const put = async (im, x, y) => comps.push({ input: Buffer.isBuffer(im) ? im : await png(im), left: Math.round(x), top: Math.round(y) });
const title = async (t) => { await put(await label(W, 28, t, '#F3DC8E', 18), 0, Y); Y += 32; };
// 1) 버튼 3변형 x 4상태 (md 44u x 200u, 1080p 픽셀 = x1.5)
await title('1) Buttons md (h44u, w200u @1080p px) - normal / hover / pressed / disabled');
for (const v of ['primary', 'secondary', 'danger']) {
  let x = 40; for (const s of ['normal', 'hover', 'pressed', 'disabled']) {
    const w = 300, h = 66; if (s === 'hover') await put(await nine(frames['btn.glow'], w + 48, h + 48), x - 24, Y - 24);
    await put(await nine(frames[`btn.${v}.${s}`], w, h), x, Y + (s === 'pressed' ? 2 : 0));
    await put(await label(w, h, `${v.toUpperCase()} ${s}`, s === 'disabled' ? '#D5D9E2' : v === 'primary' ? '#1A1406' : '#F4EEDC'), x, Y + (s === 'pressed' ? 2 : 0));
    x += w + 60; }
  Y += 66 + 22;
}
// 2) 크기 3종 + 늘림
await title('2) Sizes sm32/md44/lg56 unit and stretch 80u..480u (primary)');
{ let x = 40; for (const [w, h] of [[120, 48], [240, 66], [360, 84], [720, 84]]) { await put(await nine(frames['btn.primary.normal'], w, h), x, Y); x += w + 24; } Y += 84 + 20; }
// 3) 패널 늘림 3종 + 탭 바
await title('3) Panel 9-slice stretch (small / wide / tall) + bottom tab bar (5 tabs, 1 selected)');
{ const ps = [[240, 160], [520, 240], [220, 360]]; let x = 40; for (const [w, h] of ps) { await put(await nine(frames['panel.main'], w, h), x, Y); x += w + 30; }
  const tw = 104, th = 70; let tx = x; const gem = frames['tab.gem'].im; const gemD = await resize(gem, gem.w * th / frames['tab.on'].im.h, gem.h * th / frames['tab.on'].im.h);
  for (const [bw, bh, by] of [[104, 70, Y + 190], [74, 56, Y + 290]]) { const gD = await resize(gem, gem.w * bh / frames['tab.on'].im.h, gem.h * bh / frames['tab.on'].im.h);
    for (let i = 0; i < 5; i++) { const on = i === 1; const xx = tx + i * (bw + 4); await put(await nine(frames[on ? 'tab.on' : 'tab.off'], bw, bh), xx, by);
      await put(await label(bw, bh, ['STAGE', 'HERO', 'ROOM', 'PARTY', 'MORE'][i], on ? '#FFF6D8' : '#A9B4CF', bw < 90 ? 11 : 14), xx, by);
      if (on) await put(gD, xx + (bw - gD.w) / 2, by - Math.round(gD.h * 0.45)); } }
  await put(await label(540, 24, 'tab bar: 104x70 (desktop) / 74x56 (390px phone)', '#A9B4CF', 13), tx, Y + 356);
  Y += 380; }
// 4) 확대 검사(흰 바탕·남색 바탕 x3 nearest): 버튼 끝, 패널 모서리
await title('4) Edge zoom x3 (white / navy bg) - halo, magenta fringe check');
{ const zoom = async (f, cx, cy, sz, bg) => { const c = crop(f.im, cx, cy, sz, sz); const base = await sharp({ create: { width: sz, height: sz, channels: 4, background: bg } }).composite([{ input: await png(c) }]).png().toBuffer(); return sharp(base).resize(sz * 3, sz * 3, { kernel: 'nearest' }).png().toBuffer(); };
  let x = 40; const p = frames['btn.primary.normal'], pn = frames['panel.main'], s = frames['btn.secondary.normal'];
  for (const [f, cx, cy] of [[p, 0, 0], [s, 0, f0(s)], [pn, 0, 0]]) for (const bg of [{ r: 255, g: 255, b: 255, alpha: 1 }, { r: 11, g: 19, b: 40, alpha: 1 }]) { await put(await zoom(f, cx, cy, 80, bg), x, Y); x += 250; }
  Y += 250; }
function f0(f) { return Math.max(0, f.im.h - 80); }
const bgCanvas = await sharp({ create: { width: W, height: Y + 16, channels: 4, background: { r: 11, g: 19, b: 40, alpha: 1 } } }).composite(comps).png().toFile(`${OUT}/preview/ui_trial_qa_panel.png`);

// ---------- manifest 조각 ----------
const bytes = (p) => statSync(p).size;
const frag = {
  note: '시험본(ui_trial). 본 manifest 에 병합하지 않는다. 로딩: Phaser load.atlas(textureKey, png, json) → frame 이름으로 nineslice(…, frame, w, h, l, r, t, b). 키 규칙은 ui_design_system.md 참조',
  generated: new Date().toISOString(),
  items: [
    { key: 'atlas.uiskin', path: `${OUT.replace(/^public\//, '')}/atlas/ui_skin@3x.png`, json: `${OUT.replace(/^public\//, '')}/atlas/ui_skin@3x.json`, type: 'atlas', unitPx: 3, size: [a3.W, a3.H], bytes: bytes(`${OUT}/atlas/ui_skin@3x.png`), alpha: true, filter: 'LINEAR',
      variants: { '1.5x': { path: `${OUT.replace(/^public\//, '')}/atlas/ui_skin@1.5x.png`, json: `${OUT.replace(/^public\//, '')}/atlas/ui_skin@1.5x.json`, size: [a15.W, a15.H], bytes: bytes(`${OUT}/atlas/ui_skin@1.5x.png`) } },
      frames: Object.fromEntries(Object.entries(frames).map(([k, f]) => [k, { size: [f.im.w, f.im.h], slice: f.slice, sliceMode: f.mode, ...(f.anchor ? { anchor: f.anchor } : {}), ...(f.pad ? { glowPad: f.pad } : {}) }])),
      generator: { model: 'gemini-nano-banana-2.1(이미지 API, 2K)', calls: 4, script: 'docker/gemini/gen.mjs ui_trial + docker/gemini/pp_ui.mjs', derived: 'hover/pressed/disabled/danger/glow 는 pp_ui.mjs 가 결정적으로 파생(추가 호출 없음)' },
      prompt_ref: 'docker/gemini/style_guide.mjs UISKIN_TRIAL', license: 'AI 생성물(Gemini) — 상업 이용 약관 사람 확인 필요', provenance: 'raw: public/assets/ui_trial/raw/*.jpg',
      qa: { auto: qa, verdict: 'see ui_design_system.md §11' }, verify: false },
  ],
};
writeFileSync(`${OUT}/manifest_fragment.json`, JSON.stringify(frag, null, 1));
console.log(JSON.stringify({ atlas3: a3, atlas15: a15, qa, frames: Object.fromEntries(Object.entries(frames).map(([k, f]) => [k, [f.im.w, f.im.h, f.slice]])) }, null, 0));
