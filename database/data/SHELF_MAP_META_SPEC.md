# 서가 지도 메타 명세 (shelf_map_meta.json v1)

작성: 송서사 / 2026-11-01 / 문기획 요구사항 v0.1 데이터 파트. 기존 파일·앱 코드·DB는 수정하지 않았다.

## 1. 스키마

서가(shelves[]): shelf_code, chapter, status(active|placeholder), name_ko, name_provisional(placeholder만), era_label, region_label, summary, map.focus{x,y}, map.zoom, heroes[{code, role(key|companion|enemy)}], locked_reveal, evidence_level, note.

스테이지(stages[]): stage_code, shelf_code, title, year_label, virtual, adapted, adapted_note, map{pin{x,y}|null, place_label, radius|null, evidence_level(confirmed|accepted|verify|invented), source}.

- 좌표: 등장방형, x=(경도+180)/360, y=(90-위도)/180, 소수 4자리.
- zoom = 360 / 화면에 보이는 경도폭(도). 1=세계 전체, 4=약 90도, 12=약 30도, 45=약 8도, 144=약 2.5도.
- radius: 정규화 x 단위(지도 폭 대비). 0.0003 약 0.11도(약 10km), 0.0010 약 0.36도(약 35km). 핀 확정이면 작게, 불확실하면 크게 그려 "대략 이 부근" 표시.
- virtual:true 스테이지는 pin null. 지도는 서고 허브 아이콘 또는 직전 스테이지 핀에서 서고 연결선으로 표현(UI 판단).
- 화면 표시 가능 필드: name_ko, era_label, region_label, summary, year_label, place_label. 나머지(note, source, evidence_level, adapted_note, virtual, 좌표 근거)는 제작용 비표시.
- heroes의 enemy 코드는 heroes.json 등재 인물만 가능. ch1의 일본 측 지휘관은 미등재라 enemy 항목 없음.
- 문구는 WRITING_RULES.md를 따른다.
- (v0.2 정정, 2026-11-01) 라벨 원칙: 현대 국가명을 피하고 해당 연도 시점의 당대 국가·세력명을 쓴다(조선·명·일본(도요토미 정권), 고려·거란, 로마 공화정·카르타고 등). 중립 원칙은 "영토 분쟁·현대 정치 민감 표기 회피"로 정정: 독도·동해·대만·크림 등 현대 분쟁 지명의 현대적 라벨은 넣지 않는다. 최상위 `label_policy` 필드에도 기록.
- 추가 필드(서가별, 기존 필드 삭제 없음):
  - `period`: `{as_of, state_label[], note}`. state_label은 세계 줌에서 보일 당대 세력 라벨 후보(예: ch1 조선/명/일본). as_of는 연도 시점 표기.
  - `factions[]`: `{id, name_ko, side(ally|enemy|neutral), label_pos{x,y}, evidence_level, note}`. 서가 줌에서 코드로 올리는 세력 라벨. label_pos는 등장방형 정규화 좌표이며 국경선이 아닌 대략적 방향 표시. side는 서가 key 영웅 시점 가안. note는 연도 시점 국호와 이설(verify) 기록(비표시).
- region_label과 ch1 스테이지 place_label을 당대 국가·세력명 포함 문구로 갱신(예: "조선 거제도 옥포만"). 서가 11~20은 placeholder 수준으로만 반영했고 세부 정합은 후순위.
- (v0.2 추가 정정) 지역·장소명도 as_of 연도 시점의 당대 행정구역·지명으로 쓴다(예: 조선 경상도 진주목 진주성, 후한 형주 강하군, 호라즘 제국·트란스옥시아나, 미카와국 나가시노). 현대 지리 용어(한반도·동아시아·서유럽·중앙아시아·메소포타미아·레반트·루아르 강변 등)는 화면 표시 필드(region_label, place_label, period, factions)에 쓰지 않는다. 현대 지명은 개발 참고용 `modern_ref`(서가·스테이지 map)에만 보관하며 FE는 읽지 않고 화면에 노출하지 않는다. 비표시 필드 목록에 modern_ref 추가. 시점에 따라 지명이 달라지는 경우 as_of 연도 기준(예: 한산도 통제영은 1593년 설치라 1592년 라벨에서 제외), 이설은 verify.
- region_label과 place_label은 20자 안팎으로 간결화했다.
- 백업: shelf_map_meta.json.bak-state-20261101(1차), shelf_map_meta.json.bak-place-20261101(2차 직전본).

## 2. 내용 요약

