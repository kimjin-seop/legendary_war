// ===== 대사 장면 배경 일러스트(bg.<set>.<name>) — 2026-11-01 안아트 =====
// 공통 상수는 style_guide.mjs(단일 출처)에서 import. 이 파일은 대사 장면 배경 프롬프트·구도 규칙·QA·키 규약만 둔다.
// 생성: sh docker/gemini/gen_scene_bg.sh [id1,id2]   후처리: python docker/gemini/pp_scene_bg.py
// 규칙: 작품명·작가명·기존 캐릭터명 금지(스타일 묘사어만). 실존 인물·얼굴 없음(풍경·사물만). 종교 상징 금지.
//
// ---- 키 규약 ----
//   bg.<set>.<name>   (소문자·숫자·밑줄, FE dialogueData.js BG_KEY_RE 와 일치)
//   set  = archive(시간의 서고 공통: 모든 서가에서 재사용) | <서가 id>(시대·문화권 서가: imjin=임진왜란 1592~1598, 이후 goryeo_khitan, sengoku, three_kingdoms ... 로 확장)
//   name = 장소_시간/상태(예: fleet_dawn, pyongyang_winter). 같은 장소의 변형은 _b, _c 접미사
//   예약 set: battle(전투 무대, 기존), screen(타이틀·로비·뽑기, 기존) — 대사 배경 set 이름으로 쓰지 않는다
//   파일: public/assets/bg/scene/<set>/<name>.webp(1920x1080) + <name>_1280.webp(1280x720 변형)
import { UISKIN_PAL } from './style_guide.mjs';
import { extraJobs, EXTRA_MAP, EXTRA_CROP } from './scene_bg_ch2124.mjs';
import { extraJobs2, EXTRA_MAP2, SCENE_JOB2, CROP2 } from './scene_bg_ch1120.mjs'; // 2026-11-03 서가 ch11~17·19·20·999 배경 38장
import { existsSync as _ex } from 'node:fs'; // 2026-11-03 ch18·21~24 대사 배경 29장 + 서고 매핑

export const SCENE_BG_STYLE =
  '1990~2000년대 일본 판타지 SRPG 애니메이션풍 게임의 대화 장면 배경 일러스트(이벤트 CG 의 배경 미술): 깔끔한 윤곽과 셀 셰이딩 느낌을 살린 정교한 회화풍 배경, 부드러운 그라데이션과 대기 원근, ' +
  `색조는 깊은 남색(${UISKIN_PAL.navyDeep}~${UISKIN_PAL.navyRaised})·청록 그늘과 금빛(${UISKIN_PAL.gold}) 하이라이트로 남색 칠기·금박 UI 와 어울림, 광원은 왼쪽 위로 통일, 채도는 중간(형광·네온 금지), 사진 같은 실사 금지`;

// 대사 화면 가독성 구도(1920x1080 기준: 하단 약 30% 대사창, 좌우 20% 지점에 초상화, 상단 10% 버튼 줄)
export const SCENE_BG_RULE =
  '16:9 가로 화면, 사람 눈높이의 넓은 전경, 소실점은 화면 가운데 약간 위. ' +
  '화면 아래쪽 30% 는 어둡고 단순한 바닥면(바닥·수면·땅)만: 큰 사물·강한 대비·밝은 빛 없음(대사창이 덮는 자리). ' +
  '화면 왼쪽 1/3 과 오른쪽 1/3 의 중간 높이(위에서 20%~85%)는 차분하고 어둡게, 세부 묘사를 줄이고 큰 사물·밝은 점·강한 선 없음(인물 초상화가 서는 자리). ' +
  '시선을 끄는 주제(건물·빛·풍경의 중심)는 화면 가운데 위쪽(위에서 15%~55%, 가로 35%~65%)에 둠. 화면 맨 위 10% 도 단순하게(버튼 자리). 전체적으로 정보량을 줄인 배경용 그림';

