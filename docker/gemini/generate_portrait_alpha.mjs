// 크로마키(마젠타 배경) 초상화 재생성. generate_portrait.mjs 의 호출 방식을 복사한 별도 파일.
// 실행: docker run --rm --env-file .env -v "$PWD":/app -w /app node:22 \
//        node docker/gemini/generate_portrait_alpha.mjs [인물.json] [출력디렉터리] [id,id,...]
// 키는 GEMINI_API_KEY 환경변수로만 읽고 x-goog-api-key 헤더로만 전달. 출력하지 않는다.
// 호출 상한: MAX_CALLS(기본 5) 초과 시 즉시 중단.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { STYLE_PROMPT, NEGATIVE_PROMPT } from './style.mjs';

const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const ASPECT_RATIO = '3:4';
const IMAGE_SIZE = '1K';
const MIME_TYPE = 'image/jpeg';
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const DELAY_BETWEEN_MS = 5_000;
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 5);
const DEFAULT_OUT = 'public/assets/test/portraits_alpha/src_chroma';

// 구도: 배경 규칙을 크로마키용으로 대체 (style.mjs 의 COMPOSITION_PROMPT 는 '어두운 톤' 배경이라 사용하지 않음)
const CHROMA_COMPOSITION =
  '허리 위 상반신(bust-up) 구도, 정면 또는 3/4 시선, 세로 3:4 비율, 인물은 프레임 중앙에 배치하고 머리 위에 약간의 여백. ' +
  '배경은 완전히 균일한 순수 마젠타(#FF00FF) 단색 한 가지, 그림자·그라데이션·바닥·테두리·비네팅·배경 소품 없음. ' +
  '캐릭터(의상·피부·머리카락·장식·깃발 포함)에 마젠타·분홍·보라 계열 색 사용 금지, 의상은 다른 색(은색·청색·갈색·금색 등)으로 표현';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (name, status) => console.log(`[${name}] ${status}`);

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
if (/["'\s]/.test(key)) { console.error('GEMINI_API_KEY 형식 의심(따옴표/공백 포함)'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');

let calls = 0;

function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'image' && typeof node.data === 'string') return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) { const f = findImage(v); if (f) return f; }
  return null;
}
function collectText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
  for (const v of Array.isArray(node) ? node : Object.values(node)) collectText(v, out);
  return out;
}

function buildPrompt(p) {
  // 인물 설명 중 마젠타/분홍과 충돌할 수 있는 색 언급이 없는지는 입력 JSON 쪽 책임
  return `${p.name}(${p.era}) 캐릭터 초상화. ${p.description}\n스타일: ${STYLE_PROMPT}\n구도: ${CHROMA_COMPOSITION}\n금지: ${NEGATIVE_PROMPT}`;
}

async function callOnce(prompt) {
  if (calls >= MAX_CALLS) { console.error(`호출 상한(${MAX_CALLS}) 도달, 중단`); process.exit(3); }
  calls++;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        response_format: { type: 'image', mime_type: MIME_TYPE, aspect_ratio: ASPECT_RATIO, image_size: IMAGE_SIZE },
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 비JSON */ }
    return { status: res.status, ok: res.ok, json, raw: text };
  } finally { clearTimeout(t); }
}

async function generate(p, outDir) {
  const prompt = buildPrompt(p);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let r;
    try { r = await callOnce(prompt); }
    catch (e) {
      log(p.name, `오류(${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}) 시도 ${attempt + 1}`);
      if (attempt < MAX_RETRIES) { await sleep(DELAY_BETWEEN_MS * (attempt + 1)); continue; }
      return false;
    }
    if (r.ok) {
      const img = findImage(r.json);
      if (img) {
        const file = path.join(outDir, `${p.id}.jpg`);
        writeFileSync(file, Buffer.from(img.data, 'base64'));
        log(p.name, `성공 -> ${file}`);
        return true;
      }
      log(p.name, `이미지 없음(거부 의심): ${scrub(collectText(r.json).join(' | ') || JSON.stringify(r.json, (k, v) => (k === 'data' ? '[base64]' : v)).slice(0, 2000))}`);
      return false;
    }
    const retryable = r.status === 429 || r.status >= 500;
    log(p.name, `HTTP ${r.status} 시도 ${attempt + 1}: ${scrub(r.raw).slice(0, 1500)}`);
    if (!retryable || attempt === MAX_RETRIES) return false;
    await sleep(DELAY_BETWEEN_MS * (attempt + 1));
  }
  return false;
}

const input = process.argv[2] ?? 'docker/gemini/test2_portraits.json';
const outDir = process.argv[3] ?? DEFAULT_OUT;
const only = (process.argv[4] ?? 'yi_sun_sin,hannibal,joan_of_arc').split(',');
const people = JSON.parse(readFileSync(input, 'utf8')).filter((p) => only.includes(p.id));
mkdirSync(outDir, { recursive: true });

let okCount = 0;
for (let i = 0; i < people.length; i++) {
  if (i > 0) await sleep(DELAY_BETWEEN_MS);
  if (await generate(people[i], outDir)) okCount++;
  else if (process.env.CONTINUE_ON_FAIL !== '1') { console.log('실패로 중단'); break; }
}
console.log(`완료: ${okCount}/${people.length}, 총 호출 ${calls}`);
process.exit(okCount === people.length ? 0 : 2);
