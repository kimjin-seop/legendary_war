// ===== 대사 장면 배경 매핑 보충(신규 생성 없음, 기존 대사 배경 재사용) — 2026-11-14 안아트 =====
// 대상: 메인 스토리 a1~a4(ch101~104) / ch30 일반 스테이지 st02~06 / ch11~24 의 s4~s10 공백.
// 근거 = database/data/*.json scene.bg 설명문. 키는 전부 manifest 의 대사용 그림 배경(bg.<set>.<name>, 1920x1080, 하단 대사창 어둡게 구움).
// bg.battle.*(320x100 도트 전투 띠)는 화풍·비율·대사창 가독 처리가 달라 대사 배경으로 쓰지 않는다.
// style_scene_bg.mjs SCENE_BG_MAP 맨 앞에 펼친다(기존 매핑이 항상 우선 = 빈 곳만 채움).
const pair = (prefix, n, pre, post = pre) => ({ [`${prefix}${n}_pre`]: pre, [`${prefix}${n}_post`]: post });
const A = (n) => `bg.archive.${n}`;

export const FILL_MAP = {
  // ---- 메인 1막(ch101): 시간의 서고 내부 ----
  a1_open: A('hall'),
  a1e1_pre: A('aisle'), a1e1_post: A('aisle'), // 열람실
  a1e2_pre: A('ink'), a1e2_post: A('ink'), // 필사실(먹통)
  a1e3_pre: A('aisle'), a1e3_post: A('deep'), // 좁은 복도 -> 닫힌 문
  a1e4_pre: A('hall'), a1e4_post: A('hall'), // 대출 카운터
  a1e5_pre: A('deep'), a1e5_post: A('deep'), // 빈 책 창고
  a1_end: A('dusk'), // 지도 탁상, 밤
  // ---- 메인 2막(ch102): 조선 산지·포구(임진년 전후) ----
  a2_open: 'bg.hwangsanbeol.plain', // 산 능선 풀밭
  a2e1_pre: 'bg.imjin.fortress', a2e1_post: 'bg.imjin.haengju_sunset', // 봉수대 -> 불 오른 봉우리
  a2e2_pre: 'bg.imjin.fleet_dawn', a2e2_post: 'bg.imjin.river', // 당항포 안개 수로 -> 갯벌 드러남
  a2e3_pre: 'bg.redcliff.river_road', a2e3_post: 'bg.redcliff.river_road', // 진 보급로 수레 줄
  a2e4_pre: 'bg.goryeo_khitan.fortress_wall', a2e4_post: 'bg.goryeo_khitan.fortress_wall', // 산성 성벽 안
  a2e5_pre: 'bg.salsu.hill_road', a2e5_post: 'bg.salsu.hill_road', // 산골 피난길 고개
  a2_end: A('hall'), // 지도 탁상, 이른 아침
  // ---- 메인 3막(ch103): 오를레앙·랭스 ----
  a3_open: A('hall'),
  a3e1_pre: 'bg.orleans.muster', a3e1_post: 'bg.orleans.city_gate',
  a3e2_pre: 'bg.orleans.patay_field', a3e2_post: 'bg.orleans.patay_field',
  a3e3_pre: 'bg.orleans.tourelles_bridge', a3e3_post: 'bg.orleans.tourelles_bridge', // 루아르 강안개
  a3e4_pre: A('aisle'), a3e4_post: A('aisle'), // 서기소 문서함(실내 서가 대체)
  a3e5_pre: 'bg.orleans.city_gate', a3e5_post: 'bg.orleans.city_gate', a3e5_post2: 'bg.orleans.city_gate', // 랭스 대성당 앞(석조 고딕 대체)
  a3_end: A('dusk'),
  // ---- 메인 4막(ch104): 사막 대상로 -> 서고 심층 7층 ----
  a4_open: A('hall'),
  a4e1_pre: 'bg.mongol.hexi_canyon', a4e1_post: 'bg.mongol.hexi_canyon',
  a4e2_pre: 'bg.holy_land.hattin_field', a4e2_post: 'bg.holy_land.hattin_field', // 마른 우물가
  a4e3_pre: A('deep'), a4e3_post: A('ink'),
  a4e4_pre: A('deep'), a4e4_post: A('deep'), // 7층 홀
  a4e5_pre: A('ink'), a4e5_post: A('aisle'),
  a4_ending: A('hall'), a4_epilogue: A('hall'),
  // ---- ch30 일반 스테이지 stage_02~06 ----
  ...pair('st0', 2, 'bg.goryeo_khitan.gwiju_plain', 'bg.hwangsanbeol.plain'), // 고구려 국경 서리 들판 -> 해 기운 들판
  ...pair('st0', 3, 'bg.nagashino.night_road', 'bg.salsu.hill_road'), // 안개 깊은 숲 -> 걷힌 숲길
  ...pair('st0', 4, 'bg.mediterranean.italy_ridge'), // 이탈리아 북부 겨울 평원·카르타고 진영
  ...pair('st0', 5, 'bg.mongol.hexi_canyon', 'bg.mongol.onon'), // 초원-사막 경계 -> 저녁 초원 천막
  ...pair('st0', 6, 'bg.holy_land.jerusalem_gate', 'bg.gaugamela.plain'), // 성채 앞 평지 -> 해 질 녘 들판
  // ---- ch11 고려-거란 ----
  ...pair('ch11_s', 5, 'bg.goryeo_khitan.gwiju_plain', 'bg.goryeo_khitan.camp'),
  ...pair('ch11_s', 6, 'bg.goryeo_khitan.fortress_wall'),
  ...pair('ch11_s', 7, 'bg.goryeo_khitan.gwiju_plain', 'bg.goryeo_khitan.camp'),
  ...pair('ch11_s', 8, 'bg.goryeo_khitan.camp', 'bg.goryeo_khitan.gwiju_plain'),
  ...pair('ch11_s', 9, 'bg.goryeo_khitan.gwiju_plain'),
  ...pair('ch11_s', 10, 'bg.goryeo_khitan.icedam'),
  // ---- ch12 적벽 ----
  ...pair('ch12_s', 5, 'bg.redcliff.river_road'),
  ...pair('ch12_s', 6, 'bg.redcliff.wu_fleet', 'bg.redcliff.yiling_gate'),
  ...pair('ch12_s', 7, 'bg.redcliff.north_bank', 'bg.redcliff.river_road'),
  ...pair('ch12_s', 8, 'bg.redcliff.river_road'),
  ...pair('ch12_s', 9, 'bg.redcliff.yiling_gate'),
  ...pair('ch12_s', 10, 'bg.redcliff.wu_fleet', 'bg.redcliff.north_bank'),
  // ---- ch13 황산벌·백강 ----
  ...pair('ch13_s', 4, 'bg.hwangsanbeol.sabi_river'),
  ...pair('ch13_s', 5, 'bg.hwangsanbeol.plain'),
  ...pair('ch13_s', 6, 'bg.hwangsanbeol.sabi_river'),
  ...pair('ch13_s', 7, 'bg.hwangsanbeol.plain'),
  ...pair('ch13_s', 8, 'bg.hwangsanbeol.silla_camp', 'bg.hwangsanbeol.plain'),
  ...pair('ch13_s', 9, 'bg.hwangsanbeol.silla_camp'),
  ...pair('ch13_s', 10, 'bg.hwangsanbeol.sabi_river'),
  // ---- ch14 살수 ----
  ...pair('ch14_s', 5, 'bg.salsu.liao_field'),
  ...pair('ch14_s', 6, 'bg.salsu.liao_field'),
  ...pair('ch14_s', 7, 'bg.salsu.liao_field'),
  ...pair('ch14_s', 8, 'bg.salsu.salsu_river'),
  ...pair('ch14_s', 9, 'bg.salsu.hill_road'),
  ...pair('ch14_s', 10, 'bg.salsu.salsu_river'),
  // ---- ch15 지중해(포에니) ----
  ...pair('ch15_s', 5, 'bg.mediterranean.zama_plain', 'bg.mediterranean.italy_ridge'),
  ...pair('ch15_s', 6, 'bg.mediterranean.zama_plain', 'bg.mediterranean.carthago_lagoon'),
  ...pair('ch15_s', 7, 'bg.mediterranean.italy_ridge'),
  ...pair('ch15_s', 8, 'bg.mediterranean.zama_plain'),
  ...pair('ch15_s', 9, 'bg.mediterranean.italy_ridge'),
  ...pair('ch15_s', 10, 'bg.mediterranean.zama_plain'),
  // ---- ch16 오를레앙 ----
  ...pair('ch16_s', 6, 'bg.orleans.fort_field', 'bg.orleans.city_gate'),
  ...pair('ch16_s', 7, 'bg.orleans.tourelles_bridge'),
  ...pair('ch16_s', 8, 'bg.orleans.fort_field', 'bg.orleans.city_gate'),
  ...pair('ch16_s', 9, 'bg.orleans.muster', 'bg.orleans.city_gate'),
  ...pair('ch16_s', 10, 'bg.orleans.city_gate', 'bg.orleans.muster'),
  // ---- ch17 가우가멜라(알렉산드로스 원정) ----
  ...pair('ch17_s', 5, 'bg.gaugamela.tigris_ford'),
  ...pair('ch17_s', 6, 'bg.gaugamela.tigris_ford', 'bg.gaugamela.retreat_road'),
  ...pair('ch17_s', 7, 'bg.gaugamela.tigris_ford'),
  ...pair('ch17_s', 8, 'bg.gaugamela.plain'),
  ...pair('ch17_s', 9, 'bg.gaugamela.retreat_road'),
  ...pair('ch17_s', 10, 'bg.gaugamela.camp_night', 'bg.gaugamela.plain'),
  // ---- ch18 몽골 ----
  ...pair('ch18_s', 9, 'bg.mongol.winter_steppe', 'bg.mongol.syr_river'), // 오트라르(시르다리야 강변 성)
  ...pair('ch18_s', 10, 'bg.mongol.pass', 'bg.mongol.onon'),
  // ---- ch19 성지 ----
  ...pair('ch19_s', 5, 'bg.holy_land.hattin_field'),
  ...pair('ch19_s', 6, 'bg.holy_land.jerusalem_gate'),
  ...pair('ch19_s', 7, 'bg.holy_land.jaffa_harbor', 'bg.holy_land.jerusalem_gate'),
  ...pair('ch19_s', 8, 'bg.holy_land.jerusalem_gate', 'bg.holy_land.hattin_field'),
  ...pair('ch19_s', 9, 'bg.holy_land.hattin_field'),
  ...pair('ch19_s', 10, 'bg.holy_land.arsuf_coast'),
  // ---- ch20 나가시노 ----
  ...pair('ch20_s', 4, 'bg.nagashino.mountain_fort'),
  ...pair('ch20_s', 5, 'bg.nagashino.shitara_field', 'bg.nagashino.night_road'),
  ...pair('ch20_s', 6, 'bg.nagashino.night_road', 'bg.nagashino.shitara_field'),
  ...pair('ch20_s', 7, 'bg.nagashino.shitara_field'),
  ...pair('ch20_s', 8, 'bg.nagashino.shitara_field'),
  ...pair('ch20_s', 9, 'bg.nagashino.night_road'),
  ...pair('ch20_s', 10, 'bg.nagashino.shitara_field', 'bg.nagashino.oda_camp'),
  // ---- ch21 레그니차 / ch22 파니파트 ----
  ...pair('ch21_s', 9, 'bg.legnica.mountain_road'),
  ...pair('ch21_s', 10, 'bg.legnica.castle_plain', 'bg.legnica.muddy_plain'),
  ...pair('ch22_s', 9, 'bg.panipat.fort_gate'),
  ...pair('ch22_s', 10, 'bg.panipat.fort_gate'),
  // ---- ch23 헤이스팅스 ----
  ...pair('ch23_s', 6, 'bg.hastings.ridge', 'bg.hastings.tent'),
  ...pair('ch23_s', 7, 'bg.hastings.pevensey'),
  ...pair('ch23_s', 8, 'bg.hastings.ridge', 'bg.hastings.tent'),
  ...pair('ch23_s', 9, 'bg.hastings.thames'),
  ...pair('ch23_s', 10, 'bg.hastings.thames'),
  // ---- ch24 투르 ----
  ...pair('ch24_s', 5, 'bg.tours.vienne_ford'),
  ...pair('ch24_s', 6, 'bg.tours.vienne_ford'),
  ...pair('ch24_s', 7, 'bg.tours.roman_road'),
  ...pair('ch24_s', 8, 'bg.tours.vienne_ford'),
  ...pair('ch24_s', 9, 'bg.tours.oak_slope', 'bg.tours.night_slope'),
  ...pair('ch24_s', 10, 'bg.tours.vienne_ford'),
};
