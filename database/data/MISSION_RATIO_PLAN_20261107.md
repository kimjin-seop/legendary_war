# 미션 비중 전환 계획 (2026-11-07, 임밸런)

상태: 설계 문서. 기존 stages*/maps* JSON, DB, FE/BE 코드는 수정하지 않았다. 승률 등 전투 수치는 아직 측정하지 않았다(전환 후 배치 측정 예정). 모든 숫자는 시작값이며 사람의 플레이 확인이 필요하다.

## 0. 근거와 가정

| 구분 | 내용 | 확실도 |
|---|---|---|
| 사실 | 대상 170개 = DB stages 180 - stage_01~06(레거시, objective 없음) - ch999_s1~4(종장). DB 덤프(tinker, 읽기 전용)로 집계 | 높음 |
| 사실 | 승패 판정: win_mode "only"=win_conditions만, "all"=기본 목표 AND win_conditions, 규칙 있으면 턴 상한 도달 시 패배 (app/Game/StageRules.php) | 높음 |
| 사실 | 40x28 맵 26개 전부 스테이지에 연결됨(ch999 2개 포함). 미연결 맵 54개는 전부 소형 원본(10x8~28x20: pk_*, im_*, main_a*, castle/plain 변형) | 높음 |
| 가정 | "주 승리조건" = win_mode only면 win_conditions, 그 외(없음/all)면 objective.type. all의 부가 in_zone/flag/alive_count 조건은 "하이브리드"로 표시 | 중간 |
| 가정 | 팀장 분류 로직은 정확 재현 실패(아래 1-1). 그래서 본 문서는 자체 분류(주 승리조건)를 기준으로 함 | 중간 |
| 미측정 | 전환 후 +0 승률 40~60% 유지 여부, 평균 턴, 턴 제한 도달률 | - |

## 1. 현재 분포 재집계 (주 승리조건 기준)

### 1-1. 팀장 분류 재현 시도와 새 표

| 팀장 분류 | 팀장 값 | 내 근사 재현(규칙: NPC in_zone 승리=인도 / flag=기타 / only+주인공 in_zone=도달 / route·must·unit_survive·protect_tiles·hold_zone=부가 / 나머지 objective.type) |
|---|---|---|
| 호위·NPC보호(부가) | 53 | 53 |
| 거점 점령 | 28 | 29 |
| 호위·인도 | 25 | 25 |
| 지휘관 격파 | 23 | 24 |
| 도달·돌파 | 20 | 19 |
| 버티기 | 18 | 19 |
| 기타 | 3 | 1 |

- 인도 25, 부가 53은 일치, 나머지는 +-1~2 차이(합계 170 동일). 정확 재현은 못 했다(팀장 코드의 우선순위 미확인). "부가"로 분류된 53개는 NPC 사망=패배 같은 부가 조건이 붙은 스테이지이고 주 목표는 격파/점령/방어 중 하나다.

**새 표 (주 승리조건 기준, 170개)**

| 유형 | 현재 | 현재 % | 목표 | 목표 % | 증감 |
|---|---|---|---|---|---|
| 지휘관 격파·섬멸 | 56 | 32.9% | 76 | 44.7% | +20 |
| 거점 점령 | 46 | 27.1% | 34 | 20.0% | -12 |
| 도달·돌파·탈출 | 19 | 11.2% | 26 | 15.3% | +7 |
| 방어·생존 | 29 | 17.1% | 17 | 10.0% | -12 |
| NPC 호위·인도 | 20 | 11.8% | 9 | 5.3% | -11 |
| 기타 특수 목표 | 0 | 0.0% | 8 | 4.7% | +8 |

- 하이브리드(win_mode all + 추가 in_zone/flag/alive_count) 27개는 objective.type 쪽으로 분류했다. 경계 사례: ch12_s4, ch24_s2(격파+NPC 인도 조건)는 격파로, ch11_s2(only+turn_gte)는 방어로, ch21_s6(only capture+광장 장악)은 도달로 둠.
- 최소 전환 수 = 점령 -12, 방어 -12, 호위 -11 = 35개(격파 +20, 도달 +7, 기타 +8). 본 계획은 정확히 35개만 바꾼다.

### 1-2. 챕터별 분포 (현재 -> 목표)

| 챕터 | 격파 | 점령 | 도달 | 방어 | 호위 | 기타 |
|---|---|---|---|---|---|---|
| ch1 | 4->4 | 3->3 | 0->0 | 3->3 | 0->0 | 0->0 |
| ch11 | 4->6 | 1->1 | 1->1 | 3->1 | 1->1 | 0->0 |
| ch12 | 5->7 | 2->2 | 0->0 | 2->1 | 1->0 | 0->0 |
| ch13 | 3->3 | 4->4 | 0->2 | 1->1 | 2->0 | 0->0 |
| ch14 | 5->6 | 1->0 | 1->1 | 2->1 | 1->1 | 0->1 |
| ch15 | 4->5 | 2->0 | 3->3 | 1->1 | 0->0 | 0->1 |
| ch16 | 2->3 | 4->2 | 3->3 | 0->0 | 1->1 | 0->1 |
| ch17 | 4->6 | 3->2 | 0->1 | 2->0 | 1->0 | 0->1 |
| ch18 | 7->7 | 2->2 | 1->1 | 0->0 | 0->0 | 0->0 |
| ch19 | 3->4 | 2->2 | 3->3 | 1->0 | 1->1 | 0->0 |
| ch20 | 3->5 | 1->0 | 0->1 | 3->2 | 3->1 | 0->1 |
| ch21 | 2->3 | 3->2 | 2->4 | 1->1 | 2->0 | 0->0 |
| ch22 | 2->4 | 3->1 | 0->1 | 2->1 | 3->1 | 0->2 |
| ch23 | 0->2 | 5->4 | 3->3 | 1->0 | 1->1 | 0->0 |
| ch24 | 2->4 | 1->1 | 2->2 | 5->3 | 0->0 | 0->0 |
| ch101 | 2->2 | 2->2 | 0->0 | 1->1 | 0->0 | 0->0 |
| ch102 | 1->1 | 2->1 | 0->0 | 1->1 | 1->1 | 0->1 |
| ch103 | 1->2 | 2->2 | 0->0 | 0->0 | 2->1 | 0->0 |
| ch104 | 2->2 | 3->3 | 0->0 | 0->0 | 0->0 | 0->0 |

### 1-3. 스테이지 코드별 표 (현재 -> 목표, 170개)

변경 35개는 굵게. 맵은 전 스테이지 기존 유지(5절 참고).

