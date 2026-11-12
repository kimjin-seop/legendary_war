// 컨택트 시트(호출 없음): (1) 초상화 20장 그리드(남색 배경, 라벨) (2) 시트 13종 down/left/up idle x3 + x1 원본 크기 (3) 64px 1배 라인업(풀밭·바다)
// 실행: docker run --rm -v sharpcache:/sp -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_naval_contact.mjs
import { createRequire } from 'node:module'; import { existsSync } from 'node:fs';
import { JP, INK, S11, NAVAL } from './npc_naval_style.mjs';
const sharp = createRequire('/sp/')('sharp');
const G = 'docker/gemini/npc_naval', PV = `${G}/preview`;
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const label = (t, w) => Buffer.from(`<svg width="${w}" height="22"><rect width="100%" height="100%" fill="#101c3a"/><text x="4" y="16" font-size="14" font-family="sans-serif" fill="#d9b45a">${esc(t)}</text></svg>`);
// 1) 초상화
const P = [...Object.entries(JP), ...Object.entries(INK), ...Object.entries(S11)].filter(([c]) => existsSync(`${G}/out/portraits/${c}.png`));
const W = 224, H = 300, comps = [];
for (let i = 0; i < P.length; i++) { const [c, h] = P[i]; const x = (i % 10) * (W + 4), y = Math.floor(i / 10) * (H + 26);
  comps.push({ input: await sharp(`${G}/out/portraits/${c}.png`).resize(W, H).png().toBuffer(), left: x, top: y + 22 }, { input: label(c.replace("npc_", ""), W), left: x, top: y }); }
await sharp({ create: { width: 10 * (W + 4), height: Math.ceil(P.length / 10) * (H + 26), channels: 4, background: '#1a2440' } }).composite(comps).png().toFile(`${PV}/contact_portraits.png`);
// 2) 시트
const S = [...Object.keys(NAVAL), ...Object.keys(JP), ...Object.keys(INK)].filter((c) => existsSync(`${G}/out/64/hero_${c}_ally_sheet.png`));
const tile = await sharp('public/assets/tiles/64/plain_a.png').resize(192, 192, { kernel: 'nearest' }).png().toBuffer();
const c2 = []; const CW = 3 * 192 + 2 * 64 + 40;
for (let i = 0; i < S.length; i++) { const c = S[i], x = (i % 3) * (CW + 8), y = Math.floor(i / 3) * 220; c2.push({ input: label(c, CW), left: x, top: y });
  for (const [k, r] of [[0, 0], [1, 1], [2, 3]]) { const f = await sharp(`${G}/out/64/hero_${c}_ally_sheet.png`).extract({ left: 64, top: r * 64, width: 64, height: 64 }).resize(192, 192, { kernel: 'nearest' }).png().toBuffer(); c2.push({ input: tile, left: x + k * 192, top: y + 22 }, { input: f, left: x + k * 192, top: y + 22 }); }
  for (const [k, side] of [[0, 'ally'], [1, 'enemy']]) { const f = await sharp(`${G}/out/64/hero_${c}_${side}_sheet.png`).extract({ left: 64, top: 0, width: 64, height: 64 }).png().toBuffer(); c2.push({ input: await sharp(tile).resize(64, 64, { kernel: 'nearest' }).png().toBuffer(), left: x + 576 + 10 + k * 70, top: y + 80 }, { input: f, left: x + 576 + 10 + k * 70, top: y + 80 }); } }
await sharp({ create: { width: 3 * (CW + 8), height: Math.ceil(S.length / 3) * 220, channels: 4, background: '#202020' } }).composite(c2).png().toFile(`${PV}/contact_sheets.png`);
console.log('ok', P.length, S.length);
