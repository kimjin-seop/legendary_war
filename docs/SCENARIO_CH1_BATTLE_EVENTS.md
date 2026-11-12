# ch1(임진왜란) 분량 확장 1차 — 아크표·공개 순서·전투 중 이벤트(cue) 제안

작성: 송서사 (2026-11-03). 지침: docs/SCENARIO_DIRECTOR_GUIDE.md(7·8절), docs/SCENARIO_CH1_SHIORI_REVEAL.md, docs/ORIGINAL_STORY_SYNOPSIS.md, docs/CUTSCENE_SPEC.md.
적용 파일: `resources/js/game/data/dialogue/campaign_ch1_scenes.json` / `database/data/campaign_ch1_scenes.json`(두 파일 동일, version 7). 이번 라운드 범위: ch1_open, ch1_s1~s5(전·후). s6 이후는 v6 그대로(다음 라운드).
이 문서의 cue 표는 **제안**이다. stages_imjin10.json 등 데이터에는 넣지 않았다(담당 아님). 전부 가상 각색이며 대사는 창작 대사다.

## 1. 장 아크 표 (기승전결 → 장면 id)

| 단계 | 장 수준 질문/전환 | 장면 id | 이번 라운드 상태 |
|---|---|---|---|
| 기 | 줄(대열)은 누가 세우고, 기록의 빈 줄은 누가 메우는가. 곽재우의 '여울 기억'과 '사서가 틀리면 아무도 모른다' 심기 | ch1_open, ch1_s1_pre, ch1_s1_post | 확장 완료 |
| 승 | 연합과 지휘권의 마찰(원균·이순신 / 곽재우·김시민), 곽재우의 사서 의심 누적 | ch1_s2_pre~s4_post | 확장 완료 |
| 전 | 연합의 시련(명군·승병), 정정 사건(s6_post), 정식 추궁(s7_post) | ch1_s5_pre/post(휴지 장면), ch1_s6, ch1_s7 | s5 완료, s6~s7 다음 라운드 |
| 결 | 고백(s8_pre), 빈자리를 메우지 않겠다는 답(s10_post), 장 마무리 | ch1_s8~s10, ch1_end | 다음 라운드 |

스테이지별 전·후 쌍의 기승전결(이번 범위): 전투 전 = 기(목적)·승(의견 충돌), 전투 중(제안) = 전(변수), 전투 후 = 결(대가·관계 변화·복선).

## 2. 곽재우-시오리 정보 공개 순서 (REVEAL 문서 순서 유지, 이번 라운드에서 앞 장면 근거를 보강)

| 장면 | 곽재우가 새로 알게 되는 것 / 행동 | 전제(앞 장면에서 이미 제시) | 이번 보강 |
|---|---|---|---|
| open | 자신의 마지막 기억은 정암진 아침(말 물 먹이기). 서고는 기록을 메우고 표시는 사서가 한다. '그 사서가 틀리면 아무도 모르겠구려' | 없음 | 신규 단서 2개(여울 기억, 사서 무오류 전제). s2_post의 비교 근거가 open에서 처음 생김 |
| s1_pre | 편성은 사서 한 명이 붓으로 한다 | open의 '표시는 사서' | 기존 유지 |
| s1_pre/post | '남쪽 암초'를 보기 전에 입이 먼저 말함 -> post에서 곶을 돌자 실제로 있었음. 노 소리가 몸에 익음. 명부에 옥포 줄이 올라감 | s1_pre(이순신이 '어찌 아시오' 묻는 장면이 대사에 포함됨) | 기존 'post에서만 말하는 이상함'을 pre에도 장면으로 둠(전투 중 cue가 없어도 이해 가능) |
| s2_post | 정암진 기억과 옥포 기억의 질감 차이. 시오리의 '옥포와는 다릅니다' 말실수. 이순신이 '급히 캐지 마시오' | open(여울 기억), s2_pre(오른편 모래가 꺼진다는 아침 경험) | 이순신의 제동 대사 추가(s7_post '묻지 않는 것이 예의'로 이어짐) |
| s3_post | 직함 칸 확인을 핑계로 명부를 열람. 옥포 줄이 정암진 줄보다 먼저 쓰였는데 더 젖어 있다. 시오리 거짓 진술 '사람을 새로 쓰지 않는다' | s2_post(직함 칸 지우기 약속), s1_post(옥포 줄 명부 기재) | 열람 동기를 '직함 칸이 지워졌나 확인'으로 바꾸어 뜬금없음 제거. 먹 단서를 '먼저 쓴 줄이 더 젖어 있다'는 논리로 강화 |
| s4_post | 조건부 신뢰('일단은 두 번') | s3_post | 기존 유지 + 김시민 깃발 증여로 '군적에 없는 사람도 신호를 받는다'는 관계 변화 추가 |
| s5_post | (휴지) 곽재우가 장부 이야기를 하루 미룬다 | s4_post | 새 단서 없음. 관계 변화만(곽재우가 시오리 앞에서 한 박자 물러남) |
| s6_post~s8_pre | 정정 사건, 정식 추궁, 고백 | 위 전부 | 이번 라운드 미수정(v6 유지) |

