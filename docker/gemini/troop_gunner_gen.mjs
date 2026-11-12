// [2026-11-04 확장] 인자 library_a|library_b 로 공백병(서고 culture=library) 무명 병사 세트도 생성. 기본(인자 없음) = 총병 4장
// 무명 병사 초상 총병(gunner) 4장 생성(안아트 2026-11-04). 기존 portrait.troop.<culture>.<troop> 세트(2x2 시트 1회 = 4장, style_guide.mjs portrait_troop)와 같은 규격·그림체.
// 칸 순서: 좌상 japan, 우상 europe, 좌하 middle_east, 우하 default. 출력 public/assets/raw/portrait_troop/gunner.jpg(portrait_troop_pp.py 가 ORDER 이름으로 자르므로 publish 에서 이름 변경)
// 429 → 즉시 중단. 키는 --env-file 로만
import { writeFileSync, existsSync, mkdirSync, appendFileSync, renameSync } from 'node:fs';
import { RES, BASE_STYLE, KEY_BG, BASE_NEGATIVE } from './style_guide.mjs';
const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const MODE = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2] : 'gunner';
const OUT = `public/assets/raw/portrait_troop/${MODE}.jpg`, LOG = 'docker/gemini/troop_gunner_calls_log.jsonl';
const CELL = '정확히 2열x2행 균등 격자(4칸), 각 칸은 세로 3:4. 각 칸에 1명씩 허리 위 상반신(bust-up), 정면 또는 약간의 3/4 시선, 인물은 칸 가로 중앙, 머리 꼭대기(모자 포함)는 칸 위 경계에서 칸 높이의 6% 아래, 얼굴은 칸의 위쪽 1/3 안. ' +
  '총은 가슴 앞에 비스듬히 들어 작게 줄여도 총병이 읽히되 총구·개머리가 칸 밖으로 나가거나 옆 칸에 닿지 않음. 4명 모두 같은 그림체·같은 크기·같은 머리 높이·같은 광원(왼쪽 위). 칸과 칸 사이에 캔버스 폭의 4% 이상 마젠타 여백 띠. 격자선·칸 테두리·글자 없음';
const ANON = '네 명은 이름 없는 일반 병사(실존 인물·영웅·지휘관 아님). 장식 최소(망토·왕관·큰 깃털·금 장식·보석·문장 없음), 실용적이고 약간 낡은 장비. 주조색은 남색·철회색·갈색의 차분한 톤. 얼굴·피부색은 해당 문화권에 맞되 고정관념적 과장 금지. 성인만';
const P = `무명 병사 총병 초상 시트 1장: ${CELL}\n칸별 인물:\n` +
  '좌상) 16세기 말 일본 철포 아시가루: 납작한 원뿔형 철 진가사, 검은 칠 가벼운 도마루, 남색 일본식 상의, 화승총(뎃포)을 가슴 앞에 비스듬히 듦, 허리에 화약통과 감은 화승 줄, 짧은 검은 머리 20대 남성\n' +
  '우상) 16~17세기 서유럽 머스킷병: 챙 있는 철모 모리온(깃털 없음), 남색 상의 위 가죽 버프 코트, 가슴에 가로지른 탄약 끈(반돌리어, 작은 나무 화약통 여러 개), 화승식 머스킷을 비스듬히 듦, 갈색 머리 20대 여성\n' +
  '좌하) 16세기 오스만풍 중동 총병: 낮은 원통형 흰 펠트 모자에 터번 천, 긴 남색 카프탄과 허리 천 띠, 긴 화승총을 비스듬히 듦, 짧은 수염 30대 남성(종교 상징·글자 없음)\n' +
  '우하) 특정 시대·국가에 치우치지 않는 판타지 왕국 총병: 챙을 올린 파란 철 투구, 파란 튜닉 위 가죽 흉갑, 장식 없는 소총형 화승총을 비스듬히 듦, 포니테일 금발 20대 여성\n' +
  `공통: ${ANON}\n스타일: ${BASE_STYLE}\n배경: ${KEY_BG}\n금지: ${BASE_NEGATIVE}, 전신 샷, 한 칸에 두 명 이상, 수석식·현대식 총(방아쇠 울·탄창·스코프), 격자선·칸 테두리`;
const LIB = '시간의 서고에서 깨어난 이름 없는 공백병(빈 책장에서 태어난 병사): 얼굴은 눈·코·입이 없는 매끈한 흰 종이 가면으로 덮임(눈구멍 없음), 몸은 성인 체형, 갑옷은 바랜 양피지·흰 종이를 여러 겹 겹쳐 접은 판갑(가장자리가 살짝 해지고 먹 번짐), 짙은 남색 천 옷, 일부 갑옷에 붉은 펜으로 그은 가는 줄 하나. 시대·국가 복식 없음, 글자·문자·문양 없음';
const LIBT = { library_a: ['검병: 종이를 겹쳐 만든 둥근 투구, 곧은 양날 직검을 가슴 앞에 비스듬히 세워 쥠, 어깨 뒤로 종이 방패 가장자리', '창병: 종이 두건, 긴 창 자루를 어깨에 비스듬히 기대고 창날은 머리 옆 칸 안쪽', '기병: 종이 판갑과 종이 망토 자락, 기병창을 세로로 쥠, 어깨 뒤로 같은 방향을 보는 흰 종이로 접은 말 머리', '궁병: 종이 후드, 장궁을 어깨 앞에 세로로 들고 어깨 뒤로 종이 깃 화살'],
  library_b: ['수병: 소매를 걷은 종이 옷, 어깨에 감은 굵은 밧줄, 갈고리 창을 비스듬히 듦', '술사: 긴 종이 로브, 한 손에 빈 책(글자 없음)을 가슴 앞에, 다른 손 위에 떠 있는 작은 먹 방울', '치유사: 흰 종이 로브와 띠, 끝에 둥근 유리구가 달린 지팡이를 어깨 옆 세로로 쥠', '암살자: 짙은 남색 종이 후드, 가는 종이 단검을 역수로 쥐어 얼굴 옆에 세움'] };
