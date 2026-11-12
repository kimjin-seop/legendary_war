// 병종 아이콘 보충(안아트 2026-11-08): gunner·naval·assassin·monster 전용 아이콘 4종 2x2 시트 1장.
// 참조 = 기존 병종 아이콘 시트 원본(raw/ui/icons_a.jpg, 같은 그림체·금 외곽선·크기). 후처리: troop_icon_pp.py
// 실행: docker run --rm --env-file .env -e MAX_CALLS=N -v "$PWD":/app -w /app node:22 node docker/gemini/troop_icon_gen.mjs [id]
// 호출 내역 → docker/gemini/troop_icon_calls_log.jsonl (키 값은 기록·출력하지 않음)
import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync } from 'node:fs';
import { RES, UI_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 1);
const LOG = 'docker/gemini/troop_icon_calls_log.jsonl';
const OUT = 'public/assets/raw/ui/troop_extra';
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };

const LIST = [
  '병종 총병: 화승총(머스킷) 한 자루만 대각선(왼쪽 아래 개머리 → 오른쪽 위 총구)으로. 나무 개머리판과 긴 쇠 총열, 방아쇠와 용두(화승 집게), 총구 끝에 작은 연기 한 줄기. 활·화살·시위 없음',
  '병종 수병: 금빛 테두리의 큰 쇠 닻 하나(위 고리, 가로 막대, 아래 양쪽으로 휘어진 갈고리 팔), 닻 줄기에 감긴 굵은 갈색 밧줄',
  '병종 암살자: 짧고 날이 휘지 않은 단검 하나를 칼끝이 아래로 향하게 비스듬히, 짧은 손잡이와 작은 코등이, 칼날 옆에 어두운 남색 두건 천 조각이 휘날림. 방패 없음',
  '병종 마물: 정면을 보는 괴수 머리 하나(붉은 갈색 피부, 굽은 금빛 뿔 두 개, 노란 눈, 드러낸 송곳니), 사람 얼굴 아님',
];
const prompt = `첨부한 참조 이미지(기존 병종 아이콘 시트)와 같은 그림체·선 굵기·금색 외곽선·색감·명암·아이콘 크기로, 새 병종 아이콘 4개를 그린다. 참조 시트의 아이콘을 그대로 복제하지 말 것.
UI 아이콘 시트 1장: 정확히 2열x2행 균등 격자(4칸), 왼쪽 위부터 오른쪽으로, 줄을 바꿔 아래로 순서대로 한 칸에 아이콘 1개씩. 목록: ${LIST.map((s, i) => `${i + 1}) ${s}`).join(' / ')}.
각 아이콘은 칸 중앙에 칸의 약 70% 크기, 칸 사이 여백 충분, 격자선·칸 테두리 없음.
스타일: ${UI_STYLE}
${KEY_BG}
금지: ${BASE_NEGATIVE}`;

const id = process.argv[2] ?? 'troop_extra_a';
mkdirSync(OUT, { recursive: true });
if (existsSync(`${OUT}/${id}.jpg`) && process.env.FORCE !== '1') { console.log('이미 있음'); process.exit(0); }
if (MAX_CALLS < 1) process.exit(0);
const input = [{ type: 'image', mime_type: 'image/jpeg', data: readFileSync('public/assets/raw/ui/icons_a.jpg').toString('base64') }, { type: 'text', text: prompt }];
const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 150_000);
try {
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '1:1', image_size: RES.image_size } }), signal: ctrl.signal });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch {}
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'troop_icon_extra', id, status: res.status, model: RES.model, size: RES.image_size }) + '\n');
  const img = res.ok && findImage(json);
  if (img) { writeFileSync(`${OUT}/${id}.jpg`, Buffer.from(img.data, 'base64')); console.log('ok', id); }
  else console.log('fail', res.status, scrub(raw).slice(0, 400));
} catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'troop_icon_extra', id, status: 'error' }) + '\n'); console.log('error', scrub(e.message)); }
finally { clearTimeout(t); }
