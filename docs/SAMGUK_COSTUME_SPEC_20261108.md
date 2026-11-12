# 삼국 복식·무장 고증 명세서 (2026-11-08, 송서사)

용도: 안아트의 신라·백제·고구려(·가야·발해) 영웅 초상/유닛 스프라이트 재제작 대상 확정과 프롬프트 작성.
이 문서는 이미지를 만들지 않는다. 기존 파일·앱 코드·DB는 수정하지 않았다.

## 0. 조사 범위와 한계 (먼저 읽을 것)

- 조사 방법: WebSearch/WebFetch로 학술 초록(KCI·koreascience), 한국민족문화대백과(encykorea), 한국학중앙연구원 위키, 언론의 발굴 보도, 중국 정사 원문(wikisource)을 교차 확인했다.
- 읽지 못한 것: koreascience의 스캔 PDF 본문(고구려 투구 분류 논문 등)은 이미지 PDF라 텍스트 추출에 실패했다. 해당 항목은 초록·검색 요약만 근거이므로 수준을 낮춰 표기했다.
- 박물관 소장품 번호(신수/본관 번호): e뮤지엄 DB를 조회하지 못했다. 이 문서에는 확인된 국보·보물 지정번호만 적고, 나머지는 "소장품 번호 미확인(verify)"로 둔다. 안아트가 e뮤지엄(emuseum.go.kr)에서 도판을 보며 최종 확인하기를 권한다.
- 개발 DB(docker laravel-app-app-1): 이번 작업 환경에 셸 도구가 없어 직접 조회하지 못했다. 6장의 영웅·NPC 목록은 `database/data/*.json`(heroes.json, npc_roster_*.json, heroes_candidates.csv), `public/assets` 파일 존재 여부로 만들었다. 값이 DB와 다를 수 있어(예: 흥수의 병종이 stats 파일과 enemy_final 파일에서 다름) 6.5절의 읽기 전용 SQL로 대조해야 한다.
- 이 세션에서 만든 현행 이미지 진단(2장)은 초상 2점·스프라이트 1점을 직접 본 소견이다. 전수 검수가 아니다.
- 근거 수준: confirmed(1차 사료·출토품·벽화로 직접 확인) / accepted(학계 통설, 2차 자료 일치) / verify(단일 약한 출처, 추정, 미확인) / design(고증이 아니라 게임 표현 설계 제안).
- 대사·화면에 사실/가설 표기를 넣지 않는다는 기존 결정에 따라, 이 표기는 이 문서와 안아트 작업 메모에만 쓴다.

## 1. 핵심 결론 (재제작 지침 요약)

1. 한반도 삼국은 한족 장수처럼 그리지 않는다. 가장 쉬운 구별 단서는 (a) 통소매의 짧은 저고리(삼/유)와 큰 입 바지(대구고), (b) 소매가 넓고 길이가 긴 한족식 대수포·치마(裳) 부재, (c) 관모: 절풍·책·조우(깃), 백제 오라관+금/은화 관식, 신라 금관·금동관·고깔형 모자, (d) 가죽띠와 가죽신이다. (2장, 4장)
2. 갑옷은 "철판 소찰을 끈으로 엮은 찰갑(lamellar)"이 한반도 삼국의 기본이다. 물고기비늘(둥근 끝 scale) 갑옷, 쇠사슬(mail) 목가리개, 서양식 스팡겐헬름(코가리개·볼가리개·끝 뾰족한 첨두 장식)은 근거가 없다. 현행 계백 초상은 비늘갑옷+쇠사슬 목가리개+망토라 서양·중앙아시아풍이다. (2장)
3. 백제 갑주는 시기별로 달라야 한다. 한성기(3~5세기)는 판갑·찰갑 혼재(전남 고흥 길두리 안동고분처럼 왜계와 닮은 횡장판 판갑 예가 있어 논쟁 중), 사비기(6~7세기)는 칠피(옻칠 가죽) 찰갑이 실물로 확인된다(공산성 645년 명문 갑, 부여 관북리·익산토성). 계백(660)은 칠피 찰갑이 근거가 가장 좋다. 일본 단갑·대륜갑·코자네·오소데 형은 금지. (3.2절)
4. 백제는 "戎事則不(전쟁 때는 관의 날개를 달지 않는다)"는 『주서』 기록이 있어, 전투 장면의 백제 장수에게는 금화·은화 관식을 달지 않는 것이 고증에 맞는다. 의례 장면(조회·제사)에서만 관식을 단다. (3.2절)
5. 신라는 시기를 반드시 나눈다. 금관·금동관(입식관)은 5~6세기 초 적석목곽분 시기 유물이다. 7세기 중엽 이후(진덕왕 3년, 649)에는 당제 의관(복두·단령)이 남성 관복에 도입된다. 김유신(595~673)·김춘추(603~661)·문무왕 시기의 관복은 649년 이후 당제와 고유 복식의 이중 구조다. (3.3절)
6. 따라서 진행 중인 김춘추 "신라 금관 미남" 건은 게임 아이콘·상징으로는 쓸 수 있으나, 고증으로는 5~6세기 마립간기 의장이다. 7세기 중엽 정복은 복두+단령(또는 당 태종에게 받은 의대)이 맞다. 이 불일치를 안아트·기획이 인지한 채 결정해야 한다(권고는 3.3절, 6.2절). 수준: 금관의 시기 = accepted, 김춘추 개인 복식 = verify.
7. 고구려 7세기 장수(을지문덕·연개소문)는 벽화 대부분이 4~6세기 것이라 7세기 직접 도상이 부족하다. 절풍/책+조우, 통소매 삼, 대구고, 흰 가죽띠, 황색 가죽신, 찰갑(+마갑)으로 가고, 사실 구성은 verify로 둔다.
8. 7세기 고구려·백제에는 중국식과 겹치는 갑주 명칭이 사료에 실제로 있다(고구려 명광개, 백제가 당에 보낸 금칠 갑). 따라서 "중국풍 갑옷은 절대 안 된다"가 아니라, 한족 장수의 시그니처(대수포·호두(虎頭) 견갑·긴 깃털 술·붉은 장수 술띠·운두리)를 빼고 찰갑 중심으로 구성한다. (4장)

## 2. 현행 이미지 진단 (직접 열람한 3점)

| 파일 | 관찰 | 문제 | 근거 판단 |
|---|---|---|---|
| public/assets/portraits/gyebaek.png (계백) | 반구형 투구에 첨두 장식과 리벳 띠, 쇠사슬 형태의 목가리개, 둥근 끝 비늘 갑옷, 갈색 망토, 서양식 십자 검자루 | 비늘(scale)·사슬(mail)·망토·서양 검 형태는 삼국 출토 근거 없음. 백제는 직사각 소찰 찰갑(둥근 모서리, 구멍 2~3 줄 엮음) | 판단: design 위반. 근거 문서: 3.2절 |
| public/assets/portraits/kim_yusin.png (김유신) | 직사각 소찰 찰갑은 방향이 맞음. 코가리개+볼가리개 달린 스팡겐헬름, 첨두 장식, 파란 망토, 서양형 십자 검자루 | 투구·망토·검 형태가 중세 서양/중앙아시아풍. 신라 투구는 만곡종장판주(철판을 세로로 이어 복발로 마감)나 차양주 | 판단: design 위반 |
| sprites/64_x2/hero_gyebaek_ally.png | 투구+검은 갑옷+망토 실루엣 | 64px에서 "삼국"으로 읽히게 할 단서(깃·절풍·관식)가 없음, 망토가 서양 기사 느낌 | 판단: 실루엣 단서 부재 |

일본·중국 혼동의 원인으로 추정되는 것: 꼭대기 첨두, 뾰족한 코가리개 투구, 어깨의 큰 판(오소데 느낌), 소매 넓은 포, 망토. 모두 제거 대상이다.

## 3. 국가별 명세

### 3.1 고구려 (서기 4~7세기)

주 근거 자료: 안악 3호분(357, 황해남도), 덕흥리 고분(408), 무용총·각저총·삼실총·장천1호분(집안, 5세기), 수산리 고분(5세기 말), 쌍영총(5세기 말), 약수리·대안리·개마총·감신총·강서대묘(5~7세기), 아차산 4보루(6세기 중엽 이전 군사 유적, 서울), 중국 정사(『삼국지』『주서』『신당서』).

