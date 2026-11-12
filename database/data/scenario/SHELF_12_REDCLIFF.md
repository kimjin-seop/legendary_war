# 서가 12: 적벽 (주유 key / 제갈량·유비·손권 동반)

작성: 송서사 / 2026-11-01 / 상태: 제안(proposal-0.1). SCENARIO_03 13-3 개요를 5스테이지로 확장한다. 맵은 임밸런이 설계하며 여기서는 지형 키워드만 제안한다. 대사·이벤트 본문은 `shelf_12_scenes.json`, NPC는 `shelf_12_npcs.json`. 수상 규칙은 `database/data/WATER_RULES_SPEC.md`를 따른다.

## 1. 서가 개요

| 항목 | 내용 |
|---|---|
| 시대 | 208년 겨울 장강(적벽)과 209년 후일담. 전투 장소는 학계에서 의견이 갈려 특정하지 않고 "장강 한 굽이"로 둔다 |
| 서가 열쇠 | 주유 책갈피(필수 편성, forced 출전 1명) |
| 동반 | 제갈량 / 유비 / 손권 중 최대 2명. 편성 시 only_if 대사 |
| 적측 | 조조(hero:cao_cao) 지휘 하에 형주 수군 편입 병력. 조조는 악으로 서술하지 않음 |
| NPC 영구합류 | 황개(npc_huang_gai) 1명. s5 클리어 시 지급 제안, 영웅 풀 승격 프로필은 별도 작업 |
| 번짐의 정체 | "정사의 쪽 위에 이야기책의 쪽이 덧쓰인" 서랍 섞임. 연의의 동남풍, 고육계, 주유-제갈량 라이벌 구도를 정사와 구별해 읽는 것이 서가의 주제 |
| 중립 점검 | 조조·유비·손권 선악 평가 없음. 병력 수치 미사용(80만, 5만, 3만 전부 금지). 사상 묘사 없음, 화공은 불길 연출과 퇴각 처리. 화용도 후퇴 중 질병·익사 서술은 다루지 않음. 연의 서술을 사실로 단정하지 않음 |
| 수상 시스템 | 전 스테이지 수상 중심. sea/reef/harbor/shallows 위주. 비수병은 sea/reef에서 배 탑승(공격 배율 감소), 수병은 수상에서 강함. 주유 병종은 수병 전제 |

## 2. 스테이지 구성 (임밸런 협의용)

| # | stage_id | 제목 | 시점 | 목표 유형 | 지형 키워드(제안) | 분류 |
|---|---|---|---|---|---|---|
| 1 | shelf12_s1 | 장강의 초전 | 208 겨울 | commander_defeat(선봉 수군장 퇴각 처리) | sea 본류, 중앙 reef 군집(엄폐), 남안 harbor, sand 모래톱 | 사실 기반 각색 |
| 2 | shelf12_s2 | 북안의 수채 | 208 겨울 | capture_points 2(모래톱, 암초) | sea, sand 2곳, reef 벽, 연환 선단 이동 제한 연출 | 사실 기반 각색 |
| 3 | shelf12_s3 | 항서를 띄운 밤 | 208 겨울 | capture_points 1(접촉점 도달) + 황개 부대 생존, 선택 1 | 야간 sea, 암초 사이 좁은 항로, 순풍 연출 | 사실 기반 각색 |
| 4 | shelf12_s4 | 불붙은 수채 | 208 겨울 | survive_turns 6 | 불길 구역(연출, 지형 변경 없음), reef 틈 대피처, 북안 harbor | 사실 기반 각색(verify 포함) |
| 5 | shelf12_s5 | 덧쓰인 쪽의 그림자 + 담판 컷신(후일담, 선택 2) | 허구 + 209 후일담 | commander_defeat(보스 2페이즈) | sea+void 혼합, 두 겹 글자 타일, 틈 지점 ink_seams | 허구 / 후일담은 사실 기반 각색(verify) |

난이도 곡선 제안: S1 수상 입문(엄폐) → S2 거점 점령 → S3 호위·시야 제한 → S4 생존(위기) → S5 보스. 수치 전부 TBD(임밸런).

## 3. 적 편성 가이드 (각 스테이지 4부대 이상)

| 스테이지 | 적 편성(코드, 병종 후보) | 부대 수 | 아군 NPC |
|---|---|---|---|
| S1 | npc_wei_vanguard_captain(naval), 궁병선 2, 보병선 1 | 4 | npc_cheng_pu |
| S2 | npc_wei_jing_marine_chief(naval), npc_wei_archer_captain(archer), 보병선 2, 궁병선 1 | 5 | npc_cheng_pu, npc_lu_su, npc_huang_gai(S2 종료 컷) |
| S3 | npc_wei_jing_marine_chief, npc_wei_chain_captain, npc_wei_archer_captain, 보병선 2 | 5 | npc_huang_gai(호위 대상, 지휘 불가) |
| S4 | npc_wei_chain_captain, npc_wei_archer_captain, npc_wei_rearguard_chief, hero:cao_cao(후방 고정), 보병선 2, 궁병선 1 + 증원 2 | 7 | npc_cheng_pu |
| S5 | npc_ink_overwrite(보스, mage) + 번진 글자 소형 유닛 3(sword) | 4 | npc_huang_gai(동행) |

수상 보너스 관점: 조조 측은 비수병이 배 탑승 상태라 공격 배율이 낮고, 형주 출신 지휘관만 수병 후보. 연환 상태(S2~S3)는 이동 제한 AI 패턴으로 연출. 수치는 임밸런.

## 4. 아군 합류·입장 조건

