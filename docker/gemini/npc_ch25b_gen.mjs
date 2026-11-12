// npc_ch25b 생성기(안아트 2026-11-08): 초상(p) = npc_b11_portrait_gen.mjs, 시트(s) = npc_b11_gen.mjs 와 같은 호출 방식·프롬프트 골격. 정의 = npc_ch25b_style.mjs
// 장부 = docker/gemini/npc_ch25b/calls_log.jsonl(초상·시트 공용, 1줄=1호출). 상한 24(목표 14) — 호출 전 확인, 넘으면 exit 4. 429 → 즉시 중단(exit 3). 자동 재시도 없음.
// 키는 --env-file 로만(출력·기록 없음, 오류문 마스킹).
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_ch25b_gen.mjs <p|s> <codes> [--force] [--note=..] [--extra=..] [--dry]
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
import { SHEET_RULE3 } from './unit_npc_sprite_style.mjs';
import { P_CH25B, RAW_P, RAW_S, LOG, CALL_LIMIT, plan } from './npc_ch25b_style.mjs';
import { allJobs } from './portrait_campaign_style.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const NO_SYMBOL = '가문 문장·투구 앞장식(뿔·초승달·큰 장식판)·깃발·글자·한자·숫자·종교 상징 없음, 노출 없음';
const LEAD = '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·모자·옷·무기·성별·나이는 절대 따르지 않는다.\n';
const [mode, list] = process.argv.slice(2); const codes = (list ?? '').split(',').filter(Boolean);
const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
const P = await plan(); const J = allJobs();
function sheetJob(code) {
  const h = P[code];
  const prompt = LEAD +
    `두 번째 참조 이미지는 이 인물(${h.name})의 정식 초상화다. 얼굴 나이감·수염·머리 장비·복식 구성과 색·소지품·성별을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n` +
    `외형: ${h.desc}.\n방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side_view}. 작은 크기(64px)에서도 머리 장비 실루엣·옷 주색·무기가 식별되게 큰 색면으로 또렷하게. ${NO_SYMBOL}.\n` +
    (h.naval_read ? `${h.naval_read}.\n` : '') + (extra ? `추가 지시(재생성): ${extra}\n` : '') +
    `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { id: code, aspect: '1:1', refs: [h.layoutRef, h.portrait], prompt, out: RAW_S, cat: 'npc_ch25b_sprite' };
}
function portraitJob(code) {
  const j = J[`portrait_${code}`];
  if (!P_CH25B[code] || !j || !j.prompt.includes(P_CH25B[code].desc.slice(0, 40))) throw new Error(`초상 작업 조립 불일치: ${code}`);
  return { id: `portrait_${code}`, aspect: j.aspect, refs: j.refs, prompt: j.prompt + (extra ? `\n추가 지시(재생성): ${extra}` : ''), out: RAW_P, cat: 'npc_ch25b_portrait' };
}
if (!['p', 's'].includes(mode) || !codes.length) { console.error('사용: <p|s> code1,code2'); process.exit(1); }
const jobs = codes.map((c) => { if (mode === 's' && !P[c]) { console.error(`작업 없음 ${c}`); process.exit(1); } return mode === 'p' ? portraitJob(c) : sheetJob(c); });
const cnt = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
if (process.argv.includes('--dry')) { for (const j of jobs) { console.log('==', j.id, j.refs.join(' | ')); console.log(j.prompt); } console.log(`장부 ${cnt()}/${CALL_LIMIT}`); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let ok = 0, calls = 0;
for (const j of jobs) {
  mkdirSync(j.out, { recursive: true }); const out = `${j.out}/${j.id}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${j.id}] 이미 있음(--force 로 재생성)`); continue; }
  if (j.refs.some((f) => !existsSync(f))) { console.log(`[${j.id}] 참조 없음 — 건너뜀 ${j.refs.filter((f) => !existsSync(f))}`); continue; }
  if (cnt() >= CALL_LIMIT) { console.log(`장부 ${cnt()} >= 상한 ${CALL_LIMIT} — 중단`); process.exit(4); }
  const input = j.refs.map((f) => ({ type: 'image', mime_type: mime(f), data: readFileSync(f).toString('base64') })); input.push({ type: 'text', text: j.prompt });
  calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: j.aspect, image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: j.cat, id: j.id, status: res.status, model: RES.model, size: RES.image_size, aspect: j.aspect, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
    const img = res.ok ? findImage(json) : null;
    if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${j.out}/${j.id}_try${n}.jpg`)) n++; renameSync(out, `${j.out}/${j.id}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${j.id}] 성공`); }
    else { console.log(`[${j.id}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); if (res.status === 429) { console.log('429 — 즉시 중단'); process.exit(3); } }
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: j.cat, id: j.id, status: 'error', note }) + '\n'); console.log(`[${j.id}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); }
  finally { clearTimeout(t); }
  await sleep(3_000);
}
console.log(`완료: 성공 ${ok}/${jobs.length}, 이번 호출 ${calls}회, 장부 ${cnt()}/${CALL_LIMIT}`);