const PL = (m) => `무명 병사 초상 시트 1장: ${CELL.replace('총은 가슴 앞에 비스듬히 들어 작게 줄여도 총병이 읽히되 총구·개머리가', '무기는 얼굴 옆 높이에서 보이게 배치하되 창끝·활 끝·말 머리가')}
칸 순서: 좌상·우상·좌하·우하
공통 인물: ${LIB}
칸별 인물:
${LIBT[m].map((t, i) => `${['좌상', '우상', '좌하', '우하'][i]}) ${t}`).join('\n')}
공통: ${ANON.replace('얼굴·피부색은 해당 문화권에 맞되 고정관념적 과장 금지. ', '')}
스타일: ${BASE_STYLE}
배경: ${KEY_BG}
금지: ${BASE_NEGATIVE}, 전신 샷, 한 칸에 두 명 이상, 가면의 눈·입 구멍, 글자·문자, 격자선·칸 테두리`;
// gunner2(2026-11-04): 좌상 korea(조선 총통수) · 우상 china(명 화창병, 보류용) · 좌하 south_asia(무굴 화승총병, 보류용) · 우하 korea 여성 변형(예비)
const P2 = `무명 병사 총병 초상 시트 1장: ${CELL}\n칸별 인물:\n` +
  '좌상) 16세기 말 조선 총통수: 검은 전립(꼭대기 붉은 술), 남색 철릭 위 징 박힌 가죽 두정갑 조끼, 허리에 화약 주머니와 심지 줄, 두 손으로 짧고 굵은 쇠 총통을 나무 자루째 가슴 앞에 비스듬히 듦, 짧은 수염 30대 남성\n' +
  '우상) 16세기 말 명나라 화창병: 붉은 술 달린 첨두 철투구, 미늘 찰갑 조끼와 남색 전포 소매, 긴 쇠 총열을 나무 자루에 끼운 화창을 비스듬히 듦, 20대 남성\n' +
  '좌하) 16세기 초 무굴 화승총병: 흰 터번, 무릎 길이 앞여밈 겉옷(짙은 녹색)과 허리 천 띠, 긴 화승총을 비스듬히 듦, 짧은 수염 30대 남성\n' +
  '우하) 16세기 말 조선 총통수: 검은 전립, 남색 철릭과 가죽 조끼, 쇠 총통을 비스듬히 듦, 머리를 단정히 묶은 20대 여성\n' +
  `공통: ${ANON}
스타일: ${BASE_STYLE}
배경: ${KEY_BG}
금지: ${BASE_NEGATIVE}, 전신 샷, 한 칸에 두 명 이상, 수석식·현대식 총(방아쇠 울·탄창·스코프), 격자선·칸 테두리`;
const PROMPT = MODE === 'gunner' ? P : MODE === 'gunner2' ? P2 : PL(MODE);
const key = process.env.GEMINI_API_KEY; if (!key) { console.error('GEMINI_API_KEY 미설정'); process.exit(1); }
const scrub = (s) => String(s).split(key).join('[REDACTED]');
const find = (n) => { if (!n || typeof n !== 'object') return null; if (n.type === 'image' && typeof n.data === 'string') return n; for (const v of Array.isArray(n) ? n : Object.values(n)) { const f = find(v); if (f) return f; } return null; };
mkdirSync('public/assets/raw/portrait_troop', { recursive: true });
if (existsSync(OUT) && !process.argv.includes('--force')) { console.log('이미 있음'); process.exit(0); }
const res = await fetch(ENDPOINT, { method: 'POST', headers: { 'x-goog-api-key': key, 'Content-Type': 'application/json' },
  body: JSON.stringify({ model: RES.model, input: [{ type: 'text', text: PROMPT }], response_format: { type: 'image', mime_type: RES.mime, aspect_ratio: '3:4', image_size: RES.image_size } }) });
const raw = await res.text(); let json = null; try { json = JSON.parse(raw); } catch { /* */ }
appendFileSync(LOG, JSON.stringify({ ts: new Date().toISOString(), category: `portrait_troop_${MODE}`, status: res.status, model: RES.model }) + '\n');
if (res.status === 429) { console.log('429 — 즉시 중단'); process.exit(3); }
const img = res.ok ? find(json) : null;
if (img) { if (existsSync(OUT)) renameSync(OUT, OUT.replace('.jpg', '_try1.jpg')); writeFileSync(OUT, Buffer.from(img.data, 'base64')); console.log('성공', OUT); } else console.log('실패', res.status, scrub(raw).slice(0, 200));