export const SCENE_BG_NEG =
  '사람·인물·얼굴·실루엣 인물·동물 금지, 텍스트·글자·숫자·한자·서예·간판·책등 글씨·책 표지 글씨·현판 글씨 금지(책 페이지는 흐린 회색 줄로만), 깃발 문양·문장·국기·가문 문장 금지, ' +
  '종교 상징(십자·불상·불탑·만자·도리이·신상·제단) 금지, 유혈·시신·잔혹 표현·폭발 화염 금지, 워터마크·로고·서명 금지, 테두리·액자·레터박스·UI 요소 금지, 보라·분홍·자주·마젠타 색조 금지, 흐릿함·노이즈·거친 붓 질감 금지';

// 품질 점검표(자체 QA)
export const SCENE_BG_QA = [
  '글자·숫자·간판·깃발 문양 없음', '사람·얼굴·실루엣 인물 없음(멀리 배의 형체는 허용, 승무원 식별 불가)', '종교 상징 없음',
  '하단 30%(대사창) 평균 휘도 낮고 디테일 적음 — 흰 글자 대비 확보', '좌우 1/3 중간 높이 과밀하지 않음(초상화 뒤)', '광원 왼쪽 위, 남색·금 톤 일관',
  '번짐·뭉개짐·이상한 구조물(떠다니는 파편·왜곡된 기와) 없음', '시대·문화 고증: 조선 중기 성곽·전선(판옥선) 형태, 불확실 항목 verify',
];

const ARCHIVE_REF = ['cutscene/il01_hall.jpg']; // 프롤로그 컷신의 서고(같은 세계관·같은 그림체 기준)
const REF_NOTE = '첨부한 참조 이미지는 그림체·채색·조명 분위기만 참고하고, 구도·인물·책상·문 배치는 따라 하지 않는다(사람 없음). ';
const job = (id, set, name, d, extra = {}) => ({
  id, set, name, key: `bg.${set}.${name}`, aspect: '16:9', refs: extra.refs,
  prompt: `${extra.refs ? REF_NOTE : ''}게임 대화 장면 배경 일러스트 1장(글자 없음, 사람 없음). 장면: ${d}\n구도 규칙: ${SCENE_BG_RULE}\n스타일: ${SCENE_BG_STYLE}\n금지: ${SCENE_BG_NEG}${extra.neg ? `, ${extra.neg}` : ''}`,
  verify: extra.verify ?? false, note: extra.note,
});

