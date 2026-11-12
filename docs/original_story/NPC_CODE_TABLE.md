# 오리지널 메인 스토리 NPC 코드 전수 집계 (NPC_CODE_TABLE)

작성: 송서사, 2026-11-03. 대상: docs/original_story/act1~act4_scenes.json의 `speaker` 전수(Grep 집계)와 act1~4_events.md의 NPC 유닛 요구. 역사 근거 표기 규칙은 SCENARIO_DIRECTOR_GUIDE 준수(전 인물 오리지널 가상, 실존 3인은 대사 창작).

## 0. 집계 요약

- 화자 코드 종류: 고유 NPC 15종(`hero:npc_*`) + 실존 영웅 숫자 코드 3종(`hero:147`, `hero:248`, `hero:322`) + 공통 3종(`shiori`, `protagonist`, `caption`).
- `hero:npc_*` 화자 줄 수 합계 479줄(1막 132 / 2막 111 / 3막 112 / 4막 124). 지음·쪽이·붉은 펜 3종이 383줄, 나머지 12종이 96줄(2막 33 / 3막 36 / 4막 27). 위 15종 밖의 `hero:npc_*` 화자는 0건(15종 합이 총합과 일치함을 확인).
- `npc_roster_v3*.json`과 `dialogueData.js` NPC_NAMES에는 15종 모두 미등록(검색 0건). 등록은 앱 코드·시드 영역이라 이 작업에서 하지 않았다.
- 코드 상태 열: `임시` = 로마자 코드·이름 모두 작가 제안값이라 확정 필요, `가칭` = 이름 자체가 가칭(speaker_profile.name에 '(가칭)' 유지), `확인 필요` = heroes CSV 행 번호 확인 필요.

## 1. 고유 NPC 코드 (`hero:npc_*`)

| 코드 | 표시 이름 | 코드 상태 | 등장 막(장면) | 전투 등장 | 초상 필요 | 비고 |
|---|---|---|---|---|---|---|
| npc_jieum | 지음 | 가칭(이름·코드) | 1~4막 전 장면(1막 open부터 4막 epilogue까지) | 유닛 아님. 1막 pre/post·cue say 화자. 1-5 이후 순회지는 통신 음성(4-3부터 직접 동행, 이때 유닛화 여부 미정) | 필요(미제작) | 서고 지도관. 수치 합쇼, 말버릇 막당 2회 이내 |
| npc_jjogi | 쪽이 | 가칭(이름·코드) | 1막 1-3부터 4막까지 | 비전투 NPC. 1막은 cue say 화자만(호위·유닛화 보류). 2~4막은 허준 곁 이동 연출용 NPC 유닛 필요 요청(3-4, 4-3, 4-5) | 필요(미제작) | 4-5에서 스스로 '불씨'를 정함(제안값). 코드는 유지하고 표시명만 바꾸는 방식 권장 |
| npc_red_pen | 붉은 펜의 사자 | 임시(코드) | 1막 1-3 post·1-4, 4막 4-4·epilogue | 1-4: cue say 화자 + retreat 대상(유닛 필요). 4-4: 부관 적 유닛(격파 대상) | 필요(미제작) | 교정 담당 직인 소지자. 낭독조 합쇼, 조항 번호 |
| npc_gyojeong | 교정관 | 임시 | 2막 2-5(첫 음성), 3막 3-5, 4막 4-5·epilogue | 유닛 아님(음성 전용, 3-5 대면 이벤트) | 음성 아이콘만(전신 초상 불필요 가능) | 서고장 부재 중 직무 대행. 정중·사무적 |
| npc_bonggun | 봉군 | 임시 | 2막 2-1 | NPC 유닛(2-1 `unit_survive` 대상, 유닛 데이터 필요) | 필요 | 봉수대 근무자. 이름 칸이 빈 순회지 인물. 짧은 하오체 |
| npc_sagong | 사공 | 임시 | 2막 2-2 | NPC 유닛(2-2 `unit_survive` 대상, 앞선 이탈 move) | 필요 | 이름 칸이 빈 인물. 하오체, 물때·길·거리 단위 |
| npc_jimkkun | 짐꾼 | 임시 | 2막 2-3 | 수레 NPC 유닛(2-3 후방 지체 move) 요청 | 필요 | 이름 칸이 빈 인물. '~습니다요', 같은 말 반복 |
| npc_dol_ajumeoni | 돌 아주머니 | 임시(별칭) | 2막 2-4 | cue say 화자(2-4 돌 던지기 신호). 유닛 여부는 events에 미기재, 확정 필요 | 필요 | 성 안에서 불리는 별칭. 이름은 본인이 정함. 큰 목소리, 짧게 끊김 |
| npc_mabu | 마부 | 임시 | 3막 3-1 | NPC 유닛(3-1 `unit_survive`, 수레 줄 성문 도달) | 필요 | 이름 칸이 빈 인물. 해요체 |
| npc_bobyeong | 보병 | 임시 | 3막 3-2 | NPC 유닛 요청(3-2, 유닛 id 필요) | 필요 | 이름 칸이 빈 인물. 짧은 평어 |
| npc_baetsagong | 뱃사공 | 임시 | 3막 3-3 | NPC 유닛(3-3 `unit_survive`, 배 NPC 이탈 move) | 필요 | 이름 칸이 빈 인물. 이름 적히기를 원하지 않음 |
| npc_ilkkun | 성당 일꾼 | 임시 | 3막 3-5 | cue say 화자(3-5 e5-E2, E5). 유닛 아님 | 필요(음성 아이콘으로 대체 가능) | 이름 칸이 빈 인물. 조심스러운 해요체 |
| npc_gilzabi | 길잡이 | 임시 | 4막 4-1 | NPC 유닛(4-1 `unit_survive`, 행렬 바위 그늘 도달) | 필요 | 이름 칸이 빈 인물. 하게체, 걸음 수·바람 |
| npc_sangin | 대상 상인 | 임시 | 4막 4-2 | NPC 유닛 요청(대상 NPC, 중재 판정 미구현) | 필요 | 이름 칸이 빈 인물. 급한 합쇼, 계약 용어 |
| npc_yumokmin | 양치기 무리 어른 | 임시 | 4막 4-2 | NPC 유닛 요청(양치기 NPC, 중재 판정 미구현) | 필요 | 이름 칸이 빈 인물. 짧은 평어(~다). 코드 'yumokmin'은 '유목민' 로마자지만 표시명은 '양치기 무리 어른'이라 불일치, 확정 필요 |