ch1 스테이지 10개: 실지리 핀 8개(s1~s7, s9), 서고 허구 2개(s8, s10)는 pin null. 모두 adapted:true(이순신 등 영웅 편성이 만약에 연출). 서가 11~20은 status:placeholder(잠금 예고).

근거 수준 분포(스테이지 10개): confirmed 5(s1,s4,s6,s7,s9), accepted 1(s3), verify 2(s2,s5), invented 2(s8,s10).
서가 11개(ch1 + placeholder 10개): confirmed 5(ch1,ch15,ch16,ch19,ch20), accepted 6(ch11,ch12,ch13,ch14,ch17,ch18).

## 3. 지도 에셋용 핵심 좌표 (안아트)

지도에는 라벨 없이 핀만 올리고 코드로 식별한다.

| 코드 | x | y | 위경도 | 비고 |
|---|---|---|---|---|
| ch1_s1 | 0.8575 | 0.3061 | 34.894N 128.689E | 확정 |
| ch1_s2 | 0.8563 | 0.3037 | 35.33N 128.28E | verify, 반경 0.0010 |
| ch1_s3 | 0.8570 | 0.3069 | 34.762N 128.503E | 반경 0.0006 |
| ch1_s4 | 0.8558 | 0.3045 | 35.189N 128.077E | 확정 |
| ch1_s5 | 0.8493 | 0.2832 | 39.02N 125.74E | verify, 반경 0.0008 |
| ch1_s6 | 0.8523 | 0.2911 | 37.596N 126.829E | 확정 |
| ch1_s7 | 0.8552 | 0.3059 | 34.945N 127.876E | 확정 |
| ch1_s9 | 0.8509 | 0.3080 | 34.568N 126.308E | 확정 |
| ch1_s8, s10 | 없음 | 없음 | 서고 허브 | 비지리 |

서가 포커스(focus / zoom, 2026-11-01 핀 수정: ch1 남해만 34.72N 128.20E, ch11 의주 40.20N 124.54E, ch14 요동 41.27N 123.17E): ch1 0.8561,0.3071 / 45. ch11 0.8459,0.2767 / 30. ch12 0.8153,0.3333 / 25. ch13 0.8531,0.2989 / 40. ch14 0.8421,0.2707 / 30. ch15 0.5347,0.2917 / 12. ch16 0.5069,0.2389 / 25. ch17 0.6203,0.2978 / 20. ch18 0.6806,0.2667 / 6. ch19 0.5986,0.3167 / 25. ch20 0.8822,0.3057 / 18.

필요 줌 단계 제안:
1. Z1 세계 전체(zoom 1): 서가 클러스터 하이라이트.
2. Z2 대륙/해역(zoom 4~6): ch18 등 넓은 서가의 진입.
3. Z3 지역(zoom 12~25): ch11~17, 19, 20 서가 포커스.
4. Z4 국지(zoom 40~45): ch1, ch13 서가 포커스. 한반도 남해안 핀 간격이 매우 촘촘하다(s1,s3,s4,s7 사이 x 약 0.002, y 약 0.003. 세계 지도 16384px 폭이면 약 30~50px).
5. Z5 클러스터(zoom 약 144): ch1 남해안(s1~s4, s7) 핀 분리용. 한반도 남부 고해상 타일이 필요하다.

권고: 세계 지도 한 장으로 Z4 이상을 만들면 용량이 지나치므로 한반도 남해안(경도 126~129.5, 위도 34~36)은 별도 고해상 인셋 또는 타일을 두고, 서가 11~20은 Z3까지로 충분하다(잠금 예고 상태).

## 4. 열람 출처

- Battle of Okpo, Battle of Hansan Island, Battle of Myeongnyang, Battle of Noryang, Siege of Jinju (1592), Battle of Haengju: en.wikipedia.org 해당 문서 infobox 좌표(2026-11-01 열람).
- Uiryeong County: 군 전체 좌표만 확인, 정암진 지점 좌표는 없음.
- Siege of Pyongyang (1593): 문서에 좌표 없음.
- campaign_ch1_outline.json, heroes.json, SHELF_11_GORYEO_KHITAN.md, WRITING_RULES.md.
- 서가 11~20 좌표는 웹 열람 없이 일반 지식으로 근사한 값이다(placeholder 용도).

## 5. verify 및 사람 확인 항목

