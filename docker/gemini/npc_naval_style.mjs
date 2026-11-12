// ===== 수병 전투 시트 + 일본군 지휘관 NPC + 서가11(고려-거란) NPC + 먹물 그림자 — 스타일·작업 정의(안아트 2026-11-01) =====
// 공통 스타일 상수는 style_guide.mjs(단일 출처). 이 파일은 이번 묶음 고유 정의만 둔다(다른 안아트 인스턴스 파일과 충돌 방지용 별도 모듈).
// 규칙: 작품명·작가명·기존 캐릭터명 금지, 스타일 묘사어만. 실존 인물은 사진·초상 기반 얼굴 재현이 아니라 시대 복식 중심 일반화 일러스트
//       (근거 약한 용모 단정 금지, 가문 문장·투구 앞장식(마에다테)·깃발 문양 금지). 종교 상징(십자가·염주·불교 법구 등)·노출 금지.
// 출력: raw = docker/gemini/npc_naval/raw/<id>.jpg, 로그 = docker/gemini/npc_naval/calls_log.jsonl
import { BASE_STYLE, PORTRAIT_RULE, PORTRAIT_NEGATIVE, KEY_BG, PIXEL64_STYLE, BASE_NEGATIVE } from './style_guide.mjs';

export const RAW = 'docker/gemini/npc_naval/raw';
export const OUTP = 'docker/gemini/npc_naval/out/portraits'; // 알파 처리된 초상화(시트 생성 참조용, 반영 전)
const L = { sword: 'docker/gemini/hero_dir_refs/dir64_sword.jpg', mage: 'docker/gemini/hero_dir_refs/dir64_mage.jpg', archer: 'docker/gemini/hero_dir_refs/dir64_archer.jpg' };
const NO_SYMBOL = '가문 문장·투구 앞장식(뿔·초승달·큰 장식판)·깃발·글자·한자·숫자·종교 상징(십자가·염주·불교 법구·만자) 없음, 노출 없음';

// ---- 초상화 공통 프레이밍(영웅 초상화와 동일 규격: 3:4, 896x1200) ----
const PORTRAIT_FRAME =
  '프레이밍: 머리끝(투구 포함)이 프레임 위 가장자리에서 약 6% 아래, 프레임 아래 가장자리는 허리 높이에서 잘림, 얼굴 너비가 프레임 너비의 약 20%, 몸은 약간 3/4 로 틀고 얼굴은 정면에 가깝게. 손에 든 소품은 가슴~얼굴 옆 높이에서 프레임 안에.';
const STYLE_REF_LEAD = '첨부한 참조 이미지에서는 그림체·선 굵기·채색 방식·광원·구도·인물 크기·머리 위 여백만 따른다. 참조 인물의 얼굴·머리·수염·복식·색·소품·나이는 절대 따르지 않고 아래 설명의 새 인물로 그린다.\n';
const HIST_NOTE = '실존 역사 인물을 모티프로 한 게임용 일반화 일러스트: 특정 초상화·사진의 얼굴을 재현하지 않고, 시대 복식과 아래 설명의 나이·인상만으로 그린다. 위엄 있는 군인으로 존중감 있게 묘사(악역 과장·희화화·민족 고정관념 금지). 성인 남성';

