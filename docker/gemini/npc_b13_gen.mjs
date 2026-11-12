// [npc_b13 사본(npc_b11_gen.mjs, 안아트 2026-11-08 에셋 완비 배치 C): 경로 npc_b13, 예산 가드 = npc_b13 자체 로그(목표 34·상한 50)] npc_b9 시트 생성기 골격 — 1:1 2K 3x3 시트, refs = 병종 견본 + 정식 초상.
// 작업 정의 = docker/gemini/npc_b13/plan.json(npc_b13_plan.mjs). 프롬프트 골격 = unit_npc_sprite_style.mjs SHEET_RULE3 + style_guide.mjs(단일 출처).
// 호출 예산 가드: npc_b13/calls_log.jsonl 누계가 STOP_AT(기본·하드 상한 50) 이상이면 호출하지 않고 exit 4.
// HTTP 429 → 즉시 전체 중단(exit 3). 5xx/무이미지만 1회 재시도(RETRIES=0 으로 끔). 키는 --env-file 로만 받음(출력·기록 없음).
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b13_gen.mjs <codes> [--force] [--note=..] [--extra=..] [--dry]
// 출력: docker/gemini/npc_b13/raw/<code>.jpg(재생성 시 이전본 <code>_try<n>.jpg 보존). 로그: docker/gemini/npc_b13/calls_log.jsonl(1줄=1호출)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
import { SHEET_RULE3 } from './unit_npc_sprite_style.mjs';
const G = 'docker/gemini/npc_b13', RAW = `${G}/raw`, LOG = `${G}/calls_log.jsonl`;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const HARD_CAP = 50, STOP_AT = Math.min(Number(process.env.STOP_AT ?? 50), HARD_CAP), RETRIES = Number(process.env.RETRIES ?? 1);
const P = JSON.parse(readFileSync(`${G}/plan.json`, 'utf8')).items;
const NO_SYMBOL = '가문 문장·투구 앞장식(뿔·초승달·큰 장식판)·깃발·글자·한자·숫자·종교 상징 없음, 노출 없음';
const LEAD = '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·모자·옷·무기·성별·나이는 절대 따르지 않는다.\n';
function job(code, extra) {
  const h = P[code]; if (!h) throw new Error(`plan.json 에 ${code} 없음`);
  const prompt = LEAD +
    `두 번째 참조 이미지는 이 인물(${h.name})의 정식 초상화다. 얼굴 나이감·수염·머리 장비·복식 구성과 색·소지품·성별을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n` +
    `${h.mounted ? '말에 탄 기마 인물(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). ' : ''}외형: ${h.desc}.\n` +
    `방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기(64px)에서도 머리 장비 실루엣·옷 주색·무기가 식별되게 큰 색면으로 또렷하게. ${NO_SYMBOL}.\n` +
    (extra ? `추가 지시(재생성): ${extra}\n` : '') +
    `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { refs: [h.layoutRef, h.portrait], prompt };
}
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cnt = (f) => (existsSync(f) ? readFileSync(f, 'utf8').trim().split('\n').filter(Boolean).length : 0);
const used = () => cnt(LOG); // 누계 = npc_b13 로그(배치 C 상한 50)

const codes = (process.argv[2] ?? '').split(',').filter(Boolean); const force = process.argv.includes('--force');
for (const c of codes) if (!P[c]) { console.error(`작업 없음: ${c}`); process.exit(1); }
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
if (process.argv.includes('--dry')) { for (const c of codes) { const j = job(c, extra); console.log('==', c, j.refs.join(' | ')); console.log(j.prompt); } console.log(`누계 ${used()} / STOP_AT ${STOP_AT}`); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const code of codes) {
  const out = `${RAW}/${code}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음(--force 로 재생성)`); continue; }
  const j = job(code, extra);
  if (j.refs.some((f) => !existsSync(f))) { console.log(`[${code}] 참조 없음 — 건너뜀`); continue; }
  const input = j.refs.map((f) => ({ type: 'image', mime_type: mime(f), data: readFileSync(f).toString('base64') }));
  input.push({ type: 'text', text: j.prompt });
  for (let a = 0; a <= RETRIES; a++) {
    if (used() >= STOP_AT) { console.log(`호출 누계 ${used()} >= STOP_AT ${STOP_AT} — 중단`); console.log(`완료: 성공 ${ok}, 이번 호출 ${calls}회 — 예산 중단`); process.exit(4); }
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'npc_b13_sprite', id: code, tier: P[code].tier, attempt: a, status: res.status, model: RES.model, size: RES.image_size, aspect: '1:1', note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${code}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${code}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공`); }
      else if (res.status === 429) { console.log(`[${code}] HTTP 429 — 한도 도달, 즉시 중단`); console.log(`완료: 성공 ${ok}, 이번 호출 ${calls}회 — 429 중단`); process.exit(3); }
      else { console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'npc_b13_sprite', id: code, attempt: a, status: 'error', note }) + '\n'); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(16_000);
  }
  await sleep(3_000);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 이번 호출 ${calls}회, 누계 ${used()}`);
