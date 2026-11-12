// 신규 로스터 NPC 초상(안아트 2026-11-04, 팀장 요청). 근거: database/data/new_roster_portrait_requests.json(송서사·임밸런) 의 name_ko·shelf·culture·era·troop_type·role·costume_hint·portrait_prompt_ko.
// 이미 초상이 있는 코드(manifest portrait.<code>)와 npc_william_i(기존 william_i 복제)는 제외. 우선순위 = 칩 노출 중요도(ORDER).
// 조립: portrait_campaign_style.mjs job()(896x1200, 마젠타) — portrait_npc_story_style.mjs 가 P_NPC_EXT3 를 P_NPC_STORY 에 합침.
// 규칙: 실존 인물 얼굴 재현 아님(나이·수염·체격만), 시대 복식 일반화, 글자·문장·깃발 문양·종교 상징(십자가·초승달·종교 문구) 없음, 마젠타·분홍·보라 옷 금지.
import { readFileSync } from 'node:fs';
const REQ = JSON.parse(readFileSync('database/data/new_roster_portrait_requests.json', 'utf8')).items;
// 요청 시점(2026-11-04)에 이미 초상이 있던 코드 — 고정 목록(manifest 를 읽어 거르면 게시 후 항목이 조각에서 빠지므로)
const SKIP = new Set(['npc_william_i', 'npc_orda', 'npc_hasdrubal_gisgo', 'npc_ariobarzanes']);
export const ORDER = ['ch14', 'ch24', 'ch20', 'ch12', 'ch21', 'ch22', 'ch19', 'ch15', 'ch16', 'ch17', 'ch11', 'ch13'];   // ch11·ch13·ch14(수) 9건은 2026-11-04 추가분(맨 뒤, 같은 정렬 안에서 ch14 수나라는 ch14 묶음 끝)
const P = (n) => `public/assets/portraits/${n}.png`;
// 서가·문화별 시대 복식(일반화)과 스타일 참조(원본 PNG 가 남아 있는 것만)
const ERA = {
  'ch14|korea': ['7세기 초(612) 고구려 복식 일반화: 미늘을 엮은 찰갑, 정수리가 둥근 쇠 투구 또는 새 깃 꽂은 절풍모, 통 넓은 바지와 허리띠, 환두대도. 조선·고려 후기 복식 금지', P('gyebaek')],
  'ch14|china': ['7세기 초(612) 수나라 원정군 장수 복식 일반화: 미늘 찰갑과 어깨 덮개, 붉은 술 달린 쇠 투구, 짙은 전포, 환두대도·창. 당·명대 장식 금지', P('taizong_tang')],
  'ch11|korea': ['10~11세기 초 고려 무장 복식 일반화: 미늘 찰갑 또는 두꺼운 가죽 갑옷, 붉은 술 달린 둥근 쇠 투구, 전포와 허리띠, 환두대도·장창. 조선 복식 금지', P('gang_gamchan')],
  'ch13|china': ['7세기 중엽(660) 백제 문신 복식 일반화: 짙은 청색 관복 위 얇은 가슴 갑옷, 검은 관, 금빛 허리띠, 서책(글자 없음). 조선 관복 금지', P('gyebaek')],
  'ch18|steppe': ['12세기 말~13세기 초(1204) 몽골 고원 부족 장수 복식 일반화: 오른쪽으로 여미는 긴 델과 넓은 허리띠, 가죽 미늘 찰갑, 털 달린 모자 또는 쇠 투구, 땋은 머리. 종교 상징 금지', P('genghis_khan')],
  'ch24|europe': ['8세기 초(732) 프랑크·아키텐 복식 일반화: 무릎 길이 양모 튜닉, 짧은 쇠사슬 또는 가죽 갑옷, 원뿔형 쇠 투구, 무늬 없는 둥근 방패. 중세 후기 판금·문장 금지', P('charles_martel')],
  'ch24|middle_east': ['8세기 초(732) 우마이야 안달루스·베르베르 군 복식 일반화: 머리에 감은 천(터번) 또는 둥근 쇠 투구, 쇠사슬 갑옷 위 긴 겉옷, 둥근 가죽 방패, 곧은 칼 또는 약간 휜 칼. 종교 문구·초승달 금지', P('saladin')],
  'ch20|japan': ['16세기 후반(1575) 일본 전국 무장 복식 일반화: 미늘을 엮은 당세구족(어깨 소데·허리 쿠사즈리), 투구 또는 머리띠. 가문 문장·글자 없음', P('oda_nobunaga')],
  'ch12|china': ['후한 말(208) 위(조조군) 장수 복식 일반화: 미늘 찰갑, 짙은 남청 전포와 검은 옻칠 톤, 상투 위 쇠 투구. 당·명대 장식 금지', P('cao_cao')],
  'ch21|steppe': ['13세기 중엽(1241) 몽골 제국 장수 복식 일반화: 오른쪽으로 여미는 긴 델과 넓은 허리띠, 가죽·쇠 미늘 찰갑, 털 깃 모자 또는 쇠 투구, 땋은 머리 고리', P('genghis_khan')],
  'ch21|hre': ['13세기 중엽(1241) 중부유럽 기사 복식 일반화: 쇠사슬 두건(코이프)과 쇠사슬 갑옷, 무늬 없는 단색 서코트, 원통형 또는 원뿔형 투구. 판금 전신갑·문장·십자가 금지', P('richard_i')],
  'ch22|south_asia': ['16세기 초(1526) 북인도·중앙아시아 무장 귀족 복식 일반화: 무릎 아래 앞여밈 긴 겉옷, 허리 천 띠, 감은 터번, 휜 외날 칼. 19세기 복식·종교 표식 금지', P('npc/npc_ibrahim_lodi')],
  'ch19|middle_east': ['12세기 말(1187) 아이유브 군 복식 일반화: 쇠사슬 갑옷 위 누빈 겉옷(카자간), 터번을 감은 쇠 투구, 둥근 방패, 휜 칼·복합궁. 종교 문구·초승달 금지', P('saladin')],
  'ch19|europe': ['12세기 말(1187) 예루살렘 왕국 귀족·기사 복식 일반화: 쇠사슬 갑옷과 무늬 없는 단색 서코트, 원통형 투구, 귀부인은 긴 드레스와 베일. 십자가·문장 금지', P('richard_i')],
  'ch15|ancient_med': ['기원전 3세기 말 로마 공화정 장교 복식 일반화: 청동 근육 흉갑 또는 쇠사슬 갑옷(로리카 하마타), 깃털 술 투구, 붉은 망토(파루다멘툼), 글라디우스. 제정기 판갑(세그멘타타)·글자(SPQR) 금지', P('scipio_africanus')],
  'ch15|carthage': ['기원전 3세기 말 카르타고·누미디아 복식 일반화: 청동 흉갑 또는 아마포 흉갑, 진홍 망토, 누미디아는 짧은 튜닉·가죽 갑옷·투창. 신 상징 금지', P('hannibal')],
  'ch16|europe': ['15세기 초(1429) 잉글랜드 귀족·기사 복식 일반화: 판금과 쇠사슬 혼합 갑옷, 무늬 없는 단색 겉옷(재킷), 바시넷 투구, 장궁병은 누빈 갬비슨. 문장·성 조지 십자 금지', P('henry_v')],
  'ch17|macedon': ['기원전 4세기(331) 마케도니아 장교 복식 일반화: 청동 흉갑 또는 아마포 흉갑, 볏 달린 프리기아식 청동 투구, 짧은 튜닉과 망토, 긴 창(사리사). 베르기나 태양 문장 금지', P('alexander_nevsky')],
};
const HOLD = { sword: '허리의 칼 손잡이에 손을 얹음', spear: '긴 창을 세워 쥠(창끝은 프레임 안)', archer: '활과 화살통', cavalry: '기병창을 세워 쥠(말은 화면에 없음)', healer: '무기 대신 말린 두루마리 또는 지팡이(글자 없음)', mage: '무기 대신 홀을 두 손으로 쥠' };
const H = (x) => {
  const era = ERA[`${x.shelf}|${x.culture}`] ?? ERA[Object.keys(ERA).find((k) => k.startsWith(x.shelf + '|'))] ?? ['시대 복식 일반화', P('saladin')];
  const face = x.portrait_prompt_ko ? x.portrait_prompt_ko : '성인 인물';
  const desc = `${x.name_ko}: ${x.role}. ${face}. 복식 단서: ${x.costume_hint}. ${era[0]}. 소품: ${HOLD[x.troop_type] ?? '병종에 맞는 무기'}`;
  const v = x.evidence_level === 'invented' ? '직함형 허구 인물(invented) — 복식만 시대 일반화' : `근거 ${x.evidence_level} — 용모 기록 없음·적음, 나이·체격·수염과 복식 일반화(verify)`;
  return [x.code, { name: x.name_ko, roster: x.code, used_in: [x.shelf], side: 'enemy', ref: era[1], kind: x.evidence_level === 'invented' ? 'invented' : 'hist', era: x.era, culture: x.culture, desc, verify: v, female: /왕비|부인|여왕|에시바|시빌라/.test(x.name_ko + x.role) }];
};
// 2026-11-04 팀장 추가(서가 칩 상위 5 노출, 요청 파일에 없던 인물). 영웅과 같은 인물(subutai·babur·jalal_ad_din)은 별칭 복제로 처리하고 여기서 그리지 않음
const EXTRA = [
  { code: 'npc_zhang_liao', name_ko: '장료', shelf: 'ch12', culture: 'china', era: '후한 말(169~222)', troop_type: 'cavalry', role: '조조군 맹장, 기병 돌격으로 이름난 장수', evidence_level: 'accepted', costume_hint: '후한 말 중장 갑옷, 짙은 남청 전포, 긴 극(戟)', portrait_prompt_ko: '40대 장수, 매서운 눈, 짧게 다듬은 검은 턱수염' },
  { code: 'npc_jamukha', name_ko: '자무카', shelf: 'ch18', culture: 'steppe', era: '12세기 말~1206', troop_type: 'cavalry', role: '자다란 부의 수장, 테무진의 옛 의형제이자 맞수', evidence_level: 'accepted', costume_hint: '짙은 적갈 델, 털 깃 모자, 활과 화살통', portrait_prompt_ko: '40대 초원 수장, 날카롭고 자존심 강한 눈, 짧은 콧수염' },
  { code: 'npc_tayang_khan', name_ko: '타양 칸', shelf: 'ch18', culture: 'steppe', era: '12세기 말~1204', troop_type: 'cavalry', role: '나이만의 칸', evidence_level: 'accepted', costume_hint: '짙은 쪽빛 비단 델과 금빛 허리띠, 높은 털모자', portrait_prompt_ko: '50대 칸, 무겁고 신중한 얼굴, 희끗한 콧수염' },
];
REQ.push(...EXTRA); ORDER.push('ch18');
const todo = REQ.filter((x) => !SKIP.has(x.code) && ORDER.includes(x.shelf))
  .sort((a, b) => ORDER.indexOf(a.shelf) - ORDER.indexOf(b.shelf));
export const P_NPC_EXT3 = Object.fromEntries(todo.map(H));
export const IDS3 = Object.keys(P_NPC_EXT3).map((c) => `portrait_${c}`);