// ---- 일본군 지휘관(임진왜란·정유재란 1592~1598). 64px 에서 서로 구분되도록 색 테마·머리 실루엣·소품을 분리 ----
// 실루엣 축: 투구형(todo·hasegawa·shimazu) / 머리띠·상투(wakizaka·kurushima) / 맨머리 상투(konishi·ukita) / 두건(ankokuji)
export const JP = {
  npc_jp_todo_takatora: { name: '도도 다카토라', faction: '일본 수군', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '30대 후반 남성 수군 지휘관, 짧게 다듬은 콧수염과 턱수염, 날카롭고 침착한 눈매. 앞장식 없는 단순한 검은 반구형 철 투구와 목가리개, 검은 옻칠 찰갑 갑옷(가로 비늘판을 짙은 청록색 끈으로 엮음), 짙은 청록색 소매, 소매 없는 짙은 회흑색 겉옷(진바오리, 무늬 없음). 오른손에 흰 종이술이 달린 짧은 지휘봉(사이하이)',
    sprite: '앞장식 없는 검은 반구형 투구, 검은 갑옷과 짙은 청록색 끈·소매, 짙은 회흑 겉옷, 짧은 수염. 오른손에 흰 술 지휘봉', back: '투구 목가리개와 겉옷 등판, 지휘봉 흰 술이 몸 옆으로', side: '지휘봉을 몸 앞으로, 투구 목가리개', forbid: '투구 앞장식, 뿔, 문장, 창, 활, 말', verify: '복식 일반화(특정 투구·문장 재현 안 함)' },
  npc_jp_wakizaka_yasuharu: { name: '와키자카 야스하루', faction: '일본 수군', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '30대 후반 남성 수군 지휘관, 투구 없이 정수리를 민 상투(촌마게)와 흰 천 머리띠(하치마키, 뒤로 짧은 끈), 짧은 턱수염, 굳은 입매. 적갈색(벽돌색) 옻칠 찰갑 흉갑과 검은 소매 가리개, 허리에 회백색 띠. 오른손에 약간 휜 외날 칼(카타나)을 칼끝을 위로 세워 몸 옆에 듦',
    sprite: '흰 머리띠와 상투(투구 없음), 적갈색 갑옷, 검은 소매, 짧은 턱수염. 오른손에 카타나를 세워 듦', back: '상투와 머리띠 끈, 적갈색 갑옷 등판, 칼끝이 어깨 위로', side: '카타나를 몸 앞에 비스듬히, 머리띠 끈', forbid: '투구, 문장, 창, 활, 말', verify: '복식 일반화' },
  npc_jp_hasegawa_hidekazu: { name: '하세가와 히데카즈', faction: '일본군 육군', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '40대 남성 육군 지휘관, 짙은 콧수염과 턱수염, 넓은 얼굴에 무거운 눈썹. 앞장식 없는 낮고 둥근 철 투구(넓게 퍼진 목가리개), 짙은 올리브 녹갈색 끈으로 엮은 찰갑 갑옷, 큰 직사각 어깨판, 갈색 소매. 오른손에 곧은 창(야리)을 세워 듦(창날은 머리 옆)',
    sprite: '낮고 넓은 목가리개 투구, 올리브 녹갈색 갑옷과 큰 어깨판, 짙은 수염. 오른손에 긴 창을 세워 듦', back: '넓게 퍼진 목가리개와 어깨판, 창대가 몸 옆으로 세로로', side: '창을 몸 앞에 세워 쥠, 넓은 목가리개', forbid: '투구 앞장식, 뿔, 문장, 활, 말', verify: '용모·연령 근거 약함(40대는 일반화)' },
  npc_jp_konishi_yukinaga: { name: '고니시 유키나가', faction: '일본군 육군', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '30대 중반 남성 지휘관, 수염 없이 단정한 얼굴, 투구 없이 단정히 묶은 상투, 이지적이고 침착한 눈매. 검은 옻칠 찰갑 갑옷 위에 소매 없는 겨자색(황토빛 금색) 겉옷(진바오리, 무늬 없음), 흰 깃. 오른손에 무늬 없는 검은 칠 지휘 부채(군배, 둥근 판 모양)를 가슴 앞에 듦',
    sprite: '투구 없는 단정한 상투, 수염 없음, 겨자색 소매 없는 겉옷과 검은 갑옷. 오른손에 둥근 검은 지휘 부채', back: '겨자색 겉옷 등판, 상투', side: '둥근 지휘 부채를 몸 앞으로', forbid: '십자가·종교 장식, 투구, 문장, 창, 활, 말', verify: '종교 관련 표현은 의도적으로 배제' },
  npc_jp_shimazu_yoshihiro: { name: '시마즈 요시히로', faction: '일본 수군(구원 함대)', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '60대 초반 노장, 회백색 머리와 회백색 턱수염·콧수염, 깊은 주름과 단단한 눈빛. 앞장식 없는 검은 철 투구(목가리개), 짙은 흑갈색 옻칠 찰갑을 짙은 주황빛 붉은 끈으로 엮은 갑옷, 큰 어깨판. 오른손에 약간 휜 긴 칼(카타나)을 칼끝 아래로 짚고 섬',
    sprite: '앞장식 없는 검은 투구, 회백색 수염, 흑갈색 갑옷과 주황빛 붉은 끈, 큰 어깨판. 오른손에 카타나', back: '투구 목가리개와 어깨판, 붉은 끈 갑옷 등판', side: '카타나를 몸 앞에, 회백 수염', forbid: '투구 앞장식, 뿔, 문장, 창, 활, 말', verify: '연령(1598년 기준 60대) 외 용모는 일반화' },
  npc_jp_kurushima_michifusa: { name: '구루시마 미치후사', faction: '일본 수군', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '30대 중반 남성 수군 장수, 날렵한 얼굴과 짧은 콧수염, 투구 없이 묶은 상투에 짙은 남색 천 머리띠. 가벼운 검은 가죽 흉갑, 소매를 걷은 짙은 회청색 수군 겉옷, 허리에 굵은 밧줄 띠. 오른손에 곧은 창(야리)을 어깨에 비스듬히 기댐(창날은 머리 옆)',
    sprite: '남색 머리띠와 상투, 회청색 소매 걷은 겉옷, 검은 가죽 흉갑, 허리 밧줄. 오른손에 창을 어깨에 비스듬히', back: '상투와 머리띠 끈, 창대가 어깨에서 비스듬히', side: '창을 어깨에 기대 앞으로, 머리띠 끈', forbid: '투구, 문장, 활, 말', verify: '용모 일반화. 전사 장면 표현 안 함' },
  npc_jp_ukita_hideie: { name: '우키타 히데이에', faction: '일본군 육군', layout: 'sword', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '20대 초반 젊은 남성 대장, 수염 없는 앳되지 않은 성인 얼굴, 투구 없이 높게 묶은 상투, 곧은 자세의 당당한 인상. 검은 옻칠 갑옷을 흰 끈으로 엮고 그 위에 소매 없는 짙은 진홍색 겉옷(진바오리, 무늬 없음, 금색 가장자리 한 줄). 오른손에 흰 종이술 지휘봉(사이하이)',
    sprite: '투구 없는 높은 상투, 수염 없음, 진홍색 소매 없는 겉옷과 흰 끈 검은 갑옷. 오른손에 흰 술 지휘봉', back: '진홍색 겉옷 등판, 높은 상투', side: '흰 술 지휘봉을 몸 앞으로', forbid: '투구, 문장, 창, 활, 말, 미성년 얼굴', verify: '총대장 여부 단정 안 함(시나리오 verify)' },
  npc_jp_ankokuji_ekei: { name: '안코쿠지 에케이', faction: '일본군 육군', layout: 'mage', style_ref: 'public/assets/portraits/toyotomi_hideyoshi.png',
    desc: '50대 남성 지휘관(승려 출신의 외교·무장 인물을 일반화), 수염 없음, 머리 전체를 감싼 짙은 회색 천 두건(얼굴만 드러남), 온화하지만 계산적인 눈매. 검은 갑옷 흉갑 위에 무늬 없는 먹색(짙은 회흑) 넓은 소매 겉옷, 짙은 갈색 띠. 오른손에 무늬 없는 검은 칠 지휘 부채(군배, 둥근 판 모양)',
    sprite: '머리를 감싼 짙은 회색 두건, 먹색 넓은 소매 겉옷과 검은 흉갑, 수염 없음. 오른손에 둥근 검은 지휘 부채', back: '회색 두건 뒷자락, 넓은 소매 겉옷 등판', side: '둥근 지휘 부채를 몸 앞으로, 두건 뒷자락', forbid: '염주·가사·불교 법구 등 종교 상징, 투구, 문장, 창, 활, 말', verify: '승려 출신 표현은 두건·먹색 옷으로만(종교 상징 배제)' },
};

