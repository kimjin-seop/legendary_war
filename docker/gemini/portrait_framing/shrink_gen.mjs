// 과하게 큰 초상 축소 재구도(아웃페인트) 생성기(안아트 2026-11-03, portrait_reframe_gen.mjs 와 같은 호출 방식). 입력 reframe/in/<code>_shrink.png(shrink_prep.py)
// 출력 reframe/raw/<code>_shrink.jpg, 로그 reframe/calls_log.jsonl. 429 -> 즉시 중단. 키는 --env-file 로만(출력·기록 없음)
import { readFileSync, writeFileSync, existsSync, renameSync, appendFileSync } from 'node:fs';
import { RES, BASE_STYLE, KEY_BG, BASE_NEGATIVE } from '../style_guide.mjs';
const DIR = 'docker/gemini/portrait_framing/reframe', ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const code = process.argv[2]; const MODE = process.argv.includes('--recolor') ? 'recolor' : 'shrink'; const extra = (process.argv.find((a) => a.startsWith('--extra=')) ?? '').slice(8) || null;
const prompt0 = '첨부 이미지는 완성된 게임 초상 일러스트를 조금 작게 줄여 마젠타 배경 위에 놓은 것이다. 줄인 탓에 그림 아래쪽(허리 아래)과 좌우 어깨·팔 바깥에 빈 마젠타 띠가 생겼다.\n' +
  '할 일: 빈 띠 부분만 자연스럽게 이어 그려 그림을 완성한다. 아래쪽: 이미 보이는 겉옷·갑옷·허리띠·소매를 같은 주름·색·선으로 프레임 아래 가장자리까지 이어 그림(아래 가장자리에서 잘린 상태). 좌우: 잘린 어깨·소매·소품이 있으면 같은 모양으로 이어 그림.\n' +
  '절대 바꾸지 않을 것: 인물의 얼굴·표정·나이·수염·머리 모양·관, 복식의 형태·색·무늬, 소품, 인물의 위치와 크기, 선 굵기·셀 셰이딩·광원(왼쪽 위). 이미 그려진 부분은 그대로 유지. 머리 위 여백은 지금 그대로.\n' +
  `스타일: ${BASE_STYLE}\n${KEY_BG}. 인물 바깥 배경은 순수 마젠타 그대로.\n금지: ${BASE_NEGATIVE}, 인물 확대·축소·이동, 다른 사람, 배경 그림` + (extra ? `\n추가 지시: ${extra}` : '');
const RECOLOR = '첨부 이미지는 완성된 게임 초상 일러스트(마젠타 배경)다. 할 일: 같은 인물·같은 구도·같은 크기·같은 위치·같은 자세·같은 얼굴·같은 머리와 관·같은 소품(활)을 그대로 유지하고, 의복과 갑옷의 주색만 오나라 상징색인 붉은색 계열로 바꿔 다시 그린다: 안쪽 겉옷·소매·망토 = 짙은 진홍(#8E1E1E~#B0302A)과 적갈색, 갑옷 미늘 = 짙은 적동색·검붉은 옻칠 톤, 금빛 자수 테두리 포인트(무늬는 단순한 구름·기하 무늬, 글자·문장 없음). 녹색·청색 의복은 남기지 않음. 선 굵기·셀 셰이딩·광원(왼쪽 위)·그림체는 그대로.\n' +
  `스타일: ${BASE_STYLE}\n${KEY_BG}\n금지: ${BASE_NEGATIVE}, 인물 확대·축소·이동, 얼굴 변경, 녹색·청색 옷, 마젠타·분홍·보라 옷`;
// 오나라 붉은 계열 재채색(2026-11-03 팀장 승인): 코드별 색 계획. 위(청)·촉(녹)과 구분, 손권과 같은 구도 기준(인물·크기·위치 불변)
const WU_PLAN = {
  zhou_yu: '망토·스카프·관 = 진홍(#9E2424)과 짙은 적갈색, 소매·허리 천 = 검붉은색, 갑옷 미늘은 지금의 은회색 쇠 색 그대로 두고 미늘 사이 끈과 테두리만 적갈색. 칼과 칼집 그대로',
  npc_gan_ning: '머리띠 = 진홍(#A82A24), 어깨·갑옷 테두리 천과 안쪽 옷 = 짙은 적갈색(#6E2A1E), 갑옷 미늘은 지금의 쇠 색 그대로, 허리의 방울 장식과 칼 그대로',
  npc_lu_su: '문관 겉옷(포) = 짙은 적갈색(#7A2420~#5E1C18, 자주·보라 기운 없음), 안쪽 깃·소매 끝 = 흰색, 허리 끈 = 금빛 황토색(녹색 끈 없음), 가죽 흉갑과 검은 관·두루마리 그대로',
  npc_cheng_pu: '안쪽 겉옷·소매 = 짙은 적갈색(#7A3020)과 녹슨 붉은 갈색, 목의 끈 = 진홍, 청동빛 미늘 갑옷 색은 그대로, 흰 머리·수염 그대로',
};
const RECOLOR_G = (plan) => '첨부 이미지는 완성된 게임 초상 일러스트(마젠타 배경)다. 할 일: 같은 인물·같은 구도·같은 크기·같은 위치·같은 자세·같은 얼굴·같은 머리와 관·같은 소품을 그대로 유지하고, 의복의 주색만 오나라 상징색인 붉은색 계열로 바꿔 다시 그린다. 색 계획: ' + plan + '. 무늬는 단순한 구름·기하 무늬(글자·문장 없음). 청색·녹색·청록 의복은 남기지 않음. 선 굵기·셀 셰이딩·광원(왼쪽 위)·그림체는 그대로.\n' +
  `스타일: ${BASE_STYLE}\n${KEY_BG}\n금지: ${BASE_NEGATIVE}, 인물 확대·축소·이동, 얼굴 변경, 청색·녹색 옷, 마젠타·분홍·보라 옷`;
const prompt = MODE === 'recolor' ? (WU_PLAN[code] ? RECOLOR_G(WU_PLAN[code]) : RECOLOR) + (extra ? `\n추가 지시: ${extra}` : '') : prompt0;
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const out = `${DIR}/raw/${code}_${MODE === 'recolor' ? 'red' : 'shrink'}.jpg`;
const input = [{ type: 'image', mime_type: 'image/png', data: readFileSync(`${DIR}/in/${code}_${MODE === 'recolor' ? 'red' : 'shrink'}.png`).toString('base64') }, { type: 'text', text: prompt }];
const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: RES.model, input, response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '3:4', image_size: RES.image_size } }) });
const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
appendFileSync(`${DIR}/calls_log.jsonl`, JSON.stringify({ ts: new Date().toISOString(), category: 'portrait_shrink', id: code, status: res.status, model: RES.model, extra }) + '\n');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
const img = res.ok ? find(json) : null;
if (img) { if (existsSync(out)) { let n = 1; while (existsSync(out.replace('.jpg', `_try${n}.jpg`))) n++; renameSync(out, out.replace('.jpg', `_try${n}.jpg`)); } writeFileSync(out, Buffer.from(img.data, 'base64')); console.log('성공', out); }
else { console.log('실패 HTTP', res.status, scrub(raw).slice(0, 200)); process.exit(res.status === 429 ? 3 : 1); }
