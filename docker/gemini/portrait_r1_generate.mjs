// 초상화 생성기(v2). generate_portrait_alpha.mjs 의 호출 방식(엔드포인트·마젠타 크로마키 구도)을 재사용.
// v2: 스타일 참조 이미지 상시 첨부(REFS 환경변수, 기본 refs 3장), 그림체 일관성 지시, 해부학·그림체 부정 프롬프트 기본 포함.
// 실행: docker run --rm --env-file .env -e PROMPTS=<json> -v "$PWD":/app -w /app node:22 node docker/gemini/portrait_r1_generate.mjs <prompts.json> <outDir> <id,id> [attempt=1] [retry_note]
// 프롬프트 항목에 raw(전체 프롬프트)·refs(배열)를 넣으면 해당 값을 우선 사용(시오리 표정 등).
// 키는 환경변수로만 읽고 출력하지 않는다. 호출 기록은 docker/gemini/portrait_calls_log.json 에 추가.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { STYLE_PROMPT, NEGATIVE_PROMPT } from './style.mjs';

const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const LOG = 'docker/gemini/portrait_calls_log.json';
const DELAY = 4000;
const DEFAULT_REFS = ['docker/gemini/portrait_refs/yi_sun_sin.jpg', 'docker/gemini/portrait_refs/hannibal.jpg', 'docker/gemini/portrait_refs/joan_of_arc.jpg'];
const CHROMA =
  '허리 위 상반신(bust-up) 구도, 정면 또는 3/4 시선, 세로 3:4 비율, 인물은 프레임 중앙에 배치하고 머리 위에 약간의 여백(모자·깃털·무기 끝이 프레임 밖으로 잘리지 않게). ' +
  '배경은 완전히 균일한 순수 마젠타(#FF00FF) 단색 한 가지, 그림자·그라데이션·바닥·테두리·비네팅·배경 소품 없음. ' +
  '캐릭터(의상·피부·머리카락·장식·깃발 포함)에 마젠타·분홍·보라 계열 색 사용 금지, 의상은 다른 색(은색·청색·갈색·금색 등)으로 표현';
const STYLE_CONSISTENCY =
  '그림체 일관성: 첨부한 참조 이미지들은 그림체만 따른다(복식·얼굴·소품은 아래 인물 설명을 기준으로 새로 그린다). 참조 인물의 갑옷·무기·옷 색·모자·장신구를 복사하지 말 것. 설명에 없는 무기를 추가하지 말 것. 균일한 두께의 깔끔한 윤곽선, 평면적 셀 셰이딩, 하이라이트와 그림자는 1~2단계로 제한, ' +
  '장식과 문양은 큰 형태 위주로 단순하게(과밀한 문양 금지), 피부·머리카락은 면 단위로 단순하게 칠하고 질감·그라데이션 최소, 일본 SRPG풍 반신 구도. 피부 가장자리에 얼룩·노이즈 없이 깨끗하게.';
const EXTRA_NEGATIVE =
  'semi-realistic, painterly, detailed shading, gradient, overly ornate, 반사실적 질감 표현 금지, extra hands, extra arms, extra fingers, deformed hands, 손가락 5개 초과·미만 금지, 손과 팔은 각각 정확히 두 개';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('키 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };

const [input, outDir, idsArg, attemptArg, retryNote] = process.argv.slice(2);
const attempt = Number(attemptArg ?? 1);
const ids = idsArg.split(',');
const people = JSON.parse(readFileSync(input, 'utf8'));
mkdirSync(outDir, { recursive: true });
const log = existsSync(LOG) ? JSON.parse(readFileSync(LOG, "utf8")) : {}; if (!Array.isArray(log.calls)) log.calls = [];
let n = 0;
for (const id of ids) {
  const p = people.find((x) => x.id === id);
  if (!p) { console.log(`[${id}] 프롬프트 없음`); continue; }
  if (n++ > 0) await sleep(DELAY);
  const note = retryNote ? ' 추가 지침: ' + retryNote : '';
  const text = p.raw
    ? `${p.raw}${note}\n금지: ${NEGATIVE_PROMPT}, ${EXTRA_NEGATIVE}`
    : `${p.name}(${p.era}) 캐릭터 초상화. ${p.description}${note}\n${STYLE_CONSISTENCY}\n스타일: ${STYLE_PROMPT}\n구도: ${CHROMA}\n금지: ${NEGATIVE_PROMPT}, 화면 속 글자 금지, ${EXTRA_NEGATIVE}`;
  const refs = p.refs ?? DEFAULT_REFS;
  const parts = refs.map((f) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') }));
  parts.push({ type: 'text', text: text });
  const rec = { id, attempt, time: new Date().toISOString(), refs: refs.length, status: null, file: null, verdict: null };
  try {
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150000);
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: parts, response_format: { type: 'image', mime_type: 'image/jpeg', aspect_ratio: '3:4', image_size: '1K' } }), signal: ctrl.signal });
    clearTimeout(t);
    const txt = await res.text(); let j = null; try { j = JSON.parse(txt); } catch {}
    const img = res.ok ? findImage(j) : null;
    rec.status = res.status;
    if (img) { const f = path.join(outDir, attempt > 1 ? `${id}_a${attempt}.jpg` : `${id}.jpg`); writeFileSync(f, Buffer.from(img.data, 'base64')); rec.file = f; console.log(`[${id}] 성공 ${f}`); }
    else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(txt).slice(0, 300)}`);
  } catch (e) { rec.status = 'error'; console.log(`[${id}] 오류 ${scrub(e.message)}`); }
  log.calls.push(rec);
  writeFileSync(LOG, JSON.stringify(log, null, 1));
}
console.log(`이번 실행 호출 ${n}, 누적 ${log.calls.length}`);
