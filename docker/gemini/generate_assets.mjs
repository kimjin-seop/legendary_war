// 타일/스프라이트/이펙트 원본(JPEG) 생성. 후처리는 postprocess.mjs.
// 실행: docker run --rm --env-file .env -v "$PWD":/app -w /app -e MAX_CALLS=8 node:22 \
//        node docker/gemini/generate_assets.mjs <tiles|sprites|effects|sheets>
// 원본은 public/assets/test/<kind>/raw/<id>.jpg 로 저장. 키는 환경변수로만 읽고 출력하지 않는다.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import {
  ASSET_STYLE_PROMPT, ASSET_NEGATIVE_PROMPT, TILE_STYLE_PROMPT, SPRITE_STYLE_PROMPT, EFFECT_STYLE_PROMPT,
  PIXEL_STYLE_PROMPT, PIXEL_TILE_PROMPT, PIXEL_SHEET_PROMPT,
  UI_STYLE_PROMPT, UI_SHEET_PROMPT, UI_PIECE_PROMPT,
} from './style.mjs';

const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const IMAGE_SIZE = '1K';
const ASPECT_RATIO = '1:1';
const MIME_TYPE = 'image/jpeg'; // 서버가 jpeg만 지원
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const DELAY_MS = 5_000;
const OUT_ROOT = 'public/assets/test';
const MAX_CALLS = Number(process.env.MAX_CALLS ?? 0); // 이번 실행의 HTTP 호출 상한(재시도 포함)

const TILES = [
  ['plain', '평지: 초록 풀밭, 작은 풀잎과 꽃이 드문드문 있는 부드러운 초원'],
  ['forest', '숲: 위에서 내려다본 빽빽한 나무 수관(둥근 나뭇잎 덩어리들)이 타일 전체를 채움'],
  ['mountain', '산: 위에서 내려다본 바위 능선과 봉우리, 회갈색 암석과 약간의 눈'],
  ['water', '물: 맑은 푸른 물, 부드러운 잔물결 무늬'],
  ['castle', '성/요새: 위에서 내려다본 석조 성벽과 지붕 모양이 타일 전체를 채움'],
  ['road', '길: 위에서 내려다본 흙길, 양쪽 가장자리에 풀이 약간 보이는 가로 방향 길'],
].map(([id, d]) => ({ id, prompt: `지형 타일 1장. ${d}.\n스타일: ${ASSET_STYLE_PROMPT}\n타일: ${TILE_STYLE_PROMPT}\n금지: ${ASSET_NEGATIVE_PROMPT}` }));

const SPRITES = [
  ['sword', '검병: 한 손 검과 둥근 방패, 가벼운 철갑, 파란색 계열 의상'],
  ['spear', '창병: 긴 창을 세워 듦, 가죽·경갑, 초록색 계열 의상'],
  ['cavalry', '기병: 말에 탄 기사 (말과 기수가 함께 한 캐릭터), 랜스, 붉은색 계열 의상'],
  ['archer', '궁수: 활과 화살통, 후드 달린 망토, 연두·갈색 계열 의상'],
  ['mage', '마법사: 큰 모자와 로브, 지팡이, 보라·남색 계열 의상(분홍·마젠타 금지)'],
  ['healer', '치유사: 흰색과 금색의 성직자 복장, 치유 지팡이, 흰색·금색 계열'],
  ['heavy', '중장갑병: 온몸을 덮는 두꺼운 판금 갑옷, 대형 방패와 도끼, 은회색·짙은 금속색 계열'],
  ['flying', '비행 유닛: 날개를 펼친 비행 기수(날개 달린 말을 탄 기사), 하늘색·흰색 계열'],
].map(([id, d]) => ({ id, prompt: `SD 유닛 스프라이트 1장. 병종: ${d}.\n스타일: ${ASSET_STYLE_PROMPT}\n스프라이트: ${SPRITE_STYLE_PROMPT}\n금지: ${ASSET_NEGATIVE_PROMPT}` }));

const EFFECTS = [
  ['hit_spark', '타격 스파크: 노란색과 흰색의 방사형 불꽃 파편이 터지는 충격 순간'],
  ['slash', '베기 궤적: 곡선으로 길게 휘어지는 흰색~하늘색 검기 궤적과 잔상'],
  ['fire_burst', '화염 폭발: 주황·노랑·붉은 불꽃이 둥글게 폭발하는 장면'],
  ['lightning', '번개: 하늘색·흰색의 갈라지는 번개 줄기가 위에서 아래로 내리침'],
  ['heal_glow', '치유 광휘: 초록색과 금색의 부드러운 빛 고리와 떠오르는 반짝임 입자'],
  ['levelup_pillar', '레벨업 빛기둥: 금색과 흰색 빛기둥이 아래에서 위로 솟고 빛 입자가 흩날림'],
].map(([id, d]) => ({ id, prompt: `전투 이펙트 단일 프레임 1장. ${d}.\n스타일: ${ASSET_STYLE_PROMPT}\n이펙트: ${EFFECT_STYLE_PROMPT}\n금지: ${ASSET_NEGATIVE_PROMPT}` }));