// ---- 서가 11(고려-거란, 993·1018~1019) — 초상화만. 외형은 database/data/scenario/shelf_11_npcs.json appearance_for_portrait 기반(배경 묘사는 크로마키 때문에 제외) ----
const GORYEO_STYLE_REF = 'public/assets/portraits/gang_gamchan.png';
export const S11 = {
  npc_dae_dosu: { name: '대도수', side: 'ally', style_ref: GORYEO_STYLE_REF,
    desc: '고려 초기(10세기 말) 중랑장, 40대 후반의 단단한 체구의 남성, 날카로운 눈매와 굳게 다문 입(말수 적은 인상), 짧은 턱수염. 짙은 청회색 찰갑 갑옷(작은 철판을 엮음)과 낡은 적색 어깨끈, 둥근 철 투구. 오른손으로 긴 창을 세워 짚음(창날은 얼굴 옆)', verify: '고려 갑옷 형태 고증 확인 필요' },
  npc_yu_bang: { name: '유방', side: 'ally', style_ref: GORYEO_STYLE_REF,
    desc: '고려 초기(10세기 말) 낭장, 30대 중반의 마른 체형 남성, 재빠르고 경쾌한 인상, 약간 들뜬 듯 올라간 입꼬리, 짧은 콧수염. 투구 없이 머리를 묶은 검은 천 두건, 회갈색 전포(긴 군복 겉옷) 위 가죽 흉갑, 어깨 뒤로 가죽 활통의 화살 깃. 왼손에 짧은 활을 세로로 듦', verify: '궁병 배정은 게임 각색' },
  npc_gang_min_cheom: { name: '강민첨', side: 'ally', style_ref: GORYEO_STYLE_REF,
    desc: '고려 현종 대(11세기 초) 장수, 50대 남성, 넓은 어깨, 짧게 다듬은 회색 섞인 턱수염, 침착하지만 피곤한 눈. 남색 찰갑 갑옷과 남색 전포, 꼭대기에 짧은 깃털 장식이 달린 둥근 철 투구. 한 손을 허리의 칼자루에 얹음', verify: '직함·세부 행적 verify, 갑옷 고증' },
  npc_kim_jong_hyeon: { name: '김종현', side: 'ally', style_ref: GORYEO_STYLE_REF,
    desc: '고려 현종 대(11세기 초) 무장, 40대 남성, 단정한 얼굴에 짙은 눈썹, 짧은 콧수염, 바람을 맞으며 먼 곳을 보는 시선(머리카락과 옷자락이 조금 날림). 투구 없이 상투에 검은 천 두건, 짙은 녹색 전포와 갈색 가죽 갑옷, 어깨 뒤로 큰 활(강궁)의 활대가 보임', verify: '직함 verify, 전승은 사실로 쓰지 않음' },
  npc_nameless_scribe: { name: '무명 기록관', side: 'ally', invented: true, style_ref: GORYEO_STYLE_REF,
    desc: '허구 인물. 나이를 가늠하기 어려운 중성적인 성인, 맑은 눈과 조용한 표정, 어깨 길이 검은 머리를 낮게 묶음. 어느 나라 것인지 단정할 수 없는 소박한 미색 긴 겉옷(두루마기형)에 먹물 얼룩이 번져 있고, 왼쪽 소매 끝이 먹빛으로 흐려져 녹아드는 듯함. 허리에 작은 나무 필통, 손에 붓 한 자루. 글자 없는 빈 종이', verify: null },
  npc_so_sonnyeong: { name: '소손녕', side: 'enemy', style_ref: GORYEO_STYLE_REF,
    desc: '거란(요) 지휘관, 40대 남성, 위엄 있고 계산적인 눈, 짧은 콧수염. 짙은 갈색 모피 깃 장식이 달린 두꺼운 찰갑 갑옷, 짙은 홍색 허리띠, 땋은 머리 한 갈래를 한쪽 어깨 앞으로 늘어뜨림, 투구 없음. 악인이 아닌 노련한 장수의 품위', verify: '거란 머리 모양(곤발) 고증 verify — 설명대로 땋은 머리로 일반화' },
  npc_so_baeap: { name: '소배압', side: 'enemy', style_ref: GORYEO_STYLE_REF,
    desc: '거란(요) 총사령, 50대 후반 노련한 남성 군인, 은회색이 섞인 턱수염과 콧수염, 피로하지만 위엄 있는 얼굴, 먼 곳(강 건너)을 응시. 꼭대기가 뾰족한 철제 투구(목 뒤 가죽 드림), 어깨에 두른 짙은 갈색 모피 망토, 철 찰갑', verify: '연령·용모 verify' },
  npc_khitan_vanguard: { name: '거란 선봉 기병대장', side: 'enemy', invented: true, style_ref: GORYEO_STYLE_REF,
    desc: '허구 무명 지휘관. 30대 남성 기병, 양쪽 머리를 땋아 늘어뜨리고 이마에 붉은 끈, 짧은 수염, 날렵한 인상. 가죽 찰갑과 짧은 모피 깃, 오른손에 짧은 곡도, 왼팔에 작은 둥근 가죽 방패, 어깨 너머로 작은 방울을 매단 말갈기 일부가 보임', verify: null },
  npc_khitan_archer_captain: { name: '거란 궁병대 지휘관', side: 'enemy', invented: true, style_ref: GORYEO_STYLE_REF,
    desc: '허구 무명 지휘관. 40대 남성, 바람에 그을린 얼굴(뺨에 바람 자국), 신중한 눈매, 짧은 턱수염. 모피 테두리 가죽 모자와 무릎까지 오는 긴 갈색 외투, 가죽 띠. 왼손에 양 끝이 뒤로 휜 복합궁을 세로로 듦', verify: null },
  npc_khitan_rearguard: { name: '거란 후위 지휘관', side: 'enemy', invented: true, style_ref: GORYEO_STYLE_REF,
    desc: '허구 무명 지휘관. 50대 노병, 둥근 철 투구 아래로 회색 머리카락이 보임, 회색 수염, 침착하고 끈질긴 표정. 낡은 철 찰갑, 왼팔에 두꺼운 나무 방패, 오른손에 깃발 대신 무늬 없는 가죽 천을 맨 창', verify: null },
};

