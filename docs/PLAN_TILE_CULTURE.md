# 문화권별 맵 타일 조사·계획 (맵디자이너, 2026-11-03)

사용자 질문: "맵 타일도 문화권별로 다 있어야 될 것 같은데 가능한가."
범위: 조사와 계획만 했다. 코드·맵 데이터는 바꾸지 않았다.
표기: [사실]은 파일과 스크립트로 확인한 것, [추정]은 확인하지 않은 판단이다.

## 0. 결론 요약
- **가능하다.** 지금 구조(타일 ID 구간별 시트, 이름표, 매핑표, tmv2 칠하기 코드)가 문화권 세트를 추가하는 방식으로 이미 돌아간다. 오늘만 8세트가 이 방식으로 들어갔고 FE 등록도 끝났다.
- **이미 있는 문화권:** 한국(레거시 한옥·성곽·봉수), 중국 수전·적벽, 일본 전국, 서유럽 중세, 몽골 스텝(게르), 서아시아 사막, 십자군 성, 지중해, 안달루스(장막 1종), 서고 실내·흰 방.
- **문화권이 어긋나는 곳의 원인은 대부분 하나다.** 회색 기와풍 레거시 민가(`roof_top/roof_bot/wall_*`)와 한옥풍 `house_small`·`tower_a` 가 공유 맵(pk_*·초기 복제 맵)에 남아 있다. 이 맵들을 유럽(ch21·ch103), 인도(ch22), 중앙아시아·스텝(ch18) 서가가 쓰고 있다.
- **아예 세트가 없는 문화권:** 인도(무굴·라지푸트), 중국 민가·성곽, 동유럽 목조 마을, 로마·그리스 군영·민가, 일본 민가·천수각. 우선순위는 인도가 1순위다(ch22 8스테이지와 ch18_s6이 전부 맞지 않는 그림).

## 1. 현재 타일 세트의 문화권 집계 [사실]

### 1-1. 시트 구성
- `public/assets/tiles/tileset_v2/tv2_names.json` 이름 2,041개, spec 시트 16종.
- FE 등록: `resources/js/game/data/unityTileset.js` 에 static4~13이 모두 등록돼 있다.

| 문화권 | 시트(전역 ID) | 건물·성벽·소품 | 지면 47형 | 비고 |
|---|---|---|---|---|
| 중립 지형 | tv2_static·anim·anim2·static2·static4_mtn (1000~2586) | 우물·통·상자·횃불·나무·바위 등 obj_*/obj2_* | 풀·흙·숲·언덕·산·물·여울·모래·눈·늪·허공·자갈·판석·밭 | 1,143개. 문화권 색이 거의 없음 |
| 한국(조선·삼국) | 레거시 인덱스(ws_*·ext, 200~249·400~425) + static3_a2(2364~) | 한옥 용마루·처마·정면 9, 성문 gate_L/C/R/S 4, 망루 2, 한옥 덧그림 4, 봉수대·돌무더기 a2_* 10 | 없음 | tv2 이름표 밖 레거시 이름이 대부분 |
| 동아시아 범용(회색 기와 민가) | 레거시 76~91 | roof_top/bot L/C/R 6 + wall_L/window/door/R 4 | — | 유럽·인도 맵에도 쓰이는 문제 타일 |
| 회색 석축 성곽 | 레거시 209~218 | wall_NW..SE·h_N/S·v_W/E 8 | castle_pave | 문화권 약함(어디든 무난) |
| 중국 | static7_china 3200~3350 | 누선·몽충·화선·거룻배·연환·수채 16형·수문·군막·지휘 장막·깃발 3·열린 성문 2 | 붉은 절벽 redcliff47 | 110개. 민가·성곽 없음 |
| 일본 | static8_japan 3400~3650 | 마방책 16형+틈, 돌담·토담 16형+성문, 망루 2x2, 노보리 5, 진막 2x2 | 도랑 ditch47, 논 paddy47 | 143개. 민가·천수각 없음 |
| 몽골 스텝 | static5_camp 2600~2656 | 게르 2x2·1x1, 마른 덤불 | 스텝 바닥 3 | 19개 + 범용 천막·목책 38개 |
| 서유럽 중세 | static6_west 2700~3131 | 석벽 16형·성문·아치·틈, 석탑, 민가 4종, 긴 집·장원·방앗간 2x2, 울타리 16형, 롱십·거룻배·부두 16형, 깃발 3, 파빌리온·원뿔 천막 | 능선 ridge47(중립으로 셈) | 99개 |
| 안달루스 | static6_west 안 | 줄무늬 장막 2x2 | — | 4개뿐 |
| 서아시아(페르시아·레반트) | static9_desert 3700~3946 | 흙벽돌 성벽 16형·성문·탑 2x2·흙벽 집·야자수 2·페르시아 장막 2x2 | 건조 점토 clay47, 모래 둔덕 dune47 | 123개 |
| 십자군 | static10_crusader 4000~4044 | 사암 석벽 16형·성문·아치·틈, 키프·원탑 2x2, 방파제 16형 | — | 45개 |
| 지중해(카르타고·로마 해안) | static11_med 4100~4246 | 갤리선 3방향, 석조 부두 16형, 사이프러스·올리브, 회벽 집 2 + 큰 집 2x2 | 석호 lagoon47 | 80개 |
| 고려 물막이 | static12_levee 4300~4317 | 소가죽 둑 16형·터진 둑 | — | 18개 |
| 서고 | static3(2200~)·static3_art·static13_archive(4400~) | 서가·카펫·카운터·책상·흰 벽 16형·책장 표지·마지막 칸 | 판자·허공·흰 바닥 | 약 200개 |