// 애니메이션 시트 가능성 시험(2회): 4x4 한 장
const SHEETS = [
  ['sheet_fire', '화염 폭발 애니메이션 스프라이트 시트: 정확히 4열x4행(16프레임) 균등 격자, 한 칸에 한 프레임, 시작(작은 불씨)에서 폭발 정점, 소멸까지 순서대로 좌→우·위→아래'],
  ['sheet_slash', '베기 궤적 애니메이션 스프라이트 시트: 정확히 4열x4행(16프레임) 균등 격자, 한 칸에 한 프레임, 베기 시작부터 궤적이 사라질 때까지 순서대로 좌→우·위→아래'],
].map(([id, d]) => ({ id, prompt: `${d}.\n스타일: ${ASSET_STYLE_PROMPT}\n이펙트: ${EFFECT_STYLE_PROMPT}\n금지: ${ASSET_NEGATIVE_PROMPT}, 칸 사이 테두리·격자선 금지` }));

// 도트 타일(32px 규격으로 후처리) 6종
const TILES_PIXEL = [
  ['plain', '평지: 초록 풀밭, 작은 풀잎과 꽃이 드문드문'],
  ['forest', '숲: 위에서 본 둥근 나무 수관이 빽빽하게 이어진 숲'],
  ['mountain', '산: 위에서 본 회갈색 바위 능선과 봉우리'],
  ['water', '물: 맑은 푸른 물, 단순한 물결 무늬'],
  ['castle', '성/요새: 위에서 본 석조 성벽과 지붕'],
  ['road', '길: 흙길, 양옆에 풀이 약간 보이는 가로 방향 길'],
].map(([id, d]) => ({ id, prompt: `지형 타일 1장. ${d}.\n스타일: ${PIXEL_STYLE_PROMPT}\n타일: ${PIXEL_TILE_PROMPT}` }));

// 캐릭터 걷기 시트 시험(검·궁수) 3열x4행 -> 3:4 비율
const SHEETS_PIXEL = [
  ['sheet_sword', '검병: 한 손 검과 둥근 방패, 가벼운 철갑, 파란색 계열 의상'],
  ['sheet_archer', '궁수: 활과 화살통, 후드 달린 망토, 연두·갈색 계열 의상'],
].map(([id, d]) => ({ id, aspect: '3:4', prompt: `병종: ${d}.\n스타일: ${PIXEL_STYLE_PROMPT}\n시트: ${PIXEL_SHEET_PROMPT}` }));
// ---- UI 키트 (출력: public/assets/ui/raw). 시트=4x4 격자 한 장에 아이콘 여러 개, 후처리(postprocess_ui.mjs)가 잘라 128px PNG로 저장 ----
const UI_SHEET_NAMES = [
  ['ui_sheet_1', ['병종 검병(검과 방패)', '병종 창병(긴 창)', '병종 기병(말 머리와 랜스)', '병종 궁수(활과 화살)', '병종 마법사(지팡이와 별 마법진)', '병종 치유사(십자 문양과 지팡이)', '병종 중장갑(투구와 큰 방패)', '병종 비행(날개)',
    '상성 유리: 초록색 위쪽 화살표(삼각형)', '상성 불리: 빨간색 아래쪽 화살표(삼각형)', '상성 대등: 회색 가로 막대(마이너스 기호 모양, 글자 아님)', '재화 골드 코인', '재화 보석(젬)', '등급 별 1개(금색 오각별)']],
  ['ui_sheet_2', ['지형 평지(풀)', '지형 숲(나무)', '지형 산(봉우리)', '지형 물(물결)', '지형 성(성탑)',
    '메뉴 전투(교차한 두 검)', '메뉴 영웅(투구 쓴 인물 실루엣)', '메뉴 뽑기(마법 구슬 또는 소환 문)', '메뉴 스테이지(깃발이 꽂힌 지도 핀)', '메뉴 설정(톱니바퀴)', '메뉴 일시정지(두 개의 세로 막대)', '메뉴 되돌리기(왼쪽으로 휘는 화살표)', '메뉴 턴 종료(모래시계)']],
];
const UI_SHEETS = UI_SHEET_NAMES.map(([id, list]) => ({ id, prompt: `UI 아이콘 시트 1장: 정확히 4열x4행 균등 격자(16칸), 왼쪽 위부터 오른쪽으로, 줄 바꿔 아래로 순서대로 한 칸에 아이콘 1개씩 ${list.length}개, 나머지 빈 칸은 배경색 그대로 비워 둠. 아이콘 목록: ${list.map((s, i) => `${i + 1}) ${s}`).join(', ')}.\n스타일: ${UI_STYLE_PROMPT}\n시트: ${UI_SHEET_PROMPT}` }));
const UI_PIECES = [
  ['frame_corner_a', '패널 코너 장식: 정사각 프레임의 왼쪽 위 모서리에 붙는 금색 장식 조각 1개(L자 모양으로 모서리를 감싸는 문양, 곡선과 작은 보석), 프레임의 나머지 부분은 그리지 않음'],
  ['frame_corner_b', '패널 코너 장식(다른 디자인): 왼쪽 위 모서리용 금색 장식 조각 1개(날카로운 날개·잎 문양과 작은 보석), 프레임의 나머지 부분은 그리지 않음'],
  ['ribbon_end', '헤더 리본 왼쪽 끝 장식: 남색 리본의 왼쪽 끝이 제비꼬리처럼 갈라진 모양과 금색 테두리, 오른쪽으로 이어지는 리본 줄기 일부가 프레임 오른쪽 가장자리까지 보임, 글자 없음'],
  ['divider', '구분선 장식: 가로로 긴 금색 구분선, 중앙에 작은 다이아몬드/보석 장식, 좌우로 가늘게 퍼지는 곡선 문양, 대칭, 글자 없음'],
].map(([id, d]) => ({ id, prompt: `UI 장식 조각 1장. ${d}.\n스타일: ${UI_STYLE_PROMPT}\n조각: ${UI_PIECE_PROMPT}` }));