| 코드 | 이름 | 현재 | 목표 | 난이도 |
|---|---|---|---|---|
| ch1_s1 | 옥포의 첫 승전 | 격파 | 격파 | - |
| ch1_s2 | 정암진 나루 | 격파 | 격파 | - |
| ch1_s3 | 한산도, 학의 날개 | 점령 | 점령 | - |
| ch1_s4 | 진주성의 엿새 | 방어 | 방어 | - |
| ch1_s5 | 평양성 탈환 | 점령 | 점령 | - |
| ch1_s6 | 행주산성 | 방어 | 방어 | - |
| ch1_s7 | 노량, 마지막 바다 | 격파 | 격파 | - |
| ch1_s8 | 번진 기록 | 점령 | 점령 | - |
| ch1_s9 | 1597, 물살 앞에서 | 방어 | 방어 | - |
| ch1_s10 | 마지막 기록 | 격파 | 격파 | - |
| ch11_s1 | 담판 길 | 호위 | 호위(유지) | - |
| ch11_s2 | 안융진 | 방어 | 방어 | - |
| ch11_s3 | 흥화진 | 격파 | 격파 | - |
| ch11_s4 | 귀주 | 격파 | 격파 | - |
| **ch11_s5** | 통주 방어 | 방어 | **격파** | 중간 |
| ch11_s6 | 곽주 탈환 | 점령 | 점령 | - |
| ch11_s7 | 무로대 포로 구출 | 도달 | 도달 | - |
| ch11_s8 | 이수 퇴로 습격 | 격파 | 격파 | - |
| **ch11_s9** | 자주 전투 | 방어 | **격파** | 중간 |
| ch11_s10 | 마탄 도하 추격 | 격파 | 격파 | - |
| **ch12_s1** | 하구 합류 | 호위 | **격파** | 중간 |
| ch12_s2 | 장강 첫 교전 | 점령 | 점령 | - |
| ch12_s3 | 화공 | 격파 | 격파 | - |
| ch12_s4 | 이릉 포위 해소 | 격파 | 격파 | - |
| ch12_s5 | 장판파 호위 | 방어 | 방어 | - |
| **ch12_s6** | 강하 구원 | 방어 | **격파** | 중간 |
| ch12_s7 | 오림 추격 | 격파 | 격파 | - |
| ch12_s8 | 화용도 퇴로 | 격파 | 격파 | - |
| ch12_s9 | 남군 쟁탈 | 점령 | 점령 | - |
| ch12_s10 | 유수구 | 격파 | 격파 | - |
| **ch13_s1** | 탄현 행군 | 호위 | **도달** | 낮음 |
| ch13_s2 | 황산벌 | 격파 | 격파 | - |
| ch13_s3 | 사비성 | 점령 | 점령 | - |
| ch13_s4 | 기벌포 상륙 | 점령 | 점령 | - |
| ch13_s5 | 황산벌 전초전 | 격파 | 격파 | - |
| ch13_s6 | 웅진성 포위 | 점령 | 점령 | - |
| ch13_s7 | 임존성 공방 | 점령 | 점령 | - |
| **ch13_s8** | 두량윤성 | 호위 | **도달** | 낮음 |
| ch13_s9 | 주류성 포위 | 방어 | 방어 | - |
| ch13_s10 | 백강 해전 | 격파 | 격파 | - |
| ch14_s1 | 청야 | 호위 | 호위(유지) | - |
| ch14_s2 | 적진 정탐 | 격파 | 격파 | - |
| ch14_s3 | 평양 가는 길 | 격파 | 격파 | - |
| ch14_s4 | 살수 | 격파 | 격파 | - |
| ch14_s5 | 요동성 방어 | 방어 | 방어 | - |
| **ch14_s6** | 신성 방어 | 방어 | **격파** | 중간 |
| ch14_s7 | 평양 수군 매복 | 격파 | 격파 | - |
| **ch14_s8** | 압록강 군량 차단 | 점령 | **기타** | 중간 |
| ch14_s9 | 일곱 번째 후퇴 | 도달 | 도달 | - |
| ch14_s10 | 퇴각로 추격 | 격파 | 격파 | - |
| ch15_s1 | 지연전 | 격파 | 격파 | - |
| ch15_s2 | 신카르타고 | 격파 | 격파 | - |
| ch15_s3 | 아프리카 상륙 | 도달 | 도달 | - |
| ch15_s4 | 자마 | 격파 | 격파 | - |
| ch15_s5 | 티키누스 구출 | 도달 | 도달 | - |
| ch15_s6 | 칸나이 탈출 | 도달 | 도달 | - |
| **ch15_s7** | 바이쿨라 | 점령 | **격파** | 낮음 |
| ch15_s8 | 일리파 | 방어 | 방어 | - |
| **ch15_s9** | 야영지 야습 | 점령 | **기타** | 중간 |
| ch15_s10 | 대평원 | 격파 | 격파 | - |
| ch16_s1 | 보급 호송 | 호위 | 호위(유지) | - |
| ch16_s2 | 생루 | 격파 | 격파 | - |
| ch16_s3 | 오귀스탱 | 점령 | 점령 | - |
| ch16_s4 | 투렐 | 격파 | 격파 | - |
| ch16_s5 | 파테 | 도달 | 도달 | - |
| **ch16_s6** | 쥐르포 공성 | 점령 | **기타** | 높음 |
| ch16_s7 | 묑 다리 | 점령 | 점령 | - |
| **ch16_s8** | 보장시 | 점령 | **격파** | 낮음 |
| ch16_s9 | 랭스 행군 호위 | 도달 | 도달 | - |
| ch16_s10 | 파리 성문 앞 철수 | 도달 | 도달 | - |
| **ch17_s1** | 티그리스 도하 | 호위 | **도달** | 낮음 |
| ch17_s2 | 야영과 정찰 | 격파 | 격파 | - |
| ch17_s3 | 가우가멜라 본전 | 격파 | 격파 | - |
| ch17_s4 | 추격 | 격파 | 격파 | - |
| **ch17_s5** | 그라니코스 도하 | 점령 | **격파** | 낮음 |
| **ch17_s6** | 이소스 | 방어 | **격파** | 중간 |
| **ch17_s7** | 티레 방파제 | 방어 | **기타** | 중간 |
| ch17_s8 | 가자 포위 | 점령 | 점령 | - |
| ch17_s9 | 페르시아 관문 | 점령 | 점령 | - |
| ch17_s10 | 히다스페스 도하 | 격파 | 격파 | - |
| ch18_s1 | 오논 강가의 쿠릴타이 | 격파 | 격파 | - |
| ch18_s2 | 하서의 문 | 격파 | 격파 | - |
| ch18_s3 | 야호령의 바람 | 격파 | 격파 | - |
| ch18_s4 | 서요를 넘어 | 격파 | 격파 | - |
| ch18_s5 | 시르다리야 | 점령 | 점령 | - |
| ch18_s6 | 인더스 강가 | 격파 | 격파 | - |
| ch18_s7 | 칼카 강의 초원 | 격파 | 격파 | - |
| ch18_s8 | 마지막 원정길 | 격파 | 격파 | - |
| ch18_s9 | 오트라르 서문 | 점령 | 점령 | - |
| ch18_s10 | 파르완 계곡 | 도달 | 도달 | - |
| ch19_s1 | 하틴 | 격파 | 격파 | - |
| ch19_s2 | 예루살렘 퇴거 | 호위 | 호위(유지) | - |
| ch19_s3 | 아르수프 | 격파 | 격파 | - |
| ch19_s4 | 야파 | 격파 | 격파 | - |
| ch19_s5 | 크레송 샘 | 점령 | 점령 | - |
| ch19_s6 | 티베리아스 포위 | 점령 | 점령 | - |
| ch19_s7 | 아크레 보급 호송 | 도달 | 도달 | - |
| ch19_s8 | 아스칼론 퇴거 | 도달 | 도달 | - |
| **ch19_s9** | 베이트 누바 | 방어 | **격파** | 중간 |
| ch19_s10 | 다룸 철수 | 도달 | 도달 | - |
| ch20_s1 | 사자 호송 | 호위 | 호위(유지) | - |
| ch20_s2 | 별동대 | 격파 | 격파 | - |
| ch20_s3 | 설락원 | 격파 | 격파 | - |
| ch20_s4 | 나가시노성 농성 | 방어 | 방어 | - |
| **ch20_s5** | 구원 사자 재출발 | 호위 | **도달** | 낮음 |
| **ch20_s6** | 방책 구축 호위 | 호위 | **기타** | 중간 |
| ch20_s7 | 야마가타 돌격 방어 | 방어 | 방어 | - |
| **ch20_s8** | 나이토 돌격 | 방어 | **격파** | 중간 |
| **ch20_s9** | 바바 후위전 | 점령 | **격파** | 낮음 |
| ch20_s10 | 가쓰요리 퇴각 추격 | 격파 | 격파 | - |
| ch21_s1 | 헤움니크의 첫 후퇴 | 격파 | 격파 | - |
| **ch21_s2** | 오데르 강 라치보르 | 호위 | **도달** | 중간 |
| ch21_s3 | 브로츠와프 앞의 망루 | 점령 | 점령 | - |
| ch21_s4 | 레그니차의 연기 | 격파 | 격파 | - |
| ch21_s5 | 사요강의 새벽 | 점령 | 점령 | - |
| ch21_s6 | 얼어붙은 도나우, 에스테르곰 | 도달 | 도달 | - |
| **ch21_s7** | 아드리아 해안의 추격 | 호위 | **도달** | 낮음 |
| ch21_s8 | 돌아가는 길의 후미 | 방어 | 방어 | - |
| **ch21_s9** | 베레츠케 관문 | 점령 | **격파** | 낮음 |
| ch21_s10 | 모라비아 연락 호송 | 도달 | 도달 | - |
| ch22_s1 | 카불의 성문 | 점령 | 점령 | - |
| **ch22_s2** | 바자우르의 첫 총성 | 호위 | **기타** | 중간 |
| ch22_s3 | 라호르의 초대 | 격파 | 격파 | - |
| ch22_s4 | 히사르 피로자 | 격파 | 격파 | - |
| ch22_s5 | 파니파트의 수레벽 | 방어 | 방어 | - |
| ch22_s6 | 아그라로 가는 보급로 | 호위 | 호위(유지) | - |
| **ch22_s7** | 칸와의 수레와 틈 | 점령 | **격파** | 중간 |
| **ch22_s8** | 고그라 강의 여울 | 호위 | **도달** | 중간 |
| **ch22_s9** | 시알코트 도개교 | 점령 | **기타** | 중간 |
| **ch22_s10** | 델리 성문 광장 | 방어 | **격파** | 중간 |
| ch23_s1 | 생발레리의 출항 | 호위 | 호위(유지) | - |
| ch23_s2 | 페븐시의 로마 성벽 | 점령 | 점령 | - |
| ch23_s3 | 방패벽 앞의 언덕 | 점령 | 점령 | - |
| **ch23_s4** | 헤이스팅스 | 점령 | **격파** | 낮음 |
| ch23_s5 | 사우스워크의 다리 어귀 | 점령 | 점령 | - |
| ch23_s6 | 헤이스팅스 곡식 호송 | 도달 | 도달 | - |
| ch23_s7 | 도버 성 | 점령 | 점령 | - |
| ch23_s8 | 캔터베리 사절 호송 | 도달 | 도달 | - |
| ch23_s9 | 월링퍼드 도하 | 도달 | 도달 | - |
| **ch23_s10** | 대관식 소요 방지 | 방어 | **격파** | 중간 |
| ch24_s1 | 외드 패전 후 방어 | 방어 | 방어 | - |
| ch24_s2 | 숲길 진군 | 격파 | 격파 | - |
| ch24_s3 | 푸아티에 방어선 | 방어 | 방어 | - |
| **ch24_s4** | 투르 결전 | 방어 | **격파** | 낮음 |
| **ch24_s5** | 가론 강 | 방어 | **격파** | 중간 |
| ch24_s6 | 보르도 피난 | 도달 | 도달 | - |
| ch24_s7 | 외드와 카를의 회견 길 | 도달 | 도달 | - |
| ch24_s8 | 아비뇽 탈환 | 점령 | 점령 | - |
| ch24_s9 | 나르본 포위 | 방어 | 방어 | - |
| ch24_s10 | 베르 강 | 격파 | 격파 | - |
| ch101_s1 | 열람실의 빈 책 | 격파 | 격파 | - |
| ch101_s2 | 필사실의 붉은 줄 | 격파 | 격파 | - |
| ch101_s3 | 지도에 없는 복도 | 점령 | 점령 | - |
| ch101_s4 | 대출 카운터의 회수 절차 | 방어 | 방어 | - |
| ch101_s5 | 빈 책 창고의 첫 쪽 | 점령 | 점령 | - |
| **ch102_s1** | 봉수대의 밤 | 점령 | **기타** | 중간 |
| ch102_s2 | 당항포의 사공 | 격파 | 격파 | - |
| ch102_s3 | 곡식 짐의 골짜기 | 호위 | 호위(유지) | - |
| ch102_s4 | 산성의 돌 | 방어 | 방어 | - |
| ch102_s5 | 피난길의 약 보따리 | 점령 | 점령 | - |
| **ch103_s1** | 성벽 아래의 짐수레 | 호위 | **격파** | 높음 |
| ch103_s2 | 진창의 보병 | 격파 | 격파 | - |
| ch103_s3 | 강가의 뱃사공 | 호위 | 호위(유지) | - |
| ch103_s4 | 지워진 이름 | 점령 | 점령 | - |
| ch103_s5 | 대관식의 뒷줄 | 점령 | 점령 | - |
| ch104_s1 | 모래폭풍 | 점령 | 점령 | - |
| ch104_s2 | 우물가 | 점령 | 점령 | - |
| ch104_s3 | 서고 심층 입구 | 점령 | 점령 | - |
| ch104_s4 | 정리 대상 | 격파 | 격파 | - |
| ch104_s5 | 마지막 빈 쪽 | 격파 | 격파 | - |

