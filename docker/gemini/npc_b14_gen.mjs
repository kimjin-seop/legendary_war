// npc_b14 생성기(안아트 2026-11-08, npc_b11_gen.mjs + npc_b11_portrait_gen.mjs 통합 사본). 작업 정의 = npc_b14_style.mjs.
// 실행(호스트, 프로젝트 루트): MSYS_NO_PATHCONV=1 docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/npc_b14_gen.mjs <sheet|portrait> <codes> [--force] [--note=..] [--extra=..] [--dry]
// 출력: sheet → npc_b14/raw/<code>.jpg, portrait → npc_b14/portraits/raw/portrait_<code>.jpg (재생성 시 이전본 _try<n>.jpg 보존). 장부 npc_b14/calls_log.jsonl(1줄=1호출)
// 한도: 장부 누계 >= CALL_CAP(70) 이면 호출하지 않고 exit 4. 429 → 즉시 중단(exit 3). 자동 재시도 = 5xx/무이미지 1회. 키는 --env-file 로만(출력·기록 없음, 오류문 마스킹)
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, PIXEL64_STYLE, KEY_BG, BASE_NEGATIVE, BASE_STYLE } from './style_guide.mjs';
import { SHEET_RULE3 } from './unit_npc_sprite_style.mjs';
import { G, LOG, PRAW, CALL_CAP, P_B14, OBJ_PORTRAIT, sheetItems, BOAT_SHEET_RULE } from './npc_b14_style.mjs';
import { allJobs } from './portrait_campaign_style.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RETRIES = Number(process.env.RETRIES ?? 1);
const [mode, list] = process.argv.slice(2); const codes = (list ?? '').split(',').filter(Boolean);
const force = process.argv.includes('--force');
const note = (process.argv.find((a) => a.startsWith('--note=')) ?? '').slice(7) || null;
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
const SI = sheetItems(); const J = allJobs();
const NO_SYMBOL = '가문 문장·투구 앞장식(뿔·초승달·큰 장식판)·깃발·글자·한자·숫자·종교 상징 없음, 노출 없음';
const LEAD = '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본의 얼굴·머리·모자·옷·무기·성별·나이·형태는 절대 따르지 않는다.\n';
function sheetJob(code) {
  const h = SI[code]; if (!h) throw new Error(`시트 작업 없음 ${code}`);
  const ex = extra ? `추가 지시(재생성): ${extra}\n` : '';
  if (h.kind === 'boat') return { aspect: '1:1', refs: [h.layoutRef, h.portrait], prompt:
    '첫 번째 참조 이미지는 사물 유닛(수레)의 3x3 방향 도트 시트 견본이다. 칸 배치·도트 1개의 크기·외곽선 두께·위에서 비스듬히 내려다본 시점만 따르고 수레의 형태는 따르지 않는다.\n' +
    `두 번째 참조 이미지는 이 배(${h.name})의 정식 일러스트다. 선체 형태·색·노·밧줄 배치를 똑같이 맞춘다(결과는 도트 스프라이트).\n외형: ${h.desc}.\n방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}.\n${ex}` +
    `시트 규칙: ${BOAT_SHEET_RULE}\n스타일: ${PIXEL64_STYLE}\n금지: ${h.forbid}, 마젠타·분홍·자주.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}` };
  const who = h.kind === 'ink' ? `두 번째 참조 이미지는 이 존재(${h.name})의 정식 초상화다. 형태·색·붉은 표식·소품을 초상화와 똑같이 맞춘다(그림체·구도는 따르지 않고 결과는 전신 도트 스프라이트).\n`
    : `두 번째 참조 이미지는 이 인물(${h.name})의 정식 초상화다. 얼굴 나이감·수염·머리 장비·복식 구성과 색·소지품을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n`;
  return { aspect: '1:1', refs: [h.layoutRef, h.portrait], prompt: LEAD + who +
    `${h.mounted ? '탈것에 탄 기마 인물(탈것과 기수를 한 캐릭터로, 탈것 전체가 칸 안에). ' : ''}외형: ${h.desc}.\n` +
    `방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기(64px)에서도 머리 장비 실루엣·옷 주색·무기가 식별되게 큰 색면으로 또렷하게. ${NO_SYMBOL}.\n${ex}` +
    `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}` };
}
function portraitJob(code) {
  const ex = extra ? `\n추가 지시(재생성): ${extra}` : '';
  const o = OBJ_PORTRAIT[code];
  if (o) return { aspect: '3:4', refs: o.ref ? [o.ref] : [], prompt:
    (o.ref ? '첨부한 참조 이미지는 이 사물의 게임 내 도트 스프라이트다. 형태·색·짐 구성만 따르고, 결과는 도트가 아니라 매끈한 일러스트로 그린다.\n' : '') +
    `판타지 SRPG 의 대화·유닛 정보 초상 칸에 들어갈 사물 아이콘형 일러스트(${o.name}). ${o.desc}.\n` +
    `구도: 세로 3:4, 사물이 프레임 중앙에서 프레임 너비의 80% 정도, 사방에 여백(가장자리에 닿지 않음), 바닥 그림자 없음.\n스타일: ${BASE_STYLE}\n${KEY_BG}\n금지: ${BASE_NEGATIVE}${ex}` };
  if (!P_B14[code]) throw new Error(`초상 작업 없음 ${code}`);
  const j = J[`portrait_${code}`]; if (!j || !j.prompt.includes(P_B14[code].desc.slice(0, 30))) throw new Error(`작업 조립 불일치(같은 id 기존 작업 우선?) ${code}`);
  return { aspect: j.aspect, refs: j.refs, prompt: j.prompt + ex };
}
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const used = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').trim().split('\n').filter(Boolean).length : 0);
if (!['sheet', 'portrait'].includes(mode)) { console.error('mode = sheet|portrait'); process.exit(1); }
const jobOf = (c) => (mode === 'sheet' ? sheetJob(c) : portraitJob(c));
for (const c of codes) jobOf(c);
if (process.argv.includes('--dry')) { for (const c of codes) { const j = jobOf(c); console.log('==', c, j.aspect, j.refs.join(' | ')); console.log(j.prompt); } console.log(`장부 ${used()} / ${CALL_CAP}`); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const RAWD = mode === 'sheet' ? `${G}/raw` : PRAW; mkdirSync(RAWD, { recursive: true }); let ok = 0, calls = 0;
for (const code of codes) {
  const id = mode === 'sheet' ? code : `portrait_${code}`, out = `${RAWD}/${id}.jpg`;
  if (existsSync(out) && !force) { console.log(`[${code}] 이미 있음(--force)`); continue; }
  const j = jobOf(code);
  const miss = j.refs.filter((f) => !existsSync(f)); if (miss.length) { console.log(`[${code}] 참조 없음 ${miss.join(',')} — 건너뜀`); continue; }
  const input = j.refs.map((f) => ({ type: 'image', mime_type: mime(f), data: readFileSync(f).toString('base64') })); input.push({ type: 'text', text: j.prompt });
  for (let a = 0; a <= RETRIES; a++) {
    if (used() >= CALL_CAP) { console.log(`장부 ${used()} >= 상한 ${CALL_CAP} — 중단. 성공 ${ok}, 이번 호출 ${calls}`); process.exit(4); }
    calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000); let retry = false;
    try {
      const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: j.aspect, image_size: RES.image_size } }), signal: ctrl.signal });
      const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
      appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `npc_b14_${mode}`, id, attempt: a, status: res.status, model: RES.model, size: RES.image_size, aspect: j.aspect, note, extra: extra ? extra.slice(0, 200) : null }) + '\n');
      const img = res.ok ? findImage(json) : null;
      if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAWD}/${id}_try${n}.jpg`)) n++; renameSync(out, `${RAWD}/${id}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${code}] 성공`); }
      else if (res.status === 429) { console.log(`[${code}] HTTP 429 — 즉시 중단. 성공 ${ok}, 호출 ${calls}`); process.exit(3); }
      else { console.log(`[${code}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`); retry = res.status >= 500 || (res.ok && !img); }
    } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `npc_b14_${mode}`, id, attempt: a, status: 'error', note }) + '\n'); console.log(`[${code}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); retry = true; }
    finally { clearTimeout(t); }
    if (!retry) break; await sleep(16_000);
  }
  await sleep(3_000);
}
console.log(`완료: 성공 ${ok}/${codes.length}, 이번 호출 ${calls}회, 장부 ${used()}/${CALL_CAP}`);
