// ===== 주인공(서고 소환자) 에셋 스타일·작업 정의 =====
// 공통 스타일 상수는 style_guide.mjs(단일 출처)에서 가져오고, 주인공 고유 정의(얼굴 6종·기본 복장·클래스 장비·표정·구도)만 여기 둔다.
// (style_guide.mjs 는 다른 안아트 인스턴스가 영웅 작업 중이라 충돌 방지를 위해 별도 모듈. 설계 설명: docker/gemini/protagonist_design.md)
// 규칙: 작품명·작가명·기존 캐릭터명 금지, 스타일 묘사어만. 외견은 모두 20대 초중반 성인.
import { BASE_STYLE, PORTRAIT_RULE, PORTRAIT_NEGATIVE, KEY_BG, PIXEL64_STYLE, BASE_NEGATIVE } from './style_guide.mjs';

export const RAW = 'docker/gemini/protagonist_raw';

// 6종 얼굴 정체성(선택지별로 한눈에 다른 머리 실루엣·머리색·피부톤·눈색·분위기). 머리색에 은청색(시오리 전용)·분홍·보라 금지
export const FACES = {
  male_a: { label: '남 A — 정통파', desc: '20대 초반 성인 남성, 밝은 피부, 짧고 약간 흐트러진 검은 머리(앞머리가 이마를 살짝 덮음), 짙은 갈색 눈, 곧은 눈썹, 성실하고 곧은 인상', sprite: '짧은 검은 머리, 밝은 피부' },
  male_b: { label: '남 B — 냉철파', desc: '20대 중반 성인 남성, 흰 피부, 뒤로 넘긴 재색 금발(애시 블론드) 중단발을 목덜미에서 짧게 묶음, 날카로운 회청색 눈, 가는 눈매, 차분하고 냉철한 인상', sprite: '뒤로 넘겨 짧게 묶은 애시 블론드 머리, 흰 피부' },
  male_c: { label: '남 C — 호쾌파', desc: '20대 초반 성인 남성, 짙은 갈색 피부, 옆을 짧게 친 검은 곱슬머리(윗부분 볼륨), 따뜻한 황갈색 눈, 굵은 눈썹, 듬직하고 쾌활한 인상, 다른 둘보다 어깨가 넓은 체격', sprite: '윗부분이 풍성한 짧은 검은 곱슬머리, 짙은 갈색 피부, 넓은 어깨' },
  female_a: { label: '여 A — 활발파', desc: '20대 초반 성인 여성, 밝은 피부, 턱선 길이 밝은 헤이즐넛 갈색(노란기 도는 밝은 갈색, 붉은기 없음) 단발(끝이 바깥으로 살짝 뻗침), 초록 눈, 크고 또렷한 눈, 밝고 활기찬 인상', sprite: '턱선 길이 밝은 헤이즐넛 갈색 단발, 밝은 피부' },
  female_b: { label: '여 B — 단아파', desc: '20대 중반 성인 여성, 흰 피부, 허리까지 오는 곧은 칠흑색 검은 머리(갈색기 없는 순흑발)에 오른쪽 귀 옆으로 가는 땋은 머리 한 가닥, 짙은 적갈색 눈, 길고 차분한 눈매, 단아하고 침착한 인상', sprite: '허리까지 오는 곧은 흑발, 흰 피부' },
  female_c: { label: '여 C — 당찬파', desc: '20대 초반 성인 여성, 그을린 밝은 갈색 피부와 콧등의 옅은 주근깨, 구릿빛 적동색 머리를 높게 묶은 긴 포니테일, 청록 눈, 자신감 있는 눈매, 당차고 씩씩한 인상', sprite: '높게 묶은 구릿빛 적동색 긴 포니테일, 그을린 피부' },
};
export const FACE_IDS = Object.keys(FACES);