export const SCENE_BGS = [
  // ---- archive: 시간의 서고(모든 서가 공통) ----
  job('archive_hall', 'archive', 'hall', '끝없이 높은 나무 서가가 양쪽으로 겹겹이 이어진 거대한 \'시간의 서고\' 중앙 홀. 아치형 천장과 높은 창, 비스듬한 빛줄기 속 금빛 먼지. 홀 가운데 깊숙한 곳에 따뜻한 빛이 새어 나오는 높은 두 짝 나무 문. ' +
    '바닥은 어두운 나무 마루(아래쪽은 그늘). 좌우 서가는 그늘에 잠겨 차분함. 경이롭고 고요한 분위기, 호박색 빛과 청록 그림자', { refs: ARCHIVE_REF }),
  job('archive_aisle', 'archive', 'aisle', '서고 안의 긴 서가 복도: 양옆으로 높은 책장이 원근으로 길게 이어지고, 복도 끝(화면 가운데)에 작은 둥근 창과 은은한 등불 빛. 책장 사이사이에 작은 놋쇠 등잔 몇 개가 낮게 켜짐. ' +
    '바닥에 긴 남색 러너 카펫. 차분하고 조용한 열람실 분위기, 좌우 책장은 어둡게 가라앉음', { refs: ARCHIVE_REF }),
  job('archive_deep', 'archive', 'deep', '서고의 가장 깊은 곳: 끝이 보이지 않는 어두운 공허 위에 떠 있는 부서진 나무 마루 발판들, 가운데 넓은 평지 발판과 그 뒤 언덕처럼 솟은 발판 위에 높은 서가 탑 두 기가 좌우 대칭으로 서 있음. ' +
    '발판 가장자리는 깨진 채 공허로 끊김. 가운데 바닥에서 검은 먹물이 소용돌이치며 모여 하나의 짙은 그림자 덩어리(추상적인 연기 형태, 사람·얼굴·손 모양 금지)가 됨. 위쪽 멀리 희미한 금빛 빛줄기 하나. 불길하지만 잔혹하지 않음', { refs: ARCHIVE_REF }),
  job('archive_ink', 'archive', 'ink', '먹물이 번진 서가: 높은 서가 사이 통로의 책들에서 검은 먹물이 번져 흘러내리고, 통로 안쪽(화면 가운데)은 서가가 떨어져 나가 검은 공허가 열려 있음. 공허 위로 끊어진 통로와 불안정하게 떠 있는 나무 발판 몇 개. ' +
    '먹물은 추상적인 번짐·물결 형태로만. 색조는 깊은 먹색과 청회색, 공허 가장자리에 아주 옅은 금빛 테두리', { refs: ARCHIVE_REF }),
  job('archive_dusk', 'archive', 'dusk', '노을 진 서고: 높은 아치 창으로 주황·금빛 저녁 햇살이 길게 비스듬히 들어와 서가와 마루를 따뜻하게 물들임. 책장은 모두 가지런히 제자리에 꽂혀 있고, 가운데 안쪽에 작은 열람 책상과 펼쳐 둔 책 한 권(페이지는 흐린 회색 줄). ' +
    '먼지가 반짝이는 고요하고 평화로운 정리의 분위기. 좌우 서가는 노을 그늘로 어둡게', { refs: ARCHIVE_REF }),
  // ---- imjin: 임진왜란 서가(1592~1598, 조선) ----
  job('imjin_fleet_dawn', 'imjin', 'fleet_dawn', '새벽 남해 바다: 옅은 안개가 깔린 잔잔한 바다와 멀리 겹겹의 섬 능선, 화면 가운데 먼 바다에 닻을 내리고 정박한 조선 수군 목조 전선(판옥선: 평평한 바닥의 2층 구조, 위층 판자 담장과 작은 지휘 누각, 돛 2개) 서너 척이 작은 실루엣으로 줄지어 있음. ' +
    '오른쪽 먼 해안에 작은 포구. 수평선 너머 옅은 금빛 여명, 하늘은 남색에서 금빛으로. 배 위 사람은 보이지 않음. 깃발은 무늬 없는 붉은·남색 천만', { verify: true, note: '판옥선 형태(2층 갑판·누각) 고증 verify' }),
  job('imjin_night_sea', 'imjin', 'night_sea', '깊은 밤의 넓은 바다 해협: 어두운 남색 바다와 별이 드문 밤하늘, 멀리 좌우 해안의 낮은 산 실루엣. 바다 가운데 멀리 양쪽에서 마주 선 배들의 작은 등불과 횃불 불빛이 점점이 수면에 길게 비침(배는 어두운 형체만, 사람 없음). ' +
    '수면 위로 흩어진 검은 암초 몇 개. 긴장된 결전 전야의 정적, 폭발·불타는 배 없음', { verify: false }),
  job('imjin_strait', 'imjin', 'strait', '좁고 물살이 거센 해협: 양쪽(화면 왼쪽·오른쪽 원경)에 암벽처럼 늘어선 바위 해안과 암초 띠, 가운데로 좁은 물길이 소용돌이치며 흐름. 흐린 아침 하늘, 물보라와 소용돌이 물결. ' +
    '물길 가운데 멀리 작은 조선 목조 전선 한두 척의 실루엣(사람 없음). 좌우 바위는 어두운 그늘로 단순하게', { verify: true, note: '명량(울돌목) 지형은 각색 서가(what_if)라 형태만 참고' }),
  job('imjin_river', 'imjin', 'river', '숲으로 둘러싸인 넓은 강과 모래톱: 잔잔한 강물이 화면 가운데를 가로질러 굽이쳐 흐르고, 가운데 강가에 넓은 흰 모래톱, 건너편 둑에 짙은 활엽수 숲과 갈대, 멀리 완만한 산 능선. ' +
    '맑은 늦봄~초여름 오후, 강 위로 옅은 물안개. 사람·배·진영 없음. 차분하고 고요한 강가', { verify: false }),
  job('imjin_fortress', 'imjin', 'fortress', '전투가 지나간 뒤의 조선 읍성: 강가 절벽 위로 길게 이어진 회색 돌 성벽과 성가퀴(톱니 모양 낮은 담), 성벽 가운데 위로 겹처마 기와지붕의 성문 누각과 망루, 성벽 아래로 강이 흐름. ' +
    '성벽 몇 군데에서 가늘고 옅은 연기가 하늘로 올라가고, 성벽 아래 흙바닥에 부러진 나무 사다리 몇 개(사람·시신 없음). 해 질 무렵 흐린 붉은 노을, 지쳤지만 지켜낸 고요한 분위기. 현판 글씨 없음', { verify: true, note: '조선 읍성(진주성) 성가퀴·문루 형태 verify' }),
  job('imjin_pyongyang_winter', 'imjin', 'pyongyang_winter', '한겨울의 큰 성곽 도시: 눈 덮인 넓은 돌 성벽이 화면 가운데 원경으로 길게 이어지고, 가운데 위쪽에 겹처마 기와지붕의 큰 성문 누각(문루)이 눈을 이고 서 있음, 성벽 안쪽으로 기와지붕 관아 건물들이 겹겹이. ' +
    '성 앞으로 얼어붙은 넓은 강과 눈 쌓인 강변. 흐린 겨울 하늘, 성벽 위 무늬 없는 남색 깃발 몇 개, 차갑고 맑은 공기, 사람 없음. 현판 글씨 없음', { verify: true, note: '평양성 대동문·성곽 형태는 일반화된 조선 성곽 표현, verify' }),
  job('imjin_haengju_sunset', 'imjin', 'haengju_sunset', '해가 지는 강가 언덕 위 산성: 화면 가운데 위쪽, 큰 강을 내려다보는 둥근 언덕 꼭대기를 흙과 돌로 쌓은 낮은 성벽과 뾰족한 나무 목책이 둘러싸고, 언덕 정상에 작은 기와지붕 지휘소 하나. ' +
    '언덕 좌우로 숲과 낮은 언덕이 이어짐(어둡게 단순하게). 뒤로 넓은 강이 노을빛을 반사, 하늘은 남색에서 주황·금빛으로 물듦. 무늬 없는 깃발 몇 개, 사람 없음. 지켜낸 뒤의 안도감', { verify: true, note: '행주산성 토성·목책 형태 verify' }),
];

