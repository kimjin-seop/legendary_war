// 스킬 아이콘 시트 생성기(gen.mjs 복제, 작업 목록만 style_skill_icons.mjs). 실행: docker run --rm --env-file .env -e MAX_CALLS=N -e RAW_DIR=public/assets/skill_icons/raw -v "$PWD":/app -w /app node:22 node docker/gemini/skill_icon_gen.mjs skill_icons[:sk01,sk02] | skill_regen(REGEN=code,code)
// 실행: docker run --rm --env-file .env -e MAX_CALLS=20 -v "$PWD":/app -w /app node:22 \
//        node docker/gemini/gen.mjs <category>[:id1,id2] [<category>...]
// 원본 JPEG → public/assets/raw/<category>/<id>.jpg. 호출 내역 → docker/gemini/calls_log.json (키 값은 절대 기록·출력하지 않음).
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { RES } from "./style_guide.mjs";
import { SKILL_SHEETS, NX_SHEETS, regenSheets } from "./style_skill_icons.mjs";
const JOBS = { skill_icons: SKILL_SHEETS, skill_nx: NX_SHEETS, skill_regen: regenSheets((process.env.REGEN ?? "").split(",").filter(Boolean), process.env.REGEN_PREFIX ?? "rg") };

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 120_000, MAX_RETRIES = 2, DELAY_MS = 5_000;
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 10);
const RAW_ROOT = 'public/assets/raw';
const LOG = 'docker/gemini/skill_icon_calls_log.json';
const SKIP_EXISTING = process.env.FORCE !== '1';

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
if (/["'\s]/.test(key)) { console.error('GEMINI_API_KEY 형식 의심'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (n, s) => console.log(`[${n}] ${s}`);

const callLog = existsSync(LOG) ? JSON.parse(readFileSync(LOG, 'utf8')) : { note: '이미지 호출 내역(이번 라운드). 이전 라운드(박백엔) 누적 32회+초상화 8회는 별도', calls: [] };
let calls = 0;
const record = (category, id, status, size) => { callLog.calls.push({ ts: new Date().toISOString(), category, id, status, size: size ?? RES.image_size, ...(process.env.ROUND ? { round: process.env.ROUND } : {}) });writeFileSync(LOG, JSON.stringify(callLog, null, 1)); };

const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };

async function callOnce(item, category) {
  if (calls >= MAX_CALLS) throw new Error('MAX_CALLS');
  calls++;
  const input = [];
  for (const r of item.refs ?? []) {
    const f = path.join(RAW_ROOT, r);
    if (!existsSync(f)) throw new Error(`REF_MISSING:${f}`);
    input.push({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') });
  }
  input.push({ type: 'text', text: item.prompt });
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input: input.length === 1 ? item.prompt : input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: item.aspect ?? '1:1', image_size: item.size ?? RES.image_size } }),
      signal: ctrl.signal,
    });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    record(category, item.id, res.status, item.size);
    return { status: res.status, ok: res.ok, json, raw };
  } finally { clearTimeout(t); }
}

async function generate(item, category, dir) {
  const out = path.join(dir, `${item.id}.jpg`);
  if (SKIP_EXISTING && existsSync(out)) { log(item.id, '이미 있음, 건너뜀(FORCE=1로 재생성)'); return 'skip'; }
  for (let a = 0; a <= MAX_RETRIES; a++) {
    let r;
    try { r = await callOnce(item, category); }
    catch (e) {
      if (e.message === 'MAX_CALLS' || e.message.startsWith('REF_MISSING')) { log(item.id, e.message); return 'stop'; }
      log(item.id, `오류(${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}) 시도 ${a + 1}`);
      if (a < MAX_RETRIES) { await sleep(DELAY_MS * (a + 1)); continue; }
      return 'fail';
    }
    if (r.ok) {
      const img = findImage(r.json);
      if (img) { writeFileSync(out, Buffer.from(img.data, 'base64')); log(item.id, `성공 -> ${out}`); return 'ok'; }
      log(item.id, `이미지 없음: ${scrub(collectText(r.json).join(' | ') || JSON.stringify(r.json, (k, v) => (k === 'data' ? '[b64]' : v))).slice(0, 800)}`);
      return 'fail';
    }
    log(item.id, `HTTP ${r.status} 시도 ${a + 1}: ${scrub(r.raw).slice(0, 600)}`);
    if (r.status === 429) { log(item.id, '429 — 즉시 전체 중단(재시도 금지, 2026-11-04)'); process.exit(3); }
    if (!(r.status >= 500) || a === MAX_RETRIES) return 'fail';
    await sleep(DELAY_MS * (a + 1));
  }
  return 'fail';
}

const args = process.argv.slice(2);
if (!args.length) { console.error(`category: ${Object.keys(JOBS).join('|')}`); process.exit(1); }
let okAll = 0, failAll = 0, consecutiveFail = 0, stop = false;
for (const arg of args) {
  const [category, only] = arg.split(':');
  if (!JOBS[category]) { console.error(`알 수 없는 카테고리 ${category}`); continue; }
  const items = only ? JOBS[category].filter((i) => only.split(',').includes(i.id)) : JOBS[category];
  const dir = process.env.RAW_DIR ?? path.join(RAW_ROOT, category); mkdirSync(dir, { recursive: true }); // RAW_DIR: 새 폴더 산출(예: public/assets/ui_skin/raw)
  for (const item of items) {
    const r = await generate(item, category, dir);
    if (r === 'stop') { stop = true; break; }
    if (r === 'ok') { okAll++; consecutiveFail = 0; await sleep(DELAY_MS); }
    else if (r === 'fail') { failAll++; if (++consecutiveFail >= 3) { console.log('연속 3회 실패로 중단'); stop = true; break; } await sleep(DELAY_MS); }
  }
  if (stop) break;
}
console.log(`완료: 성공 ${okAll}, 실패 ${failAll}, HTTP 호출 ${calls}회 (누적 로그 ${callLog.calls.length}회)`);
process.exit(failAll || stop ? 2 : 0);
