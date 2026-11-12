// 서가 지도 진영 깃발 시트 생성기(안아트 2026-11-04). 목록 flag_list.json(reuse 없는 항목) → 12개씩 4열x3행 시트(4:3), 마젠타 배경.
// 출력 public/assets/ui/flags/raw/flags_<nn>.jpg, 로그 docker/gemini/flag_calls_log.jsonl. 429 → 즉시 전체 중단. 키는 --env-file 로만(출력·기록 없음)
// 실행: docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/flag_gen.mjs [all|01,02] [--force] [--dry]
import { readFileSync, writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { RES, KEY_BG } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RAW = 'public/assets/ui/flags/raw', LOG = 'docker/gemini/flag_calls_log.jsonl';
const L = JSON.parse(readFileSync('docker/gemini/flag_list.json', 'utf8')).flags.filter((f) => !f.reuse);
export const SHEETS = []; for (let i = 0; i < L.length; i += 12) SHEETS.push({ id: String(SHEETS.length + 1).padStart(2, '0'), items: L.slice(i, i + 12) });
const STYLE = '고급 모바일 역사 전략 RPG 의 UI 아이콘 일러스트: 굵고 깔끔한 짙은 갈색 윤곽선, 셀 셰이딩 2~3단, 광원 왼쪽 위, 천이 바람에 살짝 물결치는 입체감, 작은 크기(32px)에서도 색과 모양이 또렷';
const prompt = (items) => (items.length < 4 ? `진영 깃발 아이콘 ${items.length}개를 가로 한 줄로 균등 간격 배치(왼쪽부터 번호 순서), 각 깃발은 화면 높이의 55% 크기.` : `진영 깃발 아이콘 시트 1장: 정확히 4열 x 3행 균등 격자(12칸)에 깃발을 왼쪽 위부터 오른쪽으로, 줄을 바꿔 아래로 번호 순서대로 한 칸에 1개씩. 각 깃발은 칸 정중앙, 칸 폭의 70% 크기, 칸 사이에 넓은 빈 간격.`) + `\n` +
  `깃발 공통: 깃대·사람·배경 그림 없이 천 깃발 한 장만(가로 막대 하나는 허용된 경우만), 정면에서 본 모양, 천 가장자리 윤곽 뚜렷.\n깃발 목록:\n` +
  items.map((f, i) => `${i + 1}) ${f.design}`).join('\n') +
  `\n스타일: ${STYLE}\n배경: ${KEY_BG}. 칸 구분선·테두리·번호를 그리지 않음, 깃발 밖은 모두 같은 순수 마젠타\n` +
  '금지: 글자·숫자·한자·알파벳·서명·낙관, 십자가·초승달·종교 문구·종교 상징, 현대 국기(태극기·일장기 등), 깃대·창·사람·손, 마젠타·분홍·보라를 깃발 색으로 쓰지 않음, 흐림·노이즈';
const arg = process.argv[2] ?? 'all';
// 재생성: r<n>:<id,id> → 시트 id r<n>, 해당 세력만(1~3개, 한 줄 배치). flag_sources.json 에 {id: ["r<n>", 순번], "_count_r<n>": 개수} 를 적어 flag_pp.py 가 읽음
if (/^r\d+:/.test(arg)) { const [sid, list] = arg.split(':'); const it = list.split(',').map((c) => L.find((f) => f.id === c)).filter(Boolean); SHEETS.push({ id: sid, items: it, single: true }); } const force = process.argv.includes('--force');
const ids = arg === 'all' ? SHEETS.filter((s) => !s.single).map((s) => s.id) : /^r\d+:/.test(arg) ? [arg.split(':')[0]] : arg.split(',');
if (process.argv.includes('--dry')) { for (const s of SHEETS.filter((s) => ids.includes(s.id))) console.log(s.id, s.items.map((f) => f.id).join(','), '\n', prompt(s.items)); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const s of SHEETS.filter((x) => ids.includes(x.id))) {
  const out = `${RAW}/flags_${s.id}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${s.id}] 이미 있음`); continue; }
  calls++;
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input: [{ type: 'text', text: prompt(s.items) }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '4:3', image_size: RES.image_size } }) });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'ui_flags', id: `flags_${s.id}`, status: res.status, model: RES.model, codes: s.items.map((f) => f.id) }) + '\n');
  if (res.status === 429) { console.log(`[${s.id}] 429 — 즉시 전체 중단. 완료 ${ok}, 호출 ${calls}`); process.exit(3); }
  const img = res.ok ? find(json) : null;
  if (img) { if (existsSync(out)) { let n = 1; while (existsSync(out.replace('.jpg', `_try${n}.jpg`))) n++; renameSync(out, out.replace('.jpg', `_try${n}.jpg`)); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${s.id}] 성공 ${out}`); }
  else console.log(`[${s.id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
}
console.log(`완료: 성공 ${ok}, 호출 ${calls}`);