// 공통 기본 복장: 현대/중립 복식(셔츠·바지) 위에 '서가 기록 공명 장비'(제본 금박 테두리 코트·책갈피 리본·서표 팔찌·고서 가방)가 겹친 서고 소환자 제복. 6종 동일
export const BASE_OUTFIT =
  '복장(6종 공통 서고 소환자 제복): 현대식 흰 셔츠 깃(단추 하나 풀어 단정하게)과 짙은 회색 바지 위에, 허벅지 중간 길이의 짙은 남색(네이비) 하프 코트. ' +
  '코트 깃·소매 끝·앞섶 가장자리에는 고서 표지 모서리처럼 각진 금색 제본 장식 테두리. 왼쪽 어깨에서 가슴으로 늘어진 크림색 책갈피 리본 한 줄(끝은 V자 컷). ' +
  '왼손 손목에 은은한 청록색 빛을 내는 둥근 서표 팔찌(문양 없는 원판). 허리에 갈색 가죽 벨트와 놋쇠 걸쇠가 달린 작은 고서 가방. 갈색 가죽 짧은 부츠. ' +
  '글자·문자·숫자 장식 없음, 노출 없음';
export const BASE_OUTFIT_SPRITE =
  '짙은 남색 하프 코트(금색 테두리), 흰 셔츠 깃, 짙은 회색 바지, 왼쪽 어깨에서 늘어진 크림색 리본, 왼손목 청록색 빛 팔찌, 허리 갈색 벨트와 작은 가방, 갈색 부츠';

// 여성 3종 공통 체형·복장 보정(1차: 남성 참조를 따라 어깨가 넓고 중성적으로 나옴 → 여성 앵커(female_b)를 텍스트로 먼저 만들고 a/c 는 female_b 참조)
export const FEMALE_BUILD = '성인 여성 체형: 좁은 어깨와 가는 목, 부드러운 턱선과 갸름한 얼굴선, 긴 속눈썹, 자연스러운 성인 여성의 상체(강조·노출 없음)';
export const FEMALE_OUTFIT = '여성용 재단: 코트는 허리선이 살짝 들어간 재단(디자인·색은 동일)';

// 표정(4종 우선). 자세·구도·의상은 neutral 과 동일
export const EXPR = {
  neutral: '표정: 평온하고 차분한 중립 표정, 입은 다문 상태, 정면을 바라봄',
  smile: '표정: 눈을 살짝 가늘게 뜨고 입꼬리를 올린 따뜻한 미소(치아는 조금만)',
  determined: '표정: 눈썹을 모으고 눈빛이 날카로운 결연한 표정, 입을 굳게 다묾, 턱을 약간 당김',
  hurt: '표정: 한쪽 눈을 찡그리고 이를 악문 고통스러운 표정, 이마에 땀 한 방울, 뺨에 작은 생채기 하나(피는 아주 조금), 머리카락이 약간 흐트러짐',
};
export const EXPR_IDS = Object.keys(EXPR);