| 항목 | 명세 | 출처 | 수준 |
|---|---|---|---|
| 일반 관모 | 절풍(折風): 『삼국지』 동이전은 소가(小加)가 쓰는 "折風, 形如弁"이라 기록. 벽화에서는 앞뒤가 뾰족하게 접힌 삼각 고깔형 모자 | 『삼국지』 동이전 고구려(원문 본 세션 미직접확인, 구당서·신당서 인용으로 교차); encykorea E0052429(조우관)에서 절풍에 새깃 서술 | accepted |
| 고위 관모 | 책(幘): 대가·주부가 쓰는 뒤가 없는 관(『삼국지』). 7세기 문헌: 관이름 骨蘇(소골), 紫羅(자색 비단)로 만들고 금은으로 장식 | 『주서』 고구려전 "其冠曰骨蘇, 多以紫羅為之, 雜以金銀為飾"(wikisource 본문 확인) | confirmed(문헌) |
| 신분 표지: 새깃(조우) | 관품이 있는 자는 관에 새깃 2개를 꽂는다. 대신 푸른 비단 관(青羅冠), 그다음 붉은 비단 관(絳羅冠)에 새깃 2개, 금은 섞은 장식 | 『주서』 "其有官品者, 又插二鳥羽於其上"; 『신당서』 고려전 "大臣青羅冠, 次絳羅, 珥兩鳥羽, 金銀雜扣"(wikisource 확인) | confirmed(문헌) |
| 벽화 속 조우관 | 절풍에 천연 새깃. 개마총은 금속제 조우 장식. 감신총에는 투구에 조우 장식 | encykorea E0052429 | confirmed(벽화·보고) |
| 왕 | 5채(五彩)의 옷, 흰 비단(白羅) 관, 금 장식 가죽띠 | 『신당서』 "王服五采, 以白羅制冠, 革帶皆金扣" | confirmed(문헌) |
| 상의 | 통소매 삼(衫)·저고리, 남자는 허리 아래 길이의 겉옷. 여자는 치마+저고리(裙襦), 소매·깃·자락에 선(襈) 장식 | 『신당서』 "衫筒袖"; 『주서』 "丈夫衣同袖衫"; "婦人服裙襦, 裾袖皆為襈" | confirmed(문헌) |
| 하의 | 큰 입 바지(대구고, 大口袴) | 『주서』·『신당서』 | confirmed |
| 띠·신 | 흰 가죽띠(白韋帶), 황색 가죽신(黃革履) | 『주서』·『신당서』 | confirmed |
| 일반 병사 | 서민은 褐(거친 천)옷에 변(弁) 형 모자. 수렵·군사 장면의 하층은 짧은 저고리+바지+장화, 머리는 상투나 두건 | 『신당서』 "庶人衣褐, 戴弁"; 한성대 DSpace 두발 연구(상투·건 구분); 서울신문 1995 기사 | accepted |
| 흑건 | 하층의 활동용 두건 | 복식 연구 요약(search 결과) | verify |
| 갑옷(보병·장수) | 찰갑(소찰 갑). 벽화 속 창수는 둥근 투구에 상모(깃/술)를 달고 비늘 모양으로 보이는 소찰 갑옷. 안악3호분 기병은 동환식(銅環式) 찰갑으로 추정되는 해석이 있음. 덕흥리에는 판갑형 해석도 있음 | koreascience JAKO199471663776043, JAKO200011920807280, 김성태·김정자 논문(초록 단계) | accepted(벽화 해석), 세부 verify |
| 중갑 기병(개마무사) | 사람과 말 모두 철찰갑. 약수리·안악3호분·쌍영총·개마총·삼실총 벽화에 등장. 말갑옷의 소찰은 3~29cm 철편을 엮음(검색 요약). 지휘관급 기병은 몸통·팔·다리까지 중무장, 하급은 부분 갑 | koreascience 검색 요약, 쪽샘 마갑 보도(서울신문 2020-04-08) | accepted |
| 투구 | 복발(정수리 덮개)+가죽끈으로 연결한 소찰(아차산 4보루 철제 투구, 실물). 벽화에서는 종장판주(세로 철판 이음)·만곡종장판주·복발형 등 여러 형식이 보고됨(분류 논문 초록). 상모(깃·술)와 조우 장식 | 한국학중앙연구원 위키 "아차산 4보루 철제 투구"; koreascience JAKO200011920807280 초록 | 아차산 투구 confirmed(실물), 벽화 분류 verify |
| 무기 | 환두대도, 철모(창)·극, 도끼, 쇠뇌, 활. 『주서』: 兵器有甲弩弓箭戟矟矛鋋 | wikisource 『신당서』/『주서』 확인, 김성태 논문 초록 | confirmed(문헌) |
| 활 | 고구려 마상 수렵용 활 길이 약 80cm라는 연구자 주장(언론 인터뷰) | 서울신문 2014 | verify |
| 연개소문 | "佩五刀(칼 다섯 자루를 찬다)"이 사료에 있음 | 『신당서』 고려전 | confirmed(문헌) |
| 승려 | 5세기 후반~ 불교 도상(수산리·쌍영총 불교 요소). 승복 형태 직접 근거 부족 | - | verify |
| 7세기 후반 사절상 | 아프라시압(사마르칸트) 벽화의 조우관 쓴 두 사절: 조우관+환두대도. 고구려설이 우세하나 신라설도 있음(이견) | news1 2023, imaeil 2012 | accepted(고구려설 우세), 귀속 verify |

