// 레이아웃 참조 보정: 병종 3x3 raw 의 측면 행(2행) 중 오른쪽을 보는 칸을 좌우 반전해 '세 칸 모두 좌향' 참조 시트를 만든다(호출 없음).
// 근거: 모델이 참조 시트의 측면 행 방향 혼재(pp_v2 FACING 의 R 칸)를 그대로 따라 그림(1차 7장 중 보병 4장에서 가운데 칸 3/4 우향·오른쪽 칸 우향).
// 출력: docker/gemini/hero_dir_refs/<dir>_<type>.jpg. 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_dir_refs.mjs
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const FACING = { dir64: { sword: 'LRR', mage: 'LLR', healer: 'LRR', archer: 'LLR', cavalry: 'LLR' }, dir64_korea: { sword: 'LRR', archer: 'LLR', healer: 'LRR', cavalry: 'LLR' } };
mkdirSync('docker/gemini/hero_dir_refs', { recursive: true });
for (const [dir, types] of Object.entries(FACING)) for (const [t, f] of Object.entries(types)) {
  const src = `public/assets/raw/${dir}/${t}.jpg`; const meta = await sharp(src).metadata(); const W = meta.width, cw = Math.floor(W / 3), ch = Math.floor(meta.height / 3);
  const comps = []; for (let c = 0; c < 3; c++) if (f[c] === 'R') comps.push({ input: await sharp(src).extract({ left: c * cw, top: ch, width: cw, height: ch }).flop().toBuffer(), left: c * cw, top: ch });
  await sharp(src).composite(comps).jpeg({ quality: 95 }).toFile(`docker/gemini/hero_dir_refs/${dir}_${t}.jpg`); console.log(dir, t, f);
}
