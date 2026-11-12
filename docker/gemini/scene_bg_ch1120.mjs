// 대사 장면 배경 2차(안아트 2026-11-03, 팀장 승인 38장): 서가 ch11~17·19·20·999 야외/전용 장면. 서고 장면은 scene_bg_ch2124.mjs EXTRA_MAP(bg.archive.*).
// style_scene_bg.mjs 가 import 해 SCENE_BGS·SCENE_BG_MAP 에 덧붙임(scene_bg_ch2124.mjs 와 같은 방식). 근거 = resources/js/game/data/dialogue/ch*.json scene.bg 설명문.
// 규칙: 사람·동물·글자·깃발 문양·종교 상징 없음(진영은 빈 천막·수레·방패만), 시대 건축 일반화(verify). 생성 순서 ORDER2.
const NP = '사람·말·코끼리·낙타 등 생물은 그리지 않음(빈 풍경)';
const D = {
  // ---- ch11 고려-거란(993~1019) ----
  goryeo_camp: ['goryeo_khitan', 'camp', `강 북쪽 들판의 이른 아침 진영: 낮은 구릉 아래 흰 무명 천막 여러 동과 나무 목책, 천막 앞 빈 말뚝과 무지 깃대, 멀리 얼음이 낀 강과 겨울 산줄기. ${NP}`, { note: 'ch11_s1 pre/post 공용' }],
  goryeo_fortress: ['goryeo_khitan', 'fortress_wall', `강가 성벽 위의 이른 아침: 화면 가운데로 이어지는 돌·흙 성벽과 여장(성가퀴), 성벽 위 무지 군기, 성 밖 들판 멀리 흙먼지가 이는 지평선. 화면 안에 밝기가 다른 사각형 영역·패널·액자 경계 없이 하늘과 풍경이 끊김 없이 이어짐. 한국 고려식 성곽(조선 후기 화성식 금지). ${NP}`, { verify: true, note: 'ch11_s2 공용' }],
  goryeo_icedam: ['goryeo_khitan', 'icedam', `겨울 새벽 얼어붙은 강가: 넓은 강에 얇은 얼음과 물이 섞여 있고, 상류 쪽에 소가죽으로 싼 흙자루를 쌓아 막은 둑과 둑에 묶인 굵은 가죽 끈, 강 건너 낮은 성곽 실루엣. ${NP}`, { verify: true, note: 'ch11_s3 공용(흥화진 물막이 전승)' }],
  goryeo_plain: ['goryeo_khitan', 'gwiju_plain', `북쪽 찬바람이 부는 넓은 겨울 벌판: 마른 풀과 얼어붙은 땅, 화면 가운데 멀리 낮은 언덕과 무지 군기 두 무리가 마주 선 자리, 잿빛 구름. ${NP}`, { note: 'ch11_s4 공용' }],
  // ---- ch12 적벽(208) ----
  redcliff_road: ['redcliff', 'river_road', `새벽 강가 흙길: 화면 가운데로 이어지는 흙길 위 빈 나무 수레 여러 대, 왼쪽 갈대 우거진 강, 뒤쪽 지평선 먼지. ${NP}`, { note: 'ch12_s1 공용' }],
  redcliff_fleet: ['redcliff', 'wu_fleet', `넓은 강 위 선단: 줄지어 묶인 후한 말 목조 전선 수십 척(낮은 선루·무지 돛), 맞은편 북쪽 강변에 흐린 천막 무리. ${NP}`, { verify: true, note: 'ch12_s2_pre·s3_pre 공용' }],
  redcliff_bank: ['redcliff', 'north_bank', `해 질 녘 장강 북쪽 강둑: 버려진 창대·방패·수레가 흩어진 강둑, 멀리 북쪽 기슭에 빽빽이 묶인 배 무리. ${NP}`, { note: 'ch12_s2_post·s4_pre 공용' }],
  redcliff_fire: ['redcliff', 'burning_river', `새벽 직전 장강: 북쪽 기슭이 온통 붉은 불빛으로 번지고 연기가 하늘로 오름(폭발·시신 없음), 검은 강물 위에 불빛이 길게 비침. ${NP}`, { note: 'ch12_s3_post' }],
  redcliff_yiling: ['redcliff', 'yiling_gate', `이른 오후의 성 앞: 화면 가운데 후한 말 흙·돌 성벽과 열린 나무 성문, 성문 위 낮은 기와 문루, 멀리 강 위에 배 몇 척. ${NP}`, { verify: true, note: 'ch12_s4_post' }],
  // ---- ch20 나가시노(1575) ----
  nagashino_night: ['nagashino', 'night_road', `비 내리는 밤의 산길: 젖은 흙길과 길가 삼나무, 멀리 언덕 위 성의 작은 불빛, 빗줄기와 웅덩이. ${NP}`, { note: 'ch20_s1_pre' }],
  nagashino_camp: ['nagashino', 'oda_camp', `새벽의 본진: 흰·검은 세로 줄무늬 진막(무문)으로 둘러친 마당, 빈 접이 의자와 낮은 탁자, 진막 너머 안개 낀 구릉. 화면 안에 밝기가 다른 사각형 영역·패널·액자 경계·위아래 단색 띠 없이 땅과 하늘이 끊김 없이 이어짐. 문장 없음. ${NP}`, { verify: true, note: 'ch20_s1_post' }],
  nagashino_field: ['nagashino', 'shitara_field', `이른 아침의 들판과 목책: 화면 가운데를 가로지르는 나무 마방책(말뚝과 가로대) 여러 줄, 그 앞 작은 개울과 논, 뒤쪽 낮은 구릉. ${NP}`, { verify: true, note: 'ch20_s2_pre·s3 공용' }],
  nagashino_fort: ['nagashino', 'mountain_fort', `새벽 산길의 보루: 산 중턱 나무 목책 보루에서 연기가 오르고, 굽은 산길과 삼나무 숲. ${NP}`, { note: 'ch20_s2_post' }],
  // ---- ch16 오를레앙(1429) ----
  orleans_muster: ['orleans', 'muster', `안개 낀 이른 아침 성 밖 집결지: 빈 보급 수레 여러 대가 줄지어 선 흙길, 멀리 성 실루엣과 포플러 나무. ${NP}`, { note: 'ch16_s1_pre' }],
  orleans_gate: ['orleans', 'city_gate', `저녁 성문 앞: 15세기 프랑스 도시 성벽과 둥근 성탑, 열린 성문, 길 양쪽에 꽂힌 횃불. 문장·십자가 없음. ${NP}`, { verify: true, note: 'ch16_s1_post' }],
  orleans_fort: ['orleans', 'fort_field', `요새 앞 들판: 들판 너머 목책과 흙 보루(바스티유), 연기 한 줄, 멀리 강과 도시 성벽. ${NP}`, { note: 'ch16_s2·s3 공용' }],
  orleans_bridge: ['orleans', 'tourelles_bridge', `강을 가로지르는 긴 돌다리와 다리 끝 탑 요새(투렐), 해자 가장자리와 강 위 안개. ${NP}`, { verify: true, note: 'ch16_s4 공용' }],
  orleans_patay: ['orleans', 'patay_field', `안개 낀 들판과 숲 가장자리: 젖은 풀밭, 숲에서 날아오르는 새 떼(작게), 부러진 말뚝 몇 개. ${NP.replace('·코끼리·낙타', '')}`, { note: 'ch16_s5 공용' }],
  // ---- ch13 황산벌(660) ----
  hwangsan_camp: ['hwangsanbeol', 'silla_camp', `저녁 군막: 천막 사이 무지 군기, 빈 짚신과 창 거치대, 멀리 좁은 협곡. ${NP}`, { note: 'ch13_s1_pre·s2_pre 공용' }],
  hwangsan_plain: ['hwangsanbeol', 'plain', `낮은 언덕 세 개가 이어진 벌판: 풀밭과 언덕 위 꺾인 깃대, 부러진 창대 몇 개, 저녁 노을. ${NP}`, { note: 'ch13_s1_post·s2_post 공용' }],
  hwangsan_sabi: ['hwangsanbeol', 'sabi_river', `넓은 강변과 강 건너 언덕 위 성(백제 산성), 강가 갈대, 맑은 정오. ${NP}`, { verify: true, note: 'ch13_s3 공용' }],
  // ---- ch14 살수(612) ----
  salsu_field: ['salsu', 'liao_field', `요하 동쪽 들판: 빈 곡식 창고와 초가 마을, 마을 앞 빈 짐수레 줄, 멀리 흙 성벽. ${NP}`, { note: 'ch14_s1 공용' }],
  salsu_hills: ['salsu', 'hill_road', `구릉 사이 흙길: 흙먼지 이는 길과 소나무 구릉, 멀리 평양 방향 산줄기. ${NP}`, { note: 'ch14_s2·s3 공용' }],
  salsu_river: ['salsu', 'salsu_river', `넓고 천천히 흐르는 강과 갈대밭, 건너편 기슭의 낮은 들판, 이른 아침 안개. ${NP}`, { note: 'ch14_s4 공용' }],
  // ---- ch15 지중해(218~202 BCE) ----
  med_ridge: ['mediterranean', 'italy_ridge', `이탈리아 남부 구릉 능선: 능선을 따라 빈 천막과 방책, 아래 넓은 평야와 먼 먼지. ${NP}`, { note: 'ch15_s1 공용' }],
  med_lagoon: ['mediterranean', 'carthago_lagoon', `해안 석호와 갈대, 석호 건너 언덕 위 성벽 도시(신카르타고), 이른 아침. ${NP}`, { verify: true, note: 'ch15_s2 공용' }],
  med_africa: ['mediterranean', 'africa_coast', `북아프리카 해안 평원: 해안에 정박한 고대 갤리선 무리(무지 돛), 모래 해변과 마른 평원. 화면 안에 밝기가 다른 사각형 영역·패널·액자 경계·위아래 단색 띠 없이 하늘과 땅이 끊김 없이 이어지는 한 장면. ${NP}`, { note: 'ch15_s3 공용' }],
  med_zama: ['mediterranean', 'zama_plain', `넓은 건조 평원: 마른 풀과 흙, 멀리 낮은 언덕, 흩어진 창과 방패 몇 개. ${NP}`, { note: 'ch15_s4 공용' }],
  // ---- ch17 가우가멜라(331 BCE) ----
  gauga_ford: ['gaugamela', 'tigris_ford', `물살 센 큰 강의 여울: 자갈 여울과 흙빛 강물, 건너편 낮은 기슭과 마른 들판. 화면 전체가 하나의 연속된 장면: 밝기가 다른 사각형 영역·가운데 패널·액자 경계·위아래 단색 띠·좌우 어두운 기둥 띠 없음. ${NP}`, { note: 'ch17_s1 공용' }],
  gauga_camp: ['gaugamela', 'camp_night', `평원 앞 야영지 저녁: 길게 늘어선 모닥불과 빈 천막, 멀리 지평선의 적 진영 불빛. ${NP}`, { note: 'ch17_s2 공용' }],
  gauga_plain: ['gaugamela', 'plain', `먼지 낀 넓은 평원의 새벽: 평탄한 땅, 지평선에 끝없는 무지 깃발 줄, 부서진 전차 바퀴 몇 개. 화면 전체가 하나의 연속된 장면: 밝기가 다른 사각형 영역·가운데 패널·액자 경계·위아래 단색 띠·좌우 어두운 기둥 띠 없음. ${NP}`, { note: 'ch17_s3 공용' }],
  gauga_retreat: ['gaugamela', 'retreat_road', `해 질 녘 퇴각로: 언덕 너머로 이어지는 흙길과 버려진 수레·짐, 낮게 걸린 별. 화면 전체가 하나의 연속된 장면: 밝기가 다른 사각형 영역·가운데 패널·액자 경계·위아래 단색 띠·좌우 어두운 기둥 띠 없음. ${NP}`, { note: 'ch17_s4 공용' }],
  // ---- ch19 성지(1187~1192) ----
  holy_hattin: ['holy_land', 'hattin_field', `건조한 들판과 두 봉우리 언덕(하틴), 멈춰 선 빈 물 항아리 수레, 먼지 낀 아침. 화면 전체가 하나의 연속된 장면: 밝기가 다른 사각형 영역·가운데 패널·액자 경계·위아래 단색 띠·좌우 어두운 기둥 띠 없음. ${NP}`, { verify: true, note: 'ch19_s1 공용' }],
  holy_jerusalem: ['holy_land', 'jerusalem_gate', `밝은 석회암 성벽과 성문, 성문 앞 빈 피난 수레, 이른 아침 빛. 십자가·종교 상징 없음. ${NP}`, { verify: true, note: 'ch19_s2 공용' }],
  holy_arsuf: ['holy_land', 'arsuf_coast', `해안 숲 옆 벌판과 길게 이어진 해안선, 잔잔한 지중해. ${NP}`, { note: 'ch19_s3 공용' }],
  holy_jaffa: ['holy_land', 'jaffa_harbor', `새벽 항구 해안: 석조 방파제와 정박한 배 몇 척, 해안가 빈 천막. ${NP}`, { note: 'ch19_s4 공용' }],
  // ---- ch999 ----
  finale_signal: ['finale', 'signal_room', `시간의 서고 안 높은 천장의 둥근 방: 원을 이룬 봉수대·횃불 걸이·깃대·북·호각이 놓인 탁자(글자 없음), 서가로 둘러싼 벽, 안쪽 문. ${NP}`, { refs: ['public/assets/raw/cutscene/il01_hall.jpg'], note: 'ch999_s2 공용' }],
  finale_white: ['finale', 'white_room', `천장도 바닥도 흰 종이처럼 비어 있는 방, 가운데 아무것도 적히지 않은 큰 종이 한 장이 서 있음, 벽 가장자리에 희미한 책장 윤곽. 글자 없음. ${NP}`, { refs: ['public/assets/raw/cutscene/il01_hall.jpg'], note: 'ch999_s4 공용' }],
};
export const ORDER2 = Object.keys(D);
export const SHELF2 = { ch11: ORDER2.filter((k) => k.startsWith('goryeo_')), ch12: ORDER2.filter((k) => k.startsWith('redcliff_')), ch20: ORDER2.filter((k) => k.startsWith('nagashino_')),
  ch16: ORDER2.filter((k) => k.startsWith('orleans_')), ch13: ORDER2.filter((k) => k.startsWith('hwangsan_')), ch14: ORDER2.filter((k) => k.startsWith('salsu_')),
  ch15: ORDER2.filter((k) => k.startsWith('med_')), ch17: ORDER2.filter((k) => k.startsWith('gauga_')), ch19: ORDER2.filter((k) => k.startsWith('holy_')), ch999: ORDER2.filter((k) => k.startsWith('finale_')) };
