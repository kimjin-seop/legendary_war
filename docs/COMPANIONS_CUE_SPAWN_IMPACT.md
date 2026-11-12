# 큐 소환 영웅 동반 일반병 - 영향표 (박백엔, 2026-11-03)

규칙: `Cues` 의 `spawn`(영웅)이 발동하면 소환 영웅 칸에서 가까운 빈 칸(인접 우선)에 영웅 병종(치유사·미지원 병종은 sword) 일반병을 붙인다. 진영 a(아군 NPC): `stage_companions.json` 의 `ally_by_hero` > `ally`(기본 `config game.companions.ally_target`=3), `ally_exclude_heroes`(수레·배·민간인 등)는 0. 진영 b(적): 스테이지 `enemy`(기본 `enemy_target`=3, `enemy: 0` 스테이지는 데이터에 병사를 명시했으므로 0 유지). 영웅당 최대 4(`companions.max`), 진영 생존 유닛 하드 상한(32) 초과 시 중단. 병사 `leader_id`=영웅(squad on)이라 기존 봇 leash 로 영웅을 따라간다. 플레이어 영웅·시작 시 `ally_npcs`·`enemy_squad` 편성은 불변.

아래 수치는 `stages_*.json` 의 cues 에서 계산한 **최대 증가량**이다(큐가 조건에 따라 발동하지 않으면 늘지 않는다; 칸 부족·상한이면 줄어든다). 임밸런 재측정 입력.

| 스테이지 | 아군 증가(영웅 x 병사) | 적 증가(영웅 x 병사) |
|---|---|---|
| ch11_s4 | 3 (npc_gang_min_cheomx3) | 0 (-) |
| ch12_s1 | 3 (guan_yux3) | 0 (-) |
| ch12_s3 | 3 (npc_huang_gaix3) | 0 (-) |
| ch13_s2 | 3 (npc_kim_heumsunx3) | 0 (-) |
| ch14_s4 | 3 (npc_eulji_mundeokx3) | 0 (-) |
| ch15_s3 | 3 (npc_masinissax3) | 0 (-) |
| ch15_s4 | 3 (npc_masinissax3) | 0 (-) |
| ch16_s2 | 3 (npc_dunoisx3) | 0 (-) |
| ch16_s3 | 3 (npc_gilles_de_raisx3) | 0 (-) |
| ch16_s5 | 3 (npc_jean_alenconx3) | 0 (-) |
| ch17_s3 | 3 (npc_hephaestionx3) | 0 (-) |
| ch21_s5 | 3 (npc_subutaix3) | 0 (-) |
| ch22_s5 | 3 (npc_humayunx3) | 0 (-) |
| ch24_s4 | 3 (npc_eudes_aquitainex3) | 0 (-) |

합계: 아군 +42, 적 +0 (대상 스테이지 14개).
