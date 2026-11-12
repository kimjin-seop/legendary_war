// UI 스킨 보조 아틀라스(추가 아이콘: 하단 탭 6종 + 금화 2종). raw/icons_c.jpg(4x2) → 마젠타 키 → 칸 분할 → 108px@3x 마스터(pp_uiskin.mjs 아이콘 규칙과 동일)
// → atlas/ui_skin_extra@3x·@1.5x(.png/.json) + icons/{64,32}/<name>.png + preview/qa_extra_icons.png + manifest_fragment_extra.json. 기존 아틀라스·manifest 는 건드리지 않음.
// 실행(컨테이너, API 호출 없음):
//   docker run --rm -v "<프로젝트>":/app -w /app node:22 sh -c "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp_uiskin_extra.mjs public/assets/ui_skin"
// 의존: sharp 0.33.5(Apache-2.0, libvips LGPL-3.0). 키·침식·잡티·아이콘 배치 함수는 pp_uiskin.mjs 와 같은 로직을 복사(그 파일은 최상위 실행이라 import 불가).
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, statSync } from 'node:fs';
import { UISKIN_EXTRA_NAMES } from './style_guide.mjs';

const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const OUT = process.argv[2] ?? 'public/assets/ui_skin';
const SRC = 'icons_c';
['atlas', 'preview', 'icons/64', 'icons/32'].forEach((d) => mkdirSync(`${OUT}/${d}`, { recursive: true }));
const img = (w, h) => ({ w, h, data: Buffer.alloc(w * h * 4) });
const toSharp = (im) => sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } });
async function fromSharp(s) { const { data, info } = await s.ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
const png = (im) => toSharp(im).png({ compressionLevel: 9 }).toBuffer();
async function resize(im, w, h) { return fromSharp(toSharp(im).resize(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)), { kernel: 'lanczos3', fit: 'fill' })); }
function crop(im, x, y, w, h) { const o = img(w, h); for (let j = 0; j < h; j++) im.data.copy(o.data, j * w * 4, ((y + j) * im.w + x) * 4, ((y + j) * im.w + x + w) * 4); return o; }
function blit(dst, src, x0, y0) { for (let y = 0; y < src.h; y++) for (let x = 0; x < src.w; x++) { const X = x + x0, Y = y + y0; if (X < 0 || Y < 0 || X >= dst.w || Y >= dst.h) continue; const s = (y * src.w + x) * 4, d = (Y * dst.w + X) * 4, a = src.data[s + 3] / 255; if (!a) continue; const da = dst.data[d + 3] / 255, oa = a + da * (1 - a); for (let k = 0; k < 3; k++) dst.data[d + k] = Math.round((src.data[s + k] * a + dst.data[d + k] * da * (1 - a)) / oa); dst.data[d + 3] = Math.round(oa * 255); } }
function keyMagenta(im, grow = 3) {
  const { data, w, h } = im, N = w * h; const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < grow; it++) { const add = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if ((x > 0 && strict[i - 1]) || (x < w - 1 && strict[i + 1]) || (y > 0 && strict[i - w]) || (y < h - 1 && strict[i + w])) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) { if (strict[i]) { data.fill(0, i * 4, i * 4 + 4); continue; } const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const spill = Math.max(0, Math.min(r, b) - g - 25); if (spill > 0) { data[i * 4] = r - spill; data[i * 4 + 2] = b - spill; } }
  return im;
}
function erode(im) { const { w, h, data } = im; const kill = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (!data[i * 4 + 3]) continue; if (x === 0 || y === 0 || x === w - 1 || y === h - 1 || !data[(i - 1) * 4 + 3] || !data[(i + 1) * 4 + 3] || !data[(i - w) * 4 + 3] || !data[(i + w) * 4 + 3]) kill.push(i); } for (const i of kill) data[i * 4 + 3] = 0; return im; }
function bbox(im, thr = 64) { let a = im.w, b = im.h, c = -1, d = -1; for (let y = 0; y < im.h; y++) for (let x = 0; x < im.w; x++) if (im.data[(y * im.w + x) * 4 + 3] >= thr) { if (x < a) a = x; if (x > c) c = x; if (y < b) b = y; if (y > d) d = y; } return c < 0 ? null : { x: a, y: b, w: c - a + 1, h: d - b + 1 }; }
function metrics(im) {
  let opaque = 0, magenta = 0, purple = 0, pinkEdge = 0; const { w, h, data } = im;
  for (let i = 0; i < w * h; i++) { const a = data[i * 4 + 3]; if (!a) continue; const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    if (a < 255 && r - g > 40 && b - g > 40) pinkEdge++; if (a < 128) continue; opaque++; if (r - g > 60 && b - g > 60) magenta++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d > 40 && mx > 60) { let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; if (hue >= 255 && hue <= 330) purple++; } }
  return { opaque, magenta_px: magenta, pink_edge_px: pinkEdge, purple_ratio: +(purple / Math.max(1, opaque)).toFixed(4) };
}

