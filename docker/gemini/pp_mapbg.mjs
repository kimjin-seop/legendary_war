// 전투 맵 바깥 배경(반복 타일) + 맵 경계 장식 후처리. API 호출 없음.
// 입력: <OUT>/raw/map_outside.jpg, <OUT>/raw/map_edge.jpg → <OUT>/map/map_outside_{512,256}.png, map_edge 9-slice PNG(@3x·@1.5x), 3x3 반복 미리보기, manifest 조각(map_fragment.json)
// 실행: docker run --rm -v "<프로젝트>":/app -w /app node:22 sh -c "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp_mapbg.mjs public/assets/ui_skin"
// 이음새 처리: 원본을 반 칸 순환 이동한 사본과, 중앙 가중(가장자리 0 → 중앙 1) 마스크로 섞는다. 결과의 네 변은 순환 이동본의 연속 화소라 반복 시 이음선이 없다.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, existsSync, statSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const OUT = process.argv[2] ?? 'public/assets/ui_skin'; const RAW = `${OUT}/raw`; mkdirSync(`${OUT}/map`, { recursive: true }); mkdirSync(`${OUT}/preview`, { recursive: true });
const TARGET_MEAN = Number(process.env.MAP_MEAN ?? 30), TARGET_STD = Number(process.env.MAP_STD ?? 6); // 0~255 명도 기준: 평균 낮게, 대비 낮게
const res = {};
async function rgba(input) { const { data, info } = await sharp(input).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
const toS = (im) => sharp(im.data, { raw: { width: im.w, height: im.h, channels: 4 } });
const stats = (im) => { let s = 0, s2 = 0; const n = im.w * im.h; for (let i = 0; i < n; i++) { const l = 0.2126 * im.data[i * 4] + 0.7152 * im.data[i * 4 + 1] + 0.0722 * im.data[i * 4 + 2]; s += l; s2 += l * l; } const m = s / n; return { mean: +m.toFixed(1), std: +Math.sqrt(s2 / n - m * m).toFixed(1) }; };
// 이음선 지표: 반복 경계(마지막 열→첫 열) 평균 차 / 내부 이웃 열 평균 차
function seam(im) { const { w, h, data } = im; const d = (x1, y1, x2, y2) => { let s = 0; for (let k = 0; k < 3; k++) s += Math.abs(data[(y1 * w + x1) * 4 + k] - data[(y2 * w + x2) * 4 + k]); return s / 3; };
  let b = 0, in_ = 0; for (let y = 0; y < h; y++) { b += d(w - 1, y, 0, y); in_ += d((w >> 1) - 1, y, w >> 1, y); } for (let x = 0; x < w; x++) { b += d(x, h - 1, x, 0); in_ += d(x, (h >> 1) - 1, x, h >> 1); }
  return { boundary: +(b / (w + h)).toFixed(2), interior: +(in_ / (w + h)).toFixed(2) }; }

if (existsSync(`${RAW}/map_outside.jpg`)) {
  const S = 1024; let im = await rgba(await sharp(`${RAW}/map_outside.jpg`).resize(S, S, { fit: 'cover' }).toBuffer());
  res.raw_seam = seam(im);
  const sh = { w: S, h: S, data: Buffer.alloc(S * S * 4) }; for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) im.data.copy(sh.data, (y * S + x) * 4, (((y + S / 2) % S) * S + ((x + S / 2) % S)) * 4, (((y + S / 2) % S) * S + ((x + S / 2) % S)) * 4 + 4);
  const o = { w: S, h: S, data: Buffer.alloc(S * S * 4) };
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) { const wx = Math.min(1, Math.min(x, S - 1 - x) / (S * 0.25)), wy = Math.min(1, Math.min(y, S - 1 - y) / (S * 0.25)); const wgt = Math.min(wx, wy); const i = (y * S + x) * 4; for (let k = 0; k < 3; k++) o.data[i + k] = Math.round(im.data[i + k] * wgt + sh.data[i + k] * (1 - wgt)); o.data[i + 3] = 255; }
  // 명도·대비 정규화(색상 유지): 평균 TARGET_MEAN, 표준편차 TARGET_STD 로 선형 변환
  const st = stats(o); res.before_norm = st; const g = st.std > 0 ? Math.min(1, TARGET_STD / st.std) : 1;
  for (let i = 0; i < S * S; i++) { const l = 0.2126 * o.data[i * 4] + 0.7152 * o.data[i * 4 + 1] + 0.0722 * o.data[i * 4 + 2]; const nl = TARGET_MEAN + (l - st.mean) * g; const f = l > 1 ? nl / l : 1; for (let k = 0; k < 3; k++) o.data[i * 4 + k] = Math.max(0, Math.min(255, Math.round(o.data[i * 4 + k] * f))); }
  res.after = stats(o); res.seam = seam(o);
  for (const z of [512, 256]) await toS(o).resize(z, z, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/map/map_outside_${z}.png`);
  // 미리보기: 3x3 반복(512 타일 → 1536) + 맵 위 타일 대비 확인용 가운데 밝은 회색 사각(맵 자리 모사)
  const t = await sharp(`${OUT}/map/map_outside_512.png`).toBuffer(); const comps = []; for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) comps.push({ input: t, left: x * 512, top: y * 512 });
  await sharp({ create: { width: 1536, height: 1536, channels: 4, background: '#000' } }).composite(comps).png().toFile(`${OUT}/preview/qa_map_outside_3x3.png`);
  const t256 = await sharp(`${OUT}/map/map_outside_256.png`).toBuffer(); const c2 = []; for (let y = 0; y < 5; y++) for (let x = 0; x < 8; x++) c2.push({ input: t256, left: x * 256, top: y * 256 });
  const map = await sharp({ create: { width: 1280, height: 720, channels: 4, background: { r: 92, g: 128, b: 70, alpha: 1 } } }).png().toBuffer();
  await sharp({ create: { width: 2048, height: 1280, channels: 4, background: '#000' } }).composite([...c2, { input: map, left: 384, top: 280 }]).resize(1600, 1000).png().toFile(`${OUT}/preview/qa_map_outside_context.png`);
}

// 경계 장식: 마젠타 키 → 좌우 대칭 → 9-slice(모서리 꺾쇠 유지, 변 압축)
if (existsSync(`${RAW}/map_edge.jpg`)) {
  const im = await rgba(`${RAW}/map_edge.jpg`); const { w, h, data } = im; const N = w * h; const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < 3; it++) { const add = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if (strict[i - 1] || strict[i + 1] || strict[i - w] || strict[i + w]) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) { if (strict[i]) { data.fill(0, i * 4, i * 4 + 4); continue; } const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const sp = Math.max(0, Math.min(r, b) - g - 25); if (sp) { data[i * 4] = r - sp; data[i * 4 + 2] = b - sp; } }
  { const kill = []; for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) { const i = y * w + x; if (data[i * 4 + 3] && (!data[(i - 1) * 4 + 3] || !data[(i + 1) * 4 + 3] || !data[(i - w) * 4 + 3] || !data[(i + w) * 4 + 3])) kill.push(i); } for (const i of kill) data[i * 4 + 3] = 0; }
  let x0 = w, y0 = h, x1 = -1, y1 = -1; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3] > 64) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const F = 480; let e = await rgba(await toS(im).extract({ left: x0, top: y0, width: x1 - x0 + 1, height: y1 - y0 + 1 }).resize(F, F, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer());
  for (let y = 0; y < F; y++) for (let x = 0; x < F / 2; x++) e.data.copy(e.data, (y * F + F - 1 - x) * 4, (y * F + x) * 4, (y * F + x) * 4 + 4);
  // 모서리 inset: 중앙 열의 위쪽에서 장식이 끝나는 지점이 아니라, 왼쪽 변 열(가운데 행)과 같아지는 위치를 위에서부터 탐색
  const colAt = (x, y) => e.data.subarray((y * F + x) * 4, (y * F + x) * 4 + 4); const rowSig = (y) => { let s = 0; for (let x = 0; x < F * 0.2; x++) s += colAt(x, y)[3]; return s; }; const ref = rowSig(F >> 1);
  // 가운데 행에서 위로 올라가며 왼쪽 띠의 알파·명도 합이 기준과 달라지는 첫 행 = 모서리 장식의 아래 끝
  const rowSig2 = (y) => { let s = 0; for (let x = 0; x < F * 0.2; x++) { const c = colAt(x, y); s += c[3] + (c[0] + c[1] + c[2]) / 3; } return s; }; const ref2 = rowSig2(F >> 1);
  let I = Math.round(F * 0.12); for (let y = F >> 1; y > 0; y--) if (Math.abs(rowSig2(y) - ref2) > ref2 * 0.06) { I = y + 6; break; }
  // 변 두께(가운데 행 왼쪽에서 불투명 구간)
  let bw = 0; { let x = 0; while (x < F / 4 && colAt(x, F >> 1)[3] < 64) x++; const s = x; while (x < F / 4 && colAt(x, F >> 1)[3] >= 64) x++; while (x < F / 4 && colAt(x, F >> 1)[3] < 64) x++; while (x < F / 4 && colAt(x, F >> 1)[3] >= 64) x++; bw = x - s; res.edge_start = s; }
  // 9-slice 로 압축(가운데 12px)
  const C = 12; const out = await sharp({ create: { width: 2 * I + C, height: 2 * I + C, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([
    { input: await toS(e).extract({ left: 0, top: 0, width: F, height: I }).resize(2 * I + C, I, { fit: 'fill' }).png().toBuffer(), left: 0, top: 0 }, // 임시(아래에서 정확히 다시 조립)
  ]).png().toBuffer();
  void out;
  const piece = async (l, t, wd, ht, W2, H2) => toS(e).extract({ left: l, top: t, width: wd, height: ht }).resize(W2, H2, { fit: 'fill', kernel: 'lanczos3' }).png().toBuffer();
  const mid = F - 2 * I; const cells = [];
  for (const [sy, sh2, dy, dh] of [[0, I, 0, I], [I, mid, I, C], [F - I, I, I + C, I]]) for (const [sx, sw, dx, dw] of [[0, I, 0, I], [I, mid, I, C], [F - I, I, I + C, I]]) cells.push({ input: await piece(sx, sy, sw, sh2, dw, dh), left: dx, top: dy });
  const nineBuf = await sharp({ create: { width: 2 * I + C, height: 2 * I + C, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(cells).png({ compressionLevel: 9 }).toBuffer();
  await sharp(nineBuf).toFile(`${OUT}/map/map_edge@3x.png`); const half = Math.round((2 * I + C) / 2); await sharp(nineBuf).resize(half, half, { kernel: 'lanczos3' }).png({ compressionLevel: 9 }).toFile(`${OUT}/map/map_edge@1.5x.png`);
  res.edge = { master_px: 2 * I + C, slice_px_3x: I, slice_px_1_5x: Math.round(I / 2), border_band_px_3x: bw, outer_offset_px_3x: res.edge_start, F };
  // 미리보기: 맵 자리(초록 사각) 위에 9-slice 로 1200x700 두르기 (1/3 배율=@1x 해당)
  const k = 1 / 3, W2 = 1200, H2 = 700, Ik = Math.round(I * k); const src = await rgba(nineBuf); const S2 = src.w;
  const pc = async (l, t, wd, ht, dw, dh) => toS(src).extract({ left: l, top: t, width: wd, height: ht }).resize(Math.max(1, dw), Math.max(1, dh), { fit: 'fill' }).png().toBuffer();
  const cc = []; for (const [sy, sh2, dy, dh] of [[0, I, 0, Ik], [I, C, Ik, H2 - 2 * Ik], [S2 - I, I, H2 - Ik, Ik]]) for (const [sx, sw, dx, dw] of [[0, I, 0, Ik], [I, C, Ik, W2 - 2 * Ik], [S2 - I, I, W2 - Ik, Ik]]) cc.push({ input: await pc(sx, sy, sw, sh2, dw, dh), left: dx + 40, top: dy + 40 });
  const bgT = existsSync(`${OUT}/map/map_outside_256.png`) ? await sharp(`${OUT}/map/map_outside_256.png`).toBuffer() : null; const base = []; if (bgT) for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) base.push({ input: bgT, left: x * 256, top: y * 256 });
  const mapRect = await sharp({ create: { width: W2 - 2 * Ik + 10, height: H2 - 2 * Ik + 10, channels: 4, background: { r: 92, g: 128, b: 70, alpha: 1 } } }).png().toBuffer();
  await sharp({ create: { width: 1280, height: 780, channels: 4, background: { r: 11, g: 19, b: 40, alpha: 1 } } }).composite([...base, { input: mapRect, left: 40 + Ik - 5, top: 40 + Ik - 5 }, ...cc]).png().toFile(`${OUT}/preview/qa_map_edge.png`);
  // 확대(흰/남색) 모서리
  const z = await toS(src).extract({ left: 0, top: 0, width: Math.min(80, S2), height: Math.min(80, S2) }).png().toBuffer();
  const zs = []; for (const [i, bg] of [[0, { r: 255, g: 255, b: 255, alpha: 1 }], [1, { r: 11, g: 19, b: 40, alpha: 1 }]]) zs.push({ input: await sharp(await sharp({ create: { width: 80, height: 80, channels: 4, background: bg } }).composite([{ input: z }]).png().toBuffer()).resize(240, 240, { kernel: 'nearest' }).png().toBuffer(), left: i * 250, top: 0 });
  await sharp({ create: { width: 490, height: 240, channels: 4, background: '#333' } }).composite(zs).png().toFile(`${OUT}/preview/qa_map_edge_zoom.png`);
}
const rel = (p) => p.replace(/^public\//, ''); const sz = (p) => (existsSync(p) ? statSync(p).size : null);
const frag = { _note: '전투 맵 바깥 배경·경계 장식 manifest 조각. 본 manifest 병합 전(팀장 확인 후).', generatedAt: new Date().toISOString(), basePath: 'public', metrics: res, items: [
  { key: 'bg.map_outside', type: 'tile-bg', path: rel(`${OUT}/map/map_outside_512.png`), size: [512, 512], bytes: sz(`${OUT}/map/map_outside_512.png`), variants: { 256: { path: rel(`${OUT}/map/map_outside_256.png`), size: [256, 256], bytes: sz(`${OUT}/map/map_outside_256.png`) } }, alpha: false, filter: 'LINEAR', repeat: 'seamless(wrap) — Phaser add.tileSprite, tileScale 는 화면 1u 당 1/3~1/2 권장, 카메라 스크롤에 scrollFactor 0.3~0.5 로 약한 시차 가능',
    generator: { model: 'gemini-nano-banana-2.1', size: '2K', script: 'gen.mjs mapbg + pp_mapbg.mjs(반 칸 순환 이동 교차 블렌딩 + 명도·대비 정규화)' }, prompt_ref: 'style_guide.mjs MAPBG map_outside', license: 'Google Gemini API 생성물 — 상업 이용 약관 사람 확인 필요', verify: false },
  { key: 'deco.map_edge', textureKeyHint: 'mapedge (deco. 접두는 로더가 NEAREST 를 강제하므로 텍스처 키는 접두 없이 권장)', type: 'nineslice', path: rel(`${OUT}/map/map_edge@3x.png`), unitPx: 3, bytes: sz(`${OUT}/map/map_edge@3x.png`), variants: { '1.5x': { path: rel(`${OUT}/map/map_edge@1.5x.png`), unitPx: 1.5, bytes: sz(`${OUT}/map/map_edge@1.5x.png`) } }, slice: res.edge ? { l: res.edge.slice_px_3x, r: res.edge.slice_px_3x, t: res.edge.slice_px_3x, b: res.edge.slice_px_3x } : null, sliceMode: '9', alpha: true, filter: 'LINEAR',
    placement: '맵 픽셀 사각형보다 바깥으로 outer_offset 만큼 확장해 nineslice 로 두름(안쪽은 투명). 맵 타일 위에 겹치지 않게 depth 는 맵 아래 배경 위', generator: { model: 'gemini-nano-banana-2.1', size: '2K', script: 'gen.mjs mapbg + pp_mapbg.mjs' }, prompt_ref: 'style_guide.mjs MAPBG map_edge', license: 'Google Gemini API 생성물 — 상업 이용 약관 사람 확인 필요', verify: false },
] };
writeFileSync(`${OUT}/map_fragment.json`, JSON.stringify(frag, null, 1)); console.log(JSON.stringify(res));