## 2. 스테이지별 전환 계획 (35개)

공통: 코드·sort_order·보상·선행 스테이지는 유지(클리어 기록은 stage id 기준이라 보존). 맵은 기존 맵 재사용(아래 5절 외 변경 없음). 신규 에셋 0개.

### 2-1. 호위 -> 도달·돌파 (7)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch13_s1 탄현 행군 | ch13 / 660 신라군 탄현(침현) 고개 돌파, 김유신·김인문 진군 | - win_mode=only 유지, win_conditions에서 hero:npc_kim_inmun in_zone 삭제 -> @protagonist in_zone(합류 구역) 1개로 단일화<br>- ally_npcs[npc_kim_inmun]: route 제거(연출 NPC), must_survive는 부가 보호로 유지 가능<br>- sub_objectives(unit_survive kim_inmun) 유지(부가) 또는 삭제<br>- cues: set_flag/spawn(on in_zone) 트리거 기준을 인문 -> @protagonist 로 교체, 매복 spawn 타이밍 재확인<br>- lose_conditions 변경 없음, max_turns 12 유지 | 기존 su_ch13_s1_tanhyeon(map 861) 그대로 [su_ch13_s1_tanhyeon 32x24] | star sub_objective(id inmun) 유지 시 영향 없음(삭제하면 all_alive로 교체); ch13_s1_pre/post 문구 "안내"->"돌파" 경미 수정 | 낮음 |
| ch13_s8 두량윤성 | ch13 / 662 두량윤성 공방, 신라군 김품일 포위망 탈출 | - win_conditions: hero:npc_kim_pumil in_zone(탈출 구역) -> @protagonist in_zone(탈출 구역) (+선택 alive_count a >= N 철수 인원)<br>- ally_npcs[kim_pumil] route 제거, must_survive 유지(부가) -> lose pumil_down 유지<br>- cues set_flag(in_zone) 기준 유닛 교체 | 기존 su_ch13_s8_duryang(map 959) [su_ch13_s8_duryang 32x24] | star sub_objective pumil 유지(부가); 컷신 "품일을 탈출시킨다" 문구 수정 | 낮음 |
| ch17_s1 티그리스 도하 | ch17 / 기원전 331 알렉산드로스 티그리스 강 도하 | - win_conditions 2개 중 hero:npc_alexander in_zone 삭제, @protagonist in_zone(합류 구역) 유지(도하 선점)<br>- ally_npcs[alexander] route 유지(연출 이동)·must_survive 유지 -> lose alex_down 그대로(부가 보호)<br>- (선택) alive_count b <= N 추가로 도하점 안전 확보 | 기존 su_ch17_s1_tigris(map 884) [su_ch17_s1_tigris 32x24] | star sub_objective alex 유지; 대사 "안내"->"도하 확보" | 낮음 |
| ch20_s5 구원 사자 재출발 | ch20 / 1575 나가시노 포위망 돌파, 구원 사자 재출발(도리이 스네에몬) | - win_conditions: hero:npc_torii_suneemon in_zone -> @protagonist in_zone(건너편 구역), torii route는 연출로 유지(돌파조 동행)<br>- ally_npcs[torii] must_survive 유지 -> lose torii_down 유지(부가)<br>- cues terrain_change(on flag) 유지 | 기존 su_ch20_s5_messenger_ford(map 963) [su_ch20_s5_messenger_ford 32x24] | ch20_s1이 사자 호송(호위)을 유지하므로 중복 해소; star sub_objective torii 유지; ch20_nagashino.json 대사 경미 수정 | 낮음 |
| ch21_s2 오데르 강 라치보르 | ch21 / 1241 몽골군 오데르 강 라치보르 도하 | - win_conditions 2개 중 선발대장 in_zone 삭제 -> @protagonist in_zone rect [10,10,14,15] + "서안에 적이 없음"(not in_zone side b) 유지<br>- ally_npcs[mongol_vanguard] route/must_survive 제거(이동 연출은 cues move 로 대체)<br>- sub_objectives vanguard_alive 삭제 시 star 교체 | 기존 map 728(su_pk02_ford) - 5개 스테이지 공유(격파 3 포함), 선택적 교체 검토 [su_pk02_ford 36x26] | star sub_objective vanguard_alive; stage_companions.json 에 ch21_s2 항목 있음(확인 필요) | 중간 |
| ch21_s7 아드리아 해안의 추격 | ch21 / 1242 카단의 아드리아 해안 추격, 둑길 돌파 | - win_conditions 3개 중 hero:npc_kadan in_zone 삭제 -> 주인공(ally_commander) 둑길 도달 + 둑길 끝 적 없음 2개<br>- ally_npcs[kadan] route 연출 유지·must_survive 제거<br>- cues retreat/camera 타이밍 점검 | 기존 map 936(su_pk10_coast_isles, ch12_s10 공유) [su_pk10_coast_isles 36x26] | star sub_objective kadan_alive 교체; 대사 경미 | 낮음 |
| ch22_s8 고그라 강의 여울 | ch22 / 1529 바부르 고그라 강 도하(후마윤 상류 도하대 + 본대) | - win_conditions: humayun in_zone(상류 여울) 삭제 -> @protagonist in_zone(서안 북쪽 여울, 돌파조) + side a in_zone(적 야영지) 유지<br>- ally_npcs[humayun] route 연출 유지·must_survive 제거<br>- max_turns 20 -> 16~18 검토(도달형은 짧게) | 기존 map 931(su_pk14_twin_rivers, 4개 공유) [su_pk14_twin_rivers 36x26] | star sub_objective upstream 교체; ch22 대사 경미 수정 | 중간 |

