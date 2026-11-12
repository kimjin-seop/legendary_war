# 전설적 무장 S등급 후보 (LEGEND_S_HERO_CANDIDATES)

작성: 송서사 / 2026-11-04 / 내부 문서(근거 수준·연출 노트는 이 문서에만). 데이터 수정 없음.
규모(사용자 확정 반영): 총원 약 260명, 등급 비율 S10/A40/B40/C10 → S 25~30명. 후보 40명(최종 추천 29명 = 기존 S 3 포함, 승급 + 신규 합계 + 예비 11명).
병종은 기존 6종 + gunner 안에서만 제안. 표시 문자열(스킬명·flavor)에는 사실/가설 표기를 쓰지 않는다. 근거 수준 confirmed/likely/verify는 이 문서에만 남긴다.
초상 보유 판단: heroes.json 영웅은 기존 초상 있음(S화 시 S급 연출 재제작 권장), 서가 NPC·조우 장수 로스터 인물은 초상 보유(개별 manifest 대조는 안아트), 신규는 제작 필요. 이번에 manifest·hero_native_names를 한 건씩 대조하지는 않았다(대조 필요 항목은 JSON `portrait_check` 참조).

## 1. 최종 추천 29명 (우선순위 순번 = 순서대로 확정 권장)

구분: 기존S / 승급(heroes.json 보유 등급 상향) / 승격(서가 NPC·조우 장수 → 영웅 신설, 초상 보유) / 신규(로스터에 없음).

| # | 코드 제안 | 한글명 | 구분 | 문화권 | 시기 | 병종 | 현재 | 근거 |
|---|---|---|---|---|---|---|---|---|
| 1 | yi_sun_sin | 이순신 | 기존S | 조선 | 16C | archer | S | confirmed |
| 2 | alexander | 알렉산드로스 대왕 | 기존S | 지중해 | BC4C | cavalry | S | confirmed |
| 3 | genghis_khan | 칭기즈 칸 | 기존S | 몽골 | 12~13C | cavalry | S | confirmed |
| 4 | gwanggaeto | 광개토대왕 | 승급 | 고구려 | 4~5C | cavalry | A | confirmed |
| 5 | chok_jun_gyeong | 척준경 | 신규 | 고려 | 11~12C | sword | - | likely(아래 3절) |
| 6 | yi_seonggye | 이성계 | 승급 | 고려~조선 | 14C | archer | A | likely |
| 7 | guan_yu | 관우 | 승급 | 중국 | 2~3C | sword | B | confirmed |
| 8 | xiang_yu | 항우 | 승급 | 중국 | BC3C | sword | C | confirmed |
| 9 | zhao_yun | 조운 | 승격 | 중국 | 2~3C | spear | 로스터 | confirmed |
| 10 | minamoto_yoshitsune | 미나모토노 요시쓰네 | 승급 | 일본 | 12C | cavalry | A | likely |
| 11 | honda_tadakatsu | 혼다 다다카쓰 | 승급 | 일본 | 16~17C | spear | B | likely |
| 12 | shimazu_yoshihiro | 시마즈 요시히로 | 승격 | 일본 | 16~17C | gunner | 로스터 | confirmed |
| 13 | richard_i | 사자심왕 리처드 1세 | 승급 | 유럽(잉글랜드) | 12C | sword | A | confirmed |
| 14 | joan_of_arc | 잔 다르크 | 승급 | 유럽(프랑스) | 15C | sword | A | confirmed |
| 15 | el_cid | 엘 시드 | 승급 | 유럽(이베리아) | 11C | cavalry | B | confirmed |
| 16 | napoleon | 나폴레옹 보나파르트 | 승급 | 유럽(프랑스) | 18~19C | gunner | A | confirmed |
| 17 | harald_hardrada | 하랄 하르드라다 | 신규 | 유럽(노르드) | 11C | sword | - | confirmed |
| 18 | hannibal | 한니발 바르카 | 승급 | 고대 지중해(카르타고) | BC3C | sword | A | confirmed |
| 19 | julius_caesar | 율리우스 카이사르 | 승급 | 고대 지중해(로마) | BC1C | sword | A | confirmed |
| 20 | leonidas | 레오니다스 | 승급 | 고대 지중해(스파르타) | BC5C | spear | C | confirmed |
| 21 | belisarius | 벨리사리우스 | 신규 | 비잔틴 | 6C | cavalry | - | confirmed |
| 22 | saladin | 살라딘 | 승급 | 중동 | 12C | cavalry | B | confirmed |
| 23 | baybars | 바이바르스 | 신규 | 중동(맘루크) | 13C | archer | - | confirmed |
| 24 | subutai | 수부타이 | 승격 | 몽골/초원 | 12~13C | archer | 로스터 | confirmed |
| 25 | shivaji | 시바지 | 승급(확장 A) | 남아시아 | 17C | sword | A | likely |
| 26 | lakshmibai | 락슈미바이 | 승급 | 남아시아 | 19C | cavalry | C | confirmed |
| 27 | nguyen_hue | 응우옌후에(꽝쭝) | 승급(확장 A) | 동남아(베트남) | 18C | cavalry | A | confirmed |
| 28 | shaka_zulu | 샤카 줄루 | 승급(확장) | 아프리카 | 19C | spear | 확장 | likely |
| 29 | crazy_horse | 크레이지 호스 | 승급(확장) | 아메리카 | 19C | cavalry | 확장 | likely |