| 영웅 | 코드 | 조건 | 비고 |
|---|---|---|---|
| 주유 | zhou_yu | 서가 열쇠, 필수·강제 출전 | heroes.json은 mage, WATER_RULES_SPEC은 수병 채택. 병종 확정은 임밸런 |
| 제갈량 | zhuge_liang | 동반 후보 | 전투 직접 지휘 기록 없음(사자 역할). 동남풍은 사용하지 않음 |
| 유비 | liu_bei | 동반 후보 | 주유와 함께 조조 추격에 참가 |
| 손권 | sun_quan | 동반 후보 | 결정자 역할, 전장 직접 지휘 기록 없음 |
| 조조 | cao_cao | 적측 | 풀 등재 영웅이 적으로 등장(is_invented 대사) |
| 황개 | npc_huang_gai | s5 클리어 시 영구 합류 제안 | 화공 건의자. 풀 승격 프로필 별도 |

## 5. 선택 분기 (결말 불변)

1. 선택 1 (S3 시작 전): "거짓 항서를 먼저 띄운다 / 항로의 암초를 먼저 살핀다". 역사 결과(화공 성공) 동일. A는 황개 이동 버프, B는 항로 표시. 보상 record_fragment 동일, 수치 TBD.
2. 선택 2 (S5 후일담 컷신): "손을 맞잡은 이유를 먼저 적는다 / 맞잡은 뒤의 갈림길을 먼저 적는다". 역사 결과 동일, 주석 문구와 호감 대사만 다름.

## 6. 담판 컷신(S5 후일담) 구성

209년 장면: 유기 사망, 유비의 형주 장악, 노숙의 조언과 손권의 수용. 주유의 이듬해 사망은 시오리가 사실로만 짧게 언급하고 장면은 펼치지 않음. 연의의 "주유가 제갈량에게 분해 죽었다" 서술은 사용하지 않음. 주유 대사에 정사의 음악 일화("곡이 틀리면 돌아본다")를 가볍게 인용.

## 7. 근거 수준 분포 (shelf_12_scenes.json 기준)

- 장면 줄 evidence: confirmed 5(캡션 포함), accepted 11, verify 1, invented 대부분(창작 대사). 장면 줄 중 verify:true 플래그가 붙은 사실 줄 5.
- relation_proposals 4개: confirmed 1, accepted 3.
- 전투 이벤트 20개: confirmed 2, accepted 6, invented 12.
- NPC 9개(npcs.json): confirmed 1(황개), accepted 2(정보, 노숙), invented 6(조조 측 무명 지휘관 5 + 그림자 1).

## 8. 인연 데이터 제안 (hero_relations.json 수정은 하지 않음)

| 쌍 | type | 근거 수준 | 이유 |
|---|---|---|---|
| 주유-제갈량 | same_event | accepted | 적벽 연합이라는 같은 사건의 양측 대표. 연의 라이벌 구도는 정사 근거 없음 |
| 유비-손권 | ally | accepted | 208 연합, 209 형주 조정 |
| 주유-조조 | rival | accepted | 대치한 양측 총지휘관 |
| 주유-손권 | lord_vassal | confirmed | 기존 rel_0004와 중복 가능 |

## 9. 사람 확인(verify) 목록

1. 초전 후 조조군이 북안으로 물러났다는 서술의 사료 위치.
2. 정보의 직함(좌독 여부), 주유와의 지휘 분담 구조.
3. 노숙의 형주 대여 조언 시점·성격(학계 논의 있음), 209년 장면 구성.
4. 화공 때 바람의 세기·방향 서술의 원문(정사 오서·촉서 vs 주석 vs 연의). 이 초안은 "바람이 거셌다"까지만 사용.
5. 불길이 강가 진영까지 번졌다는 서술, 조조가 남은 배를 버렸다는 서술의 사료 위치.
6. 황개가 서신을 보낸 시점과 거짓 항복 서술, 화공선 수. 수치 미사용.
7. 주유 사망 시기·나이(210, 35~36세 설 병기). 시오리 대사는 "서른여섯 안팎".
8. 주유 병종(mage vs 수병) 최종 확정과 WATER_RULES_SPEC 4절의 수병 채택 3명 일치 여부(임밸런).
9. 제갈량의 시상 방문과 손권 설득의 상세(정사 촉서 vs 주석).
10. 기존 hero_relations.json 중복 여부(rel_0001, rel_0004 확인). 이번 열람에서 파일 내 검색으로는 해당 영웅 코드를 찾지 못했다.
11. SCENARIO_03 13-3과 복선 번호(F1-1, T4 씨앗) 일치 여부. 시오리의 "섞이면 찾을 때 곤란합니다" 감정 대사는 이 초안에 넣지 않고 문기획 확인을 기다림.
12. 문기획 PLAYTIME 기획서 원본 파일이 database/data에 없음. 의뢰 요약(서가당 5스테이지 s1~s5, 선택 2지선다, forced 1명, 동반 최대 2명, NPC 영구합류 1명)만 근거로 작성.

## 10. 출처

- https://en.wikipedia.org/wiki/Battle_of_Red_Cliffs (이번 열람)
- https://en.wikipedia.org/wiki/Zhou_Yu (이번 열람)
- https://en.wikipedia.org/wiki/Zhuge_Liang (이번 열람, 앞부분 100000자 범위)
- https://en.wikipedia.org/wiki/Huang_Gai (이번 열람)
- database/data/scenario/SCENARIO_03_CH5-10_AND_OPEN.md 13-3
- database/data/WATER_RULES_SPEC.md
- database/data/scenario/WRITING_RULES.md, shelf_11 3개 파일(형식 기준)