### 2-2. 호위 -> 격파 (2)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch12_s1 하구 합류 | ch12 / 208 하구 합류: 유비 일행·노숙, 문빙 추격군 | - objective defeat_commander 유지, win_mode/win_conditions 삭제(null) -> 문빙(enemy_commander) 격파로 승리<br>- ally_npcs cart_1/cart_2/lu_su: route/must_survive 제거(연출 NPC), cues terrain_change(수위 상승)는 유지<br>- sub_objectives unit_survive 3개 삭제 또는 lu_su 만 유지 | 기존 su_ch12_s1_xiakou(map 869) [su_ch12_s1_xiakou 32x24] | star sub_objective lu_su 유지/삭제 시 교체; ch12_s1_pre/post 문구 수정 | 중간 |
| ch103_s1 성벽 아래의 짐수레 | ch103 / 서고 본편 3막: 성벽 아래의 짐수레 | - objective capture(hold0) -> defeat_commander; win_mode only + cart1 in_zone 삭제<br>- ally_npcs mabu/cart_1/cart_2 route·must_survive 제거(연출 NPC)<br>- sub_objectives unit_survive 3개 정리; 서가 본편은 enemy_commander 키가 없으므로 enemy_squads 에서 지휘관 지정 필요 | 기존 map 663(성벽 아래) 그대로 [main_a3_1_wall_road 28x20] | game:seed-main --act=3 --update 필요; star sub_objective mabu 영향; 서고 본편 대사 수정 | 높음 |

