// ch21 유럽 장수 보충(브워지미에시·미에슈코 2세) + ch18 나이만 잔당 우두머리 — 작업 정의(안아트 2026-11-03, 팀장 지시 "초상/스프라이트 보충").
// npc_ch21eu_style.mjs 와 같은 방식: 이 모듈을 import 한 프로세스 안에서만 P_NPC_STORY(초상)·NPC(시트)에 항목을 더한다(기존 파일 무수정).
//   생성: node docker/gemini/npc_ch2122b_gen.mjs portrait|sprite id1,id2 / 반영: node docker/gemini/npc_ch2122b_publish.mjs [--dry]
// 대상 확인(데이터 근거):
//   npc_wlodzimierz_krakow = database/data/npc_roster_shelf_ch21_europe.json (ch21_s1 적 지휘관 heavy, 초상·시트 없음)
//   npc_mieszko_ii_opole   = 같은 파일 (ch21_s2 적 총대장 heavy, stages_ch21_new_s1_s3_s6_s8.json enemy_squads A leader) — "ch21 적 대표 지휘관" 중 초상 없는 유일한 이름 있는 인물
//   npc_naiman_remnant_chief = database/data/stages_ch18_mongol.json ch18_s1 enemy_squads A leader(generic, ref null, "나이만 계열 잔당 우두머리(각색)", cavalry). 로스터 행 없음 → 에셋 코드만 신설
//   잘랄 앗딘 = 이미 영웅 에셋 있음(portrait.jalal_ad_din, unit.hero.jalal_ad_din.*). ch18_s6 leader(generic, ref null)에 연결만 하면 됨 → 신규 제작 없음
// 규칙: 실존 인물 얼굴 재현 금지(나이·수염만), 문장(크라쿠프 흰 독수리·오폴레 금독수리 등)·십자가·종교 표지·글자 없음 — 무지 단색 서코트.
// 64px 색 축(기존과 구분): 헨리크 2세 = 청색 서코트+금빛 서클렛 / 파코스와프 = 원뿔 코가리개 투구+짙은 녹색 / 바츨라프 = 금관+진홍 망토+회색 / 우그린 = 검은 긴 옷+철퇴
//   브워지미에시 = 둥근 쇠 투구(코가리개 없음)+짙은 포도주빛 적갈 서코트+갈색 반망토+장검 칼끝 아래로
//   미에슈코 2세 = 맨머리 쇠사슬 두건+가는 은 띠+겨자빛 황토 서코트+외날 전투 도끼, 20대 초반 다부진 체격
//   나이만 우두머리 = 회백 늑대털 테 뾰족 펠트 모자+흑갈색 델+녹슨 쇠 찰갑+긴 창, 회색 말 (몽골 아군 주색 적·황토·청록과 구분)
import { P_NPC_STORY } from './portrait_npc_story_style.mjs';
import { NPC } from './unit_npc_sprite_style.mjs';

const REF_EUR = 'public/assets/portraits/richard_i.png', REF_MON = 'public/assets/portraits/genghis_khan.png';
const EU13 = '13세기 중엽(1241) 중부유럽 기사 복식 일반화: 쇠사슬 갑옷(호버크)과 쇠사슬 두건(코이프), 무릎까지 오는 소매 없는 천 겉옷(서코트, 문장·무늬 없는 단색), 가죽 칼띠. 15세기 이후 판금 전신갑·르네상스 복식 금지. 문장·독수리 도안·십자가·종교 표지·글자 없음';
const STEPPE13 = '13세기 초(1206) 몽골 고원 서부 유목 부족 장수 복식 일반화: 오른쪽으로 여미는 긴 델과 넓은 가죽 허리띠, 가죽·쇠 미늘을 끈으로 엮은 찰갑, 펠트·가죽 장화. 일본 갑옷·한국 전립·청대 변발·이슬람 터번 금지. 십자가·종교 표지 없음';
const H = (code, name, used, side, ref, era, culture, desc, verify) => ({ [code]: { name, roster: code, used_in: used, side, ref, kind: 'hist', era, culture, desc, verify } });

