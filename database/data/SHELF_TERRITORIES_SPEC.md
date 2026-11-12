# 서가 영토 데이터 명세 (shelf_territories.json v1.1)

작성: 송서사 / 2026-11-01. 신규 파일. shelf_map_meta.json은 읽기만 했고 수정하지 않았다.

## 1. 스키마

- 최상위: version, coord_note, disclaimer_player, battle_map_range, factions[], campaigns[].
- factions[] 필드
  - id(캠페인 접두사), name_period(당대 국호), **as_of(필수, 기준 연도/범위)**, color(HEX, 반투명 fill 권장), alliance(아군|적|중립).
  - plaque: 큰 국호 판 표기 { text, script(hanja|hangul), evidence(accepted|needs_verify), note }. 판을 놓지 않는 보조 세력(점령권 등)은 null, 대신 label_caption(작은 캡션).
  - label_pos{lon,lat}: 판/캡션 기본 위치(전장 지도 기준 육지 위). 스테이지별로 바꾸려면 stage_overrides[stage].label_pos[faction_id].
  - emblem_kind(flag|banner|seal|text_only), emblem_note, emblem_evidence. seal은 한자 도장풍 장식이며 실존 옥새가 아니다.
  - polygons[]: { boundary_confidence(high|medium|low), ring[[lon,lat]...] }, 첫 점 반복으로 닫힘, 다중 폴리곤 허용.
  - province_labels(ch1_joseon만): 팔도 이름 라벨 위치. 도 경계 폴리곤은 없다.
  - note, source, evidence_level(accepted|needs_verify): 비표시 제작용.
- campaigns[]: campaign_id(shelf_code와 동일), name_ko, status, as_of, faction_ids, priority(앞쪽이 아래, 뒤쪽이 위에 그려짐), stage_overrides{stage_code:{as_of, faction_ids, priority, label_pos{faction_id:{lon,lat}}}}.
- 준비 중 캠페인(ch11~ch20)과 tutorial은 faction_ids가 빈 배열(빈 매핑)이며 as_of만 적었다. 초안 세력 데이터는 factions[]에 남겨 두고 campaigns[].draft_faction_ids로 가리킨다. FE는 draft_faction_ids를 읽지 않는다(활성화 시 faction_ids로 옮기고 시점 검수).
- 표시 가능: name_period, plaque.text, color, alliance, label_pos, label_caption, as_of(연도 표기용), disclaimer_player. 나머지는 비표시.
- 좌표 변환: x=(lon+180)/360, y=(90-lat)/180.

## 2. 면책 문구 (플레이어용 한 줄)

"지도에 칠한 영역은 그 무렵의 대략적인 세력권이며, 실제 국경과는 다를 수 있습니다."

## 3. ch1 전장 지도 (경도 123.5~131.5E, 위도 32.5~40.5N)

- 범위 밖은 FE가 클리핑. 조선 폴리곤은 60여 점(해안·강 윤곽), 점령권 폴리곤은 25~35점.
- 기본 레이어: 일본, 명, 조선 팔도 전체. 점령·진군 레이어를 시점별로 그 위에 덧칠(stage_overrides).
- 시점 매핑
  - s1 옥포(1592.5): 일본군 점령권(한성 일대). 명군 진군 없음.
  - s2 정암진, s3 한산도(1592.7), s4 진주성(1592.10): 일본군 점령권(평양 선) + 함경도 일부(low).
  - s5 평양성(1593.1): 황해·경기 점령권, 명군 진군(평안도).
  - s6 행주산성(1593.2): 한성 일대 점령권, 명군 진군(황해·경기 북부).
  - s7 노량(1598.12): 경상 해안·순천 왜성 지대.
  - s9 명량(1597.9): 해안 + 호남·충청 진출 회랑(low) + 명군 주둔(한성~남원, low).
  - s8, s10은 virtual이라 기본 매핑.