- **없는 문화권:**
  - 인도(무굴·라지푸트)
  - 중국 민가·성곽
  - 동유럽 목조
  - 로마·그리스(군영·민가·기둥)
  - 일본 민가·천수각
  - 중앙아시아 오아시스 도시(서아시아 흙벽돌로 대용 가능)
  - 안달루스 건축(장막만 있음)
  - 몽골 이외 유목민 소품

### 1-2. 맵의 문화권 어긋남 [사실 + 판단]
- 조사 방법: 스크립트로 맵 157개 가운데 스테이지가 쓰는 109개의 tile_layer 이름(names-v1과 v2)을 위 규칙으로 분류했다. 스크립트는 작업용 임시 파일이라 저장소에 넣지 않았고, 필요하면 도구로 옮긴다.
- 스테이지 문화권은 서가 코드로 정했다.

| 어긋남 | 맵(→ 쓰는 스테이지) | 심각도 |
|---|---|---|
| 회색 기와 민가 + 한옥풍 house_small·tower_a 가 유럽에 | su_pk02_ford(ch21_s2), su_pk10_coast_isles(ch21_s7), su_pk12_central_keep(ch21_s6), su_pk15_village_war(ch21_s5), su_ch21_s8_mountain_pass, su_pk18_wall_breach(ch21_s3·ch22_s2), su_pk20_grand_mixed(ch18_s7·ch21_s4·ch22_s7) | 높음(화면 중앙 마을이 동양 기와집) |
| 같은 민가가 프랑스(1429)에 | main_a3_1_wall_road(ch103_s1), su_ch103_s2_mud_plain, su_ch103_s3_loire_ford, su_ch103_s5_cathedral | 높음 |
| 같은 민가·한옥 덧그림이 인도(무굴)에 | su_pk04_hill_claim(ch22_s1), su_pk13_crossroads(ch22_s3), su_pk09_swamp_detour(ch22_s4), su_pk06_fortress_siege(ch22_s5), su_pk14_twin_rivers(ch22_s8), pk_18·pk_20(위) | 높음. 인도 세트 자체가 없음 |
| 같은 민가가 몽골 원정(중앙아시아·인더스)에 | su_pk13·pk04·pk16·pk14·pk20(ch18_s2~s5·s7), su_ch18_s6_indus(한옥 1) | 중간(호라즘·서하 도시라 흙벽돌이 맞음) |
| 한대 군막(중국 세트)이 한국 맵에 | su_ch11_s1·s2·s4, su_ch13_s1~s3, su_ch14_s2 | 낮음(검은 사각 천막이라 범동아시아로 읽힘) |
| 한옥·회색 기와가 중국(적벽·이릉)에 | su_ch12_s1_xiakou(창고·나루지기 집), su_ch12_s4_yiling(성곽·성문) | 중간(중국 민가·성곽이 없어 대용) |
| 서고(허공·판자)가 임진왜란 맵에 | su_ch1_s8_seoga_collapse, su_ch1_s10_last_seoga | 의도(서가 붕괴 서사). 어긋남 아님 |
| 실내 키트가 프랑스 서기소에 | su_ch103_s4_clerk_office | 낮음(범용 실내) |
| 튜토리얼 stage_01~06 | plain_01·river_02·forest_01·desert_01·castle_01 | 문화권 지정 없음. 한옥 덧그림 1~2칸이 섞임 |

