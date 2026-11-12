// 컨셉 목업 이미지 6장 생성 (실제 구현 결과가 아닌 컨셉 이미지). generate_portrait.mjs 의 호출 방식을 복사.
// 실행: docker run --rm --env-file .env -v "$PWD":/app -w /app node:22 node docker/gemini/generate_mockups.mjs
// 키는 GEMINI_API_KEY 환경변수로만 읽고 x-goog-api-key 헤더로만 전달한다. 출력하지 않는다.
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const MODEL = 'gemini-nano-banana-2.1';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const ASPECT_RATIO = '16:9';
const IMAGE_SIZE = '1K';
const MIME_TYPE = 'image/jpeg';
const TIMEOUT_MS = 120_000;
const MAX_RETRIES = 2;
const DELAY_BETWEEN_MS = 5_000;
const MAX_TOTAL_CALLS = 8; // 재시도 포함 총 호출 상한
const OUT_DIR = 'public/assets/mockups';

export const COMMON_PROMPT =
  '일본 SRPG 스타일 모바일/웹 게임의 가로 화면 컨셉 목업 이미지. 딥 네이비 패널과 금색 장식 테두리의 UI, ' +
  '맵은 16비트 도트풍(픽셀아트) 탑다운 타일맵, 영웅 초상화는 일본 판타지 SRPG 애니메이션풍 일러스트, ' +
  '읽기 쉬운 큼직한 숫자와 아이콘 중심. 글자는 최소화하고 숫자·기호·아이콘 위주. ' +
  '금지: 실존 게임·작품 로고, 워터마크, 서명.';

export const SCREENS = [
  { id: '01_battle', prompt:
    '전투 화면: 12x12 도트 타일맵(평지·숲·산·물·성), 아군 유닛들 주변에 청색 면 이동 범위, 적 유닛 주변에 적색 빗금 공격 범위, ' +
    '지휘관 주변에 오라 링, 유닛 위에 작은 HP바, 우측에 대상 정보 패널(초상화·HP바·상성 ▲ 아이콘·지형 방어 보정 숫자), ' +
    '하단에 행동 메뉴(아이콘 4개), 상단에 턴 배너.' },
  { id: '02_forecast', prompt:
    '전투 예측 확정 순간: 도트 타일맵 전투 화면 위에 중앙 \'전투 예측\' 창이 떠 있다. 창 안에 양측 HP바, 예상 피해 큰 숫자, 반격 표시, ' +
    '상성 화살표, 확정/취소 버튼 두 개. 배경 전투 화면은 살짝 어둡게.' },
  { id: '03_cutin', prompt:
    '필살기 컷인 연출: 영웅 반신 초상화가 사선 띠 배경과 속도선 위에 크게 배치, 스킬명 자리에 큰 장식 글자(깨져도 무방), ' +
    '뒤로 어두운 전장 실루엣. 역동적이고 화려한 발광 효과.' },
  { id: '04_deploy', prompt:
    '출격 편성+배치 화면: 코스트 게이지(현재/최대 숫자), 영웅 카드 슬롯 5개, 보유 영웅 카드 목록(등급 별 표시), ' +
    '배치 가능 타일이 마름모로 표시된 미니 맵.' },
  { id: '05_hero_detail', prompt:
    '영웅 상세 화면: 큰 초상화, 등급 별, 능력치 막대(HP·공격·방어·이동), 스킬 아이콘 3개, 서사 텍스트 영역, 하단에 육성 버튼.' },
  { id: '06_gacha', prompt:
    '뽑기 결과 화면: 금색 빛기둥과 함께 SSR 영웅 카드가 공개되는 중앙 연출, 아래에 카드 10장 격자(등급별 테두리 색 구분).' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (name, status) => console.log(`[${name}] ${status}`);

const key = process.env.GEMINI_API_KEY;
if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
if (/["'\s]/.test(key)) { console.error('GEMINI_API_KEY 형식 의심(따옴표/공백 포함)'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');

function findImage(node) {
  if (!node || typeof node !== 'object') return null;
  if (node.type === 'image' && typeof node.data === 'string') return node;
  for (const v of Array.isArray(node) ? node : Object.values(node)) {
    const f = findImage(v);
    if (f) return f;
  }
  return null;
}
function collectText(node, out = []) {
  if (!node || typeof node !== 'object') return out;
  if (node.type === 'text' && typeof node.text === 'string') out.push(node.text);
  for (const v of Array.isArray(node) ? node : Object.values(node)) collectText(v, out);
  return out;
}

let totalCalls = 0;
async function callOnce(prompt) {
  totalCalls++;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        input: prompt,
        response_format: { type: 'image', mime_type: MIME_TYPE, aspect_ratio: ASPECT_RATIO, image_size: IMAGE_SIZE },
      }),
      signal: ctrl.signal,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { /* 비JSON */ }
    return { status: res.status, ok: res.ok, json, raw: text };
  } finally {
    clearTimeout(t);
  }
}

async function generate(s) {
  const prompt = `${COMMON_PROMPT}\n${s.prompt}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (totalCalls >= MAX_TOTAL_CALLS) { log(s.id, `총 호출 상한(${MAX_TOTAL_CALLS}) 도달, 중단`); return false; }
    let r;
    try {
      r = await callOnce(prompt);
    } catch (e) {
      log(s.id, `오류(${e.name === 'AbortError' ? '타임아웃' : scrub(e.message)}) 시도 ${attempt + 1} (총 ${totalCalls}회)`);
      if (attempt < MAX_RETRIES) { await sleep(DELAY_BETWEEN_MS * (attempt + 1)); continue; }
      return false;
    }
    if (r.ok) {
      const img = findImage(r.json);
      if (img) {
        const file = path.join(OUT_DIR, `${s.id}.jpg`);
        writeFileSync(file, Buffer.from(img.data, 'base64'));
        log(s.id, `성공 -> ${file} (총 호출 ${totalCalls}회)`);
        return true;
      }
      log(s.id, `이미지 없음(거부 의심). 응답: ${scrub(collectText(r.json).join(' | ') || JSON.stringify(r.json, (k, v) => (k === 'data' ? '[base64]' : v)).slice(0, 2000))}`);
      return false;
    }
    const retryable = r.status === 429 || r.status >= 500;
    log(s.id, `HTTP ${r.status} 시도 ${attempt + 1} (총 ${totalCalls}회): ${scrub(r.raw).slice(0, 1500)}`);
    if (!retryable || attempt === MAX_RETRIES) return false;
    await sleep(DELAY_BETWEEN_MS * (attempt + 1));
  }
  return false;
}

mkdirSync(OUT_DIR, { recursive: true });
let okCount = 0;
for (let i = 0; i < SCREENS.length; i++) {
  if (i > 0) await sleep(DELAY_BETWEEN_MS);
  if (await generate(SCREENS[i])) okCount++;
  else if (totalCalls >= MAX_TOTAL_CALLS) break;
}
console.log(`완료: ${okCount}/${SCREENS.length}, 총 호출 ${totalCalls}회`);
process.exit(okCount === SCREENS.length ? 0 : 2);