### 2-3. 호위 -> 기타 (2)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch20_s6 방책 구축 호위 | ch20 / 1575 나가시노 마방책 구축(수레 3대를 방책 터로) | - win_mode=only: win_conditions(수레 3대 all in_zone) -> side a in_zone 방책 터 3곳 각각 latch:true 3개 (+선택 alive_count b <= N)<br>- ally_npcs cart_1/2/front route·must_survive 제거(자재 연출), lose_conditions cart*_down 3개 삭제<br>- cues: 방책 터 도달 시 set_flag + 표시 연출 추가, 기병 돌격 spawn(on flag) 유지 | 기존 su_ch20_s6_fence_carts(map 964, 40x28) [su_ch20_s6_fence_carts 40x28] | star turn_within 11 유지; stage_companions ch20_s6 확인; 컷신 문구 | 중간 |
| ch22_s2 바자우르의 첫 총성 | ch22 / 1519 바자우르: 바부르 최초 화승총 일제사격(알리 쿨리) | - win_conditions: ali_quli in_zone(사격 지점) -> side a in_zone(사격 지점, latch:true) + alive_count b <= 12 유지 (장치=화승총 진지)<br>- ally_npcs[ali_quli] route/must_survive 제거(포대 연출)<br>- cues sfx/shake 사격 연출 유지, set_flag guns_ready 추가 | 기존 map 933(su_pk18_wall_breach, 3개 공유) [su_pk18_wall_breach 36x26] | star sub_objective ali 교체; 분류 경계 사례(도달+섬멸 vs 기타) - 사용자 확인 요망 | 중간 |

### 2-4. 점령 -> 기타 (5)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch14_s8 압록강 군량 차단 | ch14 / 612 살수대첩 직전 압록강 수나라 군량 차단 | - objective capture -> win_mode only: 군량 적치 곳 in_zone(side a) latch:true x3 (기존 points [28,12]..[29,13] 재사용)<br>- cues: 도달 시 fire(tiles,turns) 소각 연출 + 기존 spawn 증원 유지 | 기존 su_ch14_s8_night_ford(map 1027) [su_ch14_s8_night_ford 36x26] | star 영향 없음; 컷신 문구("점령"->"소각") | 중간 |
| ch15_s9 야영지 야습 | ch15 / 기원전 203 스키피오의 시팍스·하스드루발 야영지 야습(방화) | - objective capture(points 4) -> win_mode only: 야영 천막 4곳 in_zone(side a) latch:true (기존 points 재사용, win_conditions 한도 6개 내)<br>- cues: 도달 시 fire 연출, 증원 spawn 유지 | 기존 map 934(su_pk15_village_war, ch21_s5 공유) [su_pk15_village_war 36x26] | star 영향 없음 | 중간 |
| ch16_s6 쥐르포 공성 | ch16 / 1429 잔 다르크 쥐르포 공성(화포로 성벽 파괴) | - objective capture -> win_mode only: [flag breach latch] + [@protagonist in_zone 성내 광장]<br>- cues: 포대 side a in_zone(turn>=3) -> set_flag breach + terrain_change(wall->plain) + shake/sfx<br>- 기존 points([25,10],[26,10],[27,10],[26,11])를 포대/돌파구로 재사용 | 기존 su_ch16_s6_tourelles(map 1030) [su_ch16_s6_tourelles 36x26] | star 영향 없음; 시설 HP 파괴는 엔진 미지원 -> 지형 변경으로 대체 | 높음 |
| ch22_s9 시알코트 도개교 | ch22 / 바부르 인도 원정 시알코트 도개교 장악(도개교 내림 장치) | - objective capture -> defeat_commander(명목) + win_mode only: [flag bridge_down latch] + [@protagonist in_zone 성문 안]<br>- cues: 윈치 타일 side a in_zone 시 set_flag bridge_down + terrain_change(tiles->bridge)<br>- 기존 capture points([17,20],[18,20],[19,20],[18,21])를 윈치/다리 타일로 재사용 | 기존 su_ch22_s9_sialkot(map 1012) [su_ch22_s9_sialkot 32x24] | star 영향 없음(clear/turn_within); 컷신 경미 | 중간 |
| ch102_s1 봉수대의 밤 | ch102 / 서고 본편 2막: 봉수대의 밤(봉수 점화) | - objective capture(hold6, fail_if_enemy_holds) -> win_mode only: [side a in_zone 봉수대 latch] + [turn_gte N] (점화 후 N턴 유지)<br>- sub_objectives protect_tiles firepit, unit_survive bonggun 유지<br>- cues fire(봉수대 타일) 점화 연출 추가 | 기존 map 942(su_ch102_s1_beacon) [su_ch102_s1_beacon 24x20] | game:seed-main --act=2 --update; star sub_objective bonggun 유지 | 중간 |

### 2-5. 방어 -> 기타 (1)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch17_s7 티레 방파제 | ch17 / 기원전 332 알렉산드로스 티레 방파제 축조 | - objective survive_turns -> win_mode only: 방파제 구간 3곳 in_zone(side a) latch:true; terrain_change shallows->bridge 로 진행 표시<br>- cues set_flag/spawn 유지, max_turns 11 유지 | 기존 su_ch17_s7_tyre_mole(map 1033) [su_ch17_s7_tyre_mole 36x26] | star turn_within 6 -> 8~9 상향 | 중간 |