- 어긋남이 없는 서가(오늘 문화권 세트로 새로 만든 맵): ch12 s2·s3, ch15, ch16, ch17, ch19, ch20, ch23, ch24, ch999, ch1_s1~s5·s7·s9, ch102.
- 분류의 한계: 이름 접두 규칙이라 놓친 것이 있을 수 있다. `ov_drybush`(마른 덤불)는 스텝 세트 소속이지만 범용이라 어긋남에서 뺐다.

## 2. 서가·메인별 필요한 문화권 키트와 갭 [추정 포함]

| 서가(스테이지 수) | 필요한 문화권 | 지금 쓸 수 있는 세트 | 갭(필요한 새 타일, 개수 추정) |
|---|---|---|---|
| ch1 임진왜란(10) | 조선·일본 수군 | 한옥·성곽·봉수 | 조선 민가(초가·기와 2~3종), 판옥선·안택선 배 덧그림 6~10 |
| ch11 고려-거란(4) | 고려·거란 | 한옥·성곽·물막이 | 거란 천막·깃발 4~6(지금은 한대 군막 대용) |
| ch12 적벽(4) | 후한 | 중국 수전 | **중국 민가 3~4종, 성벽 16형 + 성문, 망루 2x2: 약 25** |
| ch13 황산벌(3)·ch14 살수(4) | 신라·백제·고구려 | 한옥·성곽 | 삼국 성곽은 기존으로 충분. 수나라 군막(지금 한대 군막) |
| ch15 지중해(4) | 로마·카르타고 | 지중해·십자군 사암 | 로마 군영 목책·막사 천막, 기둥 열(종교 표지 없이), 로마 민가: 약 20 |
| ch16 오를레앙·ch23 헤이스팅스·ch24 투르·ch103(14) | 서유럽 | 서유럽 | ch103 맵 4개를 다시 칠하면 됨(새 타일 불필요) |
| ch17 가우가멜라(4) | 마케도니아·페르시아 | 서아시아 | 마케도니아 군영 천막 2~3(지금 서유럽 천막 대용) |
| ch18 몽골(8) | 몽골·서하·호라즘·인더스 | 스텝·서아시아 흙벽돌 | 공유 pk 맵 다시 칠하기(흙벽돌·게르). 새 타일은 서하 성문 정도 |
| ch19 성지(4) | 아이유브·십자군 | 서아시아·십자군·지중해 | 갭 거의 없음 |
| ch20 나가시노(3) | 전국 일본 | 일본 | 일본 민가 2~3, 천수각 3x3: 약 12 |
| ch21 몽골의 유럽 침공(8) | 폴란드·헝가리(동유럽) | 서유럽(대용 가능) | 공유 pk 맵 다시 칠하기. 동유럽 목조 민가·목책 요새 약 15(선택) |
| ch22 바부르·무굴(8) | 무굴·로디 술탄국(인도) | 없음(흙벽돌 대용 가능) | **인도 세트: 붉은 사암 성벽 16형·성문·차트리 탑 2x2·하벨리 민가 3·장막(샤미아나) 2x2·반얀·야자·전투 코끼리 장식 물품: 약 40~50** |
| ch101 서고·ch104 사막·서고·ch999(13) | 서고 | 서고·서아시아 | 갭 없음 |
| 튜토리얼 stage_01~06 | 범용 | 중립 | 한옥 덧그림 몇 칸만 정리(선택) |

