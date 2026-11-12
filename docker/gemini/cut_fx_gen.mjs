// 전투 컷신 붓 스트로크·상성 리본 생성기(안아트 2026-11-04). 참고: 사용자 제공 컷신 레퍼런스(초상 뒤 청·흰 붓 사선, 상단 검은 붓 띠 리본).
// jobs: cut_brush_ally(청·흰, 1:1) / cut_brush_enemy(적·흰, 1:1) / cut_ribbon(검은 붓 + 붉은 결, 21:9). 마젠타 배경 → cut_fx_pp.py
// 기준 방향: 왼쪽 진영 기준(바깥 = 왼쪽 아래 모서리 → 안쪽 = 오른쪽 위). 오른쪽 진영은 FE 가 좌우 반전. 429 → 즉시 중단. 키는 --env-file 로만
import { writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { RES, KEY_BG } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RAW = 'public/assets/fx/cut/raw', LOG = 'docker/gemini/cut_fx_calls_log.jsonl';
const STYLE = '고급 모바일 역사 전략 RPG 전투 컷신 연출용 붓터치 그래픽: 굵은 붓을 한 번에 힘차게 그은 수묵·유화 붓 자국, 획 가장자리에 갈필(마른 붓 자국) 결과 흩날리는 작은 먹 방울, 획 안쪽에 붓털 결 줄무늬, 평면 그래픽(입체 그림자·배경 없음)';
const NEG = '글자·숫자·문양·인물·무기·사물 금지, 배경 그림 금지, 테두리·액자 금지, 마젠타·분홍·보라 색 사용 금지, 흐림·노이즈 금지';
const brush = (c1, c2) => `붓 스트로크 그래픽 1장: 정사각 화면의 왼쪽 아래 모서리 바깥에서 시작해 오른쪽 위로 비스듬히(약 40도) 그어 올린 넓은 붓 획 두세 겹. 가장 넓은 획 폭은 화면의 45%, 시작(왼쪽 아래)은 진하고 넓으며 오른쪽 위 끝으로 갈수록 갈필로 갈라져 가늘어지고 화면 안에서 끝남. ` +
  `색: 주 획은 ${c1}, 그 위에 겹친 가는 흰 획 한두 줄과 흰 물보라 같은 붓 자국, 획 가장자리 일부에 ${c2}.\n스타일: ${STYLE}\n배경: ${KEY_BG}. 붓 획 밖은 모두 같은 순수 마젠타\n금지: ${NEG}`;
const JOBS = {
  cut_brush_ally: ['1:1', brush('짙은 청색(#1E4FA8)과 밝은 하늘색(#5FA8E8) 그라데이션', '은은한 청록 기운')],
  cut_brush_enemy: ['1:1', brush('짙은 진홍(#A8241E)과 주황빛 적색(#E0503A) 그라데이션', '짙은 적갈')],
  cut_ribbon: ['21:9', `가로로 긴 붓 띠 그래픽 1장: 왼쪽에서 오른쪽으로 한 번에 그은 굵은 수평 붓 획 하나(화면 폭의 92%, 높이의 34%), 양 끝은 갈필로 거칠게 갈라지며 가늘어짐, 가운데 70% 구간은 폭이 일정해 가로로 늘려도 어색하지 않음. ` +
    `색: 아주 짙은 남흑색(#141826) 먹 바탕에 붉은 붓털 결(#B0302A) 줄무늬가 가로로 몇 줄 비침, 위아래 가장자리에 아주 가는 붉은 테.\n스타일: ${STYLE}\n배경: ${KEY_BG}. 붓 띠 밖은 모두 같은 순수 마젠타\n금지: ${NEG}`],
};
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
mkdirSync(RAW, { recursive: true });
for (const id of (process.argv[2] ?? Object.keys(JOBS).join(',')).split(',')) {
  const out = `${RAW}/${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const [ar, prompt] = JOBS[id];
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input: [{ type: 'text', text: prompt }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: ar, image_size: RES.image_size } }) });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'cut_fx', id, status: res.status, model: RES.model }) + '\n');
  if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
  const img = res.ok ? find(json) : null;
  if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${out}`); } else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
}