### 2-6. 점령 -> 격파 (7)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch15_s7 바이쿨라 | ch15 / 기원전 208 스키피오 바이쿨라 전투 | - objective capture(points,hold) -> defeat_commander; 점령 전용 win_mode/win_conditions 정리<br>- set_flag/spawn(on flag) 증원 유지; enemy_commander 를 기존 점령 지점 인근에 배치<br>- max_turns 17 -> 14~15 검토 | 기존 map 799(su_pk04_hill_claim, 4개 공유) [su_pk04_hill_claim 36x26] | star 영향 없음 | 낮음 |
| ch16_s8 보장시 | ch16 / 1429 보장시 전투(영국군 격파) | - objective capture(points,hold) -> defeat_commander; 점령 전용 win_mode/win_conditions 정리<br>- enemy_commander 배치 확인, max_turns 14 유지 | 기존 map 952(steppe 변형) - 프랑스 장면에 중앙아시아 변형, 맵디자이너 확인(선택) [su_pk04_hill_claim_steppe 36x26] | star 영향 없음 | 낮음 |
| ch17_s5 그라니코스 도하 | ch17 / 기원전 334 그라니코스 강 도하 전투 | - objective capture(points,hold) -> defeat_commander; 점령 전용 win_mode/win_conditions 정리<br>- 도하 후 페르시아 지휘관 격파로 승리, max_turns 12 유지 | 기존 map 728(su_pk02_ford) [su_pk02_ford 36x26] | star 영향 없음 | 낮음 |
| ch20_s9 바바 후위전 | ch20 / 1575 바바 노부후사 후위전(퇴각 엄호) | - objective capture(points,hold) -> defeat_commander; 점령 전용 win_mode/win_conditions 정리<br>- win_mode all 의 in_zone 2개(비탈 신호/산길 어귀) 삭제 후 격파 단일화(신호 지점은 증원 cue 용으로만 유지)<br>- npc_oda_nobunaga 부가 유지 | 기존 map 967(su_ch20_s9_baba_rearguard) [su_ch20_s9_baba_rearguard 32x24] | stage_companions ch20_s9 영향 확인; 별 영향 없음 | 낮음 |
| ch21_s9 베레츠케 관문 | ch21 / 1241 베레츠케 관문 돌파 | - objective capture(points,hold) -> defeat_commander; 점령 전용 win_mode/win_conditions 정리<br>- npc_boroldai 유지 | 기존 map 1010(su_ch21_s9_verecke) [su_ch21_s9_verecke 32x24] | star 영향 없음 | 낮음 |
| ch22_s7 칸와의 수레와 틈 | ch22 / 1527 칸와 전투: 바부르의 수레 진영 | - objective capture -> defeat_commander(라나 상가); win_mode all + win_conditions(수레 진지 적 없음)는 삭제 또는 lose 로 이동<br>- protect_tiles wall, unit_survive babur 부가 유지; lose gap_breach 유지 | 기존 map 932(su_pk20_grand_mixed, ch15_s10 공유) [su_pk20_grand_mixed 36x26] | star sub_objective wall 유지; 대규모 전투 비중 확대 후보 | 중간 |
| ch23_s4 헤이스팅스 | ch23 / 1066 헤이스팅스 전투(해럴드 격파) | - objective capture -> defeat_commander; win_conditions "적 지휘관(해럴드) 격파"가 이미 있으므로 win_mode/win_conditions 삭제 + objective 교체<br>- lose_conditions(defeated/in_zone) 유지, sub_objectives 2개 유지 | 기존 su_ch23_s4_hastings_ridge(map 848, 40x28) [su_ch23_s4_hastings_ridge 40x28] | star 영향 없음; 대규모 격파 대표 | 낮음 |

### 2-7. 방어 -> 격파 (11)

| 코드 | 챕터/사건 | 변경할 데이터 키 | 맵 | 영향(별·대사·cue·시드) | 난이도 |
|---|---|---|---|---|---|
| ch11_s5 통주 방어 | ch11 / 1010 통주(흥화진) 공방 후 거란 선봉 격파 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- 공세 전환: 아군 시작 위치 유지, 적 지휘관을 전방 배치 | 기존 map 1024(su_ch11_s5_snow_fort) [su_ch11_s5_snow_fort 32x24] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch11_s9 자주 전투 | ch11 / 1019 귀주 전 자주 전투 추격 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- 적 후속대 지휘관 격파로 단일화 | 기존 map 1026(su_ch11_s9_snow_hill) [su_ch11_s9_snow_hill 36x26] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch12_s6 강하 구원 | ch12 / 208 강하 구원: 강하 포위군 격파 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- cues spawn(on flag) 증원 유지 | 기존 map 870(ch12_s2 공유, ch12_s2는 점령 유지) [su_ch12_s2_riverbank 32x24] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch14_s6 신성 방어 | ch14 / 612 신성 방어전 후 반격(수나라 선봉 격파) | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- npc_goguryeo_spear_captain 부가 유지 | 기존 map 881(ch11_s2 공유, ch11_s2는 방어 유지) [su_ch11_s2_anyungjin 32x24] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향; stage_companions ch14_s6 확인 | 중간 |
| ch17_s6 이소스 | ch17 / 기원전 333 이소스 전투(다리우스 격파/퇴각) | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- 대규모 전투로 격파 단일, npc_seleucus/perdiccas 유지 | 기존 map 931(4개 공유) - 선택: 954(steppe) 변형 교체 [su_pk14_twin_rivers 36x26] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch19_s9 베이트 누바 | ch19 / 1192 베이트 누바 십자군 철수 전 요격 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- win_mode all 의 ridge in_zone 2개 삭제(증원 cue 트리거로만 유지) 후 격파 단일화 | 기존 map 799(4개 공유) [su_pk04_hill_claim 36x26] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch20_s8 나이토 돌격 | ch20 / 1575 나이토 마사토요 돌격 격퇴 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- win_mode all(turn_gte 9) 삭제; lose gaps_down/maeda_down 유지, maeda 부가 유지 | 기존 su_ch20_s8_naito(map 966, 40x28) [su_ch20_s8_naito 40x28] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향; star sub_objective maeda 유지; stage_companions ch20_s8 확인 | 중간 |
| ch22_s10 델리 성문 광장 | ch22 / 1526 델리 성문 광장 소탕 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- 적 지휘관(수문장) 배치 | 기존 map 1013(su_ch22_s10_delhi_gate) [su_ch22_s10_delhi_gate 32x24] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch23_s10 대관식 소요 방지 | ch23 / 1066 크리스마스 대관식 소요 진압 | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- 소요 주동자를 enemy_commander 로 지정 | 기존 map 946(su_ch103_s5_cathedral 공유) [su_ch103_s5_cathedral 36x26] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |
| ch24_s4 투르 결전 | ch24 / 732 투르-푸아티에 결전(압드 알 라흐만 격파) | - objective survive_turns(6) -> defeat_commander (win_conditions defeated enemy_commander 가 이미 존재: win_mode/win_conditions 삭제로 단순화)<br>- lose charles_down/hilltop, sub_objectives(unit_survive charles, protect_tiles hill_breach) 유지<br>- max_turns 12 유지 | 기존 su_ch24_s3_uphill(map 852, 40x28, ch24_s3 공유) [su_ch24_s3_uphill 40x28] | star sub_objective charles/hill_breach 유지; 사실상 현재도 격파 조건이라 위험 낮음 | 낮음 |
| ch24_s5 가론 강 | ch24 / 721~732 가론 강 전투(프랑크 팔랑크스) | - objective.type survive_turns -> defeat_commander(turns 키 제거), 방어형 win_mode/win_conditions(turn_gte) 제거, max_turns 유지(+0~2 검토), enemy_commander를 적 진영 쪽으로 재배치(enemy_squads[0])<br>- npc_frankish_phalanx_captain 부가 유지 | 기존 map 728(5개 공유) - 선택: 850/851 교체 [su_pk02_ford 36x26] | 별 turn_within 6~7은 격파형에 짧으므로 +2~3턴 상향 | 중간 |