## 3. 새 문화권 시트 제작 규격(안아트용)과 기존 맵 다시 칠하기

### 3-1. 시트 규격(지금 세트들과 같게)
- **타일과 시트:** 타일 32x32 px. 시트는 16열 PNG이고, 프레임 번호 = 전역 ID − 시트 시작 ID.
  - 지면은 불투명, `ov_*` 오버레이는 알파 0 또는 255만 쓴다.
- **ID 구간:** 지금 마지막은 archive 4400~4425이므로, 새 세트는 4500부터 100칸 단위로 한 세트씩 잡는 것을 제안한다.
  - 예: 인도 `tv2_static14_india` 4500~4699, 중국 민가 `tv2_static15_china_town` 4700~4799, 일본 민가 `tv2_static16_japan_town` 4800~4899.
  - 세트 안은 기존처럼 구조물 / 지면 47형 / 소품으로 하위 구간을 나눈다.
- **이름 규칙:** 문화권 접두를 붙인다(`ov_<접두>wall_<m4>`, `ov_<접두>gate_h/v`, `ov_<접두>house_<종류>`, `ov_<접두>tower_<r><c>`, `<접두>_tent_<r><c>`, `<지면>47_<mask>`).
- **모양 규칙:**
  - 성벽·울타리·부두는 4방 16형(N1 E2 S4 W8).
  - 지면은 47형(red() 정렬 마스크 47개 + fill_b/c 변형).
  - 2x2 건물은 `_00 _01 / _10 _11`.
- **산출 파일 형식:** 지금과 같다.
  - `docker/gemini/tileset_v2/art_<세트>/<세트>_tiles_mapping.json`(sets·rules·names{set:{name:{index,layer,walk}}}·fe·tmv2)
  - 미리보기 PNG, QA json
  - tv2_names.json·tileset_v2_map.json 에는 추가만 한다(기존 키 불변).
  - 매니페스트를 병합할 때는 `merge_fragments.mjs` 만 쓴다.
- **그림 규칙:** 종교 표지는 넣지 않는다(지금 세트와 같음). 깃발은 무지로 하고, 문화권 표현은 색과 모양으로 한다.
- **연결 작업:**
  - 윤프론: unityTileset.js U32_TV2 항목 추가
  - 맵디자이너: tmv2.py 에 src 분기·fe_valid(매핑표 이름 집합)·칠하기 코드 추가 후 회귀 검증
  - 오늘 8세트와 같은 절차로, 세트당 반나절 이내 [추정]

### 3-2. 기존 맵 다시 칠하기
- **방법 A. 생성기 플래그 [이미 있음]:** ch23·ch24처럼 생성기에서 만든 맵은 문화권 플래그(예: `WEST`)로 건물 함수를 바꿔 다시 만든다.
  - 좌표 불변을 검사하고, 바뀐 지형 칸을 기록한다(meta.west_proposal 방식).
- **방법 B. 다시 칠하기 도구 [신규 제안, `docker/maps/tilemap_v2/culture_remap.py`]:** pk_*·임베드 확장 맵처럼 design.json 의 structures(kind=house·hall·fortress, footprint 칸 목록)가 있는 맵에 쓴다.
  - 문화권 키트 표(`culture_kits.json`)를 따라 레거시 이름 층(prev_v1)과 objects 를 바꾼다.
  - 민가 w x 3(W): 지형을 그대로 두는 안(3줄 몸체 위에 1x1·2x2 덧그림)과, 윗줄을 풀로 비우는 안(지형 변경, 기록) 중 하나.
  - 성곽 고리: 레거시 wall_* → `ov_<접두>wall_<m4>`. 칠하기 코드만 바꾸고 지형은 그대로.
  - 성문 gate_L/C/R → `ov_<접두>gate_h`. 지형 c 그대로.
  - 결과 검증: tmv2 V1~V8, scaleup_embed_check, MapChecker, 좌표 same_terrain.
  - DB 반영은 meta.tile_layer 키만 교체한다(박백엔, 군영 세트 적용 때와 같은 방식).