고구려 색상(design, 근거: 문헌의 청·강·자·백·황 + 벽화 안료 관찰, 정확한 헥스값은 verify)
- 왕: 백(흰 비단 관), 5채(오방색 안배: 청·적·황·백·흑 포인트), 금.
- 대신: 청(#2F5D8C), 강(진홍 #9C2F2F), 자(#5B3A7A), 금 포인트.
- 장수·병사: 황갈, 갈색 가죽, 흑·회철, 붉은 상모.
- 벽화에서 흔한 색: 적·황·녹·흑. 갑옷은 철회색에 가죽끈 흑·적.

고구려 실루엣 키워드: 삼각 고깔(절풍)+2개 깃, 몸에 붙는 통소매 짧은 상의, 허리 가죽띠, 통 넓은 바지가 장화에 들어감, 찰갑은 직사각 소찰 가로줄.

### 3.2 백제 (서기 4~7세기)

주 근거 자료: 무령왕릉(523 매장; 금제 관식 국보 154호, 왕비 관식 155호, 국립공주박물관), 나주 신촌리 9호분 금동관(국보 지정, 높이 25.5cm), 고흥 길두리 안동고분(금동관모·금동신발, 철제 갑주), 공주 수촌리·서산 부장리·익산 입점리·천안 용원리 금동관, 부여 능산리 금동대향로(성왕기 538~554년 제작 추정), 공산성 칠피 찰갑(645년 명문), 부여 관북리·익산토성 칠피 갑옷 조각, 천안 두정동 철기(4세기 판갑 해석), 풍납·몽촌토성, 『주서』 『신당서』 백제전.

| 항목 | 명세 | 출처 | 수준 |
|---|---|---|---|
| 왕 평상복 | 큰 소매 자색 포(大袖紫袍), 푸른 비단 바지(青錦袴), 소박한 가죽띠(素皮帶), 검은 가죽신(烏革履), 금꽃 장식 오라관(烏羅冠飾以金花) | 『신당서』 백제전(wikisource 확인); 『주서』에도 유사 서술 | confirmed(문헌) |
| 관료 | 붉은(絳) 옷, 관에 은꽃 장식(銀花). 6품 이상 관은 은화 장식. 민은 붉은·자색 옷 금지 | 『신당서』; 『주서』 "六品已上, 冠飾銀華"(wikisource 확인) | confirmed(문헌) |
| 허리띠 색(관등별) | 7품 장덕 자대, 8품 시덕 조대, 9품 고덕 적대 … 13~16품 백대 | 『주서』 | confirmed(문헌) |
| 전투 때 관 | "若朝拜祭祀, 其冠兩廂加翅, 戎事則不" — 조회·제사에는 관 양쪽에 날개를 다는데 전쟁 때는 달지 않음 | 『주서』(wikisource, encykorea 조우관에도 인용) | confirmed(문헌) |
| 관식 실물 | 무령왕 금제 관식: 불꽃 모양 금판, 인동 문양이 중앙으로 모임, 높이 30.7cm와 29.2cm 한 쌍, 두께 약 2mm. 아래 고리로 관모에 끼워 좌우나 앞뒤에 꽂았다고 추정 | smarthistory·Korea JoongAng Daily·한국학중앙연구원 위키(검색 결과) | confirmed(실물), 착용법 verify |
| 지방 위세품 | 금동관(신촌리·길두리·수촌리 등)은 중앙이 하사한 위세품으로 해석(일반적). 문헌 의관제에는 금동관 규정이 없음 | kyobo 4010020822005 등 검색 요약 | accepted |
| 상의 | 남자: 복삼(服衫)과 포(袍), 한성기 소매는 겨드랑이 쪽이 넓고 손목 쪽이 좁은 사선, 사비기는 반대(겨드랑이 좁고 손목 넓음). 여자: 유, 반비, 의삽포. 『주서』: 남자 복식은 고구려와 대략 같음, 여자 옷은 포와 비슷하고 소매가 약간 큼 | 숙명여대 채금석 논문 초록(Sookmyung), 『주서』 | accepted |
| 하의 | 곤(褌), 궁고(窮袴), 대구고(大口袴) | 채금석 논문 초록 | accepted |
| 금동대향로 주악상 | 앞이 트인 상의에 넓은 소매, 높은 허리 맨 선, 긴 치마. 선 장식이 모두 직선이라는 연구. 5악사 머리형이 동진 도용과 유사하다는 지적 | koreascience JAKO200423659444071 등 | accepted(향로 도상), 해석 verify |
| 갑옷(한성기) | 판갑(천안 두정동 4세기 해석, 목가리개·어깨가리개, 통형이라 여닫이 없음), 찰갑(철·청동·가죽 재료별 분류; 몽촌토성 뼈 찰갑 보고). 고흥 길두리 안동고분: 차양주(챙 달린 투구)·견갑·횡장판혁철판갑 및 다량의 파편 | koreascience JAKO201718054546486(재현 연구), kyobo 4010027763860(두정동), kyobo 4010024829808(길두리 복원) | accepted(구성), 계통(왜계 vs 백제계) verify |
| 갑옷(사비기) | 칠피(옻칠 가죽) 찰갑. 공산성 성안마을 저수시설에서 "정관 19년(645)" 붉은 글씨 명문이 있는 찰갑 1령이 출토(국립공주박물관/공주대 박물관). 문헌의 명광개일 가능성 거론(옻칠·가슴 양쪽 호심 판). 현재 흑색이나 원래 황칠이 변색된 것인지는 미확인 | 서울신문 2011-10-13, 경향신문 2011-10-13 | confirmed(출토·명문), 명광개 동일시 verify |
| 갑옷(7세기 말) | 부여 관북리(사비 궁궐터 추정) 6개 구덩이에서 칠피 찰갑 조각. 2구덩이 보존이 가장 좋은 조각 약 18.2×49.2cm. 소찰 길이 7.5~7.8cm×폭 4.2~4.4cm, 직사각형에 모서리가 둥글고, 구멍 지름 0.2~0.3cm. 일부는 폭 2~3cm라 사람 갑옷일 가능성, 등자·말턱뼈 출토로 마갑 가능성도 있음(국립부여문화유산연구소 제16차 발굴, 2024-02-27 발표) | Daum News 2024-02-27 | confirmed(출토품), 용도 verify |
| 익산토성 | 집수시설에서 옻칠 갑옷 조각 | Daum News 2024-05-30 | confirmed(보도) |
| 투구 | 1994년 개설서는 "백제 투구와 방패는 아직 발견되지 않았다"고 기술. 이후 고흥 길두리의 차양주 보고가 있어 한성기 투구 1점은 존재. 사비기 투구는 실물 미확인 | 서울신문 1994 '무구의 특징'; kyobo 4010024829808 | 사비기 투구 = verify (design으로 처리) |
| 백제 성격 | 백제 무기는 비교적 부드러운 형태, 강한 철기 기술. 『신당서』는 해상 교역에 의지해 戎械를 닦지 않는다고 서술 | 서울신문 1994; 『신당서』 | accepted(문헌 평가) |
| 무기 | 환두대도(신촌리 삼엽문·단봉, 무령왕릉 용문환두대도), 방추형·검신형 창, 쇠도끼, 쇠갈고리·쇠낫(기병전), 활(신촌리 출토 만궁 추정)·쇠뇌, 마름쇠(부소산성). 『주서』: 兵有弓箭刀矟 | 서울신문 1994, 『주서』 | confirmed(출토품) |
| 해외 증거 | 『신당서』에 백제가 당에 금칠 갑("上金旐鎧")과 현금 문양 갑("玄金爲山五文鎧")을 보냈다는 구절 | 『신당서』(wikisource 확인; 구절 해석은 verify) | 문헌 존재 confirmed, 형태 verify |
| 승려 | 백제 승려 복식 직접 근거는 이번 조사에서 못 찾음 | - | verify |

백제 색상(design): 왕 자(#5E3B82)·청(#2B4C7E) 비단·금, 관료 강(진홍 #A33A2F), 은화, 병사 흑옻칠 갑(흑갈 #2A211B)+적갈 끈, 검은 가죽신.

백제 실루엣 키워드: 의례복은 큰 소매 포+검은 비단 오라관+좌우로 솟는 금/은 불꽃 관식. 군복은 관식 없이 검은 칠 가죽 찰갑(직사각 둥근 모서리 소찰). 사비기 소매는 겨드랑이 쪽이 좁고 손목 쪽이 넓다는 연구가 있으나(accepted), 갑옷 아래 소매는 걷어 올린 모양으로 단순화한다(design).

### 3.3 신라 (서기 4~7세기, 통일 직후 포함)

주 근거 자료: 금관총·천마총·황남대총·서봉총·금령총(적석목곽분, 5~6세기 초), 쪽샘 C10호(5세기 전반, 2009 발굴, 찰갑·마갑), 황남동 1호 목곽묘(4세기 말~5세기 초, 2025 발표), 금령총 기마인물형 토기(국보 91호, 국립중앙박물관), 경주 재매정 갑옷(통일신라), 사천왕사 녹유신장벽전(679, 국립경주박물관), 『신당서』 신라전, 『삼국사기』.

| 항목 | 명세 | 출처 | 수준 |
|---|---|---|---|
| 금관 | 대륜(띠)에 山자·出자 입식(세움 장식)과 사슴뿔형, 곡옥·달개 장식. 현존 신라 금관 6점(황남대총 북분·금관총·천마총 국보, 서봉총·금령총 보물, 교동 금관 진위 논란) | 국립경주박물관 특별전 '신라 금관, 권력과 위신' 보도(imaeil, khan 2025) | confirmed(출토품) |
| 금관 시기 | 적석목곽분 시기(5세기~6세기 초) 유물. 7세기 중엽 왕의 금관 착용 근거는 확인 못함 | 위 보도, 천마총 5~6세기 | accepted, 7세기 왕에게 적용은 verify |
| 고깔형 금관모 | 천마총 금제 관모(국보 189호), 금제 조익형 관식(보물 618호): 절풍형 모자에 새 날개 모양 금속 장식 | encykorea E0052429 | confirmed(출토품) |
| 은관 | 황남대총 남분 은관(보물 631호): 대륜에 입식 3개. 의성 탑리 금동관·황남대총 남분 은관에서는 깃털 표현이 보인다 | encykorea E0052429 | confirmed |
| 금동관 | 쪽샘 44호분 금동관(5세기 말, 추정 높이 약 18cm, 어린 왕족 여성 추정). 황남동 1호 목곽묘 금동관 일부(4세기 말~5세기 초, 신라 왕경 최고(最古)) | 서울신문 2025-10-21, weekly.khan | confirmed(보도) |
| 금허리띠 | 천마총 금제 허리띠: 금판 띠꾸미개 44매, 13줄 금제+2줄 금동제 드리개. 고구려·중국 진대 조형의 영향 평가 | encykorea E0007974 | confirmed |
| 기마인물 | 금령총 주인상: 앞뒤가 뾰족한 보관(턱끈), 갑옷, 오른쪽 허리에 칼, 고삐. 시종상: 관 대신 띠 장식, 갑옷 없이 저고리, 어깨에 포대 짐 | 서울신문 1995-02-24; koreascience JAKO201368440975843(6세기 전반 복식·마구 고증) | confirmed(유물), 연대 5세기말~6세기 초 |
| 5세기 투구·갑옷 | 쪽샘 C10호: 만곡종장판주(철판을 길게 잘라 이어 복발로 덮음, 228장 복원)·경갑(목가리개, 65장)·찰갑(몸통 925장)·마갑. 두께 0.8mm 철판 | 서울신문 2013-04-25; 서울신문 2020-04-08(마갑 복원) | confirmed(복원 보고) |
| 금동 찰갑 | 금관총 출토 금동제 소찰 갑옷: 한반도 유일(보고). 투구는 금동제 복발 1점 | 국립경주박물관 2016 보고서 초록(earticle, kyobo 4010071591558) | confirmed(보고서 초록) |
| 판갑→찰갑 | 4~5세기 신라·가야는 판갑에서 찰갑으로 점진 이동, 전업 공인집단이 소량 생산 | 김혁중 2019 『중앙고고연구』 29 | accepted |
| 통일신라 갑옷 | 경주 재매정 출토 갑옷: 몸통갑(신갑)·허리갑(상갑)·팔갑으로 몸통과 허리가 분리, 몸통은 옆 여밈, 목가리개는 출토 못함. 소찰은 대부분 바깥에서 안쪽으로 접음 | 조현진 2021 『복식문화연구』 29(1) | confirmed(논문 초록). 연대·인물 귀속은 verify (재매정은 김유신 가택 터 전승이 있으나 이 갑옷의 소유자 귀속은 근거 없음) |
| 신장상 갑옷 | 사천왕사 녹유신장: 날개 달린 투구, 화려한 갑옷, 칼·화살. 불교 수호신 도상이라 일반 병사 복식으로 쓰면 안 됨 | 국립경주박물관 2018 전시 보도; earticle A209385 | confirmed(도상), 일반화 금지 |
| 520년 공복 | 법흥왕 때 율령 반포와 관리 공복 제정, 관등별 색 구분 설명(자·비·청·황). 1~5관등 자색, 6~9 비색, 10~11 청색, 12~17 황색, 자색은 사실상 진골 | 골품제 해설(itwiki, 한능검 해설) — 2차·약한 출처. 『삼국사기』 원문 확인 못함 | verify |
| 신라 일반 복식(7세기 당 기록) | 조복은 흰색을 숭상(朝服尚白), 남자는 거친 천 바지(褐褲), 머리를 자르고 검은 두건으로 덮음, 여자는 긴 저고리, 머리를 둘러 감고 구슬과 채색으로 장식 | 『신당서』 신라전(wikisource 확인) | confirmed(문헌 기록, 당 관찰자 서술) |
| 당제 도입 | 진덕왕 3년(649) "始服中朝衣冠"(『삼국사기』 신라본기). 648년 김춘추가 당에 복식 개정을 청했다는 서술. 여성 복식은 문무왕 4년(664) 같은 방향으로 개정(논문 서술). 이후 고유 복식과 당복 병존(이중 구조) | 『삼국사기』 권5 번역(wikisource ko); koreascience JAKO201326940563573, JAKO199811920814685 | accepted |
| 복두·단령 | 당제 관복: 복두(幞頭)와 단령(團領, 깃을 둥글게 한 포). 도입 시기·범위는 자료마다 다름 | 위 논문 및 encykorea 계열 | accepted(방향), 세부 verify |
| 화랑 | 화랑의 구체적 복식 유물 없음. 『삼국사기』 진흥왕 37년 기사(원문 이번 조사에서 직접 확인 못함)에 곱게 단장했다는 서술이 알려져 있음 | - | verify |
| 승려(원효·의상 후보) | 신라 승려 복식 직접 근거는 이번 조사에서 못 찾음. 일반 승복(가사+장삼)을 쓰되 중국 선종풍 형태는 금지 | - | verify |

신라 색상(design): 금(#D8B24A), 적갈(#8A3B2A), 백(조복 흰색, 『신당서』), 청·황·자는 관등색(520, verify), 검은 두건.

신라 실루엣 키워드: (5~6세기) 금관의 가지형 입식+곡옥, 절풍형 고깔 모자에 금제 날개 장식, 금허리띠 드리개, 금동신발. (7세기 관복) 복두+단령. (7세기 군복) 찰갑+만곡종장판주계 투구, 허리 가죽띠, 통 넓은 바지.

### 3.4 가야 (서기 3~6세기)

주 근거 자료: 복천동 38호분 철제 갑옷 일괄(4세기, 보물 제2020호, 복천박물관): 종장판주(투구)·경갑(목가리개)·종장판갑(갑옷) 세트. 김해 대성동 2호분 판갑(오리 문양 철판), 대성동 57호 종장판갑(지판 15매, 반원형 후경판)과 소찰편(경갑·요찰), 대성동 93호 갑주 연대 재검토(4세기). 합천 옥전 M3호분(6세기 후기 금동장 투구, 블로그 수준 출처라 verify). 고령 지산동 44호분(32기 순장덧널, 5~6세기). 전(傳) 고령 금관(국보 제138호, 삼성미술관 리움 소장).

| 항목 | 명세 | 수준 |
|---|---|---|
| 금관 | 대가야 금관: 띠 위에 초화형(꽃 모양) 입식이 앞·좌·우·뒤 4곳. 신라 후기 금관과 닮았으나 대가야 고유 양식이라는 평가. 출토 고분은 확정되지 않음(지산동 44호·45호 설) | accepted(형태), 출토지 verify |
| 갑옷 | 판갑(종장판갑·방형판갑 등)에서 시작, 5세기 후반 대금식 판갑이 찰갑·종장판주와 함께 대형분에 부장 | accepted |
| 시나리오 활용 | 김유신 가문(금관가야 왕족 후예)의 뿌리 장면, 532년 금관가야 병합, 562년 대가야 멸망(이사부·사다함 후보). 7세기 김유신 본인은 신라 군장 복식이 기본 | accepted(역사), 복식 verify |

### 3.5 발해·후삼국·고려 초 (별도 구분, 이번 재제작 범위 밖 권고)

| 구분 | 인물 | 복식 방침 | 수준 |
|---|---|---|---|
| 발해(698~) | 대조영(DB: C/동맹, 초상 thumb 존재) | 고구려 유민+말갈. 이번 조사에서 직접 근거를 찾지 못했다. 8세기 후반 정효공주묘 벽화(792)가 복두·단령의 당풍 관복을 보여 준다는 점만 일반 지식으로 알려져 있음. 고구려풍 찰갑·절풍 계열로 가되 확정 전 verify | verify |
| 후삼국(901~936) | 궁예(후고구려), 견훤(후백제), 왕건 | 후삼국·고려 초 갑주는 이번 조사 범위 밖. 왕건(DB: B 창병, 초상·유닛 있음)은 별도 조사 후 확정 | verify, 재제작 보류 권고 |
| 고려 초(ch11 고려-거란) | 서희, 강감찬, 양규, 김숙흥, 고려 성종·현종 | 포함 여부: 이번 명세에는 포함하지 않음(삼국 복식이 아님). 별도 명세 필요 | 범위 외 |

## 4. 한족(중국) 장수 복식·일본 갑옷과의 구별

### 4.1 중국 한족 장수 시그니처 (삼국 이미지에서 제거)

- 넓고 긴 소매의 대수포(寬袖), 길게 늘어진 치마(裳)·앞치마, 운두리(구름코 신발), 긴 수염에 학자풍 관(진현관·무변관·책), 붉은 장수 술 띠와 긴 꿩깃(Ming/Qing 극 의상 풍).
- 호두(虎頭) 견갑·짐승머리 장식, 큰 원형 호심경(명광개의 가슴 원판) 중심의 갑옷, 깃발·한자 족자.
- 예외: 7세기 사료에 고구려·백제 명광개가 있음(『신당서』 고려전: 당이 명광개 만 령을 노획, 백제가 당에 금칠 갑을 보냄). 허용 규칙은 "가슴 판 호심 요소는 백제 사비기 갑(공산성 추정 명광개)에 한해 최소 1개만"이며 verify.

### 4.2 일본 갑옷과의 구별 (백제·가야 갑주 오인 방지)

사실 관계 요약:
- 5세기 일본 열도의 판갑(횡장판혁철판갑·삼각판혁철판갑)과 충각부주(衝角附冑, 이마가 뱃머리처럼 뾰족한 투구)는 같은 시기 가야·신라·백제 판갑과 형식적으로 겹친다. 고흥 길두리 안동고분의 횡장판혁철판갑과 차양주도 왜계와 닮았다는 논쟁이 있다(한성기 갑주의 일부로 보는 해석, "백제 유적 갑주 전체를 일본산으로 보는 견해는 문제"라는 반론). 이는 백제 갑주 이미지가 일본 갑옷으로 오인되는 실제 이유일 수 있다. 수준: accepted(논쟁 존재).
- 그러나 6~7세기 사비기 백제의 직접 증거(공산성·관북리·익산토성)는 칠피 찰갑이며, 일본 헤이안 이후의 대륜갑(大鎧, 오요로이)·코자네(小札 다색 위엄 끈엮음)·오소데(큰 소매판)·쿠와가타(투구 뿔)·에보시와는 시대와 구조가 다르다. 일본 열도의 7세기 찰갑(케이코)은 한반도 찰갑과 가까워 구별이 어려우므로, 구별 단서는 형태가 아니라 "소재(옻칠 가죽, 철 소찰)·관모·복식"에서 찾아야 한다. 수준: design(일반 지식 + 위 출토 보도).

시각 구분 규칙(design):
- 일본식 금지: 어깨에 달린 큰 사각 판(오소데), 다색 위엄 끈(威)이 줄무늬로 보이는 소찰 배열, 투구 뒤 목가리개가 부채꼴로 펼쳐지는 시코로, 투구 정면의 쿠와가타(뿔 두 개), 에보시, 하카마 폭이 좁은 바지에 짚신(わらじ), 칼날이 한 손으로 휘는 타치형 곡도.
- 허용: 직사각 소찰 가로 줄+모서리 둥근 소찰 한 단, 몸통 가운데·옆 여밈(재매정 갑 옆 여밈 참조), 목가리개는 별도 경갑(고리형 철판), 짧은 깃 없는 어깨(견갑은 소찰 어깨띠).

### 4.3 금지 요소 일괄 (네거티브 근거)

| 금지 | 이유 |
|---|---|
| 서양식 첨두(spike)·코가리개·볼가리개 투구, 망토·케이프, 십자 검자루 | 출토·벽화 근거 없음. 현행 초상의 문제(2장) |
| 쇠사슬(mail) 목가리개, 둥근 끝 비늘(scale) 갑옷 | 삼국은 직사각 소찰 찰갑. 비늘형은 근거 없음 |
| 한족 대수포, 치마(裳), 운두리, 호두 견갑, 중국 경극식 깃술, 한자 깃발 | 4.1 |
| 일본 오소데·코자네 다색 위엄·쿠와가타·에보시·충각부주 | 4.2 |
| 몽골·중앙아시아식 털모자·활집 | 시대·지역 불일치 |
| 백제 장수 전투 장면에 금화·은화 관식 | 『주서』 戎事則不 |
| 신라 7세기 왕에게 마립간기 금관을 기본으로 부여 | 시기 불일치(3.3, 단 상징 표현은 6.2절) |
| 사천왕사 신장상 날개 투구를 일반 신라 병사에 적용 | 불교 도상 |

## 5. 계층별 매트릭스 (국가별 요약)

표기: G=고구려, B=백제, S=신라, Y=가야. 수준은 3장 해당 행을 따름.

| 계층 | 고구려(G) | 백제(B) | 신라(S) | 가야(Y) |
|---|---|---|---|---|
| 왕 | 백라관+금장 가죽띠, 5채 포, 통소매 삼 | 대소매 자포+청금 바지+오라관 금화+검은 가죽신. 전투 시 관식 제거 | (5~6c) 금관+금제 허리띠+곡옥 / (649 이후) 복두+단령 | 초화형 입식 금관(대가야) |
| 귀족·장수 | 청라/강라관+새깃 2, 삼, 흰 가죽띠, 황색 신. 군복은 찰갑+상모 투구 | 관식은 평시만(은화 6품 이상). 군복은 칠피 찰갑, 관식 없음 | 평시 복두·단령(7c)/고유 포. 군복은 찰갑+종장판주계 투구 | 종장판갑·종장판주(4c), 금동 투구(6c) |
| 병사 | 짧은 삼, 대구고, 소찰 갑 또는 가죽 갑, 변·두건 | 직사각 소찰 칠피 갑, 천 두건/가죽 모자 | 소찰 갑+종장판주 단순형, 흰·갈색 천옷 | 판갑·소찰 |
| 궁수 | 절풍+새깃, 짧은 상의, 큰 활(약 80cm 주장, verify)과 화살통 | 무늬 없는 두건, 쇠뇌 옵션, 활 | 흰/갈색 포+가죽 갑옷 | - |
| 기병 | 개마(사람·말 철찰갑), 투구 상모, 철모·환두대도 | 마갑(관북리 조각 해석, verify), 기병 철갈고리 | 쪽샘형 마갑·만곡종장판주, 금령총 기마상 참조 | 대성동 마구·갑주 |
| 승려 | 불교 도상 있으나 승복 근거 부족(verify) | 근거 못 찾음(verify) | 근거 못 찾음(verify) | - |
| 문관·힐러 | 청/강라관+새깃, 긴 삼 | 자/강 포+은화 관 | 복두+단령(7c) 또는 고유 포 | - |

병종 대응 시 주의: mage·healer는 갑옷 없는 의례복(관복·승복·제관 복식) 중심으로 하고, sword·spear는 찰갑, archer는 경장, cavalry는 개마 계열, naval(백강 663)은 수군.

## 6. 영웅·NPC 전수 목록과 복식 지정

### 6.1 읽는 법

- 구분: H=영웅(heroes.json 시드/캠페인 핵심), N=NPC 행(npc_roster_*). 등급·병종은 파일 값이며 DB와 다를 수 있음(6.5 SQL로 대조).
- 초상: public/assets/portraits(영웅) 또는 portraits/npc(NPC)의 webp 존재. 시트: sprites/64_x2 계열 `_ally_sheet.png` 존재. O=있음, X=없음(이번 조사에서 파일 미발견).
- 복식 지정은 3·4장 기준. 한 영웅은 시기(왕/장수)가 겹치면 2벌(평시/전투) 제안.

### 6.2 고구려

| 코드 | 이름 | 구분/등급/병종 | 초상/시트 | 시대·신분 | 복식 지정 | 수준 |
|---|---|---|---|---|---|---|
| gwanggaeto | 광개토대왕 | H/S/기병 | O/O(+v4 변형) | 391~412 왕·기마 군주 | 평시: 백라관+금장+5채 포. 전투: 상모 달린 복발+소찰 투구, 철찰갑, 마갑, 환두대도. 5세기 벽화(덕흥리 408) 근접 | accepted/verify |
| jangsu | 장수왕 | H/A/mage | O/O | 413~491 왕 | 의례복 중심. 백라관+금대, 5채 포, 새깃 불필요(왕은 흰 관) | accepted |
| npc_yeongyang | 영양왕 | N/C/sword | O/O | 590~618 왕 | 7세기 왕복(『신당서』 왕복) | accepted |
| npc_go_geonmu | 고건무(영류왕) | N/C/sword | O/O | 618~642 왕 | 위와 같음 | accepted |
| eulji_mundeok | 을지문덕 | H/A/spear | O/O | 612 살수대첩 군 지휘 | 청라 또는 강라관+새깃 2 / 전투: 상모 투구+찰갑+통소매 삼+흰 가죽띠+황색 가죽 장화+철모. 수의 한족 갑(명광개, 대수포)과 대비 | accepted/verify |
| (연개소문) | 연개소문 | 후보 CSV id110, DB 미확인 | X/X | 642 정변, 665 사망 | 佩五刀(칼 5자루), 금 장식 포, 관은 강라/자라관+새깃(최상위 권신 verify) | 칼 5자루 confirmed, 외형 verify |
| npc_ondal | 온달 | N/B/spear | O/O | ~590 아단성 | 장수 군복(평민 출신 서사, 가죽 갑옷·소찰) | accepted(역사)/verify(외형) |
| npc_yeon_taejo | 연태조 | N/C/healer | O/O | 연개소문 조부 전승(verify) | 문관 관복(청라관+새깃, 긴 삼) | verify |
| npc_yeon_jayu | 연자유 | N/C/mage | O/O | 고구려 중신 가문 | 문관 관복 | verify |
| npc_goguryeo_pisa_captain | 비사성 수비장 | N/C/archer | O/O | 가상 인물 | 절풍+새깃 1, 짧은 상의, 가죽 갑 | invented |
| npc_goguryeo_yalu_ferry_captain | 압록강 도하 감시장 | N/C/archer | O/O | 가상 | 위와 같음 | invented |
| npc_goguryeo_cavalry_captain | 고구려 기병 장수 | N/C/cavalry | O/O | 가상 | 상모 투구, 찰갑, 철모 | invented |
| npc_goguryeo_spear_captain | 장창 부장 | N/C/spear | O/O | 가상 | 철모, 소찰 갑 | invented |
| npc_goguryeo_dam_keeper | 살수 물막이 감독 | N/C/healer | O/O | 가상 | 책 또는 두건, 거친 褐옷 | invented |
| npc_goguryeo_pyongyang_guard | 평양성 수성 장수 | N/C/sword | O/O | 가상 | 찰갑+복발 투구, 환두대도 | invented |
| npc_goguryeo_scout_captain | 척후 대장 | N/C/archer | O/O | 가상 | 경장, 절풍 | invented |

### 6.3 백제

| 코드 | 이름 | 구분/등급/병종 | 초상/시트 | 시대·신분 | 복식 지정 | 수준 |
|---|---|---|---|---|---|---|
| gyebaek | 계백 | H/B/sword(중장갑 후보) | O/O | 660 황산벌 장군 | 전투: 칠피(검은 옻칠) 직사각 소찰 찰갑, 가죽 경갑, 투구는 복발형(design), 관식 제거. 평시: 오라관+은화 관식(6품 이상 가정 verify). 검은 가죽신. 망토 제거 | 갑 confirmed(출토)/투구 verify |
| npc_uija | 의자왕 | N/C/sword | O/O | 641~660 왕 | 대소매 자포+청금 바지+소피대+오라관 금화+검은 가죽신. 금관식(무령왕 관식 형, 6c 초 유물이라 7c 대응은 verify) | confirmed(문헌)/verify(실물) |
| npc_seongchung | 성충 | N/B/mage | O/O | 의자왕기 충신 | 강포+은화 오라관 | confirmed(문헌) |
| npc_heungsu | 흥수 | N/C/(sword 또는 archer) | O/O | 660 | 강포 관료 또는 경장 군복 | verify |
| npc_yunchung | 윤충 | N/B/(cavalry 또는 sword) | O/O | 642 대야성 | 칠피 찰갑+마갑 기병 장비 | verify |
| npc_chungsang | 충상 | N/C/sword | O/O | 660 | 칠피 찰갑 | verify |
| npc_sangyeong | 상영 | N/C/spear | O/O | 660 | 칠피 찰갑+창 | verify |
| npc_buyeo_yung | 부여융 | N/C/sword | O/O | 의자왕 왕자 | 의례: 오라관(금화는 왕 전용 verify, 은화 안전), 군복 | verify |
| npc_ye_sikjin | 예식진 | N/C/(spear 또는 sword) | O/O | 웅진 방령 | 칠피 찰갑 | verify |
| npc_dochim | 도침 | N/C/sword | O/O | 661 부흥군, 승려 출신 전승 | 승려 계열이면 승복+갑 일부(verify), 아니면 강포 | verify |
| npc_boksin | 복신 | N/B/sword | O/O | 부흥군 지도자 | 칠피 찰갑 | verify |
| npc_heukchi_sangji | 흑치상지 | N/B/cavalry | O/X | 부흥군 기병 장수 | 칠피 찰갑+마갑 | verify, 시트 없음 |
| npc_jisu_sin | 지수신 | N/B/spear | O/O | 부흥군 | 칠피 찰갑 | verify |
| npc_buyeo_pung | 부여풍 | N/B/archer | O/O | 왜에 체류했던 왕자 | 의례복+귀국 후 군복(백강 663) | verify |
| npc_asin | 아신왕 | N/C | O/(확인 안 함) | 392~405 한성기 | 한성기 판갑·찰갑+금동관(수촌리·고흥 형 참고) | verify |
| npc_wa_naval_commander | 왜 수군 지휘관 | N/C/naval | O/O | 백강 663, 왜 | 일본 복식 허용 구역(7세기 후반 왜). 찰갑(케이코)·관 | verify |

### 6.4 신라 (가야계 포함)

| 코드 | 이름 | 구분/등급/병종 | 초상/시트 | 시대·신분 | 복식 지정 | 수준 |
|---|---|---|---|---|---|---|
| kim_yusin | 김유신 | H/A/sword | O/O | 595~673, 7세기 장군, 가야계 | 전투: 찰갑(직사각 소찰)+만곡종장판주계 투구(코·볼 가리개 제거), 망토 제거. 평시: 649 이후 당제 복두+단령 또는 고유 포. 허리에 환두대도 | 갑옷 형태 accepted, 투구 verify |
| npc_kim_chunchu | 김춘추(무열왕) | N/C/sword | O/X | 603~661(654 즉위) | 진행 중인 "금관 미남" 초상: 마립간기 금관은 상징 연출로 허용하되 문서상 불일치를 표기. 고증판: 복두+단령(649 이후). 대안 병기: 금관 상징 컷+복두 정복 컷 2종 | 금관 시기 accepted/개인 복식 verify |
| seondeok | 선덕여왕 | H/B/healer | O/O(+pilot) | 632~647 | 649 이전이라 고유 복식. 여성: 긴 저고리(長襦)+긴 치마, 머리를 둘러 감고 구슬·채색 장식(『신당서』 기술), 금동관 또는 금관(5~6c 유물, 상징 허용 verify) | 문헌 confirmed/관 verify |
| (진덕여왕) | 진덕여왕 | 후보 CSV id116, DB 미확인 | X/X | 647~654 | 649 당제 의관 도입 장면의 주인공. 여성복은 664 개정 이전 | accepted |
| npc_beopmin | 김법민(문무왕) | N/C/sword | O/O | 626~681 | 7세기 말 당제 관복 또는 군복 | accepted/verify |
| npc_kim_inmun | 김인문 | N/C/sword | O/O | 신라 장수, 당 활동 | 군복 또는 당제 관복 | verify |
| npc_kim_heumsun | 김흠순 | N/C/sword | O/O | 김유신 동생 | 군복(찰갑) | verify |
| npc_kim_pumil | 김품일 | N/C/sword | O/O | 660 황산벌 | 군복 | verify |
| npc_banggul | 반굴 | N/C/sword | O/O | 660 황산벌 전사 | 청년 무관(찰갑 소형) | verify |
| npc_gwanchang | 관창 | N/C/sword | O/O | 660, 16세 화랑 | 화랑: 곱게 단장한 소년 무사. 화랑 복식 근거 약함: 소찰 경갑+고유 두건 | verify |
| (이사부, 이차돈, 원효, 의상) | - | 후보 CSV id164,165,119,120 | X/X | 6~7c | 군복(이사부)·승복(나머지). 승복은 verify | verify |
| (태종무열왕 H, 문무왕 H) | 후보 CSV id112,113 | | 미확인 | | 위 김춘추·김법민 규칙 준용 | - |
| npc_so_jeongbang | 소정방(당) | N/C/sword | 미확인 | 당 장군 | 중국 복식 허용(명광개·한족 투구). 신라 영웅과 대비 | accepted |

### 6.5 대조 SQL (읽기 전용, 이번 환경에서는 미실행)

아래는 caller가 컨테이너에서 실행하도록 제안하는 쿼리다. 테이블·컬럼명은 시드 JSON 필드를 토대로 한 추정이라 `.schema` 확인이 선행돼야 한다.

```
docker exec laravel-app-app-1 sqlite3 -readonly /var/www/dbdata/database.sqlite ".tables"
docker exec laravel-app-app-1 sqlite3 -readonly /var/www/dbdata/database.sqlite "SELECT code,name_ko,culture,era,region,unit_type,rarity FROM heroes WHERE era IN ('고구려','신라','백제','가야','발해','후삼국') OR culture='korea' ORDER BY era,code;"
```

시드 JSON에서 era가 "고대"(을지문덕·김유신·계백 등)로만 들어 있어 era 컬럼만으로는 국가를 구분할 수 없다. 국가 분류는 이 문서 6.2~6.4 표를 기준으로 하라.

### 6.6 ch13 황산벌·ch14 살수대첩 구분

- ch13 황산벌(660): 백제 12명(윤충·흥수·충상·상영·계백·부여융·의자왕·예식진·도침·흑치상지·지수신·부여풍)+성충·복신, 신라 김유신·김춘추·김흠순·김품일·반굴·관창·김인문·김법민, 당 소정방, 왜 수군 지휘관. 복식은 위 표.
- ch14 살수대첩(612): 고구려 을지문덕·영양왕·고건무·온달·연태조·연자유+직함형 가상 7명. 수(隋) 측 NPC(양제·우문술·우중문·래호아·설세웅·형원항·위문승·신세웅·유사룡·최홍승)는 중국(한족) 복식 정상.
- ch11 고려-거란: 서희·강감찬·양규·김숙흥·대도수·유방(고려 군), 고려 성종·현종, 소배압·소손녕·거란 성종(거란). 고려 초는 이 명세에 포함하지 않음(별도 조사 필요).

## 7. 이미지 생성 프롬프트 블록

공통 규칙: 직사각 소찰 찰갑, 통소매, 큰 입 바지, 가죽띠·가죽신. 서양·일본·중국 시그니처는 네거티브로 막는다. 헥스는 design.

### 7.1 공통 positive(앞에 붙임)

```
Korean Three Kingdoms period (4th-7th century), historically grounded, museum-reference accuracy, tube-sleeved short jacket (samsam/jeogori style), wide baggy trousers (daegugo) tucked into leather boots or shoes, leather belt with plain metal buckle, iron lamellar armor made of small rectangular plates with rounded corners laced in horizontal rows
```

### 7.2 공통 negative

```
western medieval knight, spangenhelm, nasal guard, cheek guards, spiked helmet finial, chainmail, mail coif, scale armor with rounded fish-scale pieces, plate armor, cape, cloak, mantle, cross-hilt sword, Japanese armor, o-yoroi, kozane lacing in bright colors, sode shoulder boards, kuwagata horns, eboshi, kabuto crescent, sengoku samurai, Chinese general costume, wide flowing sleeves, hanfu long robe, cloud-toe shoes, tiger-head pauldrons, feather plume tassels of Beijing opera, Chinese characters on banners, Mongol fur hat, Central Asian steppe armor, fantasy ornament, glowing effects
```

### 7.3 고구려

Goguryeo king:
```
Goguryeo king, 5th-7th century, white silk gauze crown with gold fittings, five-colored robe with tube sleeves, white leather belt with gold plaques, yellow leather shoes, mural-painting style reference (Anak Tomb No.3, Deokheung-ri, Sansuri tomb), dignified, no cape
```
Goguryeo general / officer:
```
Goguryeo general, folded triangular cap (jeolpung) with two upright bird feathers, blue or crimson silk, gold and silver fittings, tube-sleeved jacket, wide trousers, white leather belt, yellow leather boots, iron lamellar cuirass with rectangular plates, ring-pommel sword (hwando daedo), spear (iron mo)
```
Goguryeo soldier / spearman:
```
Goguryeo infantry, iron lamellar armor of small rectangular plates over short tube-sleeved jacket, round iron helmet with fixed dome and small hanging plates (Achasan fort type) with a short red plume, wide trousers, leather boots, iron-tipped spear
```
Goguryeo archer:
```
Goguryeo archer, jeolpung cap with one bird feather, short tube-sleeved jacket, wide trousers, leather belt and boots, short composite bow (about 80 cm), leather quiver, light leather armor
```
Goguryeo cataphract cavalry (gaemamusa):
```
Goguryeo heavy cavalry, rider and horse both covered in iron lamellar armor of small rectangular plates, iron helmet with plume, horse face guard, iron spear, ring-pommel sword, mural style Anak Tomb No.3 and Ssangyeongchong reference
```

### 7.4 백제

Baekje king (court dress):
```
Baekje king, black silk gauze crown (ora-gwan) with gold flame-shaped ornament (gold flower decoration), wide-sleeved purple robe, blue brocade trousers, plain leather belt, black leather shoes, reference: King Muryeong gold crown ornament (National Treasure 154) and Chinese records of Baekje royal dress
```
Baekje general in battle (no crown ornaments):
```
Baekje general in battle, black-lacquered leather lamellar armor of rectangular plates with rounded corners (about 7.5 cm by 4.3 cm each), leather neck guard, plain rounded iron cap-helmet with a small flat top, no crest, no crown ornaments, tube-sleeved dark jacket, wide trousers, black leather shoes, ring-pommel sword with dragon or phoenix motif
```
Baekje official / minister:
```
Baekje minister, crimson robe, black gauze cap with silver flower ornament (rank 6 and above), leather belt in rank color, black leather shoes, narrow sleeves at wrist, calm bearing
```
Baekje soldier:
```
Baekje soldier, lacquered leather lamellar armor, plain cloth cap, tube-sleeved dark jacket, wide trousers, leather shoes, spear or sword
```
Baekje archer:
```
Baekje archer, light lacquered leather armor, cloth cap, quiver, long bow, tube-sleeved jacket, wide trousers
```
Baekje cavalry:
```
Baekje cavalry officer, lacquered leather lamellar armor, horse with lacquered leather lamellar barding on chest and flanks, ring-pommel sword, iron spear
```
Baekje monk (low confidence):
```
Baekje Buddhist monk, simple robe with wide sleeves and a kasaya draped over one shoulder, shaved head, prayer beads, ornamental incense burner reference (Neungsan-ri gilt-bronze censer), no cape
```

### 7.5 신라

Silla king (5th-6th century gold-crown era, symbolic option):
```
Silla king, gold crown with tree-shaped and antler-shaped uprights and curved jade pendants (Cheonmachong, Gold Crown tomb reference), gold belt with hanging ornaments, long jacket with tube sleeves, wide trousers, gilt-bronze shoes
```
Silla king (7th century, Tang-style court dress, after 649):
```
Silla king, 7th century, Tang-style black fuduo official cap (bokdu) and round-collared robe (dallyeong), jade-decorated belt, black boots, Silla court that favored white dress
```
Silla general (7th century):
```
Silla general, iron lamellar armor of small rectangular plates opening at the side, curved vertical-strip iron helmet with a dome cap (Jjoksaem C-10 tomb type), no spike, no nasal guard, leather belt with pendants, wide trousers, ring-pommel sword, black cloth wrap under helmet
```
Silla soldier / hwarang:
```
Silla soldier, light lamellar cuirass, white or brown cloth clothing, black cloth head wrap, spear; hwarang: young noble warrior with lightly made-up face, small gold ear ornament, short lamellar vest
```
Silla cavalry:
```
Silla cavalry, curved vertical-strip helmet, lamellar armor, horse armor of small iron plates (Jjoksaem District C-10 tomb reference), mounted figure reference Geumnyeongchong earthenware rider
```
Silla female ruler (Seondeok, before 649):
```
Silla queen, 7th century, long jacket and floor-length skirt with wide hem, hair wrapped around the head with pearls and colored ornaments, gold or gilt-bronze circlet, no Chinese court dress yet
```

### 7.6 가야·발해(보조)

```
Gaya warrior, 4th century, vertical-plate iron cuirass (jongjangpan-gap), vertical-plate iron helmet, neck guard, rounded dome, wide trousers, leather shoes
Daegaya ruler, gold crown with four flower-shaped uprights at front, sides and back (Goryeong gold crown)
Balhae (low confidence), Goguryeo-descended ruler, 698, Goguryeo-style jeolpung cap, lamellar armor, fur trim
```

### 7.7 64px 스프라이트 읽기 단서 (design)

| 국가 | 머리 실루엣 | 몸 실루엣 | 포인트 색 |
|---|---|---|---|
| 고구려 | 뾰족 삼각 모자+위로 곧은 깃 2개 | 짧은 상의, 가죽띠, 통 넓은 바지 | 적갈·청 |
| 백제 | 둥근 검은 관+좌우 금/은 불꽃 한 쌍(평시), 투구는 매끈한 반구(전투) | 검은 칠 갑옷 | 흑·적·은 |
| 신라 | 입식 금관 가지 실루엣 또는 만곡 투구 | 흰 포 또는 소찰 갑+허리 드리개 | 금·흰 |

## 8. 안아트 재제작 대상 확정 권고

우선순위(고증 영향 크고 DB에 존재하는 순서):
1. 계백(hero): 재제작 필요. 서양풍 갑·망토 제거, 칠피 찰갑 (3.2). 시트도 동일.
2. 김유신(hero): 투구(코·볼 가리개)·망토·서양 검 제거, 갑 형태는 유지 가능. 시트 포함.
3. 을지문덕(hero): 현행 초상 미열람(이번 조사에서 파일은 존재 확인). 열람 후 절풍·새깃·통소매 여부 점검.
4. 광개토대왕·장수왕·왕건(+v4 변형 2건): 별도 점검. 왕건은 고려 초라 보류.
5. 선덕여왕, 의자왕, 영양왕, 고건무, 김춘추: 관모·금관 시기 점검. 김춘추는 6.4절 방침(상징 허용 여부는 기획 결정).
6. NPC 백제 장수 14명, 고구려 가상 NPC 7명, 신라 NPC 8명: 국가별 공통 프롬프트(7장)를 적용하면 일괄 재제작 가능. 이들은 개별 외형 근거가 없으므로 계급·병종 단위로 통일하는 것이 오히려 고증에 안전하다.
7. 부대(병종) 스프라이트 culture 'korea' 세트: 고구려/백제/신라 혼합일 가능성이 크다. 현재 hero_cultures.json은 korea 한 세트라고 정의(고구려·신라·백제·가야·발해·고려·조선 포괄). 삼국 구분 세트 필요 여부는 기획 결정 필요(4~7세기 군복이 고려·조선과 크게 다르다).

## 9. 사람이 확인해야 할 항목 (verify 모음)

1. 소장품 번호: 국립중앙박물관·경주박물관·부여박물관·복천박물관 소장품 번호(미조사). e뮤지엄에서 확인 필요.
2. 고구려 투구·갑옷 분류(koreascience JAKO200011920807280, JAKO199471663776043 본문 PDF 판독 실패).
3. 백제 사비기 투구 형식(실물 미확인), 명광개와 공산성 칠피 갑의 동일성, 칠 색(흑 vs 황칠).
4. 『삼국지』 동이전 절풍·책 원문, 『삼국사기』 진흥왕 37년 화랑 기사, 법흥왕 7년 공복 원문(2차 출처만).
5. 김춘추 개인 복식(649 당제 복두·단령 vs 금관 상징), 7세기 신라 왕 금관 착용.
6. 재매정 갑옷의 연대·귀속.
7. 발해(대조영)·후삼국·고려 초 갑주(이번 범위 밖).
8. 연개소문·진덕여왕·이사부·원효·의상 등 후보 인물의 DB 등록 여부.
9. 아프라시압 사절 국적(고구려설 우세, 신라설 이견).
10. 각궁 길이, 화살통 위치 등 병기 세부.
11. 현행 DB 값(등급·병종·초상·시트)과 6장의 JSON 시드 값 차이.

## 10. 출처 목록

문헌·1차
- 『주서』 권49 이역전(고려·백제) wikisource: https://zh.wikisource.org/wiki/周書/卷49
- 『신당서』 권220 동이전(고려·백제·신라) wikisource: https://zh.wikisource.org/wiki/新唐書/卷220
- 『삼국사기』 신라본기 권5(진덕왕 3년 649) wikisource ko: https://ko.wikisource.org/wiki/번역:삼국사기/권05

학술·백과·연구소
- 한국민족문화대백과 조우관: https://encykorea.aks.ac.kr/Article/E0052429
- 한국민족문화대백과 천마총 금제 허리띠: https://encykorea.aks.ac.kr/Article/E0007974
- 채금석·김소희 백제 한성기 찰갑 전시 재현: https://koreascience.or.kr/article/JAKO201718054546486.page?lang=ko
- 채금석 백제 복식 유형별 형태(숙명여대): https://scholarworks.sookmyung.ac.kr/item/8b3d42ab-8be1-41de-ac7f-4a7fd794e2ca
- 고흥 길두리 안동고분 출토 백제 철제갑주 복원: https://scholar.kyobobook.co.kr/article/detail/4010024829808
- 천안 두정동 이형철기 판갑 해석: https://scholar.kyobobook.co.kr/article/detail/4010027763860
- 김혁중 4~5세기 신라·가야 갑주의 생산 체계: https://m.earticle.net/Article/A357403
- 조현진 2021 경주 재매정 갑옷: https://koreascience.kr/article/JAKO202109135418993.page
- 금관총 출토 갑주(국립경주박물관 2016 보고서 초록): https://scholar.kyobobook.co.kr/article/detail/4010071591558
- 금령총 기마인물형토기 복식·마구(6세기 전반): https://koreascience.or.kr/article/JAKO201368440975843.pdf
- 사천왕사 녹유신장벽전 도상: https://www.earticle.net/Article/A209385
- 백제 금동대향로 주악상 복식: https://koreascience.or.kr/article/JAKO200423659444071.page?lang=en
- 고구려 고분벽화 복식·안료·두발: https://koreascience.kr/article/JAKO201114963380588.pdf, https://dspace.hansung.ac.kr/handle/2024.oak/6404
- 신라 당복 도입 논문: https://koreascience.kr/article/JAKO201326940563573.pdf, https://koreascience.kr/article/JAKO199811920814685.page
- 아차산 4보루 철제 투구(한국학중앙연구원 위키): https://dh.aks.ac.kr/Edu/wiki/index.php/아차산_4보루_철제_투구
- 무령왕 금제 관식(한국학중앙연구원 위키·smarthistory): https://dh.aks.ac.kr/~hyunseung/wiki/index.php/무령왕_금제_관식, https://smarthistory.org/crown-ornaments-from-the-tomb-of-king-muryeong

언론(발굴 보도, 참고·약한 출처)
- 공산성 칠피 갑옷(2011): https://m.go.seoul.co.kr/news/2011/10/13/20111013014008
- 부여 관북리 칠피 갑옷(2024): https://v.daum.net/v/20240227150006300
- 익산토성 옻칠 갑옷(2024): https://v.daum.net/v/20240530093149491
- 백제 무구의 특징(1994): https://m.seoul.co.kr/news/1994/06/17/19940617011001
- 쪽샘 신라 기마무사 찰갑 복원(2013): https://m.go.seoul.co.kr/news/2013/04/25/20130425015010
- 황남동 1호 목곽묘(2025): https://m.seoul.co.kr/news/2025/10/21/20251021026002
- 금령총 기마인물상(1995): https://www.seoul.co.kr/news/1995/02/24/19950224013001
- 대가야 금관(2006): https://sports.khan.co.kr/article/200603222050503
- 아프라시압 벽화: https://www.news1.kr/life-culture/general-cultural/6176255
- 복천동 38호분·대성동 갑주(보도·초록): https://kbmaeil.com/article/20260707500103, https://scholar.kyobobook.co.kr/article/detail/4010071148343

내부 파일(목록 작성 근거)
- database/data/heroes.json, heroes_candidates.csv, hero_cultures.json, npc_roster_shelf_ch13_baekje_stats.json, npc_roster_shelf_ch14_goguryeo_add.json, npc_roster_v3_additions_shelf.json, npc_roster_shelf_ch13_20_ext_stats.json, npc_roster_shelf_enemy_final.json, npc_roster_shelf_ch11*.json, GACHA_BANNER_CATALOG_20261108.md, public/assets/portraits, public/assets/sprites
