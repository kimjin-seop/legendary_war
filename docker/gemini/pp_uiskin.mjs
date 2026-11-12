// UI 스킨 본 생산 후처리(A안 확정: 남색 칠기 + 금박). <OUT>/raw/*.jpg → 마젠타 키 → 분할·대칭·9/3-slice 압축 → 상태 파생 → 아틀라스 2장(@3x, @1.5x) + 배경 JPG + 아이콘 PNG + QA 패널 + manifest 조각.
// 실행(컨테이너, API 호출 없음):
//   docker run --rm -v "<프로젝트>":/app -w /app node:22 sh -c "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp_uiskin.mjs public/assets/ui_skin"
// 의존: sharp 0.33.5(Apache-2.0, libvips LGPL-3.0). 규칙 단일 출처: style_guide.mjs(UISKIN_*), 문서: ui_design_system.md. 시험 스크립트 pp_ui.mjs 는 재현용으로 보존.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, statSync, existsSync } from 'node:fs';
import { UISKIN_PAL, EQUIP_RARITY_COLOR } from './style_guide.mjs';

const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const OUT = process.argv[2] ?? 'public/assets/ui_skin';
const RAW = `${OUT}/raw`;
const M = 3; // 마스터: 1 unit = 3px
const ensure = (d) => mkdirSync(d, { recursive: true });
['pieces', 'atlas', 'preview', 'bg', 'icons/64', 'icons/32'].forEach((d) => ensure(`${OUT}/${d}`));
const has = (id) => existsSync(`${RAW}/${id}.jpg`);
const warn = [];

// ---------- 버퍼 연산 ----------
const img = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) });
const clone = (im) => ({ w: im.w, h: im.h, data: Buffer.from(im.data) });
const toSharp = (im) => sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } });
async function fromSharp(s) { const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
const load = (f) => fromSharp(sharp(f));
const png = (im) => toSharp(im).png({ compressionLevel: 9 }).toBuffer();
async function resize(im, w, h) { return fromSharp(toSharp(im).resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { kernel: 'lanczos3', fit: 'fill' })); }
function crop(im, x, y, w, h) { const o = img(w, h); for (let j = 0; j < h; j++) im.data.copy(o.data, j * w * 4, ((y + j) * im.w + x) * 4, ((y + j) * im.w + x + w) * 4); return o; }
function hcat(parts) { const h = parts[0].h, w = parts.reduce((a, p) => a + p.w, 0), o = img(w, h); let x0 = 0; for (const p of parts) { for (let j = 0; j < h; j++) p.data.copy(o.data, (j * w + x0) * 4, j * p.w * 4, (j + 1) * p.w * 4); x0 += p.w; } return o; }
function vcat(parts) { const w = parts[0].w; return { w, h: parts.reduce((a, p) => a + p.h, 0), data: Buffer.concat(parts.map((p) => p.data)) }; }
function blit(dst, src, x0, y0) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const X = x + x0, Y = y + y0; if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue; const s = (y * src.w + x) * 4, d = (Y * dst.w + X) * 4, a = src.data[s + 3] / 255; if (!a) continue; const da = dst.data[d + 3] / 255, oa = a + da * (1 - a); for (let k = 0; k < 3; k++) dst.data[d + k] = Math.round((src.data[s + k] * a + dst.data[d + k] * da * (1 - a)) / oa); dst.data[d + 3] = Math.round(oa * 255); } }

// 마젠타 키(pp.mjs / pp_ui.mjs / pp_equip.mjs 와 동일) + 경계 1px 침식
function keyMagenta(im, grow = 3) {
  const { data, w, h } = im, N = w * h; const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < grow; it++) { const add = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if ((x > 0 && strict[i - 1]) || (x < w - 1 && strict[i + 1]) || (y > 0 && strict[i - w]) || (y < h - 1 && strict[i + w])) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) { if (strict[i]) { data.fill(0, i * 4, i * 4 + 4); continue; } const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const spill = Math.max(0, Math.min(r, b) - g - 25); if (spill > 0) { data[i * 4] = r - spill; data[i * 4 + 2] = b - spill; } }
  return im;
}
function erode(im) { const { w, h, data } = im; const kill = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!data[i * 4 + 3]) continue; if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[(i - 1) * 4 + 3] || !data[(i + 1) * 4 + 3] || !data[(i - w) * 4 + 3] || !data[(i + w) * 4 + 3]) kill.push(i); } for (const i of kill) data[i * 4 + 3] = 0; return im; }
// 작은 잡티 제거
function dropSpecks(im, minArea) { const { w, h, data } = im, seen = new Uint8Array(w * h); for (let s = 0; s < w * h; s++) { if (seen[s] || !data[s * 4 + 3]) continue; const comp = [s]; seen[s] = 1; for (let k = 0; k < comp.length; k++) { const i = comp[k], x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !seen[j] && data[j * 4 + 3]) { seen[j] = 1; comp.push(j); } } if (comp.length < minArea) for (const i of comp) data.fill(0, i * 4, i * 4 + 4); } return im; }
function bbox(im, thr = 64, x0 = 0, x1 = im.w, y0 = 0, y1 = im.h) { let a = im.w, b = im.h, c = -1, d = -1; for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) if (im.data[(y * im.w + x) * 4 + 3] >= thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return c < 0 ? null : { x: a, y: b, w: c - a + 1, h: d - b + 1 }; }
const cropBox = (im, bb) => crop(im, bb.x, bb.y, bb.w, bb.h);
const trim = (im) => cropBox(im, bbox(im));
function mirrorH(im) { const { w, h, data } = im; for (let y = 0; y < h; y++) for (let x = 0; x < (w >> 1); x++) data.copy(data, (y * w + (w - 1 - x)) * 4, (y * w + x) * 4, (y * w + x) * 4 + 4); return im; }
// 축 방향으로 빈 줄(불투명 0)로 나뉜 덩어리 → bbox 목록(작은 덩어리 제외)
function splitAxis(im, axis, minFrac = 0.03) {
  const n = axis === 'y' ? im.h : im.w, m = axis === 'y' ? im.w : im.h; const filled = new Uint8Array(n);
  for (let i = 0; i < n; i++) { let c = 0; for (let j = 0; j < m; j++) { const x = axis === 'y' ? j : i, y = axis === 'y' ? i : j; if (im.data[(y * im.w + x) * 4 + 3] >= 64) c++; } filled[i] = c > 2 ? 1 : 0; }
  const segs = []; let s = -1; for (let i = 0; i <= n; i++) { if (i < n && filled[i]) { if (s < 0) s = i; } else if (s >= 0) { if (i - s >= n * minFrac) segs.push([s, i]); s = -1; } }
  return segs.map(([a, b]) => axis === 'y' ? bbox(im, 64, 0, im.w, a, b) : bbox(im, 64, a, b, 0, im.h));
}
function colEdge(im, x) { let n = 0; for (let y = 0; y < im.h; y++) { const i = (y * im.w + x) * 4, j = (y * im.w + x + 3) * 4; let m = 0; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(im.data[i + k] - im.data[j + k])); if (m > 24) n++; } return n / im.h; }
function rowEdge(im, y) { let n = 0; for (let x = 0; x < im.w; x++) { const i = (y * im.w + x) * 4, j = ((y + 3) * im.w + x) * 4; let m = 0; for (let k = 0; k < 4; k++) m = Math.max(m, Math.abs(im.data[i + k] - im.data[j + k])); if (m > 24) n++; } return n / im.w; }
function insetX(im, ref) { let x = ref; while (x > 0 && colEdge(im, x - 1) < 0.008) x--; return x + 3; }
function insetY(im, ref) { let y = ref; while (y > 0 && rowEdge(im, y - 1) < 0.008) y--; return y + 3; }
async function compactX(im, L, C = 12) { const mid = crop(im, L, 0, im.w - 2 * L, im.h); return hcat([crop(im, 0, 0, L, im.h), await resize(mid, C, im.h), crop(im, im.w - L, 0, L, im.h)]); }
async function compactY(im, T, C = 12) { const mid = crop(im, 0, T, im.w, im.h - 2 * T); return vcat([crop(im, 0, 0, im.w, T), await resize(mid, im.w, C), crop(im, 0, im.h - T, im.w, T)]); }