## 2. 실존 인물 화자 (숫자 코드, npc 아님)

| 코드 | 이름 | 등장 막 | 전투 등장 | 초상 | 확인 필요 |
|---|---|---|---|---|---|
| hero:147 | 허준 | 2막 2-5 합류(2-1 복선), 3막, 4막 | 2-5·3-4·4-3 등에서 NPC 유닛 또는 cue say(2-5 NPC 유닛 없으면 caption 대체) | 기존 heroes 보유(코드 heo_jun) | CSV 147행 = 허준 확인 완료(2026-11-03, heroes_candidates.csv). 생몰 1539~1615는 verify |
| hero:248 | 잔 다르크 | 3막 3-5 합류, 4막 | 3-5 전투 중 등장 없음(post caption만), 4막 합류 | 기존 heroes 보유(코드 joan_of_arc) | CSV 248행 = 잔 다르크 확인 완료(2026-11-03) |
| hero:322 | 살라딘 | 4막 4-2 합류, 4막 이후 | 4-2 NPC 유닛(e2-E3 등장 move), 지급은 post | 기존 heroes 보유(코드 saladin) | CSV 322행 = 살라딘 확인 완료(2026-11-03). 생몰 verify |

팀장 결정 반영: 허준·잔 다르크·살라딘은 가챠 풀에서 제외하지 않으며 중복은 조각 처리. 메인 장면의 합류 문구는 '지급' 확정 표현보다 '합류' 톤을 유지(구현은 중복 처리 규칙 따름).

## 3. 공통 화자 (집계 참고)

| 코드 | 의미 | 비고 |
|---|---|---|
| shiori | 길잡이 시오리 | 기존 |
| protagonist | 주인공 {protagonist_name} | 기존, 대사 전부 invented |
| caption | 지문 | 렌더러 지원 확인(BattleDialogue kind=caption, 이름표 '기록'). cue say에서는 'caption'·'narrator' 모두 caption으로 처리(CuePlayer) |

## 4. 코드 확정이 필요한 항목 (가칭·임시 표시)