- **방법 C. 이름 1:1 바꾸기:** 이름만 바꾸면 되는 경우(예: 한대 군막 → 수나라·거란 군막)는 tile_layer.v2 names 표를 치환한다. 지형·좌표에 영향이 없다.

## 4. 가능 여부와 단계별 계획

| 단계 | 내용 | 대상 | 작업량 [추정] | 위험 |
|---|---|---|---|---|
| 0 | 새 타일 없이 다시 칠하기: 유럽 맵은 서유럽 세트, ch18 도시는 서아시아 흙벽돌·게르, ch22는 임시로 서아시아 흙벽돌 | ch21 pk 맵 6, ch103 4, ch18 pk 맵 5 + 인더스 1, ch22 공유 맵(인도 세트 전 임시) | 도구(방법 B) 1일 + 맵당 30분, 약 2일 | 공유 맵(pk_18·pk_20)은 ch21(유럽)과 ch22(인도)가 같이 씀 → 문화권별로 맵을 나눠야 함(코드 하나 더, 좌표는 같은 offset) |
| 1 | 인도(무굴) 세트 제작 + ch22 8맵 다시 칠하기 | ch22 전부, ch18_s6 | 안아트 1일 + 연결 반나절 + 다시 칠하기 1일 | 인도 건축 고증 수준(무굴과 로디 구분) |
| 2 | 중국 민가·성곽 세트 + ch12 s1·s4 다시 칠하기 | ch12 | 안아트 반나절 + 1일 | 낮음 |
| 3 | 일본 민가·천수각, 로마 군영·민가, 마케도니아 군영 | ch20, ch15, ch17 | 세트당 반나절 | 낮음(지금도 대용은 됨) |
| 4 | 동유럽 목조, 거란·수나라 군막, 조선 민가·배 덧그림 | ch21, ch11·ch14, ch1 | 세트당 반나절 | 우선순위 낮음 |
| 5 | 튜토리얼 정리, 남은 한옥 덧그림 칸 정리 | stage_01~06 | 반나절 | 없음 |

- 맵이 문화권별로 갈라지는 공유 맵: pk_18(ch21_s3 유럽 / ch22_s2 인도), pk_20(ch18_s7 스텝 / ch21_s4 유럽 / ch22_s7 인도), pk_04·pk_13·pk_14(ch18 스텝 / ch22 인도).
  - 지형과 좌표는 같게 두고 그림만 다른 코드로 복제한다. 스테이지 map 코드만 바뀐다.
- 위험 정리:
  - DB 반영 순서: tile_layer 만 바꾸고 maps 행을 다시 upsert 하지 않아야 한다.
  - FE 에 새 시트를 등록하기 전에는 지형 그림으로 대체되고 오브젝트가 생략된다(문제는 아니지만 확인이 필요).
  - 반복되는 그림 품질은 안아트 QA 범위다.

## 5. 사용자 결정이 필요한 것
1. **문화권 세분 단위:** 예를 들어 인도를 무굴·로디 하나로 할지, 동유럽을 서유럽 세트로 대신할지, 삼국·고려·조선을 한 한국 세트로 둘지.
2. **공유 맵 분리:** 같은 지형을 여러 문화권 서가가 쓸 때 그림별로 맵 코드를 나누는 것에 동의하는지. 권장: 나눈다(좌표는 같음).
3. **민가 모양 변경 허용 여부:** 지형을 그대로 두는 덧그림 방식(모양 제약이 있음)과, 민가 윗줄을 풀로 비우는 방식(지형 조금 변경, 스테이지 좌표는 영향 없음 확인 필요) 중 하나.
4. **우선순위:** 권장 순서는 인도 → 유럽·스텝 다시 칠하기(새 타일 불필요) → 중국 → 일본·로마 → 나머지.
5. **종교 표지:** 지금처럼 쓰지 않는 원칙(사원·교회·모스크 없이 문화권 표현)을 유지할지.
6. **튜토리얼:** 범용으로 둘지.

## 6. 확인하지 않은 것
- 새 시트의 실화면 표시(FE 등록은 코드에서 확인했으나 브라우저로 보지는 않았다).
- 분류 규칙에서 빠진 이름.
- 문화권별 고증의 세부(사람 검토 권장).