용어 점검: ch1 사이드에서는 '메우다'를 사용하고, 메인(되찾기)과 섞지 않는다. 테무진 병행표기 없음(ch1 범위 해당 없음).

## 3. 이번에 고친 핵심 (편집자 모드 평가 요약)

| 장면 | 문제 평가 | 재설계 |
|---|---|---|
| s4_pre (사용자 지적 '성 밖의 사람들은 목사 영감의 군적에 없소…') | 신분 상태만 선언하는 대사. 갈등의 이유·상대의 응수가 없고 곽재우가 지도에 있는 이유(성 안에 서 있음)도 설명되지 않음 | 갈등을 '청이면 듣겠소, 영이면 못 듣겠소 -> 성문부터 열고 간 이들을 본 기억 -> 김시민의 응수(나는 그 문 앞에 서 있겠소) -> 곽재우의 반박(쓰러지면 영은 끊긴다) -> 깃발 둘 신호 체계 -> 볼모냐 연락이냐 -> 보증' 순의 제안-반박-양보로 재작성. 군적 개념은 해결 대사('군적에 없는 사람에게도 통하는 말')로 이동. s4_post에서 둘째 깃발 증여로 회수 |
| open | 세계관 설명이 시오리에 집중되고 곽재우는 반응만 함 | 곽재우의 도착 상황(말 물 먹이던 아침)·죽은 사람이냐는 질문·이름 모르는 의병 호칭('어이')·사서 무오류 의심을 넣어 설명을 질문과 반박으로 전환 |
| s1_pre | 원균·정운이 등장해도 갈등이 없고 곽재우는 관찰자 | 선봉 다툼(정운/원균) -> 신호 기준(이순신) -> '영이 둘이면 병졸은 가까운 쪽을 따른다'(곽재우) -> 곽재우의 배치(짐이냐 눈이냐) |
| s2_pre | 이순신이 육전에서 곽재우를 시험만 함 | 이순신이 배 없이 둑에서 말만 한다는 설정(육전 대사 전용 모순 해소)을 대사로 명시 |
| s3_pre | 원균이 설명 수신자에 그침 | 원균이 갇힌 적 즉시 공격을 주장 -> 이순신이 상륙 도주 우려로 반박 -> 우익 분담(양보) -> 곽재우의 '닫히는 때를 재는 사람' 훈수에 원균이 반발 |
| s5_pre/post | 이여송 일방 선언 | 곽재우-이여송 마찰, 유정의 '떨리는 채로 서라', 휴정의 '모르는 이름은 모른다고 적어라'(s10 '비워 둔 칸' 복선) |

## 4. 줄 수 통계 (이번 라운드)

| 장면 | 이전(v6) | 이후(v7) | 목표 | 시오리 줄(이후) |
|---|---|---|---|---|
| ch1_open | 12 | 27 | 20+ | 10 |
| ch1_s1_pre | 15 | 24 | 15~25 | 4 |
| ch1_s1_post | 17 | 17 | 10~18 | 5 |
| ch1_s2_pre | 14 | 19 | 15~25 | 4 |
| ch1_s2_post | 14 | 16 | 10~18 | 4 |
| ch1_s3_pre | 10 | 19 | 15~25 | 5 |
| ch1_s3_post | 17 | 17 | 10~18 | 5 |
| ch1_s4_pre | 14 | 20 | 15~25 | 7 |
| ch1_s4_post | 12 | 14 | 10~18 | 5 |
| ch1_s5_pre | 14 | 17 | 15~25 | 6 |
| ch1_s5_post | 9 | 15 | 10~18 | 4 |
| 합계 | 148 | 205 | | |