// 클래스 5종 장비(기본 복장 위에 덧붙임 — 얼굴·머리는 절대 가리지 않음: 투구 금지)
export const CLASSES = {
  sword: { layout: 'sword', label: '검', gear: '기본 복장 위에 은색 가슴판 한 장(금색 테두리)과 왼팔 작은 원형 은색 방패(버클러), 오른손에 곧은 한손 직검(칼날 가장자리가 옅은 청록색으로 빛남)', back: '코트 등판, 허리 뒤 칼집, 왼팔 버클러 가장자리', side: '오른손 직검을 몸 앞으로 비스듬히, 왼팔 버클러', forbid: '투구, 창, 활, 큰 방패, 말' },
  spear: { layout: 'sword', label: '창', gear: '기본 복장 위에 갈색 가죽 어깨 보호대와 가죽 팔 보호대, 두 손으로 자기 키보다 긴 창을 세워 듦(은색 창날 아래 크림색 리본 술 장식, 창대는 짙은 나무)', back: '코트 등판, 창대가 몸 옆으로 세로로 길게', side: '긴 창을 몸 앞에 비스듬히 세움', forbid: '투구, 검, 활, 방패, 말' },
  archer: { layout: 'archer', label: '궁', gear: '기본 복장 위에 짧은 남색 어깨 망토(후드는 뒤로 넘겨 머리가 보임), 왼손에 금색 장식이 달린 나무 장궁, 등에 갈색 가죽 화살통(흰 깃 화살), 오른손 가죽 사수 장갑', back: '등의 화살통과 넘긴 후드, 짧은 망토', side: '장궁을 몸 앞에 세워 듦, 등 화살통', forbid: '투구, 검, 창, 방패, 말, 후드를 머리에 씀' },
  cavalry: { layout: 'cavalry', label: '기병', mounted: true, gear: '갈색 말에 탄 모습(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). 말은 남색 천 마갑(금색 테두리)과 갈색 안장. 기수는 기본 복장 그대로에 오른손 기병 창(랜스, 은색 끝)', back: '말 엉덩이와 꼬리, 기수 코트 등판과 랜스', side: '말의 완전한 옆모습, 랜스를 앞으로', forbid: '투구, 활, 큰 방패, 말에 분홍·보라' },
  heavy: { layout: 'sword', label: '중장갑', gear: '기본 복장 코트 위에 두꺼운 은회색 판금 어깨갑·흉갑·팔갑(금색 테두리, 코트 자락은 갑옷 아래로 보임), 왼손 탑 모양 대형 은색 방패(가운데 청록색 원판 장식), 오른손 메이스. 투구 없음, 얼굴과 머리 모양이 그대로 보임', back: '판금 등판과 어깨갑, 대형 방패 가장자리', side: '대형 방패를 몸 앞에, 메이스를 몸 옆에', forbid: '투구, 얼굴 가리개, 창, 활, 말' },
};
export const CLASS_IDS = Object.keys(CLASSES);

const LAYOUTS = { sword: 'docker/gemini/hero_dir_refs/dir64_sword.jpg', archer: 'docker/gemini/hero_dir_refs/dir64_archer.jpg', cavalry: 'docker/gemini/hero_dir_refs/dir64_cavalry.jpg' };
const BASE_SAFE = '오리지널 가상 캐릭터(이세계 서고에 소환된 현대인). 미성년처럼 보이는 어린 얼굴·체형 금지, 체형 강조·밀착 의상 금지';

// 기존 영웅·시오리 초상화와 같은 프레이밍(1차 male_a 는 허벅지까지 나와 머리가 작았음 → 보정)
export const PORTRAIT_FRAME =
  '프레이밍: 머리끝이 프레임 위 가장자리에서 약 6% 아래, 프레임 아래 가장자리는 허리~골반 높이에서 잘림(다리·허벅지는 보이지 않음), 얼굴 너비가 프레임 너비의 약 20%, 몸은 약간 3/4 로 틀고 얼굴은 정면에 가깝게. ' +
  '눈은 하이라이트가 또렷한 애니메이션식 눈, 선화는 또렷하고 의상 주름과 금색 장식은 정교하게';