export function extraJobs2(job) { return ORDER2.map((id) => { const [set, name, d, ex] = D[id]; return job(id, set, name, d, ex); }); }
const k = (id) => `bg.${D[id][0]}.${D[id][1]}`;
export const CROP2 = { goryeo_fortress: { box: [0, 0.122, 1, 0.874], why: '재생성본 상하 단색 띠 제거(1차는 가운데 사각 패널로 기각)' }, goryeo_icedam: { box: [0, 0.096, 1, 0.727], why: '상단 9.6%·하단 27% 단색 띠 제거' },
  redcliff_road: { box: [0, 0.122, 1, 0.878], why: '상하 11.8% 단색 띠 제거' },
  nagashino_field: { box: [0, 0, 1, 0.94], why: '하단 5.7% 단색 띠 제거' },
  nagashino_camp: { box: [0, 0, 1, 0.72], why: '재생성본도 하단 27.6% 어두운 사각 띠 → 잘라냄(재생성 1회 소진)' },
  hwangsan_plain: { box: [0, 0.122, 1, 0.876], why: '상단 11.8%·하단 11.9% 단색 띠 제거' },
  salsu_field: { box: [0, 0.07, 1, 0.93], why: '상단 6.6%·하단 6.6% 단색 띠 제거' },
  med_ridge: { box: [0, 0, 1, 0.685], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  med_lagoon: { box: [0, 0.122, 1, 0.878], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  med_zama: { box: [0, 0.125, 1, 0.86], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  orleans_muster: { box: [0, 0.117, 1, 0.725], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  orleans_gate: { box: [0, 0.134, 1, 0.717], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  orleans_fort: { box: [0, 0, 1, 0.733], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  orleans_bridge: { box: [0, 0, 1, 0.955], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  gauga_camp: { box: [0, 0, 1, 0.717], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  holy_jerusalem: { box: [0, 0.117, 1, 0.712], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  holy_arsuf: { box: [0, 0, 1, 0.743], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  holy_jaffa: { box: [0, 0.102, 1, 0.75], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  finale_signal: { box: [0, 0.112, 1, 0.87], why: '모델이 그린 상하 단색 띠·어두운 사각 패널 제거' },
  gauga_plain: { box: [0, 0, 1, 0.889], why: '하단 11% 단색 띠 제거' },
  gauga_retreat: { box: [0.252, 0.104, 0.748, 0.669], why: '1차·재생성 모두 가운데 밝은 사각 패널 → 패널 안쪽만 사용(약 1.4배 확대)' } };
export const EXTRA_MAP2 = {
  ch11_s1_pre: k('goryeo_camp'), ch11_s1_post: k('goryeo_camp'), ch11_s2_pre: k('goryeo_fortress'), ch11_s2_post: k('goryeo_fortress'), ch11_s3_pre: k('goryeo_icedam'), ch11_s3_post: k('goryeo_icedam'), ch11_s4_pre: k('goryeo_plain'), ch11_s4_post: k('goryeo_plain'),
  ch12_s1_pre: k('redcliff_road'), ch12_s1_post: k('redcliff_road'), ch12_s2_pre: k('redcliff_fleet'), ch12_s3_pre: k('redcliff_fleet'), ch12_s2_post: k('redcliff_bank'), ch12_s4_pre: k('redcliff_bank'), ch12_s3_post: k('redcliff_fire'), ch12_s4_post: k('redcliff_yiling'),
  ch20_s1_pre: k('nagashino_night'), ch20_s1_post: k('nagashino_camp'), ch20_s2_pre: k('nagashino_field'), ch20_s3_pre: k('nagashino_field'), ch20_s3_post: k('nagashino_field'), ch20_s2_post: k('nagashino_fort'),
  ch16_s1_pre: k('orleans_muster'), ch16_s1_post: k('orleans_gate'), ch16_s2_pre: k('orleans_fort'), ch16_s2_post: k('orleans_fort'), ch16_s3_pre: k('orleans_fort'), ch16_s3_post: k('orleans_fort'), ch16_s4_pre: k('orleans_bridge'), ch16_s4_post: k('orleans_bridge'), ch16_s5_pre: k('orleans_patay'), ch16_s5_post: k('orleans_patay'),
  ch13_s1_pre: k('hwangsan_camp'), ch13_s2_pre: k('hwangsan_camp'), ch13_s1_post: k('hwangsan_plain'), ch13_s2_post: k('hwangsan_plain'), ch13_s3_pre: k('hwangsan_sabi'), ch13_s3_post: k('hwangsan_sabi'),
  ch14_s1_pre: k('salsu_field'), ch14_s1_post: k('salsu_field'), ch14_s2_pre: k('salsu_hills'), ch14_s2_post: k('salsu_hills'), ch14_s3_pre: k('salsu_hills'), ch14_s3_post: k('salsu_hills'), ch14_s4_pre: k('salsu_river'), ch14_s4_post: k('salsu_river'),
  ch15_s1_pre: k('med_ridge'), ch15_s1_post: k('med_ridge'), ch15_s2_pre: k('med_lagoon'), ch15_s2_post: k('med_lagoon'), ch15_s3_pre: k('med_africa'), ch15_s3_post: k('med_africa'), ch15_s4_pre: k('med_zama'), ch15_s4_post: k('med_zama'),
  ch17_s1_pre: k('gauga_ford'), ch17_s1_post: k('gauga_ford'), ch17_s2_pre: k('gauga_camp'), ch17_s2_post: k('gauga_camp'), ch17_s3_pre: k('gauga_plain'), ch17_s3_post: k('gauga_plain'), ch17_s4_pre: k('gauga_retreat'), ch17_s4_post: k('gauga_retreat'),
  ch19_s1_pre: k('holy_hattin'), ch19_s1_post: k('holy_hattin'), ch19_s2_pre: k('holy_jerusalem'), ch19_s2_post: k('holy_jerusalem'), ch19_s3_pre: k('holy_arsuf'), ch19_s3_post: k('holy_arsuf'), ch19_s4_pre: k('holy_jaffa'), ch19_s4_post: k('holy_jaffa'),
  ch999_s2_pre: k('finale_signal'), ch999_s2_post: k('finale_signal'), ch999_s4_pre: k('finale_white'), ch999_s4_post: k('finale_white'),
};
// 장면 -> 서가 접두(생성 완료 서가만 매핑하려고 style_scene_bg.mjs 에서 raw 존재로 걸러 씀)
export const SCENE_JOB2 = Object.fromEntries(Object.entries(EXTRA_MAP2).map(([s, key]) => [s, ORDER2.find((id) => `bg.${D[id][0]}.${D[id][1]}` === key)]));
