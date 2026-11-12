// Lyria 3.5(Interactions API)로 BGM 5곡 원본(MP3) 생성. 후처리(루프 이음새/용량)는 bgm_postprocess.sh.
// 실행: docker run --rm --env-file .env -e MAX_CALLS=8 -v "$PWD":/app -w /app node:22 node docker/gemini/generate_bgm.mjs
// 키는 환경변수로만 읽고 출력하지 않는다.
import { writeFileSync, mkdirSync } from 'node:fs';
import { BGM_STYLE_PROMPT } from './style.mjs';

const MODEL = 'lyria-3.5';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const OUT = 'public/assets/audio/_raw';
const TIMEOUT_MS = 300_000, MAX_RETRIES = 2, DELAY_MS = 5_000;
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 0);

const SLOTS = [
  ['bgm_title', 'title screen theme: grand, heroic and slightly nostalgic, solemn orchestral intro with a memorable lead melody on strings and synth, slow-to-mid tempo'],
  ['bgm_map', 'lobby / world map theme: calm, warm and adventurous, light orchestral with soft synth pads and acoustic guitar, relaxed mid tempo'],
  ['bgm_battle', 'tactical battle theme: tense and driving, fast orchestral strings and brass with synth bass and rhythmic percussion, determined and energetic'],
  ['bgm_gacha', 'summoning / gacha theme: mystical and anticipatory, shimmering synth arpeggios, choir-like pads, harp and bells, building tension and a bright release'],
  ['bgm_result', 'results screen theme: triumphant and uplifting, bright brass fanfare feeling, joyful orchestral melody with synth sparkle, moderate tempo'],
].map(([id, d]) => ({ id, prompt: `${BGM_STYLE_PROMPT}. Japanese fantasy tactics RPG video game background music, 16-bit era melodic sensibility but modern orchestral/synth production. ${d}. Instrumental only, no vocals, no lyrics. Original composition, not imitating any existing song. Create a song of about 90 seconds that can loop smoothly.` }));

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
if (/["'\s]/.test(key)) { console.error('GEMINI_API_KEY 형식 의심(따옴표/공백 포함)'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (n, s) => console.log(`[${n}] ${s}`);
let calls = 0;
function findAudio(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'audio' && typeof n.data === 'string') return n;
  for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findAudio(v); if (f) return f; }
  return null;
}
async function callOnce(prompt) {
  if (MAX_CALLS > 0 && calls >= MAX_CALLS) throw new Error('MAX_CALLS 도달');
  calls++;
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, input: prompt }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    return { status: res.status, ok: res.ok, json, raw };
  } finally { clearTimeout(t); }
}
mkdirSync(OUT, { recursive: true });
let ok = 0;
for (let i = 0; i < SLOTS.length; i++) {
  if (i > 0) await sleep(DELAY_MS);
  const s = SLOTS[i]; let done = false;
  for (let a = 0; a <= MAX_RETRIES && !done; a++) {
    let r;
    try { r = await callOnce(s.prompt); } catch (e) {
      log(s.id, `오류(${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}) 시도 ${a + 1}`);
      if (e.message.startsWith('MAX_CALLS')) break; await sleep(DELAY_MS * (a + 1)); continue;
    }
    if (r.ok) {
      const au = findAudio(r.json);
      if (au) { writeFileSync(`${OUT}/${s.id}.mp3`, Buffer.from(au.data, 'base64')); log(s.id, '성공'); ok++; done = true; }
      else { log(s.id, `오디오 없음: ${scrub(JSON.stringify(r.json, (k, v) => (k === 'data' ? '[base64]' : v))).slice(0, 1500)}`); break; }
    } else {
      log(s.id, `HTTP ${r.status} 시도 ${a + 1}: ${scrub(r.raw).slice(0, 1500)}`);
      if (!(r.status === 429 || r.status >= 500)) break; await sleep(DELAY_MS * (a + 1));
    }
  }
  if (!done) { console.log('실패로 중단'); break; }
}
console.log(`완료: ${ok}/${SLOTS.length}, HTTP 호출 ${calls}회`);
process.exit(ok === SLOTS.length ? 0 : 2);
