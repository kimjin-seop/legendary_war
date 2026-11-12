// 장비 아이콘 후처리: raw/<cat>/<code>.jpg → 마젠타 키(pp.mjs 와 같은 알고리즘) → 128/64 투명 PNG + 등급 프레임(SVG) + 아틀라스 + 미리보기 + manifest 조각.
// 실행(컨테이너): docker run --rm -v "$PWD":/app -w /app node:22 sh -c \
//   "mkdir -p /tmp/pp && cd /tmp/pp && npm i sharp@0.33.5 --silent && cd /app && SHARP_DIR=/tmp/pp node docker/gemini/pp_equip.mjs equip_trial public/assets/equip_trial"
// 의존: sharp 0.33.5(Apache-2.0, libvips LGPL-3.0). 프로젝트 package.json 은 수정하지 않음. API 호출 없음.
import { createRequire } from 'node:module';
import { writeFileSync, mkdirSync, readdirSync, existsSync, readFileSync, statSync } from 'node:fs';
import { EQUIP_RARITY_COLOR, EQUIP_SLOT } from './style_guide.mjs';

const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [CAT = 'equip_trial', OUT = 'public/assets/equip_trial'] = process.argv.slice(2);
const RAW = process.env.RAW_DIR ?? `public/assets/raw/${CAT}`; // 본 생산: RAW_DIR=public/assets/equip/raw
const SIZES = [128, 64], PAD = { 128: 14, 64: 7 }; // 프레임 테두리(128 기준 4px)+여유. 아이템 최대 100x100(128) / 50x50(64)
const ensure = (d) => mkdirSync(d, { recursive: true });
const raw = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });
async function loadRGBA(f) { const { data, info } = await sharp(f).ensureAlpha().raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }
async function extract(img, left, top, width, height) { const { data, info } = await raw(img).extract({ left, top, width, height }).raw().toBuffer({ resolveWithObject: true }); return { data: Buffer.from(data), w: info.width, h: info.height }; }

