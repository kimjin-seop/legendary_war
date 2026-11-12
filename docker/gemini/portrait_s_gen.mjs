// S등급 초상 시안 생성(안아트 2026-11-04, 팀장 허용 = 시안 최대 2회). 정의 portrait_s_style.mjs. 429 → 즉시 중단. 키는 --env-file 로만
//   인자: s_yi_sun_sin | s_bg_a (쉼표 구분). 출력 docker/gemini/portrait_s/raw/<id>.jpg
import { writeFileSync, existsSync, mkdirSync, appendFileSync, readFileSync, renameSync } from 'node:fs';
import { RES } from './style_guide.mjs';
import { S_SAMPLE, S_NEW, S_BG_B, sFigurePrompt, sBgSheetPrompt } from './portrait_s_style.mjs';
import { S_OW } from './oldworld_style.mjs';   // 2026-11-04 구대륙 교체 S(아킬레우스)
// 2차(2026-11-04): S_NEW 영웅은 portrait_campaign/raw/portrait_<code>.jpg 로 출력(portrait_campaign_pp.sh 재사용), s_bg_b = 배경 시트 2
Object.assign(S_SAMPLE, { s_bg_b: S_BG_B }, Object.fromEntries(Object.entries({ ...S_NEW, ...S_OW }).map(([c, h]) => [c, { ...h, out: `docker/gemini/portrait_campaign/raw/portrait_${c}.jpg` }])));
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RAW = 'docker/gemini/portrait_s/raw', LOG = 'docker/gemini/portrait_s/calls_log.jsonl';
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
const mime = (f) => (f.endsWith('.png') ? 'image/png' : f.endsWith('.webp') ? 'image/webp' : 'image/jpeg');
mkdirSync(RAW, { recursive: true });
for (const id of (process.argv[2] ?? '').split(',').filter(Boolean)) {
  const j = S_SAMPLE[id]; if (!j) { console.log(`[${id}] 정의 없음`); continue; }
  const out = j.out ?? `${RAW}/${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const text = j.themes ? sBgSheetPrompt(j.themes) : sFigurePrompt(j);
  const input = [...(j.ref ? [{ type: 'image', mime_type: mime(j.ref), data: readFileSync(j.ref).toString('base64') }] : []), { type: 'text', text }];
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '3:4', image_size: RES.image_size } }) });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'portrait_s_sample', id, status: res.status, model: RES.model }) + '\n');
  if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
  const img = res.ok ? find(json) : null;
  if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${out}`); } else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
}