export const P_B = {
  ...H('npc_wlodzimierz_krakow', '브워지미에시', ['ch21_s1'], 'enemy', REF_EUR, '13세기 중엽(1241, 생몰 verify)', 'poland(krakow)',
    `40대 중반 지방 장관(보이보다), 길쭉하고 단호한 얼굴, 짧게 다듬은 짙은 갈색 턱수염과 콧수염, 광대 위 옅은 주름, 경계하는 듯한 짙은 갈색 눈. ${EU13}. 코 가리개가 없는 둥근 쇠 투구(정수리가 둥근 단순한 철모, 장식 없음) 아래 쇠사슬 두건, 쇠사슬 갑옷 위 짙은 포도주빛 적갈색 단색 서코트(무늬 없음), 왼쪽 어깨에 걸친 짙은 갈색 양모 반망토(둥근 쇠 브로치 하나, 문양 없음), 넓은 갈색 가죽 칼띠. 오른손에 곧은 양날 장검을 칼끝이 아래로 향하게 몸 옆에 비스듬히 내려 쥠, 왼손은 칼띠를 쥠. 방패·깃발·문장 없음`,
    '헤움니크 전투 크라쿠프 측 지휘관(이름 confirmed, 용모 근거 없음 — 나이·수염 제안값). 크라쿠프 문장 외투는 금지 규칙으로 무지 포도주빛'),
  ...H('npc_mieszko_ii_opole', '미에슈코 2세', ['ch21_s2'], 'enemy', REF_EUR, '13세기(1220경~1246)', 'poland(opole)',
    `20대 초반 젊은 공작(성인), 둥글고 넓은 얼굴과 다부지고 굵은 체격(놀림·희화화 금지, 듬직한 인상), 수염 없이 깎은 턱, 짧은 밝은 갈색 머리가 쇠사슬 두건 가장자리로 조금 보임, 자신감 있고 곧은 회청색 눈. ${EU13}. 투구 없이 쇠사슬 두건을 머리에 쓰고 그 위에 가는 은빛 띠 하나(보석·꼭지 없음), 쇠사슬 갑옷 위 겨자빛 황토색 단색 서코트(무늬 없음), 넓은 짙은 갈색 가죽 칼띠. 오른손에 자루가 긴 외날 전투 도끼를 어깨 높이로 세워 쥠(도끼날은 머리 옆, 프레임 안), 왼손은 허리띠 위. 방패·깃발·문장 없음`,
    '오폴레·라치보르 공작(accepted). 별칭(뚱보공)은 외형 과장 없이 다부진 체격으로만. 용모 근거 없음'),
  ...H('npc_naiman_remnant_chief', '나이만 잔당 우두머리', ['ch18_s1'], 'enemy', REF_MON, '13세기 초(1206, 각색 인물)', 'steppe(naiman)',
    `50세 전후 초원 부족 장수(각색 인물, 실명 없음), 바람에 그을린 넓은 얼굴, 회색이 섞인 짙은 콧수염과 짧은 턱수염, 패배를 인정하지 않는 날카롭고 지친 눈(악역 과장 금지). ${STEPPE13}. 가장자리에 회백색 늑대털 테를 두른 끝이 뾰족한 짙은 갈색 펠트 모자(장식·술 없음), 흑갈색 긴 델(가는 회색 테두리), 그 위 녹슨 쇠 미늘 찰갑 조끼와 어깨 미늘, 낡은 갈색 가죽 허리띠에 칼집째 찬 약간 휜 외날 칼. 오른손에 긴 창을 세워 쥠(창날은 머리 옆, 프레임 안), 왼손은 허리띠 위. 깃발·방패·장식 없음`,
    '실명 비표기 각색 지휘관(stages_ch18_mongol ch18_s1 leader generic). 나이만 복식 근거 약함 — 몽골 고원 유목 복식 일반화(verify)'),
};

