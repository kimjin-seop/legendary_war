// ch21 유럽 장수 전용 3명(바츨라프 1세·우그린 차크·파코스와프) + 바투·후마윤 초상 — 작업 정의(안아트 2026-11-03).
// 다른 안아트 인스턴스가 portrait_npc_story_style.mjs·unit_npc_sprite_style.mjs 를 동시 편집 중이라 별도 모듈로 분리.
//   이 모듈을 import 한 프로세스 안에서만 P_NPC_STORY(초상 job 조립)·NPC(시트 job 조립)에 항목을 더한다(파일은 수정하지 않음).
//   생성: node docker/gemini/npc_ch21eu_gen.mjs portrait|sprite id1,id2 [...] / 반영: node docker/gemini/npc_ch21eu_publish.mjs [--dry]
// 근거: docs/original_story/ch21_europe_npc_rows_draft.json, ch21_europe_generals_proposal.md, ch21_ch22_research.md.
//   팀장 지시(2026-11-03): 술리스와프·볼레슬라프·콜로만·렘발드는 전용 제작 생략 → 공용 portrait.troop.europe.* / unit.europe.*.
// 규칙: 실존 인물 얼굴 재현 금지(나이·수염만), 문장(보헤미아 사자·산도미에시 문장 등)·십자가·종교 표지·글자 없음 — 무지 단색 서코트.
// 64px·초상 색 축(기존 헨리크 2세 = 청색 서코트+금빛 서클렛+코이프 와 구분):
//   바츨라프 1세 = 낮은 금관+흰 모피 깃 진홍 망토+짙은 회색 서코트, 기마 / 우그린 = 검은 성직자 긴 옷 위 사슬 갑옷+맨머리 회색 짧은 머리+철퇴 / 파코스와프 = 코 가리개 원뿔 투구+짙은 녹색 서코트+장검
import { P_NPC_STORY } from './portrait_npc_story_style.mjs';
import { NPC } from './unit_npc_sprite_style.mjs';

const REF_EUR = 'public/assets/portraits/richard_i.png', REF_MON = 'public/assets/portraits/genghis_khan.png', REF_MID = 'public/assets/portraits/saladin.png';
const EU13 = '13세기 중엽(1241) 중부유럽 기사 복식 일반화: 쇠사슬 갑옷(호버크)과 쇠사슬 두건(코이프), 무릎까지 오는 소매 없는 천 겉옷(서코트, 문장·무늬 없는 단색), 가죽 칼띠. 15세기 이후 판금 전신갑·르네상스 복식 금지. 문장·사자·독수리 도안·십자가·종교 표지·글자 없음';
const MONGOL13 = '13세기 중엽(1241) 몽골 제국 장수 복식 일반화: 오른쪽으로 여미는 긴 델과 넓은 허리띠, 가죽·쇠 미늘을 끈으로 엮은 찰갑, 펠트·가죽 장화, 정수리를 깎고 귀 뒤로 땋은 머리 고리. 일본 갑옷·한국 전립·청대 변발 금지';
const IND16 = '16세기 초(1526) 북인도·중앙아시아 무장 복식 일반화: 무릎까지 오는 앞여밈 긴 겉옷, 허리 천 띠, 칼집에 든 약간 휜 외날 칼. 예니체리 높은 모자·페즈·19세기 복식 금지. 글자·명문·종교 문양 없음';
const H = (code, name, used, side, ref, era, culture, desc, verify) => ({ [code]: { name, roster: code, used_in: used, side, ref, kind: 'hist', era, culture, desc, verify } });