1. ch1_s2 정암진 핀: 정확 지점 미확인(의령군 전체 좌표만 확인). 지도 자료로 재확인.
2. ch1_s5 평양성 핀: 위키 좌표 없음, 일반 지식 값.
3. ch1_s3 한산도 핀: 위키는 한산도 동쪽 해안. 전투 해역과 견내량 유인 출발지의 분리 표현 여부.
4. 서가 11 key 불일치: 기획표 강감찬 key vs SHELF_11_GORYEO_KHITAN.md 서희 key. 문기획 확정 필요(JSON은 기획표 따름).
5. 서가 13: 선덕(647 사망)은 660년 황산벌과 시대 불일치. 동반 영웅 제외 또는 서가 내 시대 분리 결정 필요.
6. 서가 20: 다케다 신겐(1573 사망)은 나가시노(1575) 상대가 아님(상대는 다케다 가쓰요리). 시대 정의 또는 영웅 배치 재검토.
7. 서가 12 적벽 위치(두 설), 서가 14 살수=청천강 비정, 서가 17 가우가멜라 위치(텔 고멜 설), 서가 11 귀주 정확 좌표, 서가 15 자마 위치, 서가 18 구체 전장.
8. 서가 15, 19 key/role: 한니발-스키피오, 살라딘-리처드는 대치 관계라 role은 가안.
9. 서가 17: 다리우스 3세는 heroes.json 미등재(darius_i는 다른 인물), enemy 항목 없음.
10. 서가 11~20의 name_ko는 모두 가안(name_provisional:true). 서가 11~20의 summary 문구는 문기획 확정 전 임시 문장.
11. 이름과 호칭은 한국어 UI 라벨 확인 전. 프로젝트 CLAUDE.md의 Laravel Boost 설치 지침은 이번 작업 범위 밖이라 수행하지 않았다.

## 6. 검증

셸 도구가 없어 docker node의 JSON.parse를 실행하지 못했다. JSON 문법은 육안 검증이며, 적용 전 파서로 한 번 검증이 필요하다.

## 7. 준비 중(미리보기) 서가 표시 규칙 (v0.3, 2026-11-01)

대상: ch11~ch20 (tutorial 제외). 스키마 변경 없이 필드 추가·값 채우기만 했다.

### 7.1 상태 필드
- `shelves[].status` 값에 `preview`를 추가한다(기존 `active`, `placeholder`). ch11~ch20은 `preview`로 바꿨다. `placeholder`는 지도 예고도 없는 완전 잠금용으로 남겨 둔다.
- shelf_territories.json의 `campaigns[].status`도 같은 값(`preview`)이다. 두 파일의 status는 항상 일치시킨다.
- FE 규칙: `status:'preview'`이면 지도 마커·포커스 이동·영토 색칠(`preview_faction_ids`)·국호 판·영웅 초상화 칩·요약을 `active`와 동일하게 보여 준다. 다른 점은 `출정`/`복습` 버튼만 비활성(disabled)으로 두고 '준비 중' 라벨을 붙이는 것 하나다. '준비 중' 문구는 FE 상수로 두며 서가별 데이터 필드는 두지 않았다. 스테이지 진입, 진행도 저장, 보상은 모두 막는다.
- 활성화 절차: status를 `active`로 바꾸고, territories의 `preview_faction_ids/preview_priority`를 `faction_ids/priority`로 옮긴 뒤 `name_provisional`을 제거하며 시점을 재검수한다.

### 7.2 미리보기용 추가 필드(ch11~ch20)
- `summary_lines`: 화면 표시용 요약 3줄(문자열 3개). 기대감을 주되 확인된 사건(연도 포함)만 단정하고, 불확실한 전승은 '전한다'로 표현. 스포일러(전투 결과·인물 사망)는 쓰지 않았다. 기존 `summary`는 유지(목록 한 줄 요약용).
- `heroes[].name_ko`: 영웅 칩 표시 이름(heroes.json의 name_ko와 동일). `code`는 heroes.json·manifest `portrait.<code>` 키와 일치.
- 기존 필드(era_label, region_label, map.focus/zoom, name_ko)는 그대로 사용. 마커 좌표(map.focus)와 stages[]는 수정하지 않았다.
- ch18만 추가: `subtitle_ko`(옛 가제 '초원의 서정'), `heroes_pending[]`(초상화 없는 NPC, FE 칩 대상 아님), `map.origin_pin`(오논·케룰렌 약 48N 108E), `map.focus_proposal`(미리보기 시야안, 채택 전까지 FE 미사용).