## 7. 0단계 결과 — 새 타일 없이 다시 칠하기 (2026-11-03, 맵디자이너) [사실]
- 도구 `docker/maps/tilemap_v2/culture_remap.py <루트> <code> <west|adobe> [--copy <새 code> <파일>] [--stages ..] [--write]`.
  - 지형·스폰·배치는 그대로 두고(V8 불변), 칠하기·레거시 이름 층(prev_v1)·덧그림만 바꾼다.
  - 바꾸는 대상: 기와 민가·한옥 덩이(W), 마을 칸 위 집 그림(v), house_small·tower_a, 레거시 성곽 고리·성문(있으면 16형 석벽·성문), 동아시아 덧그림.
  - 제자리 다시 칠하기는 design·prev_v1 을 `*.bak-culture-20261103` 으로 백업한다.
- 결정 반영: 공유 맵은 문화권별 코드로 복제, 지형 불변 덧그림 방식, 종교 표지 없음.

| 구분 | 맵 코드 | 데이터 파일 | 스테이지 | 키트 |
|---|---|---|---|---|
| 제자리 | su_pk02_ford | maps_scaleup_swap.json | ch21_s2 | west |
| 제자리 | su_pk10_coast_isles, su_pk12_central_keep, su_pk15_village_war, su_ch103_s2_mud_plain, su_ch103_s5_cathedral | maps_scaleup_batch3.json | ch21_s7·s6·s5, ch103_s2·s5 | west |
| 제자리 | su_ch21_s8_mountain_pass | maps_scaleup_batch2.json | ch21_s8 | west |
| 제자리 | su_ch103_s3_loire_ford | maps_scaleup_swap.json | ch103_s3 | west |
| 제자리 | main_a3_1_wall_road | maps_main_a3.json | ch103_s1 | west |
| 제자리 | su_pk16_cliff_valley, su_ch18_s6_indus | maps_scaleup_batch2.json | ch18_s4, ch18_s6 | adobe(흙벽돌) |
| 복제(신규) | su_pk18_wall_breach_eu | maps_culture_copies.json | ch21_s3 | west |
| 복제(신규) | su_pk20_grand_mixed_eu | maps_culture_copies.json | ch21_s4 | west |
| 복제(신규) | su_pk20_grand_mixed_steppe | maps_culture_copies.json | ch18_s7 | adobe |
| 복제(신규) | su_pk04_hill_claim_steppe | maps_culture_copies.json | ch18_s3 | adobe |
| 복제(신규) | su_pk13_crossroads_steppe | maps_culture_copies.json | ch18_s2 | adobe |
| 복제(신규) | su_pk14_twin_rivers_steppe | maps_culture_copies.json | ch18_s5 | adobe |

- 원본 코드를 남겨 둔 것: su_pk18·pk20·pk04·pk13·pk14. 이 맵들은 ch22(인도)가 계속 쓰고, 인도 세트가 나오면 다시 칠한다(1단계).
- 검증: tmv2 V1~V8 17맵 오류 0, MapChecker(복제 6맵) ERROR 0 WARN 0, 문화권 집계상 동아시아 민가 0.
  - 남은 표시 두 가지는 정상이다. 흙벽돌(w_asia)은 스텝 서가의 의도된 키트이고, a2_ridge 는 중립 돌 능선이다.
- 박백엔 DB 반영(맵디자이너가 확인하지 않음):
  - 제자리 11맵은 maps 행의 meta.tile_layer 키만 교체한다(지형·스폰·배치·다른 meta 불변, 재upsert 금지).
  - 복제 6맵은 신규 행이다. `maps_culture_copies.json` 을 GameSeedMapPack ALLOWED·ScaleUpMaps FILES 에 추가한 뒤 삽입하고, 해당 스테이지의 map 코드만 바꾼다. 좌표는 원본 확장 맵과 같다.
  - FE 는 2700~(서유럽)·3700~(서아시아) 시트를 이미 등록했다.