export const P_EU = {
  ...H('npc_wenceslas_i_bohemia', '바츨라프 1세', ['ch21_s3', 'ch21_s4'], 'enemy', REF_EUR, '13세기(1205경~1253, verify)', 'bohemia',
    `30대 중반 왕, 단정하고 신중한 얼굴, 짧게 다듬은 밤색 턱수염과 콧수염, 멀리 소식을 기다리는 듯한 굳은 회갈색 눈. ${EU13}. 쇠사슬 두건은 목 뒤로 내려 맨머리(어깨에 닿지 않는 밤색 머리), 머리에 낮고 소박한 금관(가는 금 띠 위 낮은 삼각 꼭지 몇 개, 백합·보석 장식 없음). 쇠사슬 갑옷 위 짙은 회색 단색 서코트, 어깨에 흰 모피 깃을 단 짙은 진홍색 긴 망토(무늬 없음). 오른손에 가죽 말고삐 장갑을 낀 채 칼집째 든 장검 자루를 쥠, 왼손은 망토 자락을 쥠. 방패·깃발·문장 없음`,
    '용모 근거 없음(나이·수염만 일반화). 보헤미아 문장(붉은 바탕 흰 사자)은 금지 규칙으로 생략. 전장에 직접 서지 않은 인물(선발대 라벨용)'),
  ...H('npc_ugrin_csak', '우그린 차크', ['ch21_s5'], 'enemy', REF_EUR, '13세기(?~1241)', 'hungary',
    `50대 초반 성직자 지휘관, 각지고 엄격한 얼굴, 수염 없이 깨끗이 깎은 턱, 짧게 자른 회색 머리(맨머리, 모자·관 없음), 굳게 다문 입과 결연한 짙은 눈. ${EU13}. 발목까지 오는 검은 성직자 긴 옷 위에 무릎까지 오는 쇠사슬 갑옷을 덧입음, 어깨에 짧은 검은 어깨 망토(케이프), 넓은 갈색 가죽 칼띠. 오른손에 날개 달린 쇠 머리의 철퇴(플랜지 메이스)를 가슴 높이에 세워 쥠. 목걸이·십자가·주교관·지팡이·종교 표지 없음, 보라·자주 옷 금지`,
    '칼로차 대주교(accepted). 종교 평가어·종교 표지 배제, 군사 지휘 맥락으로만. 용모 근거 없음(나이 제안값)'),
  ...H('npc_pakoslaw_sandomierz', '파코스와프', ['ch21_s1'], 'enemy', REF_EUR, '13세기 중엽(1241, 생몰 verify)', 'poland(sandomierz)',
    `50대 노련한 지방 장관(보이보다), 넓고 단단한 얼굴, 숱 많은 짙은 회색 턱수염과 콧수염, 깊은 주름, 침착한 회색 눈. ${EU13}. 코 가리개가 달린 원뿔형 쇠 투구(장식 없음)를 쓰고 그 아래 쇠사슬 두건, 쇠사슬 갑옷 위 짙은 녹색 단색 서코트(무늬 없음), 넓은 갈색 가죽 칼띠. 오른손에 곧은 양날 장검을 칼끝 위로 세워 쥠(칼끝은 머리 옆, 프레임 안). 방패·깃발·문장 없음`,
    '산도미에시 측 지휘관(accepted). 산도미에시 문장 외투는 금지 규칙으로 무지 녹색. 이름 표기 verify. 용모 일반화'),
  // 바투·후마윤: 다른 인스턴스가 만든 noPortrait 잠정 시트(unit_npc_sprite_style.mjs npc_batu·npc_humayun)의 머리 장비·주색·소지품에 맞춘다.
  ...H('npc_batu', '바투', ['ch21_s2'], 'ally', REF_MON, '13세기(1207경~1255, verify)', 'steppe(mongol)',
    `30대 중반 서정군 총사령, 위엄 있고 침착한 넓은 얼굴, 짧은 검은 콧수염과 턱수염, 전장을 내려다보는 듯한 깊은 눈. ${MONGOL13}. 꼭대기에 흰 말총 술이 달린 둥근 쇠 투구(목 뒤 갈색 가죽 드림, 앞장식 없음), 금실 테두리를 두른 짙은 금빛 황토색 비단 델, 그 위 짙은 강철색 미늘 찰갑 조끼, 넓은 갈색 가죽 허리띠. 오른손에 약간 휜 외날 칼을 칼끝 위로 비스듬히 듦(칼끝은 머리 옆, 프레임 안)`,
    '용모 근거 없음(나이·수염만). 투구 흰 술·황토 델은 맵 시트 npc_batu(잠정)와 맞춘 제안값'),
  ...H('npc_humayun', '후마윤', ['ch22_s1'], 'ally', REF_MID, '16세기(1508~1556, 1526 당시 약 18세)', 'central_asia(timurid)',
    `18세 무렵의 젊은 성인 장수(앳된 아이 외견 금지, 성인 체형), 갸름하고 진지한 얼굴, 아주 짧은 콧수염(턱수염 거의 없음), 아버지 앞에서 인정받고 싶은 듯 곧고 의욕적인 눈. ${IND16}. 아래에 흰 천을 감은 가볍고 낮은 둥근 쇠 투구(짧은 뾰족 끝, 장식 없음), 무릎까지 오는 짙은 붉은 긴 겉옷(가는 금빛 테두리, 큰 문양 없음), 갈색 가죽 허리띠. 오른손에 약간 휜 외날 칼을 칼끝 위로 비스듬히 듦(칼끝은 머리 옆, 프레임 안). 공책·보석 장식 없음`,
    '당일 역할 verify(설계: 이름표·합류 spawn 용). 투구·붉은 겉옷은 맵 시트 npc_humayun(잠정)과 맞춘 제안값'),
};