시오리 줄 수 메모: s4_pre는 목표 안내 규칙(승리 조건 변경 안내 + 지형 + 한 줄 위트)과 장면 도입 3줄이 겹쳐 7줄. 다음 라운드에 목표 안내를 2줄로 압축 검토.

## 5. 전투 중 이벤트 표 (제안, cue 종류: say/camera/sfx/shake/move/fire/set_flag/spawn만 사용)

표기: `on` = battle_start / turn:N / when(조건). 좌표는 maps_imjin10.json(24x20) 기준 근사치이며 맵디자이너·임밸런이 최종 확정. 'unit' 참조는 CUTSCENE_SPEC 6절 형식(`hero:<code>`, `enemy_commander`, `ally_commander`). 화자 코드는 spec 예시 형식(`hero:gwak_jae_u`)이며 장면 JSON의 `hero:144`와 같은 인물이다.

### 5-1. ch1_s1 옥포 (전조 -> 돌발 -> 회수 3점 세트)

지형 메모: 서쪽 x0~4 마을, x4~5 선소(dock), x5~7 모래 해변. 아군 배치 x9~11, 적 배치 x17~21. 북 암초 십자(8~12, 4~6), 남 암초 십자(15~19, 13~15). 곽재우 NPC (6,8) 후미, 정운 NPC (9,4), 원균 NPC (10,14).

| # | on | 종류 | cue(제안) | 목적·연결 | 구현 |
|---|---|---|---|---|---|
| s1-E1 | battle_start | 환경 | camera focus [2,9] 600ms -> fire tiles [[1,8],[2,8],[1,9],[2,9],[2,10]] turns 3 + sfx `sfx_fire` -> say(정운) '마을에 불이 붙었습니다.' -> camera restore | pre의 이순신 '마을 연기' 대사의 시각 확인. 서둘러야 하는 이유를 첫 화면에 둠 | 가능 |
| s1-E2 | turn 2 | 전조 | camera focus [17,14] 500ms -> say(곽재우) '저쪽 물빛이 다르오.' -> camera restore | pre에서 곽재우가 말한 남쪽 암초를 플레이어에게 한 번 더 지목(지형 활용 힌트) | 가능 |
| s1-E3 | turn 3 | **돌발(인물 이탈)** | move `hero:npc_won_gyun` -> [13,13] -> say(원균) '앞은 내 배요!' -> say(이순신) '줄을 지키시오. 신호를 보시오.' -> set_flag `okpo_wongyun_out` true | pre의 '영이 둘이면 병졸은 가까운 쪽을 따른다' 갈등을 화면에서 실현. 플레이어는 줄을 지킬지 원균 쪽으로 붙을지 판단. 원균이 악역으로 읽히지 않도록 이유('내 관할 바다')는 pre에 이미 제시 | 가능(move: 이동력 검사 생략, 맵 안 빈 칸 필요) |
| s1-E4 | turn 4, when flag `okpo_wongyun_out` | 회수 | move `hero:npc_won_gyun` -> [12,12] -> say(원균) '……신호 봤소. 줄에 들겠소.' | post의 '신호는 보이는 데까지만 보겠소' 대사 전제. 이탈이 없었던 판이면 발동하지 않음 | 가능(flag 조건 6절) |
| s1-E5 | turn 3 이상, when `enemy_commander` hp_pct_lte 40 | 조건 | say(정운) '지휘선이 흔들립니다. 지금입니다.' + sfx `sfx_battle_roar` | 승리 직전 긴장. 목표(지휘관 격파)와 직접 연결 | 가능 |
| s1-E6 | turn 5 | 정보 | camera focus [6,8] -> say(곽재우) '후미는 비었소. 뒤는 걱정 마시오.' -> camera restore | pre의 '눈이오, 후미를 보시오' 역할 회수(곽재우가 배치대로 일함) | 가능 |
| 연출 요청(미구현) | - | - | ①남쪽 암초에 적선이 걸려 멈추는 지형 판정 ②후퇴하는 적선 force_retreat(spec상 미구현) ③E3 발생 여부에 따른 s1_post 대사 분기(dialogue_conditions는 전투 flag를 읽지 않음) ④마을 불 피해 판정 | | 요청 |

