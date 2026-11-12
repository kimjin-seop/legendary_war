// 구대륙 교체 영웅 초상 생성기(안아트 2026-11-04, hero_exp1_gen.mjs 사본: 429 즉시 전체 중단, 5xx/무이미지만 1회 재시도). 정의 oldworld_style.mjs
// 차이: HTTP 429 를 받으면 재시도하지 않고 즉시 전체 중단(한도 증량 금지 지시). 5xx/무이미지만 1회 재시도.
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/hero_exp1_gen.mjs <ids|all> [--force] [--note=..] [--extra=..] [--dry]
// 출력: docker/gemini/portrait_campaign/raw/portrait_<code>.jpg (재생성 시 이전본 _try<n>.jpg 보존). 로그: portrait_campaign/calls_log.jsonl(공용) + hero_exp1/calls_log.jsonl(배치 전용)
// 키는 --env-file 로 받은 GEMINI_API_KEY 만 사용(출력·기록 없음, 오류문은 마스킹)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES } from './style_guide.mjs';
import { IDS, OW_LOG as EXP1_LOG } from './oldworld_style.mjs';
import { allJobs, RAW, LOG } from './portrait_campaign_style.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000, DELAY_MS = 3_000, RETRIES = 1;
const J = allJobs();
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = process.argv[2] ?? '';
const ids = arg === 'all' ? IDS : arg.split(',').filter(Boolean).map((s) => (s.startsWith('portrait_') ? s : `portrait_${s}`));
const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
for (const id of ids) if (!J[id] || !IDS.includes(id)) { console.error(`작업 없음: ${id}`); process.exit(1); }
if (process.argv.includes('--dry')) { for (const id of ids) { console.log('==', id, J[id].aspect, J[id].refs.join(' | ')); console.log(J[id].prompt + (extra ? `\n추가 지시(재생성): ${extra}` : '')); } process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); mkdirSync(EXP1_LOG.replace(/\/[^/]+$/, ''), { recursive: true });
let ok = 0, calls = 0, stopped = false;
const log = (o) => { const l = JSON.stringify(o) + '\n'; appendFileSync(LOG, l); appendFileSync(EXP1_LOG, l); };
outer: for (const id of ids) {
  const j = J[id], out = `${RAW}/${id}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${id}] 이미 있음(--force 로 재생성)`); continue; }
  const missing = j.refs.filter((f) => !existsSync(f)); if (missing.length) { console.log(`[${id}] 참조 없음 ${missing.join(',')} — 건너뜀`); continue; }
  const input = j.refs.map((f) => ({ type: 'image', mime_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(f).toString('base64') }));
  input.push({ type: 'text', text: j.prompt + (extra ? `\n추가 지시(재생성): ${extra}` : '') });
  for (let a = 0; a <= RETRIES; a++) {
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: j.aspect, image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      log({ ts: new Date().toISOString(), category: 'portrait_oldworld', id, attempt: a, status: res.status, model: RES.model, size: RES.image_size, aspect: j.aspect, note, extra: extra ? extra.slice(0, 200) : null });
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${id}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${id}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${id}] 성공`); }
      else if (res.status === 429) { console.log(`[${id}] HTTP 429 — 한도 도달, 즉시 중단: ${scrub(raw).slice(0, 200)}`); stopped = true; break outer; }
      else { console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { log({ ts: new Date().toISOString(), category: 'portrait_oldworld', id, attempt: a, status: 'error', note }); console.log(`[${id}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(DELAY_MS * 4);
  }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${ids.length}, 호출 ${calls}회${stopped ? ' — 429 로 중단' : ''}`);
