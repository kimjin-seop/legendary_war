// ch25 NPC 초상 6 생성기(안아트 2026-11-07, portrait_campaign_gen.mjs 복제 — 호출 형식 동일). 차이: 별도 raw·장부(ch25_portraits/), 자동 재시도 없음, 호출 전 장부 한도(CALL_LIMIT) 확인.
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/ch25_portraits_gen.mjs <code,...> [--force] [--note=..] [--extra=..] [--dry]
// code = npc_toghan 등(portrait_ 접두 없이). 출력 raw/portrait_<code>.jpg(재생성 시 이전본 _try<n>.jpg 보존). 키는 --env-file 로만(출력·기록 없음, 오류문 마스킹)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES } from './style_guide.mjs';
import { RAW, LOG, CALL_LIMIT, P_CH25 } from './ch25_portraits_style.mjs';
import { allJobs } from './portrait_campaign_style.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000, DELAY_MS = 3_000;
const J = allJobs();
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
for (const c of codes) {
  if (!P_CH25[c]) { console.error(`ch25 작업 아님: ${c}`); process.exit(1); }
  const j = J[`portrait_${c}`]; if (!j || !j.prompt.includes(P_CH25[c].desc.slice(0, 40))) { console.error(`작업 조립 불일치(기존 같은 id 우선?): ${c}`); process.exit(1); }
}
if (process.argv.includes('--dry')) { for (const c of codes) { const j = J[`portrait_${c}`]; console.log(c, j.aspect, j.refs.join(' | ')); console.log(j.prompt + (extra ? `\n추가 지시(재생성): ${extra}` : '')); } process.exit(0); }
const used = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const c of codes) {
  const id = `portrait_${c}`, j = J[id], out = `${RAW}/${id}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${c}] 이미 있음(--force 로 재생성)`); continue; }
  if (used() >= CALL_LIMIT) { console.log(`호출 한도 ${CALL_LIMIT} 도달 — 중단(장부 ${used()})`); break; }
  const input = j.refs.map((f) => ({ type: 'image', mime_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(f).toString('base64') }));
  input.push({ type: 'text', text: j.prompt + (extra ? `\n추가 지시(재생성): ${extra}` : '') });
  calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: j.aspect, image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'ch25_portrait', id, status: res.status, model: RES.model, size: RES.image_size, aspect: j.aspect, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
    const img = res.ok ? findImage(json) : null;
    if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${id}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${id}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${c}] 성공`); }
    else {
      console.log(`[${c}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`);
      if (res.status === 429) { console.log(`429 — 즉시 전체 중단. 성공 ${ok}, 호출 ${calls}`); process.exit(3); }
    }
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'ch25_portrait', id, status: 'error', note }) + '\n'); console.log(`[${c}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); }
  finally { clearTimeout(t); }
  await sleep(DELAY_MS);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 이번 호출 ${calls}회, 장부 누계 ${used()}/${CALL_LIMIT}`);