### 5-2. ch1_s7 노량 (야간, 청각 중심)

지형 메모: 아군 서쪽(곽재우 NPC [3,?], 진린 NPC [2,?]), 적 동쪽. 암초 북서(2~6,3~5), 북동(17~21,4~6), 중남(6~10,13~16), (14~18,13~15). triggers에 기존 turn 3 `rear` 구역(22,8~11) 증원(naval x2)이 있으므로 아래 돌발은 그 증원과 **같은 시점에 맞춘 연출**이며 새 spawn은 만들지 않는다(막당 증원 1회 규칙 준수).

| # | on | 종류 | cue(제안) | 목적·연결 | 구현 |
|---|---|---|---|---|---|
| s7-E1 | battle_start | 전조 | camera mode overview -> say(이순신) '불 하나는 우리, 불 둘은 명이오.' -> camera restore | pre의 표식 약속을 첫 화면에서 한 번 더 고정(아군 오인 사격 방지 설명을 대사로 대체) | 가능 |
| s7-E2 | turn 2 | **전조** | camera focus [22,9] 600ms -> say(곽재우) '동쪽 북이 한 박자 빨라졌소.' -> camera restore | pre의 '나는 북소리를 세겠소' 회수. 3턴째 후속 함대(기존 spawn)의 복선 | 가능 |
| s7-E3 | turn 3 | **돌발(정보 반전)** | shake power 3 ms 400 + sfx `sfx_battle_roar` -> camera focus [22,9] -> say(진린) '뒤에 불이 늘었다!' -> say(이순신) '도독, 앞을 보시오. 뒤는 우리가 보겠소.' -> camera restore | 기존 turn 3 증원 spawn과 같은 시점. 진린이 '배를 돌린다'고 했던 약속을 시험하는 압박 시작 | 가능 |
| s7-E4 | turn 3 이상, when `hero:npc_jin_rin` hp_pct_lte 50 | 조건(인물 시험) | say(진린) '……앞이 무너진다. 말했을 것이다.' -> say(곽재우) '도독, 불 둘이 아직 서 있소.' + set_flag `jinrin_pressed` true | pre '앞이 무너지면 이 몸은 배를 돌린다'를 지키느냐의 갈림길. 플레이어가 진린 쪽으로 구원하면 다음 E5 | 가능 |
| s7-E5 | when all[flag `jinrin_pressed`, adjacent(`hero:yi_sun_sin`,`hero:npc_jin_rin`)] | **회수(플레이어 행동 연동)** | say(진린) '……인사는 나중에 하겠다.' | post의 '먼저 노를 돌려 온 배'와 연결. 플레이어가 이순신을 진린 곁에 붙였을 때만 발동 | 가능(adjacent 조건 6절) |
| s7-E6 | when `enemy_commander` hp_pct_lte 30 | 조건 | say(곽재우) '북이 느려졌소. 저쪽이 흔들리오.' + sfx `sfx_battle_clash` | 승리 직전. pre의 '북이 끊기는 쪽이 흔들리는 쪽' 회수 | 가능 |
| 연출 요청(미구현) | - | - | ①야간 시야 제한(적 접근을 소리로만 알리는 연출) ②진린 퇴각 AI(force_retreat)와 복귀 ③이순신 전사 암시(전투 중 연출 없음, post에서 시오리 한 줄로 처리) ④불 둘/하나 표식 마커 | | 요청 |

### 5-3. 이후 스테이지 간단 제안 (이번 라운드 대사에는 미반영, 다음 라운드 설계 입력)

