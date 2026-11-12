// 서고 UI 스킨 1단계(대사 씬) 생성기(안아트 2026-11-04, 사용자 승인 — 팀장 전달). 레퍼런스 방향: 네이비 다마스크 + 고풍 금장(바로크 덩굴) 프레임, 서고·고지도 톤.
//   atlas 조각(기존 프레임명 유지, pp_uiskin.mjs 가 다시 9/3-slice): dialog_pair(dialog.box + dialog.nameplate) · panel(panel.main) · panel_hud(panel.hud) · topbar_strip(topbar.strip, 얇게)
//     → public/assets/ui_skin/raw/<id>.jpg 덮어씀(이전 raw 는 raw/_prev_a/ 로 이동, 사용자 지시: 백업 불필요지만 비교용 1벌만)
//   새 조각(아틀라스 밖, uiskin_lib_pp.py): lib_damask(배경 타일) · lib_crest(상단 문장·휘장) · lib_deco(소품 2x2) · lib_corner(화면 금테 모서리) → public/assets/ui_skin/library/raw/<id>.jpg
// 규칙: 글자·종교 상징 없음, 문장 동물은 일반화(날개 달린 사자), 마젠타·분홍·보라 금지. 429 → 즉시 중단. 키는 --env-file 로만
import { writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { RES, UISKIN_PAL as P, UISKIN_STYLE, UISKIN_NEGATIVE, CHROMA } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const LOG = 'docker/gemini/uiskin_lib_calls_log.jsonl';
const BG = `배경은 완전히 균일한 순수 마젠타(${CHROMA}) 단색 한 가지, 그라데이션·비네팅·바닥 그림자 없음. 조각은 배경 위에 떠 있고 사방에 캔버스의 8% 이상 여백`;
const NINE = '9-slice로 늘려 쓸 조각: 네 모서리 장식 사이의 위·아래·왼쪽·오른쪽 변은 무늬 없이 곧고 두께가 일정한 몰딩, 안쪽 면은 무늬 없는 균일한 색(아주 약한 위→아래 그라데이션만)';
const LIB = `서고·고지도 콘셉트의 고풍 금장: 낡은 앤티크 금(${P.goldLight}~${P.gold}~${P.goldDark}) 바로크 덩굴·아칸서스 잎 장식, 깊은 남색(${P.navy}~${P.navyDeep}) 칠기 면, 금속에 은은한 광택과 미세한 마모`;
const NEG = `${UISKIN_NEGATIVE}, 글자·숫자·문장 안의 기호·종교 상징(십자가·후광·성상) 금지, 마젠타·분홍·보라 색 금지`;
const piece = (d, rule = NINE) => `UI 스킨 조각 1장: ${d}.\n늘림 규칙: ${rule}\n스타일: ${UISKIN_STYLE}. ${LIB}\n배경: ${BG}\n금지: ${NEG}`;
const art = (d) => `UI 장식 그래픽 1장: ${d}.\n스타일: ${UISKIN_STYLE}. ${LIB}\n배경: ${BG}\n금지: ${NEG}`;
const A = 'public/assets/ui_skin/raw', N = 'public/assets/ui_skin/library/raw';
const JOBS = {
  dialog_pair: [A, '16:9', piece(`대사 창 세트 2개(서로 닿지 않게 간격): (1) 아래쪽에 크고 가로로 긴 대사 창 프레임(캔버스 폭의 88%, 가로:세로 약 4:1): 면은 짙은 남색 칠기(${P.navy}), ` +
    `테두리는 앤티크 금 몰딩 1겹(높이의 3%) + 안쪽 가는 금선 1줄, 네 모서리에 바로크 금 덩굴 장식(창 높이의 22% 크기, 모서리에서 변 방향으로 짧게 뻗음), 윗변·아랫변·좌우 변의 가운데에는 장식을 두지 않음(모서리 장식 사이의 변 전체가 곧고 무늬 없는 몰딩, 9-slice 로 늘리기 위함), 중앙 면 균일. ` +
    `(2) 그 위 왼쪽에 작은 이름표 판(가로:세로 약 3.5:1, 대사 창 폭의 26%): 짙은 적갈 칠기 면에 앤티크 금 테두리, 양 끝에만 작은 금 덩굴 장식(가운데 변은 곧은 몰딩)`, `${NINE}. 두 조각은 각각 따로 떨어져 있음`)],
  panel: [A, '1:1', piece(`정사각형 창(패널) 프레임 1개(캔버스의 84%). 안쪽 면은 깊은 남색(${P.navy}) 균일한 칠기 면. 테두리는 이중: 바깥 앤티크 금 몰딩(패널 폭의 2.5% 두께, 베벨) + 간격 + 안쪽 가는 금선 1줄. ` +
    '네 모서리에 같은 모양의 바로크 금 덩굴 모서리 장식(패널 폭의 14% 크기, 작은 청록 보석 1개), 상하좌우 대칭. 모서리 장식 사이의 변은 곧은 몰딩만')],
  panel_hud: [A, '1:1', piece(`정사각형 정보창 프레임 1개(캔버스의 80%). 장식 최소: 안쪽 면은 아주 어두운 남색(${P.navyDeep}) 균일한 면, 테두리는 가는 앤티크 금선 1줄(패널 폭의 1%) + 그 안쪽 간격 두고 더 가는 금선 1줄, 네 모서리에 아주 작은 금 덩굴 꺾쇠(폭의 5% 크기)`)],
  topbar_strip: [A, '21:9', piece(`화면 상단 가로 바 1개(가로:세로 약 16:1, 캔버스 폭의 92%, 아주 얇게). 면은 짙은 남색 칠기(${P.navyDeep}→${P.navy}), 아래 변에 가는 앤티크 금 몰딩(바 높이의 10%)과 그 바로 위 가는 금선, 위 변은 얇은 어두운 금선. 양 끝은 작은 금 덩굴 마감. 면 중앙 장식 없음`)],
  lib_damask: [N, '1:1', '배경 무늬 타일 1장(캔버스 전체를 빈틈없이 채움, 마젠타 없음): 깊은 남색(#14213F) 바탕에 한 톤 밝은 남청(#22345E) 다마스크 무늬(대칭 아칸서스 잎과 덩굴로 이루어진 큰 메달리온 하나가 가운데, 네 모서리에 메달리온의 4분의 1씩), 무늬 대비는 낮고 은은하게, 직물 결 질감. ' +
    `무늬가 상하좌우로 이어 붙일 수 있게 가장자리에서 끊기지 않음. 글자·동물·종교 상징 없음\n스타일: 고급 판타지 RPG 배경 직물 텍스처, 평면 정면\n금지: ${NEG}`],
  lib_crest: [N, '21:9', art('화면 상단 가운데 장식 1개(캔버스 폭의 90%): 가운데에 앤티크 금 방패형 메달(안쪽 남색 칠기, 가운데 날개 달린 금 사자 문양 하나, 둘레 금 월계수·덩굴), 그 양옆으로 늘어진 짙은 남색 벨벳 휘장(금 술 장식 끝단, 물결 모양으로 위에서 아래로 처짐), 휘장 바깥 끝 양쪽에 세로로 늘어진 짙은 남색 깃발 한 장씩(금 테두리·금 술, 무늬는 작은 금 마름모 하나), 좌우 대칭')],
  lib_deco: [N, '4:3', art('장식 소품 4개를 2열x2행 격자로 배치(서로 닿지 않게 넓은 간격, 각 칸 정중앙): 좌상 = 앤티크 금 혼천의(천구의, 링 여러 개, 받침대), 우상 = 따뜻한 불빛이 켜진 놋쇠 랜턴, 좌하 = 붉은 밀랍 봉인이 붙은 말린 양피지 두루마리 두 개(글자 없음), 우하 = 가죽 장정 책 세 권을 쌓은 더미(제목 글자 없음). 정면에서 약간 내려다본 시점, 같은 크기·같은 광원(왼쪽 위). 칸 테두리·배경판·액자·남색 바탕 없이 소품만 순수 마젠타 배경 위에 떠 있음')],
  lib_corner: [N, '1:1', art('화면 프레임 왼쪽 위 모서리 장식 1개(캔버스의 80%): L자로 모서리를 감싸는 앤티크 금 바로크 덩굴·아칸서스 장식, 위쪽 변 방향과 왼쪽 변 방향으로 각각 캔버스 폭의 75%까지 가늘어지며 뻗음, 안쪽(오른쪽 아래)은 비어 있음, 작은 청록 보석 1개')],
  // 로비 크롬(2026-11-04 팀장 요청, 시안 photo_..._11-40-19): 우측 세로 내비 아이콘·원형 프레임·레일 띠, 재화 캡슐(atlas currency.capsule 교체)
  nav_icons: [N, '4:3', `게임 메뉴 아이콘 8개를 4열x2행 격자로 배치(각 칸 정중앙, 칸 사이 넓은 빈 간격, 격자선·칸 테두리·원형 배경판 없음): ` +
    '1) X자로 교차한 두 자루 검(싱글 전투) 2) 정면을 본 장수 투구(영웅) 3) 위로 빛이 나는 금 부적 메달(뽑기) 4) 맞부딪친 두 자루 칼과 작은 불꽃(멀티 대전) 5) 위로 향한 화살표가 있는 별 메달(성장) 6) 리본 달린 선물 상자(보상) 7) 가로로 놓인 둥근 점 세 개(더보기) 8) 펼친 책(기록). ' +
    `각 아이콘은 앤티크 금(${P.goldLight}~${P.gold}) 단색 금속 선화풍: 굵은 금 외곽선과 금 면, 짙은 갈금(${P.goldShadow}) 그림자 선, 아주 작은 하이라이트, 32px 로 줄여도 읽히는 단순한 덩어리 형태
스타일: 고급 모바일 판타지 전략 RPG 메뉴 아이콘, 평면 정면
배경: ${BG}
금지: ${NEG}`],
  nav_frame: [N, '1:1', piece(`원형 메뉴 버튼 프레임 1개(캔버스의 70%): 두꺼운 앤티크 금 링(지름의 8%, 왼쪽 위 밝고 오른쪽 아래 어두운 베벨)에 작은 금 덩굴 무늬 4곳(위·아래·좌·우), 안쪽 가는 금선 1줄, 안쪽 면은 깊은 남색 칠기(${P.navyRaised}→${P.navyDeep}) 오목 면, 면 중앙은 비워 둠(아이콘 자리)`, '늘리지 않고 그대로 쓰는 조각(크기 조절만): 형태가 또렷하고 상하좌우 대칭')],
  nav_rail: [N, '9:16', piece(`화면 오른쪽 세로 메뉴 레일 띠 1개(캔버스 높이의 88%, 가로:세로 약 1:7): 짙은 남색 칠기(${P.navyDeep}) 반투명해 보이는 세로 띠, 왼쪽 변에 가는 앤티크 금 몰딩 한 줄, 오른쪽 변에 더 가는 어두운 금선, 위·아래 끝에 작은 금 덩굴 마감 장식. 변 중간은 무늬 없이 곧음`, '세로로 늘려 쓰는 3-slice 조각: 위·아래 끝 장식 사이의 띠는 무늬 없이 곧고 폭이 일정')],
  currency_capsule: [A, '21:9', piece(`재화 표시용 캡슐 1개(가로:세로 약 4.5:1, 캔버스 폭의 75%, 양 끝 반원). 움푹 들어간 거의 검은 남색(#0A1226) 면, 위쪽 안쪽 짧은 내부 그림자, 테두리는 가는 앤티크 금 몰딩 1겹(높이의 6%), 양 끝 반원 바깥에 아주 작은 금 덩굴 꼭지 하나씩. 면 중앙 비움`)],
  // 2단계(2026-11-04 승인): 버튼·탭·행·토스트·리본·등급 프레임. 형태·비율은 기존 조각(style_guide UISKIN_TRIAL/PROD)과 같게, 장식만 앤티크 금 작은 덩굴로(390 폰에서도 깨지지 않게 최소)
  btn_primary: [A, '21:9', piece(`가로로 긴 둥근 모서리 직사각형 게임 버튼 1개(가로:세로 약 3.6:1, 캔버스 폭의 80%). 겉면은 앤티크 금 금속판: 위 ${P.goldLight} → 아래 ${P.gold}·짙은 금 그라데이션, 위쪽 40% 옅은 광택띠, 아주 미세한 마모 결. 테두리는 짙은 갈금(${P.goldShadow}) 얇은 외곽선 + 안쪽 밝은 금 하이라이트 선 1줄. 아래쪽 두께감 측면(높이의 7%). 좌우 끝 세로 중앙에 아주 작은 금 덩굴 꼭지 장식 하나씩(버튼 높이의 30% 이내), 위·아래 변은 곧고 무늬 없음. 표면 중앙은 비워 둠(글자 자리)`, '3-slice(가로)로 늘려 쓸 조각: 양 끝 장식 사이의 위·아래 변과 면은 무늬 없이 곧고 균일')],
  btn_secondary: [A, '21:9', piece(`가로로 긴 둥근 모서리 직사각형 게임 버튼 1개(가로:세로 약 3.6:1, 캔버스 폭의 80%). 겉면은 깊은 남색 칠기(위 ${P.navyRaised} → 아래 ${P.navy}), 위쪽 35% 아주 옅은 광택. 테두리는 앤티크 금 몰딩 1겹(높이의 6%, 위 밝고 아래 어두운 베벨) + 안쪽 가는 금선 1줄. 아래쪽 거의 검은 남색 측면(높이의 7%). 좌우 끝 세로 중앙에 아주 작은 금 덩굴 꼭지 장식 하나씩(높이의 30% 이내), 위·아래 변은 곧고 무늬 없음. 표면 중앙 비움`, '3-slice(가로)로 늘려 쓸 조각: 양 끝 장식 사이의 위·아래 변과 면은 무늬 없이 곧고 균일')],
  btn_sm_pair: [A, '16:9', piece(`작은 게임 버튼 2개를 위·아래로 간격을 두고 배치(같은 크기·같은 모양, 각 가로:세로 약 3.2:1, 각 캔버스 폭의 70%). 위 = 앤티크 금 금속판 버튼(위 ${P.goldLight} → 아래 ${P.gold}), 아래 = 깊은 남색 칠기 버튼(위 ${P.navyRaised} → 아래 ${P.navy}). 둘 다 테두리가 아주 얇음: 짙은 갈금 외곽선 1줄 + 안쪽 밝은 금선 1줄(합쳐서 높이의 5% 이하), 아래 두께감 측면 높이의 5%. 모서리 둥금, 양 끝 장식 없음, 위·아래 변 곧음, 표면 중앙 비움`, '3-slice(가로)로 늘려 쓸 조각. 두 조각은 각각 따로 떨어져 있음')],
  tab_pair: [A, '16:9', piece(`하단 메뉴 탭 버튼 2개를 왼쪽·오른쪽에 나란히(서로 닿지 않게 간격, 같은 크기·같은 모양, 각 가로:세로 약 2.4:1, 위쪽 모서리만 둥글고 아래는 곧음, 낮고 얇은 형태). 왼쪽 = 선택된 탭: 남색 바탕이 위로 갈수록 밝은 청남색(${P.lineInner})으로 빛나고, 앤티크 금 테두리, 윗변 가운데에 아주 작은 금 덩굴 장식 하나(탭 폭의 12% 이내). 오른쪽 = 선택 안 된 탭: 같은 모양, 어두운 남색(${P.navyDeep}) 바탕, 가늘고 어두운 금(${P.goldDark}) 테두리, 장식 없음`, `${NINE}. 두 조각은 각각 따로 떨어져 있음`)],
  row_list: [A, '21:9', piece(`목록 행(가로로 긴 카드) 1개(가로:세로 약 6:1, 캔버스 폭의 85%). 면은 남색 칠기(위 ${P.navyRaised} → 아래 ${P.navy}), 위쪽 30% 아주 옅은 광택. 테두리는 가는 앤티크 금선 1줄(높이의 3%)과 안쪽 아주 가는 금선 1줄, 모서리 살짝 둥금, 네 모서리에 아주 작은 금 덩굴 꺾쇠(높이의 18% 이내). 그 외 장식 없음`)],
  toast_pill: [A, '21:9', piece(`알림용 알약(캡슐) 모양 띠 1개(가로:세로 약 7:1, 캔버스 폭의 80%, 양 끝 완전한 반원). 면은 짙은 남색(${P.navyDeep}→${P.navy}), 테두리는 가는 앤티크 금선 1줄(높이의 4%), 양 끝 반원 안쪽에 아주 작은 금 덩굴 점 장식 하나씩. 그 외 장식 없음`, '3-slice(가로)로 늘려 쓸 조각: 양 끝 반원 사이 띠는 무늬 없이 곧고 균일')],
  header_ribbon: [A, '21:9', piece(`창 제목용 가로 리본 띠 1개(캔버스 폭의 85%, 가로:세로 약 7:1). 몸통은 깊은 남색 칠기 띠(위 ${P.navyRaised} → 아래 ${P.navy}), 위·아래 변에 곧은 앤티크 금 몰딩 1줄씩. 양 끝은 뒤로 접혀 들어간 리본 끝(제비꼬리처럼 V자로 파인 짧은 끝단, 접힌 면은 더 어두운 남색)과 이음부에 작은 금 덩굴 장식 하나씩, 좌우 대칭. 몸통 중앙 비움(제목 글자 자리)`, '3-slice(가로)로 늘려 쓸 조각: 양 끝 사이 몸통은 무늬 없이 곧고 균일')],
  frame_rank: [A, '1:1', `UI 스킨 조각: 정사각형 초상화 슬롯 프레임 1개(캔버스의 80%): 은백색 금속(흰~연회색~진회색 3단, 무채색) 몰딩 테두리(폭의 6% 두께, 왼쪽 위 밝은 베벨), 안쪽 가는 무채색 선 1줄, 네 모서리에 작은 바로크 덩굴 꺾쇠 장식(폭의 12% 크기, 무채색 금속), 모서리 살짝 둥금. 프레임 안쪽 구멍은 배경과 같은 순수 마젠타(${CHROMA})로 완전히 비움(속이 뚫린 액자 테두리만).
규칙: ${NINE}. 금속은 전부 무채색(색 입히기용)
스타일: ${UISKIN_STYLE}
배경: ${BG}
금지: ${NEG}`],
};
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
for (const id of (process.argv[2] ?? Object.keys(JOBS).join(',')).split(',')) { if (!JOBS[id]) { console.log(`[${id}] 작업 없음`); continue; }
  const [dir, ar, prompt] = JOBS[id]; mkdirSync(dir, { recursive: true }); const out = `${dir}/${id}.jpg`;
  if (dir === N && existsSync(out) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 있음`); continue; }
  if (dir === A && existsSync(`${A}/_prev_a/${id}.jpg`) && !process.argv.includes('--force')) { console.log(`[${id}] 이미 교체됨`); continue; }
  const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: RES.model, input: [{ type: 'text', text: prompt }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: ar, image_size: RES.image_size } }) });
  const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
  appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: 'uiskin_lib', id, status: res.status, model: RES.model }) + '\n');
  if (res.status === 429) { console.log(`[${id}] 429 — 즉시 중단`); process.exit(3); }
  const img = res.ok ? find(json) : null;
  if (!img) { console.log(`[${id}] 실패 HTTP ${res.status}: ${scrub(raw).slice(0, 200)}`); continue; }
  if (dir === A && existsSync(out)) { mkdirSync(`${A}/_prev_a`, { recursive: true }); if (!existsSync(`${A}/_prev_a/${id}.jpg`)) renameSync(out, `${A}/_prev_a/${id}.jpg`); }
  writeFileSync(out, Buffer.from(img.data, 'base64')); console.log(`[${id}] 성공 ${out}`);
}