// ---- 먹물 그림자(허구, 사람 형상 없음) ----
export const INK = {
  npc_ink_shadow_s8: { name: '번진 기록의 그림자',
    desc: '사람·동물·얼굴 형상이 전혀 없는 먹물 덩어리. 진한 검정~짙은 남색 먹물이 둥글게 뭉친 덩어리에서 가장자리로 굵은 먹물 방울과 흘러내림이 뻗고, 덩어리 주위에 찢어진 빈 종이 조각(글자 없는 미색 종잇조각) 몇 장이 떠 있으며 그 가장자리가 먹물에 젖어 번짐. 덩어리 안쪽에 옅은 청록색 희미한 빛이 한두 줄 스며 있음. 눈·입·손 없음',
    sprite: '눈·얼굴·팔다리 없는 둥근 검정~짙은 남색 먹물 덩어리, 아래로 먹물 방울이 흘러내리고 주위에 작은 빈 종잇조각 2~3장, 안쪽에 옅은 청록 빛 한 줄' },
  npc_ink_shadow_final: { name: '마지막 그림자',
    desc: '사람·동물·얼굴 형상이 전혀 없는 크고 무거운 먹물 소용돌이 덩어리. 칠흑 같은 먹물이 천천히 감기는 소용돌이를 이루고, 가장자리에서 먹물 줄기들이 접힌 두루마리 띠처럼 휘감김. 주위에 찢어진 빈 종잇조각(글자 없음)이 여러 장 소용돌이를 따라 돌고, 소용돌이 중심은 희미한 금빛으로 비어 있음(작은 빈 공간). 눈·입·손 없음. s8 그림자보다 크고 위압적',
    sprite: '눈·얼굴·팔다리 없는 칠흑 먹물 소용돌이 덩어리(가장자리 먹물 띠가 휘감김), 중심에 희미한 금빛 빈 공간, 주위에 작은 빈 종잇조각 3~4장' },
};