| 스테이지 | 전조 -> 돌발 -> 회수 아이디어 | 구현 |
|---|---|---|
| s2 정암진 | T1 camera focus 오른편 모래(곽재우 '저기가 꺼지오') -> T3 곽재우 NPC move로 붉은 옷이 한쪽 모래톱에 서서 적 시선 유도(say '여기요') -> T5 적 지휘관 근접 시 say(이순신, 둑) '둑에서 보니 한 줄이 비었소' | 가능 |
| s3 한산도 | T1 미끼 배 신호 say -> T3 원균 NPC move 우익 끝 위치로(우익 닫기) -> 점령 2턴째 say(곽재우) '닫히오' | 가능 |
| s4 진주성 | T4 camera focus 성 동쪽 [23,5] say(곽재우) '성 밖 연기, 내 사람들이오' -> T5 기존 outer_east 증원 시점에 sfx+say(곽재우) '깃발 하나. 아직 버티는 중' -> 아군 지휘관 hp_pct_lte 40 때 say(곽재우) '둘째 깃발이오!' + set_flag | 가능. side a 의병 spawn은 npc_ally 여부를 박백엔 확인 후(제안 보류) |
| s5 평양성 | T1 say(이여송) 대포 신호 + shake -> T3 성문 두 곳 중 먼 쪽에 say(곽재우) '서운한 쪽이 비었소' -> 점령 1턴째 say(유정) '떨림이 멎었습니다' | 가능 |

## 6. 근거 수준 표 (이번 라운드에서 건드린 사실 항목)

웹 대조는 이번에 2건만 수행(WebSearch). 나머지는 기존 outline·문서 근거에 의존하므로 사람 확인 권장.

| 항목 | 장면 | 수준 | 근거/메모 |
|---|---|---|---|
| 옥포 해전 1592.5.7(음), 이순신-원균 합류 후 교전 | s1 | accepted | 한국민족문화대백과 '옥포해전' https://encykorea.aks.ac.kr/Article/E0038825 (오마이뉴스 등 2차: 원균 판옥선 4척 합류, 적선 26척 격파 서술 — 숫자는 대사에 쓰지 않음). 날짜는 사료마다 차이 있어 5/7 유지 |
| 마을을 약탈하던 적이 배로 돌아가는 중(마을 연기) | s1_pre | verify | 이번 검색에서 확인 실패. 대사는 '돌아가지 못했다면'이라는 가정형으로 한정, 사실 단정 아님 |
| 정운(녹도만호)의 선봉 지원 대사 | s1 | invented | 정운 부산포 전사는 confirmed(기존 ch1_end), 선봉 대사 자체는 창작 |
| 원균의 '내 관할 바다' 선봉 주장, 신호 불복 | s1 | invented | 옥포가 경상우수영 해역이라는 점은 accepted. 불복 행위는 창작이며 인물 평가 서술 아님 |
| 곽재우 옥포 승선, 이순신 정암진 참전 | s1, s2 | invented(각색) | 'what_if' 표시 유지 |
| 정암진 남강·안코쿠지 에케이, 늪지 지형(통과 지점 표식) | s2 | accepted | https://www.seoul.co.kr/news/2022/02/28/20220228023002 , https://www.ktriptips.com/kor/tourspot/126193 (푯말 서술자는 자료마다 다름 -> 대사는 '모래가 꺼진다'로만 사용) |
| 붉은 옷(홍의장군) | s2 | accepted | 서울신문 상동. '사람 대신 옷을 미끼로' 전술 논의는 창작 |
| 견내량 좁은 물목, 넓은 바다로 유인, 적이 육지로 상륙해 도주할 우려 | s3 | accepted | 이순신 한산 전술 통설. 대사 표현은 창작. 상륙 도주 우려 사유는 verify(정확한 사료 인용 필요) |
| 와키자카가 선단을 기다리지 않고 먼저 나섬 | s3 | verify | 기존 데이터 유지(verify=true) |
| 구키·가토 안골포 | s3 | accepted | 기존 데이터 유지 |
| 진주성 1차 공방(김시민 목사, 상처로 사망) | s4 | confirmed/accepted | 기존 outline 근거. 곽재우 등 의병의 성 밖 견제는 verify(기존 verify=true) |
| 관리가 성문을 버리고 도망쳤다는 곽재우의 경험 서술 | s4_pre | accepted(일반론)/invented(대사) | 전쟁 초 관리 이탈과 의병-관 갈등은 통설. 특정 인물을 지목하지 않음 |
| 김시민-곽재우의 깃발 신호·둘째 깃발 증여 | s4 | invented | 가상 각색 |
| 평양성 1593.1월, 이여송, 승병(휴정) 참전 | s5 | confirmed | 기존 데이터 유지. 유정의 평양 참전은 verify(기존 시오리 대사에 명시) |
| 이여송의 선공 은 포상 | s5_pre | verify | 통설로 전하는 일화이나 사료 확인 필요. 대사는 창작 |
| 승병의 이름을 모르는 이가 많다는 유정의 말 | s5_post | invented | 휴정의 답('모르는 이름은 모른다고 적어라')은 s10 '비워 둔 칸' 복선용 창작 |
| 곽재우가 '집안 장정 열 남짓으로 시작' | open | verify | 의병 초기 사재·가노 동원 서술을 참고한 창작 수준 표현. 수치는 임의 |

