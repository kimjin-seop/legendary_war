# ch26 카이사르 루비콘 — 맵 코드 확정표 (맵디자이너 2026-11-08)

- 근거: docs/CAMPAIGN_CAESAR_RUBICON_20261108.md 2절·10절. 데이터 파일 `database/data/maps_ch26_caesar.json`(items[], maps_ch25_bachdang.json 과 같은 형식).
- 스테이지 파일 `stages_ch26_caesar.json`(임밸런)은 아래 `map` 코드를 그대로 참조한다. 좌표는 0-based [x,y], 크기 = 폭 x 높이.
- 좌표 이름(zone_refs / tile_tags)은 각 맵 `meta.zone_refs`, `meta.tile_tags` 에 있다. 스테이지 목표 칸은 이 이름의 칸 목록을 복사해 쓴다.

| 스테이지 | 맵 코드 | 이름 | 크기 | 목표 연계(맵 쪽 키) |
|---|---|---|---|---|
| ch26_s1 | su_ch26_s1_bogesai | 보게사이 평원 | 36x24 | 격파. 수레 방벽 = 통행 불가 k 칸(meta.zone_refs.wagon_laager), 제3열 증원 칸 reinforce_crassus |
| ch26_s2 | su_ch26_s2_rhine_bridge | 라인 다리 | 32x24 | 방어. hold_zone = bridgehead, 공병 칸 = npc_tiles, 턴 4 기병 = reeds_spawn_north/south |
| ch26_s3 | su_ch26_s3_alesia | 알레시아 이중 방벽 | 40x30 | 방어. protect_tiles 3구역 = wall_north / wall_west / wall_inner_east, 구원군 spawn = relief_spawn |
| ch26_s4 | su_ch26_s4_rome_escape | 로마 탈출 | 32x24 | 도달. in_zone = via_flaminia_exit, 순찰대 = patrol_spawn, 마차 move 경로 = cart_route |
| ch26_s5 | su_ch26_s5_rubicon | 루비콘 | 32x24 | 도달. in_zone = south_bank, unit_enter_tile tile_tag = rubicon_ford (+ rubicon_water), 방위대 퇴각 = ariminum_gate |
| ch26_s6 | su_ch26_s6_corfinium | 코르피니움 | 32x24 | 점령. cap_forum / cap_gate_north / cap_gate_south |
| ch26_s7 | su_ch26_s7_saturn_temple | 로마 입성·사투르누스 신전 | 32x24 | 점령. cap_temple_court / cap_aerarium_door / cap_forum_entry, protect = market |
| ch26_s8 | su_ch26_s8_pharsalus | 파르살루스 | 40x26 | 격파. 예비 대대 spawn = reserve_cohorts, 폼페이우스 퇴각 = pompey_camp |
| ch26_s9 | su_ch26_s9_munda | 문다 평원 | 36x24 | 격파. 적 중군 = enemy_center, 개울 = brook |
| ch26_s10 | su_ch26_s10_pompey_theatre | 3월 15일, 폼페이우스 극장 | 36x22 | 도달. in_zone = curia_steps, 카이사르 move 경로 = caesar_route, 안토니우스 붙들림 = curia_door_out |

- 맵 코드는 이 표로 확정한다(변경 시 맵디자이너가 이 표와 데이터 파일을 같이 고친다).
- 세부 좌표(배치·스폰·구역 칸)는 데이터 파일이 원천이다. 이 표에는 이름만 둔다.
