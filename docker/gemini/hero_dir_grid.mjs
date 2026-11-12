// 도트 격자 판정 도구(영웅 방향 시트용). raw JPEG 의 가로·세로 경계 에너지에서 도트 주기(px)와 위상을 추정한다.
// 방법: 열/행별 |밝기 차분| 합 → 후보 주기 s(5~40px, 0.02 간격)마다 위상 p 를 0.25px 간격으로 돌려 빗(comb) 위치 에너지 평균/전체 평균 비를 구함.
//       배수 주기(2s, 3s)도 높게 나오므로, 최고점의 70% 이상인 가장 작은 주기를 채택(약수 우선).
// 실행: SHARP_DIR=/sp/pp node docker/gemini/hero_dir_grid.mjs <a.jpg> [<b.jpg> ...]   → JSON 한 줄씩 출력
import { createRequire } from 'node:module';
const sharp = createRequire(`${process.env.SHARP_DIR ?? '/tmp/pp'}/`)('sharp');

export async function detectGrid(file) {
  const { data, info } = await sharp(file).removeAlpha().greyscale().raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height; const col = new Float64Array(W), row = new Float64Array(H);
  for (let y = 1; y < H; y++) for (let x = 1; x < W; x++) { const v = data[y * W + x]; col[x] += Math.abs(v - data[y * W + x - 1]); row[y] += Math.abs(v - data[(y - 1) * W + x]); }
  const prof = new Float64Array(Math.max(W, H)); for (let i = 0; i < W; i++) prof[i] += col[i]; for (let i = 0; i < H; i++) prof[i] += row[i];
  const N = Math.min(W, H), mean = prof.slice(1, N).reduce((a, b) => a + b, 0) / (N - 1);
  const score = (s) => { let best = 0, bp = 0; for (let p = 0; p < s; p += 0.25) { let e = 0, n = 0; for (let k = p; k < N - 1; k += s) { const i = Math.round(k); if (i >= 1) { e += prof[i]; n++; } } const r = e / n / mean; if (r > best) { best = r; bp = p; } } return { s, r: best, p: bp }; };
  const cands = []; for (let s = 5; s <= 40; s += 0.02) cands.push(score(+s.toFixed(2)));
  const top = cands.reduce((a, b) => (b.r > a.r ? b : a));
  // HERO_MIN_STEP(px, 선택): 모델 도트가 커서 반주기(약수)가 잡히는 raw(파일럿 16:9 2인 시트) 대응. 미설정 시 기존과 동일
  const minStep = Number(process.env.HERO_MIN_STEP ?? 0);
  const pick = cands.filter((c) => c.r >= top.r * 0.7 && c.s >= minStep).sort((a, b) => a.s - b.s)[0] ?? top;
  // 선택 주기 근방 미세 탐색
  let fine = pick; for (let s = pick.s - 0.1; s <= pick.s + 0.1; s += 0.005) { const c = score(+s.toFixed(3)); if (c.r > fine.r) fine = c; }
  return { file, width: W, step: +fine.s.toFixed(3), phase: fine.p, ratio: +fine.r.toFixed(2), grid: +(W / fine.s).toFixed(1), top_step: top.s, top_ratio: +top.r.toFixed(2) };
}
if (process.argv[1]?.endsWith('hero_dir_grid.mjs')) for (const f of process.argv.slice(2)) console.log(JSON.stringify(await detectGrid(f)));