## 7. 사용자 확인 필요 항목

1. s4_pre에서 김시민이 곽재우에게 '성 안 연락' 역할을 맡기는 설정(곽재우 NPC가 지도의 성 안에 있는 이유)을 승인할지. 사실이 아닌 가상 각색이며 s4_post의 '둘째 깃발' 증여가 새 모티프로 추가되었다.
2. s1 E3(원균 신호 이탈)의 각색 수위. 원균을 부정적으로 읽히게 할 위험이 있어 이유('내 관할 바다')를 pre에 둠. 불가하면 E3~E4를 삭제하고 정운의 선봉 돌출로 교체 가능.
3. 줄 수: s1_post(17), s3_post(17)는 기존 유지에 가깝다. 후반 전투 후 장면을 늘리려면 대가(손실·이탈) 요소가 필요하다.
4. 정식 cue 도입 시점 및 stages 반영 담당(박백엔/임밸런) 지정. 이 문서의 좌표는 임시.
5. s5_post에서 곽재우가 시오리에 대한 질문을 하루 미루는 휴지 장면이 REVEAL 설계 의도('s5에는 단서 없음')와 일치하는지.
6. 골드 스탠더드 후보(미등록): s4_pre의 '깃발·볼모/보증' 교환, s3_post의 '먼저 쓴 줄이 더 젖어 있다' 추궁. 사용자가 선택하면 docs/SCENARIO_GOLD_STANDARD.md에 이유와 함께 등록.

## 9. stages.rules.cues 적용용 JSON (s1, s7) — 2026-11-03 2차

사용법: 아래 배열을 `database/data/stages_imjin10.json` 의 해당 스테이지 `rules` 객체에 `"cues": [...]` 키로 **추가**한다(기존 `factions`·`ally_npcs`·`enemy_commander` 는 유지, 교체 금지). 데이터 반영은 박백엔/임밸런. 문서 근거: docs/CUTSCENE_SPEC.md §1~2(cue 스키마), §6(`on.when` 조건), §7(spawn). 송서사는 stages 데이터를 수정하지 않았다.
규칙 점검: say `text` 200자 이하, `camera` focus 는 `tile` 필수, `fire.tiles` 40칸 이하·`turns` 1~10, `set_flag.key` `[a-z0-9_]{1,32}`, 잘못된 항목은 서버가 정규화 단계에서 조용히 버린다. 같은 시점 cue 는 배열 순서대로 발동한다. 화자 코드: `hero:gwak_jae_u`(곽재우), `hero:yi_sun_sin`, `hero:npc_won_gyun`, `hero:npc_jeong_un`, `hero:npc_jin_rin`(JSON 대사 파일의 `hero:144` 등과 같은 인물이며, cue 의 speaker 표기가 BattleDialogue 에서 코드 형식으로 해석되는지 박백엔 확인 필요).
좌표는 근사치(맵 24x20)이며 맵디자이너·임밸런이 확정한다. 확인이 필요한 항목에는 `_tbd` 를 붙였다(적용 시 제거).

### 9-1. ch1_s1 (옥포)

