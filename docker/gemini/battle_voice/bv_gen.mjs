// 전투 음성(함성·비명·사망 외침) 원본 생성: Gemini TTS 로 '말 없는 발성'만 요청 -> PCM(24kHz mono 16bit) WAV 저장.
// 실행: docker run --rm --env-file .env -e JOBS=a1,a2 -e MAX_CALLS=10 -v "$PWD":/app -w /app node:22 node docker/gemini/battle_voice/bv_gen.mjs
//   JOBS=list  -> TTS 모델 목록 조회(1회 호출로 기록)
//   JOBS=check:<wav,...> -> 오디오 이해 모델로 자동 청취 점검(말이 섞였는지, 소리 성격) 결과를 qa_listen.json 에 기록
// 키는 환경변수로만 읽고 출력·기록하지 않는다. 모든 호출은 battle_voice/calls_log.jsonl 에 기록(오디오 총 40회 한도).
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
import { JOBS } from './bv_jobs.mjs';

const DIR = 'docker/gemini/battle_voice', RAW = `${DIR}/raw`, LOG = `${DIR}/calls_log.jsonl`;
const BUDGET = 50; // 2026-11-07 첫 제작 30회 + 2026-11-08 단말마 재제작 상한 20회
const TTS_MODEL = process.env.TTS_MODEL ?? 'gemini-2.5-flash-preview-tts';
const CHECK_MODEL = process.env.CHECK_MODEL ?? 'gemini-2.5-flash';
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 0);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]').replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[REDACTED]');
mkdirSync(RAW, { recursive: true });
const used = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length : 0);
let calls = 0;
function ledger(o) { appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n'); }
function gate() {
  if (MAX_CALLS > 0 && calls >= MAX_CALLS) throw new Error('MAX_CALLS 도달');
  if (used() >= BUDGET) throw new Error(`총 한도 ${BUDGET}회 소진`);
  calls++;
}
async function post(url, body) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(url, { method: body ? 'POST' : 'GET', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined, signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    return { ok: res.ok, status: res.status, json, err: res.ok ? null : scrub(raw).slice(0, 300) };
  } finally { clearTimeout(t); }
}
function wav(pcm, sr = 24000) {
  const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12);
  h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
  h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]);
}
const B = 'https://generativelanguage.googleapis.com/v1beta';
const list = (process.env.JOBS ?? '').split(',').filter(Boolean);
for (const id of list) {
  try {
    if (id === 'list') {
      gate(); const r = await post(`${B}/models?pageSize=200`);
      const names = (r.json?.models ?? []).map((m) => m.name).filter((n) => /tts|audio|native/i.test(n));
      ledger({ job: 'list', kind: 'models.list', ok: r.ok, status: r.status }); console.log(names.join('\n') || r.err); continue;
    }
    if (id.startsWith('check:')) {
      const files = id.slice(6).split('+');
      gate();
      const parts = [{ text: `You are an audio QA reviewer for a video game. ${files.length} short clips follow in order. For EACH clip answer in one JSON array item: {"i":index starting 1,"words":"any intelligible words/language heard or empty","what":"short description of the sound (e.g. male battle cry, pained scream, horse neigh, crowd roar)","voices":"approx number of voices","gender":"male/female/mixed/none","artifacts":"robotic/glitch/clipping/background noise or none","fit":"good/ok/bad as the intended game sound described next"}. Intended sounds: ${files.map((f, i) => `${i + 1}=${f.split('|')[1] ?? ''}`).join('; ')}. Output only the JSON array.` }];
      for (const f of files) parts.push({ inlineData: { mimeType: 'audio/wav', data: readFileSync(f.split('|')[0]).toString('base64') } });
      const r = await post(`${B}/models/${CHECK_MODEL}:generateContent`, { contents: [{ parts }] });
      const txt = r.json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? r.err;
      ledger({ job: 'check', kind: 'listen-qa', model: CHECK_MODEL, n: files.length, ok: r.ok, status: r.status });
      const q = existsSync(`${DIR}/qa_listen.json`) ? JSON.parse(readFileSync(`${DIR}/qa_listen.json`, 'utf8')) : [];
      q.push({ at: new Date().toISOString(), files: files.map((f) => f.split('|')[0]), result: txt }); writeFileSync(`${DIR}/qa_listen.json`, JSON.stringify(q, null, 1));
      console.log(txt); continue;
    }
    const job = JOBS[id]; if (!job) { console.log(`[${id}] 정의 없음`); continue; }
    const out = `${RAW}/${id}.wav`;
    if (existsSync(out) && !process.env.FORCE) { console.log(`[${id}] 이미 있음, 건너뜀`); continue; }
    gate();
    const r = await post(`${B}/models/${TTS_MODEL}:generateContent`, {
      contents: [{ parts: [{ text: job.text }] }],
      generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: job.voice } } } },
    });
    const d = r.json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    ledger({ job: id, kind: 'tts', model: TTS_MODEL, voice: job.voice, category: job.cat, ok: !!d, status: r.status, err: d ? undefined : (r.err ?? 'no audio') });
    if (!d) { console.log(`[${id}] 실패 ${r.status} ${r.err ?? ''}`); continue; }
    const sr = Number(/rate=(\d+)/.exec(d.mimeType ?? '')?.[1] ?? 24000);
    const pcm = Buffer.from(d.data, 'base64'); const isWav = pcm.toString('ascii', 0, 4) === 'RIFF'; writeFileSync(out, isWav ? pcm : wav(pcm, sr)); // 신모델은 WAV 컨테이너로 응답
    console.log(`[${id}] ok ${(pcm.length / 2 / sr).toFixed(2)}s ${d.mimeType}`);
  } catch (e) { console.log(`[${id}] 오류 ${scrub(e.message)}`); if (/한도|MAX_CALLS/.test(e.message)) break; }
}
console.log(`이번 호출 ${calls}, 누적 ${used()}/${BUDGET}`);