예비 11명(총 후보 40): 제갈량(mage, 중국), 김유신(sword, 신라), 다케다 신겐(cavalry), 우에스기 겐신(spear), 칼리드 이븐 알왈리드(cavalry, 아라비아), 쩐흥다오(spear, 베트남), 스키피오 아프리카누스(sword, 로마), 샤를마뉴(cavalry, 프랑크; 신규), 순디아타 케이타(archer, 서아프리카; 확장), 파차쿠티(spear, 안데스; 확장), 라우타로(cavalry, 마푸체; 확장).
이번 단계에서 의도적으로 제외한 대형 인물: 아틸라·티무르·한니발 이외의 대량 사상 사건이 서사의 중심인 인물(중립 유지 원칙).

## 2. 분포 점검

- 병종: cavalry 10(34%), sword 9, spear 4, archer 4, gunner 2, mage 0, healer 0. 기병이 약간 많다. 기병 쏠림을 줄이려면 락슈미바이→sword, 크레이지 호스→archer(평원 전사 활)로 바꾸는 선택지가 있다. mage·healer S는 '무장 중심' 요청이라 0명으로 두었고, 지략형 1명이 필요하면 예비의 제갈량(mage)을 올리면 된다.
- 문화권: 한국 4(이순신·광개토·척준경·이성계), 중국 3, 일본 3, 유럽 5(서·중세·근대), 고대 지중해 4(알렉산드로스 포함), 중동 2, 몽골/초원 2(칭기즈·수부타이), 남아시아 2, 동남아 1, 아프리카 1, 아메리카 1, 비잔틴 1(벨리사리우스; 지중해 권역에 합산 가능). 한국·유럽이 조금 높지만 서사 비중을 고려한 범위. 동남아·아프리카·아메리카는 각 1명이라 S 확대 시 쩐흥다오·순디아타·파차쿠티를 우선 승급 권장.
- 시대: 고대 5, 중세 17, 근세 5, 근대 2 — 중세 쏠림. 근세(16~19C)는 시마즈(gunner)·나폴레옹(gunner)·락슈미바이·샤카·크레이지 호스로 보강했다.
- 기존 S 3명(이순신·알렉산드로스·칭기즈 칸)과의 중복·충돌
  - 이순신(archer, 해전): S 추가 인물 중 해전 컨셉 없음 → 충돌 없음. 이성계(archer)는 육전 궁술이라 구분 가능.
  - 알렉산드로스(cavalry, 원정): 벨리사리우스(cavalry)와 '대원정/원정군 통솔' 컨셉이 겹칠 수 있다 → 벨리사리우스는 '소수 병력으로 대군 격파·재정복 전쟁'으로 구분.
  - 칭기즈 칸(cavalry): 수부타이는 archer + '기동 포위·원정 선봉'으로 구분. 같은 몽골 서가 NPC이므로 인연(lord_vassal, 확인됨)과 시너지 연출 가능.