1. 가칭 확정: 지음, 쪽이(이름 자체가 가칭). 쪽이는 4막에서 '불씨'로 스스로 이름을 정함(제안값, 확정 필요).
2. 임시 코드 12종(교정관·사자 포함): 위 표의 `임시`. 로스터 등록 시 기존 규칙(`npc_<로마자>`)을 따르되 `yumokmin`처럼 표시명과 어긋나는 것은 정리.
3. 실존 3인 CSV 행 번호 확인(147·248·322).
4. 등록 시 필요한 작업(앱·시드 담당): `dialogueData.js` NPC_NAMES 이름표, npc_roster 또는 scene_only 로스터 행, 초상(안아트). 이 작업에서는 수정하지 않았다.
5. 전투 NPC 유닛이 필요한 코드: bonggun, sagong, jimkkun, mabu, bobyeong, baetsagong, gilzabi, sangin, yumokmin, jjogi(비전투), red_pen(4-4 적 유닛), 허준·살라딘(NPC 구간). 유닛 데이터가 없으면 해당 이벤트는 caption 대체(각 events.md 명시).

## 5. 변환 중 발견한 후속 이슈 (2~4막 변환 시 처리) — 2026-11-03 P6 변환에서 처리 완료

- (해소) act4의 `a4_ending`(timing=`ending`)·`a4_epilogue`(timing=`epilogue`): 현재 campaignFlow.js `playAfterStage`가 마지막 스테이지 승리 후 chapter_end·ending(파일 순서) -> epilogue 순으로 재생하도록 이미 지원한다. 정규화하지 않고 원본 값을 유지해 `database/data/campaign_main_a4_scenes.json`에 반영(stage_code=null, 파일 순서 a4_ending -> a4_epilogue 유지).
- (해소) act3의 `a3e5_post`/`a3e5_post2`(둘 다 after_clear, 같은 스테이지): `playAfterStage`가 `list.filter`로 같은 스테이지 post 장면을 파일 순서대로 모두 재생하므로 합치지 않고 순서(post -> post2)를 유지해 `campaign_main_a3_scenes.json`에 반영. 순서가 바뀌면 잔 다르크 합류가 정리 목록 입수보다 먼저 나온다.
- (해소) act2_events.md의 이벤트 소제목 `3-1. a2e1 … 3-5. a2e5`를 `2-1. a2e1 … 2-5. a2e5`로 정정.
- 1막은 timing 정규화 변경이 없었다. 2~4막도 stage_code(main_aN_eM -> ch10N_sM)와 chapter(102/103/104)만 바꾸고 timing·id·본문은 원본 그대로.
- (확인) heroes_candidates.csv: 147=허준, 248=잔 다르크, 322=살라딘 일치(2절 '확인 필요' 해소). 영웅 코드는 heroes.json의 `heo_jun`·`joan_of_arc`·`saladin`.

## 6. 영웅 지급(unlock_hero) -> 스테이지 join_hero 연결표

변환 데이터의 `unlock_hero`(csv 행 번호)는 원본 값을 유지하고 `unlock_hero_code`(heroes 코드)를 추가했다. 지급은 장면이 아니라 스테이지 `join_hero`(예: campaign_ch1_outline.json의 `{"csv_id","name_ko","condition"}` 형식)로 구현해야 한다. 팀장 결정: 가챠 풀에서 제외하지 않으며 중복은 조각 처리(결과창 '이미 보유' 표시는 campaignFlow.resultExtraLines가 처리).

| 스테이지 코드 | 영웅 코드 | csv_id | 이름 | 지급 장면(post 대사가 합류를 말하는 장면) | 비고 |
|---|---|---|---|---|---|
| ch102_s5 | heo_jun | 147 | 허준 | a2e5_post (허준 '나도 따라가겠소', 동행 명부 등재) | 2-5 승리 직후. 복선(2-1 약초 짐, 2-3 약초 쪽지)은 지급 전 연출 |
| ch103_s5 | joan_of_arc | 248 | 잔 다르크 | a3e5_post2 (잔 다르크 '같이 가요', 동행 명부 등재) | 같은 스테이지의 a3e5_post가 먼저 재생된 뒤 post2에서 합류. 4막 이후 동행 |
| ch104_s2 | saladin | 322 | 살라딘 | a4e2_post (살라딘 '함께 걷겠소') | 4-5가 아니라 4-2 승리 직후 합류. s5 아님에 주의 |

- 합류 조건은 세 건 모두 `condition: first_clear`(같은 스테이지 재도전 시 중복 지급 방지)를 권장하나 최종 결정은 박백엔·임밸런.
- 3막 이후 장면(a3_open, a4_open 등)에서 허준·잔 다르크·살라딘이 동행으로 대사하므로 합류가 지급 스테이지 승리 전에 이루어지지 않으면 대사 화자가 미보유 영웅일 수 있다. 화자 이름표는 dialogueData NPC_NAMES가 아니라 보유 영웅 캐시를 쓰므로(heroNameOf), 미보유 계정에서도 이름이 표시되는지 윤프론이 확인할 것.