// ---- 수병 전투 시트(문화권별 3종). 참조 = 같은 문화권 수병 일반 초상화(portrait.troop.<culture>.naval) ----
export const NAVAL = {
  naval_japan: { culture: 'japan', portrait: 'public/assets/portraits/troops/japan_naval.png',
    desc: '일본 센고쿠 시대 아시가루 수군(노꾼 겸 전투원), 30대 남성, 그을린 피부, 짧은 수염. 정수리를 민 머리에 흰 천 머리띠(하치마키, 뒤로 끈이 짧게 늘어짐), 검은 옻칠 흉갑(도마루) 아래 소매를 걷은 남색 상의, 허리에 연청색 천 띠, 짙은 남색 짧은 바지와 짚신, 한쪽 어깨에서 반대쪽 허리로 감은 굵은 밧줄. 오른손에 끝에 갈고리가 달린 창(구창)을 어깨에 비스듬히 기대고 창끝은 머리 옆 위쪽',
    back: '흰 머리띠 매듭과 끈, 흉갑 등판과 밧줄, 갈고리 창이 어깨 위로 비스듬히', side: '갈고리 창을 어깨에서 앞으로 비스듬히, 흰 머리띠 끈', forbid: '투구, 진가사(삿갓), 문장, 활, 말, 칼', verify: '아시가루 수군 복식 일반화' },
  naval_korea: { culture: 'korea', portrait: 'public/assets/portraits/troops/korea_naval.png',
    desc: '조선 중기 수군(노꾼 겸 전투원), 30대 남성, 그을린 피부, 짧은 수염. 둥글고 챙이 넓은 검은 전립(꼭대기에 작은 붉은 술), 남색 철릭 소매를 걷어 올리고 그 위에 징이 박힌 짙은 갈색 가죽 두정갑 조끼, 흰 깃, 짙은 바지와 짚신, 한쪽 어깨에 감은 굵은 밧줄. 오른손에 끝에 갈고리가 달린 창(구창)을 어깨에 비스듬히 기대고 창끝은 머리 옆 위쪽',
    back: '전립의 넓은 챙과 붉은 술, 조끼 등판과 밧줄, 갈고리 창이 어깨 위로 비스듬히', side: '전립 챙 옆선, 갈고리 창을 어깨에서 앞으로 비스듬히', forbid: '일본식 갑옷·머리띠, 문장, 활, 말, 칼', verify: '조선 수군 복식(전립·두정갑) 일반화' },
  naval_default: { culture: 'default', portrait: 'public/assets/portraits/troops/default_naval.png',
    desc: '판타지 왕국 수병, 30대 남성, 그을린 피부, 짧은 수염. 파란 천 두건(반다나, 뒤로 매듭 끈), 소매를 걷은 흰 셔츠 위 파란 가죽 조끼, 갈색 허리띠, 짙은 바지와 갈색 장화, 한쪽 어깨에 감은 굵은 밧줄. 오른손에 짧고 약간 휜 선상용 검(커틀러스)을 얼굴 옆에 비스듬히 세워 쥠',
    back: '파란 두건 매듭과 끈, 조끼 등판과 밧줄, 검 끝이 어깨 위로', side: '검을 몸 앞에 비스듬히 세움, 두건 끈', forbid: '해적 해골·안대, 투구, 문장, 창, 활, 말', verify: null },
};

