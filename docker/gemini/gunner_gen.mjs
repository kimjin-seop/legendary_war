// [사본 2026-11-03] npc_b5_gen.mjs + noPortrait(참조 = 병종 견본만). 작업 정의 gunner_style.mjs
// 승격 NPC 시트 7 + ch23/24 NPC 7 생성기(안아트 2026-11-03). 호출 방식은 portrait_campaign_gen.mjs(3:4) / unit_npc_sprite_gen.mjs(1:1 3x3 시트)와 동일.
// 차이: HTTP 429 → 재시도 없이 즉시 전체 중단(exit 3). 5xx/무이미지만 1회 재시도. 시트 참조 = 병종 견본(S_B4.layoutRef) + 초상(PORTRAIT_SRC 또는 portrait_campaign/out).
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b4_gen.mjs portrait|sprite <codes|all> [--force] [--note=..] [--extra=..] [--dry]
// 출력: 초상 raw = portrait_campaign/raw/portrait_<code>.jpg, 시트 raw = unit_npc_sprite/raw/<code>.jpg. 로그: 공용 로그 + npc_b4/calls_log.jsonl. 키는 --env-file 로만(출력·기록 없음)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES } from './style_guide.mjs';
import { P_IDS, S_IDS, S_B4, PORTRAIT_SRC, P_B4, G } from './gunner_style.mjs';
import { allJobs, RAW as PRAW, LOG as PLOG } from './portrait_campaign_style.mjs';
import { job as sjob, RAW as SRAW, DIR as SDIR } from './unit_npc_sprite_style.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const mode = process.argv[2], arg = process.argv[3] ?? '';
if (!['portrait', 'sprite'].includes(mode)) { console.error('mode = portrait | sprite'); process.exit(1); }
const ALL = mode === 'portrait' ? P_IDS : S_IDS;
const codes = arg === 'all' ? ALL : arg.split(',').filter(Boolean);
for (const c of codes) if (!ALL.includes(c)) { console.error(`작업 없음: ${c}`); process.exit(1); }
const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
const PJ = allJobs();
const build = (c) => {
  if (mode === 'portrait') { const j = PJ[`portrait_${c}`]; let p = j.prompt; if (P_B4[c].boy) p = p.replace('성인 남성', '10대 중반 소년(미성년 — 단정하고 노출 없는 복장, 어린아이처럼 과장하지 않음)'); return { refs: j.refs, prompt: p + (extra ? `\n추가 지시(재생성): ${extra}` : ''), out: `${PRAW}/portrait_${c}.jpg`, aspect: '3:4', log: PLOG }; }
  const j = sjob(c, extra), h = S_B4[c];
  const por = PORTRAIT_SRC[c] ?? [`docker/gemini/portrait_campaign/out/${c}.png`, `docker/gemini/portrait_campaign/raw/portrait_${c}.jpg`].find((f) => existsSync(f));
  return { refs: h.noPortrait ? [h.layoutRef] : [h.layoutRef, por], prompt: j.prompt, out: `${SRAW}/${c}.jpg`, aspect: '1:1', log: `${SDIR}/calls_log.jsonl` };
};
if (process.argv.includes('--dry')) { for (const c of codes) { const b = build(c); console.log('==', c, b.aspect, b.refs.join(' | ')); console.log(b.prompt.slice(0, 1500)); } process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
mkdirSync(G, { recursive: true }); mkdirSync(PRAW, { recursive: true }); mkdirSync(SRAW, { recursive: true });
let ok = 0, calls = 0;
for (const c of codes) {
  const b = build(c);
  if (existsSync(b.out) && !force) { console.log(`[${c}] 이미 있음(--force 로 재생성)`); continue; }
  if (b.refs.some((f) => !f || !existsSync(f))) { console.log(`[${c}] 참조 없음 — 건너뜀 ${b.refs}`); continue; }
  const input = b.refs.map((f) => ({ type: 'image', mime_type: f.endsWith('.png') ? 'image/png' : 'image/jpeg', data: readFileSync(f).toString('base64') }));
  input.push({ type: 'text', text: b.prompt });
  for (let a = 0; a <= 1; a++) {
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: b.aspect, image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      const rec = JSON.stringify({ ts: new Date().toISOString(), category: `npc_b4_${mode}`, id: mode === 'portrait' ? `portrait_${c}` : c, attempt: a, status: res.status, model: RES.model, size: RES.image_size, aspect: b.aspect, note, extra: extra ? extra.slice(0, 200) : null }) + '\n';
      appendFileSync(b.log, rec); appendFileSync(`${G}/calls_log.jsonl`, rec);
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(b.out)) { let n = 1; while (existsSync(b.out.replace('.jpg', `_try${n}.jpg`))) n++; renameSync(b.out, b.out.replace('.jpg', `_try${n}.jpg`)); } writeFileSync(b.out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${c}] 성공`); }
      else if (res.status === 429) { console.log(`[${c}] HTTP 429 — 한도 도달, 즉시 중단`); console.log(`완료: 성공 ${ok}/${codes.length}, 호출 ${calls}회 — 429 중단`); process.exit(3); }
      else { console.log(`[${c}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(`${G}/calls_log.jsonl`, JSON.stringify({ ts: new Date().toISOString(), id: c, mode, attempt: a, status: 'error', note }) + '\n'); console.log(`[${c}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(16_000);
  }
  await sleep(3_000);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 호출 ${calls}회`);