// ---- 분할(4열 x 2행) ----
const raw = keyMagenta(await fromSharp(sharp(`${OUT}/raw/${SRC}.jpg`))); erode(raw);
const COLS = 4, ROWS = 2, cw = raw.w / COLS, ch = raw.h / ROWS; const { w, h, data } = raw;
const lab = new Int32Array(w * h).fill(-1); const comps = [];
for (let s = 0; s < w * h; s++) { if (lab[s] >= 0 || data[s * 4 + 3] < 64) continue; const id = comps.length; const pts = [s]; lab[s] = id; let sx = 0, sy = 0;
  for (let k = 0; k < pts.length; k++) { const i = pts[k], x = i % w, y = (i / w) | 0; sx += x; sy += y; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && lab[j] < 0 && data[j * 4 + 3] >= 64) { lab[j] = id; pts.push(j); } }
  comps.push({ n: pts.length, cx: sx / pts.length, cy: sy / pts.length, pts }); }
const frames = {}, qa = {}, warn = [];
for (let cell = 0; cell < UISKIN_EXTRA_NAMES.length; cell++) { const c = cell % COLS, r = (cell / COLS) | 0;
  const mine = comps.filter((p) => p.n > 300 && Math.floor(p.cx / cw) === c && Math.floor(p.cy / ch) === r);
  if (!mine.length) { warn.push(`칸 ${cell} 비어 있음`); continue; }
  const o = img(w, h); for (const p of mine) for (const i of p.pts) data.copy(o.data, i * 4, i * 4, i * 4 + 4);
  const bb = bbox(o, 1); const x0 = Math.max(0, bb.x - 3), y0 = Math.max(0, bb.y - 3), x1 = Math.min(w, bb.x + bb.w + 3), y1 = Math.min(h, bb.y + bb.h + 3);
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const i = y * w + x; if (data[i * 4 + 3] < 64 && data[i * 4 + 3] > 0) data.copy(o.data, i * 4, i * 4, i * 4 + 4); }
  const ic = crop(o, x0, y0, x1 - x0, y1 - y0); const S = 108, pad = 4, s = Math.min((S - pad * 2) / ic.w, (S - pad * 2) / ic.h); const sm = await resize(ic, ic.w * s, ic.h * s); const cv = img(S, S); blit(cv, sm, (S - sm.w) >> 1, (S - sm.h) >> 1);
  const name = UISKIN_EXTRA_NAMES[cell]; frames[`ico.${name}`] = cv; qa[`ico.${name}`] = { src: `${SRC}.jpg 칸 ${cell + 1}`, components: mine.length, ...metrics(cv), master: [S, S] };
  for (const z of [64, 32]) await toSharp(cv).resize(z, z, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/icons/${z}/${name}.png`); }

// ---- 아틀라스(@3x = 마스터, @1.5x = 0.5배), 형식은 ui_skin@*.json 과 동일 ----
async function atlas(scale, file) {
  const PADA = 4; let x = PADA; const comps2 = [], map = {}; let H = 0;
  for (const [k, im0] of Object.entries(frames)) { const im = scale === 1 ? im0 : await resize(im0, im0.w * scale, im0.h * scale);
    comps2.push({ input: await png(im), left: x, top: PADA });
    map[k] = { frame: { x, y: PADA, w: im.w, h: im.h }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: im.w, h: im.h }, sourceSize: { w: im.w, h: im.h }, slice: null, sliceMode: 'image' };
    x += im.w + PADA; H = Math.max(H, im.h + 2 * PADA); }
  const W = x;
  await sharp({ create: { width: W, height: H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps2).png({ compressionLevel: 9 }).toFile(`${OUT}/atlas/${file}.png`);
  writeFileSync(`${OUT}/atlas/${file}.json`, JSON.stringify({ frames: map, meta: { app: 'docker/gemini/pp_uiskin_extra.mjs', image: `${file}.png`, format: 'RGBA8888', size: { w: W, h: H }, scale: String(scale * 3), unitPx: scale * 3, note: '보조 아틀라스(ui_skin 과 같은 단위 규칙: 아이콘 36unit = 108px@3x / 54px@1.5x). 기존 ui_skin 아틀라스와 별도 텍스처로 로드하거나 FE 에서 병합' } }, null, 1));
  return { W, H, bytes: statSync(`${OUT}/atlas/${file}.png`).size };
}
const A3 = await atlas(1, 'ui_skin_extra@3x'), A15 = await atlas(0.5, 'ui_skin_extra@1.5x');

// ---- QA 패널: 남색 위 64/32px, 흰 바탕 108 마스터, 기존 ico.shard·ticket 과 나란히 ----
const names = Object.keys(frames); const ref = ['shard', 'ticket', 'inventory'];
const PW = 40 + (names.length + ref.length) * 120, PH = 330; const bg = { r: 16, g: 28, b: 58, alpha: 1 };
const layers = []; let x = 20;
for (const n of [...names.map((k) => ['new', k]), ...ref.map((r) => ['ref', r])]) {
  const src = n[0] === 'new' ? await png(frames[n[1]]) : `${OUT}/icons/64/${n[1]}.png`;
  layers.push({ input: await sharp(src).resize(64, 64, { kernel: 'lanczos3' }).png().toBuffer(), left: x + 28, top: 20 });
  layers.push({ input: await sharp(src).resize(32, 32, { kernel: 'lanczos3' }).png().toBuffer(), left: x + 44, top: 96 });
  layers.push({ input: await sharp({ create: { width: 112, height: 112, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 1 } } }).composite([{ input: await sharp(src).resize(108, 108, { kernel: 'lanczos3' }).png().toBuffer(), left: 2, top: 2 }]).png().toBuffer(), left: x, top: 150 });
  x += 120; }
await sharp({ create: { width: PW, height: PH, channels: 4, background: bg } }).composite(layers).png().toFile(`${OUT}/preview/qa_extra_icons.png`);

// ---- manifest 조각 ----
const rel = (p) => p.replace(/^public\//, '');
const frag = { _note: 'UI 스킨 보조 아틀라스 manifest 조각(추가 아이콘 8프레임). 기존 manifest_fragment.json·ui_skin@*.json 은 수정하지 않음. 텍스처 키 uiskin_extra(icon./ui. 접두 회피). 로딩: Phaser load.atlas — 해상도 u>=2 이면 @3x, 그 외 @1.5x',
  generatedAt: new Date().toISOString(), basePath: 'public',
  items: [{ key: 'atlas.uiskin_extra', textureKey: 'uiskin_extra', type: 'atlas', unitPx: 3, use: '하단 탭 아이콘 6종 + 금화(gold, 대안 gold_stack) — 부팅 Preload 에서 uiskin 과 함께 1회 로드', alpha: true, filter: 'LINEAR',
    path: rel(`${OUT}/atlas/ui_skin_extra@3x.png`), json: rel(`${OUT}/atlas/ui_skin_extra@3x.json`), size: [A3.W, A3.H], bytes: A3.bytes,
    variants: { '1.5x': { unitPx: 1.5, path: rel(`${OUT}/atlas/ui_skin_extra@1.5x.png`), json: rel(`${OUT}/atlas/ui_skin_extra@1.5x.json`), size: [A15.W, A15.H], bytes: A15.bytes } },
    frames: Object.fromEntries(names.map((k) => [k, { size: [108, 108], slice: null, sliceMode: 'image' }])),
    generator: { model: 'Gemini 이미지 모델(style_guide.mjs RES.model)', script: 'docker/gemini/gen.mjs uiskin_extra → docker/gemini/pp_uiskin_extra.mjs', prompt_ref: 'style_guide.mjs UISKIN_EXTRA(icons_c)', raw: rel(`${OUT}/raw/${SRC}.jpg`) },
    license: 'AI 생성물(Gemini) — 약관·상업 이용 조건 사람 확인 필요', verify: ['ico.tab_stage 지도 문양이 실제 세계지도 대륙처럼 보이는지(특정 지역 연상) 사람 확인'] },
  { key: 'icons.ui.extra2', type: 'icon-set', note: 'ico.<name> 과 같은 그림의 개별 PNG(LINEAR 미리 축소)', path64: rel(`${OUT}/icons/64/<name>.png`), path32: rel(`${OUT}/icons/32/<name>.png`), names: names.map((k) => k.slice(4)) }],
  qa, warn, preview: rel(`${OUT}/preview/qa_extra_icons.png`) };
writeFileSync(`${OUT}/manifest_fragment_extra.json`, JSON.stringify(frag, null, 1));
console.log(JSON.stringify({ A3, A15, warn, qa }, null, 0));