const SHEET_RULE3 =
  '정확히 3열x3행(9칸) 균등 격자, 한 칸에 캐릭터 1프레임(전신, 발까지), 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분(닿지 않음). ' +
  '행 순서(위→아래): 1행 정면(아래를 향함), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(프로필: 얼굴 옆선·코끝·눈 1개만, 몸통·발끝·얼굴 모두 왼쪽. 3/4 각도·정면·오른쪽을 보는 칸 절대 금지), 3행 뒷모습(위를 향함, 얼굴 안 보임, 머리·모자 형태는 정면과 동일). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 다르고 몸통·머리·소품 위치는 거의 동일. ' +
  '9칸 모두 같은 캐릭터·같은 크기: 머리끝~발끝이 칸 높이의 85%로 크게, 같은 발 기준선, 칸 가로 중앙 정렬, 무기·소품은 칸 밖으로 나가지 않게 몸 가까이. ' +
  '무기·소지품 일관성: 9칸 모두 같은 무기·소지품을 같은 손에, 같은 길이·같은 각도로 든다. 정면 행에도 반드시 보인다(몸 뒤로 숨기지 않음). 무기 개수는 칸마다 같음, 복제 금지.';
const SHEET_LEAD = '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·모자·옷·무기·성별·나이는 절대 따르지 않는다.\n';

