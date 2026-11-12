// 파일럿 2인 시트(16:9, 좌 3열 = 영웅 A, 우 3열 = 영웅 B)를 영웅별 3x3 raw 로 자른다(호출 없음). 이후 hero_dir_pp.mjs 를 HERO_RAWD/HERO_OUT/HERO_PV 로 돌린다.
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_pilot_split.mjs docker/gemini/hero_pilot_raw/p1.jpg jose_rizal,seondeok
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');
const [src, codes] = process.argv.slice(2); const [a, b] = codes.split(',');
const m = await sharp(src).metadata(); const half = Math.floor(m.width / 2);
for (const [code, left] of [[a, 0], [b, half]]) { const out = `docker/gemini/hero_pilot_raw/${code}.jpg`; await sharp(src).extract({ left, top: 0, width: half, height: m.height }).jpeg({ quality: 97 }).toFile(out); console.log(code, out, `${half}x${m.height}`); }