const KINDS = { ui_sheets: UI_SHEETS, ui_pieces: UI_PIECES, tiles_pixel: TILES_PIXEL, sheets_pixel: SHEETS_PIXEL, tiles: TILES, sprites: SPRITES, effects: EFFECTS, sheets: SHEETS };
const OUT_DIR = { tiles_pixel: 'tiles_pixel', sheets_pixel: 'sheets_pixel', tiles: 'tiles', sprites: 'sprites', effects: 'effects', sheets: 'effects' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (n, s) => console.log(`[${n}] ${s}`);
const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
if (/["'\s]/.test(key)) { console.error('GEMINI_API_KEY 형식 의심(따옴표/공백 포함)'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
let calls = 0;

function findImage(n) {
  if (!n || typeof n !== 'object') return null;
  if (n.type === 'image' && typeof n.data === 'string') return n;
  for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = findImage(v); if (f) return f; }
  return null;
}
function collectText(n, o = []) {
  if (!n || typeof n !== 'object') return o;
  if (n.type === 'text' && typeof n.text === 'string') o.push(n.text);
  for (const v of Array.isArray(n) ? n : Object.values(n)) collectText(v, o);
  return o;
}

async function callOnce(prompt, aspect = ASPECT_RATIO) {
  if (MAX_CALLS > 0 && calls >= MAX_CALLS) throw new Error('MAX_CALLS 도달: 호출 한도 초과 방지로 중단');
  calls++;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: MODEL, input: prompt, response_format: { type: 'image', mime_type: MIME_TYPE, aspect_ratio: aspect, image_size: IMAGE_SIZE } }),
      signal: ctrl.signal,
    });
    const raw = await res.text();
    let json = null; try { json = JSON.parse(raw); } catch { /* 비JSON */ }
    return { status: res.status, ok: res.ok, json, raw };
  } finally { clearTimeout(t); }
}

async function generate(item, dir) {
  for (let a = 0; a <= MAX_RETRIES; a++) {
    let r;
    try { r = await callOnce(item.prompt, item.aspect); }
    catch (e) {
      if (e.message.startsWith('MAX_CALLS')) { log(item.id, e.message); return false; }
      log(item.id, `오류(${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}) 시도 ${a + 1}`);
      if (a < MAX_RETRIES) { await sleep(DELAY_MS * (a + 1)); continue; }
      return false;
    }
    if (r.ok) {
      const img = findImage(r.json);
      if (img) {
        const f = path.join(dir, `${item.id}.jpg`);
        writeFileSync(f, Buffer.from(img.data, 'base64'));
        log(item.id, `성공 -> ${f}`);
        return true;
      }
      log(item.id, `이미지 없음(거부 의심): ${scrub(collectText(r.json).join(' | ') || JSON.stringify(r.json, (k, v) => (k === 'data' ? '[base64]' : v)).slice(0, 2000))}`);
      return false;
    }
    log(item.id, `HTTP ${r.status} 시도 ${a + 1}: ${scrub(r.raw).slice(0, 1500)}`);
    if (!(r.status === 429 || r.status >= 500) || a === MAX_RETRIES) return false;
    await sleep(DELAY_MS * (a + 1));
  }
  return false;
}

const kind = process.argv[2];
if (!KINDS[kind]) { console.error('kind: tiles|sprites|effects|sheets'); process.exit(1); }
const dir = kind.startsWith('ui_') ? 'public/assets/ui/raw' : path.join(OUT_ROOT, OUT_DIR[kind], 'raw');
mkdirSync(dir, { recursive: true });
let ok = 0; const items = KINDS[kind];
for (let i = 0; i < items.length; i++) {
  if (i > 0) await sleep(DELAY_MS);
  if (await generate(items[i], dir)) ok++;
  else { console.log('실패로 중단(남은 호출 안 함)'); break; }
}
console.log(`완료: ${ok}/${items.length}, HTTP 호출 ${calls}회`);
process.exit(ok === items.length ? 0 : 2);