## 3. 척준경 정체성 근거 (웹 확인)
- 고려 중기 무신, 곡산 척씨의 시조로 전해진다. 출생연도는 전하지 않음.
- 1104년 동여진 정벌에서 공을 세웠고, 1107년 윤관 휘하 여진 정벌(9성 축조 시기)에서 활약했다(likely).
- 인종 때 이자겸의 난(1126)에서 이자겸 편으로 궁궐을 공격했으나, 이후 이자겸과 갈라서 왕 편에 서서 이자겸을 붙잡았다. 이듬해 탄핵·유배, 1144년 복권 뒤 사망(likely).
- 서사 주의: 이자겸의 난 가담은 '반역/충성'의 단일 평가를 피하고 '군사적 영향력이 정국을 좌우한 무장'이라는 중립 서술로 쓴다. 개인 용맹 일화(윤관 구원 등)는 고려사 열전 계열 세부(verify)라 스킬명에 직접 쓰지 않는다.
- 출처: 텐아시아 2016-01-12 기사(https://www.tenasia.co.kr/article/2016011204344), 브런치 「박철홍의 고려사도 흐른다」(https://brunch.co.kr/@cholhong26/352), itwiki 이자겸의 난(https://itwiki.kr/w/이자겸의_난). 나무위키·고려사 원문은 직접 열람하지 못했으므로 사람 검수 필요.

## 4. 후보별 스킬 컨셉 (패시브 3 + 액티브 2, 템플릿 범위 내) 및 초상 연출 노트

표기: P=패시브, A=액티브. 이름은 제안이며 표시 문자열에 근거 표기 없음.

- 광개토대왕(cavalry): P 정복의 창(T_ATK_UP), 기마 돌진(T_CHARGE), 영토의 질서(T_FORMATION) / A 태왕의 진형(BUFF), 철기 질주(SURGE). 초상: 5C 고구려 철제 찰갑과 말 갑옷, 환두대도와 장창, 투구 위 깃 장식, 고분벽화풍 금빛 문양 배경, 위엄 있는 정면 시선.
- 척준경(sword): P 선봉의 기세(T_FIRST_STRIKE), 궁궐 앞의 버팀(T_LAST_STAND), 변경의 규율(T_FORMATION) / A 돌파의 일격(STRIKE), 적진 가르기(PIERCE 대체 시 T_ACTIVE_STRIKE). 초상: 고려 중기 철제 찰갑과 붉은 술 달린 투구, 큰 환도와 방패, 거친 수염과 흉터, 북방 변경의 눈바람과 성문 배경.
- 이성계(archer): P 신궁의 솜씨(ATK_UP), 선제 사격(FIRST_STRIKE), 군령의 정비(FORMATION) / A 활 든 대열(BUFF), 연속 사격(AOE). 초상: 14C 고려 말 장수 갑옷과 각궁, 화살통, 말 위에서 활을 당기는 포즈, 새벽빛 산야.
- 관우(sword): P 맹장의 일격(ATK_UP), 적진 돌파(CHARGE), 단단한 갑주(DEF_UP) / A 청룡 일섬은 연의 이미지라 피하고 "긴 칼의 일격"(STRIKE), "의리의 방패"(BUFF def). 초상: 후한 말 찰갑과 긴 수염, 붉은 얼굴빛은 연의 이미지라 과하지 않게, 장도(관도)를 비스듬히 든 포즈, 초록 전포.
- 항우(sword): P 패왕의 힘(ATK_UP), 맹장의 돌격(CHARGE), 결사의 기세(LAST_STAND) / A 결사 일격(STRIKE), 배를 가라앉힌 결의(BUFF atk). 초상: 진말 초 지역 흑색 갑옷과 큰 창검, 거구, 깃발 아래 서 있는 정면 구도, 어두운 붉은 석양.
- 조운(spear): P 단기 돌파(CHARGE), 흔들리지 않는 호위(DEF_UP), 용맹의 규율(FORMATION) / A 장판의 구원(SURGE; 장판파 구원은 정사 기록에 근거 likely), 창끝 일섬(STRIKE). 초상: 후한 말 백색 천 두건과 은빛 갑옷, 긴 창, 단정한 젊은 장수상, 바람에 휘날리는 전포.
- 미나모토노 요시쓰네(cavalry): P 기습의 날(ATK_UP), 급습 돌격(CHARGE), 추격전(PURSUIT 대체 시 T_FIRST_STRIKE) / A 비탈 기습(STRIKE), 바람 같은 진군(SURGE). 초상: 헤이안 말 오요로이 대갑옷과 투구 뿔 장식, 짧은 태도와 활, 날렵한 몸놀림, 벚꽃 대신 파도치는 해안 배경.
- 혼다 다다카쓰(spear): P 철벽의 수비(DEF_UP), 받아치는 창(COUNTER_ATK), 가신단의 결속(FORMATION) / A 창벽(BUFF def), 선봉 돌파(STRIKE). 초상: 센고쿠 사슴뿔 투구(실존 가문 투구 장식), 긴 창(작은 신화 호칭은 쓰지 않음), 짙은 청색 갑옷, 무표정한 정면.
- 시마즈 요시히로(gunner): P 사쓰마 조총대(ATK_UP), 매복 사격(FIRST_STRIKE), 퇴각 중의 반격(COUNTER_ATK) / A 일제 사격(AOE), 중앙 돌파(STRIKE). 초상: 센고쿠 후기 갑옷과 조총, 시마즈 가문 문양, 안개 낀 세키가하라 들판, 낮은 자세의 조준.
- 사자심왕 리처드 1세(sword): P 사자심의 일격(ATK_UP), 중기병의 돌격(CHARGE), 되받아치는 용맹(COUNTER_ATK) / A 맞받아치는 일격(STRIKE), 선두 돌격(STRIKE 변형은 SURGE). 초상: 12C 사슬갑옷과 서코트, 긴 양손검과 삼각 방패, 투구 위 왕관 장식, 사자 문양, 아크레 성벽 배경.
- 잔 다르크(sword): P 깃발 아래의 기세(HYBRID), 부상에도 전선에(LAST_STAND), 추격의 독려(PURSUIT 대체 시 FIRST_STRIKE) / A 사기 고취(BUFF), 성문 앞 일격(STRIKE). 초상: 15C 판금 갑옷, 하얀 깃발, 단발, 짧은 검, 흐린 하늘의 오를레앙 성벽.
- 엘 시드(cavalry): P 기사의 일격(ATK_UP), 기마 돌진(CHARGE), 물러서지 않는 기사(LAST_STAND) / A 기병 돌격(SURGE), 발렌시아의 방비(BUFF def). 초상: 11C 이베리아 사슬갑과 원추형 투구, 긴 창과 둥근 방패, 붉은 망토, 건조한 카스티야 평원.
- 나폴레옹(gunner): P 포병의 집중(ATK_UP), 신속한 기동전(MOVE_UP), 중앙 돌파(FIRST_STRIKE) / A 포병 집중 사격(AOE), 중앙 돌파의 일격(STRIKE). 초상: 1805년경 푸른 군복과 이각모, 한 손은 군복 안, 뒤쪽에 야전포, 연기 낀 아우스터리츠의 아침.
- 하랄 하르드라다(sword): P 바랑기아 근위(DEF_UP), 선봉의 기세(ATK_UP), 대열의 결속(FORMATION) / A 도끼 일격(STRIKE), 방패 벽(BUFF def). 초상: 11C 노르드 사슬갑옷과 원추형 투구, 큰 덴마크식 도끼, 붉은 방패, 북해 안개와 롱십.
- 한니발(sword): P 협곡의 매복, 알프스 행군, 칸나이의 양익(FORMATION) 등 기존 + A 날개 닫기(BUFF), 코끼리 돌파(STRIKE). 초상: BC3C 카르타고 청동 투구와 아마포 갑옷, 한쪽 눈 부상 표현은 전승(verify)이라 쓰지 않음, 알프스 눈 속의 코끼리 실루엣.
- 율리우스 카이사르(sword): P 군단의 규율(FORMATION), 신속한 결단(ATK_UP), 승세 추격(PURSUIT 대체 시 FIRST_STRIKE) / A 던져진 주사위(STRIKE), 병사를 부르는 말(BUFF). 초상: BC1C 로마 흉갑과 붉은 망토, 월계관, 독수리 군기, 루비콘 강가 새벽.
- 레오니다스(spear): P 방패 벽(DEF_UP), 끝까지 지키는 자리(LAST_STAND), 방패 대열(FORMATION) / A 방패 대열(BUFF def), 창끝 반격(STRIKE). 초상: BC5C 스파르타 청동 코린토스식 투구와 붉은 망토, 호플리테 방패와 창, 좁은 협곡의 바위 벽. (300명 서사 불사용)
- 벨리사리우스(cavalry): P 정예 중기병의 위세(ATK_UP), 재정복의 질서(FORMATION), 열세에서의 버팀(LAST_STAND) / A 기병 포위(SURGE), 진지 구축(BUFF def). 초상: 6C 비잔틴 라멜라 갑옷과 긴 창, 붉은 망토, 금빛 모자이크풍 배경, 중무장 기마 포즈.
- 살라딘(cavalry): P 연합군의 통솔(HYBRID), 기마 돌진(CHARGE), 선견의 계책(FIRST_STRIKE) / A 하틴의 포위(BUFF), 신속한 추격(SURGE). 초상: 12C 사슬갑과 터번 투구, 곡도, 푸른 망토, 초승달 문양의 아이유브 깃발, 사막 석양.
- 바이바르스(archer): P 기마 궁술(ATK_UP), 속전의 규율(FORMATION), 선제 사격(FIRST_STRIKE) / A 퇴각 위장 사격(AOE), 아인잘루트의 기습(STRIKE). 초상: 13C 맘루크 라멜라 갑옷과 복합궁, 짙은 녹색 전포, 말 위 활을 쥔 자세, 카이로 성채 배경.
- 수부타이(archer): P 원정군의 선봉(MOVE_UP), 기마 궁술(ATK_UP), 대열의 결속(FORMATION) / A 기마 궁술 일제(PIERCE 대체 시 AOE), 양익 포위(BUFF). 초상: 13C 몽골 가죽 갑옷과 털모자, 복합궁, 회색 늑대털 장식, 초원의 안개.
- 시바지(sword): P 산악 기습(ATK_UP), 산성의 대열(FORMATION), 호랑이 발톱(FIRST_STRIKE) / A 호랑이 발톱(STRIKE), 산중 매복(BUFF). 초상: 17C 마라타 터번과 곧은 직검(바바), 산성 능선 배경, 짧은 수염과 사프란색 깃발.
- 락슈미바이(cavalry): P 성을 지키는 결의(DEF_UP), 물러서지 않는 기수(LAST_STAND), 기수의 규율(FORMATION) / A 성문 돌파(SURGE), 기마 일격(STRIKE). 초상: 1858년 잔시 여왕, 갑옷 위 사리와 터번, 짧은 직검, 말에 아이를 업은 일화는 쓰지 않음(verify), 불타는 성벽.
- 응우옌후에(cavalry): P 쾌속의 기세(ATK_UP), 설날의 기습(CHARGE), 대열의 결속(FORMATION) / A 급행군(SURGE), 도성 앞의 일격(STRIKE). 초상: 18C 베트남 서산조 붉은 전포와 갑옷, 코끼리 위 지휘 또는 말 위 지휘, 안개 낀 승전 아침.
- 샤카 줄루(spear): P 짧은 창의 기세(ATK_UP), 큰 방패의 버팀(LAST_STAND), 대열의 결속(FORMATION) / A 방패 두드리기(BUFF), 뿔의 일격(STRIKE). 초상: 19C 줄루 가죽 방패(이식)와 짧은 창, 깃털 장식, 사바나의 붉은 흙. 식민 전쟁 피해와 민족 내 폭력 평가는 연출에서 제외.
- 크레이지 호스(cavalry): P 평원의 전사(HYBRID), 기마 돌진(CHARGE), 물러서지 않는 기개(LAST_STAND) / A 평원 급습(SURGE), 유인 후 반격(STRIKE). 초상: 19C 라코타 전사의 깃털 장식과 번개 문양 얼굴 페인트(전승 일부 verify, 단순화), 말 위 자세, 대초원 황혼.

## 5. 승격 가능한 서가 NPC·조우 장수 (S/A 후보 풀, 초상 보유)

S 승격 추천은 위 표의 조운·시마즈 요시히로·수부타이. A 후보 풀(한 줄씩, 병종 추천 포함):
- 중국: 황충(archer), 강유(spear), 위연(cavalry), 감녕(sword), 조인(cavalry), 마대(cavalry), 법정(mage)
- 한국: 정기룡(spear), 이억기(archer), 김춘추(sword/지휘), 김흠순(cavalry), 소정방(당, spear), 모두루(고구려), 이여송(명, cavalry), 진린(명, sword)
- 일본: 다치바나 무네시게(sword), 고바야카와 다카카게(cavalry), 구로다 나가마사(spear), 가토 기요마사(spear), 고니시 유키나가(sword), 이시다 미쓰나리(mage), 우키타 히데이에(spear), 사카이 다다쓰구(spear), 야마가타 마사카게(cavalry), 바바 노부하루(cavalry), 다케다 가쓰요리(cavalry)
- 몽골: 제베(archer), 무칼리(cavalry), 보르추(sword), 주치(cavalry), 오고타이(sword), 후엘룬(지휘)
- 마케도니아: 파르메니온(spear), 헤파이스티온(cavalry), 크라테로스(spear), 프톨레마이오스(sword), 셀레우코스(cavalry)
- 카르타고/로마: 하스드루발(cavalry), 마고 바르카(cavalry), 마시니사(cavalry), 루키우스 아이밀리우스 파울루스(sword)
- 유럽·십자군: 프리드리히 1세 바르바로사(sword), 필리프 2세 오귀스트(sword), 장 드 뒤누아(cavalry), 아르튀르 드 리슈몽(sword), 존 탤벗(sword), 발리앙 디벨랭(sword), 몬페라토의 콘라도(sword), 레몽 3세(cavalry), 기 드 뤼지냥(cavalry)
- 중동: 알아딜(cavalry), 잘랄 앗딘 밍부르누(cavalry), 알아프달(cavalry)
- 주의 인물(중립 처리 전제): 질 드 레, 수 양제, 의자왕, 다리우스 3세는 평가가 갈려 영웅 승격보다 NPC 유지 권장. 원균은 논란 인물이라 승격 비권장.

## 6. 남은 확인 사항
- 사람 검수: 척준경 세부(윤관 구원 일화), 조운 장판파 구원의 정사 근거(삼국지 조운전, likely), 요시쓰네 일화, 이성계 기록, 샤카 줄루·크레이지 호스 호칭과 일화는 사료 비판이 갈리는 부분이 있어 flavor는 사건명을 쓰지 않음.
- 안아트: 승격·승급 인물의 기존 초상 보유 여부 manifest 대조, 신규 4명(척준경·하랄 하르드라다·벨리사리우스·바이바르스) 제작.
- 시드 후속: 병종 gunner 전환 시 스킬 적용은 박백엔·임밸런.