function portraitJob(code, h, kind) {
  const isInk = kind === 'ink';
  const refs = isInk ? [] : [h.style_ref];
  const who = isInk ? '' : (h.invented ? '게임 오리지널 허구 인물(실존 인물 아님). 존중감 있게 묘사, 희화화·민족 고정관념 금지. 성인' : HIST_NOTE);
  const prompt = isInk
    ? `판타지 SRPG 의 대화 초상 칸에 들어갈 '번진 기록의 그림자' 일러스트(${h.name}). ${h.desc}.\n` +
      '구도: 세로 3:4, 덩어리가 프레임 중앙에서 프레임 높이의 75% 정도, 사방에 여백(가장자리에 닿지 않음). 먹물은 셀 셰이딩 애니메이션풍으로 또렷한 외곽선과 2~3단 명암(번지는 수채화 질감 대신 선명한 형태), 광택 하이라이트 약간, 광원 왼쪽 위.\n' +
      `${KEY_BG}\n금지: 사람·얼굴·눈·입·손·해골·동물 형상, 글자·문자·숫자·부적 문양, 피, ${BASE_NEGATIVE.replace('수채화 번짐·거친 붓 질감 금지, ', '')}`
    : `${STYLE_REF_LEAD}${who}. 인물(${h.name}${h.faction ? `, ${h.faction}` : ''}): ${h.desc}.\n표정: 평온하고 진지한 중립 표정, 입은 다문 상태.\n${NO_SYMBOL}.\n` +
      `스타일: ${BASE_STYLE}\n구도: ${PORTRAIT_RULE}. ${PORTRAIT_FRAME}\n${KEY_BG}\n금지: ${PORTRAIT_NEGATIVE}, 의상에 마젠타·분홍·보라 금지`;
  return { id: `portrait_${code}`, kind: 'portrait', aspect: '3:4', refs, prompt };
}

