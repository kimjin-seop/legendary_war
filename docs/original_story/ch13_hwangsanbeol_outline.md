# ch13 황산벌 스테이지 아웃라인

- 작성: 송서사, 2026-11-03. 대사 본문: database/data/ch13_hwangsanbeol.json (장면 id 와 stage_code 는 이 문서와 동일).
- 기준: docs/original_story/preview_shelves_acceptance.md 0-1절(옴니버스), 3-3절, docs/CUTSCENE_SPEC.md 6~12절.
- 서가: ch13, 가칭 "황산벌". 시기 660년 6~7월. 지역 라벨은 당대 표기(신라, 백제, 탄현, 황산벌, 사비). 계백의 가족 결의와 관창의 최후는 장면에서 직접 그리지 않고 narrator 한 줄로만 넘긴다. 선덕여왕은 s3_post 에서 인물 대사 속 회상 한 줄로만 쓴다.

## 1. 핵심 영웅 카드와 주인공

- 핵심 영웅 카드(key): **김유신** (`kim_yusin`).
- 적 영웅: 계백 (`gyebaek`, s2 보스, cue 대사 한 줄).
- 조연 NPC: 김흠순, 김품일, 반굴, 관창, 김인문, 소정방 (신규 초상 6, 김품일·김인문 포함 시 모두 6 + 1~2).
- 주인공: 김유신 막하 전령 장교. 부대 사이 전언을 정확히 옮기고, 무엇을 옮기지 않을지 스스로 정한다.
- 장 질문(엔딩): 이긴 날 전령이 남긴 말은 무엇인가. 답은 s2_post 의 "전하지 않은 말", s3_post 의 "자리만 적은 일지 맨 뒤 칸"으로 갈무리한다.

## 2. 서고 장면과 서가 개입

| id | 위치 | 줄 수 | 시오리 | 비고 |
|---|---|---|---|---|
| ch13_open | 장 시작 | 4 | 3 | 입장 안내 |
| ch13_end | 장 종료 | 3 | 2 | 다음 책장 안내 |

서가 개입 0회. 시오리 총 5줄. 스테이지 pre/post/battle_cues 의 시오리는 0줄. `intervention_scene_ids` 는 빈 배열.

## 3. 기승전결 표

| 단계 | 장면 | 내용 |
|---|---|---|
| 기 | ch13_open | 서고 입구 |
| 기 | s1 pre/post | 탄현 협곡. 북쪽 길 정찰 판단, 김인문이 가져온 소정방 일정 |
| 승 | s2 pre | 세 번 밀린 군막. 흩어지는 전언, 반굴·관창 |
| 전 | s2 cue/post | 네 번의 교전. 이긴 밤에 전하지 않은 말 |
| 결 | s3 pre/post | 소정방과 약속 날짜. 일지가 문서가 됨. 사비 성루 |
| 결 | ch13_end | 서고 퇴장 |

## 4. 스테이지 카드 (주인공 시점)

### ch13_s1 탄현 행군
- 내가 하는 일: 나는 북쪽 능선 길을 살피고, 김인문을 데리고 협곡을 지나 당군 합류 지점으로 간다. 매복이 있는 능선에 신호를 올린다.
- 목표: win_mode "only". win_conditions: 김인문 NPC(`hero:npc_kim_inmun`)와 내가 합류 구역 in_zone. 패배: 선두 부대 전멸, 김인문 쓰러짐.
- 주인공 기여 지점: 능선 신호 타일에 닿으면 매복 소수가 드러나 사전 대응이 열린다(set_flag 후 enemy_squad hold_until_turn 해제).
- 적: 소수 보병·궁병 매복(능선). 보스 없음.

### ch13_s2 황산벌
- 내가 하는 일: 나는 교전마다 전언 지점에 닿아 옆 부대 증원을 부른다.
- 목표: win_mode "all". 계백(`gyebaek`) defeated. 패배: 김유신 쓰러짐.
- 주인공 기여 지점: 전언 지점 3곳에 순서대로 도달하면 각 단계 증원(spawn side a)이 합류한다. 도달하지 못하면 증원이 움직이지 않는다(flag 로 구현).
- 서브 목표: 관창·반굴 NPC 는 등장 연출만(유닛 아님) 또는 sub_objectives unit_survive 없이 cue 처리.
- 적: 세 언덕 진영(enemy_squad hold_until_turn 단계 해제), 보스 계백.

### ch13_s3 사비성
- 내가 하는 일: 나는 성문 신호 지점을 확보해 당군을 문 앞에 합류시킨다.
- 목표: win_mode "all". hold_zone 신호 지점 2라운드 + 성문 수비대 defeated. 패배: 소정방 NPC 쓰러짐.
- 주인공 기여 지점: 신호가 오르면 당군 NPC 증원이 합류(ally_npcs route).
- 적: 성문 수비대, 성벽 위 궁병.

## 5. 맵디자이너 전달용 요구서

| 스테이지 | 크기 제안 | 필수 요소 | 선택 요소 |
|---|---|---|---|
| s1 | 중형 | 좁은 협곡, 능선 신호 타일, 합류 구역 | 안개 |
| s2 | 대형 | 세 언덕, 언덕 사이 평지, 전언 지점 3, 군막 | 부러진 창대 장식 |
| s3 | 중형 | 강변, 성문, 성벽, 성문 신호 지점 | 연기 |

타일 태그 요청: s1 `signal_ridge`, `join_zone`. s2 `relay_point`, `hill`. s3 `gate_signal`, `gate`.

## 6. 인물 목록

| 코드 | 이름 | 비고 | 초상 |
|---|---|---|---|
| kim_yusin | 김유신 | key | 기존 |
| gyebaek | 계백 | 적 영웅 | 기존 |
| npc_kim_chunchu | 김춘추 | 언급만(이 장에서는 대사 없음) | 기존 가능 |
| npc_kim_heumsun, npc_banggul, npc_kim_pumil, npc_gwanchang, npc_kim_inmun, npc_so_jeongbang | 6명 | 신규 | 신규 필요 6 |

신규 초상 6명. 선덕여왕은 언급만.

## 7. 후속 요청

- 박백엔: ch13 시드, shelf_map_meta active 전환, roster·NPC_NAMES·dialogue sync FILES 반영. `@protagonist` in_zone, hold_until_turn 단계 해제, flag 기반 증원 확인.
- 임밸런: 수치, 계백 보스 곡선.
- 맵디자이너: 3장.
- 안아트: 초상 6.
- 정검수·강화면: 시오리 발화가 서고 2개 장면 외에 없는지.
