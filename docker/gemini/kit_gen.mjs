// 문화권 키트 1라운드 시험(안아트 2026-11-06): 채택본 big_kr/big_eu 를 참조로 고정해 시점·밀도가 유지되는지 + 중형 민가 시트 생성.
// 출력: scratchpad/terrain_buildings/kit_round1/raw/<id>.jpg (마젠타) -> kit_round1/tools/kit_pp.py
// 사용(프로젝트 루트): docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/kit_gen.mjs id1,id2 [--force]
// 키는 --env-file 로만 전달, 출력·기록 금지. 429 -> 즉시 중단(증량·재시도 없음). 한도 측정용으로 응답 헤더 중 ratelimit/retry/quota 관련 이름·값만 기록.
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync, mkdirSync } from 'node:fs';
import { RES, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
const BASE = 'scratchpad/terrain_buildings';
const RAW = `${BASE}/kit_round1/raw`, LOG = `${BASE}/kit_round1/tools/kit_calls_log.jsonl`;
const refArg = process.argv.find((a) => a.startsWith('--ref='));
const REF = refArg ? refArg.slice(6).split(',') : [`${BASE}/raw/big_kr.jpg`, `${BASE}/raw/big_eu.jpg`];   // 채택본 고정(기본) 또는 --ref= 로 교체
const STYLE = '16비트 시절 전략 시뮬레이션 RPG 전장 지도용 도트(픽셀아트) 스프라이트, 큼직한 도트, 굵은 어두운 1픽셀 외곽선, 재질당 3~4단 평면 명암, 채도 중간, 안티앨리어싱·블러·그라데이션 없음';
const LOCK = '두 참조 이미지는 이 게임에서 이미 채택한 건물 스프라이트다. 시점(정면 3/4: 앞벽이 화면과 평행하게 정면으로 보이고 지붕은 그 위로 보임, 아이소메트릭·대각선·투시 금지), 도트 크기감, 디테일 밀도(기와결·석재·창살·문살), ' +
  '외곽선 굵기, 명암 단수, 채도, 광원(왼쪽 위에서 빛, 오른쪽에 그림자)을 두 참조와 똑같이 맞춘다. 참조 건물의 모양·배치는 복제하지 않는다.\n';
const TAIL = `\n스타일: ${STYLE}\n${KEY_BG}. 건물 바깥은 모두 같은 순수 마젠타\n금지: ${BASE_NEGATIVE}, 풀밭·흙길·바닥 배경 금지, 글자·문자 금지`;
const SHEET = (desc) => LOCK + `그릴 것: 같은 문화권 중형 민가 4채를 2열 2행 격자로 넉넉한 마젠타 간격을 두고 따로따로 배치한 시트 1장(건물끼리 닿지 않게). 네 채 모두 같은 시점·같은 축척(한 채가 가로 2~3칸, 세로 2칸 정도 비율). ${desc} 건물에 붙은 낮은 기단·디딤돌까지만 그리고 마당·지면은 그리지 않는다.` + TAIL;
const JOBS = {
  jp_castle: ['4:3', LOCK + '그릴 것: 일본 성곽의 천수각 한 채(가로 4칸 x 세로 4칸 비율). 경사진 큰 돌 석축 위에 3층 흰 회벽 천수각, 층마다 먹기와 지붕과 삼각 박공·곡선 박공이 겹치고, 맨 위 용마루 양끝에 금빛 물고기 장식, 검은 판자 하단 벽, 작은 격자창, 석축 앞 가운데 돌계단과 성문 하나.' + TAIL],
  cn_pavilion: ['4:3', LOCK + '그릴 것: 중국 누각 한 채(가로 4칸 x 세로 3칸 비율). 높은 회색 벽돌 석대 위 2층 누각, 붉은 기둥과 붉은 문살, 녹색 유약 기와 지붕 2단에 크게 들린 처마 끝, 흰 돌 난간, 석대 가운데 넓은 돌계단, 계단 양옆에 돌사자 2기, 빈 현판(글자 없음).' + TAIL],
  house_k: ['4:3', SHEET('한국 조선 민가: 왼쪽 위 = 먹기와 기와집(흰 회벽·나무 기둥·창호), 오른쪽 위 = ㄱ자 기와집(날개채가 앞으로 나옴), 왼쪽 아래 = 둥근 초가집(새끼줄 엮은 볏짚 지붕, 흙벽), 오른쪽 아래 = 초가집과 붙은 헛간·장독대.')],
  house_j: ['4:3', SHEET('일본 에도 시대 민가: 왼쪽 위 = 회색 기와 상가 건물(검은 판자벽·격자창·포렴 없음), 오른쪽 위 = 두꺼운 억새 초가 민가(가파른 지붕, 용마루 덮개), 왼쪽 아래 = 흰 회벽 창고(도조, 검은 기와), 오른쪽 아래 = 툇마루 있는 기와 민가.')],
  house_c: ['4:3', SHEET('중국 명·청 시대 민가: 왼쪽 위 = 회색 기와 사합원 정면채(붉은 기둥·처마 들림), 오른쪽 위 = 흰 벽 검은 기와 계단식 방화벽(마두장) 민가, 왼쪽 아래 = 작은 회벽돌 농가, 오른쪽 아래 = 녹색 기와 작은 사당.')],
  house_c2: ['4:3', SHEET('중국 명·청 시대 강남·화북 민가(한국·일본 양식과 구별되게: 회색 벽돌 벽, 계단식 흰 방화벽 마두장, 끝이 날카롭게 들린 처마, 둥근 달문, 붉은 등롱 장식): 왼쪽 위 = 마두장 2층 민가, 오른쪽 위 = 회색 벽돌 사합원 대문채(붉은 대문, 문 앞 돌사자 없음), 왼쪽 아래 = 둥근 달문이 있는 담장과 작은 정자, 오른쪽 아래 = 처마 들린 회색 기와 상점(붉은 기둥, 등롱 2개).')],
  house_w: ['4:3', SHEET('서유럽 중세 민가: 왼쪽 위 = 반목조(흰 회벽에 검은 나무 골조) 2층 집과 붉은 기와 박공 지붕, 오른쪽 위 = 회갈색 석조 농가와 슬레이트 지붕·굴뚝, 왼쪽 아래 = 볏짚 지붕 오두막, 오른쪽 아래 = 대장간(석조 벽, 열린 작업장, 굴뚝 연기 없음).')],
};
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
const refs = REF.map((f) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') }));
mkdirSync(RAW, { recursive: true }); mkdirSync(`${BASE}/kit_round1/tools`, { recursive: true });
for (const id of (process.argv[2] ?? Object.keys(JOBS).join(',')).split(',')) {
  const out = `${RAW}/${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const [ar, prompt] = JOBS[id];
  const t0 = Date.now(); const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input: [...refs, { type: 'text', text: prompt }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: ar, image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    const hdr = {}; for (const [k, v] of res.headers) if (/ratelimit|retry|quota/i.test(k)) hdr[k] = v;
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'kit_round1', id, status: res.status, model: RES.model, ms: Date.now() - t0, quota_headers: hdr }) + '\n');
    if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단: ${scrub(raw).slice(0, 300)}`); process.exit(3); }
    const img = res.ok ? find(json) : null;
    if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 hdr=${JSON.stringify(hdr)}`); }
    else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'kit_round1', id, status: 'error' }) + '\n'); console.log(`[${id}] 오류 ${scrub(e.message)}`); }
  finally { clearTimeout(t); }
}