function npcSheetJob(code, h) {
  const prompt = SHEET_LEAD +
    `두 번째 참조 이미지는 이 인물(${h.name})의 정식 초상화다. 얼굴 나이감·수염·머리 모양·머리 장비·복식 구성과 색·소지품을 초상화와 똑같이 맞춘다(그림체·상반신 구도는 따르지 않고 결과는 전신 도트 스프라이트).\n` +
    `외형: ${h.sprite}.\n방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}. 작은 크기에서도 머리 장비 실루엣·옷 색·소지품이 식별되게 큰 색면으로 또렷하게. ${NO_SYMBOL}.\n` +
    `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { id: code, kind: 'sheet', aspect: '1:1', refs: [L[h.layout], `${OUTP}/${code}.png`], prompt };
}

function inkSheetJob(code, h) {
  const prompt = SHEET_LEAD.replace('견본 인물의 얼굴·머리·모자·옷·무기·성별·나이는 절대 따르지 않는다.', '견본은 사람이지만 결과는 사람이 아니다. 견본의 형태·옷·얼굴은 절대 따르지 않는다.') +
    `두 번째 참조 이미지는 이 존재(${h.name})의 정식 일러스트다. 색·형태·종잇조각·빛을 일러스트와 맞춘 도트 스프라이트로 그린다.\n` +
    `외형: ${h.sprite}. 사람·얼굴·눈·팔다리 형상 절대 없음.\n` +
    '시트 규칙: 정확히 3열x3행(9칸) 균등 격자, 한 칸에 덩어리 1프레임, 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분. 9칸 모두 같은 덩어리·같은 크기(칸 높이의 75%, 칸 아래쪽에 같은 기준선으로 떠 있음, 가로 중앙). ' +
    '행마다 아주 조금씩 다른 꿈틀거림: 1행(정면) 3칸은 먹물 방울 위치만 조금씩 다름, 2행(왼쪽으로 기울어 흐르는 모습) 3칸은 덩어리가 살짝 왼쪽으로 쏠리고 먹물 꼬리가 오른쪽으로 끌림, 3행(뒷면) 3칸은 빛이 보이지 않는 어두운 뒷면. 종잇조각 개수는 칸마다 같음.\n' +
    `스타일: ${PIXEL64_STYLE}\n마젠타·분홍·자주 금지.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { id: code, kind: 'sheet', aspect: '1:1', refs: [L.mage, `${OUTP}/${code}.png`], prompt };
}

function navalSheetJob(code, h) {
  const prompt = SHEET_LEAD +
    `두 번째 참조 이미지는 이 병종(${h.culture} 수병)의 일반 병사 초상화다. 머리 장비·복식 구성과 색·무기·나이감을 초상화와 맞춘다(결과는 전신 도트 스프라이트, 이름 없는 일반 병사).\n` +
    `외형: ${h.desc}.\n방향 디테일: 뒷모습: ${h.back}. 측면: ${h.side}.\n` +
    '가독성: 이 스프라이트는 배 위에 서서 하반신이 뱃전에 가려지므로, 머리 장비 실루엣·상체 색(흉갑/조끼)·밧줄·무기 끝이 칸의 위쪽 절반에서 또렷하게 보여야 한다. 무기 끝은 머리 높이 근처에 두고, 상체는 큰 색면으로.\n' +
    `${NO_SYMBOL}.\n시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${h.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { id: code, kind: 'sheet', aspect: '1:1', refs: [L.sword, h.portrait], prompt };
}

export function allJobs() {
  const j = {}; const add = (x) => { j[x.id] = x; };
  for (const [c, h] of Object.entries(NAVAL)) add(navalSheetJob(c, h));
  for (const [c, h] of Object.entries(JP)) { add(portraitJob(c, h, 'jp')); add(npcSheetJob(c, h)); }
  for (const [c, h] of Object.entries(INK)) { add(portraitJob(c, h, 'ink')); add(inkSheetJob(c, h)); }
  for (const [c, h] of Object.entries(S11)) add(portraitJob(c, h, 's11'));
  return j;
}

export const QA = {
  portrait: ['896x1200, 3:4 상반신, 영웅 초상화와 같은 그림체·프레이밍', '알파 가장자리 마젠타 잔여 0~소수 px', '가문 문장·투구 앞장식·글자·종교 상징 없음, 노출 없음', '나이·색 테마가 설명과 일치, 서로 구분됨', '먹물 그림자: 사람·얼굴 형상 없음'],
  sheet: ['192x256(3x4, 64px), 1px 외곽선, 32색 이하', '초상화와 머리 장비·색·소지품 일치', '9칸 무기 일관·누락 없음', '측면 행 좌향 프로필', '알파 0/255, 마젠타 잔여 없음', '64px 1배에서 머리 실루엣·상체 색 식별(수병은 배 오버레이 위 상체 가독성)'],
};