## 부록 A. 인도(무굴·로디) 타일 세트 요구서 — 안아트용 (`tv2_static14_india`, 전역 4500~4699)
- 공통 규격:
  - 32x32 px, 시트 16열 PNG(512 x n), 프레임 = 전역 − 4500.
  - 지면은 불투명, `ov_*` 는 알파 0/255.
  - 팔레트: 붉은 사암·흰 대리석 테두리·황토·녹색 정원. 종교 표지(돔 위 상징·사원 기호) 없음.
- 산출:
  - `docker/gemini/tileset_v2/art_india/india_tiles_mapping.json`(아래 양식), `art_india/preview/*.png`, QA json
  - tv2_names.json·tileset_v2_map.json `index_map_india` 는 추가만
  - 매니페스트는 `merge_fragments.mjs` 로만 병합
- 구간과 이름(개수 = 최소):

| 하위 구간 | 전역 ID | 이름 | 개수 | 형태·통행 | 쓰임 |
|---|---|---|---|---|---|
| 성벽 | 4500~4515 | `ov_iwall_<m4>` (m4 = N1 E2 S4 W8, 0~15) | 16 | 붉은 사암 총안 성벽 16형, 불통(W) | 성곽 고리(pk_06·pk_18 성) |
| 성문 | 4516~4519 | `ov_iwall_gate_h/v`, `ov_iwall_arch_h/v` | 4 | 아치형 성문(나무 문짝)·문 없는 아치, 통행(c) | 성문 |
| 틈 | 4520~4521 | `ov_iwall_breach_h/v` | 2 | 무너진 틈, 통행(p) | 공성 |
| 망루 | 4522~4525 | `ov_chhatri_00/01/10/11` | 4 | 차트리(기둥 정자) 탑 2x2, 불통 | 성 모서리 |
| 민가 | 4530~4535 | `ov_ihouse_a/b/c`(1x1 평지붕·발코니·흰 회벽), `ov_haveli_00/01/10/11`(2x2 하벨리) | 7 | 불통(W) 또는 마을 v 칸 덧그림 | 마을 |
| 장막 | 4540~4544 | `ov_shamiana_00/01/10/11`(2x2 기둥 차양 장막), `ov_itent`(1x1) | 5 | kind tent(v) | 무굴 진영 |
| 수레벽 | 4545~4547 | `ov_cartwall_h/v`, `ov_cartwall_end` | 3 | 사슬로 묶은 수레벽(파니파트), 불통(k) | ch22_s5 |
| 깃발 | 4550~4552 | `ov_iflag_green/red/saffron`(무지) | 3 | 불통 소품 | 진영 표지 |
| 나무·소품 | 4553~4559 | `ov_banyan_00/01/10/11`(2x2 반얀), `ov_ipalm`, `ov_stepwell`(계단 우물 1x1), `ov_cannon`(사석포) | 7 | 나무는 숲 칸 덧그림, 우물·포는 통행 칸 소품 | 들·성 |
| 코끼리(장식) | 4560~4561 | `ov_elephant_h/v` | 2 | 장식 오브젝트(유닛 아님), 불통 | 진영 |
| 정원 지면 | 4600~4646 | `ichar47_<mask>` (47형, red() 정렬 마스크와 같은 순서), `ichar_fill_b/c` | 49 | 차르바그 정원(수로·화단) 지면, 평지(p) 규칙 | 궁정·도시 |
| 붉은 흙 지면(선택) | 4650~4696 | `redsoil47_<mask>` + fill | 49 | 데칸 붉은 흙, 평지 | 들 |

