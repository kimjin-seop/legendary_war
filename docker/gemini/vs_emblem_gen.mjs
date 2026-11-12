// 서가 지도 가운데 VS 엠블럼 생성기(안아트 2026-11-04). 시트 2장: notext(A/B/C 3안 가로 한 줄), text(A/B/C 에 'VS' 새김). 마젠타 배경, 16:9.
// 출력 public/assets/ui/vs_emblem/raw/<id>.jpg, 로그 docker/gemini/vs_emblem_calls_log.jsonl. 429 → 즉시 중단. 키는 --env-file 로만
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'node:fs';
import { RES, KEY_BG } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RAW = 'public/assets/ui/vs_emblem/raw', LOG = 'docker/gemini/vs_emblem_calls_log.jsonl';
const STYLE = '고급 모바일 역사 전략 RPG 의 UI 엠블럼 일러스트: 오래된 고지도·서고 톤(양피지색, 낡은 금속 금테, 진한 남청과 적갈 포인트), 굵고 깔끔한 짙은 갈색 윤곽선, 셀 셰이딩 2~3단, 광원 왼쪽 위, 금속에 은은한 광택, 64px 로 줄여도 실루엣이 또렷';
const V = [
  'A안: 둥근 청동 방패 메달(가장자리에 금빛 꼬임 무늬 테, 안쪽은 진한 남청 법랑) 뒤로 X 자로 교차한 두 자루 곧은 장검(칼끝은 위, 금빛 손잡이)',
  'B안: 양피지색 둥근 인장(밀랍 봉인처럼 가장자리가 물결 모양, 적갈색) 위에 금빛 테두리, 그 뒤로 X 자로 교차한 두 자루 긴 창(창날은 위, 붉은 술 장식)',
  'C안: 팔각형 금속 메달(낡은 금빛 테 + 작은 리벳 8개, 안쪽 진한 남청) 위에 X 자로 교차한 칼과 창(칼은 왼쪽 아래→오른쪽 위, 창은 반대), 메달 아래 좌우로 짧게 늘어진 적갈색 리본 두 갈래',
];
const JOBS = {
  vs_notext: `UI 엠블럼 3개를 가로 한 줄로 균등 간격 배치(왼쪽부터 A, B, C), 각 엠블럼은 화면 높이의 60% 크기, 엠블럼 사이 넓은 빈 간격.\n${V.join('\n')}\n세 안 모두 정면, 대칭 구도, 메달 가운데는 비워 둠(글자·기호를 넣지 않음).\n스타일: ${STYLE}\n배경: ${KEY_BG}. 엠블럼 밖은 모두 같은 순수 마젠타, 그림자·바닥 반사 없음\n금지: 글자·숫자·알파벳·한자·문장·십자가·종교 상징, 현대 게임 UI 스톡 아이콘 느낌, 네온·발광 효과, 마젠타·분홍·보라 색 사용`,
  vs_text: `UI 엠블럼 3개를 가로 한 줄로 균등 간격 배치(왼쪽부터 A, B, C), 각 엠블럼은 화면 높이의 60% 크기, 엠블럼 사이 넓은 빈 간격.\n${V.join('\n')}\n세 안 모두 메달 가운데에 굵은 로마 대문자 세리프 글자 "VS" 두 글자만 금속 양각으로 새김(글자 색은 밝은 금, 짙은 갈색 윤곽). V 와 S 외의 글자 없음.\n스타일: ${STYLE}\n배경: ${KEY_BG}. 엠블럼 밖은 모두 같은 순수 마젠타, 그림자·바닥 반사 없음\n금지: VS 외의 글자·숫자·문장·십자가·종교 상징, 현대 게임 UI 스톡 아이콘 느낌, 네온·발광 효과, 마젠타·분홍·보라 색 사용`,
};
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
mkdirSync(RAW, { recursive: true });
for (const id of (process.argv[2] ?? 'vs_notext,vs_text').split(',')) {
  const out = `${RAW}/${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input: [{ type: 'text', text: JOBS[id] }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '16:9', image_size: RES.image_size } }) });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'ui_vs_emblem', id, status: res.status, model: RES.model }) + '\n');
  if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
  const img = res.ok ? find(json) : null;
  if (img) { writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${out}`); } else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
}