// ---------- 색 ----------
const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : Math.round(v));
const hx = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
const mixRGB = (a, b, t) => a.map((v, k) => v + (b[k] - v) * t);
function mapRGB(im, f) { const o = clone(im); for (let i = 0; i < im.w * im.h; i++) { if (!o.data[i * 4 + 3]) continue; const [r, g, b] = f(o.data[i * 4], o.data[i * 4 + 1], o.data[i * 4 + 2], i); o.data[i * 4] = clamp(r); o.data[i * 4 + 1] = clamp(g); o.data[i * 4 + 2] = clamp(b); } return o; }
const L = (r, g, b) => 0.3 * r + 0.59 * g + 0.11 * b;
const hover = (im) => mapRGB(im, (r, g, b) => [r * 1.12 + 8, g * 1.12 + 8, b * 1.1 + 6]);
const pressed = (im) => mapRGB(im, (r, g, b) => [r * 0.78, g * 0.78, b * 0.8]);
const disabledK = (im, k) => mapRGB(im, (r, g, b) => { const l = L(r, g, b); return [l * k + 10, l * (k + 0.02) + 12, l * (k + 0.06) + 22]; });
const lumC = (rgb) => { const [r, g, b] = rgb.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lumC(a), lumC(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(2); };
// 중앙 면 대표색(가운데 40%x30% 영역 중앙값)
function faceColor(im) { const xs = [], cs = [[], [], []]; for (let y = Math.round(im.h * 0.35); y < im.h * 0.65; y++) for (let x = Math.round(im.w * 0.3); x < im.w * 0.7; x++) { const i = (y * im.w + x) * 4; if (im.data[i + 3] < 200) continue; for (let k = 0; k < 3; k++) cs[k].push(im.data[i + k]); } return cs.map((a) => { a.sort((p, q) => p - q); return a[a.length >> 1] ?? 0; }); }
const LABEL_DIS = hx('#D5D9E2');
// disabled: 라벨(#D5D9E2) 대비 4.5 이상(목표 4.8)이 될 때까지 명도 계수를 낮춤
function disabled(im) { let k = 0.42, o; for (; k > 0.12; k -= 0.02) { o = disabledK(im, k); if (contrast(LABEL_DIS, faceColor(o)) >= 4.8) break; } o.k = +k.toFixed(2); return o; }
function navyToCrimson(im) { const lo = hx('#3A0E0C'), hi = hx(UISKIN_PAL.crimsonLight); return mapRGB(im, (r, g, b) => { if (!(b > r + 8 && b >= g)) return [r, g, b]; const l = Math.min(1, L(r, g, b) / 110); return mixRGB(lo, hi, l); }); }
function goldToCrimson(im) { const lo = hx('#4A100C'), hi = hx('#F08070'); return mapRGB(im, (r, g, b) => { if (!(r > b + 30 && g > b)) return [r, g, b]; const l = Math.min(1, L(r, g, b) / 230); return mixRGB(lo, hi, l); }); }
// 무채색 → 등급색 램프(어두운 쪽은 검정 쪽으로, 밝은 쪽은 흰색 쪽으로)
function tint(im, c) { const C = hx(c), D = mixRGB(C, [0, 0, 0], 0.68), Lt = mixRGB(C, [255, 255, 255], 0.55); return mapRGB(im, (r, g, b) => { const l = Math.min(1, L(r, g, b) / 235); return l < 0.55 ? mixRGB(D, C, l / 0.55) : mixRGB(C, Lt, (l - 0.55) / 0.45); }); }
function multiply(im, c, lift = 0.5, gain = 0.65) { const C = hx(c); return mapRGB(im, (r, g, b) => { const l = L(r, g, b) / 255; const v = lift + gain * l; const hi = Math.max(0, l - 0.86) * 4; return C.map((x) => x * v + (255 - x * v) * hi); }); }
async function glow(im, pad, color = UISKIN_PAL.goldLight) {
  const [r, g, b] = hx(color); const o = img(im.w + pad * 2, im.h + pad * 2);
  for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) { const a = im.data[(y * im.w + x) * 4 + 3]; const j = ((y + pad) * o.w + x + pad) * 4; o.data[j] = r; o.data[j + 1] = g; o.data[j + 2] = b; o.data[j + 3] = a; }
  for (let i = 0; i < o.w * o.h; i++) if (!o.data[i * 4 + 3]) { o.data[i * 4] = r; o.data[i * 4 + 1] = g; o.data[i * 4 + 2] = b; }
  const bl = await fromSharp(toSharp(o).blur(pad / 2.5)); for (let i = 0; i < bl.w * bl.h; i++) bl.data[i * 4 + 3] = clamp(bl.data[i * 4 + 3] * 0.75); return bl;
}
// 반투명 면(HUD): 남색 우세 화소 알파 x a
function faceAlpha(im, a) { const o = clone(im); for (let i = 0; i < o.w * o.h; i++) { const r = o.data[i * 4], g = o.data[i * 4 + 1], b = o.data[i * 4 + 2]; if (o.data[i * 4 + 3] && b > r + 8 && L(r, g, b) < 70) o.data[i * 4 + 3] = clamp(o.data[i * 4 + 3] * a); } return o; }

// ---------- QA 지표 ----------
function metrics(im) {
  let opaque = 0, magenta = 0, purple = 0, pinkEdge = 0; const { w, h, data } = im;
  for (let i = 0; i < w * h; i++) { const a = data[i * 4 + 3]; if (!a) continue; const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (a < 255 && r - g > 40 && b - g > 40) pinkEdge++; if (a < 128) continue; opaque++; if (r - g > 60 && b - g > 60) magenta++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d > 40 && mx > 60) { let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; if (hue >= 255 && hue <= 330) purple++; } }
  return { opaque, magenta_px: magenta, pink_edge_px: pinkEdge, purple_ratio: +(purple / Math.max(1, opaque)).toFixed(4) };
}

// ---------- 프레임 등록 ----------
const frames = {}; const qa = {}; const AT = { uiskin: [], uiskin_gacha: [] };
function add(atlas, name, im, mode, slice = null, extra = {}) { frames[name] = { im, mode, slice, atlas, ...extra }; AT[atlas].push(name); }
async function prep(id) { const im = keyMagenta(await load(`${RAW}/${id}.jpg`)); erode(im); dropSpecks(im, 300); return im; }
function q(name, im, src, extra = {}) { qa[name] = { src, ...metrics(im), master: [im.w, im.h], ...extra }; }

// 3-slice(가로 늘림) 조각: 높이 Hu unit 마스터
async function strip3(im0, Hu, { mirror = true, minL = 0, maxL = Infinity } = {}) { let im = trim(im0); if (mirror) mirrorH(im); const H = Hu * M; im = await resize(im, im.w * H / im.h, H); const Lx = Math.max(minL, Math.min(insetX(im, im.w >> 1) + 2, (im.w >> 1) - 8, Math.round(maxL))); return { im: await compactX(im, Lx), L: Lx }; }
// 9-slice 조각: 폭 Wu unit, 높이는 비율 유지(sq=true면 정사각) / 모서리 inset 자동 측정
async function nine9(im0, Wu, { sq = true, sym = true, flat = false } = {}) { let im = trim(im0); mirrorH(im); const W = Wu * M; im = await resize(im, W, sq ? W : im.h * W / im.w); let I = insetX(im, im.w >> 1) + 2, T = insetY(im, im.h >> 1) + 2; if (sym) { I = Math.max(I, T); T = I; } T = Math.min(T, (im.h >> 1) - 8); I = Math.min(I, (im.w >> 1) - 8); if (flat) flatten(im); im = await compactX(im, I); im = await compactY(im, T); return { im, l: I, t: T }; }
// 안쪽 면(x∈[I,W-I], y∈[T,H-T])을 행 평균으로 바꿔 세로 그라데이션만 남김(가장자리 8px 페더). 9-slice 중앙 늘림 시 얼룩 방지
function flatten(im) { // 테두리 안쪽 면 전체에서 '행 평균과 가까운 화소'(=면)만 행 평균으로 치환 → 방사형 얼룩 제거, 금 장식은 유지
  const { w, h, data } = im; let b0 = 0; const ym = h >> 1; while (b0 < w / 3) { const i = (ym * w + b0) * 4; if (data[i + 3] > 200 && data[i + 2] > data[i] + 8 && L(data[i], data[i + 1], data[i + 2]) < 70) break; b0++; } b0 += 2;
  for (let y = b0; y < h - b0; y++) { const acc = [0, 0, 0]; let n = 0; for (let x = w >> 2; x < w - (w >> 2); x++) { const i = (y * w + x) * 4; for (let k = 0; k < 3; k++) acc[k] += data[i + k]; n++; } const mean = acc.map((v) => v / n);
    for (let x = b0; x < w - b0; x++) { const i = (y * w + x) * 4; const d = (Math.abs(data[i] - mean[0]) + Math.abs(data[i + 1] - mean[1]) + Math.abs(data[i + 2] - mean[2])) / 3; const t = Math.max(0, Math.min(1, (40 - d) / 14)); for (let k = 0; k < 3; k++) data[i + k] = Math.round(data[i + k] * (1 - t) + mean[k] * t); } } }