재활용 에셋: 전 35개 모두 기존 맵·타일·NPC 스프라이트·초상화·대사 재사용. 신규 이미지/오디오 0. 새 연출은 기존 cue(fire, terrain_change, shake, sfx, set_flag)만 사용.

### 2-8. 유지하는 NPC 호위·인도 9개

| 코드 | 이름 | 유지 근거 |
|---|---|---|
| ch11_s1 | 담판 길 | 서희 담판 길 안내(외교 사절 인도) - 993 서희-소손녕 담판 장면의 핵심 |
| ch14_s1 | 청야 | 청야(수레·백성 철수 호송) - 청야수성 전술의 핵심 |
| ch16_s1 | 보급 호송 | 오를레앙 보급 호송(수레 2대) - 잔 다르크 오를레앙 입성 보급선 |
| ch19_s2 | 예루살렘 퇴거 | 예루살렘 퇴거 행렬 인도 - 피난·퇴거 장면 |
| ch20_s1 | 사자 호송 | 사자 호송(도리이 스네에몬 구원 사자) - 나가시노 사자 계열(사용자 예시) |
| ch22_s6 | 아그라로 가는 보급로 | 아그라로 가는 보급로(수레 2대) - 바부르 보급선 |
| ch23_s1 | 생발레리의 출항 | 생발레리 출항: 선적 수레 부두 호위 - 정복군 출항 준비 |
| ch102_s3 | 곡식 짐의 골짜기 | 서고 2막 곡식 짐 운반 - 서고 본편 호위 대표 |
| ch103_s3 | 강가의 뱃사공 | 서고 3막 강가의 뱃사공(나루 인도) - 피난·도강 인도 |

참고: 호위 유지 9개 외에도 NPC 사망=패배(must_survive)는 부가 조건으로 계속 남아 있는 스테이지가 다수이며, 이들은 비중 집계에 포함하지 않는다.

## 3. 전환 규칙 (유형별 템플릿)

엔진 지원 조건(EventConditions): turn_gte, hp_pct_lte, defeated, retreated, alive_count, in_zone, adjacent, unit_distance_lte, unit_enter_tile, flag, all/any/not. cue: say, camera, sfx, shake, move, spawn, set_flag, retreat, defect, terrain_change, fire. win_conditions는 최대 6개, 깊이 4.

| 유형 | 템플릿 | 엔진 |
|---|---|---|
| 격파·섬멸 | objective {type:defeat_commander}, win_mode/win_conditions 없음. 섬멸형은 win_mode only + [{when:{type:alive_count,side:b,op:eq,value:0,kind:any}}]. 적 지휘관은 적 진영 후방, 병종 상성·지형 공략 지점 배치. 별 turn_within은 9~12 | 지원 |
| 거점 점령 | objective {type:capture, points:"map" 또는 [[x,y]..], mode:any 또는 all, hold_turns:0~30, by, fail_if_enemy_holds}. points:"map"은 맵 meta.objective_points 필요 | 지원 |
| 도달·돌파·탈출 | win_mode only + [{label,latch:true,when:{type:in_zone,unit:"@protagonist",tiles:[..]}}] (구역 1~4개 순차), 필요시 + {type:alive_count,side:a,op:gte,value:N} 로 돌파 인원 확인, lose에 {type:defeated,unit:"@protagonist"}는 기본 패배와 중복이라 불필요 | 지원 |
| 방어·생존 | objective {type:survive_turns, turns:8~10}, 부가 sub_objectives(hold_zone/protect_tiles/unit_survive). 보강은 cues spawn(on turn/flag) | 지원 |
| NPC 호위·인도 | ally_npcs[{hero,route:{waypoints,from_turn,move_cap},must_survive:true}] + win_mode only + {type:in_zone,unit:"hero:npc_x",tiles}, lose {type:defeated,unit:"hero:npc_x"} | 지원 |
| 기타 특수 | 장치/방화/방파제: cue set_flag(on in_zone) + fire/terrain_change 표시 + win_mode only [{when:{type:flag,key,value}} 또는 in_zone latch:true 다수]. 시설 파괴: 적 시설 유닛을 cue spawn side b 로 두고 {type:defeated,unit:"hero:..."} | 지원(시설 유닛 spawn은 박백엔 확인 권장). 시설 HP/성문 체력은 미지원 |

승률 목표: +0 40~60% 유지(사용자 확정). 전환 후 각 스테이지를 같은 시드로 배치 시뮬레이션(game:simulate 또는 스테이지 시뮬 도구)해 승률 신뢰구간, 평균 턴, 턴 제한 도달률, 선공 편향을 측정하고 enemy_level_offset / 적 수 / max_turns를 한 번에 한 변수씩 5% 이내로 조정한다. 방어->격파 전환은 "공세 시간"이 늘어 턴 제한 패배가 늘어날 가능성이 높다(가설, 미측정).

### 대규모 전투 배치

| 코드 | 전투 | 맵 | 유형 | 비고 |
|---|---|---|---|---|
| ch12_s3 | 적벽 화공 | su_ch12_s3_redcliff 40x28 | 격파 | 현재 격파(all+화공 flag) 그대로. flag는 부가 |
| ch17_s3 | 가우가멜라 | su_ch17_s3_gaugamela 40x28 | 격파 | 격파 유지(all, 신호 구역은 부가) |
| ch20_s3 | 나가시노 설락원 | su_ch20_s3_shitaragahara 40x28 | 격파 | 격파 유지 |
| ch22_s5 | 파니파트 | su_pk06_fortress_siege 40x28 | 방어 | 방어 유지(수레벽) |
| ch21_s5 | 사요강 | su_pk15_village_war 36x26 | 점령 | 점령 유지(변경 없음) |
| ch1_s6 | 행주산성 | im_06_haengju 24x20 | 방어 | 방어 유지(T10) |
| ch23_s4 | 헤이스팅스 | su_ch23_s4_hastings_ridge 40x28 | 격파 | 점령 -> 격파(낮음) |
| ch24_s4 | 투르 결전 | su_ch24_s3_uphill 40x28 | 격파 | 방어 -> 격파(낮음) |
| ch15_s4 | 자마 | su_ch15_s4_zama 40x28 | 격파 | 격파 유지 |
| ch11_s4 | 귀주 | su_ch11_s4_gwiju 40x28 | 격파 | 격파 유지 |
| ch13_s2 | 황산벌 | su_ch13_s2_hwangsanbeol 40x28 | 격파 | 격파 유지 |
| ch14_s4 | 살수 | su_ch14_s4_salsu 40x28 | 격파 | 격파 유지(수공 연출은 cue 로 부가 가능) |
| ch22_s7 | 칸와 | su_pk20_grand_mixed 36x26 | 격파 | 점령 -> 격파(칸와, 중간) |
| ch20_s4 | 나가시노성 농성 | su_ch20_s4_nagashino_castle 32x24 | 방어 | 방어 유지 |

