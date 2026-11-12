// 서고 실내(L) 키트 생성기(안아트 2026-11-08). kits_gen.mjs 와 같은 규칙·프롬프트 꼬리, 경로만 docker/gemini/library_kit 으로 분리. 작업 정의 = docker/gemini/library_kit/jobs.json
//   { "refs": [같은 문화권 기준 채택본 2장], "lock": "...", "jobs": { id: { "ar": "4:3", "sheet": true|false, "desc": "..." } } }
// 규칙: 기준 채택본 2장 고정(같은 문화권만, 다른 문화권 참조 금지), 정면 3/4 시점, 종교 표지·문장·글자 금지(docs/CULTURE_KITS_BRIEF.md 0-2).
// 사용(프로젝트 루트): docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/library_kit_gen.mjs L id1,id2 [--force]
// 키는 --env-file 로만, 출력·기록 금지. 429 -> 즉시 중단(재시도·증량 없음). 응답 헤더 중 ratelimit/retry/quota 이름만 기록.
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync, mkdirSync } from 'node:fs';
import { RES, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
const [kit, ids] = [process.argv[2], process.argv[3]];
const DIR = `docker/gemini/library_kit`, RAW = `${DIR}/raw`, LOG = `docker/gemini/library_kit_calls_log.jsonl`;
const J = JSON.parse(readFileSync(`${DIR}/jobs.json`, 'utf8'));
const STYLE = '16비트 시절 전략 시뮬레이션 RPG 전장 지도용 도트(픽셀아트) 스프라이트, 큼직한 도트, 굵은 어두운 1픽셀 외곽선, 재질당 3~4단 평면 명암, 채도 중간, 안티앨리어싱·블러·그라데이션 없음';
const STYLE_ONLY = '두 참조 이미지는 이 게임에서 채택한 스프라이트로, 화풍(정면 3/4 시점, 도트 크기감, 디테일 밀도, 외곽선 굵기, 명암 단수, 채도, 왼쪽 위 광원)만 기준이다. 참조의 건축 양식·식생 종류·모양은 따르지 않는다.\n';
const LOCK = '두 참조 이미지는 이 게임에서 이미 채택한 같은 문화권 건물 스프라이트다. 시점(정면 3/4: 앞벽이 화면과 평행하게 정면으로 보이고 지붕은 그 위로 보임, 아이소메트릭·대각선·투시 금지), 도트 크기감, 디테일 밀도, 외곽선 굵기, 명암 단수, 채도, ' +
  '광원(왼쪽 위에서 빛, 오른쪽에 그림자)을 두 참조와 똑같이 맞춘다. 참조의 모양·배치는 복제하지 않는다.\n';
const SHEET = '같은 시트에 아래 4가지를 2열 2행 격자로 넉넉한 마젠타 간격을 두고 따로따로 배치(서로 닿지 않게, 떨어진 조각 없이 각각 한 덩어리). 네 개 모두 같은 시점·같은 축척(사람 키 = 한 칸의 약 3분의 2 기준). ';
const TAIL = `\n스타일: ${STYLE}\n${KEY_BG}. 대상 바깥은 모두 같은 순수 마젠타\n금지: ${BASE_NEGATIVE}, 풀밭·흙길·물·바닥 배경 금지, 글자·문자·문장·종교 상징 금지`;
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
mkdirSync(RAW, { recursive: true });
// 429 가드: 같은 날(UTC) 로그에 429 가 한 번이라도 있으면 호출하지 않고 즉시 종료(연속 실행 체인에서도 추가 호출 방지)
if (existsSync(LOG)) { const today = new Date().toISOString().slice(0, 10); if (readFileSync(LOG, 'utf8').split('\n').some((l) => l.includes('"status":429') && l.includes(`"ts":"${today}`))) { console.log('오늘 429 기록 있음 — 호출 중단'); process.exit(3); } }
for (const id of (ids ?? Object.keys(J.jobs).join(',')).split(',')) {
  const job = J.jobs[id]; const out = `${RAW}/${id}.jpg`;
  if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const refs = (job.refs ?? J.refs).map((f) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') }));
  const prompt = ((job.styleOnly ?? J.styleOnly) ? STYLE_ONLY : LOCK) + ((job.lock ?? J.lock) ? (job.lock ?? J.lock) + '\n' : '') + '그릴 것: ' + (job.sheet ? SHEET : '') + job.desc + TAIL;
  const t0 = Date.now(); const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input: [...refs, { type: 'text', text: prompt }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: job.ar ?? '4:3', image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    const hdr = {}; for (const [k, v] of res.headers) if (/ratelimit|retry|quota/i.test(k)) hdr[k] = v;
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), kit, id, status: res.status, model: RES.model, ms: Date.now() - t0, quota_headers: hdr }) + '\n');
    if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단: ${scrub(raw).slice(0, 300)}`); process.exit(3); }
    const img = res.ok ? find(json) : null;
    if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공`); }
    else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), kit, id, status: 'error' }) + '\n'); console.log(`[${id}] 오류 ${scrub(e.message)}`); }
  finally { clearTimeout(t); }
}