- 판 위치: 조선은 점령되지 않은 육지(전라도 등)나 평안도로 스테이지별 이동. 일본 판은 규슈(131.0E, 33.2N), 명 판은 요동 남단(123.9E, 40.4N)이며 범위 가장자리라 어긋나면 가장자리 표기로 대체.
- 팔도: 경기·충청도·전라도·경상도·강원도·황해도·평안도·함경도(현대 도 경계 아님). 지명 라벨만 제공.
- 한자 병기: 朝鮮, 日本, 大明 모두 국호 표기로 사실(accepted). 판 장식은 디자인.

## 4. FE 구현 시 주의

1. 폴리곤은 해안선과 정확히 일치하지 않는다. 바다로 삐져나가는 부분은 육지 마스크로 잘라낼 것(ch19 해안 띠, ch15 반도, ch1 명 산둥·요동 부분 포함).
2. 다중 폴리곤은 각각 채우고 라벨은 label_pos 한 곳. 날짜변경선 처리 불필요(경도 -180~180 단순 값, 카르타고 이베리아만 음수 경도).
3. boundary_confidence: high 실선, medium 반투명 윤곽, low 점선 윤곽과 낮은 불투명도.
4. 점령권·진군 폴리곤(ch1_occ_*, ch1_ming_front_*)은 거점·가도 중심의 일시적 상태라 low이며 면 단위 색칠이 과장일 수 있음. 반투명 점선 권장.
5. 겹침(조선 위 점령권, 명군 진군 등)은 priority 순으로 그린다.

## 5. 시대 정합 최종 점검 항목

각 캠페인에서 그 시기에 존재하지 않는 국가·지명이 섞이지 않았는지 확인:

1. ch1 1592~98: 청(1636 국호)·대한제국·현대 국경 없음. 조선·일본(도요토미 정권)·명만. 에도 막부(1603) 없음. 일본은 도쿠가와 아닌 도요토미 정권.
2. ch11 993~1019: 금(1115)·원 없음. 거란/요 국호 혼재 verify, 송은 북송.
3. ch12 208: 위(220)·촉한(221)·오(229) 호칭 미사용(인물명 세력).
4. ch13 660: 발해(698)·통일신라 호칭 없음(신라/백제/당).
5. ch14 612: 당(618) 없음. 수·고구려만.
6. ch15~ch20: 로마 제국·독수리 표준(기원전 104), 오스만 등 후대 세력 없음. 잉글랜드·프랑스 1429년 시점, 호라즘 몽골 서정기, 아이유브·십자군 국가 1187~92, 오다·다케다 1575.
7. 현대 국가명·현대 도 경계·현대 지명은 화면 표시 필드에 없음.

## 6. 근거 수준과 고증 한계

- 세력 36개(ch1 12개: 조선, 일본, 명 + 점령·진군 9개 / ch11~20 24개 / 합산은 JSON 기준). accepted 약 26, needs_verify 약 10. 모든 위경도는 일반 지식 기반 근사값이고 웹 대조를 하지 않았다.
- 점령·진군 폴리곤 9개는 전부 needs_verify, low. 일자·범위(평양 입성, 가토 부대 함경도 진출 시기, 정유재란 진출선, 명군 주둔지)를 사료·지도로 사람이 확인해야 한다.
- ch1_joseon의 압록·두만강 북쪽 선은 medium.
- 일본 도호쿠 복속 범위, 홋카이도 제외.
- 문장·깃발: 프랑스·잉글랜드 왕가 문장 시기, 몽골 구유백독 세부, 아케메네스 황금 독수리(크세노폰 『아나바시스』 1.10.12, 331년 사용은 verify), 아이유브 황색 군기는 verify.
- 준비 중 서가의 ch12_liu는 208년(하구)과 209년(형남 4군)이 혼재, 적용 전 결정 필요. ch11 993년 북계와 1019년 북계 차이 미반영.
- 출처: 일반 역사 지식과 기억 인용. 공개 전 문헌·지도 대조 필요.

## 7. 준비 중(미리보기) 캠페인 영토 규칙 (v1.2, 2026-11-01)