// ---- 초상화(3:4 반신, 크로마키) ----
// 일관성 전략: (1) male_a.neutral 은 텍스트만 (2) 나머지 5종 neutral 은 male_a.neutral raw 를 '복장·그림체·구도 기준'으로만 참조(얼굴은 텍스트)
//              (3) 표정 3종은 자기 neutral raw 를 참조해 '표정만' 변경
export function portraitJob(face, expr) {
  const f = FACES[face]; const id = `portrait_${face}_${expr}`;
  const refs = []; let lead = '';
  if (expr !== 'neutral') { refs.push(`${RAW}/portrait_${face}_neutral.jpg`); lead = '첨부한 참조 이미지의 인물과 완전히 같은 얼굴·머리 모양·머리 색·눈 색·피부색·의상·소품·그림체·구도·크기·자세를 유지하고 표정만 바꾼다.\n'; }
  else if (face !== 'male_a' && face !== 'female_b') { refs.push(`${RAW}/portrait_${face.startsWith('female') ? 'female_b' : 'male_a'}_neutral.jpg`); lead = '첨부한 참조 이미지에서는 의상(코트·리본·팔찌·셔츠의 형태와 색)·그림체·선 굵기·채색·구도·인물 크기·머리 위 여백만 따른다. 참조 인물의 얼굴·머리 모양·머리 색·눈 색·피부색·성별·체격은 절대 따르지 않고 아래 설명의 새 인물로 그린다.\n'; }
  return { id, kind: 'portrait', aspect: '3:4', refs,
    prompt: `${lead}${BASE_SAFE}. 인물: ${f.desc}.\n${BASE_OUTFIT}.\n${EXPR[expr]}\n스타일: ${BASE_STYLE}\n구도: ${PORTRAIT_RULE}. ${PORTRAIT_FRAME}\n${KEY_BG}\n금지: ${PORTRAIT_NEGATIVE}, 머리색에 은청색·분홍·보라 금지` };
}

// ---- 캐릭터 생성 화면용 전신 일러스트(9:16, 크로마키) — neutral 초상화 raw 참조 ----
export function fullbodyJob(face) {
  const f = FACES[face];
  return { id: `fullbody_${face}`, kind: 'fullbody', aspect: '9:16', refs: [`${RAW}/portrait_${face}_neutral.jpg`],
    prompt: '첨부한 참조 이미지(상반신 초상화)의 인물과 완전히 같은 얼굴·머리 모양·머리 색·눈 색·피부색·의상·색·그림체로, 머리끝부터 발끝까지 전신이 모두 보이는 서 있는 일러스트를 그린다.\n' +
      `${BASE_SAFE}. 인물: ${f.desc}.\n${BASE_OUTFIT}.\n자세: 정면~약간 3/4, 자연스럽게 선 자세, 한 손은 허리의 고서 가방 근처, 다른 손은 몸 옆. 표정: 차분하고 자신감 있는 미소.\n` +
      `구도: 세로 9:16, 전신이 프레임 높이의 88%, 중앙 배치, 머리 위와 발 아래에 약간의 여백, 발끝이 잘리지 않게.\n스타일: ${BASE_STYLE}\n${KEY_BG}\n금지: ${BASE_NEGATIVE}, 여러 명 금지, 과도한 노출 금지, 무기 금지` };
}

// ---- 전투 방향 시트(1:1, 3x3, 크로마키) — hero_v4_gen.mjs 와 같은 시트 규칙 ----
export const SHEET_RULE3 =
  '정확히 3열x3행(9칸) 균등 격자, 한 칸에 캐릭터 1프레임(전신, 발까지), 격자선·칸 테두리·글자 없음, 칸 사이 여백 충분(닿지 않음). ' +
  '행 순서(위→아래): 1행 정면(아래를 향함), 2행 세 칸 모두 화면 왼쪽을 향한 완전한 옆모습(프로필: 얼굴 옆선·코끝·눈 1개만, 몸통·발끝·얼굴 모두 왼쪽. 3/4 각도·정면·오른쪽을 보는 칸 절대 금지), 3행 뒷모습(위를 향함, 얼굴 안 보임, 머리 모양은 정면과 동일). ' +
  '열 순서: 왼발 내딛음(walk1), 서 있음(idle), 오른발 내딛음(walk2) — 걷기 프레임은 다리·팔 끝만 조금 다르고 몸통·머리·소품 위치는 거의 동일. ' +
  '9칸 모두 같은 캐릭터·같은 크기: 머리끝~발끝이 칸 높이의 85%로 크게, 같은 발 기준선, 칸 가로 중앙 정렬, 무기·소품은 칸 밖으로 나가지 않게 몸 가까이. ' +
  '무기·소지품 일관성: 9칸 모두 같은 무기·소지품을 같은 손에, 같은 길이·같은 각도로 든다. 정면 행에도 반드시 보인다(몸 뒤로 숨기지 않음). 무기 개수는 칸마다 같음, 복제 금지.';