```json
"cues": [
  {"on": {"battle_start": true}, "do": "camera", "tile": [2, 9], "ms": 600},
  {"on": {"battle_start": true}, "do": "fire", "tiles": [[1, 8], [2, 8], [1, 9], [2, 9], [2, 10]], "turns": 3},
  {"on": {"battle_start": true}, "do": "sfx", "key": "sfx_fire"},
  {"on": {"battle_start": true}, "do": "say", "speaker": "hero:npc_jeong_un", "expr": "serious", "text": "마을에 불이 붙었습니다."},
  {"on": {"battle_start": true}, "do": "camera", "mode": "restore"},

  {"on": {"turn": 2}, "do": "camera", "tile": [17, 14], "ms": 500},
  {"on": {"turn": 2}, "do": "say", "speaker": "hero:gwak_jae_u", "expr": "neutral", "text": "저쪽 물빛이 다르오."},
  {"on": {"turn": 2}, "do": "camera", "mode": "restore"},

  {"on": {"turn": 3}, "do": "move", "unit": "hero:npc_won_gyun", "to": [13, 13]},
  {"on": {"turn": 3}, "do": "say", "speaker": "hero:npc_won_gyun", "expr": "serious", "text": "앞은 내 배요!"},
  {"on": {"turn": 3}, "do": "say", "speaker": "hero:yi_sun_sin", "expr": "serious", "text": "줄을 지키시오. 신호를 보시오."},
  {"on": {"turn": 3}, "do": "set_flag", "key": "okpo_wongyun_out", "value": true},

  {"on": {"turn": 4, "when": {"type": "flag", "key": "okpo_wongyun_out"}}, "do": "move", "unit": "hero:npc_won_gyun", "to": [12, 12]},
  {"on": {"turn": 4, "when": {"type": "flag", "key": "okpo_wongyun_out"}}, "do": "say", "speaker": "hero:npc_won_gyun", "expr": "neutral", "text": "……신호 봤소. 줄에 들겠소."},

  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "enemy_commander", "pct": 40}}, "do": "say", "speaker": "hero:npc_jeong_un", "expr": "serious", "text": "지휘선이 흔들립니다. 지금입니다."},
  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "enemy_commander", "pct": 40}}, "do": "sfx", "key": "sfx_battle_roar"},

  {"on": {"turn": 5}, "do": "camera", "tile": [6, 8], "ms": 500},
  {"on": {"turn": 5}, "do": "say", "speaker": "hero:gwak_jae_u", "expr": "neutral", "text": "후미는 비었소. 뒤는 걱정 마시오."},
  {"on": {"turn": 5}, "do": "camera", "mode": "restore"}
]
```

확인 메모(s1): ①`move` 는 유닛이 막혀 있거나 죽었으면 조용히 건너뛴다(spec §2). 원균이 T3 전에 격파되면 E3·E4 는 발동하지 않으며 문제 없다. ②원균 NPC 이동이 AI 행동 순서와 충돌하는지(같은 라운드에 AI가 즉시 되돌리는지) 박백엔 확인. ③`set_flag` 와 `when.flag` 는 같은 turn:3 에서 설정 후 turn:4 평가이므로 순서 문제 없음. ④E5(HP 40%)는 `on.turn:3` 이후 조건이 참이 되는 첫 시점 1회 발동.

### 9-2. ch1_s7 (노량)

기존 `triggers` 의 turn 3 `rear` 증원(naval x2)은 그대로 둔다. 아래 turn 3 연출은 그 증원과 같은 시점의 연출이며 새 spawn 은 없다.