## 4. 실행 순서와 담당

| 배치 | 대상 | 내용 | 담당 | 시드 명령(개발 DB만) |
|---|---|---|---|---|
| B0 | 전체 | 백업: 대상 stages_*.json 및 stage_companions.json 을 *.bak-mission-20261107 로 복사, 시작 전 DB stages.rules/objective 덤프 | 임밸런 | - |
| B1 | 낮음 12개: ch13_s1, ch13_s8, ch17_s1, ch20_s5, ch21_s7, ch15_s7, ch16_s8, ch17_s5, ch20_s9, ch21_s9, ch23_s4, ch24_s4 | 키 교체 + 시드 + 시뮬 | 임밸런(데이터), 박백엔(시드 실행/검증), 정검수 | game:seed-shelf --chapters=... --update --dry-run 후 본 실행 |
| B2 | 방어->격파 중 중간 난이도 | 적 지휘관 재배치, turn_within 상향, 시뮬 재튜닝 | 임밸런 | 동일 |
| B3 | 중간 21개 + 높음 2개 중 ch16_s6 (호위->격파/기타, 점령/방어->기타 포함) | cue(set_flag/fire/terrain_change)와 win_conditions 신규 작성, 플레이 확인 | 임밸런 + 맵디자이너(타일/구역 좌표 확인) + 강화면 | 동일 |
| B4 | 서가 본편 ch102_s1, ch103_s1 | game:seed-main --act=2/3 --update, 본편 대사 수정 | 송서사(대사), 박백엔 | seed-main |
| B5 | 전 35개 | 컷신/대사/목표 문구 수정(주인공 중심, 근거 표기 금지 규칙 준수), FE 목표 표시 확인 | 송서사, 윤프론(필요시), 강화면 | - |
| B6 | 전체 | 전체 재측정(170개 배치), 분포 재집계 스크립트로 76/34/26/17/9/8 확인 | 임밸런, 정검수 | - |

챕터 단위 순서 제안: ch13, ch17, ch20, ch21(낮음 위주) -> ch11, ch12, ch14, ch15, ch16 -> ch19, ch22, ch23, ch24 -> ch102/103. 한 배치 단위는 최대 1~2개 챕터로 제한하고, 각 배치마다 시드 dry-run, 백업, 시뮬을 거친다.

롤백: (1) 배치 전 DB 덤프와 JSON 백업을 보관, (2) 백업 JSON으로 되돌린 뒤 같은 시드 명령(--update)을 다시 실행. StageRulesMerge가 null=삭제/객체=병합이므로 되돌릴 때는 삭제된 키(win_mode 등)를 백업 값으로 명시해야 한다. 별·클리어 기록은 stage id 기준이라 보존되지만 별 조건 id가 사라지면 기존 별 표시가 달라질 수 있다.

## 5. 맵 재사용

- 맵 변경 필수 0건. 35개 전부 현재 맵 유지. 동일 맵 공유로 인한 반복은 구역 좌표(rules)로 구분됨.
- 선택 사항(맵디자이너 판단): ch16_s8이 중앙아시아 변형 맵(952)을 사용(프랑스 장면과 불일치 가능), ch17_s6은 931(4개 공유)을 954(steppe)로, ch19_s7(도달)은 5개 도달이 몰린 800 대신 953 변형 검토. 근거는 DB 맵 공유 목록이며 시각 확인은 못 했다.
- 40x28 미연결 맵: 0개(26개 전부 연결). 미연결 54개는 소형 원본이라 대규모 전환 대상에 부적합. 신규 맵 제작 불필요.

## 6. 리스크

| 리스크 | 내용 | 확실도 |
|---|---|---|
| 방어->격파 시간 부족 | max_turns 11~12, 별 turn_within 6~7. 규칙(win_rule)이 있는 전투는 턴 상한=패배라 격파 전환 시 패배율 상승 가능. 기본 objective만 쓰면 HP 비교 판정이 남음 | 가설 |
| 적 지휘관 도달성 | 방어 맵은 적 지휘관이 후방/증원 위치. 격파로 바꾸면 도달 경로·commander_guard AI로 난이도 급변 | 가설 |
| 서사 불일치 | 호위 해제 시 대사의 "안내/호송" 문구와 목표 불일치. 송서사 수정 필요 | 높음 |
| 별 조건 | sub_objective id를 가진 별 조건(예: inmun, torii, lu_su)이 삭제되면 별 판정이 사라짐 | 높음 |
| 병행 작업 충돌 | 수레 이동 버그 수정·NPC 참전 감사·적 강도 측정이 같은 stages_*.json 을 편집 중이면 병합 충돌 | 중간 |
| 분류 경계 | ch22_s2(기타 vs 도달+섬멸), ch22_s9, ch16_s6 은 "장치+도달" 복합이라 사용자 분류 기준 확인 필요 | 중간 |
| 시설 파괴 미지원 | 성문/시설 HP 없음. 지형 변경과 유닛 격파로 대체 | 높음 |
| 최소 전환 | 35개 모두 변경해야 정확히 76/34/26/17/9/8. 일부만 하면 비중이 이동만 함 | 산술 |

## 7. 사용자 결정이 필요한 열린 질문

1. 호위 유지 9개 선정(2-8)에 동의하는가? 특히 ch102_s3, ch103_s3(서고 본편)을 유지하고 ch103_s1을 격파로 바꾸는 안.
2. "기타 특수 목표 8개" 중 ch22_s2, ch22_s9, ch16_s6처럼 장치+도달 복합을 기타로 세는 기준이 맞는가?
3. win_mode all 하이브리드 처리(격파+신호 구역 등)를 주 목표 기준으로 세는 것이 맞는가, 아니면 별도 분류가 필요한가?
4. 서고 본편(ch101~104) 20개의 비중을 이번 170개 집계에 그대로 포함하는가, 별도 비율로 둘 것인가?
5. 방어->격파 11개는 "버티기" 서사(통주/신성/강하 등)가 사라진다. 서사상 반드시 방어로 남겨야 할 스테이지가 있는가?

산출 JSON: mission_ratio_plan_20261107.json (스테이지별 현재/목표/세부 계획, 경계 사례, 챕터표 포함).