// ---- 2차(재생성): 같은 키를 대체. 1차 기각 사유는 scene_bg_qa.json manual 참조 ----
const replaceJob = (id, base, d, extra = {}) => { const b = SCENE_BGS.find((j) => j.id === base); return { ...job(id, b.set, b.name, d, extra), replaces: base }; };
export const SCENE_BGS_FIX = [
  // 1차: 참조 이미지 구도를 그대로 복사해 hall 과 구분 안 됨, 노을색 약함 → 참조 이미지 없이 측면 창 벽 구도
  replaceJob('archive_dusk2', 'archive_dusk', '노을 진 서고의 창가 열람실: 화면 가운데 안쪽 벽 전체에 키 큰 아치형 유리창 세 개가 나란히 있고, 창밖은 진한 주황·금빛 노을 하늘과 낮게 깔린 구름(창살은 세로줄만). ' +
    '저녁 햇살이 창에서 바닥으로 길고 따뜻한 빛 기둥을 드리우며, 창 아래 가운데에 펼친 책 한 권이 놓인 작은 나무 열람 책상(페이지는 흐린 회색 줄). 좌우는 가지런히 정리된 높은 서가가 깊은 남색 그늘에 잠김. ' +
    '바닥은 어두운 나무 마루. 하루가 끝난 고요하고 평화로운 정리의 분위기, 주황·금빛과 남색 그늘의 대비'),
  // 1차: 화면 위·아래에 레터박스 같은 수평 띠 → 띠 금지 명시
  replaceJob('imjin_night_sea2', 'imjin_night_sea', '깊은 밤의 넓은 바다 해협: 하늘은 화면 맨 위부터 수평선까지 끊김 없이 이어지는 짙은 남색 밤하늘(옅은 구름과 드문 별), 멀리 좌우 해안의 낮은 산 실루엣. ' +
    '바다 가운데 멀리 왼쪽과 오른쪽에서 마주 선 두 무리의 목조 배들이 작은 등불·횃불 불빛을 켜고 있고 불빛이 수면에 길게 비침(배는 작고 어두운 형체만, 사람 없음). 수면 위로 흩어진 검은 암초 몇 개. ' +
    '바다는 수평선에서 화면 맨 아래까지 끊김 없이 이어지며 아래로 갈수록 더 어두워짐. 긴장된 결전 전야의 정적, 폭발·불타는 배 없음', { neg: '화면 위·아래의 검은 띠·수평 경계선·레터박스·단색 띠 금지' }),
  // 1차: 수면 75% 높이에서 어두운 띠가 칼같이 끊김(하단 어둡게 지시를 띠로 해석) → 자연스러운 그늘 전환 명시
  replaceJob('imjin_river2', 'imjin_river', '숲으로 둘러싸인 넓은 강과 모래톱: 잔잔한 강물이 화면 가운데를 가로질러 굽이쳐 흐르고, 강 가운데 넓은 흰 모래톱, 건너편 둑에 짙은 활엽수 숲과 갈대, 멀리 완만한 산 능선. ' +
    '맑은 늦봄 오후, 강 위로 옅은 물안개. 화면 앞쪽(아래)은 이쪽 강둑의 풀밭과 흙이 나무 그늘에 덮여 자연스럽게 점점 어두워짐(경계선 없이 부드럽게). 사람·배·진영 없음. 차분하고 고요한 강가', { neg: '화면을 가로지르는 수평 경계선·단색 띠·레터박스 금지' }),
];
SCENE_BGS.push(...extraJobs(job)); SCENE_BGS.push(...extraJobs2(job).filter((j) => _ex(`public/assets/raw/scene_bg/${j.id}.jpg`) || process.env.SCENE_BG_ALL === "1")); // 2차: pp 는 raw 있는 것만, 생성기는 SCENE_BG_ALL=1 // ch18·21~24 대사 배경(scene_bg_ch2124.mjs)
// 호출 없이 크롭으로 살린 원본(정규화 좌표 l,t,r,b: 그 영역을 16:9 cover 로 다시 자름)
export const CROP_FIX = { ...EXTRA_CROP, ...CROP2,
  imjin_haengju_sunset: { box: [0, 0.13, 1, 1], why: '상단 0~12% 단색 띠(레터박스형) 제거' },
  imjin_night_sea2: { box: [0, 0.125, 1, 0.875], why: '2차도 위 0~11.8%·아래 88.1~100% 검은 띠(야간 장면 레터박스 경향) 제거' },
};

