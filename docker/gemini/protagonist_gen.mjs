// 주인공 에셋 생성기(초상화·전신·방향 시트 공용). 작업 정의는 protagonist_style.mjs(allJobs). 호출 방식은 hero_v4_gen.mjs 와 동일.
// 실행(프로젝트 루트): sh docker/gemini/protagonist_gen.sh id1,id2 [--force] [--note=..] [--extra=..] [--dry]
// 출력: docker/gemini/protagonist_raw/<id>.jpg (재생성 시 이전본 <id>_try<n>.jpg 보존). 로그: docker/gemini/protagonist_calls_log.jsonl(1줄=1호출)
// 키는 --env-file 로 받은 GEMINI_API_KEY 만 사용(출력·기록 없음, 오류문은 마스킹)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES } from './style_guide.mjs';
import { allJobs, RAW } from './protagonist_style.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000, DELAY_MS = 3_000, RETRIES = 2, LOG = 'docker/gemini/protagonist_calls_log.jsonl';
const J = allJobs();
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const ids = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
for (const id of ids) if (!J[id]) { console.error(`작업 없음: ${id}`); process.exit(1); }
if (process.argv.includes('--dry')) { for (const id of ids) { console.log(id, J[id].aspect, J[id].refs.join(' | ')); console.log(J[id].prompt + (extra ? `\n추가 지시(재생성): ${extra}` : '')); } process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const id of ids) {
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
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `protagonist_${j.kind}`, id, attempt: a, status: res.status, model: RES.model, size: RES.image_size, aspect: j.aspect, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${id}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${id}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${id}] 성공`); }
      else { console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); retry = res.status === 429 || res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `protagonist_${j.kind}`, id, attempt: a, status: 'error', note }) + '\n'); console.log(`[${id}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(DELAY_MS * (a + 2) * 3);
  }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${ids.length}, 호출 ${calls}회`);