function states(prefix, base, atlas, slice, mode, src, set = ['normal', 'hover', 'pressed', 'disabled']) {
  const out = { normal: base, hover: hover(base), pressed: pressed(base) }; const d = disabled(base); out.disabled = d;
  for (const s of set) add(atlas, `${prefix}.${s}`, out[s], mode, slice);
  q(prefix, base, src, { slice_px_at_master: slice, disabled_k: d.k, disabled_face: '#' + faceColor(d).map((v) => v.toString(16).padStart(2, '0')).join(''), disabled_label_contrast: contrast(LABEL_DIS, faceColor(d)) });
}

// ===== 1) 버튼(md·lg: 시험 raw 재사용) =====
for (const [id, vs] of [['btn_primary', { primary: (x) => x }], ['btn_secondary', { secondary: (x) => x, danger: navyToCrimson }]]) {
  const { im, L: Lx } = await strip3(await prep(id), 56);
  for (const [v, f] of Object.entries(vs)) states(`btn.${v}`, f(im), 'uiskin', { l: Lx, r: Lx, t: 0, b: 0 }, '3h', `${id}.jpg(시험 raw 재사용)`);
  if (id === 'btn_primary') { const g = await glow(im, 8 * M); add('uiskin', 'btn.glow', g, '3h', { l: Lx + 8 * M, r: Lx + 8 * M, t: 0, b: 0 }, { pad: 8 * M }); }
}
// sm(32u) 얇은 판: 위 금 / 아래 남색
if (has('btn_sm_pair')) { const raw = await prep('btn_sm_pair'); const segs = splitAxis(raw, 'y'); if (segs.length < 2) warn.push(`btn_sm_pair 분할 ${segs.length}`);
  const [gold, navy] = segs.slice(0, 2).map((bb) => cropBox(raw, bb));
  const a = await strip3(gold, 32, { maxL: 32 * M * 0.6 }); states('btn.primary.sm', a.im, 'uiskin', { l: a.L, r: a.L, t: 0, b: 0 }, '3h', 'btn_sm_pair.jpg(위)');
  const b = await strip3(navy, 32, { maxL: 32 * M * 0.6 }); states('btn.secondary.sm', b.im, 'uiskin', { l: b.L, r: b.L, t: 0, b: 0 }, '3h', 'btn_sm_pair.jpg(아래)'); states('btn.danger.sm', navyToCrimson(b.im), 'uiskin', { l: b.L, r: b.L, t: 0, b: 0 }, '3h', 'btn_sm_pair.jpg(아래, 파생)'); }
// 원형 아이콘 버튼 56u
if (has('btn_round')) { let im = trim(await prep('btn_round')); mirrorH(im); im = await resize(im, 56 * M, 56 * M * im.h / im.w); states('btn.icon.round', im, 'uiskin', null, 'image', 'btn_round.jpg'); add('uiskin', 'btn.icon.round.glow', await glow(im, 6 * M), 'image', null, { pad: 6 * M }); }
// 탭(on/off + gem)
if (has('tab_pair')) {
  const raw = await prep('tab_pair'); const segs = splitAxis(raw, 'x'); if (segs.length < 2) warn.push(`tab_pair 분할 ${segs.length}`);
  const H = 56 * M; const out = {};
  for (const [name, bb] of [['on', segs[0]], ['off', segs[segs.length - 1]]]) { let im = cropBox(raw, bb); mirrorH(im); out[name] = await resize(im, im.w * H / im.h, H); }
  let on = out.on; const cx = on.w >> 1; const refC = Math.round(on.w * 0.36);
  const colDiff = (im, x, ref) => { let s = 0; for (let y = 0; y < im.h; y++) { const i = (y * im.w + x) * 4, j = (y * im.w + ref) * 4; for (let k = 0; k < 4; k++) s += Math.abs(im.data[i + k] - im.data[j + k]); } return s / (im.h * 4); };
  let gx = cx; while (gx > refC && colDiff(on, gx, refC) > 4) gx--; const gw = Math.max(12, (cx - gx + 3) * 2);
  let gh = 0; for (let y = 0; y < on.h; y++) { const i = (y * on.w + Math.max(0, cx - (gw >> 1) - 2)) * 4; if (on.data[i + 3] > 64) { gh = y; break; } }
  const gem = crop(on, cx - (gw >> 1), 0, gw, Math.min(on.h, gh + Math.round(H * 0.12)));
  for (let y = 0; y < on.h; y++) for (let x = cx - (gw >> 1); x < cx + (gw >> 1); x++) on.data.copy(on.data, (y * on.w + x) * 4, (y * on.w + refC) * 4, (y * on.w + refC) * 4 + 4);
  const top = gh; const k = H / (out.on.h - top); on = crop(on, 0, top, on.w, on.h - top); on = await resize(on, on.w * H / on.h, H);
  const gemS = await resize(gem, gem.w * k, gem.h * k);
  for (const [name, im0] of [['on', on], ['off', out.off]]) { const Lx = Math.min(insetX(im0, Math.round(im0.w * 0.5)) + 2, (im0.w >> 1) - 8); const im = await compactX(im0, Lx); add('uiskin', `tab.${name}`, im, '3h', { l: Lx, r: Lx, t: 0, b: 0 }); q(`tab.${name}`, im, 'tab_pair.jpg', { slice_px_at_master: Lx, corner_ratio_at_74x56: +((Lx * 56 / H) / 74).toFixed(3), min_width_over_h: +((2 * Lx) / H).toFixed(2) }); }
  add('uiskin', 'tab.gem', gemS, 'image', null, { anchor: { x: 0.5, y: 'top', offsetY_px: -Math.round(gh * k) } }); q('tab.gem', gemS, 'tab_pair.jpg');
}

// ===== 2) 패널·리본·행·입력·토스트·대사 창 =====
{ const r = await nine9(await prep('panel'), 150); add('uiskin', 'panel.main', r.im, '9', { l: r.l, r: r.l, t: r.t, b: r.t }); q('panel.main', r.im, 'panel.jpg(시험 raw 재사용)', { slice_px_at_master: r.l }); }
if (has('panel_sub')) { const r = await nine9(await prep('panel_sub'), 96, { flat: true }); add('uiskin', 'panel.sub', r.im, '9', { l: r.l, r: r.l, t: r.t, b: r.t }); q('panel.sub', r.im, 'panel_sub.jpg', { slice_px_at_master: r.l, inset_unit: +(r.l / M).toFixed(1) }); }
if (has('panel_hud')) { const r = await nine9(await prep('panel_hud'), 96, { flat: true }); const im = faceAlpha(r.im, 0.92); add('uiskin', 'panel.hud', im, '9', { l: r.l, r: r.l, t: r.t, b: r.t }); q('panel.hud', im, 'panel_hud.jpg', { slice_px_at_master: r.l, inset_unit: +(r.l / M).toFixed(1), face_alpha: 0.92 }); }
for (const [id, name, Hu] of [['header_ribbon', 'header.ribbon', 44], ['toast_pill', 'toast.pill', 40], ['topbar_strip', 'topbar.strip', 64], ['currency_capsule', 'currency.capsule', 36]]) {
  if (!has(id)) continue; const r = await strip3(await prep(id), Hu); add('uiskin', name, r.im, '3h', { l: r.L, r: r.L, t: 0, b: 0 }); q(name, r.im, `${id}.jpg`, { slice_px_at_master: r.L }); }
if (has('row_list')) { const r = await strip3(await prep('row_list'), 64); const sl = { l: r.L, r: r.L, t: 0, b: 0 };
  // selected: hover + 좌측 4u 금 띠(테두리 안쪽)
  const sel = hover(r.im); { const y0 = Math.round(r.im.h * 0.5); let x0 = 0; while (x0 < r.im.w / 4) { const i = (y0 * r.im.w + x0) * 4; const [R, G, B, A] = [...sel.data.subarray(i, i + 4)]; if (A > 200 && B > R + 8 && L(R, G, B) < 110) break; x0++; }
    const top = Math.round(r.im.h * 0.16), bot = Math.round(r.im.h * 0.84), wS = 4 * M; const gl = hx(UISKIN_PAL.goldLight), gd = hx(UISKIN_PAL.goldDark);
    for (let y = top; y < bot; y++) for (let x = x0 + 2; x < x0 + 2 + wS; x++) { const i = (y * sel.w + x) * 4; if (sel.data[i + 3] < 200) continue; const t = (y - top) / (bot - top); const c = mixRGB(gl, gd, t); sel.data[i] = c[0]; sel.data[i + 1] = c[1]; sel.data[i + 2] = c[2]; } }
  add('uiskin', 'row.list.normal', r.im, '3h', sl); add('uiskin', 'row.list.hover', hover(r.im), '3h', sl); add('uiskin', 'row.list.selected', sel, '3h', sl); add('uiskin', 'row.list.disabled', disabled(r.im), '3h', sl); q('row.list', r.im, 'row_list.jpg', { slice_px_at_master: r.L }); }
