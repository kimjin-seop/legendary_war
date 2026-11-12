// QA 보조(호출 없음): hero_sprite_map_v4.json 기준 영웅 101명 정면 idle(x2) 라인업. 실행: node docker/gemini/hero_v4_lineup.mjs <out.png>
import { createRequire } from 'node:module'; import { readFileSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/sp'}/`)('sharp');
const map = JSON.parse(readFileSync('public/assets/sprites/hero_sprite_map_v4.json', 'utf8')).heroes; const M = JSON.parse(readFileSync('public/assets/sprites/hero_v4_manifest_fragment.json', 'utf8')).items;
const man = JSON.parse(readFileSync('public/assets/manifest.json', 'utf8')).items; const all = [...man, ...M];
const comps = []; let i = 0;
for (const [code, base] of Object.entries(map)) { const it = all.find((x) => x.key === `${base}.ally.64.sheet`);
  const b = await sharp(`public/${it.path}`).extract({ left: 64, top: 0, width: 64, height: 64 }).resize(128, 128, { kernel: 'nearest' }).png().toBuffer();
  comps.push({ input: b, left: (i % 17) * 128, top: Math.floor(i / 17) * 128 }); i++; }
await sharp({ create: { width: 17 * 128, height: Math.ceil(i / 17) * 128, channels: 3, background: '#6a8a4a' } }).composite(comps).png().toFile(process.argv[2]); console.log('ok', i);
