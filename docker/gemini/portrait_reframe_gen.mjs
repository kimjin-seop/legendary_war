// 위가 잘린 기존 영웅 초상의 아웃페인트 재구도(안아트 2026-11-02, portrait_campaign_gen.mjs 호출 방식 복제).
// 입력: docker/gemini/portrait_framing/reframe/in/<code>.png (reframe_prep.py: 원본을 아래 잘림선 고정 0.88배 축소 + 마젠타 캔버스)
// 실행(프로젝트 루트): docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/portrait_reframe_gen.mjs code1,code2 [--extra=..]
// 출력: docker/gemini/portrait_framing/reframe/raw/<code>.jpg (재실행 시 이전본 <code>_try<n>.jpg 보존), 로그 reframe/calls_log.jsonl
// 키는 --env-file 로 받은 GEMINI_API_KEY 만 사용(출력·기록 없음, 오류문 마스킹). 영웅당 재생성 최대 2회(호출 측에서 관리).
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, BASE_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';

const DIR = 'docker/gemini/portrait_framing/reframe', RAW = `${DIR}/raw`, LOG = `${DIR}/calls_log.jsonl`;
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const TIMEOUT_MS = 180_000;
const HAT = {
  gwanggaeto: '투구 꼭대기의 금빛 날개 모양 장식(깃털처럼 갈라진 금속 날개 한 쌍)과 투구 정수리를, 이미 보이는 부분의 모양·색·선을 그대로 이어서 완성',
  sejong: '검은 익선관의 윗부분을, 이미 보이는 모양 그대로 둥근 모정(관 정수리)과 그 뒤에서 위로 솟은 작고 둥근 날개 두 개까지 이어서 완성(날개는 짧고 위로 서 있으며 관 높이를 크게 넘지 않음)',
  npc_jiang_wei: '검은 쇠 투구 정수리의 붉은 술(말총 술) 윗부분을 이미 보이는 모양·색 그대로 짧게 이어 완성, 그리고 왼쪽의 창: 위로 잘린 창날 끝을 이미 보이는 창날 모양 그대로 뾰족하게 완성(창대의 붉은 술은 그대로)',
  npc_craterus: '청동 투구 꼭대기의 진한 갈색 말총 볏 윗부분을, 이미 보이는 볏 모양·색·선 그대로 짧게 이어 완성(볏은 투구 위로 낮게 아치를 그림)',
  jeong_yakyong: '검은 갓의 대우(원통형 모자 부분)를, 이미 보이는 부분 그대로 위가 평평하고 약간 좁아지는 원통으로 이어서 완성(갓 높이는 얼굴 길이의 0.6 정도)',
};
const prompt = (code) =>
  '첨부 이미지는 완성된 게임 초상 일러스트를 작게 줄여 마젠타 배경 위에 놓은 것이다. 원래 그림이 프레임 밖으로 나가 있던 탓에 지금은 ' +
  '머리 위 장식의 윗부분이 수평으로 싹둑 잘려 있고, 좌우 가장자리에서 어깨·팔·소매·소품이 세로로 잘려 있다.\n' +
  '할 일: 잘려 나간 부분만 자연스럽게 이어 그려 그림을 완성한다.\n' +
  `- 머리 위: ${HAT[code]}.\n` +
  '- 좌우: 세로로 잘린 어깨·팔·소매·소품을 같은 옷 주름·색·선으로 바깥쪽까지 이어 그림(프레임 좌우 가장자리에 닿거나 넘어가도 됨).\n' +
  '- 아래: 지금처럼 프레임 아래 가장자리에서 잘린 상태 유지.\n' +
  '절대 바꾸지 않을 것: 인물의 얼굴·표정·나이·수염·머리 모양, 복식의 형태·색·무늬, 소품, 인물의 위치와 크기, 선 굵기·셀 셰이딩·광원(왼쪽 위). 이미 그려진 부분은 픽셀 그대로 유지한다고 생각하고 새 요소를 추가하지 않는다.\n' +
  `스타일: ${BASE_STYLE}\n${KEY_BG}. 잘린 곳 이외의 배경은 지금과 같은 순수 마젠타 그대로.\n금지: ${BASE_NEGATIVE}, 인물 확대·축소·이동, 다른 사람, 배경 그림`;
const findImage = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; } return null; };
const collectText = (n, o = []) => { if (!n || typeof n !== 'object') return o; if (n.type === 'text' && typeof n.text === 'string') o.push(n.text); for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o); return o; };
const ids = (process.argv[2] ?? '').split(',').filter(Boolean);
const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
for (const id of ids) if (!HAT[id]) { console.error(`작업 없음: ${id}`); process.exit(1); }
if (process.argv.includes('--dry')) { for (const id of ids) console.log(id, '\n' + prompt(id)); process.exit(0); }
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
mkdirSync(RAW, { recursive: true }); let ok = 0, calls = 0;
for (const id of ids) {
  const out = `${RAW}/${id}.jpg`, inp = `${DIR}/in/${id}.png`;
  const input = [{ type: 'image', mime_type: 'image/png', data: readFileSync(inp).toString('base64') },
    { type: 'text', text: prompt(id) + (extra ? `\n추가 지시(재생성): ${extra}` : '') }];
  calls++; const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '3:4', image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'portrait_reframe', id, status: res.status, model: RES.model, size: RES.image_size, extra: extra ? extra.slice(0, 200) : null }) + '\n');
    const img = res.ok ? findImage(json) : null;
    if (img) { if (existsSync(out)) { let n = 1; while (existsSync(`${RAW}/${id}_try${n}.jpg`)) n++; renameSync(out, `${RAW}/${id}_try${n}.jpg`); } writeFileSync(out, Buffer.from(img.data, 'base64')); ok++; console.log(`[${id}] 성공`); }
    else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(res.ok ? collectText(json).join(' | ') : raw).slice(0, 300)}`);
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'portrait_reframe', id, status: 'error' }) + '\n'); console.log(`[${id}] 오류 ${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}`); }
  finally { clearTimeout(t); }
  await new Promise((r) => setTimeout(r, 3000));
}
console.log(`완료: 성공 ${ok}/${ids.length}, 호출 ${calls}회`);
