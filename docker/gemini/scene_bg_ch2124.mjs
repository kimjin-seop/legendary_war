// 대사 장면 배경 보강(안아트 2026-11-03, 팀장 결정: 29장, 저녁 전용 없음 — 같은 장소의 해 질 녘 장면도 같은 배경 재사용).
// style_scene_bg.mjs 가 이 모듈을 import 해 SCENE_BGS·SCENE_BG_MAP 에 덧붙인다(순환 import 방지: 이 모듈은 아무것도 import 하지 않고 job 함수를 인자로 받음).
// 장면 근거: resources/js/game/data/dialogue/ch18_mongol·ch21_legnica·ch22_panipat·ch23_hastings·ch24_tours.json 의 scene.bg 설명문.
// 규칙: 사람·동물·글자·깃발 문양·종교 상징 없음(군영·진지는 빈 천막·수레·방패만), 시대 건축 일반화(불확실 항목 verify).
// 제작 순서: hastings·tours(10) → legnica·panipat(12) → mongol(7)
export const ORDER = [
  'hastings_harbor', 'hastings_pevensey', 'hastings_camp_night', 'hastings_ridge', 'hastings_thames', 'hastings_tent',
  'tours_vienne_ford', 'tours_roman_road', 'tours_oak_slope', 'tours_night_slope',
  'legnica_muddy_plain', 'legnica_river_fog', 'legnica_castle_plain', 'legnica_danube_fortress', 'legnica_dalmatia', 'legnica_mountain_road',
  'panipat_kabul', 'panipat_fort_gate', 'panipat_lahore_river', 'panipat_dry_plain', 'panipat_wagon_laager', 'panipat_ghaghra',
  'mongol_onon', 'mongol_hexi_canyon', 'mongol_pass', 'mongol_tianshan', 'mongol_syr_river', 'mongol_indus_cliff', 'mongol_winter_steppe',
];
const NO_PEOPLE = '사람·말·낙타 등 생물은 그리지 않음(빈 풍경)';
export function extraJobs(job) {
  const D = {
    // ---- ch23 헤이스팅스(1066) ----
    hastings_harbor: ['hastings', 'harbor', `11세기 북프랑스 강 하구의 작은 나무 부두, 저녁 무렵: 밀물이 들어오는 넓은 갯벌과 낮은 둑길, 나무 말뚝 부두에 정박한 바이킹식 긴 목조 범선(뱃머리가 높이 휜 클링커 이음 배, 무지 돛을 접음) 여러 척이 화면 가운데에 늘어섬. 부두 위 꺼진 횃불 기둥 몇 개, 멀리 낮은 언덕과 구름 낀 노을 하늘. ${NO_PEOPLE}`, { verify: true, note: '노르만 수송선은 바이킹식 롱십 계열로 일반화(verify)' }],
    hastings_pevensey: ['hastings', 'pevensey', `안개 낀 아침의 조약돌 해안: 회색 조약돌이 넓게 깔린 해변과 잔잔한 회청색 바다, 해변 안쪽(화면 가운데)에 이끼 낀 오래된 로마식 돌 성벽 잔해(둥근 탑 몇 개가 있는 낮은 성벽)와 그 안쪽에 새로 세운 나무 목책. ${NO_PEOPLE}`, { verify: true, note: '페븐시 로마 요새(색슨 해안 요새) 형태 일반화' }],
    hastings_camp_night: ['hastings', 'camp_night', `한밤의 군영: 나무 목책으로 둘러싼 언덕 위 야영지에 무지 천막 여러 동, 천막 사이 낮게 타는 모닥불 몇 개가 따뜻한 주황 빛을 냄, 목책에 기대 세운 연 모양 방패와 창. 멀리 북쪽 검은 능선 위에 작은 불빛이 점점이 흩어짐, 별이 드문 남색 밤하늘. ${NO_PEOPLE}`, {}],
    hastings_ridge: ['hastings', 'ridge', `가을 아침의 낮은 능선: 화면 가운데 위쪽으로 길게 뻗은 완만한 풀 능선, 능선 꼭대기를 따라 무지 둥근 방패와 연 모양 방패가 끝에서 끝까지 촘촘히 세워져 이어짐(방패벽, 사람은 보이지 않음). 능선 아래 비탈은 젖은 풀밭과 엷은 안개, 하늘은 옅은 회청색. 방패에 문양 없음. ${NO_PEOPLE}`, { verify: true, note: '방패벽만 남긴 연출(인물 없음 규칙)' }],
    hastings_thames: ['hastings', 'thames', `늦가을 템스 강 남쪽 둑: 안개가 낮게 흐르는 넓은 강, 강 건너(화면 가운데) 회색 돌 성벽과 성문 탑, 성벽 안쪽에 나무 지붕 집들과 낮은 돌 교회 지붕(십자가 없음), 강을 가로지르는 낮은 나무 다리. 이쪽 둑은 진흙과 마른 갈대. ${NO_PEOPLE}`, { verify: true, note: '11세기 런던(로마 성벽·나무 다리) 일반화' }],
    hastings_tent: ['hastings', 'tent', `큰 천막 안쪽, 겨울이 가까운 아침: 두꺼운 생성 아마천 벽과 나무 기둥, 열린 천막 입구(화면 가운데)로 흐린 바깥빛과 서리 낀 들판이 보임, 안쪽에 낮은 나무 탁자와 접이 의자, 탁자 위 놋쇠 촛대와 말린 양피지 두루마리(글자 없음), 바닥에 모피 깔개. ${NO_PEOPLE}`, {}],
    // ---- ch24 투르(732) ----
    tours_vienne_ford: ['tours', 'vienne_ford', `초가을 강 여울: 낮은 안개가 깔린 넓고 얕은 강, 물살이 자갈 위로 잔물결을 이루며 화면 가운데를 가로지름, 건너편 둑에 버드나무와 갈대, 진흙 둑에 바퀴 자국이 난 길이 물속으로 이어짐, 먼 남쪽 지평선에 흐린 먼지 기둥. ${NO_PEOPLE}`, {}],
    tours_roman_road: ['tours', 'roman_road', `새벽 숲 가장자리: 돌을 깐 오래된 로마식 곧은 큰길이 화면 가운데 소실점으로 뻗고, 길 옆으로 낙엽이 쌓인 좁은 숲길이 참나무·너도밤나무 숲 속으로 갈라짐. 숲 사이로 옅은 새벽빛, 가을 낙엽 색은 금빛·적갈. ${NO_PEOPLE}`, {}],
    tours_oak_slope: ['tours', 'oak_slope', `가을 새벽의 완만한 오르막: 듬성듬성 선 오래된 참나무 아래 서리 내린 풀밭, 나무에 기대 세로로 세워 놓은 무지 둥근 나무 방패 몇 개, 오르막 아래(화면 가운데 멀리)로 안개 덮인 넓은 평원이 펼쳐짐. ${NO_PEOPLE}`, { note: 'ch24_s3_pre·s4_pre·s4_post 공용' }],
    tours_night_slope: ['tours', 'night_slope', `불을 피우지 않은 밤의 참나무 오르막: 서리가 내린 풀밭과 검은 참나무 실루엣, 별빛과 옅은 달빛만, 땅바닥에 막대로 그은 몇 줄의 선(글자 아님), 멀리 아래 평원에 작은 야영 불빛이 점점이. ${NO_PEOPLE}`, {}],
    // ---- ch21 레그니차(1241) ----
    legnica_muddy_plain: ['legnica', 'muddy_plain', `이른 봄 아침의 젖은 평원: 눈이 녹아 진창이 된 넓은 들판, 바퀴·발굽 자국마다 물이 고여 하늘을 비춤, 화면 가운데 멀리 낮은 구릉 아래 무지 천 깃발 몇 개(문양 없음)가 꽂혀 있음, 차가운 회청색 하늘. ${NO_PEOPLE}`, { note: 'ch21_s1·s4 공용' }],
    legnica_river_fog: ['legnica', 'river_fog', `이른 아침의 안개 낀 강가: 낮게 깔린 안개 속 넓은 강, 강 한가운데 얕은 곳을 표시하는 나무 막대가 줄지어 섬, 건너편은 풀밭과 숲 가장자리, 이쪽 둑은 젖은 풀과 진흙. ${NO_PEOPLE}`, { note: 'ch21_s2(오데르)·s5(사요) 공용' }],
    legnica_castle_plain: ['legnica', 'castle_plain', `한낮의 성 밖 평지: 화면 가운데 멀리 13세기 중부유럽 돌·벽돌 성벽과 성문 탑, 성 앞에 작은 나무 망루, 성벽 위로 연기 한 줄, 성에서 북서쪽으로 뻗은 흙길. 십자가·문장 없음. ${NO_PEOPLE}`, { verify: true, note: '브로츠와프 13세기 성 형태 일반화' }],
    legnica_danube_fortress: ['legnica', 'danube_fortress', `겨울 새벽의 얼어붙은 큰 강: 화면 앞쪽은 눈 덮인 강둑, 가운데로 넓게 얼어붙은 강과 얼음 위 긴 자국, 강 건너 언덕 위에 회색 돌 성채(높은 성벽과 사각 탑), 차가운 분홍기 없는 회청·금빛 여명. 십자가 없음. ${NO_PEOPLE}`, { verify: true, note: '에스테르곰 성채 형태 일반화' }],
    legnica_dalmatia: ['legnica', 'dalmatia', `오후의 석회암 해안: 풀이 거의 없는 희고 밝은 회색 석회암 바위 비탈과 바다까지 이어진 돌길, 짙은 청록 바다 위로 멀리 섬까지 가늘게 이어진 돌 둑길, 수평선에 작은 돛 하나. 아래쪽 30%는 그늘진 바위로 어둡게. ${NO_PEOPLE}`, {}],
    legnica_mountain_road: ['legnica', 'mountain_road', `봄 산길: 눈이 녹아 질척한 좁은 고갯길이 화면 가운데로 굽어 오르고, 길가에 빈 나무 수레 두 대, 양옆 비탈에 잔설과 검은 침엽수, 멀리 고갯마루 위 흐린 하늘. ${NO_PEOPLE}`, {}],
    // ---- ch22 파니파트(1519~1529) ----
    panipat_kabul: ['panipat', 'kabul', `산으로 둘러싸인 성채 아래 언덕의 아침: 화면 가운데 위쪽에 바위 언덕 위 흙벽돌 성채(두꺼운 흙빛 성벽과 둥근 망루), 닫힌 성문 위로 가는 취사 연기, 뒤로 눈 덮인 높은 산맥, 차갑고 맑은 공기. ${NO_PEOPLE}`, { verify: true, note: '16세기 카불 성채(발라 히사르) 일반화' }],
    panipat_fort_gate: ['panipat', 'fort_gate', `이른 겨울 새벽의 성문 앞: 두꺼운 나무 성문과 흙·돌 성벽(화면 가운데), 언 땅 위에 줄지어 세워 둔 무지 나무 방패, 성벽 위 흐린 연기 자국. 차가운 회청 새벽빛. ${NO_PEOPLE}`, { note: 'ch22_s2(바자우르)·s6_post(아그라 성문) 공용' }],
    panipat_lahore_river: ['panipat', 'lahore_river', `겨울 안개 낀 강변: 넓은 강 위 짙은 안개 속에 붉은 벽돌 성벽의 윤곽이 흐리게 보이고, 강을 건너는 좁은 나무 다리 하나가 화면 가운데로 이어짐, 이쪽 강변은 젖은 모래와 갈대. ${NO_PEOPLE}`, {}],
    panipat_dry_plain: ['panipat', 'dry_plain', `건조한 북인도 평원의 아침: 낮게 이는 흙먼지, 메마른 황토색 땅과 드문드문한 가시나무·아카시아, 화면 가운데 멀리 흐린 지평선과 옅은 먼지 띠, 하얗게 바랜 하늘. ${NO_PEOPLE}`, { note: 'ch22_s4(히사르)·s6_pre(아그라 길) 공용' }],
    panipat_wagon_laager: ['panipat', 'wagon_laager', `새벽의 넓은 평원 진지: 빈 나무 수레 여러 대가 가죽끈·쇠사슬로 묶여 화면 가운데를 가로질러 한 줄로 늘어서고, 수레 사이마다 무지 나무 방패가 서 있음, 오른쪽 멀리 낮은 시가지 지붕, 왼쪽 멀리 나뭇가지를 채운 도랑. 먼지 섞인 새벽빛. ${NO_PEOPLE}`, { verify: true, note: '수레 진지(아라바) 일반화. ch22_s5·s7 공용' }],
    panipat_ghaghra: ['panipat', 'ghaghra', `초여름 아침의 큰 강가: 화면 앞쪽은 키 큰 갈대밭, 가운데로 넓은 강과 안개 낀 수면 위에 닻을 내린 큰 나무 강배 여러 척(무지 돛), 강 건너편 멀리 낮은 숲. ${NO_PEOPLE}`, {}],
    // ---- ch18 몽골(1206~1227) ----
    mongol_onon: ['mongol', 'onon', `넓은 초원의 강가: 구불구불 흐르는 맑은 강을 따라 흰 펠트 원형 천막(게르) 여러 채가 화면 가운데 멀리 늘어섬, 완만한 녹색 구릉과 넓은 하늘, 천막 앞에 무지 흰 천 깃대 하나. 화면 안에 밝기가 다른 사각형 영역·패널·액자 경계가 생기지 않게 하늘과 땅이 끊김 없이 이어짐. ${NO_PEOPLE}`, { note: 'ch18_s1(오논)·s7(칼카) 공용' }],
    mongol_hexi_canyon: ['mongol', 'hexi_canyon', `모래 바람 부는 회랑 어귀: 황토색 협곡 절벽 사이로 넓은 자갈 길이 화면 가운데로 이어지고, 멀리 겹겹의 메마른 산줄기, 흐린 모래빛 하늘. ${NO_PEOPLE}`, {}],
    mongol_pass: ['mongol', 'pass', `바람 센 고갯길: 겹겹이 겹친 비탈 사이로 굽이진 고갯길이 화면 가운데로 오르고, 고개 너머로 넓은 평원이 내려다보임, 고개 안쪽에 무지 천 깃발 세 무리(문양 없음). ${NO_PEOPLE}`, {}],
    mongol_tianshan: ['mongol', 'tianshan', `눈 덮인 산봉우리 아래의 산록 초원: 화면 가운데 위쪽에 하얗게 빛나는 높은 설산, 그 아래 길고 좁은 녹색 계곡, 계곡 어귀 작은 흙벽 마을에서 연기가 가늘게 오름. ${NO_PEOPLE}`, {}],
    mongol_syr_river: ['mongol', 'syr_river', `넓은 강가의 갈대밭: 화면 앞쪽 갈대, 가운데로 넓은 흙빛 강물, 건너편 기슭에 흙벽 성채와 목책 진지, 하류에 얕은 여울 두 곳. ${NO_PEOPLE}`, {}],
    mongol_indus_cliff: ['mongol', 'indus_cliff', `높은 절벽 아래 급류: 화면 가운데로 흰 물살의 급류가 흐르고, 이쪽은 바위 절벽 끝, 강 건너편에 완만한 바위 기슭, 멀리 언덕. ${NO_PEOPLE}`, {}],
    mongol_winter_steppe: ['mongol', 'winter_steppe', `겨울 초원: 얼어붙은 강이 화면 가운데를 가로지르고, 눈 덮인 평탄한 초원과 낮게 깔린 회색 구름, 지평선 위 낮게 걸린 해의 옅은 금빛. ${NO_PEOPLE}`, {}],
  };
  return ORDER.map((id) => { const [set, name, d, ex] = D[id]; return job(id, set, name, d, ex); });
}
const k = (s, n) => `bg.${s}.${n}`;
export const EXTRA_MAP = {
  // 2026-11-03 서가 ch11~17·19·20·999 서고 장면(기존 bg.archive.* 재사용)
  ch11_open: 'bg.archive.hall',
  ch12_open: 'bg.archive.hall',
  ch13_open: 'bg.archive.hall',
  ch14_open: 'bg.archive.hall',
  ch15_open: 'bg.archive.hall',
  ch16_open: 'bg.archive.hall',
  ch17_open: 'bg.archive.hall',
  ch19_open: 'bg.archive.hall',
  ch20_open: 'bg.archive.hall',
  ch11_end: 'bg.archive.dusk',
  ch12_end: 'bg.archive.dusk',
  ch13_end: 'bg.archive.aisle',
  ch14_end: 'bg.archive.dusk',
  ch15_end: 'bg.archive.aisle',
  ch16_end: 'bg.archive.dusk',
  ch17_end: 'bg.archive.dusk',
  ch19_end: 'bg.archive.aisle',
  ch20_end: 'bg.archive.dusk',
  ch12_i1: 'bg.archive.ink',
  ch999_open: 'bg.archive.deep',
  ch999_s1_pre: 'bg.archive.ink',
  ch999_s1_post: 'bg.archive.aisle',
  ch999_s3_pre: 'bg.archive.deep',
  ch999_s3_post: 'bg.archive.dusk',
  ch999_end: 'bg.archive.hall',
  // 서고(기존 archive 5종)
  ch18_open: 'bg.archive.hall', ch18_end: 'bg.archive.dusk', ch21_open: 'bg.archive.ink', ch21_end: 'bg.archive.deep',
  ch22_open: 'bg.archive.ink', ch22_end: 'bg.archive.deep', ch23_open: 'bg.archive.aisle', ch23_end: 'bg.archive.dusk', ch24_open: 'bg.archive.hall', ch24_end: 'bg.archive.dusk',
  // ch23
  ch23_s1_pre: k('hastings', 'harbor'), ch23_s1_post: k('hastings', 'harbor'), ch23_s2_pre: k('hastings', 'pevensey'), ch23_s2_post: k('hastings', 'pevensey'),
  ch23_s3_pre: k('hastings', 'camp_night'), ch23_s3_post: k('hastings', 'ridge'), ch23_s4_pre: k('hastings', 'ridge'), ch23_s4_post: k('hastings', 'ridge'),
  ch23_s5_pre: k('hastings', 'thames'), ch23_s5_post: k('hastings', 'tent'),
  // ch24
  ch24_s1_pre: k('tours', 'vienne_ford'), ch24_s1_post: k('tours', 'vienne_ford'), ch24_s2_pre: k('tours', 'roman_road'), ch24_s2_post: k('tours', 'roman_road'),
  ch24_s3_pre: k('tours', 'oak_slope'), ch24_s3_post: k('tours', 'night_slope'), ch24_s4_pre: k('tours', 'oak_slope'), ch24_s4_post: k('tours', 'oak_slope'),
  // ch21
  ch21_s1_pre: k('legnica', 'muddy_plain'), ch21_s1_post: k('legnica', 'muddy_plain'), ch21_s2_pre: k('legnica', 'river_fog'), ch21_s2_post: k('legnica', 'river_fog'),
  ch21_s3_pre: k('legnica', 'castle_plain'), ch21_s3_post: k('legnica', 'castle_plain'), ch21_s4_pre: k('legnica', 'muddy_plain'), ch21_s4_post: k('legnica', 'muddy_plain'),
  ch21_s5_pre: k('legnica', 'river_fog'), ch21_s5_post: k('legnica', 'river_fog'), ch21_s6_pre: k('legnica', 'danube_fortress'), ch21_s6_post: k('legnica', 'danube_fortress'),
  ch21_s7_pre: k('legnica', 'dalmatia'), ch21_s7_post: k('legnica', 'dalmatia'), ch21_s8_pre: k('legnica', 'mountain_road'), ch21_s8_post: k('legnica', 'mountain_road'),
  // ch22
  ch22_s1_pre: k('panipat', 'kabul'), ch22_s1_post: k('panipat', 'kabul'), ch22_s2_pre: k('panipat', 'fort_gate'), ch22_s2_post: k('panipat', 'fort_gate'),
  ch22_s3_pre: k('panipat', 'lahore_river'), ch22_s3_post: k('panipat', 'lahore_river'), ch22_s4_pre: k('panipat', 'dry_plain'), ch22_s4_post: k('panipat', 'dry_plain'),
  ch22_s5_pre: k('panipat', 'wagon_laager'), ch22_s5_post: k('panipat', 'wagon_laager'), ch22_s6_pre: k('panipat', 'dry_plain'), ch22_s6_post: k('panipat', 'fort_gate'),
  ch22_s7_pre: k('panipat', 'wagon_laager'), ch22_s7_post: k('panipat', 'wagon_laager'), ch22_s8_pre: k('panipat', 'ghaghra'), ch22_s8_post: k('panipat', 'ghaghra'),
  // ch18
  ch18_s1_pre: k('mongol', 'onon'), ch18_s1_post: k('mongol', 'onon'), ch18_s2_pre: k('mongol', 'hexi_canyon'), ch18_s2_post: k('mongol', 'hexi_canyon'),
  ch18_s3_pre: k('mongol', 'pass'), ch18_s3_post: k('mongol', 'pass'), ch18_s4_pre: k('mongol', 'tianshan'), ch18_s4_post: k('mongol', 'tianshan'),
  ch18_s5_pre: k('mongol', 'syr_river'), ch18_s5_post: k('mongol', 'syr_river'), ch18_s6_pre: k('mongol', 'indus_cliff'), ch18_s6_post: k('mongol', 'indus_cliff'),
  ch18_s7_pre: k('mongol', 'onon'), ch18_s7_post: k('mongol', 'onon'), ch18_s8_pre: k('mongol', 'winter_steppe'), ch18_s8_post: k('mongol', 'winter_steppe'),
};
// 호출 없이 크롭으로 살린 원본(레터박스형 단색 띠 제거, 정규화 l,t,r,b). 측정: 행 평균 휘도<25·표준편차<3 연속 구간
export const EXTRA_CROP = {
  hastings_camp_night: { box: [0, 0, 1, 0.745], why: '하단 25.5% 검은 단색 띠 제거' },
  hastings_harbor: { box: [0, 0, 1, 0.77], why: '하단 23% 검은 단색 띠 제거' },
  hastings_ridge: { box: [0, 0, 1, 0.799], why: '하단 20% 검은 단색 띠 제거' },
  hastings_tent: { box: [0, 0, 1, 0.874], why: '하단 12.6% 검은 단색 띠 제거' },
  hastings_thames: { box: [0, 0.117, 1, 0.884], why: '상단 11.7%·하단 11.6% 검은 띠 제거' },
  tours_night_slope: { box: [0, 0, 1, 0.897], why: '하단 10% 검은 단색 띠 제거' },
  mongol_indus_cliff: { box: [0, 0, 1, 0.841], why: '하단 16% 단색 띠 제거' },
  mongol_pass: { box: [0, 0.1, 1, 0.958], why: '상단 어두운 띠·하단 4% 띠 제거' },
  mongol_syr_river: { box: [0, 0.078, 1, 0.775], why: '상단 7.8%·하단 22.5% 단색 띠 제거' },
  mongol_tianshan: { box: [0, 0, 1, 0.886], why: '하단 11% 단색 띠 제거' },
  mongol_winter_steppe: { box: [0, 0, 1, 0.76], why: '하단 24% 단색 띠 제거' },
};