- 1절의 "FE는 draft_faction_ids를 읽지 않는다"는 유지한다. 대신 미리보기 전용 필드를 추가했다.
  - `campaigns[].status`: `preview` (shelf_map_meta.json의 shelves[].status와 일치. 규칙은 SHELF_MAP_META_SPEC.md 7절).
  - `campaigns[].preview_faction_ids`: status가 preview일 때 FE가 `faction_ids`처럼 읽어 그릴 세력 id 배열.
  - `campaigns[].preview_priority`: `priority`와 같은 규칙(앞쪽이 아래, 뒤쪽이 위).
  - `campaigns[].preview_as_of`(ch18만): 윤곽 기준 시점 표기. `preview_note`: 제작용 비표시.
  - `faction_ids`/`priority`는 계속 빈 배열(활성 전). 활성화 시 preview_* 값을 faction_ids/priority로 옮기고 status를 active로 바꾼다(`draft_faction_ids`는 보관).
- FE는 status:'preview'에서 영토 색칠·국호 판·label_pos·면책 문구를 active와 동일하게 그린다.
- 시대 정합 재점검(SPEC §5 재수행): 11~20 모두 해당 시기에 없는 국호 없음. 수정 사항은 다음과 같다.
  - ch12_liu: 208년 하구 일대 폴리곤 1개만 남기고, 209년 형남 4군 폴리곤은 `ch12_liu_jingnan_209`로 분리(미리보기 제외). label_pos를 하구 부근으로 이동.
  - ch19_crusader: 키프로스 폴리곤(1191년 이후)을 low로 변경.
  - ch18_mongol: 이름을 '대몽골 울루스'로, 윤곽 기준을 1219~1223년으로 명시. 신규 `ch18_jin`(금, low), `ch18_xixia`(서하, 핵심부 medium+서쪽 low) 추가. `ch18_khwarazm`은 '호라즘 제국'으로 명칭만 정리(전 경계 low 유지).
  - low 유지/표기 세력: ch11 거란(국호 verify), ch12 유비, ch13 당, ch14 수, ch16 부르고뉴 저지대, ch17 아케메네스, ch18 호라즘·금, ch19 십자군. 마케도니아 이집트 남단과 ch11 고려 동북 경계는 근사값(폴리곤 단위로만 신뢰도 표기 가능해 폴리곤 분할은 하지 않음).
- 미리보기 우선순위: ch11 [거란, 송, 고려], ch12 [조조, 손권, 유비], ch13 [당, 백제, 신라], ch14 [수, 고구려], ch15 [카르타고, 로마], ch16 [잉글랜드, 프랑스, 부르고뉴], ch17 [아케메네스, 마케도니아], ch18 [호라즘, 금, 서하, 대몽골], ch19 [아이유브, 십자군], ch20 [다케다, 오다·도쿠가와].

## 8. 국호 판 plaque 자국 문자 구조 (v1.2)

plaque가 있는 모든 세력(29개)에 아래 필드를 추가했다. 기존 `text/script/evidence/note`는 호환을 위해 유지한다. FE는 `native`가 있으면 큰 글자로 `native`를, 작은 병기로 `ko`를 쓰고, `native`가 null이면 한글 국호(`ko`)를 큰 글자로 쓴다. plaque가 null인 점령·진군 보조 세력은 변경 없음(label_caption 사용).