// ---- 매핑(장면 id → 배경 키). 근거: 각 장면 bg(설명문) ----
export const SCENE_BG_MAP = {
  // 튜토리얼(시간의 서고)
  tut_00_opening: 'bg.archive.hall', tut_01_world: 'bg.archive.hall', tut_02_first_hero: 'bg.archive.aisle', tut_03_battle_basic: 'bg.archive.aisle',
  tut_04_affinity: 'bg.archive.aisle', tut_05_terrain_aura: 'bg.archive.aisle', tut_06_cost_formation: 'bg.archive.aisle', tut_07_deploy: 'bg.archive.aisle',
  tut_08_first_victory: 'bg.archive.hall', tut_09_gacha_preview: 'bg.archive.hall',
  // 1챕터 임진왜란
  ch1_open: 'bg.archive.hall',
  ch1_s1_pre: 'bg.imjin.fleet_dawn', ch1_s1_post: 'bg.imjin.fleet_dawn',
  ch1_s2_pre: 'bg.imjin.river', ch1_s2_post: 'bg.imjin.river',
  ch1_s3_pre: 'bg.imjin.fleet_dawn', ch1_s3_post: 'bg.imjin.fleet_dawn',
  ch1_s4_pre: 'bg.imjin.fortress', ch1_s4_post: 'bg.imjin.fortress',
  ch1_s5_pre: 'bg.imjin.pyongyang_winter', ch1_s5_post: 'bg.imjin.pyongyang_winter',
  ch1_s6_pre: 'bg.imjin.haengju_sunset', ch1_s6_post: 'bg.imjin.haengju_sunset',
  ch1_s7_pre: 'bg.imjin.night_sea', ch1_s7_post: 'bg.imjin.fleet_dawn',
  ch1_s8_pre: 'bg.archive.ink', ch1_s8_post: 'bg.archive.dusk',
  ch1_s9_pre: 'bg.imjin.strait', ch1_s9_post: 'bg.imjin.strait',
  ch1_s10_pre: 'bg.archive.deep', ch1_s10_post: 'bg.archive.dusk',
  ch1_end: 'bg.archive.dusk',
  // 11서가(고려-거란) — 서고 장면만 확정, 야외는 임시 대체(전용 bg.goryeo_khitan.* 제작 전)
  shelf11_open: 'bg.archive.aisle', shelf11_s5_pre: 'bg.archive.ink', shelf11_s5_post: 'bg.archive.dusk',
  // ch18·21~24(scene_bg_ch2124.mjs EXTRA_MAP)
  ...EXTRA_MAP,
  ...Object.fromEntries(Object.entries(EXTRA_MAP2).filter(([sc]) => _ex(`public/assets/raw/scene_bg/${SCENE_JOB2[sc]}.jpg`))), // 2차: 생성된 배경만 매핑
};
export const SCENE_BG_PROVISIONAL = { // 전용 배경 제작 전 임시 대체(시대·지형 불일치 가능)
  shelf11_s1_pre: 'bg.imjin.river', shelf11_s1_post: 'bg.imjin.river', shelf11_s2_pre: 'bg.imjin.river', shelf11_s2_post: 'bg.imjin.river',
  shelf11_s3_pre: 'bg.imjin.haengju_sunset', shelf11_s3_post: 'bg.imjin.haengju_sunset', shelf11_s4_pre: 'bg.imjin.river', shelf11_s4_post: 'bg.imjin.haengju_sunset',
};
export const JOBS = { scene_bg: SCENE_BGS, scene_bg_fix: SCENE_BGS_FIX };
// 최종 채택 원본: 육안 QA 후 채택한 재생성본(1차 id -> 재생성 id). 후처리 pp_scene_bg.py 가 사용
export const ADOPT = { archive_dusk: 'archive_dusk2', imjin_night_sea: 'imjin_night_sea2', imjin_river: 'imjin_river2' };
export const SCENE_BG_FINAL = SCENE_BGS.map((j) => { const f = ADOPT[j.id] && SCENE_BGS_FIX.find((x) => x.id === ADOPT[j.id]); return f ? { ...f, raw_category: 'scene_bg_fix' } : { ...j, raw_category: 'scene_bg' }; });