```json
"cues": [
  {"on": {"battle_start": true}, "do": "camera", "mode": "overview", "ms": 700},
  {"on": {"battle_start": true}, "do": "say", "speaker": "hero:yi_sun_sin", "expr": "neutral", "text": "불 하나는 우리, 불 둘은 명이오."},
  {"on": {"battle_start": true}, "do": "camera", "mode": "restore"},

  {"on": {"turn": 2}, "do": "camera", "tile": [22, 9], "ms": 600},
  {"on": {"turn": 2}, "do": "say", "speaker": "hero:gwak_jae_u", "expr": "neutral", "text": "동쪽 북이 한 박자 빨라졌소."},
  {"on": {"turn": 2}, "do": "camera", "mode": "restore"},

  {"on": {"turn": 3}, "do": "shake", "power": 3, "ms": 400},
  {"on": {"turn": 3}, "do": "sfx", "key": "sfx_battle_roar"},
  {"on": {"turn": 3}, "do": "camera", "tile": [22, 9], "ms": 500},
  {"on": {"turn": 3}, "do": "say", "speaker": "hero:npc_jin_rin", "expr": "serious", "text": "뒤에 불이 늘었다!"},
  {"on": {"turn": 3}, "do": "say", "speaker": "hero:yi_sun_sin", "expr": "serious", "text": "도독, 앞을 보시오. 뒤는 우리가 보겠소."},
  {"on": {"turn": 3}, "do": "camera", "mode": "restore"},

  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "hero:npc_jin_rin", "pct": 50}}, "do": "say", "speaker": "hero:npc_jin_rin", "expr": "serious", "text": "……앞이 무너진다. 말했을 것이다."},
  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "hero:npc_jin_rin", "pct": 50}}, "do": "say", "speaker": "hero:gwak_jae_u", "expr": "serious", "text": "도독, 불 둘이 아직 서 있소."},
  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "hero:npc_jin_rin", "pct": 50}}, "do": "set_flag", "key": "jinrin_pressed", "value": true},

  {"on": {"turn": 3, "when": {"all": [{"type": "flag", "key": "jinrin_pressed"}, {"type": "adjacent", "a": "hero:yi_sun_sin", "b": "hero:npc_jin_rin"}]}}, "do": "say", "speaker": "hero:npc_jin_rin", "expr": "neutral", "text": "……인사는 나중에 하겠다."},

  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "enemy_commander", "pct": 30}}, "do": "say", "speaker": "hero:gwak_jae_u", "expr": "neutral", "text": "북이 느려졌소. 저쪽이 흔들리오."},
  {"on": {"turn": 3, "when": {"type": "hp_pct_lte", "unit": "enemy_commander", "pct": 30}}, "do": "sfx", "key": "sfx_battle_clash"}
]
```

확인 메모(s7): ①진린 HP 조건은 '살아있는 해당 유닛 중 HP% <= pct' 이므로 진린이 이미 격파된 경우 발동하지 않는다. 진린 격파 시의 연출은 요청 항목(아래). ②`adjacent` 조건의 a/b 는 서로 다른 유닛이어야 하며 이순신(플레이어 유닛)이 진린 곁에 섰을 때만 참이다. ③진린·곽재우가 같은 라운드에 말하는 순서는 배열 순서. ④sfx 키는 `public/assets/audio/cutscene_sfx_cues.json` 의 battle 키(`sfx_battle_roar`, `sfx_battle_clash`)와 CUTSCENE_SPEC 예시의 `sfx_fire` 를 사용했으며, 실제 오디오 manifest 존재 여부는 안아트/윤프론 확인(`_tbd`).

### 9-3. 연출 요청(미구현) 재정리
- 암초 좌초 판정, 후퇴 force_retreat(spec §7 미구현), 야간 시야 제한, 오인 사격 판정, 진린 퇴각 AI와 복귀.
- 전투 flag(`okpo_wongyun_out`, `jinrin_pressed`)를 전투 후 장면 분기(`dialogue_conditions`)에서 읽는 기능. 현재는 FE 평가기가 전투 상태 flag 를 읽지 않는다. 구현되면 s1_post/s7_post 에 '원균이 이탈했던 판' / '구원해 준 판' 변주 대사를 추가할 수 있다.
- 명부 화면, 먹 번짐 이펙트, 이름 입력 연출.

## 8. 다음 라운드

1차(2026-11-03): open~s5 확장. 2차(2026-11-03): s6~s10·ch1_end 확장 완료(v8), s1~s5 시오리 줄 압축, 골드 스탠더드 2건 등록(SCENARIO_GOLD_STANDARD §10~11), s1·s7 cue JSON(9절).

2차 줄 수(대사 합계 373줄, 장면별 ±1 오차 가능): s1_pre 23, s2_pre 17, s3_pre 17, s4_pre 17, s4_post 13, s5_pre 15, s6_pre 17(이전 12), s6_post 17(14), s7_pre 20·s7_post 14(변경 없음), s8_pre 26(20), s8_post 10(4), s9_pre 15(11), s9_post 12(6), s10_pre 15(8), s10_post 14(9), ch1_end 20(6).
남은 과제: s7 cue 를 stages 에 반영(박백엔/임밸런), 전투 flag 후 장면 분기 구현 여부 결정, s7_pre/post 의 추가 확장 여부(현재 §8 분량 충족).
