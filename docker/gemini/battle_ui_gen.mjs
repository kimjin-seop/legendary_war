// 전투 HUD 스킨 생성기(안아트 2026-11-04, 사용자 참고 photo_2026-11-04_17-29-09 — 팀장 요청). 서고 UI 스킨(앤티크 금 + 남색 칠기)과 같은 톤.
//   battle_frames(2x2): 턴 판(왼쪽 엠블럼 칸 + 가운데 세로 구분선 + 오른쪽 곡선 끝) · 지형 정보 판(모서리 장식) · 미니맵 프레임 · 턴 종료 금 버튼
//   battle_icons(4x4): 교차 검·모래시계·발자국·방패·지형 6종(평지·숲·산·물·성·모래)·확대·축소·접기(^)·여분
// 출력 public/assets/ui/battle/raw/<id>.jpg → battle_ui_pp.py. 429 → 즉시 중단. 키는 --env-file 로만
import { writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { RES, UISKIN_PAL as P, UISKIN_STYLE, UISKIN_NEGATIVE, CHROMA } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const RAW = 'public/assets/ui/battle/raw', LOG = 'docker/gemini/battle_ui_calls_log.jsonl';
const BG = `배경은 완전히 균일한 순수 마젠타(${CHROMA}) 단색 한 가지, 그라데이션·비네팅·그림자 없음. 조각은 서로 닿지 않게 넓은 간격`;
const LIB = `서고 콘셉트 고풍 금장: 앤티크 금(${P.goldLight}~${P.gold}~${P.goldDark}) 몰딩과 작은 바로크 덩굴 장식, 깊은 남색(${P.navy}~${P.navyDeep}) 칠기 면`;
const NEG = `${UISKIN_NEGATIVE}, 글자·숫자·기호 글자·종교 상징 금지, 마젠타·분홍·보라 색 금지`;
const JOBS = {
  battle_frames: ['1:1', `전투 화면 UI 조각 4개를 2열x2행 격자로 배치(각 칸 정중앙, 서로 닿지 않게 넓은 간격): ` +
    `좌상 = 가로로 긴 턴 표시 판(가로:세로 약 6.5:1): 남색 칠기 면, 위·아래 곧은 금 몰딩, 왼쪽 끝은 짧게 각진 마감, 오른쪽 끝은 위가 밖으로 휘어진 곡선 끝단(금 덩굴 꼭지), 왼쪽에서 판 높이만큼 떨어진 자리에 가는 금 세로 구분선 하나(왼쪽 정사각 칸 = 엠블럼 자리), 판 안쪽은 비움. ` +
    `우상 = 지형 정보 판(가로:세로 약 2.5:1): 남색 칠기 면, 금 몰딩 테두리, 네 모서리에 작은 금 덩굴 꺾쇠, 변은 곧음, 안쪽 비움. ` +
    `좌하 = 미니맵 프레임(가로:세로 약 1.3:1): 두꺼운 금 몰딩 테두리와 네 모서리 금 덩굴 장식, 안쪽 구멍은 순수 마젠타로 완전히 비움(속이 뚫린 액자). ` +
    `우하 = 큰 금색 버튼(가로:세로 약 3.4:1): 앤티크 금 금속판(위 ${P.goldLight} → 아래 ${P.gold}), 위쪽 40% 광택, 짙은 갈금 외곽선과 안쪽 밝은 금선, 아래 두께감 측면, 양 끝 작은 금 덩굴 꼭지, 표면 중앙 비움.\n` +
    `규칙: 모든 판의 변(모서리 장식 사이)은 무늬 없이 곧고 두께 일정(9-slice·3-slice 로 늘림)\n스타일: ${UISKIN_STYLE}. ${LIB}\n배경: ${BG}\n금지: ${NEG}`],
  battle_icons: ['1:1', `전투 UI 아이콘 16개를 4열x4행 격자로 배치(각 칸 정중앙, 칸의 약 70% 크기, 칸 사이 넓은 빈 간격, 격자선·칸 테두리·배경판 없음). 순서: ` +
    '1) X자로 교차한 두 자루 검(금 칼자루) 2) 금테 모래시계 3) 발자국 두 개(이동) 4) 둥근 금테 방패(방어) 5) 풀밭 평지 한 덩이(초록 풀) 6) 뾰족한 침엽수 두 그루(숲) 7) 회색 바위산 두 봉우리(산) 8) 푸른 물결 세 줄(물) 9) 작은 성탑과 성벽(성) 10) 노란 모래 언덕(모래) 11) 돋보기 안에 더하기 표(확대) 12) 돋보기 안에 빼기 표(축소) 13) 위를 가리키는 금 꺾쇠 화살표(접기) 14) 네 모서리를 가리키는 화살표 4개(전체 보기) 15) 금 깃발 하나 16) 금 왕관 하나. ' +
    `각 아이콘은 굵은 짙은 남흑색(#14182A) 외곽선 + 바깥 얇은 금(${P.gold}) 테두리, 셀 셰이딩 2~3단, 32px 로 줄여도 읽히는 단순한 덩어리\n스타일: 고급 모바일 판타지 전략 RPG UI 아이콘, 평면 정면, 광원 왼쪽 위\n배경: ${BG}\n금지: ${NEG}`],
  // ico_defense(2026-11-04 재생성 1회): 원본 방패 면의 네 갈래 무늬가 십자처럼 읽혀 교체. 단일 아이콘
  ico_defense: ['1:1', `전투 UI 방어 아이콘 1개를 화면 정중앙에 크게(화면의 약 60%): 위가 평평하고 아래가 뾰족한 방패(히터 실드) 정면. 방패 면은 무늬 없는 깊은 남색(${P.navy}) 칠기 한 면, 두꺼운 앤티크 금(${P.gold}) 테두리, 면 가운데 작은 둥근 금 징 하나만. 면을 나누는 선·띠·갈래·방사 무늬 없음. ` +
    `굵은 짙은 남흑색(#14182A) 외곽선 + 바깥 얇은 금 테두리, 셀 셰이딩 2~3단, 32px 로 줄여도 읽히는 단순한 덩어리\n스타일: 고급 모바일 판타지 전략 RPG UI 아이콘, 평면 정면, 광원 왼쪽 위\n배경: ${BG}\n금지: ${NEG}, 십자·십자형 분할·네 갈래 무늬·문장·짐승 문양`],
};
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
mkdirSync(RAW, { recursive: true });
for (const id of (process.argv[2] ?? 'battle_frames,battle_icons').split(',')) {
  const out = `${RAW}/${id}.jpg`; if (existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  const [ar, prompt] = JOBS[id];
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input: [{ type: 'text', text: prompt }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: ar, image_size: RES.image_size } }) });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'battle_ui', id, status: res.status, model: RES.model }) + '\n');
  if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
  const img = res.ok ? find(json) : null;
  if (img) { if (existsSync(out)) renameSync(out, out.replace('.jpg', `_try${Date.now()}.jpg`)); writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${out}`); } else console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`);
}