if (has('input_field')) { const r = await strip3(await prep('input_field'), 44); const sl = { l: r.L, r: r.L, t: 0, b: 0 }; add('uiskin', 'input.field.normal', r.im, '3h', sl); add('uiskin', 'input.field.focus', mapRGB(r.im, (R2, G2, B2) => (R2 > B2 + 30 ? [R2 * 1.25 + 20, G2 * 1.22 + 16, B2 * 1.1] : [R2, G2, B2])), '3h', sl); add('uiskin', 'input.field.error', goldToCrimson(r.im), '3h', sl); q('input.field', r.im, 'input_field.jpg', { slice_px_at_master: r.L }); }
if (has('dialog_pair')) { const raw = await prep('dialog_pair'); const segs = splitAxis(raw, 'y'); if (segs.length < 2) warn.push(`dialog_pair 분할 ${segs.length}`);
  const boxBB = segs.reduce((a, b) => (b.w * b.h > a.w * a.h ? b : a)); const plateBB = segs.find((s) => s !== boxBB);
  const r = await nine9(cropBox(raw, boxBB), 300, { sq: false, sym: false }); add('uiskin', 'dialog.box', r.im, '9', { l: r.l, r: r.l, t: r.t, b: r.t }); q('dialog.box', r.im, 'dialog_pair.jpg(아래)', { slice_px_at_master: [r.l, r.t] });
  if (plateBB) { const p = await strip3(cropBox(raw, plateBB), 36); add('uiskin', 'dialog.nameplate', p.im, '3h', { l: p.L, r: p.L, t: 0, b: 0 }); q('dialog.nameplate', p.im, 'dialog_pair.jpg(위)', { slice_px_at_master: p.L }); } }

// ===== 3) 게이지·배지 =====
const BAR_COLORS = { hp: '#4CD964', hp_warn: '#F2C14E', hp_danger: '#E04A4A', exp: '#58C7F3', gold: '#F0B23C', cost: '#3FC1B0' }; // cost: spec #C58BFF(보라) 대신 청록 — 보라 금지 규칙. FE 는 bar.fill.base + setTint 로 임의 색 가능
if (has('gauge_pair')) { const raw = await prep('gauge_pair'); const segs = splitAxis(raw, 'y'); if (segs.length < 2) warn.push(`gauge_pair 분할 ${segs.length}`);
  const t = await strip3(cropBox(raw, segs[0]), 14); add('uiskin', 'bar.track', t.im, '3h', { l: t.L, r: t.L, t: 0, b: 0 }); q('bar.track', t.im, 'gauge_pair.jpg(위)', { slice_px_at_master: t.L });
  const f = await strip3(cropBox(raw, segs[segs.length - 1]), 10); const sl = { l: f.L, r: f.L, t: 0, b: 0 }; add('uiskin', 'bar.fill.base', f.im, '3h', sl); q('bar.fill.base', f.im, 'gauge_pair.jpg(아래)', { slice_px_at_master: f.L });
  for (const [k, c] of Object.entries(BAR_COLORS)) add('uiskin', `bar.fill.${k}`, multiply(f.im, c), '3h', sl); }
if (has('badge_pair')) { const raw = await prep('badge_pair'); const segs = splitAxis(raw, 'x'); if (segs.length < 2) warn.push(`badge_pair 분할 ${segs.length}`);
  let dot = cropBox(raw, segs[0]); mirrorH(dot); dot = await resize(dot, 24 * M, 24 * M * dot.h / dot.w); add('uiskin', 'badge.dot', dot, 'image'); q('badge.dot', dot, 'badge_pair.jpg(왼쪽)');
  const p = await strip3(cropBox(raw, segs[segs.length - 1]), 20); add('uiskin', 'badge.pill', p.im, '3h', { l: p.L, r: p.L, t: 0, b: 0 }); q('badge.pill', p.im, 'badge_pair.jpg(오른쪽)', { slice_px_at_master: p.L }); }

// ===== 4) 아이콘 시트(4x3) → ico.<name> (108px@3x = 36u) + 개별 64/32 PNG =====
const ICON_NAMES = { icons_a: ['back', 'close', 'plus', 'info', 'lock', 'check', 'mail', 'quest', 'notice', 'shop', 'inventory', 'ticket'], icons_b: ['shard', 'stamina', 'log', 'fullview', 'fit', 'speed', 'auto', 'skip', 'filter', 'sort', 'edit', 'logout'] };
for (const [id, names] of Object.entries(ICON_NAMES)) { if (!has(id)) continue; const raw = await prep(id); const cw = raw.w / 4, ch = raw.h / 3;
  // 칸별 bbox: 칸 중심 기준 연결 성분의 무게중심이 그 칸에 속하는 화소만
  const { w, h, data } = raw; const lab = new Int32Array(w * h).fill(-1); const comps = [];
  for (let s = 0; s < w * h; s++) { if (lab[s] >= 0 || data[s * 4 + 3] < 64) continue; const id2 = comps.length; const pts = [s]; lab[s] = id2; let sx = 0, sy = 0;
    for (let k = 0; k < pts.length; k++) { const i = pts[k], x = i % w, y = (i / w) | 0; sx += x; sy += y; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && data[j * 4 + 3] >= 64) { lab[j] = id2; pts.push(j); } }
    comps.push({ n: pts.length, cx: sx / pts.length, cy: sy / pts.length, pts }); }
  for (let cell = 0; cell < 12; cell++) { const c = cell % 4, r = (cell / 4) | 0; const mine = comps.filter((p) => p.n > 150 && Math.floor(p.cx / cw) === c && Math.floor(p.cy / ch) === r);
    if (!mine.length) { warn.push(`${id} 칸 ${cell} 비어 있음`); continue; }
    const o = img(w, h); for (const p of mine) for (const i of p.pts) data.copy(o.data, i * 4, i * 4, i * 4 + 4);
    // 반투명 경계 화소(알파<64)도 포함: bbox 주변 2px 확장 영역의 원본 화소 복사
    const bb = bbox(o, 1); const x0 = Math.max(0, bb.x - 3), y0 = Math.max(0, bb.y - 3), x1 = Math.min(w, bb.x + bb.w + 3), y1 = Math.min(h, bb.y + bb.h + 3);
    for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (data[i * 4 + 3] < 64 && data[i * 4 + 3] > 0) data.copy(o.data, i * 4, i * 4, i * 4 + 4); }
    const ic = crop(o, x0, y0, x1 - x0, y1 - y0); const S = 108, pad = 4, s = Math.min((S - pad * 2) / ic.w, (S - pad * 2) / ic.h); const sm = await resize(ic, ic.w * s, ic.h * s); const cv = img(S, S); blit(cv, sm, (S - sm.w) >> 1, (S - sm.h) >> 1);
    const nm = `ico.${names[cell]}`; add('uiskin', nm, cv, 'image'); q(nm, cv, `${id}.jpg 칸 ${cell + 1}`);
    for (const z of [64, 32]) await toSharp(cv).resize(z, z, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/icons/${z}/${names[cell]}.png`); } }

// ===== 5) 등급 프레임·S 장식·카드 뒷면·배너 (아틀라스 uiskin_gacha) =====
const PIP = { C: 1, B: 2, A: 3, S: 4 };
async function pips(im, r, band) { const c = EQUIP_RARITY_COLOR[r], n = PIP[r], d = Math.max(5, Math.round(band * 0.42)), gap = Math.round(d * 0.7), tot = n * 2 * d + (n - 1) * gap, y = im.h - Math.round(band / 2) - 1; const lt = '#' + mixRGB(hx(c), [255, 255, 255], 0.5).map((v) => clamp(v).toString(16).padStart(2, '0')).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${im.w}" height="${im.h}">${Array.from({ length: n }, (_, i) => { const x = (im.w - tot) / 2 + d + i * (2 * d + gap); return `<path d="M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z" fill="${lt}" stroke="#0A1226" stroke-width="2"/>`; }).join('')}</svg>`;
  return fromSharp(toSharp(im).composite([{ input: Buffer.from(svg) }])); }