const EU13S = '13세기 중엽 중부유럽 기사 복식 일반화(쇠사슬 갑옷·코이프, 무지 단색 서코트. 판금 전신갑·문장·십자가 금지)';
export const S_EU = {
  npc_wenceslas_i_bohemia: { name: '바츨라프 1세', side: 'enemy', culture: 'europe', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${EU13S}. 짙은 회색 말을 탄 30대 중반 왕(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 짧은 밤색 턱수염. 맨머리 밤색 머리에 낮은 금관, 쇠사슬 갑옷 위 짙은 회색 서코트, 흰 모피 깃의 짙은 진홍 망토가 말 엉덩이 위로 늘어짐. 오른손에 칼집째 든 장검. 말: 짙은 회색 몸, 검은 갈기, 짙은 진홍 안장 천(무늬 없음)`,
    back: '말 엉덩이와 검은 꼬리, 기수의 진홍 망토와 흰 모피 깃, 금관 뒷면', side: '회색 말이 왼쪽을 향해 걷고 기수는 칼집 장검을 몸 앞에 듦, 진홍 망토 옆선', forbid: '깃발, 창, 활, 방패, 문장, 사자 도안, 투구, 보병(말 없는 모습)', fallback: 'unit.europe.cavalry.enemy.64.sheet', verify: '용모 일반화, 문장 생략' },
  npc_ugrin_csak: { name: '우그린 차크', side: 'enemy', culture: 'europe', troop: 'heavy', layout: 'sword',
    sprite: `${EU13S}. 50대 초반 성직자 지휘관, 수염 없음, 짧은 회색 맨머리. 발목까지 오는 검은 긴 옷 위에 무릎까지 오는 쇠사슬 갑옷, 짧은 검은 어깨 망토, 갈색 가죽 칼띠. 오른손에 날개 달린 쇠 머리 철퇴를 세워 쥠`,
    back: '짧은 회색 머리 뒤통수, 검은 어깨 망토와 쇠사슬 등판, 검은 긴 옷자락이 발목까지', side: '철퇴를 몸 앞에 세워 쥠, 검은 옷자락', forbid: '칼, 창, 활, 방패, 십자가, 주교관, 지팡이, 투구, 보라색', fallback: 'unit.europe.heavy.enemy.64.sheet', verify: '종교 표지 배제. 용모 일반화' },
  npc_pakoslaw_sandomierz: { name: '파코스와프', side: 'enemy', culture: 'europe', troop: 'heavy', layout: 'sword',
    sprite: `${EU13S}. 50대 장수, 숱 많은 짙은 회색 턱수염. 코 가리개 달린 원뿔형 쇠 투구와 쇠사슬 두건, 쇠사슬 갑옷 위 짙은 녹색 서코트(무늬 없음), 갈색 칼띠. 오른손에 곧은 양날 장검을 칼끝 위로 세워 쥠`,
    back: '원뿔형 투구 뒷면과 쇠사슬 두건, 녹색 서코트 등판, 칼끝이 머리 옆으로', side: '원뿔 투구 코 가리개 옆선, 장검을 몸 앞에 세워 쥠', forbid: '창, 활, 방패, 문장, 깃발, 말, 망토', fallback: 'unit.europe.heavy.enemy.64.sheet', verify: '문장 외투 생략(무지 녹색). 용모 일반화' },
};

// 전용 제작 생략 4명 → 공용 키(팀장 지시 2026-11-03, 표시 이름은 NPC_NAMES 로만 구분)
export const GENERIC_MAP = {
  npc_sulislaw_krakow: { troop: 'cavalry', portrait: 'portrait.troop.europe.cavalry', sheet: 'unit.europe.cavalry.enemy.64.sheet' },
  npc_boleslav_depolt: { troop: 'spear', portrait: 'portrait.troop.europe.spear', sheet: 'unit.europe.spear.enemy.64.sheet' },
  npc_coloman_hungary: { troop: 'cavalry', portrait: 'portrait.troop.europe.cavalry', sheet: 'unit.europe.cavalry.enemy.64.sheet' },
  npc_rembald_voczon: { troop: 'heavy', portrait: 'portrait.troop.europe.sword', sheet: 'unit.europe.heavy.enemy.64.sheet', note: 'portrait.troop.europe.heavy 키 없음 → europe.sword(사슬+무지 서코트) 사용. 템플 십자 없음' },
};

// ===== ch22 신규 스테이지(1524~1527) 전용 2명(안아트 2026-11-03, 팀장 지시). 근거: docs/original_story/ch21_ch22_8stage_outline.md, database/data/stages_ch22_new_s1_s4_s6_s8.json.
//   다울라트 칸 로디 = s3 아군 NPC(초청 후 이탈) / 라나 상가 = s7 적 지휘관(cavalry). 라나 상가: 한쪽 눈·흉터 등 외형 과장 금지, 존중하는 묘사, 문장·이마 표식 없음.
//   64px 축(이브라힘 로디 = 상아 터번+벽돌 적갈, 바부르 = 흰 터번+올리브녹색, 후마윤 = 투구+붉은 겉옷 과 구분):
//     다울라트 = 큰 회백 터번+흰 긴 수염+짙은 남색 겉옷 위 사슬 깃+접은 서신 / 라나 상가 = 사프란 주황 터번+누빈 사프란 겉옷 위 사슬+둥근 무지 방패+곧은 칼, 흰 말
const SA16 = '16세기 초(1524~1527) 북인도·편자브 무장 귀족 복식 일반화: 무릎 아래까지 오는 앞여밈 긴 겉옷(자마), 허리에 감은 천 띠, 머리에 감은 터번, 사슬 갑옷 또는 누빈 천 갑옷. 19세기 이후 복식·오스만 궁정 복식 과장 금지. 글자·명문·종교 문양·이마 표식 없음';
Object.assign(P_EU, {
  ...H('npc_dawlat_khan_lodi', '다울라트 칸 로디', ['ch22_s3'], 'ally', REF_MID, '16세기 초(?~1526, verify)', 'south_asia(afghan)',
    `60대 노련한 지방 총독, 길쭉하고 주름진 얼굴, 가슴까지 내려오는 흰 긴 턱수염과 흰 콧수염, 속내를 잘 드러내지 않는 가늘고 영리한 눈(악역 과장 금지). ${SA16}. 크게 여러 번 감은 회백색 무명 터번(장식 없음), 무릎 아래까지 오는 쇠사슬 갑옷 위에 짙은 남색 비단 긴 겉옷(앞섶이 트여 사슬이 보임, 가는 은빛 테두리), 허리에 감은 회갈색 천 띠, 띠에 칼집째 꽂은 휜 칼. 왼손에 끈으로 묶어 접은 서신 한 통을 가슴 앞에 쥠(글자·도장 보이지 않음), 오른손은 칼자루 위에 얹음`,
    '인물 confirmed, 용모 근거 없음(나이·수염만 일반화). 서신 = s3 초청 서사 상징(글자 없음)'),
  ...H('npc_rana_sanga', '라나 상가', ['ch22_s7'], 'enemy', REF_MID, '16세기 초(1482~1528, verify)', 'south_asia(rajput)',
    `40대 중반 군주, 당당하고 위엄 있는 얼굴, 양옆으로 길게 뻗은 짙은 검은 콧수염과 짧은 구레나룻, 흔들림 없는 깊은 눈(두 눈 모두 정상, 흉터·상처·안대 없음, 존중하는 묘사). ${SA16}. 오른쪽으로 비스듬히 감은 사프란빛 주황 터번(가는 진주 끈 하나, 깃털·보석 장식 없음), 무릎까지 오는 누빈 사프란빛 주황 비단 겉옷 위에 쇠사슬 흉갑, 허리에 감은 짙은 녹색 천 띠. 오른손에 곧은 넓은 칼날의 칼을 칼끝 위로 세워 쥠(칼끝은 머리 옆, 프레임 안), 왼팔에 무늬 없는 둥근 짙은 갈색 가죽 방패(쇠 징 네 개)`,
    '인물 confirmed, 성격 invented. 한쪽 눈·팔 상실 전승은 외형에 반영하지 않음(팀장 지시). 문장·종교 표식 생략. 용모 일반화'),
});
const SA16S = '16세기 초 북인도 무장 복식 일반화(앞여밈 긴 겉옷, 허리 천 띠, 터번. 19세기 복식·페즈·예니체리 모자 금지)';
Object.assign(S_EU, {
  npc_dawlat_khan_lodi: { name: '다울라트 칸 로디', side: 'ally', culture: 'middle_east', troop: 'sword', layout: 'sword',
    sprite: `${SA16S}. 60대 노총독, 흰 긴 턱수염. 크게 감은 회백 터번, 사슬 갑옷 위 짙은 남색 긴 겉옷(은빛 테), 회갈색 허리 천 띠에 칼집째 꽂은 휜 칼. 왼손에 접은 서신(흰 종이 뭉치), 오른손은 칼자루 위`,
    back: '회백 터번 뒷면과 흰 수염 끝, 짙은 남색 겉옷 등판, 칼집 끝이 몸 옆으로', side: '흰 긴 수염 옆선, 접은 서신을 가슴 앞에, 허리 칼집', forbid: '창, 활, 방패, 말, 칼 뽑기, 붉은 옷, 투구', fallback: 'unit.middle_east.sword.ally.64.sheet', verify: '용모 일반화' },
  npc_rana_sanga: { name: '라나 상가', side: 'enemy', culture: 'middle_east', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${SA16S}. 흰 말을 탄 40대 중반 군주(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 양옆으로 뻗은 검은 콧수염. 사프란 주황 터번, 누빈 사프란 주황 겉옷 위 사슬 흉갑, 짙은 녹색 허리 띠. 오른손에 곧은 넓은 칼을 칼끝 위로, 왼팔에 무늬 없는 둥근 갈색 방패. 말: 흰 몸, 회색 갈기, 짙은 녹색 안장 천(무늬 없음). 흉터·안대 없음`,
    back: '흰 말 엉덩이와 회색 꼬리, 기수의 주황 터번과 주황 겉옷 등판, 둥근 방패 뒷면', side: '흰 말이 왼쪽을 향해 걷고 기수는 칼을 세워 듦, 주황 터번 옆선', forbid: '깃발, 창, 활, 문장, 안대, 투구, 보병(말 없는 모습)', fallback: 'unit.middle_east.cavalry.enemy.64.sheet', verify: '용모 일반화, 외형 과장 금지' },
});
Object.assign(GENERIC_MAP, {
  npc_bihar_khan_lodi: { troop: 'cavalry', portrait: 'portrait.troop.middle_east.cavalry', sheet: 'unit.middle_east.cavalry.enemy.64.sheet' },
  npc_hamid_khan: { troop: 'cavalry', portrait: 'portrait.troop.middle_east.cavalry', sheet: 'unit.middle_east.cavalry.enemy.64.sheet' },
  npc_hasan_khan_mewati: { troop: 'cavalry', portrait: 'portrait.troop.middle_east.cavalry', sheet: 'unit.middle_east.cavalry.enemy.64.sheet' },
  npc_mahmud_lodi: { troop: 'cavalry|sword', portrait: 'portrait.troop.middle_east.cavalry (sword 배치 시 portrait.troop.middle_east.sword)', sheet: 'unit.middle_east.cavalry.enemy.64.sheet / unit.middle_east.sword.enemy.64.sheet' },
  npc_mustafa_rumi: { troop: 'archer(총병, 아군)', portrait: 'portrait.troop.middle_east.archer', sheet: 'unit.middle_east.archer.ally.64.sheet', note: 'south_asia 공용 키 없음 → 전원 middle_east 계열' },
});

Object.assign(P_NPC_STORY, P_EU);
Object.assign(NPC, S_EU);