### 7.3 초상화 대조 결과(heroes.json, public/assets/manifest.json 읽기만)
- ch11~ch20 heroes[]에 쓰인 영웅 코드 21종(gang_gamchan, seo_hui, zhou_yu, zhuge_liang, liu_bei, sun_quan, cao_cao, kim_yusin, seondeok, eulji_mundeok, hannibal, scipio_africanus, fabius_maximus, joan_of_arc, alexander, genghis_khan, saladin, richard_i, oda_nobunaga, tokugawa_ieyasu, takeda_shingen)은 모두 heroes.json에 있고 manifest에 `portrait.<code>` 키가 있다. 초상화가 없는 코드: 없음.
- ch18 보조 장수 무칼리·수부타이·제베·보르추(npc_muqali, npc_subutai, npc_jebe, npc_boorchu)는 npc_roster_v3.json에만 있고 heroes.json·manifest.json 초상화가 없다(후속: 안아트가 preview 조각으로 초상화를 제작, 미병합. 부록 A 비고 참조). 그래서 `heroes[]`가 아닌 `heroes_pending[]`에 두었다(초상화 에셋이 생기면 heroes[]로 이동).
  - 2026-11-02 갱신: 초상화가 manifest.json에 병합돼 4명 모두 `heroes[]`로 이동했다(`heroes_pending[]`은 ch18에서 제거). 영웅 데이터는 새로 만들지 않았다 — 이미 npc_roster_v3.json 기준 `heroes` 테이블에 campaign_only NPC 행(`game:seed-imjin10 --with-npc`)으로 있으므로 code(npc_*)를 유지하고, 칩 초상은 `portrait_key`(portrait.mukhali/subutai/jebe/borchu)로 연결한다. FE 별칭 `npc_muqali -> mukhali`(assets.js)도 유지.
- ch1 영웅 코드는 이번에 대조하지 않았다.

### 7.4 사람 확인 항목(미리보기 노출 전)
1. ch13 선덕여왕(647년 사망, 660년과 불일치), ch20 다케다 신겐(1573년 사망, 1575년 전투 상대는 가쓰요리)이 칩으로 노출된다. 문기획 결정 필요.
2. ch18 표기: 서가 제목·heroes.json UI 라벨 모두 '칭기즈 칸'으로 통일 완료(사용자 결정).
3. ch19 1192년 협정 명칭(야파 조약 vs 라믈라 조약) verify. summary_lines에는 명칭 미사용.
4. 요약 3줄과 이름은 모두 가제(name_provisional)이며 문기획 확정 전 임시 문장이다.

## 부록 A. ch18 '칭기즈 칸과 몽골 울루스' 스테이지 개요 (문기획 권장 확정안 8개, 2026-11-02 갱신)

확정 표기: 서가명 '칭기즈 칸과 몽골 울루스'(괄호 '(테무진)' 제거), 부제 '초원의 서정' 유지. 2026-11-02 사용자 결정으로 본명 병행 표기도 제거해, summary_lines·대사 모두 시기와 관계없이 '칭기즈 칸' 하나로 쓴다.

원칙: 도시 함락·학살 등 대량 사상 사건을 스테이지 주제로 삼지 않는다. 야전·도하·행군·협상 중심. 시기는 `stage_overrides`로 나눌 후보. s3·s6은 선택 스테이지.

대조: 2026-11-02 웹 검색(Wikipedia 계열 Timeline of the Mongol Empire, Battle of Yehuling, Jebe, Mongol conquest of Western Xia, Battle of the Kalka River 등)으로 연도·인물을 확인했다. 일부는 출처 간 연도가 달라 verify로 남긴다.