// cls = 'base' | CLASS_IDS
export function sheetJob(face, cls) {
  const f = FACES[face]; const isBase = cls === 'base'; const c = isBase ? null : CLASSES[cls];
  const refs = [LAYOUTS[isBase ? 'sword' : c.layout], `public/assets/portraits/protagonist/protagonist_${face}_neutral.png`];
  if (!isBase) refs.push(`${RAW}/sheet_${face}_base.jpg`);
  const look = `${f.sprite}. 기본 복장: ${BASE_OUTFIT_SPRITE}`;
  const prompt =
    '첫 번째 참조 이미지는 3x3 방향 걷기 도트 시트 견본이다. 견본에서는 칸 배치·도트 1개의 크기·2.5등신 비율·외곽선 두께만 따른다. 견본 인물의 얼굴·머리·옷·무기·성별은 절대 따르지 않는다.\n' +
    `두 번째 참조 이미지는 이 캐릭터의 정식 초상화다. 얼굴 특징·머리색·머리 모양·피부색·체격·복식 구성과 색을 초상화와 똑같이 맞춘다(결과는 전신 도트 스프라이트).\n` +
    (isBase ? '' : '세 번째 참조 이미지는 같은 캐릭터의 기본 복장 도트 시트다. 머리 모양·머리색·피부색·코트 색·도트 크기·등신·칸 배치를 이 시트와 완전히 같게 유지하고, 아래 클래스 장비만 덧붙인다.\n') +
    `${c?.mounted ? '말에 탄 기마 인물(말과 기수를 한 캐릭터로, 말 전체가 칸 안에). ' : ''}외형: ${look}.\n` +
    (isBase ? '소지품: 왼손에 갈색 가죽 장정 고서 한 권을 든다(무기 없음).\n방향 디테일: 뒷모습: 남색 코트 등판, 머리 뒷모습. 측면: 코트 자락과 리본, 고서.\n'
      : `클래스(${c.label}) 장비: ${c.gear}.\n방향 디테일: 뒷모습: ${c.back}. 측면: ${c.side}.\n`) +
    `작은 크기에서도 머리 모양·머리색·피부색·코트 색이 식별되게 큰 색면으로 또렷하게. 얼굴과 머리는 절대 가리지 않는다.\n` +
    `시트 규칙: ${SHEET_RULE3}\n스타일: ${PIXEL64_STYLE}\n의상에 마젠타·분홍·자주 금지. 금지: ${isBase ? '투구, 무기, 망토' : c.forbid}.\n${KEY_BG}\n금지: ${BASE_NEGATIVE}`;
  return { id: `sheet_${face}_${cls}`, kind: 'sheet', aspect: '1:1', refs, prompt };
}

export function allJobs() {
  const j = {};
  for (const f of FACE_IDS) { for (const e of EXPR_IDS) { const x = portraitJob(f, e); j[x.id] = x; } const fb = fullbodyJob(f); j[fb.id] = fb;
    for (const c of ['base', ...CLASS_IDS]) { const s = sheetJob(f, c); j[s.id] = s; } }
  return j;
}

export const QA = {
  portrait: ['6종이 머리 실루엣·머리색·피부톤으로 한눈에 구분', '같은 얼굴 4표정 동일 인물(머리·눈색·의상·구도)', '표정 정의 일치', '기본 복장 6종 통일(남색 코트·금 테두리·크림 리본·청록 팔찌)', '성인 외견·노출 없음', '알파 가장자리 마젠타 잔여·구멍 없음', '896x1200 이상'],
  fullbody: ['초상화와 동일 인물·복장', '발끝까지 잘림 없음', '알파 품질'],
  sheet: ['초상화와 머리 모양·머리색·피부·코트 색 1:1', '클래스 장비가 64px에서 식별', '9칸 무기 일관·누락 없음', '측면 행 좌향 프로필', '알파 0/255, 마젠타 잔여 없음'],
};
