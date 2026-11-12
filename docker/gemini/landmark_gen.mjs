// 지형 랜드마크 파일럿(안아트 2026-11-06): 대형 성곽 도시·배 스프라이트. 참조 2장(구성·분위기 참고 이미지 + v3 지형 팔레트·광원 샘플) + 독자 구성 지시.
// 출력: scratchpad/terrain_buildings/raw/<id>.jpg (마젠타 배경) -> scratchpad/terrain_buildings/tools/landmark_pp.py 로 배경 제거·팔레트 정렬·외곽선.
// 사용(프로젝트 루트): docker run --rm --env-file .env -v "$(pwd -W):/app" -w /app node:22 node docker/gemini/landmark_gen.mjs id1,id2 [--force]
// 키는 --env-file 로만 전달, 출력·기록 금지. 429 -> 즉시 중단.
import { readFileSync, writeFileSync, existsSync, appendFileSync, renameSync } from 'node:fs';
import { RES, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
const RAW = 'scratchpad/terrain_buildings/raw', LOG = 'scratchpad/terrain_buildings/tools/gemini_calls_log.jsonl';
const REF = [`${RAW}/ref_style_city.jpg`, `${RAW}/ref_v3_palette.jpg`];
const STYLE = '16비트 시절 전략 시뮬레이션 RPG 전장 지도용 손으로 찍은 도트(픽셀아트) 스프라이트, 3/4 내려다보기(위에서 비스듬히 내려다본 시점, 앞면 벽과 지붕이 함께 보임), ' +
  '빛은 왼쪽 위에서 비추고 그림자는 오른쪽 아래, 굵은 어두운 1픽셀 외곽선, 한 재질당 3~4단 평면 명암, 채도는 중간(형광·네온 금지), 안티앨리어싱·블러·그라데이션 없음, 큼직한 도트';
const PRE = '첫 번째 참조 이미지는 구성 밀도와 분위기만 참고한다(건물 배치·모양·세부를 복제하지 말고 완전히 새로 구성). 두 번째 참조 이미지는 이 게임 지형의 색감·채도·외곽선·광원 기준이다(이 색감과 어울리게).\n';
const JOBS = {
  lm_city_me: ['4:3', PRE + '그릴 것: 사막 교역 도시 하나를 통째로 그린 대형 랜드마크 스프라이트 1장. 화면 중앙에 도시 전체가 들어가고 사방에 마젠타 여백. ' +
    '구성: 모래빛 석재 성벽이 불규칙한 다각형으로 도시를 두르고 모서리마다 둥근 망루, 남쪽 정면 가운데에 아치형 성문 1개. 성 안에는 평지붕 흙벽돌 집들이 계단처럼 빽빽하게 모여 있고, ' +
    '도시 한가운데보다 약간 왼쪽 뒤에 청록색 큰 돔 사원 1채와 가는 첨탑 2개, 오른쪽에 붉은·흰 줄무늬 시장 천막 몇 개, 야자수 서너 그루와 작은 분수 광장. 성벽 밖 지면은 그리지 않는다(풀·길·물 없음).\n' +
    `스타일: ${STYLE}\n${KEY_BG}. 성벽 바깥은 모두 같은 순수 마젠타\n금지: ${BASE_NEGATIVE}, 지면 바탕·풀밭·도로·그림자 바닥 금지`],
  lm_city_kr: ['4:3', PRE + '그릴 것: 조선풍 읍성(성곽 고을) 하나를 통째로 그린 대형 랜드마크 스프라이트 1장. 화면 중앙에 고을 전체가 들어가고 사방에 마젠타 여백. ' +
    '구성: 회색 화강석 성벽이 둥글게 휘어진 타원형으로 고을을 두르고 성벽 위는 흰 회벽 여장에 검은 기와 갓, 남쪽 정면 가운데에 2층 기와 누각을 얹은 성문 1개, 동·서쪽에 작은 성문. ' +
    '성 안: 가운데 뒤쪽에 먹기와 지붕 관아 건물 몇 채(붉은 기둥, 담장으로 둘러싼 마당), 앞쪽과 양옆에 초가집과 기와집이 불규칙하게 모인 마을, 작은 연못과 큰 느티나무 두세 그루, 흙길. 성벽 밖 지면은 그리지 않는다.\n' +
    `스타일: ${STYLE}
${KEY_BG}. 성벽 바깥은 모두 같은 순수 마젠타
금지: ${BASE_NEGATIVE}, 지면 바탕·풀밭·도로·그림자 바닥 금지`],
  lm_ships: ['16:9', PRE + '그릴 것: 배 스프라이트 3척을 가로로 간격을 두고 나란히 늘어놓은 시트 1장(서로 닿지 않게 넉넉한 마젠타 간격). 모두 같은 3/4 내려다보기, 뱃머리가 오른쪽을 향함. ' +
    '왼쪽: 돛대 3개짜리 큰 범선(목재 갈색 선체, 흰 돛, 선미 누각). 가운데: 돛 하나짜리 작은 어선(삼각돛, 짧은 선체). 오른쪽: 노가 양옆으로 여러 개 나온 긴 갤리선(돛 하나 접힘). 물·물결·바다 그리지 않음.\n' +
    `스타일: ${STYLE}\n${KEY_BG}. 배 바깥은 모두 같은 순수 마젠타\n금지: ${BASE_NEGATIVE}, 물·파도·물보라·바다 배경 금지`],
};

// ---- 대형 건물(정면 3/4, 현행 민가와 같은 시점) : 참조 = 현행 민가 시트(시점·팔레트) + 사용자 참고(디테일 밀도만) ----
const REF_BIG = [`${RAW}/ref_house_view.jpg`, `${RAW}/ref_detail_bigbuilding.jpg`];
const PRE_BIG = '첫 번째 참조 이미지는 이 게임의 현행 민가 스프라이트다: 시점(정면 3/4 — 앞벽이 화면과 평행하게 정면으로 보이고 지붕은 그 위로 넓게 보임, 아이소메트릭·대각선 시점 금지), 외곽선·색감·채도·광원(왼쪽 위)을 반드시 이것과 같게. ' +
  '두 번째 참조 이미지는 디테일 밀도(지붕 기와결, 벽 석재·창살·기둥, 현판·배너, 입구 계단, 석비 같은 주변 장식)만 참고한다(모양·배치·색은 복제하지 말고 새로 구성).\n';
const BIG = (desc) => PRE_BIG + `그릴 것: ${desc} 건물 바깥에는 지면·풀·길을 그리지 않는다(앞마당 포석·계단·장식물은 건물에 붙은 부분만).\n스타일: ${STYLE}\n${KEY_BG}. 건물 바깥은 모두 같은 순수 마젠타\n금지: ${BASE_NEGATIVE}, 풀밭·흙길·바닥 배경 금지`;
JOBS.big_kr = ['4:3', BIG('조선풍 관아(대저택) 한 채를 정면에서 본 대형 스프라이트. 가로가 세로보다 긴 구성(가로 4칸 x 세로 3칸 비율). 높은 화강석 기단 위에 붉은 기둥과 흰 회벽, 창호 문살이 보이는 정면 건물, 팔작 먹기와 지붕(기와골 결, 처마 끝 막새, 용마루 끝 살짝 들림). 정면 가운데에 이름 없는 빈 현판(글자 없음), 기단 가운데 돌계단, 계단 양옆에 석등 2기, 왼쪽 앞에 작은 비석 1기.')];
JOBS.big_eu = ['4:3', BIG('서유럽 중세 석조 수도원(영주관) 한 채를 정면에서 본 대형 스프라이트(가로 5칸 x 세로 4칸 비율). 회갈색 석재 벽, 아치형 창 여러 개와 장미창 하나, 가운데 정면 박공과 종탑 1개, 붉은 기와 지붕(기와 줄 결, 일부 이끼), 정문 양쪽에 문장 없는 단색 배너 2개, 정문 앞 넓은 돌계단, 계단 옆 작은 분수 1개.')];
JOBS.big_me = ['4:3', BIG('중동풍 궁전 저택 한 채를 정면에서 본 대형 스프라이트(가로 4칸 x 세로 3칸 비율). 모래빛 석재와 흰 회벽, 가운데 높은 아치 정문(이완)과 청록 타일 문양 띠, 지붕 위 청록 돔 1개와 작은 첨탑 2개, 평지붕 난간, 창살 격자창, 정문 앞 계단과 양옆 화분·야자수 각 1그루, 작은 사각 분수.')];
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
const enc = (arr) => arr.map((f) => ({ type: 'image', mime_type: 'image/jpeg', data: readFileSync(f).toString('base64') }));
for (const id of (process.argv[2] ?? Object.keys(JOBS).join(',')).split(',')) {
  const out = `${RAW}/${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const [ar, prompt] = JOBS[id];
  const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 180_000);
  try {
    const res = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: RES.model, input: [...enc(id.startsWith('big_') ? REF_BIG : REF), { type: 'text', text: prompt }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: ar, image_size: RES.image_size } }), signal: ctrl.signal });
    const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
    appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'landmark', id, status: res.status, model: RES.model }) + '\n');
    if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
    const img = res.ok ? find(json) : null;
    if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공`); }
    else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
  } catch (e) { appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'landmark', id, status: 'error' }) + '\n'); console.log(`[${id}] 오류 ${scrub(e.message)}`); }
  finally { clearTimeout(t); }
}