const EU13S = '13세기 중엽 중부유럽 기사 복식 일반화(쇠사슬 갑옷·코이프, 무지 단색 서코트. 판금 전신갑·문장·십자가 금지)';
const STEPPE13S = '13세기 초 몽골 고원 유목 장수 복식 일반화(오른쪽 여밈 긴 델, 넓은 허리띠, 끈으로 엮은 미늘 찰갑, 펠트 장화. 일본 갑옷·한국 전립·청대 변발·터번 금지)';
export const S_B = {
  npc_wlodzimierz_krakow: { name: '브워지미에시', side: 'enemy', culture: 'europe', troop: 'heavy', layout: 'sword',
    sprite: `${EU13S}. 40대 중반 장수, 짧은 짙은 갈색 턱수염. 코 가리개 없는 둥근 쇠 투구와 쇠사슬 두건, 쇠사슬 갑옷 위 짙은 포도주빛 적갈색 서코트(무늬 없음), 왼쪽 어깨에 짙은 갈색 반망토, 갈색 칼띠. 오른손에 곧은 장검을 칼끝 아래로 비스듬히 내려 쥠`,
    back: '둥근 투구 뒷면과 쇠사슬 두건, 갈색 반망토가 왼쪽 어깨에서 등으로, 포도주빛 서코트 자락', side: '둥근 투구 옆선, 장검을 칼끝 아래로 몸 앞에, 반망토 자락', forbid: '창, 활, 방패, 문장, 깃발, 말, 원뿔 투구, 녹색 옷', fallback: 'unit.europe.heavy.enemy.64.sheet', verify: '문장 외투 생략(무지 포도주빛). 용모 일반화' },
  npc_mieszko_ii_opole: { name: '미에슈코 2세', side: 'enemy', culture: 'europe', troop: 'heavy', layout: 'sword',
    sprite: `${EU13S}. 20대 초반 다부지고 굵은 체격의 젊은 공작, 수염 없음. 투구 없이 쇠사슬 두건 위 가는 은빛 띠, 쇠사슬 갑옷 위 겨자빛 황토색 서코트(무늬 없음), 짙은 갈색 칼띠. 오른손에 자루 긴 외날 전투 도끼를 세워 쥠`,
    back: '쇠사슬 두건 뒷면과 은빛 띠, 황토색 서코트 등판, 도끼 자루가 몸 옆에 세로로', side: '쇠사슬 두건 옆선, 도끼를 몸 앞에 세워 쥠, 황토색 서코트', forbid: '칼, 창, 활, 방패, 문장, 깃발, 말, 투구, 망토', fallback: 'unit.europe.heavy.enemy.64.sheet', verify: '용모 일반화(체격 과장 금지)' },
  npc_naiman_remnant_chief: { name: '나이만 잔당 우두머리', side: 'enemy', culture: 'mongol', troop: 'cavalry', layout: 'cavalry', mounted: true,
    sprite: `${STEPPE13S}. 짙은 회색 초원 말을 탄 50세 전후 장수(말과 기수가 한 캐릭터, 말 전체가 칸 안에), 회색 섞인 콧수염. 회백 늑대털 테를 두른 뾰족한 짙은 갈색 펠트 모자, 흑갈색 델 위 녹슨 쇠 미늘 찰갑 조끼, 갈색 허리띠에 칼집째 찬 휜 칼. 오른손에 긴 창을 세워 듦(창날은 머리 위, 칸 안). 말: 짙은 회색 몸, 검은 갈기, 갈색 안장 천(무늬 없음)`,
    back: '말 엉덩이와 검은 꼬리, 기수의 늑대털 테 모자 뒷면과 흑갈색 델 등판, 창 자루가 세로로', side: '회색 말이 왼쪽을 향해 걷고 기수는 창을 세워 듦, 뾰족 모자 옆선', forbid: '깃발, 활, 방패, 쇠 투구, 붉은 옷, 터번, 보병(말 없는 모습)', fallback: 'unit.china.cavalry.enemy.64.sheet', verify: '각색 인물. 나이만 복식 일반화(verify)' },
};

// 신규 제작 없이 기존 키로 연결할 인물(데이터 연결은 박백엔/송서사 — stages leader.ref 등)
export const REUSE_MAP = {
  jalal_ad_din: { stage: 'ch18_s6 enemy_squads A leader(display_name_ko "잘랄 앗딘", 현재 kind generic / ref null)', portrait: 'portrait.jalal_ad_din', sheet: 'unit.hero.jalal_ad_din.enemy.64.sheet', note: '영웅 에셋(초상·64 시트) 이미 존재. leader 를 kind npc/hero + ref jalal_ad_din 으로 바꾸면 전용 초상·시트가 붙음' },
};

Object.assign(P_NPC_STORY, P_B);
Object.assign(NPC, S_B);