// pp.mjs keyMagenta 와 동일(엄격 마스크 + 번짐 확장 + despill)
function keyMagenta(img, grow = 3) {
  const { data, w, h } = img, N = w * h; const strict = new Uint8Array(N), loose = new Uint8Array(N);
  for (let i = 0; i < N; i++) { const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; strict[i] = r > 150 && b > 150 && g < 120 && r - g > 100 && b - g > 100 ? 1 : 0; loose[i] = r - g > 50 && b - g > 50 ? 1 : 0; }
  for (let it = 0; it < grow; it++) { const add = []; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; if (strict[i] || !loose[i]) continue; if ((x > 0 && strict[i - 1]) || (x < w - 1 && strict[i + 1]) || (y > 0 && strict[i - w]) || (y < h - 1 && strict[i + w])) add.push(i); } for (const i of add) strict[i] = 1; }
  for (let i = 0; i < N; i++) {
    if (strict[i]) { data.fill(0, i * 4, i * 4 + 4); continue; }
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2]; const spill = Math.max(0, Math.min(r, b) - g - 25);
    if (spill > 0) { data[i * 4] = r - spill; data[i * 4 + 2] = b - spill; }
  }
  return img;
}
function bbox(img, thr = 64) { let x0 = img.w, y0 = img.h, x1 = -1, y1 = -1; for (let y = 0; y < img.h; y++) for (let x = 0; x < img.w; x++) if (img.data[(y * img.w + x) * 4 + 3] >= thr) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } return x1 < 0 ? null : { x0, y0, x1, y1, w: x1 - x0 + 1, h: y1 - y0 + 1 }; }
// 작은 잡티(연결 성분 < minArea) 제거
function dropSpecks(img, minArea) {
  const { w, h, data } = img, seen = new Uint8Array(w * h); let removed = 0;
  for (let s = 0; s < w * h; s++) { if (seen[s] || data[s * 4 + 3] === 0) continue; const comp = [s]; seen[s] = 1;
    for (let k = 0; k < comp.length; k++) { const i = comp[k], x = i % w, y = (i / w) | 0; for (const j of [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < h - 1 ? i + w : -1]) if (j >= 0 && !seen[j] && data[j * 4 + 3] > 0) { seen[j] = 1; comp.push(j); } }
    if (comp.length < minArea) { for (const i of comp) data.fill(0, i * 4, i * 4 + 4); removed += comp.length; } }
  return removed;
}
// QA 지표: 잔여 마젠타/분홍, 보라 계열 화소 비율, 가장자리 접촉
function metrics(img) {
  let opaque = 0, magenta = 0, purple = 0, edgeTouch = 0; const { w, h, data } = img;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; if (data[i + 3] < 128) continue; opaque++;
    const r = data[i], g = data[i + 1], b = data[i + 2]; if (r - g > 60 && b - g > 60) magenta++;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn; if (d > 40 && mx > 60) { let hue = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4; hue = (hue * 60 + 360) % 360; if (hue >= 255 && hue <= 330) purple++; }
    if (x <= 1 || y <= 1 || x >= w - 2 || y >= h - 2) edgeTouch++; }
  return { opaque, magenta_px: magenta, purple_ratio: +(purple / Math.max(1, opaque)).toFixed(4), edge_touch_px: edgeTouch };
}
async function fit(crop, size) { const pad = PAD[size], s = Math.min((size - pad * 2) / crop.w, (size - pad * 2) / crop.h); const tw = Math.max(1, Math.round(crop.w * s)), th = Math.max(1, Math.round(crop.h * s));
  const small = await raw(crop).resize(tw, th, { kernel: 'lanczos3' }).png().toBuffer();
  return sharp({ create: { width: size, height: size, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite([{ input: small, left: (size - tw) >> 1, top: (size - th) >> 1 }]).png({ compressionLevel: 9 }).toBuffer(); }

// ---- 등급 프레임(SVG → PNG). 배경판 + 등급색 테두리 + 하단 등급 점(C1·B2·A3·S4, 색각 보조). 아이템은 그 위에 얹음 ----
const hex = (c) => [1, 3, 5].map((k) => parseInt(c.slice(k, k + 2), 16));
const mix = (a, b, t) => '#' + hex(a).map((v, k) => Math.round(v + (hex(b)[k] - v) * t).toString(16).padStart(2, '0')).join('');
const lum = (c) => { const [r, g, b] = hex(c).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return +((x + 0.05) / (y + 0.05)).toFixed(1); };
function frameSvg(r, S) {
  const c = EQUIP_RARITY_COLOR[r], k = S / 128, bw = 4 * k, rad = 10 * k, pips = { C: 1, B: 2, A: 3, S: 4 }[r];
  // 1차(#172750 중심)는 검은 옻칠 갑옷·사슬 투구의 남흑색 외곽선이 배경에 묻혀 48~64px 실루엣 손실 → 중심을 밝힌 역광형 그라데이션으로 변경
  const bgIn = mix('#4A5F96', c, 0.30), bgOut = mix('#16224A', c, 0.12), dark = mix(c, '#000000', 0.45), light = mix(c, '#FFFFFF', 0.45);
  const glow = r === 'S' ? `<rect x="${bw * 1.5}" y="${bw * 1.5}" width="${S - bw * 3}" height="${S - bw * 3}" rx="${rad}" fill="none" stroke="${mix(c, '#FFFFFF', 0.3)}" stroke-opacity="0.55" stroke-width="${2 * k}"/>` : '';
  const corner = r === 'S' ? [[0, 0], [1, 0], [0, 1], [1, 1]].map(([fx, fy]) => { const x = fx ? S - 9 * k : 9 * k, y = fy ? S - 9 * k : 9 * k, d = 5 * k; return `<path d="M${x} ${y - d}L${x + d} ${y}L${x} ${y + d}L${x - d} ${y}Z" fill="${light}" stroke="${dark}" stroke-width="${1 * k}"/>`; }).join('') : '';
  const pw = 7 * k, gap = 4 * k, total = pips * pw + (pips - 1) * gap, py = S - bw - 1 * k;
  const pipSvg = Array.from({ length: pips }, (_, i) => { const x = (S - total) / 2 + i * (pw + gap) + pw / 2, d = pw / 2; return `<path d="M${x} ${py - d}L${x + d} ${py}L${x} ${py + d}L${x - d} ${py}Z" fill="${light}" stroke="#0A1226" stroke-width="${1 * k}"/>`; }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}" viewBox="0 0 ${S} ${S}">
<defs><radialGradient id="g" cx="50%" cy="46%" r="62%"><stop offset="0" stop-color="${bgIn}"/><stop offset="0.55" stop-color="${mix(bgIn, bgOut, 0.5)}"/><stop offset="1" stop-color="${bgOut}"/></radialGradient></defs>
<rect x="${k}" y="${k}" width="${S - 2 * k}" height="${S - 2 * k}" rx="${rad}" fill="#0A1226"/>
<rect x="${k + bw / 2}" y="${k + bw / 2}" width="${S - 2 * k - bw}" height="${S - 2 * k - bw}" rx="${rad - bw / 2}" fill="url(#g)" stroke="${c}" stroke-width="${bw}"/>
<rect x="${k + bw}" y="${k + bw}" width="${S - 2 * k - 2 * bw}" height="${S - 2 * k - 2 * bw}" rx="${rad - bw}" fill="none" stroke="${dark}" stroke-width="${1 * k}"/>
<path d="M${rad + k} ${k + bw * 0.25}H${S - rad - k}" stroke="${light}" stroke-width="${1 * k}" stroke-linecap="round"/>
${glow}${corner}${pipSvg}</svg>`;
}

const ids = existsSync(RAW) ? readdirSync(RAW).filter((f) => /^[a-z]+_[cbas]2?\.jpg$/.test(f)).map((f) => f.slice(0, -4)).sort() : [];
if (!ids.length) { console.error(`원본 없음: ${RAW}`); process.exit(1); }
for (const s of SIZES) { ensure(`${OUT}/icons/${s}`); ensure(`${OUT}/frames/${s}`); }
ensure(`${OUT}/atlas`); ensure(`${OUT}/preview`);

const frames = {}; const spec = { rarity: {} };
for (const r of Object.keys(EQUIP_RARITY_COLOR)) { frames[r] = {};
  for (const s of SIZES) { const png = await sharp(Buffer.from(frameSvg(r, s))).png({ compressionLevel: 9 }).toBuffer(); writeFileSync(`${OUT}/frames/${s}/${r.toLowerCase()}.png`, png); frames[r][s] = png; }
  spec.rarity[r] = { border: EQUIP_RARITY_COLOR[r], contrast_vs_panel_base: contrast(EQUIP_RARITY_COLOR[r], '#101C3A'), contrast_vs_frame_bg_edge: contrast(EQUIP_RARITY_COLOR[r], mix("#16224A", EQUIP_RARITY_COLOR[r], 0.12)), item_outline_vs_frame_center: contrast("#14182A", mix("#4A5F96", EQUIP_RARITY_COLOR[r], 0.30)), pips: { C: 1, B: 2, A: 3, S: 4 }[r] }; }

const out = {}; const qa = {};
for (const id of ids) {
  const img = keyMagenta(await loadRGBA(`${RAW}/${id}.jpg`)); const removed = dropSpecks(img, 400);
  const full = metrics(img); const b = bbox(img); const crop = await extract(img, b.x0, b.y0, b.w, b.h);
  out[id] = {}; for (const s of SIZES) { out[id][s] = await fit(crop, s); writeFileSync(`${OUT}/icons/${s}/${id}.png`, out[id][s]); }
  const m128 = metrics({ ...(await sharp(out[id][128]).raw().toBuffer({ resolveWithObject: true }).then(({ data, info }) => ({ data, w: info.width, h: info.height }))) });
  qa[id] = { raw_bbox: `${b.w}x${b.h}`, raw_edge_touch_px: full.edge_touch_px, specks_removed_px: removed, magenta_px_128: m128.magenta_px, purple_ratio_128: m128.purple_ratio };
  console.log(`[${id}] bbox ${b.w}x${b.h} 원본가장자리접촉 ${full.edge_touch_px}px 잡티제거 ${removed}px | 128: 잔여마젠타 ${m128.magenta_px}px 보라비율 ${m128.purple_ratio}`);
}

// 아틀라스(Phaser JSON Hash) — 128/64 각각
for (const s of SIZES) { const cols = Math.min(ids.length, 6), rows = Math.ceil(ids.length / cols), frameMap = {}; const comps = [];
  ids.forEach((id, i) => { const x = (i % cols) * s, y = Math.floor(i / cols) * s; comps.push({ input: out[id][s], left: x, top: y }); frameMap[`icon.equip.${id}`] = { frame: { x, y, w: s, h: s }, rotated: false, trimmed: false, spriteSourceSize: { x: 0, y: 0, w: s, h: s }, sourceSize: { w: s, h: s } }; });
  await sharp({ create: { width: cols * s, height: rows * s, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).composite(comps).png({ compressionLevel: 9 }).toFile(`${OUT}/atlas/equip_icons_${s}.png`);
  writeFileSync(`${OUT}/atlas/equip_icons_${s}.json`, JSON.stringify({ frames: frameMap, meta: { app: 'docker/gemini/pp_equip.mjs', image: `equip_icons_${s}.png`, format: 'RGBA8888', size: { w: cols * s, h: rows * s }, scale: '1' } }, null, 1)); }

// 미리보기: (1) 128 아이템 on 자기 등급 프레임 (2) 64 on 프레임을 x2 최근접 확대 (3) 48 표시 시뮬레이션 x2 (4) 첫 아이템을 C/B/A/S 프레임 4종에 (5) 흰 바탕 헤일로 점검 x2
const tile = async (id, s, r) => sharp(frames[r][s]).composite([{ input: out[id][s] }]).png().toBuffer();
const rarityOf = (id) => id.split('_')[1][0].toUpperCase();
const row = async (bufs, cell, bg) => { const W = bufs.length * (cell + 8) + 8; return sharp({ create: { width: W, height: cell + 16, channels: 4, background: bg } }).composite(bufs.map((input, i) => ({ input, left: 8 + i * (cell + 8), top: 8 }))).png().toBuffer(); };
const up = async (buf, k) => { const m = await sharp(buf).metadata(); return sharp(buf).resize(m.width * k, m.height * k, { kernel: 'nearest' }).png().toBuffer(); };
const navy = { r: 16, g: 28, b: 58, alpha: 1 }, white = { r: 255, g: 255, b: 255, alpha: 1 };
const r1 = await row(await Promise.all(ids.map((id) => tile(id, 128, rarityOf(id)))), 128, navy);
const r2 = await row(await Promise.all(ids.map(async (id) => up(await tile(id, 64, rarityOf(id)), 2))), 128, navy);
const r3 = await row(await Promise.all(ids.map(async (id) => up(await sharp(await tile(id, 128, rarityOf(id))).resize(48, 48, { kernel: 'lanczos3' }).png().toBuffer(), 2))), 96, navy);
const r4 = await row(await Promise.all(['C', 'B', 'A', 'S'].map((r) => tile(ids[0], 128, r))), 128, navy);
const r5 = await row(await Promise.all(ids.map(async (id) => up(out[id][128], 2))), 256, white);
const rows = [r1, r2, r3, r4, r5]; const metas = await Promise.all(rows.map((b) => sharp(b).metadata())); const W = Math.max(...metas.map((m) => m.width)); let y = 0; const comps = [];
for (let i = 0; i < rows.length; i++) { comps.push({ input: rows[i], left: 0, top: y }); y += metas[i].height; }
await sharp({ create: { width: W, height: y, channels: 4, background: { r: 40, g: 40, b: 40, alpha: 1 } } }).composite(comps).png().toFile(`${OUT}/preview/equip_qa_panel.png`);
// 슬롯 x 등급 격자(행: 슬롯, 열: C B A S + 장신구 C2 B2 A2) — 재질 사다리·슬롯 구분 점검. 128 on 프레임 / 오른쪽 64 x1 표시
{ const slots = ['helm', 'armor', 'gloves', 'boots', 'accessory'], cols = ['c', 'b', 'a', 's', 'c2', 'b2', 'a2']; const cell = 136; const gc = [];
  for (const [ri, sl] of slots.entries()) for (const [ci, r] of cols.entries()) { const id = `${sl}_${r}`; if (!out[id]) continue; gc.push({ input: await tile(id, 128, rarityOf(id)), left: 8 + ci * cell, top: 8 + ri * cell }); gc.push({ input: await tile(id, 64, rarityOf(id)), left: 8 + 7 * cell + 16 + ci * 72, top: 8 + ri * cell + 32 }); }
  await sharp({ create: { width: 8 + 7 * cell + 16 + 7 * 72 + 8, height: 8 + 5 * cell, channels: 4, background: navy } }).composite(gc).png().toFile(`${OUT}/preview/equip_grid.png`); }

// manifest 조각(본 manifest 에는 병합하지 않음)
const TXT = existsSync('database/data/equipment_text_proposal.json') ? JSON.parse(readFileSync('database/data/equipment_text_proposal.json', 'utf8')).items : [];
const base = OUT.replace(/^public\//, '');
const gen = { model: 'gemini-nano-banana-2.1', api: 'Interactions API', size: '1K', script: 'docker/gemini/gen.mjs + style_guide.mjs(equipJob) + pp_equip.mjs' };
const lic = 'Google Gemini API 생성물(SynthID 워터마크 포함). 상업 이용 범위는 Gemini API 약관 확인 필요';
const frag = { _note: `장비 아이콘 manifest 조각(${CAT}). 본 manifest.json 에 병합하지 않음. 키 규칙: icon.equip.<code>(아이템 그림, 투명), deco.equip_frame.<c|b|a|s>(등급 프레임). 합성 순서: 프레임 → 아이템(같은 크기, 좌상단 정렬). qa 는 pp_equip.mjs 자동 지표 + 안아트 육안 판정(qa.verdict)으로 채움`,
  generatedAt: new Date().toISOString(), basePath: 'public', spec,
  items: [
    ...ids.map((id) => { const t = TXT.find((i) => i.code === id) ?? {}; const [slot] = id.split('_');
      return { key: `icon.equip.${id}`, path: `${base}/icons/128/${id}.png`, path64: `${base}/icons/64/${id}.png`, atlas: { 128: `${base}/atlas/equip_icons_128.json`, 64: `${base}/atlas/equip_icons_64.json` }, type: 'icon', size: '128x128', variants: ['128', '64'], alpha: true,
        bytes: statSync(`${OUT}/icons/128/${id}.png`).size, bytes64: statSync(`${OUT}/icons/64/${id}.png`).size, slot, slot_ko: EQUIP_SLOT[slot].ko, rarity: rarityOf(id), culture: t.culture ?? null, name_ko: t.name_ko ?? null,
        frame: `deco.equip_frame.${rarityOf(id).toLowerCase()}`, generator: gen, prompt_ref: `style_guide.mjs equipJob('${id}') (EQUIP_DESC.${id})`, license: lic, qa: { auto: qa[id] }, verify: true }; }),
    ...Object.keys(EQUIP_RARITY_COLOR).map((r) => ({ key: `deco.equip_frame.${r.toLowerCase()}`, path: `${base}/frames/128/${r.toLowerCase()}.png`, path64: `${base}/frames/64/${r.toLowerCase()}.png`, type: 'deco', size: '128x128', variants: ['128', '64'], alpha: true, rarity: r,
      generator: { script: 'docker/gemini/pp_equip.mjs frameSvg (SVG 렌더, API 호출 없음)' }, license: '프로젝트 자체 제작(코드 생성 도형)', qa: { auto: spec.rarity[r] }, verify: false })),
  ] };
writeFileSync(`${OUT}/manifest_fragment.json`, JSON.stringify(frag, null, 1));
console.log(`완료: 아이콘 ${ids.length}개 x ${SIZES.join('/')}, 프레임 4종, 아틀라스·미리보기·manifest 조각 → ${OUT}`);