- 매핑표 양식(기존 west·china·japan 과 같음):
```json
{"_note": "...", "sets": {"structure": [4500, 4561], "garden": [4600, 4648], "redsoil": [4650, 4698]},
 "rules": {"ov_iwall_<m4>": "붉은 사암 성벽 16형. 불통(W)", "ov_iwall_gate_h/v": "성문. 통행(c)", "...": "..."},
 "names": {"structure": {"ov_iwall_0": {"index": 4500, "layer": "object(overlay)", "walk": "block"}, "...": {}},
           "garden": {"ichar47_0": {"index": 4600, "layer": "ground", "walk": "pass"}, "...": {}}},
 "fe": "윤프론: U32_TV2.static14_india = {key:'tv2_static14_india', path:'/assets/tiles/tileset_v2/tv2_static14_india.png', cols:16, start:4500, count:<n>}, u32Src 에서 idx>=4500 분기를 4400 보다 먼저",
 "tmv2": "맵디자이너: src() i>=4500 분기, fe_valid = names 집합, 칠하기 코드(성벽 16형·성문·정원 47형) 추가"}
```
- 연결 후 맵디자이너가 할 일:
  - culture_remap.py 에 `india` 키트를 추가한다(성벽 → ov_iwall, 민가 → ov_ihouse·haveli, 장막 → shamiana).
  - 원본 코드 su_pk04·pk06·pk09·pk13·pk14·pk18·pk20·pk07(ch22)을 제자리에서 다시 칠한다.

## game:clone-map (공용 맵 문화권별 복제, 2026-11-06)
- `php artisan game:clone-map --from=<code> --to=<new_code> --stages=<stage_code,...> [--name=] [--apply]` (기본 dry-run).
- --apply: `storage/app/map_patch_backup/clone_<시각>_<to>.json`(원본 맵 행 + 대상 스테이지의 기존 map_id) 백업 후 트랜잭션으로 maps 행 복제(tiles·spawns·deploy_zones·meta·rules·biome) + 지정 stages.map_id 교체.
- 거부: 원본 없음, --to 중복·형식 불량(소문자/숫자/_ 48자), 스테이지 없음, 스테이지가 --from 맵을 안 씀, 대상 스테이지에 deployment/in_progress 전투, MapChecker ERROR·WARN, 스테이지·meta 좌표 범위 밖.
- 복제 후 그림/meta 패치는 `game:apply-map-patch`(patch JSON의 code = 새 code)로 한다.
- 롤백: 백업의 stages_prev_map_id 로 stages.map_id 복원 후 새 맵 행 삭제.
- **시드 주의**: 스테이지 시드 4종(GameSeedMain/Shelf/Ch18/Imjin10)은 실행할 때마다 스테이지 JSON 의 `map` code 로 map_id 를 UPDATE 한다(GameSeed 는 --force 일 때만). 따라서 복제 후 해당 스테이지 JSON 의 `map` 을 새 code 로 바꿔 두지 않으면 시드 재실행 시 원본 맵으로 되돌아간다. 새 code 는 시드가 DB 에서 조회(없으면 실패)하므로, 새 DB 구축 시에는 시드 전에 clone-map 을 먼저 실행해야 한다(maps_culture_copies.json 은 시드 대상 아님). 맵 행 자체는 시드가 덮어쓰지 않는다(새 code 는 시드 맵 파일에 없음).

## 맵 개편 보호 규칙 (2026-11-06)
- 맵 행(`maps`)의 `meta.redesign` 이 비어 있지 않으면 "개편된 맵"이다(game:apply-map-patch 로 지형 재설계 적용). 시드는 이런 행의 tiles·meta·spawns·deploy_zones·name·biome 을 덮어쓰지 않는다(전부 건너뜀, WARN 출력). 신규 행 insert 는 그대로.
- 공통 헬퍼: `App\Support\MapRedesignGuard` (`upsert()`, `protectedCodes()`, `isRedesigned()`).
- 적용 시드와 대상 맵: `game:seed-imjin10`(im_01~10, maps_imjin10.json; `--enemy/--with-npc/--named/--force` 무관) / `game:seed-map-pack`(pk_*, su_*, maps_culture_copies.json) / `game:seed-main --update`(main_a1_* 등 maps_main_*.json) / `game:seed --force`(기본 maps.json·팩 맵 upsert 및 tile_layer 보충).
- 스테이지 시드(seed-imjin10·ch18)의 meta.enemy_extra_zones 병합은 키 단위 병합이라 redesign 을 지우지 않는다(유지).
- 개편 맵 표식을 지워야 JSON 로 되돌릴 수 있다. 개편 패치를 적용하는 JSON 에는 반드시 `meta.redesign` 을 넣을 것(표식이 없으면 보호되지 않는다).
