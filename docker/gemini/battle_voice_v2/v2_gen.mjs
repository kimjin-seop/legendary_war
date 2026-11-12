// 2026-11-09 전투 사망음 v2(짧고 건조한 단말마 0.3~0.6s) 원본 생성. Gemini TTS 짧은 지시형 무언어 발성 -> raw/*.wav
// 실행(저장소 루트): node --env-file=.env docker/gemini/battle_voice_v2/v2_gen.mjs  (JOBS=a,b  MAX_CALLS=n  CHECK=파일|의도+...)
// 키는 환경변수로만 읽고 출력·기록하지 않는다. 모든 호출은 battle_voice_v2/calls_log.jsonl 에 기록(이 작업 상한 40회).
import { writeFileSync, readFileSync, mkdirSync, existsSync, appendFileSync } from 'node:fs';
const DIR = 'docker/gemini/battle_voice_v2', RAW = `${DIR}/raw`, LOG = `${DIR}/calls_log.jsonl`;
const BUDGET = 40;
const TTS_MODEL = process.env.TTS_MODEL ?? 'gemini-2.5-pro-preview-tts';
const CHECK_MODEL = process.env.CHECK_MODEL ?? 'gemini-3.8-flash';
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 0);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('API 키 환경변수 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]').replace(/AIza[0-9A-Za-z_\-]{20,}/g, '[REDACTED]');
mkdirSync(RAW, { recursive: true });
const used = () => (existsSync(LOG) ? readFileSync(LOG, 'utf8').split('\n').filter(Boolean).length : 0);
let calls = 0;
const ledger = (o) => appendFileSync(LOG, JSON.stringify({ at: new Date().toISOString(), ...o }) + '\n');
function gate() { if (MAX_CALLS > 0 && calls >= MAX_CALLS) throw new Error('MAX_CALLS 도달'); if (used() >= BUDGET) throw new Error(`총 한도 ${BUDGET}회 소진`); calls++; }
async function post(url, body) {
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch(url, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    return { ok: res.ok, status: res.status, json, err: res.ok ? null : scrub(raw).slice(0, 300) };
  } finally { clearTimeout(t); }
}
function wav(pcm, sr = 24000) { const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVE', 8); h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(sr, 24); h.writeUInt32LE(sr * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); return Buffer.concat([h, pcm]); }

// 원칙: 단어 없는 발성만, 작품·인물 언급 없음. 목표 = 총에 맞은 듯 즉사하는 병사의 아주 짧고 건조한 단발 비명(신음·한숨·여운 없음)
const SOL = (who) => `${who} is hit and killed instantly in battle. Yell one very short, dry, sharp death yelp, abrupt and cut off at once, about half a second, no moan, no breath after. Leave two seconds of silence between each: "Aagh!" ... "Uagh!" ... "Gah!" ... "Augh!" ... "Hagh!" ... "Aah!"`;
const HER = (who) => `${who} is struck down in battle. Yell one short, loud, sharp death scream full of pain, abruptly cut off, about half a second, no moan, no fading sigh. Leave two seconds of silence between each: "AAAGH!" ... "UWAAGH!" ... "GAAAH!" ... "AARGH!"`;
const SOL2 = (who) => `${who} is shot and killed instantly. One single sharp, dry yelp that bursts out loud and then drops in pitch and stops dead, about four tenths of a second, no moan, no breath. Three separate takes with two seconds of silence between: "AAAGH!" ... "UAAGH!" ... "AGHK!"`;
export const JOBS = {
  a1: { cat: 'die', voice: 'Orus', text: SOL('A young male soldier') },
  a2: { cat: 'die', voice: 'Charon', text: SOL('A male soldier with a deep voice') },
  a3: { cat: 'die', voice: 'Algenib', text: SOL('A gruff male soldier') },
  a4: { cat: 'die', voice: 'Iapetus', text: SOL('A male infantryman') },
  a5: { cat: 'die', voice: 'Umbriel', text: SOL('A male spearman') },
  a6: { cat: 'die', voice: 'Enceladus', text: SOL('A male archer') },
  b1: { cat: 'hero', voice: 'Alnilam', text: HER('A strong male commander') },
  b2: { cat: 'hero', voice: 'Charon', text: HER('A veteran male general with a deep voice') },
  c1: { cat: 'hero_f', voice: 'Zephyr', text: HER('A female warrior commander with a clear high voice') },
  c2: { cat: 'hero_f', voice: 'Kore', text: HER('A brave woman knight') },
  // 2차(0.35~0.45s 몸통 보강): 터지듯 시작해 음정이 뚝 떨어지며 끊기는 한 번의 비명
  e1: { cat: 'die', voice: 'Sadachbia', text: SOL2('A male soldier') },
  e2: { cat: 'die', voice: 'Rasalgethi', text: SOL2('A rough male soldier') },
  e3: { cat: 'die', voice: 'Schedar', text: SOL2('A male infantryman') },
  e4: { cat: 'die', voice: 'Orus', text: SOL2('A young male soldier') },
  e5: { cat: 'die', voice: 'Algenib', text: SOL2('A gruff male soldier') },
  f1: { cat: 'hero_f', voice: 'Zephyr', text: SOL2('A female warrior commander with a clear high voice').replace('dry yelp', 'dry, loud scream') },
  f2: { cat: 'hero_f', voice: 'Leda', text: SOL2('A brave female commander').replace('dry yelp', 'dry, loud scream') },
};
const B = 'https://generativelanguage.googleapis.com/v1beta';
if (process.env.CHECK) {
  const files = process.env.CHECK.split('+');
  try {
    gate();
    const parts = [{ text: `You are an audio QA reviewer for a video game. ${files.length} short clips follow in order. For EACH clip return one JSON array item: {"i":index from 1,"words":"intelligible words heard or empty","what":"short description","gender":"male/female","naturalness":"natural/slightly synthetic/robotic","length_feel":"snappy/ok/too long","artifacts":"glitch/clipping/noise/none","fit":"good/ok/bad"}. Intended: ${process.env.INTENT ?? "a very short dry death yelp of a soldier killed instantly (half a second, abrupt)"}. Clip-specific notes: ${files.map((f, i) => `${i + 1}=${f.split('|')[1] ?? ''}`).join('; ')}. Output only the JSON array.` }];
    for (const f of files) parts.push({ inlineData: { mimeType: 'audio/wav', data: readFileSync(f.split('|')[0]).toString('base64') } });
    const r = await post(`${B}/models/${CHECK_MODEL}:generateContent`, { contents: [{ parts }] });
    const txt = r.json?.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? r.err;
    ledger({ job: 'check', kind: 'listen-qa', model: CHECK_MODEL, n: files.length, ok: r.ok, status: r.status });
    const qp = `${DIR}/qa_listen.json`; const q = existsSync(qp) ? JSON.parse(readFileSync(qp, 'utf8')) : [];
    q.push({ at: new Date().toISOString(), files: files.map((f) => f.split('|')[0]), result: txt }); writeFileSync(qp, JSON.stringify(q, null, 1));
    console.log(txt);
  } catch (e) { console.log('check 오류', scrub(e.message)); }
}
for (const id of (process.env.JOBS ?? '').split(',').filter(Boolean)) {
  try {
    const job = JOBS[id]; if (!job) { console.log(`[${id}] 정의 없음`); continue; }
    const out = `${RAW}/${id}.wav`;
    if (existsSync(out) && !process.env.FORCE) { console.log(`[${id}] 이미 있음`); continue; }
    gate();
    const r = await post(`${B}/models/${TTS_MODEL}:generateContent`, { contents: [{ parts: [{ text: job.text }] }], generationConfig: { responseModalities: ['AUDIO'], speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: job.voice } } } } });
    const d = r.json?.candidates?.[0]?.content?.parts?.find((p) => p.inlineData)?.inlineData;
    ledger({ job: id, kind: 'tts', model: TTS_MODEL, voice: job.voice, category: job.cat, ok: !!d, status: r.status, err: d ? undefined : (r.err ?? 'no audio') });
    if (!d) { console.log(`[${id}] 실패 ${r.status} ${r.err ?? ''}`); continue; }
    const sr = Number(/rate=(\d+)/.exec(d.mimeType ?? '')?.[1] ?? 24000);
    const pcm = Buffer.from(d.data, 'base64'); const isWav = pcm.toString('ascii', 0, 4) === 'RIFF'; writeFileSync(out, isWav ? pcm : wav(pcm, sr));
    console.log(`[${id}] ok ${(pcm.length / 2 / sr).toFixed(2)}s`);
  } catch (e) { console.log(`[${id}] 오류 ${scrub(e.message)}`); if (/한도|MAX_CALLS/.test(e.message)) break; }
}
console.log(`이번 호출 ${calls}, 누적 ${used()}/${BUDGET}`);
