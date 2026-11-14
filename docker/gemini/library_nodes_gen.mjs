// 잊힌 서고 지도 노드 아이콘·소품 생성기(안아트 2026-11-14). 작업 = library_nodes_style.mjs JOBS. 원본 -> docker/gemini/library_nodes/raw/<id>.jpg
// 실행(저장소 루트): docker run --rm --env-file .env -v "<repo>:/app" -w /app node:22 node docker/gemini/library_nodes_gen.mjs n1[,n2] [--force]
// 키는 --env-file 로만, 출력·기록 금지. 429 -> 즉시 중단. 호출 기록 docker/gemini/library_nodes_calls_log.jsonl, 예산 BUDGET 도달 시 호출 안 함.
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs';
import { JOBS, RES, REFS, BUDGET } from './library_nodes_style.mjs';
const RAW = 'docker/gemini/library_nodes/raw', LOG = 'docker/gemini/library_nodes_calls_log.jsonl';
const key = process.env.GEMINI_API_KEY; if (!key || /["'\s]/.test(key)) { console.error('GEMINI_API_KEY 없음/형식 의심'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const used = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
const ids = (process.argv[2] ?? '').split(',').filter(Boolean);
await Promise.all(ids.map(async (id, i) => {
  if (used() + i >= BUDGET) { console.log(`[${id}] 예산 ${BUDGET}회 소진`); return; }
  const job = JOBS[id]; const out = `${RAW}/${id}.jpg`;
  if (!job) { console.log(`[${id}] 정의 없음`); return; }
  if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); return; }
  const input = [...(job.refs ?? REFS).map((f) => ({ type: 'image', mime_type: mime(f), data: readFileSync(f).toString('base64') })), { type: 'text', text: job.prompt + (process.env.EXTRA ? '\n' + process.env.EXTRA : '') }];
  const t0 = Date.now(); const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 360_000);
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: job.aspect, image_size: job.size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), id, status: res.status, model: RES.model, size: job.size, aspect: job.aspect, extra: !!process.env.EXTRA, ms: Date.now() - t0 }) + '\n');
    if (res.status === 429) { console.log(`[${id}] 429 — 중단: ${scrub(raw).slice(0, 300)}`); return; }
    const img = res.ok ? find(json) : null;
    if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${Date.now() - t0}ms`); }
    else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 300)}`);
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), id, status: 'error' }) + '\n'); console.log(`[${id}] 오류 ${scrub(e.name === 'AbortError' ? 'timeout' : e.message)}`); }
  finally { clearTimeout(t); }
}));