- `native`: 당대 자국 문자로 쓰던 국호. 로마자 병기는 넣지 않는다(라틴어·프랑스어처럼 해당 언어가 라틴 문자인 경우만 예외).
- (v1.2 보강) `native`는 판에 올리는 짧은 통용형(대략 12자 이내), 긴 정식 명칭은 `native_full`(비표시, 로마·프랑스·잉글랜드·부르고뉴·마케도니아·십자군 6개). `ko`는 판 하단 작은 한글 병기용 짧은 형이고 긴 설명은 `name_period`에 둔다.
- `native_script`: han | latin | greek | arabic | cyrillic | other. other일 때 `native_script_name`(예: old_persian_cuneiform).
- `native_lang`: 언어 코드 가안. lzh(한문), ja, la(라틴어), frm(중세 프랑스어), grc(고대 그리스어), peo(고대 페르시아어), ar, fa.
- `native_evidence`: accepted | needs_verify. `native_basis`: 한 줄 근거(비표시).
- `native_diacritics`: 악센트·발음 부호 글리프 필요 여부(라틴·그리스). `modern_spelling`: 현대·고전 정서법을 쓴 경우 true(당대 철자 확증 없음). `native_rtl`: 오른쪽에서 왼쪽 쓰기.
- (v1.3) `native_script`에 `mongolian` 추가(전통 몽골 문자, 폰트 후보 Noto Sans Mongolian, `native_lang` mon). 현재 ch18_mongol만 사용. 새 필드: `native_vertical`(true면 원래 세로쓰기 문자), `native_rotate_cw`(가로 배치용 힌트, 글자를 시계방향으로 회전시킬 각도. 270(= 반시계 90° 눕힘)이면 세로 문자를 눕혀 좌→우 가로 읽기로 표시. 초기 값 90은 렌더 방향이 반대라 270으로 정정), `native_alt`(대체 표기. 폰트 미지원 시 FE 대체용, 예: 大蒙古國; `native_alt_script`·`native_alt_lang`가 짝). 철자 근거는 `native_evidence`·`native_basis`.
- `ko`: 작은 글자 병기용 한글 표기. `reading`: 한자 국호의 한글 독음(한자 아닌 경우 null).
- 몽골 문자(세로쓰기), 거란 대자·소자, 서하 문자, 여진 문자, 푼 문자는 폰트·정서 문제로 쓰지 않고 한문 통용 표기 또는 라틴 통용 표기로 대체했다.

### 폰트가 필요한 문자 체계 (윤프론 웹폰트 결정용)
| native_script | 해당 세력 | 폰트 후보 | 비고 |
|---|---|---|---|
| han | 조선·일본·명·고려·거란·송·조조·손권·유비·신라·백제·당·고구려·수·대몽골·금·서하·오다·도쿠가와·다케다 | Noto Serif/Sans CJK(KR 또는 SC). 織田·德川 같은 구자체 포함 확인 | 한국식 자형 기본 권장, 일본 가문명은 JP 자형 선택 가능 |
| latin | 로마, 카르타고, 프랑스, 잉글랜드, 부르고뉴, 십자군 | 악센트 지원 라틴 세리프 | é(부르고뉴, ch16)만 확인하면 충분. 나머지는 ASCII |
| greek | 마케도니아 | Noto Serif Greek 등 | 악센트 ό 포함 |
| arabic | 아이유브, 호라즘 | Noto Naskh Arabic / Amiri | RTL, 글자 연결 필요 |
| other(old_persian) | 아케메네스 | Noto Sans Old Persian | 글리프 미지원이면 native를 null로 두고 한글 사용 |
| cyrillic | 없음 | - | 이번 캠페인에 해당 없음(루스는 부록 후보) |

### needs_verify 많은 항목
거란(大契丹), 로마(SPQR 전체형), 카르타고(Carthago는 로마측 호칭), 프랑스·잉글랜드·부르고뉴(중세 철자·공문서 언어), 마케도니아(Μακεδόνες 용례), 아케메네스(Pārsa 설형), 대몽골(大蒙古國 용례), 호라즘(언어), 아이유브(공식 국호 여부), 십자군(Regnum Hierosolymitanum 철자), 조조·손권·유비(인물명 세력), 서하(통칭).

## FE 사본·동기화 (윤프론, 2026-11-02)
- FE는 `resources/js/game/data/shelf_territories.json` 사본을 지연 청크로 읽는다(`campaignMapData.loadTerritories`). `shelf_map_meta.json`과 같은 방식. 원본(이 폴더)이 기준이다.
- 원본을 수정한 뒤: `node resources/js/game/tools/check_data_sync.mjs --fix`(사본 복사) -> `node resources/js/game/tools/check_data_sync.mjs`(동일 확인, 다르면 exit 1). meta·territories 두 쌍을 함께 검사한다.
- 국호 `plaque.native`/`native_alt` 글자가 바뀌면 폰트 서브셋도 다시 만든다: `node resources/js/game/tools/build_plaque_fonts.mjs`(네트워크 필요, 결과 `public/fonts/plaque/*.woff2` + `resources/js/game/data/plaque_fonts.json`). 서브셋에 없는 글자가 있는 판은 한글(또는 native_alt) 큰 글자로 폴백한다.