if (has('frame_rank')) { let im = trim(await prep('frame_rank')); mirrorH(im); const F = 96 * M; im = await resize(im, F, F);
  // 테두리 두께(가운데 열 위에서 첫 투명 화소까지)
  let band = 0; while (band < F / 3 && im.data[(band * F + (F >> 1)) * 4 + 3] > 64) band++;
  const Ix = insetX(im, F >> 1) + 2; const sl = { l: Ix, r: Ix, t: Ix, b: Ix };
  add('uiskin_gacha', 'frame.rank.base', im, '9', sl); q('frame.rank.base', im, 'frame_rank.jpg', { border_px: band, slice_px_at_master: Ix });
  for (const r of ['C', 'B', 'A', 'S']) { const t = await pips(tint(im, EQUIP_RARITY_COLOR[r]), r, band); add('uiskin_gacha', `frame.rank.${r.toLowerCase()}`, t, '9', sl, { pips: PIP[r] }); q(`frame.rank.${r.toLowerCase()}`, t, 'frame_rank.jpg(재착색)', { color: EQUIP_RARITY_COLOR[r] }); }
  // S 장식: 모서리 4개 + 윗변 크레스트를 프레임 모서리에 맞춰 재배치
  if (has('frame_rank_s')) { let o = trim(await prep('frame_rank_s')); mirrorH(o); const ow = o.w, oh = o.h;
    // 연결 성분으로 큰 덩어리 5개(모서리 4 + 크레스트) 분리, 작은 조각은 가장 가까운 덩어리에 귀속
    const lab = new Int32Array(ow * oh).fill(-1); const cs = [];
    for (let s0 = 0; s0 < ow * oh; s0++) { if (lab[s0] >= 0 || o.data[s0 * 4 + 3] < 32) continue; const id = cs.length, pts = [s0]; lab[s0] = id; let sx = 0, sy = 0;
      for (let k = 0; k < pts.length; k++) { const i = pts[k], x = i % ow, y = (i / ow) | 0; sx += x; sy += y; for (const j of [x > 0 ? i - 1 : -1, x < ow - 1 ? i + 1 : -1, y > 0 ? i - ow : -1, y < oh - 1 ? i + ow : -1]) if (j >= 0 && lab[j] < 0 && o.data[j * 4 + 3] >= 32) { lab[j] = id; pts.push(j); } }
      cs.push({ pts, cx: sx / pts.length / ow, cy: sy / pts.length / oh }); }
    const big = cs.filter((c) => c.pts.length > ow * oh * 0.004); const pick = (f) => { const g = big.filter(f); if (!g.length) return null; const im2 = img(ow, oh); for (const c of g) for (const i of c.pts) o.data.copy(im2.data, i * 4, i * 4, i * 4 + 4); return trim(im2); };
    const tl = pick((c) => c.cx < 0.35 && c.cy < 0.5), crest = pick((c) => c.cx >= 0.35 && c.cx <= 0.65 && c.cy < 0.5), bl = pick((c) => c.cx < 0.35 && c.cy >= 0.5);
    const sc = (F * 1.0) / ow; const pad = Math.round(F * 0.22); const cv = img(F + 2 * pad, F + 2 * pad); const off = Math.round(F * 0.04);
    const place = async (p, fx, fy) => { if (!p) return; let q2 = await resize(p, p.w * sc, p.h * sc); if (fx) { q2 = clone(q2); const { w, h, data } = q2; for (let y = 0; y < h; y++) for (let x = 0; x < (w >> 1); x++) { const a = (y * w + x) * 4, b = (y * w + w - 1 - x) * 4; for (let k = 0; k < 4; k++) { const t2 = data[a + k]; data[a + k] = data[b + k]; data[b + k] = t2; } } }
      const x = fx ? pad + F + off - q2.w : pad - off, y = fy ? pad + F + off - q2.h : pad - off; blit(cv, q2, x, y); };
    await place(tl, false, false); await place(tl, true, false); await place(bl, false, true); await place(bl, true, true);
    if (crest) { const c2 = await resize(crest, crest.w * sc, crest.h * sc); blit(cv, c2, pad + ((F - c2.w) >> 1), pad - Math.round(c2.h * 0.62)); }
    const tr = trim(cv); const bb = bbox(cv); add('uiskin_gacha', 'frame.rank.s.ornament', tr, 'image', null, { anchor: { note: '프레임(frame.rank.s, 288px@3x) 좌상단 기준 오프셋', offsetX_px: bb.x - pad, offsetY_px: bb.y - pad } }); q('frame.rank.s.ornament', tr, 'frame_rank_s.jpg(모서리·크레스트 재배치)'); } }
if (has('card_back')) { let im = trim(await prep('card_back')); mirrorH(im); im = await resize(im, 120 * M, 120 * M * im.h / im.w); add('uiskin_gacha', 'card.back', im, 'image'); q('card.back', im, 'card_back.jpg'); }
for (const [id, name] of [['banner_victory', 'banner.victory'], ['banner_defeat', 'banner.defeat']]) { if (!has(id)) continue; let im = trim(await prep(id)); mirrorH(im); im = await resize(im, 480 * M, 480 * M * im.h / im.w); add('uiskin_gacha', name, im, 'image'); q(name, im, `${id}.jpg`); }

// ===== 6) 배경(JPG, 아틀라스 밖) =====
const BG = {}; for (const id of ['bg_title', 'bg_lobby', 'bg_gacha']) { if (!has(id)) continue; const nm = id.slice(3);
  for (const [w, hh, q2] of [[1920, 1080, 84], [1280, 720, 82]]) await sharp(`${RAW}/${id}.jpg`).resize(w, hh, { fit: 'cover', kernel: 'lanczos3' }).jpeg({ quality: q2, mozjpeg: true }).toFile(`${OUT}/bg/${nm}_${w}.jpg`);
  BG[nm] = { 1920: statSync(`${OUT}/bg/${nm}_1920.jpg`).size, 1280: statSync(`${OUT}/bg/${nm}_1280.jpg`).size }; }

// ---------- 조각 PNG + 아틀라스 ----------
for (const [k, f] of Object.entries(frames)) writeFileSync(`${OUT}/pieces/${k}.png`, await png(f.im));
async function atlas(name, scale, file) {
  const PADA = 4, MAXW = 2048; let x = PADA, y = PADA, rowH = 0; const comps = [], map = {};
  const items = await Promise.all(AT[name].map(async (k) => { const f = frames[k]; const im = scale === 1 ? f.im : await resize(f.im, f.im.w * scale, f.im.h * scale); return [k, f, im]; }));
  items.sort((a, b) => b[2].h - a[2].h || a[0].localeCompare(b[0]));
  for (const [k, f, im] of items) {
    if (x + im.w + PADA > MAXW) { x = PADA; y += rowH + PADA; rowH = 0; }
    comps.push({ input: await png(im), left: x, top: y });
    const sl = f.slice ? Object.fromEntries(Object.entries(f.slice).map(([a, v]) => [a, Math.round(v * scale)])) : null;
    const e = { frame: { x, y, w: im.w, h: im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: im.w, h: im.h }, sourceSize: { w: im.w, h: im.h }, slice: sl, sliceMode: f.mode };
    if (sl) e.scale9Borders = { x: sl.l, y: sl.t, w: im.w - sl.l - sl.r, h: im.h - sl.t - sl.b };
    if (f.anchor) e.anchor = Object.fromEntries(Object.entries(f.anchor).map(([a, v]) => [a, typeof v === 'number' ? Math.round(v * scale) : v]));
    if (f.pad) e.glowPad = Math.round(f.pad * scale); if (f.pips) e.pips = f.pips;
    map[k] = e; x += im.w + PADA; rowH = Math.max(rowH, im.h);
  }
  let W = 0; for (const c of comps) { const m = await sharp(c.input).metadata(); W = Math.max(W, c.left + m.width + PADA); } W = 2 ** Math.ceil(Math.log2(W)) > W && W > 1024 ? W : W; const H = y + rowH + PADA;
  if (H > 2048 || W > 2048) warn.push(`${file} 크기 ${W}x${H} > 2048`);
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toFile(`${OUT}/atlas/${file}.png`);
  writeFileSync(`${OUT}/atlas/${file}.json`, JSON.stringify({ frames: map, meta: { app: 'docker/gemini/pp_uiskin.mjs', image: `${file}.png`, format: 'RGBA8888', size: { w: W, h: H }, scale: String(scale * M), unitPx: scale * M, note: 'slice = nineslice left/right/top/bottom(px, 이 아틀라스 기준) — Phaser 는 frame.customData.slice 로 보존. scale9Borders 는 Phaser 3.70+ 자동 9-slice 용. sliceMode 3h = 가로만 늘림(top/bottom 0, 높이는 균일 스케일). anchor·glowPad·pips 는 px(이 아틀라스 기준)' } }, null, 1));
  return { W, H, bytes: statSync(`${OUT}/atlas/${file}.png`).size };
}
const AINFO = {}; for (const n of ['uiskin', 'uiskin_gacha']) { const base = n === 'uiskin' ? 'ui_skin' : 'ui_skin_gacha'; AINFO[n] = { '3x': await atlas(n, 1, `${base}@3x`), '1.5x': await atlas(n, 0.5, `${base}@1.5x`), base }; }

