// NPC 전용 전투 스프라이트 생성기(안아트-스프라이트 2026-11-02). hero_v4_gen.mjs 와 같은 호출 방식(1인 = 1호출, 1:1 2K 3x3 시트), 작업 정의 = unit_npc_sprite_style.mjs.
// 실행(프로젝트 루트): sh docker/gemini/unit_npc_sprite_gen.sh code1,code2 [--force] [--note=..] [--extra=..] [--dry]
// 출력: docker/gemini/unit_npc_sprite/raw/<code>.jpg (재생성 시 이전본 <code>_try<n>.jpg 보존). 로그: docker/gemini/unit_npc_sprite/calls_log.jsonl(1줄=1호출)
// 키는 --env-file 로 받은 GEMINI_API_KEY 만 사용(출력·기록 없음, 오류문은 마스킹). 예산 보호: 자동 재시도는 429/5xx 에 한해 1회.
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES } from './style_guide.mjs';
import { job, NPC, RAW, DIR } from './unit_npc_sprite_style.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000, DELAY_MS = 4_000, RETRIES = 1, LOG = `${DIR}/calls_log.jsonl`;
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
for (const c of codes) if (!NPC[c]) { console.error(`작업 없음: ${c}`); process.exit(1); }
const resolveRefs = (refs) => refs.map((r) => (Array.isArray(r) ? r.find((f) => existsSync(f)) : r));
if (process.argv.includes('--dry')) { for (const c of codes) { const j = job(c, extra); console.log(c, resolveRefs(j.refs).join(' | ')); console.log(j.prompt); } process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const code of codes) {
  const out = `${RAW}/${code}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음(--force 로 재생성)`); continue; }
  const j = job(code, extra); const refs = resolveRefs(j.refs);
  if (refs.some((f) => !f || !existsSync(f))) { console.log(`[${code}] 참조 없음 — 건너뜀`); continue; }
  const input = refs.map((f) => ({ type: 'image', mime_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(f).toString('base64') }));
  input.push({ type: 'text', text: j.prompt });
  for (let a = 0; a <= RETRIES; a++) {
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'unit_npc_sprite', id: code, attempt: a, status: res.status, model: RES.model, size: RES.image_size, refs, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${code}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${code}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공`); }
      else { console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); retry = res.status === 429 || res.status >= 500; }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'unit_npc_sprite', id: code, attempt: a, status: 'error', note }) + '\n'); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(DELAY_MS * 4);
  }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 호출 ${calls}회`);