| 후보 | 제목(가제) | 사건 | 시기 | 근거 수준 | 검증 필요 / 영토 override 메모 |
|---|---|---|---|---|---|
| s1 | 오논 강가의 쿠릴타이 | 부족 통합과 칭기즈 칸 칭호 즉위 | 1206년 | confirmed | 웹 대조 일치(1206년 봄, 오논 강). 나이만 등 별도 세력 필요, 호라즘·금·서하만 표시 |
| s2 | 하서의 문 | 서하 원정과 복속 | 1209~1210년 | confirmed(개요) | 1209년 침공, 1210년 1월 서하 황제 항복으로 전함. 1207년 시작설 있음(verify). 서하 medium 핵심부 강조 |
| s3(선택) | 야호령의 바람 | 금 원정 초기 야전(야호령 전투) | 1211년 | accepted, 연도 verify | 출처에 따라 1211년 또는 1212년. 참전 지휘관(칭기즈 칸·무칼리)도 verify. 금 영역은 1219 윤곽보다 넓어 별도 폴리곤 필요 |
| s4 | 서요를 넘어 | 카라키타이 정복(제베 주도, 쿠출루크 추격) | 1218년 | accepted, 시작 시점 verify | 제베의 카슈가르 진출을 1216년으로 보는 출처도 있음. 카라키타이 신규 세력(low) 필요. 쿠출루크의 최후는 서술하지 않아도 됨 |
| s5 | 시르다리야 | 호라즘 원정 개시, 시르다리야 방면 진군과 도하 | 1219~1220년 | confirmed(개요), 세부 verify | 현재 ch18 윤곽(1219~1223) 사용. 도시 함락은 비주제, 행군·도하·협상 중심. 구체 전장은 verify |
| s6(선택) | 인더스 강가 | 호라즘 왕자 잘랄 앗딘 추격과 인더스 강 도하 전투 | 1221년 | confirmed(개요) | 1221년 11월경, 잘랄 앗딘이 강을 헤엄쳐 탈출한 것으로 전함(세부 verify). 호라즘 서쪽·남쪽 low |
| s7 | 칼카 강의 초원 | 제베·수부타이의 칼카강 전투(칭기즈 칸 본인 불참) | 1223년 | confirmed | 1223년 5월 31일로 전함(일자는 출처 간 확인 권장). 루스 공국·킵차크 세력 신규 필요 |
| s8 | 마지막 원정길 | 서하 최종 원정 | 1226~1227년 | accepted | 칭기즈 칸의 사망 경위는 이설이라 단정하지 않고 '1227년 원정 중 사망'까지만 서술(verify). 서하 영역 low, 1227년 멸망 |

비고: 무칼리·수부타이·제베·보르추 초상화는 안아트가 preview 조각(public/assets/portraits/preview/portrait_preview_manifest_fragment.json)으로 제작했다(manifest.json 병합 전). 메타 heroes_pending의 portrait_key는 조각 기준(portrait.mukhali, portrait.subutai, portrait.jebe, portrait.borchu)이며, 무칼리는 npc_roster code(npc_muqali)와 조각 code(mukhali) 철자가 달라 병합 시 연결 확인이 필요하다. 칼카강(s7)은 제베·수부타이가 주역이라 이들이 동반 영웅으로 필요하다.

## ch21·ch22 서가 추가 (박백엔, 2026-11-03, status:preview)
- `shelves[]`에 ch21(레그니차의 연기, 1241년)·ch22(파니파트의 수레벽, 1526년) 블록, `stages[]`에 ch21_s4·ch21_s5(선택)·ch22_s5 핀 추가(2026-11-03 Plan A 시간순 재코딩 반영: 기존 s1/s2/s1 에서 이관, docs/original_story/ch21_ch22_8stage_outline.md 6절). 서가명은 가칭(name_provisional), 문기획/사용자 확정 대기.
- 핀(등장방형): 레그니차 51.2N 16.2E -> (0.5450, 0.2156), 모히 약 48N 21E -> (0.5583, 0.2333, verify), 파니파트 29.4N 77.0E -> (0.7139, 0.3367). 모두 일반 지식 근사이며 웹 좌표 미확인(evidence_level·source에 표기). 화면 라벨은 당대 표기(실레지아 공국·헝가리 왕국·델리 술탄국)이고 현대 지명은 modern_ref에만 둔다.
- 영웅 칩: 초상이 있는 npc_subutai(ch21), npc_babur(ch22)만 `heroes[]`. 나머지(바이다르·카단·바투·헨리크 2세·알리 쿨리·후마윤·이브라힘 로디)는 `heroes_pending[]`(초상 제작 후 이동). 코드 `npc_babur`는 heroes_candidates 377행 후보 `babur`와 구분되는 캠페인 전용 NPC.
- 영토(shelf_territories.json): ch21_mongol(ch18_mongol 판 재사용)·ch21_silesia·ch21_teutonic, ch22_babur·ch22_lodi. 전부 boundary_confidence low, 새 판은 native 없이 한글(폰트 서브셋 변경 없음). campaigns[]에 ch21·ch22 preview 추가.
- 원본 수정 후 FE 사본 동기화 필요: `node resources/js/game/tools/check_data_sync.mjs --fix`.
- DB 시드: `php artisan game:seed-shelf --with-npc [--dry-run] [--update]` (docs: app/Console/Commands/GameSeedShelf.php 주석).