// ---------- QA 패널 ----------
async function nine(f, dispW, dispH, pxPerUnit = 1.5) {
  const s = pxPerUnit / M; const { im } = f; const sl = f.slice;
  if (!sl) return resize(im, dispW, dispH);
  if (f.mode === '3h') { const sc = dispH / im.h; const tw = Math.max(sl.l + sl.r + 1, Math.round(dispW / sc)); const mid = crop(im, sl.l, 0, im.w - sl.l - sl.r, im.h); return resize(hcat([crop(im, 0, 0, sl.l, im.h), await resize(mid, tw - sl.l - sl.r, im.h), crop(im, im.w - sl.r, 0, sl.r, im.h)]), dispW, dispH); }
  const tw = Math.max(sl.l + sl.r + 1, Math.round(dispW / s)), th = Math.max(sl.t + sl.b + 1, Math.round(dispH / s)); const cw = im.w - sl.l - sl.r, ch = im.h - sl.t - sl.b; const rows = [];
  for (const [y0, hh, th2] of [[0, sl.t, sl.t], [sl.t, ch, th - sl.t - sl.b], [im.h - sl.b, sl.b, sl.b]]) { const parts = []; for (const [x0, ww, tw2] of [[0, sl.l, sl.l], [sl.l, cw, tw - sl.l - sl.r], [im.w - sl.r, sl.r, sl.r]]) parts.push(await resize(crop(im, x0, y0, ww, hh), tw2, th2)); rows.push(hcat(parts)); }
  return resize(vcat(rows), dispW, dispH);
}
const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (w, h, t, color, size = 15, anchor = 'middle') => sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><text x="${anchor === 'middle' ? '50%' : '4'}" y="52%" dominant-baseline="middle" text-anchor="${anchor}" font-family="DejaVu Sans, sans-serif" font-weight="700" font-size="${size}" fill="${color}" stroke="#0A1226" stroke-width="${color === '#1A1406' ? 0 : 2}" paint-order="stroke">${esc(t)}</text></svg>`)).png().toBuffer();
function board() { const comps = []; let Y = 12; const W = 1600; return { comps, get Y() { return Y; }, set Y(v) { Y = v; }, W,
  put: async (im, x, y) => { if (!im) return; comps.push({ input: Buffer.isBuffer(im) ? im : await png(im), left: Math.round(x), top: Math.round(y) }); },
  async title(t) { await this.put(await label(W, 26, t, '#F3DC8E', 17), 0, Y); Y += 30; },
  async save(file, bg = { r: 11, g: 19, b: 40, alpha: 1 }) { await sharp({ create: { width: W, height: Y + 12, channels: 4, background: bg } }).composite(comps).png().toFile(`${OUT}/preview/${file}`); } }; }
const F = (n) => frames[n];
const zoom = async (f, cx, cy, sz, bg, k = 3) => { const c = crop(f.im, Math.max(0, Math.min(cx, f.im.w - sz)), Math.max(0, Math.min(cy, f.im.h - sz)), Math.min(sz, f.im.w), Math.min(sz, f.im.h)); const base = await sharp({ create: { width: c.w, height: c.h, channels: 4, background: bg } }).composite([{ input: await png(c) }]).png().toBuffer(); return sharp(base).resize(c.w * k, c.h * k, { kernel: 'nearest' }).png().toBuffer(); };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }, NAVY = { r: 11, g: 19, b: 40, alpha: 1 };

// 패널 1: 버튼·탭·원형
{ const B = board();
  await B.title('1) Buttons md 44u (1080p px x1.5): normal / hover / pressed / disabled  (disabled label #D5D9E2 + outline)');
  for (const v of ['primary', 'secondary', 'danger']) { let x = 30; for (const s of ['normal', 'hover', 'pressed', 'disabled']) { const w = 300, h = 66; if (s === 'hover') await B.put(await nine(F('btn.glow'), w + 48, h + 48), x - 24, B.Y - 24);
    await B.put(await nine(F(`btn.${v}.${s}`), w, h), x, B.Y + (s === 'pressed' ? 2 : 0)); await B.put(await label(w, h, `${v} ${s}`, s === 'disabled' ? '#D5D9E2' : v === 'primary' ? '#1A1406' : '#F4EEDC', 16), x, B.Y + (s === 'pressed' ? 2 : 0)); x += w + 70; } B.Y += 66 + 18; }
  if (F('btn.primary.sm.normal')) { await B.title('2) sm 32u thin buttons (48px) + stretch 60u..300u / md vs sm side by side');
    for (const v of ['primary', 'secondary', 'danger']) { let x = 30; for (const s of ['normal', 'hover', 'pressed', 'disabled']) { await B.put(await nine(F(`btn.${v}.sm.${s}`), 180, 48), x, B.Y); await B.put(await label(180, 48, `${v.slice(0, 3)} ${s}`, s === 'disabled' ? '#D5D9E2' : v === 'primary' ? '#1A1406' : '#F4EEDC', 13), x, B.Y); x += 196; }
      await B.put(await nine(F(`btn.${v}.sm.normal`), 90, 48), x + 10, B.Y); await B.put(await nine(F(`btn.${v}.sm.normal`), 450, 48), x + 120, B.Y); B.Y += 60; } }
  if (F('btn.icon.round.normal')) { await B.title('3) Round icon button 44u/56u x 4 states (+glow) with ico.* placeholder'); let x = 30; for (const sz of [66, 84]) for (const s of ['normal', 'hover', 'pressed', 'disabled']) { if (s === 'hover') await B.put(await resize(F('btn.icon.round.glow').im, sz * F('btn.icon.round.glow').im.w / F('btn.icon.round.normal').im.w, sz * F('btn.icon.round.glow').im.h / F('btn.icon.round.normal').im.w), x - sz * 6 * M / F('btn.icon.round.normal').im.w, B.Y - sz * 6 * M / F('btn.icon.round.normal').im.w);
      await B.put(await resize(F(`btn.icon.round.${s}`).im, sz, sz * F('btn.icon.round.normal').im.h / F('btn.icon.round.normal').im.w), x, B.Y); if (F('ico.close')) { const isz = Math.round(sz * 0.6); await B.put(await resize(F(s === 'disabled' ? 'ico.lock' : 'ico.close').im, isz, isz), x + (sz - isz) / 2, B.Y + (sz - isz) / 2 - sz * 0.03); } x += sz + 40; } B.Y += 100; }
  if (F('tab.on')) { await B.title('4) Bottom tab bar: 104x70 (desktop) / 74x56 (390px phone) - corner motif must not squash');
    for (const [bw, bh] of [[104, 70], [74, 56]]) { const gem = F('tab.gem'); const k = bh / F('tab.on').im.h; const gD = await resize(gem.im, gem.im.w * k, gem.im.h * k); let x = 30;
      for (let i = 0; i < 6; i++) { const on = i === 1; await B.put(await nine(F(on ? 'tab.on' : 'tab.off'), bw, bh), x, B.Y + (on ? -3 : 0)); if (F('ico.quest')) { const isz = Math.round(bh * 0.42); await B.put(await resize(F(['ico.quest', 'ico.inventory', 'ico.shop', 'ico.mail', 'ico.notice', 'ico.log'][i]).im, isz, isz), x + (bw - isz) / 2, B.Y + 6 + (on ? -3 : 0)); }
        await B.put(await label(bw, 20, ['STAGE', 'HERO', 'ROOM', 'PARTY', 'GACHA', 'MORE'][i], on ? '#FFF6D8' : '#A9B4CF', bw < 90 ? 10 : 12), x, B.Y + bh - 24 + (on ? -3 : 0)); if (on) await B.put(gD, x + (bw - gD.w) / 2, B.Y - 3 + Math.round(gem.anchor.offsetY_px * k));
        if (i === 3 && F('badge.dot')) await B.put(await resize(F('badge.dot').im, 18, 18), x + bw - 16, B.Y - 4); x += bw + 4; } B.Y += bh + 22; } }
  await B.title('5) Edge zoom x3 (white / navy): primary end, sm end, round, tab.on corner');
  { let x = 20; for (const [n, cx, cy] of [['btn.primary.normal', 0, 0], ['btn.primary.sm.normal', 0, 0], ['btn.icon.round.normal', 0, 0], ['tab.on', 0, 0]]) { if (!F(n)) continue; for (const bg of [WHITE, NAVY]) { await B.put(await zoom(F(n), cx, cy, 64, bg), x, B.Y); x += 200; } } B.Y += 200; }
  await B.save('qa_1_buttons_tabs.png'); }

// 패널 2: 패널·리본·행·입력·토스트·대사 창
{ const B = board();
  await B.title('6) panel.main / panel.sub / panel.hud 9-slice: small / wide / tall (1080p px)');
  for (const n of ['panel.main', 'panel.sub', 'panel.hud']) { if (!F(n)) continue; let x = 30; for (const [w, h] of [[150, 110], [420, 150], [150, 260], [90, 90]]) { if (n === 'panel.hud') await B.put(await sharp({ create: { width: w, height: h, channels: 4, background: { r: 70, g: 110, b: 60, alpha: 1 } } }).png().toBuffer(), x, B.Y); await B.put(await nine(F(n), w, h), x, B.Y); x += w + 24; }
    await B.put(await label(260, 30, n, '#A9B4CF', 14, 'start'), x, B.Y); B.Y += 280; }
  await B.title('7) header.ribbon / row.list (normal/hover/selected/disabled) / input.field (normal/focus/error) / toast.pill');
  if (F('header.ribbon')) { await B.put(await nine(F('header.ribbon'), 420, 66), 30, B.Y); await B.put(await label(420, 66, 'HERO INFO', '#F4EEDC', 22), 30, B.Y); await B.put(await nine(F('header.ribbon'), 220, 50), 480, B.Y + 8); B.Y += 80; }
  if (F('row.list.normal')) { let x = 30; for (const s of ['normal', 'hover', 'selected', 'disabled']) { await B.put(await nine(F(`row.list.${s}`), 360, 96), x, B.Y); await B.put(await label(360, 96, `row ${s}`, s === 'disabled' ? '#D5D9E2' : '#F4EEDC', 15), x, B.Y); x += 380; } B.Y += 110; }
  if (F('input.field.normal')) { let x = 30; for (const s of ['normal', 'focus', 'error']) { await B.put(await nine(F(`input.field.${s}`), 360, 66), x, B.Y); await B.put(await label(360, 66, `input ${s}`, '#A9B4CF', 15), x, B.Y); x += 380; } }
  if (F('toast.pill')) await B.put(await nine(F('toast.pill'), 360, 60), 1170, B.Y);
  B.Y += 84;
  if (F('dialog.box')) { await B.title('8) dialog.box (9) + dialog.nameplate (3h) at 1280x200 / 600x150');
    await B.put(await nine(F('dialog.box'), 1100, 190), 30, B.Y + 30); if (F('dialog.nameplate')) { await B.put(await nine(F('dialog.nameplate'), 220, 54), 60, B.Y); await B.put(await label(220, 54, 'NAME', '#F4EEDC', 18), 60, B.Y); }
    await B.put(await nine(F('dialog.box'), 380, 150), 1170, B.Y + 30); B.Y += 240; }
  await B.title('9) Edge zoom x3: panel.sub corner / panel.hud corner / dialog corner / ribbon end / row end');
  { let x = 20; for (const n of ['panel.sub', 'panel.hud', 'dialog.box', 'header.ribbon', 'row.list.normal']) { if (!F(n)) continue; for (const bg of [WHITE, NAVY]) { await B.put(await zoom(F(n), 0, 0, 52, bg), x, B.Y); x += 160; } } B.Y += 160; }
  await B.save('qa_2_panels.png'); }

// 패널 3: 상단바·재화·게이지·배지·아이콘
{ const B = board();
  if (F('topbar.strip')) { await B.title('10) topbar.strip full width 1600x96 + currency.capsule (ico + number + plus round button) + badges');
    await B.put(await nine(F('topbar.strip'), 1600, 96), 0, B.Y); let x = 900; for (const [ic, val] of [['ico.shard', '12,480'], ['ico.ticket', '35']]) { if (!F('currency.capsule')) break; await B.put(await nine(F('currency.capsule'), 250, 54), x, B.Y + 18); if (F(ic)) await B.put(await resize(F(ic).im, 44, 44), x + 6, B.Y + 23);
      await B.put(await label(150, 54, val, '#F4EEDC', 20), x + 50, B.Y + 18); if (F('btn.icon.round.normal')) { await B.put(await resize(F('btn.icon.round.normal').im, 44, 44 * F('btn.icon.round.normal').im.h / F('btn.icon.round.normal').im.w), x + 200, B.Y + 22); if (F('ico.plus')) await B.put(await resize(F('ico.plus').im, 26, 26), x + 209, B.Y + 30); } x += 280; }
    if (F('btn.icon.round.normal')) { await B.put(await resize(F('btn.icon.round.normal').im, 60, 60 * F('btn.icon.round.normal').im.h / F('btn.icon.round.normal').im.w), 30, B.Y + 16); if (F('ico.mail')) await B.put(await resize(F('ico.mail').im, 36, 36), 42, B.Y + 26); if (F('badge.dot')) await B.put(await resize(F('badge.dot').im, 18, 18), 78, B.Y + 12);
      if (F('badge.pill')) { await B.put(await nine(F('badge.pill'), 44, 30), 140, B.Y + 10); await B.put(await label(44, 30, '99+', '#FFFFFF', 12), 140, B.Y + 10); } }
    B.Y += 120; }
  if (F('bar.track')) { await B.title('11) Gauges: hud 14u(21px) / card 8u(12px) / map 4u(6px), fill 100/62/25/8%');
    const names = Object.keys(BAR_COLORS); let yy = B.Y; for (const [hU, w] of [[14, 420], [8, 260], [4, 120]]) { const th = Math.round(hU * 1.5); let x = 30; for (const [i, pct] of [[0, 1], [1, 0.62], [2, 0.25], [3, 0.08], [4, 0.75], [5, 0.5]]) { await B.put(await nine(F('bar.track'), w, th), x, yy); const ih = Math.max(2, Math.round(th * 10 / 14)); const iw = Math.max(Math.round(ih * 1.2), Math.round((w - (th - ih)) * pct)); await B.put(await nine(F(`bar.fill.${names[i]}`), iw, ih), x + Math.round((th - ih) / 2), yy + Math.round((th - ih) / 2)); x += w + 20; if (x > 1400) break; } yy += th + 16; } B.Y = yy + 10; }
  if (F('ico.back')) { await B.title('12) Icons 24 (ico.*) at 64 / 32 px (LINEAR pre-scaled) on navy, and 108 master on white');
    const all = [...ICON_NAMES.icons_a, ...ICON_NAMES.icons_b].filter((n) => F(`ico.${n}`)); let x = 20; for (const n of all) { await B.put(await resize(F(`ico.${n}`).im, 56, 56), x, B.Y); await B.put(await resize(F(`ico.${n}`).im, 28, 28), x + 14, B.Y + 62); x += 64; } B.Y += 100;
    x = 20; for (const n of all.slice(0, 12)) { await B.put(await sharp({ create: { width: 116, height: 116, channels: 4, background: WHITE } }).composite([{ input: await png(F(`ico.${n}`).im), left: 4, top: 4 }]).png().toBuffer(), x, B.Y); x += 124; } B.Y += 124;
    x = 20; for (const n of all.slice(12)) { await B.put(await sharp({ create: { width: 116, height: 116, channels: 4, background: WHITE } }).composite([{ input: await png(F(`ico.${n}`).im), left: 4, top: 4 }]).png().toBuffer(), x, B.Y); x += 124; } B.Y += 124;
    await B.put(await label(1560, 22, all.join(' / '), '#A9B4CF', 11, 'start'), 20, B.Y); B.Y += 26; }
  await B.save('qa_3_hud_icons.png'); }

// 패널 4: 등급 프레임·카드·배너 + 배경 썸네일
{ const B = board();
  if (F('frame.rank.c')) { await B.title('13) frame.rank C/B/A/S (+S ornament) at 96/72/56u -> 144/108/84px, over a portrait-colored placeholder');
    let x = 30; for (const sz of [144, 108, 84]) { for (const r of ['c', 'b', 'a', 's']) { await B.put(await sharp({ create: { width: sz - 8, height: sz - 8, channels: 4, background: { r: 120, g: 98, b: 80, alpha: 1 } } }).png().toBuffer(), x + 4, B.Y + 34 + 4); await B.put(await resize(F(`frame.rank.${r}`).im, sz, sz), x, B.Y + 34);
      if (r === 's' && F('frame.rank.s.ornament')) { const o = F('frame.rank.s.ornament'), k = sz / F('frame.rank.s').im.w; await B.put(await resize(o.im, o.im.w * k, o.im.h * k), x + o.anchor.offsetX_px * k, B.Y + 34 + o.anchor.offsetY_px * k); } x += sz + 26; } x += 20; } B.Y += 34 + 150 + 20; }
  if (F('card.back')) { await B.title('14) card.back 120x180u (180x270px) / 80u, banner.victory / banner.defeat 480u (720px) / 300u');
    await B.put(await resize(F('card.back').im, 180, 180 * F('card.back').im.h / F('card.back').im.w), 30, B.Y); await B.put(await resize(F('card.back').im, 120, 120 * F('card.back').im.h / F('card.back').im.w), 230, B.Y);
    let yy = B.Y; for (const n of ['banner.victory', 'banner.defeat']) { if (!F(n)) continue; const im = F(n).im; await B.put(await resize(im, 720, 720 * im.h / im.w), 380, yy); await B.put(await resize(im, 300, 300 * im.h / im.w), 1140, yy); await B.put(await label(720, Math.round(720 * im.h / im.w), n === 'banner.victory' ? '승리' : '패배', n === 'banner.victory' ? '#1A1406' : '#F4EEDC', 40), 380, yy); yy += Math.round(720 * im.h / im.w) + 10; }
    B.Y = Math.max(B.Y + 280, yy) + 10; }
  await B.title('15) Edge zoom x3 (white / navy): frame.rank.a corner, S ornament, card.back corner, banner.victory end');
  { let x = 20; for (const [n, cx, cy] of [['frame.rank.a', 0, 0], ['frame.rank.s.ornament', 0, 0], ['card.back', 0, 0], ['banner.victory', 0, 40], ['banner.defeat', 0, 40]]) { if (!F(n)) continue; for (const bg of [WHITE, NAVY]) { await B.put(await zoom(F(n), cx, cy, 52, bg), x, B.Y); x += 160; } } B.Y += 160; }
  const bgs = Object.keys(BG); if (bgs.length) { await B.title('16) Backgrounds (1280 jpg) with placeholder title text / UI overlay'); let x = 20; for (const n of bgs) { const t = await sharp(`${OUT}/bg/${n}_1280.jpg`).resize(512, 288).toBuffer(); await B.put(t, x, B.Y); if (n === 'title') if (existsSync('public/assets/brand/logo_h@1.5x.png')) { const lg = await sharp('public/assets/brand/logo_h@1.5x.png').resize({ width: 300 }).png().toBuffer(); await B.put(lg, x + 106, B.Y + 30); } else await B.put(await label(512, 80, 'TITLE (FE text)', '#F3DC8E', 36), x, B.Y + 40); if (n !== 'title' && F('panel.main')) await B.put(await nine(F('panel.main'), 220, 150), x + 146, B.Y + 70); x += 524; } B.Y += 300; }
  await B.save('qa_4_gacha_bg.png'); }

// ---------- 지표·manifest 조각 ----------
const bad = Object.entries(qa).filter(([k, v]) => k !== 'frame.rank.a' && (v.magenta_px > 0 || v.purple_ratio > 0.005)).map(([k, v]) => `${k}: magenta ${v.magenta_px}, purple ${v.purple_ratio}`);
const rel = (p) => p.replace(/^public\//, '');
const atlasItem = (n, key, use) => ({ key, textureKey: n, type: 'atlas', unitPx: 3, use, alpha: true, filter: 'LINEAR',
  path: rel(`${OUT}/atlas/${AINFO[n].base}@3x.png`), json: rel(`${OUT}/atlas/${AINFO[n].base}@3x.json`), size: [AINFO[n]['3x'].W, AINFO[n]['3x'].H], bytes: AINFO[n]['3x'].bytes,
  variants: { '1.5x': { unitPx: 1.5, path: rel(`${OUT}/atlas/${AINFO[n].base}@1.5x.png`), json: rel(`${OUT}/atlas/${AINFO[n].base}@1.5x.json`), size: [AINFO[n]['1.5x'].W, AINFO[n]['1.5x'].H], bytes: AINFO[n]['1.5x'].bytes } },
  frames: Object.fromEntries(AT[n].map((k) => { const f = frames[k]; return [k, { size: [f.im.w, f.im.h], slice: f.slice, sliceMode: f.mode, ...(f.anchor ? { anchor: f.anchor } : {}), ...(f.pad ? { glowPad: f.pad } : {}), ...(f.pips ? { pips: f.pips } : {}) }]; })),
  generator: { model: 'gemini-nano-banana-2.1(Interactions API, 2K)', script: 'docker/gemini/gen.mjs uiskin (RAW_DIR=public/assets/ui_skin/raw) + docker/gemini/pp_uiskin.mjs', derived: 'hover/pressed/disabled/danger/glow/selected/focus/error/C~S 재착색/bar 색은 pp_uiskin.mjs 가 결정적으로 파생(추가 호출 없음)' },
  prompt_ref: 'docker/gemini/style_guide.mjs UISKIN_PROD (+ UISKIN_TRIAL btn_primary·btn_secondary·panel raw 재사용)', license: 'Google Gemini API 생성물(SynthID 워터마크 포함) — 상업 이용 약관 사람 확인 필요', provenance: rel(`${RAW}/*.jpg`), qa: { auto: Object.fromEntries(Object.entries(qa).filter(([k]) => AT[n].some((f) => f === k || f.startsWith(k + '.')))) }, verify: false });
const frag = { _note: 'UI 스킨 본 생산 manifest 조각(ui_skin). 본 manifest.json 에 병합하지 않음(팀장 확인 후 병합). 텍스처 키는 ui./icon./deco. 접두를 피함(로더 skip·NEAREST 강제 회피). 로딩: Phaser load.atlas(textureKey, png, json) — 해상도 u>=2 이면 @3x, 그 외 @1.5x',
  generatedAt: new Date().toISOString(), basePath: 'public',
  items: [atlasItem('uiskin', 'atlas.uiskin', '공용(버튼·탭·패널·HUD·입력·토스트·대사·게이지·배지·아이콘) — 부팅 시 1회 로드'), atlasItem('uiskin_gacha', 'atlas.uiskin_gacha', '가챠·결과·영웅 목록(등급 프레임·카드 뒷면·승패 배너) — 해당 화면 진입 시 로드'),
    ...Object.keys(BG).map((n) => ({ key: `bg.screen.${n}`, type: 'bg', path: rel(`${OUT}/bg/${n}_1920.jpg`), size: [1920, 1080], bytes: BG[n][1920], variants: { 1280: { path: rel(`${OUT}/bg/${n}_1280.jpg`), size: [1280, 720], bytes: BG[n][1280] } }, alpha: false, filter: 'LINEAR', load: n === 'title' ? '타이틀 씬 preload' : '해당 화면 진입 시', note: '글자 없음. 제목은 FE 텍스트(글꼴 라이선스 별도 확인)', generator: { model: 'gemini-nano-banana-2.1', size: '2K', script: 'gen.mjs uiskin + pp_uiskin.mjs(cover 크롭·mozjpeg)' }, prompt_ref: `style_guide.mjs UISKIN_PROD bg_${n}`, license: 'Google Gemini API 생성물 — 상업 이용 약관 사람 확인 필요', verify: false })),
    { key: 'icons.ui.extra', type: 'icon-set', note: '아틀라스 uiskin 의 ico.<name> 과 같은 그림의 개별 PNG(LINEAR 미리 축소). 텍스처 키에 icon. 접두를 쓰면 NEAREST 가 강제되므로 FE 에서 키 이름 주의', path64: rel(`${OUT}/icons/64/<name>.png`), path32: rel(`${OUT}/icons/32/<name>.png`), names: [...ICON_NAMES.icons_a, ...ICON_NAMES.icons_b] },
  ], warnings: warn, auto_flags: bad };
writeFileSync(`${OUT}/manifest_fragment.json`, JSON.stringify(frag, null, 1));
console.log(JSON.stringify({ atlas: AINFO, frames: Object.keys(frames).length, warn, bad, qa: Object.fromEntries(Object.entries(qa).map(([k, v]) => [k, [v.magenta_px, v.pink_edge_px, v.purple_ratio, v.slice_px_at_master ?? '', v.disabled_label_contrast ?? '', v.inset_unit ?? '', v.corner_ratio_at_74x56 ?? '']])) }));
