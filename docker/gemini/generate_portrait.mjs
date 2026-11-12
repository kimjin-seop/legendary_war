// Gemini 이미지 생성(Interactions API, gemini-nano-banana-2.1)으로 영웅 초상화 생성.
// 실행: docker run --rm --env-file .env -v "$PWD":/app -w /app node:22 \
//        node docker/gemini/generate_portrait.mjs [인물.json] [출력디렉터리]
// 키는 환경변수 GEMINI_API_KEY 로만 읽고, 헤더(x-goog-api-key)로만 전달한다. 어떤 경로로도 출력하지 않는다.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { STYLE_PROMPT, COMPOSITION_PROMPT, NEGATIVE_PROMPT } from './style.mjs';

// ---- 설정 (한 곳에서 수정) ----
const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
// 스타일/구도/negative 상수는 style.mjs 한 곳에서 관리 (타일·스프라이트·이펙트와 공유)
const ASPECT_RATIO = '3:4';
const IMAGE_SIZE = '1K';
const MIME_TYPE = 'image/jpeg'; // 문서/서버 확인: 현재 image/jpeg만 지원
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;        // 실패 시 재시도 최대 2회 (일시 오류만)
const DELAY_BETWEEN_MS = 5_000; // 호출 간 대기
const DEFAULT_OUT = 'public/images/portraits/test2';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (name, status) => console.log(`[${name}] ${status}`);

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
if (/["'\s]/.test(key)) { console.error('GEMINI_API_KEY 형식 의심(따옴표/공백 포함)'); process.exit(1); }

// 에러 문자열에 키가 섞이지 않도록 마스킹
const scrub = (s) => String(s).split(key).join('[REDACTED]');

// 응답에서 image 블록(type=image, data=base64)을 재귀 탐색
function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'image' && typeof node.data === 'string') return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const f = findImage(v);
    if (f) return f;
  }
  return null;
}
// 텍스트 블록(거부 사유 등) 수집
function collectText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
  for (const v of Array.isArray(node) ? node : Object.values(node)) collectText(v, out);
  return out;
}

function buildPrompt(p) {
  return `${p.name}(${p.era}) 캐릭터 초상화. ${p.description}\n스타일: ${STYLE_PROMPT}\n구도: ${COMPOSITION_PROMPT}\n금지: ${NEGATIVE_PROMPT}`;
}

async function callOnce(prompt) {
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
  } finally {
    clearTimeout(t);
  }
}

async function generate(p, outDir) {
  const prompt = buildPrompt(p);
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    let r;
    try {
      r = await callOnce(prompt);
    } catch (e) {
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
      // 이미지 없음: 거부/안전정책 가능성 -> 재시도하지 않고 사유 원문 출력
      log(p.name, `이미지 없음(거부 의심). 응답 텍스트/상태: ${scrub(collectText(r.json).join(' | ') || JSON.stringify(r.json, (k, v) => (k === 'data' ? '[base64]' : v)).slice(0, 2000))}`);
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
const people = JSON.parse(readFileSync(input, 'utf8'));
mkdirSync(outDir, { recursive: true });

let okCount = 0;
for (let i = 0; i < people.length; i++) {
  if (i > 0) await sleep(DELAY_BETWEEN_MS);
  if (await generate(people[i], outDir)) okCount++;
  else if (process.env.CONTINUE_ON_FAIL !== '1') { console.log('실패로 중단(남은 인물 호출 안 함)'); break; }
}
console.log(`완료: ${okCount}/${people.length}`);
process.exit(okCount === people.length ? 0 : 2);
